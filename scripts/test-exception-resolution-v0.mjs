#!/usr/bin/env node
/**
 * PR-16B structural invariants for expired trust reviewer resolution.
 *
 * DOCTRINE:
 *   Expired trust creates review pressure.
 *   Reviewer resolution creates the next trust decision.
 *   The reaper does not decide.
 *   The reviewer decides.
 *   The record remembers.
 *
 * HARD WALL:
 *   No auto-renew. No auto-revoke. No auto-remediate. No silent extension.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
const pending = [];

function test(name, fn) {
  pending.push(() => {
    try {
      fn();
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

const RESOLUTION_MIGRATION = 'supabase/migrations/0025_vault_exception_resolutions.sql';
const MODULE = 'src/server/vault/exception-resolutions.js';
const ROUTES = 'src/server/vault/resolution-routes.js';

const RESOLUTION_OUTCOMES = [
  'renew',
  'revoke',
  'remediation_required',
  'resolved_externally',
  'defer',
  'remediation_question',
];

// ---------- 0025: the review-case record ----------

test('0025 resolution table: shape + reviewer NOT NULL + reason required (PR-16B)', () => {
  const sql = readSqlNoComments(RESOLUTION_MIGRATION);
  ok(/create table if not exists public\.vault_exception_resolutions/.test(sql),
    '0025 must create vault_exception_resolutions');
  ok(/workspace_id\s+uuid\s+not null[\s\S]*?references public\.vault_workspaces/.test(sql),
    'workspace_id must be NOT NULL FK (isolation)');
  ok(/exception_id\s+uuid\s+not null[\s\S]*?references public\.vault_exceptions/.test(sql),
    'exception_id must be NOT NULL — a resolution is always about one review case');
  ok(/resolved_by\s+uuid\s+not null references public\.vault_users/.test(sql),
    'resolved_by must be a NOT NULL FK — there is no system resolution');
  ok(/reason_public\s+text\s+not null check \(length\(reason_public\) between 1 and 280\)/.test(sql),
    'reason_public must be REQUIRED — a resolution without a reason is not evidence');
  const outcomeMatch = sql.match(/outcome in \(([^)]*)\)/);
  ok(outcomeMatch, 'outcome must carry an allowlist CHECK');
  const outcomes = (outcomeMatch[1].match(/'[a-z_]+'/g) || []).map((s) => s.replace(/'/g, ''));
  ok(JSON.stringify([...outcomes].sort()) === JSON.stringify([...RESOLUTION_OUTCOMES].sort()),
    `outcome allowlist must be exactly ${JSON.stringify(RESOLUTION_OUTCOMES)}, found ${JSON.stringify(outcomes)}`);
  ok(/alter table public\.vault_exception_resolutions enable row level security/.test(sql),
    'resolution table must enable RLS');
});

test('0025 citation coherence: renew cites the new proposal; nothing carries unused citations (PR-16B)', () => {
  const sql = readSqlNoComments(RESOLUTION_MIGRATION);
  ok(/renewed_exception_id uuid\s*\n?[\s\S]{0,140}references public\.vault_exceptions\(exception_id\) on delete set null/.test(sql),
    'renewed_exception_id must be a nullable set-null FK');
  ok(/linked_question_id\s+uuid\s*\n?[\s\S]{0,160}references public\.component_remediation_questions\(question_id\) on delete set null/.test(sql),
    'linked_question_id must be a nullable set-null FK to the 15B lane');
  ok(/citation_coherence check \(/.test(sql), '0025 must carry the citation-coherence CHECK');
  ok(/outcome = 'renew' and renewed_exception_id is not null and linked_question_id is null/.test(sql),
    'renew must require its citation and forbid the other');
  ok(/outcome = 'remediation_question' and linked_question_id is not null and renewed_exception_id is null/.test(sql),
    'remediation_question must require its citation and forbid the other');
  ok(/renewed_exception_id <> exception_id/.test(sql),
    'a renewal must not be able to cite itself');
});

test('0025 firewall: a record, never a state transition (PR-16B)', () => {
  const sql = readSqlNoComments(RESOLUTION_MIGRATION);
  ok(!/alter table public\.vault_exceptions\b/.test(sql),
    '0025 must not alter vault_exceptions — the state machine is untouched');
  ok(!/vault_timeline_events/.test(sql), '0025 must not reference vault_timeline_events');
  ok(!/component_exposure/.test(sql.replace(/component_remediation_questions/g, '')),
    '0025 must not reference exposure/intel/event tables');
  ok(!/proof_anchors/.test(sql), 'a resolution is not evidence — no proof_anchors');
  ok(!/\bexpires_at\b/.test(sql), '0025 must carry NO expiry machinery — no silent extension');
  ok(!/create unique index/.test(sql),
    'resolutions are append-only and revisitable (defer) — no unique-per-exception constraint');
});

// ---------- the module: a recorder, never a decider-for-humans ----------

test('resolution module never writes the exception — expired is time truth (PR-16B)', () => {
  const src = stripJsComments(read(MODULE));
  ok(!/from\(['"]vault_exceptions['"]\)[\s\S]{0,160}\.(update|insert|delete|upsert)\(/.test(src),
    'the module must never write vault_exceptions — no renew-in-place, no revive, no silent extension');
  ok(!/expires_at:\s*/.test(src), 'the module must never set expires_at');
  ok(!/state:\s*['"]/.test(src), 'the module must never write any state value');
  // The ONLY write is the resolution insert.
  const writes = src.match(/\.from\(['"]([a-z_]+)['"]\)[\s\S]{0,160}?\.(insert|update|delete|upsert)\(/g) || [];
  ok(writes.length === 1 && /vault_exception_resolutions/.test(writes[0]),
    `the module must write exactly one table (vault_exception_resolutions), found: ${JSON.stringify(writes)}`);
});

test('resolution module: reviewer role, expired-only, workspace-scoped (PR-16B)', () => {
  const src = stripJsComments(read(MODULE));
  ok(/requireRole\(res, membership, 'reviewer'\)/.test(src),
    'resolving must require the reviewer role — it is a trust decision about what happens next');
  ok(/state !== 'expired'/.test(src) && /409/.test(src),
    'non-expired exceptions must be refused with a conflict — live trust uses the existing reviewer actions');
  const handlers = src.match(/export async function handle\w+/g) || [];
  ok(handlers.length === 2, `expected exactly 2 resolution handlers, found ${handlers.length}`);
  const calls = src.match(/resolveWorkspaceForMember/g) || [];
  ok(calls.length >= handlers.length, 'each handler must resolve workspace membership');
  ok(/resolved_by:\s*req\.vaultSession\.user_id/.test(src),
    'resolved_by must be the authenticated reviewer, from the session');
});

test('citations are validated, never created (PR-16B)', () => {
  const src = stripJsComments(read(MODULE));
  // Renew: the cited exception must exist in this workspace and not be self.
  ok(/renewedExceptionId === exceptionId/.test(src),
    'renew must refuse self-citation');
  ok(/loadExceptionInWorkspace\(supabase, workspace\.workspace_id, renewedExceptionId\)/.test(src),
    'renew must validate the cited exception in this workspace');
  // Question: read-only validation against the 15B lane.
  ok(/from\(['"]component_remediation_questions['"]\)/.test(src),
    'remediation_question must validate the cited question');
  ok(!/from\(['"]component_remediation_questions['"]\)[\s\S]{0,160}\.(insert|update|delete|upsert)\(/.test(src),
    'the module must never WRITE the question lane — cite, never create');
  // The bounded outcome list matches the migration exactly.
  const listMatch = src.match(/export const RESOLUTION_OUTCOMES\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
  ok(listMatch, 'module must export a frozen RESOLUTION_OUTCOMES array');
  const outcomes = (listMatch[1].match(/'[a-z_]+'/g) || []).map((s) => s.replace(/'/g, ''));
  ok(JSON.stringify([...outcomes].sort()) === JSON.stringify([...RESOLUTION_OUTCOMES].sort()),
    'module RESOLUTION_OUTCOMES must match the 0025 allowlist exactly');
});

test('resolution module touches no other lane (PR-16B)', () => {
  const src = stripJsComments(read(MODULE));
  ok(!/component_exposures\b/.test(src), 'must not touch exposures');
  ok(!/component_exposure_events/.test(src), 'must not touch CEI events');
  ok(!/component_exposure_vulnerabilities/.test(src), 'must not touch intelligence');
  ok(!/vault_timeline_events/.test(src), 'must not touch the shared timeline');
  ok(!/recordProposalFromExposure|recordOutcomeFromExposure|recordExpiredFromExposure/.test(src),
    'must not record CEI events');
  ok(!/'BLOCK'|'WARN'|'ALLOW'/.test(src),
    'must not reference the decision vocabulary — a resolution is a direction, not a gate action');
  ok(!/octokit|child_process/i.test(src), 'no auto-remediation machinery');
});

test('Phase 5 state machine is untouched by 16B (PR-16B)', () => {
  // exceptions.js (the state machine) must not know resolutions exist, and
  // its propose/approve/revoke guards are unchanged.
  const ex = stripJsComments(read('src/server/vault/exceptions.js'));
  ok(!/resolution/i.test(ex), 'exceptions.js must not know resolutions exist (lanes stay separate)');
  // The reaper is also untouched by 16B and still cannot resolve.
  const reaper = stripJsComments(read('scripts/reap-expired-exceptions.mjs'));
  ok(!/vault_exception_resolutions|handleResolve/.test(reaper),
    'the reaper must not write resolutions — the reaper does not decide');
});

// ---------- routes ----------

test('resolution routes: own registrar, session + reviewer-lane CSRF (PR-16B)', () => {
  const routes = read(ROUTES);
  ok(/app\.get\(\s*'\/api\/vault\/workspaces\/:slug\/exceptions\/:id\/resolutions'/.test(routes),
    'GET resolutions route must be registered');
  const resolveBlock = routes.match(/app\.post\(\s*'\/api\/vault\/workspaces\/:slug\/exceptions\/:id\/resolve'[\s\S]*?\);/);
  ok(resolveBlock, 'POST resolve route must be registered');
  ok(/requireVaultSession/.test(resolveBlock[0]) && /requireCsrf/.test(resolveBlock[0]),
    'resolve must require session + CSRF');
  // Mounted through the single private route table.
  const vaultRoutes = read('src/server/vault/routes.js');
  ok(/registerResolutionRoutes/.test(vaultRoutes),
    'vault routes must call registerResolutionRoutes');
  // The PR-V2-E snapshot invariant survives: no new literal in routes.js.
  ok(!/resolutions'/.test(vaultRoutes) && !/resolve'/.test(vaultRoutes),
    'routes.js must not carry the new literals (they live in the registrar)');
});

// ---------- dashboard ----------

test('exception detail treats expired as a review case (PR-16B)', () => {
  const src = read('src/pages/vault/VaultExceptionDetail.tsx');
  ok(/Reviewer resolution/.test(src), 'detail must render the Reviewer resolution section');
  ok(/isExpired && \(/.test(src), 'the review case must render for expired exceptions only');
  ok(/Unresolved review case/.test(src),
    'an expired exception with no resolution must read as an unresolved case');
  ok(/listExceptionResolutions/.test(src) && /resolveExpiredException/.test(src),
    'detail must use the dedicated resolution helpers');
  for (const outcome of RESOLUTION_OUTCOMES) {
    ok(src.includes(`'${outcome}'`), `detail must offer the ${outcome} direction`);
  }
  ok(/isReviewerOrOwner \?/.test(src) || /requires the reviewer or owner role/.test(src),
    'the resolution form must be role-gated');
  ok(/propose it first via the existing lane|new proposal through the existing exception lane/i.test(src),
    'renew must instruct citation of a proposal from the EXISTING lane');
});

test('api-client resolution helpers: read + resolve only, union of 6 (PR-16B)', () => {
  const api = read('src/shared/vault/api-client.ts');
  const unionMatch = api.match(/export type ResolutionOutcome\s*=([\s\S]*?);/);
  ok(unionMatch, 'api-client must export the ResolutionOutcome union');
  const outcomes = (unionMatch[1].match(/'[a-z_]+'/g) || []).map((s) => s.replace(/'/g, ''));
  ok(JSON.stringify([...outcomes].sort()) === JSON.stringify([...RESOLUTION_OUTCOMES].sort()),
    `ResolutionOutcome must be exactly the 6 reviewer directions, found ${JSON.stringify(outcomes)}`);
  const listBlock = api.match(/export async function listExceptionResolutions[\s\S]*?\n}/);
  ok(listBlock, 'listExceptionResolutions not found');
  ok(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(listBlock[0]), 'list helper must be a GET');
  const resolveBlock = api.match(/export async function resolveExpiredException[\s\S]*?\n}/);
  ok(resolveBlock, 'resolveExpiredException not found');
  ok(/\/resolve`/.test(resolveBlock[0]) && /method:\s*['"]POST['"]/.test(resolveBlock[0]),
    'resolve helper must POST to the /resolve sub-path only');
  ok(!/approve|reject|revoke|extend/.test(resolveBlock[0]),
    'resolve helper must never reach the live-trust reviewer verbs');
});

// ---------- guard + wiring ----------

test('release-integrity guard knows the 0025 table and the new route family (PR-16B)', () => {
  const guard = read('scripts/check-release-integrity.mjs');
  ok(/vault_exception_resolutions/.test(guard),
    'REQUIRED_TABLES must include vault_exception_resolutions');
  ok(/resolution-routes\.js/.test(guard),
    'the layer-0 route-literal scan must include the resolution registrar');
  ok(/exceptions\/__guard__\/resolutions/.test(guard),
    'the runtime layer must probe the resolutions route family');
});

test('package.json wires test:exception-resolution-v0 into test:ci (PR-16B)', () => {
  const pkg = JSON.parse(read('package.json'));
  ok(pkg.scripts['test:exception-resolution-v0'], 'missing test:exception-resolution-v0 script');
  ok(/test-exception-resolution-v0\.mjs/.test(pkg.scripts['test:ci'] || ''),
    'test:ci must chain scripts/test-exception-resolution-v0.mjs');
});

(async () => {
  for (const fn of pending) await fn();
  console.log(`\nException resolution v0 tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
