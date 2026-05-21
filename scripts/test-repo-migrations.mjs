#!/usr/bin/env node
/**
 * Fork-velocity-of-namesake v0 — curated migration table tests.
 *
 * Plain Node, PASS/FAIL per case, non-zero exit on any failure.
 */
import {
  REPO_MIGRATIONS,
  getCuratedMigration,
  hasCuratedMigration,
} from '../src/data/repoMigrations.js';

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`PASS  ${name}`); passed += 1; }
  catch (e) { console.log(`FAIL  ${name} -- ${e.message}`); failed += 1; }
}
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

test('getCuratedMigration(xenova, transformers) → resolves to huggingface/transformers.js', () => {
  const entry = getCuratedMigration('xenova', 'transformers');
  if (!entry) throw new Error('expected curated entry, got null');
  eq(entry.from.owner, 'xenova', 'from.owner');
  eq(entry.from.repo, 'transformers', 'from.repo');
  if (!entry.to) throw new Error('expected non-null successor');
  eq(entry.to.owner, 'huggingface', 'to.owner');
  eq(entry.to.repo, 'transformers.js', 'to.repo');
});

test('getCuratedMigration is case-insensitive on owner and repo', () => {
  const a = getCuratedMigration('Xenova', 'Transformers');
  if (!a) throw new Error('expected case-insensitive match');
  eq(a.to.owner, 'huggingface', 'matches the canonical entry');
  const b = getCuratedMigration('XENOVA', 'TRANSFORMERS');
  if (!b) throw new Error('expected upper-case match');
});

test('getCuratedMigration(random-org, random-repo) → null', () => {
  eq(getCuratedMigration('random-org', 'random-repo'), null, 'unknown returns null');
});

test('getCuratedMigration non-string inputs → null (defensive)', () => {
  eq(getCuratedMigration(null, 'x'), null, 'null owner');
  eq(getCuratedMigration('x', undefined), null, 'undefined repo');
  eq(getCuratedMigration(42, 'x'), null, 'number owner');
  eq(getCuratedMigration('', 'x'), null, 'empty owner');
  eq(getCuratedMigration('x', ''), null, 'empty repo');
});

test('hasCuratedMigration returns boolean correctly', () => {
  eq(hasCuratedMigration('xenova', 'transformers'), true, 'present');
  eq(hasCuratedMigration('not-real', 'not-real'), false, 'absent');
  // A deprecated-without-successor entry still counts as "has migration".
  eq(hasCuratedMigration('request', 'request'), true, 'deprecated entry still counts');
});

test('Entries with to: null parse correctly (deprecated-without-successor)', () => {
  const entry = getCuratedMigration('request', 'request');
  if (!entry) throw new Error('expected the request entry');
  eq(entry.to, null, 'to is null');
  if (typeof entry.reason !== 'string' || entry.reason.length === 0) {
    throw new Error('deprecated entries still need a reason');
  }
  if (typeof entry.migratedAt !== 'string' || entry.migratedAt.length === 0) {
    throw new Error('deprecated entries still need a migratedAt');
  }
});

test('Required fields present on every entry (sanity)', () => {
  if (!Array.isArray(REPO_MIGRATIONS) || REPO_MIGRATIONS.length < 15) {
    throw new Error(`expected at least 15 entries, got ${REPO_MIGRATIONS.length}`);
  }
  for (const entry of REPO_MIGRATIONS) {
    if (!entry || typeof entry !== 'object') throw new Error('entry must be object');
    if (!entry.from || typeof entry.from.owner !== 'string' || typeof entry.from.repo !== 'string') {
      throw new Error(`entry.from malformed: ${JSON.stringify(entry)}`);
    }
    if (entry.to !== null) {
      if (!entry.to || typeof entry.to.owner !== 'string' || typeof entry.to.repo !== 'string') {
        throw new Error(`entry.to malformed: ${JSON.stringify(entry)}`);
      }
    }
    if (typeof entry.migratedAt !== 'string' || entry.migratedAt.length === 0) {
      throw new Error(`entry.migratedAt missing: ${JSON.stringify(entry)}`);
    }
    if (typeof entry.reason !== 'string' || entry.reason.length === 0) {
      throw new Error(`entry.reason missing: ${JSON.stringify(entry)}`);
    }
  }
});

test('No duplicate from-keys', () => {
  const seen = new Set();
  for (const e of REPO_MIGRATIONS) {
    const key = `${e.from.owner.toLowerCase()}/${e.from.repo.toLowerCase()}`;
    if (seen.has(key)) throw new Error(`duplicate from-key: ${key}`);
    seen.add(key);
  }
});

test('Curated table covers the AI-ecosystem swarm finding (xenova/transformers)', () => {
  if (!hasCuratedMigration('xenova', 'transformers')) {
    throw new Error('xenova/transformers must be present — this is the motivating case');
  }
});

test('Curated table includes at least one deprecated-without-successor entry', () => {
  const deprecated = REPO_MIGRATIONS.filter(e => e.to === null);
  if (deprecated.length === 0) {
    throw new Error('expected at least one to:null entry for the deprecated-without-successor signal');
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
