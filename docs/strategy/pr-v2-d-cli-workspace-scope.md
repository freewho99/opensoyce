# PR-V2-D — CLI Workspace Extension Scope

Status: approved-next only with explicit execution call
Scope: CLI workspace extension + atomic CLI v0 lock lift
Non-scope: Dashboard, Phase 6, workers, dynamic exposure types.

## Recommended PR Title

```txt
feat(cli): add Vault workspace mode
```

## Allowed Scope

```txt
1. Add CLI login/logout support for Vault workspace mode.

2. Add local CLI session storage:
   - ~/.opensoyce/session.json
   - mode 0600 where supported
   - stores only the minimum required session metadata
   - logout is locally idempotent

3. Add --workspace support to eligible CLI commands:
   - check
   - lockfile
   - why
   - timeline

4. Do NOT require --workspace for:
   - login
   - logout
   - trust
   - version
   - help

5. Preserve CLI v0 behavior when no workspace/session is used.
   No-login + no---workspace mode must remain the public CLI v0 path.

6. Add Vault exception CLI commands:
   - exceptions list
   - exceptions propose
   - exceptions revoke

7. Keep approve/reject/extend UI-only.
   CLI can propose and revoke, not approve final trust.

8. Add private CLI output discipline:
   - workspace output may show private visibility fields only when authenticated
   - public CLI mode must not emit private-anchor hrefs
   - public CLI mode must not read Vault Timeline
   - private CLI mode must label Vault-sourced rows clearly

9. Atomically lift CLI v0 locks only as needed for PR-V2-D:
   - command count lock
   - flag count lock
   - help snapshot expectations
   - parser invariants

10. Add structural tests proving:
   - existing CLI v0 commands still work
   - no workspace flag keeps old public behavior
   - --workspace requires authenticated session
   - workspace commands call Vault endpoints only in workspace mode
   - exception list/propose/revoke are present
   - approve/reject/extend are absent
   - public CLI cannot emit private-anchor hrefs
   - private CLI output marks visibility/private source
```

## Permitted File Families

```txt
packages/cli/**
scripts/test-cli-v0*
scripts/test-cli-workspace-v0*
package.json scripts only if needed
docs/architecture or docs/cli only if needed
server auth/route support only if strictly required for the approved CLI login/session flow
```

## Hard Non-Scope

```txt
DO NOT add Vault Dashboard UI.
DO NOT implement approve/reject/extend from CLI.
DO NOT change exception state machine semantics.
DO NOT add new exception lifecycle states.
DO NOT change PR-V2-B API behavior except for minimal CLI consumption compatibility.
DO NOT change private proof-anchor or Vault Timeline read semantics from PR-V2-C.
DO NOT make public CLI mode read Vault tables.
DO NOT expose private-anchor hrefs in public CLI output.
DO NOT change Trust Badge behavior.
DO NOT change public gate semantics.
DO NOT change public Timeline semantics.
DO NOT add VEX.
DO NOT add reachability.
DO NOT add sandbox.
DO NOT add Component Exposure Intelligence.
DO NOT add dynamic exposure types.
DO NOT add ingestion workers.
DO NOT add Go code.
DO NOT add Docker Compose / Kubernetes / Prometheus / Grafana / HPA.
DO NOT add remediation drafts.
DO NOT add compliance export.
DO NOT touch SOC 2 / Vanta / Drata copy.
DO NOT touch threat_feed / candidate-pipeline / blog content.
DO NOT expand banned vocabulary beyond what PR-V2-D strictly requires.
```

## CLI Doctrine

```txt
The CLI may request private trust evidence.
It does not become the trust record.

Private CLI output is a read surface.
It is not a public proof surface.

The user authenticates.
The workspace resolves.
The Vault decides what the CLI may see.
```

## Required Verification Before Merge Call

```txt
npm run test:cli-v0
npm run test:cli-workspace-v0
npm run test:vault-auth-v0
npm run test:vault-exception-api-v0
npm run test:vault-private-reads-v0
npm run test:open-source-trust-center
npm run test:trust-timeline
npm run test:trust-badge-v0
npm run test:repo-trust-dashboard
npm run check:mojibake
```
