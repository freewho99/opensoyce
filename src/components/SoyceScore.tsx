import React from 'react';
import { Link } from 'react-router-dom';
import { verdictFor as sharedVerdictFor } from '../shared/verdict.js';

export type SoyceVerdict = 'USE READY' | 'FORKABLE' | 'HIGH MOMENTUM' | 'STABLE' | 'WATCHLIST' | 'RISKY' | 'STALE';

export type AdvisorySummaryLike = {
  total?: number;
  openCount?: number;
  recentOpen?: number;
  critical?: number;
  high?: number;
  medium?: number;
  low?: number;
};

export type MaintainerConcentrationLike = {
  topShare?: number;
  nonBotContributorCount?: number;
  lastCommitDate?: string | null;
  daysSinceLastCommit?: number | null;
  isSingleMaintainer?: boolean;
};

// Verdict bands were recalibrated in commit-after-13ec156 to match where
// real projects land. The earlier bands (USE READY ≥ 9.0, FORKABLE ≥ 8.0,
// WATCHLIST ≥ 7.0, RISKY ≥ 5.0) punished healthy stable libraries — winston
// at 6.8 was labeled "RISKY" while being a perfectly maintained logger.
// The new bands add a STABLE tier and let RISKY mean what it says.
//
// Implementation lives in src/shared/verdict.js so server.ts and api/scan.js
// can reuse the same band logic without dragging React through the graph.
export function verdictFor(
  score: number,
  opts?: {
    earlyBreakout?: boolean;
    advisorySummary?: AdvisorySummaryLike | null;
    maintainerConcentration?: MaintainerConcentrationLike | null;
    vendorSdkMatch?: boolean;
  },
): SoyceVerdict {
  return sharedVerdictFor(score, opts) as SoyceVerdict;
}

// Verdict-band sub-labels (P1a — Marco grading-swarm finding). The band name
// alone misreads: Marco reported "FORKABLE" as a hostile public verdict that
// reads like "abandon ship, fork your own." The band name is load-bearing in
// verdict.js / data shapes / embedded badges so we don't rename it — we add a
// short clarification under the band pill so readers understand FORKABLE means
// "healthy and trustworthy, fork-worthy as a base," not "abandoned, must be
// forked." Rendered only in the SoyceScore card's standalone display (size md
// and lg). Compact chips on Scanner vuln rows (size sm) skip the sub-label to
// keep visual weight low on dense lists.
const VERDICT_SUB_LABEL: Record<SoyceVerdict, string> = {
  'USE READY':     'Safe to adopt — strong across all pillars',
  'FORKABLE':      'Healthy and trustworthy — fork-worthy as a base',
  'HIGH MOMENTUM': 'Rising signals — editorial tier',
  'STABLE':        'Mature, lower-velocity, still maintained',
  'WATCHLIST':     'Real issues; verify before adoption',
  'RISKY':         'Multiple bands flag concerns',
  'STALE':         'Abandoned or dormant',
};

interface SoyceScoreProps {
  value: number;
  size?: 'sm' | 'md' | 'lg';
  /** Show the verdict label under the number (default: true). */
  showVerdict?: boolean;
  /** Link the score to /methodology for a layperson legend (default: false). */
  link?: boolean;
  /** When true, a sub-9.0 score with rising signals is labeled HIGH MOMENTUM. */
  earlyBreakout?: boolean;
  /**
   * When passed, an open critical+high count >= 1 caps the band (no USE READY)
   * and >= 3 caps it at WATCHLIST. P0-AI-1: prevents "FORKABLE 8.0" rendering
   * next to 4 open HIGH/CRITICAL advisories.
   */
  advisorySummary?: AdvisorySummaryLike | null;
  /**
   * AI signals v0.1 — bus-factor cap. When the structural signals indicate a
   * single-maintainer repo that has drifted (>30 days since last commit), the
   * verdict band is capped from USE READY to FORKABLE. Composite score is
   * untouched. Suppressed by `vendorSdkMatch` so vendor-official SDKs don't
   * get punished for being maintained by small in-house teams.
   */
  maintainerConcentration?: MaintainerConcentrationLike | null;
  /** When true, suppresses the maintainer-concentration cap. */
  vendorSdkMatch?: boolean;
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<SoyceScoreProps['size']>, { number: string; verdict: string; padding: string; chip: string }> = {
  sm: { number: 'text-3xl', verdict: 'text-[8px]', padding: 'px-3 py-1.5', chip: 'text-[8px]' },
  md: { number: 'text-5xl', verdict: 'text-[9px]', padding: 'px-4 py-2', chip: 'text-[9px]' },
  lg: { number: 'text-6xl', verdict: 'text-[10px]', padding: 'px-5 py-3', chip: 'text-[10px]' },
};

export default function SoyceScore({
  value,
  size = 'md',
  showVerdict = true,
  link = false,
  earlyBreakout = false,
  advisorySummary = null,
  maintainerConcentration = null,
  vendorSdkMatch = false,
  className = '',
}: SoyceScoreProps) {
  const score = typeof value === 'number' && !Number.isNaN(value) ? value : 0;
  const verdict = verdictFor(score, { earlyBreakout, advisorySummary, maintainerConcentration, vendorSdkMatch });
  // The band the score *would have* earned without the hidden-vulns cap.
  // Used purely to decide whether to show the explanation chip.
  const uncappedVerdict = verdictFor(score, { earlyBreakout });
  const seriousOpen = advisorySummary
    ? (advisorySummary.critical || 0) + (advisorySummary.high || 0)
    : 0;
  // The band the score earns when we strip ONLY the maintainer-concentration
  // cap (advisory cap still applied). This lets us tell which cap fired when
  // both could plausibly trigger.
  const verdictWithoutMaintainerCap = verdictFor(score, { earlyBreakout, advisorySummary });
  const showAdvisoryChip = !!advisorySummary && seriousOpen >= 1 && verdictWithoutMaintainerCap !== uncappedVerdict;
  const maintainerCapFired = !vendorSdkMatch
    && !!maintainerConcentration
    && verdict !== verdictWithoutMaintainerCap;
  const s = SIZE_CLASSES[size];
  // Sub-label only on the standalone card (md/lg) — compact chips on dense
  // vuln-row lists already carry enough visual weight.
  const showSubLabel = showVerdict && size !== 'sm';
  const subLabel = VERDICT_SUB_LABEL[verdict] || '';

  const inner = (
    <div className={`inline-flex flex-col items-center leading-none ${className}`}>
      <div className={`inline-flex flex-col items-center leading-none ${s.padding} bg-soy-red text-white`}>
        <span className={`${s.number} font-black italic tracking-tighter`} aria-label={`Soyce Score ${score.toFixed(1)} of 10`}>
          {score.toFixed(1)}
        </span>
        {showVerdict && (
          <span className={`${s.verdict} font-black uppercase tracking-[0.2em] mt-1 opacity-90`}>
            {verdict}
          </span>
        )}
      </div>
      {showSubLabel && subLabel && (
        <span
          className="mt-1.5 text-[10px] md:text-[11px] italic font-medium text-soy-bottle opacity-60 leading-tight text-center max-w-[20rem] px-1"
        >
          {subLabel}
        </span>
      )}
      {showAdvisoryChip && (
        <span
          className={`${s.chip} mt-1.5 font-black uppercase tracking-[0.15em] bg-black text-white px-2 py-0.5 border border-black`}
          title={`Band capped from ${uncappedVerdict} because ${seriousOpen} HIGH/CRITICAL ${seriousOpen === 1 ? 'advisory is' : 'advisories are'} open on this repo`}
        >
          ⚠ {seriousOpen} OPEN HIGH/CRIT
        </span>
      )}
      {maintainerCapFired && (
        <span
          className={`${s.chip} mt-1.5 font-black uppercase tracking-[0.15em] bg-black text-white px-2 py-0.5 border border-black`}
          title={(() => {
            const mc = maintainerConcentration!;
            const sharePct = typeof mc.topShare === 'number' ? Math.round(mc.topShare * 100) : null;
            const count = mc.nonBotContributorCount ?? null;
            const days = mc.daysSinceLastCommit ?? null;
            return `Band capped from ${verdictWithoutMaintainerCap} because this repo has ${sharePct != null ? sharePct + '%' : 'a high'} top-contributor commit share, ${count != null ? count : 'few'} non-bot contributor${count === 1 ? '' : 's'}, and ${days != null ? days : '30+'} days since last commit. Suppressed for vendor-official SDKs.`;
          })()}
        >
          ⚠ SINGLE-MAINTAINER
        </span>
      )}
    </div>
  );

  if (link) {
    let title: string;
    if (showAdvisoryChip && maintainerCapFired) {
      title = `Soyce Score ${score.toFixed(1)} / 10 — ${verdict} (capped from ${uncappedVerdict}; ${seriousOpen} open HIGH/CRITICAL + single-maintainer drift). Click for methodology.`;
    } else if (showAdvisoryChip) {
      title = `Soyce Score ${score.toFixed(1)} / 10 — ${verdict} (capped from ${uncappedVerdict}; ${seriousOpen} open HIGH/CRITICAL ${seriousOpen === 1 ? 'advisory' : 'advisories'}). Click for methodology.`;
    } else if (maintainerCapFired) {
      title = `Soyce Score ${score.toFixed(1)} / 10 — ${verdict} (capped from ${verdictWithoutMaintainerCap}; single-maintainer drift). Click for methodology.`;
    } else {
      title = `Soyce Score ${score.toFixed(1)} / 10 — ${verdict}. Click for methodology.`;
    }
    return (
      <Link to="/methodology" title={title} className="hover:opacity-90 transition-opacity">
        {inner}
      </Link>
    );
  }

  return inner;
}
