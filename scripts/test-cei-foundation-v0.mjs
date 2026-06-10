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

const TYPES_MIGRATION = 'supabase/migrations/0017_component_exposure_types.sql';
const EXPOSURES_MIGRATION = 'supabase/migrations/0018_component_exposures.sql';

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
    ok(!/\.insert\(\s*\{[\s\S]*?type_slug/.test(src),
      `${rel} inserts into the exposure-type catalog (must stay read-only in 6A)`);
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
    ok(!/vault_timeline_events/.test(src),
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
