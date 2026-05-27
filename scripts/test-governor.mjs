#!/usr/bin/env node
/**
 * Automerge Governor & Dependency Firewall Policy Tests
 *
 * Plain Node, PASS/FAIL per case, non-zero exit on any failure.
 * All assessAutomergePolicy calls are now async (awaited).
 */
import { classifyDependency, assessAutomergePolicy } from '../src/shared/governor.js';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
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

// --- Risk Tiering Classification Tests ---

await test('classifyDependency("@types/react") -> Tier 0 (Safe-ish)', () => {
  const result = classifyDependency('@types/react');
  eq(result.tier, 0, 'React types tier');
  eq(result.name, 'Tier 0: Safe-ish Auto-merge', 'React types name');
});

await test('classifyDependency("eslint-config-airbnb") -> Tier 0 (Safe-ish)', () => {
  const result = classifyDependency('eslint-config-airbnb');
  eq(result.tier, 0, 'eslint config tier');
});

await test('classifyDependency("lodash") -> Tier 1 (Normal app dependency)', () => {
  const result = classifyDependency('lodash');
  eq(result.tier, 1, 'lodash tier');
  eq(result.name, 'Tier 1: Normal App Dependency', 'lodash name');
});

await test('classifyDependency("vite") -> Tier 2 (Build-chain)', () => {
  const result = classifyDependency('vite');
  eq(result.tier, 2, 'vite tier');
  eq(result.name, 'Tier 2: Build-chain', 'vite name');
});

await test('classifyDependency("typescript") -> Tier 2 (Build-chain)', () => {
  const result = classifyDependency('typescript');
  eq(result.tier, 2, 'typescript tier');
});

await test('classifyDependency("aws-cli") -> Tier 3 (Privileged dev tool)', () => {
  const result = classifyDependency('aws-cli');
  eq(result.tier, 3, 'aws-cli tier');
  eq(result.name, 'Tier 3: Privileged Dev Tool', 'aws-cli name');
});

await test('classifyDependency("firebase-tools") -> Tier 3 (Privileged dev tool)', () => {
  const result = classifyDependency('firebase-tools');
  eq(result.tier, 3, 'firebase-tools tier');
});

await test('classifyDependency("jsonwebtoken") -> Tier 4 (Never blind auto-merge)', () => {
  const result = classifyDependency('jsonwebtoken');
  eq(result.tier, 4, 'jsonwebtoken tier');
  eq(result.name, 'Tier 4: Never Blind Auto-merge', 'jsonwebtoken name');
});

await test('classifyDependency("stripe") -> Tier 4 (Never blind auto-merge)', () => {
  const result = classifyDependency('stripe');
  eq(result.tier, 4, 'stripe tier');
});


// --- Automerge Decision Matrix Tests ---

const baseCleanUpdate = {
  packageName: 'lodash',
  fromVersion: '4.17.21',
  toVersion: '4.17.22',
  changeType: 'patch',
  addsLifecycleScript: false,
  addsNativeBinary: false,
  newTransitiveDepsCount: 0,
  publishAgeHours: 48,
  provenancePresent: true,
  registrySignatureVerified: true,
  maintainerIdentityStable: true,
  sastUpstream: true,
  vulnerabilityAuditPass: true,
  ciPasses: true,
  lockfileDiffSize: 'small'
};

await test('assessAutomergePolicy -> ALLOWED (clean patch update on Tier 1)', async () => {
  const result = await assessAutomergePolicy(baseCleanUpdate);
  eq(result.decision, 'AUTO-MERGE ALLOWED', 'Clean patch update should be allowed');
  eq(result.reasons.length, 0, 'No reasons should be present');
});

await test('assessAutomergePolicy -> DELAYED (published < 24h ago for Tier 1)', async () => {
  const result = await assessAutomergePolicy({
    ...baseCleanUpdate,
    publishAgeHours: 12
  });
  eq(result.decision, 'AUTO-MERGE DELAYED', 'Recent publish should be delayed');
  eq(result.reasons[0].severity, 'DELAYED', 'Reason should be DELAYED');
});

await test('assessAutomergePolicy -> BLOCKED (CI failures)', async () => {
  const result = await assessAutomergePolicy({
    ...baseCleanUpdate,
    ciPasses: false
  });
  eq(result.decision, 'AUTO-MERGE BLOCKED', 'Failing CI should block auto-merge');
  eq(result.reasons.some(r => r.message.includes('CI validation')), true, 'Should specify CI failure reason');
});

await test('assessAutomergePolicy -> BLOCKED (known vulnerabilities)', async () => {
  const result = await assessAutomergePolicy({
    ...baseCleanUpdate,
    vulnerabilityAuditPass: false
  });
  eq(result.decision, 'AUTO-MERGE BLOCKED', 'Known vulnerabilities should block auto-merge');
  eq(result.reasons.some(r => r.message.includes('vulnerabilities')), true, 'Should specify vulnerability reason');
});

await test('assessAutomergePolicy -> BLOCKED (adds lifecycle script)', async () => {
  const result = await assessAutomergePolicy({
    ...baseCleanUpdate,
    addsLifecycleScript: true
  });
  eq(result.decision, 'AUTO-MERGE BLOCKED', 'Lifecycle scripts should block auto-merge');
  eq(result.reasons.some(r => r.message.includes('lifecycle script')), true, 'Should specify lifecycle script reason');
});

await test('assessAutomergePolicy -> BLOCKED (adds native binary)', async () => {
  const result = await assessAutomergePolicy({
    ...baseCleanUpdate,
    addsNativeBinary: true
  });
  eq(result.decision, 'AUTO-MERGE BLOCKED', 'Native binaries should block auto-merge');
  eq(result.reasons.some(r => r.message.includes('native platform binary')), true, 'Should specify binary reason');
});

await test('assessAutomergePolicy -> BLOCKED (registry signature verification fails)', async () => {
  const result = await assessAutomergePolicy({
    ...baseCleanUpdate,
    registrySignatureVerified: false
  });
  eq(result.decision, 'AUTO-MERGE BLOCKED', 'Failed registry signature should block');
  eq(result.reasons.some(r => r.message.includes('signature verification failed')), true, 'Should specify signature reason');
});

await test('assessAutomergePolicy -> NEEDS REVIEW (unstable maintainer profile)', async () => {
  const result = await assessAutomergePolicy({
    ...baseCleanUpdate,
    maintainerIdentityStable: false
  });
  eq(result.decision, 'AUTO-MERGE NEEDS REVIEW', 'Unstable maintainer should trigger review');
  eq(result.reasons.some(r => r.message.includes('maintainer profile')), true, 'Should specify maintainer reason');
});

await test('assessAutomergePolicy -> NEEDS REVIEW (high quantity of transitive deps)', async () => {
  const result = await assessAutomergePolicy({
    ...baseCleanUpdate,
    newTransitiveDepsCount: 15
  });
  eq(result.decision, 'AUTO-MERGE NEEDS REVIEW', 'Too many transitive deps should trigger review');
  eq(result.reasons.some(r => r.message.includes('transitive dependencies')), true, 'Should specify transitive reason');
});

await test('assessAutomergePolicy -> NEEDS REVIEW (missing provenance on Tier 2 vite)', async () => {
  const result = await assessAutomergePolicy({
    ...baseCleanUpdate,
    packageName: 'vite',
    provenancePresent: false
  });
  eq(result.decision, 'AUTO-MERGE NEEDS REVIEW', 'Missing provenance on Tier >= 2 triggers review');
  eq(result.reasons.some(r => r.message.includes('provenance')), true, 'Should specify provenance reason');
});

await test('assessAutomergePolicy -> BLOCKED (Tier 4 stripe requires manual security owner approval)', async () => {
  const result = await assessAutomergePolicy({
    ...baseCleanUpdate,
    packageName: 'stripe',
    changeType: 'patch'
  });
  eq(result.decision, 'AUTO-MERGE BLOCKED', 'Tier 4 always blocks');
  eq(result.reasons.some(r => r.message.includes('security owner approval')), true, 'Should specify Tier 4 reason');
});

await test('assessAutomergePolicy -> NEEDS REVIEW (Tier 3 privileged tool requires manual review)', async () => {
  const result = await assessAutomergePolicy({
    ...baseCleanUpdate,
    packageName: 'firebase-tools'
  });
  eq(result.decision, 'AUTO-MERGE NEEDS REVIEW', 'Tier 3 always requires review');
  eq(result.reasons.some(r => r.message.includes('Privileged developer tool')), true, 'Should specify Tier 3 reason');
});

// --- Exception injection tests ---

await test('EXCEPTION_ACTIVE returned when exceptionLookup finds active exception', async () => {
  const mockException = {
    id: 'OTS-EXC-2026-0001',
    package: 'stripe',
    version: '5.0.1',
    status: 'APPROVED',
    reviewedBy: 'bob',
    expiresAt: '2026-06-10T00:00:00Z',
    gateDecisionRef: { topReason: 'Auth/Crypto requires approval' },
  };
  const result = await assessAutomergePolicy(
    { ...baseCleanUpdate, packageName: 'stripe', toVersion: '5.0.1' },
    {},
    { exceptionLookup: async () => mockException },
  );
  eq(result.decision, 'EXCEPTION_ACTIVE', 'should be EXCEPTION_ACTIVE');
  eq(result.exception.id, 'OTS-EXC-2026-0001', 'exception id present');
  eq(result.reasons.length, 0, 'no block reasons when exception active');
});

await test('BLOCKED when exceptionLookup returns null (no active exception)', async () => {
  const result = await assessAutomergePolicy(
    { ...baseCleanUpdate, packageName: 'stripe', toVersion: '5.0.1' },
    {},
    { exceptionLookup: async () => null },
  );
  eq(result.decision, 'AUTO-MERGE BLOCKED', 'null lookup falls through to block');
});

await test('BLOCKED when exceptionLookup throws (fail-closed safety)', async () => {
  const result = await assessAutomergePolicy(
    { ...baseCleanUpdate, packageName: 'stripe', toVersion: '5.0.1' },
    {},
    { exceptionLookup: async () => { throw new Error('DB unavailable'); } },
  );
  eq(result.decision, 'AUTO-MERGE BLOCKED', 'lookup failure must fail closed');
});

await test('ALLOWED (no opts) still works — backward compat', async () => {
  const result = await assessAutomergePolicy(baseCleanUpdate);
  eq(result.decision, 'AUTO-MERGE ALLOWED', 'backward compat: no opts still works');
});

console.log('');
console.log(`Automerge Governor tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
