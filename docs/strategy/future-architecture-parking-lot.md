# OpenSoyce Future Architecture Parking Lot

Status: strategic parking lot
Scope: useful future ideas that are not current implementation authority.

## Purpose

This document prevents brainstormed future architecture from becoming accidental product claims or unauthorized engineering scope.

A parked idea can be valuable and still not be approved for implementation.

## Parked for PR-V2-E / Vault Dashboard UI

```txt
Trust Expiry table
countdown urgency
Review Vault button
evidence state badge
exception state filters
owner / reviewer display
slate / high-contrast control-room aesthetic
mono metadata
dense but readable table rows
```

Dashboard principle:

```txt
The Vault Dashboard should not look like another vulnerability table.
It should look like a decision control room.
```

Primary object:

```txt
time-bound trust decision
```

Customer dashboard answers:

```txt
What did we trust?
Who decided?
What evidence exists?
When does trust expire?
What policy applies?
```

## Parked for PR-V2-D / CLI Workspace Mode

Approved-next only if explicitly called.

```txt
CLI login/logout
local session file
--workspace mode
exceptions list
exceptions propose
exceptions revoke
public CLI v0 behavior preserved
no private-anchor hrefs in public mode
private CLI output clearly labeled
```

Not included:

```txt
CLI approve/reject/extend
Vault Dashboard
Phase 6 Component Exposure Intelligence
dynamic exposure types
workers
Docker/K8s/Prometheus/Grafana/HPA
```

## Parked for Phase 6 — Component Exposure Intelligence

```txt
component_exposure_types
component_exposures
native exposure vocabulary
custom workspace exposure schemas
metadata schema validation
component exposure reports
cloud-permission-drift exposure type
dynamic exposure type API
component exposure validation API
CI/CD ingestion API
SBOM imports
deployment manifest ingestion
dev-tool config ingestion
GitHub Action exposure
base image exposure
runtime/server version evidence
```

Phase 6 does not mean "security everything."

It means expanding the decision record to more software trust surfaces.

## Parked for Future Ingestion Infrastructure

```txt
Go ingestion worker
batch ingestion
queue-backed worker
dead-letter queue
schema validation failures
source-event dedupe
backpressure
retry policy
observability metrics
Docker Compose test harness
Prometheus metrics
Grafana ops dashboard
Kubernetes HPA
```

Correct ingestion flow:

```txt
ingestion source -> raw exposure events -> validation -> component_exposures -> optional review -> optional vault_exception
```

Do not write telemetry directly into `vault_exceptions`.

## Parked for Future Operations Dashboard

Operations dashboard is separate from customer Trust Dashboard.

Ops dashboard answers:

```txt
Is OpenSoyce processing exposure evidence reliably?
Are queues healthy?
Are writes succeeding?
Are validations failing?
Is latency acceptable?
```

Possible future metrics:

```txt
opensoyce_ingestion_queue_utilization_ratio
opensoyce_ingestion_batch_flush_duration_seconds
opensoyce_ingestion_events_processed_total
opensoyce_ingestion_events_rejected_total
opensoyce_ingestion_dead_letter_total
opensoyce_ingestion_schema_validation_failed_total
opensoyce_vault_write_duration_seconds
opensoyce_policy_evaluation_duration_seconds
```

Do not claim current ingestion worker metrics until worker exists.

## Parked for Future Deployment Runbooks

Useful future rollout structure:

```txt
1. Pre-deployment verification
2. Structural migration
3. Canary rollout
4. Monitoring window
5. Final cutover
6. Cleanup / closeout
```

Near-term migration doctrine:

```txt
Forward-only migrations.
Trust history must not disappear.
Private visibility cannot leak into public outputs.
Rollback strategy must not require truncating trust records.
```

## Parked for Phase 8 / Enterprise Evidence

```txt
cold storage archive exports
long-term retention policies
customer-owned archive storage
auditor export bundles
cryptographic archive manifests
GRC integrations
Vanta/Drata evidence export
formal compliance evidence packages
```

Archive doctrine:

```txt
Vault answers: what is true now?
Timeline answers: what happened?
Archive answers: what must be retained?
```

Archive is a projection, not the source of truth.

## Parked for Guard Resilience

```txt
Bootstrap Trust Loop Paradox
signed decision bundles
offline-grace mode
local audit log format
break-glass command
post-outage reconciliation
on-call runbook
```

Doctrine:

```txt
Offline mode can preserve known trust decisions.
It cannot invent new trust decisions.
Break-glass creates reconciliation debt.
```

## Parked Much Later

```txt
Ed25519 bundle verification implementation
cluster agent offline validation loop
customer-owned signing keys
hardware-backed break-glass identity
formal incident reconciliation workflow
streaming gRPC agent
cloud permission live stream
automatic IAM rollback
runtime isolation actions
```

## Do-Not-Claim List

Do not claim current support for:

```txt
OpenSoyce intercepts permission drift.
OpenSoyce automatically isolates clusters.
OpenSoyce revokes leases.
OpenSoyce returns trust tokens.
OpenSoyce guarantees sub-second evaluation.
OpenSoyce is a CIEM replacement.
OpenSoyce Agent controls cluster traffic.
OpenSoyce has un-bypassable logs.
OpenSoyce uses central Vault HSM signing.
OpenSoyce has immutable ledgers.
OpenSoyce has a Go telemetry worker.
OpenSoyce has a Kubernetes HPA deployment.
OpenSoyce has runtime telemetry autoscaling.
OpenSoyce supports GraphQL dashboard queries.
OpenSoyce supports custom exposure types today.
```

## Parking Lot Rule

A future idea can stay in the repo only if it is labeled honestly.

```txt
Useful does not mean implemented.
Strategic does not mean authorized.
Parked does not mean dead.
```
