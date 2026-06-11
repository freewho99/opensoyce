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

// 6D opened the allowlist with exactly one kind (the proposal). 6F widened
// it with one kind per reviewer outcome. 16A adds the kind 6F deferred to
// the reaper scope block: exception_expired_from_exposure — the first
// SYSTEM observation in this table (expiry has no human actor; migration
// 0024 makes the actor nullable for this kind ONLY). Expiry is time
// evidence, not reviewer judgment: it is NOT a member of
// OUTCOME_EVENT_KINDS, because an outcome is a decision a reviewer made
// and expiry decides nothing. 'extend' is not an outcome (state stays
// active) and records nothing.
export const PROPOSAL_EVENT_KIND = 'exception_proposed_from_exposure';
export const EXPIRED_EVENT_KIND = 'exception_expired_from_exposure';
export const OUTCOME_EVENT_KINDS = Object.freeze([
  'exception_approved_from_exposure',
  'exception_rejected_from_exposure',
  'exception_revoked_from_exposure',
]);
export const EVENT_KINDS = Object.freeze([
  'exception_proposed_from_exposure',
  'exception_approved_from_exposure',
  'exception_rejected_from_exposure',
  'exception_revoked_from_exposure',
  'exception_expired_from_exposure',
]);

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

/**
 * PR-6F: insert the CEI-native audit event recording that a reviewer
 * outcome (approve / reject / revoke) landed on an exception that was
 * proposed from an exposure.
 *
 * The exception row carries NO reference to the exposure (separation
 * preserved since 6A), so the link is discovered the only place it exists:
 * the 6D proposal event, queried by related_exception_id. When no proposal
 * event exists the exception was not exposure-born and nothing is recorded
 * — { skipped: true }.
 *
 * Best-effort, same contract as recordProposalFromExposure: returns
 * { error } on failure but the caller treats the decision as already-
 * succeeded (the exception state machine is the trust record; this event
 * is audit context). Recording NEVER mutates the exposure or the exception.
 */
export async function recordOutcomeFromExposure(supabase, params) {
  const { workspaceId, exceptionId, outcomeKind, actorUserId, metadata } = params;
  if (!OUTCOME_EVENT_KINDS.includes(outcomeKind)) {
    return { error: new Error(`unknown outcome kind: ${outcomeKind}`) };
  }
  if (!isUuid(exceptionId)) return { skipped: true };
  const { data, error } = await supabase
    .from('component_exposure_events')
    .select('exposure_id')
    .eq('workspace_id', workspaceId)
    .eq('related_exception_id', exceptionId)
    .eq('event_kind', PROPOSAL_EVENT_KIND)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) return { error };
  const proposal = Array.isArray(data) && data[0];
  if (!proposal) return { skipped: true };
  const { error: insertError } = await supabase
    .from('component_exposure_events')
    .insert({
      workspace_id: workspaceId,
      exposure_id: proposal.exposure_id,
      event_kind: outcomeKind,
      related_exception_id: exceptionId,
      actor_user_id: actorUserId,
      metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {},
    });
  if (insertError) return { error: insertError };
  return { ok: true };
}

/**
 * PR-16A: insert the CEI-native audit event recording that an exception
 * which was proposed from an exposure crossed its expiry window.
 *
 * Expiry is TIME EVIDENCE, not reviewer judgment — the actor is the system
 * (actor_user_id NULL, permitted for this kind only by migration 0024),
 * and the metadata carries the system provenance: previous/new state, the
 * scheduled expiry, when the reaper observed it, and the reason.
 *
 * Discovery is identical to recordOutcomeFromExposure: the exception row
 * carries NO exposure reference, so the link is read from the 6D proposal
 * event. Exceptions that were not exposure-born record nothing —
 * { skipped: true } (the Phase 5 timeline trigger already recorded the
 * expiry itself; CEI records only the RELATIONSHIP, and only where one
 * exists).
 *
 * IDEMPOTENT: the 0024 partial unique index allows at most one expired
 * event per exception. A re-run's 23505 resolves to
 * { ok: true, alreadyRecorded: true } — recorded once, never duplicated.
 *
 * Recording NEVER mutates the exposure or the exception.
 */
export async function recordExpiredFromExposure(supabase, params) {
  const { workspaceId, exceptionId, expiredAt, observedAt } = params;
  if (!isUuid(exceptionId)) return { skipped: true };
  const { data, error } = await supabase
    .from('component_exposure_events')
    .select('exposure_id')
    .eq('workspace_id', workspaceId)
    .eq('related_exception_id', exceptionId)
    .eq('event_kind', PROPOSAL_EVENT_KIND)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) return { error };
  const proposal = Array.isArray(data) && data[0];
  if (!proposal) return { skipped: true };
  const { error: insertError } = await supabase
    .from('component_exposure_events')
    .insert({
      workspace_id: workspaceId,
      exposure_id: proposal.exposure_id,
      event_kind: EXPIRED_EVENT_KIND,
      related_exception_id: exceptionId,
      actor_user_id: null,
      metadata: {
        actor_kind: 'system',
        reason: 'expires_at elapsed',
        previous_state: 'active',
        new_state: 'expired',
        expired_at: typeof expiredAt === 'string' ? expiredAt : null,
        observed_at: typeof observedAt === 'string' ? observedAt : null,
      },
    });
  if (insertError) {
    if (insertError.code === '23505') return { ok: true, alreadyRecorded: true };
    return { error: insertError };
  }
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

// PR-6E: the reviewer-side select additionally embeds the SOURCE exposure
// (and its type slug) so the proposed-exception review page can show
// read-only "this exception came from this exposure" context in one call.
const EVENT_WITH_EXPOSURE_SELECT =
  '*,'
  + ' actor:actor_user_id(user_id, github_login, display_name),'
  + ' source_exposure:exposure_id('
  + 'exposure_id, subject_kind, subject_name, source_kind, source_ref, status,'
  + ' exposure_type:exposure_type_id(type_slug))';

function shapeSourceExposure(row) {
  if (!row) return null;
  return {
    exposure_id: row.exposure_id,
    exposure_type: row.exposure_type ? row.exposure_type.type_slug : null,
    subject_kind: row.subject_kind,
    subject_name: row.subject_name,
    source_kind: row.source_kind,
    source_ref: row.source_ref || null,
    status: row.status,
  };
}

function shapeEventWithExposure(row) {
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
    source_exposure: shapeSourceExposure(row.source_exposure),
    created_at: row.created_at,
    visibility: 'private',
  };
}

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

/**
 * GET /api/vault/workspaces/:slug/exposure-events?related_exception_id=:id
 *
 * PR-6E reviewer-side context: list CEI events related to a given exception,
 * each carrying its SOURCE exposure (read-only). Used by the proposed-
 * exception review page to show "this exception came from this exposure".
 *
 * Read-only. Workspace-scoped (404-on-non-member via resolveWorkspaceForMember).
 * Returns an empty events array when the exception has no CEI origin — the
 * exception still exists; it just wasn't proposed from an exposure.
 */
export async function handleListEventsByException(req, res) {
  const slug = (req.params && req.params.slug) || '';
  const relatedExceptionId = (req.query && typeof req.query.related_exception_id === 'string')
    ? req.query.related_exception_id
    : '';
  if (!isUuid(relatedExceptionId)) {
    return sendError(res, 400, ERROR_CODES.bad_request, 'related_exception_id must be a UUID');
  }
  const resolved = await resolveWorkspaceForMember(req, res, slug);
  if (!resolved) return;
  const { workspace } = resolved;

  const supabase = vaultDb();
  const { data, error } = await supabase
    .from('component_exposure_events')
    .select(EVENT_WITH_EXPOSURE_SELECT)
    .eq('workspace_id', workspace.workspace_id)
    .eq('related_exception_id', relatedExceptionId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'CEI event lookup failed');
  }
  const rows = Array.isArray(data) ? data : [];
  res.status(200).json({
    events: rows.map(shapeEventWithExposure),
    visibility: 'private',
  });
}
