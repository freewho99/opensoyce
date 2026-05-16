/**
 * Soyce verdict bands. Single source of truth shared by the React component
 * (SoyceScore.tsx) and the server-side score attachment in Scanner v2.1a.
 *
 * Verdict bands were recalibrated to match where real projects land. STABLE
 * exists so healthy maintained-but-not-flashy libraries (winston@6.8) don't
 * get labeled "RISKY".
 *
 * Hidden-vulns cap (P0-AI-1, AI builder swarm finding): when the composite
 * math has punished the security pillar but the band would still read
 * FORKABLE/USE READY, the override caps the band so it cannot lie. Surfaced
 * when langchain-ai/langchain rendered "FORKABLE 8.0" while carrying 4 open
 * HIGH/CRITICAL advisories on the repo's own code. The composite total stays
 * whatever the calculator returned — only the label is capped.
 *
 * The override is a CAP, never a PROMOTION: a low-score repo with no
 * advisories does NOT jump up. Band cutoffs are 8.5 / 7.0 / 6.0 / 4.0 / 2.5
 * (STABLE lower bound tightened from 5.5 → 6.0 per Maya's swarm calibration:
 * 5.5–5.99 was too forgiving and let drifted projects keep the "STABLE"
 * badge, which carries an implicit "actively maintained" promise; that band
 * now reads as WATCHLIST).
 *
 * Public verdict bands surfaced by runScan / API: USE READY, FORKABLE, STABLE,
 * WATCHLIST, RISKY, STALE.
 *
 * HIGH MOMENTUM is an editorial-only tier — it is still returned by this
 * function when callers explicitly pass `earlyBreakout: true`, but it is not
 * exposed by `runScan` and is not rendered as a public verdict band. Only
 * `src/data/categories.ts` (the curated editorial allowlist) opts in. Removed
 * from public display because no public-facing call site passes
 * `earlyBreakout: true`, so users could never earn it via the algorithm.
 *
 * @typedef {'USE READY' | 'FORKABLE' | 'HIGH MOMENTUM' | 'STABLE' | 'WATCHLIST' | 'RISKY' | 'STALE'} SoyceVerdict
 *
 * @typedef {object} AdvisorySummaryLike
 * @property {number} [critical]
 * @property {number} [high]
 * @property {number} [medium]
 * @property {number} [low]
 * @property {number} [total]
 * @property {number} [openCount]
 * @property {number} [recentOpen]
 *
 * @param {number} score
 * @param {{ earlyBreakout?: boolean, advisorySummary?: AdvisorySummaryLike | null }} [opts]
 * @returns {SoyceVerdict}
 */
export function verdictFor(score, opts = {}) {
  // Hidden-vulns cap: applies only when an advisorySummary is supplied.
  // Callers that only know the score keep the legacy behavior.
  if (opts && opts.advisorySummary) {
    const a = opts.advisorySummary;
    const seriousOpen = (a.critical || 0) + (a.high || 0);
    // >=3 open serious → cap at WATCHLIST regardless of how good the rest is.
    if (seriousOpen >= 3 && score >= 7.0) return 'WATCHLIST';
    // >=1 open serious → no USE READY; cap at FORKABLE.
    if (seriousOpen >= 1 && score >= 8.5) return 'FORKABLE';
  }
  if (score >= 8.5) return 'USE READY';
  if (score >= 7.0) return 'FORKABLE';
  // earlyBreakout: opt-in editorial tier for hand-curated "rising star"
  // projects. Currently used only by src/data/categories.ts. Not exposed by
  // runScan. When set, returns 'HIGH MOMENTUM' regardless of the band the
  // score would normally land in. Public scoring callers should leave this
  // off — the band is not rendered as a public verdict.
  if (opts && opts.earlyBreakout) return 'HIGH MOMENTUM';
  if (score >= 6.0) return 'STABLE';
  if (score >= 4.0) return 'WATCHLIST';
  if (score >= 2.5) return 'RISKY';
  return 'STALE';
}
