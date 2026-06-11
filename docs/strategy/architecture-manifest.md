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
| Dependency-exposure ingestion (CLI) | implemented | PR-7A | PR #100 / `1b3b30b` | `opensoyce exposure ingest-dependencies` — package.json / package-lock.json / explicit JSON → dependency-exposure records via the PR-6A create API; dry-run; client-side dedupe; ingestion observes, never decides |
| CI-attributed ingestion | implemented | PR-7B | PR #101 / `107d941` | `--ci --ci-provider --repository --run-id [--job --sha --ref]` on the 7A path; `source_kind: ci`; run-specific source_ref; explicit flags only (no ambient env); attribution-only, no annotations / PR comments |
| Server-side semantic dedupe | implemented | PR-7C | PR #102 / `7928c9f` | Migration 0021: `observation_identity` + `seen_count` + `latest_source_ref` + partial unique index; upsert-touch, not unique-reject; identity = fact (name/version/manager/manifest/class), never source_ref; repetition is quiet, provenance is not erased |
| CI-native packaging (thin wrapper) | implemented | PR-7D | PR #103 / `66f9029` | `actions/ingest-dependencies` composite Action around the 7B CLI command; explicit inputs only (expressions live in the caller's workflow); session-token secret → 0600 session file, removed `if: always()`; no octokit / API / annotations / check runs / comments / policy |
| Vault/CEI production runtime | implemented | PR-RUNTIME-1 | PR #105 / `bc24bb1` | `api/vault.js` Vercel function mounting the existing `registerVaultRoutes` + `/api/vault/:path*` rewrite; fixes production finding #2 (route family was local-only since Phase 5); runtime-presence + 12-function-cap structural guards; band-drop-tick folded (and its dead claim-submit import fixed) |
| Release Integrity Guard | implemented | PR-INTEGRITY-1 | PR #106 / `3da3cf0` | `scripts/check-release-integrity.mjs` — 4 layers (static shape / schema presence / runtime presence / provider config), read-only by construction, target-coherent, strict release-gate mode; see [`release-integrity-guard.md`](./release-integrity-guard.md) |
| Production CEI decision loop proof | implemented | PR-PROOF-1 | PR #107 / `771cabb` | First category artifact: [`production-cei-decision-loop-proof.md`](../proof/production-cei-decision-loop-proof.md) + 7 production screenshots; proof-package artifact #7; honest-edges section; no compliance claims |
| SOC 2 evidence map | implemented | PR-14B | PR #108 / `1035f85` | Doc-level map of trust records to audit-relevant evidence questions — [`soc2-evidence-map.md`](./soc2-evidence-map.md); buyer/auditor language, honest gaps per lane, NO compliance claims; the bridge from proof artifact to evidence exports (lane 17) |
| Vulnerability-intelligence observations | implemented | PR-15A | PR #109 / `5449aae` | Migration 0022 `component_exposure_vulnerabilities` — intel as CONTEXT attached to dependency exposures (Option B: context table, native catalog stays at 6); on-demand OSV version-query association; 7C dedupe discipline; structurally cannot decide anything; closes the evidence-map Q3 seam for the shipped scope |
| Remediation Question Loop | implemented | PR-15B | this PR | Migration 0023 `component_remediation_questions` — the QUESTION layer on observed component risk: opened from a dependency exposure or its attached intelligence; six bounded human directions (fix / defer / propose-exception / not-applicable / owner-review / replace-or-remove); answer-coherence CHECK (no answer without a human); propose_exception routes through the Phase 5 lane (no FK to vault_exceptions); no auto-remediation, no policy engine, no overdue transition (due_at is recorded context; lane 16 owns pressure) |

**Phase 5 is CLOSED.** See [`phase-5-closeout.md`](./phase-5-closeout.md) for the full handoff record.

**The Phase 6 proposal/audit loop is CLOSED.** See [`phase-6-closeout.md`](./phase-6-closeout.md) for the full handoff record and [`../proof/cei-decision-loop-demo.md`](../proof/cei-decision-loop-demo.md) for the runnable walkthrough.

## Approved Next

_(none — PR-7D closed the packaging lane; further lanes are parked and each requires explicit user approval with a scope block before any implementation begins)_

## Parked — forward lanes (per [`post-7c-strategy-update.md`](./post-7c-strategy-update.md))

| Artifact | Status | Lane | Purpose |
|---|---:|---|---|
| 15A+ intelligence extensions | parked | 15A+ | Continuous/at-ingest enrichment, scanner-output ingestion, malicious-package signal feeds, license-risk intelligence; PR-15A shipped on-demand OSV association only |
| 15B+ remediation extensions | parked | 15B+ | PR-15B shipped the question loop (open + human answer); remediation COMPLETION tracking (a fix path is not proof of fix), question cancellation flow, and due_at overdue pressure (lane 16) remain parked |
| Broader ecosystems / SBOM | parked | 15C | pnpm / yarn / poetry / uv, CycloneDX/SPDX, scanner/SBOM input formats |
| Expiry reaper + expired-outcome event | parked | 16 | active→expired transition; owns `exception_expired_from_exposure` + the actor-nullability decision |
| Exposure status lifecycle | parked | 16 | `observed` → `resolved`, stale exposure, overdue remediation, exception review pressure |
| Enterprise evidence exports | parked | 17 | SOC 2 evidence bundle, auditor packet, customer-security-review packet, Vanta/Drata-style export |
| Trust agent | parked | 18 | Drafts recommendations / evidence summaries / remediation options / review prompts; NEVER decides |
| Vault health endpoint (`/api/vault/health`) | parked | optional | Would let the integrity guard verify schema presence without service credentials; new endpoint, own scope block |
| CLI seen_again reporting | parked | minor | Teach the CLI to report created vs seen-again from the 7C response body; possibly drop the redundant client-side scan |
| GitHub-native judgment surfaces (annotations / PR comments / check runs) | parked | minor | A NEW product surface, deliberately not "packaging"; own scope block after the observation lane earns operational trust |
| Versioned action releases (`@v1` tags) | parked | minor | Release-management decision after the wrapper is dogfooded |
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
