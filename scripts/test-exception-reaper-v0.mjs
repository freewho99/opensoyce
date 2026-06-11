#!/usr/bin/env node
/**
 * PR-16A structural invariants for the exception expiry reaper.
 *
 * DOCTRINE:
 *   Temporary trust must not become permanent by neglect.
 *   Expiry is time evidence, not reviewer judgment.
 *   The reaper observes that time passed.
 *   The reaper does not decide the risk.
 *   The record remembers that review pressure became due.
 *
 *   An expired exception is not a revoked exception.
 *   An expired exception is not an approved renewal.
 *   An expired exception is not proof of remediation.
 *   The reviewer still decides what happens next.
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

const EXPIRED_MIGRATION = 'supabase/migrations/0024_cei_expired_event_kind.sql';
const REAPER = 'scripts/reap-expired-exceptions.mjs';

const ALL_EVENT_KINDS_16A = [
  'exception_proposed_from_exposure',
  'exception_approved_from_exposure',
  'exception_rejected_from_exposure',
  'exception_revoked_from_exposure',
  'exception_expired_from_exposure',
];

// ---------- the foundations 16A builds on (must still hold) ----------

test('the state machine carried expired since 0011; 0024 does not touch vault_exceptions', () => {
  const states = read('supabase/migrations/0011_vault_exceptions.sql');
  ok(/check \(state in \('proposed','reviewed','active','rejected','revoked','expired'\)\)/.test(states),
    "0011 state CHECK must still carry 'expired' as a first-class state");
  const sql = readSqlNoComments(EXPIRED_MIGRATION);
  ok(!/alter table public\.vault_exceptions/.test(sql),
    '0024 must not alter vault_exceptions — expired was already a legal state');
});

test('the Phase 5 trigger emits exception_expired with a NULL actor; 0024 leaves it untouched', () => {
  const trigger = read('supabase/migrations/0015_vault_exception_timeline_triggers.sql');
  ok(/new\.state = 'expired' and old\.state = 'active'/.test(trigger),
    '0015 must handle the active -> expired transition');
  ok(/v_event_type := 'exception_expired';\s*\n\s*v_actor := null;/.test(trigger),
    '0015 must emit exception_expired with a NULL actor (reaper has no human)');
  const sql = readSqlNoComments(EXPIRED_MIGRATION);
  ok(!/vault_timeline_events/.test(sql), '0024 must not reference vault_timeline_events');
  ok(!/create or replace function/.test(sql), '0024 must not redefine any trigger function');
});

// ---------- 0024: the expired kind + the system actor ----------

test('0024 widens the kind allowlist to exactly the 16A set, loudly (PR-16A)', () => {
  const sql = readSqlNoComments(EXPIRED_MIGRATION);
  ok(/drop constraint component_exposure_events_event_kind_check/.test(sql)
    && !/drop constraint if exists/.test(sql),
    '0024 must drop the 0020 CHECK by name, without "if exists" (loud-failure contract)');
  const checkMatch = sql.match(/check \(event_kind in \(([^)]*)\)/);
  ok(checkMatch, '0024 must re-add the event_kind CHECK');
  const kinds = (checkMatch[1].match(/'[a-z_]+'/g) || []).map((s) => s.replace(/'/g, ''));
  ok(JSON.stringify([...kinds].sort()) === JSON.stringify([...ALL_EVENT_KINDS_16A].sort()),
    `0024 allowlist must be exactly ${JSON.stringify(ALL_EVENT_KINDS_16A)}, found ${JSON.stringify(kinds)}`);
});

test('0024 actor nullability is scoped to the expired kind ONLY (PR-16A)', () => {
  const sql = readSqlNoComments(EXPIRED_MIGRATION);
  ok(/alter column actor_user_id drop not null/.test(sql),
    '0024 must make actor_user_id nullable (expiry has no human)');
  ok(/actor_user_id is not null\s*\n?\s*or event_kind = 'exception_expired_from_exposure'/.test(sql),
    'the named CHECK must require an actor for every HUMAN kind — only expired may be system');
});

test('0024 makes reaper idempotency structural: one expired event per exception (PR-16A)', () => {
  const sql = readSqlNoComments(EXPIRED_MIGRATION);
  ok(/create unique index[\s\S]*?\(related_exception_id\)[\s\S]*?where event_kind = 'exception_expired_from_exposure'/.test(sql),
    '0024 must add the partial unique index — at most one expired event per exception, ever');
});

test('0024 firewall: kind + actor + index, nothing else (PR-16A)', () => {
  const sql = readSqlNoComments(EXPIRED_MIGRATION);
  ok(!/create table/i.test(sql), '0024 must not create any table');
  ok(!/add column/i.test(sql), '0024 must not add any column');
  ok(!/component_exposures\b/.test(sql.replace(/component_exposure_events/g, '')),
    '0024 must not touch component_exposures');
  ok(!/component_remediation_questions/.test(sql), '0024 must not touch the question layer');
  ok(!/component_exposure_vulnerabilities/.test(sql), '0024 must not touch the intelligence layer');
});

// ---------- events.js: the expired recorder ----------

test('events.js: expired joins EVENT_KINDS but is NOT an outcome (PR-16A)', () => {
  const events = read('src/server/cei/events.js');
  const evMatch = events.match(/export const EVENT_KINDS\s*=\s*Object\.freeze\(\[([^\]]*)\]/);
  ok(evMatch, 'events.js must export a frozen EVENT_KINDS array');
  const evKinds = (evMatch[1].match(/'[a-z_]+'/g) || []).map((s) => s.replace(/'/g, ''));
  ok(JSON.stringify([...evKinds].sort()) === JSON.stringify([...ALL_EVENT_KINDS_16A].sort()),
    'events.js EVENT_KINDS must match the 0024 allowlist exactly');
  // Expiry is time evidence, not reviewer judgment: the OUTCOME list must
  // NOT contain it — recordOutcomeFromExposure can never record an expiry.
  const outMatch = events.match(/export const OUTCOME_EVENT_KINDS\s*=\s*Object\.freeze\(\[([^\]]*)\]/);
  ok(outMatch, 'events.js must export OUTCOME_EVENT_KINDS');
  ok(!/expired/.test(outMatch[1]),
    'expired must NOT be an outcome kind — expiry decides nothing');
});

test('recordExpiredFromExposure: system actor, exposure-born only, idempotent (PR-16A)', () => {
  const src = stripJsComments(read('src/server/cei/events.js'));
  const body = src.match(/export async function recordExpiredFromExposure[\s\S]*?\n}\n/);
  ok(body, 'events.js must export recordExpiredFromExposure');
  ok(/actor_user_id:\s*null/.test(body[0]),
    'the expired event must carry a NULL actor (system observation)');
  ok(/actor_kind:\s*'system'/.test(body[0]) && /'expires_at elapsed'/.test(body[0]),
    'metadata must carry the system provenance and the reason');
  ok(/previous_state:\s*'active'/.test(body[0]) && /new_state:\s*'expired'/.test(body[0]),
    'metadata must carry previous/new state');
  // Discovery only via the 6D proposal event — never invented.
  ok(/PROPOSAL_EVENT_KIND/.test(body[0]) && /related_exception_id/.test(body[0]),
    'the exposure link must be discovered via the proposal event');
  ok(/skipped:\s*true/.test(body[0]),
    'non-exposure-born exceptions must record nothing (skip)');
  // Idempotency: the 23505 loser resolves to already-recorded.
  ok(/'23505'/.test(body[0]) && /alreadyRecorded:\s*true/.test(body[0]),
    'a unique-index 23505 must resolve to already-recorded, never a duplicate');
  // Recording never mutates anything.
  ok(!/\.(update|delete|upsert)\(/.test(body[0]),
    'the recorder must only insert (audit is append-only)');
  ok(!/vault_exceptions/.test(body[0]), 'the recorder must not touch vault_exceptions');
});

// ---------- the reaper command ----------

test('reaper is safe by default: dry-run unless --execute (PR-16A)', () => {
  const src = stripJsComments(read(REAPER));
  ok(/args\.includes\('--execute'\)/.test(src),
    'the reaper must require an explicit --execute flag');
  ok(/dry-run/.test(read(REAPER)), 'the reaper must describe its dry-run default');
});

test('reaper transition: guarded, state-only, decision-preserving (PR-16A)', () => {
  const src = stripJsComments(read(REAPER));
  // It identifies ACTIVE exceptions past expires_at.
  ok(/\.eq\('state', 'active'\)[\s\S]*?\.lt\('expires_at', nowIso\)/.test(src),
    'the due query must select active exceptions past expires_at');
  // The UPDATE payload is EXACTLY { state: 'expired' } — the original
  // decision (reviewer, approval time, expiry, reasons, anchors) is
  // preserved verbatim.
  const update = src.match(/\.update\(\{([^}]*)\}\)/);
  ok(update, 'the reaper must issue exactly one update shape');
  ok(/^\s*state:\s*'expired'\s*$/.test(update[1]),
    `the update payload must be exactly { state: 'expired' } — found {${update[1].trim()}}`);
  // The transition is guarded: still active AND still past-due.
  const updateBlock = src.match(/\.update\(\{[\s\S]*?\.limit\(1\)/);
  ok(updateBlock && /\.eq\('state', 'active'\)/.test(updateBlock[0]) && /\.lt\('expires_at', nowIso\)/.test(updateBlock[0]),
    'the transition must be guarded on state=active AND expires_at < now');
});

test('reaper can never decide: no revoke/approve/reject/renew/extend (PR-16A)', () => {
  const src = stripJsComments(read(REAPER));
  for (const banned of ["state: 'revoked'", "state: 'active'", "state: 'rejected'", "state: 'proposed'", 'revoked_by', 'reviewed_by:', 'revoke_reason:', 'expires_at:']) {
    ok(!src.includes(banned), `the reaper must never write ${banned} — expiry is not a decision`);
  }
  ok(!/handleApprove|handleReject|handleRevoke|handleExtend|approveException|revokeException/.test(src),
    'the reaper must not reach any reviewer action');
});

test('reaper does not mutate exposures, questions, intelligence, or the timeline (PR-16A)', () => {
  const src = stripJsComments(read(REAPER));
  ok(!/from\(['"]component_exposures['"]\)/.test(src),
    'the reaper must never touch component_exposures (expiry never mutates observation)');
  ok(!/component_remediation_questions/.test(src),
    'the reaper must never create remediation questions');
  ok(!/component_exposure_vulnerabilities/.test(src),
    'the reaper must never touch the intelligence layer');
  ok(!/vault_timeline_events/.test(src),
    'the reaper must never write the timeline directly — the 0015 trigger owns that, transactionally');
  ok(!/proposeException|recordProposalFromExposure|recordOutcomeFromExposure/.test(src),
    'the reaper must never create proposals or reviewer outcomes');
  // The ONLY CEI write path is the expired recorder.
  ok(/recordExpiredFromExposure/.test(src),
    'the reaper must record the relationship via recordExpiredFromExposure only');
  ok(!/from\(['"]component_exposure_events['"]\)/.test(src),
    'the reaper must not write the CEI event table directly');
});

test('reaper carries no auto-remediation machinery (PR-16A)', () => {
  const src = read(REAPER).toLowerCase();
  for (const banned of ['octokit', 'pulls.create', 'check_runs', 'child_process', 'npm install', 'npm update', "'block'", "'warn'", "'allow'"]) {
    ok(!src.includes(banned), `the reaper must not contain ${banned}`);
  }
});

test('expired is distinct from revoked / rejected / approved everywhere it renders (PR-16A)', () => {
  // The UI treats expired as its own state with its own review-pressure
  // copy — never collapsing it into revocation or remediation.
  const detail = read('src/pages/vault/VaultExceptionDetail.tsx');
  ok(/Expired — review due/.test(detail),
    'exception detail must render the expired review-pressure banner');
  ok(/Past expiry window — review due/.test(detail),
    'exception detail must render the active-past-due state honestly (reaper not yet run)');
  ok(/not revoked, not renewed, and not proof of remediation/.test(detail),
    'the banner must carry the expired-is-not doctrine copy');
  const list = read('src/pages/vault/VaultExceptionList.tsx');
  ok(/review due ⚠/.test(list),
    'the list must mark active-past-due rows as review due');
  ok(/state === 'expired'/.test(list) || /'expired'/.test(list),
    'the list must keep expired as a distinct filter/state');
});

test('api-client kind union matches the 0024 allowlist (PR-16A)', () => {
  const api = read('src/shared/vault/api-client.ts');
  const kindMatch = api.match(/export type ExposureEventKind\s*=([\s\S]*?);/);
  ok(kindMatch, 'api-client must export the ExposureEventKind union');
  const kinds = (kindMatch[1].match(/'[a-z_]+'/g) || []).map((s) => s.replace(/'/g, ''));
  ok(JSON.stringify([...kinds].sort()) === JSON.stringify([...ALL_EVENT_KINDS_16A].sort()),
    `ExposureEventKind must be exactly the 16A set, found ${JSON.stringify(kinds)}`);
});

test('workspace isolation: every reaper write is keyed to the row\'s own workspace (PR-16A)', () => {
  const src = stripJsComments(read(REAPER));
  // The due query selects workspace_id per row; the CEI event is recorded
  // with the exception's OWN workspace; the UPDATE is keyed by exception_id.
  ok(/select\('exception_id, workspace_id/.test(src),
    'the due query must carry each row\'s workspace_id');
  ok(/workspaceId:\s*row\.workspace_id/.test(src),
    'the CEI event must be recorded with the exception\'s own workspace');
  ok(/\.eq\('exception_id', row\.exception_id\)/.test(src),
    'the transition must be keyed by exception_id');
});

test('package.json wires the reaper command and this suite into test:ci (PR-16A)', () => {
  const pkg = JSON.parse(read('package.json'));
  ok(pkg.scripts['reap:exceptions'], 'package.json must define reap:exceptions');
  ok(pkg.scripts['test:exception-reaper-v0'], 'package.json must define test:exception-reaper-v0');
  ok(/test-exception-reaper-v0\.mjs/.test(pkg.scripts['test:ci'] || ''),
    'test:ci must chain scripts/test-exception-reaper-v0.mjs');
});

(async () => {
  for (const fn of pending) await fn();
  console.log(`\nException reaper v0 tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
