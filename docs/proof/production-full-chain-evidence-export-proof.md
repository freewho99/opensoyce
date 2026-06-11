# PR-PROOF-2 — Production Full-Chain Evidence Export Proof

## Status

Complete.

This proof demonstrates a full production OpenSoyce component-trust chain:

observed component
→ vulnerability intelligence context
→ remediation question
→ human temporary-trust decision
→ natural expiry
→ system reaper pressure
→ reviewer resolution
→ evidence export

## Summary

This proof uses a purpose-built production dogfood chain for `lodash@4.17.20`.

The record is accelerated, not fabricated. Every state transition went through deployed runtime paths. The expiry occurred by clock time. The reaper observed only after the expiry window passed. The reviewer resolved through the production app. The final evidence export was generated from existing records.

## Component

* Package: `lodash`
* Version: `4.17.20`
* Exposure id: `65d32e84-a27c-4855-a60b-c6b0be47f285`
* Source: real CLI ingest from `c:\tmp\opensoyce-proof2\deps.json`
* Workspace: `opensoyce`

## Vulnerability Context

OSV refresh recorded five real advisories for the observed package/version, including:

* `GHSA-35jh-r3h4-6jhm` — high — Command Injection in lodash
* `GHSA-r5fr-rjxr-66jc` — high — Code Injection via `_.template`
* `GHSA-xxjr-mmjv-4gpg` — medium
* `GHSA-f23m-r3pf-42rh` — medium
* `GHSA-29mw-wpgm-hmr9` — medium

OpenSoyce reproduced severity in the source vocabulary. Severity remained context, not a trust decision.

## Remediation Question

* Question id: `da53bf51-96c7-4b39-a7aa-9930926582d7`
* Kind: `vulnerability_review`
* About: `GHSA-35jh-r3h4-6jhm`
* Status: answered
* Answered by: `@freewho99`
* Selected direction: `propose_exception`

The system asked. The human decided. The record remembers.

## Trust Decision

* Exception id: `888aae0f-eb07-4eec-a16a-a093294b8c76`
* Package: `lodash`
* Proposed transition: `BLOCK → WARN`
* State after proof: `expired`
* Proposed by: `@freewho99`
* Reviewed by: `@freewho99`
* Expiry: `2026-06-11T05:04:17.099+00:00`

Public reason:

> Short-window risk acceptance for lodash 4.17.20 while the 4.17.21 upgrade lands (per answered remediation question da53bf51).

## Expiry Pressure

The exception expired naturally by clock time.

The production reaper then observed the expired active trust and transitioned the exception into expired review pressure.

Reaper execute receipt:

```txt
exception expiry reaper — EXECUTE at 2026-06-11T06:36:32.675Z

DONE  package lodash (888aae0f, scheduled 2026-06-11T05:04:17.099+00:00) — expired; CEI relationship event recorded (system actor)

reaped 1/1 — CEI events: 1 recorded, 0 already recorded, 0 not exposure-born
```

A second dry-run confirmed there were no active exceptions still past their expiry window.

## Reviewer Resolution

The expired trust case was resolved through the production app.

* Direction: `remediation_required`
* Resolved by: `@freewho99`
* Resolution record ids:

  * `08efc01d-4961-4e95-9003-19750b37ecff`
  * `c2d42dd3-9b8b-481e-b2c5-7592ec7a8253`

Honest edge: the proof chain contains two reviewer-resolution records for the same expired exception because the reviewer submitted the resolution twice during dogfood. This is acceptable in the current append-only 16B model and demonstrates that resolutions are recorded rather than mutating the exception state.

## Evidence Export

The production evidence export generated all nine sections:

1. Executive summary
2. Observation record
3. Vulnerability / risk context
4. Remediation question
5. Exception / accepted risk
6. Expiry pressure
7. Reviewer resolution
8. Receipt trail
9. Honest edges

The export states:

> An export is a view of records, not a new source of truth. Evidence shows what happened. Evidence does not certify compliance by itself.

Export artifact:

```txt
docs/proof/artifacts/pr-proof-2/lodash-full-chain-evidence-export.md
```

## What This Proof Proves

This proof demonstrates that OpenSoyce can:

* observe a component from a real CLI ingest
* attach source vulnerability context
* open a remediation question
* record a human answer
* record a temporary trust decision
* let trust expire naturally
* have the system reaper record expiry pressure
* have a reviewer resolve the expired trust case
* export the full chain as evidence

## What This Proof Does Not Prove

This proof does not claim:

* compliance certification
* vulnerability remediation completion
* absence of other vulnerabilities
* auditor acceptance
* customer security-review acceptance

A recorded direction is not completed remediation. The next product lane should make remediation evidence first-class.

## Doctrine Confirmed

Observation is not judgment.

Context is not decision.

A question is not remediation.

Temporary trust must not become permanent by neglect.

Expiry creates review pressure; expiry does not decide.

The reaper observes. The reviewer decides. The record remembers.

Export is not certification. Export is a faithful view of the record.
