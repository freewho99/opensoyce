# Architecture Sketch: Repo Trust Dashboard (MVP)

**Status:** Sketch
**Date:** 2026-06-05
**Approves:** Option B from [ots-next-phase-adr.md](ots-next-phase-adr.md)
**Type:** Docs-only architecture sketch. No application code, no data model, no route implementation, no auth, no persistence.

## Purpose

`/proof/gate` answers: *what is the trust decision on this dependency right now?*
`/proof/timeline` answers: *how did trust decisions change, and why?*

The Repo Trust Dashboard answers a third, distinct question:

> What does my repository's current trust posture look like through OpenSoyce's eyes?

It is a per-repo view that pulls together — for a single repository — the gate's current evaluation, the workflow scanner's current findings, recent timeline activity scoped to that repo, and the placeholder for repo-specific exceptions. It is not a comparison view, not a multi-repo overview, not a buyer-facing trust narrative.

If the gate is the "what" and the Timeline is the "why and when," the Dashboard is the "where in my repo."

This sketch defines the **shape**, not the implementation. The implementation is queued as PR #47.

## Hard guardrail

This document is the sketch. The sketch is not implementation.

The following are explicitly **out of scope** for the sketch and for the implementation PR that follows it:

- No app code in this PR.
- No data model committed yet (the static data file lands in PR #47, not here).
- No database, no event table, no posture persistence layer.
- No route implementation (`/projects/:owner/:repo/trust` is described, not registered).
- No auth — the MVP focus repo is public, the Dashboard surface is public.
- No `threat_feed` activation, no candidate-pipeline changes, no Trust Center, no Vanta/Drata export, no Trust Agent.
- No `hn-exploits-log.json` handoff cleanup (the stale note in `docs/handoff/candidate-pipeline.md` is real but is a maintenance item; not in scope here).
- No detector edits, no new patterns in the catalog, no new gate-handler code.
- No sidebar nav promotion (D4 carried forward from PR #41).
- No `/proof` marketing-page CTA (A3 deferred-decision carried forward from PR #41).
- No multi-repo dashboard, no comparison view, no alerts/notifications.
- No editable policies in-dashboard.

## 1. Dashboard purpose

The Dashboard is one screen for *one repo's current trust posture*. It composes existing surfaces — it does not replace them.

| Existing surface | What it answers | Relationship to the Dashboard |
|---|---|---|
| `/proof/gate?package=name@version` | Current gate decision on one dependency | Dashboard's "Gate status" section calls the same API for the repo's canonical dependency examples. |
| `/proof/timeline` | Cross-arc history of trust decision changes | Dashboard's "Timeline preview" reuses the same event records, filtered to the focus repo. |
| `/projects/:owner/:repo` | Repository-level SOYCE score + workflow scan + detected risk patterns | Dashboard sits alongside as a focused trust view; both pages link to each other. |
| `/proof/ots-replays` | Live-detector replays of cited supply-chain incidents | Dashboard cross-links in the footer panel only; no replay rendering on the Dashboard itself. |

What the Dashboard adds that does not exist anywhere else today:

- A single-page composition of gate status + workflow risks + timeline preview + exceptions slot, scoped to one repo
- An explicit "posture" label per repo (USE READY / WATCHLIST / RISKY / GRAVEYARD — same vocabulary the rest of OpenSoyce uses)
- An exceptions placeholder section that documents where repo-specific gate exceptions will live when persistence ships (future ADR)

What the Dashboard deliberately does NOT add:

- No new policy decisions, no new severity classification, no new pattern catalog entries
- No editing of trust state — the Dashboard reads; it does not write
- No claims about repos OpenSoyce hasn't actually scanned

## 2. Route shape

```text
/projects/:owner/:repo/trust
```

Rationale:

- Sits alongside the existing `/projects/:owner/:repo` page as a sibling view, not a replacement. The existing page already shows SOYCE score + workflow scan + detected risk patterns for any owner/repo. The Dashboard is a focused trust-only view that links to and from the existing project detail page.
- Distinct namespace from `/proof/*` because the Dashboard is a product surface (repo-scoped, user-driven), not a proof-package surface (arc-scoped, evidence-driven).
- Consistent with the existing `/projects/:owner/:repo` URL family, so existing project links can deep-link to the trust view by appending `/trust`.
- Public, no auth — the MVP focus repo (`freewho99/opensoyce`) is public. Auth-gated dashboards for org-private repos are out of scope and require their own ADR.

Discoverability for the MVP:

- Linked from `/projects/:owner/:repo` (the existing project page gets one inbound link in its existing trust-posture area).
- Linked from `/proof/gate` footer cross-link panel (alongside `/patterns`, `/proof/ots-replays`, `/proof/timeline`).
- Linked from `/proof/timeline` cross-link panel, for the focus repo only.
- **NOT** linked from sidebar nav (D4 carried forward).
- **NOT** linked from `/proof` marketing page (A3 deferred-decision carried forward).

The MVP supports exactly one repo: `freewho99/opensoyce`. Visiting `/projects/<other>/<other>/trust` should render an honest empty state — see §3.

## 3. Current repo trust posture model

The Dashboard's data shape is a single posture object per repo, built from static data + reused live surfaces.

### Posture object (proposed for PR #47 to commit)

```text
RepoTrustPosture {
  owner: string
  repo: string
  postureLabel: 'use-ready' | 'watchlist' | 'risky' | 'graveyard'   // overall verdict; vocabulary matches /patterns and Guard
  postureSummary: string                                            // one sentence, derived from the underlying signals
  lastEvaluated: string                                             // ISO datetime of the static snapshot
  gateExamples: GateExample[]                                       // 1-3 representative dependencies the gate was run on
  workflowFindingsSource: 'live' | 'static-snapshot'                // MVP: 'live' (reuses scanRepoWorkflows)
  riskyDeps: RiskyDep[]                                             // static list for MVP; empty array if none
  timelinePreviewFilter: TimelinePreviewFilter                      // how to filter /proof/timeline events for this repo
  exceptionsPlaceholder: ExceptionsPlaceholder                      // see §4.6
  references: Reference[]                                           // anchored links (PR + SHA, proof doc anchors)
}

GateExample {
  packageQuery: string          // e.g. 'ua-parser-js@0.7.29'
  expectedAction: 'BLOCK' | 'WARN' | 'ALLOW'
  expectedPatternCount: number
  rationale: string             // one sentence — why this dep is a representative example for this repo
}

RiskyDep {
  packageQuery: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  reason: string                // one sentence anchored to a PR/SHA or a deployed surface
}

TimelinePreviewFilter {
  byPackage?: string[]          // event.package matches one of these
  byPr?: number[]               // event.pr matches one of these
  // For MVP: filter by package list, hard-coded to ['ua-parser-js'] for the focus repo
}

ExceptionsPlaceholder {
  count: 0                                              // MVP always 0 — no persistence yet
  message: 'No repo-specific exceptions configured. Persistence is queued in a separate ADR.'
}

Reference {
  label: string
  href: string
}
```

### Posture label semantics (MVP)

- `use-ready` — gate ALLOWs all sampled dependencies, workflow scan returns 0 patterns, no risky deps.
- `watchlist` — gate ALLOWs but workflow scan returns ≥1 WARN-level pattern, OR ≥1 risky dep at high/medium severity, OR open exception placeholder count > 0.
- `risky` — gate WARNs on ≥1 sampled dependency, OR workflow scan returns ≥1 high-severity finding.
- `graveyard` — gate BLOCKs on ≥1 sampled dependency, OR workflow scan returns ≥1 critical-severity finding.

For the MVP focus repo (`freewho99/opensoyce`), the static posture is **`watchlist`**: the workflow scan returns one `dangerous-release-permission` pattern (HIGH severity, WARN policy), and the canonical dependency example (`ua-parser-js@0.7.29`) is BLOCK-shaped per the Timeline — but that dep is not actually in `freewho99/opensoyce`'s lockfile, so it is rendered as an "evaluated for demonstration" example, not as an actual risky dep. The Dashboard surfaces this distinction in the gate-status section.

### Honest empty state for non-MVP repos

For any `:owner/:repo` other than `freewho99/opensoyce`, the Dashboard renders an honest empty state:

> No static posture configured for this repo. The Dashboard MVP supports one focus repo; multi-repo support is queued in a separate ADR.

It does NOT scan the unknown repo on the fly. The MVP is intentionally narrow.

## 4. Sections

Six sections, in the exact order the user named, each rendered as a card with the same brutalist aesthetic the `/proof/*` family uses.

### 4.1 Summary

Posture label + summary sentence + last-evaluated timestamp + link to the existing project page (`/projects/:owner/:repo`) for the SOYCE score and other product-level signals. One-line CTA: "Run live gate on a dependency now" → `/proof/gate` (no preset; lets the user pick).

The posture label is rendered as a brutalist pill matching the verdict palette used on the homepage and `/patterns`. No new colors invented.

### 4.2 Gate status

Lists the `gateExamples` (1–3 entries) with their expected action + pattern count + a one-sentence rationale per example.

For each example, the card has a button: "Run live gate on `<package>` now" → `/proof/gate?package=...`. The page does NOT call the gate API itself — the buttons link out to the gate page (which IS the verbatim API mirror). Same doctrine as Hard Rule 4 from the OTS handoff doc: the gate page stays the single live API surface.

For the MVP focus repo: one gate example — `ua-parser-js@0.7.29` — with the rationale: "Canonical 2021 supply-chain compromise; evaluated here to demonstrate the gate's BLOCK + 4-pattern response. Not actually in this repo's lockfile."

### 4.3 Risky deps

List of `riskyDep` rows with package query, severity, reason. Each row links to `/proof/gate?package=<query>`.

For the MVP focus repo: empty array. Renders an explicit empty-state message: "No risky deps in this repo's static MVP posture. The MVP exposes the gate examples (above) and the workflow risks (below) instead."

Honest empty states are mandatory. Inventing risky deps to make the section look populated is a doctrine violation (same rule as "no synthesized events" from the Trust Timeline sketch).

### 4.4 Workflow risks

Reuses the existing `scanRepoWorkflows()` shared module that PR #16 added (`src/shared/repoWorkflowScan.js`) and that the existing `/projects/:owner/:repo` page already calls. The Dashboard does NOT re-implement the workflow scan; it just renders the results.

For MVP simplicity: the workflow scan can be either live-fetched at render time (matching the existing project page's behavior) OR shipped as a static snapshot in the posture object's `workflowFindingsSource: 'static-snapshot'` mode. The implementation PR (#47) picks ONE — whichever is closer to "boring static MVP" and does not introduce new async failure modes.

Recommendation: **static snapshot for the MVP**, keyed off the `freewho99/opensoyce` scan that the existing project page has been producing since PR #16. Live-fetching can land in a future PR once the live-vs-static tradeoff is its own decision.

Each finding renders as a card with: pattern name (e.g., `dangerous-release-permission`), severity, policy impact, `Source: GitHub workflow`, exact `Origin` (e.g., `.github/workflows/opensoyce-scan.yml#scan`). Same evidence-row format the existing project page uses. Cross-links to the pattern detail page (`/patterns/dangerous-release-permission`).

### 4.5 Timeline preview

Reuses the `TRUST_TIMELINE_EVENTS` data from `src/shared/trustTimeline.js` (the Timeline MVP's static data, shipped in PR #45). Filters events by `timelinePreviewFilter` and shows the most recent 3–5.

For the MVP focus repo, the filter matches all 8 Timeline events (since the entire OTS proof-package arc focused on the same `ua-parser-js` package that this repo's gate example uses). The Dashboard shows the most recent 3 events as preview cards; "View full Timeline" link goes to `/proof/timeline`.

The Timeline preview cards reuse the visual treatment from `/proof/timeline` — same type badges, same layer badges, same link patterns. No new card style invented. If the Timeline's card layout is extracted into a shared component during PR #47, that's fine; if it's just visually parallel, that's also fine. Implementation choice.

### 4.6 Exceptions placeholder

Empty state by design. Renders a panel with:

- Header: "Repo-specific gate exceptions"
- Body: "No exceptions configured. Repo-specific exception storage is queued in a separate ADR. Today, exceptions live in the gate handler's per-call exception-lookup path (see `api/exceptions.js handleComplianceGate`) and are scoped per-call, not per-repo."
- Link out: to the existing `/admin/appeals` page (for context on the candidate-pipeline arc's appeal flow, which is the closest existing exception-adjacent surface).

The placeholder section exists so the data shape forecasts the future without committing the implementation. When persistence + per-repo exceptions ship in their own ADR, this section gets real data; the shape (the `ExceptionsPlaceholder` field) stays the same.

## 5. Data source for MVP

### Where the data lives (proposed for PR #47)

```text
src/shared/repoTrustDashboard.js     ← canonical posture data (JS, importable from .mjs tests)
src/data/repoTrustDashboard.ts       ← typed wrapper (re-exports from .js)
```

Mirror of the `src/shared/trustTimeline.js` + `src/data/trustTimeline.ts` pattern PR #45 established.

### Initial data (proposed for PR #47)

One posture object, hard-coded:

| Field | Value |
|---|---|
| `owner` | `freewho99` |
| `repo` | `opensoyce` |
| `postureLabel` | `watchlist` |
| `postureSummary` | "One HIGH-severity workflow finding (`dangerous-release-permission`). No risky deps in lockfile. One illustrative gate example (`ua-parser-js@0.7.29`) demonstrates the BLOCK + 4-pattern response." |
| `lastEvaluated` | ISO date matching the PR #47 merge commit date |
| `gateExamples` | One entry: `ua-parser-js@0.7.29` BLOCK 4 patterns |
| `workflowFindingsSource` | `static-snapshot` |
| `riskyDeps` | `[]` |
| `timelinePreviewFilter` | `{ byPackage: ['ua-parser-js'] }` |
| `exceptionsPlaceholder` | `{ count: 0, message: '...' }` |
| `references` | Links to PR #15, PR #16, PR #18 (workflow scan arc), PR #28, PR #30, PR #32, PR #33 (OTS arc), `/proof/gate?package=ua-parser-js@0.7.29`, `/proof/timeline`, `/projects/freewho99/opensoyce` |

The workflow findings snapshot is the same one the existing project page renders today: `{ pattern: 'dangerous-release-permission', source: 'GitHub workflow', origin: '.github/workflows/opensoyce-scan.yml#scan' }`. PR #47 commits this as a static array, not a live fetch.

### Audit-anchor discipline (carried over from Trust Timeline sketch)

- Every gate example has a `packageQuery` that matches a real npm package.
- Every workflow finding has a real `origin` that points at an actual file in the focus repo's `.github/workflows/` directory.
- Every reference link has either a PR + SHA or a deployed surface URL or a doc anchor that exists on `main` at the time of PR #47's commit.
- No invented severities. No invented patterns. No invented dependencies.

A test in PR #47 should enforce these mechanically. See §8.

### What changes when persistence lands later

Per-repo posture moves from a static array into either:

- A git-backed posture file (one JSON per repo, similar to `src/data/promotedIncidents.json` in the candidate-pipeline arc — the repo remembers)
- A Supabase posture table (separate write-path; would require its own architecture decision)

Both options require their own ADRs. The static MVP file gives the deployed Dashboard real product value before either persistence option exists. No persistence is required for the MVP.

## 6. What reuses /proof/timeline vs. what stays separate

### Reused from `/proof/timeline` (PR #45)

| Reuse | What it means in practice |
|---|---|
| Event records | Dashboard's Timeline preview reads `TRUST_TIMELINE_EVENTS` directly from `src/shared/trustTimeline.js`. No duplication. |
| Event type taxonomy + layer taxonomy | Dashboard surfaces the same 6 event types and 4 layers when rendering preview cards. The semantics carry over verbatim. |
| Audit-anchor discipline | Dashboard data also requires PR + SHA for every reference. The pattern is identical. |
| Card visual treatment for Timeline preview section | Dashboard's Timeline preview cards look like the Timeline's event cards. Optional shared component extraction in PR #47. |
| Cross-link panel pattern | Dashboard's footer cross-link panel uses the same brutalist box + 5-link structure. |
| Production verification recipe pattern | If the Dashboard has its own regression-curl block (likely; see §8), it follows the same code-block treatment. |

### Separate from `/proof/timeline`

| Separation | Why |
|---|---|
| Dashboard data file | Per-repo posture is repo-keyed, not date-keyed. Different primary key, different file. |
| Dashboard route | `/projects/:owner/:repo/trust` belongs to the existing project-page URL family, not the `/proof/*` family. |
| Dashboard sections | Summary + Gate status + Risky deps + Workflow risks + Exceptions placeholder are Dashboard-only — they don't appear on `/proof/timeline`. |
| Dashboard's posture label vocabulary | `use-ready` / `watchlist` / `risky` / `graveyard` is a product vocabulary that already exists in OpenSoyce. Timeline events do not use it. |
| Future persistence path | Per-repo posture and Timeline events will likely diverge into different storage layouts (per-repo JSON vs. event stream). Each gets its own future ADR. |

### What does NOT reuse `/proof/gate`

The Dashboard never calls the gate API directly. Gate-status section's buttons LINK to `/proof/gate?package=...`; the Dashboard does not embed the gate response or proxy it. This preserves Hard Rule 4 from the OTS handoff doc: the gate page is the single verbatim API mirror.

## 7. Non-goals

Carried forward from the user's required-scope guardrails, plus extras specific to the sketch.

### From the user's guardrails

- No dashboard code (this PR is sketch-only).
- No database.
- No auth.
- No persistence.
- No `threat_feed` activation.
- No candidate-pipeline changes.
- No Trust Center.
- No Vanta/Drata export.
- No Trust Agent.
- No `hn-exploits-log.json` handoff cleanup.

### Added by this sketch

- No multi-repo dashboard. MVP supports exactly one focus repo (`freewho99/opensoyce`); other `:owner/:repo` routes render an honest empty state.
- No comparison view (Dashboard vs. Dashboard, repo vs. repo).
- No alerts or notifications.
- No editable policies in-dashboard. The Dashboard reads posture; it does not write to it.
- No new gate API surface. The Gate-status section LINKS out to `/proof/gate`; it does not embed or proxy gate responses.
- No live workflow scan at render time for the MVP. The findings are a static snapshot. Live-fetch can land in a future PR if the tradeoff is its own decision.
- No new event types added to the Timeline data. The Dashboard reuses the existing 6-type taxonomy from PR #45 verbatim.
- No new pattern catalog entries.
- No detector edits.
- No new database tables.
- No client-side filter / search / pagination on the Dashboard.
- No charts, no graphs, no time-series visualizations.
- No edit / add UI for posture, exceptions, risky deps, or any other field.
- No sidebar nav (D4 carried forward).
- No `/proof` marketing-page CTA (A3 deferred-decision carried forward).

## 8. Test plan (for PR #47)

This sketch has no tests of its own (it's docs-only). PR #47's tests should include:

### Structural invariants

A new test file (suggested: `scripts/test-repo-trust-dashboard.mjs`) enforces:

- Exactly one posture object in the MVP data set (`REPO_TRUST_POSTURES.length === 1`).
- The posture's `owner` + `repo` equal `freewho99` + `opensoyce`.
- `postureLabel` is one of `use-ready` / `watchlist` / `risky` / `graveyard`.
- `postureSummary` is non-empty and under 280 chars.
- Every `gateExample.packageQuery` is a non-empty string.
- Every `gateExample.expectedAction` is one of `BLOCK` / `WARN` / `ALLOW`.
- Every `gateExample.expectedPatternCount` is a non-negative integer.
- `workflowFindingsSource` is one of `live` / `static-snapshot`.
- `riskyDeps` is an array (may be empty).
- Every `riskyDep.severity` is one of `critical` / `high` / `medium` / `low`.
- `timelinePreviewFilter` has either `byPackage` (non-empty string array) or `byPr` (non-empty positive-integer array) or both.
- `exceptionsPlaceholder.count` equals 0 (MVP discipline — anything else means persistence leaked into the MVP).
- Every `reference.label` and `reference.href` is a non-empty string.
- Every `reference.href` that points at a PR matches the GitHub PR URL pattern; every reference that points at a SHA matches the commit URL pattern.

### Cross-source consistency

- Every PR referenced in the posture's `references` array corresponds to a merged PR number that exists in `TRUST_TIMELINE_EVENTS` from PR #45 (or is a documented exception with a comment in the data file).
- Every package mentioned in `gateExamples` and `riskyDeps` appears in at least one event in `TRUST_TIMELINE_EVENTS` whose `package` field matches, OR has an inline comment explaining why it's a stand-alone example.

### Type-safety

`npx tsc --noEmit` clean.

### Regression check

Full `npm run test:ci` suite passes (current count: 169; PR #47 adds ~12–15 invariant tests, target post-PR #47 count: 180-ish, no regressions in any existing suite).

### Production verification (manual, documented in PR #47 body)

After deploy, the Dashboard page at `/projects/freewho99/opensoyce/trust` must render all 6 sections without error. The Gate-status section's "Run live gate on `ua-parser-js@0.7.29` now" button must navigate to `/proof/gate?package=ua-parser-js@0.7.29` and that page must return BLOCK + 4 patterns (same regression curl as the closeout doc + Timeline). For any other `:owner/:repo`, the empty-state message must render.

### Honest-empty-state discipline

A unit-level check: rendering the Dashboard for `owner=other` + `repo=other` (or any value not in the static data set) MUST NOT render fabricated posture data. The empty-state message must render. PR #47 author's responsibility, enforced by a quick component test or a snapshot.

## 9. Implementation PR sequence

The sketch (this PR) is **PR #46**. The implementation PRs follow in a strict order; each is its own architecture-first decision once the prior one merges.

### Immediate next (after this sketch merges)

- **PR #47 — `feat(ots): add static Repo Trust Dashboard MVP`**
  - Adds `src/shared/repoTrustDashboard.js` + `src/data/repoTrustDashboard.ts` (one posture object: `freewho99/opensoyce`)
  - Adds `src/pages/RepoTrustDashboard.tsx` (the page component, all 6 sections from §4)
  - Registers `<Route path="/projects/:owner/:repo/trust" element={<RepoTrustDashboard />} />` in `src/App.tsx`
  - Adds `scripts/test-repo-trust-dashboard.mjs` (structural invariants from §8)
  - Updates `/proof/gate` footer cross-link panel to include `/projects/freewho99/opensoyce/trust`
  - Updates `/proof/timeline` cross-link panel to include the same
  - Adds one modest inbound link from `/projects/:owner/:repo` (the existing project page) to `/projects/:owner/:repo/trust` for the focus repo only — exact placement decided in the PR
  - Scope guardrail: docs + static data + one page + one route + one test file + cross-link wiring. No backend. No persistence. No new gate-handler code. No detector edits. No new patterns.

### Queued for their own ADRs (do NOT start without explicit user call)

- **Multi-repo Dashboard data.** Requires deciding how `:owner/:repo` slots populate (manual curation? live scan? hybrid?), where per-repo data lives, and how the empty-state behavior changes when "honest empty" becomes "honest 'we haven't scanned this yet, click to scan'". Own ADR.
- **Persistent posture (per-repo file or DB table).** Static MVP has a ceiling. Choosing between git-backed JSON (the candidate-pipeline pattern) and Supabase (the threat_feed pattern) is a strategic decision, not an engineering one. Own ADR.
- **Auth-gated Dashboards for org-private repos.** Public MVP only. Org-private posture requires a separate auth + scoping decision. Own ADR.
- **Live workflow scan in the Dashboard.** MVP uses a static snapshot. Live-fetching at render time has its own tradeoff (network latency, failure modes, cache semantics) and belongs in its own ADR.
- **Editable policies / exceptions in-Dashboard.** MVP renders an exceptions placeholder. Activating writable exceptions touches the gate's exception lookup path and the persistence question simultaneously — own ADR.
- **Trust Timeline as Dashboard component.** Embedding the full Timeline (not just a preview) requires deciding scope — own ADR.
- **Comparison view (Dashboard vs. Dashboard).** Own ADR.
- **Alerting / notifications.** Own ADR.

### What this PR (#46) does NOT authorize

- PR #47 is **recommended**. It is not pre-approved by this sketch. The user calls "approve PR #47" or equivalent before any implementation begins.
- No PR after #47 is even queued for sketching without explicit user direction.

## Status

Sketch. Awaiting explicit user decision before implementation.

No application code should begin from this sketch alone.

Recommended implementation PR after this sketch:

**PR #47 — `feat(ots): add static Repo Trust Dashboard MVP`**
