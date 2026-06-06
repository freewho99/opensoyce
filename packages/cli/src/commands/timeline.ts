import { EXIT_ALLOW } from '../exit-codes.js';
import type { ParsedArgs } from '../args.js';
import { formatTimeline, type TimelineEvent } from '../output.js';
import { STATIC_TIMELINE } from '../lib/static-data.js';

export async function runTimeline(args: ParsedArgs): Promise<number> {
  const events: TimelineEvent[] = STATIC_TIMELINE.filter((e) => {
    if (args.packageFilter && e.package !== args.packageFilter) return false;
    if (args.prFilter && e.pr !== args.prFilter) return false;
    return true;
  }).map((e) => ({ ...e }));

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
