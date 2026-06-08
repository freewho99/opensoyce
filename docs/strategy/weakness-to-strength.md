# OpenSoyce — Weakness to Strength: Living Strategy Document

> Version 1.0 — June 8, 2026
> Cross-referenced against PR #78 (merged), PR #80 (merged), and current main.
> Updated every time a build target ships or a new gap is identified.

---

## How to Read This Document

Each weakness has five fields:

- **The gap** — what the honest interview answer revealed
- **The risk** — what happens if we don't fix it
- **The strength it becomes** — what it looks like when fixed
- **Build target** — the specific thing to ship
- **Status** — what's already in flight vs what's not started

**Status codes:** 🔴 Not started · 🟡 Planned · 🟠 In flight · 🟢 Done / partially addressed

---

## Weakness 1: Scoring Not Fully Auditable

**The gap:** Human judgment calls in the scoring process that aren't fully documented. Can't trace every score to an explicit, auditable decision tree. Asked to defend a score in court — couldn't do it for all of them.

**The risk:** Central contradiction of a trust brand. A competitor, journalist, or wronged maintainer can make this the story any time they want.

**The strength it becomes:** Every score fully traceable to explicit, weighted, versioned signals with a public changelog. Per-score reasoning exposed to the user. The most auditable scoring system in the space.

**Build target:** Guard scoring engine — documented signals, explicit weights, versioned methodology, per-score reasoning in the UI.

**Status:** 🟠 In flight

**PR #78 contribution:** Created `validate_proof_anchors()` SQL validator, `vault_evidence` table with visibility locked to private, `vault_timeline_events` with 17-event-type vocabulary and proof anchor references. These are the building blocks of the audit trail. The public lift is gated to PR-V2-C.

---

## Weakness 2: SOC 2 Not Yet Pursued

**The gap:** No SOC 2 Type II. No enterprise MSA template. No SLAs. No SSO. No RBAC. Enterprise legal would not approve current terms.

**The risk:** Every enterprise conversation hits this wall. Highest-value customers are currently unreachable through formal procurement.

**The strength it becomes:** SOC 2 Type II certification on Guard launch timeline. Enterprise-ready terms before the first enterprise deal. The methodology transparency becomes a differentiated SOC 2 — auditors can verify reasoning, not just controls.

**Build target:** SOC 2 Type II audit (gated to Phase 8 per ADR). Enterprise MSA template. SLA definitions. SSO + RBAC in Guard.

**Status:** 🟠 In flight

**PR #78 contribution:** Shipped full 4-role RBAC (`member < reviewer < owner + public_visitor`), GitHub OAuth, session management with sliding 30-day expiry (`opensoyce_vault_session`, HttpOnly + Secure + SameSite=Lax), RLS on all vault tables with service-role bypass, workspace membership with last-owner-protection trigger. This is approximately 40–50% of the SOC 2 access-control evidence. Full enterprise IdP SSO (Okta, Azure AD) not yet built.

---

## Weakness 3: Score Freshness Gap

**The gap:** Scoring is periodic, not real-time. There is a window where a score reflects a state that has changed. We cite Miasma as the reason supply chain trust matters and our own refresh cycle has the same gap.

**The risk:** Someone notices the irony. More importantly, a team relying on Guard in CI gets hit during the refresh window.

**The strength it becomes:** Real-time scoring pipeline. Score freshness timestamps visible in UI — honest and prominent. Guard alerting on score changes for watched packages.

**Build target:** Real-time signal ingestion pipeline. Timestamp transparency in UI. Guard change alerts.

**Status:** 🔴 Not started

**PR #78 contribution:** None. This is the most important gap and the most honest thing to say in the interview. The `vault_timeline_events` table will eventually carry score-change events, but the real-time ingestion layer does not exist yet.

---

## Weakness 4: False Positive Rate Unmeasured

**The gap:** No formal false positive measurement pipeline. No enterprise escalation path. One bad block in CI at 2am kills adoption permanently.

**The risk:** Enterprise CI/CD integration — the core Guard use case — cannot ship without a credible false positive story. Tools that cause one production incident get turned off and never turned back on.

**The strength it becomes:** Formal FP tracking. Public dashboard showing rate over time. Defined escalation path with SLA. Published FP rate that nobody else in this space publishes.

**Build target:** FP measurement pipeline. Dispute workflow. Public FP rate dashboard.

**Status:** 🟠 In flight (foundation only)

**PR #78 contribution:** `vault_exceptions` table schema with severity-downgrade-only CHECK constraint and active-requires-expiry CHECK — the data model foundation for the exception state machine. PR-V2-B (exception proposal/approval/revoke/extend APIs) is the next PR and will build the actual dispute workflow on top of this foundation.

---

## Weakness 5: OpenSoyce's Own Dependencies Not Auto-Monitored

**The gap:** We monitor our own dependencies manually. We are the cobbler's children. If we get compromised we become the supply chain attack vector for every developer who trusts our output.

**The risk:** Asymmetric reputational damage. A trust brand that becomes the attack vector is the worst possible story.

**The strength it becomes:** OpenSoyce's own dependency graph is the first graph Guard watches, publicly, with a live status page. "We eat our own cooking" becomes a product feature.

**Build target:** Internal Guard deployment on OpenSoyce's own stack. Public dependency health status page.

**Status:** 🔴 Not started

**PR #78 contribution:** None. Intentionally deferred until Guard is built enough to be self-applicable. The right moment is Guard beta — first deployment watches OpenSoyce's own stack.

---

## Weakness 6: AI Manipulation Surface in Scoring

**The gap:** AI is in the scoring pipeline. Text-based signals can potentially be manipulated by a well-crafted package. Methodology is public, which means adversaries can read it and build to evade.

**The risk:** The next generation of supply chain attacks will specifically target scoring systems. If OpenSoyce becomes the standard it becomes the target.

**The strength it becomes:** Explicit documentation of behavioral vs textual signal weighting. Behavioral signals dominate — publish velocity and tarball shape can't be faked as easily as a README. Adversarial testing program before attackers run it for us.

**Build target:** Signal weight transparency document. Behavioral signal prioritization framework. Red team program on the scoring system.

**Status:** 🟡 Planned

**PR #78 contribution:** `validate_proof_anchors()` vocabulary-constraint approach (5-vocab proofType set, strict shape validation) establishes the right pattern — constrained vocabularies resist manipulation better than open text fields. The adversarial testing program and signal weight transparency document are separate workstreams.

---

## Weakness 7: Legal Exposure on Score Disputes

**The gap:** No formal dispute process. Legal framework around score-based reputational harm is unsettled. Current terms would not survive enterprise procurement review.

**The risk:** One angry maintainer with a lawyer at the wrong moment. No process means every dispute is improvised.

**The strength it becomes:** Published dispute process with SLA. Methodology correction policy public. Legal review of terms before enterprise launch. A fair, documented, challengeable score process is itself a trust signal.

**Build target:** Formal dispute workflow. Updated ToS. Legal review. Methodology correction policy published publicly.

**Status:** 🟠 In flight (data model only)

**PR #78 contribution:** `vault_exceptions` table with constraint-enforced state machine (severity-downgrade-only matrix, active-requires-expiry). PR-V2-B builds the actual exception proposal/approval/revoke/extend APIs on top of this. The legal review of terms is separate and not yet started.

---

## Weakness 8: Coverage Gap — npm Only

**The gap:** npm primary coverage only. PyPI in development. Go, Rust, Maven not live. A polyglot enterprise cannot rely on OpenSoyce for their full stack.

**The risk:** "We cover JavaScript" is a conversation ender with any enterprise running microservices across multiple languages. Limits TAM and makes us look narrow.

**The strength it becomes:** Published language expansion roadmap with honest timelines and public reasoning for the sequence. Being honest about the gap builds trust even before the coverage exists.

**Build target:** PyPI signal pipeline. Go modules integration. Public roadmap with language coverage matrix.

**Status:** 🔴 Not started

**PR #78 contribution:** None. This is a separate workstream from the Vault build. Needs its own track.

**Expansion priority order:** npm (live — volume + risk), PyPI (AI/ML attack surface, active), Go (infrastructure blast radius), Rust (fast-growing, good existing signals), Maven (large but mature — sequenced later).

---

## Weakness 9: Closed Source Tension

**The gap:** OpenSoyce is closed source but scores open source packages for trust. The brand tension is real and available to any critic.

**The risk:** A maintainer whose package we scored low can make this the story. "Closed source black box judging our open work" is a narrative that is not entirely unfair.

**The strength it becomes:** Selective open sourcing — methodology tooling, signal definitions, scoring framework public. Keep operational infrastructure closed. "Here's the code behind how we score" is more powerful than any blog post.

**Build target:** Open source repository for scoring methodology and signal definitions. Community contribution process for signal additions. Community review of methodology changes.

**Status:** 🟡 Planned

**PR #78 contribution:** None. Requires a deliberate decision about what to open and what to keep closed, then execution. Not blocked by any current work.

---

## Weakness 10: Bus Factor and Team Depth

**The gap:** Small team. Key person dependency. Tribal knowledge in the operational layer not fully documented.

**The risk:** Enterprise buyers think about continuity. A trust brand that depends on one person's continued availability is a single point of failure in the infrastructure it's supposed to protect against.

**The strength it becomes:** Documentation-first culture as a public commitment. Complete operational runbook. Public methodology governance — who can change it, how, with what review.

**Build target:** Complete operational documentation. Hiring process and values document. Public methodology governance.

**Status:** 🟠 Partially addressed

**PR #78 contribution:** PR #78 is itself evidence of the documentation-first culture — 1,578 lines of code accompanied by a specification that documents exactly what every migration does, what every route does, what the PR explicitly does NOT do, and what the recommended next step is. That level of documentation means knowledge lives in the PR history, not just one person's head. The formal operational runbook beyond PR history is not yet written.

---

## Weakness 11: Funding Philosophy Unpublished

**The gap:** Pre-institutional funding means no conflict yet — but no public statement about what funding OpenSoyce will and won't take means the conflict question is unanswered going into any enterprise conversation.

**The risk:** The moment a VC is in the cap table without a published independence doctrine, the "whose interests does OpenSoyce serve" question has no good answer.

**The strength it becomes:** Published funding principles before taking money. Revenue model that aligns with user trust rather than investor growth metrics. Independence protections documented in advance, when there's no pressure to compromise them.

**Build target:** Published funding principles document. Revenue model design that avoids investor/trust conflicts. Advisory structure with independence protections built in.

**Status:** 🔴 Not started

**PR #78 contribution:** None. This is a document to write, not a system to build. Can be done in a day. Should be done before any funding conversations get serious.

---

## Weakness 12: Regulation Readiness

**The gap:** EU Cyber Resilience Act legal interpretation for OpenSoyce as a product is unsettled. No formal regulatory engagement. Risk of checkbox culture capturing the market before quality signals differentiate.

**The risk:** Regulation creates a compliance checkbox that a cheap competitor fills first. Or regulation directly creates obligations for OpenSoyce that we are not prepared for.

**The strength it becomes:** Proactive regulatory engagement. CRA readiness document published before anyone asks. Being the reference example of what real supply chain due diligence looks like — not because a regulator said so, but because the methodology is public and verifiable.

**Build target:** CRA readiness assessment (internal then public). CISA alignment documentation. Regulatory engagement program.

**Status:** 🟡 Planned

**PR #78 contribution:** The ADR references SOC 2 deferral to Phase 8. Compliance export is planned for PR-V2-E. The compliance export infrastructure will be directly relevant to CRA compliance evidence — natural connection to make when V2-E ships. CRA-specific engagement has not started.

---

## Master Status Board

| # | Weakness | Priority | PR #78 Impact | Status |
|---|---|---|---|---|
| 1 | Scoring not auditable | 🔴 Critical | Foundation built (vault_evidence, proof anchors) | 🟠 In flight |
| 2 | SOC 2 missing | 🔴 Critical | RBAC + OAuth + sessions shipped | 🟠 In flight |
| 3 | Score freshness gap | 🔴 Critical | None | 🔴 Not started |
| 4 | False positive unmeasured | 🟠 High | Exception schema foundation | 🟠 In flight |
| 5 | Own deps not monitored | 🟠 High | None | 🔴 Not started |
| 6 | AI manipulation surface | 🟠 High | Vocabulary constraints pattern | 🟡 Planned |
| 7 | Legal exposure on disputes | 🟠 High | Exception state machine data model | 🟠 In flight |
| 8 | Coverage gap (npm only) | 🟡 Med-High | None | 🔴 Not started |
| 9 | Closed source tension | 🟡 Medium | None | 🟡 Planned |
| 10 | Bus factor | 🟡 Medium | PR #78 docs model is the template | 🟠 Partially |
| 11 | Funding philosophy | 🟡 Medium | None | 🔴 Not started |
| 12 | Regulation readiness | 🟡 Medium | Compliance export in V2-E roadmap | 🟡 Planned |

---

## What PR #78 Actually Moved

More than it looks like from the outside. Full accounting:

**Direct progress:** RBAC (weakness 2), OAuth + sessions (weakness 2), exception state machine foundation (weaknesses 4 + 7), vault_evidence + proof anchors (weakness 1).

**Indirect progress:** The PR documentation model itself (weakness 10) — every future contributor can see exactly how PRs should be written and what they should and shouldn't claim.

**Explicitly deferred and tracked:** SOC 2 (Phase 8), compliance export (PR-V2-E), Vault Dashboard (PR-V2-E), CLI workspace (PR-V2-D), public visibility lift (PR-V2-C). Deferred and documented — that is stronger than a gap nobody is tracking.

---

## What to Build Next — In Order

### Immediate — unblocks the self-interview publishing

1. **Score freshness timestamps in UI** — no new pipeline needed, just honest display of when a score was last computed. One PR. Closes the most glaring gap in the interview.
2. **Funding principles document** — one page, one day, published on the site. Closes weakness 11 permanently.

### Short term — unblocks enterprise conversations

3. **PR-V2-B** — exception proposal/approval/revoke/extend APIs. Closes weakness 7 properly.
4. **False positive measurement pipeline.** Closes weakness 4.
5. **Language roadmap page on the site** — public, honest, sequenced. Closes weakness 8 perception before coverage exists.

### Medium term — makes self-interview publishable without asterisks

6. **Open source the methodology tooling.** Closes weakness 9.
7. **Internal Guard deployment on OpenSoyce's own stack.** Closes weakness 5.
8. **Adversarial testing program on scoring pipeline.** Closes weakness 6.

### Long term — enterprise tier launch gates

9. **SOC 2 Type II audit** (Phase 8 per ADR).
10. **Real-time scoring pipeline.** Closes weakness 3.
11. **CRA readiness document + regulatory engagement.** Closes weakness 12.

---

## How This Connects to the On the Record Interview

The self-interview article (`on-the-record-no3-opensoyce-interviews-itself`) should not publish until at minimum items 1 and 2 from the Immediate list are done. With those in place, every answer that admits a gap also has a "here's what we shipped since we wrote this answer" line.

That turns the interview from a confession into a progress report.

A trust brand that publishes its own progress report in the form of its own honest interview is doing something almost nobody in this space does. That is the version worth shipping.

---

*This document is maintained by the OpenSoyce core team. Update the Status field whenever a build target ships. Add new weaknesses as they are identified — in the interview, in incident response, in enterprise conversations, or anywhere else the honest version surfaces a gap.*
