import { parseNpmLockfile, queryOsvBatch, detectLockfileFormat, buildInventory } from '../src/shared/scanLockfile.js';
import { resolveDepIdentity } from '../src/shared/resolveDepIdentity.js';
import { analyzeRepo, githubHeaders } from '../src/shared/analyzeRepo.js';
import { verdictFor } from '../src/shared/verdict.js';
import { selectHealthCandidates } from '../src/shared/selectHealthCandidates.js';

/**
 * Resolve GitHub identity for each vulnerable package only. Skipping the full
 * dep tree keeps npm-registry traffic minimal. Failures default to NONE.
 */
async function attachIdentitiesToVulnerabilities(vulns) {
  if (!Array.isArray(vulns) || vulns.length === 0) return vulns || [];
  const results = await Promise.allSettled(
    vulns.map(v => resolveDepIdentity(v.package, { version: v.version }))
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
      };
      if (ident.directory) merged.directory = ident.directory;
      return merged;
    }
    return { ...v, resolvedRepo: null, confidence: 'NONE', source: null };
  });
}

/**
 * Bounded-concurrency map. Mirrors server.ts so the Vercel function also
 * never fans out to all GitHub endpoints for every vuln at once. Per-item
 * errors are captured so one failure can't poison the batch.
 */
async function mapWithConcurrency(items, limit, fn) {
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

function splitOwnerRepo(slug) {
  if (typeof slug !== 'string') return null;
  const parts = slug.split('/');
  if (parts.length !== 2) return null;
  const [owner, repo] = parts;
  if (!owner || !repo) return null;
  return { owner, repo };
}

// Per-request analysis memo. Vercel functions are stateless across requests
// so we get no cross-request caching here, but a single scan can ref the same
// repo multiple times (e.g. two advisories on lodash) — memo keeps that to
// one analysis call.
function makeAnalysisMemo(headers) {
  const cache = new Map();
  return async function getAnalysis(owner, repo) {
    const key = `${owner}/${repo}`;
    if (cache.has(key)) return cache.get(key);
    const p = analyzeRepo(owner, repo, headers);
    cache.set(key, p);
    return p;
  };
}

/**
 * Scanner v2.1a — attach Soyce score + verdict + signals to each HIGH/MEDIUM
 * resolved vuln. Errors are captured per-vuln so a failing analysis can never
 * fail the whole scan.
 */
async function attachRepoHealthToVulnerabilities(vulns) {
  const headers = githubHeaders(process.env.GITHUB_TOKEN);
  const getAnalysis = makeAnalysisMemo(headers);

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
    v.repoHealth = {
      soyceScore: data.total,
      verdict: verdictFor(data.total, { earlyBreakout: false }),
      signals: {
        maintenance: data.breakdown.maintenance ?? 0,
        security: data.breakdown.security ?? 0,
        activity: data.breakdown.activity ?? 0,
      },
    };
    v.repoHealthError = null;
  });

  return enriched;
}

/**
 * Scanner v3b -- selective dependency health scoring (Vercel mirror).
 *
 * Mirrors server.ts selectAndScoreHealth. Picks up to 25 non-vulnerable
 * inventory packages, resolves identity, then (HIGH/MEDIUM only) attaches
 * Soyce score + verdict + signals via the per-request memo. Per-row try/catch
 * keeps a single bad analysis from poisoning the response. "unknown is not a
 * verdict": unresolved identity emits status:'IDENTITY_UNRESOLVED' with
 * soyceScore null -- no negative score is computed.
 */
async function selectAndScoreHealth(inventory, vulnerablePackageNames, getAnalysis) {
  const BUDGET = 25;
  const { selected, skippedBudget, qualifyingTotal } = selectHealthCandidates({
    inventory,
    vulnerablePackageNames,
    budget: BUDGET,
  });

  const outcomes = await mapWithConcurrency(selected, 5, async (cand) => {
    const ident = await resolveDepIdentity(cand.package, { version: cand.version });
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
    row.soyceScore = v.analysis.total;
    row.verdict = verdictFor(v.analysis.total, { earlyBreakout: false });
    row.signals = {
      maintenance: v.analysis.breakdown.maintenance ?? 0,
      security: v.analysis.breakdown.security ?? 0,
      activity: v.analysis.breakdown.activity ?? 0,
    };
    row.status = 'SCORED';
    return row;
  });

  return { scored, skippedBudget, qualifyingTotal, budget: BUDGET };
}

// Severity tiering for response sort. Lower index = higher severity.
const SEVERITY_ORDER = ['critical', 'high', 'medium', 'moderate', 'low', 'unknown'];

function severityRank(sev) {
  const key = (sev || 'unknown').toLowerCase();
  // Treat 'moderate' (GH/OSV synonym) as 'medium'.
  const normalized = key === 'moderate' ? 'medium' : key;
  const idx = SEVERITY_ORDER.indexOf(normalized);
  return idx === -1 ? SEVERITY_ORDER.length : idx;
}

function sortVulnerabilities(vulns) {
  return [...vulns].sort((a, b) => {
    const sa = severityRank(a.severity);
    const sb = severityRank(b.severity);
    if (sa !== sb) return sa - sb;
    const na = (a.package || a.name || '').toLowerCase();
    const nb = (b.package || b.name || '').toLowerCase();
    return na.localeCompare(nb);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { lockfile } = req.body || {};
  if (typeof lockfile !== 'string') {
    return res.status(400).json({ error: 'UNPARSEABLE_LOCKFILE' });
  }
  if (lockfile.length > 5_000_000) {
    return res.status(413).json({ error: 'TOO_LARGE' });
  }

  const format = detectLockfileFormat(lockfile);
  if (format === 'package-json') {
    return res.status(400).json({ error: 'PACKAGE_JSON_NOT_SUPPORTED' });
  }
  if (format === 'yarn-v1' || format === 'yarn-v2') {
    return res.status(400).json({ error: 'YARN_COMING_SOON' });
  }
  if (format === 'unknown' || format === undefined || format === null) {
    return res.status(400).json({ error: 'UNPARSEABLE_LOCKFILE' });
  }

  let parsed;
  try {
    parsed = parseNpmLockfile(lockfile);
  } catch (e) {
    return res.status(400).json({ error: 'UNPARSEABLE_LOCKFILE' });
  }

  let vulnerabilities;
  try {
    vulnerabilities = await queryOsvBatch(parsed.all);
  } catch (e) {
    console.error('OSV failure', e);
    return res.status(503).json({ error: 'OSV_UNAVAILABLE' });
  }

  try {
    vulnerabilities = await attachIdentitiesToVulnerabilities(vulnerabilities || []);
  } catch (e) {
    console.error('Identity resolver failure (non-fatal)', e);
    vulnerabilities = (vulnerabilities || []).map(v => ({
      ...v, resolvedRepo: null, confidence: 'NONE', source: null
    }));
  }

  try {
    vulnerabilities = await attachRepoHealthToVulnerabilities(vulnerabilities || []);
  } catch (e) {
    console.error('Repo health attachment failure (non-fatal)', e);
    vulnerabilities = (vulnerabilities || []).map(v => ({
      ...v,
      repoHealth: null,
      repoHealthError: 'ANALYSIS_FAILED',
    }));
  }

  // Scanner v3a — whole-tree inventory. Purely additive; never fails the
  // scan. A bad inventory yields `inventory: null` + `inventoryError` set.
  let inventory = null;
  let inventoryError = null;
  try {
    inventory = buildInventory(lockfile);
  } catch (e) {
    console.error('Inventory build failure (non-fatal)', e);
    inventory = null;
    inventoryError = 'INVENTORY_FAILED';
  }

  // Scanner v3b -- selective dependency health. Errors here never fail the
  // scan. A failed block sets selectedHealth:null + selectedHealthError.
  let selectedHealth = null;
  let selectedHealthError = null;
  try {
    if (inventory && Array.isArray(inventory.packages)) {
      const vulnerableNames = new Set(
        (vulnerabilities || []).map(v => v.package).filter(Boolean),
      );
      const headers = githubHeaders(process.env.GITHUB_TOKEN);
      const getAnalysis = makeAnalysisMemo(headers);
      selectedHealth = await selectAndScoreHealth(inventory, vulnerableNames, getAnalysis);
    }
  } catch (e) {
    console.error('Selected health scoring failure (non-fatal)', e);
    selectedHealth = null;
    selectedHealthError = 'SELECTED_HEALTH_FAILED';
  }

  const payload = {
    totalDeps: parsed.all.length,
    directDeps: parsed.direct.length,
    vulnerabilities: sortVulnerabilities(vulnerabilities || []),
    scannedAt: new Date().toISOString(),
    cacheHit: false,
    inventory,
    selectedHealth,
  };
  if (inventoryError) payload.inventoryError = inventoryError;
  if (selectedHealthError) payload.selectedHealthError = selectedHealthError;
  res.status(200).json(payload);
}
