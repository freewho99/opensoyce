-- OpenSoyce Component Exposure Intelligence (Phase 6D) — CEI-native event log.
--
-- PR-6D. Per docs/strategy/phase-6a-cei-foundation.md.
--
-- A CEI-NATIVE audit surface that records relationships between exposures
-- and the actions taken from them — WITHOUT touching the shared Phase 5
-- vault_timeline_events table or its CHECK constraint. The exception
-- triggers and the public/private Timeline contract are completely
-- unaffected.
--
-- DOCTRINE (6D):
--   The exposure suggested.
--   The user proposed.
--   The exception recorded the decision candidate.
--   The CEI event recorded the relationship.
--   The reviewer still decides.
--
-- SEPARATION (preserved from 6A/6C):
--   - component_exposures still has NO foreign key to vault_exceptions.
--   - This EVENT table may reference BOTH an exposure and an exception as
--     audit CONTEXT — that is the whole point of an audit row — but the
--     exception reference is a nullable on-delete-set-null FK so deleting
--     an exception never cascades into exposure data, and the event is not
--     a decision: it records that a relationship was formed, nothing more.
--   - Recording an event does NOT mutate the exposure or the exception.
--
-- Event-kind allowlist is exactly ONE value in 6D:
--   exception_proposed_from_exposure

create table if not exists public.component_exposure_events (
  event_id            uuid primary key default gen_random_uuid(),

  workspace_id        uuid not null
                        references public.vault_workspaces(workspace_id) on delete cascade,

  -- The exposure the action was taken FROM. Required.
  exposure_id         uuid not null
                        references public.component_exposures(exposure_id) on delete cascade,

  event_kind          text not null
                        check (event_kind in ('exception_proposed_from_exposure')),

  -- Audit context: the proposed exception this event relates to. Nullable
  -- + set-null on delete so the event survives exception deletion as a
  -- historical record without cascading. This is NOT a link on the
  -- exposures table (separation preserved) — it lives only on the event.
  related_exception_id uuid
                        references public.vault_exceptions(exception_id) on delete set null,

  -- Who performed the action. Required.
  actor_user_id       uuid not null
                        references public.vault_users(user_id) on delete restrict,

  metadata            jsonb not null default '{}'::jsonb,

  created_at          timestamptz not null default now(),

  constraint component_exposure_events_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create index if not exists component_exposure_events_workspace_created_idx
  on public.component_exposure_events (workspace_id, created_at desc);

create index if not exists component_exposure_events_exposure_idx
  on public.component_exposure_events (exposure_id, created_at desc);

create index if not exists component_exposure_events_exception_idx
  on public.component_exposure_events (related_exception_id);

alter table public.component_exposure_events enable row level security;

-- Deny-by-default. Service role bypasses; no anon/public read path. This is
-- a private, workspace-scoped surface. No account-id header trust boundary;
-- the workspace resolves from the authenticated session + route slug.
