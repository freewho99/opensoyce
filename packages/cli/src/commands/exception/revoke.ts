// `opensoyce exception revoke <exception_id> --reason <text> --workspace <id>`
// Per PR-V1-E §4.3.
//
// Revocation is in the CLI because it's a safety operation — the workspace
// decided an active exception is wrong and wants it gone NOW. Tightens the
// gate, never loosens it.

import type { ParsedArgs } from '../../args.js';
import { EXIT_ALLOW, EXIT_USAGE_ERROR } from '../../exit-codes.js';
import { loadSession } from '../../lib/session.js';
import { revokeException } from '../../lib/vault-api.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function runExceptionRevoke(args: ParsedArgs): Promise<number> {
  if (!args.workspace) {
    process.stderr.write('Usage error: --workspace <id> is required for `exception revoke`.\n');
    return EXIT_USAGE_ERROR;
  }
  const exceptionId = args.positional[0];
  if (!exceptionId || !UUID_RE.test(exceptionId)) {
    process.stderr.write('Usage error: `exception revoke <exception_id>` requires a UUID.\n');
    return EXIT_USAGE_ERROR;
  }
  if (!args.exceptionReason || args.exceptionReason.length < 1 || args.exceptionReason.length > 280) {
    process.stderr.write('Usage error: --reason <text 1..280 chars> is required.\n');
    return EXIT_USAGE_ERROR;
  }

  const session = loadSession();
  if (!session) {
    process.stderr.write('opensoyce login required before --workspace <id>.\n');
    return EXIT_USAGE_ERROR;
  }
  const apiBase = session.api_base || args.apiBase;

  const res = await revokeException(apiBase, session.session_token, args.workspace, exceptionId, {
    revoke_reason: args.exceptionReason,
  }, args.timeoutMs);
  if (!res.ok) {
    process.stderr.write(`${res.message}\n`);
    return res.exitCode;
  }

  if (args.json) {
    process.stdout.write(`${JSON.stringify({ ...res.data, visibility: 'private' }, null, 2)}\n`);
  } else if (!args.quiet) {
    process.stdout.write(`[PRIVATE] Revoked exception ${res.data.exception_id}.\n`);
  }
  return EXIT_ALLOW;
}
