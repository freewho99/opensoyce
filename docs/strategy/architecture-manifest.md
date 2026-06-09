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
| Exception state machine + API | implemented | PR-V2-B | PR #81 / `bc7b5d9` | Exception write lifecycle |
| Private proof anchors + Vault Timeline reads | implemented | PR-V2-C | PR #83 / `3adc0fc` | Private reads / timeline loop |
| Weakness-to-strength strategy | implemented | strategy docs | PR #82 / `c560468` | Strategic positioning |

## Approved Next

| Artifact | Status | Phase | Purpose |
|---|---:|---|---|
| CLI workspace extension | approved-next only after explicit call | PR-V2-D | login/logout, `--workspace`, exception list/propose/revoke, atomic CLI v0 lock lift |

## Planned / Near Future

| Artifact | Status | Phase | Purpose |
|---|---:|---|---|
| Vault Dashboard UI | planned | PR-V2-E | Trust Expiry table, evidence state, review actions |
| Phase 5 closeout | planned | PR-V3 | Close implementation arc and update docs |

## Parked — Component Exposure Intelligence

| Artifact | Status | Phase | Purpose |
|---|---:|---|---|
| Component exposure type registry | parked | Phase 6 | Native/custom exposure types |
| Component exposure records | parked | Phase 6 | Store observed exposure evidence separate from exceptions |
| Dynamic JSON Schema validation | parked | Phase 6 | Validate custom exposure metadata |
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
