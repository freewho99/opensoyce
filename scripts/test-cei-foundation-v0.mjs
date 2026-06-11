#!/usr/bin/env node
/**
 * PR-6A structural invariants for the Component Exposure Intelligence
 * foundation. Per docs/strategy/phase-6a-cei-foundation.md.
 *
 * Phase 6A scope item 7 invariants:
 *   - CEI is private (RLS deny-by-default; session-gated handlers; no
 *     public CEI surface; visibility: 'private' on the shaped rows)
 *   - exposure records are workspace scoped (workspace_id NOT NULL + FK;
 *     handlers funnel through resolveWorkspaceForMember)
 *   - native types only (6 seeded; create refuses non-native/inactive;
 *     no create-type endpoint)
 *   - no custom schemas (no validation_schema column; no dynamic JSON
 *     Schema editing; metadata validated as object-only)
 *   - no ingestion worker (no worker/queue; source recorded by member/api)
 *   - no public-spine imports (CEI never imports public renderers; public
 *     spine never imports CEI)
 *   - no Trust Center / Badge / public Timeline behavior changes (the
 *     foundation adds tables + private routes only)
 *
 * Plus separation invariants from the doctrine:
 *   - component_exposures has NO foreign key to vault_exceptions
 *   - component_exposures has NO proof_anchors column (exposure != evidence)
 *   - Phase 6A does NOT alter vault_timeline_events (exception semantics
 *     preserved)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// PR-15A functional surface: the OSV mapper is pure and exported precisely
// so this suite can prove determinism and boundedness without network.
import { mapOsvResponseToIntelRows, MAX_VULNS_PER_REFRESH } from '../src/server/cei/vuln-intel.js';

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

// Strip SQL line comments (-- ...) so structural greps test the actual DDL,
// not the doctrine prose in the comments (which deliberately NAMES the
// columns/tables it is explaining the ABSENCE of).
function readSqlNoComments(rel) {
  return read(rel)
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('--');
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join('\n');
}

// Strip // line comments and /* */ block comments from JS/TS source so
// structural greps test the actual code, not doctrine prose in comments.
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

const TYPES_MIGRATION = 'supabase/migrations/0017_component_exposure_types.sql';
const EXPOSURES_MIGRATION = 'supabase/migrations/0018_component_exposures.sql';
const EVENTS_MIGRATION = 'supabase/migrations/0019_component_exposure_events.sql';
const OUTCOMES_MIGRATION = 'supabase/migrations/0020_cei_outcome_event_kinds.sql';
const DEDUPE_MIGRATION = 'supabase/migrations/0021_cei_observation_dedupe.sql';
const VULN_INTEL_MIGRATION = 'supabase/migrations/0022_cei_vulnerability_intelligence.sql';
const REMEDIATION_MIGRATION = 'supabase/migrations/0023_cei_remediation_questions.sql';

// PR-15B: the bounded human-direction vocabulary. Every entry is a
// direction for a PERSON to act on, never a transition the system performs.
const REMEDIATION_OUTCOMES = [
  'fix_required',
  'defer',
  'propose_exception',
  'not_applicable',
  'needs_owner_review',
  'replace_or_remove',
];

// PR-6F: the full event-kind allowlist — the 6D proposal kind plus one kind
// per reviewer outcome that exists as a REAL transition in the application.
// exception_expired_from_exposure is deliberately absent until the reaper
// scope block exists (nothing transitions active -> expired today, and the
// event table requires an actor while expiry has none).
const ALL_EVENT_KINDS = [
  'exception_proposed_from_exposure',
  'exception_approved_from_exposure',
  'exception_rejected_from_exposure',
  'exception_revoked_from_exposure',
];

const NATIVE_TYPES = [
  'dependency-exposure',
  'github-action-exposure',
  'container-image-exposure',
  'base-image-exposure',
  'dev-tool-exposure',
  'runtime-version-exposure',
];

function allCeiSource() {
  const dir = path.join(root, 'src', 'server', 'cei');
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isFile() && p.endsWith('.js')) {
      out.push({ rel: path.relative(root, p).replace(/\\/g, '/'), src: fs.readFileSync(p, 'utf8') });
    }
  }
  return out;
}

// ---------- tables exist + private ----------

test('both CEI tables exist with RLS enabled', () => {
  const types = read(TYPES_MIGRATION);
  const exposures = read(EXPOSURES_MIGRATION);
  ok(/create table[\s\S]+component_exposure_types/i.test(types), 'types table not created');
  ok(/create table[\s\S]+component_exposures/i.test(exposures), 'exposures table not created');
  ok(/alter table public\.component_exposure_types enable row level security/.test(types),
    'types table must enable RLS');
  ok(/alter table public\.component_exposures enable row level security/.test(exposures),
    'exposures table must enable RLS');
});

test('CEI shaped rows carry visibility: "private" (no public CEI surface)', () => {
  const src = read('src/server/cei/exposures.js');
  ok(/visibility:\s*['"]private['"]/.test(src),
    'exposure handler must mark shaped rows visibility: private');
});

// ---------- workspace scoped ----------

test('component_exposures.workspace_id is NOT NULL with FK to vault_workspaces', () => {
  const sql = read(EXPOSURES_MIGRATION);
  ok(/workspace_id\s+uuid\s+not null/i.test(sql), 'workspace_id must be NOT NULL');
  ok(/references public\.vault_workspaces\(workspace_id\)/.test(sql),
    'workspace_id must FK to vault_workspaces');
});

test('every CEI read/write handler funnels through resolveWorkspaceForMember', () => {
  const src = read('src/server/cei/exposures.js');
  const handlers = src.match(/export async function handle\w+/g) || [];
  ok(handlers.length >= 3, 'expected at least 3 CEI handlers (list, get, create)');
  // Each handler body must reference resolveWorkspaceForMember.
  const calls = src.match(/resolveWorkspaceForMember/g) || [];
  ok(calls.length >= handlers.length,
    'each CEI handler must call resolveWorkspaceForMember (404-on-non-member doctrine)');
});

test('CEI does not trust any account-id header as the tenant boundary', () => {
  for (const { rel, src } of allCeiSource()) {
    ok(!/X-OpenSoyce-Account-ID/i.test(src), `${rel} references an account-id header`);
    ok(!/req\.headers\[['"]x-.*account/i.test(src), `${rel} reads an account-id header`);
  }
});

// ---------- native types only ----------

test('migration seeds exactly the six native exposure types', () => {
  const sql = read(TYPES_MIGRATION);
  for (const slug of NATIVE_TYPES) {
    ok(sql.includes(`'${slug}'`), `seed missing native type ${slug}`);
  }
  // Every seeded row must be native + active.
  ok(/is_native/.test(sql) && /insert into public\.component_exposure_types/.test(sql),
    'seed must insert native types');
});

test('domain NATIVE_EXPOSURE_TYPES matches the migration seed exactly', () => {
  const domain = read('src/server/cei/domain.js');
  for (const slug of NATIVE_TYPES) {
    ok(domain.includes(`'${slug}'`), `domain.js missing native type ${slug}`);
  }
  // No extra native type beyond the six.
  const listMatch = domain.match(/NATIVE_EXPOSURE_TYPES\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
  ok(listMatch, 'NATIVE_EXPOSURE_TYPES must be a frozen array');
  const slugs = (listMatch[1].match(/'[a-z0-9-]+'/g) || []).map((s) => s.replace(/'/g, ''));
  ok(slugs.length === NATIVE_TYPES.length,
    `expected exactly ${NATIVE_TYPES.length} native types, found ${slugs.length}`);
});

test('create handler refuses non-native / inactive types', () => {
  const domain = read('src/server/cei/domain.js');
  // findNativeExposureType must guard on is_native === true AND is_active === true.
  ok(/is_native\s*!==\s*true/.test(domain) && /is_active\s*!==\s*true/.test(domain),
    'findNativeExposureType must reject non-native or inactive rows');
  const handlers = read('src/server/cei/exposures.js');
  ok(/findNativeExposureType/.test(handlers),
    'create handler must look up the type via findNativeExposureType');
  ok(/exposure_type_not_found|exposure-type-not-found/.test(handlers),
    'create handler must surface exposure-type-not-found for unknown/non-native types');
});

test('no create-exposure-type endpoint exists (native catalog is read-only)', () => {
  for (const { rel, src } of allCeiSource()) {
    ok(!/handleCreate\w*ExposureType/.test(src), `${rel} defines a create-exposure-type handler`);
    // Precise: an INSERT/UPSERT into the component_exposure_types table.
    // (A loose "insert ... type_slug" grep false-positives when type_slug
    // merely appears later in a SELECT embed string.)
    ok(!/from\(['"]component_exposure_types['"]\)[\s\S]{0,120}\.(insert|upsert)\(/.test(src),
      `${rel} inserts into the exposure-type catalog (must stay read-only)`);
  }
});

// ---------- no custom schemas ----------

test('no validation_schema column or dynamic JSON Schema editing in 6A', () => {
  const types = readSqlNoComments(TYPES_MIGRATION);
  ok(!/validation_schema/.test(types),
    'types migration must NOT carry a validation_schema column in 6A');
  for (const { rel, src } of allCeiSource()) {
    ok(!/ajv|json-schema|jsonschema|compileSchema|validateSchema/i.test(src),
      `${rel} references a JSON Schema validator (custom schemas are future scope)`);
  }
});

test('metadata + trust_boundary are validated as objects only (no schema)', () => {
  const domain = read('src/server/cei/domain.js');
  ok(/jsonObject|isJsonObject/.test(domain), 'domain must validate JSON object-ness');
  const sql = read(EXPOSURES_MIGRATION);
  ok(/jsonb_typeof\(metadata\)\s*=\s*'object'/.test(sql),
    'metadata must carry a jsonb object CHECK');
  ok(/jsonb_typeof\(trust_boundary\)\s*=\s*'object'/.test(sql),
    'trust_boundary must carry a jsonb object CHECK');
});

// ---------- no ingestion worker ----------

test('no ingestion worker / queue / Go / container orchestration in CEI', () => {
  for (const { rel, src } of allCeiSource()) {
    for (const banned of ['amqplib', 'bullmq', 'kafkajs', 'sqs', 'dead-letter', 'deadletter', 'worker_threads', 'child_process']) {
      ok(!src.toLowerCase().includes(banned), `${rel} references ingestion infra: ${banned}`);
    }
  }
  // No Go / Docker / K8s / Prometheus / Grafana / HPA files added under cei.
  const dir = path.join(root, 'src', 'server', 'cei');
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir)) {
      ok(!/\.(go|dockerfile)$/i.test(name) && name.toLowerCase() !== 'dockerfile',
        `unexpected non-JS file in src/server/cei: ${name}`);
    }
  }
});

// ---------- separation from Phase 5 ----------

test('component_exposures has NO foreign key to vault_exceptions', () => {
  const sql = read(EXPOSURES_MIGRATION);
  ok(!/references public\.vault_exceptions/.test(sql),
    'exposures must not FK to vault_exceptions — exposure is not an exception');
});

test('component_exposures has NO proof_anchors column (exposure != evidence)', () => {
  const sql = readSqlNoComments(EXPOSURES_MIGRATION);
  ok(!/proof_anchors/.test(sql),
    'exposures must not carry proof_anchors — exposure is not evidence');
});

test('PR-6A does not alter vault_timeline_events (exception semantics preserved)', () => {
  for (const { rel, src } of allCeiSource()) {
    ok(!/vault_timeline_events/.test(stripJsComments(src)),
      `${rel} writes vault_timeline_events — 6A must not touch the shared timeline`);
  }
  // No migration in this PR alters the timeline CHECK constraint. Strip
  // comments first — the doctrine prose deliberately names the table it is
  // explaining the deferral of.
  const types = readSqlNoComments(TYPES_MIGRATION);
  const exposures = readSqlNoComments(EXPOSURES_MIGRATION);
  ok(!/vault_timeline_events/.test(types) && !/vault_timeline_events/.test(exposures),
    'CEI migrations must not reference vault_timeline_events');
});

test('CEI migrations do not touch vault_exceptions semantics', () => {
  const exposures = readSqlNoComments(EXPOSURES_MIGRATION);
  ok(!/alter table[\s\S]*vault_exceptions/i.test(exposures),
    'CEI migration must not ALTER vault_exceptions');
});

// ---------- public-spine isolation ----------

test('CEI source does not import any public renderer / page / public-data module', () => {
  const BANNED_IMPORT_FRAGMENTS = [
    '../../pages/', '../pages/', 'src/pages/',
    '../../components/', // public components
    '../shared/repoTrustDashboard', '../shared/trustTimeline', '../shared/openSourceTrustCenter',
    '../../shared/repoTrustDashboard', '../../shared/trustTimeline', '../../shared/openSourceTrustCenter',
    '../badge/', '../../server/badge',
  ];
  for (const { rel, src } of allCeiSource()) {
    const imports = src.match(/from\s+['"]([^'"]+)['"]/g) || [];
    for (const imp of imports) {
      const m = imp.match(/from\s+['"]([^'"]+)['"]/);
      if (!m) continue;
      for (const banned of BANNED_IMPORT_FRAGMENTS) {
        ok(!m[1].includes(banned), `${rel} imports public-spine path ${m[1]}`);
      }
    }
  }
});

test('public spine does not import CEI', () => {
  const candidates = [];
  const walk = (dir) => {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) return;
    const stack = [abs];
    while (stack.length) {
      const cur = stack.pop();
      const st = fs.statSync(cur);
      if (st.isDirectory()) {
        for (const c of fs.readdirSync(cur)) stack.push(path.join(cur, c));
      } else if (/\.(ts|tsx|js|mjs)$/.test(cur)) {
        candidates.push(cur);
      }
    }
  };
  walk('src/pages');
  walk('src/components');
  walk('src/server/badge');
  for (const f of candidates) {
    const rel = f.slice(root.length + 1).replace(/\\/g, '/');
    const src = fs.readFileSync(f, 'utf8');
    ok(!/from\s+['"][^'"]*\/cei\//.test(src) && !/from\s+['"][^'"]*server\/cei/.test(src),
      `${rel} imports a CEI module (public spine must not consume CEI)`);
  }
});

// ---------- PR-6D: CEI-native proposal audit event table ----------

test('component_exposure_events table exists with RLS (PR-6D)', () => {
  const sql = read(EVENTS_MIGRATION);
  ok(/create table[\s\S]+component_exposure_events/i.test(sql), 'events table not created');
  ok(/alter table public\.component_exposure_events enable row level security/.test(sql),
    'events table must enable RLS');
});

test('event table is workspace-scoped + requires exposure + actor (PR-6D)', () => {
  const sql = readSqlNoComments(EVENTS_MIGRATION);
  ok(/workspace_id\s+uuid\s+not null[\s\S]*?references public\.vault_workspaces/.test(sql),
    'workspace_id must be NOT NULL FK to vault_workspaces');
  ok(/exposure_id\s+uuid\s+not null[\s\S]*?references public\.component_exposures/.test(sql),
    'exposure_id must be NOT NULL FK to component_exposures');
  ok(/actor_user_id\s+uuid\s+not null[\s\S]*?references public\.vault_users/.test(sql),
    'actor_user_id must be NOT NULL FK to vault_users');
});

test('event_kind allowlist: 0019 opened with ONLY the proposal kind (PR-6D, historical)', () => {
  // The 0019 migration is history — it must STILL carry exactly the single
  // 6D value. 6F widened the live allowlist via 0020, never by rewriting
  // the 6D migration.
  const sql = readSqlNoComments(EVENTS_MIGRATION);
  const checkMatch = sql.match(/event_kind[\s\S]*?check\s*\(\s*event_kind\s+in\s*\(([^)]*)\)/i);
  ok(checkMatch, 'event_kind must carry an IN (...) CHECK');
  const kinds = (checkMatch[1].match(/'[a-z_]+'/g) || []).map((s) => s.replace(/'/g, ''));
  ok(kinds.length === 1 && kinds[0] === 'exception_proposed_from_exposure',
    `0019 event_kind allowlist must be exactly ['exception_proposed_from_exposure'], found ${JSON.stringify(kinds)}`);
});

test('event_kind allowlist: 0020 + events.js carry EXACTLY the 6F kind set (PR-6F)', () => {
  // The live allowlist is the 6D proposal kind + the three reviewer-outcome
  // kinds — no more (no expired until the reaper scope block), no fewer,
  // and migration + app constant must agree.
  const sql = readSqlNoComments(OUTCOMES_MIGRATION);
  const checkMatch = sql.match(/check\s*\(\s*event_kind\s+in\s*\(([^)]*)\)/i);
  ok(checkMatch, '0020 must re-add an IN (...) CHECK on event_kind');
  const kinds = (checkMatch[1].match(/'[a-z_]+'/g) || []).map((s) => s.replace(/'/g, ''));
  ok(JSON.stringify([...kinds].sort()) === JSON.stringify([...ALL_EVENT_KINDS].sort()),
    `0020 allowlist must be exactly ${JSON.stringify(ALL_EVENT_KINDS)}, found ${JSON.stringify(kinds)}`);
  const domain = read('src/server/cei/events.js');
  // Anchor on "export const" — OUTCOME_EVENT_KINDS contains the substring
  // EVENT_KINDS and would otherwise match first.
  const evMatch = domain.match(/export const EVENT_KINDS\s*=\s*Object\.freeze\(\[([^\]]*)\]/);
  ok(evMatch, 'events.js must export a frozen EVENT_KINDS array');
  const evKinds = (evMatch[1].match(/'[a-z_]+'/g) || []).map((s) => s.replace(/'/g, ''));
  ok(JSON.stringify([...evKinds].sort()) === JSON.stringify([...ALL_EVENT_KINDS].sort()),
    'events.js EVENT_KINDS must match the 0020 migration allowlist exactly');
  // The drop is LOUD: no "if exists" — a constraint-name mismatch must fail
  // the migration, not leave the old single-value CHECK silently rejecting
  // every outcome insert.
  ok(/drop constraint component_exposure_events_event_kind_check/.test(sql)
    && !/drop constraint if exists/.test(sql),
    '0020 must drop the 0019 CHECK by name, without "if exists"');
});

test('event row may reference an exception as audit context, set-null on delete (PR-6D)', () => {
  const sql = readSqlNoComments(EVENTS_MIGRATION);
  ok(/related_exception_id\s+uuid[\s\S]*?references public\.vault_exceptions\(exception_id\)\s+on delete set null/.test(sql),
    'related_exception_id must be a nullable set-null FK to vault_exceptions (audit context only)');
});

test('PR-6D preserves separation: no FK from component_exposures to exceptions; timeline untouched', () => {
  // The EXPOSURES table still has no FK to exceptions (the link lives only
  // on the event row).
  const exposures = readSqlNoComments(EXPOSURES_MIGRATION);
  ok(!/references public\.vault_exceptions/.test(exposures),
    'component_exposures must STILL have no FK to vault_exceptions');
  // 6D touches NO migration referencing vault_timeline_events.
  for (const m of [TYPES_MIGRATION, EXPOSURES_MIGRATION, EVENTS_MIGRATION]) {
    ok(!/vault_timeline_events/.test(readSqlNoComments(m)),
      `${m} must not reference vault_timeline_events`);
  }
  // No CEI source writes vault_timeline_events (comments stripped — the
  // doctrine prose names the table it explains the deferral of).
  for (const { rel, src } of allCeiSource()) {
    ok(!/vault_timeline_events/.test(stripJsComments(src)), `${rel} must not touch vault_timeline_events`);
  }
});

test('propose flow records the CEI event without changing exception state (PR-6D)', () => {
  const ex = read('src/server/vault/exceptions.js');
  ok(/recordProposalFromExposure/.test(ex),
    'propose handler must record the CEI audit event');
  ok(/validateExposureInWorkspace/.test(ex),
    'propose handler must validate the source exposure belongs to the workspace');
  // Scope to the propose handler body — the approve handler elsewhere in
  // this file legitimately sets state 'active'; the PROPOSE insert must use
  // 'proposed' and must not introduce an active insert.
  const proposeBody = stripJsComments(ex).match(/async function handleProposeException[\s\S]*?\n}/);
  ok(proposeBody, 'handleProposeException not found');
  ok(/state:\s*'proposed'/.test(proposeBody[0]),
    'propose insert must still use state: proposed');
  ok(!/state:\s*'active'/.test(proposeBody[0]),
    'propose flow must not create active exceptions');
  ok(!/exception_extended|exception_approved/.test(proposeBody[0]),
    'propose flow must not introduce approve/extend semantics');
  // Best-effort recorder: the propose handler does not turn a failed audit
  // insert into a 4xx/5xx (no sendError immediately after the record call).
  ok(!/recordProposalFromExposure[\s\S]{0,120}sendError/.test(stripJsComments(ex)),
    'a failed audit-event insert must not block the proposal response');
});

test('events module never mutates the exposure or the exception (PR-6D)', () => {
  const src = read('src/server/cei/events.js');
  // The events module only INSERTs into component_exposure_events and reads.
  // It must not update/delete exposures or exceptions.
  ok(!/from\(['"]component_exposures['"]\)[\s\S]{0,80}\.(update|delete|upsert)\(/.test(src),
    'events module must not mutate component_exposures');
  ok(!/from\(['"]vault_exceptions['"]\)/.test(src),
    'events module must not touch vault_exceptions directly');
});

// ---------- PR-6E: reviewer-side source-exposure context ----------

test('reviewer source-exposure endpoint reads events by related_exception_id (PR-6E)', () => {
  const events = read('src/server/cei/events.js');
  ok(/handleListEventsByException/.test(events),
    'events.js must export handleListEventsByException');
  // It filters by related_exception_id and is workspace-scoped + read-only.
  const handler = events.match(/export async function handleListEventsByException[\s\S]*?\n}/);
  ok(handler, 'handleListEventsByException body not found');
  ok(/related_exception_id/.test(handler[0]),
    'handler must filter by related_exception_id');
  ok(/resolveWorkspaceForMember/.test(handler[0]),
    'handler must be workspace-scoped (404-on-non-member)');
  ok(!/\.(insert|update|delete|upsert)\(/.test(handler[0]),
    'reviewer context endpoint must be read-only (no writes)');
  // Route is CEI-namespaced (exposure-events), NOT under the /exceptions tree.
  const routes = read('src/server/cei/routes.js');
  ok(/\/api\/vault\/workspaces\/:slug\/exposure-events/.test(routes),
    'reviewer context route must be /exposure-events (CEI-namespaced)');
  ok(/handleListEventsByException/.test(routes),
    'reviewer context route must dispatch handleListEventsByException');
});

test('PR-6E reader stays a reader + NO exposure/exception mutation', () => {
  // 6E itself added a reader, not a writer, and no migration: 0019 is
  // reused as-is (the 6F allowlist widening lives in its OWN migration,
  // 0020_cei_outcome_event_kinds.sql — 6E's filename stays unused).
  const sql = readSqlNoComments(EVENTS_MIGRATION);
  const kinds = (sql.match(/'exception_proposed_from_exposure'/g) || []);
  ok(kinds.length >= 1, 'event_kind allowlist must still contain the 6D value');
  ok(!fs.existsSync(path.join(root, 'supabase/migrations/0020_component_exposure_events.sql')),
    '6E must not add a migration (it reuses the 0019 events table)');
  // The reviewer context handler must not write to exposures or exceptions.
  const events = read('src/server/cei/events.js');
  ok(!/from\(['"]component_exposures['"]\)[\s\S]{0,80}\.(update|delete|upsert)\(/.test(events),
    'events module must not mutate component_exposures');
  ok(!/from\(['"]vault_exceptions['"]\)/.test(events),
    'events module must not write vault_exceptions');
});

// ---------- PR-6F: CEI reviewer-outcome audit ----------

test('outcome recorder discovers the exposure from the 6D proposal event only (PR-6F)', () => {
  const events = read('src/server/cei/events.js');
  ok(/export async function recordOutcomeFromExposure/.test(events),
    'events.js must export recordOutcomeFromExposure');
  const body = stripJsComments(events).match(/export async function recordOutcomeFromExposure[\s\S]*?\n}/);
  ok(body, 'recordOutcomeFromExposure body not found');
  // The exception row carries NO exposure reference — the link is read from
  // the proposal event by related_exception_id, then a new event is inserted.
  ok(/related_exception_id/.test(body[0]),
    'recorder must look up the proposal event by related_exception_id');
  ok(/PROPOSAL_EVENT_KIND|'exception_proposed_from_exposure'/.test(body[0]),
    'recorder must filter the lookup to the proposal kind');
  ok(/skipped:\s*true/.test(body[0]),
    'recorder must no-op (skip) when the exception was not exposure-born');
  // Insert-only against component_exposure_events; nothing else is written.
  ok(!/\.(update|delete|upsert)\(/.test(body[0]),
    'recorder must only insert (audit is append-only)');
  ok(!/from\(['"]vault_exceptions['"]\)/.test(body[0]),
    'recorder must not read or write vault_exceptions');
});

test('approve/reject/revoke record their outcome AFTER the transition (PR-6F)', () => {
  const ex = stripJsComments(read('src/server/vault/exceptions.js'));
  const cases = [
    ['handleApproveException', 'exception_approved_from_exposure'],
    ['handleRejectException', 'exception_rejected_from_exposure'],
    ['handleRevokeException', 'exception_revoked_from_exposure'],
  ];
  for (const [fn, kind] of cases) {
    const body = ex.match(new RegExp(`async function ${fn}[\\s\\S]*?\\n}`));
    ok(body, `${fn} not found`);
    ok(new RegExp(`recordOutcomeFromExposure[\\s\\S]*?'${kind}'`).test(body[0]),
      `${fn} must record ${kind}`);
    // The audit row is written only after the guarded state UPDATE — the
    // transition is the trust record; the event is its echo.
    ok(body[0].indexOf('.update(') !== -1
      && body[0].indexOf('.update(') < body[0].indexOf('recordOutcomeFromExposure'),
      `${fn} must record the outcome AFTER the state update`);
  }
});

test('extend and propose record NO outcome event (PR-6F)', () => {
  const ex = stripJsComments(read('src/server/vault/exceptions.js'));
  for (const fn of ['handleExtendException', 'handleProposeException']) {
    const body = ex.match(new RegExp(`async function ${fn}[\\s\\S]*?\\n}`));
    ok(body, `${fn} not found`);
    ok(!/recordOutcomeFromExposure/.test(body[0]),
      `${fn} must not record an outcome event (extend is not an outcome; propose records the proposal kind only)`);
  }
});

test('outcome recording is best-effort — a failed audit row never blocks the decision (PR-6F)', () => {
  const ex = stripJsComments(read('src/server/vault/exceptions.js'));
  ok(!/recordOutcomeFromExposure\(supabase[\s\S]{0,400}?sendError/.test(ex),
    'no sendError may follow an outcome-record call — the decision already committed');
});

test('no expired kind + actor still required until the reaper scope block (PR-6F)', () => {
  // exception_expired_from_exposure is DELIBERATELY absent: nothing in the
  // application transitions active -> expired (no reaper), and the event
  // table requires an actor while expiry has none. Both arrive together.
  const sql = readSqlNoComments(OUTCOMES_MIGRATION);
  ok(!/exception_expired_from_exposure/.test(sql),
    '0020 must not include the expired kind (reaper scope)');
  ok(!/actor_user_id/.test(sql),
    '0020 must not touch actor_user_id nullability (actor stays required)');
  const events = stripJsComments(read('src/server/cei/events.js'));
  ok(!/exception_expired_from_exposure/.test(events),
    'events.js must not carry the expired kind yet');
});

test('PR-6F preserves the firewall: only the events CHECK changes', () => {
  const sql = readSqlNoComments(OUTCOMES_MIGRATION);
  ok(!/vault_timeline_events/.test(sql),
    '0020 must not reference vault_timeline_events (Phase 5 contract untouched)');
  ok(!/alter table public\.(component_exposures|vault_exceptions)\b/.test(sql),
    '0020 must not alter component_exposures or vault_exceptions');
  ok(!/create table/i.test(sql), '0020 must not create any table');
  ok(!/add column/i.test(sql), '0020 must not add any column');
  // No migration ever gave the exception row an exposure reference — the
  // link still lives ONLY on the event rows.
  for (const m of [TYPES_MIGRATION, EXPOSURES_MIGRATION, EVENTS_MIGRATION, OUTCOMES_MIGRATION]) {
    ok(!/source_exposure_id/.test(readSqlNoComments(m)),
      `${m} must not persist a source_exposure_id column`);
  }
});

// ---------- PR-7C: server-side semantic dedupe (upsert-touch) ----------
//
// Observation is not judgment. Repetition is not new evidence. Provenance
// must not be erased.

test('0021 adds ONLY repeat-observation columns + the partial identity index (PR-7C)', () => {
  const sql = readSqlNoComments(DEDUPE_MIGRATION);
  ok(/alter table public\.component_exposures/.test(sql), '0021 must alter component_exposures');
  ok(/observation_identity\s+text/.test(sql), '0021 must add observation_identity');
  ok(/seen_count\s+integer\s+not null\s+default 1/.test(sql), '0021 must add seen_count defaulting to 1');
  ok(/check \(seen_count >= 1\)/.test(sql), 'seen_count must carry a >= 1 CHECK');
  ok(/latest_source_ref\s+text/.test(sql), '0021 must add latest_source_ref');
  ok(/create unique index[\s\S]*?\(workspace_id, observation_identity\)[\s\S]*?where observation_identity is not null/.test(sql),
    '0021 must add the PARTIAL unique index (null identities stay outside dedupe)');
  // Firewall: 0021 touches nothing else.
  ok(!/vault_timeline_events/.test(sql), '0021 must not reference vault_timeline_events');
  ok(!/vault_exceptions/.test(sql), '0021 must not reference vault_exceptions');
  ok(!/component_exposure_events/.test(sql), '0021 must not reference the CEI event table');
  ok(!/create table/i.test(sql), '0021 must not create any table');
  ok(!/status/.test(sql), '0021 must not touch status (no lifecycle)');
});

test('observation identity is SEMANTIC, not run-specific (PR-7C)', () => {
  const src = stripJsComments(read('src/server/cei/exposures.js'));
  const body = src.match(/function buildObservationIdentity[\s\S]*?\n}/);
  ok(body, 'exposures.js must define buildObservationIdentity');
  // The identity is the dependency fact...
  for (const part of ['subject_name', 'version', 'package_manager', 'manifest_kind', 'dependency_class']) {
    ok(body[0].includes(part), `identity must include ${part}`);
  }
  // ...and NEVER the run/provenance.
  for (const banned of ['source_ref', 'source_kind', 'run_id', 'sha']) {
    ok(!body[0].includes(banned), `identity must NOT include ${banned} — provenance is not identity`);
  }
  // Dedupe is the dependency-exposure ingestion lane only.
  ok(/dependency-exposure/.test(body[0]), 'identity must be scoped to dependency-exposure');
  ok(/return null/.test(body[0]), 'non-dependency / sparse creates must opt out (null identity)');
});

test('touch updates ONLY repeat metadata — never status, subject, or first provenance (PR-7C)', () => {
  const src = stripJsComments(read('src/server/cei/exposures.js'));
  const fn = src.match(/async function touchExistingObservation[\s\S]*?\n}/);
  ok(fn, 'exposures.js must define touchExistingObservation');
  const update = fn[0].match(/\.update\(\{([\s\S]*?)\}\)/);
  ok(update, 'touch must issue an update');
  ok(/seen_count/.test(update[1]), 'touch must increment seen_count');
  ok(/last_seen_at/.test(update[1]), 'touch must move last_seen_at forward');
  ok(/latest_source_ref/.test(update[1]), 'touch must record the latest provenance');
  for (const banned of [/\bstatus\b/, /\bsubject_name\b/, /\bsource_ref\b\s*:/, /\bsource_kind\b/, /\bfirst_seen_at\b/, /\bcreated_at\b/, /\bmetadata\b/, /\btrust_boundary\b/]) {
    ok(!banned.test(update[1]),
      `touch payload must not contain ${banned} — the first observation stays historically understandable`);
  }
});

test('insert race falls back to touch — the repeat sighting is never dropped (PR-7C)', () => {
  const src = stripJsComments(read('src/server/cei/exposures.js'));
  const handler = src.match(/async function handleCreateExposure[\s\S]*?\n}/);
  ok(handler, 'handleCreateExposure not found');
  ok(/'23505'/.test(handler[0]), 'create must catch the unique-violation race');
  const raceIdx = handler[0].indexOf("'23505'");
  ok(handler[0].indexOf('touchExistingObservation', raceIdx) !== -1,
    'the 23505 loser must fall back to the touch path');
});

test('dedupe keeps the HTTP contract and tells the truth in the body (PR-7C)', () => {
  const src = stripJsComments(read('src/server/cei/exposures.js'));
  // The 7A/7B CLI pins 201; both paths answer 201 and the body carries
  // seen_again so repetition is visible, not hidden.
  ok(/seen_again:\s*true/.test(src), 'touch responses must mark seen_again: true');
  ok(/seen_again:\s*false/.test(src), 'fresh creates must mark seen_again: false');
  ok(/seen_count/.test(src) && /latest_source_ref/.test(src),
    'shaped rows must surface seen_count + latest_source_ref');
  // Dedupe writes no audit event and never reaches the exception lane.
  ok(!/component_exposure_events/.test(src), 'exposures.js must not write the CEI event table');
  ok(!/vault_exceptions/.test(src), 'exposures.js must not touch vault_exceptions');
  ok(!/recordProposalFromExposure|recordOutcomeFromExposure/.test(src),
    'dedupe must not record proposal/outcome events');
});

// ---------- PR-15A: vulnerability-intelligence observations ----------
//
// Vulnerability intelligence is observation. Observation is not judgment.
// A scanner finding is not a trust decision. A vulnerability match opens a
// review question; it does not decide the answer.

test('0022 vuln-intel table is context-only: shape + firewall (PR-15A)', () => {
  const sql = readSqlNoComments(VULN_INTEL_MIGRATION);
  ok(/create table if not exists public\.component_exposure_vulnerabilities/.test(sql),
    '0022 must create component_exposure_vulnerabilities');
  ok(/workspace_id\s+uuid\s+not null[\s\S]*?references public\.vault_workspaces/.test(sql),
    'workspace_id must be NOT NULL FK (isolation)');
  ok(/exposure_id\s+uuid\s+not null[\s\S]*?references public\.component_exposures/.test(sql),
    'exposure_id must be NOT NULL — no exposure, no record (unmatched intel cannot fabricate inventory)');
  ok(/source in \('osv', 'ots', 'scanner'\)/.test(sql), 'source must carry the 3-value allowlist');
  ok(/match_basis in \('osv-version-query', 'exact-version', 'semver-range'\)/.test(sql),
    'match_basis must carry the 3-value allowlist');
  ok(/create unique index[\s\S]*?\(workspace_id, exposure_id, vuln_id, source\)/.test(sql),
    'the dedupe identity index must be (workspace, exposure, vuln_id, source)');
  ok(/seen_count\s+integer\s+not null\s+default 1\s+check \(seen_count >= 1\)/.test(sql),
    'seen_count must default 1 with a >= 1 CHECK');
  ok(/alter table public\.component_exposure_vulnerabilities enable row level security/.test(sql),
    'intel table must enable RLS');
  // The firewall: context has NO lifecycle and never reaches the decision
  // or timeline tables.
  ok(!/\bstatus\b/.test(sql), 'intel table must have NO status column (context has no lifecycle)');
  ok(!/vault_exceptions/.test(sql), '0022 must not reference vault_exceptions');
  ok(!/vault_timeline_events/.test(sql), '0022 must not reference vault_timeline_events');
  ok(!/proof_anchors/.test(sql), 'intel is not evidence — no proof_anchors');
  ok(!/component_exposure_types/.test(sql),
    '0022 must not touch the native type catalog (Option B: context table, not a new type)');
});

test('PR-15A deliberately adds NO new exposure type — the native catalog stays at six', () => {
  const domain = read('src/server/cei/domain.js');
  const listMatch = domain.match(/NATIVE_EXPOSURE_TYPES\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
  const slugs = (listMatch[1].match(/'[a-z0-9-]+'/g) || []);
  ok(slugs.length === 6, `native catalog must still have exactly 6 types, found ${slugs.length}`);
  ok(!/vulnerability/.test(stripJsComments(domain)),
    'domain.js must not define a vulnerability exposure type');
});

test('vuln-intel module is context-only — it can never decide anything (PR-15A)', () => {
  const src = stripJsComments(read('src/server/cei/vuln-intel.js'));
  // It never mutates the exposure, never reaches the exception lane, never
  // records CEI proposal/outcome events.
  ok(!/from\(['"]component_exposures['"]\)[\s\S]{0,120}\.(update|delete|upsert|insert)\(/.test(src),
    'vuln-intel must never write component_exposures');
  ok(!/vault_exceptions/.test(src), 'vuln-intel must never touch vault_exceptions');
  ok(!/component_exposure_events/.test(src), 'vuln-intel must never write CEI decision events');
  ok(!/recordProposalFromExposure|recordOutcomeFromExposure/.test(src),
    'vuln-intel must never record proposals or outcomes');
  // No severity-to-decision mapping: the decision vocabulary may not appear.
  ok(!/'BLOCK'|'WARN'|'ALLOW'/.test(src),
    'vuln-intel must not reference the decision vocabulary — severity is context, never policy');
  // The touch path refreshes ONLY freshness fields; first provenance stays.
  const touch = src.match(/async function touchIntelRow[\s\S]*?\n}/);
  ok(touch, 'touchIntelRow not found');
  const payload = touch[0].match(/\.update\(\{([\s\S]*?)\}\)/);
  ok(payload, 'touch must issue an update');
  for (const allowed of ['seen_count', 'last_seen_at', 'severity', 'affected_range', 'metadata']) {
    ok(payload[1].includes(allowed), `touch must refresh ${allowed}`);
  }
  for (const banned of [/first_seen_at/, /created_at/, /source_ref\s*:/, /vuln_id\s*:/, /\bstatus\b/]) {
    ok(!banned.test(payload[1]), `touch payload must not contain ${banned} — first provenance is preserved`);
  }
  // Refresh refuses non-dependency / version-less exposures honestly.
  ok(/dependency-exposure/.test(src) && /observed version/.test(src),
    'refresh must refuse exposures that have nothing for the source to assert against');
  // Both handlers are workspace-scoped.
  const calls = src.match(/resolveWorkspaceForMember/g) || [];
  ok(calls.length >= 2, 'both vuln-intel handlers must resolve workspace membership');
});

test('OSV mapper is deterministic, bounded, and source-asserted (PR-15A)', () => {
  const ctx = {
    workspaceId: 'w-1', exposureId: 'e-1',
    packageName: 'express', observedVersion: '4.21.2', ecosystem: 'npm',
  };
  const fixture = {
    vulns: [
      {
        id: 'GHSA-xxxx-yyyy-zzzz',
        summary: 'Test advisory',
        aliases: ['CVE-2024-0001'],
        database_specific: { severity: 'HIGH' },
        affected: [{ package: { name: 'express' }, ranges: [{ events: [{ introduced: '0' }, { fixed: '4.22.0' }] }] }],
      },
      { id: 'GHSA-xxxx-yyyy-zzzz' }, // duplicate id — must collapse
      { notAVuln: true },            // malformed — must be skipped
      { id: 'OSV-2024-123' },
    ],
  };
  const a = mapOsvResponseToIntelRows(fixture, ctx);
  const b = mapOsvResponseToIntelRows(fixture, ctx);
  ok(JSON.stringify(a) === JSON.stringify(b), 'mapper must be deterministic (same input, same output)');
  ok(a.rows.length === 2, `duplicates and malformed entries must collapse (found ${a.rows.length})`);
  const row = a.rows[0];
  ok(row.vuln_id === 'GHSA-xxxx-yyyy-zzzz' && row.source === 'osv' && row.match_basis === 'osv-version-query',
    'rows must carry the source-asserted match basis');
  ok(row.severity === 'high', 'severity must normalize as-provided (HIGH -> high)');
  ok(/osv\.dev\/vulnerability\/GHSA/.test(row.source_ref), 'source_ref must point at the advisory');
  ok(/introduced 0, fixed 4\.22\.0/.test(row.affected_range), 'affected_range must capture the match basis');
  // Empty response writes nothing — no false records.
  ok(mapOsvResponseToIntelRows({ vulns: [] }, ctx).rows.length === 0, 'empty source response must map to zero rows');
  ok(mapOsvResponseToIntelRows({}, ctx).rows.length === 0, 'missing vulns must map to zero rows');
  // Bounded: more advisories than the cap truncates and says so.
  const big = { vulns: Array.from({ length: MAX_VULNS_PER_REFRESH + 10 }, (_, i) => ({ id: `OSV-${i}` })) };
  const capped = mapOsvResponseToIntelRows(big, ctx);
  ok(capped.rows.length === MAX_VULNS_PER_REFRESH && capped.truncated === true,
    'mapper must cap rows and report truncation');
});

test('PR-15A routes: GET read + CSRF-fronted POST refresh, private surface only', () => {
  const routes = read('src/server/cei/routes.js');
  ok(/\/api\/vault\/workspaces\/:slug\/exposures\/:id\/vuln-intel'/.test(routes),
    'GET vuln-intel route must be registered');
  const refreshBlock = routes.match(/app\.post\(\s*'\/api\/vault\/workspaces\/:slug\/exposures\/:id\/vuln-intel\/refresh'[\s\S]*?\);/);
  ok(refreshBlock, 'POST vuln-intel/refresh route must be registered');
  ok(/requireVaultSession/.test(refreshBlock[0]) && /requireCsrf/.test(refreshBlock[0]),
    'refresh must require session + CSRF');
});

// ---------- PR-15B: the Remediation Question Loop ----------
//
// The scanner observes. Vulnerability intelligence adds context. The
// system asks the remediation question. The human decides. The record
// remembers. A remediation question is not a remediation decision.

test('0023 remediation-question table: shape + answer coherence + firewall (PR-15B)', () => {
  const sql = readSqlNoComments(REMEDIATION_MIGRATION);
  ok(/create table if not exists public\.component_remediation_questions/.test(sql),
    '0023 must create component_remediation_questions');
  ok(/workspace_id\s+uuid\s+not null[\s\S]*?references public\.vault_workspaces/.test(sql),
    'workspace_id must be NOT NULL FK (isolation)');
  ok(/source_exposure_id\s+uuid\s+not null[\s\S]*?references public\.component_exposures/.test(sql),
    'source_exposure_id must be NOT NULL — no exposure, no question');
  ok(/source_vuln_intel_id\s+uuid\s*\n?[\s\S]{0,140}references public\.component_exposure_vulnerabilities\(vuln_intel_id\) on delete set null/.test(sql),
    'source_vuln_intel_id must be a NULLABLE set-null FK to the intelligence table');
  ok(/question_kind in \('vulnerability_review', 'component_risk_review'\)/.test(sql),
    'question_kind must carry the 2-value allowlist');
  ok(/status in \('open', 'answered', 'cancelled'\)/.test(sql),
    'status must carry the 3-value allowlist');
  // The outcome vocabulary is EXACTLY the six approved human directions.
  const outcomeMatch = sql.match(/selected_outcome is null or selected_outcome in \(([^)]*)\)/);
  ok(outcomeMatch, 'selected_outcome must carry a null-or-allowlist CHECK');
  const outcomes = (outcomeMatch[1].match(/'[a-z_]+'/g) || []).map((s) => s.replace(/'/g, ''));
  ok(JSON.stringify([...outcomes].sort()) === JSON.stringify([...REMEDIATION_OUTCOMES].sort()),
    `selected_outcome allowlist must be exactly ${JSON.stringify(REMEDIATION_OUTCOMES)}, found ${JSON.stringify(outcomes)}`);
  ok(/created_by\s+uuid\s+not null references public\.vault_users/.test(sql),
    'created_by must be a NOT NULL FK to vault_users (a human opened it)');
  // Answer coherence at the SCHEMA level: an answered question must carry a
  // human + a direction + a timestamp; an unanswered one must carry none.
  ok(/answer_coherence check \(/.test(sql), '0023 must carry the answer-coherence CHECK');
  ok(/status = 'answered'[\s\S]*?and selected_outcome is not null[\s\S]*?and answered_by is not null[\s\S]*?and answered_at is not null/.test(sql),
    'answered questions must require outcome + answered_by + answered_at');
  ok(/status <> 'answered'[\s\S]*?and selected_outcome is null[\s\S]*?and answered_by is null[\s\S]*?and answered_at is null/.test(sql),
    'unanswered questions must carry no outcome / answerer / answered_at');
  // One OPEN question per fact: partial unique index on open status.
  ok(/create unique index[\s\S]*?\(workspace_id, source_exposure_id, question_kind, coalesce\(vuln_id, ''\)\)[\s\S]*?where status = 'open'/.test(sql),
    'the open-question identity index must be partial on status = open');
  ok(/alter table public\.component_remediation_questions enable row level security/.test(sql),
    'remediation-question table must enable RLS');
  // The firewall: the question layer never reaches the decision, evidence,
  // or timeline lanes, and adds no reaper machinery.
  ok(!/vault_exceptions/.test(sql), '0023 must not reference vault_exceptions — propose_exception routes through the Phase 5 lane, never a FK');
  ok(!/vault_timeline_events/.test(sql), '0023 must not reference vault_timeline_events');
  ok(!/proof_anchors/.test(sql), 'a question is not evidence — no proof_anchors');
  ok(!/component_exposure_types/.test(sql), '0023 must not touch the native type catalog');
  ok(!/alter table public\.(component_exposures|component_exposure_vulnerabilities|component_exposure_events)\b/.test(sql),
    '0023 must not alter any existing CEI table');
  ok(!/overdue|reaper|cron|trigger/i.test(sql),
    'due_at is recorded context only — no overdue transition, no reaper, no trigger in 15B');
});

test('remediation module is a question layer — it can never remediate or decide (PR-15B)', () => {
  const src = stripJsComments(read('src/server/cei/remediation-questions.js'));
  // It writes exactly one table. It never mutates the exposure, never
  // writes intelligence, never records CEI events, never reaches the
  // exception lane.
  ok(!/from\(['"]component_exposures['"]\)[\s\S]{0,120}\.(update|delete|upsert|insert)\(/.test(src),
    'remediation module must never write component_exposures');
  ok(!/from\(['"]component_exposure_vulnerabilities['"]\)[\s\S]{0,120}\.(update|delete|upsert|insert)\(/.test(src),
    'remediation module must never write the intelligence table (context stays context)');
  ok(!/component_exposure_events/.test(src),
    'remediation module must never touch CEI decision events');
  ok(!/vault_exceptions/.test(src), 'remediation module must never touch vault_exceptions');
  ok(!/vault_timeline_events/.test(src), 'remediation module must never touch the shared timeline');
  ok(!/recordProposalFromExposure|recordOutcomeFromExposure/.test(src),
    'remediation module must never record proposals or outcomes');
  // No policy vocabulary: an outcome is a direction, never a gate action.
  ok(!/'BLOCK'|'WARN'|'ALLOW'/.test(src),
    'remediation module must not reference the decision vocabulary');
  // No auto-remediation machinery of any kind.
  for (const banned of ['octokit', 'github.com/login', 'pulls.create', 'createPullRequest', 'check_runs', 'child_process', 'npm install', 'npm update']) {
    ok(!src.toLowerCase().includes(banned.toLowerCase()),
      `remediation module must not contain auto-remediation machinery: ${banned}`);
  }
  // The module's outcome list matches the migration allowlist exactly.
  const listMatch = src.match(/export const REMEDIATION_OUTCOMES\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
  ok(listMatch, 'module must export a frozen REMEDIATION_OUTCOMES array');
  const outcomes = (listMatch[1].match(/'[a-z_]+'/g) || []).map((s) => s.replace(/'/g, ''));
  ok(JSON.stringify([...outcomes].sort()) === JSON.stringify([...REMEDIATION_OUTCOMES].sort()),
    'module REMEDIATION_OUTCOMES must match the 0023 allowlist exactly');
  // Every handler is workspace-scoped (404-on-non-member doctrine).
  const handlers = src.match(/export async function handle\w+/g) || [];
  ok(handlers.length === 4, `expected exactly 4 remediation handlers, found ${handlers.length}`);
  const calls = src.match(/resolveWorkspaceForMember/g) || [];
  ok(calls.length >= handlers.length,
    'each remediation handler must call resolveWorkspaceForMember');
});

test('opening a question validates its anchors and dedupes open repeats (PR-15B)', () => {
  const src = stripJsComments(read('src/server/cei/remediation-questions.js'));
  const open = src.match(/export async function handleOpenRemediationQuestion[\s\S]*?\n}\n/);
  ok(open, 'handleOpenRemediationQuestion not found');
  // The exposure must exist IN THIS WORKSPACE; the question layer covers
  // dependency exposures in this scope.
  ok(/loadExposureForQuestion/.test(open[0]), 'open must validate the source exposure');
  ok(/dependency-exposure/.test(open[0]), 'open must refuse non-dependency exposures honestly');
  // Cited intelligence must belong to this workspace AND this exposure; the
  // vuln id is denormalized from the cited row, never client-asserted.
  ok(/loadVulnIntelForQuestion/.test(open[0]), 'open must validate cited intelligence');
  ok(/vulnId = intel\.row\.vuln_id/.test(open[0]),
    'vuln_id must be derived from the cited intelligence row, not the request body');
  // The kind is derived server-side from the anchor.
  ok(/sourceVulnIntelId \? 'vulnerability_review' : 'component_risk_review'/.test(open[0]),
    'question_kind must be derived from the anchor, never accepted from the client');
  // A second open for the same fact is repetition: 409 + pointer.
  ok(/'23505'/.test(open[0]), 'open must catch the partial-unique race');
  ok(/existing_question_id/.test(open[0]), 'the 409 must point at the existing open question');
  ok(/status(\s*:\s*|\s+)'open'/.test(open[0]), 'open must insert status open (never answered)');
  ok(!/selected_outcome/.test(open[0]), 'open must not write any outcome — the human has not decided yet');
});

test('answering is a guarded once-only transition recorded to a human (PR-15B)', () => {
  const src = stripJsComments(read('src/server/cei/remediation-questions.js'));
  const answer = src.match(/export async function handleAnswerRemediationQuestion[\s\S]*$/);
  ok(answer, 'handleAnswerRemediationQuestion not found');
  // The UPDATE only lands on a row that is still open — the answer is
  // recorded exactly once and never overwritten.
  ok(/\.eq\('status', 'open'\)/.test(answer[0]),
    'answer must be a guarded transition (update gated on status = open)');
  ok(/answered_by:\s*req\.vaultSession\.user_id/.test(answer[0]),
    'answered_by must be the authenticated human, recorded from the session');
  ok(/REMEDIATION_OUTCOMES\.includes\(outcome\)/.test(answer[0]),
    'answer must validate the outcome against the bounded allowlist');
  ok(/409/.test(answer[0]), 'a second answer must get a 409, not an overwrite');
  // Answering writes the question row and NOTHING else — assert no other
  // table appears in the handler body.
  for (const banned of ['component_exposures\'', 'component_exposure_events', 'component_exposure_vulnerabilities\'', 'vault_exceptions']) {
    ok(!answer[0].includes(banned), `answer handler must not touch ${banned}`);
  }
});

test('propose_exception routes through the Phase 5 lane — no parallel mechanism (PR-15B)', () => {
  // The module records the DIRECTION only. It never imports the exception
  // handlers, never inserts an exception, never proposes.
  const src = stripJsComments(read('src/server/cei/remediation-questions.js'));
  ok(!/from\s+['"][^'"]*exceptions/.test(src),
    'remediation module must not import the exception module');
  ok(!/state:\s*'(proposed|active|reviewed|rejected|revoked|expired)'/.test(src),
    'remediation module must not write any exception state');
  // The Phase 5 propose handler is UNTOUCHED by 15B: it still hardcodes
  // proposed and still records the 6D audit event.
  const ex = stripJsComments(read('src/server/vault/exceptions.js'));
  ok(!/remediation/i.test(ex),
    'exceptions.js must not know remediation questions exist (lanes stay separate)');
  const proposeBody = ex.match(/async function handleProposeException[\s\S]*?\n}/);
  ok(proposeBody && /state:\s*'proposed'/.test(proposeBody[0]),
    'the Phase 5 propose lane must still hardcode state: proposed');
});

test('PR-15B routes: member reads + CSRF-fronted writes, private surface only', () => {
  const routes = read('src/server/cei/routes.js');
  ok(/app\.get\(\s*'\/api\/vault\/workspaces\/:slug\/remediation-questions'/.test(routes),
    'GET list route must be registered');
  ok(/app\.get\(\s*'\/api\/vault\/workspaces\/:slug\/remediation-questions\/:id'/.test(routes),
    'GET detail route must be registered');
  const openBlock = routes.match(/app\.post\(\s*'\/api\/vault\/workspaces\/:slug\/remediation-questions'[\s\S]*?\);/);
  ok(openBlock, 'POST open route must be registered');
  ok(/requireVaultSession/.test(openBlock[0]) && /requireCsrf/.test(openBlock[0]),
    'open must require session + CSRF');
  const answerBlock = routes.match(/app\.post\(\s*'\/api\/vault\/workspaces\/:slug\/remediation-questions\/:id\/answer'[\s\S]*?\);/);
  ok(answerBlock, 'POST answer route must be registered');
  ok(/requireVaultSession/.test(answerBlock[0]) && /requireCsrf/.test(answerBlock[0]),
    'answer must require session + CSRF');
});

test('PR-15B leaves intelligence as context and the catalog at six', () => {
  // Re-assert the 15A walls from the 15B side: the intelligence module is
  // untouched by the question layer, and no new exposure type appeared.
  const intel = stripJsComments(read('src/server/cei/vuln-intel.js'));
  ok(!/remediation/i.test(intel),
    'vuln-intel.js must not know remediation questions exist (context stays context)');
  const domain = read('src/server/cei/domain.js');
  const listMatch = domain.match(/NATIVE_EXPOSURE_TYPES\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
  const slugs = (listMatch[1].match(/'[a-z0-9-]+'/g) || []);
  ok(slugs.length === 6, `native catalog must still have exactly 6 types, found ${slugs.length}`);
  // The 0022 intelligence migration is history — 15B did not edit it.
  const sql = readSqlNoComments(VULN_INTEL_MIGRATION);
  ok(!/remediation/i.test(sql), '0022 must not be rewritten by 15B');
});

test('release-integrity guard knows the 0023 table and the new route family (PR-15B)', () => {
  const guard = read('scripts/check-release-integrity.mjs');
  ok(/component_remediation_questions/.test(guard),
    'REQUIRED_TABLES must include component_remediation_questions (the 0023 prod gate is structural)');
  ok(/remediation-questions/.test(guard),
    'the runtime layer must probe the remediation-questions route family');
});

// ---------- wiring ----------

test('CEI routes are registered through the vault private surface', () => {
  const routes = read('src/server/vault/routes.js');
  ok(/registerCeiRoutes/.test(routes), 'vault routes must call registerCeiRoutes');
  const ceiRoutes = read('src/server/cei/routes.js');
  ok(/requireVaultSession/.test(ceiRoutes), 'CEI routes must require a vault session');
  ok(/requireCsrf/.test(ceiRoutes), 'CEI create route must require CSRF');
  ok(/\/api\/vault\/workspaces\/:slug\/exposures/.test(ceiRoutes),
    'CEI routes must be workspace-scoped under /api/vault/workspaces/:slug/exposures');
  // No public (non-vault) CEI route.
  ok(!/app\.(get|post)\(\s*['"]\/api\/cei/.test(ceiRoutes),
    'no public /api/cei route may exist');
});

test('errors.js exposes the PR-6A CEI error codes', () => {
  const src = read('src/server/vault/errors.js');
  for (const code of [
    'exposure_type_not_found',
    'exposure_subject_invalid',
    'exposure_metadata_invalid',
    'exposure_source_invalid',
  ]) {
    const re = new RegExp(`${code}:\\s*['"]${code.replace(/_/g, '-')}['"]`);
    ok(re.test(src), `errors.js missing ${code}`);
  }
});

test('package.json wires test:cei-foundation-v0 into test:ci', () => {
  const pkg = JSON.parse(read('package.json'));
  ok(pkg.scripts['test:cei-foundation-v0'], 'missing test:cei-foundation-v0 script');
  ok(/test-cei-foundation-v0\.mjs/.test(pkg.scripts['test:ci'] || ''),
    'test:ci must chain scripts/test-cei-foundation-v0.mjs');
});

(async () => {
  for (const fn of pending) await fn();
  console.log(`\nCEI foundation v0 tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
