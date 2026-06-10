// OpenSoyce Component Exposure Intelligence (PR-15A) — vulnerability-
// intelligence observations.
//
// DOCTRINE: vulnerability intelligence is observation. Observation is not
// judgment. A scanner finding is not a trust decision. A vulnerability
// match opens a review question; it does not decide the answer. The
// reviewer still decides. CEI records the relationship.
//
// Structurally enforced: this module NEVER mutates component_exposures,
// never touches vault_exceptions, never records CEI proposal/outcome
// events, never transitions any status, and never maps severity to a
// decision. It writes exactly one thing — context rows in
// component_exposure_vulnerabilities — and reads them back.
//
// Matching is SOURCE-ASSERTED and deterministic: one OSV /v1/query per
// refresh with { package: { name, ecosystem }, version }. OSV returns the
// advisories it asserts affect that exact version (match_basis
// 'osv-version-query'). No local range arithmetic, no heuristics; the same
// response always maps to the same rows. An empty response writes nothing
// — unmatched intelligence cannot fabricate private records.

import { vaultDb } from '../vault/db.js';
import { sendError, ERROR_CODES } from '../vault/errors.js';
import { resolveWorkspaceForMember, requireRole } from '../vault/rbac.js';

const OSV_QUERY_ENDPOINT = 'https://api.osv.dev/v1/query';
const OSV_TIMEOUT_MS = 4000;
// Bounded: a single package@version with more advisories than this is
// recorded up to the cap and the response says so — never unbounded writes.
export const MAX_VULNS_PER_REFRESH = 50;
const MAX_SUMMARY_LEN = 500;
const MAX_ALIASES = 10;

// ---------------------------------------------------------------------------
// Pure mapping (exported for deterministic tests — no I/O, no clock)
// ---------------------------------------------------------------------------

function severityFromOsv(vuln) {
  // As-provided-by-source, normalized to a small vocabulary. This value is
  // CONTEXT for a human; nothing in OpenSoyce branches on it.
  const ds = vuln.database_specific;
  const raw = ds && typeof ds.severity === 'string' ? ds.severity.toLowerCase() : '';
  if (raw === 'critical') return 'critical';
  if (raw === 'high') return 'high';
  if (raw === 'moderate' || raw === 'medium') return 'medium';
  if (raw === 'low') return 'low';
  if (Array.isArray(vuln.severity)) {
    for (const s of vuln.severity) {
      if (s && typeof s.score === 'string') {
        if (/C:H.*I:H.*A:H/.test(s.score)) return 'critical';
        if (/(C:H|I:H|A:H)/.test(s.score)) return 'high';
      }
    }
  }
  return null;
}

function affectedRangeFromOsv(vuln, packageName) {
  if (!Array.isArray(vuln.affected)) return null;
  for (const a of vuln.affected) {
    if (!a || !a.package || a.package.name !== packageName) continue;
    if (Array.isArray(a.ranges) && a.ranges.length > 0) {
      const events = Array.isArray(a.ranges[0].events) ? a.ranges[0].events : [];
      const introduced = events.find((e) => e && typeof e.introduced === 'string');
      const fixed = events.find((e) => e && typeof e.fixed === 'string');
      const parts = [];
      if (introduced) parts.push(`introduced ${introduced.introduced}`);
      if (fixed) parts.push(`fixed ${fixed.fixed}`);
      if (parts.length) return parts.join(', ').slice(0, 512);
    }
    if (Array.isArray(a.versions) && a.versions.length > 0) {
      return `listed versions (${a.versions.length})`.slice(0, 512);
    }
  }
  return null;
}

/**
 * Map an OSV /v1/query response to intelligence rows for ONE observed
 * dependency exposure. Pure and deterministic: same input, same output.
 * Bounded: at most MAX_VULNS_PER_REFRESH rows; metadata fields truncated.
 * Returns { rows, truncated }.
 */
export function mapOsvResponseToIntelRows(osvResponse, { workspaceId, exposureId, packageName, observedVersion, ecosystem }) {
  const vulns = osvResponse && Array.isArray(osvResponse.vulns) ? osvResponse.vulns : [];
  const truncated = vulns.length > MAX_VULNS_PER_REFRESH;
  const rows = [];
  const seen = new Set();
  for (const vuln of vulns.slice(0, MAX_VULNS_PER_REFRESH)) {
    if (!vuln || typeof vuln.id !== 'string' || !vuln.id) continue;
    if (seen.has(vuln.id)) continue;
    seen.add(vuln.id);
    rows.push({
      workspace_id: workspaceId,
      exposure_id: exposureId,
      vuln_id: vuln.id.slice(0, 120),
      source: 'osv',
      match_basis: 'osv-version-query',
      package_name: packageName,
      observed_version: observedVersion,
      ecosystem: ecosystem || null,
      severity: severityFromOsv(vuln),
      affected_range: affectedRangeFromOsv(vuln, packageName),
      source_ref: `https://osv.dev/vulnerability/${encodeURIComponent(vuln.id)}`.slice(0, 512),
      metadata: {
        summary: typeof vuln.summary === 'string' ? vuln.summary.slice(0, MAX_SUMMARY_LEN) : null,
        aliases: Array.isArray(vuln.aliases) ? vuln.aliases.slice(0, MAX_ALIASES) : [],
      },
    });
  }
  return { rows, truncated };
}

// ---------------------------------------------------------------------------
// OSV query (I/O seam — overridable for tests)
// ---------------------------------------------------------------------------

let __osvQueryOverride = null;
export function __setOsvQueryForTests(fn) { __osvQueryOverride = fn; }

async function queryOsv(packageName, version) {
  if (__osvQueryOverride) return __osvQueryOverride(packageName, version);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OSV_TIMEOUT_MS);
  try {
    const res = await fetch(OSV_QUERY_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ package: { name: packageName, ecosystem: 'npm' }, version }),
      signal: controller.signal,
    });
    if (!res.ok) return { error: `osv ${res.status}` };
    return await res.json();
  } catch (err) {
    return { error: (err && err.message) || 'osv unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Shaping
// ---------------------------------------------------------------------------

function shapeIntelRow(row) {
  if (!row) return null;
  return {
    vuln_intel_id: row.vuln_intel_id,
    exposure_id: row.exposure_id,
    vuln_id: row.vuln_id,
    source: row.source,
    match_basis: row.match_basis,
    package_name: row.package_name,
    observed_version: row.observed_version,
    ecosystem: row.ecosystem || null,
    severity: row.severity || null,
    affected_range: row.affected_range || null,
    source_ref: row.source_ref || null,
    metadata: row.metadata || {},
    first_seen_at: row.first_seen_at,
    last_seen_at: row.last_seen_at,
    seen_count: typeof row.seen_count === 'number' ? row.seen_count : 1,
    // Intelligence is private context — there is no public surface for it.
    visibility: 'private',
  };
}

// Touch the existing row for a re-observed intelligence fact. The 7C
// lesson: seen_count/last_seen_at move; the source's CURRENT severity,
// affected_range, and metadata refresh (intelligence freshness is part of
// the context); first_seen_at, created_at, and source_ref stay as the
// first sighting recorded them. Provenance is not erased.
async function touchIntelRow(supabase, existing, fresh) {
  const { data, error } = await supabase
    .from('component_exposure_vulnerabilities')
    .update({
      seen_count: (typeof existing.seen_count === 'number' ? existing.seen_count : 1) + 1,
      last_seen_at: new Date().toISOString(),
      severity: fresh.severity,
      affected_range: fresh.affected_range,
      metadata: fresh.metadata,
    })
    .eq('vuln_intel_id', existing.vuln_intel_id)
    .select('*')
    .limit(1);
  if (error) return { error };
  return { row: (Array.isArray(data) && data[0]) || null };
}

async function loadExposureForIntel(supabase, workspaceId, exposureId) {
  const { data, error } = await supabase
    .from('component_exposures')
    .select('exposure_id, subject_kind, subject_name, metadata, trust_boundary, exposure_type:exposure_type_id(type_slug)')
    .eq('workspace_id', workspaceId)
    .eq('exposure_id', exposureId)
    .limit(1);
  if (error) return { error };
  return { row: (Array.isArray(data) && data[0]) || null };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/vault/workspaces/:slug/exposures/:id/vuln-intel
 *
 * Read-only: the intelligence context attached to one dependency exposure.
 */
export async function handleListVulnIntel(req, res) {
  const slug = (req.params && req.params.slug) || '';
  const exposureId = (req.params && req.params.id) || '';
  const resolved = await resolveWorkspaceForMember(req, res, slug);
  if (!resolved) return;
  const { workspace } = resolved;

  const supabase = vaultDb();
  const exposure = await loadExposureForIntel(supabase, workspace.workspace_id, exposureId);
  if (exposure.error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'CEI exposure lookup failed');
  }
  if (!exposure.row) {
    return sendError(res, 404, ERROR_CODES.not_found, 'not found');
  }

  const { data, error } = await supabase
    .from('component_exposure_vulnerabilities')
    .select('*')
    .eq('workspace_id', workspace.workspace_id)
    .eq('exposure_id', exposureId)
    .order('last_seen_at', { ascending: false })
    .limit(200);
  if (error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'CEI intelligence list failed');
  }
  res.status(200).json({
    intel: (Array.isArray(data) ? data : []).map(shapeIntelRow),
    visibility: 'private',
  });
}

/**
 * POST /api/vault/workspaces/:slug/exposures/:id/vuln-intel/refresh
 *
 * Member-level observation action: ask the source (OSV) what it currently
 * asserts about this exposure's package@version, and record/touch the
 * context rows. The exposure itself is NEVER mutated. No exception, no
 * proposal, no outcome, no status transition — context only.
 */
export async function handleRefreshVulnIntel(req, res) {
  const slug = (req.params && req.params.slug) || '';
  const exposureId = (req.params && req.params.id) || '';
  const resolved = await resolveWorkspaceForMember(req, res, slug);
  if (!resolved) return;
  const { workspace, membership } = resolved;
  if (!requireRole(res, membership, 'member')) return;

  const supabase = vaultDb();
  const exposure = await loadExposureForIntel(supabase, workspace.workspace_id, exposureId);
  if (exposure.error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'CEI exposure lookup failed');
  }
  if (!exposure.row) {
    return sendError(res, 404, ERROR_CODES.not_found, 'not found');
  }

  // Intelligence association is defined for observed DEPENDENCY facts with
  // a version. Other native types and version-less rows have nothing for
  // the source to assert against — refuse honestly instead of guessing.
  const typeSlug = exposure.row.exposure_type ? exposure.row.exposure_type.type_slug : null;
  const version = exposure.row.metadata && typeof exposure.row.metadata.version === 'string'
    ? exposure.row.metadata.version
    : '';
  if (typeSlug !== 'dependency-exposure' || exposure.row.subject_kind !== 'package' || !version) {
    return sendError(res, 400, ERROR_CODES.bad_request,
      'vulnerability intelligence applies to dependency-exposure records with an observed version');
  }
  const packageName = exposure.row.subject_name;
  const boundary = exposure.row.trust_boundary || {};
  const ecosystem = typeof boundary.package_manager === 'string' ? boundary.package_manager : null;

  const osvResponse = await queryOsv(packageName, version);
  if (osvResponse && osvResponse.error) {
    return sendError(res, 502, ERROR_CODES.vault_db_unavailable, `intelligence source unavailable: ${osvResponse.error}`);
  }

  const { rows, truncated } = mapOsvResponseToIntelRows(osvResponse, {
    workspaceId: workspace.workspace_id,
    exposureId,
    packageName,
    observedVersion: version,
    ecosystem,
  });

  // Empty source response writes NOTHING — unmatched intelligence cannot
  // fabricate private records. This is also the honest "no known
  // intelligence" answer, distinct from "never checked".
  const results = [];
  let created = 0;
  let seenAgain = 0;
  for (const row of rows) {
    const { data: existing, error: lookupError } = await supabase
      .from('component_exposure_vulnerabilities')
      .select('vuln_intel_id, seen_count')
      .eq('workspace_id', row.workspace_id)
      .eq('exposure_id', row.exposure_id)
      .eq('vuln_id', row.vuln_id)
      .eq('source', row.source)
      .limit(1);
    if (lookupError) {
      return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'CEI intelligence lookup failed');
    }
    const found = Array.isArray(existing) && existing[0];
    if (found) {
      const touched = await touchIntelRow(supabase, found, row);
      if (touched.error) {
        return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'CEI intelligence touch failed');
      }
      if (touched.row) { results.push(touched.row); seenAgain += 1; }
      continue;
    }
    const { data: inserted, error: insertError } = await supabase
      .from('component_exposure_vulnerabilities')
      .insert(row)
      .select('*')
      .limit(1);
    if (insertError) {
      // Unique-index race: the loser touches instead — the sighting is
      // recorded, not dropped (the 7C race pattern).
      if (insertError.code === '23505') {
        const { data: raced } = await supabase
          .from('component_exposure_vulnerabilities')
          .select('vuln_intel_id, seen_count')
          .eq('workspace_id', row.workspace_id)
          .eq('exposure_id', row.exposure_id)
          .eq('vuln_id', row.vuln_id)
          .eq('source', row.source)
          .limit(1);
        const racedRow = Array.isArray(raced) && raced[0];
        if (racedRow) {
          const touched = await touchIntelRow(supabase, racedRow, row);
          if (touched.row) { results.push(touched.row); seenAgain += 1; }
          continue;
        }
      }
      return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'CEI intelligence insert failed');
    }
    const insertedRow = Array.isArray(inserted) && inserted[0];
    if (insertedRow) { results.push(insertedRow); created += 1; }
  }

  res.status(200).json({
    intel: results.map(shapeIntelRow),
    created,
    seen_again: seenAgain,
    total_reported_by_source: (osvResponse && Array.isArray(osvResponse.vulns)) ? osvResponse.vulns.length : 0,
    truncated,
    visibility: 'private',
  });
}
