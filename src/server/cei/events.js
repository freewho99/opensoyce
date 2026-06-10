// OpenSoyce Component Exposure Intelligence (Phase 6D) — CEI-native events.
//
// PR-6D. A CEI-native audit surface for relationships formed FROM an
// exposure — recorded WITHOUT touching the shared vault_timeline_events
// table or the Phase 5 exception triggers.
//
// Three pieces:
//   - validateExposureInWorkspace: confirms a source exposure belongs to
//     the caller's workspace (used by the propose flow before it records
//     an event).
//   - recordProposalFromExposure: inserts the audit event after a proposed
//     exception is created. Best-effort: a failure here never undoes the
//     proposal (the exception is the primary record; the event is audit).
//   - handleListExposureEvents: the read surface for the exposure detail
//     page's "Proposal history".
//
// DOCTRINE: recording an event does NOT mutate the exposure or the
// exception. The event records that a relationship was formed; the reviewer
// still decides.

import { vaultDb } from '../vault/db.js';
import { sendError, ERROR_CODES } from '../vault/errors.js';
import { resolveWorkspaceForMember } from '../vault/rbac.js';

// 6D allowlist is exactly one event kind.
export const EVENT_KINDS = Object.freeze(['exception_proposed_from_exposure']);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * Confirm an exposure exists AND belongs to the given workspace. Returns:
 *   { ok: true }       when the exposure is in the workspace
 *   { notFound: true } when it does not exist or is in another workspace
 *   { error }          on a database failure
 */
export async function validateExposureInWorkspace(supabase, workspaceId, exposureId) {
  if (!isUuid(exposureId)) return { notFound: true };
  const { data, error } = await supabase
    .from('component_exposures')
    .select('exposure_id')
    .eq('workspace_id', workspaceId)
    .eq('exposure_id', exposureId)
    .limit(1);
  if (error) return { error };
  const row = Array.isArray(data) && data[0];
  if (!row) return { notFound: true };
  return { ok: true };
}

/**
 * Insert the CEI-native audit event recording that a proposed exception was
 * created from an exposure. Best-effort: returns { error } on failure but
 * the caller treats the proposal as already-succeeded (the event is audit
 * context, not the trust decision).
 */
export async function recordProposalFromExposure(supabase, params) {
  const { workspaceId, exposureId, relatedExceptionId, actorUserId, metadata } = params;
  const { error } = await supabase
    .from('component_exposure_events')
    .insert({
      workspace_id: workspaceId,
      exposure_id: exposureId,
      event_kind: 'exception_proposed_from_exposure',
      related_exception_id: relatedExceptionId || null,
      actor_user_id: actorUserId,
      metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {},
    });
  if (error) return { error };
  return { ok: true };
}

function shapeEventRow(row) {
  if (!row) return null;
  return {
    event_id: row.event_id,
    workspace_id: row.workspace_id,
    exposure_id: row.exposure_id,
    event_kind: row.event_kind,
    related_exception_id: row.related_exception_id || null,
    actor: row.actor ? {
      user_id: row.actor.user_id,
      github_login: row.actor.github_login,
      display_name: row.actor.display_name || null,
    } : null,
    metadata: row.metadata || {},
    created_at: row.created_at,
    visibility: 'private',
  };
}

const EVENT_SELECT =
  '*, actor:actor_user_id(user_id, github_login, display_name)';

/**
 * GET /api/vault/workspaces/:slug/exposures/:id/events
 *
 * Read-only proposal-history list for one exposure. Newest first.
 */
export async function handleListExposureEvents(req, res) {
  const slug = (req.params && req.params.slug) || '';
  const exposureId = (req.params && req.params.id) || '';
  const resolved = await resolveWorkspaceForMember(req, res, slug);
  if (!resolved) return;
  const { workspace } = resolved;

  const supabase = vaultDb();
  // Confirm the exposure is in the workspace first (404-on-non-member
  // doctrine already guarded the workspace; this guards the exposure id).
  const check = await validateExposureInWorkspace(supabase, workspace.workspace_id, exposureId);
  if (check.error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'CEI exposure lookup failed');
  }
  if (check.notFound) {
    return sendError(res, 404, ERROR_CODES.not_found, 'not found');
  }

  const { data, error } = await supabase
    .from('component_exposure_events')
    .select(EVENT_SELECT)
    .eq('workspace_id', workspace.workspace_id)
    .eq('exposure_id', exposureId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'CEI event list failed');
  }
  const rows = Array.isArray(data) ? data : [];
  res.status(200).json({
    events: rows.map(shapeEventRow),
    visibility: 'private',
  });
}
