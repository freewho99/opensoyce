// OpenSoyce Trust Vault (PR-17B) — evidence-packet route registration.
//
// Lives in its own registrar (like the 17A export registrar) because the
// PR-V2-E route-snapshot invariant pins the literal routes in routes.js.
// Mounted from registerVaultRoutes so there is still exactly one private
// route table.
//
// Routes:
//   GET /api/vault/workspaces/:slug/evidence-packet
//       compose a rollup evidence packet from existing per-chain records
//       (session + membership). READ-ONLY — a rollup is composition, not
//       certification; there is no mutating verb in this lane and no CSRF
//       surface to front.
//
// There is NO public packet route. Private, workspace-scoped,
// session-gated like every other vault read.

import { setPrivateCacheHeaders } from './cache.js';
import { requireVaultSession } from './auth.js';
import { handleGetEvidencePacket } from './evidence-rollup.js';

export function registerEvidenceRollupRoutes(app) {
  app.get(
    '/api/vault/workspaces/:slug/evidence-packet',
    setPrivateCacheHeaders,
    requireVaultSession,
    handleGetEvidencePacket,
  );
}
