# Candidate Pipeline Arc — Handoff

**As of `ee021e1` on main (2026-06-03, 02:53 local).**

You're picking up the OpenSoyce repo after a 4-PR arc that built and shipped the **incident candidate pipeline** end-to-end. This doc tells you where things stand, what the doctrine is, what's safe to touch, and what needs human-product-decisions before code.

For cross-arc rules (forbidden ops, working style, getting-started), see [README.md](README.md).

---

## TL;DR for the impatient

- **Arc shipped**: HN scraper → `incident_candidates` Supabase queue → admin review UI → Promote-opens-a-PR. All on main.
- **158 tests passing** across 10 suites.
- **Doctrine**: *The scraper proposes. The reviewer decides. The repo remembers.*
- **Don't start backlog (#2c / #2d / #3) without explicit user call.**
- **One open prod debt**: `public.threat_feed` table missing in production Supabase — strategic decision, not engineering cleanup.

---

## What's on main

```text
main
 ├── 40f775b  feat(ots): add HN incident-candidate intake pipeline                (#34)
 ├── b476617  Merge pull request #35 — review queue (Reject + Duplicate only)     (#35)
 ├── 576e4b6  feat(ots): promote incident candidates through reviewed PRs         (#37)
 └── ee021e1  fix(reviewer-pages): OAuth sign-in + AppealsReview stale-closure    (#38)
```

| PR | What it added | Status |
|---|---|---|
| #34 | Intake plumbing: scraper writes to `incident_candidates` queue (NOT `threat_feed`). Includes scheduled GH Actions cron at 07:00 UTC daily. | Merged + verified live |
| #35 | Admin review UI at `/admin/incident-candidates`. Reject + Mark Duplicate work; Promote was disabled with a `PR #2b` badge. | Merged |
| #37 | Promote enabled: server opens a PR via bot PAT that appends to `src/data/promotedIncidents.json`. Candidate flips to `promoted` with PR URL stored as audit anchor. | Merged |
| #38 | Pre-existing OAuth bug fix on both reviewer admin pages + AppealsReview stale-closure fix (same bug #37 fixed in IncidentCandidatesReview). | Merged |

---

## Doctrine — load-bearing rules for ANY future change in this area

> **The scraper proposes. The reviewer decides. The repo remembers.**

This isn't prose; it's enforced in the code. Any change that violates these rules should be rejected:

### Hard rule 1: The scraper NEVER writes to `threat_feed`

The gate-enforcement table is reachable only through human-curated promotion. Heuristic title parsing is too unreliable to drive customer-facing blocks. If a future PR makes the scraper "smart enough to auto-block on high confidence" — **reject it**.

### Hard rule 2: Promote is doctrine-level, not UI polish

Promote decides how public truth enters the `OTS_INCIDENTS` catalog. Don't add Promote-adjacent features as small follow-ups. Each one needs its own architecture-first PR with user sign-off on decisions.

### Hard rule 3: Default verdict on heuristic intel is `pending`, never `blocked`

Earlier in the arc, a prior session almost shipped `verdict: 'blocked'` defaulting from HN headlines — would have blocked legitimate packages for every customer. Catch this kind of thing.

### Hard rule 4: `unknown-package` parses must skip queuing entirely

Polluting the review queue with rows that have nothing to act on is worse than dropping them. The scraper at [scripts/hn-exploit-scraper.mjs](../../scripts/hn-exploit-scraper.mjs) has this skip-guard at the report-call. Don't remove it.

### Hard rule 5: Public incidents land via PR, not via DB write

`OTS_INCIDENTS` is sourced from `src/shared/otsPatterns.js` (hand-curated seed) merged with `src/data/promotedIncidents.json` (bot-appended via promote PR). There is NO "ots_incidents" Supabase table. Don't add one. Don't propose A-style "DB hybrid rendering" — the user rejected that explicitly during the #37 architecture decision.

---

## Architecture quick map

```text
HN scraper (scripts/hn-exploit-scraper.mjs, daily cron via .github/workflows/hn-exploit-scraper.yml)
   │
   │  reportIncidentCandidate()
   ▼
public.incident_candidates Supabase table  (migration 0004)
   │
   │  GET /api/exceptions?action=candidates-list  (gated by isReviewer)
   ▼
/admin/incident-candidates  (src/pages/IncidentCandidatesReview.tsx)
   │
   ├─ Reject       → POST candidate-reject      → status='rejected'
   ├─ Duplicate    → POST candidate-reject      → status='duplicate'
   └─ Promote      → POST candidate-promote
                      ├─ Bot PAT opens GitHub PR appending to src/data/promotedIncidents.json
                      ├─ Candidate row → status='promoted', promoted_to_incident_id=<PR URL>
                      └─ Reviewer accountability: Co-Authored-By trailer + PR body header + DB row reviewed_by
```

Key constants:

- **Reviewer allowlist**: `OPENSOYCE_REVIEWERS` env var on Vercel (CSV of GitHub logins, default `freewho99`)
- **Promote bot token**: `OPENSOYCE_PROMOTE_BOT_TOKEN` env var on Vercel (GitHub PAT with `repo` scope). Without it, promote returns 503 — safe failure.
- **Target repo**: `OPENSOYCE_REPO_OWNER`/`OPENSOYCE_REPO_NAME`, defaults `freewho99`/`opensoyce`.

---

## What's safe vs. what needs human input

### Safe to do without asking

- Read code, run tests (`npm run test:ci` runs 158 in <60s, no network)
- Spin up the dev server (`npm run dev`)
- Visit `/admin/incident-candidates` in sandbox mode (activate via the "Activate Local Sandbox Mode" link on the unauth screen)
- Add to memory at `~/.claude/projects/c--Users-pfinn-projects-angular-tradebuddy-admin/memory/`

### Needs user call before starting code

| Item | Why it needs a decision |
|---|---|
| **PR #2c** — replay fixture authoring for promoted incidents | Reviewer can't design detector fixtures from a simple form; needs UX design discussion |
| **PR #2d** — GitHub webhook → candidate reconciliation on promote-PR merge | Functional system works without it; ask if it's worth the build |
| **PR #3** — opt-in "also write to `threat_feed`" checkbox on Promote | Tied to the missing-`threat_feed` prod-debt question (see below) |
| **`public.threat_feed` table migration** | Strategic decision: do you want custom-advisory enrichment lane live, or keep it dormant? The SQL block exists in `supabase/migrations/0003_exceptions_schema_fix.sql:118-134` and is idempotent. |
| **Untracked file cleanup** (scratch-*.mjs, supabase/.branches/, supabase/.temp/, hn-exploits-log.json) | Pre-existing local artifacts. Ask before gitignoring or deleting — could be in-flight work. |

### Forbidden without explicit user authorization

Cross-arc — see [README.md](README.md).

---

## Codebase quick reference

### Where things live

| Surface | File |
|---|---|
| HN scraper | `scripts/hn-exploit-scraper.mjs` |
| Scraper schedule | `.github/workflows/hn-exploit-scraper.yml` |
| Candidate DB module | `src/shared/incidentCandidates.js` |
| Candidate API handlers | `api/exceptions.js` — search for `handleCandidatesList`, `handleCandidateReject`, `handleCandidatePromote` |
| Admin review UI | `src/pages/IncidentCandidatesReview.tsx` |
| Promote form | `src/components/PromoteIncidentForm.tsx` |
| Promoted incidents storage | `src/data/promotedIncidents.json` (currently `[]`) |
| OTS_INCIDENTS catalog | `src/shared/otsPatterns.js` line 449+ (SEED_OTS_INCIDENTS) merged with the JSON above |
| Migration | `supabase/migrations/0004_incident_candidates.sql` |

### Tests (all in-process, no network)

```bash
npm run test:ci   # full 158-test gate: lint + 10 test suites
```

Specific suites for the candidate pipeline:

- `scripts/test-incident-candidates.mjs` — keyword filter, parser, DB module (25 tests)
- `scripts/test-incident-candidate-review.mjs` — list + reject API (13 tests)
- `scripts/test-incident-candidate-promote.mjs` — promote API with mocked GitHub + Supabase (15 tests)

Test pattern: in-process via `MockReq`/`MockRes` from `node:events` + signed-session cookies via `mintSessionCookie()`. Test seams via `__setSupabaseClientForTests`, `__setGithubFetcherForTests`, etc.

### Auth model

- GitHub OAuth via `/api/exceptions?action=auth-callback`
- Session cookie HMAC-signed with `OPENSOYCE_DASHBOARD_SECRET`
- Reviewer gate via `isReviewer(login)` → checks `OPENSOYCE_REVIEWERS` env var allowlist
- `oauthClientId` fetched from `/api/config` (returns `GITHUB_OAUTH_CLIENT_ID`), NOT hardcoded

---

## Open prod debt

### `public.threat_feed` table missing in production Supabase

**Symptom**: production OpenSoyce Supabase (FINNETECH org) has 7 tables but NOT `threat_feed`.

**Expected per migration 0003**: `threat_feed` table with check constraints, unique index, RLS.

**Most likely cause**: migration 0003 was only partially applied — `threat_feed` block at the end didn't land.

**Production impact today**: `src/shared/threatDb.js` → `checkThreats()` fails the query and returns empty Map (fail-safe). Gate has been operating with **zero custom-advisory enrichment** since deploy. OSV fast-path + DEPS_REGISTRY paths still cover the known-vulnerability lane.

**Fix when ready**: apply the missing DDL from `supabase/migrations/0003_exceptions_schema_fix.sql:118-134` to production. Idempotent — safe to run standalone.

**Don't conflate with the candidate pipeline**: the scraper has zero `threat_feed` write paths regardless of whether the table exists.

---

## Backlog (for future PRs, do NOT start without explicit user call)

### PR #2c — Replay fixture authoring

Each `OTS_INCIDENT` ideally pairs with an `OTS_INCIDENT_REPLAY` row (live-detector fixture OR catalog-mapping). Today, promoted incidents have no replay until manually added to `src/shared/otsIncidentReplays.js`.

Architectural challenge: reviewers can't author detector fixtures from a simple form — they need to know the detector's signal shape. Needs UX design discussion before code.

### PR #2d — Webhook → candidate reconciliation

When promote-PR merges, candidate status update. Currently `promoted` is terminal and we trust the stored PR URL as the proof. v1 functional without this.

If you build it: GitHub webhook → action `candidate-reconcile` → check if `promoted_to_incident_id` PR is merged → update candidate with `merged_at` or similar terminal-of-terminal state.

### PR #3 — Opt-in "also write to `threat_feed`" on Promote

Adds a checkbox on the Promote form: "Also block this package@version in the gate." When checked, after the promote-PR opens, ALSO write a row to `threat_feed`.

**Hard dependency**: `threat_feed` table must exist in production (see Prod Debt above). Strategic decision required first.

**Hard rule**: this is the ONLY code path where a Promote action can affect the gate. Don't add other paths.

---

## How to verify production after deploy

Once Vercel finishes deploying #38 (the most recent merge), Path B live verification of #37 becomes possible:

1. **Sanity check OAuth works**: visit `https://www.opensoyce.com/admin/incident-candidates` → click "Sign in with GitHub" → should hit GitHub OAuth consent screen (not a 404)
2. **Insert synthetic candidate** via Supabase SQL editor (production project, FINNETECH org):

   ```sql
   insert into public.incident_candidates
     (source, source_id, title, source_url, parsed_package, parsed_ecosystem,
      parsed_threat_type, parser_confidence, status)
   values
     ('manual', 'verification-test-002',
      'VERIFICATION TEST — synthetic candidate, promote me',
      'https://github.com/freewho99/opensoyce/pull/37',
      'test-package', 'npm', 'malicious_script', 'low', 'pending');
   ```

3. **Sign in as reviewer** (a GitHub login in `OPENSOYCE_REVIEWERS`)
4. **Find the synthetic row**, click Promote, fill form, submit
5. **Watch a real PR appear** against `freewho99/opensoyce`
6. **Verify candidate row**: `status='promoted'`, `promoted_to_incident_id` = PR URL, `reviewed_by` = your login
7. **Close the synthetic PR** without merging (it's a test artifact)
8. **Clean up**:

   ```sql
   delete from public.incident_candidates
   where source = 'manual' and source_id = 'verification-test-002';
   ```

---

## Stuff you'll find that's NOT part of this arc

- **Untracked files in working tree**: `scratch-*.mjs`, `supabase/.branches/`, `supabase/.temp/`, `hn-exploits-log.json` — pre-existing local artifacts from prior sessions, possibly debug or WIP. **Do not delete or gitignore without asking the user.**
- **AppealsReview.tsx unused imports** (`AlertCircle`, `Filter`, `Check`, `isReviewer`): pre-existing tech debt, not introduced by this arc. Out of scope to clean unless user asks.
- **`promoteCandidate()` exported from `src/shared/incidentCandidates.js`**: dormant plumbing from #34 — defined but not called by any UI/API today. PR #37's promote path doesn't use it (the API handler talks to Supabase directly). Leave it alone — future refactor target if anyone cares.
- **OTS proof-package arc** (PRs #19 → #33): the parallel engineering arc that shipped concurrently. Different doctrine, different code paths. See [ots-proof-package.md](ots-proof-package.md).

---

## If you're starting work, here's the sequence

1. **Read this doc fully**, especially the doctrine + hard rules
2. **Check memory** at `~/.claude/projects/c--Users-pfinn-projects-angular-tradebuddy-admin/memory/project_opensoyce_candidate_pipeline_2026_06_02.md` for the verbose history
3. **Verify on-disk state**:

   ```bash
   cd ~/projects/opensoyce
   git status         # expect clean except pre-existing untracked
   git log --oneline -5
   npm run test:ci    # expect 158 passing
   ```

4. **Ask the user** what they want to do — pick from the backlog, address prod debt, or something else entirely
5. **For non-trivial work**: sketch architecture decisions first, get user sign-off via `A:foo B:bar` shorthand, THEN build
6. **Match the PR body checklist pattern** when opening any new PR

---

## Contact

Repo: <https://github.com/freewho99/opensoyce>
Primary maintainer: @freewho99 (also the reviewer for `OPENSOYCE_REVIEWERS`)

Good luck. The arc closed clean — keep it that way.
