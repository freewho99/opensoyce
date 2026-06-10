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
    // PR-7C repeat-observation metadata. source_ref above stays the FIRST
    // sighting's provenance; latest_source_ref carries the most recent one.
    seen_count: typeof row.seen_count === 'number' ? row.seen_count : 1,
    latest_source_ref: row.latest_source_ref || null,
    // CEI rows are inherently private — there is no public CEI surface.
    visibility: 'private',
  };
}

// ---------- PR-7C: server-side semantic dedupe (upsert-touch) ----------
//
// DOCTRINE: Observation is not judgment. Repetition is not new evidence.
// Provenance must not be erased.
//
// The identity is the dependency FACT, not the run: subject_name + version
// + package_manager + manifest_kind + dependency_class, scoped per
// workspace by the partial unique index in migration 0021. source_ref is
// DELIBERATELY absent — it is provenance, not identity; that is what lets
// a new CI run re-observing the same fact touch the same row.
//
// Returns null (no dedupe) for non-dependency types and for sparse bodies
// missing the dependency fields — those creates behave exactly as 6A.
function buildObservationIdentity(typeSlug, body) {
  if (typeSlug !== 'dependency-exposure') return null;
  const metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};
  const boundary = body.trust_boundary && typeof body.trust_boundary === 'object' ? body.trust_boundary : {};
  const version = typeof metadata.version === 'string' ? metadata.version : '';
  const packageManager = typeof boundary.package_manager === 'string' ? boundary.package_manager : '';
  const manifestKind = typeof boundary.manifest_kind === 'string' ? boundary.manifest_kind : '';
  if (!version || !packageManager || !manifestKind) return null;
  const dependencyClass = typeof metadata.dependency_class === 'string'
    ? metadata.dependency_class
    : (metadata.dev === true ? 'dev' : 'prod');
  return ['dep-v1', body.subject_name, version, packageManager, manifestKind, dependencyClass].join('|');
}

// Touch the existing row for this fact: one stable exposure fact + repeat-
// observation metadata + latest provenance. Touch updates ONLY seen_count,
// last_seen_at, and latest_source_ref — never status (no lifecycle), never
// the subject, never the first sighting's source_kind/source_ref/
// first_seen_at/created_at. The seen_count increment is read-then-write:
// concurrent touches in the same instant may undercount by design —
// seen_count is bounded repeat metadata, not an audit ledger (the CEI
// event table remains the audit surface).
async function touchExistingObservation(supabase, workspaceId, identity, sourceRef) {
  const { data: existing, error } = await supabase
    .from('component_exposures')
    .select('exposure_id, seen_count')
    .eq('workspace_id', workspaceId)
    .eq('observation_identity', identity)
    .limit(1);
  if (error) return { error };
  const found = Array.isArray(existing) && existing[0];
  if (!found) return { row: null };
  const { data: updated, error: updateError } = await supabase
    .from('component_exposures')
    .update({
      seen_count: (typeof found.seen_count === 'number' ? found.seen_count : 1) + 1,
      last_seen_at: new Date().toISOString(),
      latest_source_ref: typeof sourceRef === 'string' ? sourceRef : null,
    })
    .eq('exposure_id', found.exposure_id)
    .select(EXPOSURE_SELECT)
    .limit(1);
  if (updateError) return { error: updateError };
  return { row: (Array.isArray(updated) && updated[0]) || null };
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

  // PR-7C: semantic dedupe BEFORE insert. An equivalent dependency fact
  // already in the workspace is touched, not duplicated. The HTTP contract
  // stays 201 either way — the 7A/7B CLI pins 201 — and the body tells the
  // truth via seen_again + seen_count. The incoming status (if any) is
  // IGNORED on the touch path: repetition never transitions anything.
  const observationIdentity = buildObservationIdentity(typeSlug, body);
  if (observationIdentity) {
    const touched = await touchExistingObservation(
      supabase, workspace.workspace_id, observationIdentity, body.source_ref,
    );
    if (touched.error) {
      return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'CEI exposure dedupe lookup failed');
    }
    if (touched.row) {
      return res.status(201).json({ ...shapeExposureRow(touched.row), seen_again: true });
    }
  }

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
      observation_identity: observationIdentity,
      latest_source_ref: typeof body.source_ref === 'string' ? body.source_ref : null,
    })
    .select(EXPOSURE_SELECT)
    .limit(1);
  if (error) {
    // PR-7C race: two concurrent ingests of the same fact both miss the
    // lookup; one inserts, the other trips the 0021 partial unique index.
    // The loser falls back to the touch path — the repeat sighting is
    // still recorded, not dropped.
    if (error.code === '23505' && observationIdentity) {
      const raced = await touchExistingObservation(
        supabase, workspace.workspace_id, observationIdentity, body.source_ref,
      );
      if (raced.row) {
        return res.status(201).json({ ...shapeExposureRow(raced.row), seen_again: true });
      }
    }
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'CEI exposure create failed');
  }
  const row = Array.isArray(data) && data[0];
  if (!row) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'CEI exposure create returned no row');
  }
  res.status(201).json({ ...shapeExposureRow(row), seen_again: false });
}
