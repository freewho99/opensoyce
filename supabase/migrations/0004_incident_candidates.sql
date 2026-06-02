-- OpenSoyce — Incident Candidates table.
--
-- Holds raw, auto-discovered supply-chain incident leads (today: HN scraper;
-- tomorrow: GitHub Advisory feed, OSV deltas, social media). Each row is
-- low-confidence intel waiting for human promotion into OTS_INCIDENTS.
--
-- This table is intentionally SEPARATE from `threat_feed`:
--   threat_feed         -> gate enforcement (blocks/flags packages at scan time)
--   incident_candidates -> proof-library acquisition queue (feeds /replays page
--                          via human-curated promotion)
--
-- The schema deliberately stores BOTH the raw source (title + url) and the
-- parsed heuristic guess (package/version/ecosystem/threat_type) so a
-- reviewer can see the parser's interpretation alongside the original story
-- and judge whether the parse is trustworthy before promoting.

create table if not exists public.incident_candidates (
  id                    uuid primary key default gen_random_uuid(),
  -- Source identification (per-source unique key for dedup)
  source                text not null check (source in ('hn-heuristic','github-advisory','osv-delta','manual')),
  source_id             text not null,
  source_url            text,
  title                 text not null,
  author                text,
  published_at          timestamptz,
  -- Parser output (nullable -- a candidate can survive even if the parser
  -- couldn't extract a clean package name; reviewer may still find value)
  parsed_package        text,
  parsed_version        text,
  parsed_ecosystem      text check (parsed_ecosystem in ('npm','PyPI')),
  parsed_threat_type    text check (parsed_threat_type in ('typosquat','dependency_confusion','obfuscated_payload','malicious_script','suspicious_network')),
  parser_confidence     text not null default 'low' check (parser_confidence in ('low','medium','high')),
  -- Lifecycle
  status                text not null default 'pending' check (status in ('pending','promoted','rejected','duplicate')),
  promoted_to_incident_id text,
  reviewed_by           text,
  reviewed_at           timestamptz,
  review_notes          text,
  -- Bookkeeping
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Dedup: one row per (source, source_id) pair. HN scraper running daily
-- should upsert on this index, not append duplicates.
create unique index if not exists incident_candidates_source_dedup_idx
  on public.incident_candidates (source, source_id);

-- Review queue: pending candidates ordered by freshness.
create index if not exists incident_candidates_pending_idx
  on public.incident_candidates (status, created_at desc)
  where status = 'pending';

-- Promotion lookup: find which incident a candidate became.
create index if not exists incident_candidates_promoted_idx
  on public.incident_candidates (promoted_to_incident_id)
  where promoted_to_incident_id is not null;

alter table public.incident_candidates enable row level security;
