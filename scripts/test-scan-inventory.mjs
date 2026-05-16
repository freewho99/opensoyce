#!/usr/bin/env node
/**
 * Scanner v3a -- buildInventory() verification.
 *
 * Plain Node, no framework. Each test prints PASS/FAIL with a one-line
 * reason. Non-zero exit on any failure. Mirrors scripts/test-scan-summary.mjs.
 */
import { buildInventory } from '../src/shared/scanLockfile.js';

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

function findPkg(inv, name) {
  const p = inv.packages.find(x => x.name === name);
  if (!p) throw new Error(`package not found in inventory: ${name}`);
  return p;
}

// 1. npm v3 small lockfile: 3 packages, 1 direct, 2 transitive, with dev:true
test('npm v3 small: 1 direct, 2 transitive, prod/dev split', () => {
  const lock = JSON.stringify({
    name: 'demo',
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': {
        name: 'demo',
        version: '1.0.0',
        dependencies: { lodash: '^4' },
        devDependencies: { jest: '^29' },
      },
      'node_modules/lodash': { version: '4.17.21', license: 'MIT' },
      'node_modules/lodash/node_modules/sub-helper': { version: '1.0.0', license: 'MIT' },
      'node_modules/jest': { version: '29.0.0', dev: true, license: 'MIT' },
    },
  });
  const inv = buildInventory(lock);
  eq(inv.format, 'npm-v3', 'format');
  eq(inv.totals.totalPackages, 3, 'totalPackages');
  eq(inv.totals.directCount, 2, 'directCount'); // lodash + jest are direct
  eq(inv.totals.transitiveCount, 1, 'transitiveCount'); // sub-helper
  eq(inv.totals.prodCount, 2, 'prodCount'); // lodash + sub-helper
  eq(inv.totals.devCount, 1, 'devCount'); // jest
  eq(findPkg(inv, 'jest').scope, 'dev', 'jest scope');
  eq(findPkg(inv, 'lodash').scope, 'prod', 'lodash scope');
  eq(findPkg(inv, 'sub-helper').direct, false, 'sub-helper transitive');
});

// 2. npm v3 with duplicate versions
test('npm v3 duplicate versions: one row, versions.length===2', () => {
  const lock = JSON.stringify({
    lockfileVersion: 3,
    packages: {
      '': {
        name: 'root',
        version: '1.0.0',
        dependencies: { 'dep-a': '^1', parent: '^1' },
      },
      'node_modules/dep-a': { version: '1.0.0', license: 'MIT' },
      'node_modules/parent/node_modules/dep-a': { version: '2.0.0', license: 'MIT' },
      'node_modules/parent': { version: '1.0.0', license: 'MIT' },
    },
  });
  const inv = buildInventory(lock);
  const a = findPkg(inv, 'dep-a');
  eq(a.versions.length, 2, 'dep-a versions count');
  eq(inv.totals.duplicateCount, 1, 'duplicateCount');
  eq(a.direct, true, 'dep-a direct (declared in root deps and at top level)');
});

// 3. npm v3 with aliased install: node_modules/aliased-name with name:"actual-name"
test('npm v3 aliased install: row uses actual name', () => {
  const lock = JSON.stringify({
    lockfileVersion: 3,
    packages: {
      '': { name: 'root', version: '1.0.0' },
      'node_modules/aliased-name': {
        name: 'actual-name',
        version: '3.2.1',
        license: 'MIT',
      },
    },
  });
  const inv = buildInventory(lock);
  eq(inv.packages.length, 1, 'single package');
  eq(inv.packages[0].name, 'actual-name', 'real name used');
  eq(inv.packages[0].versions[0], '3.2.1', 'version preserved');
});

// 4. npm v1 lockfile: direct vs transitive
test('npm v1 recursive dependencies: direct vs transitive', () => {
  const lock = JSON.stringify({
    name: 'old-app',
    version: '1.0.0',
    lockfileVersion: 1,
    dependencies: {
      'top-a': {
        version: '1.0.0',
        dependencies: {
          'nested-b': { version: '0.5.0' },
        },
      },
      'top-c': { version: '2.0.0', dev: true },
    },
  });
  const inv = buildInventory(lock);
  eq(inv.format, 'npm-v1', 'format');
  eq(findPkg(inv, 'top-a').direct, true, 'top-a direct');
  eq(findPkg(inv, 'top-c').direct, true, 'top-c direct');
  eq(findPkg(inv, 'nested-b').direct, false, 'nested-b transitive');
  eq(findPkg(inv, 'top-c').scope, 'dev', 'top-c dev scope');
  // top-a has no flags -> v1 scope falls back to 'unknown' per spec.
  eq(findPkg(inv, 'top-a').scope, 'unknown', 'top-a unknown (no flags)');
});

// 5. npm v3 missing license/repository on some entries
test('npm v3 missing license/repository counts', () => {
  const lock = JSON.stringify({
    lockfileVersion: 3,
    packages: {
      '': { name: 'root', version: '1.0.0' },
      'node_modules/has-both': {
        version: '1.0.0', license: 'MIT', repository: 'github:foo/bar',
      },
      'node_modules/has-license-only': { version: '1.0.0', license: 'ISC' },
      'node_modules/has-neither': { version: '1.0.0' },
    },
  });
  const inv = buildInventory(lock);
  eq(inv.totals.missingLicenseCount, 1, 'missingLicenseCount');
  eq(inv.totals.missingRepositoryCount, 2, 'missingRepositoryCount');
  eq(findPkg(inv, 'has-both').hasLicense, true, 'has-both license');
  eq(findPkg(inv, 'has-both').hasRepository, true, 'has-both repo');
  eq(findPkg(inv, 'has-neither').hasLicense, false, 'has-neither license');
});

// 6. Empty / malformed lockfile -- no throw, format:'unknown'
test('malformed lockfile does not throw', () => {
  const cases = [
    null,
    undefined,
    '',
    'not a lockfile',
    '{ malformed json',
    '{"lockfileVersion":99,"packages":{}}',
  ];
  for (const c of cases) {
    const inv = buildInventory(c);
    eq(inv.format, 'unknown', `format for ${JSON.stringify(c)}`);
    eq(inv.totals.totalPackages, 0, `totalPackages for ${JSON.stringify(c)}`);
    eq(inv.packages.length, 0, `packages length for ${JSON.stringify(c)}`);
  }
});

// 7. totalPackages vs totalEntries with duplicates
test('totalPackages and totalEntries reconcile with duplicates', () => {
  const lock = JSON.stringify({
    lockfileVersion: 3,
    packages: {
      '': {
        name: 'root',
        version: '1.0.0',
        dependencies: { a: '^1', b: '^1', parent: '^1' },
      },
      'node_modules/a': { version: '1.0.0', license: 'MIT' },
      'node_modules/b': { version: '1.0.0', license: 'MIT' },
      'node_modules/parent': { version: '1.0.0', license: 'MIT' },
      'node_modules/parent/node_modules/a': { version: '2.0.0', license: 'MIT' },
      'node_modules/parent/node_modules/a/node_modules/c': { version: '0.5.0', license: 'MIT' },
    },
  });
  const inv = buildInventory(lock);
  // Unique names: a, b, parent, c -> 4 packages
  eq(inv.totals.totalPackages, 4, 'totalPackages (unique names)');
  // Raw entries: 5 (skipping root)
  eq(inv.totals.totalEntries, 5, 'totalEntries (raw count)');
  eq(inv.totals.duplicateCount, 1, 'duplicateCount');
  const a = findPkg(inv, 'a');
  eq(a.versions.length, 2, 'a has two versions');
});

// Bonus: scope precedence -- prod > dev when same package appears both ways
test('scope precedence: prod wins over dev when both appear', () => {
  const lock = JSON.stringify({
    lockfileVersion: 3,
    packages: {
      '': {
        name: 'root',
        version: '1.0.0',
        devDependencies: { shared: '^1' },
        dependencies: { parent: '^1' },
      },
      'node_modules/shared': { version: '1.0.0', dev: true, license: 'MIT' },
      'node_modules/parent/node_modules/shared': { version: '1.0.0', license: 'MIT' },
      'node_modules/parent': { version: '1.0.0', license: 'MIT' },
    },
  });
  const inv = buildInventory(lock);
  eq(findPkg(inv, 'shared').scope, 'prod', 'shared scope (prod wins)');
});

// P0-1: flat-hoist must not turn transitive packages into "direct".
test('npm v3 flat-hoist: transitive-of-jest is NOT direct', () => {
  const lock = JSON.stringify({
    lockfileVersion: 3,
    packages: {
      '': {
        name: 'root',
        version: '1.0.0',
        dependencies: { lodash: '^4' },
        devDependencies: { jest: '^29' },
      },
      // npm v3 flat-hoists every package to top level, regardless of
      // whether root declared it. Our parser must only mark the two
      // names the root actually declared as direct.
      'node_modules/lodash': { version: '4.17.21', license: 'MIT' },
      'node_modules/jest': { version: '29.0.0', dev: true, license: 'MIT' },
      'node_modules/some-transitive-of-jest': { version: '1.0.0', dev: true, license: 'MIT' },
    },
  });
  const inv = buildInventory(lock);
  eq(inv.totals.directCount, 2, 'directCount (lodash + jest only)');
  eq(findPkg(inv, 'lodash').direct, true, 'lodash direct');
  eq(findPkg(inv, 'jest').direct, true, 'jest direct');
  eq(findPkg(inv, 'some-transitive-of-jest').direct, false, 'transitive NOT direct despite hoist');
});

// P0-1: duplicates of a direct package still count once.
test('npm v3 flat-hoist + nested duplicate: directCount unchanged', () => {
  const lock = JSON.stringify({
    lockfileVersion: 3,
    packages: {
      '': {
        name: 'root',
        version: '1.0.0',
        dependencies: { lodash: '^4' },
        devDependencies: { jest: '^29' },
      },
      'node_modules/lodash': { version: '4.17.21', license: 'MIT' },
      'node_modules/jest': { version: '29.0.0', dev: true, license: 'MIT' },
      'node_modules/some-transitive-of-jest': { version: '1.0.0', dev: true, license: 'MIT' },
      // duplicate lodash nested under jest
      'node_modules/jest/node_modules/lodash': { version: '3.10.0', dev: true, license: 'MIT' },
    },
  });
  const inv = buildInventory(lock);
  eq(inv.totals.directCount, 2, 'directCount still 2');
  const ld = findPkg(inv, 'lodash');
  eq(ld.direct, true, 'lodash still direct');
  eq(ld.versions.length, 2, 'lodash has both versions');
});

// P0-1: optionalDependencies and peerDependencies also count as direct.
test('npm v3 root optionalDependencies / peerDependencies count as direct', () => {
  const lock = JSON.stringify({
    lockfileVersion: 3,
    packages: {
      '': {
        name: 'root',
        version: '1.0.0',
        optionalDependencies: { fsevents: '^2' },
        peerDependencies: { react: '^18' },
      },
      'node_modules/fsevents': { version: '2.3.0', optional: true, license: 'MIT' },
      'node_modules/react': { version: '18.2.0', license: 'MIT' },
      'node_modules/scheduler': { version: '0.23.0', license: 'MIT' },
    },
  });
  const inv = buildInventory(lock);
  eq(inv.totals.directCount, 2, 'directCount = 2 (fsevents + react)');
  eq(findPkg(inv, 'fsevents').direct, true, 'fsevents direct (optional)');
  eq(findPkg(inv, 'react').direct, true, 'react direct (peer)');
  eq(findPkg(inv, 'scheduler').direct, false, 'scheduler not direct');
});

// ---------------------------------------------------------------------------
// Python lockfile inventory (v0 — uv.lock + poetry.lock)
// ---------------------------------------------------------------------------

// Python-1: uv.lock with 3 packages + a [[manifest.dependency]] direct list.
test('uv.lock: 3 packages, langchain & openai direct, transformers transitive', () => {
  const lock = `
version = 1
requires-python = ">=3.10"

[[manifest.dependency]]
name = "langchain"

[[manifest.dependency]]
name = "openai"

[[package]]
name = "langchain"
version = "0.0.300"
source = { registry = "https://pypi.org/simple" }

[[package]]
name = "transformers"
version = "4.30.0"
source = { registry = "https://pypi.org/simple" }

[[package]]
name = "openai"
version = "1.0.0"
source = { registry = "https://pypi.org/simple" }
`.trimStart();
  const inv = buildInventory(lock);
  eq(inv.format, 'uv-lock', 'format');
  eq(inv.ecosystem, 'PyPI', 'ecosystem');
  eq(inv.totals.totalPackages, 3, 'totalPackages');
  eq(inv.totals.directCount, 2, 'directCount (manifest deps)');
  eq(inv.totals.transitiveCount, 1, 'transitiveCount');
  eq(findPkg(inv, 'langchain').direct, true, 'langchain direct');
  eq(findPkg(inv, 'langchain').versions[0], '0.0.300', 'langchain version');
  eq(findPkg(inv, 'openai').direct, true, 'openai direct');
  eq(findPkg(inv, 'transformers').direct, false, 'transformers transitive');
});

// Python-2: poetry.lock with two packages, one legacy category="dev"
test('poetry.lock: legacy category dev maps to scope dev, optional flag honored', () => {
  const lock = `
# This file is @generated by Poetry, do not edit.

[[package]]
name = "requests"
version = "2.31.0"
description = "HTTP library"
category = "main"
optional = false

[[package]]
name = "pytest"
version = "7.4.0"
description = "Testing"
category = "dev"
optional = false

[metadata]
lock-version = "2.0"
python-versions = "^3.10"
`.trimStart();
  const inv = buildInventory(lock);
  eq(inv.format, 'poetry-lock', 'format');
  eq(inv.ecosystem, 'PyPI', 'ecosystem');
  eq(inv.totals.totalPackages, 2, 'totalPackages');
  eq(findPkg(inv, 'requests').scope, 'prod', 'requests prod scope');
  eq(findPkg(inv, 'pytest').scope, 'dev', 'pytest dev scope');
  eq(inv.totals.devCount, 1, 'devCount');
  eq(inv.totals.prodCount, 1, 'prodCount');
});

// Python-3: poetry.lock without companion pyproject.toml → directUnknown caveat.
test('poetry.lock: no manifest -> directUnknown true, all direct=false', () => {
  const lock = `
# This file is @generated by Poetry, do not edit.

[[package]]
name = "requests"
version = "2.31.0"
category = "main"
optional = false

[[package]]
name = "urllib3"
version = "1.26.18"
category = "main"
optional = false

[metadata]
lock-version = "2.0"
python-versions = "^3.10"
`.trimStart();
  const inv = buildInventory(lock);
  eq(inv.totals.directUnknown, true, 'directUnknown flag set');
  eq(inv.totals.directCount, 0, 'directCount 0 (cannot tell)');
  eq(findPkg(inv, 'requests').direct, false, 'requests direct=false (honest)');
  eq(findPkg(inv, 'urllib3').direct, false, 'urllib3 direct=false (honest)');
});

console.log('');
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
