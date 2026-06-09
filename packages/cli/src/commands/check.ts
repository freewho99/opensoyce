import { callGate } from '../api.js';
import {
  EXIT_NOT_EVALUATED,
  EXIT_USAGE_ERROR,
  exitCodeForAction,
  type GateAction,
} from '../exit-codes.js';
import { STRINGS } from '../strings.js';
import type { ParsedArgs } from '../args.js';
import { formatCheck } from '../output.js';
import { fetchWorkspaceExceptions, formatWorkspaceContext } from '../lib/workspace-context.js';

const PACKAGE_SPEC_RE = /^@?[a-z0-9][\w./-]*@[\w.+-]+$/i;

function subjectFromPkg(pkg: string): string {
  // /api/compliance-gate accepts `name@version`; the workspace exception
  // subject_name carries the same shape. Match exactly.
  return pkg;
}

export async function runCheck(args: ParsedArgs): Promise<number> {
  const pkg = args.positional[0];
  if (!pkg) {
    process.stderr.write(STRINGS.errors.missingArg('check', '<pkg>') + '\n');
    return EXIT_USAGE_ERROR;
  }
  if (!PACKAGE_SPEC_RE.test(pkg)) {
    process.stderr.write(STRINGS.errors.invalidPackage(pkg) + '\n');
    return EXIT_USAGE_ERROR;
  }

  const result = await callGate(args.apiBase, pkg, args.timeoutMs);
  if (!result.ok) {
    process.stderr.write(result.message + '\n');
    return result.exitCode;
  }

  const action: GateAction = (result.data.action ?? 'NOT_EVALUATED') as GateAction;
  const output = formatCheck({
    command: 'check',
    query: { package: pkg },
    action,
    firedPatterns: result.data.firedPatterns ?? [],
    proofAnchors: anchorsFor(pkg, result.data),
    fetchedAt: new Date().toISOString(),
    apiBase: args.apiBase,
  }, args);

  if (output) process.stdout.write(output);

  // Workspace mode (PR-V2-D): if the user supplied --workspace AND has a
  // session, fetch the workspace's active exceptions for this subject and
  // append a [PRIVATE] context block. The public gate response above is
  // unchanged — workspace overlay is informational client-side annotation
  // only. Exit code stays driven by the public gate action.
  if (args.workspace) {
    const ctx = await fetchWorkspaceExceptions({
      apiBase: args.apiBase,
      workspace: args.workspace,
      subjectName: subjectFromPkg(pkg),
      timeoutMs: args.timeoutMs,
    });
    if (!ctx.ok) {
      process.stderr.write(ctx.message + '\n');
      return ctx.exitCode;
    }
    if (!args.json) {
      process.stdout.write(formatWorkspaceContext(ctx.context));
    }
  }

  if (action === 'NOT_EVALUATED') return EXIT_NOT_EVALUATED;
  return exitCodeForAction(action);
}

function anchorsFor(pkg: string, _data: Record<string, unknown>) {
  return [
    {
      proofType: 'live-surface' as const,
      label: `/proof/gate?package=${encodeURIComponent(pkg)}`,
      href: `/proof/gate?package=${encodeURIComponent(pkg)}`,
    },
  ];
}
