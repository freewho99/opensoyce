#!/usr/bin/env node
/**
 * Tests for the incident-candidates pipeline:
 *   - parseThreatFromTitle (HN title -> parsed metadata)
 *   - titleMatchesSecurityIncident (keyword filter)
 *   - validateCandidate (input shape contract)
 *   - reportIncidentCandidate (with injected mock Supabase client)
 *
 * In-process, no network. Safe for CI.
 */

import assert from 'node:assert';
import {
  parseThreatFromTitle,
  titleMatchesSecurityIncident,
} from './hn-exploit-scraper.mjs';
import {
  validateCandidate,
  reportIncidentCandidate,
} from '../src/shared/incidentCandidates.js';
import {
  __setSupabaseClientForTests,
  __resetSupabaseClientForTests,
} from '../api/_supabase.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.then(
        () => { console.log(`PASS ${name}`); passed += 1; },
        (err) => { console.log(`FAIL ${name} -- ${err.message}`); failed += 1; },
      );
    }
    console.log(`PASS ${name}`);
    passed += 1;
  } catch (err) {
    console.log(`FAIL ${name} -- ${err.message}`);
    failed += 1;
  }
  return undefined;
}

async function run() {
  // ============================================================
  console.log('=== titleMatchesSecurityIncident (keyword filter) ===');

  test('matches: malicious npm package', () => {
    assert.strictEqual(titleMatchesSecurityIncident('Malicious npm package found in registry'), true);
  });

  test('matches: supply-chain attack', () => {
    assert.strictEqual(titleMatchesSecurityIncident('Supply chain attack hits popular project'), true);
  });

  test('matches: typosquat', () => {
    assert.strictEqual(titleMatchesSecurityIncident("Typosquatting attack on 'lodash'"), true);
  });

  test('matches: dependency confusion', () => {
    assert.strictEqual(titleMatchesSecurityIncident('Dependency confusion in internal package'), true);
  });

  test('matches: CVE id present', () => {
    assert.strictEqual(titleMatchesSecurityIncident('Critical RCE: CVE-2025-12345 disclosed'), true);
  });

  test('matches: GHSA id present', () => {
    assert.strictEqual(titleMatchesSecurityIncident('Advisory GHSA-pjwm-rvh2-c87w published'), true);
  });

  test('rejects: marketing post about open-source AI security', () => {
    assert.strictEqual(
      titleMatchesSecurityIncident("We've raised $10M to build open source AI security"),
      false,
      'marketing posts should not match',
    );
  });

  test('rejects: generic Show HN about MCP registry', () => {
    assert.strictEqual(
      titleMatchesSecurityIncident('Show HN: MCP Registry – NPM-style install for MCP servers'),
      false,
    );
  });

  test('rejects: generic SIP stack comparison', () => {
    assert.strictEqual(
      titleMatchesSecurityIncident('JsSIP vs. Sip.js vs. Browser-Phone: Choosing an Open-Source WebRTC Sip Stack'),
      false,
    );
  });

  // ============================================================
  console.log('\n=== parseThreatFromTitle (HN headline -> metadata) ===');

  test('parser: typosquat with homoglyph in quotes', () => {
    const parsed = parseThreatFromTitle("Typosquatting attack 'lоdash' on npm");
    assert.strictEqual(parsed.package_name, 'lоdash', 'should preserve Cyrillic homoglyph');
    assert.strictEqual(parsed.ecosystem, 'npm');
    assert.strictEqual(parsed.threat_type, 'typosquat');
    assert.strictEqual(parsed.version, null, 'no version in title -> null, not "0.0.0"');
    assert.strictEqual(parsed.parser_confidence, 'medium', 'quoted match -> medium confidence');
  });

  test('parser: PyPI package with version', () => {
    const parsed = parseThreatFromTitle('Malicious backdoor in python-jwt library 2.0.1 on PyPI');
    assert.strictEqual(parsed.package_name, 'python-jwt');
    assert.strictEqual(parsed.ecosystem, 'PyPI');
    assert.strictEqual(parsed.threat_type, 'malicious_script');
    assert.strictEqual(parsed.version, '2.0.1');
  });

  test('parser: scoped npm package + dependency confusion', () => {
    const parsed = parseThreatFromTitle('Dependency confusion exploit discovered in @scope/core-package');
    assert.strictEqual(parsed.package_name, '@scope/core-package');
    assert.strictEqual(parsed.ecosystem, 'npm');
    assert.strictEqual(parsed.threat_type, 'dependency_confusion');
  });

  test('parser: obfuscated payload kebab-case fallback', () => {
    const parsed = parseThreatFromTitle('Obfuscated credential stealer payload in express-helper-module');
    assert.strictEqual(parsed.package_name, 'express-helper-module');
    assert.strictEqual(parsed.ecosystem, 'npm');
    assert.strictEqual(parsed.threat_type, 'obfuscated_payload');
  });

  test('parser: no package name in vague headline -> null (not "unknown-package")', () => {
    const parsed = parseThreatFromTitle('High severity zero-day vulnerability in popular package');
    assert.strictEqual(parsed.package_name, null,
      'parser must return null so the scraper can SKIP queuing rather than pollute the review queue');
  });

  test('parser: no ecosystem signal -> null (not defaulted to npm)', () => {
    const parsed = parseThreatFromTitle('CVE-2025-99999 advisory issued');
    assert.strictEqual(parsed.ecosystem, null,
      'must not guess npm when ecosystem language is absent');
  });

  // ============================================================
  console.log('\n=== validateCandidate (input contract) ===');

  test('validate: minimal valid candidate passes', () => {
    const r = validateCandidate({
      source: 'hn-heuristic',
      source_id: '12345',
      title: 'Malicious npm package x',
    });
    assert.strictEqual(r.ok, true);
  });

  test('validate: rejects unknown source', () => {
    const r = validateCandidate({ source: 'twitter', source_id: '1', title: 't' });
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /invalid source/);
  });

  test('validate: rejects missing source_id', () => {
    const r = validateCandidate({ source: 'hn-heuristic', title: 't' });
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /source_id/);
  });

  test('validate: rejects missing title', () => {
    const r = validateCandidate({ source: 'hn-heuristic', source_id: '1' });
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /title/);
  });

  test('validate: rejects invalid ecosystem', () => {
    const r = validateCandidate({
      source: 'hn-heuristic', source_id: '1', title: 't', parsed_ecosystem: 'cargo',
    });
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /parsed_ecosystem/);
  });

  test('validate: rejects invalid threat_type', () => {
    const r = validateCandidate({
      source: 'hn-heuristic', source_id: '1', title: 't', parsed_threat_type: 'ransomware',
    });
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /parsed_threat_type/);
  });

  // ============================================================
  console.log('\n=== reportIncidentCandidate (with mock supabase) ===');

  await test('report: upserts on (source, source_id) and returns ok', async () => {
    const captured = { table: null, upsertArg: null, upsertOpts: null };

    const mockClient = {
      from(table) {
        captured.table = table;
        return {
          upsert(row, opts) {
            captured.upsertArg = row;
            captured.upsertOpts = opts;
            return Promise.resolve({ error: null });
          },
        };
      },
    };

    __setSupabaseClientForTests(mockClient);
    try {
      const r = await reportIncidentCandidate({
        source: 'hn-heuristic',
        source_id: '99999',
        title: 'Malicious npm package found',
        source_url: 'https://example.com/x',
        author: 'alice',
        published_at: '2026-06-02T00:00:00.000Z',
        parsed_package: 'evil-pkg',
        parsed_version: '1.2.3',
        parsed_ecosystem: 'npm',
        parsed_threat_type: 'malicious_script',
        parser_confidence: 'medium',
      });
      assert.strictEqual(r.ok, true);
      assert.strictEqual(captured.table, 'incident_candidates');
      assert.strictEqual(captured.upsertArg.parsed_package, 'evil-pkg');
      assert.strictEqual(captured.upsertArg.parser_confidence, 'medium');
      assert.deepStrictEqual(captured.upsertOpts, { onConflict: 'source,source_id' });
    } finally {
      __setSupabaseClientForTests(null);
      __resetSupabaseClientForTests();
    }
  });

  await test('report: propagates DB error as {ok:false, reason}', async () => {
    const mockClient = {
      from() {
        return {
          upsert() {
            return Promise.resolve({ error: { message: 'unique constraint violated' } });
          },
        };
      },
    };

    __setSupabaseClientForTests(mockClient);
    try {
      const r = await reportIncidentCandidate({
        source: 'hn-heuristic',
        source_id: '111',
        title: 'something',
      });
      assert.strictEqual(r.ok, false);
      assert.match(r.reason, /db-error.*unique constraint/);
    } finally {
      __setSupabaseClientForTests(null);
      __resetSupabaseClientForTests();
    }
  });

  await test('report: rejects bad input BEFORE touching DB', async () => {
    let dbTouched = false;
    const mockClient = {
      from() {
        dbTouched = true;
        return { upsert: () => Promise.resolve({ error: null }) };
      },
    };

    __setSupabaseClientForTests(mockClient);
    try {
      const r = await reportIncidentCandidate({ source: 'bogus', source_id: '1', title: 't' });
      assert.strictEqual(r.ok, false);
      assert.strictEqual(dbTouched, false, 'validation must run before DB call');
    } finally {
      __setSupabaseClientForTests(null);
      __resetSupabaseClientForTests();
    }
  });

  await test('report: returns {ok:false, supabase-unavailable} when env missing', async () => {
    // Clear the test-injected client AND any cached client so getSupabase()
    // hits the env-var check and throws SUPABASE_ENV_MISSING.
    __setSupabaseClientForTests(null);
    __resetSupabaseClientForTests();
    const prevUrl = process.env.SUPABASE_URL;
    const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      const r = await reportIncidentCandidate({
        source: 'hn-heuristic', source_id: '222', title: 't',
      });
      assert.strictEqual(r.ok, false);
      assert.match(r.reason, /supabase-unavailable/);
    } finally {
      if (prevUrl) process.env.SUPABASE_URL = prevUrl;
      if (prevKey) process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
    }
  });

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
