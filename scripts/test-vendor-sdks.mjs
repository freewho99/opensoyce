#!/usr/bin/env node
/**
 * AI signals v0.1 — vendor-SDK allowlist tests.
 *
 * Plain Node, PASS/FAIL per case, non-zero exit on any failure.
 */
import { isVendorSdk, getVendorSdk, VENDOR_SDKS } from '../src/data/vendorSdks.js';

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`PASS  ${name}`); passed += 1; }
  catch (e) { console.log(`FAIL  ${name} -- ${e.message}`); failed += 1; }
}
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

test('isVendorSdk(openai, openai-node) → true', () => {
  eq(isVendorSdk('openai', 'openai-node'), true, 'OpenAI node SDK');
});
test('isVendorSdk(OpenAI, openai-node) → true (case-insensitive)', () => {
  eq(isVendorSdk('OpenAI', 'openai-node'), true, 'case-insensitive owner');
});
test('isVendorSdk(openai, OPENAI-NODE) → true (case-insensitive repo)', () => {
  eq(isVendorSdk('openai', 'OPENAI-NODE'), true, 'case-insensitive repo');
});
test('isVendorSdk(random-org, random-repo) → false', () => {
  eq(isVendorSdk('random-org', 'random-repo'), false, 'not on allowlist');
});
test('isVendorSdk(non-strings) → false (defensive)', () => {
  eq(isVendorSdk(null, 'x'), false, 'null safe');
  eq(isVendorSdk('x', undefined), false, 'undefined safe');
  eq(isVendorSdk(42, 'x'), false, 'number safe');
});

test('getVendorSdk(anthropics, anthropic-sdk-typescript) → entry with vendor/reason', () => {
  const entry = getVendorSdk('anthropics', 'anthropic-sdk-typescript');
  if (!entry) throw new Error('expected entry, got null');
  eq(entry.vendor, 'Anthropic', 'vendor');
  if (typeof entry.reason !== 'string' || entry.reason.length === 0) {
    throw new Error('reason missing');
  }
});
test('getVendorSdk(unknown, repo) → null', () => {
  eq(getVendorSdk('unknown', 'repo'), null, 'unknown returns null');
});
test('getVendorSdk is case-insensitive', () => {
  const entry = getVendorSdk('STRIPE', 'Stripe-Node');
  if (!entry) throw new Error('expected case-insensitive match');
  eq(entry.vendor, 'Stripe', 'vendor');
});

test('VENDOR_SDKS has at least 15 entries', () => {
  if (!Array.isArray(VENDOR_SDKS)) throw new Error('not an array');
  if (VENDOR_SDKS.length < 15) throw new Error(`only ${VENDOR_SDKS.length} entries`);
});
test('VENDOR_SDKS entries all have owner/repo/vendor/reason strings', () => {
  for (const e of VENDOR_SDKS) {
    if (typeof e.owner !== 'string' || !e.owner) throw new Error(`bad owner in ${JSON.stringify(e)}`);
    if (typeof e.repo !== 'string' || !e.repo) throw new Error(`bad repo in ${JSON.stringify(e)}`);
    if (typeof e.vendor !== 'string' || !e.vendor) throw new Error(`bad vendor in ${JSON.stringify(e)}`);
    if (typeof e.reason !== 'string' || !e.reason) throw new Error(`bad reason in ${JSON.stringify(e)}`);
  }
});
test('VENDOR_SDKS has no duplicate owner/repo pairs', () => {
  const seen = new Set();
  for (const e of VENDOR_SDKS) {
    const key = `${e.owner.toLowerCase()}/${e.repo.toLowerCase()}`;
    if (seen.has(key)) throw new Error(`duplicate: ${key}`);
    seen.add(key);
  }
});
test('Coverage: OpenAI Node SDK present', () => {
  eq(isVendorSdk('openai', 'openai-node'), true, 'openai/openai-node');
});
test('Coverage: Anthropic Python SDK present', () => {
  eq(isVendorSdk('anthropics', 'anthropic-sdk-python'), true, 'anthropics/anthropic-sdk-python');
});
test('Coverage: Stripe Node present', () => {
  eq(isVendorSdk('stripe', 'stripe-node'), true, 'stripe/stripe-node');
});

console.log('');
console.log(`Vendor-SDK tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
