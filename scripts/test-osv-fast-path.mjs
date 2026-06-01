#!/usr/bin/env node
/**
 * Unit tests for src/shared/osvFastPath.js
 *
 * Covers:
 *   - Empty input returns empty map
 *   - Clean response with no vulns maps name → null
 *   - Critical vuln → hasVulns, critical, ids, summary populated
 *   - Multiple vulns → highestSeverity is max
 *   - Severity normalization from database_specific
 *   - Severity normalization from CVSS string fallback
 *   - Upstream null / failure → all names map to null (no crash)
 *   - Cache hit: second call doesn't refetch
 *   - Cache expiry: TTL-based purge
 *   - Names deduplicated + lowercased
 *   - detailPatchFromOsv shape
 */

import {
  queryOsvBatch,
  detailPatchFromOsv,
  __setOsvClientForTests,
  __resetOsvCacheForTests,
  __setClockForTests,
} from '../src/shared/osvFastPath.js';

let passed = 0;
let failed = 0;
const pending = [];

function test(name, fn) {
  pending.push(async () => {
    __resetOsvCacheForTests();
    __setOsvClientForTests(null);
    __setClockForTests(null);
    try {
      await fn();
      console.log(`PASS  ${name}`);
      passed += 1;
    } catch (e) {
      console.log(`FAIL  ${name} -- ${e.message}\n${e.stack}`);
      failed += 1;
    }
  });
}

function ok(c, msg) {
  if (!c) throw new Error(msg || 'assertion failed');
}
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// ---------------------------------------------------------------------------

test('empty input returns empty map', async () => {
  const m = await queryOsvBatch([]);
  eq(m.size, 0, 'size');
});

test('clean response with no vulns maps name → null', async () => {
  __setOsvClientForTests(async (names) => ({
    results: names.map(() => ({})),
  }));
  const m = await queryOsvBatch(['react', 'express']);
  eq(m.size, 2, 'size');
  eq(m.get('react'), null, 'react no vulns');
  eq(m.get('express'), null, 'express no vulns');
});

test('critical vuln populates ids + severity + summary', async () => {
  __setOsvClientForTests(async () => ({
    results: [
      {
        vulns: [
          {
            id: 'CVE-2021-23337',
            summary: 'Command injection in lodash',
            database_specific: { severity: 'CRITICAL' },
          },
        ],
      },
    ],
  }));
  const m = await queryOsvBatch(['lodash']);
  const summary = m.get('lodash');
  ok(summary !== null, 'summary not null');
  eq(summary.hasVulns, true, 'hasVulns');
  eq(summary.critical, true, 'critical');
  eq(summary.highestSeverity, 'critical', 'severity');
  ok(summary.ids.includes('CVE-2021-23337'), 'id in list');
  ok(summary.summary.includes('Command injection'), 'summary populated');
});

test('multiple vulns pick highest severity', async () => {
  __setOsvClientForTests(async () => ({
    results: [
      {
        vulns: [
          { id: 'GHSA-aaa', database_specific: { severity: 'LOW' } },
          { id: 'GHSA-bbb', database_specific: { severity: 'HIGH' } },
          { id: 'GHSA-ccc', database_specific: { severity: 'MODERATE' } },
        ],
      },
    ],
  }));
  const m = await queryOsvBatch(['multi-vuln-pkg']);
  const summary = m.get('multi-vuln-pkg');
  eq(summary.highestSeverity, 'high', 'highest is HIGH');
  eq(summary.critical, false, 'not critical (no CRITICAL vuln)');
  eq(summary.ids.length, 3, 'all ids preserved');
});

test('CVSS string fallback when database_specific missing', async () => {
  __setOsvClientForTests(async () => ({
    results: [
      {
        vulns: [
          {
            id: 'CVE-9999-1111',
            severity: [{ type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H' }],
          },
        ],
      },
    ],
  }));
  const m = await queryOsvBatch(['cvss-only-pkg']);
  const summary = m.get('cvss-only-pkg');
  eq(summary.highestSeverity, 'critical', 'CVSS C:H I:H A:H → critical');
});

test('CVSS escalates above database_specific (ua-parser-js compromise case)', async () => {
  // Real shape of GHSA-pjwm-rvh2-c87w as returned by /v1/vulns/<id>:
  // GitHub-rated HIGH in database_specific, but the underlying CVSS vector
  // is C:H/I:H/A:H — critical-tier impact across all CIA dimensions.
  // The fix takes MAX(database_specific, cvss) so the critical signal is not
  // lost. Before the fix, pickSeverity returned 'high' (from database_specific)
  // and stopped, never reading the CVSS. The gate path consumed
  // osvSummary.critical = false and let ua-parser-js@0.7.29 through with ALLOW.
  __setOsvClientForTests(async () => ({
    results: [
      {
        vulns: [
          {
            id: 'GHSA-pjwm-rvh2-c87w',
            summary: 'Embedded malicious code in ua-parser-js',
            database_specific: { severity: 'HIGH' },
            severity: [{ type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:H' }],
          },
        ],
      },
    ],
  }));
  const m = await queryOsvBatch(['ua-parser-js']);
  const summary = m.get('ua-parser-js');
  eq(summary.highestSeverity, 'critical', 'CVSS escalates above database_specific HIGH');
  eq(summary.critical, true, 'critical = true — gate will BLOCK this package');
  ok(summary.ids.includes('GHSA-pjwm-rvh2-c87w'), 'GHSA ID surfaced');
});

test('compromiseIndicators: CWE-829 / CWE-912 vuln produces install + remote + maintainer signals', async () => {
  // Real shape of GHSA-pjwm-rvh2-c87w as probed against /v1/vulns/<id> on
  // 2026-06-01. CWE-829 (Inclusion of Functionality from Untrusted Control
  // Sphere) + CWE-912 (Hidden Functionality) is the structural signal of
  // supply-chain compromise.
  __setOsvClientForTests(async () => ({
    results: [{
      vulns: [{
        id: 'GHSA-pjwm-rvh2-c87w',
        summary: 'Embedded malware in ua-parser-js',
        database_specific: { severity: 'HIGH', cwe_ids: ['CWE-829', 'CWE-912'] },
        severity: [{ type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:H' }],
      }],
    }],
  }));
  const m = await queryOsvBatch(['ua-parser-js']);
  const summary = m.get('ua-parser-js');
  ok(summary.compromiseIndicators, 'compromiseIndicators present');
  eq(summary.compromiseIndicators.hasInstallScript, true, 'install script signal set');
  eq(summary.compromiseIndicators.hasRemoteExecution, true, 'remote execution signal set');
  ok(summary.compromiseIndicators.maintainerCompromiseReason.includes('Embedded malware'), 'reason carries advisory summary');
  ok(summary.compromiseIndicators.maintainerCompromiseReason.includes('GHSA-pjwm-rvh2-c87w'), 'reason cites the GHSA id');
  eq(summary.compromiseIndicators.indicatorIds.length, 1, 'one indicator id');
});

test('compromiseIndicators: ReDoS-only vulns (CWE-400 / CWE-1333) do NOT produce compromise signals', async () => {
  // The 4 other ua-parser-js GHSAs are ReDoS bugs. Those CWE codes describe
  // routine API-surface vulnerabilities, not supply-chain compromise.
  // Heuristic must stay conservative.
  __setOsvClientForTests(async () => ({
    results: [{
      vulns: [
        { id: 'GHSA-394c-5j6w-4xmx', database_specific: { severity: 'HIGH', cwe_ids: ['CWE-400'] } },
        { id: 'GHSA-fhg7-m89q-25r3', database_specific: { severity: 'HIGH', cwe_ids: ['CWE-1333', 'CWE-400'] } },
      ],
    }],
  }));
  const m = await queryOsvBatch(['redos-only-pkg']);
  const summary = m.get('redos-only-pkg');
  ok(summary.compromiseIndicators, 'compromiseIndicators present');
  eq(summary.compromiseIndicators.hasInstallScript, false, 'no install script signal');
  eq(summary.compromiseIndicators.hasRemoteExecution, false, 'no remote execution signal');
  eq(summary.compromiseIndicators.maintainerCompromiseReason, null, 'no maintainer compromise reason');
  eq(summary.compromiseIndicators.indicatorIds.length, 0, 'no indicator ids');
});

test('compromiseIndicators: mixed list (4 ReDoS + 1 compromise) produces signals from the compromise only', async () => {
  // Real ua-parser-js shape: 4 ReDoS + 1 compromise. Signals come from the
  // one compromise advisory; the ReDoS ones do not pollute the indicators.
  __setOsvClientForTests(async () => ({
    results: [{
      vulns: [
        { id: 'GHSA-394c-5j6w-4xmx', database_specific: { severity: 'HIGH', cwe_ids: ['CWE-400'] } },
        { id: 'GHSA-662x-fhqg-9p8v', database_specific: { severity: 'HIGH', cwe_ids: ['CWE-400'] } },
        { id: 'GHSA-78cj-fxph-m83p', database_specific: { severity: 'HIGH', cwe_ids: ['CWE-400'] } },
        { id: 'GHSA-fhg7-m89q-25r3', database_specific: { severity: 'HIGH', cwe_ids: ['CWE-1333', 'CWE-400'] } },
        {
          id: 'GHSA-pjwm-rvh2-c87w',
          summary: 'Embedded malware in ua-parser-js',
          database_specific: { severity: 'HIGH', cwe_ids: ['CWE-829', 'CWE-912'] },
        },
      ],
    }],
  }));
  const m = await queryOsvBatch(['ua-parser-js-mixed']);
  const summary = m.get('ua-parser-js-mixed');
  eq(summary.compromiseIndicators.hasInstallScript, true, 'install script signal set by compromise advisory');
  eq(summary.compromiseIndicators.hasRemoteExecution, true, 'remote execution signal set by compromise advisory');
  eq(summary.compromiseIndicators.indicatorIds.length, 1, 'only the compromise advisory contributes to indicators');
  eq(summary.compromiseIndicators.indicatorIds[0], 'GHSA-pjwm-rvh2-c87w', 'correct indicator id');
});

test('compromiseIndicators: no vulns → null summary (no indicators)', async () => {
  __setOsvClientForTests(async () => ({ results: [{}] }));
  const m = await queryOsvBatch(['clean-pkg']);
  eq(m.get('clean-pkg'), null, 'no-vuln packages map to null, not to a stub summary');
});

test('upstream null / failure → all names map to null (degrades gracefully)', async () => {
  __setOsvClientForTests(async () => null);
  const m = await queryOsvBatch(['react', 'express']);
  eq(m.get('react'), null, 'react null');
  eq(m.get('express'), null, 'express null');
});

test('cache hit: second call does not refetch', async () => {
  let fetchCount = 0;
  __setOsvClientForTests(async (names) => {
    fetchCount += 1;
    return { results: names.map(() => ({ vulns: [{ id: 'GHSA-cached', database_specific: { severity: 'HIGH' } }] })) };
  });

  const m1 = await queryOsvBatch(['cached-pkg']);
  const m2 = await queryOsvBatch(['cached-pkg']);
  const m3 = await queryOsvBatch(['cached-pkg']);

  eq(fetchCount, 1, 'fetched once');
  ok(m1.get('cached-pkg').hasVulns, 'first call has vulns');
  ok(m2.get('cached-pkg').hasVulns, 'second call has vulns');
  ok(m3.get('cached-pkg').hasVulns, 'third call has vulns');
});

test('cache TTL: expired entries refetched', async () => {
  let now = 1_000_000;
  __setClockForTests(() => now);
  let fetchCount = 0;
  __setOsvClientForTests(async (names) => {
    fetchCount += 1;
    return { results: names.map(() => ({ vulns: [{ id: 'GHSA-ttl', database_specific: { severity: 'CRITICAL' } }] })) };
  });

  await queryOsvBatch(['ttl-pkg']);
  eq(fetchCount, 1, 'first fetch');

  // Advance just under 10 min — still cached.
  now += 9 * 60 * 1000;
  await queryOsvBatch(['ttl-pkg']);
  eq(fetchCount, 1, 'still cached at 9 min');

  // Advance past 10 min — should refetch.
  now += 2 * 60 * 1000;
  await queryOsvBatch(['ttl-pkg']);
  eq(fetchCount, 2, 'refetched after TTL');
});

test('names deduplicated and lowercased', async () => {
  let received = null;
  __setOsvClientForTests(async (names) => {
    received = names;
    return { results: names.map(() => ({})) };
  });
  await queryOsvBatch(['React', 'react', 'REACT', '  react  ']);
  eq(received.length, 1, 'dedup + normalize → 1 name');
  eq(received[0], 'react', 'lowercased');
});

test('null and blank entries filtered out', async () => {
  let received = null;
  __setOsvClientForTests(async (names) => {
    received = names;
    return { results: names.map(() => ({})) };
  });
  const m = await queryOsvBatch([null, '', '   ', undefined, 'real-pkg']);
  eq(received.length, 1, 'only real-pkg sent');
  eq(m.size, 1, 'only real-pkg in result');
});

test('detailPatchFromOsv returns null on null / no-vuln summaries', () => {
  eq(detailPatchFromOsv(null), null, 'null input');
  eq(detailPatchFromOsv({ hasVulns: false, ids: [] }), null, 'hasVulns false');
});

test('detailPatchFromOsv exposes critical + osvIds + osvSeverity + osvSummary', () => {
  const summary = {
    hasVulns: true,
    critical: true,
    highestSeverity: 'critical',
    ids: ['CVE-1', 'GHSA-2'],
    summary: 'A nasty bug',
  };
  const patch = detailPatchFromOsv(summary);
  eq(patch.critical, true, 'critical');
  eq(patch.osvSeverity, 'critical', 'severity');
  eq(patch.osvSummary, 'A nasty bug', 'summary');
  eq(patch.osvIds.length, 2, 'ids length');
});

test('partial response: mixed vulns and no-vulns in one batch', async () => {
  __setOsvClientForTests(async (names) => ({
    results: names.map((n) =>
      n === 'safe'
        ? {}
        : { vulns: [{ id: 'GHSA-bad', database_specific: { severity: 'CRITICAL' } }] },
    ),
  }));
  const m = await queryOsvBatch(['safe', 'risky']);
  eq(m.get('safe'), null, 'safe → null');
  ok(m.get('risky').hasVulns, 'risky → hasVulns');
  eq(m.get('risky').critical, true, 'risky → critical');
});

(async () => {
  for (const fn of pending) await fn();
  console.log(`\nOSV Fast-Path tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
