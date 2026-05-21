#!/usr/bin/env node
/**
 * Typo-squat homoglyph detection v0 — skeleton + protected-list tests.
 *
 * Plain Node, no framework. Each test prints PASS/FAIL with a one-line
 * reason. Non-zero exit on any failure. Mirrors test-install-scripts.mjs.
 */
import { skeleton } from '../src/data/unicodeConfusables.js';
import {
  detectTypoSquat,
  skeletonOf,
  PROTECTED_PACKAGE_NAMES,
} from '../src/data/protectedPackageNames.js';
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

function deepEq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new Error(`${msg}: expected ${b}, got ${a}`);
  }
}

function findPkg(inv, name) {
  const p = inv.packages.find(x => x.name === name);
  if (!p) throw new Error(`package not found in inventory: ${name}`);
  return p;
}

// ---------------------------------------------------------------------------
// skeleton() — the canonicalizer
// ---------------------------------------------------------------------------

// 1. ASCII passthrough.
test('skeleton: ASCII passthrough', () => {
  eq(skeleton('langchain'), 'langchain', 'langchain pass-through');
});

// 2. Cyrillic substitution (lowercase a).
test('skeleton: Cyrillic а -> a', () => {
  eq(skeleton('lаngchain'), 'langchain', 'Cyrillic а folds to a');
});

// 3. Greek substitution (lowercase alpha).
test('skeleton: Greek α -> a', () => {
  eq(skeleton('lαngchain'), 'langchain', 'Greek α folds to a');
});

// 4. Digit/letter confusable (zero -> o).
test('skeleton: 0 -> o', () => {
  eq(skeleton('0penai'), 'openai', '0penai -> openai');
});

// 5. Fullwidth Latin (folds via NFKC + per-char map).
test('skeleton: fullwidth Latin -> ASCII', () => {
  eq(skeleton('ＬＡＮＧＣＨＡＩＮ'), 'langchain', 'fullwidth LANGCHAIN');
});

// 6. Case-insensitive: mixed-case folds to lower.
test('skeleton: case-insensitive folding', () => {
  eq(skeleton('LangChain'), 'langchain', 'LangChain -> langchain');
});

// 7. Zero-width characters drop entirely.
test('skeleton: zero-width chars dropped', () => {
  eq(skeleton('lang​chain'), 'langchain', 'ZWSP dropped');
  eq(skeleton('lang‌cha‍in'), 'langchain', 'ZWNJ + ZWJ dropped');
});

// 8. skeletonOf is the same as skeleton.
test('skeletonOf re-export matches skeleton', () => {
  eq(skeletonOf('lаngchain'), skeleton('lаngchain'), 'skeletonOf === skeleton');
});

// ---------------------------------------------------------------------------
// detectTypoSquat() — the public lookup
// ---------------------------------------------------------------------------

// 9. Legit package: self-match suppression returns null.
test('detectTypoSquat(langchain) -> null (self-match suppression)', () => {
  eq(detectTypoSquat('langchain'), null, 'legitimate langchain install');
});

// 10. Cyrillic а attack against langchain.
test('detectTypoSquat(lаngchain) -> langchain target', () => {
  const r = detectTypoSquat('lаngchain');
  if (!r) throw new Error('expected match, got null');
  eq(r.matched, 'lаngchain', 'matched echo');
  eq(r.suspectedTarget, 'langchain', 'suspectedTarget');
});

// 11. Zero-O attack against openai.
test('detectTypoSquat(0penai) -> openai target', () => {
  const r = detectTypoSquat('0penai');
  if (!r) throw new Error('expected match, got null');
  eq(r.matched, '0penai', 'matched echo');
  eq(r.suspectedTarget, 'openai', 'suspectedTarget');
});

// 12. Non-protected name with confusables present: returns null.
test('detectTypoSquat(some-other-pkg) -> null (not protected)', () => {
  eq(detectTypoSquat('some-other-pkg'), null, 'unknown name');
  eq(detectTypoSquat('sпme-pkg'), null, 'unknown name with Cyrillic confusable');
});

// 13. Empty + non-string defensive behavior.
test('detectTypoSquat handles empty + non-string defensively', () => {
  eq(detectTypoSquat(''), null, 'empty string');
  eq(detectTypoSquat(null), null, 'null');
  eq(detectTypoSquat(undefined), null, 'undefined');
  eq(detectTypoSquat(42), null, 'number');
  eq(detectTypoSquat({}), null, 'object');
});

// 14. Scoped-name self-match suppression (no false positive on @langchain/core).
test('detectTypoSquat(@langchain/core) -> null (legit scoped install)', () => {
  eq(detectTypoSquat('@langchain/core'), null, 'legit @langchain/core');
});

// 15. Scoped-name attack: Cyrillic а inside the scope.
test('detectTypoSquat(@lаngchain/core) -> @langchain/core target', () => {
  const r = detectTypoSquat('@lаngchain/core');
  if (!r) throw new Error('expected match, got null');
  eq(r.suspectedTarget, '@langchain/core', 'scoped suspectedTarget');
});

// ---------------------------------------------------------------------------
// Inventory integration — flag flows through buildInventory
// ---------------------------------------------------------------------------

// 16. Inventory: lockfile containing a Cyrillic attack name gets the flag.
test('inventory: lаngchain entry carries possibleTypoSquat', () => {
  const lock = JSON.stringify({
    lockfileVersion: 3,
    packages: {
      '': { name: 'root', version: '1.0.0', dependencies: { 'lаngchain': '^1.0' } },
      'node_modules/lаngchain': { version: '1.0.0', license: 'MIT' },
    },
  });
  const inv = buildInventory(lock);
  const pkg = findPkg(inv, 'lаngchain');
  if (!pkg.possibleTypoSquat) throw new Error('expected possibleTypoSquat, got null');
  eq(pkg.possibleTypoSquat.suspectedTarget, 'langchain', 'suspectedTarget');
  eq(pkg.possibleTypoSquat.matched, 'lаngchain', 'matched echo');
});

// 17. Inventory: legitimate package has null possibleTypoSquat.
test('inventory: lodash entry has null possibleTypoSquat', () => {
  const lock = JSON.stringify({
    lockfileVersion: 3,
    packages: {
      '': { name: 'root', version: '1.0.0', dependencies: { lodash: '^4' } },
      'node_modules/lodash': { version: '4.17.21', license: 'MIT' },
    },
  });
  const inv = buildInventory(lock);
  eq(findPkg(inv, 'lodash').possibleTypoSquat, null, 'lodash legitimate');
});

// 18. inventory.totals.possibleTypoSquatCount counts correctly.
test('inventory.totals.possibleTypoSquatCount across mixed lockfile', () => {
  const lock = JSON.stringify({
    lockfileVersion: 3,
    packages: {
      '': {
        name: 'root',
        version: '1.0.0',
        dependencies: {
          'lаngchain': '^1',     // Cyrillic а -> homoglyph attack
          '0penai': '^1',             // 0-as-O -> homoglyph attack
          'lodash': '^4',             // legit
          'react': '^18',             // legit
          'random-pkg': '^1',         // legit, not in protected list
        },
      },
      'node_modules/lаngchain': { version: '1.0.0' },
      'node_modules/0penai': { version: '1.0.0' },
      'node_modules/lodash': { version: '4.17.21' },
      'node_modules/react': { version: '18.0.0' },
      'node_modules/random-pkg': { version: '1.0.0' },
    },
  });
  const inv = buildInventory(lock);
  eq(inv.totals.possibleTypoSquatCount, 2, 'possibleTypoSquatCount = 2');
});

// 19. Self-match suppression byte-exact: case-different IS flagged.
test('detectTypoSquat: case-divergent (LangChain) still flags', () => {
  // npm normalizes names to lowercase, so any caller string with
  // capitals is itself suspicious enough to surface for review.
  const r = detectTypoSquat('LangChain');
  if (!r) throw new Error('expected case-divergent name to flag');
  eq(r.suspectedTarget, 'langchain', 'still maps to langchain');
});

// 20. Protected-list sanity: ~100 entries, all non-empty strings.
test('PROTECTED_PACKAGE_NAMES has at least 80 well-formed entries', () => {
  if (!Array.isArray(PROTECTED_PACKAGE_NAMES)) throw new Error('not an array');
  if (PROTECTED_PACKAGE_NAMES.length < 80) {
    throw new Error(`only ${PROTECTED_PACKAGE_NAMES.length} entries`);
  }
  for (const name of PROTECTED_PACKAGE_NAMES) {
    if (typeof name !== 'string' || !name) throw new Error(`bad entry: ${JSON.stringify(name)}`);
  }
});

// 21. No protected-list duplicates.
test('PROTECTED_PACKAGE_NAMES has no duplicates', () => {
  const seen = new Set();
  for (const n of PROTECTED_PACKAGE_NAMES) {
    if (seen.has(n)) throw new Error(`duplicate: ${n}`);
    seen.add(n);
  }
});

// 22. Round-trip: every protected name resolves to null via detectTypoSquat
// (self-match suppression).
test('every protected name is byte-exact self-suppressed', () => {
  for (const n of PROTECTED_PACKAGE_NAMES) {
    if (detectTypoSquat(n) !== null) {
      throw new Error(`self-match suppression broken for: ${n}`);
    }
  }
});

console.log('');
console.log(`Typo-squat tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
