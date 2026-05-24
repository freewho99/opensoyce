#!/usr/bin/env node
/**
 * Test: policy inheritance (Phase 3).
 * Covers: presets, mergePolicy security-conservative rules, fetchOrgPolicy,
 * resolvePolicy pipeline, extractPolicyMetadata.
 */

import {
  DEFAULT_POLICY,
  POLICY_PRESETS,
  resolvePreset,
  normalizeBucket,
  mergePolicy,
  parseYamlPolicy,
  extractPolicyMetadata,
  resolvePolicy,
} from '../src/shared/policyInheritance.js';

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

function assertContains(desc, arr, ...items) {
  const arrStr = JSON.stringify(arr);
  for (const item of items) {
    if (!arr.includes(item)) {
      console.error(`  ❌ ${desc}: "${item}" not found in ${arrStr}`);
      failed++;
      return;
    }
  }
  console.log(`  ✅ ${desc}`);
  passed++;
}

function assertNotContains(desc, arr, ...items) {
  const arrStr = JSON.stringify(arr);
  for (const item of items) {
    if (arr.includes(item)) {
      console.error(`  ❌ ${desc}: "${item}" should NOT be in ${arrStr}`);
      failed++;
      return;
    }
  }
  console.log(`  ✅ ${desc}`);
  passed++;
}

// ---------------------------------------------------------------------------
console.log('\n=== normalizeBucket ===');

assert('valid labels pass through',
  normalizeBucket(['graveyard', 'risky', 'use-ready'], 'block'),
  ['graveyard', 'risky', 'use-ready'],
);
assert('non-array returns []',
  normalizeBucket('risky', 'block'),
  [],
);
assert('unknown labels are dropped',
  normalizeBucket(['graveyard', 'malware', 'risky'], 'block'),
  ['graveyard', 'risky'],
);
assert('uppercase is normalized',
  normalizeBucket(['GRAVEYARD', 'Risky'], 'block'),
  ['graveyard', 'risky'],
);

// ---------------------------------------------------------------------------
console.log('\n=== resolvePreset ===');

const soc2 = resolvePreset('soc2');
assertContains('soc2 blocks graveyard+risky', soc2.block, 'graveyard', 'risky');
assertNotContains('soc2 does not block watchlist', soc2.block, 'watchlist');
assertContains('soc2 warns on watchlist', soc2.warn, 'watchlist');

const strict = resolvePreset('strict');
assertContains('strict blocks watchlist too', strict.block, 'watchlist', 'risky', 'graveyard');

const permissive = resolvePreset('permissive');
assert('permissive only blocks graveyard', permissive.block, ['graveyard']);

const unknown = resolvePreset('nonexistent');
assert('unknown preset falls back to DEFAULT_POLICY.block', unknown.block, DEFAULT_POLICY.block);

// ---------------------------------------------------------------------------
console.log('\n=== mergePolicy ===');

const orgP = { block: ['graveyard'], warn: ['risky', 'watchlist'], allow: ['use-ready', 'stable', 'forkable'] };
const repoP = { block: ['risky'], warn: ['watchlist'], allow: ['use-ready', 'stable', 'forkable'] };
const merged = mergePolicy(orgP, repoP);

// Union: graveyard from org, risky from repo
assertContains('merged.block has union of both', merged.block, 'graveyard', 'risky');
// watchlist was in org.warn; it stays in warn since it's not in merged.block
assertContains('merged.warn has watchlist', merged.warn, 'watchlist');
// risky was in org.warn but is now in merged.block — must be removed from warn
assertNotContains('merged.warn does NOT have risky (promoted to block)', merged.warn, 'risky');

// Security: repo can escalate but not demote
const orgStrict = { block: ['graveyard', 'risky', 'watchlist'], warn: [], allow: ['use-ready', 'stable', 'forkable'] };
const repoPermissive = { block: [], warn: ['watchlist'], allow: ['use-ready', 'stable', 'forkable', 'watchlist'] };
const mergedSec = mergePolicy(orgStrict, repoPermissive);
assertContains('repo cannot remove from org.block: watchlist still blocked', mergedSec.block, 'watchlist');

// ---------------------------------------------------------------------------
console.log('\n=== parseYamlPolicy ===');

const yamlFull = `
policy:
  block: [graveyard, risky]
  warn: [watchlist]
  allow: [use-ready, stable, forkable]
`;
const parsed = parseYamlPolicy(yamlFull);
assert('full YAML parses correctly', parsed.block, ['graveyard', 'risky']);
assert('warn parses correctly', parsed.warn, ['watchlist']);

const yamlPresetOnly = `preset: soc2`;
const parsedPreset = parseYamlPolicy(yamlPresetOnly);
assertContains('preset-only YAML resolves to soc2 policy', parsedPreset.block, 'graveyard', 'risky');

assert('invalid YAML returns null', parseYamlPolicy('{{invalid: yaml: [}'), null);
assert('empty string returns null', parseYamlPolicy(''), null);
assert('no policy key returns null', parseYamlPolicy('org: my-org/policy'), null);

// ---------------------------------------------------------------------------
console.log('\n=== extractPolicyMetadata ===');

const meta1 = extractPolicyMetadata(`
org: my-org/opensoyce-policy
preset: soc2
policy:
  block: [graveyard]
`);
assert('extracts orgPolicyRepo', meta1.orgPolicyRepo, 'my-org/opensoyce-policy');
assert('extracts preset', meta1.preset, 'soc2');

const meta2 = extractPolicyMetadata(`policy:\n  block: [graveyard]`);
assert('null orgPolicyRepo when absent', meta2.orgPolicyRepo, null);
assert('null preset when absent', meta2.preset, null);

const meta3 = extractPolicyMetadata('invalid {{yaml}}');
assert('invalid YAML returns nulls', meta3.orgPolicyRepo, null);

// ---------------------------------------------------------------------------
console.log('\n=== resolvePolicy ===');

// No-op githubFetch (simulates no org repo)
const noFetch = async () => ({ ok: false, status: 404, text: async () => '', json: async () => ({}) });

const r1 = await resolvePolicy({
  githubFetch: noFetch,
  orgPolicyRepo: null,
  preset: 'soc2',
  repoPolicy: { block: ['watchlist'], warn: ['stable'], allow: ['use-ready', 'forkable'] },
});
assertContains('preset+repo: soc2 preset blocks graveyard+risky', r1.policy.block, 'graveyard', 'risky');
assertContains('preset+repo: repo adds watchlist to block', r1.policy.block, 'watchlist');
assert('policySource includes preset and repo', r1.policySource, 'preset+repo');

const r2 = await resolvePolicy({
  githubFetch: noFetch,
  orgPolicyRepo: null,
  preset: null,
  repoPolicy: null,
});
assert('no inputs → default policySource', r2.policySource, 'default');
assert('default policy block is empty', r2.policy.block, []);

// Simulate an org policy fetch that returns a valid YAML
const orgFetch = async (path) => {
  if (path.includes('.opensoyce.yml')) {
    return {
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => ({
        content: Buffer.from(`policy:\n  block: [graveyard, risky]\n  warn: [watchlist]\n`).toString('base64'),
      }),
    };
  }
  return { ok: false, status: 404, text: async () => '' };
};

const r3 = await resolvePolicy({
  githubFetch: orgFetch,
  orgPolicyRepo: 'my-org/opensoyce-policy',
  preset: null,
  repoPolicy: { block: ['watchlist'], warn: ['stable'], allow: ['use-ready', 'forkable'] },
});
assertContains('org+repo: org blocks graveyard+risky', r3.policy.block, 'graveyard', 'risky');
assertContains('org+repo: repo escalates watchlist to block', r3.policy.block, 'watchlist');
assert('policySource = org+repo', r3.policySource, 'org+repo');

// ---------------------------------------------------------------------------
console.log('\n=== POLICY_PRESETS ===');

for (const [name, preset] of Object.entries(POLICY_PRESETS)) {
  const allKeys = [...preset.block, ...preset.warn, ...preset.allow];
  const dupes = allKeys.filter((k, i) => allKeys.indexOf(k) !== i);
  assert(`preset "${name}" has no duplicate labels across buckets`, dupes.length, 0);
}

// ---------------------------------------------------------------------------
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
