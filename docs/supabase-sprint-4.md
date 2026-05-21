# Sprint+4 Supabase migration — package watchlist

Adds two tables to the existing Supabase project from `docs/supabase-setup.md`:

- `verdict_snapshots` — verdict-per-(repo, package) per scan. Written by the Guard webhook on every PR scan. Lets the dashboard show "what's the current verdict on `react` across my repos?" and "did any watched package degrade recently?"
- `watched_packages` — the signed-in user's package watchlist. One row per (user_login, package, ecosystem). Unique on that triple so adding twice is a no-op.

No new env vars, no new Vercel functions, no new GitHub OAuth scopes. Reuses `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` already in production from Sprint+3.

---

## Run the migration

Open the Supabase SQL Editor (same project as Sprint+3) and run:

```sql
-- Sprint+4: per-scan verdict snapshots.
-- One row per (owner, repo, package_name, ecosystem, scanned_at) — written by
-- the Guard webhook after every PR scan. Dashboard reads to compute current
-- verdict across watched repos + detect recent degradations.
create table public.verdict_snapshots (
  id            bigint generated always as identity primary key,
  owner         text        not null,
  repo          text        not null,
  package_name  text        not null,
  ecosystem     text        not null,
  label         text        not null check (label in ('USE READY','STABLE','FORKABLE','WATCHLIST','RISKY','GRAVEYARD')),
  scanned_at    timestamptz not null default now()
);

-- Dashboard "what is the current verdict on package X across all repos?" path.
create index verdict_snapshots_lookup
  on public.verdict_snapshots (package_name, ecosystem, scanned_at desc);

-- Webhook "previous scan's verdict for this (repo, package)?" path — for degradation detection.
create index verdict_snapshots_repo
  on public.verdict_snapshots (owner, repo, package_name, ecosystem, scanned_at desc);

alter table public.verdict_snapshots enable row level security;
-- No policies → service_role only.


-- Sprint+4: per-user package watchlist.
-- One row per (user_login, package_name, ecosystem). Unique constraint so
-- adding a duplicate via the dashboard is an idempotent no-op.
create table public.watched_packages (
  id            uuid primary key default gen_random_uuid(),
  user_login    text        not null,
  package_name  text        not null,
  ecosystem     text        not null check (ecosystem in ('npm','pnpm','yarn','uv','poetry','mixed')),
  created_at    timestamptz not null default now(),
  unique (user_login, package_name, ecosystem)
);

-- "Show me my watchlist" path.
create index watched_packages_by_user
  on public.watched_packages (user_login, created_at desc);

alter table public.watched_packages enable row level security;
-- No policies → service_role only.
```

Click **Run**. Expected: `Success. No rows returned.`

Verify the tables exist:

```sql
select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('exceptions','verdict_snapshots','watched_packages');
```

Should return three rows.

---

## Data model notes

### verdict_snapshots

- `id` is `bigint generated always as identity` instead of `uuid` because we'll write a row per dep per scan — 25–50 rows per webhook is normal. Sequential ids are cheaper to generate and pack more rows per page.
- No unique constraint on `(owner, repo, package, ecosystem)` because we WANT history — every scan inserts fresh rows. Compare consecutive rows to detect degradation.
- `label` matches the six verdict labels the scoring engine produces. The dashboard maps `FORKABLE → STABLE` for display but the raw label is preserved here for future analysis.
- Growth: ~25 deps × 1 scan/week × 10 repos = ~250 rows/week. Year one is ~13K rows; Supabase free tier holds 500MB so this stays well under for years. Add a cleanup cron later if needed.

### watched_packages

- `user_login` is the GitHub login from the dashboard session token (same source as `exceptions.granted_by`).
- Watchlists are per-user, not per-org. Two devs at the same company each have their own list. Team-shared watchlists are a follow-up.
- Unique constraint on `(user_login, package_name, ecosystem)` so the dashboard "add to watchlist" button is naturally idempotent — clicking twice just no-ops.

---

## Sprint+4 verification (after agents land)

Once the Sprint+4 code ships, the smoke test will be:

```bash
# Signed-in user should see their watchlist (empty initially).
curl -sb "osg_session=<your-token>" \
  "https://www.opensoyce.com/api/exceptions?action=watchlist-list"
# expect: {"watched":[],"changes":[]}

# After a Guard webhook fires on any installed repo:
# verdict_snapshots should have ~25 new rows for that scan.
# Inspect in Supabase SQL editor:
#   select count(*), min(scanned_at), max(scanned_at) from verdict_snapshots;
```
