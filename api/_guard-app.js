/**
 * OpenSoyce Guard — GitHub App helpers.
 *
 * Underscore prefix tells Vercel to skip this file when auto-mapping
 * `api/*.js` to routes (Vercel only routes files NOT starting with `_`).
 *
 * Why we hand-roll JWT signing with node:crypto:
 *   - No new dependency footprint. GitHub App JWT is RS256 with a tiny
 *     fixed claim set; jsonwebtoken would be overkill.
 *   - Matches the pattern already used in api/github-webhook.js so the
 *     two webhook handlers share crypto idioms.
 *
 * Private key transit:
 *   - GitHub gives you a PEM file. PEMs contain newlines which Vercel /
 *     most env-var UIs mangle. We require the operator to base64-encode
 *     the full PEM bytes and stash in GUARD_APP_PRIVATE_KEY_BASE64.
 *   - decodePrivateKey() round-trips that back to a usable PEM string.
 */

import crypto from 'node:crypto';

/**
 * Installation token cache — per warm function instance.
 *
 * GitHub installation tokens are valid ~1 hour. A typical webhook uses one
 * for ~5 seconds, so on a busy installation 80%+ of webhook invocations
 * landing on the same warm instance can reuse a cached token instead of
 * paying for a fresh App-JWT mint + token-exchange round trip.
 *
 * Keyed by installationId. Value shape:
 *   { token: string, expiresAt: number (ms epoch), fetchedAt: number (ms epoch) }
 *
 * Eviction: when at CACHE_MAX_ENTRIES cap, drop the oldest insertion
 * (Map iteration order is insertion order, so keys().next().value is
 * the oldest fetchedAt).
 *
 * Cold starts re-mint (the Map lives in module scope and dies with the
 * function instance). Rejected/revoked tokens are not invalidated here —
 * the next API call will 401 and the webhook error path will surface it.
 * Adding 401-driven cache invalidation is a follow-up.
 */
const INSTALLATION_TOKEN_CACHE = new Map();
const TOKEN_SAFETY_MARGIN_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

function base64url(bufOrString) {
  const buf = Buffer.isBuffer(bufOrString) ? bufOrString : Buffer.from(bufOrString, 'utf8');
  return buf.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

/**
 * Decode the base64-encoded PEM private key from env. Accepts either:
 *   - Pure base64 of the raw PEM file bytes (recommended).
 *   - A raw PEM string with literal "\n" escape sequences (fallback —
 *     some operators paste the PEM directly with escape chars).
 *
 * @param {string} rawEnvValue
 * @returns {string} PEM string with real newlines.
 */
export function decodePrivateKey(rawEnvValue) {
  if (!rawEnvValue) throw new Error('GUARD_APP_PRIVATE_KEY_BASE64 missing');
  const trimmed = rawEnvValue.trim();
  // If it already looks like a PEM (BEGIN marker present), just normalize \n.
  if (trimmed.includes('BEGIN') && trimmed.includes('PRIVATE KEY')) {
    return trimmed.replace(/\\n/g, '\n');
  }
  // Otherwise treat as base64 of PEM bytes.
  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
    if (!decoded.includes('BEGIN') || !decoded.includes('PRIVATE KEY')) {
      throw new Error('decoded value is not a PEM');
    }
    return decoded;
  } catch (err) {
    throw new Error(`GUARD_APP_PRIVATE_KEY_BASE64 decode failed: ${err.message}`);
  }
}

/**
 * Sign a short-lived JWT (RS256) for the GitHub App.
 *
 * GitHub requires:
 *   - alg: RS256
 *   - iat: issued-at (we subtract 60s to absorb clock skew)
 *   - exp: not more than 10 minutes after iat (we use 9 min)
 *   - iss: the App ID
 *
 * @param {string|number} [appId]      defaults to process.env.GUARD_APP_ID
 * @param {string}        [privateKey] defaults to decoded GUARD_APP_PRIVATE_KEY_BASE64
 * @returns {string} the signed JWT
 */
export function generateAppJwt(appId, privateKey) {
  const id = appId ?? process.env.GUARD_APP_ID;
  if (!id) throw new Error('GUARD_APP_ID missing');
  const pem = privateKey ?? decodePrivateKey(process.env.GUARD_APP_PRIVATE_KEY_BASE64);

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iat: now - 60,
    exp: now + 540,
    iss: typeof id === 'string' ? id : String(id),
  };
  const data = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(data);
  signer.end();
  const signature = signer.sign(pem);
  return `${data}.${base64url(signature)}`;
}

/**
 * Exchange the App JWT for an installation access token (~1hr lifetime).
 *
 * @param {number|string} installationId
 * @param {string}        [appJwt] defaults to a fresh generateAppJwt()
 * @returns {Promise<{ token: string, expires_at: string, permissions?: object }>}
 */
export async function getInstallationToken(installationId, appJwt) {
  if (!installationId) throw new Error('installationId required');

  // Cache hit path: return cached token shape if it has more than the
  // safety margin of life left. Same `{ token, expires_at, permissions }`
  // shape as the GitHub REST response so callers can't tell the difference.
  const cached = INSTALLATION_TOKEN_CACHE.get(installationId);
  if (cached && cached.expiresAt - Date.now() > TOKEN_SAFETY_MARGIN_MS) {
    return { token: cached.token, expires_at: cached.expires_at, permissions: cached.permissions };
  }

  const jwt = appJwt ?? generateAppJwt();
  const url = `https://api.github.com/app/installations/${installationId}/access_tokens`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'opensoyce-guard',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '(no body)');
    throw new Error(`INSTALLATION_TOKEN_FAILED status=${res.status} body=${body.slice(0, 200)}`);
  }
  const data = await res.json();

  // Cache the freshly minted token. If expires_at fails to parse cleanly
  // (NaN), fall back to a conservative 50-minute lifetime so we still get
  // most of the cache benefit while leaving a 10-minute buffer vs the
  // real ~60-minute GitHub lifetime.
  const parsedExpiry = Date.parse(data.expires_at);
  const expiresAt = Number.isFinite(parsedExpiry) ? parsedExpiry : Date.now() + 3000 * 1000;

  // Evict oldest entry when at cap. Map iteration is insertion-ordered
  // so the first key is the oldest fetchedAt.
  if (!INSTALLATION_TOKEN_CACHE.has(installationId) && INSTALLATION_TOKEN_CACHE.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = INSTALLATION_TOKEN_CACHE.keys().next().value;
    if (oldestKey !== undefined) INSTALLATION_TOKEN_CACHE.delete(oldestKey);
  }
  // Delete-then-set so a refreshed entry moves to the end of insertion
  // order (otherwise a frequently-refreshed installation could become
  // the "oldest" while actually being the newest).
  INSTALLATION_TOKEN_CACHE.delete(installationId);
  INSTALLATION_TOKEN_CACHE.set(installationId, {
    token: data.token,
    expires_at: data.expires_at,
    permissions: data.permissions,
    expiresAt,
    fetchedAt: Date.now(),
  });

  return data;
}

/**
 * Authenticated GitHub API caller using an installation token.
 *
 * @param {string} token
 * @param {string} path                full URL or "/repos/..." path
 * @param {{ method?: string, body?: any, accept?: string }} [opts]
 * @returns {Promise<Response>}
 */
export async function githubFetch(token, path, opts = {}) {
  const url = path.startsWith('http') ? path : `https://api.github.com${path}`;
  const method = opts.method || 'GET';
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': opts.accept || 'application/vnd.github+json',
    'User-Agent': 'opensoyce-guard',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const init = { method, headers };
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
  }
  return fetch(url, init);
}

/**
 * Fetch a file's content at a specific ref using the contents API. Returns
 * `{ text, size }` on success or throws a tagged error. The 5MB ceiling
 * mirrors the /api/scan ceiling so the same scoring pipeline upstream
 * doesn't have to defend against a Guard-only oversize path.
 *
 * @param {string} token
 * @param {string} owner
 * @param {string} repo
 * @param {string} path
 * @param {string} ref
 * @returns {Promise<{ text: string, size: number }>}
 */
export async function fetchLockfileContent(token, owner, repo, path, ref) {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  const res = await githubFetch(token, `/repos/${owner}/${repo}/contents/${encoded}?ref=${encodeURIComponent(ref)}`);
  if (!res.ok) {
    const body = await res.text().catch(() => '(no body)');
    const err = new Error(`CONTENT_FETCH_FAILED status=${res.status} body=${body.slice(0, 200)}`);
    err.code = 'CONTENT_FETCH_FAILED';
    throw err;
  }
  const data = await res.json();
  // The contents API returns an array if `path` is a directory — guard.
  if (Array.isArray(data)) {
    const err = new Error('CONTENT_IS_DIRECTORY');
    err.code = 'CONTENT_IS_DIRECTORY';
    throw err;
  }
  if (typeof data.size === 'number' && data.size > 5_000_000) {
    const err = new Error(`CONTENT_TOO_LARGE size=${data.size}`);
    err.code = 'CONTENT_TOO_LARGE';
    throw err;
  }
  if (data.encoding !== 'base64' || typeof data.content !== 'string') {
    // Files >1MB return `content: ""` and require the blobs API. Fetch via
    // git_url (the blob URL embedded in the contents response).
    if (data.git_url) {
      const blobRes = await githubFetch(token, data.git_url);
      if (!blobRes.ok) {
        const body = await blobRes.text().catch(() => '(no body)');
        const err = new Error(`BLOB_FETCH_FAILED status=${blobRes.status} body=${body.slice(0, 200)}`);
        err.code = 'BLOB_FETCH_FAILED';
        throw err;
      }
      const blob = await blobRes.json();
      if (blob.encoding !== 'base64' || typeof blob.content !== 'string') {
        const err = new Error('BLOB_BAD_ENCODING');
        err.code = 'BLOB_BAD_ENCODING';
        throw err;
      }
      const text = Buffer.from(blob.content, 'base64').toString('utf8');
      if (text.length > 5_000_000) {
        const err = new Error(`CONTENT_TOO_LARGE size=${text.length}`);
        err.code = 'CONTENT_TOO_LARGE';
        throw err;
      }
      return { text, size: text.length };
    }
    const err = new Error('CONTENT_BAD_ENCODING');
    err.code = 'CONTENT_BAD_ENCODING';
    throw err;
  }
  const text = Buffer.from(data.content, 'base64').toString('utf8');
  if (text.length > 5_000_000) {
    const err = new Error(`CONTENT_TOO_LARGE size=${text.length}`);
    err.code = 'CONTENT_TOO_LARGE';
    throw err;
  }
  return { text, size: text.length };
}
