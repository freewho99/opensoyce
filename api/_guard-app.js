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
  return res.json();
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
