# OpenSoyce Roadmap Integration

**Status:** Active roadmap (this doc)
**Date:** 2026-06-06
**Type:** Docs-only roadmap integration. No application code, no routes, no surfaces, no test changes, no link wiring. Maps incoming product ideas into the existing phase sequence.

**Predecessors:**

- [OTS Next-Phase ADR](./ots-next-phase-adr.md) (#43)
- [Trust Timeline sketch](./trust-timeline-sketch.md) (#44) + impl (#45)
- [Repo Trust Dashboard sketch](./repo-trust-dashboard-sketch.md) (#46) + impl (#47)
- [Open Source Trust Center sketch](./open-source-trust-center-sketch.md) (#48) + impl (#49)
- [Public Trust Spine Closeout](../proof/public-trust-spine-closeout.md) (#50)
- [Public Trust Spine Discoverability ADR](./public-trust-spine-discoverability-adr.md) (#51) + impl (#52)

This doc is the alignment layer over the in-flight product ideas. It does not authorize implementation. It records the sequence, the labels, the doctrinal frame, and the conditions under which each idea moves from one label to the next.

## 1. Strategic frame

The single sentence the roadmap defends:

> OpenSoyce is the trust record for open-source decisions. Automation grows out of the record, not over it.

The temptation across the incoming ideas list is to converge on "auto-fix everything." The roadmap rejects that frame. The product asset OpenSoyce has built is the **record** — verbatim API mirror, audit-anchored timeline, per-repo posture, public trust narrative — and every future capability is sequenced against whether it strengthens the record or skips past it.

The corollary doctrine:

- The record is public, anchored, and structurally guarded against marketing drift.
- Automation reads the record. It does not replace it.
- Capabilities that pretend the record exists before the record is built are rejected.
- Capabilities that produce evidence go before capabilities that act on evidence.

## 2. Labels (guardrail vocabulary)

Every roadmap item gets exactly one label from this fixed set. Labels are non-overlapping and stack in order of increasing distance from current readiness.

| Label | Meaning | Authorized actions today |
|---|---|---|
| **Now** | Next phase. Sketch may be drafted as soon as the user calls for it. | Sketch ADR may be authored when the user explicitly approves. |
| **Next** | Queued behind Now. No work begins until Now closes. | Mentioned in roadmap; no code, no sketch. |
| **Later** | The product asset this depends on is not yet built. Cannot start until the dependency lands. | Named here so it's not invented; no further work. |
| **Blocked until evidence exists** | The idea requires evidence the product does not currently produce. Even sketching it before the evidence is fabricated. | Locked. Listed here only to claim the slot. |
| **Do not claim publicly yet** | Even the public marketing surface (Trust Center, About, blog, social) must not assert this exists or is coming. | Banned in copy on every shipped surface; protected by the Trust Center's anti-marketing invariants. |

A label change is a roadmap decision. It belongs in this doc, not in implementation PRs. When a `Next` becomes `Now`, this doc updates in the same PR that authorizes the next sketch.

## 3. Phase sequence

The product spine is currently at Phase 2. Phases 3–9 are forward-looking and each one closes in a phase-closeout doc the way Phase 1 closed in `docs/proof/public-trust-spine-closeout.md`.

| Phase | Name | Status |
|---|---|---|
| 1 | Public Trust Spine | ✅ Closed (PRs #43 → #50, closeout at `7788edd`) |
| 2 | Trust Spine Activation | ✅ Closed (PRs #51 → #52, last merge `5b61c3c`) |
| 3 | Launch Narrative / Positioning | ✅ Closed (PRs #54 → #57, last impl merge `394690a`) |
| 4 | OSS Distribution: CLI + Trust Badge | ✅ Closed (PRs #58 → #65, last impl merge `13e22cc`, closeout filed by this PR) |
| 5 | Trust Vault: private evidence + exceptions | **Now** |
| 6 | Signal Intelligence: VEX + reachability + sandbox evidence | Later |
| 7 | Remediation Drafts | Later |
| 8 | Enterprise Evidence Exports | Blocked until evidence exists |
| 9 | Deep auto-remediation / drop-in replacement | Do not claim publicly yet |

Each phase below carries its own scope, its precondition, its `enters` event, and its `exits` event. The structure mirrors the closed phases: every phase begins with an ADR sketch and ends with a phase-closeout doc.

### Phase 3 — Launch Narrative / Positioning (✅ Closed)

**Scope:** Public-facing narrative work. Homepage hero positioning, brand-voice repositioning around the proof spine, possible sidebar promotion of `/opensource-trust`, possible URL rename of the Trust Center route, the conversion of the public trust spine into a single launch story.

**Why now:** Phase 2 left `/opensource-trust` reachable from five proof / trust surfaces but still invisible from `/`, `/about`, `/methodology`, `/scanner`, `/guard`, `/pricing`, and sidebar nav. D4 (sidebar promotion) is explicitly deferred to this phase by `public-trust-spine-discoverability-adr.md` §6. Without a coordinated narrative, any single one of those promotions reads as ad-hoc copy patch.

**Enters when:** User approves the Phase 3 sketch ADR.

**Exits when:** A launch-narrative phase-closeout doc lands, covering hero copy, sidebar decision, URL decisions, and the structural invariants that protect launch copy from marketing drift.

**Doctrine constraints carried in:**

- Trust Center anti-marketing banned-substring vocabulary applies to every page touched by this phase.
- Soft-banned marketing verbs (`Learn more`, `Discover`, `Explore`, `Unlock`) banned around any Trust Center link.
- Future-tense marketing tells banned in all launch copy.
- No claim made on `/` or `/about` that the Trust Center itself refuses to make.
- External-stimulus precondition from `public-trust-spine-discoverability-adr.md` §10: the phase prefers an external trigger (public demo, security review, customer ask, press cycle) over a self-initiated rewrite. If no external trigger exists, the phase still launches, but the sketch must justify why.

**Out of scope for Phase 3:**

- No new product capability. No CLI, no badges, no Trust Vault, no VEX, no remediation work.
- No compliance posture claims.
- No new shipped surface beyond copy + nav changes.

### Phase 4 — OSS Distribution: CLI + Trust Badge (✅ Closed)

**Scope:** Two distribution surfaces that reuse the existing proof spine.

- **OSS CLI** — `opensoyce` command-line tool that queries the gate, returns the verbatim API mirror, and renders a local trust posture. Reuses `/proof/gate` semantics; does not invent new policy. Possibly outputs the same anchor types (`pr` / `live-surface` / `doc-anchor` / `proof-artifact`) the Trust Center uses.
- **Trust Badge** — embeddable badge that any project README can render. Renders the current posture from a stable public URL (likely `/projects/:owner/:repo/trust.svg` or similar). Badge is signed or hash-anchored to prevent forgery.

**Why next, not now:** Distribution without a launch narrative produces a CLI nobody knows exists. The narrative pass (Phase 3) precedes distribution because distribution surfaces inherit the narrative.

**Preconditions:**

- Phase 3 closeout merged.
- The Trust Center's public anchor types and posture vocabulary remain stable through Phase 3 (a launch-narrative phase that changes the data shape blocks Phase 4 until the shape settles).

**Doctrine constraints:**

- CLI is read-only against the gate. No write actions in v0.
- Badge URL is stable, signed, and gates against forgery. No client-trusted markup.
- Both surfaces inherit the Trust Center's anti-marketing copy hygiene.
- Both surfaces are public, no auth.

**Out of scope for Phase 4:** Trust Vault scope, VEX/reachability scope, remediation actions, compliance export, sandbox telemetry.

### Phase 5 — Trust Vault: private evidence + exceptions (Later)

**Scope:** Auth-gated private evidence layer. Per-customer audit logs, embargoed CVE work, reviewer-private exception justifications, repo-scoped exception persistence. Closes the deferred items in:

- `repo-trust-dashboard-sketch.md` §9 backlog (repo-scoped exception storage)
- `open-source-trust-center-sketch.md` §6 (private evidence boundary)
- `public-trust-spine-closeout.md` §8 (no editable exceptions, no per-customer trust pages)

**Why Later, not Next:** Private evidence requires auth + persistence + RBAC. That is a substantially larger arc than the public spine. It comes after CLI + badge because distribution validates the public asset before private capabilities deepen it.

**Preconditions:**

- Phase 4 closeout merged.
- Decision on auth provider, persistence layer, and RBAC scope (each likely its own sub-ADR inside the Phase 5 sketch).
- Decision on whether the Trust Vault is a separate route family or extends `/opensource-trust` / `/projects/.../trust` with visibility-aware sections.

**Doctrine constraints:**

- The existing Trust Center's `visibility` field guard (private-scope creep guard) lifts only when this phase ships, in the same PR.
- Trust Vault evidence types must carry the same audit-anchor discipline as public evidence: PR + SHA, live surface, or doc anchor — no fabrications.
- Banned-substring vocabulary on public Trust Center surfaces stays intact; Trust Vault evidence may carry different copy but must not leak back into public-surface copy.

**Out of scope for Phase 5:** Vanta / Drata export (Phase 8), public marketing of Trust Vault evidence (Trust Vault is internal/customer-private by definition).

### Phase 6 — Signal Intelligence: VEX + reachability + sandbox evidence (Later)

**Scope:** Additional evidence types that the gate / Timeline / Dashboard / Trust Center surfaces consume:

- **VEX (Vulnerability Exploitability eXchange)** — third-party VEX statements as evidence inputs. Frames as "the upstream maintainer says this advisory does not apply because…" — evidence, not a noise-suppression promise.
- **Reachability analysis** — code-path evidence that an advisory's vulnerable function is or is not reachable from this project. Same framing: evidence input, not noise suppression.
- **Sandbox behavioral telemetry** — runtime observation of package behavior during install / first-run. Detects `postinstall` exfiltration, network beaconing, file-system probing. Evidence-only at first; enforcement requires a separate decision.

**Why Later:** Each of these is a new evidence type. They presume the evidence model is stable enough to consume new inputs. The Phase 5 Trust Vault work likely tightens the evidence model (private evidence forces clearer typing). Phase 6 builds on the cleaned-up model.

**Preconditions:**

- Phase 5 closeout merged.
- Evidence-type taxonomy stable across public and private layers.
- Sandbox infrastructure decision (own ADR — touches privacy, cost, sandbox provider, opt-in vs opt-out for scanned packages).

**Doctrine constraints — load-bearing:**

- **VEX and reachability MUST be framed as evidence, NOT as "zero noise."** The banned-substring vocabulary expands during Phase 6 to include "zero noise", "noise-free", "perfect signal", "false-positive elimination" — any phrasing that promises the elimination of friction the evidence cannot guarantee.
- **Sandbox telemetry is evidence capture first.** Enforcement actions based on sandbox observations are a Phase 7 decision (Remediation Drafts) or later.
- Every new evidence input must extend the Timeline event taxonomy (`vex_statement`, `reachability_finding`, `sandbox_observation`) and carry the same audit-anchor discipline.

**Out of scope for Phase 6:** Auto-remediation, drop-in replacement, compliance export.

### Phase 7 — Remediation Drafts (Later)

**Scope:** OpenSoyce proposes safe remediation PRs in response to gate findings. The agent drafts; a human reviewer accepts; the repo remembers. Same doctrine as the candidate-pipeline arc: **scraper proposes, reviewer decides, repo remembers.**

**Why Later:** Remediation is action, not evidence. It comes after the evidence stack (Phase 6) because remediation that acts without evidence is auto-fix, which the strategic frame rejects.

**Preconditions:**

- Phase 6 closeout merged.
- Decision on the PR-authoring identity (a Guard-style bot, a user-installable GitHub App, or a CLI-driven local commit).
- Decision on the safety-band for what remediation classes are eligible: pure-version-bump (low risk) vs. pinned-replacement (medium) vs. drop-in-replacement (high — actually a Phase 9 capability, not Phase 7).
- Decision on the test surface that proves a proposed PR is "safe" (CI green is necessary but not sufficient).

**Doctrine constraints:**

- Remediation drafts are PRs, not direct commits. Reviewer accepts; repo remembers.
- Each remediation draft carries its full evidence chain in the PR body: which gate finding triggered it, which VEX/reachability evidence informed the choice, which alternative versions were considered and rejected.
- Banned: any UI that auto-applies a remediation without a human approval gate. Auto-apply is Phase 9.
- The Timeline event taxonomy expands again (`remediation_proposed`, `remediation_accepted`, `remediation_rejected`) with the same audit-anchor discipline.

**Out of scope for Phase 7:** Drop-in replacement, compliance export.

### Phase 8 — Enterprise Evidence Exports (Blocked until evidence exists)

**Scope:** Vanta / Drata export, SOC 2 evidence packaging, ISO 27001 evidence packaging. Compliance-platform integration.

**Why Blocked:** This phase is blocked on the actual evidence existing in private (Phase 5) and validated form (Phase 6+). Today, OpenSoyce has the public trust spine and the candidate-pipeline arc; it does not have the auth-gated audit-log surface that compliance exports consume. Producing exports before the evidence exists is fabrication, which the doctrine rejects.

**Activation conditions:**

- Phases 5 + 6 + 7 closeouts merged.
- A documented evidence-to-export mapping (`docs/architecture/evidence-export-mapping.md`) that names every export field and the live evidence that proves it.
- Decision on what is exportable vs. what stays in the Trust Vault (some private evidence does not belong in compliance exports).

**Doctrine constraints — the most important in this doc:**

- **SOC 2 / Vanta / Drata / "enterprise compliance" / "continuous monitoring" / "compliance certified" / "audit-ready" all remain in the Trust Center's banned-substring vocabulary until this phase ships.** The banned-substring exception lifts in the same PR that ships the underlying export, never separately. This rule is encoded in code, not just here.
- Export shipping is per-platform: the Vanta export PR lifts only `Vanta` from the banned list. The Drata export PR lifts only `Drata`. SOC 2 marketing claims become available only when the export PR includes evidence sufficient to back them.

**Out of scope for Phase 8:** Drop-in replacement, marketing-only compliance claims.

### Phase 9 — Deep auto-remediation / drop-in replacement (Do not claim publicly yet)

**Scope:** OpenSoyce ships actions, not just drafts. Drop-in replacement engine: when a package is blocked, OpenSoyce proposes and applies a vetted alternative without explicit human approval, gated by compatibility proof + test confidence above a high threshold.

**Why "Do not claim publicly yet":** This is the highest-risk capability on the roadmap. The doctrine for the entire arc is "scraper proposes, reviewer decides, repo remembers." Drop-in replacement breaks that by removing the human reviewer for high-confidence cases. Even mentioning this on a public surface before it ships risks setting the expectation that OpenSoyce will silently rewrite dependency trees.

**Hard constraint until activation:**

- Trust Center copy must not assert drop-in replacement exists.
- Marketing surfaces must not promise auto-fix outcomes.
- The phrase "drop-in replacement" stays out of every public surface until a phase-9-activation ADR lands.

**Activation conditions:**

- Phases 7 + 8 closeouts merged.
- Compatibility-proof framework shipped (own ADR) — how OpenSoyce proves a replacement is API-compatible without running the consumer's tests.
- Test-confidence threshold defined and validated (own ADR) — what percentage of consumer test surface must pass for an auto-replacement to ship.
- Rollback mechanism (own ADR) — how a repo undoes an auto-applied replacement that turned out to break runtime behavior CI didn't catch.

**Doctrine constraints:**

- Auto-replacement carries the full evidence chain in the resulting PR/commit — even though it's not gated by human approval, it remains gated by audit-anchor.
- A separate Timeline event type (`auto_replacement_applied`) records every action with rollback metadata.
- An auto-replacement can be reverted by adding the replaced package to a per-repo exception with no further questions.

**Out of scope for Phase 9:** Anything beyond compatibility-proven, test-confidence-validated, fully-reversible replacements. Phase 9 is not "auto-fix everything." It is "auto-apply the safest subset of remediation drafts."

## 4. Idea-to-phase mapping

The full table the user supplied, mapped to phases with current labels.

| Idea | Phase | Label |
|---|---|---|
| Launch narrative / homepage positioning | 3 | ✅ Closed (PRs #54 → #57) |
| OSS CLI | 4 | ✅ Closed (PRs #58 → #65) |
| Health / Trust Badge | 4 | ✅ Closed (PRs #58 → #65) |
| Trust Vault / exception evidence | 5 | **Now** |
| VEX / reachability signals | 6 | Later |
| Sandbox behavioral telemetry | 6 | Later |
| Remediation drafts | 7 | Later |
| Enterprise Evidence Exports (Vanta / Drata) | 8 | Blocked until evidence exists |
| SOC 2 marketing claim activation | 8 | Do not claim publicly yet (lifts in the export PR) |
| Drop-in replacement engine | 9 | Do not claim publicly yet |

Nothing on this list is pre-authorized. The Phase 5 sketch is recommended; the user explicitly approves it before any work begins.

## 5. Cross-cutting doctrine

These rules apply across every phase. They are restated here so the roadmap reads as one coherent doctrine rather than as nine independent ADRs.

### Evidence-first sequencing

Phases producing evidence (3 = narrative, 4 = distribution, 5 = private evidence, 6 = signal intelligence) precede phases acting on evidence (7 = remediation drafts, 8 = exports, 9 = auto-replacement).

When evaluating any incoming idea, ask: does it produce evidence or act on evidence? If it acts, it is sequenced after the evidence it depends on.

### Banned-substring discipline

Every phase that ships a new product capability that previously had a banned marketing substring (Vanta, Drata, SOC 2, etc.) lifts that substring in the same PR that ships the capability. Never separately. Never as "figurative" copy.

This rule is encoded as the test invariant `no claim contains a banned marketing substring` in `scripts/test-open-source-trust-center.mjs`. Removing an entry from the `OPEN_SOURCE_TRUST_CENTER_BANNED_SUBSTRINGS` vocabulary is itself a doctrine action that lives in the same PR as the capability launch.

### Phase-closeout discipline

Every phase ends with a closeout doc in `docs/proof/<phase-name>-closeout.md`, modeled on `public-trust-spine-closeout.md`. The closeout records: live surfaces, PR lineage, invariant tests added, deferred decisions, what is explicitly NOT shipped, future ADR-blocked decisions, production verification checklist, recommended next decision options. No phase moves to the next without a closeout.

### Sketch-before-implementation discipline

Every product surface in the public trust spine arc (#44 → #45, #46 → #47, #48 → #49) was preceded by an architecture-only sketch PR. This pattern continues. Phase 3, 4, 5, 6, 7 each open with a sketch ADR before any implementation PR. The sketch authorizes the implementation's scope; the user approves the implementation separately.

### Honest empty state

Every shipped surface that has "future" sections (the Trust Center's exception-policy and evidence-export placeholders are the precedent) renders an honest empty placeholder, not a "coming soon" marketing claim. The Phase 5 Trust Vault, Phase 8 exports, and Phase 9 auto-replacement all follow the same pattern when partial surfaces ship.

### External-stimulus preference

Phase 3 (Launch Narrative) has a soft external-stimulus preference: prefer to launch when an external trigger exists (demo, review, customer, press) over a self-initiated rewrite. This rule extends to Phase 4 (CLI / badge distribution): prefer to ship distribution when there is signal that distribution is needed. Self-initiated work is allowed; this preference is a tie-breaker for sequencing, not a hard block.

## 6. What this doc does NOT do

- Does not authorize any implementation work.
- Does not authorize any sketch beyond Phase 3.
- Does not commit to phase order changes if the user calls a different next phase.
- Does not pre-author phase closeouts. Each closeout is its own PR after the phase actually closes.
- Does not name implementation PR numbers (PR numbers shift as parallel arcs land).
- Does not lift any current Trust Center banned-substring vocabulary. All entries remain banned until the phase that ships their underlying capability also lifts them.
- Does not change any existing route, link, test, or surface.
- Does not affect the parallel candidate-pipeline arc.
- Does not affect the `threat_feed` activation ADR (queued separately as `ots-next-phase-adr.md` Option F).
- Does not contradict any prior closeout, sketch, or ADR.

## 7. Phase 3 — recommended next sketch

The Phase 3 sketch is recommended, not pre-authorized. When the user calls "approve Phase 3 sketch" (or equivalent), the next PR is:

**PR — `docs(ots): sketch Phase 3 launch narrative + positioning`**

- Adds `docs/architecture/phase-3-launch-narrative-sketch.md`
- Defines hero copy structure (problem → proof → product)
- Decides whether `/opensource-trust` is renamed to a shorter slot (e.g. `/trust`) and what happens to the original URL
- Resolves D4 — sidebar promotion decision
- Decides re-ranking of `/scanner`, `/guard`, `/pricing` vs. `/opensource-trust` in the visitor's first 30 seconds
- Decides whether the Trust Center subject becomes multi-subject (interacts with the future Multi-subject Trust Center ADR)
- Names the structural-invariants test extensions that protect launch copy from marketing drift
- Sketch only — implementation is its own follow-up PR

## 8. Status

Active roadmap. Phases 1 + 2 + 3 + 4 closed. Phase 5 is **Now**. Phases 6–9 each carry their label and their preconditions.

No application code lands in this PR. No routes, no links, no copy changes, no test changes.

> Automation grows out of the record, not over it.

> Risk does not lose its name because someone needed to ship.
