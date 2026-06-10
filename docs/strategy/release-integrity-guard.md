# Release Integrity Guard

Status: implemented (PR-INTEGRITY-1)
Scope: verify production can actually produce the record before any release claims it can.

## Why this exists

One day — 2026-06-10 — surfaced three production integrity gaps that local structural tests could not see, each only visible after the one below it was fixed:

| # | Layer | The gap | The lie it told |
|---|---|---|---|
| 1 | Schema | Migrations 0005–0021 merged, never applied | Every `/api/vault/*` call 503ed; the repo said the trust system existed |
| 2 | Runtime | `registerVaultRoutes` lived only in `server.ts`; no Vercel function or rewrite | The SPA pages were deployed with no API behind them; platform NOT_FOUND |
| 3 | Config | OAuth callback URL covered only `/dashboard` | Vault AND claim sign-ins failed GitHub validation; only the dashboard flow worked |

Plus the deployment-plan constraint found the hard way: the Vercel Hobby plan rejects builds with more than 12 serverless functions, before compiling anything.

## Doctrine

```txt
A migration merged is not a migration applied.
A route registered locally is not a route deployed.
A secret present is not a provider configured.
A passing build is not production proof.
```

And the positive form:

```txt
The record is real when production can create it, read it,
and preserve its receipts.
```

## The guard

`scripts/check-release-integrity.mjs` — read-only by construction (structurally pinned: it may probe, never write). Four layers:

- **Layer 0 — static** (always runs): serverless function count ≤ 12; the vault route family has a deployed surface (`api/vault.js` + rewrite); every registered route literal lives under the deployed prefix; the migration sequence has no duplicate numbers.
- **Layer 1 — schema** (needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` for the *target* environment): head-probes all 12 required tables, the 0021 dedupe columns, and the 6-row native type seed. **Target coherence**: refuses to verify a local stack against a production `--api-base` (or vice versa) — the guard must never lie by proxy.
- **Layer 2 — runtime** (live, unauthenticated): `/api/config` answers 200; vault-family probes answer **app-level 401s** — a platform `NOT_FOUND` means the runtime is not deployed and fails loudly.
- **Layer 3 — config** (live, unauthenticated): the client id is published via `/api/config`, and GitHub's authorize endpoint accepts the `redirect_uri` of **every** flow — vault, claim, and dashboard — detected via GitHub's "redirect_uri is not associated" error page, no login required.

## How to run

```txt
npm run check:release-integrity                       # layers 0, 2, 3
SUPABASE_URL=<prod> SUPABASE_SERVICE_ROLE_KEY=<prod> \
  npm run check:release-integrity -- --strict         # all layers; SKIP = FAIL
```

Release rule: a release is not done until `npm run lint`, `npm run test:ci`, and the strict guard are all green **against the deployed target**. Skipped layers print `NOT VERIFIED` — in strict mode they fail.

First live run (2026-06-10, post-fix): static 4/4, runtime 4/4, config 4/4, schema correctly skipped on local/prod mismatch. The guard codifies the day it was born from.

## What stays parked

- A deployed `/api/vault/health` schema-presence endpoint (would let the guard verify schema without service credentials) — own scope block; new endpoint.
- CI wiring with production secrets — release-operator decision.
