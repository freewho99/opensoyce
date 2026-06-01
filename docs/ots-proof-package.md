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

- Score: 90 / 100
- Tests: 100 passing
- Gate-active patterns: 20 / 31
- Workflow scan: live on real repositories
- OSV overlay: integrated
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
5. **[Production Walkthrough](proof/production-walkthrough.md)** — capture contract for the final visual proof. Spine shipped; screenshots pending (slots 01–09). Capture-completion PR queued as #25.

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

Capture-completion PR (#25) — replaces TODO rows in the production walkthrough with production URL, demo-repo selections, and screenshots for slots 01–09. After that, the proof package is final.
