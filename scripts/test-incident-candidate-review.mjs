#!/usr/bin/env node
/**
 * Test: Incident Candidate Review API (PR #2a).
 *
 * Exercises the new ?action=candidates-list (GET) and ?action=candidate-reject
 * (POST) handlers added to api/exceptions.js. Covers:
 *   - reviewer authorization (OPENSOYCE_REVIEWERS allowlist)
 *   - unauthenticated requests are rejected at the session gate
 *   - candidates-list returns rows from Supabase
 *   - candidate-reject validates status (rejected | duplicate), refuses
 *     non-pending candidates, propagates DB errors, writes updated_at,
 *     and stamps reviewer identity
 *   - candidate-reject explicitly does NOT accept 'promoted' / 'approved'
 *     (promotion is PR #2b's surface)
 *
 * Modeled on test-governor-gate.mjs — same MockReq/MockRes + signed-session
 * cookie pattern.
 */

import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import exceptionsHandler from '../api/exceptions.js';
import {
  __resetSupabaseClientForTests,
  __setSupabaseClientForTests,
} from '../api/_supabase.js';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
    passed += 1;
  } catch (err) {
    console.log(`FAIL ${name} -- ${err.message}`);
    if (err.stack) console.log(err.stack.split('\n').slice(0, 4).join('\n'));
    failed += 1;
  }
}

function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function ok(value, msg) {
  if (!value) throw new Error(msg);
}

class MockReq extends EventEmitter {
  constructor(method, headers, query, body) {
    super();
    this.method = method;
    this.headers = headers || {};
    this.query = query || {};
    this.body = body || {};
  }
  setEncoding() {}
  resume() {
    process.nextTick(() => {
      this.emit('data', Buffer.from(JSON.stringify(this.body), 'utf8'));
      this.emit('end');
    });
  }
}

class MockRes {
  constructor() {
    this.headers = {};
    this.statusCode = 200;
    this.body = '';
    this.headersSent = false;
  }
  setHeader(k, v) { this.headers[k.toLowerCase()] = v; }
  end(data) { this.body = data; this.headersSent = true; }
}

const DASHBOARD_SECRET = 'unit-test-dashboard-secret-32-chars-x';
process.env.OPENSOYCE_DASHBOARD_SECRET = DASHBOARD_SECRET;
// Explicit reviewer allowlist — match what AppealsReview uses by default.
process.env.OPENSOYCE_REVIEWERS = 'freewho99,reviewer-admin';

function mintSessionCookie(login) {
  const payload = { login, orgs: [], exp: Math.floor(Date.now() / 1000) + 1000 };
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  const hmac = crypto.createHmac('sha256', DASHBOARD_SECRET)
    .update(JSON.stringify(payload)).digest('hex');
  return `osg_session=${b64}.${hmac}`;
}

// ============================================================================
// candidates-list
// ============================================================================

await test('candidates-list: 401 when no session cookie', async () => {
  const req = new MockReq('GET', {}, { action: 'candidates-list' }, null);
  const res = new MockRes();
  req.resume();
  await exceptionsHandler(req, res);
  eq(res.statusCode, 401, 'unauthenticated request rejected');
  const body = JSON.parse(res.body);
  eq(body.error, 'AUTH_REQUIRED', 'AUTH_REQUIRED error code');
});

await test('candidates-list: 403 when authenticated but not a reviewer', async () => {
  const req = new MockReq(
    'GET',
    { cookie: mintSessionCookie('random-non-reviewer') },
    { action: 'candidates-list' },
    null,
  );
  const res = new MockRes();
  req.resume();
  await exceptionsHandler(req, res);
  eq(res.statusCode, 403, 'non-reviewer rejected');
  const body = JSON.parse(res.body);
  eq(body.error, 'FORBIDDEN', 'FORBIDDEN error code');
});

await test('candidates-list: returns rows for an authorized reviewer', async () => {
  const mockRows = [
    { id: 'c1', source: 'hn-heuristic', source_id: '111', title: 'Malicious npm pkg', status: 'pending', created_at: '2026-06-01T00:00:00Z' },
    { id: 'c2', source: 'hn-heuristic', source_id: '222', title: 'Typosquat lоdash', status: 'rejected', created_at: '2026-05-30T00:00:00Z' },
  ];
  let tableSeen = null;
  let orderSeen = null;
  const mockSb = {
    from: (table) => {
      tableSeen = table;
      return {
        select: () => ({
          order: (col, opts) => {
            orderSeen = { col, opts };
            return Promise.resolve({ data: mockRows, error: null });
          },
        }),
      };
    },
  };
  __setSupabaseClientForTests(mockSb);
  try {
    const req = new MockReq(
      'GET',
      { cookie: mintSessionCookie('freewho99') },
      { action: 'candidates-list' },
      null,
    );
    const res = new MockRes();
    req.resume();
    await exceptionsHandler(req, res);
    eq(res.statusCode, 200, 'authorized reviewer can list');
    eq(tableSeen, 'incident_candidates', 'queries incident_candidates table');
    eq(orderSeen.col, 'created_at', 'orders by created_at');
    eq(orderSeen.opts.ascending, false, 'newest first');
    const body = JSON.parse(res.body);
    eq(body.candidates.length, 2, 'returns all rows');
    eq(body.candidates[0].id, 'c1', 'first row preserved');
  } finally {
    __setSupabaseClientForTests(null);
    __resetSupabaseClientForTests();
  }
});

// ============================================================================
// candidate-reject
// ============================================================================

await test('candidate-reject: 401 when no session', async () => {
  const req = new MockReq(
    'POST',
    { 'content-type': 'application/json' },
    { action: 'candidate-reject' },
    { id: 'c1', status: 'rejected' },
  );
  const res = new MockRes();
  req.resume();
  await exceptionsHandler(req, res);
  eq(res.statusCode, 401, 'unauthenticated rejected');
});

await test('candidate-reject: 403 when non-reviewer', async () => {
  const req = new MockReq(
    'POST',
    { cookie: mintSessionCookie('random-non-reviewer'), 'content-type': 'application/json' },
    { action: 'candidate-reject' },
    { id: 'c1', status: 'rejected' },
  );
  const res = new MockRes();
  req.resume();
  await exceptionsHandler(req, res);
  eq(res.statusCode, 403, 'non-reviewer rejected');
});

await test('candidate-reject: 400 when id is missing', async () => {
  const req = new MockReq(
    'POST',
    { cookie: mintSessionCookie('freewho99'), 'content-type': 'application/json' },
    { action: 'candidate-reject' },
    { status: 'rejected' },
  );
  const res = new MockRes();
  req.resume();
  await exceptionsHandler(req, res);
  eq(res.statusCode, 400, 'missing id rejected');
  const body = JSON.parse(res.body);
  ok(/id is required/.test(body.message), 'message names the missing field');
});

await test('candidate-reject: 400 when status is "promoted" (PR #2b territory)', async () => {
  const req = new MockReq(
    'POST',
    { cookie: mintSessionCookie('freewho99'), 'content-type': 'application/json' },
    { action: 'candidate-reject' },
    { id: 'c1', status: 'promoted' },
  );
  const res = new MockRes();
  req.resume();
  await exceptionsHandler(req, res);
  eq(res.statusCode, 400, 'promoted status refused by reject handler');
  const body = JSON.parse(res.body);
  ok(/rejected or duplicate/.test(body.message), 'message names allowed statuses');
});

await test('candidate-reject: 400 when status is "approved"', async () => {
  const req = new MockReq(
    'POST',
    { cookie: mintSessionCookie('freewho99'), 'content-type': 'application/json' },
    { action: 'candidate-reject' },
    { id: 'c1', status: 'approved' },
  );
  const res = new MockRes();
  req.resume();
  await exceptionsHandler(req, res);
  eq(res.statusCode, 400, 'approved status refused');
});

await test('candidate-reject: 404 when candidate id does not exist', async () => {
  const mockSb = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
  };
  __setSupabaseClientForTests(mockSb);
  try {
    const req = new MockReq(
      'POST',
      { cookie: mintSessionCookie('freewho99'), 'content-type': 'application/json' },
      { action: 'candidate-reject' },
      { id: 'missing-id', status: 'rejected' },
    );
    const res = new MockRes();
    req.resume();
    await exceptionsHandler(req, res);
    eq(res.statusCode, 404, 'missing candidate returns 404');
  } finally {
    __setSupabaseClientForTests(null);
    __resetSupabaseClientForTests();
  }
});

await test('candidate-reject: 400 when candidate is already promoted/rejected', async () => {
  const mockSb = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({
            data: { id: 'c1', status: 'promoted' },
            error: null,
          }),
        }),
      }),
    }),
  };
  __setSupabaseClientForTests(mockSb);
  try {
    const req = new MockReq(
      'POST',
      { cookie: mintSessionCookie('freewho99'), 'content-type': 'application/json' },
      { action: 'candidate-reject' },
      { id: 'c1', status: 'rejected' },
    );
    const res = new MockRes();
    req.resume();
    await exceptionsHandler(req, res);
    eq(res.statusCode, 400, 'already-terminal candidate cannot be re-rejected');
    const body = JSON.parse(res.body);
    ok(/already in status: promoted/.test(body.message), 'message names current status');
  } finally {
    __setSupabaseClientForTests(null);
    __resetSupabaseClientForTests();
  }
});

await test('candidate-reject: happy path -- pending -> rejected, stamps reviewer + reviewed_at', async () => {
  let updatePayload = null;
  const mockSb = {
    from: () => ({
      select: (cols) => ({
        eq: () => ({
          maybeSingle: () => {
            ok(cols.includes('status'), 'select includes status for status check');
            return Promise.resolve({
              data: { id: 'c1', status: 'pending' },
              error: null,
            });
          },
        }),
      }),
      update: (payload) => {
        updatePayload = payload;
        return {
          eq: () => ({
            select: () => ({
              single: () => Promise.resolve({
                data: { id: 'c1', status: 'rejected', ...payload },
                error: null,
              }),
            }),
          }),
        };
      },
    }),
  };
  __setSupabaseClientForTests(mockSb);
  try {
    const req = new MockReq(
      'POST',
      { cookie: mintSessionCookie('freewho99'), 'content-type': 'application/json' },
      { action: 'candidate-reject' },
      { id: 'c1', status: 'rejected', review_notes: 'not an incident, marketing post' },
    );
    const res = new MockRes();
    req.resume();
    await exceptionsHandler(req, res);
    eq(res.statusCode, 200, 'reject succeeded');
    const body = JSON.parse(res.body);
    eq(body.ok, true, 'ok flag');
    eq(updatePayload.status, 'rejected', 'status persisted');
    eq(updatePayload.reviewed_by, 'freewho99', 'reviewer identity stamped from session');
    eq(updatePayload.review_notes, 'not an incident, marketing post', 'notes persisted');
    ok(updatePayload.reviewed_at, 'reviewed_at stamped');
    ok(updatePayload.updated_at, 'updated_at stamped');
  } finally {
    __setSupabaseClientForTests(null);
    __resetSupabaseClientForTests();
  }
});

await test('candidate-reject: happy path -- status="duplicate" accepted', async () => {
  let updatePayload = null;
  const mockSb = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({
            data: { id: 'c1', status: 'pending' },
            error: null,
          }),
        }),
      }),
      update: (payload) => {
        updatePayload = payload;
        return {
          eq: () => ({
            select: () => ({
              single: () => Promise.resolve({
                data: { id: 'c1', ...payload },
                error: null,
              }),
            }),
          }),
        };
      },
    }),
  };
  __setSupabaseClientForTests(mockSb);
  try {
    const req = new MockReq(
      'POST',
      { cookie: mintSessionCookie('freewho99'), 'content-type': 'application/json' },
      { action: 'candidate-reject' },
      { id: 'c1', status: 'duplicate' },
    );
    const res = new MockRes();
    req.resume();
    await exceptionsHandler(req, res);
    eq(res.statusCode, 200, 'duplicate accepted');
    eq(updatePayload.status, 'duplicate', 'duplicate status persisted');
  } finally {
    __setSupabaseClientForTests(null);
    __resetSupabaseClientForTests();
  }
});

await test('candidate-reject: 500 when Supabase update fails', async () => {
  const mockSb = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({
            data: { id: 'c1', status: 'pending' },
            error: null,
          }),
        }),
      }),
      update: () => ({
        eq: () => ({
          select: () => ({
            single: () => Promise.resolve({
              data: null,
              error: { message: 'unique constraint failed' },
            }),
          }),
        }),
      }),
    }),
  };
  __setSupabaseClientForTests(mockSb);
  try {
    const req = new MockReq(
      'POST',
      { cookie: mintSessionCookie('freewho99'), 'content-type': 'application/json' },
      { action: 'candidate-reject' },
      { id: 'c1', status: 'rejected' },
    );
    const res = new MockRes();
    req.resume();
    await exceptionsHandler(req, res);
    eq(res.statusCode, 500, 'DB error surfaces as 500');
    const body = JSON.parse(res.body);
    eq(body.error, 'DB_ERROR', 'DB_ERROR code');
  } finally {
    __setSupabaseClientForTests(null);
    __resetSupabaseClientForTests();
  }
});

// ============================================================================
console.log(`\n${'='.repeat(50)}`);
console.log(`Incident Candidate Review tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
