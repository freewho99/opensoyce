// OpenSoyce Trust Vault (PR-16C) — remediation-evidence route registration.
//
// Lives in its own registrar (like registerResolutionRoutes and
// registerEvidenceExportRoutes) because the PR-V2-E route-snapshot
// invariant pins the literal routes in routes.js. Mounted from
// registerVaultRoutes so there is still exactly one private route table.
//
// Routes:
//   GET  /api/vault/workspaces/:slug/exceptions/:id/remediation-evidence
//        read the evidence record + derived case status (session +
//        membership)
//   POST /api/vault/workspaces/:slug/exceptions/:id/remediation-evidence
//        record one human-cited evidence row (session + member role +
//        CSRF) — writes ONLY component_remediation_evidence; the
//        exception, resolutions, questions, exposures, CEI events, and
//        the timeline are untouched.

import { setPrivateCacheHeaders } from './cache.js';
import { requireVaultSession } from './auth.js';
import { requireCsrf } from './csrf.js';
import {
  handleListRemediationEvidence,
  handleRecordRemediationEvidence,
} from './remediation-evidence.js';

export function registerRemediationEvidenceRoutes(app) {
  app.get(
    '/api/vault/workspaces/:slug/exceptions/:id/remediation-evidence',
    setPrivateCacheHeaders,
    requireVaultSession,
    handleListRemediationEvidence,
  );
  app.post(
    '/api/vault/workspaces/:slug/exceptions/:id/remediation-evidence',
    setPrivateCacheHeaders,
    requireVaultSession,
    requireCsrf,
    handleRecordRemediationEvidence,
  );
}
