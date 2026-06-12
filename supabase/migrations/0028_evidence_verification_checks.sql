-- OpenSoyce Trust Vault (PR-EV-1) — evidence citation verification checks.
--
-- DOCTRINE (EV-1):
--   Evidence verification checks citations; it does not certify truth.
--   A passing check means the cited reference was reachable and matched
--   the expected shape at check time.
--   A failed check means the citation could not be confirmed.
--   An inconclusive check is allowed and honest.
--   The human still records evidence. The system may check the
--   reference. The export preserves both.
--
-- DESIGN: a check is an append-only OBSERVATION about a citation, made
-- at a point in time. It never mutates the remediation evidence row it
-- checks, never transitions any case, never closes anything. Re-running
-- a check appends another record — the history of checks IS the record.
--
-- VOCABULARY, enforced by schema: statuses are check_passed /
-- check_failed / check_inconclusive and nothing else. There is no
-- 'verified', no 'certified', no 'remediated' — a passing
-- citation check does not certify remediation or prove absence of
-- vulnerabilities.
--
-- NOT IN THIS MIGRATION, on purpose:
--   - no write-back to component_remediation_evidence (the evidence row
--     is the human's record; checks sit beside it)
--   - no case/state columns anywhere else
--   - no vault_timeline_events / CEI event kinds (a check is its own
--     surface, like resolutions and evidence before it)

create table if not exists public.evidence_verification_checks (
  check_id          uuid primary key default gen_random_uuid(),

  workspace_id      uuid not null
                      references public.vault_workspaces(workspace_id) on delete cascade,

  -- The evidence whose citation was checked. REQUIRED — a check is
  -- always about one specific citation.
  evidence_id       uuid not null
                      references public.component_remediation_evidence(evidence_id) on delete cascade,

  -- Chain links snapshotted at check time (set-null: the check record
  -- survives its citations).
  exception_id      uuid
                      references public.vault_exceptions(exception_id) on delete set null,
  source_exposure_id uuid
                      references public.component_exposures(exposure_id) on delete set null,
  related_resolution_id uuid
                      references public.vault_exception_resolutions(resolution_id) on delete set null,

  -- What was checked, snapshotted so the check stays readable even if
  -- the evidence row's citations are later unlinked.
  evidence_type     text not null check (length(evidence_type) between 1 and 80),
  evidence_ref      text not null check (length(evidence_ref) between 1 and 512),

  -- The narrow v0 check kinds. Anything not cleanly implementable is
  -- deferred rather than weakening doctrine.
  check_kind        text not null
                      check (check_kind in (
                        'internal_exposure_reference',
                        'github_reference_reachable',
                        'source_rescan_no_longer_matches'
                      )),

  -- The bounded honest vocabulary. Inconclusive is a first-class
  -- answer, not a failure to answer.
  check_status      text not null
                      check (check_status in (
                        'check_passed',
                        'check_failed',
                        'check_inconclusive'
                      )),

  -- Who asked for the check. Nullable: a NULL actor is the system
  -- (machine-triggered checks are a later lane; v0 is session-driven
  -- and always sets it).
  checked_by        uuid references public.vault_users(user_id),
  checked_at        timestamptz not null default now(),

  -- What the check observed, in source vocabulary, with the time it
  -- observed it. Required — a check without a summary is not a record.
  summary_public    text not null check (length(summary_public) between 1 and 500),

  -- Why a check failed or was inconclusive, when applicable.
  status_reason     text check (status_reason is null or length(status_reason) <= 500),

  -- Bounded raw/source metadata (what the source returned, ids matched,
  -- versions compared). The module truncates before insert.
  detail            jsonb not null default '{}'::jsonb
);

create index if not exists evidence_verification_checks_workspace_idx
  on public.evidence_verification_checks (workspace_id, checked_at desc);

create index if not exists evidence_verification_checks_evidence_idx
  on public.evidence_verification_checks (evidence_id, checked_at desc);

alter table public.evidence_verification_checks enable row level security;

-- Deny-by-default. Service role (authenticated vault handlers)
-- bypasses; no anon/public read path. Private, workspace-scoped.
