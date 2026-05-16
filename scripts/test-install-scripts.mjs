#!/usr/bin/env node
/**
 * Postinstall analysis v0 — install-script signal + trusted-allowlist tests.
 *
 * Plain Node, no framework. Each test prints PASS/FAIL with a one-line
 * reason. Non-zero exit on any failure. Mirrors test-scan-inventory.mjs.
 */
import { buildInventory } from '../src/shared/scanLockfile.js';
import {
  isTrustedInstallScript,
  getTrustedInstallScript,
  TRUSTED_INSTALL_SCRIPTS,
} from '../src/data/trustedInstallScripts.js';

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

// ---------------------------------------------------------------------------
// Parser-side tests: hasInstallScript flows through inventory records
// ---------------------------------------------------------------------------

// 1. npm v3 with hasInstallScript: true on an entry.
test('npm v3 hasInstallScript flag captured on package entry', () => {
  const lock = JSON.stringify({
    lockfileVersion: 3,
    packages: {
      '': { name: 'root', version: '1.0.0', dependencies: { sharp: '^0.33' } },
      'node_modules/sharp': { version: '0.33.0', hasInstallScript: true, license: 'Apache-2.0' },
    },
  });
  const inv = buildInventory(lock);
  eq(findPkg(inv, 'sharp').hasInstallScript, true, 'sharp hasInstallScript');
});

// 2. npm v3 without hasInstallScript: defaults to false.
test('npm v3 missing hasInstallScript -> false', () => {
  const lock = JSON.stringify({
    lockfileVersion: 3,
    packages: {
      '': { name: 'root', version: '1.0.0', dependencies: { lodash: '^4' } },
      'node_modules/lodash': { version: '4.17.21', license: 'MIT' },
    },
  });
  const inv = buildInventory(lock);
  eq(findPkg(inv, 'lodash').hasInstallScript, false, 'lodash hasInstallScript');
});

// 3. Sticky-across-versions: one bot-flagged version flips the merged record.
test('npm v3 sticky across versions: any version with flag wins', () => {
  const lock = JSON.stringify({
    lockfileVersion: 3,
    packages: {
      '': { name: 'root', version: '1.0.0', dependencies: { 'dep-a': '^1', parent: '^1' } },
      'node_modules/dep-a': { version: '1.0.0', license: 'MIT' },                          // no flag
      'node_modules/parent': { version: '1.0.0', license: 'MIT' },
      'node_modules/parent/node_modules/dep-a': { version: '2.0.0', hasInstallScript: true, license: 'MIT' },
    },
  });
  const inv = buildInventory(lock);
  const a = findPkg(inv, 'dep-a');
  eq(a.hasInstallScript, true, 'sticky flag across versions');
  eq(a.versions.length, 2, 'still has both versions');
});

// 4. pnpm with requiresBuild: true.
test('pnpm requiresBuild captured as hasInstallScript', () => {
  const lock = `
lockfileVersion: '9.0'

importers:
  .:
    dependencies:
      sharp: 0.33.0

packages:
  /sharp@0.33.0:
    resolution: {integrity: sha512-fake}
    requiresBuild: true
`.trimStart();
  const inv = buildInventory(lock);
  eq(findPkg(inv, 'sharp').hasInstallScript, true, 'sharp hasInstallScript via requiresBuild');
});

// 5. pnpm without requiresBuild: defaults to false.
test('pnpm missing requiresBuild -> hasInstallScript false', () => {
  const lock = `
lockfileVersion: '9.0'

importers:
  .:
    dependencies:
      lodash: 4.17.21

packages:
  /lodash@4.17.21:
    resolution: {integrity: sha512-fake}
`.trimStart();
  const inv = buildInventory(lock);
  eq(findPkg(inv, 'lodash').hasInstallScript, false, 'lodash hasInstallScript via missing requiresBuild');
});

// 6. inventory.totals.installScriptCount counts correctly.
test('inventory.totals.installScriptCount across mixed lockfile', () => {
  const lock = JSON.stringify({
    lockfileVersion: 3,
    packages: {
      '': {
        name: 'root',
        version: '1.0.0',
        dependencies: { sharp: '^0.33', esbuild: '^0.20', lodash: '^4' },
      },
      'node_modules/sharp': { version: '0.33.0', hasInstallScript: true, license: 'MIT' },
      'node_modules/esbuild': { version: '0.20.0', hasInstallScript: true, license: 'MIT' },
      'node_modules/lodash': { version: '4.17.21', license: 'MIT' },
    },
  });
  const inv = buildInventory(lock);
  eq(inv.totals.installScriptCount, 2, 'installScriptCount = 2');
});

// ---------------------------------------------------------------------------
// Allowlist tests: isTrustedInstallScript + getTrustedInstallScript
// ---------------------------------------------------------------------------

// 7. Allowlist plain match (typescript).
test('isTrustedInstallScript(typescript) -> true', () => {
  eq(isTrustedInstallScript('typescript'), true, 'typescript trusted');
});

// 8. Case-insensitive allowlist.
test('isTrustedInstallScript is case-insensitive', () => {
  eq(isTrustedInstallScript('TypeScript'), true, 'mixed case');
  eq(isTrustedInstallScript('TYPESCRIPT'), true, 'upper case');
});

// 9. Scoped-name allowlist match (@swc/core).
test('isTrustedInstallScript(@swc/core) -> true (scoped name)', () => {
  eq(isTrustedInstallScript('@swc/core'), true, '@swc/core trusted');
  eq(isTrustedInstallScript('@SWC/CORE'), true, '@swc/core case-insensitive scope');
});

// 10. Non-allowlisted package returns false.
test('isTrustedInstallScript(random-pkg) -> false', () => {
  eq(isTrustedInstallScript('random-pkg'), false, 'unknown pkg not trusted');
  eq(isTrustedInstallScript('event-stream'), false, 'event-stream not trusted (it should not be)');
});

// 11. Defensive: non-string input.
test('isTrustedInstallScript handles non-string input defensively', () => {
  eq(isTrustedInstallScript(null), false, 'null');
  eq(isTrustedInstallScript(undefined), false, 'undefined');
  eq(isTrustedInstallScript(42), false, 'number');
  eq(isTrustedInstallScript({}), false, 'object');
});

// 12. getTrustedInstallScript returns the entry on match.
test('getTrustedInstallScript returns full entry for match', () => {
  const entry = getTrustedInstallScript('typescript');
  if (!entry) throw new Error('expected entry, got null');
  eq(entry.name, 'typescript', 'entry.name');
  if (typeof entry.reason !== 'string' || entry.reason.length === 0) {
    throw new Error('entry.reason missing');
  }
});
test('getTrustedInstallScript returns null on non-match', () => {
  eq(getTrustedInstallScript('not-real-pkg'), null, 'null on non-match');
});

// 13. Allowlist sanity: ~30 entries, all well-formed.
test('TRUSTED_INSTALL_SCRIPTS has at least 25 entries with name+reason', () => {
  if (!Array.isArray(TRUSTED_INSTALL_SCRIPTS)) throw new Error('not an array');
  if (TRUSTED_INSTALL_SCRIPTS.length < 25) {
    throw new Error(`only ${TRUSTED_INSTALL_SCRIPTS.length} entries`);
  }
  for (const e of TRUSTED_INSTALL_SCRIPTS) {
    if (typeof e.name !== 'string' || !e.name) throw new Error(`bad name in ${JSON.stringify(e)}`);
    if (typeof e.reason !== 'string' || !e.reason) throw new Error(`bad reason in ${JSON.stringify(e)}`);
  }
});
test('TRUSTED_INSTALL_SCRIPTS has no duplicate names', () => {
  const seen = new Set();
  for (const e of TRUSTED_INSTALL_SCRIPTS) {
    const key = e.name.toLowerCase();
    if (seen.has(key)) throw new Error(`duplicate: ${key}`);
    seen.add(key);
  }
});

console.log('');
console.log(`Install-script tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
