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

/** @returns {'npm-v1'|'npm-v2'|'npm-v3'|'yarn-v1'|'yarn-v2'|'package-json'|'unknown'} */
export function detectLockfileFormat(text) {
  if (typeof text !== 'string' || !text.trim()) return 'unknown';
  const t = text.trimStart();
  if (t.startsWith('# yarn lockfile v1')) return 'yarn-v1';
  if (t.includes('__metadata:')) return 'yarn-v2';
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

function tagged(code) { const e = new Error(code); e.code = code; return e; }

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
 * @param {Array<{name:string,version:string}>} packages
 * @param {typeof fetch=} fetchImpl
 * @param {{cache?:Map<string,{result:any[],expiresAt:number}>}=} opts
 */
export async function queryOsvBatch(packages, fetchImpl, opts = {}) {
  const fetchFn = fetchImpl || globalThis.fetch;
  if (typeof fetchFn !== 'function') throw new Error('NO_FETCH_AVAILABLE');
  const cache = opts.cache || defaultCache;
  const now = Date.now();

  const pending = [];
  const cachedResults = [];
  for (const p of packages) {
    if (!p || !p.name || !p.version) continue;
    const key = `${p.name}@${p.version}`;
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
        queries: chunk.map(p => ({ package: { name: p.name, ecosystem: 'npm' }, version: p.version })),
      }),
    });
    if (!res.ok) throw new Error(`OSV_BATCH_${res.status}`);
    const data = await res.json();
    const results = Array.isArray(data.results) ? data.results : [];
    chunk.forEach((p, idx) => {
      const vulns = results[idx] && Array.isArray(results[idx].vulns) ? results[idx].vulns : [];
      idsByKey.set(`${p.name}@${p.version}`, vulns.map(v => v.id).filter(Boolean));
    });
  }

  const allIds = new Set();
  for (const ids of idsByKey.values()) for (const id of ids) allIds.add(id);
  const details = await fetchVulnDetails([...allIds], fetchFn);

  const out = [...cachedResults];
  for (const p of pending) {
    const key = `${p.name}@${p.version}`;
    const ids = idsByKey.get(key) || [];
    const pkgResults = ids.length ? [mergeVulnRecords(p, ids, details)] : [];
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

function mergeVulnRecords(pkg, ids, details) {
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
    const fixed = extractFixedVersion(d, pkg.name);
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

function extractFixedVersion(vuln, pkgName) {
  if (!Array.isArray(vuln.affected)) return null;
  for (const a of vuln.affected) {
    if (!a || !a.package || a.package.ecosystem !== 'npm' || a.package.name !== pkgName) continue;
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

function finalizeInventory(format, byName, totalEntries) {
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

  return {
    format,
    packages,
    totals: {
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
    },
  };
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
