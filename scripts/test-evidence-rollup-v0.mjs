#!/usr/bin/env node
/**
 * PR-17B invariants for rollup evidence bundles.
 *
 * DOCTRINE:
 *   A rollup is composition, not certification.
 *   The rollup does not assert anything new about the world.
 *   Per-chain evidence remains the source of truth.
 *   Packet-level summaries preserve mixed states honestly.
 *   Honest edges scale up; they do not disappear into per-chain detail.
 *
 * The claim, exactly: 17B composes existing truth; it does not create
 * new truth.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEvidenceBundle } from '../src/server/vault/evidence-export.js';
import {
  buildEvidencePacket,
  renderEvidencePacketMarkdown,
  summarizeChainBundle,
  PACKET_NON_CLAIMS,
  MAX_PACKET_CHAINS,
} from '../src/server/vault/evidence-rollup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
const pending = [];

function test(name, fn) {
  pending.push(async () => {
    try {
      await fn();
      console.log(`PASS  ${name}`);
      passed += 1;
    } catch (e) {
      console.log(`FAIL  ${name} -- ${e.message}`);
      failed += 1;
    }
  });
}
function ok(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

function stripJsComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('//');
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join('\n');
}

const MODULE = 'src/server/vault/evidence-rollup.js';
const ROUTES = 'src/server/vault/evidence-rollup-routes.js';
const UI = 'src/pages/vault/VaultWorkspace.tsx';

const GENERATED_AT = '2026-06-12T12:00:00.000Z';

// ---------------------------------------------------------------------------
// Fixtures: three chains in three different honest states + inventory.
// Each chain bundle is built by the REAL per-chain builder — the packet
// composes actual 17A outputs, exactly as production does.
// ---------------------------------------------------------------------------

function chainRecords({ n, name, exceptionState, withDirection, withEvidence, expiresAt }) {
  const exceptionId = `d${n}555555-5555-5555-5555-555555555555`;
  return {
    workspace: { slug: 'acme', display_name: 'Acme Corp' },
    exposure: {
      exposure_id: `e${n}111111-1111-1111-1111-111111111111`,
      exposure_type: 'dependency-exposure',
      subject_kind: 'package',
      subject_name: name,
      status: 'observed',
      source_kind: 'cli',
      source_ref: 'deps.json',
      latest_source_ref: null,
      first_seen_at: '2026-06-01T00:00:00.000Z',
      last_seen_at: '2026-06-10T00:00:00.000Z',
      seen_count: 1,
      trust_boundary: {},
      metadata: { version: '1.0.0' },
    },
    intel: [],
    questions: [],
    ceiEvents: [],
    exceptions: [{
      exception_id: exceptionId,
      subject_kind: 'package',
      subject_name: name,
      state: exceptionState,
      original_action: 'BLOCK',
      allowed_action: 'WARN',
      proposed_by: 'u1',
      proposed_at: '2026-06-04T00:00:00.000Z',
      reviewed_by: 'u2',
      reviewed_at: '2026-06-05T00:00:00.000Z',
      expires_at: expiresAt,
      reason_public: 'temporary',
      revoked_at: null,
      proof_anchors: [],
    }],
    resolutions: withDirection ? [{
      resolution_id: `f${n}777777-7777-7777-7777-777777777777`,
      exception_id: exceptionId,
      outcome: 'remediation_required',
      resolved_by: { user_id: 'u2', github_login: 'reviewer', display_name: null },
      reason_public: 'upgrade required',
      renewed_exception_id: null,
      linked_question_id: null,
      created_at: '2026-06-09T00:00:00.000Z',
    }] : [],
    remediationEvidence: withEvidence ? [{
      evidence_id: `a${n}999999-9999-9999-9999-999999999999`,
      exception_id: exceptionId,
      evidence_type: 'fixed_version_observed',
      evidence_ref: `${name}@2.0.0 observed`,
      recorded_by: { user_id: 'u3', github_login: 'closer', display_name: null },
      reason_public: 'Upgrade landed.',
      related_resolution_id: `f${n}777777-7777-7777-7777-777777777777`,
      related_question_id: null,
      source_vuln_intel_id: null,
      created_at: '2026-06-10T12:00:00.000Z',
    }] : [],
    timelineEvents: [],
    generatedAt: GENERATED_AT,
  };
}

function mixedPacketInput() {
  const chainBundles = [
    // evidence_recorded: expired + direction + evidence
    buildEvidenceBundle(chainRecords({ n: 1, name: 'left-pad', exceptionState: 'expired', withDirection: true, withEvidence: true, expiresAt: '2026-06-08T00:00:00.000Z' })),
    // awaiting_evidence: expired + direction, no evidence
    buildEvidenceBundle(chainRecords({ n: 2, name: 'right-pad', exceptionState: 'expired', withDirection: true, withEvidence: false, expiresAt: '2026-06-08T00:00:00.000Z' })),
    // active temporary trust: no direction, no evidence
    buildEvidenceBundle(chainRecords({ n: 3, name: 'mid-pad', exceptionState: 'active', withDirection: false, withEvidence: false, expiresAt: '2026-07-10T00:00:00.000Z' })),
  ];
  const observationInventory = [
    {
      exposure_id: 'ab111111-2222-3333-4444-555555555555',
      subject_kind: 'package',
      subject_name: 'observed-only',
      observed_version: '3.0.0',
      status: 'observed',
      source_kind: 'cli',
      first_seen_at: '2026-06-02T00:00:00.000Z',
      last_seen_at: '2026-06-11T00:00:00.000Z',
      seen_count: 2,
    },
  ];
  return {
    workspace: { slug: 'acme', display_name: 'Acme Corp' },
    selection: { mode: 'workspace', label: 'Workspace evidence packet' },
    chainBundles,
    observationInventory,
    capNotes: { chains_capped: false, chains_total_eligible: 3, inventory_capped: false, inventory_total_eligible: 1 },
    generatedAt: GENERATED_AT,
  };
}

// ---------------------------------------------------------------------------
// Composition, not creation
// ---------------------------------------------------------------------------

test('rollup includes decision-bearing chains in detail (PR-17B)', () => {
  const packet = buildEvidencePacket(mixedPacketInput());
  ok(packet.chains.length === 3, 'all three chains composed');
  ok(packet.chains.every((c) => c.bundle && c.bundle.format === 'opensoyce-evidence-bundle'),
    'each chain carries its full per-chain bundle — per-chain evidence remains the source of truth');
  const md = renderEvidencePacketMarkdown(packet);
  ok(/### 3\.1 package `left-pad`/.test(md) && /### 3\.3 package `mid-pad`/.test(md),
    'each chain renders its own summary section');
  ok(/Full chain bundle: `GET \/api\/vault\/workspaces\/acme\/exposures\/e1111111/.test(md),
    'each chain links its underlying per-chain export');
});

test('observation-only exposures appear as compact inventory, not full chains (PR-17B)', () => {
  const packet = buildEvidencePacket(mixedPacketInput());
  ok(packet.observation_inventory.length === 1, 'inventory carried');
  ok(packet.state_rollup.observation_only_exposures === 1, 'rollup counts the inventory');
  const md = renderEvidencePacketMarkdown(packet);
  ok(/## 4\. Observation-only inventory/.test(md), 'inventory section renders');
  ok(/`observed-only`@`3\.0\.0` — status observed/.test(md), 'compact row with identity + provenance');
  ok(!/### \d+\.\d+ package `observed-only`/.test(md),
    'an observation-only exposure must NOT render as a full chain section');
  ok(/An observation is not a decision/.test(md), 'the inventory states its own honest framing');
});

test('packet state rollup counts mixed states correctly and never collapses them (PR-17B)', () => {
  const packet = buildEvidencePacket(mixedPacketInput());
  const r = packet.state_rollup;
  ok(r.chains_included === 3, `3 chains, found ${r.chains_included}`);
  ok(r.decision_bearing_chains === 3, `3 decision-bearing, found ${r.decision_bearing_chains}`);
  ok(r.evidence_recorded === 1, `1 evidence_recorded, found ${r.evidence_recorded}`);
  ok(r.awaiting_evidence === 1, `1 awaiting_evidence, found ${r.awaiting_evidence}`);
  ok(r.active_temporary_trust === 1, `1 active, found ${r.active_temporary_trust}`);
  ok(r.expired_exceptions_resolved === 2, `2 expired exceptions carry resolutions, found ${r.expired_exceptions_resolved}`);
  ok(r.expired_exceptions_pending_review === 0, 'no expired exception is unresolved in this fixture');
  ok(JSON.stringify(r.exception_states_observed) === JSON.stringify(['active', 'expired']),
    'the distinct states observed are listed, not flattened');
  const md = renderEvidencePacketMarkdown(packet);
  ok(/Active temporary trust: 1/.test(md) && /Awaiting remediation evidence: 1/.test(md)
    && /Remediation evidence recorded: 1/.test(md),
    'markdown reports each state count');
  ok(/does not collapse them into a single verdict/.test(md),
    'the packet states the no-collapse rule itself');
  ok(!/\b(green|yellow|red)\b/i.test(md), 'no traffic-light verdict vocabulary');
});

test('expired buckets pair per-exception: a chain with both resolved and unresolved expired exceptions reports both (PR-17B)', () => {
  // One chain, two expired exceptions: A resolved, B unresolved. The
  // packet must count A in resolved AND B in pending — never just the
  // happier one (the adversarial-review finding).
  const records = chainRecords({ n: 1, name: 'two-pad', exceptionState: 'expired', withDirection: false, withEvidence: false, expiresAt: '2026-06-08T00:00:00.000Z' });
  records.exceptions = [
    { exception_id: 'da000000-0000-0000-0000-00000000000a', subject_kind: 'package', subject_name: 'two-pad', state: 'expired', original_action: 'BLOCK', allowed_action: 'WARN', proposed_by: 'u1', proposed_at: '2026-06-04T00:00:00.000Z', reviewed_by: 'u2', reviewed_at: '2026-06-05T00:00:00.000Z', expires_at: '2026-06-08T00:00:00.000Z', reason_public: 'a', revoked_at: null, proof_anchors: [] },
    { exception_id: 'db000000-0000-0000-0000-00000000000b', subject_kind: 'package', subject_name: 'two-pad', state: 'expired', original_action: 'BLOCK', allowed_action: 'WARN', proposed_by: 'u1', proposed_at: '2026-06-04T00:00:00.000Z', reviewed_by: 'u2', reviewed_at: '2026-06-05T00:00:00.000Z', expires_at: '2026-06-09T00:00:00.000Z', reason_public: 'b', revoked_at: null, proof_anchors: [] },
  ];
  records.resolutions = [
    { resolution_id: 'fa000000-0000-0000-0000-00000000000a', exception_id: 'da000000-0000-0000-0000-00000000000a', outcome: 'revoke', resolved_by: { user_id: 'u2', github_login: 'rev', display_name: null }, reason_public: 'done', renewed_exception_id: null, linked_question_id: null, created_at: '2026-06-10T00:00:00.000Z' },
  ];
  const input = mixedPacketInput();
  input.chainBundles = [buildEvidenceBundle(records)];
  const packet = buildEvidencePacket(input);
  const r = packet.state_rollup;
  ok(r.expired_exceptions_resolved === 1, `exception A resolved, found ${r.expired_exceptions_resolved}`);
  ok(r.expired_exceptions_pending_review === 1, `exception B still pending must NOT vanish, found ${r.expired_exceptions_pending_review}`);
  const md = renderEvidencePacketMarkdown(packet);
  ok(/pending reviewer resolution/.test(md), 'the unresolved expired exception is named in the chain detail');
});

test('selected observation-only exposure stays labeled observation-only, never asserted as a decision (PR-17B)', () => {
  // An exposure with NO exceptions, NO questions, NO cei events — built
  // as a full chain because the caller selected it, but the packet must
  // NOT claim it is decision-bearing (the doctrine finding).
  const records = chainRecords({ n: 9, name: 'obs-only', exceptionState: 'expired', withDirection: false, withEvidence: false, expiresAt: null });
  records.exceptions = [];
  records.resolutions = [];
  const input = mixedPacketInput();
  input.selection = { mode: 'selected-exposures', label: 'Selected component packet', requested_exposure_ids: ['e9111111-1111-1111-1111-111111111111'] };
  input.chainBundles = [buildEvidenceBundle(records)];
  input.observationInventory = [];
  const packet = buildEvidencePacket(input);
  ok(packet.state_rollup.chains_included === 1, 'the selected exposure is included in full detail');
  ok(packet.state_rollup.decision_bearing_chains === 0,
    'a selected exposure with no decision in the record must NOT be counted decision-bearing');
  ok(packet.state_rollup.observation_only_chains_selected === 1,
    'it is counted as an observation-only chain the caller selected');
  const md = renderEvidencePacketMarkdown(packet);
  ok(/observation-only — no trust decision recorded/.test(md),
    'the chain heading must mark it observation-only');
  ok(!/## 3\. Decision-bearing chains/.test(md), 'the section heading must be neutral, not "Decision-bearing chains"');
  ok(/## 3\. Component trust chains/.test(md), 'the neutral section heading is used');
});

test('rollup works when some chains have remediation evidence and others do not (PR-17B)', () => {
  const packet = buildEvidencePacket(mixedPacketInput());
  const statuses = packet.chains.map((c) => c.summary.remediation_case_status);
  ok(statuses.includes('evidence_recorded') && statuses.includes('awaiting_evidence')
    && statuses.includes('no_remediation_direction'),
    `all three case states must coexist in one packet, found ${JSON.stringify(statuses)}`);
});

// ---------------------------------------------------------------------------
// Honest edges scale up
// ---------------------------------------------------------------------------

test('per-chain honest edges roll up into packet honest edges, named per chain (PR-17B)', () => {
  const packet = buildEvidencePacket(mixedPacketInput());
  ok(packet.honest_edges.chain_gaps.length === 3,
    'every chain with missing sections appears in the packet gaps');
  const awaiting = packet.honest_edges.chain_gaps.find((g) => /right-pad/.test(g.subject));
  ok(awaiting && awaiting.missing.some((m) => /remediation evidence/.test(m)),
    'the awaiting-evidence chain gap must surface in the packet');
  for (const claim of PACKET_NON_CLAIMS) {
    ok(packet.honest_edges.non_claims.includes(claim), `packet must carry non-claim: ${claim}`);
  }
  const md = renderEvidencePacketMarkdown(packet);
  ok(/Per-chain sections not present in the record:/.test(md), 'gaps render in markdown');
  ok(/This packet is not a compliance certification\./.test(md), 'packet non-claims render');
  ok(/does not prove remediation unless human-cited evidence exists/.test(md),
    'the remediation non-claim renders');
});

test('packet caps are respected, named with totals, and overflow chains are listed (PR-17B)', () => {
  const input = mixedPacketInput();
  input.capNotes = {
    chains_capped: true,
    chains_total_eligible: 23,
    chains_not_included: [{ exposure_id: 'ef000000-0000-0000-0000-000000000011', subject_kind: 'package', subject_name: 'dropped-pad', observed_version: '9.9.9' }],
    inventory_capped: true,
    inventory_total_eligible: 250,
  };
  const packet = buildEvidencePacket(input);
  ok(packet.honest_edges.limitations.some((l) => new RegExp(`capped at ${MAX_PACKET_CHAINS} of 23`).test(l)),
    'chain cap must be stated with the eligible total');
  ok(packet.honest_edges.limitations.some((l) => /inventory was capped/.test(l)),
    'inventory cap must be stated');
  ok(packet.honest_edges.chains_not_included.length === 1, 'overflow chains must be carried');
  const md = renderEvidencePacketMarkdown(packet);
  ok(/bounded view, not the complete set/.test(md), 'the cap note must reach the document');
  ok(/`dropped-pad`@`9\.9\.9` — exposure `ef000000/.test(md),
    'the overflow chain id+subject must be named so the caller can continue');
  // The handler also enforces the cap structurally.
  const src = stripJsComments(read(MODULE));
  ok(/slice\(0, MAX_PACKET_CHAINS\)/.test(src), 'handler must slice chains to the cap');
  ok(/slice\(MAX_PACKET_CHAINS\)/.test(src), 'handler must capture the overflow chains');
  ok(/slice\(0, MAX_INVENTORY_ROWS\)/.test(src), 'handler must slice inventory to the cap');
  ok(/requestedIds\.length > MAX_PACKET_CHAINS/.test(src), 'selected mode must refuse over-cap requests');
});

test('a saturated workspace scan is disclosed, not silent (PR-17B)', () => {
  const input = mixedPacketInput();
  input.capNotes = { chains_capped: false, chains_total_eligible: 3, inventory_capped: false, inventory_total_eligible: 1, scan_saturated: true, scan_limit: 200 };
  const packet = buildEvidencePacket(input);
  ok(packet.honest_edges.limitations.some((l) => /bounded at the 200 most recently seen/.test(l) && /within-scan lower bound/.test(l)),
    'scan saturation must be stated, and totals flagged as within-scan lower bounds');
  // The handler detects saturation.
  const src = stripJsComments(read(MODULE));
  ok(/exposures\.length === MAX_WORKSPACE_SCAN/.test(src), 'handler must detect scan saturation');
});

test('partially-resolved selection names the unmatched requested ids (PR-17B)', () => {
  const input = mixedPacketInput();
  input.selection = { mode: 'selected-exposures', label: 'Selected component packet', requested_exposure_ids: ['e1111111-1111-1111-1111-111111111111', 'eeee0000-0000-0000-0000-00000000dead'] };
  input.capNotes = { chains_capped: false, chains_total_eligible: 1, inventory_capped: false, inventory_total_eligible: 0, unmatched_requested_ids: ['eeee0000-0000-0000-0000-00000000dead'] };
  input.chainBundles = [input.chainBundles[0]];
  const packet = buildEvidencePacket(input);
  ok(packet.honest_edges.limitations.some((l) => /requested but not included/.test(l) && /eeee0000-0000-0000-0000-00000000dead/.test(l)),
    'unmatched requested ids must be named in the honest edges');
  const src = stripJsComments(read(MODULE));
  ok(/unmatchedRequestedIds/.test(src), 'handler must compute unmatched requested ids');
  ok(/typeof req\.query\.exposure_ids !== 'string'/.test(src) || /typeof req\.query\?\.exposure_ids !== 'string'/.test(src),
    'handler must refuse array-valued exposure_ids (repeated param scope-widening)');
});

test('selected packet carries the caller-selection non-claim (PR-17B)', () => {
  const input = mixedPacketInput();
  input.selection = { mode: 'selected-exposures', label: 'Selected component packet', requested_exposure_ids: ['e1111111-1111-1111-1111-111111111111'] };
  const packet = buildEvidencePacket(input);
  ok(packet.honest_edges.limitations.some((l) => /completeness of that selection is the caller/.test(l)),
    'selected packets must state that selection completeness is the caller assertion');
  ok(packet.selection.label === 'Selected component packet', 'the allowed label is used');
});

// ---------------------------------------------------------------------------
// SOC2 question map: internal vocabulary only
// ---------------------------------------------------------------------------

test('SOC2 question map speaks internal Q1-Q7 language, never control certification (PR-17B)', () => {
  const packet = buildEvidencePacket(mixedPacketInput());
  const qm = packet.soc2_question_map;
  ok(/internal Q1-Q7 vocabulary/.test(qm.note) && /may support review/.test(qm.note),
    'the map note must carry the allowed language');
  ok(/not a compliance certification/.test(qm.note), 'the map note must disclaim certification');
  const ids = qm.questions.map((q) => q.question);
  ok(JSON.stringify(ids) === JSON.stringify(['Q1', 'Q2', 'Q3', 'Q3a', 'Q4', 'Q5', 'Q6', 'Q7']),
    `internal question ids only, found ${JSON.stringify(ids)}`);
  const src = read(MODULE);
  ok(!/CC\d/.test(src), 'no official CC-series control IDs anywhere in the module');
  ok(!/SOC ?2 compliant/i.test(src), 'no compliance claim in the module');
  ok(!/auditor[- ]approved/i.test(src), 'no auditor-approved claim');
  const md = renderEvidencePacketMarkdown(packet);
  ok(/## 5\. SOC2 evidence question map/.test(md), 'the map renders as its own section');
  ok(!/CC\d/.test(md), 'no control IDs reach the document');
});

// ---------------------------------------------------------------------------
// No banned certification language; no new truth
// ---------------------------------------------------------------------------

test('no banned certification language in rollup module or UI (PR-17B)', () => {
  const moduleSrc = read(MODULE);
  const ui = read(UI);
  for (const banned of ['Certified release', 'Approved release', 'Release attestation:', 'Compliance report', 'Certified report', 'Verified release']) {
    ok(!moduleSrc.includes(banned), `module must not say "${banned}"`);
    ok(!ui.includes(banned), `UI must not say "${banned}"`);
  }
  ok(/Selected component packet/.test(moduleSrc), 'the allowed selected-packet label is used');
  ok(/Evidence packet/.test(ui), 'the UI uses the allowed "Evidence packet" label');
  ok(/Generate workspace evidence packet/.test(ui), 'the workspace action uses the allowed label');
  ok(/certifies nothing/i.test(ui), 'UI copy carries the non-claim');
});

test('rollup module is read-only and reuses the single per-chain path (PR-17B)', () => {
  const src = stripJsComments(read(MODULE));
  ok(!/\.(insert|update|upsert|delete)\(/.test(src), 'zero write verbs — composition changes nothing');
  ok(!/\.rpc\(/.test(src), 'no RPC');
  ok(/loadEvidenceBundleForExposure/.test(src),
    'chains must be built by the SAME loader as the 17A single-chain export');
  // The module may scan for selection (exposures, events, questions) but
  // must never re-implement the per-chain detail loads.
  ok(!/from\(['"]component_exposure_vulnerabilities['"]\)/.test(src),
    'intel loading belongs to the per-chain path, not the rollup');
  ok(!/from\(['"]vault_exceptions['"]\)/.test(src),
    'exception loading belongs to the per-chain path, not the rollup');
  ok(!/from\(['"]vault_exception_resolutions['"]\)/.test(src),
    'resolution loading belongs to the per-chain path, not the rollup');
  ok(!/from\(['"]component_remediation_evidence['"]\)/.test(src),
    'evidence loading belongs to the per-chain path, not the rollup');
  ok(/resolveWorkspaceForMember/.test(src), 'membership-gated');
  const summarySrc = stripJsComments(read(MODULE));
  ok(/summarizeChainBundle/.test(summarySrc), 'summaries are pure extraction from bundles');
});

// ---------------------------------------------------------------------------
// Routes, client, guard, wiring
// ---------------------------------------------------------------------------

test('packet route: own registrar, GET-only, session-gated, vault-prefixed (PR-17B)', () => {
  const routes = read(ROUTES);
  const getBlock = routes.match(/app\.get\(\s*'\/api\/vault\/workspaces\/:slug\/evidence-packet'[\s\S]*?\);/);
  ok(getBlock, 'GET evidence-packet route must be registered');
  ok(/requireVaultSession/.test(getBlock[0]), 'packet must require a vault session — no public surface');
  ok(!/app\.(post|patch|delete|put)\(/.test(routes), 'no mutating verb in the packet lane');
  const literals = [...routes.matchAll(/'(\/api\/[^']+)'/g)].map((m) => m[1]);
  ok(literals.length === 1 && literals[0].startsWith('/api/vault/'), 'one literal, private prefix');
  const vaultRoutes = read('src/server/vault/routes.js');
  ok(/registerEvidenceRollupRoutes/.test(vaultRoutes), 'mounted from the single private route table');
  ok(!/evidence-packet'/.test(vaultRoutes), 'routes.js must not carry the new literal (snapshot invariant)');
});

test('api-client packet helper: GET only (PR-17B)', () => {
  const api = read('src/shared/vault/api-client.ts');
  const block = api.match(/export async function getEvidencePacket[\s\S]*?\n}/);
  ok(block, 'getEvidencePacket not found');
  ok(/\/evidence-packet/.test(block[0]), 'helper targets the packet path');
  ok(!/method:/.test(block[0]), 'helper must be a plain GET');
  ok(/export interface EvidencePacket\b/.test(api), 'EvidencePacket type exported');
  ok(/state_rollup/.test(api) && /honest_edges/.test(api), 'rollup + honest edges travel in the type');
});

test('release-integrity guard knows the packet route family (PR-17B)', () => {
  const guard = read('scripts/check-release-integrity.mjs');
  ok(/evidence-rollup-routes\.js/.test(guard), 'literal scan must include the rollup registrar');
  ok(/__guard__\/evidence-packet/.test(guard), 'runtime layer must probe the packet route');
});

test('package.json wires test:evidence-rollup-v0 into test:ci (PR-17B)', () => {
  const pkg = JSON.parse(read('package.json'));
  ok(pkg.scripts['test:evidence-rollup-v0'], 'missing test:evidence-rollup-v0 script');
  ok(/test-evidence-rollup-v0\.mjs/.test(pkg.scripts['test:ci'] || ''),
    'test:ci must chain scripts/test-evidence-rollup-v0.mjs');
});

(async () => {
  for (const fn of pending) await fn();
  console.log(`\nEvidence rollup v0 tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
