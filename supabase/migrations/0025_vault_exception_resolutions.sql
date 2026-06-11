-- OpenSoyce Trust Vault (PR-16B) — expired trust reviewer resolution.
--
-- DOCTRINE (16B):
--   Expired trust creates review pressure.
--   Reviewer resolution creates the next trust decision.
--   The reaper does not decide.
--   The reviewer decides.
--   The record remembers.
--
-- HARD WALL:
--   No auto-renew. No auto-revoke. No auto-remediate. No silent extension.
--
-- DESIGN: a resolution is a RECORD, not a state transition. The expired
-- state is TIME TRUTH and never changes — resolving an expired exception
-- writes a reviewer-authored review-case record beside it. "Renew" does
-- not revive or extend the expired row: it CITES a separate exception
-- (created through the existing Phase 5 propose lane, approved through
-- the existing reviewer lane, with its own fresh expiry). The expired
-- exception is treated as a review case: the case accumulates
-- append-only resolutions; the latest one is the current direction; a
-- 'defer' is honest about being revisitable, which is why this table has
-- NO unique-per-exception constraint — re-resolution is a feature, and
-- every prior resolution remains on the record.
--
-- NOT IN THIS TABLE, on purpose:
--   - no state/expires_at write-back  (the module never writes
--     vault_exceptions; the state machine is untouched — expired stays
--     expired, exactly as the reaper observed it)
--   - no proof_anchors                (a resolution is a direction with a
--     reason; the cited artifacts are the evidence)
--   - no vault_timeline_events       (Phase 5 trigger contract untouched;
--     this table is its own audit surface, like the CEI event log)
--   - no CEI event kinds             (the exposure's Decision history is
--     the exception lifecycle; the resolution joins via exception_id)

create table if not exists public.vault_exception_resolutions (
  resolution_id     uuid primary key default gen_random_uuid(),

  workspace_id      uuid not null
                      references public.vault_workspaces(workspace_id) on delete cascade,

  -- The expired exception this resolution is about. REQUIRED: a resolution
  -- is always a decision about one specific review case.
  exception_id      uuid not null
                      references public.vault_exceptions(exception_id) on delete cascade,

  -- The reviewer-selected direction. Bounded; every entry is a human
  -- decision about what happens next — none of them is performed by the
  -- system:
  --   renew               -> a NEW proposal travels the Phase 5 lane;
  --                          cited in renewed_exception_id (required)
  --   revoke              -> trust formally ended; do not renew (the
  --                          expired state already grants nothing — this
  --                          records the direction, it performs no
  --                          state change)
  --   remediation_required-> a human will fix/upgrade; expiry stands
  --   resolved_externally -> the risk no longer applies (component gone,
  --                          fixed upstream, etc.) — asserted by the
  --                          reviewer, not proven by the system
  --   defer               -> reviewed; deliberately revisit later (the
  --                          case stays revisitable; pressure remains
  --                          visible because the state is still expired)
  --   remediation_question-> the question lane owns the next step;
  --                          cited in linked_question_id (required)
  outcome           text not null
                      check (outcome in (
                        'renew',
                        'revoke',
                        'remediation_required',
                        'resolved_externally',
                        'defer',
                        'remediation_question'
                      )),

  -- The human. REQUIRED — there is no system resolution. (Expiry was the
  -- system's observation, 16A; the resolution is the reviewer's answer.)
  resolved_by       uuid not null references public.vault_users(user_id),

  -- A resolution without a reason is not evidence. Required, bounded.
  reason_public     text not null check (length(reason_public) between 1 and 280),
  reason_private    text check (reason_private is null or length(reason_private) between 1 and 10000),

  -- Cited artifacts — links to records that ALREADY EXIST in their own
  -- lanes; this table never creates them. set-null on delete: the
  -- resolution record survives its citation.
  renewed_exception_id uuid
                      references public.vault_exceptions(exception_id) on delete set null,
  linked_question_id   uuid
                      references public.component_remediation_questions(question_id) on delete set null,

  -- Citation coherence, enforced by schema: renew must cite the new
  -- proposal; remediation_question must cite the question; no outcome may
  -- carry a citation it does not use.
  constraint vault_exception_resolutions_citation_coherence check (
    (outcome = 'renew' and renewed_exception_id is not null and linked_question_id is null)
    or (outcome = 'remediation_question' and linked_question_id is not null and renewed_exception_id is null)
    or (outcome in ('revoke', 'remediation_required', 'resolved_externally', 'defer')
        and renewed_exception_id is null and linked_question_id is null)
  ),

  -- A renewal cannot cite itself.
  constraint vault_exception_resolutions_no_self_renewal check (
    renewed_exception_id is null or renewed_exception_id <> exception_id
  ),

  created_at        timestamptz not null default now()
);

create index if not exists vault_exception_resolutions_workspace_idx
  on public.vault_exception_resolutions (workspace_id, created_at desc);

create index if not exists vault_exception_resolutions_exception_idx
  on public.vault_exception_resolutions (exception_id, created_at desc);

alter table public.vault_exception_resolutions enable row level security;

-- Deny-by-default. Service role (authenticated vault-session handlers)
-- bypasses; no anon/public read path. Private, workspace-scoped.
