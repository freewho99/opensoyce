## GitHub App v0 dogfood — DO NOT MERGE

This PR exists solely to verify the **GitHub App v0** end-to-end. The lockfile change adds `minimist@1.2.5` (HIGH advisory, fix available at 1.2.6) as a devDependency.

### What this PR proves about the App
- [ ] App webhook fires on PR open (event: `pull_request`, action: `opened`)
- [ ] Vercel function verifies the HMAC-SHA256 signature against `GITHUB_APP_WEBHOOK_SECRET`
- [ ] JWT mint + installation-token exchange succeeds
- [ ] `package-lock.json` fetched from the PR head SHA via Contents API
- [ ] `runScan` produces the same Risk Profile shape the CLI / web UI produce
- [ ] Check Run "OpenSoyce Dependency Risk" appears on the PR with the v3d markdown report
- [ ] Check Run conclusion is `success` (v0 is always report-only)
- [ ] Check Run output includes `minimist@1.2.5` in the markdown
- [ ] Existing CI Reporter workflow (`.github/workflows/opensoyce-scan.yml`) still works in parallel — the App and the workflow coexist

This branch will be closed without merging. The minimist dev-dep stays out of `main`.
