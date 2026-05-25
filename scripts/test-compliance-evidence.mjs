#!/usr/bin/env node
/**
 * Test: SOC 2 Compliance Evidence Pull API (Phase 5).
 * Covers: Scoped compliance token generation, Bearer verification, role checking,
 * and signed report output formatting.
 */

import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import exceptionsHandler, { signAuditorToken, verifyAuditorToken } from '../api/exceptions.js';
import { __resetSupabaseClientForTests } from '../api/_supabase.js';
import { verifyReport, keyFingerprint } from '../src/shared/reportSigning.js';

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

// Mock Request Class
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

// Mock Response Class
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

test('Auditor Token: sign and verify', () => {
  const token = signAuditorToken({ login: 'alice', org: 'acme-corp' }, DASHBOARD_SECRET);
  ok(token.startsWith('osg_auditor_'), 'starts with auditor prefix');

  const verified = verifyAuditorToken(token, DASHBOARD_SECRET);
  ok(verified, 'token verified');
  eq(verified.login, 'alice', 'login');
  eq(verified.org, 'acme-corp', 'org');
  eq(verified.role, 'auditor', 'role');
});

test('Compliance Minting: validates user org membership', async () => {
  // Mock request session
  const token = signAuditorToken({ login: 'alice', org: 'acme-corp' }, DASHBOARD_SECRET);
  
  // We need to verify standard session token for the minting request
  const sessionToken = `mockSessionToken.${crypto.createHmac('sha256', DASHBOARD_SECRET).update(JSON.stringify({ login: 'alice', orgs: ['acme-corp'], exp: Math.floor(Date.now() / 1000) + 1000 })).digest('hex')}`;
  
  // Actually let's mock verifyDashboardSession directly in exceptions.js via env?
  // Wait, exceptions.js reads standard cookies. Let's create a valid cookie session token.
  // The signSessionToken function is imported from exceptions.js:
  // But wait, since we can't easily mock imported functions, let's look at exceptions.js's signSessionToken.
  // We can just construct a valid session token payload:
  const payload = { login: 'alice', orgs: ['acme-corp'], exp: Math.floor(Date.now() / 1000) + 1000 };
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  const hmac = crypto.createHmac('sha256', DASHBOARD_SECRET).update(JSON.stringify(payload)).digest('hex');
  const validCookie = `osg_session=${b64}.${hmac}`;

  const req = new MockReq('POST', { cookie: validCookie }, { action: 'compliance-token-mint' }, { org: 'acme-corp' });
  const res = new MockRes();
  
  req.resume();
  await exceptionsHandler(req, res);
  
  eq(res.statusCode, 200, 'mint status code');
  const body = JSON.parse(res.body);
  ok(body.ok, 'ok');
  ok(body.key.startsWith('osg_auditor_'), 'key prefix');
  eq(body.org, 'acme-corp', 'returned org');
});

test('Compliance Minting: rejects unauthorized orgs', async () => {
  const payload = { login: 'alice', orgs: ['acme-corp'], exp: Math.floor(Date.now() / 1000) + 1000 };
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  const hmac = crypto.createHmac('sha256', DASHBOARD_SECRET).update(JSON.stringify(payload)).digest('hex');
  const validCookie = `osg_session=${b64}.${hmac}`;

  const req = new MockReq('POST', { cookie: validCookie }, { action: 'compliance-token-mint' }, { org: 'other-org' });
  const res = new MockRes();
  
  req.resume();
  await exceptionsHandler(req, res);
  
  eq(res.statusCode, 403, 'should reject non-member org');
  const body = JSON.parse(res.body);
  eq(body.error, 'FORBIDDEN', 'forbidden code');
});

test('Compliance Evidence: returns signed exceptions list for valid token', async () => {
  // Generate Auditor key
  const auditorKey = signAuditorToken({ login: 'alice', org: 'acme-corp' }, DASHBOARD_SECRET);
  
  const req = new MockReq('GET', { authorization: `Bearer ${auditorKey}` }, { action: 'compliance-evidence', org: 'acme-corp' });
  const res = new MockRes();

  // Mock Supabase
  const mockSelect = {
    eq: (col, val) => {
      eq(col, 'owner', 'supabase owner filter');
      eq(val, 'acme-corp', 'supabase owner value');
      return {
        order: () => ({
          data: [
            { id: '1', owner: 'acme-corp', repo: 'app', status: 'approved', package_name: 'lodash', expires_at: new Date(Date.now() + 86400 * 1000).toISOString() }
          ],
          error: null
        })
      };
    }
  };
  
  const mockSb = {
    from: (table) => {
      eq(table, 'exceptions', 'table queried');
      return { select: () => mockSelect };
    }
  };

  process.env.SUPABASE_URL = 'https://mock.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-key';
  __resetSupabaseClientForTests();
  
  // Set RSA key for Ed25519 signing
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  
  process.env.OPENSOYCE_SIGNING_PRIVATE_KEY = privateKey;
  process.env.OPENSOYCE_SIGNING_PUBLIC_KEY = publicKey;

  req.resume();
  await exceptionsHandler(req, res);

  eq(res.statusCode, 200, 'evidence status code');
  const body = JSON.parse(res.body);
  eq(body.reportType, 'SOC2_COMPLIANCE_EVIDENCE', 'reportType');
  eq(body.org, 'acme-corp', 'org');
  eq(body.summary.total, 1, 'total exceptions');
  
  // Verify cryptographic signature
  const verifyResult = verifyReport(body, { publicKeyPem: publicKey });
  eq(verifyResult.valid, true, 'evidence report signature verify');
  eq(verifyResult.keyFingerprint, keyFingerprint(publicKey), 'key fingerprint');

  // Clean up
  delete process.env.OPENSOYCE_SIGNING_PRIVATE_KEY;
  delete process.env.OPENSOYCE_SIGNING_PUBLIC_KEY;
  __resetSupabaseClientForTests();
});

test('Compliance Evidence: rejects mismatched org request', async () => {
  // Token is for acme-corp
  const auditorKey = signAuditorToken({ login: 'alice', org: 'acme-corp' }, DASHBOARD_SECRET);
  
  // Querying for other-org
  const req = new MockReq('GET', { authorization: `Bearer ${auditorKey}` }, { action: 'compliance-evidence', org: 'other-org' });
  const res = new MockRes();

  req.resume();
  await exceptionsHandler(req, res);

  eq(res.statusCode, 403, 'should reject mismatched org');
  const body = JSON.parse(res.body);
  eq(body.error, 'FORBIDDEN', 'forbidden code');
});

console.log(`\nCompliance Evidence tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
