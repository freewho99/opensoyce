#!/usr/bin/env node
/**
 * ots-exception.mjs — OTS Gate Exception Lifecycle CLI
 *
 * Manages exception requests and approvals stored in .ots-exceptions/.
 * One JSON file per exception. index.json is the lightweight index.
 *
 * Commands:
 *   request  --package <pkg> --version <ver> --justification <text>
 *            [--from <ver>] [--days <n>] [--pr <url>]
 *   approve  --id <OTS-EXC-YYYY-NNNN> --reviewer <github-user>
 *            [--conditions <str>...] [--days <n>]
 *   deny     --id <OTS-EXC-YYYY-NNNN> --reviewer <github-user> --reason <text>
 *   revoke   --id <OTS-EXC-YYYY-NNNN> --by <github-user> [--reason <text>]
 *   renew    --id <OTS-EXC-YYYY-NNNN> --by <github-user> [--days <n>]
 *   list     [--status <STATUS>] [--package <pkg>]
 *   export   [--since <ISO-date>] [--format json|table]
 *
 * Signing: reads OTS_SIGNING_PRIVATE_KEY env var (PEM). If absent, exceptions
 * are written unsigned — the audit chain is still valid, just not cryptographically
 * sealed. Useful for developer-local flows before CI key is configured.
 *
 * Storage: .ots-exceptions/ relative to cwd (or OTS_EXCEPTIONS_DIR env var).
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  generateExceptionId,
  createExceptionRequest,
  approveException,
  denyException,
  revokeException,
  renewException,
  toIndexEntry,
  upsertIndexEntry,
  isExceptionActive,
  EXCEPTION_STATUS,
} from '../src/shared/otsExceptions.js';

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

function getDir() {
  return process.env.OTS_EXCEPTIONS_DIR
    || path.join(process.cwd(), '.ots-exceptions');
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function indexPath(dir) {
  return path.join(dir, 'index.json');
}

function excPath(dir, id) {
  return path.join(dir, `${id}.json`);
}

function loadIndex(dir) {
  const p = indexPath(dir);
  if (!fs.existsSync(p)) return [];
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return []; }
}

function saveIndex(dir, index) {
  fs.writeFileSync(indexPath(dir), JSON.stringify(index, null, 2) + '\n', 'utf8');
}

function loadException(dir, id) {
  const p = excPath(dir, id);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
}

function saveException(dir, exc) {
  fs.writeFileSync(excPath(dir, exc.id), JSON.stringify(exc, null, 2) + '\n', 'utf8');
}

function getSigningKey() {
  const pem = process.env.OTS_SIGNING_PRIVATE_KEY;
  if (!pem || !pem.trim()) return null;
  return pem;
}

// ---------------------------------------------------------------------------
// Argument parser
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const opts = {};
  const conditions = [];

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--package') opts.package = rest[++i];
    else if (arg === '--version') opts.version = rest[++i];
    else if (arg === '--from') opts.fromVersion = rest[++i];
    else if (arg === '--justification') opts.justification = rest[++i];
    else if (arg === '--days') opts.days = parseInt(rest[++i], 10);
    else if (arg === '--pr') opts.prUrl = rest[++i];
    else if (arg === '--id') opts.id = rest[++i];
    else if (arg === '--reviewer') opts.reviewer = rest[++i];
    else if (arg === '--by') opts.by = rest[++i];
    else if (arg === '--reason') opts.reason = rest[++i];
    else if (arg === '--status') opts.status = rest[++i];
    else if (arg === '--since') opts.since = rest[++i];
    else if (arg === '--format') opts.format = rest[++i];
    else if (arg === '--conditions') {
      // Consume all remaining values that don't start with --
      while (i + 1 < rest.length && !rest[i + 1].startsWith('--')) {
        conditions.push(rest[++i]);
      }
    }
  }
  opts.conditions = conditions;
  return { command, opts };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdRequest(opts, dir) {
  if (!opts.package) { console.error('Error: --package is required'); process.exit(1); }
  if (!opts.version) { console.error('Error: --version is required'); process.exit(1); }
  if (!opts.justification) { console.error('Error: --justification is required'); process.exit(1); }

  ensureDir(dir);
  const index = loadIndex(dir);

  const exc = createExceptionRequest({
    index,
    package: opts.package,
    version: opts.version,
    fromVersion: opts.fromVersion || null,
    gateDecisionRef: {
      decision: 'AUTO-MERGE BLOCKED',
      tier: 4,
      tierName: 'Tier 4: Never Blind Auto-merge',
      topReason: 'Created via CLI request — tier details available in gate log',
    },
    requestedBy: process.env.OTS_ACTOR || process.env.GITHUB_ACTOR || 'cli-user',
    justification: opts.justification,
    durationDays: opts.days || 14,
    prUrl: opts.prUrl || null,
  });

  saveException(dir, exc);
  const updatedIndex = upsertIndexEntry(index, exc);
  saveIndex(dir, updatedIndex);

  console.log(`✓ Exception request created: ${exc.id}`);
  console.log(`  Status:  PENDING`);
  console.log(`  Package: ${exc.package}@${exc.version}`);
  console.log(`  Expires: ${exc.durationDays} days after approval`);
  console.log(`  File:    .ots-exceptions/${exc.id}.json`);
  console.log('');
  console.log('  Next: ask a security owner to run:');
  console.log(`    node scripts/ots-exception.mjs approve --id ${exc.id} --reviewer <github-user>`);
}

function cmdApprove(opts, dir) {
  if (!opts.id) { console.error('Error: --id is required'); process.exit(1); }
  if (!opts.reviewer) { console.error('Error: --reviewer is required'); process.exit(1); }

  const exc = loadException(dir, opts.id);
  if (!exc) { console.error(`Error: exception ${opts.id} not found`); process.exit(1); }

  const privateKeyPem = getSigningKey();

  const approved = approveException(exc, {
    reviewedBy: opts.reviewer,
    conditions: opts.conditions.length > 0 ? opts.conditions : [],
    durationDays: opts.days || undefined,
    privateKeyPem: privateKeyPem || undefined,
    now: new Date(),
  });

  saveException(dir, approved);
  const index = loadIndex(dir);
  saveIndex(dir, upsertIndexEntry(index, approved));

  console.log(`✓ Exception approved: ${approved.id}`);
  console.log(`  Status:   APPROVED`);
  console.log(`  Reviewer: @${approved.reviewedBy}`);
  console.log(`  Expires:  ${approved.expiresAt}`);
  if (approved.conditions.length > 0) {
    console.log(`  Conditions:`);
    for (const c of approved.conditions) console.log(`    - ${c}`);
  }
  if (privateKeyPem) {
    console.log(`  Signed:   ✓ (Ed25519)`);
  } else {
    console.log(`  Signed:   ✗ (set OTS_SIGNING_PRIVATE_KEY to enable)`);
  }
}

function cmdDeny(opts, dir) {
  if (!opts.id) { console.error('Error: --id is required'); process.exit(1); }
  if (!opts.reviewer) { console.error('Error: --reviewer is required'); process.exit(1); }
  if (!opts.reason) { console.error('Error: --reason is required'); process.exit(1); }

  const exc = loadException(dir, opts.id);
  if (!exc) { console.error(`Error: exception ${opts.id} not found`); process.exit(1); }

  const denied = denyException(exc, {
    reviewedBy: opts.reviewer,
    reason: opts.reason,
    now: new Date(),
  });

  saveException(dir, denied);
  const index = loadIndex(dir);
  saveIndex(dir, upsertIndexEntry(index, denied));

  console.log(`✗ Exception denied: ${denied.id}`);
  console.log(`  Reviewer: @${denied.reviewedBy}`);
  console.log(`  Reason:   ${denied.denyReason}`);
}

function cmdRevoke(opts, dir) {
  if (!opts.id) { console.error('Error: --id is required'); process.exit(1); }
  if (!opts.by) { console.error('Error: --by is required'); process.exit(1); }

  const exc = loadException(dir, opts.id);
  if (!exc) { console.error(`Error: exception ${opts.id} not found`); process.exit(1); }

  const revoked = revokeException(exc, {
    revokedBy: opts.by,
    reason: opts.reason || null,
    now: new Date(),
  });

  saveException(dir, revoked);
  const index = loadIndex(dir);
  saveIndex(dir, upsertIndexEntry(index, revoked));

  console.log(`⊘ Exception revoked: ${revoked.id}`);
}

function cmdRenew(opts, dir) {
  if (!opts.id) { console.error('Error: --id is required'); process.exit(1); }
  if (!opts.by) { console.error('Error: --by is required'); process.exit(1); }

  const exc = loadException(dir, opts.id);
  if (!exc) { console.error(`Error: exception ${opts.id} not found`); process.exit(1); }

  const privateKeyPem = getSigningKey();

  const renewed = renewException(exc, {
    renewedBy: opts.by,
    durationDays: opts.days || undefined,
    privateKeyPem: privateKeyPem || undefined,
    now: new Date(),
  });

  saveException(dir, renewed);
  const index = loadIndex(dir);
  saveIndex(dir, upsertIndexEntry(index, renewed));

  console.log(`↻ Exception renewed: ${renewed.id}`);
  console.log(`  New expiry: ${renewed.expiresAt}`);
}

function cmdList(opts, dir) {
  const index = loadIndex(dir);
  const now = new Date();

  let rows = index;
  if (opts.status) {
    rows = rows.filter(e => e.status === opts.status.toUpperCase());
  }
  if (opts.package) {
    rows = rows.filter(e => e.package === opts.package);
  }

  if (rows.length === 0) {
    console.log('No exceptions found.');
    return;
  }

  console.log(`${'ID'.padEnd(22)} ${'PACKAGE'.padEnd(20)} ${'VERSION'.padEnd(12)} ${'STATUS'.padEnd(10)} ${'EXPIRES'.padEnd(12)} REVIEWER`);
  console.log('─'.repeat(100));
  for (const e of rows) {
    const expired = e.expiresAt && new Date(e.expiresAt) < now;
    const status = expired && e.status === EXCEPTION_STATUS.APPROVED ? 'EXPIRED*' : e.status;
    const expiry = e.expiresAt ? e.expiresAt.slice(0, 10) : '—';
    console.log(
      `${e.id.padEnd(22)} ${e.package.padEnd(20)} ${(e.version || '').padEnd(12)} ${status.padEnd(10)} ${expiry.padEnd(12)} ${e.reviewedBy || '—'}`,
    );
  }
}

function cmdExport(opts, dir) {
  const index = loadIndex(dir);
  let rows = index;

  if (opts.since) {
    const since = new Date(opts.since);
    rows = rows.filter(e => e.requestedAt && new Date(e.requestedAt) >= since);
  }

  const full = rows.map(e => loadException(dir, e.id)).filter(Boolean);

  if (opts.format === 'table') {
    cmdList(opts, dir);
    return;
  }

  // Default: JSON
  console.log(JSON.stringify({ exportedAt: new Date().toISOString(), count: full.length, exceptions: full }, null, 2));
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
if (argv.length === 0) {
  console.log('Usage: node scripts/ots-exception.mjs <command> [options]');
  console.log('Commands: request, approve, deny, revoke, renew, list, export');
  process.exit(0);
}

const { command, opts } = parseArgs(argv);
const dir = getDir();

switch (command) {
  case 'request': cmdRequest(opts, dir); break;
  case 'approve': cmdApprove(opts, dir); break;
  case 'deny':    cmdDeny(opts, dir); break;
  case 'revoke':  cmdRevoke(opts, dir); break;
  case 'renew':   cmdRenew(opts, dir); break;
  case 'list':    cmdList(opts, dir); break;
  case 'export':  cmdExport(opts, dir); break;
  default:
    console.error(`Unknown command: ${command}`);
    process.exit(1);
}
