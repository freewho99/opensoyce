# PR-PROOF-6 — Production Evidence Citation Check Proof

## Status

Complete.

This proof publishes the first production run of the PR-EV-1 citation check (PR #123 / commit `3a81b7e`, migration `0028`): a human-cited remediation evidence row checked against an internal OpenSoyce exposure record, producing `check_passed` while preserving every non-claim.

## Core claim

OpenSoyce can check cited remediation evidence without turning the check into certification. A passing citation check means the cited record exists, belongs to the workspace, and matches the expected evidence shape at check time. It does not prove the vulnerability is fixed, certify remediation, or prove absence of vulnerabilities.

Before EV-1: OpenSoyce records human-cited remediation evidence.
After EV-1: OpenSoyce can check the citation without pretending it certified the fix.

## The check (2026-06-12, ~09:34 UTC, production)

| | |
|---|---|
| Evidence checked | `eccefc1a-9a86-4a62-9f24-63ce44dd4501` (the PR-PROOF-3 evidence row) |
| Check kind | `internal_exposure_reference` |
| Result | **`check_passed`** |
| Cited exposure | `28f6c108-…` — the real `lodash@4.17.21` follow-up observation |
| Original exposure | `65d32e84-…` — the `lodash@4.17.20` chain |
| Version comparison | `{ different: true, comparable: true, later: true }` |
| Checked by | `@freewho99` (session-driven; the check records who asked) |

The check's own summary, verbatim from production ([full receipt](./artifacts/pr-proof-6/01-citation-check-result.json)):

> internal_record_linked: the cited exposure exists in this workspace and observes lodash@4.17.21, later than the original 4.17.20. **This does not claim the vulnerability is fixed.**

Every check response carries the non-claim: *A passing citation check does not certify remediation or prove absence of vulnerabilities.*

## The first 11-section production bundle

Regenerating the single-chain export after the check produced the first eleven-section production bundle ([verbatim](./artifacts/pr-proof-6/first-11-section-production-bundle.md)), honest-edges `missing: []`. The chain on `65d32e84` now reads, in one document:

```txt
observed (5 OSV advisories attached)
→ remediation question asked and answered
→ temporary trust recorded, expired by clock time
→ reaper recorded pressure (system actor)
→ reviewer directed (remediation_required)
→ human cited evidence (the 4.17.21 observation)
→ system checked the citation (check_passed)
→ receipts and honest edges preserve all of it
```

Sections 7, 8, and 9 are the distinction this proof exists for: the reviewer **directed**, a human **cited**, the system **checked the citation** — three distinct append-only records, none of them a verdict.

## Composition held

The rollup packet regenerated immediately after shows the check composing through the shared per-chain path with no extra wiring ([packet receipt](./artifacts/pr-proof-6/02-rollup-packet-with-check.md)) — the 17B architecture consuming the EV-1 record the day it was born.

## Receipts

* [`00-dogfood-transcript.txt`](./artifacts/pr-proof-6/00-dogfood-transcript.txt) — the full six-step run, including the certification-language sweep (clean) and the `b777fb25` read-back
* [`01-citation-check-result.json`](./artifacts/pr-proof-6/01-citation-check-result.json) — the check record as production returned it
* [`first-11-section-production-bundle.md`](./artifacts/pr-proof-6/first-11-section-production-bundle.md) — the bundle, verbatim
* [`02-rollup-packet-with-check.md`](./artifacts/pr-proof-6/02-rollup-packet-with-check.md) — the packet, verbatim

## Honest edges

* `check_passed` means the citation was reachable and matched the expected internal record shape at check time.
* The check does not certify remediation.
* The check does not prove absence of vulnerabilities — `lodash@4.17.21` is itself still matched by other advisories; the check never said otherwise.
* The check does not prove the real-world fix is complete.
* The human cited the evidence; OpenSoyce checked the citation.
* The original trust decision, reviewer direction, remediation evidence, and citation check remain distinct append-only records — nothing was edited, transitioned, or closed by checking.
* `b777fb25` was read-only and untouched: still `active`, expires `2026-07-10T17:32:32Z`.

## What this proof does not claim

No compliance certification. No remediation verification. No vulnerability-absence claim. A citation check is a system observation about a reference, made at a point in time, recorded beside the human's evidence — never above it.

## Doctrine confirmed

Evidence verification checks citations; it does not certify truth.

A passing check confirms the citation, not the remediation.

Inconclusive is an honest answer.

The human records evidence. The system may check the reference. The export preserves both.
