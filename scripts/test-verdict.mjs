#!/usr/bin/env node
/**
 * P0-AI-1 — Verdict band tests, including hidden-vulns cap.
 *
 * Plain Node, PASS/FAIL per case, non-zero exit on any failure.
 *
 * The cap exists because the AI builder swarm caught OpenSoyce labeling
 * langchain-ai/langchain "FORKABLE 80" while the repo had 4 open
 * HIGH/CRITICAL advisories on its own code. Composite math was already
 * punishing security (0.1/2.0), but the band rules only looked at score.
 *
 * All scores in this file are on the 0–100 public scale:
 *   >= 85  USE READY
 *   >= 70  FORKABLE
 *   >= 60  STABLE
 *   >= 40  WATCHLIST
 *   >= 25  RISKY
 *   <  25  STALE
 */
import { verdictFor, detectExtensionExploitRisk, trustPostureFor } from '../src/shared/verdict.js';

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
test('verdictFor(90) === USE READY', () => {
  eq(verdictFor(90), 'USE READY', 'top band');
});
test('verdictFor(80) === FORKABLE (no advisorySummary)', () => {
  eq(verdictFor(80), 'FORKABLE', 'forkable band');
});
test('verdictFor(70) === FORKABLE (lower edge)', () => {
  eq(verdictFor(70), 'FORKABLE', 'forkable edge');
});
test('verdictFor(60) === STABLE', () => {
  eq(verdictFor(60), 'STABLE', 'stable band');
});
// --- STABLE band tightening (Maya's swarm calibration): 55 → 60 ----
// The lower bound of STABLE was 55; projects that had drifted but still
// cleared 55 read as "STABLE" which falsely implies active maintenance.
// 55–59.9 now reads as WATCHLIST. Bands 85 / 70 / 40 / 25 unchanged.
test('verdictFor(60) === STABLE (exact threshold pin)', () => {
  eq(verdictFor(60), 'STABLE', 'STABLE lower edge is 60');
});
test('verdictFor(59.9) === WATCHLIST (just below STABLE)', () => {
  eq(verdictFor(59.9), 'WATCHLIST', '59.9 falls into WATCHLIST after tightening');
});
test('verdictFor(55) === WATCHLIST (was STABLE in old 55+ logic)', () => {
  eq(verdictFor(55), 'WATCHLIST', '55 dropped from STABLE to WATCHLIST');
});
test('verdictFor(50) === WATCHLIST (unchanged from old logic)', () => {
  eq(verdictFor(50), 'WATCHLIST', '50 was and still is WATCHLIST');
});
test('verdictFor(45) === WATCHLIST', () => {
  eq(verdictFor(45), 'WATCHLIST', 'watchlist band');
});
test('verdictFor(30) === RISKY', () => {
  eq(verdictFor(30), 'RISKY', 'risky band');
});
test('verdictFor(15) === STALE', () => {
  eq(verdictFor(15), 'STALE', 'stale band');
});

// --- earlyBreakout still works without advisorySummary -----------------
test('verdictFor(68, { earlyBreakout: true }) === HIGH MOMENTUM', () => {
  eq(verdictFor(68, { earlyBreakout: true }), 'HIGH MOMENTUM', 'early breakout fires below 70');
});
test('verdictFor(80, { earlyBreakout: true }) === FORKABLE (band wins over breakout)', () => {
  eq(verdictFor(80, { earlyBreakout: true }), 'FORKABLE', 'earlyBreakout does not fire when score already FORKABLE');
});

// --- Hidden-vulns cap: P0-AI-1 -----------------------------------------
test('verdictFor(80, advisorySummary { critical:1, high:3 }) === WATCHLIST (langchain case)', () => {
  eq(
    verdictFor(80, { advisorySummary: { critical: 1, high: 3, medium: 2, low: 2, total: 8, openCount: 8 } }),
    'WATCHLIST',
    '4 serious open caps from FORKABLE to WATCHLIST',
  );
});
test('verdictFor(80, advisorySummary { critical:0, high:1 }) === FORKABLE (1 serious, no extra cap at 80)', () => {
  eq(
    verdictFor(80, { advisorySummary: { critical: 0, high: 1 } }),
    'FORKABLE',
    '1 serious open does not cap below FORKABLE at score 80',
  );
});
test('verdictFor(95, advisorySummary { critical:0, high:1 }) === FORKABLE (downgraded from USE READY)', () => {
  eq(
    verdictFor(95, { advisorySummary: { critical: 0, high: 1 } }),
    'FORKABLE',
    '1 serious open caps USE READY → FORKABLE',
  );
});
test('verdictFor(95, advisorySummary { critical:0, high:0 }) === USE READY (clean)', () => {
  eq(
    verdictFor(95, { advisorySummary: { critical: 0, high: 0 } }),
    'USE READY',
    'clean advisory summary leaves USE READY intact',
  );
});
test('verdictFor(95, advisorySummary { critical:3, high:0 }) === WATCHLIST (3 critical alone caps to WATCHLIST)', () => {
  eq(
    verdictFor(95, { advisorySummary: { critical: 3, high: 0 } }),
    'WATCHLIST',
    '3 critical alone trips the >=3 cap',
  );
});
test('verdictFor(50, advisorySummary { critical:1, high:1 }) === WATCHLIST (score band already below cap)', () => {
  eq(
    verdictFor(50, { advisorySummary: { critical: 1, high: 1 } }),
    'WATCHLIST',
    'wait — score 50 is in WATCHLIST band (>=40); confirming legacy band',
  );
});
// The prompt example used score 50; bands say 50 → WATCHLIST (>=40).
// The cap is a no-op there because score is already below the FORKABLE threshold.

test('verdictFor(60, advisorySummary { critical:1, high:1 }) === STABLE (cap is a no-op below 70)', () => {
  eq(
    verdictFor(60, { advisorySummary: { critical: 1, high: 1 } }),
    'STABLE',
    'cap only fires at >=70; STABLE is unchanged',
  );
});
test('cap is a CAP, never a PROMOTION — verdictFor(35, advisorySummary { critical:0, high:0 }) === RISKY', () => {
  eq(
    verdictFor(35, { advisorySummary: { critical: 0, high: 0 } }),
    'RISKY',
    'clean advisories do NOT promote a low score',
  );
});

// --- earlyBreakout + advisorySummary interaction ------------------------
test('earlyBreakout still fires below 70 with clean advisories', () => {
  eq(
    verdictFor(68, { earlyBreakout: true, advisorySummary: { critical: 0, high: 0 } }),
    'HIGH MOMENTUM',
    'earlyBreakout intact when no serious advisories',
  );
});
test('earlyBreakout below 70 still fires even with serious advisories (cap is only top-band)', () => {
  // Cap thresholds are >=70; below that the early-breakout HIGH MOMENTUM
  // story is preserved. Verifies we did not over-cap.
  eq(
    verdictFor(68, { earlyBreakout: true, advisorySummary: { critical: 1, high: 1 } }),
    'HIGH MOMENTUM',
    'cap does not touch sub-70 bands',
  );
});

// --- Real-world langchain summary ---------------------------------------
test('langchain-ai/langchain real summary @ 80 → WATCHLIST', () => {
  const langchainAdvisories = {
    total: 8,
    openCount: 8,
    recentOpen: 8,
    critical: 1,
    high: 3,
    medium: 2,
    low: 2,
  };
  eq(verdictFor(80, { advisorySummary: langchainAdvisories }), 'WATCHLIST', 'real-world langchain case');
});

// --- Edge: null/undefined advisorySummary ------------------------------
test('verdictFor(80, { advisorySummary: null }) === FORKABLE (no cap when null)', () => {
  eq(verdictFor(80, { advisorySummary: null }), 'FORKABLE', 'null advisorySummary is a no-op');
});
test('verdictFor(80, {}) === FORKABLE (no advisorySummary key)', () => {
  eq(verdictFor(80, {}), 'FORKABLE', 'absent advisorySummary is a no-op');
});

// --- HIGH MOMENTUM is editorial-only — never produced without earlyBreakout
// Public callers (runScan etc) never pass earlyBreakout, so HIGH MOMENTUM
// must NEVER appear in their results. The opt-in editorial path still
// works for hand-curated callers like src/data/categories.ts.
test('verdictFor without earlyBreakout NEVER returns HIGH MOMENTUM', () => {
  const samples = [95, 85, 80, 75, 70, 68, 60, 55, 45, 40, 30, 25, 15, 0];
  for (const s of samples) {
    const v = verdictFor(s);
    if (v === 'HIGH MOMENTUM') {
      throw new Error(`score ${s} produced HIGH MOMENTUM without earlyBreakout — public bands must not surface the editorial tier`);
    }
  }
});
test('verdictFor(80, { earlyBreakout: true }) editorial path still works', () => {
  // The lower-tier scores still get HIGH MOMENTUM. At 80 the FORKABLE band
  // already wins over the breakout opt (verified in the test above), so
  // pick a sub-70 score to confirm the editorial path is intact.
  eq(verdictFor(65, { earlyBreakout: true }), 'HIGH MOMENTUM', 'editorial allowlist callers still earn the band');
});

// --- Maintainer-concentration cap (AI signals v0.1) -------------------
// USE READY (>=85) + single-maintainer + >30 days since commit → FORKABLE.
// Vendor-SDK match suppresses entirely. Cap is never a promotion: a sub-85
// score with the same signals stays in whatever band the score earned.
test('verdictFor(95, single-maintainer, 45d drift) → FORKABLE (cap fires)', () => {
  eq(
    verdictFor(95, { maintainerConcentration: { isSingleMaintainer: true, daysSinceLastCommit: 45 } }),
    'FORKABLE',
    'USE READY -> FORKABLE cap',
  );
});
test('verdictFor(95, single-maintainer, 45d drift, vendorSdkMatch) → USE READY (vendor suppresses)', () => {
  eq(
    verdictFor(95, {
      maintainerConcentration: { isSingleMaintainer: true, daysSinceLastCommit: 45 },
      vendorSdkMatch: true,
    }),
    'USE READY',
    'vendor SDK allowlist suppresses cap',
  );
});
test('verdictFor(95, single-maintainer, 10d drift) → USE READY (recent commit, no cap)', () => {
  eq(
    verdictFor(95, { maintainerConcentration: { isSingleMaintainer: true, daysSinceLastCommit: 10 } }),
    'USE READY',
    '<=30 days never trips the cap',
  );
});
test('verdictFor(95, NOT single-maintainer, 200d drift) → USE READY', () => {
  eq(
    verdictFor(95, { maintainerConcentration: { isSingleMaintainer: false, daysSinceLastCommit: 200 } }),
    'USE READY',
    'isSingleMaintainer:false short-circuits',
  );
});
test('verdictFor(75, single-maintainer, 200d) → FORKABLE (already FORKABLE, cap is no-op)', () => {
  // The cap only fires when uncapped band is USE READY (score >= 85). A repo
  // sitting at 75 is already FORKABLE; the cap pins this — cap never drops
  // FORKABLE to a lower band.
  eq(
    verdictFor(75, { maintainerConcentration: { isSingleMaintainer: true, daysSinceLastCommit: 200 } }),
    'FORKABLE',
    'cap never goes below FORKABLE',
  );
});
test('verdictFor(55, single-maintainer, 200d) → WATCHLIST (cap is no-op below 85)', () => {
  // 55 is in the WATCHLIST band (>=40 <60 after Maya's tightening).
  // Cap path requires score >= 85; this confirms low scores are untouched.
  eq(
    verdictFor(55, { maintainerConcentration: { isSingleMaintainer: true, daysSinceLastCommit: 200 } }),
    'WATCHLIST',
    'maintainer cap requires score >= 85',
  );
});
test('cap stacking — advisorySummary cap + maintainer cap both fire → take the lower band', () => {
  // 95 + 4 open serious advisories alone would cap to WATCHLIST. Adding
  // maintainer-concentration on top must not promote it back up.
  eq(
    verdictFor(95, {
      advisorySummary: { critical: 1, high: 3 },
      maintainerConcentration: { isSingleMaintainer: true, daysSinceLastCommit: 200 },
    }),
    'WATCHLIST',
    'advisory cap (WATCHLIST) is lower; combined result keeps it',
  );
});
test('cap stacking — single open serious advisory + maintainer drift → FORKABLE (both caps converge)', () => {
  // Either cap alone would land at FORKABLE; combined behavior is the same.
  eq(
    verdictFor(95, {
      advisorySummary: { critical: 0, high: 1 },
      maintainerConcentration: { isSingleMaintainer: true, daysSinceLastCommit: 200 },
    }),
    'FORKABLE',
    'both caps land at FORKABLE',
  );
});
test('maintainer cap is a CAP, never a PROMOTION — verdictFor(30, single-maintainer, drift) === RISKY', () => {
  // Defense-in-depth check: structurally bad repo at score 30 must stay RISKY
  // (>=25 <40) regardless of any maintainerConcentration signal.
  eq(
    verdictFor(30, { maintainerConcentration: { isSingleMaintainer: true, daysSinceLastCommit: 500 } }),
    'RISKY',
    'maintainer cap does not promote low scores',
  );
});
test('verdictFor(95, single-maintainer, daysSinceLastCommit:null) → USE READY (null = unknown, no cap)', () => {
  // Defensive: null daysSinceLastCommit means we couldn't tell; do not cap.
  eq(
    verdictFor(95, { maintainerConcentration: { isSingleMaintainer: true, daysSinceLastCommit: null } }),
    'USE READY',
    'unknown commit age does not trip the cap',
  );
});
test('verdictFor(95, maintainerConcentration:null) → USE READY (no cap)', () => {
  eq(
    verdictFor(95, { maintainerConcentration: null }),
    'USE READY',
    'null maintainerConcentration is a no-op',
  );
});

// --- Grading-swarm calibration (Wei + Marco): 1 open critical caps to WATCHLIST
// Wei + Marco both flagged facebook/react landing at 82 USE-READY-band-eligible
// with 1 open critical + 5 high advisories. Criticals are now treated separately
// from highs: a single open CRITICAL caps anything 70+ down to WATCHLIST. The
// >=3 serious rule and the 1-high USE-READY→FORKABLE rule are unchanged.
test('verdictFor(90, { critical:1, high:0 }) === WATCHLIST (1 crit caps USE READY → WATCHLIST)', () => {
  eq(
    verdictFor(90, { advisorySummary: { critical: 1, high: 0 } }),
    'WATCHLIST',
    '1 open critical caps to WATCHLIST not FORKABLE',
  );
});
test('verdictFor(82, { critical:1, high:5 }) === WATCHLIST (facebook/react case)', () => {
  eq(
    verdictFor(82, { advisorySummary: { critical: 1, high: 5 } }),
    'WATCHLIST',
    'the actual React case Wei + Marco caught',
  );
});
test('verdictFor(75, { critical:1, high:0 }) === WATCHLIST (above 70 boundary)', () => {
  eq(
    verdictFor(75, { advisorySummary: { critical: 1, high: 0 } }),
    'WATCHLIST',
    '1 crit caps FORKABLE → WATCHLIST when score >= 70',
  );
});
test('verdictFor(69, { critical:1, high:0 }) === STABLE (cap does NOT apply below 70)', () => {
  eq(
    verdictFor(69, { advisorySummary: { critical: 1, high: 0 } }),
    'STABLE',
    'cap never fires below score 70; STABLE intact',
  );
});
test('verdictFor(85, { critical:0, high:1 }) === FORKABLE (1 high caps USE READY → FORKABLE, unchanged)', () => {
  eq(
    verdictFor(85, { advisorySummary: { critical: 0, high: 1 } }),
    'FORKABLE',
    '1 high alone still caps USE READY → FORKABLE',
  );
});
test('verdictFor(85, { critical:0, high:0 }) === USE READY (no advisories → unchanged)', () => {
  eq(
    verdictFor(85, { advisorySummary: { critical: 0, high: 0 } }),
    'USE READY',
    'clean advisories at USE READY threshold leave band intact',
  );
});
test('verdictFor(70, { critical:1, high:0 }, vendorSdkMatch:true) === WATCHLIST (vendor does NOT suppress advisory cap)', () => {
  // The advisory cap is independent of vendor / maintainer signals. A
  // vulnerable OpenAI SDK is still vulnerable — vendorSdkMatch only
  // suppresses the maintainer-concentration cap, not the advisory cap.
  eq(
    verdictFor(70, { advisorySummary: { critical: 1, high: 0 }, vendorSdkMatch: true }),
    'WATCHLIST',
    'vendor allowlist does not gate the advisory-summary cap',
  );
});

// --- Extension Exploit / Hijack Risk & Posture tests -----------------------
test('High score + VS Code extension target + single maintainer + 100 days drift => Adoption: WATCHLIST, Posture: HIJACK RISK', () => {
  const repoData = { name: 'my-vscode-extension', description: 'Cool editor plugin', topics: ['vscode'] };
  const mc = { isSingleMaintainer: true, daysSinceLastCommit: 100 };
  const er = detectExtensionExploitRisk({
    repoData,
    workflows: null,
    hasDependabot: false,
    hasSast: false,
    maintainerConcentration: mc
  });
  eq(er.active, true, 'exploit risk active');
  eq(er.status, 'HIJACK RISK', 'status is HIJACK RISK');
  
  const adoption = verdictFor(95, { extensionExploitRisk: er, maintainerConcentration: mc });
  eq(adoption, 'WATCHLIST', 'Adoption verdict capped at WATCHLIST');
  
  const posture = trustPostureFor(95, { extensionExploitRisk: er, maintainerConcentration: mc, hasDependabot: false, hasSast: false });
  eq(posture, 'HIJACK RISK', 'Trust posture is HIJACK RISK');
});

test('High score + extension target + strong security posture => Adoption: FORKABLE (due to single maintainer cap), Trust: LIMITED TRUST, no hijack risk', () => {
  const repoData = { name: 'my-vscode-extension', description: 'Cool editor plugin', topics: ['vscode'] };
  const mc = { isSingleMaintainer: true, daysSinceLastCommit: 100 };
  const er = detectExtensionExploitRisk({
    repoData,
    workflows: null,
    hasDependabot: true,
    hasSast: true,
    maintainerConcentration: mc
  });
  eq(er.active, false, 'no exploit risk active');
  eq(er.status, 'NONE', 'status is NONE');
  
  const adoption = verdictFor(95, { extensionExploitRisk: er, maintainerConcentration: mc });
  eq(adoption, 'FORKABLE', 'Adoption verdict capped at FORKABLE due to single maintainer');
  
  const posture = trustPostureFor(95, { extensionExploitRisk: er, maintainerConcentration: mc, hasDependabot: true, hasSast: true });
  eq(posture, 'LIMITED TRUST', 'Trust posture is LIMITED TRUST due to single maintainer');
});

test('High score + extension target + strong security posture + multiple maintainers => Adoption: USE READY, Trust: TRUSTED, no hijack risk', () => {
  const repoData = { name: 'my-vscode-extension', description: 'Cool editor plugin', topics: ['vscode'] };
  const mc = { isSingleMaintainer: false, daysSinceLastCommit: 5 };
  const er = detectExtensionExploitRisk({
    repoData,
    workflows: null,
    hasDependabot: true,
    hasSast: true,
    maintainerConcentration: mc
  });
  eq(er.active, false, 'no exploit risk active');
  eq(er.status, 'NONE', 'status is NONE');
  
  const adoption = verdictFor(95, { extensionExploitRisk: er, maintainerConcentration: mc });
  eq(adoption, 'USE READY', 'Adoption verdict stays USE READY');
  
  const posture = trustPostureFor(95, { extensionExploitRisk: er, maintainerConcentration: mc, hasDependabot: true, hasSast: true });
  eq(posture, 'TRUSTED', 'Trust posture is TRUSTED');
});


test('Weak security posture + not a dev-tool target => no hijack risk', () => {
  const repoData = { name: 'simple-utils', description: 'Just some library', topics: [] };
  const mc = { isSingleMaintainer: true, daysSinceLastCommit: 100 };
  const er = detectExtensionExploitRisk({
    repoData,
    workflows: null,
    hasDependabot: false,
    hasSast: false,
    maintainerConcentration: mc
  });
  eq(er.active, false, 'no exploit risk active');
  eq(er.status, 'NONE', 'status is NONE');
});

test('Unknown Dependabot + unknown SAST => no hijack risk, confidence low, reasons include unknown evidence', () => {
  const repoData = { name: 'my-vscode-extension', description: 'Cool editor plugin', topics: ['vscode'] };
  const mc = { isSingleMaintainer: true, daysSinceLastCommit: 100 };
  const er = detectExtensionExploitRisk({
    repoData,
    workflows: null,
    hasDependabot: 'unknown',
    hasSast: 'unknown',
    maintainerConcentration: mc
  });
  eq(er.active, false, 'no exploit risk active');
  eq(er.status, 'NONE', 'status is NONE');
  eq(er.confidence, 'low', 'confidence is low');
  const hasUnknownCode = er.reasons.some(r => r.code === 'UNKNOWN_EVIDENCE_POSTURE');
  eq(hasUnknownCode, true, 'has UNKNOWN_EVIDENCE_POSTURE reason code');
});

test('Maintainer bottleneck does not downgrade below already-lower adoption verdict => score 50 stays WATCHLIST, not FORKABLE', () => {
  const repoData = { name: 'my-vscode-extension', description: 'Cool editor plugin', topics: ['vscode'] };
  const mc = { isSingleMaintainer: true, daysSinceLastCommit: 40 }; // 40 days commit drift => BOTTLENECK
  const er = detectExtensionExploitRisk({
    repoData,
    workflows: null,
    hasDependabot: false,
    hasSast: false,
    maintainerConcentration: mc
  });
  eq(er.active, true, 'exploit risk active');
  eq(er.status, 'MAINTAINER BOTTLENECK', 'status is MAINTAINER BOTTLENECK');
  
  const adoption = verdictFor(50, { extensionExploitRisk: er, maintainerConcentration: mc });
  eq(adoption, 'WATCHLIST', 'Adoption verdict stays WATCHLIST, does not upgrade to FORKABLE');
});

console.log('');
console.log(`Verdict tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
