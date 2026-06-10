// OpenSoyce Component Exposure Intelligence (Phase 6A) — exposure handlers.
//
// PR-6A. Per docs/strategy/component-exposure-intelligence-lock-in.md.
//
// Three minimal internal endpoints (Phase 6A scope item 5 — "only if
// needed for tests"):
//   GET  /api/vault/workspaces/:slug/exposures        — list (paginated)
//   GET  /api/vault/workspaces/:slug/exposures/:id     — get one
//   POST /api/vault/workspaces/:slug/exposures         — create native record
//
// Every endpoint funnels through resolveWorkspaceForMember: authenticated
// session required, active membership required, 404-on-non-member doctrine.
// No public reads. No account-id header trust boundary — the workspace is
// resolved from the route slug + the session, never from a client header.
//
// DOCTRINE: an exposure records that a component EXISTS or CHANGED. These
// handlers never file an exception, never write evidence, never change
// policy. Creating an exposure is a member-level observation, not a trust
// decision.

import { vaultDb } from '../vault/db.js';
import { sendError, ERROR_CODES } from '../vault/errors.js';
import { resolveWorkspaceForMember, requireRole } from '../vault/rbac.js';
import {
  findNativeExposureType,
  validateSubject,
  validateMetadata,
  validateTrustBoundary,
  validateSource,
  validateStatus,
} from './domain.js';

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

function shapeExposureRow(row) {
  if (!row) return null;
  return {
    exposure_id: row.exposure_id,
    workspace_id: row.workspace_id,
    exposure_type: row.exposure_type ? row.exposure_type.type_slug : null,
    subject_kind: row.subject_kind,
    subject_name: row.subject_name,
    trust_boundary: row.trust_boundary || {},
    metadata: row.metadata || {},
    source_kind: row.source_kind,
    source_ref: row.source_ref || null,
    status: row.status,
    first_seen_at: row.first_seen_at,
    last_seen_at: row.last_seen_at,
    created_at: row.created_at,
    // CEI rows are inherently private — there is no public CEI surface.
    visibility: 'private',
  };
}

// Inline join so the response carries the human-readable type slug without
// the caller needing a second round-trip to the type catalog.
const EXPOSURE_SELECT =
  '*, exposure_type:exposure_type_id(type_slug, display_name, is_native, is_active)';

function parsePositiveInt(value, fallback, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return fallback;
  if (max !== undefined && n > max) return max;
  return n;
}

/**
 * GET /api/vault/workspaces/:slug/exposures
 *
 * Query: limit (default 50, max 200), offset (default 0), status (optional
 * filter), type (optional native slug filter).
 */
export async function handleListExposures(req, res) {
  const slug = (req.params && req.params.slug) || '';
  const resolved = await resolveWorkspaceForMember(req, res, slug);
  if (!resolved) return;
  const { workspace } = resolved;

  const limit = parsePositiveInt(req.query && req.query.limit, DEFAULT_LIMIT, MAX_LIMIT);
  const offset = parsePositiveInt(req.query && req.query.offset, 0);
  const statusFilter = req.query && typeof req.query.status === 'string' ? req.query.status : undefined;
  if (statusFilter !== undefined) {
    const statusError = validateStatus(statusFilter);
    if (statusError) {
      return sendError(res, 400, ERROR_CODES.exposure_status_invalid, statusError);
    }
  }

  const supabase = vaultDb();
  let query = supabase
    .from('component_exposures')
    .select(EXPOSURE_SELECT, { count: 'estimated' })
    .eq('workspace_id', workspace.workspace_id)
    .order('last_seen_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (statusFilter !== undefined) query = query.eq('status', statusFilter);

  const { data, error, count } = await query;
  if (error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'CEI exposure list failed');
  }
  const rows = Array.isArray(data) ? data : [];
  res.status(200).json({
    exposures: rows.map(shapeExposureRow),
    total_count_estimate: typeof count === 'number' ? count : rows.length,
    limit,
    offset,
    visibility: 'private',
  });
}

/**
 * GET /api/vault/workspaces/:slug/exposures/:id
 */
export async function handleGetExposure(req, res) {
  const slug = (req.params && req.params.slug) || '';
  const id = (req.params && req.params.id) || '';
  const resolved = await resolveWorkspaceForMember(req, res, slug);
  if (!resolved) return;
  const { workspace } = resolved;

  const supabase = vaultDb();
  const { data, error } = await supabase
    .from('component_exposures')
    .select(EXPOSURE_SELECT)
    .eq('workspace_id', workspace.workspace_id)
    .eq('exposure_id', id)
    .limit(1);
  if (error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'CEI exposure read failed');
  }
  const row = Array.isArray(data) && data[0];
  if (!row) {
    return sendError(res, 404, ERROR_CODES.not_found, 'not found');
  }
  res.status(200).json(shapeExposureRow(row));
}

/**
 * POST /api/vault/workspaces/:slug/exposures
 *
 * Body: {
 *   exposure_type: <native slug>,
 *   subject_kind, subject_name,
 *   trust_boundary?: object, metadata?: object,
 *   source_kind, source_ref?,
 *   status?
 * }
 *
 * Member-level action (recording an observation). Fronted by requireCsrf
 * at the route layer. Validates against the native catalog only — there is
 * no custom-type or dynamic-schema path.
 */
export async function handleCreateExposure(req, res) {
  const slug = (req.params && req.params.slug) || '';
  const resolved = await resolveWorkspaceForMember(req, res, slug);
  if (!resolved) return;
  const { workspace, membership } = resolved;
  if (!requireRole(res, membership, 'member')) return;

  const body = req.body || {};
  const typeSlug = typeof body.exposure_type === 'string' ? body.exposure_type : '';

  const typeLookup = await findNativeExposureType(typeSlug);
  if (typeLookup.error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'CEI exposure-type lookup failed');
  }
  if (typeLookup.notFound) {
    return sendError(res, 400, ERROR_CODES.exposure_type_not_found, 'unknown or non-native exposure type');
  }

  const subjectError = validateSubject(typeSlug, body.subject_kind, body.subject_name);
  if (subjectError) {
    return sendError(res, 400, ERROR_CODES.exposure_subject_invalid, subjectError);
  }
  const metadataError = validateMetadata(body.metadata);
  if (metadataError) {
    return sendError(res, 400, ERROR_CODES.exposure_metadata_invalid, metadataError);
  }
  const boundaryError = validateTrustBoundary(body.trust_boundary);
  if (boundaryError) {
    return sendError(res, 400, ERROR_CODES.exposure_metadata_invalid, boundaryError);
  }
  const sourceError = validateSource(body.source_kind, body.source_ref);
  if (sourceError) {
    return sendError(res, 400, ERROR_CODES.exposure_source_invalid, sourceError);
  }
  const statusError = validateStatus(body.status);
  if (statusError) {
    return sendError(res, 400, ERROR_CODES.exposure_status_invalid, statusError);
  }

  const supabase = vaultDb();
  const { data, error } = await supabase
    .from('component_exposures')
    .insert({
      workspace_id: workspace.workspace_id,
      exposure_type_id: typeLookup.type.exposure_type_id,
      subject_kind: body.subject_kind,
      subject_name: body.subject_name,
      trust_boundary: body.trust_boundary || {},
      metadata: body.metadata || {},
      source_kind: body.source_kind,
      source_ref: typeof body.source_ref === 'string' ? body.source_ref : null,
      status: typeof body.status === 'string' ? body.status : 'observed',
      created_by: req.vaultSession.user_id,
    })
    .select(EXPOSURE_SELECT)
    .limit(1);
  if (error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'CEI exposure create failed');
  }
  const row = Array.isArray(data) && data[0];
  if (!row) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'CEI exposure create returned no row');
  }
  res.status(201).json(shapeExposureRow(row));
}
