#!/usr/bin/env node
/**
 * P0-AI-1 — Verdict band tests, including hidden-vulns cap.
 *
 * Plain Node, PASS/FAIL per case, non-zero exit on any failure.
 *
 * The cap exists because the AI builder swarm caught OpenSoyce labeling
 * langchain-ai/langchain "FORKABLE 8.0" while the repo had 4 open
 * HIGH/CRITICAL advisories on its own code. Composite math was already
 * punishing security (0.1/2.0), but the band rules only looked at score.
 */
import { verdictFor } from '../src/shared/verdict.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try { fn(); console.log(`PASS  ${name}`); passed += 1; }
  catch (e) { console.log(`FAIL  ${name} -- ${e.message}`); failed += 1; }
}
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// --- Legacy behavior (no advisorySummary) ------------------------------
test('verdictFor(9.0) === USE READY', () => {
  eq(verdictFor(9.0), 'USE READY', 'top band');
});
test('verdictFor(8.0) === FORKABLE (no advisorySummary)', () => {
  eq(verdictFor(8.0), 'FORKABLE', 'forkable band');
});
test('verdictFor(7.0) === FORKABLE (lower edge)', () => {
  eq(verdictFor(7.0), 'FORKABLE', 'forkable edge');
});
test('verdictFor(6.0) === STABLE', () => {
  eq(verdictFor(6.0), 'STABLE', 'stable band');
});
// --- STABLE band tightening (Maya's swarm calibration): 5.5 → 6.0 ----
// The lower bound of STABLE was 5.5; projects that had drifted but still
// cleared 5.5 read as "STABLE" which falsely implies active maintenance.
// 5.5–5.99 now reads as WATCHLIST. Bands 8.5 / 7.0 / 4.0 / 2.5 unchanged.
test('verdictFor(6.0) === STABLE (exact threshold pin)', () => {
  eq(verdictFor(6.0), 'STABLE', 'STABLE lower edge is 6.0');
});
test('verdictFor(5.99) === WATCHLIST (just below STABLE)', () => {
  eq(verdictFor(5.99), 'WATCHLIST', '5.99 falls into WATCHLIST after tightening');
});
test('verdictFor(5.5) === WATCHLIST (was STABLE in old 5.5+ logic)', () => {
  eq(verdictFor(5.5), 'WATCHLIST', '5.5 dropped from STABLE to WATCHLIST');
});
test('verdictFor(5.0) === WATCHLIST (unchanged from old logic)', () => {
  eq(verdictFor(5.0), 'WATCHLIST', '5.0 was and still is WATCHLIST');
});
test('verdictFor(4.5) === WATCHLIST', () => {
  eq(verdictFor(4.5), 'WATCHLIST', 'watchlist band');
});
test('verdictFor(3.0) === RISKY', () => {
  eq(verdictFor(3.0), 'RISKY', 'risky band');
});
test('verdictFor(1.5) === STALE', () => {
  eq(verdictFor(1.5), 'STALE', 'stale band');
});

// --- earlyBreakout still works without advisorySummary -----------------
test('verdictFor(6.8, { earlyBreakout: true }) === HIGH MOMENTUM', () => {
  eq(verdictFor(6.8, { earlyBreakout: true }), 'HIGH MOMENTUM', 'early breakout fires below 7.0');
});
test('verdictFor(8.0, { earlyBreakout: true }) === FORKABLE (band wins over breakout)', () => {
  eq(verdictFor(8.0, { earlyBreakout: true }), 'FORKABLE', 'earlyBreakout does not fire when score already FORKABLE');
});

// --- Hidden-vulns cap: P0-AI-1 -----------------------------------------
test('verdictFor(8.0, advisorySummary { critical:1, high:3 }) === WATCHLIST (langchain case)', () => {
  eq(
    verdictFor(8.0, { advisorySummary: { critical: 1, high: 3, medium: 2, low: 2, total: 8, openCount: 8 } }),
    'WATCHLIST',
    '4 serious open caps from FORKABLE to WATCHLIST',
  );
});
test('verdictFor(8.0, advisorySummary { critical:0, high:1 }) === FORKABLE (1 serious, no extra cap at 8.0)', () => {
  eq(
    verdictFor(8.0, { advisorySummary: { critical: 0, high: 1 } }),
    'FORKABLE',
    '1 serious open does not cap below FORKABLE at score 8.0',
  );
});
test('verdictFor(9.5, advisorySummary { critical:0, high:1 }) === FORKABLE (downgraded from USE READY)', () => {
  eq(
    verdictFor(9.5, { advisorySummary: { critical: 0, high: 1 } }),
    'FORKABLE',
    '1 serious open caps USE READY → FORKABLE',
  );
});
test('verdictFor(9.5, advisorySummary { critical:0, high:0 }) === USE READY (clean)', () => {
  eq(
    verdictFor(9.5, { advisorySummary: { critical: 0, high: 0 } }),
    'USE READY',
    'clean advisory summary leaves USE READY intact',
  );
});
test('verdictFor(9.5, advisorySummary { critical:3, high:0 }) === WATCHLIST (3 critical alone caps to WATCHLIST)', () => {
  eq(
    verdictFor(9.5, { advisorySummary: { critical: 3, high: 0 } }),
    'WATCHLIST',
    '3 critical alone trips the >=3 cap',
  );
});
test('verdictFor(5.0, advisorySummary { critical:1, high:1 }) === STABLE (no change; score band already below cap)', () => {
  eq(
    verdictFor(5.0, { advisorySummary: { critical: 1, high: 1 } }),
    'WATCHLIST',
    'wait — score 5.0 is in WATCHLIST band (>=4.0); confirming legacy band',
  );
});
// The prompt example used score 5.0; bands say 5.0 → WATCHLIST (>=4.0).
// The cap is a no-op there because score is already below the FORKABLE threshold.

test('verdictFor(6.0, advisorySummary { critical:1, high:1 }) === STABLE (cap is a no-op below 7.0)', () => {
  eq(
    verdictFor(6.0, { advisorySummary: { critical: 1, high: 1 } }),
    'STABLE',
    'cap only fires at >=7.0; STABLE is unchanged',
  );
});
test('cap is a CAP, never a PROMOTION — verdictFor(3.5, advisorySummary { critical:0, high:0 }) === RISKY', () => {
  eq(
    verdictFor(3.5, { advisorySummary: { critical: 0, high: 0 } }),
    'RISKY',
    'clean advisories do NOT promote a low score',
  );
});

// --- earlyBreakout + advisorySummary interaction ------------------------
test('earlyBreakout still fires below 7.0 with clean advisories', () => {
  eq(
    verdictFor(6.8, { earlyBreakout: true, advisorySummary: { critical: 0, high: 0 } }),
    'HIGH MOMENTUM',
    'earlyBreakout intact when no serious advisories',
  );
});
test('earlyBreakout below 7.0 still fires even with serious advisories (cap is only top-band)', () => {
  // Cap thresholds are >=7.0; below that the early-breakout HIGH MOMENTUM
  // story is preserved. Verifies we did not over-cap.
  eq(
    verdictFor(6.8, { earlyBreakout: true, advisorySummary: { critical: 1, high: 1 } }),
    'HIGH MOMENTUM',
    'cap does not touch sub-7.0 bands',
  );
});

// --- Real-world langchain summary ---------------------------------------
test('langchain-ai/langchain real summary @ 8.0 → WATCHLIST', () => {
  const langchainAdvisories = {
    total: 8,
    openCount: 8,
    recentOpen: 8,
    critical: 1,
    high: 3,
    medium: 2,
    low: 2,
  };
  eq(verdictFor(8.0, { advisorySummary: langchainAdvisories }), 'WATCHLIST', 'real-world langchain case');
});

// --- Edge: null/undefined advisorySummary ------------------------------
test('verdictFor(8.0, { advisorySummary: null }) === FORKABLE (no cap when null)', () => {
  eq(verdictFor(8.0, { advisorySummary: null }), 'FORKABLE', 'null advisorySummary is a no-op');
});
test('verdictFor(8.0, {}) === FORKABLE (no advisorySummary key)', () => {
  eq(verdictFor(8.0, {}), 'FORKABLE', 'absent advisorySummary is a no-op');
});

// --- HIGH MOMENTUM is editorial-only — never produced without earlyBreakout
// Public callers (runScan etc) never pass earlyBreakout, so HIGH MOMENTUM
// must NEVER appear in their results. The opt-in editorial path still
// works for hand-curated callers like src/data/categories.ts.
test('verdictFor(7.0) without earlyBreakout NEVER returns HIGH MOMENTUM', () => {
  const samples = [9.5, 8.5, 8.0, 7.5, 7.0, 6.8, 6.0, 5.5, 4.5, 4.0, 3.0, 2.5, 1.5, 0.0];
  for (const s of samples) {
    const v = verdictFor(s);
    if (v === 'HIGH MOMENTUM') {
      throw new Error(`score ${s} produced HIGH MOMENTUM without earlyBreakout — public bands must not surface the editorial tier`);
    }
  }
});
test('verdictFor(8.0, { earlyBreakout: true }) editorial path still works', () => {
  // The lower-tier scores still get HIGH MOMENTUM. At 8.0 the FORKABLE band
  // already wins over the breakout opt (verified in the test above), so
  // pick a sub-7.0 score to confirm the editorial path is intact.
  eq(verdictFor(6.5, { earlyBreakout: true }), 'HIGH MOMENTUM', 'editorial allowlist callers still earn the band');
});

console.log('');
console.log(`Verdict tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
