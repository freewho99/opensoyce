#!/usr/bin/env node
/**
 * GitHub App v0 webhook unit tests.
 *
 * Network-free. No real HTTP, no real GitHub. We stub:
 *   - signAppJwt           (so we don't need a real RSA key for most tests)
 *   - getInstallationToken (returns a fake installation token)
 *   - fetchLockfile        (returns a stubbed lockfile result)
 *   - createCheckRun       (records the call for assertions)
 *   - runScan              (returns a known-shape response)
 *
 * Exception: test #6 (JWT signing) generates an RSA keypair in-test via
 * crypto.generateKeyPairSync — no committed fixture key.
 */

import crypto from 'node:crypto';
import { Readable } from 'node:stream';

import handler, {
  __setDepsForTesting,
  signAppJwt,
  verifySignature,
} from '../api/github-webhook.js';

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

const WEBHOOK_SECRET = 'unit-test-webhook-secret-48chars-aaaaaaaaaaaaaa';
const APP_ID = '3717179';

// Make sure required env is set BEFORE handler runs (handler reads on each
// call). Keep the real PEM out — we stub signAppJwt for all handler tests.
process.env.GITHUB_APP_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.GITHUB_APP_ID = APP_ID;
process.env.GITHUB_APP_PRIVATE_KEY = '-----BEGIN RSA PRIVATE KEY-----\nstub\n-----END RSA PRIVATE KEY-----\n';

// ---------------------------------------------------------------------------
// Fake req/res helpers
// ---------------------------------------------------------------------------

function makeRes() {
  const out = {
    statusCode: null,
    headers: {},
    body: null,
    _ended: false,
  };
  return {
    setHeader(k, v) { out.headers[k.toLowerCase()] = v; },
    status(c) { out.statusCode = c; return this; },
    json(o) { out.body = o; out._ended = true; return this; },
    end() { out._ended = true; return this; },
    _out: out,
  };
}

function makeReq({ method = 'POST', headers = {}, bodyBuffer }) {
  const stream = Readable.from(bodyBuffer ? [bodyBuffer] : []);
  // Normalize headers to lowercase keys (Node's req.headers convention).
  const lowerHeaders = {};
  for (const [k, v] of Object.entries(headers)) lowerHeaders[k.toLowerCase()] = v;
  // We also need `method`, `headers` accessible directly on the stream-like.
  Object.assign(stream, {
    method,
    headers: lowerHeaders,
    url: '/api/github-webhook',
  });
  return stream;
}

function signBody(secret, body) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function makePrPayload({
  action = 'opened',
  installationId = 12345,
  headSha = 'deadbeefcafe000000000000000000000000aaaa',
  owner = 'octocat',
  repo = 'hello',
  number = 42,
} = {}) {
  return {
    action,
    installation: { id: installationId },
    pull_request: { number, head: { sha: headSha } },
    repository: { name: repo, owner: { login: owner } },
  };
}

async function invoke({ event, payloadObj, secretOverride, methodOverride }) {
  const body = Buffer.from(JSON.stringify(payloadObj || {}), 'utf8');
  const sig = signBody(secretOverride || WEBHOOK_SECRET, body);
  const req = makeReq({
    method: methodOverride || 'POST',
    headers: {
      'content-type': 'application/json',
      'x-github-event': event,
      'x-hub-signature-256': sig,
    },
    bodyBuffer: body,
  });
  const res = makeRes();
  await handler(req, res);
  return res._out;
}

// ---------------------------------------------------------------------------
// Default stubs for handler-driven tests. Individual tests override.
// ---------------------------------------------------------------------------

function installDefaultStubs(overrides = {}) {
  const recorded = { checkRuns: [], runScanCalls: [] };
  const stubs = {
    signAppJwt: () => 'stub.jwt.token',
    getInstallationToken: async () => ({ token: 'ghs_stub_installation_token', expires_at: '2099-01-01T00:00:00Z' }),
    fetchLockfile: async () => ({ ok: true, text: JSON.stringify({ name: 'demo', lockfileVersion: 3, requires: true, packages: { '': { name: 'demo', version: '1.0.0' } } }) }),
    createCheckRun: async (_token, args) => { recorded.checkRuns.push(args); return { id: 1 }; },
    runScan: async (args) => {
      recorded.runScanCalls.push(args);
      return {
        totalDeps: 1,
        directDeps: 1,
        vulnerabilities: [],
        scannedAt: '2026-01-01T00:00:00.000Z',
        cacheHit: false,
        inventory: null,
        selectedHealth: null,
      };
    },
    buildScanDeps: () => ({
      getAnalysis: async () => null,
      resolveIdentity: async () => ({ resolvedRepo: null, confidence: 'NONE', source: null }),
      mapWithConcurrency: async () => [],
    }),
    ...overrides,
  };
  __setDepsForTesting(stubs);
  return recorded;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

await test('1. signature verify happy path -> handler proceeds past 401', async () => {
  installDefaultStubs();
  const out = await invoke({ event: 'pull_request', payloadObj: makePrPayload() });
  ok(out.statusCode !== 401, `expected non-401, got ${out.statusCode}`);
  eq(out.statusCode, 200, 'expected 200 with default stubs');
});

await test('2. signature verify mismatch -> 401', async () => {
  installDefaultStubs();
  const body = Buffer.from(JSON.stringify(makePrPayload()), 'utf8');
  const wrongSig = signBody('the-wrong-secret', body);
  const req = makeReq({
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-github-event': 'pull_request',
      'x-hub-signature-256': wrongSig,
    },
    bodyBuffer: body,
  });
  const res = makeRes();
  await handler(req, res);
  eq(res._out.statusCode, 401, 'expected 401');
  eq(res._out.body?.error, 'SIGNATURE_MISMATCH', 'expected SIGNATURE_MISMATCH error');
});

await test('3. ping event -> 200 with { ignored: "ping" }, no Check Run', async () => {
  const rec = installDefaultStubs();
  const out = await invoke({ event: 'ping', payloadObj: { zen: 'hello' } });
  eq(out.statusCode, 200, 'expected 200');
  eq(out.body?.ignored, 'ping', 'expected ignored: ping');
  eq(rec.checkRuns.length, 0, 'no Check Run should be created on ping');
});

await test('4. PR opened with vulnerable lockfile -> Check Run posted with lodash in markdown', async () => {
  const VULN_LOCK = JSON.stringify({
    name: 'demo',
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': { name: 'demo', version: '1.0.0', dependencies: { lodash: '4.17.20' } },
      'node_modules/lodash': { version: '4.17.20', license: 'MIT' },
    },
  });
  const rec = installDefaultStubs({
    fetchLockfile: async () => ({ ok: true, text: VULN_LOCK }),
    runScan: async () => ({
      totalDeps: 1,
      directDeps: 1,
      vulnerabilities: [{
        package: 'lodash',
        version: '4.17.20',
        severity: 'high',
        id: 'GHSA-fake',
        fixedIn: '4.17.21',
        resolvedRepo: 'lodash/lodash',
        confidence: 'HIGH',
        source: 'npm.repository',
        // RISKY verdict drives REVIEW_REQUIRED + maintainerTrust HIGH, so the
        // recommendedAction sentence names the vulnerable package by name.
        repoHealth: { soyceScore: 2.0, verdict: 'RISKY', signals: { maintenance: 1, security: 0, activity: 1 } },
        repoHealthError: null,
      }],
      scannedAt: '2026-01-01T00:00:00.000Z',
      cacheHit: false,
      inventory: {
        format: 'npm-v3',
        totals: { totalPackages: 1, directPackages: 1, transitivePackages: 0 },
        packages: [{ name: 'lodash', versions: ['4.17.20'], direct: true, scope: 'prod', hasLicense: true, hasRepository: true }],
      },
      selectedHealth: { scored: [], skippedBudget: 0, qualifyingTotal: 0, budget: 25 },
    }),
  });
  const out = await invoke({ event: 'pull_request', payloadObj: makePrPayload({ action: 'opened' }) });
  eq(out.statusCode, 200, 'expected 200');
  eq(rec.checkRuns.length, 1, 'one Check Run should be created');
  const cr = rec.checkRuns[0];
  eq(cr.conclusion, 'success', 'v0 always success');
  ok(cr.title && /REVIEW|PATCH/.test(cr.title), `title should reflect decision, got "${cr.title}"`);
  ok(cr.summaryMarkdown.includes('lodash'), 'summary markdown should mention lodash');
  ok(cr.summaryMarkdown.includes('OpenSoyce'), 'summary should include the report header');
  ok(cr.headSha && cr.headSha.length >= 7, 'head sha should be set');
});

await test('5. PR with no lockfile -> Check Run conclusion: neutral', async () => {
  const rec = installDefaultStubs({
    fetchLockfile: async () => ({ ok: false, reason: 'missing' }),
  });
  const out = await invoke({ event: 'pull_request', payloadObj: makePrPayload({ action: 'opened' }) });
  eq(out.statusCode, 200, 'expected 200');
  eq(rec.checkRuns.length, 1, 'one Check Run');
  eq(rec.checkRuns[0].conclusion, 'neutral', 'expected neutral conclusion');
  ok(rec.checkRuns[0].title.includes('No package-lock.json'), `title should mention missing lockfile, got "${rec.checkRuns[0].title}"`);
});

await test('6. JWT signing produces a valid RS256 JWT with iss == appId', async () => {
  // Generate a throwaway 2048-bit RSA keypair. Never committed.
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privatePem = privateKey.export({ type: 'pkcs1', format: 'pem' });
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' });

  const jwt = signAppJwt(APP_ID, privatePem);
  const parts = jwt.split('.');
  eq(parts.length, 3, 'JWT must have 3 parts');

  const decode = (s) => {
    const pad = '='.repeat((4 - (s.length % 4)) % 4);
    const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(b64, 'base64');
  };

  const headerJson = JSON.parse(decode(parts[0]).toString('utf8'));
  eq(headerJson.alg, 'RS256', 'alg should be RS256');
  eq(headerJson.typ, 'JWT', 'typ should be JWT');

  const payloadJson = JSON.parse(decode(parts[1]).toString('utf8'));
  eq(payloadJson.iss, APP_ID, 'iss should match appId');
  ok(typeof payloadJson.iat === 'number', 'iat should be a number');
  ok(typeof payloadJson.exp === 'number', 'exp should be a number');
  ok(payloadJson.exp - payloadJson.iat <= 600, 'exp - iat must be <= 600 (GitHub max)');
  ok(payloadJson.exp - payloadJson.iat > 0, 'exp must be after iat');

  // Verify the RS256 signature against the public key we generated.
  const signingInput = `${parts[0]}.${parts[1]}`;
  const sigBytes = decode(parts[2]);
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(signingInput);
  verifier.end();
  const valid = verifier.verify(publicPem, sigBytes);
  ok(valid, 'JWT signature should verify against the public key');
});

await test('7. PR closed event -> 200 ignored, no Check Run', async () => {
  const rec = installDefaultStubs();
  const out = await invoke({ event: 'pull_request', payloadObj: makePrPayload({ action: 'closed' }) });
  eq(out.statusCode, 200, 'expected 200');
  eq(out.body?.ignored, 'closed', 'expected ignored: closed');
  eq(rec.checkRuns.length, 0, 'no Check Run on closed action');
});

// Bonus sanity: verifySignature is constant-time / tolerant of bad input.
await test('8. verifySignature rejects malformed/empty inputs', async () => {
  ok(!verifySignature(undefined, Buffer.from('a'), 'k'), 'undefined header');
  ok(!verifySignature('', Buffer.from('a'), 'k'), 'empty header');
  ok(!verifySignature('sha1=abc', Buffer.from('a'), 'k'), 'wrong algo prefix');
  ok(!verifySignature('sha256=00', Buffer.from('a'), 'k'), 'too-short hex');
  ok(verifySignature(signBody('k', Buffer.from('hello')), Buffer.from('hello'), 'k'), 'happy path');
});

// Reset deps so subsequent runs don't get sticky stubs.
__setDepsForTesting(null);

if (failed > 0) {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(1);
} else {
  console.log(`\n${passed} passed`);
  process.exit(0);
}
