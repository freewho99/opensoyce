# OpenSoyce Component Exposure Intelligence — Strategy Lock-In

Status: strategy lock-in
Scope: docs-only architecture record
Implementation status: partially implemented through Phase 5; Phase 6+ concepts are parked unless explicitly authorized.

## Purpose

This document locks the strategic knowledge dump into the repo as durable architecture doctrine.

OpenSoyce is not "security everything."

OpenSoyce is software trust decision infrastructure.

It records what software or component was trusted, why it was trusted, who accepted the risk, what evidence supports the decision, when that trust expires, and what policy should happen next.

## North Star

OpenSoyce should become the system of record for software trust decisions across code, dependencies, GitHub Actions, extensions, developer tools, containers, runtime/server components, cloud permission evidence, exceptions, evidence, policy, audit history, and archives.

The goal is not to observe everything.

The goal is to make trust explicit wherever software enters the system.

> If a company trusts it, OpenSoyce should eventually be able to ask: why, who decided, what evidence exists, and when does that trust expire?

## Core Separation

This is the architecture spine:

```txt
Exposure says: something exists or changed.
Policy says: what should happen.
Exception says: why risk is temporarily allowed.
Evidence says: what supports the decision.
Timeline says: what happened.
Archive says: what must be retained.
```

Do not collapse these objects.

## Implemented Phase 5 Stack on Main

As of the PR-V2-C closeout:

```txt
5beb8fa  PR-V2-A       Vault auth + workspace foundation
34aad06  forward-fix   atomic workspace + owner creation
bc7b5d9  PR-V2-B       exception state machine + API
3adc0fc  PR-V2-C       private proof anchors + Vault Timeline reads
```

Phase 5 now has the private write/read API loop:

```txt
workspace auth
membership resolution
exception lifecycle mutations
private evidence reads
private proof anchors
Vault Timeline read API
expanded user object shaping
redacted-body-for-all-roles rule
```

## Status Vocabulary

Every idea must be labeled before implementation.

```txt
implemented:
  Already merged and on main.

approved-next:
  Explicitly authorized next PR scope.

planned:
  Strategically agreed, but not authorized for implementation.

parked:
  Useful future direction, not current roadmap work.

research:
  Interesting, needs validation.

do-not-claim:
  Too speculative, too overbroad, or not implemented.
```

## Current Product Boundary

OpenSoyce currently should claim:

```txt
OpenSoyce records trust decisions.
OpenSoyce separates evidence, policy, exceptions, and audit history.
OpenSoyce can gate known software trust decisions in CI/CLI workflows.
OpenSoyce can preserve public and private proof surfaces separately.
OpenSoyce can track temporary exception decisions with reviewer accountability.
```

OpenSoyce should not currently claim:

```txt
live malware testing
runtime traffic inspection
automatic cloud containment
automatic node isolation
HSM-backed signatures
immutable ledgers
cluster daemon enforcement
gRPC streaming evaluation
sub-second cloud entitlement reconciliation
CIEM replacement
SIEM replacement
EDR replacement
SOC 2 ready
Vanta/Drata replacement
```

## Component Exposure Intelligence

Component Exposure Intelligence is the future Phase 6 direction.

It expands OpenSoyce from dependency trust into broader software-component trust decisions.

Potential exposure classes:

```txt
dependency-exposure
github-action-exposure
dev-tool-exposure
extension-exposure
container-image-exposure
base-image-exposure
runtime-exposure
server-version-exposure
os-component-evidence
deployment-manifest-exposure
cloud-permission-drift
third-party-api-exposure
model-provider-exposure
firmware-posture
```

These should not all ship at once.

## Exposure vs Exception

Do not overload `vault_exceptions` as a general exposure ingestion table.

Correct model:

```txt
component_exposure_types
component_exposures
vault_exceptions
vault_evidence
vault_timeline_events
```

Relationship:

```txt
component_exposure -> may require -> vault_exception
vault_exception -> must have -> vault_evidence
vault_exception -> emits -> vault_timeline_events
```

## Future Dynamic Exposure Types

Custom exposure types are useful for enterprise-defined trust boundaries.

Examples:

```txt
firmware-posture
third-party-api-exposure
model-provider-exposure
browser-extension-exposure
internal-cli-exposure
partner-integration-exposure
regulated-data-processor-exposure
```

But this belongs to Phase 6+.

Avoid implementing dynamic exposure types directly in Phase 5.

## Future Registry Shape

A future registry can define workspace-scoped exposure types:

```sql
create table public.component_exposure_types (
  exposure_type_id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null
    references public.vault_workspaces(workspace_id)
    on delete cascade,

  type_slug text not null,
  display_name text not null,
  description text,

  validation_schema jsonb not null,
  is_native boolean not null default false,
  is_active boolean not null default true,

  created_by uuid references public.vault_users(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint component_exposure_types_slug_len
    check (type_slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),

  constraint component_exposure_types_display_len
    check (length(display_name) between 1 and 128),

  constraint component_exposure_types_schema_object
    check (jsonb_typeof(validation_schema) = 'object'),

  constraint component_exposure_types_workspace_slug_unique
    unique (workspace_id, type_slug)
);
```

Avoid a Postgres CHECK constraint that calls a function which queries another table. It looks elegant but creates migration and correctness risk.

Prefer foreign keys where possible, application/server validation for JSON Schema, structural tests for native exposure vocabulary, and RLS for workspace isolation.

## Future Component Exposure Records

Component exposures should be separate from Vault exceptions.

```sql
create table public.component_exposures (
  exposure_id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null
    references public.vault_workspaces(workspace_id)
    on delete cascade,

  exposure_type_id uuid not null
    references public.component_exposure_types(exposure_type_id)
    on delete restrict,

  subject_kind text not null,
  subject_name text not null,

  trust_boundary jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,

  source_kind text not null,
  source_ref text,

  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),

  status text not null default 'observed',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint component_exposures_metadata_object
    check (jsonb_typeof(metadata) = 'object'),

  constraint component_exposures_boundary_object
    check (jsonb_typeof(trust_boundary) = 'object'),

  constraint component_exposures_status_check
    check (status in ('observed', 'review_required', 'allowed', 'blocked', 'excepted', 'resolved'))
);
```

## Runtime JSON Schema Validation Direction

Future validator responsibilities:

```txt
scope by workspace_id, not raw account_id
validate exposure type is active
validate the JSON Schema when the type is created
cache compiled schemas by workspace_id + type_slug + updated_at
limit schema size
limit metadata size
reject unknown custom formats
avoid runtime code execution in schemas
return stable error codes
```

Future error codes:

```txt
exposure-type-not-found
exposure-type-inactive
exposure-metadata-invalid
exposure-schema-invalid
exposure-metadata-too-large
```

## API Boundary Doctrine

Do not use a client-supplied account header as the source of tenant authority.

This is not acceptable as the primary boundary:

```txt
X-OpenSoyce-Account-ID: <account_id>
```

Correct boundary flow:

```txt
1. Authenticate session.
2. Resolve workspace from route.
3. Verify active membership.
4. Apply role rule.
5. Execute read/write.
6. Emit Vault Timeline event if state changes.
```

Prefer route shape:

```txt
GET  /api/vault/workspaces/:slug/exceptions
POST /api/vault/workspaces/:slug/exceptions
GET  /api/vault/workspaces/:slug/evidence/:id
GET  /api/vault/workspaces/:slug/timeline
GET  /api/vault/workspaces/:slug/timeline/:id
```

Avoid introducing a parallel `/v1/*` API without a deliberate public API versioning ADR.

## Future Cloud Permission Drift

Cloud permission drift is useful future evidence.

OpenSoyce should not claim to intercept live cloud permission changes unless a real cloud integration exists.

The useful model:

```txt
CloudTrail / audit logs observe the change.
CSPM / CIEM classifies cloud risk.
SIEM correlates security events.
OpenSoyce asks whether the change was permitted by trust policy and exception evidence.
```

Future exposure type:

```txt
cloud-permission-drift
```

OpenSoyce-aligned question:

```txt
Was this permission change allowed under the current software trust decision record?
```

Possible outcomes:

```txt
verified
review-required
unexpected-drift
expired-exception
blocked-by-policy
```

Avoid claiming automatic IAM revocation, node isolation, workload termination, or CIEM/SIEM replacement.

## Decision-Event Reconciliation

A useful future name for this capability:

```txt
Decision-Event Reconciliation
```

Meaning:

```txt
An external event occurred.
OpenSoyce checks whether a trust decision exists that allows it.
If yes, the event is recorded as verified.
If no, the event becomes review-required or unexpected drift.
```

DER asks:

```txt
Was this change expected?
Was it allowed?
Was there evidence?
Was an exception active?
Was the exception expired?
What policy applies now?
Who must review it?
```

## Future Transport Direction

Do not start with gRPC.

Stage transport in this order:

```txt
Stage 1: REST ingestion endpoint or GitHub Action / CLI upload.
Stage 2: Batch ingestion API for component exposure evidence.
Stage 3: Queue-backed worker.
Stage 4: Optional agent transport.
Stage 5: Streaming protocol, possibly gRPC.
```

Transport should follow the data model, not define it.

## Product Category Boundary

OpenSoyce can eventually ingest many kinds of external evidence:

```txt
dependency evidence
action evidence
container evidence
runtime evidence
cloud permission evidence
extension evidence
dev-tool evidence
exception evidence
```

But all evidence should flow into the same decision architecture:

```txt
Exposure says: something exists or changed.
Policy says: what should happen.
Exception says: why risk is temporarily allowed.
Evidence says: what supports the decision.
Timeline says: what happened.
Archive says: what must be retained.
```

OpenSoyce remains software trust decision infrastructure.
