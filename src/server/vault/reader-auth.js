// OpenSoyce Trust Vault (PR-17C) — reader authentication.
//
// DOCTRINE: the API exposes records; it does not create new trust
// conclusions. Make the record portable, not more opinionated.
//
// Two ways to READ, one middleware:
//   1. Browser/CLI session (cookie) — the existing requireVaultSession
//      path, unchanged semantics.
//   2. Read-only API token — `Authorization: Bearer osy_<hex>`. The raw
//      token is hashed (SHA-256) and matched against vault_api_tokens;
//      revoked tokens fail closed. The token attaches req.vaultApiToken
//      and NEVER req.vaultSession — a token is a workspace-scoped read
//      credential, not a person.
//
// READ-ONLY BY CONSTRUCTION: this middleware is mounted ONLY on read
// routes. No write route consults token auth, so a token cannot write
// anything — the scope column is belt; the routing is suspenders.

import crypto from 'node:crypto';
import { vaultDb } from './db.js';
import { sendError, ERROR_CODES } from './errors.js';
import { requireVaultSession } from './auth.js';
import { resolveWorkspaceForMember, findActiveWorkspaceBySlug } from './rbac.js';

export const API_TOKEN_PREFIX = 'osy_';

export function hashApiToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

/** Mint a new raw token. Returned once; only the hash is ever stored. */
export function mintApiToken() {
  return API_TOKEN_PREFIX + crypto.randomBytes(20).toString('hex');
}

function readBearerToken(req) {
  const header = req.headers && req.headers.authorization;
  if (typeof header !== 'string') return null;
  const m = header.match(/^Bearer\s+(\S+)$/i);
  if (!m) return null;
  return m[1].startsWith(API_TOKEN_PREFIX) ? m[1] : null;
}

/**
 * Require a reader: a valid session OR a valid read-only API token.
 * Token path attaches req.vaultApiToken = { token_id, workspace_id,
 * token_name, scope }. Session path defers to requireVaultSession.
 */
export async function requireVaultReader(req, res, next) {
  const raw = readBearerToken(req);
  if (!raw) {
    // No bearer token — the session path owns the response (including
    // the 401 when neither credential is present).
    return requireVaultSession(req, res, next);
  }
  let supabase;
  try {
    supabase = vaultDb();
  } catch {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault database is not configured');
  }
  const { data: rows, error } = await supabase
    .from('vault_api_tokens')
    .select('token_id, workspace_id, token_name, scope, revoked_at')
    .eq('token_hash', hashApiToken(raw))
    .limit(1);
  if (error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'API token lookup failed');
  }
  const row = Array.isArray(rows) && rows[0];
  if (!row || row.revoked_at) {
    return sendError(res, 401, ERROR_CODES.auth_required, 'invalid or revoked API token');
  }
  // Best-effort usage stamp — a failure here never blocks the read.
  await supabase
    .from('vault_api_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('token_id', row.token_id);
  req.vaultApiToken = {
    token_id: row.token_id,
    workspace_id: row.workspace_id,
    token_name: row.token_name,
    scope: row.scope,
  };
  next();
}

/**
 * Resolve the workspace for a reader. Session readers go through the
 * existing membership resolution (404-on-non-member). Token readers are
 * workspace-scoped credentials: the route's slug must resolve to the
 * token's OWN workspace — anything else is the same indistinguishable
 * 404. Returns { workspace, reader } or sends the response and returns
 * null.
 */
export async function resolveWorkspaceForReader(req, res, slug) {
  if (req.vaultApiToken) {
    const { workspace, error } = await findActiveWorkspaceBySlug(slug);
    if (error) {
      sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault workspace lookup failed');
      return null;
    }
    if (!workspace || workspace.workspace_id !== req.vaultApiToken.workspace_id) {
      sendError(res, 404, ERROR_CODES.not_found, 'not found');
      return null;
    }
    return { workspace, reader: { kind: 'api_token', token_name: req.vaultApiToken.token_name } };
  }
  const resolved = await resolveWorkspaceForMember(req, res, slug);
  if (!resolved) return null;
  return { workspace: resolved.workspace, membership: resolved.membership, reader: { kind: 'session' } };
}
