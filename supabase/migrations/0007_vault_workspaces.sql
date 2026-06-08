-- OpenSoyce Trust Vault — vault_workspaces table.
--
-- PR-V2-A. Per PR-V1-B §2.2.
--
-- Workspaces are the multi-tenant unit. slug is immutable and URL-safe;
-- display_name is mutable for UI. Soft-delete via deleted_at + 30-day
-- hard_delete_at window (PR-V1-A §4.2, PR-V1-B §4.1). The reaper that
-- transitions soft-deleted -> hard-deleted is a separate scheduled job,
-- not in PR-V2-A scope.

create table if not exists public.vault_workspaces (
  workspace_id            uuid primary key default gen_random_uuid(),
  slug                    text not null unique
                            check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  display_name            text not null check (length(display_name) between 1 and 200),
  created_by              uuid not null references public.vault_users(user_id) on delete restrict,
  created_at              timestamptz not null default now(),
  deleted_at              timestamptz,
  hard_delete_at          timestamptz,
  display_name_updated_at timestamptz,

  -- Soft-delete window invariant: when deleted_at is set, hard_delete_at must
  -- be exactly 30 days later (PR-V1-B §4.1). Application code sets both
  -- columns atomically; this CHECK catches a stray write that bypassed.
  constraint workspaces_soft_delete_window check (
    (deleted_at is null and hard_delete_at is null)
    or (deleted_at is not null and hard_delete_at = deleted_at + interval '30 days')
  )
);

create index if not exists vault_workspaces_created_by_idx
  on public.vault_workspaces (created_by);

create index if not exists vault_workspaces_deleted_at_idx
  on public.vault_workspaces (deleted_at)
  where deleted_at is not null;

alter table public.vault_workspaces enable row level security;

-- Deny-by-default. Service role bypasses; the server-side workspace handler
-- performs the membership lookup before returning any data.
