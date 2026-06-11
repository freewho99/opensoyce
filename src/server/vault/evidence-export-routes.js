// OpenSoyce Trust Vault (PR-17A) — evidence-export route registration.
//
// Lives in its own registrar (like registerCeiRoutes and
// registerResolutionRoutes) because the PR-V2-E route-snapshot invariant
// pins the literal routes in routes.js: the export lane is a NEW surface
// added after that snapshot, with its own doctrine wall, and its
// registration belongs to its own module. Mounted from registerVaultRoutes
// so there is still exactly one private route table.
//
// Routes:
//   GET /api/vault/workspaces/:slug/exposures/:id/evidence-export
//       assemble the evidence bundle for one component trust-decision
//       chain (session + membership). READ-ONLY — no mutating verb exists
//       in this lane: generating an export changes nothing, so there is
//       no POST/PATCH/DELETE to register and no CSRF surface to front.
//
// There is NO public export route. The bundle is private, workspace-
// scoped, and session-gated like every other vault read.

import { setPrivateCacheHeaders } from './cache.js';
import { requireVaultSession } from './auth.js';
import { handleGetEvidenceExport } from './evidence-export.js';

export function registerEvidenceExportRoutes(app) {
  app.get(
    '/api/vault/workspaces/:slug/exposures/:id/evidence-export',
    setPrivateCacheHeaders,
    requireVaultSession,
    handleGetEvidenceExport,
  );
}
