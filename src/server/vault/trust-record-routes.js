// OpenSoyce Trust Vault (PR-17C) — Trust Record API + webhook route
// registration.
//
// Lives in its own registrar (route-snapshot invariant on routes.js).
// Mounted from registerVaultRoutes so there is still exactly one private
// route table.
//
// READ surface (requireVaultReader: session OR read-only API token):
//   GET /api/vault/workspaces/:slug/trust-records
//   GET /api/vault/workspaces/:slug/trust-records/:id
//   GET /api/vault/workspaces/:slug/evidence-bundles/:id
//   (the evidence-packet route gains reader auth in its own registrar)
//
// MANAGEMENT surface (session + CSRF + owner role inside the handlers —
// machine credentials and delivery targets are workspace administration;
// tokens can NEVER reach these routes because token auth is not mounted
// here):
//   GET  /api/vault/workspaces/:slug/api-tokens
//   POST /api/vault/workspaces/:slug/api-tokens
//   POST /api/vault/workspaces/:slug/api-tokens/:id/revoke
//   GET  /api/vault/workspaces/:slug/webhooks
//   POST /api/vault/workspaces/:slug/webhooks
//   POST /api/vault/workspaces/:slug/webhooks/:id/disable
//   GET  /api/vault/workspaces/:slug/webhooks/:id/deliveries

import { setPrivateCacheHeaders } from './cache.js';
import { requireVaultSession } from './auth.js';
import { requireCsrf } from './csrf.js';
import { requireVaultReader } from './reader-auth.js';
import {
  handleListTrustRecords,
  handleGetTrustRecord,
  handleGetEvidenceBundleStable,
} from './trust-record-api.js';
import {
  handleListApiTokens,
  handleMintApiToken,
  handleRevokeApiToken,
} from './api-tokens.js';
import {
  handleListWebhooks,
  handleCreateWebhook,
  handleDisableWebhook,
  handleListWebhookDeliveries,
} from './webhooks.js';

export function registerTrustRecordRoutes(app) {
  // ---------- stable reads (session OR read-only API token) ----------
  app.get(
    '/api/vault/workspaces/:slug/trust-records',
    setPrivateCacheHeaders,
    requireVaultReader,
    handleListTrustRecords,
  );
  app.get(
    '/api/vault/workspaces/:slug/trust-records/:id',
    setPrivateCacheHeaders,
    requireVaultReader,
    handleGetTrustRecord,
  );
  app.get(
    '/api/vault/workspaces/:slug/evidence-bundles/:id',
    setPrivateCacheHeaders,
    requireVaultReader,
    handleGetEvidenceBundleStable,
  );

  // ---------- management (session-only; tokens cannot reach these) ----------
  app.get(
    '/api/vault/workspaces/:slug/api-tokens',
    setPrivateCacheHeaders,
    requireVaultSession,
    handleListApiTokens,
  );
  app.post(
    '/api/vault/workspaces/:slug/api-tokens',
    setPrivateCacheHeaders,
    requireVaultSession,
    requireCsrf,
    handleMintApiToken,
  );
  app.post(
    '/api/vault/workspaces/:slug/api-tokens/:id/revoke',
    setPrivateCacheHeaders,
    requireVaultSession,
    requireCsrf,
    handleRevokeApiToken,
  );
  app.get(
    '/api/vault/workspaces/:slug/webhooks',
    setPrivateCacheHeaders,
    requireVaultSession,
    handleListWebhooks,
  );
  app.post(
    '/api/vault/workspaces/:slug/webhooks',
    setPrivateCacheHeaders,
    requireVaultSession,
    requireCsrf,
    handleCreateWebhook,
  );
  app.post(
    '/api/vault/workspaces/:slug/webhooks/:id/disable',
    setPrivateCacheHeaders,
    requireVaultSession,
    requireCsrf,
    handleDisableWebhook,
  );
  app.get(
    '/api/vault/workspaces/:slug/webhooks/:id/deliveries',
    setPrivateCacheHeaders,
    requireVaultSession,
    handleListWebhookDeliveries,
  );
}
