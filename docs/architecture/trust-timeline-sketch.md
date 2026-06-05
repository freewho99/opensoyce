# Architecture Sketch: Trust Timeline (MVP)

**Status:** Sketch
**Date:** 2026-06-04
**Approves:** Option A from [ots-next-phase-adr.md](ots-next-phase-adr.md)
**Type:** Docs-only architecture sketch. No application code, no data model, no route implementation, no persistence.

## Purpose

The OTS proof-package arc produced a rare asset: a historically honest sequence of trust-state changes on the same package across PRs #20 → #42. This sketch defines the smallest next surface that turns that sequence into a product primitive — without modifying the gate, the detector, the policy, or the catalog.

If the gate is the "what" (what the trust decision is right now), the Timeline is the "why" (why it changed and when).

This sketch defines the **shape**, not the implementation. The implementation is queued as PR #45.

## Hard guardrail

This document is the sketch. The sketch is not implementation.

The following are explicitly **out of scope** for the sketch and for the implementation PR that follows it:

- No app code in this PR.
- No data model committed yet (the static data file lands in PR #45, not here).
- No database, no event table, no persistence layer.
- No route implementation (`/proof/timeline` is described, not registered).
- No Trust Center surface.
- No Repo Trust Dashboard.
- No `threat_feed` activation.
- No new policy decisions, no detector edits, no new patterns in the catalog.
- No sidebar nav promotion (consistent with D4 from the proof-package arc).

## 1. Event taxonomy

The Timeline records six event types. The taxonomy is derived from the actual transitions captured in the proof-package arc — not invented categories.

| Event type | What it records | Example from the closed arc |
|---|---|---|
| `decision_change` | A previous policy result (ALLOW / WARN / BLOCK) flipped to a different policy result on the same input. | PR #28 — `ua-parser-js@0.7.29` ALLOW → BLOCK after OSV severity normalization. |
| `firing_set_change` | The set of patterns the detector emitted changed, but the policy decision stayed the same. | PR #30 — `ua-parser-js@0.7.29` 1 pattern → 4 patterns; both BLOCK. |
| `parity_event` | A deployed surface (e.g. `/proof/gate`) and the canonical local evidence diverged or re-converged. Neither a decision change nor a firing-set change in doctrine terms. | PR #33 — production API returned fallback shape for version-suffixed query; fix brought it back into parity with local. |
| `surface_shipped` | A new public surface for inspecting trust decisions went live. | PR #32 — `/proof/gate` public UI. PR #41 — discoverability cross-links. |
| `evidence_capture` | A verbatim trust-decision capture was recorded in the repo. | The three Capture History entries in `before-after-risk-example.md` (pre-#28, post-#28, post-#30). |
| `review_event` | A human review action altered the trust state. Reserved for cross-arc use (candidate-pipeline Promote / Reject / Duplicate writes). | PR #37 — candidate promotion via reviewed PR (cross-arc reference; the Timeline carries the *event*, not the candidate-pipeline doctrine). |

### Each event has

- `type` (one of the six above)
- `date` (ISO date or date range)
- `summary` (one sentence)
- `package` (optional; the focus package if the event was package-specific)
- `pr` (optional; the PR number that produced the event)
- `sha` (optional; the merge commit SHA, for audit-anchor stability)
- `layer` (optional; one of `evidence` / `wiring` / `surface` / `policy` — preserves the four-layer doctrine)
- `references` (zero or more anchored links — proof doc section, deployed surface URL, GHSA ID, etc.)

Layer is a **separate field** from event type. PR #28 was a `decision_change` at the `evidence` layer. PR #33 was a `parity_event` at the `wiring` layer. The doctrine pages explain why these are distinct; the Timeline preserves the distinction in the data shape, not just in prose.

### Anti-categories (do not add later without ADR)

- `policy_change` — the proof-package arc never edited a policy rule. Adding this category would create the temptation to ship policy edits as Timeline events; the doctrine says policy decisions stay separate from evidence transitions. If a future arc needs to record a policy edit, write an ADR first.
- `incident_disclosed` — out of scope; that's the candidate-pipeline domain.
- `narrative` — Timeline events must point at an artifact (PR / SHA / doc anchor). No purely-prose events.

## 2. Route

```text
/proof/timeline
```

- Same `/proof/*` path family as `/proof/gate` and `/proof/ots-replays`.
- Public, no auth (consistent with the gate page).
- Server-render-friendly (static data MVP — no client-side fetch required for the first render).
- No sidebar nav entry (consistent with D4 from the proof-package arc — the Timeline is a proof-package surface, not a primary product feature).

Discoverability for the MVP:

- Linked from `/proof/gate` footer (alongside `/patterns`, `/proof/ots-replays`).
- Linked from the proof package's `phase-closeout.md` artifact list (the closeout already lists 8 transitions — the Timeline is the visual rendering of that list).
- Optional: linked from `/proof/ots-replays` page header.
- **NOT** linked from `/proof` (the marketing page — same A3 deferred-decision constraint as PR #41).

## 3. Static data source for MVP

### Where the data lives (proposed for PR #45)

```text
src/data/trustTimeline.ts
```

Pattern matches `src/data/otsIncidentReplays.ts` and `src/data/patterns.ts` — readonly TypeScript const arrays with typed event objects. The page renders that array; no runtime fetch, no database call.

### Initial events (proposed for PR #45 to commit)

Eight events, anchored to merged PR numbers and SHAs already on main:

| # | Date | Type | PR | SHA | Layer | Summary |
|---|---|---|---|---|---|---|
| 1 | 2026-05-31 | `evidence_capture` | #20 | bff98ae | evidence | First verbatim capture of `ua-parser-js@0.7.29` gate evidence: 1 pattern (medium), ALLOW. Evidence-layer gap named honestly. |
| 2 | 2026-06-01 | `decision_change` | #28 | 392b1df | evidence | OSV severity normalization (bulk → detail enrichment, max-of-both severity). `ua-parser-js@0.7.29` flipped ALLOW → BLOCK. |
| 3 | 2026-06-01 | `firing_set_change` | #30 | 084297a | evidence | Live-fetch row enrichment (CWE-829/CWE-912 → install-script + remote-execution + maintainer-compromise signals). Firing set 1 → 4 patterns; decision stayed BLOCK. |
| 4 | 2026-06-02 | `surface_shipped` | #32 | 8521602 | surface | Public `/proof/gate?package=name@version` UI shipped — calls the same `compliance-gate` API Guard PR comments use. |
| 5 | 2026-06-03 | `parity_event` | #33 | 169397b | wiring | Production version-suffix lookup bug surfaced by PR #32 and fixed. Deployed API caught up to canonical local evidence. |
| 6 | 2026-06-03 | `evidence_capture` | #40 | 74ad3fd | evidence | Doc-repair captured the parity event under Capture History. Three captures now preserved verbatim. |
| 7 | 2026-06-03 | `surface_shipped` | #41 | b84b5e0 | surface | Discoverability cross-links from `/proof/ots-replays` (live-detector cards) and `/incidents/:id` (unambiguous single-version targets) to `/proof/gate?package=...`. |
| 8 | 2026-06-03 | `surface_shipped` | #42 | 17e28af | surface | Phase closeout doc shipped. OTS proof-package engineering arc closed with all four named engineering gaps closed. |

PR #34 (HN scraper / candidate intake) and PR #37 (Promote) are **deliberately excluded** from the MVP data set. They belong to the candidate-pipeline arc, not the OTS proof package. A future Timeline MVP **may** include `review_event` rows for them when the cross-arc data model is settled — that's a separate ADR.

### Audit-anchor discipline (rule for PR #45)

Every event in the static data file must satisfy:

- Has a `pr` field whose number resolves to a merged PR
- Has a `sha` field whose value is a merge-commit SHA reachable on `main` at the time of the data file's commit
- Has a `summary` whose key claim is verifiable against the PR title or the linked doc section

These are mechanical invariants. A test in PR #45 should enforce them (see Test plan, §7).

### What changes when persistence lands later

The static data file is the MVP. A future ADR will define how to migrate to either:

- A git-backed event log (events live in a tracked JSON file or markdown frontmatter, similar to `promotedIncidents.json` in the candidate-pipeline arc — the repo remembers)
- A Supabase event table (separate write-path; would require its own architecture decision)

The static file gives the deployed Timeline real product value before either persistence option exists. No persistence is required for the MVP.

## 4. UI sections

The page is a single-column timeline with a focus card. No SPA-style filters/search for the MVP — the data set is 8 events.

### Section breakdown

1. **Hero**
   - Headline: "Trust changes should leave a record."
   - Subhead: one sentence explaining what the Timeline records and what it does not (no current-state decision; that's `/proof/gate`).
   - Same brutalist aesthetic as `/proof/ots-replays` and `/proof/gate` (consistent with the `/proof/*` page family).

2. **Methodology box** (mirroring the existing pattern from `/proof/ots-replays` and `/proof/gate`)
   - 4–5 numbered points explaining: what counts as an event, the six event types, what an audit anchor is, how to read the layer field, where the data lives.

3. **Focus package card**
   - The current MVP focuses on a single package: `ua-parser-js@0.7.29`.
   - Card shows: package name, the four captured states, link to `/proof/gate?package=ua-parser-js@0.7.29` (Run live gate now), link to `docs/proof/before-after-risk-example.md` (GitHub-rendered capture history).
   - Says explicitly: "MVP scope is one package. Repo-specific and multi-package timelines are queued in their own ADRs."

4. **Event list grouped by date**
   - Reverse-chronological by default (most recent first).
   - Each event renders as a card with: date, type badge (color-coded per type), layer badge (color-coded per layer), summary, PR link (to GitHub), SHA short-hash (to GitHub commit), references (zero or more anchor links).
   - Type badge colors mirror the verdict pill conventions already in the codebase (`bg-soy-red text-white` for decision changes, `bg-emerald-500 text-white` for surface shipped, etc.). PR #45 picks the final palette; this sketch does not.

5. **Event type legend**
   - A compact panel describing each of the six event types with one-sentence definitions.
   - Anchored to the same six types defined in §1. If the data file ever needs a seventh type, the legend changes (and the seventh type needs its own ADR).

6. **Cross-link panel** (footer)
   - Links to: `/patterns` (catalog coverage), `/proof/ots-replays` (replay lab), `/proof/gate` (live gate), `before-after-risk-example.md` (capture history), `phase-closeout.md` (full arc record), `doctrine-pattern-enforcement.md` (the four layers).
   - Closes with the doctrine line: *Risk does not lose its name because someone needed to ship.*

7. **Production verification recipe block**
   - Copies the single-curl regression test from the closeout doc verbatim.
   - Renders inside a code block with the same brutalist code-block treatment used on `/proof/gate`.
   - Caption: "Run this any time you doubt the Timeline. If the curl returns anything other than `\"action\":\"BLOCK\"`, the live gate is not at parity with the canonical capture history."

### What the page does NOT have (MVP)

- No filter controls (no event-type dropdown, no date range picker, no package picker).
- No pagination (8 events fits one viewport on desktop).
- No client-side fetch.
- No empty state for "no events yet" (the MVP ships with 8 hard-coded events).
- No edit / add UI.
- No comments or discussion.
- No charts.

## 5. Links to proof docs + live gate

The Timeline is one node in the proof-surface graph. The cross-link panel (UI section 6) wires it to the others.

Linked outward from the Timeline:

- `/patterns` — coverage status (20 of 31 gate-active)
- `/proof/ots-replays` — live-detector replays of cited incidents
- `/proof/gate?package=ua-parser-js@0.7.29` — focus-package live gate query
- `docs/proof/before-after-risk-example.md` — capture history (the three verbatim ua-parser-js captures)
- `docs/proof/doctrine-pattern-enforcement.md` — the four-layer doctrine
- `docs/proof/phase-closeout.md` — full arc record (event 8's destination)

Linked inward to the Timeline (added in PR #45):

- `/proof/gate` footer cross-link panel gets a new entry pointing at `/proof/timeline`.
- `docs/proof/phase-closeout.md` MAY get a one-line reference: "See [/proof/timeline](../../src/pages/TrustTimeline.tsx) for the visual rendering of the transitions listed above." (PR #45's call.)

## 6. Non-goals

Carried forward from the ADR, plus extras specific to the sketch.

### From the ADR (Option A "Non-goals for MVP")

- No database event table.
- No repo-specific timeline yet.
- No user-auth timeline.
- No Trust Center.
- No `threat_feed` activation.
- No candidate-pipeline enforcement extension.
- No new policy decisions.

### Added by this sketch

- No detector edits.
- No new patterns in the catalog.
- No new gate-handler code.
- No changes to `/proof/gate` (the gate page remains a verbatim API mirror; Hard Rule 4 from the OTS handoff doc).
- No multi-package focus card (MVP focuses on `ua-parser-js@0.7.29` only).
- No event ingestion from git log, GitHub API, or Supabase. The data is static.
- No sidebar nav entry (D4 carried forward from PR #41).
- No `/proof` marketing-page CTA (A3 deferred-decision carried forward from PR #41).
- No promotion of the Timeline as a peer of Scanner / Guard.

## 7. Test plan (for PR #45)

This sketch has no tests of its own (it's docs-only). PR #45's tests should include:

### Structural invariants

A new test file (suggested: `scripts/test-trust-timeline.mjs`) enforces:

- Every event has a valid `type` from the six-type taxonomy.
- Every event has a `pr` field that is a positive integer.
- Every event has a `sha` field that matches a 7- or 40-character hex string.
- Every event has a `summary` field that is non-empty and under 280 characters.
- Every event with a `package` field uses the same package across the MVP data set (`ua-parser-js`).
- No two events share the same `(pr, type)` tuple.
- Event count for the MVP equals 8.
- No event has `type: 'policy_change'` (the anti-category from §1).

### Type-safety

`npx tsc --noEmit` clean.

### Regression check

Full `npm run test:ci` suite passes (158+ tests; no regressions in any existing suite).

### Production parity check (manual, documented in PR #45 body)

After deploy, the Timeline page's focus card link to `/proof/gate?package=ua-parser-js@0.7.29` must produce `action=BLOCK` + 4 patterns. Same regression curl as the closeout doc.

### Verbatim discipline

Event summaries in the static data file must be derivable from the merged PR titles or doc section headers — not invented prose. Suggested invariant: every summary string appears (modulo punctuation) in the linked PR's title or the linked doc's section heading. PR #45 author's responsibility, not a mechanical test, but the structure should make it easy to verify.

## 8. Implementation PR sequence

The sketch (this PR) is **PR #44**. The implementation PRs follow in a strict order; each is its own architecture-first decision once the prior one merges.

### Immediate next (after this sketch merges)

- **PR #45 — `feat(ots): add static Trust Timeline proof surface`**
  - Adds `src/data/trustTimeline.ts` (the 8 static events from §3)
  - Adds `src/pages/TrustTimeline.tsx` (the page component, all 7 UI sections from §4)
  - Registers `<Route path="/proof/timeline" element={<TrustTimeline />} />` in `src/App.tsx`
  - Adds `scripts/test-trust-timeline.mjs` (structural invariants from §7)
  - Updates `/proof/gate` footer cross-link panel to point at `/proof/timeline`
  - Optionally: adds the one-line reference in `phase-closeout.md`
  - Scope guardrail: docs + static data + one page + one route + one test file. No backend. No persistence. No new gate-handler code.

### Queued for their own ADRs (do NOT start without explicit user call)

- **Repo-specific timeline.** Requires deciding how repos identify themselves to the Timeline data, where per-repo events come from (git log? Supabase?), and how reviewer accountability records (from the candidate-pipeline arc) show up alongside OTS engineering events. Own ADR.
- **Persistent event log.** Static data has a ceiling. Choosing between git-backed JSON (the candidate-pipeline pattern) and Supabase (the threat_feed pattern) is a strategic decision, not an engineering one. Own ADR.
- **Trust Timeline as Dashboard component.** Embedding Timeline inside a Repo Trust Dashboard (Option B from the next-phase ADR) requires Option B's own architecture sketch first.
- **Cross-arc event surfacing.** Including candidate-pipeline `review_event` records (Promote / Reject / Duplicate from PRs #34/#35/#37) in the OTS Timeline needs an ADR that respects both arcs' doctrines.
- **Buyer / sales surface.** Linking the Timeline from the marketing `/proof` page or the Open Source Trust Center (Option C) — own ADR. Both touch the same A3 deferred-decision constraint from PR #41.

### What this PR (#44) does NOT authorize

- PR #45 is **recommended**. It is not pre-approved by this sketch. The user calls "approve PR #45" or equivalent before any implementation begins.
- No PR after #45 is even queued for sketching without explicit user direction.

## Status

Sketch. Awaiting explicit user decision before implementation.

No application code should begin from this sketch alone.

Recommended implementation PR after this sketch:

**PR #45 — `feat(ots): add static Trust Timeline proof surface`**
