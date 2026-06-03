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

The production gate pipeline has been captured three times against the same `ua-parser-js@0.7.29` query, with the same default policy, against the live `api.osv.dev`. The diff across the three captures is the unit of proof for the doctrine:

- **2026-05-31 (pre-PR-#28)** — 1 pattern (medium), **ALLOW**. OSV severity normalization returned `unknown`.
- **2026-06-01 first re-capture (post-PR-#28)** — 1 pattern (critical), **BLOCK**. **PR #28 changed the decision** by tightening severity normalization (bulk + per-vuln detail fetches, `max(database_specific, cvss)`).
- **2026-06-01 second re-capture (post-PR-#30)** — **4 patterns**, BLOCK. **PR #30 changed the firing set** by threading CWE-829/CWE-912 compromise indicators into the production resolver row.

That distinction is the whole point. Decision changes and firing-set changes are different layers of the doctrine. The proof package records both.

The verbatim output below is the **post-PR-#30 capture** (current state). The earlier captures are preserved verbatim in [Capture History](#capture-history).

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
  "license": "AGPL-3.0",
  "hasInstallScript": true,
  "capabilityProfile": {
    "remoteExecution": true
  },
  "maintainerCompromise": {
    "reason": "Embedded malware in ua-parser-js (GHSA-pjwm-rvh2-c87w)"
  }
}
```

`details.critical` is `true` because the OSV patch sets it from `osvSummary.critical`. `rowForPatterns.severity` is `critical` because the gate handler reads OSV's normalized severity directly. **The three new fields** (`hasInstallScript`, `capabilityProfile.remoteExecution`, `maintainerCompromise.reason`) come from PR #30's `compromiseIndicators` derivation in `osvFastPath.js`: any vuln carrying CWE-829 (Inclusion of Functionality from Untrusted Control Sphere) or CWE-912 (Hidden Functionality) populates them. `GHSA-pjwm-rvh2-c87w` carries both. The four routine ReDoS GHSAs do not.

### Stage 4 — Pattern detector

```text
patternCount: 4
- known-vulnerability-exposure [severity=critical policy=block confidence=0.95]
    Signal Source: GHSA-394c-5j6w-4xmx, GHSA-662x-fhqg-9p8v,
                   GHSA-78cj-fxph-m83p, GHSA-fhg7-m89q-25r3,
                   GHSA-pjwm-rvh2-c87w
    Severity Tier: Critical
- install-time-remote-execution [severity=critical policy=block confidence=0.92]
    Install Script: preinstall/postinstall script present
    Egress Behavior: Remote payload download requested
- maintainer-account-compromise-signal [severity=high policy=warn confidence=0.82]
    Publisher Account: Embedded malware in ua-parser-js (GHSA-pjwm-rvh2-c87w)
- ci-secret-exposure-path [severity=critical policy=block confidence=0.9]
    Execution Context: CI runner job equipped with environment secrets
```

Four patterns fire on the same advisory data. Three of them are the target shape the original draft of this document called for: `known-vulnerability-exposure`, `install-time-remote-execution`, `maintainer-account-compromise-signal`. The fourth (`ci-secret-exposure-path`) fires as a downstream consequence of the new `hasInstallScript` signal under the gate's `ci: true, hasSecrets: true` context — install-time scripts that run in CI with secrets configured ARE a secret-exposure path, and the detector composes that signal honestly (see `otsPatterns.js:789`). Not over-fire; not suppressed.

### Stage 5 — Policy decision (default policy)

```text
policy: warn=[graveyard, risky, watchlist], block=[]
action: BLOCK
reason: UAParser.js - The Essential Web Development Tool for User-Agent Detection.
        Detect Browsers, OS, Devices, Bots, Apps, AI Crawlers, and more. Run in
        Browser (client-side) or Node.js (server-side).
```

Default policy returns BLOCK because `details.critical === true`. Same decision as the post-PR-#28 capture — PR #30 did not change the decision. PR #30 changed which patterns fire on the way to that decision.

## What Production Actually Fired vs. The Target Shape

The target shape in the original draft of this document expected three patterns: `known-vulnerability-exposure`, `install-time-remote-execution`, `maintainer-account-compromise-signal`.

Production fires four:

- `known-vulnerability-exposure` (critical, block) — surfaces all 5 real GHSAs
- `install-time-remote-execution` (critical, block) — sourced from CWE-829/CWE-912 indicators
- `maintainer-account-compromise-signal` (high, warn) — sourced from CWE-829/CWE-912 + advisory summary
- `ci-secret-exposure-path` (critical, block) — derived from install-script + CI/secrets context

All three evidence-layer gaps named in the original 2026-05-31 capture are now CLOSED:

1. **CLOSED — OSV severity normalization (PR #28).** Bulk + per-vuln detail fetch pipeline; `pickSeverity` takes `max(database_specific, cvss)`. `GHSA-pjwm-rvh2-c87w` carries `database_specific.severity: HIGH` plus CVSS `C:H/I:H/A:H` (critical-tier across CIA). The max correctly escalates `highestSeverity` to `critical` → `details.critical = true` → BLOCK.
2. **CLOSED — install-script signal on production rows (PR #30).** `osvFastPath.js` now derives `compromiseIndicators` from advisory CWE codes. CWE-829 (Inclusion of Functionality from Untrusted Control Sphere) or CWE-912 (Hidden Functionality) on any vuln in the package's advisory set populates `hasInstallScript: true` and `capabilityProfile.remoteExecution: true` on the gate row.
3. **CLOSED — maintainer-compromise signal on production rows (PR #30).** Same derivation. The indicator object carries `maintainerCompromiseReason` with the advisory summary + the GHSA id for evidence rendering.

The fourth firing (`ci-secret-exposure-path`) was not in the original target shape because it composes from the install-script signal under the gate's CI context. It is correct evidence, derived honestly from real inputs.

## Decision

Default policy: BLOCK.

Same decision as the post-PR-#28 capture. PR #30 did not change the decision; it changed the firing set. That distinction is the whole point of the doctrine: detection, evidence, policy, and enforcement are separate layers, and changes happen at different layers at different times.

- The 2026-05-31 → 2026-06-01 (post-#28) transition was a **decision change**: ALLOW → BLOCK, driven by improved severity classification.
- The post-#28 → post-#30 transition is a **firing-set change**: 1 pattern → 4 patterns, driven by threading compromise indicators into the production row.

Nothing in the detector was edited. Nothing in the policy rules was edited. The catalog gained no new patterns. Every change was at the evidence-layer boundary, with code paths the rest of the catalog uses too.

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

- The verbatim gate output above was re-captured on 2026-06-01 (post-PR-#30) via a one-off smoke script that calls the same shared modules as `api/exceptions.js` (`queryOsvBatch`, `resolvePackages`, `detailPatchFromOsv`, `detectOtsPatternsForRow`) with `allowDemoFixtures: false`. The production HTTP path produces the same data structure; the wrapper differs only in JSON serialization and auth headers. The two earlier captures (2026-05-31 ALLOW under pre-PR-#28 evidence, and 2026-06-01 first re-capture BLOCK-with-1-pattern under post-PR-#28 evidence) are preserved verbatim in [Capture History](#capture-history) below.
- The compromise-indicator heuristic is **package-level**, not version-aware. Any version of `ua-parser-js` would now match the indicators because the OSV query is package-name-level (per `osvFastPath.js` documented constraint: "No version-awareness in v1. Each lookup returns ALL known vulns for the package name family"). A future version-aware-gate PR will narrow this signal. For now, latest-version queries of `ua-parser-js` would also surface the historical compromise advisory's CWE codes — that is correct per the existing v1 doctrine (false-positives preferred to false-negatives for a security gate).
- The CWE heuristic is conservative on purpose. Only CWE-829 (Inclusion of Functionality from Untrusted Control Sphere) and CWE-912 (Hidden Functionality) trigger the indicators today. The four routine ReDoS GHSAs on ua-parser-js do not pollute the indicators. Expansion of the indicator vocabulary (e.g. add CWE-506 for embedded malicious code) ships only with cited incident evidence, matching the doctrine for the rest of the catalog.
- Production walkthrough slot 4c (the verbatim repo-doc evidence) has now been re-captured twice. The 2026-05-31 ALLOW capture and the 2026-06-01 first re-capture (post-PR-#28, 1 pattern + BLOCK) are both preserved verbatim. Slot 4a (`/incidents/ua-parser-js-compromise`) and slot 4b (`/proof/ots-replays`) pixel captures remain valid — those deployed surfaces did not change.
- Workflow-side patterns (`pull-request-target-abuse`, `untrusted-workflow-input`, `dangerous-release-permission`) are out of scope for this example. They are covered by the workflow companion example, planned next using `tj-actions/changed-files` (`GHSA-mrrh-fwg8-r2c3`).

## What This Proves

One real package, five real advisories, one real decision (BLOCK), one real evidence trail, three engineering gaps named and now closed (OSV severity normalization, install-script signal threading, maintainer-compromise signal threading), one engineering gap still queued in plain language (public `package@version` gate UI surface).

That is the unit of proof.

The rest of the proof package — doctrine, narrative, demo, walkthrough — exists to scale this single unit into a story buyers, developers, and security teams can act on. The transitions between captures are also units of proof:

- **2026-05-31 → 2026-06-01 (post-#28)**: decision change. ALLOW → BLOCK. Evidence layer (severity normalization) improved; policy layer responded.
- **post-#28 → post-#30**: firing-set change. 1 pattern → 4 patterns. Evidence layer (row enrichment from advisory CWEs) improved; detector emitted what it always knew how to emit; policy decision stayed BLOCK.

Two transitions, two layers, no detector edits, no policy rule edits, no new patterns in the catalog. That is the doctrine working as designed across time.

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

### 2026-06-01 first re-capture — post-PR-#28 (severity normalization gap closed → BLOCK with 1 pattern)

PR #28 (`feat(ots): enrich OSV fast-path severity from advisory details`) replaced the single bulk query with bulk + per-vuln detail-fetch, and changed `pickSeverity` to take `max(database_specific, cvss)`. `highestSeverity` flipped to `critical`. `details.critical` became `true`. Default policy returned BLOCK. The firing set was still 1 pattern — the compromise-indicator threading would not land until PR #30.

**Stage 1 — OSV fast-path:**

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

**Stage 3 — Production pattern row:**

```text
rowForPatterns: {
  "package": "ua-parser-js",
  "version": "0.7.29",
  "severity": "critical",
  "ids": ["GHSA-394c-5j6w-4xmx", "GHSA-662x-fhqg-9p8v", "GHSA-78cj-fxph-m83p",
          "GHSA-fhg7-m89q-25r3", "GHSA-pjwm-rvh2-c87w"],
  "verified": true,
  "license": "AGPL-3.0"
}
```

`hasInstallScript`, `capabilityProfile`, and `maintainerCompromise` are absent at this point — PR #30 had not landed yet.

**Stage 4 — Pattern detector:**

```text
patternCount: 1
- known-vulnerability-exposure [severity=critical policy=block confidence=0.95]
    Signal Source: GHSA-394c-5j6w-4xmx, GHSA-662x-fhqg-9p8v,
                   GHSA-78cj-fxph-m83p, GHSA-fhg7-m89q-25r3,
                   GHSA-pjwm-rvh2-c87w
    Severity Tier: Critical
```

**Stage 5 — Policy decision:**

```text
policy: warn=[graveyard, risky, watchlist], block=[]
action: BLOCK
reason: UAParser.js - The Essential Web Development Tool for User-Agent Detection.
        Detect Browsers, OS, Devices, Bots, Apps, AI Crawlers, and more...
```

The pre-#28 → post-#28 transition was a **decision change**: ALLOW → BLOCK. The firing set stayed 1 pattern.

### 2026-06-01 second re-capture — post-PR-#30 (firing-set gap closed → BLOCK with 4 patterns)

The current document above this section. Same package, same advisories, same default policy, same decision (BLOCK). What changed is the firing set: 1 pattern → 4 patterns.

PR #30 (`feat(ots): enrich live package rows with install-script and maintainer-compromise signals`) added `deriveCompromiseIndicators` in `osvFastPath.js` and threaded the indicators through the gate handler's `rowForPatterns`. The detector emits `install-time-remote-execution`, `maintainer-account-compromise-signal`, and (composed from the install-script signal under CI/secrets context) `ci-secret-exposure-path` in addition to the existing `known-vulnerability-exposure`.

The post-#28 → post-#30 transition is a **firing-set change**: 1 → 4 patterns. The decision stayed BLOCK. Two transitions, two layers of the doctrine working independently.

### 2026-06-02 → 2026-06-03 — production parity restored (PR #32 → PR #33)

This is not a new capture. It is a parity event between two surfaces that should have matched but didn't.

The local smoke that produced every verbatim block in this document calls the shared modules (`queryOsvBatch`, `resolvePackages`, `detectOtsPatternsForRow`) directly with the bare package name `ua-parser-js`. It always produced 4 patterns + BLOCK after PR #30.

The **deployed gate API** (`/api/exceptions?action=compliance-gate`) is what the public `/proof/gate` UI page (shipped PR #32 on 2026-06-02) calls. On first live render of that page with the canonical preset `?package=ua-parser-js@0.7.29`, the API returned `decision: ALLOW, overallScore: 8, cache: miss, patterns: []` — the `FALLBACK_DEFAULTS` shape. Local and production diverged.

The cause was a per-dep loop bug in `api/exceptions.js handleComplianceGate`: the handler stripped `@version` to build the OSV/resolver input maps (`cleanNames`), but then iterated the original `dependencies` array and used `nameLower` (still containing `@0.7.29`) as the map lookup key. `resolverMap.get('ua-parser-js@0.7.29')` and `osvMap.get('ua-parser-js@0.7.29')` both returned undefined. The gate fell through to fallback defaults, OSV summary was missing, no compromise indicators were threaded, no patterns fired.

**PR #33** (`fix(ots): match resolver and OSV map keys to stripped lookup names`) added the `splitPackageVersion(name)` helper to `src/shared/packageRegistryQuery.js` as the single source of truth for the strip/split, and updated the gate handler to derive `lookupKey = splitPackageVersion(nameLower).name` for both map lookups. Merged at `169397b` on 2026-06-03 03:05 local. Verified live on first poll at 03:15 local:

```text
curl -sS -X POST .../api/exceptions?action=compliance-gate \
  -d '{"dependencies":["ua-parser-js@0.7.29"]}'
→ action=BLOCK score=75.8 patterns=4
```

Production now matches the post-#30 verbatim block above for both bare-name (`ua-parser-js`) and version-suffixed (`ua-parser-js@0.7.29`) queries. Local and production are at parity.

**This is the doctrine doing its job.** The bug had existed since the original gate handler was written. Every local smoke and every test in the suite (the suite mocks the resolver / OSV) never exercised the version-suffix-in-the-loop path. The first time a user could naturally type `package@version` into a deployed UI was when PR #32 added `/proof/gate`. The page rendered exactly what the API returned — fallback shape on every version-suffixed preset. Honest by accident; useful for finding the bug.

The deployed surface revealed what local smokes couldn't. That's why the proof package exists.

This transition is neither a decision change nor a firing-set change in the doctrine's sense. It is a **parity event**: the live production surface (added in PR #32) brought into alignment with the local-smoke-verified canonical output (preserved verbatim above) by a tightly-scoped engineering fix (PR #33). The verbatim block above did not change; the API behind the deployed surface caught up.

## Status

Spine: shipped.
Verbatim gate output: pasted (re-captured 2026-06-01 post-PR-#30; the original 2026-05-31 ALLOW capture and the 2026-06-01 first re-capture post-PR-#28 are both preserved under Capture History).
Screenshots: production walkthrough captured 2026-06-01 (PR #27); slot 4c repo-doc evidence re-captured twice (post-#28, post-#30); the deployed-UI slots 4a + 4b pixel captures remain valid.
Workflow companion (`tj-actions/changed-files`): queued.
OSV severity normalization tuning: **shipped (PR #28).**
Live-fetch row enrichment (install-script, maintainer-compromise): **shipped (PR #30).**
Public `package@version` gate UI surface: **shipped (PR #32).** Production-parity bug surfaced by that surface: **fixed (PR #33).** Production now returns the verbatim post-#30 output for both bare and version-suffixed queries; verified live 2026-06-03.

**All four named engineering gaps in this proof package are now closed.**
