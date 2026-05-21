#!/usr/bin/env node
/**
 * Cross-ecosystem bridges v0 — curated-map + inventory plumb-through tests.
 *
 * Plain Node, no framework. Each test prints PASS/FAIL with a one-line
 * reason. Non-zero exit on any failure. Mirrors test-typo-squat.mjs and
 * test-detect-dep-confusion.mjs.
 */
import {
  getCrossEcosystemBridge,
  hasCrossEcosystemBridge,
  CROSS_ECOSYSTEM_BRIDGES,
} from '../src/data/crossEcosystemBridges.js';
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

// ---------------------------------------------------------------------------
// Direct lookup — symmetric names
// ---------------------------------------------------------------------------

// 1. Happy path: npm-side lookup for a same-name pair.
test('getCrossEcosystemBridge(langchain, npm) -> PyPI langchain', () => {
  const r = getCrossEcosystemBridge('langchain', 'npm');
  if (!r) throw new Error('expected match, got null');
  eq(r.matched, 'langchain', 'matched echo');
  eq(r.sibling, 'langchain', 'sibling name');
  eq(r.siblingEcosystem, 'PyPI', 'siblingEcosystem');
  if (typeof r.reason !== 'string' || !r.reason) {
    throw new Error('expected non-empty reason');
  }
});

// 2. Reverse direction: same entry, queried as PyPI.
test('getCrossEcosystemBridge(langchain, PyPI) -> npm langchain', () => {
  const r = getCrossEcosystemBridge('langchain', 'PyPI');
  if (!r) throw new Error('expected match, got null');
  eq(r.matched, 'langchain', 'matched echo');
  eq(r.sibling, 'langchain', 'sibling name');
  eq(r.siblingEcosystem, 'npm', 'siblingEcosystem');
});

// ---------------------------------------------------------------------------
// Direct lookup — asymmetric names
// ---------------------------------------------------------------------------

// 3. npm @anthropic-ai/sdk → PyPI anthropic.
test('getCrossEcosystemBridge(@anthropic-ai/sdk, npm) -> PyPI anthropic', () => {
  const r = getCrossEcosystemBridge('@anthropic-ai/sdk', 'npm');
  if (!r) throw new Error('expected match, got null');
  eq(r.sibling, 'anthropic', 'asymmetric sibling');
  eq(r.siblingEcosystem, 'PyPI', 'siblingEcosystem');
});

// 4. PyPI anthropic → npm @anthropic-ai/sdk (reverse asymmetric).
test('getCrossEcosystemBridge(anthropic, PyPI) -> npm @anthropic-ai/sdk', () => {
  const r = getCrossEcosystemBridge('anthropic', 'PyPI');
  if (!r) throw new Error('expected match, got null');
  eq(r.sibling, '@anthropic-ai/sdk', 'asymmetric reverse sibling');
  eq(r.siblingEcosystem, 'npm', 'siblingEcosystem');
});

// 5. Case-insensitive npm lookup.
test('getCrossEcosystemBridge(LangChain, npm) -> matches (case-insensitive)', () => {
  const r = getCrossEcosystemBridge('LangChain', 'npm');
  if (!r) throw new Error('expected match, got null');
  eq(r.sibling, 'langchain', 'sibling');
  eq(r.siblingEcosystem, 'PyPI', 'siblingEcosystem');
  // matched should echo the caller's trimmed input verbatim.
  eq(r.matched, 'LangChain', 'matched echo (preserves caller case)');
});

// 6. PEP 503 normalization on PyPI lookups (underscores / dots → dashes).
test('getCrossEcosystemBridge: PyPI lookup normalizes _ and . to -', () => {
  // The PyPI side of @langchain/core is stored as 'langchain-core'.
  const a = getCrossEcosystemBridge('langchain_core', 'PyPI');
  if (!a) throw new Error('expected langchain_core to match');
  eq(a.sibling, '@langchain/core', 'underscore->dash normalization');
  const b = getCrossEcosystemBridge('langchain.core', 'PyPI');
  if (!b) throw new Error('expected langchain.core to match');
  eq(b.sibling, '@langchain/core', 'dot->dash normalization');
});

// 7. Not in list — returns null.
test('getCrossEcosystemBridge(random-pkg, npm) -> null', () => {
  eq(getCrossEcosystemBridge('random-pkg', 'npm'), null, 'unknown name');
  eq(getCrossEcosystemBridge('random-pkg', 'PyPI'), null, 'unknown name PyPI');
});

// 8. Wrong-ecosystem dispatch: querying the PyPI-side name as npm must NOT
// match (and vice-versa) unless the entry also has the queried side.
test('wrong-ecosystem dispatch: PyPI-only name as npm returns null', () => {
  // The PyPI sibling of @anthropic-ai/sdk is 'anthropic'. Querying
  // 'anthropic' as if it were an npm package must NOT match — there is no
  // npm 'anthropic' package in the table.
  eq(getCrossEcosystemBridge('anthropic', 'npm'), null,
    "querying 'anthropic' against npm side must miss");
  // Inverse: npm @anthropic-ai/sdk as PyPI must miss.
  eq(getCrossEcosystemBridge('@anthropic-ai/sdk', 'PyPI'), null,
    'scoped npm name against PyPI side must miss');
});

// 9. Empty / non-string / bad ecosystem defensive behavior.
test('getCrossEcosystemBridge handles bad input defensively', () => {
  eq(getCrossEcosystemBridge('', 'npm'), null, 'empty string');
  eq(getCrossEcosystemBridge(null, 'npm'), null, 'null');
  eq(getCrossEcosystemBridge(undefined, 'npm'), null, 'undefined');
  eq(getCrossEcosystemBridge(42, 'npm'), null, 'number');
  eq(getCrossEcosystemBridge('langchain', 'cargo'), null, 'bogus ecosystem');
  eq(getCrossEcosystemBridge('langchain', null), null, 'null ecosystem');
  eq(getCrossEcosystemBridge('langchain', ''), null, 'empty ecosystem');
});

// 10. hasCrossEcosystemBridge boolean shortcut.
test('hasCrossEcosystemBridge boolean shortcut', () => {
  eq(hasCrossEcosystemBridge('langchain', 'npm'), true, 'true on match');
  eq(hasCrossEcosystemBridge('random-pkg', 'npm'), false, 'false on miss');
});

// ---------------------------------------------------------------------------
// Curated-list sanity
// ---------------------------------------------------------------------------

// 11. Curated list has at least 30 entries and every entry is well-formed.
test('CROSS_ECOSYSTEM_BRIDGES has 30+ well-formed entries', () => {
  if (!Array.isArray(CROSS_ECOSYSTEM_BRIDGES)) throw new Error('not an array');
  if (CROSS_ECOSYSTEM_BRIDGES.length < 30) {
    throw new Error(`only ${CROSS_ECOSYSTEM_BRIDGES.length} entries`);
  }
  for (const entry of CROSS_ECOSYSTEM_BRIDGES) {
    if (!entry || typeof entry !== 'object') throw new Error(`bad entry: ${JSON.stringify(entry)}`);
    if (typeof entry.npm !== 'string' || !entry.npm) {
      throw new Error(`bad npm side: ${JSON.stringify(entry)}`);
    }
    if (typeof entry.pypi !== 'string' || !entry.pypi) {
      throw new Error(`bad pypi side: ${JSON.stringify(entry)}`);
    }
    if (typeof entry.reason !== 'string' || !entry.reason) {
      throw new Error(`bad reason: ${JSON.stringify(entry)}`);
    }
    // PyPI names are required to be lowercase by the registry.
    if (entry.pypi !== entry.pypi.toLowerCase()) {
      throw new Error(`PyPI name should be lowercase: ${entry.pypi}`);
    }
  }
});

// ---------------------------------------------------------------------------
// Inventory plumb-through
// ---------------------------------------------------------------------------

// 12. npm inventory: langchain row carries crossEcosystemBridge.
test('inventory (npm-v3): langchain row has crossEcosystemBridge -> PyPI langchain', () => {
  const lock = JSON.stringify({
    lockfileVersion: 3,
    packages: {
      '': { name: 'root', version: '1.0.0', dependencies: { langchain: '^0.0.300' } },
      'node_modules/langchain': { version: '0.0.300', license: 'MIT' },
    },
  });
  const inv = buildInventory(lock);
  const pkg = findPkg(inv, 'langchain');
  if (!pkg.crossEcosystemBridge) throw new Error('expected bridge, got null');
  eq(pkg.crossEcosystemBridge.sibling, 'langchain', 'sibling');
  eq(pkg.crossEcosystemBridge.siblingEcosystem, 'PyPI', 'siblingEcosystem');
});

// 13. Inventory: off-list package gets null crossEcosystemBridge.
test('inventory (npm-v3): off-list package -> crossEcosystemBridge null', () => {
  const lock = JSON.stringify({
    lockfileVersion: 3,
    packages: {
      '': { name: 'root', version: '1.0.0', dependencies: { 'random-pkg': '^1' } },
      'node_modules/random-pkg': { version: '1.0.0' },
    },
  });
  const inv = buildInventory(lock);
  eq(findPkg(inv, 'random-pkg').crossEcosystemBridge, null, 'random-pkg null');
});

// 14. PyPI inventory: poetry.lock transformers → npm @huggingface/transformers.
test('inventory (poetry-lock): transformers -> npm @huggingface/transformers', () => {
  // Minimal poetry.lock — banner triggers the format detection.
  const lock = [
    '# This file is @generated by Poetry and should not be changed by hand.',
    '',
    '[[package]]',
    'name = "transformers"',
    'version = "4.0.0"',
    'description = "transformers"',
    '',
    '[metadata]',
    'lock-version = "2.0"',
    'python-versions = ">=3.9"',
    'content-hash = "deadbeef"',
  ].join('\n');
  const inv = buildInventory(lock);
  eq(inv.format, 'poetry-lock', 'detected poetry-lock');
  const pkg = findPkg(inv, 'transformers');
  if (!pkg.crossEcosystemBridge) throw new Error('expected bridge, got null');
  eq(pkg.crossEcosystemBridge.sibling, '@huggingface/transformers', 'sibling');
  eq(pkg.crossEcosystemBridge.siblingEcosystem, 'npm', 'siblingEcosystem');
});

// 15. totals.crossEcosystemBridgeCount math.
test('inventory.totals.crossEcosystemBridgeCount across mixed lockfile', () => {
  const lock = JSON.stringify({
    lockfileVersion: 3,
    packages: {
      '': {
        name: 'root',
        version: '1.0.0',
        dependencies: {
          langchain: '^0.0.300',          // on-list
          openai: '^4',                   // on-list
          '@anthropic-ai/sdk': '^0.20',   // on-list (asymmetric)
          lodash: '^4',                   // off-list
          'random-pkg': '^1',             // off-list
        },
      },
      'node_modules/langchain': { version: '0.0.300' },
      'node_modules/openai': { version: '4.0.0' },
      'node_modules/@anthropic-ai/sdk': { version: '0.20.0' },
      'node_modules/lodash': { version: '4.17.21' },
      'node_modules/random-pkg': { version: '1.0.0' },
    },
  });
  const inv = buildInventory(lock);
  eq(inv.totals.crossEcosystemBridgeCount, 3, 'crossEcosystemBridgeCount = 3');
});

console.log('');
console.log(`Cross-ecosystem bridge tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
