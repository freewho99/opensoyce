/**
 * Signed reports v0 — Ed25519 cryptographic signing for OpenSoyce reports.
 *
 * Pure module. Owns canonicalization + sign + verify + key fingerprint.
 * Backed by `node:crypto` — no new npm dep.
 *
 * Why Ed25519?
 *   - Native to `node:crypto`.
 *   - Deterministic: signing the same bytes with the same key ALWAYS produces
 *     the same 64-byte signature. This is part of the Ed25519 spec (RFC 8032).
 *   - Fast verification, compact 32-byte public keys.
 *
 * Embedded signatures, not detached sidecars. The signature lives inside the
 * report object at a known path (top-level `signature` for JSON reports;
 * `runs[0].properties.signature` for SARIF).
 *
 * Canonicalization is sorted-keys JSON (RFC 8785 JCS-style "good enough"):
 *   - Recursively walk the object
 *   - For objects, sort keys alphabetically before stringifying
 *   - For arrays, preserve insertion order
 *   - Use JSON.stringify on the rebuilt structure
 *   - UTF-8 Buffer for the signing pipeline
 *
 * Pluggable signature location so the same canonicalizer works for both
 * the JSON shape and the SARIF shape.
 */

import crypto from 'node:crypto';

/** @typedef {'Ed25519'} SignatureAlgorithm */

/**
 * Where the signature lives within a given report shape.
 *
 *   - 'top-level':  obj.signature                       (JSON reports)
 *   - 'sarif-run0': obj.runs[0].properties.signature   (SARIF 2.1.0 reports)
 *
 * @typedef {'top-level' | 'sarif-run0'} SignatureLocation
 */

const ALGORITHM = 'Ed25519';

/**
 * Strip the signature field from a copy of `obj`, where `location` defines
 * the path. Returns a NEW object — `obj` itself is never mutated. If the
 * signature is absent the returned object is structurally equivalent to a
 * deep-cloned `obj`.
 *
 * @param {any} obj
 * @param {SignatureLocation} location
 * @returns {any} new object with signature removed
 */
function withoutSignature(obj, location) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (location === 'top-level') {
    if (Array.isArray(obj)) return obj.slice();
    const out = {};
    for (const k of Object.keys(obj)) {
      if (k === 'signature') continue;
      out[k] = obj[k];
    }
    return out;
  }
  if (location === 'sarif-run0') {
    // Shallow clone the top, then deep-clone only the path to the signature
    // so we can drop it without disturbing the rest. Other fields keep their
    // identity — the recursive sort step will still walk them.
    if (!obj || !Array.isArray(obj.runs) || obj.runs.length === 0) {
      // Nothing to strip; return as-is (canonicalize will still walk).
      return obj;
    }
    const newRuns = obj.runs.slice();
    const run0 = newRuns[0];
    if (run0 && typeof run0 === 'object' && run0.properties && typeof run0.properties === 'object') {
      const newProps = {};
      for (const k of Object.keys(run0.properties)) {
        if (k === 'signature') continue;
        newProps[k] = run0.properties[k];
      }
      newRuns[0] = { ...run0, properties: newProps };
    }
    return { ...obj, runs: newRuns };
  }
  return obj;
}

/**
 * Get the signature object out of a signed report, given its location.
 *
 * @param {any} obj
 * @param {SignatureLocation} location
 * @returns {any | null}
 */
function getSignature(obj, location) {
  if (obj === null || typeof obj !== 'object') return null;
  if (location === 'top-level') {
    return obj.signature ?? null;
  }
  if (location === 'sarif-run0') {
    const run0 = Array.isArray(obj.runs) ? obj.runs[0] : null;
    return run0 && run0.properties && run0.properties.signature
      ? run0.properties.signature
      : null;
  }
  return null;
}

/**
 * Place a signature object into a (cloned) report at the given location.
 *
 * @param {any} obj
 * @param {any} signatureObj
 * @param {SignatureLocation} location
 * @returns {any}
 */
function withSignature(obj, signatureObj, location) {
  if (location === 'top-level') {
    return { ...obj, signature: signatureObj };
  }
  if (location === 'sarif-run0') {
    if (!obj || !Array.isArray(obj.runs) || obj.runs.length === 0) {
      // Can't place a SARIF signature without runs. Fall back to top-level
      // so the caller still gets _something_; verification will fail at
      // re-canonicalization time, which is fine — better to fail loudly
      // than silently drop the signature.
      return { ...obj, signature: signatureObj };
    }
    const newRuns = obj.runs.slice();
    const run0 = newRuns[0];
    const existingProps = (run0 && run0.properties && typeof run0.properties === 'object')
      ? run0.properties
      : {};
    newRuns[0] = {
      ...run0,
      properties: { ...existingProps, signature: signatureObj },
    };
    return { ...obj, runs: newRuns };
  }
  return obj;
}

/**
 * Sorted-keys JSON canonicalization. Walks an arbitrary value and returns a
 * canonical-form value where every object's keys are alphabetically sorted.
 * Arrays preserve insertion order. Primitives pass through unchanged.
 *
 * @param {any} val
 * @returns {any}
 */
function sortedCanonical(val) {
  if (val === null || typeof val !== 'object') return val;
  if (Array.isArray(val)) {
    return val.map(sortedCanonical);
  }
  const out = {};
  const keys = Object.keys(val).sort();
  for (const k of keys) {
    const v = val[k];
    // Skip `undefined` values — they would be dropped by JSON.stringify
    // anyway, but being explicit keeps the canonical form stable across
    // engines.
    if (typeof v === 'undefined') continue;
    out[k] = sortedCanonical(v);
  }
  return out;
}

/**
 * Detect which signature location a given object uses. Returns 'sarif-run0'
 * for objects that look like SARIF (`version: '2.1.0'` + `runs` array),
 * else 'top-level'.
 *
 * @param {any} obj
 * @returns {SignatureLocation}
 */
export function detectSignatureLocation(obj) {
  if (
    obj && typeof obj === 'object'
    && typeof obj.version === 'string'
    && obj.version.startsWith('2.')
    && Array.isArray(obj.runs)
  ) {
    return 'sarif-run0';
  }
  return 'top-level';
}

/**
 * Canonicalize a report object into a deterministic UTF-8 byte sequence
 * suitable for signing. Strips any existing signature field at the given
 * location before canonicalizing — we never sign the signature itself.
 *
 * @param {object} report  the report to canonicalize (may carry a signature)
 * @param {SignatureLocation} [location='top-level']  where the signature lives
 * @returns {Buffer} canonical UTF-8 bytes
 */
export function canonicalizeReport(report, location = 'top-level') {
  const stripped = withoutSignature(report, location);
  const canonical = sortedCanonical(stripped);
  const text = JSON.stringify(canonical);
  return Buffer.from(text, 'utf8');
}

/**
 * SHA-256 fingerprint of a public key, returned as lowercase hex. The PEM
 * may be `BEGIN PUBLIC KEY` or `BEGIN ED25519 PUBLIC KEY`-flavored — we
 * normalize via `crypto.createPublicKey` and re-export to SPKI DER so the
 * fingerprint is determined by the key material, not the PEM whitespace.
 *
 * @param {string} publicKeyPem
 * @returns {string} hex-encoded SHA-256
 */
export function keyFingerprint(publicKeyPem) {
  if (typeof publicKeyPem !== 'string' || !publicKeyPem.trim()) {
    throw new Error('keyFingerprint: publicKeyPem must be a non-empty string');
  }
  const keyObj = crypto.createPublicKey(publicKeyPem);
  const spkiDer = keyObj.export({ format: 'der', type: 'spki' });
  return crypto.createHash('sha256').update(spkiDer).digest('hex');
}

/**
 * Sign a report with an Ed25519 private key. Returns a new object with a
 * signature embedded at the appropriate location. Original `report` is not
 * mutated.
 *
 * @param {object} report
 * @param {{ privateKeyPem: string, publicKeyPem?: string, keyId?: string, location?: SignatureLocation, now?: () => string }} opts
 * @returns {object} report with signature embedded
 */
export function signReport(report, opts) {
  if (!report || typeof report !== 'object') {
    throw new Error('signReport: report must be an object');
  }
  if (!opts || typeof opts.privateKeyPem !== 'string' || !opts.privateKeyPem.trim()) {
    throw new Error('signReport: opts.privateKeyPem is required');
  }
  const location = opts.location || detectSignatureLocation(report);
  const privateKey = crypto.createPrivateKey(opts.privateKeyPem);
  if (privateKey.asymmetricKeyType !== 'ed25519') {
    throw new Error(
      `signReport: expected an Ed25519 private key, got ${privateKey.asymmetricKeyType}`,
    );
  }

  // Fingerprint: derived from the public key. Caller may pass `publicKeyPem`
  // (cheaper, avoids re-derivation); otherwise we derive the public key from
  // the private key via SPKI export.
  let fingerprint;
  if (typeof opts.publicKeyPem === 'string' && opts.publicKeyPem.trim()) {
    fingerprint = keyFingerprint(opts.publicKeyPem);
  } else {
    const publicKey = crypto.createPublicKey(privateKey);
    const spkiDer = publicKey.export({ format: 'der', type: 'spki' });
    fingerprint = crypto.createHash('sha256').update(spkiDer).digest('hex');
  }

  const canonical = canonicalizeReport(report, location);
  // Ed25519's signing path in node:crypto is `crypto.sign(null, msg, key)`.
  // The digest is computed internally per RFC 8032 — passing a hash name is
  // an error for Ed25519.
  const signatureBytes = crypto.sign(null, canonical, privateKey);
  const now = typeof opts.now === 'function' ? opts.now() : new Date().toISOString();

  /** @type {any} */
  const signatureObj = {
    algorithm: ALGORITHM,
    keyFingerprint: fingerprint,
    signedAt: now,
    signature: signatureBytes.toString('base64'),
  };
  if (typeof opts.keyId === 'string' && opts.keyId.trim()) {
    signatureObj.keyId = opts.keyId;
  }

  return withSignature(report, signatureObj, location);
}

/**
 * Verify a signed report. Never throws — invalid signatures or malformed
 * inputs return `{ valid: false, reason: '...' }`.
 *
 * @param {object} signedReport
 * @param {{ publicKeyPem: string, location?: SignatureLocation }} opts
 * @returns {{ valid: boolean, reason?: string, keyFingerprint?: string, signedAt?: string }}
 */
export function verifyReport(signedReport, opts) {
  if (!signedReport || typeof signedReport !== 'object') {
    return { valid: false, reason: 'report is not an object' };
  }
  if (!opts || typeof opts.publicKeyPem !== 'string' || !opts.publicKeyPem.trim()) {
    return { valid: false, reason: 'publicKeyPem is required' };
  }
  const location = opts.location || detectSignatureLocation(signedReport);
  const sig = getSignature(signedReport, location);
  if (!sig || typeof sig !== 'object') {
    return { valid: false, reason: 'no signature' };
  }
  if (sig.algorithm !== ALGORITHM) {
    return { valid: false, reason: `unsupported signature algorithm: ${sig.algorithm}` };
  }
  if (typeof sig.signature !== 'string' || !sig.signature) {
    return { valid: false, reason: 'signature field is missing or not a string' };
  }
  // base64 sanity: decode and bail on garbage. Node's `Buffer.from('xxx', 'base64')`
  // silently ignores invalid chars, so we re-encode and compare to detect.
  let sigBytes;
  try {
    sigBytes = Buffer.from(sig.signature, 'base64');
    const reencoded = sigBytes.toString('base64');
    // Normalize padding before compare. base64 round-trip may differ in '='
    // padding for length-equivalent payloads, so strip and re-compare.
    const stripPad = (s) => s.replace(/=+$/, '');
    if (stripPad(reencoded) !== stripPad(sig.signature)) {
      return { valid: false, reason: 'signature is not valid base64' };
    }
  } catch {
    return { valid: false, reason: 'signature is not valid base64' };
  }
  if (sigBytes.length !== 64) {
    return {
      valid: false,
      reason: `Ed25519 signatures must be 64 bytes, got ${sigBytes.length}`,
    };
  }

  let publicKey;
  try {
    publicKey = crypto.createPublicKey(opts.publicKeyPem);
  } catch (e) {
    return { valid: false, reason: `public key is not parseable: ${e.message}` };
  }
  if (publicKey.asymmetricKeyType !== 'ed25519') {
    return {
      valid: false,
      reason: `expected an Ed25519 public key, got ${publicKey.asymmetricKeyType}`,
    };
  }

  const canonical = canonicalizeReport(signedReport, location);
  let ok = false;
  try {
    ok = crypto.verify(null, canonical, publicKey, sigBytes);
  } catch (e) {
    return { valid: false, reason: `verification threw: ${e.message}` };
  }
  if (!ok) {
    return { valid: false, reason: 'signature does not match canonical report bytes' };
  }
  return {
    valid: true,
    keyFingerprint: typeof sig.keyFingerprint === 'string' ? sig.keyFingerprint : undefined,
    signedAt: typeof sig.signedAt === 'string' ? sig.signedAt : undefined,
  };
}

export const __internal = {
  withoutSignature,
  withSignature,
  getSignature,
  sortedCanonical,
  ALGORITHM,
};
