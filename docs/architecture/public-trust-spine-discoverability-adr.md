# ADR: Public Trust Spine Discoverability

**Status:** Proposed (this ADR)
**Date:** 2026-06-06
**Phase:** Public Trust Spine Activation (Option A from the [Public Trust Spine Phase Closeout](../proof/public-trust-spine-closeout.md) §10)
**Predecessors:**
- [OTS Next-Phase ADR](./ots-next-phase-adr.md) (#43)
- [Trust Timeline sketch](./trust-timeline-sketch.md) (#44) + impl (#45)
- [Repo Trust Dashboard sketch](./repo-trust-dashboard-sketch.md) (#46) + impl (#47)
- [Open Source Trust Center sketch](./open-source-trust-center-sketch.md) (#48) + impl (#49)
- [Public Trust Spine Closeout](../proof/public-trust-spine-closeout.md) (#50)

**Type:** Docs-only architecture decision record. No application code, no route changes, no link changes, no copy changes. Authorizes the implementation PR but does not pre-approve it.

This ADR resolves the two discoverability decisions that were intentionally deferred through the building of the public trust spine:

- **A3** — should `/proof` link to `/opensource-trust`?
- **D4** — should the primary sidebar nav include `/opensource-trust`?

And it widens the question to the full promotion surface so the implementation PR is one disciplined decision instead of a sequence of one-off link patches.

## 1. Context

After PR #50 (the spine closeout) merged, the public trust spine is:

| Surface | Route | Status |
|---|---|---|
| Gate | `/proof/gate` | Live |
| Trust Timeline | `/proof/timeline` | Live |
| Repo Trust Dashboard | `/projects/:owner/:repo/trust` | Live (one focus repo) |
| Open Source Trust Center | `/opensource-trust` | Live (one subject) |

All four surfaces are public, no auth, proof-anchored, and structurally guarded against marketing drift. Today, `/opensource-trust` is reachable from three places only:

1. `/proof/gate` footer panel
2. `/proof/timeline` cross-link panel
3. `/projects/freewho99/opensoyce/trust` cross-link panel

Every one of those inbound paths sits inside the proof / trust surface family. A visitor who lands on `/`, `/about`, `/methodology`, `/scanner`, `/guard`, `/pricing`, or `/proof` cannot find the Trust Center without already knowing it exists.

That under-promotion was correct while the spine was being built. It is no longer correct now that the spine is closed. The product question is now:

> Do we expose OpenSoyce's trust proof as a primary buyer-facing asset?

This ADR answers: **yes, but with restraint.** The Trust Center is proof-backed and structurally guarded against marketing drift. It can be promoted without violating the doctrine that built it. But promotion has its own failure mode — over-promotion turns a proof asset into generic marketing copy. The recommended path below is the minimum promotion that closes the discoverability gap.

## 2. Decision to make

There are two layered decisions:

### Decision 1 — A3 + D4 (the explicit deferrals)

| Deferral | Question | This ADR's recommendation |
|---|---|---|
| **A3** | Should `/proof` link to `/opensource-trust`? | Yes — one Trust Center CTA card in the proof / trust cluster on `/proof`. |
| **D4** | Should the primary sidebar nav include `/opensource-trust`? | No — not yet. The sidebar slot is a higher-cost promotion than `/proof` and should wait for the launch narrative pass. |

### Decision 2 — the broader promotion surface

The promotion surfaces under consideration:

| Surface | Recommended in this ADR? | Reason |
|---|---|---|
| `/` (homepage) | No | Homepage rewrite is launch-narrative work. Promoting Trust Center to `/` makes the spine a hero asset before the narrative supports it. Defer. |
| `/about` | No | About-page promotion is brand-voice work. Defer with `/` to launch narrative. |
| `/methodology` | No | Methodology is already linked FROM the Trust Center (§5.6 of the OST sketch). The reverse link risks circularity. Defer. |
| `/scanner` | No | Commercial product surface. Mixing buyer-facing trust proof with scanner product copy needs its own decision. Defer. |
| `/guard` | No | Same as `/scanner`. Defer. |
| `/pricing` | No | Pricing pages carry commercial intent. Adding trust-proof CTAs there blurs "buy this" with "here is proof we are credible." Defer. |
| `/proof` | **Yes** | `/proof` is the proof-package marketing page and already references the surfaces the Trust Center summarizes. One CTA card closes A3. |
| Sidebar nav | No | Primary-nav promotion affects every page and is the highest-cost discoverability lever. Defer to launch narrative. |
| Site footer | **Yes** (one link, in the proof / trust cluster only) | Footer is the lowest-cost universal discoverability. One link in an existing proof / trust cluster (if one exists) costs no visual hierarchy. If no such cluster exists in the footer today, defer this part too. |

Implementation outcome (if approved): **one or two** link additions site-wide. Not eight, not twelve.

## 3. Surfaces considered

Walking through each candidate surface with the same framework: what visitor sees it, what cost does the promotion carry, what does adding the Trust Center change about the visitor's path.

### 3.1 `/` (homepage)

- **Visitor:** first-time, brand-curious, no context.
- **Cost of promotion:** hero-section real estate. Promoting a proof-backed page to the hero turns the whole site into a trust-proof site. The other product surfaces (scanner, guard, pricing) compete for the same attention.
- **Does the Trust Center land well here?** Not without copy work. The Trust Center is "here is proof we handle supply-chain trust well." That is a buyer-late-funnel claim, not a first-visit hook.
- **Recommendation:** Defer. Promote to `/` only after a launch narrative pass that re-ranks the hero copy.

### 3.2 `/about`

- **Visitor:** brand-curious, looking for who-we-are.
- **Cost:** brand-voice mismatch. About pages are biographical; the Trust Center is operational proof.
- **Recommendation:** Defer to launch narrative. The Trust Center is more compelling than typical About-page proof points, but the framing belongs in launch-narrative copy, not as an ad-hoc link.

### 3.3 `/methodology`

- **Visitor:** reviewer-grade, already deep in evaluation.
- **Cost:** circularity. The Trust Center already links TO `/methodology` (in §5.6). Adding a link back creates a two-way loop that is easy to walk in circles in.
- **Recommendation:** No back-link. Methodology stays one-way: Trust Center points at methodology, not the reverse.

### 3.4 `/scanner` and `/guard`

- **Visitor:** product-evaluation intent. They are considering paid OpenSoyce products.
- **Cost:** mixes proof posture with commercial offer. A buyer evaluating Guard sees both "here is what Guard does" and "here is proof OpenSoyce itself handles trust well." That is two different sales motions in the same view.
- **Recommendation:** Defer. The integration shape — what link copy, what placement, what frequency — needs its own decision. Possibly part of a future "buyer trust footer" pattern that lives on all commercial product pages.

### 3.5 `/pricing`

- **Visitor:** late-funnel, evaluating cost.
- **Cost:** "we are credible" promotion on a pricing page reads like a trust badge attempting to justify cost. Buyers see through this.
- **Recommendation:** Defer. If the Trust Center belongs on pricing at all, it belongs as a separate buyer-trust pattern (own ADR), not as a one-off link.

### 3.6 `/proof` ← recommended in this ADR

- **Visitor:** already looking for proof. They navigated to a page literally titled "proof."
- **Cost:** very low. `/proof` already discusses the Gate, Timeline, Dashboard, and the four-layer doctrine. The Trust Center is the public summary of those same surfaces.
- **Does the Trust Center land well here?** Yes. The visitor is already in the proof / trust mental frame.
- **Recommendation:** **Add one CTA card** linking `/proof` → `/opensource-trust`. Position it inside the existing proof-surface cluster. Copy stays factual: it summarizes what the Trust Center is, not why visitors should be impressed.

### 3.7 Sidebar nav

- **Visitor:** every visitor, every page.
- **Cost:** highest possible. Every page on the site gains a Trust Center entry in primary nav. Visual hierarchy shifts.
- **Recommendation:** Defer. Sidebar promotion is a launch-day decision, not a closing-the-deferral decision.

### 3.8 Site footer

- **Visitor:** every visitor, every page (low-attention).
- **Cost:** low. Footer real estate is cheap. The risk is footer-clutter, not over-promotion.
- **Recommendation:** Add one Trust Center link to the footer IF and ONLY IF the footer already groups proof / trust links together. If the current footer doesn't have such a cluster, defer this part too — adding a one-off Trust Center link to a generic footer is no better than not adding it.

## 4. Recommended promotion path

The full recommendation, condensed:

1. **`/proof` gets ONE Trust Center CTA card** in the existing proof-surface cluster.
2. **The site footer gets ONE Trust Center link** in an existing proof / trust cluster, IF one exists. Otherwise, defer.
3. **Nothing else changes.** Not `/`, not `/about`, not `/methodology`, not `/scanner`, not `/guard`, not `/pricing`, not the sidebar.
4. **The four existing inbound paths stay intact.** No removal, no rewording, no consolidation.

After implementation, the Trust Center is reachable from:

- `/proof` (new — one CTA card)
- `/proof/gate` (existing footer panel)
- `/proof/timeline` (existing cross-link panel)
- `/projects/freewho99/opensoyce/trust` (existing cross-link panel)
- Site footer (new — conditional one link)

Five surfaces, all inside the proof / trust mental frame. The visitor still needs to be looking for proof to find it — but if they are, the Trust Center is now visibly present.

## 5. A3 resolution

**A3:** Should `/proof` link to `/opensource-trust`?

**Decision:** Yes.

**Implementation shape:** One CTA card on `/proof`, positioned in the existing proof-surface cluster (alongside Gate / Timeline / Dashboard references if present). Card copy stays factual:

> **Open Source Trust Center**
> The public summary of how OpenSoyce handles open-source supply-chain trust. Every claim links to a deployed surface, a merged PR, or a doctrine doc on `main`.
> `/opensource-trust →`

The copy must not contain banned substrings from the Trust Center's own anti-marketing list (`SOC 2`, `SOC2`, `Vanta`, `Drata`, `enterprise compliance`, `continuous monitoring`, `compliance certified`, `audit-ready`). The same banned-substring vocabulary that protects `/opensource-trust` page copy must protect every page that links to it.

**A3 — RESOLVED.**

## 6. D4 resolution

**D4:** Should the primary sidebar nav include `/opensource-trust`?

**Decision:** No, not yet.

**Why not yet:** Sidebar promotion changes every page on the site. It is a launch-day decision that supports a broader narrative shift, not a closing-the-deferral decision. The cost of premature sidebar promotion is permanent visual hierarchy change for a static-MVP-backed surface.

**When this gets revisited:** When the next ADR — the launch narrative pass — decides whether OpenSoyce reframes itself around the proof spine. That ADR may include sidebar promotion as part of a coordinated change.

**D4 — RESOLVED FOR THIS PHASE.** It returns to the open decisions list inside the launch narrative ADR, not as a standalone item.

## 7. Copy constraints

Every page that links to `/opensource-trust` is subject to the same anti-marketing discipline that protects the Trust Center itself. Specifically:

### Hard structural constraints

- **Banned substrings on the link copy + surrounding paragraph:** `SOC 2`, `SOC2`, `Vanta`, `Drata`, `enterprise compliance`, `continuous monitoring`, `compliance certified`, `audit-ready`. Case-insensitive.
- **Banned future-tense tells:** `coming soon`, `we will`, `roadmap`, `planned for`, `in development`. The Trust Center is present-tense, demonstrable today; the link copy must match.
- **No promise expansion:** the linking page must not claim the Trust Center proves things the Trust Center itself does not claim. The Trust Center claims OpenSoyce shows how trust decisions are made, changed, and recorded — not that OpenSoyce is "compliance certified" or "enterprise ready."

### Recommended invariant test (for the implementation PR)

The implementation PR's structural-invariants test should read every page that links to `/opensource-trust` and assert that the paragraph containing the link does not contain any banned substring. The test enforces what review-fatigue cannot.

Suggested implementation: extend `scripts/test-open-source-trust-center.mjs` with a "linking-page copy hygiene" suite that file-reads `src/pages/Proof.tsx` (and the footer component, if a footer link lands) and runs the same banned-substring check that the Trust Center claims themselves are run through.

### Soft constraints (style)

- Link copy is factual, not aspirational.
- No exclamation marks.
- No "discover", "explore", "unlock" — verbs that imply a marketing reveal.
- The link is named: `/opensource-trust →` or `Open Source Trust Center →`, not `Learn more →`.

## 8. Non-goals

This ADR explicitly does NOT authorize:

- Any `src/` change. (Docs-only.)
- Any route change.
- Any link change. (The implementation PR adds the links, not this PR.)
- Homepage hero rewrite.
- About-page rewrite.
- Methodology back-link.
- Scanner / Guard / Pricing integration.
- Sidebar nav promotion.
- Sidebar nav demotion of any existing entry.
- Site-wide footer rework.
- New routes.
- New static MVP data.
- New surfaces.
- Trust Vault scope.
- Multi-subject Trust Center scope.
- `threat_feed` activation.
- Candidate-pipeline merge into Trust Center scope.
- Vanta / Drata export.
- SOC 2 / continuous-monitoring claims.
- Embeddable trust badges.
- Launch narrative copy (it is its own future PR — see §10).
- `hn-exploits-log.json` cleanup.
- Reopening A3 in any form other than the resolution above.
- Reopening D4 in any form other than its referral to the launch narrative ADR.

## 9. Implementation PR sequence

This ADR (PR #51) is docs-only. The implementation PR follows after explicit user approval.

### Immediate next (recommended, not pre-authorized)

- **PR #52 — `feat(ots): add restrained Trust Center discoverability links`**
  - Adds one CTA card on `src/pages/Proof.tsx` linking to `/opensource-trust`. Card text matches §5 copy.
  - Adds one footer link to `/opensource-trust` IF the existing footer has a proof / trust cluster. If not, skip this part of the change (do not add to a generic footer).
  - Extends `scripts/test-open-source-trust-center.mjs` with a "linking-page copy hygiene" suite that enforces the banned-substring + future-tense + soft-constraint vocabulary on every linking page.
  - No changes to `/`, `/about`, `/methodology`, `/scanner`, `/guard`, `/pricing`, or sidebar nav.
  - No new routes.
  - No new shared / data modules.
  - No persistence.
  - Test count expectation: roughly +3 to +5 invariants (one per linking page, plus the cluster-presence check).

### Queued for separate ADRs (do NOT start without explicit user direction)

- **Launch narrative ADR** — `/`, `/about`, sidebar, brand-voice repositioning. Returns D4 to the open list.
- **Buyer-trust pattern ADR** — `/scanner`, `/guard`, `/pricing` integration via a coordinated "buyer trust" component or footer pattern.
- **Footer redesign ADR** — only if the current footer does not have a proof / trust cluster and the launch narrative pass calls for one.

## 10. Future launch narrative path

This ADR resolves the deferred discoverability decisions at the cheapest cost: one CTA, one optional footer link, no primary-nav change. That is intentionally minimal.

The next discoverability phase is the **launch narrative pass**:

- Hero-section copy on `/` that re-ranks OpenSoyce around the proof spine.
- About-page reframing that positions OpenSoyce as proof-backed.
- Possible sidebar promotion of `/opensource-trust` to primary nav.
- Possible relocation of `/opensource-trust` to a top-level slot (e.g. `/trust`).

That phase is its own ADR. This ADR does not pre-authorize any of it.

The launch narrative pass is recommended to happen AFTER:

1. PR #52 (the restrained discoverability implementation) ships and the production parity check passes.
2. There is at least one external stimulus that warrants the launch — public demo, security review, customer ask, press cycle — instead of a self-initiated rewrite.

Reframing the homepage without an external trigger risks producing launch copy that no audience is ready to receive. The closeout doctrine ("risk does not lose its name because someone needed to ship") applies here too: don't promote without proof of demand.

### What the launch narrative ADR will need to decide (when it lands)

- Hero copy structure (problem → proof → product).
- Re-ranking of `/scanner`, `/guard`, `/pricing` vs. `/opensource-trust` in the visitor's first 30 seconds.
- Sidebar slot for `/opensource-trust` (returns D4 to open).
- Whether `/opensource-trust` is renamed to a shorter slot (e.g. `/trust`) and what happens to the original URL.
- Whether the Trust Center subject becomes multi-subject (interacts with the Multi-subject Trust Center ADR).
- Whether the Trust Center's anti-marketing banned-substring list expands or contracts.

None of those is in scope for this PR or for the implementation PR that follows it.

---

## Status

Proposed. Awaiting explicit user decision before any link work.

Docs only. No application code, no link changes, no route changes, no copy changes.

Recommended implementation PR after this ADR:

**PR #52 — `feat(ots): add restrained Trust Center discoverability links`**

(Recommended, not pre-authorized. The user calls "approve PR #52" before any link work begins.)
