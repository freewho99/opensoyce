## DOGFOOD — DO NOT MERGE

This PR exists solely to verify the OpenSoyce CI Reporter v1 workflow end-to-end on OpenSoyce's own repository. The lockfile change adds `minimist@1.2.5` (known HIGH advisory, fix available at 1.2.6) as a devDependency.

### What this PR proves
- [ ] Workflow triggers on package-lock.json change
- [ ] Scanner runs successfully and exits 0 (--fail-on none default)
- [ ] Markdown comment appears on the PR with the v3d Risk Profile
- [ ] Comment includes the new minimist advisory
- [ ] Re-running the workflow updates the SAME comment (no duplicates)
- [ ] opensoyce-report.md and opensoyce-report.json upload as workflow artifacts

This branch will be deleted after observation. The minimist dev-dep is never merged into main.
