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
