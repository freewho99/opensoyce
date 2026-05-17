#!/usr/bin/env node
/**
 * checkPublicRegistry verification with stubbed fetch.
 */
import { checkPublicRegistry } from '../src/shared/checkPublicRegistry.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  return Promise.resolve().then(fn).then(
    () => { console.log(`PASS  ${name}`); passed += 1; },
    e => { console.log(`FAIL  ${name} -- ${e.message}`); failed += 1; },
  );
}
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function makeFetchStub(map) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (map.has(url)) {
      const status = map.get(url);
      return { ok: status >= 200 && status < 300, status };
    }
    return { ok: false, status: 404 };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

(async () => {
  // 1. npm exists (200).
  await test('npm 200 → true', async () => {
    const cache = new Map();
    const fetchImpl = makeFetchStub(new Map([
      ['https://registry.npmjs.org/lodash', 200],
    ]));
    const r = await checkPublicRegistry('lodash', 'npm', { fetchImpl, cache });
    eq(r, true, 'lodash exists');
  });

  // 2. npm missing (404).
  await test('npm 404 → false', async () => {
    const cache = new Map();
    const fetchImpl = makeFetchStub(new Map([
      ['https://registry.npmjs.org/mycompany-private-utils', 404],
    ]));
    const r = await checkPublicRegistry('mycompany-private-utils', 'npm', { fetchImpl, cache });
    eq(r, false, '404 → false');
  });

  // 3. npm 5xx → false (graceful).
  await test('npm 503 → false (no escalation on degraded registry)', async () => {
    const cache = new Map();
    const fetchImpl = makeFetchStub(new Map([
      ['https://registry.npmjs.org/anything', 503],
    ]));
    const r = await checkPublicRegistry('anything', 'npm', { fetchImpl, cache });
    eq(r, false, '503 → false');
  });

  // 4. PyPI exists.
  await test('PyPI 200 → true', async () => {
    const cache = new Map();
    const fetchImpl = makeFetchStub(new Map([
      ['https://pypi.org/pypi/requests/json', 200],
    ]));
    const r = await checkPublicRegistry('requests', 'PyPI', { fetchImpl, cache });
    eq(r, true, 'requests exists on PyPI');
  });

  // 5. PyPI missing.
  await test('PyPI 404 → false', async () => {
    const cache = new Map();
    const fetchImpl = makeFetchStub(new Map([
      ['https://pypi.org/pypi/mycompany-private/json', 404],
    ]));
    const r = await checkPublicRegistry('mycompany-private', 'PyPI', { fetchImpl, cache });
    eq(r, false, '404 → false');
  });

  // 6. Cache hit: second call with same name does NOT hit fetch.
  await test('cache hit: second call does not re-fetch', async () => {
    const cache = new Map();
    const fetchImpl = makeFetchStub(new Map([
      ['https://registry.npmjs.org/lodash', 200],
    ]));
    const r1 = await checkPublicRegistry('lodash', 'npm', { fetchImpl, cache });
    const r2 = await checkPublicRegistry('lodash', 'npm', { fetchImpl, cache });
    eq(r1, true, 'first call true');
    eq(r2, true, 'second call true');
    eq(fetchImpl.calls.length, 1, 'fetch called only once');
  });

  // Bonus: fetch throws → false.
  await test('fetch throws → false, no propagation', async () => {
    const cache = new Map();
    const fetchImpl = async () => { throw new Error('network down'); };
    const r = await checkPublicRegistry('lodash', 'npm', { fetchImpl, cache });
    eq(r, false, 'throw swallowed');
  });

  // Bonus: invalid ecosystem → false, no fetch.
  await test('invalid ecosystem → false, no fetch invocation', async () => {
    const cache = new Map();
    const fetchImpl = makeFetchStub(new Map());
    const r = await checkPublicRegistry('lodash', 'rubygems', { fetchImpl, cache });
    eq(r, false, 'unsupported eco → false');
    eq(fetchImpl.calls.length, 0, 'never fetched');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();
