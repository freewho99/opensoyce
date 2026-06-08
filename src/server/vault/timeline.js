// OpenSoyce Trust Vault — Vault Timeline read handlers.
//
// PR-V2-C. Per PR-V1-D §3 (Vault Timeline event read API), §3.4 (cursor
// discipline), §5 (visibility = 'private' API invariant), §6.1 (no masking
// needed on Timeline — events carry summary, not reason_private).
//
// Two v0 endpoints:
//   GET /api/vault/workspaces/:slug/timeline
//   GET /api/vault/workspaces/:slug/timeline/:event_id
//
// No POST / PATCH / DELETE. Timeline events are append-only from the
// PR-V2-B trigger functions; the client cannot write them.
//
// Cursor format (opaque to the client):
//   base64url(JSON.stringify({ emitted_at: <iso>, event_id: <uuid>, v: 1 }))
// The 'v' field gates schema rotation. If the cursor was minted under an
// older format, the API returns 400 cursor-stale instead of silently
// misordering pages.
//
// Pagination is keyset over (emitted_at DESC, event_id DESC). For each
// page after the first the API filters
//   emitted_at < cursor.emitted_at
//   OR (emitted_at = cursor.emitted_at AND event_id < cursor.event_id)
// to deliver stable next-page semantics even when many events share an
// emitted_at within a single trigger transaction.

import { vaultDb } from './db.js';
import { sendError, ERROR_CODES } from './errors.js';
import { resolveWorkspaceForMember } from './rbac.js';

const MAX_TIMELINE_LIMIT = 200;
const DEFAULT_TIMELINE_LIMIT = 50;
const CURSOR_VERSION = 1;

const ALLOWED_EVENT_TYPES = new Set([
  'exception_proposed',
  'exception_approved',
  'exception_rejected',
  'exception_revoked',
  'exception_expired',
  'exception_extended',
  'private_evidence_captured',
  'private_evidence_redacted',
  'workspace_created',
  'workspace_renamed',
  'workspace_soft_deleted',
  'workspace_owner_transferred',
  'member_added',
  'member_promoted',
  'member_demoted',
  'member_suspended',
  'member_removed',
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:?\d{2})$/;

function shapeUser(row) {
  if (!row) return null;
  return {
    user_id: row.user_id,
    github_login: row.github_login,
    display_name: row.display_name || null,
  };
}

function shapeTimelineRow(row) {
  if (!row) return null;
  return {
    event_id: row.event_id,
    workspace_id: row.workspace_id,
    event_type: row.event_type,
    subject_evidence_id: row.subject_evidence_id || null,
    subject_exception_id: row.subject_exception_id || null,
    subject_membership_id: row.subject_membership_id || null,
    summary: row.summary,
    references: row.references_json,
    visibility: 'private',
    emitted_at: row.emitted_at,
    emitted_by: shapeUser(row.emitted_by_user),
  };
}

// Per PR-V1-D §3.3 the user reference is an expanded object, not a UUID:
//   { user_id, github_login, display_name } | null
// Inline foreign-key joins in the supabase select keep the wire contract
// stable. emitted_by is nullable (reaper-emitted events have no actor) —
// the join row is null in that case and shapeUser returns null.
const TIMELINE_SELECT = '*, emitted_by_user:emitted_by(user_id, github_login, display_name)';

function encodeCursor(emittedAt, eventId) {
  const json = JSON.stringify({ v: CURSOR_VERSION, emitted_at: emittedAt, event_id: eventId });
  return Buffer.from(json, 'utf8').toString('base64url');
}

// Returns { cursor: {emitted_at, event_id} } on success, { error: 'invalid'|'stale' } otherwise.
function decodeCursor(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return { cursor: null };
  let decoded;
  try {
    decoded = Buffer.from(raw, 'base64url').toString('utf8');
  } catch {
    return { error: 'invalid' };
  }
  let obj;
  try {
    obj = JSON.parse(decoded);
  } catch {
    return { error: 'invalid' };
  }
  if (!obj || typeof obj !== 'object') return { error: 'invalid' };
  if (obj.v !== CURSOR_VERSION) return { error: 'stale' };
  if (typeof obj.emitted_at !== 'string' || !ISO_RE.test(obj.emitted_at)) return { error: 'invalid' };
  if (typeof obj.event_id !== 'string' || !UUID_RE.test(obj.event_id)) return { error: 'invalid' };
  return { cursor: { emitted_at: obj.emitted_at, event_id: obj.event_id } };
}

function parseEventTypes(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return { types: null };
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return { types: null };
  for (const t of parts) {
    if (!ALLOWED_EVENT_TYPES.has(t)) {
      return { error: `unknown event_type: ${t}` };
    }
  }
  return { types: parts };
}

function parseIsoFilter(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return { value: null };
  if (!ISO_RE.test(raw)) return { error: `not an ISO 8601 timestamp: ${raw}` };
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return { error: `unparseable timestamp: ${raw}` };
  return { value: raw };
}

function parseUuidFilter(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return { value: null };
  if (!UUID_RE.test(raw)) return { error: `not a UUID: ${raw}` };
  return { value: raw };
}

// ---------- GET (list) ----------

export async function handleListTimelineEvents(req, res) {
  const slug = (req.params && req.params.slug) || '';
  const resolved = await resolveWorkspaceForMember(req, res, slug);
  if (!resolved) return;
  const { workspace } = resolved;

  const q = req.query || {};
  const eventTypes = parseEventTypes(q.event_type);
  if (eventTypes.error) {
    return sendError(res, 400, ERROR_CODES.invalid_filter, eventTypes.error);
  }
  const subjectExceptionId = parseUuidFilter(q.subject_exception_id);
  if (subjectExceptionId.error) {
    return sendError(res, 400, ERROR_CODES.invalid_filter, subjectExceptionId.error);
  }
  const subjectEvidenceId = parseUuidFilter(q.subject_evidence_id);
  if (subjectEvidenceId.error) {
    return sendError(res, 400, ERROR_CODES.invalid_filter, subjectEvidenceId.error);
  }
  const sinceIso = parseIsoFilter(q.since);
  if (sinceIso.error) {
    return sendError(res, 400, ERROR_CODES.invalid_filter, sinceIso.error);
  }
  const untilIso = parseIsoFilter(q.until);
  if (untilIso.error) {
    return sendError(res, 400, ERROR_CODES.invalid_filter, untilIso.error);
  }
  if (sinceIso.value && untilIso.value
      && Date.parse(sinceIso.value) >= Date.parse(untilIso.value)) {
    return sendError(
      res,
      400,
      ERROR_CODES.invalid_filter,
      'since must be strictly less than until (since,until) is a half-open range',
    );
  }

  const limit = Math.min(
    Math.max(parseInt(q.limit, 10) || DEFAULT_TIMELINE_LIMIT, 1),
    MAX_TIMELINE_LIMIT,
  );

  const decoded = decodeCursor(q.cursor);
  if (decoded.error === 'invalid') {
    return sendError(res, 400, ERROR_CODES.cursor_invalid, 'cursor is not parseable');
  }
  if (decoded.error === 'stale') {
    return sendError(res, 400, ERROR_CODES.cursor_stale, 'cursor format has rotated; restart pagination');
  }
  const cursor = decoded.cursor;

  const supabase = vaultDb();
  let query = supabase
    .from('vault_timeline_events')
    .select(TIMELINE_SELECT, { count: 'exact' })
    .eq('workspace_id', workspace.workspace_id);

  if (eventTypes.types) query = query.in('event_type', eventTypes.types);
  if (subjectExceptionId.value) query = query.eq('subject_exception_id', subjectExceptionId.value);
  if (subjectEvidenceId.value) query = query.eq('subject_evidence_id', subjectEvidenceId.value);
  if (sinceIso.value) query = query.gte('emitted_at', sinceIso.value);
  if (untilIso.value) query = query.lt('emitted_at', untilIso.value);

  if (cursor) {
    // Keyset: (emitted_at, event_id) DESC. Page after the cursor means
    // rows strictly less than the cursor's tuple. PostgREST's .or() with
    // composite key:
    //   emitted_at.lt.<at>,and(emitted_at.eq.<at>,event_id.lt.<id>)
    //
    // SAFETY INVARIANT: at + id are interpolated directly into the
    // PostgREST filter string. Both values came from decodeCursor() which
    // ran them through ISO_RE / UUID_RE before returning. Those regexes
    // forbid the characters PostgREST's mini-language treats as
    // significant (commas, parentheses, percent signs). If either regex
    // is ever relaxed, this interpolation MUST be reviewed for injection
    // risk before the cursor format changes.
    const at = cursor.emitted_at;
    const id = cursor.event_id;
    query = query.or(
      `emitted_at.lt.${at},and(emitted_at.eq.${at},event_id.lt.${id})`,
    );
  }

  query = query
    .order('emitted_at', { ascending: false })
    .order('event_id', { ascending: false })
    .limit(limit + 1);

  const { data, error, count } = await query;
  if (error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault timeline list failed');
  }

  const rows = Array.isArray(data) ? data : [];
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const shaped = pageRows.map(shapeTimelineRow);

  let nextCursor = null;
  if (hasMore && pageRows.length > 0) {
    const last = pageRows[pageRows.length - 1];
    nextCursor = encodeCursor(last.emitted_at, last.event_id);
  }

  res.status(200).json({
    events: shaped,
    next_cursor: nextCursor,
    total_count_estimate: typeof count === 'number' ? count : shaped.length,
  });
}

// ---------- GET (single) ----------

export async function handleGetTimelineEvent(req, res) {
  const slug = (req.params && req.params.slug) || '';
  const id = (req.params && req.params.id) || '';
  const resolved = await resolveWorkspaceForMember(req, res, slug);
  if (!resolved) return;
  const { workspace } = resolved;

  const supabase = vaultDb();
  const { data, error } = await supabase
    .from('vault_timeline_events')
    .select(TIMELINE_SELECT)
    .eq('workspace_id', workspace.workspace_id)
    .eq('event_id', id)
    .limit(1);
  if (error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault timeline read failed');
  }
  const row = Array.isArray(data) && data[0];
  if (!row) {
    return sendError(res, 404, ERROR_CODES.not_found, 'not found');
  }
  res.status(200).json(shapeTimelineRow(row));
}
