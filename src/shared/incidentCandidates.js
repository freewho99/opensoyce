/**
 * OpenSoyce — Incident Candidates pipeline.
 *
 * Feeds the OTS_INCIDENTS / OTS_INCIDENT_REPLAYS proof library by capturing
 * raw, auto-discovered supply-chain incident leads (e.g. Hacker News stories
 * matched by the HN scraper) and queuing them for human curation.
 *
 * This module is DELIBERATELY decoupled from the threat_feed pipeline:
 *   - threat_feed         -> gate enforcement (production-critical)
 *   - incident_candidates -> proof-library acquisition (review-queue)
 *
 * A scraper writing to threat_feed directly would let any bad parse become a
 * customer-facing block. Writing to incident_candidates instead means a
 * reviewer always sees the parser's guess alongside the raw source before
 * anything reaches the gate.
 *
 * Failure mode: every function fails CLOSED when Supabase env is missing
 * (returns null / empty list) -- the scraper still logs locally even if the
 * DB is unreachable, so we don't lose intel during outages.
 */

import { getSupabase } from '../../api/_supabase.js';

const VALID_SOURCES = new Set(['hn-heuristic', 'github-advisory', 'osv-delta', 'manual']);
const VALID_ECOSYSTEMS = new Set(['npm', 'PyPI']);
const VALID_THREAT_TYPES = new Set([
  'typosquat',
  'dependency_confusion',
  'obfuscated_payload',
  'malicious_script',
  'suspicious_network',
]);
const VALID_CONFIDENCES = new Set(['low', 'medium', 'high']);

/**
 * Upserts an incident candidate. Deduplicates on (source, source_id) so the
 * same HN story scanned across multiple runs collapses to a single row.
 *
 * @param {object} candidate
 * @param {string} candidate.source                 - 'hn-heuristic' | 'github-advisory' | 'osv-delta' | 'manual'
 * @param {string} candidate.source_id              - source-native unique id (e.g. HN item id as string)
 * @param {string} candidate.title                  - raw headline / advisory title
 * @param {string} [candidate.source_url]
 * @param {string} [candidate.author]
 * @param {string} [candidate.published_at]         - ISO timestamp
 * @param {string} [candidate.parsed_package]
 * @param {string} [candidate.parsed_version]
 * @param {'npm'|'PyPI'} [candidate.parsed_ecosystem]
 * @param {string} [candidate.parsed_threat_type]
 * @param {'low'|'medium'|'high'} [candidate.parser_confidence='low']
 * @returns {Promise<{ok: true} | {ok: false, reason: string}>}
 */
export async function reportIncidentCandidate(candidate) {
  const validation = validateCandidate(candidate);
  if (!validation.ok) return validation;

  let supabase;
  try {
    supabase = getSupabase();
  } catch (err) {
    // Fail-closed: caller's local log is the durable record when DB is down.
    return { ok: false, reason: `supabase-unavailable: ${err.message}` };
  }

  const row = {
    source: candidate.source,
    source_id: String(candidate.source_id),
    source_url: candidate.source_url ?? null,
    title: candidate.title,
    author: candidate.author ?? null,
    published_at: candidate.published_at ?? null,
    parsed_package: candidate.parsed_package ?? null,
    parsed_version: candidate.parsed_version ?? null,
    parsed_ecosystem: candidate.parsed_ecosystem ?? null,
    parsed_threat_type: candidate.parsed_threat_type ?? null,
    parser_confidence: candidate.parser_confidence ?? 'low',
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('incident_candidates')
    .upsert(row, { onConflict: 'source,source_id' });

  if (error) {
    return { ok: false, reason: `db-error: ${error.message}` };
  }
  return { ok: true };
}

/**
 * Lists pending candidates awaiting human review. Newest first.
 *
 * @param {object} [opts]
 * @param {number} [opts.limit=50]
 * @param {string} [opts.source]                    - filter to single source
 * @returns {Promise<Array<object>>}
 */
export async function listPendingCandidates(opts = {}) {
  const limit = opts.limit ?? 50;

  let supabase;
  try {
    supabase = getSupabase();
  } catch {
    return [];
  }

  let query = supabase
    .from('incident_candidates')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (opts.source) {
    query = query.eq('source', opts.source);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Failed to list incident candidates:', error.message);
    return [];
  }
  return data ?? [];
}

/**
 * Marks a candidate as promoted into the OTS_INCIDENTS catalog. The actual
 * insert into the incidents catalog is the caller's responsibility (admin
 * UI); this function only records the promotion link.
 *
 * @param {string} candidateId
 * @param {string} incidentId            - id assigned in OTS_INCIDENTS
 * @param {string} reviewedBy            - reviewer handle
 * @param {string} [notes]
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function promoteCandidate(candidateId, incidentId, reviewedBy, notes) {
  let supabase;
  try {
    supabase = getSupabase();
  } catch (err) {
    return { ok: false, reason: `supabase-unavailable: ${err.message}` };
  }

  const { error } = await supabase
    .from('incident_candidates')
    .update({
      status: 'promoted',
      promoted_to_incident_id: incidentId,
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
      review_notes: notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', candidateId);

  if (error) return { ok: false, reason: `db-error: ${error.message}` };
  return { ok: true };
}

/**
 * Marks a candidate as rejected (parse was wrong, not an incident, dup, etc.).
 *
 * @param {string} candidateId
 * @param {string} reviewedBy
 * @param {string} [notes]
 * @param {'rejected'|'duplicate'} [terminalStatus='rejected']
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function rejectCandidate(candidateId, reviewedBy, notes, terminalStatus = 'rejected') {
  if (terminalStatus !== 'rejected' && terminalStatus !== 'duplicate') {
    return { ok: false, reason: `invalid terminal status: ${terminalStatus}` };
  }

  let supabase;
  try {
    supabase = getSupabase();
  } catch (err) {
    return { ok: false, reason: `supabase-unavailable: ${err.message}` };
  }

  const { error } = await supabase
    .from('incident_candidates')
    .update({
      status: terminalStatus,
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
      review_notes: notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', candidateId);

  if (error) return { ok: false, reason: `db-error: ${error.message}` };
  return { ok: true };
}

/**
 * Shape check for reportIncidentCandidate input. Returns {ok:true} on pass,
 * {ok:false, reason} on fail. Exported for direct unit-testing.
 *
 * @param {object} c
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
export function validateCandidate(c) {
  if (!c || typeof c !== 'object') return { ok: false, reason: 'candidate must be an object' };
  if (!c.source || !VALID_SOURCES.has(c.source)) {
    return { ok: false, reason: `invalid source: ${c.source}` };
  }
  if (c.source_id === undefined || c.source_id === null || c.source_id === '') {
    return { ok: false, reason: 'source_id is required' };
  }
  if (!c.title || typeof c.title !== 'string') {
    return { ok: false, reason: 'title is required' };
  }
  if (c.parsed_ecosystem && !VALID_ECOSYSTEMS.has(c.parsed_ecosystem)) {
    return { ok: false, reason: `invalid parsed_ecosystem: ${c.parsed_ecosystem}` };
  }
  if (c.parsed_threat_type && !VALID_THREAT_TYPES.has(c.parsed_threat_type)) {
    return { ok: false, reason: `invalid parsed_threat_type: ${c.parsed_threat_type}` };
  }
  if (c.parser_confidence && !VALID_CONFIDENCES.has(c.parser_confidence)) {
    return { ok: false, reason: `invalid parser_confidence: ${c.parser_confidence}` };
  }
  return { ok: true };
}
