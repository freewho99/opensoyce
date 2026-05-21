# Sprint+5 Supabase migration — Slack notifications

Adds one table to the existing Supabase project. No new env vars, no new functions, no new GitHub OAuth scopes.

The `notifications` table stores per-(owner, repo) Slack incoming-webhook URLs. The Guard webhook reads it on every scan and POSTs a one-line alert to the URL when the Check Run conclusion is `failure`. Configured via the dashboard's new Notifications panel.

---

## Security note before you run anything

A Slack incoming-webhook URL is a **secret**. Anyone with the URL can post messages to the configured Slack channel. Implications baked into the schema and code:

- The URL is stored once via the dashboard and **never returned to any client** after that. The `notifications-get` endpoint returns `{ configured: true/false, updated_by, updated_at }` — not the URL.
- RLS is enabled with no policies → only the server-side service_role key can read or write.
- Setting the URL requires write+ permission on the repo (same gate as exception granting).

If a Slack URL leaks, rotate it on the Slack side (regenerate the incoming webhook) and update via the dashboard. The schema doesn't try to prevent leaks once the URL is in someone's hands.

---

## Run the migration

Open the Supabase SQL Editor (same project as Sprints+3 / +4) and run:

```sql
-- Sprint+5: per-repo notification config.
-- One row per (owner, repo). slack_webhook_url is nullable so a user can
-- "disable" notifications by setting it to NULL without losing audit context
-- (updated_by / updated_at survive).
create table public.notifications (
  owner             text        not null,
  repo              text        not null,
  slack_webhook_url text,
  updated_by        text        not null,
  updated_at        timestamptz not null default now(),
  primary key (owner, repo)
);

alter table public.notifications enable row level security;
-- No policies → service_role only. The Slack URL never leaves the server.
```

Click **Run**. Expected: `Success. No rows returned.`

Verify the table exists:

```sql
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('exceptions','verdict_snapshots','watched_packages','notifications');
```

Should return four rows.

---

## Data model notes

- **Primary key on (owner, repo)** so upserts are natural via `INSERT ... ON CONFLICT (owner, repo) DO UPDATE`. One config row per repo, period.
- **Nullable `slack_webhook_url`** — setting to NULL disables notifications but preserves audit (`updated_by` / `updated_at`). Deleting the whole row would also work, but keeping the row makes the dashboard "Configured by @user on date" message meaningful even after a disable.
- **`updated_by`** — GitHub login of whoever last touched this row (from the dashboard session, same source as `exceptions.granted_by`).
- **No `created_at`** — `updated_at` is the only timestamp that matters. The dashboard shows "configured by @x on date" using `updated_at`.

---

## What ships next

After this schema lands, three PRs:

1. **PR 1 — webhook integration.** Guard webhook reads `notifications.slack_webhook_url` for the (owner, repo) of the current PR. If conclusion is `failure` AND a URL exists, POSTs a one-line alert in parallel with the check-run / comment writes. Fail-quietly on Slack 4xx/5xx — never fails the Check Run.
2. **PR 2 — backend CRUD.** `api/exceptions.js` gains `?action=notifications-get` (returns metadata, never the URL) and `?action=notifications-set` (upsert with write-permission check).
3. **PR 3 — dashboard panel.** New "Notifications" section in the dashboard. Pick a repo, paste a Slack incoming-webhook URL, save. Status shows "Configured by @you on date" once set. "Disable" button clears the URL without deleting the row.

Total Sprint+5 surface area: ~3 commits, no new Vercel functions, no new env vars, no new dependencies.
