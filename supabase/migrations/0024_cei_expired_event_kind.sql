-- OpenSoyce Trust Vault / CEI (PR-16A) — the expired event kind and the
-- system actor.
--
-- DOCTRINE (16A):
--   Temporary trust must not become permanent by neglect.
--   Expiry is time evidence, not reviewer judgment.
--   The reaper observes that time passed.
--   The reaper does not decide the risk.
--   The record remembers that review pressure became due.
--
--   An expired exception is not a revoked exception.
--   An expired exception is not an approved renewal.
--   An expired exception is not proof of remediation.
--   The reviewer still decides what happens next.
--
-- WHAT ALREADY EXISTED, deliberately, waiting for this scope block:
--   - vault_exceptions.state CHECK has carried 'expired' since 0011.
--   - vault_timeline_events' allowlist has carried 'exception_expired'
--     since 0012, and the 0015 trigger emits it on active -> expired with
--     emitted_by NULL ("reaper; no actor") in the SAME transaction as the
--     state flip. The Phase 5 audit needs NOTHING from this migration.
--
-- WHAT 6F deferred to this exact scope block (0020's words: "both belong
-- to the reaper scope block"):
--   1. the exception_expired_from_exposure CEI event kind;
--   2. actor nullability — every existing kind records a HUMAN action and
--      keeps requiring an actor; expiry is the first SYSTEM observation in
--      this table, and only that one kind may carry a NULL actor.
--
-- IDEMPOTENCY, structurally: at most ONE expired event may ever exist per
-- exception (partial unique index below). A reaper re-run cannot duplicate
-- the record; the 23505 loser knows the sighting is already recorded.
--
-- NOT IN THIS MIGRATION, on purpose:
--   - no new table, no new column
--   - no change to vault_exceptions      (state machine untouched; 'expired'
--     was already a legal state)
--   - no change to vault_timeline_events (Phase 5 contract untouched)
--   - no change to component_exposures   (expiry never mutates observation)
--   - no renewal/closeout machinery      (lane 16B)
--   - no scheduler                       (the reaper is an explicit command)

-- Widen the kind allowlist. Drop WITHOUT "if exists" — same loud-failure
-- contract as 0020: a name mismatch must fail the migration, not leave the
-- old CHECK silently rejecting every expired insert.
alter table public.component_exposure_events
  drop constraint component_exposure_events_event_kind_check;

alter table public.component_exposure_events
  add constraint component_exposure_events_event_kind_check
  check (event_kind in (
    'exception_proposed_from_exposure',
    'exception_approved_from_exposure',
    'exception_rejected_from_exposure',
    'exception_revoked_from_exposure',
    'exception_expired_from_exposure'
  ));

-- The system actor: expiry has no human. actor_user_id becomes nullable,
-- but ONLY the expired kind may use that — every human kind still requires
-- its actor, enforced by the named CHECK below, not by convention.
alter table public.component_exposure_events
  alter column actor_user_id drop not null;

alter table public.component_exposure_events
  add constraint component_exposure_events_actor_required_for_human_kinds
  check (
    actor_user_id is not null
    or event_kind = 'exception_expired_from_exposure'
  );

-- One expired event per exception, ever. This is the reaper's idempotency
-- guarantee at the schema layer: re-running the reaper cannot duplicate
-- the expiry record.
create unique index if not exists component_exposure_events_expired_once_key
  on public.component_exposure_events (related_exception_id)
  where event_kind = 'exception_expired_from_exposure';
