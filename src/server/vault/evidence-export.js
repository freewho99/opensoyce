// OpenSoyce Trust Vault (PR-17A) — auditor / customer evidence export bundle.
//
// DOCTRINE:
//   A control matrix without records behind it is a claim.
//   An export is a view of records, not a new source of truth.
//   Evidence shows what happened.
//   Evidence does not certify compliance by itself.
//   OpenSoyce produces audit-ready evidence; auditors decide audit outcomes.
//
// KEY BOUNDARY:
//   Export is not certification.
//   Export is not a decision.
//   Export is a faithful view of the record.
//
// Structurally enforced: this module performs READS ONLY. It never inserts,
// updates, deletes, or upserts any row anywhere. Generating an export
// creates no CEI event, no timeline event, no exception, no question, no
// resolution — the record is exactly the same after the export as before
// it. Missing chain links are reported as "not present in the record",
// never fabricated. Severity is reproduced in the source's vocabulary;
// nothing here maps severity to a decision.
//
// The bundle is anchored on ONE component exposure (the observation) and
// walks the chain the records themselves assert:
//   exposure -> vulnerability intelligence (context rows)
//            -> remediation questions (the system asked; a human answered)
//            -> CEI relationship events -> exceptions (the trust decisions)
//            -> expiry pressure (reaper observation, time truth)
//            -> reviewer resolutions (the decision after expiry)
//            -> receipts (CEI events + Vault timeline + proof anchors)

import { vaultDb } from './db.js';
import { sendError, ERROR_CODES } from './errors.js';
import { resolveWorkspaceForMember } from './rbac.js';

export const EVIDENCE_BUNDLE_FORMAT = 'opensoyce-evidence-bundle';
export const EVIDENCE_BUNDLE_VERSION = 1;

// Honest-edge copy lives in ONE place so the JSON bundle and the Markdown
// render can never drift apart on what is claimed.
export const BUNDLE_PROVES = Object.freeze([
  'A component observation was recorded, with source provenance and timestamps.',
  'The vulnerability/risk context shown is what the cited source asserted at recording time.',
  'The remediation questions, trust decisions, expiry observations, and reviewer resolutions shown were recorded by the identified actors at the identified times.',
  'Each step links to the underlying record by id — the export is a view of those records, not a separate source of truth.',
]);

export const BUNDLE_DOES_NOT_PROVE = Object.freeze([
  'This export is not a compliance certification, and OpenSoyce does not certify controls.',
  'It does not prove a vulnerability was remediated — a recorded direction is not a completed action.',
  'It does not prove the absence of vulnerabilities — "no intelligence recorded" means the record holds none, not that none exist.',
  'It does not replace an auditor or guarantee acceptance by any customer security review.',
]);

function shapeUser(u) {
  if (!u) return null;
  return {
    user_id: u.user_id,
    github_login: u.github_login,
    display_name: u.display_name || null,
  };
}

function userLabel(u) {
  if (!u) return 'not present in the record';
  return `@${u.github_login}${u.display_name ? ` (${u.display_name})` : ''}`;
}

// A section that has no records behind it says so explicitly. The export
// never invents a row to make the story look complete.
const NOT_PRESENT = 'not present in the record';

// ---------------------------------------------------------------------------
// Pure bundle assembly (exported for deterministic tests — no I/O, no clock)
// ---------------------------------------------------------------------------

/**
 * Assemble the evidence bundle from already-loaded records. Pure: same
 * input rows, same bundle (generated_at is passed in by the caller).
 * Every section carries `present`; absent chain links are reported, never
 * fabricated.
 *
 * records = {
 *   workspace: { slug, display_name? },
 *   exposure:  shaped component exposure row (required),
 *   intel:     [vuln-intel rows],
 *   questions: [remediation-question rows],
 *   ceiEvents: [component_exposure_events rows, shaped],
 *   exceptions: [vault_exceptions rows, shaped, reason_private EXCLUDED],
 *   resolutions: [vault_exception_resolutions rows, shaped],
 *   timelineEvents: [vault_timeline_events rows, shaped],
 *   generatedAt: ISO timestamp string,
 * }
 */
export function buildEvidenceBundle(records) {
  const {
    workspace, exposure, intel = [], questions = [], ceiEvents = [],
    exceptions = [], resolutions = [], timelineEvents = [], generatedAt,
  } = records;

  const observedVersion = exposure.metadata && typeof exposure.metadata.version === 'string'
    ? exposure.metadata.version
    : null;

  // Expiry pressure is evidence when the records show it: an expired
  // exception state (time truth), the CEI system event the reaper recorded,
  // and/or the Phase 5 timeline expiry event.
  const expiredExceptions = exceptions.filter((e) => e.state === 'expired');
  const expiredCeiEvents = ceiEvents.filter((e) => e.event_kind === 'exception_expired_from_exposure');
  const expiredTimelineEvents = timelineEvents.filter((e) => e.event_type === 'exception_expired');
  const expiryPresent = expiredExceptions.length > 0
    || expiredCeiEvents.length > 0 || expiredTimelineEvents.length > 0;

  const missing = [];
  if (intel.length === 0) missing.push('vulnerability intelligence (no context rows recorded for this observation)');
  if (questions.length === 0) missing.push('remediation questions (none opened from this observation)');
  if (exceptions.length === 0) missing.push('exceptions (no trust decision was proposed from this observation)');
  if (!expiryPresent) missing.push('expiry pressure (no exception from this observation has expired)');
  if (resolutions.length === 0) missing.push('reviewer resolutions (no expired review case has been resolved)');
  if (ceiEvents.length === 0 && timelineEvents.length === 0) missing.push('receipt events (no CEI or timeline events recorded)');

  return {
    format: EVIDENCE_BUNDLE_FORMAT,
    version: EVIDENCE_BUNDLE_VERSION,
    generated_at: generatedAt,
    visibility: 'private',
    workspace: {
      slug: workspace.slug,
      display_name: workspace.display_name || null,
    },
    subject: {
      kind: exposure.subject_kind,
      name: exposure.subject_name,
      observed_version: observedVersion,
    },
    evidence_scope: 'One component trust-decision chain, assembled from existing private records only.',
    sections: {
      observation: {
        present: true,
        exposure_id: exposure.exposure_id,
        exposure_type: exposure.exposure_type,
        status: exposure.status,
        source_kind: exposure.source_kind,
        source_ref: exposure.source_ref,
        latest_source_ref: exposure.latest_source_ref,
        first_seen_at: exposure.first_seen_at,
        last_seen_at: exposure.last_seen_at,
        seen_count: exposure.seen_count,
        trust_boundary: exposure.trust_boundary,
      },
      vulnerability_context: {
        present: intel.length > 0,
        note: intel.length > 0
          ? 'Severity is reproduced in the source’s vocabulary; OpenSoyce does not branch on it.'
          : 'No known intelligence recorded for this observation. This means the record holds none — not that no vulnerabilities exist.',
        intel: intel.map((iv) => ({
          vuln_intel_id: iv.vuln_intel_id,
          vuln_id: iv.vuln_id,
          source: iv.source,
          match_basis: iv.match_basis,
          severity_as_reported_by_source: iv.severity || null,
          affected_range: iv.affected_range || null,
          source_ref: iv.source_ref || null,
          summary: (iv.metadata && typeof iv.metadata.summary === 'string') ? iv.metadata.summary : null,
          first_seen_at: iv.first_seen_at,
          last_seen_at: iv.last_seen_at,
          seen_count: iv.seen_count,
        })),
      },
      remediation_questions: {
        present: questions.length > 0,
        questions: questions.map((q) => ({
          question_id: q.question_id,
          question_kind: q.question_kind,
          vuln_id: q.vuln_id || null,
          status: q.status,
          selected_outcome: q.selected_outcome || null,
          created_by: shapeUser(q.created_by),
          created_at: q.created_at,
          answered_by: shapeUser(q.answered_by),
          answered_at: q.answered_at || null,
          reason_public: q.reason_public || null,
        })),
      },
      exceptions: {
        present: exceptions.length > 0,
        note: exceptions.length > 0
          ? 'Private reasoning is held in the underlying record and is not reproduced in this export.'
          : null,
        exceptions: exceptions.map((ex) => ({
          exception_id: ex.exception_id,
          subject_kind: ex.subject_kind,
          subject_name: ex.subject_name,
          state: ex.state,
          proposed_transition: `${ex.original_action} → ${ex.allowed_action}`,
          proposed_by: ex.proposed_by,
          proposed_at: ex.proposed_at,
          reviewed_by: ex.reviewed_by || null,
          reviewed_at: ex.reviewed_at || null,
          expires_at: ex.expires_at || null,
          reason_public: ex.reason_public || null,
          revoked_at: ex.revoked_at || null,
          proof_anchors: Array.isArray(ex.proof_anchors) ? ex.proof_anchors : [],
        })),
      },
      expiry_pressure: {
        present: expiryPresent,
        expired_exceptions: expiredExceptions.map((ex) => ({
          exception_id: ex.exception_id,
          expires_at: ex.expires_at || null,
        })),
        system_events: expiredCeiEvents.map((ev) => ({
          event_id: ev.event_id,
          event_kind: ev.event_kind,
          related_exception_id: ev.related_exception_id,
          actor: ev.actor ? shapeUser(ev.actor) : null,
          actor_kind: ev.actor ? 'user' : 'system',
          observed_at: (ev.metadata && typeof ev.metadata.observed_at === 'string') ? ev.metadata.observed_at : null,
          expired_at: (ev.metadata && typeof ev.metadata.expired_at === 'string') ? ev.metadata.expired_at : null,
          created_at: ev.created_at,
        })),
        timeline_events: expiredTimelineEvents.map((ev) => ({
          event_id: ev.event_id,
          event_type: ev.event_type,
          summary: ev.summary,
          emitted_at: ev.emitted_at,
        })),
      },
      resolutions: {
        present: resolutions.length > 0,
        resolutions: resolutions.map((r) => ({
          resolution_id: r.resolution_id,
          exception_id: r.exception_id,
          outcome: r.outcome,
          resolved_by: shapeUser(r.resolved_by),
          reason_public: r.reason_public,
          renewed_exception_id: r.renewed_exception_id || null,
          linked_question_id: r.linked_question_id || null,
          created_at: r.created_at,
        })),
      },
      receipts: {
        present: ceiEvents.length > 0 || timelineEvents.length > 0,
        cei_events: ceiEvents.map((ev) => ({
          event_id: ev.event_id,
          event_kind: ev.event_kind,
          related_exception_id: ev.related_exception_id || null,
          actor: ev.actor ? shapeUser(ev.actor) : null,
          created_at: ev.created_at,
        })),
        timeline_events: timelineEvents.map((ev) => ({
          event_id: ev.event_id,
          event_type: ev.event_type,
          subject_exception_id: ev.subject_exception_id || null,
          summary: ev.summary,
          emitted_by: shapeUser(ev.emitted_by),
          emitted_at: ev.emitted_at,
        })),
        record_ids: {
          exposure_id: exposure.exposure_id,
          vuln_intel_ids: intel.map((iv) => iv.vuln_intel_id),
          question_ids: questions.map((q) => q.question_id),
          exception_ids: exceptions.map((ex) => ex.exception_id),
          resolution_ids: resolutions.map((r) => r.resolution_id),
        },
      },
    },
    honest_edges: {
      proves: [...BUNDLE_PROVES],
      does_not_prove: [...BUNDLE_DOES_NOT_PROVE],
      missing,
    },
  };
}

// ---------------------------------------------------------------------------
// Markdown renderer (pure)
// ---------------------------------------------------------------------------

function mdLine(parts) {
  return parts.filter((p) => p !== null && p !== undefined && p !== '').join(' · ');
}

/**
 * Render the bundle as a human-readable Markdown evidence document. Pure:
 * a faithful re-statement of the bundle, nothing more — the renderer adds
 * formatting, never facts.
 */
export function renderEvidenceBundleMarkdown(bundle) {
  const s = bundle.sections;
  const lines = [];
  const subject = bundle.subject;

  lines.push(`# Evidence bundle — ${subject.kind} ${subject.name}${subject.observed_version ? `@${subject.observed_version}` : ''}`);
  lines.push('');
  lines.push('> An export is a view of records, not a new source of truth.');
  lines.push('> Evidence shows what happened. Evidence does not certify compliance by itself.');
  lines.push('');

  // 1. Executive summary
  lines.push('## 1. Executive summary');
  lines.push('');
  lines.push(`- Component: ${subject.kind} \`${subject.name}\``);
  lines.push(`- Observed version: ${subject.observed_version ? `\`${subject.observed_version}\`` : NOT_PRESENT}`);
  lines.push(`- Workspace: \`${bundle.workspace.slug}\`${bundle.workspace.display_name ? ` (${bundle.workspace.display_name})` : ''}`);
  lines.push(`- Export generated: ${bundle.generated_at}`);
  lines.push(`- Evidence scope: ${bundle.evidence_scope}`);
  lines.push(`- Visibility: ${bundle.visibility}`);
  lines.push('');

  // 2. Observation record
  const obs = s.observation;
  lines.push('## 2. Observation record');
  lines.push('');
  lines.push(`- Exposure id: \`${obs.exposure_id}\``);
  lines.push(`- Type: ${obs.exposure_type || NOT_PRESENT} · status: ${obs.status}`);
  lines.push(`- Source: ${obs.source_kind}${obs.source_ref ? ` (\`${obs.source_ref}\`)` : ''}`);
  if (obs.latest_source_ref && obs.latest_source_ref !== obs.source_ref) {
    lines.push(`- Latest sighting source: \`${obs.latest_source_ref}\``);
  }
  lines.push(`- First seen: ${obs.first_seen_at} · last seen: ${obs.last_seen_at} · seen count: ${obs.seen_count}`);
  lines.push(`- Trust boundary: \`${JSON.stringify(obs.trust_boundary || {})}\``);
  lines.push('');

  // 3. Vulnerability / risk context
  const vc = s.vulnerability_context;
  lines.push('## 3. Vulnerability / risk context');
  lines.push('');
  lines.push(vc.note);
  lines.push('');
  for (const iv of vc.intel) {
    lines.push(`- \`${iv.vuln_id}\` — ${mdLine([
      `source: ${iv.source}`,
      `match basis: ${iv.match_basis}`,
      `severity (as reported by source): ${iv.severity_as_reported_by_source || 'unrated'}`,
    ])}`);
    if (iv.affected_range) lines.push(`  - affected range: ${iv.affected_range}`);
    if (iv.summary) lines.push(`  - source summary: ${iv.summary}`);
    if (iv.source_ref) lines.push(`  - source ref: ${iv.source_ref}`);
    lines.push(`  - first seen ${iv.first_seen_at} · last seen ${iv.last_seen_at} · seen ×${iv.seen_count} · record \`${iv.vuln_intel_id}\``);
  }
  lines.push('');

  // 4. Remediation question
  const rq = s.remediation_questions;
  lines.push('## 4. Remediation question');
  lines.push('');
  if (!rq.present) {
    lines.push(`Remediation questions: ${NOT_PRESENT}.`);
  } else {
    for (const q of rq.questions) {
      lines.push(`- Question \`${q.question_id}\` — ${mdLine([
        `kind: ${q.question_kind}`,
        q.vuln_id ? `about: ${q.vuln_id}` : null,
        `status: ${q.status}`,
      ])}`);
      lines.push(`  - opened by ${userLabel(q.created_by)} at ${q.created_at}`);
      if (q.status === 'answered') {
        lines.push(`  - answered by ${userLabel(q.answered_by)} at ${q.answered_at || NOT_PRESENT}`);
        lines.push(`  - selected direction: \`${q.selected_outcome || NOT_PRESENT}\``);
        if (q.reason_public) lines.push(`  - reason: ${q.reason_public}`);
      } else {
        lines.push(`  - answer: ${NOT_PRESENT}`);
      }
    }
  }
  lines.push('');

  // 5. Exception / accepted risk
  const exs = s.exceptions;
  lines.push('## 5. Exception / accepted risk');
  lines.push('');
  if (!exs.present) {
    lines.push(`Exceptions: ${NOT_PRESENT}.`);
  } else {
    if (exs.note) { lines.push(exs.note); lines.push(''); }
    for (const ex of exs.exceptions) {
      lines.push(`- Exception \`${ex.exception_id}\` — ${mdLine([
        `${ex.subject_kind} ${ex.subject_name}`,
        `proposed transition: ${ex.proposed_transition}`,
        `current state: ${ex.state}`,
      ])}`);
      lines.push(`  - proposed at ${ex.proposed_at}`);
      lines.push(`  - reviewed by: ${ex.reviewed_by ? `\`${ex.reviewed_by}\`` : NOT_PRESENT}${ex.reviewed_at ? ` at ${ex.reviewed_at}` : ''}`);
      lines.push(`  - expires at: ${ex.expires_at || NOT_PRESENT}`);
      if (ex.reason_public) lines.push(`  - public reason: ${ex.reason_public}`);
      if (ex.revoked_at) lines.push(`  - revoked at: ${ex.revoked_at}`);
    }
  }
  lines.push('');

  // 6. Expiry pressure
  const ep = s.expiry_pressure;
  lines.push('## 6. Expiry pressure');
  lines.push('');
  if (!ep.present) {
    lines.push(`Expiry pressure: ${NOT_PRESENT}.`);
  } else {
    for (const ex of ep.expired_exceptions) {
      lines.push(`- Exception \`${ex.exception_id}\` is expired (time truth) — scheduled expiry: ${ex.expires_at || NOT_PRESENT}`);
    }
    for (const ev of ep.system_events) {
      lines.push(`- System observation \`${ev.event_id}\` (${ev.event_kind}) — actor: ${ev.actor_kind}`);
      if (ev.expired_at) lines.push(`  - expired at ${ev.expired_at}${ev.observed_at ? ` · observed by the reaper at ${ev.observed_at}` : ''}`);
      lines.push(`  - recorded at ${ev.created_at}`);
    }
    for (const ev of ep.timeline_events) {
      lines.push(`- Timeline event \`${ev.event_id}\` (${ev.event_type}) at ${ev.emitted_at}: ${ev.summary}`);
    }
  }
  lines.push('');

  // 7. Reviewer resolution
  const rs = s.resolutions;
  lines.push('## 7. Reviewer resolution');
  lines.push('');
  if (!rs.present) {
    lines.push(`Reviewer resolutions: ${NOT_PRESENT}.`);
  } else {
    for (const r of rs.resolutions) {
      lines.push(`- Resolution \`${r.resolution_id}\` on exception \`${r.exception_id}\` — direction: \`${r.outcome}\``);
      lines.push(`  - resolved by ${userLabel(r.resolved_by)} at ${r.created_at}`);
      lines.push(`  - reason: ${r.reason_public}`);
      if (r.renewed_exception_id) lines.push(`  - cites new exception \`${r.renewed_exception_id}\` (renewal travels the existing propose/approve lane)`);
      if (r.linked_question_id) lines.push(`  - cites remediation question \`${r.linked_question_id}\``);
    }
  }
  lines.push('');

  // 8. Receipt trail
  const rc = s.receipts;
  lines.push('## 8. Receipt trail');
  lines.push('');
  if (!rc.present) {
    lines.push(`Receipt events: ${NOT_PRESENT}.`);
  } else {
    if (rc.cei_events.length > 0) {
      lines.push('CEI relationship events:');
      lines.push('');
      for (const ev of rc.cei_events) {
        lines.push(`- ${ev.created_at} — \`${ev.event_kind}\` · actor: ${ev.actor ? userLabel(ev.actor) : 'system'}${ev.related_exception_id ? ` · exception \`${ev.related_exception_id}\`` : ''} · event \`${ev.event_id}\``);
      }
      lines.push('');
    }
    if (rc.timeline_events.length > 0) {
      lines.push('Vault timeline events:');
      lines.push('');
      for (const ev of rc.timeline_events) {
        lines.push(`- ${ev.emitted_at} — \`${ev.event_type}\` · ${ev.summary} · emitted by ${ev.emitted_by ? userLabel(ev.emitted_by) : 'system'} · event \`${ev.event_id}\``);
      }
      lines.push('');
    }
  }
  lines.push('Source record ids:');
  lines.push('');
  lines.push(`- exposure: \`${rc.record_ids.exposure_id}\``);
  lines.push(`- vulnerability intelligence: ${rc.record_ids.vuln_intel_ids.length ? rc.record_ids.vuln_intel_ids.map((x) => `\`${x}\``).join(', ') : NOT_PRESENT}`);
  lines.push(`- remediation questions: ${rc.record_ids.question_ids.length ? rc.record_ids.question_ids.map((x) => `\`${x}\``).join(', ') : NOT_PRESENT}`);
  lines.push(`- exceptions: ${rc.record_ids.exception_ids.length ? rc.record_ids.exception_ids.map((x) => `\`${x}\``).join(', ') : NOT_PRESENT}`);
  lines.push(`- resolutions: ${rc.record_ids.resolution_ids.length ? rc.record_ids.resolution_ids.map((x) => `\`${x}\``).join(', ') : NOT_PRESENT}`);
  lines.push('');

  // 9. Honest edges
  lines.push('## 9. Honest edges');
  lines.push('');
  lines.push('What this export proves:');
  lines.push('');
  for (const p of bundle.honest_edges.proves) lines.push(`- ${p}`);
  lines.push('');
  lines.push('What this export does not prove:');
  lines.push('');
  for (const p of bundle.honest_edges.does_not_prove) lines.push(`- ${p}`);
  lines.push('');
  if (bundle.honest_edges.missing.length > 0) {
    lines.push('Sections not present in the record:');
    lines.push('');
    for (const m of bundle.honest_edges.missing) lines.push(`- ${m}`);
    lines.push('');
  }
  lines.push('---');
  lines.push('');
  lines.push(`Generated by OpenSoyce at ${bundle.generated_at}. This document is a faithful view of private workspace records and is not a compliance certification.`);
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Read-only record loading
// ---------------------------------------------------------------------------

const EXPOSURE_SELECT =
  '*, exposure_type:exposure_type_id(type_slug, display_name, is_native, is_active)';
const EVENT_SELECT =
  '*, actor:actor_user_id(user_id, github_login, display_name)';
const QUESTION_SELECT =
  '*,'
  + ' created_by_user:created_by(user_id, github_login, display_name),'
  + ' answered_by_user:answered_by(user_id, github_login, display_name)';
const RESOLUTION_SELECT =
  '*, resolved_by_user:resolved_by(user_id, github_login, display_name)';
const TIMELINE_SELECT = '*, emitted_by_user:emitted_by(user_id, github_login, display_name)';

// Bounded reads: an evidence chain bigger than these caps is exported up to
// the cap; the bundle stays a view, never an unbounded dump.
const MAX_ROWS = 200;
const MAX_EXCEPTIONS = 25;

/**
 * GET /api/vault/workspaces/:slug/exposures/:id/evidence-export
 *
 * Assemble the evidence bundle for one component trust-decision chain.
 * READ-ONLY: this handler performs selects only; the record is unchanged
 * by exporting it. Responds with both the JSON bundle and its Markdown
 * rendering. Private: session + workspace membership; 404-on-non-member.
 */
export async function handleGetEvidenceExport(req, res) {
  const slug = (req.params && req.params.slug) || '';
  const exposureId = (req.params && req.params.id) || '';
  const resolved = await resolveWorkspaceForMember(req, res, slug);
  if (!resolved) return;
  const { workspace } = resolved;

  const supabase = vaultDb();

  // The anchor: the observation itself.
  const { data: exposureRows, error: exposureError } = await supabase
    .from('component_exposures')
    .select(EXPOSURE_SELECT)
    .eq('workspace_id', workspace.workspace_id)
    .eq('exposure_id', exposureId)
    .limit(1);
  if (exposureError) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'evidence export: exposure read failed');
  }
  const exposureRow = Array.isArray(exposureRows) && exposureRows[0];
  if (!exposureRow) {
    return sendError(res, 404, ERROR_CODES.not_found, 'not found');
  }

  // Context: what the source asserted about this observation.
  const { data: intelRows, error: intelError } = await supabase
    .from('component_exposure_vulnerabilities')
    .select('*')
    .eq('workspace_id', workspace.workspace_id)
    .eq('exposure_id', exposureId)
    .order('last_seen_at', { ascending: false })
    .limit(MAX_ROWS);
  if (intelError) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'evidence export: intelligence read failed');
  }

  // Questions opened from this observation.
  const { data: questionRows, error: questionError } = await supabase
    .from('component_remediation_questions')
    .select(QUESTION_SELECT)
    .eq('workspace_id', workspace.workspace_id)
    .eq('source_exposure_id', exposureId)
    .order('created_at', { ascending: true })
    .limit(MAX_ROWS);
  if (questionError) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'evidence export: question read failed');
  }

  // CEI relationship events — also the only place the exposure->exception
  // link exists (the exception row deliberately carries no exposure ref).
  const { data: ceiEventRows, error: ceiError } = await supabase
    .from('component_exposure_events')
    .select(EVENT_SELECT)
    .eq('workspace_id', workspace.workspace_id)
    .eq('exposure_id', exposureId)
    .order('created_at', { ascending: true })
    .limit(MAX_ROWS);
  if (ceiError) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'evidence export: event read failed');
  }
  const ceiEvents = Array.isArray(ceiEventRows) ? ceiEventRows : [];

  const exceptionIds = [...new Set(
    ceiEvents.map((ev) => ev.related_exception_id).filter((id) => typeof id === 'string' && id),
  )].slice(0, MAX_EXCEPTIONS);

  // The trust decisions discovered through the relationship events.
  let exceptionRowsRaw = [];
  if (exceptionIds.length > 0) {
    const { data, error } = await supabase
      .from('vault_exceptions')
      .select('*')
      .eq('workspace_id', workspace.workspace_id)
      .in('exception_id', exceptionIds)
      .order('proposed_at', { ascending: true });
    if (error) {
      return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'evidence export: exception read failed');
    }
    exceptionRowsRaw = Array.isArray(data) ? data : [];
  }

  // Reviewer resolutions on those exceptions (the post-expiry review cases).
  let resolutionRowsRaw = [];
  if (exceptionIds.length > 0) {
    const { data, error } = await supabase
      .from('vault_exception_resolutions')
      .select(RESOLUTION_SELECT)
      .eq('workspace_id', workspace.workspace_id)
      .in('exception_id', exceptionIds)
      .order('created_at', { ascending: true })
      .limit(MAX_ROWS);
    if (error) {
      return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'evidence export: resolution read failed');
    }
    resolutionRowsRaw = Array.isArray(data) ? data : [];
  }

  // The Phase 5 timeline receipts for those exceptions.
  let timelineRowsRaw = [];
  if (exceptionIds.length > 0) {
    const { data, error } = await supabase
      .from('vault_timeline_events')
      .select(TIMELINE_SELECT)
      .eq('workspace_id', workspace.workspace_id)
      .in('subject_exception_id', exceptionIds)
      .order('emitted_at', { ascending: true })
      .limit(MAX_ROWS);
    if (error) {
      return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'evidence export: timeline read failed');
    }
    timelineRowsRaw = Array.isArray(data) ? data : [];
  }

  // Shape rows for the pure builder. reason_private is EXCLUDED everywhere:
  // the export reproduces public reasons only; private reasoning stays in
  // the underlying record.
  const bundle = buildEvidenceBundle({
    workspace: { slug, display_name: workspace.display_name || null },
    exposure: {
      exposure_id: exposureRow.exposure_id,
      exposure_type: exposureRow.exposure_type ? exposureRow.exposure_type.type_slug : null,
      subject_kind: exposureRow.subject_kind,
      subject_name: exposureRow.subject_name,
      status: exposureRow.status,
      source_kind: exposureRow.source_kind,
      source_ref: exposureRow.source_ref || null,
      latest_source_ref: exposureRow.latest_source_ref || null,
      first_seen_at: exposureRow.first_seen_at,
      last_seen_at: exposureRow.last_seen_at,
      seen_count: typeof exposureRow.seen_count === 'number' ? exposureRow.seen_count : 1,
      trust_boundary: exposureRow.trust_boundary || {},
      metadata: exposureRow.metadata || {},
    },
    intel: (Array.isArray(intelRows) ? intelRows : []).map((iv) => ({
      vuln_intel_id: iv.vuln_intel_id,
      vuln_id: iv.vuln_id,
      source: iv.source,
      match_basis: iv.match_basis,
      severity: iv.severity || null,
      affected_range: iv.affected_range || null,
      source_ref: iv.source_ref || null,
      metadata: iv.metadata || {},
      first_seen_at: iv.first_seen_at,
      last_seen_at: iv.last_seen_at,
      seen_count: typeof iv.seen_count === 'number' ? iv.seen_count : 1,
    })),
    questions: (Array.isArray(questionRows) ? questionRows : []).map((q) => ({
      question_id: q.question_id,
      question_kind: q.question_kind,
      vuln_id: q.vuln_id || null,
      status: q.status,
      selected_outcome: q.selected_outcome || null,
      created_by: q.created_by_user || null,
      created_at: q.created_at,
      answered_by: q.answered_by_user || null,
      answered_at: q.answered_at || null,
      reason_public: q.reason_public || null,
    })),
    ceiEvents: ceiEvents.map((ev) => ({
      event_id: ev.event_id,
      event_kind: ev.event_kind,
      related_exception_id: ev.related_exception_id || null,
      actor: ev.actor || null,
      metadata: ev.metadata || {},
      created_at: ev.created_at,
    })),
    exceptions: exceptionRowsRaw.map((ex) => ({
      exception_id: ex.exception_id,
      subject_kind: ex.subject_kind,
      subject_name: ex.subject_name,
      state: ex.state,
      original_action: ex.original_action,
      allowed_action: ex.allowed_action,
      proposed_by: ex.proposed_by,
      proposed_at: ex.proposed_at,
      reviewed_by: ex.reviewed_by || null,
      reviewed_at: ex.reviewed_at || null,
      expires_at: ex.expires_at || null,
      reason_public: ex.reason_public || null,
      revoked_at: ex.revoked_at || null,
      proof_anchors: ex.proof_anchors,
    })),
    resolutions: resolutionRowsRaw.map((r) => ({
      resolution_id: r.resolution_id,
      exception_id: r.exception_id,
      outcome: r.outcome,
      resolved_by: r.resolved_by_user || null,
      reason_public: r.reason_public,
      renewed_exception_id: r.renewed_exception_id || null,
      linked_question_id: r.linked_question_id || null,
      created_at: r.created_at,
    })),
    timelineEvents: timelineRowsRaw.map((ev) => ({
      event_id: ev.event_id,
      event_type: ev.event_type,
      subject_exception_id: ev.subject_exception_id || null,
      summary: ev.summary,
      emitted_by: ev.emitted_by_user || null,
      emitted_at: ev.emitted_at,
    })),
    generatedAt: new Date().toISOString(),
  });

  res.status(200).json({
    bundle,
    markdown: renderEvidenceBundleMarkdown(bundle),
    visibility: 'private',
  });
}
