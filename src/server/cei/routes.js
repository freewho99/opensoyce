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
import { handleListExposureEvents, handleListEventsByException } from './events.js';
// PR-15A: vulnerability-intelligence observations — context only. The
// refresh action records what a source asserts; it never mutates the
// exposure and never creates exceptions, proposals, or outcomes.
import { handleListVulnIntel, handleRefreshVulnIntel } from './vuln-intel.js';

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
  // PR-6D: CEI-native proposal-history read surface for one exposure.
  // Read-only; no shared Vault Timeline involved.
  app.get(
    '/api/vault/workspaces/:slug/exposures/:id/events',
    setPrivateCacheHeaders,
    requireVaultSession,
    handleListExposureEvents,
  );
  // PR-6E: reviewer-side source-exposure context. Lists CEI events related
  // to an exception (filtered by ?related_exception_id=), each embedding its
  // source exposure. Read-only; CEI-namespaced (not under /exceptions).
  app.get(
    '/api/vault/workspaces/:slug/exposure-events',
    setPrivateCacheHeaders,
    requireVaultSession,
    handleListEventsByException,
  );
  // PR-15A: vulnerability-intelligence context for one dependency exposure.
  // GET reads the recorded context; POST refresh is a member-level
  // OBSERVATION action (CSRF-fronted) that asks the source and records or
  // touches context rows. Neither route can decide anything.
  app.get(
    '/api/vault/workspaces/:slug/exposures/:id/vuln-intel',
    setPrivateCacheHeaders,
    requireVaultSession,
    handleListVulnIntel,
  );
  app.post(
    '/api/vault/workspaces/:slug/exposures/:id/vuln-intel/refresh',
    setPrivateCacheHeaders,
    requireVaultSession,
    requireCsrf,
    handleRefreshVulnIntel,
  );
}
