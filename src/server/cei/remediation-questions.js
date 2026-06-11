// OpenSoyce Component Exposure Intelligence (PR-15B) — the Remediation
// Question Loop.
//
// DOCTRINE: the scanner observes. Vulnerability intelligence adds context.
// The system asks the remediation question. The human decides. The record
// remembers.
//
//   A remediation question is not a remediation decision.
//   A suggested action is not an approved action.
//   A fix path is not proof of fix.
//   An exception path must still use the exception lane.
//   The reviewer still decides.
//
// Structurally enforced: this module NEVER mutates component_exposures,
// never writes component_exposure_vulnerabilities, never records CEI
// proposal/outcome events, never touches vault_exceptions, and never maps
// an outcome to a state transition anywhere else. It writes exactly one
// thing — rows in component_remediation_questions — and reads them back.
// When the human selects 'propose_exception', this module records the
// DIRECTION only; the actual proposal must travel the existing Phase 5
// exception lane (the propose endpoint, with its own review + reviewer
// approval). There is no parallel exception mechanism here.

import { vaultDb } from '../vault/db.js';
import { sendError, ERROR_CODES } from '../vault/errors.js';
import { resolveWorkspaceForMember, requireRole } from '../vault/rbac.js';

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;
const MAX_PUBLIC_REASON = 280;
const MAX_PRIVATE_REASON = 10000;

export const QUESTION_KINDS = Object.freeze([
  'vulnerability_review',
  'component_risk_review',
]);

// Bounded and humble: every entry is a direction for a PERSON to act on,
// never a transition the system performs. 'propose_exception' means "a
// human will now use the Phase 5 exception lane" — it does not create,
// approve, or propose anything by itself.
export const REMEDIATION_OUTCOMES = Object.freeze([
  'fix_required',
  'defer',
  'propose_exception',
  'not_applicable',
  'needs_owner_review',
  'replace_or_remove',
]);

const QUESTION_SELECT =
  '*,'
  + ' created_by_user:created_by(user_id, github_login, display_name),'
  + ' answered_by_user:answered_by(user_id, github_login, display_name)';

// The detail read additionally embeds the read-only source context: the
// observation the question is about, and the intelligence that prompted it
// (when there is one). Both embeds are READS — the question surface never
// writes either table.
const QUESTION_DETAIL_SELECT =
  QUESTION_SELECT + ','
  + ' source_exposure:source_exposure_id('
  + 'exposure_id, subject_kind, subject_name, source_kind, source_ref, status,'
  + ' exposure_type:exposure_type_id(type_slug)),'
  + ' source_vuln_intel:source_vuln_intel_id('
  + 'vuln_intel_id, vuln_id, source, match_basis, severity, affected_range, source_ref, metadata)';

function shapeUser(u) {
  if (!u) return null;
  return {
    user_id: u.user_id,
    github_login: u.github_login,
    display_name: u.display_name || null,
  };
}

function shapeQuestionRow(row) {
  if (!row) return null;
  const shaped = {
    question_id: row.question_id,
    workspace_id: row.workspace_id,
    source_exposure_id: row.source_exposure_id,
    source_vuln_intel_id: row.source_vuln_intel_id || null,
    package_name: row.package_name,
    observed_version: row.observed_version || null,
    vuln_id: row.vuln_id || null,
    question_kind: row.question_kind,
    status: row.status,
    selected_outcome: row.selected_outcome || null,
    created_by: shapeUser(row.created_by_user),
    answered_by: shapeUser(row.answered_by_user),
    reason_public: row.reason_public || null,
    reason_private: row.reason_private || null,
    due_at: row.due_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    answered_at: row.answered_at || null,
    // Remediation questions are private operational records — there is no
    // public surface for them.
    visibility: 'private',
  };
  if (row.source_exposure !== undefined) {
    shaped.source_exposure = row.source_exposure
      ? {
        exposure_id: row.source_exposure.exposure_id,
        exposure_type: row.source_exposure.exposure_type
          ? row.source_exposure.exposure_type.type_slug
          : null,
        subject_kind: row.source_exposure.subject_kind,
        subject_name: row.source_exposure.subject_name,
        source_kind: row.source_exposure.source_kind,
        source_ref: row.source_exposure.source_ref || null,
        status: row.source_exposure.status,
      }
      : null;
  }
  if (row.source_vuln_intel !== undefined) {
    shaped.source_vuln_intel = row.source_vuln_intel
      ? {
        vuln_intel_id: row.source_vuln_intel.vuln_intel_id,
        vuln_id: row.source_vuln_intel.vuln_id,
        source: row.source_vuln_intel.source,
        match_basis: row.source_vuln_intel.match_basis,
        severity: row.source_vuln_intel.severity || null,
        affected_range: row.source_vuln_intel.affected_range || null,
        source_ref: row.source_vuln_intel.source_ref || null,
        metadata: row.source_vuln_intel.metadata || {},
      }
      : null;
  }
  return shaped;
}

async function loadExposureForQuestion(supabase, workspaceId, exposureId) {
  const { data, error } = await supabase
    .from('component_exposures')
    .select('exposure_id, subject_kind, subject_name, metadata, exposure_type:exposure_type_id(type_slug)')
    .eq('workspace_id', workspaceId)
    .eq('exposure_id', exposureId)
    .limit(1);
  if (error) return { error };
  return { row: (Array.isArray(data) && data[0]) || null };
}

async function loadVulnIntelForQuestion(supabase, workspaceId, exposureId, vulnIntelId) {
  // Workspace AND exposure scoped: intelligence from another workspace or
  // another exposure cannot be attached to this question.
  const { data, error } = await supabase
    .from('component_exposure_vulnerabilities')
    .select('vuln_intel_id, vuln_id')
    .eq('workspace_id', workspaceId)
    .eq('exposure_id', exposureId)
    .eq('vuln_intel_id', vulnIntelId)
    .limit(1);
  if (error) return { error };
  return { row: (Array.isArray(data) && data[0]) || null };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/vault/workspaces/:slug/remediation-questions
 *
 * Read-only list, newest first. Optional ?status= filter and
 * ?source_exposure_id= filter.
 */
export async function handleListRemediationQuestions(req, res) {
  const slug = (req.params && req.params.slug) || '';
  const resolved = await resolveWorkspaceForMember(req, res, slug);
  if (!resolved) return;
  const { workspace } = resolved;

  const statusFilter = typeof req.query?.status === 'string' ? req.query.status : '';
  if (statusFilter && !['open', 'answered', 'cancelled'].includes(statusFilter)) {
    return sendError(res, 400, ERROR_CODES.bad_request, 'status must be open, answered, or cancelled');
  }
  const exposureFilter = typeof req.query?.source_exposure_id === 'string'
    ? req.query.source_exposure_id
    : '';
  let limit = parseInt(req.query?.limit, 10);
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;
  let offset = parseInt(req.query?.offset, 10);
  if (!Number.isFinite(offset) || offset < 0) offset = 0;

  const supabase = vaultDb();
  let query = supabase
    .from('component_remediation_questions')
    .select(QUESTION_SELECT, { count: 'estimated' })
    .eq('workspace_id', workspace.workspace_id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (statusFilter) query = query.eq('status', statusFilter);
  if (exposureFilter) query = query.eq('source_exposure_id', exposureFilter);

  const { data, error, count } = await query;
  if (error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'remediation question list failed');
  }
  res.status(200).json({
    questions: (Array.isArray(data) ? data : []).map(shapeQuestionRow),
    total_count_estimate: typeof count === 'number' ? count : 0,
    limit,
    offset,
    visibility: 'private',
  });
}

/**
 * GET /api/vault/workspaces/:slug/remediation-questions/:id
 *
 * Read-only detail with the embedded read-only source context.
 */
export async function handleGetRemediationQuestion(req, res) {
  const slug = (req.params && req.params.slug) || '';
  const questionId = (req.params && req.params.id) || '';
  const resolved = await resolveWorkspaceForMember(req, res, slug);
  if (!resolved) return;
  const { workspace } = resolved;

  const supabase = vaultDb();
  const { data, error } = await supabase
    .from('component_remediation_questions')
    .select(QUESTION_DETAIL_SELECT)
    .eq('workspace_id', workspace.workspace_id)
    .eq('question_id', questionId)
    .limit(1);
  if (error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'remediation question lookup failed');
  }
  const row = Array.isArray(data) && data[0];
  if (!row) {
    return sendError(res, 404, ERROR_CODES.not_found, 'not found');
  }
  res.status(200).json(shapeQuestionRow(row));
}

/**
 * POST /api/vault/workspaces/:slug/remediation-questions
 *
 * Open a remediation question from an observed dependency exposure,
 * optionally citing the vulnerability-intelligence context that prompted
 * it. Opening a question changes NOTHING else: no exposure status, no
 * exception, no proposal, no CEI event. The question kind is derived
 * server-side from what the question is anchored to — the client cannot
 * label a question as something it is not.
 */
export async function handleOpenRemediationQuestion(req, res) {
  const slug = (req.params && req.params.slug) || '';
  const resolved = await resolveWorkspaceForMember(req, res, slug);
  if (!resolved) return;
  const { workspace, membership } = resolved;
  if (!requireRole(res, membership, 'member')) return;

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const sourceExposureId = typeof body.source_exposure_id === 'string' ? body.source_exposure_id : '';
  const sourceVulnIntelId = typeof body.source_vuln_intel_id === 'string' ? body.source_vuln_intel_id : '';
  if (!sourceExposureId) {
    return sendError(res, 400, ERROR_CODES.bad_request, 'source_exposure_id is required — a remediation question is always about an observed exposure');
  }
  let dueAt = null;
  if (body.due_at !== undefined && body.due_at !== null) {
    const parsed = new Date(body.due_at);
    if (typeof body.due_at !== 'string' || Number.isNaN(parsed.getTime())) {
      return sendError(res, 400, ERROR_CODES.bad_request, 'due_at must be an ISO timestamp');
    }
    dueAt = parsed.toISOString();
  }

  const supabase = vaultDb();
  const exposure = await loadExposureForQuestion(supabase, workspace.workspace_id, sourceExposureId);
  if (exposure.error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'CEI exposure lookup failed');
  }
  if (!exposure.row) {
    return sendError(res, 404, ERROR_CODES.not_found, 'not found');
  }
  // The question layer covers observed DEPENDENCY facts in 15B. Other
  // native types have no remediation-question framing yet — refuse honestly
  // instead of stretching.
  const typeSlug = exposure.row.exposure_type ? exposure.row.exposure_type.type_slug : null;
  if (typeSlug !== 'dependency-exposure' || exposure.row.subject_kind !== 'package') {
    return sendError(res, 400, ERROR_CODES.bad_request,
      'remediation questions cover dependency-exposure records in this scope');
  }
  const observedVersion = exposure.row.metadata && typeof exposure.row.metadata.version === 'string'
    ? exposure.row.metadata.version
    : null;

  // When the question is prompted by intelligence, the context must be REAL:
  // workspace-scoped, attached to THIS exposure. The vuln id is denormalized
  // from the cited row, never accepted from the client.
  let vulnId = null;
  if (sourceVulnIntelId) {
    const intel = await loadVulnIntelForQuestion(
      supabase, workspace.workspace_id, sourceExposureId, sourceVulnIntelId,
    );
    if (intel.error) {
      return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'CEI intelligence lookup failed');
    }
    if (!intel.row) {
      return sendError(res, 400, ERROR_CODES.bad_request,
        'source_vuln_intel_id does not reference intelligence attached to this exposure');
    }
    vulnId = intel.row.vuln_id;
  }
  const questionKind = sourceVulnIntelId ? 'vulnerability_review' : 'component_risk_review';

  const { data: inserted, error: insertError } = await supabase
    .from('component_remediation_questions')
    .insert({
      workspace_id: workspace.workspace_id,
      source_exposure_id: sourceExposureId,
      source_vuln_intel_id: sourceVulnIntelId || null,
      package_name: exposure.row.subject_name,
      observed_version: observedVersion,
      vuln_id: vulnId,
      question_kind: questionKind,
      status: 'open',
      created_by: req.vaultSession.user_id,
      due_at: dueAt,
    })
    .select(QUESTION_SELECT)
    .limit(1);
  if (insertError) {
    // Partial-unique race or repeat: an OPEN question for this fact already
    // exists. Asking again is repetition, not a new question — point at the
    // existing one instead of duplicating the record.
    if (insertError.code === '23505') {
      let existingQuery = supabase
        .from('component_remediation_questions')
        .select('question_id')
        .eq('workspace_id', workspace.workspace_id)
        .eq('source_exposure_id', sourceExposureId)
        .eq('question_kind', questionKind)
        .eq('status', 'open');
      existingQuery = vulnId ? existingQuery.eq('vuln_id', vulnId) : existingQuery.is('vuln_id', null);
      const { data: existing } = await existingQuery.limit(1);
      const existingRow = Array.isArray(existing) && existing[0];
      return sendError(res, 409, ERROR_CODES.remediation_question_conflict,
        'an open remediation question already exists for this exposure and vulnerability', {
          existing_question_id: existingRow ? existingRow.question_id : null,
        });
    }
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'remediation question insert failed');
  }
  res.status(201).json(shapeQuestionRow(Array.isArray(inserted) && inserted[0]));
}

/**
 * POST /api/vault/workspaces/:slug/remediation-questions/:id/answer
 *
 * Record the human-selected direction for ONE open question. This is a
 * guarded transition (open -> answered, exactly once) on the question row
 * and nothing else: no exposure write, no exception, no proposal, no CEI
 * event, no reviewer outcome. When the selected outcome is
 * 'propose_exception', the answer records the direction and the human then
 * uses the existing Phase 5 exception lane to actually propose — with its
 * own explicit review and reviewer approval.
 */
export async function handleAnswerRemediationQuestion(req, res) {
  const slug = (req.params && req.params.slug) || '';
  const questionId = (req.params && req.params.id) || '';
  const resolved = await resolveWorkspaceForMember(req, res, slug);
  if (!resolved) return;
  const { workspace, membership } = resolved;
  if (!requireRole(res, membership, 'member')) return;

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const outcome = typeof body.selected_outcome === 'string' ? body.selected_outcome : '';
  if (!REMEDIATION_OUTCOMES.includes(outcome)) {
    return sendError(res, 400, ERROR_CODES.bad_request,
      `selected_outcome must be one of: ${REMEDIATION_OUTCOMES.join(', ')}`);
  }
  const reasonPublic = typeof body.reason_public === 'string' ? body.reason_public.trim() : '';
  if (reasonPublic.length > MAX_PUBLIC_REASON) {
    return sendError(res, 400, ERROR_CODES.bad_request, `reason_public must be at most ${MAX_PUBLIC_REASON} characters`);
  }
  const reasonPrivate = typeof body.reason_private === 'string' ? body.reason_private : '';
  if (reasonPrivate.length > MAX_PRIVATE_REASON) {
    return sendError(res, 400, ERROR_CODES.bad_request, `reason_private must be at most ${MAX_PRIVATE_REASON} characters`);
  }

  const supabase = vaultDb();
  const nowIso = new Date().toISOString();
  // Guarded transition: the UPDATE only lands on a row that is still open.
  // A second answer loses the guard and gets a 409 — answers are recorded
  // exactly once and never overwritten.
  const { data: updated, error: updateError } = await supabase
    .from('component_remediation_questions')
    .update({
      status: 'answered',
      selected_outcome: outcome,
      answered_by: req.vaultSession.user_id,
      answered_at: nowIso,
      updated_at: nowIso,
      reason_public: reasonPublic || null,
      reason_private: reasonPrivate || null,
    })
    .eq('workspace_id', workspace.workspace_id)
    .eq('question_id', questionId)
    .eq('status', 'open')
    .select(QUESTION_SELECT)
    .limit(1);
  if (updateError) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'remediation question answer failed');
  }
  const row = Array.isArray(updated) && updated[0];
  if (!row) {
    // Distinguish "never existed / not yours" from "already decided".
    const { data: existing, error: lookupError } = await supabase
      .from('component_remediation_questions')
      .select('question_id, status')
      .eq('workspace_id', workspace.workspace_id)
      .eq('question_id', questionId)
      .limit(1);
    if (lookupError) {
      return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'remediation question lookup failed');
    }
    const found = Array.isArray(existing) && existing[0];
    if (!found) {
      return sendError(res, 404, ERROR_CODES.not_found, 'not found');
    }
    return sendError(res, 409, ERROR_CODES.remediation_question_conflict,
      `question is ${found.status} — an answer is recorded exactly once`);
  }
  res.status(200).json(shapeQuestionRow(row));
}
