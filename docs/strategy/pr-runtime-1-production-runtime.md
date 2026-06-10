# PR-RUNTIME-1 — Deploy the Vault/CEI API Runtime to Production

Status: scope record + production finding #2
Scope: expose the existing route family through Vercel. No behavior changes.

## Production finding #2 (2026-06-10)

Same day the schema gap closed (finding #1: prod had nothing past migration 0004; the 0005→0021 chain was applied via Supabase Studio and verified green), a live smoke found the next layer:

- `/api/config` → 200. The standalone OTS API functions are deployed.
- `/api/vault/me`, `/api/vault/workspaces` → Vercel platform `NOT_FOUND`. Not an app 401. Not a 503. The platform had no route there at all.

Root cause: `registerVaultRoutes(app)` was called in exactly one place — `server.ts`, the local Express/Vite dev server. Vercel production deploys the static SPA plus standalone `api/*.js` functions. No `api/vault*` function and no `/api/vault/*` rewrite ever existed. The SPA Vault pages were deployed; the API behind them — Phase 5 Vault, Phase 6 CEI, device-code login, the OAuth callback — was not reachable in production at any point since Phase 5 shipped.

This is the product's own doctrine problem, exposed on itself. The repo claimed the private trust system existed. The structural tests proved the code shape. Production could not produce the trust record.

## Doctrine (locked by this PR)

```txt
A migration merged is not a migration applied.
A route registered locally is not a route deployed.
A valid repo is not a valid production system.
The record is only real when the runtime can produce it.
```

## What shipped

- **`api/vault.js`** — a Vercel function hosting an Express app that installs JSON body parsing and calls the EXISTING `registerVaultRoutes(app)`. Pure mounting: it defines no routes, renames nothing, reinterprets nothing (structurally pinned — the file may not contain `app.get/post/patch/delete/put`). One Vercel-specific guard: `@vercel/node` pre-parses JSON bodies, so the function marks `req._body` to stop `express.json` from re-reading a consumed stream. The JSON limit matches `server.ts` (6MB) so production behaves like the local Vault runtime.
- **`vercel.json`** — one rewrite: `/api/vault/:path*` → `/api/vault`. Vercel preserves the original URL on rewrite, so the Express routes (all registered with full `/api/vault/...` paths) match unchanged.
- **`server.ts` untouched** — local dev keeps its registration path; the same module now mounts in both runtimes.

## Structural enforcement (test-vault-auth-v0, +3 = 26)

1. The Vercel vault function exists, imports + calls `registerVaultRoutes`, exports the app, and defines no routes of its own.
2. The `/api/vault/:path*` rewrite exists.
3. **The runtime-presence guard**: every route literal registered by the vault/CEI registrars must live under a prefix with a deployed production surface. A future route family registered in `server.ts` outside `/api/vault` fails this test until it is given a deployed function/rewrite — route families must not be local-only ever again.

## Release Integrity Guard — now explicitly TWO layers

The parked guard lane covers both findings:

```txt
Layer 1 — schema presence:  a schema required by code must be proven
                            present where the code runs.
Layer 2 — runtime presence: a route family required by the product must
                            be proven reachable where users run it.
```

Do not rely only on local structural tests. Do not discover drift through user-facing 503s or platform 404s. The structural half of layer 2 ships with this PR (the registrar/coverage test above); the live half (a deployed health surface that proves schema + runtime against production itself) remains parked and needs its own scope block.

## Verification

- Pre-merge: lint exit 0; full `test:ci` green; the function booted locally on a bare HTTP server — session routes answered app-level 401, the device-code handler reached the DB layer (503 without env), unknown paths got the Express 404, JSON bodies parsed without hanging.
- Post-deploy live smoke (required by the scope): `/api/config` still 200; `/api/vault/me` and `/api/vault/workspaces` answer app-level 401 (not platform NOT_FOUND); device-code POST mints a code against the prod schema; a full production CEI loop is blocked only by user auth/workspace state.
