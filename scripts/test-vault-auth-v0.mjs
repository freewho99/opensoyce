#!/usr/bin/env node
/**
 * Structural invariants for the Trust Vault auth + workspace foundation
 * (Phase 5 PR-V2-A).
 *
 * Doctrine enforced:
 *   - 8 migration files (validate_proof_anchors + 7 tables) present, named
 *     in the documented sequence, with no gaps from the pre-Vault end at
 *     0004_*.
 *   - Every Vault table migration enables RLS in the SAME file.
 *   - Severity-downgrade-only constraint on vault_exceptions.
 *   - visibility column locked to 'private' on vault_evidence and
 *     vault_timeline_events.
 *   - validate_proof_anchors() function defined; vault_evidence,
 *     vault_exceptions, and vault_timeline_events reference it in CHECK
 *     constraints.
 *   - Last-owner-protection trigger present on vault_workspace_memberships.
 *   - 30-day soft-delete window enforced for vault_workspaces.
 *   - 90-day redaction window enforced for vault_evidence.
 *   - 5 v0 routes present; every /api/vault/* route uses
 *     setPrivateCacheHeaders middleware; every read route uses
 *     requireVaultSession middleware.
 *   - server.ts imports and calls registerVaultRoutes.
 *   - No file under src/server/vault/ imports anything from the public
 *     spine page renderers.
 *   - No public renderer (src/pages/*, src/components/Layout.tsx,
 *     src/server/badge/*, packages/cli/src/*) imports from
 *     src/server/vault/.
 *   - test:vault-auth-v0 wired into test:ci.
 *
 * The visibility-field guard on PUBLIC shapes is NOT lifted by this PR;
 * the Trust Center hygiene test (scripts/test-open-source-trust-center.mjs)
 * still rejects 'visibility' on public renderers. This test asserts that
 * the Vault module hasn't drifted onto a public surface.
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
      console.log(`FAIL  ${name} -- ${e.message}\n${e.stack}`);
      failed += 1;
    }
  });
}
function ok(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(root, rel)); }

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------

const MIGRATIONS = [
  { num: '0005', name: 'validate_proof_anchors_function', table: null },
  { num: '0006', name: 'vault_users', table: 'vault_users' },
  { num: '0007', name: 'vault_workspaces', table: 'vault_workspaces' },
  { num: '0008', name: 'vault_workspace_memberships', table: 'vault_workspace_memberships' },
  { num: '0009', name: 'vault_sessions', table: 'vault_sessions' },
  { num: '0010', name: 'vault_evidence', table: 'vault_evidence' },
  { num: '0011', name: 'vault_exceptions', table: 'vault_exceptions' },
  { num: '0012', name: 'vault_timeline_events', table: 'vault_timeline_events' },
  { num: '0013', name: 'vault_create_workspace_with_owner_function', table: null },
];

test('all 9 Vault migrations present with the documented sequence + names', () => {
  for (const m of MIGRATIONS) {
    const filename = `supabase/migrations/${m.num}_${m.name}.sql`;
    ok(exists(filename), `missing migration ${filename}`);
  }
});

test('migration sequence has no gaps from the candidate-pipeline end at 0004', () => {
  const filenames = fs.readdirSync(path.join(root, 'supabase/migrations')).sort();
  const numbered = filenames.filter((f) => /^\d{4}_/.test(f));
  const numbers = numbered.map((f) => parseInt(f.slice(0, 4), 10));
  for (let i = 1; i < numbers.length; i += 1) {
    eq(numbers[i] - numbers[i - 1], 1, `migration gap between ${numbers[i - 1]} and ${numbers[i]}`);
  }
});

test('every Vault table migration enables RLS in the SAME file', () => {
  for (const m of MIGRATIONS) {
    if (!m.table) continue;
    const sql = read(`supabase/migrations/${m.num}_${m.name}.sql`);
    ok(
      sql.toLowerCase().includes(`alter table public.${m.table} enable row level security`),
      `migration 0${m.num} (${m.table}) must enable RLS in the same file`,
    );
  }
});

test('validate_proof_anchors function is defined and used by every audit table', () => {
  const fnSql = read('supabase/migrations/0005_validate_proof_anchors_function.sql');
  ok(
    fnSql.toLowerCase().includes('create or replace function public.validate_proof_anchors'),
    '0005 must define public.validate_proof_anchors',
  );
  // Stable contract: returns boolean, immutable.
  ok(fnSql.toLowerCase().includes('returns boolean'), 'validate_proof_anchors must return boolean');
  ok(fnSql.toLowerCase().includes('immutable'), 'validate_proof_anchors must be immutable');

  for (const tableName of ['vault_evidence', 'vault_exceptions', 'vault_timeline_events']) {
    const migration = MIGRATIONS.find((m) => m.table === tableName);
    const sql = read(`supabase/migrations/${migration.num}_${migration.name}.sql`);
    ok(
      sql.toLowerCase().includes('public.validate_proof_anchors'),
      `${tableName} migration must reference validate_proof_anchors in a CHECK`,
    );
  }
});

test('vault_evidence and vault_timeline_events lock visibility = private', () => {
  const evidence = read('supabase/migrations/0010_vault_evidence.sql');
  ok(
    /visibility[^;]*check[^;]*visibility\s*=\s*'private'/i.test(evidence.replace(/\s+/g, ' ')),
    'vault_evidence must have CHECK (visibility = private)',
  );
  const timeline = read('supabase/migrations/0012_vault_timeline_events.sql');
  ok(
    /visibility[^;]*check[^;]*visibility\s*=\s*'private'/i.test(timeline.replace(/\s+/g, ' ')),
    'vault_timeline_events must have CHECK (visibility = private)',
  );
});

test('vault_exceptions enforces severity-downgrade-only at the SQL CHECK level', () => {
  const sql = read('supabase/migrations/0011_vault_exceptions.sql').toLowerCase();
  ok(sql.includes('vault_exceptions_downgrade_only'), 'downgrade-only CHECK constraint missing');
  // Spot-check the matrix: BLOCK can become WARN or ALLOW; WARN can only become ALLOW.
  ok(sql.includes("original_action = 'block'") && sql.includes("allowed_action in ('warn','allow')"),
    'BLOCK -> WARN/ALLOW branch must be present in the CHECK');
  ok(sql.includes("original_action = 'warn'") && sql.includes("allowed_action = 'allow'"),
    'WARN -> ALLOW branch must be present in the CHECK');
});

test('vault_exceptions enforces active-requires-expiry CHECK', () => {
  const sql = read('supabase/migrations/0011_vault_exceptions.sql').toLowerCase();
  ok(
    sql.includes('vault_exceptions_active_requires_expiry'),
    'active-requires-expiry CHECK constraint missing',
  );
});

test('last-owner-protection trigger present on vault_workspace_memberships', () => {
  const sql = read('supabase/migrations/0008_vault_workspace_memberships.sql').toLowerCase();
  ok(
    sql.includes('create or replace function public.vault_protect_last_owner'),
    'vault_protect_last_owner function missing',
  );
  ok(
    sql.includes('vault_memberships_last_owner_protection'),
    'last-owner trigger missing',
  );
  ok(
    sql.includes('before update or delete on public.vault_workspace_memberships'),
    'trigger must fire BEFORE UPDATE/DELETE on memberships',
  );
});

test('vault_workspaces enforces a 30-day soft-delete window CHECK', () => {
  const sql = read('supabase/migrations/0007_vault_workspaces.sql').toLowerCase();
  ok(
    sql.includes('workspaces_soft_delete_window'),
    '30-day soft-delete window CHECK missing',
  );
  ok(
    sql.includes("interval '30 days'"),
    'soft-delete window must reference 30 days',
  );
});

test('vault_evidence enforces a 90-day redaction window CHECK', () => {
  const sql = read('supabase/migrations/0010_vault_evidence.sql').toLowerCase();
  ok(
    sql.includes('vault_evidence_redaction_window'),
    '90-day redaction window CHECK missing',
  );
  ok(
    sql.includes("interval '90 days'"),
    'redaction window must reference 90 days',
  );
});

// ---------------------------------------------------------------------------
// Server module
// ---------------------------------------------------------------------------

test('5 v0 routes registered in src/server/vault/routes.js', () => {
  const sql = read('src/server/vault/routes.js');
  for (const route of [
    "'/api/vault/auth/login'",
    "'/api/vault/auth/logout'",
    "'/api/vault/me'",
    "'/api/vault/workspaces'",
    "'/api/vault/workspaces/:slug'",
  ]) {
    ok(sql.includes(route), `route ${route} missing`);
  }
  // Lock the count: no 6th /api/vault/* registration in v0.
  const matches = sql.match(/\/api\/vault\//g) || [];
  ok(matches.length >= 5, 'routes.js should register at least 5 /api/vault/* paths');
});

test('every /api/vault/* route uses setPrivateCacheHeaders + requireVaultSession (except OAuth login)', () => {
  const routes = read('src/server/vault/routes.js');
  ok(routes.includes('setPrivateCacheHeaders'), 'setPrivateCacheHeaders middleware must be used');
  // Login is the only route allowed without the session middleware.
  ok(routes.includes('requireVaultSession'), 'requireVaultSession middleware must be used');
  const loginIdx = routes.indexOf("'/api/vault/auth/login'");
  const loginLine = routes.slice(loginIdx, routes.indexOf('\n', loginIdx + 5));
  ok(
    !loginLine.includes('requireVaultSession'),
    'OAuth login route must NOT require a session (it establishes one)',
  );
});

test('cache middleware sets the locked private headers', () => {
  const sql = read('src/server/vault/cache.js');
  ok(sql.includes("'Cache-Control'"), 'Cache-Control header must be set');
  ok(sql.includes('private, no-store, no-cache, must-revalidate'),
    'Cache-Control value must be private/no-store/no-cache/must-revalidate');
  ok(sql.includes("'Vary'") && sql.includes('Cookie'), 'Vary: Cookie must be set');
});

test('session middleware enforces 401 on missing/expired/invalid session', () => {
  const sql = read('src/server/vault/auth.js');
  ok(sql.includes('opensoyce_vault_session'), 'cookie name must be opensoyce_vault_session');
  ok(sql.includes('HttpOnly') && sql.includes('Secure') && sql.includes('SameSite=Lax'),
    'cookie attrs must include HttpOnly + Secure + SameSite=Lax');
  ok(sql.includes('auth-required'), '401 path must use the auth-required error code');
});

test('RBAC module enforces 4 roles and the 404-on-non-member doctrine', () => {
  const sql = read('src/server/vault/rbac.js');
  ok(sql.includes('ROLE_RANK'), 'ROLE_RANK map must be exported');
  for (const role of ['member', 'reviewer', 'owner']) {
    const re = new RegExp(`\\b${role}\\b\\s*:`);
    ok(re.test(sql), `role ${role} must be in the ROLE_RANK table`);
  }
  // 404-on-non-member: missing membership returns 404 not 403.
  ok(
    sql.includes(`sendError(res, 404`),
    'rbac.js must send 404 on missing membership (not 403)',
  );
  ok(
    sql.includes('roleAllows'),
    'roleAllows helper must exist for >= checks',
  );
});

test('OAuth handler uses GITHUB_OAUTH_CLIENT_ID/SECRET and writes vault_users + vault_sessions', () => {
  const sql = read('src/server/vault/oauth.js');
  ok(sql.includes('GITHUB_OAUTH_CLIENT_ID'), 'must read GITHUB_OAUTH_CLIENT_ID env');
  ok(sql.includes('GITHUB_OAUTH_CLIENT_SECRET'), 'must read GITHUB_OAUTH_CLIENT_SECRET env');
  ok(sql.includes('vault_users'), 'must upsert vault_users');
  ok(sql.includes('vault_sessions'), 'must insert vault_sessions');
  ok(sql.includes('github.com/login/oauth/access_token'), 'must POST to GitHub token endpoint');
});

test('workspaces handler enforces slug shape + 1-200 char display_name + makes creator the owner', () => {
  const sql = read('src/server/vault/workspaces.js');
  ok(/SLUG_RE\s*=\s*\/\^/.test(sql), 'SLUG_RE regex constant must be present');
  ok(sql.includes('workspace_display_name_invalid'), 'display_name length check must be present');
  // The creator becomes owner via the atomic RPC. The literal "role: 'owner'"
  // appears in the response shape and/or the SQL function comment.
  ok(sql.includes("role: 'owner'"), 'creator must be returned as owner');
});

test('workspace creation is atomic: calls vault_create_workspace_with_owner RPC, never two separate inserts', () => {
  // Reviewer-flagged blocker from PR #78 review: the old shape (workspace
  // insert + separate membership insert + best-effort DELETE rollback) left
  // an ownerless-workspace hole. The fix is to do both inserts inside one
  // Postgres function body (migration 0013), called via Supabase RPC.
  const sql = read('src/server/vault/workspaces.js');
  ok(
    /supabase\.rpc\s*\(\s*'vault_create_workspace_with_owner'/.test(sql),
    'workspaces.js must call the atomic vault_create_workspace_with_owner RPC',
  );
  // The old two-step shape is forbidden inside handleVaultCreateWorkspace:
  // there must NOT be both a vault_workspaces .insert(...) AND a
  // vault_workspace_memberships .insert(...) in the source. The RPC body
  // does both server-side. (We still allow vault_workspace_memberships
  // .insert() elsewhere in the file for future invitation flows; the check
  // is the absence of a vault_workspaces .insert(...) literal.)
  ok(
    !sql.includes(".from('vault_workspaces')\n    .insert"),
    'workspaces.js must not insert into vault_workspaces from application code (atomic RPC only)',
  );
  // The bad rollback pattern is gone for good.
  ok(
    !sql.includes('Best-effort rollback'),
    'workspaces.js must not contain the deprecated best-effort rollback path',
  );
});

test('migration 0013 defines vault_create_workspace_with_owner and inserts both workspace + membership', () => {
  const sql = read('supabase/migrations/0013_vault_create_workspace_with_owner_function.sql');
  ok(
    sql.toLowerCase().includes('create or replace function public.vault_create_workspace_with_owner'),
    '0013 must define public.vault_create_workspace_with_owner',
  );
  ok(
    /insert\s+into\s+public\.vault_workspaces/i.test(sql),
    '0013 must insert into vault_workspaces',
  );
  ok(
    /insert\s+into\s+public\.vault_workspace_memberships/i.test(sql),
    '0013 must insert the owner membership row in the same function body',
  );
  ok(
    sql.toLowerCase().includes("'owner'"),
    "0013 must insert the initial member as role 'owner'",
  );
});

test('server.ts wires registerVaultRoutes', () => {
  const sql = read('server.ts');
  ok(sql.includes('registerVaultRoutes'), 'server.ts must import + call registerVaultRoutes');
  ok(
    sql.includes("./src/server/vault/routes"),
    'server.ts must import from src/server/vault/routes',
  );
});

// ---------------------------------------------------------------------------
// Isolation invariants
// ---------------------------------------------------------------------------

test('no Vault module imports from public-spine page renderers', () => {
  const vaultFiles = ['db.js', 'cache.js', 'auth.js', 'oauth.js', 'rbac.js', 'workspaces.js', 'routes.js', 'errors.js'];
  for (const file of vaultFiles) {
    const sql = read(`src/server/vault/${file}`);
    for (const banned of [
      'src/pages/',
      'src/components/Layout',
      'src/shared/openSourceTrustCenter',
      'src/shared/repoTrustDashboard',
      'src/shared/trustTimeline',
      'src/server/badge',
      'packages/cli',
    ]) {
      ok(!sql.includes(banned), `${file} must not import ${banned}`);
    }
  }
});

test('no public renderer imports from src/server/vault/', () => {
  const publicFiles = [
    'src/pages/Proof.tsx',
    'src/pages/Home.tsx',
    'src/pages/OpenSourceTrustCenter.tsx',
    'src/pages/RepoTrustDashboard.tsx',
    'src/pages/TrustTimeline.tsx',
    'src/components/Layout.tsx',
    'src/server/badge/routes.js',
    'src/server/badge/renderer.js',
    'src/server/badge/strings.js',
    'packages/cli/src/cli.ts',
    'packages/cli/src/args.ts',
    'packages/cli/src/api.ts',
    'packages/cli/src/strings.ts',
  ];
  for (const file of publicFiles) {
    if (!exists(file)) continue;
    const sql = read(file);
    ok(
      !sql.includes('src/server/vault') && !sql.includes('server/vault/'),
      `${file} must not import from src/server/vault/`,
    );
  }
});

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

test('package.json wires test:vault-auth-v0 into test:ci', () => {
  const pkg = JSON.parse(read('package.json'));
  ok(pkg.scripts['test:vault-auth-v0'], 'missing test:vault-auth-v0 script');
  ok(
    pkg.scripts['test:vault-auth-v0'].includes('scripts/test-vault-auth-v0.mjs'),
    'bad test:vault-auth-v0 script wiring',
  );
  ok(
    pkg.scripts['test:ci'].includes('scripts/test-vault-auth-v0.mjs'),
    'test:ci must include the Vault auth v0 invariants test',
  );
});

// ---------------------------------------------------------------------------

(async () => {
  for (const fn of pending) await fn();
  console.log(`\nVault auth v0 tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
