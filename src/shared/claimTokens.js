/**
 * Shared HMAC-signed token helpers for the /claim rebuttal flow.
 *
 * Two token shapes share the same signing scheme:
 *   - state-token  : signed by /api/claim-start, verified by /api/claim-callback.
 *                    Payload: { owner, repo, csrf, iat }. Prevents CSRF + stops an
 *                    attacker from forging a callback with a different owner/repo.
 *   - claim-token  : signed by /api/claim-callback after collaborator verification,
 *                    verified by /api/claim-submit. Payload: { owner, repo, login,
 *                    exp }. Short-lived (10 min) so a leaked URL can't be replayed
 *                    indefinitely. The login is baked in so an attacker who finds
 *                    a leaked token can only submit an issue tagged with the
 *                    verified collaborator's handle.
 *
 * Format:  <base64url(payloadJSON)>.<hexHmacSha256(payloadJSON, key)>
 *
 * The HMAC key is the OAuth client secret env var
 * (GITHUB_OAUTH_CLIENT_SECRET) — it's already secret, already loaded, and
 * never has to round-trip to the client.
 */

import crypto from 'node:crypto';

const STATE_MAX_AGE_SEC = 10 * 60; // 10 min — state should never live longer than the OAuth round-trip

export function base64urlEncode(bufOrString) {
  const buf = Buffer.isBuffer(bufOrString) ? bufOrString : Buffer.from(bufOrString, 'utf8');
  return buf.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function base64urlDecode(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64, 'base64');
}

function hmacHex(payloadStr, key) {
  return crypto.createHmac('sha256', key).update(payloadStr).digest('hex');
}

function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    return false;
  }
}

/**
 * Sign a JSON-serializable payload. Returns `<b64(payload)>.<hex(hmac)>`.
 * @param {object} payload
 * @param {string} key
 */
export function signToken(payload, key) {
  if (!key || typeof key !== 'string') throw new Error('HMAC_KEY_MISSING');
  const json = JSON.stringify(payload);
  const enc = base64urlEncode(json);
  const sig = hmacHex(json, key);
  return `${enc}.${sig}`;
}

/**
 * Verify a signed token. Returns the decoded payload, or null on any failure.
 * @param {string} token
 * @param {string} key
 * @returns {object|null}
 */
export function verifyToken(token, key) {
  if (!key || typeof key !== 'string') return null;
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const idx = token.indexOf('.');
  const enc = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  if (!enc || !sig) return null;
  let json;
  try {
    json = base64urlDecode(enc).toString('utf8');
  } catch {
    return null;
  }
  const expected = hmacHex(json, key);
  if (!timingSafeEqualHex(sig, expected)) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Sign a state-token for the OAuth round-trip.
 * @param {{ owner: string, repo: string }} args
 * @param {string} key
 */
export function signStateToken({ owner, repo }, key) {
  const csrf = crypto.randomBytes(32).toString('hex');
  const iat = Math.floor(Date.now() / 1000);
  return signToken({ owner, repo, csrf, iat }, key);
}

/**
 * Verify a state-token. Rejects payloads older than STATE_MAX_AGE_SEC.
 * Returns { owner, repo } on success, null on failure.
 * @param {string} token
 * @param {string} key
 * @param {{ now?: number }} [opts]
 */
export function verifyStateToken(token, key, opts = {}) {
  const payload = verifyToken(token, key);
  if (!payload) return null;
  if (typeof payload.owner !== 'string' || typeof payload.repo !== 'string') return null;
  if (typeof payload.iat !== 'number') return null;
  const now = typeof opts.now === 'number' ? opts.now : Math.floor(Date.now() / 1000);
  if (now - payload.iat > STATE_MAX_AGE_SEC) return null;
  return { owner: payload.owner, repo: payload.repo };
}

/**
 * Sign a claim-token after collaborator verification. Short-lived.
 * @param {{ owner: string, repo: string, login: string, ttlSec?: number }} args
 * @param {string} key
 */
export function signClaimToken({ owner, repo, login, ttlSec = 600 }, key) {
  const now = Math.floor(Date.now() / 1000);
  return signToken({ owner, repo, login, exp: now + ttlSec }, key);
}

/**
 * Verify a claim-token. Returns { owner, repo, login } on success.
 * @param {string} token
 * @param {string} key
 * @param {{ now?: number }} [opts]
 */
export function verifyClaimToken(token, key, opts = {}) {
  const payload = verifyToken(token, key);
  if (!payload) return null;
  if (typeof payload.owner !== 'string' || typeof payload.repo !== 'string') return null;
  if (typeof payload.login !== 'string') return null;
  if (typeof payload.exp !== 'number') return null;
  const now = typeof opts.now === 'number' ? opts.now : Math.floor(Date.now() / 1000);
  if (now >= payload.exp) return null;
  return { owner: payload.owner, repo: payload.repo, login: payload.login };
}
