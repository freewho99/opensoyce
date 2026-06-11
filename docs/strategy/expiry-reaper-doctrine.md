# Exception Expiry Doctrine (PR-16A / PR-16B)

Status: implemented (PR-16A pressure; PR-16B reviewer resolution)
Scope: how temporary accepted risk becomes visible again, how a reviewer resolves it — and what the system deliberately does NOT do about it.

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

## The resolution lane (PR-16B)

```txt
Expired trust creates review pressure.
Reviewer resolution creates the next trust decision.
The reaper does not decide.
The reviewer decides.
The record remembers.
```

Hard wall: **no auto-renew, no auto-revoke, no auto-remediate, no silent extension.**

An expired exception is a REVIEW CASE, not just a state. The case lives in `vault_exception_resolutions` (migration 0025): append-only, reviewer-authored records — `resolved_by` is NOT NULL by schema; there is no system resolution — each carrying one of six bounded directions with a REQUIRED reason:

- **renew** — cites a NEW exception created through the existing Phase 5 propose lane, which travels the existing approval lane with its own fresh expiry. The expired row is never revived or extended; citation coherence is a SQL CHECK, and a renewal cannot cite itself.
- **revoke** — trust formally ended; do not renew. A recorded direction: the expired state (which already grants nothing) stands as time truth.
- **remediation_required** — a human will fix or upgrade.
- **resolved_externally** — the risk no longer applies; asserted by the reviewer, not proven by the system.
- **defer** — reviewed; deliberately revisit later. The case stays open to re-resolution (which is why resolutions are append-only with no unique-per-exception constraint — every prior resolution remains on the record).
- **remediation_question** — the 15B question lane owns the next step; cites an existing question, never creates one.

The resolution module writes exactly one table. It never writes `vault_exceptions`, never touches exposures, CEI events, intelligence, or the timeline. Resolving requires the reviewer role — it is a trust decision about what happens next, exactly like approve/reject/revoke.

The complete loop this closes:

```txt
approved with expiry → time passed → reaper observed (16A)
→ review pressure visible → reviewer resolved (16B)
→ the record remembers every step, and no step was decided by the system
```

## Deliberately deferred

- **Scheduling** — the reaper is an explicit command (safe-by-default dry-run; `--execute` to act). Wiring it to a cron is an ops decision, not part of these PRs. The FIRST production reap is deliberately manual: the first live system mutation deserves human presence.
- **Exposure staleness / remediation-question due_at pressure** — same doctrine, different records; future 16-lane work.
- **Resolution surfacing on the list page** (unresolved-case markers in the Trust Expiry table) — polish; the detail page owns the case today.
