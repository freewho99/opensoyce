-- OpenSoyce Component Exposure Intelligence (PR-7C) — server-side semantic
-- dedupe for repeated dependency-exposure observations.
--
-- DOCTRINE (7C):
--   Observation is not judgment.
--   Repetition is not new evidence.
--   Provenance must not be erased.
--
-- The shape:
--   one stable exposure fact
--     +
--   repeat-observation metadata
--     +
--   latest / bounded provenance
--
-- This is UPSERT-TOUCH, not unique-reject. A unique-reject would keep the
-- table clean but hide the fact that CI saw the same dependency again —
-- erasing provenance. Instead, a repeated equivalent observation touches
-- the EXISTING row: seen_count increments, last_seen_at moves forward,
-- latest_source_ref records where the repeat sighting came from. The
-- original row keeps its first source_ref, source_kind, first_seen_at, and
-- created_at, so the first observation stays historically understandable.
--
-- THE SEMANTIC IDENTITY (computed app-side in the create handler, stored
-- in observation_identity) is the dependency FACT, not the run:
--   workspace + dependency-exposure + package subject + subject_name
--   + version + package_manager + manifest_kind + dependency_class
-- source_ref is DELIBERATELY NOT part of the identity — it is provenance,
-- not identity. That is what makes cross-run CI aggregation work: a new
-- run re-observing the same fact touches the same row.
--
-- observation_identity is nullable: only the dependency-exposure ingestion
-- path populates it. Rows created without the dependency fields (other
-- native types; sparse manual API creates) keep NULL identity and are
-- untouched by dedupe — the partial unique index ignores them.
--
-- NOT in this migration (still parked, per the PR-7C hard non-scope):
-- no lifecycle, no status transitions, no new exposure types, no new event
-- kinds, no vault_timeline_events reference, no exception-table reference.

alter table public.component_exposures
  add column if not exists observation_identity text
    check (observation_identity is null or length(observation_identity) between 1 and 1024),
  add column if not exists seen_count integer not null default 1
    check (seen_count >= 1),
  add column if not exists latest_source_ref text
    check (latest_source_ref is null or length(latest_source_ref) between 1 and 512);

-- Partial unique index: the transactional dedupe guard. Two concurrent
-- ingests of the same fact race; one inserts, the other hits 23505 and
-- falls back to the touch path in the create handler.
create unique index if not exists component_exposures_observation_identity_key
  on public.component_exposures (workspace_id, observation_identity)
  where observation_identity is not null;
