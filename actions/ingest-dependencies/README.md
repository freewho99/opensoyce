# OpenSoyce Dependency Observation — GitHub Action

A thin wrapper around the existing CLI command:

```txt
opensoyce exposure ingest-dependencies --ci ...
```

It ingests dependency-exposure records into an OpenSoyce Vault workspace from package metadata, attributed to the CI run that observed them.

## Doctrine

```txt
Packaging makes observation repeatable.
Packaging does not make observation judgment.
```

And the boundary inherited from the CLI lane:

```txt
The workflow may pass context.
The CLI may not sniff context.
```

This action takes explicit inputs only. The expressions live in YOUR workflow, below — the action itself reads no ambient run context, no environment variables about the run, and no GitHub API.

What this action will never do: write to your repo, call the GitHub API, create workflow surfaces, or evaluate policy. Repeated observations are deduped server-side (PR-7C): a retry of the same run is absorbed; a new run touches the same dependency fact and bumps its repeat metadata. Humans still propose. Reviewers still decide.

## Usage

```yaml
jobs:
  observe-dependencies:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: freewho99/opensoyce/actions/ingest-dependencies@main
        with:
          workspace: acme
          session-token: ${{ secrets.OPENSOYCE_SESSION_TOKEN }}
          file: package-lock.json
          repository: ${{ github.repository }}
          run-id: ${{ github.run_id }}
          job: ${{ github.job }}
          sha: ${{ github.sha }}
          ref: ${{ github.ref }}
```

Add `dry-run: 'true'` first if you want to see the plan in the job log before any records are written.

## Inputs

| Input | Required | Meaning |
|---|---|---|
| `workspace` | yes | Vault workspace slug |
| `session-token` | yes | Vault session token — store as an encrypted secret |
| `file` | no (default `package-lock.json`) | `package.json`, npm lockfile v1/v2/v3, or explicit JSON `{ "dependencies": [ { "name", "version", "dev"? } ] }` |
| `repository` | yes | `owner/repo` — pass `github.repository` explicitly |
| `run-id` | yes | pass `github.run_id` explicitly |
| `job` / `sha` / `ref` | no | optional attribution — pass the matching `github.*` values explicitly |
| `api-base` | no | defaults to `https://opensoyce.com` |
| `dry-run` | no | `'true'` prints the plan; writes nothing |

## Authentication

The CLI authenticates with a Vault session file, never a token flag.

1. Locally: `opensoyce login` (device-code flow, browser approval).
2. Copy `session_token` from `~/.opensoyce/session.json`.
3. Store it as a repository or organization secret (e.g. `OPENSOYCE_SESSION_TOKEN`).
4. To invalidate it: `opensoyce logout` from the machine that minted it.

Treat the token as a credential for the workspace member who minted it. The action writes it to a `0600` session file for the duration of the step and removes the file afterward (`if: always()`), even when ingestion fails. Sessions carry a 30-day sliding TTL server-side; the server is the authority on expiry.

## Prerequisites

- Migration `0021_cei_observation_dedupe.sql` applied to the target environment — ingestion returns 503 until the dedupe schema exists.
- Node.js >= 18.17 on the runner (GitHub-hosted runners qualify).

## What lands in the Vault

One `dependency-exposure` record per `name@version`, `source_kind: ci`, `source_ref` = `github-actions/<owner-repo>/run/<id>[/job/<job>][/sha/<sha>]`, with the run attribution in `metadata` and `trust_boundary`. View them at `/vault/<workspace>/exposures` — and from there, the Phase 6 loop applies: a human proposes, a reviewer decides, CEI records the relationship.
