import React from 'react';
import { Link } from 'react-router-dom';

export type SoyceVerdict = 'USE READY' | 'FORKABLE' | 'HIGH MOMENTUM' | 'STABLE' | 'WATCHLIST' | 'RISKY' | 'STALE';

// Verdict bands were recalibrated in commit-after-13ec156 to match where
// real projects land. The earlier bands (USE READY ≥ 9.0, FORKABLE ≥ 8.0,
// WATCHLIST ≥ 7.0, RISKY ≥ 5.0) punished healthy stable libraries — winston
// at 6.8 was labeled "RISKY" while being a perfectly maintained logger.
// The new bands add a STABLE tier and let RISKY mean what it says.
export function verdictFor(score: number, opts?: { earlyBreakout?: boolean }): SoyceVerdict {
  if (score >= 8.5) return 'USE READY';
  if (score >= 7.0) return 'FORKABLE';
  // earlyBreakout: a sub-8.5 project with strong rising-signal curation.
  // Renders as HIGH MOMENTUM in any of the lower tiers so the breakout
  // story isn't swallowed by a STABLE / WATCHLIST label.
  if (opts?.earlyBreakout) return 'HIGH MOMENTUM';
  if (score >= 5.5) return 'STABLE';
  if (score >= 4.0) return 'WATCHLIST';
  if (score >= 2.5) return 'RISKY';
  return 'STALE';
}

interface SoyceScoreProps {
  value: number;
  size?: 'sm' | 'md' | 'lg';
  /** Show the verdict label under the number (default: true). */
  showVerdict?: boolean;
  /** Link the score to /methodology for a layperson legend (default: false). */
  link?: boolean;
  /** When true, a sub-9.0 score with rising signals is labeled HIGH MOMENTUM. */
  earlyBreakout?: boolean;
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<SoyceScoreProps['size']>, { number: string; verdict: string; padding: string }> = {
  sm: { number: 'text-3xl', verdict: 'text-[8px]', padding: 'px-3 py-1.5' },
  md: { number: 'text-5xl', verdict: 'text-[9px]', padding: 'px-4 py-2' },
  lg: { number: 'text-6xl', verdict: 'text-[10px]', padding: 'px-5 py-3' },
};

export default function SoyceScore({
  value,
  size = 'md',
  showVerdict = true,
  link = false,
  earlyBreakout = false,
  className = '',
}: SoyceScoreProps) {
  const score = typeof value === 'number' && !Number.isNaN(value) ? value : 0;
  const verdict = verdictFor(score, { earlyBreakout });
  const s = SIZE_CLASSES[size];

  const inner = (
    <div className={`inline-flex flex-col items-center leading-none ${s.padding} bg-soy-red text-white ${className}`}>
      <span className={`${s.number} font-black italic tracking-tighter`} aria-label={`Soyce Score ${score.toFixed(1)} of 10`}>
        {score.toFixed(1)}
      </span>
      {showVerdict && (
        <span className={`${s.verdict} font-black uppercase tracking-[0.2em] mt-1 opacity-90`}>
          {verdict}
        </span>
      )}
    </div>
  );

  if (link) {
    return (
      <Link to="/methodology" title={`Soyce Score ${score.toFixed(1)} / 10 — ${verdict}. Click for methodology.`} className="hover:opacity-90 transition-opacity">
        {inner}
      </Link>
    );
  }

  return inner;
}
