// OpenSoyce Trust Vault (PR-18A) — Trust Agent draft route registration.
//
// Lives in its own registrar (route-snapshot invariant on routes.js).
// Mounted from registerVaultRoutes so there is still exactly one private
// route table.
//
// Routes (ALL session-only — read-only API tokens can neither create
// nor decide drafts in v0; no autonomous runs, no public surface):
//   POST /api/vault/workspaces/:slug/agent-drafts            create (CSRF)
//   GET  /api/vault/workspaces/:slug/agent-drafts            list, bounded
//   POST /api/vault/workspaces/:slug/agent-drafts/:id/approve  (CSRF)
//   POST /api/vault/workspaces/:slug/agent-drafts/:id/reject   (CSRF)

import { setPrivateCacheHeaders } from './cache.js';
import { requireVaultSession } from './auth.js';
import { requireCsrf } from './csrf.js';
import {
  handleCreateAgentDraft,
  handleListAgentDrafts,
  handleApproveAgentDraft,
  handleRejectAgentDraft,
} from './agent-drafts.js';

export function registerAgentDraftRoutes(app) {
  app.get(
    '/api/vault/workspaces/:slug/agent-drafts',
    setPrivateCacheHeaders,
    requireVaultSession,
    handleListAgentDrafts,
  );
  app.post(
    '/api/vault/workspaces/:slug/agent-drafts',
    setPrivateCacheHeaders,
    requireVaultSession,
    requireCsrf,
    handleCreateAgentDraft,
  );
  app.post(
    '/api/vault/workspaces/:slug/agent-drafts/:id/approve',
    setPrivateCacheHeaders,
    requireVaultSession,
    requireCsrf,
    handleApproveAgentDraft,
  );
  app.post(
    '/api/vault/workspaces/:slug/agent-drafts/:id/reject',
    setPrivateCacheHeaders,
    requireVaultSession,
    requireCsrf,
    handleRejectAgentDraft,
  );
}
