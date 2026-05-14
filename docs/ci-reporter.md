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

## Dogfooded on OpenSoyce

**Dogfooded:** 2026-05-14
**Active workflow:** `.github/workflows/opensoyce-scan.yml`
**Advanced opt-in:** `.github/workflows/opensoyce-fork-comment.yml.example`

OpenSoyce now runs its own CI Reporter on every PR that touches a
`package-lock.json`. The active workflow is committed to `main` and fires on
`pull_request` plus `workflow_dispatch` (so we can re-fire it manually
during validation).

### Required permissions

```yaml
permissions:
  contents: read
  pull-requests: write
```

The auto-issued `GITHUB_TOKEN` covers both. No PAT is needed for public
repos at the default scoring concurrency.

### Recommended defaults

- Start with `--fail-on none`. The report is informational only — never
  blocks a merge. This is what the dogfood workflow ships with.
- Once the team trusts the output, escalate to `--fail-on high-vuln` (block
  on any HIGH/CRITICAL advisory) or `--fail-on review-required` (block when
  the v3d summary label is `REVIEW_REQUIRED`).
- Keep the artifact upload on (`opensoyce-report.md` and
  `opensoyce-report.json`) so reviewers can pull the full JSON when the PR
  comment gets truncated.

### Known limitations

- **Forked PRs.** The default workflow uses `pull_request`, which issues a
  read-only `GITHUB_TOKEN` for fork-PR runs. The scanner runs and the
  artifact uploads, but the comment-post step silently fails. If you need
  comments on fork PRs, copy
  `.github/workflows/opensoyce-fork-comment.yml.example` to `.yml` and
  read the security warning at the top of that file FIRST —
  `pull_request_target` is a foot-gun if used naively.
- **First-run cost.** On a cold cache, every selected dep's repo health
  call goes to the wire at concurrency=5. Expect ~30–60 s on a medium
  lockfile. Subsequent runs in the same process hit the 5-minute in-process
  cache, but a fresh CI runner is always a cold start.
- **Rate limit.** The workflow consumes the repo's `GITHUB_TOKEN`
  repo-health budget. For very large dependency trees (1000+ packages),
  pass a separate PAT via `--github-token` to get a higher rate-limit
  ceiling.
- **No-fix-version advisories.** When an OSV advisory genuinely has no
  fixed version, the recommended action reads "escalate or wait for
  upstream patch." That can feel unactionable, but it is the truth — not a
  tool failure. The team should know that going in.

### Required artifacts

`opensoyce-report.md` and `opensoyce-report.json` upload via
`actions/upload-artifact@v4` and remain attached to the workflow run for
the default retention window.

### What was verified by the dogfood PR

<!-- filled in after the dogfood PR observation lands -->

- [ ] Workflow triggers on `package-lock.json` change
- [ ] Scanner runs and exits 0 with `--fail-on none`
- [ ] PR comment appears with the v3d Risk Profile
- [ ] Comment includes the seeded `minimist@1.2.5` advisory
- [ ] Re-running the workflow updates the SAME comment (no duplicates)
- [ ] `opensoyce-report.md` and `opensoyce-report.json` upload as artifacts
