# Architecture Sketch: Open Source Trust Center (MVP)

**Status:** Sketch
**Date:** 2026-06-05
**Approves:** Option C from [ots-next-phase-adr.md](ots-next-phase-adr.md)
**Type:** Docs-only architecture sketch. No application code, no data model, no route registration, no auth, no persistence.

## Purpose

The fourth surface in the product spine answers a different question than the first three.

| Surface | Question | Answered for | Status |
|---|---|---|---|
| `/proof/gate` | What is the trust decision on this dependency right now? | Engineering / CI | Shipped |
| `/proof/timeline` | How did trust decisions change, and why? | Engineering / auditor | Shipped |
| `/projects/:owner/:repo/trust` | What is this repo's current trust posture? | Repo owner / reviewer | Shipped |
| **`/opensource-trust` (Trust Center)** | **Can this project prove how it handles open-source supply-chain trust?** | **Buyer / security reviewer / engineering leader / maintainer** | **Sketched here** |

The Trust Center is where OpenSoyce stops being internal product mechanics and starts being a public trust narrative for a single subject (in the MVP: OpenSoyce itself).

It is **proof-backed marketing surface**, not just marketing surface. Every claim links to a publicly verifiable artifact: a merged PR + SHA, a deployed surface, a doctrine doc, or an existing proof-package child. Claims without anchors are doctrine violations.

This sketch defines the **shape**, not the implementation. The implementation is queued as PR #49.

## Hard guardrail

This document is the sketch. The sketch is not implementation.

The following are explicitly **out of scope** for the sketch and for the implementation PR that follows it:

- No Trust Center code in this PR.
- No route registration (`/opensource-trust` is described, not registered).
- No marketing-page link yet (no inbound from `/`, no inbound from `/about`, no inbound from `/methodology`).
- No data model committed yet (the static data file lands in PR #49, not here).
- No database, no event table, no persistence.
- No auth — MVP is public, single-subject.
- No Trust Vault (private evidence storage).
- No Vanta / Drata export.
- No editable exceptions, no editable trust state.
- No `threat_feed` activation.
- No candidate-pipeline changes.
- No multi-repo dashboard expansion (Trust Center pulls FROM the Dashboard surface; it does not extend it).
- No new detector / policy / catalog edits.
- No new patterns.
- No `hn-exploits-log.json` cleanup (acknowledged stale handoff context; not chased here).
- No sidebar nav promotion (D4 from PR #41 carried forward).

### Doctrine guardrail (most load-bearing)

The Trust Center must not become fluffy marketing copy.

**Allowed to claim**: things that are demonstrable today via a deployed surface or a merged PR on `main`.

**NOT allowed to claim** in the MVP — these become structural anti-patterns enforced by the test suite (see §9):

- "SOC 2 ready" or "SOC 2 compliant"
- "Vanta export ready" or "Drata export ready"
- "Enterprise compliance certified"
- "Continuous monitoring across all repos"
- Any other compliance posture not backed by a shipped surface

The MVP IS allowed to say:

> OpenSoyce shows how trust decisions are made, changed, and recorded.

Because that is what shipped surfaces actually demonstrate.

If the Trust Center text drifts into making claims the product cannot back, the structural test in PR #49 fails. Doctrine is encoded in code, not just in this sketch.

## 1. Trust Center purpose

The Trust Center is the public-facing summary that ties Gate + Timeline + Dashboard together for buyers, security reviewers, engineering leaders, and maintainers — without requiring them to read the proof package docs.

The Trust Center does NOT:

- Re-derive any trust decision (it only summarizes what the shipped surfaces already produced).
- Add a new layer to the four-layer doctrine (detection / evidence / policy / enforcement).
- Promise future capabilities as if they exist today.
- Speak in the brand voice of compliance vendors (SOC 2 / Vanta / Drata) — those are future ADRs.
- Become a replacement for the doctrine page (`docs/proof/doctrine-pattern-enforcement.md`); it links to the doctrine page, not paraphrases it.

The Trust Center DOES:

- Lead the buyer-facing visitor from "is this real?" to "here's the surface that proves it" in under three clicks.
- Make every claim machine-checkable: every card has a proof anchor.
- Reuse the existing brutalist aesthetic from `/proof/*` and `/projects/:owner/:repo/trust`.
- Reuse the existing audit-anchor discipline (PR + SHA + deployed surface URL).
- Stay single-subject for the MVP (one Trust Center, for OpenSoyce itself).

## 2. Audience

Four audiences. The Trust Center renders the same content for all four; each audience finds its primary entry point in a different section.

| Audience | What they want to know | Primary section that serves them | Secondary surface they will click through to |
|---|---|---|---|
| **Buyer** | Should we let this project's evaluations into our supply-chain decisions? | Trust posture (§5.1) + Methodology (§5.6) | `/proof/timeline` for the doctrine in action across time |
| **Security reviewer** | What evidence do you have, and how do I verify it? | Gate proof (§5.2) + Timeline proof (§5.3) | Each proof anchor's GitHub PR / commit URL; the regression curl block from `phase-closeout.md` |
| **Engineering leader** | Can my team rely on this for production trust decisions? | Dashboard proof (§5.4) + Gate proof (§5.2) | `/projects/:owner/:repo/trust` for the focus repo; `/proof/gate?package=...` for a live verification |
| **Maintainer** | If I run OpenSoyce on my project, what can I show? | Methodology (§5.6) + Trust posture (§5.1) | Posture vocabulary; the existing `/patterns` catalog for the gate-active ratio |

Each audience reads the same page. The Trust Center does not branch by audience type — that would be over-engineering for the MVP. The sections are ordered so each audience's primary section is reachable without scrolling past three other sections.

No login. No personalization. No customer accounts. (Per the guardrails.)

## 3. Route shape

```text
/opensource-trust
```

Rationale:

- Distinct from `/proof/*` (which is the proof package surface family). The Trust Center is a public product page, not an internal proof artifact.
- Distinct from `/projects/*` (which is repo-scoped). The Trust Center is subject-scoped — one Trust Center, one subject (OpenSoyce itself in the MVP).
- Distinct from `/about` and `/methodology` (which are existing marketing/explanation pages). The Trust Center is **proof-backed**; the existing pages are not constrained by the proof-anchor doctrine.
- Public, no auth.

Path-level discoverability for the MVP:

- Linked from `/proof/gate` footer cross-link panel (alongside `/patterns`, `/proof/ots-replays`, `/proof/timeline`, `/projects/freewho99/opensoyce/trust`).
- Linked from `/proof/timeline` cross-link panel.
- Linked from `/projects/freewho99/opensoyce/trust` cross-link panel (the Dashboard's existing "Where The Dashboard Fits" section gets one new entry).
- **NOT** linked from sidebar nav (D4 carried forward).
- **NOT** linked from `/proof` marketing page (A3 deferred-decision carried forward from PR #41).
- **NOT** linked from `/`, `/about`, `/methodology`, `/scanner`, `/guard`, `/pricing` in the MVP — those are commercial product pages; linking from them is a separate discoverability ADR.

Single-subject MVP: visiting `/opensource-trust` shows the OpenSoyce Trust Center. Multi-subject (`/opensource-trust/:subject` or similar) is a future ADR. There is no `/opensource-trust/:subject` route in the MVP; the path stays bare.

## 4. Public evidence model

Every claim in the Trust Center is anchored. The data model encodes this so no claim can ship without a proof anchor.

### Proof-anchor types (fixed vocabulary)

| `proofType` | What it means | Example anchor |
|---|---|---|
| `pr` | A merged PR on `main` proves the claim. The card carries the PR number and the merge commit SHA. | `#28` at `392b1df` proves "OSV severity normalization shipped." |
| `live-surface` | A deployed surface proves the claim by rendering it. The card carries the URL. | `/proof/gate?package=ua-parser-js@0.7.29` returning BLOCK proves "the gate evaluates known supply-chain compromises as BLOCK." |
| `doc-anchor` | A markdown doc section on `main` proves the claim. The card carries the GitHub URL with the section anchor. | `docs/proof/doctrine-pattern-enforcement.md#the-four-layers` proves "OpenSoyce documents the four-layer doctrine." |
| `proof-artifact` | One of the six proof-package artifacts proves the claim. The card carries the artifact name and URL. | `docs/proof/phase-closeout.md` proves "the OTS proof-package arc closed with all four named engineering gaps closed." |

### Each claim record

```text
TrustClaim {
  id: string                              // stable slug, used as React key
  audience: 'buyer' | 'security-reviewer' | 'engineering-leader' | 'maintainer' | 'all'
  sectionId: TrustCenterSectionId         // which §5 section this claim renders in
  headline: string                        // imperative or declarative; under 80 chars
  body: string                            // 1-2 sentences, under 280 chars
  proofAnchors: TrustProofAnchor[]        // non-empty array; structural invariant
}

TrustProofAnchor {
  proofType: 'pr' | 'live-surface' | 'doc-anchor' | 'proof-artifact'
  label: string                           // human-readable
  href: string                            // GitHub URL / deployed URL / doc URL
  pr?: number                             // required when proofType = 'pr'
  sha?: string                            // required when proofType = 'pr'
}
```

### Anti-marketing rule (structural)

`TrustClaim.headline` and `TrustClaim.body` must NOT contain any of the following substrings (case-insensitive). This is the doctrine guardrail from above, encoded:

- `SOC 2`
- `SOC2`
- `Vanta`
- `Drata`
- `enterprise compliance`
- `continuous monitoring`
- `compliance certified`
- `audit-ready` (this phrasing implies a credential the product does not have)

A test in PR #49 reads every claim's headline and body, regex-checks against the banned list, and fails if any match. Doctrine in code.

If the product later actually ships SOC 2 readiness or a Vanta export, the banned list is updated in the same PR that ships the underlying capability — never separately, never as "we mean it figuratively" copy.

## 5. Sections

Seven sections, in the exact order the user named, each rendered as a card with the same brutalist aesthetic the `/proof/*` family uses.

### 5.1 Trust posture (lead)

The buyer's first card. Renders:

- Posture label for the MVP subject (OpenSoyce). Uses the same fixed vocabulary as the Dashboard: `use-ready` / `watchlist` / `risky` / `graveyard`. For the MVP: `use-ready` is appropriate for OpenSoyce itself as a Trust Center subject, because the **subject's evaluations are use-ready**, not because the subject has zero risks. The body sentence makes this distinction explicit.
- One-sentence summary: "OpenSoyce shows how trust decisions are made, changed, and recorded. Every claim below links to a deployed surface, a merged PR, or a doc on `main`."
- Primary CTA: "See a real trust decision now" → `/proof/gate?package=ua-parser-js@0.7.29`. The CTA copy must not be aspirational — it must point at a surface that returns real evaluation data, not a "coming soon" page.

### 5.2 Gate proof

Buyer / security reviewer / engineering leader card. Renders:

- Headline: "Trust decisions are made by a deployed gate."
- Body: short paragraph describing the gate API + the live surface.
- Three claims, each with their proof anchors:
  1. **"The gate is callable at a public URL."** Anchor: `live-surface` → `/proof/gate`.
  2. **"The gate evaluates real OSV advisories."** Anchor: `pr` → PR #28 (severity normalization) + PR #30 (compromise indicators).
  3. **"The gate's output is verbatim, not narrated."** Anchor: `proof-artifact` → `docs/proof/before-after-risk-example.md` (three preserved captures).

### 5.3 Timeline proof

Security reviewer / auditor card. Renders:

- Headline: "Trust changes leave a record."
- Body: short paragraph linking to `/proof/timeline`, the static MVP of 8 events.
- Claims:
  1. **"Decision changes are recorded with PR + SHA."** Anchor: `live-surface` → `/proof/timeline`.
  2. **"Historical evidence is preserved verbatim, not edited."** Anchor: `proof-artifact` → `docs/proof/before-after-risk-example.md#capture-history`.
  3. **"The doctrine 'risk does not lose its name' is enforced in test."** Anchor: `pr` → PR #45 (Timeline structural-invariants test).

### 5.4 Dashboard proof

Repo owner / engineering leader card. Renders:

- Headline: "Per-repo trust posture is a deployed surface."
- Body: short paragraph linking to the Dashboard.
- Claims:
  1. **"The Dashboard composes Gate + Timeline + workflow scan into one view."** Anchor: `live-surface` → `/projects/freewho99/opensoyce/trust`.
  2. **"Inventing risky deps is a doctrine violation enforced by test."** Anchor: `pr` → PR #47 (Dashboard structural-invariants test, including the empty-risky-deps copy check).
  3. **"Non-MVP repos render an honest empty state, not fabricated posture."** Anchor: `proof-artifact` → `docs/architecture/repo-trust-dashboard-sketch.md` (the sketch that defined the empty-state discipline).

### 5.5 Exception policy placeholder

Honest empty card. Renders:

- Headline: "Repo-specific gate exceptions: queued in a separate ADR."
- Body: same copy as the Dashboard's exceptions placeholder. Today, exceptions live in the gate handler's per-call exception-lookup path and are scoped per-call, not per-repo. Repo-scoped exception persistence has not shipped.
- Claim:
  - **"This section is intentionally empty pending a future ADR."** Anchor: `doc-anchor` → `docs/architecture/repo-trust-dashboard-sketch.md` (the §9 backlog item).

Empty placeholders in the Trust Center are themselves proof: the product is not pretending to have shipped exception management. Honesty is the product.

### 5.6 Methodology

Reviewer / maintainer card. Renders:

- Headline: "How trust decisions are evaluated."
- Body: links to the four-layer doctrine + the proof-package methodology.
- Claims:
  1. **"OpenSoyce separates detection, evidence, policy, and enforcement."** Anchor: `doc-anchor` → `docs/proof/doctrine-pattern-enforcement.md#the-four-layers`.
  2. **"Coverage is published honestly: 20 of 31 patterns are gate-active."** Anchor: `live-surface` → `/patterns`.
  3. **"A regression curl verifies the live gate any time."** Anchor: `doc-anchor` → `docs/proof/phase-closeout.md#production-verification-recipe`.

### 5.7 Export placeholder

Honest empty card. Renders:

- Headline: "Evidence export: queued in a separate ADR."
- Body: explains that Vanta / Drata export and other compliance-platform integrations are future ADRs; the MVP does NOT claim export readiness.
- Claim:
  - **"This section is intentionally empty pending a future ADR."** Anchor: `doc-anchor` → `docs/architecture/ots-next-phase-adr.md#option-g-vanta-drata-evidence-export`.

Same discipline as the exception placeholder. The MVP is honest about what does not exist.

### Page footer

Cross-link panel matching the brutalist pattern used on `/proof/gate`, `/proof/timeline`, and `/projects/:owner/:repo/trust`. Links to all four product spine surfaces + the doctrine page + the phase closeout. Closes with: *Risk does not lose its name because someone needed to ship.*

## 6. What evidence is public vs private

### Public (the MVP scope)

Every Trust Center card in the MVP renders public evidence:

- Merged PRs on a public GitHub repo
- Public commit SHAs
- Deployed surface URLs that are reachable without authentication
- Doc anchors on `main`

The MVP does not show any private evidence. The MVP has no private evidence to show.

### Private (out of scope for MVP)

Future trust evidence types that would require auth-gated viewing — all are **out of scope** and require their own ADRs:

- Per-customer audit logs
- Internal review trails
- Pre-disclosure incident reports (e.g., embargoed CVE work)
- Customer-scoped trust evidence (e.g., "this specific customer's gate decisions over the last 30 days")
- Reviewer-private exception justifications

If any of these eventually ship, they go in a separate ADR for a **Trust Vault** surface — not bolted onto the Trust Center MVP.

### Visibility discipline (carried into the data model)

For the MVP, every `TrustClaim` is implicitly public. There is no `visibility: 'public' | 'private'` field in the data shape because every entry must be public. Adding a private surface requires the Trust Vault ADR.

If a future PR adds a `visibility` field "preemptively," that's a doctrine violation — it telegraphs an unauthorized future scope. The test in PR #49 should fail on the presence of any `visibility` field in any claim record.

## 7. What reuses Gate / Timeline / Dashboard

### Reused

| Reuse | What it means in practice |
|---|---|
| Doctrine vocabulary | `decision_change` / `firing_set_change` / `parity_event` / `surface_shipped` / `evidence_capture` from PR #45's `TRUST_TIMELINE_EVENT_TYPES`. The Trust Center surfaces this vocabulary in Methodology section copy. |
| Posture labels | `use-ready` / `watchlist` / `risky` / `graveyard` from PR #47's `REPO_TRUST_POSTURE_LABELS`. The Trust Center uses the same vocabulary in §5.1. |
| Audit-anchor discipline | Every claim has a `proofAnchor` with a `pr + sha` or `href`. Same shape philosophy as Timeline (PR + SHA per event) and Dashboard (PR + SHA per reference). |
| Cross-link panel pattern | Footer block with 5–6 entries pointing at the other product spine surfaces. Identical visual treatment. |
| Production verification recipe | The regression curl from `phase-closeout.md` is referenced from §5.6 — not re-rendered, just linked. |
| Brutalist aesthetic | Same `border-4 border-soy-bottle`, `shadow-[*_*_0px_#302C26]`, type-badge color conventions. Implementation PR #49 picks the final palette from existing tokens; no new colors invented. |

### Separate

| Separation | Why |
|---|---|
| Trust Center data file | Per-subject trust narrative, anchored to claims, not per-event (Timeline) or per-repo (Dashboard). Different primary key, different file. |
| Trust Center route | `/opensource-trust` belongs to a new buyer-facing route family, not `/proof/*` or `/projects/*`. |
| Sections | Trust posture + Gate proof + Timeline proof + Dashboard proof + exceptions placeholder + Methodology + export placeholder are Trust-Center-only — they don't appear on Gate, Timeline, or Dashboard. |
| Audience field on claims | The Trust Center introduces an `audience` field because it serves four audiences from one page. Timeline and Dashboard do not have this field; they have one audience each. |
| Future persistence path | Trust Center evidence will likely diverge into a separate storage layout from Timeline events and Dashboard postures. Each gets its own future ADR. |

### Calls the Trust Center does NOT make

- The Trust Center NEVER calls the gate API directly. Buttons link to `/proof/gate?package=...`. Hard Rule 4 from the OTS handoff doc applies.
- The Trust Center NEVER renders Timeline events directly. It links to `/proof/timeline` for the live render. (Compare: the Dashboard DOES render a 3-event preview because it has a per-repo filter. The Trust Center has no equivalent filter and so renders nothing.)
- The Trust Center NEVER calls `scanRepoWorkflows()`. The Dashboard does that for the focus repo; the Trust Center links to the Dashboard.
- The Trust Center is read-only. There is no posting, no editing, no commenting.

## 8. Non-goals

Carried forward from the user's required-scope guardrails, plus extras specific to the sketch.

### From the user's guardrails

- No Trust Center code (this PR is sketch-only).
- No route registration.
- No marketing-page link.
- No database.
- No auth.
- No persistence.
- No Trust Vault.
- No Vanta / Drata export.
- No editable exceptions.
- No `threat_feed` activation.
- No candidate-pipeline work.
- No multi-repo dashboard expansion.
- No new detector / policy / catalog edits.
- No `hn-exploits-log.json` cleanup.

### Added by this sketch

- No SOC 2 / Vanta / Drata / "enterprise compliance" / "continuous monitoring" copy in any claim. Structurally enforced by the anti-marketing test in PR #49.
- No multi-subject Trust Center (one subject — OpenSoyce — for the MVP).
- No customer accounts, no login, no per-customer trust pages.
- No comparison view (Trust Center vs. Trust Center).
- No embeddable trust badges. (Badges are their own future ADR.)
- No alerting, no notifications, no email.
- No charts, no graphs.
- No edit / add UI for claims.
- No client-side filter / search / pagination.
- No `visibility` field on claims (every claim is public; adding visibility telegraphs unauthorized future scope).
- No sidebar nav promotion (D4 carried forward).
- No `/proof` marketing-page CTA (A3 deferred-decision carried forward).
- No links from `/`, `/about`, `/methodology`, `/scanner`, `/guard`, `/pricing` in the MVP — discoverability stays inside the proof / trust surface family.
- No future-tense claims ("OpenSoyce will…", "Coming soon…"). Every claim is present-tense and demonstrable today.

## 9. Test plan (for PR #49)

This sketch has no tests of its own (it's docs-only). PR #49's tests should include:

### Structural invariants

A new test file (suggested: `scripts/test-open-source-trust-center.mjs`) enforces:

1. The MVP data set has exactly one Trust Center subject.
2. That subject's identifier resolves to the OpenSoyce project (`subject.owner === 'freewho99'`, `subject.repo === 'opensoyce'`).
3. Every section ID in the data corresponds to one of the seven section types from §5.
4. Every section has at least one claim.
5. Every claim has a non-empty `headline` under 80 chars.
6. Every claim has a non-empty `body` under 280 chars.
7. Every claim has an `audience` from the four-audience vocabulary plus `'all'`.
8. Every claim has a non-empty `proofAnchors` array.
9. Every `proofAnchor.proofType` is one of `'pr'` / `'live-surface'` / `'doc-anchor'` / `'proof-artifact'`.
10. Every `proofAnchor.label` is non-empty.
11. Every `proofAnchor.href` is non-empty.
12. Every `proofAnchor` with `proofType === 'pr'` has a positive integer `pr` and a 7- or 40-char hex `sha`.

### Anti-marketing invariants (doctrine in code)

13. No claim's `headline` or `body` contains (case-insensitive) any banned substring: `SOC 2`, `SOC2`, `Vanta`, `Drata`, `enterprise compliance`, `continuous monitoring`, `compliance certified`, `audit-ready`.
14. No claim record has a `visibility` field (would telegraph private-evidence scope creep).
15. No claim's `headline` or `body` contains future-tense marketing tells: `coming soon`, `we will`, `roadmap`, `planned for`, `in development`.

### Cross-source invariants

16. Every `proofAnchor` with `proofType === 'pr'` cites a PR that exists in `TRUST_TIMELINE_EVENTS` (PR #45 data) OR is the current arc's Trust Center implementation PR itself (PR #49) OR is a documented exception with an inline comment in the data file.
17. Every `proofAnchor.href` pointing at a deployed surface URL must resolve to either `/proof/gate*`, `/proof/timeline`, `/projects/:owner/:repo/trust`, or `/patterns` — no orphan deployed surfaces linked.
18. The seven sections from §5 each have at least one claim in the MVP data.

### Type-safety

`npx tsc --noEmit` clean.

### Regression check

Full `npm run test:ci` suite passes. Current count post-PR #47: 180-ish; PR #49 adds ~18 invariant tests, target ≈198, no regressions in any existing suite.

### Production verification (manual, documented in PR #49 body)

After deploy, `/opensource-trust` renders all 7 sections, every "RUN LIVE GATE" / "VIEW TIMELINE" / "VIEW DASHBOARD" CTA resolves to a real page that returns real data, and every external GitHub link in proof anchors resolves to a non-404. Production parity check: the regression curl from `phase-closeout.md` must still return `"action":"BLOCK"` (PR #49 does not break anything upstream; the test catches regressions in the linked surfaces, not in the Trust Center itself).

## 10. Implementation PR sequence

The sketch (this PR) is **PR #48**. The implementation PR follows once user approval lands. Future PRs after the MVP are each their own architecture-first decision.

### Immediate next (after this sketch merges)

- **PR #49 — `feat(ots): add static Open Source Trust Center MVP`**
  - Adds `src/shared/openSourceTrustCenter.js` + `src/data/openSourceTrustCenter.ts` (one subject: OpenSoyce; static claim records grouped into the seven §5 sections)
  - Adds `src/pages/OpenSourceTrustCenter.tsx` (page component, all 7 sections, brutalist aesthetic, no API calls)
  - Registers `<Route path="/opensource-trust" element={<OpenSourceTrustCenter />} />` in `src/App.tsx`
  - Adds `scripts/test-open-source-trust-center.mjs` (structural + anti-marketing + cross-source invariants from §9)
  - Updates `/proof/gate`, `/proof/timeline`, and `/projects/freewho99/opensoyce/trust` cross-link panels to each include one new entry pointing at `/opensource-trust`
  - Scope guardrail: docs + static data + one page + one route + one test file + cross-link wiring on three existing pages. No backend. No persistence. No new gate-handler code. No detector edits. No new patterns. No marketing-page link. No sidebar nav.

### Queued for their own ADRs (do NOT start without explicit user call)

- **Trust Vault** — auth-gated private trust evidence (per-customer logs, embargoed incident reports). Own ADR.
- **Embeddable trust badges** — `<script src="...">` or `<a>`-style badges that third-party sites can render to prove "evaluated by OpenSoyce." Own ADR (touches public verification, signing, and abuse vectors).
- **Vanta / Drata export** — compliance-platform integration. Own ADR. Activates a banned-substring removal in the anti-marketing test only after the export actually ships.
- **SOC 2 / continuous-monitoring claim activation** — same pattern: the banned substrings come off the list in the same PR that ships the underlying capability. Never separately.
- **Auth-gated customer Trust Centers** — per-customer trust pages with login. Own ADR. Cannot reuse the public MVP's data shape.
- **Multi-subject Trust Center** — supporting `/opensource-trust/:subject` with multiple projects. Own ADR.
- **Trust Center as marketing landing page** — promoting the Trust Center to `/`, `/about`, `/methodology`, or a primary nav slot. Own ADR. Touches the A3 + D4 carried-forward decisions.
- **Comparison view** — "this Trust Center vs. that Trust Center." Own ADR.
- **Alerting** — notifying Trust Center subjects when their posture changes. Own ADR (requires persistence).

### What this PR (#48) does NOT authorize

- PR #49 is **recommended**. It is not pre-approved by this sketch. The user calls "approve PR #49" or equivalent before any implementation begins.
- No PR after #49 is even queued for sketching without explicit user direction.

## Status

Sketch. Awaiting explicit user decision before implementation.

No application code should begin from this sketch alone.

Recommended implementation PR after this sketch:

**PR #49 — `feat(ots): add static Open Source Trust Center MVP`**
