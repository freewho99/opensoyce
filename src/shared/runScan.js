/**
 * Scanner pipeline — shared by Express (server.ts), Vercel (api/scan.js), and
 * the CLI (scripts/opensoyce-scan-report.mjs). Single source of truth so the
 * three runtimes never drift again (v3b shipped a SCORED-count lie because
 * server.ts and api/scan.js drifted; we are not adding a fourth copy).
 *
 * Runtime services are injected via `deps`:
 *   - getAnalysis(owner, repo): repo health analyzer. The caller decides the
 *     cache strategy (Express keeps a 5min LRU, Vercel uses a per-request memo,
 *     CLI uses a per-run Map). runScan does not know or care.
 *   - resolveIdentity(name, opts): npm registry → GitHub owner/repo identity.
 *     Typically a thin wrapper over resolveDepIdentity.
 *   - mapWithConcurrency(items, limit, fn): bounded concurrency helper that
 *     captures per-item errors as `{ ok, value | error }` results. We accept
 *     this as a dep so each runtime can use the version it already had —
 *     identical implementations, but no need to copy bytes into shared/.
 *
 * Behavior preserved from server.ts / api/scan.js:
 *   - Lockfile size cap (5MB) is enforced by the route, NOT here.
 *   - OSV unavailable → osvError: true, vulnerabilities: [], continue.
 *     runScan only throws when the entire scan is unusable (UPSTREAM_ERROR /
 *     RATE_LIMIT_HIT bubbled from getAnalysis would land here if they were
 *     not caught per-row; today they ARE caught per-row, so runScan does not
 *     throw on those either).
 *   - Per-vuln identity-resolver failure isolated (resolvedRepo: null,
 *     confidence: 'NONE', source: null).
 *   - Per-vuln repo-health failure isolated as `repoHealthError`:
 *     'IDENTITY_NONE' for non-resolved, 'ANALYSIS_FAILED' for upstream errors.
 *   - Inventory build failure → inventoryError: 'INVENTORY_FAILED',
 *     inventory: null. Scan still returns.
 *   - Selected health failure → selectedHealthError: 'SELECTED_HEALTH_FAILED',
 *     selectedHealth: null. Scan still returns.
 *   - Vulnerabilities sorted by severity (critical→high→medium→low→unknown),
 *     then alphabetical.
 */

import {
  parseLockfile,
  queryOsvBatch,
  detectLockfileFormat,
  ecosystemForFormat,
  buildInventory,
} from './scanLockfile.js';
import { selectHealthCandidates } from './selectHealthCandidates.js';
import { verdictFor } from './verdict.js';

// Severity tiering for response sort. Lower index = higher severity.
// Duplicated only as a tiny lookup constant (intentional — it's 6 tokens,
// not pipeline code, and lifting it to a shared module would obscure the
// "this controls the response order of vulns" intent at the call sites).
const SCAN_SEVERITY_ORDER = ['critical', 'high', 'medium', 'moderate', 'low', 'unknown'];
function scanSeverityRank(sev) {
  const key = (sev || 'unknown').toLowerCase();
  const normalized = key === 'moderate' ? 'medium' : key;
  const idx = SCAN_SEVERITY_ORDER.indexOf(normalized);
  return idx === -1 ? SCAN_SEVERITY_ORDER.length : idx;
}
function sortScanVulnerabilities(vulns) {
  return [...vulns].sort((a, b) => {
    const sa = scanSeverityRank(a.severity);
    const sb = scanSeverityRank(b.severity);
    if (sa !== sb) return sa - sb;
    const na = (a.package || a.name || '').toLowerCase();
    const nb = (b.package || b.name || '').toLowerCase();
    return na.localeCompare(nb);
  });
}

function splitOwnerRepo(slug) {
  if (typeof slug !== 'string') return null;
  const parts = slug.split('/');
  if (parts.length !== 2) return null;
  const [owner, repo] = parts;
  if (!owner || !repo) return null;
  return { owner, repo };
}

/**
 * Resolve GitHub identity for each vulnerable package. Skipping non-vulnerable
 * packages keeps npm-registry traffic minimal. Failures default to NONE.
 */
async function attachIdentitiesToVulnerabilities(vulns, resolveIdentity, ecosystem) {
  if (!Array.isArray(vulns) || vulns.length === 0) return vulns || [];
  const results = await Promise.allSettled(
    vulns.map(v => resolveIdentity(v.package, { version: v.version, ecosystem })),
  );
  return vulns.map((v, i) => {
    const r = results[i];
    if (r.status === 'fulfilled' && r.value) {
      const ident = r.value;
      const merged = {
        ...v,
        resolvedRepo: ident.resolvedRepo,
        confidence: ident.confidence,
        source: ident.source,
        // Borrowed-trust signal from the resolver (P0-AI-2). When the npm
        // registry pointed at a GitHub repo whose package.json names a
        // different package, `verified` is false and `mismatchReason` is set.
        verified: ident.verified ?? 'unverified',
      };
      if (ident.directory) merged.directory = ident.directory;
      if (ident.mismatchReason) merged.mismatchReason = ident.mismatchReason;
      return merged;
    }
    return { ...v, resolvedRepo: null, confidence: 'NONE', source: null, verified: 'unverified' };
  });
}

/**
 * Attach Soyce score + verdict + signals to each HIGH/MEDIUM resolved vuln.
 * Per-vuln errors land in `repoHealthError` so a failing analysis can never
 * fail the whole scan. Bounded concurrency (5) keeps GitHub fan-out predictable.
 */
async function attachRepoHealthToVulnerabilities(vulns, getAnalysis, mapWithConcurrency) {
  const enriched = vulns.map(v => ({ ...v, repoHealth: null, repoHealthError: null }));
  const eligible = [];

  enriched.forEach((v, idx) => {
    const isResolved = (v.confidence === 'HIGH' || v.confidence === 'MEDIUM') && !!v.resolvedRepo;
    if (!isResolved) {
      v.repoHealthError = 'IDENTITY_NONE';
      return;
    }
    const parts = splitOwnerRepo(v.resolvedRepo);
    if (!parts) {
      v.repoHealthError = 'IDENTITY_NONE';
      return;
    }
    eligible.push({ idx, owner: parts.owner, repo: parts.repo });
  });

  const outcomes = await mapWithConcurrency(eligible, 5, ({ owner, repo }) => getAnalysis(owner, repo));

  eligible.forEach((target, i) => {
    const outcome = outcomes[i];
    const v = enriched[target.idx];
    if (!outcome.ok) {
      v.repoHealthError = 'ANALYSIS_FAILED';
      return;
    }
    const data = outcome.value;
    if (!data || typeof data.total !== 'number' || !data.breakdown) {
      v.repoHealthError = 'ANALYSIS_FAILED';
      return;
    }
    const advisorySummary = (data.meta && data.meta.advisories) || null;
    const maintainerConcentration = data.maintainerConcentration || null;
    const vendorSdk = data.vendorSdk || null;
    v.repoHealth = {
      soyceScore: data.total,
      verdict: verdictFor(data.total, {
        earlyBreakout: false,
        advisorySummary,
        maintainerConcentration,
        vendorSdkMatch: !!vendorSdk,
      }),
      signals: {
        maintenance: data.breakdown.maintenance ?? 0,
        security: data.breakdown.security ?? 0,
        activity: data.breakdown.activity ?? 0,
      },
      advisorySummary,
      maintainerConcentration,
      vendorSdk,
      // Fork-velocity-of-namesake v0 — informational; never affects score
      // or verdict. Null when no migration detected (the common case).
      migration: data.migration || null,
    };
    v.repoHealthError = null;
  });

  return enriched;
}

/**
 * Scanner v3b — selective dependency health scoring. Picks up to 25
 * non-vulnerable inventory packages, resolves identity, then (HIGH/MEDIUM
 * only) attaches Soyce score + verdict + signals via the injected getAnalysis.
 * Per-row try/catch keeps a single bad analysis from poisoning the response.
 *
 * "unknown is not a verdict": unresolved identity emits
 * status:'IDENTITY_UNRESOLVED' with soyceScore null — no negative score is
 * computed.
 */
async function selectAndScoreHealth(inventory, vulnerablePackageNames, getAnalysis, resolveIdentity, mapWithConcurrency, ecosystem) {
  const BUDGET = 25;
  const { selected, skippedBudget, qualifyingTotal } = selectHealthCandidates({
    inventory,
    vulnerablePackageNames,
    budget: BUDGET,
  });

  const outcomes = await mapWithConcurrency(selected, 5, async (cand) => {
    const ident = await resolveIdentity(cand.package, { version: cand.version, ecosystem });
    const resolvedRepo = ident && ident.resolvedRepo ? ident.resolvedRepo : null;
    const confidence = ident && (ident.confidence === 'HIGH' || ident.confidence === 'MEDIUM')
      ? ident.confidence
      : 'NONE';
    if (!resolvedRepo || confidence === 'NONE') {
      return { resolvedRepo: null, confidence: 'NONE', analysis: null, analysisFailed: false };
    }
    const parts = splitOwnerRepo(resolvedRepo);
    if (!parts) {
      return { resolvedRepo: null, confidence: 'NONE', analysis: null, analysisFailed: false };
    }
    try {
      const data = await getAnalysis(parts.owner, parts.repo);
      return { resolvedRepo, confidence, analysis: data, analysisFailed: !data };
    } catch {
      return { resolvedRepo, confidence, analysis: null, analysisFailed: true };
    }
  });

  const scored = selected.map((cand, i) => {
    const row = {
      package: cand.package,
      version: cand.version,
      direct: cand.direct,
      scope: cand.scope,
      primaryReason: cand.primaryReason,
      secondaryReasons: cand.secondaryReasons,
      resolvedRepo: null,
      confidence: 'NONE',
      soyceScore: null,
      verdict: null,
      signals: null,
      status: 'IDENTITY_UNRESOLVED',
    };
    const outcome = outcomes[i];
    if (!outcome || !outcome.ok) {
      row.status = 'SCORE_UNAVAILABLE';
      return row;
    }
    const v = outcome.value;
    row.resolvedRepo = v.resolvedRepo;
    row.confidence = v.confidence;
    if (!v.resolvedRepo || v.confidence === 'NONE') {
      row.status = 'IDENTITY_UNRESOLVED';
      return row;
    }
    if (v.analysisFailed || !v.analysis || typeof v.analysis.total !== 'number' || !v.analysis.breakdown) {
      row.status = 'SCORE_UNAVAILABLE';
      return row;
    }
    const advisorySummary = (v.analysis.meta && v.analysis.meta.advisories) || null;
    const maintainerConcentration = v.analysis.maintainerConcentration || null;
    const vendorSdk = v.analysis.vendorSdk || null;
    row.soyceScore = v.analysis.total;
    row.verdict = verdictFor(v.analysis.total, {
      earlyBreakout: false,
      advisorySummary,
      maintainerConcentration,
      vendorSdkMatch: !!vendorSdk,
    });
    row.signals = {
      maintenance: v.analysis.breakdown.maintenance ?? 0,
      security: v.analysis.breakdown.security ?? 0,
      activity: v.analysis.breakdown.activity ?? 0,
    };
    row.advisorySummary = advisorySummary;
    row.maintainerConcentration = maintainerConcentration;
    row.vendorSdk = vendorSdk;
    // Fork-velocity-of-namesake v0 — same shape on v3b selected health rows.
    row.migration = v.analysis.migration || null;
    row.status = 'SCORED';
    return row;
  });

  return { scored, skippedBudget, qualifyingTotal, budget: BUDGET };
}

/**
 * Tagged route-level errors. The route handlers catch these by name and
 * choose HTTP status codes; runScan only emits them when the entire scan
 * is unusable (currently: lockfile format rejected). OSV / GitHub failures
 * are surfaced as in-payload error markers (osvError, repoHealthError, etc.).
 */
function taggedScanError(code) {
  const e = new Error(code);
  e.code = code;
  e.scanError = true;
  return e;
}

/**
 * Runs the full scan pipeline.
 *
 * @param {object} params
 * @param {string} params.lockfileText - raw lockfile contents
 * @param {string} [params.filename] - hint for parser format detection
 * @param {object} params.deps
 * @param {(owner: string, repo: string) => Promise<any>} params.deps.getAnalysis
 * @param {(name: string, opts?: { version?: string }) => Promise<any>} params.deps.resolveIdentity
 * @param {(items: any[], limit: number, fn: (item: any, idx: number) => Promise<any>) => Promise<any[]>} params.deps.mapWithConcurrency
 * @param {typeof fetch} [params.deps.fetchImpl] - optional, used for OSV in tests
 * @returns {Promise<{
 *   totalDeps: number,
 *   directDeps: number,
 *   vulnerabilities: any[],
 *   scannedAt: string,
 *   cacheHit: false,
 *   inventory: any|null,
 *   selectedHealth: any|null,
 *   inventoryError?: string,
 *   selectedHealthError?: string,
 *   osvError?: boolean,
 * }>}
 */
export async function runScan({ lockfileText, filename, deps } = {}) {
  if (!deps || typeof deps !== 'object') {
    throw new Error('runScan: deps is required');
  }
  const { getAnalysis, resolveIdentity, mapWithConcurrency, fetchImpl } = deps;
  if (typeof getAnalysis !== 'function') throw new Error('runScan: deps.getAnalysis required');
  if (typeof resolveIdentity !== 'function') throw new Error('runScan: deps.resolveIdentity required');
  if (typeof mapWithConcurrency !== 'function') throw new Error('runScan: deps.mapWithConcurrency required');
  if (typeof lockfileText !== 'string') {
    throw taggedScanError('UNPARSEABLE_LOCKFILE');
  }
  void filename; // reserved for future per-format dispatch; today format is auto-detected

  // Format gate. These are the same throw-codes the routes used to emit.
  const format = detectLockfileFormat(lockfileText);
  if (format === 'package-json') throw taggedScanError('PACKAGE_JSON_NOT_SUPPORTED');
  if (format === 'yarn-v1' || format === 'yarn-v2') throw taggedScanError('YARN_COMING_SOON');
  if (format === 'unknown' || format == null) throw taggedScanError('UNPARSEABLE_LOCKFILE');

  const ecosystem = ecosystemForFormat(format);

  let parsed;
  try {
    parsed = parseLockfile(lockfileText);
  } catch {
    throw taggedScanError('UNPARSEABLE_LOCKFILE');
  }

  // OSV is failure-isolated inside runScan now (was a route-level 503 before).
  // Rationale: the CLI use case is "always produce a report"; the markdown
  // generator already surfaces "OSV vulnerability data was unavailable" as
  // an Uncertainty bullet. The route handlers may still wish to 503 — they
  // can check `osvError` on the result.
  let vulnerabilities = [];
  let osvError = false;
  try {
    // Per-scan ecosystem flows from the inventory format through to every
    // OSV `package` query and the affected-range filter. Single-ecosystem
    // scans (npm-only OR PyPI-only) — there's no mixed-tree case in v0.
    vulnerabilities = await queryOsvBatch(parsed.all, fetchImpl, { ecosystem });
  } catch (e) {
    // Log lives at the route layer; runScan stays quiet for tests.
    osvError = true;
    vulnerabilities = [];
  }

  // Identity resolver: failure-isolated per-batch.
  try {
    vulnerabilities = await attachIdentitiesToVulnerabilities(vulnerabilities || [], resolveIdentity, ecosystem);
  } catch {
    vulnerabilities = (vulnerabilities || []).map(v => ({
      ...v, resolvedRepo: null, confidence: 'NONE', source: null, verified: 'unverified',
    }));
  }

  // Repo health: failure-isolated per-batch and per-row.
  try {
    vulnerabilities = await attachRepoHealthToVulnerabilities(vulnerabilities || [], getAnalysis, mapWithConcurrency);
  } catch {
    vulnerabilities = (vulnerabilities || []).map(v => ({
      ...v,
      repoHealth: null,
      repoHealthError: 'ANALYSIS_FAILED',
    }));
  }

  // Scanner v3a — whole-tree inventory. Additive; never fails the scan.
  let inventory = null;
  let inventoryError = null;
  try {
    inventory = buildInventory(lockfileText);
  } catch {
    inventory = null;
    inventoryError = 'INVENTORY_FAILED';
  }

  // Postinstall analysis v0 — informational `hasInstallScript` flag flows
  // from the inventory through to each vuln row so the UI can render the
  // INSTALL SCRIPT chip without re-parsing the lockfile. Lookup by package
  // name (case-sensitive — both maps come from the same lockfile pass).
  // Defaults to false on packages absent from the inventory (e.g. when
  // inventory build failed but vuln scan succeeded).
  if (inventory && Array.isArray(inventory.packages) && Array.isArray(vulnerabilities)) {
    const installScriptIndex = new Map();
    for (const p of inventory.packages) {
      if (p && p.name) installScriptIndex.set(p.name, p.hasInstallScript === true);
    }
    vulnerabilities = vulnerabilities.map(v => ({
      ...v,
      hasInstallScript: installScriptIndex.get(v.package) === true,
    }));
  }

  // Scanner v3b — selective dependency health scoring. Failure-isolated.
  let selectedHealth = null;
  let selectedHealthError = null;
  try {
    if (inventory && Array.isArray(inventory.packages)) {
      const vulnerableNames = new Set(
        (vulnerabilities || []).map(v => v.package).filter(Boolean),
      );
      selectedHealth = await selectAndScoreHealth(
        inventory,
        vulnerableNames,
        getAnalysis,
        resolveIdentity,
        mapWithConcurrency,
        ecosystem,
      );
    }
  } catch {
    selectedHealth = null;
    selectedHealthError = 'SELECTED_HEALTH_FAILED';
  }

  // Postinstall analysis v0 — same lookup for v3b selected-health rows.
  // We do this AFTER selectAndScoreHealth runs so the merge can't crash the
  // pipeline if selectAndScoreHealth throws.
  if (inventory && Array.isArray(inventory.packages) && selectedHealth && Array.isArray(selectedHealth.scored)) {
    const installScriptIndex = new Map();
    for (const p of inventory.packages) {
      if (p && p.name) installScriptIndex.set(p.name, p.hasInstallScript === true);
    }
    selectedHealth = {
      ...selectedHealth,
      scored: selectedHealth.scored.map(r => ({
        ...r,
        hasInstallScript: installScriptIndex.get(r.package) === true,
      })),
    };
  }

  const payload = {
    totalDeps: parsed.all.length,
    directDeps: parsed.direct.length,
    ecosystem,
    vulnerabilities: sortScanVulnerabilities(vulnerabilities || []),
    scannedAt: new Date().toISOString(),
    cacheHit: false,
    inventory,
    selectedHealth,
  };
  if (inventoryError) payload.inventoryError = inventoryError;
  if (selectedHealthError) payload.selectedHealthError = selectedHealthError;
  if (osvError) payload.osvError = true;
  return payload;
}

/**
 * Standard bounded-concurrency map. Two of three runtimes had identical
 * copies of this; lifted here so the CLI and any future runtime can share.
 * Per-item errors are captured so one failure cannot poison the batch.
 *
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T, idx: number) => Promise<R>} fn
 * @returns {Promise<({ ok: true, value: R } | { ok: false, error: unknown })[]>}
 */
export async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workerCount = Math.min(limit, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        results[idx] = { ok: true, value: await fn(items[idx], idx) };
      } catch (error) {
        results[idx] = { ok: false, error };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

export const __internal = {
  scanSeverityRank,
  sortScanVulnerabilities,
  splitOwnerRepo,
  attachIdentitiesToVulnerabilities,
  attachRepoHealthToVulnerabilities,
  selectAndScoreHealth,
};
