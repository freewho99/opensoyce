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

The production gate pipeline (resolver → OSV overlay → pattern detector → policy evaluation) was first run against `ua-parser-js@0.7.29` on 2026-05-31. That capture produced ALLOW, and the document named the evidence-layer gap that caused it.

The same pipeline was re-run on 2026-06-01 after PR #28 (`feat(ots): enrich OSV fast-path severity from advisory details`) landed. The pipeline now produces BLOCK on the same package. The verbatim output below is the **2026-06-01 re-capture**. The 2026-05-31 ALLOW capture is preserved verbatim further down under [Capture History](#capture-history) — it is the historical record of the doctrine working as designed.

No values were edited. No patterns were synthesized.

### Stage 1 — OSV fast-path (live `api.osv.dev`)

```text
duration: 1279ms
summary: {
  "hasVulns": true,
  "ids": [
    "GHSA-394c-5j6w-4xmx",
    "GHSA-662x-fhqg-9p8v",
    "GHSA-78cj-fxph-m83p",
    "GHSA-fhg7-m89q-25r3",
    "GHSA-pjwm-rvh2-c87w"
  ],
  "highestSeverity": "critical",
  "critical": true,
  "summary": "ua-parser-js Regular Expression Denial of Service vulnerability"
}
```

Five real GHSA IDs surfaced. `GHSA-pjwm-rvh2-c87w` is the canonical October 2021 supply-chain compromise advisory. Duration is higher than the original 401ms because the post-PR-#28 fast path makes a bulk query plus N parallel detail fetches (one per unique vuln ID) — the bulk endpoint returns stubs without severity data; the detail records carry `database_specific.severity` and CVSS.

`highestSeverity` is `critical` now (was `unknown` at first capture). The escalation is driven by `GHSA-pjwm-rvh2-c87w`'s CVSS vector `C:H/I:H/A:H` — critical-tier impact across confidentiality, integrity, and availability. `database_specific.severity` on the GHSA record is `HIGH`; the post-PR-#28 normalizer takes the max of both signals.

### Stage 2 — Resolver (live npm registry + GitHub)

```text
duration: 1198ms
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
details: {
  "score": 75.8,
  "license": "AGPL-3.0",
  "verdict": "forkable",
  "status": "FRESH",
  "warn": null,
  "description": "UAParser.js - The Essential Web Development Tool...",
  "critical": true,
  "source": "live"
}
rowForPatterns: {
  "package": "ua-parser-js",
  "version": "0.7.29",
  "severity": "critical",
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

`details.critical` is `true` because the OSV patch sets it from `osvSummary.critical`. `rowForPatterns.severity` is `critical` because the gate handler reads OSV's normalized severity directly instead of falling back to the score-derived heuristic.

### Stage 4 — Pattern detector

```text
patternCount: 1
- known-vulnerability-exposure [severity=critical policy=block confidence=0.95]
    Signal Source: GHSA-394c-5j6w-4xmx, GHSA-662x-fhqg-9p8v,
                   GHSA-78cj-fxph-m83p, GHSA-fhg7-m89q-25r3,
                   GHSA-pjwm-rvh2-c87w
    Severity Tier: Critical
```

### Stage 5 — Policy decision (default policy)

```text
policy: warn=[graveyard, risky, watchlist], block=[]
action: BLOCK
reason: UAParser.js - The Essential Web Development Tool for User-Agent Detection.
        Detect Browsers, OS, Devices, Bots, Apps, AI Crawlers, and more. Run in
        Browser (client-side) or Node.js (server-side).
```

Default policy returns BLOCK because `details.critical === true`. The reason field carries the package description because the OSV summary text falls through into `details.description` when the resolver's description was used as-is — that is the existing handler behavior, unchanged by PR #28.

## What Production Actually Fired vs. The Target Shape

The target shape in the original draft of this document expected three patterns: `known-vulnerability-exposure`, `install-time-remote-execution`, `maintainer-account-compromise-signal`.

Production fires one: `known-vulnerability-exposure` — at **critical** severity, carrying all five real GHSA IDs.

Of the two evidence-layer gaps named in the original 2026-05-31 capture, one is closed and one remains:

1. **CLOSED — OSV severity normalization.** PR #28 (`feat(ots): enrich OSV fast-path severity from advisory details`) replaced the single bulk query (which returns stubs without severity) with a bulk + parallel `/v1/vulns/<id>` detail-fetch pipeline, and changed `pickSeverity` to take `max(database_specific, cvss)`. `GHSA-pjwm-rvh2-c87w` carries `database_specific.severity: HIGH` plus CVSS `C:H/I:H/A:H` (critical-tier across CIA). The max-of-both correctly escalates the package's `highestSeverity` to `critical`, which flows through to `details.critical` and the gate's BLOCK path.
2. **OPEN — production gate rows still do not carry maintainer-compromise or install-script signals.** Those signals exist in the detector and fire correctly on the `/proof/ots-replays` live-detector path (PR #8), because that path sets `row.maintainerCompromise` directly. The production gate's resolver pipeline does not yet thread an equivalent field. The patterns are not suppressed. The inputs are not present.

The package still BLOCKs even without those two patterns firing — `known-vulnerability-exposure` at critical severity is enough on its own. The remaining gap is about completeness of the firing set, not about whether the gate decision is correct.

## Decision

Default policy: BLOCK.

Five real CVE/GHSA advisories surface, including the canonical maintainer-account-compromise advisory. The OSV overlay now correctly classifies the maximum severity across all five as `critical`. `details.critical` is `true`. The gate's `isCritical` check passes. Policy returns BLOCK with the package description as the reason.

This is the same package, the same advisories, and the same default policy as the 2026-05-31 capture. What changed is the evidence layer underneath. The doctrine ("detection, evidence, policy, and enforcement are separate layers") predicts exactly this: when the evidence layer improves, the policy layer responds. Nothing in the policy rules was edited.

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

- The verbatim gate output above was re-captured on 2026-06-01 via a one-off smoke script that calls the same shared modules as `api/exceptions.js` (`queryOsvBatch`, `resolvePackages`, `detailPatchFromOsv`, `detectOtsPatternsForRow`) with `allowDemoFixtures: false`. The production HTTP path produces the same data structure; the wrapper differs only in JSON serialization and auth headers. The 2026-05-31 capture (which produced ALLOW under the pre-PR-#28 evidence layer) is preserved verbatim in [Capture History](#capture-history) below.
- `maintainer-account-compromise-signal` did not fire because the production gate row does not set `row.maintainerCompromise`. The `/proof/ots-replays` page does fire it on this same incident, because the replay path sets that field directly. Threading equivalent signal into the production resolver row is queued, not claimed.
- `install-time-remote-execution` did not fire because the production gate row does not set `row.hasInstallScript` for live-fetched packages. Both `install-time-remote-execution` (critical) and `install-time-execution` (medium) remain in the catalog. Adding install-script analysis to the live-fetch path is queued, not claimed.
- Production walkthrough slot 4c (the verbatim repo-doc evidence captured 2026-05-31) was the ALLOW output. Slot 4a (`/incidents/ua-parser-js-compromise`) and slot 4b (`/proof/ots-replays`) remain valid — those surfaces showed the 3-pattern + BLOCK shape via catalog mapping and replay fixtures respectively. The walkthrough's "What Would Invalidate" section anticipated this re-capture explicitly.
- Workflow-side patterns (`pull-request-target-abuse`, `untrusted-workflow-input`, `dangerous-release-permission`) are out of scope for this example. They are covered by the workflow companion example, planned next using `tj-actions/changed-files` (`GHSA-mrrh-fwg8-r2c3`).

## What This Proves

One real package, five real advisories, one real decision (now BLOCK), one real evidence trail, one engineering gap closed (OSV severity normalization), one engineering gap still named in plain language (live-fetch row enrichment).

That is the unit of proof.

The rest of the proof package — doctrine, narrative, demo, walkthrough — exists to scale this single unit into a story buyers, developers, and security teams can act on. The ALLOW → BLOCK transition between the two captures is also a unit of proof: the doctrine working as designed, the evidence layer improving, the policy layer responding without an edit.

## Capture History

The doctrine says risk does not lose its name because someone needed to ship. The same rule applies to evidence captures: the prior ALLOW result was real, was captured honestly, and is preserved here verbatim. It is not erased; it is recorded.

### 2026-05-31 capture — pre-PR-#28 (evidence-layer gap → ALLOW)

This is the first capture, taken when the OSV fast path issued only the bulk `querybatch` call. That endpoint returns vuln stubs (`{id, modified}`) without severity data. The summarizer found no severity fields, emitted `highestSeverity: 'unknown'` and `critical: false`, and the gate's score-derived severity fallback returned `medium`. Default policy returned ALLOW.

**Stage 1 — OSV fast-path:**

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

**Stage 3 — Production pattern row:**

```text
rowForPatterns: {
  "package": "ua-parser-js",
  "version": "0.7.29",
  "severity": "medium",
  "ids": ["GHSA-394c-5j6w-4xmx", "GHSA-662x-fhqg-9p8v", "GHSA-78cj-fxph-m83p",
          "GHSA-fhg7-m89q-25r3", "GHSA-pjwm-rvh2-c87w"],
  "verified": true,
  "license": "AGPL-3.0"
}
```

**Stage 4 — Pattern detector:**

```text
patternCount: 1
- known-vulnerability-exposure [severity=medium policy=block confidence=0.95]
    Signal Source: GHSA-394c-5j6w-4xmx, GHSA-662x-fhqg-9p8v,
                   GHSA-78cj-fxph-m83p, GHSA-fhg7-m89q-25r3,
                   GHSA-pjwm-rvh2-c87w
    Severity Tier: Medium
```

**Stage 5 — Policy decision:**

```text
policy: warn=[graveyard, risky, watchlist], block=[]
action: ALLOW
reason: (none)
```

The capture was honest. The product said so. The doc said so. The doctrine page (PR #21) used this exact ALLOW outcome as the worked example.

### 2026-06-01 re-capture — post-PR-#28 (evidence-layer gap closed → BLOCK)

The current document above this section. Same package, same advisories, same default policy. Different evidence layer. Different policy result.

The diff between the two captures is the unit of proof for the doctrine. Detection did not change. Policy did not change. Evidence improved. Enforcement followed.

## Status

Spine: shipped.
Verbatim gate output: pasted (re-captured 2026-06-01 post-PR-#28; original 2026-05-31 capture preserved under Capture History).
Screenshots: production walkthrough captured 2026-06-01 (PR #27); slot 4c invalidated by this re-capture and will need re-shot in the next walkthrough cycle if the doc is re-rendered as visual proof.
Workflow companion (`tj-actions/changed-files`): queued.
OSV severity normalization tuning: **shipped (PR #28).**
Live-fetch row enrichment (install-script, maintainer-compromise): queued.
Public `package@version` gate UI surface: queued.
