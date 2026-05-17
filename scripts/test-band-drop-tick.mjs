#!/usr/bin/env node
/**
 * Band-drop notifier v0.1 -- tests.
 *
 * Network-free. Deps injected via __setDepsForTesting:
 *   signAppJwt, findInstallationId, getInstallationToken,
 *   listIssuesByLabel, postIssueComment, patchIssueBody,
 *   analyzeRepo, verdictFor.
 *
 * Coverage:
 *   t1  -- auth: missing bearer -> 401
 *   t2  -- auth: wrong bearer -> 401
 *   t3  -- auth: wrong method (POST) -> 405
 *   t4  -- zero subscribers -> 200 { scanned: 0 }
 *   t5  -- first-tick baseline -> PATCH only, no comment, { baselined: 1 }
 *   t6  -- band unchanged -> no comment, no PATCH, { scanned: 1, dropped: 0 }
 *   t7  -- band drop -> comment + PATCH, { dropped: 1 }
 *   t8  -- band moved up -> PATCH only, no comment, { dropped: 0 }
 *   t9  -- analyzeRepo throws RATE_LIMIT_HIT for one of two -> other still processes
 *   t10 -- analyzeRepo returns null (404 repo) -> errored, no PATCH
 *   t11 -- malformed subscriber marker -> skip, errored counter
 *   t12 -- isBandDrop unit tests covering ladder + non-ladder bands
 *   t13 -- parseSubscriberMarker / parseLastBandMarker / upsertLastBandMarker
 *          unit tests
 */

import { Readable } from 'node:stream';

import handler, {
  __setDepsForTesting,
  isBandDrop,
  parseSubscriberMarker,
  parseLastBandMarker,
  upsertLastBandMarker,
  buildDropCommentBody,
  BAND_LADDER,
} from '../api/band-drop-tick.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { console.log(`PASS  ${name}`); passed += 1; })
    .catch(e => { console.log(`FAIL  ${name} -- ${e && e.stack ? e.stack : e}`); failed += 1; });
}

function ok(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg || 'eq'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

const CRON_SECRET = 'unit-test-cron-secret';
process.env.CRON_SECRET = CRON_SECRET;
process.env.GITHUB_APP_ID = '3717179';
process.env.GITHUB_APP_PRIVATE_KEY = '-----BEGIN RSA PRIVATE KEY-----\nstub\n-----END RSA PRIVATE KEY-----\n';
process.env.GITHUB_TOKEN = 'ghp_stub';

// ---------------------------------------------------------------------------
// req/res helpers
// ---------------------------------------------------------------------------

function makeRes() {
  const out = { statusCode: null, headers: {}, body: null, _ended: false };
  const res = {
    setHeader(k, v) { out.headers[k.toLowerCase()] = v; },
    status(c) { out.statusCode = c; return res; },
    json(o) { out.body = o; out._ended = true; return res; },
    _out: out,
  };
  Object.defineProperty(res, 'statusCode', {
    get() { return out.statusCode; },
    set(v) { out.statusCode = v; },
  });
  return res;
}

function makeReq({ method = 'GET', headers = {} } = {}) {
  const s = Readable.from([]);
  Object.assign(s, { method, headers, url: '/api/band-drop-tick' });
  return s;
}

// Common stub set: App auth always succeeds.
function appAuthStubs() {
  return {
    signAppJwt: () => 'stub-jwt',
    findInstallationId: async () => 12345,
    getInstallationToken: async () => ({ token: 'stub-install-token' }),
  };
}

function makeIssue({ number, body, html_url }) {
  return { number, body, html_url: html_url || `https://github.com/freewho99/opensoyce/issues/${number}`, pull_request: undefined };
}

function makeScoreResult(score) {
  return {
    total: score,
    breakdown: { maintenance: 0, community: 0, security: 0, documentation: 0, activity: 0 },
    meta: { advisories: { critical: 0, high: 0, medium: 0, low: 0 } },
    maintainerConcentration: null,
    vendorSdk: null,
    migration: null,
    repo: { id: 1, name: 'r', owner: 'o', description: null },
  };
}

// ---------------------------------------------------------------------------
// 1-3: Auth
// ---------------------------------------------------------------------------

await test('1. missing bearer -> 401', async () => {
  __setDepsForTesting({});
  const req = makeReq({ headers: {} });
  const res = makeRes();
  await handler(req, res);
  eq(res._out.statusCode, 401);
  eq(res._out.body && res._out.body.error, 'UNAUTHORIZED');
});

await test('2. wrong bearer -> 401', async () => {
  __setDepsForTesting({});
  const req = makeReq({ headers: { authorization: 'Bearer wrong' } });
  const res = makeRes();
  await handler(req, res);
  eq(res._out.statusCode, 401);
});

await test('3. wrong method (POST) -> 405', async () => {
  __setDepsForTesting({});
  const req = makeReq({ method: 'POST', headers: { authorization: `Bearer ${CRON_SECRET}` } });
  const res = makeRes();
  await handler(req, res);
  eq(res._out.statusCode, 405);
});

// ---------------------------------------------------------------------------
// 4: Zero subscribers
// ---------------------------------------------------------------------------

await test('4. zero subscribers -> { scanned: 0 }, no analyze calls', async () => {
  let analyzeCalls = 0;
  __setDepsForTesting({
    ...appAuthStubs(),
    listIssuesByLabel: async () => [],
    analyzeRepo: async () => { analyzeCalls += 1; return null; },
  });
  const req = makeReq({ headers: { authorization: `Bearer ${CRON_SECRET}` } });
  const res = makeRes();
  await handler(req, res);
  eq(res._out.statusCode, 200);
  eq(res._out.body.ok, true);
  eq(res._out.body.scanned, 0);
  eq(res._out.body.baselined, 0);
  eq(res._out.body.dropped, 0);
  eq(res._out.body.errored, 0);
  eq(analyzeCalls, 0);
});

// ---------------------------------------------------------------------------
// 5: First-tick baseline
// ---------------------------------------------------------------------------

await test('5. first-tick baseline: PATCH marker, no comment', async () => {
  let commentCount = 0;
  let patchCount = 0;
  let lastPatchBody = null;
  __setDepsForTesting({
    ...appAuthStubs(),
    listIssuesByLabel: async () => [makeIssue({
      number: 7,
      body: 'rebuttal text\n\n<!-- opensoyce-subscriber: login=alice repo=foo/bar watches=band-drop -->',
    })],
    analyzeRepo: async () => makeScoreResult(8.7), // USE READY
    verdictFor: () => 'USE READY',
    postIssueComment: async () => { commentCount += 1; },
    patchIssueBody: async (_t, _o, _r, _n, body) => { patchCount += 1; lastPatchBody = body; },
  });
  const req = makeReq({ headers: { authorization: `Bearer ${CRON_SECRET}` } });
  const res = makeRes();
  await handler(req, res);
  eq(res._out.statusCode, 200);
  eq(res._out.body.baselined, 1);
  eq(res._out.body.dropped, 0);
  eq(res._out.body.scanned, 1);
  eq(commentCount, 0);
  eq(patchCount, 1);
  ok(lastPatchBody.includes('<!-- opensoyce-last-band: USE READY -->'), 'patched body should contain new marker');
});

// ---------------------------------------------------------------------------
// 6: Band unchanged
// ---------------------------------------------------------------------------

await test('6. band unchanged -> no comment, no PATCH', async () => {
  let commentCount = 0;
  let patchCount = 0;
  __setDepsForTesting({
    ...appAuthStubs(),
    listIssuesByLabel: async () => [makeIssue({
      number: 8,
      body: 'rebuttal\n<!-- opensoyce-subscriber: login=alice repo=foo/bar watches=band-drop -->\n<!-- opensoyce-last-band: FORKABLE -->',
    })],
    analyzeRepo: async () => makeScoreResult(7.3),
    verdictFor: () => 'FORKABLE',
    postIssueComment: async () => { commentCount += 1; },
    patchIssueBody: async () => { patchCount += 1; },
  });
  const req = makeReq({ headers: { authorization: `Bearer ${CRON_SECRET}` } });
  const res = makeRes();
  await handler(req, res);
  eq(res._out.statusCode, 200);
  eq(res._out.body.dropped, 0);
  eq(res._out.body.scanned, 1);
  eq(commentCount, 0);
  eq(patchCount, 0);
});

// ---------------------------------------------------------------------------
// 7: Band drop
// ---------------------------------------------------------------------------

await test('7. band drop FORKABLE -> WATCHLIST: comment + PATCH', async () => {
  let commentBody = null;
  let patchedBody = null;
  __setDepsForTesting({
    ...appAuthStubs(),
    listIssuesByLabel: async () => [makeIssue({
      number: 9,
      body: 'rebuttal\n<!-- opensoyce-subscriber: login=alice repo=foo/bar watches=band-drop -->\n<!-- opensoyce-last-band: FORKABLE -->',
    })],
    analyzeRepo: async () => makeScoreResult(5.2),
    verdictFor: () => 'WATCHLIST',
    postIssueComment: async (_t, _o, _r, _n, body) => { commentBody = body; },
    patchIssueBody: async (_t, _o, _r, _n, body) => { patchedBody = body; },
  });
  const req = makeReq({ headers: { authorization: `Bearer ${CRON_SECRET}` } });
  const res = makeRes();
  await handler(req, res);
  eq(res._out.statusCode, 200);
  eq(res._out.body.dropped, 1);
  ok(commentBody && commentBody.includes('@alice'), 'comment mentions @alice');
  ok(commentBody.includes('FORKABLE'), 'comment names old band');
  ok(commentBody.includes('WATCHLIST'), 'comment names new band');
  ok(patchedBody.includes('<!-- opensoyce-last-band: WATCHLIST -->'), 'marker updated to new band');
});

// ---------------------------------------------------------------------------
// 8: Band moved up
// ---------------------------------------------------------------------------

await test('8. band moved up WATCHLIST -> FORKABLE: PATCH only, no comment', async () => {
  let commentCount = 0;
  let patchedBody = null;
  __setDepsForTesting({
    ...appAuthStubs(),
    listIssuesByLabel: async () => [makeIssue({
      number: 10,
      body: '<!-- opensoyce-subscriber: login=alice repo=foo/bar watches=band-drop -->\n<!-- opensoyce-last-band: WATCHLIST -->',
    })],
    analyzeRepo: async () => makeScoreResult(7.4),
    verdictFor: () => 'FORKABLE',
    postIssueComment: async () => { commentCount += 1; },
    patchIssueBody: async (_t, _o, _r, _n, body) => { patchedBody = body; },
  });
  const req = makeReq({ headers: { authorization: `Bearer ${CRON_SECRET}` } });
  const res = makeRes();
  await handler(req, res);
  eq(res._out.statusCode, 200);
  eq(res._out.body.dropped, 0);
  eq(res._out.body.scanned, 1);
  eq(commentCount, 0);
  ok(patchedBody.includes('<!-- opensoyce-last-band: FORKABLE -->'), 'marker synced upward');
});

// ---------------------------------------------------------------------------
// 9: One subscriber's analyzeRepo throws -- the other still processes
// ---------------------------------------------------------------------------

await test('9. RATE_LIMIT_HIT for one of two -> other still processes', async () => {
  let analyzeCalls = 0;
  let commentCount = 0;
  let patchCount = 0;
  __setDepsForTesting({
    ...appAuthStubs(),
    listIssuesByLabel: async () => [
      makeIssue({
        number: 11,
        body: '<!-- opensoyce-subscriber: login=alice repo=foo/bar watches=band-drop -->\n<!-- opensoyce-last-band: FORKABLE -->',
      }),
      makeIssue({
        number: 12,
        body: '<!-- opensoyce-subscriber: login=bob repo=baz/quux watches=band-drop -->\n<!-- opensoyce-last-band: FORKABLE -->',
      }),
    ],
    analyzeRepo: async (owner) => {
      analyzeCalls += 1;
      if (owner === 'foo') throw new Error('RATE_LIMIT_HIT');
      return makeScoreResult(5.2);
    },
    verdictFor: () => 'WATCHLIST',
    postIssueComment: async () => { commentCount += 1; },
    patchIssueBody: async () => { patchCount += 1; },
  });
  const req = makeReq({ headers: { authorization: `Bearer ${CRON_SECRET}` } });
  const res = makeRes();
  await handler(req, res);
  eq(res._out.statusCode, 200);
  eq(analyzeCalls, 2);
  eq(res._out.body.errored, 1);
  eq(res._out.body.dropped, 1);
  eq(commentCount, 1);
  eq(patchCount, 1);
});

// ---------------------------------------------------------------------------
// 10: analyzeRepo returns null (404 repo)
// ---------------------------------------------------------------------------

await test('10. analyzeRepo null (404) -> errored, no PATCH, no comment', async () => {
  let commentCount = 0;
  let patchCount = 0;
  __setDepsForTesting({
    ...appAuthStubs(),
    listIssuesByLabel: async () => [makeIssue({
      number: 13,
      body: '<!-- opensoyce-subscriber: login=alice repo=ghost/repo watches=band-drop -->\n<!-- opensoyce-last-band: FORKABLE -->',
    })],
    analyzeRepo: async () => null,
    verdictFor: () => 'WATCHLIST',
    postIssueComment: async () => { commentCount += 1; },
    patchIssueBody: async () => { patchCount += 1; },
  });
  const req = makeReq({ headers: { authorization: `Bearer ${CRON_SECRET}` } });
  const res = makeRes();
  await handler(req, res);
  eq(res._out.statusCode, 200);
  eq(res._out.body.errored, 1);
  eq(res._out.body.dropped, 0);
  eq(commentCount, 0);
  eq(patchCount, 0);
});

// ---------------------------------------------------------------------------
// 11: Malformed subscriber marker
// ---------------------------------------------------------------------------

await test('11. malformed subscriber marker -> skipped, errored counter', async () => {
  let analyzeCalls = 0;
  __setDepsForTesting({
    ...appAuthStubs(),
    listIssuesByLabel: async () => [makeIssue({
      number: 14,
      body: 'no marker here',
    })],
    analyzeRepo: async () => { analyzeCalls += 1; return makeScoreResult(5); },
    verdictFor: () => 'WATCHLIST',
    postIssueComment: async () => {},
    patchIssueBody: async () => {},
  });
  const req = makeReq({ headers: { authorization: `Bearer ${CRON_SECRET}` } });
  const res = makeRes();
  await handler(req, res);
  eq(res._out.statusCode, 200);
  eq(analyzeCalls, 0);
  eq(res._out.body.errored, 1);
});

// ---------------------------------------------------------------------------
// 12: isBandDrop unit
// ---------------------------------------------------------------------------

await test('12. isBandDrop: ladder semantics + non-ladder bands', async () => {
  // Drops (true)
  eq(isBandDrop('USE READY', 'FORKABLE'), true);
  eq(isBandDrop('FORKABLE', 'WATCHLIST'), true);
  eq(isBandDrop('STABLE', 'STALE'), true);
  eq(isBandDrop('WATCHLIST', 'STALE'), true);
  // Same band (false)
  eq(isBandDrop('FORKABLE', 'FORKABLE'), false);
  eq(isBandDrop('STALE', 'STALE'), false);
  // Upward (false)
  eq(isBandDrop('WATCHLIST', 'FORKABLE'), false);
  eq(isBandDrop('STALE', 'USE READY'), false);
  // Non-ladder bands (false)
  eq(isBandDrop('HIGH MOMENTUM', 'WATCHLIST'), false);
  eq(isBandDrop('FORKABLE', 'NOT A BAND'), false);
  eq(isBandDrop(null, 'WATCHLIST'), false);
  eq(isBandDrop('FORKABLE', null), false);
  // Sanity: ladder is 6 long, ordered down
  eq(BAND_LADDER.length, 6);
  eq(BAND_LADDER[0], 'USE READY');
  eq(BAND_LADDER[5], 'STALE');
});

// ---------------------------------------------------------------------------
// 13: Marker helpers unit
// ---------------------------------------------------------------------------

await test('13a. parseSubscriberMarker: happy path', async () => {
  const body = 'stuff\n<!-- opensoyce-subscriber: login=alice repo=facebook/react watches=band-drop -->\nmore';
  const sub = parseSubscriberMarker(body);
  ok(sub, 'should parse');
  eq(sub.login, 'alice');
  eq(sub.owner, 'facebook');
  eq(sub.repo, 'react');
});

await test('13b. parseSubscriberMarker: missing/malformed -> null', async () => {
  eq(parseSubscriberMarker(''), null);
  eq(parseSubscriberMarker('no marker'), null);
  eq(parseSubscriberMarker('<!-- opensoyce-subscriber: login=alice repo=noslash watches=band-drop -->'), null);
  eq(parseSubscriberMarker(null), null);
});

await test('13c. parseLastBandMarker: happy + missing', async () => {
  eq(parseLastBandMarker('<!-- opensoyce-last-band: USE READY -->'), 'USE READY');
  eq(parseLastBandMarker('<!-- opensoyce-last-band: WATCHLIST -->'), 'WATCHLIST');
  eq(parseLastBandMarker('no marker'), null);
  eq(parseLastBandMarker(''), null);
  eq(parseLastBandMarker(null), null);
});

await test('13d. upsertLastBandMarker: insert + replace', async () => {
  // Insert when subscriber marker exists.
  const body1 = 'rebuttal\n<!-- opensoyce-subscriber: login=alice repo=foo/bar watches=band-drop -->';
  const out1 = upsertLastBandMarker(body1, 'USE READY');
  ok(out1.includes('<!-- opensoyce-last-band: USE READY -->'), 'marker inserted');
  // Replace existing marker.
  const body2 = `${body1}\n<!-- opensoyce-last-band: USE READY -->`;
  const out2 = upsertLastBandMarker(body2, 'WATCHLIST');
  ok(out2.includes('<!-- opensoyce-last-band: WATCHLIST -->'), 'marker replaced');
  ok(!out2.includes('USE READY'), 'old marker removed');
  // Append when no subscriber marker either.
  const out3 = upsertLastBandMarker('plain text', 'STALE');
  ok(out3.endsWith('<!-- opensoyce-last-band: STALE -->'), 'appended');
});

await test('13e. buildDropCommentBody: includes mention + bands + lookup link', async () => {
  const body = buildDropCommentBody({
    login: 'alice', owner: 'facebook', repo: 'react',
    prevBand: 'USE READY', newBand: 'FORKABLE',
  });
  ok(body.includes('@alice'), 'mentions login');
  ok(body.includes('USE READY'), 'names prev band');
  ok(body.includes('FORKABLE'), 'names new band');
  ok(body.includes('https://www.opensoyce.com/lookup?q=facebook/react'), 'links to lookup');
  ok(body.toLowerCase().includes('unsubscribe'), 'mentions unsubscribe');
});

// ---------------------------------------------------------------------------

console.log('');
console.log(`Band-drop notifier tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
