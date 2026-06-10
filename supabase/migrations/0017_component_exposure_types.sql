-- OpenSoyce Component Exposure Intelligence (Phase 6A) — native exposure-type catalog.
--
-- PR-6A. Per docs/strategy/component-exposure-intelligence-lock-in.md.
--
-- DOCTRINE (from the strategy lock-in):
--   Exposure says: something exists or changed.
--   Exposure is NOT an exception. Exposure is NOT evidence. Exposure is
--   NOT policy. An exposure can LEAD TO a trust decision; it does not
--   BECOME the trust decision.
--
-- SCOPE BOUNDARY (Phase 6A — native types only):
--   The strategy doc sketches a WORKSPACE-SCOPED exposure-type registry
--   with a validation_schema jsonb column for customer-defined types.
--   That registry is the FUTURE custom-type phase and is explicit
--   non-scope here. Phase 6A ships ONLY the native catalog: a fixed,
--   global system vocabulary of six exposure types. There is no
--   workspace_id column (native types are not workspace-owned), no
--   validation_schema column (no dynamic JSON Schema editing in 6A), and
--   no create-type API. Custom types, dynamic schemas, and the
--   workspace-scoped registry are deferred to a separately-authorized
--   phase.
--
-- The catalog is read-only at the application layer in 6A: it is seeded
-- here and never mutated by any endpoint.

create table if not exists public.component_exposure_types (
  exposure_type_id uuid primary key default gen_random_uuid(),

  -- Stable kebab-case identifier. Part of the API contract.
  type_slug        text not null unique,
  display_name     text not null,
  description      text,

  -- is_native marks the fixed system vocabulary. In 6A every row is
  -- native; the column exists so the future custom-type phase can add
  -- is_native = false rows without a schema change. The create-exposure
  -- handler refuses any type whose is_native is false OR is_active is
  -- false.
  is_native        boolean not null default false,
  is_active        boolean not null default true,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint component_exposure_types_slug_format
    check (type_slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  constraint component_exposure_types_display_len
    check (length(display_name) between 1 and 128)
);

alter table public.component_exposure_types enable row level security;

-- Deny-by-default RLS. The service role (used by the authenticated
-- vault-session handlers) bypasses RLS; no anon/public read path exists.
-- There is no public CEI surface.

-- ---- Seed the six native exposure types (Phase 6A scope item 2) ----
-- dependency-exposure, github-action-exposure, container-image-exposure,
-- base-image-exposure, dev-tool-exposure, runtime-version-exposure.
--
-- ON CONFLICT keeps the migration idempotent without overwriting any
-- later display-name edits.
insert into public.component_exposure_types (type_slug, display_name, description, is_native, is_active)
values
  ('dependency-exposure',       'Dependency Exposure',        'A package dependency present in the workspace''s software supply chain.', true, true),
  ('github-action-exposure',    'GitHub Action Exposure',     'A GitHub Action referenced by a workflow at a specific version or SHA.',   true, true),
  ('container-image-exposure',  'Container Image Exposure',   'A container image referenced by a deployment or compose definition.',      true, true),
  ('base-image-exposure',       'Base Image Exposure',        'A base image referenced by a Dockerfile FROM line.',                       true, true),
  ('dev-tool-exposure',         'Dev Tool Exposure',          'A developer tool or extension present in the workspace toolchain.',        true, true),
  ('runtime-version-exposure',  'Runtime Version Exposure',   'A server or runtime component version observed in the workspace.',         true, true)
on conflict (type_slug) do nothing;
