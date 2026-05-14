/**
 * Dependency Identity Resolver v1.
 *
 * Maps an npm package name to its GitHub source repo by reading the npm
 * registry's top-level `repository`, `homepage`, and `bugs` fields. Pure
 * helpers (parseRepositoryField, extractGithubFromUrl) are exported for
 * testing and frontend reuse; `resolveDepIdentity` is the async entry point
 * that adds fetch + caching.
 *
 * This module does NOT score dependencies. Scanner v2.1 will attach Soyce
 * scores to the identities produced here.
 *
 * Confidence ladder emitted in v1:
 *   HIGH    — `repository` field parses cleanly to GitHub
 *   MEDIUM  — repository missing/non-GitHub, but `homepage` or `bugs.url`
 *             points at a GitHub repo
 *   LOW     — reserved for future inference; never emitted in v1
 *   NONE    — npm 404, or no field parses to GitHub
 *
 * @typedef {'HIGH'|'MEDIUM'|'LOW'|'NONE'} ResolverConfidence
 * @typedef {'npm.repository'|'npm.homepage'|'npm.bugs'} ResolverSource
 * @typedef {Object} ResolvedIdentity
 * @property {string} dependency
 * @property {string=} version
 * @property {string|null} resolvedRepo    `owner/repo` or null when NONE
 * @property {ResolverConfidence} confidence
 * @property {ResolverSource|null} source
 * @property {string=} directory           Optional monorepo subpath
 */

const NPM_REGISTRY = 'https://registry.npmjs.org/';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Package-level cache. Repository identity does not vary across versions, so
// the key is the package name (not name@version). Bounded only by 24h TTL —
// in practice the vulnerable-package list per scan is tiny (<30).
const identityCache = new Map(); // packageName -> { result, expiresAt }

/**
 * Parse a URL string into a GitHub `{ owner, repo, directory? }` triple.
 * Returns null for non-GitHub URLs or malformed input.
 *
 * Supported forms:
 *   git+https://github.com/owner/repo.git
 *   git://github.com/owner/repo.git
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo.git
 *   git@github.com:owner/repo.git           (SSH)
 *   github:owner/repo                       (npm shorthand)
 *   https://github.com/owner/repo/tree/main/packages/sub  (extracts subpath)
 *
 * @param {unknown} url
 * @returns {{ owner: string, repo: string, directory?: string }|null}
 */
export function extractGithubFromUrl(url) {
  if (typeof url !== 'string') return null;
  let s = url.trim();
  if (!s) return null;

  // npm shorthand: `github:owner/repo` (no host).
  const shorthand = /^github:([^/\s]+)\/([^/\s#?]+?)(?:\.git)?(?:#.*)?$/i.exec(s);
  if (shorthand) {
    return normalizeOwnerRepo(shorthand[1], shorthand[2]);
  }

  // SSH form: `git@github.com:owner/repo.git`. Not a valid URL for URL(),
  // so handle it before the URL parse.
  const ssh = /^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?(?:#.*)?$/i.exec(s);
  if (ssh) {
    return normalizeOwnerRepo(ssh[1], ssh[2]);
  }

  // Strip the `git+` prefix npm uses on cloneable URLs.
  if (s.startsWith('git+')) s = s.slice(4);
  // `git://github.com/...` is a valid URL but URL() preserves the protocol.
  // Treat git:// the same as https:// for host extraction.
  let parsed;
  try {
    parsed = new URL(s);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (host !== 'github.com' && host !== 'www.github.com') return null;

  // Path: /owner/repo[.git][/tree/<ref>/<subpath...>]
  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length < 2) return null;
  const owner = segments[0];
  let repo = segments[1];
  if (repo.endsWith('.git')) repo = repo.slice(0, -4);

  let directory;
  // /owner/repo/tree/<ref>/<...subpath>  OR  /owner/repo/blob/<ref>/<...subpath>
  if (segments.length > 4 && (segments[2] === 'tree' || segments[2] === 'blob')) {
    const sub = segments.slice(4).join('/');
    if (sub) directory = sub;
  }

  const norm = normalizeOwnerRepo(owner, repo);
  if (!norm) return null;
  return directory ? { ...norm, directory } : norm;
}

function normalizeOwnerRepo(owner, repo) {
  if (typeof owner !== 'string' || typeof repo !== 'string') return null;
  const o = owner.trim();
  let r = repo.trim();
  if (!o || !r) return null;
  if (r.endsWith('.git')) r = r.slice(0, -4);
  // GitHub names: alphanumeric + dash/underscore/dot. Reject anything else
  // so that malformed URLs (e.g. "this-is-not-a-url") never produce a fake
  // identity.
  if (!/^[A-Za-z0-9._-]+$/.test(o)) return null;
  if (!/^[A-Za-z0-9._-]+$/.test(r)) return null;
  return { owner: o, repo: r };
}

/**
 * Parse whatever shape npm's `repository` field arrives in.
 * Accepts: string, `{ type, url, directory? }`, or null/undefined.
 *
 * @param {unknown} field
 * @returns {{ host: 'github.com', owner: string, repo: string, directory?: string }|null}
 */
export function parseRepositoryField(field) {
  if (!field) return null;
  let url;
  let dir;
  if (typeof field === 'string') {
    url = field;
  } else if (typeof field === 'object') {
    // npm repository object: { type: 'git', url: '...', directory?: '...' }
    const obj = /** @type {Record<string, unknown>} */ (field);
    if (typeof obj.url !== 'string') return null;
    url = obj.url;
    if (typeof obj.directory === 'string' && obj.directory.trim()) {
      dir = obj.directory.trim();
    }
  } else {
    return null;
  }

  const gh = extractGithubFromUrl(url);
  if (!gh) return null;

  // If the repository object includes a `directory`, prefer it over any
  // subpath extracted from the URL (which is almost never set on real
  // packages anyway).
  const directory = dir || gh.directory;
  /** @type {{ host: 'github.com', owner: string, repo: string, directory?: string }} */
  const out = { host: 'github.com', owner: gh.owner, repo: gh.repo };
  if (directory) out.directory = directory;
  return out;
}

/**
 * Probe `bugs.url` (npm sometimes stores `bugs` as `{ url, email }` or a
 * bare string). Returns the URL or null.
 * @param {unknown} bugs
 * @returns {string|null}
 */
function bugsUrl(bugs) {
  if (typeof bugs === 'string') return bugs;
  if (bugs && typeof bugs === 'object' && typeof (/** @type {any} */ (bugs).url) === 'string') {
    return /** @type {any} */ (bugs).url;
  }
  return null;
}

/**
 * Resolve `homepage`/`bugs.url` to a GitHub identity. Used for MEDIUM
 * confidence when `repository` is missing or non-GitHub.
 * @param {{ homepage?: unknown, bugs?: unknown }} meta
 * @returns {{ owner: string, repo: string, source: 'npm.homepage'|'npm.bugs' }|null}
 */
function inferFromSecondary(meta) {
  if (typeof meta.homepage === 'string') {
    const gh = extractGithubFromUrl(meta.homepage);
    if (gh) return { owner: gh.owner, repo: gh.repo, source: 'npm.homepage' };
  }
  const url = bugsUrl(meta.bugs);
  if (url) {
    const gh = extractGithubFromUrl(url);
    if (gh) return { owner: gh.owner, repo: gh.repo, source: 'npm.bugs' };
  }
  return null;
}

function noneResult(packageName, version) {
  /** @type {ResolvedIdentity} */
  const out = {
    dependency: packageName,
    resolvedRepo: null,
    confidence: 'NONE',
    source: null,
  };
  if (version) out.version = version;
  return out;
}

/**
 * Resolve a package name to its GitHub identity via the npm registry.
 *
 * @param {string} packageName
 * @param {{ version?: string, fetchImpl?: typeof fetch, cache?: Map<string, {result: ResolvedIdentity, expiresAt: number}>, now?: () => number }} [opts]
 * @returns {Promise<ResolvedIdentity>}
 */
export async function resolveDepIdentity(packageName, opts = {}) {
  if (typeof packageName !== 'string' || !packageName.trim()) {
    return noneResult(String(packageName ?? ''), opts.version);
  }
  const name = packageName.trim();
  const cache = opts.cache || identityCache;
  const now = (opts.now || Date.now)();

  const cached = cache.get(name);
  if (cached && cached.expiresAt > now) {
    // Caller's version flows through onto a cached identity.
    return opts.version ? { ...cached.result, version: opts.version } : { ...cached.result };
  }

  const fetchFn = opts.fetchImpl || globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    return noneResult(name, opts.version);
  }

  // Fetch the package doc once and parse only the top-level identity fields.
  // The full document includes a `versions` map that balloons to MBs for
  // popular packages — we intentionally never touch it.
  let meta;
  try {
    const res = await fetchFn(NPM_REGISTRY + encodeURIComponent(name).replace(/^%40/, '@'), {
      headers: { accept: 'application/json' },
    });
    if (res.status === 404) {
      const result = noneResult(name, opts.version);
      cache.set(name, { result: stripVersion(result), expiresAt: now + CACHE_TTL_MS });
      return result;
    }
    if (!res.ok) {
      // Don't cache transient failures.
      return noneResult(name, opts.version);
    }
    meta = await res.json();
  } catch {
    return noneResult(name, opts.version);
  }

  if (!meta || typeof meta !== 'object') {
    return noneResult(name, opts.version);
  }

  /** @type {ResolvedIdentity} */
  let result;
  const fromRepo = parseRepositoryField(/** @type {any} */ (meta).repository);
  if (fromRepo) {
    /** @type {ResolvedIdentity} */
    const r = {
      dependency: name,
      resolvedRepo: `${fromRepo.owner}/${fromRepo.repo}`,
      confidence: 'HIGH',
      source: 'npm.repository',
    };
    if (fromRepo.directory) r.directory = fromRepo.directory;
    result = r;
  } else {
    const inferred = inferFromSecondary(/** @type {any} */ (meta));
    if (inferred) {
      result = {
        dependency: name,
        resolvedRepo: `${inferred.owner}/${inferred.repo}`,
        confidence: 'MEDIUM',
        source: inferred.source,
      };
    } else {
      result = noneResult(name);
    }
  }

  cache.set(name, { result, expiresAt: now + CACHE_TTL_MS });
  return opts.version ? { ...result, version: opts.version } : { ...result };
}

function stripVersion(result) {
  if (!result.version) return result;
  const { version: _v, ...rest } = result;
  return rest;
}

export const __internal = { identityCache, CACHE_TTL_MS };
