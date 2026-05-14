/**
 * Scanner v2.1b — Dependency Risk Summary (pure judgment layer).
 *
 * Takes the v2.1a-shape vulnerability rows (advisory fields + identity fields
 * + repoHealth/repoHealthError) and produces a single roll-up the Scanner UI
 * can render above the per-row blocks.
 *
 * No I/O, no React. Server response shape is the only contract.
 *
 * @typedef {'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'|'UNKNOWN'} SeverityKey
 * @typedef {'USE READY'|'FORKABLE'|'STABLE'|'WATCHLIST'|'RISKY'|'STALE'|'HIGH MOMENTUM'} HealthBand
 *
 * @typedef {Object} NeedsAttentionEntry
 * @property {string} package
 * @property {'HIGH_OR_CRITICAL_WEAK_HEALTH'|'NO_FIX'|'HEALTH_UNAVAILABLE'|'IDENTITY_UNRESOLVED'} reason
 * @property {string} severity
 * @property {string|null} verdict
 *
 * @typedef {Object} ScanSummary
 * @property {{
 *   vulnerablePackages: number,
 *   advisories: number,
 *   bySeverity: Record<SeverityKey, number>,
 *   fixAvailable: number,
 *   fixUnavailable: number,
 * }} totals
 * @property {Record<HealthBand|'UNAVAILABLE', number>} healthDistribution
 * @property {NeedsAttentionEntry[]} needsAttention
 * @property {'CLEAN'|'PATCH_AVAILABLE'|'REVIEW_REQUIRED'|'VERIFY_LATER'} label
 * @property {string} labelReason
 */

const WEAK_HEALTH = new Set(['WATCHLIST', 'RISKY', 'STALE']);

/**
 * Normalize the severity field to one of the five canonical keys.
 * The server uses lowercase strings ('critical', 'high', 'medium',
 * 'moderate', 'low', or anything else). 'moderate' is a GH/OSV synonym
 * for 'medium'; unknown values bucket under UNKNOWN so the math always
 * reconciles.
 *
 * @param {unknown} sev
 * @returns {SeverityKey}
 */
function normalizeSeverity(sev) {
  if (typeof sev !== 'string') return 'UNKNOWN';
  const k = sev.toLowerCase();
  if (k === 'critical') return 'CRITICAL';
  if (k === 'high') return 'HIGH';
  if (k === 'medium' || k === 'moderate') return 'MEDIUM';
  if (k === 'low') return 'LOW';
  return 'UNKNOWN';
}

/**
 * Detect whether an advisory row has a known fixed version. Server writes
 * the field as `fixedIn` (string) — absence (undefined, null, or empty
 * string) means OSV did not record a fix.
 *
 * @param {any} v
 * @returns {boolean}
 */
function hasFix(v) {
  return typeof v?.fixedIn === 'string' && v.fixedIn.trim().length > 0;
}

/**
 * Build the {package, reason} dedupe key used by needsAttention.
 * @param {string} pkg
 * @param {string} reason
 */
function nakey(pkg, reason) { return `${pkg}::${reason}`; }

/**
 * Summarize a v2.1a scan response.
 *
 * @param {any[]} vulnerabilities
 * @returns {ScanSummary}
 */
export function summarizeScan(vulnerabilities) {
  const rows = Array.isArray(vulnerabilities) ? vulnerabilities : [];

  /** @type {Record<SeverityKey, number>} */
  const bySeverity = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 };
  /** @type {Record<HealthBand|'UNAVAILABLE', number>} */
  const healthDistribution = {
    'USE READY': 0,
    'FORKABLE': 0,
    'STABLE': 0,
    'WATCHLIST': 0,
    'RISKY': 0,
    'STALE': 0,
    'HIGH MOMENTUM': 0,
    UNAVAILABLE: 0,
  };

  const packages = new Set();
  let fixAvailable = 0;
  let fixUnavailable = 0;
  let anyIdentityUnresolved = false;
  let anyAnalysisFailed = false;
  let anyHealthUnavailable = false; // either of the two above, per-row
  let anyHighOrCritWeakHealth = false;
  let anyNoFix = false;

  /** @type {Map<string, NeedsAttentionEntry>} */
  const needsMap = new Map();

  for (const v of rows) {
    const pkg = typeof v?.package === 'string' ? v.package : '(unknown)';
    packages.add(pkg);

    const sev = normalizeSeverity(v?.severity);
    bySeverity[sev] += 1;

    const fixed = hasFix(v);
    if (fixed) fixAvailable += 1; else fixUnavailable += 1;

    // Health distribution. UNAVAILABLE covers both IDENTITY_NONE and
    // ANALYSIS_FAILED — the user-facing distinction lives in needsAttention.
    const verdict = v?.repoHealth?.verdict || null;
    const err = v?.repoHealthError || null;
    if (verdict && Object.prototype.hasOwnProperty.call(healthDistribution, verdict)) {
      healthDistribution[verdict] += 1;
    } else if (err === 'IDENTITY_NONE' || err === 'ANALYSIS_FAILED' || !verdict) {
      healthDistribution.UNAVAILABLE += 1;
    }

    if (err === 'IDENTITY_NONE') { anyIdentityUnresolved = true; anyHealthUnavailable = true; }
    if (err === 'ANALYSIS_FAILED') { anyAnalysisFailed = true; anyHealthUnavailable = true; }

    const isHighOrCrit = sev === 'HIGH' || sev === 'CRITICAL';
    const weakHealth = !!(verdict && WEAK_HEALTH.has(verdict));

    if (isHighOrCrit && weakHealth) {
      anyHighOrCritWeakHealth = true;
      const key = nakey(pkg, 'HIGH_OR_CRITICAL_WEAK_HEALTH');
      if (!needsMap.has(key)) {
        needsMap.set(key, {
          package: pkg,
          reason: 'HIGH_OR_CRITICAL_WEAK_HEALTH',
          severity: sev,
          verdict,
        });
      }
    }
    if (!fixed) {
      anyNoFix = true;
      const key = nakey(pkg, 'NO_FIX');
      if (!needsMap.has(key)) {
        needsMap.set(key, { package: pkg, reason: 'NO_FIX', severity: sev, verdict });
      }
    }
    if (err === 'ANALYSIS_FAILED') {
      const key = nakey(pkg, 'HEALTH_UNAVAILABLE');
      if (!needsMap.has(key)) {
        needsMap.set(key, { package: pkg, reason: 'HEALTH_UNAVAILABLE', severity: sev, verdict: null });
      }
    }
    if (err === 'IDENTITY_NONE') {
      const key = nakey(pkg, 'IDENTITY_UNRESOLVED');
      if (!needsMap.has(key)) {
        needsMap.set(key, { package: pkg, reason: 'IDENTITY_UNRESOLVED', severity: sev, verdict: null });
      }
    }
  }

  const advisoryCount = rows.length;
  const hasAdvisories = advisoryCount > 0;
  const highOrCritCount = bySeverity.CRITICAL + bySeverity.HIGH;

  // Decision-label rules (locked):
  //   CLEAN:            zero advisories AND no identity/analysis gaps
  //   REVIEW_REQUIRED:  >=1 HIGH/CRITICAL AND (no-fix OR weak-health) — for that row
  //   VERIFY_LATER:     gaps exist (identity unresolved, analysis failed, or zero
  //                     vulns but gaps); takes precedence over PATCH_AVAILABLE
  //   PATCH_AVAILABLE:  advisories present, fixes available, no weak-health/high,
  //                     no analysis gaps
  let label;
  let labelReason;

  // First pass: does any high/critical row pair with no-fix OR weak health?
  let reviewRequired = false;
  if (highOrCritCount > 0) {
    for (const v of rows) {
      const sev = normalizeSeverity(v?.severity);
      if (sev !== 'HIGH' && sev !== 'CRITICAL') continue;
      const verdict = v?.repoHealth?.verdict || null;
      if (!hasFix(v)) { reviewRequired = true; break; }
      if (verdict && WEAK_HEALTH.has(verdict)) { reviewRequired = true; break; }
    }
  }

  if (!hasAdvisories && !anyHealthUnavailable) {
    label = 'CLEAN';
    labelReason = 'No known vulnerabilities in the dependencies we scanned.';
  } else if (reviewRequired) {
    label = 'REVIEW_REQUIRED';
    const reasons = [];
    // List concrete drivers in priority order.
    let noFixHighCrit = 0;
    let weakHealthHighCrit = 0;
    for (const v of rows) {
      const sev = normalizeSeverity(v?.severity);
      if (sev !== 'HIGH' && sev !== 'CRITICAL') continue;
      if (!hasFix(v)) noFixHighCrit += 1;
      else if (v?.repoHealth?.verdict && WEAK_HEALTH.has(v.repoHealth.verdict)) weakHealthHighCrit += 1;
    }
    if (noFixHighCrit > 0) reasons.push(`${noFixHighCrit} high/critical advisory(ies) with no fix available`);
    if (weakHealthHighCrit > 0) reasons.push(`${weakHealthHighCrit} high/critical advisory(ies) on a weak-health repo`);
    labelReason = reasons.length > 0
      ? `Manual review needed: ${reasons.join('; ')}.`
      : 'Manual review needed for high or critical advisories.';
  } else if (anyHealthUnavailable) {
    label = 'VERIFY_LATER';
    const parts = [];
    if (anyIdentityUnresolved) {
      const n = rows.filter(v => v?.repoHealthError === 'IDENTITY_NONE').length;
      parts.push(`couldn't resolve source repo for ${n} package(s)`);
    }
    if (anyAnalysisFailed) {
      const n = rows.filter(v => v?.repoHealthError === 'ANALYSIS_FAILED').length;
      parts.push(`repo health unavailable for ${n} package(s)`);
    }
    labelReason = `Incomplete picture — ${parts.join('; ')}.`;
  } else if (hasAdvisories) {
    label = 'PATCH_AVAILABLE';
    labelReason = `Fixes available for all ${advisoryCount} advisory(ies); upgrade the listed versions.`;
  } else {
    // Defensive fallback. Should not reach here given the branches above.
    label = 'CLEAN';
    labelReason = 'No known vulnerabilities in the dependencies we scanned.';
  }

  // Touch flags so eslint doesn't complain about unused locals. These remain
  // useful for future label-rule refinement (e.g. surfacing weak health on
  // medium-severity rows in a VERIFY_LATER sub-message).
  void anyHighOrCritWeakHealth; void anyNoFix;

  return {
    totals: {
      vulnerablePackages: packages.size,
      advisories: advisoryCount,
      bySeverity,
      fixAvailable,
      fixUnavailable,
    },
    healthDistribution,
    needsAttention: Array.from(needsMap.values()),
    label,
    labelReason,
  };
}
