# Sub-Sketch: Vault Persistence Layer (Phase 5, PR-V1-B)

**Status:** Proposed (this sub-sketch)
**Date:** 2026-06-07
**Phase:** 5 — Trust Vault (sub-sketch PR-V1-B per the [Trust Vault ADR](./trust-vault-architecture-adr.md) §9.1)
**Type:** Docs-only sub-sketch. No application code, no `package.json` changes, no test changes, no migrations, no banned-substring vocabulary lifted.

**Predecessors:**

- [Trust Vault ADR](./trust-vault-architecture-adr.md) (#67) — §3 (architecture-level boundaries), §9.1 (this sub-sketch's slot)
- [Vault Auth + Workspace Sub-Sketch](./vault-auth-workspace-sub-sketch.md) (PR-V1-A, merged at `247996f`) — §3 (workspace data shape abstract), §4 (membership flows)
- Existing Supabase Postgres precedent: `supabase/migrations/0001_appeals.sql` → `0004_incident_candidates.sql` (candidate-pipeline arc, in production)

This sub-sketch refines the persistence layer of the Trust Vault into something an implementation PR (PR-V2-A and beyond) can build against without re-litigating the database choice, table shapes, migration policy, or retention rules. It does NOT decide the auth provider (PR-V1-A already did), the exception state machine (PR-V1-C), private proof-anchor (PR-V1-D), or CLI extension (PR-V1-E).

## 0. Inherited doctrine (non-negotiable)

From Trust Vault ADR §0 + §3.4:

> 1. Public trust record shows what can be shared.
> 2. Trust Vault stores what must be controlled.
> 3. Exceptions are allowed decisions, not erased risk.
> 4. Every vault evidence record is anchored.
> 5. Every vault read is auth-checked.

This sub-sketch's specific addition:

> 6. **Vault persistence stores controlled evidence. It must preserve auditability without leaking private data.**

Every decision below is a corollary of rule 6.

## 1. Persistence backend

### 1.1 Recommended choice: extend the existing Supabase Postgres

OpenSoyce already runs a Supabase Postgres instance for the candidate-pipeline arc and the appeals/exceptions surfaces. The existing migrations live under `supabase/migrations/` and follow a numbered-SQL pattern (`0001_*.sql` → `0004_*.sql`). The Vault adds migrations starting at `0005_*` in the same instance.

**Decision: Vault persistence is Supabase Postgres, same instance, new migration set.**

| Field | Value |
|---|---|
| Engine | PostgreSQL 15+ (Supabase-hosted) |
| Connection path | Existing `@supabase/supabase-js` client + server-side `service_role` key for Vault writes |
| Migration tool | The repo's existing `supabase/migrations/*.sql` convention (numbered SQL files applied by Supabase CLI / Vercel deploy) |
| Auth integration | The Vault session table joins the GitHub-OAuth user table via `users.user_id`; no Supabase Auth introduced |

### 1.2 Explicitly rejected (with reasoning)

| Candidate | Rejected because |
|---|---|
| New separate Postgres instance | Two databases doubles the operations surface (two backups, two restore tests, two connection pools) for zero isolation benefit at v0 scale. Vault tables in the existing instance get row-level security (RLS) for isolation. |
| DynamoDB / single-table NoSQL | The Vault's relational shape (workspace → memberships → exceptions → events) needs joins. NoSQL forces denormalization that makes audit-anchor consistency harder. |
| Git-backed evidence log (commit per Vault entry) | Audit-anchor discipline already requires PR + SHA pointers; storing entire Vault entries as commits doubles the SHA-pinning model without adding integrity (Git history is mutable by force-push). |
| Supabase Edge Functions storage / KV | Not designed for the query patterns the Vault needs (list-by-workspace, filter-by-state, audit log). |
| SQLite | Single-writer, no remote backup model. v0 needs concurrent access from at least one Express server. |
| Per-customer DB schema | Multi-tenant via schema-per-customer is operationally heavy. The Vault uses one schema with `workspace_id` foreign-keyed everywhere; RLS enforces tenant isolation. |

### 1.3 Why "boring relational" wins for v0

- The data shape is relational (workspace → many memberships → many exceptions → many events).
- The query patterns are SQL-shaped (list exceptions by workspace + state + expiry, join Timeline events by subject).
- The audit-anchor discipline maps cleanly to FK columns + immutable `created_at` timestamps.
- The team already operates Postgres; no new operational learning curve.
- Postgres RLS provides the workspace-isolation primitive PR-V1-A's 404-on-non-member doctrine needs at the SQL layer (not just the API layer).

### 1.4 What this decision does NOT decide

- The specific Supabase plan tier (free / pro / team / enterprise). Operational decision separate from architecture.
- Read-replica topology. Not needed for v0.
- Connection-pooler choice (PgBouncer transaction-pooling vs Supavisor). Implementation-level.
- The exact Supabase project URL / API key rotation policy. Operational.

## 2. Table shapes

Seven tables. Each has a documented purpose, columns, FKs, indexes, and RLS posture. Column types are PostgreSQL.

### 2.1 `vault_users`

OpenSoyce-internal user records. Joined to the existing GitHub OAuth flow.

```text
vault_users (
  user_id         uuid primary key default gen_random_uuid(),
  github_id       bigint not null unique,                      -- immutable identity anchor (PR-V1-A §3.3)
  github_login    text not null,                               -- mutable; reconciled on every login
  display_name    text,                                        -- pulled from GitHub
  avatar_url      text,                                        -- pulled from GitHub
  created_at      timestamptz not null default now(),
  last_login_at   timestamptz,                                 -- updated on successful auth
  status          text not null default 'active'               -- 'active' | 'deactivated'
                    check (status in ('active','deactivated'))
)

indexes:
  - unique on (github_id)
  - btree on (github_login)
```

**RLS:** off (read by server-side handlers only; never directly queried by client).

### 2.2 `vault_workspaces`

```text
vault_workspaces (
  workspace_id    uuid primary key default gen_random_uuid(),
  slug            text not null unique
                    check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),  -- URL-safe, 3-64 chars
  display_name    text not null,
  created_by      uuid not null references vault_users(user_id) on delete restrict,
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz,                                 -- soft-delete (PR-V1-A §4.2)
  hard_delete_at  timestamptz,                                 -- soft → hard transition (30 days after deleted_at)
  display_name_updated_at timestamptz
)

indexes:
  - unique on (slug)
  - btree on (created_by)
  - btree on (deleted_at) where deleted_at is not null
```

**RLS:** on. A `vault_workspaces` row is selectable by a user only if there is a corresponding `vault_workspace_memberships` row with the same `workspace_id` and that user's `user_id` (and `member_status` IN `('active','suspended')`). Soft-deleted workspaces remain visible to owners during the 30-day window.

### 2.3 `vault_workspace_memberships`

```text
vault_workspace_memberships (
  membership_id   uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references vault_workspaces(workspace_id) on delete cascade,
  user_id         uuid not null references vault_users(user_id) on delete restrict,
  role            text not null check (role in ('member','reviewer','owner')),
  member_status   text not null default 'active'
                    check (member_status in ('created','active','suspended','removed')),
  added_at        timestamptz not null default now(),
  added_by        uuid not null references vault_users(user_id) on delete restrict,
  removed_at      timestamptz,
  removed_by      uuid references vault_users(user_id) on delete restrict,

  unique (workspace_id, user_id)                               -- one role per user per workspace (PR-V1-A §4.2)
)

indexes:
  - unique on (workspace_id, user_id)
  - btree on (user_id, member_status)
  - btree on (workspace_id, role) where member_status = 'active'
```

**RLS:** on. A row is selectable by a workspace member with `member_status` = `'active'`; insertable/updatable only by an `owner` of the same workspace.

**Invariant trigger:** A `BEFORE UPDATE / DELETE` trigger blocks the row change if the result would leave the workspace with zero `member_status='active'` owners. (Per PR-V1-A §4.2: every workspace has ≥1 owner at all times.)

### 2.4 `vault_sessions`

Server-side session storage (opaque session ID cookie per PR-V1-A §2.1).

```text
vault_sessions (
  session_id      uuid primary key default gen_random_uuid(),  -- opaque ID stored in HttpOnly cookie
  user_id         uuid not null references vault_users(user_id) on delete cascade,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,                        -- 30 days from last refresh
  last_seen_at    timestamptz not null default now(),
  user_agent      text,                                        -- for member self-review of active sessions
  ip_origin       text                                         -- first-octet preserved; full IP not stored
)

indexes:
  - btree on (user_id, expires_at)
  - btree on (expires_at)                                      -- for the periodic expired-session reaper
```

**RLS:** off (server-side only). Session rows are deleted on logout. A periodic Postgres function (scheduled via Supabase cron or external cron) deletes rows where `expires_at < now()`.

### 2.5 `vault_evidence`

Private evidence captures (per Trust Vault ADR §1.1). The Vault's primary evidence store.

```text
vault_evidence (
  evidence_id     uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references vault_workspaces(workspace_id) on delete cascade,
  evidence_class  text not null check (evidence_class in (
                    'pre_disclosure_cve',
                    'audit_trail',
                    'reviewer_private_justification',
                    'customer_scoped_trust',
                    'internal_review_trail'
                  )),                                          -- the 5 classes from Trust Vault ADR §1.1
  subject_kind    text check (subject_kind in ('package','repo')),
  subject_name    text,                                        -- 'name@version' OR 'owner/repo'
  summary         text not null check (length(summary) between 1 and 280),
  body            text,                                        -- long-form, optional, vault-only
  proof_anchors   jsonb not null check (jsonb_typeof(proof_anchors) = 'array'
                                         and jsonb_array_length(proof_anchors) > 0),
  visibility      text not null default 'private'
                    check (visibility in ('private')),         -- ONLY 'private' permitted on this table
  redaction_state text not null default 'visible'
                    check (redaction_state in ('visible','redacted','hard_deleted')),
  created_at      timestamptz not null default now(),
  created_by      uuid not null references vault_users(user_id) on delete restrict,
  redacted_at     timestamptz,
  redacted_by     uuid references vault_users(user_id) on delete restrict,
  hard_delete_at  timestamptz                                  -- 90 days after redaction
)

indexes:
  - btree on (workspace_id, evidence_class, created_at desc)
  - btree on (workspace_id, subject_kind, subject_name)
  - btree on (hard_delete_at) where hard_delete_at is not null
```

**RLS:** on. Selectable by workspace members with role IN `('member','reviewer','owner')`. INSERT requires `reviewer` or `owner`. UPDATE limited to `redaction_state` and `redacted_*` columns by `reviewer`/`owner`. Hard delete by background job after `hard_delete_at`.

**Invariant:** `proof_anchors` is non-empty (CHECK constraint). The Vault enforces audit-anchor discipline at the SQL layer, not just at the API layer. A code bug that tries to insert an unanchored record gets a constraint violation.

### 2.6 `vault_exceptions`

The exception shape from Trust Vault ADR §1.2.

```text
vault_exceptions (
  exception_id    uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references vault_workspaces(workspace_id) on delete cascade,
  subject_kind    text not null check (subject_kind in ('package','repo')),
  subject_name    text not null,                               -- 'name@version' OR 'name' for 'any', OR 'owner/repo'
  subject_version_set jsonb,                                   -- null OR { "kind": "any" } OR { "kind": "pinned", "versions": [...] }
  original_action text not null check (original_action in ('BLOCK','WARN')),
  allowed_action  text not null check (allowed_action in ('WARN','ALLOW')),
  state           text not null default 'proposed'
                    check (state in ('proposed','reviewed','active','rejected','revoked','expired')),
  proposed_by     uuid not null references vault_users(user_id) on delete restrict,
  proposed_at     timestamptz not null default now(),
  reviewed_by     uuid references vault_users(user_id) on delete restrict,
  reviewed_at     timestamptz,
  expires_at      timestamptz,                                 -- required when state in ('active'); see CHECK below
  reason_public   text check (length(reason_public) between 1 and 280),
  reason_private  text,                                        -- only readable by reviewer/owner roles
  proof_anchors   jsonb not null check (jsonb_typeof(proof_anchors) = 'array'
                                         and jsonb_array_length(proof_anchors) > 0),
  revoked_at      timestamptz,
  revoked_by      uuid references vault_users(user_id) on delete restrict,
  revoke_reason   text,

  -- A row in 'active' state must have expires_at and reason_public filled.
  constraint active_requires_expiry check (
    state != 'active'
    or (expires_at is not null and reason_public is not null)
  ),

  -- Severity discipline (Trust Vault ADR §4.2): exceptions only DOWNGRADE actions.
  constraint downgrade_only check (
    (original_action = 'BLOCK' and allowed_action in ('WARN','ALLOW'))
    or (original_action = 'WARN' and allowed_action = 'ALLOW')
  )
)

indexes:
  - btree on (workspace_id, state, expires_at)
  - btree on (workspace_id, subject_kind, subject_name, state)
  - btree on (expires_at) where state = 'active'               -- for the expired-exception reaper
  - btree on (proposed_by)
```

**RLS:** on. Members read; reviewers/owners write per Trust Vault ADR §3.2. The `reason_private` column is column-level masked from `member`-role queries (Postgres view + RLS column-level grant; PR-V2-B picks the exact mechanism).

### 2.7 `vault_timeline_events`

Per-workspace Vault Timeline (Trust Vault ADR §5.4).

```text
vault_timeline_events (
  event_id        uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references vault_workspaces(workspace_id) on delete cascade,
  event_type      text not null check (event_type in (
                    -- exception lifecycle
                    'exception_proposed',
                    'exception_approved',
                    'exception_rejected',
                    'exception_revoked',
                    'exception_expired',
                    -- evidence lifecycle
                    'private_evidence_captured',
                    'private_evidence_redacted',
                    -- workspace lifecycle
                    'workspace_created',
                    'workspace_renamed',
                    'workspace_soft_deleted',
                    'workspace_owner_transferred',
                    -- membership lifecycle
                    'member_added',
                    'member_promoted',
                    'member_demoted',
                    'member_suspended',
                    'member_removed'
                  )),
  subject_evidence_id  uuid references vault_evidence(evidence_id) on delete set null,
  subject_exception_id uuid references vault_exceptions(exception_id) on delete set null,
  subject_membership_id uuid references vault_workspace_memberships(membership_id) on delete set null,
  summary         text not null check (length(summary) between 1 and 280),
  references_json jsonb not null check (jsonb_typeof(references_json) = 'array'
                                         and jsonb_array_length(references_json) > 0),
  visibility      text not null default 'private'
                    check (visibility = 'private'),            -- always private (Trust Vault ADR §5.4)
  emitted_at      timestamptz not null default now(),
  emitted_by      uuid references vault_users(user_id) on delete restrict
)

indexes:
  - btree on (workspace_id, emitted_at desc)
  - btree on (workspace_id, event_type, emitted_at desc)
  - btree on (subject_exception_id)
  - btree on (subject_evidence_id)
```

**RLS:** on. Members can SELECT for their workspace; writes happen server-side only (via triggers on the lifecycle tables; see §3.4 below).

## 3. Migration policy

### 3.1 File naming and numbering

| Convention | Value |
|---|---|
| Directory | `supabase/migrations/` (existing) |
| Numbering | Four-digit prefix, sequential, no gaps (`0005_vault_users.sql`, `0006_vault_workspaces.sql`, ...) |
| Atomicity | One logical change per migration file. PR-V2-A may bundle 7 migrations into one PR; each file is still single-purpose. |
| Comments | Top-of-file comment naming the PR (e.g. PR-V2-A) and the Trust Vault ADR section the migration implements |

### 3.2 Forward-only

Vault migrations are **forward-only**. There is no `_down.sql` companion. If a migration is wrong:

- A new migration corrects it (`0012_fix_vault_exceptions_expires_at_constraint.sql`).
- The bad data is migrated forward, not rolled back.
- Migration files on `main` are immutable. Rewriting `0005_*` after deploy is forbidden; structural-invariants test asserts.

### 3.3 RLS posture is part of the migration

Every Vault migration that creates or alters a table also sets RLS in the same file:

```sql
alter table vault_workspaces enable row level security;

create policy "members can read their workspaces" on vault_workspaces
  for select using (
    exists (
      select 1 from vault_workspace_memberships m
      where m.workspace_id = vault_workspaces.workspace_id
        and m.user_id = current_user_id()
        and m.member_status = 'active'
    )
  );
```

RLS is **not** a separate migration. A migration that creates a Vault table without enabling RLS in the same file fails the structural-invariants test.

### 3.4 Trigger discipline

Vault Timeline events are emitted by `AFTER INSERT / UPDATE` triggers on `vault_exceptions`, `vault_evidence`, `vault_workspaces`, and `vault_workspace_memberships`. Triggers live in migrations alongside their tables. PR-V2-A authors trigger functions in the same migrations as the table they react to.

### 3.5 Migration verification

PR-V2-A and beyond:

- Run migrations against a fresh ephemeral Postgres in CI (Supabase local or `pg-mem` — PR-V2-A picks).
- Apply migrations in numeric order; assert no SQL errors.
- Assert RLS is enabled on every table whose name starts with `vault_`.
- Assert no migration file in `supabase/migrations/` is mutated after its first commit on `main` (file SHA recorded in the structural-invariants test).

## 4. Retention policy

### 4.1 Lifecycle states summary

| Table | Soft-delete column | Hard-delete window | Hard-delete trigger |
|---|---|---|---|
| `vault_users` | `status = 'deactivated'` | (never auto-deleted; user records persist as audit anchors) | (manual) |
| `vault_workspaces` | `deleted_at` set; `hard_delete_at = deleted_at + 30 days` | 30 days | scheduled job |
| `vault_workspace_memberships` | `member_status = 'removed'` + `removed_at` | (never auto-deleted; persist for audit) | (manual) |
| `vault_sessions` | (no soft state; expired sessions hard-deleted) | immediate after `expires_at` | scheduled reaper |
| `vault_evidence` | `redaction_state = 'redacted'`; `hard_delete_at = redacted_at + 90 days` | 90 days | scheduled job |
| `vault_exceptions` | `state = 'revoked'` or `'expired'` | (never auto-deleted; persist for audit) | (manual) |
| `vault_timeline_events` | (no soft state) | (never auto-deleted; persist for audit) | (manual) |

### 4.2 Why these windows

- **30-day workspace recovery** matches PR-V1-A §4.2 (`workspace deletion requires owner role and a 30-day soft-delete period`). After 30 days, hard delete cascades through all child tables.
- **90-day evidence redaction window** gives the workspace owner time to retract a redaction (e.g., they realized the evidence is still useful for an audit). After 90 days, hard delete is permanent.
- **Permanent audit retention** for exceptions, memberships, and Timeline events means a workspace owner can never claim "we don't have a record of that decision." The Vault is the record.

### 4.3 What retention does NOT do

- It does NOT delete Vault Timeline events when the entity they reference is hard-deleted. Timeline events outlive their subjects; `subject_*_id` FKs use `on delete set null`.
- It does NOT respect "right to be forgotten" requests in v0. The Vault is an audit log; per-user erasure conflicts with the audit purpose. A future ADR may add a pseudonymization mechanism if/when required by regulation.
- It does NOT export retention metrics to public surfaces. The public spine remains unaware of Vault retention.

## 5. Backup and restore model

### 5.1 Backup

| Mechanism | Frequency | Retention |
|---|---|---|
| Supabase point-in-time recovery (PITR) | Continuous (WAL-based) | 7 days on the Pro plan; 30 days on higher tiers (operational decision separate from this sub-sketch) |
| Logical SQL dump | Daily | 90 days |
| Schema-only dump | Daily | 1 year (cheap; useful for migration audit) |

### 5.2 Restore

Two restore scenarios:

**Scenario A — full disaster recovery:**

1. Restore from the most recent logical dump or PITR target.
2. Re-run any migrations that landed after the dump's timestamp.
3. Vault is back online with all RLS enforced.

**Scenario B — partial recovery (single workspace):**

The Vault does NOT support point-in-time workspace restoration in v0. If a workspace owner accidentally hard-deletes data after the 30-day soft-delete window, that data is gone. Documented honestly; future ADR may add workspace-scoped backups if pain warrants.

### 5.3 Restore test cadence

Per `disaster-recovery` doctrine on any production database:

| Test | Frequency |
|---|---|
| Restore most recent logical dump into ephemeral Postgres; run `select count(*)` on every Vault table; assert counts match production within tolerance | Quarterly |
| Apply forward-only migrations from the schema-only dump; verify a fresh Postgres can replay every migration without error | Per Vault PR |

The quarterly test is operational. The per-PR test is structural and lives in the CI pipeline (added in PR-V2-A).

### 5.4 What backups do NOT do

- Backups do NOT include `vault_sessions`. Session rows are ephemeral; restoring them post-disaster would let a stale session reauthenticate as a user.
- Backups do NOT export `reason_private` to operational logging. The backup itself is encrypted at rest (Supabase default); operational metrics are aggregate-only.
- Backups do NOT include user secrets — there are none stored.

## 6. Audit-anchor storage discipline

### 6.1 The shape

Every Vault row that carries `proof_anchors` stores them as JSONB. The shape mirrors the `TrustProofAnchor` from `src/data/openSourceTrustCenter.ts`:

```text
proof_anchors: [
  {
    "proofType": "pr" | "live-surface" | "doc-anchor" | "proof-artifact" | "private-anchor",
    "label": string,
    "href": string,
    "pr": number,         // required when proofType = "pr"
    "sha": string,        // required when proofType = "pr"
    "visibility": "private"  // permitted ONLY when proofType = "private-anchor"
  },
  ...
]
```

### 6.2 SQL-level constraints

- `proof_anchors` is `jsonb not null` with a `check (jsonb_typeof(proof_anchors) = 'array' and jsonb_array_length(proof_anchors) > 0)` on every table.
- The implementation PR (PR-V2-A) registers a Postgres function `validate_proof_anchors(jsonb) returns boolean` and adds `check (validate_proof_anchors(proof_anchors))` on every table. The function asserts:
  - Every element has `proofType` from the 5-vocab set.
  - Every `proofType = 'pr'` element has `pr` (positive integer) and `sha` (7- or 40-char hex).
  - Every `proofType = 'private-anchor'` element has `visibility = 'private'` (and no element of any other `proofType` carries `visibility`).
  - No element has a `visibility` field on the public proof types.

### 6.3 Why SQL-level constraints

The Trust Center hygiene test already asserts `visibility`-field absence at the source level. SQL constraints add a second wall: a code bug that bypasses the test cannot persist a malformed anchor. The structural-invariants test for the Vault asserts that this Postgres function exists and is referenced by every Vault table.

### 6.4 No backdoor

The Vault never accepts a `proof_anchors` value that fails the function. There is no `--force` flag, no admin escape hatch, no service-role bypass. Migrating bad data forward (per §3.2) means writing a migration that rewrites the anchors to satisfy the function, then re-asserts the constraint.

## 7. Private evidence deletion and redaction

### 7.1 Two operations, distinct semantics

| Operation | Effect | Available to | Reverses? |
|---|---|---|---|
| **Redaction** | `vault_evidence.body` is cleared, `redaction_state = 'redacted'`, `redacted_at = now()`, `hard_delete_at = now() + 90 days`. Summary remains; body is gone. | `reviewer` / `owner` | Yes, within 90 days (un-redaction restores `body` from the most recent backup; PR-V2-C decides UI) |
| **Hard delete** | The row is physically deleted. Foreign-key cascades may delete child rows. | (automatic, after the redaction window) | No |

### 7.2 What redaction preserves

- `summary` is preserved — workspace members can still see that an evidence record existed without seeing the body.
- `proof_anchors` is preserved — the audit trail (PR + SHA, doc anchor, etc.) stays.
- `created_at`, `created_by`, `redacted_at`, `redacted_by` are preserved — who did what, when.
- `evidence_class` is preserved — the classification of what was redacted.

### 7.3 What hard-delete forgets

- `summary` and `proof_anchors` are gone.
- The Vault Timeline event referencing this evidence has its FK nulled (`on delete set null`); the event itself remains with `subject_evidence_id = null`.
- Backups before the hard-delete still contain the row. A restore from those backups will resurrect the evidence; per §4.2, this is operationally accepted because backups are not user-facing.

### 7.4 Who CANNOT delete

- A `member` cannot delete or redact.
- A `reviewer` can redact but cannot hard-delete (hard-delete is automatic-after-redaction-window, not a manual operation).
- An `owner` can redact but cannot bypass the 90-day window.
- The Vault has **no admin endpoint to force-delete a record**. There is no service-role escape hatch. The 90-day window is the only path.

This design accepts that an evidence record may persist for 90 days even after a workspace decides it should be gone. The alternative (instant force-delete) would let a workspace owner erase incriminating audit trail before the public spine could mirror it.

### 7.5 What private-evidence promotion looks like

(Carried forward from Trust Vault ADR §6.3, recorded here for completeness — promotion is its own future PR.)

Promotion creates a NEW row in the public Timeline data (the `src/shared/trustTimeline.js` module today; a Postgres table in some future ADR) that mirrors the Vault evidence's *outcome*. The Vault row is updated with `published_as = '<timeline-event-slug>'` and is NOT redacted. Both the public mirror and the private original exist; the private original stays the source of truth for the workspace.

## 8. Structural-invariants test discipline (for PR-V2-A and beyond)

Every Vault implementation PR must add or extend assertions in a new test file (proposed: `scripts/test-vault-persistence-v0.mjs`). The assertions:

1. Every file matching `supabase/migrations/0005_vault_*.sql` (and onward) is parseable as PostgreSQL.
2. Every `vault_*` table created in migrations has `enable row level security` in the same file.
3. Every Vault table with `proof_anchors` has the `check (jsonb_typeof(proof_anchors) = 'array' and jsonb_array_length(proof_anchors) > 0)` constraint, AND references the `validate_proof_anchors` function.
4. Every `vault_*` table referencing `workspace_id` has it as `not null` and FK-tied to `vault_workspaces`.
5. The migration sequence (`0005`, `0006`, ...) has no gaps.
6. No migration file is mutated after its first appearance on `main` (SHA recorded in the test).
7. The trigger that emits `vault_timeline_events` is defined in the same migration as the table whose changes it observes.
8. RLS policies for write operations require `reviewer` or `owner` role (depending on table).
9. The `vault_evidence.visibility` column has `check (visibility in ('private'))` — single value, locked.
10. The `vault_timeline_events.visibility` column has `check (visibility = 'private')` — single value, locked.

The implementation PRs collectively grow this test. It is the SQL-layer mirror of the Trust Center linking-page hygiene suite.

## 9. What PR-V2-A may implement (persistence scope)

Per the Trust Vault ADR §9.2 and this sub-sketch:

- All seven migration files (`0005_vault_users.sql` through `0011_vault_timeline_events.sql`).
- The `validate_proof_anchors(jsonb)` Postgres function.
- The triggers that emit `vault_timeline_events`.
- The expired-session reaper Postgres function (or a separate scheduled job).
- The expired-exception state-transition Postgres function.
- The Supabase RLS policies on all seven tables.
- A new `scripts/test-vault-persistence-v0.mjs` structural test wired into `test:ci`.
- Documentation under `supabase/migrations/README.md` (or extend an existing) describing migration discipline (forward-only, RLS-in-migration, no mutation after merge).

## 10. What PR-V2-A must NOT implement

- The `visibility`-field lift on the public Trust Center / Dashboard / Timeline / CLI / Badge shapes. That lift is **atomic to PR-V2-C** per Trust Vault ADR §5.3.
- The CLI v0 5-command / 7-flag locks. That lift is **atomic to PR-V2-D** per Trust Vault ADR §7.1.
- The exception state machine API endpoints (`POST /api/vault/.../exceptions`, etc.). Those ship in PR-V2-B per Trust Vault ADR §9.2.
- The private proof-anchor route or Vault Timeline rendering routes. Those ship in PR-V2-C.
- CLI workspace extension. Ships in PR-V2-D.
- Vault Dashboard view. Ships in PR-V2-E.
- Any change to the existing public spine surfaces, the candidate-pipeline arc, or the legacy SOC 2 deferral.
- Any banned-substring vocabulary lift.

## 11. What this sub-sketch does NOT do

- Does not authorize PR-V2-A. The user explicitly approves PR-V2-A before any migration lands.
- Does not change source code.
- Does not change `package.json` (Supabase dep already present).
- Does not change any test.
- Does not run any migration.
- Does not create any database table.
- Does not commit to a specific Supabase plan tier.
- Does not commit to a backup retention beyond the recommended ranges in §5.1.
- Does not authorize PR-V1-C, PR-V1-D, PR-V1-E, or any implementation PR.
- Does not lift any banned-substring vocabulary entry.
- Does not lift the `visibility`-field guard on public shapes.
- Does not lift CLI v0 locks.
- Does not touch the legacy SOC 2 deferral.
- Does not introduce VEX / reachability / sandbox / remediation / drop-in / AI-agent / agentic framing.
- Does not touch the candidate-pipeline arc.
- Does not authorize the `hn-exploits-log.json` cleanup.

## 12. Status

**Proposed.** Awaiting explicit user decision before PR-V1-C (exception state machine + API) begins.

Docs only. No application code, no `package.json` change, no migration, no test change, no banned-substring vocabulary lifted.

Recommended next sub-sketch after this merges:

**PR-V1-C — `docs(vault): sketch exception state machine + API`** (per Trust Vault ADR §9.1)

Recommended, not pre-authorized. The user calls "approve exception state machine sub-sketch" with explicit scope before any work begins.

---

> Postgres tables. Forward-only migrations. RLS in every migration.
> Audit anchors enforced at the SQL layer.
> Redaction in 90 days; never in 1.
> The Vault remembers what the workspace decided.
