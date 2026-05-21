#!/usr/bin/env node
/**
 * Signed reports v0 — reportSigning unit tests.
 *
 * Plain Node, PASS/FAIL per case, non-zero exit on any failure.
 * Tests generate an Ed25519 keypair in-process — no fixture key, no network.
 */

import crypto from 'node:crypto';
import {
  canonicalizeReport,
  signReport,
  verifyReport,
  keyFingerprint,
  detectSignatureLocation,
  __internal,
} from '../src/shared/reportSigning.js';

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

function makeKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    publicKeyPem: publicKey.export({ format: 'pem', type: 'spki' }).toString(),
    privateKeyPem: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
  };
}

// ---------------------------------------------------------------------------
// 1. Canonicalize is deterministic — key order does not matter.
test('canonicalize: key order does not affect canonical bytes', () => {
  const a = canonicalizeReport({ b: 2, a: 1, c: { y: 2, x: 1 } });
  const b = canonicalizeReport({ a: 1, c: { x: 1, y: 2 }, b: 2 });
  eq(a.toString('utf8'), b.toString('utf8'), 'canonical bytes match');
  // Spot-check sorted order:
  eq(a.toString('utf8'), '{"a":1,"b":2,"c":{"x":1,"y":2}}', 'sorted key order');
});

// ---------------------------------------------------------------------------
// 2. Roundtrip — sign, then verify with the matching public key.
test('roundtrip: sign + verify with matching public key returns valid=true', () => {
  const { publicKeyPem, privateKeyPem } = makeKeypair();
  const report = { schemaVersion: 1, decision: { label: 'CLEAN' }, totals: { knownVulnerabilities: 0 } };
  const signed = signReport(report, { privateKeyPem });
  ok(signed.signature, 'signature embedded');
  eq(signed.signature.algorithm, 'Ed25519', 'algorithm field');
  ok(typeof signed.signature.signature === 'string' && signed.signature.signature.length > 0, 'signature is string');
  ok(typeof signed.signature.signedAt === 'string' && signed.signature.signedAt.includes('T'), 'signedAt iso');
  ok(typeof signed.signature.keyFingerprint === 'string' && /^[0-9a-f]{64}$/.test(signed.signature.keyFingerprint), 'fingerprint is sha256 hex');
  const result = verifyReport(signed, { publicKeyPem });
  eq(result.valid, true, 'valid roundtrip');
  eq(result.keyFingerprint, signed.signature.keyFingerprint, 'fingerprint surfaced');
});

// ---------------------------------------------------------------------------
// 3. Tampered report — modifying a field after signing invalidates.
test('tampered: post-sign mutation returns valid=false', () => {
  const { publicKeyPem, privateKeyPem } = makeKeypair();
  const report = { schemaVersion: 1, totals: { knownVulnerabilities: 0 } };
  const signed = signReport(report, { privateKeyPem });
  // Tamper:
  const tampered = JSON.parse(JSON.stringify(signed));
  tampered.totals.knownVulnerabilities = 9999;
  const result = verifyReport(tampered, { publicKeyPem });
  eq(result.valid, false, 'tampered report rejected');
  ok(typeof result.reason === 'string' && result.reason.length > 0, 'reason present');
});

// ---------------------------------------------------------------------------
// 4. Wrong public key — sign with A, verify with B.
test('wrong key: verify with mismatched public key returns valid=false', () => {
  const a = makeKeypair();
  const b = makeKeypair();
  const signed = signReport({ schemaVersion: 1 }, { privateKeyPem: a.privateKeyPem });
  const result = verifyReport(signed, { publicKeyPem: b.publicKeyPem });
  eq(result.valid, false, 'wrong key rejected');
  ok(result.reason && result.reason.includes('does not match'), 'reason mentions mismatch');
});

// ---------------------------------------------------------------------------
// 5. Missing signature field.
test('missing signature: report with no `signature` field → valid=false reason="no signature"', () => {
  const { publicKeyPem } = makeKeypair();
  const result = verifyReport({ schemaVersion: 1 }, { publicKeyPem });
  eq(result.valid, false, 'missing signature rejected');
  eq(result.reason, 'no signature', 'reason text');
});

// ---------------------------------------------------------------------------
// 6. Malformed signature — not valid base64.
test('malformed signature: not-base64 → valid=false', () => {
  const { publicKeyPem } = makeKeypair();
  const bad = {
    schemaVersion: 1,
    signature: { algorithm: 'Ed25519', signature: 'not base64!! @@@', signedAt: '2026-01-01T00:00:00Z', keyFingerprint: 'x' },
  };
  const result = verifyReport(bad, { publicKeyPem });
  eq(result.valid, false, 'malformed sig rejected');
});

// ---------------------------------------------------------------------------
// 7. SARIF location — signature lives at runs[0].properties.signature.
test('SARIF: signature placed at runs[0].properties.signature and verifies', () => {
  const { publicKeyPem, privateKeyPem } = makeKeypair();
  const sarif = {
    version: '2.1.0',
    $schema: 'https://example/sarif-2.1.0.json',
    runs: [{
      tool: { driver: { name: 'OpenSoyce', version: '0.1.0' } },
      results: [],
      properties: { decision: { label: 'CLEAN', reason: null } },
    }],
  };
  const loc = detectSignatureLocation(sarif);
  eq(loc, 'sarif-run0', 'detect SARIF location');
  const signed = signReport(sarif, { privateKeyPem });
  ok(!signed.signature, 'no top-level signature on SARIF');
  ok(signed.runs[0].properties.signature, 'signature inside runs[0].properties');
  eq(signed.runs[0].properties.signature.algorithm, 'Ed25519', 'algorithm');
  const result = verifyReport(signed, { publicKeyPem });
  eq(result.valid, true, 'SARIF roundtrip');
});

// ---------------------------------------------------------------------------
// 8. keyFingerprint deterministic.
test('keyFingerprint: same key → same fingerprint', () => {
  const { publicKeyPem } = makeKeypair();
  const a = keyFingerprint(publicKeyPem);
  const b = keyFingerprint(publicKeyPem);
  eq(a, b, 'fingerprint matches across calls');
  ok(/^[0-9a-f]{64}$/.test(a), 'sha256 hex');
  const { publicKeyPem: other } = makeKeypair();
  const c = keyFingerprint(other);
  ok(a !== c, 'different keys → different fingerprints');
});

// ---------------------------------------------------------------------------
// 9. Ed25519 is deterministic — signing the same payload twice produces an
// identical signature. (RFC 8032 mandates deterministic signing.)
test('Ed25519 deterministic: same payload + key → same signature bytes', () => {
  const { privateKeyPem, publicKeyPem } = makeKeypair();
  const report = { schemaVersion: 1, decision: { label: 'CLEAN' } };
  // Fix `now` so the signedAt field is the same in both runs (otherwise
  // canonicalization differs and the signatures legitimately diverge).
  const fixedNow = () => '2026-05-14T00:00:00.000Z';
  const a = signReport(report, { privateKeyPem, now: fixedNow });
  const b = signReport(report, { privateKeyPem, now: fixedNow });
  eq(a.signature.signature, b.signature.signature, 'Ed25519 signatures identical');
  // Both still verify.
  eq(verifyReport(a, { publicKeyPem }).valid, true, 'a verifies');
  eq(verifyReport(b, { publicKeyPem }).valid, true, 'b verifies');
});

// ---------------------------------------------------------------------------
// 10. Empty report signs + verifies.
test('empty report: {} signs and verifies', () => {
  const { publicKeyPem, privateKeyPem } = makeKeypair();
  const signed = signReport({}, { privateKeyPem });
  const result = verifyReport(signed, { publicKeyPem });
  eq(result.valid, true, 'empty report valid');
});

// ---------------------------------------------------------------------------
// 11. Unicode keys / values.
test('unicode: emoji + Cyrillic field values roundtrip', () => {
  const { publicKeyPem, privateKeyPem } = makeKeypair();
  const report = {
    schemaVersion: 1,
    notes: 'привет, мир 🦀 — рагнарёк',
    deep: { 'ключ': 'значение', emoji: '✅ 🔐 🦀' },
  };
  const signed = signReport(report, { privateKeyPem });
  const result = verifyReport(signed, { publicKeyPem });
  eq(result.valid, true, 'unicode roundtrip');
});

// ---------------------------------------------------------------------------
// 12. canonicalizeReport strips the signature field before signing.
test('canonicalize: strips top-level signature before producing bytes', () => {
  const bytesA = canonicalizeReport({ a: 1, signature: { x: 1 } });
  const bytesB = canonicalizeReport({ a: 1 });
  eq(bytesA.toString('utf8'), bytesB.toString('utf8'), 'signature stripped');
});

// ---------------------------------------------------------------------------
// 13. canonicalizeReport strips the SARIF signature before producing bytes.
test('canonicalize SARIF: strips runs[0].properties.signature', () => {
  const a = {
    version: '2.1.0', runs: [{ tool: { driver: { name: 'x' } }, results: [], properties: { decision: 'CLEAN', signature: { x: 1 } } }],
  };
  const b = {
    version: '2.1.0', runs: [{ tool: { driver: { name: 'x' } }, results: [], properties: { decision: 'CLEAN' } }],
  };
  eq(canonicalizeReport(a, 'sarif-run0').toString('utf8'), canonicalizeReport(b, 'sarif-run0').toString('utf8'), 'SARIF strip');
});

// ---------------------------------------------------------------------------
// 14. signReport does not mutate the input.
test('immutability: signReport returns a new object, does not mutate input', () => {
  const { privateKeyPem } = makeKeypair();
  const input = { a: 1 };
  const before = JSON.stringify(input);
  signReport(input, { privateKeyPem });
  eq(JSON.stringify(input), before, 'input unchanged');
});

// ---------------------------------------------------------------------------
// 15. Sanity check on internal helpers.
test('internal: withoutSignature drops only the signature field', () => {
  const { withoutSignature } = __internal;
  const obj = { a: 1, signature: { x: 1 } };
  const stripped = withoutSignature(obj, 'top-level');
  eq(stripped.signature, undefined, 'signature dropped');
  eq(stripped.a, 1, 'other fields preserved');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
