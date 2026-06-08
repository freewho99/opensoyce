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
import { handleVaultLogin, handleVaultLogout } from './oauth.js';
import {
  handleVaultMe,
  handleVaultCreateWorkspace,
  handleVaultGetWorkspace,
} from './workspaces.js';

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
}
