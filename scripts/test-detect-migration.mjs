#!/usr/bin/env node
/**
 * Fork-velocity-of-namesake v0 — detectMigration tests.
 *
 * Stubs fetchForks via deps injection. PASS/FAIL per case, non-zero exit on
 * any failure.
 */
import { detectMigration, __internal } from '../src/shared/detectMigration.js';

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`PASS  ${name}`); passed += 1; }
  catch (e) { console.log(`FAIL  ${name} -- ${e.message}`); failed += 1; }
}
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function jsonEq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  }
}

// Helper: a recent ISO date (n days ago).
function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

// Run each test with a fresh cache so cache state never leaks.
function freshDeps(fetchForks, now) {
  return { fetchForks, cache: new Map(), now: now || Date.now };
}

await test('1. Curated hit short-circuits — no fetchForks call', async () => {
  let calls = 0;
  const fetchForks = async () => { calls += 1; return []; };
  const result = await detectMigration({
    owner: 'xenova',
    repo: 'transformers',
    verdict: 'USE READY', // even with healthy verdict, curated still fires
    pushedAt: isoDaysAgo(5),
    stargazersCount: 9999,
    deps: freshDeps(fetchForks),
  });
  if (!result) throw new Error('expected curated result');
  eq(result.confidence, 'HIGH', 'curated confidence');
  eq(result.source, 'curated', 'source');
  if (!result.successor) throw new Error('expected successor');
  eq(result.successor.owner, 'huggingface', 'successor owner');
  eq(result.successor.repo, 'transformers.js', 'successor repo');
  eq(calls, 0, 'fetchForks must not be called for curated hits');
});

await test('2. Non-curated healthy repo → null, no fetchForks call', async () => {
  let calls = 0;
  const fetchForks = async () => { calls += 1; return []; };
  const result = await detectMigration({
    owner: 'someorg',
    repo: 'somerepo',
    verdict: 'USE READY',
    pushedAt: isoDaysAgo(5),
    stargazersCount: 1000,
    deps: freshDeps(fetchForks),
  });
  eq(result, null, 'healthy non-curated returns null');
  eq(calls, 0, 'fetchForks not called for healthy verdict');
});

await test('3. Non-curated low-band but recent → null', async () => {
  let calls = 0;
  const fetchForks = async () => { calls += 1; return []; };
  const result = await detectMigration({
    owner: 'someorg',
    repo: 'somerepo',
    verdict: 'WATCHLIST',
    pushedAt: isoDaysAgo(60),  // not yet dormant
    stargazersCount: 1000,
    deps: freshDeps(fetchForks),
  });
  eq(result, null, 'recent low-band returns null');
  eq(calls, 0, 'fetchForks not called when repo is not dormant');
});

await test('4. Non-curated low-band dormant + qualifying fork → MEDIUM/fork-chain', async () => {
  const fetchForks = async () => [
    {
      name: 'somerepo',
      owner: { login: 'newmaintainer' },
      pushed_at: isoDaysAgo(10),
      stargazers_count: 500, // 50% of 1000 = above threshold
    },
  ];
  const result = await detectMigration({
    owner: 'someorg',
    repo: 'somerepo',
    verdict: 'RISKY',
    pushedAt: isoDaysAgo(400),
    stargazersCount: 1000,
    deps: freshDeps(fetchForks),
  });
  if (!result) throw new Error('expected migration result');
  eq(result.confidence, 'MEDIUM', 'confidence');
  eq(result.source, 'fork-chain', 'source');
  jsonEq(result.successor, { owner: 'newmaintainer', repo: 'somerepo' }, 'successor');
});

await test('5. Fork too small (under 10% of stars) → null', async () => {
  const fetchForks = async () => [
    {
      name: 'somerepo',
      owner: { login: 'tinyfork' },
      pushed_at: isoDaysAgo(10),
      stargazers_count: 5, // 0.5% of 1000
    },
  ];
  const result = await detectMigration({
    owner: 'someorg',
    repo: 'somerepo',
    verdict: 'RISKY',
    pushedAt: isoDaysAgo(400),
    stargazersCount: 1000,
    deps: freshDeps(fetchForks),
  });
  eq(result, null, 'tiny fork must not qualify');
});

await test('6. Top fork too dormant → null', async () => {
  const fetchForks = async () => [
    {
      name: 'somerepo',
      owner: { login: 'oldfork' },
      pushed_at: isoDaysAgo(200), // 200 > 90 day threshold
      stargazers_count: 500,
    },
  ];
  const result = await detectMigration({
    owner: 'someorg',
    repo: 'somerepo',
    verdict: 'RISKY',
    pushedAt: isoDaysAgo(400),
    stargazersCount: 1000,
    deps: freshDeps(fetchForks),
  });
  eq(result, null, 'dormant fork must not qualify');
});

await test('7. fetchForks throws → null, no crash', async () => {
  const fetchForks = async () => { throw new Error('rate limit'); };
  const result = await detectMigration({
    owner: 'someorg',
    repo: 'somerepo',
    verdict: 'STALE',
    pushedAt: isoDaysAgo(400),
    stargazersCount: 1000,
    deps: freshDeps(fetchForks),
  });
  eq(result, null, 'thrown fetchForks returns null silently');
});

await test('8. Cache hit on second call — fetchForks NOT called again', async () => {
  let calls = 0;
  const fetchForks = async () => {
    calls += 1;
    return [{
      name: 'r', owner: { login: 'newer' },
      pushed_at: isoDaysAgo(10), stargazers_count: 500,
    }];
  };
  const deps = freshDeps(fetchForks);
  const args = {
    owner: 'someorg', repo: 'somerepo',
    verdict: 'RISKY', pushedAt: isoDaysAgo(400),
    stargazersCount: 1000, deps,
  };
  const a = await detectMigration(args);
  const b = await detectMigration(args);
  if (!a || !b) throw new Error('expected both calls to resolve');
  eq(calls, 1, 'cache must avoid the second fetchForks');
  jsonEq(a.successor, b.successor, 'cached result matches');
});

await test('9. Cache miss after TTL — fetchForks called again', async () => {
  let calls = 0;
  const fetchForks = async () => {
    calls += 1;
    return [{
      name: 'r', owner: { login: 'newer' },
      pushed_at: isoDaysAgo(10), stargazers_count: 500,
    }];
  };
  // Simulate clock advancement past CACHE_TTL_MS between calls.
  let nowVal = 1_000_000_000_000;
  const deps = { fetchForks, cache: new Map(), now: () => nowVal };
  const args = {
    owner: 'someorg', repo: 'somerepo',
    verdict: 'RISKY', pushedAt: new Date(nowVal - 400 * 86400000).toISOString(),
    stargazersCount: 1000, deps,
  };
  await detectMigration(args);
  // Advance clock past TTL.
  nowVal += __internal.CACHE_TTL_MS + 1;
  const args2 = {
    ...args,
    pushedAt: new Date(nowVal - 400 * 86400000).toISOString(),
  };
  await detectMigration(args2);
  eq(calls, 2, 'fetchForks should fire again after TTL expiry');
});

await test('10. Multiple forks — picks first qualifying match', async () => {
  const fetchForks = async () => [
    // First: too dormant
    { name: 'r', owner: { login: 'dead' },
      pushed_at: isoDaysAgo(300), stargazers_count: 500 },
    // Second: qualifies
    { name: 'r', owner: { login: 'alive' },
      pushed_at: isoDaysAgo(20), stargazers_count: 500 },
    // Third: also qualifies, but should not be picked
    { name: 'r', owner: { login: 'alsoalive' },
      pushed_at: isoDaysAgo(15), stargazers_count: 400 },
  ];
  const result = await detectMigration({
    owner: 'someorg', repo: 'somerepo',
    verdict: 'RISKY', pushedAt: isoDaysAgo(400),
    stargazersCount: 1000, deps: freshDeps(fetchForks),
  });
  if (!result) throw new Error('expected fork-chain hit');
  eq(result.successor.owner, 'alive', 'picks the first qualifying fork');
});

await test('11. pushedAt null → returns null (no crash)', async () => {
  let calls = 0;
  const fetchForks = async () => { calls += 1; return []; };
  const result = await detectMigration({
    owner: 'someorg', repo: 'somerepo',
    verdict: 'RISKY', pushedAt: null,
    stargazersCount: 1000, deps: freshDeps(fetchForks),
  });
  eq(result, null, 'null pushedAt returns null');
  eq(calls, 0, 'no fetch call when pushedAt missing');
});

await test('12. Empty forks array → null', async () => {
  const fetchForks = async () => [];
  const result = await detectMigration({
    owner: 'someorg', repo: 'somerepo',
    verdict: 'STALE', pushedAt: isoDaysAgo(400),
    stargazersCount: 1000, deps: freshDeps(fetchForks),
  });
  eq(result, null, 'empty forks → null');
});

await test('13. Curated to:null entry (deprecated without successor)', async () => {
  const result = await detectMigration({
    owner: 'request', repo: 'request',
    verdict: 'STALE', pushedAt: isoDaysAgo(2000),
    stargazersCount: 25000, deps: freshDeps(async () => []),
  });
  if (!result) throw new Error('expected curated deprecated entry');
  eq(result.successor, null, 'successor must be null for deprecated entries');
  eq(result.confidence, 'HIGH', 'still HIGH (curated)');
  eq(result.source, 'curated', 'source curated');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
