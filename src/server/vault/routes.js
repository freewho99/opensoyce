// OpenSoyce Trust Vault — route registration.
//
// PR-V2-A. Registers the 5 v0 routes:
//   GET  /api/vault/me
//   GET  /api/vault/auth/login           — GitHub OAuth code-exchange callback
//   POST /api/vault/auth/logout
//   POST /api/vault/workspaces
//   GET  /api/vault/workspaces/:slug
//
// Every route is fronted by setPrivateCacheHeaders. Read routes are fronted
// by requireVaultSession (the OAuth login is the only public Vault route
// because it's the only one that can establish a session).

import { setPrivateCacheHeaders } from './cache.js';
import { requireVaultSession } from './auth.js';
import { requireCsrf } from './csrf.js';
import { handleVaultLogin, handleVaultLogout } from './oauth.js';
import {
  handleVaultMe,
  handleVaultCreateWorkspace,
  handleVaultGetWorkspace,
} from './workspaces.js';
import {
  handleListExceptions,
  handleGetException,
  handleProposeException,
  handleApproveException,
  handleRejectException,
  handleRevokeException,
  handleExtendException,
  handlePatchProposal,
  handleDeleteForbidden,
} from './exceptions.js';
import { handleGetEvidence } from './evidence.js';
import {
  handleListTimelineEvents,
  handleGetTimelineEvent,
} from './timeline.js';
import {
  handleCreateDeviceCode,
  handlePollDeviceToken,
  handleApproveDeviceCode,
} from './cli.js';
import { registerCeiRoutes } from '../cei/routes.js';

export function registerVaultRoutes(app) {
  // OAuth login is the only Vault route that does NOT require a session
  // (it establishes one). It still carries the private cache headers.
  app.get('/api/vault/auth/login', setPrivateCacheHeaders, handleVaultLogin);

  // Every other route requires the session middleware to attach
  // req.vaultSession before the handler runs.
  app.post(
    '/api/vault/auth/logout',
    setPrivateCacheHeaders,
    requireVaultSession,
    handleVaultLogout,
  );

  app.get(
    '/api/vault/me',
    setPrivateCacheHeaders,
    requireVaultSession,
    handleVaultMe,
  );

  app.post(
    '/api/vault/workspaces',
    setPrivateCacheHeaders,
    requireVaultSession,
    handleVaultCreateWorkspace,
  );

  app.get(
    '/api/vault/workspaces/:slug',
    setPrivateCacheHeaders,
    requireVaultSession,
    handleVaultGetWorkspace,
  );

  // ---------- Exception state machine + API (PR-V2-B) ----------
  // 8 endpoints. Mutating routes (POST/PATCH) are fronted by requireCsrf.
  // GETs are not (idempotent reads; per PR-V1-C §5.1). DELETE on an
  // exception row is forbidden and returns 405 with the Allow header.
  app.get(
    '/api/vault/workspaces/:slug/exceptions',
    setPrivateCacheHeaders,
    requireVaultSession,
    handleListExceptions,
  );
  app.get(
    '/api/vault/workspaces/:slug/exceptions/:id',
    setPrivateCacheHeaders,
    requireVaultSession,
    handleGetException,
  );
  app.post(
    '/api/vault/workspaces/:slug/exceptions',
    setPrivateCacheHeaders,
    requireVaultSession,
    requireCsrf,
    handleProposeException,
  );
  app.post(
    '/api/vault/workspaces/:slug/exceptions/:id/approve',
    setPrivateCacheHeaders,
    requireVaultSession,
    requireCsrf,
    handleApproveException,
  );
  app.post(
    '/api/vault/workspaces/:slug/exceptions/:id/reject',
    setPrivateCacheHeaders,
    requireVaultSession,
    requireCsrf,
    handleRejectException,
  );
  app.post(
    '/api/vault/workspaces/:slug/exceptions/:id/revoke',
    setPrivateCacheHeaders,
    requireVaultSession,
    requireCsrf,
    handleRevokeException,
  );
  app.post(
    '/api/vault/workspaces/:slug/exceptions/:id/extend',
    setPrivateCacheHeaders,
    requireVaultSession,
    requireCsrf,
    handleExtendException,
  );
  app.patch(
    '/api/vault/workspaces/:slug/exceptions/:id',
    setPrivateCacheHeaders,
    requireVaultSession,
    requireCsrf,
    handlePatchProposal,
  );
  app.delete(
    '/api/vault/workspaces/:slug/exceptions/:id',
    setPrivateCacheHeaders,
    handleDeleteForbidden,
  );

  // ---------- Private proof-anchor + Vault Timeline reads (PR-V2-C) ----------
  // 3 read endpoints. All GETs — no mutating verbs (Timeline events are
  // emitted by trigger functions, not by client writes; evidence rows are
  // captured via mechanisms outside the v0 API surface). 404-on-non-member
  // doctrine applies; the resolveWorkspaceForMember helper funnels every
  // sub-case through the same not-found path.
  app.get(
    '/api/vault/workspaces/:slug/evidence/:id',
    setPrivateCacheHeaders,
    requireVaultSession,
    handleGetEvidence,
  );
  app.get(
    '/api/vault/workspaces/:slug/timeline',
    setPrivateCacheHeaders,
    requireVaultSession,
    handleListTimelineEvents,
  );
  app.get(
    '/api/vault/workspaces/:slug/timeline/:id',
    setPrivateCacheHeaders,
    requireVaultSession,
    handleGetTimelineEvent,
  );

  // ---------- CLI device-code flow (PR-V2-D) ----------
  // device-code + device-token are PUBLIC (no session required). They are
  // the bootstrap that establishes a session. approve requires a browser
  // session + CSRF since it's a state-mutating cross-side action.
  app.post(
    '/api/vault/cli/device-code',
    setPrivateCacheHeaders,
    handleCreateDeviceCode,
  );
  app.post(
    '/api/vault/cli/device-token',
    setPrivateCacheHeaders,
    handlePollDeviceToken,
  );
  app.post(
    '/api/vault/cli/approve',
    setPrivateCacheHeaders,
    requireVaultSession,
    requireCsrf,
    handleApproveDeviceCode,
  );

  // ---------- Component Exposure Intelligence foundation (PR-6A) ----------
  // CEI is part of the private vault surface; it reuses the same session +
  // CSRF middleware and the 404-on-non-member doctrine. Native exposure
  // types only; no ingestion, no dashboard, no custom types.
  registerCeiRoutes(app);
}
