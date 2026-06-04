# ADR: OTS Next-Phase Architecture Direction

**Status:** Proposed
**Date:** 2026-06-04
**Related arc:** OTS proof-package engineering arc, closed in PR #42
**Type:** Docs-only decision record. No implementation.

## Context

The OTS proof-package arc is closed. The proof package now has six artifacts, ten pixel captures, a deployed `/proof/gate` surface, discoverability links from replay and incident surfaces, and a handoff folder for future agents.

That arc answered:

> Can OpenSoyce prove that its trust decisions are real, inspectable, and historically honest?

Yes.

The next question is different:

> What product surface should turn that proof foundation into an understandable, usable, buyer-facing trust product?

This ADR compares the next plausible arcs and recommends the next architecture direction before code.

## Decision needed

Choose the next product arc after the closed OTS proof-package phase.

Candidate directions:

1. Trust Timeline
2. Repo Trust Dashboard
3. Open Source Trust Center
4. Version-aware OSV queries
5. `threat_feed` production activation model
6. Candidate-pipeline enforcement extensions
7. Vanta / Drata evidence export
8. Trust Agent

## Doctrine carried forward

From OTS:

> A pattern can be educational before it is enforceable. The product always says which is which.

> Detection, evidence, policy, and enforcement are separate layers.

> Risk does not lose its name because someone needed to ship.

From the candidate pipeline:

> The scraper proposes. The reviewer decides. The repo remembers.

Practical constraints:

- Do not let automation become enforcement without human review.
- Do not hide historical trust-state changes.
- Do not blur evidence, detection, policy, and enforcement.
- Do not put public truth only in mutable database rows when it belongs in git history.
- Do not start implementation before the next arc has an architecture sketch and explicit user call.

## Option A — Trust Timeline

### What it is

A deployed product surface that shows how trust decisions changed over time.

Example events:

- `ua-parser-js@0.7.29` evaluated as ALLOW because OSV severity was unavailable in the fast path.
- OSV severity normalization shipped; the same package changed to BLOCK.
- Live-fetch row enrichment shipped; the firing set expanded from one pattern to four.
- Public `/proof/gate` shipped; a deployed parity bug was surfaced.
- PR #33 fixed the version-suffixed lookup bug; production matched canonical evidence again.

### Why it matters

The proof package already contains the raw material for a timeline: decision changes, firing-set changes, parity events, public-surface changes, evidence captures, and doc repairs.

A timeline turns internal engineering history into a product concept:

> OpenSoyce does not only scan risk. It records why trust decisions changed.

### Pros

- Best continuation of the proof-package arc.
- Makes the doctrine visible to buyers and future users.
- Gives product language for decision changes vs. firing-set changes vs. parity events.
- Can start as a static proof-backed surface before requiring persistent event storage.
- Provides foundation for Repo Trust Dashboard and Trust Center.

### Cons

- Needs careful event taxonomy.
- Could become decorative if not grounded in real gate/proof events.
- Eventually needs persistence if it becomes repo-specific.

### MVP shape if chosen

Route:

```text
/proof/timeline
```

Initial event types:

- `decision_change`
- `firing_set_change`
- `parity_event`
- `surface_shipped`
- `evidence_capture`
- `review_event`

Initial data source:

- Static data derived from the closed proof-package arc.
- Later: event table or git-backed event file once repo-specific timelines exist.

## Option B — Repo Trust Dashboard

A repo-level view showing current trust posture for a repository.

Example:

```text
/projects/freewho99/opensoyce/trust
```

Pros:

- Closer to a product a user would log into.
- Natural workflow: select repo, see trust posture.
- Can eventually connect Timeline, Gate, candidate promotion, and policy decisions.

Cons:

- Needs more live state and user/repo context.
- More product design surface than Timeline.
- Could pull in auth, persistence, repo scans, and policy UX too early.

## Option C — Open Source Trust Center

A buyer-facing public page that communicates what OpenSoyce proves about a project or organization.

Pros:

- Strong sales/buyer story.
- Converts proof artifacts into a public trust narrative.
- Useful for enterprise security reviews.

Cons:

- Strongest after Timeline and Dashboard exist.
- Needs clarity on audience: buyer, maintainer, security reviewer, or internal engineer.
- Risks becoming marketing copy if not backed by dynamic evidence surfaces.

## Option D — Version-aware OSV queries

Improve the OSV fast path so package/version inputs evaluate only advisories that affect that version, rather than treating OSV findings at package level.

Pros:

- Reduces false positives.
- Makes package@version gate behavior more precise.
- Directly improves the live gate.

Cons:

- Changes the current security posture from false-positive-preferred to more precise filtering.
- Needs careful doctrine update because the proof-package arc explicitly documents OSV v1 as package-level.
- Engineering-heavy relative to product-story value.

Needs a separate architecture decision on:

- fail-open vs. fail-closed on incomplete affected-range data
- version parsing strategy
- ecosystem-specific range semantics
- capture-history update rules when decisions change

## Option E — `threat_feed` production activation model

Activate the custom-advisory enrichment lane in production by applying the missing `public.threat_feed` table migration and defining who can write curated enforcement advisories.

Pros:

- Unlocks human-curated gate enrichment.
- Enables future candidate-pipeline PR #3: "also write to threat_feed" after Promote.
- Makes OpenSoyce more than OSV + registry signals.

Cons:

- Strategic enforcement switch, not just SQL.
- Needs policy around review, expiration, visibility, audit trail, and rollback.
- Dangerous if activated without product rules.

Before applying SQL, decide:

- who can write `threat_feed` rows
- whether every row requires a reviewed PR
- whether rows expire
- whether rows appear in timeline/proof surfaces
- whether rows can block or only warn initially

## Option F — Candidate-pipeline enforcement extensions

Continue the candidate-pipeline backlog:

- PR #2c: replay fixture authoring for promoted incidents
- PR #2d: webhook reconciliation after promoted PR merge
- PR #3: optional `threat_feed` write on Promote

Pros:

- Strengthens the incident acquisition system.
- Makes promoted incidents richer and easier to verify.
- Bridges intel intake to proof and enforcement.

Cons:

- Mostly admin/backend maturation.
- Less buyer-facing than Timeline or Trust Center.
- PR #3 depends on the `threat_feed` activation decision.

Recommendation if chosen:

- Do #2c or #2d before #3.
- Do not start #3 until the `threat_feed` model is decided.

## Option G — Vanta / Drata evidence export

Export OpenSoyce trust decisions as compliance/audit evidence for external trust platforms.

Pros:

- Clear enterprise value.
- Positions OpenSoyce as an evidence producer.
- Connects to security review and sales motion.

Cons:

- Needs stable evidence model first.
- Better after Timeline and Dashboard clarify the internal data shape.

## Option H — Trust Agent

An agent that reads gate output, explains risk, proposes actions, and records decisions.

Pros:

- Strong product vision.
- Natural fit with OTS: "the agent explains, policy decides, record remembers."

Cons:

- Should not lead the next phase.
- Needs stable surfaces and audit model first.
- Easy to overbuild before product primitives are settled.

## Recommendation

Choose **Option A: Trust Timeline** as the next arc.

Recommended order:

```text
1. Trust Timeline
2. Repo Trust Dashboard
3. Open Source Trust Center
4. threat_feed activation model
5. Candidate-pipeline enforcement extensions
6. Vanta / Drata export
7. Trust Agent
```

## Why Trust Timeline first

The proof-package arc produced a rare asset: a historically honest sequence of trust-state changes on the same package.

That sequence is the clearest product story:

> OpenSoyce records not just the current risk decision, but why the decision changed.

A Timeline is the smallest next surface that makes that visible.

It does not require activating new enforcement lanes. It does not require modifying the gate. It does not require new detector patterns. It turns existing proof into a product primitive.

## Proposed MVP if approved

### Route

```text
/proof/timeline
```

### Initial data

Static timeline data for the closed OTS proof-package arc:

- baseline ALLOW capture
- PR #28 decision change
- PR #30 firing-set change
- PR #32 public surface shipped
- PR #33 parity event
- PR #40 doc repair
- PR #41 discoverability links
- PR #42 closeout

### Initial UI sections

1. Timeline hero: "Trust changes should leave a record."
2. Event list grouped by date.
3. Event-type legend.
4. Focus package: `ua-parser-js@0.7.29`.
5. Links to proof docs and live gate.
6. Regression curl copied from closeout doc.

### Non-goals for MVP

- No database event table.
- No repo-specific timeline yet.
- No user-auth timeline.
- No Trust Center.
- No `threat_feed` activation.
- No candidate-pipeline enforcement extension.
- No new policy decisions.

## Status

Proposed. Awaiting explicit user decision before code.

No implementation should begin from this ADR alone.

## Decision log

- 2026-06-04: ADR prepared as docs-only PR content to frame the next phase after the OTS proof-package closeout.
