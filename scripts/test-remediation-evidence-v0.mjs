#!/usr/bin/env node
/**
 * PR-16C invariants for the Fix Evidence Loop: remediation evidence.
 *
 * DOCTRINE:
 *   A recorded direction is not completed remediation.
 *   The system can ask, structure, validate presence of evidence, and
 *   record. The human closes the remediation case.
 *   The record remembers who closed it, when, why, and with what
 *   evidence.
 *
 * The claim, exactly: not "we fixed the vuln" — "we recorded evidence
 * that the human says closes the remediation loop."
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildEvidenceBundle,
  renderEvidenceBundleMarkdown,
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

const MIGRATION = 'supabase/migrations/0026_component_remediation_evidence.sql';
const MODULE = 'src/server/vault/remediation-evidence.js';
const ROUTES = 'src/server/vault/remediation-evidence-routes.js';
const UI = 'src/pages/vault/VaultExceptionDetail.tsx';

const EVIDENCE_TYPES = [
  'fixed_version_observed',
  'pr_or_commit_reference',
  'rescan_no_longer_matches',
  'manual_remediation_note',
];

// ---------- 0026: the evidence record ----------

test('0026 evidence table: human NOT NULL, reference REQUIRED, bounded types, RLS (PR-16C)', () => {
  const sql = readSqlNoComments(MIGRATION);
  ok(/create table if not exists public\.component_remediation_evidence/.test(sql),
    '0026 must create component_remediation_evidence');
  ok(/workspace_id\s+uuid\s+not null[\s\S]*?references public\.vault_workspaces/.test(sql),
    'workspace_id must be NOT NULL FK (isolation)');
  ok(/exception_id\s+uuid\s+not null[\s\S]*?references public\.vault_exceptions/.test(sql),
    'exception_id must be NOT NULL — evidence is always about one case');
  ok(/recorded_by\s+uuid not null references public\.vault_users/.test(sql),
    'recorded_by must be a NOT NULL FK — there is no system remediation evidence');
  ok(/evidence_ref\s+text not null check \(length\(evidence_ref\) between 1 and 512\)/.test(sql),
    'evidence_ref must be REQUIRED — evidence without a reference is a claim');
  ok(/reason_public\s+text not null check \(length\(reason_public\) between 1 and 280\)/.test(sql),
    'reason_public must be REQUIRED');
  const typesMatch = sql.match(/evidence_type in \(([^)]*)\)/);
  ok(typesMatch, 'evidence_type must carry an allowlist CHECK');
  const types = (typesMatch[1].match(/'[a-z_]+'/g) || []).map((s) => s.replace(/'/g, ''));
  ok(JSON.stringify([...types].sort()) === JSON.stringify([...EVIDENCE_TYPES].sort()),
    `evidence_type allowlist must be exactly ${JSON.stringify(EVIDENCE_TYPES)}, found ${JSON.stringify(types)}`);
  ok(/alter table public\.component_remediation_evidence enable row level security/.test(sql),
    'evidence table must enable RLS');
});

test('0026 firewall: a record, never a verdict or a transition (PR-16C)', () => {
  const sql = readSqlNoComments(MIGRATION);
  ok(!/alter table public\.vault_exceptions\b/.test(sql), '0026 must not alter vault_exceptions');
  ok(!/alter table public\.vault_exception_resolutions\b/.test(sql), '0026 must not alter resolutions');
  ok(!/alter table public\.component_remediation_questions\b/.test(sql), '0026 must not alter questions');
  ok(!/vault_timeline_events/.test(sql), '0026 must not reference the shared timeline');
  ok(!/'fixed'|'verified'|'certified'/.test(sql),
    'no verdict vocabulary anywhere — evidence type names describe what was observed or cited');
  ok(!/create unique index/.test(sql),
    'evidence is append-only — a second record is more receipts, never an overwrite');
  ok(/on delete set null/.test(sql), 'chain citations must be set-null FKs — evidence survives its citations');
});

// ---------- the module: records presence, never verifies ----------

test('evidence module writes exactly one table; never mutates the chain (PR-16C)', () => {
  const src = stripJsComments(read(MODULE));
  const writes = src.match(/\.from\(['"]([a-z_]+)['"]\)[\s\S]{0,160}?\.(insert|update|delete|upsert)\(/g) || [];
  ok(writes.length === 1 && /component_remediation_evidence/.test(writes[0]),
    `the module must write exactly one table (component_remediation_evidence), found: ${JSON.stringify(writes)}`);
  ok(!/from\(['"]vault_exceptions['"]\)[\s\S]{0,160}\.(update|insert|delete|upsert)\(/.test(src),
    'must never write vault_exceptions');
  ok(!/from\(['"]vault_exception_resolutions['"]\)[\s\S]{0,160}\.(update|insert|delete|upsert)\(/.test(src),
    'must never write resolutions — historical direction records are untouched');
  ok(!/from\(['"]component_remediation_questions['"]\)[\s\S]{0,160}\.(update|insert|delete|upsert)\(/.test(src),
    'must never write questions');
  ok(!/recordProposalFromExposure|recordOutcomeFromExposure|recordExpiredFromExposure/.test(src),
    'must not record CEI events');
  ok(!/vault_timeline_events/.test(src), 'must not touch the shared timeline');
  ok(!/'BLOCK'|'WARN'|'ALLOW'/.test(src), 'must not touch policy gate vocabulary');
});

test('missing evidence reference fails validation (PR-16C)', () => {
  const src = stripJsComments(read(MODULE));
  ok(/evidenceRef\.length < 1/.test(src) && /evidence_ref is required/.test(src),
    'the handler must refuse an empty evidence_ref with a 400');
  ok(/a claim cannot close the loop/.test(read(MODULE)),
    'the refusal must carry the doctrine: evidence without a reference is a claim');
  ok(/reasonPublic\.length < 1/.test(src), 'reason_public must be required');
});

test('the case is derived from the 16B direction, never stored (PR-16C)', () => {
  const src = stripJsComments(read(MODULE));
  ok(/eq\('outcome', 'remediation_required'\)/.test(src),
    'the case lookup must pin the remediation_required direction');
  ok(/409/.test(src) && /the reviewer opens the case/.test(read(MODULE)),
    'recording against a case nobody opened must be refused with a conflict');
  ok(!/case_status[\s\S]{0,80}\.(insert|update)/.test(src),
    'case status must never be written — it is derived at read time');
  ok(/'evidence_recorded'/.test(src) && /'awaiting_evidence'/.test(src) && /'no_remediation_direction'/.test(src),
    'the derived statuses are statements about the record');
  ok(!/'fixed'|'remediated'|'verified'|'certified'/.test(src),
    'no verdict vocabulary in the module — the system records, it does not conclude');
});

test('evidence links back to the chain; citations validated, never created (PR-16C)', () => {
  const src = stripJsComments(read(MODULE));
  ok(/resolveWorkspaceForMember/.test(src), 'workspace isolation via membership resolution');
  ok(/loadExceptionInWorkspace/.test(src), 'the exception must exist in this workspace');
  ok(/exception_proposed_from_exposure/.test(src),
    'the exposure link is discovered via the 6D proposal event, like 6F/16A');
  ok(/related_resolution_id/.test(src) && /related_question_id/.test(src) && /source_vuln_intel_id/.test(src),
    'chain citations must be carried');
  ok(!/from\(['"]component_exposure_vulnerabilities['"]\)[\s\S]{0,160}\.(insert|update|delete|upsert)\(/.test(src),
    'intelligence is read for validation only');
  ok(/recorded_by:\s*req\.vaultSession\.user_id/.test(src),
    'recorded_by must be the authenticated human, from the session');
});

// ---------- routes ----------

test('evidence routes: own registrar, session + CSRF on the write (PR-16C)', () => {
  const routes = read(ROUTES);
  ok(/app\.get\(\s*'\/api\/vault\/workspaces\/:slug\/exceptions\/:id\/remediation-evidence'/.test(routes),
    'GET remediation-evidence route must be registered');
  const postBlock = routes.match(/app\.post\(\s*'\/api\/vault\/workspaces\/:slug\/exceptions\/:id\/remediation-evidence'[\s\S]*?\);/);
  ok(postBlock, 'POST remediation-evidence route must be registered');
  ok(/requireVaultSession/.test(postBlock[0]) && /requireCsrf/.test(postBlock[0]),
    'recording evidence must require session + CSRF');
  const literals = [...routes.matchAll(/'(\/api\/[^']+)'/g)].map((m) => m[1]);
  ok(literals.every((l) => l.startsWith('/api/vault/')), 'all literals under the private prefix');
  const vaultRoutes = read('src/server/vault/routes.js');
  ok(/registerRemediationEvidenceRoutes/.test(vaultRoutes),
    'vault routes must call registerRemediationEvidenceRoutes');
  ok(!/remediation-evidence'/.test(vaultRoutes),
    'routes.js must not carry the new literal (snapshot invariant)');
});

// ---------- export: evidence joins the bundle honestly ----------

function chainWithDirection(withEvidence) {
  return {
    workspace: { slug: 'acme', display_name: null },
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
    remediationEvidence: withEvidence ? [{
      evidence_id: 'ab999999-9999-9999-9999-999999999999',
      exception_id: 'd5555555-5555-5555-5555-555555555555',
      evidence_type: 'fixed_version_observed',
      evidence_ref: 'left-pad@1.4.0 observed (exposure e2222222)',
      recorded_by: { user_id: 'u3', github_login: 'closer', display_name: null },
      reason_public: 'Upgrade landed; the new version is in the record.',
      related_resolution_id: 'f7777777-7777-7777-7777-777777777777',
      related_question_id: null,
      source_vuln_intel_id: null,
      created_at: '2026-06-10T12:00:00.000Z',
    }] : [],
    timelineEvents: [],
    generatedAt: '2026-06-11T12:00:00.000Z',
  };
}

test('export includes remediation evidence when present, linked to the direction (PR-16C)', () => {
  const bundle = buildEvidenceBundle(chainWithDirection(true));
  const section = bundle.sections.remediation_evidence;
  ok(section.present === true, 'section must be present');
  ok(section.case_status === 'evidence_recorded', 'derived case status must be evidence_recorded');
  ok(section.evidence[0].evidence_ref === 'left-pad@1.4.0 observed (exposure e2222222)',
    'the citation must be reproduced verbatim');
  const md = renderEvidenceBundleMarkdown(bundle);
  ok(/## 8\. Remediation evidence/.test(md), 'markdown section 8 must be remediation evidence');
  ok(md.indexOf('## 7. Reviewer resolution') < md.indexOf('## 8. Remediation evidence'),
    'evidence must follow the reviewer direction');
  ok(md.includes('ab999999-9999-9999-9999-999999999999'), 'evidence id verbatim');
  ok(md.includes('@closer'), 'the human who recorded the evidence is named');
  ok(/answers reviewer direction `f7777777-7777-7777-7777-777777777777`/.test(md),
    'the evidence must cite the direction it answers');
  ok(/does not verify the fix/.test(md), 'the section must carry the non-verification note');
  ok(/A recorded direction is not completed remediation/.test(md),
    'the honest edge must survive even when evidence exists');
});

test('export: direction without evidence reads awaiting_evidence and lands in missing (PR-16C)', () => {
  const bundle = buildEvidenceBundle(chainWithDirection(false));
  const section = bundle.sections.remediation_evidence;
  ok(section.present === false, 'no evidence -> not present');
  ok(section.case_status === 'awaiting_evidence', 'derived status must be awaiting_evidence');
  ok(bundle.honest_edges.missing.some((m) => /remediation evidence/.test(m)),
    'a directed-but-unevidenced case must appear in the missing list');
  const md = renderEvidenceBundleMarkdown(bundle);
  ok(/no remediation evidence has been cited yet/.test(md),
    'markdown must say the evidence is not yet cited');
  ok(/A recorded direction is not completed remediation/.test(md),
    'the honest edge must be stated');
});

test('export still works with no remediation direction at all (PR-16C)', () => {
  const records = chainWithDirection(false);
  records.resolutions[0].outcome = 'revoke';
  const bundle = buildEvidenceBundle(records);
  ok(bundle.sections.remediation_evidence.case_status === 'no_remediation_direction',
    'no direction -> no_remediation_direction');
  ok(!bundle.honest_edges.missing.some((m) => /remediation evidence/.test(m)),
    'evidence must not be missing when nothing made it due');
  const md = renderEvidenceBundleMarkdown(bundle);
  ok(/no remediation evidence is due/.test(md), 'markdown must say nothing is due');
});

// ---------- UI + client: no certification language ----------

test('UI records evidence without certification language (PR-16C)', () => {
  const src = read(UI);
  ok(/Remediation evidence/.test(src), 'detail must render the Remediation evidence section');
  ok(/Record remediation evidence/.test(src), 'the action must be "Record remediation evidence"');
  ok(/listRemediationEvidence/.test(src) && /recordRemediationEvidence/.test(src),
    'detail must use the dedicated helpers');
  for (const t of EVIDENCE_TYPES) {
    ok(src.includes(`'${t}'`), `detail must offer the ${t} evidence type`);
  }
  ok(/hasRemediationDirection && \(/.test(src),
    'the section must render only when a remediation_required direction exists');
  ok(/does not verify the fix/.test(src), 'UI copy must carry the non-verification statement');
  // Forbidden certification language as a system assertion.
  ok(!/Mark fixed/i.test(src), 'no "Mark fixed"');
  ok(!/Certified remediated/i.test(src), 'no "Certified remediated"');
  ok(!/Verified safe/i.test(src), 'no "Verified safe"');
  ok(!/>\s*fixed\s*</i.test(src), 'no bare "fixed" as a rendered system claim');
});

test('api-client evidence helpers: list + record only, 4 types, derived status union (PR-16C)', () => {
  const api = read('src/shared/vault/api-client.ts');
  const typeMatch = api.match(/export type RemediationEvidenceType\s*=([\s\S]*?);/);
  ok(typeMatch, 'RemediationEvidenceType union must be exported');
  const types = (typeMatch[1].match(/'[a-z_]+'/g) || []).map((s) => s.replace(/'/g, ''));
  ok(JSON.stringify([...types].sort()) === JSON.stringify([...EVIDENCE_TYPES].sort()),
    'client union must match the 0026 allowlist exactly');
  ok(/export type RemediationCaseStatus/.test(api), 'derived case-status union must be exported');
  const recordBlock = api.match(/export async function recordRemediationEvidence[\s\S]*?\n}/);
  ok(recordBlock, 'recordRemediationEvidence not found');
  ok(/\/remediation-evidence`/.test(recordBlock[0]) && /method:\s*['"]POST['"]/.test(recordBlock[0]),
    'record helper must POST to the remediation-evidence sub-path only');
  ok(!/approve|reject|revoke|extend|resolve`/.test(recordBlock[0]),
    'record helper must never reach trust-decision verbs');
});

// ---------- guard + wiring ----------

test('release-integrity guard knows the 0026 table and the new route family (PR-16C)', () => {
  const guard = read('scripts/check-release-integrity.mjs');
  ok(/component_remediation_evidence/.test(guard), 'REQUIRED_TABLES must include the 0026 table');
  ok(/remediation-evidence-routes\.js/.test(guard), 'literal scan must include the registrar');
  ok(/exceptions\/__guard__\/remediation-evidence/.test(guard), 'runtime layer must probe the route family');
});

test('package.json wires test:remediation-evidence-v0 into test:ci (PR-16C)', () => {
  const pkg = JSON.parse(read('package.json'));
  ok(pkg.scripts['test:remediation-evidence-v0'], 'missing test:remediation-evidence-v0 script');
  ok(/test-remediation-evidence-v0\.mjs/.test(pkg.scripts['test:ci'] || ''),
    'test:ci must chain scripts/test-remediation-evidence-v0.mjs');
});

(async () => {
  for (const fn of pending) await fn();
  console.log(`\nRemediation evidence v0 tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
