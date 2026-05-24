#!/usr/bin/env node
/**
 * Benchmark: blast radius index build on large simulated monorepo lockfiles.
 * Generates a lockfile with 10,000 packages to verify scalability and speed.
 */

import { attachBlastRadius, __blastRadiusInternal } from '../src/shared/scanLockfile.js';
const { buildReverseDependencyIndex } = __blastRadiusInternal;

console.log('=== Blast Radius Performance Benchmark ===');

// 1. Generate mock lockfile with 10,000 package entries
console.log('Generating 10,000 mock packages with dense dependencies...');
const packages = {
  '': {
    dependencies: {}
  }
};

const totalPackages = 10000;
const directCount = 200;

// Add direct dependencies
for (let i = 1; i <= directCount; i++) {
  const name = `direct-dep-${i}`;
  packages[''].dependencies[name] = '^1.0.0';
  packages[`node_modules/${name}`] = {
    version: '1.0.0',
    dependencies: {}
  };
}

// Add transitive dependencies and form deep dependency graphs
for (let i = directCount + 1; i < totalPackages; i++) {
  const name = `transitive-dep-${i}`;
  const parentName = `direct-dep-${(i % directCount) + 1}`;
  
  // Each transitive dep belongs to a direct parent, and depends on some common libraries
  packages[`node_modules/${parentName}`].dependencies[name] = '^1.0.0';
  
  // Introduce shared helper packages that many things depend on to simulate high fan-in
  const dependencies = {};
  if (i % 50 === 0) {
    // Shared library
    dependencies['shared-utility-core'] = '^1.0.0';
  }
  if (i % 100 === 0) {
    // Highly shared database/network library
    dependencies['shared-database-core'] = '^1.0.0';
  }
  
  packages[`node_modules/${name}`] = {
    version: '1.0.0',
    dependencies
  };
}

// Add the high fan-in shared libraries
packages['node_modules/shared-utility-core'] = {
  version: '1.0.0',
  dependencies: {}
};
packages['node_modules/shared-database-core'] = {
  version: '1.0.0',
  dependencies: {
    'shared-utility-core': '^1.0.0'
  }
};

const mockLockfile = {
  lockfileVersion: 3,
  packages
};

// Generate fake inventory matching the lockfile
const packagesList = [];
for (const [key, meta] of Object.entries(packages)) {
  if (key === '') continue;
  const name = key.replace('node_modules/', '');
  const direct = key.startsWith('node_modules/') && !key.slice(13).includes('/node_modules/') && packages[''].dependencies[name] !== undefined;
  packagesList.push({
    name,
    versions: [meta.version],
    direct
  });
}

const mockInventory = {
  format: 'npm-v3',
  ecosystem: 'npm',
  packages: packagesList,
  totals: {
    totalPackages: packagesList.length
  }
};

const lockfileText = JSON.stringify(mockLockfile);

console.log(`Simulated Monorepo Stats:`);
console.log(` - Total packages: ${packagesList.length}`);
console.log(` - Lockfile size: ${(lockfileText.length / 1024 / 1024).toFixed(2)} MB`);

// 2. Measure Reverse Dependency Index Build Time
const t0 = performance.now();
const reverseIndex = buildReverseDependencyIndex(mockLockfile);
const t1 = performance.now();
const indexTimeMs = t1 - t0;

console.log(`\nResults:`);
console.log(` - buildReverseDependencyIndex: ${indexTimeMs.toFixed(2)} ms`);

// 3. Measure Full attachBlastRadius Execution Time
const t2 = performance.now();
const result = attachBlastRadius(mockInventory, lockfileText);
const t3 = performance.now();
const fullTimeMs = t3 - t2;

console.log(` - attachBlastRadius (includes JSON.parse + mapping): ${fullTimeMs.toFixed(2)} ms`);

const sharedDb = result.packages.find(p => p.name === 'shared-database-core');
const sharedUtil = result.packages.find(p => p.name === 'shared-utility-core');

console.log(`\nSample Blast Radius Verification:`);
if (sharedDb && sharedDb.blastRadius) {
  console.log(` - shared-database-core: tier = ${sharedDb.blastRadius.tier}, rdeps = ${sharedDb.blastRadius.reverseDependencyCount}`);
}
if (sharedUtil && sharedUtil.blastRadius) {
  console.log(` - shared-utility-core: tier = ${sharedUtil.blastRadius.tier}, rdeps = ${sharedUtil.blastRadius.reverseDependencyCount}`);
}

// 4. Assert performance thresholds
const MAX_THRESHOLD_MS = 150; // generous limit for 10k packages on various CPU bounds
if (fullTimeMs > MAX_THRESHOLD_MS) {
  console.error(`\n❌ Benchmark FAILED: attachBlastRadius execution time (${fullTimeMs.toFixed(2)}ms) exceeded threshold of ${MAX_THRESHOLD_MS}ms`);
  process.exit(1);
} else {
  console.log(`\n✅ Benchmark PASSED: Performance is well within the acceptable limit (< ${MAX_THRESHOLD_MS}ms)`);
}
