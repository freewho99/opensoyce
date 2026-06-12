// OpenSoyce Trust Vault (PR-18A) — the Trust Agent evidence drafter.
//
// DOCTRINE: the agent drafts. The human decides. Drafts are records.
// Approval is a separate human action. The record remembers both the
// draft and the approval. Agent output is not evidence until a human
// records or approves it as evidence. The agent must not certify,
// verify, or declare a fix.
//
// v0 is a DETERMINISTIC drafter (Scope D): every draft is a pure
// function over the SAME bundles and packets the evidence exports are
// built from. That makes two walls structural: a draft can only derive
// from records (and cites their ids), and a draft can never contain
// private reasoning — the bundles exclude reason_private by
// construction. No LLM, no provider keys, no prompt surface in v0.
//
// Structurally enforced: this module writes exactly one table —
// agent_evidence_drafts — and reads it back. Draft title/body never
// change after creation; the only updates are the one-shot human
// decision stamps, guarded on draft_status = 'drafted'. Recording
// remediation evidence still travels the existing 16C lane, by a human,
// as its own record — never from here.

import crypto from 'node:crypto';
import { vaultDb } from './db.js';
import { sendError, ERROR_CODES } from './errors.js';
import { resolveWorkspaceForMember, requireRole } from './rbac.js';
import { loadEvidenceBundleForExposure } from './evidence-export.js';
import { composeEvidencePacket } from './evidence-rollup.js';
import { compareObservedVersions } from './evidence-verification.js';
import { deliverWorkspaceWebhooks } from './webhooks.js';

export const AGENT_DRAFT_KINDS = Object.freeze([
  'remediation_evidence_suggestion',
  'trust_record_summary',
  'evidence_packet_summary',
  'missing_evidence_gap_summary',
  'citation_check_summary',
]);

export const AGENT_DRAFT_STATUSES = Object.freeze([
  'drafted', 'approved', 'rejected', 'superseded',
]);

// The non-claim that travels in every draft row, API response, and
// webhook payload.
export const AGENT_DRAFT_NON_CLAIM =
  'Agent drafts are suggestions derived from records. They are not trust decisions, remediation evidence, or certification unless a human records a separate approved action.';

const DRAFTER_METADATA = Object.freeze({ provider: 'deterministic', drafter_version: 1 });
const MAX_BODY = 8000;

// ---------------------------------------------------------------------------
// Pure drafters (exported for deterministic tests — no I/O, no clock).
// Each returns { title, body, suggestedFields, sourceRecordIds, related }.
// Vocabulary: drafted / suggested / may support / candidate evidence /
// human review required — never a verdict.
// ---------------------------------------------------------------------------

function clampBody(lines) {
  const body = lines.join('\n');
  return body.length <= MAX_BODY ? body : body.slice(0, MAX_BODY - 60) + '\n…(draft truncated; the cited records are the full account)';
}

function chainLabel(bundle) {
  const s = bundle.subject;
  return `${s.kind} ${s.name}${s.observed_version ? `@${s.observed_version}` : ''}`;
}

/** Summarize one chain from its bundle. Restates; never concludes. */
export function draftTrustRecordSummary(bundle) {
  const s = bundle.sections;
  const lines = [];
  lines.push(`Trust record summary for ${chainLabel(bundle)} (drafted by the Trust Agent; human review required).`);
  lines.push('');
  lines.push(`Observation: exposure ${s.observation.exposure_id}, status ${s.observation.status}, first seen ${s.observation.first_seen_at}, seen x${s.observation.seen_count}, source ${s.observation.source_kind}.`);
  lines.push(`Risk context: ${s.vulnerability_context.present ? `${s.vulnerability_context.intel.length} intelligence record(s) attached, severity in the source's vocabulary.` : 'no intelligence recorded — the record holds none, not that none exist.'}`);
  lines.push(`Remediation question: ${s.remediation_questions.present ? s.remediation_questions.questions.map((q) => `${q.question_id.slice(0, 8)} ${q.status}${q.selected_outcome ? ` -> ${q.selected_outcome}` : ''}`).join('; ') : 'none opened.'}`);
  lines.push(`Trust decision: ${s.exceptions.present ? s.exceptions.exceptions.map((ex) => `exception ${ex.exception_id.slice(0, 8)} ${ex.proposed_transition}, state ${ex.state}${ex.expires_at ? `, expiry ${ex.expires_at}` : ''}`).join('; ') : 'none recorded.'}`);
  lines.push(`Expiry pressure: ${s.expiry_pressure.present ? 'present (time truth; observed by the system).' : 'not present in the record.'}`);
  lines.push(`Reviewer direction: ${s.resolutions.present ? s.resolutions.resolutions.map((r) => r.outcome).join(', ') : 'none recorded.'}`);
  lines.push(`Remediation evidence: ${s.remediation_evidence.present ? `${s.remediation_evidence.evidence.length} human-cited record(s); case ${s.remediation_evidence.case_status}.` : `none recorded; case ${s.remediation_evidence.case_status}.`}`);
  lines.push(`Citation checks: ${s.citation_checks.present ? s.citation_checks.checks.map((c) => `${c.check_kind} -> citation check ${c.check_status.replace('check_', '')}`).join('; ') : 'none run.'}`);
  if (bundle.honest_edges.missing.length > 0) {
    lines.push(`Honest edges: ${bundle.honest_edges.missing.length} section(s) not present in the record.`);
  }
  lines.push('');
  lines.push(AGENT_DRAFT_NON_CLAIM);
  return {
    title: `Trust record summary: ${chainLabel(bundle)}`,
    body: clampBody(lines),
    suggestedFields: {},
    sourceRecordIds: bundle.sections.receipts.record_ids,
    related: { source_exposure_id: s.observation.exposure_id },
  };
}

/** Summarize a rollup packet's state. Counts, never verdicts. */
export function draftEvidencePacketSummary(packet) {
  const r = packet.state_rollup;
  const lines = [];
  lines.push(`Evidence packet summary for workspace ${packet.workspace.slug} (drafted by the Trust Agent; human review required).`);
  lines.push('');
  lines.push(`Chains included in full detail: ${r.chains_included} (${r.decision_bearing_chains} decision-bearing).`);
  lines.push(`Active temporary trust: ${r.active_temporary_trust}.`);
  lines.push(`Awaiting remediation evidence: ${r.awaiting_evidence}.`);
  lines.push(`Remediation evidence recorded: ${r.evidence_recorded}.`);
  lines.push(`Expired exceptions pending reviewer resolution: ${r.expired_exceptions_pending_review}; reviewer-resolved: ${r.expired_exceptions_resolved}.`);
  lines.push(`Observation-only inventory: ${r.observation_only_exposures}.`);
  if (packet.honest_edges.limitations.length > 0) {
    lines.push(`Packet limitations disclosed: ${packet.honest_edges.limitations.length}.`);
  }
  lines.push('Mixed states are the honest shape of a live record; this summary restates the packet and decides nothing.');
  lines.push('');
  lines.push(AGENT_DRAFT_NON_CLAIM);
  return {
    title: `Evidence packet summary: ${packet.workspace.slug} (${r.chains_included} chains, ${r.observation_only_exposures} observation-only)`,
    body: clampBody(lines),
    suggestedFields: {},
    sourceRecordIds: {
      chain_exposure_ids: packet.chains.map((c) => c.summary.exposure_id),
      inventory_exposure_ids: packet.observation_inventory.map((row) => row.exposure_id),
    },
    related: {},
  };
}

/** Name the gaps: directed-but-unanswered, evidence-but-unchecked. */
export function draftMissingEvidenceGapSummary(bundle) {
  const s = bundle.sections;
  const directed = new Set(
    (s.resolutions.resolutions || []).filter((r) => r.outcome === 'remediation_required').map((r) => r.exception_id),
  );
  const evidenced = new Set((s.remediation_evidence.evidence || []).map((ev) => ev.exception_id));
  const unanswered = [...directed].filter((id) => !evidenced.has(id));
  const checkedEvidence = new Set((s.citation_checks.checks || []).map((c) => c.evidence_id));
  const unchecked = (s.remediation_evidence.evidence || []).filter((ev) => !checkedEvidence.has(ev.evidence_id));

  const lines = [];
  lines.push(`Evidence gap summary for ${chainLabel(bundle)} (drafted by the Trust Agent; human review required).`);
  lines.push('');
  if (unanswered.length === 0 && unchecked.length === 0) {
    lines.push('No gaps found by this drafter: every remediation_required direction has cited evidence, and every evidence record has at least one citation check.');
  } else {
    if (unanswered.length > 0) {
      lines.push(`Directions awaiting evidence: ${unanswered.length} remediation_required direction(s) have no human-cited evidence answering them (exception(s): ${unanswered.join(', ')}). A human may record evidence via the existing evidence lane.`);
    }
    if (unchecked.length > 0) {
      lines.push(`Evidence without citation checks: ${unchecked.length} evidence record(s) have no citation check run (${unchecked.map((ev) => ev.evidence_id).join(', ')}). A human may run a citation check; checks confirm citations, not remediation.`);
    }
  }
  lines.push('');
  lines.push(AGENT_DRAFT_NON_CLAIM);
  return {
    title: `Evidence gaps: ${chainLabel(bundle)} — ${unanswered.length} direction(s) unanswered, ${unchecked.length} evidence record(s) unchecked`,
    body: clampBody(lines),
    suggestedFields: {},
    sourceRecordIds: bundle.sections.receipts.record_ids,
    related: { source_exposure_id: s.observation.exposure_id },
  };
}

/** Explain a citation check result without changing its meaning. */
export function draftCitationCheckSummary(bundle, evidenceId) {
  const checks = (bundle.sections.citation_checks.checks || []).filter((c) => c.evidence_id === evidenceId);
  const lines = [];
  lines.push(`Citation check summary for evidence ${evidenceId} on ${chainLabel(bundle)} (drafted by the Trust Agent; human review required).`);
  lines.push('');
  if (checks.length === 0) {
    lines.push('No citation checks have been run on this evidence record. A human may run one; an inconclusive result is an honest answer.');
  } else {
    for (const c of checks) {
      lines.push(`Citation check ${c.check_status.replace('check_', '')} (${c.check_kind}, ${c.checked_at}): ${c.summary_public}`);
    }
    lines.push('');
    lines.push('A check confirms whether the cited reference was reachable and matched the expected shape at check time — it does not change what the evidence claims, and it is not certification.');
  }
  lines.push('');
  lines.push(AGENT_DRAFT_NON_CLAIM);
  return {
    title: `Citation check summary: evidence ${evidenceId.slice(0, 8)} (${checks.length} check(s))`,
    body: clampBody(lines),
    suggestedFields: {},
    sourceRecordIds: { evidence_id: evidenceId, check_ids: checks.map((c) => c.check_id) },
    related: { source_exposure_id: bundle.sections.observation.exposure_id, related_evidence_id: evidenceId },
  };
}

/**
 * Suggest candidate remediation evidence: a later same-component
 * observation that MAY SUPPORT a fixed_version_observed evidence row.
 * The candidate observation is passed in by the handler (found by a
 * read-only workspace scan). Pure given its inputs; suggests, never
 * records.
 */
export function draftRemediationEvidenceSuggestion(bundle, candidate, directedResolutionId) {
  const s = bundle.sections;
  const original = s.observation;
  const lines = [];
  lines.push(`Remediation evidence suggestion for ${chainLabel(bundle)} (drafted by the Trust Agent; human review required).`);
  lines.push('');
  if (!candidate) {
    lines.push('No candidate found: this drafter looked for a later observation of the same component in this workspace and found none. Nothing is suggested; observing the upgraded component (e.g. via CLI ingest) would create a candidate.');
    lines.push('');
    lines.push(AGENT_DRAFT_NON_CLAIM);
    return {
      title: `Remediation evidence suggestion: ${chainLabel(bundle)} — no candidate found`,
      body: clampBody(lines),
      suggestedFields: {},
      sourceRecordIds: bundle.sections.receipts.record_ids,
      related: { source_exposure_id: original.exposure_id },
    };
  }
  const cmp = compareObservedVersions(bundle.subject.observed_version, candidate.observed_version);
  const evidenceRef = `${bundle.subject.name}@${candidate.observed_version} follow-up observation (exposure ${candidate.exposure_id})`;
  lines.push(`I found a later observed exposure ${candidate.exposure_id} for ${bundle.subject.name}@${candidate.observed_version} (first seen ${candidate.first_seen_at}).`);
  lines.push(`This MAY SUPPORT a fixed_version_observed evidence row for the remediation direction on this chain — candidate evidence only; a human must review and record it via the existing evidence lane.`);
  lines.push(`Version comparison vs the original ${bundle.subject.observed_version}: different=${cmp.different}, comparable=${cmp.comparable}, later=${cmp.later === null ? 'not comparable' : cmp.later}.`);
  lines.push('');
  lines.push(AGENT_DRAFT_NON_CLAIM);
  return {
    title: `Candidate evidence: ${bundle.subject.name}@${candidate.observed_version} may support fixed_version_observed`,
    body: clampBody(lines),
    suggestedFields: {
      evidence_type: 'fixed_version_observed',
      evidence_ref: evidenceRef,
      reason_public_draft: `Drafted by the Trust Agent, human review required: ${bundle.subject.name} was later observed at ${candidate.observed_version} (exposure ${candidate.exposure_id}), which may support the remediation direction on this chain.`,
      related_resolution_id: directedResolutionId || null,
    },
    sourceRecordIds: {
      ...bundle.sections.receipts.record_ids,
      candidate_exposure_id: candidate.exposure_id,
    },
    related: { source_exposure_id: original.exposure_id, related_resolution_id: directedResolutionId || null },
  };
}

// ---------------------------------------------------------------------------
// Shaping + handlers
// ---------------------------------------------------------------------------

function shapeDraftRow(row) {
  if (!row) return null;
  const user = (u) => (u ? { user_id: u.user_id, github_login: u.github_login, display_name: u.display_name || null } : null);
  return {
    draft_id: row.draft_id,
    workspace_id: row.workspace_id,
    source_exposure_id: row.source_exposure_id || null,
    exception_id: row.exception_id || null,
    related_resolution_id: row.related_resolution_id || null,
    related_evidence_id: row.related_evidence_id || null,
    related_check_id: row.related_check_id || null,
    draft_kind: row.draft_kind,
    draft_status: row.draft_status,
    generated_by_kind: row.generated_by_kind,
    requested_by: user(row.requested_by_user),
    approved_by: user(row.approved_by_user),
    rejected_by: user(row.rejected_by_user),
    created_at: row.created_at,
    approved_at: row.approved_at || null,
    rejected_at: row.rejected_at || null,
    draft_title: row.draft_title,
    draft_body: row.draft_body,
    suggested_fields: row.suggested_fields || {},
    source_record_ids: row.source_record_ids || {},
    non_claim: row.non_claim,
    model_metadata: row.model_metadata || {},
    visibility: 'private',
  };
}

const DRAFT_SELECT =
  '*,'
  + ' requested_by_user:requested_by(user_id, github_login, display_name),'
  + ' approved_by_user:approved_by(user_id, github_login, display_name),'
  + ' rejected_by_user:rejected_by(user_id, github_login, display_name)';

// Resolve the chain anchor: an exposure id directly, or via the
// exception's 6D proposal event (the exception row carries no exposure
// ref). Read-only discovery, like 16C.
async function resolveExposureAnchor(supabase, workspaceId, { exposureId, exceptionId }) {
  if (exposureId) return { exposureId };
  if (!exceptionId) return { exposureId: null };
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
 * POST /api/vault/workspaces/:slug/agent-drafts
 *   { draft_kind, exposure_id? | exception_id? | evidence_id? }
 *
 * A human explicitly requests a draft. The drafter derives it from the
 * SAME bundles/packets the exports use, cites the source record ids,
 * and records it as drafted. Nothing else changes.
 */
export async function handleCreateAgentDraft(req, res) {
  const slug = (req.params && req.params.slug) || '';
  const resolved = await resolveWorkspaceForMember(req, res, slug);
  if (!resolved) return;
  const { workspace, membership } = resolved;
  if (!requireRole(res, membership, 'member')) return;

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const draftKind = typeof body.draft_kind === 'string' ? body.draft_kind : '';
  if (!AGENT_DRAFT_KINDS.includes(draftKind)) {
    return sendError(res, 400, ERROR_CODES.bad_request,
      `draft_kind must be one of: ${AGENT_DRAFT_KINDS.join(', ')}`);
  }
  const exposureId = typeof body.exposure_id === 'string' ? body.exposure_id : '';
  const exceptionId = typeof body.exception_id === 'string' ? body.exception_id : '';
  const evidenceId = typeof body.evidence_id === 'string' ? body.evidence_id : '';

  const supabase = vaultDb();
  const generatedAt = new Date().toISOString();
  let draft;
  let related = {};

  if (draftKind === 'evidence_packet_summary') {
    const packetResult = await composeEvidencePacket(supabase, workspace, slug, { generatedAt });
    if (packetResult.error) {
      return sendError(res, 503, ERROR_CODES.vault_db_unavailable, packetResult.error);
    }
    draft = draftEvidencePacketSummary(packetResult.packet);
  } else {
    // Chain-anchored kinds need an exposure: given directly, via the
    // exception's proposal event, or via the evidence row's source link.
    let anchorExposureId = exposureId;
    let evidenceRow = null;
    if (evidenceId) {
      const { data, error } = await supabase
        .from('component_remediation_evidence')
        .select('evidence_id, exception_id, source_exposure_id, related_resolution_id')
        .eq('workspace_id', workspace.workspace_id)
        .eq('evidence_id', evidenceId)
        .limit(1);
      if (error) {
        return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'evidence lookup failed');
      }
      evidenceRow = Array.isArray(data) && data[0];
      if (!evidenceRow) {
        return sendError(res, 404, ERROR_CODES.not_found, 'not found');
      }
      if (!anchorExposureId) anchorExposureId = evidenceRow.source_exposure_id || '';
    }
    if (!anchorExposureId && exceptionId) {
      const anchor = await resolveExposureAnchor(supabase, workspace.workspace_id, { exceptionId });
      if (anchor.error) {
        return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'anchor lookup failed');
      }
      anchorExposureId = anchor.exposureId || '';
    }
    if (!anchorExposureId) {
      return sendError(res, 400, ERROR_CODES.bad_request,
        'this draft kind needs a chain anchor: provide exposure_id, an exposure-born exception_id, or evidence_id');
    }
    const bundleResult = await loadEvidenceBundleForExposure(supabase, workspace, slug, anchorExposureId, generatedAt);
    if (bundleResult.error) {
      return sendError(res, 503, ERROR_CODES.vault_db_unavailable, bundleResult.error);
    }
    if (bundleResult.notFound) {
      return sendError(res, 404, ERROR_CODES.not_found, 'not found');
    }
    const bundle = bundleResult.bundle;

    if (draftKind === 'trust_record_summary') {
      draft = draftTrustRecordSummary(bundle);
    } else if (draftKind === 'missing_evidence_gap_summary') {
      draft = draftMissingEvidenceGapSummary(bundle);
    } else if (draftKind === 'citation_check_summary') {
      if (!evidenceRow) {
        return sendError(res, 400, ERROR_CODES.bad_request, 'citation_check_summary needs evidence_id');
      }
      draft = draftCitationCheckSummary(bundle, evidenceRow.evidence_id);
    } else {
      // remediation_evidence_suggestion: read-only scan for a later
      // same-component observation as the candidate.
      const { data: candRows, error: candError } = await supabase
        .from('component_exposures')
        .select('exposure_id, subject_name, metadata, first_seen_at')
        .eq('workspace_id', workspace.workspace_id)
        .eq('subject_name', bundle.subject.name)
        .neq('exposure_id', anchorExposureId)
        .order('first_seen_at', { ascending: false })
        .limit(10);
      if (candError) {
        return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'candidate scan failed');
      }
      const candidate = (Array.isArray(candRows) ? candRows : [])
        .map((r) => ({ exposure_id: r.exposure_id, observed_version: (r.metadata && r.metadata.version) || null, first_seen_at: r.first_seen_at }))
        .find((r) => r.observed_version && r.observed_version !== bundle.subject.observed_version) || null;
      const directedResolution = (bundle.sections.resolutions.resolutions || [])
        .filter((r) => r.outcome === 'remediation_required')
        .map((r) => r.resolution_id)
        .pop() || null;
      draft = draftRemediationEvidenceSuggestion(bundle, candidate, directedResolution);
    }
    related = {
      source_exposure_id: draft.related.source_exposure_id || anchorExposureId,
      exception_id: exceptionId || (evidenceRow && evidenceRow.exception_id) || null,
      related_resolution_id: draft.related.related_resolution_id || null,
      related_evidence_id: (evidenceRow && evidenceRow.evidence_id) || null,
    };
  }

  const { data: inserted, error: insertError } = await supabase
    .from('agent_evidence_drafts')
    .insert({
      workspace_id: workspace.workspace_id,
      source_exposure_id: related.source_exposure_id || null,
      exception_id: related.exception_id || null,
      related_resolution_id: related.related_resolution_id || null,
      related_evidence_id: related.related_evidence_id || null,
      related_check_id: null,
      draft_kind: draftKind,
      draft_status: 'drafted',
      generated_by_kind: 'agent',
      requested_by: req.vaultSession.user_id,
      draft_title: draft.title.slice(0, 200),
      draft_body: draft.body,
      suggested_fields: draft.suggestedFields,
      source_record_ids: draft.sourceRecordIds,
      non_claim: AGENT_DRAFT_NON_CLAIM,
      model_metadata: DRAFTER_METADATA,
    })
    .select(DRAFT_SELECT)
    .limit(1);
  if (insertError) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'agent draft insert failed');
  }
  const insertedRow = Array.isArray(inserted) && inserted[0];

  if (insertedRow) {
    await deliverWorkspaceWebhooks(supabase, {
      eventId: crypto.randomUUID(),
      eventType: 'agent_draft.created',
      workspace: { workspace_id: workspace.workspace_id, slug },
      occurredAt: insertedRow.created_at,
      actor: { github_login: req.vaultSession.github_login },
      recordIds: {
        draft_id: insertedRow.draft_id,
        exposure_id: related.source_exposure_id || undefined,
        exception_id: related.exception_id || undefined,
        evidence_id: related.related_evidence_id || undefined,
      },
      state: 'drafted',
      agentDraft: { draft_kind: draftKind, draft_status: 'drafted' },
    });
  }

  res.status(201).json(shapeDraftRow(insertedRow));
}

/** GET /api/vault/workspaces/:slug/agent-drafts — bounded, filterable. */
export async function handleListAgentDrafts(req, res) {
  const slug = (req.params && req.params.slug) || '';
  const resolved = await resolveWorkspaceForMember(req, res, slug);
  if (!resolved) return;
  const { workspace } = resolved;

  const statusFilter = typeof req.query?.status === 'string' ? req.query.status : '';
  if (statusFilter && !AGENT_DRAFT_STATUSES.includes(statusFilter)) {
    return sendError(res, 400, ERROR_CODES.bad_request, `status must be one of: ${AGENT_DRAFT_STATUSES.join(', ')}`);
  }
  const exceptionFilter = typeof req.query?.exception_id === 'string' ? req.query.exception_id : '';

  const supabase = vaultDb();
  let query = supabase
    .from('agent_evidence_drafts')
    .select(DRAFT_SELECT)
    .eq('workspace_id', workspace.workspace_id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (statusFilter) query = query.eq('draft_status', statusFilter);
  if (exceptionFilter) query = query.eq('exception_id', exceptionFilter);
  const { data, error } = await query;
  if (error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'agent draft list failed');
  }
  res.status(200).json({
    drafts: (Array.isArray(data) ? data : []).map(shapeDraftRow),
    non_claim: AGENT_DRAFT_NON_CLAIM,
    visibility: 'private',
  });
}

// The one-shot human decision: a guarded UPDATE that lands only on a
// row still in 'drafted'. Title/body are never touched. Approving a
// draft does NOT create evidence — recording evidence is the existing
// 16C lane, a separate human action.
async function decideDraft(req, res, decision) {
  const slug = (req.params && req.params.slug) || '';
  const draftId = (req.params && req.params.id) || '';
  const resolved = await resolveWorkspaceForMember(req, res, slug);
  if (!resolved) return;
  const { workspace, membership } = resolved;
  if (!requireRole(res, membership, 'member')) return;

  const supabase = vaultDb();
  const nowIso = new Date().toISOString();
  const stamp = decision === 'approved'
    ? { draft_status: 'approved', approved_by: req.vaultSession.user_id, approved_at: nowIso }
    : { draft_status: 'rejected', rejected_by: req.vaultSession.user_id, rejected_at: nowIso };
  const { data: updated, error: updateError } = await supabase
    .from('agent_evidence_drafts')
    .update(stamp)
    .eq('workspace_id', workspace.workspace_id)
    .eq('draft_id', draftId)
    .eq('draft_status', 'drafted')
    .select(DRAFT_SELECT)
    .limit(1);
  if (updateError) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'agent draft decision failed');
  }
  const row = Array.isArray(updated) && updated[0];
  if (!row) {
    const { data: existing, error: lookupError } = await supabase
      .from('agent_evidence_drafts')
      .select('draft_id, draft_status')
      .eq('workspace_id', workspace.workspace_id)
      .eq('draft_id', draftId)
      .limit(1);
    if (lookupError) {
      return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'agent draft lookup failed');
    }
    const found = Array.isArray(existing) && existing[0];
    if (!found) {
      return sendError(res, 404, ERROR_CODES.not_found, 'not found');
    }
    return sendError(res, 409, ERROR_CODES.exception_state_conflict,
      `draft is ${found.draft_status} — a human decision lands exactly once`);
  }

  await deliverWorkspaceWebhooks(supabase, {
    eventId: crypto.randomUUID(),
    eventType: decision === 'approved' ? 'agent_draft.approved' : 'agent_draft.rejected',
    workspace: { workspace_id: workspace.workspace_id, slug },
    occurredAt: nowIso,
    actor: { github_login: req.vaultSession.github_login },
    recordIds: {
      draft_id: draftId,
      exposure_id: row.source_exposure_id || undefined,
      exception_id: row.exception_id || undefined,
    },
    state: decision,
    agentDraft: { draft_kind: row.draft_kind, draft_status: decision },
  });

  res.status(200).json(shapeDraftRow(row));
}

/** POST .../agent-drafts/:id/approve — human approval, one-shot. */
export async function handleApproveAgentDraft(req, res) {
  return decideDraft(req, res, 'approved');
}

/** POST .../agent-drafts/:id/reject — human rejection, one-shot. */
export async function handleRejectAgentDraft(req, res) {
  return decideDraft(req, res, 'rejected');
}
