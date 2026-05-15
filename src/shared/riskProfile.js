/**
 * Scanner v3c — Whole-Tree Risk Profile (pure interpretation layer).
 *
 * Aggregates evidence that v2.1a / v2.1b / v3a / v3b have already produced into
 * a 5-dimension risk shape. NO new scans, NO new fetches, NO new analysis.
 * Reads only the data that is already attached to the scan response.
 *
 * Honesty constraints (locked):
 *   - Never use the words "safe", "secure", "all clear".
 *   - UNKNOWN is its own band; UNKNOWN !== LOW.
 *   - Identity resolution is computed from data we have. Missing identity is
 *     an identity-resolution signal, NOT a quality penalty on the package.
 *   - Coverage is surfaced explicitly: "N selected scored out of M installed."
 *
 * Pure function. No I/O. No React imports.
 *
 * @typedef {'LOW'|'MODERATE'|'ELEVATED'|'HIGH'|'UNKNOWN'} RiskBand
 *
 * @typedef {Object} Dimension
 * @property {RiskBand} band
 * @property {string} because
 *
 * @typedef {Object} RiskProfile
 * @property {{
 *   vulnerabilityExposure: Dimension,
 *   remediationReadiness:  Dimension,
 *   maintainerTrust:       Dimension,
 *   treeComplexity:        Dimension,
 *   identityResolution:    Dimension,
 * }} dimensions
 * @property {{
 *   totalInstalled: number,
 *   vulnerableCount: number,
 *   vulnerableDirect: number,
 *   vulnerableTransitive: number,
 *   selectedScored: number,
 *   selectedQualifying: number,
 *   selectedSkippedBudget: number,
 *   unresolvedIdentities: number,
 * }} coverage
 */

import { plural } from './pluralize.js';

const WEAK_HEALTH = new Set(['WATCHLIST', 'RISKY', 'STALE']);
const STRONG_HEALTH = new Set(['USE READY', 'FORKABLE', 'STABLE', 'HIGH MOMENTUM']);

/** @param {unknown} sev @returns {'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'|'UNKNOWN'} */
function normalizeSeverity(sev) {
  if (typeof sev !== 'string') return 'UNKNOWN';
  const k = sev.toLowerCase();
  if (k === 'critical') return 'CRITICAL';
  if (k === 'high') return 'HIGH';
  if (k === 'medium' || k === 'moderate') return 'MEDIUM';
  if (k === 'low') return 'LOW';
  return 'UNKNOWN';
}

/** @param {any} v */
function hasFix(v) {
  return typeof v?.fixedIn === 'string' && v.fixedIn.trim().length > 0;
}

/**
 * @param {{
 *   vulnerabilities: any[]|null|undefined,
 *   inventory: any|null|undefined,
 *   selectedHealth: any|null|undefined,
 *   summary?: any,
 *   osvError?: boolean,
 * }} args
 * @returns {RiskProfile}
 */
export function computeRiskProfile({ vulnerabilities, inventory, selectedHealth, osvError } = {}) {
  // vulnerabilities === null means OSV was unavailable. An empty array
  // means zero advisories, NOT unknown. The honesty rule is non-negotiable.
  const vulnsUnavailable = vulnerabilities == null || osvError === true;
  const vulnRows = Array.isArray(vulnerabilities) ? vulnerabilities : [];
  const hasVulnData = !vulnsUnavailable;

  const inv = inventory && typeof inventory === 'object' ? inventory : null;
  const totals = inv && inv.totals && typeof inv.totals === 'object' ? inv.totals : null;
  const totalInstalled = totals && typeof totals.totalPackages === 'number'
    ? totals.totalPackages
    : 0;

  // Cross-ref the inventory so we can count vulnerable direct vs transitive.
  /** @type {Map<string, { direct: boolean }>} */
  const invByName = new Map();
  if (inv && Array.isArray(inv.packages)) {
    for (const p of inv.packages) {
      if (p && typeof p.name === 'string') {
        invByName.set(p.name, { direct: !!p.direct });
      }
    }
  }

  // Unique vulnerable package names.
  const vulnPkgNames = new Set();
  for (const v of vulnRows) {
    if (v && typeof v.package === 'string') vulnPkgNames.add(v.package);
  }
  let vulnerableDirect = 0;
  let vulnerableTransitive = 0;
  for (const name of vulnPkgNames) {
    const hit = invByName.get(name);
    if (!hit) continue; // not in inventory → leave uncounted on both sides
    if (hit.direct) vulnerableDirect += 1;
    else vulnerableTransitive += 1;
  }

  // Selected health metrics. Defensive: shape may be absent on older servers.
  const selectedScored = selectedHealth && Array.isArray(selectedHealth.scored)
    ? selectedHealth.scored.filter(r => r && r.status === 'SCORED').length
    : 0;
  const selectedQualifying = selectedHealth && typeof selectedHealth.qualifyingTotal === 'number'
    ? selectedHealth.qualifyingTotal
    : 0;
  const selectedSkippedBudget = selectedHealth && typeof selectedHealth.skippedBudget === 'number'
    ? selectedHealth.skippedBudget
    : 0;

  // Unresolved identities = (vulns with IDENTITY_NONE) + (selected rows
  // whose status is IDENTITY_UNRESOLVED). Combined because both are the
  // same identity-resolution signal (we don't know who's actually maintaining it).
  let unresolvedIdentities = 0;
  for (const v of vulnRows) {
    if (v?.repoHealthError === 'IDENTITY_NONE') unresolvedIdentities += 1;
  }
  if (selectedHealth && Array.isArray(selectedHealth.scored)) {
    for (const r of selectedHealth.scored) {
      if (r && r.status === 'IDENTITY_UNRESOLVED') unresolvedIdentities += 1;
    }
  }

  // ---- vulnerabilityExposure --------------------------------------------
  let critCount = 0;
  let highCount = 0;
  let medCount = 0;
  let lowCount = 0;
  for (const v of vulnRows) {
    const sev = normalizeSeverity(v?.severity);
    if (sev === 'CRITICAL') critCount += 1;
    else if (sev === 'HIGH') highCount += 1;
    else if (sev === 'MEDIUM') medCount += 1;
    else if (sev === 'LOW') lowCount += 1;
  }
  const advisoryCount = vulnRows.length;

  let vulnerabilityExposure;
  if (!hasVulnData) {
    vulnerabilityExposure = {
      band: 'UNKNOWN',
      because: 'Vulnerability data unavailable — cannot assess exposure.',
    };
  } else if (critCount + highCount > 0) {
    const parts = [];
    if (critCount > 0) parts.push(`${critCount} critical`);
    if (highCount > 0) parts.push(`${highCount} high`);
    const totalHighCrit = critCount + highCount;
    const advisoryWord = totalHighCrit === 1 ? 'advisory' : 'advisories';
    vulnerabilityExposure = {
      band: 'HIGH',
      because: `${parts.join(' and ')} ${advisoryWord} present.`,
    };
  } else if (medCount > 0) {
    vulnerabilityExposure = {
      band: 'ELEVATED',
      because: `${plural(medCount, 'medium-severity advisory', 'medium-severity advisories')} present, no high or critical.`,
    };
  } else if (lowCount > 0) {
    vulnerabilityExposure = {
      band: 'MODERATE',
      because: `Only low-severity advisories (${lowCount}) present.`,
    };
  } else {
    vulnerabilityExposure = {
      band: 'LOW',
      because: `No known advisories across ${vulnPkgNames.size === 0 ? 'the scanned dependencies' : plural(vulnPkgNames.size, 'package')}.`,
    };
  }

  // ---- remediationReadiness ---------------------------------------------
  let remediationReadiness;
  if (!hasVulnData) {
    remediationReadiness = {
      band: 'UNKNOWN',
      because: 'Vulnerability data unavailable — cannot assess remediation.',
    };
  } else if (advisoryCount === 0) {
    remediationReadiness = {
      band: 'LOW',
      because: 'No advisories to remediate.',
    };
  } else {
    let highCritNoFix = 0;
    let anyNoFix = 0;
    let allFixed = true;
    for (const v of vulnRows) {
      const sev = normalizeSeverity(v?.severity);
      if (!hasFix(v)) {
        allFixed = false;
        anyNoFix += 1;
        if (sev === 'HIGH' || sev === 'CRITICAL') highCritNoFix += 1;
      }
    }
    if (highCritNoFix > 0) {
      remediationReadiness = {
        band: 'HIGH',
        because: `${plural(highCritNoFix, 'high/critical advisory', 'high/critical advisories')} have no available fix.`,
      };
    } else if (!allFixed) {
      remediationReadiness = {
        band: 'ELEVATED',
        because: `${plural(anyNoFix, 'advisory', 'advisories')} lack a recorded fix, but none are high or critical.`,
      };
    } else {
      remediationReadiness = {
        band: 'LOW',
        because: advisoryCount === 1
          ? 'The 1 advisory has a fixed version.'
          : `All ${advisoryCount} advisories have fixed versions.`,
      };
    }
  }

  // ---- maintainerTrust --------------------------------------------------
  let maintainerTrust;
  if (!hasVulnData) {
    maintainerTrust = {
      band: 'UNKNOWN',
      because: 'Vulnerability data unavailable — cannot assess maintainer trust on vulnerable packages.',
    };
  } else if (advisoryCount === 0) {
    maintainerTrust = {
      band: 'LOW',
      because: 'No vulnerable dependencies to assess.',
    };
  } else {
    /** @type {{ pkg: string, verdict: string }|null} */
    let firstWeak = null;
    /** @type {string|null} */
    let firstErrPkg = null;
    let anyHealthErr = false;
    let allStrong = true;
    let anyHealthSeen = false;
    for (const v of vulnRows) {
      const pkg = typeof v?.package === 'string' ? v.package : '(unknown)';
      const verdict = v?.repoHealth?.verdict || null;
      const err = v?.repoHealthError || null;
      if (err) {
        anyHealthErr = true;
        if (!firstErrPkg) firstErrPkg = pkg;
        allStrong = false;
        continue;
      }
      if (verdict) {
        anyHealthSeen = true;
        if (WEAK_HEALTH.has(verdict)) {
          if (!firstWeak) firstWeak = { pkg, verdict };
          allStrong = false;
        } else if (!STRONG_HEALTH.has(verdict)) {
          // Defensive: unknown band string. Don't treat as strong.
          allStrong = false;
        }
      } else {
        // No verdict and no err — treat as unseen health, don't claim strong.
        allStrong = false;
      }
    }
    if (firstWeak) {
      maintainerTrust = {
        band: 'HIGH',
        because: `${firstWeak.pkg} is vulnerable and its source repo is ${firstWeak.verdict}.`,
      };
    } else if (anyHealthErr) {
      maintainerTrust = {
        band: 'ELEVATED',
        because: `Repo health unavailable for at least one vulnerable dependency (${firstErrPkg}).`,
      };
    } else if (anyHealthSeen && allStrong) {
      maintainerTrust = {
        band: 'LOW',
        because: vulnPkgNames.size === 1
          ? 'The 1 vulnerable dependency resolves to a healthy source repo.'
          : `All ${vulnPkgNames.size} vulnerable dependencies resolve to healthy source repos.`,
      };
    } else {
      // Have advisories but no usable repo-health verdicts. Don't claim LOW.
      maintainerTrust = {
        band: 'ELEVATED',
        because: 'Repo health not available for the vulnerable dependencies — trust cannot be confirmed.',
      };
    }
  }

  // ---- treeComplexity ---------------------------------------------------
  let treeComplexity;
  if (!totals || totalInstalled === 0) {
    treeComplexity = {
      band: 'UNKNOWN',
      because: 'Inventory unavailable — cannot assess tree complexity.',
    };
  } else {
    const directCount = typeof totals.directCount === 'number' ? totals.directCount : 0;
    const duplicateCount = typeof totals.duplicateCount === 'number' ? totals.duplicateCount : 0;
    const duplicateRatio = totalInstalled > 0 ? duplicateCount / totalInstalled : 0;
    const ratioPct = (duplicateRatio * 100).toFixed(1);
    // Thresholds re-baselined after P0-1: directCount is now the true
    // count from package.json's declared dep maps, not the flat-hoisted
    // count from npm v3's `node_modules/*` keys. Old bands assumed the
    // inflated number; new bands calibrate against the real number so
    // OpenSoyce (21 direct) lands LOW, mid-size Next.js apps (30-50)
    // land ELEVATED, and large monorepos (80+) land HIGH.
    const directWord = directCount === 1 ? 'direct dependency' : 'direct dependencies';
    const baseCopy = `${directCount} ${directWord}, ${ratioPct}% duplicate-version ratio.`;
    if (directCount <= 20 && duplicateRatio <= 0.05) {
      treeComplexity = { band: 'LOW', because: baseCopy };
    } else if (directCount <= 60 || duplicateRatio <= 0.10) {
      treeComplexity = { band: 'ELEVATED', because: baseCopy };
    } else {
      treeComplexity = { band: 'HIGH', because: baseCopy };
    }
  }

  // ---- identityResolution ----------------------------------------------
  let identityResolution;
  if (!inv && !hasVulnData) {
    identityResolution = {
      band: 'UNKNOWN',
      because: 'Inventory and vulnerability data both unavailable — could not assess identity resolution.',
    };
  } else if (unresolvedIdentities === 0) {
    identityResolution = {
      band: 'LOW',
      because: 'All scanned packages resolved to source repos.',
    };
  } else if (unresolvedIdentities <= 3) {
    identityResolution = {
      band: 'ELEVATED',
      because: `${plural(unresolvedIdentities, 'package')} could not be resolved to source repos.`,
    };
  } else {
    identityResolution = {
      band: 'HIGH',
      because: `${plural(unresolvedIdentities, 'package')} could not be resolved to source repos.`,
    };
  }

  return {
    dimensions: {
      vulnerabilityExposure,
      remediationReadiness,
      maintainerTrust,
      treeComplexity,
      identityResolution,
    },
    coverage: {
      totalInstalled,
      vulnerableCount: vulnPkgNames.size,
      vulnerableDirect,
      vulnerableTransitive,
      selectedScored,
      selectedQualifying,
      selectedSkippedBudget,
      unresolvedIdentities,
    },
  };
}
