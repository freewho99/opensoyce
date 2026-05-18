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
 * Payload: { login, exp (unix seconds) }.
 */
export function signSessionToken({ login, ttlSec = 28800 }, key) {
  if (!key || typeof key !== 'string') throw new Error('HMAC_KEY_MISSING');
  if (!login || typeof login !== 'string') throw new Error('LOGIN_MISSING');
  const now = Math.floor(Date.now() / 1000);
  const payload = { login, exp: now + ttlSec };
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
  return { login: payload.login };
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

  const token = signSessionToken({ login, ttlSec: 28800 }, dashboardSecret);
  setSessionCookie(res, token, 28800);
  return sendJson(res, 200, { ok: true, login });
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
