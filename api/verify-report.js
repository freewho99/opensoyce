/**
 * Vercel function: POST /api/verify-report
 *
 * Verifies the Ed25519 signature on an OpenSoyce JSON or SARIF report.
 * Public endpoint — anyone can POST a signed report and get a
 * `{ valid, ... }` response. CORS-open so it's callable from a browser.
 *
 * Request body: the signed report itself (either a JSON OpenSoyce report
 * with a top-level `signature` field, or a SARIF 2.1.0 document with
 * `runs[0].properties.signature`).
 *
 * Response:
 *   200 { valid: true, keyFingerprint, signedAt }
 *   200 { valid: false, reason }
 *   500 { valid: false, reason: 'server not configured' } when the public
 *       key env var is unset (operator-side failure, not user-side)
 */

import { verifyReport, detectSignatureLocation } from '../src/shared/reportSigning.js';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ valid: false, reason: 'Method not allowed; POST a signed report.' });
  }
  const publicKeyPem = process.env.OPENSOYCE_SIGNING_PUBLIC_KEY;
  if (!publicKeyPem || !publicKeyPem.trim()) {
    return res.status(500).json({
      valid: false,
      reason: 'server not configured: OPENSOYCE_SIGNING_PUBLIC_KEY env var missing',
    });
  }

  // Vercel parses JSON bodies by default for `application/json`. Tolerate
  // string bodies (raw POST) too.
  let report = req.body;
  if (typeof report === 'string') {
    try {
      report = JSON.parse(report);
    } catch (e) {
      return res.status(400).json({ valid: false, reason: `request body is not valid JSON: ${e.message}` });
    }
  }
  if (!report || typeof report !== 'object') {
    return res.status(400).json({ valid: false, reason: 'request body must be a JSON report object' });
  }
  // Reject overly large payloads at the route layer (mirrors the 5MB cap on
  // /api/scan). Vercel already caps request body sizes, this is belt+suspenders.
  try {
    const approxSize = Buffer.byteLength(JSON.stringify(report), 'utf8');
    if (approxSize > 5_000_000) {
      return res.status(413).json({ valid: false, reason: 'report exceeds 5MB cap' });
    }
  } catch { /* non-fatal */ }

  const location = detectSignatureLocation(report);
  const result = verifyReport(report, { publicKeyPem, location });
  // Always 200 — `valid: false` is a normal response, not a server error.
  // (Operator-side errors above return 4xx/5xx with `valid: false` too,
  // for client-side simplicity.)
  return res.status(200).json(result);
}
