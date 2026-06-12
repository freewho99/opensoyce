# Evidence packet — Workspace evidence packet

> A rollup is composition, not certification.
> Per-chain evidence remains the source of truth; this packet adds counting, grouping, and formatting — no new facts.

## 1. Executive summary

- Workspace: `opensoyce` (OpenSoyce)
- Selection: Workspace evidence packet (mode: workspace)
- Generated: 2026-06-12T09:34:55.617Z
- Scope: A composition of existing per-chain evidence bundles plus a compact observation inventory. Per-chain evidence remains the source of truth; this packet adds counting, grouping, and formatting — no new facts.
- Visibility: private

## 2. State rollup

- Chains included in full detail: 2
- Decision-bearing among them: 2
- Remediation evidence recorded: 1
- Awaiting remediation evidence: 0
- Active temporary trust: 1
- Expired exceptions pending reviewer resolution: 0
- Expired exceptions reviewer-resolved: 1
- Chains with sections not present in the record: 1
- Observation-only exposures (inventory below): 4

Mixed states are the honest shape of a live record. This packet reports them; it does not collapse them into a single verdict.

## 3. Component trust chains

### 3.1 package `lodash`@`4.17.20`

- Exposure: `65d32e84-a27c-4855-a60b-c6b0be47f285` · observation status: observed
- Vulnerability context records: 5 · remediation questions: 1
- Exception `888aae0f-eb07-4eec-a16a-a093294b8c76` — state: expired · expires/expired: 2026-06-11T05:04:17.099+00:00 · reviewer-resolved
- Reviewer directions: `remediation_required`, `remediation_required`
- Remediation case: evidence_recorded (2 evidence records)
- Full chain bundle: `GET /api/vault/workspaces/opensoyce/exposures/65d32e84-a27c-4855-a60b-c6b0be47f285/evidence-export`

### 3.2 package `express`@`4.21.2`

- Exposure: `92c698f4-1e25-4d6a-ac0e-ccd223d31889` · observation status: observed
- Vulnerability context records: 0 · remediation questions: 1
- Exception `b777fb25-d024-4571-8e8f-5471e7653671` — state: active · expires/expired: 2026-07-10T17:32:32.433+00:00
- Remediation case: no_remediation_direction
- Not present in this chain's record: 3 section(s) — detailed in the honest edges below
- Full chain bundle: `GET /api/vault/workspaces/opensoyce/exposures/92c698f4-1e25-4d6a-ac0e-ccd223d31889/evidence-export`

## 4. Observation-only inventory

Observed components with no trust decision recorded yet. An observation is not a decision; absence of a decision is reported, not hidden.

- package `lodash`@`4.17.21` — status observed · source cli · first seen 2026-06-12T03:25:39.001924+00:00 · last seen 2026-06-12T03:25:39.001924+00:00 · seen ×1 · exposure `28f6c108-60ec-4841-88c9-85af11ab086f`
- package `typescript`@`5.6.3` — status observed · source cli · first seen 2026-06-10T17:29:05.102697+00:00 · last seen 2026-06-10T17:29:32.997+00:00 · seen ×2 · exposure `ef8ab0af-703c-4076-87e5-10a24752e37e`
- package `js-yaml`@`4.1.1` — status observed · source cli · first seen 2026-06-10T17:29:04.873492+00:00 · last seen 2026-06-10T17:29:32.649+00:00 · seen ×2 · exposure `094e334a-f45c-4480-b3ac-1da040cbaa76`
- package `@supabase/supabase-js`@`2.106.0` — status observed · source cli · first seen 2026-06-10T17:29:04.38789+00:00 · last seen 2026-06-10T17:29:32.074+00:00 · seen ×2 · exposure `8ebbfb61-9e11-4b6d-af30-5a138fb5689b`

## 5. SOC2 evidence question map

Evidence relevant to internal SOC2 readiness questions, in the internal Q1-Q7 vocabulary of the OpenSoyce evidence map. This packet may support review. It does not map to official control IDs and is not a compliance certification.

- **Q1** — What open-source components are in use, and how do you know?
  - draws on: observation records (chains + inventory) with source provenance
- **Q2** — How do you know the inventory is current, and how are repeats handled?
  - draws on: first/last seen timestamps and seen counts on every observation
- **Q3** — How do you know a vulnerable component was observed?
  - draws on: vulnerability/risk context sections, severity in the source vocabulary
- **Q3a** — What did the organization decide to do about observed risk?
  - draws on: remediation question and remediation evidence sections
- **Q4** — How do you know risk acceptance was reviewed, and by whom?
  - draws on: exception sections with reviewer identity and timestamps
- **Q5** — How do you prove accepted risk does not silently become permanent?
  - draws on: expiry pressure and reviewer resolution sections
- **Q6** — Can you trace a decision back to the observation that prompted it?
  - draws on: receipt trails and record ids in every chain
- **Q7** — What can you show an auditor or a customer security review?
  - draws on: this packet and the per-chain bundles it composes

## 6. Honest edges

Packet-level non-claims:

- This packet is not a compliance certification.
- This packet does not prove the absence of vulnerabilities.
- This packet does not prove remediation unless human-cited evidence exists for that chain.
- OpenSoyce validates record presence and linkage, not real-world fix completion.
- Observation-only components may have no trust decision yet.
- A selected packet is not a complete release attestation unless the caller supplied a complete release/component set.

Per-chain sections not present in the record:

- package express@4.21.2 (`92c698f4-1e25-4d6a-ac0e-ccd223d31889`):
  - vulnerability intelligence (no context rows recorded for this observation)
  - expiry pressure (no exception from this observation has expired)
  - reviewer resolutions (no expired review case has been resolved)

Per-chain non-claims (apply to every chain in this packet):

- This export is not a compliance certification, and OpenSoyce does not certify controls.
- It does not prove a vulnerability was remediated — a recorded direction is not a completed action.
- Remediation evidence, where present, is human-cited: OpenSoyce validates that evidence is present and referenced; it does not verify the fix.
- A passing citation check does not certify remediation or prove absence of vulnerabilities.
- It does not prove the absence of vulnerabilities — "no intelligence recorded" means the record holds none, not that none exist.
- It does not replace an auditor or guarantee acceptance by any customer security review.

---

Generated by OpenSoyce at 2026-06-12T09:34:55.617Z. This packet is a faithful composition of private workspace records and is not a compliance certification.
