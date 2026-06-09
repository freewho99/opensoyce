# OpenSoyce Resilience Doctrine

Status: strategic doctrine
Scope: future availability and break-glass strategy
Implementation status: not implemented unless separately authorized.

## The Bootstrap Trust Loop Paradox

OpenSoyce introduces an operational question:

```txt
What happens when the system that decides trust is unavailable?
```

If OpenSoyce is used inside CI/CD or deployment gates, then OpenSoyce availability becomes part of the release path.

## Fail Open

If OpenSoyce is unreachable and all pipelines continue, an attacker may try to blind the trust layer by disrupting OpenSoyce availability.

Risk:

```txt
OpenSoyce outage becomes a bypass path.
```

## Fail Closed

If OpenSoyce is unreachable and all pipelines stop, the organization may be unable to ship urgent hotfixes.

Risk:

```txt
OpenSoyce outage becomes an engineering outage.
```

## Correct Doctrine

The answer is not simple fail-open or fail-closed.

The answer is:

```txt
Fail secure with bounded offline decision authority.
```

## Signed Decision Bundles

A future Guard / CLI / CI integration may use a signed local decision bundle when OpenSoyce is temporarily unreachable.

Use this term:

```txt
signed decision bundle
```

Avoid these terms until implemented:

```txt
trust token
signed lease
runtime trust token
```

## Offline Rules

When OpenSoyce is unreachable:

```txt
1. Verify bundle signature.
2. Verify bundle has not expired.
3. Verify local clock is sane enough to evaluate expiry.
4. Honor only decisions already present in the bundle.
5. Do not create new exceptions offline.
6. Do not approve exceptions offline.
7. Do not extend exceptions offline.
8. Expired exceptions remain expired.
9. Unknown components follow configured fail-secure policy.
10. Every offline decision is written to a local audit log for reconciliation.
```

Core doctrine:

```txt
Offline mode can preserve known trust decisions.
It cannot invent new trust decisions.
```

## Offline Modes

Possible future modes:

```txt
online:
  Normal live OpenSoyce check.

offline-grace:
  OpenSoyce unreachable, signed decision bundle valid, bounded grace period active.

offline-expired:
  OpenSoyce unreachable, local bundle expired, high-risk actions fail.

break-glass:
  Human emergency override activated, every decision logged for reconciliation.
```

## Break-Glass Workflow

Break-glass is an emergency governance event, not a casual bypass.

Avoid static environment-variable token design as the primary boundary.

Break-glass should require:

```txt
human actor identity
role authorization
reason
scope
time limit
local audit log
post-incident reconciliation
reviewer sign-off
Timeline event after reconnect
```

Possible future command shape:

```bash
opensoyce break-glass activate \
  --workspace acme-core \
  --scope production-hotfix \
  --reason "OpenSoyce unavailable during production outage; hotfix required." \
  --duration 2h
```

Doctrine:

```txt
Break-glass does not erase policy.
Break-glass creates a debt that must be reconciled.
```

## Local Audit Log

During offline-grace or break-glass mode, OpenSoyce should write a local audit record.

Use:

```txt
local append-only audit log
```

Avoid:

```txt
immutable NVMe write-once storage
cryptographically sealed block entry
```

unless those storage guarantees are real.

## Reconciliation

When connectivity returns:

```txt
1. Upload local audit log.
2. Verify actor/session/break-glass authorization.
3. Attach local audit events to Vault Timeline.
4. Mark events reconciled.
5. Flag any decision that would have failed under current policy.
6. Require reviewer follow-up for mismatches.
```

## On-Call Runbook Direction

Triggers:

```txt
break-glass activated
offline-grace entered
offline bundle expired
local audit reconciliation failed
OpenSoyce unavailable during protected deployment
```

First 15 minutes:

```txt
1. Confirm whether OpenSoyce is actually unavailable.
2. Confirm the actor who activated break-glass.
3. Confirm scope and duration.
4. Confirm whether production deployment proceeded.
5. Preserve local audit log.
6. Notify security / platform ownership channel.
```

After connectivity returns:

```txt
1. Upload local audit log.
2. Reconcile Vault Timeline.
3. Identify bypassed decisions.
4. Compare bypassed decisions against current policy.
5. Require reviewer action for mismatches.
6. Close incident only after reconciliation is complete.
```

Doctrine:

```txt
Break-glass is not complete when the deployment succeeds.
It is complete when the trust debt is reconciled.
```

## Time Model Warning

Offline grace and exception expiry are separate clocks.

A future offline validator needs separate fields:

```txt
bundle_issued_at
bundle_expires_at
offline_started_at
offline_grace_expires_at
exception_expires_at
```

An exception may be valid for 14 days.

An offline grace period may be valid for only 4 hours.

## Final Resilience Principle

OpenSoyce must be trustworthy even when OpenSoyce is temporarily unavailable.

```txt
Online mode uses live trust decisions.
Offline mode uses only signed, time-bounded cached decisions.
Break-glass mode creates explicit audit debt.
Reconnection requires reconciliation.
No outage can silently create new trust.
```
