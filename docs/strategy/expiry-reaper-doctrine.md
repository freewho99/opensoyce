# Exception Expiry Doctrine (PR-16A)

Status: implemented (PR-16A)
Scope: how temporary accepted risk becomes visible again — and what the system deliberately does NOT do about it.

## The doctrine

```txt
Temporary trust must not become permanent by neglect.
Expiry is time evidence, not reviewer judgment.
The reaper observes that time passed.
The reaper does not decide the risk.
The record remembers that review pressure became due.
```

And the boundary, exactly:

```txt
An expired exception is not a revoked exception.
An expired exception is not an approved renewal.
An expired exception is not proof of remediation.
The reviewer still decides what happens next.
```

## What expiry IS in the record

An exception was approved with a REQUIRED `expires_at` (SQL CHECK since Phase 5). When that window elapses, the reaper (`npm run reap:exceptions -- --execute`) performs exactly one transition: `active → expired`, touching ONLY the state column. The original reviewer, approval timestamp, scheduled expiry, reasons, and proof anchors are preserved verbatim — the original decision remains the record.

Three audit surfaces record it, each in its own lane:

1. **The exception row** — state `expired`, distinct from `revoked` / `rejected` / `active` in the same Phase 5 state machine that has carried the value since migration 0011.
2. **The Vault Timeline** — the 0015 trigger emits `exception_expired` with a NULL actor ("reaper; no actor") in the SAME transaction as the flip. The system's observation is provenance-honest: no human is impersonated.
3. **The CEI relationship audit** — `exception_expired_from_exposure` (migration 0024), recorded ONLY when the exception was originally proposed from an exposure, discovered via the 6D proposal event. The first system-actor event in that table: `actor_user_id` is NULL, permitted for this one kind only, with `actor_kind: system` and `reason: expires_at elapsed` in the metadata. At most one expired event per exception, ever — idempotency is a partial unique index, not a convention.

## What expiry is NOT

The reaper cannot revoke, approve, reject, renew, or extend. It cannot mutate an exposure, create a remediation question, or open a proposal. It writes no gate action. It is review PRESSURE: "this accepted risk has passed its allowed time window; it needs human attention" — never auto-punishment.

Review pressure also exists before the reaper runs: the dashboard marks a still-active exception past its window as **review due ⚠** at read time, so the gap between elapse and observation is loud, not hidden.

## SOC 2 evidence support (and the non-claim)

This lane answers the auditor question "how do you prove accepted risk does not silently become permanent?" with records: required expiry on approval, a system-recorded expiry transition with preserved decision history, and visible review pressure. See [`soc2-evidence-map.md`](./soc2-evidence-map.md) Q5.

OpenSoyce records when accepted component risk has passed its expiry window and needs review. OpenSoyce does NOT remediate expired risk, revoke risk automatically, prove a vulnerability is fixed, guarantee compliance, or provide SOC 2 compliance.

## Deliberately deferred

- **Renewal / closeout path** — what a reviewer does WITH an expired exception (renew, revoke, remediate, close) is lane 16B, a decision lane with its own scope block.
- **Scheduling** — the reaper is an explicit command (safe-by-default dry-run; `--execute` to act). Wiring it to a cron is an ops decision, not part of this PR.
- **Exposure staleness / remediation-question due_at pressure** — same doctrine, different records; future 16-lane work.
