# OpenSoyce v3 / Enterprise Expansion Addendum

Status: strategy addendum
Scope: long-range roadmap, enterprise evidence, compliance export, DER boundary, and pricing hypothesis
Implementation status: parked / research unless explicitly authorized

## Purpose

This document locks the final strategic dump into the repo without turning future vision into current product claims.

The material in this addendum is valuable, but it must remain clearly labeled:

```txt
Phase 6+:
  component exposure reconciliation
  cloud audit evidence ingestion
  custom exposure schemas
  graph-assisted impact analysis
  cross-cloud scope mapping

Phase 8+:
  SOC 2 evidence export
  Vanta/Drata support
  auditor evidence packages
  enterprise compliance dashboard
  cold archive compliance exports

v3 / research:
  SPIFFE/SPIRE enforcement
  multi-mesh trust synthesis
  predictive blast-radius modeling
  gRPC streaming agents
  automatic mesh isolation
```

This addendum does not authorize implementation.

---

## 1. v3 Roadmap Boundary

The v3 roadmap concepts are useful as long-range strategy, not current scope.

### Keep as future direction

```txt
SPIFFE / SPIRE identity direction
short-lived workload identity
cross-cloud trust boundary synthesis
service mesh trust evidence
predictive blast-radius modeling
graph-assisted risk simulation
```

### Park as research

```txt
multi-mesh automatic trust synchronization
machine-learning-driven trust blast-radius modeling
live graph database topology engine
executive multi-party approval loops
cross-cloud service mesh mutation detection
```

### Do-not-claim

```txt
OpenSoyce v3.0 mandates SPIFFE/SPIRE.
OpenSoyce automatically isolates mesh nodes in 3 seconds.
OpenSoyce maintains a live graph of every runtime asset.
OpenSoyce overrides team permissions automatically.
OpenSoyce performs ML-driven blast-radius modeling today.
```

### Better roadmap framing

Use:

```txt
future research direction
future enterprise identity model
future cross-cloud trust synthesis
future risk simulation layer
```

Avoid:

```txt
mandate
automatic isolation
fully mapped
sub-second enforcement
machine-learning-driven guarantee
```

---

## 2. Future Identity Attestation Direction

SPIFFE/SPIRE is a strong future direction because OpenSoyce should eventually avoid long-lived static secrets for agents, collectors, and private ingestion surfaces.

### Useful future principle

```txt
Long-lived tokens should not become permanent trust roots.
```

### Future identity model

```txt
short-lived workload identity
mTLS between collector and OpenSoyce control plane
workspace-scoped authorization
rotating certificates
auditable identity binding
```

### Safe wording

```txt
OpenSoyce may later support workload identity attestation for private collectors and enterprise deployments.
```

### Avoid current claim

```txt
OpenSoyce currently mandates SPIFFE/SPIRE.
OpenSoyce currently verifies TPM-backed workload identity.
OpenSoyce currently rejects telemetry streams without SPIFFE identity.
```

This belongs after collector / agent architecture exists.

---

## 3. Cross-Cloud Trust Synthesis

Cross-cloud trust synthesis is strategically interesting, but it must be framed as a future evidence and policy problem.

The useful question is:

```txt
If a trust exception is approved in one environment, should it apply anywhere else?
```

The answer should usually be:

```txt
Only if the trust boundary explicitly says so.
```

### Future trust scope model

A trust decision may have a scope:

```txt
single-repository
single-workspace
single-environment
single-cloud-account
single-cluster
multi-environment
global-enterprise
```

### Guardrail

Do not automatically synchronize exceptions across clouds by default.

A temporary exception approved for AWS EKS should not automatically apply to GCP GKE or Azure AKS unless the policy and reviewer explicitly allow that scope.

### Doctrine

```txt
Trust scope must be explicit.
Trust does not silently expand across clouds.
```

---

## 4. Predictive Blast-Radius Modeling

Predictive blast-radius modeling is useful as a later decision-support layer.

It should not be framed as an automatic authority that overrides humans.

### Future purpose

When a user proposes an exception, OpenSoyce could estimate:

```txt
what systems may be affected
what trust boundaries may widen
what evidence is missing
what policies may be violated
what approvals may be required
```

### Better names

```txt
Trust Impact Analysis
Exception Blast-Radius Preview
```

### Avoid overclaim

Do not claim:

```txt
machine-learning-driven predictive blast engine
live corporate network topology simulation
automatic executive bypass loop
guaranteed production blast-radius score
```

### Useful future output

```json
{
  "exception_id": "proposed",
  "impact_level": "high",
  "affected_boundaries": [
    "production-deployments",
    "database-access",
    "cross-account-role"
  ],
  "missing_evidence": [
    "compensating-control-proof",
    "owner-review"
  ],
  "required_review": [
    "security-reviewer",
    "platform-owner"
  ]
}
```

### Doctrine

```txt
The blast-radius model advises.
Policy decides.
Reviewers approve.
The Vault records.
```

---

## 5. Automated Compliance Ledger Boundary

The Automated Compliance Ledger idea is useful, but it belongs to Phase 8 / Enterprise Evidence.

It should not be framed as current SOC 2 Type II automation.

### Useful future direction

OpenSoyce can become an evidence producer for compliance workflows.

It can help show:

```txt
what trust decisions were made
who approved exceptions
what evidence existed
when exceptions expired
what policy action occurred
what Timeline events prove the sequence
```

### Safe positioning

```txt
OpenSoyce may later export structured evidence packages that support SOC 2 control review.
```

### Avoid current overclaim

```txt
OpenSoyce eliminates manual evidence collection.
OpenSoyce automatically maps all SOC 2 controls.
OpenSoyce generates auditor-ready SOC 2 Type II proof.
OpenSoyce has HSM compliance seals.
OpenSoyce is SOC 2 ready.
```

### Relationship to GRC tools

```txt
Vanta / Drata / auditors manage compliance programs.
OpenSoyce may provide software trust decision evidence into those programs.
```

OpenSoyce is not a Vanta or Drata replacement.

---

## 6. Compliance Evidence Export Projection

A future compliance export should be a projection from existing Vault records.

Source records:

```txt
vault_exceptions
vault_evidence
vault_timeline_events
vault_workspaces
vault_workspace_memberships
future component_exposures
future archive projections
```

The export should not invent proof.

### Future export shape

```json
{
  "$schema": "https://opensoyce.com/schemas/compliance-evidence-export.v1.json",
  "workspace_id": "workspace_uuid",
  "audit_window": {
    "start": "2026-01-01T00:00:00Z",
    "end": "2026-06-08T23:59:59Z"
  },
  "control_mapping": {
    "framework": "soc2",
    "control_code": "CC6.3",
    "mapping_status": "supporting-evidence"
  },
  "evidence_summary": {
    "exceptions_reviewed": 42,
    "exceptions_expired": 3,
    "exceptions_revoked": 1,
    "unreconciled_break_glass_events": 0
  },
  "records": [
    {
      "exception_id": "exp_123",
      "state": "expired",
      "subject_kind": "package",
      "subject_name": "example@1.2.3",
      "reviewed_by": {
        "github_login": "security-reviewer"
      },
      "expires_at": "2026-06-22T14:30:00Z",
      "timeline_event_count": 5,
      "evidence_anchor_count": 2
    }
  ]
}
```

### Correct labels

Use:

```txt
supporting evidence
control mapping
audit export
evidence package
```

Avoid:

```txt
compliance validated
SOC 2 proven
auditor seal
HSM compliance seal
```

---

## 7. Compliance Dashboard Direction

A compliance dashboard is useful later, but it should not look like a guarantee engine.

### Better dashboard names

```txt
Compliance Evidence Exports
Audit Evidence Mapping
```

Avoid:

```txt
SOC 2 Type II Continuous Evidence Engine
```

until legal, compliance, and implementation maturity support that language.

### Useful dashboard rows

```txt
control code
mapping status
evidence count
exceptions linked
last export
unreconciled events
review required
```

### Safe statuses

```txt
evidence-available
needs-review
incomplete
exported
```

Avoid:

```txt
COMPLIANT
VIOLATION
EVIDENCE_VALIDATED
```

unless a formal compliance workflow defines those states.

---

## 8. Disaster Recovery Reconciliation Boundary

The DR reconciliation playbook is useful as a future resilience document, but it assumes unbuilt architecture.

### Keep

```txt
post-outage triage
local audit extraction
dry-run reconciliation
conflict review
normal-mode restoration
post-incident review
```

### Rewrite language

Use:

```txt
local append-only audit log
signed decision bundle
Vault Timeline reconciliation
review queue
policy mismatch
```

Avoid:

```txt
local NVMe write-once storage
ED25519 signed fallback transactions as current fact
cluster agents
gRPC verification mode
telemetry-worker restart
X-OpenSoyce-Account-ID
```

### Future reconciliation command

```bash
opensoyce reconcile local-audit \
  --workspace acme-core \
  --audit-log ./dr-staging/local-audit.json \
  --dry-run
```

Do not use raw account IDs as the authority boundary.

---

## 9. Post-Incident Review Template Direction

The PIR template is useful for future break-glass governance.

### Keep

```txt
incident trigger timestamp
resolution timestamp
bypass duration
impacted trust boundary
root cause summary
chronological Timeline
component exposure mapping
reconciliation outcome
corrective actions
approval/sign-off
```

### Rewrite language

Use:

```txt
break-glass activation
local audit mode
signed decision bundle
Vault Timeline reconciliation
reviewer sign-off
artifact hash
```

Avoid:

```txt
critical governance overwrite
immutable compliance vault
HSM reconciliation seal
WebAuthn signature as current fact
block rules disabled
```

### Doctrine

```txt
Break-glass is not complete when the deployment succeeds.
It is complete when the trust debt is reconciled.
```

---

## 10. Decision-Event Reconciliation API Boundary

The DER API reference should be renamed before it creates product confusion.

Preferred names:

```txt
Decision-Event Reconciliation API
Component Exposure Reconciliation API
```

Avoid:

```txt
Dynamic Entitlement Reconciliation Engine
```

unless OpenSoyce intentionally enters CIEM territory.

### Core correction

Do not expose this as a tenant authority boundary:

```txt
X-OpenSoyce-Account-ID
```

Use:

```txt
workspace route
authenticated session
server-side membership resolution
role check
```

### Future REST shape

```txt
POST /api/vault/workspaces/:slug/component-exposures/reconcile
GET  /api/vault/workspaces/:slug/component-exposures
GET  /api/vault/workspaces/:slug/component-exposures/:id
```

### Future response language

Use:

```json
{
  "status": "review-required",
  "policy_effect": "block-future-deployments",
  "matched_exception_id": null,
  "timeline_event_id": "evt_123"
}
```

Avoid:

```json
{
  "action_taken": "REVOKE_ACTIVE_LEASE_AND_ISOLATE"
}
```

unless OpenSoyce actually performs that external action.

---

## 11. Pricing Section Boundary

The pricing section has useful commercial ideas, but exact pricing should stay internal.

### Keep

```txt
pricing based on software trust surface
tiers for Team / Platform / Enterprise
Trust Vault capacity
component exposure classes
CI/CD integrations
enterprise evidence exports
```

### Rewrite

Use softer commercial language:

```txt
Predictable pricing for software trust governance.
OpenSoyce scales with the complexity of your trust surface, not raw infrastructure log volume.
```

### Avoid

```txt
$499/month
$1,850/month
saving up to 70%
Apache 2.0 guarantee for future workers
real-time DER
HSM evidence verification seals
24/7 P0 recovery support
```

unless legal, product, and implementation support those claims.

### Safer tier framing

```txt
Team:
  repo trust checks, CLI/CI, basic Trust Vault

Platform:
  multiple workspaces, broader exposure classes, dashboard, exception workflows

Enterprise:
  advanced evidence retention, SSO, custom policy, audit exports, private deployment options
```

---

## 12. Final Expansion Classification

### Keep as strategy

```txt
SPIFFE/SPIRE identity direction
trust scope across clouds
blast-radius preview
compliance evidence export
PIR template
pricing around trust surface complexity
```

### Park for Phase 6+

```txt
component exposure reconciliation API
cloud audit evidence ingestion
custom exposure schemas
graph-assisted impact analysis
cross-cloud scope mapping
```

### Park for Phase 8+

```txt
SOC 2 evidence export
Vanta/Drata support
auditor evidence packages
enterprise compliance dashboard
cold archive compliance exports
```

### Park for much later / research

```txt
SPIFFE/SPIRE enforcement
multi-mesh synchronization
predictive graph engine
machine-learning blast modeling
gRPC streaming agents
automatic mesh isolation
```

### Do not claim

```txt
SOC 2 Type II automation
automatic containment
HSM seals
immutable compliance ledger
real-time DER
sub-second reconciliation
cloud permission control
exact pricing
cloud cost savings
fully complete platform engineering framework
```

---

## 13. Final Strategic Lock-In Rule

The dump produced real category insight.

But the repo must protect truth.

Every future doc should preserve this distinction:

```txt
Vision:
  where OpenSoyce may go.

Roadmap:
  what OpenSoyce intends to build.

Approved scope:
  what the next PR may implement.

Implemented:
  what is already merged.

Claims:
  what public copy is allowed to say.
```

Do not let vision become claims.

Do not let claims outrun implementation.

Do not let implementation blur the architecture spine.

OpenSoyce wins by being honest about trust.
