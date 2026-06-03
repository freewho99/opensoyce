#!/usr/bin/env node
/**
 * Test: Incident Candidate Promote API (PR #2b).
 *
 * Exercises POST ?action=candidate-promote with mocked GitHub fetcher,
 * mocked Supabase, and mocked OTS_INCIDENTS/OTS_PATTERN_DEFINITIONS
 * resolvers (the latter two via test seams in api/exceptions.js).
 *
 * Risk surface explicitly covered:
 *   - 401/403 auth gates (no session / non-reviewer)
 *   - Promote payload validation (id slug, source confidence, pattern IDs)
 *   - Slug collision against existing OTS_INCIDENTS
 *   - Unknown triggered pattern ID rejected
 *   - Candidate not pending refused (same guardrail as Reject — user-requested)
 *   - Missing OPENSOYCE_PROMOTE_BOT_TOKEN -> 503 PROMOTE_NOT_CONFIGURED
 *   - GitHub API failure -> 502 + candidate stays pending (no half-promote)
 *   - Happy path -> 4-step GitHub flow + DB flip with PR URL + reviewer stamp
 *   - Commit message includes Co-Authored-By trailer with reviewer login
 *   - PR body includes "Promoted by @<reviewer>" header
 *
 * No network. Safe for CI.
 */

import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import exceptionsHandler, {
  __setGithubFetcherForTests,
  __setExistingIncidentIdsResolverForTests,
  __setExistingPatternIdsResolverForTests,
} from '../api/exceptions.js';
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
function ok(value, msg) { if (!value) throw new Error(msg); }

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
  constructor() { this.headers = {}; this.statusCode = 200; this.body = ''; this.headersSent = false; }
  setHeader(k, v) { this.headers[k.toLowerCase()] = v; }
  end(data) { this.body = data; this.headersSent = true; }
}

const DASHBOARD_SECRET = 'unit-test-dashboard-secret-32-chars-x';
process.env.OPENSOYCE_DASHBOARD_SECRET = DASHBOARD_SECRET;
process.env.OPENSOYCE_REVIEWERS = 'freewho99,reviewer-admin';

function mintSessionCookie(login) {
  const payload = { login, orgs: [], exp: Math.floor(Date.now() / 1000) + 1000 };
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  const hmac = crypto.createHmac('sha256', DASHBOARD_SECRET).update(JSON.stringify(payload)).digest('hex');
  return `osg_session=${b64}.${hmac}`;
}

function freshIncidentPayload(overrides = {}) {
  return {
    id: 'test-incident-2026',
    name: 'Test Incident 2026',
    date: '2026-06-03',
    target: 'test-package@1.2.3',
    sourceUrl: 'https://example.com/incident',
    sourceConfidence: 'unverified',
    description: 'A synthetic incident used for unit testing.',
    context: 'Hand-crafted fixture, not a real CVE.',
    whatHappened: 'Reviewer promoted a candidate via the form.',
    triggeredPatternIds: ['known-vulnerability-exposure'],
    preventionStrategy: 'Use the test harness; do not deploy this incident.',
    ...overrides,
  };
}

// Always provide a clean pattern catalog + incident-id set per test.
// Tests that need different sets override these inside the test body.
function defaultStubs() {
  __setExistingPatternIdsResolverForTests(async () => new Set([
    'known-vulnerability-exposure',
    'source-package-mismatch',
    'install-time-remote-execution',
  ]));
  __setExistingIncidentIdsResolverForTests(async () => new Set([
    'xz-utils-backdoor',
    'ua-parser-js-compromise',
  ]));
}

function clearStubs() {
  __setExistingPatternIdsResolverForTests(null);
  __setExistingIncidentIdsResolverForTests(null);
  __setGithubFetcherForTests(null);
  __setSupabaseClientForTests(null);
  __resetSupabaseClientForTests();
}

// ============================================================================
// Auth gates
// ============================================================================

await test('candidate-promote: 401 when no session cookie', async () => {
  defaultStubs();
  try {
    const req = new MockReq('POST', { 'content-type': 'application/json' },
      { action: 'candidate-promote' },
      { id: 'cand-1', incident: freshIncidentPayload() });
    const res = new MockRes();
    req.resume();
    await exceptionsHandler(req, res);
    eq(res.statusCode, 401, 'unauthenticated rejected');
  } finally { clearStubs(); }
});

await test('candidate-promote: 403 when authenticated but not a reviewer', async () => {
  defaultStubs();
  try {
    const req = new MockReq('POST',
      { cookie: mintSessionCookie('random-user'), 'content-type': 'application/json' },
      { action: 'candidate-promote' },
      { id: 'cand-1', incident: freshIncidentPayload() });
    const res = new MockRes();
    req.resume();
    await exceptionsHandler(req, res);
    eq(res.statusCode, 403, 'non-reviewer rejected');
  } finally { clearStubs(); }
});

// ============================================================================
// Payload validation
// ============================================================================

await test('candidate-promote: 400 when candidate id missing', async () => {
  defaultStubs();
  try {
    const req = new MockReq('POST',
      { cookie: mintSessionCookie('freewho99'), 'content-type': 'application/json' },
      { action: 'candidate-promote' },
      { incident: freshIncidentPayload() });
    const res = new MockRes();
    req.resume();
    await exceptionsHandler(req, res);
    eq(res.statusCode, 400, 'missing id rejected');
    const body = JSON.parse(res.body);
    ok(/id is required/.test(body.message), 'message names missing id');
  } finally { clearStubs(); }
});

await test('candidate-promote: 400 when incident.id not kebab-case slug', async () => {
  defaultStubs();
  try {
    const req = new MockReq('POST',
      { cookie: mintSessionCookie('freewho99'), 'content-type': 'application/json' },
      { action: 'candidate-promote' },
      { id: 'cand-1', incident: freshIncidentPayload({ id: 'Not_A_Slug!' }) });
    const res = new MockRes();
    req.resume();
    await exceptionsHandler(req, res);
    eq(res.statusCode, 400, 'bad slug rejected');
    const body = JSON.parse(res.body);
    ok(/kebab-case/.test(body.message), 'message names slug format');
  } finally { clearStubs(); }
});

await test('candidate-promote: 400 when sourceConfidence is invalid', async () => {
  defaultStubs();
  try {
    const req = new MockReq('POST',
      { cookie: mintSessionCookie('freewho99'), 'content-type': 'application/json' },
      { action: 'candidate-promote' },
      { id: 'cand-1', incident: freshIncidentPayload({ sourceConfidence: 'high' }) });
    const res = new MockRes();
    req.resume();
    await exceptionsHandler(req, res);
    eq(res.statusCode, 400, 'bad confidence rejected');
    const body = JSON.parse(res.body);
    ok(/sourceConfidence/.test(body.message), 'message names sourceConfidence');
  } finally { clearStubs(); }
});

await test('candidate-promote: 400 when triggeredPatternIds is empty', async () => {
  defaultStubs();
  try {
    const req = new MockReq('POST',
      { cookie: mintSessionCookie('freewho99'), 'content-type': 'application/json' },
      { action: 'candidate-promote' },
      { id: 'cand-1', incident: freshIncidentPayload({ triggeredPatternIds: [] }) });
    const res = new MockRes();
    req.resume();
    await exceptionsHandler(req, res);
    eq(res.statusCode, 400, 'empty patterns rejected');
  } finally { clearStubs(); }
});

await test('candidate-promote: 400 when triggeredPatternIds contains an unknown ID', async () => {
  defaultStubs();
  try {
    const req = new MockReq('POST',
      { cookie: mintSessionCookie('freewho99'), 'content-type': 'application/json' },
      { action: 'candidate-promote' },
      { id: 'cand-1', incident: freshIncidentPayload({
        triggeredPatternIds: ['known-vulnerability-exposure', 'nonexistent-pattern'],
      }) });
    const res = new MockRes();
    req.resume();
    await exceptionsHandler(req, res);
    eq(res.statusCode, 400, 'unknown pattern rejected');
    const body = JSON.parse(res.body);
    ok(/nonexistent-pattern/.test(body.message), 'message names the bad pattern id');
  } finally { clearStubs(); }
});

await test('candidate-promote: 400 when incident.id collides with existing OTS_INCIDENTS', async () => {
  defaultStubs();
  try {
    const req = new MockReq('POST',
      { cookie: mintSessionCookie('freewho99'), 'content-type': 'application/json' },
      { action: 'candidate-promote' },
      { id: 'cand-1', incident: freshIncidentPayload({ id: 'xz-utils-backdoor' }) });
    const res = new MockRes();
    req.resume();
    await exceptionsHandler(req, res);
    eq(res.statusCode, 400, 'slug collision rejected');
    const body = JSON.parse(res.body);
    ok(/already exists/.test(body.message), 'message names collision');
  } finally { clearStubs(); }
});

// ============================================================================
// Candidate-state guardrail (user explicitly requested)
// ============================================================================

await test('candidate-promote: 400 when candidate is NOT pending (status=rejected)', async () => {
  defaultStubs();
  const mockSb = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({
            data: { id: 'cand-1', status: 'rejected' },
            error: null,
          }),
        }),
      }),
    }),
  };
  __setSupabaseClientForTests(mockSb);
  try {
    const req = new MockReq('POST',
      { cookie: mintSessionCookie('freewho99'), 'content-type': 'application/json' },
      { action: 'candidate-promote' },
      { id: 'cand-1', incident: freshIncidentPayload() });
    const res = new MockRes();
    req.resume();
    await exceptionsHandler(req, res);
    eq(res.statusCode, 400, 'non-pending candidate refused');
    const body = JSON.parse(res.body);
    ok(/already in status: rejected/.test(body.message), 'message names current status');
  } finally { clearStubs(); }
});

await test('candidate-promote: 400 when candidate is already promoted', async () => {
  defaultStubs();
  const mockSb = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({
            data: { id: 'cand-1', status: 'promoted' },
            error: null,
          }),
        }),
      }),
    }),
  };
  __setSupabaseClientForTests(mockSb);
  try {
    const req = new MockReq('POST',
      { cookie: mintSessionCookie('freewho99'), 'content-type': 'application/json' },
      { action: 'candidate-promote' },
      { id: 'cand-1', incident: freshIncidentPayload() });
    const res = new MockRes();
    req.resume();
    await exceptionsHandler(req, res);
    eq(res.statusCode, 400, 'already-promoted candidate refused');
    const body = JSON.parse(res.body);
    ok(/already in status: promoted/.test(body.message), 'message names current status');
  } finally { clearStubs(); }
});

await test('candidate-promote: 404 when candidate id does not exist', async () => {
  defaultStubs();
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
    const req = new MockReq('POST',
      { cookie: mintSessionCookie('freewho99'), 'content-type': 'application/json' },
      { action: 'candidate-promote' },
      { id: 'missing-id', incident: freshIncidentPayload() });
    const res = new MockRes();
    req.resume();
    await exceptionsHandler(req, res);
    eq(res.statusCode, 404, 'missing candidate returns 404');
  } finally { clearStubs(); }
});

// ============================================================================
// Bot-token gate
// ============================================================================

await test('candidate-promote: 503 PROMOTE_NOT_CONFIGURED when bot token missing', async () => {
  defaultStubs();
  const prev = process.env.OPENSOYCE_PROMOTE_BOT_TOKEN;
  delete process.env.OPENSOYCE_PROMOTE_BOT_TOKEN;
  const mockSb = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({
            data: { id: 'cand-1', status: 'pending' },
            error: null,
          }),
        }),
      }),
    }),
  };
  __setSupabaseClientForTests(mockSb);
  try {
    const req = new MockReq('POST',
      { cookie: mintSessionCookie('freewho99'), 'content-type': 'application/json' },
      { action: 'candidate-promote' },
      { id: 'cand-1', incident: freshIncidentPayload() });
    const res = new MockRes();
    req.resume();
    await exceptionsHandler(req, res);
    eq(res.statusCode, 503, 'missing token surfaces as 503');
    const body = JSON.parse(res.body);
    eq(body.error, 'PROMOTE_NOT_CONFIGURED', 'PROMOTE_NOT_CONFIGURED error code');
  } finally {
    if (prev) process.env.OPENSOYCE_PROMOTE_BOT_TOKEN = prev;
    clearStubs();
  }
});

// ============================================================================
// GitHub API failure -> candidate stays pending
// ============================================================================

await test('candidate-promote: 502 + candidate NOT flipped when GitHub fails', async () => {
  defaultStubs();
  process.env.OPENSOYCE_PROMOTE_BOT_TOKEN = 'fake-token-for-test';

  let dbUpdateCalled = false;
  const mockSb = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({
            data: { id: 'cand-1', status: 'pending' },
            error: null,
          }),
        }),
      }),
      update: () => {
        dbUpdateCalled = true;
        return { eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) };
      },
    }),
  };
  __setSupabaseClientForTests(mockSb);

  // First call (get ref) fails — short-circuits the whole flow
  __setGithubFetcherForTests(async (url) => {
    if (url.includes('/git/refs/heads/main')) {
      return new Response('Not Found', { status: 404 });
    }
    return new Response('', { status: 500 });
  });

  try {
    const req = new MockReq('POST',
      { cookie: mintSessionCookie('freewho99'), 'content-type': 'application/json' },
      { action: 'candidate-promote' },
      { id: 'cand-1', incident: freshIncidentPayload() });
    const res = new MockRes();
    req.resume();
    await exceptionsHandler(req, res);
    eq(res.statusCode, 502, 'GitHub failure surfaces as 502');
    const body = JSON.parse(res.body);
    eq(body.error, 'GITHUB_ERROR', 'GITHUB_ERROR code');
    eq(dbUpdateCalled, false, 'candidate row update NOT attempted on GitHub failure');
  } finally {
    delete process.env.OPENSOYCE_PROMOTE_BOT_TOKEN;
    clearStubs();
  }
});

// ============================================================================
// Happy path: full 4-step GitHub flow + DB flip
// ============================================================================

await test('candidate-promote: happy path — 4 GitHub calls + DB flip with PR URL', async () => {
  defaultStubs();
  process.env.OPENSOYCE_PROMOTE_BOT_TOKEN = 'fake-token-for-test';

  // Track exact sequence of GitHub calls
  const ghCalls = [];
  let putCommitMessage = null;
  let prBodyContent = null;
  let prTitle = null;

  __setGithubFetcherForTests(async (url, init) => {
    ghCalls.push({ url, method: init?.method || 'GET' });

    if (url.endsWith('/git/refs/heads/main') && (!init || !init.method || init.method === 'GET')) {
      return new Response(JSON.stringify({ object: { sha: 'base-sha-abc123' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/git/refs') && init?.method === 'POST') {
      return new Response('{}', { status: 201, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('/contents/src%2Fdata%2FpromotedIncidents.json') && (!init || !init.method || init.method === 'GET')) {
      const existingContent = Buffer.from('[]\n', 'utf8').toString('base64');
      return new Response(JSON.stringify({ sha: 'file-sha-xyz', content: existingContent }),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('/contents/src%2Fdata%2FpromotedIncidents.json') && init?.method === 'PUT') {
      const body = JSON.parse(init.body);
      putCommitMessage = body.message;
      return new Response(JSON.stringify({ content: { sha: 'new-blob-sha' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/pulls') && init?.method === 'POST') {
      const body = JSON.parse(init.body);
      prTitle = body.title;
      prBodyContent = body.body;
      return new Response(JSON.stringify({ html_url: 'https://github.com/freewho99/opensoyce/pull/999', number: 999 }),
        { status: 201, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('', { status: 500 });
  });

  let dbUpdatePayload = null;
  const mockSb = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({
            data: { id: 'cand-1', status: 'pending' },
            error: null,
          }),
        }),
      }),
      update: (payload) => {
        dbUpdatePayload = payload;
        return {
          eq: () => ({
            select: () => ({
              single: () => Promise.resolve({
                data: { id: 'cand-1', ...payload },
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
    const req = new MockReq('POST',
      { cookie: mintSessionCookie('freewho99'), 'content-type': 'application/json' },
      { action: 'candidate-promote' },
      { id: 'cand-1', incident: freshIncidentPayload(), review_notes: 'verified via vendor advisory' });
    const res = new MockRes();
    req.resume();
    await exceptionsHandler(req, res);

    eq(res.statusCode, 200, 'happy path succeeded');
    const body = JSON.parse(res.body);
    eq(body.ok, true, 'ok flag');
    eq(body.pr.url, 'https://github.com/freewho99/opensoyce/pull/999', 'PR URL returned');
    eq(body.pr.number, 999, 'PR number returned');

    // Verify the 5-call GitHub sequence
    eq(ghCalls.length, 5, 'exactly 5 GitHub calls (get-ref, create-branch, get-contents, put-contents, create-pr)');
    ok(ghCalls[0].url.includes('/git/refs/heads/main'), 'call 1: get base ref');
    ok(ghCalls[1].url.endsWith('/git/refs') && ghCalls[1].method === 'POST', 'call 2: create branch');
    ok(ghCalls[2].url.includes('/contents/') && ghCalls[2].method === 'GET', 'call 3: read existing json');
    ok(ghCalls[3].url.includes('/contents/') && ghCalls[3].method === 'PUT', 'call 4: commit updated json');
    ok(ghCalls[4].url.endsWith('/pulls') && ghCalls[4].method === 'POST', 'call 5: open PR');

    // Verify commit message contains Co-Authored-By trailer
    ok(putCommitMessage.includes('Co-Authored-By: freewho99 <freewho99@users.noreply.github.com>'),
      'commit message includes Co-Authored-By trailer with reviewer login');
    ok(putCommitMessage.includes('Promoted by @freewho99 from candidate cand-1'),
      'commit message names reviewer + candidate');

    // Verify PR title + body
    ok(prTitle.includes('Test Incident 2026'), 'PR title includes incident name');
    ok(prBodyContent.includes('**Promoted by @freewho99**'), 'PR body opens with reviewer attribution');
    ok(prBodyContent.includes('cand-1'), 'PR body cites candidate id');

    // Verify DB flip
    eq(dbUpdatePayload.status, 'promoted', 'candidate flipped to promoted');
    eq(dbUpdatePayload.promoted_to_incident_id, 'https://github.com/freewho99/opensoyce/pull/999',
      'PR URL stored as audit anchor');
    eq(dbUpdatePayload.reviewed_by, 'freewho99', 'reviewer identity stamped from session');
    eq(dbUpdatePayload.review_notes, 'verified via vendor advisory', 'notes persisted');
    ok(dbUpdatePayload.reviewed_at, 'reviewed_at stamped');
    ok(dbUpdatePayload.updated_at, 'updated_at stamped');
  } finally {
    delete process.env.OPENSOYCE_PROMOTE_BOT_TOKEN;
    clearStubs();
  }
});

await test('candidate-promote: corroboratingSourceUrl flows into PR body when provided', async () => {
  defaultStubs();
  process.env.OPENSOYCE_PROMOTE_BOT_TOKEN = 'fake-token-for-test';

  let prBodyContent = null;
  __setGithubFetcherForTests(async (url, init) => {
    if (url.endsWith('/git/refs/heads/main')) {
      return new Response(JSON.stringify({ object: { sha: 'sha' } }), { status: 200 });
    }
    if (url.endsWith('/git/refs') && init?.method === 'POST') return new Response('{}', { status: 201 });
    if (url.includes('/contents/') && (!init || !init.method || init.method === 'GET')) {
      return new Response(JSON.stringify({ sha: 's', content: Buffer.from('[]', 'utf8').toString('base64') }), { status: 200 });
    }
    if (url.includes('/contents/') && init?.method === 'PUT') return new Response('{}', { status: 200 });
    if (url.endsWith('/pulls')) {
      prBodyContent = JSON.parse(init.body).body;
      return new Response(JSON.stringify({ html_url: 'https://example/pull/1', number: 1 }), { status: 201 });
    }
    return new Response('', { status: 500 });
  });

  const mockSb = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'cand-1', status: 'pending' }, error: null }) }) }),
      update: () => ({ eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: {}, error: null }) }) }) }),
    }),
  };
  __setSupabaseClientForTests(mockSb);

  try {
    const req = new MockReq('POST',
      { cookie: mintSessionCookie('freewho99'), 'content-type': 'application/json' },
      { action: 'candidate-promote' },
      { id: 'cand-1', incident: freshIncidentPayload({ corroboratingSourceUrl: 'https://corroborate.example' }) });
    const res = new MockRes();
    req.resume();
    await exceptionsHandler(req, res);
    eq(res.statusCode, 200, 'succeeded');
    ok(prBodyContent.includes('Corroborating source'), 'PR body includes corroborating source line');
    ok(prBodyContent.includes('https://corroborate.example'), 'PR body includes the actual URL');
  } finally {
    delete process.env.OPENSOYCE_PROMOTE_BOT_TOKEN;
    clearStubs();
  }
});

// ============================================================================
console.log(`\n${'='.repeat(50)}`);
console.log(`Incident Candidate Promote tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
