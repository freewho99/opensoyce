# ADR: Launch Narrative & Positioning (Phase 3 Sketch)

**Status:** Proposed (this ADR)
**Date:** 2026-06-06
**Phase:** 3 — Launch Narrative / Positioning (the "Now" slot in the [roadmap integration doc](./open-soyce-roadmap-integration.md))
**Type:** Docs-only architecture decision record. No application code, no route changes, no link wiring, no copy changes.

**Predecessors:**

- [OTS Next-Phase ADR](./ots-next-phase-adr.md) (#43)
- [Trust Timeline sketch](./trust-timeline-sketch.md) (#44) + impl (#45)
- [Repo Trust Dashboard sketch](./repo-trust-dashboard-sketch.md) (#46) + impl (#47)
- [Open Source Trust Center sketch](./open-source-trust-center-sketch.md) (#48) + impl (#49)
- [Public Trust Spine Closeout](../proof/public-trust-spine-closeout.md) (#50)
- [Discoverability ADR](./public-trust-spine-discoverability-adr.md) (#51) + impl (#52)
- [Roadmap Integration](./open-soyce-roadmap-integration.md) (#53)

This sketch answers one load-bearing question and then sequences the implementation that follows from the answer:

> **What should OpenSoyce say it is now that the proof spine exists?**

It does not authorize implementation. It establishes the positioning decision, the metaphor strategy, the launch-copy constraints, and the implementation PR sequence. The launch-narrative implementation is a separate PR that the user explicitly approves.

## 1. Public positioning after the Trust Spine

### 1.1 What the product has built (recap)

After Phase 1 + Phase 2, OpenSoyce ships:

- A verbatim-API-mirror gate (`/proof/gate`)
- An audit-anchored timeline (`/proof/timeline`)
- A per-repo trust posture (`/projects/:owner/:repo/trust`)
- A public proof narrative (`/opensource-trust`)
- A scoring engine with the Nutrition Label as its primary visual primitive
- A discoverability layer that restrains promotion of the proof spine to inside the proof/trust mental frame

### 1.2 What the homepage currently says

Today's `/` hero (`src/pages/Home.tsx`):

| Slot | Current copy |
|---|---|
| Eyebrow | "The Trust Layer is Here" |
| Headline | "BEFORE YOU BUILD ON OPEN SOURCE, CHECK THE LABEL." |
| Subhead | "OpenSoyce ranks open-source projects by health, forkability, momentum, and adoption readiness — so builders can decide what to use, remix, or avoid." |
| Primary CTA | "SCAN REPO FREE →" |
| Secondary CTA | "EXPLORE LEADERBOARDS →" / "INSTALL GUARD" |
| Visual hero | Nutrition Label render of the featured project |

The hero already gestures at "trust" and at "labels." It does NOT mention the proof spine. The two most product-load-bearing claims today are "ranks projects" and "check the label."

### 1.3 Positioning evolution

**Decision:** The post-spine positioning is an **upgrade of the existing Nutrition Label metaphor**, not a replacement. The Nutrition Label is the entry metaphor; the Trust Spine is the proof; CLI + badge (Phase 4) become the distribution.

The evolution:

| Era | Headline framing | Operational claim |
|---|---|---|
| Pre-spine (current `/`) | "The Nutrition Label for Open Source" | Score every package; render the label. |
| Post-spine (this ADR) | "The Nutrition Label that becomes a trust record for open-source decisions" | Score + remember. The label is the entry point; the record is the proof. |
| Post-distribution (Phase 4) | "The Nutrition Label, the trust record, and the CLI/badge that lets you ship them" | Score + remember + distribute. Adds the developer-facing wedge. |

The first column does not get rewritten today. It gets recorded so the second column knows what it is replacing.

### 1.4 What positioning explicitly does NOT become

The positioning rejects three drifts:

1. **"OpenSoyce is compliance software."** The Trust Center's banned-substring vocabulary protects against this. The positioning frame stays "trust record," not "compliance attestation."
2. **"OpenSoyce auto-fixes your dependencies."** The roadmap integration doc's strategic frame ("automation grows out of the record, not over it") protects against this. The positioning frame stays "record," not "remediation."
3. **"OpenSoyce is a SOC 2 / Vanta / Drata vendor."** Phase 8 is `Blocked until evidence exists`. Until Phase 8 lands, the positioning frame stays out of compliance-vendor adjacency entirely.

## 2. Metaphor strategy: Nutrition Label, Trust Record, or hybrid?

### 2.1 Options considered

| Option | Headline shape | Risk |
|---|---|---|
| **A — Lead with Nutrition Label (current)** | "The Nutrition Label for Open Source." | Risk: the existing positioning does not say what the proof spine added. The label feels stable; the trust record feels invisible. |
| **B — Lead with Trust Record** | "The Trust Record for Open Source." | Risk: drops the strongest existing brand asset (the Nutrition Label visual primitive). New visitors lose the entry point that already works. |
| **C — Hybrid (recommended)** | "The Nutrition Label that becomes a trust record for open-source decisions." | Risk: longer than a single-noun headline. Mitigated by treating the second clause as eyebrow/subhead, not as the headline itself. |

### 2.2 Decision

**Option C — hybrid.** The Nutrition Label stays the entry metaphor (the visual primitive a visitor sees first). The Trust Record is the proof claim (what the label "becomes" when it accumulates evidence across the spine).

### 2.3 Why this works

The Nutrition Label primitive already exists, already renders, and is already referenced across 9 page surfaces (`src/pages/{Home,Lookup,ProjectDetail,About,Settings,Claim,AiLeaderboard,ForkProject}.tsx` + `src/data/blogPosts.ts`). Replacing the primitive in PR-style implementation work risks breaking the visual identity that built the user base.

The Trust Record adds what the label cannot say on its own: the label is a moment; the record is the history. The hybrid framing says "the label is how you read; the record is how you trust."

### 2.4 What the hybrid does NOT promise

- Does not claim every label has a corresponding Trust Center entry. Today only `freewho99/opensoyce` does. Phase 5 + multi-subject Trust Center are required before "every label becomes a trust record" is operationally true.
- Does not claim the Trust Record is auth-gated, personalized, or stored per-customer. Phase 5 (Trust Vault) handles that scope.
- Does not claim historical scoring. The Timeline is event-anchored, not "score-history-per-package." Different claim.

## 3. Hero direction (what the homepage should eventually say)

### 3.1 Hero structure recommendation

The recommended post-spine hero structure (for the implementation PR that follows this sketch):

| Slot | Recommended copy direction |
|---|---|
| Eyebrow | "PROOF-BACKED OPEN-SOURCE TRUST" (or similar, present-tense, no future-tense tells) |
| Headline | "THE NUTRITION LABEL THAT BECOMES A TRUST RECORD." (line-broken: "THE NUTRITION LABEL" / "THAT BECOMES A TRUST RECORD.") |
| Subhead | "Read open-source projects like a label. Trust them like a record. Every claim links to a deployed surface, a merged PR, or a doctrine doc on `main`." |
| Primary CTA | "SCAN REPO FREE →" (unchanged from today) |
| Secondary CTA | "SEE A LIVE TRUST DECISION →" → `/proof/gate?package=ua-parser-js@0.7.29` (new — direct-to-proof entry) |
| Tertiary CTA | "EXPLORE TRUST CENTER →" → `/opensource-trust` (new — D4-adjacent, hero-level rather than nav-level) |
| Visual hero | Nutrition Label (unchanged from today) |

### 3.2 Why this hero direction

- Keeps the Nutrition Label render as the visual hero — the strongest existing brand asset.
- Adds two new CTAs that land the visitor inside the proof spine without forcing nav promotion.
- The "SCAN REPO FREE" CTA stays primary because it is the existing conversion path.
- The "SEE A LIVE TRUST DECISION" CTA promotes the gate page from inside the hero — that is the closest existing analog to a "live demo" that already returns real data.
- The "EXPLORE TRUST CENTER" CTA is the hero-level version of D4 (sidebar promotion). The launch implementation can choose hero-CTA vs sidebar-slot for the Trust Center; this sketch recommends hero-CTA first.

### 3.3 What the hero direction does NOT do

- Does not rewrite the existing scoring-engine copy ("ranks by health, forkability, momentum, adoption readiness"). That copy is fine and accurate.
- Does not add language like "compliance-ready," "audit-grade," "enterprise-grade." Those phrases are explicitly out per Phase 3 doctrine constraints.
- Does not promise the CLI or the badge. Those are Phase 4 surfaces.
- Does not promise auto-remediation, drop-in replacement, or "zero noise."
- Does not change the primary CTA. Conversion path stays as it is.

### 3.4 Constraint: existing legacy copy that conflicts

The Phase 3 implementation must resolve a copy tension that already exists on `/`:

- The "AUDITOR COMPLIANCE" testimonial card mentions `SOC 2 auditor`, `CC6.8`, `CC8.1`, and `Zero friction evidence packaging` — phrases that fail the Trust Center's banned-substring vocabulary if applied there.
- The `SOC 2` nav item in `src/components/Layout.tsx` routes to `/guard?tab=compliance` — a pre-existing surface from before the public trust spine doctrine landed.

This sketch does NOT delete or rewrite those today. The implementation PR has to make one of three calls:

1. **Quarantine the legacy copy** — leave it in place but exclude it from the hero/Trust-Center-adjacent regions. Risky: existing visitor expectations stay attached to it.
2. **Rewrite the legacy copy** — testimonial and `SOC 2` nav item become Trust-Center-vocabulary-safe. Cost: testimonial loses a brand asset that may be load-bearing for buyers in compliance-adjacent industries.
3. **Defer the legacy copy to Phase 8** — the SOC 2 testimonial and nav slot become the operational reason for Phase 8 to actually ship (i.e., either Phase 8 ships and the language becomes legitimate, or Phase 8 doesn't ship and the language is rewritten).

The implementation PR picks one of the three. The sketch leans toward **Option 3 (defer to Phase 8)** because the existing copy is a marketing artifact, not a technical claim, and rewriting marketing-only copy ahead of the actual capability shipping is what got us here.

## 4. D4 — sidebar promotion (revisited, not implemented)

### 4.1 D4 status returning from Phase 2

D4 came into Phase 3 with status: *deferred to launch narrative ADR*. This ADR is that decision.

### 4.2 Three options for sidebar promotion

| Option | Decision shape | Cost | Risk |
|---|---|---|---|
| **D4-A — Add `/opensource-trust` to TRUST nav group** | One entry under `NavGroup.TRUST` in `src/components/Layout.tsx`, alongside Methodology / SOC 2 / About / FAQ. | Very low — same pattern as existing nav items. | Low — landing slot already exists. |
| **D4-B — Promote `/opensource-trust` to CORE nav group** | One entry under `NavGroup.CORE` alongside Scanner / Guard / Compare / Pricing. | Medium — visual hierarchy shift; Trust Center sits beside paid products. | Medium — implies Trust Center is a primary commercial surface. |
| **D4-C — Don't add to sidebar; use hero CTA only** | No sidebar change; rely on the hero "EXPLORE TRUST CENTER →" CTA from §3.1 and the existing five proof/trust surface inbound paths. | Zero. | Low — Trust Center stays inside the proof/trust mental frame. |

### 4.3 Decision

**D4-A — Add `/opensource-trust` to the TRUST nav group.**

The TRUST group already houses Methodology + About + FAQ. The Trust Center is the proof-anchored summary of what Methodology + About describe. The slot is natural; the cost is one nav entry; the risk is bounded.

**D4-B (CORE promotion) is rejected** because it implies the Trust Center is a primary commercial product surface. The roadmap integration doc's strategic frame ("the record, not the action") rejects this.

**D4-C (no nav promotion) is rejected** because it leaves D4 unresolved indefinitely. The roadmap closeout discipline requires phases to actually decide their carried-forward items.

### 4.4 Implementation constraint for D4-A

The sidebar entry, when it ships:

- Label: "Trust Center" or "Open Source Trust" (the implementation picks).
- Icon: `ShieldCheck` (already imported; matches the surface's existing iconography).
- Path: `/opensource-trust`.
- Hint: "Public proof-backed trust record" (or similar, present-tense, no banned substrings).
- Group: `TRUST`.
- Position: after Methodology, before the existing `SOC 2` slot.

The implementation PR's structural-invariants test must extend `scripts/test-open-source-trust-center.mjs`'s linking-page hygiene to include `src/components/Layout.tsx` so the new nav entry's hint and surrounding copy stay free of the banned-substring vocabulary.

## 5. Route alias decision for `/opensource-trust`

### 5.1 The question

Should `/opensource-trust` stay as-is, or get a more launch-friendly alias?

### 5.2 Candidates

| Alias | Trade-offs |
|---|---|
| `/opensource-trust` (current) | Pros: already exists, already linked from 4 surfaces + CTA, already tested. Cons: longer URL, less brand-anchored. |
| `/trust` | Pros: shorter, more memorable, easier to drop in talks/demos. Cons: ambiguous (trust of what?), high collision risk with future product surfaces (Trust Vault, customer trust pages). |
| `/proof` (rename existing `/proof`?) | Rejected outright. `/proof` is the marketing-page surface family; conflating it with the Trust Center route blurs proof/trust mental frame the entire arc preserved. |
| `/trust-center` | Pros: explicit. Cons: longer, less brand-anchored than `/trust`. |
| Both — `/trust` as alias, `/opensource-trust` as canonical | Pros: best of both. Cons: dual-URL surfaces introduce SEO complexity, analytics double-counting, link-rot risk if one is dropped later. |

### 5.3 Decision

**`/opensource-trust` stays canonical. No alias today.** The launch-implementation PR does NOT change the route.

### 5.4 Why defer the alias

- Renaming costs more than not renaming: every existing inbound link (`/proof/gate`, `/proof/timeline`, `/projects/freewho99/opensoyce/trust`, `/proof` CTA, sidebar entry once added) must update simultaneously, plus redirects from the old URL must be installed, plus the route registration changes in `src/App.tsx`, plus the structural-invariants test's allowlist of valid surface families updates.
- `/trust` is ambiguous against future Trust Vault scope (Phase 5). Pre-committing the short URL to the public Trust Center makes the private Trust Vault renaming harder.
- The hero direction in §3.1 lets the visitor click "EXPLORE TRUST CENTER →" without ever typing the URL. The URL is the canonical anchor; the visitor never types it.
- If post-launch evidence shows the long URL is genuinely friction (analytics: low CTR on the hero CTA correlating with URL friction in marketing-channel touchpoints), an alias ADR can land in a follow-up phase.

### 5.5 What this decision does NOT preclude

- A future ADR may add `/trust` as an alias if Phase 5 (Trust Vault) lands on a different route family (e.g., `/customer-trust`, `/trust-vault`).
- A future ADR may rename `/opensource-trust` to a shorter slot when multi-subject support lands (a multi-subject route shape is `/<subject-namespace>/...`, which the bare `/opensource-trust` does not anticipate).

## 6. Launch-copy constraints

The implementation PR for Phase 3 is subject to the strictest copy hygiene yet. The launch surface inherits every constraint from prior phases plus three new ones.

### 6.1 Inherited constraints (from prior ADRs)

- Trust Center banned-substring vocabulary applies to every page touched by the launch: `SOC 2`, `SOC2`, `Vanta`, `Drata`, `enterprise compliance`, `continuous monitoring`, `compliance certified`, `audit-ready`. Case-insensitive.
- Future-tense marketing tells banned: `coming soon`, `we will`, `roadmap`, `planned for`, `in development`.
- Soft-banned marketing verbs around `/opensource-trust` links: `Learn more`, `Discover`, `Explore`, `Unlock` (word-boundary match — `Explore` as a verb is banned; `EXPLORE LEADERBOARDS` in the existing hero CTA needs review, since `Explore` there is verb-form). The implementation must either reword that CTA or scope the soft-ban to Trust-Center-adjacent regions only. **Sketch recommendation:** scope-narrow the soft-ban to within 400 chars of any `/opensource-trust` link, matching the test's existing windowing logic.

### 6.2 New Phase-3-specific constraints

- **No "zero noise" / "noise-free" / "false-positive elimination" copy.** Even though VEX/reachability are Phase 6 (Later), the marketing impulse to promise noise reduction is highest at launch. Banned in Phase 3 copy to prevent setting expectations Phase 6 has to either meet or break.
- **No "drop-in" / "auto-fix" / "auto-replace" / "remediate" copy.** Phase 7 + Phase 9 doctrine. Banned at launch to protect against the "OpenSoyce will silently rewrite your dependencies" expectation.
- **No "AI agent" / "agentic" / "autonomous" framing on `/`.** The product is a trust record, not an agent. Launch copy that frames OpenSoyce as an AI agent misaligns the strategic frame from §1.4.

### 6.3 Encoded constraints (recommendation for the implementation PR)

The implementation PR should extend the Trust Center's linking-page hygiene suite to enforce the §6.2 list on the hero region of `src/pages/Home.tsx`, the About page, and the eventual sidebar `Trust Center` slot's hint copy.

Suggested vocabulary addition (proposed for the implementation PR, not added in this sketch PR):

```text
PHASE_3_LAUNCH_BANNED_SUBSTRINGS = [
  // §6.2 list
  'zero noise',
  'noise-free',
  'noise free',
  'false-positive elimination',
  'false positive elimination',
  'drop-in',
  'drop in replacement',
  'auto-fix',
  'auto fix',
  'auto-replace',
  'auto replace',
  'autonomous agent',
  'agentic remediation',
]
```

The implementation PR adds this list to `src/shared/openSourceTrustCenter.js` (or a Phase-3-specific module) and wires it into the linking-page hygiene test.

### 6.4 What the launch-copy constraints do NOT govern

- The existing scoring-engine copy ("ranks by health, forkability, momentum, adoption readiness") is unaffected. That is operational language about an existing capability.
- The Nutrition Label primitive's existing label text is unaffected.
- The candidate-pipeline arc's review-UI copy is unaffected (parallel arc, not launch surface).
- The CLI's eventual help text (Phase 4) is its own copy regime, not governed here.

## 7. Implementation PR sequence

This ADR (PR #54) is docs-only. After explicit user approval, the implementation lands across **two PRs**, not one. Splitting reduces blast radius.

### 7.1 First implementation PR (recommended next)

**`feat(launch): post-spine hero + sidebar Trust Center promotion`**

- Updates `src/pages/Home.tsx` hero slots per §3.1 (eyebrow, headline, subhead, secondary + tertiary CTAs). Primary CTA unchanged. Visual hero unchanged.
- Adds `Trust Center` entry to the TRUST nav group in `src/components/Layout.tsx` per §4.4.
- Extends `scripts/test-open-source-trust-center.mjs` linking-page hygiene to cover `src/pages/Home.tsx` hero region + new `Layout.tsx` nav slot.
- Adds Phase-3-specific banned-substring vocabulary per §6.3.
- Scope guardrail: hero + one nav slot + one test extension. No about / methodology / scanner / guard / pricing changes. No new routes. No copy work on the testimonial. No copy work on the existing `SOC 2` nav slot.

### 7.2 Second implementation PR (legacy-copy decision)

**`docs|feat: resolve pre-spine legacy launch copy`**

Form depends on which §3.4 option the user picks:

- If **Option 1 (quarantine)**: docs-only PR that records the quarantine boundary and adds a structural test asserting that legacy copy stays outside the launch-Trust-Center-adjacent regions.
- If **Option 2 (rewrite)**: feat PR that rewrites the SOC 2 testimonial + nav slot per Phase-8-banned-substring discipline.
- If **Option 3 (defer to Phase 8)**: docs-only PR that records the deferral and adds a TODO marker tied to Phase 8 activation.

This PR is named here but explicitly NOT pre-authorized. The user picks the option after seeing the first implementation PR land.

### 7.3 Third implementation PR (closeout)

**`docs(launch): Phase 3 launch narrative closeout`**

Mirrors `docs/proof/public-trust-spine-closeout.md`. Documents what shipped in this phase, what deferred decisions remain, what is explicitly NOT shipped, what future ADRs are blocked behind. The Phase 3 closeout is what moves the roadmap status from "Now" to "✅ Closed" and promotes Phase 4 (OSS Distribution) from "Next" to "Now."

## 8. What remains blocked

This phase explicitly does NOT lift or relax any prior-phase doctrine. Specifically:

### 8.1 Banned-substring vocabulary stays banned

`SOC 2` / `SOC2` / `Vanta` / `Drata` / `enterprise compliance` / `continuous monitoring` / `compliance certified` / `audit-ready` all remain banned in Trust Center claims and (per §6.1 inheritance) in all launch surfaces.

### 8.2 Phase 4 surfaces stay out of launch copy

- No CLI promise in launch copy. The CLI is Phase 4; mentioning it before Phase 4 ships violates evidence-first sequencing.
- No badge promise in launch copy. Same logic.
- The launch copy may say "CLI" only where the existing nav item (`/cli`) is referenced; the new launch copy may not add CLI promises.

### 8.3 Phase 5+ surfaces stay blocked

- No Trust Vault language on launch surfaces.
- No private-evidence promise.
- No per-customer trust page promise.
- No `visibility` field on any data shape.
- No "your team's trust history" / "your private evidence" copy.

### 8.4 Phase 6 surfaces stay blocked

- No "zero noise" / VEX / reachability / sandbox promises (§6.2).

### 8.5 Phase 7 + 9 surfaces stay blocked

- No "auto-fix" / "auto-replace" / "drop-in replacement" / "remediation" copy (§6.2).
- No agentic / autonomous framing on `/`.

### 8.6 Phase 8 surfaces stay blocked

- No compliance-vendor adjacency. No SOC 2 / Vanta / Drata launch claims.
- The existing `SOC 2` nav slot and testimonial are pre-existing legacy artifacts handled by §3.4. Their resolution is NOT a green light for new compliance-vendor copy.

### 8.7 Cross-cutting blocks

- No `threat_feed` activation copy.
- No candidate-pipeline activation copy.
- No `hn-exploits-log.json` cleanup.
- No homepage rewrite outside the hero region.
- No `/about`, `/methodology`, `/scanner`, `/guard`, `/pricing` changes in PR #54 implementation.
- No new routes.
- No new data modules.
- No persistence.

## 9. Status

Proposed. Awaiting explicit user decision before implementation.

Docs only. No application code, no link changes, no route changes, no copy changes.

Recommended implementation PR after this sketch:

**`feat(launch): post-spine hero + sidebar Trust Center promotion`** (per §7.1)

Recommended, not pre-authorized. The user calls "approve Phase 3 implementation PR" (with the option-1/2/3 call for the legacy copy) before any work begins.

---

> The Nutrition Label is the entry. The Trust Record is the proof. The record is what OpenSoyce remembers when nobody is watching.
