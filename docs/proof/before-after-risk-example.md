# Before / After: `ua-parser-js` Supply-Chain Risk

## Why This Example

`ua-parser-js` is a real npm supply-chain compromise.

It is not a synthetic demo. It is not `mockAxios`. It is not `malicious-pkg`.

It is a widely-used user-agent parser with hundreds of millions of weekly downloads, whose maintainer's npm account was compromised in October 2021. The attacker published three malicious versions (`0.7.29`, `0.8.0`, `1.0.0`) that executed a preinstall script on every machine that installed them. The payload included a credential stealer and a cryptominer. The maintainer's incident report stated that anyone who installed an affected version should rotate credentials on the affected machine.

Primary references:

- GitHub Security Advisory `GHSA-pjwm-rvh2-c87w`
- Maintainer incident report: `github.com/faisalman/ua-parser-js/issues/536`

This is exactly the class of risk OpenSoyce was built to make enforceable.

## Before OTS

Traditional dependency scanners answer one question:

Does this version have a known advisory?

That is useful. It is also incomplete.

They do not tell the buyer:

- Whether the dependency should block a merge.
- What pattern the incident represents.
- What evidence triggered the decision.
- Whether the risk is advisory-only, install-time, maintainer-account, or workflow-related.
- What policy action should happen next.

The team sees a red badge. The team does not see a decision.

## After OTS

OpenSoyce evaluates the same package as a trust decision under a real policy.

**Detected patterns (target shape):**

- `known-vulnerability-exposure` — OSV advisory match, real GHSA ID surfaced.
- `install-time-remote-execution` — preinstall script with network behavior.
- `maintainer-account-compromise-signal` — maintainer signal flagged on the package row.

**Decision:**

BLOCK.

**Evidence shape:**

- Advisory ID from the OSV overlay.
- Per-match severity from the OSV record (not catalog default).
- Install-time execution signal from the package row.
- Maintainer-compromise signal from the package row.

> TODO: paste exact production gate output for `ua-parser-js@0.7.29` from a live `/api/gate` call. Replace this block with the verbatim JSON response.

> TODO: paste exact OSV advisory IDs surfaced. Confirm `GHSA-pjwm-rvh2-c87w` is the active ID and capture any related entries returned by `api.osv.dev/v1/querybatch`.

> TODO: paste screenshot of the Project Detail "Detected Risk Patterns" panel with the three patterns above visible and the evidence rows expanded.

> TODO: paste screenshot of `/proof/ots-replays` rendering the `ua-parser-js` replay row, since this incident is one of the six cited replays in the proof page.

## Trust Decision

This is not only "vulnerable."

This is "not allowed to enter the software supply chain without remediation or exception."

The difference is decision authority. The same advisory data, run through a real trust policy, produces a different output: an action, with evidence, that a human or a CI step can act on.

## Buyer Translation

A security team does not need another red badge.

They need to know whether the dependency should ship.

OpenSoyce turns the finding into a policy-backed decision. The decision is explainable. The evidence is named. The pattern is cited. The advisory is real.

That is the category change.

## Honest Caveats

- The exact gate output above is a target shape, not a paste. The verbatim response will replace the TODO blocks before this document is treated as final proof. The doctrine of this product is that proof gets pasted, not described.
- `maintainer-account-compromise-signal` fires on `row.maintainerCompromise`. The package row producer that sets that signal for `ua-parser-js` historically is the live-detector replay in `/proof/ots-replays`. The production gate path will surface the same signal only when the upstream resolver / OSV overlay populates the equivalent field for the queried version. Where that signal does not yet thread through the production gate, the proof will say so rather than claim it.
- `install-time-remote-execution` is the critical-tier pattern. `install-time-execution` is the medium-tier sibling. Both exist in the catalog (PR #7). The verbatim gate output will resolve which one fires for the queried version.
- Workflow-side patterns (`pull-request-target-abuse`, `untrusted-workflow-input`, `dangerous-release-permission`) are out of scope for this example. They are covered by the workflow companion example, planned next using `tj-actions/changed-files` (`GHSA-mrrh-fwg8-r2c3`).

## What This Proves

One real package, one real advisory, one real decision, one real evidence trail.

That is the unit of proof.

The rest of the proof package — doctrine, narrative, demo, walkthrough — exists to scale this single unit into a story buyers, developers, and security teams can act on.

## Status

Spine: shipped.
Verbatim gate output: pending paste.
Screenshots: pending capture.
Workflow companion (`tj-actions/changed-files`): queued.
