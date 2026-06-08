// OpenSoyce Trust Vault — workspace + me handlers.
//
// PR-V2-A. Per PR-V1-A §3 + PR-V1-A §6.1 + PR-V1-D §2 (404 doctrine).
//
// Routes implemented:
//   GET  /api/vault/me                  — return { user, workspaces }
//   POST /api/vault/workspaces          — create workspace; caller becomes owner
//   GET  /api/vault/workspaces/:slug    — workspace metadata + member list
//
// All routes require a vault session (see auth.js). Reads collapse 404
// cases to a single shape per PR-V1-D §2.

import { vaultDb } from './db.js';
import { sendError, ERROR_CODES } from './errors.js';
import { resolveWorkspaceForMember, ROLE_RANK } from './rbac.js';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

function publicWorkspaceShape(workspace) {
  return {
    workspace_id: workspace.workspace_id,
    slug: workspace.slug,
    display_name: workspace.display_name,
    created_at: workspace.created_at,
  };
}

function publicMembershipShape(membership) {
  return {
    role: membership.role,
    added_at: membership.added_at,
  };
}

export async function handleVaultMe(req, res) {
  const session = req.vaultSession;
  if (!session) {
    return sendError(res, 401, ERROR_CODES.auth_required, 'log in to access /api/vault/me');
  }
  let supabase;
  try {
    supabase = vaultDb();
  } catch {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault database is not configured');
  }

  const { data: memberships, error } = await supabase
    .from('vault_workspace_memberships')
    .select('role, member_status, added_at, vault_workspaces:workspace_id(workspace_id, slug, display_name, deleted_at)')
    .eq('user_id', session.user_id)
    .eq('member_status', 'active');
  if (error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault workspace list failed');
  }

  const workspaces = (Array.isArray(memberships) ? memberships : [])
    .filter((m) => m.vault_workspaces && !m.vault_workspaces.deleted_at)
    .map((m) => ({
      ...publicWorkspaceShape(m.vault_workspaces),
      role: m.role,
    }));

  res.status(200).json({
    user: { user_id: session.user_id, github_login: session.github_login },
    workspaces,
  });
}

export async function handleVaultCreateWorkspace(req, res) {
  const session = req.vaultSession;
  if (!session) {
    return sendError(res, 401, ERROR_CODES.auth_required, 'log in to create workspaces');
  }

  const body = req.body || {};
  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
  const displayName = typeof body.display_name === 'string' ? body.display_name.trim() : '';

  if (!SLUG_RE.test(slug)) {
    return sendError(
      res,
      400,
      ERROR_CODES.workspace_slug_invalid,
      'slug must be URL-safe (lowercase letters, digits, hyphens; 3-64 chars)',
    );
  }
  if (displayName.length < 1 || displayName.length > 200) {
    return sendError(
      res,
      400,
      ERROR_CODES.workspace_display_name_invalid,
      'display_name must be 1-200 chars',
    );
  }

  let supabase;
  try {
    supabase = vaultDb();
  } catch {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault database is not configured');
  }

  // Atomic workspace + owner-membership creation via Postgres function
  // (migration 0013). The PL/pgSQL function body runs in a single implicit
  // transaction — either both rows commit or neither does. No partially-
  // created workspace can ever exist. The previous shape (two separate
  // INSERTs + best-effort DELETE rollback) was reviewer-flagged as a
  // foundation-level race; this RPC closes it.
  const { data: rpcRows, error: rpcError } = await supabase.rpc(
    'vault_create_workspace_with_owner',
    {
      p_slug: slug,
      p_display_name: displayName,
      p_user_id: session.user_id,
    },
  );
  if (rpcError) {
    // Postgres SQLSTATE 23505 = unique_violation. The slug CHECK + slug-taken
    // race both surface as this. Map honestly to 409 + workspace-slug-taken.
    if (rpcError.code === '23505') {
      return sendError(res, 409, ERROR_CODES.workspace_slug_taken, 'slug already taken');
    }
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault workspace create failed');
  }
  const row = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
  if (!row || !row.workspace_id) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault workspace create returned no row');
  }

  res.status(201).json({
    ...publicWorkspaceShape(row),
    role: 'owner',
  });
}

export async function handleVaultGetWorkspace(req, res) {
  const slug = (req.params && req.params.slug) || '';
  const resolved = await resolveWorkspaceForMember(req, res, slug);
  if (!resolved) return;
  const { workspace, membership } = resolved;
  let supabase;
  try {
    supabase = vaultDb();
  } catch {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault database is not configured');
  }
  const { data: members, error } = await supabase
    .from('vault_workspace_memberships')
    .select('role, member_status, added_at, vault_users:user_id(github_login)')
    .eq('workspace_id', workspace.workspace_id)
    .eq('member_status', 'active');
  if (error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault member list failed');
  }
  const memberList = (Array.isArray(members) ? members : [])
    .map((m) => ({
      role: m.role,
      added_at: m.added_at,
      github_login: m.vault_users && m.vault_users.github_login,
    }))
    .sort((a, b) => (ROLE_RANK[b.role] || 0) - (ROLE_RANK[a.role] || 0));

  res.status(200).json({
    ...publicWorkspaceShape(workspace),
    membership: publicMembershipShape(membership),
    members: memberList,
  });
}
