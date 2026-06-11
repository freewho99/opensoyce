// OpenSoyce Trust Vault (PR-16B) — expired trust reviewer resolution.
//
// DOCTRINE: expired trust creates review pressure. Reviewer resolution
// creates the next trust decision. The reaper does not decide. The
// reviewer decides. The record remembers.
//
// HARD WALL, structurally enforced by this module:
//   No auto-renew. No auto-revoke. No auto-remediate. No silent extension.
//
// This module writes exactly one thing — append-only rows in
// vault_exception_resolutions — and reads them back. It NEVER writes
// vault_exceptions (the expired state is time truth; reviving or
// extending it is impossible from here), never touches exposures, CEI
// events, intelligence, questions, or the shared timeline. 'Renew' cites
// a separate exception that the reviewer created through the existing
// Phase 5 propose lane and that travels the existing approval lane with
// its own fresh expiry — this module only validates that the citation
// exists in the workspace. 'Remediation question' cites a question that
// already exists in the 15B lane. Citations are validated, never created.

import { vaultDb } from './db.js';
import { sendError, ERROR_CODES } from './errors.js';
import { resolveWorkspaceForMember, requireRole } from './rbac.js';

const MAX_PUBLIC_REASON = 280;
const MAX_PRIVATE_REASON = 10000;

// Bounded reviewer directions. None of them is performed by the system.
export const RESOLUTION_OUTCOMES = Object.freeze([
  'renew',
  'revoke',
  'remediation_required',
  'resolved_externally',
  'defer',
  'remediation_question',
]);

const RESOLUTION_SELECT =
  '*, resolved_by_user:resolved_by(user_id, github_login, display_name)';

function shapeResolutionRow(row) {
  if (!row) return null;
  return {
    resolution_id: row.resolution_id,
    workspace_id: row.workspace_id,
    exception_id: row.exception_id,
    outcome: row.outcome,
    resolved_by: row.resolved_by_user
      ? {
        user_id: row.resolved_by_user.user_id,
        github_login: row.resolved_by_user.github_login,
        display_name: row.resolved_by_user.display_name || null,
      }
      : null,
    reason_public: row.reason_public,
    reason_private: row.reason_private || null,
    renewed_exception_id: row.renewed_exception_id || null,
    linked_question_id: row.linked_question_id || null,
    created_at: row.created_at,
    visibility: 'private',
  };
}

async function loadExceptionInWorkspace(supabase, workspaceId, exceptionId) {
  const { data, error } = await supabase
    .from('vault_exceptions')
    .select('exception_id, state, subject_kind, subject_name, expires_at')
    .eq('workspace_id', workspaceId)
    .eq('exception_id', exceptionId)
    .limit(1);
  if (error) return { error };
  return { row: (Array.isArray(data) && data[0]) || null };
}

/**
 * GET /api/vault/workspaces/:slug/exceptions/:id/resolutions
 *
 * Read-only: the review-case record for one exception, newest first.
 * Append-only history — every prior resolution stays on the record.
 */
export async function handleListExceptionResolutions(req, res) {
  const slug = (req.params && req.params.slug) || '';
  const exceptionId = (req.params && req.params.id) || '';
  const resolved = await resolveWorkspaceForMember(req, res, slug);
  if (!resolved) return;
  const { workspace } = resolved;

  const supabase = vaultDb();
  const exception = await loadExceptionInWorkspace(supabase, workspace.workspace_id, exceptionId);
  if (exception.error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault exception lookup failed');
  }
  if (!exception.row) {
    return sendError(res, 404, ERROR_CODES.not_found, 'not found');
  }

  const { data, error } = await supabase
    .from('vault_exception_resolutions')
    .select(RESOLUTION_SELECT)
    .eq('workspace_id', workspace.workspace_id)
    .eq('exception_id', exceptionId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'resolution list failed');
  }
  res.status(200).json({
    resolutions: (Array.isArray(data) ? data : []).map(shapeResolutionRow),
    visibility: 'private',
  });
}

/**
 * POST /api/vault/workspaces/:slug/exceptions/:id/resolve
 *
 * Reviewer-level decision: record what happens next for ONE expired
 * exception. The exception row is NEVER written — the expired state is
 * the reaper's observation and it stands. Active/proposed exceptions are
 * refused: live trust uses the existing reviewer actions (approve /
 * reject / revoke / extend), not this lane.
 */
export async function handleResolveExpiredException(req, res) {
  const slug = (req.params && req.params.slug) || '';
  const exceptionId = (req.params && req.params.id) || '';
  const resolved = await resolveWorkspaceForMember(req, res, slug);
  if (!resolved) return;
  const { workspace, membership } = resolved;
  // Resolution is a trust decision about what happens next — reviewer
  // territory, exactly like approve/reject/revoke.
  if (!requireRole(res, membership, 'reviewer')) return;

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const outcome = typeof body.outcome === 'string' ? body.outcome : '';
  if (!RESOLUTION_OUTCOMES.includes(outcome)) {
    return sendError(res, 400, ERROR_CODES.bad_request,
      `outcome must be one of: ${RESOLUTION_OUTCOMES.join(', ')}`);
  }
  const reasonPublic = typeof body.reason_public === 'string' ? body.reason_public.trim() : '';
  if (reasonPublic.length < 1 || reasonPublic.length > MAX_PUBLIC_REASON) {
    return sendError(res, 400, ERROR_CODES.bad_request,
      `reason_public is required (1-${MAX_PUBLIC_REASON} characters) — a resolution without a reason is not evidence`);
  }
  const reasonPrivate = typeof body.reason_private === 'string' ? body.reason_private : '';
  if (reasonPrivate.length > MAX_PRIVATE_REASON) {
    return sendError(res, 400, ERROR_CODES.bad_request, `reason_private must be at most ${MAX_PRIVATE_REASON} characters`);
  }
  const renewedExceptionId = typeof body.renewed_exception_id === 'string' ? body.renewed_exception_id : '';
  const linkedQuestionId = typeof body.linked_question_id === 'string' ? body.linked_question_id : '';

  const supabase = vaultDb();
  const exception = await loadExceptionInWorkspace(supabase, workspace.workspace_id, exceptionId);
  if (exception.error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault exception lookup failed');
  }
  if (!exception.row) {
    return sendError(res, 404, ERROR_CODES.not_found, 'not found');
  }
  if (exception.row.state !== 'expired') {
    return sendError(res, 409, ERROR_CODES.exception_state_conflict,
      'resolution applies to EXPIRED exceptions — live trust uses the existing reviewer actions (approve / reject / revoke / extend)');
  }

  // Citation coherence (also enforced by the 0025 CHECK): renew must cite
  // the new proposal; remediation_question must cite the question; nothing
  // else may carry a citation. Citations must EXIST in this workspace —
  // validated, never created.
  if (outcome === 'renew') {
    if (!renewedExceptionId) {
      return sendError(res, 400, ERROR_CODES.bad_request,
        'renew must cite renewed_exception_id — propose the new exception through the existing lane first; this lane never creates or extends trust');
    }
    if (renewedExceptionId === exceptionId) {
      return sendError(res, 400, ERROR_CODES.bad_request, 'a renewal cannot cite itself');
    }
    const renewed = await loadExceptionInWorkspace(supabase, workspace.workspace_id, renewedExceptionId);
    if (renewed.error) {
      return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault exception lookup failed');
    }
    if (!renewed.row) {
      return sendError(res, 400, ERROR_CODES.bad_request,
        'renewed_exception_id does not reference an exception in this workspace');
    }
  } else if (renewedExceptionId) {
    return sendError(res, 400, ERROR_CODES.bad_request,
      `outcome ${outcome} must not carry renewed_exception_id`);
  }
  if (outcome === 'remediation_question') {
    if (!linkedQuestionId) {
      return sendError(res, 400, ERROR_CODES.bad_request,
        'remediation_question must cite linked_question_id — open the question from the source exposure first; this lane never creates questions');
    }
    const { data: questionRows, error: questionError } = await supabase
      .from('component_remediation_questions')
      .select('question_id')
      .eq('workspace_id', workspace.workspace_id)
      .eq('question_id', linkedQuestionId)
      .limit(1);
    if (questionError) {
      return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'remediation question lookup failed');
    }
    if (!(Array.isArray(questionRows) && questionRows[0])) {
      return sendError(res, 400, ERROR_CODES.bad_request,
        'linked_question_id does not reference a remediation question in this workspace');
    }
  } else if (linkedQuestionId) {
    return sendError(res, 400, ERROR_CODES.bad_request,
      `outcome ${outcome} must not carry linked_question_id`);
  }

  const { data: inserted, error: insertError } = await supabase
    .from('vault_exception_resolutions')
    .insert({
      workspace_id: workspace.workspace_id,
      exception_id: exceptionId,
      outcome,
      resolved_by: req.vaultSession.user_id,
      reason_public: reasonPublic,
      reason_private: reasonPrivate || null,
      renewed_exception_id: outcome === 'renew' ? renewedExceptionId : null,
      linked_question_id: outcome === 'remediation_question' ? linkedQuestionId : null,
    })
    .select(RESOLUTION_SELECT)
    .limit(1);
  if (insertError) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'resolution insert failed');
  }
  res.status(201).json(shapeResolutionRow(Array.isArray(inserted) && inserted[0]));
}
