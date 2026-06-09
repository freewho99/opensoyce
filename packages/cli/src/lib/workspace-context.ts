// Shared workspace-mode helper for gate-driven commands (check, lockfile, why).
//
// PR-V2-D — per PR-V1-E §3.1 (--workspace on gate commands) and §6
// (workspaceContext field on CliEvidence).
//
// IMPORTANT scope boundary: PR-V2-D does NOT change `/api/compliance-gate`
// semantics. The public gate response remains workspace-independent. What
// the CLI does in workspace mode is fetch the workspace's exceptions for
// the queried subject and annotate the output — a CLIENT-SIDE overlay,
// not a server-side gate change. A future PR will move the overlay into
// the gate response itself; until then the CLI overlay is the integration
// point.
//
// The function returns null when no session is available so the caller
// can render a usage error early without trying to overlay workspace
// data on an anonymous call.

import { loadSession, type VaultSession } from './session.js';
import {
  listExceptions,
  listVaultTimeline,
  type VaultException,
  type VaultTimelineEvent,
} from './vault-api.js';
import { EXIT_USAGE_ERROR } from '../exit-codes.js';

// Re-export the Vault types so v0 commands can import them from the
// wrapper module without violating the PR-V1-E §7.1 vault-api direct-
// import ban.
export type { VaultException, VaultTimelineEvent };

export interface WorkspaceContext {
  workspaceId: string;
  appliedExceptionIds: string[];
  exceptions: VaultException[];
  visibility: 'private';
}

export interface WorkspaceFetchResult {
  ok: true;
  context: WorkspaceContext;
  session: VaultSession;
}
export interface WorkspaceFetchUsageError {
  ok: false;
  exitCode: number;
  message: string;
}
export type WorkspaceFetchOutcome = WorkspaceFetchResult | WorkspaceFetchUsageError;

/**
 * Fetch the workspace's currently-active exceptions and filter them to
 * the queried subject. Returns a structured context the caller can
 * render alongside the public gate result.
 *
 * Pre-conditions checked here:
 *   - args.workspace must be a string. Caller passes it explicitly so
 *     this function never reads args directly.
 *   - A session file must exist. If not → usage error (the v0 doctrine
 *     forbids silent downgrade to public mode when --workspace was set).
 */
export async function fetchWorkspaceExceptions(opts: {
  apiBase: string;
  workspace: string;
  subjectName: string;
  timeoutMs: number;
}): Promise<WorkspaceFetchOutcome> {
  const session = loadSession();
  if (!session) {
    return {
      ok: false,
      exitCode: EXIT_USAGE_ERROR,
      message: 'opensoyce login required before --workspace <id>.',
    };
  }
  const apiBase = session.api_base || opts.apiBase;
  const listRes = await listExceptions(
    apiBase,
    session.session_token,
    opts.workspace,
    { state: 'active', limit: 200 },
    opts.timeoutMs,
  );
  if (!listRes.ok) {
    return { ok: false, exitCode: listRes.exitCode, message: listRes.message };
  }
  const matched = listRes.data.exceptions.filter((e) => e.subject_name === opts.subjectName);
  return {
    ok: true,
    session,
    context: {
      workspaceId: opts.workspace,
      appliedExceptionIds: matched.map((e) => e.exception_id),
      exceptions: matched,
      visibility: 'private',
    },
  };
}

/**
 * Fetch all currently-active exceptions in a workspace (no subject
 * filter). Used by `opensoyce lockfile --workspace` which subsequently
 * cross-references the workspace's exceptions against the lockfile's
 * entries client-side.
 *
 * This wrapper exists to satisfy PR-V1-E §7.1 — v0 commands import
 * vault paths only through a shared module that handles session +
 * usage-error semantics in one place.
 */
export async function fetchActiveWorkspaceExceptions(opts: {
  apiBase: string;
  workspace: string;
  timeoutMs: number;
}): Promise<
  | { ok: true; session: VaultSession; exceptions: VaultException[] }
  | { ok: false; exitCode: number; message: string }
> {
  const session = loadSession();
  if (!session) {
    return {
      ok: false,
      exitCode: EXIT_USAGE_ERROR,
      message: 'opensoyce login required before --workspace <id>.',
    };
  }
  const apiBase = session.api_base || opts.apiBase;
  const res = await listExceptions(
    apiBase,
    session.session_token,
    opts.workspace,
    { state: 'active', limit: 200 },
    opts.timeoutMs,
  );
  if (!res.ok) {
    return { ok: false, exitCode: res.exitCode, message: res.message };
  }
  return { ok: true, session, exceptions: res.data.exceptions };
}

/**
 * Fetch Vault Timeline events for a workspace. Used by
 * `opensoyce timeline --workspace`. Same session + usage-error semantics
 * as fetchWorkspaceExceptions; same wrapper rationale from PR-V1-E §7.1.
 */
export async function fetchVaultTimelineEvents(opts: {
  apiBase: string;
  workspace: string;
  packageFilter?: string;
  timeoutMs: number;
}): Promise<
  | { ok: true; session: VaultSession; events: VaultTimelineEvent[] }
  | { ok: false; exitCode: number; message: string }
> {
  const session = loadSession();
  if (!session) {
    return {
      ok: false,
      exitCode: EXIT_USAGE_ERROR,
      message: 'opensoyce login required before --workspace <id>.',
    };
  }
  const apiBase = session.api_base || opts.apiBase;
  const res = await listVaultTimeline(
    apiBase,
    session.session_token,
    opts.workspace,
    {},
    opts.timeoutMs,
  );
  if (!res.ok) {
    return { ok: false, exitCode: res.exitCode, message: res.message };
  }
  const events = (res.data.events || []).filter((ev) => {
    if (opts.packageFilter && !ev.summary.includes(opts.packageFilter)) return false;
    return true;
  });
  return { ok: true, session, events };
}

/**
 * Render the workspace-exception context block beneath a gate command's
 * default output. Always prefixed with [PRIVATE] so the reader can
 * distinguish from public output.
 */
export function formatWorkspaceContext(ctx: WorkspaceContext): string {
  if (ctx.exceptions.length === 0) {
    return `\n[PRIVATE] No matching exceptions in workspace ${ctx.workspaceId}.\n`;
  }
  let out = `\n[PRIVATE] Workspace ${ctx.workspaceId} — ${ctx.exceptions.length} active exception(s) for this subject\n`;
  for (const ex of ctx.exceptions) {
    const expires = ex.expires_at ? ex.expires_at.slice(0, 10) : '—';
    out += `  ${ex.original_action}→${ex.allowed_action.padEnd(5)}  expires ${expires}  id ${ex.exception_id}\n`;
  }
  return out;
}
