-- OpenSoyce Component Exposure Intelligence (Phase 6F) — reviewer-outcome
-- event kinds.
--
-- PR-6F. Completes the CEI audit story started in 6D:
--
--   exposure observed                 (6A)
--   proposal created from exposure    (6C, event: exception_proposed_from_exposure)
--   reviewer saw source context       (6E, read-only)
--   reviewer decided                  (Phase 5 state machine, unchanged)
--   CEI recorded the decision relationship  <-- THIS migration
--
-- The ONLY change is widening the event_kind allowlist on
-- component_exposure_events. No new table, no new column, no exposure
-- mutation, no exception-lifecycle change, and the shared Phase 5
-- vault_timeline_events table is untouched (its triggers already record
-- the decision itself; CEI records the decision's RELATIONSHIP to the
-- exposure, in its own surface).
--
-- New kinds — one per reviewer outcome that exists as a real transition in
-- the application today:
--   exception_approved_from_exposure   proposed -> active   (approve)
--   exception_rejected_from_exposure   proposed -> rejected (reject / withdraw)
--   exception_revoked_from_exposure    active   -> revoked  (revoke)
--
-- DELIBERATELY ABSENT: exception_expired_from_exposure. No reaper exists
-- yet — nothing in the application transitions active -> expired — and this
-- table requires an actor (actor_user_id NOT NULL) while expiry has none.
-- Both belong to the reaper scope block; adding the kind now would be a
-- dead allowlist value that promises an event nothing can record.
--
-- 'extend' is NOT an outcome (state stays active) and records no CEI event.

-- The 0019 inline CHECK was unnamed, so Postgres auto-named it
-- <table>_<column>_check. Drop WITHOUT "if exists": if the name ever
-- differs, this migration must fail loudly rather than leave the old
-- single-value CHECK silently rejecting every outcome insert.
alter table public.component_exposure_events
  drop constraint component_exposure_events_event_kind_check;

alter table public.component_exposure_events
  add constraint component_exposure_events_event_kind_check
  check (event_kind in (
    'exception_proposed_from_exposure',
    'exception_approved_from_exposure',
    'exception_rejected_from_exposure',
    'exception_revoked_from_exposure'
  ));
