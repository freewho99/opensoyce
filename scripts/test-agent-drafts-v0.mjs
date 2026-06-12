#!/usr/bin/env node
/**
 * PR-18A invariants for the Trust Agent evidence drafter.
 *
 * DOCTRINE:
 *   The agent drafts. The human decides.
 *   Drafts are records. Approval is a separate human action.
 *   The record remembers both the draft and the approval.
 *   Agent output is not evidence until a human records or approves it
 *   as evidence.
 *   The agent must not certify, verify, or declare a fix.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEvidenceBundle } from '../src/server/vault/evidence-export.js';
import { buildEvidencePacket } from '../src/server/vault/evidence-rollup.js';
import {
  draftTrustRecordSummary,
  draftEvidencePacketSummary,
  draftMissingEvidenceGapSummary,
  draftCitationCheckSummary,
  draftRemediationEvidenceSuggestion,
  AGENT_DRAFT_KINDS,
  AGENT_DRAFT_STATUSES,
  AGENT_DRAFT_NON_CLAIM,
} from '../src/server/vault/agent-drafts.js';
import { buildWebhookPayload } from '../src/server/vault/webhooks.js';

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

function readSqlNoComments(rel) {
  return read(rel)
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('--');
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join('\n');
}

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

const MIGRATION = 'supabase/migrations/0029_agent_evidence_drafts.sql';
const MODULE = 'src/server/vault/agent-drafts.js';
const ROUTES = 'src/server/vault/agent-draft-routes.js';
const UI = 'src/pages/vault/VaultExceptionDetail.tsx';

// ---------------------------------------------------------------------------
// Fixture: a full chain bundle (direction + evidence + check) and a packet.
// ---------------------------------------------------------------------------

function chainRecords() {
  return {
    workspace: { slug: 'acme', display_name: 'Acme Corp' },
    exposure: {
      exposure_id: 'e1111111-1111-1111-1111-111111111111',
      exposure_type: 'dependency-exposure',
      subject_kind: 'package',
      subject_name: 'left-pad',
      status: 'observed',
      source_kind: 'cli',
      source_ref: 'deps.json',
      latest_source_ref: null,
      first_seen_at: '2026-06-01T00:00:00.000Z',
      last_seen_at: '2026-06-10T00:00:00.000Z',
      seen_count: 1,
      trust_boundary: {},
      metadata: { version: '1.3.0' },
    },
    intel: [],
    questions: [],
    ceiEvents: [],
    exceptions: [{
      exception_id: 'd5555555-5555-5555-5555-555555555555',
      subject_kind: 'package',
      subject_name: 'left-pad',
      state: 'expired',
      original_action: 'BLOCK',
      allowed_action: 'WARN',
      proposed_by: 'u1',
      proposed_at: '2026-06-04T00:00:00.000Z',
      reviewed_by: 'u2',
      reviewed_at: '2026-06-05T00:00:00.000Z',
      expires_at: '2026-06-08T00:00:00.000Z',
      reason_public: 'temporary',
      revoked_at: null,
      proof_anchors: [],
    }],
    resolutions: [{
      resolution_id: 'f7777777-7777-7777-7777-777777777777',
      exception_id: 'd5555555-5555-5555-5555-555555555555',
      outcome: 'remediation_required',
      resolved_by: { user_id: 'u2', github_login: 'reviewer', display_name: null },
      reason_public: 'upgrade required',
      renewed_exception_id: null,
      linked_question_id: null,
      created_at: '2026-06-09T00:00:00.000Z',
    }],
    remediationEvidence: [{
      evidence_id: 'aa999999-9999-9999-9999-999999999999',
      exception_id: 'd5555555-5555-5555-5555-555555555555',
      evidence_type: 'fixed_version_observed',
      evidence_ref: 'left-pad@2.0.0 observed (exposure e2222222-2222-2222-2222-222222222222)',
      recorded_by: { user_id: 'u3', github_login: 'closer', display_name: null },
      reason_public: 'Upgrade landed.',
      related_resolution_id: 'f7777777-7777-7777-7777-777777777777',
      related_question_id: null,
      source_vuln_intel_id: null,
      created_at: '2026-06-10T12:00:00.000Z',
    }],
    verificationChecks: [{
      check_id: 'cc000000-0000-0000-0000-00000000000c',
      evidence_id: 'aa999999-9999-9999-9999-999999999999',
      check_kind: 'internal_exposure_reference',
      check_status: 'check_passed',
      checked_by: { user_id: 'u3', github_login: 'closer', display_name: null },
      checked_at: '2026-06-12T00:00:00.000Z',
      summary_public: 'internal_record_linked: the cited exposure exists in this workspace.',
      status_reason: null,
    }],
    timelineEvents: [],
    generatedAt: '2026-06-12T12:00:00.000Z',
  };
}

const BANNED_ASSERTIONS = ['"fixed"', 'verified fixed', 'verified_fixed', '"safe"', 'certified', 'compliant', 'approved release', 'remediation complete'];

function assertVocabulary(draft, label) {
  const text = (draft.title + '\n' + draft.body + '\n' + JSON.stringify(draft.suggestedFields)).toLowerCase();
  for (const banned of BANNED_ASSERTIONS) {
    ok(!text.includes(banned.toLowerCase().replace(/"/g, '')) || banned.startsWith('"'),
      `${label} must not assert "${banned}"`);
  }
  // The quoted ones check as exact JSON string values.
  const json = JSON.stringify(draft);
  ok(!/"fixed"|"safe"|"certified"|"compliant"/.test(json.replace(/"fixed_version_observed"/g, '""').replace(/"evidence_type"/g, '""')),
    `${label} must not carry bare verdict values`);
  ok(draft.body.includes(AGENT_DRAFT_NON_CLAIM), `${label} must embed the non-claim in the body`);
}

// ---------- 0029: drafts are records; decisions are one-shot stamps ----------

test('0029 draft table: kinds, statuses, agent-only generator, decision coherence (PR-18A)', () => {
  const sql = readSqlNoComments(MIGRATION);
  ok(/create table if not exists public\.agent_evidence_drafts/.test(sql), '0029 creates agent_evidence_drafts');
  const kinds = sql.match(/draft_kind in \(([^)]*)\)/)[1].match(/'[a-z_]+'/g).map((s) => s.replace(/'/g, ''));
  ok(JSON.stringify([...kinds].sort()) === JSON.stringify([...AGENT_DRAFT_KINDS].sort()),
    'draft kinds are exactly the five v0 kinds');
  const statuses = sql.match(/draft_status in \(([^)]*)\)/)[1].match(/'[a-z_]+'/g).map((s) => s.replace(/'/g, ''));
  ok(JSON.stringify([...statuses].sort()) === JSON.stringify([...AGENT_DRAFT_STATUSES].sort()),
    'statuses are drafted/approved/rejected/superseded');
  ok(/generated_by_kind text not null default 'agent' check \(generated_by_kind = 'agent'\)/.test(sql),
    'the generator is ALWAYS the agent — no other kind exists');
  ok(/requested_by\s+uuid not null references public\.vault_users/.test(sql),
    'every draft records the human who requested it — no autonomous rows');
  ok(/decision_coherence check/.test(sql), 'decision coherence is schema-enforced');
  ok(/source_record_ids jsonb not null/.test(sql), 'a draft must cite its source records');
  ok(/non_claim\s+text not null/.test(sql), 'the non-claim travels in the row');
  ok(/alter table public\.agent_evidence_drafts enable row level security/.test(sql), 'RLS');
});

test('0029 firewall: no write-back, no autonomy, no secrets (PR-18A)', () => {
  const sql = readSqlNoComments(MIGRATION);
  ok(!/alter table public\.(vault_exceptions|component_remediation_evidence|vault_exception_resolutions|component_exposures)\b/.test(sql),
    '0029 must not alter any trust-record table');
  ok(!/schedule|cron|interval/.test(sql), 'no autonomous-run machinery');
  ok(!/secret|token_hash|api_key/.test(sql), 'no secret material columns');
  ok(!/'verified'|'certified'|'compliant'/.test(sql), 'no verdict vocabulary');
});

// ---------- the module: drafts derive from records, write one table ----------

test('agent module writes exactly one table; trust records are never mutated (PR-18A)', () => {
  const src = stripJsComments(read(MODULE));
  const writes = src.match(/\.from\(['"]([a-z_]+)['"]\)[\s\S]{0,200}?\.(insert|update|delete|upsert)\(/g) || [];
  ok(writes.length === 2 && writes.every((w) => /agent_evidence_drafts/.test(w)),
    `the module must write ONLY agent_evidence_drafts (insert + decision stamp), found: ${JSON.stringify(writes)}`);
  ok(!/from\(['"]component_remediation_evidence['"]\)[\s\S]{0,200}\.(insert|update|delete|upsert)\(/.test(src),
    'the agent must never write evidence — recording evidence is the 16C lane, by a human');
  ok(!/from\(['"](vault_exceptions|vault_exception_resolutions|evidence_verification_checks|component_exposures)['"]\)[\s\S]{0,200}\.(insert|update|delete|upsert)\(/.test(src),
    'the agent must never write any trust-record table');
  ok(/loadEvidenceBundleForExposure/.test(src) && /composeEvidencePacket/.test(src),
    'drafts derive from the SAME builders the exports use');
  ok(!/reason_private/.test(src),
    'private reasoning never enters the drafter — bundles exclude it by construction');
});

test('deterministic drafter: no LLM surface, no secrets, bounded metadata (PR-18A)', () => {
  const src = stripJsComments(read(MODULE));
  ok(!/anthropic|openai|gemini|api[_-]?key|LLM_|model:.*claude|gpt-/i.test(src),
    'v0 is deterministic — no provider, no model key, no prompt surface');
  ok(/provider: 'deterministic'/.test(src), 'model metadata names the deterministic drafter');
  ok(!/vault_api_tokens|signing_secret|token_hash/.test(src), 'no secret material near drafts');
});

test('human decision is one-shot and guarded; title/body are never edited (PR-18A)', () => {
  const src = stripJsComments(read(MODULE));
  ok(/\.eq\('draft_status', 'drafted'\)/.test(src),
    'the decision UPDATE is guarded on drafted — it lands exactly once');
  ok(/a human decision lands exactly once/.test(read(MODULE)), 'a second decision gets an honest conflict');
  const updateBlock = src.match(/\.update\(stamp\)/);
  ok(updateBlock, 'the only update is the decision stamp');
  ok(!/draft_title:\s*[^,]+,?\s*draft_body/.test(src.split('decideDraft')[1] || ''),
    'the decision path must not touch title/body');
  ok(/approved_by: req\.vaultSession\.user_id/.test(src) && /rejected_by: req\.vaultSession\.user_id/.test(src),
    'the decision records WHICH human decided');
});

// ---------- pure drafters: vocabulary + derivation ----------

test('trust record summary restates the chain and embeds the non-claim (PR-18A)', () => {
  const bundle = buildEvidenceBundle(chainRecords());
  const draft = draftTrustRecordSummary(bundle);
  ok(/human review required/i.test(draft.body), 'human review required appears');
  ok(draft.body.includes('Reviewer direction: remediation_required'), 'direction restated');
  ok(/citation check passed/.test(draft.body.replace('check_passed', 'check passed')) || /-> citation check passed/.test(draft.body),
    'check result restated in allowed vocabulary');
  ok(draft.sourceRecordIds.exposure_id === 'e1111111-1111-1111-1111-111111111111',
    'the draft cites its source record ids');
  assertVocabulary(draft, 'trust record summary');
});

test('remediation evidence suggestion suggests, prefills, and never records (PR-18A)', () => {
  const bundle = buildEvidenceBundle(chainRecords());
  const candidate = { exposure_id: 'e2222222-2222-2222-2222-222222222222', observed_version: '2.0.0', first_seen_at: '2026-06-11T00:00:00.000Z' };
  const draft = draftRemediationEvidenceSuggestion(bundle, candidate, 'f7777777-7777-7777-7777-777777777777');
  ok(/MAY SUPPORT/i.test(draft.body), 'the suggestion says may support');
  ok(/candidate evidence/i.test(draft.body), 'candidate evidence vocabulary');
  ok(draft.suggestedFields.evidence_type === 'fixed_version_observed', 'prefill: evidence type');
  ok(/e2222222/.test(draft.suggestedFields.evidence_ref), 'prefill: reference cites the candidate observation');
  ok(/Drafted by the Trust Agent, human review required/.test(draft.suggestedFields.reason_public_draft),
    'the prefilled reason discloses its agent origin');
  ok(draft.sourceRecordIds.candidate_exposure_id === candidate.exposure_id, 'candidate cited as a source');
  assertVocabulary(draft, 'evidence suggestion');
  // No candidate -> honest empty suggestion, still a draft, still non-claimed.
  const empty = draftRemediationEvidenceSuggestion(bundle, null, null);
  ok(/No candidate found/.test(empty.body) && Object.keys(empty.suggestedFields).length === 0,
    'no candidate -> nothing suggested, honestly');
});

test('gap summary names directed-unanswered and unchecked-evidence gaps (PR-18A)', () => {
  const records = chainRecords();
  // Make the direction unanswered and the (removed) evidence unchecked.
  records.remediationEvidence = [];
  records.verificationChecks = [];
  const draft = draftMissingEvidenceGapSummary(buildEvidenceBundle(records));
  ok(/Directions awaiting evidence: 1/.test(draft.body), 'the unanswered direction is named');
  ok(/d5555555-5555-5555-5555-555555555555/.test(draft.body), 'by exception id');
  assertVocabulary(draft, 'gap summary');
  // The complete chain reports no gaps.
  const clean = draftMissingEvidenceGapSummary(buildEvidenceBundle(chainRecords()));
  ok(/No gaps found by this drafter/.test(clean.body), 'a complete chain reads as no gaps');
});

test('citation check summary explains without changing meaning (PR-18A)', () => {
  const bundle = buildEvidenceBundle(chainRecords());
  const draft = draftCitationCheckSummary(bundle, 'aa999999-9999-9999-9999-999999999999');
  ok(/Citation check passed/i.test(draft.body), 'allowed vocabulary: citation check passed');
  ok(/does not change what the evidence claims/.test(draft.body), 'the summary disclaims reinterpretation');
  ok(draft.sourceRecordIds.check_ids.length === 1, 'check ids cited');
  assertVocabulary(draft, 'check summary');
});

test('packet summary restates counts and decides nothing (PR-18A)', () => {
  const packet = buildEvidencePacket({
    workspace: { slug: 'acme', display_name: null },
    selection: { mode: 'workspace', label: 'Workspace evidence packet' },
    chainBundles: [buildEvidenceBundle(chainRecords())],
    observationInventory: [{ exposure_id: 'ab000000-0000-0000-0000-000000000001', subject_kind: 'package', subject_name: 'obs', observed_version: null, status: 'observed', source_kind: 'cli', first_seen_at: '2026-06-01T00:00:00.000Z', last_seen_at: '2026-06-01T00:00:00.000Z', seen_count: 1 }],
    capNotes: {},
    generatedAt: '2026-06-12T12:00:00.000Z',
  });
  const draft = draftEvidencePacketSummary(packet);
  ok(/Remediation evidence recorded: 1/.test(draft.body), 'counts restated');
  ok(/decides nothing/.test(draft.body), 'the summary says it decides nothing');
  ok(draft.sourceRecordIds.chain_exposure_ids.length === 1 && draft.sourceRecordIds.inventory_exposure_ids.length === 1,
    'sources cited for chains and inventory');
  assertVocabulary(draft, 'packet summary');
});

// ---------- routes, tokens, workspace scoping ----------

test('draft routes: session-only, CSRF on every write, no token path (PR-18A)', () => {
  const routes = read(ROUTES);
  const posts = [...routes.matchAll(/app\.post\([\s\S]*?\);/g)];
  ok(posts.length === 3, 'create + approve + reject');
  for (const block of posts) {
    ok(/requireVaultSession/.test(block[0]) && /requireCsrf/.test(block[0]),
      'every draft write requires session + CSRF');
  }
  ok(!/requireVaultReader/.test(routes),
    'read-only API tokens can neither create nor decide drafts in v0');
  const vaultRoutes = read('src/server/vault/routes.js');
  ok(/registerAgentDraftRoutes/.test(vaultRoutes), 'mounted from the single private route table');
  ok(!/agent-drafts'/.test(vaultRoutes), 'routes.js carries no new literal (snapshot invariant)');
});

test('handler: workspace-scoped, in-workspace anchors only, allowlisted kinds (PR-18A)', () => {
  const src = stripJsComments(read(MODULE));
  ok(/resolveWorkspaceForMember/.test(src), 'membership-gated');
  ok(/AGENT_DRAFT_KINDS\.includes\(draftKind\)/.test(src), 'kinds allowlisted');
  ok(/eq\('workspace_id', workspace\.workspace_id\)[\s\S]{0,80}eq\('evidence_id', evidenceId\)/.test(src),
    'evidence anchors resolve in-workspace only — cross-workspace records 404');
  ok(/requested_by: req\.vaultSession\.user_id/.test(src), 'the requesting human is recorded');
});

// ---------- webhooks ----------

test('draft webhook payloads preserve the draft-vs-approval distinction (PR-18A)', () => {
  const created = buildWebhookPayload({
    eventId: '44444444-4444-4444-4444-444444444444',
    eventType: 'agent_draft.created',
    workspace: { workspace_id: 'w1', slug: 'acme' },
    occurredAt: '2026-06-12T14:00:00.000Z',
    actor: { github_login: 'requester' },
    recordIds: { draft_id: 'd1', exception_id: 'e1' },
    state: 'drafted',
    agentDraft: { draft_kind: 'trust_record_summary', draft_status: 'drafted' },
  });
  ok(created.agent_draft.draft_status === 'drafted', 'the draft field carries the draft status');
  ok(created.reviewer_direction === undefined && created.remediation_evidence === undefined
    && created.verification_check === undefined,
    'a draft event is none of the other record kinds');
  ok(/does not certify/.test(created.non_claim), 'the non-claim travels');
  const approved = buildWebhookPayload({
    eventId: '55555555-5555-5555-5555-555555555555',
    eventType: 'agent_draft.approved',
    workspace: { workspace_id: 'w1', slug: 'acme' },
    occurredAt: '2026-06-12T14:05:00.000Z',
    actor: { github_login: 'approver' },
    recordIds: { draft_id: 'd1' },
    state: 'approved',
    agentDraft: { draft_kind: 'trust_record_summary', draft_status: 'approved' },
  });
  ok(approved.event_type === 'agent_draft.approved' && approved.actor.github_login === 'approver',
    'the approval event names the deciding human — draft and approval are distinct events');
});

// ---------- UI ----------

test('UI: agent labels only, prefill never records, human review visible (PR-18A)', () => {
  const src = read(UI);
  ok(/Draft with Trust Agent/.test(src), 'the action is Draft with Trust Agent');
  ok(/Approve draft/.test(src) && /Reject draft/.test(src), 'human decisions are explicit');
  ok(/Use draft to record evidence \(prefills the form — you still record it\)/.test(src),
    'the evidence path is prefill-only and says so');
  ok(/Human review required\./.test(src), 'human review required is visible');
  for (const banned of ['Auto-fix', 'Mark fixed', 'Verify safe', 'Certify', 'Resolve automatically']) {
    ok(!src.includes(banned), `UI must not say "${banned}"`);
  }
  ok(/handleUseDraftForEvidence/.test(src) && !/recordRemediationEvidence\(slug, id, \{[\s\S]{0,200}suggested_fields/.test(src),
    'using a draft prefills state; it never calls the evidence-recording API itself');
});

// ---------- exports stay clean ----------

test('drafts are deliberately absent from evidence exports (PR-18A)', () => {
  const exportSrc = read('src/server/vault/evidence-export.js');
  const rollupSrc = read('src/server/vault/evidence-rollup.js');
  ok(!/agent_evidence_drafts|agent_draft/i.test(exportSrc),
    'the single-chain bundle contains no drafts — an agent draft never appears inside an evidence artifact');
  ok(!/agent_evidence_drafts|agent_draft/i.test(rollupSrc),
    'the rollup packet contains no drafts');
});

// ---------- guard + wiring ----------

test('release-integrity guard knows the 0029 table and the draft route family (PR-18A)', () => {
  const guard = read('scripts/check-release-integrity.mjs');
  ok(/agent_evidence_drafts/.test(guard), 'REQUIRED_TABLES includes the 0029 table');
  ok(/agent-draft-routes\.js/.test(guard), 'literal scan includes the registrar');
  ok(/__guard__\/agent-drafts/.test(guard), 'runtime probe exists');
});

test('package.json wires test:agent-drafts-v0 into test:ci (PR-18A)', () => {
  const pkg = JSON.parse(read('package.json'));
  ok(pkg.scripts['test:agent-drafts-v0'], 'missing test:agent-drafts-v0 script');
  ok(/test-agent-drafts-v0\.mjs/.test(pkg.scripts['test:ci'] || ''),
    'test:ci must chain scripts/test-agent-drafts-v0.mjs');
});

(async () => {
  for (const fn of pending) await fn();
  console.log(`\nAgent drafts v0 tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
