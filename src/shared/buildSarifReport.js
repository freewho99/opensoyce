/**
 * SARIF 2.1.0 emitter for OpenSoyce scan results.
 *
 * Pure builder. No I/O. No fetches. No runtime validation against the
 * SARIF JSON Schema — the schema URL is for downstream IDE / Code Scanning
 * ingestion only. We hand-write the JSON so we don't take a new npm dep.
 *
 * Spec target: SARIF 2.1.0 (the version GitHub Code Scanning accepts).
 *   https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
 *
 * Constraints:
 *   - Every result MUST have a physicalLocation with a region. We don't
 *     have real line numbers from a lockfile, so we sentinel to startLine: 1.
 *   - Severity → SARIF level mapping is locked (see severityToSarifLevel).
 *   - Borrowed-trust mismatches (verified === false) emit an extra result
 *     under rule id `opensoyce.borrowed-trust-identity`.
 *   - Suppressions are applied at the result level — suppressed vulns are
 *     OMITTED from `results` and recorded in `run.properties.suppressions`.
 */

const SCHEMA_URI = 'https://schemastore.azurewebsites.net/schemas/json/sarif-2.1.0-rtm.6.json';
const TOOL_NAME = 'OpenSoyce';
const TOOL_VERSION = '0.1.0';
const TOOL_URI = 'https://www.opensoyce.com';
const HELP_URI = 'https://www.opensoyce.com/methodology';

const RULE_VULNERABLE_DEPENDENCY = 'opensoyce.vulnerable-dependency';
const RULE_BORROWED_TRUST = 'opensoyce.borrowed-trust-identity';

const SARIF_RULES = [
  {
    id: RULE_VULNERABLE_DEPENDENCY,
    name: 'VulnerableDependency',
    shortDescription: { text: 'Known vulnerable dependency in lockfile' },
    fullDescription: {
      text: 'OpenSoyce detected a dependency with one or more published security advisories in OSV.',
    },
    defaultConfiguration: { level: 'warning' },
    helpUri: HELP_URI,
  },
  {
    id: RULE_BORROWED_TRUST,
    name: 'BorrowedTrustIdentity',
    shortDescription: { text: 'Package source repo identity could not be verified' },
    fullDescription: {
      text: 'The npm/PyPI metadata for this vulnerable package points at a source repo whose package manifest names a different package. Soyce score may be inherited from an unrelated project.',
    },
    defaultConfiguration: { level: 'warning' },
    helpUri: HELP_URI,
  },
];

/**
 * Map an OSV-style severity string to a SARIF level.
 * Unknown / missing → 'warning' (NOT 'none' — 'none' means informational
 * pass; we want unknown advisories to remain visible).
 *
 * @param {unknown} sev
 * @returns {'error' | 'warning' | 'note'}
 */
function severityToSarifLevel(sev) {
  if (typeof sev !== 'string') return 'warning';
  const k = sev.toLowerCase();
  if (k === 'critical' || k === 'high') return 'error';
  if (k === 'medium' || k === 'moderate') return 'warning';
  if (k === 'low') return 'note';
  return 'warning';
}

/**
 * Pull the preferred advisory id for an OSV URL. Prefer GHSA (GitHub's
 * canonical advisory ID) since GitHub Code Scanning links it natively;
 * fall back to CVE, then any id.
 *
 * @param {string[]} ids
 * @returns {string | null}
 */
function pickPreferredAdvisoryId(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return null;
  const ghsa = ids.find(id => typeof id === 'string' && id.startsWith('GHSA-'));
  if (ghsa) return ghsa;
  const cve = ids.find(id => typeof id === 'string' && id.startsWith('CVE-'));
  if (cve) return cve;
  return typeof ids[0] === 'string' ? ids[0] : null;
}

/**
 * Construct an OSV URL from an advisory id. OSV redirects CVE-* and GHSA-*
 * to their canonical advisory pages.
 *
 * @param {string | null} id
 * @returns {string | null}
 */
function osvUrlFor(id) {
  if (!id || typeof id !== 'string') return null;
  return `https://osv.dev/vulnerability/${id}`;
}

/**
 * Convert a single vuln row into the main SARIF result.
 *
 * @param {any} v
 * @returns {object}
 */
function buildMainResult(v) {
  const pkg = typeof v?.package === 'string' ? v.package : '';
  const version = typeof v?.version === 'string' ? v.version : '';
  const severity = typeof v?.severity === 'string' ? v.severity : 'unknown';
  const preferredId = pickPreferredAdvisoryId(v?.ids);
  const summary = typeof v?.summary === 'string' && v.summary
    ? v.summary
    : (preferredId || 'unspecified advisory');
  const messageParts = [];
  if (pkg) messageParts.push(version ? `${pkg}@${version}` : pkg);
  if (summary) messageParts.push(summary);
  if (preferredId && !summary.includes(preferredId)) messageParts.push(`(${preferredId})`);

  return {
    ruleId: RULE_VULNERABLE_DEPENDENCY,
    level: severityToSarifLevel(severity),
    message: { text: messageParts.join(': ') || 'vulnerable dependency' },
    locations: [{
      physicalLocation: {
        artifactLocation: { uri: 'package-lock.json' },
        // GitHub Code Scanning rejects results without a physical region.
        // Lockfile-level findings have no real line; sentinel to 1.
        region: { startLine: 1 },
      },
      logicalLocations: [{
        name: pkg,
        fullyQualifiedName: pkg && version ? `npm:${pkg}@${version}` : `npm:${pkg}`,
      }],
    }],
    properties: {
      severity: severity || null,
      fixedIn: typeof v?.fixedIn === 'string' ? v.fixedIn : null,
      advisoryIds: Array.isArray(v?.ids) ? v.ids.slice() : [],
      resolvedRepo: typeof v?.resolvedRepo === 'string' ? v.resolvedRepo : null,
      soyceScore: typeof v?.repoHealth?.soyceScore === 'number' ? v.repoHealth.soyceScore : null,
      verdict: typeof v?.repoHealth?.verdict === 'string' ? v.repoHealth.verdict : null,
      identityVerified: v?.verified === true ? true
        : v?.verified === false ? false
        : 'unverified',
      osvUrl: osvUrlFor(preferredId),
    },
  };
}

/**
 * If the vuln has a verified === false signal (borrowed-trust mismatch),
 * emit a secondary result so the mismatch is visible as its own
 * Code-Scanning row.
 *
 * @param {any} v
 * @returns {object | null}
 */
function buildBorrowedTrustResult(v) {
  if (v?.verified !== false) return null;
  const pkg = typeof v?.package === 'string' ? v.package : '';
  const version = typeof v?.version === 'string' ? v.version : '';
  const repo = typeof v?.resolvedRepo === 'string' ? v.resolvedRepo : 'unknown repo';
  const reason = typeof v?.mismatchReason === 'string' && v.mismatchReason
    ? v.mismatchReason
    : 'package_name_mismatch';
  const head = pkg ? (version ? `${pkg}@${version}` : pkg) : 'package';
  return {
    ruleId: RULE_BORROWED_TRUST,
    level: 'warning',
    message: {
      text: `${head}: source repo ${repo} package manifest names a different package (${reason}). Soyce score may be inherited.`,
    },
    locations: [{
      physicalLocation: {
        artifactLocation: { uri: 'package-lock.json' },
        region: { startLine: 1 },
      },
      logicalLocations: [{
        name: pkg,
        fullyQualifiedName: pkg && version ? `npm:${pkg}@${version}` : `npm:${pkg}`,
      }],
    }],
    properties: {
      resolvedRepo: repo,
      mismatchReason: reason,
      identityVerified: false,
    },
  };
}

/**
 * Build a SARIF 2.1.0 document for a scan result. Pure function.
 *
 * @param {{
 *   scanResult: { vulnerabilities?: any[] | null, scannedAt?: string },
 *   summary?: any,
 *   profile?: any,
 *   suppressions?: Array<{ vuln: any, rule: { kind: string, value: string, comment?: string } }>,
 * }} args
 * @returns {object} SARIF 2.1.0 JSON
 */
export function buildSarifReport({ scanResult, summary, profile, suppressions } = {}) {
  const vulns = Array.isArray(scanResult?.vulnerabilities) ? scanResult.vulnerabilities : [];
  const results = [];
  for (const v of vulns) {
    results.push(buildMainResult(v));
    const borrowed = buildBorrowedTrustResult(v);
    if (borrowed) results.push(borrowed);
  }

  /** @type {any} */
  const run = {
    tool: {
      driver: {
        name: TOOL_NAME,
        informationUri: TOOL_URI,
        version: TOOL_VERSION,
        rules: SARIF_RULES.map(r => ({ ...r })),
      },
    },
    results,
  };

  const runProps = {};
  if (Array.isArray(suppressions) && suppressions.length > 0) {
    runProps.suppressions = suppressions.map(s => {
      const v = s?.vuln || {};
      return {
        package: typeof v.package === 'string' ? v.package : null,
        version: typeof v.version === 'string' ? v.version : null,
        advisoryIds: Array.isArray(v.ids) ? v.ids.slice() : [],
        rule: {
          kind: s?.rule?.kind || null,
          value: s?.rule?.value || null,
          comment: s?.rule?.comment || null,
        },
      };
    });
  }
  if (summary && typeof summary === 'object' && summary.label) {
    runProps.decision = {
      label: summary.label,
      reason: summary.labelReason || null,
    };
  }
  if (profile && typeof profile === 'object' && profile.dimensions) {
    runProps.riskProfile = { dimensions: profile.dimensions, coverage: profile.coverage };
  }
  if (typeof scanResult?.scannedAt === 'string' && scanResult.scannedAt) {
    runProps.scannedAt = scanResult.scannedAt;
  }
  if (Object.keys(runProps).length > 0) {
    run.properties = runProps;
  }

  return {
    version: '2.1.0',
    $schema: SCHEMA_URI,
    runs: [run],
  };
}

export const __internal = {
  severityToSarifLevel,
  pickPreferredAdvisoryId,
  osvUrlFor,
  SARIF_RULES,
  SCHEMA_URI,
};
