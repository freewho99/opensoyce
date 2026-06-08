-- OpenSoyce Trust Vault — vault_exceptions table.
--
-- PR-V2-A. Per PR-V1-B §2.6.
--
-- The exception shape from Trust Vault ADR (#67) §1.2. The state machine
-- itself + the mutating API endpoints ship in PR-V2-B; this PR only adds
-- the table so the foundation exists.
--
-- Severity-downgrade-only invariant (PR-V1-C §1) is enforced at the SQL
-- CHECK level: exceptions can transition BLOCK -> WARN/ALLOW or WARN ->
-- ALLOW, never upgrade severity.

create table if not exists public.vault_exceptions (
  exception_id        uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.vault_workspaces(workspace_id) on delete cascade,
  subject_kind        text not null check (subject_kind in ('package','repo')),
  subject_name        text not null,
  subject_version_set jsonb,
  original_action     text not null check (original_action in ('BLOCK','WARN')),
  allowed_action      text not null check (allowed_action in ('WARN','ALLOW')),
  state               text not null default 'proposed'
                        check (state in ('proposed','reviewed','active','rejected','revoked','expired')),
  proposed_by         uuid not null references public.vault_users(user_id) on delete restrict,
  proposed_at         timestamptz not null default now(),
  reviewed_by         uuid references public.vault_users(user_id) on delete restrict,
  reviewed_at         timestamptz,
  expires_at          timestamptz,
  reason_public       text check (length(reason_public) between 1 and 280),
  reason_private      text,
  proof_anchors       jsonb not null,
  revoked_at          timestamptz,
  revoked_by          uuid references public.vault_users(user_id) on delete restrict,
  revoke_reason       text,
  constraint vault_exceptions_proof_anchors_valid
    check (public.validate_proof_anchors(proof_anchors)),

  -- Active rows must have expires_at + reason_public.
  constraint vault_exceptions_active_requires_expiry check (
    state <> 'active'
    or (expires_at is not null and reason_public is not null)
  ),

  -- Severity-downgrade-only (PR-V1-C §1, also surfaced in §4.2 of the ADR).
  -- BLOCK can become WARN or ALLOW. WARN can only become ALLOW. ALLOW
  -- cannot have an exception filed against it at all (no row would have
  -- original_action = 'ALLOW' since exceptions accept risk, not invent it).
  constraint vault_exceptions_downgrade_only check (
    (original_action = 'BLOCK' and allowed_action in ('WARN','ALLOW'))
    or (original_action = 'WARN' and allowed_action = 'ALLOW')
  )
);

create index if not exists vault_exceptions_workspace_state_expires_idx
  on public.vault_exceptions (workspace_id, state, expires_at);

create index if not exists vault_exceptions_workspace_subject_state_idx
  on public.vault_exceptions (workspace_id, subject_kind, subject_name, state);

create index if not exists vault_exceptions_active_expires_idx
  on public.vault_exceptions (expires_at)
  where state = 'active';

create index if not exists vault_exceptions_proposed_by_idx
  on public.vault_exceptions (proposed_by);

alter table public.vault_exceptions enable row level security;

-- Deny-by-default. The mutating endpoints + the four-eye principle + the
-- state-machine row-lock semantics are PR-V2-B's scope. PR-V2-A only
-- creates the table so PR-V2-B has somewhere to write.
