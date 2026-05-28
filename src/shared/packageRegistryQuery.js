/**
 * OpenSoyce — Package Registry Resolver (DEPS_REGISTRY Phase 2)
 *
 * Resolves `{score, license, verdict, status, ...}` for an npm package by
 * preferring a fresh snapshot row in `package_registry`, falling back to a
 * synchronous live-query (npm registry + GitHub `analyzeRepo`) when the row
 * is missing, and returning safe defaults if the live-query times out.
 *
 * Design notes:
 *
 *   - `package_registry` IS the cache. There is no separate cache layer.
 *     The snapshot cron (handleCronUpdateRegistry in api/exceptions.js)
 *     keeps the top-1k fresh; this resolver keeps the long tail covered.
 *
 *   - TTLs are verdict-tiered: high-risk verdicts refresh fast, stable ones
 *     refresh slow. Stale rows are STILL served (the gate's job is to
 *     return data, not refresh — the cron handles refresh). The gate only
 *     pays the live-query cost on truly-missing rows.
 *
 *   - Per-package timeout caps the worst-case gate latency. On timeout or
 *     upstream failure, an existing stale row (any age) is preferred over
 *     the hardcoded fallback default. Only if there's no row at all do we
 *     return the 8.0/MIT/stable/FRESH fallback.
 *
 *   - Request coalescing via in-flight Promise Map: N concurrent gate
 *     queries for the same never-seen package share ONE live-query
 *     instead of stampeding upstream. Same pattern as /api/badge (PR #6).
 *
 *   - Source tagging: every returned record carries a `source` field
 *     ('snapshot' | 'snapshot-stale' | 'live' | 'fallback') so callers can
 *     compute meaningful cache hit/miss semantics and so tests can assert
 *     the resolution path.
 */

import { resolveDepIdentity } from './resolveDepIdentity.js';
import { analyzeRepo, githubHeaders } from './analyzeRepo.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Verdict-tiered TTL. Beyond this age a row is considered "stale" — still
 * served, but tagged `source: 'snapshot-stale'` so callers can decide what
 * to do. Unknown verdicts (e.g. typo in DB) fall through to watchlist TTL.
 */
export const TTL_BY_VERDICT_MS = Object.freeze({
  graveyard: 1 * DAY_MS,
  risky:     1 * DAY_MS,
  watchlist: 7 * DAY_MS,
  stable:   30 * DAY_MS,
  forkable: 30 * DAY_MS,
  'use-ready': 30 * DAY_MS,
});

export const PER_PACKAGE_LIVE_QUERY_TIMEOUT_MS = 1500;

export const FALLBACK_DEFAULTS = Object.freeze({
  score: 8.0,
  license: 'MIT',
  verdict: 'stable',
  status: 'FRESH',
  warn: null,
  description: null,
  critical: false,
});

// ---------------------------------------------------------------------------
// Test seams (production code never touches these)
// ---------------------------------------------------------------------------

let __liveFetcherOverride = null;

/**
 * Stub the upstream live-query for tests. The fetcher is called with
 * (packageName, { githubToken }) and must return either a resolved
 * details object or `null` to simulate upstream failure.
 */
export function __setLiveFetcherForTests(fn) {
  __liveFetcherOverride = fn;
}

let __clockOverride = null;

/** Stub `Date.now()` for deterministic TTL tests. */
export function __setClockForTests(fn) {
  __clockOverride = fn;
}

function nowMs() {
  return __clockOverride ? __clockOverride() : Date.now();
}

// ---------------------------------------------------------------------------
// In-flight coalescing
// ---------------------------------------------------------------------------

const inflight = new Map();

/** Test-only: clear coalescing state between cases. */
export function __resetInflightForTests() {
  inflight.clear();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function ttlForVerdict(verdict) {
  const v = typeof verdict === 'string' ? verdict.toLowerCase() : '';
  return TTL_BY_VERDICT_MS[v] || TTL_BY_VERDICT_MS.watchlist;
}

function isFresh(row) {
  if (!row || !row.updated_at) return false;
  const age = nowMs() - Date.parse(row.updated_at);
  return age < ttlForVerdict(row.verdict);
}

function rowToDetails(row, source) {
  return {
    score: Number(row.score),
    license: row.license,
    verdict: row.verdict,
    status: row.status,
    warn: row.warn_message ?? null,
    description: row.description ?? null,
    critical: !!row.critical,
    source,
  };
}

function fallbackDetails() {
  return { ...FALLBACK_DEFAULTS, source: 'fallback' };
}

async function timeoutAfter(ms) {
  return new Promise((resolve) => setTimeout(() => resolve({ __timeout: true }), ms));
}

/**
 * Resolve a package via npm registry → GitHub `analyzeRepo`. Returns the
 * shape Supabase expects (column names match the `package_registry`
 * schema) OR null on failure / no GitHub repo.
 */
async function realLiveFetch(packageName, opts) {
  const identity = await resolveDepIdentity(packageName);
  if (!identity || !identity.resolvedRepo) return null;
  const [owner, repo] = identity.resolvedRepo.split('/');
  const headers = githubHeaders(opts.githubToken || '');
  const result = await analyzeRepo(owner, repo, headers);
  if (!result) return null;
  return {
    score: Number(result.total),
    license: (result.meta && result.meta.license) || 'MIT',
    verdict: result.verdict.toLowerCase(),
    status: statusFromCommit(result.meta && result.meta.lastCommit),
    warn_message: null,
    description: (result.repo && result.repo.description) || null,
    critical: !!(
      (result.meta && result.meta.advisories && result.meta.advisories.critical > 0) ||
      (result.extensionExploitRisk && result.extensionExploitRisk.status === 'HIJACK RISK')
    ),
  };
}

function statusFromCommit(lastCommitIso) {
  if (!lastCommitIso) return 'STALE';
  const ageDays = (nowMs() - Date.parse(lastCommitIso)) / DAY_MS;
  if (ageDays <= 90) return 'FRESH';
  if (ageDays <= 180) return 'AGING';
  return 'STALE';
}

async function liveQueryOne(packageName, opts) {
  if (inflight.has(packageName)) return inflight.get(packageName);
  const fetcher = __liveFetcherOverride || realLiveFetch;
  const p = (async () => {
    try {
      const result = await Promise.race([fetcher(packageName, opts), timeoutAfter(opts.timeoutMs)]);
      if (result && result.__timeout) return null;
      return result || null;
    } catch (err) {
      console.warn(`packageRegistryQuery: live-query for "${packageName}" threw:`, err && err.message);
      return null;
    } finally {
      // Clear inflight at the end so subsequent queries get a fresh chance.
      inflight.delete(packageName);
    }
  })();
  inflight.set(packageName, p);
  return p;
}

async function writeBack(sb, packageName, fetched) {
  try {
    await sb
      .from('package_registry')
      .upsert(
        {
          package_name: packageName,
          ecosystem: 'npm',
          score: fetched.score,
          license: fetched.license,
          verdict: fetched.verdict,
          status: fetched.status,
          warn_message: fetched.warn_message ?? null,
          description: fetched.description ?? null,
          critical: !!fetched.critical,
          updated_at: new Date(nowMs()).toISOString(),
        },
        { onConflict: 'package_name,ecosystem' },
      );
  } catch (err) {
    // Write-back failures are not fatal: the gate has the data in hand. Log
    // so cron / observability can catch persistent issues.
    console.warn(`packageRegistryQuery: write-back for "${packageName}" failed:`, err && err.message);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve a single package. Returns `{score, license, verdict, status,
 * warn, description, critical, source}`. `source` is one of:
 *
 *   - 'snapshot'        — fresh DB row (within TTL for its verdict)
 *   - 'snapshot-stale'  — DB row past TTL but still served
 *   - 'live'            — DB miss, live-query succeeded, written back
 *   - 'fallback'        — everything failed, returned defaults
 *
 * Never throws — fail paths return a `fallback` result.
 */
export async function resolvePackage(supabaseClient, packageName, opts = {}) {
  const name = String(packageName || '').trim().toLowerCase();
  if (!name) return fallbackDetails();
  const timeoutMs = typeof opts.timeoutMs === 'number' ? opts.timeoutMs : PER_PACKAGE_LIVE_QUERY_TIMEOUT_MS;
  const githubToken = opts.githubToken || '';

  // 1. Try the snapshot.
  let snapshot = null;
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('package_registry')
        .select('package_name, ecosystem, score, license, verdict, status, warn_message, description, critical, updated_at')
        .eq('package_name', name)
        .eq('ecosystem', 'npm')
        .maybeSingle();
      if (!error && data) snapshot = data;
    } catch (err) {
      console.warn(`packageRegistryQuery: snapshot read for "${name}" failed:`, err && err.message);
    }
  }

  // 2. Fresh snapshot → return immediately.
  if (snapshot && isFresh(snapshot)) {
    return rowToDetails(snapshot, 'snapshot');
  }

  // 3. Either no row or stale row. Always serve the stale row if we have one
  //    (the gate's job is data, not refresh — cron handles refresh) BUT for
  //    truly-missing rows, try a live-query first.
  if (!snapshot) {
    const fetched = await liveQueryOne(name, { timeoutMs, githubToken });
    if (fetched) {
      if (supabaseClient) {
        // Fire-and-forget; the gate doesn't wait on the write-back.
        writeBack(supabaseClient, name, fetched);
      }
      return rowToDetails(
        { ...fetched, package_name: name, ecosystem: 'npm', updated_at: new Date(nowMs()).toISOString() },
        'live',
      );
    }
    return fallbackDetails();
  }

  // 4. Stale row exists: return it tagged stale. Cron will refresh on next tick.
  return rowToDetails(snapshot, 'snapshot-stale');
}

/**
 * Batch-resolve. Issues a single Supabase SELECT for all `names`, then
 * fans out to live-queries for any name that wasn't in the snapshot.
 * Returns a Map(lowercased-name → details).
 */
export async function resolvePackages(supabaseClient, names, opts = {}) {
  const cleaned = [...new Set((names || []).map((n) => String(n || '').trim().toLowerCase()).filter(Boolean))];
  const result = new Map();
  if (cleaned.length === 0) return result;

  // Batch snapshot read.
  let snapshots = [];
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('package_registry')
        .select('package_name, ecosystem, score, license, verdict, status, warn_message, description, critical, updated_at')
        .in('package_name', cleaned)
        .eq('ecosystem', 'npm');
      if (!error && Array.isArray(data)) snapshots = data;
    } catch (err) {
      console.warn('packageRegistryQuery: batch snapshot read failed:', err && err.message);
    }
  }
  const snapshotByName = new Map(snapshots.map((row) => [row.package_name.toLowerCase(), row]));

  // Fan out to live-queries in parallel for misses.
  const liveTargets = cleaned.filter((name) => !snapshotByName.has(name));
  const timeoutMs = typeof opts.timeoutMs === 'number' ? opts.timeoutMs : PER_PACKAGE_LIVE_QUERY_TIMEOUT_MS;
  const githubToken = opts.githubToken || '';
  const liveResults = await Promise.all(
    liveTargets.map(async (name) => ({ name, fetched: await liveQueryOne(name, { timeoutMs, githubToken }) })),
  );
  const liveByName = new Map(liveResults.map((r) => [r.name, r.fetched]));

  // Compose final map.
  for (const name of cleaned) {
    const row = snapshotByName.get(name);
    if (row && isFresh(row)) {
      result.set(name, rowToDetails(row, 'snapshot'));
      continue;
    }
    if (row) {
      // Stale snapshot — serve as-is. (Phase 2.5 may add async refresh here.)
      result.set(name, rowToDetails(row, 'snapshot-stale'));
      continue;
    }
    const fetched = liveByName.get(name);
    if (fetched) {
      if (supabaseClient) writeBack(supabaseClient, name, fetched);
      result.set(
        name,
        rowToDetails(
          { ...fetched, package_name: name, ecosystem: 'npm', updated_at: new Date(nowMs()).toISOString() },
          'live',
        ),
      );
      continue;
    }
    result.set(name, fallbackDetails());
  }

  return result;
}

/**
 * Convenience: derive the gate's `cache` field from a resolution result map.
 *
 *   - 'hit'  — every package came from a fresh snapshot row
 *   - 'miss' — at least one package was stale, live-queried, or fell back
 */
export function cacheStatusFor(detailsMap) {
  for (const d of detailsMap.values()) {
    if (d.source !== 'snapshot') return 'miss';
  }
  return 'hit';
}
