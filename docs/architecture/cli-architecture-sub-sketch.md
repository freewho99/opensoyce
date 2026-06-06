# Sub-Sketch: CLI v0 Architecture (Phase 4, PR-A1)

**Status:** Proposed (this sub-sketch)
**Date:** 2026-06-06
**Phase:** 4 — OSS Distribution (sub-sketch PR-A1 per the [Phase 4 ADR](./oss-distribution-cli-badge-adr.md) §7.1)
**Type:** Docs-only sub-sketch. No application code, no `package.json` changes, no test changes, no route changes, no banned-substring vocabulary lifted.

**Predecessors:**

- [Phase 4 ADR — OSS Distribution: CLI + Trust Badge](./oss-distribution-cli-badge-adr.md) (#58)
- [Phase 3 Closeout](../proof/launch-narrative-positioning-closeout.md) (#57)
- [Roadmap Integration](./open-soyce-roadmap-integration.md) (#53)

This sub-sketch refines the CLI section of the Phase 4 ADR into something an implementation PR can build against without re-litigating decisions. It does not authorize implementation. PR-A2 (CLI v0 implementation) is a separate approval.

## 0. Inherited doctrine (non-negotiable)

From the Phase 4 ADR §0:

> 1. The CLI reads the trust record.
> 2. The badge points to the trust record.
> 3. Neither replaces the trust record.

Every decision below is a corollary of rule 1. If any decision in implementation drifts from this, the decision changes — not the rule.

## 1. Surface shape and runtime

### 1.1 Package name

`opensoyce` on npm. Single binary, lowercase, no scope prefix.

Rationale:

- Matches the brand. The product is OpenSoyce; the CLI shares the name.
- No scope prefix because the package owns the brand on npm. A `@opensoyce/cli` shape implies the org owns multiple packages — true eventually, but premature for v0.
- Lowercase because npm package names must be.

### 1.2 Invocation forms

Three supported invocations, in order of expected frequency:

| Invocation | Use case | v0 supports |
|---|---|---|
| `npx opensoyce <command>` | One-off check without install | yes |
| `opensoyce <command>` (after `npm i -g opensoyce`) | Frequent terminal use | yes |
| `opensoyce <command>` (via `npx` cache or `pnpm dlx`) | Same as #1 for pnpm users | yes (same code path) |

Not supported in v0:

- `bunx opensoyce` — Bun-specific runtime concerns are out of scope.
- `deno run --allow-net npm:opensoyce` — Deno npm-compat is messy; queue if real demand surfaces.
- `cargo install opensoyce` — Cargo distribution requires a Rust rewrite; out of scope.
- `brew install opensoyce` — Homebrew tap is its own ADR.

### 1.3 Runtime

**Node.js, TypeScript source, compiled to JS for distribution.**

- Minimum Node version: matches the existing OpenSoyce web stack (read from `package.json` `engines.node` at impl time).
- Source language: TypeScript. Compiled to ES modules (`type: "module"` in package.json).
- Bundler: TBD in PR-A2. The implementation picks `tsup` / `esbuild` / `tsc --emit` based on bundle-size and startup-time evidence. Sub-sketch does not pre-commit.
- Dependencies: kept to a hard minimum. Each runtime dependency is a supply-chain risk for a tool that produces trust evidence. The implementation PR's structural test asserts the runtime-dependency count stays under a documented ceiling (proposed: ≤ 6 production deps; final number lands in PR-A2 after a survey of what's actually needed).

### 1.4 Source location

`packages/cli/` at the repo root. Reasons:

- `cli/` at the root invites confusion with build scripts.
- `src/cli/` couples the CLI source to the web app's `src/` (the web app does `vite build`; the CLI does not).
- `packages/cli/` cleanly establishes a workspace boundary without committing the repo to a full monorepo restructure today. The web app stays in `src/` for now; if a future ADR moves the web app to `packages/web/`, the precedent is already there.

The implementation PR adds `packages/cli/` with its own `package.json`, `tsconfig.json`, and `src/` directory.

## 2. Command set and flag surface

### 2.1 Command list (v0)

Five commands, each backed by an existing public surface. No command exists that doesn't have a public-surface equivalent.

| Command | Public surface it reads | Default output | `--json` output | Exit code rule |
|---|---|---|---|---|
| `opensoyce check <pkg>` | `/api/compliance-gate` (POST) | Posture line + firing-set count + first 3 anchors | Full `CliEvidence` object | Mapped per §3 |
| `opensoyce lockfile [path]` | `/api/compliance-gate` per lockfile entry | Per-entry posture lines + overall verdict | Array of `CliEvidence` + summary | Worst-of all entries |
| `opensoyce trust <owner>/<repo>` | Existing per-repo Trust Dashboard data | Posture label + gate examples + workflow findings + timeline preview + cross-link | Full posture object (same shape as Dashboard data) | 0 if posture exists; 3 if `NOT EVALUATED` |
| `opensoyce timeline [--package <p>] [--pr <n>]` | `/proof/timeline` event data | Event list (date, type, PR, sha, summary) | Array of timeline events | 0 always (read-only filter) |
| `opensoyce why <pkg>` | `check` + filtered timeline events touching the package | `check` output + timeline events that produced the current decision | `CliEvidence` with `timelineContext: TimelineEvent[]` | Same as `check` |

The list is locked at five for v0. Adding a sixth requires a new sub-sketch revision PR.

### 2.2 Global flags

Same flag set across every command. No per-command flag surprises in v0.

| Flag | Purpose | Default |
|---|---|---|
| `--json` | Switch to machine-consumable JSON output | off |
| `--no-color` | Disable ANSI color in default output | off (auto-detect TTY) |
| `--api-base <url>` | Override the public API base URL (for staging/dev use; documented but not advertised) | `https://opensoyce.com` |
| `--timeout <ms>` | Network timeout for the gate / posture call | 10000 |
| `--quiet` / `-q` | Suppress non-error stdout in default mode (still emits structured data with `--json`) | off |
| `--help` / `-h` | Show command help | off |
| `--version` | Print the CLI version | off |

Out of scope for v0 (named here so the implementation PR knows not to add them):

- `--config <path>` — no config file in v0.
- `--cache` / `--no-cache` — no persistent cache in v0.
- `--profile <name>` — no profiles in v0.
- `--token <jwt>` — no auth in v0.
- `--fail-on <action>` — exit codes are deterministic per §3; no override.

### 2.3 Command help format

Every command's `--help` output:

- One-line description matching the §2.1 table's "default output" column tone.
- Usage example with at least one real package or repo name (`ua-parser-js@0.7.29` is the canonical demo for `check`; `freewho99/opensoyce` for `trust`).
- Flag list (global flags only; v0 has no per-command flags).
- Footer line: `Reads the trust record at https://opensoyce.com/opensource-trust`

The footer line points at the Trust Center. It does not promise capabilities the Trust Center doesn't already publish.

### 2.4 Help footer hygiene

The `--help` footer is in `LINKING_PAGES` for the hygiene test extension that ships with PR-A2. Same window-mode windowing as the web pages, same vocabulary bans.

## 3. Exit-code mapping (deterministic, documented)

The CLI is consumable by CI. Exit codes are the contract.

| Exit code | Meaning | Default-output behavior | `--json` behavior |
|---|---|---|---|
| 0 | All evaluated packages returned ALLOW (or read-only command succeeded) | Posture line + green-coded label | JSON to stdout |
| 1 | At least one package returned BLOCK | Per-entry posture lines, BLOCK lines highlighted | JSON to stdout |
| 2 | At least one package returned WARN, no BLOCKs | Per-entry posture lines, WARN lines highlighted | JSON to stdout |
| 3 | A queried repo or package has no recorded posture (`NOT EVALUATED`) | Honest empty-state line per command | `result.action: "NOT_EVALUATED"` |
| 4 | Network error, API error, or remote failure | Error line to stderr; nothing to stdout | `{ error: { kind, message, suggestion } }` to stderr |
| 5 | Usage error (unknown command, missing arg, bad flag) | Help text + error line to stderr | `{ error: { kind: "USAGE", message } }` to stderr |

Constraints:

- Exit codes 0/1/2 mirror the gate's three actions (ALLOW/BLOCK/WARN). The CLI does not invent a fourth gate action.
- Exit code 3 (NOT EVALUATED) is distinct from exit code 1 (BLOCK). A reviewer reading a CI log can tell "no evidence" from "negative evidence" — the trust record makes the distinction; the CLI carries it forward.
- Exit code 4 (network error) never silently degrades into 0/1/2. Network failures are first-class errors, not "assume ALLOW".
- Exit code 5 (usage error) is non-zero even if the user is just exploring. The CLI does not pretend a typo succeeded.

The mapping is stable for v0. Changing it post-v0 requires a sub-sketch revision PR.

## 4. Evidence model (CliEvidence)

Every command's output (default and `--json`) carries the same evidence vocabulary as the Trust Center. No CLI-only types.

### 4.1 Shape

```text
CliEvidence {
  command:    'check' | 'lockfile' | 'trust' | 'timeline' | 'why'
  query:      { package?: string, lockfilePath?: string, owner?: string, repo?: string, pr?: number, packageFilter?: string }
  result:     GateResult | TrustPosture | TimelineEvent[]   // verbatim from the public surface
  proofAnchors: TrustProofAnchor[]                          // same shape as src/data/openSourceTrustCenter.ts
  exitCode:   0 | 1 | 2 | 3 | 4 | 5
  fetchedAt:  string                                        // ISO timestamp for audit
  apiBase:    string                                        // the URL the CLI actually called
}
```

For `lockfile`, the top-level shape is:

```text
CliLockfileEvidence {
  command:        'lockfile'
  lockfilePath:   string
  parserUsed:     'npm-v1' | 'npm-v2' | 'npm-v3' | 'yarn-v1' | 'pnpm' | 'uv-lock' | 'poetry-lock'
  entries:        CliEvidence[]    // one per package
  summary:        { allow: number, warn: number, block: number, notEvaluated: number }
  worstAction:    'ALLOW' | 'WARN' | 'BLOCK' | 'NOT_EVALUATED'
  exitCode:       0 | 1 | 2 | 3 | 4 | 5
  fetchedAt:      string
  apiBase:        string
}
```

The `parserUsed` field names which lockfile parser the CLI used. v0 supports the five parsers the existing OpenSoyce scoring engine already supports (per the `/proof` page's "LOCKFILE COVERAGE" claim). The CLI does not introduce a new lockfile parser; it reuses or links to the existing parsers.

### 4.2 What evidence MUST be present

For `check` and `why`:

- `result.action` — one of `ALLOW` / `WARN` / `BLOCK` / `NOT_EVALUATED`.
- `result.firedPatterns` — array (possibly empty).
- `proofAnchors` — at least one anchor, sourced from the gate API response.

For `trust`:

- `result.postureLabel` — one of `use-ready` / `watchlist` / `risky` / `graveyard` / null.
- If `postureLabel` is null, `exitCode === 3` and `result.action === "NOT_EVALUATED"`.

For `timeline`:

- `result` is an array (possibly empty if filters match nothing).
- Each event carries `pr`, `sha`, `type`, `summary`, `references[]` (same shape as `src/data/trustTimeline.ts`).

For `lockfile`:

- `parserUsed` matches the file detected.
- Each entry's `query.package` matches a lockfile row verbatim.

### 4.3 What evidence MUST NOT appear

- No `visibility` field on `CliEvidence` (carried forward from the Trust Center `visibility`-field guard).
- No CLI-only anchor type. `proofType` is restricted to `pr` / `live-surface` / `doc-anchor` / `proof-artifact`.
- No "confidence" or "score" field that doesn't exist in the public posture or gate output. The CLI does not narrate.
- No `disclaimer` field. The trust record is the disclaimer.
- No telemetry payload. The CLI's outbound API calls are the only network activity; no separate analytics endpoint.

## 5. Anti-marketing copy hygiene

### 5.1 Vocabulary inheritance

Every string emitted by the CLI in default mode (non-`--json`) — command output, error messages, help text, status messages — is subject to:

- `OPEN_SOURCE_TRUST_CENTER_BANNED_SUBSTRINGS` (SOC 2, Vanta, Drata, etc.)
- `OPEN_SOURCE_TRUST_CENTER_FUTURE_TENSE_TELLS` (coming soon, we will, roadmap, planned for, in development)
- Soft-banned verbs near `/opensource-trust` mentions (Learn more, Discover, Explore, Unlock — word-boundary)
- `OPEN_SOURCE_TRUST_CENTER_PHASE_3_LAUNCH_BANNED_SUBSTRINGS` (zero noise, drop-in, auto-fix, autonomous agent, etc.)

### 5.2 New Phase 4 entries (added by the Phase 4 ADR §5.4; encoded in PR-A2 / PR-B2)

These get encoded in the implementation that ships them, not here:

- `certified` (broader than `compliance certified`)
- `verified` (broader than the existing entries)
- `secure` as a standalone adjective on CLI output (a posture is a record, not a safety claim)
- `safe` as a standalone adjective on CLI output

The Phase 4 ADR §5.4 already records these. The CLI implementation (PR-A2) adds them to the shared module and wires them into the hygiene test in the same PR.

### 5.3 Hygiene test extension shape (proposed for PR-A2)

```text
LINKING_PAGES extension in scripts/test-open-source-trust-center.mjs:
  + { path: 'packages/cli/src/strings.ts', label: 'CLI strings', mode: 'window' }
  + { path: 'packages/cli/src/help.ts',    label: 'CLI help text', mode: 'window' }
  + { path: 'packages/cli/README.md',      label: 'CLI README', mode: 'window' }
```

Or, equivalently, a parallel hygiene test (`scripts/test-cli-copy.mjs`) scoped to the CLI source. The implementation picks one. Either way, the result is: every CLI string near a `/opensource-trust` reference passes the full vocabulary check.

### 5.4 `--json` output is exempt from soft-banned-verb checks

JSON keys and values are not human-facing copy. They are machine-consumable evidence. The banned-substring check still applies (no `SOC 2` in JSON), but the soft-banned-verb check (Learn more / Discover / Explore / Unlock as marketing reveal verbs) does not apply to JSON output. The implementation PR's hygiene test distinguishes these.

## 6. Distribution channel decision (npm primary)

### 6.1 npm is primary

The CLI ships as `opensoyce` on npm. Publishing flow (proposed, not pre-authorized):

- `packages/cli/package.json` has `"name": "opensoyce"`, `"bin": { "opensoyce": "./dist/cli.js" }`.
- Releases are tagged on `main` (`cli-v0.x.x`), and a CI workflow publishes to npm on tag push (workflow lives outside this sketch).
- The npm publisher account is OpenSoyce Labs (real owning identity decided in PR-A2).

### 6.2 Secondary channels deferred

| Channel | Status | Why deferred |
|---|---|---|
| Homebrew tap | Deferred | Homebrew tap is its own ADR. Different audience, different signing concerns, different update model. |
| Standalone binaries (`opensoyce-linux-x64`, `opensoyce-darwin-arm64`, etc.) | Deferred | Adds Node-bundling complexity (pkg / nexe / Bun build). Only justifies its complexity if npm distribution proves a real adoption barrier. |
| Cargo crate | Deferred | Requires a Rust rewrite. Out of scope for v0. |
| Docker image | Deferred | Different distribution channel for different audience (containerized CI). Could be valuable; not v0. |
| GitHub Releases binary | Deferred | Same complexity as standalone binaries above. |

The Phase 4 closeout (per Phase 4 ADR §8) only requires that the CLI is installable via npm and `npx`. Secondary channels do not block closeout.

### 6.3 Anti-typosquat discipline

OpenSoyce evaluates packages against typosquat patterns (per `/proof` "SUPPLY-CHAIN SIGNALS" section). The CLI's own npm publishing must not create typosquat targets:

- The implementation PR reserves variant names that could be confused for `opensoyce`: `opensoyce-cli`, `opensauce`, `open-soyce`, etc. The exact list is decided in PR-A2 by querying the existing OTS typosquat-detection logic against the canonical name.
- Reserved names point at a stub package that publishes to npm with a README pointing at the canonical `opensoyce` package. No accidental install via a typo lands on someone else's code.

This is doctrine, not optional. The CLI cannot demonstrate supply-chain trust while leaving its own brand undefended.

## 7. Boundaries: what the CLI MUST NOT do

Carried verbatim from Phase 4 ADR §1.2, with concrete enforcement notes for the implementation PR.

### 7.1 No local gate execution

The CLI does not run the OpenSoyce scoring engine in-process. It calls the public API.

Enforcement in PR-A2:

- `packages/cli/src/` does not import from `src/shared/` paths that perform gate evaluation. The implementation PR's structural test grep-asserts this.
- The runtime dependency list excludes any package that would let the CLI evaluate patterns locally.

### 7.2 No write actions

The CLI does not write to the filesystem outside its own temp directory, and does not modify any user file.

Enforcement:

- No `fs.writeFile`, `fs.appendFile`, `fs.rename`, `fs.unlink`, `fs.rmdir`, `fs.mkdir` calls outside `os.tmpdir()` paths.
- No PR-opening calls (no `git push`, no `gh pr create`, no GitHub API write calls).
- The implementation PR's structural test grep-asserts the absence of these calls in CLI source.

### 7.3 No auth

v0 does not authenticate. All API calls are anonymous reads.

Enforcement:

- No `Authorization` header generation in CLI source.
- No `--token` flag (per §2.2).
- No environment-variable consumption of `OPENSOYCE_TOKEN`, `GITHUB_TOKEN`, etc., by the CLI runtime.

### 7.4 No new posture vocabulary

The CLI uses the existing posture labels (`use-ready` / `watchlist` / `risky` / `graveyard`) and the existing gate actions (`ALLOW` / `WARN` / `BLOCK`) plus the read-only `NOT_EVALUATED` state.

Enforcement:

- The CLI imports posture-label and gate-action vocabulary constants from the existing shared module (re-exported through the typed wrapper if needed).
- The implementation PR does not add any string constant matching a new posture/action label.

### 7.5 No CLI-only Timeline event types

The CLI consumes `TRUST_TIMELINE_EVENT_TYPES`; it does not extend them.

Enforcement:

- Same import discipline as §7.4.
- No new event-type literals in CLI source.

### 7.6 No telemetry beyond the API calls themselves

The CLI does not send analytics events, usage pings, or any out-of-band telemetry. The only outbound network traffic is the public API call required to fulfill the user's command.

Enforcement:

- No analytics SDK in dependencies.
- No `fetch` / `https.request` calls to hosts other than `--api-base` (or its default).
- The implementation PR's structural test enforces a single allowed-host pattern.

## 8. What this sub-sketch authorizes for PR-A2

PR-A2 (CLI v0 implementation, per Phase 4 ADR §7.1) is authorized to:

- Add `packages/cli/` with TypeScript source, `package.json`, `tsconfig.json`, and bundled dist output.
- Implement the five commands from §2.1 with the flag surface from §2.2.
- Wire the exit-code mapping from §3.
- Wire the `CliEvidence` shape from §4.
- Extend `OPEN_SOURCE_TRUST_CENTER_BANNED_SUBSTRINGS` (or add a sibling Phase 4 constant) with the §5.2 entries (`certified`, `verified`, standalone `secure`, standalone `safe`) — atomic with the CLI shipping, per the banned-substring discipline.
- Extend `scripts/test-open-source-trust-center.mjs` (or add `scripts/test-cli-copy.mjs`) to enforce hygiene on the CLI source and README.
- Reserve typosquat-adjacent npm names per §6.3.
- Add a CI workflow for tag-push npm publish (workflow file location decided in PR-A2).
- Add `packages/cli/README.md` with the §5 hygiene-tested copy.

PR-A2 is NOT authorized to:

- Touch the web app's `src/`, `src/pages/`, `src/components/`, or `scripts/test-trust-timeline.mjs` / `scripts/test-repo-trust-dashboard.mjs`.
- Register any new HTTP route on the web server.
- Lift any banned-substring entry that isn't part of the §5.2 Phase 4 vocabulary.
- Add badge-related code (Badge is PR-B2).
- Implement any command outside the §2.1 list.
- Implement any flag outside the §2.2 list.
- Add config files, plugin systems, caching layers, or auth.
- Modify the legacy SOC 2 deferral.

## 9. What this sub-sketch does NOT do

- Does not authorize PR-A2. The user explicitly approves PR-A2 before any code lands.
- Does not change any source code.
- Does not change `package.json`.
- Does not change any test.
- Does not change any route.
- Does not lift any banned-substring vocabulary entry.
- Does not touch the legacy SOC 2 deferral.
- Does not authorize PR-A3 (CLI doc closeout), PR-B1 (Badge sub-sketch), or any later PR.
- Does not promote Phase 5+ scope into Phase 4.
- Does not introduce VEX / reachability / sandbox / remediation / drop-in / AI-agent / agentic framing.
- Does not touch the candidate-pipeline arc.
- Does not touch the `threat_feed` ADR.
- Does not authorize the `hn-exploits-log.json` cleanup.

## 10. Status

**Proposed.** Awaiting explicit user decision before PR-A2 begins.

Docs only. No application code, no `package.json` change, no test change, no route change, no banned-substring vocabulary lifted.

Recommended next PR after this merges:

**PR-A2 — `feat(distribution): add CLI v0`** (per Phase 4 ADR §7.1)

Recommended, not pre-authorized. The user calls "approve PR-A2" with explicit scope before any implementation begins.

---

> The CLI reads the trust record.
> Five commands. Six exit codes. One evidence shape. Zero local policy.
