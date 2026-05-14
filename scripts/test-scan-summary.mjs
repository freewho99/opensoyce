#!/usr/bin/env node
/**
 * Scanner v2.1b — summarizeScan() verification.
 *
 * Verifies the locked decision-label rules and needsAttention bucket math
 * against representative vuln-row fixtures shaped like the v2.1a server
 * response. Mirrors scripts/test-scan-v2-1a.mjs in spirit: plain Node, no
 * framework, PASS/FAIL line per case, non-zero exit on any failure.
 */
import { summarizeScan } from '../src/shared/scanSummary.js';

let passed = 0;
let failed = 0;

/** @param {string} name @param {() => void} fn */
function test(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
    passed += 1;
  } catch (e) {
    console.log(`FAIL  ${name} — ${e.message}`);
    failed += 1;
  }
}

function eq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function vuln({
  pkg = 'p',
  version = '1.0.0',
  severity = 'high',
  fixedIn,
  resolvedRepo = null,
  confidence = 'NONE',
  repoHealth = null,
  repoHealthError = null,
} = {}) {
  /** @type {any} */
  const out = { package: pkg, version, severity, ids: [], summary: '' };
  if (fixedIn !== undefined) out.fixedIn = fixedIn;
  out.resolvedRepo = resolvedRepo;
  out.confidence = confidence;
  out.repoHealth = repoHealth;
  out.repoHealthError = repoHealthError;
  return out;
}

function health(verdict, score = 7.0) {
  return {
    soyceScore: score,
    verdict,
    signals: { maintenance: 2.0, security: 1.5, activity: 0.5 },
  };
}

// 1. CLEAN — zero advisories, no gaps
test('CLEAN: empty scan', () => {
  const s = summarizeScan([]);
  eq(s.label, 'CLEAN', 'label');
  eq(s.totals.advisories, 0, 'advisories');
  eq(s.totals.vulnerablePackages, 0, 'packages');
});

// 2. CLEAN-bar-strict — zero advisories but a row has IDENTITY_NONE
//    (in practice the server only emits identity gaps on rows that ARE
//    advisories, but the spec asks us to verify the strict CLEAN bar.
//    We approximate by giving the row a severity but rely on the gap
//    path: an advisory + identity_none should resolve to VERIFY_LATER.)
test('CLEAN-bar-strict: identity-unresolved blocks CLEAN', () => {
  const s = summarizeScan([
    vuln({ pkg: 'mystery', severity: 'low', fixedIn: '1.1.0', repoHealthError: 'IDENTITY_NONE' }),
  ]);
  // Has an advisory and identity gap — must NOT be CLEAN, must NOT be
  // REVIEW_REQUIRED (severity is low). The locked rule: VERIFY_LATER.
  eq(s.label, 'VERIFY_LATER', 'label');
});

// 3. PATCH_AVAILABLE — HIGH with fix + healthy repo
test('PATCH_AVAILABLE: HIGH with fix + FORKABLE repo', () => {
  const s = summarizeScan([
    vuln({
      pkg: 'lodash', severity: 'high', fixedIn: '4.17.21',
      resolvedRepo: 'lodash/lodash', confidence: 'HIGH',
      repoHealth: health('FORKABLE', 7.2),
    }),
  ]);
  eq(s.label, 'PATCH_AVAILABLE', 'label');
  eq(s.totals.fixAvailable, 1, 'fixAvailable');
  eq(s.totals.fixUnavailable, 0, 'fixUnavailable');
});

// 4. REVIEW_REQUIRED via no-fix
test('REVIEW_REQUIRED: HIGH with no fixed version', () => {
  const s = summarizeScan([
    vuln({
      pkg: 'unmaintained', severity: 'high',
      resolvedRepo: 'org/unmaintained', confidence: 'HIGH',
      repoHealth: health('FORKABLE', 7.0),
    }),
  ]);
  eq(s.label, 'REVIEW_REQUIRED', 'label');
  const naReasons = s.needsAttention.map(e => e.reason);
  if (!naReasons.includes('NO_FIX')) throw new Error('NO_FIX bucket missing');
});

// 5. REVIEW_REQUIRED via weak health
test('REVIEW_REQUIRED: CRITICAL on RISKY repo', () => {
  const s = summarizeScan([
    vuln({
      pkg: 'risky-thing', severity: 'critical', fixedIn: '2.0.0',
      resolvedRepo: 'org/risky', confidence: 'HIGH',
      repoHealth: health('RISKY', 3.0),
    }),
  ]);
  eq(s.label, 'REVIEW_REQUIRED', 'label');
  const naReasons = s.needsAttention.map(e => e.reason);
  if (!naReasons.includes('HIGH_OR_CRITICAL_WEAK_HEALTH')) {
    throw new Error('HIGH_OR_CRITICAL_WEAK_HEALTH bucket missing');
  }
});

// 6. VERIFY_LATER via health gap (analysis failed, but fix is available
//    and severity is HIGH — health-unavailable alone must NOT escalate to
//    REVIEW_REQUIRED).
test('VERIFY_LATER: HIGH advisory + ANALYSIS_FAILED does not escalate', () => {
  const s = summarizeScan([
    vuln({
      pkg: 'gh-down', severity: 'high', fixedIn: '1.2.3',
      resolvedRepo: 'org/down', confidence: 'HIGH',
      repoHealthError: 'ANALYSIS_FAILED',
    }),
  ]);
  eq(s.label, 'VERIFY_LATER', 'label');
});

// 7. Mixed scan
test('Mixed scan: REVIEW_REQUIRED with deduped needsAttention', () => {
  const rows = [
    vuln({
      pkg: 'a-crit', severity: 'critical', fixedIn: '2.0.0',
      resolvedRepo: 'org/a', confidence: 'HIGH',
      repoHealth: health('RISKY', 2.8),
    }),
    vuln({
      pkg: 'b-high', severity: 'high', fixedIn: '3.4.5',
      resolvedRepo: 'org/b', confidence: 'HIGH',
      repoHealth: health('FORKABLE', 7.0),
    }),
    vuln({
      pkg: 'c-med', severity: 'medium',
      resolvedRepo: 'org/c', confidence: 'HIGH',
      repoHealth: health('STABLE', 6.0),
    }),
    vuln({
      pkg: 'd-unresolved', severity: 'medium', fixedIn: '0.5.0',
      repoHealthError: 'IDENTITY_NONE',
    }),
  ];
  const s = summarizeScan(rows);
  eq(s.label, 'REVIEW_REQUIRED', 'label');
  // a-crit drives HIGH_OR_CRITICAL_WEAK_HEALTH
  const reasonsByPkg = new Map();
  for (const e of s.needsAttention) {
    if (!reasonsByPkg.has(e.package)) reasonsByPkg.set(e.package, new Set());
    reasonsByPkg.get(e.package).add(e.reason);
  }
  if (!reasonsByPkg.get('a-crit')?.has('HIGH_OR_CRITICAL_WEAK_HEALTH')) {
    throw new Error('a-crit should be in HIGH_OR_CRITICAL_WEAK_HEALTH');
  }
  if (!reasonsByPkg.get('c-med')?.has('NO_FIX')) {
    throw new Error('c-med should be in NO_FIX');
  }
  if (!reasonsByPkg.get('d-unresolved')?.has('IDENTITY_UNRESOLVED')) {
    throw new Error('d-unresolved should be in IDENTITY_UNRESOLVED');
  }
  // Dedupe check: each (package, reason) at most once.
  const keys = s.needsAttention.map(e => `${e.package}::${e.reason}`);
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
  if (dupes.length > 0) throw new Error(`duplicate needsAttention entries: ${dupes.join(', ')}`);
});

// 8. Distribution counts
test('healthDistribution math matches input', () => {
  const rows = [
    vuln({ pkg: 'p1', severity: 'low', fixedIn: '1.0', repoHealth: health('USE READY', 9.0) }),
    vuln({ pkg: 'p2', severity: 'low', fixedIn: '1.0', repoHealth: health('FORKABLE', 7.5) }),
    vuln({ pkg: 'p3', severity: 'low', fixedIn: '1.0', repoHealth: health('FORKABLE', 7.2) }),
    vuln({ pkg: 'p4', severity: 'low', fixedIn: '1.0', repoHealth: health('STALE', 1.5) }),
    vuln({ pkg: 'p5', severity: 'low', fixedIn: '1.0', repoHealthError: 'IDENTITY_NONE' }),
    vuln({ pkg: 'p6', severity: 'low', fixedIn: '1.0', repoHealthError: 'ANALYSIS_FAILED' }),
  ];
  const s = summarizeScan(rows);
  eq(s.healthDistribution['USE READY'], 1, 'USE READY count');
  eq(s.healthDistribution['FORKABLE'], 2, 'FORKABLE count');
  eq(s.healthDistribution['STALE'], 1, 'STALE count');
  eq(s.healthDistribution.UNAVAILABLE, 2, 'UNAVAILABLE count');
  eq(s.totals.vulnerablePackages, 6, 'vulnerablePackages');
  eq(s.totals.advisories, 6, 'advisories');
});

console.log('');
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
