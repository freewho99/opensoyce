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
 * @typedef {object} MaintainerConcentrationLike
 * @property {boolean} [isSingleMaintainer]
 * @property {number}  [topShare]
 * @property {number}  [nonBotContributorCount]
 * @property {number | null} [daysSinceLastCommit]
 *
 * AI signals v0.1 — maintainer-concentration band-cap.
 *
 * Caps USE READY → FORKABLE (never below FORKABLE, never a promotion) when
 * three structural bus-factor signals all fire: top-1 commit share > 85%,
 * <= 2 non-bot contributors, AND > 30 days since last commit. The
 * `vendorSdkMatch` flag suppresses the cap because vendor-official SDKs
 * legitimately have small teams and quiet weeks (openai/openai-node is not
 * the same bus-factor story as a one-author hobby project).
 *
 * Like the advisorySummary cap, this is strictly a CAP — composite math
 * is untouched, only the band label moves. A 7.5 FORKABLE stays FORKABLE;
 * a 5.5 WATCHLIST stays WATCHLIST.
 */

/**
 * @param {{
 *   repoData: any,
 *   workflows: any,
 *   hasDependabot: boolean | 'unknown',
 *   hasSast: boolean | 'unknown',
 *   maintainerConcentration: any
 * }} opts
 */
export function detectExtensionExploitRisk({ repoData, workflows, hasDependabot, hasSast, maintainerConcentration }) {
  let sastStatus = hasSast;
  if (sastStatus === undefined) {
    if (workflows === null || workflows === undefined) {
      sastStatus = 'unknown';
    } else if (!workflows.workflows || !Array.isArray(workflows.workflows)) {
      sastStatus = 'unknown';
    } else {
      const sastRegex = /(codeql|semgrep|snyk|trivy|osv|security|audit|scan|scorecard|socket|step-security)/i;
      const match = workflows.workflows.some(w => {
        const name = w.name || '';
        const path = w.path || '';
        return sastRegex.test(name) || sastRegex.test(path);
      });
      sastStatus = match ? true : false;
    }
  }

  const name = (repoData.name || '').toLowerCase();
  const desc = (repoData.description || '').toLowerCase();
  const topics = (repoData.topics || []).map(t => t.toLowerCase());

  const tier1 = ['vscode', 'jetbrains', 'intellij', 'cursor', 'extension', 'ide', 'editor', 'copilot', 'mcp', 'agent'];
  const tier2 = ['cli', 'plugin', 'addon', 'terminal', 'shell', 'devtool', 'neovim', 'vim'];
  const tier3 = ['console', 'command', 'tool', 'tooling'];

  const matchedTerms = new Set();
  const checkTerm = (term) => {
    const regex = new RegExp(`(?:^|[^a-zA-Z0-9])${term}(?:[^a-zA-Z0-9]|$)`, 'i');
    if (regex.test(name) || regex.test(desc) || topics.some(t => regex.test(t))) {
      matchedTerms.add(term);
      return true;
    }
    return false;
  };

  let totalScore = 0;
  const matched = [];

  for (const term of tier1) {
    if (checkTerm(term)) {
      totalScore += 3;
      matched.push(term);
    }
  }
  for (const term of tier2) {
    if (checkTerm(term)) {
      totalScore += 2;
      matched.push(term);
    }
  }
  for (const term of tier3) {
    if (checkTerm(term)) {
      totalScore += 1;
      matched.push(term);
    }
  }

  const isTargetVector = totalScore >= 2;

  // Postural weakness check: fires only when BOTH are explicitly false
  const hasPosturalWeakness = (hasDependabot === false && sastStatus === false);

  const mc = maintainerConcentration || {};
  const isSingle = mc.isSingleMaintainer === true;
  const driftDays = typeof mc.daysSinceLastCommit === 'number' ? mc.daysSinceLastCommit : null;

  const reasons = [];

  if (isTargetVector) {
    reasons.push({
      code: 'TARGET_VECTOR_TIER_MATCH',
      label: `Matches developer-tool install surface: ${matched.join(', ')}`
    });
  }

  if (hasDependabot === false) {
    reasons.push({
      code: 'NO_DEPENDABOT_DETECTED',
      label: 'No dependency automation detected'
    });
  } else if (hasDependabot === 'unknown') {
    reasons.push({
      code: 'DEPENDABOT_UNKNOWN',
      label: 'Dependency automation status unknown due to API errors'
    });
  }

  if (sastStatus === false) {
    reasons.push({
      code: 'NO_SAST_DETECTED',
      label: 'No security scanning workflow detected'
    });
  } else if (sastStatus === 'unknown') {
    reasons.push({
      code: 'SAST_UNKNOWN',
      label: 'Security scanning workflow status unknown due to API errors'
    });
  }

  if (isSingle) {
    if (driftDays !== null) {
      reasons.push({
        code: `SINGLE_MAINTAINER_DRIFT_${driftDays}D`,
        label: `Single maintainer with last commit ${driftDays} days ago`
      });
    } else {
      reasons.push({
        code: 'SINGLE_MAINTAINER_NO_DRIFT_DATA',
        label: 'Single maintainer with no drift data available'
      });
    }
  }

  let status = 'NONE';
  let active = false;
  let confidence = 'medium';

  if (isTargetVector && hasPosturalWeakness && isSingle && driftDays !== null) {
    if (driftDays > 90) {
      status = 'HIJACK RISK';
      active = true;
      confidence = 'high';
    } else if (driftDays >= 30) {
      status = 'MAINTAINER BOTTLENECK';
      active = true;
      confidence = 'high';
    }
  }

  // Unknown Dependabot + unknown SAST = no hijack risk, confidence low, reasons include unknown evidence
  if (!active && isTargetVector && isSingle && driftDays >= 30 && (hasDependabot === 'unknown' || sastStatus === 'unknown')) {
    confidence = 'low';
    reasons.push({
      code: 'UNKNOWN_EVIDENCE_POSTURE',
      label: 'Postural weakness uncertain due to unknown security scanning or dependency automation status'
    });
  }

  return {
    active,
    status,
    reasons,
    confidence
  };
}

/**
 * @param {number} score
 * @param {{
 *   extensionExploitRisk?: any,
 *   advisorySummary?: AdvisorySummaryLike | null,
 *   maintainerConcentration?: MaintainerConcentrationLike | null,
 *   hasSast?: boolean | 'unknown',
 *   hasDependabot?: boolean | 'unknown',
 *   workflows?: any,
 *   vendorSdkMatch?: boolean,
 * }} [opts]
 * @returns {string}
 */
export function trustPostureFor(score, opts = {}) {
  const er = opts.extensionExploitRisk || { active: false, status: 'NONE', reasons: [], confidence: 'medium' };
  const a = opts.advisorySummary || {};
  const criticalOpen = a.critical || 0;
  const highOpen = a.high || 0;

  if (criticalOpen >= 1) {
    return 'COMPROMISED';
  }

  if (er.status === 'HIJACK RISK') {
    return 'HIJACK RISK';
  }

  const mc = opts.maintainerConcentration || {};
  const isSingle = mc.isSingleMaintainer === true;
  
  let sastStatus = opts.hasSast;
  if (sastStatus === undefined) {
    if (opts.workflows === null || opts.workflows === undefined) {
      sastStatus = 'unknown';
    } else if (!opts.workflows.workflows || !Array.isArray(opts.workflows.workflows)) {
      sastStatus = 'unknown';
    } else {
      const sastRegex = /(codeql|semgrep|snyk|trivy|osv|security|audit|scan|scorecard|socket|step-security)/i;
      const match = opts.workflows.workflows.some(w => {
        const name = w.name || '';
        const path = w.path || '';
        return sastRegex.test(name) || sastRegex.test(path);
      });
      sastStatus = match ? true : false;
    }
  }
  const hasDependabot = opts.hasDependabot;
  const securityAutomationDetected = (hasDependabot === true || sastStatus === true);

  if (
    er.status === 'MAINTAINER BOTTLENECK' ||
    score < 85 ||
    highOpen >= 1 ||
    isSingle ||
    !securityAutomationDetected
  ) {
    return 'LIMITED TRUST';
  }

  return 'TRUSTED';
}

/**
 * @param {number} score
 * @param {{
 *   earlyBreakout?: boolean,
 *   advisorySummary?: AdvisorySummaryLike | null,
 *   maintainerConcentration?: MaintainerConcentrationLike | null,
 *   vendorSdkMatch?: boolean,
 *   extensionExploitRisk?: any,
 * }} [opts]
 * @returns {SoyceVerdict}
 */
export function verdictFor(score, opts = {}) {
  // Let's resolve what the normal verdict would be without the hijack/bottleneck caps first.
  let verdict = 'STALE';
  if (score >= 85) verdict = 'USE READY';
  else if (score >= 70) verdict = 'FORKABLE';
  else if (opts && opts.earlyBreakout) verdict = 'HIGH MOMENTUM';
  else if (score >= 60) verdict = 'STABLE';
  else if (score >= 40) verdict = 'WATCHLIST';
  else if (score >= 25) verdict = 'RISKY';

  if (opts && opts.advisorySummary) {
    const a = opts.advisorySummary;
    const criticalOpen = a.critical || 0;
    const highOpen = a.high || 0;
    const seriousOpen = criticalOpen + highOpen;
    if (criticalOpen >= 1 && score >= 70) verdict = 'WATCHLIST';
    else if (seriousOpen >= 3 && score >= 70) verdict = 'WATCHLIST';
    else if (highOpen >= 1 && score >= 85) verdict = 'FORKABLE';
  }

  if (opts && opts.maintainerConcentration && !opts.vendorSdkMatch) {
    const mc = opts.maintainerConcentration;
    if (
      mc.isSingleMaintainer === true
      && typeof mc.daysSinceLastCommit === 'number'
      && mc.daysSinceLastCommit > 30
      && score >= 85
    ) {
      if (verdict === 'USE READY') {
        verdict = 'FORKABLE';
      }
    }
  }

  const er = opts.extensionExploitRisk || { active: false, status: 'NONE' };

  if (er.status === 'HIJACK RISK') {
    const order = ['USE READY', 'FORKABLE', 'HIGH MOMENTUM', 'STABLE', 'WATCHLIST', 'RISKY', 'STALE'];
    const currentIdx = order.indexOf(verdict);
    const targetIdx = order.indexOf('WATCHLIST');
    if (currentIdx < targetIdx) {
      verdict = 'WATCHLIST';
    }
  } else if (er.status === 'MAINTAINER BOTTLENECK') {
    const order = ['USE READY', 'FORKABLE', 'HIGH MOMENTUM', 'STABLE', 'WATCHLIST', 'RISKY', 'STALE'];
    const currentIdx = order.indexOf(verdict);
    const targetIdx = order.indexOf('FORKABLE');
    if (currentIdx < targetIdx) {
      verdict = 'FORKABLE';
    }
  }

  return verdict;
}
