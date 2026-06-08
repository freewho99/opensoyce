// OpenSoyce Trust Vault — exception row ETag computation.
//
// PR-V2-B. Per PR-V1-C §4.4.
//
// The etag is sha256 of the tuple that defines what the client just saw:
//   (exception_id, state, expires_at, reason_public_hash, reviewed_at)
// Any change to those fields invalidates the etag. If-Match enforcement is
// optional from the server's side (clients are encouraged to send it; the
// server rejects on mismatch with 412 Precondition Failed; clients that
// omit If-Match proceed best-effort).

import crypto from 'node:crypto';

export function computeExceptionEtag(row) {
  if (!row) return null;
  const reasonHash = row.reason_public
    ? crypto.createHash('sha256').update(row.reason_public).digest('hex').slice(0, 16)
    : '';
  const fields = [
    row.exception_id || '',
    row.state || '',
    row.expires_at || '',
    reasonHash,
    row.reviewed_at || '',
  ].join('|');
  const digest = crypto.createHash('sha256').update(fields).digest('hex');
  return `"${digest}"`;
}

/**
 * Optional If-Match enforcement. Returns:
 *   { ok: true }                   — header missing OR matches
 *   { ok: false, currentEtag }     — header present and mismatched
 */
export function checkIfMatch(req, currentEtag) {
  const ifMatch = req.headers && req.headers['if-match'];
  if (!ifMatch) return { ok: true };
  // Normalize: clients may send "W/<tag>" (weak) or quoted/unquoted.
  const normalize = (v) => String(v).replace(/^W\//i, '').trim();
  if (normalize(ifMatch) === normalize(currentEtag)) return { ok: true };
  return { ok: false, currentEtag };
}
