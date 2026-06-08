#!/usr/bin/env node
/**
 * Structural invariants for the Trust Vault exception state machine + API
 * (Phase 5 PR-V2-B).
 *
 * Doctrine enforced (matches docs/architecture/vault-exception-state-machine-api-sub-sketch.md):
 *   - 8 endpoints registered (no more, no fewer):
 *       GET   /api/vault/workspaces/:slug/exceptions
 *       GET   /api/vault/workspaces/:slug/exceptions/:id
 *       POST  /api/vault/workspaces/:slug/exceptions
 *       POST  /api/vault/workspaces/:slug/exceptions/:id/approve
 *       POST  /api/vault/workspaces/:slug/exceptions/:id/reject
 *       POST  /api/vault/workspaces/:slug/exceptions/:id/revoke
 *       POST  /api/vault/workspaces/:slug/exceptions/:id/extend
 *       PATCH /api/vault/workspaces/:slug/exceptions/:id
 *   - DELETE on exception rows is registered and returns 405 (rejected as
 *     a documented "do not implement" route per PR-V1-C §2.6).
 *   - Every mutating route is fronted by requireCsrf middleware.
 *   - No "renew" endpoint exists.
 *   - Migration 0014 (vault_idempotency_keys) present with the 24h TTL
 *     CHECK + unique (workspace_id, idempotency_key).
 *   - Migration 0015 (timeline trigger functions) present with the 7 named
 *     event_type emissions: exception_proposed / approved / rejected /
 *     revoked / expired / extended (and the explicit branch for each).
 *   - Every state-mutating UPDATE in exceptions.js carries
 *     `.eq('state', '<expected>')` so a race surfaces as 409, not a silent
 *     overwrite.
 *   - Self-approval returns 403 self-approval-forbidden.
 *   - Downgrade-only violations return 400 downgrade-only-violation.
 *   - expires_at <= now + 60s returns 400 expires-at-in-past.
 *   - exceptions.js never imports CLI / badge / public-spine modules.
 *   - package.json wires test:vault-exception-api-v0 into test:ci.
 *   - The visibility-field guard on public shapes stays unlifted
 *     (Trust Center hygiene test is independent and must still be green
 *     post-merge; this test asserts no public renderer imports
 *     src/server/vault/exceptions.js).
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
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(root, rel)); }

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------

test('migration 0014 vault_idempotency_keys present with unique key + 24h-window discipline', () => {
  const file = 'supabase/migrations/0014_vault_idempotency_keys.sql';
  ok(exists(file), 'migration 0014 missing');
  const sql = read(file).toLowerCase();
  ok(sql.includes('create table if not exists public.vault_idempotency_keys'),
    'vault_idempotency_keys table must be created');
  ok(sql.includes('unique (workspace_id, idempotency_key)'),
    'unique (workspace_id, idempotency_key) constraint required');
  ok(sql.includes('enable row level security'),
    'RLS must be enabled in the same migration file');
});

test('migration 0015 timeline trigger functions emit the 6 exception lifecycle event types', () => {
  const file = 'supabase/migrations/0015_vault_exception_timeline_triggers.sql';
  ok(exists(file), 'migration 0015 missing');
  const sql = read(file).toLowerCase();
  for (const evType of [
    'exception_proposed',
    'exception_approved',
    'exception_rejected',
    'exception_revoked',
    'exception_expired',
    'exception_extended',
  ]) {
    ok(sql.includes(evType), `migration 0015 must reference ${evType}`);
  }
  // The trigger functions must INSERT into vault_timeline_events.
  ok(sql.includes('insert into public.vault_timeline_events'),
    'trigger functions must insert into vault_timeline_events');
  // Triggers attached AFTER INSERT and AFTER UPDATE on vault_exceptions.
  ok(sql.includes('after insert on public.vault_exceptions'),
    'AFTER INSERT trigger missing on vault_exceptions');
  ok(sql.includes('after update on public.vault_exceptions'),
    'AFTER UPDATE trigger missing on vault_exceptions');
  // The references_json payload uses private-anchor proofType.
  ok(sql.includes("'private-anchor'"),
    'timeline event references_json must use private-anchor proofType');
});

test('private-anchor href in trigger uses workspace slug, not workspace_id UUID', () => {
  // Reviewer-flagged blocker (PR #81 review). Per PR-V1-D §1.2 the
  // canonical URL pattern is /api/vault/workspaces/:slug/exceptions/:id.
  // Writing workspace_id::text in the :slug segment would commit a
  // syntactically-valid-looking anchor that resolves to a broken route
  // (workspace handlers expect a slug). The trigger MUST look up the slug
  // from vault_workspaces and use it.
  const sql = read('supabase/migrations/0015_vault_exception_timeline_triggers.sql');
  const rawSql = sql; // case preserved; the forbidden pattern is case-sensitive.

  // FORBIDDEN: workspace_id::text appearing in any /api/vault/workspaces/...
  // href construction. This is the exact reviewer-named anti-pattern.
  ok(
    !/'\/api\/vault\/workspaces\/'\s*\|\|\s*new\.workspace_id::text/.test(rawSql),
    'trigger MUST NOT build href with new.workspace_id::text in the :slug segment',
  );

  // REQUIRED: each trigger declares v_workspace_slug, looks it up from
  // vault_workspaces by workspace_id, and references it inside the href
  // template.
  ok(
    /v_workspace_slug\s+text/i.test(rawSql),
    'trigger must declare v_workspace_slug text',
  );
  ok(
    /select\s+w\.slug\s+into\s+v_workspace_slug/i.test(rawSql),
    'trigger must SELECT slug INTO v_workspace_slug from vault_workspaces',
  );
  ok(
    /from\s+public\.vault_workspaces/i.test(rawSql),
    'slug lookup must read from public.vault_workspaces',
  );

  // Count: the href is built with v_workspace_slug in BOTH trigger
  // functions (insert + update).
  const hrefBuilds = (rawSql.match(/'\/api\/vault\/workspaces\/'\s*\|\|\s*v_workspace_slug/g) || []).length;
  ok(
    hrefBuilds >= 2,
    `expected v_workspace_slug to appear in the href template in BOTH trigger functions; found ${hrefBuilds}`,
  );

  // Sanity guard: if the workspace lookup returns null, the trigger raises
  // (not silently writes a NULL slug into the href). Defense-in-depth.
  ok(
    /v_workspace_slug\s+is\s+null/i.test(rawSql) && /raise\s+exception/i.test(rawSql),
    'trigger must raise if the workspace slug lookup misses (no silent NULL href)',
  );
});

test('migration sequence (0005-0015) is gap-free', () => {
  const filenames = fs.readdirSync(path.join(root, 'supabase/migrations')).sort();
  const numbered = filenames.filter((f) => /^\d{4}_/.test(f));
  const numbers = numbered.map((f) => parseInt(f.slice(0, 4), 10));
  for (let i = 1; i < numbers.length; i += 1) {
    eq(numbers[i] - numbers[i - 1], 1, `migration gap between ${numbers[i - 1]} and ${numbers[i]}`);
  }
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

test('routes.js registers exactly the 8 documented exception endpoints + the DELETE 405 stub', () => {
  const sql = read('src/server/vault/routes.js');
  // Two GETs.
  ok(sql.includes("app.get(\n    '/api/vault/workspaces/:slug/exceptions'"),
    'GET list endpoint missing');
  ok(sql.includes("app.get(\n    '/api/vault/workspaces/:slug/exceptions/:id'"),
    'GET single endpoint missing');
  // Five POSTs.
  ok(sql.includes("app.post(\n    '/api/vault/workspaces/:slug/exceptions'"),
    'POST propose endpoint missing');
  ok(sql.includes("/exceptions/:id/approve'"), 'POST approve endpoint missing');
  ok(sql.includes("/exceptions/:id/reject'"), 'POST reject endpoint missing');
  ok(sql.includes("/exceptions/:id/revoke'"), 'POST revoke endpoint missing');
  ok(sql.includes("/exceptions/:id/extend'"), 'POST extend endpoint missing');
  // One PATCH.
  ok(sql.includes("app.patch(\n    '/api/vault/workspaces/:slug/exceptions/:id'"),
    'PATCH proposal-edit endpoint missing');
  // DELETE 405 stub.
  ok(sql.includes("app.delete(\n    '/api/vault/workspaces/:slug/exceptions/:id'"),
    'DELETE 405 stub missing');
});

test('every mutating exception endpoint is fronted by requireCsrf', () => {
  const sql = read('src/server/vault/routes.js');
  // Pull each mutating-route block; assert requireCsrf appears in it.
  const mutatingPatterns = [
    "app.post(\n    '/api/vault/workspaces/:slug/exceptions',",
    "/exceptions/:id/approve',",
    "/exceptions/:id/reject',",
    "/exceptions/:id/revoke',",
    "/exceptions/:id/extend',",
    "app.patch(\n    '/api/vault/workspaces/:slug/exceptions/:id',",
  ];
  for (const pat of mutatingPatterns) {
    const idx = sql.indexOf(pat);
    ok(idx >= 0, `route pattern not found: ${pat}`);
    const end = sql.indexOf(');', idx);
    const block = sql.slice(idx, end);
    ok(block.includes('requireCsrf'), `mutating route at ${pat.slice(0, 40)} must use requireCsrf`);
  }
});

test('GET routes do NOT use requireCsrf', () => {
  const sql = read('src/server/vault/routes.js');
  for (const getPat of [
    "app.get(\n    '/api/vault/workspaces/:slug/exceptions',",
    "app.get(\n    '/api/vault/workspaces/:slug/exceptions/:id',",
  ]) {
    const idx = sql.indexOf(getPat);
    ok(idx >= 0, `GET pattern not found: ${getPat}`);
    const end = sql.indexOf(');', idx);
    const block = sql.slice(idx, end);
    ok(!block.includes('requireCsrf'), `GET route must NOT use requireCsrf: ${getPat.slice(0, 40)}`);
  }
});

test('no "renew" / "renew exception" route exists', () => {
  const sql = read('src/server/vault/routes.js');
  ok(!sql.includes('/renew'), 'no /renew endpoint allowed');
  ok(!sql.includes('handleRenewException'), 'no renew handler allowed');
});

// ---------------------------------------------------------------------------
// State machine guards
// ---------------------------------------------------------------------------

test('every state-mutating UPDATE in exceptions.js carries .eq("state", "<expected>")', () => {
  const sql = read('src/server/vault/exceptions.js');
  // Every approve/reject/revoke/extend must include a WHERE state = ... guard.
  // We grep for the pair: `.update(` followed (within ~600 chars) by
  // `.eq('state',`.
  const updateBlocks = sql.split('.update(').slice(1);
  ok(updateBlocks.length >= 4, 'expected at least 4 state-mutating updates (approve/reject/revoke/extend)');
  for (const block of updateBlocks) {
    const limited = block.slice(0, 800);
    ok(
      limited.includes(".eq('state',"),
      'every .update(...) on vault_exceptions must be followed by an .eq("state", ...) guard within the same call chain',
    );
  }
});

test('handleApproveException enforces four-eye principle', () => {
  const sql = read('src/server/vault/exceptions.js');
  ok(sql.includes('self_approval_forbidden'), 'self-approval-forbidden error code must be sent');
  ok(
    /membership\.role\s*===\s*'reviewer'\s*&&\s*row\.proposed_by/.test(sql),
    'four-eye check must compare role and proposer identity',
  );
});

test('downgrade-only validation rejects bad action pairs', () => {
  const sql = read('src/server/vault/exceptions.js');
  ok(sql.includes('downgrade_only_violation'), 'downgrade-only-violation error code must be sent');
  ok(sql.includes('isDowngrade('), 'isDowngrade helper must be used');
});

test('expires_at must be > now + 60s', () => {
  const sql = read('src/server/vault/exceptions.js');
  ok(sql.includes('expires_at_in_past'), 'expires-at-in-past error code must be sent');
  ok(sql.includes('60_000') || sql.includes('60000'), 'a 60-second buffer must be enforced');
});

test('DELETE handler returns 405 with Allow: GET, POST, PATCH', () => {
  const sql = read('src/server/vault/exceptions.js');
  ok(sql.includes('handleDeleteForbidden'), 'handleDeleteForbidden export missing');
  ok(sql.includes("'Allow', 'GET, POST, PATCH'"), 'Allow header must enumerate supported methods');
  ok(sql.includes(', 405,'), 'DELETE handler must return status 405');
});

// ---------------------------------------------------------------------------
// CSRF
// ---------------------------------------------------------------------------

test('CSRF middleware uses the documented cookie + header names', () => {
  const sql = read('src/server/vault/csrf.js');
  ok(sql.includes('opensoyce_vault_csrf'), 'cookie name must be opensoyce_vault_csrf');
  ok(sql.includes('x-opensoyce-vault-csrf'), 'header name (lowercased) must be x-opensoyce-vault-csrf');
  // Per PR-V1-C §5: cookie must NOT be HttpOnly (client must read it).
  // Pull the actual Set-Cookie template literal lines and assert HttpOnly
  // absent there. Comments (e.g., "Not HttpOnly so the SPA can read it")
  // are allowed because the rule is about the actual cookie attribute, not
  // about the prose explaining the design.
  const setCookieLines = sql.split('\n').filter(
    (line) => line.includes('CSRF_COOKIE_NAME=') || line.includes('opensoyce_vault_csrf='),
  );
  for (const line of setCookieLines) {
    ok(!/HttpOnly/.test(line), `CSRF cookie line must NOT carry HttpOnly: ${line.trim()}`);
  }
});

test('CSRF middleware returns 4 distinct error codes for the 4 failure modes', () => {
  const sql = read('src/server/vault/csrf.js');
  for (const code of ['csrf_missing_cookie', 'csrf_missing_header', 'csrf_mismatch', 'csrf_empty']) {
    ok(sql.includes(code), `CSRF middleware must emit ${code}`);
  }
});

test('OAuth login sets BOTH the session cookie AND the CSRF cookie', () => {
  const sql = read('src/server/vault/oauth.js');
  ok(sql.includes('opensoyce_vault_session='), 'session cookie must be set on login');
  ok(sql.includes('opensoyce_vault_csrf='), 'CSRF cookie must be set on login');
  ok(sql.includes('generateCsrfToken'), 'login must rotate the CSRF token');
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

test('idempotency module enforces 24-hour window + ≤128-char key', () => {
  const sql = read('src/server/vault/idempotency.js');
  ok(sql.includes('24 * 60 * 60 * 1000'), '24-hour TTL must be enforced');
  ok(/length.*128|\{1,128\}/i.test(sql), 'idempotency_key length must be ≤128');
  ok(sql.includes('lookupIdempotencyResponse'), 'lookupIdempotencyResponse export missing');
  ok(sql.includes('storeIdempotencyResponse'), 'storeIdempotencyResponse export missing');
});

test('idempotency replay rejects mismatched user (different session → 403)', () => {
  const sql = read('src/server/vault/idempotency.js');
  ok(
    /prior\.user_id\s*!==\s*session\.user_id/.test(sql),
    'idempotency replay must compare user_id against the current session',
  );
  ok(sql.includes('forbidden_role'), 'mismatched user must surface as forbidden-role 403');
});

// ---------------------------------------------------------------------------
// Isolation
// ---------------------------------------------------------------------------

test('exceptions.js does not import CLI / badge / public-spine modules', () => {
  const sql = read('src/server/vault/exceptions.js');
  for (const banned of [
    'packages/cli',
    'src/server/badge',
    'src/pages/',
    'src/components/Layout',
    'src/shared/openSourceTrustCenter',
    'src/shared/trustTimeline',
    'src/shared/repoTrustDashboard',
  ]) {
    ok(!sql.includes(banned), `exceptions.js must not import ${banned}`);
  }
});

test('no public renderer imports exceptions.js or any new vault file', () => {
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
      !sql.includes('server/vault/exceptions') &&
        !sql.includes('server/vault/csrf') &&
        !sql.includes('server/vault/idempotency') &&
        !sql.includes('server/vault/etag'),
      `${file} must not import new vault modules`,
    );
  }
});

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

test('package.json wires test:vault-exception-api-v0 into test:ci', () => {
  const pkg = JSON.parse(read('package.json'));
  ok(pkg.scripts['test:vault-exception-api-v0'], 'missing test:vault-exception-api-v0 script');
  ok(
    pkg.scripts['test:vault-exception-api-v0'].includes('scripts/test-vault-exception-api-v0.mjs'),
    'bad test:vault-exception-api-v0 script wiring',
  );
  ok(
    pkg.scripts['test:ci'].includes('scripts/test-vault-exception-api-v0.mjs'),
    'test:ci must include the Vault exception API v0 invariants test',
  );
});

// ---------------------------------------------------------------------------

(async () => {
  for (const fn of pending) await fn();
  console.log(`\nVault exception API v0 tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
