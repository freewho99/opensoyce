#!/usr/bin/env node
/**
 * PR-INTEGRITY-1 — production release integrity guard.
 *
 * One day (2026-06-10) surfaced three production integrity gaps that local
 * structural tests could not see:
 *   1. SCHEMA   — migrations 0005-0021 were merged but never applied.
 *   2. RUNTIME  — the /api/vault/* route family was registered only in
 *                 server.ts and never deployed (platform NOT_FOUND).
 *   3. CONFIG   — the GitHub OAuth app's callback URL covered only the
 *                 dashboard flow; vault AND claim flows failed validation.
 * Plus the deployment-plan constraint discovered the hard way: the Vercel
 * Hobby plan rejects builds with more than 12 serverless functions.
 *
 * DOCTRINE:
 *   A migration merged is not a migration applied.
 *   A route registered locally is not a route deployed.
 *   A secret present is not a provider configured.
 *   A passing build is not production proof.
 *
 * This guard FAILS BEFORE PRODUCTION SILENTLY LIES. Run it as the release
 * gate, after deploy:
 *
 *   node scripts/check-release-integrity.mjs                  # layers 0,2,3
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/check-release-integrity.mjs --strict         # all layers
 *
 * Flags:
 *   --api-base <url>   live target (default https://www.opensoyce.com)
 *   --strict           a SKIPPED layer is a FAILURE (release-gate mode)
 *
 * READ-ONLY BY CONSTRUCTION: every live probe is an unauthenticated request
 * that the server rejects before any write (401) or a metadata HEAD-count
 * query. The guard never inserts, updates, deletes, or calls a writing RPC.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const baseIdx = args.indexOf('--api-base');
const API_BASE = (baseIdx !== -1 && args[baseIdx + 1])
  ? args[baseIdx + 1].replace(/\/+$/, '')
  : 'https://www.opensoyce.com';

let failed = 0;
let skipped = 0;
const pass = (layer, msg) => console.log(`PASS  [${layer}] ${msg}`);
const fail = (layer, msg) => { failed += 1; console.log(`FAIL  [${layer}] ${msg}`); };
const skip = (layer, msg) => {
  skipped += 1;
  console.log(`${strict ? 'FAIL' : 'SKIP'}  [${layer}] ${msg}`);
  if (strict) failed += 1;
};

const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

// ---------------------------------------------------------------------------
// LAYER 0 — STATIC: deployment-shape invariants provable from the repo
// ---------------------------------------------------------------------------

function layer0Static() {
  // 0a. Vercel Hobby function cap.
  const fns = fs.readdirSync(path.join(root, 'api'))
    .filter((n) => n.endsWith('.js') && !n.startsWith('_'));
  if (fns.length <= 12) pass('static', `serverless function count ${fns.length}/12`);
  else fail('static', `api/ has ${fns.length} functions — Hobby cap is 12 (${fns.join(', ')})`);

  // 0b. Vault route family has a production surface.
  const vaultFn = fs.existsSync(path.join(root, 'api', 'vault.js'));
  const cfg = JSON.parse(read('vercel.json'));
  const rewrite = (cfg.rewrites || []).some((r) => r.source === '/api/vault/:path*');
  if (vaultFn && rewrite) pass('static', 'vault route family has a deployed surface (api/vault.js + rewrite)');
  else fail('static', 'vault route family lacks a production surface (function or rewrite missing)');

  // 0c. Every registered vault/CEI route literal lives under the deployed prefix.
  const literals = [];
  for (const rel of ['src/server/vault/routes.js', 'src/server/cei/routes.js', 'src/server/vault/resolution-routes.js', 'src/server/vault/evidence-export-routes.js', 'src/server/vault/remediation-evidence-routes.js', 'src/server/vault/evidence-rollup-routes.js', 'src/server/vault/trust-record-routes.js', 'src/server/vault/evidence-verification-routes.js']) {
    for (const m of read(rel).matchAll(/'(\/api\/[^']+)'/g)) literals.push(m[1]);
  }
  const outside = literals.filter((r) => !r.startsWith('/api/vault/'));
  if (literals.length >= 20 && outside.length === 0) {
    pass('static', `${literals.length} registered route literals all under /api/vault/`);
  } else {
    fail('static', `route literals outside the deployed prefix: ${outside.join(', ') || '(family too small — registrar moved?)'}`);
  }

  // 0d. Migration sequence has no duplicate numbers (apply-order ambiguity).
  const nums = fs.readdirSync(path.join(root, 'supabase', 'migrations'))
    .filter((n) => /^\d{4}_/.test(n)).map((n) => n.slice(0, 4));
  const dupes = nums.filter((n, i) => nums.indexOf(n) !== i);
  if (dupes.length === 0) pass('static', `migration sequence clean (${nums.length} files, latest ${nums[nums.length - 1]})`);
  else fail('static', `duplicate migration numbers: ${[...new Set(dupes)].join(', ')}`);
}

// ---------------------------------------------------------------------------
// LAYER 1 — SCHEMA: required objects exist where the code runs
// (requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for the TARGET env)
// ---------------------------------------------------------------------------

const REQUIRED_TABLES = [
  'vault_users', 'vault_workspaces', 'vault_workspace_memberships',
  'vault_sessions', 'vault_evidence', 'vault_exceptions',
  'vault_timeline_events', 'vault_idempotency_keys', 'vault_device_codes',
  'component_exposure_types', 'component_exposures', 'component_exposure_events',
  'component_exposure_vulnerabilities', 'component_remediation_questions',
  'vault_exception_resolutions', 'component_remediation_evidence',
  'vault_api_tokens', 'vault_webhook_subscriptions', 'vault_webhook_deliveries',
  'evidence_verification_checks',
];

async function layer1Schema() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    skip('schema', 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — schema presence NOT VERIFIED against the target environment');
    return;
  }
  // Target coherence: refuse to "verify" the schema of a DIFFERENT
  // environment than the live target. A local-stack .env paired with a
  // production --api-base would make the guard itself lie.
  const dbIsLocal = /localhost|127\.0\.0\.1/.test(url);
  const targetIsLocal = /localhost|127\.0\.0\.1/.test(API_BASE);
  if (dbIsLocal !== targetIsLocal) {
    skip('schema', `SUPABASE_URL targets ${dbIsLocal ? 'a LOCAL stack' : 'a remote project'} while --api-base targets ${targetIsLocal ? 'local' : API_BASE} — refusing to verify schema against a different environment than the live target`);
    return;
  }
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  for (const table of REQUIRED_TABLES) {
    const { error } = await supabase.from(table).select('*', { count: 'exact', head: true }).limit(0);
    if (error) fail('schema', `table ${table}: ${error.message}`);
    else pass('schema', `table ${table} present`);
  }

  // 0021 dedupe columns must exist on component_exposures.
  const { error: colErr } = await supabase
    .from('component_exposures')
    .select('observation_identity, seen_count, latest_source_ref', { head: true })
    .limit(0);
  if (colErr) fail('schema', `0021 dedupe columns missing on component_exposures: ${colErr.message}`);
  else pass('schema', '0021 dedupe columns present (observation_identity, seen_count, latest_source_ref)');

  // The six native exposure types must be seeded.
  const { count, error: seedErr } = await supabase
    .from('component_exposure_types')
    .select('*', { count: 'exact', head: true })
    .eq('is_native', true);
  if (seedErr) fail('schema', `native type seed check failed: ${seedErr.message}`);
  else if (count === 6) pass('schema', 'native exposure-type catalog seeded (6/6)');
  else fail('schema', `native exposure-type catalog has ${count} rows, expected 6`);
}

// ---------------------------------------------------------------------------
// LAYER 2 — RUNTIME: deployed routes answer at the APP layer, not the platform
// ---------------------------------------------------------------------------

async function probe(pathname, init) {
  const res = await fetch(API_BASE + pathname, init);
  const text = await res.text();
  return { status: res.status, text };
}

function isPlatform404(r) {
  return r.status === 404 && /NOT_FOUND/.test(r.text) && !r.text.trim().startsWith('{');
}

async function layer2Runtime() {
  // 2a. Existing public function still alive.
  const cfg = await probe('/api/config');
  if (cfg.status === 200 && /githubOauthClientId/.test(cfg.text)) pass('runtime', '/api/config answers 200 with client id');
  else fail('runtime', `/api/config: ${cfg.status}`);

  // 2b-2d. Vault family must fail INSIDE the app (auth), never at the platform.
  const probes = [
    ['GET /api/vault/me', await probe('/api/vault/me')],
    ['GET /api/vault/workspaces/__guard__/exposures', await probe('/api/vault/workspaces/__guard__/exposures')],
    ['GET /api/vault/workspaces/__guard__/remediation-questions', await probe('/api/vault/workspaces/__guard__/remediation-questions')],
    ['GET /api/vault/workspaces/__guard__/exceptions/__guard__/resolutions', await probe('/api/vault/workspaces/__guard__/exceptions/__guard__/resolutions')],
    ['GET /api/vault/workspaces/__guard__/exposures/__guard__/evidence-export', await probe('/api/vault/workspaces/__guard__/exposures/__guard__/evidence-export')],
    ['GET /api/vault/workspaces/__guard__/exceptions/__guard__/remediation-evidence', await probe('/api/vault/workspaces/__guard__/exceptions/__guard__/remediation-evidence')],
    ['GET /api/vault/workspaces/__guard__/evidence-packet', await probe('/api/vault/workspaces/__guard__/evidence-packet')],
    ['GET /api/vault/workspaces/__guard__/trust-records', await probe('/api/vault/workspaces/__guard__/trust-records')],
    ['GET /api/vault/workspaces/__guard__/remediation-evidence/__guard__/verification-checks', await probe('/api/vault/workspaces/__guard__/remediation-evidence/__guard__/verification-checks')],
    ['POST /api/vault/workspaces (unauthenticated)', await probe('/api/vault/workspaces', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })],
  ];
  for (const [label, r] of probes) {
    if (isPlatform404(r)) {
      fail('runtime', `${label} died at the platform layer (NOT_FOUND) — the runtime is not deployed`);
    } else if (r.status === 401 && /auth-required/.test(r.text)) {
      pass('runtime', `${label} -> app-level 401`);
    } else {
      fail('runtime', `${label} -> unexpected ${r.status}: ${r.text.slice(0, 80)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// LAYER 3 — CONFIG: the OAuth provider actually accepts every flow's callback
// ---------------------------------------------------------------------------

async function layer3Config() {
  const cfgRes = await probe('/api/config');
  let clientId = '';
  try { clientId = JSON.parse(cfgRes.text).githubOauthClientId || ''; } catch { /* handled below */ }
  if (!clientId) {
    fail('config', '/api/config returned no githubOauthClientId — OAuth flows cannot start');
    return;
  }
  pass('config', `client id published via /api/config (${clientId.slice(0, 8)}...)`);

  // Every flow's redirect_uri must be accepted by the registered callback.
  // GitHub renders a distinctive error page for unregistered redirect_uris;
  // probing the authorize URL unauthenticated detects it without any login.
  const flows = [
    ['vault', `${API_BASE}/api/vault/auth/login`],
    ['claim', 'https://www.opensoyce.com/api/claim/callback'],
    ['dashboard', `${API_BASE}/dashboard`],
  ];
  for (const [flow, redirectUri] of flows) {
    const u = new URL('https://github.com/login/oauth/authorize');
    u.searchParams.set('client_id', clientId);
    u.searchParams.set('redirect_uri', redirectUri);
    u.searchParams.set('scope', 'read:user');
    const res = await fetch(u, { headers: { 'user-agent': 'opensoyce-release-integrity-guard' } });
    const text = await res.text();
    if (/redirect_uri is not associated/i.test(text)) {
      fail('config', `${flow} flow: GitHub rejects redirect_uri ${redirectUri} — OAuth app callback URL does not cover it`);
    } else {
      pass('config', `${flow} flow redirect_uri accepted by the OAuth app`);
    }
  }
}

// ---------------------------------------------------------------------------

(async () => {
  console.log(`release-integrity guard — target ${API_BASE}${strict ? ' (strict)' : ''}\n`);
  layer0Static();
  await layer1Schema();
  await layer2Runtime();
  await layer3Config();
  console.log(`\nrelease-integrity: ${failed === 0 ? 'PASS' : 'FAIL'}`
    + `${skipped ? ` (${skipped} layer check${skipped === 1 ? '' : 's'} skipped${strict ? ' -> counted as failures' : ' — NOT VERIFIED'})` : ''}`);
  process.exit(failed > 0 ? 1 : 0);
})();
