// OpenSoyce Trust Vault (PR-17B) — rollup evidence bundles.
//
// DOCTRINE:
//   A rollup is composition, not certification.
//   The rollup does not assert anything new about the world.
//   Per-chain evidence remains the source of truth.
//   Packet-level summaries preserve incomplete, awaiting, expired,
//   active, and evidence-recorded states honestly.
//   Honest edges scale up; they do not disappear into per-chain detail.
//
// The claim, exactly: 17B composes existing truth; it does not create
// new truth.
//
// Structurally enforced: this module performs READS ONLY, and every
// per-chain bundle is built by the SAME loadEvidenceBundleForExposure
// path the 17A single-chain export uses — per-chain logic exists exactly
// once. The packet adds counting, grouping, and formatting. It never
// adds facts, never collapses mixed states into a single verdict, and
// never maps to official SOC2 control IDs — the question map below
// speaks the internal Q1-Q7 language of the evidence map, nothing more.

import { vaultDb } from './db.js';
import { sendError, ERROR_CODES } from './errors.js';
import { resolveWorkspaceForMember } from './rbac.js';
import {
  loadEvidenceBundleForExposure,
  BUNDLE_DOES_NOT_PROVE,
} from './evidence-export.js';

export const EVIDENCE_PACKET_FORMAT = 'opensoyce-evidence-packet';
export const EVIDENCE_PACKET_VERSION = 1;

// Packet bounds (Scope I): no unbounded workspace dumps. A capped packet
// SAYS it was capped — silence about truncation would be a lie of
// omission.
export const MAX_PACKET_CHAINS = 10;
export const MAX_INVENTORY_ROWS = 100;
const MAX_WORKSPACE_SCAN = 200;

// Packet-level non-claims (Scope F). These travel with every packet, in
// JSON and Markdown both, so a packet separated from this module still
// carries its boundary.
export const PACKET_NON_CLAIMS = Object.freeze([
  'This packet is not a compliance certification.',
  'This packet does not prove the absence of vulnerabilities.',
  'This packet does not prove remediation unless human-cited evidence exists for that chain.',
  'OpenSoyce validates record presence and linkage, not real-world fix completion.',
  'Observation-only components may have no trust decision yet.',
  'A selected packet is not a complete release attestation unless the caller supplied a complete release/component set.',
]);

// The internal SOC2 evidence-question map (Scope D). Internal Q1-Q7
// language from docs/strategy/soc2-evidence-map.md ONLY — official
// CC-series control IDs are deliberately absent and require separate
// authorization. "May support review" is the strongest verb allowed.
const SOC2_QUESTION_MAP = Object.freeze([
  { question: 'Q1', asks: 'What open-source components are in use, and how do you know?', draws_on: 'observation records (chains + inventory) with source provenance' },
  { question: 'Q2', asks: 'How do you know the inventory is current, and how are repeats handled?', draws_on: 'first/last seen timestamps and seen counts on every observation' },
  { question: 'Q3', asks: 'How do you know a vulnerable component was observed?', draws_on: 'vulnerability/risk context sections, severity in the source vocabulary' },
  { question: 'Q3a', asks: 'What did the organization decide to do about observed risk?', draws_on: 'remediation question and remediation evidence sections' },
  { question: 'Q4', asks: 'How do you know risk acceptance was reviewed, and by whom?', draws_on: 'exception sections with reviewer identity and timestamps' },
  { question: 'Q5', asks: 'How do you prove accepted risk does not silently become permanent?', draws_on: 'expiry pressure and reviewer resolution sections' },
  { question: 'Q6', asks: 'Can you trace a decision back to the observation that prompted it?', draws_on: 'receipt trails and record ids in every chain' },
  { question: 'Q7', asks: 'What can you show an auditor or a customer security review?', draws_on: 'this packet and the per-chain bundles it composes' },
]);

// ---------------------------------------------------------------------------
// Pure composition (exported for deterministic tests — no I/O, no clock)
// ---------------------------------------------------------------------------

/**
 * Summarize one per-chain bundle (a 17A buildEvidenceBundle output) for
 * the packet. Pure extraction — every value below already exists in the
 * bundle; nothing is concluded.
 */
export function summarizeChainBundle(bundle) {
  const s = bundle.sections;
  const resolutions = s.resolutions.resolutions || [];
  // Per-exception pairing: an exception is "resolved" only when a
  // resolution CITES it — a resolution on exception A says nothing about
  // exception B. The packet's expired buckets count per exception so a
  // chain holding both a resolved and an unresolved expired exception
  // reports both, never just the happier one.
  const exceptionStates = (s.exceptions.exceptions || []).map((ex) => ({
    exception_id: ex.exception_id,
    state: ex.state,
    expires_at: ex.expires_at || null,
    resolved: resolutions.some((r) => r.exception_id === ex.exception_id),
  }));
  return {
    exposure_id: s.observation.exposure_id,
    subject: bundle.subject,
    observation_status: s.observation.status,
    // Decision-bearing is read FROM the bundle, in every selection mode:
    // the record links this exposure to a decision (CEI relationship
    // events), a question, or an exception. Discovered, never asserted —
    // a selected observation-only exposure stays labeled observation-only.
    decision_bearing: (s.receipts.cei_events || []).length > 0
      || (s.remediation_questions.questions || []).length > 0
      || exceptionStates.length > 0,
    intel_count: (s.vulnerability_context.intel || []).length,
    question_count: (s.remediation_questions.questions || []).length,
    exception_states: exceptionStates,
    resolution_directions: resolutions.map((r) => r.outcome),
    remediation_case_status: s.remediation_evidence.case_status,
    remediation_evidence_count: (s.remediation_evidence.evidence || []).length,
    expiry_pressure_present: s.expiry_pressure.present,
    missing: [...bundle.honest_edges.missing],
    chain_export_path: `/api/vault/workspaces/${encodeURIComponent(bundle.workspace.slug)}/exposures/${encodeURIComponent(s.observation.exposure_id)}/evidence-export`,
  };
}

/**
 * Assemble the evidence packet from already-built per-chain bundles and
 * an already-loaded observation inventory. Pure: same inputs, same
 * packet (generatedAt is passed in by the caller).
 *
 * input = {
 *   workspace: { slug, display_name? },
 *   selection: { mode, label, source_ref?, requested_exposure_ids? },
 *   chainBundles: [17A bundle, ...],
 *   observationInventory: [compact exposure rows],
 *   capNotes: { chains_capped, chains_total_eligible, inventory_capped, inventory_total_eligible },
 *   generatedAt: ISO string,
 * }
 */
export function buildEvidencePacket(input) {
  const {
    workspace, selection, chainBundles = [], observationInventory = [],
    capNotes = {}, generatedAt,
  } = input;

  const chains = chainBundles.map((b) => ({
    summary: summarizeChainBundle(b),
    bundle: b,
  }));

  // Packet-level state rollup (Scope E). Counts, not verdicts: the packet
  // makes mixed states visible and never collapses them into a single
  // color. The expired buckets count EXCEPTIONS, paired to the
  // resolutions that cite them — a chain holding both a resolved and an
  // unresolved expired exception contributes to both counts.
  const summaries = chains.map((c) => c.summary);
  const allExceptionStates = summaries.flatMap((c) => c.exception_states.map((e) => e.state));
  const allExpired = summaries.flatMap((c) => c.exception_states.filter((e) => e.state === 'expired'));
  const stateRollup = {
    chains_included: summaries.length,
    decision_bearing_chains: summaries.filter((c) => c.decision_bearing).length,
    observation_only_chains_selected: summaries.filter((c) => !c.decision_bearing).length,
    evidence_recorded: summaries.filter((c) => c.remediation_case_status === 'evidence_recorded').length,
    awaiting_evidence: summaries.filter((c) => c.remediation_case_status === 'awaiting_evidence').length,
    active_temporary_trust: summaries.filter((c) => c.exception_states.some((e) => e.state === 'active')).length,
    expired_exceptions_pending_review: allExpired.filter((e) => !e.resolved).length,
    expired_exceptions_resolved: allExpired.filter((e) => e.resolved).length,
    chains_with_missing_sections: summaries.filter((c) => c.missing.length > 0).length,
    observation_only_exposures: observationInventory.length,
    exception_states_observed: [...new Set(allExceptionStates)].sort(),
  };

  // Honest edges scale UP (Scope F): packet non-claims + the per-chain
  // gaps, named per chain — never averaged away.
  const chainGaps = summaries
    .filter((c) => c.missing.length > 0)
    .map((c) => ({
      exposure_id: c.exposure_id,
      subject: `${c.subject.kind} ${c.subject.name}${c.subject.observed_version ? `@${c.subject.observed_version}` : ''}`,
      missing: c.missing,
    }));
  const limitations = [];
  if (capNotes.scan_saturated) {
    limitations.push(`The workspace scan was bounded at the ${capNotes.scan_limit} most recently seen exposures — older exposures are not represented in this packet, and every "eligible" total below is a within-scan lower bound, not a workspace total.`);
  }
  if (capNotes.detection_saturated) {
    limitations.push('Decision-bearing detection scanned a bounded window of relationship records and saturated — some chains may be misfiled as observation-only in this packet. Generate selected packets with explicit exposure ids for definitive chains.');
  }
  if (capNotes.chains_capped) {
    limitations.push(`Chain detail was capped at ${MAX_PACKET_CHAINS} of ${capNotes.chains_total_eligible} eligible decision-bearing chains${capNotes.scan_saturated ? ' (within the scan window)' : ''} — this packet is a bounded view, not the complete set. The chains not included are listed below; generate a selected packet with those exposure ids to continue.`);
  }
  if (capNotes.inventory_capped) {
    limitations.push(`The observation inventory was capped at ${MAX_INVENTORY_ROWS} of ${capNotes.inventory_total_eligible} eligible rows${capNotes.scan_saturated ? ' (within the scan window)' : ''}.`);
  }
  if (Array.isArray(capNotes.unmatched_requested_ids) && capNotes.unmatched_requested_ids.length > 0) {
    limitations.push(`Requested exposure ids NOT present in this workspace's record (requested but not included): ${capNotes.unmatched_requested_ids.join(', ')} — this packet covers ${chains.length} of ${capNotes.unmatched_requested_ids.length + chains.length} requested components.`);
  }
  if (selection.mode !== 'workspace') {
    limitations.push('This is a selected-component packet: it covers only the components the caller selected, and completeness of that selection is the caller’s assertion, not OpenSoyce’s.');
  }
  const chainsNotIncluded = Array.isArray(capNotes.chains_not_included)
    ? capNotes.chains_not_included.map((c) => ({ ...c }))
    : [];

  return {
    format: EVIDENCE_PACKET_FORMAT,
    version: EVIDENCE_PACKET_VERSION,
    generated_at: generatedAt,
    visibility: 'private',
    workspace: {
      slug: workspace.slug,
      display_name: workspace.display_name || null,
    },
    selection: {
      mode: selection.mode,
      label: selection.label,
      source_ref: selection.source_ref || null,
      requested_exposure_ids: selection.requested_exposure_ids || null,
    },
    packet_scope: 'A composition of existing per-chain evidence bundles plus a compact observation inventory. Per-chain evidence remains the source of truth; this packet adds counting, grouping, and formatting — no new facts.',
    state_rollup: stateRollup,
    chains,
    observation_inventory: observationInventory,
    soc2_question_map: {
      note: 'Evidence relevant to internal SOC2 readiness questions, in the internal Q1-Q7 vocabulary of the OpenSoyce evidence map. This packet may support review. It does not map to official control IDs and is not a compliance certification.',
      questions: SOC2_QUESTION_MAP.map((q) => ({ ...q })),
    },
    honest_edges: {
      non_claims: [...PACKET_NON_CLAIMS],
      per_chain_non_claims: [...BUNDLE_DOES_NOT_PROVE],
      chain_gaps: chainGaps,
      limitations,
      chains_not_included: chainsNotIncluded,
    },
  };
}

// ---------------------------------------------------------------------------
// Markdown renderer (pure)
// ---------------------------------------------------------------------------

function subjectLabel(subject) {
  return `${subject.kind} \`${subject.name}\`${subject.observed_version ? `@\`${subject.observed_version}\`` : ''}`;
}

/**
 * Render the packet as a human-readable Markdown document. The renderer
 * adds formatting, never facts.
 */
export function renderEvidencePacketMarkdown(packet) {
  const lines = [];
  const r = packet.state_rollup;

  lines.push(`# Evidence packet — ${packet.selection.label}`);
  lines.push('');
  lines.push('> A rollup is composition, not certification.');
  lines.push('> Per-chain evidence remains the source of truth; this packet adds counting, grouping, and formatting — no new facts.');
  lines.push('');

  // 1. Executive summary
  lines.push('## 1. Executive summary');
  lines.push('');
  lines.push(`- Workspace: \`${packet.workspace.slug}\`${packet.workspace.display_name ? ` (${packet.workspace.display_name})` : ''}`);
  lines.push(`- Selection: ${packet.selection.label} (mode: ${packet.selection.mode}${packet.selection.source_ref ? `, source ref \`${packet.selection.source_ref}\`` : ''})`);
  if (packet.selection.requested_exposure_ids) {
    lines.push(`- Requested components: ${packet.selection.requested_exposure_ids.length} · included in this packet: ${packet.chains.length}${packet.selection.requested_exposure_ids.length !== packet.chains.length ? ' — the difference is named in the honest edges' : ''}`);
  }
  lines.push(`- Generated: ${packet.generated_at}`);
  lines.push(`- Scope: ${packet.packet_scope}`);
  lines.push(`- Visibility: ${packet.visibility}`);
  lines.push('');

  // 2. State rollup — mixed states, visible.
  lines.push('## 2. State rollup');
  lines.push('');
  lines.push(`- Chains included in full detail: ${r.chains_included}`);
  lines.push(`- Decision-bearing among them: ${r.decision_bearing_chains}${r.observation_only_chains_selected > 0 ? ` · observation-only (selected by the caller): ${r.observation_only_chains_selected}` : ''}`);
  lines.push(`- Remediation evidence recorded: ${r.evidence_recorded}`);
  lines.push(`- Awaiting remediation evidence: ${r.awaiting_evidence}`);
  lines.push(`- Active temporary trust: ${r.active_temporary_trust}`);
  lines.push(`- Expired exceptions pending reviewer resolution: ${r.expired_exceptions_pending_review}`);
  lines.push(`- Expired exceptions reviewer-resolved: ${r.expired_exceptions_resolved}`);
  lines.push(`- Chains with sections not present in the record: ${r.chains_with_missing_sections}`);
  lines.push(`- Observation-only exposures (inventory below): ${r.observation_only_exposures}`);
  lines.push('');
  lines.push('Mixed states are the honest shape of a live record. This packet reports them; it does not collapse them into a single verdict.');
  lines.push('');

  // 3. Chain summaries. The heading is neutral: a caller-selected
  // observation-only exposure renders in full detail but stays labeled
  // observation-only — the packet never asserts a decision relationship
  // the record does not contain.
  lines.push('## 3. Component trust chains');
  lines.push('');
  if (packet.chains.length === 0) {
    lines.push('No chains matched this selection.');
    lines.push('');
  }
  packet.chains.forEach((c, i) => {
    const s = c.summary;
    lines.push(`### 3.${i + 1} ${subjectLabel(s.subject)}${s.decision_bearing ? '' : ' (observation-only — no trust decision recorded)'}`);
    lines.push('');
    lines.push(`- Exposure: \`${s.exposure_id}\` · observation status: ${s.observation_status}`);
    lines.push(`- Vulnerability context records: ${s.intel_count} · remediation questions: ${s.question_count}`);
    if (s.exception_states.length > 0) {
      for (const ex of s.exception_states) {
        lines.push(`- Exception \`${ex.exception_id}\` — state: ${ex.state}${ex.expires_at ? ` · expires/expired: ${ex.expires_at}` : ''}${ex.state === 'expired' ? (ex.resolved ? ' · reviewer-resolved' : ' · pending reviewer resolution') : ''}`);
      }
    } else {
      lines.push('- Exceptions: none recorded');
    }
    if (s.resolution_directions.length > 0) {
      lines.push(`- Reviewer directions: ${s.resolution_directions.map((d) => `\`${d}\``).join(', ')}`);
    }
    lines.push(`- Remediation case: ${s.remediation_case_status}${s.remediation_evidence_count ? ` (${s.remediation_evidence_count} evidence record${s.remediation_evidence_count === 1 ? '' : 's'})` : ''}`);
    if (s.missing.length > 0) {
      lines.push(`- Not present in this chain's record: ${s.missing.length} section(s) — detailed in the honest edges below`);
    }
    lines.push(`- Full chain bundle: \`GET ${s.chain_export_path}\``);
    lines.push('');
  });

  // 4. Observation inventory
  lines.push('## 4. Observation-only inventory');
  lines.push('');
  if (packet.observation_inventory.length === 0) {
    lines.push('No observation-only exposures in this selection.');
  } else {
    lines.push('Observed components with no trust decision recorded yet. An observation is not a decision; absence of a decision is reported, not hidden.');
    lines.push('');
    for (const row of packet.observation_inventory) {
      lines.push(`- ${row.subject_kind} \`${row.subject_name}\`${row.observed_version ? `@\`${row.observed_version}\`` : ''} — status ${row.status} · source ${row.source_kind} · first seen ${row.first_seen_at} · last seen ${row.last_seen_at} · seen ×${row.seen_count} · exposure \`${row.exposure_id}\``);
    }
  }
  lines.push('');

  // 5. SOC2 evidence question map (internal vocabulary only)
  lines.push('## 5. SOC2 evidence question map');
  lines.push('');
  lines.push(packet.soc2_question_map.note);
  lines.push('');
  for (const q of packet.soc2_question_map.questions) {
    lines.push(`- **${q.question}** — ${q.asks}`);
    lines.push(`  - draws on: ${q.draws_on}`);
  }
  lines.push('');

  // 6. Honest edges — scaled up, never averaged away.
  lines.push('## 6. Honest edges');
  lines.push('');
  lines.push('Packet-level non-claims:');
  lines.push('');
  for (const n of packet.honest_edges.non_claims) lines.push(`- ${n}`);
  lines.push('');
  if (packet.honest_edges.limitations.length > 0) {
    lines.push('Packet limitations:');
    lines.push('');
    for (const l of packet.honest_edges.limitations) lines.push(`- ${l}`);
    lines.push('');
  }
  if (packet.honest_edges.chains_not_included.length > 0) {
    lines.push('Decision-bearing chains eligible but NOT included in full detail (generate a selected packet with these exposure ids to continue):');
    lines.push('');
    for (const c of packet.honest_edges.chains_not_included) {
      lines.push(`- ${c.subject_kind} \`${c.subject_name}\`${c.observed_version ? `@\`${c.observed_version}\`` : ''} — exposure \`${c.exposure_id}\``);
    }
    lines.push('');
  }
  if (packet.honest_edges.chain_gaps.length > 0) {
    lines.push('Per-chain sections not present in the record:');
    lines.push('');
    for (const g of packet.honest_edges.chain_gaps) {
      lines.push(`- ${g.subject} (\`${g.exposure_id}\`):`);
      for (const m of g.missing) lines.push(`  - ${m}`);
    }
    lines.push('');
  }
  lines.push('Per-chain non-claims (apply to every chain in this packet):');
  lines.push('');
  for (const n of packet.honest_edges.per_chain_non_claims) lines.push(`- ${n}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`Generated by OpenSoyce at ${packet.generated_at}. This packet is a faithful composition of private workspace records and is not a compliance certification.`);
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Read-only selection + assembly
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function shapeInventoryRow(row) {
  return {
    exposure_id: row.exposure_id,
    subject_kind: row.subject_kind,
    subject_name: row.subject_name,
    observed_version: (row.metadata && typeof row.metadata.version === 'string') ? row.metadata.version : null,
    status: row.status,
    source_kind: row.source_kind,
    first_seen_at: row.first_seen_at,
    last_seen_at: row.last_seen_at,
    seen_count: typeof row.seen_count === 'number' ? row.seen_count : 1,
  };
}

/**
 * GET /api/vault/workspaces/:slug/evidence-packet
 *
 * Query (all optional):
 *   exposure_ids=<uuid,uuid,...>  selected-component packet
 *   source_ref=<ref>              packet scoped to one ingest source ref
 *   (neither)                     workspace packet
 *
 * READ-ONLY: selection + per-chain loads + pure composition. The record
 * is unchanged by generating a packet. Private: session + workspace
 * membership; 404-on-non-member.
 */
export async function handleGetEvidencePacket(req, res) {
  const slug = (req.params && req.params.slug) || '';
  const resolved = await resolveWorkspaceForMember(req, res, slug);
  if (!resolved) return;
  const { workspace } = resolved;

  // Repeated query params parse to arrays — refuse rather than silently
  // widening a selected request into a whole-workspace packet.
  if ((req.query?.exposure_ids !== undefined && typeof req.query.exposure_ids !== 'string')
    || (req.query?.source_ref !== undefined && typeof req.query.source_ref !== 'string')) {
    return sendError(res, 400, ERROR_CODES.bad_request, 'exposure_ids and source_ref must each be provided at most once');
  }
  const rawIds = typeof req.query?.exposure_ids === 'string' ? req.query.exposure_ids : '';
  const sourceRef = typeof req.query?.source_ref === 'string' ? req.query.source_ref : '';
  const requestedIds = rawIds
    ? [...new Set(rawIds.split(',').map((s) => s.trim()).filter(Boolean))]
    : [];
  if (requestedIds.length > 0 && requestedIds.some((id) => !UUID_RE.test(id))) {
    return sendError(res, 400, ERROR_CODES.bad_request, 'exposure_ids must be a comma-separated list of UUIDs');
  }
  if (requestedIds.length > MAX_PACKET_CHAINS) {
    return sendError(res, 400, ERROR_CODES.bad_request,
      `a packet covers at most ${MAX_PACKET_CHAINS} chains in full detail — request fewer exposure_ids per packet`);
  }
  if (sourceRef.length > 512) {
    return sendError(res, 400, ERROR_CODES.bad_request, 'source_ref must be at most 512 characters');
  }

  const supabase = vaultDb();
  const generatedAt = new Date().toISOString();

  // Scan the candidate exposures for this selection. Bounded read,
  // newest activity first.
  let scanQuery = supabase
    .from('component_exposures')
    .select('exposure_id, subject_kind, subject_name, metadata, status, source_kind, source_ref, latest_source_ref, first_seen_at, last_seen_at, seen_count')
    .eq('workspace_id', workspace.workspace_id)
    .order('last_seen_at', { ascending: false })
    .limit(MAX_WORKSPACE_SCAN);
  if (requestedIds.length > 0) {
    scanQuery = scanQuery.in('exposure_id', requestedIds);
  } else if (sourceRef) {
    // PostgREST .or() values are double-quoted so a ref containing commas,
    // parens, or dots cannot split or terminate the filter expression.
    // Backslashes and quotes are escaped per PostgREST quoting rules.
    const quoted = `"${sourceRef.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    scanQuery = scanQuery.or(`source_ref.eq.${quoted},latest_source_ref.eq.${quoted}`);
  }
  const { data: scanRows, error: scanError } = await scanQuery;
  if (scanError) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'evidence packet: exposure scan failed');
  }
  const exposures = Array.isArray(scanRows) ? scanRows : [];
  if (requestedIds.length > 0 && exposures.length === 0) {
    return sendError(res, 404, ERROR_CODES.not_found, 'not found');
  }
  const exposureIds = exposures.map((e) => e.exposure_id);
  // Partially-resolved selections are DISCLOSED, never silently dropped:
  // requested ids the workspace record does not contain are named in the
  // packet's honest edges.
  const foundIds = new Set(exposureIds);
  const unmatchedRequestedIds = requestedIds.filter((id) => !foundIds.has(id));
  // Workspace/source-ref scans are bounded; a saturated scan means older
  // exposures exist beyond the window and the packet must say so.
  const scanSaturated = requestedIds.length === 0 && exposures.length === MAX_WORKSPACE_SCAN;

  // Decision-bearing detection (Scope B): an exposure is decision-bearing
  // when the record links it to a trust decision (a CEI relationship
  // event) or to a remediation question. Discovered from the records, not
  // asserted.
  const decisionBearing = new Set();
  let detectionSaturated = false;
  if (exposureIds.length > 0) {
    const { data: eventRows, error: eventError } = await supabase
      .from('component_exposure_events')
      .select('exposure_id')
      .eq('workspace_id', workspace.workspace_id)
      .in('exposure_id', exposureIds)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (eventError) {
      return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'evidence packet: event scan failed');
    }
    const events = Array.isArray(eventRows) ? eventRows : [];
    if (events.length === 1000) detectionSaturated = true;
    for (const row of events) decisionBearing.add(row.exposure_id);
    const { data: questionRows, error: questionError } = await supabase
      .from('component_remediation_questions')
      .select('source_exposure_id')
      .eq('workspace_id', workspace.workspace_id)
      .in('source_exposure_id', exposureIds)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (questionError) {
      return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'evidence packet: question scan failed');
    }
    const questions = Array.isArray(questionRows) ? questionRows : [];
    if (questions.length === 1000) detectionSaturated = true;
    for (const row of questions) decisionBearing.add(row.source_exposure_id);
  }

  // Selected mode: the caller chose these components — every selected
  // exposure gets full chain detail (an observation-only selection simply
  // produces a bundle whose sections say "not present"). Workspace /
  // source-ref mode: decision-bearing chains in full, the rest as
  // compact inventory.
  let chainExposures;
  let inventoryExposures;
  if (requestedIds.length > 0) {
    chainExposures = exposures;
    inventoryExposures = [];
  } else {
    chainExposures = exposures.filter((e) => decisionBearing.has(e.exposure_id));
    inventoryExposures = exposures.filter((e) => !decisionBearing.has(e.exposure_id));
  }

  const chainsTotalEligible = chainExposures.length;
  const chainsCapped = chainsTotalEligible > MAX_PACKET_CHAINS;
  // The decision-bearing chains that did NOT fit the cap are named (id +
  // subject) so the caller can continue from the packet itself — a cap
  // note that omits the dropped ids would not be actionable.
  const chainsNotIncluded = chainExposures.slice(MAX_PACKET_CHAINS).map((e) => ({
    exposure_id: e.exposure_id,
    subject_kind: e.subject_kind,
    subject_name: e.subject_name,
    observed_version: (e.metadata && typeof e.metadata.version === 'string') ? e.metadata.version : null,
  }));
  chainExposures = chainExposures.slice(0, MAX_PACKET_CHAINS);
  const inventoryTotalEligible = inventoryExposures.length;
  const inventoryCapped = inventoryTotalEligible > MAX_INVENTORY_ROWS;
  inventoryExposures = inventoryExposures.slice(0, MAX_INVENTORY_ROWS);

  // Build each chain through the SAME per-chain path as the 17A export.
  // Loads run concurrently (bounded by MAX_PACKET_CHAINS = 10) so the
  // packet's serial round-trip count stays inside the serverless window.
  const chainResults = await Promise.all(chainExposures.map(
    (exposure) => loadEvidenceBundleForExposure(supabase, workspace, slug, exposure.exposure_id, generatedAt),
  ));
  const loadError = chainResults.find((r) => r.error);
  if (loadError) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, loadError.error);
  }
  const chainBundles = chainResults.filter((r) => r.bundle).map((r) => r.bundle);

  const selection = requestedIds.length > 0
    ? { mode: 'selected-exposures', label: 'Selected component packet', requested_exposure_ids: requestedIds }
    : sourceRef
      ? { mode: 'source-ref', label: 'Selected component packet', source_ref: sourceRef }
      : { mode: 'workspace', label: 'Workspace evidence packet' };

  const packet = buildEvidencePacket({
    workspace: { slug, display_name: workspace.display_name || null },
    selection,
    chainBundles,
    observationInventory: inventoryExposures.map(shapeInventoryRow),
    capNotes: {
      chains_capped: chainsCapped,
      chains_total_eligible: chainsTotalEligible,
      chains_not_included: chainsNotIncluded,
      inventory_capped: inventoryCapped,
      inventory_total_eligible: inventoryTotalEligible,
      scan_saturated: scanSaturated,
      scan_limit: MAX_WORKSPACE_SCAN,
      detection_saturated: detectionSaturated,
      unmatched_requested_ids: unmatchedRequestedIds,
    },
    generatedAt,
  });

  res.status(200).json({
    packet,
    markdown: renderEvidencePacketMarkdown(packet),
    visibility: 'private',
  });
}
