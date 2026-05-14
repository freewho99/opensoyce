# OpenSoyce CI Reporter

The CI reporter is a CLI front-end on top of the same scanner pipeline that
powers `/api/scan` in the web app. It reads a `package-lock.json`, runs the
v3d Dependency Risk Profile, and writes the markdown report to stdout (or a
file). A GitHub Actions example posts/updates that report as a PR comment.

## What it does

Given a `package-lock.json`, the CLI:

1. Parses the lockfile (npm v1/v2/v3 supported; yarn coming).
2. Queries OSV for known vulnerabilities.
3. Resolves each vulnerable package's GitHub source repo via the npm registry.
4. Calls 8 GitHub endpoints per resolved repo, runs the Soyce scorer, and
   attaches a verdict to every HIGH/MEDIUM-confidence vulnerable row.
5. Builds a whole-tree inventory of installed packages (Scanner v3a).
6. Picks up to 25 non-vulnerable inventory packages by tier
   (direct-prod, direct-dev, multi-version, identity-unresolved) and scores
   their source repos (Scanner v3b).
7. Computes the 5-dimension Risk Profile (Scanner v3c).
8. Emits the v3d markdown report.

The CLI uses the **same** `analyzeRepo` and `resolveDepIdentity` modules the
web app uses, so scoring is bit-identical across runtimes.

## Requirements

- Node.js 18+ (uses global `fetch`).
- No additional npm install — the CLI lives in the OpenSoyce repo. Run
  `npm ci` to install the existing dep tree.
- `GITHUB_TOKEN` recommended (anonymous GitHub allows only 60 req/hr, which
  is far below what a real scan needs).

## CLI flags

| Flag                 | Value                                                   | Default | Description                                  |
| -------------------- | ------------------------------------------------------- | ------- | -------------------------------------------- |
| `<lockfile>`         | path                                                    | —       | Positional, required. The `package-lock.json`. |
| `--out`              | path                                                    | stdout  | Write markdown report to this path.          |
| `--json`             | path                                                    | —       | Also write the JSON report to this path.     |
| `--fail-on`          | `none` \| `review-required` \| `high-vuln` \| `critical-vuln` | `none`  | Exit nonzero when the threshold is crossed.  |
| `--github-token`     | string                                                  | env     | Overrides `GITHUB_TOKEN` for this run.       |
| `--quiet`            | boolean                                                 | false   | Suppress progress lines on stderr.           |
| `--help`             | boolean                                                 | false   | Print usage and exit.                        |

## Exit codes

| Code | Meaning                                                       |
| ---- | ------------------------------------------------------------- |
| 0    | Success and `--fail-on` threshold not crossed.                |
| 1    | Threshold crossed, lockfile missing/too large, or scan failed.|
| 2    | Invocation error (unknown flag, missing positional, bad value).|

`--fail-on` mapping:

| Level             | Triggers exit=1 when …                                  |
| ----------------- | ------------------------------------------------------- |
| `none`            | never (always exit 0)                                   |
| `review-required` | `summary.label === 'REVIEW_REQUIRED'`                   |
| `high-vuln`       | any vuln has severity `HIGH` or `CRITICAL`              |
| `critical-vuln`   | any vuln has severity `CRITICAL`                        |

## Local invocation

```
npm ci
node scripts/opensoyce-scan-report.mjs package-lock.json
```

Write to a file and emit JSON sidecar:

```
node scripts/opensoyce-scan-report.mjs package-lock.json \
  --out report.md \
  --json report.json
```

Fail the run if any high or critical advisory shows up:

```
node scripts/opensoyce-scan-report.mjs package-lock.json --fail-on high-vuln
```

With a token:

```
GITHUB_TOKEN=ghp_xxx node scripts/opensoyce-scan-report.mjs package-lock.json
```

## GitHub Actions integration

See `.github/workflows/opensoyce-scan.yml.example` in this repo. Rename it
to `.yml` in your own repo to activate. The workflow:

1. Runs on PRs that touch any `package-lock.json` (root or monorepo path).
2. `npm ci`s OpenSoyce's own deps so the CLI can import the shared modules.
3. Runs the CLI with `--out report.md --json report.json`.
4. Uploads both files as workflow artifacts.
5. Posts a PR comment containing the markdown, prefixed with the marker
   `<!-- opensoyce-report -->`. On re-runs of the same PR, it finds the
   existing comment by that marker and edits it in place instead of stacking
   a new one.

The example uses `GITHUB_TOKEN` (the auto-issued one) for both the gh CLI and
the scanner. If you need to score private dependencies the default token can't
read, supply a PAT secret and pass it via `--github-token`.

## Honest framing

The markdown report is built by `buildMarkdownReport` (see
`src/shared/buildScanReport.js`) and respects the locked product copy rules:

- It says "Known vulnerabilities", never "all vulnerabilities".
- Coverage reads: *"Selected dependency health scored X of Y installed
  dependencies."* The numerator is rows whose status is `SCORED`, not the
  budget size.
- It never claims the whole tree was Soyce-scored.

If OSV is unavailable, the report still renders — the Uncertainty section
lists "OSV vulnerability data was unavailable for this scan." and the
Vulnerability Exposure dimension goes to `UNKNOWN` (never `LOW`).
