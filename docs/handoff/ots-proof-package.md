# OTS Proof Package Arc — Handoff

**As of `169397b` on main (2026-06-03, 03:15 local). The arc ran 2026-05-31 through 2026-06-03.**

You're picking up after a 15-PR arc that took OpenSoyce OTS from "build mode" to "proof mode" and shipped the full proof package end-to-end, including the public deployed surface that buyers can inspect.

For cross-arc rules (forbidden ops, working style, getting-started), see [README.md](README.md).

---

## TL;DR for the impatient

- **Arc shipped**: 5-artifact proof package (parent + 4 children) + visual captures + 3 evidence-layer engineering fixes + public package@version gate UI + version-suffix lookup fix that closed the arc.
- **111 tests passing** in OTS-relevant suites (governor 15 + patterns 25 + replays 7 + resolver 18 + osv 18 + workflows 15 + repo-scan 13). Combined with the candidate arc's tests, the full `npm run test:ci` reports **158 passing**.
- **Doctrine**: *A pattern can be educational before it is enforceable. The product always says which is which.* Plus: *Detection, evidence, policy, and enforcement are separate layers.*
- **All four named engineering gaps are closed.** No queued OTS engineering follow-ups remain in this arc.
- **Three small docs/UX follow-ups still queued.** PR #39 (doc repair), PR #40 (discoverability), PR #41 (phase closeout). Don't pull next-phase work forward without explicit user call.

---

## What's on main

```text
main
 ├── d5a0fab  docs(ots): add proof package spine                                            (#19)
 ├── bff98ae  docs(ots): paste ua-parser-js gate evidence                                   (#20)
 ├── 9d10a5d  docs(ots): add pattern enforcement doctrine                                   (#21)
 ├── d3af3db  docs(ots): add enterprise trust narrative                                     (#22)
 ├── 0cb5cb8  docs(ots): add runnable proof demo script                                     (#23)
 ├── c3bba15  docs(ots): add production walkthrough spine                                   (#25)
 ├── f59a09b  docs(ots): align production walkthrough with deployed scan surface            (#26)
 ├── f421fa6  docs(ots): attach production walkthrough screenshots                          (#27)
 ├── 392b1df  feat(ots): enrich OSV fast-path severity from advisory details                (#28)
 ├── c65e17f  docs(ots): update ua-parser-js proof evidence after OSV severity normalization (#29)
 ├── 084297a  feat(ots): enrich live package rows with install-script and maintainer-compromise signals (#30)
 ├── e223e64  docs(ots): update ua-parser-js proof evidence after live row enrichment       (#31)
 ├── 8521602  feat(ots): add public package-version gate UI surface                         (#32)
 └── 169397b  fix(ots): match resolver and OSV map keys to stripped lookup names            (#33)
```

(PR #24 was the parallel candidate-pipeline blog post; not part of this arc.)

| PR | What it added | Status |
|---|---|---|
| #19 | Proof package parent + first child (Before/After Risk Example, TODO blocks for verbatim gate output) | Merged |
| #20 | Pasted verbatim `ua-parser-js@0.7.29` gate evidence into the Before/After doc. **Result: 1 pattern, ALLOW.** Doc named the two evidence-layer gaps honestly. | Merged |
| #21 | Doctrine page — four-layer model (pattern definition / evidence availability / policy decision / enforcement action), coverage statuses, enforcement rule | Merged |
| #22 | Enterprise trust narrative — buyer-facing long-form grounded in the doctrine + the ua-parser-js evidence | Merged |
| #23 | Runnable demo script — two-path walkthrough (ua-parser-js honesty + workflow origin precision) | Merged |
| #25 | Production walkthrough spine — 9-slot screenshot inventory + GUARD probe row | Merged |
| #26 | Walkthrough alignment after live recon — deployed UI is a GitHub owner/repo scanner, not a package@version gate; Step 4 reframed to the discovered seam | Merged |
| #27 | Production walkthrough captures — 9 slots + GUARD probe all captured against `opensoyce-f336.vercel.app` | Merged |
| #28 | **Evidence-layer fix #1**: OSV severity normalization. Bulk → per-vuln detail enrichment + `max(database_specific, cvss)` severity. Result for `ua-parser-js@0.7.29`: **decision changed** ALLOW → BLOCK. | Merged |
| #29 | Proof doc repair after PR #28 — recorded ALLOW → BLOCK as doctrine working, preserved 2026-05-31 ALLOW capture verbatim | Merged |
| #30 | **Evidence-layer fix #2**: live-fetch row enrichment. CWE-829/CWE-912 → install-script + remote-execution + maintainer-compromise signals on production rows. Result: **firing set changed** 1 → 4 patterns. Decision stayed BLOCK. | Merged |
| #31 | Proof doc repair after PR #30 — three captures preserved verbatim, decision-change vs firing-set-change distinction made explicit | Merged |
| #32 | Public `/proof/gate?package=name@version` UI surface — calls the same `compliance-gate` API Guard PR comments use, renders verbatim production output | Merged |
| #33 | **Production bug fix**: gate handler used full `name@version` string as resolver/OSV map lookup key but maps were keyed by stripped name. Every version-suffixed query fell through to FALLBACK_DEFAULTS. Surfaced by PR #32's live deployment of `/proof/gate?package=ua-parser-js@0.7.29`. Fix flips production from `ALLOW + 0 patterns + fallback shape` to `BLOCK + 4 patterns + real evidence`. **Live verified 2026-06-03 03:15 local.** | Merged |

---

## Doctrine — load-bearing rules for ANY future OTS change

> **A pattern can be educational before it is enforceable. The product always says which is which.**

> **Detection, evidence, policy, and enforcement are separate layers.**

> **Risk does not lose its name because someone needed to ship.**

These aren't prose; they're enforced in code, tests, and shipped docs.

### Hard rule 1: Gate maps are keyed by stripped package name

The resolver map (`resolverMap` from `resolvePackages()`) and the OSV map (`osvMap` from `queryOsvBatch()`) are both keyed by **the stripped lowercased package name**, NOT by the full `name@version` string the caller may have sent. Any future code in `api/exceptions.js handleComplianceGate` (or any sibling handler) that does `someMap.get(nameLower)` where `nameLower` could contain `@<version>` is a **regression of PR #33**. The canonical helper is `splitPackageVersion(name)` from `src/shared/packageRegistryQuery.js` — use it to derive the lookup key. The regression test pinning the exact ua-parser-js bug case is in `scripts/test-package-registry-query.mjs`. If you write a new gate-adjacent handler that takes a `dependencies` array, mirror the pattern: build `cleanNames` via the helper, then in the per-dep loop compute `lookupKey = splitPackageVersion(nameLower).name` and use it for every map lookup.

### Hard rule 2: Verbatim evidence captures are preserved, never overwritten

The Before/After Risk Example doc (`docs/proof/before-after-risk-example.md`) holds three verbatim captures of `ua-parser-js@0.7.29` across the arc: pre-#28 (ALLOW, 1 pattern medium), post-#28 (BLOCK, 1 pattern critical), post-#30 (BLOCK, 4 patterns). Every capture is preserved verbatim under `## Capture History`. The doctrine of "Risk does not lose its name because someone needed to ship" applies to evidence too: prior captures are recorded as historical states of the evidence layer. Don't delete them. Don't edit them retroactively. If a future engineering fix invalidates the current state, add a fourth capture and leave the first three intact.

### Hard rule 3: Decision-change vs firing-set-change is a real distinction

PR #28 changed the **decision** on `ua-parser-js@0.7.29` (ALLOW → BLOCK). PR #30 changed the **firing set** (1 → 4 patterns) but the decision stayed BLOCK. These are different layers of the doctrine. A trust product that conflates them can't explain itself when a buyer asks "did anything change about how my dependencies get evaluated?" Future PRs that affect the gate must name which layer they touch. PR descriptions should be explicit: "this PR changes the decision on X" vs "this PR changes the firing set on X."

### Hard rule 4: The deployed `/proof/gate` surface is the verbatim mirror

`src/pages/Gate.tsx` posts `{ dependencies: ['<user-input>'] }` to `/api/exceptions?action=compliance-gate` and renders whatever comes back. No synthetic fixtures. No friendly-rewritten error messages. The page is the live equivalent of the verbatim repo-doc evidence in `before-after-risk-example.md`. If a future PR wraps the response in any kind of UI logic that filters/transforms/synthesizes, that's a doctrine violation. The page is the live API mirror.

### Hard rule 5: Compromise-indicator heuristic is conservative on purpose

`deriveCompromiseIndicators` in `src/shared/osvFastPath.js` fires on CWE-829 (Inclusion of Functionality from Untrusted Control Sphere) OR CWE-912 (Hidden Functionality). Only those two CWE codes. ReDoS bugs (CWE-400), prototype pollution (CWE-1321), command injection (CWE-78) — none trigger the indicators. Expansion of the indicator vocabulary requires cited incident evidence, matching the doctrine for the rest of the catalog. Don't widen the CWE set on a hunch.

---

## Architecture quick map — the gate pipeline

```text
POST /api/exceptions?action=compliance-gate    (public, no-auth)
   │   body: { dependencies: ['pkg', 'pkg@version', '@scope/pkg@version', ...] }
   │
   ▼
cleanNames = splitPackageVersion(...).name for each dep
   │
   ├─→ queryOsvBatch(cleanNames)            ← src/shared/osvFastPath.js
   │      bulk POST to api.osv.dev → vuln IDs
   │      parallel detail fetches → full advisory records
   │      pickSeverity = max(database_specific, cvss)
   │      deriveCompromiseIndicators (CWE-829 / CWE-912)
   │      returns osvMap keyed by stripped name
   │
   └─→ resolvePackages(sb, cleanNames)       ← src/shared/packageRegistryQuery.js
          snapshot (fresh) → snapshot-stale (served) → live-fetch (with timeout)
          → DEPS_REGISTRY fixture → FALLBACK_DEFAULTS
          returns resolverMap keyed by stripped name

per-dep loop (in api/exceptions.js handleComplianceGate):
   for each dep in dependencies:
     lookupKey = splitPackageVersion(nameLower).name    ← Hard rule 1
     resolved = resolverMap.get(lookupKey) || FALLBACK_DEFAULTS
     osvSummary = osvMap.get(lookupKey)
     details = resolved + osvPatch(osvSummary)
     compromise = osvSummary.compromiseIndicators
     rowForPatterns = {
       package: splitPackageVersion(name).name,
       version: splitPackageVersion(name).version,
       severity, ids, verified, license,
       hasInstallScript: compromise.hasInstallScript,
       capabilityProfile: compromise.hasRemoteExecution ? { remoteExecution: true } : undefined,
       maintainerCompromise: compromise.maintainerCompromiseReason ? { reason: ... } : undefined,
     }
     patterns = detectOtsPatternsForRow(rowForPatterns, { ci: true, hasSecrets: true, allowDemoFixtures: false })
     evaluate policy → action: BLOCK / WARN / ALLOW

return JSON { decision, overallScore, dependenciesChecked, cache, evaluation: [...] }
```

The deployed `/proof/gate` page at `src/pages/Gate.tsx` calls this endpoint with a single-element `dependencies` array and renders the verbatim response.

---

## What's safe vs. what needs human input

### Safe to do without asking

- Read the proof package docs at `docs/ots-proof-package.md` and `docs/proof/*.md`
- Read the `/proof/gate` page source at `src/pages/Gate.tsx`
- Run the smoke `node scratch-ua-parser-js-evidence.mjs` to see the local-vs-production parity check (note: scratch file is untracked but present in working tree)
- Add to memory at `~/.claude/projects/c--Users-pfinn-projects-angular-tradebuddy-admin/memory/`

### Needs user call before starting code

| Item | Why it needs a decision |
|---|---|
| **PR #39 (next number) — doc repair after PR #33** | Should record in `before-after-risk-example.md` and `production-walkthrough.md` that PR #33 fixed the production-bug surfaced by PR #32's `/proof/gate` UI. The "doctrine working as designed" framing is the same as PR #29 and PR #31. Tight scope. |
| **PR #40 — discoverability cross-links** | Add links from `/proof/ots-replays` and `/incidents/*` to `/proof/gate?package=...`. Add to `/proof` page artifact list. Possibly sidebar nav entry. UX decisions on placement need user sign-off. |
| **PR #41 — phase closeout doc** | Captures the full arc shipped (PRs #19–#33) as the "we shipped the phase" doc. Closes out the engineering arc cleanly so next-phase work has a clean start. |
| **Version-aware OSV queries (Phase 3.5)** | OSV v1 path is documented as package-level. Adding version awareness narrows compromise indicators but is a real product decision (false-positives-preferred is the current doctrine; version awareness changes that). |
| **Trust Timeline / Repo Trust Dashboard / Open Source Trust Center / Vanta-Drata export / Trust Agent** | All named by user as "next phase, not urgent." Do not start any of these without explicit user call. The current arc needs to land cleanly first. |

### Forbidden without explicit user authorization

Cross-arc — see [README.md](README.md). Also OTS-specific:

- Adding new patterns to `OTS_PATTERN_DEFINITIONS` (catalog) without cited incident evidence
- Widening the `COMPROMISE_CWE_IDS` set in `osvFastPath.js` (currently CWE-829 + CWE-912 only) without cited compromise-vs-routine-vuln evidence
- Editing or deleting verbatim captures in `docs/proof/before-after-risk-example.md` — append new ones instead
- Inserting any UI logic in `src/pages/Gate.tsx` that filters/transforms the API response — the page is a verbatim mirror

---

## Codebase quick reference

### Where things live (OTS arc)

| Surface | File |
|---|---|
| Gate handler | `api/exceptions.js` — search for `handleComplianceGate` |
| OSV fast-path (bulk + detail enrichment, severity normalization, compromise indicators) | `src/shared/osvFastPath.js` |
| Package registry resolver + `splitPackageVersion` helper | `src/shared/packageRegistryQuery.js` |
| OTS pattern detector | `src/shared/otsPatterns.js` |
| Public `/proof/gate` page | `src/pages/Gate.tsx` |
| `/proof/ots-replays` page (live-detector replays of cited incidents) | `src/pages/OtsReplays.tsx` |
| `/patterns` page (coverage status + catalog) | `src/pages/Patterns.tsx` |
| `/incidents/:id` page | `src/pages/IncidentDetail.tsx` |
| Proof package parent | `docs/ots-proof-package.md` |
| Proof artifacts | `docs/proof/before-after-risk-example.md`, `doctrine-pattern-enforcement.md`, `enterprise-trust-narrative.md`, `demo-script.md`, `production-walkthrough.md` |
| Proof package screenshots | `docs/proof/images/*.png` (9 numbered slots + GUARD probe) |

### Tests (all in-process, no network)

```bash
npm run test:ci   # full 158-test gate (both arcs combined): lint + 10 suites
```

OTS-specific suites:

- `scripts/test-osv-fast-path.mjs` — OSV fast-path including severity normalization (#28) + compromise indicators (#30): **18 tests**
- `scripts/test-package-registry-query.mjs` — resolver + `splitPackageVersion` regression tests (#33): **18 tests**
- `scripts/test-governor-gate.mjs` — gate integration tests: **15 tests**
- `scripts/test-ots-patterns.mjs` — pattern detector + workflow signals: **25 tests**
- `scripts/test-ots-replays.mjs` — incident replay structural invariants: **7 tests**
- `scripts/test-github-workflow-signals.mjs` — workflow YAML parser + detector branches: **15 tests**
- `scripts/test-repo-workflow-scan.mjs` — on-demand repo workflow scan: **13 tests**

### Scratch scripts (untracked, useful for one-off probes)

- `scratch-ua-parser-js-evidence.mjs` — local equivalent of the production gate pipeline against `ua-parser-js@0.7.29`. Useful for verifying the local-vs-production parity. After PR #33 they now match.
- `scratch-osv-ua-parser-js-probe.mjs` — dumps raw OSV bulk + detail responses for the 5 ua-parser-js GHSAs.
- `scratch-osv-compromise-signals-probe.mjs` — shows CWE codes per GHSA, used to design the conservative CWE-829/CWE-912 heuristic.

---

## Open prod debt

### None in the OTS arc as of 169397b

PR #33 closed the version-suffix lookup bug. PR #32's `/proof/gate` surface is now producing real evidence for any package, with or without `@version`. All four named engineering gaps from the proof package are closed.

The candidate-pipeline arc's `threat_feed` table debt is unrelated to OTS — see [candidate-pipeline.md](candidate-pipeline.md).

---

## Backlog (for future PRs, do NOT start without explicit user call)

### PR #39 — doc repair after PR #33

Update `docs/proof/before-after-risk-example.md` and `docs/proof/production-walkthrough.md` to record that:

- The public `/proof/gate` UI surface (PR #32) surfaced a production bug on its first live render
- PR #33 fixed the bug (gate handler version-stripped lookup)
- The page now produces real evidence for both bare and version-suffixed queries
- This is the doctrine working — the deployed surface revealed what local smokes couldn't

The framing parallels PR #29 and PR #31 (also doc-repair PRs after evidence-layer engineering fixes). Tight scope, docs-only.

### PR #40 — discoverability cross-links

Add links from `/proof/ots-replays`, `/incidents/*`, and the `/proof` page artifact list to `/proof/gate?package=...`. Possibly a sidebar nav entry. Small UX PR; placement decisions need user sign-off.

### PR #41 — phase closeout doc

The "we shipped the phase" doc. Captures the full arc shipped:

- PR #20 baseline evidence (ALLOW, 1 pattern medium)
- PR #28 decision changed via OSV severity normalization (BLOCK, 1 pattern critical)
- PR #30 firing set changed via row enrichment (BLOCK, 4 patterns)
- PR #32 public gate UI closed original Step-4 seam
- PR #33 surfaced and fixed the production version-suffix lookup bug

Should explicitly mark the OTS engineering arc as closed and name the queued future phases (version-aware OSV, Trust Timeline, etc.) without scope-creeping into them.

### What is NOT urgent yet (do not pull forward)

Same as the user's standing direction: version-aware OSV, Trust Timeline, Repo Trust Dashboard, Open Source Trust Center, Vanta/Drata export, Trust Agent. All real, all next-phase. Current arc needs a clean landing first.

---

## How to verify production after deploy

Live verification of PR #33 (already done at 2026-06-03 03:15 local, but the recipe is useful for future regressions):

1. **Hit the API directly**:

   ```bash
   curl -sS -X POST "https://opensoyce-f336.vercel.app/api/exceptions?action=compliance-gate" \
     -H "Content-Type: application/json" \
     -d '{"dependencies":["ua-parser-js@0.7.29"]}' | python -m json.tool
   ```

   Expected (post-PR-#33): `decision: BLOCK`, `overallScore: 75.8`, `cache: hit`, `evaluation[0].patterns.length: 4`.

   Regression signal: `decision: ALLOW`, `overallScore: 8`, `cache: miss`, `patterns: []` — that's the FALLBACK_DEFAULTS shape and means Hard Rule 1 has been violated somewhere.

2. **Visit the deployed page**:

   `https://opensoyce-f336.vercel.app/proof/gate?package=ua-parser-js@0.7.29`

   Expected: 4 patterns displayed (`known-vulnerability-exposure`, `install-time-remote-execution`, `maintainer-account-compromise-signal`, `ci-secret-exposure-path`), BLOCK action pill, score 75.8, license AGPL-3.0, verdict FORKABLE.

3. **Cross-check against the repo-doc capture**:

   `docs/proof/before-after-risk-example.md` post-PR-#30 Stage 4 verbatim block should match what the page renders (modulo formatting).

4. **If divergent**: check `git log --oneline api/exceptions.js src/shared/osvFastPath.js src/shared/packageRegistryQuery.js -10` for unexpected changes. The fix lives in the per-dep loop's `lookupKey` derivation.

---

## Stuff you'll find that's NOT part of this arc

- **Scratch scripts** in repo root (`scratch-*.mjs`) — useful smoke/probe artifacts from this arc. Untracked. Don't delete or gitignore without asking.
- **The `/proof/ots-replays` page (PR #8)** — older than this arc; documents replay fixtures for 6 cited incidents. Out of scope for OTS arc changes unless a fixture changes.
- **Candidate Pipeline arc** (PRs #34, #35, #37, #38): the parallel engineering arc that shipped concurrently. Different doctrine, different code paths. See [candidate-pipeline.md](candidate-pipeline.md).

---

## If you're starting OTS work, here's the sequence

1. **Read this doc fully**, especially the doctrine + hard rules
2. **Check memory** at `~/.claude/projects/c--Users-pfinn-projects-angular-tradebuddy-admin/memory/` — there are project memory files covering the proof phase
3. **Verify on-disk state**:

   ```bash
   cd ~/projects/opensoyce
   git status         # expect clean except pre-existing untracked + this handoff doc
   git log --oneline -5
   npm run test:ci    # expect 158 passing across both arcs
   ```

4. **Verify production state**:

   ```bash
   curl -sS -X POST "https://opensoyce-f336.vercel.app/api/exceptions?action=compliance-gate" \
     -H "Content-Type: application/json" \
     -d '{"dependencies":["ua-parser-js@0.7.29"]}' | grep -o '"action":"[^"]*"'
   ```

   Expected: `"action":"BLOCK"`. Anything else means regression of Hard Rule 1.

5. **Ask the user** what they want — pick from the backlog (#39 / #40 / #41), address one of the deferred next-phase items, or something else
6. **For non-trivial work**: sketch architecture decisions first, get user sign-off via `A:foo B:bar` shorthand, THEN build (matches the cross-arc working-style pattern)
7. **Match the PR body checklist pattern** when opening any new PR

---

## Contact

Repo: <https://github.com/freewho99/opensoyce>
Primary maintainer: @freewho99

The OTS arc closed clean. The proof package and the public gate UI surface are live and producing real evidence. Keep both arcs respected.
