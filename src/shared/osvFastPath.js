/**
 * OpenSoyce — OSV fast-path overlay (DEPS_REGISTRY Phase 3).
 *
 * Adds a sub-200ms known-vulnerability check that runs BEFORE the
 * package_registry snapshot read / live-query path in the OTS Gate. The
 * idea: even when a package has no GitHub repo (no `analyzeRepo` signal)
 * and is fresh enough to escape the cron's batch refresh, OSV can tell
 * us "this package is in a published advisory" in one bulk call.
 *
 * Why this matters: the gate's worst cold-path failure mode today is
 * "brand-new malicious package, no GitHub repo, never seen before".
 * Phase 2 returns the 8.0/MIT/stable/FRESH hardcoded fallback for those.
 * Phase 3 turns the same case into a BLOCK with surfaced CVE/GHSA IDs
 * via the existing `known-vulnerability-exposure` pattern.
 *
 * Design:
 *
 *   - One bulk querybatch POST to api.osv.dev per gate call, regardless
 *     of how many dependencies are being checked. OSV's free tier supports
 *     up to 1000 queries per batch and typically responds in <500ms.
 *
 *   - 1000ms timeout via AbortController. On timeout or upstream error,
 *     the fast-path returns an empty Map and the gate continues without
 *     overlay data — degrades gracefully to Phase 2 behavior.
 *
 *   - Per-lambda in-memory cache, 10-minute TTL. Vulnerability state is
 *     additive (new advisories appear, old ones rarely change) so a
 *     short cache window is safe. Same per-instance cache pattern as
 *     /api/badge from PR #6.
 *
 *   - npm ecosystem only for v1. Other ecosystems (PyPI, Maven, Go,
 *     RubyGems) ship later when the gate accepts those dependency types.
 *
 *   - No version-awareness in v1. Each lookup returns ALL known vulns
 *     for the package name family, regardless of which version the
 *     consumer is on. This skews toward false positives (lodash will
 *     report CVE-2021-23337 even if the consumer is on 4.17.30). For a
 *     security-focused product, false positives are preferred to false
 *     negatives — "block + tell the user to pin to a safe version" is a
 *     reasonable response. Phase 3.5 adds version-aware queries.
 *
 *   - No write-back to package_registry in v1. The in-memory cache is
 *     enough at gate latency, and persisting per-vuln signals into a
 *     score-shaped table is a bigger schema decision. Phase 3.5.
 */

const OSV_BATCH_ENDPOINT = 'https://api.osv.dev/v1/querybatch';
const OSV_VULN_ENDPOINT = 'https://api.osv.dev/v1/vulns';
const DEFAULT_TIMEOUT_MS = 1000;
const CACHE_TTL_MS = 10 * 60 * 1000;

// ---------------------------------------------------------------------------
// Test seams
// ---------------------------------------------------------------------------

let __osvClientOverride = null;
/** Stub the OSV HTTP client for tests. Fetcher is called with (names) and must return an OsvBatchResponse-like object. */
export function __setOsvClientForTests(fn) {
  __osvClientOverride = fn;
}

let __clockOverride = null;
/** Stub Date.now() for deterministic TTL tests. */
export function __setClockForTests(fn) {
  __clockOverride = fn;
}

function nowMs() {
  return __clockOverride ? __clockOverride() : Date.now();
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const cache = new Map();

/** Test-only: clear the in-memory cache between cases. */
export function __resetOsvCacheForTests() {
  cache.clear();
}

function cachePut(name, summary) {
  cache.set(name, { summary, expiresAt: nowMs() + CACHE_TTL_MS });
}

function cacheGet(name) {
  const entry = cache.get(name);
  if (!entry) return null;
  if (nowMs() >= entry.expiresAt) {
    cache.delete(name);
    return null;
  }
  return entry.summary;
}

// ---------------------------------------------------------------------------
// Severity normalization
// ---------------------------------------------------------------------------

const SEVERITY_RANK = { unknown: 0, low: 1, medium: 2, high: 3, critical: 4 };

function severityFromDatabaseSpecific(databaseSpecific) {
  const raw = databaseSpecific && typeof databaseSpecific.severity === 'string'
    ? databaseSpecific.severity.toLowerCase()
    : '';
  if (raw === 'critical') return 'critical';
  if (raw === 'high') return 'high';
  if (raw === 'moderate' || raw === 'medium') return 'medium';
  if (raw === 'low') return 'low';
  return 'unknown';
}

function severityFromCvss(severityArray) {
  if (!Array.isArray(severityArray)) return 'unknown';
  for (const s of severityArray) {
    if (s && typeof s.score === 'string') {
      // Very rough heuristic. OSV CVSS strings look like
      // "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H". We don't compute
      // the numeric score; we just look for CIA = H/H/H or worse.
      if (/C:H.*I:H.*A:H/.test(s.score)) return 'critical';
      if (/(C:H|I:H|A:H)/.test(s.score)) return 'high';
    }
  }
  return 'unknown';
}

function pickSeverity(vuln) {
  // Take the MAX of GitHub's database_specific rating and the underlying CVSS.
  // GHSA's database_specific.severity is sometimes downrated relative to the
  // CVSS vector (the canonical 2021 ua-parser-js compromise is rated HIGH in
  // database_specific but carries CVSS:3.1/.../C:H/I:H/A:H — critical-tier
  // impact across confidentiality, integrity, and availability). Preferring
  // database_specific would lose the critical signal; the max preserves it.
  const a = severityFromDatabaseSpecific(vuln.database_specific);
  const b = severityFromCvss(vuln.severity);
  return maxSeverity(a, b);
}

function maxSeverity(a, b) {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

// ---------------------------------------------------------------------------
// Compromise-indicator derivation
// ---------------------------------------------------------------------------

// Supply-chain compromise advisories carry distinctive CWE codes that routine
// vulnerabilities (ReDoS, prototype pollution, command injection on API
// surface) do not. CWE-829 (Inclusion of Functionality from Untrusted Control
// Sphere) and CWE-912 (Hidden Functionality) both indicate the published
// package itself executes untrusted/hidden code — the structural shape of
// supply-chain compromise.
//
// Probed against the 5 ua-parser-js advisories on 2026-06-01:
//   GHSA-394c-5j6w-4xmx  — ReDoS    — CWE-400         — no compromise signal
//   GHSA-662x-fhqg-9p8v  — ReDoS    — CWE-400         — no compromise signal
//   GHSA-78cj-fxph-m83p  — ReDoS    — CWE-400         — no compromise signal
//   GHSA-fhg7-m89q-25r3  — ReDoS    — CWE-1333,400    — no compromise signal
//   GHSA-pjwm-rvh2-c87w  — Malware  — CWE-829,912     — COMPROMISE SIGNAL ✓
//
// The heuristic is conservative on purpose. A false-positive supply-chain
// compromise call against a routine bug would be a credibility incident; a
// false-negative is recoverable via the existing replay path which sets
// row.maintainerCompromise directly. Expansion of the indicator vocabulary
// (e.g. add CWE-506 for embedded malicious code) ships only with cited
// incident evidence, matching the doctrine for the rest of the catalog.

const COMPROMISE_CWE_IDS = new Set(['CWE-829', 'CWE-912']);

function cweIdsFromVuln(vuln) {
  const ids = vuln && vuln.database_specific && vuln.database_specific.cwe_ids;
  return Array.isArray(ids) ? ids : [];
}

function deriveCompromiseIndicators(vulns) {
  const indicatorIds = [];
  let firstSummary = '';
  for (const v of vulns) {
    const cwes = cweIdsFromVuln(v);
    const hit = cwes.some((c) => COMPROMISE_CWE_IDS.has(c));
    if (hit && typeof v.id === 'string' && v.id.length > 0) {
      indicatorIds.push(v.id);
      if (!firstSummary && typeof v.summary === 'string') firstSummary = v.summary;
    }
  }
  if (indicatorIds.length === 0) {
    return {
      hasInstallScript: false,
      hasRemoteExecution: false,
      maintainerCompromiseReason: null,
      indicatorIds: [],
    };
  }
  const reasonHead = firstSummary || 'Advisory indicates embedded malicious code';
  return {
    hasInstallScript: true,
    hasRemoteExecution: true,
    maintainerCompromiseReason: `${reasonHead} (${indicatorIds.join(', ')})`,
    indicatorIds,
  };
}

// ---------------------------------------------------------------------------
// Vuln summary shaping
// ---------------------------------------------------------------------------

/**
 * Build an OsvSummary from a list of OSV vuln objects. Returns null when
 * the list is empty so callers can distinguish "no vulns known" from
 * "didn't check". Empty list maps to null in the result map.
 */
function summarizeVulns(vulns) {
  if (!Array.isArray(vulns) || vulns.length === 0) return null;
  const ids = [];
  let highestSeverity = 'unknown';
  let summary = '';
  for (const v of vulns) {
    if (typeof v.id === 'string' && v.id.length > 0) ids.push(v.id);
    highestSeverity = maxSeverity(highestSeverity, pickSeverity(v));
    if (!summary && typeof v.summary === 'string') summary = v.summary;
  }
  return {
    hasVulns: ids.length > 0,
    ids,
    highestSeverity,
    critical: highestSeverity === 'critical',
    summary: summary || 'Known vulnerability published in OSV database',
    compromiseIndicators: deriveCompromiseIndicators(vulns),
  };
}

// ---------------------------------------------------------------------------
// HTTP client (timeout + JSON shape)
// ---------------------------------------------------------------------------

// OSV's /v1/querybatch returns only `{id, modified}` stubs per vuln. Severity,
// summary, and CVSS data live on the full `/v1/vulns/<id>` records. The
// production fetcher does both calls: bulk to discover IDs, parallel detail
// fetches to enrich. Without enrichment the normalizer always returns
// 'unknown' (the bug PR #20 surfaced via the ua-parser-js ALLOW evidence).

async function bulkFetch(names, opts) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await fetch(OSV_BATCH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        queries: names.map((name) => ({ package: { name, ecosystem: 'npm' } })),
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    if (err && err.name === 'AbortError') {
      console.warn(`osvFastPath: bulk query timed out after ${opts.timeoutMs}ms`);
    } else {
      console.warn('osvFastPath: bulk query failed:', err && err.message);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function detailFetch(id, opts) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await fetch(`${OSV_VULN_ENDPOINT}/${encodeURIComponent(id)}`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    if (err && err.name === 'AbortError') {
      console.warn(`osvFastPath: detail fetch for ${id} timed out after ${opts.timeoutMs}ms`);
    } else {
      console.warn(`osvFastPath: detail fetch for ${id} failed:`, err && err.message);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function realOsvFetch(names, opts) {
  const bulk = await bulkFetch(names, opts);
  if (!bulk || !Array.isArray(bulk.results)) return null;

  // Collect unique vuln IDs across all packages; parallel-fetch each once.
  const idToDetail = new Map();
  const allIds = new Set();
  for (const result of bulk.results) {
    const stubs = Array.isArray(result && result.vulns) ? result.vulns : [];
    for (const s of stubs) {
      if (s && typeof s.id === 'string' && s.id.length > 0) allIds.add(s.id);
    }
  }
  await Promise.all([...allIds].map(async (id) => {
    const detail = await detailFetch(id, opts);
    if (detail) idToDetail.set(id, detail);
  }));

  // Re-assemble: each package's vulns become enriched records. If a detail
  // fetch failed for some ID, fall back to the stub (id only); the normalizer
  // returns 'unknown' for that one entry but the ID still surfaces.
  const enrichedResults = bulk.results.map((result) => {
    const stubs = Array.isArray(result && result.vulns) ? result.vulns : [];
    const vulns = stubs.map((s) => (s && idToDetail.get(s.id)) || s);
    return { vulns };
  });
  return { results: enrichedResults };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Batch-query OSV for an array of npm package names. Returns Map<name,
 * OsvSummary | null>. `null` means "checked, no vulns known". A missing
 * key means "didn't check" (e.g. invalid input).
 *
 * Never throws. On upstream failure or timeout, returns a Map with all
 * inputs mapped to null (effectively "no overlay data") so the caller
 * can continue without breaking.
 */
export async function queryOsvBatch(names, opts = {}) {
  const timeoutMs = typeof opts.timeoutMs === 'number' ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
  const result = new Map();

  const cleaned = [...new Set(
    (names || [])
      .map((n) => String(n || '').trim().toLowerCase())
      .filter((n) => n && n.length > 0)
  )];
  if (cleaned.length === 0) return result;

  // Resolve cache hits first.
  const uncachedNames = [];
  for (const name of cleaned) {
    const cached = cacheGet(name);
    if (cached !== null) {
      result.set(name, cached);
    } else if (cache.has(name)) {
      // Cached null (we checked and there were no vulns) — preserve that.
      result.set(name, null);
    } else {
      uncachedNames.push(name);
    }
  }

  if (uncachedNames.length === 0) return result;

  const fetcher = __osvClientOverride || realOsvFetch;
  const response = await fetcher(uncachedNames, { timeoutMs });
  if (!response || !Array.isArray(response.results)) {
    // Upstream failure: don't poison the cache; just return null for
    // uncached names so the gate continues without overlay data. The
    // next call will retry.
    for (const name of uncachedNames) {
      if (!result.has(name)) result.set(name, null);
    }
    return result;
  }

  for (let i = 0; i < uncachedNames.length; i += 1) {
    const name = uncachedNames[i];
    const entry = response.results[i] || {};
    const summary = summarizeVulns(entry.vulns);
    cachePut(name, summary);
    result.set(name, summary);
  }

  return result;
}

/**
 * Convert an OsvSummary into the patches the gate handler should apply
 * to the package details before pattern detection runs. Returns null
 * if there's nothing to overlay.
 */
export function detailPatchFromOsv(summary) {
  if (!summary || !summary.hasVulns) return null;
  return {
    critical: summary.critical,
    osvIds: summary.ids,
    osvSeverity: summary.highestSeverity,
    osvSummary: summary.summary,
  };
}
