// OpenSoyce Trust Vault (PR-EV-1) — verification-check route registration.
//
// Lives in its own registrar (route-snapshot invariant on routes.js).
// Mounted from registerVaultRoutes so there is still exactly one private
// route table.
//
// Routes:
//   GET  /api/vault/workspaces/:slug/remediation-evidence/:id/verification-checks
//        read the append-only check history (session + membership)
//   POST /api/vault/workspaces/:slug/remediation-evidence/:id/verification-checks
//        run ONE citation check and record it (session + member role +
//        CSRF) — writes ONLY evidence_verification_checks; the evidence
//        row and every other record are untouched.
//
// No public unauthenticated check endpoint. No token-auth path: checks
// are session-driven in v0.

import { setPrivateCacheHeaders } from './cache.js';
import { requireVaultSession } from './auth.js';
import { requireCsrf } from './csrf.js';
import {
  handleListVerificationChecks,
  handleRunVerificationCheck,
} from './evidence-verification.js';

export function registerEvidenceVerificationRoutes(app) {
  app.get(
    '/api/vault/workspaces/:slug/remediation-evidence/:id/verification-checks',
    setPrivateCacheHeaders,
    requireVaultSession,
    handleListVerificationChecks,
  );
  app.post(
    '/api/vault/workspaces/:slug/remediation-evidence/:id/verification-checks',
    setPrivateCacheHeaders,
    requireVaultSession,
    requireCsrf,
    handleRunVerificationCheck,
  );
}
