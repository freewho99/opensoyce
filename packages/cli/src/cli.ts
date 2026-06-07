#!/usr/bin/env node
// opensoyce CLI v0 entry point.
// Reads the OpenSoyce trust record from the terminal.
// Locked at 5 commands and 7 global flags per the v0 sub-sketch.

import { parseArgs } from './args.js';
import { EXIT_ALLOW, EXIT_USAGE_ERROR } from './exit-codes.js';
import { STRINGS } from './strings.js';
import { TOP_LEVEL_HELP, COMMAND_HELP } from './help.js';
import { runCheck } from './commands/check.js';
import { runLockfile } from './commands/lockfile.js';
import { runTrust } from './commands/trust.js';
import { runTimeline } from './commands/timeline.js';
import { runWhy } from './commands/why.js';

const CLI_VERSION = '0.0.0';

async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);

  if (args.unknownFlag) {
    process.stderr.write(STRINGS.errors.badFlag(args.unknownFlag) + '\n');
    return EXIT_USAGE_ERROR;
  }

  if (args.version) {
    process.stdout.write(`opensoyce ${CLI_VERSION}\n`);
    return EXIT_ALLOW;
  }

  if (args.help && !args.command) {
    process.stdout.write(TOP_LEVEL_HELP);
    return EXIT_ALLOW;
  }

  if (args.command && args.help) {
    const text = COMMAND_HELP[args.command];
    if (text) {
      process.stdout.write(text);
      return EXIT_ALLOW;
    }
    process.stderr.write(STRINGS.errors.unknownCommand(args.command) + '\n');
    return EXIT_USAGE_ERROR;
  }

  if (!args.command) {
    process.stdout.write(TOP_LEVEL_HELP);
    return EXIT_ALLOW;
  }

  switch (args.command) {
    case 'check':
      return runCheck(args);
    case 'lockfile':
      return runLockfile(args);
    case 'trust':
      return runTrust(args);
    case 'timeline':
      return runTimeline(args);
    case 'why':
      return runWhy(args);
    default:
      process.stderr.write(STRINGS.errors.unknownCommand(args.command) + '\n');
      return EXIT_USAGE_ERROR;
  }
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`Internal error: ${err?.message ?? String(err)}\n`);
    process.exit(EXIT_USAGE_ERROR);
  });
