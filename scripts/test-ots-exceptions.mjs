#!/usr/bin/env node
/**
 * OTS Exception + Audit Trail — Unit Tests
 *
 * Tests all lifecycle transitions, audit chain, expiry checks, index helpers,
 * PR comment rendering, and signature round-trip.
 *
 * Plain Node. PASS/FAIL per case. Non-zero exit on any failure.
 * Signing tests are skipped gracefully when no test key is available.
 */

import {
  generateExceptionId,
  createExceptionRequest,
  approveException,
  denyException,
  revokeException,
  renewException,
  markExceptionExpired,
  markExceptionUsed,
  isExceptionExpired,
  isExceptionActive,
  findActiveException,
  toIndexEntry,
  upsertIndexEntry,
  appendAuditEvent,
  renderExceptionComment,
  renderBlockedComment,
  signRecord,
  verifyExceptionSignature,
  EXCEPTION_STATUS,
  AUDIT_ACTION,
} from '../src/shared/otsExceptions.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try { fn(); console.log(`PASS  ${name}`); passed += 1; }
  catch (e) { console.log(`FAIL  ${name} -- ${e.message}`); failed += 1; }
}
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function ok(c, msg) { if (!c) throw new Error(msg); }
function contains(str, needle, msg) {
  if (!str.includes(needle)) throw new Error(`${msg}: missing "${needle}"`);
}

// Shared fixture
const BASE_GATE_REF = {
  decision: 'AUTO-MERGE BLOCKED',
  tier: 4,
  tierName: 'Tier 4: Never Blind Auto-merge',
  topReason: 'Privileged category (Auth/Crypto/CI/CD) requires manual security owner approval',
};

const BASE_OPTS = {
  index: [],
  package: 'stripe',
  version: '5.0.1',
  fromVersion: '4.21.0',
  changeType: 'major',
  gateDecisionRef: BASE_GATE_REF,
  requestedBy: 'alice',
  justification: 'SCA token refresh. Payments service only.',
  durationDays: 14,
  prUrl: 'https://github.com/org/repo/pull/312',
  now: new Date('2026-05-27T03:00:00Z'),
};

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------
console.log('\n=== generateExceptionId ===');

test('empty index → OTS-EXC-YYYY-0001', () => {
  const id = generateExceptionId([], new Date('2026-05-27T00:00:00Z'));
  eq(id, 'OTS-EXC-2026-0001', 'first ID');
});

test('existing entries → increments correctly', () => {
  const index = [
    { id: 'OTS-EXC-2026-0001' },
    { id: 'OTS-EXC-2026-0003' }, // gap is fine
  ];
  const id = generateExceptionId(index, new Date('2026-05-27T00:00:00Z'));
  eq(id, 'OTS-EXC-2026-0004', 'next after 0003');
});

test('prior year entries do not affect current year sequence', () => {
  const index = [
    { id: 'OTS-EXC-2025-0099' },
    { id: 'OTS-EXC-2026-0002' },
  ];
  const id = generateExceptionId(index, new Date('2026-01-01T00:00:00Z'));
  eq(id, 'OTS-EXC-2026-0003', 'only counts current year');
});

// ---------------------------------------------------------------------------
// createExceptionRequest
// ---------------------------------------------------------------------------
console.log('\n=== createExceptionRequest ===');

test('creates a PENDING exception with correct fields', () => {
  const exc = createExceptionRequest(BASE_OPTS);
  eq(exc.status, EXCEPTION_STATUS.PENDING, 'status');
  eq(exc.package, 'stripe', 'package');
  eq(exc.version, '5.0.1', 'version');
  eq(exc.requestedBy, 'alice', 'requestedBy');
  eq(exc.durationDays, 14, 'durationDays');
  eq(exc.reviewedBy, null, 'reviewedBy null');
  eq(exc.expiresAt, null, 'expiresAt null');
  eq(exc.schemaVersion, 1, 'schemaVersion');
});

test('ID is generated correctly', () => {
  const exc = createExceptionRequest(BASE_OPTS);
  eq(exc.id, 'OTS-EXC-2026-0001', 'id');
});

test('audit history has one REQUESTED event', () => {
  const exc = createExceptionRequest(BASE_OPTS);
  eq(exc.history.length, 1, 'one history entry');
  eq(exc.history[0].action, AUDIT_ACTION.REQUESTED, 'action');
  eq(exc.history[0].actor, 'alice', 'actor');
});

test('default durationDays is 14 when not provided', () => {
  const exc = createExceptionRequest({ ...BASE_OPTS, durationDays: undefined });
  eq(exc.durationDays, 14, 'default duration');
});

test('throws when package missing', () => {
  let threw = false;
  try { createExceptionRequest({ ...BASE_OPTS, package: '' }); } catch { threw = true; }
  ok(threw, 'should throw on missing package');
});

test('throws when justification missing', () => {
  let threw = false;
  try { createExceptionRequest({ ...BASE_OPTS, justification: '' }); } catch { threw = true; }
  ok(threw, 'should throw on missing justification');
});

// ---------------------------------------------------------------------------
// approveException
// ---------------------------------------------------------------------------
console.log('\n=== approveException ===');

function makePending() {
  return createExceptionRequest(BASE_OPTS);
}

test('approve sets status to APPROVED', () => {
  const exc = approveException(makePending(), {
    reviewedBy: 'bob',
    conditions: ['Sandbox only'],
    now: new Date('2026-05-27T04:00:00Z'),
  });
  eq(exc.status, EXCEPTION_STATUS.APPROVED, 'status');
  eq(exc.reviewedBy, 'bob', 'reviewedBy');
  ok(exc.expiresAt !== null, 'expiresAt set');
  eq(exc.conditions[0], 'Sandbox only', 'conditions');
});

test('expiresAt is 14 days after approvedAt', () => {
  const approvedAt = new Date('2026-05-27T04:00:00Z');
  const exc = approveException(makePending(), { reviewedBy: 'bob', now: approvedAt });
  const expected = new Date(approvedAt.getTime() + 14 * 86400000).toISOString();
  eq(exc.expiresAt, expected, 'expiresAt');
});

test('audit history has REQUESTED + APPROVED', () => {
  const exc = approveException(makePending(), { reviewedBy: 'bob', now: new Date() });
  eq(exc.history.length, 2, 'two history entries');
  eq(exc.history[1].action, AUDIT_ACTION.APPROVED, 'second action');
});

test('throws when approving non-PENDING', () => {
  const approved = approveException(makePending(), { reviewedBy: 'bob', now: new Date() });
  let threw = false;
  try { approveException(approved, { reviewedBy: 'carol', now: new Date() }); } catch { threw = true; }
  ok(threw, 'cannot approve an already-approved exception');
});

// ---------------------------------------------------------------------------
// denyException
// ---------------------------------------------------------------------------
console.log('\n=== denyException ===');

test('deny sets status to DENIED with reason', () => {
  const exc = denyException(makePending(), {
    reviewedBy: 'bob',
    reason: 'Known regression in this version.',
    now: new Date('2026-05-27T04:00:00Z'),
  });
  eq(exc.status, EXCEPTION_STATUS.DENIED, 'status');
  eq(exc.denyReason, 'Known regression in this version.', 'denyReason');
  eq(exc.history.length, 2, 'two history entries');
  eq(exc.history[1].action, AUDIT_ACTION.DENIED, 'DENIED action');
});

test('throws when denying non-PENDING', () => {
  const denied = denyException(makePending(), { reviewedBy: 'bob', reason: 'no', now: new Date() });
  let threw = false;
  try { denyException(denied, { reviewedBy: 'carol', reason: 'x', now: new Date() }); } catch { threw = true; }
  ok(threw, 'cannot deny a non-PENDING exception');
});

// ---------------------------------------------------------------------------
// revokeException
// ---------------------------------------------------------------------------
console.log('\n=== revokeException ===');

function makeApproved() {
  return approveException(makePending(), { reviewedBy: 'bob', now: new Date('2026-05-27T04:00:00Z') });
}

test('revoke sets status to REVOKED', () => {
  const exc = revokeException(makeApproved(), { revokedBy: 'carol', reason: 'Security incident.', now: new Date() });
  eq(exc.status, EXCEPTION_STATUS.REVOKED, 'status');
  eq(exc.history[exc.history.length - 1].action, AUDIT_ACTION.REVOKED, 'last action');
});

test('throws when revoking non-APPROVED', () => {
  let threw = false;
  try { revokeException(makePending(), { revokedBy: 'carol', now: new Date() }); } catch { threw = true; }
  ok(threw, 'cannot revoke a PENDING exception');
});

// ---------------------------------------------------------------------------
// renewException
// ---------------------------------------------------------------------------
console.log('\n=== renewException ===');

test('renew extends expiresAt', () => {
  const original = makeApproved();
  const renewedAt = new Date('2026-06-01T00:00:00Z');
  const exc = renewException(original, { renewedBy: 'bob', durationDays: 30, now: renewedAt });
  const expected = new Date(renewedAt.getTime() + 30 * 86400000).toISOString();
  eq(exc.expiresAt, expected, 'extended expiresAt');
  eq(exc.durationDays, 30, 'updated durationDays');
  eq(exc.history[exc.history.length - 1].action, AUDIT_ACTION.RENEWED, 'RENEWED action');
});

// ---------------------------------------------------------------------------
// markExceptionExpired / markExceptionUsed
// ---------------------------------------------------------------------------
console.log('\n=== markExceptionExpired / markExceptionUsed ===');

test('markExceptionExpired sets status to EXPIRED', () => {
  const exc = markExceptionExpired(makeApproved(), { now: new Date() });
  eq(exc.status, EXCEPTION_STATUS.EXPIRED, 'status');
  eq(exc.history[exc.history.length - 1].action, AUDIT_ACTION.EXPIRED, 'action');
});

test('markExceptionUsed appends USED event without changing status', () => {
  const exc = markExceptionUsed(makeApproved(), { prUrl: 'https://x.com', mergedBy: 'alice' });
  eq(exc.status, EXCEPTION_STATUS.APPROVED, 'status unchanged');
  eq(exc.history[exc.history.length - 1].action, AUDIT_ACTION.USED, 'USED action');
  eq(exc.history[exc.history.length - 1].metadata.prUrl, 'https://x.com', 'prUrl in metadata');
});

// ---------------------------------------------------------------------------
// isExceptionExpired / isExceptionActive
// ---------------------------------------------------------------------------
console.log('\n=== isExceptionExpired / isExceptionActive ===');

test('isExceptionExpired: future expiresAt → false', () => {
  const exc = makeApproved(); // expiresAt = 14d from 2026-05-27
  const checkAt = new Date('2026-05-28T00:00:00Z'); // 1 day later
  eq(isExceptionExpired(exc, checkAt), false, 'not expired');
});

test('isExceptionExpired: past expiresAt → true', () => {
  const exc = makeApproved();
  const checkAt = new Date('2026-07-01T00:00:00Z'); // 35 days later
  eq(isExceptionExpired(exc, checkAt), true, 'expired');
});

test('isExceptionActive: APPROVED + not expired → true', () => {
  const exc = makeApproved();
  eq(isExceptionActive(exc, new Date('2026-05-28T00:00:00Z')), true, 'active');
});

test('isExceptionActive: APPROVED + expired → false', () => {
  const exc = makeApproved();
  eq(isExceptionActive(exc, new Date('2026-07-01T00:00:00Z')), false, 'expired = not active');
});

test('isExceptionActive: PENDING → false', () => {
  eq(isExceptionActive(makePending()), false, 'PENDING is not active');
});

test('isExceptionActive: REVOKED → false', () => {
  const exc = revokeException(makeApproved(), { revokedBy: 'carol', now: new Date() });
  eq(isExceptionActive(exc), false, 'REVOKED is not active');
});

test('isExceptionActive: null → false', () => {
  eq(isExceptionActive(null), false, 'null is not active');
});

// ---------------------------------------------------------------------------
// findActiveException
// ---------------------------------------------------------------------------
console.log('\n=== findActiveException ===');

test('finds matching active exception', () => {
  const exc = makeApproved();
  const index = [toIndexEntry(exc)];
  const found = findActiveException(index, 'stripe', '5.0.1', new Date('2026-05-28T00:00:00Z'));
  ok(found !== null, 'found');
  eq(found.id, exc.id, 'correct id');
});

test('returns null when package does not match', () => {
  const exc = makeApproved();
  const index = [toIndexEntry(exc)];
  const found = findActiveException(index, 'lodash', '5.0.1', new Date('2026-05-28T00:00:00Z'));
  eq(found, null, 'not found for different package');
});

test('returns null when version does not match', () => {
  const exc = makeApproved();
  const index = [toIndexEntry(exc)];
  const found = findActiveException(index, 'stripe', '5.0.2', new Date('2026-05-28T00:00:00Z'));
  eq(found, null, 'not found for different version');
});

test('returns null when exception is expired', () => {
  const exc = makeApproved();
  const index = [toIndexEntry(exc)];
  const found = findActiveException(index, 'stripe', '5.0.1', new Date('2026-07-01T00:00:00Z'));
  eq(found, null, 'expired entry not returned');
});

test('returns null on empty index', () => {
  eq(findActiveException([], 'stripe', '5.0.1'), null, 'empty index');
});

// ---------------------------------------------------------------------------
// upsertIndexEntry
// ---------------------------------------------------------------------------
console.log('\n=== upsertIndexEntry ===');

test('insert into empty index', () => {
  const exc = makeApproved();
  const index = upsertIndexEntry([], exc);
  eq(index.length, 1, 'one entry');
  eq(index[0].id, exc.id, 'correct id');
});

test('update existing entry', () => {
  const exc = makeApproved();
  let index = upsertIndexEntry([], exc);
  const revoked = revokeException(exc, { revokedBy: 'carol', now: new Date() });
  index = upsertIndexEntry(index, revoked);
  eq(index.length, 1, 'still one entry');
  eq(index[0].status, EXCEPTION_STATUS.REVOKED, 'status updated');
});

// ---------------------------------------------------------------------------
// appendAuditEvent (immutable check)
// ---------------------------------------------------------------------------
console.log('\n=== appendAuditEvent (immutability) ===');

test('appendAuditEvent does not mutate the original', () => {
  const exc = makePending();
  const original_len = exc.history.length;
  const updated = appendAuditEvent(exc, { timestamp: new Date().toISOString(), actor: 'x', action: 'USED', metadata: {} });
  eq(exc.history.length, original_len, 'original unchanged');
  eq(updated.history.length, original_len + 1, 'updated has new event');
});

// ---------------------------------------------------------------------------
// PR comment rendering
// ---------------------------------------------------------------------------
console.log('\n=== renderExceptionComment / renderBlockedComment ===');

test('renderExceptionComment contains key fields', () => {
  const exc = makeApproved();
  const md = renderExceptionComment(exc);
  contains(md, exc.id, 'contains exception id');
  contains(md, 'stripe@5.0.1', 'contains package@version');
  contains(md, '@bob', 'contains reviewer');
  contains(md, 'OTS Gate — Exception Active', 'header');
  contains(md, '.ots-exceptions/', 'audit record link');
});

test('renderBlockedComment contains key fields', () => {
  const md = renderBlockedComment({
    packageName: 'stripe',
    version: '5.0.1',
    tierName: 'Tier 4: Never Blind Auto-merge',
    topReason: 'Auth/Crypto requires manual approval',
  });
  contains(md, 'OTS Gate — Blocked', 'header');
  contains(md, 'stripe@5.0.1', 'package@version');
  contains(md, 'ots-exception.mjs request', 'CLI hint');
  contains(md, 'Feature still ships. Risk does not.', 'tagline');
});

// ---------------------------------------------------------------------------
// Signing round-trip (skipped if no test key available)
// ---------------------------------------------------------------------------
console.log('\n=== Signing round-trip ===');

// Generate a throwaway Ed25519 key pair for tests using node:crypto.
let testPrivKey = null;
let testPubKey = null;
try {
  const crypto = await import('node:crypto');
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  testPrivKey = privateKey.export({ type: 'pkcs8', format: 'pem' });
  testPubKey = publicKey.export({ type: 'spki', format: 'pem' });
} catch {
  console.log('SKIP  signing tests — crypto unavailable');
}

if (testPrivKey && testPubKey) {
  test('signRecord + verifyExceptionSignature round-trip', () => {
    const pending = makePending();
    const approved = approveException(pending, { reviewedBy: 'bob', now: new Date() });
    const signed = signRecord(approved, { privateKeyPem: testPrivKey, publicKeyPem: testPubKey });
    ok(signed.signature !== null, 'signature present');
    const result = verifyExceptionSignature(signed, { publicKeyPem: testPubKey });
    eq(result.valid, true, 'signature valid');
  });

  test('tampered exception fails verification', () => {
    const signed = signRecord(
      approveException(makePending(), { reviewedBy: 'bob', now: new Date() }),
      { privateKeyPem: testPrivKey, publicKeyPem: testPubKey },
    );
    // Tamper: change the justification after signing.
    const tampered = { ...signed, justification: 'TAMPERED' };
    const result = verifyExceptionSignature(tampered, { publicKeyPem: testPubKey });
    eq(result.valid, false, 'tampered exception fails');
  });

  test('missing signature returns valid:false', () => {
    const exc = approveException(makePending(), { reviewedBy: 'bob', now: new Date() });
    const result = verifyExceptionSignature(exc, { publicKeyPem: testPubKey });
    eq(result.valid, false, 'unsigned fails verification');
  });
}

// ---------------------------------------------------------------------------
// Wrap-up
// ---------------------------------------------------------------------------
console.log('');
console.log(`OTS Exception tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
