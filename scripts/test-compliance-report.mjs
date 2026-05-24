#!/usr/bin/env node
/**
 * Test: SOC 2 Compliance Report generation, verification, and signing (Phase 5).
 * Covers: JCS canonicalization, Ed25519 signing, verification, and exception classification.
 */

import { signReport, verifyReport, keyFingerprint } from '../src/shared/reportSigning.js';
import crypto from 'node:crypto';
import assert from 'node:assert';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${name}`);
    console.error(err);
    failed++;
  }
}

// Helper to generate dynamic Ed25519 keys in memory
function generateEd25519KeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  return { publicKeyPem: publicKey, privateKeyPem: privateKey };
}

const { publicKeyPem, privateKeyPem } = generateEd25519KeyPair();

const mockReport = {
  reportType: 'SOC2_COMPLIANCE_AUDIT',
  owner: 'acme-corp',
  repo: 'finance-api',
  generatedAt: new Date().toISOString(),
  generatedBy: 'auditor-user',
  summary: {
    total: 3,
    active: 2,
    expired: 1,
    revoked: 0,
    pending: 0
  },
  policy: {
    source: 'preset+org',
    preset: 'soc2',
    orgPolicyRepo: 'acme-corp/opensoyce-policy',
    resolved: {
      block: ['graveyard', 'risky'],
      warn: ['watchlist'],
      allow: ['use-ready', 'stable', 'forkable']
    }
  },
  exceptions: [
    {
      id: 'uuid-1',
      package_name: 'lodash',
      ecosystem: 'npm',
      reason: 'Approved for development phase only.',
      expires_at: new Date(Date.now() + 86400 * 1000).toISOString(),
      granted_by: 'lead-dev',
      created_at: new Date().toISOString(),
      revoked_at: null,
      status: 'approved'
    },
    {
      id: 'uuid-2',
      package_name: 'minimist',
      ecosystem: 'npm',
      reason: 'Benign prototype pollution.',
      expires_at: new Date(Date.now() - 86400 * 1000).toISOString(),
      granted_by: 'security-admin',
      created_at: new Date().toISOString(),
      revoked_at: null,
      status: 'approved'
    }
  ]
};

// ===========================================================================
console.log('=== reportSigning & verification tests ===');

test('signReport embeds valid Ed25519 signature', () => {
  const signed = signReport(mockReport, {
    privateKeyPem,
    publicKeyPem,
  });

  assert(signed.signature, 'Signature field is missing');
  assert.strictEqual(signed.signature.algorithm, 'Ed25519');
  assert(signed.signature.signature, 'Signature bytes are missing');
  assert.strictEqual(signed.signature.keyFingerprint, keyFingerprint(publicKeyPem));
});

test('verifyReport validates signed report correctly', () => {
  const signed = signReport(mockReport, {
    privateKeyPem,
    publicKeyPem,
  });

  const verification = verifyReport(signed, { publicKeyPem });
  assert.strictEqual(verification.valid, true, `Verification failed: ${verification.reason}`);
  assert.strictEqual(verification.keyFingerprint, keyFingerprint(publicKeyPem));
});

test('verifyReport fails if payload fields are tampered with', () => {
  const signed = signReport(mockReport, {
    privateKeyPem,
    publicKeyPem,
  });

  // Tamper with the payload
  const tampered = { ...signed, repo: 'tampered-repo-name' };
  
  const verification = verifyReport(tampered, { publicKeyPem });
  assert.strictEqual(verification.valid, false, 'Verification should have failed on tampered payload');
  assert.strictEqual(verification.reason, 'signature does not match canonical report bytes');
});

test('verifyReport fails with mismatched public key', () => {
  const signed = signReport(mockReport, {
    privateKeyPem,
    publicKeyPem,
  });

  // Generate another key pair
  const { publicKeyPem: secondaryPublic } = generateEd25519KeyPair();

  const verification = verifyReport(signed, { publicKeyPem: secondaryPublic });
  assert.strictEqual(verification.valid, false, 'Verification should have failed on mismatched key');
  assert.strictEqual(verification.reason, 'signature does not match canonical report bytes');
});

// ===========================================================================
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
