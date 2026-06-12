-- OpenSoyce Trust Vault (PR-18A) — Trust Agent evidence drafts.
--
-- DOCTRINE (18A):
--   The agent drafts. The human decides.
--   Drafts are records. Approval is a separate human action.
--   The record remembers both the draft and the approval.
--   Agent output is not evidence until a human records or approves it
--   as evidence.
--   The agent must not certify, verify, or declare a fix.
--
-- DESIGN: a draft is an append-only suggestion record derived from
-- existing records. Its TITLE and BODY never change after creation —
-- the only writes a draft row ever receives are the one-shot human
-- decision stamps (drafted -> approved OR drafted -> rejected), guarded
-- so a decision lands exactly once. A draft never becomes evidence by
-- itself: recording evidence still travels the existing 16C lane, by a
-- human, as its own record.
--
-- NOT IN THIS MIGRATION, on purpose:
--   - no write-back to ANY trust-record table (exposures, exceptions,
--     resolutions, evidence, checks, intel, questions, timeline)
--   - no autonomous-run machinery, no schedules, no delivery targets
--   - no secrets, tokens, signing material, private notes, or private
--     reason text — drafts derive from the export bundles, which
--     exclude private reasoning by construction

create table if not exists public.agent_evidence_drafts (
  draft_id          uuid primary key default gen_random_uuid(),

  workspace_id      uuid not null
                      references public.vault_workspaces(workspace_id) on delete cascade,

  -- Chain links (set-null: the draft record survives its citations).
  source_exposure_id uuid
                      references public.component_exposures(exposure_id) on delete set null,
  exception_id      uuid
                      references public.vault_exceptions(exception_id) on delete set null,
  related_resolution_id uuid
                      references public.vault_exception_resolutions(resolution_id) on delete set null,
  related_evidence_id uuid
                      references public.component_remediation_evidence(evidence_id) on delete set null,
  related_check_id  uuid
                      references public.evidence_verification_checks(check_id) on delete set null,

  -- What kind of suggestion this is. Bounded; nothing here is a
  -- decision kind.
  draft_kind        text not null
                      check (draft_kind in (
                        'remediation_evidence_suggestion',
                        'trust_record_summary',
                        'evidence_packet_summary',
                        'missing_evidence_gap_summary',
                        'citation_check_summary'
                      )),

  -- The draft lifecycle. drafted is the only creatable status; approved
  -- and rejected are one-shot human stamps; superseded marks a draft
  -- replaced by a newer one (still never deleted).
  draft_status      text not null default 'drafted'
                      check (draft_status in ('drafted', 'approved', 'rejected', 'superseded')),

  -- The generator is ALWAYS the agent — there is no human-authored row
  -- in this table, and no other generator kind exists.
  generated_by_kind text not null default 'agent' check (generated_by_kind = 'agent'),

  -- The human who asked for the draft. REQUIRED — v0 has no autonomous
  -- runs; every draft was explicitly requested.
  requested_by      uuid not null references public.vault_users(user_id),

  -- The separate human decision, stamped at most once. Coherence is
  -- schema-enforced: an approved draft carries approver + time and no
  -- rejection; a rejected draft the mirror; drafted/superseded carry
  -- neither.
  approved_by       uuid references public.vault_users(user_id),
  approved_at       timestamptz,
  rejected_by       uuid references public.vault_users(user_id),
  rejected_at       timestamptz,
  constraint agent_evidence_drafts_decision_coherence check (
    (draft_status = 'approved' and approved_by is not null and approved_at is not null
      and rejected_by is null and rejected_at is null)
    or (draft_status = 'rejected' and rejected_by is not null and rejected_at is not null
      and approved_by is null and approved_at is null)
    or (draft_status in ('drafted', 'superseded')
      and approved_by is null and approved_at is null
      and rejected_by is null and rejected_at is null)
  ),

  created_at        timestamptz not null default now(),

  draft_title       text not null check (length(draft_title) between 1 and 200),
  draft_body        text not null check (length(draft_body) between 1 and 8000),

  -- Structured prefill for the human (e.g. a candidate evidence type /
  -- reference / public-reason draft). Suggestions only — nothing reads
  -- these back into a record without a human action.
  suggested_fields  jsonb not null default '{}'::jsonb,

  -- The record ids the draft was derived from. Required: a draft that
  -- cites no sources is not derived from the record.
  source_record_ids jsonb not null,

  -- The non-claim travels IN the row, so a draft separated from this
  -- schema still carries its boundary.
  non_claim         text not null check (length(non_claim) between 1 and 300),

  -- Bounded, non-secret generator metadata (deterministic drafter v0:
  -- provider + version; an LLM lane would add model id, never keys).
  model_metadata    jsonb not null default '{}'::jsonb
);

create index if not exists agent_evidence_drafts_workspace_idx
  on public.agent_evidence_drafts (workspace_id, created_at desc);

create index if not exists agent_evidence_drafts_exception_idx
  on public.agent_evidence_drafts (exception_id, created_at desc);

alter table public.agent_evidence_drafts enable row level security;

-- Deny-by-default. Service role (authenticated vault handlers)
-- bypasses; no anon/public read path. Private, workspace-scoped.
