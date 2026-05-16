/**
 * Lockfile parsing + OSV lookup. Pure: parseNpmLockfile, detectLockfileFormat.
 * queryOsvBatch does I/O but accepts fetchImpl for tests.
 * OSV /v1/querybatch returns vuln ids only; full details require /v1/vulns/{id}.
 */

const OSV_BATCH_URL = 'https://api.osv.dev/v1/querybatch';
const OSV_VULN_URL = 'https://api.osv.dev/v1/vulns/';
const BATCH_SIZE = 1000;
const CACHE_TTL_MS = 60 * 60 * 1000;

const defaultCache = new Map();    // `${name}@${version}` -> {result, expiresAt}
const vulnDetailCache = new Map(); // vuln id -> {data, expiresAt}

/** @returns {'npm-v1'|'npm-v2'|'npm-v3'|'yarn-v1'|'yarn-v2'|'package-json'|'uv-lock'|'poetry-lock'|'unknown'} */
export function detectLockfileFormat(text) {
  if (typeof text !== 'string' || !text.trim()) return 'unknown';
  const t = text.trimStart();
  if (t.startsWith('# yarn lockfile v1')) return 'yarn-v1';
  if (t.includes('__metadata:')) return 'yarn-v2';
  // Python lockfiles (TOML). Detect via the comment banner Poetry emits, and
  // via uv's distinctive top-level `version = N` + `requires-python` keys.
  // Both formats use [[package]] arrays so we can't disambiguate on that alone.
  // Order: poetry banner first (most specific), then uv heuristic, then a
  // generic [[package]]+[metadata] fall-through that we treat as poetry-lock
  // (the conservative default — poetry is the older / broader format).
  if (/^#\s*This file (is @generated|was generated) (by|automatically by) [Pp]oetry/m.test(t)) {
    return 'poetry-lock';
  }
  if (/^#\s*This file (is @generated|was generated) (by|automatically by) uv/m.test(t)) {
    return 'uv-lock';
  }
  // Content-based fall-through (no banner). uv.lock has `requires-python` at
  // the top level alongside `version = N`; poetry.lock has `lock-version` in
  // its `[metadata]` table.
  const looksToml = /^\s*\[\[package\]\]\s*$/m.test(t);
  if (looksToml) {
    if (/^\s*requires-python\s*=/m.test(t) && /^\s*version\s*=\s*\d+\s*$/m.test(t)) {
      return 'uv-lock';
    }
    if (/^\s*\[metadata\]\s*$/m.test(t) && /^\s*lock-version\s*=/m.test(t)) {
      return 'poetry-lock';
    }
  }
  if (!t.startsWith('{')) return 'unknown';
  let obj;
  try { obj = JSON.parse(t); } catch { return 'unknown'; }
  if (!obj || typeof obj !== 'object') return 'unknown';
  if (obj.lockfileVersion === 3) return 'npm-v3';
  if (obj.lockfileVersion === 2) return 'npm-v2';
  if (obj.lockfileVersion === 1) return 'npm-v1';
  const hasDeps = obj.dependencies || obj.devDependencies || obj.peerDependencies;
  if (hasDeps && !obj.packages) return 'package-json';
  return 'unknown';
}

/**
 * Map a detected lockfile format to its OSV ecosystem name. Single source of
 * truth so runScan + identity resolver dispatch + downstream filters all
 * agree. Returns 'unknown' for unparseable inputs so callers can decide
 * whether to query OSV at all.
 * @param {string} format
 * @returns {'npm'|'PyPI'|'unknown'}
 */
export function ecosystemForFormat(format) {
  if (format === 'npm-v1' || format === 'npm-v2' || format === 'npm-v3'
      || format === 'yarn-v1' || format === 'yarn-v2') {
    return 'npm';
  }
  if (format === 'uv-lock' || format === 'poetry-lock') return 'PyPI';
  return 'unknown';
}

/**
 * Regex-based extractor for Python TOML lockfile [[package]] arrays.
 *
 * We deliberately do NOT pull in a full TOML library — uv.lock and
 * poetry.lock use a tiny, well-bounded subset of TOML and a regex pass is
 * deterministic, dependency-free, and easy to audit. The extractor only
 * understands what these two files actually emit:
 *
 *   [[package]]
 *   name = "pkg"
 *   version = "1.2.3"
 *   optional = true
 *   category = "dev"          # legacy poetry
 *   source = { registry = "https://pypi.org/simple" }
 *
 * Inline tables (`source = { ... }`) are read as a single line — neither
 * lockfile generator multi-lines them in practice. Nested keys other than
 * source.* are ignored; callers only need name/version/optional/category/
 * source to build the inventory.
 *
 * @param {string} text
 * @returns {Array<{
 *   name: string|null,
 *   version: string|null,
 *   optional: boolean,
 *   category: string|null,
 *   source: { registry?: string, path?: string, git?: string, url?: string }|null,
 * }>}
 */
function extractPythonPackageBlocks(text) {
  /** @type {Array<any>} */
  const blocks = [];
  // Split the file into [[package]] sections. Each section ends at the next
  // top-level `[[...]]` or `[...]` header (with no leading whitespace) — the
  // [[package]] header itself sits at column 0 in both formats.
  const lines = text.split(/\r?\n/);
  let inPkg = false;
  /** @type {any} */
  let current = null;
  function flush() {
    if (current) blocks.push(current);
    current = null;
  }
  function makeBlock() {
    return { name: null, version: null, optional: false, category: null, source: null };
  }
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const line = raw.replace(/\s+$/, '');
    if (line.startsWith('[[')) {
      flush();
      inPkg = /^\[\[package\]\]\s*$/.test(line);
      if (inPkg) current = makeBlock();
      continue;
    }
    if (line.startsWith('[')) {
      // A new top-level table ends the current [[package]] block.
      flush();
      inPkg = false;
      continue;
    }
    if (!inPkg || !current) continue;
    if (!line.trim() || line.trim().startsWith('#')) continue;
    // Match `key = value` at the start of the line. Whitespace around `=`.
    const m = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(line);
    if (!m) continue;
    const key = m[1];
    const rawVal = m[2];
    if (key === 'name') current.name = unquoteToml(rawVal);
    else if (key === 'version') current.version = unquoteToml(rawVal);
    else if (key === 'optional') current.optional = /^true\b/i.test(rawVal.trim());
    else if (key === 'category') current.category = unquoteToml(rawVal);
    else if (key === 'source') current.source = parseInlineSourceTable(rawVal);
  }
  flush();
  return blocks;
}

/** Strip surrounding quotes from a TOML scalar (string or unquoted literal). */
function unquoteToml(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith('\'') && s.endsWith('\''))) {
    return s.slice(1, -1);
  }
  // Arrays / inline tables / numbers fall through — caller decides what to do.
  return s;
}

/**
 * Parse a `source = { registry = "...", path = "...", git = "..." }` inline
 * table into a flat object. Unknown keys are ignored. Returns null if the
 * value isn't an inline table.
 */
function parseInlineSourceTable(rawVal) {
  const trimmed = rawVal.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
  const body = trimmed.slice(1, -1);
  /** @type {Record<string,string>} */
  const out = {};
  // Split on commas that are NOT inside quotes. Inline-table values are
  // simple key="quoted-string" pairs in practice for both lockfiles.
  const parts = body.match(/(?:[^,"']|"[^"]*"|'[^']*')+/g) || [];
  for (const part of parts) {
    const m = /^\s*([A-Za-z0-9_-]+)\s*=\s*(.+?)\s*$/.exec(part);
    if (!m) continue;
    const key = m[1];
    const val = unquoteToml(m[2]);
    if (val != null) out[key] = val;
  }
  return out;
}

/**
 * Find names listed under the uv.lock root [manifest] section's
 * `dependencies = [ ... ]` array. Returns null if no manifest is present
 * (uv may omit it for single-project lockfiles emitted in workspace mode).
 *
 * uv.lock's manifest looks like:
 *   [manifest]
 *   members = ["myproject"]
 *
 *   [[manifest.dependency]]
 *   name = "requests"
 *
 *   [[manifest.dependency]]
 *   name = "langchain"
 *
 * Older uv.lock layouts use an inline `dependencies = ["requests", "langchain"]`
 * under [manifest]. Handle both.
 *
 * @param {string} text
 * @returns {Set<string>|null}
 */
function extractUvDirectSet(text) {
  const out = new Set();
  let found = false;
  const lines = text.split(/\r?\n/);
  let section = null;
  let inManifestDepBlock = false;
  let pendingDepName = null;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (/^\[\[manifest\.dependency\]\]\s*$/.test(line)) {
      found = true;
      if (pendingDepName) out.add(pendingDepName);
      pendingDepName = null;
      inManifestDepBlock = true;
      section = '[[manifest.dependency]]';
      continue;
    }
    if (/^\[\[/.test(line) || /^\[/.test(line)) {
      if (pendingDepName) out.add(pendingDepName);
      pendingDepName = null;
      inManifestDepBlock = false;
      section = line;
      if (/^\[manifest\]\s*$/.test(line)) found = true;
      continue;
    }
    if (inManifestDepBlock) {
      const m = /^name\s*=\s*(.+)$/.exec(line);
      if (m) pendingDepName = unquoteToml(m[1]);
      continue;
    }
    // Inline `dependencies = ["a", "b"]` under [manifest].
    if (section && /^\[manifest\]/.test(section)) {
      const m = /^dependencies\s*=\s*\[(.+)\]\s*$/.exec(line);
      if (m) {
        found = true;
        const parts = m[1].split(',').map(s => unquoteToml(s.trim())).filter(Boolean);
        for (const name of parts) out.add(name);
      }
    }
  }
  if (pendingDepName) out.add(pendingDepName);
  return found ? out : null;
}

function tagged(code) { const e = new Error(code); e.code = code; return e; }

/**
 * Parse any supported lockfile (npm or Python) into the same shape. Dispatches
 * on the detected format. Returns the same `{ ecosystem, direct, all }` shape
 * regardless of input — the only difference is `ecosystem` ('npm' or 'PyPI'),
 * which downstream uses for OSV queries and resolver dispatch.
 *
 * @param {string} text
 * @returns {{ ecosystem:'npm'|'PyPI', direct:string[], all:Array<{name:string,version:string}> }}
 */
export function parseLockfile(text) {
  const fmt = detectLockfileFormat(text);
  if (fmt === 'uv-lock' || fmt === 'poetry-lock') {
    return parsePythonLockfile(text, fmt);
  }
  return parseNpmLockfile(text);
}

/**
 * Parse a Python lockfile (uv.lock or poetry.lock) into the unified shape.
 * Pure: extracts [[package]] blocks via regex, dedupes by name (first-seen
 * version wins, matching npm parser semantics).
 *
 * Direct detection: uv.lock carries a [[manifest.dependency]] list of top-
 * level deps; we use it when present. poetry.lock has no native
 * direct-vs-transitive marker without a companion pyproject.toml — every
 * package is reported as transitive (honest fallback; the inventory builder
 * separately sets `directUnknown: true` so the UI/Risk Profile can surface
 * the caveat).
 *
 * @param {string} text
 * @param {'uv-lock'|'poetry-lock'} format
 * @returns {{ ecosystem:'PyPI', direct:string[], all:Array<{name:string,version:string}> }}
 */
export function parsePythonLockfile(text, format) {
  if (format !== 'uv-lock' && format !== 'poetry-lock') {
    throw tagged('UNPARSEABLE_LOCKFILE');
  }
  const blocks = extractPythonPackageBlocks(text);
  /** @type {Map<string,string>} */
  const all = new Map();
  for (const b of blocks) {
    if (!b.name || !b.version) continue;
    if (!all.has(b.name)) all.set(b.name, b.version);
  }
  let direct = [];
  if (format === 'uv-lock') {
    const directSet = extractUvDirectSet(text);
    if (directSet) direct = [...directSet].filter(n => all.has(n)).sort();
  }
  // poetry-lock: direct stays empty (honest unknown).
  return {
    ecosystem: 'PyPI',
    direct,
    all: [...all.entries()].map(([name, version]) => ({ name, version })),
  };
}

/**
 * Parse an npm package-lock.json (v1/v2/v3) into a flat package list.
 * @param {string} text
 * @returns {{ ecosystem:'npm', direct:string[], all:Array<{name:string,version:string}> }}
 */
export function parseNpmLockfile(text) {
  const fmt = detectLockfileFormat(text);
  if (fmt === 'package-json') throw tagged('PACKAGE_JSON_NOT_SUPPORTED');
  if (fmt !== 'npm-v1' && fmt !== 'npm-v2' && fmt !== 'npm-v3') throw tagged('UNPARSEABLE_LOCKFILE');
  let obj;
  try { obj = JSON.parse(text); } catch { throw tagged('UNPARSEABLE_LOCKFILE'); }

  const all = new Map();  // name -> first-seen version (dedupe)
  const direct = new Set();

  if (fmt === 'npm-v1') {
    walkV1Deps(obj.dependencies || {}, all, direct, true);
  } else {
    for (const [key, meta] of Object.entries(obj.packages || {})) {
      if (key === '' || !meta || typeof meta !== 'object') continue;
      if (meta.link === true || typeof meta.version !== 'string') continue;
      const name = nameFromKey(key);
      if (!name) continue;
      if (!all.has(name)) all.set(name, meta.version);
      if (isTopLevelKey(key)) direct.add(name);
    }
  }

  return {
    ecosystem: 'npm',
    direct: [...direct].sort(),
    all: [...all.entries()].map(([name, version]) => ({ name, version })),
  };
}

function nameFromKey(key) {
  const idx = key.lastIndexOf('node_modules/');
  const tail = idx >= 0 ? key.slice(idx + 13) : key;
  return tail || null;
}
function isTopLevelKey(key) {
  if (!key.startsWith('node_modules/')) return false;
  return !key.slice(13).includes('/node_modules/');
}
function walkV1Deps(deps, all, direct, topLevel) {
  for (const [name, meta] of Object.entries(deps)) {
    if (!meta || typeof meta !== 'object') continue;
    if (typeof meta.version === 'string' && !all.has(name)) all.set(name, meta.version);
    if (topLevel) direct.add(name);
    if (meta.dependencies) walkV1Deps(meta.dependencies, all, direct, false);
  }
}

/**
 * Query OSV in batches and return per-package vulnerability summaries.
 * Omits non-vulnerable packages from the result.
 *
 * The ecosystem is supplied per scan (single scan = single ecosystem) and
 * threaded into every OSV `package` query plus the affected-range filter
 * used when extracting the fixedIn version. The cache key includes the
 * ecosystem so a 'PyPI' lookup of `requests@2.0.0` cannot bleed into a
 * later 'npm' lookup of a same-named package (theoretical, but the cost
 * of guarding is zero).
 *
 * @param {Array<{name:string,version:string}>} packages
 * @param {typeof fetch=} fetchImpl
 * @param {{cache?:Map<string,{result:any[],expiresAt:number}>, ecosystem?:'npm'|'PyPI'}=} opts
 */
export async function queryOsvBatch(packages, fetchImpl, opts = {}) {
  const fetchFn = fetchImpl || globalThis.fetch;
  if (typeof fetchFn !== 'function') throw new Error('NO_FETCH_AVAILABLE');
  const cache = opts.cache || defaultCache;
  const ecosystem = opts.ecosystem || 'npm';
  const now = Date.now();

  const pending = [];
  const cachedResults = [];
  for (const p of packages) {
    if (!p || !p.name || !p.version) continue;
    const key = `${ecosystem}:${p.name}@${p.version}`;
    const hit = cache.get(key);
    if (hit && hit.expiresAt > now) cachedResults.push(...hit.result);
    else pending.push(p);
  }

  const idsByKey = new Map();
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const chunk = pending.slice(i, i + BATCH_SIZE);
    const res = await fetchFn(OSV_BATCH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        queries: chunk.map(p => ({ package: { name: p.name, ecosystem }, version: p.version })),
      }),
    });
    if (!res.ok) throw new Error(`OSV_BATCH_${res.status}`);
    const data = await res.json();
    const results = Array.isArray(data.results) ? data.results : [];
    chunk.forEach((p, idx) => {
      const vulns = results[idx] && Array.isArray(results[idx].vulns) ? results[idx].vulns : [];
      idsByKey.set(`${ecosystem}:${p.name}@${p.version}`, vulns.map(v => v.id).filter(Boolean));
    });
  }

  const allIds = new Set();
  for (const ids of idsByKey.values()) for (const id of ids) allIds.add(id);
  const details = await fetchVulnDetails([...allIds], fetchFn);

  const out = [...cachedResults];
  for (const p of pending) {
    const key = `${ecosystem}:${p.name}@${p.version}`;
    const ids = idsByKey.get(key) || [];
    const pkgResults = ids.length ? [mergeVulnRecords(p, ids, details, ecosystem)] : [];
    cache.set(key, { result: pkgResults, expiresAt: now + CACHE_TTL_MS });
    out.push(...pkgResults);
  }
  return out;
}

async function fetchVulnDetails(ids, fetchFn) {
  const map = new Map();
  const now = Date.now();
  const need = [];
  for (const id of ids) {
    const hit = vulnDetailCache.get(id);
    if (hit && hit.expiresAt > now) map.set(id, hit.data);
    else need.push(id);
  }
  const CONCURRENCY = 8;
  for (let i = 0; i < need.length; i += CONCURRENCY) {
    const slice = need.slice(i, i + CONCURRENCY);
    const fetched = await Promise.all(slice.map(async id => {
      const res = await fetchFn(OSV_VULN_URL + encodeURIComponent(id));
      if (!res.ok) return [id, null];
      return [id, await res.json()];
    }));
    for (const [id, data] of fetched) {
      if (data) {
        map.set(id, data);
        vulnDetailCache.set(id, { data, expiresAt: now + CACHE_TTL_MS });
      }
    }
  }
  return map;
}

function mergeVulnRecords(pkg, ids, details, ecosystem) {
  const severities = [];
  const aliasIds = new Set(ids);
  let summary = '';
  let fixedIn = null;
  for (const id of ids) {
    const d = details.get(id);
    if (!d) continue;
    if (!summary && typeof d.summary === 'string') summary = d.summary;
    if (Array.isArray(d.aliases)) for (const a of d.aliases) aliasIds.add(a);
    severities.push(extractSeverity(d));
    const fixed = extractFixedVersion(d, pkg.name, ecosystem || 'npm');
    if (fixed && (!fixedIn || compareSemverLoose(fixed, fixedIn) < 0)) fixedIn = fixed;
  }
  return {
    package: pkg.name,
    version: pkg.version,
    severity: pickWorstSeverity(severities),
    ids: [...aliasIds].sort(),
    summary: summary || ids[0] || '',
    fixedIn,
  };
}

function extractSeverity(vuln) {
  if (Array.isArray(vuln.severity)) {
    for (const s of vuln.severity) {
      if (s && s.type === 'CVSS_V3' && typeof s.score === 'string') return severityFromCvssVector(s.score);
    }
  }
  const ds = vuln.database_specific && vuln.database_specific.severity;
  if (typeof ds === 'string') return ds.toLowerCase();
  return 'unknown';
}

// Heuristic CVSS v3 vector -> bucket. OSV ships the vector string only,
// not the precomputed base score. Mapping by impact-metric count + scope.
function severityFromCvssVector(vec) {
  const parts = Object.fromEntries(
    vec.split('/').slice(1).map(p => p.split(':')).filter(p => p.length === 2)
  );
  const impactCount = ['C', 'I', 'A'].filter(k => parts[k] === 'H').length;
  if (parts.S === 'C' && impactCount >= 2) return 'critical';
  if (impactCount >= 2) return 'high';
  if (impactCount === 1) return 'medium';
  return 'low';
}

function extractFixedVersion(vuln, pkgName, ecosystem) {
  if (!Array.isArray(vuln.affected)) return null;
  const eco = ecosystem || 'npm';
  for (const a of vuln.affected) {
    if (!a || !a.package || a.package.ecosystem !== eco || a.package.name !== pkgName) continue;
    if (!Array.isArray(a.ranges)) continue;
    for (const r of a.ranges) {
      if (!Array.isArray(r.events)) continue;
      for (const ev of r.events) if (ev && typeof ev.fixed === 'string') return ev.fixed;
    }
  }
  return null;
}

const RANK = { unknown: 0, low: 1, medium: 2, high: 3, critical: 4 };
function pickWorstSeverity(list) {
  let worst = 'unknown';
  for (const s of list) if ((RANK[s] || 0) > (RANK[worst] || 0)) worst = s;
  return worst;
}

function compareSemverLoose(a, b) {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d !== 0) return d; }
  return 0;
}

export const __internal = { defaultCache, vulnDetailCache, severityFromCvssVector, extractFixedVersion };

/**
 * Scanner v3a — whole-tree dependency inventory.
 *
 * Pure. Takes either the lockfile *text* or an already-parsed object and
 * returns an inventory grouped by package name. We deliberately trust the
 * lockfile's own flags (`dev`, `optional`, `devOptional`) and do NOT
 * cross-reference any package.json — if a flag isn't present, scope is
 * `unknown`. Scope precedence when a package appears with multiple flag
 * combos (e.g. one dev install + one prod install): prod > optional > dev
 * > unknown. The most-permissive wins so the user never thinks a prod dep
 * is dev-only.
 *
 * @param {string|object} lockfile  raw text or pre-parsed lockfile object
 * @returns {{
 *   format: 'npm-v3'|'npm-v2'|'npm-v1'|'yarn-v1'|'unknown',
 *   packages: Array<{
 *     name: string,
 *     versions: string[],
 *     direct: boolean,
 *     scope: 'prod'|'dev'|'optional'|'unknown',
 *     hasLicense: boolean,
 *     hasRepository: boolean,
 *   }>,
 *   totals: {
 *     totalPackages: number,
 *     totalEntries: number,
 *     directCount: number,
 *     transitiveCount: number,
 *     prodCount: number,
 *     devCount: number,
 *     optionalCount: number,
 *     unknownScopeCount: number,
 *     duplicateCount: number,
 *     missingLicenseCount: number,
 *     missingRepositoryCount: number,
 *   },
 * }}
 */
export function buildInventory(lockfile) {
  const empty = emptyInventory();
  if (lockfile == null) return empty;

  let format = 'unknown';
  let obj = null;
  if (typeof lockfile === 'string') {
    format = detectLockfileFormat(lockfile);
    if (format === 'yarn-v1') {
      return buildYarnV1Inventory(lockfile);
    }
    if (format === 'uv-lock' || format === 'poetry-lock') {
      return buildPythonInventory(lockfile, format);
    }
    if (format !== 'npm-v1' && format !== 'npm-v2' && format !== 'npm-v3') {
      return empty;
    }
    try { obj = JSON.parse(lockfile); } catch { return empty; }
  } else if (typeof lockfile === 'object') {
    obj = lockfile;
    if (obj.lockfileVersion === 3) format = 'npm-v3';
    else if (obj.lockfileVersion === 2) format = 'npm-v2';
    else if (obj.lockfileVersion === 1) format = 'npm-v1';
    else return empty;
  } else {
    return empty;
  }

  // Aggregator: per-package-name accumulator.
  /** @type {Map<string, { versions: Set<string>, direct: boolean, scopes: Set<string>, hasLicense: boolean, hasRepository: boolean }>} */
  const byName = new Map();
  let totalEntries = 0;

  function record(name, version, { direct, scope, hasLicense, hasRepository }) {
    if (!name) return;
    totalEntries += 1;
    let acc = byName.get(name);
    if (!acc) {
      acc = {
        versions: new Set(),
        direct: false,
        scopes: new Set(),
        hasLicense: false,
        hasRepository: false,
      };
      byName.set(name, acc);
    }
    if (version) acc.versions.add(version);
    if (direct) acc.direct = true;
    acc.scopes.add(scope);
    if (hasLicense) acc.hasLicense = true;
    if (hasRepository) acc.hasRepository = true;
  }

  if (format === 'npm-v3' || format === 'npm-v2') {
    // npm v2/v3 lockfiles flat-hoist every package to `node_modules/<name>`,
    // even deeply-transitive ones. The only reliable signal for "direct"
    // is the root entry's declared dependency maps. Build that set once.
    const trueDirectSet = collectRootDirectDeps(obj.packages || {});
    for (const [key, meta] of Object.entries(obj.packages || {})) {
      if (key === '' || !meta || typeof meta !== 'object') continue;
      if (meta.link === true) continue;
      if (typeof meta.version !== 'string') continue;
      // Aliased install: `node_modules/<alias>` carries a `name` field with
      // the real package name (npm install <alias>@npm:<real>). Honor the
      // declared name so the inventory groups by the real package.
      const aliasedName = typeof meta.name === 'string' && meta.name.length > 0
        ? meta.name
        : null;
      const name = aliasedName || nameFromKey(key);
      if (!name) continue;
      // Direct iff name appears in root entry's declared dep maps AND the
      // lockfile placed it at the top level (not nested under another pkg).
      const direct = isTopLevelKey(key) && trueDirectSet.has(name);
      const scope = scopeFromMeta(meta);
      record(name, meta.version, {
        direct,
        scope,
        hasLicense: hasField(meta, 'license'),
        hasRepository: hasField(meta, 'repository'),
      });
    }
  } else if (format === 'npm-v1') {
    walkV1ForInventory(obj.dependencies || {}, record, true);
  }

  return finalizeInventory(format, byName, totalEntries);
}

function emptyInventory() {
  return {
    format: 'unknown',
    ecosystem: 'unknown',
    packages: [],
    totals: {
      totalPackages: 0,
      totalEntries: 0,
      directCount: 0,
      transitiveCount: 0,
      prodCount: 0,
      devCount: 0,
      optionalCount: 0,
      unknownScopeCount: 0,
      duplicateCount: 0,
      missingLicenseCount: 0,
      missingRepositoryCount: 0,
    },
  };
}

/**
 * Read the root entry (`packages[""]`) and return the set of package names
 * that are truly direct dependencies of the project. A name is direct iff
 * it appears in dependencies / devDependencies / optionalDependencies /
 * peerDependencies of the root entry.
 * @param {Record<string, any>} packages
 * @returns {Set<string>}
 */
function collectRootDirectDeps(packages) {
  const out = new Set();
  const root = packages && packages[''];
  if (!root || typeof root !== 'object') return out;
  const buckets = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
  for (const bucket of buckets) {
    const map = root[bucket];
    if (!map || typeof map !== 'object') continue;
    for (const name of Object.keys(map)) {
      if (typeof name === 'string' && name.length > 0) out.add(name);
    }
  }
  return out;
}

function scopeFromMeta(meta) {
  // Lockfile flag semantics (npm v2/v3):
  //   dev: true          → devDependency only
  //   optional: true     → optionalDependency (still prod-shipping unless devOptional)
  //   devOptional: true  → dev's optional, never prod
  //   none of the above  → prod
  // We collapse `optional` to scope:'optional' and let `record()` resolve
  // precedence when the same package appears under multiple keys.
  if (meta.devOptional === true) return 'dev';
  if (meta.optional === true) return 'optional';
  if (meta.dev === true) return 'dev';
  // No flags present: in npm v2/v3 this means the dep is a production
  // (or peer) install. v1 lockfiles sometimes omit flags entirely; that
  // case is handled separately by walkV1ForInventory.
  return 'prod';
}

function hasField(meta, key) {
  if (!Object.prototype.hasOwnProperty.call(meta, key)) return false;
  const v = meta[key];
  if (v == null) return false;
  if (typeof v === 'string') return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return Boolean(v);
}

// Scope precedence: most permissive wins so users never see a prod dep
// labeled "dev-only". prod > optional > dev > unknown.
const SCOPE_RANK = { prod: 3, optional: 2, dev: 1, unknown: 0 };
function mergeScopes(scopes) {
  let best = 'unknown';
  for (const s of scopes) {
    if ((SCOPE_RANK[s] || 0) > (SCOPE_RANK[best] || 0)) best = s;
  }
  return best;
}

function walkV1ForInventory(deps, record, topLevel) {
  for (const [name, meta] of Object.entries(deps)) {
    if (!meta || typeof meta !== 'object') continue;
    const version = typeof meta.version === 'string' ? meta.version : '';
    // v1 lockfiles often lack flags entirely. Honor what we have (dev,
    // optional) and otherwise default scope to 'unknown' — we will NOT
    // guess prod just because the flag is missing.
    let scope = 'unknown';
    if (meta.optional === true) scope = 'optional';
    else if (meta.dev === true) scope = 'dev';
    else if (meta.dev === false || meta.optional === false) scope = 'prod';
    record(name, version, {
      direct: topLevel,
      scope,
      hasLicense: hasField(meta, 'license'),
      hasRepository: hasField(meta, 'repository'),
    });
    if (meta.dependencies) walkV1ForInventory(meta.dependencies, record, false);
  }
}

function finalizeInventory(format, byName, totalEntries, opts = {}) {
  /** @type {Array<{name:string,versions:string[],direct:boolean,scope:string,hasLicense:boolean,hasRepository:boolean}>} */
  const packages = [];
  let directCount = 0;
  let transitiveCount = 0;
  let prodCount = 0;
  let devCount = 0;
  let optionalCount = 0;
  let unknownScopeCount = 0;
  let duplicateCount = 0;
  let missingLicenseCount = 0;
  let missingRepositoryCount = 0;

  const names = [...byName.keys()].sort((a, b) => a.localeCompare(b));
  for (const name of names) {
    const acc = byName.get(name);
    const versions = [...acc.versions].sort(compareVersionsLoose);
    const scope = mergeScopes(acc.scopes);
    const direct = acc.direct;

    packages.push({
      name,
      versions,
      direct,
      scope,
      hasLicense: acc.hasLicense,
      hasRepository: acc.hasRepository,
    });

    if (direct) directCount += 1; else transitiveCount += 1;
    if (scope === 'prod') prodCount += 1;
    else if (scope === 'dev') devCount += 1;
    else if (scope === 'optional') optionalCount += 1;
    else unknownScopeCount += 1;
    if (versions.length > 1) duplicateCount += 1;
    if (!acc.hasLicense) missingLicenseCount += 1;
    if (!acc.hasRepository) missingRepositoryCount += 1;
  }

  const ecosystem = ecosystemForFormat(format);
  /** @type {any} */
  const totals = {
    totalPackages: packages.length,
    totalEntries,
    directCount,
    transitiveCount,
    prodCount,
    devCount,
    optionalCount,
    unknownScopeCount,
    duplicateCount,
    missingLicenseCount,
    missingRepositoryCount,
  };
  if (opts.directUnknown) totals.directUnknown = true;
  return {
    format,
    ecosystem,
    packages,
    totals,
  };
}

/**
 * Build inventory for a Python lockfile (uv.lock or poetry.lock).
 *
 * Direct detection differs by format:
 *   - uv.lock: read the [[manifest.dependency]] / [manifest] section; names
 *     listed there are direct, everything else is transitive.
 *   - poetry.lock: native format has no direct-vs-transitive marker without
 *     a companion pyproject.toml. v0: treat every package as transitive and
 *     set `totals.directUnknown: true` so consumers can surface a caveat.
 *
 * Scope detection:
 *   - poetry's legacy `category = "dev"` field maps to scope 'dev'.
 *   - `optional = true` (either format) maps to scope 'optional'.
 *   - Otherwise scope 'unknown' for uv (no native equivalent) and 'prod'
 *     for poetry (poetry's default-category was 'main' = production).
 */
function buildPythonInventory(text, format) {
  const blocks = extractPythonPackageBlocks(text);
  const directSet = format === 'uv-lock' ? extractUvDirectSet(text) : null;
  const directUnknown = format === 'poetry-lock';

  /** @type {Map<string, { versions: Set<string>, direct: boolean, scopes: Set<string>, hasLicense: boolean, hasRepository: boolean }>} */
  const byName = new Map();
  let totalEntries = 0;

  for (const b of blocks) {
    if (!b.name) continue;
    totalEntries += 1;
    let acc = byName.get(b.name);
    if (!acc) {
      acc = {
        versions: new Set(),
        direct: false,
        scopes: new Set(),
        hasLicense: false,
        hasRepository: false,
      };
      byName.set(b.name, acc);
    }
    if (b.version) acc.versions.add(b.version);
    if (directSet && directSet.has(b.name)) acc.direct = true;
    // Scope mapping.
    let scope = 'unknown';
    if (b.optional) scope = 'optional';
    else if (b.category === 'dev') scope = 'dev';
    else if (format === 'poetry-lock' && (b.category === 'main' || b.category == null)) {
      // Poetry's default category is 'main' (production). Newer poetry omits
      // the field entirely — same meaning. We mark this as 'prod' so the
      // tier classifier in selectHealthCandidates can act on it. The
      // direct/transitive question is governed separately by directUnknown.
      scope = 'prod';
    } else if (format === 'uv-lock') {
      // uv.lock has no scope flags — packages are just packages. Honest
      // 'unknown' here keeps downstream from treating everything as prod.
      scope = 'unknown';
    }
    acc.scopes.add(scope);
    // Source field doesn't carry license/repository for Python lockfiles;
    // both stay false. The resolver pulls repository info from PyPI directly.
  }

  return finalizeInventory(format, byName, totalEntries, { directUnknown });
}

function compareVersionsLoose(a, b) {
  const cmp = compareSemverLoose(a, b);
  if (cmp !== 0) return cmp;
  return a.localeCompare(b);
}

/**
 * Yarn v1 best-effort inventory. The yarn.lock format lists name@range →
 * { version, resolved, integrity, dependencies }. We can count unique
 * packages and their versions, but we cannot reliably infer prod/dev or
 * direct/transitive without the consuming package.json. All scope and
 * direct fields fall back to 'unknown' / false; the UI shows a note.
 */
function buildYarnV1Inventory(text) {
  const inv = emptyInventory();
  inv.format = 'yarn-v1';
  inv.ecosystem = 'npm';
  /** @type {Map<string, { versions: Set<string>, hasLicense: boolean, hasRepository: boolean }>} */
  const byName = new Map();
  let totalEntries = 0;

  // Parse yarn v1 blocks naively: each block starts with a non-indented
  // line containing one or more "name@range" specs (comma-separated) and
  // ends at the next blank line. Inside the block, `version "x.y.z"` is
  // the resolved version.
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line || line.startsWith('#') || /^\s/.test(line)) { i += 1; continue; }
    // Block header. Strip trailing colon and quotes.
    const header = line.replace(/:\s*$/, '');
    const specs = header.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
    // Collect block body.
    let version = '';
    let hasLicense = false;
    let hasRepository = false;
    let j = i + 1;
    while (j < lines.length && /^\s/.test(lines[j])) {
      const body = lines[j].trim();
      if (body.startsWith('version ')) {
        version = body.slice(8).trim().replace(/^"|"$/g, '');
      } else if (body.startsWith('license ') || body === 'license:') {
        hasLicense = true;
      } else if (body.startsWith('repository ') || body === 'repository:') {
        hasRepository = true;
      }
      j += 1;
    }
    // For each spec in the header, resolve the package name (left side of
    // the right-most @ that is not at index 0 — handles @scope/pkg@range).
    for (const spec of specs) {
      const at = spec.lastIndexOf('@');
      if (at <= 0) continue;
      const name = spec.slice(0, at);
      if (!name) continue;
      totalEntries += 1;
      let acc = byName.get(name);
      if (!acc) {
        acc = { versions: new Set(), hasLicense: false, hasRepository: false };
        byName.set(name, acc);
      }
      if (version) acc.versions.add(version);
      if (hasLicense) acc.hasLicense = true;
      if (hasRepository) acc.hasRepository = true;
    }
    i = j + 1;
  }

  const names = [...byName.keys()].sort((a, b) => a.localeCompare(b));
  let duplicateCount = 0;
  let missingLicenseCount = 0;
  let missingRepositoryCount = 0;
  for (const name of names) {
    const acc = byName.get(name);
    const versions = [...acc.versions].sort(compareVersionsLoose);
    inv.packages.push({
      name,
      versions,
      direct: false,           // unknown for yarn v1; UI surfaces this.
      scope: 'unknown',        // unknown for yarn v1; UI surfaces this.
      hasLicense: acc.hasLicense,
      hasRepository: acc.hasRepository,
    });
    if (versions.length > 1) duplicateCount += 1;
    if (!acc.hasLicense) missingLicenseCount += 1;
    if (!acc.hasRepository) missingRepositoryCount += 1;
  }

  inv.totals.totalPackages = inv.packages.length;
  inv.totals.totalEntries = totalEntries;
  inv.totals.directCount = 0;
  inv.totals.transitiveCount = 0;
  inv.totals.prodCount = 0;
  inv.totals.devCount = 0;
  inv.totals.optionalCount = 0;
  inv.totals.unknownScopeCount = inv.packages.length;
  inv.totals.duplicateCount = duplicateCount;
  inv.totals.missingLicenseCount = missingLicenseCount;
  inv.totals.missingRepositoryCount = missingRepositoryCount;
  return inv;
}
