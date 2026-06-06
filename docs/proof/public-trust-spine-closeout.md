# Public Trust Spine — Phase Closeout

**Status:** Closed
**Date:** 2026-06-05
**Phase:** Public Trust Spine (the four-surface buyer-facing product layer)
**Predecessors:** [OTS Proof-Package Phase Closeout](./phase-closeout.md), [OTS Next-Phase ADR](../architecture/ots-next-phase-adr.md)
**PR lineage:** #43 → #44 → #45 → #46 → #47 → #48 → #49 (seven PRs, all merged on `main`)

This doc closes the public-trust-spine phase the same way `phase-closeout.md` closed the OTS proof-package phase. It is a checkpoint, not a launch announcement: it records the doctrine, surfaces, constraints, invariants, and future-blocked decisions so the next session opens with the spine locked, not re-litigated.

No application code lands in this PR. No routes, no links, no discoverability shifts, no marketing promotion. Docs only.

---

## 1. Four live surfaces

The public product spine is now four surfaces, all on `main`, all rendering static MVP data, all anchored to merged PRs.

| Surface | Route | Shipped in |
|---|---|---|
| Gate | `/proof/gate` | PR #32 (predates this phase) |
| Trust Timeline | `/proof/timeline` | PR #45 (`8a3e53a`) |
| Repo Trust Dashboard | `/projects/:owner/:repo/trust` | PR #47 (`b3ee8d3`) |
| Open Source Trust Center | `/opensource-trust` | PR #49 (`b094036`) |

All four are public, no auth, no personalization, no customer accounts. All four follow the same brutalist aesthetic, the same audit-anchor discipline (PR + SHA on every claim), and the same anti-marketing structural enforcement.

---

## 2. The question each surface answers

The spine is coherent because each surface answers a different question, and only that question. None of them duplicate or re-derive another's output.

| Surface | Question it answers | Surfaces it points at, never proxies |
|---|---|---|
| `/proof/gate` | What is the trust decision on this dependency right now? | (verbatim API mirror — the gate API itself) |
| `/proof/timeline` | How did trust decisions change, and why? | `/proof/gate`, `/patterns`, `/proof/ots-replays`, `/projects/.../trust`, `/opensource-trust` |
| `/projects/:owner/:repo/trust` | What is this repo's current trust posture? | `/proof/gate`, `/proof/timeline`, `/projects/:owner/:repo`, `/patterns`, `/proof/ots-replays`, `/opensource-trust` |
| `/opensource-trust` | Can this project prove how it handles open-source supply-chain trust? | `/proof/gate`, `/proof/timeline`, `/projects/freewho99/opensoyce/trust`, `/patterns`, doctrine + phase-closeout docs |

The Trust Center is the only one that addresses the outside reader (buyer / security reviewer / engineering leader / maintainer). The other three are internal-mechanic surfaces that the Trust Center summarizes by linking to.

---

## 3. PR lineage: #43 → #49

| PR | SHA | Type | Title | Role in the phase |
|---|---|---|---|---|
| #43 | `e934003` | docs | next-phase architecture decision record | Eight-option ADR (A–H) for what comes after the proof-package arc. Options A (Trust Timeline), B (Repo Trust Dashboard), and C (Open Source Trust Center) were chosen in sequence. |
| #44 | `0dbdd6d` | docs | sketch Trust Timeline architecture | Architecture-only sketch for `/proof/timeline`. Defined the six-type event vocabulary, the four-layer enrichment, and the policy_change anti-category. |
| #45 | `8a3e53a` | feat | add static Trust Timeline proof surface | First MVP surface from this phase. 8 static events, structural-invariants test, route registration, cross-link panel. |
| #46 | `e963131` | docs | sketch Repo Trust Dashboard architecture | Architecture-only sketch for `/projects/:owner/:repo/trust`. Defined the four-label posture vocabulary, the honest-empty-state discipline, and the consume-not-orchestrate rule. |
| #47 | `b3ee8d3` | feat | add static Repo Trust Dashboard | Second MVP surface. One posture (freewho99/opensoyce). Empty-risky-deps discipline enforced by test. Cross-links to Gate + Timeline. |
| #48 | `2aea807` | docs | sketch Open Source Trust Center architecture | Architecture-only sketch for `/opensource-trust`. Defined the `TrustClaim` + `TrustProofAnchor` shape, the anti-marketing banned-substring vocabulary, and the public-vs-private evidence boundary. |
| #49 | `b094036` | feat | add static Open Source Trust Center MVP | Third MVP surface. One subject (OpenSoyce). Seven sections. 18 structural invariants. Released `Trust Center` from the dashboard-files ban list (per the doctrine that bans update in the same PR that ships the capability). |

Pattern: every product surface is preceded by an architecture-only sketch PR. Sketch authorizes the implementation PR's scope but does not pre-approve it. Each implementation PR cites its sketch in the test plan.

---

## 4. Current guardrails

The doctrine enforced today, after the phase closes:

### Audit-anchor discipline

- Every Timeline event carries `pr` (positive integer) + `sha` (7- or 40-char hex).
- Every Dashboard reference, gate example, and workflow finding cites a verifiable artifact.
- Every Trust Center claim carries a non-empty `proofAnchors` array; every anchor is one of `pr`, `live-surface`, `doc-anchor`, or `proof-artifact`.
- PR-type anchors must cite a PR number + SHA matching the hex shape.

### Honest empty state

- The Dashboard's risky-deps section renders explicit "No risky deps in this repo's static MVP posture" copy when the list is empty. Inventing rows fails CI.
- The Dashboard's exceptions placeholder ships with `count === 0` and a deferred-ADR message. Anything else means persistence leaked into the MVP.
- The Trust Center's exception-policy and evidence-export sections render honest placeholder cards, not "coming soon" marketing.
- Unknown owner/repo on the Dashboard renders an empty-state card naming the supported focus repo, not fabricated posture data.
- Unknown subject on the Trust Center renders an empty-state card naming the MVP subject.

### Anti-marketing structural enforcement

- The Trust Center's banned-substring list (`SOC 2`, `SOC2`, `Vanta`, `Drata`, `enterprise compliance`, `continuous monitoring`, `compliance certified`, `audit-ready`) is enforced on every claim's `headline` + `body` (case-insensitive).
- Future-tense marketing tells (`coming soon`, `we will`, `roadmap`, `planned for`, `in development`) are banned on every claim's `headline` + `body`.
- No `visibility` field on any claim record (private-evidence scope creep guard).
- The Trust Center page surface itself must not contain `Trust Vault` / `Trust Agent` / `threat_feed`. Shared and data modules may name them only inside doctrine / ADR / banned-vocabulary comments.

### Consume-not-orchestrate

- The Trust Center NEVER calls the gate API directly. CTAs link to `/proof/gate?package=...`.
- The Trust Center NEVER renders Timeline events directly. It links to `/proof/timeline`.
- The Trust Center NEVER calls `scanRepoWorkflows()`. It links to the Dashboard.
- The Trust Center page contains no `fetch(` calls (asserted in test).
- The Dashboard reuses `TRUST_TIMELINE_EVENTS` from the Timeline data module, never re-declaring a parallel history model (asserted in test).

### Verbatim API mirror

- `/proof/gate` is a verbatim API mirror — never proxies, never narrates. Hard Rule 4 from the OTS handoff doc still applies.
- Gate map lookups use stripped package names (`splitPackageVersion(name)`). Hard Rule 1 still applies.

---

## 5. Invariant tests now protecting doctrine

Five structural-invariant test suites are wired into `npm run test:ci`. All five are file-reading invariants — they enforce wiring, anti-proxy, anti-duplication, and anti-marketing rules at the source level, not just at the data-shape level.

| Suite | Script | Test count | What it locks |
|---|---|---|---|
| Trust Timeline | `scripts/test-trust-timeline.mjs` | 11 | Event count + taxonomy, four-layer enrichment, no `policy_change`, every event PR + SHA, references shape, focus-package consistency. |
| Repo Trust Dashboard | `scripts/test-repo-trust-dashboard.mjs` | 13 | Exactly one posture, posture vocabulary, gate-example link-out (no proxying), empty-risky-deps copy, workflow-source vocabulary, timeline reuse from shared data, exceptions placeholder shape, references-in-timeline cross-check, route + inbound + cross-link wiring, dashboard outbound link to `/opensource-trust`, scope-leak guard. |
| Open Source Trust Center | `scripts/test-open-source-trust-center.mjs` | 18 | Exactly one subject, section vocabulary, audience vocabulary, claim shape, PR + SHA shape, banned-substring + future-tense + visibility-field guards, PR proofAnchor cross-check, live-surface family allowlist, page-surface scope-leak guard, route + cross-link wiring, no `fetch(` in page, `test:ci` wiring. |
| Existing OTS suites | various (e.g. `test-governor-gate.mjs`, `test-ots-patterns.mjs`, `test-ots-replays.mjs`, `test-osv-fast-path.mjs`, `test-github-workflow-signals.mjs`, `test-project-workflow-scan.mjs`) | many | Predate this phase; carried forward unchanged. |
| Candidate pipeline | `test-incident-candidates.mjs`, `test-incident-candidate-review.mjs`, `test-incident-candidate-promote.mjs` | many | Predate this phase; the parallel candidate-pipeline arc. Untouched. |

Total new invariants added by this phase: 11 (Timeline) + 13 (Dashboard) + 18 (Trust Center) = **42 doctrine-encoding assertions** on top of the existing OTS proof-package suites.

---

## 6. A3 / D4 still standing

Two discoverability decisions were deferred during PR #41 (the discoverability cross-links pass) and remain deferred after this phase closes.

### A3 — no `/proof` marketing-page CTA

`/proof` is the proof-package marketing page. It currently does not link to the Trust Center. The decision was deferred during PR #41 with the rationale that `/proof` is buyer-facing marketing copy, not an artifact list, and adding a Trust Center CTA there is a discoverability decision, not a doctrine decision.

**Status after PR #49:** still deferred. The Trust Center is reachable from `/proof/gate`, `/proof/timeline`, and `/projects/freewho99/opensoyce/trust` — three surfaces that are themselves inside the proof / trust family. `/proof` itself does not link to it.

**Why still deferred:** the right call here is a discoverability ADR that addresses `/`, `/about`, `/methodology`, `/scanner`, `/guard`, `/pricing`, AND `/proof` in one decision, not a one-off `/proof` patch.

### D4 — no sidebar nav promotion

The Trust Center is not in the primary sidebar nav. It is reachable only from inside the proof / trust surface family.

**Status after PR #49:** still deferred. Adding it to sidebar nav is a primary-nav slot decision that affects every page, not a Trust Center decision.

**Why still deferred:** same reason as A3. Primary-nav promotion is a separate ADR with its own scope.

Both are noted in the sketch (`docs/architecture/open-source-trust-center-sketch.md` §3) and remain authoritative until a discoverability ADR supersedes them.

---

## 7. What is explicitly NOT shipped

The public trust spine ships four surfaces and 42 invariant assertions. It does NOT ship:

### Persistence

- No database for trust events.
- No database for posture history.
- No event table.
- No Supabase migration in this phase (the existing `candidate-pipeline` migration is unrelated to this spine).
- All four MVP surfaces are static data files. Migration to persistence is a separate ADR per surface.

### Auth / multi-tenant

- No login, no customer accounts, no per-customer trust pages.
- No org-private repos in the Dashboard.
- No multi-subject Trust Center (one subject — OpenSoyce — for the MVP).

### Editing

- No editable exceptions UI.
- No editable trust state UI.
- No comment / annotate / dispute UI on Timeline events, Dashboard postures, or Trust Center claims.
- All four surfaces are read-only.

### Compliance posture

- No SOC 2 / SOC2 attestation.
- No Vanta / Drata integration or export.
- No "enterprise compliance" claim.
- No "continuous monitoring across all repos" claim.
- No "compliance certified" claim.
- No "audit-ready" credentialing claim.

### Discoverability promotion

- No link from `/`.
- No link from `/about`.
- No link from `/methodology`.
- No link from `/scanner`.
- No link from `/guard`.
- No link from `/pricing`.
- No link from `/proof` (A3 deferred).
- No sidebar nav slot (D4 deferred).

### Other named non-goals

- No `threat_feed` activation.
- No candidate-pipeline doctrine merge (the candidate-pipeline arc — PRs #34, #35, #37, #38 — remains a parallel arc with its own doctrine).
- No `hn-exploits-log.json` cleanup.
- No new detector / policy / catalog edits.
- No new patterns added in this phase.
- No embeddable trust badges.
- No comparison view (Trust Center vs. Trust Center).
- No alerting / notifications / email.

---

## 8. Future decisions blocked behind ADRs

Each of the following requires its own architecture-first decision. None is pre-approved by this phase closeout.

| Future capability | Why it needs its own ADR | Banned substring updated in same PR? |
|---|---|---|
| **Discoverability ADR** | Decides whether `/opensource-trust` is promoted to `/`, `/about`, `/methodology`, `/scanner`, `/guard`, `/pricing`, `/proof` CTA, or primary sidebar nav. Resolves A3 + D4 simultaneously. | n/a — copy-only |
| **Trust Vault ADR** | Auth-gated private trust evidence (per-customer logs, embargoed CVE work, reviewer-private exception justifications). Different data shape, different surface, requires login. | Removes `Trust Vault` from the page-surface ban list in the same PR that ships the capability. |
| **Embeddable trust badges ADR** | Third-party sites rendering `<script>` or `<a>`-style badges to prove "evaluated by OpenSoyce." Touches public verification, signing, abuse vectors. | n/a |
| **Vanta / Drata export ADR** | Compliance-platform integration. Activates removal of `Vanta` + `Drata` from the anti-marketing banned-substring list only after the export actually ships. | Yes — atomic with the export shipping. |
| **SOC 2 / continuous-monitoring activation ADR** | Same pattern: removes `SOC 2` / `SOC2` / `continuous monitoring` / `compliance certified` / `audit-ready` from the banned list in the same PR that ships the underlying capability. | Yes — atomic with the capability shipping. |
| **Auth-gated customer Trust Centers ADR** | Per-customer trust pages with login. Cannot reuse the public MVP's data shape; needs visibility field + RBAC. | n/a |
| **Multi-subject Trust Center ADR** | Supporting `/opensource-trust/:subject` with multiple projects. Route shape changes; URL contract changes. | n/a |
| **Trust Center as marketing landing page ADR** | Promoting the Trust Center to `/`, `/about`, `/methodology`, or a primary nav slot. Touches A3 + D4 carried-forward decisions. | n/a — overlaps with Discoverability ADR; one or the other, not both. |
| **Comparison view ADR** | "This Trust Center vs. that Trust Center." Multi-subject prerequisite. | n/a |
| **Posture-change alerting ADR** | Notifying Trust Center subjects when their posture changes. Requires persistence. | n/a |
| **Persistent Timeline events ADR** | Moving Timeline from static data to a git-backed or DB-backed event store. Decoupled from Trust Center; predates it. | n/a |
| **Persistent Dashboard postures ADR** | Moving Dashboard from one static posture to live posture computation. Decoupled from Trust Center. | n/a |
| **`threat_feed` activation ADR** | Reading from the `threat_feed` table the candidate-pipeline arc proposed. Migration #3 in the candidate-pipeline arc is queued for this. | n/a |
| **Candidate-pipeline enforcement extensions ADR** | Extending the scraper → review → promote flow with new doctrine. Separate arc from the public trust spine; touches incident catalog. | n/a |

The doctrine across this whole list: **a capability ships and its banned-substring exception lifts in the same PR. Never separately. Never "we mean it figuratively" copy.**

---

## 9. Production verification checklist

To verify the public trust spine is live and intact after deploy, walk this list. All four surfaces must respond.

### Surface-level

- [ ] `https://opensoyce.com/proof/gate?package=ua-parser-js@0.7.29` renders the live gate result (`action: BLOCK`, 4 patterns).
- [ ] `https://opensoyce.com/proof/timeline` renders all 8 static events with PR + SHA links resolving to non-404 GitHub URLs.
- [ ] `https://opensoyce.com/projects/freewho99/opensoyce/trust` renders the posture header, gate examples, empty risky-deps copy, workflow findings, 3-event timeline preview, exceptions placeholder, and cross-link panel.
- [ ] `https://opensoyce.com/opensource-trust` renders all 7 sections (Trust posture, Gate proof, Timeline proof, Dashboard proof, Exception placeholder, Methodology, Export placeholder), every CTA resolves to a real page, every external GitHub link resolves to a non-404.
- [ ] `https://opensoyce.com/projects/freewho99/not-opensoyce/trust` renders the honest empty-state card naming the supported focus repo (not fabricated posture data).

### Cross-link panels

- [ ] `/proof/gate` footer panel includes a link to `/projects/freewho99/opensoyce/trust` AND `/opensource-trust`.
- [ ] `/proof/timeline` cross-link panel includes a link to `/projects/freewho99/opensoyce/trust` AND `/opensource-trust`.
- [ ] `/projects/freewho99/opensoyce/trust` cross-link panel includes a link to `/opensource-trust`.

### Anti-discoverability

- [ ] `/` does NOT link to `/opensource-trust`.
- [ ] `/about` does NOT link to `/opensource-trust`.
- [ ] `/methodology` does NOT link to `/opensource-trust`.
- [ ] `/scanner`, `/guard`, `/pricing` do NOT link to `/opensource-trust`.
- [ ] `/proof` does NOT link to `/opensource-trust` (A3 deferred).
- [ ] Primary sidebar nav does NOT include `/opensource-trust` (D4 deferred).

### Regression curl

The single-curl recipe from `docs/proof/phase-closeout.md#production-verification-recipe` still verifies the live gate any time. The Trust Center page does NOT call the gate; this regression curl confirms the gate itself is still healthy and the Trust Center's claims about it remain accurate.

```bash
curl -sS -X POST https://opensoyce.com/api/compliance-gate \
  -H 'content-type: application/json' \
  -d '{"package":"ua-parser-js@0.7.29"}' | jq '.action, (.firedPatterns | length)'
# Expected:
# "BLOCK"
# 4
```

If `action` is not `"BLOCK"` or the firing-set count is not `4`, the Trust Center's Gate-proof claims have drifted from reality and the gate-proof section must be revisited — the surface is honest about what the gate says, so when the gate changes, the surface must catch up.

---

## 10. Recommended next decision options (not pre-authorized)

After this closeout merges, the next decision is the user's call. Five options, none pre-approved by this PR.

### Option A — Discoverability ADR

Decide how (and whether) `/opensource-trust` is promoted into primary navigation. Resolves A3 + D4 simultaneously. Could span `/`, `/about`, `/methodology`, `/scanner`, `/guard`, `/pricing`, `/proof`, and primary sidebar in one decision.

- **Risk:** premature promotion to primary nav puts a static-data MVP in front of every visitor before the data is dynamic.
- **Upside:** the spine is currently a treasure that requires three clicks to find. A discoverability ADR closes that gap intentionally instead of accidentally.

### Option B — Trust Vault ADR

Decide the auth-gated private-evidence surface: per-customer audit logs, embargoed CVE work, reviewer-private exception justifications.

- **Risk:** auth + persistence + RBAC is a significantly larger arc than the public spine. The public spine took 7 PRs over a few days; the Trust Vault will take more.
- **Upside:** unlocks customer-scoped trust evidence and exception management, the natural deepening of the per-repo Dashboard.

### Option C — `threat_feed` activation model

Decide how the candidate-pipeline arc's proposed `threat_feed` table flows into runtime detector behavior. Migration #3 is queued for this in the candidate-pipeline backlog.

- **Risk:** crosses the doctrine boundary between the candidate-pipeline arc (scraper proposes, reviewer decides, repo remembers) and the public trust spine (deployed surface reflects merged decisions). The two arcs have stayed parallel; activation merges them.
- **Upside:** moves OpenSoyce from "static MVP backed by the closed OTS arc" to "live ingest backed by a candidate-pipeline queue."

### Option D — Candidate-pipeline enforcement extensions

Decide whether to extend the scraper → review → promote flow into new doctrine (e.g., auto-pattern proposals, multi-source corroboration scoring, reviewer reputation). Separate arc from the public spine.

- **Risk:** consolidates two parallel arcs into one; the public spine's doctrine and the candidate-pipeline's doctrine were intentionally kept distinct.
- **Upside:** the candidate-pipeline arc's intake → review → promote pattern is the strongest single doctrine in the codebase. Extending it is high-leverage.

### Option E — Pause and produce launch narrative

Treat the public trust spine as a launch-worthy artifact. Write the public-facing narrative (blog post, demo script, walkthrough video script) that converts the four-surface spine into a single buyer-facing story.

- **Risk:** any launch narrative work is non-engineering and does not move shipped code. A pause that produces nothing shippable can lose momentum.
- **Upside:** the spine is currently the strongest proof-backed product story OpenSoyce has produced. The doctrine is in code; the narrative is in conversation. Codifying the narrative into a launchable artifact converts engineering into product story.

### What this PR does NOT authorize

- None of A–E is pre-approved by this closeout doc.
- The user calls "approve PR #51" (or equivalent, with the option named) before any further work begins.
- The phase closeout is a checkpoint, not a green light.

---

## Phase status

**Closed.**

Four live surfaces. Five invariant test suites (three new in this phase). 42 new doctrine-encoding assertions on top of the existing OTS proof-package suites. Seven PRs over the arc (`#43` → `#49`). Two deferred discoverability decisions still standing (A3 + D4). Fourteen future capabilities each behind their own ADR.

The public trust spine is now the buyer-facing layer of OpenSoyce. The next session opens with the spine locked.

> Risk does not lose its name because someone needed to ship.

> Proof-backed, not proof-flavored.
