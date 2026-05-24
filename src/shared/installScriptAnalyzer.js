/**
 * OpenSoyce — Install-Script Capability Profiler (Phase 3).
 *
 * Statically analyzes npm package install scripts by examining the package
 * metadata from the public npm registry. Detects dangerous capability
 * patterns using regex heuristics without executing any code.
 *
 * ┌──────────────────┬──────────────────────────────────────────────────────┐
 * │ Capability       │ Patterns detected                                    │
 * ├──────────────────┼──────────────────────────────────────────────────────┤
 * │ network-fetch    │ https.get, http.get, fetch(, axios, curl, wget       │
 * │ child-process    │ child_process, exec(, spawn(, execSync               │
 * │ eval-exec        │ eval(, Function(, vm.runIn, new Function             │
 * │ env-access       │ process.env., HOME, APPDATA                          │
 * │ file-write       │ fs.write, fs.mkdir, createWriteStream, fs.appendFile │
 * │ native-binary    │ .node extension, node-gyp, node-pre-gyp, prebuildify │
 * └──────────────────┴──────────────────────────────────────────────────────┘
 *
 * Risk level heuristics:
 *   high   → network-fetch + child-process (supply-chain exfiltration combo)
 *   high   → eval-exec (arbitrary code execution)
 *   medium → network-fetch OR child-process alone
 *   low    → native-binary, file-write, or env-access only
 *   none   → no dangerous patterns detected
 *
 * The profiler only fetches from the public npm registry and caches results
 * in-process (1-hour TTL) per `name@version`. The fetch is injected via
 * `fetchImpl` so tests can run without network access.
 */

// ---------------------------------------------------------------------------
// Regex patterns per capability
// ---------------------------------------------------------------------------

const CAPABILITY_PATTERNS = /** @type {Array<{name: string, pattern: RegExp}>} */ ([
  {
    name: 'network-fetch',
    pattern:
      /\b(?:https?\.get|node-fetch|axios|fetch\s*\(|got\s*\(|request\s*\(|superagent)\b|["'`](?:curl|wget)\b/,
  },
  {
    name: 'child-process',
    pattern:
      /\b(?:child_process|exec\s*\(|execSync\s*\(|spawn\s*\(|spawnSync\s*\(|execFile\s*\(|fork\s*\()\b/,
  },
  {
    name: 'eval-exec',
    pattern:
      /\beval\s*\(|new\s+Function\s*\(|vm\.run(?:In(?:This|New)?Context|Script)\b/,
  },
  {
    name: 'env-access',
    pattern:
      /process\.env\.|(?<![a-zA-Z0-9_])(?:HOME|APPDATA|USERPROFILE|PATH|TEMP|TMP)(?![a-zA-Z0-9_])/,
  },
  {
    name: 'file-write',
    pattern:
      /\bfs\.(?:write|appendFile|mkdir|mkdirSync|createWriteStream|renameSync|rename|unlink)\b/,
  },
  {
    name: 'native-binary',
    pattern:
      /\bnode-gyp\b|\bnode-pre-gyp\b|\bprebuildify\b|\bprebuild\b|\bnapi-build\b|\.node['"`]/,
  },
]);

// ---------------------------------------------------------------------------
// Risk level calculation
// ---------------------------------------------------------------------------

/**
 * Calculate a risk level from a capability set.
 *
 * @param {Set<string>} caps
 * @returns {'none' | 'low' | 'medium' | 'high'}
 */
function calculateRiskLevel(caps) {
  // High: eval/exec (arbitrary code execution).
  if (caps.has('eval-exec')) return 'high';

  // High: network-fetch + child-process (classic supply-chain exfiltration).
  if (caps.has('network-fetch') && caps.has('child-process')) return 'high';

  // Medium: either network or subprocess alone.
  if (caps.has('network-fetch') || caps.has('child-process')) return 'medium';

  // Low: native binary compilation, env snooping, or file writes.
  if (caps.has('native-binary') || caps.has('env-access') || caps.has('file-write')) return 'low';

  return 'none';
}

// ---------------------------------------------------------------------------
// Script source collection from package metadata
// ---------------------------------------------------------------------------

/**
 * Extract all install-related script bodies from a package.json `scripts`
 * object. We examine: preinstall, install, postinstall, prepublish,
 * prepare, prepack.
 *
 * @param {Record<string, string>} scripts
 * @returns {string}
 */
function collectInstallScriptBodies(scripts) {
  if (!scripts || typeof scripts !== 'object') return '';
  const HOOKS = ['preinstall', 'install', 'postinstall', 'prepublish', 'prepare', 'prepack'];
  return HOOKS
    .map((h) => (typeof scripts[h] === 'string' ? scripts[h] : ''))
    .filter(Boolean)
    .join('\n');
}

// ---------------------------------------------------------------------------
// In-process cache
// ---------------------------------------------------------------------------

/** @type {Map<string, { result: CapabilityProfile, expiresAt: number }>} */
const profileCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ---------------------------------------------------------------------------
// Main exports
// ---------------------------------------------------------------------------

/**
 * @typedef {{ capabilities: string[], riskLevel: 'none' | 'low' | 'medium' | 'high' }} CapabilityProfile
 */

/**
 * Analyze a raw package.json string (the version-specific metadata object
 * from the npm registry) for dangerous install-script capabilities.
 * Pure function — no network access, fully testable.
 *
 * @param {string | object} pkgJson  Parsed or raw JSON string.
 * @returns {CapabilityProfile}
 */
export function analyzeInstallScript(pkgJson) {
  let meta;
  if (typeof pkgJson === 'string') {
    try {
      meta = JSON.parse(pkgJson);
    } catch {
      return { capabilities: [], riskLevel: 'none' };
    }
  } else if (pkgJson && typeof pkgJson === 'object') {
    meta = pkgJson;
  } else {
    return { capabilities: [], riskLevel: 'none' };
  }

  // Collect all install-hook bodies + any `bin` scripts to analyze.
  const scriptBody = collectInstallScriptBodies(meta.scripts || {});
  const caps = new Set();

  for (const { name, pattern } of CAPABILITY_PATTERNS) {
    if (pattern.test(scriptBody)) caps.add(name);
  }

  const capabilities = [...caps].sort();
  const riskLevel = calculateRiskLevel(caps);

  return { capabilities, riskLevel };
}

/**
 * Fetch a package's capability profile from the npm registry.
 * Results are cached in-process (1-hour TTL).
 *
 * Returns `null` on any network/parse failure — callers must be prepared
 * for a null profile (the chip stays hidden rather than crashing the scan).
 *
 * @param {string} name  Package name (e.g. "lodash")
 * @param {string} version  Exact version (e.g. "4.17.21")
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 * @returns {Promise<CapabilityProfile | null>}
 */
export async function fetchCapabilityProfile(name, version, opts = {}) {
  if (!name || !version) return null;

  const cacheKey = `${name}@${version}`;
  const now = Date.now();
  const cached = profileCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.result;

  const fetchFn = typeof opts.fetchImpl === 'function' ? opts.fetchImpl : fetch;

  let meta;
  try {
    // The registry's per-version endpoint returns the package.json for that
    // exact version — much lighter than the full packument.
    const res = await fetchFn(`https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`);
    if (!res.ok) {
      // 404 = unpublished/scoped package not on public registry — not an error.
      if (res.status !== 404) {
        console.warn(`installScriptAnalyzer: registry fetch ${res.status} for ${cacheKey}`);
      }
      return null;
    }
    meta = await res.json();
  } catch (err) {
    console.warn(
      `installScriptAnalyzer: fetchCapabilityProfile threw for ${cacheKey}:`,
      err && err.message ? err.message : err,
    );
    return null;
  }

  const result = analyzeInstallScript(meta);
  profileCache.set(cacheKey, { result, expiresAt: now + CACHE_TTL_MS });
  return result;
}

/**
 * Batch-fetch capability profiles for a list of install-script packages.
 * Uses bounded concurrency (default: 3) to stay well under npm rate limits.
 * Per-item failures are isolated — a null profile on one package never
 * stops the others.
 *
 * @param {Array<{ name: string, version: string }>} packages
 * @param {{ fetchImpl?: typeof fetch, concurrency?: number }} [opts]
 * @returns {Promise<Map<string, CapabilityProfile | null>>}  Keyed by "name@version"
 */
export async function batchFetchCapabilityProfiles(packages, opts = {}) {
  const { fetchImpl, concurrency = 3 } = opts;
  const results = new Map();

  if (!Array.isArray(packages) || packages.length === 0) return results;

  // Bounded concurrency via a simple worker-pool pattern.
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, packages.length) }, async () => {
    while (i < packages.length) {
      const idx = i++;
      const { name, version } = packages[idx];
      const key = `${name}@${version}`;
      try {
        results.set(key, await fetchCapabilityProfile(name, version, { fetchImpl }));
      } catch {
        results.set(key, null);
      }
    }
  });

  await Promise.all(workers);
  return results;
}

export const __internal = {
  CAPABILITY_PATTERNS,
  calculateRiskLevel,
  collectInstallScriptBodies,
};
