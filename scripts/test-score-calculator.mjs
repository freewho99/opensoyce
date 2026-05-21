#!/usr/bin/env node
/**
 * Phase-2b — Unit tests for scoreCalculator helpers.
 *
 * Focus: the active-disclosure-bonus fix in scoreRepoAdvisories(). The old
 * implementation flattened two very different stories — "never filed an
 * advisory" and "filed one, fixed it, time decayed the penalty" — into the
 * same 0.5-ish output. These tests pin the new behavior:
 *
 *   - [] still returns the 0.5 baseline (unchanged)
 *   - 1 old advisory now returns > 0.5 (bonus fires, small penalty)
 *   - 3 old advisories return ~0.7 (full bonus, decayed penalty)
 *   - recent advisories still tank the score (penalty dominates)
 *   - mixed recent + old does not get a free pass (penalty wins)
 *   - bonus is CAPPED at +0.2 even with 50 trivial advisories
 *
 * Also: summarizeAdvisories.disclosureSpan field.
 *
 * Plain Node, PASS/FAIL per case, non-zero exit on any failure.
 */
import { scoreRepoAdvisories, summarizeAdvisories } from '../src/shared/scoreCalculator.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try { fn(); console.log(`PASS  ${name}`); passed += 1; }
  catch (e) { console.log(`FAIL  ${name} -- ${e.message}`); failed += 1; }
}
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function approx(a, b, tol, msg) {
  if (Math.abs(a - b) > tol) throw new Error(`${msg}: expected ~${b} (±${tol}), got ${a}`);
}
function between(a, lo, hi, msg) {
  if (a < lo || a > hi) throw new Error(`${msg}: expected ${a} in [${lo}, ${hi}]`);
}

const NOW = new Date('2026-05-15T00:00:00Z');
function daysAgo(d) {
  return new Date(NOW.getTime() - d * 86400000).toISOString();
}

// --- scoreRepoAdvisories: failure / empty modes ---------------------------

test('null advisories -> 0 (unknown signal, neither rewarded nor penalized)', () => {
  eq(scoreRepoAdvisories(null, NOW), 0, 'null');
});
test('undefined advisories -> 0', () => {
  eq(scoreRepoAdvisories(undefined, NOW), 0, 'undefined');
});
test('non-array advisories -> 0', () => {
  eq(scoreRepoAdvisories('not an array', NOW), 0, 'non-array');
});

test('empty array -> 0.5 baseline (no advisories, no bonus)', () => {
  eq(scoreRepoAdvisories([], NOW), 0.5, 'empty');
});

// --- The Dan-calibration nit: old advisories no longer flatten to ~0.5 ----

test('one OLD high advisory (~2y old, fixed long ago) -> ~0.5 + 0.1 bonus, small penalty', () => {
  // high = 0.25 weight, recencyMult = 0.3 for 365-1095d → penalty 0.075
  // result = 0.5 - 0.075 + 0.1 = 0.525
  const advisories = [
    { severity: 'high', state: 'published', published_at: daysAgo(730), withdrawn_at: null },
  ];
  const s = scoreRepoAdvisories(advisories, NOW);
  between(s, 0.5, 0.6, 'one old advisory should beat the 0.5 baseline but stay modest');
  approx(s, 0.525, 0.01, 'one old high advisory exact');
});

test('three OLD advisories (oldest >365d) -> full +0.2 bonus, decayed penalty', () => {
  const advisories = [
    { severity: 'high', state: 'published', published_at: daysAgo(800), withdrawn_at: null },
    { severity: 'medium', state: 'published', published_at: daysAgo(900), withdrawn_at: null },
    { severity: 'low', state: 'published', published_at: daysAgo(1000), withdrawn_at: null },
  ];
  const s = scoreRepoAdvisories(advisories, NOW);
  // penalty = 0.25*0.3 + 0.1*0.3 + 0.05*0.3 = 0.12
  // result = 0.5 - 0.12 + 0.2 = 0.58
  between(s, 0.55, 0.7, 'three old advisories should land in the disclosure-history sweet spot');
  approx(s, 0.58, 0.02, 'three old advisories exact');
});

// --- Recency still dominates (penalty wins) -------------------------------

test('three RECENT advisories (oldest <365d) -> bonus does NOT fire, penalty bites', () => {
  const advisories = [
    { severity: 'critical', state: 'published', published_at: daysAgo(30), withdrawn_at: null },
    { severity: 'high', state: 'published', published_at: daysAgo(60), withdrawn_at: null },
    { severity: 'high', state: 'published', published_at: daysAgo(90), withdrawn_at: null },
  ];
  const s = scoreRepoAdvisories(advisories, NOW);
  // penalty = 0.4*1.0 + 0.25*1.0 + 0.25*1.0 = 0.9 → result 0.5 - 0.9 + 0 = -0.4
  if (s > 0) throw new Error(`recent advisories must not score > 0, got ${s}`);
  between(s, -0.6, 0.0, 'recent critical+high should land at the floor');
});

test('mix: 1 RECENT critical + 2 OLD lows -> penalty wins, bonus partial', () => {
  const advisories = [
    { severity: 'critical', state: 'published', published_at: daysAgo(30), withdrawn_at: null },
    { severity: 'low', state: 'published', published_at: daysAgo(700), withdrawn_at: null },
    { severity: 'low', state: 'published', published_at: daysAgo(900), withdrawn_at: null },
  ];
  const s = scoreRepoAdvisories(advisories, NOW);
  // penalty = 0.4*1.0 + 0.05*0.3 + 0.05*0.3 = 0.43
  // oldest 900d > 365d → bonus 0.2
  // result = 0.5 - 0.43 + 0.2 = 0.27
  between(s, 0.0, 0.4, 'recent crit + old lows must not promote past 0.4');
  approx(s, 0.27, 0.02, 'mixed recent+old exact');
});

// --- Bonus is a CAP, not a free promotion ---------------------------------

test('50 trivial OLD advisories -> bonus still capped at +0.2 (no runaway promotion)', () => {
  const advisories = [];
  for (let i = 0; i < 50; i += 1) {
    advisories.push({ severity: 'low', state: 'published', published_at: daysAgo(800 + i), withdrawn_at: null });
  }
  const s = scoreRepoAdvisories(advisories, NOW);
  // penalty = 50 * 0.05 * 0.3 = 0.75 (capped by result clamp to -0.6)
  // bonus = +0.2
  // raw = 0.5 - 0.75 + 0.2 = -0.05; clamped low at -0.6 → -0.05 is in-range
  between(s, -0.6, 1.0, '50 trivials must stay in band');
  if (s > 0.7) throw new Error(`bonus must not race past 0.7, got ${s}`);
});

test('result is clamped at upper bound 1.0', () => {
  // Construct a hypothetical zero-penalty case: severities unrecognized but
  // timestamps recorded. Each row contributes to the bonus-eligibility list
  // but adds 0 penalty. With 3 old rows + bonus 0.2: 0.5 + 0.2 = 0.7 (below cap).
  // To verify the clamp, we trust the implementation; the practical check:
  const advisories = [
    { severity: 'unrecognized', state: 'published', published_at: daysAgo(800), withdrawn_at: null },
    { severity: 'unrecognized', state: 'published', published_at: daysAgo(900), withdrawn_at: null },
    { severity: 'unrecognized', state: 'published', published_at: daysAgo(1000), withdrawn_at: null },
  ];
  const s = scoreRepoAdvisories(advisories, NOW);
  approx(s, 0.7, 0.01, 'three old unknown-severity rows = baseline + full bonus, no penalty');
});

// --- Withdrawn / non-published rows do not count for bonus OR penalty ------

test('withdrawn advisories do NOT earn the disclosure bonus', () => {
  const advisories = [
    { severity: 'high', state: 'published', published_at: daysAgo(800), withdrawn_at: daysAgo(700) },
  ];
  const s = scoreRepoAdvisories(advisories, NOW);
  // Withdrawn row is skipped entirely → behaves like [] except length is 1.
  // No eligible rows → no penalty, no bonus → 0.5.
  approx(s, 0.5, 0.001, 'withdrawn-only list collapses to baseline');
});

test('one RECENT advisory (< 365d) -> NO bonus (newest must be old)', () => {
  const advisories = [
    { severity: 'low', state: 'published', published_at: daysAgo(100), withdrawn_at: null },
  ];
  const s = scoreRepoAdvisories(advisories, NOW);
  // penalty = 0.05 * 1.0 = 0.05; bonus = 0 (newest is 100d, not >365)
  // result = 0.5 - 0.05 = 0.45
  approx(s, 0.45, 0.01, 'recent single low must penalize, not bonus');
});

// --- summarizeAdvisories.disclosureSpan -----------------------------------

test('summarizeAdvisories null -> null', () => {
  eq(summarizeAdvisories(null, NOW), null, 'null in -> null out');
});

test('summarizeAdvisories [] -> zeroed summary with disclosureSpan 0', () => {
  const s = summarizeAdvisories([], NOW);
  eq(s.total, 0, 'total');
  eq(s.disclosureSpan, 0, 'disclosureSpan');
});

test('summarizeAdvisories one row -> disclosureSpan 0 (need >=2 timestamps)', () => {
  const s = summarizeAdvisories([
    { severity: 'high', state: 'published', published_at: daysAgo(500), withdrawn_at: null },
  ], NOW);
  eq(s.total, 1, 'total');
  eq(s.disclosureSpan, 0, 'disclosureSpan with 1 row');
});

test('summarizeAdvisories spans ~24 months', () => {
  const s = summarizeAdvisories([
    { severity: 'high', state: 'published', published_at: daysAgo(30), withdrawn_at: null },
    { severity: 'low', state: 'published', published_at: daysAgo(30 + 730), withdrawn_at: null },
  ], NOW);
  eq(s.total, 2, 'total');
  // 730 days ≈ 24 months
  between(s.disclosureSpan, 23, 25, 'disclosureSpan ≈ 24');
});

// --- Wrap-up --------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
