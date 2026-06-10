// OpenSoyce Component Exposure Intelligence (Phase 6A) — route registration.
//
// PR-6A. CEI is part of the PRIVATE vault surface — it reuses the existing
// vault middleware (private cache headers, session requirement, CSRF on
// mutations). It is mounted from registerVaultRoutes so there is exactly
// one private-surface route table.
//
// Routes (all under /api/vault/workspaces/:slug/exposures):
//   GET  .../exposures        list   (read; session + membership)
//   GET  .../exposures/:id     get    (read; session + membership)
//   POST .../exposures         create (mutate; session + membership + CSRF)
//
// There is NO public CEI route, NO ingestion endpoint, NO custom-type
// registry endpoint, and NO CEI dashboard surface in Phase 6A.

import { setPrivateCacheHeaders } from '../vault/cache.js';
import { requireVaultSession } from '../vault/auth.js';
import { requireCsrf } from '../vault/csrf.js';
import {
  handleListExposures,
  handleGetExposure,
  handleCreateExposure,
} from './exposures.js';

export function registerCeiRoutes(app) {
  app.get(
    '/api/vault/workspaces/:slug/exposures',
    setPrivateCacheHeaders,
    requireVaultSession,
    handleListExposures,
  );
  app.get(
    '/api/vault/workspaces/:slug/exposures/:id',
    setPrivateCacheHeaders,
    requireVaultSession,
    handleGetExposure,
  );
  app.post(
    '/api/vault/workspaces/:slug/exposures',
    setPrivateCacheHeaders,
    requireVaultSession,
    requireCsrf,
    handleCreateExposure,
  );
}
