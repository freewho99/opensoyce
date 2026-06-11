// OpenSoyce Trust Vault (PR-16B) — expired-resolution route registration.
//
// Lives in its own registrar (like registerCeiRoutes) because the
// PR-V2-E route-snapshot invariant pins the literal routes in routes.js:
// the resolution lane is a NEW surface added after that snapshot, with
// its own doctrine wall, and its registration belongs to its own module.
// Mounted from registerVaultRoutes so there is still exactly one private
// route table.
//
// Routes:
//   GET  /api/vault/workspaces/:slug/exceptions/:id/resolutions
//        read the review-case record (session + membership)
//   POST /api/vault/workspaces/:slug/exceptions/:id/resolve
//        record a reviewer resolution (session + reviewer role + CSRF) —
//        writes ONLY vault_exception_resolutions; the exception row,
//        exposures, questions, CEI events, and the timeline are untouched.

import { setPrivateCacheHeaders } from './cache.js';
import { requireVaultSession } from './auth.js';
import { requireCsrf } from './csrf.js';
import {
  handleListExceptionResolutions,
  handleResolveExpiredException,
} from './exception-resolutions.js';

export function registerResolutionRoutes(app) {
  app.get(
    '/api/vault/workspaces/:slug/exceptions/:id/resolutions',
    setPrivateCacheHeaders,
    requireVaultSession,
    handleListExceptionResolutions,
  );
  app.post(
    '/api/vault/workspaces/:slug/exceptions/:id/resolve',
    setPrivateCacheHeaders,
    requireVaultSession,
    requireCsrf,
    handleResolveExpiredException,
  );
}
