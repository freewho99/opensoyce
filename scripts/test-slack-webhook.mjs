#!/usr/bin/env node
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import slackWebhookHandler from '../api/integrations/slack/webhook.js';
import { __resetSupabaseClientForTests } from '../api/_supabase.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
    passed += 1;
  } catch (e) {
    console.log(`FAIL  ${name} -- ${e.message}`);
    failed += 1;
  }
}

function eq(a, b, msg) {
  if (a !== b) {
    throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  }
}

// Mock Request Class
class MockReq extends EventEmitter {
  constructor(method, headers, bodyText) {
    super();
    this.method = method;
    this.headers = headers || {};
    this.bodyText = bodyText || '';
  }

  // Simulate readable stream behavior
  setEncoding() {}
  resume() {
    process.nextTick(() => {
      this.emit('data', Buffer.from(this.bodyText, 'utf8'));
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

// Helper to generate a valid Slack signature for testing
function generateSlackSignature(rawBody, timestamp, secret) {
  const sigBase = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto.createHmac('sha256', secret).update(sigBase).digest('hex');
  return `v0=${hmac}`;
}

test('Slack Webhook: rejects non-POST requests', async () => {
  const req = new MockReq('GET');
  const res = new MockRes();
  
  await slackWebhookHandler(req, res);
  
  eq(res.statusCode, 405, 'status');
  const parsed = JSON.parse(res.body);
  eq(parsed.error, 'METHOD_NOT_ALLOWED', 'error code');
});

test('Slack Webhook: parses valid payload and updates status', async () => {
  const secret = 'test-slack-secret';
  process.env.SLACK_SIGNING_SECRET = secret;
  
  const payload = {
    actions: [{ action_id: 'approve', value: '11111111-2222-3333-4444-555555555555' }],
    user: { name: 'alice' },
    response_url: 'https://mock.slack.com/actions/1234'
  };
  const bodyText = `payload=${encodeURIComponent(JSON.stringify(payload))}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = generateSlackSignature(bodyText, timestamp, secret);
  
  const req = new MockReq('POST', {
    'x-slack-signature': signature,
    'x-slack-request-timestamp': timestamp,
    'content-type': 'application/x-www-form-urlencoded'
  }, bodyText);
  const res = new MockRes();
  
  // Mock Supabase client
  const mockUpdate = {
    eq: (col, val) => {
      eq(col, 'id', 'eq col');
      eq(val, '11111111-2222-3333-4444-555555555555', 'eq val');
      return { error: null };
    }
  };
  
  const mockSelect = {
    eq: (col, val) => {
      eq(col, 'id', 'select eq col');
      return {
        maybeSingle: () => ({
          data: {
            id: '11111111-2222-3333-4444-555555555555',
            package_name: 'minimist',
            status: 'pending'
          },
          error: null
        })
      };
    }
  };
  
  const mockSb = {
    from: (table) => {
      if (table === 'exceptions') {
        return {
          select: (cols) => mockSelect,
          update: (fields) => {
            eq(fields.status, 'approved', 'update status');
            eq(fields.granted_by, 'slack:alice', 'update granted_by');
            return mockUpdate;
          }
        };
      }
      throw new Error(`unexpected table: ${table}`);
    }
  };
  
  // Inject mock supabase
  process.env.SUPABASE_URL = 'https://mock.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-key';
  __resetSupabaseClientForTests();
  
  // Override fetch for response_url testing
  let fetchCalled = false;
  globalThis.fetch = async (url, opts) => {
    if (url === 'https://mock.slack.com/actions/1234') {
      fetchCalled = true;
      eq(opts.method, 'POST', 'fetch method');
      const body = JSON.parse(opts.body);
      eq(body.replace_original, true, 'replace original');
      eq(body.text.includes('approved'), true, 'text contents');
      return { ok: true };
    }
    return { ok: false };
  };
  
  // Start stream
  req.resume();
  
  await slackWebhookHandler(req, res);
  
  eq(res.statusCode, 200, 'response code');
  const result = JSON.parse(res.body);
  eq(result.ok, true, 'result ok');
  eq(result.status, 'approved', 'result status');
  eq(fetchCalled, true, 'response_url was POSTed to');
  
  // Clean up env
  delete process.env.SLACK_SIGNING_SECRET;
  __resetSupabaseClientForTests();
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
