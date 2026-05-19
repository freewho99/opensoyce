/**
 * OpenSoyce Guard — Exceptions CRUD (Sprint+3 dashboard backend).
 *
 * Single Vercel function with HTTP-method dispatch (GET / POST / DELETE) so we
 * stay within the 12-function Hobby cap. Backed by the Supabase `exceptions`
 * table (see docs/supabase-setup.md).
 *
 * Routes:
 *   GET    /api/exceptions?owner=<o>&repo=<r>     — list exceptions for a repo
 *   POST   /api/exceptions                        — grant a new exception
 *   DELETE /api/exceptions?id=<uuid>              — soft-revoke an exception
 *   GET    /api/exceptions?action=whoami          — return { login } if signed in
 *   GET    /api/exceptions?action=my-repos        — repos the signed-in user can manage
 *   POST   /api/exceptions?action=auth-callback   — exchange OAuth code, mint cookie
 *   POST   /api/exceptions?action=logout          — clear the session cookie
 *   GET    /api/exceptions?action=watchlist-list     — Sprint+6: org-scoped package watchlist + latest verdicts
 *   GET    /api/exceptions?action=watchlist-changes  — Sprint+6: recent degradations across watched packages (org-scoped)
 *   POST   /api/exceptions?action=watchlist-add      — Sprint+6: add a package to an org's watchlist (requires owner_org)
 *   POST   /api/exceptions?action=watchlist-remove   — Sprint+6: remove a package from an org's watchlist
 *   GET    /api/exceptions?action=notifications-get  — Sprint+5: whether Slack is configured for (owner, repo); URL never returned
 *   POST   /api/exceptions?action=notifications-set  — Sprint+5: upsert Slack webhook URL (or null to disable)
 *
 * Auth: dashboard session token (osg_session cookie or Authorization: Bearer),
 * HMAC-signed with OPENSOYCE_DASHBOARD_SECRET. Minting happens in the
 * auth-callback branch below after a GitHub OAuth handshake.
 *
 * Permission: GET requires Guard to be installed on the repo (any permission
 * level — read suffices). POST/DELETE require write or admin on the repo.
 * The check goes through the GitHub App's installation token; if Guard is not
 * installed on the target repo we return NOT_FOUND.
 *
 * Soft-expiry: list returns expired AND revoked rows so the dashboard can
 * render them grayed out for audit context. The webhook ignores them at read
 * time via `revoked_at is null and expires_at > now()`.
 */

import crypto from 'node:crypto';
import { isValidGithubName } from '../src/shared/validateRepo.js';
import { generateAppJwt, getInstallationToken, githubFetch } from './_guard-app.js';
import { getSupabase } from './_supabase.js';

// ---------------------------------------------------------------------------
// Constants + validation
// ---------------------------------------------------------------------------

const ALLOWED_ECOSYSTEMS = new Set(['npm', 'pnpm', 'yarn', 'uv', 'poetry', 'mixed']);
const PACKAGE_NAME_RE = /^[@a-z0-9][a-z0-9\-_./]*$/i;
const PACKAGE_NAME_MIN = 1;
const PACKAGE_NAME_MAX = 214;
const REASON_MIN = 10;
const REASON_MAX = 2000;
const EXPIRES_MIN_DAYS = 1;
const EXPIRES_MAX_DAYS = 365;
const SESSION_COOKIE_NAME = 'osg_session';

// ---------------------------------------------------------------------------
// Supabase client lives in ./_supabase.js (shared with api/guard-webhook.js).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Installation-id cache (warm-instance lifetime)
//
// Maps "owner/repo" -> installation_id. Saves the App-JWT round-trip on every
// repeated request from the same warm function instance. Bounded to keep
// memory predictable; dies on cold start so a deleted-and-reinstalled App
// re-mints naturally.
// ---------------------------------------------------------------------------

const INSTALLATION_ID_CACHE = new Map();
const INSTALLATION_ID_CACHE_MAX = 200;

function cacheInstallationId(owner, repo, id) {
  const key = `${owner.toLowerCase()}/${repo.toLowerCase()}`;
  if (!INSTALLATION_ID_CACHE.has(key) && INSTALLATION_ID_CACHE.size >= INSTALLATION_ID_CACHE_MAX) {
    const oldest = INSTALLATION_ID_CACHE.keys().next().value;
    if (oldest !== undefined) INSTALLATION_ID_CACHE.delete(oldest);
  }
  INSTALLATION_ID_CACHE.delete(key);
  INSTALLATION_ID_CACHE.set(key, id);
}

function getCachedInstallationId(owner, repo) {
  return INSTALLATION_ID_CACHE.get(`${owner.toLowerCase()}/${repo.toLowerCase()}`);
}

// ---------------------------------------------------------------------------
// HMAC session token (mirrors src/shared/claimTokens.js scheme)
//   Format: <base64url(payloadJSON)>.<hex(hmacSha256(payloadJSON, key))>
//   Payload: { login: string, exp: number (unix seconds) }
// ---------------------------------------------------------------------------

function base64urlEncode(bufOrString) {
  const buf = Buffer.isBuffer(bufOrString) ? bufOrString : Buffer.from(bufOrString, 'utf8');
  return buf.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64urlDecode(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64, 'base64');
}

/**
 * Mint an osg_session token using the same scheme verifySessionToken accepts:
 *   <base64url(payloadJSON)>.<hex(hmacSha256(payloadJSON, key))>
 * Payload: { login, orgs, exp (unix seconds) }.
 *
 * Sprint+6: `orgs` is the list of GitHub org logins the user can operate as,
 * with the user's own login prepended (an individual user behaves as a
 * one-person org owning their <login>/* repos). Old session tokens predating
 * this change have no `orgs` field and verifySessionToken treats them as [].
 */
export function signSessionToken({ login, orgs = [], ttlSec = 28800 }, key) {
  if (!key || typeof key !== 'string') throw new Error('HMAC_KEY_MISSING');
  if (!login || typeof login !== 'string') throw new Error('LOGIN_MISSING');
  if (!Array.isArray(orgs)) throw new Error('ORGS_MUST_BE_ARRAY');
  const now = Math.floor(Date.now() / 1000);
  const payload = { login, orgs, exp: now + ttlSec };
  const json = JSON.stringify(payload);
  const enc = base64urlEncode(json);
  const sig = crypto.createHmac('sha256', key).update(json).digest('hex');
  return `${enc}.${sig}`;
}

function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    return false;
  }
}

export function verifySessionToken(token, key, opts = {}) {
  if (!key || typeof key !== 'string') return null;
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const idx = token.indexOf('.');
  const enc = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  if (!enc || !sig) return null;
  let json;
  try {
    json = base64urlDecode(enc).toString('utf8');
  } catch {
    return null;
  }
  const expected = crypto.createHmac('sha256', key).update(json).digest('hex');
  if (!timingSafeEqualHex(sig, expected)) return null;
  let payload;
  try {
    payload = JSON.parse(json);
  } catch {
    return null;
  }
  if (!payload || typeof payload.login !== 'string' || typeof payload.exp !== 'number') return null;
  const now = typeof opts.now === 'number' ? opts.now : Math.floor(Date.now() / 1000);
  if (now >= payload.exp) return null;
  // Sprint+6: orgs is the org-scope list. Old tokens (pre-Sprint+6) have no
  // orgs field — decode them as orgs:[] so all watchlist endpoints return
  // empty results until the user re-auths. Each entry must be a string;
  // anything malformed is silently dropped (defensive: a tampered payload
  // would already have failed the HMAC check, but we still don't trust it).
  let orgs = [];
  if (Array.isArray(payload.orgs)) {
    orgs = payload.orgs.filter((o) => typeof o === 'string' && o.length > 0);
  }
  return { login: payload.login, orgs };
}

function parseCookieHeader(raw) {
  const out = {};
  if (typeof raw !== 'string' || !raw) return out;
  for (const part of raw.split(/;\s*/)) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function verifyDashboardSession(req) {
  const secret = process.env.OPENSOYCE_DASHBOARD_SECRET;
  if (!secret) {
    console.error('exceptions: OPENSOYCE_DASHBOARD_SECRET unset — all requests will 401');
    return null;
  }
  // Prefer cookie; fall back to Authorization: Bearer for non-browser clients.
  const cookies = parseCookieHeader(req.headers && req.headers.cookie);
  let token = cookies[SESSION_COOKIE_NAME];
  if (!token) {
    const auth = req.headers && (req.headers.authorization || req.headers.Authorization);
    if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
      token = auth.slice(7).trim();
    }
  }
  if (!token) return null;
  return verifySessionToken(token, secret);
}

// ---------------------------------------------------------------------------
// GitHub permission check
// ---------------------------------------------------------------------------

/**
 * Look up the installation_id for (owner, repo) by hitting the App-level
 * `/repos/{owner}/{repo}/installation` endpoint with an App JWT.
 *
 * @returns {Promise<number|null>}  installation_id, or null if Guard isn't
 *   installed on the repo (404). Throws on other failures.
 */
export async function findInstallationIdForRepo(owner, repo) {
  const cached = getCachedInstallationId(owner, repo);
  if (typeof cached === 'number') return cached;
  const jwt = generateAppJwt();
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/installation`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'opensoyce-exceptions',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => '(no body)');
    throw new Error(`INSTALLATION_LOOKUP_FAILED status=${res.status} body=${body.slice(0, 200)}`);
  }
  const data = await res.json().catch(() => null);
  if (!data || typeof data.id !== 'number') throw new Error('INSTALLATION_ID_MISSING');
  cacheInstallationId(owner, repo, data.id);
  return data.id;
}

/**
 * Resolve the user's permission on (owner, repo) via the App's installation
 * token. Returns one of 'admin' | 'write' | 'read' | 'none'.
 *
 * 'none' covers both "Guard isn't installed on this repo" (404 on the
 * installation lookup) and "GitHub says the user has no access".
 */
export async function getRepoPermissionForUser(owner, repo, login) {
  let installationId;
  try {
    installationId = await findInstallationIdForRepo(owner, repo);
  } catch (err) {
    console.error('exceptions: installation lookup failed', err && err.message);
    return 'none';
  }
  if (installationId == null) return 'none';

  let installationToken;
  try {
    const tokenResp = await getInstallationToken(installationId);
    installationToken = tokenResp && tokenResp.token;
  } catch (err) {
    console.error('exceptions: installation token mint failed', err && err.message);
    return 'none';
  }
  if (!installationToken) return 'none';

  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/collaborators/${encodeURIComponent(login)}/permission`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${installationToken}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'opensoyce-exceptions',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (res.status === 404) return 'none';
  if (!res.ok) {
    console.error('exceptions: collaborator permission check failed', res.status);
    return 'none';
  }
  const data = await res.json().catch(() => null);
  const perm = data && typeof data.permission === 'string' ? data.permission : 'none';
  if (perm === 'admin' || perm === 'write' || perm === 'read' || perm === 'none') return perm;
  // Treat unknown shapes conservatively.
  return 'none';
}

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

function getQuery(req) {
  if (req.query && typeof req.query === 'object') return req.query;
  try {
    const url = new URL(req.url || '', 'http://x');
    return Object.fromEntries(url.searchParams.entries());
  } catch {
    return {};
  }
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text.trim() ? JSON.parse(text) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function err(res, status, code, message) {
  return sendJson(res, status, { error: code, message });
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleList(req, res, session) {
  const q = getQuery(req);
  const owner = typeof q.owner === 'string' ? q.owner : '';
  const repo = typeof q.repo === 'string' ? q.repo : '';
  if (!owner || !isValidGithubName(owner)) return err(res, 400, 'BAD_REQUEST', 'owner is missing or invalid');
  if (!repo || !isValidGithubName(repo)) return err(res, 400, 'BAD_REQUEST', 'repo is missing or invalid');

  // GET requires at minimum 'read' — i.e. the user must have any GitHub
  // permission on the repo AND Guard must be installed there.
  const perm = await getRepoPermissionForUser(owner, repo, session.login);
  if (perm === 'none') return err(res, 404, 'NOT_FOUND', 'Guard is not installed on this repo, or you have no access');

  let sb;
  try {
    sb = getSupabase();
  } catch (e) {
    console.error('exceptions GET: supabase init failed', e && e.message);
    return err(res, 500, 'DB_ERROR', 'database not configured');
  }

  const { data, error } = await sb
    .from('exceptions')
    .select('id, owner, repo, package_name, ecosystem, reason, expires_at, granted_by, created_at, revoked_at')
    .eq('owner', owner)
    .eq('repo', repo)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('exceptions GET: supabase query failed', error.message);
    return err(res, 500, 'DB_ERROR', 'database query failed');
  }
  return sendJson(res, 200, { exceptions: data || [] });
}

function validatePostBody(body) {
  const owner = body && typeof body.owner === 'string' ? body.owner.trim() : '';
  const repo = body && typeof body.repo === 'string' ? body.repo.trim() : '';
  const packageName = body && typeof body.package_name === 'string' ? body.package_name.trim() : '';
  const ecosystem = body && typeof body.ecosystem === 'string' ? body.ecosystem.trim() : '';
  const reason = body && typeof body.reason === 'string' ? body.reason.trim() : '';
  const expiresInDays = body && body.expires_in_days;

  if (!owner || !isValidGithubName(owner)) return { error: 'owner is missing or not a valid GitHub identifier' };
  if (!repo || !isValidGithubName(repo)) return { error: 'repo is missing or not a valid GitHub identifier' };
  if (packageName.length < PACKAGE_NAME_MIN || packageName.length > PACKAGE_NAME_MAX) {
    return { error: `package_name must be ${PACKAGE_NAME_MIN}–${PACKAGE_NAME_MAX} chars` };
  }
  if (!PACKAGE_NAME_RE.test(packageName)) return { error: 'package_name has invalid characters' };
  if (!ALLOWED_ECOSYSTEMS.has(ecosystem)) {
    return { error: `ecosystem must be one of ${[...ALLOWED_ECOSYSTEMS].join(', ')}` };
  }
  if (reason.length < REASON_MIN || reason.length > REASON_MAX) {
    return { error: `reason must be ${REASON_MIN}–${REASON_MAX} chars after trim` };
  }
  if (!Number.isInteger(expiresInDays) || expiresInDays < EXPIRES_MIN_DAYS || expiresInDays > EXPIRES_MAX_DAYS) {
    return { error: `expires_in_days must be an integer ${EXPIRES_MIN_DAYS}–${EXPIRES_MAX_DAYS}` };
  }
  return { value: { owner, repo, packageName, ecosystem, reason, expiresInDays } };
}

async function handleGrant(req, res, session) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return err(res, 400, 'BAD_REQUEST', 'invalid JSON body');
  }
  const validated = validatePostBody(body);
  if (validated.error) return err(res, 400, 'BAD_REQUEST', validated.error);
  const { owner, repo, packageName, ecosystem, reason, expiresInDays } = validated.value;

  const perm = await getRepoPermissionForUser(owner, repo, session.login);
  if (perm === 'none') return err(res, 404, 'NOT_FOUND', 'Guard is not installed on this repo, or you have no access');
  if (perm !== 'write' && perm !== 'admin') return err(res, 403, 'FORBIDDEN', 'you need write or admin permission on this repo');

  const expiresAt = new Date(Date.now() + expiresInDays * 86400 * 1000).toISOString();

  let sb;
  try {
    sb = getSupabase();
  } catch (e) {
    console.error('exceptions POST: supabase init failed', e && e.message);
    return err(res, 500, 'DB_ERROR', 'database not configured');
  }

  const { data, error } = await sb
    .from('exceptions')
    .insert({
      owner,
      repo,
      package_name: packageName,
      ecosystem,
      reason,
      expires_at: expiresAt,
      granted_by: session.login,
    })
    .select('id, owner, repo, package_name, ecosystem, reason, expires_at, granted_by, created_at, revoked_at')
    .single();

  if (error) {
    console.error('exceptions POST: supabase insert failed', error.message);
    return err(res, 500, 'DB_ERROR', 'database write failed');
  }
  return sendJson(res, 201, { exception: data });
}

async function handleRevoke(req, res, session) {
  const q = getQuery(req);
  const id = typeof q.id === 'string' ? q.id.trim() : '';
  if (!id) return err(res, 400, 'BAD_REQUEST', 'id query parameter is required');
  // UUID v4ish sanity check — Supabase will also reject malformed values, but
  // bailing here saves a round-trip and avoids leaking the DB error.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return err(res, 400, 'BAD_REQUEST', 'id is not a valid UUID');
  }

  let sb;
  try {
    sb = getSupabase();
  } catch (e) {
    console.error('exceptions DELETE: supabase init failed', e && e.message);
    return err(res, 500, 'DB_ERROR', 'database not configured');
  }

  // First fetch the row so we can verify the user has write on its repo.
  const { data: row, error: selErr } = await sb
    .from('exceptions')
    .select('id, owner, repo, revoked_at')
    .eq('id', id)
    .maybeSingle();

  if (selErr) {
    console.error('exceptions DELETE: supabase select failed', selErr.message);
    return err(res, 500, 'DB_ERROR', 'database query failed');
  }
  if (!row) return err(res, 404, 'NOT_FOUND', 'exception not found');
  if (row.revoked_at) return err(res, 404, 'NOT_FOUND', 'exception already revoked');

  const perm = await getRepoPermissionForUser(row.owner, row.repo, session.login);
  if (perm === 'none') return err(res, 404, 'NOT_FOUND', 'Guard is not installed on this repo, or you have no access');
  if (perm !== 'write' && perm !== 'admin') return err(res, 403, 'FORBIDDEN', 'you need write or admin permission on this repo');

  // Race-safe: the WHERE clause requires revoked_at to still be null.
  const { data: updated, error: upErr } = await sb
    .from('exceptions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .is('revoked_at', null)
    .select('id')
    .maybeSingle();

  if (upErr) {
    console.error('exceptions DELETE: supabase update failed', upErr.message);
    return err(res, 500, 'DB_ERROR', 'database write failed');
  }
  if (!updated) return err(res, 404, 'NOT_FOUND', 'exception already revoked');
  return sendJson(res, 200, { ok: true, id });
}

// ---------------------------------------------------------------------------
// Session / OAuth handlers (whoami, auth-callback, logout)
// ---------------------------------------------------------------------------

function setSessionCookie(res, token, maxAgeSec) {
  // SameSite=Lax so the cookie rides along when GitHub 302-redirects back to
  // /dashboard. HttpOnly so frontend JS can't read it (matters because the
  // token is a verification credential). Secure because production is HTTPS.
  const cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
  res.setHeader('Set-Cookie', cookie);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

async function handleWhoami(req, res, session) {
  return sendJson(res, 200, { login: session.login });
}

async function handleLogout(req, res) {
  clearSessionCookie(res);
  return sendJson(res, 200, { ok: true });
}

// ---------------------------------------------------------------------------
// Sprint+6: fetch the user's GitHub org memberships during sign-in.
//
// Walks /user/orgs pagination (cap 3 pages = 90 orgs — typical users have <30).
// Total budget 5s, each page 2s via AbortController. On ANY failure (4xx, 5xx,
// network, timeout) we log + return [] so sign-in still completes; the user
// will see only their personal namespace until they re-auth successfully.
//
// Note: /user/orgs returns only orgs the user has consented to expose. Without
// the read:org scope it returns public orgs only. The user's own login is NOT
// in this response — handleAuthCallback prepends it separately.
// ---------------------------------------------------------------------------
const USER_ORGS_TOTAL_BUDGET_MS = 5000;
const USER_ORGS_PER_PAGE_BUDGET_MS = 2000;
const USER_ORGS_PAGE_CAP = 3;
const USER_ORGS_PER_PAGE = 30;

async function fetchUserOrgs(accessToken) {
  if (typeof accessToken !== 'string' || !accessToken) return [];
  const start = Date.now();
  const out = [];
  for (let page = 1; page <= USER_ORGS_PAGE_CAP; page += 1) {
    const elapsed = Date.now() - start;
    if (elapsed >= USER_ORGS_TOTAL_BUDGET_MS) {
      console.warn('exceptions fetchUserOrgs: total budget exhausted before page', page);
      break;
    }
    const remainingTotal = USER_ORGS_TOTAL_BUDGET_MS - elapsed;
    const perPageBudget = Math.min(USER_ORGS_PER_PAGE_BUDGET_MS, remainingTotal);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), perPageBudget);
    let body;
    try {
      const resp = await fetch(`https://api.github.com/user/orgs?per_page=${USER_ORGS_PER_PAGE}&page=${page}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'opensoyce-exceptions',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: ctrl.signal,
      });
      if (!resp.ok) {
        console.warn('exceptions fetchUserOrgs: /user/orgs status', resp.status, 'page', page);
        return [];
      }
      body = await resp.json().catch(() => null);
    } catch (e) {
      console.warn('exceptions fetchUserOrgs: page', page, 'threw', e && e.message);
      return [];
    } finally {
      clearTimeout(timer);
    }
    if (!Array.isArray(body)) break;
    for (const o of body) {
      if (o && typeof o.login === 'string' && o.login.length > 0) out.push(o.login);
    }
    // Short-circuit when GitHub returns less than a full page (no more pages).
    if (body.length < USER_ORGS_PER_PAGE) break;
  }
  return out;
}

async function handleAuthCallback(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return err(res, 400, 'BAD_REQUEST', 'invalid JSON body');
  }
  const code = body && typeof body.code === 'string' ? body.code.trim() : '';
  const state = body && typeof body.state === 'string' ? body.state.trim() : '';
  if (!code || code.length > 200) return err(res, 400, 'BAD_REQUEST', 'code must be a non-empty string under 200 chars');
  if (!state || state.length > 200) return err(res, 400, 'BAD_REQUEST', 'state must be a non-empty string under 200 chars');

  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error('exceptions auth-callback: GITHUB_OAUTH_CLIENT_ID / GITHUB_OAUTH_CLIENT_SECRET missing');
    return err(res, 500, 'OAUTH_NOT_CONFIGURED', 'OpenSoyce is missing its GitHub OAuth credentials');
  }
  const dashboardSecret = process.env.OPENSOYCE_DASHBOARD_SECRET;
  if (!dashboardSecret) {
    console.error('exceptions auth-callback: OPENSOYCE_DASHBOARD_SECRET missing');
    return err(res, 500, 'DASHBOARD_NOT_CONFIGURED', 'dashboard sessions are not configured on the server');
  }

  // Note: state is generated client-side as a UUID, sessionStorage-bound, and
  // round-tripped through GitHub's state param. The frontend verifies it
  // matches what it stored before sending us this callback. This is weaker
  // than server-signed CSRF, but the OAuth code is single-use and bound to
  // redirect_uri so cross-site forgery has limited blast radius.
  let exch;
  try {
    const resp = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'opensoyce-exceptions',
      },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });
    if (!resp.ok) {
      console.error('exceptions auth-callback: token exchange status', resp.status);
      return err(res, 502, 'OAUTH_EXCHANGE_FAILED', 'GitHub rejected the OAuth code');
    }
    exch = await resp.json();
  } catch (e) {
    console.error('exceptions auth-callback: token exchange threw', e && e.message);
    return err(res, 502, 'OAUTH_EXCHANGE_FAILED', 'could not reach GitHub to exchange the OAuth code');
  }
  if (!exch || typeof exch.access_token !== 'string' || !exch.access_token) {
    const detail = exch && (exch.error_description || exch.error) ? String(exch.error_description || exch.error) : 'unknown';
    return err(res, 400, 'OAUTH_REJECTED', `GitHub rejected the authorization code: ${detail}`);
  }
  const accessToken = exch.access_token;

  let login;
  try {
    const userResp = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'opensoyce-exceptions',
      },
    });
    if (!userResp.ok) {
      console.error('exceptions auth-callback: /user status', userResp.status);
      return err(res, 502, 'USER_LOOKUP_FAILED', 'could not read your GitHub identity');
    }
    const userBody = await userResp.json().catch(() => null);
    if (!userBody || typeof userBody.login !== 'string') {
      return err(res, 502, 'USER_LOOKUP_FAILED', 'GitHub user payload missing login');
    }
    login = userBody.login;
  } catch (e) {
    console.error('exceptions auth-callback: /user threw', e && e.message);
    return err(res, 502, 'USER_LOOKUP_FAILED', 'could not reach GitHub to read your identity');
  }

  // Sprint+6: pull the user's GitHub org memberships and bake them into the
  // session token. The user's own login is prepended so an individual GitHub
  // user behaves as a one-person org — matches the migration's backfill of
  // owner_org = user_login. fetchUserOrgs swallows all errors and returns [],
  // so a /user/orgs failure does not block sign-in.
  const rawOrgs = await fetchUserOrgs(accessToken);
  const orgs = [login, ...rawOrgs.filter((o) => o !== login)];

  const token = signSessionToken({ login, orgs, ttlSec: 28800 }, dashboardSecret);
  setSessionCookie(res, token, 28800);
  return sendJson(res, 200, { ok: true, login, orgs });
}

// ---------------------------------------------------------------------------
// my-repos: list installations where (a) Guard is installed and (b) the
// signed-in user has write/admin access. Used by the dashboard repo picker.
// Per warm-instance cache keyed by login + lazy TTL.
// ---------------------------------------------------------------------------

const MY_REPOS_CACHE = new Map();
const MY_REPOS_CACHE_TTL_MS = 60_000;
const MY_REPOS_CACHE_MAX = 100;

function cacheMyRepos(login, repos) {
  if (!MY_REPOS_CACHE.has(login) && MY_REPOS_CACHE.size >= MY_REPOS_CACHE_MAX) {
    const oldest = MY_REPOS_CACHE.keys().next().value;
    if (oldest !== undefined) MY_REPOS_CACHE.delete(oldest);
  }
  MY_REPOS_CACHE.delete(login);
  MY_REPOS_CACHE.set(login, { repos, at: Date.now() });
}

function getCachedMyRepos(login) {
  const entry = MY_REPOS_CACHE.get(login);
  if (!entry) return null;
  if (Date.now() - entry.at > MY_REPOS_CACHE_TTL_MS) {
    MY_REPOS_CACHE.delete(login);
    return null;
  }
  return entry.repos;
}

async function handleMyRepos(req, res, session) {
  const cached = getCachedMyRepos(session.login);
  if (cached) return sendJson(res, 200, { repos: cached, cached: true });

  let jwt;
  try {
    jwt = generateAppJwt();
  } catch (e) {
    console.error('exceptions my-repos: app jwt failed', e && e.message);
    return err(res, 500, 'APP_NOT_CONFIGURED', 'GitHub App credentials are missing');
  }

  // List installations the App is on.
  let installations;
  try {
    const resp = await fetch('https://api.github.com/app/installations?per_page=100', {
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'opensoyce-exceptions',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!resp.ok) {
      console.error('exceptions my-repos: installations status', resp.status);
      return err(res, 502, 'INSTALLATIONS_LOOKUP_FAILED', 'could not list App installations');
    }
    installations = await resp.json();
  } catch (e) {
    console.error('exceptions my-repos: installations threw', e && e.message);
    return err(res, 502, 'INSTALLATIONS_LOOKUP_FAILED', 'GitHub unreachable');
  }
  if (!Array.isArray(installations)) installations = [];

  const repos = [];
  for (const inst of installations) {
    if (!inst || typeof inst.id !== 'number') continue;
    let tokenResp;
    try {
      tokenResp = await getInstallationToken(inst.id);
    } catch (e) {
      console.error('exceptions my-repos: installation token failed', inst.id, e && e.message);
      continue;
    }
    const instToken = tokenResp && tokenResp.token;
    if (!instToken) continue;

    // List repos for this installation. Single page (100) is enough for MVE;
    // pagination is a follow-up if anyone installs on >100 repos.
    let repoBody;
    try {
      const repoResp = await githubFetch(instToken, '/installation/repositories?per_page=100');
      if (!repoResp.ok) {
        console.error('exceptions my-repos: installation/repositories status', repoResp.status);
        continue;
      }
      repoBody = await repoResp.json();
    } catch (e) {
      console.error('exceptions my-repos: installation/repositories threw', e && e.message);
      continue;
    }
    const list = (repoBody && Array.isArray(repoBody.repositories)) ? repoBody.repositories : [];
    for (const r of list) {
      if (!r || !r.owner || typeof r.owner.login !== 'string' || typeof r.name !== 'string') continue;
      const owner = r.owner.login;
      const name = r.name;
      // Filter by user's permission: write or admin.
      let perm;
      try {
        const pResp = await githubFetch(instToken, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/collaborators/${encodeURIComponent(session.login)}/permission`);
        if (!pResp.ok) continue;
        const pBody = await pResp.json().catch(() => null);
        perm = pBody && typeof pBody.permission === 'string' ? pBody.permission : 'none';
      } catch (e) {
        console.error('exceptions my-repos: perm check threw', e && e.message);
        continue;
      }
      if (perm === 'admin' || perm === 'write') {
        repos.push({ owner, repo: name });
      }
    }
  }
  // Deduplicate (paranoia — same repo shouldn't show up in two installations).
  const seen = new Set();
  const deduped = [];
  for (const r of repos) {
    const k = `${r.owner.toLowerCase()}/${r.repo.toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(r);
  }
  deduped.sort((a, b) => `${a.owner}/${a.repo}`.localeCompare(`${b.owner}/${b.repo}`));
  cacheMyRepos(session.login, deduped);
  return sendJson(res, 200, { repos: deduped });
}

// ---------------------------------------------------------------------------
// Sprint+4: Watchlist (watched_packages + verdict_snapshots)
//
// Personal package watchlist scoped to the signed-in user. Reads
// verdict_snapshots written by api/guard-webhook.js (Sprint+4 PR 1) to surface
// the latest verdict per repo and detect recent degradations.
// ---------------------------------------------------------------------------

// Severity ranking for degradation detection. Higher rank == worse verdict.
// Mirrors the verdict ladder USE READY < STABLE < FORKABLE < WATCHLIST <
// RISKY < GRAVEYARD. A degradation is a strictly positive rank delta.
const WATCHLIST_LABEL_RANK = {
  'USE READY': 0,
  'STABLE': 1,
  'FORKABLE': 2,
  'WATCHLIST': 3,
  'RISKY': 4,
  'GRAVEYARD': 5,
};

const WATCHLIST_CHANGES_WINDOW_DAYS = 30;
const WATCHLIST_SNAPSHOT_FETCH_LIMIT = 200;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handleWatchlistList(req, res, session) {
  let sb;
  try {
    sb = getSupabase();
  } catch (e) {
    console.error('exceptions watchlist-list: supabase init failed', e && e.message);
    return err(res, 500, 'DB_ERROR', 'database not configured');
  }

  // Sprint+6: scope watchlist by org membership instead of user_login. Empty
  // orgs (old session token) returns no rows by construction — .in() with an
  // empty list yields zero matches.
  const orgs = Array.isArray(session.orgs) ? session.orgs : [];
  if (orgs.length === 0) return sendJson(res, 200, { watched: [] });

  const { data: watched, error: wErr } = await sb
    .from('watched_packages')
    .select('id, owner_org, package_name, ecosystem, created_at')
    .in('owner_org', orgs)
    .order('owner_org', { ascending: true })
    .order('created_at', { ascending: false });

  if (wErr) {
    console.error('exceptions watchlist-list: watched_packages query failed', wErr.message);
    return err(res, 500, 'DB_ERROR', 'database query failed');
  }
  const rows = Array.isArray(watched) ? watched : [];
  if (rows.length === 0) return sendJson(res, 200, { watched: [] });

  // For each watched package, fetch recent snapshots ordered by scanned_at desc
  // and de-dupe by (owner, repo) keeping the first occurrence (== most recent).
  // Sprint+6: snapshots are additionally filtered to owner = w.owner_org so we
  // only surface verdicts on repos owned by the same org as the watchlist row.
  // acme-corp's watchlist for react never bleeds into freewho99/* repos.
  const out = [];
  for (const w of rows) {
    const { data: snaps, error: sErr } = await sb
      .from('verdict_snapshots')
      .select('owner, repo, label, scanned_at')
      .eq('package_name', w.package_name)
      .eq('ecosystem', w.ecosystem)
      .eq('owner', w.owner_org)
      .order('scanned_at', { ascending: false })
      .limit(WATCHLIST_SNAPSHOT_FETCH_LIMIT);

    if (sErr) {
      console.error('exceptions watchlist-list: verdict_snapshots query failed', sErr.message);
      return err(res, 500, 'DB_ERROR', 'database query failed');
    }

    const seen = new Set();
    const verdicts = [];
    for (const s of (Array.isArray(snaps) ? snaps : [])) {
      if (!s || typeof s.owner !== 'string' || typeof s.repo !== 'string') continue;
      const key = `${s.owner.toLowerCase()}/${s.repo.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      verdicts.push({ owner: s.owner, repo: s.repo, label: s.label, scanned_at: s.scanned_at });
    }

    out.push({
      id: w.id,
      owner_org: w.owner_org,
      package_name: w.package_name,
      ecosystem: w.ecosystem,
      created_at: w.created_at,
      verdicts,
    });
  }

  return sendJson(res, 200, { watched: out });
}

async function handleWatchlistChanges(req, res, session) {
  let sb;
  try {
    sb = getSupabase();
  } catch (e) {
    console.error('exceptions watchlist-changes: supabase init failed', e && e.message);
    return err(res, 500, 'DB_ERROR', 'database not configured');
  }

  // Sprint+6: org-scoped. Empty orgs (old session token) returns no changes.
  const orgs = Array.isArray(session.orgs) ? session.orgs : [];
  if (orgs.length === 0) return sendJson(res, 200, { changes: [] });

  const { data: watched, error: wErr } = await sb
    .from('watched_packages')
    .select('owner_org, package_name, ecosystem')
    .in('owner_org', orgs);

  if (wErr) {
    console.error('exceptions watchlist-changes: watched_packages query failed', wErr.message);
    return err(res, 500, 'DB_ERROR', 'database query failed');
  }
  const rows = Array.isArray(watched) ? watched : [];
  if (rows.length === 0) return sendJson(res, 200, { changes: [] });

  const sinceIso = new Date(Date.now() - WATCHLIST_CHANGES_WINDOW_DAYS * 86400 * 1000).toISOString();
  const changes = [];

  for (const w of rows) {
    // Sprint+6: filter snapshots to owner = w.owner_org so degradations only
    // surface on in-org repos. acme-corp's watchlist for react never reports
    // degradations on freewho99/foo.
    const { data: snaps, error: sErr } = await sb
      .from('verdict_snapshots')
      .select('owner, repo, label, scanned_at')
      .eq('package_name', w.package_name)
      .eq('ecosystem', w.ecosystem)
      .eq('owner', w.owner_org)
      .gte('scanned_at', sinceIso)
      .order('scanned_at', { ascending: false })
      .limit(WATCHLIST_SNAPSHOT_FETCH_LIMIT);

    if (sErr) {
      console.error('exceptions watchlist-changes: verdict_snapshots query failed', sErr.message);
      return err(res, 500, 'DB_ERROR', 'database query failed');
    }

    // Group by (owner, repo). Snapshots are already ordered scanned_at desc,
    // so the first two entries per group are latest and prior.
    const byRepo = new Map();
    for (const s of (Array.isArray(snaps) ? snaps : [])) {
      if (!s || typeof s.owner !== 'string' || typeof s.repo !== 'string') continue;
      const key = `${s.owner}/${s.repo}`;
      let bucket = byRepo.get(key);
      if (!bucket) {
        bucket = [];
        byRepo.set(key, bucket);
      }
      if (bucket.length < 2) bucket.push(s);
    }

    for (const bucket of byRepo.values()) {
      if (bucket.length < 2) continue;
      const [latest, prior] = bucket;
      const latestRank = WATCHLIST_LABEL_RANK[latest.label];
      const priorRank = WATCHLIST_LABEL_RANK[prior.label];
      if (typeof latestRank !== 'number' || typeof priorRank !== 'number') continue;
      if (latestRank > priorRank) {
        changes.push({
          owner_org: w.owner_org,
          package_name: w.package_name,
          ecosystem: w.ecosystem,
          owner: latest.owner,
          repo: latest.repo,
          prev_label: prior.label,
          new_label: latest.label,
          scanned_at: latest.scanned_at,
        });
      }
    }
  }

  changes.sort((a, b) => (a.scanned_at < b.scanned_at ? 1 : a.scanned_at > b.scanned_at ? -1 : 0));
  return sendJson(res, 200, { changes });
}

function validateWatchlistPackage(body) {
  const packageName = body && typeof body.package_name === 'string' ? body.package_name.trim() : '';
  const ecosystem = body && typeof body.ecosystem === 'string' ? body.ecosystem.trim() : '';
  if (packageName.length < PACKAGE_NAME_MIN || packageName.length > PACKAGE_NAME_MAX) {
    return { error: `package_name must be ${PACKAGE_NAME_MIN}-${PACKAGE_NAME_MAX} chars` };
  }
  if (!PACKAGE_NAME_RE.test(packageName)) return { error: 'package_name has invalid characters' };
  if (!ALLOWED_ECOSYSTEMS.has(ecosystem)) {
    return { error: `ecosystem must be one of ${[...ALLOWED_ECOSYSTEMS].join(', ')}` };
  }
  return { value: { packageName, ecosystem } };
}

async function handleWatchlistAdd(req, res, session) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return err(res, 400, 'BAD_REQUEST', 'invalid JSON body');
  }
  const validated = validateWatchlistPackage(body);
  if (validated.error) return err(res, 400, 'BAD_REQUEST', validated.error);
  const { packageName, ecosystem } = validated.value;

  // Sprint+6: owner_org is required and must be one of the user's session orgs.
  // We validate the shape with the same isValidGithubName rule used for repo
  // owner names, then check membership against session.orgs. An empty
  // session.orgs (old token) trivially fails .includes — user must re-auth.
  const ownerOrg = body && typeof body.owner_org === 'string' ? body.owner_org.trim() : '';
  if (!ownerOrg || !isValidGithubName(ownerOrg)) {
    return err(res, 400, 'BAD_REQUEST', 'owner_org is missing or not a valid GitHub identifier');
  }
  const sessionOrgs = Array.isArray(session.orgs) ? session.orgs : [];
  if (!sessionOrgs.includes(ownerOrg)) {
    return err(res, 403, 'FORBIDDEN', 'you are not a member of that GitHub org');
  }

  let sb;
  try {
    sb = getSupabase();
  } catch (e) {
    console.error('exceptions watchlist-add: supabase init failed', e && e.message);
    return err(res, 500, 'DB_ERROR', 'database not configured');
  }

  const { data, error } = await sb
    .from('watched_packages')
    .insert({
      owner_org: ownerOrg,
      user_login: session.login,
      package_name: packageName,
      ecosystem,
    })
    .select('id, owner_org, package_name, ecosystem, created_at')
    .single();

  if (error) {
    // Postgres unique_violation == 23505. Sprint+6: constraint is now
    // (owner_org, package_name, ecosystem). Duplicate add is an idempotent
    // no-op (the dashboard "add" button should be safe to click twice).
    if (error.code === '23505') {
      return sendJson(res, 200, { ok: true, already_watched: true });
    }
    console.error('exceptions watchlist-add: insert failed', error.message);
    return err(res, 500, 'DB_ERROR', 'database write failed');
  }
  return sendJson(res, 201, { ok: true, watched: data });
}

async function handleWatchlistRemove(req, res, session) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return err(res, 400, 'BAD_REQUEST', 'invalid JSON body');
  }

  const id = body && typeof body.id === 'string' ? body.id.trim() : '';
  const ownerOrg = body && typeof body.owner_org === 'string' ? body.owner_org.trim() : '';
  const packageName = body && typeof body.package_name === 'string' ? body.package_name.trim() : '';
  const ecosystem = body && typeof body.ecosystem === 'string' ? body.ecosystem.trim() : '';

  let sb;
  try {
    sb = getSupabase();
  } catch (e) {
    console.error('exceptions watchlist-remove: supabase init failed', e && e.message);
    return err(res, 500, 'DB_ERROR', 'database not configured');
  }

  // Sprint+6: org-scoped removal. Accept either { id } (UI path — look the row
  // up, gate on its owner_org against session.orgs) or
  // { owner_org, package_name, ecosystem } (field-tuple — validate org
  // membership directly). 404 if no matching row exists. Cross-org removal is
  // impossible because every path verifies session.orgs.includes(target org).
  const sessionOrgs = Array.isArray(session.orgs) ? session.orgs : [];

  if (id) {
    if (!UUID_RE.test(id)) return err(res, 400, 'BAD_REQUEST', 'id is not a valid UUID');
    const { data: row, error: selErr } = await sb
      .from('watched_packages')
      .select('id, owner_org')
      .eq('id', id)
      .maybeSingle();
    if (selErr) {
      console.error('exceptions watchlist-remove: select failed', selErr.message);
      return err(res, 500, 'DB_ERROR', 'database query failed');
    }
    if (!row) return err(res, 404, 'NOT_FOUND', 'watchlist entry not found');
    if (!sessionOrgs.includes(row.owner_org)) {
      return err(res, 403, 'FORBIDDEN', 'you are not a member of that GitHub org');
    }
    const { data: deleted, error: delErr } = await sb
      .from('watched_packages')
      .delete()
      .eq('id', id)
      .select('id');
    if (delErr) {
      console.error('exceptions watchlist-remove: delete failed', delErr.message);
      return err(res, 500, 'DB_ERROR', 'database write failed');
    }
    if (!Array.isArray(deleted) || deleted.length === 0) {
      return err(res, 404, 'NOT_FOUND', 'watchlist entry not found');
    }
    return sendJson(res, 200, { ok: true });
  }

  if (ownerOrg || packageName || ecosystem) {
    if (!ownerOrg || !isValidGithubName(ownerOrg)) {
      return err(res, 400, 'BAD_REQUEST', 'owner_org is missing or not a valid GitHub identifier');
    }
    if (!sessionOrgs.includes(ownerOrg)) {
      return err(res, 403, 'FORBIDDEN', 'you are not a member of that GitHub org');
    }
    const validated = validateWatchlistPackage({ package_name: packageName, ecosystem });
    if (validated.error) return err(res, 400, 'BAD_REQUEST', validated.error);
    const { data: deleted, error: delErr } = await sb
      .from('watched_packages')
      .delete()
      .eq('owner_org', ownerOrg)
      .eq('package_name', validated.value.packageName)
      .eq('ecosystem', validated.value.ecosystem)
      .select('id');
    if (delErr) {
      console.error('exceptions watchlist-remove: delete failed', delErr.message);
      return err(res, 500, 'DB_ERROR', 'database write failed');
    }
    if (!Array.isArray(deleted) || deleted.length === 0) {
      return err(res, 404, 'NOT_FOUND', 'watchlist entry not found');
    }
    return sendJson(res, 200, { ok: true });
  }

  return err(res, 400, 'BAD_REQUEST', 'either id or (owner_org, package_name, ecosystem) is required');
}

// ---------------------------------------------------------------------------
// Sprint+5: Slack notifications config (notifications table)
//
// One row per (owner, repo). slack_webhook_url is nullable so disabling is a
// null write that preserves audit context (updated_by, updated_at). The URL
// itself never leaves the server — notifications-get returns only metadata.
// ---------------------------------------------------------------------------

const SLACK_WEBHOOK_URL_PREFIX = 'https://hooks.slack.com/services/';
const SLACK_WEBHOOK_URL_MAX = 500;

async function handleNotificationsGet(req, res, session) {
  const q = getQuery(req);
  const owner = typeof q.owner === 'string' ? q.owner : '';
  const repo = typeof q.repo === 'string' ? q.repo : '';
  if (!owner || !isValidGithubName(owner)) return err(res, 400, 'BAD_REQUEST', 'owner is missing or invalid');
  if (!repo || !isValidGithubName(repo)) return err(res, 400, 'BAD_REQUEST', 'repo is missing or invalid');

  // Read access suffices: even read-only users see whether Slack is configured.
  // They just can't change it (notifications-set requires write+).
  const perm = await getRepoPermissionForUser(owner, repo, session.login);
  if (perm === 'none') return err(res, 404, 'NOT_FOUND', 'Guard is not installed on this repo, or you have no access');

  let sb;
  try {
    sb = getSupabase();
  } catch (e) {
    console.error('exceptions notifications-get: supabase init failed', e && e.message);
    return err(res, 500, 'DB_ERROR', 'database not configured');
  }

  const { data, error } = await sb
    .from('notifications')
    .select('slack_webhook_url, updated_by, updated_at')
    .eq('owner', owner)
    .eq('repo', repo)
    .maybeSingle();

  if (error) {
    console.error('exceptions notifications-get: supabase query failed', error.message);
    return err(res, 500, 'DB_ERROR', 'database query failed');
  }
  if (!data) return sendJson(res, 200, { configured: false });

  // Row exists but URL may be null (disabled). Either way, never echo the URL.
  return sendJson(res, 200, {
    configured: typeof data.slack_webhook_url === 'string' && data.slack_webhook_url.length > 0,
    updated_by: data.updated_by,
    updated_at: data.updated_at,
  });
}

function validateNotificationsSetBody(body) {
  const owner = body && typeof body.owner === 'string' ? body.owner.trim() : '';
  const repo = body && typeof body.repo === 'string' ? body.repo.trim() : '';
  if (!owner || !isValidGithubName(owner)) return { error: 'owner is missing or not a valid GitHub identifier' };
  if (!repo || !isValidGithubName(repo)) return { error: 'repo is missing or not a valid GitHub identifier' };

  // slack_webhook_url must be explicitly present in the body. null disables;
  // a string must match the Slack prefix and length bounds. Anything else 400.
  if (!body || !Object.prototype.hasOwnProperty.call(body, 'slack_webhook_url')) {
    return { error: 'slack_webhook_url is required (string or null)' };
  }
  const raw = body.slack_webhook_url;
  let slackWebhookUrl;
  if (raw === null) {
    slackWebhookUrl = null;
  } else if (typeof raw === 'string') {
    if (raw.length < 1 || raw.length > SLACK_WEBHOOK_URL_MAX) {
      return { error: `slack_webhook_url must be 1-${SLACK_WEBHOOK_URL_MAX} chars` };
    }
    if (!raw.startsWith(SLACK_WEBHOOK_URL_PREFIX)) {
      return { error: `slack_webhook_url must start with ${SLACK_WEBHOOK_URL_PREFIX}` };
    }
    slackWebhookUrl = raw;
  } else {
    return { error: 'slack_webhook_url must be a string or null' };
  }
  return { value: { owner, repo, slackWebhookUrl } };
}

async function handleNotificationsSet(req, res, session) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return err(res, 400, 'BAD_REQUEST', 'invalid JSON body');
  }
  const validated = validateNotificationsSetBody(body);
  if (validated.error) return err(res, 400, 'BAD_REQUEST', validated.error);
  const { owner, repo, slackWebhookUrl } = validated.value;

  const perm = await getRepoPermissionForUser(owner, repo, session.login);
  if (perm === 'none') return err(res, 404, 'NOT_FOUND', 'Guard is not installed on this repo, or you have no access');
  if (perm !== 'write' && perm !== 'admin') return err(res, 403, 'FORBIDDEN', 'you need write or admin permission on this repo');

  let sb;
  try {
    sb = getSupabase();
  } catch (e) {
    console.error('exceptions notifications-set: supabase init failed', e && e.message);
    return err(res, 500, 'DB_ERROR', 'database not configured');
  }

  const updatedAt = new Date().toISOString();
  const { data, error } = await sb
    .from('notifications')
    .upsert({
      owner,
      repo,
      slack_webhook_url: slackWebhookUrl,
      updated_by: session.login,
      updated_at: updatedAt,
    }, { onConflict: 'owner,repo' })
    .select('updated_by, updated_at')
    .single();

  if (error) {
    console.error('exceptions notifications-set: supabase upsert failed', error.message);
    return err(res, 500, 'DB_ERROR', 'database write failed');
  }

  // Never echo the URL back, even on success.
  return sendJson(res, 200, {
    ok: true,
    configured: slackWebhookUrl !== null,
    updated_by: data ? data.updated_by : session.login,
    updated_at: data ? data.updated_at : updatedAt,
  });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  try {
    const method = (req.method || 'GET').toUpperCase();
    const q = getQuery(req);
    const action = typeof q.action === 'string' ? q.action : '';

    // Public (no-auth) branches first. auth-callback mints the cookie, so it
    // can't require one. logout clears the cookie unconditionally.
    if (method === 'POST' && action === 'auth-callback') return await handleAuthCallback(req, res);
    if (method === 'POST' && action === 'logout') return await handleLogout(req, res);

    // Auth-gated branches.
    const session = verifyDashboardSession(req);
    if (!session) return err(res, 401, 'AUTH_REQUIRED', 'a valid dashboard session is required');

    if (method === 'GET' && action === 'whoami') return await handleWhoami(req, res, session);
    if (method === 'GET' && action === 'my-repos') return await handleMyRepos(req, res, session);
    if (method === 'GET' && action === 'watchlist-list') return await handleWatchlistList(req, res, session);
    if (method === 'GET' && action === 'watchlist-changes') return await handleWatchlistChanges(req, res, session);
    if (method === 'POST' && action === 'watchlist-add') return await handleWatchlistAdd(req, res, session);
    if (method === 'POST' && action === 'watchlist-remove') return await handleWatchlistRemove(req, res, session);
    if (method === 'GET' && action === 'notifications-get') return await handleNotificationsGet(req, res, session);
    if (method === 'POST' && action === 'notifications-set') return await handleNotificationsSet(req, res, session);

    if (method === 'GET') return await handleList(req, res, session);
    if (method === 'POST') return await handleGrant(req, res, session);
    if (method === 'DELETE') return await handleRevoke(req, res, session);

    res.setHeader('Allow', 'GET, POST, DELETE');
    return err(res, 405, 'METHOD_NOT_ALLOWED', `method ${method} is not supported`);
  } catch (e) {
    console.error('exceptions: unhandled error', e && e.stack ? e.stack : e);
    if (!res.headersSent) return err(res, 500, 'INTERNAL_ERROR', 'unexpected server error');
  }
}
