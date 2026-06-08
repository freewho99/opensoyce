-- OpenSoyce Trust Vault — vault_workspace_memberships table + last-owner trigger.
--
-- PR-V2-A. Per PR-V1-B §2.3 + PR-V1-A §4.2.
--
-- Invariants (enforced at the SQL layer, not just at the API):
--   - Unique (workspace_id, user_id) — one role per user per workspace.
--   - At least one active owner per workspace at all times. The
--     last_owner_protection trigger blocks UPDATE/DELETE that would leave
--     the workspace ownerless.
--   - member_status lifecycle: created -> active -> suspended/removed.

create table if not exists public.vault_workspace_memberships (
  membership_id   uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.vault_workspaces(workspace_id) on delete cascade,
  user_id         uuid not null references public.vault_users(user_id) on delete restrict,
  role            text not null check (role in ('member','reviewer','owner')),
  member_status   text not null default 'active'
                    check (member_status in ('created','active','suspended','removed')),
  added_at        timestamptz not null default now(),
  added_by        uuid not null references public.vault_users(user_id) on delete restrict,
  removed_at      timestamptz,
  removed_by      uuid references public.vault_users(user_id) on delete restrict,
  unique (workspace_id, user_id)
);

create index if not exists vault_memberships_user_status_idx
  on public.vault_workspace_memberships (user_id, member_status);

create index if not exists vault_memberships_workspace_role_idx
  on public.vault_workspace_memberships (workspace_id, role)
  where member_status = 'active';

-- Last-owner-leaves protection (PR-V1-A §4.2).
-- A workspace must always have at least one active owner. Any UPDATE that
-- would change the only remaining active-owner row to a non-owner role or
-- a non-active status — or any DELETE on the last active-owner row — is
-- rejected.
create or replace function public.vault_protect_last_owner()
returns trigger
language plpgsql
as $$
declare
  remaining_active_owners int;
  target_workspace_id uuid;
begin
  if tg_op = 'DELETE' then
    target_workspace_id := old.workspace_id;
  else
    target_workspace_id := new.workspace_id;
    -- If the row stays active and stays owner, no possible last-owner change.
    if new.role = 'owner' and new.member_status = 'active' then
      return new;
    end if;
  end if;

  -- Count active owners in the workspace AFTER the proposed change. For
  -- DELETE we count rows other than the deleted one. For UPDATE we count
  -- rows other than the one being updated and add 1 if the new state is
  -- still an active owner.
  select count(*)
    into remaining_active_owners
    from public.vault_workspace_memberships m
    where m.workspace_id = target_workspace_id
      and m.role = 'owner'
      and m.member_status = 'active'
      and m.membership_id <> coalesce(new.membership_id, old.membership_id);

  if tg_op = 'UPDATE' and new.role = 'owner' and new.member_status = 'active' then
    remaining_active_owners := remaining_active_owners + 1;
  end if;

  if remaining_active_owners = 0 then
    raise exception 'vault: workspace % cannot lose its last active owner', target_workspace_id
      using errcode = 'check_violation';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists vault_memberships_last_owner_protection on public.vault_workspace_memberships;
create trigger vault_memberships_last_owner_protection
  before update or delete on public.vault_workspace_memberships
  for each row execute function public.vault_protect_last_owner();

alter table public.vault_workspace_memberships enable row level security;

-- Deny-by-default. Service role bypasses; application layer enforces the
-- per-request role check via the rbac module.
