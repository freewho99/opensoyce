-- OpenSoyce Trust Vault — vault_idempotency_keys table.
--
-- PR-V2-B. Per PR-V1-C §7.
--
-- Optional client-supplied idempotency_key per mutating POST. The
-- (workspace_id, idempotency_key) tuple uniquely identifies a request;
-- on retry within the 24-hour TTL, the server returns the same
-- response_snapshot it returned on the original call. The state machine
-- is NOT re-evaluated.
--
-- The reaper job that deletes WHERE created_at < now() - interval '24 hours'
-- is operationally scheduled; the application reads stay correct because
-- the application always filters by (created_at >= now() - 24h) on lookup.

create table if not exists public.vault_idempotency_keys (
  idempotency_id      uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.vault_workspaces(workspace_id) on delete cascade,
  user_id             uuid not null references public.vault_users(user_id) on delete restrict,
  idempotency_key     text not null check (length(idempotency_key) between 1 and 128),
  request_route       text not null,
  response_status     int not null,
  response_snapshot   jsonb not null,
  created_at          timestamptz not null default now(),
  unique (workspace_id, idempotency_key)
);

create index if not exists vault_idempotency_workspace_created_idx
  on public.vault_idempotency_keys (workspace_id, created_at desc);

alter table public.vault_idempotency_keys enable row level security;

-- Deny-by-default. Service role bypasses; idempotency lookups are
-- server-side only and scoped per (workspace_id, idempotency_key).
