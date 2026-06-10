# Phase 6A — Component Exposure Intelligence Foundation

Status: **implemented** (PR-6A)
Scope: private, workspace-scoped exposure foundation — native types only
Implementation status: foundation tables + domain helpers + minimal private API on `main`.

## What Phase 6A is

Phase 6A is the **foundation** of Component Exposure Intelligence (the Phase 6 strategic direction locked in [`component-exposure-intelligence-lock-in.md`](./component-exposure-intelligence-lock-in.md)). It records that a software component **exists or changed** in a workspace, as private workspace-scoped data.

It is deliberately small. It ships:

- two private tables — a native exposure-type catalog and the exposure records
- six seeded native exposure types
- server-side domain validation helpers
- a minimal private read/create API (the surface the structural tests exercise)

It does **not** ship ingestion, a dashboard, cloud-permission drift, custom types, dynamic schemas, or any claim expansion. Those remain parked.

## Doctrine (preserved verbatim)

```txt
Exposure says: something exists or changed.
Policy says: what should happen.
Exception says: why risk is temporarily allowed.
Evidence says: what supports the decision.
Timeline says: what happened.
Archive says: what must be retained.
```

And the load-bearing separation:

```txt
Exposure is not an exception.
Exposure is not evidence.
Exposure is not policy.

Exposure can lead to a trust decision.
It does not become the trust decision.
```

This separation is enforced structurally, not just documented:

- `component_exposures` has **no foreign key to `vault_exceptions`**.
- `component_exposures` has **no `proof_anchors` column** (that is evidence's shape, not exposure's).
- Phase 6A does **not** alter `vault_timeline_events` (see the Timeline deferral below).

## What shipped

| Artifact | File | Purpose |
| --- | --- | --- |
| Native type catalog | `supabase/migrations/0017_component_exposure_types.sql` | Six seeded native types; global system vocabulary; RLS deny-by-default |
| Exposure records | `supabase/migrations/0018_component_exposures.sql` | Workspace-scoped private records; FK to native catalog; RLS deny-by-default |
| Domain helpers | `src/server/cei/domain.js` | Native-type lookup; subject / metadata / source / status validation |
| Handlers | `src/server/cei/exposures.js` | List / get / create — all behind `resolveWorkspaceForMember` |
| Routes | `src/server/cei/routes.js` | Three workspace-scoped routes mounted on the private vault surface |
| Error codes | `src/server/vault/errors.js` | `exposure-type-not-found`, `exposure-subject-invalid`, `exposure-metadata-invalid`, `exposure-source-invalid`, `exposure-status-invalid`, `exposure-not-found` |
| Structural test | `scripts/test-cei-foundation-v0.mjs` | 21 invariants |

### The six native exposure types

```txt
dependency-exposure        — a package in the supply chain
github-action-exposure     — a GitHub Action referenced at a version/SHA
container-image-exposure   — a container image in a deployment/compose def
base-image-exposure        — a base image referenced by a Dockerfile FROM
dev-tool-exposure          — a developer tool/extension in the toolchain
runtime-version-exposure   — a server/runtime component version observed
```

Each native type accepts exactly one `subject_kind`, validated at the
application layer and bounded by a SQL CHECK.

## Tenancy + privacy

- `component_exposures.workspace_id` is **NOT NULL** and FK-cascades from `vault_workspaces`.
- Both tables are **RLS deny-by-default**; only the authenticated, service-role vault-session handlers read or write.
- Every handler funnels through `resolveWorkspaceForMember`: session required, **active membership required**, 404-on-non-member doctrine (membership existence is never leaked via 403).
- **No public reads.** There is no public CEI surface, no anon path, no badge, no Trust Center integration.
- **No account-id header trust boundary.** The workspace is resolved from the route slug + the session — never from a client-supplied header.

## Native-only enforcement

Phase 6A is native-types-only and that is enforced in three places:

1. The catalog migration seeds only the six native rows; there is **no create-exposure-type endpoint** (the catalog is read-only at the application layer).
2. `findNativeExposureType` refuses any row whose `is_native` is not `true` or whose `is_active` is not `true` — so even a future non-native seed cannot be used to create an exposure until the custom-type phase is authorized.
3. There is **no `validation_schema` column and no JSON Schema validator** anywhere in the CEI source. Metadata and trust_boundary are validated as JSON **objects only** — no per-type schema enforcement. Dynamic schemas are future scope.

## Deferred decisions (explicit)

### Vault Timeline integration — deferred

Phase 6A scope allowed a Vault Timeline event for exposure creation **only if** it could be recorded without changing Phase 5 exception semantics. It cannot be done cleanly today: `vault_timeline_events.event_type` is a fixed SQL CHECK list that the Phase 5 exception triggers depend on. Adding a CEI event type means altering that shared constraint, which touches the exception audit path. Phase 6A therefore records **no** timeline events for exposures. A CEI-native audit surface (or a carefully-migrated shared timeline) is its own later, separately-authorized decision.

### Workspace-scoped custom-type registry — deferred

The strategy lock-in sketches a workspace-scoped exposure-type registry with a `validation_schema` column for customer-defined types. That is the **future custom-type phase**, explicit non-scope here. Phase 6A ships the native catalog as a global system vocabulary (no `workspace_id` on the type table) — the records, not the type catalog, carry the tenancy boundary.

## What Phase 6A did NOT touch

- No CEI dashboard; no Vault Dashboard UI change.
- No CLI behavior change.
- No ingestion workers; no Go; no Docker / K8s / Prometheus / Grafana / HPA.
- No cloud-permission-drift; no Decision-Event Reconciliation API.
- No SBOM imports; no scanner behavior; no runtime agents; no automatic isolation.
- No SOC 2 / Vanta / Drata claims; no pricing pages.
- No change to the exception state machine, public Trust Center, Badge, public Timeline, or Gate behavior.

## Verification

All required suites green at the PR-6A tip:

```txt
test:cei-foundation-v0          21
test:vault-auth-v0              23
test:vault-exception-api-v0     22
test:vault-private-reads-v0     30
test:vault-dashboard-v0         26
test:cli-v0                     14
test:cli-workspace-v0           20
test:open-source-trust-center   26
test:trust-timeline             11
test:trust-badge-v0             19
test:repo-trust-dashboard       13
check:mojibake                  unchanged
npm run lint                    pre-existing blogPosts.ts:1820 typo only
```

## PR-6B — read surface (shipped)

Phase 6B added a **read-only** CEI surface to the Vault Dashboard. It makes
the exposure records 6A created visible to humans, and nothing more.

- `/vault/:slug/exposures` — read-only list (type / subject / status /
  source / last_seen), status filter, offset pagination
- `/vault/:slug/exposures/:id` — read-only detail (metadata, trust_boundary,
  source, timestamps, status)
- a "Component Exposures" nav card on the workspace home
- consumes ONLY the existing PR-6A GET endpoints; `src/shared/vault/api-client.ts`
  gained `listExposures` + `getExposure` (GET-only — there is no
  `createExposure` browser helper)

6B is read-only by structural test: no create button, no "propose
exception" affordance, no exposure→exception linkage, no ingestion/upload
hook, no mutating request. The pages render OUTSIDE the public Layout and
use `VaultAuthGate` on unauth deep links (return path preserved). Public
Trust Center / Badge / public Timeline / Gate untouched.

Sequence: **6A made exposure records real; 6B made them visible; 6C lets a
human propose a trust decision from an exposure.**

## PR-6C — exposure → proposed exception (shipped)

Phase 6C added ONE narrow write to `VaultExposureDetail`: **"Propose
exception from this exposure"**. Doctrine locked:

```txt
An exposure can suggest a trust decision.
A user must still propose the decision.
A reviewer must still approve the decision.
The record must remember who decided.
```

What it does:

- Creates a **proposed** exception only. It calls the existing PR-V2-B
  propose endpoint, which **hardcodes `state: 'proposed'` server-side** —
  there is no path to an active exception, no approve/reject/revoke/extend,
  no state-machine change.
- Requires **explicit review + submit**. The entry button opens a review
  card (subject, original/allowed action, public + private reason
  pre-filled from the exposure); a separate Submit button does the POST.
  No one-click auto-submit.
- Pre-fills the proposal from the exposure: subject (package), a public
  reason naming the exposure, and a private reason summarizing
  source / status / trust_boundary / metadata. The proof anchor is a
  `live-surface` pointer back at the exposure (the same client-constructed
  anchor pattern the CLI `exception propose` uses — not a synthesized
  `private-anchor`).
- **Does not mutate the exposure.** No status change, no exposure write.
  Exposure stays exposure; the new exception is a separate row.
- On success, shows a link to the new proposed exception.

Subject mapping boundary: exceptions cover `package` / `repo` subjects.
Only `dependency-exposure` (subject_kind `package`) maps cleanly, so the
action is **enabled only for package exposures**; the other five native
types show the action disabled with an honest note rather than inventing a
stretch mapping. No FK from exposures to exceptions was added — the link is
the proof anchor + the private reason, not a schema edge.

No CEI Timeline events, no `vault_timeline_events` change, no server change
(the propose endpoint already existed from PR-V2-B).

## PR-6D — CEI-native proposal audit (shipped)

Phase 6D records that a proposed exception was created **from** an exposure
— on a **CEI-native** event table, **without** touching the shared
`vault_timeline_events` table or the Phase 5 exception triggers.

```txt
The exposure suggested.
The user proposed.
The exception recorded the decision candidate.
The CEI event recorded the relationship.
The reviewer still decides.
```

What shipped:

- `supabase/migrations/0019_component_exposure_events.sql` —
  `component_exposure_events`: `workspace_id` (NOT NULL FK), `exposure_id`
  (NOT NULL FK), `event_kind` (CHECK allowlist of exactly ONE value:
  `exception_proposed_from_exposure`), `related_exception_id` (nullable
  set-null FK to `vault_exceptions` — audit context only),
  `actor_user_id` (NOT NULL FK), `metadata` (jsonb object), `created_at`.
  RLS deny-by-default.
- `src/server/cei/events.js` — `validateExposureInWorkspace`,
  `recordProposalFromExposure` (best-effort insert), and
  `handleListExposureEvents` (read surface). Never mutates the exposure or
  the exception.
- `src/server/vault/exceptions.js` — the propose handler is **additively**
  extended: an optional `source_exposure_id` is validated up front (404 if
  it isn't in the workspace), the proposed exception is created **exactly
  as before**, then the CEI event is recorded. Absent `source_exposure_id`
  → byte-for-byte the pre-6D flow. The audit insert is best-effort — a
  failure never undoes the proposal or changes its 201 response.
- `GET /api/vault/workspaces/:slug/exposures/:id/events` — read-only
  proposal history (CEI route, not a vault-timeline route).
- `VaultExposureDetail` — cites `source_exposure_id` when proposing, and
  renders a read-only **"Proposal history"** section (event kind, actor,
  linked exception, timestamp) that refreshes after a successful proposal.

Separation preserved and asserted:

- `component_exposures` **still has no FK to `vault_exceptions`**. The
  exception link lives only on the EVENT row — audit context, not a
  schema edge on the exposure.
- Recording an event does **not** mutate the exposure or the exception.
- **No `vault_timeline_events` change.** No new exception state. No active
  exception creation. No auto-approval. No exposure-status mutation.

## PR-6E — reviewer-side source-exposure context (shipped)

Phase 6E shows the OTHER side of the 6D relationship: when a reviewer opens a
proposed exception, they see read-only **"this exception came from this
exposure"** context.

```txt
The exposure suggested.
The user proposed.
The CEI event recorded the relationship.
The reviewer sees the context.
The reviewer still decides.
```

What shipped (no migration — the 0019 event table is reused):

- `src/server/cei/events.js` — `handleListEventsByException`: lists CEI
  events filtered by `related_exception_id`, each embedding its **source
  exposure** (type, subject, source, status) + actor. Workspace-scoped,
  read-only.
- `GET /api/vault/workspaces/:slug/exposure-events?related_exception_id=:id`
  — CEI-namespaced (NOT under the `/exceptions` route tree), read-only.
- `src/shared/vault/api-client.ts` — `listExceptionSourceEvents` GET helper
  plus `ExceptionSourceEvent` / `SourceExposureContext` types. No event
  mutation helper.
- `VaultExceptionDetail` — a read-only **"Source exposure"** card (exposure
  type, subject, source, status, proposer, timestamp, link back to the
  exposure). Best-effort load; a failure never blocks the review.

Review semantics unchanged: the reviewer still approves / rejects / extends
/ revokes exactly as before. The source-exposure card is **informational
only** — no approval automation, no risk/action auto-change, no exposure
mutation, no new event kind, no `vault_timeline_events`.

## Next (parked, not authorized)

Phase 6 continues from this foundation, but every next step requires its own explicit approval block:

- exposure-to-exception linkage (an exposure leading to a proposed exception)
- CEI-native audit / timeline surface
- workspace-scoped custom exposure types + dynamic schema validation
- ingestion (CLI / CI upload → exposure records)
- cloud-permission-drift exposure type
- a CEI read surface in the Vault Dashboard

None of these are pre-authorized. The foundation exists; the category does not expand without a fresh scope block.
