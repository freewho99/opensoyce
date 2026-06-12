// OpenSoyce Trust Vault (PR-EV-1) — evidence citation verification.
//
// DOCTRINE: evidence verification checks citations; it does not certify
// truth. A passing check means the cited reference was reachable and
// matched the expected shape AT CHECK TIME. A failed check means the
// citation could not be confirmed. An inconclusive check is allowed and
// honest. The human still records evidence. The system may check the
// reference. The export preserves both.
//
// Structurally enforced: this module writes exactly one table —
// append-only rows in evidence_verification_checks — and reads them
// back. It NEVER mutates component_remediation_evidence, resolutions,
// exceptions, exposures, intelligence, CEI events, or the timeline.
// Re-running a check appends; nothing is overwritten. The status
// vocabulary is check_passed / check_failed / check_inconclusive and
// nothing else.

import crypto from 'node:crypto';
import { vaultDb } from './db.js';
import { sendError, ERROR_CODES } from './errors.js';
import { resolveWorkspaceForMember, requireRole } from './rbac.js';
import { deliverWorkspaceWebhooks } from './webhooks.js';

export const VERIFICATION_CHECK_KINDS = Object.freeze([
  'internal_exposure_reference',
  'github_reference_reachable',
  'source_rescan_no_longer_matches',
]);

export const VERIFICATION_CHECK_STATUSES = Object.freeze([
  'check_passed',
  'check_failed',
  'check_inconclusive',
]);

// The non-claim that travels with every check result, in API responses
// and exports alike.
export const VERIFICATION_NON_CLAIM =
  'A passing citation check does not certify remediation or prove absence of vulnerabilities.';

const EXTERNAL_TIMEOUT_MS = 5000;
const MAX_DETAIL_CHARS = 4000;

// ---------------------------------------------------------------------------
// Pure parsers (exported for deterministic tests — no I/O)
// ---------------------------------------------------------------------------

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Extract the first UUID cited inside an evidence reference, or null. */
export function parseUuidFromRef(ref) {
  const m = typeof ref === 'string' ? ref.match(UUID_RE) : null;
  return m ? m[0].toLowerCase() : null;
}

/**
 * Extract a GitHub PR or commit citation from an evidence reference.
 * Accepts github.com URLs (/pull/N, /commit/SHA) and shorthand
 * owner/repo#N or owner/repo@SHA. Returns
 * { owner, repo, kind: 'pull'|'commit', id } or null.
 */
export function parseGithubRef(ref) {
  if (typeof ref !== 'string') return null;
  const url = ref.match(/github\.com\/([\w.-]+)\/([\w.-]+)\/(pull|commit)s?\/([\w]+)/i);
  if (url) {
    return { owner: url[1], repo: url[2], kind: url[3].toLowerCase() === 'pull' ? 'pull' : 'commit', id: url[4] };
  }
  const prShort = ref.match(/\b([A-Za-z0-9-]+)\/([\w.-]+)#(\d+)\b/);
  if (prShort) return { owner: prShort[1], repo: prShort[2], kind: 'pull', id: prShort[3] };
  const commitShort = ref.match(/\b([A-Za-z0-9-]+)\/([\w.-]+)@([0-9a-f]{7,40})\b/i);
  if (commitShort) return { owner: commitShort[1], repo: commitShort[2], kind: 'commit', id: commitShort[3] };
  return null;
}

/**
 * Best-effort "is the cited version different (and where comparable,
 * later) than the original?" Pure; never pretends precision it lacks.
 * Returns { different, comparable, later } — when the versions are not
 * cleanly numeric-dotted, comparable is false and only `different` is
 * asserted.
 */
export function compareObservedVersions(originalVersion, citedVersion) {
  const different = originalVersion !== citedVersion;
  const parse = (v) => (typeof v === 'string' && /^\d+(\.\d+)*$/.test(v) ? v.split('.').map(Number) : null);
  const a = parse(originalVersion);
  const b = parse(citedVersion);
  if (!a || !b) return { different, comparable: false, later: null };
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (y > x) return { different, comparable: true, later: true };
    if (y < x) return { different, comparable: true, later: false };
  }
  return { different: false, comparable: true, later: false };
}

function boundDetail(detail) {
  const json = JSON.stringify(detail || {});
  if (json.length <= MAX_DETAIL_CHARS) return detail || {};
  return { truncated: true, note: `detail exceeded ${MAX_DETAIL_CHARS} characters and was dropped — the summary stands` };
}

// ---------------------------------------------------------------------------
// The three narrow checks. Each returns
//   { status, summary, reason?, detail? }
// and asserts ONLY what it observed, in source vocabulary, at check time.
// ---------------------------------------------------------------------------

async function runInternalExposureReference(supabase, workspace, evidence) {
  const citedId = parseUuidFromRef(evidence.evidence_ref);
  if (!citedId) {
    return {
      status: 'check_inconclusive',
      summary: 'The evidence reference cites no internal exposure id — nothing for this check kind to confirm.',
      reason: 'no UUID found in evidence_ref',
    };
  }
  const { data, error } = await supabase
    .from('component_exposures')
    .select('exposure_id, subject_kind, subject_name, metadata, first_seen_at, source_kind')
    .eq('workspace_id', workspace.workspace_id)
    .eq('exposure_id', citedId)
    .limit(1);
  if (error) {
    return { status: 'check_inconclusive', summary: 'The exposure lookup did not complete; the citation is unconfirmed.', reason: 'exposure lookup failed' };
  }
  const cited = Array.isArray(data) && data[0];
  if (!cited) {
    return {
      status: 'check_failed',
      summary: `citation_not_found: the cited exposure ${citedId} does not exist in this workspace's record.`,
      reason: 'citation_not_found',
      detail: { cited_exposure_id: citedId },
    };
  }

  // The citation is reachable and internally linked.
  const detail = {
    result: 'internal_record_linked',
    cited_exposure_id: cited.exposure_id,
    cited_subject: `${cited.subject_kind} ${cited.subject_name}`,
    cited_version: (cited.metadata && cited.metadata.version) || null,
    cited_first_seen_at: cited.first_seen_at,
  };

  // For fixed_version_observed: the cited observation must be the SAME
  // component, at a DIFFERENT (and where comparable, later) version than
  // the original vulnerable observation. Shape, not safety.
  if (evidence.evidence_type === 'fixed_version_observed' && evidence.source_exposure_id) {
    const { data: origRows, error: origError } = await supabase
      .from('component_exposures')
      .select('exposure_id, subject_name, metadata')
      .eq('workspace_id', workspace.workspace_id)
      .eq('exposure_id', evidence.source_exposure_id)
      .limit(1);
    if (origError || !(Array.isArray(origRows) && origRows[0])) {
      return {
        status: 'check_inconclusive',
        summary: 'citation_reachable and internal_record_linked, but the original observation could not be loaded for shape comparison.',
        reason: 'original exposure unavailable',
        detail,
      };
    }
    const orig = origRows[0];
    detail.original_exposure_id = orig.exposure_id;
    detail.original_version = (orig.metadata && orig.metadata.version) || null;
    if (orig.subject_name !== cited.subject_name) {
      return {
        status: 'check_failed',
        summary: `citation_shape_mismatch: the cited exposure observes ${cited.subject_name}, not ${orig.subject_name}.`,
        reason: 'citation_shape_mismatch',
        detail,
      };
    }
    const cmp = compareObservedVersions(detail.original_version, detail.cited_version);
    detail.version_comparison = cmp;
    if (!cmp.different) {
      return {
        status: 'check_failed',
        summary: `citation_shape_mismatch: the cited observation is the same version (${detail.cited_version}) as the original vulnerable observation — it does not evidence a fixed-version observation.`,
        reason: 'citation_shape_mismatch',
        detail,
      };
    }
    return {
      status: 'check_passed',
      summary: `internal_record_linked: the cited exposure exists in this workspace and observes ${cited.subject_name}@${detail.cited_version}, ${cmp.comparable ? (cmp.later ? 'later than' : 'NOT later than') : 'different from'} the original ${detail.original_version}. This does not claim the vulnerability is fixed.`,
      detail,
    };
  }

  return {
    status: 'check_passed',
    summary: `internal_record_linked: the cited exposure ${cited.exposure_id} exists in this workspace (${cited.subject_kind} ${cited.subject_name}). This confirms the citation, not the remediation.`,
    detail,
  };
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTERNAL_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'opensoyce-citation-check', accept: 'application/vnd.github+json' },
      signal: controller.signal,
      redirect: 'follow',
    });
    let json = null;
    try { json = await res.json(); } catch { /* non-json */ }
    return { status: res.status, json };
  } catch (err) {
    return { status: null, error: (err && err.message) || 'unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

async function runGithubReferenceReachable(evidence) {
  const ref = parseGithubRef(evidence.evidence_ref);
  if (!ref) {
    return {
      status: 'check_inconclusive',
      summary: 'The evidence reference cites no GitHub PR or commit — nothing for this check kind to confirm.',
      reason: 'no GitHub reference found in evidence_ref',
    };
  }
  // The URL is constructed from the parsed owner/repo/id — never from raw
  // user input — and targets api.github.com only.
  const apiPath = ref.kind === 'pull'
    ? `https://api.github.com/repos/${ref.owner}/${ref.repo}/pulls/${ref.id}`
    : `https://api.github.com/repos/${ref.owner}/${ref.repo}/commits/${ref.id}`;
  const res = await fetchWithTimeout(apiPath);
  const checkedAt = new Date().toISOString();
  const cite = `${ref.owner}/${ref.repo} ${ref.kind} ${ref.id}`;
  if (res.status === 200) {
    const detail = {
      result: 'citation_reachable',
      source: 'api.github.com',
      reference: cite,
      observed_at: checkedAt,
    };
    let mergedNote = '';
    if (ref.kind === 'pull' && res.json && typeof res.json.merged === 'boolean') {
      // Labeled exactly as observed — never 'remediation_verified'.
      detail.pr_merged_observed = res.json.merged;
      mergedNote = ` pr_merged_observed=${res.json.merged} at check time.`;
    }
    return {
      status: 'check_passed',
      summary: `citation_reachable: GitHub returned the cited ${cite} at ${checkedAt}.${mergedNote} Reachability is not remediation.`,
      detail,
    };
  }
  if (res.status === 404) {
    return {
      status: 'check_failed',
      summary: `citation_not_found: GitHub returned 404 for the cited ${cite} at ${checkedAt}.`,
      reason: 'citation_not_found',
      detail: { source: 'api.github.com', reference: cite, http_status: 404 },
    };
  }
  return {
    status: 'check_inconclusive',
    summary: `The cited ${cite} could not be confirmed at ${checkedAt} (${res.status ? `HTTP ${res.status}` : res.error}). Inconclusive is an honest answer.`,
    reason: res.status ? `github responded ${res.status} (possibly rate-limited)` : res.error,
    detail: { source: 'api.github.com', reference: cite, http_status: res.status || null },
  };
}

async function runSourceRescanNoLongerMatches(supabase, workspace, evidence) {
  // Narrow by design: this check needs (a) a specific advisory cited by
  // the evidence chain (source_vuln_intel_id) and (b) an internally cited
  // fixed-version observation to rescan. Anything less is inconclusive —
  // deferred rather than weakening doctrine.
  if (!evidence.source_vuln_intel_id) {
    return {
      status: 'check_inconclusive',
      summary: 'The evidence cites no specific intelligence record — there is no named advisory for the source rescan to confirm against.',
      reason: 'no source_vuln_intel_id on the evidence',
    };
  }
  const { data: intelRows, error: intelError } = await supabase
    .from('component_exposure_vulnerabilities')
    .select('vuln_id, source, package_name')
    .eq('workspace_id', workspace.workspace_id)
    .eq('vuln_intel_id', evidence.source_vuln_intel_id)
    .limit(1);
  if (intelError || !(Array.isArray(intelRows) && intelRows[0])) {
    return { status: 'check_inconclusive', summary: 'The cited intelligence record could not be loaded; the rescan has no named advisory.', reason: 'intel lookup failed' };
  }
  const advisory = intelRows[0];

  const citedId = parseUuidFromRef(evidence.evidence_ref);
  if (!citedId) {
    return {
      status: 'check_inconclusive',
      summary: 'The evidence reference cites no internal fixed-version observation to rescan.',
      reason: 'no UUID found in evidence_ref',
    };
  }
  const { data: citedRows, error: citedError } = await supabase
    .from('component_exposures')
    .select('subject_name, metadata, trust_boundary')
    .eq('workspace_id', workspace.workspace_id)
    .eq('exposure_id', citedId)
    .limit(1);
  if (citedError || !(Array.isArray(citedRows) && citedRows[0])) {
    return { status: 'check_inconclusive', summary: 'The cited fixed-version observation could not be loaded for the rescan.', reason: 'cited exposure unavailable' };
  }
  const cited = citedRows[0];
  const version = cited.metadata && cited.metadata.version;
  if (!version) {
    return { status: 'check_inconclusive', summary: 'The cited observation carries no version; the source has nothing to assert against.', reason: 'no version on cited observation' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTERNAL_TIMEOUT_MS);
  let osv;
  try {
    const res = await fetch('https://api.osv.dev/v1/query', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ package: { name: cited.subject_name, ecosystem: 'npm' }, version }),
      signal: controller.signal,
    });
    if (!res.ok) {
      return { status: 'check_inconclusive', summary: `The source (osv) answered HTTP ${res.status}; the rescan is unconfirmed.`, reason: `osv ${res.status}` };
    }
    osv = await res.json();
  } catch (err) {
    return { status: 'check_inconclusive', summary: 'The source (osv) was unreachable; the rescan is unconfirmed.', reason: (err && err.message) || 'osv unreachable' };
  } finally {
    clearTimeout(timer);
  }

  const checkedAt = new Date().toISOString();
  const returnedIds = (Array.isArray(osv.vulns) ? osv.vulns : []).map((v) => v.id);
  const stillMatches = returnedIds.includes(advisory.vuln_id);
  const detail = {
    source: advisory.source,
    advisory: advisory.vuln_id,
    rescanned: `${cited.subject_name}@${version}`,
    observed_at: checkedAt,
    advisories_returned_for_cited_version: returnedIds.slice(0, 20),
  };
  if (stillMatches) {
    return {
      status: 'check_failed',
      summary: `The source (${advisory.source}) STILL returns ${advisory.vuln_id} for ${cited.subject_name}@${version} at ${checkedAt} — the citation is not confirmed by rescan.`,
      reason: 'source still returns the named advisory for the cited version',
      detail,
    };
  }
  return {
    status: 'check_passed',
    summary: `source_no_longer_matches: the source (${advisory.source}) did not return ${advisory.vuln_id} for ${cited.subject_name}@${version} at ${checkedAt}. Other advisories may still apply; this is a citation check, not a safety statement.`,
    detail,
  };
}

// ---------------------------------------------------------------------------
// Shaping + handlers
// ---------------------------------------------------------------------------

function shapeCheckRow(row) {
  if (!row) return null;
  return {
    check_id: row.check_id,
    workspace_id: row.workspace_id,
    evidence_id: row.evidence_id,
    exception_id: row.exception_id || null,
    source_exposure_id: row.source_exposure_id || null,
    related_resolution_id: row.related_resolution_id || null,
    evidence_type: row.evidence_type,
    evidence_ref: row.evidence_ref,
    check_kind: row.check_kind,
    check_status: row.check_status,
    checked_by: row.checked_by_user
      ? {
        user_id: row.checked_by_user.user_id,
        github_login: row.checked_by_user.github_login,
        display_name: row.checked_by_user.display_name || null,
      }
      : null,
    checked_at: row.checked_at,
    summary_public: row.summary_public,
    status_reason: row.status_reason || null,
    detail: row.detail || {},
    non_claim: VERIFICATION_NON_CLAIM,
    visibility: 'private',
  };
}

const CHECK_SELECT =
  '*, checked_by_user:checked_by(user_id, github_login, display_name)';

async function loadEvidenceInWorkspace(supabase, workspaceId, evidenceId) {
  const { data, error } = await supabase
    .from('component_remediation_evidence')
    .select('evidence_id, exception_id, source_exposure_id, source_vuln_intel_id, related_resolution_id, evidence_type, evidence_ref')
    .eq('workspace_id', workspaceId)
    .eq('evidence_id', evidenceId)
    .limit(1);
  if (error) return { error };
  return { row: (Array.isArray(data) && data[0]) || null };
}

/**
 * GET /api/vault/workspaces/:slug/remediation-evidence/:id/verification-checks
 *
 * Read-only: the append-only check history for one evidence record,
 * newest first.
 */
export async function handleListVerificationChecks(req, res) {
  const slug = (req.params && req.params.slug) || '';
  const evidenceId = (req.params && req.params.id) || '';
  const resolved = await resolveWorkspaceForMember(req, res, slug);
  if (!resolved) return;
  const { workspace } = resolved;

  const supabase = vaultDb();
  const evidence = await loadEvidenceInWorkspace(supabase, workspace.workspace_id, evidenceId);
  if (evidence.error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'evidence lookup failed');
  }
  if (!evidence.row) {
    return sendError(res, 404, ERROR_CODES.not_found, 'not found');
  }
  const { data, error } = await supabase
    .from('evidence_verification_checks')
    .select(CHECK_SELECT)
    .eq('workspace_id', workspace.workspace_id)
    .eq('evidence_id', evidenceId)
    .order('checked_at', { ascending: false })
    .limit(50);
  if (error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'verification check list failed');
  }
  res.status(200).json({
    checks: (Array.isArray(data) ? data : []).map(shapeCheckRow),
    non_claim: VERIFICATION_NON_CLAIM,
    visibility: 'private',
  });
}

/**
 * POST /api/vault/workspaces/:slug/remediation-evidence/:id/verification-checks
 *   { check_kind }
 *
 * Run ONE citation check and record the result, append-only. The
 * evidence row is never mutated; the check asserts only what it observed
 * at check time. Session + CSRF; member-level (running a check is an
 * observation action, like refreshing intelligence).
 */
export async function handleRunVerificationCheck(req, res) {
  const slug = (req.params && req.params.slug) || '';
  const evidenceId = (req.params && req.params.id) || '';
  const resolved = await resolveWorkspaceForMember(req, res, slug);
  if (!resolved) return;
  const { workspace, membership } = resolved;
  if (!requireRole(res, membership, 'member')) return;

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const checkKind = typeof body.check_kind === 'string' ? body.check_kind : '';
  if (!VERIFICATION_CHECK_KINDS.includes(checkKind)) {
    return sendError(res, 400, ERROR_CODES.bad_request,
      `check_kind must be one of: ${VERIFICATION_CHECK_KINDS.join(', ')}`);
  }

  const supabase = vaultDb();
  const evidence = await loadEvidenceInWorkspace(supabase, workspace.workspace_id, evidenceId);
  if (evidence.error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'evidence lookup failed');
  }
  if (!evidence.row) {
    return sendError(res, 404, ERROR_CODES.not_found, 'not found');
  }

  let result;
  if (checkKind === 'internal_exposure_reference') {
    result = await runInternalExposureReference(supabase, workspace, evidence.row);
  } else if (checkKind === 'github_reference_reachable') {
    result = await runGithubReferenceReachable(evidence.row);
  } else {
    result = await runSourceRescanNoLongerMatches(supabase, workspace, evidence.row);
  }

  const { data: inserted, error: insertError } = await supabase
    .from('evidence_verification_checks')
    .insert({
      workspace_id: workspace.workspace_id,
      evidence_id: evidenceId,
      exception_id: evidence.row.exception_id || null,
      source_exposure_id: evidence.row.source_exposure_id || null,
      related_resolution_id: evidence.row.related_resolution_id || null,
      evidence_type: evidence.row.evidence_type,
      evidence_ref: evidence.row.evidence_ref,
      check_kind: checkKind,
      check_status: result.status,
      checked_by: req.vaultSession.user_id,
      summary_public: result.summary.slice(0, 500),
      status_reason: result.reason ? String(result.reason).slice(0, 500) : null,
      detail: boundDetail(result.detail),
    })
    .select(CHECK_SELECT)
    .limit(1);
  if (insertError) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'verification check insert failed');
  }
  const insertedRow = Array.isArray(inserted) && inserted[0];

  // PR-17C notification echo (best-effort; the check record stands
  // regardless). The state speaks the check vocabulary, nothing stronger.
  if (insertedRow) {
    await deliverWorkspaceWebhooks(supabase, {
      eventId: crypto.randomUUID(),
      eventType: 'evidence_verification.checked',
      workspace: { workspace_id: workspace.workspace_id, slug },
      occurredAt: insertedRow.checked_at,
      actor: { github_login: req.vaultSession.github_login },
      recordIds: {
        check_id: insertedRow.check_id,
        evidence_id: evidenceId,
        exception_id: evidence.row.exception_id || undefined,
        exposure_id: evidence.row.source_exposure_id || undefined,
        resolution_id: evidence.row.related_resolution_id || undefined,
      },
      state: result.status,
      verificationCheck: { check_kind: checkKind, check_status: result.status },
    });
  }

  res.status(201).json(shapeCheckRow(insertedRow));
}
