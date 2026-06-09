// `opensoyce timeline [--package <p>] [--pr <n>] [--workspace <id>]`
//
// PR-V2-D extends the v0 timeline with optional --workspace mode per
// PR-V1-E §5. Without --workspace the command is byte-for-byte identical
// to v0 — no network call to /api/vault/*, no session-file read, no
// behavior change at all (Rule 7 of the V1-E sub-sketch).
//
// With --workspace + a valid session, the command additionally fetches
// /api/vault/workspaces/<id>/timeline and interleaves the Vault events
// with the public Timeline events, rendering Vault events with a
// [PRIVATE] marker prefix.

import { EXIT_ALLOW } from '../exit-codes.js';
import type { ParsedArgs } from '../args.js';
import { formatTimeline, type TimelineEvent } from '../output.js';
import { STATIC_TIMELINE } from '../lib/static-data.js';
import { fetchVaultTimelineEvents } from '../lib/workspace-context.js';

export async function runTimeline(args: ParsedArgs): Promise<number> {
  const events: TimelineEvent[] = STATIC_TIMELINE.filter((e) => {
    if (args.packageFilter && e.package !== args.packageFilter) return false;
    if (args.prFilter && e.pr !== args.prFilter) return false;
    return true;
  }).map((e) => ({ ...e }));

  // CLI v0 mode: no --workspace, no session-file read, no Vault call.
  // Byte-for-byte v0 compatibility per PR-V1-E Rule 7.
  if (!args.workspace) {
    const output = formatTimeline(
      {
        command: 'timeline',
        query: {
          packageFilter: args.packageFilter,
          prFilter: args.prFilter,
        },
        events,
        fetchedAt: new Date().toISOString(),
      },
      args,
    );
    if (output) process.stdout.write(output);
    return EXIT_ALLOW;
  }

  // Workspace mode: delegate session + fetch to the workspace-context
  // wrapper (PR-V1-E §7.1 — v0 commands import vault paths only through
  // a shared module). The wrapper also applies the package-name client
  // filter against event summary since the Vault Timeline API has no
  // free-text filter (PR-V1-D §3.2 documents this gap).
  const vaultRes = await fetchVaultTimelineEvents({
    apiBase: args.apiBase,
    workspace: args.workspace,
    packageFilter: args.packageFilter,
    timeoutMs: args.timeoutMs,
  });
  if (!vaultRes.ok) {
    process.stderr.write(`${vaultRes.message}\n`);
    return vaultRes.exitCode;
  }
  const vaultEvents = vaultRes.events;

  if (args.json) {
    // JSON shape mixes both: public events lack `visibility`, Vault events
    // carry visibility: "private". Both are tagged with `source` so the
    // consumer can distinguish.
    const mixed = [
      ...events.map((e) => ({ source: 'public', ...e })),
      ...vaultEvents.map((e) => ({
        source: 'vault',
        type: e.event_type,
        date: e.emitted_at,
        summary: e.summary,
        event_id: e.event_id,
        visibility: e.visibility,
        emitted_by: e.emitted_by,
        references: e.references,
      })),
    ].sort((a, b) => (a.date < b.date ? 1 : -1));
    process.stdout.write(`${JSON.stringify({
      command: 'timeline',
      workspace: args.workspace,
      query: { packageFilter: args.packageFilter, prFilter: args.prFilter },
      events: mixed,
      fetchedAt: new Date().toISOString(),
    }, null, 2)}\n`);
    return EXIT_ALLOW;
  }

  // Default output: render the v0 timeline first, then a [PRIVATE] block
  // of Vault Timeline events. Per PR-V1-E §5.2 the Vault events render
  // with the [PRIVATE] marker as the line prefix.
  const publicOutput = formatTimeline(
    {
      command: 'timeline',
      query: { packageFilter: args.packageFilter, prFilter: args.prFilter },
      events,
      fetchedAt: new Date().toISOString(),
    },
    args,
  );
  if (publicOutput) process.stdout.write(publicOutput);

  if (vaultEvents.length === 0) {
    process.stdout.write(`\n[PRIVATE] No Vault Timeline events in workspace ${args.workspace}.\n`);
    return EXIT_ALLOW;
  }
  process.stdout.write(`\n[PRIVATE] Workspace ${args.workspace} Timeline — ${vaultEvents.length} event(s)\n`);
  for (const ev of vaultEvents) {
    const date = ev.emitted_at.slice(0, 10);
    const actor = ev.emitted_by && ev.emitted_by.github_login
      ? `@${ev.emitted_by.github_login}`
      : '—';
    process.stdout.write(`  ${date}  ${ev.event_type.padEnd(28)}  ${actor.padEnd(20)}  ${ev.summary}\n`);
  }
  return EXIT_ALLOW;
}
