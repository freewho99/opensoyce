#!/usr/bin/env node
/**
 * runScan extraction regression net.
 *
 * Covers:
 *   1. Shape parity vs. the old /api/scan response.
 *   2. Inventory build failure isolation.
 *   3. OSV unavailable → osvError, scan still returns.
 *   4. Per-vuln getAnalysis failure isolation.
 *   5. selectAndScoreHealth crash → selectedHealthError isolation.
 *   6. CLI exit-code mapping for --fail-on.
 *
 * No network. Everything is stubbed via deps.fetchImpl (OSV) and
 * deps.getAnalysis (GitHub).
 */

import { runScan, mapWithConcurrency } from '../src/shared/runScan.js';
import { exitCodeForFailOn } from './opensoyce-scan-report.mjs';
import * as scanLockfile from '../src/shared/scanLockfile.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { console.log(`PASS  ${name}`); passed += 1; })
    .catch(e => { console.log(`FAIL  ${name} -- ${e.message}`); failed += 1; });
}

function ok(c, msg) { if (!c) throw new Error(msg); }
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// ---------------------------------------------------------------------------
// Fixture: small npm v3 lockfile. Two deps, one we'll mark as "vulnerable"
// via the OSV stub, plus one transitive that stays clean.
// ---------------------------------------------------------------------------
const TINY_LOCK = JSON.stringify({
  name: 'demo',
  lockfileVersion: 3,
  requires: true,
  packages: {
    '': { name: 'demo', version: '1.0.0' },
    'node_modules/badpkg': { version: '1.2.3', license: 'MIT' },
    'node_modules/goodpkg': { version: '2.0.0', license: 'MIT' },
  },
});

/**
 * Stub fetchImpl that mimics OSV's two-step protocol (batch then vuln-details).
 * `vulnerableNames` is the set of pkg names we mark as vulnerable. Each gets
 * a single fake CVE with severity 'high' and a fixedIn.
 */
function osvFetchStub(vulnerableNames, { failBatch = false } = {}) {
  return async function fetchImpl(url, init) {
    if (failBatch && url.includes('querybatch')) {
      throw new Error('OSV down');
    }
    if (url.includes('querybatch')) {
      const body = JSON.parse(init.body);
      const results = body.queries.map(q => {
        if (vulnerableNames.has(q.package.name)) {
          return { vulns: [{ id: `FAKE-${q.package.name}` }] };
        }
        return {};
      });
      return {
        ok: true,
        status: 200,
        json: async () => ({ results }),
      };
    }
    // /v1/vulns/<id> hydrate
    const idMatch = url.match(/\/v1\/vulns\/(.+)$/);
    if (idMatch) {
      const id = decodeURIComponent(idMatch[1]);
      const pkg = id.replace(/^FAKE-/, '');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id,
          summary: `Fake advisory for ${pkg}`,
          severity: [{ type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H' }],
          affected: [{
            package: { ecosystem: 'npm', name: pkg },
            ranges: [{ events: [{ fixed: '9.9.9' }] }],
          }],
        }),
      };
    }
    throw new Error(`stub fetch: unhandled url ${url}`);
  };
}

/**
 * Stub resolveIdentity. Marks a fixed slug for every package.
 * Pass `{ name: null }` to force NONE.
 */
function makeResolveIdentity(overrides = {}) {
  return async function resolveIdentity(name, opts) {
    void opts;
    if (Object.prototype.hasOwnProperty.call(overrides, name)) {
      const v = overrides[name];
      if (v === null) return { dependency: name, resolvedRepo: null, confidence: 'NONE', source: null };
      return { dependency: name, resolvedRepo: v, confidence: 'HIGH', source: 'npm.repository' };
    }
    return { dependency: name, resolvedRepo: `acme/${name}`, confidence: 'HIGH', source: 'npm.repository' };
  };
}

/** Healthy analysis shape (verdict band STABLE). */
function healthyAnalysis() {
  return {
    total: 7.0,
    breakdown: { maintenance: 2, security: 1.5, activity: 0.5, community: 2, documentation: 1 },
    meta: {},
    repo: { id: 1, name: 'x', owner: 'acme', description: '' },
  };
}

// Reset OSV caches between tests so an earlier vulnerable→fixed result for a
// pkg name doesn't bleed into a "not vulnerable" run.
function resetCaches() {
  scanLockfile.__internal.defaultCache.clear();
  scanLockfile.__internal.vulnDetailCache.clear();
}

// ---------------------------------------------------------------------------
// 1. Shape parity
// ---------------------------------------------------------------------------
await test('shape parity: response has every field /api/scan emits', async () => {
  resetCaches();
  const result = await runScan({
    lockfileText: TINY_LOCK,
    deps: {
      getAnalysis: async () => healthyAnalysis(),
      resolveIdentity: makeResolveIdentity(),
      mapWithConcurrency,
      fetchImpl: osvFetchStub(new Set(['badpkg'])),
    },
  });
  ok(typeof result.totalDeps === 'number', 'totalDeps');
  ok(typeof result.directDeps === 'number', 'directDeps');
  ok(Array.isArray(result.vulnerabilities), 'vulnerabilities is array');
  ok(typeof result.scannedAt === 'string', 'scannedAt');
  eq(result.cacheHit, false, 'cacheHit');
  ok(result.inventory && Array.isArray(result.inventory.packages), 'inventory.packages');
  ok(result.selectedHealth && Array.isArray(result.selectedHealth.scored), 'selectedHealth.scored');
  eq(result.vulnerabilities.length, 1, 'one vuln (badpkg)');
  eq(result.vulnerabilities[0].package, 'badpkg', 'vuln pkg name');
  eq(result.vulnerabilities[0].repoHealth.verdict, 'FORKABLE', 'repoHealth attached');
  ok(!('inventoryError' in result), 'no inventoryError on happy path');
  ok(!('selectedHealthError' in result), 'no selectedHealthError on happy path');
  ok(!('osvError' in result), 'no osvError on happy path');
});

// ---------------------------------------------------------------------------
// 2. Inventory failure isolation
// ---------------------------------------------------------------------------
await test('inventory failure isolated: inventoryError set, scan returns', async () => {
  resetCaches();
  // buildInventory is intentionally defensive — it catches its own
  // JSON.parse errors and returns an empty inventory rather than throwing.
  // To prove the runScan-level try/catch works, we need a *thrown* error
  // that escapes buildInventory. The cleanest way: monkey-patch
  // Object.entries (which buildInventory uses to iterate packages.packages)
  // to throw when called with our marker-bearing object.
  // We need the crash to fire inside buildInventory, NOT inside
  // parseNpmLockfile (both iterate the packages map). The trick: after
  // parseNpmLockfile runs, every entry whose key is `node_modules/x-crash-canary`
  // has been parsed and walked. buildInventory then re-parses the same text
  // and walks AGAIN. We use a call counter on Object.entries scoped to the
  // canary-shaped object — the FIRST iteration (parseNpmLockfile) survives,
  // the SECOND (buildInventory) throws.
  const realEntries = Object.entries;
  let canaryIterations = 0;
  Object.entries = function patched(obj) {
    if (obj && typeof obj === 'object' && !Array.isArray(obj)
        && Object.prototype.hasOwnProperty.call(obj, 'node_modules/x-crash-canary')) {
      canaryIterations += 1;
      if (canaryIterations >= 2) {
        throw new Error('synthetic Object.entries crash inside buildInventory');
      }
    }
    return realEntries.call(Object, obj);
  };
  try {
    const lock = JSON.stringify({
      name: 'demo',
      lockfileVersion: 3,
      requires: true,
      packages: {
        '': { name: 'demo', version: '1.0.0' },
        // Canary key that the monkey-patch hooks on; using a node_modules
        // prefix keeps it parser-valid.
        'node_modules/x-crash-canary': { version: '1.0.0' },
      },
    });
    const result = await runScan({
      lockfileText: lock,
      deps: {
        getAnalysis: async () => healthyAnalysis(),
        resolveIdentity: makeResolveIdentity(),
        mapWithConcurrency,
        fetchImpl: osvFetchStub(new Set()),
      },
    });
    eq(result.inventory, null, 'inventory is null');
    eq(result.inventoryError, 'INVENTORY_FAILED', 'inventoryError set');
    ok(Array.isArray(result.vulnerabilities), 'scan still returned vulnerabilities array');
  } finally {
    Object.entries = realEntries;
  }
});

// ---------------------------------------------------------------------------
// 3. OSV unavailable
// ---------------------------------------------------------------------------
await test('OSV unavailable: osvError true, vulnerabilities empty, scan returns', async () => {
  resetCaches();
  const result = await runScan({
    lockfileText: TINY_LOCK,
    deps: {
      getAnalysis: async () => healthyAnalysis(),
      resolveIdentity: makeResolveIdentity(),
      mapWithConcurrency,
      fetchImpl: osvFetchStub(new Set(['badpkg']), { failBatch: true }),
    },
  });
  eq(result.osvError, true, 'osvError set');
  eq(result.vulnerabilities.length, 0, 'no vulnerabilities');
  ok(result.inventory, 'inventory still built');
});

// ---------------------------------------------------------------------------
// 4. Per-vuln getAnalysis failure isolation
// ---------------------------------------------------------------------------
await test('getAnalysis fails for one vuln: other vulns still complete', async () => {
  resetCaches();
  // Two vulnerable packages: badpkg (analysis crashes) and otherbad (succeeds).
  const lock = JSON.stringify({
    name: 'demo',
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': { name: 'demo', version: '1.0.0' },
      'node_modules/badpkg': { version: '1.0.0' },
      'node_modules/otherbad': { version: '2.0.0' },
    },
  });
  let calls = 0;
  const getAnalysis = async (owner, repo) => {
    calls += 1;
    if (repo === 'badpkg') throw new Error('boom');
    return healthyAnalysis();
  };
  const result = await runScan({
    lockfileText: lock,
    deps: {
      getAnalysis,
      resolveIdentity: makeResolveIdentity(),
      mapWithConcurrency,
      fetchImpl: osvFetchStub(new Set(['badpkg', 'otherbad'])),
    },
  });
  ok(calls >= 2, 'getAnalysis attempted for both vulns');
  const bad = result.vulnerabilities.find(v => v.package === 'badpkg');
  const other = result.vulnerabilities.find(v => v.package === 'otherbad');
  ok(bad, 'badpkg present');
  ok(other, 'otherbad present');
  eq(bad.repoHealthError, 'ANALYSIS_FAILED', 'badpkg flagged as ANALYSIS_FAILED');
  eq(bad.repoHealth, null, 'badpkg has no repoHealth');
  eq(other.repoHealthError, null, 'otherbad has no error');
  ok(other.repoHealth && typeof other.repoHealth.soyceScore === 'number', 'otherbad has score');
});

// ---------------------------------------------------------------------------
// 5. selectedHealth failure isolated
// ---------------------------------------------------------------------------
await test('selectedHealth crash isolated: selectedHealthError set, vulns still present', async () => {
  resetCaches();
  // Force the selectedHealth block to throw by making resolveIdentity throw
  // synchronously inside the v3b worker pool. The repo-health step uses the
  // same resolveIdentity earlier — but it goes through resolveIdentity in
  // attachIdentitiesToVulnerabilities (Promise.allSettled) which catches.
  // The v3b worker, however, calls resolveIdentity inside mapWithConcurrency
  // and depends on it succeeding for non-vulnerable picks. We make it throw
  // ONLY for the goodpkg selection so vulns are unaffected.
  //
  // To force the WHOLE block to fail (not per-row), throw from the
  // selectHealthCandidates path instead — but that's pure. So we make
  // mapWithConcurrency itself throw on the second invocation: the first
  // invocation (vuln repo health) succeeds; the second (selected health)
  // throws.
  let mapCalls = 0;
  const flakyMap = async (items, limit, fn) => {
    mapCalls += 1;
    if (mapCalls === 2) throw new Error('boom selected health');
    return mapWithConcurrency(items, limit, fn);
  };
  const result = await runScan({
    lockfileText: TINY_LOCK,
    deps: {
      getAnalysis: async () => healthyAnalysis(),
      resolveIdentity: makeResolveIdentity(),
      mapWithConcurrency: flakyMap,
      fetchImpl: osvFetchStub(new Set(['badpkg'])),
    },
  });
  eq(result.selectedHealth, null, 'selectedHealth null');
  eq(result.selectedHealthError, 'SELECTED_HEALTH_FAILED', 'selectedHealthError set');
  // Vuln data still attached.
  eq(result.vulnerabilities.length, 1, 'vulnerability still in payload');
  eq(result.vulnerabilities[0].package, 'badpkg', 'badpkg vulnerability preserved');
});

// ---------------------------------------------------------------------------
// 6. CLI exit-code mapping for --fail-on
// ---------------------------------------------------------------------------
await test('exitCodeForFailOn: all four levels behave correctly', async () => {
  const cleanScan = {
    summary: { label: 'CLEAN' },
    vulnerabilities: [],
  };
  const reviewScan = {
    summary: { label: 'REVIEW_REQUIRED' },
    vulnerabilities: [
      { package: 'a', severity: 'high' },
      { package: 'b', severity: 'medium' },
    ],
  };
  // none → 0 for both
  eq(exitCodeForFailOn(cleanScan, 'none'), 0, 'none-clean');
  eq(exitCodeForFailOn(reviewScan, 'none'), 0, 'none-review');
  // review-required
  eq(exitCodeForFailOn(cleanScan, 'review-required'), 0, 'review-required-clean');
  eq(exitCodeForFailOn(reviewScan, 'review-required'), 1, 'review-required-trips');
  // high-vuln
  eq(exitCodeForFailOn(cleanScan, 'high-vuln'), 0, 'high-vuln-clean');
  eq(exitCodeForFailOn(reviewScan, 'high-vuln'), 1, 'high-vuln-trips on high');
  // critical-vuln (review fixture has no CRITICAL, only HIGH+MEDIUM)
  eq(exitCodeForFailOn(reviewScan, 'critical-vuln'), 0, 'critical-vuln does not trip on HIGH');
  const critScan = {
    summary: { label: 'REVIEW_REQUIRED' },
    vulnerabilities: [{ package: 'c', severity: 'critical' }],
  };
  eq(exitCodeForFailOn(critScan, 'critical-vuln'), 1, 'critical-vuln trips on CRITICAL');
});

// ---------------------------------------------------------------------------
// 7. Python (uv.lock) end-to-end: ecosystem flows to OSV + resolver dispatch
// ---------------------------------------------------------------------------
await test('uv.lock end-to-end: PyPI ecosystem flows through OSV + resolver', async () => {
  resetCaches();
  // A tiny uv.lock with one vulnerable package (langchain@0.0.300 — real-
  // world advisory).
  const UV_LOCK = `
version = 1
requires-python = ">=3.10"

[[manifest.dependency]]
name = "langchain"

[[package]]
name = "langchain"
version = "0.0.300"
source = { registry = "https://pypi.org/simple" }
`.trimStart();

  let osvEcosystemSeen = null;
  let resolverEcosystemSeen = null;
  const osvFetch = async (url, init) => {
    if (url.includes('querybatch')) {
      const body = JSON.parse(init.body);
      // Capture the ecosystem the runScan pipeline forwarded.
      osvEcosystemSeen = body.queries[0]?.package?.ecosystem;
      return {
        ok: true,
        status: 200,
        json: async () => ({ results: body.queries.map(q => ({ vulns: [{ id: `FAKE-${q.package.name}` }] })) }),
      };
    }
    const idMatch = url.match(/\/v1\/vulns\/(.+)$/);
    if (idMatch) {
      const id = decodeURIComponent(idMatch[1]);
      const pkg = id.replace(/^FAKE-/, '');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id,
          summary: `Fake PyPI advisory for ${pkg}`,
          severity: [{ type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H' }],
          affected: [{
            package: { ecosystem: 'PyPI', name: pkg },
            ranges: [{ events: [{ fixed: '0.1.0' }] }],
          }],
        }),
      };
    }
    throw new Error(`stub fetch unhandled: ${url}`);
  };

  const resolveIdentity = async (name, opts) => {
    resolverEcosystemSeen = opts && opts.ecosystem;
    if (name === 'langchain') {
      return {
        dependency: name, resolvedRepo: 'langchain-ai/langchain',
        confidence: 'HIGH', source: 'pypi.project_urls.repository', verified: true,
      };
    }
    return { dependency: name, resolvedRepo: null, confidence: 'NONE', source: null };
  };

  const result = await runScan({
    lockfileText: UV_LOCK,
    filename: 'uv.lock',
    deps: {
      getAnalysis: async () => healthyAnalysis(),
      resolveIdentity,
      mapWithConcurrency,
      fetchImpl: osvFetch,
    },
  });

  eq(result.ecosystem, 'PyPI', 'top-level ecosystem');
  eq(osvEcosystemSeen, 'PyPI', 'OSV query ecosystem');
  eq(resolverEcosystemSeen, 'PyPI', 'resolver got ecosystem in opts');
  eq(result.vulnerabilities.length, 1, 'one vuln (langchain)');
  eq(result.vulnerabilities[0].package, 'langchain', 'pkg name');
  eq(result.vulnerabilities[0].version, '0.0.300', 'pkg version');
  eq(result.vulnerabilities[0].resolvedRepo, 'langchain-ai/langchain', 'resolved repo');
  ok(result.vulnerabilities[0].repoHealth && typeof result.vulnerabilities[0].repoHealth.soyceScore === 'number',
    'repoHealth attached');
  // Inventory carries PyPI ecosystem so downstream renderers can label it.
  ok(result.inventory, 'inventory built');
  eq(result.inventory.ecosystem, 'PyPI', 'inventory.ecosystem');
  eq(result.inventory.format, 'uv-lock', 'inventory.format');
});

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
