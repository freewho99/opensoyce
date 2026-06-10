# Phase 7A/7B — Dependency-Exposure Ingestion (CLI + CI attribution)

Status: scope record for PR-7A and PR-7B
Scope: CLI/CI dependency-exposure ingestion ONLY. Create exposure records. No exceptions. No proposals. No policy. No lifecycle. No custom types. No claims expansion.

## Product thesis

Phase 6 proved the decision loop.
Phase 7 proves external observations can enter the loop safely.

The first ingestion lane is boring and narrow on purpose: dependency-exposure records from package metadata. Not SBOM. Not scanner output. Not cloud drift. Not all six native types. Just packages.

## Doctrine (locked by this PR)

```txt
Ingestion observes.
Ingestion does not decide.
Ingestion creates exposure records.
Humans still propose.
Reviewers still decide.
CEI still records the relationship.
```

Outside automation never becomes the decision-maker. The CLI is a scribe for observations; every decision verb stays exactly where Phase 5 and Phase 6 put it.

## What shipped

One new CLI command:

```txt
opensoyce exposure ingest-dependencies --workspace <slug> --file <path> [--dry-run]
```

- **Input** (detected by basename): `package.json` (declared ranges, prod + dev), `package-lock.json` (npm v1/v2/v3 resolved versions, dev flag honored), or any other `.json` in the explicit format `{ "dependencies": [ { "name", "version", "dev"? } ] }`. Other lockfile formats are a usage error — the same narrowness as the v0 `lockfile` command.
- **Transport**: the existing Phase 5 CLI pattern, unchanged — `~/.opensoyce/session.json` cookie session, CSRF self-mint on mutation, `--workspace` slug, the private `/api/vault/workspaces/:slug/exposures` boundary. No new server route; the PR-6A create handler is consumed as-is, with zero server changes.
- **Record shape, fixed**: `exposure_type: dependency-exposure`, `subject_kind: package`, `source_kind: cli`, `source_ref` = the file path as passed, `metadata` = `{ package, version, dev, dependency_class }`, `trust_boundary` = `{ package_manager: npm, manifest_kind }`. The CLI sends NO status field — every created record takes the server-side create-time default (`observed`).
- **`--dry-run`**: prints the plan, writes nothing. The early return is structurally pinned to come before any create call.
- **Dedupe guard**: before creating, the CLI pages the workspace's existing exposures (200/page, 5000-record cap — same shape as the exception-list subject scan) and skips entries whose package + version + source_ref already exist. When the cap truncates the scan, the CLI says so instead of pretending dedupe was complete.

## PR-7B — CI attribution (same path, attributed source)

7A proved a developer can ingest from the CLI. 7B proves the same observation can come from CI — while still only creating exposure records.

```txt
CI observes.
CI does not decide.
CI creates exposure records.
Humans still propose.
Reviewers still decide.
CEI records the relationship.
```

- **Flags**: `--ci` (switches `source_kind` to `ci`) plus attribution: `--ci-provider`, `--repository`, `--run-id` (all three required with `--ci`), and optional `--job`, `--sha`, `--ref`.
- **Gating**: attribution flags without `--ci` are a usage error — the CLI never silently mis-attributes. `--ci` without provider/repo/run-id is a usage error — a reviewer must be able to find the run.
- **Explicit flags only**: the ingestion lane structurally bans `process.env` and `GITHUB_*` reads. CI attribution is what the workflow passes, never ambient environment sniffing.
- **Record changes** (attribution only): `source_kind: ci`; `source_ref` = `provider/owner-repo/run/<id>[/job/<job>][/sha/<sha>]`; metadata additionally carries `ci_provider`, `repository`, `run_id`, and optional `job` / `sha` / `ref`; trust_boundary additionally carries `ci_provider`, `repository`, optional `ref`. `exposure_type` / `subject_kind` / the parser / dry-run / transport are byte-for-byte the 7A path.
- **Dedupe semantics in CI mode**: the key is still package + version + source_ref, and the CI source_ref is run-specific BY DESIGN — a retry of the same run dedupes; a new run is a new observation. Aggregating repeat observations across runs (`last_seen_at` upsert) is the deferred server-side dedupe lane below.
- **Zero server changes** (again): `source_kind: 'ci'` was already in the PR-6A `SOURCE_KINDS` allowlist.

## Deferred (documented, not forgotten)

- **Server-side uniqueness constraint** on `(workspace_id, exposure_type, subject_name, metadata.version, source_ref)` or a content hash. The client-side guard makes re-runs cheap, not transactional — two concurrent ingests can still double-create. Making dedupe transactional needs a schema decision (unique index vs upsert-touch of `last_seen_at`) and belongs to its own scope block. In CI mode this is also the lane that would aggregate per-run observations instead of accumulating one record set per run.
- **CI-native packaging** (a published GitHub Action wrapper, annotations, PR comments, check runs): all explicitly out of scope; the CI story today is "run the CLI in a workflow step with attribution flags."
- Other manifest ecosystems (yarn, pnpm, poetry, uv), SBOM import, scanner output, and the other five native exposure types: all parked.

## Structural enforcement (test-cli-workspace-v0; +7 in 7A, +3 in 7B = 30)

PR-7B additions: CI flags exist and are gated behind `--ci` with required provider/repo/run-id; attribution is explicit-flags-only (no `process.env`, no `GITHUB_*`); CI mode is attribution-only (no octokit / annotation / pull_request / GitHub API vocabulary in the lane); `source_kind` is structurally pinned to exactly the `ci ? 'ci' : 'cli'` conditional and may never claim `manual` or `api`.

PR-7A invariants:

- `exposure ingest-dependencies` exists, is dispatched, and is workspace-required.
- The ingestion lane references NO exception verb — no propose, no revoke, no approve/reject/extend/withdraw, no `/exceptions` path.
- The vault-api exposure surface is create + list only, on the private boundary; `CreateExposureBody` structurally carries no `status` field.
- The ingest shape is fixed (dependency-exposure / package / cli); no other native type slug, no `component_exposure_types`, no `validation_schema` / ajv / json-schema, no cloud-permission-drift, no SBOM/OSV/advisory references in the lane.
- Dry-run is write-free and ordered before the create loop.
- The parser observes only: no network, no file writes, no evaluation vocabulary.
- Output carries `[PRIVATE]` / `visibility: 'private'`; the session token never reaches terminal output (pre-existing invariant, still enforced).

The CLI v0 surface lift is additive: `test-cli-v0` (8 commands / 8 flags, banned names) passes untouched — `exposure`, `--file`, and `--dry-run` were never on its banned lists, and the v0 no-login/no-workspace path is byte-for-byte unchanged.

## Verification at merge

Full required list green: `test:cei-foundation-v0` (37), `test:vault-dashboard-v0` (45), `test:vault-exception-api-v0`, `test:vault-auth-v0`, `test:vault-private-reads-v0`, `test:cli-v0`, `test:cli-workspace-v0` (27, +7), `test:open-source-trust-center`, `test:trust-timeline`, `test:trust-badge-v0`, `test:repo-trust-dashboard`, `npm run lint` (exit 0). `check:mojibake` unchanged — only the pre-existing `e2e/playwright-report/index.html` offender.

## Hard non-scope honored

No exceptions created/proposed/approved/rejected/revoked/extended. No policy evaluation. No exposure lifecycle or status mutation. No new or custom exposure types, no dynamic schemas. No SBOM, no vulnerability scanning, no cloud drift. No CI annotations or PR comments. No public Trust Center / Badge / Timeline changes. `vault_timeline_events` untouched. Exception state machine untouched. No SOC 2 / Vanta / Drata claims.
