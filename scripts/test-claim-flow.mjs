#!/usr/bin/env node
/**
 * Unit tests for the /claim rebuttal flow.
 *
 * Network-free. We stub:
 *   - exchangeCodeForToken / getAuthenticatedLogin / checkCollaborator (callback)
 *   - signAppJwt / findInstallationId / getInstallationToken / createIssue (submit)
 *
 * Tested:
 *   1. State token roundtrip (sign -> verify)
 *   2. State token tamper rejection
 *   3. State token expiry rejection
 *   4. CSRF: state signed for {a/b} can't be replayed against a different owner
 *   5. Claim token TTL roundtrip + expired rejection
 *   6. claim-start: bad input -> 400; good input -> 302 to github.com
 *   7. claim-callback: missing state -> 400 HTML
 *   8. claim-callback: forged state -> 400 HTML
 *   9. claim-callback: collaborator 204 -> 302 with claim-token
 *  10. claim-callback: collaborator 404 -> error HTML, no token in response
 *  11. claim-callback: OAuth exchange error -> friendly error HTML
 *  12. claim-submit: missing token -> 400
 *  13. claim-submit: expired claim-token -> 401
 *  14. claim-submit: body too short -> 400
 *  15. claim-submit: body too long -> 400
 *  16. claim-submit: happy path -> 200 with issueUrl + correct GitHub payload
 *  17. claim-submit: createIssue throws -> 502 friendly error
 */

import { Readable } from 'node:stream';

import {
  signToken, verifyToken,
  signStateToken, verifyStateToken,
  signClaimToken, verifyClaimToken,
} from '../src/shared/claimTokens.js';

import claimStartHandler from '../api/claim-start.js';
import claimCallbackHandler, { __setDepsForTesting as setCallbackDeps } from '../api/claim-callback.js';
import claimSubmitHandler, { __setDepsForTesting as setSubmitDeps, buildIssueTitle, buildIssueBody } from '../api/claim-submit.js';

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

const KEY = 'unit-test-hmac-key-please-use-a-real-secret';
const APP_ID = '3717179';

process.env.GITHUB_OAUTH_CLIENT_ID = 'test_client_id';
process.env.GITHUB_OAUTH_CLIENT_SECRET = KEY;
process.env.GITHUB_APP_ID = APP_ID;
process.env.GITHUB_APP_PRIVATE_KEY = '-----BEGIN RSA PRIVATE KEY-----\nstub\n-----END RSA PRIVATE KEY-----\n';

// ---------------------------------------------------------------------------
// Fake req/res helpers
// ---------------------------------------------------------------------------

function makeRes() {
  // The handler sometimes sets `res.statusCode = N` directly (Node-style)
  // and sometimes calls `res.status(N)`. We use an accessor that mirrors
  // both to the underlying record so either pattern is observable.
  const out = { statusCode: null, headers: {}, body: null, html: null, _ended: false };
  const res = {
    setHeader(k, v) { out.headers[k.toLowerCase()] = v; },
    status(c) { out.statusCode = c; return res; },
    json(o) { out.body = o; out._ended = true; return res; },
    end(payload) {
      out._ended = true;
      if (payload !== undefined) {
        const ct = (out.headers['content-type'] || '');
        if (ct.includes('text/html')) out.html = String(payload);
        else out.body = payload;
      }
      return res;
    },
    _out: out,
  };
  Object.defineProperty(res, 'statusCode', {
    get() { return out.statusCode; },
    set(v) { out.statusCode = v; },
    enumerable: true,
    configurable: true,
  });
  return res;
}

function makeGetReq({ url = '/', headers = {} } = {}) {
  const stream = Readable.from([]);
  const parsed = new URL(url, 'http://x');
  const query = Object.fromEntries(parsed.searchParams.entries());
  Object.assign(stream, { method: 'GET', headers, url, query });
  return stream;
}

function makePostReq({ url = '/', headers = {}, body }) {
  const stream = Readable.from([]);
  Object.assign(stream, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    url,
    body, // simulate Vercel auto-parsed body
  });
  return stream;
}

// ---------------------------------------------------------------------------
// 1-4: token primitives
// ---------------------------------------------------------------------------

await test('1. state token roundtrip preserves owner/repo', async () => {
  const t = signStateToken({ owner: 'foo', repo: 'bar' }, KEY);
  const v = verifyStateToken(t, KEY);
  ok(v, 'should verify');
  eq(v.owner, 'foo'); eq(v.repo, 'bar');
});

await test('2. state token tamper rejected', async () => {
  const t = signStateToken({ owner: 'foo', repo: 'bar' }, KEY);
  // flip one char in the signature half
  const idx = t.lastIndexOf('.') + 5;
  const tampered = t.slice(0, idx) + (t[idx] === 'a' ? 'b' : 'a') + t.slice(idx + 1);
  eq(verifyStateToken(tampered, KEY), null);
});

await test('3. state token expiry rejected', async () => {
  // sign with current time, then verify with a "now" 11 minutes ahead
  const t = signStateToken({ owner: 'foo', repo: 'bar' }, KEY);
  const now = Math.floor(Date.now() / 1000) + 11 * 60;
  eq(verifyStateToken(t, KEY, { now }), null);
});

await test('4. CSRF: state for foo/bar cannot be replayed against baz/quux', async () => {
  // The verify always returns whatever the SIGNED payload says — so a callback
  // using the state-token will only ever bind to its signed owner/repo. If an
  // attacker hand-crafts ?state=... with a different owner injected, signature
  // verification fails.
  const t = signStateToken({ owner: 'foo', repo: 'bar' }, KEY);
  const decoded = verifyStateToken(t, KEY);
  eq(decoded.owner, 'foo'); eq(decoded.repo, 'bar');
  // Try to inject — re-sign payload with attacker's key, original key rejects.
  const forged = signStateToken({ owner: 'attacker', repo: 'evil' }, 'attacker-key');
  eq(verifyStateToken(forged, KEY), null);
});

await test('5. claim token TTL: in-window verifies, past exp rejects', async () => {
  const t = signClaimToken({ owner: 'o', repo: 'r', login: 'me', ttlSec: 600 }, KEY);
  const v = verifyClaimToken(t, KEY);
  ok(v, 'should verify');
  eq(v.login, 'me');
  const now = Math.floor(Date.now() / 1000) + 700;
  eq(verifyClaimToken(t, KEY, { now }), null);
});

// ---------------------------------------------------------------------------
// 6: claim-start
// ---------------------------------------------------------------------------

await test('6a. claim-start: bad owner -> 400', async () => {
  const req = makeGetReq({ url: '/api/claim-start?owner=..&repo=bar' });
  const res = makeRes();
  await claimStartHandler(req, res);
  eq(res._out.statusCode, 400);
});

await test('6b. claim-start: good input -> 302 to github.com with state', async () => {
  const req = makeGetReq({ url: '/api/claim-start?owner=foo&repo=bar' });
  const res = makeRes();
  await claimStartHandler(req, res);
  eq(res._out.statusCode, 302);
  const loc = res._out.headers['location'];
  ok(typeof loc === 'string' && loc.startsWith('https://github.com/login/oauth/authorize?'),
    `expected github.com auth URL, got ${loc}`);
  const u = new URL(loc);
  eq(u.searchParams.get('client_id'), 'test_client_id');
  eq(u.searchParams.get('redirect_uri'), 'https://www.opensoyce.com/api/claim-callback');
  const state = u.searchParams.get('state');
  ok(state, 'state must be set');
  const decoded = verifyStateToken(state, KEY);
  ok(decoded, 'state should verify with our key');
  eq(decoded.owner, 'foo'); eq(decoded.repo, 'bar');
});

// ---------------------------------------------------------------------------
// 7-11: claim-callback
// ---------------------------------------------------------------------------

await test('7. claim-callback: missing code/state -> 400 HTML', async () => {
  setCallbackDeps({});
  const req = makeGetReq({ url: '/api/claim-callback' });
  const res = makeRes();
  await claimCallbackHandler(req, res);
  eq(res._out.statusCode, 400);
  ok(res._out.html && res._out.html.includes('Missing OAuth response'), 'should render missing-OAuth HTML');
});

await test('8. claim-callback: forged state -> 400 invalid state', async () => {
  setCallbackDeps({});
  const forged = signStateToken({ owner: 'x', repo: 'y' }, 'wrong-key');
  const req = makeGetReq({ url: `/api/claim-callback?code=abc&state=${encodeURIComponent(forged)}` });
  const res = makeRes();
  await claimCallbackHandler(req, res);
  eq(res._out.statusCode, 400);
  ok(res._out.html && res._out.html.includes('Invalid state'), 'should render invalid-state HTML');
});

await test('9. claim-callback: 204 collaborator -> 302 to /claim with token', async () => {
  setCallbackDeps({
    exchangeCodeForToken: async () => ({ access_token: 'gho_fake_token' }),
    getAuthenticatedLogin: async () => 'alice',
    checkCollaborator: async () => 'collaborator',
  });
  const state = signStateToken({ owner: 'foo', repo: 'bar' }, KEY);
  const req = makeGetReq({ url: `/api/claim-callback?code=abc&state=${encodeURIComponent(state)}` });
  const res = makeRes();
  await claimCallbackHandler(req, res);
  eq(res._out.statusCode, 302);
  const loc = res._out.headers['location'];
  ok(loc && loc.startsWith('https://www.opensoyce.com/claim?'), `expected /claim redirect, got ${loc}`);
  const u = new URL(loc);
  eq(u.searchParams.get('owner'), 'foo');
  eq(u.searchParams.get('repo'), 'bar');
  const claimTok = u.searchParams.get('token');
  ok(claimTok, 'claim token must be present');
  // CRITICAL: the OAuth access token must not leak into the redirect.
  ok(!loc.includes('gho_fake_token'), 'OAuth access token must not appear in redirect URL');
  const v = verifyClaimToken(claimTok, KEY);
  ok(v, 'claim token should verify');
  eq(v.login, 'alice');
  eq(v.owner, 'foo'); eq(v.repo, 'bar');
});

await test('10. claim-callback: 404 non-collaborator -> 403 HTML, no token issued', async () => {
  setCallbackDeps({
    exchangeCodeForToken: async () => ({ access_token: 'gho_fake_token' }),
    getAuthenticatedLogin: async () => 'mallory',
    checkCollaborator: async () => 'not_member',
  });
  const state = signStateToken({ owner: 'foo', repo: 'bar' }, KEY);
  const req = makeGetReq({ url: `/api/claim-callback?code=abc&state=${encodeURIComponent(state)}` });
  const res = makeRes();
  await claimCallbackHandler(req, res);
  eq(res._out.statusCode, 403);
  ok(res._out.html && res._out.html.includes('Not a collaborator'), 'should render not-collaborator HTML');
  ok(!res._out.headers['location'], 'no redirect should be set on rejection');
});

await test('11. claim-callback: OAuth exchange returns error -> friendly error', async () => {
  setCallbackDeps({
    exchangeCodeForToken: async () => ({ error: 'bad_verification_code', error_description: 'The code is invalid.' }),
    getAuthenticatedLogin: async () => 'should-not-be-called',
    checkCollaborator: async () => 'should-not-be-called',
  });
  const state = signStateToken({ owner: 'foo', repo: 'bar' }, KEY);
  const req = makeGetReq({ url: `/api/claim-callback?code=abc&state=${encodeURIComponent(state)}` });
  const res = makeRes();
  await claimCallbackHandler(req, res);
  eq(res._out.statusCode, 400);
  ok(res._out.html && res._out.html.includes('OAuth failed'), 'should render OAuth-failed HTML');
});

// reset
setCallbackDeps(null);

// ---------------------------------------------------------------------------
// 12-17: claim-submit
// ---------------------------------------------------------------------------

await test('12. claim-submit: missing token -> 400', async () => {
  setSubmitDeps({});
  const req = makePostReq({ url: '/api/claim-submit', body: {} });
  const res = makeRes();
  await claimSubmitHandler(req, res);
  eq(res._out.statusCode, 400);
  eq(res._out.body?.error, 'MISSING_TOKEN');
});

await test('13. claim-submit: expired claim-token -> 401', async () => {
  setSubmitDeps({});
  // sign a token that's already expired
  const now = Math.floor(Date.now() / 1000);
  const expired = signToken({ owner: 'o', repo: 'r', login: 'me', exp: now - 5 }, KEY);
  const req = makePostReq({ body: { token: expired, rebuttalBody: 'x'.repeat(50) } });
  const res = makeRes();
  await claimSubmitHandler(req, res);
  eq(res._out.statusCode, 401);
  eq(res._out.body?.error, 'INVALID_OR_EXPIRED_TOKEN');
});

await test('14. claim-submit: body too short -> 400 BODY_TOO_SHORT', async () => {
  setSubmitDeps({});
  const token = signClaimToken({ owner: 'o', repo: 'r', login: 'me' }, KEY);
  const req = makePostReq({ body: { token, rebuttalBody: 'too short' } });
  const res = makeRes();
  await claimSubmitHandler(req, res);
  eq(res._out.statusCode, 400);
  eq(res._out.body?.error, 'BODY_TOO_SHORT');
});

await test('15. claim-submit: body too long -> 400 BODY_TOO_LONG', async () => {
  setSubmitDeps({});
  const token = signClaimToken({ owner: 'o', repo: 'r', login: 'me' }, KEY);
  const req = makePostReq({ body: { token, rebuttalBody: 'x'.repeat(10_001) } });
  const res = makeRes();
  await claimSubmitHandler(req, res);
  eq(res._out.statusCode, 400);
  eq(res._out.body?.error, 'BODY_TOO_LONG');
});

await test('16. claim-submit: happy path -> 200 + issueUrl + correct GitHub payload', async () => {
  const recorded = { issues: [] };
  setSubmitDeps({
    signAppJwt: () => 'stub.jwt.token',
    findInstallationId: async () => 99999,
    getInstallationToken: async () => ({ token: 'ghs_stub' }),
    createIssue: async (_token, args) => {
      recorded.issues.push(args);
      return { html_url: 'https://github.com/freewho99/opensoyce/issues/42', number: 42 };
    },
  });
  const token = signClaimToken({ owner: 'foo', repo: 'bar', login: 'alice' }, KEY);
  const rebuttal = 'This score is wrong because we DO have automated tests, you missed our .github/workflows directory.';
  const req = makePostReq({ body: { token, rebuttalBody: rebuttal } });
  const res = makeRes();
  await claimSubmitHandler(req, res);
  eq(res._out.statusCode, 200);
  eq(res._out.body?.ok, true);
  eq(res._out.body?.issueUrl, 'https://github.com/freewho99/opensoyce/issues/42');
  eq(res._out.body?.issueNumber, 42);
  eq(recorded.issues.length, 1);
  const issue = recorded.issues[0];
  eq(issue.owner, 'freewho99');
  eq(issue.repo, 'opensoyce');
  ok(issue.labels.includes('claim-rebuttal'), 'issue should carry claim-rebuttal label');
  ok(issue.title.includes('foo/bar'), 'title should name the repo');
  ok(issue.title.includes('@alice'), 'title should name the verified collaborator');
  ok(issue.body.includes(rebuttal), 'body should embed the rebuttal text');
  ok(issue.body.includes('verified collaborator'), 'body should state collaborator verification');
  ok(issue.body.includes('does not retain the GitHub access token'), 'body should note non-retention');
  // Default (no opt-in flag): no band-drop marker, no extra label.
  ok(!issue.body.includes('opensoyce-subscriber'), 'default body should NOT include subscriber marker');
  ok(!issue.labels.includes('band-drop-subscribed'), 'default labels should NOT include band-drop-subscribed');
});

await test('16b. claim-submit: notifyOnBandDrop=true -> marker comment + band-drop-subscribed label', async () => {
  const recorded = { issues: [] };
  setSubmitDeps({
    signAppJwt: () => 'stub.jwt.token',
    findInstallationId: async () => 99999,
    getInstallationToken: async () => ({ token: 'ghs_stub' }),
    createIssue: async (_token, args) => {
      recorded.issues.push(args);
      return { html_url: 'https://github.com/freewho99/opensoyce/issues/43', number: 43 };
    },
  });
  const token = signClaimToken({ owner: 'foo', repo: 'bar', login: 'alice' }, KEY);
  const req = makePostReq({ body: {
    token,
    rebuttalBody: 'x'.repeat(40),
    notifyOnBandDrop: true,
  }});
  const res = makeRes();
  await claimSubmitHandler(req, res);
  eq(res._out.statusCode, 200);
  eq(res._out.body?.ok, true);
  eq(res._out.body?.notifyOnBandDrop, true);
  const issue = recorded.issues[0];
  ok(issue.body.includes('<!-- opensoyce-subscriber: login=alice repo=foo/bar watches=band-drop -->'),
    'body should include the machine-readable subscriber marker');
  ok(issue.body.includes('Verdict-band notification subscription'), 'body should include human-readable subscription footer');
  ok(issue.body.includes('@alice requested'), 'body should @-mention the subscriber');
  ok(issue.labels.includes('claim-rebuttal'), 'should still carry claim-rebuttal label');
  ok(issue.labels.includes('band-drop-subscribed'), 'should add band-drop-subscribed label');
});

await test('16c. claim-submit: notifyOnBandDrop=false -> identical to baseline (no marker, no label)', async () => {
  const recorded = { issues: [] };
  setSubmitDeps({
    signAppJwt: () => 'stub.jwt.token',
    findInstallationId: async () => 99999,
    getInstallationToken: async () => ({ token: 'ghs_stub' }),
    createIssue: async (_token, args) => {
      recorded.issues.push(args);
      return { html_url: 'https://github.com/freewho99/opensoyce/issues/44', number: 44 };
    },
  });
  const token = signClaimToken({ owner: 'foo', repo: 'bar', login: 'alice' }, KEY);
  const req = makePostReq({ body: {
    token,
    rebuttalBody: 'x'.repeat(40),
    notifyOnBandDrop: false,
  }});
  const res = makeRes();
  await claimSubmitHandler(req, res);
  eq(res._out.statusCode, 200);
  eq(res._out.body?.notifyOnBandDrop, false);
  const issue = recorded.issues[0];
  ok(!issue.body.includes('opensoyce-subscriber'), 'body should NOT include subscriber marker');
  ok(!issue.body.includes('Verdict-band notification subscription'), 'body should NOT include subscription footer');
  ok(!issue.labels.includes('band-drop-subscribed'), 'labels should NOT include band-drop-subscribed');
  eq(issue.labels.length, 1);
});

await test('16d. claim-submit: non-boolean notifyOnBandDrop (e.g. "yes") -> defaults to false', async () => {
  const recorded = { issues: [] };
  setSubmitDeps({
    signAppJwt: () => 'stub.jwt.token',
    findInstallationId: async () => 99999,
    getInstallationToken: async () => ({ token: 'ghs_stub' }),
    createIssue: async (_token, args) => {
      recorded.issues.push(args);
      return { html_url: 'https://github.com/freewho99/opensoyce/issues/45', number: 45 };
    },
  });
  const token = signClaimToken({ owner: 'foo', repo: 'bar', login: 'alice' }, KEY);
  // Anything that isn't literally `true` must fall back to false. Try each.
  for (const bad of ['yes', 'true', 1, {}, null]) {
    recorded.issues.length = 0;
    const req = makePostReq({ body: {
      token,
      rebuttalBody: 'x'.repeat(40),
      notifyOnBandDrop: bad,
    }});
    const res = makeRes();
    await claimSubmitHandler(req, res);
    eq(res._out.statusCode, 200);
    eq(res._out.body?.notifyOnBandDrop, false, `non-boolean ${JSON.stringify(bad)} should default to false`);
    const issue = recorded.issues[0];
    ok(!issue.body.includes('opensoyce-subscriber'), `body should NOT include marker for ${JSON.stringify(bad)}`);
    ok(!issue.labels.includes('band-drop-subscribed'), `no band-drop label for ${JSON.stringify(bad)}`);
  }
});

await test('17. claim-submit: createIssue throws -> 502 friendly error', async () => {
  setSubmitDeps({
    signAppJwt: () => 'stub.jwt.token',
    findInstallationId: async () => 99999,
    getInstallationToken: async () => ({ token: 'ghs_stub' }),
    createIssue: async () => { throw new Error('ISSUE_CREATE_FAILED status=403 body=Resource not accessible by integration'); },
  });
  const token = signClaimToken({ owner: 'foo', repo: 'bar', login: 'alice' }, KEY);
  const req = makePostReq({ body: { token, rebuttalBody: 'x'.repeat(40) } });
  const res = makeRes();
  await claimSubmitHandler(req, res);
  eq(res._out.statusCode, 502);
  eq(res._out.body?.error, 'ISSUE_CREATE_FAILED');
  ok(res._out.body?.message, 'should include a user-facing message');
});

// Sanity: title/body builders are stable.
await test('18. issue title and body shape', async () => {
  const t = buildIssueTitle({ owner: 'foo', repo: 'bar', login: 'alice' });
  eq(t, 'Score rebuttal: foo/bar — @alice');
  const b = buildIssueBody({
    owner: 'foo', repo: 'bar', login: 'alice',
    rebuttalBody: 'hello world',
    timestamp: '2026-05-15T10:00:00.000Z',
  });
  ok(b.includes('[foo/bar](https://github.com/foo/bar)'), 'body should link repo');
  ok(b.includes('@alice'), 'body should name login');
  ok(b.includes('2026-05-15T10:00:00.000Z'), 'body should include the verification timestamp');
  ok(b.includes('Maintainer\'s rebuttal'), 'body should have the section header');
  ok(b.includes('hello world'), 'body should embed the rebuttal text');
});

setSubmitDeps(null);

if (failed > 0) {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(1);
} else {
  console.log(`\n${passed} passed`);
  process.exit(0);
}
