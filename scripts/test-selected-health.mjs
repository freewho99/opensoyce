#!/usr/bin/env node
/**
 * Scanner v3b -- selectHealthCandidates() verification.
 *
 * Pure-function tests. Mirrors scripts/test-scan-inventory.mjs in style.
 * Each test prints PASS/FAIL with a one-line reason; non-zero exit on any
 * failure.
 */
import { selectHealthCandidates } from '../src/shared/selectHealthCandidates.js';

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

function eq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function deepEq(actual, expected, msg) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

/** Build a minimal inventory shape. Defaults make all packages "boring":
 * direct=false, scope='unknown', one version, hasLicense+hasRepository true.
 * Override per-package via opts. */
function inv(packages) {
  return {
    format: 'npm-v3',
    packages: packages.map(p => ({
      name: p.name,
      versions: p.versions || ['1.0.0'],
      direct: p.direct ?? false,
      scope: p.scope ?? 'unknown',
      hasLicense: p.hasLicense ?? true,
      hasRepository: p.hasRepository ?? true,
      ...(p.fanIn !== undefined ? { fanIn: p.fanIn } : {}),
    })),
    totals: {},
  };
}

// 1. Vulnerable excluded
test('vulnerable packages are excluded from selection', () => {
  const inventory = inv([
    { name: 'axios', direct: true, scope: 'prod' },
    { name: 'lodash', direct: true, scope: 'prod' },
    { name: 'minimist', direct: true, scope: 'prod' },
  ]);
  const out = selectHealthCandidates({
    inventory,
    vulnerablePackageNames: new Set(['lodash']),
    budget: 25,
  });
  eq(out.selected.length, 2, 'selected count');
  eq(out.selected.some(s => s.package === 'lodash'), false, 'lodash not selected');
  eq(out.qualifyingTotal, 2, 'qualifyingTotal excludes vulnerable');
});

// 2. Priority order across tiers
test('priority order: direct-prod, then direct-dev, then multi-version, etc.', () => {
  const inventory = inv([
    { name: 'prod-pkg', direct: true, scope: 'prod' },
    { name: 'dev-pkg', direct: true, scope: 'dev' },
    { name: 'multi-pkg', direct: false, scope: 'unknown', versions: ['1.0.0', '2.0.0'] },
    { name: 'no-repo-pkg', direct: false, scope: 'unknown', hasRepository: false },
  ]);
  const out = selectHealthCandidates({
    inventory,
    vulnerablePackageNames: new Set(),
    budget: 2,
  });
  eq(out.selected.length, 2, 'budget honored');
  eq(out.selected[0].package, 'prod-pkg', 'first is direct-prod');
  eq(out.selected[0].primaryReason, 'DIRECT_PROD', 'first reason');
  eq(out.selected[1].package, 'dev-pkg', 'second is direct-dev');
  eq(out.selected[1].primaryReason, 'DIRECT_DEV', 'second reason');
  eq(out.skippedBudget, 2, 'skippedBudget counts multi-pkg + no-repo-pkg');
  eq(out.qualifyingTotal, 4, 'qualifyingTotal counts all four');
});

// 3. Alphabetical tiebreak within a tier
test('within tier, tiebreak alphabetical (axios before zlib)', () => {
  const inventory = inv([
    { name: 'zlib', direct: true, scope: 'prod' },
    { name: 'axios', direct: true, scope: 'prod' },
  ]);
  const out = selectHealthCandidates({
    inventory,
    vulnerablePackageNames: new Set(),
    budget: 25,
  });
  eq(out.selected.length, 2, 'both selected');
  eq(out.selected[0].package, 'axios', 'axios first');
  eq(out.selected[1].package, 'zlib', 'zlib second');
});

// 4. Budget cap with overflow
test('40 direct-prod, budget 25 -> 25 selected, 15 skipped, 40 qualifying', () => {
  const pkgs = [];
  for (let i = 0; i < 40; i++) {
    // Zero-pad so alpha sort is deterministic and obvious.
    pkgs.push({ name: `pkg-${String(i).padStart(2, '0')}`, direct: true, scope: 'prod' });
  }
  const out = selectHealthCandidates({
    inventory: inv(pkgs),
    vulnerablePackageNames: new Set(),
    budget: 25,
  });
  eq(out.selected.length, 25, 'selected length === budget');
  eq(out.skippedBudget, 15, 'skippedBudget');
  eq(out.qualifyingTotal, 40, 'qualifyingTotal');
  eq(out.selected[0].package, 'pkg-00', 'first by alpha');
  eq(out.selected[24].package, 'pkg-24', 'last by alpha');
});

// 5. Secondary reasons captured
test('direct-prod with multi-version: primaryReason=DIRECT_PROD, secondaryReasons includes MULTI_VERSION', () => {
  const inventory = inv([
    { name: 'busy-pkg', direct: true, scope: 'prod', versions: ['1.0.0', '1.1.0', '2.0.0'] },
  ]);
  const out = selectHealthCandidates({
    inventory,
    vulnerablePackageNames: new Set(),
    budget: 25,
  });
  eq(out.selected.length, 1, 'one selected');
  eq(out.selected[0].primaryReason, 'DIRECT_PROD', 'primary');
  eq(out.selected[0].secondaryReasons.includes('MULTI_VERSION'), true, 'secondary includes MULTI_VERSION');
});

// 6. Empty inventory
test('empty inventory returns zeroes', () => {
  const out = selectHealthCandidates({
    inventory: inv([]),
    vulnerablePackageNames: new Set(),
    budget: 25,
  });
  deepEq(out.selected, [], 'selected empty');
  eq(out.skippedBudget, 0, 'skippedBudget');
  eq(out.qualifyingTotal, 0, 'qualifyingTotal');
});

// 7. All vulnerable -> none selected
test('every package vulnerable -> selected empty', () => {
  const inventory = inv([
    { name: 'a', direct: true, scope: 'prod' },
    { name: 'b', direct: true, scope: 'dev' },
  ]);
  const out = selectHealthCandidates({
    inventory,
    vulnerablePackageNames: new Set(['a', 'b']),
    budget: 25,
  });
  eq(out.selected.length, 0, 'selected empty');
  eq(out.qualifyingTotal, 0, 'qualifyingTotal');
});

// 8. HIGH_FAN_IN tier gracefully skipped when fan-in data absent
test('no fan-in field on any row -> no HIGH_FAN_IN rows surface and no crash', () => {
  const inventory = inv([
    { name: 'prod-a', direct: true, scope: 'prod' },
    { name: 'trans-b', direct: false, scope: 'unknown' },     // no fan-in, no other reason
    { name: 'trans-c', direct: false, scope: 'unknown', hasRepository: false }, // IDENTITY_UNRESOLVED tier
  ]);
  const out = selectHealthCandidates({
    inventory,
    vulnerablePackageNames: new Set(),
    budget: 25,
  });
  eq(out.selected.some(s => s.primaryReason === 'HIGH_FAN_IN'), false, 'no HIGH_FAN_IN rows');
  // prod-a qualifies as DIRECT_PROD; trans-c qualifies as IDENTITY_UNRESOLVED;
  // trans-b qualifies for nothing.
  eq(out.selected.length, 2, 'two selected (no fan-in inflation)');
});

console.log('');
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
