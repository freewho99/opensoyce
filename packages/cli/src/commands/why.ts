import { callGate } from '../api.js';
import {
  EXIT_NOT_EVALUATED,
  EXIT_USAGE_ERROR,
  exitCodeForAction,
  type GateAction,
} from '../exit-codes.js';
import { STRINGS } from '../strings.js';
import type { ParsedArgs } from '../args.js';
import { formatCheck, type TimelineEvent } from '../output.js';
import { STATIC_TIMELINE } from '../lib/static-data.js';

const PACKAGE_SPEC_RE = /^@?[a-z0-9][\w./-]*@[\w.+-]+$/i;

export async function runWhy(args: ParsedArgs): Promise<number> {
  const pkg = args.positional[0];
  if (!pkg) {
    process.stderr.write(STRINGS.errors.missingArg('why', '<pkg>') + '\n');
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
  const baseName = pkg.split('@').slice(0, pkg.startsWith('@') ? 2 : 1).join('@');
  const events: TimelineEvent[] = STATIC_TIMELINE.filter(
    (e) => e.package && baseName.includes(e.package),
  ).map((e) => ({ ...e }));

  const output = formatCheck({
    command: 'why',
    query: { package: pkg },
    action,
    firedPatterns: result.data.firedPatterns ?? [],
    proofAnchors: [
      {
        proofType: 'live-surface',
        label: `/proof/gate?package=${encodeURIComponent(pkg)}`,
        href: `/proof/gate?package=${encodeURIComponent(pkg)}`,
      },
    ],
    fetchedAt: new Date().toISOString(),
    apiBase: args.apiBase,
    timelineContext: events,
  }, args);

  if (output) process.stdout.write(output);
  if (action === 'NOT_EVALUATED') return EXIT_NOT_EVALUATED;
  return exitCodeForAction(action);
}
