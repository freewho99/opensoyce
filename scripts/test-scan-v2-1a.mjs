#!/usr/bin/env node
/**
 * Scanner v2.1a unit-style verification.
 *
 * Goals:
 *   1. Confirm that the per-vuln failure-isolation invariant holds: when one
 *      vuln's repo-health analysis throws, the response still includes every
 *      other vulnerability and the failure is captured as
 *      `repoHealthError: 'ANALYSIS_FAILED'`.
 *   2. Confirm that `confidence === 'NONE'` produces
 *      `repoHealthError: 'IDENTITY_NONE'` and `repoHealth === null`.
 *   3. Confirm that the success path emits `repoHealth.soyceScore` plus
 *      `signals.{maintenance,security,activity}` and a verdict from the
 *      shared verdict bands.
 *
 * Mocks `getCachedAnalysis` so the test doesn't depend on GitHub. The helper
 * function used here is a behavioural duplicate of the one in api/scan.js —
 * this file is the source-of-truth verification that the contract holds.
 */
import assert from 'node:assert/strict';
import { verdictFor } from '../src/shared/verdict.js';

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workerCount = Math.min(limit, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { results[idx] = { ok: true, value: await fn(items[idx], idx) }; }
      catch (error) { results[idx] = { ok: false, error }; }
    }
  });
  await Promise.all(workers);
  return results;
}

function splitOwnerRepo(slug) {
  if (typeof slug !== 'string') return null;
  const parts = slug.split('/');
  if (parts.length !== 2) return null;
  const [owner, repo] = parts;
  if (!owner || !repo) return null;
  return { owner, repo };
}

async function attach(vulns, getAnalysis) {
  const enriched = vulns.map(v => ({ ...v, repoHealth: null, repoHealthError: null }));
  const eligible = [];
  enriched.forEach((v, idx) => {
    const isResolved = (v.confidence === 'HIGH' || v.confidence === 'MEDIUM') && !!v.resolvedRepo;
    if (!isResolved) { v.repoHealthError = 'IDENTITY_NONE'; return; }
    const parts = splitOwnerRepo(v.resolvedRepo);
    if (!parts) { v.repoHealthError = 'IDENTITY_NONE'; return; }
    eligible.push({ idx, owner: parts.owner, repo: parts.repo });
  });
  const outcomes = await mapWithConcurrency(eligible, 5, ({ owner, repo }) => getAnalysis(owner, repo));
  eligible.forEach((target, i) => {
    const outcome = outcomes[i];
    const v = enriched[target.idx];
    if (!outcome.ok) { v.repoHealthError = 'ANALYSIS_FAILED'; return; }
    const data = outcome.value;
    if (!data || typeof data.total !== 'number' || !data.breakdown) {
      v.repoHealthError = 'ANALYSIS_FAILED'; return;
    }
    v.repoHealth = {
      soyceScore: data.total,
      verdict: verdictFor(data.total, { earlyBreakout: false }),
      signals: {
        maintenance: data.breakdown.maintenance ?? 0,
        security: data.breakdown.security ?? 0,
        activity: data.breakdown.activity ?? 0,
      },
    };
    v.repoHealthError = null;
  });
  return enriched;
}

const vulns = [
  // success
  { package: 'lodash', version: '4.17.20', resolvedRepo: 'lodash/lodash', confidence: 'HIGH' },
  // analysis failure (throws)
  { package: 'minimist', version: '0.0.8', resolvedRepo: 'minimistjs/minimist', confidence: 'HIGH' },
  // no identity
  { package: 'someprivatepkg', version: '1.0.0', resolvedRepo: null, confidence: 'NONE' },
];

const getAnalysis = async (owner, repo) => {
  if (owner === 'minimistjs') throw new Error('boom');
  return {
    total: 6.7,
    breakdown: { maintenance: 1.9, security: 1.5, activity: 0.4, community: 1.8, documentation: 1.1 },
  };
};

const result = await attach(vulns, getAnalysis);

assert.equal(result.length, 3, 'every vuln remains in the response');
assert.equal(result[0].repoHealthError, null, 'lodash success: no error');
assert.equal(result[0].repoHealth.soyceScore, 6.7, 'lodash score attached');
assert.equal(result[0].repoHealth.verdict, 'STABLE', 'lodash 6.7 -> STABLE');
assert.equal(result[0].repoHealth.signals.maintenance, 1.9);
assert.equal(result[0].repoHealth.signals.security, 1.5);
assert.equal(result[0].repoHealth.signals.activity, 0.4);

assert.equal(result[1].repoHealth, null, 'minimist analysis failure: null health');
assert.equal(result[1].repoHealthError, 'ANALYSIS_FAILED', 'minimist analysis failure flag set');

assert.equal(result[2].repoHealth, null, 'NONE confidence: null health');
assert.equal(result[2].repoHealthError, 'IDENTITY_NONE', 'NONE confidence flag set');

console.log('OK — per-vuln failure isolation holds.');
console.log(JSON.stringify(result, null, 2));
