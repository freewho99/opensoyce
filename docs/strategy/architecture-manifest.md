# OpenSoyce Architecture Manifest

Status: strategic manifest
Scope: index of implemented, approved-next, planned, parked, and do-not-claim architecture items.

## Purpose

This manifest prevents architecture drift by distinguishing what exists from what is planned or parked.

## Status Labels

```txt
implemented:
  Merged and on main.

approved-next:
  Explicitly authorized next PR scope.

planned:
  Strategically agreed, but no implementation authorization.

parked:
  Useful future direction, not current roadmap work.

research:
  Needs validation.

do-not-claim:
  Too speculative, overbroad, or unimplemented.
```

## Implemented

| Artifact | Status | Phase | Source | Purpose |
|---|---:|---|---|---|
| Vault auth + workspace foundation | implemented | PR-V2-A | PR #78 / `5beb8fa` | Auth/session/workspace base |
| Atomic workspace + owner creation | implemented | forward-fix | PR #80 / `34aad06` | Atomic workspace initialization |
| Weakness-to-strength strategy | implemented | strategy docs | PR #82 / `c560468` | Strategic positioning |
| Exception state machine + API | implemented | PR-V2-B | PR #81 / `bc7b5d9` | Exception write lifecycle |
| Private proof anchors + Vault Timeline reads | implemented | PR-V2-C | PR #83 / `3adc0fc` | Private reads / timeline loop |
| CLI workspace mode | implemented | PR-V2-D | PR #84 / `15fc8eb` | Device-code login, `--workspace`, exception list/propose/revoke, atomic CLI v0 lock lift |
| CEI architecture lock-in + v3 addendum | implemented | strategy docs | PR #85 / `34ef316` | Do-not-claim firewall, parking lot, resilience doctrine, v3 enterprise boundaries |
| Vault Dashboard + `/cli-auth` approval | implemented | PR-V2-E | PR #86 / `47f86bc` | Browser approval page + Dashboard shell (workspaces, Trust Expiry table, exception detail w/ reviewer actions, Vault Timeline, evidence detail) |
| Phase 5 closeout | implemented | PR-V3 | PR #87 / `83486c8` | Phase 5 marked COMPLETE; final doctrine; closeout checklist; Phase 6 parked-not-authorized language |
| CEI foundation (native catalog + exposure records) | implemented | PR-6A | PR #93 / `4b3127a` | `component_exposure_types` (6 native, read-only) + workspace-scoped `component_exposures`; migrations 0017/0018; private, RLS deny-by-default |
| Exposure read surface | implemented | PR-6B | PR #94 / `adbb4f2` | Read-only `/vault/:slug/exposures` list + detail inside VaultLayout; GET-only api-client |
| Propose exception from exposure | implemented | PR-6C | PR #95 / `abfe03f` | Two-step review→submit draft via the existing Phase 5 propose endpoint; proposed-only; exposure never mutated |
| CEI-native proposal audit | implemented | PR-6D | PR #96 / `9a3c46f` | `component_exposure_events` (migration 0019); single proposal event kind; additive best-effort recording; `vault_timeline_events` untouched |
| Reviewer-side source-exposure context | implemented | PR-6E | PR #97 / `1a48e84` | Read-only "Source exposure" card on the exception review page; reviewer actions unchanged |
| CEI reviewer-outcome audit | implemented | PR-6F | PR #98 / `da986f4` | Migration 0020 widens event-kind allowlist to 4; approve/reject/revoke additively record the outcome back to the exposure; expired kind deliberately deferred to the reaper scope |
| Phase 6 proposal/audit loop closeout | implemented | PR-6-CLOSEOUT | PR #99 / `578ee18` | Phase 6 loop marked CLOSED; doctrine; demo walkthrough; 6G+ parked-not-authorized language |
| Dependency-exposure ingestion (CLI) | implemented | PR-7A | this PR | `opensoyce exposure ingest-dependencies` — package.json / package-lock.json / explicit JSON → dependency-exposure records via the PR-6A create API; dry-run; client-side dedupe; ingestion observes, never decides |

**Phase 5 is CLOSED.** See [`phase-5-closeout.md`](./phase-5-closeout.md) for the full handoff record.

**The Phase 6 proposal/audit loop is CLOSED.** See [`phase-6-closeout.md`](./phase-6-closeout.md) for the full handoff record and [`../proof/cei-decision-loop-demo.md`](../proof/cei-decision-loop-demo.md) for the runnable walkthrough.

## Approved Next

_(none — PR-7A closed the first ingestion lane; further lanes are parked and each requires explicit user approval with a scope block before any implementation begins)_

## Parked — Component Exposure Intelligence (post-7A lanes)

| Artifact | Status | Phase | Purpose |
|---|---:|---|---|
| Expiry reaper + expired-outcome event | parked | 6G+ | active→expired transition; owns `exception_expired_from_exposure` + the actor-nullability decision |
| Exposure status lifecycle | parked | 6G+ | Move `observed` → `resolved` etc.; today the enum exists but nothing transitions it |
| Server-side ingest dedupe constraint | parked | 7B+ | Unique index or upsert-touch of `last_seen_at`; PR-7A dedupe is client-side only |
| `source_kind: ci` + CI-native ingestion | parked | 7B+ | Distinct CI source attribution, packaging, annotations; today CI runs the CLI and records say `cli` |
| Other manifest ecosystems / SBOM / scanner ingest | parked | 7B+ | yarn / pnpm / poetry / uv, SBOM import, scanner output; PR-7A is npm package metadata only |
| Custom exposure type registry | parked | 6G+ | Workspace-defined types beyond the 6 native |
| Dynamic JSON Schema validation | parked | 6G+ | `validation_schema` for custom exposure metadata |
| Shared Vault Timeline integration | parked | 6G+ | The 6A deferral stands; CEI audits stay in CEI's own surface |
| Cloud permission drift evidence | parked | Phase 6+ | Compare cloud entitlement changes against trust policy |
| Decision-Event Reconciliation | parked | Phase 6+ | Decide whether external events were allowed by trust record |

## Parked — Ingestion / Ops

| Artifact | Status | Phase | Purpose |
|---|---:|---|---|
| Ingestion API | parked | Phase 6+ | Accept exposure evidence |
| Go ingestion worker | parked | Phase 6+ | Batch event processing |
| Docker Compose integration harness | parked | Phase 6+ | Local worker/API/database testing |
| Prometheus metrics | parked | Phase 6+ | Ops observability |
| Grafana ops dashboard | parked | Phase 6+ | Ingestion health visualization |
| Kubernetes HPA | parked | Phase 6+ | Scale workers on queue pressure |

## Parked — Enterprise Evidence

| Artifact | Status | Phase | Purpose |
|---|---:|---|---|
| Cold storage archive export | parked | Phase 8 | Long-term private evidence retention |
| Auditor export bundle | parked | Phase 8 | Compliance evidence packaging |
| Vanta/Drata export | parked | Phase 8 | Evidence producer into GRC systems |

## Parked — v3 / Enterprise Expansion (long-range)

| Artifact | Status | Phase | Purpose |
|---|---:|---|---|
| SPIFFE/SPIRE identity direction | parked / research | v3 | Workload identity attestation for future collectors / agents |
| Cross-cloud trust scope synthesis | parked | Phase 6+ | Explicit per-scope exception applicability across environments |
| Predictive blast-radius preview | parked | Phase 6+ | Trust Impact Analysis on proposed exceptions (advises only) |
| Compliance evidence export projection | parked | Phase 8+ | Projection from `vault_exceptions` / `vault_evidence` / `vault_timeline_events` |
| Compliance Evidence Exports dashboard | parked | Phase 8+ | Audit Evidence Mapping; control-code rows; review-required statuses |
| DR reconciliation playbook | parked | Future resilience | Post-outage local audit upload + reconcile |
| Post-Incident Review template | parked | Future resilience | Break-glass governance closure |
| Decision-Event Reconciliation API | parked | Phase 6+ | `component-exposures/reconcile` route family |
| Pricing around trust-surface complexity | parked | Phase 8+ | Team / Platform / Enterprise tier framing (no exact prices in repo) |

## Parked — Resilience

| Artifact | Status | Phase | Purpose |
|---|---:|---|---|
| Signed decision bundles | parked | Future Guard resilience | Bounded offline decisions |
| Offline-grace mode | parked | Future Guard resilience | Continue known safe decisions during outage |
| Break-glass workflow | parked | Future Guard resilience | Emergency override with audit debt |
| Local audit reconciliation | parked | Future Guard resilience | Attach outage decisions to Vault Timeline |

## Do-Not-Claim

These are not current capabilities:

```txt
OpenSoyce controls cluster traffic.
OpenSoyce intercepts runtime cloud permission changes.
OpenSoyce automatically isolates nodes.
OpenSoyce revokes IAM permissions.
OpenSoyce issues trust tokens.
OpenSoyce uses HSM-backed Vault signatures.
OpenSoyce has immutable ledger storage.
OpenSoyce has a Go telemetry worker.
OpenSoyce supports gRPC streaming agent protocols.
OpenSoyce guarantees sub-second reconciliation.
OpenSoyce replaces CIEM / CSPM / SIEM / EDR.
OpenSoyce is SOC 2 ready.
OpenSoyce replaces Vanta or Drata.
OpenSoyce supports dynamic custom exposure types today.
```

## Architecture Spine

```txt
Exposure says: something exists or changed.
Policy says: what should happen.
Exception says: why risk is temporarily allowed.
Evidence says: what supports the decision.
Timeline says: what happened.
Archive says: what must be retained.
```

## Working Rule

Every new OpenSoyce feature must answer:

```txt
What component is trusted?
What evidence supports that trust?
Who decided?
What policy applies?
Is there an exception?
When does trust expire?
What record proves this later?
```
