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
| `--sarif`            | path                                                    | —       | Also write a SARIF 2.1.0 report to this path. |
| `--ignore`           | path                                                    | auto    | Path to a `.opensoyce-ignore` file (default: auto-discover in lockfile's parent dir). |
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
`actions/upload-artifact@v7` and remain attached to the workflow run for
the default retention window.

### What was verified by the dogfood PR

PR [#1](https://github.com/freewho99/opensoyce/pull/1) added
`minimist@1.2.5` (HIGH advisory, fix at 1.2.6) as a devDependency on a
throwaway branch and fired the active workflow twice.

- [x] Workflow triggers on `package-lock.json` change (fired on PR open,
  ~22 s wall time including `npm ci`)
- [x] Scanner runs and exits 0 with `--fail-on none`
- [x] PR comment appears with the v3d Risk Profile
- [x] Comment includes the seeded `minimist@1.2.5` advisory: severity HIGH,
  Maintainer Trust HIGH ("minimist is vulnerable and its source repo is
  RISKY"), recommended action names minimist
- [x] Re-running the workflow updates the SAME comment (no duplicates) —
  verified by `created_at` staying constant while `updated_at` advanced
- [x] `opensoyce-report.md` and `opensoyce-report.json` upload as artifacts
  (4.8 KB zip in the verified run)

### Findings from dogfood

- **Node 20 deprecation warning** surfaced in the first run.
  `actions/checkout`, `actions/setup-node`, and `actions/upload-artifact`
  were on `@v4`, which runs on Node 20 — deprecated by GitHub on June 2
  2026. Bumped all three to their Node 24 majors (`@v6` / `@v6` / `@v7`)
  and the explicit `node-version` to `22` so the scanner uses a non-EOL
  runtime. The example template was updated to match — if you copied the
  example before this date, do the same bump.
- **`workflow_dispatch` correctly skips the comment step.** The gate
  `if: github.event_name == 'pull_request'` on the comment step lets the
  manual-fire path complete cleanly (artifacts upload, no attempt to
  comment on a non-existent PR). Verified.
- **First-run wall time was ~22 s** on the dogfood scan (281-package
  tree, 25 selected deps scored, cold GitHub-API cache). That's well
  under the 30–60 s ceiling noted above.
- **Other comment authors don't confuse the marker logic.** The dogfood
  PR also got a `vercel[bot]` deploy-preview comment; the marker-based
  `jq` selector ignored it cleanly and only updated OpenSoyce's own
  comment on re-run.

## GitHub App v0

The OpenSoyce GitHub App is the zero-config productization of the CI
Reporter. Install the App on a repo and OpenSoyce starts posting a Check
Run on every pull request — no workflow file, no `npm ci` in your CI,
no `GITHUB_TOKEN` setup.

**Install URL:** [github.com/apps/opensoyce](https://github.com/apps/opensoyce)
*(slug to be confirmed against the App settings page on first install — if
it differs, file an issue and we'll update this doc).*

**Webhook URL** (informational; users don't configure this):
`https://www.opensoyce.com/api/github-webhook`

### One-click install

1. Visit the install URL above.
2. Click **Install**, pick the repos you want covered.
3. Done. The next PR you open will get a Check Run named
   **OpenSoyce Dependency Risk**.

### How it differs from the workflow

| Aspect         | Workflow (`opensoyce-scan.yml`)    | App v0                                  |
| -------------- | ---------------------------------- | --------------------------------------- |
| Setup          | Copy `.yml`, `npm ci` in CI        | One click, no repo changes              |
| Surface        | PR comment (sticky, marker-based)  | Check Run on the commit                 |
| Token          | Repo's `GITHUB_TOKEN`              | Installation token (minted per webhook) |
| Code execution | Runs `npm ci` in CI runner         | None. Lockfile is fetched read-only     |
| Fork PRs       | Comment silently fails on forks    | Works (App is installed on base)        |

### Required permissions on install

- **Contents** (read) — fetch `package-lock.json` at the PR head SHA
- **Pull requests** (read) — read PR metadata from the webhook payload
- **Checks** (write) — create the Check Run
- **Metadata** (read) — required for any App

GitHub asks for these on the install screen; accept them all.

### v0 limitations

- **Events:** only `pull_request` with action `opened`, `synchronize`,
  or `reopened`. Other actions (labeled, edited, closed, etc.) are
  acked with `{ ignored: '<action>' }` and no Check Run is posted.
- **Lockfile coverage:** `package-lock.json` (npm v1/v2/v3) only.
  Yarn and pnpm support tracks the rest of the scanner roadmap.
- **Never blocks merges.** The Check Run always reports
  `conclusion: success` in v0 — the title carries the decision label
  (CLEAN / PATCH AVAILABLE / REVIEW REQUIRED / VERIFY LATER) but the
  green check stays green. Threshold-based blocking lands in v0.1.
- **No PR code execution.** The App never runs a `git clone` or
  `npm install` against contributor code. Same security stance as the
  fork-comment workflow doc — only the lockfile bytes are read.
- **Public + private repos** both work, as long as the App is installed
  on the repo.
- **No persistent state, no dashboard, no settings.** Whatever you want
  changed, file an issue.
- **One Check Run per head SHA.** Each `synchronize` event ships a new
  head SHA which gets its own fresh Check Run — that's GitHub-native
  behavior. No PATCH-by-id, no dedup gymnastics.

The workflow-file CI Reporter
(`.github/workflows/opensoyce-scan.yml.example`) is still fully
supported for teams that prefer workflow-based CI.

## Python lockfile support (uv.lock + poetry.lock)

OpenSoyce v0 supports Python lockfiles alongside npm. The same v3d Risk
Profile and Maintainer Trust signal that ships for npm now applies to
PyPI packages, so AI-builder stacks (LangChain, Hugging Face, etc.) are
visible in the scan.

**Supported formats**

| Format        | Filename hint    | Direct/transitive split        |
| ------------- | ---------------- | ------------------------------ |
| `uv-lock`     | `uv.lock`        | Read from `[manifest]` section |
| `poetry-lock` | `poetry.lock`    | Unknown without companion `pyproject.toml` (caveat surfaced) |

`requirements.txt` and `Pipfile.lock` are deferred to v0.1.

**CLI usage**

```
node scripts/opensoyce-scan-report.mjs path/to/uv.lock
node scripts/opensoyce-scan-report.mjs path/to/poetry.lock
```

The CLI auto-detects the format from the file content (Poetry's
`# This file is @generated by Poetry` banner and uv's
`requires-python = ...` heuristic). Filename is passed through as a hint
for future per-format dispatch but does not gate detection today.

**OSV ecosystem**

Each scan runs against a single OSV ecosystem inferred from the lockfile:
`npm-v*` and `yarn-v*` map to `npm`; `uv-lock` and `poetry-lock` map to
`PyPI`. The ecosystem flows through every OSV `package` query and the
affected-range filter that picks `fixedIn` versions.

**Borrowed-trust cross-check (Python)**

When a PyPI package's `project_urls.Repository` (or `Source` / `Code`)
points at a GitHub repo, the resolver fetches `pyproject.toml` from that
repo and compares `[project].name` to the PyPI package name (with PEP 503
normalization). Mismatch downgrades the identity from HIGH to MEDIUM and
surfaces `mismatchReason: 'github_pyproject_name_different'`. Repos
without a `pyproject.toml` (legacy `setup.py`-only projects) are treated
as `verified: 'unverified'` — that's normal, not a fraud signal.

**Known limitations**

- `poetry.lock` without a companion `pyproject.toml` cannot distinguish
  direct from transitive dependencies. The inventory sets
  `totals.directUnknown: true` and the v3c Tree Complexity dimension
  surfaces an explicit caveat band rather than silently treating every
  package as transitive.
- Path deps, git deps, environment markers, and extras are honored as
  packages but do not get any extra metadata in v0.
- Only the GitHub host is supported for source-repo resolution. GitLab /
  Codeberg / self-hosted lands in v0.1.

## Build-time prerender of `/methodology`

`npm run build` runs `vite build` then [`scripts/prerender.mjs`](../scripts/prerender.mjs),
which produces a Node-targeted SSR bundle of `src/prerender-entry.tsx`,
renders the React tree for `/methodology` to an HTML string, and writes
the result into `dist/methodology/index.html`. The SPA shell at
`dist/index.html` is untouched. Vercel's `rewrites` in `vercel.json` send
`/methodology` to the prerendered file before the SPA catchall, so
`curl https://www.opensoyce.com/methodology` returns ~40KB of real
methodology copy (versus ~1.5KB of empty SPA shell) — usable for SEO,
security audits, and citation links. The page still hydrates client-side
into the normal React SPA after load. Run
[`scripts/test-methodology-ssr.mjs`](../scripts/test-methodology-ssr.mjs)
after deploy to assert the prerender survived the round trip.

## SARIF output + suppression

The CI Reporter can emit a SARIF 2.1.0 file alongside its markdown / JSON
reports so GitHub Code Scanning, GitLab security dashboards, and
SARIF-aware enterprise tools can ingest OpenSoyce findings natively. Two
new flags drive this:

- `--sarif <path>` — write SARIF 2.1.0 to `<path>`. Composes with `--out`
  and `--json` (you can have all three).
- `--ignore <path>` — explicit path to a `.opensoyce-ignore` file.
  Defaults to auto-discovering `.opensoyce-ignore` in the lockfile's
  parent directory.

Severity → SARIF level mapping: `CRITICAL` and `HIGH` map to `error`,
`MEDIUM` / `MODERATE` map to `warning`, `LOW` maps to `note`, and
unknown / missing severity maps to `warning` (never `none` — we keep
unrecognized advisories visible).

When a vuln carries a borrowed-trust signal (`verified === false`,
meaning the npm/PyPI metadata pointed at a source repo whose manifest
named a different package), an additional SARIF result is emitted under
rule id `opensoyce.borrowed-trust-identity` so reviewers see the
identity mismatch as its own row.

### .opensoyce-ignore file format

gitignore-flavored. Lines beginning with `#` are comments. A trailing
`# reason` on a rule line is captured and re-surfaced in the SARIF
`run.properties.suppressions` block.

```
# .opensoyce-ignore — suppress specific advisories or packages
pkg:minimist@1.2.5         # vendored, not actually exposed
pkg:lodash                  # all lodash advisories (any version)
cve:CVE-2020-28500          # mitigated by gateway rate-limit
ghsa:GHSA-29mw-wpgm-hmr9    # accepted risk per security review 2026-04
advisory:CVE-2020-28500     # advisory: accepts either CVE or GHSA
```

Suppression affects ONLY the SARIF output in v0 — markdown and JSON
reports remain complete so users can't accidentally hide advisories from
their own dashboards by setting up the ignore file. Suppressed results
are listed under `runs[0].properties.suppressions` with the matching
rule and comment.

### GitHub Code Scanning workflow snippet

```yaml
- name: Run OpenSoyce
  run: node scripts/opensoyce-scan-report.mjs package-lock.json --sarif opensoyce.sarif

- name: Upload to GitHub Code Scanning
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: opensoyce.sarif
```
