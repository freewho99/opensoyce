# Production Walkthrough

## Status

This walkthrough is the final proof-package artifact.

Current status: screenshot slots prepared; live deployment captures pending.

## Purpose

This artifact turns the runnable demo script into visual proof.

The [demo script](demo-script.md) tells a presenter what to do.

The production walkthrough shows what actually happened on the deployed product.

Without screenshots, the proof package ends at "here is what would happen." With them, it ends at "here is what did happen, on this URL, on this date, against this repo."

## Capture Requirements

Before this document is treated as final, capture the following nine artifacts. Each maps to a slot in the inventory table below.

1. Production URL loaded.
2. Proof package page visible.
3. Doctrine page visible.
4. `ua-parser-js@0.7.29` evidence path.
5. Project Detail page with workflow scan summary.
6. Workflow-originated pattern card.
7. Pattern card evidence rows showing:
   - `Source: GitHub workflow`
   - exact `Origin`
8. `/patterns` page showing gate-active coverage count.
9. Enterprise narrative close.

Until all nine are captured and attached, this document is a capture contract, not a proof artifact.

## Screenshot Inventory

| Slot | Screenshot | Required proof |
| --- | --- | --- |
| 01 | TODO | Production URL loaded |
| 02 | TODO | Proof package index visible |
| 03 | TODO | Doctrine four-layer model visible |
| 04 | TODO | `ua-parser-js` gate evidence visible |
| 05 | TODO | Workflow scan summary visible |
| 06 | TODO | Workflow pattern card visible |
| 07 | TODO | `Source: GitHub workflow` + exact `Origin` rows visible |
| 08 | TODO | `/patterns` coverage status visible |
| 09 | TODO | Enterprise close visible |

## Walkthrough

### Step 1 — Open Production

URL: TODO

Screenshot: TODO (slot 01)

What this proves: the proof package is attached to the live product, not only repo-local docs. The phase shift from build mode to proof mode has a public address.

### Step 2 — Open Proof Package

URL or path: TODO

Screenshot: TODO (slot 02)

What this proves: the product has a parent proof artifact and a visible artifact index. Every claim made downstream can be traced back to this index.

### Step 3 — Show Doctrine

URL or path: TODO

Screenshot: TODO (slot 03)

What this proves: the product publicly separates detection, evidence, policy, and enforcement. The four-layer model is on the page, not buried in a slide deck.

### Step 4 — Show `ua-parser-js` Evidence

Input or path: TODO (Path A repo or direct query of `ua-parser-js@0.7.29` through the gate).

Screenshot: TODO (slot 04)

What this proves: a real package with real advisories produced a real, explainable policy outcome.

Expected (per the verbatim evidence in [Before / After Risk Example](before-after-risk-example.md)):

- Five advisories surface (`GHSA-394c-5j6w-4xmx`, `GHSA-662x-fhqg-9p8v`, `GHSA-78cj-fxph-m83p`, `GHSA-fhg7-m89q-25r3`, `GHSA-pjwm-rvh2-c87w`).
- One pattern fires: `known-vulnerability-exposure`.
- Default policy returns ALLOW.

The capture must show the ALLOW outcome on-screen. The walkthrough is not credible if it hides the ALLOW.

### Step 5 — Show Workflow Scan Summary

Repo: TODO (Path B repo — `freewho99/opensoyce` is a known-good candidate per the PR #16 live smoke).

Screenshot: TODO (slot 05)

What this proves: OpenSoyce scans real `.github/workflows/*.yml` files, not only dependency manifests. The scan summary appears at the top of the Project Detail page when `project.workflowOtsScan` is present.

### Step 6 — Show Workflow Origin Precision

Pattern card: TODO (any workflow-originated pattern card in the Detected Risk Patterns grid).

Screenshot: TODO (slot 06 + slot 07)

What this proves: workflow-originated findings name the exact source and origin. The capture must include both the pattern card header and the expanded evidence rows.

Expected:

- `Source: GitHub workflow`
- For step-level patterns: `Origin: .github/workflows/<file>.yml#<jobId>.steps.<N>`
- For `dangerous-release-permission` (job-level): `Origin: .github/workflows/<file>.yml#<jobId>`

### Step 7 — Show Coverage Status

URL or path: `/patterns` on the production deployment.

Screenshot: TODO (slot 08)

What this proves: OpenSoyce publicly distinguishes gate-active patterns from catalog-only and roadmap patterns. The capture must include the header sentence ("X of Y enforced by the gate today") and at least one of each badge color.

### Step 8 — Enterprise Close

URL or path: TODO (production view of the enterprise narrative, or the in-product enterprise page if one exists).

Screenshot: TODO (slot 09)

What this proves: the buyer-facing claim is explainability, not fake universal blocking. The capture should land on the blockquote that carries the key line:

> OpenSoyce does not promise that every risk becomes a block.
>
> It promises that every risk decision becomes explainable.

## Remaining Work

- Paste production URL.
- Select Path A demo repo or fixture.
- Select Path B workflow demo repo.
- Capture screenshots for slots 01 through 09.
- Replace TODO rows with image references.
- Note exact observed outputs alongside the expected outputs above. If observed diverges from expected (different advisory IDs returned, different policy result, different pattern set), the divergence gets named here, not erased.
- Re-run the demo after screenshots are added, to confirm the captures still match what the deployed product does.

## What Would Invalidate This Walkthrough

The walkthrough must be discarded and re-captured if any of the following change after capture:

- The production URL moves.
- The gate response for `ua-parser-js@0.7.29` changes (for example, after OSV severity normalization tuning lands and flips the ALLOW to BLOCK — that is a desirable engineering outcome and an invalidating event for these specific screenshots).
- The selected workflow demo repo changes its `.github/workflows/*.yml` content.
- The catalog coverage ratio changes (currently 20 of 31 gate-active).

When any of those move, the walkthrough is re-captured. Stale captures do not get re-used.

## Status

Spine: shipped.
Production URL: pending.
Demo-repo selection (Path A + Path B): pending.
Screenshots (slots 01–09): pending capture.
Capture-completion PR: queued as PR #25 — `docs(ots): attach production walkthrough screenshots`.
Final proof package: blocked on the capture-completion PR.
