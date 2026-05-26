#!/usr/bin/env node

import {
  detectOtsPatternsForRow,
  otsPatternVerdict,
} from '../src/shared/otsPatterns.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
    passed += 1;
  } catch (err) {
    console.log(`FAIL ${name} -- ${err.message}`);
    failed += 1;
  }
}

function ok(value, msg) {
  if (!value) throw new Error(msg);
}

function eq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg}: expected ${expected}, got ${actual}`);
  }
}

test('critical CVE row triggers known vulnerability exposure block', () => {
  const patterns = detectOtsPatternsForRow({
    package: 'badpkg',
    version: '1.0.0',
    severity: 'critical',
    ids: ['CVE-2026-0001'],
  });

  ok(patterns.some((p) => p.patternId === 'known-vulnerability-exposure'), 'known vulnerability pattern missing');
  eq(otsPatternVerdict(patterns), 'BLOCK', 'verdict');
});

test('install script alone warns but does not block', () => {
  const patterns = detectOtsPatternsForRow({
    package: 'native-helper',
    version: '1.0.0',
    hasInstallScript: true,
  });

  ok(patterns.some((p) => p.patternId === 'install-time-execution'), 'install pattern missing');
  eq(otsPatternVerdict(patterns), 'WARN', 'verdict');
});

test('dependency confusion high confidence blocks', () => {
  const patterns = detectOtsPatternsForRow({
    package: '@internal/payments',
    version: '1.0.0',
    dependencyConfusion: {
      confidence: 'HIGH',
      reason: 'Active squat detected',
    },
  });

  ok(patterns.some((p) => p.patternId === 'dependency-confusion-risk'), 'dependency confusion pattern missing');
  eq(otsPatternVerdict(patterns), 'BLOCK', 'verdict');
});

test('CI with secrets plus install script blocks secret exposure path', () => {
  const patterns = detectOtsPatternsForRow(
    {
      package: 'risky-installer',
      version: '1.0.0',
      hasInstallScript: true,
    },
    {
      ci: true,
      hasSecrets: true,
    },
  );

  ok(patterns.some((p) => p.patternId === 'ci-secret-exposure-path'), 'CI secret exposure pattern missing');
  eq(otsPatternVerdict(patterns), 'BLOCK', 'verdict');
});

test('clean package triggers no patterns and allows', () => {
  const patterns = detectOtsPatternsForRow({
    package: 'react',
    version: '19.0.0',
    severity: 'low',
    license: 'MIT'
  });

  eq(patterns.length, 0, 'should have 0 patterns');
  eq(otsPatternVerdict(patterns), 'ALLOW', 'verdict');
});

if (failed > 0) {
  process.exit(1);
}

console.log(`\nOTS pattern tests passed: ${passed}`);
