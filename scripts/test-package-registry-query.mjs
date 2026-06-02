#!/usr/bin/env node
/**
 * Unit tests for src/shared/packageRegistryQuery.js
 *
 * Covers:
 *   - Fresh snapshot hit
 *   - Stale snapshot serves with `snapshot-stale` source
 *   - Snapshot miss → live-query → write-back → `live` source
 *   - Live-query timeout returns `fallback` (when no snapshot)
 *   - Live-query timeout serves stale snapshot if available
 *   - Live-query fetcher throwing returns `fallback`
 *   - In-flight coalescing: N concurrent calls for same name share one fetch
 *   - Batch resolvePackages() composes correctly
 *   - cacheStatusFor() reads `hit` only when every result is `snapshot`
 *   - Per-verdict TTLs differ (risky stale faster than stable)
 */

import {
  resolvePackage,
  resolvePackages,
  cacheStatusFor,
  TTL_BY_VERDICT_MS,
  splitPackageVersion,
  __setLiveFetcherForTests,
  __setClockForTests,
  __resetInflightForTests,
} from '../src/shared/packageRegistryQuery.js';

let passed = 0;
let failed = 0;
const pending = [];

function test(name, fn) {
  pending.push(async () => {
    __resetInflightForTests();
    __setLiveFetcherForTests(null);
    __setClockForTests(null);
    try {
      await fn();
      console.log(`PASS  ${name}`);
      passed += 1;
    } catch (e) {
      console.log(`FAIL  ${name} -- ${e.message}\n${e.stack}`);
      failed += 1;
    }
  });
}

function ok(c, msg) {
  if (!c) throw new Error(msg || 'assertion failed');
}
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// Tiny in-memory Supabase mock that responds to the exact query chains the
// resolver uses (.from().select().eq().eq().maybeSingle() and the batch
// .from().select().in().eq() and .from().upsert()).
function makeMockSupabase(initialRows) {
  const rows = new Map();
  for (const r of initialRows || []) rows.set(r.package_name.toLowerCase(), { ...r });
  return {
    rows,
    from(table) {
      eq(table, 'package_registry', `unexpected table ${table}`);
      return {
        select() {
          return {
            // single-row path
            eq(_col1, val1) {
              return {
                eq(_col2, val2) {
                  return {
                    maybeSingle() {
                      const row = rows.get(String(val1).toLowerCase());
                      if (row && row.ecosystem === val2) {
                        return Promise.resolve({ data: { ...row }, error: null });
                      }
                      return Promise.resolve({ data: null, error: null });
                    },
                  };
                },
              };
            },
            // batch path
            in(_col, vals) {
              return {
                eq(_col2, val2) {
                  const out = [];
                  for (const v of vals) {
                    const row = rows.get(String(v).toLowerCase());
                    if (row && row.ecosystem === val2) out.push({ ...row });
                  }
                  return Promise.resolve({ data: out, error: null });
                },
              };
            },
          };
        },
        upsert(row) {
          rows.set(row.package_name.toLowerCase(), { ...row });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------

test('fresh snapshot row returns source=snapshot', async () => {
  const sb = makeMockSupabase([
    {
      package_name: 'lodash',
      ecosystem: 'npm',
      score: 6.1,
      license: 'MIT',
      verdict: 'watchlist',
      status: 'STALE',
      warn_message: 'SCORE DROP',
      description: null,
      critical: false,
      updated_at: new Date().toISOString(),
    },
  ]);

  const d = await resolvePackage(sb, 'lodash');
  eq(d.source, 'snapshot', 'source');
  eq(d.score, 6.1, 'score');
  eq(d.verdict, 'watchlist', 'verdict');
});

test('stale snapshot row returns source=snapshot-stale', async () => {
  // watchlist TTL is 7d — set the row to 30d old.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sb = makeMockSupabase([
    {
      package_name: 'mooseplate',
      ecosystem: 'npm',
      score: 5.0,
      license: 'MIT',
      verdict: 'watchlist',
      status: 'AGING',
      warn_message: null,
      description: null,
      critical: false,
      updated_at: thirtyDaysAgo,
    },
  ]);

  const d = await resolvePackage(sb, 'mooseplate');
  eq(d.source, 'snapshot-stale', 'source');
  eq(d.score, 5.0, 'score still served from stale');
});

test('snapshot miss + successful live-query returns source=live and writes back', async () => {
  const sb = makeMockSupabase([]);
  __setLiveFetcherForTests(async (name) => {
    eq(name, 'never-seen-pkg', 'fetcher arg');
    return {
      score: 9.1,
      license: 'Apache-2.0',
      verdict: 'stable',
      status: 'FRESH',
      warn_message: null,
      description: 'A fresh discovery',
      critical: false,
    };
  });

  const d = await resolvePackage(sb, 'never-seen-pkg');
  eq(d.source, 'live', 'source');
  eq(d.score, 9.1, 'score');
  eq(d.license, 'Apache-2.0', 'license');
  ok(sb.rows.has('never-seen-pkg'), 'write-back persisted row');
  eq(sb.rows.get('never-seen-pkg').score, 9.1, 'write-back row content');
});

test('live-query timeout with no snapshot returns source=fallback', async () => {
  const sb = makeMockSupabase([]);
  __setLiveFetcherForTests(async () => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return { score: 8.5, license: 'MIT', verdict: 'stable', status: 'FRESH' };
  });

  const d = await resolvePackage(sb, 'slow-pkg', { timeoutMs: 50 });
  eq(d.source, 'fallback', 'source');
  eq(d.score, 8.0, 'fallback default score');
  ok(!sb.rows.has('slow-pkg'), 'no write-back on timeout');
});

test('live-query fetcher throwing returns source=fallback', async () => {
  const sb = makeMockSupabase([]);
  __setLiveFetcherForTests(async () => {
    throw new Error('upstream is down');
  });

  const d = await resolvePackage(sb, 'angry-pkg');
  eq(d.source, 'fallback', 'source');
  eq(d.score, 8.0, 'fallback score');
});

test('in-flight coalescing: 5 concurrent calls share one fetch', async () => {
  const sb = makeMockSupabase([]);
  let fetchCount = 0;
  __setLiveFetcherForTests(async () => {
    fetchCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 30));
    return { score: 7.7, license: 'MIT', verdict: 'stable', status: 'FRESH' };
  });

  const all = await Promise.all([
    resolvePackage(sb, 'coalesce-target'),
    resolvePackage(sb, 'coalesce-target'),
    resolvePackage(sb, 'coalesce-target'),
    resolvePackage(sb, 'coalesce-target'),
    resolvePackage(sb, 'coalesce-target'),
  ]);

  eq(fetchCount, 1, 'fetcher called exactly once for 5 concurrent callers');
  for (const d of all) {
    eq(d.source, 'live', 'every caller got the live result');
    eq(d.score, 7.7, 'every caller got the same score');
  }
});

test('resolvePackages: batch composes snapshot + live + fallback correctly', async () => {
  const sb = makeMockSupabase([
    {
      package_name: 'react',
      ecosystem: 'npm',
      score: 10.0,
      license: 'MIT',
      verdict: 'stable',
      status: 'FRESH',
      warn_message: null,
      description: null,
      critical: false,
      updated_at: new Date().toISOString(), // fresh
    },
  ]);
  __setLiveFetcherForTests(async (name) => {
    if (name === 'webpack') {
      return { score: 8.5, license: 'MIT', verdict: 'stable', status: 'FRESH' };
    }
    return null; // simulates upstream "no GitHub repo" for unknown-pkg
  });

  const map = await resolvePackages(sb, ['react', 'webpack', 'unknown-pkg']);
  eq(map.get('react').source, 'snapshot', 'react = snapshot');
  eq(map.get('webpack').source, 'live', 'webpack = live');
  eq(map.get('unknown-pkg').source, 'fallback', 'unknown-pkg = fallback');
  eq(map.get('webpack').score, 8.5, 'webpack score from live');
  ok(sb.rows.has('webpack'), 'webpack was written back');
});

test('cacheStatusFor returns hit only when every entry is snapshot', async () => {
  const allSnapshot = new Map([
    ['a', { source: 'snapshot' }],
    ['b', { source: 'snapshot' }],
  ]);
  eq(cacheStatusFor(allSnapshot), 'hit', 'all snapshot → hit');

  const oneLive = new Map([
    ['a', { source: 'snapshot' }],
    ['b', { source: 'live' }],
  ]);
  eq(cacheStatusFor(oneLive), 'miss', 'one live → miss');

  const oneStale = new Map([
    ['a', { source: 'snapshot' }],
    ['b', { source: 'snapshot-stale' }],
  ]);
  eq(cacheStatusFor(oneStale), 'miss', 'one stale → miss (even if served)');

  const oneFallback = new Map([['a', { source: 'fallback' }]]);
  eq(cacheStatusFor(oneFallback), 'miss', 'one fallback → miss');
});

test('verdict-tiered TTL: risky stale at 2d but stable still fresh at 2d', async () => {
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const sb = makeMockSupabase([
    {
      package_name: 'old-risky',
      ecosystem: 'npm',
      score: 3.0,
      license: 'MIT',
      verdict: 'risky',
      status: 'STALE',
      warn_message: null,
      description: null,
      critical: false,
      updated_at: twoDaysAgo,
    },
    {
      package_name: 'old-stable',
      ecosystem: 'npm',
      score: 9.0,
      license: 'MIT',
      verdict: 'stable',
      status: 'FRESH',
      warn_message: null,
      description: null,
      critical: false,
      updated_at: twoDaysAgo,
    },
  ]);

  const risky = await resolvePackage(sb, 'old-risky');
  const stable = await resolvePackage(sb, 'old-stable');
  eq(risky.source, 'snapshot-stale', 'risky stale at 2d');
  eq(stable.source, 'snapshot', 'stable fresh at 2d');
});

test('TTL constants: risky < watchlist < stable (sanity)', () => {
  ok(TTL_BY_VERDICT_MS.risky < TTL_BY_VERDICT_MS.watchlist, 'risky < watchlist');
  ok(TTL_BY_VERDICT_MS.watchlist < TTL_BY_VERDICT_MS.stable, 'watchlist < stable');
  ok(TTL_BY_VERDICT_MS.graveyard === TTL_BY_VERDICT_MS.risky, 'graveyard and risky tied at fast tier');
  ok(TTL_BY_VERDICT_MS.stable === TTL_BY_VERDICT_MS.forkable, 'stable and forkable tied at slow tier');
});

test('empty input returns empty map', async () => {
  const sb = makeMockSupabase([]);
  const map = await resolvePackages(sb, []);
  eq(map.size, 0, 'empty input');
});

test('null / blank package names are filtered out', async () => {
  const sb = makeMockSupabase([]);
  __setLiveFetcherForTests(async () => null);
  const map = await resolvePackages(sb, [null, '', '  ', 'real-pkg']);
  eq(map.size, 1, 'only real-pkg survives');
  ok(map.has('real-pkg'), 'real-pkg in map');
});

// ---------------------------------------------------------------------------
// splitPackageVersion — canonical strip/split helper for @version inputs.
// Must match between cleanNames generation and per-dep loop lookups in
// api/exceptions.js handleComplianceGate, otherwise versioned inputs fall
// through to FALLBACK_DEFAULTS even when the maps have correct data.
// ---------------------------------------------------------------------------

test('splitPackageVersion: unscoped package with version', () => {
  const split = splitPackageVersion('lodash@4.17.20');
  eq(split.name, 'lodash', 'name stripped');
  eq(split.version, '4.17.20', 'version captured');
});

test('splitPackageVersion: unscoped package without version', () => {
  const split = splitPackageVersion('react');
  eq(split.name, 'react', 'name passes through');
  eq(split.version, '', 'no version');
});

test('splitPackageVersion: scoped package with version', () => {
  const split = splitPackageVersion('@types/react@18.2.0');
  eq(split.name, '@types/react', 'scoped name preserved');
  eq(split.version, '18.2.0', 'version captured');
});

test('splitPackageVersion: scoped package without version', () => {
  const split = splitPackageVersion('@types/react');
  eq(split.name, '@types/react', 'scoped name passes through');
  eq(split.version, '', 'no version');
});

test('splitPackageVersion: ua-parser-js compromise version (the actual bug case)', () => {
  // This is the specific input that surfaced the production bug via the
  // /proof/gate UI on 2026-06-02. Pre-fix, the gate handler looked up
  // resolverMap.get('ua-parser-js@0.7.29') which returned undefined,
  // falling through to FALLBACK_DEFAULTS (score 8.0, MIT, stable, FRESH,
  // 0 patterns, ALLOW) even though resolverMap.get('ua-parser-js') had
  // the real data. The helper standardizes the strip; the per-dep loop
  // must call it to derive the lookup key.
  const split = splitPackageVersion('ua-parser-js@0.7.29');
  eq(split.name, 'ua-parser-js', 'name stripped to bare');
  eq(split.version, '0.7.29', 'version preserved for pattern row');
});

test('splitPackageVersion: empty / null / undefined inputs return empty strings safely', () => {
  eq(splitPackageVersion('').name, '', 'empty in → empty out');
  eq(splitPackageVersion('').version, '', 'empty in → no version');
  eq(splitPackageVersion(null).name, '', 'null in → empty out');
  eq(splitPackageVersion(undefined).name, '', 'undefined in → empty out');
});

(async () => {
  for (const fn of pending) await fn();
  console.log(`\nPackage Registry Query tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
