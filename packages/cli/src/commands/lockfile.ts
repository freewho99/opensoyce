import * as fs from 'node:fs';
import * as path from 'node:path';
import { callGate } from '../api.js';
import {
  EXIT_NETWORK_ERROR,
  EXIT_NOT_EVALUATED,
  EXIT_USAGE_ERROR,
  exitCodeForAction,
  worstAction,
  type GateAction,
} from '../exit-codes.js';
import { STRINGS } from '../strings.js';
import type { ParsedArgs } from '../args.js';
import { formatLockfile, type LockfileEntryEvidence, type LockfileFailure } from '../output.js';
import { detectFormat, parseNpmLockfile } from '../lib/lockfile-parser.js';
import { fetchActiveWorkspaceExceptions, type VaultException } from '../lib/workspace-context.js';

export async function runLockfile(args: ParsedArgs): Promise<number> {
  const rel = args.positional[0] ?? './package-lock.json';
  const abs = path.resolve(process.cwd(), rel);

  let text: string;
  try {
    text = fs.readFileSync(abs, 'utf8');
  } catch {
    process.stderr.write(STRINGS.errors.lockfileNotFound(rel) + '\n');
    return EXIT_USAGE_ERROR;
  }

  const format = detectFormat(text);
  if (format !== 'npm-v1' && format !== 'npm-v2' && format !== 'npm-v3') {
    process.stderr.write(STRINGS.errors.lockfileFormatNotSupported(format) + '\n');
    return EXIT_USAGE_ERROR;
  }

  let entries;
  try {
    entries = parseNpmLockfile(text);
  } catch (e) {
    process.stderr.write(STRINGS.errors.usage(`Failed to parse lockfile: ${(e as Error).message}`) + '\n');
    return EXIT_USAGE_ERROR;
  }

  const results: LockfileEntryEvidence[] = [];
  // Doctrine: network errors never silently degrade. Any failed gate call
  // makes the final exit code EXIT_NETWORK_ERROR, even when other entries
  // returned a clean ALLOW/WARN/BLOCK. We still print the partial-success
  // table so the reviewer sees what we DID learn from the gate, but the
  // exit code reflects honestly that the scan was incomplete.
  const failures: LockfileFailure[] = [];
  for (const { name, version } of entries) {
    const pkg = `${name}@${version}`;
    const res = await callGate(args.apiBase, pkg, args.timeoutMs);
    if (!res.ok) {
      failures.push({ package: pkg, message: res.message });
      continue;
    }
    const action = (res.data.action ?? 'NOT_EVALUATED') as GateAction;
    results.push({
      package: pkg,
      action,
      firedPatternCount: res.data.firedPatterns?.length ?? 0,
      proofAnchor: {
        proofType: 'live-surface',
        label: `/proof/gate?package=${encodeURIComponent(pkg)}`,
        href: `/proof/gate?package=${encodeURIComponent(pkg)}`,
      },
    });
  }

  const summary = { allow: 0, warn: 0, block: 0, notEvaluated: 0 };
  for (const r of results) {
    if (r.action === 'ALLOW') summary.allow += 1;
    else if (r.action === 'WARN') summary.warn += 1;
    else if (r.action === 'BLOCK') summary.block += 1;
    else summary.notEvaluated += 1;
  }
  const worst = worstAction(results.map((r) => r.action));

  const output = formatLockfile(
    {
      command: 'lockfile',
      query: { lockfilePath: rel },
      parserUsed: format,
      entries: results,
      failures,
      summary,
      worstAction: worst,
      fetchedAt: new Date().toISOString(),
      apiBase: args.apiBase,
    },
    args,
  );
  if (output) process.stdout.write(output);

  // Workspace mode (PR-V2-D): if --workspace was set, fetch the workspace's
  // active exceptions ONCE through the workspace-context wrapper and
  // surface any that match the lockfile's packages. The public gate
  // response per entry is unchanged — workspace overlay is informational
  // annotation, not a server-side gate change. Per PR-V1-E §7.1 the v0
  // lockfile command goes through the wrapper, never imports vault-api
  // directly.
  if (args.workspace) {
    const wsRes = await fetchActiveWorkspaceExceptions({
      apiBase: args.apiBase,
      workspace: args.workspace,
      timeoutMs: args.timeoutMs,
    });
    if (!wsRes.ok) {
      process.stderr.write(wsRes.message + '\n');
      return wsRes.exitCode;
    }
    const bySubject = new Map<string, VaultException[]>();
    for (const ex of wsRes.exceptions) {
      const bucket = bySubject.get(ex.subject_name);
      if (bucket) bucket.push(ex);
      else bySubject.set(ex.subject_name, [ex]);
    }
    const lockfilePackages = new Set(results.map((r) => r.package));
    const applied: VaultException[] = [];
    for (const [subject, list] of bySubject.entries()) {
      if (lockfilePackages.has(subject)) applied.push(...list);
    }
    if (!args.json) {
      if (applied.length === 0) {
        process.stdout.write(
          `\n[PRIVATE] Workspace ${args.workspace}: no active exceptions match this lockfile's entries.\n`,
        );
      } else {
        process.stdout.write(
          `\n[PRIVATE] Workspace ${args.workspace} — ${applied.length} active exception(s) match this lockfile\n`,
        );
        for (const ex of applied) {
          const expires = ex.expires_at ? ex.expires_at.slice(0, 10) : '—';
          process.stdout.write(
            `  ${ex.original_action}->${ex.allowed_action.padEnd(5)}  ${ex.subject_name.padEnd(40)}  expires ${expires}  id ${ex.exception_id}\n`,
          );
        }
      }
    }
  }

  // Honest exit-code precedence: network failure beats every action.
  if (failures.length > 0) {
    return EXIT_NETWORK_ERROR;
  }
  if (worst === 'NOT_EVALUATED' && summary.notEvaluated === results.length && results.length > 0) {
    return EXIT_NOT_EVALUATED;
  }
  return exitCodeForAction(worst);
}
