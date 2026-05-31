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

The production gate pipeline (resolver → OSV overlay → pattern detector → policy evaluation) was run against `ua-parser-js@0.7.29` on 2026-05-31 with `allowDemoFixtures: false`. The verbatim output is below. No values were edited. No patterns were synthesized.

### Stage 1 — OSV fast-path (live `api.osv.dev/v1/querybatch`)

```text
duration: 401ms
summary: {
  "hasVulns": true,
  "ids": [
    "GHSA-394c-5j6w-4xmx",
    "GHSA-662x-fhqg-9p8v",
    "GHSA-78cj-fxph-m83p",
    "GHSA-fhg7-m89q-25r3",
    "GHSA-pjwm-rvh2-c87w"
  ],
  "highestSeverity": "unknown",
  "critical": false,
  "summary": "Known vulnerability published in OSV database"
}
```

Five real GHSA IDs surfaced. `GHSA-pjwm-rvh2-c87w` is the canonical October 2021 supply-chain compromise advisory.

### Stage 2 — Resolver (live npm registry + GitHub)

```text
duration: 1139ms
resolved: {
  "score": 75.8,
  "license": "AGPL-3.0",
  "verdict": "forkable",
  "status": "FRESH",
  "warn": null,
  "description": "UAParser.js - The Essential Web Development Tool ...",
  "critical": false,
  "source": "live"
}
```

License `AGPL-3.0` reflects the 2023 relicensing by the maintainer (unrelated to the 2021 compromise). The resolver did not return a maintainer-compromise signal or an install-script signal. The production resolver row does not carry those fields today.

### Stage 3 — Production pattern row (production shape)

```text
rowForPatterns: {
  "package": "ua-parser-js",
  "version": "0.7.29",
  "severity": "medium",
  "ids": [
    "GHSA-394c-5j6w-4xmx",
    "GHSA-662x-fhqg-9p8v",
    "GHSA-78cj-fxph-m83p",
    "GHSA-fhg7-m89q-25r3",
    "GHSA-pjwm-rvh2-c87w"
  ],
  "verified": true,
  "license": "AGPL-3.0"
}
```

### Stage 4 — Pattern detector

```text
patternCount: 1
- known-vulnerability-exposure [severity=medium policy=block confidence=0.95]
    Signal Source: GHSA-394c-5j6w-4xmx, GHSA-662x-fhqg-9p8v,
                   GHSA-78cj-fxph-m83p, GHSA-fhg7-m89q-25r3,
                   GHSA-pjwm-rvh2-c87w
    Severity Tier: Medium
```

### Stage 5 — Policy decision (default policy)

```text
policy: warn=[graveyard, risky, watchlist], block=[]
action: ALLOW
reason: (none)
```

## What Production Actually Fired vs. The Target Shape

The target shape in the original draft of this document expected three patterns: `known-vulnerability-exposure`, `install-time-remote-execution`, `maintainer-account-compromise-signal`.

Production fired one: `known-vulnerability-exposure`.

This is the doctrine in action. Two specific gaps are now visible:

1. **OSV severity normalization returned `unknown`.** Five real GHSA advisories were retrieved, but the severity-normalization pass in `osvFastPath.js` did not classify any of them. The pattern row's severity fell back to the score-derived heuristic (`medium`), and the OSV record's `critical` field stayed `false`. The advisories themselves are real and surfaced; the severity classification on top of them is the open work.
2. **Production gate rows do not carry maintainer-compromise or install-script signals.** Those signals exist in the detector and fire correctly on the `/proof/ots-replays` live-detector path (PR #8), because that path sets `row.maintainerCompromise` directly. The production gate's resolver pipeline does not yet thread an equivalent field. The pattern was not suppressed. The input was not present.

## Decision

Default policy: ALLOW.

Five real CVE/GHSA advisories surfaced, including the canonical maintainer-account-compromise advisory. The decision is still ALLOW because the policy is reading the score-derived severity, not the OSV-derived severity, and verdict `forkable` is not warned.

This is a real, named gap. The product is not pretending it blocked the package. The product is showing the buyer exactly where the next tightening lives.

A tighter policy that blocks any verified npm package carrying one or more open OSV advisories — independent of the normalized severity — would flip this same input to BLOCK without any change to the detector. That policy already composes from the existing primitives.

## Trust Decision

This is not only "vulnerable."

This is "here is a package, here is what we found about it, here is which patterns fired, here is what our policy did about it, and here is where the next decision authority gets added."

Most scanners stop at the first line. OpenSoyce ships the rest.

## Buyer Translation

A security team does not need another red badge.

They need to know whether the dependency should ship.

OpenSoyce turns the finding into a policy-backed decision. The decision is explainable. The evidence is named. The pattern is cited. The advisory is real.

That is the category change.

## Honest Caveats

- The verbatim gate output above was captured on 2026-05-31 via a one-off smoke script that calls the same shared modules as `api/exceptions.js` (`queryOsvBatch`, `resolvePackages`, `detailPatchFromOsv`, `detectOtsPatternsForRow`) with `allowDemoFixtures: false`. The production HTTP path produces the same data structure; the wrapper differs only in JSON serialization and auth headers.
- `maintainer-account-compromise-signal` did not fire because the production gate row does not set `row.maintainerCompromise`. The `/proof/ots-replays` page does fire it on this same incident, because the replay path sets that field directly. Threading equivalent signal into the production resolver row is queued, not claimed.
- `install-time-remote-execution` did not fire because the production gate row does not set `row.hasInstallScript` for live-fetched packages. Both `install-time-remote-execution` (critical) and `install-time-execution` (medium) remain in the catalog. Adding install-script analysis to the live-fetch path is queued, not claimed.
- Screenshots from the live deployment are still to come and will be added once the production walkthrough PR captures them.
- Workflow-side patterns (`pull-request-target-abuse`, `untrusted-workflow-input`, `dangerous-release-permission`) are out of scope for this example. They are covered by the workflow companion example, planned next using `tj-actions/changed-files` (`GHSA-mrrh-fwg8-r2c3`).

## What This Proves

One real package, five real advisories, one real decision, one real evidence trail, two real gaps named in plain language.

That is the unit of proof.

The rest of the proof package — doctrine, narrative, demo, walkthrough — exists to scale this single unit into a story buyers, developers, and security teams can act on.

## Status

Spine: shipped.
Verbatim gate output: pasted (2026-05-31).
Screenshots: pending capture.
Workflow companion (`tj-actions/changed-files`): queued.
OSV severity normalization tuning: queued.
Live-fetch row enrichment (install-script, maintainer-compromise): queued.
