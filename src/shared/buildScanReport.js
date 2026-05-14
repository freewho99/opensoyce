/**
 * Scanner v3d — Shareable Risk Report builders.
 *
 * Two pure builders that turn the existing v2.1b summary + v3c risk profile
 * + raw scan response into portable artifacts. No new analysis. No I/O. No
 * React. No fetches. Deterministic.
 *
 * Honesty constraints (locked, regex-enforceable):
 *   - Phrase "known vulnerabilities" — never "all vulnerabilities".
 *   - Coverage sentence must read: "Selected dependency health scored X of Y
 *     installed dependencies."
 *   - Never imply whole-tree Soyce scoring. The phrase "scored the whole
 *     tree" must never appear.
 *   - Markdown never includes the raw dependency inventory. JSON may.
 */

/** @typedef {'CLEAN'|'PATCH_AVAILABLE'|'REVIEW_REQUIRED'|'VERIFY_LATER'} DecisionLabel */

const DIMENSION_ORDER = /** @type {const} */ ([
  'vulnerabilityExposure',
  'remediationReadiness',
  'maintainerTrust',
  'treeComplexity',
  'transparency',
]);

const DIMENSION_LABEL = {
  vulnerabilityExposure: 'Vulnerability Exposure',
  remediationReadiness: 'Remediation Readiness',
  maintainerTrust: 'Maintainer Trust',
  treeComplexity: 'Tree Complexity',
  transparency: 'Transparency',
};

const LABEL_DISPLAY = {
  CLEAN: 'CLEAN',
  PATCH_AVAILABLE: 'PATCH AVAILABLE',
  REVIEW_REQUIRED: 'REVIEW REQUIRED',
  VERIFY_LATER: 'VERIFY LATER',
};

/** @param {unknown} sev */
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
 * Pull out the first vulnerable-package name on a weak-health repo (for the
 * REVIEW_REQUIRED + maintainerTrust HIGH mapping). Deterministic: scans rows
 * in input order, returns the first match.
 * @param {any[]} vulns
 * @returns {string|null}
 */
function firstWeakHealthPkg(vulns) {
  const WEAK = new Set(['WATCHLIST', 'RISKY', 'STALE']);
  for (const v of vulns) {
    const verdict = v?.repoHealth?.verdict;
    if (verdict && WEAK.has(verdict)) {
      return typeof v.package === 'string' ? v.package : null;
    }
  }
  return null;
}

/** @param {any[]} vulns */
function countNoFixHighCrit(vulns) {
  let n = 0;
  for (const v of vulns) {
    const sev = normalizeSeverity(v?.severity);
    if ((sev === 'HIGH' || sev === 'CRITICAL') && !hasFix(v)) n += 1;
  }
  return n;
}

/**
 * Severity buckets (only with count > 0) joined as "2 HIGH, 1 MEDIUM".
 * @param {Record<string, number>} bySeverity
 */
function severityBreakdownLine(bySeverity) {
  const order = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'];
  const parts = [];
  for (const k of order) {
    const n = bySeverity?.[k] || 0;
    if (n > 0) parts.push(`${n} ${k}`);
  }
  return parts.join(', ');
}

/**
 * Total selected-rows scored unavailable (status === 'SCORE_UNAVAILABLE')
 * + vuln rows whose repoHealthError === 'ANALYSIS_FAILED'. These both
 * represent "we tried and couldn't" — a single user-facing count.
 * @param {any[]} vulns
 * @param {any} selectedHealth
 */
function countScoreUnavailable(vulns, selectedHealth) {
  let n = 0;
  for (const v of vulns) {
    if (v?.repoHealthError === 'ANALYSIS_FAILED') n += 1;
  }
  if (selectedHealth && Array.isArray(selectedHealth.scored)) {
    for (const r of selectedHealth.scored) {
      if (r && r.status === 'SCORE_UNAVAILABLE') n += 1;
    }
  }
  return n;
}

/**
 * Count "true scored" selected rows (status === 'SCORED'). Mirrors the
 * coverage math in computeRiskProfile so the coverage sentence in the report
 * matches what the panel shows.
 * @param {any} selectedHealth
 */
function countSelectedScored(selectedHealth) {
  if (!selectedHealth || !Array.isArray(selectedHealth.scored)) return 0;
  return selectedHealth.scored.filter(r => r && r.status === 'SCORED').length;
}

/**
 * Build the deterministic "Recommended next action" sentence per the locked
 * mapping. Returns null if no mapping fires (caller omits the section).
 *
 * @param {any} summary  v2.1b summarizeScan() result
 * @param {any} profile  v3c computeRiskProfile() result
 * @param {any[]} vulns
 * @returns {string|null}
 */
function recommendedAction(summary, profile, vulns) {
  const label = summary?.label;
  if (!label) return null;
  const rows = Array.isArray(vulns) ? vulns : [];

  if (label === 'CLEAN') {
    return 'No known vulnerabilities found. Re-scan after dependency upgrades.';
  }
  if (label === 'PATCH_AVAILABLE') {
    return 'Upgrade the listed packages to their fixed versions.';
  }
  if (label === 'VERIFY_LATER') {
    // Count unresolved + score-unavailable; that's "could not be assessed."
    const coverage = profile?.coverage || {};
    const unresolved = coverage.unresolvedIdentities || 0;
    const unavailable = countScoreUnavailable(rows, null); // vuln-side only
    const n = unresolved + unavailable;
    if (n > 0) {
      return `Re-run when analysis is available — ${n} package(s) could not be assessed.`;
    }
    return 'Re-run when analysis is available — some packages could not be assessed.';
  }
  if (label === 'REVIEW_REQUIRED') {
    const mt = profile?.dimensions?.maintainerTrust?.band;
    const rr = profile?.dimensions?.remediationReadiness?.band;
    if (mt === 'HIGH') {
      const pkg = firstWeakHealthPkg(rows) || 'a vulnerable package';
      return `Patch vulnerable dependencies first; reassess ${pkg} given its source repo health.`;
    }
    if (rr === 'HIGH') {
      const n = countNoFixHighCrit(rows);
      return `No fix available for ${n} high/critical advisory(ies) — escalate or wait for upstream patch.`;
    }
    return 'Manual review needed for the listed advisories before merging.';
  }
  return null;
}

/**
 * Build the optional "Uncertainty" section bullets. Returns an empty array
 * when nothing is missing; caller omits the section if empty.
 *
 * @param {any[]} vulns
 * @param {any} inventory
 * @param {any} selectedHealth
 * @param {any} profile
 * @returns {string[]}
 */
function uncertaintyBullets(vulns, inventory, selectedHealth, profile) {
  const out = [];
  const vulnRows = Array.isArray(vulns) ? vulns : [];

  // OSV gap: vulnerabilities === null means the call failed.
  if (vulns == null) {
    out.push('OSV vulnerability data was unavailable for this scan.');
  }

  // Inventory gap.
  if (!inventory) {
    out.push('Dependency inventory was unavailable — direct/transitive split not computable.');
  }

  // GitHub / repo-health analysis gaps on vulnerable rows.
  let analysisFailed = 0;
  let identityNone = 0;
  for (const v of vulnRows) {
    if (v?.repoHealthError === 'ANALYSIS_FAILED') analysisFailed += 1;
    if (v?.repoHealthError === 'IDENTITY_NONE') identityNone += 1;
  }
  if (analysisFailed > 0) {
    out.push(`Repo health analysis failed for ${analysisFailed} vulnerable package(s).`);
  }
  if (identityNone > 0) {
    out.push(`${identityNone} vulnerable package(s) could not be linked to a source repo.`);
  }

  // Selected-health gaps.
  if (selectedHealth && Array.isArray(selectedHealth.scored)) {
    let selUnresolved = 0;
    let selUnavailable = 0;
    for (const r of selectedHealth.scored) {
      if (r?.status === 'IDENTITY_UNRESOLVED') selUnresolved += 1;
      if (r?.status === 'SCORE_UNAVAILABLE') selUnavailable += 1;
    }
    if (selUnresolved > 0) {
      out.push(`${selUnresolved} selected dependency(ies) had no resolvable source repo.`);
    }
    if (selUnavailable > 0) {
      out.push(`${selUnavailable} selected dependency(ies) had no available health score.`);
    }
    if (typeof selectedHealth.skippedBudget === 'number' && selectedHealth.skippedBudget > 0) {
      out.push(`${selectedHealth.skippedBudget} qualifying dependency(ies) were skipped by the scoring budget.`);
    }
  }

  // Coverage cross-check: if profile.coverage.unresolvedIdentities > 0 and
  // we haven't already mentioned it via the two paths above, surface it.
  void profile; // currently derived from upstream signals; kept for future use

  return out;
}

/**
 * Build the markdown report.
 *
 * @param {{
 *   summary: any,
 *   profile: any,
 *   vulnerabilities: any[]|null|undefined,
 *   inventory: any|null|undefined,
 *   selectedHealth: any|null|undefined,
 *   scannedAt?: string,
 * }} args
 * @returns {string}
 */
export function buildMarkdownReport({
  summary,
  profile,
  vulnerabilities,
  inventory,
  selectedHealth,
  scannedAt,
} = {}) {
  const vulns = Array.isArray(vulnerabilities) ? vulnerabilities : [];
  const lines = [];

  lines.push('## OpenSoyce Dependency Risk Profile');
  lines.push('');

  // Decision line — only if we have both a label and a reason.
  if (summary && summary.label) {
    const labelDisplay = LABEL_DISPLAY[summary.label] || summary.label;
    const reason = typeof summary.labelReason === 'string' && summary.labelReason
      ? summary.labelReason
      : '';
    if (reason) {
      lines.push(`**Decision:** ${labelDisplay} — ${reason}`);
    } else {
      lines.push(`**Decision:** ${labelDisplay}`);
    }
    lines.push('');
  }

  // Risk profile dimensions.
  if (profile && profile.dimensions) {
    lines.push('### Risk Profile');
    for (const key of DIMENSION_ORDER) {
      const dim = profile.dimensions[key];
      if (!dim) continue;
      lines.push(`- ${DIMENSION_LABEL[key]}: ${dim.band} — ${dim.because}`);
    }
    lines.push('');
  }

  // Evidence section.
  lines.push('### Evidence');
  const bySev = summary?.totals?.bySeverity || { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 };
  const fixAvailable = summary?.totals?.fixAvailable || 0;
  const fixUnavailable = summary?.totals?.fixUnavailable || 0;
  const advisoryCount = summary?.totals?.advisories ?? vulns.length;
  lines.push(`- Known vulnerabilities: ${advisoryCount} (${fixAvailable} with fix available, ${fixUnavailable} without)`);
  const sevLine = severityBreakdownLine(bySev);
  if (sevLine) lines.push(`- Severity breakdown: ${sevLine}`);
  const coverage = profile?.coverage || {};
  const vulnerableCount = coverage.vulnerableCount ?? summary?.totals?.vulnerablePackages ?? 0;
  const vulnerableDirect = coverage.vulnerableDirect || 0;
  const vulnerableTransitive = coverage.vulnerableTransitive || 0;
  lines.push(`- Vulnerable dependencies: ${vulnerableCount} (${vulnerableDirect} direct, ${vulnerableTransitive} transitive)`);
  // Coverage sentence — math: SCORED rows only over inventory totalPackages.
  const selectedScored = countSelectedScored(selectedHealth);
  const totalInstalled = inventory?.totals?.totalPackages
    ?? coverage.totalInstalled
    ?? 0;
  lines.push(`- Selected dependency health scored ${selectedScored} of ${totalInstalled} installed dependencies.`);
  lines.push(`- Unresolved source identities: ${coverage.unresolvedIdentities || 0}`);
  lines.push(`- Score unavailable: ${countScoreUnavailable(vulns, selectedHealth)}`);
  lines.push('');

  // Uncertainty (omitted if empty).
  const uncertainty = uncertaintyBullets(vulnerabilities, inventory, selectedHealth, profile);
  if (uncertainty.length > 0) {
    lines.push('### Uncertainty');
    for (const u of uncertainty) lines.push(`- ${u}`);
    lines.push('');
  }

  // Recommended next action (omitted if no mapping fires).
  const action = recommendedAction(summary, profile, vulns);
  if (action) {
    lines.push('### Recommended next action');
    lines.push(action);
    lines.push('');
  }

  // Footer.
  lines.push('---');
  const ts = typeof scannedAt === 'string' && scannedAt
    ? scannedAt
    : new Date().toISOString();
  lines.push(`Generated by OpenSoyce at ${ts}.`);

  return lines.join('\n');
}

/**
 * Build the JSON report.
 *
 * @param {{
 *   summary: any,
 *   profile: any,
 *   vulnerabilities: any[]|null|undefined,
 *   inventory: any|null|undefined,
 *   selectedHealth: any|null|undefined,
 *   scannedAt?: string,
 * }} args
 */
export function buildJsonReport({
  summary,
  profile,
  vulnerabilities,
  inventory,
  selectedHealth,
  scannedAt,
} = {}) {
  const vulns = Array.isArray(vulnerabilities) ? vulnerabilities : [];
  const bySev = summary?.totals?.bySeverity || {
    CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0,
  };
  const coverage = profile?.coverage || {};
  const selectedScored = countSelectedScored(selectedHealth);
  const selectedQualifying = typeof selectedHealth?.qualifyingTotal === 'number'
    ? selectedHealth.qualifyingTotal
    : 0;
  const selectedSkippedBudget = typeof selectedHealth?.skippedBudget === 'number'
    ? selectedHealth.skippedBudget
    : 0;
  const totalInstalled = inventory?.totals?.totalPackages
    ?? coverage.totalInstalled
    ?? 0;
  const uncertainty = uncertaintyBullets(vulnerabilities, inventory, selectedHealth, profile);

  /** @type {any} */
  const out = {
    schemaVersion: 1,
    scannedAt: typeof scannedAt === 'string' && scannedAt
      ? scannedAt
      : new Date().toISOString(),
    decision: {
      label: summary?.label || null,
      reason: summary?.labelReason || null,
    },
    riskProfile: profile && typeof profile === 'object'
      ? { dimensions: profile.dimensions, coverage: profile.coverage }
      : null,
    totals: {
      knownVulnerabilities: summary?.totals?.advisories ?? vulns.length,
      vulnerablePackages: summary?.totals?.vulnerablePackages
        ?? coverage.vulnerableCount
        ?? 0,
      vulnerableDirect: coverage.vulnerableDirect || 0,
      vulnerableTransitive: coverage.vulnerableTransitive || 0,
      fixAvailable: summary?.totals?.fixAvailable || 0,
      fixUnavailable: summary?.totals?.fixUnavailable || 0,
      severityBreakdown: {
        CRITICAL: bySev.CRITICAL || 0,
        HIGH: bySev.HIGH || 0,
        MEDIUM: bySev.MEDIUM || 0,
        LOW: bySev.LOW || 0,
        UNKNOWN: bySev.UNKNOWN || 0,
      },
      selectedScored,
      selectedQualifying,
      selectedSkippedBudget,
      unresolvedIdentities: coverage.unresolvedIdentities || 0,
      scoreUnavailable: countScoreUnavailable(vulns, selectedHealth),
      totalInstalled,
    },
    uncertainty,
    recommendedAction: recommendedAction(summary, profile, vulns),
    inventory: null,
  };

  if (inventory && typeof inventory === 'object') {
    // Structured inventory is allowed in JSON output. We project only the
    // fields a downstream consumer plausibly needs — no raw lockfile blob.
    const packages = Array.isArray(inventory.packages)
      ? inventory.packages.map(p => ({
        name: p?.name,
        versions: Array.isArray(p?.versions) ? p.versions : [],
        direct: !!p?.direct,
        scope: p?.scope || 'unknown',
        hasLicense: !!p?.hasLicense,
        hasRepository: !!p?.hasRepository,
      }))
      : [];
    out.inventory = {
      format: inventory.format || 'unknown',
      totals: inventory.totals || {},
      packages,
    };
  }

  return out;
}
