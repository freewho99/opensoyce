-- OpenSoyce — Exceptions, Verdict Snapshots, Watched Packages, Notifications & Threats Schema Fix
--
-- Consolidates and ensures the presence of the exceptions table, its new columns (status, revoked_by, slack_ts),
-- and all associated tables from sprints+3/4/5/6 and Phase 4.

-- 1. Exceptions Table
create table if not exists public.exceptions (
  id            uuid primary key default gen_random_uuid(),
  owner         text        not null,
  repo          text        not null,
  package_name  text        not null,
  ecosystem     text        not null check (ecosystem in ('npm','pnpm','yarn','uv','poetry','mixed')),
  reason        text        not null check (char_length(reason) between 10 and 2000),
  expires_at    timestamptz not null,
  granted_by    text        not null,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz
);

-- Add missing columns for Slack Interactivity and workflow tracking
alter table public.exceptions add column if not exists status varchar(20) default 'approved';
alter table public.exceptions add column if not exists revoked_by text;
alter table public.exceptions add column if not exists slack_ts varchar(100);

-- Update existing exceptions without status to 'approved'
update public.exceptions set status = 'approved' where status is null;

-- Webhook lookup index
create index if not exists exceptions_lookup_idx
  on public.exceptions (owner, repo, package_name)
  where revoked_at is null;

-- Dashboard list index
create index if not exists exceptions_list_idx
  on public.exceptions (owner, repo, created_at desc);

alter table public.exceptions enable row level security;


-- 2. Verdict Snapshots Table
create table if not exists public.verdict_snapshots (
  id            bigint generated always as identity primary key,
  owner         text        not null,
  repo          text        not null,
  package_name  text        not null,
  ecosystem     text        not null,
  label         text        not null check (label in ('USE READY','STABLE','FORKABLE','WATCHLIST','RISKY','GRAVEYARD')),
  scanned_at    timestamptz not null default now()
);

create index if not exists verdict_snapshots_lookup
  on public.verdict_snapshots (package_name, ecosystem, scanned_at desc);

create index if not exists verdict_snapshots_repo
  on public.verdict_snapshots (owner, repo, package_name, ecosystem, scanned_at desc);

alter table public.verdict_snapshots enable row level security;


-- 3. Watched Packages Table
create table if not exists public.watched_packages (
  id            uuid primary key default gen_random_uuid(),
  user_login    text        not null,
  package_name  text        not null,
  ecosystem     text        not null check (ecosystem in ('npm','pnpm','yarn','uv','poetry','mixed')),
  created_at    timestamptz not null default now()
);

-- Add owner_org column
alter table public.watched_packages add column if not exists owner_org text;

-- Backfill owner_org if null
update public.watched_packages set owner_org = user_login where owner_org is null;

-- Make owner_org not null
alter table public.watched_packages alter column owner_org set not null;

-- Safely swap constraints
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints 
    where constraint_name = 'watched_packages_user_login_package_name_ecosystem_key'
  ) then
    alter table public.watched_packages drop constraint watched_packages_user_login_package_name_ecosystem_key;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints 
    where constraint_name = 'watched_packages_owner_org_package_name_ecosystem_key'
  ) then
    alter table public.watched_packages add constraint watched_packages_owner_org_package_name_ecosystem_key unique (owner_org, package_name, ecosystem);
  end if;
end $$;

create index if not exists watched_packages_by_org
  on public.watched_packages (owner_org, created_at desc);

alter table public.watched_packages enable row level security;


-- 4. Notifications Table
create table if not exists public.notifications (
  owner             text        not null,
  repo              text        not null,
  slack_webhook_url text,
  updated_by        text        not null,
  updated_at        timestamptz not null default now(),
  primary key (owner, repo)
);

alter table public.notifications enable row level security;


-- 5. Threat Feed Table
create table if not exists public.threat_feed (
  id            uuid primary key default gen_random_uuid(),
  package_name  text not null,
  version       text not null,
  ecosystem     text not null check (ecosystem in ('npm','PyPI')),
  threat_type   text not null check (threat_type in ('typosquat','dependency_confusion','obfuscated_payload','malicious_script','suspicious_network')),
  evidence      jsonb not null,
  verdict       text not null check (verdict in ('flagged','blocked','dismissed')) default 'flagged',
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);

create unique index if not exists threat_feed_lookup_idx
  on public.threat_feed (package_name, version, ecosystem);

alter table public.threat_feed enable row level security;
