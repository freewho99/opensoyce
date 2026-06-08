// OpenSoyce Trust Vault — CSRF double-submit cookie middleware.
//
// PR-V2-B. Per PR-V1-C §5.
//
// Mechanism: double-submit cookie.
//   - Cookie: opensoyce_vault_csrf (Secure, SameSite=Lax, NOT HttpOnly so
//     the SPA can read it via document.cookie).
//   - Header: X-OpenSoyce-Vault-CSRF
//   - Server compares cookie value vs header value; both must equal and
//     both must be non-empty.
//   - Applies to every POST/PATCH/DELETE on /api/vault/* (the Vault has
//     no DELETE in v0 — but the middleware applies the rule for any
//     future mutating route too).
//   - Token rotates only on session establishment (login).
//
// Failure modes are distinct error codes so the client can render an
// honest "log in to refresh your CSRF token" prompt without guessing.

import crypto from 'node:crypto';
import { sendError, ERROR_CODES } from './errors.js';

const CSRF_COOKIE_NAME = 'opensoyce_vault_csrf';
const CSRF_HEADER_NAME = 'x-opensoyce-vault-csrf';
const CSRF_TOKEN_BYTES = 32;

export function csrfCookieName() {
  return CSRF_COOKIE_NAME;
}

export function csrfHeaderName() {
  return CSRF_HEADER_NAME;
}

export function generateCsrfToken() {
  return crypto.randomBytes(CSRF_TOKEN_BYTES).toString('hex');
}

export function setCsrfCookie(res, token, ttlSec) {
  // Not HttpOnly so the SPA can read the cookie and echo it into the header.
  res.setHeader(
    'Set-Cookie',
    `${CSRF_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Secure; SameSite=Lax; Max-Age=${ttlSec}`,
  );
}

export function clearCsrfCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${CSRF_COOKIE_NAME}=; Path=/; Secure; SameSite=Lax; Max-Age=0`,
  );
}

function readCookie(req, name) {
  const header = req.headers && req.headers.cookie;
  if (typeof header !== 'string' || header.length === 0) return null;
  const parts = header.split(';');
  for (const raw of parts) {
    const pair = raw.trim();
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const key = pair.slice(0, eq);
    if (key === name) {
      return decodeURIComponent(pair.slice(eq + 1));
    }
  }
  return null;
}

/**
 * Require a matching CSRF cookie + header on mutating requests. Distinct
 * error codes per PR-V1-C §5.3.
 */
export function requireCsrf(req, res, next) {
  const cookieVal = readCookie(req, CSRF_COOKIE_NAME);
  const headerRaw = req.headers && req.headers[CSRF_HEADER_NAME];
  const headerVal = typeof headerRaw === 'string' ? headerRaw : '';

  if (!cookieVal) {
    return sendError(res, 403, ERROR_CODES.csrf_missing_cookie, 'CSRF cookie missing');
  }
  if (!headerVal) {
    return sendError(res, 403, ERROR_CODES.csrf_missing_header, 'CSRF header missing');
  }
  if (cookieVal === '' || headerVal === '') {
    return sendError(res, 403, ERROR_CODES.csrf_empty, 'CSRF token empty');
  }
  // Constant-time-ish compare: equal-length string compare. Both are hex
  // tokens of the same length when freshly minted; mismatches are also
  // common in dev. The vector here is forgery, not timing.
  if (cookieVal !== headerVal) {
    return sendError(res, 403, ERROR_CODES.csrf_mismatch, 'CSRF cookie and header do not match');
  }
  next();
}
