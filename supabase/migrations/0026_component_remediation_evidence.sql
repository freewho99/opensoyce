-- OpenSoyce CEI (PR-16C) — the Fix Evidence Loop: remediation evidence
-- records.
--
-- DOCTRINE (16C):
--   A recorded direction is not completed remediation.
--   The system can ask, structure, validate presence of evidence, and
--   record. The human closes the remediation case.
--   The record remembers who closed it, when, why, and with what
--   evidence.
--
-- The claim, exactly: not "we fixed the vuln" — "we recorded evidence
-- that the human says closes the remediation loop."
--
-- DESIGN: the remediation CASE is never a column anywhere. It is
-- DERIVED: a reviewer resolution with direction 'remediation_required'
-- opens the case; one or more evidence rows in this table mark it
-- evidence_recorded. No historical record is mutated — not the question,
-- not the exception, not the resolution. This table is append-only, like
-- the 16B resolutions beside it: a second evidence record is a feature
-- (more receipts), never an overwrite.
--
-- NOT IN THIS TABLE, on purpose:
--   - no 'fixed' / 'verified' / 'certified' status vocabulary anywhere —
--     the evidence_type names say what was OBSERVED or CITED, never what
--     the system concluded
--   - no state/expires_at write-back, no policy gate action
--   - no vault_timeline_events (Phase 5 trigger contract untouched)
--   - no CEI event kinds (the evidence row IS the audit surface; it
--     joins the chain via its citation FKs)

create table if not exists public.component_remediation_evidence (
  evidence_id       uuid primary key default gen_random_uuid(),

  workspace_id      uuid not null
                      references public.vault_workspaces(workspace_id) on delete cascade,

  -- The case this evidence closes: the exception whose reviewer
  -- resolution directed remediation_required. REQUIRED — evidence is
  -- always about one specific case.
  exception_id      uuid not null
                      references public.vault_exceptions(exception_id) on delete cascade,

  -- Chain citations — links to records that ALREADY EXIST in their own
  -- lanes, validated at write time, never created here. set-null on
  -- delete: the evidence record survives its citations.
  source_exposure_id   uuid
                      references public.component_exposures(exposure_id) on delete set null,
  source_vuln_intel_id uuid
                      references public.component_exposure_vulnerabilities(vuln_intel_id) on delete set null,
  related_question_id  uuid
                      references public.component_remediation_questions(question_id) on delete set null,
  related_resolution_id uuid
                      references public.vault_exception_resolutions(resolution_id) on delete set null,

  -- What kind of evidence the human cites. Bounded; every name is
  -- evidence-based wording (observed / reference / no-longer-matches /
  -- note) — none of them is a system verdict:
  --   fixed_version_observed   -> a newer version was OBSERVED in the
  --                               record (cite the observation)
  --   pr_or_commit_reference   -> a human cites the change that
  --                               remediated (PR / commit URL or ref)
  --   rescan_no_longer_matches -> a re-check against the source no
  --                               longer asserts the advisory (cite it)
  --   manual_remediation_note  -> a human attests with a reference
  --                               (ticket, doc, runbook)
  evidence_type     text not null
                      check (evidence_type in (
                        'fixed_version_observed',
                        'pr_or_commit_reference',
                        'rescan_no_longer_matches',
                        'manual_remediation_note'
                      )),

  -- The citation. REQUIRED — evidence without a reference is a claim,
  -- and a claim cannot close the loop.
  evidence_ref      text not null check (length(evidence_ref) between 1 and 512),

  -- The human. REQUIRED — there is no system remediation evidence.
  recorded_by       uuid not null references public.vault_users(user_id),

  -- Why the human says this closes the loop. Required, bounded.
  reason_public     text not null check (length(reason_public) between 1 and 280),
  reason_private    text check (reason_private is null or length(reason_private) between 1 and 10000),

  created_at        timestamptz not null default now()
);

create index if not exists component_remediation_evidence_workspace_idx
  on public.component_remediation_evidence (workspace_id, created_at desc);

create index if not exists component_remediation_evidence_exception_idx
  on public.component_remediation_evidence (exception_id, created_at desc);

alter table public.component_remediation_evidence enable row level security;

-- Deny-by-default. Service role (authenticated vault-session handlers)
-- bypasses; no anon/public read path. Private, workspace-scoped.
