-- OpenSoyce — package_registry table
--
-- A cache and database backing of computed package scores, licenses, and verdicts.
-- This replaces the static in-memory DEPS_REGISTRY map for live registry compliance checks.

create table if not exists public.package_registry (
  id             uuid primary key default gen_random_uuid(),
  package_name   text not null,
  ecosystem      text not null default 'npm',
  score          numeric(3,1) not null,
  license        text not null,
  verdict        text not null,
  status         text not null,
  warn_message   text,
  description    text,
  critical       boolean not null default false,
  updated_at     timestamptz not null default now(),
  constraint package_registry_unique_pkg unique(package_name, ecosystem)
);

-- Index for sub-millisecond lookups
create index if not exists package_registry_lookup_idx
  on public.package_registry (package_name, ecosystem);

-- Lock down direct access; only service_role (server-side handlers) reads and writes.
alter table public.package_registry enable row level security;

-- Seed the initial 28 curated package registry entries for test coverage compatibility.
insert into public.package_registry (package_name, ecosystem, score, license, verdict, status, warn_message, description, critical) values
  ('react', 'npm', 10.0, 'MIT', 'stable', 'FRESH', null, null, false),
  ('facebook/react', 'npm', 8.4, 'MIT', 'stable', 'FRESH', null, null, false),
  ('vercel/next.js', 'npm', 7.6, 'MIT', 'forkable', 'FRESH', null, null, false),
  ('sindresorhus/got', 'npm', 7.6, 'MIT', 'forkable', 'FRESH', null, null, false),
  ('axios', 'npm', 9.4, 'MIT', 'stable', 'FRESH', null, null, false),
  ('axios/axios', 'npm', 8.9, 'MIT', 'stable', 'FRESH', null, null, false),
  ('express', 'npm', 8.2, 'MIT', 'stable', 'AGING', null, null, false),
  ('expressjs/express', 'npm', 9.1, 'MIT', 'stable', 'AGING', null, null, false),
  ('lodash', 'npm', 6.1, 'MIT', 'watchlist', 'STALE', 'SCORE DROP', null, false),
  ('lodash/lodash', 'npm', 8.2, 'MIT', 'stable', 'STALE', null, null, false),
  ('moment', 'npm', 4.2, 'MIT', 'risky', 'STALE', 'DEPRECATED', null, false),
  ('tiangolo/fastapi', 'npm', 9.6, 'MIT', 'stable', 'FRESH', null, null, false),
  ('remix-run/remix', 'npm', 8.8, 'MIT', 'stable', 'FRESH', null, null, false),
  ('torvalds/linux', 'npm', 6.2, 'GPL-2.0', 'watchlist', 'STALE', null, null, false),
  ('microsoft/vscode', 'npm', 8.2, 'MIT', 'stable', 'FRESH', null, null, false),
  ('nodejs/node', 'npm', 9.3, 'MIT', 'stable', 'FRESH', null, null, false),
  ('openssl/openssl', 'npm', 7.1, 'Apache-2.0', 'forkable', 'AGING', null, null, false),
  ('supabase/supabase', 'npm', 9.7, 'MIT', 'stable', 'FRESH', null, null, false),
  ('prettier/prettier', 'npm', 9.1, 'MIT', 'stable', 'FRESH', null, null, false),
  ('kubernetes/kubernetes', 'npm', 9.3, 'Apache-2.0', 'stable', 'FRESH', null, null, false),
  ('hashicorp/terraform', 'npm', 8.6, 'MPL-2.0', 'stable', 'FRESH', null, null, false),
  ('angular/angular', 'npm', 8.7, 'MIT', 'stable', 'FRESH', null, null, false),
  ('jquery/jquery', 'npm', 8.4, 'MIT', 'stable', 'STALE', null, null, false),
  ('chartjs/Chart.js', 'npm', 6.7, 'MIT', 'watchlist', 'AGING', null, null, false),
  ('prisma/prisma', 'npm', 8.8, 'Apache-2.0', 'stable', 'FRESH', null, null, false),
  ('trpc/trpc', 'npm', 8.2, 'MIT', 'stable', 'FRESH', null, null, false),
  ('malicious-pkg', 'npm', 1.0, 'MIT', 'graveyard', 'STALE', null, 'Contains preinstall curl backchannel exploit.', true),
  ('agpl-pkg', 'npm', 5.0, 'AGPL-3.0', 'risky', 'AGING', null, null, false)
on conflict (package_name, ecosystem) do update set
  score = excluded.score,
  license = excluded.license,
  verdict = excluded.verdict,
  status = excluded.status,
  warn_message = excluded.warn_message,
  description = excluded.description,
  critical = excluded.critical;
