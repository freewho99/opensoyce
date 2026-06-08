// OpenSoyce Trust Vault — exception state machine + API handlers.
//
// PR-V2-B. Per PR-V1-C §§1–7.
//
// 8 endpoints:
//   GET    /api/vault/workspaces/:slug/exceptions
//   GET    /api/vault/workspaces/:slug/exceptions/:id
//   POST   /api/vault/workspaces/:slug/exceptions               (propose)
//   POST   /api/vault/workspaces/:slug/exceptions/:id/approve
//   POST   /api/vault/workspaces/:slug/exceptions/:id/reject    (reviewer OR proposer-withdrawal)
//   POST   /api/vault/workspaces/:slug/exceptions/:id/revoke
//   POST   /api/vault/workspaces/:slug/exceptions/:id/extend
//   PATCH  /api/vault/workspaces/:slug/exceptions/:id           (proposer-only, only while 'proposed')
//
// DELETE is intentionally NOT implemented; the route handler returns 405.
//
// Every mutating SQL UPDATE carries a `WHERE state = '<expected>'` guard
// so a race that changed the state between read and write surfaces as a
// 409 conflict — not a silent overwrite.

import { vaultDb } from './db.js';
import { sendError, ERROR_CODES } from './errors.js';
import { resolveWorkspaceForMember, requireRole } from './rbac.js';
import { computeExceptionEtag, checkIfMatch } from './etag.js';
import { maybeReplayIdempotent, storeIdempotencyResponse } from './idempotency.js';

const PACKAGE_SUBJECT_RE = /^@?[a-z0-9][\w./-]*(@[\w.+-]+)?$/i;
const REPO_SUBJECT_RE = /^[A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*$/;
const MAX_EXPIRES_DAYS = 365;
const MAX_LIMIT = 200;

// Stable response shape; mask reason_private for member-role viewers.
function shapeExceptionRow(row, viewerRole) {
  if (!row) return null;
  const masked = viewerRole === 'member';
  return {
    exception_id: row.exception_id,
    workspace_id: row.workspace_id,
    subject_kind: row.subject_kind,
    subject_name: row.subject_name,
    state: row.state,
    original_action: row.original_action,
    allowed_action: row.allowed_action,
    proposed_by: row.proposed_by,
    proposed_at: row.proposed_at,
    reviewed_by: row.reviewed_by || null,
    reviewed_at: row.reviewed_at || null,
    expires_at: row.expires_at || null,
    reason_public: row.reason_public || null,
    ...(masked ? {} : { reason_private: row.reason_private || null }),
    proof_anchors: row.proof_anchors,
    revoked_at: row.revoked_at || null,
    revoked_by: row.revoked_by || null,
    revoke_reason: row.revoke_reason || null,
  };
}

function setEtagHeader(res, row) {
  const etag = computeExceptionEtag(row);
  if (etag) res.setHeader('ETag', etag);
}

function setMaskedHeader(res, viewerRole) {
  if (viewerRole === 'member') {
    res.setHeader('X-OpenSoyce-Vault-Masked-Fields', 'reason_private');
  }
}

// ---------- Validation helpers ----------

function validateSubject(subject) {
  if (!subject || typeof subject !== 'object') return 'subject required';
  const { kind, name } = subject;
  if (kind !== 'package' && kind !== 'repo') return 'subject.kind must be package or repo';
  if (typeof name !== 'string' || name.length === 0 || name.length > 200) {
    return 'subject.name must be 1-200 chars';
  }
  if (kind === 'package' && !PACKAGE_SUBJECT_RE.test(name)) {
    return 'subject.name does not look like name or name@version';
  }
  if (kind === 'repo' && !REPO_SUBJECT_RE.test(name)) {
    return 'subject.name does not look like owner/repo';
  }
  return null;
}

function isDowngrade(originalAction, allowedAction) {
  if (originalAction === 'BLOCK' && (allowedAction === 'WARN' || allowedAction === 'ALLOW')) return true;
  if (originalAction === 'WARN' && allowedAction === 'ALLOW') return true;
  return false;
}

function parseExpiresAt(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms);
}

// ---------- GET (list) ----------

export async function handleListExceptions(req, res) {
  const slug = (req.params && req.params.slug) || '';
  const resolved = await resolveWorkspaceForMember(req, res, slug);
  if (!resolved) return;
  const { workspace, membership } = resolved;

  const stateFilter = typeof req.query.state === 'string'
    ? req.query.state.split(',').map((s) => s.trim()).filter(Boolean)
    : null;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), MAX_LIMIT);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  const supabase = vaultDb();
  let q = supabase
    .from('vault_exceptions')
    .select('*', { count: 'exact' })
    .eq('workspace_id', workspace.workspace_id)
    .order('proposed_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (stateFilter && stateFilter.length > 0) {
    q = q.in('state', stateFilter);
  }
  const { data, error, count } = await q;
  if (error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault exception list failed');
  }
  const rows = (Array.isArray(data) ? data : []).map((r) => shapeExceptionRow(r, membership.role));
  setMaskedHeader(res, membership.role);
  res.status(200).json({
    exceptions: rows,
    total_count_estimate: typeof count === 'number' ? count : rows.length,
    limit,
    offset,
  });
}

// ---------- GET (single) ----------

async function loadSingleException(req, res) {
  const slug = (req.params && req.params.slug) || '';
  const id = (req.params && req.params.id) || '';
  const resolved = await resolveWorkspaceForMember(req, res, slug);
  if (!resolved) return null;
  const { workspace, membership } = resolved;
  const supabase = vaultDb();
  const { data, error } = await supabase
    .from('vault_exceptions')
    .select('*')
    .eq('workspace_id', workspace.workspace_id)
    .eq('exception_id', id)
    .limit(1);
  if (error) {
    sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault exception read failed');
    return null;
  }
  const row = Array.isArray(data) && data[0];
  if (!row) {
    sendError(res, 404, ERROR_CODES.not_found, 'not found');
    return null;
  }
  return { workspace, membership, row };
}

export async function handleGetException(req, res) {
  const result = await loadSingleException(req, res);
  if (!result) return;
  const { row, membership } = result;
  setEtagHeader(res, row);
  setMaskedHeader(res, membership.role);
  res.status(200).json(shapeExceptionRow(row, membership.role));
}

// ---------- POST (propose) ----------

export async function handleProposeException(req, res) {
  const slug = (req.params && req.params.slug) || '';
  const resolved = await resolveWorkspaceForMember(req, res, slug);
  if (!resolved) return;
  const { workspace, membership } = resolved;
  const body = req.body || {};
  const idempotencyKey = typeof body.idempotency_key === 'string' ? body.idempotency_key : null;
  const replay = await maybeReplayIdempotent(req, res, req.vaultSession, workspace.workspace_id, idempotencyKey);
  if (replay.replayed) return;

  const subjectErr = validateSubject(body.subject);
  if (subjectErr) return sendError(res, 400, ERROR_CODES.invalid_subject, subjectErr);
  const { kind: subjectKind, name: subjectName } = body.subject;

  const originalAction = body.original_action;
  const allowedAction = body.allowed_action;
  if (originalAction !== 'BLOCK' && originalAction !== 'WARN') {
    return sendError(res, 400, ERROR_CODES.bad_request, 'original_action must be BLOCK or WARN');
  }
  if (!isDowngrade(originalAction, allowedAction)) {
    return sendError(
      res,
      400,
      ERROR_CODES.downgrade_only_violation,
      'allowed_action must be a strict downgrade (BLOCK→WARN|ALLOW; WARN→ALLOW)',
    );
  }

  const reasonPublic = typeof body.reason_public === 'string' ? body.reason_public.trim() : '';
  if (reasonPublic.length < 1 || reasonPublic.length > 280) {
    return sendError(res, 400, ERROR_CODES.bad_request, 'reason_public must be 1-280 chars');
  }
  const reasonPrivate = typeof body.reason_private === 'string' ? body.reason_private : null;
  if (reasonPrivate && reasonPrivate.length > 10000) {
    return sendError(res, 400, ERROR_CODES.bad_request, 'reason_private must be <= 10000 chars');
  }
  if (!Array.isArray(body.proof_anchors) || body.proof_anchors.length === 0) {
    return sendError(res, 400, ERROR_CODES.bad_request, 'proof_anchors must be a non-empty array');
  }

  const supabase = vaultDb();
  const { data, error } = await supabase
    .from('vault_exceptions')
    .insert({
      workspace_id: workspace.workspace_id,
      subject_kind: subjectKind,
      subject_name: subjectName,
      original_action: originalAction,
      allowed_action: allowedAction,
      state: 'proposed',
      proposed_by: req.vaultSession.user_id,
      reason_public: reasonPublic,
      reason_private: reasonPrivate,
      proof_anchors: body.proof_anchors,
    })
    .select('*')
    .limit(1);
  if (error) {
    // Map CHECK violations to honest 400/422.
    if (error.code === '23514') {
      return sendError(res, 422, ERROR_CODES.bad_request, `constraint violation: ${error.message}`);
    }
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault exception insert failed');
  }
  const row = data && data[0];
  if (!row) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault exception insert returned no row');
  }
  const shape = shapeExceptionRow(row, membership.role);
  setEtagHeader(res, row);
  setMaskedHeader(res, membership.role);
  await storeIdempotencyResponse({
    workspaceId: workspace.workspace_id,
    userId: req.vaultSession.user_id,
    idempotencyKey,
    requestRoute: `POST ${req.path}`,
    responseStatus: 201,
    responseSnapshot: shape,
  });
  res.status(201).json(shape);
}

// ---------- POST approve ----------

export async function handleApproveException(req, res) {
  // Ordering (PR-V2-B post-review fix): resolve workspace + membership →
  // route-level role check → idempotency replay → THEN load row + run
  // state-truth checks (If-Match, current-state guard, four-eye,
  // expires_at). A successful approve followed by a retry with the same
  // idempotency_key must return the original 200, NOT a 409 produced by
  // the now-active state.
  const slug = (req.params && req.params.slug) || '';
  const id = (req.params && req.params.id) || '';
  const resolved = await resolveWorkspaceForMember(req, res, slug);
  if (!resolved) return;
  const { workspace, membership } = resolved;
  if (!requireRole(res, membership, 'reviewer')) return;

  const body = req.body || {};
  const idempotencyKey = typeof body.idempotency_key === 'string' ? body.idempotency_key : null;
  const replay = await maybeReplayIdempotent(req, res, req.vaultSession, workspace.workspace_id, idempotencyKey);
  if (replay.replayed) return;

  // Load row + state-truth checks AFTER idempotency.
  const supabase = vaultDb();
  const { data: rows, error: rowError } = await supabase
    .from('vault_exceptions')
    .select('*')
    .eq('workspace_id', workspace.workspace_id)
    .eq('exception_id', id)
    .limit(1);
  if (rowError) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault exception read failed');
  }
  const row = Array.isArray(rows) && rows[0];
  if (!row) {
    return sendError(res, 404, ERROR_CODES.not_found, 'not found');
  }

  const ifMatch = checkIfMatch(req, computeExceptionEtag(row));
  if (!ifMatch.ok) {
    return sendError(res, 412, ERROR_CODES.precondition_failed, 'If-Match etag mismatch', {
      current_etag: ifMatch.currentEtag,
    });
  }

  if (row.state !== 'proposed') {
    return sendError(res, 409, ERROR_CODES.exception_state_conflict, `cannot approve from state ${row.state}`, {
      current_state: row.state,
    });
  }

  // Four-eye principle: a reviewer cannot self-approve. Owner may.
  if (membership.role === 'reviewer' && row.proposed_by === req.vaultSession.user_id) {
    return sendError(res, 403, ERROR_CODES.self_approval_forbidden, 'reviewer cannot approve their own proposal');
  }

  const expiresAt = parseExpiresAt(body.expires_at);
  if (!expiresAt) {
    return sendError(res, 400, ERROR_CODES.bad_request, 'expires_at must be an ISO-8601 timestamp');
  }
  const now = Date.now();
  if (expiresAt.getTime() <= now + 60_000) {
    return sendError(res, 400, ERROR_CODES.expires_at_in_past, 'expires_at must be > now + 60s');
  }
  if (expiresAt.getTime() > now + MAX_EXPIRES_DAYS * 24 * 60 * 60 * 1000) {
    return sendError(res, 400, ERROR_CODES.expires_at_too_far, `expires_at must be <= ${MAX_EXPIRES_DAYS} days out`);
  }

  const reasonPublic = typeof body.reason_public === 'string' ? body.reason_public.trim() : row.reason_public || '';
  if (reasonPublic.length < 1 || reasonPublic.length > 280) {
    return sendError(res, 400, ERROR_CODES.bad_request, 'reason_public must be 1-280 chars');
  }
  const reasonPrivate = typeof body.reason_private === 'string' ? body.reason_private : row.reason_private;

  // State-machine UPDATE guard: WHERE state = 'proposed' rejects races.
  const { data, error } = await supabase
    .from('vault_exceptions')
    .update({
      state: 'active',
      reviewed_by: req.vaultSession.user_id,
      reviewed_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
      reason_public: reasonPublic,
      reason_private: reasonPrivate,
    })
    .eq('exception_id', row.exception_id)
    .eq('state', 'proposed')
    .select('*')
    .limit(1);
  if (error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault exception approve failed');
  }
  const updated = Array.isArray(data) && data[0];
  if (!updated) {
    // Lost the race; re-read the current state for the client.
    const { data: latest } = await supabase
      .from('vault_exceptions')
      .select('state')
      .eq('exception_id', row.exception_id)
      .limit(1);
    return sendError(
      res,
      409,
      ERROR_CODES.exception_state_conflict,
      'exception state changed under concurrent request',
      { current_state: (Array.isArray(latest) && latest[0] && latest[0].state) || null },
    );
  }
  const shape = shapeExceptionRow(updated, membership.role);
  setEtagHeader(res, updated);
  setMaskedHeader(res, membership.role);
  await storeIdempotencyResponse({
    workspaceId: workspace.workspace_id,
    userId: req.vaultSession.user_id,
    idempotencyKey,
    requestRoute: `POST ${req.path}`,
    responseStatus: 200,
    responseSnapshot: shape,
  });
  res.status(200).json(shape);
}

// ---------- POST reject ----------

export async function handleRejectException(req, res) {
  // Ordering (PR-V2-B post-review fix): workspace → membership-only
  // role gate (reject's role check is row-dependent — reviewer OR
  // proposer — so it stays AFTER row load) → idempotency replay →
  // row load + state-truth checks. Workspace membership alone is the
  // pre-idempotency floor: a non-member cannot replay a key they don't
  // own anyway, but workspace resolution must succeed first to scope
  // the idempotency lookup.
  const slug = (req.params && req.params.slug) || '';
  const id = (req.params && req.params.id) || '';
  const resolved = await resolveWorkspaceForMember(req, res, slug);
  if (!resolved) return;
  const { workspace, membership } = resolved;

  const body = req.body || {};
  const idempotencyKey = typeof body.idempotency_key === 'string' ? body.idempotency_key : null;
  const replay = await maybeReplayIdempotent(req, res, req.vaultSession, workspace.workspace_id, idempotencyKey);
  if (replay.replayed) return;

  const supabase = vaultDb();
  const { data: rows, error: rowError } = await supabase
    .from('vault_exceptions')
    .select('*')
    .eq('workspace_id', workspace.workspace_id)
    .eq('exception_id', id)
    .limit(1);
  if (rowError) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault exception read failed');
  }
  const row = Array.isArray(rows) && rows[0];
  if (!row) {
    return sendError(res, 404, ERROR_CODES.not_found, 'not found');
  }

  if (row.state !== 'proposed') {
    return sendError(res, 409, ERROR_CODES.exception_state_conflict, `cannot reject from state ${row.state}`, {
      current_state: row.state,
    });
  }

  // Two paths: reviewer rejects OR proposer withdraws own proposal.
  const isProposer = row.proposed_by === req.vaultSession.user_id;
  const isReviewer = membership.role === 'reviewer' || membership.role === 'owner';
  if (!isProposer && !isReviewer) {
    return sendError(res, 403, ERROR_CODES.forbidden_role, 'requires reviewer role OR be the proposer');
  }

  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (reason.length < 1 || reason.length > 280) {
    return sendError(res, 400, ERROR_CODES.bad_request, 'reason must be 1-280 chars');
  }

  const { data, error } = await supabase
    .from('vault_exceptions')
    .update({
      state: 'rejected',
      reviewed_by: req.vaultSession.user_id,
      reviewed_at: new Date().toISOString(),
      reason_public: reason,
    })
    .eq('exception_id', row.exception_id)
    .eq('state', 'proposed')
    .select('*')
    .limit(1);
  if (error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault exception reject failed');
  }
  const updated = Array.isArray(data) && data[0];
  if (!updated) {
    return sendError(res, 409, ERROR_CODES.exception_state_conflict, 'exception state changed under concurrent request');
  }
  const shape = shapeExceptionRow(updated, membership.role);
  setEtagHeader(res, updated);
  setMaskedHeader(res, membership.role);
  await storeIdempotencyResponse({
    workspaceId: workspace.workspace_id,
    userId: req.vaultSession.user_id,
    idempotencyKey,
    requestRoute: `POST ${req.path}`,
    responseStatus: 200,
    responseSnapshot: shape,
  });
  res.status(200).json(shape);
}

// ---------- POST revoke ----------

export async function handleRevokeException(req, res) {
  // Ordering (PR-V2-B post-review fix): same shape as approve.
  const slug = (req.params && req.params.slug) || '';
  const id = (req.params && req.params.id) || '';
  const resolved = await resolveWorkspaceForMember(req, res, slug);
  if (!resolved) return;
  const { workspace, membership } = resolved;
  if (!requireRole(res, membership, 'reviewer')) return;

  const body = req.body || {};
  const idempotencyKey = typeof body.idempotency_key === 'string' ? body.idempotency_key : null;
  const replay = await maybeReplayIdempotent(req, res, req.vaultSession, workspace.workspace_id, idempotencyKey);
  if (replay.replayed) return;

  const supabase = vaultDb();
  const { data: rows, error: rowError } = await supabase
    .from('vault_exceptions')
    .select('*')
    .eq('workspace_id', workspace.workspace_id)
    .eq('exception_id', id)
    .limit(1);
  if (rowError) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault exception read failed');
  }
  const row = Array.isArray(rows) && rows[0];
  if (!row) {
    return sendError(res, 404, ERROR_CODES.not_found, 'not found');
  }

  if (row.state !== 'active') {
    return sendError(res, 409, ERROR_CODES.exception_state_conflict, `cannot revoke from state ${row.state}`, {
      current_state: row.state,
    });
  }

  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (reason.length < 1 || reason.length > 280) {
    return sendError(res, 400, ERROR_CODES.bad_request, 'reason must be 1-280 chars');
  }

  const { data, error } = await supabase
    .from('vault_exceptions')
    .update({
      state: 'revoked',
      revoked_at: new Date().toISOString(),
      revoked_by: req.vaultSession.user_id,
      revoke_reason: reason,
    })
    .eq('exception_id', row.exception_id)
    .eq('state', 'active')
    .select('*')
    .limit(1);
  if (error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault exception revoke failed');
  }
  const updated = Array.isArray(data) && data[0];
  if (!updated) {
    return sendError(res, 409, ERROR_CODES.exception_state_conflict, 'exception state changed under concurrent request');
  }
  const shape = shapeExceptionRow(updated, membership.role);
  setEtagHeader(res, updated);
  setMaskedHeader(res, membership.role);
  await storeIdempotencyResponse({
    workspaceId: workspace.workspace_id,
    userId: req.vaultSession.user_id,
    idempotencyKey,
    requestRoute: `POST ${req.path}`,
    responseStatus: 200,
    responseSnapshot: shape,
  });
  res.status(200).json(shape);
}

// ---------- POST extend ----------

export async function handleExtendException(req, res) {
  // Ordering (PR-V2-B post-review fix): same shape as approve/revoke.
  const slug = (req.params && req.params.slug) || '';
  const id = (req.params && req.params.id) || '';
  const resolved = await resolveWorkspaceForMember(req, res, slug);
  if (!resolved) return;
  const { workspace, membership } = resolved;
  if (!requireRole(res, membership, 'reviewer')) return;

  const body = req.body || {};
  const idempotencyKey = typeof body.idempotency_key === 'string' ? body.idempotency_key : null;
  const replay = await maybeReplayIdempotent(req, res, req.vaultSession, workspace.workspace_id, idempotencyKey);
  if (replay.replayed) return;

  const supabase = vaultDb();
  const { data: rows, error: rowError } = await supabase
    .from('vault_exceptions')
    .select('*')
    .eq('workspace_id', workspace.workspace_id)
    .eq('exception_id', id)
    .limit(1);
  if (rowError) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault exception read failed');
  }
  const row = Array.isArray(rows) && rows[0];
  if (!row) {
    return sendError(res, 404, ERROR_CODES.not_found, 'not found');
  }

  if (row.state !== 'active') {
    return sendError(res, 409, ERROR_CODES.exception_state_conflict, `cannot extend from state ${row.state}`, {
      current_state: row.state,
    });
  }

  const expiresAt = parseExpiresAt(body.expires_at);
  if (!expiresAt) {
    return sendError(res, 400, ERROR_CODES.bad_request, 'expires_at must be an ISO-8601 timestamp');
  }
  const now = Date.now();
  if (expiresAt.getTime() <= now + 60_000) {
    return sendError(res, 400, ERROR_CODES.expires_at_in_past, 'expires_at must be > now + 60s');
  }
  if (expiresAt.getTime() > now + MAX_EXPIRES_DAYS * 24 * 60 * 60 * 1000) {
    return sendError(res, 400, ERROR_CODES.expires_at_too_far, `expires_at must be <= ${MAX_EXPIRES_DAYS} days out`);
  }
  if (row.expires_at && expiresAt.getTime() <= new Date(row.expires_at).getTime()) {
    return sendError(res, 400, ERROR_CODES.bad_request, 'extend must move expires_at forward');
  }

  const { data, error } = await supabase
    .from('vault_exceptions')
    .update({
      expires_at: expiresAt.toISOString(),
      reviewed_by: req.vaultSession.user_id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('exception_id', row.exception_id)
    .eq('state', 'active')
    .select('*')
    .limit(1);
  if (error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault exception extend failed');
  }
  const updated = Array.isArray(data) && data[0];
  if (!updated) {
    return sendError(res, 409, ERROR_CODES.exception_state_conflict, 'exception state changed under concurrent request');
  }
  const shape = shapeExceptionRow(updated, membership.role);
  setEtagHeader(res, updated);
  setMaskedHeader(res, membership.role);
  await storeIdempotencyResponse({
    workspaceId: workspace.workspace_id,
    userId: req.vaultSession.user_id,
    idempotencyKey,
    requestRoute: `POST ${req.path}`,
    responseStatus: 200,
    responseSnapshot: shape,
  });
  res.status(200).json(shape);
}

// ---------- PATCH (proposer-only proposal edit) ----------

export async function handlePatchProposal(req, res) {
  // Ordering (PR-V2-B post-review fix): workspace → idempotency replay →
  // row load → state-truth checks (proposer-only, state='proposed').
  // The proposer-only check is row-dependent and must run AFTER
  // idempotency replay so a retried successful PATCH still returns the
  // cached response even if a different reviewer rejected the proposal
  // between the original request and the retry.
  const slug = (req.params && req.params.slug) || '';
  const id = (req.params && req.params.id) || '';
  const resolved = await resolveWorkspaceForMember(req, res, slug);
  if (!resolved) return;
  const { workspace, membership } = resolved;

  const body = req.body || {};
  const idempotencyKey = typeof body.idempotency_key === 'string' ? body.idempotency_key : null;
  const replay = await maybeReplayIdempotent(req, res, req.vaultSession, workspace.workspace_id, idempotencyKey);
  if (replay.replayed) return;

  const supabase = vaultDb();
  const { data: rows, error: rowError } = await supabase
    .from('vault_exceptions')
    .select('*')
    .eq('workspace_id', workspace.workspace_id)
    .eq('exception_id', id)
    .limit(1);
  if (rowError) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault exception read failed');
  }
  const row = Array.isArray(rows) && rows[0];
  if (!row) {
    return sendError(res, 404, ERROR_CODES.not_found, 'not found');
  }

  if (row.state !== 'proposed') {
    return sendError(res, 409, ERROR_CODES.exception_state_conflict, 'cannot edit a non-proposed exception', {
      current_state: row.state,
    });
  }
  if (row.proposed_by !== req.vaultSession.user_id) {
    return sendError(res, 403, ERROR_CODES.forbidden_role, 'only the proposer may PATCH a proposal');
  }
  const patch = {};
  if (typeof body.reason_public === 'string') {
    const v = body.reason_public.trim();
    if (v.length < 1 || v.length > 280) {
      return sendError(res, 400, ERROR_CODES.bad_request, 'reason_public must be 1-280 chars');
    }
    patch.reason_public = v;
  }
  if (typeof body.reason_private === 'string') {
    if (body.reason_private.length > 10000) {
      return sendError(res, 400, ERROR_CODES.bad_request, 'reason_private must be <= 10000 chars');
    }
    patch.reason_private = body.reason_private;
  }
  if (Array.isArray(body.proof_anchors)) {
    if (body.proof_anchors.length === 0) {
      return sendError(res, 400, ERROR_CODES.bad_request, 'proof_anchors cannot be emptied');
    }
    patch.proof_anchors = body.proof_anchors;
  }
  if (Object.keys(patch).length === 0) {
    return sendError(res, 400, ERROR_CODES.bad_request, 'no fields to patch');
  }
  const { data, error } = await supabase
    .from('vault_exceptions')
    .update(patch)
    .eq('exception_id', row.exception_id)
    .eq('state', 'proposed')
    .select('*')
    .limit(1);
  if (error) {
    if (error.code === '23514') {
      return sendError(res, 422, ERROR_CODES.bad_request, `constraint violation: ${error.message}`);
    }
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault proposal patch failed');
  }
  const updated = Array.isArray(data) && data[0];
  if (!updated) {
    return sendError(res, 409, ERROR_CODES.exception_state_conflict, 'exception state changed under concurrent request');
  }
  const shape = shapeExceptionRow(updated, membership.role);
  setEtagHeader(res, updated);
  setMaskedHeader(res, membership.role);
  await storeIdempotencyResponse({
    workspaceId: workspace.workspace_id,
    userId: req.vaultSession.user_id,
    idempotencyKey,
    requestRoute: `PATCH ${req.path}`,
    responseStatus: 200,
    responseSnapshot: shape,
  });
  res.status(200).json(shape);
}

// ---------- DELETE forbidden ----------

export function handleDeleteForbidden(_req, res) {
  res.setHeader('Allow', 'GET, POST, PATCH');
  return sendError(res, 405, ERROR_CODES.bad_request, 'DELETE on exception rows is forbidden; use POST .../revoke instead');
}
