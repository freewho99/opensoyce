-- OpenSoyce Trust Vault — vault_create_workspace_with_owner() Postgres function.
--
-- Follow-up to PR-V2-A (#78). Reviewer-flagged blocker: workspace creation
-- in handleVaultCreateWorkspace was NOT atomic. The previous shape inserted
-- vault_workspaces, then SEPARATELY inserted vault_workspace_memberships,
-- with a best-effort DELETE rollback on the second-insert failure path.
-- That left a hole: if the membership insert failed AND the rollback DELETE
-- also failed (or the process crashed between the two), the workspace
-- existed without an owner. The last-owner-protection trigger from
-- migration 0008 only fires on UPDATE/DELETE on memberships — it cannot
-- prevent a workspace from being created without its first owner.
--
-- This function moves both INSERTs into a single PL/pgSQL function body,
-- which Postgres runs as one implicit transaction. Either both rows commit
-- or neither does. The application layer (src/server/vault/workspaces.js)
-- calls this function via Supabase RPC instead of doing two separate
-- inserts.

create or replace function public.vault_create_workspace_with_owner(
  p_slug         text,
  p_display_name text,
  p_user_id      uuid
)
returns table (
  workspace_id uuid,
  slug         text,
  display_name text,
  created_at   timestamptz
)
language plpgsql
as $$
declare
  v_workspace_id uuid;
  v_created_at   timestamptz;
begin
  if p_user_id is null then
    raise exception 'vault_create_workspace_with_owner: p_user_id required'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_slug is null or length(p_slug) = 0 then
    raise exception 'vault_create_workspace_with_owner: p_slug required'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_display_name is null or length(p_display_name) = 0 then
    raise exception 'vault_create_workspace_with_owner: p_display_name required'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Insert the workspace row. The slug + display_name CHECK constraints from
  -- migration 0007 apply here; bad inputs surface as 23514 check_violation.
  -- Slug uniqueness surfaces as 23505 unique_violation; the application
  -- layer maps that to workspace-slug-taken (409).
  insert into public.vault_workspaces (slug, display_name, created_by)
  values (p_slug, p_display_name, p_user_id)
  returning public.vault_workspaces.workspace_id, public.vault_workspaces.created_at
    into v_workspace_id, v_created_at;

  -- Insert the initial owner membership atomically with the workspace.
  -- If this insert fails, the transaction aborts and the workspace insert
  -- above rolls back too. No ownerless workspace can ever exist.
  insert into public.vault_workspace_memberships (
    workspace_id, user_id, role, member_status, added_by
  ) values (
    v_workspace_id, p_user_id, 'owner', 'active', p_user_id
  );

  return query
    select v_workspace_id, p_slug, p_display_name, v_created_at;
end;
$$;

comment on function public.vault_create_workspace_with_owner(text, text, uuid) is
  'OpenSoyce Trust Vault — atomic workspace + owner-membership creation. Application code (src/server/vault/workspaces.js) MUST call this RPC instead of doing two separate inserts. Asserted by scripts/test-vault-auth-v0.mjs.';
