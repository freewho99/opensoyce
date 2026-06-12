#!/usr/bin/env node
/**
 * PR-17A invariants for the auditor / customer evidence export bundle.
 *
 * DOCTRINE:
 *   A control matrix without records behind it is a claim.
 *   An export is a view of records, not a new source of truth.
 *   Evidence shows what happened.
 *   Evidence does not certify compliance by itself.
 *   OpenSoyce produces audit-ready evidence; auditors decide audit outcomes.
 *
 * KEY BOUNDARY:
 *   Export is not certification. Export is not a decision.
 *   Export is a faithful view of the record.
 *
 * Mixed suite: structural greps prove the module CANNOT write; functional
 * tests against the pure builder/renderer prove the bundle is faithful —
 * identity and timestamps preserved, missing records reported honestly,
 * nothing fabricated.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildEvidenceBundle,
  renderEvidenceBundleMarkdown,
  BUNDLE_DOES_NOT_PROVE,
} from '../src/server/vault/evidence-export.js';

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

const MODULE = 'src/server/vault/evidence-export.js';
const ROUTES = 'src/server/vault/evidence-export-routes.js';

// ---------------------------------------------------------------------------
// Functional fixtures — a synthetic chain with pinned ids and timestamps.
// ---------------------------------------------------------------------------

const GENERATED_AT = '2026-06-11T12:00:00.000Z';

function bareObservation() {
  return {
    workspace: { slug: 'acme', display_name: 'Acme Corp' },
    exposure: {
      exposure_id: 'e1111111-1111-1111-1111-111111111111',
      exposure_type: 'dependency-exposure',
      subject_kind: 'package',
      subject_name: 'left-pad',
      status: 'observed',
      source_kind: 'ci',
      source_ref: 'github-actions:run-42',
      latest_source_ref: 'github-actions:run-77',
      first_seen_at: '2026-06-01T00:00:00.000Z',
      last_seen_at: '2026-06-10T00:00:00.000Z',
      seen_count: 3,
      trust_boundary: { package_manager: 'npm', manifest_kind: 'package.json' },
      metadata: { version: '1.3.0' },
    },
    intel: [],
    questions: [],
    ceiEvents: [],
    exceptions: [],
    resolutions: [],
    timelineEvents: [],
    generatedAt: GENERATED_AT,
  };
}

function fullChain() {
  const r = bareObservation();
  r.intel = [{
    vuln_intel_id: 'a2222222-2222-2222-2222-222222222222',
    vuln_id: 'GHSA-test-0001',
    source: 'osv',
    match_basis: 'osv-version-query',
    severity: 'high',
    affected_range: 'introduced 1.0.0, fixed 1.4.0',
    source_ref: 'https://osv.dev/vulnerability/GHSA-test-0001',
    metadata: { summary: 'Prototype pollution in left-pad.' },
    first_seen_at: '2026-06-02T00:00:00.000Z',
    last_seen_at: '2026-06-09T00:00:00.000Z',
    seen_count: 2,
  }];
  r.questions = [{
    question_id: 'b3333333-3333-3333-3333-333333333333',
    question_kind: 'vulnerability_review',
    vuln_id: 'GHSA-test-0001',
    status: 'answered',
    selected_outcome: 'propose_exception',
    created_by: { user_id: 'u1', github_login: 'asker', display_name: null },
    created_at: '2026-06-03T00:00:00.000Z',
    answered_by: { user_id: 'u2', github_login: 'decider', display_name: 'The Decider' },
    answered_at: '2026-06-04T00:00:00.000Z',
    reason_public: 'Accepting temporarily; upgrade scheduled.',
  }];
  r.ceiEvents = [
    {
      event_id: 'c4444444-4444-4444-4444-444444444444',
      event_kind: 'exception_proposed_from_exposure',
      related_exception_id: 'd5555555-5555-5555-5555-555555555555',
      actor: { user_id: 'u2', github_login: 'decider', display_name: 'The Decider' },
      metadata: {},
      created_at: '2026-06-04T01:00:00.000Z',
    },
    {
      event_id: 'c6666666-6666-6666-6666-666666666666',
      event_kind: 'exception_expired_from_exposure',
      related_exception_id: 'd5555555-5555-5555-5555-555555555555',
      actor: null,
      metadata: { actor_kind: 'system', expired_at: '2026-06-08T00:00:00.000Z', observed_at: '2026-06-08T01:00:00.000Z' },
      created_at: '2026-06-08T01:00:00.000Z',
    },
  ];
  r.exceptions = [{
    exception_id: 'd5555555-5555-5555-5555-555555555555',
    subject_kind: 'package',
    subject_name: 'left-pad',
    state: 'expired',
    original_action: 'BLOCK',
    allowed_action: 'WARN',
    proposed_by: 'u2',
    proposed_at: '2026-06-04T01:00:00.000Z',
    reviewed_by: 'u3',
    reviewed_at: '2026-06-05T00:00:00.000Z',
    expires_at: '2026-06-08T00:00:00.000Z',
    reason_public: 'Temporary acceptance while upgrading.',
    revoked_at: null,
    proof_anchors: [{ proofType: 'live-surface', label: 'source exposure', href: '/api/vault/x' }],
  }];
  r.resolutions = [{
    resolution_id: 'f7777777-7777-7777-7777-777777777777',
    exception_id: 'd5555555-5555-5555-5555-555555555555',
    outcome: 'revoke',
    resolved_by: { user_id: 'u3', github_login: 'reviewer', display_name: null },
    reason_public: 'Upgrade landed; trust no longer needed.',
    renewed_exception_id: null,
    linked_question_id: null,
    created_at: '2026-06-09T00:00:00.000Z',
  }];
  r.timelineEvents = [{
    event_id: 'a8888888-8888-8888-8888-888888888888',
    event_type: 'exception_expired',
    subject_exception_id: 'd5555555-5555-5555-5555-555555555555',
    summary: 'Exception expired (time truth).',
    emitted_by: null,
    emitted_at: '2026-06-08T01:00:00.000Z',
  }];
  return r;
}

// ---------------------------------------------------------------------------
// The module structurally CANNOT write (acceptance 3-10)
// ---------------------------------------------------------------------------

test('export module is read-only: zero write verbs anywhere (PR-17A)', () => {
  const src = stripJsComments(read(MODULE));
  ok(!/\.(insert|update|upsert|delete)\(/.test(src),
    'the export module must contain NO insert/update/upsert/delete call — generating an export changes nothing');
  ok(!/\.rpc\(/.test(src), 'the export module must call no RPC — a function call can hide a write');
});

test('export creates no events and touches no decision machinery (PR-17A)', () => {
  const src = stripJsComments(read(MODULE));
  ok(!/recordProposalFromExposure|recordOutcomeFromExposure|recordExpiredFromExposure/.test(src),
    'the export must not record CEI events');
  ok(!/requireCsrf/.test(src),
    'no CSRF middleware belongs here — there is no mutating verb to front');
  ok(!/proposeException|handleApprove|handleReject|handleRevoke|handleResolve/.test(src),
    'the export must not reach any decision handler');
  ok(!/octokit|child_process/i.test(src), 'no remediation or PR machinery');
});

test('export reads are workspace-scoped, membership-gated (PR-17A)', () => {
  const src = stripJsComments(read(MODULE));
  ok(/resolveWorkspaceForMember/.test(src),
    'the handler must resolve workspace membership (404-on-non-member doctrine)');
  const reads = src.match(/\.from\(['"][a-z_]+['"]\)/g) || [];
  const scoped = src.match(/\.eq\('workspace_id', workspace\.workspace_id\)/g) || [];
  ok(reads.length >= 6, `expected reads across the chain's tables, found ${reads.length}`);
  ok(scoped.length >= reads.length,
    `every read must filter by the resolved workspace_id (${reads.length} reads, ${scoped.length} workspace filters)`);
});

test('private reasoning is never exported (PR-17A)', () => {
  const src = stripJsComments(read(MODULE));
  ok(!/reason_private/.test(src),
    'the export must not select or forward reason_private — public reasons only; private reasoning stays in the record');
});

// ---------------------------------------------------------------------------
// Faithful view: identity + timestamps preserved, sections separated
// ---------------------------------------------------------------------------

test('full chain: bundle separates the 9 sections and the markdown renders them in order (PR-17A)', () => {
  const bundle = buildEvidenceBundle(fullChain());
  const md = renderEvidenceBundleMarkdown(bundle);
  const headings = [
    '## 1. Executive summary',
    '## 2. Observation record',
    '## 3. Vulnerability / risk context',
    '## 4. Remediation question',
    '## 5. Exception / accepted risk',
    '## 6. Expiry pressure',
    '## 7. Reviewer resolution',
    '## 8. Remediation evidence',
    '## 9. Citation checks',
    '## 10. Receipt trail',
    '## 11. Honest edges',
  ];
  let last = -1;
  for (const h of headings) {
    const idx = md.indexOf(h);
    ok(idx > last, `markdown must contain "${h}" after the previous section`);
    last = idx;
  }
  for (const key of ['observation', 'vulnerability_context', 'remediation_questions', 'exceptions', 'expiry_pressure', 'resolutions', 'remediation_evidence', 'citation_checks', 'receipts']) {
    ok(bundle.sections[key], `bundle must carry the ${key} section`);
  }
});

test('citation checks render after evidence, never as a verdict (PR-EV-1)', () => {
  const records = fullChain();
  records.resolutions = [{
    resolution_id: 'f1000000-0000-0000-0000-00000000000a',
    exception_id: records.exceptions[0].exception_id,
    outcome: 'remediation_required',
    resolved_by: { user_id: 'u2', github_login: 'rev', display_name: null },
    reason_public: 'fix it',
    renewed_exception_id: null,
    linked_question_id: null,
    created_at: '2026-06-09T00:00:00.000Z',
  }];
  records.remediationEvidence = [{
    evidence_id: 'aa000000-0000-0000-0000-00000000000a',
    exception_id: records.exceptions[0].exception_id,
    evidence_type: 'fixed_version_observed',
    evidence_ref: 'pkg@2.0.0 observed',
    recorded_by: { user_id: 'u3', github_login: 'closer', display_name: null },
    reason_public: 'done',
    related_resolution_id: 'f1000000-0000-0000-0000-00000000000a',
    related_question_id: null,
    source_vuln_intel_id: null,
    created_at: '2026-06-10T00:00:00.000Z',
  }];
  records.verificationChecks = [{
    check_id: 'cc000000-0000-0000-0000-00000000000c',
    evidence_id: 'aa000000-0000-0000-0000-00000000000a',
    check_kind: 'internal_exposure_reference',
    check_status: 'check_passed',
    checked_by: { user_id: 'u3', github_login: 'closer', display_name: null },
    checked_at: '2026-06-12T00:00:00.000Z',
    summary_public: 'internal_record_linked: the cited exposure exists in this workspace.',
    status_reason: null,
  }];
  const bundle = buildEvidenceBundle(records);
  ok(bundle.sections.citation_checks.present === true, 'checks section present');
  ok(bundle.sections.receipts.record_ids.verification_check_ids.length === 1, 'check id in the receipt trail');
  const md = renderEvidenceBundleMarkdown(bundle);
  ok(md.indexOf('## 8. Remediation evidence') < md.indexOf('## 9. Citation checks'),
    'checks follow the evidence');
  ok(md.indexOf('## 9. Citation checks') < md.indexOf('## 10. Receipt trail'),
    'checks precede the receipt trail');
  ok(md.includes('cc000000-0000-0000-0000-00000000000c'), 'check id verbatim');
  ok(md.includes('`check_passed`'), 'check vocabulary in the document');
  ok(/A passing citation check does not certify remediation or prove absence of vulnerabilities\./.test(md),
    'the EV-1 non-claim must render');
  // A chain WITHOUT checks still works and says so honestly.
  const bare = buildEvidenceBundle({ ...records, verificationChecks: [] });
  ok(bare.sections.citation_checks.present === false, 'no checks -> not present');
  const bareMd = renderEvidenceBundleMarkdown(bare);
  ok(/No citation checks have been run/.test(bareMd), 'absence of checks is reported, not hidden');
});

test('remediation case status pairs direction to evidence PER EXCEPTION, not chain-wide (PR-16C/17B)', () => {
  // Two directed exceptions A and B; evidence cites ONLY A. The chain must
  // read awaiting_evidence (B is unanswered) — not evidence_recorded just
  // because some evidence exists somewhere in the chain.
  const records = fullChain();
  const exA = records.exceptions[0].exception_id;
  const exB = 'd9999999-9999-9999-9999-999999999999';
  records.exceptions.push({
    ...records.exceptions[0],
    exception_id: exB,
    expires_at: '2026-06-09T00:00:00.000Z',
  });
  records.resolutions = [
    { resolution_id: 'f1000000-0000-0000-0000-00000000000a', exception_id: exA, outcome: 'remediation_required', resolved_by: { user_id: 'u2', github_login: 'rev', display_name: null }, reason_public: 'fix A', renewed_exception_id: null, linked_question_id: null, created_at: '2026-06-09T00:00:00.000Z' },
    { resolution_id: 'f2000000-0000-0000-0000-00000000000b', exception_id: exB, outcome: 'remediation_required', resolved_by: { user_id: 'u2', github_login: 'rev', display_name: null }, reason_public: 'fix B', renewed_exception_id: null, linked_question_id: null, created_at: '2026-06-09T00:00:00.000Z' },
  ];
  records.remediationEvidence = [
    { evidence_id: 'aa000000-0000-0000-0000-00000000000a', exception_id: exA, evidence_type: 'fixed_version_observed', evidence_ref: 'A fixed', recorded_by: { user_id: 'u3', github_login: 'closer', display_name: null }, reason_public: 'A done', related_resolution_id: 'f1000000-0000-0000-0000-00000000000a', related_question_id: null, source_vuln_intel_id: null, created_at: '2026-06-10T00:00:00.000Z' },
  ];
  const bundle = buildEvidenceBundle(records);
  ok(bundle.sections.remediation_evidence.case_status === 'awaiting_evidence',
    `B is directed but unanswered — case must be awaiting_evidence, found ${bundle.sections.remediation_evidence.case_status}`);
  ok(bundle.honest_edges.missing.some((m) => /remediation evidence/.test(m) && m.includes(exB)),
    'the missing list must name the still-unanswered exception B');
  ok(!bundle.honest_edges.missing.some((m) => /remediation evidence/.test(m) && m.includes(exA)),
    'exception A is answered and must not appear as missing');
});

test('record identity and timestamps are preserved verbatim (PR-17A)', () => {
  const records = fullChain();
  const bundle = buildEvidenceBundle(records);
  const md = renderEvidenceBundleMarkdown(bundle);
  const mustAppear = [
    records.exposure.exposure_id,
    records.exposure.first_seen_at,
    records.intel[0].vuln_intel_id,
    records.intel[0].vuln_id,
    records.questions[0].question_id,
    records.questions[0].answered_at,
    records.exceptions[0].exception_id,
    records.exceptions[0].expires_at,
    records.resolutions[0].resolution_id,
    records.resolutions[0].created_at,
    records.ceiEvents[1].event_id,
    records.timelineEvents[0].event_id,
    GENERATED_AT,
  ];
  for (const v of mustAppear) {
    ok(md.includes(v), `markdown must carry "${v}" verbatim`);
  }
  ok(bundle.sections.receipts.record_ids.exposure_id === records.exposure.exposure_id,
    'receipt trail must cite the exposure id');
  ok(bundle.generated_at === GENERATED_AT, 'generated_at must be the caller-provided timestamp');
});

test('actor identity is preserved where the workspace already sees it (PR-17A)', () => {
  const bundle = buildEvidenceBundle(fullChain());
  const md = renderEvidenceBundleMarkdown(bundle);
  ok(md.includes('@decider'), 'question answerer must be named');
  ok(md.includes('@reviewer'), 'resolution reviewer must be named');
  ok(/actor: system/.test(md), 'the reaper observation must be attributed to the system, not a person');
});

test('severity stays in the source vocabulary; nothing maps it to a decision (PR-17A)', () => {
  const bundle = buildEvidenceBundle(fullChain());
  const intel = bundle.sections.vulnerability_context.intel[0];
  ok(intel.severity_as_reported_by_source === 'high',
    'severity must be exported under the as-reported-by-source name');
  const md = renderEvidenceBundleMarkdown(bundle);
  ok(/severity \(as reported by source\)/.test(md), 'markdown must label severity as source vocabulary');
  const src = stripJsComments(read(MODULE));
  ok(!/severity[^,\n]{0,40}(BLOCK|WARN|ALLOW)/.test(src),
    'the module must never map severity to a gate action');
});

// ---------------------------------------------------------------------------
// Honesty: missing records are reported, never fabricated
// ---------------------------------------------------------------------------

test('bare observation: every absent section says not-present; nothing is fabricated (PR-17A)', () => {
  const bundle = buildEvidenceBundle(bareObservation());
  ok(bundle.sections.observation.present === true, 'the observation itself is present');
  for (const key of ['vulnerability_context', 'remediation_questions', 'exceptions', 'expiry_pressure', 'resolutions', 'remediation_evidence', 'receipts']) {
    ok(bundle.sections[key].present === false, `${key} must be marked not present`);
  }
  // PR-16C: with no remediation_required direction, evidence is not DUE —
  // it must not appear in the missing list (nothing was owed).
  ok(!bundle.honest_edges.missing.some((m) => /remediation evidence/.test(m)),
    'remediation evidence must not be "missing" when no direction made it due');
  ok(bundle.sections.remediation_evidence.case_status === 'no_remediation_direction',
    'derived case status must be no_remediation_direction');
  ok(bundle.honest_edges.missing.length >= 5,
    'the honest edges must enumerate the missing chain sections');
  const md = renderEvidenceBundleMarkdown(bundle);
  ok(/not present in the record/.test(md), 'markdown must say "not present in the record"');
  // Nothing fabricated: no uuid other than the exposure's may appear.
  const uuids = md.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) || [];
  ok(uuids.every((u) => u === 'e1111111-1111-1111-1111-111111111111'),
    `a bare observation's export may cite only the exposure id, found: ${JSON.stringify([...new Set(uuids)])}`);
});

test('absence of intelligence is reported as absence of records, not absence of risk (PR-17A)', () => {
  const bundle = buildEvidenceBundle(bareObservation());
  const md = renderEvidenceBundleMarkdown(bundle);
  ok(/the record holds none/.test(md) && /not that no vulnerabilities exist/.test(md),
    'no-intel must be the honest "no intelligence recorded" statement');
});

// ---------------------------------------------------------------------------
// Non-claims: evidence, never certification
// ---------------------------------------------------------------------------

test('the export claims evidence, never compliance (PR-17A)', () => {
  const md = renderEvidenceBundleMarkdown(buildEvidenceBundle(fullChain()));
  ok(/not a compliance certification/.test(md),
    'markdown must state it is not a compliance certification');
  ok(/does not certify controls/.test(md), 'must disclaim control certification');
  ok(/does not prove a vulnerability was remediated/.test(md),
    'must disclaim remediation proof');
  ok(!/makes you (SOC ?2 )?compliant/i.test(md), 'must never claim to make anyone compliant');
  ok(!/replaces? (your )?auditors?\b(?! or guarantee)/i.test(md.replace(/not replace an auditor/g, '')),
    'must never claim to replace auditors');
  ok(BUNDLE_DOES_NOT_PROVE.length >= 4, 'the does-not-prove list must be substantive');
});

// ---------------------------------------------------------------------------
// Routes: private, read-only, own registrar
// ---------------------------------------------------------------------------

test('export route: own registrar, GET-only, session-gated, vault-prefixed (PR-17A)', () => {
  const routes = read(ROUTES);
  const getBlock = routes.match(/app\.get\(\s*'\/api\/vault\/workspaces\/:slug\/exposures\/:id\/evidence-export'[\s\S]*?\);/);
  ok(getBlock, 'GET evidence-export route must be registered');
  ok(/requireVaultSession/.test(getBlock[0]), 'export must require a vault session — no public surface');
  ok(/setPrivateCacheHeaders/.test(getBlock[0]), 'export must carry private cache headers');
  ok(!/app\.(post|patch|delete|put)\(/.test(routes),
    'the export lane must register NO mutating verb — generating an export changes nothing');
  const literals = [...routes.matchAll(/'(\/api\/[^']+)'/g)].map((m) => m[1]);
  ok(literals.length === 1 && literals[0].startsWith('/api/vault/'),
    'exactly one route literal, under the private /api/vault/ prefix');
  // Mounted through the single private route table; snapshot invariant survives.
  const vaultRoutes = read('src/server/vault/routes.js');
  ok(/registerEvidenceExportRoutes/.test(vaultRoutes),
    'vault routes must call registerEvidenceExportRoutes');
  ok(!/evidence-export'/.test(vaultRoutes),
    'routes.js must not carry the new literal (it lives in the registrar)');
});

// ---------------------------------------------------------------------------
// Client + UI: a read affordance, nothing more
// ---------------------------------------------------------------------------

test('api-client export helper: GET only (PR-17A)', () => {
  const api = read('src/shared/vault/api-client.ts');
  const block = api.match(/export async function getEvidenceExport[\s\S]*?\n}/);
  ok(block, 'getEvidenceExport not found');
  ok(/\/evidence-export`/.test(block[0]), 'helper must target the evidence-export sub-path');
  ok(!/method:/.test(block[0]), 'helper must be a plain GET — no method override');
  ok(/export interface EvidenceBundle\b/.test(api), 'EvidenceBundle type must be exported');
  ok(/honest_edges/.test(api), 'the type must carry honest_edges — the non-claims travel with the data');
});

test('exposure detail offers view / copy / download of the bundle (PR-17A)', () => {
  const src = read('src/pages/vault/VaultExposureDetail.tsx');
  ok(/Evidence export/.test(src), 'detail must render the Evidence export section');
  ok(/getEvidenceExport/.test(src), 'detail must use the dedicated read helper');
  ok(/Generate evidence bundle/.test(src), 'generation must be an explicit user action');
  ok(/Copy Markdown/.test(src) && /Download \.md/.test(src),
    'copy and download affordances must exist');
  ok(/certifies nothing|not a compliance certification/i.test(src),
    'the UI copy must carry the non-claim');
  ok(!/exportResult[\s\S]{0,80}(proposeException|resolveExpiredException|refreshExposureVulnIntel)/.test(src),
    'the export affordance must not chain into any mutating action');
});

// ---------------------------------------------------------------------------
// Guard + wiring + docs
// ---------------------------------------------------------------------------

test('release-integrity guard knows the export route family (PR-17A)', () => {
  const guard = read('scripts/check-release-integrity.mjs');
  ok(/evidence-export-routes\.js/.test(guard),
    'the layer-0 route-literal scan must include the export registrar');
  ok(/exposures\/__guard__\/evidence-export/.test(guard),
    'the runtime layer must probe the evidence-export route');
});

test('package.json wires test:evidence-export-v0 into test:ci (PR-17A)', () => {
  const pkg = JSON.parse(read('package.json'));
  ok(pkg.scripts['test:evidence-export-v0'], 'missing test:evidence-export-v0 script');
  ok(/test-evidence-export-v0\.mjs/.test(pkg.scripts['test:ci'] || ''),
    'test:ci must chain scripts/test-evidence-export-v0.mjs');
});

test('docs: evidence map + doctrine note carry the 17A boundary honestly (PR-17A)', () => {
  const map = read('docs/strategy/soc2-evidence-map.md');
  ok(/17A|evidence export/i.test(map), 'the SOC 2 evidence map must reflect export support');
  ok(!/makes you (SOC ?2 )?compliant/i.test(map), 'the evidence map must never claim compliance');
  const doctrine = read('docs/strategy/evidence-export-doctrine.md');
  ok(/Export is not certification/.test(doctrine), 'doctrine: export is not certification');
  ok(/Export is not a decision/.test(doctrine), 'doctrine: export is not a decision');
  ok(/faithful view of the record/.test(doctrine), 'doctrine: a faithful view of the record');
  ok(/auditors decide audit outcomes/i.test(doctrine), 'doctrine: auditors decide audit outcomes');
});

(async () => {
  for (const fn of pending) await fn();
  console.log(`\nEvidence export v0 tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
