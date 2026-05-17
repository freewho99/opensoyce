# OpenSoyce CI Reporter

The CI reporter is a CLI front-end on top of the same scanner pipeline that
powers `/api/scan` in the web app. It reads a `package-lock.json`, runs the
v3d Dependency Risk Profile, and writes the markdown report to stdout (or a
file). A GitHub Actions example posts/updates that report as a PR comment.

## What it does

Given a `package-lock.json`, the CLI:

1. Parses the lockfile (npm v1/v2/v3, pnpm v6/v9, and Python uv.lock /
   poetry.lock supported; yarn is best-effort).
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

## Maintainer-concentration band-cap (AI signals v0.1)

When a repo's recent commits are dominated by a single contributor (>85%
share) AND there are 2 or fewer non-bot contributors AND the last commit
was >30 days ago, the verdict band caps from USE READY to FORKABLE. The
composite score is unchanged — only the band label is more conservative.

Vendor-official SDKs (curated in `src/data/vendorSdks.ts`) are suppressed
from this cap. A small team maintaining the official OpenAI SDK is a
different shape of risk than a hobby project with one author.

Known limitations:

- Bot detection is heuristic. We filter `[bot]` suffix, common bot logins
  (dependabot, renovate, github-actions, snyk-bot, mergify, codecov),
  and the GitHub `type: Bot` flag. Some bot accounts pass through as
  humans; a few human accounts with `-bot` in the login get filtered.
- The 85% / 2-contributor / 30-day thresholds are conservative; we prefer
  false-negatives (missing the cap) over false-positives.
- Fork-velocity (the third AI-swarm signal called out by Arjun + Elena)
  is deferred to v0.2.

## Install script detection (postinstall analysis v0)

npm `preinstall` / `install` / `postinstall` hooks execute arbitrary code
on `npm install`. The famous supply-chain incidents — event-stream,
ua-parser-js, colors.js, faker.js — all relied on install-hook execution
to deliver their payload. Ignoring this signal entirely was a known gap.

What we surface:

- Every inventory row, vuln row, and v3b selected-health row gets a small
  `⚠ INSTALL SCRIPT` chip when the lockfile flags the package as having
  install scripts (npm: `hasInstallScript: true`; pnpm: `requiresBuild: true`).
- The chip carries the tooltip: *"This package runs install scripts on
  `npm install` — install scripts can execute arbitrary code. Verify the
  package is trustworthy."*
- `inventory.totals.installScriptCount` reports the count across the tree.

What we suppress:

- A curated allowlist (`src/data/trustedInstallScripts.js`, ~30 entries) of
  packages where install scripts are expected and legitimate — TypeScript,
  esbuild, sharp, node-sass, sass-embedded, bcrypt, argon2, better-sqlite3,
  canvas, sqlite3, puppeteer, playwright, electron, cypress, husky,
  simple-git-hooks, lefthook, core-js, fsevents, jest, vitest, rollup, etc.
- Matching is case-insensitive and scope-aware (`@swc/core`, `@playwright/test`
  match by their full names including the leading `@`).

What this is **not**:

- The chip is **informational only**. It does NOT contribute to the
  Composite score, does NOT cap the verdict band, and does NOT raise the
  Risk Profile dimension. Surfacing the signal honestly is the goal —
  false-alarming on every node binding would teach users to ignore it.

v0 scope and known caveats:

- **npm v1/v2/v3 and pnpm only.** Both lockfile formats expose the flag
  natively per package entry; we pass it through to the inventory and
  carry it onto every vuln + selected-health row.
- **yarn-v1 lockfiles do not expose the install-script flag.** We default
  to `hasInstallScript: false` for yarn-v1 inventories. The chip never
  appears for yarn projects, regardless of whether the underlying package
  actually runs install scripts.
- **Python lockfiles (uv.lock, poetry.lock) have no equivalent flag.**
  The PyPI / wheel install model differs significantly from npm; build
  scripts run differently and the lockfile doesn't capture the signal in
  the same form. We default to false and surface no chip; this gap is
  deferred to a future release that can re-analyze the ecosystem honestly.

## Typo-squat homoglyph detection (informational only)

Borrowed-trust v2: an attacker publishes `lаngchain` (Cyrillic `а`
in place of Latin `a`) on npm, points its `repository` field at the real
`langchain-ai/langchain` GitHub repo, and inherits the legitimate
project's Soyce score. The resolver cross-check (8c0d6ab) catches
mismatches at the `package.json#name` level, but it cannot catch the
case where the attacker's own `package.json#name` ALSO contains the
homoglyph — both sides "agree" on a malicious name.

What we surface:

- Every inventory row, vuln row, and v3b selected-health row gets a
  `⚠ POSSIBLE TYPO-SQUAT` chip when the package name's Unicode-TR39
  confusables skeleton collides with a curated protected name AND the
  byte sequences differ.
- The chip tooltip names the suspected target: *"Package name uses
  characters that visually resemble `langchain`. This could be a
  typo-squat attack — verify the package is the one you intended."*
- `inventory.totals.possibleTypoSquatCount` reports the count across the
  whole tree.

How the detector works:

- `src/data/unicodeConfusables.js` is a hand-curated ~200-entry subset
  of the Unicode TR39 Confusables table: Cyrillic / Greek / fullwidth
  Latin lookalikes of common ASCII letters, plus the most-exploited
  same-script confusables (`0`/`o`, `1`/`l`, `5`/`s`, `8`/`b`, ...).
  NFKC normalization runs first inside `skeleton()`, then a lowercase
  fold, then a per-code-point lookup. Zero-width characters (ZWSP,
  ZWJ, ZWNJ, BOM, soft hyphen) drop to the empty string.
- `src/data/protectedPackageNames.js` is a hand-curated ~100-entry list
  of high-value targets (top npm installs + AI/ML/security-critical
  names). Skeletons are pre-computed at module load time into a
  `Map<skeleton, originalName>` so per-package lookup is O(1).
- `detectTypoSquat(name)` returns `{ matched, suspectedTarget }` when
  the skeleton matches a protected name AND `name !== suspectedTarget`
  (**byte-exact** comparison — no case-folding). Self-match returns
  null so a legitimate `langchain` install never fires the chip.

What this is **not**:

- The chip is **informational only**. It does NOT contribute to the
  composite score, does NOT cap the verdict band, and does NOT raise
  the Risk Profile dimension. Same posture as the install-script chip.
- Not a complete TR39 implementation. The full table is ~6000 entries;
  shipping it bloats the bundle without buying coverage of attacks
  anyone actually runs. A homoglyph against a code point we don't have
  in the table will pass through silently. v0.x research direction.
- Not exhaustive on protected names. ~100 entries covers the top npm
  installs + AI/ML/security-critical names; a typo-squat targeting an
  off-list package will not fire. The chip is a heads-up, not an audit.

False-positive bounds:

- The curated protected-names list scopes "what counts as a target",
  so we don't fire on every confusables collision between two random
  packages.
- The byte-exact self-match check guarantees the legitimate install
  of each protected package never fires.
- Scoped names (`@langchain/core`) include the `@` + `/` in the
  skeleton, so a scoped attack only collides with the scoped target,
  not with the bare unscoped name.

## Migration detection (fork-velocity-of-namesake)

`xenova/transformers` is RISKY for the right reason on the wrong repo: the
project moved to `huggingface/transformers.js` and the old namespace went
dormant. The score for the OLD repo is correct (it really is unmaintained),
but the package on npm is now backed by the new namespace — so the user
needs to know they're looking at the predecessor.

What we surface:

- The `migration` field on the `/api/analyze` response (top level) and on
  every vuln row's `repoHealth.migration` block (plus v3b selected-health
  rows). The Lookup page renders a yellow banner ABOVE the score card; the
  Scanner renders a small `⚠ MIGRATED` chip on each row.
- Two confidence tiers: **HIGH / curated** (the well-known migrations in
  `src/data/repoMigrations.js`) and **MEDIUM / fork-chain** (algorithmic —
  see below).
- Entries with `to: null` are valid — they mean "deprecated, no canonical
  successor." The banner copy reads "was deprecated" instead of "migrated
  to X" for those entries.

The algorithmic check (`src/shared/detectMigration.js`) only fires when:

1. The curated table didn't have an entry, AND
2. The verdict band is one of WATCHLIST / RISKY / STALE (no API call burned
   on a healthy repo), AND
3. The repo's `pushed_at` is older than 180 days (truly dormant), AND
4. A top-3 fork (by stars) was pushed within the last 90 days AND has at
   least 10% of the original's stargazer count.

The first fork matching both criteria wins. Confidence is MEDIUM; the
successor is presented as "possible migration (detected)" rather than the
curated "known migration." Total extra cost: at most one GitHub API call
per low-band scan, 24h-cached.

**This is informational only.** The composite score, Risk Profile, and
verdict band are unchanged. The banner attributes the score to the OLD
repo; the user clicks through to the successor to re-score there. A fork
that took off without an actual maintainer handoff could be mis-flagged —
the MEDIUM confidence is honest about that.

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
- **Lockfile coverage:** `package-lock.json` (npm v1/v2/v3),
  `pnpm-lock.yaml` (pnpm v6/v9), and Python `uv.lock` / `poetry.lock`.
  Yarn is best-effort (`yarn.lock` v1 parses but direct/transitive
  and scope are reported as `unknown`).
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

## pnpm lockfile support (pnpm-lock.yaml)

OpenSoyce v0 supports pnpm lockfiles (v6 and v9) alongside npm. Because
pnpm uses the npm registry, scans of `pnpm-lock.yaml` route through OSV's
`npm` ecosystem — the same scoring, Risk Profile, and Maintainer Trust
pipeline the npm path uses.

**CLI usage**

```bash
node scripts/opensoyce-scan-report.mjs path/to/pnpm-lock.yaml
```

The CLI auto-detects pnpm from a top-level `lockfileVersion:` scalar plus
one of pnpm's distinctive sections (`importers:`, `packages:`,
`snapshots:`, `settings:`). Filename is passed through as a hint for
future per-format dispatch but does not gate detection today.

**Direct vs. transitive**

The `importers:` section is the source of truth for direct dependencies.
Every workspace path (`.` for the root, plus any `./packages/*` members)
contributes its `dependencies` / `devDependencies` / `optionalDependencies`
buckets. Scope precedence follows the existing `mergeScopes` rule —
prod > optional > dev > unknown — so a package declared `prod` in the
root and `dev` in a sub-workspace is reported as `prod`.

**Workspace handling**

Values like `link:../inner`, `workspace:*`, `file:./vendor`, and `git+`
URLs are recognised as workspace-internal and excluded from the direct-
dep count (they are not queryable against OSV). Regular versioned deps
inside sub-workspaces flow through normally.

**Peer suffix collapse**

pnpm v6 emits per-peer-variant keys like `/foo@1.0.0_react@18.2.0`; pnpm
v9 emits the paren form `/foo@1.0.0(react@18.2.0)`. v0 collapses both to
a single `foo@1.0.0` entry. Per-variant reporting is deferred to v0.1.

**Known limitations**

- pnpm v5 and earlier are not supported (different layout with
  `specifiers:` + flat `dependencies:` instead of `importers:`).
- The `snapshots:` block (v9 split-out) is parsed for package keys only;
  per-snapshot peer variants are collapsed.
- `overrides:` and `patchedDependencies:` are ignored.
- License and repository fields are not present in `pnpm-lock.yaml`; the
  resolver fetches both from the npm registry on demand. Inventory rows
  always report `hasLicense: false` / `hasRepository: false`.
- If `importers:` is missing entirely, the inventory sets
  `totals.directUnknown: true` and marks every package as transitive —
  same honesty rule the Python path uses for `poetry.lock` without a
  companion `pyproject.toml`.

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

## Signed reports (Ed25519)

Every JSON and SARIF report OpenSoyce emits via the CLI carries an Ed25519
cryptographic signature anchored to a public OpenSoyce signing key. The
signature proves two things:

1. **Artifact integrity** — the report bytes have not been altered since
   OpenSoyce emitted them. A single character change anywhere in the JSON
   invalidates the signature.
2. **OpenSoyce origin** — only the holder of the OpenSoyce private key
   (Vercel env `OPENSOYCE_SIGNING_PRIVATE_KEY`) can produce a signature
   that verifies against the public key.

The signature does NOT prove anything about the scan input or the upstream
data sources (OSV, GitHub, npm). It is integrity for the artifact only.

### Signature format

The signature is embedded inside the report. For a JSON report it appears
at the top level:

```json
{
  "schemaVersion": 1,
  "decision": { "label": "CLEAN", "reason": "..." },
  "totals": { "...": "..." },
  "signature": {
    "algorithm": "Ed25519",
    "keyFingerprint": "<sha256-hex of the public key>",
    "signedAt": "2026-05-14T12:34:56.789Z",
    "signature": "<base64-encoded 64-byte Ed25519 signature>"
  }
}
```

For a SARIF report the signature lives at `runs[0].properties.signature`
(SARIF allows arbitrary properties on `run.properties`), with the same
four fields.

The signed bytes are a sorted-keys JSON canonicalization of the report
without the signature field. Re-signing the same content with the same
key always produces the same 64-byte signature (Ed25519 is deterministic
per RFC 8032).

### Public key

Published at `https://www.opensoyce.com/.well-known/opensoyce-signing-key.pem`.
Anyone — including external auditors with no OpenSoyce account — can fetch
the PEM and verify a report locally.

### Verifying via CLI

```bash
node scripts/opensoyce-scan-report.mjs --verify report.json
# OK signature: <fingerprint> signed at 2026-05-14T12:34:56.789Z
#   verified against env OPENSOYCE_SIGNING_PUBLIC_KEY (fingerprint <fingerprint>)
```

The CLI loads the public key from `OPENSOYCE_SIGNING_PUBLIC_KEY` env var
if set; otherwise it fetches the PEM from the well-known URL above. Exit
code is 0 on `OK`, 1 on `INVALID: <reason>` printed to stderr.

`--verify` works on both JSON and SARIF reports — the location is detected
automatically from the document shape.

### Verifying via the web endpoint

```bash
curl -X POST https://www.opensoyce.com/api/verify-report \
  -H 'Content-Type: application/json' \
  --data @report.json

# {"valid":true,"keyFingerprint":"<fingerprint>","signedAt":"2026-05-14T12:34:56.789Z"}
# or
# {"valid":false,"reason":"signature does not match canonical report bytes"}
```

CORS is open, so browsers can call the endpoint directly.

### Failure modes the verifier surfaces

| Verifier exit / response | Cause                                                       |
| ------------------------ | ----------------------------------------------------------- |
| `INVALID: no signature`  | Report has no `signature` field at the expected location.   |
| `INVALID: unsupported signature algorithm: <name>` | `signature.algorithm` is not `Ed25519`. |
| `INVALID: signature is not valid base64` | `signature.signature` decodes to garbage. |
| `INVALID: Ed25519 signatures must be 64 bytes, got <n>` | Base64 decodes to wrong length. |
| `INVALID: public key is not parseable: <err>` | Operator passed a malformed PEM. |
| `INVALID: signature does not match canonical report bytes` | Report was tampered with, OR was signed with a different key than the one being used to verify. |

### Backward compat

If `OPENSOYCE_SIGNING_PRIVATE_KEY` is not set in the environment, the CLI
emits reports **unsigned** and prints a single warning to stderr:

```
WARN OPENSOYCE_SIGNING_PRIVATE_KEY not set; reports will be emitted unsigned
```

Existing CI workflows that don't set the env var continue to work; their
output is just not verifiable.

### Key rotation

If the fingerprint at `/.well-known/opensoyce-signing-key.pem` changes,
the old signing key has been rotated. Reports signed under the old key
will show as `INVALID: signature does not match canonical report bytes`
when verified against the new public key. A formal key-rotation timeline
and a published rotation log are deferred to a future release.

### Out of scope for v0

- **Retention / history.** OpenSoyce does not durably store every signed
  report it has ever emitted. The signature proves the artifact you have
  in front of you is authentic; if you need a longer-lived record, archive
  the signed report yourself.
- **SOC 2 compliance.** Cryptographic signing is one input to a SOC 2
  audit, not the whole story. The SOC 2 operational work (control
  ownership, evidence collection, auditor engagement) is tracked
  separately from this engineering deliverable.

