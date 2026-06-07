# Sub-Sketch: Vault Auth + Workspace Model (Phase 5, PR-V1-A)

**Status:** Proposed (this sub-sketch)
**Date:** 2026-06-07
**Phase:** 5 — Trust Vault (sub-sketch PR-V1-A per the [Trust Vault ADR](./trust-vault-architecture-adr.md) §9.1)
**Type:** Docs-only sub-sketch. No application code, no `package.json` changes, no test changes, no route changes, no banned-substring vocabulary lifted.

**Predecessors:**

- [Trust Vault ADR](./trust-vault-architecture-adr.md) (#67) — §3 (auth/workspace boundaries at architecture level), §9.1 (this sub-sketch's slot)
- Candidate-pipeline reviewer-auth precedent shipped in PRs #34 → #38 (`AppealsReview` and `IncidentCandidatesReview` use real GitHub OAuth via `/api/config`)

This sub-sketch refines the auth + workspace section of the Trust Vault ADR into something an implementation PR (PR-V2-A) can build against without re-litigating provider, token, or membership decisions. It does NOT decide persistence — that is PR-V1-B's job. It does NOT decide exception state machines, private anchors, or CLI extensions — those are PR-V1-C, V1-D, V1-E.

## 0. Inherited doctrine (non-negotiable)

From Trust Vault ADR §0:

> 1. Public trust record shows what can be shared.
> 2. Trust Vault stores what must be controlled.
> 3. Exceptions are allowed decisions, not erased risk.

From Trust Vault ADR §3.4:

> Every vault read is auth-checked. No anonymous access to `/vault/*` routes.

This sub-sketch decides *how* that auth-check happens without changing what it must accomplish.

## 1. Auth provider

### 1.1 Recommended choice: extend the existing candidate-pipeline GitHub OAuth path

OpenSoyce already ships a working GitHub OAuth path that the candidate-pipeline arc (PRs #34 → #38) hardened for reviewer routes. The pattern:

- `GITHUB_OAUTH_CLIENT_ID` exposed via `/api/config` (no secret leak).
- Client pages call `/api/config` to read the client ID, redirect to GitHub authorize, GitHub redirects back to a callback that exchanges the code for a session.
- Session is server-side and validated against `apiFetch` for reviewer-gated reads.
- Failure modes are visible: `LOADING` / `OAUTH NOT CONFIGURED` states are rendered, not silently downgraded.

**Decision: the Vault uses the same path.**

| Field | Value |
|---|---|
| Provider | GitHub OAuth (app-style, server-side code exchange) |
| Identity source | GitHub user login + numeric ID |
| Existing precedent | Candidate-pipeline reviewer auth (`AppealsReview`, `IncidentCandidatesReview`) |
| Why not Auth0 / Clerk / Supabase Auth | All three are viable but adding a new auth provider for a single phase is more weight than reuse. The candidate-pipeline path is already production-anchored; reusing it keeps the surface area small. The implementation PR may decide later to abstract over providers, but v0 ships one. |

### 1.2 Explicitly rejected (with reasoning)

| Candidate | Rejected because |
|---|---|
| Custom email + password | Adds password-storage liability for zero discoverability gain. Trust users are already developers with GitHub accounts. |
| Magic-link email | Adds email-delivery infrastructure. Same liability as above. |
| Auth0 / Clerk | Viable. Rejected for v0 because the candidate-pipeline path already works and adding a third-party auth dep for one phase is over-scope. |
| Supabase Auth | Viable. The repo already depends on `@supabase/supabase-js` for storage. Adding Supabase Auth on top conflicts with the existing GitHub OAuth path. The implementation PR may revisit; v0 stays on the working path. |
| Custom OIDC | Out of scope. |

### 1.3 What changes about the candidate-pipeline path

| Item | Today (candidate-pipeline) | After PR-V2-A |
|---|---|---|
| Session storage | Mock client-side `localStorage` (`src/context/AuthContext.tsx`) for public pages; real server-side cookie for reviewer pages | Server-side cookie for all `/vault/*` routes. The mock `AuthContext` is left alone for now — Vault does not retrofit existing public pages in v0. |
| Reviewer-list source | Hardcoded environment variable in server config | Workspace-membership lookup (see §3) |
| Identity carried in session | GitHub login | GitHub login + numeric ID + the workspaces this user belongs to (read on session establish, cached in session, refreshed on workspace-membership-change events) |

### 1.4 What this decision does NOT decide

- The Vault may eventually support SSO for paying customers. Not in v0.
- The Vault may eventually support API tokens (for CI integrations that don't have a GitHub session). Not in v0. CI use cases use the CLI's `opensoyce login` flow (Phase 5 ADR §7.1) backed by a device-code path or token paste; the exact CLI auth flow is PR-V1-E's concern.

## 2. Session token shape

### 2.1 Recommended shape

| Field | Value |
|---|---|
| Token form | Opaque server-side session ID, stored in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie named `opensoyce_vault_session` |
| Token storage | Server-side session table (see PR-V1-B for persistence shape; this sub-sketch does not commit) |
| Cookie scope | `Path=/`, `Domain=opensoyce.com` |
| Cookie max-age | 30 days; sliding-window refresh on every authenticated request |
| Revocation | Server-side delete of the session row — instant, no token blacklist needed |
| CSRF | Required for any state-changing route (`POST`, `PATCH`, `DELETE`). v0 uses double-submit cookie or per-form CSRF token; PR-V1-C picks the specific mechanism since it's the first sub-sketch with state changes. |

### 2.2 Explicitly rejected (with reasoning)

| Candidate | Rejected because |
|---|---|
| Signed JWT in cookie | JWTs are bearer tokens. Revocation requires a blacklist or short TTL; both add operational complexity. Opaque session IDs let us revoke by deleting one row. |
| Bearer token in `Authorization` header (browser) | Requires storing the token somewhere accessible to JS, which means it's stealable by XSS. `HttpOnly` cookies don't have this problem. |
| `localStorage` JWT (current `AuthContext` mock pattern) | Same XSS problem. The mock is for prototype browsing only; the Vault cannot use it. |
| Long-lived JWT (months) with refresh tokens | Adds refresh-token rotation logic. Out of scope for v0. |

### 2.3 The CLI exception

The CLI's `opensoyce login` flow is its own concern (PR-V1-E). It cannot use a browser cookie. The CLI auth flow likely uses:

- A device-code flow against GitHub (the same flow `gh auth login` uses), OR
- A long-lived personal access token paste

PR-V1-E picks one. PR-V2-A's cookie shape is the **browser** session — it is not the CLI session, and the implementation PR does not need to unify them.

### 2.4 What this decision does NOT decide

- The exact CSRF mechanism (PR-V1-C decides; first sub-sketch with mutating routes).
- The session-table schema (PR-V1-B decides).
- The cookie name (suggested above; implementation may rename for namespace clarity).
- The session-establishment endpoint URL (suggested `/api/vault/auth/login`; final shape per implementation).

## 3. Workspace data shape (abstract)

This section gives the abstract shape. The concrete persistence (table, columns, indexes, migrations) is PR-V1-B.

### 3.1 Workspace

```text
Workspace {
  workspaceId:     string                  // ULID or UUID, stable
  slug:            string                  // URL-safe, immutable after creation, unique
  displayName:     string                  // mutable, human-facing
  createdAt:       string                  // ISO timestamp
  createdBy:       UserRef                 // the user who created it
  members:         WorkspaceMember[]       // see §4
  subjectIds:      SubjectRef[]            // packages/repos this workspace evaluates
}
```

- `slug` is the URL-safe identifier used in routes (`/vault/<slug>/...`). Immutable so links don't rot.
- `displayName` is mutable so a workspace can rename itself for UI without breaking URLs.
- `subjectIds` is denormalized convenience; the canonical "what does this workspace track" lookup is the exception/evidence table joining on `workspaceId`. PR-V1-B decides whether to materialize.

### 3.2 SubjectRef

```text
SubjectRef =
  | { kind: 'package', name: string, version: string | 'any' | string[] }
  | { kind: 'repo',    owner: string, repo: string }
```

Same shape as the exception subject from Trust Vault ADR §4.3 — workspaces track subjects, and exceptions are filed against the same subject shape. One vocabulary.

### 3.3 UserRef

```text
UserRef {
  userId:      string         // OpenSoyce-internal stable ID (UUID/ULID)
  githubLogin: string         // mutable on GitHub side; reconciled on every login
  githubId:    number         // immutable GitHub user numeric ID; identity anchor
  displayName: string         // pulled from GitHub on login, mutable later
  avatarUrl:   string         // pulled from GitHub on login, mutable later
}
```

The `userId` is OpenSoyce-internal and stable across GitHub login rename, deletion, and account transfer. `githubId` is the immutable GitHub identity anchor — if a user renames their GitHub account, the workspace membership survives.

### 3.4 What this shape does NOT include

- No password hash. No email field. GitHub is the identity source.
- No `visibility` field. Workspaces are workspace-scoped by definition; no workspace is "public."
- No `subscription` / `tier` / `plan` field. Pricing is out of scope per Trust Vault ADR §3.3.
- No `quotas` field. Exceeded-quota handling is its own ADR if/when quotas exist.
- No nested workspace hierarchy. A workspace is flat. Organization-level grouping (parent workspace → child workspaces) is out of scope; if needed, it's its own ADR.

## 4. Membership flows

### 4.1 The 4 roles (from Trust Vault ADR §3.2, refined here)

| Role | Granted by | Read public spine | Read workspace vault | Write workspace vault | Manage members |
|---|---|---|---|---|---|
| `public_visitor` | (default for any visitor) | ✓ | ✗ | ✗ | ✗ |
| `member` | owner / reviewer | ✓ | ✓ | ✗ | ✗ |
| `reviewer` | owner | ✓ | ✓ | ✓ (exceptions + private reasons + Vault Timeline writes) | ✗ |
| `owner` | (creator on workspace creation; transferable by current owner) | ✓ | ✓ | ✓ | ✓ |

### 4.2 Required invariants

- **Every workspace has at least one owner at all times.** A workspace cannot remove its last owner. The implementation must structurally prevent the "last-owner-leaves" race.
- **A user can hold at most one role per workspace.** No "member + reviewer." Promotion replaces the existing role.
- **Role changes emit a Vault Timeline event** (PR-V1-D's surface). Per-workspace audit trail, no global Timeline impact.
- **Workspace deletion requires `owner` role and a 30-day soft-delete period.** Hard delete after 30 days; recoverable until then. PR-V2-A picks the recovery UI shape.

### 4.3 Membership lifecycle

```text
created          → active           → suspended           → removed
                                   ↘ promoted_to_reviewer
                                   ↘ promoted_to_owner
                                   ↘ demoted
```

- `created` — user added to the workspace, awaiting first login.
- `active` — user has logged in at least once and has access.
- `suspended` — owner has paused the user's access without removing audit trail. Reversible.
- `removed` — user is no longer a member. Audit trail of their past actions remains; the user cannot read or write.

Suspended / removed users see `403` on Vault routes for that workspace; they continue to see the public spine like any visitor.

### 4.4 Joining a workspace

Two flows, each its own UI:

**Flow A — invitation by owner / reviewer:**

1. Owner or reviewer enters the invitee's GitHub login in the workspace members UI.
2. Server looks up the GitHub login → `githubId` (via GitHub's public API).
3. A `WorkspaceMember` record is created with `created` status.
4. The invitee receives a notification on their next OpenSoyce login (or via email if the implementation PR ships email; v0 may skip email).
5. On the invitee's first login after invitation, the membership flips to `active` automatically.

**Flow B — self-serve workspace creation:**

1. A logged-in user creates a workspace via the workspace-creation UI.
2. The user becomes the `owner` immediately.
3. The workspace has exactly one member (the creator).

No public workspace browsing. No "workspace marketplace." No discovery. Workspaces are private artifacts referenced by invitation or direct URL.

### 4.5 Workspace-creation policy

| Question | v0 answer |
|---|---|
| Who can create a workspace? | Any logged-in user. (No paywall in v0.) |
| Is there a workspace count limit per user? | Soft cap of 5 workspaces per user in v0, surfaced as a banner not a hard block. Implementation may revisit when abuse signal exists. |
| Can a workspace be transferred to another user? | Yes. Owner-initiated transfer with the new owner's confirmation. PR-V2-A picks UI shape. |
| Is workspace-name uniqueness global or scoped? | Slug is globally unique (it's in the URL). DisplayName is not unique — many workspaces can be named "Trust Reviews." |

## 5. RBAC vocabulary detail

### 5.1 Permission constants (proposed for PR-V2-A)

```text
VaultPermission =
  // Read scope
  | 'vault:read:workspace'                  // see workspace exists + metadata
  | 'vault:read:exceptions'                 // list/view exceptions in this workspace
  | 'vault:read:private-reasons'            // see reasonPrivate field
  | 'vault:read:timeline'                   // read Vault Timeline
  | 'vault:read:members'                    // list members
  // Write scope
  | 'vault:write:exceptions'                // propose / approve / reject / revoke
  | 'vault:write:private-reasons'           // edit reasonPrivate
  // Admin scope
  | 'vault:admin:members'                   // add / remove / change role
  | 'vault:admin:workspace'                 // rename / transfer / delete workspace
```

### 5.2 Role → permission map

| Permission | member | reviewer | owner |
|---|---|---|---|
| `vault:read:workspace` | ✓ | ✓ | ✓ |
| `vault:read:exceptions` | ✓ | ✓ | ✓ |
| `vault:read:private-reasons` | ✗ (sees `reasonPublic` only) | ✓ | ✓ |
| `vault:read:timeline` | ✓ | ✓ | ✓ |
| `vault:read:members` | ✓ | ✓ | ✓ |
| `vault:write:exceptions` | ✗ | ✓ | ✓ |
| `vault:write:private-reasons` | ✗ | ✓ | ✓ |
| `vault:admin:members` | ✗ | ✗ | ✓ |
| `vault:admin:workspace` | ✗ | ✗ | ✓ |

### 5.3 The `private-reason` read split

A workspace `member` can list exceptions (and see their public reasons + posture impact) without seeing `reasonPrivate`. The reasoning matches §1's private-evidence classes:

- Members include downstream developers, junior reviewers, contractors. They need to know *that* an exception exists and *what* it allows. They don't need to know *why in detail* if the why is vendor-NDA-sensitive.
- A reviewer who later promotes a member sees private reasons retroactively; nothing is lost.

The implementation PR's structural test asserts the API never returns `reasonPrivate` in a response paid for by a member role.

### 5.4 Public visitor handling

The four roles above don't include `public_visitor` because public visitors don't make Vault requests at all. The middleware on `/vault/*` routes returns:

| State | HTTP response |
|---|---|
| No session | `401 Unauthorized` |
| Session exists but no membership on the requested workspace | `404 Not Found` (NOT `403`) — per Trust Vault ADR §5.2, hiding the workspace's existence is the right move when membership is missing. |
| Session + membership but insufficient role | `403 Forbidden` with a short error message |

The `404` for non-member is not a bug. It is a doctrine choice that prevents the membership API from leaking the existence of private workspaces by `403`-vs-`404` differential.

## 6. Surface-shape decisions

### 6.1 Route family

| Route | Auth required | Notes |
|---|---|---|
| `GET /api/vault/me` | session cookie | Returns the user's workspaces + roles. The browser's "workspaces I belong to" lookup. |
| `POST /api/vault/auth/login` | none | Handles the GitHub OAuth code exchange. Sets the session cookie. |
| `POST /api/vault/auth/logout` | session cookie | Deletes the session row server-side. Clears the cookie. |
| `GET /api/vault/workspaces/:slug` | session + `vault:read:workspace` | Workspace metadata + member list (member-list field gated on `vault:read:members`). |
| `POST /api/vault/workspaces` | session cookie | Creates a workspace; the caller becomes owner. |
| `PATCH /api/vault/workspaces/:slug` | session + `vault:admin:workspace` | Rename / transfer / soft-delete. |

The exception, evidence, and Timeline routes ship in later sub-sketches (PR-V1-C, PR-V1-D). This sub-sketch covers only the auth + workspace foundation.

### 6.2 Cookie response headers

Every `/api/vault/*` response carries:

| Header | Value |
|---|---|
| `Cache-Control` | `private, no-store, no-cache, must-revalidate` |
| `Pragma` | `no-cache` |
| `Vary` | `Cookie` |

The Vault is `no-store`. The public spine is the cached layer; the Vault never is. This is one of the structural differences between the two surface families.

## 7. What this sub-sketch authorizes for PR-V2-A

PR-V2-A (`feat(vault): add auth + workspace foundation`) is authorized to:

- Add session-cookie auth middleware to a new `/api/vault/*` route family.
- Implement the GitHub OAuth code-exchange callback per the candidate-pipeline pattern.
- Implement workspace creation, slug allocation, metadata read/write.
- Implement the membership table (concrete shape per PR-V1-B).
- Implement the 4-role RBAC checks per §5.2.
- Implement the soft-delete + 30-day recovery flow.
- Add the `404`-on-missing-membership middleware response.
- Add a new structural-invariants test `scripts/test-vault-auth-v0.mjs` enforcing:
  - Every `/api/vault/*` route handler is fronted by an auth middleware (grep-asserted).
  - Every `/api/vault/*` response includes the `Cache-Control: private, no-store` header.
  - Every workspace record carries `workspaceId`, `slug`, `displayName`, `createdAt`, `createdBy`.
  - Every membership record carries `workspaceId`, `userId`, `role`, `addedAt`, `addedBy`.
  - The membership middleware returns `404` (not `403`) for non-member requests on existing workspaces.
  - The membership middleware never returns `200` for an anonymous request.
- Add a new linking-page in `LINKING_PAGES` for any Vault docs surface created.
- Add the eventual atomic `visibility`-field lift contract docs (NOT the lift itself; that's PR-V2-C).

PR-V2-A is NOT authorized to:

- Lift the `visibility`-field guard on public shapes. That lift is atomic to PR-V2-C.
- Lift the CLI v0 5-command / 7-flag locks. That lift is atomic to PR-V2-D.
- Implement exception state machine (PR-V2-B).
- Implement private proof-anchor type or Vault Timeline (PR-V2-C).
- Add CLI workspace extension (PR-V2-D).
- Add Vault Dashboard view (PR-V2-E).
- Touch the candidate-pipeline arc, the public Trust Center, the Dashboard, the Timeline, the badge, the CLI.
- Touch the legacy SOC 2 deferral.
- Add any new banned-substring vocabulary entry without justifying it in the PR body.

## 8. What this sub-sketch does NOT do

- Does not authorize PR-V2-A. The user explicitly approves PR-V2-A before any code lands.
- Does not change source code.
- Does not change `package.json` (Supabase dep already present; no new auth dep added by this PR).
- Does not change any test.
- Does not change any route.
- Does not commit to a specific persistence layer (that's PR-V1-B).
- Does not decide CLI auth flow (that's PR-V1-E).
- Does not decide CSRF mechanism (that's PR-V1-C, first sub-sketch with mutating routes).
- Does not authorize PR-V1-B, PR-V1-C, PR-V1-D, PR-V1-E, or any implementation PR.
- Does not lift any banned-substring vocabulary entry.
- Does not touch the legacy SOC 2 deferral.
- Does not introduce VEX / reachability / sandbox / remediation / drop-in / AI-agent / agentic framing.
- Does not touch the candidate-pipeline arc.
- Does not authorize the `hn-exploits-log.json` cleanup.

## 9. Status

**Proposed.** Awaiting explicit user decision before PR-V1-B begins (the next sub-sketch in the Phase 5 sequence — persistence).

Docs only. No application code, no `package.json` change, no test change, no route change, no banned-substring vocabulary lifted.

Recommended next sub-sketch after this merges:

**PR-V1-B — `docs(vault): sketch persistence layer`** (per Trust Vault ADR §9.1)

Recommended, not pre-authorized. The user calls "approve persistence sub-sketch" with explicit scope before any work begins.

---

> GitHub identity. Opaque session. Slug-stable workspace. Four roles.
> The Vault auth-checks every read; the public spine never asks who you are.
