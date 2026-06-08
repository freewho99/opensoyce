-- OpenSoyce Trust Vault — vault_timeline_events table.
--
-- PR-V2-A. Per PR-V1-B §2.7 + PR-V1-D §3 + PR-V1-D §5.
--
-- Per-workspace append-only audit log. Triggers from vault_exceptions
-- / vault_evidence / vault_workspaces / vault_workspace_memberships
-- write rows here; clients read via the future PR-V2-C Timeline API.
-- PR-V2-A creates only the schema; the triggers and read API ship later.
--
-- visibility is locked to 'private' at the SQL CHECK level. The public
-- /proof/timeline surface NEVER reads from this table. The implementation
-- module that exposes this table to clients (PR-V2-C) will be in
-- src/server/vault/ — outside the public-spine import allowlist.

create table if not exists public.vault_timeline_events (
  event_id              uuid primary key default gen_random_uuid(),
  workspace_id          uuid not null references public.vault_workspaces(workspace_id) on delete cascade,
  event_type            text not null check (event_type in (
                          'exception_proposed',
                          'exception_approved',
                          'exception_rejected',
                          'exception_revoked',
                          'exception_expired',
                          'exception_extended',
                          'private_evidence_captured',
                          'private_evidence_redacted',
                          'workspace_created',
                          'workspace_renamed',
                          'workspace_soft_deleted',
                          'workspace_owner_transferred',
                          'member_added',
                          'member_promoted',
                          'member_demoted',
                          'member_suspended',
                          'member_removed'
                        )),
  subject_evidence_id   uuid references public.vault_evidence(evidence_id) on delete set null,
  subject_exception_id  uuid references public.vault_exceptions(exception_id) on delete set null,
  subject_membership_id uuid references public.vault_workspace_memberships(membership_id) on delete set null,
  summary               text not null check (length(summary) between 1 and 280),
  references_json       jsonb not null,
  visibility            text not null default 'private'
                          check (visibility = 'private'),
  emitted_at            timestamptz not null default now(),
  emitted_by            uuid references public.vault_users(user_id) on delete restrict,
  constraint vault_timeline_references_valid
    check (public.validate_proof_anchors(references_json))
);

create index if not exists vault_timeline_workspace_emitted_idx
  on public.vault_timeline_events (workspace_id, emitted_at desc);

create index if not exists vault_timeline_workspace_type_emitted_idx
  on public.vault_timeline_events (workspace_id, event_type, emitted_at desc);

create index if not exists vault_timeline_subject_exception_idx
  on public.vault_timeline_events (subject_exception_id);

create index if not exists vault_timeline_subject_evidence_idx
  on public.vault_timeline_events (subject_evidence_id);

alter table public.vault_timeline_events enable row level security;

-- Deny-by-default. PR-V2-C ships the read API + the trigger functions
-- that emit rows here in response to state mutations on the other
-- vault_* tables. PR-V2-A only creates the schema.
