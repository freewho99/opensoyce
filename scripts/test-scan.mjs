#!/usr/bin/env node
/**
 * Integration test scaffold for src/shared/scanLockfile.js.
 *
 * Usage:
 *   node scripts/test-scan.mjs <path-to-package-lock.json>
 *   node scripts/test-scan.mjs --detect <path>      # only run detectLockfileFormat
 *   node scripts/test-scan.mjs --no-network <path>  # parse only, skip OSV calls
 *
 * Exits non-zero on parse failure or unexpected throw. Intended for the API
 * agent to verify end-to-end integration before wiring the endpoint.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseNpmLockfile, queryOsvBatch, detectLockfileFormat } from '../src/shared/scanLockfile.js';

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')));
const positional = args.filter(a => !a.startsWith('--'));
const file = positional[0];

if (!file) {
  console.error('usage: node scripts/test-scan.mjs [--detect] [--no-network] <lockfile-path>');
  process.exit(2);
}

const text = readFileSync(resolve(file), 'utf8');
const fmt = detectLockfileFormat(text);
console.log(JSON.stringify({ step: 'detect', format: fmt, bytes: text.length }, null, 2));

if (flags.has('--detect')) process.exit(0);

let parsed;
try {
  parsed = parseNpmLockfile(text);
} catch (err) {
  console.error(JSON.stringify({ step: 'parse', error: err.code || err.message }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({
  step: 'parse',
  ecosystem: parsed.ecosystem,
  directCount: parsed.direct.length,
  allCount: parsed.all.length,
  firstFiveDirect: parsed.direct.slice(0, 5),
  firstFiveAll: parsed.all.slice(0, 5),
}, null, 2));

if (flags.has('--no-network')) process.exit(0);

const t0 = Date.now();
const vulns = await queryOsvBatch(parsed.all);
const ms = Date.now() - t0;
console.log(JSON.stringify({
  step: 'osv',
  ms,
  packagesQueried: parsed.all.length,
  vulnerableCount: vulns.length,
  vulns: vulns.slice(0, 20),
}, null, 2));
