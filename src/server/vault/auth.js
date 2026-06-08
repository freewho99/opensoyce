// OpenSoyce Trust Vault — session middleware.
//
// PR-V2-A. Per PR-V1-A §2.1 + PR-V1-B §2.4.
//
// Session model:
//   - Opaque server-side session_id stored in `vault_sessions` row.
//   - HttpOnly + Secure + SameSite=Lax cookie named opensoyce_vault_session
//     carries the session_id to the client.
//   - Sliding 30-day expires_at; refreshed on every authenticated request.
//   - Instant revocation via DELETE on the row.
//
// Behavior:
//   - No cookie OR cookie missing on the request -> 401 auth-required.
//   - Cookie present but no matching session row -> 401 auth-required.
//   - Session expired -> delete the row + 401 auth-required.
//   - Valid -> advance last_seen_at, expires_at; attach { user_id, github_login }
//     to req.vaultSession.

import { vaultDb } from './db.js';
import { sendError, ERROR_CODES } from './errors.js';

const COOKIE_NAME = 'opensoyce_vault_session';
const SESSION_TTL_SEC = 30 * 24 * 60 * 60;

export function vaultCookieName() {
  return COOKIE_NAME;
}

export function sessionTtlSeconds() {
  return SESSION_TTL_SEC;
}

function readCookie(req, name) {
  const header = req.headers && req.headers.cookie;
  if (typeof header !== 'string' || header.length === 0) return null;
  const parts = header.split(';');
  for (const raw of parts) {
    const pair = raw.trim();
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const key = pair.slice(0, eq);
    if (key === name) {
      return decodeURIComponent(pair.slice(eq + 1));
    }
  }
  return null;
}

export function clearVaultCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
  );
}

export function setVaultCookie(res, sessionId) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SEC}`,
  );
}

/**
 * Require a valid Vault session. Attach { session_id, user_id, github_login }
 * to req.vaultSession on success. 401 on any failure.
 */
export async function requireVaultSession(req, res, next) {
  const sessionId = readCookie(req, COOKIE_NAME);
  if (!sessionId) {
    return sendError(res, 401, ERROR_CODES.auth_required, 'log in to access /api/vault');
  }
  let supabase;
  try {
    supabase = vaultDb();
  } catch {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault database is not configured');
  }
  const { data: rows, error } = await supabase
    .from('vault_sessions')
    .select('session_id, user_id, expires_at, vault_users:user_id(github_login)')
    .eq('session_id', sessionId)
    .limit(1);
  if (error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault session lookup failed');
  }
  const row = Array.isArray(rows) && rows[0];
  if (!row) {
    return sendError(res, 401, ERROR_CODES.auth_required, 'session not found');
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await supabase.from('vault_sessions').delete().eq('session_id', sessionId);
    return sendError(res, 401, ERROR_CODES.auth_required, 'session expired');
  }
  const nextExpiresAt = new Date(Date.now() + SESSION_TTL_SEC * 1000).toISOString();
  await supabase
    .from('vault_sessions')
    .update({ last_seen_at: new Date().toISOString(), expires_at: nextExpiresAt })
    .eq('session_id', sessionId);

  const githubLogin = row.vault_users && row.vault_users.github_login;
  req.vaultSession = {
    session_id: row.session_id,
    user_id: row.user_id,
    github_login: githubLogin || null,
  };
  next();
}
