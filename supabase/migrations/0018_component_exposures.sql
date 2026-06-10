-- OpenSoyce Component Exposure Intelligence (Phase 6A) — exposure records.
--
-- PR-6A. Per docs/strategy/component-exposure-intelligence-lock-in.md.
--
-- A component_exposure records that a software component EXISTS or CHANGED
-- in a workspace. It is workspace-scoped private trust-decision input —
-- NOT an exception, NOT evidence, NOT policy.
--
-- TENANCY (Phase 6A scope item 3):
--   - workspace_id is REQUIRED (not null) and FK-cascades from
--     vault_workspaces.
--   - RLS is deny-by-default; only authenticated vault-session handlers
--     (service role) read/write, and they funnel every access through
--     resolveWorkspaceForMember (active-membership required, 404-on-non-
--     member doctrine). No public reads. No account-id header trust
--     boundary anywhere.
--
-- SEPARATION FROM PHASE 5:
--   This table has NO foreign key to vault_exceptions and NO proof_anchors
--   column. An exposure does not reference, mutate, or depend on any
--   exception. The Phase 5 exception state machine is untouched. Phase 6A
--   also does NOT emit vault_timeline_events for exposures: adding a CEI
--   event_type would require altering the shared timeline CHECK constraint
--   that Phase 5 exception triggers depend on, so CEI's own audit surface
--   is deferred to a later, separately-authorized phase.

create table if not exists public.component_exposures (
  exposure_id      uuid primary key default gen_random_uuid(),

  workspace_id     uuid not null
                     references public.vault_workspaces(workspace_id) on delete cascade,

  exposure_type_id uuid not null
                     references public.component_exposure_types(exposure_type_id) on delete restrict,

  -- What the exposure is about. subject_kind is validated against the
  -- native type's allowed kinds at the application layer (domain.js);
  -- the SQL CHECK keeps it within the global native-kind allowlist.
  subject_kind     text not null check (subject_kind in (
                     'package', 'github-action', 'container-image',
                     'base-image', 'dev-tool', 'runtime'
                   )),
  subject_name     text not null check (length(subject_name) between 1 and 400),

  -- trust_boundary + metadata are free-form JSON OBJECTS (not arrays, not
  -- scalars). 6A enforces only object-ness, NOT any per-type schema —
  -- dynamic JSON Schema validation is future custom-type scope.
  trust_boundary   jsonb not null default '{}'::jsonb,
  metadata         jsonb not null default '{}'::jsonb,

  -- Where the observation came from. 6A has NO ingestion worker; source
  -- is recorded by an authenticated member action or a test fixture.
  source_kind      text not null check (source_kind in ('manual', 'api', 'cli', 'ci')),
  source_ref       text check (source_ref is null or length(source_ref) between 1 and 512),

  status           text not null default 'observed'
                     check (status in (
                       'observed', 'review_required', 'allowed',
                       'blocked', 'excepted', 'resolved'
                     )),

  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references public.vault_users(user_id) on delete restrict,

  constraint component_exposures_metadata_object
    check (jsonb_typeof(metadata) = 'object'),
  constraint component_exposures_boundary_object
    check (jsonb_typeof(trust_boundary) = 'object')
);

create index if not exists component_exposures_workspace_status_idx
  on public.component_exposures (workspace_id, status, last_seen_at desc);

create index if not exists component_exposures_workspace_subject_idx
  on public.component_exposures (workspace_id, subject_kind, subject_name);

create index if not exists component_exposures_type_idx
  on public.component_exposures (exposure_type_id);

create index if not exists component_exposures_workspace_created_idx
  on public.component_exposures (workspace_id, created_at desc);

alter table public.component_exposures enable row level security;

-- Deny-by-default. Service role bypasses; no anon/public read path. There
-- is no public CEI surface, no CEI dashboard, and no ingestion endpoint in
-- Phase 6A.
