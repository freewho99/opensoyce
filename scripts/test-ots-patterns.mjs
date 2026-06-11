#!/usr/bin/env node

import {
  detectOtsPatternsForRow,
  otsPatternVerdict,
  OTS_PATTERN_DEFINITIONS,
  OTS_PATTERN_PACKS,
  workflowOrigin,
  workflowPermissionRisk,
} from '../src/shared/otsPatterns.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
    passed += 1;
  } catch (err) {
    console.log(`FAIL ${name} -- ${err.message}`);
    failed += 1;
  }
}

function ok(value, msg) {
  if (!value) throw new Error(msg);
}

function eq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg}: expected ${expected}, got ${actual}`);
  }
}

test('critical CVE row triggers known vulnerability exposure block', () => {
  const patterns = detectOtsPatternsForRow({
    package: 'badpkg',
    version: '1.0.0',
    severity: 'critical',
    ids: ['CVE-2026-0001'],
  });

  ok(patterns.some((p) => p.patternId === 'known-vulnerability-exposure'), 'known vulnerability pattern missing');
  eq(otsPatternVerdict(patterns), 'BLOCK', 'verdict');
});

test('install script alone warns but does not block', () => {
  const patterns = detectOtsPatternsForRow({
    package: 'native-helper',
    version: '1.0.0',
    hasInstallScript: true,
  });

  ok(patterns.some((p) => p.patternId === 'install-time-execution'), 'install pattern missing');
  eq(otsPatternVerdict(patterns), 'WARN', 'verdict');
});

test('dependency confusion high confidence blocks', () => {
  const patterns = detectOtsPatternsForRow({
    package: '@internal/payments',
    version: '1.0.0',
    dependencyConfusion: {
      confidence: 'HIGH',
      reason: 'Active squat detected',
    },
  });

  ok(patterns.some((p) => p.patternId === 'dependency-confusion-risk'), 'dependency confusion pattern missing');
  eq(otsPatternVerdict(patterns), 'BLOCK', 'verdict');
});

test('CI with secrets plus install script blocks secret exposure path', () => {
  const patterns = detectOtsPatternsForRow(
    {
      package: 'risky-installer',
      version: '1.0.0',
      hasInstallScript: true,
    },
    {
      ci: true,
      hasSecrets: true,
    },
  );

  ok(patterns.some((p) => p.patternId === 'ci-secret-exposure-path'), 'CI secret exposure pattern missing');
  eq(otsPatternVerdict(patterns), 'BLOCK', 'verdict');
});

test('clean package triggers no patterns and allows', () => {
  const patterns = detectOtsPatternsForRow({
    package: 'react',
    version: '19.0.0',
    severity: 'low',
    license: 'MIT'
  });

  eq(patterns.length, 0, 'should have 0 patterns');
  eq(otsPatternVerdict(patterns), 'ALLOW', 'verdict');
});

test('high blast radius row warns', () => {
  const patterns = detectOtsPatternsForRow({
    package: 'react',
    version: '19.0.0',
    blastRadius: { tier: 'high', reason: '4.2M downstream dependents' },
  });

  ok(patterns.some((p) => p.patternId === 'high-blast-radius'), 'high blast radius pattern missing');
  eq(otsPatternVerdict(patterns), 'WARN', 'verdict');
});

test('every patternId emitted by the detector resolves to a catalog entry', () => {
  // Structural invariant. The previous audit found 4 emitted IDs that had
  // no matching catalog definition (known-vulnerability-exposure,
  // install-time-execution, dependency-confusion-risk, high-blast-radius),
  // causing /patterns/:id deep-links to 404. This test enumerates every
  // detector branch and asserts each emitted ID maps to a real definition.
  const fixtures = [
    // Critical vulnerability → known-vulnerability-exposure
    { row: { package: 'badpkg', version: '1.0.0', severity: 'critical', ids: ['CVE-2026-0001'] } },
    // Install script with remote signal → install-time-remote-execution
    { row: { package: 'native-helper', version: '1.0.0', hasInstallScript: true, capabilityProfile: { remoteExecution: true } } },
    // Install script without remote signal → install-time-execution
    { row: { package: 'native-helper-local', version: '1.0.0', hasInstallScript: true } },
    // Axios sandbox row → hidden-dependency-injection + others
    { row: { package: 'axios', version: '1.14.1' } },
    // Typosquat → lookalike-package-injection
    { row: { package: 'reqeust', version: '2.0.0' } },
    // Dependency confusion → dependency-confusion-risk
    { row: { package: '@internal/payments', version: '1.0.0', dependencyConfusion: { confidence: 'HIGH', reason: 'squat' } } },
    // Mismatch → source-package-mismatch
    { row: { package: 'mystery', version: '1.0.0', verified: false } },
    // Fresh release → fresh-release-cooldown-violation
    { row: { package: 'fresh', version: '0.0.1', publishAgeHours: 4 } },
    // CI + secrets + install → ci-secret-exposure-path
    { row: { package: 'risky-installer', version: '1.0.0', hasInstallScript: true }, ctx: { ci: true, hasSecrets: true } },
    // High blast radius → high-blast-radius
    { row: { package: 'react', version: '19.0.0', blastRadius: { tier: 'high', reason: '4.2M' } } },
  ];

  const definedIds = new Set(OTS_PATTERN_DEFINITIONS.map((d) => d.id));
  const emittedIds = new Set();
  for (const { row, ctx } of fixtures) {
    for (const pat of detectOtsPatternsForRow(row, ctx || {})) {
      emittedIds.add(pat.patternId);
    }
  }

  const missing = [...emittedIds].filter((id) => !definedIds.has(id));
  ok(missing.length === 0, `detector emits IDs not in catalog: ${missing.join(', ') || '(none)'}`);
});

test('every catalog entry declares a coverageStatus', () => {
  const allowed = new Set(['gate-active', 'catalog-only', 'roadmap', 'fixture-only']);
  const missing = [];
  const invalid = [];
  for (const def of OTS_PATTERN_DEFINITIONS) {
    if (!def.coverageStatus) {
      missing.push(def.id);
    } else if (!allowed.has(def.coverageStatus)) {
      invalid.push(`${def.id}=${def.coverageStatus}`);
    }
  }
  ok(missing.length === 0, `entries missing coverageStatus: ${missing.join(', ') || '(none)'}`);
  ok(invalid.length === 0, `entries with invalid coverageStatus: ${invalid.join(', ') || '(none)'}`);
});

test('detector emissions match the gate-active label', () => {
  // Structural invariant. Every patternId emitted by the detector
  // (default mode, no demo fixtures) MUST be marked gate-active in the
  // catalog. Conversely, no pattern marked roadmap / catalog-only should
  // ever fire from the detector in default mode. This catches drift in
  // either direction at commit time.
  const defByPatternId = new Map(OTS_PATTERN_DEFINITIONS.map((d) => [d.id, d]));
  const fixtures = [
    { row: { package: 'badpkg', severity: 'critical', ids: ['CVE-X'] } },
    { row: { package: 'native-helper', hasInstallScript: true, capabilityProfile: { remoteExecution: true } } },
    { row: { package: 'native-local', hasInstallScript: true } },
    { row: { package: 'reqeust' } },
    { row: { package: '@scope/x', dependencyConfusion: { confidence: 'HIGH' } } },
    { row: { package: 'mystery', verified: false } },
    { row: { package: 'fresh', publishAgeHours: 4 } },
    { row: { package: 'compromised', maintainerCompromise: true } },
    { row: { package: 'with-dep', hiddenDependency: { newDep: 'x' } } },
    { row: { package: 'cdn-shape', unknownRemoteEndpoint: { host: 'x' } } },
    { row: { package: 'react', blastRadius: { tier: 'high' } } },
    // Detector v2 workflow signals
    { row: { package: 'tj-actions/changed-files', isWorkflowAction: true, tagDrift: true, hasSecretsAccess: true, publisherVerified: false, unpinnedReference: true } },
    { row: { package: 'polyfill.io', publisherIdentityDrift: { drifted: true } } },
    // GitHub Actions detector coverage (this PR) — the parser at
    // src/shared/githubWorkflowSignals.js produces rows with these
    // shapes from real workflow YAML; this synthetic fixture is enough
    // to fire the new detector branches without depending on YAML.
    { row: { package: '.github/workflows/bad.yml#test.steps.0', isWorkflowAction: true, pullRequestTargetAbuse: true, workflowPath: '.github/workflows/bad.yml' } },
    { row: { package: '.github/workflows/bad.yml#test.steps.1', isWorkflowAction: true, untrustedWorkflowInput: true, workflowPath: '.github/workflows/bad.yml', evidenceText: 'echo ${{ github.event.issue.title }}' } },
    { row: { package: '.github/workflows/release.yml#release', isWorkflowAction: true, dangerousReleasePermission: true, workflowPath: '.github/workflows/release.yml', writeScopes: ['contents'] } },
    // CI-with-secrets context
    { row: { package: 'risky-installer', hasInstallScript: true }, ctx: { ci: true, hasSecrets: true } },
  ];
  const emitted = new Set();
  for (const { row, ctx } of fixtures) {
    for (const p of detectOtsPatternsForRow(row, ctx || {})) emitted.add(p.patternId);
  }
  const wrongStatus = [];
  for (const id of emitted) {
    const def = defByPatternId.get(id);
    if (def && def.coverageStatus !== 'gate-active') {
      wrongStatus.push(`${id} emits but is labeled ${def.coverageStatus}`);
    }
  }
  ok(wrongStatus.length === 0, `mislabeled patterns: ${wrongStatus.join(', ') || '(none)'}`);
});

test('GitHub Actions detector coverage: pull-request-target-abuse fires + BLOCK', () => {
  const patterns = detectOtsPatternsForRow({
    package: '.github/workflows/bad.yml#test.steps.0',
    isWorkflowAction: true,
    pullRequestTargetAbuse: true,
    workflowPath: '.github/workflows/bad.yml',
    evidenceText: 'actions/checkout@v4 with ref: ${{ github.event.pull_request.head.sha }}',
  }, {});
  const p = patterns.find((x) => x.patternId === 'pull-request-target-abuse');
  ok(p, 'pull-request-target-abuse fires');
  eq(p.policyImpact, 'block', 'BLOCK');
  eq(p.severity, 'critical', 'critical');
  eq(otsPatternVerdict(patterns), 'BLOCK', 'verdict');
});

test('GitHub Actions detector coverage: untrusted-workflow-input fires + BLOCK', () => {
  const patterns = detectOtsPatternsForRow({
    package: '.github/workflows/triage.yml#issue.steps.0',
    isWorkflowAction: true,
    untrustedWorkflowInput: true,
    workflowPath: '.github/workflows/triage.yml',
    evidenceText: 'echo ${{ github.event.issue.title }}',
  }, {});
  const p = patterns.find((x) => x.patternId === 'untrusted-workflow-input');
  ok(p, 'untrusted-workflow-input fires');
  eq(p.policyImpact, 'block', 'BLOCK');
  eq(otsPatternVerdict(patterns), 'BLOCK', 'verdict');
});

test('GitHub Actions detector coverage: dangerous-release-permission fires + WARN', () => {
  const patterns = detectOtsPatternsForRow({
    package: '.github/workflows/release.yml#release',
    isWorkflowAction: true,
    dangerousReleasePermission: true,
    workflowPath: '.github/workflows/release.yml',
    writeScopes: ['contents', 'packages'],
  }, {});
  const p = patterns.find((x) => x.patternId === 'dangerous-release-permission');
  ok(p, 'dangerous-release-permission fires');
  eq(p.policyImpact, 'warn', 'WARN (catalog default; not auto-block on its own)');
  eq(p.severity, 'high', 'contents write → HIGH tier');
  eq(p.catalogSeverity, 'high', 'pattern class stays high-risk');
  // Evidence surfaces the write scopes
  const ev = p.evidence.find((e) => e.label === 'Write Scopes');
  ok(ev && ev.value.includes('contents'), 'evidence lists scopes');
});

test('dangerous-release-permission: code-shipping scope tiers HIGH', () => {
  const r = workflowPermissionRisk(['contents']);
  eq(r.severity, 'high', 'contents → HIGH');
  eq(workflowPermissionRisk(['packages']).severity, 'high', 'packages → HIGH');
  eq(workflowPermissionRisk(['actions']).severity, 'high', 'actions → HIGH');
  eq(workflowPermissionRisk(['id-token']).severity, 'high', 'id-token → HIGH');
  eq(workflowPermissionRisk(['__all']).severity, 'high', 'write-all → HIGH');
  ok(/downstream users/i.test(r.audience), 'HIGH audience names downstream users');
});

test('dangerous-release-permission: housekeeping scope tiers LOW (no user impact)', () => {
  eq(workflowPermissionRisk(['security-events']).severity, 'low', 'security-events → LOW');
  eq(workflowPermissionRisk(['pull-requests']).severity, 'low', 'pull-requests → LOW');
  eq(workflowPermissionRisk(['issues']).severity, 'low', 'issues → LOW');
  const r = workflowPermissionRisk(['security-events']);
  ok(/none/i.test(r.userImpact), 'LOW user impact is None');
  ok(/maintainers only/i.test(r.audience), 'LOW audience is maintainers only');
});

test('dangerous-release-permission: mixed scopes tier HIGH if any scope ships code', () => {
  eq(workflowPermissionRisk(['issues', 'contents']).severity, 'high', 'any HIGH scope wins');
  eq(workflowPermissionRisk([]).severity, 'low', 'empty scopes → LOW (defensive)');
});

test('dangerous-release-permission: LOW-tier row emits low severity + audience evidence', () => {
  const patterns = detectOtsPatternsForRow({
    package: '.github/workflows/security.yml#analyze',
    isWorkflowAction: true,
    dangerousReleasePermission: true,
    workflowPath: '.github/workflows/security.yml',
    writeScopes: ['security-events'],
  }, {});
  const p = patterns.find((x) => x.patternId === 'dangerous-release-permission');
  ok(p, 'fires');
  eq(p.severity, 'low', 'security-events → LOW (was flat HIGH before tiering)');
  const who = p.evidence.find((e) => e.label === 'Who it affects');
  const impact = p.evidence.find((e) => e.label === 'User impact');
  ok(who && /maintainers only/i.test(who.value), 'audience evidence present');
  ok(impact && /none/i.test(impact.value), 'user-impact evidence present');
});

// ---------------------------------------------------------------------------
// PR #17 — Workflow origin evidence
// ---------------------------------------------------------------------------

test('workflowOrigin: step-level row → workflowPath#jobId.steps.N', () => {
  const origin = workflowOrigin({
    workflowPath: '.github/workflows/ci.yml',
    jobId: 'test',
    stepIndex: 2,
  });
  eq(origin, '.github/workflows/ci.yml#test.steps.2', 'step-level origin');
});

test('workflowOrigin: job-level row (no stepIndex) → workflowPath#jobId', () => {
  const origin = workflowOrigin({
    workflowPath: '.github/workflows/release.yml',
    jobId: 'publish',
  });
  eq(origin, '.github/workflows/release.yml#publish', 'job-level origin');
});

test('workflowOrigin: workflow-level row (no jobId) → workflowPath only', () => {
  const origin = workflowOrigin({ workflowPath: '.github/workflows/audit.yml' });
  eq(origin, '.github/workflows/audit.yml', 'workflow-level origin');
});

test('workflowOrigin: stepIndex 0 is preserved (no falsy-skip)', () => {
  const origin = workflowOrigin({
    workflowPath: '.github/workflows/ci.yml',
    jobId: 'test',
    stepIndex: 0,
  });
  eq(origin, '.github/workflows/ci.yml#test.steps.0', 'index 0 not dropped');
});

test('workflowOrigin: missing workflowPath falls back to row.package', () => {
  eq(workflowOrigin({ package: '.github/workflows/x.yml#a.steps.1' }), '.github/workflows/x.yml#a.steps.1', 'package fallback');
  eq(workflowOrigin({}), 'workflow.yml', 'final fallback');
  eq(workflowOrigin(null), 'workflow.yml', 'null-safe');
});

test('pull-request-target-abuse evidence: includes Source + step-level Origin', () => {
  const patterns = detectOtsPatternsForRow({
    package: '.github/workflows/bad.yml#test.steps.0',
    isWorkflowAction: true,
    pullRequestTargetAbuse: true,
    workflowPath: '.github/workflows/bad.yml',
    jobId: 'test',
    stepIndex: 0,
    evidenceText: 'actions/checkout@v4 with ref: ${{ github.event.pull_request.head.sha }}',
  }, {});
  const p = patterns.find((x) => x.patternId === 'pull-request-target-abuse');
  ok(p, 'pattern fires');
  const source = p.evidence.find((e) => e.label === 'Source');
  const origin = p.evidence.find((e) => e.label === 'Origin');
  ok(source, 'Source row present');
  eq(source.value, 'GitHub workflow', 'Source value');
  ok(origin, 'Origin row present');
  eq(origin.value, '.github/workflows/bad.yml#test.steps.0', 'step-level origin');
});

test('untrusted-workflow-input evidence: includes Source + step-level Origin', () => {
  const patterns = detectOtsPatternsForRow({
    package: '.github/workflows/triage.yml#issue.steps.1',
    isWorkflowAction: true,
    untrustedWorkflowInput: true,
    workflowPath: '.github/workflows/triage.yml',
    jobId: 'issue',
    stepIndex: 1,
    evidenceText: 'echo ${{ github.event.issue.title }}',
  }, {});
  const p = patterns.find((x) => x.patternId === 'untrusted-workflow-input');
  ok(p, 'pattern fires');
  const source = p.evidence.find((e) => e.label === 'Source');
  const origin = p.evidence.find((e) => e.label === 'Origin');
  ok(source && source.value === 'GitHub workflow', 'Source = GitHub workflow');
  ok(origin && origin.value === '.github/workflows/triage.yml#issue.steps.1', 'step-level origin');
});

test('dangerous-release-permission evidence: includes Source + job-level Origin (no stepIndex)', () => {
  // Permissions are declared per-job, not per-step — the parser emits
  // dangerous-release rows without a stepIndex. Origin must reflect that
  // and NOT invent a fake .steps.0.
  const patterns = detectOtsPatternsForRow({
    package: '.github/workflows/release.yml#publish',
    isWorkflowAction: true,
    dangerousReleasePermission: true,
    workflowPath: '.github/workflows/release.yml',
    jobId: 'publish',
    writeScopes: ['contents', 'packages'],
  }, {});
  const p = patterns.find((x) => x.patternId === 'dangerous-release-permission');
  ok(p, 'pattern fires');
  const source = p.evidence.find((e) => e.label === 'Source');
  const origin = p.evidence.find((e) => e.label === 'Origin');
  ok(source && source.value === 'GitHub workflow', 'Source = GitHub workflow');
  ok(origin && origin.value === '.github/workflows/release.yml#publish', 'job-level origin (no .steps.X)');
});

test('non-workflow (npm/package row) patterns do NOT carry Source: GitHub workflow', () => {
  // Honesty invariant: only workflow-originated patterns claim the
  // GitHub workflow source. A demo package row firing
  // install-time-remote-execution / hidden-dependency-injection must
  // not pretend the signal came from a workflow file.
  const patterns = detectOtsPatternsForRow({
    package: 'malicious-pkg',
    version: '1.0.0',
    hasInstallScript: true,
  }, { allowDemoFixtures: true });
  ok(patterns.length > 0, 'demo package row emits patterns');
  for (const p of patterns) {
    const source = (p.evidence || []).find((e) => e.label === 'Source');
    ok(
      !source || source.value !== 'GitHub workflow',
      `pattern ${p.patternId} must not claim GitHub workflow source on a non-workflow row`
    );
  }
});

test('production mode (allowDemoFixtures NOT set) does not fire on demo names alone', () => {
  // Honesty invariant. Demo names (axios@1.14.1, malicious-pkg,
  // @internal/payments) used to fire pattern clouds in production gate
  // responses, which made non-demo packages look indistinguishable from
  // synthetic ones. After the coverage-honesty pass, demo paths require
  // an explicit allowDemoFixtures: true opt-in. Production gate paths
  // never set the flag.
  const demoNames = [
    { row: { package: 'axios', version: '1.14.1' } },
    { row: { package: 'malicious-pkg' } },
    { row: { package: '@internal/payments' } },
  ];
  for (const { row } of demoNames) {
    const patterns = detectOtsPatternsForRow(row, {});
    ok(
      patterns.length === 0,
      `production mode emitted ${patterns.length} patterns for "${row.package}" (${patterns.map((p) => p.patternId).join(', ')}) — demo paths must be gated`,
    );
  }
});

test('allowDemoFixtures: true unlocks the demo-name pattern clouds', () => {
  // Companion to the production invariant above. The demo paths still
  // work for marketing surfaces (ProjectDetail dogfood page) and the
  // incident replay engine when callers opt in explicitly.
  const patterns = detectOtsPatternsForRow(
    { package: 'axios', version: '1.14.1', hasInstallScript: true },
    { allowDemoFixtures: true, ci: true, hasSecrets: true },
  );
  ok(patterns.length >= 3, `demo opt-in fired ${patterns.length} patterns; expected 3+`);
  const ids = patterns.map((p) => p.patternId);
  ok(ids.includes('known-vulnerability-exposure'), 'demo axios fires known-vulnerability-exposure');
  ok(ids.includes('install-time-remote-execution'), 'demo axios fires install-time-remote-execution');
});

test('known-vulnerability-exposure emission carries both severity and catalogSeverity', () => {
  // Honesty for severity display: the UI/evidence card should show the
  // observed per-match severity (e.g. OSV said HIGH) AND the catalog
  // default class (CRITICAL). Today only known-vulnerability-exposure
  // varies; other patterns can be enriched in future PRs.
  const high = detectOtsPatternsForRow(
    { package: 'somepkg', severity: 'high', ids: ['GHSA-fake-1234'] },
    {},
  );
  const vulnHigh = high.find((p) => p.patternId === 'known-vulnerability-exposure');
  ok(vulnHigh, 'pattern fires on GHSA id');
  eq(vulnHigh.severity, 'high', 'observed severity from row.severity');
  eq(vulnHigh.catalogSeverity, 'critical', 'catalog default preserved');
});

test('every catalog patternId appears in exactly one pack', () => {
  // Structural invariant. Orphaned definitions (no pack) won't appear in
  // /patterns filter UI; duplicated definitions across packs would show
  // twice. This test catches both.
  const definedIds = OTS_PATTERN_DEFINITIONS.map((d) => d.id);
  const inPackCounts = new Map();
  for (const id of definedIds) inPackCounts.set(id, 0);
  for (const pack of OTS_PATTERN_PACKS) {
    for (const id of pack.patternIds) {
      if (!inPackCounts.has(id)) throw new Error(`pack ${pack.id} references undefined pattern ${id}`);
      inPackCounts.set(id, inPackCounts.get(id) + 1);
    }
  }
  const orphans = [...inPackCounts.entries()].filter(([, n]) => n === 0).map(([id]) => id);
  const dupes = [...inPackCounts.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  ok(orphans.length === 0, `catalog entries not in any pack: ${orphans.join(', ') || '(none)'}`);
  ok(dupes.length === 0, `catalog entries in multiple packs: ${dupes.join(', ') || '(none)'}`);
});

if (failed > 0) {
  process.exit(1);
}

console.log(`\nOTS pattern tests passed: ${passed}`);
