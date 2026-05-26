#!/usr/bin/env node
/**
 * Test: OpenSoyce Trust Stack (OTS) Gate & Governor Integration.
 * Covers: Hybrid Gating, edge caching, central GitOps policy rules,
 * cryptographic maintainer appeals, and exception ledger signatures.
 */

import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import exceptionsHandler, { signExceptionLedger, DEPS_REGISTRY } from '../api/exceptions.js';
import { __resetSupabaseClientForTests } from '../api/_supabase.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
    passed += 1;
  } catch (e) {
    console.log(`FAIL  ${name} -- ${e.message}\n${e.stack}`);
    failed += 1;
  }
}

function eq(a, b, msg) {
  if (a !== b) {
    throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  }
}

function ok(c, msg) {
  if (!c) throw new Error(msg || 'assertion failed');
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
  setHeader(k, v) {
    this.headers[k.toLowerCase()] = v;
  }
  end(data) {
    this.body = data;
    this.headersSent = true;
  }
}

const DASHBOARD_SECRET = 'unit-test-dashboard-secret-32-chars-x';
process.env.OPENSOYCE_DASHBOARD_SECRET = DASHBOARD_SECRET;

test('OTS Gate: Allow clean dependencies', async () => {
  const req = new MockReq(
    'POST', 
    { 'content-type': 'application/json' }, 
    { action: 'compliance-gate' }, 
    { dependencies: ['react', 'express'] }
  );
  const res = new MockRes();

  req.resume();
  await exceptionsHandler(req, res);

  eq(res.statusCode, 200, 'gate response status');
  const body = JSON.parse(res.body);
  eq(body.decision, 'ALLOW', 'decision');
  eq(body.cache, 'hit', 'cache');
  eq(body.dependenciesChecked, 2, 'count');
});

test('OTS Gate: Block malicious and restricted packages', async () => {
  const req = new MockReq(
    'POST', 
    { 'content-type': 'application/json' }, 
    { action: 'compliance-gate' }, 
    { dependencies: ['react', 'malicious-pkg', 'agpl-pkg'] }
  );
  const res = new MockRes();

  req.resume();
  await exceptionsHandler(req, res);

  eq(res.statusCode, 200, 'gate status');
  const body = JSON.parse(res.body);
  eq(body.decision, 'BLOCK', 'decision');

  const maliciousEval = body.evaluation.find(e => e.package === 'malicious-pkg');
  eq(maliciousEval.action, 'BLOCK', 'malicious action');
  ok(maliciousEval.reason.includes('exploit') || maliciousEval.reason.includes('blocked'), 'malicious reason');

  const agplEval = body.evaluation.find(e => e.package === 'agpl-pkg');
  eq(agplEval.action, 'BLOCK', 'agpl action');
  ok(agplEval.reason.includes('License'), 'agpl reason');
});

test('OTS Gate: Handle warning status on medium-risk packages', async () => {
  const req = new MockReq(
    'POST', 
    { 'content-type': 'application/json' }, 
    { action: 'compliance-gate' }, 
    { dependencies: ['react', 'lodash'] }
  );
  const res = new MockRes();

  req.resume();
  await exceptionsHandler(req, res);

  eq(res.statusCode, 200, 'gate status');
  const body = JSON.parse(res.body);
  eq(body.decision, 'ALLOW', 'decision stays ALLOW for warnings');
  
  const lodashEval = body.evaluation.find(e => e.package === 'lodash');
  eq(lodashEval.action, 'WARN', 'lodash action');
  ok(lodashEval.reason.includes('warning'), 'lodash reason');
});

test('OTS Gate: Verify GitOps custom policy override', async () => {
  const req = new MockReq(
    'POST', 
    { 'content-type': 'application/json' }, 
    { action: 'compliance-gate' }, 
    { 
      dependencies: ['react', 'lodash'],
      policy: {
        block: ['watchlist'], // Promote watchlist (lodash) to BLOCK
        warn: [],
        allow: []
      }
    }
  );
  const res = new MockRes();

  req.resume();
  await exceptionsHandler(req, res);

  eq(res.statusCode, 200, 'gate status');
  const body = JSON.parse(res.body);
  eq(body.decision, 'BLOCK', 'decision promoted to BLOCK');
  
  const lodashEval = body.evaluation.find(e => e.package === 'lodash');
  eq(lodashEval.action, 'BLOCK', 'lodash action');
});

test('Ledger Exception: Sign and record interactive Slack approval', async () => {
  const exceptionId = 'f9cde210-9b48-4cb2-87ff-4fa50645c11d';
  
  const mockSelect = {
    eq: (col, val) => ({
      maybeSingle: () => {
        eq(col, 'id', 'id lookup');
        eq(val, exceptionId, 'exceptionId value');
        return {
          data: { id: exceptionId, package_name: 'agpl-pkg', owner: 'acme-corp', repo: 'app', status: 'pending', reason: 'Needed for legacy chart generation.' },
          error: null
        };
      }
    })
  };

  const mockUpdate = (payload) => {
    ok(payload.reason.includes('--- LEDGER SIGNATURE:'), 'signature appended to reason');
    eq(payload.status, 'approved', 'status approved');
    eq(payload.granted_by, 'slack:sam-compliance', 'granted_by');
    
    // Verify signature mathematically
    const sigLine = payload.reason.split('\n--- LEDGER SIGNATURE: ')[1];
    const expectedSig = signExceptionLedger(exceptionId, 'agpl-pkg', 'slack:sam-compliance', 'Needed for legacy chart generation.', DASHBOARD_SECRET);
    eq(sigLine, expectedSig, 'ledger signature correctness');

    return {
      eq: (col, val) => {
        eq(col, 'id', 'update filter col');
        eq(val, exceptionId, 'update filter val');
        return { error: null };
      }
    };
  };

  const mockSb = {
    from: (table) => {
      eq(table, 'exceptions', 'table accessed');
      return { 
        select: () => mockSelect,
        update: mockUpdate
      };
    }
  };

  process.env.SUPABASE_URL = 'https://mock.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-key';
  __resetSupabaseClientForTests();

  // Mock Slack Webhook payload
  const payload = {
    actions: [{ action_id: 'approve', value: exceptionId }],
    user: { username: 'sam-compliance' },
    response_url: 'https://hooks.slack.com/actions/mock-url'
  };
  const rawBody = `payload=${encodeURIComponent(JSON.stringify(payload))}`;

  const req = new MockReq('POST', {}, { action: 'slack-webhook' }, rawBody);
  // Inject rawBody directly
  req.rawBody = rawBody;
  const res = new MockRes();

  req.resume();
  await exceptionsHandler(req, res);

  eq(res.statusCode, 200, 'webhook ok status');
  const body = JSON.parse(res.body);
  eq(body.ok, true, 'ok');
  eq(body.status, 'approved', 'approved');

  // Clean up
  __resetSupabaseClientForTests();
});

test('Cryptographic Appeals: Re-evaluate and elevate package score', async () => {
  const originalScore = DEPS_REGISTRY['moment'].score;
  const originalVerdict = DEPS_REGISTRY['moment'].verdict;

  // Session token for authenticated maintainer
  const payload = { login: 'maintainer-bob', orgs: ['acme-corp'], exp: Math.floor(Date.now() / 1000) + 1000 };
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  const hmac = crypto.createHmac('sha256', DASHBOARD_SECRET).update(JSON.stringify(payload)).digest('hex');
  const validCookie = `osg_session=${b64}.${hmac}`;

  const req = new MockReq(
    'POST', 
    { cookie: validCookie }, 
    { action: 'submit-appeal' }, 
    { package_name: 'moment', ecosystem: 'npm', repo: 'moment/moment' }
  );
  const res = new MockRes();

  req.resume();
  await exceptionsHandler(req, res);

  eq(res.statusCode, 200, 'appeal status');
  const body = JSON.parse(res.body);
  eq(body.ok, true, 'ok');
  eq(body.packageName, 'moment', 'packageName');
  eq(body.newScore, originalScore + 1.0, 'newScore increased by 1.0');
  eq(body.newVerdict, 'WATCHLIST', 'newVerdict upgraded from RISKY to WATCHLIST');

  // Clean up Registry state
  DEPS_REGISTRY['moment'].score = originalScore;
  DEPS_REGISTRY['moment'].verdict = originalVerdict;
});

console.log(`\nOTS Governor & Gate Integration tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
