# Sub-Sketch: Vault CLI Workspace Extension (Phase 5, PR-V1-E)

**Status:** Proposed (this sub-sketch)
**Date:** 2026-06-07
**Phase:** 5 — Trust Vault (sub-sketch PR-V1-E per the [Trust Vault ADR](./trust-vault-architecture-adr.md) §9.1)
**Type:** Docs-only sub-sketch. No application code, no `package.json` changes, no test changes, no migrations, no routes, no banned-substring vocabulary lifted.

**Predecessors:**

- [Trust Vault ADR](./trust-vault-architecture-adr.md) (#67) — §7.1 (CLI relationship; names the 6th command + 8th flag at architecture level)
- [Vault Auth + Workspace Sub-Sketch](./vault-auth-workspace-sub-sketch.md) (#69) — §2.3 (CLI auth flow deferred to "PR-V1-E (device-code vs PAT paste)")
- [Vault Persistence Layer Sub-Sketch](./vault-persistence-layer-sub-sketch.md) (#70) — §2.4 (`vault_sessions` row keyed by opaque ID)
- [Vault Exception State Machine + API Sub-Sketch](./vault-exception-state-machine-api-sub-sketch.md) (#71) — §2 (the 8 API endpoints the CLI calls)
- [Vault Private Proof-Anchor + Timeline Sub-Sketch](./vault-private-proof-anchor-timeline-sub-sketch.md) (#72) — §3 (Vault Timeline read API), §6 (masking + `X-OpenSoyce-Vault-Masked-Fields` header)
- [CLI v0 Sub-Sketch](./cli-architecture-sub-sketch.md) (#59) — locked surface (5 commands, 7 flags, 6 exit codes)

This sub-sketch refines the CLI workspace extension into something an implementation PR (PR-V2-D) can build against without re-litigating auth flow, command shapes, or v0-compatibility rules. It is the **last of the five Phase 5 sub-sketches**; after it merges, PR-V2-A (auth + workspace foundation implementation) is the next recommended PR — the first implementation step of Phase 5.

## 0. Inherited doctrine (non-negotiable)

From prior sub-sketches:

> 1. Public trust record shows what can be shared.
> 2. Trust Vault stores what must be controlled.
> 3. Exceptions are allowed decisions, not erased risk.
> 4. Every vault read is auth-checked.
> 5. Private anchors prove private decisions; they do not become public proof.
> 6. Vault Timeline records workspace history; it does not rewrite the public Timeline.

This sub-sketch's specific addition:

> 7. **The CLI extension is additive. The v0 surface stays whole as `cli v0 mode`.** A user who never logs in and never passes `--workspace` sees byte-for-byte the same behavior as CLI v0. Workspace mode is a strict superset, never a replacement.

Rule 7 is the load-bearing constraint. Every decision below is a corollary.

## 1. CLI auth flow

### 1.1 Recommended choice: device-code flow

The CLI's `opensoyce login` initiates a **device-code flow against the OpenSoyce server**, which in turn coordinates with GitHub OAuth (per PR-V1-A §1.1). The shape mirrors `gh auth login` and matches the candidate-pipeline server-side OAuth path.

| Step | Description |
|---|---|
| 1 | `opensoyce login` POSTs to `/api/vault/cli/device-code` with no body |
| 2 | Server returns `{ device_code, user_code, verification_uri, interval, expires_in }` |
| 3 | CLI displays the `user_code` and `verification_uri` (e.g., `https://opensoyce.com/cli-auth`) |
| 4 | CLI polls `/api/vault/cli/device-token` at `interval` seconds (default 5s) with `{ device_code }` |
| 5 | User opens `verification_uri` in a browser, signs in via existing GitHub OAuth, enters `user_code`, confirms |
| 6 | Server completes the pairing, the next poll returns `{ session_token, expires_at, user: { github_login, display_name } }` |
| 7 | CLI writes `~/.opensoyce/session.json` (mode `0600`) with the token, prints "Logged in as `<github_login>`" |

The `session_token` is the same opaque server-side session-id shape from PR-V1-A §2.1 — but stored in a file instead of a cookie. The server-side `vault_sessions` row treats the CLI session and the browser cookie session identically (per PR-V1-B §2.4 the row already has `user_agent` for differentiation).

### 1.2 Explicitly rejected (with reasoning)

| Candidate | Rejected because |
|---|---|
| **Personal Access Token (PAT) paste** | The user must visit a token-creation page, generate a token, copy it, paste it into the terminal. Long-lived PATs need rotation infrastructure. Tokens captured in shell history. Device-code is friction-free at the same security level. |
| **Browser-cookie share** (have the CLI read the browser's `opensoyce_vault_session` cookie) | Tightly couples the CLI to a specific browser, fails for headless / CI / SSH-only users. |
| **Magic link email** | Adds email-delivery infrastructure (PR-V1-A §1.2 already rejected this for browser auth). |
| **Custom OAuth client with PKCE** | Adds a real OAuth client registration on every developer machine. Device-code is the GitHub-recommended pattern for `gh auth login` precisely to avoid this. |

### 1.3 What the device-code flow does NOT do

- It does NOT skip GitHub OAuth. Step 5 still goes through the same server-side GitHub OAuth code-exchange used by browser auth.
- It does NOT issue API tokens (long-lived, header-bearer-style credentials). The session token is the same revoke-by-deleting-a-row opaque ID from PR-V1-A.
- It does NOT support service accounts or CI tokens in v0. CI use cases that don't want device-code are out of scope; a future ADR may add CI tokens with explicit operational gating.

## 2. The 6th command — `opensoyce login` (and `opensoyce logout`)

### 2.1 `opensoyce login`

```text
USAGE:
  opensoyce login [options]

OPTIONS:
  --api-base <url>     Override the public API base URL (already in v0)
  --timeout <ms>       Polling timeout (already in v0)
  --quiet, -q          Suppress non-error stdout (already in v0)
  --json               Emit { user, session_path } as JSON instead of human copy (already in v0)
  --help, -h           (already in v0)

EXIT CODES (reuse v0 vocabulary):
  0  Logged in successfully
  3  Device-code pairing not completed before timeout (NOT_EVALUATED — first-class incomplete state)
  4  Network error / API error
  5  Usage error
```

`login` introduces **no new flags**. The 8th flag (`--workspace`) is the only new flag (§4). The session-file path is not a flag — it lives at a fixed location (§2.3).

### 2.2 `opensoyce logout`

A 7th command. The v0 sub-sketch (#59) locked the count at 5, but the same locks-lift atomicity rule for the 6th command (`login`) covers the 7th (`logout`). Both ship together in PR-V2-D.

```text
USAGE:
  opensoyce logout [options]

BEHAVIOR:
  1. Read the session token from ~/.opensoyce/session.json (if present)
  2. POST /api/vault/cli/logout with the token to delete the server-side session row
  3. Delete ~/.opensoyce/session.json locally
  4. Print "Logged out" (or { logged_out: true } if --json)

EXIT CODES:
  0  Logged out (or already not logged in — idempotent)
  4  Network error reaching the server (but the local file IS deleted; logout is locally complete)
  5  Usage error
```

`logout` is **locally idempotent** — if the server is unreachable, the CLI still deletes the local file. The server-side row's `expires_at` will eventually reap it. This matches the v0 doctrine: network errors never silently leave the user in an undefined state.

### 2.3 Session file location

| Field | Value |
|---|---|
| Path | `~/.opensoyce/session.json` (i.e., `path.join(os.homedir(), '.opensoyce', 'session.json')`) |
| Mode | `0600` (owner read-write only) — set with `fs.chmod` immediately after write |
| Shape | `{ "session_token": "<opaque-id>", "github_login": "<login>", "issued_at": "<iso>", "expires_at": "<iso>", "api_base": "<url>" }` |
| Multi-base support | The file stores `api_base` so the CLI can detect mismatch with `--api-base` flag. Different `api_base` → "session is for `<other-host>`, not `<requested>`; run `opensoyce login` first" error |

PR-V2-D's structural test must assert the session-file writer chmods to `0600` before any subsequent write, and that no log or stderr emission ever includes the `session_token` value.

### 2.4 Session file is NOT XDG-spec

The path is `~/.opensoyce/session.json`, not `$XDG_CONFIG_HOME/opensoyce/session.json`. The simpler home-directory path matches `gh`, `npm`, and `aws-cli`. A future ADR may add XDG support if portability demands it; not in v0.

## 3. The 8th flag — `--workspace <id>`

### 3.1 Where the flag applies

| Command | `--workspace` accepted? | Behavior change when set |
|---|---|---|
| `check <pkg>` | yes | Gate response reflects the workspace's active exceptions per PR-V1-C §1.1. Result `proofAnchors` may include `private-anchor` entries pointing at the applied exception. Exit codes unchanged (0/1/2 still mirror ALLOW/BLOCK/WARN). |
| `lockfile [path]` | yes | Same as `check` for each entry. Network-failure doctrine from PR #60 fix still applies (any failure → EXIT_NETWORK_ERROR). |
| `why <pkg>` | yes | Same as `check` + Vault Timeline events touching the package are interleaved with the public Timeline events. `timelineContext` carries both, ordered by date. |
| `timeline` | yes | List grows to include Vault Timeline events emitted in the workspace. Each event carries its `visibility` field; the CLI renders private events with a `[PRIVATE]` marker prefix. Filters (`--package`, `--pr`) still apply. |
| `trust <owner>/<repo>` | **no** | Per-repo trust posture is workspace-independent. The Dashboard data is public; workspaces don't override it. Setting `--workspace` on `trust` returns USAGE_ERROR. |
| `login` / `logout` | **no** | Auth commands themselves don't address a workspace. |
| `--version` / `--help` | **no** | Meta. |

### 3.2 Behavior when `--workspace` is set but the CLI is not logged in

`EXIT_USAGE_ERROR (5)` with stderr: `"opensoyce login required before --workspace <id>"`. The CLI does not silently fall back to public-only mode; if the user asked for workspace context, they expected it.

### 3.3 Behavior when `--workspace` references a workspace the user is not a member of

The API returns `404` per PR-V1-A §5.4. The CLI surfaces this honestly: stderr `"Workspace not found or you are not a member."` and exit code `5` (USAGE_ERROR — the user supplied a value the server cannot serve them). This preserves the 404-on-non-member doctrine; the CLI never leaks workspace existence.

### 3.4 What `--workspace` does NOT do

- It does NOT change unauthenticated behavior. With no session file, the flag fails fast per §3.2; no API call is made.
- It does NOT promote unauthenticated calls to public-only mode. Asking for `--workspace foo` without a session is a hard error, never a silent downgrade.
- It does NOT enable cross-workspace queries. A user who is a member of workspaces `acme` and `beta` cannot ask `--workspace acme,beta`. Each invocation addresses exactly one workspace.

## 4. Three new exception-management commands

The v0 surface has 5 commands. The Phase 5 extension adds 2 (login + logout in §2) plus 3 exception-management commands.

### 4.1 Locked at 3 exception sub-commands

```text
opensoyce exception list [--state <state>] [--subject <pkg|owner/repo>] [--limit <n>] --workspace <id>
opensoyce exception propose --subject <pkg|owner/repo> --from <action> --to <action> --reason <text> [--expires-at <iso>] --workspace <id>
opensoyce exception revoke <exception_id> --reason <text> --workspace <id>
```

`--workspace` is required on every `exception` subcommand. Omitting it is a USAGE_ERROR.

### 4.2 The deliberately-missing commands

| Missing | Why |
|---|---|
| `exception approve` | Approval is the four-eye gate from PR-V1-C §3.1. A reviewer who approves an exception via terminal could bypass the visual review surface (the diff between the proposal and the approval is rendered in a UI for human review; terminal flows skip that). The Vault Dashboard UI (PR-V2-E) is the only approval surface in v0. |
| `exception reject` | Same logic. Rejection is a recorded reviewer decision; the four-eye principle's intent is that the rejection rationale gets visual review. |
| `exception extend` | Same logic. Extension is structurally identical to a new approval (PR-V1-C §1.2 stay-on-row semantics) — a fresh review surface should accompany it. |
| `exception withdraw` (proposer withdraws own) | Could ship in CLI, but kept UI-only in v0 to match the symmetric scope of approve/reject/extend. A withdrawal is a state transition; the same "decisions get UI rendering" rule applies. |

### 4.3 Why `revoke` IS in the CLI

`revoke` differs from `extend`/`approve`/`reject` because it's a **safety operation**: the workspace decided an active exception is wrong and wants it gone NOW. The CLI is the right tool for incident response: a reviewer at 3am SSH'd into prod doesn't want a UI; they want one command. The four-eye principle is less load-bearing here because revoking is conservative (it tightens the gate, never loosens it).

### 4.4 `propose` from the CLI

A proposal is a non-state-mutating action from the gate's perspective — it doesn't change any gate decision. A member proposing via CLI is identical to a member proposing via UI; the proposal then waits for reviewer action. CLI proposal lowers the friction for engineers who want to file a proposal mid-investigation without context-switching to a browser.

### 4.5 Output shape

| Format | Default | `--json` |
|---|---|---|
| `list` | Tabular: `state action subject reviewer expires_at` (one row per exception) | Array of `Exception` records from PR-V1-D §3.3 |
| `propose` | "Proposed exception `<id>`; awaiting reviewer action." | `Exception` record with state=`proposed` |
| `revoke` | "Revoked exception `<id>`." | `Exception` record with state=`revoked` |

Exit codes reuse the v0 vocabulary (`0` for success, `4` for network error, `5` for usage error).

## 5. Vault Timeline access via `--workspace`

Resolved per the plan note: `timeline` accepts `--workspace`. This reconciles the apparent conflict between the plan's §4 (which excluded `timeline`) and §6 (which extended it).

### 5.1 With `--workspace <id>`

The `timeline` command output includes:

- All public Timeline events from `src/shared/trustTimeline.js` (matching filters, same as v0)
- All Vault Timeline events from `/api/vault/workspaces/<id>/timeline` (matching filters)

Sorted together by date, newest first (matching the read API's default ordering from PR-V1-D §3.4).

### 5.2 Rendering distinction

Vault Timeline events render with a `[PRIVATE]` marker as the first chunk of the rendered line:

```text
2026-06-12  [PRIVATE] exception_approved   --        --        Approved exception on ua-parser-js@0.7.29: BLOCK → WARN ...
2026-06-01            decision_change      PR #28    392b1df   OSV severity normalization ...
2026-05-31            evidence_capture     PR #20    bff98ae   First verbatim capture ...
```

`--json` mode emits the `visibility` field on Vault events (`"visibility": "private"`) and omits it from public events — matching the surface contract from PR-V1-D §5.

### 5.3 Without `--workspace`

`timeline` behaves identically to CLI v0. No Vault events are fetched (no auth call is even attempted). Byte-for-byte v0 compatibility per Rule 7.

## 6. CLI evidence model for workspace mode

PR-V1-A §6.1 defined `CliEvidence`. Workspace mode extends the shape with **one optional field**:

```text
CliEvidence {
  command, query, action, firedPatterns, proofAnchors, exitCode, fetchedAt, apiBase  -- v0
  workspaceContext?: {                                                                -- new in V1-E
    workspaceId:    string                          // the workspace slug
    appliedExceptionIds: string[]                   // 0..N exception IDs that affected the action
    visibility:     "private"                       // always
  }
}
```

### 6.1 Field semantics

- Present **only** in workspace-mode responses (i.e., when `--workspace` was set on a gate-driven command).
- Absent on all other responses.
- Carries `visibility: "private"` to match the Vault data shape (this is the Phase 5 atomic visibility-field lift in action — only present on Vault-attributable shapes).
- `appliedExceptionIds` is empty when the workspace had no matching exception (the public gate result stood unchanged); non-empty when one or more exceptions downgraded the action.

### 6.2 What `workspaceContext` does NOT do

- Does not carry `reasonPublic` or `reasonPrivate` — those live in the Exception records, fetched separately via `exception list` if needed.
- Does not carry the action delta. The `action` field already reflects the post-exception value; the caller compares against what they would have gotten without `--workspace` if they want to see the delta.
- Does not promote to public output. Even in `--json` mode, this field is part of the workspace-scoped response and is governed by the same anti-public-leak rules as the rest of the Vault data.

## 7. Atomic v0-locks lift in PR-V2-D

The CLI v0 sub-sketch (#59) locked the surface at 5 commands + 7 flags. PR-V2-D atomically lifts both locks in one commit:

| Step | What changes |
|---|---|
| 1 | `packages/cli/src/args.ts` adds the 8th flag (`--workspace`); rejects it on `trust` / `login` / `logout` / `version` / `help` |
| 2 | `packages/cli/src/commands/` grows from 5 modules to 7: + `login.ts`, + `logout.ts`, + `exception/` (with `list.ts`, `propose.ts`, `revoke.ts`) — counts as 1 logical command with 3 sub-commands |
| 3 | `scripts/test-cli-v0.mjs` (or its successor) updates the structural assertions: command count 5→7; flag count 7→8 |
| 4 | The Trust Vault ADR §7.1 reference table is annotated (in a separate doc-fix line of the same PR) noting "v0 locks lifted in PR-V2-D" |

No earlier PR may touch CLI source. PR-V2-A (auth + workspace foundation), PR-V2-B (exception state machine + API), and PR-V2-C (private proof-anchor + Vault Timeline reads) all leave `packages/cli/` untouched. The CLI structural test from PR #60 keeps asserting the 5/7 surface until PR-V2-D's commit lifts both numbers in lockstep.

## 8. Public-spine isolation invariants for CLI

Extends PR-V1-D §7.4 with CLI-specific assertions PR-V2-D adds:

1. `packages/cli/src/commands/check.ts`, `lockfile.ts`, `trust.ts`, `timeline.ts`, `why.ts` (the v0 commands) NEVER import from a `vault/` path or any module that surfaces `workspaceContext`. They may import the new `--workspace`-gated branch only via a shared module that itself imports the vault path; the structural test enforces the wrapper-only rule.
2. `packages/cli/src/commands/login.ts`, `logout.ts`, and `packages/cli/src/commands/exception/*.ts` ARE allowed to import vault paths. These are the workspace-mode modules.
3. Default (no `--workspace`, no session file) execution NEVER reads `~/.opensoyce/session.json`. The CLI must not even check for its existence unless an authenticated command was invoked.
4. CLI v0 mode (any v0 command invoked without `--workspace`) NEVER makes a request to `/api/vault/*`. Structural test asserts via a grep against the api-base derivation: only `/api/compliance-gate` and (in v0) `/api/timeline` (or equivalent) are reachable without auth.
5. The session-file write code path is grep-asserted to call `fs.chmod(..., 0o600)` immediately after `fs.writeFile`. A test that grants the file a different mode fails the assertion.
6. The `session_token` value is grep-asserted to never appear in stdout, stderr, or telemetry. PR-V2-D's structural test reads all CLI source files and rejects any literal `session_token` usage outside the session-file IO path and the device-code poller.

## 9. What PR-V2-D may implement

Authorized scope:

- `opensoyce login` and `opensoyce logout` command modules with the device-code flow per §1.1.
- The `--workspace <id>` flag in `args.ts` per §3.
- The three `exception` subcommands (`list`, `propose`, `revoke`) per §4.
- The Vault Timeline interleave logic in `timeline` per §5.
- The session-file IO at `~/.opensoyce/session.json` (mode `0600`) per §2.3.
- The `workspaceContext` field on `CliEvidence` per §6.
- The atomic v0-locks lift (5→7 commands, 7→8 flags) per §7.
- The structural test extensions (§8 invariants 1–6).
- Documentation updates to `packages/cli/README.md` and `docs/cli.md` describing the new commands. Hygiene window expands.

## 10. What PR-V2-D must NOT implement

- The Vault Dashboard UI — that's PR-V2-E.
- `exception approve` / `exception reject` / `exception extend` / `exception withdraw` commands (§4.2 four-eye protection).
- Any change to v0 mode behavior (every v0 command invoked without `--workspace` and without `~/.opensoyce/session.json` is byte-for-byte identical to today's behavior).
- Any new badge variant or change to `src/server/badge/`.
- Any change to the public Trust Center, public Dashboard, public Timeline, gate page, or `/api/compliance-gate` shape.
- The `validate_proof_anchors` Postgres function (that's PR-V2-C).
- The session table migration (already in PR-V2-A scope per PR-V1-B §2.4).
- Any banned-substring vocabulary lift beyond what PR-V2-C already shipped (`visibility` field on Vault shapes).
- The Phase 5 closeout doc — that's PR-V3.

## 11. What this sub-sketch does NOT do

- Does not authorize PR-V2-D. The user explicitly approves PR-V2-D before any code lands.
- Does not change source code.
- Does not change `package.json`.
- Does not change any test.
- Does not implement any auth / session / Vault routes.
- Does not introduce any new banned-substring vocabulary.
- Does not lift any banned-substring vocabulary entry (including the `visibility` field — that lift remains atomic to PR-V2-C).
- Does not touch the legacy SOC 2 deferral.
- Does not introduce VEX / reachability / sandbox / remediation / drop-in / AI-agent / agentic framing.
- Does not touch the candidate-pipeline arc.
- Does not authorize the `hn-exploits-log.json` cleanup.
- Does not authorize the doctrine update PR (frontline framing for Phase 6/7 in the roadmap) — that's its own future PR, recommended after this one merges.

## 12. Status

**Proposed.** Awaiting explicit user decision before PR-V2-A (auth + workspace foundation implementation) begins.

This is **the last of the five Phase 5 sub-sketches.** After it merges, the Phase 5 implementation arc opens.

Docs only. No application code, no `package.json` change, no migration, no test change, no banned-substring vocabulary lifted.

Recommended next PR after this merges:

**PR-V2-A — `feat(vault): add auth + workspace foundation`** (per Trust Vault ADR §9.2)

Recommended, not pre-authorized. The user calls "approve PR-V2-A" with explicit scope before any code lands.

---

> The CLI extension is additive. The v0 surface stays whole as `cli v0 mode`.
> Device-code in. `--workspace` along the gate path. `exception list / propose / revoke` for read-and-conservative-write only.
> Approve / reject / extend stay in the UI where four eyes can render the decision.
