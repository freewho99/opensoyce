# Sub-Sketch: Vault Private Proof-Anchor + Vault Timeline Read Surfaces (Phase 5, PR-V1-D)

**Status:** Proposed (this sub-sketch)
**Date:** 2026-06-07
**Phase:** 5 — Trust Vault (sub-sketch PR-V1-D per the [Trust Vault ADR](./trust-vault-architecture-adr.md) §9.1)
**Type:** Docs-only sub-sketch. No application code, no `package.json` changes, no test changes, no migrations, no routes, no banned-substring vocabulary lifted.

**Predecessors:**

- [Trust Vault ADR](./trust-vault-architecture-adr.md) (#67) — §5 (private proof-anchor model), §5.4 (Vault Timeline)
- [Vault Auth + Workspace Sub-Sketch](./vault-auth-workspace-sub-sketch.md) (#69) — §5 (private-reason read split), §5.4 (404-on-non-member doctrine)
- [Vault Persistence Layer Sub-Sketch](./vault-persistence-layer-sub-sketch.md) (#70) — §2.7 (`vault_timeline_events` table), §6 (audit-anchor JSONB shape)
- [Vault Exception State Machine + API Sub-Sketch](./vault-exception-state-machine-api-sub-sketch.md) (#71) — §6 (audit-event emission mapping)

This sub-sketch refines the read surfaces for private proof-anchors and the Vault Timeline. It does NOT decide CLI workspace extension (PR-V1-E) or Vault Dashboard UI (PR-V2-E).

## 0. Inherited doctrine (non-negotiable)

From Trust Vault ADR §0 + §5 + §5.4:

> 1. Public trust record shows what can be shared.
> 2. Trust Vault stores what must be controlled.
> 3. Every vault read is auth-checked.
> 4. Vault Timeline never appears on the public `/proof/timeline` surface.

This sub-sketch's specific additions:

> 5. **Private anchors prove private decisions. They do not become public proof.**
> 6. **Vault Timeline records workspace history. It does not rewrite the public Timeline.**

Every decision below is a corollary of rules 5 + 6.

## 1. Concrete `private-anchor` proofType shape

The Trust Vault ADR §5.1 named the new proofType; PR-V1-B §6.1 said the JSONB shape includes a `visibility` field on private anchors. This section locks the shape.

### 1.1 Shape

```text
PrivateProofAnchor {
  proofType: "private-anchor"                              // literal
  label:     string (1..200)                                // workspace-private; freely chosen by the reviewer
  href:      string                                          // vault-internal path (see §1.2)
  visibility: "private"                                      // REQUIRED on private-anchor; FORBIDDEN on every other proofType
}
```

### 1.2 `href` URL contract

| Pattern | Meaning |
|---|---|
| `/api/vault/workspaces/:slug/evidence/:evidence_id` | Reference a `vault_evidence` row in the same workspace |
| `/api/vault/workspaces/:slug/exceptions/:exception_id` | Reference another exception in the same workspace |
| `/api/vault/workspaces/:slug/timeline/:event_id` | Reference a `vault_timeline_events` row in the same workspace |
| (anything else) | **rejected** at the SQL CHECK level — see §1.4 |

**Cross-workspace `href` is forbidden.** A private-anchor from workspace `A` cannot point at workspace `B`'s evidence even if the same reviewer is a member of both. Cross-workspace pointing would let workspace `A`'s exception body leak `B`'s identity. The rule is enforced by both the URL prefix match AND a runtime check that the URL's `:slug` equals the row's `workspace_id` slug.

### 1.3 What `private-anchor` must NOT do

- Cannot point at an external host (no `https://...`). Implementation grep-asserts.
- Cannot point at the public spine (`/proof/*`, `/projects/*/trust`, `/opensource-trust`, `/patterns`, `/badge/*`). If you want a public reference, use `live-surface` or `doc-anchor` proofType instead — those are public anchor types and never have a `visibility` field.
- Cannot omit `visibility: "private"`. The JSONB CHECK function (PR-V1-B §6.2) rejects.
- Cannot carry `pr` / `sha` fields. Those are only on `proofType: "pr"`.

### 1.4 The `validate_proof_anchors` function (PR-V1-B §6.2) — refined

For PR-V1-B `validate_proof_anchors()` to fully assert the contract, the function checks:

```sql
-- Pseudocode shape; PR-V2-B writes the SQL.
for each anchor in anchors:
  case anchor.proofType
    when 'pr' then assert anchor.pr is positive int and anchor.sha matches /^[0-9a-f]{7,40}$/
                   and anchor.visibility is absent
    when 'live-surface', 'doc-anchor', 'proof-artifact' then
                   assert anchor.visibility is absent
                   assert anchor.href starts with one of the public allowlist prefixes
    when 'private-anchor' then
                   assert anchor.visibility = 'private'
                   assert anchor.href starts with '/api/vault/workspaces/'
                   assert anchor.href's :slug matches the row's workspace_id slug
    else REJECT
```

PR-V2-B writes the actual SQL function in migration `0011_*` or wherever fits the persistence sub-sketch's number sequence.

### 1.5 Lift of the `visibility` field guard — atomic to PR-V2-C

Trust Vault ADR §5.3 said the field guard lift is atomic to the PR that ships private anchors. That PR is **PR-V2-C** per the ADR's §9.2.

What PR-V2-C does in one commit:

1. Updates `OPEN_SOURCE_TRUST_CENTER_BANNED_SUBSTRINGS` (or its sibling guard) so that `visibility` is no longer banned on **Vault shapes** while remaining banned on **public shapes**.
2. Extends the Trust Center hygiene test to assert that `visibility` appears only on Vault data shapes and Vault renderer files — and never on public renderers (`Proof.tsx`, `Home.tsx`, `Layout.tsx` nav slot, `RepoTrustDashboard.tsx`, `OpenSourceTrustCenter.tsx`, badge SVG/JSON, CLI strings/help).
3. Adds the `validate_proof_anchors` SQL function (from §1.4) referenced by every Vault table with `proof_anchors`.
4. Ships the `private-anchor` route handler (§2).

**No earlier PR may introduce `visibility` to any shape.** PR-V2-A (auth + workspace foundation) does not. PR-V2-B (exception state machine + API) does not. PR-V2-C is the atomic step.

## 2. 404 behavior for unauthorized private-anchor reads

Per Trust Vault ADR §5.2: "Following [the href] without auth returns 404 (NOT 401, NOT 403 — 404 to avoid leaking the anchor's existence)."

This section locks the exact response contract.

### 2.1 The route handler decision tree

For `GET /api/vault/workspaces/:slug/evidence/:evidence_id` (and the parallel routes for exceptions/timeline):

```text
1. No session cookie present
   → 401 Unauthorized, ApiError { error: "auth-required" }
   (NOTE: 401 here is the correct response when no session exists at all — the
    distinction from 404 below is that 401 says "log in to even attempt this",
    not "this thing exists or doesn't.")

2. Session present but user has no membership in workspace `slug`
   → 404 Not Found, ApiError { error: "not-found" }

3. Session + active membership, but the requested `:evidence_id` does not
   exist in workspace `slug`
   → 404 Not Found, ApiError { error: "not-found" }

4. Session + active membership + row exists, but the row is in a soft-deleted
   workspace
   → 404 Not Found, ApiError { error: "not-found" }

5. Session + active membership + row exists + workspace is live
   → 200 OK, the row (with role-based field masking; see §6)
```

### 2.2 Why 401 vs 404 distinction matters

- **401 = no session at all.** Both anonymous visitors and stale-cookie visitors get this. The error doesn't leak any existence information; it only says "you need a session to talk to this URL family."
- **404 = session exists but you cannot prove access.** Whether `:slug` is real, whether `:evidence_id` exists, whether the workspace is live — all of these collapse to 404. The response body never says which sub-case applied.
- **403 is reserved for one specific case:** an authenticated workspace member who is trying to perform an action their role doesn't permit (member trying to write, member trying to read `reasonPrivate`, etc.). Membership-existence is never leaked via 403.

This three-status model preserves the 404-on-non-member doctrine from PR-V1-A §5.4 while still giving authenticated members a useful 403 when they try to overreach their role.

### 2.3 What the `member`-tries-to-read-`reasonPrivate` case looks like

A `member` (not `reviewer` / `owner`) can read an exception, but `reason_private` is masked out per §6. This is **not** a 403 — the request succeeds (200 OK) with the field absent. The 403 is reserved for entire-action denials, not field-level denials.

If a member explicitly hits `GET /api/vault/workspaces/:slug/exceptions/:id?include=reason_private` (asking for the masked field), the response is still **200 OK with `reason_private` absent** and a header `X-OpenSoyce-Vault-Masked-Fields: reason_private` that tells the client which fields were dropped. The client can render "private reason — promote to reviewer to view" or similar; the server does not leak the value.

### 2.4 What the 404 response NEVER includes

- The error body never includes the workspace slug, evidence ID, or any indication of whether the requested resource exists.
- The error body never includes a `Set-Cookie` header (avoid CSRF-token rotation revealing session state).
- The error body never includes a `Link` header pointing at a related resource.
- The error body never differs in size or timing in a way that distinguishes "workspace doesn't exist" from "you're not a member."

The implementation PR's structural-invariants test asserts every `/api/vault/workspaces/:slug/*` route handler funnels all four sub-cases (no membership, no row, soft-deleted, all fine) through the same 404 path with the same `ApiError` shape.

## 3. Vault Timeline event read API

### 3.1 Route surface

| Route | Verb | Role | Returns |
|---|---|---|---|
| `/api/vault/workspaces/:slug/timeline` | `GET` | `member`+ | Page of events (newest first) |
| `/api/vault/workspaces/:slug/timeline/:event_id` | `GET` | `member`+ | One event |

No POST. No PATCH. No DELETE. Timeline events are append-only from the trigger functions (PR-V1-B §3.4); the client cannot write them.

### 3.2 List endpoint shape

```text
GET /api/vault/workspaces/:slug/timeline
  ?event_type=<comma-separated>           // optional filter
  ?subject_exception_id=<uuid>            // optional filter
  ?subject_evidence_id=<uuid>             // optional filter
  ?since=<iso-timestamp>                  // optional; events emitted at >= since
  ?until=<iso-timestamp>                  // optional; events emitted at <  until
  ?limit=<int 1..200>                     // default 50
  ?cursor=<opaque-string>                 // for pagination

Response body:
{
  events: VaultTimelineEvent[],
  next_cursor: string | null,             // null when no more pages
  total_count_estimate: int               // approximate; for UI badges
}
```

### 3.3 Single event endpoint shape

```text
GET /api/vault/workspaces/:slug/timeline/:event_id
→ 200 OK, VaultTimelineEvent
→ 404 Not Found per §2.1 decision tree

VaultTimelineEvent {
  event_id:           uuid
  workspace_id:       uuid
  event_type:         "exception_proposed" | "exception_approved" | "exception_rejected" |
                      "exception_revoked" | "exception_expired" | "exception_extended" |
                      "private_evidence_captured" | "private_evidence_redacted" |
                      "workspace_created" | "workspace_renamed" | "workspace_soft_deleted" |
                      "workspace_owner_transferred" |
                      "member_added" | "member_promoted" | "member_demoted" |
                      "member_suspended" | "member_removed"
  subject_evidence_id?:    uuid
  subject_exception_id?:   uuid
  subject_membership_id?:  uuid
  summary:            string (1..280)
  references:         TrustProofAnchor[]   // includes private-anchors per §1
  visibility:         "private"             // always
  emitted_at:         iso-string
  emitted_by?:        { user_id, github_login, display_name }   // null for reaper-emitted events
}
```

### 3.4 Pagination + cursor discipline

| Choice | Decision |
|---|---|
| Cursor format | Opaque base64-encoded `(emitted_at, event_id)` tuple. Client must not parse. |
| Stability | Cursor stable across schema changes; if the implementation rotates cursor format, old cursors return `400 Bad Request, error: "cursor-stale"` |
| Default sort | `emitted_at DESC, event_id DESC` (newest first) |
| Sort flip | Out of scope for v0; the read API is newest-first only |
| Page count limit | 200 events per request maximum |

### 3.5 What the read API does NOT do

- Does not support `?event_type=*` wildcards. The implementation iterates a fixed allowlist.
- Does not allow `?visibility=public` queries (there are no public Vault Timeline events; the field is always `'private'`).
- Does not return events for a workspace the requester is not a member of. The 404 path from §2 applies before the query runs.
- Does not stream (no SSE / WebSocket in v0). Polling against the list endpoint is the v0 model.
- Does not expose raw SQL filters. Every query parameter is documented in §3.2.

## 4. Event types — exception lifecycle (refined from PR-V1-C §6)

PR-V1-C named 7 exception-lifecycle event types. This sub-sketch locks the contract.

### 4.1 The 7 exception-lifecycle event types

| event_type | Emitted when | Summary template (≤280 chars) | `subject_exception_id` |
|---|---|---|---|
| `exception_proposed` | new row inserted with state `proposed` | "Proposed exception on `<subject>`: `<original> → <allowed>`. Reason: `<reason_public>`." | the new exception |
| `exception_approved` | `proposed → active` | "Approved exception on `<subject>`: `<original> → <allowed>` until `<expires_at>`. Reason: `<reason_public>`." | the row |
| `exception_rejected` | `proposed → rejected` | "Rejected exception on `<subject>`. Reviewer reason: `<reason>`." OR "Withdrew own exception proposal on `<subject>`." | the row |
| `exception_revoked` | `active → revoked` | "Revoked exception on `<subject>`: `<original> → <allowed>`. Revoke reason: `<reason>`." | the row |
| `exception_expired` | `active → expired` by reaper | "Exception expired on `<subject>` at scheduled `<expires_at>`." | the row |
| `exception_extended` | `active → active` with new `expires_at` | "Extended exception on `<subject>` to new `<expires_at>`." | the row |
| _(no others permitted)_ | — | — | — |

### 4.2 Emission timing contract

- Every emission is in the **same SQL transaction** as the state-mutating UPDATE/INSERT. Postgres trigger functions (PR-V1-B §3.4) enforce.
- The trigger function reads the row's pre-change and post-change values to construct the `summary`. The summary template is part of the function body; changing the template requires a forward-only migration that updates the function.
- The trigger function NEVER references the public Timeline. Vault Timeline events are NEVER mirrored to the public `/proof/timeline` data.

### 4.3 What an `exception_extended` event's `references` looks like

```text
references: [
  {
    proofType: "private-anchor",
    label:     "Original proposal",
    href:      "/api/vault/workspaces/<slug>/exceptions/<exception_id>",
    visibility: "private"
  },
  {
    proofType: "private-anchor",
    label:     "Previous expiration: <old expires_at>",
    href:      "/api/vault/workspaces/<slug>/timeline/<prior_approved_event_id>",
    visibility: "private"
  }
]
```

The `references` array makes the extension auditable: you can walk from the extended event back to the prior approval, back to the original proposal. The audit chain stays inside the Vault.

## 5. Vault Timeline `visibility = 'private'` behavior

### 5.1 The SQL invariant (PR-V1-B §2.7)

The `vault_timeline_events.visibility` column has a SQL `CHECK (visibility = 'private')` — locked to one value. An attempt to write any other value produces a constraint violation.

### 5.2 The API invariant

Every response from `/api/vault/workspaces/:slug/timeline*` includes `visibility: "private"` on every event. The implementation PR's structural test grep-asserts that no response transformation strips or modifies the field.

### 5.3 The public-API absence invariant

The public Timeline endpoint (if one ever existed beyond the static MVP) MUST NOT emit any event with `visibility: "private"`. Today the public Timeline is static data (`src/shared/trustTimeline.js`); the invariant carries forward when the public Timeline becomes dynamic.

### 5.4 What `visibility: 'private'` signals to the client

- The event is workspace-scoped. Sharing the JSON with a third party is the workspace's decision, not OpenSoyce's.
- The event must not be embedded in any public-facing surface (badge, public Trust Center page, CLI v0 timeline command output) — by structural test on both ends.
- If a future client renders Vault Timeline alongside public Timeline events (e.g., the Vault Dashboard in PR-V2-E), the renderer MUST surface the visibility distinction visually. PR-V2-E picks the UI shape.

### 5.5 What `visibility: 'private'` does NOT signal

- It does not change the cache headers — they're already `private, no-store` on every Vault endpoint per PR-V1-A §6.2.
- It does not encrypt the response body. The wire is HTTPS; the auth gate is the session cookie. `visibility` is metadata, not a cipher mode.
- It does not promise eternal secrecy. A workspace owner can voluntarily share the event JSON; OpenSoyce does not technically prevent that. The Vault is the audit gate, not a DRM system.

## 6. Masking rules (member vs reviewer/owner)

Per Trust Vault ADR §3.2 + PR-V1-A §5.3 + PR-V1-B §2.6, the `reason_private` column is reviewer-readable, member-unreadable.

### 6.1 The masking contract at the API layer

| Surface | Reads `reason_private`? | Mask behavior |
|---|---|---|
| `GET /api/vault/workspaces/:slug/exceptions` (list) | reviewer / owner only | List response includes `reason_private` for reviewer/owner; omits it for member |
| `GET /api/vault/workspaces/:slug/exceptions/:id` (single) | reviewer / owner only | Same |
| `GET /api/vault/workspaces/:slug/timeline*` | reviewer / owner only — but Timeline events do NOT carry `reason_private`; they carry `summary` which is constructed from `reason_public` only | No masking needed; the trigger function uses `reason_public` |
| `GET /api/vault/workspaces/:slug/evidence/:id` | reviewer / owner only on the `body` field | `body` masked for members |

### 6.2 The masking contract at the SQL layer

Two options for PR-V2-B / PR-V2-C to choose:

**Option A — Postgres view with column grants:**

- Create `vault_exceptions_member_view` that selects all columns except `reason_private`.
- Grant `vault_exceptions` SELECT on `reviewer` + `owner` roles only.
- Grant `vault_exceptions_member_view` SELECT on `member`.
- Application code queries the view when the requester is a member.

**Option B — Application-layer mask:**

- Application always queries `vault_exceptions` (full row).
- Before serializing the response, the application clears `reason_private` based on the requester's role.

The implementation PR (PR-V2-C) picks. The sub-sketch recommends **Option A (Postgres view)** because the defense-in-depth principle (PR-V1-B §6 "two walls") favors making the column inaccessible at the SQL layer when the requester is a member, not just at the serialization layer.

### 6.3 The `X-OpenSoyce-Vault-Masked-Fields` header

When a member-role request returns a row that has been masked, the response includes:

```text
X-OpenSoyce-Vault-Masked-Fields: reason_private
```

(Comma-separated list of fields that were dropped due to role.)

This lets the client render an honest "private reason — promote to reviewer to view" UI without guessing. The header is metadata about the response, not the row itself.

### 6.4 What masking does NOT do

- Does not lie. A masked field is absent, not blank-stringed. `reason_private: ""` and `reason_private: undefined` carry different meanings; the API uses **field-absent** to signal masking, never an empty string.
- Does not change the count of records returned. A member can see N exceptions in the list, same as a reviewer; just with less detail per row.
- Does not redact `proof_anchors`. Private-anchor pointers are visible to all members (they prove the audit chain exists); only the `reason_private` text body is masked.

## 7. Public-spine isolation rules (the hard structural boundary)

This section defines what the implementation must structurally guarantee. The Trust Vault ADR §2.3 and §2.4 set the principle; this section locks the assertions.

### 7.1 Module import isolation

The implementation PR's structural test asserts:

| File | Cannot import |
|---|---|
| `src/pages/Proof.tsx` | Anything from `src/server/vault/` or `src/shared/vault/` |
| `src/pages/Home.tsx` | Same |
| `src/pages/OpenSourceTrustCenter.tsx` | Same |
| `src/pages/RepoTrustDashboard.tsx` | Same |
| `src/pages/TrustTimeline.tsx` | Same |
| `src/components/Layout.tsx` | Same |
| `src/server/badge/*` | Same |
| `packages/cli/src/*` | Same |

The Vault modules (when they ship in PR-V2-C) live in a directory whose path is forbidden to public renderers. The structural test reads each public file's imports and rejects any path matching `vault`.

### 7.2 Data flow isolation

| Surface | Reads from Vault? |
|---|---|
| Public Timeline data (`src/shared/trustTimeline.js`) | NEVER |
| Public Dashboard data (`src/shared/repoTrustDashboard.js`) | NEVER |
| Public Trust Center data (`src/shared/openSourceTrustCenter.js`) | NEVER |
| Public gate API (`/api/compliance-gate`) | NEVER — gate decisions ignore workspace context. (When PR-V2-C ships, the gate response may optionally carry an exception note IF the requester sent a workspace session cookie; this is decided in PR-V2-C, not here, and the public unauthenticated gate response is unchanged.) |
| Badge SVG / JSON | NEVER |
| CLI v0 (`opensoyce check`, `lockfile`, `trust`, `timeline`, `why`) | NEVER. The Phase 5 CLI extension (`opensoyce login` + `--workspace`) is the only path; that lift is atomic to PR-V2-D. |

### 7.3 Cache isolation

Per PR-V1-A §6.2 + PR-V1-B §2.4: every Vault response is `Cache-Control: private, no-store, no-cache, must-revalidate`. The public spine is `public, max-age=300, stale-while-revalidate=3600`. The two surface families never share cache entries because:

- Vault routes carry `Vary: Cookie` — different sessions get different cached copies (when cached at all, which is `no-store` so never).
- Public routes do not carry session cookies for badge / CLI / static pages.

### 7.4 Test invariants (for PR-V2-C)

PR-V2-C adds these to either `scripts/test-vault-exception-api-v0.mjs` or a new `scripts/test-vault-isolation-v0.mjs`:

1. Every file under `src/pages/`, `src/components/`, `src/server/badge/`, `packages/cli/src/`, and `src/shared/{trustTimeline,repoTrustDashboard,openSourceTrustCenter}.js` does NOT import any path containing `vault`.
2. No public renderer file contains the literal string `visibility: 'private'` or `visibility: "private"`. The string may only appear in Vault source.
3. Every response from `/api/vault/workspaces/:slug/timeline*` carries `visibility: "private"` on every event.
4. The public gate API endpoint, when called without a session cookie, returns identical bytes regardless of workspace exceptions (asserted by a snapshot test).
5. Public Timeline data (`src/shared/trustTimeline.js`) contains no event with `visibility` set at all (the field's absence on public events is the public-spine contract).
6. The `validate_proof_anchors` Postgres function rejects an anchor that has `visibility: 'private'` paired with any `proofType` other than `'private-anchor'`.

## 8. Audit-anchor rendering rules inside Vault only

### 8.1 What renders where

| Surface | Renders public anchors | Renders private anchors |
|---|---|---|
| Public Trust Center (`/opensource-trust`) | ✓ | ✗ (cannot — they're not in the public data) |
| Public Dashboard (`/projects/:owner/:repo/trust`) | ✓ | ✗ |
| Public Timeline (`/proof/timeline`) | ✓ | ✗ |
| Public Gate page (`/proof/gate`) | ✓ | ✗ |
| Badge SVG / JSON | (just the link to Dashboard; no anchors rendered in the badge body) | ✗ |
| CLI v0 evidence output | ✓ | ✗ — CLI v0 never sees workspace context |
| Vault Dashboard (PR-V2-E) | ✓ + ✗ — renders both, with visual distinction | ✓ |
| Vault Timeline read API response | ✓ + ✗ — both pass through; the consumer (PR-V2-E) renders | ✓ |

### 8.2 Rendering rule for private anchors

When a Vault surface (PR-V2-E) renders a `private-anchor`:

- The `label` is shown as-is (no transformation, no censorship — the workspace wrote it).
- The `href` becomes a clickable link **only for the role that can see the linked row**. A member viewing a Timeline event whose `references` include a `private-anchor` pointing at an evidence row with masked `body` sees the link as inactive or shown with a tooltip "Reviewer access required to follow."
- The visual treatment includes a small `PRIVATE` badge or icon adjacent to the link. PR-V2-E picks the visual shape; the structural test asserts that the rendered output for a `private-anchor` differs from the rendered output for any public anchor type.

### 8.3 What private-anchor rendering NEVER does

- Never exposes the `href` value to a non-member (member of a different workspace, or anonymous visitor). If a non-member somehow obtained a Vault page (they cannot via the API, but suppose a screenshot leak), the URL itself does not authenticate them — following it gets a 404 per §2.
- Never embeds the linked content inline (no preview render of `reason_private` in a tooltip; no excerpt). The link is just a link; clicking is the only path to the body.
- Never re-orders anchors by visibility. The `references` array order is preserved verbatim; if a reviewer wrote `[private, public, private]`, the renderer shows them in that order.

## 9. What PR-V2-C may implement

Per the Trust Vault ADR §9.2 and this sub-sketch:

- The `validate_proof_anchors` Postgres function (full SQL body) and its references on every Vault table with `proof_anchors`.
- The `private-anchor` route handlers:
  - `GET /api/vault/workspaces/:slug/evidence/:evidence_id` (with role-based `body` masking)
  - `GET /api/vault/workspaces/:slug/exceptions/:exception_id` (with role-based `reason_private` masking)
  - `GET /api/vault/workspaces/:slug/timeline` (list)
  - `GET /api/vault/workspaces/:slug/timeline/:event_id` (single)
- The `X-OpenSoyce-Vault-Masked-Fields` response header.
- The 404-on-non-member decision tree (§2.1) end-to-end for all read routes.
- The Postgres view `vault_exceptions_member_view` (Option A from §6.2) and its SELECT grants.
- **The atomic `visibility`-field guard lift**:
  - Edit `OPEN_SOURCE_TRUST_CENTER_BANNED_SUBSTRINGS` to remove `visibility` (or the equivalent rule update) for Vault paths only.
  - Add a Trust Center hygiene test assertion that `visibility` is permitted on Vault paths and forbidden on public paths.
- A new `scripts/test-vault-isolation-v0.mjs` (or extension to `test-vault-exception-api-v0.mjs`) with the §7.4 invariants.
- Pagination + cursor logic per §3.4.

## 10. What PR-V2-C must NOT implement

- The CLI v0 5-command / 7-flag locks lift. That lift is **atomic to PR-V2-D** per Trust Vault ADR §7.1.
- The CLI workspace extension. Ships in PR-V2-D.
- The Vault Dashboard UI. Ships in PR-V2-E.
- Any badge variant (the badge stays public-only per Trust Vault ADR §7.2).
- Any change to the public Trust Center, Dashboard, Timeline page, gate page, or badge.
- Any change to the public gate API's unauthenticated response shape.
- Promotion of any Vault evidence to the public spine (that mechanism is its own future ADR per Trust Vault ADR §6.3).
- Streaming / SSE / WebSocket for Vault Timeline reads.
- Any banned-substring vocabulary lift OTHER than the atomic `visibility`-on-Vault-paths lift.
- Any change to the candidate-pipeline arc, the legacy SOC 2 deferral, or `hn-exploits-log.json`.

## 11. What this sub-sketch does NOT do

- Does not authorize PR-V2-C. The user explicitly approves PR-V2-C before any code lands.
- Does not change source code.
- Does not change `package.json`.
- Does not change any test.
- Does not create any database table, migration, or trigger.
- Does not lift the `visibility`-field guard. The lift is described as PR-V2-C's atomic action; it does NOT happen here.
- Does not lift the CLI v0 5-command / 7-flag locks. Those stay atomic to PR-V2-D.
- Does not authorize PR-V1-E or any implementation PR.
- Does not lift any other banned-substring vocabulary entry.
- Does not touch the legacy SOC 2 deferral.
- Does not introduce VEX / reachability / sandbox / remediation / drop-in / AI-agent / agentic framing.
- Does not touch the candidate-pipeline arc.
- Does not authorize the `hn-exploits-log.json` cleanup.

## 12. Status

**Proposed.** Awaiting explicit user decision before PR-V1-E (CLI workspace extension sub-sketch) begins.

Docs only. No application code, no `package.json` change, no migration, no test change, no banned-substring vocabulary lifted.

Recommended next sub-sketch after this merges:

**PR-V1-E — `docs(vault): sketch CLI workspace extension`** (per Trust Vault ADR §9.1)

Recommended, not pre-authorized. The user calls "approve CLI workspace extension sub-sketch" with explicit scope before any work begins.

---

> Private anchors prove private decisions. They do not become public proof.
> Vault Timeline records workspace history. It does not rewrite the public Timeline.
> Public-spine isolation is enforced by import graph, by SQL constraint, by cache header, by structural test, and by 404.
