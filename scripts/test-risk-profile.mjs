#!/usr/bin/env node
/**
 * Scanner v3c — computeRiskProfile() verification.
 *
 * Plain Node, no framework. PASS/FAIL line per case, non-zero exit on
 * any failure. Mirrors the existing scripts/test-*.mjs style.
 */
import { computeRiskProfile } from '../src/shared/riskProfile.js';

let passed = 0;
let failed = 0;

/** @param {string} name @param {() => void} fn */
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
function ok(cond, msg) {
  if (!cond) throw new Error(msg);
}
function notMatches(str, pattern, msg) {
  if (pattern.test(str)) throw new Error(`${msg}: text "${str}" matches forbidden ${pattern}`);
}

function vuln({
  pkg = 'p',
  version = '1.0.0',
  severity = 'high',
  fixedIn,
  repoHealth = null,
  repoHealthError = null,
} = {}) {
  /** @type {any} */
  const out = { package: pkg, version, severity, ids: [], summary: '' };
  if (fixedIn !== undefined) out.fixedIn = fixedIn;
  out.repoHealth = repoHealth;
  out.repoHealthError = repoHealthError;
  return out;
}
function health(verdict, score = 7.0) {
  return { soyceScore: score, verdict, signals: { maintenance: 2, security: 1.5, activity: 0.5 } };
}
function inv({ packages = [], directCount = 0, totalPackages = 0, duplicateCount = 0 } = {}) {
  return {
    format: 'npm-v3',
    packages,
    totals: {
      totalPackages: totalPackages || packages.length,
      totalEntries: totalPackages || packages.length,
      directCount,
      transitiveCount: Math.max(0, (totalPackages || packages.length) - directCount),
      prodCount: 0,
      devCount: 0,
      optionalCount: 0,
      unknownScopeCount: 0,
      duplicateCount,
      missingLicenseCount: 0,
      missingRepositoryCount: 0,
    },
  };
}
function selHealth({ scored = [], skippedBudget = 0, qualifyingTotal = 0, budget = 25 } = {}) {
  return { scored, skippedBudget, qualifyingTotal, budget };
}

const FORBIDDEN = /\b(safe|secure|all clear|whole tree scored)\b/i;

// ---------------------------------------------------------------------------
// 1. lodash + minimist scenario
test('lodash + minimist: HIGH exposure, HIGH maintainer trust (cites minimist)', () => {
  const vulns = [
    vuln({
      pkg: 'minimist',
      severity: 'high',
      fixedIn: '1.2.6',
      repoHealth: health('RISKY', 3.2),
    }),
    vuln({
      pkg: 'lodash',
      severity: 'medium',
      fixedIn: '4.17.21',
      repoHealth: health('FORKABLE', 7.5),
    }),
  ];
  const r = computeRiskProfile({
    vulnerabilities: vulns,
    inventory: inv({
      packages: [
        { name: 'minimist', versions: ['1.2.0'], direct: false, scope: 'prod', hasLicense: true, hasRepository: true },
        { name: 'lodash', versions: ['4.17.0'], direct: true, scope: 'prod', hasLicense: true, hasRepository: true },
      ],
      directCount: 5,
      totalPackages: 50,
      duplicateCount: 1,
    }),
    selectedHealth: selHealth(),
  });
  eq(r.dimensions.vulnerabilityExposure.band, 'HIGH', 'vulnerabilityExposure band');
  eq(r.dimensions.maintainerTrust.band, 'HIGH', 'maintainerTrust band');
  ok(/minimist/.test(r.dimensions.maintainerTrust.because), 'maintainerTrust cites minimist');
  ok(/RISKY/.test(r.dimensions.maintainerTrust.because), 'maintainerTrust cites RISKY band');
  // Both fixed, so remediationReadiness should be LOW
  eq(r.dimensions.remediationReadiness.band, 'LOW', 'remediationReadiness band (all fixed)');
  eq(r.coverage.vulnerableCount, 2, 'vulnerableCount');
});

// ---------------------------------------------------------------------------
// 2. No vulnerabilities, with inventory
test('no vulnerabilities + inventory: LOW exposure, copy never says "safe"', () => {
  const r = computeRiskProfile({
    vulnerabilities: [],
    inventory: inv({
      packages: [
        { name: 'a', versions: ['1.0.0'], direct: true, scope: 'prod', hasLicense: true, hasRepository: true },
      ],
      directCount: 10,
      totalPackages: 40,
      duplicateCount: 0,
    }),
    selectedHealth: selHealth(),
  });
  eq(r.dimensions.vulnerabilityExposure.band, 'LOW', 'vuln band LOW');
  eq(r.dimensions.remediationReadiness.band, 'LOW', 'remediation band LOW');
  eq(r.dimensions.maintainerTrust.band, 'LOW', 'maintainerTrust LOW (no vulns)');
  // treeComplexity still computed
  ok(['LOW', 'ELEVATED', 'HIGH'].includes(r.dimensions.treeComplexity.band), 'treeComplexity computed');
  for (const d of Object.values(r.dimensions)) {
    notMatches(d.because, FORBIDDEN, `dimension copy`);
  }
});

// ---------------------------------------------------------------------------
// 3. OSV unavailable (vulnerabilities=null)
test('OSV unavailable: vuln/remediation/maintainerTrust all UNKNOWN', () => {
  const r = computeRiskProfile({
    vulnerabilities: null,
    inventory: inv({ packages: [], directCount: 10, totalPackages: 40, duplicateCount: 0 }),
    selectedHealth: selHealth(),
  });
  eq(r.dimensions.vulnerabilityExposure.band, 'UNKNOWN', 'vuln UNKNOWN');
  eq(r.dimensions.remediationReadiness.band, 'UNKNOWN', 'remediation UNKNOWN');
  eq(r.dimensions.maintainerTrust.band, 'UNKNOWN', 'maintainerTrust UNKNOWN');
  // Profile must not render as clean: combined across dims at least one UNKNOWN
  // (and treeComplexity is computed from inventory)
  const bands = Object.values(r.dimensions).map(d => d.band);
  ok(bands.includes('UNKNOWN'), 'has UNKNOWN dim');
});

// ---------------------------------------------------------------------------
// 4. Selected budget hit
test('selected budget hit: coverage exposes skippedBudget=15', () => {
  const r = computeRiskProfile({
    vulnerabilities: [],
    inventory: inv({
      packages: [], directCount: 20, totalPackages: 100, duplicateCount: 0,
    }),
    selectedHealth: selHealth({
      scored: Array.from({ length: 25 }, (_, i) => ({
        package: `p${i}`, version: '1.0.0', direct: true, scope: 'prod',
        primaryReason: 'DIRECT_PROD', secondaryReasons: [],
        resolvedRepo: 'x/y', confidence: 'HIGH',
        soyceScore: 7.5, verdict: 'FORKABLE',
        signals: { maintenance: 1, security: 1, activity: 1 },
        status: 'SCORED',
      })),
      skippedBudget: 15,
      qualifyingTotal: 40,
      budget: 25,
    }),
  });
  eq(r.coverage.selectedSkippedBudget, 15, 'skippedBudget');
  eq(r.coverage.selectedScored, 25, 'selectedScored');
  eq(r.coverage.selectedQualifying, 40, 'selectedQualifying');
  // Tree complexity NOT silently downgraded by unscored packages
  for (const d of Object.values(r.dimensions)) {
    notMatches(d.because, /healthy/i, `dimension copy must not claim "healthy"`);
  }
});

// ---------------------------------------------------------------------------
// 5. Many duplicate versions
test('20% duplicate ratio + 120 direct: treeComplexity HIGH', () => {
  // Re-baselined P0-1 thresholds: HIGH requires directCount > 60 AND
  // duplicateRatio > 0.10. 20% duplicate ratio alone (with low direct
  // count) is not enough -- ELEVATED catches anything with
  // directCount <= 60. Push direct above the gate so the duplicate
  // ratio actually drives the verdict.
  const r = computeRiskProfile({
    vulnerabilities: [],
    inventory: inv({
      packages: [], directCount: 120, totalPackages: 600, duplicateCount: 120,
    }),
    selectedHealth: selHealth(),
  });
  eq(r.dimensions.treeComplexity.band, 'HIGH', 'treeComplexity HIGH at 20% dupes + 120 direct');
  ok(/20\.0%/.test(r.dimensions.treeComplexity.because), 'cites 20.0% in copy');
});

// P0-1 re-baselined thresholds: LOW band for OpenSoyce-sized trees.
test('treeComplexity LOW: 21 direct + 0% dup (OpenSoyce-shape)', () => {
  const r = computeRiskProfile({
    vulnerabilities: [],
    inventory: inv({
      packages: [], directCount: 20, totalPackages: 300, duplicateCount: 0,
    }),
    selectedHealth: selHealth(),
  });
  eq(r.dimensions.treeComplexity.band, 'LOW', 'LOW at 20 direct + 0% dup');
  ok(/20 direct dependencies/.test(r.dimensions.treeComplexity.because), 'cites 20 direct');
});

test('treeComplexity ELEVATED: mid-size Next.js shape (40 direct, 3% dup)', () => {
  const r = computeRiskProfile({
    vulnerabilities: [],
    inventory: inv({
      packages: [], directCount: 40, totalPackages: 800, duplicateCount: 24,
    }),
    selectedHealth: selHealth(),
  });
  eq(r.dimensions.treeComplexity.band, 'ELEVATED', 'ELEVATED at 40 direct + 3% dup');
});

test('treeComplexity HIGH: 100 direct + 12% dup', () => {
  const r = computeRiskProfile({
    vulnerabilities: [],
    inventory: inv({
      packages: [], directCount: 100, totalPackages: 1000, duplicateCount: 120,
    }),
    selectedHealth: selHealth(),
  });
  eq(r.dimensions.treeComplexity.band, 'HIGH', 'HIGH at 100 direct + 12% dup');
});

test('treeComplexity copy: pluralization (1 direct dependency, not dependencies)', () => {
  const r = computeRiskProfile({
    vulnerabilities: [],
    inventory: inv({
      packages: [], directCount: 1, totalPackages: 10, duplicateCount: 0,
    }),
    selectedHealth: selHealth(),
  });
  ok(/1 direct dependency,/.test(r.dimensions.treeComplexity.because), 'singular "dependency"');
});

// ---------------------------------------------------------------------------
// 6. No unresolved identities
test('no unresolved identities: identityResolution LOW', () => {
  const r = computeRiskProfile({
    vulnerabilities: [
      vuln({ pkg: 'a', severity: 'low', fixedIn: '1.0.1', repoHealth: health('STABLE') }),
    ],
    inventory: inv({ packages: [], directCount: 5, totalPackages: 30, duplicateCount: 0 }),
    selectedHealth: selHealth(),
  });
  eq(r.dimensions.identityResolution.band, 'LOW', 'identityResolution LOW');
  eq(r.coverage.unresolvedIdentities, 0, 'unresolvedIdentities count');
});

// ---------------------------------------------------------------------------
// 7. 6 unresolved identities (combine vulns + selected)
test('6 unresolved identities: identityResolution HIGH', () => {
  const r = computeRiskProfile({
    vulnerabilities: [
      vuln({ pkg: 'a', severity: 'low', fixedIn: '1.0.0', repoHealthError: 'IDENTITY_NONE' }),
      vuln({ pkg: 'b', severity: 'low', fixedIn: '1.0.0', repoHealthError: 'IDENTITY_NONE' }),
      vuln({ pkg: 'c', severity: 'low', fixedIn: '1.0.0', repoHealthError: 'IDENTITY_NONE' }),
    ],
    inventory: inv({ packages: [], directCount: 5, totalPackages: 30, duplicateCount: 0 }),
    selectedHealth: selHealth({
      scored: [
        { package: 'd', version: '1', direct: true, scope: 'prod', primaryReason: 'DIRECT_PROD', secondaryReasons: [], resolvedRepo: null, confidence: 'NONE', soyceScore: null, verdict: null, signals: null, status: 'IDENTITY_UNRESOLVED' },
        { package: 'e', version: '1', direct: true, scope: 'prod', primaryReason: 'DIRECT_PROD', secondaryReasons: [], resolvedRepo: null, confidence: 'NONE', soyceScore: null, verdict: null, signals: null, status: 'IDENTITY_UNRESOLVED' },
        { package: 'f', version: '1', direct: true, scope: 'prod', primaryReason: 'DIRECT_PROD', secondaryReasons: [], resolvedRepo: null, confidence: 'NONE', soyceScore: null, verdict: null, signals: null, status: 'IDENTITY_UNRESOLVED' },
      ],
      skippedBudget: 0,
      qualifyingTotal: 3,
    }),
  });
  eq(r.coverage.unresolvedIdentities, 6, 'unresolvedIdentities');
  eq(r.dimensions.identityResolution.band, 'HIGH', 'identityResolution HIGH at 6');
});

// ---------------------------------------------------------------------------
// 8. Critical advisory with no fix
test('critical no-fix: remediationReadiness HIGH', () => {
  const r = computeRiskProfile({
    vulnerabilities: [
      vuln({ pkg: 'evil', severity: 'critical', fixedIn: undefined, repoHealth: health('RISKY') }),
    ],
    inventory: inv({ packages: [], directCount: 5, totalPackages: 20, duplicateCount: 0 }),
    selectedHealth: selHealth(),
  });
  eq(r.dimensions.remediationReadiness.band, 'HIGH', 'remediationReadiness HIGH');
  eq(r.dimensions.vulnerabilityExposure.band, 'HIGH', 'vuln HIGH (critical)');
});

// ---------------------------------------------------------------------------
// 9. Empty scan, everything zero
test('empty everything: dimensions LOW or UNKNOWN, no crash, no "safe"', () => {
  const r = computeRiskProfile({
    vulnerabilities: [],
    inventory: null,
    selectedHealth: null,
  });
  for (const [k, d] of Object.entries(r.dimensions)) {
    ok(['LOW', 'UNKNOWN'].includes(d.band), `${k} must be LOW or UNKNOWN, got ${d.band}`);
    notMatches(d.because, FORBIDDEN, `${k} copy must not say safe/secure`);
  }
  eq(r.coverage.totalInstalled, 0, 'totalInstalled');
});

// ---------------------------------------------------------------------------
// 10. Mixed scan coverage math
test('mixed coverage math reconciles', () => {
  const vulns = [
    vuln({ pkg: 'minimist', severity: 'high', fixedIn: '1.2.6', repoHealth: health('STABLE') }),
    vuln({ pkg: 'lodash', severity: 'medium', fixedIn: '4.17.21', repoHealth: health('FORKABLE') }),
    vuln({ pkg: 'mystery', severity: 'low', fixedIn: '0.0.1', repoHealthError: 'IDENTITY_NONE' }),
  ];
  const inventory = inv({
    packages: [
      { name: 'minimist', versions: ['1.2.0'], direct: false, scope: 'prod', hasLicense: true, hasRepository: true },
      { name: 'lodash', versions: ['4.17.0'], direct: true, scope: 'prod', hasLicense: true, hasRepository: true },
      // mystery deliberately absent — exercise the "unknown if absent" path
    ],
    directCount: 12,
    totalPackages: 60,
    duplicateCount: 2,
  });
  const r = computeRiskProfile({
    vulnerabilities: vulns,
    inventory,
    selectedHealth: selHealth({ scored: [], skippedBudget: 0, qualifyingTotal: 0 }),
  });
  eq(r.coverage.vulnerableCount, 3, 'vulnerableCount');
  eq(r.coverage.vulnerableDirect, 1, 'vulnerableDirect (lodash)');
  eq(r.coverage.vulnerableTransitive, 1, 'vulnerableTransitive (minimist)');
  // mystery is not in inventory; not counted either side
  eq(r.coverage.unresolvedIdentities, 1, 'unresolvedIdentities');
  eq(r.coverage.totalInstalled, 60, 'totalInstalled');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
