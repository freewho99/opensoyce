/**
 * OTS Exception + Audit Trail — Core Data Model
 *
 * Pure module. Owns exception lifecycle, audit event chain, ID generation,
 * expiry checks, and active-exception lookup. No I/O, no React, no fetches.
 *
 * Signing delegates to reportSigning.js (same Ed25519 + sorted-key
 * canonicalization used for scan reports). The same OTS_SIGNING_PRIVATE_KEY
 * seals both scan reports and exception approvals — one trust root.
 *
 * Storage contract (enforced by CLI, not this module):
 *   .ots-exceptions/
 *     index.json                    lightweight index of all exceptions
 *     OTS-EXC-YYYY-NNNN.json        one signed file per exception
 *
 * Access-control contract: CODEOWNERS enforces that only security owners
 * can commit approval records to .ots-exceptions/. The gate records who
 * committed; it does not independently verify approver identity.
 *
 * Exception scope: per-version (stripe@5.0.1 only). Range exceptions are v1.
 */

import { signReport, verifyReport } from './reportSigning.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SCHEMA_VERSION = 1;

/**
 * Valid status transitions:
 *   PENDING → APPROVED | DENIED
 *   APPROVED → EXPIRED | REVOKED | RENEWED
 *   DENIED → (terminal)
 *   EXPIRED → (terminal)
 *   REVOKED → (terminal)
 */
export const EXCEPTION_STATUS = Object.freeze({
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  DENIED: 'DENIED',
  EXPIRED: 'EXPIRED',
  REVOKED: 'REVOKED',
});

export const AUDIT_ACTION = Object.freeze({
  REQUESTED: 'REQUESTED',
  APPROVED: 'APPROVED',
  DENIED: 'DENIED',
  EXPIRED: 'EXPIRED',
  REVOKED: 'REVOKED',
  RENEWED: 'RENEWED',
  USED: 'USED',
});

/** Default exception duration when caller does not specify. */
const DEFAULT_DURATION_DAYS = 14;

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

/**
 * Generate the next exception ID in the sequence.
 * Format: OTS-EXC-YYYY-NNNN (4-digit zero-padded sequence per calendar year).
 *
 * @param {Array<{ id: string }>} index  Current exception index (may be empty).
 * @param {Date} [now]  Injectable for tests.
 * @returns {string}
 */
export function generateExceptionId(index, now = new Date()) {
  const year = now.getUTCFullYear();
  const prefix = `OTS-EXC-${year}-`;

  // Find the highest sequence number for this calendar year.
  let maxSeq = 0;
  for (const entry of index) {
    if (typeof entry.id === 'string' && entry.id.startsWith(prefix)) {
      const seq = parseInt(entry.id.slice(prefix.length), 10);
      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
  }

  const nextSeq = String(maxSeq + 1).padStart(4, '0');
  return `${prefix}${nextSeq}`;
}

// ---------------------------------------------------------------------------
// Audit event helpers
// ---------------------------------------------------------------------------

/**
 * Append an audit event to an exception. Returns a NEW exception object —
 * the original is never mutated (immutable update pattern).
 *
 * @param {OtsException} exc
 * @param {OtsAuditEvent} event
 * @returns {OtsException}
 */
export function appendAuditEvent(exc, event) {
  return {
    ...exc,
    history: [...(exc.history || []), event],
  };
}

/**
 * Build a timestamped audit event.
 *
 * @param {string} actor
 * @param {string} action  One of AUDIT_ACTION values.
 * @param {Record<string, unknown>} [metadata]
 * @param {Date} [now]
 * @returns {OtsAuditEvent}
 */
function makeEvent(actor, action, metadata = {}, now = new Date()) {
  return {
    timestamp: now.toISOString(),
    actor,
    action,
    metadata,
  };
}

// ---------------------------------------------------------------------------
// Lifecycle: create / approve / deny / revoke / renew / markUsed / markExpired
// ---------------------------------------------------------------------------

/**
 * Create a new exception request (status: PENDING).
 * The returned object is unsigned — signing happens at approval time.
 *
 * @param {{
 *   index: Array<{ id: string }>,
 *   package: string,
 *   version: string,
 *   fromVersion?: string,
 *   changeType?: string,
 *   gateDecisionRef: {
 *     decision: string,
 *     tier: number,
 *     tierName: string,
 *     topReason: string,
 *   },
 *   matchedPattern?: { id: string, name: string } | null,
 *   requestedBy: string,
 *   justification: string,
 *   durationDays?: number,
 *   prUrl?: string,
 *   now?: Date,
 * }} opts
 * @returns {OtsException}
 */
export function createExceptionRequest(opts) {
  if (!opts || typeof opts.package !== 'string' || !opts.package.trim()) {
    throw new Error('createExceptionRequest: package is required');
  }
  if (typeof opts.version !== 'string' || !opts.version.trim()) {
    throw new Error('createExceptionRequest: version is required');
  }
  if (!opts.gateDecisionRef || typeof opts.gateDecisionRef.topReason !== 'string') {
    throw new Error('createExceptionRequest: gateDecisionRef with topReason is required');
  }
  if (typeof opts.requestedBy !== 'string' || !opts.requestedBy.trim()) {
    throw new Error('createExceptionRequest: requestedBy is required');
  }
  if (typeof opts.justification !== 'string' || !opts.justification.trim()) {
    throw new Error('createExceptionRequest: justification is required');
  }

  const now = opts.now || new Date();
  const id = generateExceptionId(opts.index || [], now);
  const durationDays = typeof opts.durationDays === 'number' && opts.durationDays > 0
    ? opts.durationDays
    : DEFAULT_DURATION_DAYS;

  /** @type {OtsException} */
  const exc = {
    schemaVersion: SCHEMA_VERSION,
    id,
    createdAt: now.toISOString(),

    package: opts.package.trim(),
    version: opts.version.trim(),
    fromVersion: opts.fromVersion || null,
    changeType: opts.changeType || null,

    gateDecisionRef: {
      decision: opts.gateDecisionRef.decision,
      tier: opts.gateDecisionRef.tier,
      tierName: opts.gateDecisionRef.tierName,
      topReason: opts.gateDecisionRef.topReason,
    },
    matchedPattern: opts.matchedPattern || null,

    requestedBy: opts.requestedBy.trim(),
    requestedAt: now.toISOString(),
    justification: opts.justification.trim(),
    durationDays,
    prUrl: opts.prUrl || null,

    status: EXCEPTION_STATUS.PENDING,
    reviewedBy: null,
    reviewedAt: null,
    expiresAt: null,
    conditions: [],
    denyReason: null,

    history: [
      makeEvent(opts.requestedBy.trim(), AUDIT_ACTION.REQUESTED, {
        ...(opts.prUrl ? { prUrl: opts.prUrl } : {}),
        justification: opts.justification.trim(),
        durationDays,
      }, now),
    ],

    signature: null,
  };

  return exc;
}

/**
 * Approve a PENDING exception. Returns a signed exception.
 *
 * @param {OtsException} exc
 * @param {{
 *   reviewedBy: string,
 *   conditions?: string[],
 *   privateKeyPem?: string,
 *   publicKeyPem?: string,
 *   keyId?: string,
 *   now?: Date,
 * }} opts
 * @returns {OtsException}
 */
export function approveException(exc, opts) {
  if (!exc || exc.status !== EXCEPTION_STATUS.PENDING) {
    throw new Error(`approveException: exception must be PENDING, got ${exc?.status}`);
  }
  if (typeof opts?.reviewedBy !== 'string' || !opts.reviewedBy.trim()) {
    throw new Error('approveException: reviewedBy is required');
  }

  const now = opts.now || new Date();
  const expiresAt = new Date(now.getTime() + exc.durationDays * 86400000).toISOString();

  let updated = {
    ...exc,
    status: EXCEPTION_STATUS.APPROVED,
    reviewedBy: opts.reviewedBy.trim(),
    reviewedAt: now.toISOString(),
    expiresAt,
    conditions: Array.isArray(opts.conditions) ? opts.conditions : [],
    signature: null, // will be set after signing
  };

  updated = appendAuditEvent(updated, makeEvent(
    opts.reviewedBy.trim(),
    AUDIT_ACTION.APPROVED,
    { conditions: updated.conditions, expiresAt },
    now,
  ));

  // Sign with OTS key if provided.
  if (opts.privateKeyPem) {
    // Strip signature before canonicalization (signReport handles this).
    updated = signRecord(updated, opts);
  }

  return updated;
}

/**
 * Deny a PENDING exception.
 *
 * @param {OtsException} exc
 * @param {{ reviewedBy: string, reason: string, now?: Date }} opts
 * @returns {OtsException}
 */
export function denyException(exc, opts) {
  if (!exc || exc.status !== EXCEPTION_STATUS.PENDING) {
    throw new Error(`denyException: exception must be PENDING, got ${exc?.status}`);
  }
  if (typeof opts?.reviewedBy !== 'string' || !opts.reviewedBy.trim()) {
    throw new Error('denyException: reviewedBy is required');
  }
  if (typeof opts?.reason !== 'string' || !opts.reason.trim()) {
    throw new Error('denyException: reason is required');
  }

  const now = opts.now || new Date();

  let updated = {
    ...exc,
    status: EXCEPTION_STATUS.DENIED,
    reviewedBy: opts.reviewedBy.trim(),
    reviewedAt: now.toISOString(),
    denyReason: opts.reason.trim(),
    signature: null,
  };

  updated = appendAuditEvent(updated, makeEvent(
    opts.reviewedBy.trim(),
    AUDIT_ACTION.DENIED,
    { reason: opts.reason.trim() },
    now,
  ));

  return updated;
}

/**
 * Revoke an APPROVED exception before expiry.
 *
 * @param {OtsException} exc
 * @param {{ revokedBy: string, reason?: string, now?: Date }} opts
 * @returns {OtsException}
 */
export function revokeException(exc, opts) {
  if (!exc || exc.status !== EXCEPTION_STATUS.APPROVED) {
    throw new Error(`revokeException: exception must be APPROVED, got ${exc?.status}`);
  }
  if (typeof opts?.revokedBy !== 'string' || !opts.revokedBy.trim()) {
    throw new Error('revokeException: revokedBy is required');
  }

  const now = opts.now || new Date();

  let updated = {
    ...exc,
    status: EXCEPTION_STATUS.REVOKED,
    signature: null,
  };

  updated = appendAuditEvent(updated, makeEvent(
    opts.revokedBy.trim(),
    AUDIT_ACTION.REVOKED,
    { reason: opts.reason || null },
    now,
  ));

  return updated;
}

/**
 * Renew an APPROVED exception, extending its expiry by durationDays.
 *
 * @param {OtsException} exc
 * @param {{
 *   renewedBy: string,
 *   durationDays?: number,
 *   privateKeyPem?: string,
 *   publicKeyPem?: string,
 *   keyId?: string,
 *   now?: Date,
 * }} opts
 * @returns {OtsException}
 */
export function renewException(exc, opts) {
  if (!exc || exc.status !== EXCEPTION_STATUS.APPROVED) {
    throw new Error(`renewException: exception must be APPROVED, got ${exc?.status}`);
  }
  if (typeof opts?.renewedBy !== 'string' || !opts.renewedBy.trim()) {
    throw new Error('renewException: renewedBy is required');
  }

  const now = opts.now || new Date();
  const days = typeof opts.durationDays === 'number' && opts.durationDays > 0
    ? opts.durationDays
    : exc.durationDays;
  const expiresAt = new Date(now.getTime() + days * 86400000).toISOString();

  let updated = {
    ...exc,
    expiresAt,
    durationDays: days,
    signature: null,
  };

  updated = appendAuditEvent(updated, makeEvent(
    opts.renewedBy.trim(),
    AUDIT_ACTION.RENEWED,
    { newExpiresAt: expiresAt, durationDays: days },
    now,
  ));

  if (opts.privateKeyPem) {
    updated = signRecord(updated, opts);
  }

  return updated;
}

/**
 * Mark an exception as EXPIRED (called by cron / gate on next check).
 *
 * @param {OtsException} exc
 * @param {{ now?: Date }} [opts]
 * @returns {OtsException}
 */
export function markExceptionExpired(exc, opts = {}) {
  if (!exc || exc.status !== EXCEPTION_STATUS.APPROVED) {
    throw new Error(`markExceptionExpired: exception must be APPROVED, got ${exc?.status}`);
  }

  const now = opts.now || new Date();

  let updated = {
    ...exc,
    status: EXCEPTION_STATUS.EXPIRED,
    signature: null,
  };

  updated = appendAuditEvent(updated, makeEvent(
    'ots-gate[bot]',
    AUDIT_ACTION.EXPIRED,
    { expiredAt: now.toISOString() },
    now,
  ));

  return updated;
}

/**
 * Record that a PR was merged under this active exception.
 *
 * @param {OtsException} exc
 * @param {{ prUrl?: string, mergedBy?: string, now?: Date }} [opts]
 * @returns {OtsException}
 */
export function markExceptionUsed(exc, opts = {}) {
  const now = opts.now || new Date();

  return appendAuditEvent(exc, makeEvent(
    'ots-gate[bot]',
    AUDIT_ACTION.USED,
    {
      ...(opts.prUrl ? { prUrl: opts.prUrl } : {}),
      ...(opts.mergedBy ? { mergedBy: opts.mergedBy } : {}),
      usedAt: now.toISOString(),
    },
    now,
  ));
}

// ---------------------------------------------------------------------------
// Expiry & active checks
// ---------------------------------------------------------------------------

/**
 * Returns true if the exception has passed its expiresAt timestamp.
 * An exception with no expiresAt never expires (only possible if data is corrupt).
 *
 * @param {OtsException} exc
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isExceptionExpired(exc, now = new Date()) {
  if (!exc || !exc.expiresAt) return false;
  return new Date(exc.expiresAt) < now;
}

/**
 * Returns true if this exception is currently active: APPROVED and not expired.
 *
 * @param {OtsException} exc
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isExceptionActive(exc, now = new Date()) {
  if (!exc) return false;
  if (exc.status !== EXCEPTION_STATUS.APPROVED) return false;
  return !isExceptionExpired(exc, now);
}

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/**
 * Find an active exception for a specific package@version from an index.
 * The index entries only need { id, package, version, status, expiresAt }.
 * Returns the first active match, or null if none.
 *
 * @param {Array<OtsExceptionIndexEntry>} index
 * @param {string} packageName
 * @param {string} version
 * @param {Date} [now]
 * @returns {OtsExceptionIndexEntry | null}
 */
export function findActiveException(index, packageName, version, now = new Date()) {
  if (!Array.isArray(index)) return null;
  for (const entry of index) {
    if (
      entry.package === packageName &&
      entry.version === version &&
      entry.status === EXCEPTION_STATUS.APPROVED &&
      !isExceptionExpired(entry, now)
    ) {
      return entry;
    }
  }
  return null;
}

/**
 * Build the lightweight index entry from a full exception record.
 *
 * @param {OtsException} exc
 * @returns {OtsExceptionIndexEntry}
 */
export function toIndexEntry(exc) {
  return {
    id: exc.id,
    package: exc.package,
    version: exc.version,
    status: exc.status,
    requestedBy: exc.requestedBy,
    reviewedBy: exc.reviewedBy || null,
    requestedAt: exc.requestedAt,
    expiresAt: exc.expiresAt || null,
    prUrl: exc.prUrl || null,
    topReason: exc.gateDecisionRef?.topReason || null,
  };
}

/**
 * Update or insert an index entry. Returns a NEW index array (immutable).
 *
 * @param {OtsExceptionIndexEntry[]} index
 * @param {OtsException} exc
 * @returns {OtsExceptionIndexEntry[]}
 */
export function upsertIndexEntry(index, exc) {
  const entry = toIndexEntry(exc);
  const existing = index.findIndex(e => e.id === exc.id);
  if (existing === -1) {
    return [...index, entry];
  }
  const updated = [...index];
  updated[existing] = entry;
  return updated;
}

// ---------------------------------------------------------------------------
// Signing helpers
// ---------------------------------------------------------------------------

/**
 * Sign an exception record using the OTS Ed25519 key.
 * Delegates to reportSigning.signReport — same canonicalization.
 *
 * @param {OtsException} exc
 * @param {{ privateKeyPem: string, publicKeyPem?: string, keyId?: string, now?: Date }} opts
 * @returns {OtsException}
 */
export function signRecord(exc, opts) {
  if (!opts || typeof opts.privateKeyPem !== 'string' || !opts.privateKeyPem.trim()) {
    throw new Error('signRecord: privateKeyPem is required');
  }
  // reportSigning.signReport treats any object with a top-level `signature`
  // field as a signed record. It strips the signature before canonicalizing,
  // then embeds the new signature. Reuse that machinery directly.
  return signReport(exc, {
    privateKeyPem: opts.privateKeyPem,
    publicKeyPem: opts.publicKeyPem,
    keyId: opts.keyId,
    location: 'top-level',
    now: opts.now ? () => opts.now.toISOString() : undefined,
  });
}

/**
 * Verify the signature on an exception record.
 * Returns the same shape as verifyReport.
 *
 * @param {OtsException} exc
 * @param {{ publicKeyPem: string }} opts
 * @returns {{ valid: boolean, reason?: string, keyFingerprint?: string, signedAt?: string }}
 */
export function verifyExceptionSignature(exc, opts) {
  if (!opts || typeof opts.publicKeyPem !== 'string') {
    return { valid: false, reason: 'publicKeyPem is required' };
  }
  return verifyReport(exc, { publicKeyPem: opts.publicKeyPem, location: 'top-level' });
}

// ---------------------------------------------------------------------------
// PR comment rendering (pure string, no React)
// ---------------------------------------------------------------------------

/**
 * Render the OTS Gate section for a PR comment when an exception is active.
 *
 * @param {OtsException} exc
 * @returns {string}  Markdown string
 */
export function renderExceptionComment(exc) {
  const lines = [];
  lines.push('## OTS Gate — Exception Active');
  lines.push('');
  lines.push(`**Package:** \`${exc.package}@${exc.version}\``);
  lines.push(`**Exception:** ${exc.id}`);
  if (exc.reviewedBy) lines.push(`**Approved by:** @${exc.reviewedBy} on ${exc.reviewedAt?.slice(0, 10) || 'unknown'}`);
  if (exc.expiresAt) lines.push(`**Expires:** ${exc.expiresAt.slice(0, 10)}`);
  if (exc.conditions && exc.conditions.length > 0) {
    lines.push('**Conditions:**');
    for (const c of exc.conditions) lines.push(`- ${c}`);
  }
  lines.push('');
  lines.push(`**Original block reason:** ${exc.gateDecisionRef?.tierName || 'Unknown tier'} — ${exc.gateDecisionRef?.topReason || ''}`);
  lines.push('');
  lines.push(`---`);
  lines.push(`_OTS Gate · Exception signed · [View audit record](.ots-exceptions/${exc.id}.json)_`);
  return lines.join('\n');
}

/**
 * Render the OTS Gate section for a PR comment when a block has no exception.
 *
 * @param {{ packageName: string, version: string, topReason: string, tierName: string }} opts
 * @returns {string}  Markdown string
 */
export function renderBlockedComment(opts) {
  const lines = [];
  lines.push('## OTS Gate — Blocked');
  lines.push('');
  lines.push(`**Package:** \`${opts.packageName}@${opts.version}\``);
  lines.push(`**Reason:** ${opts.tierName} — ${opts.topReason}`);
  lines.push('');
  lines.push('**Next action:**');
  lines.push(`Run \`node scripts/ots-exception.mjs request --package ${opts.packageName} --version ${opts.version} --justification "..." --days 14\``);
  lines.push('');
  lines.push('---');
  lines.push('_OTS Gate · Feature still ships. Risk does not._');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// JSDoc type stubs (no TypeScript required — just for IDE hints)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} OtsAuditEvent
 * @property {string} timestamp  ISO
 * @property {string} actor      GitHub username or 'ots-gate[bot]'
 * @property {string} action     One of AUDIT_ACTION values
 * @property {Record<string, unknown>} metadata
 */

/**
 * @typedef {Object} OtsException
 * @property {number} schemaVersion
 * @property {string} id             'OTS-EXC-YYYY-NNNN'
 * @property {string} createdAt
 * @property {string} package
 * @property {string} version
 * @property {string|null} fromVersion
 * @property {string|null} changeType
 * @property {{ decision: string, tier: number, tierName: string, topReason: string }} gateDecisionRef
 * @property {{ id: string, name: string }|null} matchedPattern
 * @property {string} requestedBy
 * @property {string} requestedAt
 * @property {string} justification
 * @property {number} durationDays
 * @property {string|null} prUrl
 * @property {string} status
 * @property {string|null} reviewedBy
 * @property {string|null} reviewedAt
 * @property {string|null} expiresAt
 * @property {string[]} conditions
 * @property {string|null} denyReason
 * @property {OtsAuditEvent[]} history
 * @property {any|null} signature
 */

/**
 * @typedef {Object} OtsExceptionIndexEntry
 * @property {string} id
 * @property {string} package
 * @property {string} version
 * @property {string} status
 * @property {string} requestedBy
 * @property {string|null} reviewedBy
 * @property {string} requestedAt
 * @property {string|null} expiresAt
 * @property {string|null} prUrl
 * @property {string|null} topReason
 */
