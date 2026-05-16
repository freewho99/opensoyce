#!/usr/bin/env node
/**
 * parseIgnoreFile + matchesIgnoreRule verification.
 * Plain Node, PASS/FAIL per case, non-zero exit on any failure.
 */
import { parseIgnoreFile, matchesIgnoreRule } from '../src/shared/parseIgnoreFile.js';

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

// 1. Parse basic file
test('parse basic file: 3 rules + comments + blanks → 3 rules', () => {
  const text = `# top comment
pkg:minimist@1.2.5
cve:CVE-2020-28500

# inline
ghsa:GHSA-29mw-wpgm-hmr9
`;
  const { rules, errors } = parseIgnoreFile(text);
  eq(errors.length, 0, 'no errors');
  eq(rules.length, 3, 'three rules');
  eq(rules[0].kind, 'pkg', 'rule 0 kind');
  eq(rules[0].value, 'minimist', 'rule 0 value');
  eq(rules[0].version, '1.2.5', 'rule 0 version');
  eq(rules[1].kind, 'cve', 'rule 1 kind');
  eq(rules[1].value, 'CVE-2020-28500', 'rule 1 value');
  eq(rules[2].kind, 'ghsa', 'rule 2 kind');
  eq(rules[2].value, 'GHSA-29mw-wpgm-hmr9', 'rule 2 value');
});

// 2. Comment with reason
test('trailing comment captured as rule.comment', () => {
  const { rules } = parseIgnoreFile('pkg:minimist@1.2.5  # vendored');
  eq(rules.length, 1, 'one rule');
  eq(rules[0].comment, 'vendored', 'comment captured');
});

// 3. Match by CVE
test('match by CVE: vuln with CVE-2020-28500 matches cve:CVE-2020-28500', () => {
  const { rules } = parseIgnoreFile('cve:CVE-2020-28500');
  const match = matchesIgnoreRule(
    { package: 'lodash', version: '4.17.20', ids: ['GHSA-29mw-wpgm-hmr9', 'CVE-2020-28500'] },
    rules,
  );
  ok(match, 'matched');
  eq(match.kind, 'cve', 'matched cve rule');
  eq(match.value, 'CVE-2020-28500', 'matched value');
});

// 4. Match by GHSA
test('match by GHSA', () => {
  const { rules } = parseIgnoreFile('ghsa:GHSA-29mw-wpgm-hmr9');
  const match = matchesIgnoreRule(
    { package: 'lodash', version: '4.17.20', ids: ['GHSA-29mw-wpgm-hmr9'] },
    rules,
  );
  ok(match, 'matched');
  eq(match.kind, 'ghsa', 'matched ghsa rule');
});

test('match by advisory: works for either CVE or GHSA', () => {
  const { rules } = parseIgnoreFile('advisory:CVE-2020-28500\nadvisory:GHSA-xxxx-yyyy-zzzz');
  const a = matchesIgnoreRule({ package: 'a', version: '1', ids: ['CVE-2020-28500'] }, rules);
  ok(a && a.value === 'CVE-2020-28500', 'advisory matched CVE');
  const b = matchesIgnoreRule({ package: 'a', version: '1', ids: ['GHSA-xxxx-yyyy-zzzz'] }, rules);
  ok(b && b.value === 'GHSA-xxxx-yyyy-zzzz', 'advisory matched GHSA');
});

// 5. Match pkg + version
test('match by package + version: pkg:minimist@1.2.5 matches 1.2.5 not 1.2.6', () => {
  const { rules } = parseIgnoreFile('pkg:minimist@1.2.5');
  const yes = matchesIgnoreRule({ package: 'minimist', version: '1.2.5', ids: [] }, rules);
  ok(yes, '1.2.5 matched');
  const no = matchesIgnoreRule({ package: 'minimist', version: '1.2.6', ids: [] }, rules);
  ok(!no, '1.2.6 did NOT match');
});

// 6. Match pkg only (any version)
test('match by package only: pkg:minimist matches all versions', () => {
  const { rules } = parseIgnoreFile('pkg:minimist');
  const a = matchesIgnoreRule({ package: 'minimist', version: '1.2.5', ids: [] }, rules);
  const b = matchesIgnoreRule({ package: 'minimist', version: '0.0.1', ids: [] }, rules);
  ok(a, '1.2.5 matched');
  ok(b, '0.0.1 matched');
});

test('scoped package name parsed correctly: pkg:@scope/x', () => {
  const { rules } = parseIgnoreFile('pkg:@scope/x');
  eq(rules.length, 1, 'one rule');
  eq(rules[0].kind, 'pkg', 'kind');
  eq(rules[0].value, '@scope/x', 'leading @ is scope, not version');
  ok(!rules[0].version, 'no version on scope-only rule');
  const m = matchesIgnoreRule({ package: '@scope/x', version: '1.0.0', ids: [] }, rules);
  ok(m, 'scoped pkg matched');
});

test('scoped package with version: pkg:@scope/x@2.0.0', () => {
  const { rules } = parseIgnoreFile('pkg:@scope/x@2.0.0');
  eq(rules.length, 1, 'one rule');
  eq(rules[0].value, '@scope/x', 'name');
  eq(rules[0].version, '2.0.0', 'version');
  const yes = matchesIgnoreRule({ package: '@scope/x', version: '2.0.0', ids: [] }, rules);
  ok(yes, 'exact-version match');
  const no = matchesIgnoreRule({ package: '@scope/x', version: '2.0.1', ids: [] }, rules);
  ok(!no, 'other version no match');
});

// 7. No match
test('no match: vuln id not listed returns null', () => {
  const { rules } = parseIgnoreFile('cve:CVE-2020-28500');
  const out = matchesIgnoreRule({ package: 'x', version: '1', ids: ['CVE-9999-0001'] }, rules);
  eq(out, null, 'no match → null');
});

// 8. Empty file
test('empty file parses to rules: []', () => {
  const { rules, errors } = parseIgnoreFile('');
  eq(rules.length, 0, 'no rules');
  eq(errors.length, 0, 'no errors');
  const { rules: r2, errors: e2 } = parseIgnoreFile('# only comments\n#another\n\n');
  eq(r2.length, 0, 'comment-only file → no rules');
  eq(e2.length, 0, 'comment-only file → no errors');
});

// 9. Invalid line
test('invalid line: goes into errors[] without crashing', () => {
  const { rules, errors } = parseIgnoreFile(`pkg:lodash
not a valid rule
cve:CVE-1`);
  eq(rules.length, 2, 'valid rules preserved');
  eq(errors.length, 1, 'one error');
  ok(errors[0].includes('invalid rule'), 'error message identifies the problem');
});

test('invalid kind: unknown:foo goes into errors', () => {
  const { rules, errors } = parseIgnoreFile('unknown:foo\npkg:bar');
  eq(rules.length, 1, 'only pkg rule survived');
  eq(errors.length, 1, 'unknown kind logged');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
