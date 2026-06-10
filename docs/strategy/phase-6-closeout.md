# Phase 6 — Component Exposure Intelligence: Proposal/Audit Loop Closeout

Status: **closed** as of PR-6-CLOSEOUT (2026-06-10)
Scope: docs-only closeout doc
Implementation status: every Phase 6 implementation PR is merged to `main`.

## Summary

Phase 6 is no longer "CEI exists."

Phase 6 is a full human-in-the-loop trust-decision audit loop:

```txt
Exposure observed.
User proposes an exception from the exposure.
CEI records the proposal relationship.
Reviewer sees the source-exposure context.
Reviewer approves / rejects / revokes.
CEI records the reviewer-outcome relationship.
```

That is the first loop where OpenSoyce can say:

We do not just know risk existed.
We know who proposed trusting it, what it came from, who decided, and what happened next.

The important win: **nothing auto-decides.** CEI is decision context + audit. It is not an automation engine.

This document records the closeout. It introduces no new code, no new routes, no new claims.

## Final Phase 6 stack on main

```text
da986f4  PR-6F  CEI reviewer-outcome audit (decision back to exposure)   (#98)
1a48e84  PR-6E  reviewer-side source-exposure context                    (#97)
9a3c46f  PR-6D  CEI-native proposal audit (exposure → proposed exception)(#96)
abfe03f  PR-6C  propose exception from exposure (merged via 4ca4280)     (#95)
adbb4f2  PR-6B  exposure read surface                                    (#94)
4b3127a  PR-6A  CEI foundation                                           (#93)
```

| PR | Subject | Shipped |
|---|---|---|
| `4b3127a` (PR-6A) | Exposure records exist | `component_exposure_types` native catalog (6 seeded types, global vocabulary, read-only at app layer) + workspace-scoped `component_exposures` (migrations 0017/0018, RLS deny-by-default), `src/server/cei/` (domain validation, list/get/create handlers, routes behind `resolveWorkspaceForMember` + CSRF), 6 CEI error codes. NO FK to `vault_exceptions`. NO `proof_anchors` column. |
| `adbb4f2` (PR-6B) | Exposure records visible | Read-only dashboard pages `/vault/:slug/exposures` (list, status filter, pagination) + `/exposures/:id` (detail) inside VaultLayout. GET-only api-client helpers; structurally banned from any create/mutate affordance. |
| `abfe03f` (PR-6C) | Proposal from exposure | "Propose exception from this exposure" on the exposure detail page. Two-step review → submit; no one-click auto-submit. Calls the existing Phase 5 propose endpoint, which hardcodes `state: 'proposed'` — the UI structurally cannot create an active exception. `live-surface` proof anchor pointing back at the exposure. The exposure is never mutated. |
| `9a3c46f` (PR-6D) | Proposal relationship audit | `component_exposure_events` (migration 0019): CEI's OWN audit surface. `event_kind` allowlist opened with exactly one value — `exception_proposed_from_exposure`. `related_exception_id` is a nullable set-null FK (audit context, not a decision edge). Propose handler records the event additively, best-effort: a failed audit row never blocks the proposal. The shared Phase 5 `vault_timeline_events` table is untouched. |
| `1a48e84` (PR-6E) | Reviewer sees source context | Read-only "Source exposure" card on the exception review page, fed by GET `/exposure-events?related_exception_id=`. The reviewer sees which exposure the proposal came from without leaving the page. Reviewer actions (approve / reject / extend / revoke) unchanged — the card is informational only. |
| `da986f4` (PR-6F) | Reviewer outcome audit | Migration 0020 widens the `event_kind` allowlist to exactly four values: the proposal kind plus `exception_approved_from_exposure`, `exception_rejected_from_exposure`, `exception_revoked_from_exposure`. After the guarded state UPDATE commits, approve/reject/revoke additively record the outcome event. The recorder discovers the exposure the only place the link exists — the 6D proposal event — and skips silently when the exception was not exposure-born. `extend` records nothing (not an outcome). `exception_expired_from_exposure` is deliberately absent: no reaper exists, and the event table requires an actor while expiry has none. Fixed the 6E latent bug where the source card took the newest event instead of pinning the proposal kind. |

## Final Phase 6 doctrine

The vocabulary, distilled. Every future CEI surface must preserve these distinctions:

```txt
Exposure is observation.
Exception is the trust decision candidate, then the trust decision record.
CEI event is relationship audit.
The reviewer still decides.
```

And the loop, as it must read in every future retelling:

```txt
The exposure suggested.
The user proposed.
The reviewer saw context.
The reviewer decided.
CEI recorded the relationship.
The system did not decide for them.
```

## The structural firewall — held through all six PRs

Asserted by `test-cei-foundation-v0` (37 invariants) and `test-vault-dashboard-v0` (45 invariants) on every merge:

- `component_exposures` has NO foreign key to `vault_exceptions`. The relationship lives only on event rows.
- `vault_exceptions` has NO `source_exposure_id` column. No migration ever gave the exception row an exposure reference.
- `component_exposures` has NO `proof_anchors` column. Exposure is not evidence.
- `vault_timeline_events` — the Phase 5 contract — was never touched. Its triggers still record the decision itself; CEI records the decision's *relationship* to the exposure, in CEI's own surface.
- The exception state machine is byte-for-byte the Phase 5 machine. Phase 6 added zero transitions, zero states, zero role changes.
- Every CEI surface is private: RLS deny-by-default, session-gated, workspace-scoped, 404-on-non-member, `visibility: 'private'` on every shaped row. No public CEI route exists.
- The `event_kind` allowlist is enforced twice — SQL CHECK and frozen app constant — and a structural test asserts they agree exactly.

## Closeout checklist

Verified at PR-6-CLOSEOUT merge:

- [x] No public claims expanded. The do-not-claim list in `architecture-manifest.md` is preserved verbatim.
- [x] No new product surface beyond Phase 6 scope. The implementation arc closed at `da986f4`; this PR adds documentation only.
- [x] Public Trust Center, public Timeline, public Repo Trust Dashboard, public Gate, and Trust Badge behavior unchanged.
- [x] Vault API and exception state machine unchanged since `da986f4`.
- [x] `npm run lint` exit 0 (the baseline is clean — any lint error is real).
- [x] Full structural suite green: 260 invariants (test-cei-foundation 37/37, test-vault-dashboard 45/45, + the rest).
- [x] Migration runner path `supabase/migrations/`; next number is **0021**.

## Next phase — parked, not authorized

**Nothing after 6F is authorized by this PR.** Each parked lane requires its own explicit scope block — allowed scope, permitted file families, hard non-scope, required verification, MERGE call — before any implementation begins:

- **Reaper** (active → expired transition). Owns the `exception_expired_from_exposure` event kind AND the `actor_user_id`-nullability decision. Both arrive together or not at all.
- **Exposure status lifecycle** (`observed` → `resolved` etc.). Today the status enum exists; nothing moves it.
- **Ingestion** (CLI / CI upload of real exposures). Today only manual API create exists. No worker, no queue, no SBOM import.
- **Custom-type registry + `validation_schema`**. Today the catalog is the six native types, read-only.
- **Any shared `vault_timeline_events` integration.** The deferral from 6A stands.
- **Cloud-permission-drift, Decision-Event Reconciliation, claims expansion.** Parked per `architecture-manifest.md` and `future-architecture-parking-lot.md`.

## Handoff point

| State | Value |
|---|---|
| Phase 6 proposal/audit loop | **CLOSED** |
| Phase 6 implementation PRs | 6 merged (6A–6F, #93–#98) |
| Phase 6 strategy PRs | 2 merged (#85 lock-in, PR-6-CLOSEOUT) |
| 6G+ status | parked, **not authorized** |
| Next migration number | 0021 |
| Lint baseline | clean (exit 0) |
| Structural invariants | 260 green |
| Demo | [`docs/proof/cei-decision-loop-demo.md`](../proof/cei-decision-loop-demo.md) |

The next call belongs to the user: 6G lifecycle, Phase 7 ingestion, or neither.
