// `opensoyce exception propose --subject <pkg|owner/repo> --from <action> --to <action> --reason <text> [--expires-at <iso>] --workspace <id>`
// Per PR-V1-E §4.4.
//
// Proposing from the CLI does not violate the four-eye principle — a
// proposal is not a gate-changing action until a reviewer approves it
// (PR-V1-C §1.2). Approval / rejection / extension stay UI-only.
//
// The CLI infers subject_kind from the shape of --subject:
//   owner/repo  → repo
//   anything else → package

import type { ParsedArgs } from '../../args.js';
import { EXIT_ALLOW, EXIT_USAGE_ERROR } from '../../exit-codes.js';
import { loadSession } from '../../lib/session.js';
import { proposeException } from '../../lib/vault-api.js';

const REPO_RE = /^[A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*$/;
const VALID_ACTIONS = new Set(['BLOCK', 'WARN', 'ALLOW']);

export async function runExceptionPropose(args: ParsedArgs): Promise<number> {
  if (!args.workspace) {
    process.stderr.write('Usage error: --workspace <id> is required for `exception propose`.\n');
    return EXIT_USAGE_ERROR;
  }
  if (!args.exceptionSubject) {
    process.stderr.write('Usage error: --subject <pkg|owner/repo> is required.\n');
    return EXIT_USAGE_ERROR;
  }
  if (!args.exceptionFrom || !VALID_ACTIONS.has(args.exceptionFrom)) {
    process.stderr.write('Usage error: --from <BLOCK|WARN|ALLOW> is required.\n');
    return EXIT_USAGE_ERROR;
  }
  if (!args.exceptionTo || !VALID_ACTIONS.has(args.exceptionTo)) {
    process.stderr.write('Usage error: --to <BLOCK|WARN|ALLOW> is required.\n');
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

  const kind: 'package' | 'repo' = REPO_RE.test(args.exceptionSubject) ? 'repo' : 'package';

  // CLI proposals must carry at least one proof anchor (the API rejects
  // empty arrays). A live-surface anchor pointing at the workspace's
  // current `exception list` view is the minimum useful citation; the
  // reviewer's UI lets them attach more before approval.
  const proofAnchors = [
    {
      proofType: 'live-surface',
      label: 'CLI-proposed exception',
      href: `${apiBase}/api/vault/workspaces/${encodeURIComponent(args.workspace)}/exceptions`,
    },
  ];

  const res = await proposeException(apiBase, session.session_token, args.workspace, {
    subject: { kind, name: args.exceptionSubject },
    original_action: args.exceptionFrom as 'BLOCK' | 'WARN',
    allowed_action: args.exceptionTo as 'WARN' | 'ALLOW',
    reason_public: args.exceptionReason,
    expires_at: args.exceptionExpiresAt,
    proof_anchors: proofAnchors,
  }, args.timeoutMs);

  if (!res.ok) {
    process.stderr.write(`${res.message}\n`);
    return res.exitCode;
  }

  if (args.json) {
    process.stdout.write(`${JSON.stringify({ ...res.data, visibility: 'private' }, null, 2)}\n`);
  } else if (!args.quiet) {
    process.stdout.write(
      `[PRIVATE] Proposed exception ${res.data.exception_id}; awaiting reviewer action.\n`,
    );
  }
  return EXIT_ALLOW;
}
