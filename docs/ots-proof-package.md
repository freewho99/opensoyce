# OpenSoyce OTS Proof Package

## Phase Status

OpenSoyce OTS has crossed from build mode into proof mode.

The product now works end-to-end.

The next job is packaging the proof so buyers, developers, and security teams understand why it matters.

## Core Claim

OpenSoyce turns open-source risk into enforceable, explainable trust decisions.

It does not just tell teams whether a dependency has a vulnerability. It helps decide whether that dependency, workflow, or open-source component should be allowed into production under a real trust policy.

Feature still ships.
Risk does not.

## What Is Now Proven

OpenSoyce OTS can:

1. Analyze real repositories.
2. Query live package and advisory signals.
3. Overlay OSV vulnerability intelligence.
4. Detect day-0 dependency risk.
5. Block unsafe packages before merge.
6. Scan real `.github/workflows/*.yml` files.
7. Detect risky GitHub Actions patterns.
8. Show exactly where the workflow risk came from.
9. Distinguish gate-active patterns from catalog-only roadmap patterns.
10. Preserve credibility through structural tests and honest disclosure.

## The Phase Shift

Before this shipping arc, OpenSoyce was a strong open-source intelligence product.

After this arc, OpenSoyce is trust infrastructure.

The difference is decision authority.

Old OpenSoyce:
Here is information about this project.

New OpenSoyce:
Here is whether this project, dependency, or workflow should be trusted enough to ship.

## The OTS Loop

Detect → Decide → Explain → Act → Record → Prove

That loop is now real across package and workflow risk.

## What Makes It Different

Most tools answer:

Does this package have a known vulnerability?

OpenSoyce answers:

Should this code be allowed into our software under our company's trust policy?

That is a different category.

## Current Proof State

- **Arc status: closed** (see [Phase Closeout](proof/phase-closeout.md))
- Score: 90 / 100
- Tests: 158 passing across both shipped arcs
- Gate-active patterns: 20 / 31
- Workflow scan: live on real repositories
- OSV overlay: integrated, with severity normalization (PR #28 — bulk + detail enrichment, max-of-both severity) and compromise-indicator enrichment (PR #30 — CWE-829/CWE-912 → install-script + remote-execution + maintainer-compromise signals on production rows)
- Public deployed gate UI: `/proof/gate?package=name@version` shipped (PR #32); production-parity bug surfaced and fixed (PR #33); discoverability links shipped (PR #41)
- Synthetic demo signals: isolated
- Evidence display: operator-readable
- Coverage disclosure: honest by design

## Audience One-Liners

**Buyer-facing.**
OpenSoyce is a trust decision layer for open-source software. It scans dependencies and CI workflows, detects known supply-chain risk patterns, explains the evidence, and helps teams block or approve code before it reaches production.

**Developer-facing.**
OpenSoyce OTS is a programmable trust gate for open-source dependencies and GitHub workflows, backed by live repo signals, OSV advisory intelligence, pattern detection, and explainable policy outcomes.

**Security-facing.**
OpenSoyce converts software supply-chain risk into auditable enforcement decisions, surfacing the exact dependency, workflow, job, or step that triggered the trust policy.

## The Doctrine

A pattern can be educational before it is enforceable.
The product always says which is which.

That doctrine is the credibility engine.

## Proof Artifacts

The proof package is a parent index. Each artifact lands as its own file under `docs/proof/`.

1. **[Before / After Risk Example](proof/before-after-risk-example.md)** — one real package, one concrete delta. Shipped.
2. **[Doctrine Page](proof/doctrine-pattern-enforcement.md)** — the four enforcement layers, coverage statuses, and the enforcement rule. Shipped.
3. **[Enterprise Trust Narrative](proof/enterprise-trust-narrative.md)** — buyer-facing long-form: the trust-decision problem, the OTS loop, why honesty is the product. Shipped.
4. **[Demo Script](proof/demo-script.md)** — two-path runnable walkthrough: `ua-parser-js` honesty path + workflow origin precision path. Shipped (markdown-only; `.mjs` driver deferred).
5. **[Production Walkthrough](proof/production-walkthrough.md)** — screenshot-grounded record of an end-to-end run against `opensoyce-f336.vercel.app`. Captured 2026-06-01. Nine numbered slots filled plus GUARD probe documented. Shipped.
6. **[Phase Closeout](proof/phase-closeout.md)** — the "we shipped the phase" doc. Captures the full arc (PRs #19 → #41 + the handoff folder + this closeout), names all four engineering gaps as closed, records the four doctrine transitions on `ua-parser-js@0.7.29`, names the future phases as out of scope. The OTS engineering arc is closed. Shipped.
7. **[Production CEI Decision Loop Proof](proof/production-cei-decision-loop-proof.md)** — the first live trust-decision artifact: a production dependency observation, deduped under repetition, proposed as an exception, reviewed with source context, approved, and receipted in two independent audit surfaces. Captured 2026-06-10 against production. Shipped.
8. **[Production Full-Chain Evidence Export Proof](proof/production-full-chain-evidence-export-proof.md)** — the full chain as audit-ready evidence: a vulnerable component observed, OSV context attached, remediation question answered, temporary trust approved, expired by clock time, reaped by the system, resolved by the reviewer, and exported with all nine sections present ([the bundle, verbatim](proof/artifacts/pr-proof-2/lodash-full-chain-evidence-export.md)). Accelerated, not fabricated. Captured 2026-06-11 against production. Shipped.
9. **[Remediation Evidence Closes the Evidence Loop](proof/remediation-evidence-loop-proof.md)** — the PR-PROOF-2 chain continued: the `remediation_required` direction opened a derived evidence case, the fixed version was observed through a real CLI ingest, a human recorded cited evidence, and the export regenerated with all ten sections present ([the bundle, verbatim](proof/artifacts/pr-proof-3/lodash-evidence-loop-closed-export.md)). Direction and evidence stay distinct; nothing in the past was edited; nothing was certified. Captured 2026-06-12 against production. Shipped.
10. **[Production Rollup Evidence Packet Proof](proof/rollup-evidence-packet-proof.md)** — the first buyer/security-review packet: multiple component trust chains composed into one document with mixed states preserved — an `evidence_recorded` chain (lodash, the PROOF-3 loop) beside an active temporary-trust chain (`b777fb25`, read-only and untouched), plus four observation-only exposures as inventory and packet-level honest non-claims ([the packet, verbatim](proof/artifacts/pr-proof-4/production-workspace-evidence-packet.md)). A rollup is composition, not certification. Captured 2026-06-12 against production. Shipped.
11. **[Production Trust Record API + Webhook Proof](proof/trust-record-api-webhook-proof.md)** — trust records as machine-consumable infrastructure: a read-only Bearer token read bounded trust-record summaries on production (writes refused by routing, cross-workspace 404, revocation immediate), and one signed `remediation_evidence.recorded` webhook delivery was captured and HMAC-verified with independent local crypto — reviewer direction and remediation evidence separate even on the wire, non-claims embedded in the payload, `b777fb25` read-only and untouched. Notification, never certification. Captured 2026-06-12 against production. Shipped.
12. **[Production Evidence Citation Check Proof](proof/evidence-citation-check-proof.md)** — the system checked a human-cited citation without certifying anything: `internal_exposure_reference` on the PROOF-3 evidence row returned `check_passed` (the cited `lodash@4.17.21` observation exists in-workspace, later than the original `4.17.20`) with the non-claim in the result itself — *"this does not claim the vulnerability is fixed"* — and the first eleven-section production bundle preserved direction, evidence, and check as distinct records ([the bundle, verbatim](proof/artifacts/pr-proof-6/first-11-section-production-bundle.md)). A check confirms the citation, not the remediation. Captured 2026-06-12 against production. Shipped.

## The Story

Open-source software is not just a library problem anymore.

It is dependencies, workflows, actions, maintainers, registries, release pipelines, and hidden trust assumptions.

Teams do not need another dashboard full of vague risk signals.

They need a system that can say:

This is allowed.
This should warn.
This should block.
This needs an exception.
Here is the evidence.
Here is where it came from.
Here is why the decision was made.

That is OpenSoyce OTS.

## The Strong Close

OpenSoyce does not sell fear.

OpenSoyce sells trust you can inspect.

It turns open-source adoption from a vibes-based decision into a policy-backed, evidence-backed, workflow-enforced decision.

OpenSoyce is not just finding risk.
OpenSoyce is teaching software teams how to make trust decisions.

## Next Artifact

Capture-completion PR — replaces TODO rows in the production walkthrough with production URL, demo-repo selections, and screenshots for slots 01–09. After that, the proof package is final.
