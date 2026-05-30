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
  const a = severityFromDatabaseSpecific(vuln.database_specific);
  if (a !== 'unknown') return a;
  return severityFromCvss(vuln.severity);
}

function maxSeverity(a, b) {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
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
  };
}

// ---------------------------------------------------------------------------
// HTTP client (timeout + JSON shape)
// ---------------------------------------------------------------------------

async function realOsvFetch(names, opts) {
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
      console.warn(`osvFastPath: query timed out after ${opts.timeoutMs}ms`);
    } else {
      console.warn('osvFastPath: query failed:', err && err.message);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
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
