# Sprint+6 Supabase migration — org-shared watchlists

Reshapes `watched_packages` from per-user to per-org. Anyone signed into the OpenSoyce dashboard who's a member of GitHub org `acme-corp` sees the same watchlist as every other `acme-corp` member, scoped to `acme-corp/*` repos.

Exceptions and notifications are **unchanged** in Sprint+6 — they're already repo-scoped + gated on write permission, which behaves correctly for teams without further work.

---

## The mental model

We don't introduce a "team" concept. We just use GitHub orgs as teams:

- Your GitHub login is `freewho99`. You're a member of GitHub orgs (implicitly your own user namespace, plus any orgs you've joined).
- Sign in → we fetch your org memberships once → bake them into the session token.
- Watchlists are keyed by `owner_org` (the GitHub org/user name that owns repos). The dashboard's "Watched packages" section gets an org picker.
- Individual GitHub users behave as "single-member orgs" in this model — your `freewho99` user is effectively a one-person org owning `freewho99/*` repos. The migration handles this naturally.

---

## What changes in the schema

`watched_packages` currently keyed: `(user_login, package_name, ecosystem)`. New key: `(owner_org, package_name, ecosystem)`. `user_login` survives as audit ("@freewho99 added this").

Run this in the Supabase SQL Editor (same project as Sprints+3/+4/+5):

```sql
-- Sprint+6: pivot watched_packages from per-user to per-org.

-- 1. Add the new column, nullable for now so the backfill can run.
alter table public.watched_packages
  add column owner_org text;

-- 2. Backfill: existing rows belong to their creator's user namespace.
--    For a one-person product (freewho99), this maps freewho99 → freewho99.
--    For a real team migration, treat user_login as the org since that's
--    where the existing user has historically been operating.
update public.watched_packages
  set owner_org = user_login
  where owner_org is null;

-- 3. Lock it down.
alter table public.watched_packages
  alter column owner_org set not null;

-- 4. Drop the old per-user unique constraint.
--    Constraint name follows Postgres's auto-generated convention from
--    Sprint+4's `unique (user_login, package_name, ecosystem)`.
alter table public.watched_packages
  drop constraint watched_packages_user_login_package_name_ecosystem_key;

-- 5. Add the new per-org unique constraint.
alter table public.watched_packages
  add constraint watched_packages_owner_org_package_name_ecosystem_key
    unique (owner_org, package_name, ecosystem);

-- 6. New index for the dashboard's "list watchlist for this org" path.
create index watched_packages_by_org
  on public.watched_packages (owner_org, created_at desc);

-- 7. The old `watched_packages_by_user` index from Sprint+4 stays —
--    it's useful for "show me everything I personally added" if we
--    ever build that audit view. No cost to keep it.
```

Click **Run**. Expected: `Success. No rows returned.`

Verify the row migrated correctly:

```sql
select user_login, owner_org, package_name, ecosystem
from public.watched_packages;
```

Should show your existing `react / npm` row with `user_login = freewho99` AND `owner_org = freewho99`. Both fields populated.

Verify the new constraint exists:

```sql
select constraint_name from information_schema.table_constraints
where table_name = 'watched_packages' and constraint_type = 'UNIQUE';
```

Should return `watched_packages_owner_org_package_name_ecosystem_key`.

---

## What changes outside the schema (preview)

Not in this doc, but coming in Sprint+6 PR 1 and PR 2:

### OAuth scope upgrade

The dashboard sign-in flow currently requests `scope=read:user`. It needs `scope=read:user,read:org` to see private org memberships.

What users will see: when they re-auth (forced once when the new scope ships, then again whenever their 8-hour session expires), GitHub's consent screen will say:

> OpenSoyce Guard is requesting the following permissions:
> - Read your user profile
> - **Read your organization membership** *(new)*

Existing sessions keep working until they expire. They show empty watchlists in the meantime because `session.orgs` doesn't exist on the old payload. Users sign out + back in to fix.

### Session token shape

```js
// Before
{ login, exp }
// After
{ login, orgs, exp }
```

Where `orgs` is the array returned by `GET /user/orgs` PLUS the user's own login (since `freewho99` always "owns" `freewho99/*` repos).

### API behavior

The four watchlist endpoints (`watchlist-add`, `-remove`, `-list`, `-changes`) all rebind:

- **Add:** body now requires `owner_org`. Server rejects 403 unless `session.orgs.includes(owner_org)`.
- **Remove:** server checks the row's `owner_org` against `session.orgs`.
- **List:** returns rows where `owner_org IN session.orgs` instead of `user_login = session.login`.
- **Changes:** verdict snapshots are additionally filtered to `owner IN session.orgs` (we only show degradations on repos the user actually has access to).

---

## Migration concerns to flag

- **Existing row preserved.** Your `react / npm` row gets `owner_org = freewho99`, which means it'll show up correctly when you sign in to the dashboard scoped to your own user namespace.
- **No data loss.** This is an additive column + index swap. No DROP TABLE, no DELETE.
- **Reversible.** If we want to revert, drop the new constraint and column and the table is back to its Sprint+4 shape (the index ride-along is harmless).
- **OAuth scope upgrade forces re-auth.** Users who don't sign out will see empty watchlists until their session expires. The frontend will surface this state with a "Sign in again to see your watchlists" hint.
