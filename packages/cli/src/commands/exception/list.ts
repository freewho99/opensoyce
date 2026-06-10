// `opensoyce exception list --workspace <id> [--state ...] [--subject ...] [--limit ...]`
// Per PR-V1-E §4.1.
//
// Requires a Vault session AND --workspace. The CLI never falls back to
// public mode here — every output row is private workspace data.
//
// PR-DOGFOOD-1 fix: when --subject is supplied, page through the API
// rather than filtering client-side over a truncated first page. The
// server's default page size is 50 (MAX_LIMIT=200). The old client-
// side-only filter silently hid exception #51+ when the subject lived
// further into the list. New behavior:
//   - explicit --limit honored verbatim, no paging beyond that bound
//   - no --limit + no --subject: single page at default server size
//   - no --limit + --subject:    page through (max page = 200, hard cap
//                                 at MAX_SCAN_RECORDS so a malformed
//                                 workspace can't loop forever); if the
//                                 hard cap is hit, warn on stderr that
//                                 the search is truncated

import type { ParsedArgs } from '../../args.js';
import { EXIT_ALLOW, EXIT_USAGE_ERROR } from '../../exit-codes.js';
import { loadSession } from '../../lib/session.js';
import { listExceptions, type VaultException } from '../../lib/vault-api.js';

const SUBJECT_SCAN_PAGE_SIZE = 200;
const MAX_SCAN_RECORDS = 5000;

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

  // Path 1: caller passed --limit OR did not pass --subject. Single
  // API call, same behavior as before. Subject filter (if any) still
  // applies client-side because the server has no free-text matcher.
  if (typeof args.exceptionLimit === 'number' || !args.exceptionSubject) {
    const query: Record<string, string | number | undefined> = {};
    if (args.exceptionState) query.state = args.exceptionState;
    if (typeof args.exceptionLimit === 'number') query.limit = args.exceptionLimit;
    const res = await listExceptions(apiBase, session.session_token, args.workspace, query, args.timeoutMs);
    if (!res.ok) {
      process.stderr.write(`${res.message}\n`);
      return res.exitCode;
    }
    const { exceptions, total_count_estimate } = res.data;
    const filtered = args.exceptionSubject
      ? exceptions.filter((e) => e.subject_name === args.exceptionSubject)
      : exceptions;
    if (args.exceptionSubject && exceptions.length < total_count_estimate) {
      process.stderr.write(
        `Warning: workspace has ${total_count_estimate} exceptions but only ${exceptions.length} were fetched. ` +
        `--subject "${args.exceptionSubject}" was matched against the first page only. ` +
        `Re-run without --limit to scan all pages.\n`,
      );
    }
    return emit(args, filtered, total_count_estimate, false);
  }

  // Path 2: --subject without --limit. Page through with a fixed scan
  // limit so we do not silently miss the target. The hard cap prevents
  // a runaway loop if the server's total_count_estimate is wrong.
  const matched: VaultException[] = [];
  let offset = 0;
  let totalEstimate = 0;
  let truncated = false;
  while (offset < MAX_SCAN_RECORDS) {
    const query: Record<string, string | number | undefined> = {
      limit: SUBJECT_SCAN_PAGE_SIZE,
      offset,
    };
    if (args.exceptionState) query.state = args.exceptionState;
    const res = await listExceptions(apiBase, session.session_token, args.workspace, query, args.timeoutMs);
    if (!res.ok) {
      process.stderr.write(`${res.message}\n`);
      return res.exitCode;
    }
    totalEstimate = res.data.total_count_estimate;
    for (const ex of res.data.exceptions) {
      if (ex.subject_name === args.exceptionSubject) matched.push(ex);
    }
    if (res.data.exceptions.length < SUBJECT_SCAN_PAGE_SIZE) break;
    offset += res.data.exceptions.length;
    if (offset >= MAX_SCAN_RECORDS && totalEstimate > MAX_SCAN_RECORDS) {
      truncated = true;
      break;
    }
  }
  if (truncated) {
    process.stderr.write(
      `Warning: --subject scan stopped after ${MAX_SCAN_RECORDS} records (workspace has ${totalEstimate}). ` +
      `Add --state to narrow OR pass --limit to opt out of full scan.\n`,
    );
  }
  return emit(args, matched, totalEstimate, truncated);
}

function emit(args: ParsedArgs, rows: VaultException[], totalEstimate: number, truncated: boolean): number {
  if (args.json) {
    process.stdout.write(`${JSON.stringify({
      workspace: args.workspace,
      exceptions: rows,
      total_count_estimate: totalEstimate,
      truncated,
      visibility: 'private',
    }, null, 2)}\n`);
    return EXIT_ALLOW;
  }
  if (rows.length === 0) {
    process.stdout.write(`[PRIVATE] No exceptions on record in workspace ${args.workspace}.\n`);
    return EXIT_ALLOW;
  }
  process.stdout.write(`[PRIVATE] Workspace ${args.workspace} — ${rows.length} exception(s)\n`);
  for (const ex of rows) {
    const kind = ex.subject_kind === 'package' ? 'pkg' : 'repo';
    const expires = ex.expires_at ? ex.expires_at.slice(0, 10) : '—';
    process.stdout.write(
      `  ${ex.state.padEnd(9)}  ${ex.original_action}→${ex.allowed_action.padEnd(5)}  ${kind} ${ex.subject_name.padEnd(40)}  expires ${expires}  id ${ex.exception_id}\n`,
    );
  }
  return EXIT_ALLOW;
}
