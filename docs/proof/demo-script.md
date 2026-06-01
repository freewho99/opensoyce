# Runnable Proof Demo Script

## Purpose

This script turns the OpenSoyce OTS proof package into a live walkthrough.

The goal is not to show that OpenSoyce blocks everything.

The goal is to show that OpenSoyce turns open-source risk into explainable trust decisions.

The script is human-runnable today. A `.mjs` driver to automate the same beats may follow, but is not required for the demo to land.

## Demo Setup

- OpenSoyce production URL: TODO (paste the live Vercel URL before running the demo).
- Repo to analyze for Path A: TODO (any real public repo whose `package.json` includes `ua-parser-js` — or a minimal fixture repo created for the demo).
- Package example for Path A: `ua-parser-js@0.7.29`.
- Repo to analyze for Path B: TODO (a public repo whose `.github/workflows/*.yml` will trigger at least one workflow pattern — `dangerous-release-permission` is the easiest to surface; `freewho99/opensoyce` itself is a candidate per the PR #16 live smoke).
- Proof docs referenced during the demo:
  - [Before / After Risk Example](before-after-risk-example.md)
  - [Pattern Enforcement Doctrine](doctrine-pattern-enforcement.md)
  - [Enterprise Trust Narrative](enterprise-trust-narrative.md)

## Talk Track

Open-source risk is no longer only a vulnerability problem.

It is a trust-decision problem.

OpenSoyce sits between scanner inputs and policy outputs.

This walkthrough shows two paths through the product. Path A makes the doctrine concrete on a real package. Path B makes the workflow-scan precision concrete on a real `.github/workflows/*.yml` file. Together they answer the question every buyer eventually asks: what does this product actually do when I point it at real software?

---

## Path A — `ua-parser-js` Honesty Path

Shows: five advisories surfaced, one pattern fired, default policy returned ALLOW, gaps named honestly.

### Beat 1 — Open the Proof Package

Click: `docs/ots-proof-package.md`.

Say: "This is the proof package. It tells us what OpenSoyce can prove today, what is enforced today, and what is still queued."

Notice: the proof package distinguishes shipped artifacts from queued ones. Every artifact links to a file in the repo. Nothing hidden.

### Beat 2 — Show the Doctrine

Click: `docs/proof/doctrine-pattern-enforcement.md`.

Say: "The key doctrine is that detection, evidence, policy, and enforcement are separate layers."

Notice: this is the rule that prevents OpenSoyce from pretending a missing input exists just to create a stronger demo. Hold on the four-layer list — buyers who skim three slides into a vendor pitch usually skim past this kind of structural honesty, so name it out loud.

### Beat 3 — Show `ua-parser-js`

Input: `ua-parser-js@0.7.29`.

Say: "This package has real advisories. The question is not only whether advisories exist. The question is what the gate does with them."

Expected (per the verbatim evidence in [Before / After Risk Example](before-after-risk-example.md)):

- OSV advisories surface — five GHSA IDs, including `GHSA-pjwm-rvh2-c87w`.
- `known-vulnerability-exposure` fires, carrying all five IDs as signal source.
- Default policy returns ALLOW.

Say: "This is not a failed demo. This is the doctrine working. The product names the risk, names the policy outcome, and names the missing enforcement inputs. The five advisories are real. The ALLOW is real. The two missing-input gaps — maintainer-compromise and install-script signals not present on the production resolver row, plus OSV severity normalization returning `unknown` — are queued, not hidden."

Notice: a tighter policy that blocks any verified npm package carrying open OSV advisories would flip this same input to BLOCK with no change to the detector. The demo can pause here and offer to show the policy edit — or save it for the workshop after the pitch.

### Beat 4 — Connect Back to the Doctrine

Say: "The doctrine page calls this the four-layer answer: which patterns fired against the inputs the gate received, whether the inputs needed for the other patterns are present, what the policy did, and what enforcement followed. Three of those four came out of this single package query, in full view of the user."

Notice: any vendor who answers a buyer question by collapsing those four layers into a single sentence is giving a marketing answer. OpenSoyce gives the four-part answer.

---

## Path B — Workflow Origin Precision Path

Shows: `Source: GitHub workflow`, exact `Origin` down to workflow / job / step.

### Beat 5 — Run the Workflow Scan

Open: TODO (repo with workflow finding).

Say: "Now we move from package-level risk to workflow-level risk. Open-source risk does not stop at the dependency manifest. It includes every `.github/workflows/*.yml` file that can run code on behalf of the repository."

Expected (per the live smoke in PR #16 against `freewho99/opensoyce`):

- Workflow scan summary appears at the top of the Project Detail page.
- At least one pattern card renders inside Detected Risk Patterns.
- Pattern card evidence rows include `Workflow: .github/workflows/...` as the first row.

### Beat 6 — Open a Workflow Finding

Click: any workflow-originated pattern card in the Detected Risk Patterns grid.

Say: "This is the difference between a vague warning and an actionable trust finding."

Expected:

- Pattern card shows `Source: GitHub workflow`.
- Pattern card shows the exact `Origin`. For step-level patterns: `workflowPath#jobId.steps.N`. For job-level patterns (e.g. `dangerous-release-permission`): `workflowPath#jobId`.

Say: "If a security reviewer asks 'where did this risk come from,' the answer is one line. Not a screenshot, not a Slack thread, not a Jira archaeology session. The exact file, the exact job, the exact step."

Notice: the `Source: GitHub workflow` evidence row is locked by an honesty invariant test in the repo — non-workflow rows can never carry that source. The precision the buyer sees is the precision the product enforces on itself.

### Beat 7 — Show the Coverage Status

Click: `/patterns` on the production deployment, or the doctrine page's coverage-status section.

Say: "OpenSoyce tells the truth about what it enforces. Twenty of thirty-one catalog patterns are gate-active today. The rest are labeled `catalog-only` or `roadmap`. The labels are public."

Notice: this is the moment to pre-empt the "what about AI agents and dev-tools" question. The eleven roadmap patterns are not hidden. They are labeled. They will move when the signal sources move. The doctrine is what makes that movement credible.

---

## Beat 8 — Enterprise Close

Open: `docs/proof/enterprise-trust-narrative.md`.

Say: "OpenSoyce does not promise every risk becomes a block. It promises every risk decision becomes explainable."

Close: "OpenSoyce builds the record an organization can stand behind."

---

## What To Expect Buyers To Push On

- "Why did `ua-parser-js` return ALLOW?" — answer with Beat 3 and the doctrine. Then offer to flip the policy live.
- "How do I know your replay outputs are real?" — point at `/proof/ots-replays`, then at the test suite that enforces set-equality between detector output and the expected pattern IDs.
- "What about AI-agent risk?" — answer with Beat 7. Eleven roadmap patterns, no hidden coverage.
- "How does this fit our CI?" — point at the existing PR-comment integration and the workflow-scan summary. Workflow findings carry workflow / job / step origin; CI surfaces them at the same level of precision.

## TODO Block (before the next live run)

- Production URL.
- Path A demo repo or fixture.
- Path B demo repo (likely `freewho99/opensoyce` or a chosen public repo with a known workflow finding).
- Screenshots for each beat — captured separately in the production walkthrough artifact.
- Optional `.mjs` driver to automate beats 3 through 6 as a regression smoke for the demo path itself.

## Status

Spine: shipped.
Production URL paste: pending.
Demo-repo selection: pending.
Screenshots: pending capture (own PR: production walkthrough).
Optional automation driver: deferred — human-runnable script lands first.
