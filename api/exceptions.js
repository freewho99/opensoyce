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
import { signReport } from '../src/shared/reportSigning.js';
import { resolvePolicy, extractPolicyMetadata, parseYamlPolicy, DEFAULT_POLICY } from '../src/shared/policyInheritance.js';
import { detectOtsPatternsForRow } from '../src/shared/otsPatterns.js';
import { npmHighImpact } from 'npm-high-impact';
import { resolvePackages, liveFetchPackage } from '../src/shared/packageRegistryQuery.js';
import { queryOsvBatch, detailPatchFromOsv } from '../src/shared/osvFastPath.js';


// Vercel serverless configuration: disable automatic body parser so we can read the raw stream for signature verification
export const config = {
  api: {
    bodyParser: false,
  },
};

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

export function signAuditorToken({ login, org, ttlSec = 31536000 }, key) {
  if (!key || typeof key !== 'string') throw new Error('HMAC_KEY_MISSING');
  if (!login || typeof login !== 'string') throw new Error('LOGIN_MISSING');
  if (!org || typeof org !== 'string') throw new Error('ORG_MISSING');
  const now = Math.floor(Date.now() / 1000);
  const payload = { login, org, role: 'auditor', exp: now + ttlSec };
  const json = JSON.stringify(payload);
  const enc = base64urlEncode(json);
  const sig = crypto.createHmac('sha256', key).update(json).digest('hex');
  return `osg_auditor_${enc}.${sig}`;
}

export function verifyAuditorToken(token, key) {
  if (!key || typeof key !== 'string') return null;
  if (typeof token !== 'string' || !token.startsWith('osg_auditor_')) return null;
  const parts = token.slice('osg_auditor_'.length);
  if (!parts.includes('.')) return null;
  const idx = parts.indexOf('.');
  const enc = parts.slice(0, idx);
  const sig = parts.slice(idx + 1);
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
  if (!payload || typeof payload.login !== 'string' || typeof payload.org !== 'string' || payload.role !== 'auditor' || typeof payload.exp !== 'number') return null;
  const now = Math.floor(Date.now() / 1000);
  if (now >= payload.exp) return null;
  return payload;
}

export function signExceptionLedger(id, packageName, grantedBy, reason, secret) {
  const payload = `${id}:${packageName}:${grantedBy}:${reason}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
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

async function readRawBody(req) {
  if (req.rawBody) return req.rawBody;
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      req.rawBody = raw;
      resolve(raw);
    });
    req.on('error', reject);
  });
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const raw = await readRawBody(req);
  return raw.trim() ? JSON.parse(raw) : {};
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
    .select('id, owner, repo, package_name, ecosystem, reason, expires_at, granted_by, created_at, revoked_at, status, revoked_by')
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

  // Check if Slack notifications are configured for this repo
  let notif = null;
  try {
    const { data: notifData } = await sb
      .from('notifications')
      .select('slack_webhook_url')
      .eq('owner', owner)
      .eq('repo', repo)
      .maybeSingle();
    notif = notifData;
  } catch (err) {
    console.warn('exceptions POST: notifications lookup failed', err && err.message);
  }

  const status = (notif && notif.slack_webhook_url) ? 'pending' : 'approved';
  const id = crypto.randomUUID();
  let finalReason = reason;
  if (status === 'approved') {
    const secret = process.env.OPENSOYCE_DASHBOARD_SECRET;
    if (!secret) {
      return err(res, 500, 'DASHBOARD_NOT_CONFIGURED', 'dashboard is not configured: ledger signature cannot be issued');
    }
    const signature = signExceptionLedger(id, packageName, session.login, reason, secret);
    finalReason = `${reason}\n--- LEDGER SIGNATURE: ${signature}`;
  }

  const { data, error } = await sb
    .from('exceptions')
    .insert({
      id,
      owner,
      repo,
      package_name: packageName,
      ecosystem,
      reason: finalReason,
      expires_at: expiresAt,
      granted_by: session.login,
      status: status,
    })
    .select('id, owner, repo, package_name, ecosystem, reason, expires_at, granted_by, created_at, revoked_at, status')
    .single();

  if (error) {
    console.error('exceptions POST: supabase insert failed', error.message);
    return err(res, 500, 'DB_ERROR', 'database write failed');
  }

  // Dispatch Slack notification if Slack is configured
  if (notif && notif.slack_webhook_url && data) {
    const slackPayload = {
      text: `New exception request for package *${packageName}* in *${owner}/${repo}*`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*New OpenSoyce Exception Request*`
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Repository:*\n${owner}/${repo}`
            },
            {
              type: 'mrkdwn',
              text: `*Package:*\n${ecosystem}:${packageName}`
            },
            {
              type: 'mrkdwn',
              text: `*Requested By:*\n@${session.login}`
            },
            {
              type: 'mrkdwn',
              text: `*Expires At:*\n${new Date(expiresAt).toLocaleDateString()}`
            }
          ]
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Reason:*\n${reason}`
          }
        },
        {
          type: 'actions',
          block_id: 'exception_approval',
          elements: [
            {
              type: 'button',
              action_id: 'approve',
              text: {
                type: 'plain_text',
                text: 'Approve'
              },
              style: 'primary',
              value: data.id
            },
            {
              type: 'button',
              action_id: 'deny',
              text: {
                type: 'plain_text',
                text: 'Deny'
              },
              style: 'danger',
              value: data.id
            }
          ]
        }
      ]
    };

    try {
      await fetch(notif.slack_webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slackPayload)
      });
    } catch (slackErr) {
      console.error('exceptions POST: slack notification dispatch failed', slackErr && slackErr.message);
    }
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
    .update({ 
      revoked_at: new Date().toISOString(),
      revoked_by: session.login,
      status: 'revoked'
    })
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

async function handleComplianceReport(req, res, session) {
  const q = getQuery(req);
  const owner = typeof q.owner === 'string' ? q.owner.trim() : '';
  const repo = typeof q.repo === 'string' ? q.repo.trim() : '';
  if (!owner || !isValidGithubName(owner)) return err(res, 400, 'BAD_REQUEST', 'owner is missing or invalid');
  if (!repo || !isValidGithubName(repo)) return err(res, 400, 'BAD_REQUEST', 'repo is missing or invalid');

  const perm = await getRepoPermissionForUser(owner, repo, session.login);
  if (perm === 'none') {
    return err(res, 404, 'NOT_FOUND', 'Guard is not installed on this repo, or you have no access');
  }

  let sb;
  try {
    sb = getSupabase();
  } catch (e) {
    console.error('exceptions compliance-report: supabase init failed', e && e.message);
    return err(res, 500, 'DB_ERROR', 'database not configured');
  }

  const { data: exceptions, error } = await sb
    .from('exceptions')
    .select('id, owner, repo, package_name, ecosystem, reason, expires_at, granted_by, created_at, revoked_at, status, revoked_by')
    .eq('owner', owner)
    .eq('repo', repo)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('exceptions compliance-report: supabase query failed', error.message);
    return err(res, 500, 'DB_ERROR', 'database query failed');
  }

  const list = exceptions || [];

  let resolvedPolicy = DEFAULT_POLICY;
  let policySource = 'default';
  let orgPolicyRepo = null;
  let preset = null;
  let rawYaml = null;

  try {
    const installationId = await findInstallationIdForRepo(owner, repo);
    if (installationId) {
      const tokenResp = await getInstallationToken(installationId);
      const token = tokenResp && tokenResp.token;
      if (token) {
        try {
          const policyRes = await githubFetch(token, `/repos/${owner}/${repo}/contents/.opensoyce.yml`);
          if (policyRes.ok) {
            const json = await policyRes.json();
            if (json && typeof json.content === 'string') {
              rawYaml = Buffer.from(json.content, 'base64').toString('utf8');
            }
          }
        } catch (e) {
          console.warn('exceptions compliance-report: fetch repo policy failed', e.message);
        }

        const repoPolicyObj = rawYaml ? parseYamlPolicy(rawYaml) : null;
        const meta = rawYaml ? extractPolicyMetadata(rawYaml) : { orgPolicyRepo: null, preset: null };
        orgPolicyRepo = meta.orgPolicyRepo;
        preset = meta.preset;

        const resolved = await resolvePolicy({
          githubFetch: (p) => githubFetch(token, p),
          orgPolicyRepo,
          preset,
          repoPolicy: repoPolicyObj,
        });
        resolvedPolicy = resolved.policy;
        policySource = resolved.policySource;
      }
    }
  } catch (e) {
    console.warn('exceptions compliance-report: policy resolution threw error', e.message);
  }

  const now = Date.now();
  let active = 0;
  let expired = 0;
  let revoked = 0;
  let pending = 0;

  for (const row of list) {
    if (row.status === 'pending') {
      pending++;
    } else if (row.status === 'revoked' || row.revoked_at) {
      revoked++;
    } else {
      const expiresMs = Date.parse(row.expires_at);
      if (Number.isFinite(expiresMs) && expiresMs <= now) {
        expired++;
      } else {
        active++;
      }
    }
  }

  const report = {
    reportType: 'SOC2_COMPLIANCE_AUDIT',
    owner,
    repo,
    generatedAt: new Date().toISOString(),
    generatedBy: session.login,
    summary: {
      total: list.length,
      active,
      expired,
      revoked,
      pending,
    },
    policy: {
      source: policySource,
      preset,
      orgPolicyRepo,
      resolved: resolvedPolicy,
    },
    exceptions: list,
  };

  const signingKey = process.env.OPENSOYCE_SIGNING_PRIVATE_KEY;
  if (signingKey && signingKey.trim()) {
    try {
      const signed = signReport(report, {
        privateKeyPem: signingKey,
        publicKeyPem: process.env.OPENSOYCE_SIGNING_PUBLIC_KEY,
        location: 'top-level',
      });
      return sendJson(res, 200, signed);
    } catch (e) {
      console.error('exceptions compliance-report: signing failed', e.message);
      res.setHeader('X-OpenSoyce-Signing-Error', String(e.message || e).slice(0, 200));
      return sendJson(res, 200, report);
    }
  }

  return sendJson(res, 200, report);
}

async function handleWhoami(req, res, session) {
  // Sprint+6 PR 3: expose session.orgs so the dashboard's org picker can show
  // every org the user belongs to — not just orgs that already have watched
  // packages (which is what watchlist-list rows would imply). Without this,
  // first-add to a fresh org is impossible. `|| []` defaults to empty for old
  // session tokens that predate Sprint+6 (verifySessionToken already coerces
  // missing payload.orgs to []; this fallback is belt-and-suspenders).
  return sendJson(res, 200, {
    login: session.login,
    orgs: session.orgs || [],
    isReviewer: isReviewer(session.login)
  });
}

async function handleLogout(req, res) {
  clearSessionCookie(res);
  return sendJson(res, 200, { ok: true });
}

// ---------------------------------------------------------------------------
// Compliance Integrations (Vanta/Drata evidence + scoped tokens)
// ---------------------------------------------------------------------------

async function handleComplianceEvidence(req, res) {
  // Extract token from Authorization: Bearer <token> or key=<token>
  let token = null;
  const auth = req.headers && (req.headers.authorization || req.headers.Authorization);
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    token = auth.slice(7).trim();
  } else {
    const q = getQuery(req);
    if (typeof q.key === 'string') token = q.key.trim();
  }

  if (!token) {
    return err(res, 401, 'AUTH_REQUIRED', 'Auditor API key is required');
  }

  const secret = process.env.OPENSOYCE_DASHBOARD_SECRET;
  if (!secret) {
    return err(res, 500, 'DASHBOARD_NOT_CONFIGURED', 'dashboard is not configured');
  }

  const auditorSession = verifyAuditorToken(token, secret);
  if (!auditorSession) {
    return err(res, 401, 'INVALID_TOKEN', 'invalid or expired compliance auditor key');
  }

  const q = getQuery(req);
  const org = typeof q.org === 'string' ? q.org.trim() : '';
  if (!org) {
    return err(res, 400, 'BAD_REQUEST', 'org query parameter is required');
  }

  if (auditorSession.org.toLowerCase() !== org.toLowerCase()) {
    return err(res, 403, 'FORBIDDEN', 'this auditor key is not authorized for the requested organization');
  }

  let sb;
  try {
    sb = getSupabase();
  } catch (e) {
    console.error('compliance-evidence: supabase init failed', e && e.message);
    return err(res, 500, 'DB_ERROR', 'database not configured');
  }

  // Fetch all exceptions for the org
  const { data, error } = await sb
    .from('exceptions')
    .select('id, owner, repo, package_name, ecosystem, reason, expires_at, granted_by, created_at, revoked_at, status, revoked_by')
    .eq('owner', org)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('compliance-evidence query failed', error.message);
    return err(res, 500, 'DB_ERROR', 'database query failed');
  }

  const list = data || [];
  const now = Date.now();
  let active = 0;
  let expired = 0;
  let revoked = 0;
  let pending = 0;

  for (const row of list) {
    if (row.status === 'pending') {
      pending++;
    } else if (row.status === 'revoked' || row.revoked_at) {
      revoked++;
    } else {
      const expiresMs = Date.parse(row.expires_at);
      if (Number.isFinite(expiresMs) && expiresMs <= now) {
        expired++;
      } else {
        active++;
      }
    }
  }

  const report = {
    reportType: 'SOC2_COMPLIANCE_EVIDENCE',
    org,
    generatedAt: new Date().toISOString(),
    summary: {
      total: list.length,
      active,
      expired,
      revoked,
      pending,
    },
    exceptions: list,
  };

  const signingKey = process.env.OPENSOYCE_SIGNING_PRIVATE_KEY;
  if (signingKey && signingKey.trim()) {
    try {
      const signed = signReport(report, {
        privateKeyPem: signingKey,
        publicKeyPem: process.env.OPENSOYCE_SIGNING_PUBLIC_KEY,
        location: 'top-level',
      });
      return sendJson(res, 200, signed);
    } catch (e) {
      console.error('compliance-evidence: signing failed', e.message);
      res.setHeader('X-OpenSoyce-Signing-Error', String(e.message || e).slice(0, 200));
      return sendJson(res, 200, report);
    }
  }

  return sendJson(res, 200, report);
}

async function handleComplianceTokenMint(req, res, session) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return err(res, 400, 'BAD_REQUEST', 'invalid JSON body');
  }

  const org = typeof body.org === 'string' ? body.org.trim() : '';
  if (!org || !isValidGithubName(org)) {
    return err(res, 400, 'BAD_REQUEST', 'org is missing or invalid');
  }

  const sessionOrgs = Array.isArray(session.orgs) ? session.orgs : [];
  if (!sessionOrgs.includes(org)) {
    return err(res, 403, 'FORBIDDEN', 'you are not a member of that GitHub org');
  }

  const secret = process.env.OPENSOYCE_DASHBOARD_SECRET;
  if (!secret) {
    return err(res, 500, 'DASHBOARD_NOT_CONFIGURED', 'dashboard is not configured');
  }

  const key = signAuditorToken({ login: session.login, org }, secret);
  return sendJson(res, 200, { ok: true, org, key });
}

export const DEPS_REGISTRY = {
  'react': { score: 10.0, license: 'MIT', verdict: 'stable', status: 'FRESH' },
  'facebook/react': { score: 8.4, license: 'MIT', verdict: 'stable', status: 'FRESH' },
  'vercel/next.js': { score: 7.6, license: 'MIT', verdict: 'forkable', status: 'FRESH' },
  'sindresorhus/got': { score: 7.6, license: 'MIT', verdict: 'forkable', status: 'FRESH' },
  'axios': { score: 9.4, license: 'MIT', verdict: 'stable', status: 'FRESH' },
  'axios/axios': { score: 8.9, license: 'MIT', verdict: 'stable', status: 'FRESH' },
  'express': { score: 8.2, license: 'MIT', verdict: 'stable', status: 'AGING' },
  'expressjs/express': { score: 9.1, license: 'MIT', verdict: 'stable', status: 'AGING' },
  'lodash': { score: 6.1, license: 'MIT', verdict: 'watchlist', status: 'STALE', warn: 'SCORE DROP' },
  'lodash/lodash': { score: 8.2, license: 'MIT', verdict: 'stable', status: 'STALE' },
  'moment': { score: 4.2, license: 'MIT', verdict: 'risky', status: 'STALE', warn: 'DEPRECATED' },
  'tiangolo/fastapi': { score: 9.6, license: 'MIT', verdict: 'stable', status: 'FRESH' },
  'remix-run/remix': { score: 8.8, license: 'MIT', verdict: 'stable', status: 'FRESH' },
  'torvalds/linux': { score: 6.2, license: 'GPL-2.0', verdict: 'watchlist', status: 'STALE' },
  'microsoft/vscode': { score: 8.2, license: 'MIT', verdict: 'stable', status: 'FRESH' },
  'nodejs/node': { score: 9.3, license: 'MIT', verdict: 'stable', status: 'FRESH' },
  'openssl/openssl': { score: 7.1, license: 'Apache-2.0', verdict: 'forkable', status: 'AGING' },
  'supabase/supabase': { score: 9.7, license: 'MIT', verdict: 'stable', status: 'FRESH' },
  'prettier/prettier': { score: 9.1, license: 'MIT', verdict: 'stable', status: 'FRESH' },
  'kubernetes/kubernetes': { score: 9.3, license: 'Apache-2.0', verdict: 'stable', status: 'FRESH' },
  'hashicorp/terraform': { score: 8.6, license: 'MPL-2.0', verdict: 'stable', status: 'FRESH' },
  'angular/angular': { score: 8.7, license: 'MIT', verdict: 'stable', status: 'FRESH' },
  'jquery/jquery': { score: 8.4, license: 'MIT', verdict: 'stable', status: 'STALE' },
  'chartjs/Chart.js': { score: 6.7, license: 'MIT', verdict: 'watchlist', status: 'AGING' },
  'prisma/prisma': { score: 8.8, license: 'Apache-2.0', verdict: 'stable', status: 'FRESH' },
  'trpc/trpc': { score: 8.2, license: 'MIT', verdict: 'stable', status: 'FRESH' },
  'malicious-pkg': { score: 1.0, license: 'MIT', verdict: 'graveyard', status: 'STALE', critical: true, description: 'Contains preinstall curl backchannel exploit.' },
  'agpl-pkg': { score: 5.0, license: 'AGPL-3.0', verdict: 'risky', status: 'AGING' }
};

async function handleComplianceGate(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return err(res, 400, 'BAD_REQUEST', 'invalid JSON body');
  }

  const dependencies = Array.isArray(body.dependencies) ? body.dependencies : [];
  const owner = typeof body.owner === 'string' ? body.owner.trim() : '';
  const repo = typeof body.repo === 'string' ? body.repo.trim() : '';

  let resolvedPolicy = { ...DEFAULT_POLICY };
  if (body.policy && typeof body.policy === 'object') {
    const parsedBlock = Array.isArray(body.policy.block) ? body.policy.block : [];
    const parsedWarn = Array.isArray(body.policy.warn) ? body.policy.warn : [];
    const parsedAllow = Array.isArray(body.policy.allow) ? body.policy.allow : [];
    resolvedPolicy = {
      block: parsedBlock.map(s => s.toLowerCase().trim()),
      warn: parsedWarn.map(s => s.toLowerCase().trim()),
      allow: parsedAllow.map(s => s.toLowerCase().trim())
    };
  }

  let sb = null;
  try {
    sb = getSupabase();
  } catch (e) {
    console.warn('handleComplianceGate: Supabase not configured, bypassing DB exceptions check.');
  }

  // Phase 2: long-tail live-query resolver. Returns details for every
  // package via snapshot (preferred, when fresh per verdict-tiered TTL)
  // → snapshot-stale (served as-is; cron handles refresh) → live-query
  // (with 1500ms timeout + in-flight coalescing) → hardcoded fallback.
  // DEPS_REGISTRY remains the demo-package fixture path used by tests and
  // by the in-repo dogfood gate; we consult it as a final tier when the
  // resolver returned `fallback`.
  const cleanNames = dependencies
    .filter(d => typeof d === 'string' && d.trim())
    .map(d => {
      const trimmed = d.trim().toLowerCase();
      // For OSV/resolver lookups, strip an inline @version suffix
      // (`lodash@4.17.20` → `lodash`). The version is still used downstream
      // for pattern detection (rowForPatterns).
      if (trimmed.startsWith('@')) {
        const atIdx = trimmed.indexOf('@', 1);
        return atIdx === -1 ? trimmed : trimmed.substring(0, atIdx);
      }
      const atIdx = trimmed.indexOf('@');
      return atIdx === -1 ? trimmed : trimmed.substring(0, atIdx);
    });

  // Phase 3: OSV fast-path. One bulk query (api.osv.dev) covers the
  // worst cold-path failure mode: a brand-new malicious package with
  // no GitHub repo would otherwise return the resolver's hardcoded
  // fallback. OSV gives us a sub-200ms BLOCK signal on known
  // advisories. Failure / timeout → empty Map, gate degrades to
  // Phase 2 behavior gracefully.
  const osvMap = await queryOsvBatch(cleanNames);

  const resolverMap = await resolvePackages(sb, cleanNames, {
    githubToken: process.env.GITHUB_TOKEN || '',
  });

  const nowIso = new Date().toISOString();
  const evaluation = [];
  let blockedCount = 0;
  let overallScoreSum = 0;
  let ratedCount = 0;
  let anyFallbackUsed = false;

  for (const dep of dependencies) {
    if (typeof dep !== 'string' || !dep.trim()) continue;
    const name = dep.trim();
    const nameLower = name.toLowerCase();
    let resolved = resolverMap.get(nameLower) || {
      score: 8.0,
      license: 'MIT',
      verdict: 'stable',
      status: 'FRESH',
      critical: false,
      source: 'fallback',
    };

    // DEPS_REGISTRY backward-compat: when the resolver couldn't find or
    // live-fetch the package, fall back to the in-repo fixture. Demo
    // packages (axios, malicious-pkg, agpl-pkg) and the seeded baseline
    // remain authoritative for tests + dogfood. Tag the result so the
    // cache field still reflects "we had real data" vs "we returned 8.0".
    if (resolved.source === 'fallback') {
      const demoEntry = DEPS_REGISTRY[name] || DEPS_REGISTRY[nameLower];
      if (demoEntry) {
        resolved = {
          score: demoEntry.score,
          license: demoEntry.license,
          verdict: demoEntry.verdict,
          status: demoEntry.status,
          warn: demoEntry.warn || null,
          description: demoEntry.description || null,
          critical: !!demoEntry.critical,
          source: 'deps-registry-demo',
        };
      } else {
        anyFallbackUsed = true;
      }
    }
    // Phase 3: OSV fast-path overlay. If OSV found published advisories
    // for this package, mark it critical (so policy BLOCKs even when
    // resolver returned fallback) and surface the IDs to the pattern row
    // below. OSV does NOT affect the cache field: it's an enrichment
    // layer, not a verdict source for license/score/freshness.
    const osvSummary = osvMap.get(nameLower);
    const osvPatch = detailPatchFromOsv(osvSummary);
    const details = osvPatch
      ? {
          ...resolved,
          critical: resolved.critical || osvPatch.critical,
          description: resolved.description || osvPatch.osvSummary,
        }
      : resolved;

    overallScoreSum += details.score;
    ratedCount++;

    let action = 'ALLOW';
    let exceptionActive = false;
    let reason = '';

    const isVerdictBlocked = resolvedPolicy.block.includes(details.verdict.toLowerCase());
    const isLicenseBlocked = resolvedPolicy.block.includes('license:' + details.license.toLowerCase()) || 
                            (details.license.toUpperCase() === 'AGPL-3.0' && resolvedPolicy.block.includes('graveyard'));
    const isCritical = details.critical === true;

    if (isVerdictBlocked || isLicenseBlocked || isCritical) {
      action = 'BLOCK';
      reason = isCritical ? (details.description || 'Malicious payload detected') : 
               isLicenseBlocked ? `Restricted License: ${details.license}` :
               `Verdict "${details.verdict.toUpperCase()}" is blocked by policy`;
    } else if (resolvedPolicy.warn.includes(details.verdict.toLowerCase())) {
      action = 'WARN';
      reason = `Verdict "${details.verdict.toUpperCase()}" triggers a warning under active policy`;
    }

    if (action === 'BLOCK' && sb && owner && repo) {
      try {
        const { data: activeException } = await sb
          .from('exceptions')
          .select('id, expires_at, reason')
          .eq('owner', owner)
          .eq('repo', repo)
          .eq('package_name', name)
          .eq('status', 'approved')
          .gt('expires_at', nowIso)
          .is('revoked_at', null)
          .maybeSingle();

        if (activeException) {
          action = 'ALLOW';
          exceptionActive = true;
          reason = `Allowed via approved exception (ID: ${activeException.id})`;
        }
      } catch (err) {
        console.warn(`handleComplianceGate: Exception check failed for ${name}`, err.message);
      }
    }

    if (action === 'BLOCK') {
      blockedCount++;
    }

    let pkgNameForPatterns = name;
    let pkgVersionForPatterns = '';
    if (name.includes('@') && !name.startsWith('@')) {
      const parts = name.split('@');
      pkgNameForPatterns = parts[0];
      pkgVersionForPatterns = parts[1];
    } else if (name.startsWith('@') && name.indexOf('@', 1) !== -1) {
      const idx = name.indexOf('@', 1);
      pkgVersionForPatterns = name.substring(idx + 1);
      pkgNameForPatterns = name.substring(0, idx);
    }

    // Production gate row. Honesty pass: removed the hardcoded
    // demo synthesis (axios → '1.14.1', hasInstallScript:axios|malicious-pkg,
    // ids: 'CVE-MOCK'). The detector now sees only real signal sources:
    // user-supplied version, OSV-found advisory IDs, OSV-derived severity.
    // The Project Detail demo page (src/pages/ProjectDetail.tsx) opts into
    // allowDemoFixtures explicitly when it wants the synthetic axios cloud
    // for marketing.
    const osvIds = osvSummary && Array.isArray(osvSummary.ids) ? osvSummary.ids : [];
    // Prefer OSV's observed severity over the score-derived heuristic
    // when we have it. Falls back to critical when DEPS_REGISTRY marks
    // the entry critical, then the score-ladder.
    const observedSeverity = (osvSummary && osvSummary.highestSeverity && osvSummary.highestSeverity !== 'unknown')
      ? osvSummary.highestSeverity
      : (isCritical ? 'critical' : (details.score < 6 ? 'high' : 'medium'));
    const rowForPatterns = {
      package: pkgNameForPatterns,
      version: pkgVersionForPatterns,
      severity: observedSeverity,
      ids: osvIds,
      verified: details.verdict !== 'graveyard' && details.verdict !== 'risky' ? true : 'unverified',
      license: details.license,
    };
    // Production gate must not fire demo-only detector branches. The
    // detector defaults to allowDemoFixtures:false; we pass it explicitly
    // here to make the intent visible.
    const patterns = detectOtsPatternsForRow(rowForPatterns, {
      ci: true,
      hasSecrets: true,
      allowDemoFixtures: false,
    });

    evaluation.push({
      package: name,
      score: details.score,
      verdict: details.verdict.toUpperCase(),
      license: details.license,
      status: details.status,
      action,
      reason,
      exception: exceptionActive,
      remediation: details.score < 7.0 || isCritical ? 'Upgrade to latest stable release version' : 'None',
      patterns
    });

  }

  const finalScore = ratedCount > 0 ? parseFloat((overallScoreSum / ratedCount).toFixed(1)) : 10.0;
  const decision = blockedCount > 0 ? 'BLOCK' : 'ALLOW';

  // Phase 2 cache semantics: `hit` means every package had real data
  // (fresh snapshot, stale snapshot, live-query, or DEPS_REGISTRY demo).
  // `miss` means at least one package fell to the hardcoded 8.0 default
  // because both the resolver and DEPS_REGISTRY came up empty. `force_scan`
  // still labels the response as `miss` to preserve client-side semantics.
  const cacheStatus = (body.force_scan || anyFallbackUsed) ? 'miss' : 'hit';

  return sendJson(res, 200, {
    decision,
    overallScore: finalScore,
    dependenciesChecked: ratedCount,
    cache: cacheStatus,
    evaluation
  });
}

// ---------------------------------------------------------------------------
// Package Registry Snapshot Updater — cron action
//
// Unified into this file (rather than a separate api/cron/update-registry.js)
// because Vercel Hobby caps us at 12 functions and the standalone file pushed
// us to 13, breaking the production deploy. Same trade as commit 412fe89
// (slack webhook unified into exceptions). Triggered by Vercel cron at
// GET /api/cron/update-registry → rewritten to ?action=cron-update-registry.
// ---------------------------------------------------------------------------

const REGISTRY_BATCH_SIZE = 50;

async function handleCronUpdateRegistry(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return err(res, 405, 'METHOD_NOT_ALLOWED', 'only GET supported');
  }
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('cron-update-registry: CRON_SECRET unset');
    return err(res, 500, 'CRON_NOT_CONFIGURED', 'cron secret not set');
  }
  const auth = req.headers && req.headers.authorization;
  if (auth !== `Bearer ${cronSecret}`) {
    return err(res, 401, 'UNAUTHORIZED', 'bad cron bearer');
  }

  let sb;
  try {
    sb = getSupabase();
  } catch (e) {
    console.error('cron-update-registry: supabase init failed', e && e.message);
    return err(res, 500, 'DB_NOT_CONFIGURED', 'database not configured');
  }

  // 1. Self-seeding: ensure top-1k npm packages exist in the registry.
  try {
    const { count, error: countErr } = await sb
      .from('package_registry')
      .select('*', { count: 'exact', head: true });
    if (countErr) throw countErr;
    if ((count || 0) < 1000) {
      console.log(`cron-update-registry: self-seeding from ${count || 0} → 1000`);
      const insertRows = npmHighImpact.slice(0, 1000).map((name) => ({
        package_name: name.toLowerCase(),
        ecosystem: 'npm',
        score: 8.0,
        license: 'MIT',
        verdict: 'stable',
        status: 'FRESH',
        updated_at: '1970-01-01T00:00:00Z', // force first-tick scan
      }));
      const { error: upsertErr } = await sb
        .from('package_registry')
        .upsert(insertRows, { onConflict: 'package_name,ecosystem', ignoreDuplicates: true });
      if (upsertErr) throw upsertErr;
    }
  } catch (e) {
    console.error('cron-update-registry: self-seeding failed', e && e.message);
    return err(res, 502, 'SEEDING_FAILED', e.message);
  }

  // 2. Pull a batch of the oldest-updated packages.
  let batch;
  try {
    const { data, error: batchErr } = await sb
      .from('package_registry')
      .select('package_name')
      .order('updated_at', { ascending: true })
      .limit(REGISTRY_BATCH_SIZE);
    if (batchErr) throw batchErr;
    batch = data || [];
  } catch (e) {
    console.error('cron-update-registry: batch query failed', e && e.message);
    return err(res, 502, 'BATCH_QUERY_FAILED', e.message);
  }
  if (batch.length === 0) {
    return sendJson(res, 200, { ok: true, message: 'no packages to scan' });
  }

  // 3. Force-refresh each package via the shared liveFetchPackage primitive
  // from src/shared/packageRegistryQuery.js. The cron deliberately bypasses
  // the resolver's TTL/snapshot logic — it WANTS fresh data regardless of
  // age, that's its job. The gate handler uses resolvePackages instead,
  // which respects TTLs.
  const githubToken = process.env.GITHUB_TOKEN || '';
  const tally = { success: 0, failed: 0, nonGithub: 0 };
  const details = [];
  for (const item of batch) {
    const pkgName = item.package_name;
    try {
      const fetched = await liveFetchPackage(pkgName, { githubToken, timeoutMs: 30000 });
      if (fetched) {
        const { error: upErr } = await sb
          .from('package_registry')
          .update({
            score: fetched.score,
            license: fetched.license,
            verdict: fetched.verdict,
            status: fetched.status,
            critical: !!fetched.critical,
            description: fetched.description || null,
            updated_at: new Date().toISOString(),
          })
          .eq('package_name', pkgName)
          .eq('ecosystem', 'npm');
        if (upErr) throw upErr;
        tally.success += 1;
        details.push({ package: pkgName, status: 'updated', score: fetched.score });
      } else {
        // No GitHub repo OR upstream returned null. Bump timestamp so this
        // package moves to the back of the oldest-updated queue.
        await sb
          .from('package_registry')
          .update({ updated_at: new Date().toISOString() })
          .eq('package_name', pkgName)
          .eq('ecosystem', 'npm');
        tally.nonGithub += 1;
        details.push({ package: pkgName, status: 'no_upstream_data' });
      }
    } catch (e) {
      console.warn(`cron-update-registry: ${pkgName} failed:`, e && e.message);
      tally.failed += 1;
      details.push({ package: pkgName, status: 'error', error: e && e.message });
    }
  }
  return sendJson(res, 200, { ok: true, scanned: batch.length, results: tally, details });
}

// Test-only seam: lets unit tests stub the GitHub permission lookup without
// patching global fetch. Production code path uses getRepoPermissionForUser.
let __appealPermissionResolver = null;
export function __setAppealPermissionResolverForTests(fn) {
  __appealPermissionResolver = fn;
}

async function handleSubmitAppeal(req, res, session) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return err(res, 400, 'BAD_REQUEST', 'invalid JSON body');
  }

  const packageName = typeof body.package_name === 'string' ? body.package_name.trim() : '';
  const ecosystem = typeof body.ecosystem === 'string' ? body.ecosystem.trim() : '';
  const repoStr = typeof body.repo === 'string' ? body.repo.trim() : '';
  const rationale = typeof body.rationale === 'string' ? body.rationale.trim().slice(0, 2000) : '';

  if (!packageName || !ecosystem || !repoStr) {
    return err(res, 400, 'BAD_REQUEST', 'package_name, ecosystem, and repo (owner/repo) are required');
  }
  if (!ALLOWED_ECOSYSTEMS.has(ecosystem)) {
    return err(res, 400, 'BAD_REQUEST', `ecosystem must be one of ${[...ALLOWED_ECOSYSTEMS].join(', ')}`);
  }

  const repoParts = repoStr.split('/');
  if (repoParts.length !== 2 || !repoParts[0] || !repoParts[1]) {
    return err(res, 400, 'BAD_REQUEST', 'repo must be in "owner/repo" format');
  }
  const sourceOwner = repoParts[0];
  const sourceRepo = repoParts[1];

  // Verify the caller is admin or write on the claimed source repo via the
  // installed GitHub App. This is the maintainership check the previous
  // implementation only claimed to perform.
  const resolver = __appealPermissionResolver || getRepoPermissionForUser;
  const perm = await resolver(sourceOwner, sourceRepo, session.login);
  if (perm === 'none') {
    return err(res, 404, 'NOT_FOUND', `OpenSoyce Guard is not installed on ${sourceOwner}/${sourceRepo}, or you have no access. Install the app on the source repo before filing an appeal.`);
  }
  if (perm !== 'admin' && perm !== 'write') {
    return err(res, 403, 'FORBIDDEN', `appeal requires admin or write permission on ${sourceOwner}/${sourceRepo}; your role is "${perm}"`);
  }

  // Persist a pending appeal. Status is 'pending' until a reviewer examines
  // it; the package score is NOT auto-mutated.
  let sb;
  try {
    sb = getSupabase();
  } catch (e) {
    console.error('exceptions submit-appeal: supabase init failed', e && e.message);
    return err(res, 500, 'DB_ERROR', 'database not configured');
  }

  const appealId = crypto.randomUUID();
  const { error: insertErr } = await sb
    .from('appeals')
    .insert({
      id: appealId,
      package_name: packageName,
      ecosystem,
      source_owner: sourceOwner,
      source_repo: sourceRepo,
      submitted_by: session.login,
      submitted_by_role: perm,
      rationale: rationale || null,
      status: 'pending',
    });

  if (insertErr) {
    console.error('exceptions submit-appeal: insert failed', insertErr.message);
    return err(res, 500, 'DB_ERROR', 'failed to file appeal');
  }

  return sendJson(res, 200, {
    ok: true,
    appealId,
    status: 'pending',
    packageName,
    verifiedRole: perm,
    message: `Appeal filed for ${packageName}. A reviewer will examine your verified maintainership claim before any score change is applied.`,
  });
}

// ---------------------------------------------------------------------------
// Appeals reviewer authorization and operations (Sprint+6 Appeals Review)
// ---------------------------------------------------------------------------

function isReviewer(login) {
  if (!login || typeof login !== 'string') return false;
  const reviewers = new Set(
    (process.env.OPENSOYCE_REVIEWERS || 'freewho99')
      .split(',')
      .map(u => u.trim().toLowerCase())
  );
  return reviewers.has(login.toLowerCase());
}

async function handleAppealsList(req, res, session) {
  if (!isReviewer(session.login)) {
    return err(res, 403, 'FORBIDDEN', 'You are not authorized to review appeals');
  }

  let sb;
  try {
    sb = getSupabase();
  } catch (e) {
    console.error('exceptions appeals-list: supabase init failed', e && e.message);
    return err(res, 500, 'DB_ERROR', 'database not configured');
  }

  const { data, error } = await sb
    .from('appeals')
    .select('id, package_name, ecosystem, source_owner, source_repo, submitted_by, submitted_by_role, rationale, status, reviewed_by, reviewed_at, review_notes, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('exceptions appeals-list query failed', error.message);
    return err(res, 500, 'DB_ERROR', 'database query failed');
  }

  return sendJson(res, 200, { appeals: data || [] });
}

async function handleAppealReview(req, res, session) {
  if (!isReviewer(session.login)) {
    return err(res, 403, 'FORBIDDEN', 'You are not authorized to review appeals');
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return err(res, 400, 'BAD_REQUEST', 'invalid JSON body');
  }

  const id = typeof body.id === 'string' ? body.id.trim() : '';
  const status = typeof body.status === 'string' ? body.status.trim() : '';
  const reviewNotes = typeof body.review_notes === 'string' ? body.review_notes.trim() : '';

  if (!id || !status) {
    return err(res, 400, 'BAD_REQUEST', 'id and status are required');
  }
  if (status !== 'approved' && status !== 'rejected') {
    return err(res, 400, 'BAD_REQUEST', 'status must be approved or rejected');
  }

  let sb;
  try {
    sb = getSupabase();
  } catch (e) {
    console.error('exceptions appeal-review: supabase init failed', e && e.message);
    return err(res, 500, 'DB_ERROR', 'database not configured');
  }

  // Fetch the appeal row to verify it is pending
  const { data: appeal, error: getErr } = await sb
    .from('appeals')
    .select('id, status')
    .eq('id', id)
    .maybeSingle();

  if (getErr) {
    console.error('exceptions appeal-review: select failed', getErr.message);
    return err(res, 500, 'DB_ERROR', 'database query failed');
  }
  if (!appeal) {
    return err(res, 404, 'NOT_FOUND', 'appeal not found');
  }
  if (appeal.status !== 'pending') {
    return err(res, 400, 'BAD_REQUEST', `appeal is already in status: ${appeal.status}`);
  }

  const nowStr = new Date().toISOString();
  const { data: updated, error: upErr } = await sb
    .from('appeals')
    .update({
      status,
      reviewed_by: session.login,
      reviewed_at: nowStr,
      review_notes: reviewNotes || null,
    })
    .eq('id', id)
    .select()
    .single();

  if (upErr) {
    console.error('exceptions appeal-review: update failed', upErr.message);
    return err(res, 500, 'DB_ERROR', 'database update failed');
  }

  return sendJson(res, 200, { ok: true, appeal: updated });
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
// Slack Webhook Integration (unauthenticated, checked via signing secret)
// ---------------------------------------------------------------------------

function verifySlackSignature(req, rawBody, secret) {
  if (!secret) return false;
  const signature = req.headers['x-slack-signature'];
  const timestamp = req.headers['x-slack-request-timestamp'];
  if (!signature || !timestamp) return false;

  // Replay attack protection: reject requests older than 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) {
    return false;
  }

  const sigBase = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto.createHmac('sha256', secret).update(sigBase).digest('hex');
  const expected = `v0=${hmac}`;

  try {
    return crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expected, 'utf8'));
  } catch {
    return false;
  }
}

async function handleSlackWebhook(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return err(res, 405, 'METHOD_NOT_ALLOWED', 'only POST method is supported');
    }

    const rawBody = await readRawBody(req);
    const secret = process.env.SLACK_SIGNING_SECRET;

    // Signature verification check. Fail-closed when secret is unset — the
    // previous warn-and-continue path let an attacker who knew the public
    // webhook URL forge approve/deny actions on pending exceptions.
    if (!secret) {
      console.error('Slack webhook: SLACK_SIGNING_SECRET unset — refusing unverified webhook');
      return err(res, 500, 'SLACK_NOT_CONFIGURED', 'slack webhook is not configured: signing secret required');
    }
    if (!verifySlackSignature(req, rawBody, secret)) {
      return err(res, 401, 'UNAUTHORIZED', 'invalid slack signature');
    }

    const params = new URLSearchParams(rawBody);
    const payloadStr = params.get('payload');
    if (!payloadStr) {
      return err(res, 400, 'BAD_REQUEST', 'missing payload parameter');
    }

    let payload;
    try {
      payload = JSON.parse(payloadStr);
    } catch {
      return err(res, 400, 'BAD_REQUEST', 'payload is not valid JSON');
    }

    if (!payload.actions || !Array.isArray(payload.actions) || payload.actions.length === 0) {
      return err(res, 400, 'BAD_REQUEST', 'missing actions in payload');
    }

    const action = payload.actions[0];
    const exceptionId = action.value;
    const actionId = action.action_id; // 'approve' or 'deny'
    const slackUser = payload.user ? (payload.user.name || payload.user.username) : 'slack-user';

    if (!exceptionId || (actionId !== 'approve' && actionId !== 'deny')) {
      return err(res, 400, 'BAD_REQUEST', 'invalid action configuration');
    }

    let sb;
    try {
      sb = getSupabase();
    } catch (e) {
      console.error('Slack webhook: supabase init failed', e && e.message);
      return err(res, 500, 'DB_ERROR', 'database not configured');
    }

    // First fetch the exception row to verify it exists and is still pending
    const { data: row, error: selErr } = await sb
      .from('exceptions')
      .select('id, package_name, owner, repo, status')
      .eq('id', exceptionId)
      .maybeSingle();

    if (selErr) {
      console.error('Slack webhook: select failed', selErr.message);
      return err(res, 500, 'DB_ERROR', 'database query failed');
    }
    if (!row) {
      return err(res, 404, 'NOT_FOUND', 'exception not found');
    }
    if (row.status !== 'pending') {
      return err(res, 400, 'BAD_REQUEST', `exception is already in status: ${row.status}`);
    }

    const nowStr = new Date().toISOString();
    let updatedStatus = 'pending';

    if (actionId === 'approve') {
      updatedStatus = 'approved';
      const secret = process.env.OPENSOYCE_DASHBOARD_SECRET;
      if (!secret) {
        console.error('Slack webhook: OPENSOYCE_DASHBOARD_SECRET unset — refusing to sign with weak fallback');
        return err(res, 500, 'DASHBOARD_NOT_CONFIGURED', 'dashboard is not configured: ledger signature cannot be issued');
      }
      const signature = signExceptionLedger(row.id, row.package_name, `slack:${slackUser}`, row.reason || '', secret);
      const finalReason = `${row.reason || ''}\n--- LEDGER SIGNATURE: ${signature}`;

      const { error: upErr } = await sb
        .from('exceptions')
        .update({
          status: 'approved',
          granted_by: `slack:${slackUser}`,
          reason: finalReason,
        })
        .eq('id', exceptionId);

      if (upErr) {
        console.error('Slack webhook: approve update failed', upErr.message);
        return err(res, 500, 'DB_ERROR', 'database write failed');
      }
    } else {
      updatedStatus = 'denied';
      const { error: upErr } = await sb
        .from('exceptions')
        .update({
          status: 'denied',
          revoked_at: nowStr,
          revoked_by: `slack:${slackUser}`,
        })
        .eq('id', exceptionId);

      if (upErr) {
        console.error('Slack webhook: deny update failed', upErr.message);
        return err(res, 500, 'DB_ERROR', 'database write failed');
      }
    }

    // Respond back to Slack's response_url to update the message in-place
    if (payload.response_url) {
      const decisionText = actionId === 'approve'
        ? `✅ Exception for package *${row.package_name}* has been *approved* by @${slackUser}.`
        : `❌ Exception for package *${row.package_name}* has been *denied* by @${slackUser}.`;

      try {
        await fetch(payload.response_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            replace_original: true,
            text: decisionText,
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: decisionText
                }
              }
            ]
          }),
        });
      } catch (slackErr) {
        console.error('Slack webhook: failed to update message via response_url', slackErr && slackErr.message);
      }
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, status: updatedStatus }));
  } catch (errVal) {
    console.error('Slack webhook: unhandled error', errVal && errVal.stack ? errVal.stack : errVal);
    if (!res.headersSent) {
      return err(res, 500, 'INTERNAL_ERROR', 'unexpected server error');
    }
  }
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
    if (method === 'POST' && action === 'slack-webhook') return await handleSlackWebhook(req, res);
    if (method === 'GET' && action === 'compliance-evidence') return await handleComplianceEvidence(req, res);
    if (method === 'POST' && action === 'compliance-gate') return await handleComplianceGate(req, res);
    if (method === 'GET' && action === 'cron-update-registry') return await handleCronUpdateRegistry(req, res);

    // Auth-gated branches.
    const session = verifyDashboardSession(req);
    if (!session) return err(res, 401, 'AUTH_REQUIRED', 'a valid dashboard session is required');

    if (method === 'POST' && action === 'compliance-token-mint') return await handleComplianceTokenMint(req, res, session);
    if (method === 'POST' && action === 'submit-appeal') return await handleSubmitAppeal(req, res, session);
    if (method === 'GET' && action === 'appeals-list') return await handleAppealsList(req, res, session);
    if (method === 'POST' && action === 'appeal-review') return await handleAppealReview(req, res, session);
    if (method === 'GET' && action === 'compliance-report') return await handleComplianceReport(req, res, session);
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
