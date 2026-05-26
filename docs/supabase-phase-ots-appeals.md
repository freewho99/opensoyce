# OpenSoyce — Phase OTS: Appeals table

Adds the `appeals` table that backs `/api/compliance/appeal`. This replaces the
previous in-memory `DEPS_REGISTRY` score mutation with a persistent, reviewable
appeals queue.

The endpoint now verifies caller maintainership against the claimed source
repo (via the installed GitHub App's collaborator-permission API) **before**
inserting a `pending` row. Scores are not changed until a human reviewer
approves the appeal — the prior "Cryptographic appeal verified" auto-grant
copy was removed because no cryptography was being performed.

---

## 1. Apply the migration

Open the project's **SQL Editor** in Supabase and run the SQL from
`supabase/migrations/0001_appeals.sql` (or paste the contents below).

```sql
-- (See supabase/migrations/0001_appeals.sql for the canonical version.)
create table if not exists public.appeals (
  id                  uuid primary key default gen_random_uuid(),
  package_name        text not null,
  ecosystem           text not null check (ecosystem in ('npm','pnpm','yarn','uv','poetry','mixed')),
  source_owner        text not null,
  source_repo         text not null,
  submitted_by        text not null,
  submitted_by_role   text not null check (submitted_by_role in ('admin','write')),
  rationale           text,
  status              text not null default 'pending'
                        check (status in ('pending','approved','rejected','withdrawn')),
  reviewed_by         text,
  reviewed_at         timestamptz,
  review_notes        text,
  created_at          timestamptz not null default now()
);
```

Plus three indexes and `enable row level security` — see the migration file.

Expected response: `Success. No rows returned.`

---

## 2. No new env vars required

`appeals` reuses the existing `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` and
the existing GitHub App credentials (`GUARD_APP_ID`,
`GUARD_APP_PRIVATE_KEY_BASE64`) used by `getRepoPermissionForUser`. The
appeals endpoint also requires `OPENSOYCE_DASHBOARD_SECRET` for session
verification — already required by every other auth-gated endpoint.

---

## 3. Verify

```bash
curl -s -X POST "https://www.opensoyce.com/api/compliance/appeal" \
  -H "Content-Type: application/json" \
  -d '{"package_name":"axios","ecosystem":"npm","repo":"axios/axios"}'
```

Expected (unauthenticated): `401` with `{"error":"AUTH_REQUIRED"}`.

With a valid dashboard session cookie but the user is not a maintainer of
`axios/axios`: `403` or `404`. Only when the caller has admin or write
permission (via an OpenSoyce Guard installation on the source repo) does the
endpoint insert a row and return `200` with `status: "pending"`.

---

## Data model reference

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | primary key, auto-generated |
| `package_name` | text | dep name as it appears in the registry |
| `ecosystem` | text | one of `npm`, `pnpm`, `yarn`, `uv`, `poetry`, `mixed` |
| `source_owner` | text | GitHub owner of the package's source repo |
| `source_repo` | text | GitHub repo name |
| `submitted_by` | text | GitHub login of the caller (from session) |
| `submitted_by_role` | text | `admin` or `write` — proven, not claimed |
| `rationale` | text | optional, 0–2000 chars |
| `status` | text | `pending` (default) → `approved` / `rejected` / `withdrawn` |
| `reviewed_by` | text | GitHub login of the reviewer (set on transition) |
| `reviewed_at` | timestamptz | set on transition |
| `review_notes` | text | reviewer's notes |
| `created_at` | timestamptz | auto-set |

### Why no auto-grant

The previous handler bumped `DEPS_REGISTRY[name].score += 1.0` on every appeal
without verification. Since `DEPS_REGISTRY` is itself a hardcoded fixture
(28 packages), the auto-grant was both unauthenticated and operating on
non-authoritative data. The appeals table makes the request auditable; a
follow-up phase will wire approval to a real scoring pipeline once
`DEPS_REGISTRY` is replaced with live registry intelligence.
