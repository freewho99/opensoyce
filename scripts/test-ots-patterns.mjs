#!/usr/bin/env node

import {
  detectOtsPatternsForRow,
  otsPatternVerdict,
  OTS_PATTERN_DEFINITIONS,
  OTS_PATTERN_PACKS,
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

test('high blast radius row warns', () => {
  const patterns = detectOtsPatternsForRow({
    package: 'react',
    version: '19.0.0',
    blastRadius: { tier: 'high', reason: '4.2M downstream dependents' },
  });

  ok(patterns.some((p) => p.patternId === 'high-blast-radius'), 'high blast radius pattern missing');
  eq(otsPatternVerdict(patterns), 'WARN', 'verdict');
});

test('every patternId emitted by the detector resolves to a catalog entry', () => {
  // Structural invariant. The previous audit found 4 emitted IDs that had
  // no matching catalog definition (known-vulnerability-exposure,
  // install-time-execution, dependency-confusion-risk, high-blast-radius),
  // causing /patterns/:id deep-links to 404. This test enumerates every
  // detector branch and asserts each emitted ID maps to a real definition.
  const fixtures = [
    // Critical vulnerability → known-vulnerability-exposure
    { row: { package: 'badpkg', version: '1.0.0', severity: 'critical', ids: ['CVE-2026-0001'] } },
    // Install script with remote signal → install-time-remote-execution
    { row: { package: 'native-helper', version: '1.0.0', hasInstallScript: true, capabilityProfile: { remoteExecution: true } } },
    // Install script without remote signal → install-time-execution
    { row: { package: 'native-helper-local', version: '1.0.0', hasInstallScript: true } },
    // Axios sandbox row → hidden-dependency-injection + others
    { row: { package: 'axios', version: '1.14.1' } },
    // Typosquat → lookalike-package-injection
    { row: { package: 'reqeust', version: '2.0.0' } },
    // Dependency confusion → dependency-confusion-risk
    { row: { package: '@internal/payments', version: '1.0.0', dependencyConfusion: { confidence: 'HIGH', reason: 'squat' } } },
    // Mismatch → source-package-mismatch
    { row: { package: 'mystery', version: '1.0.0', verified: false } },
    // Fresh release → fresh-release-cooldown-violation
    { row: { package: 'fresh', version: '0.0.1', publishAgeHours: 4 } },
    // CI + secrets + install → ci-secret-exposure-path
    { row: { package: 'risky-installer', version: '1.0.0', hasInstallScript: true }, ctx: { ci: true, hasSecrets: true } },
    // High blast radius → high-blast-radius
    { row: { package: 'react', version: '19.0.0', blastRadius: { tier: 'high', reason: '4.2M' } } },
  ];

  const definedIds = new Set(OTS_PATTERN_DEFINITIONS.map((d) => d.id));
  const emittedIds = new Set();
  for (const { row, ctx } of fixtures) {
    for (const pat of detectOtsPatternsForRow(row, ctx || {})) {
      emittedIds.add(pat.patternId);
    }
  }

  const missing = [...emittedIds].filter((id) => !definedIds.has(id));
  ok(missing.length === 0, `detector emits IDs not in catalog: ${missing.join(', ') || '(none)'}`);
});

test('every catalog patternId appears in exactly one pack', () => {
  // Structural invariant. Orphaned definitions (no pack) won't appear in
  // /patterns filter UI; duplicated definitions across packs would show
  // twice. This test catches both.
  const definedIds = OTS_PATTERN_DEFINITIONS.map((d) => d.id);
  const inPackCounts = new Map();
  for (const id of definedIds) inPackCounts.set(id, 0);
  for (const pack of OTS_PATTERN_PACKS) {
    for (const id of pack.patternIds) {
      if (!inPackCounts.has(id)) throw new Error(`pack ${pack.id} references undefined pattern ${id}`);
      inPackCounts.set(id, inPackCounts.get(id) + 1);
    }
  }
  const orphans = [...inPackCounts.entries()].filter(([, n]) => n === 0).map(([id]) => id);
  const dupes = [...inPackCounts.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  ok(orphans.length === 0, `catalog entries not in any pack: ${orphans.join(', ') || '(none)'}`);
  ok(dupes.length === 0, `catalog entries in multiple packs: ${dupes.join(', ') || '(none)'}`);
});

if (failed > 0) {
  process.exit(1);
}

console.log(`\nOTS pattern tests passed: ${passed}`);
