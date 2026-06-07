# CLI v0 Closeout — Phase 4, PR-A3

**Status:** Closed (CLI track)
**Date:** 2026-06-06
**Phase:** 4 — OSS Distribution (CLI track closeout per the [Phase 4 ADR](../architecture/oss-distribution-cli-badge-adr.md) §7.1)
**Type:** Docs-only progress doc. No source code, no test, no `package.json`, no route, no copy changes.

**Predecessors:**

- [Phase 4 ADR — OSS Distribution: CLI + Trust Badge](../architecture/oss-distribution-cli-badge-adr.md) (#58)
- [CLI v0 Sub-Sketch](../architecture/cli-architecture-sub-sketch.md) (#59)
- [CLI v0 Implementation (PR-A2)](../../packages/cli/src/cli.ts) (#60, with fix `f80185e`)

This closes the **CLI track** of Phase 4. It is NOT the Phase 4 closeout — Phase 4 closes when the Badge track (PR-B1 → PR-B2) also ships its own closeout (PR-B3 = Phase 4 closeout per ADR §7.2). This doc records the CLI half of the arc so the badge track can build against a stable, named CLI state.

## 1. What shipped

| Surface | Shipped in |
|---|---|
| `packages/cli/` workspace with TypeScript source, package.json (`name: opensoyce`, bin `dist/cli.js`), tsconfig, README, .gitignore | PR #60 (`bfd3441`) |
| Five commands: `check`, `lockfile`, `trust`, `timeline`, `why` | PR #60 |
| Seven global flags: `--json`, `--no-color`, `--api-base`, `--timeout`, `--quiet`/`-q`, `--help`/`-h`, `--version` | PR #60 |
| Six deterministic exit codes: 0 ALLOW / 1 BLOCK / 2 WARN / 3 NOT_EVALUATED / 4 NETWORK_ERROR / 5 USAGE_ERROR | PR #60 |
| `CliEvidence` shape reusing `TrustProofAnchor` verbatim | PR #60 |
| Inlined static MVP data (posture + timeline) with structural parity assertion against shared modules | PR #60 |
| Anti-marketing hygiene for CLI strings + help + README (Trust Center vocabulary + Phase 3 + Phase 4 bans) | PR #60 |
| Phase 4 banned vocabulary (`certified`, `verified`, standalone `secure`, standalone `safe`) | PR #60 (atomic with the CLI) |
| Structural CLI v0 test suite (`scripts/test-cli-v0.mjs`) — **14 invariants** | PR #60 (13 at open, +1 in fix `f80185e`) |
| Trust Center hygiene extended to cover CLI surfaces (24 → 26 invariants) | PR #60 |
| Network-failure doctrine: any failed `callGate` inside `lockfile` returns `EXIT_NETWORK_ERROR` (no silent degrade) | PR #60 fix `f80185e` |
| Root `package.json` wiring: `test:cli-v0`, `cli:build`, `test:cli-v0` in `test:ci` | PR #60 |
| Root `tsconfig.json` excludes `packages/cli` so the web app's tsc doesn't compile CLI source under React rules | PR #60 |
| Editor-quality fix: CLI tsconfig excludes sibling-repo paths so VS Code TS Server doesn't pull cross-repo files into the CLI program | PR #60 (`52cf913`) |

## 2. PR lineage

| PR | SHA | Type | Title | Role |
|---|---|---|---|---|
| #58 | `f117666` | docs | sketch CLI and Trust Badge ADR | Phase 4 ADR. Frames CLI + badge as distribution surfaces over the trust spine. CLI-first ordering decided. |
| #59 | `68c6ab4` | docs | sketch CLI v0 architecture | Sub-sketch (PR-A1). Locks 5 commands, 7 flags, 6 exit codes, evidence model, npm-primary distribution, boundaries. |
| #60 | `bfd3441` | feat | add CLI v0 | Implementation (PR-A2). Three commits on the branch (initial scaffold + impl, sibling-repo tsconfig exclude `52cf913`, lockfile network-failure fix `f80185e`). |
| _(this PR)_ | _filed by squash-merge_ | docs | close out CLI v0 | This doc. |

## 3. Doctrine state after CLI v0

Every doctrine rule from the Phase 4 ADR §0 is now enforced structurally in CLI source. No rule was relaxed.

### 3.1 "The CLI reads the trust record."

Enforced by `test-cli-v0.mjs`:

- *CLI source does not import gate evaluation from `src/shared/`* — grep-asserts the CLI never imports `governor`, `scanLockfile` (gate-evaluation modules), `scoreCalculator`, `osvFastPath`, `runScan`, `analyzeRepo`, `repoWorkflowScan`, `threatIngest`, `incidentCandidates`.
- *CLI source only fetches against the configured api base* — every `fetch(` call goes through `apiBase`; no literal-host URLs; no `http.request(` / `https.request(`; no analytics SDK literals.

### 3.2 "Neither replaces the trust record."

- CLI uses the existing `TrustProofAnchor` shape from `src/data/openSourceTrustCenter.ts` (proven by the structural test reading the import).
- CLI uses existing posture labels (`use-ready` / `watchlist` / `risky` / `graveyard`), gate actions (`ALLOW` / `WARN` / `BLOCK`), and Timeline event types — no CLI-only vocabulary.
- *CLI static-data static postures match the shared MVP posture data* + *CLI static-data timeline mirrors every shared timeline event PR* — drift between the CLI's inlined copy and the shared module fails CI.

### 3.3 "Never silently degrades."

- *lockfile command returns EXIT_NETWORK_ERROR on any partial network failure* — added in fix `f80185e`. Three structural assertions:
  1. failures collected into a typed array (not a boolean flag)
  2. `if (failures.length > 0) return EXIT_NETWORK_ERROR;` present
  3. silent-degrade pattern `networkErrored && results.length === 0` cannot reappear

### 3.4 "No write actions."

- *CLI source uses no destructive fs methods* — grep-asserts the absence of `fs.writeFile`, `fs.appendFile`, `fs.rename`, `fs.unlink`, `fs.rmdir`, `fs.mkdir`, `fs.cp(`, `fs.copyFile`, `fs.symlink` and their `Sync` variants.

### 3.5 "No auth in v0."

- *CLI source carries no Authorization header or token env vars* — case-insensitive grep-asserts no `authorization` anywhere; no `OPENSOYCE_TOKEN` / `GITHUB_TOKEN` / `NPM_TOKEN` env reads.

### 3.6 "No telemetry."

- Covered by §3.1 single-allowed-host check.

### 3.7 "Locked surface."

- *all 5 CLI commands have a runner module* + *cli.ts dispatches all 5 commands and nothing else* — a 6th command (e.g., `fix`, `upgrade`, `replace`, `remediate`, `install`, `init`, `login`, `audit`, `export`) is structurally rejected.
- *args.ts exposes all 7 global flags* — and explicitly rejects forbidden flags (`--config`, `--cache`, `--profile`, `--token`, `--fail-on`).
- *exit-codes.ts exports all 6 exit codes with correct values* — renumbering or addition fails CI.

## 4. Invariant tests after CLI v0

| Suite | Script | Count | Phase-4 delta |
|---|---|---|---|
| CLI v0 | `scripts/test-cli-v0.mjs` | **14** | new in PR #60 (13 at open, +1 in fix `f80185e`) |
| Open Source Trust Center | `scripts/test-open-source-trust-center.mjs` | **26** | +3 LINKING_PAGES entries (CLI strings / help / README), +1 Phase-4 plain-substring invariant, +1 Phase-4 word-boundary invariant |
| Pre-existing OTS suites | various | many | unchanged |
| Candidate pipeline | three scripts | many | unchanged |

Net new doctrine assertions from CLI v0: **+14 (CLI) + +2 (Trust Center extensions) = +16**.

## 5. Banned-substring vocabulary state

Every prior banned vocabulary stays banned. Phase 4 adds two new categories. Nothing is lifted.

| Vocabulary | Surface | Count | Lifted by |
|---|---|---|---|
| `OPEN_SOURCE_TRUST_CENTER_BANNED_SUBSTRINGS` | Every claim + every linking-page hygiene window | 8 | Capability-shipping PR (per banned-substring discipline) |
| `OPEN_SOURCE_TRUST_CENTER_FUTURE_TENSE_TELLS` | Every claim + every linking-page hygiene window | 5 | n/a (timing-vocabulary hygiene, never lifted) |
| Soft-banned marketing verbs (word-boundary) | Every linking-page hygiene window | 4 | n/a |
| `OPEN_SOURCE_TRUST_CENTER_PHASE_3_LAUNCH_BANNED_SUBSTRINGS` | Every linking-page hygiene window | 13 | Capability-shipping PR (Phase 6 / 7 / 9 family) |
| `OPEN_SOURCE_TRUST_CENTER_PHASE_4_DISTRIBUTION_BANNED_SUBSTRINGS` (new in PR #60) | Every linking-page hygiene window | 2 (`certified`, `verified`) | Capability-shipping PR (Phase 8 export family) |
| `OPEN_SOURCE_TRUST_CENTER_PHASE_4_WORD_BOUNDARY_BANNED` (new in PR #60) | Every linking-page hygiene window (word-boundary) | 2 (`secure`, `safe`) | Capability-shipping PR (Phase 8 / explicit safety claim ADR) |

Total: **34 banned tokens** across 6 categories. None of them lifts for CLI v0 because the CLI does not ship the underlying capability for any of them — it ships the distribution surface for capabilities that already shipped.

## 6. Honest scope deferrals carried by CLI v0

These ship explicitly NOT in v0 and have defined unblock conditions. They are not "TODO" items; they are doctrine-bounded deferrals.

### 6.1 Lockfile format coverage

**Status:** CLI v0 supports `npm-v1` / `npm-v2` / `npm-v3` only. `yarn-v1`, `pnpm-lock`, `uv-lock`, `poetry-lock` are detected by `lib/lockfile-parser.ts` `detectFormat()` and rejected with `EXIT_USAGE_ERROR` plus the explicit copy:

> Lockfile format `<format>` is not supported in CLI v0. Supported: package-lock.json.

**Why deferred:** Each non-npm parser is a meaningful chunk of code and a meaningful chunk of test surface. Shipping them in PR-A2 would have grown the v0 scope past the sub-sketch's stated boundaries. The existing web app's `src/shared/scanLockfile.js` has all five parsers but bundles them with OSV-query (gate evaluation) — importing it would have violated rule 1 of the doctrine.

**Unblock condition:** Its own follow-up PR, scoped to "CLI lockfile format extension." Each new parser ships with its own structural-invariants test (entry extraction matches the existing web-app behavior on at least one fixture per format). The Phase 4 closeout (PR-B3) does NOT require this extension to land.

### 6.2 Secondary distribution channels

**Status:** v0 distribution is npm only. The CLI is installable via `npx opensoyce` and `npm i -g opensoyce`. Homebrew tap, standalone binaries (`opensoyce-linux-x64`, etc.), Cargo crate, Docker image, and GitHub Releases binary are all deferred.

**Why deferred:** Per CLI sub-sketch §6.2 — each secondary channel has its own distribution / signing / update concerns. None blocks Phase 4 closeout (per ADR §8.1 the closeout only requires npm + npx).

**Unblock condition:** Each secondary channel is its own ADR. Brew tap especially has its own naming + tap-repo registration concerns that are out of scope for a CLI track.

### 6.3 Inlined static data → live JSON endpoint

**Status:** `trust` and `timeline` read the CLI's inlined copy of the shared MVP data (`packages/cli/src/lib/static-data.ts`). Structural test asserts parity with the web app's `src/shared/repoTrustDashboard.js` + `src/shared/trustTimeline.js`.

**Why deferred:** The web app does not currently expose a public JSON endpoint for the trust record. Adding one would have required a route registration in PR-A2 which is explicitly out of scope per CLI sub-sketch §8.

**Unblock condition:** When Phase 5 (Trust Vault) ships, the public Trust Center likely grows a JSON sibling endpoint for the same data. The CLI switches from inlined data to runtime fetch in the same PR. The inlined file is removed; the parity test becomes a live-endpoint test.

### 6.4 npm publish workflow

**Status:** `packages/cli/package.json` declares `bin`, `files`, `prepublishOnly`. The actual `npm publish` workflow file does NOT ship in PR-A2 (sub-sketch §6.1 mentioned it as a separate concern). The `private: true` flag in `packages/cli/package.json` keeps an accidental publish from happening before the workflow is reviewed.

**Why deferred:** The npm publish workflow involves token storage decisions (npm provenance? GitHub OIDC? secret token?) that warrant their own ADR. PR-A2 was already at the edge of "build the CLI"; the publish path is "ship the CLI", which is one step further.

**Unblock condition:** A "publish CLI v0" PR (likely PR-A4 in retrospect, not in the ADR's named sequence). It ships:

- A CI workflow file (likely under `.github/workflows/`) for tag-push npm publish.
- The decision on token storage (recommendation: OIDC with npm provenance).
- The first publish.
- Removal of `private: true` from `packages/cli/package.json`.
- Anti-typosquat reservations per CLI sub-sketch §6.3.

This is recommended-not-pre-authorized.

### 6.5 Anti-typosquat npm name reservations

**Status:** Sub-sketch §6.3 said the CLI must reserve typosquat-adjacent names (`opensoyce-cli`, `opensauce`, `open-soyce`, etc.) via the existing OTS typosquat-detection logic. This was NOT done in PR-A2.

**Why deferred:** Until the canonical name is actually published to npm, the typosquat field is open territory. Reserving variants requires publishing stub packages with READMEs pointing at the canonical name — which depends on the npm publish workflow (§6.4 above).

**Unblock condition:** Bundled into the publish PR (§6.4). The variant list is generated by running the existing OTS typosquat-detection logic against the canonical name `opensoyce`. Each variant ships a stub package that publishes alongside the main one.

This is doctrine, not optional. **The Phase 4 closeout (PR-B3) MUST require the publish + typosquat reservation work to be done OR explicitly deferred to a post-Phase-4 PR with a documented timeline.** The CLI cannot demonstrate supply-chain trust while leaving its own brand undefended.

## 7. CLI v0 production verification

Manual walkthrough that should be run after any CLI version bump or against the real CLI in a fresh `npx` shell.

### 7.1 Build + version

```bash
npm run cli:build
node packages/cli/dist/cli.js --version
# Expected: opensoyce 0.0.0
```

### 7.2 Help surface

```bash
node packages/cli/dist/cli.js --help
# Expected: top-level help block ending with
# "Reads the trust record at https://opensoyce.com/opensource-trust"

node packages/cli/dist/cli.js check --help
# Expected: check-specific help block ending with same footer

node packages/cli/dist/cli.js bogus --help
# Expected: stderr "Unknown command: bogus. Run `opensoyce --help`." + EXIT_USAGE_ERROR (5)
```

### 7.3 Read commands against the live production gate

```bash
node packages/cli/dist/cli.js check ua-parser-js@0.7.29
# Expected: PACKAGE: ua-parser-js@0.7.29 / ACTION: BLOCK / PATTERNS: 4
# Exit: 1

node packages/cli/dist/cli.js check left-pad@1.3.0 --json
# Expected: JSON CliEvidence with action ALLOW or NOT_EVALUATED depending on
# what's actually on file. Exit: 0 or 3.

node packages/cli/dist/cli.js why ua-parser-js@0.7.29
# Expected: check output + timeline events touching ua-parser-js
```

### 7.4 Static-data commands

```bash
node packages/cli/dist/cli.js trust freewho99/opensoyce
# Expected: REPO line / POSTURE: WATCHLIST / SUMMARY (verbatim from the
# Dashboard) / 3 proof anchors. Exit: 0.

node packages/cli/dist/cli.js trust some-other/repo
# Expected: "No recorded posture for some-other/repo." Exit: 3.

node packages/cli/dist/cli.js timeline --package ua-parser-js
# Expected: 5 lines (events touching ua-parser-js with PR + SHA + summary).
# Exit: 0.

node packages/cli/dist/cli.js timeline --pr 28
# Expected: 1 line (PR #28 event). Exit: 0.
```

### 7.5 Failure-mode commands

```bash
node packages/cli/dist/cli.js lockfile /tmp/does-not-exist
# Expected: "Lockfile not found at /tmp/does-not-exist." Exit: 5.

printf '{"name":"x","lockfileVersion":3,"packages":{"node_modules/p":{"version":"1.0.0"}}}\n' > /tmp/lock.json
node packages/cli/dist/cli.js lockfile /tmp/lock.json \
  --api-base http://127.0.0.1:1 --timeout 1500
# Expected: empty results, "Network failures: 1", doctrine line, Exit: 4.

node packages/cli/dist/cli.js check bad..spec
# Expected: stderr "Invalid package spec: bad..spec. Expected name@version." Exit: 5.
```

### 7.6 `--json` shape verification

```bash
node packages/cli/dist/cli.js check ua-parser-js@0.7.29 --json | jq -e '.command == "check" and .query.package == "ua-parser-js@0.7.29" and (.proofAnchors | length) > 0'
# Expected: true

node packages/cli/dist/cli.js trust freewho99/opensoyce --json | jq -e '.command == "trust" and .postureLabel == "watchlist"'
# Expected: true
```

## 8. What this closeout does NOT do

- Does not authorize PR-B1 (Badge sub-sketch). Badge work begins only on explicit user approval.
- Does not authorize a CLI publish PR (§6.4). Recommended-not-pre-authorized.
- Does not authorize a lockfile format extension PR (§6.1).
- Does not lift any banned-substring vocabulary entry.
- Does not change the legacy SOC 2 deferral (`LEGACY_SOC2_COPY_DEFERRAL` stays OPEN).
- Does not declare Phase 4 closed. Phase 4 closes when PR-B3 ships per ADR §7.2.
- Does not promote Phase 5 to "Now". The roadmap still has Phase 4 as the current "Now" slot until PR-B3.
- Does not change any source code, test, or surface.
- Does not touch the candidate-pipeline arc.
- Does not touch the `threat_feed` ADR.
- Does not authorize the `hn-exploits-log.json` cleanup.

## 9. Status of the CLI track

**Closed.**

The CLI track of Phase 4 shipped per the sub-sketch contract, with one mid-flight blocker fixed (lockfile partial-network-failure silent degrade), one editor-quality fix (sibling-repo tsconfig exclude), and 16 new structural invariants protecting the doctrine.

Recommended next PR (not pre-authorized):

- **PR-B1 — `docs(distribution): sketch Trust Badge architecture`** (Phase 4 ADR §7.2)

Recommended-but-still-queued:

- **CLI publish workflow + typosquat reservations** (numbered as PR-A4 in retrospect; not in the ADR's named sequence). The Phase 4 closeout (PR-B3) decision-gate requires this work either done or explicitly deferred to a post-Phase-4 PR with a documented timeline.

---

> Five commands. Six exit codes. One evidence shape. Zero local policy.
> The CLI reads the trust record.
