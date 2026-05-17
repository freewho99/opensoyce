#!/usr/bin/env node
/**
 * Model-weight loader posture v0 — tests.
 *
 * Plain Node, no framework. Each test prints PASS/FAIL with a one-line
 * reason. Non-zero exit on any failure. Mirrors test-install-scripts.mjs.
 *
 * Locked contract:
 *   - getModelWeightLoader is case-insensitive on name, ecosystem-aware
 *   - Three risk tiers: 'load_pickle', 'torch_load', 'safe'
 *   - Inventory integration: package gets `modelWeightLoader` field
 *   - totals.modelWeightLoaderCount math matches package count
 *   - POSTURE recommendation only — no score / band / Risk Profile impact
 */
import { buildInventory } from '../src/shared/scanLockfile.js';
import {
  getModelWeightLoader,
  MODEL_WEIGHT_LOADERS,
} from '../src/data/modelWeightLoaders.js';

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
// Helper-level tests
// ---------------------------------------------------------------------------

// 1. huggingface_hub on PyPI -> load_pickle entry.
test('getModelWeightLoader(huggingface_hub, PyPI) returns load_pickle entry', () => {
  const entry = getModelWeightLoader('huggingface_hub', 'PyPI');
  if (!entry) throw new Error('expected entry, got null');
  eq(entry.name, 'huggingface_hub', 'entry.name');
  eq(entry.ecosystem, 'PyPI', 'entry.ecosystem');
  eq(entry.risk, 'load_pickle', 'entry.risk');
  eq(entry.safer, 'safetensors', 'entry.safer');
  if (typeof entry.reason !== 'string' || entry.reason.length === 0) {
    throw new Error('entry.reason missing or empty');
  }
});

// 2. safetensors on PyPI -> safe entry (affirmation chip).
test('getModelWeightLoader(safetensors, PyPI) returns safe entry', () => {
  const entry = getModelWeightLoader('safetensors', 'PyPI');
  if (!entry) throw new Error('expected entry, got null');
  eq(entry.risk, 'safe', 'safetensors risk tier');
  eq(entry.safer, null, 'safetensors.safer should be null');
});

// 3. Case-insensitive lookup.
test('getModelWeightLoader is case-insensitive', () => {
  const a = getModelWeightLoader('HuggingFace_Hub', 'PyPI');
  if (!a) throw new Error('mixed-case lookup failed');
  eq(a.name, 'huggingface_hub', 'mixed-case maps to canonical entry');
  const b = getModelWeightLoader('TRANSFORMERS', 'PyPI');
  if (!b) throw new Error('upper-case lookup failed');
  eq(b.name, 'transformers', 'upper-case maps to canonical entry');
});

// 4. Wrong ecosystem -> null.
test('getModelWeightLoader rejects wrong ecosystem', () => {
  // huggingface_hub is a PyPI package; npm scan must not match.
  eq(getModelWeightLoader('huggingface_hub', 'npm'), null, 'PyPI name on npm scan');
  // @huggingface/transformers is npm; PyPI must not match.
  eq(getModelWeightLoader('@huggingface/transformers', 'PyPI'), null, 'npm name on PyPI scan');
});

// 5. npm-side entry.
test('getModelWeightLoader(@huggingface/transformers, npm) returns load_pickle entry', () => {
  const entry = getModelWeightLoader('@huggingface/transformers', 'npm');
  if (!entry) throw new Error('expected entry, got null');
  eq(entry.ecosystem, 'npm', 'entry.ecosystem');
  eq(entry.risk, 'load_pickle', 'entry.risk');
});

// 6. Not on list -> null.
test('getModelWeightLoader returns null for non-listed package', () => {
  eq(getModelWeightLoader('random-package', 'PyPI'), null, 'PyPI random');
  eq(getModelWeightLoader('lodash', 'npm'), null, 'npm random');
});

// 7. torch_load risk tier.
test('getModelWeightLoader(torch, PyPI) returns torch_load tier', () => {
  const entry = getModelWeightLoader('torch', 'PyPI');
  if (!entry) throw new Error('expected entry, got null');
  eq(entry.risk, 'torch_load', 'torch risk tier');
  eq(entry.safer, 'safetensors', 'torch safer');
});

// 8. Empty / null input -> null, no throw.
test('getModelWeightLoader handles empty/null input without throwing', () => {
  eq(getModelWeightLoader('', 'PyPI'), null, 'empty name');
  eq(getModelWeightLoader(null, 'PyPI'), null, 'null name');
  eq(getModelWeightLoader(undefined, 'PyPI'), null, 'undefined name');
  eq(getModelWeightLoader('huggingface_hub', null), null, 'null ecosystem');
  eq(getModelWeightLoader('huggingface_hub', 'unknown'), null, 'unknown ecosystem');
  eq(getModelWeightLoader('huggingface_hub', ''), null, 'empty ecosystem');
});

// ---------------------------------------------------------------------------
// Inventory integration tests
// ---------------------------------------------------------------------------

// 9. PyPI lockfile with huggingface_hub -> package has modelWeightLoader.
test('uv.lock with huggingface_hub: modelWeightLoader populated', () => {
  const lock = `
version = 1
requires-python = ">=3.10"

[[manifest.dependency]]
name = "huggingface_hub"

[[package]]
name = "huggingface_hub"
version = "0.20.0"
source = { registry = "https://pypi.org/simple" }

[[package]]
name = "requests"
version = "2.31.0"
source = { registry = "https://pypi.org/simple" }
`.trimStart();
  const inv = buildInventory(lock);
  const hf = findPkg(inv, 'huggingface_hub');
  if (!hf.modelWeightLoader) throw new Error('expected modelWeightLoader on huggingface_hub');
  eq(hf.modelWeightLoader.risk, 'load_pickle', 'risk tier');
  eq(hf.modelWeightLoader.ecosystem, 'PyPI', 'ecosystem');
});

// 10. Random package -> modelWeightLoader is null.
test('uv.lock: non-listed package has modelWeightLoader === null', () => {
  const lock = `
version = 1
requires-python = ">=3.10"

[[package]]
name = "requests"
version = "2.31.0"
source = { registry = "https://pypi.org/simple" }
`.trimStart();
  const inv = buildInventory(lock);
  const r = findPkg(inv, 'requests');
  eq(r.modelWeightLoader, null, 'requests.modelWeightLoader');
});

// 11. safetensors triggers SAFE-format affirmation chip data.
test('uv.lock with safetensors: modelWeightLoader.risk === safe', () => {
  const lock = `
version = 1
requires-python = ">=3.10"

[[package]]
name = "safetensors"
version = "0.4.0"
source = { registry = "https://pypi.org/simple" }
`.trimStart();
  const inv = buildInventory(lock);
  const st = findPkg(inv, 'safetensors');
  if (!st.modelWeightLoader) throw new Error('expected modelWeightLoader on safetensors');
  eq(st.modelWeightLoader.risk, 'safe', 'safetensors safe tier');
  eq(st.modelWeightLoader.safer, null, 'safetensors.safer should be null');
});

// 12. totals.modelWeightLoaderCount math.
test('uv.lock: modelWeightLoaderCount matches actual hits', () => {
  const lock = `
version = 1
requires-python = ">=3.10"

[[package]]
name = "huggingface_hub"
version = "0.20.0"
source = { registry = "https://pypi.org/simple" }

[[package]]
name = "transformers"
version = "4.35.0"
source = { registry = "https://pypi.org/simple" }

[[package]]
name = "torch"
version = "2.1.0"
source = { registry = "https://pypi.org/simple" }

[[package]]
name = "safetensors"
version = "0.4.0"
source = { registry = "https://pypi.org/simple" }

[[package]]
name = "requests"
version = "2.31.0"
source = { registry = "https://pypi.org/simple" }
`.trimStart();
  const inv = buildInventory(lock);
  // 4 of 5 packages are on the curated list.
  eq(inv.totals.modelWeightLoaderCount, 4, 'modelWeightLoaderCount');
  // Spot-check tiers.
  eq(findPkg(inv, 'huggingface_hub').modelWeightLoader.risk, 'load_pickle', 'hf risk');
  eq(findPkg(inv, 'transformers').modelWeightLoader.risk, 'load_pickle', 'transformers risk');
  eq(findPkg(inv, 'torch').modelWeightLoader.risk, 'torch_load', 'torch risk');
  eq(findPkg(inv, 'safetensors').modelWeightLoader.risk, 'safe', 'safetensors risk');
  eq(findPkg(inv, 'requests').modelWeightLoader, null, 'requests not on list');
});

// 13. List sanity: 10–15 entries, all well-formed, no dupes within ecosystem.
test('MODEL_WEIGHT_LOADERS shape + no duplicates per (name, ecosystem)', () => {
  if (!Array.isArray(MODEL_WEIGHT_LOADERS)) throw new Error('not an array');
  if (MODEL_WEIGHT_LOADERS.length < 10 || MODEL_WEIGHT_LOADERS.length > 20) {
    throw new Error(`unexpected entry count: ${MODEL_WEIGHT_LOADERS.length}`);
  }
  const seen = new Set();
  for (const e of MODEL_WEIGHT_LOADERS) {
    if (typeof e.name !== 'string' || !e.name) throw new Error(`bad name in ${JSON.stringify(e)}`);
    if (e.ecosystem !== 'npm' && e.ecosystem !== 'PyPI') {
      throw new Error(`bad ecosystem in ${JSON.stringify(e)}`);
    }
    if (!['load_pickle', 'torch_load', 'safe'].includes(e.risk)) {
      throw new Error(`bad risk in ${JSON.stringify(e)}`);
    }
    if (e.risk === 'safe' && e.safer !== null) {
      throw new Error(`safe tier must have safer === null: ${JSON.stringify(e)}`);
    }
    if (e.risk !== 'safe' && (typeof e.safer !== 'string' || !e.safer)) {
      throw new Error(`non-safe tier must have safer string: ${JSON.stringify(e)}`);
    }
    if (typeof e.reason !== 'string' || !e.reason) throw new Error(`bad reason in ${JSON.stringify(e)}`);
    const key = `${e.ecosystem}::${e.name.toLowerCase()}`;
    if (seen.has(key)) throw new Error(`duplicate: ${key}`);
    seen.add(key);
  }
});

console.log('');
console.log(`Model-weight loader tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
