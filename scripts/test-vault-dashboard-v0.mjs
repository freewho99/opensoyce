#!/usr/bin/env node
/**
 * PR-V2-E structural invariants for the Vault Dashboard + /cli-auth page.
 *
 * Covers the 9 scope items from the user-approved PR-V2-E call:
 *
 *   1. /cli-auth browser approval page exists and authenticates session
 *   2. Vault Dashboard shell exists with its own minimal chrome
 *   3. Workspace-aware Vault state is rendered (workspaces, members)
 *   4. Trust Expiry table (exception list with expires_at column) exists
 *   5. Evidence private-read links only when authorized
 *   6. Vault Timeline read view exists with [PRIVATE] marker
 *   7. Uses existing PR-V2-B / PR-V2-C APIs only (no new server routes)
 *   8. Preserves CLI behavior from PR-V2-D
 *   9. Preserves public Trust Center / Badge / Timeline behavior
 *
 * Plus PR-V1-D §7 + PR-V2-E specific structural rules:
 *
 *   - Vault Dashboard pages live ONLY under the documented allowlist
 *   - Public-spine pages do NOT import vault dashboard files
 *   - Vault Dashboard pages do NOT import public-spine pages / data
 *   - The shared API client is the ONLY place that adds the CSRF header
 *   - No `private-anchor` literal escapes into public-spine source
 *   - The dashboard routes are wired under their own VaultLayout (not
 *     under the public Layout)
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
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

const VAULT_DASHBOARD_FILES = [
  'src/pages/CliAuth.tsx',
  'src/pages/vault/VaultDashboard.tsx',
  'src/pages/vault/VaultWorkspace.tsx',
  'src/pages/vault/VaultExceptionList.tsx',
  'src/pages/vault/VaultExceptionDetail.tsx',
  'src/pages/vault/VaultTimeline.tsx',
  'src/pages/vault/VaultEvidenceDetail.tsx',
  'src/components/VaultLayout.tsx',
  'src/shared/vault/api-client.ts',
];

// ---------- 1. /cli-auth page ----------

test('CliAuth page exists and gates on a logged-in session', () => {
  const src = read('src/pages/CliAuth.tsx');
  ok(/fetchVaultMe/.test(src), 'CliAuth must call fetchVaultMe to detect session');
  ok(/'unauth'/.test(src), 'CliAuth must surface an unauth phase when not logged in');
  ok(/approveCliCode/.test(src), 'CliAuth must POST through approveCliCode');
  ok(/['"`]\/api\/vault\/auth\/login\?redirect_to=/.test(src),
    'CliAuth must redirect anonymous visitors through the existing OAuth login with redirect_to');
});

test('CliAuth route is wired in App.tsx', () => {
  const app = read('src/App.tsx');
  ok(/path="\/cli-auth"\s+element=\{<CliAuth\s*\/>\}/.test(app),
    'App.tsx must register a Route at /cli-auth that renders CliAuth');
});

// ---------- 2. Vault Dashboard shell ----------

test('VaultLayout renders outside the public Layout', () => {
  const app = read('src/App.tsx');
  // VaultLayout is the wrapping element of the /vault Route group.
  ok(/path="\/vault"\s+element=\{<VaultLayout\s*\/>\}/.test(app),
    'App.tsx must wire /vault under VaultLayout (not the public Layout)');
  // Public Layout must NOT envelope the vault path. Search for any line
  // matching `<Route path="/" element={<Layout ...>` and confirm `/vault`
  // is NOT under it.
  const layoutBlockMatch = app.match(/<Route path="\/" element=\{<Layout[\s\S]*?<\/Route>/);
  ok(layoutBlockMatch, 'public Layout block not found in App.tsx');
  ok(!/path="\/?(?:cli-auth|vault)/.test(layoutBlockMatch[0]),
    'public Layout block must not contain /cli-auth or /vault routes');
});

test('VaultLayout does NOT import the public Layout', () => {
  const src = read('src/components/VaultLayout.tsx');
  ok(!/from\s+['"][^'"]*\/components\/Layout['"]/i.test(src),
    'VaultLayout must not import the public Layout');
  ok(!/import\s+Layout\b/.test(src),
    'VaultLayout must not import a Layout symbol from the public chrome');
});

// ---------- 3 + 4. Workspace state + Trust Expiry table ----------

test('VaultDashboard fetches workspaces and renders the list', () => {
  const src = read('src/pages/vault/VaultDashboard.tsx');
  ok(/fetchVaultMe/.test(src), 'VaultDashboard must call fetchVaultMe');
  ok(/workspaces\.map/.test(src), 'VaultDashboard must render the workspaces list');
});

test('VaultExceptionList renders the Trust Expiry table with expires_at', () => {
  const src = read('src/pages/vault/VaultExceptionList.tsx');
  ok(/listExceptions/.test(src), 'VaultExceptionList must call listExceptions');
  ok(/Trust Expiry/.test(src), 'VaultExceptionList must label the Trust Expiry surface');
  ok(/expires_at/.test(src), 'VaultExceptionList must surface expires_at');
  ok(/expiryUrgency/.test(src) || /urgency/.test(src),
    'VaultExceptionList must apply expiry urgency styling');
});

test('VaultWorkspace renders members and quick-action links', () => {
  const src = read('src/pages/vault/VaultWorkspace.tsx');
  ok(/fetchWorkspace/.test(src), 'VaultWorkspace must call fetchWorkspace');
  ok(/\/exceptions/.test(src) && /\/timeline/.test(src),
    'VaultWorkspace must link to /exceptions and /timeline sub-routes');
});

// ---------- 5. Evidence private-read links + masking honesty ----------

test('VaultEvidenceDetail honestly surfaces masking instead of empty-stringing', () => {
  const src = read('src/pages/vault/VaultEvidenceDetail.tsx');
  ok(/maskedFields/.test(src),
    'VaultEvidenceDetail must read the X-OpenSoyce-Vault-Masked-Fields header');
  ok(/body masked/.test(src),
    'VaultEvidenceDetail must render an explicit "body masked" notice when applicable');
});

// ---------- 6. Vault Timeline view with [PRIVATE] marker ----------

test('VaultTimeline renders the [PRIVATE] marker per PR-V1-E §5.2', () => {
  const src = read('src/pages/vault/VaultTimeline.tsx');
  ok(/\[PRIVATE\]/.test(src),
    'VaultTimeline must include the [PRIVATE] marker on Vault-sourced rows');
  ok(/listTimeline/.test(src), 'VaultTimeline must call listTimeline');
  ok(/next_cursor/.test(src), 'VaultTimeline must support cursor pagination');
});

// ---------- 7. No new server endpoints ----------

test('PR-V2-E does not introduce any new /api/vault/* routes', () => {
  const routes = read('src/server/vault/routes.js');
  // Snapshot of the exact route paths that should exist on main BEFORE
  // PR-V2-E ships. PR-V2-E is a UI-only PR; no additions allowed.
  const EXPECTED_ROUTES = new Set([
    "'/api/vault/auth/login'",
    "'/api/vault/auth/logout'",
    "'/api/vault/me'",
    "'/api/vault/workspaces'",
    "'/api/vault/workspaces/:slug'",
    "'/api/vault/workspaces/:slug/exceptions'",
    "'/api/vault/workspaces/:slug/exceptions/:id'",
    "'/api/vault/workspaces/:slug/exceptions/:id/approve'",
    "'/api/vault/workspaces/:slug/exceptions/:id/reject'",
    "'/api/vault/workspaces/:slug/exceptions/:id/revoke'",
    "'/api/vault/workspaces/:slug/exceptions/:id/extend'",
    "'/api/vault/workspaces/:slug/evidence/:id'",
    "'/api/vault/workspaces/:slug/timeline'",
    "'/api/vault/workspaces/:slug/timeline/:id'",
    "'/api/vault/cli/device-code'",
    "'/api/vault/cli/device-token'",
    "'/api/vault/cli/approve'",
  ]);
  const re = /'\/api\/vault\/[^']+'/g;
  let m;
  while ((m = re.exec(routes)) !== null) {
    ok(EXPECTED_ROUTES.has(m[0]),
      `${m[0]} is not in the PR-V2-D snapshot — PR-V2-E must NOT add new server routes`);
  }
});

// ---------- 8. CLI behavior preserved ----------

test('packages/cli is unchanged by PR-V2-E (dashboard does not touch CLI)', () => {
  // The PR-V2-E commit must not modify packages/cli/. We assert this by
  // checking that NO dashboard file imports the CLI package and that the
  // CLI sources still pass test:cli-v0 + test:cli-workspace-v0 (those
  // suites run separately; here we just structurally verify no cross-
  // imports).
  for (const rel of VAULT_DASHBOARD_FILES) {
    const src = read(rel);
    ok(!/from\s+['"][^'"]*packages\/cli/i.test(src),
      `${rel} must not import packages/cli/* (CLI surface stays atomic)`);
  }
});

// ---------- 9. Public spine behavior preserved ----------

test('Vault Dashboard files do not import public-spine pages or shared data', () => {
  const FORBIDDEN_PREFIXES = [
    '../pages/Home',
    '../pages/Proof',
    '../pages/TrustTimeline',
    '../pages/RepoTrustDashboard',
    '../pages/OpenSourceTrustCenter',
    '../components/Layout',
    '../../components/Layout',
    '../shared/trustTimeline',
    '../shared/repoTrustDashboard',
    '../shared/openSourceTrustCenter',
    '../../shared/trustTimeline',
    '../../shared/repoTrustDashboard',
    '../../shared/openSourceTrustCenter',
    '../server/badge',
    '../../server/badge',
  ];
  for (const rel of VAULT_DASHBOARD_FILES) {
    const src = read(rel);
    const imports = src.match(/from\s+['"]([^'"]+)['"]/g) || [];
    for (const imp of imports) {
      const m = imp.match(/from\s+['"]([^'"]+)['"]/);
      if (!m) continue;
      const spec = m[1];
      for (const banned of FORBIDDEN_PREFIXES) {
        ok(!spec.startsWith(banned),
          `${rel} imports ${spec} (banned public-spine prefix: ${banned})`);
      }
    }
  }
});

test('Public-spine pages do not import vault dashboard files', () => {
  // Walk every src/pages and src/components file that is NOT one of the
  // dashboard-allowed files and assert no import references the dashboard
  // tree, the /cli-auth page, or the api-client.
  const DASH_TARGETS = [
    '/CliAuth',
    '/vault/Vault',
    '/components/VaultLayout',
    '/shared/vault/api-client',
  ];
  const isDashboard = (rel) => VAULT_DASHBOARD_FILES.includes(rel);
  const walkSrc = (dir) => {
    const out = [];
    const stack = [path.join(root, dir)];
    while (stack.length > 0) {
      const cur = stack.pop();
      if (!fs.existsSync(cur)) continue;
      const st = fs.statSync(cur);
      if (st.isDirectory()) {
        for (const child of fs.readdirSync(cur)) stack.push(path.join(cur, child));
      } else if (st.isFile() && /\.(tsx?|jsx?|mjs)$/.test(cur)) {
        out.push(cur);
      }
    }
    return out;
  };
  const candidates = [
    ...walkSrc('src/pages'),
    ...walkSrc('src/components'),
    ...walkSrc('src/shared'),
  ];
  for (const f of candidates) {
    const rel = f.slice(root.length + 1).replace(/\\/g, '/');
    if (isDashboard(rel)) continue;
    if (rel.startsWith('src/shared/vault/')) continue;
    // App.tsx wires the routes — that's the one allowed cross-reference.
    if (rel === 'src/App.tsx') continue;
    const src = fs.readFileSync(f, 'utf8');
    for (const target of DASH_TARGETS) {
      const re = new RegExp(`from\\s+['"][^'"]*${target.replace(/\//g, '\\/')}`);
      if (re.test(src)) {
        throw new Error(`${rel} imports vault-dashboard target ${target}`);
      }
    }
  }
});

// ---------- API client + CSRF ----------

test('api-client.ts is the single source of CSRF header injection', () => {
  const src = read('src/shared/vault/api-client.ts');
  ok(/X-OpenSoyce-Vault-CSRF/.test(src),
    'api-client must set X-OpenSoyce-Vault-CSRF on mutating requests');
  ok(/opensoyce_vault_csrf/.test(src),
    'api-client must read the opensoyce_vault_csrf cookie');
  ok(/credentials:\s*['"]include['"]/.test(src),
    'api-client must use credentials: "include" so the Vault session cookie is attached');
});

test('Vault dashboard pages do NOT set the CSRF header themselves', () => {
  // Pages must delegate transport to api-client; setting CSRF anywhere else
  // creates two sources of truth and a leak risk.
  const pages = VAULT_DASHBOARD_FILES.filter((p) => p !== 'src/shared/vault/api-client.ts');
  for (const rel of pages) {
    const src = read(rel);
    ok(!/X-OpenSoyce-Vault-CSRF/.test(src),
      `${rel} sets the CSRF header directly — that must live in api-client.ts`);
  }
});

test('No vault dashboard file contains a literal "private-anchor" string', () => {
  // PR-V1-E §8: public-spine never emits private-anchor; the dashboard
  // renders private-anchors that come from the server (already shaped),
  // it does not synthesize the proofType literal client-side.
  for (const rel of VAULT_DASHBOARD_FILES) {
    const src = read(rel);
    ok(!/['"]private-anchor['"]/.test(src),
      `${rel} contains literal "private-anchor" (must not be synthesized client-side)`);
  }
});

// ---------- Reviewer-action wiring (uses existing endpoints) ----------

test('VaultExceptionDetail wires approve / reject / extend / revoke via the api-client', () => {
  const src = read('src/pages/vault/VaultExceptionDetail.tsx');
  ok(/approveException/.test(src), 'must import approveException');
  ok(/rejectException/.test(src), 'must import rejectException');
  ok(/extendException/.test(src), 'must import extendException');
  ok(/revokeExceptionApi/.test(src), 'must import revokeExceptionApi');
  // Role gating: only reviewer/owner sees the buttons.
  ok(/role === 'reviewer'\s*\|\|\s*role === 'owner'/.test(src),
    'reviewer actions must be role-gated to reviewer/owner');
});

// ---------- Wiring ----------

test('package.json wires test:vault-dashboard-v0 into test:ci', () => {
  const pkg = JSON.parse(read('package.json'));
  ok(pkg.scripts['test:vault-dashboard-v0'],
    'package.json must define test:vault-dashboard-v0');
  ok(/test-vault-dashboard-v0\.mjs/.test(pkg.scripts['test:ci'] || ''),
    'test:ci must chain scripts/test-vault-dashboard-v0.mjs');
});

(async () => {
  for (const fn of pending) await fn();
  console.log(`\nVault dashboard v0 tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
