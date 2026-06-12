#!/usr/bin/env node
/**
 * PR-EV-1 invariants for evidence citation verification checks.
 *
 * DOCTRINE:
 *   Evidence verification checks citations; it does not certify truth.
 *   A passing check means the cited reference was reachable and matched
 *   the expected shape at check time.
 *   A failed check means the citation could not be confirmed.
 *   An inconclusive check is allowed and honest.
 *   The human still records evidence. The system may check the
 *   reference. The export preserves both.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseUuidFromRef,
  parseGithubRef,
  compareObservedVersions,
  VERIFICATION_CHECK_KINDS,
  VERIFICATION_CHECK_STATUSES,
  VERIFICATION_NON_CLAIM,
} from '../src/server/vault/evidence-verification.js';
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

const MIGRATION = 'supabase/migrations/0028_evidence_verification_checks.sql';
const MODULE = 'src/server/vault/evidence-verification.js';
const ROUTES = 'src/server/vault/evidence-verification-routes.js';

// ---------- 0028: append-only observations with a bounded vocabulary ----------

test('0028 check table: bounded kinds + statuses, required summary, RLS (PR-EV-1)', () => {
  const sql = readSqlNoComments(MIGRATION);
  ok(/create table if not exists public\.evidence_verification_checks/.test(sql),
    '0028 must create evidence_verification_checks');
  ok(/workspace_id\s+uuid not null/.test(sql) && /evidence_id\s+uuid not null/.test(sql),
    'workspace + evidence links are required');
  const kinds = sql.match(/check_kind in \(([^)]*)\)/)[1].match(/'[a-z_]+'/g).map((s) => s.replace(/'/g, ''));
  ok(JSON.stringify([...kinds].sort()) === JSON.stringify([...VERIFICATION_CHECK_KINDS].sort()),
    'check kinds are exactly the three narrow v0 kinds');
  const statuses = sql.match(/check_status in \(([^)]*)\)/)[1].match(/'[a-z_]+'/g).map((s) => s.replace(/'/g, ''));
  ok(JSON.stringify([...statuses].sort()) === JSON.stringify([...VERIFICATION_CHECK_STATUSES].sort()),
    'statuses are exactly check_passed / check_failed / check_inconclusive');
  ok(/summary_public\s+text not null check \(length\(summary_public\) between 1 and 500\)/.test(sql),
    'a check without a summary is not a record');
  ok(/alter table public\.evidence_verification_checks enable row level security/.test(sql), 'RLS');
  ok(!/create unique index/.test(sql), 'checks are append-only — re-running appends, never overwrites');
});

test('0028 firewall: no verdict vocabulary, no write-back anywhere (PR-EV-1)', () => {
  const sql = readSqlNoComments(MIGRATION);
  ok(!/'verified'|'certified'|'compliant'|'remediated'|verified_fixed|verified_safe/.test(sql),
    'no verdict vocabulary in 0028');
  ok(!/alter table public\.component_remediation_evidence\b/.test(sql),
    '0028 must not alter the evidence table');
  ok(!/alter table public\.vault_exceptions\b/.test(sql), '0028 must not alter exceptions');
  ok(!/vault_timeline_events/.test(sql), '0028 must not reference the timeline');
});

// ---------- the module: observes citations, never mutates the record ----------

test('verification module writes exactly one table; evidence rows are never mutated (PR-EV-1)', () => {
  const src = stripJsComments(read(MODULE));
  const writes = src.match(/\.from\(['"]([a-z_]+)['"]\)[\s\S]{0,200}?\.(insert|update|delete|upsert)\(/g) || [];
  ok(writes.length === 1 && /evidence_verification_checks/.test(writes[0]),
    `the module must write exactly one table (evidence_verification_checks), found: ${JSON.stringify(writes)}`);
  ok(!/from\(['"]component_remediation_evidence['"]\)[\s\S]{0,200}\.(update|insert|delete|upsert)\(/.test(src),
    'the evidence row is read for checking, never written');
  ok(!/from\(['"]vault_exceptions['"]\)/.test(src), 'must not touch exceptions');
  ok(!/vault_timeline_events|recordProposalFromExposure|recordOutcomeFromExposure|recordExpiredFromExposure/.test(src),
    'must not touch the timeline or CEI recorders');
  ok(/resolveWorkspaceForMember/.test(src), 'workspace-scoped, membership-gated');
});

test('no verdict vocabulary as system assertions in the module (PR-EV-1)', () => {
  const src = stripJsComments(read(MODULE));
  ok(!/'verified_fixed'|'verified_safe'|'certified'|'compliant'|'remediation_verified'/.test(src),
    'banned verdict values must not exist as code values');
  ok(/pr_merged_observed/.test(src),
    'PR merged status is labeled pr_merged_observed — what was observed, never remediation_verified');
  ok(/VERIFICATION_NON_CLAIM/.test(src) && /does not certify remediation/.test(VERIFICATION_NON_CLAIM),
    'the non-claim is a module constant and disclaims certification');
  ok(/check_inconclusive/.test(src), 'inconclusive is a first-class answer');
});

// ---------- pure parsers + comparison ----------

test('parseUuidFromRef finds internal citations and refuses noise (PR-EV-1)', () => {
  ok(parseUuidFromRef('lodash@4.17.21 follow-up observation (exposure 28f6c108-60ec-4841-88c9-85af11ab086f)')
    === '28f6c108-60ec-4841-88c9-85af11ab086f', 'finds the cited exposure id');
  ok(parseUuidFromRef('upgraded, see ticket OPS-123') === null, 'no uuid -> null (inconclusive path)');
});

test('parseGithubRef handles URL, shorthand, and noise (PR-EV-1)', () => {
  const pr = parseGithubRef('https://github.com/lodash/lodash/pull/5085');
  ok(pr && pr.owner === 'lodash' && pr.kind === 'pull' && pr.id === '5085', 'PR URL parsed');
  const commit = parseGithubRef('see github.com/acme/app/commit/abc123def fix');
  ok(commit && commit.kind === 'commit' && commit.id === 'abc123def', 'commit URL parsed');
  const short = parseGithubRef('fixed in acme/app#42');
  ok(short && short.kind === 'pull' && short.id === '42', 'owner/repo#N shorthand parsed');
  const sha = parseGithubRef('acme/app@deadbeefcafe');
  ok(sha && sha.kind === 'commit', 'owner/repo@sha shorthand parsed');
  ok(parseGithubRef('upgraded to 2.0.0') === null, 'no github ref -> null (inconclusive path)');
});

test('compareObservedVersions asserts only what it can compare (PR-EV-1)', () => {
  const later = compareObservedVersions('4.17.20', '4.17.21');
  ok(later.different && later.comparable && later.later === true, '4.17.21 is later than 4.17.20');
  const earlier = compareObservedVersions('4.17.21', '4.17.20');
  ok(earlier.different && earlier.later === false, 'an earlier version is reported as NOT later');
  const same = compareObservedVersions('1.0.0', '1.0.0');
  ok(!same.different, 'same version is not different');
  const weird = compareObservedVersions('1.0.0-beta', '1.0.0');
  ok(weird.different && weird.comparable === false && weird.later === null,
    'non-numeric versions are honestly incomparable — different is the only assertion');
});

// ---------- routes + handler behavior ----------

test('check routes: own registrar, session + CSRF on the run, no token path (PR-EV-1)', () => {
  const routes = read(ROUTES);
  ok(/app\.get\(\s*'\/api\/vault\/workspaces\/:slug\/remediation-evidence\/:id\/verification-checks'/.test(routes),
    'GET history route registered');
  const postBlock = routes.match(/app\.post\(\s*'\/api\/vault\/workspaces\/:slug\/remediation-evidence\/:id\/verification-checks'[\s\S]*?\);/);
  ok(postBlock, 'POST run route registered');
  ok(/requireVaultSession/.test(postBlock[0]) && /requireCsrf/.test(postBlock[0]),
    'running a check requires session + CSRF');
  ok(!/requireVaultReader/.test(routes), 'no token-auth path on check routes in v0');
  const vaultRoutes = read('src/server/vault/routes.js');
  ok(/registerEvidenceVerificationRoutes/.test(vaultRoutes), 'mounted from the single private route table');
  ok(!/verification-checks'/.test(vaultRoutes), 'routes.js carries no new literal (snapshot invariant)');
});

test('handler: 404 on missing evidence, workspace-scoped, bounded kind allowlist (PR-EV-1)', () => {
  const src = stripJsComments(read(MODULE));
  ok(/loadEvidenceInWorkspace/.test(src) && /eq\('workspace_id', workspaceId\)/.test(src),
    'evidence is loaded workspace-scoped — cross-workspace evidence cannot be checked');
  ok(/not_found/.test(src), 'missing evidence -> 404');
  ok(/VERIFICATION_CHECK_KINDS\.includes\(checkKind\)/.test(src), 'check kind is allowlisted');
  ok(/checked_by:\s*req\.vaultSession\.user_id/.test(src), 'v0 checks record the human who asked');
  ok(/summary\.slice\(0, 500\)/.test(src) && /boundDetail/.test(src), 'summary + detail are bounded');
});

test('external checks are bounded and honest about failure modes (PR-EV-1)', () => {
  const src = stripJsComments(read(MODULE));
  ok(/AbortController/.test(src) && /EXTERNAL_TIMEOUT_MS/.test(src), 'external calls carry a timeout');
  ok(/api\.github\.com/.test(src), 'github checks target api.github.com only');
  ok(/rate-limited/.test(read(MODULE)), 'github non-404 failures map to inconclusive with the reason named');
  ok(/citation_not_found/.test(src) && /citation_shape_mismatch/.test(src)
    && /internal_record_linked/.test(src) && /source_no_longer_matches/.test(src),
    'result vocabulary uses the allowed terms');
  ok(/Other advisories may still apply/.test(read(MODULE)),
    'the rescan pass explicitly disclaims being a safety statement');
});

// ---------- webhook payload ----------

test('verification webhook payload speaks check vocabulary with the non-claim (PR-EV-1)', () => {
  const payload = buildWebhookPayload({
    eventId: '33333333-3333-3333-3333-333333333333',
    eventType: 'evidence_verification.checked',
    workspace: { workspace_id: 'w1', slug: 'acme' },
    occurredAt: '2026-06-12T13:00:00.000Z',
    actor: { github_login: 'checker' },
    recordIds: { check_id: 'c1', evidence_id: 'v1', exception_id: 'e1' },
    state: 'check_passed',
    verificationCheck: { check_kind: 'internal_exposure_reference', check_status: 'check_passed' },
  });
  ok(payload.verification_check.check_status === 'check_passed', 'check result travels in its own field');
  ok(payload.reviewer_direction === undefined && payload.remediation_evidence === undefined,
    'a check event is neither a direction nor evidence — distinct fields, never coexisting');
  ok(/does not certify/.test(payload.non_claim), 'the non-claim travels');
  const json = JSON.stringify(payload);
  for (const banned of ['"fixed"', '"verified_safe"', '"certified"', '"compliant"', '"remediated"']) {
    ok(!json.includes(banned), `payload must never carry ${banned}`);
  }
});

// ---------- export integration ----------

test('export carries citation checks after evidence with the non-claim (PR-EV-1)', () => {
  const exportSrc = read('src/server/vault/evidence-export.js');
  ok(/citation_checks/.test(exportSrc), 'the bundle carries a citation_checks section');
  ok(/## 9\. Citation checks/.test(exportSrc) && /## 10\. Receipt trail/.test(exportSrc),
    'checks render after evidence, before the receipt trail');
  ok(/A passing citation check does not certify remediation or prove absence of vulnerabilities\./.test(exportSrc),
    'the EV-1 non-claim is in the export');
  ok(/verification_check_ids/.test(exportSrc), 'check ids join the receipt trail');
});

// ---------- UI vocabulary ----------

test('UI uses check labels, never certification labels (PR-EV-1)', () => {
  const src = read('src/pages/vault/VaultExceptionDetail.tsx');
  ok(/Citation checks/.test(src), 'the UI area is called Citation checks');
  ok(/Run citation check/.test(src), 'the action is Run citation check');
  ok(/confirms the citation, not the remediation/.test(src), 'the UI carries the non-claim');
  for (const banned of ['Verify fixed', 'Mark verified', 'Certified remediation', 'Verified safe']) {
    ok(!src.includes(banned), `UI must not say "${banned}"`);
  }
});

// ---------- guard + wiring ----------

test('release-integrity guard knows the 0028 table and the check route family (PR-EV-1)', () => {
  const guard = read('scripts/check-release-integrity.mjs');
  ok(/evidence_verification_checks/.test(guard), 'REQUIRED_TABLES includes the 0028 table');
  ok(/evidence-verification-routes\.js/.test(guard), 'literal scan includes the registrar');
  ok(/remediation-evidence\/__guard__\/verification-checks/.test(guard), 'runtime probe exists');
});

test('package.json wires test:evidence-verification-v0 into test:ci (PR-EV-1)', () => {
  const pkg = JSON.parse(read('package.json'));
  ok(pkg.scripts['test:evidence-verification-v0'], 'missing test:evidence-verification-v0 script');
  ok(/test-evidence-verification-v0\.mjs/.test(pkg.scripts['test:ci'] || ''),
    'test:ci must chain scripts/test-evidence-verification-v0.mjs');
});

(async () => {
  for (const fn of pending) await fn();
  console.log(`\nEvidence verification v0 tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
