# Sub-Sketch: Vault Exception State Machine + API (Phase 5, PR-V1-C)

**Status:** Proposed (this sub-sketch)
**Date:** 2026-06-07
**Phase:** 5 — Trust Vault (sub-sketch PR-V1-C per the [Trust Vault ADR](./trust-vault-architecture-adr.md) §9.1)
**Type:** Docs-only sub-sketch. No application code, no `package.json` changes, no test changes, no migrations, no routes, no banned-substring vocabulary lifted.

**Predecessors:**

- [Trust Vault ADR](./trust-vault-architecture-adr.md) (#67) — §1.2 (Exception shape), §4 (lifecycle states + matrix)
- [Vault Auth + Workspace Sub-Sketch](./vault-auth-workspace-sub-sketch.md) (#69) — §5 (RBAC permissions), §2 (session cookie), §6 (Vault route family)
- [Vault Persistence Layer Sub-Sketch](./vault-persistence-layer-sub-sketch.md) (#70) — §2.6 (`vault_exceptions` table), §2.7 (`vault_timeline_events`)

This sub-sketch refines the exception lifecycle, the mutating API surface, the race-condition rules, and the CSRF mechanism into something an implementation PR (PR-V2-B) can build against without re-litigating the doctrine. It does NOT decide private proof-anchor (PR-V1-D), CLI workspace extension (PR-V1-E), or the Vault Dashboard UI (PR-V2-E).

## 0. Inherited doctrine (non-negotiable)

From Trust Vault ADR §0 + §4.2:

> 1. Public trust record shows what can be shared.
> 2. Trust Vault stores what must be controlled.
> 3. Exceptions are allowed decisions, not erased risk.
> 4. Exceptions are permissive only: they DOWNGRADE gate actions. `BLOCK → WARN/ALLOW`; `WARN → ALLOW`. Cannot upgrade severity. Cannot survive `expiresAt`.

This sub-sketch's specific addition:

> 5. **State changes are atomic, audited, and idempotent.** Every transition emits a Vault Timeline event. Every mutation tolerates a network retry without producing two of the same effect.

## 1. Concrete lifecycle transitions

The state machine from Trust Vault ADR §4.1, made concrete.

### 1.1 State diagram

```text
                  ┌───────────────────────────────────────────────┐
                  │                                               │
  (new)           ▼                                               │
  PROPOSAL ─► proposed ─reviewer-approves─► active ─wall-clock─► expired
                  │                          │
                  ├─reviewer-rejects─► rejected (terminal)
                  │
                  └─proposer-withdraws─► rejected (terminal)

                                              │
                                              └─reviewer-revokes─► revoked (terminal)

                                              ┌─reviewer-extends─► active (new expires_at)
                                              │   (no state change; expires_at updated in place;
                                              │    Vault Timeline event "exception_extended")
                                              └─
```

| From | To | Trigger | Required role | Side effect |
|---|---|---|---|---|
| (none) | `proposed` | `POST /api/vault/workspaces/:slug/exceptions` | any workspace member | emits `exception_proposed` event |
| `proposed` | `rejected` | reviewer rejects | `reviewer` or `owner` | terminal; emits `exception_rejected` |
| `proposed` | `rejected` | proposer withdraws own proposal | proposer (any role) | terminal; emits `exception_rejected` (with `rejection_kind = 'withdrawn'`) |
| `proposed` | `active` | reviewer approves with `expires_at` + `reason_public` | `reviewer` or `owner` | emits `exception_approved` |
| `active` | `expired` | wall-clock passes `expires_at` | (no actor; background reaper) | emits `exception_expired` |
| `active` | `revoked` | reviewer revokes | `reviewer` or `owner` | terminal; emits `exception_revoked` |
| `active` | `active` (same row) | reviewer extends `expires_at` | `reviewer` or `owner` | row updated in place; emits `exception_extended` |

### 1.2 Terminal vs non-terminal

| State | Terminal? | Meaning |
|---|---|---|
| `proposed` | no | Awaiting reviewer action |
| `active` | no | Currently downgrading gate action for the subject; can be revoked or extended |
| `rejected` | yes | Decision recorded; never returns to flight |
| `revoked` | yes | Decision reversed; never returns to flight |
| `expired` | yes | Wall-clock expired the exception; never returns to flight |

**There is no "renew" operation.** An expired or revoked exception is not reactivated. The reviewer files a new exception (a new row, a new ID, a new audit trail). This protects the audit chain from being mutated invisibly.

### 1.3 What a state never does

- A state never transitions backward.
- A state never moves between two terminal states (`rejected` → `revoked` is not a transition; you cannot revoke a rejected proposal).
- A state never changes without emitting a Vault Timeline event.
- A state never changes silently — every mutation API returns the post-transition row (or 409 if the requested transition was rejected by state).

## 2. POST / PATCH / DELETE API shapes

### 2.1 Route family

All endpoints live under `/api/vault/workspaces/:slug/exceptions/*` and inherit:

- Session cookie auth (PR-V1-A §2.1).
- 404-on-non-member (PR-V1-A §5.4).
- `Cache-Control: private, no-store, no-cache, must-revalidate` (PR-V1-A §6.2).
- `Vary: Cookie`.
- CSRF token on mutating methods (POST/PATCH/DELETE; see §5).

| Route | Verb | Role required | Body |
|---|---|---|---|
| `/api/vault/workspaces/:slug/exceptions` | `GET` | `member`+ | (none) — list |
| `/api/vault/workspaces/:slug/exceptions/:id` | `GET` | `member`+ | (none) — single |
| `/api/vault/workspaces/:slug/exceptions` | `POST` | `member`+ | `ExceptionProposal` |
| `/api/vault/workspaces/:slug/exceptions/:id/approve` | `POST` | `reviewer`+ | `ExceptionApproval` |
| `/api/vault/workspaces/:slug/exceptions/:id/reject` | `POST` | `reviewer`+ OR proposer | `{ "kind": "reviewer" \| "withdrawn", "reason": string }` |
| `/api/vault/workspaces/:slug/exceptions/:id/revoke` | `POST` | `reviewer`+ | `{ "reason": string }` |
| `/api/vault/workspaces/:slug/exceptions/:id/extend` | `POST` | `reviewer`+ | `{ "expires_at": iso-string, "reason"?: string }` |
| `/api/vault/workspaces/:slug/exceptions/:id` | `PATCH` | proposer (own row, while `proposed`) | partial `ExceptionProposal` |
| `/api/vault/workspaces/:slug/exceptions/:id` | `DELETE` | n/a | **forbidden — see §2.6** |

### 2.2 Request shapes

```text
ExceptionProposal {
  subject:              PackageSubject | RepoSubject     // same shape as Trust Vault ADR §4.3
  original_action:      "BLOCK" | "WARN"
  allowed_action:       "WARN" | "ALLOW"                 // must satisfy downgrade-only rule
  reason_public:        string (1..280)
  reason_private?:      string (0..10_000)
  proof_anchors:        TrustProofAnchor[]               // ≥1, see PR-V1-B §6.1
  proposed_expires_at?: iso-string                        // a suggestion; reviewer's approval can override
  idempotency_key?:     string (≤128 chars)              // see §7
}

ExceptionApproval {
  expires_at:           iso-string                        // required, in the future, ≤ 1 year out (see §1.3 of §3 below)
  reason_public:        string (1..280)                  // may override the proposal's reason_public
  reason_private?:      string (0..10_000)
  approval_note?:       string (≤280)
  idempotency_key?:     string (≤128 chars)
}
```

### 2.3 Response shapes

Every successful response returns the canonical `Exception` row (the database shape from PR-V1-B §2.6, with `reason_private` masked for `member`-role viewers):

```text
Exception {
  exception_id: uuid
  workspace_id: uuid
  subject: { kind: "package", name: string, version_set: ... }
         | { kind: "repo",    owner: string, repo: string }
  state: "proposed" | "active" | "rejected" | "revoked" | "expired"
  original_action: "BLOCK" | "WARN"
  allowed_action: "WARN" | "ALLOW"
  proposed_by: { user_id, github_login, display_name }
  proposed_at: iso-string
  reviewed_by?: { user_id, github_login, display_name }
  reviewed_at?: iso-string
  expires_at?: iso-string
  reason_public?: string
  reason_private?: string                                // omitted for member-role viewers
  proof_anchors: TrustProofAnchor[]
  revoked_at?: iso-string
  revoked_by?: { user_id, github_login, display_name }
  revoke_reason?: string
  proof_anchors_url: string                              // /api/vault/workspaces/:slug/exceptions/:id/anchors
}
```

### 2.4 Status codes

| Code | Meaning | Body shape |
|---|---|---|
| `200 OK` | Successful read or successful idempotent retry | `Exception` |
| `201 Created` | New proposal accepted | `Exception` |
| `204 No Content` | (not used; every successful mutation returns the row) | — |
| `400 Bad Request` | Malformed payload, bad subject, downgrade-only violation, invalid `expires_at` | `ApiError` |
| `401 Unauthorized` | No session cookie | `ApiError` |
| `403 Forbidden` | Authenticated, but insufficient role | `ApiError` |
| `404 Not Found` | Non-member on the workspace, OR exception_id doesn't exist in the workspace, OR workspace doesn't exist | `ApiError` (workspace existence is hidden per the 404 doctrine) |
| `409 Conflict` | State machine refused the transition (e.g., approve an already-active exception, revoke an expired one) | `ApiError` with the current state echoed |
| `412 Precondition Failed` | `If-Match` etag mismatch (see §4.4) | `ApiError` |
| `415 Unsupported Media Type` | Non-JSON content type on mutating routes | `ApiError` |
| `422 Unprocessable Entity` | Valid JSON, valid shape, but business rule rejected (e.g., proof_anchors empty by way of the JSONB CHECK function) | `ApiError` |
| `429 Too Many Requests` | Per-workspace rate-limit tripped | `ApiError` + `Retry-After` |
| `500 Internal Server Error` | Unexpected | `ApiError` |
| `503 Service Unavailable` | Vault DB unreachable | `ApiError` + `Retry-After` |

### 2.5 Error shape

```text
ApiError {
  error: string                  // stable kebab-case code, e.g. "downgrade-only-violation"
  message: string                // human-readable
  current_state?: string         // present on 409 (state-machine refusal)
  current_etag?: string          // present on 412
  hint?: string                  // optional next-step suggestion (e.g. "POST .../revoke instead")
}
```

The `error` codes are part of the API contract. They are stable across versions; renaming requires a sub-sketch revision PR.

### 2.6 DELETE is forbidden

There is no DELETE endpoint on exceptions. Per Trust Vault ADR §1.2 + §4.4: "An exception cannot be rewritten in place. Editing produces a new exception record; the old one is `revoked`. Audit trail intact."

This is the same doctrine that produced the persistence-layer "no admin force-delete" rule (PR-V1-B §7). The Vault keeps every state transition; the API has no way to delete an exception_id. A workspace that no longer wants an exception calls `/revoke` — the row stays in the database with state `revoked`.

If a future ADR adds a hard-delete pathway (e.g., for legal compliance with right-to-erasure regulation), it requires a new ADR. v0 does not anticipate it.

## 3. Who may propose, approve, reject, revoke, extend, expire

Cross-referencing PR-V1-A §5.2's permission map.

| Action | Roles permitted | Additional rule |
|---|---|---|
| **propose** | `member`, `reviewer`, `owner` | `member` may propose but not self-approve |
| **approve** | `reviewer`, `owner` | reviewer cannot approve their own proposal (see §3.1) |
| **reject (as reviewer)** | `reviewer`, `owner` | always permitted on `proposed` rows in the same workspace |
| **reject (as proposer withdrawal)** | the original proposer (any role) | only on `proposed`; transitions to `rejected` with `rejection_kind = 'withdrawn'` |
| **revoke** | `reviewer`, `owner` | only on `active`; reviewer can revoke any active exception including ones they personally approved |
| **extend** | `reviewer`, `owner` | only on `active`; reviewer can extend any active exception including ones they personally approved |
| **expire** | (background only) | reaper job; no actor; scheduled per PR-V1-B §4.1 |

### 3.1 Four-eye principle (proposer ≠ approver)

A `reviewer` who proposed an exception **cannot approve their own proposal**. The approve endpoint returns `403 Forbidden` with `error: "self-approval-forbidden"`.

A `owner` proposer CAN self-approve. Owners are workspace administrators and can unilaterally act; the four-eye principle is opt-in via reviewer role.

Rationale: a `reviewer` is the worker-bee role. The "four-eye" requirement protects against a single reviewer pushing through their own exception without peer review. An `owner` is the administrator; they own the trust posture for the workspace and can unilaterally bypass the four-eye for their own decisions. Workspaces that want strict four-eye on owners can simply ensure every owner is also a reviewer of a different workspace and propose from one but not the other — the rule is by-row, not by-account.

### 3.2 What permission checks the API NEVER does

- Cannot extend `member` to write exceptions by special-casing user lists. The role-to-permission map is enforced at every endpoint; no per-user grants.
- Cannot let a reviewer act on exceptions in a different workspace by header/parameter override. The `workspace_id` is always the URL parameter; no override.
- Cannot use API tokens to bypass role checks. Session cookie identifies the user; the role lookup is fresh on every request.

## 4. Race-condition handling

Four named races, each with a documented rule.

### 4.1 Double approval

**Scenario:** Two reviewers click "Approve" within the same second on the same `proposed` exception.

**Rule:** The first request to win the database row-lock transitions the state to `active` and emits `exception_approved`. The second request sees `state = active` and returns `409 Conflict` with `current_state: "active"` and `hint: "exception already approved; revoke + propose new if you want to change terms"`.

**Implementation cue (informational):** Postgres `UPDATE vault_exceptions SET state = 'active', ... WHERE exception_id = $1 AND state = 'proposed' RETURNING ...` — the second request sees `RETURNING` empty and infers the race.

### 4.2 Expiry during approval

**Scenario:** A reviewer reviews a `proposed` exception, the reaper marks it `expired` (if it had previously been `active` — actually no, `proposed` doesn't have `expires_at` set yet). The race is on the freshly-approved row: a reviewer sets `expires_at: now + 5min` then the reaper looks at the row 4 seconds later.

**Rule:** Approve sets `state = active` and `expires_at` atomically. The reaper only transitions `active → expired` when `expires_at < now()`. A 5-minute exception is fine; it'll be `active` for ~5 minutes then become `expired`. No race possible because `expires_at` is in the future at the time the row commits.

**Edge case:** Reviewer sets `expires_at` to a past time (clock skew, typo). The API validates `expires_at > now() + 60 seconds` and rejects with `400 Bad Request, error: "expires-at-in-past"`. The 60-second buffer absorbs clock skew between API server and reviewer.

### 4.3 Revoke during extension

**Scenario:** Reviewer A clicks "Extend" while reviewer B clicks "Revoke" on the same `active` exception.

**Rule:** Both endpoints use the same row-lock. The first to commit wins:

- If extend wins: row transitions to `active` with new `expires_at`; emits `exception_extended`. The revoke request sees the new `expires_at` and proceeds to revoke it; emits `exception_revoked`. Net result: extended-then-revoked, two Timeline events. Both are honest records.
- If revoke wins: row transitions to `revoked`; emits `exception_revoked`. The extend request sees `state = revoked` and returns `409 Conflict` with `hint: "exception was revoked; propose a new one if you want continued coverage"`.

This race is not a bug; it's a recorded sequence. The Vault preserves both events.

### 4.4 Optimistic concurrency via `If-Match`

To allow clients to detect changes-since-read explicitly, every mutating endpoint accepts (and recommends) an `If-Match` header containing the exception row's `etag`. The etag is computed as the SHA-256 of `(exception_id, state, expires_at, reason_public_hash, reviewed_at)` — anything that affects what the client just saw.

| Header | Effect |
|---|---|
| `If-Match` present + matches current etag | Proceed normally |
| `If-Match` present + mismatch | `412 Precondition Failed` with `current_etag` echoed |
| `If-Match` absent | Proceed (best-effort; doesn't catch concurrent edits) |

The implementation PR (PR-V2-B) decides whether `If-Match` is required or optional. The sub-sketch recommends **strongly recommend for clients; not required by the server**. This balances developer ergonomics against client correctness.

### 4.5 Last reviewer or owner leaves while an exception is in flight

**Scenario:** Reviewer A proposes an exception. Reviewer A is then removed by an owner. Now Reviewer A's `proposed` exception sits in the queue with no reviewer to approve, and Reviewer A has no access to withdraw.

**Rule:**

- Removed reviewers see the workspace return `404` (per the membership doctrine). They cannot withdraw their own exceptions.
- Remaining reviewers and the owner CAN reject the orphan proposal.
- If the workspace has zero remaining reviewers, the owner can either:
  - Reject all pending proposals, OR
  - Promote a member to reviewer, who then handles the queue.
- The owner can never leave (PR-V1-A §4.2: every workspace has ≥1 owner at all times). So there is always at least one user who can resolve orphan proposals.

The Vault Timeline event from the original proposal (`exception_proposed`, `emitted_by = <removed-reviewer-userId>`) stays intact. The removal does not erase prior actions.

## 5. CSRF mechanism

Trust Vault ADR §2.1 deferred this decision to "PR-V1-C since it's the first sub-sketch with state changes." Decided here.

### 5.1 Choice: double-submit cookie

| Aspect | Decision |
|---|---|
| Mechanism | Double-submit cookie (a CSRF token in a cookie + the same token echoed in a request header) |
| Cookie name | `opensoyce_vault_csrf` |
| Cookie attributes | `Secure`, `SameSite=Lax`, **not** `HttpOnly` (the client must read it to echo into a header) |
| Header name | `X-OpenSoyce-Vault-CSRF` |
| Token shape | Cryptographically-random 32-byte hex string |
| Token lifecycle | Rotated on every session login; static for the session lifetime |
| Validation | The server compares the cookie value against the header value; both must equal; both must be non-empty |
| Applies to | All `POST` / `PATCH` / `DELETE` to `/api/vault/*` (note: even though §2.6 says no DELETE on exceptions, other Vault DELETE routes may exist in later sub-sketches) |
| Does NOT apply to | `GET` (idempotent and read-only); auth endpoints (`/api/vault/auth/login` doesn't have a session yet; uses GitHub OAuth state instead) |

### 5.2 Rejected alternatives

| Candidate | Rejected because |
|---|---|
| **Per-form CSRF token** (synchronous form pattern) | The Vault UI is largely SPA-driven; per-form tokens add friction without the security gain `SameSite=Lax` already provides. |
| **`SameSite=Strict` cookie + no CSRF token** | `Strict` breaks cross-origin auth callbacks. The session cookie is `SameSite=Lax`. CSRF token closes the gap. |
| **Synchronizer token in a hidden field** | Same as per-form; SPA-unfriendly. |
| **No CSRF (rely on origin checks)** | Origin checks alone are insufficient when CORS is broad. Defense in depth. |
| **CSRF token only for `reviewer`+ writes** | Inconsistent; easier to require everywhere than to maintain a partial list. |

### 5.3 Failure mode

| State | Response |
|---|---|
| Cookie missing | `403 Forbidden`, `error: "csrf-missing-cookie"` |
| Header missing | `403 Forbidden`, `error: "csrf-missing-header"` |
| Cookie ≠ header | `403 Forbidden`, `error: "csrf-mismatch"` |
| Either empty | `403 Forbidden`, `error: "csrf-empty"` |

The error codes are stable. The implementation PR's structural-invariants test asserts that every mutating handler under `/api/vault/*` is fronted by the CSRF middleware.

### 5.4 Token rotation

A token rotates whenever:

- A session is freshly established (login).
- The user explicitly logs out and back in.

A token does NOT rotate per-request (would break parallel form submissions). It does NOT rotate per-role-change (the role is checked separately; CSRF protects against forgery, not authorization).

## 6. Audit-event emission into `vault_timeline_events`

Every state transition emits exactly one Vault Timeline event. The mapping:

| State transition | `event_type` | `subject_exception_id` | `emitted_by` | Summary template (truncated to 280 chars) |
|---|---|---|---|---|
| `(none) → proposed` | `exception_proposed` | the new row | proposer | "Proposed exception on `<subject>`: `<original> → <allowed>`. Reason: `<reason_public>`." |
| `proposed → active` | `exception_approved` | the row | approver | "Approved exception on `<subject>`: `<original> → <allowed>` until `<expires_at>`. Reason: `<reason_public>`." |
| `proposed → rejected` (reviewer) | `exception_rejected` | the row | reviewer | "Rejected exception on `<subject>`. Reviewer reason: `<reason>`." |
| `proposed → rejected` (withdrawn) | `exception_rejected` | the row | proposer | "Withdrew own exception proposal on `<subject>`." |
| `active → revoked` | `exception_revoked` | the row | reviewer | "Revoked exception on `<subject>`: `<original> → <allowed>`. Revoke reason: `<reason>`." |
| `active → expired` | `exception_expired` | the row | (null `emitted_by`) | "Exception expired on `<subject>` at scheduled `<expires_at>`." |
| `active → active` (extend) | `exception_extended` | the row | reviewer | "Extended exception on `<subject>` to new `<expires_at>`." |

### 6.1 Emission discipline

- The Vault Timeline event row is inserted in the **same SQL transaction** as the exception row's state mutation. Either both rows commit, or neither does. The implementation uses Postgres `AFTER UPDATE` / `AFTER INSERT` triggers per PR-V1-B §3.4.
- The event row's `visibility` column is always `'private'` (PR-V1-B §2.7 SQL CHECK).
- Summary copy is subject to the linking-page hygiene vocabulary. Banned-substring and Phase-4 banned-vocabulary checks (PR-V2-B will extend the Trust Center hygiene test).

### 6.2 What events do NOT emit to

- Vault Timeline events do NOT appear on the public `/proof/timeline`.
- They do NOT appear in the CLI v0 `opensoyce timeline` output.
- They do NOT contribute to badge rendering.
- They do NOT affect the public Dashboard.

The Vault Timeline is workspace-private. It is its own surface.

## 7. Idempotency and request replay

### 7.1 The `idempotency_key` field

Every mutating POST accepts an optional `idempotency_key`. The implementation:

- Stores a `(workspace_id, idempotency_key, exception_id, response_snapshot)` tuple in a side table (proposed name: `vault_idempotency_keys`; PR-V2-B adds it as migration `0012_*`).
- On retry: if the key matches, return the stored response with the original status code. The state machine is NOT re-evaluated.
- Idempotency-key TTL: 24 hours. Older retries get evaluated fresh.

### 7.2 Why optional, not required

A CI pipeline that retries on network errors benefits from idempotency. A human clicking "Approve" twice in a UI does not need it (the second click hits a `409 Conflict` from the state machine; that's the natural deduplication).

### 7.3 What idempotency keys do NOT do

- They do NOT bypass authorization. A different user retrying with the same idempotency key gets `403 Forbidden`.
- They do NOT extend the lifetime of an expired exception. If the original key produced an `active` exception that has since `expired`, the retry returns the snapshot showing `active` — but a subsequent fresh read shows `expired`. The snapshot is the historical truth; the live state is the present.
- They do NOT collide across workspaces. The key is scoped to `(workspace_id, idempotency_key)`.

## 8. What PR-V2-B may implement

Per the Trust Vault ADR §9.2 and this sub-sketch:

- The eight mutating API endpoints from §2.1 (including GET endpoints).
- The `Exception` response shape from §2.3 (with `reason_private` masking by role).
- The eight error codes from §2.5 + the documented status-code mapping.
- The CSRF middleware from §5 (and the new `opensoyce_vault_csrf` cookie).
- The optimistic-concurrency `If-Match` / etag computation from §4.4.
- The `vault_idempotency_keys` migration (`0012_*`) and its retention reaper.
- The Postgres trigger functions that emit `vault_timeline_events` per §6.
- Extensions to `scripts/test-vault-persistence-v0.mjs` (or a new `scripts/test-vault-exception-api-v0.mjs`) enforcing:
  - Every `/api/vault/workspaces/:slug/exceptions*` mutating handler is fronted by the CSRF middleware (grep-asserted).
  - Every mutating handler validates the state-machine transition before mutating (grep-asserted: the SQL update has a `WHERE state = ...` clause).
  - Every successful mutation emits a Vault Timeline event in the same transaction (asserted by integration test in a fresh ephemeral Postgres).
  - Self-approval returns `403` with `error: "self-approval-forbidden"`.
  - Downgrade-only violations return `400` with `error: "downgrade-only-violation"`.
  - `expires_at` in the past returns `400` with `error: "expires-at-in-past"`.
  - DELETE on an exception row returns `405 Method Not Allowed`.

## 9. What PR-V2-B must NOT implement

- The `visibility`-field lift on public Trust Center / Dashboard / Timeline / CLI / Badge shapes. That lift is **atomic to PR-V2-C** per Trust Vault ADR §5.3.
- The CLI v0 5-command / 7-flag locks. That lift is **atomic to PR-V2-D** per Trust Vault ADR §7.1.
- The private proof-anchor route (`/api/vault/.../anchors`). Ships in PR-V2-C.
- The Vault Timeline read API and rendering surfaces. Ships in PR-V2-C (the Timeline event ROWS are written here; the read API is later).
- The CLI workspace extension. Ships in PR-V2-D.
- The Vault Dashboard UI. Ships in PR-V2-E.
- Any change to the public spine surfaces, the candidate-pipeline arc, or the legacy SOC 2 deferral.
- Any banned-substring vocabulary lift.
- Any administrative force-delete pathway for exceptions.
- Any "renew" endpoint that resurrects an expired or revoked exception.

## 10. What this sub-sketch does NOT do

- Does not authorize PR-V2-B. The user explicitly approves PR-V2-B before any code lands.
- Does not change source code.
- Does not change `package.json`.
- Does not change any test.
- Does not create any database table or migration.
- Does not implement any auth, session, or CSRF mechanism.
- Does not register any new route.
- Does not implement any UI.
- Does not authorize PR-V1-D, PR-V1-E, or any implementation PR.
- Does not lift any banned-substring vocabulary entry.
- Does not lift the `visibility`-field guard on public shapes.
- Does not lift CLI v0 locks.
- Does not touch the legacy SOC 2 deferral.
- Does not introduce VEX / reachability / sandbox / remediation / drop-in / AI-agent / agentic framing.
- Does not touch the candidate-pipeline arc.
- Does not authorize the `hn-exploits-log.json` cleanup.

## 11. Status

**Proposed.** Awaiting explicit user decision before PR-V1-D (private proof-anchor + Vault Timeline surfaces) begins.

Docs only. No application code, no `package.json` change, no migration, no test change, no banned-substring vocabulary lifted.

Recommended next sub-sketch after this merges:

**PR-V1-D — `docs(vault): sketch private proof-anchor + Vault Timeline read surfaces`** (per Trust Vault ADR §9.1)

Recommended, not pre-authorized. The user calls "approve private proof-anchor + Vault Timeline sub-sketch" with explicit scope before any work begins.

---

> Exceptions are allowed decisions, not erased risk.
> Eight endpoints. Five terminal states. One Vault Timeline event per transition.
> The state machine is the contract; the SQL row is the truth; the audit trail is forever.
