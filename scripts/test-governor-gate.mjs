#!/usr/bin/env node
/**
 * Test: OpenSoyce Trust Stack (OTS) Gate & Governor Integration.
 * Covers: Hybrid Gating, edge caching, central GitOps policy rules,
 * cryptographic maintainer appeals, and exception ledger signatures.
 */

import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import exceptionsHandler, {
  signExceptionLedger,
  __setAppealPermissionResolverForTests,
} from '../api/exceptions.js';
import {
  __resetSupabaseClientForTests,
  __setSupabaseClientForTests,
} from '../api/_supabase.js';

let passed = 0;
let failed = 0;
const pending = [];

// IMPORTANT: every test case in this file is `async`, so the harness MUST
// await the function. The previous synchronous `try { fn() }` returned
// before async assertions ran, which meant rejected promises became
// unhandled rejections AFTER `PASS` had already been printed. That hid a
// real DB_ERROR in the slack-webhook test.
function test(name, fn) {
  pending.push(async () => {
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

async function runAll() {
  for (const fn of pending) await fn();
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

test('OTS Gate: Resolve package details from database registry', async () => {
  const mockSb = {
    from: (table) => {
      eq(table, 'package_registry', 'table accessed');
      return {
        select: (cols) => {
          ok(cols.includes('package_name'), 'select cols');
          return {
            in: (col, vals) => {
              eq(col, 'package_name', 'in column');
              return {
                eq: (col2, val2) => {
                  eq(col2, 'ecosystem', 'eq column');
                  eq(val2, 'npm', 'ecosystem must be npm');
                  return Promise.resolve({
                    data: [
                      {
                        package_name: 'custom-db-pkg',
                        ecosystem: 'npm',
                        score: 3.5,
                        license: 'GPL-3.0',
                        verdict: 'risky',
                        status: 'AGING',
                        warn_message: 'OUTDATED',
                        description: 'Custom DB mock package',
                        critical: false
                      }
                    ],
                    error: null
                  });
                }
              };
            }
          };
        }
      };
    }
  };

  __setSupabaseClientForTests(mockSb);

  // First check: a package in the DB + a package in DEPS_REGISTRY should result in cache: hit
  const req1 = new MockReq(
    'POST',
    { 'content-type': 'application/json' },
    { action: 'compliance-gate' },
    { dependencies: ['custom-db-pkg', 'react'] }
  );
  const res1 = new MockRes();

  req1.resume();
  await exceptionsHandler(req1, res1);

  eq(res1.statusCode, 200, 'gate response status');
  const body1 = JSON.parse(res1.body);
  eq(body1.decision, 'ALLOW', 'decision');
  eq(body1.cache, 'hit', 'cache status should be hit because all pkgs are resolved via registry/db');
  eq(body1.dependenciesChecked, 2, 'count');

  const customEval = body1.evaluation.find(e => e.package === 'custom-db-pkg');
  ok(customEval !== undefined, 'custom-db-pkg found in evaluation');
  eq(customEval.score, 3.5, 'score resolved from DB');
  eq(customEval.verdict, 'RISKY', 'verdict resolved from DB');
  eq(customEval.license, 'GPL-3.0', 'license resolved from DB');
  eq(customEval.action, 'WARN', 'risky verdict triggers WARN by default');

  // Second check: querying a completely unknown package should fall back to defaults and register a cache: miss
  const req2 = new MockReq(
    'POST',
    { 'content-type': 'application/json' },
    { action: 'compliance-gate' },
    { dependencies: ['custom-db-pkg', 'completely-unknown-pkg'] }
  );
  const res2 = new MockRes();

  req2.resume();
  await exceptionsHandler(req2, res2);

  eq(res2.statusCode, 200, 'gate response status');
  const body2 = JSON.parse(res2.body);
  eq(body2.cache, 'miss', 'cache status should be miss due to unknown package');

  const unknownEval = body2.evaluation.find(e => e.package === 'completely-unknown-pkg');
  ok(unknownEval !== undefined, 'completely-unknown-pkg found in evaluation');
  eq(unknownEval.score, 8.0, 'default score');
  eq(unknownEval.license, 'MIT', 'default license');
  eq(unknownEval.verdict, 'STABLE', 'default verdict');

  __setSupabaseClientForTests(null);
});


test('OTS Gate: Block critical packages and warn on restricted-license under default policy', async () => {
  // Default policy warn=['graveyard','risky','watchlist'], block=[]. So a
  // restricted-license package whose verdict is 'risky' (agpl-pkg) WARNS
  // but does not BLOCK unless policy explicitly blocks AGPL — see the
  // dedicated license-block test below. The previous version of this test
  // asserted agpl=BLOCK under default policy; that assertion was always
  // wrong and only passed because the test harness ate async failures.
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
  eq(body.decision, 'BLOCK', 'decision rolls up to BLOCK (driven by malicious-pkg)');

  const maliciousEval = body.evaluation.find(e => e.package === 'malicious-pkg');
  eq(maliciousEval.action, 'BLOCK', 'malicious action');
  ok(maliciousEval.reason.includes('exploit') || maliciousEval.reason.includes('blocked'), 'malicious reason');

  const agplEval = body.evaluation.find(e => e.package === 'agpl-pkg');
  eq(agplEval.action, 'WARN', 'agpl under default policy is WARN (verdict=risky)');
});

test('OTS Gate: Custom policy can block restricted licenses via license: prefix', async () => {
  const req = new MockReq(
    'POST',
    { 'content-type': 'application/json' },
    { action: 'compliance-gate' },
    {
      dependencies: ['react', 'agpl-pkg'],
      policy: { block: ['license:agpl-3.0'], warn: [], allow: [] }
    }
  );
  const res = new MockRes();

  req.resume();
  await exceptionsHandler(req, res);

  eq(res.statusCode, 200, 'gate status');
  const body = JSON.parse(res.body);
  eq(body.decision, 'BLOCK', 'decision is BLOCK with license-block policy');

  const agplEval = body.evaluation.find(e => e.package === 'agpl-pkg');
  eq(agplEval.action, 'BLOCK', 'agpl is BLOCK under explicit license-block policy');
  ok(agplEval.reason.includes('License'), 'agpl reason names the license');
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

  // Inject the mock Supabase client (the env-var/reset pattern this test
  // previously used left supabase-js making real DNS calls to
  // mock.supabase.co — which failed, returning 500 DB_ERROR. The harness
  // bug hid that. Now the mock is actually wired.)
  __setSupabaseClientForTests(mockSb);

  // Slack webhook signing — the handler now fails closed when
  // SLACK_SIGNING_SECRET is unset, so the test must supply a real signature.
  const SLACK_SECRET = 'unit-test-slack-signing-secret';
  process.env.SLACK_SIGNING_SECRET = SLACK_SECRET;

  // Mock Slack Webhook payload
  const payload = {
    actions: [{ action_id: 'approve', value: exceptionId }],
    user: { username: 'sam-compliance' },
    response_url: 'https://hooks.slack.com/actions/mock-url'
  };
  const rawBody = `payload=${encodeURIComponent(JSON.stringify(payload))}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const sigBase = `v0:${timestamp}:${rawBody}`;
  const signature = `v0=${crypto.createHmac('sha256', SLACK_SECRET).update(sigBase).digest('hex')}`;

  const req = new MockReq(
    'POST',
    {
      'x-slack-signature': signature,
      'x-slack-request-timestamp': timestamp,
    },
    { action: 'slack-webhook' },
    rawBody
  );
  req.rawBody = rawBody;
  const res = new MockRes();

  req.resume();
  await exceptionsHandler(req, res);

  eq(res.statusCode, 200, 'webhook ok status');
  const body = JSON.parse(res.body);
  eq(body.ok, true, 'ok');
  eq(body.status, 'approved', 'approved');

  // Clean up
  __setSupabaseClientForTests(null);
  delete process.env.SLACK_SIGNING_SECRET;
});

test('Slack webhook: fail-closed when SLACK_SIGNING_SECRET is unset', async () => {
  delete process.env.SLACK_SIGNING_SECRET;

  const rawBody = 'payload=%7B%7D';
  const req = new MockReq('POST', {}, { action: 'slack-webhook' }, rawBody);
  req.rawBody = rawBody;
  const res = new MockRes();
  req.resume();
  await exceptionsHandler(req, res);

  eq(res.statusCode, 500, 'unconfigured slack returns 500');
  const body = JSON.parse(res.body);
  eq(body.error, 'SLACK_NOT_CONFIGURED', 'error code names the missing config');
});

function mintSessionCookie(login) {
  const payload = { login, orgs: [], exp: Math.floor(Date.now() / 1000) + 1000 };
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  const hmac = crypto.createHmac('sha256', DASHBOARD_SECRET).update(JSON.stringify(payload)).digest('hex');
  return `osg_session=${b64}.${hmac}`;
}

test('Appeals: reject when caller lacks write or admin on source repo', async () => {
  // Stub the permission lookup to return read-only.
  __setAppealPermissionResolverForTests(async () => 'read');

  const req = new MockReq(
    'POST',
    { cookie: mintSessionCookie('random-user') },
    { action: 'submit-appeal' },
    { package_name: 'moment', ecosystem: 'npm', repo: 'moment/moment' }
  );
  const res = new MockRes();

  req.resume();
  await exceptionsHandler(req, res);

  eq(res.statusCode, 403, 'non-maintainer is rejected');
  const body = JSON.parse(res.body);
  eq(body.error, 'FORBIDDEN', 'error code');
  ok(/admin or write/.test(body.message), 'message names the required role');

  __setAppealPermissionResolverForTests(null);
});

test('Appeals: reject when GitHub App is not installed on source repo', async () => {
  __setAppealPermissionResolverForTests(async () => 'none');

  const req = new MockReq(
    'POST',
    { cookie: mintSessionCookie('random-user') },
    { action: 'submit-appeal' },
    { package_name: 'moment', ecosystem: 'npm', repo: 'moment/moment' }
  );
  const res = new MockRes();

  req.resume();
  await exceptionsHandler(req, res);

  eq(res.statusCode, 404, 'no-installation is rejected');
  const body = JSON.parse(res.body);
  eq(body.error, 'NOT_FOUND', 'error code');
  ok(/Guard is not installed/.test(body.message), 'message names the install requirement');

  __setAppealPermissionResolverForTests(null);
});

test('Appeals: file pending review when caller is verified maintainer', async () => {
  __setAppealPermissionResolverForTests(async () => 'admin');

  let insertedRow = null;
  const mockSb = {
    from: (table) => {
      eq(table, 'appeals', 'appeals table accessed');
      return {
        insert: (row) => {
          insertedRow = row;
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  __setSupabaseClientForTests(mockSb);

  const req = new MockReq(
    'POST',
    { cookie: mintSessionCookie('maintainer-bob') },
    { action: 'submit-appeal' },
    { package_name: 'moment', ecosystem: 'npm', repo: 'moment/moment', rationale: 'CVE was patched in v3.0' }
  );
  const res = new MockRes();

  req.resume();
  await exceptionsHandler(req, res);

  eq(res.statusCode, 200, 'appeal accepted');
  const body = JSON.parse(res.body);
  eq(body.ok, true, 'ok');
  eq(body.status, 'pending', 'status is pending (no auto-grant)');
  eq(body.packageName, 'moment', 'packageName');
  eq(body.verifiedRole, 'admin', 'verifiedRole reflects GitHub permission');
  ok(typeof body.appealId === 'string' && body.appealId.length > 0, 'appealId is present');

  // The row written to Supabase reflects verified maintainership, not claim.
  ok(insertedRow !== null, 'insert was called');
  eq(insertedRow.package_name, 'moment', 'row.package_name');
  eq(insertedRow.ecosystem, 'npm', 'row.ecosystem');
  eq(insertedRow.source_owner, 'moment', 'row.source_owner');
  eq(insertedRow.source_repo, 'moment', 'row.source_repo');
  eq(insertedRow.submitted_by, 'maintainer-bob', 'row.submitted_by from session');
  eq(insertedRow.submitted_by_role, 'admin', 'row.submitted_by_role is proven, not claimed');
  eq(insertedRow.status, 'pending', 'row.status starts pending');
  eq(insertedRow.rationale, 'CVE was patched in v3.0', 'row.rationale stored');

  __setAppealPermissionResolverForTests(null);
  __setSupabaseClientForTests(null);
});

test('Appeals Review: list returns 403 when caller is not a reviewer', async () => {
  const req = new MockReq(
    'GET',
    { cookie: mintSessionCookie('maintainer-bob') },
    { action: 'appeals-list' }
  );
  const res = new MockRes();

  req.resume();
  await exceptionsHandler(req, res);

  eq(res.statusCode, 403, 'non-reviewer gets 403 on list');
  const body = JSON.parse(res.body);
  eq(body.error, 'FORBIDDEN', 'error code');
});

test('Appeals Review: list returns all appeals when caller is a reviewer', async () => {
  const mockAppeals = [
    { id: '1', package_name: 'moment', ecosystem: 'npm', status: 'pending' },
    { id: '2', package_name: 'react', ecosystem: 'npm', status: 'approved' },
  ];

  const mockSb = {
    from: (table) => {
      eq(table, 'appeals', 'appeals table accessed');
      return {
        select: (cols) => {
          ok(cols.includes('package_name'), 'select checks columns');
          return {
            order: (col, opts) => {
              eq(col, 'created_at', 'ordered by created_at');
              eq(opts.ascending, false, 'descending');
              return { data: mockAppeals, error: null };
            }
          };
        }
      };
    }
  };
  __setSupabaseClientForTests(mockSb);

  const req = new MockReq(
    'GET',
    { cookie: mintSessionCookie('freewho99') },
    { action: 'appeals-list' }
  );
  const res = new MockRes();

  req.resume();
  await exceptionsHandler(req, res);

  eq(res.statusCode, 200, 'reviewer gets 200 on list');
  const body = JSON.parse(res.body);
  eq(body.appeals.length, 2, 'returns 2 appeals');
  eq(body.appeals[0].package_name, 'moment', 'first is moment');

  __setSupabaseClientForTests(null);
});

test('Appeals Review: review returns 403 when caller is not a reviewer', async () => {
  const req = new MockReq(
    'POST',
    { cookie: mintSessionCookie('maintainer-bob') },
    { action: 'appeal-review' },
    { id: '1', status: 'approved', review_notes: 'Looks good' }
  );
  const res = new MockRes();

  req.resume();
  await exceptionsHandler(req, res);

  eq(res.statusCode, 403, 'non-reviewer gets 403 on review');
  const body = JSON.parse(res.body);
  eq(body.error, 'FORBIDDEN', 'error');
});

test('Appeals Review: review updates status and notes when caller is a reviewer', async () => {
  const appealId = '777de210-9b48-4cb2-87ff-4fa50645c777';
  
  const mockSelect = {
    eq: (col, val) => ({
      maybeSingle: () => {
        eq(col, 'id', 'id lookup');
        eq(val, appealId, 'appealId value');
        return {
          data: { id: appealId, status: 'pending', package_name: 'moment', ecosystem: 'npm' },
          error: null
        };
      }
    })
  };

  let updatedRow = null;
  const mockUpdate = (payload) => {
    updatedRow = payload;
    return {
      eq: (col, val) => {
        eq(col, 'id', 'update filter col');
        eq(val, appealId, 'update filter val');
        return {
          select: () => ({
            single: () => ({
              data: { id: appealId, ...payload },
              error: null
            })
          })
        };
      }
    };
  };

  const mockSb = {
    from: (table) => {
      eq(table, 'appeals', 'appeals table accessed');
      return {
        select: () => mockSelect,
        update: mockUpdate
      };
    }
  };
  __setSupabaseClientForTests(mockSb);

  const req = new MockReq(
    'POST',
    { cookie: mintSessionCookie('freewho99') },
    { action: 'appeal-review' },
    { id: appealId, status: 'approved', review_notes: 'Appealing reasons look solid.' }
  );
  const res = new MockRes();

  req.resume();
  await exceptionsHandler(req, res);

  eq(res.statusCode, 200, 'review status ok');
  const body = JSON.parse(res.body);
  eq(body.ok, true, 'ok');
  eq(body.appeal.status, 'approved', 'approved');
  eq(body.appeal.reviewed_by, 'freewho99', 'reviewed_by');
  eq(body.appeal.review_notes, 'Appealing reasons look solid.', 'notes stored');

  ok(updatedRow !== null, 'update was called');
  eq(updatedRow.status, 'approved', 'updated status');
  eq(updatedRow.reviewed_by, 'freewho99', 'updated reviewer');
  eq(updatedRow.review_notes, 'Appealing reasons look solid.', 'updated notes');

  __setSupabaseClientForTests(null);
});

await runAll();
console.log(`\nOTS Governor & Gate Integration tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
