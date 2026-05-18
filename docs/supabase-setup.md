# OpenSoyce Guard — Supabase setup

Sprint+3 introduces the **exceptions** feature: per-repo overrides that allow a flagged package despite its BLOCK verdict, with an expiry date. Storage lives in Supabase Postgres (free tier).

This is the operator runbook. Run through it once, then Sprint+3's backend + frontend can be built against a working DB.

---

## 1. Create the Supabase project

1. Go to https://supabase.com → sign up / log in (GitHub OAuth is fine).
2. Click **New project**. Pick:
   - **Name:** `opensoyce` (or whatever).
   - **Database password:** generate a strong one and save it somewhere — Supabase doesn't show it again. (You won't use it directly, but it's the root password for the underlying Postgres.)
   - **Region:** pick the one closest to your Vercel project's region. For Vercel `iad1` (Washington DC), use `us-east-1`.
   - **Pricing plan:** Free.
3. Wait ~2 min for the project to provision.

---

## 2. Run the schema migration

Open the project's **SQL Editor** (left sidebar, the `</>` icon) and run this:

```sql
-- OpenSoyce Guard exceptions table.
-- One row per (repo, package) exception. Soft-expiry via expires_at — webhook ignores expired rows at read time.
create table public.exceptions (
  id            uuid primary key default gen_random_uuid(),
  owner         text        not null,
  repo          text        not null,
  package_name  text        not null,
  ecosystem     text        not null check (ecosystem in ('npm','pnpm','yarn','uv','poetry','mixed')),
  reason        text        not null check (char_length(reason) between 10 and 2000),
  expires_at    timestamptz not null,
  granted_by    text        not null,  -- GitHub login of the user who granted it
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz
);

-- Webhook lookup path: "is there a non-expired non-revoked exception for this repo+package?"
create index exceptions_lookup_idx
  on public.exceptions (owner, repo, package_name)
  where revoked_at is null;

-- Dashboard list path: "show me all exceptions a user can see, newest first."
create index exceptions_list_idx
  on public.exceptions (owner, repo, created_at desc);

-- Lock down direct access. The api/exceptions.js handler uses the service_role key,
-- which bypasses RLS. We still enable RLS so the anon key can't read/write directly.
alter table public.exceptions enable row level security;

-- No policies defined → anon and authenticated keys see zero rows. Only the
-- service_role key (used server-side only) can read or write.
```

Click **Run**. You should see `Success. No rows returned.`

---

## 3. Capture the URL + service role key

1. Sidebar → **Project Settings** → **API**.
2. Copy two values:
   - **Project URL** (looks like `https://xxxxxxxxxxxxxxxx.supabase.co`)
   - **service_role** key (under "Project API keys" — click "Reveal" first). **NOT the `anon` key — the service_role key.** This bypasses RLS, which is what the server-side handler needs.

> ⚠️ The `service_role` key is **admin-level**. It can read/write/delete anything in the database, ignoring row-level security. Treat it like the GitHub App private key — never commit it, never paste it client-side, never log it.

---

## 4. Wire env vars in Vercel

Vercel dashboard → OpenSoyce project → Settings → Environment Variables. Add two new vars to **Production** (and optionally Preview):

| Name | Value | Notes |
|---|---|---|
| `SUPABASE_URL` | the project URL from step 3 | not sensitive |
| `SUPABASE_SERVICE_ROLE_KEY` | the service_role key from step 3 | **sensitive — never expose client-side** |

After saving, click **Redeploy** on the latest deployment so the new env vars are picked up (env vars are injected at build/run time; setting them doesn't auto-restart functions).

Also append to your local `.env.example` for documentation (no real values):

```
# Supabase project (Sprint+3 exceptions storage)
# See docs/supabase-setup.md
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

---

## 5. Verify the connection (smoke test)

After Sprint+3 PR 1 ships, the smoke test is:

```bash
curl -s "https://www.opensoyce.com/api/exceptions?owner=freewho99&repo=opensoyce"
```

Expected response (unauthenticated): `401` with `{"error":"AUTH_REQUIRED"}`.

That's the right answer — the endpoint exists, reached the handler, ran the auth check, rejected. If you instead see `404` or `500`, env vars aren't wired correctly.

---

## Data model reference

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | primary key, auto-generated |
| `owner` | text | GitHub org/user (e.g. `freewho99`) |
| `repo` | text | GitHub repo name (e.g. `opensoyce`) |
| `package_name` | text | dep name as it appears in the lockfile (e.g. `left-pad`) |
| `ecosystem` | text | one of `npm`, `pnpm`, `yarn`, `uv`, `poetry`, `mixed` |
| `reason` | text | required; 10–2000 chars; surfaced in the audit UI |
| `expires_at` | timestamptz | required; webhook ignores rows where `expires_at < now()` |
| `granted_by` | text | GitHub login of the user who granted (from OAuth session) |
| `created_at` | timestamptz | auto-set |
| `revoked_at` | timestamptz | nullable; if set, exception is inactive |

### Why soft expiry (no cron cleanup)

The webhook reads `where revoked_at is null and expires_at > now()` so expired rows have zero behavioral effect. We don't run a cron job to delete them because:

1. Dead rows are useful — the dashboard can show expired exceptions for audit context.
2. Adding a cron consumes one of the 12 Hobby-tier function slots.
3. Free-tier Supabase has 500MB DB — even 100K dead exception rows is negligible.

Future sprints can add a cleanup cron if needed.
