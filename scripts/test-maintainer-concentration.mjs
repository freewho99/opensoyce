#!/usr/bin/env node
/**
 * AI signals v0.1 — maintainer-concentration helper tests.
 *
 * Plain Node, PASS/FAIL per case, non-zero exit on any failure.
 */
import {
  computeMaintainerConcentration,
  isBotContributor,
} from '../src/shared/maintainerConcentration.js';

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`PASS  ${name}`); passed += 1; }
  catch (e) { console.log(`FAIL  ${name} -- ${e.message}`); failed += 1; }
}
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function near(a, b, eps, msg) {
  if (Math.abs(a - b) > eps) throw new Error(`${msg}: expected ${b} (±${eps}), got ${a}`);
}

const NOW = new Date('2026-05-14T00:00:00Z');

// ----- Bot detection -----
test('isBotContributor: type Bot', () => {
  eq(isBotContributor({ login: 'something', type: 'Bot' }), true, 'type:Bot');
});
test('isBotContributor: [bot] suffix', () => {
  eq(isBotContributor({ login: 'dependabot[bot]', type: 'User' }), true, '[bot] suffix');
});
test('isBotContributor: known login dependabot', () => {
  eq(isBotContributor({ login: 'dependabot' }), true, 'known login');
});
test('isBotContributor: known login renovate', () => {
  eq(isBotContributor({ login: 'renovate' }), true, 'known login renovate');
});
test('isBotContributor: github-actions', () => {
  eq(isBotContributor({ login: 'github-actions' }), true, 'github-actions');
});
test('isBotContributor: snyk-bot via known list', () => {
  eq(isBotContributor({ login: 'snyk-bot' }), true, 'snyk-bot known');
});
test('isBotContributor: -bot substring catches arbitrary bot accounts', () => {
  eq(isBotContributor({ login: 'somerandom-bot' }), true, '-bot suffix');
});
test('isBotContributor: bot- prefix', () => {
  eq(isBotContributor({ login: 'bot-thing' }), true, 'bot- prefix');
});
test('isBotContributor: human login is not a bot', () => {
  eq(isBotContributor({ login: 'tj', type: 'User' }), false, 'tj is human');
});
test('isBotContributor: null/undefined safely false', () => {
  eq(isBotContributor(null), false, 'null safe');
  eq(isBotContributor(undefined), false, 'undefined safe');
  eq(isBotContributor({}), false, 'empty object safe');
});

// ----- Healthy distributed team -----
test('healthy distributed team: 5 contributors with similar contributions', () => {
  const contributors = [
    { login: 'a', contributions: 100, type: 'User' },
    { login: 'b', contributions: 110, type: 'User' },
    { login: 'c', contributions: 95, type: 'User' },
    { login: 'd', contributions: 105, type: 'User' },
    { login: 'e', contributions: 90, type: 'User' },
  ];
  const commits = [{ commit: { author: { date: '2026-05-10T00:00:00Z' } } }];
  const out = computeMaintainerConcentration(contributors, commits, NOW);
  near(out.topShare, 0.22, 0.05, 'topShare ~ 0.22');
  eq(out.nonBotContributorCount, 5, '5 non-bot contributors');
  eq(out.isSingleMaintainer, false, 'distributed team is not single-maintainer');
});

// ----- Single maintainer -----
test('single maintainer: one author with 950, one with 20 → isSingleMaintainer true', () => {
  const contributors = [
    { login: 'soloDev', contributions: 950, type: 'User' },
    { login: 'occasional', contributions: 20, type: 'User' },
  ];
  const commits = [{ commit: { author: { date: '2025-12-01T00:00:00Z' } } }];
  const out = computeMaintainerConcentration(contributors, commits, NOW);
  near(out.topShare, 950 / 970, 0.001, 'top share ~ 0.979');
  eq(out.nonBotContributorCount, 2, '2 non-bots');
  eq(out.isSingleMaintainer, true, 'should be single-maintainer');
});

// ----- Bot-heavy repo -----
test('bot-heavy repo: 1 human + dependabot dominating → share computed from non-bot only', () => {
  const contributors = [
    { login: 'maintainer', contributions: 100, type: 'User' },
    { login: 'dependabot[bot]', contributions: 500, type: 'Bot' },
  ];
  const commits = [{ commit: { author: { date: '2026-05-10T00:00:00Z' } } }];
  const out = computeMaintainerConcentration(contributors, commits, NOW);
  eq(out.topShare, 1.0, 'bot stripped, human is 100%');
  eq(out.nonBotContributorCount, 1, 'only 1 non-bot');
  eq(out.isSingleMaintainer, true, '100% share with 1 human is single-maintainer');
});

// ----- Multiple bot accounts -----
test('multiple bot accounts filtered: [bot] suffix, -bot substring, known logins', () => {
  const contributors = [
    { login: 'human1', contributions: 80, type: 'User' },
    { login: 'human2', contributions: 70, type: 'User' },
    { login: 'dependabot[bot]', contributions: 300, type: 'Bot' },
    { login: 'renovate', contributions: 200, type: 'User' },  // 'User' type but known bot
    { login: 'github-actions', contributions: 150 },
    { login: 'random-bot', contributions: 100 },
    { login: 'snyk-bot', contributions: 50 },
  ];
  const commits = [{ commit: { author: { date: '2026-05-10T00:00:00Z' } } }];
  const out = computeMaintainerConcentration(contributors, commits, NOW);
  eq(out.nonBotContributorCount, 2, 'only 2 humans survive');
  near(out.topShare, 80 / 150, 0.001, 'top share of humans ~ 0.533');
  eq(out.isSingleMaintainer, false, 'not single-maintainer when 2 humans share ~50/50');
});

// ----- No commits at all -----
test('no commits at all → topShare 0, nulls everywhere, not single-maintainer', () => {
  const out = computeMaintainerConcentration([], [], NOW);
  eq(out.topShare, 0, 'topShare 0');
  eq(out.nonBotContributorCount, 0, 'no contributors');
  eq(out.lastCommitDate, null, 'lastCommitDate null');
  eq(out.daysSinceLastCommit, null, 'daysSinceLastCommit null');
  eq(out.isSingleMaintainer, false, 'no maintainer = not single-maintainer');
});

// ----- Days-since-last-commit calculation -----
test('daysSinceLastCommit: commit on 2026-04-14 with NOW=2026-05-14 → 30 days', () => {
  const contributors = [{ login: 'a', contributions: 1, type: 'User' }];
  const commits = [{ commit: { author: { date: '2026-04-14T00:00:00Z' } } }];
  const out = computeMaintainerConcentration(contributors, commits, NOW);
  eq(out.daysSinceLastCommit, 30, '30 days exact');
});

test('daysSinceLastCommit picks the NEWEST commit across the array', () => {
  // Common case: GitHub returns newest-first but defensively scan for max.
  const contributors = [{ login: 'a', contributions: 1, type: 'User' }];
  const commits = [
    { commit: { author: { date: '2024-01-01T00:00:00Z' } } },
    { commit: { author: { date: '2026-05-12T00:00:00Z' } } },  // newest
    { commit: { author: { date: '2025-01-01T00:00:00Z' } } },
  ];
  const out = computeMaintainerConcentration(contributors, commits, NOW);
  eq(out.daysSinceLastCommit, 2, 'NOW - 2026-05-12 = 2 days');
});

test('garbage commit dates are skipped gracefully', () => {
  const contributors = [{ login: 'a', contributions: 1, type: 'User' }];
  const commits = [
    { commit: { author: { date: 'not-a-date' } } },
    { commit: { author: { date: '2026-05-10T00:00:00Z' } } },
    {},
    null,
  ];
  const out = computeMaintainerConcentration(contributors, commits, NOW);
  eq(out.daysSinceLastCommit, 4, '4 days from valid entry');
});

// ----- Threshold sensitivity (locks the 85% / 2 contributor rule) -----
test('boundary: topShare exactly 0.85 → NOT single-maintainer (strict > 0.85)', () => {
  const contributors = [
    { login: 'a', contributions: 85, type: 'User' },
    { login: 'b', contributions: 15, type: 'User' },
  ];
  const commits = [{ commit: { author: { date: '2026-05-10T00:00:00Z' } } }];
  const out = computeMaintainerConcentration(contributors, commits, NOW);
  near(out.topShare, 0.85, 0.001, 'exact 0.85');
  eq(out.isSingleMaintainer, false, 'strict > 0.85 threshold');
});

test('boundary: topShare 0.86 with 2 contributors → single-maintainer', () => {
  const contributors = [
    { login: 'a', contributions: 86, type: 'User' },
    { login: 'b', contributions: 14, type: 'User' },
  ];
  const commits = [{ commit: { author: { date: '2026-05-10T00:00:00Z' } } }];
  const out = computeMaintainerConcentration(contributors, commits, NOW);
  eq(out.isSingleMaintainer, true, '0.86 > 0.85 trips it');
});

test('boundary: 3 non-bot contributors disables single-maintainer regardless of share', () => {
  const contributors = [
    { login: 'a', contributions: 980, type: 'User' },
    { login: 'b', contributions: 10, type: 'User' },
    { login: 'c', contributions: 10, type: 'User' },
  ];
  const commits = [{ commit: { author: { date: '2026-05-10T00:00:00Z' } } }];
  const out = computeMaintainerConcentration(contributors, commits, NOW);
  eq(out.nonBotContributorCount, 3, '3 non-bots');
  eq(out.isSingleMaintainer, false, '3 contributors > 2 cap');
});

// ----- Defensive: null/undefined inputs -----
test('null contributors + null commits → empty result, no throws', () => {
  const out = computeMaintainerConcentration(null, null, NOW);
  eq(out.nonBotContributorCount, 0, 'safe');
  eq(out.lastCommitDate, null, 'safe');
});

console.log('');
console.log(`Maintainer-concentration tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
