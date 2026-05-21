/**
 * Public-registry existence probe for dependency-confusion detection.
 *
 * Given a package name + ecosystem ('npm' or 'PyPI'), return whether the
 * public registry has a package by that name. The detector uses this to
 * escalate a static MEDIUM hit (name in `.opensoyce-private`) to an active
 * HIGH ("squat detected: an attacker has published this private name to
 * the public registry").
 *
 * Pure-ish: takes `deps.fetchImpl` and `deps.cache` so tests can stub both.
 * Defaults to `globalThis.fetch` and a module-level Map (24h TTL).
 *
 * Failure mode: ANY thrown error or non-200 response returns `false`. We
 * never want a network blip to fabricate a HIGH-confidence "active squat
 * detected" signal — the static MEDIUM stays the floor.
 */

const NPM_REGISTRY = 'https://registry.npmjs.org/';
const PYPI_REGISTRY = 'https://pypi.org/pypi/';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Module-level cache. Key: `${ecosystem}:${name}`. Value:
// `{ exists: boolean, expiresAt: number }`. Bounded only by 24h TTL — the
// per-scan private-list size is in single digits in practice.
const defaultCache = new Map();

/**
 * @param {string} name
 * @param {'npm' | 'PyPI'} ecosystem
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   cache?: Map<string, { exists: boolean, expiresAt: number }>,
 * }} [deps]
 * @returns {Promise<boolean>}
 */
export async function checkPublicRegistry(name, ecosystem, deps = {}) {
  if (typeof name !== 'string' || !name) return false;
  if (ecosystem !== 'npm' && ecosystem !== 'PyPI') return false;

  const fetchFn = deps.fetchImpl || globalThis.fetch;
  if (typeof fetchFn !== 'function') return false;
  const cache = deps.cache || defaultCache;

  const key = `${ecosystem}:${name}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.exists;

  const url = ecosystem === 'npm'
    ? `${NPM_REGISTRY}${encodeURIComponent(name)}`
    : `${PYPI_REGISTRY}${encodeURIComponent(name)}/json`;

  let exists = false;
  try {
    const res = await fetchFn(url, { method: 'GET' });
    if (res && res.ok) {
      exists = true;
    } else if (res && res.status === 404) {
      exists = false;
    } else {
      // 5xx, 403, anything else — treat as "unknown, don't escalate."
      exists = false;
    }
  } catch {
    exists = false;
  }

  cache.set(key, { exists, expiresAt: now + CACHE_TTL_MS });
  return exists;
}

export const __internal = { defaultCache, CACHE_TTL_MS };
