/**
 * OpenSoyce Guard — Exceptions CRUD (Sprint+3 dashboard backend).
 *
 * Single Vercel function with HTTP-method dispatch (GET / POST / DELETE) so we
 * stay within the 12-function Hobby cap. Backed by the Supabase `exceptions`
 * table (see docs/supabase-setup.md).
 *
 * Routes:
 *   GET    /api/exceptions?owner=<o>&repo=<r>   — list exceptions for a repo
 *   POST   /api/exceptions                      — grant a new exception
 *   DELETE /api/exceptions?id=<uuid>            — soft-revoke an exception
 *
 * Auth: dashboard session token (osg_session cookie or Authorization: Bearer),
 * HMAC-signed with OPENSOYCE_DASHBOARD_SECRET. Minting is PR 3 (frontend
 * OAuth flow); this handler only verifies.
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
import { createClient } from '@supabase/supabase-js';
import { isValidGithubName } from '../src/shared/validateRepo.js';
import { generateAppJwt, getInstallationToken } from './_guard-app.js';

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
// Supabase client (lazy — cold starts that don't need it don't pay the cost)
// ---------------------------------------------------------------------------

let supabaseClient;
function getSupabase() {
  if (supabaseClient) return supabaseClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_ENV_MISSING');
  supabaseClient = createClient(url, key, { auth: { persistSession: false } });
  return supabaseClient;
}

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

function base64urlDecode(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64, 'base64');
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
// Entry point
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  try {
    const session = verifyDashboardSession(req);
    if (!session) return err(res, 401, 'AUTH_REQUIRED', 'a valid dashboard session is required');

    const method = (req.method || 'GET').toUpperCase();
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
