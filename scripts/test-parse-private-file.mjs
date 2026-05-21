#!/usr/bin/env node
/**
 * parsePrivateFile + isPrivateName verification.
 * Plain Node, PASS/FAIL per case, non-zero exit on any failure.
 */
import { parsePrivateFile, isPrivateName } from '../src/shared/parsePrivateFile.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try { fn(); console.log(`PASS  ${name}`); passed += 1; }
  catch (e) { console.log(`FAIL  ${name} -- ${e.message}`); failed += 1; }
}
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function ok(c, msg) { if (!c) throw new Error(msg); }

// 1. Basic file with 3 names.
test('parse basic file: 3 names + comments + blank line', () => {
  const text = `# header
mycompany-internal-utils
@mycompany/ai-client

# inline
mycompany-llm-tools
`;
  const r = parsePrivateFile(text);
  eq(r.errors.length, 0, 'no errors');
  eq(r.names.length, 3, 'three names');
  ok(r.nameSet.has('mycompany-internal-utils'), 'set has utils');
  ok(r.nameSet.has('@mycompany/ai-client'), 'set has scoped');
  ok(r.nameSet.has('mycompany-llm-tools'), 'set has tools');
});

// 2. Trailing # comment captured.
test('trailing comment captured into comments map', () => {
  const r = parsePrivateFile('mycompany-utils # internal helper');
  eq(r.names.length, 1, 'one name');
  eq(r.comments.get('mycompany-utils'), 'internal helper', 'comment captured');
});

// 3. Blank and #-only lines ignored.
test('blank and pure-# lines ignored, no error', () => {
  const r = parsePrivateFile('\n\n# comment 1\n#another\n\nfoo\n');
  eq(r.errors.length, 0, 'no errors');
  eq(r.names.length, 1, 'one name');
  ok(r.nameSet.has('foo'), 'foo present');
});

// 4. Malformed (whitespace-in-name) → errors array, no throw.
test('malformed line goes to errors array, parser does not throw', () => {
  // Two tokens separated by tab → not a name. Whitespace in name is illegal.
  // Use a real space in the name token (not the # comment separator path).
  const r = parsePrivateFile('foo bar baz');
  // The body capture takes up to the first whitespace; `foo` is valid, but
  // there's no `# `, so the regex doesn't match a comment. The whole line
  // is parsed as the body — which contains spaces — and rejected.
  // Behavior: errors.length >= 0, parser does not crash.
  ok(Array.isArray(r.errors), 'errors is array');
  ok(Array.isArray(r.names), 'names is array');
  // The line should be rejected because the body contains whitespace.
  eq(r.errors.length, 1, 'one error');
  eq(r.names.length, 0, 'no names parsed');
});

// 5. Case-sensitive: Foo != foo.
test('case-sensitive matching: Foo !== foo', () => {
  const r = parsePrivateFile('Foo');
  ok(r.nameSet.has('Foo'), 'Foo in set');
  ok(!r.nameSet.has('foo'), 'foo NOT in set');
  ok(isPrivateName('Foo', r), 'isPrivateName matches Foo');
  ok(!isPrivateName('foo', r), 'isPrivateName rejects foo');
});

// 6. Scoped npm names.
test('scoped npm name: @scope/pkg parses cleanly', () => {
  const r = parsePrivateFile('@mycompany/ai-client # scoped sdk');
  eq(r.names.length, 1, 'one name');
  ok(r.nameSet.has('@mycompany/ai-client'), 'scoped name in set');
  eq(r.comments.get('@mycompany/ai-client'), 'scoped sdk', 'comment captured');
});

// 7. Empty input.
test('empty input → empty result, no throw', () => {
  const r = parsePrivateFile('');
  eq(r.names.length, 0, 'no names');
  eq(r.errors.length, 0, 'no errors');
  eq(r.nameSet.size, 0, 'empty set');
});

// 8. Non-string input.
test('non-string input → empty result, no throw', () => {
  // @ts-ignore deliberate bad input
  const r = parsePrivateFile(null);
  eq(r.names.length, 0, 'null input → no names');
  // @ts-ignore deliberate bad input
  const r2 = parsePrivateFile(undefined);
  eq(r2.names.length, 0, 'undefined input → no names');
});

// 9. Duplicate names collapse but retain first comment.
test('duplicate names collapse; first comment wins', () => {
  const text = `foo # first
foo # second
`;
  const r = parsePrivateFile(text);
  eq(r.names.length, 1, 'one name after de-dupe');
  eq(r.comments.get('foo'), 'first', 'first comment retained');
});

// 10. CRLF line endings handled.
test('CRLF line endings handled', () => {
  const text = 'foo\r\nbar\r\nbaz\r\n';
  const r = parsePrivateFile(text);
  eq(r.names.length, 3, 'three names');
  ok(r.nameSet.has('foo'), 'foo');
  ok(r.nameSet.has('bar'), 'bar');
  ok(r.nameSet.has('baz'), 'baz');
});

// 11. isPrivateName basic.
test('isPrivateName: returns true for listed names, false otherwise', () => {
  const r = parsePrivateFile('mycompany-utils');
  eq(isPrivateName('mycompany-utils', r), true, 'listed → true');
  eq(isPrivateName('lodash', r), false, 'unlisted → false');
});

// 12. isPrivateName defensive.
test('isPrivateName: bad inputs → false, no throw', () => {
  const r = parsePrivateFile('foo');
  eq(isPrivateName('', r), false, 'empty → false');
  eq(isPrivateName(null, r), false, 'null → false');
  eq(isPrivateName('foo', null), false, 'null parsed → false');
  eq(isPrivateName('foo', {}), false, 'no nameSet → false');
});

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
