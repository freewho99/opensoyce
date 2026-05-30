# task.md — Trust Stack & Package Registry Handoff

**As of 2026-05-30.** The repository is fully green and up to date on `main` (commit `117e5a6`). All 55 verification tests pass cleanly.

---

## 🤖 Current Architecture

OpenSoyce features a hybrid OpenSource Trust Stack (OTS) compliance gate and exceptions management system:

1. **Exceptions CRUD & Webhooks** (`api/exceptions.js`):
   - Single consolidated Vercel function routing GET, POST, DELETE requests to stay under the 12-function Hobby cap.
   - Leverages Supabase backend for managing repository-level exceptions, watchlist configurations, and Slack action integrations.

2. **OSV Fast-Path & Package Registry Resolution** (`src/shared/osvFastPath.js` and `src/shared/packageRegistryQuery.js`):
   - Implements a fast-path vulnerability check against OSV's bulk query API before proceeding with the main query resolver. 
   - Surfaces real vulnerability IDs (CVE/GHSA) and severities straight to the gate's pattern detector.
   - Implements a 4-tier package query chain:
     * **Snapshot**: Fast lookup in `public.package_registry` table.
     * **Live Query**: Hits npm/GitHub APIs dynamically on cache misses.
     * **DEPS_REGISTRY Demo**: Curated mock backup of 28 packages for test compliance.
     * **Hardcoded Fallback**: Permissive safe defaults (8.0, MIT, stable, FRESH) for missing packages.
   - Enforces verdict-tiered TTLs: `risky` packages expire in 2 days, whereas `stable` packages remain fresh for 30 days.
   - Performs in-flight request coalescing to combine duplicate concurrent fetches into a single task.

3. **Incremental cron updates** (action `cron-update-registry` in `api/exceptions.js`):
   - Daily cron job scheduled via `vercel.json` (running at `04:00 UTC`).
   - Self-seeds the top 1000 packages using `npm-high-impact` if database entries are below 1000.
   - Scans 50 packages per run, sorting by `updated_at` ascending.

---

## ⚡ Recent Milestones

- **Phase 1 (B) - Package Database Registry**: Added schema migration `0002_package_registry.sql` containing initial seeds, populated the `package_registry` table, and wired search lookups.
- **Vercel Hobby Cap Fix**: Consolidated standalone cron job handlers into `api/exceptions.js` to bring the count back to 12.
- **Database Schema Consolidation**: Created [0003_exceptions_schema_fix.sql](file:///C:/Users/pfinn/projects/opensoyce/supabase/migrations/0003_exceptions_schema_fix.sql) to idempotently construct missing tables (`verdict_snapshots`, `watched_packages`, `notifications`, `threat_feed`) and add missing columns (`status`, `revoked_by`, `slack_ts`) to the `exceptions` table.
- **Phase 2 (C) - Hybrid Resolver**: Built and tested the 4-tier resolving chain with caching, request coalescing, and live-query fallback logic.
- **Phase 3 - OSV Fast-Path Integration**: Implemented bulk OSV vulnerability querying preceding the resolver, which allows sub-200ms threat detection with real CVEs and GHSAs, while failing safe/degrading gracefully if OSV is down.

---

## 🚨 Outstanding Debt & Next Steps

- **Database Password Rotation**: The Vercel `DATABASE_URL` uses credentials containing `mrfinneyfree99`. Please rotate the database credentials in Vercel settings and Supabase console when possible.
- **Cache Hit/Miss Monitoring**: The cache status in the gate response now reflects whether a package is retrieved from the snapshot table (`hit`) or dynamically queried/missing (`miss`). Verify if any client-side integrations depend on the old mock `hit` semantics.
- **Audit Verification Key Config**: The SOC 2 Evidence panel displays an `"UNSIGNED REPORT PAYLOAD"` warning if `OPENSOYCE_SIGNING_PRIVATE_KEY` is not present in Vercel. Set up an Ed25519 keypair in the Vercel dashboard to sign compliance logs.

---

## 🛠️ Dev & Test Commands

- **Run Dev Server**:
  ```bash
  npm run dev
  ```

- **Run Full CI Test Suite** (linting, governor gate, patterns, replays, and package query resolver):
  ```bash
  npm run test:ci
  ```

- **Check Supabase Migration Status**:
  ```bash
  npx supabase migration list
  ```
