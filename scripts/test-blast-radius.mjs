#!/usr/bin/env node
/**
 * Test: blast radius engine (Phase 3).
 * Covers: blastRadiusTier, buildReverseDependencyIndex, attachBlastRadius.
 */

import { attachBlastRadius, __blastRadiusInternal } from '../src/shared/scanLockfile.js';

const { blastRadiusTier, buildReverseDependencyIndex, BLAST_RADIUS_TIERS } = __blastRadiusInternal;

let passed = 0;
let failed = 0;

function assert(desc, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✅ ${desc}`);
    passed++;
  } else {
    console.error(`  ❌ ${desc}`);
    console.error(`     Expected: ${JSON.stringify(expected)}`);
    console.error(`     Got:      ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
console.log('\n=== blastRadiusTier ===');

assert('direct dep with 15 rdeps → critical', blastRadiusTier(1, 15), 'critical');
assert('direct dep with 10 rdeps → critical (boundary)', blastRadiusTier(1, 10), 'critical');
assert('direct dep with 9 rdeps → high', blastRadiusTier(1, 9), 'high');
assert('depth=2 with 5 rdeps → high', blastRadiusTier(2, 5), 'high');
assert('depth=2 with 4 rdeps → medium', blastRadiusTier(2, 4), 'medium');
assert('depth=3 with 8 rdeps → medium (not critical: depth>1)', blastRadiusTier(3, 8), 'medium');
assert('depth=2 with 2 rdeps → medium', blastRadiusTier(2, 2), 'medium');
assert('depth=2 with 1 rdep → low', blastRadiusTier(2, 1), 'low');
assert('depth=2 with 0 rdeps → low', blastRadiusTier(2, 0), 'low');
assert('direct dep with 0 rdeps → low', blastRadiusTier(1, 0), 'low');

// ---------------------------------------------------------------------------
console.log('\n=== buildReverseDependencyIndex ===');

const mockLockfileObj = {
  lockfileVersion: 3,
  packages: {
    '': {
      dependencies: { express: '^4.18.0', lodash: '^4.17.21' },
    },
    'node_modules/express': {
      version: '4.18.2',
      dependencies: { accepts: '^1.3.8', 'body-parser': '^1.20.1' },
    },
    'node_modules/lodash': {
      version: '4.17.21',
      dependencies: {},
    },
    'node_modules/accepts': {
      version: '1.3.8',
      dependencies: { mime: '^1.6.0', negotiator: '^0.6.3' },
    },
    'node_modules/body-parser': {
      version: '1.20.1',
      dependencies: { accepts: '^1.3.8' },
    },
    'node_modules/mime': { version: '1.6.0', dependencies: {} },
    'node_modules/negotiator': { version: '0.6.3', dependencies: {} },
  },
};

const rdm = buildReverseDependencyIndex(mockLockfileObj);
assert('accepts has 2 rdeps (express + body-parser)', rdm.get('accepts') && rdm.get('accepts').size, 2);
assert('mime has 1 rdep (accepts)', rdm.get('mime') && rdm.get('mime').size, 1);
assert('lodash has 0 rdeps (not required by anyone)', rdm.get('lodash'), undefined);

// ---------------------------------------------------------------------------
console.log('\n=== attachBlastRadius ===');

const lockfileText = JSON.stringify(mockLockfileObj);
const fakeInventory = {
  format: 'npm-v3',
  ecosystem: 'npm',
  packages: [
    { name: 'express', versions: ['4.18.2'], direct: true },
    { name: 'lodash', versions: ['4.17.21'], direct: true },
    { name: 'accepts', versions: ['1.3.8'], direct: false },
    { name: 'mime', versions: ['1.6.0'], direct: false },
  ],
  totals: { totalPackages: 4 },
};

const result = attachBlastRadius(fakeInventory, lockfileText);

const exprPkg = result.packages.find((p) => p.name === 'express');
const acceptsPkg = result.packages.find((p) => p.name === 'accepts');
const lodashPkg = result.packages.find((p) => p.name === 'lodash');
const mimePkg = result.packages.find((p) => p.name === 'mime');

// express is a direct dep, 0 rdeps → low
assert('express: depth=1', exprPkg.blastRadius.depth, 1);
assert('express: rdeps=0 → low tier', exprPkg.blastRadius.tier, 'low');

// accepts: transitive (depth=2), 2 rdeps → medium
assert('accepts: depth=2', acceptsPkg.blastRadius.depth, 2);
assert('accepts: rdeps=2 → medium', acceptsPkg.blastRadius.tier, 'medium');
assert('accepts: reverseDependencyCount=2', acceptsPkg.blastRadius.reverseDependencyCount, 2);

// lodash: direct, 0 rdeps → low
assert('lodash: depth=1', lodashPkg.blastRadius.depth, 1);
assert('lodash: tier=low', lodashPkg.blastRadius.tier, 'low');

// mime: transitive, 1 rdep → low
assert('mime: tier=low (only 1 rdep)', mimePkg.blastRadius.tier, 'low');

// totals
assert('totals.blastRadiusCriticalCount=0', result.totals.blastRadiusCriticalCount, 0);
assert('totals.blastRadiusHighCount=0', result.totals.blastRadiusHighCount, 0);

// Test with many rdeps to hit critical/high tiers
const bigLockfile = {
  lockfileVersion: 3,
  packages: {
    '': { dependencies: { core: '^1.0.0' } },
    'node_modules/core': { version: '1.0.0', dependencies: {} },
    ...Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [
        `node_modules/consumer-${i}`,
        { version: '1.0.0', dependencies: { core: '^1.0.0' } },
      ]),
    ),
  },
};
const bigInventory = {
  format: 'npm-v3',
  ecosystem: 'npm',
  packages: [
    { name: 'core', versions: ['1.0.0'], direct: true },
  ],
  totals: {},
};
const bigResult = attachBlastRadius(bigInventory, JSON.stringify(bigLockfile));
const corePkg = bigResult.packages.find((p) => p.name === 'core');
assert('core with 12 rdeps, direct → critical', corePkg.blastRadius.tier, 'critical');
assert('blastRadiusCriticalCount=1', bigResult.totals.blastRadiusCriticalCount, 1);

// Test failure isolation: invalid lockfile text → empty reverse-dep index, blastRadius computed with 0 rdeps
// (the code only returns all-null when lockfileText is not a string)
const nullResult = attachBlastRadius(fakeInventory, 'not-json');
const allHaveBlastRadius = nullResult.packages.every((p) => p.blastRadius !== null);
assert('invalid lockfile text → blastRadius computed with 0 rdeps fallback', allHaveBlastRadius, true);

// Non-string lockfileText → all null
const nonStringResult = attachBlastRadius(fakeInventory, null);
const allNullNonString = nonStringResult.packages.every((p) => p.blastRadius === null);
assert('null lockfileText → all blastRadius null', allNullNonString, true);

// Test null inventory passthrough
const passthrough = attachBlastRadius(null, lockfileText);
assert('null inventory passes through as-is', passthrough, null);

// ---------------------------------------------------------------------------
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
