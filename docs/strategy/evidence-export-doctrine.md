# Evidence Export Doctrine (PR-17A)

Status: implemented (PR-17A) — one component trust-decision chain, exported as an evidence bundle
Scope: the doctrine wall for every export surface, present and future. No compliance claims.

## The doctrine, exactly

A control matrix without records behind it is a claim.
An export is a view of records, not a new source of truth.
Evidence shows what happened.
Evidence does not certify compliance by itself.
OpenSoyce produces audit-ready evidence; auditors decide audit outcomes.

## The key boundary

Export is not certification.
Export is not a decision.
Export is a faithful view of the record.

## What 17A ships

One private, workspace-scoped read:

```txt
GET /api/vault/workspaces/:slug/exposures/:id/evidence-export
```

It assembles the chain the records themselves assert, anchored on one
component observation:

```txt
observation          component_exposures           what was observed, by what source, when
context              component_exposure_vulnerabilities   what the source asserted (severity in the SOURCE's vocabulary)
question             component_remediation_questions      what the system asked; what a human selected
decision             vault_exceptions              who proposed, who reviewed, what was accepted, until when
expiry pressure      reaper state + CEI system event + timeline event   time truth, observed not decided
resolution           vault_exception_resolutions   what the reviewer decided after expiry
receipts             CEI events + Vault timeline + proof anchors + record ids
honest edges         what this proves, what it does not, what is absent
```

The response carries both the JSON bundle and its Markdown rendering. The
exposure detail page offers view / copy / download. That is the entire
surface.

## The walls, structurally enforced

- **Read-only by construction.** The export module contains no insert,
  update, upsert, delete, or RPC call — the test suite greps for write
  verbs and fails on any. Generating an export creates no CEI event, no
  timeline event, no exception, no question, no resolution. The record is
  exactly the same after the export as before it.
- **Faithful, never embellished.** Record ids and timestamps are
  reproduced verbatim. Actor identity appears exactly where the workspace
  already sees it. The renderer adds formatting, never facts.
- **Honest about absence.** A chain link that does not exist is reported
  as "not present in the record" — never fabricated, never smoothed over.
  "No intelligence recorded" explicitly means the record holds none, not
  that no vulnerabilities exist.
- **Severity stays source vocabulary.** The bundle field is named
  `severity_as_reported_by_source`; nothing maps severity to a decision.
- **Private reasoning stays private.** `reason_private` is never selected
  and never exported. Public reasons only; the export says so.
- **Private surface only.** Session + workspace membership,
  404-on-non-member, private cache headers. There is no public export
  route, no auditor portal, no customer portal.
- **Non-claims travel with the evidence.** Every bundle embeds its own
  honest-edges section — what it proves, what it does not prove — in both
  the JSON and the Markdown. A bundle separated from this doctrine doc
  still carries the boundary.

## What the export proves

- A component observation was recorded, with source provenance and timestamps.
- The risk context shown is what the cited source asserted at recording time.
- The questions, decisions, expiry observations, and resolutions shown
  were recorded by the identified actors at the identified times.
- Each step links to the underlying record by id.

## What the export does not prove

- It is not a compliance certification, and OpenSoyce does not certify controls.
- It does not prove a vulnerability was remediated — a recorded direction
  is not a completed action.
- It does not prove the absence of vulnerabilities.
- It does not replace an auditor or guarantee acceptance by any customer
  security review.

## The sentence this lane earns

> OpenSoyce turns component-risk workflows into audit-ready evidence.

Earned because the bundle is projected FROM live production records —
observation, context, question, decision, pressure, resolution — not
asserted beside them. The records came first; the export is their view.

## Parked, deliberately

Workspace-wide packets and multi-component roll-ups; PDF; Vanta/Drata
projection; auditor/customer portals; control-ID matrices; export
scheduling and delivery. Each requires its own explicit scope block. This
document authorizes none of them.
