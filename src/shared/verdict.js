/**
 * Soyce verdict bands. Single source of truth shared by the React component
 * (SoyceScore.tsx) and the server-side score attachment in Scanner v2.1a.
 *
 * Verdict bands were recalibrated to match where real projects land. STABLE
 * exists so healthy maintained-but-not-flashy libraries (winston@6.8) don't
 * get labeled "RISKY".
 *
 * @typedef {'USE READY' | 'FORKABLE' | 'HIGH MOMENTUM' | 'STABLE' | 'WATCHLIST' | 'RISKY' | 'STALE'} SoyceVerdict
 *
 * @param {number} score
 * @param {{ earlyBreakout?: boolean }} [opts]
 * @returns {SoyceVerdict}
 */
export function verdictFor(score, opts) {
  if (score >= 8.5) return 'USE READY';
  if (score >= 7.0) return 'FORKABLE';
  // earlyBreakout: a sub-8.5 project with strong rising-signal curation.
  // Renders as HIGH MOMENTUM in any of the lower tiers so the breakout
  // story isn't swallowed by a STABLE / WATCHLIST label.
  if (opts && opts.earlyBreakout) return 'HIGH MOMENTUM';
  if (score >= 5.5) return 'STABLE';
  if (score >= 4.0) return 'WATCHLIST';
  if (score >= 2.5) return 'RISKY';
  return 'STALE';
}
