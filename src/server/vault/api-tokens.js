// OpenSoyce Trust Vault (PR-17C) — read-only API token management.
//
// DOCTRINE: a token is a workspace-scoped READ credential, not a person
// and not a writer. The raw token is shown exactly once at mint; only
// its SHA-256 hash is stored. Revocation is immediate (revoked_at).
//
// Owner-gated: minting or revoking a machine credential is a workspace
// administration decision, like membership changes.

import { vaultDb } from './db.js';
import { sendError, ERROR_CODES } from './errors.js';
import { resolveWorkspaceForMember, requireRole } from './rbac.js';
import { mintApiToken, hashApiToken } from './reader-auth.js';

const MAX_TOKENS_PER_WORKSPACE = 20;

function shapeTokenRow(row) {
  if (!row) return null;
  return {
    token_id: row.token_id,
    workspace_id: row.workspace_id,
    token_name: row.token_name,
    scope: row.scope,
    created_by: row.created_by_user
      ? {
        user_id: row.created_by_user.user_id,
        github_login: row.created_by_user.github_login,
        display_name: row.created_by_user.display_name || null,
      }
      : null,
    created_at: row.created_at,
    last_used_at: row.last_used_at || null,
    revoked_at: row.revoked_at || null,
    visibility: 'private',
  };
}

const TOKEN_SELECT =
  'token_id, workspace_id, token_name, scope, created_at, last_used_at, revoked_at,'
  + ' created_by_user:created_by(user_id, github_login, display_name)';

/**
 * GET /api/vault/workspaces/:slug/api-tokens
 * Owner-level list. The hash never leaves the database row shape.
 */
export async function handleListApiTokens(req, res) {
  const slug = (req.params && req.params.slug) || '';
  const resolved = await resolveWorkspaceForMember(req, res, slug);
  if (!resolved) return;
  const { workspace, membership } = resolved;
  if (!requireRole(res, membership, 'owner')) return;

  const supabase = vaultDb();
  const { data, error } = await supabase
    .from('vault_api_tokens')
    .select(TOKEN_SELECT)
    .eq('workspace_id', workspace.workspace_id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'API token list failed');
  }
  res.status(200).json({
    tokens: (Array.isArray(data) ? data : []).map(shapeTokenRow),
    visibility: 'private',
  });
}

/**
 * POST /api/vault/workspaces/:slug/api-tokens   { token_name }
 *
 * Mint a read-only token. The response carries the RAW token exactly
 * once; it is never stored and can never be retrieved again.
 */
export async function handleMintApiToken(req, res) {
  const slug = (req.params && req.params.slug) || '';
  const resolved = await resolveWorkspaceForMember(req, res, slug);
  if (!resolved) return;
  const { workspace, membership } = resolved;
  if (!requireRole(res, membership, 'owner')) return;

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const tokenName = typeof body.token_name === 'string' ? body.token_name.trim() : '';
  if (tokenName.length < 1 || tokenName.length > 80) {
    return sendError(res, 400, ERROR_CODES.bad_request, 'token_name is required (1-80 characters)');
  }

  const supabase = vaultDb();
  const { count, error: countError } = await supabase
    .from('vault_api_tokens')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspace.workspace_id)
    .is('revoked_at', null);
  if (countError) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'API token count failed');
  }
  if (typeof count === 'number' && count >= MAX_TOKENS_PER_WORKSPACE) {
    return sendError(res, 400, ERROR_CODES.bad_request,
      `a workspace carries at most ${MAX_TOKENS_PER_WORKSPACE} active tokens — revoke one first`);
  }

  const rawToken = mintApiToken();
  const { data: inserted, error: insertError } = await supabase
    .from('vault_api_tokens')
    .insert({
      workspace_id: workspace.workspace_id,
      token_name: tokenName,
      token_hash: hashApiToken(rawToken),
      scope: 'read',
      created_by: req.vaultSession.user_id,
    })
    .select(TOKEN_SELECT)
    .limit(1);
  if (insertError) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'API token mint failed');
  }
  res.status(201).json({
    token: shapeTokenRow(Array.isArray(inserted) && inserted[0]),
    // Shown ONCE. Not stored. Not retrievable.
    raw_token: rawToken,
    raw_token_notice: 'Store this token now — it is shown once and cannot be retrieved again.',
    visibility: 'private',
  });
}

/**
 * POST /api/vault/workspaces/:slug/api-tokens/:id/revoke
 * Immediate revocation; idempotent (revoking a revoked token is a no-op
 * that still returns the row).
 */
export async function handleRevokeApiToken(req, res) {
  const slug = (req.params && req.params.slug) || '';
  const tokenId = (req.params && req.params.id) || '';
  const resolved = await resolveWorkspaceForMember(req, res, slug);
  if (!resolved) return;
  const { workspace, membership } = resolved;
  if (!requireRole(res, membership, 'owner')) return;

  const supabase = vaultDb();
  const { data: existing, error: lookupError } = await supabase
    .from('vault_api_tokens')
    .select('token_id, revoked_at')
    .eq('workspace_id', workspace.workspace_id)
    .eq('token_id', tokenId)
    .limit(1);
  if (lookupError) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'API token lookup failed');
  }
  if (!(Array.isArray(existing) && existing[0])) {
    return sendError(res, 404, ERROR_CODES.not_found, 'not found');
  }
  if (existing[0].revoked_at) {
    const { data } = await supabase
      .from('vault_api_tokens').select(TOKEN_SELECT)
      .eq('token_id', tokenId).limit(1);
    return res.status(200).json({ token: shapeTokenRow(Array.isArray(data) && data[0]), visibility: 'private' });
  }
  const { data: updated, error: updateError } = await supabase
    .from('vault_api_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('workspace_id', workspace.workspace_id)
    .eq('token_id', tokenId)
    .select(TOKEN_SELECT)
    .limit(1);
  if (updateError) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'API token revoke failed');
  }
  res.status(200).json({ token: shapeTokenRow(Array.isArray(updated) && updated[0]), visibility: 'private' });
}
