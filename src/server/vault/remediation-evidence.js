// OpenSoyce Trust Vault (PR-16C) — the Fix Evidence Loop: remediation
// evidence records.
//
// DOCTRINE: a recorded direction is not completed remediation. The
// system can ask, structure, validate presence of evidence, and record.
// The human closes the remediation case. The record remembers who closed
// it, when, why, and with what evidence.
//
// The claim, exactly: not "we fixed the vuln" — "we recorded evidence
// that the human says closes the remediation loop."
//
// Structurally enforced: this module writes exactly one thing —
// append-only rows in component_remediation_evidence — and reads them
// back. It NEVER mutates vault_exceptions, vault_exception_resolutions,
// component_remediation_questions, exposures, intelligence, CEI events,
// or the shared timeline. The remediation CASE is derived, never stored:
// a 'remediation_required' resolution opens it; evidence rows mark it
// evidence_recorded. There is no 'fixed' status anywhere — the system
// validates that evidence is PRESENT and CITED; it does not verify the
// fix.

import { vaultDb } from './db.js';
import { sendError, ERROR_CODES } from './errors.js';
import { resolveWorkspaceForMember, requireRole } from './rbac.js';

const MAX_EVIDENCE_REF = 512;
const MAX_PUBLIC_REASON = 280;
const MAX_PRIVATE_REASON = 10000;

// Bounded evidence kinds. Every name is evidence-based wording — what
// was observed or cited — never a system verdict.
export const REMEDIATION_EVIDENCE_TYPES = Object.freeze([
  'fixed_version_observed',
  'pr_or_commit_reference',
  'rescan_no_longer_matches',
  'manual_remediation_note',
]);

const EVIDENCE_SELECT =
  '*, recorded_by_user:recorded_by(user_id, github_login, display_name)';

function shapeEvidenceRow(row) {
  if (!row) return null;
  return {
    evidence_id: row.evidence_id,
    workspace_id: row.workspace_id,
    exception_id: row.exception_id,
    source_exposure_id: row.source_exposure_id || null,
    source_vuln_intel_id: row.source_vuln_intel_id || null,
    related_question_id: row.related_question_id || null,
    related_resolution_id: row.related_resolution_id || null,
    evidence_type: row.evidence_type,
    evidence_ref: row.evidence_ref,
    recorded_by: row.recorded_by_user
      ? {
        user_id: row.recorded_by_user.user_id,
        github_login: row.recorded_by_user.github_login,
        display_name: row.recorded_by_user.display_name || null,
      }
      : null,
    reason_public: row.reason_public,
    reason_private: row.reason_private || null,
    created_at: row.created_at,
    visibility: 'private',
  };
}

async function loadExceptionInWorkspace(supabase, workspaceId, exceptionId) {
  const { data, error } = await supabase
    .from('vault_exceptions')
    .select('exception_id, state, subject_kind, subject_name')
    .eq('workspace_id', workspaceId)
    .eq('exception_id', exceptionId)
    .limit(1);
  if (error) return { error };
  return { row: (Array.isArray(data) && data[0]) || null };
}

// The case discovery: the latest remediation_required resolution on this
// exception. The case is DERIVED from the 16B record — never stored, never
// mutated. Returns { row: null } when no such direction exists (the lane
// refuses: evidence needs an open case to close).
async function findRemediationRequiredResolution(supabase, workspaceId, exceptionId) {
  const { data, error } = await supabase
    .from('vault_exception_resolutions')
    .select('resolution_id, outcome, created_at')
    .eq('workspace_id', workspaceId)
    .eq('exception_id', exceptionId)
    .eq('outcome', 'remediation_required')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) return { error };
  return { row: (Array.isArray(data) && data[0]) || null };
}

// Best-effort exposure discovery via the 6D proposal event (the exception
// row carries no exposure ref — the relationship lives in CEI events).
// Returns null when the exception was not exposure-born; the evidence row
// simply carries no exposure citation in that case.
async function discoverSourceExposure(supabase, workspaceId, exceptionId) {
  const { data, error } = await supabase
    .from('component_exposure_events')
    .select('exposure_id')
    .eq('workspace_id', workspaceId)
    .eq('related_exception_id', exceptionId)
    .eq('event_kind', 'exception_proposed_from_exposure')
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) return { error };
  const row = Array.isArray(data) && data[0];
  return { exposureId: row ? row.exposure_id : null };
}

/**
 * GET /api/vault/workspaces/:slug/exceptions/:id/remediation-evidence
 *
 * Read-only: the evidence record for one remediation case, newest first,
 * plus the DERIVED case status. Append-only history — every evidence
 * record stays on the record.
 */
export async function handleListRemediationEvidence(req, res) {
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
    .from('component_remediation_evidence')
    .select(EVIDENCE_SELECT)
    .eq('workspace_id', workspace.workspace_id)
    .eq('exception_id', exceptionId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'remediation evidence list failed');
  }
  const rows = (Array.isArray(data) ? data : []).map(shapeEvidenceRow);

  // Derived, never stored: direction recorded -> case open;
  // >=1 evidence row -> evidence_recorded. Honest vocabulary only —
  // 'evidence_recorded' is a statement about the record, not about the
  // vulnerability.
  const caseLookup = await findRemediationRequiredResolution(supabase, workspace.workspace_id, exceptionId);
  if (caseLookup.error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'resolution lookup failed');
  }
  let caseStatus = 'no_remediation_direction';
  if (caseLookup.row) {
    caseStatus = rows.length > 0 ? 'evidence_recorded' : 'awaiting_evidence';
  }

  res.status(200).json({
    evidence: rows,
    case_status: caseStatus,
    visibility: 'private',
  });
}

/**
 * POST /api/vault/workspaces/:slug/exceptions/:id/remediation-evidence
 *
 * Record one human-cited remediation evidence row for an exception whose
 * review direction is remediation_required. Append-only; nothing else
 * changes: no exception write, no resolution write, no question write,
 * no CEI event, no timeline event. The evidence reference is REQUIRED —
 * evidence without a citation is a claim, and a claim cannot close the
 * loop.
 */
export async function handleRecordRemediationEvidence(req, res) {
  const slug = (req.params && req.params.slug) || '';
  const exceptionId = (req.params && req.params.id) || '';
  const resolved = await resolveWorkspaceForMember(req, res, slug);
  if (!resolved) return;
  const { workspace, membership } = resolved;
  // Recording evidence is a member-level action, like recording an
  // observation or answering a question — the reviewer DIRECTION already
  // exists; this lane records what a human did about it.
  if (!requireRole(res, membership, 'member')) return;

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const evidenceType = typeof body.evidence_type === 'string' ? body.evidence_type : '';
  if (!REMEDIATION_EVIDENCE_TYPES.includes(evidenceType)) {
    return sendError(res, 400, ERROR_CODES.bad_request,
      `evidence_type must be one of: ${REMEDIATION_EVIDENCE_TYPES.join(', ')}`);
  }
  const evidenceRef = typeof body.evidence_ref === 'string' ? body.evidence_ref.trim() : '';
  if (evidenceRef.length < 1 || evidenceRef.length > MAX_EVIDENCE_REF) {
    return sendError(res, 400, ERROR_CODES.bad_request,
      `evidence_ref is required (1-${MAX_EVIDENCE_REF} characters) — evidence without a reference is a claim, and a claim cannot close the loop`);
  }
  const reasonPublic = typeof body.reason_public === 'string' ? body.reason_public.trim() : '';
  if (reasonPublic.length < 1 || reasonPublic.length > MAX_PUBLIC_REASON) {
    return sendError(res, 400, ERROR_CODES.bad_request,
      `reason_public is required (1-${MAX_PUBLIC_REASON} characters)`);
  }
  const reasonPrivate = typeof body.reason_private === 'string' ? body.reason_private : '';
  if (reasonPrivate.length > MAX_PRIVATE_REASON) {
    return sendError(res, 400, ERROR_CODES.bad_request, `reason_private must be at most ${MAX_PRIVATE_REASON} characters`);
  }

  const supabase = vaultDb();
  const exception = await loadExceptionInWorkspace(supabase, workspace.workspace_id, exceptionId);
  if (exception.error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault exception lookup failed');
  }
  if (!exception.row) {
    return sendError(res, 404, ERROR_CODES.not_found, 'not found');
  }

  // The case must exist: a reviewer direction of remediation_required on
  // this exception. Evidence cannot attach to a case nobody opened — the
  // reviewer decides the direction; this lane records what followed.
  const caseLookup = await findRemediationRequiredResolution(supabase, workspace.workspace_id, exceptionId);
  if (caseLookup.error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'resolution lookup failed');
  }
  if (!caseLookup.row) {
    return sendError(res, 409, ERROR_CODES.exception_state_conflict,
      'no remediation_required direction is recorded for this exception — the reviewer opens the case; evidence closes it');
  }

  // Citation validation — in-workspace, read-only, never created here.
  let relatedResolutionId = typeof body.related_resolution_id === 'string' ? body.related_resolution_id : '';
  if (relatedResolutionId) {
    const { data: resRows, error: resError } = await supabase
      .from('vault_exception_resolutions')
      .select('resolution_id')
      .eq('workspace_id', workspace.workspace_id)
      .eq('exception_id', exceptionId)
      .eq('resolution_id', relatedResolutionId)
      .limit(1);
    if (resError) {
      return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'resolution lookup failed');
    }
    if (!(Array.isArray(resRows) && resRows[0])) {
      return sendError(res, 400, ERROR_CODES.bad_request,
        'related_resolution_id does not reference a resolution of this exception');
    }
  } else {
    // Default citation: the latest remediation_required resolution — the
    // direction this evidence answers. Discovered, not invented.
    relatedResolutionId = caseLookup.row.resolution_id;
  }

  const linkedQuestionId = typeof body.related_question_id === 'string' ? body.related_question_id : '';
  if (linkedQuestionId) {
    const { data: qRows, error: qError } = await supabase
      .from('component_remediation_questions')
      .select('question_id')
      .eq('workspace_id', workspace.workspace_id)
      .eq('question_id', linkedQuestionId)
      .limit(1);
    if (qError) {
      return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'remediation question lookup failed');
    }
    if (!(Array.isArray(qRows) && qRows[0])) {
      return sendError(res, 400, ERROR_CODES.bad_request,
        'related_question_id does not reference a remediation question in this workspace');
    }
  }

  const vulnIntelId = typeof body.source_vuln_intel_id === 'string' ? body.source_vuln_intel_id : '';
  if (vulnIntelId) {
    const { data: ivRows, error: ivError } = await supabase
      .from('component_exposure_vulnerabilities')
      .select('vuln_intel_id')
      .eq('workspace_id', workspace.workspace_id)
      .eq('vuln_intel_id', vulnIntelId)
      .limit(1);
    if (ivError) {
      return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'CEI intelligence lookup failed');
    }
    if (!(Array.isArray(ivRows) && ivRows[0])) {
      return sendError(res, 400, ERROR_CODES.bad_request,
        'source_vuln_intel_id does not reference intelligence in this workspace');
    }
  }

  // Exposure link: discovered from the 6D proposal event (best-effort —
  // a non-exposure-born exception simply carries no exposure citation).
  const exposure = await discoverSourceExposure(supabase, workspace.workspace_id, exceptionId);
  if (exposure.error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'CEI event lookup failed');
  }

  const { data: inserted, error: insertError } = await supabase
    .from('component_remediation_evidence')
    .insert({
      workspace_id: workspace.workspace_id,
      exception_id: exceptionId,
      source_exposure_id: exposure.exposureId,
      source_vuln_intel_id: vulnIntelId || null,
      related_question_id: linkedQuestionId || null,
      related_resolution_id: relatedResolutionId,
      evidence_type: evidenceType,
      evidence_ref: evidenceRef,
      recorded_by: req.vaultSession.user_id,
      reason_public: reasonPublic,
      reason_private: reasonPrivate || null,
    })
    .select(EVIDENCE_SELECT)
    .limit(1);
  if (insertError) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'remediation evidence insert failed');
  }
  res.status(201).json(shapeEvidenceRow(Array.isArray(inserted) && inserted[0]));
}
