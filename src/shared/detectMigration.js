/**
 * Fork-velocity-of-namesake detector — surfaces when a queried repo has been
 * migrated to a successor, without changing the composite score or verdict.
 *
 * Two paths, in order:
 *
 *   1. Curated lookup (src/data/repoMigrations.js). HIGH confidence. Fires
 *      regardless of the current verdict band — well-known migrations are
 *      worth surfacing even on a still-passable repo.
 *
 *   2. Fork-chain walk. MEDIUM confidence. Only runs when:
 *      - verdict is one of WATCHLIST / RISKY / STALE, AND
 *      - the repo's pushedAt is older than 180 days (truly dormant), AND
 *      - the curated lookup didn't fire.
 *      Pulls the top 3 forks by stars (one GitHub API call) and picks the
 *      first fork whose pushedAt is within the last 90 days AND whose star
 *      count is at least 10% of the original repo's stars (avoids promoting
 *      tiny forks).
 *
 * Cache TTL is 24h — mirrors src/shared/resolveDepIdentity.js. Failure is
 * isolated: any thrown error from `fetchForks` returns null silently so the
 * surrounding scan is never broken by this informational signal.
 *
 * @typedef {'WATCHLIST'|'RISKY'|'STALE'|'STABLE'|'FORKABLE'|'USE READY'|'HIGH MOMENTUM'} SoyceVerdict
 *
 * @typedef {Object} MigrationOwnerRepo
 * @property {string} owner
 * @property {string} repo
 *
 * @typedef {Object} MigrationResult
 * @property {MigrationOwnerRepo|null} successor null = deprecated without canonical successor
 * @property {string|null} migratedAt
 * @property {string} reason
 * @property {'HIGH'|'MEDIUM'} confidence
 * @property {'curated'|'fork-chain'} source
 * @property {number=} successorStars  set when source === 'fork-chain'
 * @property {string=} successorPushedAt  set when source === 'fork-chain'
 */

import { getCuratedMigration } from '../data/repoMigrations.js';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const LOW_BAND_VERDICTS = new Set(['WATCHLIST', 'RISKY', 'STALE']);
const DORMANT_DAYS = 180;
const FORK_RECENT_DAYS = 90;
const FORK_MIN_STAR_RATIO = 0.10;

// Module-level shared cache. Caller may inject its own via deps.cache.
const _migrationCache = new Map(); // key -> { result, expiresAt }

function cacheKey(owner, repo) {
  return `migration:${owner.toLowerCase()}/${repo.toLowerCase()}`;
}

function daysSince(iso, now) {
  if (typeof iso !== 'string' || !iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return (now - t) / 86400000;
}

/**
 * Detect whether a repo has been migrated. Always returns null on any
 * problem — the surrounding scan must never break because of this.
 *
 * @param {{
 *   owner: string,
 *   repo: string,
 *   verdict: SoyceVerdict|string,
 *   pushedAt: string|null,
 *   stargazersCount?: number,
 *   deps: {
 *     fetchForks: (owner: string, repo: string) => Promise<Array<any>>,
 *     cache?: Map<string, {result: MigrationResult|null, expiresAt: number}>,
 *     now?: () => number,
 *   }
 * }} args
 * @returns {Promise<MigrationResult|null>}
 */
export async function detectMigration(args) {
  if (!args || typeof args !== 'object') return null;
  const { owner, repo, verdict, pushedAt, stargazersCount, deps } = args;
  if (typeof owner !== 'string' || typeof repo !== 'string') return null;
  if (!owner || !repo) return null;
  if (!deps || typeof deps !== 'object') return null;
  if (typeof deps.fetchForks !== 'function') return null;

  const cache = deps.cache || _migrationCache;
  const now = (typeof deps.now === 'function' ? deps.now() : Date.now());
  const key = cacheKey(owner, repo);

  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.result;
  }

  // Path 1: curated lookup. HIGH confidence, no API call.
  const curated = getCuratedMigration(owner, repo);
  if (curated) {
    /** @type {MigrationResult} */
    const result = {
      successor: curated.to
        ? { owner: curated.to.owner, repo: curated.to.repo }
        : null,
      migratedAt: typeof curated.migratedAt === 'string' ? curated.migratedAt : null,
      reason: typeof curated.reason === 'string' ? curated.reason : '',
      confidence: 'HIGH',
      source: 'curated',
    };
    cache.set(key, { result, expiresAt: now + CACHE_TTL_MS });
    return result;
  }

  // Path 2: fork-chain walk. Only fires when the verdict is low-band AND
  // the repo is actually dormant. A healthy repo gets no extra API call.
  if (!LOW_BAND_VERDICTS.has(String(verdict))) {
    cache.set(key, { result: null, expiresAt: now + CACHE_TTL_MS });
    return null;
  }

  const origDormancy = daysSince(pushedAt, now);
  if (origDormancy === null || origDormancy < DORMANT_DAYS) {
    cache.set(key, { result: null, expiresAt: now + CACHE_TTL_MS });
    return null;
  }

  let forks;
  try {
    forks = await deps.fetchForks(owner, repo);
  } catch {
    // Failure isolation. Never cache a transient fetch failure.
    return null;
  }
  if (!Array.isArray(forks) || forks.length === 0) {
    cache.set(key, { result: null, expiresAt: now + CACHE_TTL_MS });
    return null;
  }

  const origStars = typeof stargazersCount === 'number' && stargazersCount > 0
    ? stargazersCount
    : 0;
  const minForkStars = origStars > 0 ? Math.ceil(origStars * FORK_MIN_STAR_RATIO) : 0;

  for (const fork of forks.slice(0, 3)) {
    if (!fork || typeof fork !== 'object') continue;
    const forkPushedAt = typeof fork.pushed_at === 'string' ? fork.pushed_at : null;
    const forkAgeDays = daysSince(forkPushedAt, now);
    if (forkAgeDays === null || forkAgeDays > FORK_RECENT_DAYS) continue;
    const forkStars = typeof fork.stargazers_count === 'number' ? fork.stargazers_count : 0;
    if (origStars > 0 && forkStars < minForkStars) continue;
    const forkOwner = fork.owner && typeof fork.owner.login === 'string' ? fork.owner.login : null;
    const forkRepo = typeof fork.name === 'string' ? fork.name : null;
    if (!forkOwner || !forkRepo) continue;
    /** @type {MigrationResult} */
    const result = {
      successor: { owner: forkOwner, repo: forkRepo },
      migratedAt: null,
      reason: `Algorithmic detection: top fork ${forkOwner}/${forkRepo} has recent activity (pushed ${Math.round(forkAgeDays)}d ago) while the original has been dormant for ${Math.round(origDormancy)}d. Possible community handoff — verify before relying on the successor.`,
      confidence: 'MEDIUM',
      source: 'fork-chain',
      successorStars: forkStars,
      successorPushedAt: forkPushedAt,
    };
    cache.set(key, { result, expiresAt: now + CACHE_TTL_MS });
    return result;
  }

  cache.set(key, { result: null, expiresAt: now + CACHE_TTL_MS });
  return null;
}

/**
 * Build a fetchForks function bound to a set of GitHub headers. Returns the
 * top 3 forks sorted by stargazers descending (the GitHub API's `?sort=`
 * accepts `stargazers`).
 *
 * @param {Record<string, string>} headers
 * @returns {(owner: string, repo: string) => Promise<any[]>}
 */
export function makeFetchForks(headers) {
  return async function fetchForks(owner, repo) {
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/forks?sort=stargazers&per_page=3`;
    const res = await fetch(url, { headers });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  };
}

export const __internal = {
  CACHE_TTL_MS,
  LOW_BAND_VERDICTS,
  DORMANT_DAYS,
  FORK_RECENT_DAYS,
  FORK_MIN_STAR_RATIO,
  _migrationCache,
};
