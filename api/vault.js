/**
 * OpenSoyce Trust Vault — Vercel production entry for the Vault/CEI API.
 *
 * PR-RUNTIME-1. Production finding #2: the entire /api/vault/* route family
 * (Phase 5 Vault, Phase 6 CEI, device-code login, OAuth callback) was
 * registered ONLY in server.ts — the local Express/Vite dev server — and was
 * never deployed. Production served the SPA Vault pages with no API behind
 * them; every /api/vault/* request died at the Vercel platform layer as
 * NOT_FOUND.
 *
 * DOCTRINE (PR-RUNTIME-1):
 *   A migration merged is not a migration applied.
 *   A route registered locally is not a route deployed.
 *   A valid repo is not a valid production system.
 *   The record is only real when the runtime can produce it.
 *
 * This file EXPOSES the existing route family; it does not reinterpret it.
 * No handler is defined here, no route is renamed, no middleware semantics
 * change — production must behave like the local Vault runtime, not like a
 * new runtime. Requests reach this function via the vercel.json rewrite
 * `/api/vault/:path*` → `/api/vault`; Vercel preserves the original URL on
 * rewrite, so the express routes (all registered with full /api/vault/...
 * paths) match unchanged.
 */

import express from 'express';
import { registerVaultRoutes } from '../src/server/vault/routes.js';

const app = express();

// @vercel/node pre-parses JSON bodies (its req.body is a lazy getter that
// consumes the request stream). body-parser skips when req._body is set —
// mark it so express.json never re-reads a consumed stream and hangs the
// request. Under plain local express this branch is a no-op (req.body is
// undefined until a parser runs).
app.use((req, _res, next) => {
  if (req.body !== undefined) req._body = true;
  next();
});

// Same JSON limit as server.ts so production behaves like the local Vault
// runtime (the 6MB ceiling is a server.ts-wide setting the vault routes
// have always run under).
app.use(express.json({ limit: '6mb' }));

registerVaultRoutes(app);

export default app;
