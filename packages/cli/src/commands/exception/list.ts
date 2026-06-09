// `opensoyce exception list --workspace <id> [--state ...] [--subject ...] [--limit ...]`
// Per PR-V1-E §4.1.
//
// Requires a Vault session AND --workspace. The CLI never falls back to
// public mode here — every output row is private workspace data.

import type { ParsedArgs } from '../../args.js';
import { EXIT_ALLOW, EXIT_USAGE_ERROR } from '../../exit-codes.js';
import { loadSession } from '../../lib/session.js';
import { listExceptions } from '../../lib/vault-api.js';

export async function runExceptionList(args: ParsedArgs): Promise<number> {
  if (!args.workspace) {
    process.stderr.write('Usage error: --workspace <id> is required for `exception list`.\n');
    return EXIT_USAGE_ERROR;
  }
  const session = loadSession();
  if (!session) {
    process.stderr.write('opensoyce login required before --workspace <id>.\n');
    return EXIT_USAGE_ERROR;
  }
  const apiBase = session.api_base || args.apiBase;

  const query: Record<string, string | number | undefined> = {};
  if (args.exceptionState) query.state = args.exceptionState;
  if (typeof args.exceptionLimit === 'number') query.limit = args.exceptionLimit;

  const res = await listExceptions(apiBase, session.session_token, args.workspace, query, args.timeoutMs);
  if (!res.ok) {
    process.stderr.write(`${res.message}\n`);
    return res.exitCode;
  }
  const { exceptions, total_count_estimate } = res.data;

  // Subject filter is applied client-side because the API exposes it only
  // through subject_kind / subject_name pairs, not a free-text contains
  // matcher. Stay strict — exact match.
  const filtered = args.exceptionSubject
    ? exceptions.filter((e) => e.subject_name === args.exceptionSubject)
    : exceptions;

  if (args.json) {
    process.stdout.write(`${JSON.stringify({
      workspace: args.workspace,
      exceptions: filtered,
      total_count_estimate,
      visibility: 'private',
    }, null, 2)}\n`);
    return EXIT_ALLOW;
  }

  if (filtered.length === 0) {
    process.stdout.write(`[PRIVATE] No exceptions on record in workspace ${args.workspace}.\n`);
    return EXIT_ALLOW;
  }
  process.stdout.write(`[PRIVATE] Workspace ${args.workspace} — ${filtered.length} exception(s)\n`);
  for (const ex of filtered) {
    const kind = ex.subject_kind === 'package' ? 'pkg' : 'repo';
    const expires = ex.expires_at ? ex.expires_at.slice(0, 10) : '—';
    process.stdout.write(
      `  ${ex.state.padEnd(9)}  ${ex.original_action}→${ex.allowed_action.padEnd(5)}  ${kind} ${ex.subject_name.padEnd(40)}  expires ${expires}  id ${ex.exception_id}\n`,
    );
  }
  return EXIT_ALLOW;
}
