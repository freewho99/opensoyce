# OpenSoyce — Supabase Threat Feed Schema

Run the following SQL in your Supabase SQL Editor to create the `threat_feed` table for recording zero-day threat findings.

```sql
-- OpenSoyce Threat Intelligence Feed.
-- Custom zero-day threats discovered by the Sandbox analyzer.
create table public.threat_feed (
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

-- Index for lookup by package+version during scan runs
create unique index threat_feed_lookup_idx
  on public.threat_feed (package_name, version, ecosystem);

-- Enable Row Level Security (RLS) so anonymous calls cannot query the threats directly.
alter table public.threat_feed enable row level security;
```
