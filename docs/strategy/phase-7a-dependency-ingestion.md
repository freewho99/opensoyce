# Phase 7A — Dependency-Exposure Ingestion (CLI)

Status: scope record for PR-7A
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

## Deferred (documented, not forgotten)

- **Server-side uniqueness constraint** on `(workspace_id, exposure_type, subject_name, metadata.version, source_ref)` or a content hash. The client-side guard makes re-runs cheap, not transactional — two concurrent ingests can still double-create. Making dedupe transactional needs a schema decision (unique index vs upsert-touch of `last_seen_at`) and belongs to its own scope block.
- **`source_kind: ci`** as a distinct value. The command runs fine inside CI today, but records say `cli` — distinguishing the two (and any CI-native packaging, annotations, or PR comments) is future scope.
- Other manifest ecosystems (yarn, pnpm, poetry, uv), SBOM import, scanner output, and the other five native exposure types: all parked.

## Structural enforcement (test-cli-workspace-v0, +7 invariants)

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
