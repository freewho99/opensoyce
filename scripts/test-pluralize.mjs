#!/usr/bin/env node
/**
 * P2-7 — Unit tests for the plural() helper.
 * Plain Node, PASS/FAIL per case, non-zero exit on any failure.
 */
import { plural } from '../src/shared/pluralize.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try { fn(); console.log(`PASS  ${name}`); passed += 1; }
  catch (e) { console.log(`FAIL  ${name} -- ${e.message}`); failed += 1; }
}
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// Irregular plural via explicit form.
test('plural(0, "advisory", "advisories") === "0 advisories"', () => {
  eq(plural(0, 'advisory', 'advisories'), '0 advisories', 'zero plural');
});
test('plural(1, "advisory", "advisories") === "1 advisory"', () => {
  eq(plural(1, 'advisory', 'advisories'), '1 advisory', 'one singular');
});
test('plural(2, "advisory", "advisories") === "2 advisories"', () => {
  eq(plural(2, 'advisory', 'advisories'), '2 advisories', 'two plural');
});
test('plural(5, "advisory", "advisories") === "5 advisories"', () => {
  eq(plural(5, 'advisory', 'advisories'), '5 advisories', 'five plural');
});

// Default plural = singular + "s".
test('plural(0, "package") === "0 packages"', () => {
  eq(plural(0, 'package'), '0 packages', 'zero default plural');
});
test('plural(1, "package") === "1 package"', () => {
  eq(plural(1, 'package'), '1 package', 'one default singular');
});
test('plural(2, "package") === "2 packages"', () => {
  eq(plural(2, 'package'), '2 packages', 'two default plural');
});

// Composite phrase via singular/plural.
test('plural(1, "high/critical advisory", "high/critical advisories") singular', () => {
  eq(plural(1, 'high/critical advisory', 'high/critical advisories'),
    '1 high/critical advisory', 'composite singular');
});
test('plural(3, "high/critical advisory", "high/critical advisories") plural', () => {
  eq(plural(3, 'high/critical advisory', 'high/critical advisories'),
    '3 high/critical advisories', 'composite plural');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
