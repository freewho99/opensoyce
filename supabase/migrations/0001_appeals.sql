-- OpenSoyce — appeals table.
--
-- A package maintainer files an appeal to have a flagged package re-evaluated.
-- The /api/compliance/appeal handler verifies the caller is admin or write on
-- the claimed source repo (via the installed GitHub App) before inserting a
-- row here with status='pending'. A human reviewer then approves or rejects.
--
-- The previous implementation mutated an in-memory DEPS_REGISTRY dict and
-- claimed cryptographic verification it did not perform. This table replaces
-- that with persistent, auditable state.

create table if not exists public.appeals (
  id                  uuid primary key default gen_random_uuid(),
  package_name        text not null,
  ecosystem           text not null check (ecosystem in ('npm','pnpm','yarn','uv','poetry','mixed')),
  source_owner        text not null,
  source_repo         text not null,
  submitted_by        text not null,                                       -- GitHub login of caller
  submitted_by_role   text not null check (submitted_by_role in ('admin','write')),
  rationale           text,                                                -- optional free-text, max 2000 chars enforced at API layer
  status              text not null default 'pending'
                        check (status in ('pending','approved','rejected','withdrawn')),
  reviewed_by         text,                                                -- GitHub login of reviewer
  reviewed_at         timestamptz,
  review_notes        text,
  created_at          timestamptz not null default now()
);

-- Reviewer queue: pending appeals, oldest first.
create index if not exists appeals_pending_idx
  on public.appeals (status, created_at)
  where status = 'pending';

-- Per-package lookup: "show me prior appeal history for this package."
create index if not exists appeals_package_idx
  on public.appeals (package_name, ecosystem, created_at desc);

-- Per-submitter lookup: "show me my appeals."
create index if not exists appeals_submitter_idx
  on public.appeals (submitted_by, created_at desc);

-- Lock down direct access; only the service_role key (server-side) reads/writes.
alter table public.appeals enable row level security;
