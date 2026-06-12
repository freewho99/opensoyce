# PR-PROOF-4 — Production Rollup Evidence Packet Proof

## Status

Complete.

This proof publishes the first production OpenSoyce **rollup evidence packet** (PR-17B, PR #119 / commit `7bbadd0`): multiple existing component trust chains composed into one buyer/security-review-ready artifact, with mixed trust states preserved and honest non-claims intact.

## Core claim

A rollup packet is composition, not certification. It aggregates existing records and preserves their state honestly.

> OpenSoyce can compose multiple component trust chains into one evidence packet while preserving mixed states, missing evidence, active temporary trust, remediation evidence, and honest non-claims.

This is the proof that OpenSoyce is not just a chain viewer — it can produce a packet a buyer or security reviewer can actually consume, without flattening reality into a false green check.

## How this proof was produced

Read-only. The packet was generated against live production by the deployed PR-17B route:

```txt
GET https://www.opensoyce.com/api/vault/workspaces/opensoyce/evidence-packet
-> HTTP 200 · opensoyce-evidence-packet v1 · visibility: private
```

The rollup route is GET-only — there is no write path in the lane. Generating the packet read the workspace's existing records and composed them; it mutated nothing. The packet was generated twice (04:25Z and a 04:35Z re-fetch) and is byte-stable except for the `generated_at` line — same records, same composition.

The route is deployed **and** private, confirmed by an unauthenticated probe:

```txt
GET .../workspaces/__guard__/evidence-packet  (no session)
-> HTTP 401 {"error":"auth-required"}
```

## What the packet shows — mixed states, in one document

The production workspace packet (full artifact: [`production-workspace-evidence-packet.md`](./artifacts/pr-proof-4/production-workspace-evidence-packet.md)) reports its state rollup without collapsing it:

```txt
Chains included in full detail: 2
Decision-bearing among them: 2
Remediation evidence recorded: 1
Awaiting remediation evidence: 0
Active temporary trust: 1
Expired exceptions pending reviewer resolution: 0
Expired exceptions reviewer-resolved: 1
Chains with sections not present in the record: 1
Observation-only exposures (inventory below): 4
exception states observed: ["active", "expired"]
```

### Chain 3.1 — an `evidence_recorded` chain (the PR-PROOF-3 loop)

`package lodash@4.17.20` (exposure `65d32e84-…`): 5 vulnerability-context records, 1 remediation question, exception `888aae0f-…` **expired and reviewer-resolved**, remediation case **`evidence_recorded`** (the human-cited follow-up from PR-PROOF-3). The full closed loop, composed into the packet — not re-derived.

### Chain 3.2 — an active temporary-trust chain (`b777fb25`, read-only)

`package express@4.21.2` (exposure `92c698f4-…`): exception **`b777fb25-…` active**, expires `2026-07-10T17:32:32Z`, remediation case `no_remediation_direction`. The packet honestly marks **3 sections not present in this chain's record** (no expiry pressure yet, no reviewer resolution, no remediation evidence — because the trust is still active). This is the July 10 natural long-run proof, included by composition and **left untouched**.

### Observation-only inventory

**4 observed components with no trust decision recorded yet**, listed compactly rather than expanded into full chains. An observation is not a decision; the absence of a decision is reported, not hidden.

## Honest edges (carried by the packet itself)

Packet-level non-claims, verbatim from the artifact:

* This packet is not a compliance certification.
* This packet does not prove the absence of vulnerabilities.
* This packet does not prove remediation unless human-cited evidence exists for that chain.
* OpenSoyce validates record presence and linkage, not real-world fix completion.
* Observation-only components may have no trust decision yet.
* A selected packet is not a complete release attestation unless the caller supplied a complete release/component set.

Plus, for this specific proof:

* `b777fb25` was **read** by the rollup route (GET only) and **not mutated** — verified after generation: state `active`, `expires_at 2026-07-10T17:32:32Z`, original reviewer preserved ([`04-b777fb25-untouched.json`](./artifacts/pr-proof-4/04-b777fb25-untouched.json)).
* This is a **workspace evidence packet, not a release attestation**.

## Artifacts

* [`production-workspace-evidence-packet.md`](./artifacts/pr-proof-4/production-workspace-evidence-packet.md) — the packet, verbatim as production composed it
* [`01-packet-probe.txt`](./artifacts/pr-proof-4/01-packet-probe.txt) — unauthenticated 401 probe (route deployed and private)
* [`02-production-success.txt`](./artifacts/pr-proof-4/02-production-success.txt) — the HTTP 200 success receipt with the full state rollup and chain summary
* [`04-b777fb25-untouched.json`](./artifacts/pr-proof-4/04-b777fb25-untouched.json) — `b777fb25` read back after generation, still `active`, unchanged

## What this proof does not claim

No compliance certification. No proof of vulnerability absence. No proof of remediation beyond the human-cited evidence each chain already carries. No release attestation. The packet is a faithful composition of existing records; the auditors decide audit outcomes.

## Doctrine confirmed

A rollup is composition, not certification.

17B composes existing truth; it does not create new truth.

Mixed states are the honest shape of a live record — reported, never collapsed.

The packet can be sent. The records remain the source of truth.
