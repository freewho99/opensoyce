import {
  EXIT_ALLOW,
  EXIT_NOT_EVALUATED,
  EXIT_USAGE_ERROR,
  type GateAction,
} from '../exit-codes.js';
import { STRINGS } from '../strings.js';
import type { ParsedArgs } from '../args.js';
import { formatTrust } from '../output.js';
// Read static trust record from the CLI's inlined copy of the shared MVP
// data. The CLI never invents posture; a structural test ensures the
// inlined copy matches the canonical web app shared module verbatim.
import { STATIC_POSTURES } from '../lib/static-data.js';

const REPO_SPEC_RE = /^[A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*$/;

export async function runTrust(args: ParsedArgs): Promise<number> {
  const spec = args.positional[0];
  if (!spec) {
    process.stderr.write(STRINGS.errors.missingArg('trust', '<owner>/<repo>') + '\n');
    return EXIT_USAGE_ERROR;
  }
  if (!REPO_SPEC_RE.test(spec)) {
    process.stderr.write(STRINGS.errors.invalidRepo(spec) + '\n');
    return EXIT_USAGE_ERROR;
  }
  const [owner, repo] = spec.split('/');

  const match = STATIC_POSTURES.find(
    (p) => p.owner.toLowerCase() === owner.toLowerCase() && p.repo.toLowerCase() === repo.toLowerCase(),
  );

  if (!match) {
    const action: GateAction = 'NOT_EVALUATED';
    const output = formatTrust(
      {
        command: 'trust',
        query: { owner, repo },
        postureLabel: null,
        action,
        proofAnchors: [],
        fetchedAt: new Date().toISOString(),
        apiBase: args.apiBase,
      },
      args,
    );
    if (output) process.stdout.write(output);
    return EXIT_NOT_EVALUATED;
  }

  const anchors = (match.references ?? []).slice(0, 3).map((r) => ({
    proofType: 'live-surface' as const,
    label: r.label,
    href: r.href,
  }));
  anchors.push({
    proofType: 'live-surface' as const,
    label: `/projects/${match.owner}/${match.repo}/trust`,
    href: `/projects/${match.owner}/${match.repo}/trust`,
  });

  const output = formatTrust(
    {
      command: 'trust',
      query: { owner: match.owner, repo: match.repo },
      postureLabel: match.postureLabel,
      postureSummary: match.postureSummary,
      action: 'ALLOW',
      proofAnchors: anchors,
      fetchedAt: new Date().toISOString(),
      apiBase: args.apiBase,
    },
    args,
  );
  if (output) process.stdout.write(output);
  return EXIT_ALLOW;
}
