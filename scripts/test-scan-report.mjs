#!/usr/bin/env node
/**
 * Scanner v3d — buildMarkdownReport / buildJsonReport verification.
 * Plain Node, PASS/FAIL per case, non-zero exit on any failure.
 */
import { buildMarkdownReport, buildJsonReport } from '../src/shared/buildScanReport.js';
import { summarizeScan } from '../src/shared/scanSummary.js';
import { computeRiskProfile } from '../src/shared/riskProfile.js';

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
function contains(str, needle, msg) {
  if (!str.includes(needle)) throw new Error(`${msg}: missing "${needle}" in ${JSON.stringify(str.slice(0, 200))}`);
}
function notContains(str, needle, msg) {
  if (str.includes(needle)) throw new Error(`${msg}: forbidden "${needle}" found`);
}

function vuln({ pkg = 'p', version = '1.0.0', severity = 'high', fixedIn, repoHealth = null, repoHealthError = null } = {}) {
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
      prodCount: 0, devCount: 0, optionalCount: 0, unknownScopeCount: 0,
      duplicateCount, missingLicenseCount: 0, missingRepositoryCount: 0,
    },
  };
}
function selHealth({ scored = [], skippedBudget = 0, qualifyingTotal = 0, budget = 25 } = {}) {
  return { scored, skippedBudget, qualifyingTotal, budget };
}

function bundle(vulns, inventory, selectedHealth) {
  const summary = summarizeScan(vulns);
  const profile = computeRiskProfile({ vulnerabilities: vulns, inventory, selectedHealth });
  return { summary, profile, vulnerabilities: vulns, inventory, selectedHealth };
}

// ---------------------------------------------------------------------------
// 1. PATCH_AVAILABLE scenario
test('PATCH_AVAILABLE: decision/dimensions/coverage/action present', () => {
  const vulns = [
    vuln({ pkg: 'a', severity: 'high', fixedIn: '1.0.1', repoHealth: health('STABLE') }),
    vuln({ pkg: 'b', severity: 'high', fixedIn: '2.0.0', repoHealth: health('FORKABLE') }),
  ];
  const inventory = inv({
    packages: [
      { name: 'a', versions: ['1.0.0'], direct: true, scope: 'prod', hasLicense: true, hasRepository: true },
      { name: 'b', versions: ['1.9.0'], direct: true, scope: 'prod', hasLicense: true, hasRepository: true },
    ],
    directCount: 8, totalPackages: 80, duplicateCount: 0,
  });
  const sh = selHealth({
    scored: Array.from({ length: 4 }, (_, i) => ({
      package: `s${i}`, version: '1.0', direct: true, scope: 'prod',
      primaryReason: 'DIRECT_PROD', secondaryReasons: [],
      resolvedRepo: 'x/y', confidence: 'HIGH',
      soyceScore: 8, verdict: 'STABLE', signals: { maintenance: 1, security: 1, activity: 1 },
      status: 'SCORED',
    })),
    qualifyingTotal: 4,
  });
  const b = bundle(vulns, inventory, sh);
  const md = buildMarkdownReport({ ...b, scannedAt: '2026-05-14T00:00:00Z' });
  contains(md, 'Decision:** PATCH AVAILABLE', 'decision line');
  contains(md, '- Vulnerability Exposure:', 'vuln exposure dim');
  contains(md, '- Remediation Readiness:', 'remediation dim');
  contains(md, '- Maintainer Trust:', 'maintainer dim');
  contains(md, '- Tree Complexity:', 'tree dim');
  contains(md, '- Transparency:', 'transparency dim');
  contains(md, 'Selected dependency health scored 4 of 80 installed dependencies.', 'coverage sentence');
  contains(md, '### Recommended next action', 'action header');
  contains(md, 'Upgrade the listed packages to their fixed versions.', 'patch action');
});

// ---------------------------------------------------------------------------
// 2. REVIEW_REQUIRED + weak-health
test('REVIEW_REQUIRED weak-health: maintainerTrust cites minimist, action says reassess minimist', () => {
  const vulns = [
    vuln({ pkg: 'minimist', severity: 'high', fixedIn: '1.2.6', repoHealth: health('RISKY', 3.0) }),
  ];
  const inventory = inv({
    packages: [
      { name: 'minimist', versions: ['1.2.0'], direct: false, scope: 'prod', hasLicense: true, hasRepository: true },
    ],
    directCount: 5, totalPackages: 30, duplicateCount: 0,
  });
  const b = bundle(vulns, inventory, selHealth());
  const md = buildMarkdownReport({ ...b });
  contains(md, 'Decision:** REVIEW REQUIRED', 'review required label');
  contains(md, 'Maintainer Trust: HIGH', 'maintainerTrust HIGH band');
  contains(md, 'minimist', 'cites minimist');
  contains(md, 'RISKY', 'cites RISKY');
  contains(md, 'reassess minimist', 'action reassess');
});

// ---------------------------------------------------------------------------
// 3. REVIEW_REQUIRED + no-fix HIGH
test('REVIEW_REQUIRED no-fix HIGH: action mentions "No fix available for N"', () => {
  const vulns = [
    vuln({ pkg: 'evil', severity: 'critical', fixedIn: undefined, repoHealth: health('STABLE') }),
    vuln({ pkg: 'badger', severity: 'high', fixedIn: undefined, repoHealth: health('STABLE') }),
  ];
  const inventory = inv({
    packages: [
      { name: 'evil', versions: ['1.0.0'], direct: true, scope: 'prod', hasLicense: true, hasRepository: true },
      { name: 'badger', versions: ['1.0.0'], direct: true, scope: 'prod', hasLicense: true, hasRepository: true },
    ],
    directCount: 5, totalPackages: 30, duplicateCount: 0,
  });
  const b = bundle(vulns, inventory, selHealth());
  const md = buildMarkdownReport({ ...b });
  contains(md, 'Decision:** REVIEW REQUIRED', 'review required');
  contains(md, 'No fix available for 2 high/critical advisory(ies)', 'no-fix action');
});

// ---------------------------------------------------------------------------
// 4. VERIFY_LATER scenario
test('VERIFY_LATER: Uncertainty present, action re-run', () => {
  const vulns = [
    vuln({ pkg: 'mystery', severity: 'low', fixedIn: '0.1.0', repoHealthError: 'IDENTITY_NONE' }),
    vuln({ pkg: 'broken', severity: 'low', fixedIn: '0.1.0', repoHealthError: 'ANALYSIS_FAILED' }),
  ];
  const inventory = inv({
    packages: [
      { name: 'mystery', versions: ['0.0.9'], direct: true, scope: 'prod', hasLicense: true, hasRepository: false },
      { name: 'broken', versions: ['0.0.9'], direct: true, scope: 'prod', hasLicense: true, hasRepository: true },
    ],
    directCount: 5, totalPackages: 30, duplicateCount: 0,
  });
  const b = bundle(vulns, inventory, selHealth());
  const md = buildMarkdownReport({ ...b });
  contains(md, 'Decision:** VERIFY LATER', 'verify later');
  contains(md, '### Uncertainty', 'uncertainty header');
  contains(md, 'Re-run when analysis is available', 'rerun action');
  contains(md, 'could not be assessed', 'assessable wording');
});

// ---------------------------------------------------------------------------
// 5. CLEAN scenario
test('CLEAN: no Uncertainty header, action is "No known vulnerabilities found"', () => {
  const inventory = inv({
    packages: [
      { name: 'a', versions: ['1.0.0'], direct: true, scope: 'prod', hasLicense: true, hasRepository: true },
    ],
    directCount: 5, totalPackages: 20, duplicateCount: 0,
  });
  const sh = selHealth({
    scored: [{
      package: 'a', version: '1.0.0', direct: true, scope: 'prod',
      primaryReason: 'DIRECT_PROD', secondaryReasons: [],
      resolvedRepo: 'x/y', confidence: 'HIGH',
      soyceScore: 9, verdict: 'STABLE', signals: { maintenance: 1, security: 1, activity: 1 },
      status: 'SCORED',
    }],
    qualifyingTotal: 1,
  });
  const b = bundle([], inventory, sh);
  const md = buildMarkdownReport({ ...b });
  contains(md, 'Decision:** CLEAN', 'clean label');
  notContains(md, '### Uncertainty', 'no uncertainty section');
  contains(md, 'No known vulnerabilities found. Re-scan after dependency upgrades.', 'clean action');
});

// ---------------------------------------------------------------------------
// 6. Honesty regex sweep
test('Honesty: forbidden substrings absent across multiple scenarios', () => {
  const scenarios = [
    bundle([], inv({ packages: [], directCount: 0, totalPackages: 0 }), selHealth()),
    bundle(
      [vuln({ pkg: 'a', severity: 'high', fixedIn: '1.0.1', repoHealth: health('STABLE') })],
      inv({ packages: [{ name: 'a', versions: ['1.0.0'], direct: true, scope: 'prod', hasLicense: true, hasRepository: true }], directCount: 5, totalPackages: 20 }),
      selHealth(),
    ),
    bundle(
      [vuln({ pkg: 'm', severity: 'high', fixedIn: '1.2.6', repoHealth: health('RISKY') })],
      inv({ packages: [{ name: 'm', versions: ['1.0'], direct: false, scope: 'prod', hasLicense: true, hasRepository: true }], directCount: 5, totalPackages: 20 }),
      selHealth(),
    ),
  ];
  for (const s of scenarios) {
    const md = buildMarkdownReport({ ...s });
    notContains(md, 'all vulnerabilities', 'no "all vulnerabilities"');
    notContains(md, 'scored the whole tree', 'no "scored the whole tree"');
    notContains(md, 'completely safe', 'no "completely safe"');
    notContains(md, 'fully secure', 'no "fully secure"');
  }
  // With vulns present, must say "known vulnerabilities".
  const withVulns = scenarios[1];
  const md = buildMarkdownReport({ ...withVulns });
  contains(md, 'Known vulnerabilities', '"Known vulnerabilities" present');
});

// ---------------------------------------------------------------------------
// 7. Coverage sentence math
test('Coverage math: 25 SCORED + 5 SCORE_UNAVAILABLE → "scored 25 of 842"', () => {
  const scored = [
    ...Array.from({ length: 25 }, (_, i) => ({
      package: `s${i}`, version: '1.0', direct: true, scope: 'prod',
      primaryReason: 'DIRECT_PROD', secondaryReasons: [],
      resolvedRepo: 'x/y', confidence: 'HIGH',
      soyceScore: 7, verdict: 'FORKABLE', signals: { maintenance: 1, security: 1, activity: 1 },
      status: 'SCORED',
    })),
    ...Array.from({ length: 5 }, (_, i) => ({
      package: `u${i}`, version: '1.0', direct: true, scope: 'prod',
      primaryReason: 'DIRECT_PROD', secondaryReasons: [],
      resolvedRepo: 'x/y', confidence: 'HIGH',
      soyceScore: null, verdict: null, signals: null,
      status: 'SCORE_UNAVAILABLE',
    })),
  ];
  const inventory = inv({ packages: [], directCount: 50, totalPackages: 842, duplicateCount: 0 });
  const sh = selHealth({ scored, qualifyingTotal: 30 });
  const b = bundle([], inventory, sh);
  const md = buildMarkdownReport({ ...b });
  contains(md, 'Selected dependency health scored 25 of 842 installed dependencies.', 'coverage exact');
  notContains(md, 'scored 30 of 842', 'must not count unavailable');
});

// ---------------------------------------------------------------------------
// 8. JSON shape
test('JSON: schemaVersion=1, decision.label, riskProfile, totals, recommendedAction, uncertainty array, inventory packages', () => {
  const vulns = [vuln({ pkg: 'a', severity: 'high', fixedIn: '1.0.1', repoHealth: health('STABLE') })];
  const inventory = inv({
    packages: [
      { name: 'a', versions: ['1.0.0'], direct: true, scope: 'prod', hasLicense: true, hasRepository: true },
      { name: 'b', versions: ['1.0.0'], direct: false, scope: 'prod', hasLicense: true, hasRepository: true },
    ],
    directCount: 5, totalPackages: 30, duplicateCount: 0,
  });
  const b = bundle(vulns, inventory, selHealth());
  const j = buildJsonReport({ ...b, scannedAt: '2026-05-14T00:00:00Z' });
  eq(j.schemaVersion, 1, 'schemaVersion');
  eq(j.decision.label, 'PATCH_AVAILABLE', 'decision.label');
  ok(j.riskProfile && j.riskProfile.dimensions, 'riskProfile.dimensions');
  eq(j.totals.knownVulnerabilities, 1, 'totals.knownVulnerabilities');
  ok(Array.isArray(j.uncertainty), 'uncertainty array');
  ok(typeof j.recommendedAction === 'string', 'recommendedAction string');
  ok(j.inventory && Array.isArray(j.inventory.packages) && j.inventory.packages.length === 2, 'inventory packages array');
  ok(j.inventory.packages[0].name === 'a', 'inventory pkg[0].name');
});

// ---------------------------------------------------------------------------
// 9. Empty scan: no selectedHealth, no vulns
test('Empty scan: builders do not throw, markdown is short and honest', () => {
  const inventory = inv({ packages: [], directCount: 0, totalPackages: 0 });
  const summary = summarizeScan([]);
  const profile = computeRiskProfile({ vulnerabilities: [], inventory, selectedHealth: null });
  const md = buildMarkdownReport({ summary, profile, vulnerabilities: [], inventory, selectedHealth: null });
  const j = buildJsonReport({ summary, profile, vulnerabilities: [], inventory, selectedHealth: null });
  ok(typeof md === 'string' && md.length > 0, 'md non-empty');
  ok(j && j.schemaVersion === 1, 'json built');
  notContains(md, 'all vulnerabilities', 'no all vulns');
  notContains(md, 'scored the whole tree', 'no whole tree');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
