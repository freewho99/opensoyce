/**
 * Dependency Identity Resolver v1.1 — borrowed-trust defense.
 *
 * Maps an npm package name to its GitHub source repo by reading the npm
 * registry's top-level `repository`, `homepage`, and `bugs` fields. Pure
 * helpers (parseRepositoryField, extractGithubFromUrl) are exported for
 * testing and frontend reuse; `resolveDepIdentity` is the async entry point
 * that adds fetch + caching.
 *
 * Borrowed-trust defense (P0-AI-2, May 2026):
 *   A typo-squat package can publish a `repository` field pointing at a
 *   well-known repo (e.g. `langchain-ai/langchainjs`) and inherit that
 *   repo's HIGH Soyce score wholesale. To defend against this, when a
 *   candidate `owner/repo` is resolved at HIGH confidence we additionally
 *   fetch the GitHub repo's `package.json` and compare `name` to the npm
 *   package name. Mismatch downgrades confidence to MEDIUM and surfaces a
 *   `mismatchReason`. The cross-check is best-effort: GitHub failure is
 *   treated as `verified: 'unverified'` (string), distinct from
 *   `verified: true` (checked + matched) and `verified: false` (checked + mismatch).
 *
 * This module does NOT score dependencies. Scanner v2.1 will attach Soyce
 * scores to the identities produced here.
 *
 * Confidence ladder emitted in v1:
 *   HIGH    — `repository` field parses cleanly to GitHub AND
 *             (verified true OR verified 'unverified')
 *   MEDIUM  — repository missing/non-GitHub, but `homepage` or `bugs.url`
 *             points at a GitHub repo — OR — borrowed-trust mismatch
 *             detected (HIGH downgraded)
 *   LOW     — reserved for future inference; never emitted in v1
 *   NONE    — npm 404, or no field parses to GitHub
 *
 * @typedef {'HIGH'|'MEDIUM'|'LOW'|'NONE'} ResolverConfidence
 * @typedef {'npm.repository'|'npm.homepage'|'npm.bugs'} ResolverSource
 * @typedef {'github_pkg_name_different'|'github_root_pkg_missing'} ResolverMismatchReason
 * @typedef {Object} ResolvedIdentity
 * @property {string} dependency
 * @property {string=} version
 * @property {string|null} resolvedRepo    `owner/repo` or null when NONE
 * @property {ResolverConfidence} confidence
 * @property {ResolverSource|null} source
 * @property {string=} directory           Optional monorepo subpath
 * @property {boolean|'unverified'=} verified
 *           true: GitHub pkg.json `name` matched npm package name
 *           false: mismatch detected (see mismatchReason)
 *           'unverified': cross-check not performed or GitHub fetch failed
 * @property {ResolverMismatchReason=} mismatchReason
 * @property {{ githubPkgName?: string|null }=} meta  Diagnostic context
 */

const NPM_REGISTRY = 'https://registry.npmjs.org/';
const GITHUB_API = 'https://api.github.com';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Package-level cache. Repository identity does not vary across versions, so
// the key is the package name (not name@version). Bounded only by 24h TTL —
// in practice the vulnerable-package list per scan is tiny (<30).
const identityCache = new Map(); // packageName -> { result, expiresAt }

// GitHub package.json cross-check cache. Keyed by `owner/repo` so multiple
// npm packages claiming the same source repo share one GitHub fetch.
const githubPkgJsonCache = new Map(); // owner/repo -> { pkg, expiresAt }

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
 * Best-effort fetch of `package.json` at the root of a GitHub repo. Returns
 * the parsed JSON object, an explicit `{ __missing: true }` marker when the
 * file does not exist (404), or null when the fetch fails for any other
 * reason (rate limit, network, parse error). Caches the result for 24h
 * keyed by `owner/repo`.
 *
 * Never throws. The cross-check is informational — a GitHub outage must
 * not break the scanner.
 *
 * @param {string} owner
 * @param {string} repo
 * @param {{ fetchImpl?: typeof fetch, headers?: Record<string, string>, cache?: Map<string, {pkg: any, expiresAt: number}>, now?: () => number }} [opts]
 * @returns {Promise<{ name?: string, version?: string, __missing?: boolean }|null>}
 */
export async function fetchGithubPackageJson(owner, repo, opts = {}) {
  if (typeof owner !== 'string' || typeof repo !== 'string') return null;
  if (!owner.trim() || !repo.trim()) return null;
  const key = `${owner}/${repo}`;
  const cache = opts.cache || githubPkgJsonCache;
  const now = (opts.now || Date.now)();

  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.pkg;
  }

  const fetchFn = opts.fetchImpl || globalThis.fetch;
  if (typeof fetchFn !== 'function') return null;

  /** @type {Record<string, string>} */
  const headers = {
    accept: 'application/vnd.github.raw',
    'user-agent': 'opensoyce-resolver',
    ...(opts.headers || {}),
  };

  try {
    const url = `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/package.json`;
    const res = await fetchFn(url, { headers });
    if (res.status === 404) {
      const pkg = { __missing: true };
      cache.set(key, { pkg, expiresAt: now + CACHE_TTL_MS });
      return pkg;
    }
    if (!res.ok) return null;
    // With `Accept: application/vnd.github.raw`, GitHub returns the raw file
    // body. Tests / mocks may instead return a parsed JSON object via
    // `res.json()` — support both.
    let parsed = null;
    try {
      const text = await res.text();
      parsed = JSON.parse(text);
    } catch {
      // Some mocks / proxies may already return JSON via .json(); fall back.
      try { parsed = await res.json(); } catch { return null; }
    }
    if (!parsed || typeof parsed !== 'object') return null;
    cache.set(key, { pkg: parsed, expiresAt: now + CACHE_TTL_MS });
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Compare a GitHub repo's package.json `name` to the npm package name we
 * resolved from. Returns the verification verdict that should be merged
 * into the resolver result.
 *
 * @param {string} packageName
 * @param {{ name?: string, __missing?: boolean }|null} githubPkg
 * @returns {{ verified: true|false|'unverified', mismatchReason?: ResolverMismatchReason, githubPkgName: string|null }}
 */
function verdictForCrossCheck(packageName, githubPkg) {
  // Fetch failed entirely → we don't know.
  if (githubPkg == null) {
    return { verified: 'unverified', githubPkgName: null };
  }
  // 404 — no root package.json exists. Could be a monorepo where the root
  // intentionally omits package.json. v0: too expensive to enumerate
  // workspace subpaths, so we downgrade.
  if (githubPkg.__missing) {
    return {
      verified: false,
      mismatchReason: 'github_root_pkg_missing',
      githubPkgName: null,
    };
  }
  const name = typeof githubPkg.name === 'string' ? githubPkg.name : null;
  // Root package.json exists but has no `name` field — same monorepo signal.
  if (!name) {
    return {
      verified: false,
      mismatchReason: 'github_root_pkg_missing',
      githubPkgName: null,
    };
  }
  if (name === packageName) {
    return { verified: true, githubPkgName: name };
  }
  return {
    verified: false,
    mismatchReason: 'github_pkg_name_different',
    githubPkgName: name,
  };
}

/**
 * Resolve a package name to its GitHub identity via the npm registry.
 *
 * The borrowed-trust cross-check (P0-AI-2) runs only when the npm
 * `repository` field produces a HIGH-confidence candidate. MEDIUM
 * candidates (homepage / bugs) skip the check because they're already
 * downgraded — adding a second probe per row would double the GitHub
 * budget for marginal benefit.
 *
 * @param {string} packageName
 * @param {{
 *   version?: string,
 *   fetchImpl?: typeof fetch,
 *   cache?: Map<string, {result: ResolvedIdentity, expiresAt: number}>,
 *   now?: () => number,
 *   deps?: {
 *     fetchGithubPackageJson?: (owner: string, repo: string) => Promise<{name?: string, __missing?: boolean}|null>
 *   },
 *   githubHeaders?: Record<string, string>,
 * }} [opts]
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
    // Caller's version flows through onto a cached identity. The cached
    // result already carries any verified / mismatchReason flags, so a
    // borrowed-trust scenario is not re-verified per scan — it's stamped
    // into the 24h cache entry along with the resolvedRepo.
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

    // Borrowed-trust cross-check. Only run on HIGH (npm.repository) candidates;
    // MEDIUM (homepage/bugs) are already downgraded and a second probe per
    // row would double the GitHub budget for marginal benefit.
    const ghFetcher = (opts.deps && opts.deps.fetchGithubPackageJson)
      || ((owner, repo) => fetchGithubPackageJson(owner, repo, {
        fetchImpl: fetchFn,
        headers: opts.githubHeaders,
        now: opts.now,
      }));
    let githubPkg = null;
    try {
      githubPkg = await ghFetcher(fromRepo.owner, fromRepo.repo);
    } catch {
      githubPkg = null;
    }
    const verdict = verdictForCrossCheck(name, githubPkg);
    r.verified = verdict.verified;
    if (verdict.mismatchReason) {
      r.mismatchReason = verdict.mismatchReason;
      // Borrowed-trust detected → confidence drops from HIGH to MEDIUM.
      // The score is still useful (downstream may want to inspect the repo)
      // but the identity link is suspicious. NEVER gate functionality on
      // this — purely informational.
      r.confidence = 'MEDIUM';
    }
    if (verdict.githubPkgName !== null || verdict.mismatchReason) {
      r.meta = { githubPkgName: verdict.githubPkgName };
    }
    result = r;
  } else {
    const inferred = inferFromSecondary(/** @type {any} */ (meta));
    if (inferred) {
      result = {
        dependency: name,
        resolvedRepo: `${inferred.owner}/${inferred.repo}`,
        confidence: 'MEDIUM',
        source: inferred.source,
        // Secondary-source identities are not cross-checked in v1; mark as
        // 'unverified' so consumers can distinguish "didn't check" from
        // "checked + matched".
        verified: 'unverified',
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

// ---------------------------------------------------------------------------
// PyPI resolver (v0 — Python lockfile support)
// ---------------------------------------------------------------------------

/**
 * PyPI's JSON metadata API. Same architectural pattern as the npm resolver:
 * single fetch per package, top-level identity fields only (we never touch
 * the `releases` map which can balloon for popular projects).
 */
const PYPI_REGISTRY = 'https://pypi.org/pypi/';

// Separate caches so npm and PyPI never collide on same-named packages
// (theoretical, but free to guard against). Keyed by package name.
const pypiIdentityCache = new Map(); // packageName -> { result, expiresAt }
const githubPyProjectTomlCache = new Map(); // owner/repo -> { name, expiresAt }

/**
 * Best-effort fetch of `pyproject.toml` from the root of a GitHub repo.
 * Returns the `[project].name` value as a string, an explicit `__missing`
 * marker on 404, or null on any other failure (rate limit, network, parse).
 *
 * pyproject.toml is the PEP 621 standard. Older Python projects still ship
 * `setup.py` only — 404 there is normal, NOT a fraud signal. The verdict
 * helper distinguishes the cases.
 *
 * We extract `name = "..."` from the `[project]` table via regex. No TOML
 * library; the regex tolerates whitespace + comment lines but expects a
 * standard quoted-string scalar. If the project block uses non-standard
 * formatting (e.g. unquoted name, multi-line), we return null — that's an
 * "unverified" outcome, identical to a fetch failure, which is the
 * conservative choice.
 *
 * @param {string} owner
 * @param {string} repo
 * @param {{ fetchImpl?: typeof fetch, headers?: Record<string, string>, cache?: Map<string, any>, now?: () => number }} [opts]
 * @returns {Promise<{ name?: string|null, __missing?: boolean }|null>}
 */
export async function fetchGithubPyProjectToml(owner, repo, opts = {}) {
  if (typeof owner !== 'string' || typeof repo !== 'string') return null;
  if (!owner.trim() || !repo.trim()) return null;
  const key = `${owner}/${repo}`;
  const cache = opts.cache || githubPyProjectTomlCache;
  const now = (opts.now || Date.now)();

  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.pkg;
  }

  const fetchFn = opts.fetchImpl || globalThis.fetch;
  if (typeof fetchFn !== 'function') return null;

  /** @type {Record<string, string>} */
  const headers = {
    accept: 'application/vnd.github.raw',
    'user-agent': 'opensoyce-resolver',
    ...(opts.headers || {}),
  };

  try {
    const url = `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/pyproject.toml`;
    const res = await fetchFn(url, { headers });
    if (res.status === 404) {
      const pkg = { __missing: true };
      cache.set(key, { pkg, expiresAt: now + CACHE_TTL_MS });
      return pkg;
    }
    if (!res.ok) return null;
    let text;
    try {
      text = await res.text();
    } catch {
      return null;
    }
    if (typeof text !== 'string' || !text) return null;
    const name = extractPyProjectName(text);
    const pkg = { name };
    cache.set(key, { pkg, expiresAt: now + CACHE_TTL_MS });
    return pkg;
  } catch {
    return null;
  }
}

/**
 * Extract `[project].name = "..."` from a pyproject.toml body via regex.
 * Tolerates whitespace, comments, and the `[project]` header appearing
 * after other tables. Returns null when the value can't be confidently
 * extracted — see fetchGithubPyProjectToml for the verdict semantics.
 *
 * @param {string} text
 * @returns {string|null}
 */
function extractPyProjectName(text) {
  if (typeof text !== 'string' || !text) return null;
  // Find the [project] section. Walk forward line-by-line until the next
  // top-level [section] header (or EOF). JS regex has no `\Z`, so we do
  // this iteratively rather than with a fragile lookahead.
  const lines = text.split(/\r?\n/);
  let inProject = false;
  for (const raw of lines) {
    const line = raw;
    const trimmed = line.replace(/\s+$/, '');
    if (/^\s*\[project\]\s*$/.test(trimmed)) {
      inProject = true;
      continue;
    }
    if (inProject) {
      if (/^\s*\[[^\]]+\]\s*$/.test(trimmed)) {
        // Entered a new section — `[project]` ended without a name.
        return null;
      }
      const nm = /^\s*name\s*=\s*(?:"([^"\r\n]+)"|'([^'\r\n]+)')\s*(?:#.*)?$/.exec(trimmed);
      if (nm) return nm[1] || nm[2] || null;
    }
  }
  return null;
}

/**
 * Compare a GitHub repo's pyproject.toml name to the PyPI package name we
 * resolved from. Same verdict semantics as the npm-side cross-check.
 *
 * PyPI normalization: per PEP 503, `_`, `-`, and `.` are all equivalent and
 * comparisons are case-insensitive. So `Django` == `django` and
 * `python-dateutil` == `python_dateutil`. We normalize both sides before
 * comparing to avoid false-positive mismatches.
 *
 * @param {string} packageName
 * @param {{ name?: string|null, __missing?: boolean }|null} githubPkg
 */
function verdictForPyProjectCrossCheck(packageName, githubPkg) {
  if (githubPkg == null) {
    return { verified: 'unverified', githubPkgName: null };
  }
  if (githubPkg.__missing) {
    // pyproject.toml missing — could be a `setup.py`-only legacy project, a
    // monorepo, etc. v0: unverified rather than mismatch. Older Python
    // projects ship setup.py only — that's NORMAL, not a fraud signal.
    return { verified: 'unverified', githubPkgName: null };
  }
  const name = typeof githubPkg.name === 'string' ? githubPkg.name : null;
  if (!name) {
    // pyproject.toml exists but no [project].name parsed — could be poetry-
    // legacy ([tool.poetry] only). Mark as unverified, not false. v0.1 can
    // tighten this with a [tool.poetry] name fallback.
    return { verified: 'unverified', githubPkgName: null };
  }
  if (normalizePypiName(name) === normalizePypiName(packageName)) {
    return { verified: true, githubPkgName: name };
  }
  return {
    verified: false,
    mismatchReason: 'github_pyproject_name_different',
    githubPkgName: name,
  };
}

/** PEP 503 name normalization: lowercase, collapse runs of -._ to a single -. */
function normalizePypiName(name) {
  if (typeof name !== 'string') return '';
  return name.trim().toLowerCase().replace(/[-_.]+/g, '-');
}

/**
 * Resolve a PyPI package name to its GitHub identity. Mirrors
 * resolveDepIdentity (npm) but reads `info.project_urls` / `info.home_page`
 * and runs the borrowed-trust cross-check against pyproject.toml instead
 * of package.json.
 *
 * Confidence ladder:
 *   HIGH    — project_urls.Repository / Source / Code → GitHub
 *   MEDIUM  — home_page or project_urls.Homepage → GitHub
 *             (or HIGH downgraded by borrowed-trust mismatch)
 *   NONE    — PyPI 404, no field parses to GitHub, network error
 *
 * @param {string} packageName
 * @param {{
 *   version?: string,
 *   fetchImpl?: typeof fetch,
 *   cache?: Map<string, any>,
 *   now?: () => number,
 *   deps?: {
 *     fetchGithubPyProjectToml?: (owner: string, repo: string) => Promise<{name?: string|null, __missing?: boolean}|null>
 *   },
 *   githubHeaders?: Record<string, string>,
 * }} [opts]
 */
export async function resolvePypiIdentity(packageName, opts = {}) {
  if (typeof packageName !== 'string' || !packageName.trim()) {
    return noneResult(String(packageName ?? ''), opts.version);
  }
  const name = packageName.trim();
  const cache = opts.cache || pypiIdentityCache;
  const now = (opts.now || Date.now)();

  const cacheKey = `pypi:${name}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return opts.version ? { ...cached.result, version: opts.version } : { ...cached.result };
  }

  const fetchFn = opts.fetchImpl || globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    return noneResult(name, opts.version);
  }

  let meta;
  try {
    const res = await fetchFn(PYPI_REGISTRY + encodeURIComponent(name) + '/json', {
      headers: { accept: 'application/json' },
    });
    if (res.status === 404) {
      const result = noneResult(name);
      cache.set(cacheKey, { result, expiresAt: now + CACHE_TTL_MS });
      return opts.version ? { ...result, version: opts.version } : { ...result };
    }
    if (!res.ok) return noneResult(name, opts.version);
    meta = await res.json();
  } catch {
    return noneResult(name, opts.version);
  }
  if (!meta || typeof meta !== 'object') return noneResult(name, opts.version);

  // PyPI's metadata sits under `info`. project_urls is a plain dict of
  // free-text labels to URLs — labels vary by package author. We accept the
  // common conventions ("Repository", "Source", "Code", "Source Code") and
  // are case-insensitive.
  const info = meta.info && typeof meta.info === 'object' ? meta.info : meta;
  const projectUrls = info.project_urls && typeof info.project_urls === 'object'
    ? info.project_urls
    : {};

  /** @type {ResolvedIdentity} */
  let result;

  const repoCandidate = pickPypiRepoUrl(projectUrls);
  if (repoCandidate) {
    const gh = extractGithubFromUrl(repoCandidate);
    if (gh) {
      /** @type {ResolvedIdentity} */
      const r = {
        dependency: name,
        resolvedRepo: `${gh.owner}/${gh.repo}`,
        confidence: 'HIGH',
        source: 'pypi.project_urls.repository',
      };
      if (gh.directory) r.directory = gh.directory;

      // Borrowed-trust cross-check via pyproject.toml.
      const ghFetcher = (opts.deps && opts.deps.fetchGithubPyProjectToml)
        || ((owner, repo) => fetchGithubPyProjectToml(owner, repo, {
          fetchImpl: fetchFn,
          headers: opts.githubHeaders,
          now: opts.now,
        }));
      let pyProj = null;
      try {
        pyProj = await ghFetcher(gh.owner, gh.repo);
      } catch {
        pyProj = null;
      }
      const verdict = verdictForPyProjectCrossCheck(name, pyProj);
      r.verified = verdict.verified;
      if (verdict.mismatchReason) {
        r.mismatchReason = verdict.mismatchReason;
        r.confidence = 'MEDIUM';
      }
      if (verdict.githubPkgName !== null || verdict.mismatchReason) {
        r.meta = { githubPkgName: verdict.githubPkgName };
      }
      result = r;
    } else {
      // Project URL exists but isn't GitHub. Fall through to secondary
      // (homepage). v0 only supports GitHub.
      result = pypiSecondaryOrNone(name, info, projectUrls);
    }
  } else {
    result = pypiSecondaryOrNone(name, info, projectUrls);
  }

  cache.set(cacheKey, { result, expiresAt: now + CACHE_TTL_MS });
  return opts.version ? { ...result, version: opts.version } : { ...result };
}

/**
 * Try to find a "this is the source repo" URL in PyPI's project_urls dict.
 * Case-insensitive label match on the common conventions. Returns the URL
 * string or null.
 */
function pickPypiRepoUrl(projectUrls) {
  if (!projectUrls || typeof projectUrls !== 'object') return null;
  const wanted = ['repository', 'source', 'source code', 'code'];
  for (const [label, url] of Object.entries(projectUrls)) {
    if (typeof url !== 'string') continue;
    if (wanted.includes(label.toLowerCase())) return url;
  }
  return null;
}

/** MEDIUM-confidence fallback for PyPI: homepage / project_urls.Homepage. */
function pypiSecondaryOrNone(name, info, projectUrls) {
  const candidates = [];
  if (typeof info.home_page === 'string' && info.home_page) {
    candidates.push({ url: info.home_page, source: 'pypi.homepage' });
  }
  if (projectUrls && typeof projectUrls === 'object') {
    for (const [label, url] of Object.entries(projectUrls)) {
      if (typeof url !== 'string') continue;
      if (label.toLowerCase() === 'homepage') {
        candidates.push({ url, source: 'pypi.project_urls.homepage' });
      }
    }
  }
  for (const c of candidates) {
    const gh = extractGithubFromUrl(c.url);
    if (gh) {
      return {
        dependency: name,
        resolvedRepo: `${gh.owner}/${gh.repo}`,
        confidence: 'MEDIUM',
        source: c.source,
        verified: 'unverified',
      };
    }
  }
  return noneResult(name);
}

export const __internal = {
  identityCache,
  githubPkgJsonCache,
  pypiIdentityCache,
  githubPyProjectTomlCache,
  CACHE_TTL_MS,
  verdictForCrossCheck,
  verdictForPyProjectCrossCheck,
  extractPyProjectName,
  normalizePypiName,
};
