#!/usr/bin/env node
// opensoyce CLI entry point.
//
// Surface lifted by PR-V2-D from the CLI v0 baseline:
//   - 5 commands -> 7 commands  (added login, logout, and exception
//     with three sub-commands list/propose/revoke per PR-V1-E §4)
//   - 7 flags -> 8 flags         (added --workspace per PR-V1-E §3)
//
// Rule 7 from PR-V1-E §0: the v0 surface stays whole as cli v0 mode. A
// user who never logs in and never passes --workspace sees byte-for-byte
// the same behavior as CLI v0 — no session-file read, no /api/vault/*
// call, no output drift.

import { parseArgs, WORKSPACE_FORBIDDEN_COMMANDS } from './args.js';
import { EXIT_ALLOW, EXIT_USAGE_ERROR } from './exit-codes.js';
import { STRINGS } from './strings.js';
import { TOP_LEVEL_HELP, COMMAND_HELP } from './help.js';
import { runCheck } from './commands/check.js';
import { runLockfile } from './commands/lockfile.js';
import { runTrust } from './commands/trust.js';
import { runTimeline } from './commands/timeline.js';
import { runWhy } from './commands/why.js';
import { runLogin } from './commands/login.js';
import { runLogout } from './commands/logout.js';
import { runExceptionList } from './commands/exception/list.js';
import { runExceptionPropose } from './commands/exception/propose.js';
import { runExceptionRevoke } from './commands/exception/revoke.js';
// PR-7A: exposure ingestion. Creates exposure RECORDS only — no exception
// verbs, no policy, no lifecycle. Ingestion observes; it does not decide.
import { runExposureIngestDependencies } from './commands/exposure/ingest-dependencies.js';

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

  // Reject --workspace on commands that don't accept it (per PR-V1-E §3.1).
  if (args.workspace && WORKSPACE_FORBIDDEN_COMMANDS.has(args.command)) {
    process.stderr.write(`Usage error: --workspace is not valid on \`${args.command}\`.\n`);
    return EXIT_USAGE_ERROR;
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
    case 'login':
      return runLogin(args);
    case 'logout':
      return runLogout(args);
    case 'exception':
      if (args.subcommand === 'list') return runExceptionList(args);
      if (args.subcommand === 'propose') return runExceptionPropose(args);
      if (args.subcommand === 'revoke') return runExceptionRevoke(args);
      if (!args.subcommand) {
        process.stderr.write('Usage error: `exception` requires a subcommand: list | propose | revoke.\n');
        return EXIT_USAGE_ERROR;
      }
      process.stderr.write(`Unknown exception subcommand: ${args.subcommand}. Allowed: list | propose | revoke.\n`);
      return EXIT_USAGE_ERROR;
    case 'exposure':
      if (args.subcommand === 'ingest-dependencies') return runExposureIngestDependencies(args);
      if (!args.subcommand) {
        process.stderr.write('Usage error: `exposure` requires a subcommand: ingest-dependencies.\n');
        return EXIT_USAGE_ERROR;
      }
      process.stderr.write(`Unknown exposure subcommand: ${args.subcommand}. Allowed: ingest-dependencies.\n`);
      return EXIT_USAGE_ERROR;
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
