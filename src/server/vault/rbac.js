// OpenSoyce Trust Vault — 4-role RBAC + workspace lookup.
//
// PR-V2-A. Per PR-V1-A §5.2 + PR-V1-D §2.1 (404-on-non-member doctrine).
//
// Roles, in increasing privilege:
//   public_visitor < member < reviewer < owner
//
// All four are workspace-scoped except public_visitor (which is the no-
// membership state). Membership-existence is never leaked via 403; the
// caller gets 404 for the same response shape whether the workspace
// doesn't exist OR they're not a member OR the workspace is soft-deleted.

import { vaultDb } from './db.js';
import { sendError, ERROR_CODES } from './errors.js';

export const ROLE_RANK = Object.freeze({
  member: 1,
  reviewer: 2,
  owner: 3,
});

export function roleAllows(actualRole, requiredRole) {
  const a = ROLE_RANK[actualRole];
  const r = ROLE_RANK[requiredRole];
  if (!a || !r) return false;
  return a >= r;
}

/**
 * Look up the active workspace by slug. Returns null if the workspace does
 * not exist OR is soft-deleted. Soft-deleted workspaces remain visible to
 * owners during the 30-day window — but that handling lives in the route
 * handler when needed; for read paths the workspace is "gone".
 */
export async function findActiveWorkspaceBySlug(slug) {
  const supabase = vaultDb();
  const { data, error } = await supabase
    .from('vault_workspaces')
    .select('workspace_id, slug, display_name, created_at, created_by, deleted_at')
    .eq('slug', slug)
    .is('deleted_at', null)
    .limit(1);
  if (error) return { error };
  const row = Array.isArray(data) && data[0];
  return { workspace: row || null };
}

/**
 * Find the active membership a user holds in a workspace. Returns null for
 * non-member, removed/suspended, or no-workspace cases.
 */
export async function findActiveMembership(workspaceId, userId) {
  const supabase = vaultDb();
  const { data, error } = await supabase
    .from('vault_workspace_memberships')
    .select('membership_id, role, member_status')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .limit(1);
  if (error) return { error };
  const row = Array.isArray(data) && data[0];
  if (!row) return { membership: null };
  if (row.member_status !== 'active') return { membership: null };
  return { membership: row };
}

/**
 * Resolve { workspace, membership } for the calling user against `slug`, OR
 * send a 404 if the user has no claim to see anything. Always returns 404
 * (not 403) when membership is missing to avoid existence leakage.
 *
 * On success, returns { workspace, membership }.
 * On failure, sends the response and returns null.
 */
export async function resolveWorkspaceForMember(req, res, slug) {
  if (!req.vaultSession) {
    sendError(res, 401, ERROR_CODES.auth_required, 'log in to access /api/vault');
    return null;
  }
  const { workspace, error: wsError } = await findActiveWorkspaceBySlug(slug);
  if (wsError) {
    sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault workspace lookup failed');
    return null;
  }
  if (!workspace) {
    sendError(res, 404, ERROR_CODES.not_found, 'not found');
    return null;
  }
  const { membership, error: memError } = await findActiveMembership(
    workspace.workspace_id,
    req.vaultSession.user_id,
  );
  if (memError) {
    sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault membership lookup failed');
    return null;
  }
  if (!membership) {
    sendError(res, 404, ERROR_CODES.not_found, 'not found');
    return null;
  }
  return { workspace, membership };
}

/**
 * Require the resolved membership to have at least `requiredRole`. Sends
 * 403 forbidden-role with the actual role echoed back for the client to
 * render an honest "promote your role" prompt.
 */
export function requireRole(res, membership, requiredRole) {
  if (roleAllows(membership.role, requiredRole)) return true;
  sendError(res, 403, ERROR_CODES.forbidden_role, `requires role >= ${requiredRole}`, {
    role: membership.role,
  });
  return false;
}
