# Phase 3 Closeout — Launch Narrative / Positioning

**Status:** Closed
**Date:** 2026-06-06
**Phase:** 3 — Launch Narrative / Positioning
**Predecessor phase:** [Phase 2 — Trust Spine Activation (closed at `5b61c3c`)](./public-trust-spine-closeout.md)
**Successor phase:** Phase 4 — OSS Distribution: CLI + Trust Badge (promoted from "Next" to "Now" by this PR)
**Arc PRs:** #54 → #55 → #56 (one ADR sketch, one feat implementation, one docs-only deferral)

This closeout records what shipped, what stayed deferred, what doctrine carried forward, and which roadmap status moves on `main` because of this phase. It is the third and final Phase 3 implementation PR per the [launch narrative ADR](../architecture/launch-narrative-positioning-adr.md) §7.3.

No application code, no test, no copy changes. The closeout updates the roadmap status table (Phase 3 from "Now" → "✅ Closed", Phase 4 from "Next" → "Now") in the same PR so the roadmap doc and this closeout doc agree at the same SHA.

## 1. What shipped

| Surface | Change | Shipped in |
|---|---|---|
| Homepage hero eyebrow | "The Trust Layer is Here" → "PROOF-BACKED OPEN-SOURCE TRUST" | PR #55 (`4735cc0`) |
| Homepage hero headline | "BEFORE YOU BUILD ON OPEN SOURCE, CHECK THE LABEL." → "THE NUTRITION LABEL THAT BECOMES A TRUST RECORD." | PR #55 (`4735cc0`) |
| Homepage hero subhead | scoring-engine framing → "Read open-source projects like a label. Trust them like a record. Every claim links to a deployed surface, a merged PR, or a doctrine doc on `main`." | PR #55 (`4735cc0`) |
| Homepage hero secondary CTA | "EXPLORE LEADERBOARDS →" → "SEE A LIVE TRUST DECISION →" (`/proof/gate?package=ua-parser-js@0.7.29`) | PR #55 (`4735cc0`) |
| Homepage hero tertiary CTA | "INSTALL GUARD" → "VIEW TRUST CENTER →" (`/opensource-trust`) | PR #55 (`4735cc0`) |
| Sidebar TRUST nav group | Trust Center entry added after Methodology, before SOC 2 | PR #55 (`4735cc0`) |
| Phase-3 banned vocabulary | 13 new banned substrings encoded in `OPEN_SOURCE_TRUST_CENTER_PHASE_3_LAUNCH_BANNED_SUBSTRINGS` | PR #55 (`4735cc0`) |
| Linking-page hygiene test | Home + Layout added; line-mode dispatcher for config-array files; +1 Phase-3 invariant (23 → 24) | PR #55 (`4735cc0`) |
| Legacy SOC 2 deferral doc | `docs/architecture/legacy-soc2-copy-deferral.md` with TODO ID `LEGACY_SOC2_COPY_DEFERRAL` | PR #56 (`394690a`) |
| Launch Narrative ADR | `docs/architecture/launch-narrative-positioning-adr.md` | PR #54 (`72ff728`) |

After Phase 3:
- The post-spine positioning ("Nutrition Label that becomes a Trust Record") is the public framing on `/`.
- The Trust Center is reachable from primary sidebar nav (TRUST group), not just from the proof/trust surface family.
- 13 launch-specific banned phrases are enforced on every page that links to `/opensource-trust`.
- The legacy SOC 2 marketing copy is honestly named, dated, and owned debt — visible on `main`, gated to Phase 8.

## 2. PR lineage

| PR | SHA | Type | Title | Role |
|---|---|---|---|---|
| #54 | `72ff728` | docs | sketch launch narrative and positioning ADR | Phase 3 sketch ADR. Encodes the load-bearing question ("what should OpenSoyce say it is now that the proof spine exists?"), the metaphor strategy (hybrid: Nutrition Label entry + Trust Record proof), D4 resolution (D4-A: TRUST nav group), route-alias decision (`/opensource-trust` stays canonical), launch-copy constraints, and the three-PR implementation split. |
| #55 | `4735cc0` | feat | post-spine hero + sidebar Trust Center promotion | First Phase 3 implementation PR. Hero copy update + TRUST nav entry + Phase-3 banned-substring vocabulary + linking-page hygiene extension with line-mode dispatcher. "VIEW" substituted for the ADR's recommended "EXPLORE" to satisfy the PR #52 soft-banned-verb hygiene invariant. |
| #56 | `394690a` | docs | defer legacy SOC 2 copy to Phase 8 | Second Phase 3 implementation PR. Records Option 3 from launch ADR §3.4: legacy SOC 2 marketing copy stays as-is, becomes operational pressure for Phase 8 to actually ship. TODO ID `LEGACY_SOC2_COPY_DEFERRAL`. |
| #57 | _(this PR)_ | docs | close out Phase 3 launch narrative | Third Phase 3 implementation PR. This doc + roadmap status update. |

Three PRs in the arc, four counting this closeout. Mirrors the Phase 2 (Trust Spine Activation) PR-count discipline: one sketch, one or two implementation PRs, one closeout doc.

## 3. Current guardrails (post-Phase-3)

Every guardrail from prior closeouts carries forward, plus the new Phase 3 additions.

### 3.1 Audit-anchor discipline (carried forward)

Every claim on every shipped trust surface still carries `pr` + `sha` or a `proofAnchors` array with `pr` / `live-surface` / `doc-anchor` / `proof-artifact` types. No claim ships unanchored. No structural-invariant test was relaxed by Phase 3.

### 3.2 Honest empty state (carried forward)

- Trust Center exception placeholder and evidence-export placeholder still render honest deferred-ADR copy, not "coming soon" marketing.
- Repo Trust Dashboard's risky-deps empty state still renders explicit copy.
- Unknown owner/repo on Dashboard still renders honest empty card.
- Unknown subject on Trust Center still renders honest empty card.

### 3.3 Anti-marketing structural enforcement (extended by Phase 3)

The banned-substring vocabulary on every `/opensource-trust` link's hygiene window now includes:

**Pre-Phase-3 (still enforced):**
- `SOC 2`, `SOC2`, `Vanta`, `Drata`, `enterprise compliance`, `continuous monitoring`, `compliance certified`, `audit-ready`

**Future-tense tells (still enforced):**
- `coming soon`, `we will`, `roadmap`, `planned for`, `in development`

**Soft-banned marketing verbs (still enforced; word-boundary match):**
- `Learn more`, `Discover`, `Explore`, `Unlock`

**Phase-3 launch-specific (new in PR #55):**
- `zero noise`, `noise-free`, `noise free`, `false-positive elimination`, `false positive elimination`
- `drop-in`, `drop in replacement`, `auto-fix`, `auto fix`, `auto-replace`, `auto replace`
- `autonomous agent`, `agentic remediation`

**`visibility` field guard (still enforced):**
- No claim record carries a `visibility` field; private-evidence scope creep is structurally blocked.

### 3.4 Consume-not-orchestrate (carried forward)

- Trust Center page makes no `fetch(` calls (asserted in test).
- Trust Center never calls the gate API directly; CTAs link to `/proof/gate?package=...`.
- Trust Center never renders Timeline events directly; links to `/proof/timeline`.
- Dashboard reuses Timeline data module without redeclaring a parallel history model.

### 3.5 Verbatim API mirror (carried forward)

`/proof/gate` is still the verbatim API mirror. Hard Rule 4 stands. Hard Rule 1 (stripped package-name keying) stands.

### 3.6 Phase-3-specific guardrails (new)

- Layout.tsx hygiene scope is **line-mode** (just the new NavItem's own line), not the ±400 char window. This is to leave the adjacent legacy SOC 2 nav entry untouched per the deferral. When Phase 8 ships, the hygiene widens back to window-mode in the same PR (per `legacy-soc2-copy-deferral.md` §5).
- Tertiary CTA verb on the hero is "VIEW", not "EXPLORE" — preserves the ADR's intent while satisfying the existing soft-banned-verb invariant.
- The Phase-3 vocabulary entries come off the banned list only when the underlying capability ships:
  - `zero noise` family — Phase 6 (Signal Intelligence: VEX + reachability + sandbox)
  - `drop-in` / `auto-*` family — Phase 7 (Remediation Drafts) and Phase 9 (drop-in replacement)
  - `autonomous agent` / `agentic remediation` — Phase 9
- All atomically. Capability + exception in the same PR. Never separately.

## 4. Invariant tests now protecting doctrine

| Suite | Script | Test count | Phase-3 delta |
|---|---|---|---|
| Trust Timeline | `scripts/test-trust-timeline.mjs` | 11 | unchanged |
| Repo Trust Dashboard | `scripts/test-repo-trust-dashboard.mjs` | 13 | unchanged |
| Open Source Trust Center | `scripts/test-open-source-trust-center.mjs` | **24** | +1 Phase-3 vocabulary invariant; LINKING_PAGES extended to cover `src/pages/Home.tsx` and `src/components/Layout.tsx`; per-page mode dispatcher (`window` vs `line`); footer-deferral assertion rescoped to actual `<footer>` element |
| Pre-existing OTS suites | various | many | unchanged |
| Candidate pipeline | three scripts | many | unchanged |

Phase 3 added **1 doctrine-encoding assertion** and refactored the linking-page hygiene to support per-page scoping. Net invariant count on `test:ci` increased from 60 (post-Phase-2) to 61. The structural protection of linking-page copy on `/`, on the sidebar nav slot, and on `/proof` is now uniform under one dispatcher.

## 5. A3 / D4 status

- **A3** — RESOLVED in Phase 2 (PR #52). One `/proof` CTA card shipped. No further action.
- **D4** — RESOLVED in Phase 3 (PR #55, D4-A). Trust Center entry shipped in the sidebar TRUST nav group. No further action.

Both discoverability deferrals from the original public-trust-spine arc are now closed in code.

## 6. Legacy SOC 2 — still named debt

Three locations on `main` still carry pre-spine SOC 2 marketing copy:

1. `src/pages/Home.tsx` — "AUDITOR COMPLIANCE" testimonial mentioning `SOC 2 auditor`, `CC6.8`, `CC8.1`, `Zero friction evidence packaging`
2. `src/components/Layout.tsx` — NavItem with `label: 'SOC 2'`, `hint: 'SOC 2 & ISO 27001 compliance'`
3. `/guard?tab=compliance` — destination tab content

All three are tracked under TODO ID `LEGACY_SOC2_COPY_DEFERRAL` in `docs/architecture/legacy-soc2-copy-deferral.md`. They are honestly named, dated, owned debt. They do NOT fail any Phase 3 structural test because the Layout.tsx hygiene is in line-mode and the homepage testimonial sits well outside the ±400 char window around the hero's new `/opensource-trust` link.

The debt lifts when Phase 8's first implementation PR atomically lifts the relevant banned-substring entries, rewrites or legitimately preserves the three locations, and widens `Layout.tsx` hygiene back to window-mode.

## 7. What is explicitly NOT shipped

Phase 3 ships the launch-narrative positioning, the sidebar promotion, and one new banned-substring vocabulary. It does NOT ship:

### 7.1 Phase 4 surfaces (now "Now", but not yet implemented)

- No CLI tool.
- No CLI install path beyond the existing `/cli` page.
- No Trust Badge.
- No badge-rendering surface.
- No badge-signing or badge-verification infrastructure.

### 7.2 Phase 5+ surfaces (still "Later" or further out)

- No Trust Vault. No private evidence layer. No auth-gated trust surfaces.
- No VEX statement ingestion. No reachability analysis. No sandbox behavioral telemetry.
- No Remediation Drafts.
- No Enterprise Evidence Exports. No Vanta / Drata integration.
- No SOC 2 attestation activation.
- No drop-in replacement engine.
- No multi-subject Trust Center.
- No persistence / database / event tables for Timeline / Dashboard / Trust Center.
- No per-customer trust pages.
- No comparison view (Trust Center vs Trust Center).
- No alerting / notifications.

### 7.3 Cross-cutting non-shipments

- No `threat_feed` activation.
- No candidate-pipeline arc merge with the public trust spine.
- No `hn-exploits-log.json` cleanup.
- No `/opensource-trust` URL alias or rename.
- No `/about`, `/methodology`, `/scanner`, `/guard`, `/pricing` rewrites.
- No new routes.
- No new shared / data modules beyond the Phase-3 vocabulary constant.

## 8. Roadmap status changes

This PR updates `docs/architecture/open-soyce-roadmap-integration.md` to reflect the phase transition. The diff:

| Phase | Status before this PR | Status after this PR |
|---|---|---|
| 3 — Launch Narrative / Positioning | **Now** | ✅ Closed (`394690a` for #56; closeout SHA filed by this PR's squash-merge) |
| 4 — OSS Distribution: CLI + Trust Badge | Next | **Now** |
| 5–9 | unchanged (Later / Blocked / Do not claim publicly yet) | unchanged |

The roadmap doc + this closeout doc land in the same PR so the source of truth and the narrative agree at the same SHA.

## 9. Production verification checklist

Walk this list after the deploy lands. Every item must pass.

### 9.1 Hero (live)

- [ ] `https://opensoyce.com/` shows the eyebrow text "PROOF-BACKED OPEN-SOURCE TRUST".
- [ ] Hero headline reads "THE NUTRITION LABEL THAT BECOMES A TRUST RECORD." (line-broken between "LABEL" and "THAT").
- [ ] Hero subhead reads "Read open-source projects like a label. Trust them like a record. Every claim links to a deployed surface, a merged PR, or a doctrine doc on `main`."
- [ ] Primary CTA "SCAN REPO FREE →" still routes through the hero search form.
- [ ] Secondary CTA "SEE A LIVE TRUST DECISION →" navigates to `/proof/gate?package=ua-parser-js@0.7.29` and returns a real `action: BLOCK` result.
- [ ] Tertiary CTA "VIEW TRUST CENTER →" navigates to `/opensource-trust` and renders all 7 sections.
- [ ] Nutrition Label visual hero still renders on the right column at large viewports.

### 9.2 Sidebar (live)

- [ ] The TRUST nav group contains, in order: Methodology, Trust Center, SOC 2, About, FAQ.
- [ ] The Trust Center entry uses the `ShieldCheck` icon and the hint "Public proof-backed trust record" (visible on hover or screen reader, depending on layout).
- [ ] Clicking Trust Center navigates to `/opensource-trust`.
- [ ] The existing SOC 2 entry still routes to `/guard?tab=compliance` (legacy copy, deferred to Phase 8).

### 9.3 Anti-discoverability assertions still hold

- [ ] `/` hero copy contains no banned substrings (`SOC 2`, `SOC2`, `Vanta`, `Drata`, `enterprise compliance`, `continuous monitoring`, `compliance certified`, `audit-ready`) within ±400 chars of the new `/opensource-trust` CTA.
- [ ] `/` hero copy contains no future-tense tells (`coming soon`, `we will`, `roadmap`, `planned for`, `in development`) within the same window.
- [ ] `/` hero copy contains no soft-banned verbs (`Learn more`, `Discover`, `Explore`, `Unlock`) within the same window.
- [ ] `/` hero copy contains no Phase-3 banned phrases (`zero noise`, `drop-in`, `auto-fix`, `autonomous agent`, etc.) within the same window.
- [ ] Global Layout footer does NOT include a `/opensource-trust` link (the footer-link deferral from PR #52 still stands).
- [ ] `/`, `/about`, `/methodology`, `/scanner`, `/guard`, `/pricing` carry no new `/opensource-trust` links (only the hero CTA is the new entry).

### 9.4 Trust Center regression curl (unchanged from Phase 2 closeout)

```bash
curl -sS -X POST https://opensoyce.com/api/compliance-gate \
  -H 'content-type: application/json' \
  -d '{"package":"ua-parser-js@0.7.29"}' | jq '.action, (.firedPatterns | length)'
# Expected:
# "BLOCK"
# 4
```

If this fails, the Trust Center's Gate-proof claims have drifted from reality and the hero's "SEE A LIVE TRUST DECISION →" CTA now resolves to a page that contradicts the homepage promise. Phase 3 doctrine is broken; revisit before any Phase 4 work begins.

## 10. Next decision options (not pre-authorized)

Phase 4 is **Now**. The user calls the Phase 4 sketch ADR when ready. Three movement options follow:

### Option A — Phase 4 sketch ADR

Open the next architecture-only sketch for **OSS Distribution: CLI + Trust Badge**. Scope per roadmap §3 Phase 4 row:

- The `opensoyce` CLI: read-only against the gate, reuses the four proof-anchor types, ships as a public npm/pnpm/Cargo binary (binding decision in the sketch).
- The Trust Badge: embeddable, signed or hash-anchored, points at a stable public URL.
- Both surfaces inherit the Trust Center's anti-marketing copy hygiene.

Recommended next step. Mirrors the Phase 1, 2, 3 cadence: sketch first.

### Option B — Hold Phase 4 for an external stimulus

Per launch-narrative ADR §10, Phase 4 (like Phase 3) has a soft external-stimulus preference. If there is no concrete signal that distribution is needed (CLI ask from a real developer, badge ask from a maintainer, public-demo trigger), holding is honest. The roadmap stays at "Now" but no PR opens.

### Option C — Skip ahead

Treat Phase 4 as low-priority and elevate Phase 5 (Trust Vault) or Phase 6 (Signal Intelligence) to "Now". This requires a roadmap revision PR — not a default move. The roadmap integration doc §1 strategic frame ("the trust record, not the action") supports Phase 4 ahead of Phase 5+ because distribution is the test of the public asset, not a deepening of it.

### Option D — Pause and produce a launch artifact

Phase 3 shipped a coherent public narrative. The next move could be a non-engineering artifact (blog post, walkthrough video, demo script) that converts the post-spine positioning into a launch-ready story. Per launch ADR §10, this is its own ADR (the launch narrative ADR is positioning; a launch *artifact* is a separate decision).

None of A–D is pre-authorized. The user calls.

## 11. Phase status

**Closed.**

Three PRs (#54 → #55 → #56) plus this closeout (#57). The public homepage now leads with proof-backed trust positioning. The Trust Center is in primary sidebar nav. Phase-3 launch-specific banned vocabulary is enforced in code. Legacy SOC 2 marketing copy is honestly named debt with a defined unblock path through Phase 8.

The principle that produced this phase —

> The Nutrition Label is the entry. The Trust Record is the proof. The record is what OpenSoyce remembers when nobody is watching.

— stays whole.

**Phase 4 is now "Now".** No work begins until the user explicitly approves the Phase 4 sketch.

> Capability + banned-substring exception ship in the same PR, never separately.
> Risk does not lose its name because someone needed to ship.
