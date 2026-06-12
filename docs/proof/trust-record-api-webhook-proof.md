# PR-PROOF-5 — Production Trust Record API + Webhook Proof

## Status

Complete.

This proof documents the PR-17C Trust Record API + webhooks (PR #121 / commit `2a59445`, migration `0027`) running on live production: read-only Bearer tokens consuming trust records, and a signed webhook delivery verified independently.

## Core claim

OpenSoyce trust records are now portable: external systems can read bounded trust-record summaries and receive signed record-change notifications without creating new trust conclusions or mutating historical records.

Before 17C, a human could read and export the record. After 17C, CI, agents, customer portals, and security-review workflows can consume the record directly — and changes announce themselves with verifiable signatures. Notification, never certification.

## Part A — Bearer token lifecycle (2026-06-12, production)

Receipt: [`01-bearer-lifecycle.txt`](./artifacts/pr-proof-5/01-bearer-lifecycle.txt). The raw `osy_…` token lived only in the probe process's memory — minted, used, revoked; never printed, never stored.

| Step | Result |
|---|---|
| Mint `proof5-ci-reader` (session + CSRF + owner) | 201 · scope `read` · raw shown once |
| Bearer `GET /trust-records` | **200** — 2 records, 4 inventory rows, 6 non-claims |
| Bearer `GET /trust-records/65d32e84…` | **200** — `lodash@4.17.20`, case `evidence_recorded` (the PROOF-2/3 chain) |
| Bearer `GET /evidence-packet` | **200** — mixed states `["active","expired"]`, not collapsed |
| Bearer `POST …/resolve` (a write) | **401** — token auth is not consulted on writes |
| Bearer `POST /api-tokens` (a write) | **401** — a token cannot mint tokens |
| Bearer against another workspace slug | **404** — indistinguishable from non-membership |
| Bogus Bearer token | **401** — fails closed (pre-0027 this was an honest 503: the gate showing itself) |
| Revoke, then reuse the same token | revoke 200 → next read **401** — revocation is immediate |

Read-only is enforced twice: `scope = 'read'` is the only scope the 0027 schema allows, and token auth is mounted on GET routes only — no write route consults it at all.

## Part B — Signed webhook delivery (2026-06-12, production)

One-time capture endpoint (webhook.site, fresh unguessable URL, explicitly user-authorized for this proof; the URL is redacted from artifacts). Receipt: [`02-webhook-delivery.txt`](./artifacts/pr-proof-5/02-webhook-delivery.txt).

1. **Subscription created** (session + CSRF + owner) for `remediation_evidence.recorded`; signing secret returned once, held in memory only.
2. **Trigger** — a clearly labeled additional remediation-evidence row on the existing `888aae0f` case, citing the same real `lodash@4.17.21` follow-up observation (`28f6c108…`). Append-only by design: the prior evidence record stands unchanged, and reviewer-direction semantics were deliberately not touched.
3. **Exactly one delivery captured** — `POST`, signature and event headers present.
4. **Subscription disabled immediately after capture.**
5. **HMAC verified independently** — plain local `crypto.createHmac('sha256', secret)` over the raw body: **SIGNATURE VALID**.
6. **Payload vocabulary held** ([`03-delivered-payload.json`](./artifacts/pr-proof-5/03-delivered-payload.json)): `event_type=remediation_evidence.recorded`, `state=evidence_recorded`, actor `@freewho99`, linkable record ids (exception / evidence / cited resolution / source exposure), the embedded non-claim — and **no `reviewer_direction` field**: an evidence event is not a direction event. No reason text travels in the payload. No banned verdict values (`fixed` / `verified_safe` / `certified` / `compliant` / `approved_release`) anywhere.
7. **Delivery log** — the append-only `vault_webhook_deliveries` row reads `ok=true, status_code=200`.
8. **`b777fb25` re-read: still `active`, expires `2026-07-10T17:32:32Z`, untouched.**

## Honest edges

* The triggering evidence row (`a74873ec…`) exists to exercise webhook transport and says so in its own reason — it is an additional receipt citing the already-recorded 4.17.21 observation, not a new trust conclusion. Append-only is the model working, not a workaround.
* The capture endpoint was a third-party request bin used once, with explicit user authorization and tight constraints; the payload carried record ids and state vocabulary, no reasons, no secrets.
* Pre-0027, a Bearer request returned 503 (`vault_api_tokens` absent) — the deploy gate behaving honestly. Disclosed because it happened.
* Webhook delivery is v0: one attempt, 5-second timeout, no retries. The delivery log is the honesty about delivery, not a guarantee of receipt.
* Raw API tokens and signing secrets appear in no artifact of this proof, by constraint.

## What this proof does not claim

No compliance certification. Webhooks notify that a record changed; they do not certify the meaning of the change. The API exposes records; it does not create new trust conclusions. A delivered notification is not proof the receiver acted on it.

## Doctrine confirmed

The API exposes records; it does not create new trust conclusions.

Webhooks notify; they do not certify.

Tokens are read-only by schema and by routing.

Reviewer direction and remediation evidence stay separate, even on the wire.

Make the record portable, not more opinionated.
