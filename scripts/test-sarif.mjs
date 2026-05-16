#!/usr/bin/env node
/**
 * buildSarifReport verification.
 * Plain Node, PASS/FAIL per case, non-zero exit on any failure.
 */
import { buildSarifReport, __internal as sarifInternal } from '../src/shared/buildSarifReport.js';

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

function vuln(extra = {}) {
  return {
    package: extra.package ?? 'lodash',
    version: extra.version ?? '4.17.20',
    severity: extra.severity ?? 'high',
    ids: extra.ids ?? ['GHSA-29mw-wpgm-hmr9', 'CVE-2020-28500'],
    summary: extra.summary ?? 'ReDoS in lodash',
    fixedIn: extra.fixedIn ?? '4.17.21',
    resolvedRepo: extra.resolvedRepo ?? 'lodash/lodash',
    repoHealth: extra.repoHealth ?? null,
    verified: extra.verified ?? true,
    ...extra,
  };
}

// 1. Empty scan
test('schema basics: empty scan returns valid SARIF with empty results', () => {
  const out = buildSarifReport({ scanResult: { vulnerabilities: [] } });
  eq(out.version, '2.1.0', 'version');
  eq(out.$schema, sarifInternal.SCHEMA_URI, 'schema uri');
  ok(Array.isArray(out.runs) && out.runs.length === 1, 'runs is array of length 1');
  eq(out.runs[0].tool.driver.name, 'OpenSoyce', 'tool name');
  ok(Array.isArray(out.runs[0].results) && out.runs[0].results.length === 0, 'results is empty array');
  ok(Array.isArray(out.runs[0].tool.driver.rules), 'rules array exists');
  ok(out.runs[0].tool.driver.rules.length >= 1, 'at least one rule defined');
});

// 2. One vuln, severity mapping HIGH → error
test('one vuln, HIGH severity maps to level=error', () => {
  const out = buildSarifReport({ scanResult: { vulnerabilities: [vuln({ severity: 'high' })] } });
  const r = out.runs[0].results;
  eq(r.length, 1, 'one result');
  eq(r[0].level, 'error', 'high → error');
  eq(r[0].ruleId, 'opensoyce.vulnerable-dependency', 'rule id');
  ok(r[0].message.text.includes('lodash@4.17.20'), 'message names package@version');
});

// 3. Multiple severities
test('severity mapping: critical/high → error, medium/moderate → warning, low → note, unknown → warning', () => {
  const sevs = [
    { sev: 'critical', want: 'error' },
    { sev: 'high', want: 'error' },
    { sev: 'medium', want: 'warning' },
    { sev: 'moderate', want: 'warning' },
    { sev: 'low', want: 'note' },
    { sev: 'unknown', want: 'warning' },
    { sev: 'gibberish', want: 'warning' },
  ];
  for (const { sev, want } of sevs) {
    const out = buildSarifReport({ scanResult: { vulnerabilities: [vuln({ severity: sev, package: 'p' + sev })] } });
    eq(out.runs[0].results[0].level, want, `${sev} → ${want}`);
  }
});

// 4. Properties payload
test('properties payload: fixedIn, resolvedRepo, soyceScore, verdict, verified all surface', () => {
  const v = vuln({
    fixedIn: '4.17.21',
    resolvedRepo: 'lodash/lodash',
    repoHealth: { soyceScore: 8.2, verdict: 'FORKABLE', signals: {} },
    verified: true,
  });
  const out = buildSarifReport({ scanResult: { vulnerabilities: [v] } });
  const p = out.runs[0].results[0].properties;
  eq(p.fixedIn, '4.17.21', 'fixedIn');
  eq(p.resolvedRepo, 'lodash/lodash', 'resolvedRepo');
  eq(p.soyceScore, 8.2, 'soyceScore');
  eq(p.verdict, 'FORKABLE', 'verdict');
  eq(p.identityVerified, true, 'identityVerified');
  ok(Array.isArray(p.advisoryIds) && p.advisoryIds.includes('GHSA-29mw-wpgm-hmr9'), 'advisoryIds includes GHSA');
});

// 5. Borrowed-trust extra result
test('borrowed trust: verified=false emits extra borrowed-trust-identity result', () => {
  const v = vuln({ verified: false, mismatchReason: 'github_pkg_name_different', resolvedRepo: 'someone/wrong' });
  const out = buildSarifReport({ scanResult: { vulnerabilities: [v] } });
  const results = out.runs[0].results;
  eq(results.length, 2, 'two results (main + borrowed-trust)');
  const ids = results.map(r => r.ruleId);
  ok(ids.includes('opensoyce.vulnerable-dependency'), 'main rule present');
  ok(ids.includes('opensoyce.borrowed-trust-identity'), 'borrowed-trust rule present');
  const bt = results.find(r => r.ruleId === 'opensoyce.borrowed-trust-identity');
  eq(bt.level, 'warning', 'borrowed-trust is warning');
  eq(bt.properties.mismatchReason, 'github_pkg_name_different', 'mismatchReason surfaces');
  ok(bt.message.text.includes('someone/wrong'), 'message names mismatched repo');
});

test('borrowed trust: verified=true or "unverified" does NOT emit extra result', () => {
  const a = buildSarifReport({ scanResult: { vulnerabilities: [vuln({ verified: true })] } });
  eq(a.runs[0].results.length, 1, 'verified=true → 1 result');
  const b = buildSarifReport({ scanResult: { vulnerabilities: [vuln({ verified: 'unverified' })] } });
  eq(b.runs[0].results.length, 1, 'verified="unverified" → 1 result');
});

// 6. OSV URL construction
test('OSV url: GHSA preferred over CVE', () => {
  const v = vuln({ ids: ['GHSA-29mw-wpgm-hmr9', 'CVE-2020-28500'] });
  const out = buildSarifReport({ scanResult: { vulnerabilities: [v] } });
  eq(out.runs[0].results[0].properties.osvUrl, 'https://osv.dev/vulnerability/GHSA-29mw-wpgm-hmr9', 'GHSA chosen');
});

test('OSV url: CVE used when no GHSA present', () => {
  const v = vuln({ ids: ['CVE-2020-28500'] });
  const out = buildSarifReport({ scanResult: { vulnerabilities: [v] } });
  eq(out.runs[0].results[0].properties.osvUrl, 'https://osv.dev/vulnerability/CVE-2020-28500', 'CVE chosen');
});

test('OSV url: null when ids empty', () => {
  const v = vuln({ ids: [] });
  const out = buildSarifReport({ scanResult: { vulnerabilities: [v] } });
  eq(out.runs[0].results[0].properties.osvUrl, null, 'no ids → null');
});

// 7. Schema + version
test('schema URL + version present at root', () => {
  const out = buildSarifReport({ scanResult: { vulnerabilities: [] } });
  eq(out.version, '2.1.0', 'version 2.1.0');
  ok(typeof out.$schema === 'string' && out.$schema.includes('sarif-2.1.0'), '$schema is sarif-2.1.0 url');
});

// Additional structural checks driven by GitHub Code Scanning requirements.
test('every result has physicalLocation with region.startLine ≥ 1', () => {
  const v = vuln({ verified: false });
  const out = buildSarifReport({ scanResult: { vulnerabilities: [v] } });
  for (const r of out.runs[0].results) {
    const loc = r.locations && r.locations[0];
    ok(loc && loc.physicalLocation, `result ${r.ruleId} has physicalLocation`);
    ok(loc.physicalLocation.artifactLocation && typeof loc.physicalLocation.artifactLocation.uri === 'string', 'artifactLocation.uri set');
    ok(loc.physicalLocation.region && typeof loc.physicalLocation.region.startLine === 'number', 'region.startLine numeric');
    ok(loc.physicalLocation.region.startLine >= 1, 'region.startLine >= 1');
  }
});

test('suppressions list surfaces in run.properties', () => {
  const supp = [{
    vuln: { package: 'minimist', version: '1.2.5', ids: ['CVE-2020-28500'] },
    rule: { kind: 'pkg', value: 'minimist', version: '1.2.5', comment: 'vendored' },
  }];
  const out = buildSarifReport({ scanResult: { vulnerabilities: [] }, suppressions: supp });
  const recorded = out.runs[0].properties && out.runs[0].properties.suppressions;
  ok(Array.isArray(recorded) && recorded.length === 1, 'suppressions recorded');
  eq(recorded[0].package, 'minimist', 'package recorded');
  eq(recorded[0].rule.comment, 'vendored', 'comment recorded');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
