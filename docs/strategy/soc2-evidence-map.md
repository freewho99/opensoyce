# SOC 2 Evidence Map

Status: implemented (PR-14B) — a doc-level evidence map, not a product feature
Scope: map software-component trust records to audit-relevant evidence questions. No compliance claims.

## The claim, exactly

OpenSoyce maps software-component trust records to audit-relevant evidence questions.

OpenSoyce produces audit-ready evidence for software-component trust, vulnerability review, exception approval, remediation decisions, and customer/security review workflows.

What OpenSoyce does NOT claim:

- OpenSoyce does not make you SOC 2 compliant.
- OpenSoyce is not SOC 2 certified and does not certify anyone.
- OpenSoyce does not replace Vanta, Drata, or an auditor.
- This map uses SOC 2-style vocabulary as buyer language. It is not a control-ID-by-control-ID matrix; a formal control mapping belongs to the evidence-export lane (17) if and when it is authorized.

The do-not-claim firewall in [`architecture-manifest.md`](./architecture-manifest.md) governs every public sentence derived from this document.

## How to read this map

Each entry is a question a buyer, security reviewer, or auditor actually asks, mapped to the records that answer it — and, where the answer is partial, an honest gap with the lane that owns it. The credibility engine is honesty: the gaps make the evidence stronger, not weaker, because they prove the map describes what exists rather than what is aspired to.

Live proof behind this map: [Production CEI Decision Loop Proof](../proof/production-cei-decision-loop-proof.md) — every record type referenced below was produced by production on 2026-06-10 and screenshotted.

---

## Q1 — "What open-source components are in use, and how do you know?"

**Evidence:**

- `component_exposures` — one record per observed dependency fact: `subject_name`, version, `package_manager`, `manifest_kind` (in `metadata` / `trust_boundary`)
- `source_kind` (`cli` / `ci`) + `source_ref` — WHERE each observation came from: the file path, or the CI provider/repo/run that saw it
- Ingestion lanes: local CLI (`opensoyce exposure ingest-dependencies`), CI-attributed (`--ci` flags), GitHub Action wrapper — all explicit-input, no ambient environment sniffing

**Honest gap:** npm package metadata only today. Other ecosystems, SBOM (CycloneDX/SPDX), and scanner-output ingestion are parked (lane 15C / 15A).

## Q2 — "How do you know the inventory is current, and how do you handle repeated observations?"

**Evidence:**

- `first_seen_at` / `last_seen_at` — when the fact entered the record and when it was last re-observed
- `seen_count` — bounded repeat-observation metadata
- `latest_source_ref` — the most recent sighting's provenance, with the FIRST sighting's `source_ref` preserved unchanged
- Server-side semantic dedupe (migration 0021): repeated equivalent observations touch one stable row instead of polluting the record

Doctrine on the record: *Observation is not judgment. Repetition is not new evidence. Provenance must not be erased.*

**Honest gap:** staleness has no enforcement pressure yet — nothing flags an exposure that hasn't been re-observed. Lifecycle lane (16).

## Q3 — "How do you know a vulnerable component was observed?"

**Evidence (the seam closed by PR-15A, scoped to what shipped):**

- `component_exposure_vulnerabilities` — vulnerability intelligence recorded as CONTEXT attached to an observed dependency exposure: vulnerability id (OSV/GHSA/CVE), source, severity as-provided, affected range, `match_basis` (source-asserted: an OSV version query for the exact observed package@version), and full provenance (`source_ref`, `first_seen_at` / `last_seen_at` / `seen_count` with the 7C dedupe discipline)
- The private exposure detail shows the intelligence beside the observation, under the doctrine copy: *intelligence is context only — it opens a review question; it does not decide the answer*
- Structurally enforced: intelligence never mutates exposure status, never creates an exception/proposal/outcome, and the table has no status column — context has no lifecycle. Unmatched intelligence creates no records (`exposure_id` is NOT NULL by design)
- *Vulnerability identification* on the public OTS surface (gate, OSV overlay, workflow-pattern scan) continues unchanged and never reads the private table

**Honest scope of the join:** association is on-demand per exposure ("check vulnerability intelligence"), against OSV, for npm dependency exposures with an observed version. Continuous/at-ingest enrichment, scanner-output ingestion, malicious-package signal feeds, and license-risk intelligence remain parked (15A+ extensions / 15C). Turning attached intelligence into a reviewable remediation question shipped as PR-15B — see Q3a.

## Q3a — "A risky component was observed. What did the organization decide to do about it?"

**Evidence (the question layer shipped by PR-15B, scoped to what shipped):**

- `component_remediation_questions` — one record per remediation question opened on an observed dependency exposure: what was asked (`question_kind`: vulnerability review or component risk review), about what exactly (denormalized `package_name`, `observed_version`, `vuln_id`), anchored to what (`source_exposure_id`, required; `source_vuln_intel_id`, when intelligence prompted it), opened by whom and when
- The human-selected direction: `selected_outcome` ∈ fix required / defer / propose exception / not applicable / needs owner review / replace or remove — with `answered_by` + `answered_at` required by SQL CHECK whenever a question is answered. The schema itself cannot record an answer without a human
- The question detail page separates, visibly: the observation, the vulnerability context, the question, and the human-selected outcome — the structure of the evidence mirrors the structure of the doctrine
- Structurally enforced: opening or answering a question never mutates exposure status, never creates an exception or proposal, never records a reviewer outcome event. When the human selects *propose exception*, the record stores the direction and the actual proposal still travels the Phase 5 exception lane with its own reviewer approval (Q4)

Doctrine on the record: *the scanner observes; intelligence adds context; the system asks; the human decides; the record remembers. A remediation question is not a remediation decision.*

**Honest gaps:** a recorded direction is not a completed remediation — nothing verifies that "fix required" was fixed (a fix path is not proof of fix; completion tracking is future work). `due_at` is recorded context with no overdue pressure (lane 16). The answered question is not yet exportable as an auditor packet (lane 17). OpenSoyce opens and records remediation questions for observed component risk; it does not remediate vulnerabilities, fix dependencies automatically, or close vulnerabilities.

## Q4 — "How do you know risk acceptance was reviewed, and by whom?"

**Evidence:**

- The exception state machine: `proposed → active` only through an explicit reviewer action, recording `reviewed_by` + `reviewed_at`
- Four-eye principle: a reviewer cannot approve their own proposal (workspace owners may — recorded either way)
- Reviewer source context (6E): the review page shows WHICH exposure suggested the proposal — *"Context only — you still decide"*
- CEI event history (6D + 6F): `exception_proposed_from_exposure` and `exception_approved_from_exposure` / `_rejected_` / `_revoked_`, each with actor and timestamp
- Vault Timeline: independent, trigger-emitted records of every state transition — a second audit surface written by the database, not by the UI

Nothing auto-decides. The exposure suggested; the human proposed; the reviewer decided; the record remembers — in two independent surfaces.

## Q5 — "How do you prove accepted risk does not silently become permanent?"

**Evidence:**

- `expires_at` is REQUIRED for an active exception — enforced by SQL CHECK, not convention
- Severity-downgrade-only CHECK: an exception can only loosen `BLOCK→WARN|ALLOW` or `WARN→ALLOW`, never tighten-then-hide
- `extend` must move `expires_at` forward and records the reviewer; `revoke` is always available and records actor + reason
- Full status history in the Timeline; the decision trail never overwrites itself

**Evidence (the reaper shipped by PR-16A, scoped to what shipped):**

- The reaper (`reap:exceptions`) transitions `active → expired` when `expires_at` elapses — touching ONLY the state column. The original reviewer, approval timestamp, expiry, reasons, and anchors are preserved verbatim: the original decision remains the record
- Three independent audit surfaces: the state machine (expired ≠ revoked ≠ rejected, distinct values since migration 0011), the Vault Timeline (`exception_expired`, trigger-emitted in the same transaction, NULL actor — the system does not impersonate a human), and the CEI relationship event (`exception_expired_from_exposure`, system actor, recorded only where an exposure relationship already exists)
- Idempotency is structural: the transition is guarded (`state = 'active'`), and at most one expired CEI event can ever exist per exception (partial unique index, migration 0024)
- Read-time pressure even before the reaper runs: the dashboard marks a still-active exception past its window as **review due ⚠**

Doctrine: *expiry is time evidence, not reviewer judgment — the reaper observes that time passed; it does not decide the risk.* See [`expiry-reaper-doctrine.md`](./expiry-reaper-doctrine.md).

**Evidence (the resolution lane shipped by PR-16B):**

- `vault_exception_resolutions` — the expired exception as a REVIEW CASE: append-only, reviewer-authored resolutions (`resolved_by` NOT NULL by schema — no system resolution exists), each with a required reason and one of six bounded directions: renew / revoke / remediation required / resolved externally / defer / remediation question
- **Renewal is never silent**: "renew" must cite a NEW exception created through the existing propose lane and approved through the existing reviewer lane with its own fresh expiry — citation coherence is a SQL CHECK, a renewal cannot cite itself, and the resolution module structurally cannot write `vault_exceptions` (no revive, no extension)
- The full loop is now recorded end to end: approval with required expiry → time elapsed → system observed (16A) → reviewer resolved (16B) — with the original decision preserved at every step

**Honest gaps:** the reaper is an explicit command (safe-by-default dry-run), not a scheduled job — unattended enforcement cadence is an ops decision not yet wired; the first production reap is deliberately manual (human presence for the first live system mutation). A recorded resolution direction is not a completed action — nothing verifies "remediation required" was remediated. The live exception from the proof run (`b777fb25`, expires 2026-07-10) is the first real-world reap-and-resolve candidate.

## Q6 — "Can you trace a decision back to the observation that prompted it?"

**Evidence:**

- The proposed exception carries a `live-surface` proof anchor pointing at the source exposure
- CEI events link `exposure_id ↔ related_exception_id` — deliberately as AUDIT ROWS, not foreign keys on the decision tables, so the relationship is recorded without coupling the observation to the decision's lifecycle
- The exposure's Decision history shows the full arc in one place: proposed, then the reviewer outcome

Doctrine: the exposure suggests a trust decision; it does not become one. The trail proves the suggestion, the human decision, and the relationship — separately.

## Q7 — "What can you show an auditor or a customer's security review?"

**Evidence today:**

- The live private surfaces themselves: exposures, exceptions, Decision history, Vault Timeline — every screenshot in the [production proof artifact](../proof/production-cei-decision-loop-proof.md) is reproducible on demand
- This map, as the index from question to record
- The release integrity guard (`check:release-integrity`) — evidence that the production system itself is verified to be able to produce the record (schema, runtime, configuration)

**Honest gap:** there is no export bundle. Auditor packets, customer-security-review packets, and Vanta/Drata-style projections are lane 17 — they project FROM the records this map describes, which is why the records came first.

---

## The bridge this map builds

```txt
category artifact            (the production proof, with receipts)
        ↓
this evidence map            (records translated to buyer/auditor questions)
        ↓
evidence exports (lane 17)   (packets projected from the same records)
```

The order is deliberate: prove the loop, translate the proof, then package it. A control matrix without records behind it is the kind of claim OpenSoyce exists to replace.

## Lane dependencies named by this map

| Gap named above | Lane |
|---|---|
| Vulnerability intel joined into the private record | 15A scanner/intel observations — SHIPPED (Q3) |
| Remediation decisions as first-class reviewable questions | 15B Remediation Question Loop — SHIPPED (Q3a); completion tracking remains future work |
| Ecosystems beyond npm, SBOM formats | 15C |
| Expiry reaper + review pressure | 16A — SHIPPED (Q5); scheduling is an ops decision |
| Reviewer resolution of expired trust | 16B — SHIPPED (Q5); resolution-completion verification remains future work |
| Staleness + due_at pressure | 16+ lifecycle |
| Auditor / customer packets, GRC-tool projection | 17 evidence exports |

Each requires its own explicit scope block. This document authorizes none of them.
