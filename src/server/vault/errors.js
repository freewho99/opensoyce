// OpenSoyce Trust Vault — error response shapes.
//
// PR-V2-A. Per PR-V1-A §5.4 (401 / 404 / 403 distinction) and PR-V1-D §2
// (404 decision tree).
//
// Stable kebab-case error codes are part of the API contract. The
// vocabulary is fixed at v0 and grows only via documented sub-sketch
// revision.

export const ERROR_CODES = Object.freeze({
  auth_required: 'auth-required',
  not_found: 'not-found',
  forbidden_role: 'forbidden-role',
  bad_request: 'bad-request',
  unsupported_media_type: 'unsupported-media-type',
  oauth_not_configured: 'oauth-not-configured',
  oauth_state_invalid: 'oauth-state-invalid',
  oauth_exchange_failed: 'oauth-exchange-failed',
  vault_db_unavailable: 'vault-db-unavailable',
  workspace_slug_invalid: 'workspace-slug-invalid',
  workspace_display_name_invalid: 'workspace-display-name-invalid',
  workspace_slug_taken: 'workspace-slug-taken',
  // PR-V2-B additions (exception state machine + API):
  csrf_missing_cookie: 'csrf-missing-cookie',
  csrf_missing_header: 'csrf-missing-header',
  csrf_mismatch: 'csrf-mismatch',
  csrf_empty: 'csrf-empty',
  downgrade_only_violation: 'downgrade-only-violation',
  self_approval_forbidden: 'self-approval-forbidden',
  expires_at_in_past: 'expires-at-in-past',
  expires_at_too_far: 'expires-at-too-far',
  exception_state_conflict: 'exception-state-conflict',
  exception_not_found: 'exception-not-found',
  precondition_failed: 'precondition-failed',
  invalid_subject: 'invalid-subject',
  // PR-V2-C additions (private proof-anchor + Vault Timeline reads):
  cursor_invalid: 'cursor-invalid',
  cursor_stale: 'cursor-stale',
  invalid_filter: 'invalid-filter',
  // PR-V2-D additions (CLI device-code flow):
  authorization_pending: 'authorization-pending',
  device_code_expired: 'device-code-expired',
  device_code_invalid: 'device-code-invalid',
});

export function sendError(res, status, code, message, extras) {
  res.status(status).json({ error: code, message, ...(extras || {}) });
}
