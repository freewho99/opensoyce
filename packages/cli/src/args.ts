// Minimal arg parser. Flag set locked at 8 by the PR-V2-D atomic lift
// (was 7 under the v0 sub-sketch). Workspace is the only new flag; the
// other 7 are preserved unchanged.
//
// PR-V2-D adds:
//   - --workspace <id> on check / lockfile / why / timeline / exception
//     subcommands. Rejected (USAGE_ERROR) on trust / login / logout /
//     version / help per PR-V1-E §3.1.
//   - "exception" command with subcommands list / propose / revoke.
//   - "login" and "logout" as top-level commands.

export interface ParsedArgs {
  command: string | null;
  // Subcommand: 'list' | 'propose' | 'revoke' when command === 'exception';
  // 'ingest-dependencies' when command === 'exposure' (PR-7A).
  subcommand?: string;
  positional: string[];
  json: boolean;
  noColor: boolean;
  apiBase: string;
  timeoutMs: number;
  quiet: boolean;
  help: boolean;
  version: boolean;
  workspace?: string;
  packageFilter?: string;
  prFilter?: number;
  // Exception command flag bag:
  exceptionState?: string;
  exceptionSubject?: string;
  exceptionLimit?: number;
  exceptionFrom?: string;
  exceptionTo?: string;
  exceptionReason?: string;
  exceptionExpiresAt?: string;
  // Exposure-ingestion flag bag (PR-7A):
  file?: string;
  dryRun: boolean;
  // CI attribution flag bag (PR-7B). --ci switches source_kind to 'ci';
  // the rest attribute WHERE the observation ran. Attribution only — the
  // record is still just an exposure record.
  ci: boolean;
  ciProvider?: string;
  ciRunId?: string;
  ciJob?: string;
  ciSha?: string;
  ciRef?: string;
  ciRepository?: string;
  unknownFlag?: string;
  unknownFlagValue?: string;
}

export const DEFAULT_API_BASE = 'https://opensoyce.com';
export const DEFAULT_TIMEOUT_MS = 10_000;

const KNOWN_GLOBAL_FLAGS = new Set([
  '--json',
  '--no-color',
  '--api-base',
  '--timeout',
  '--quiet',
  '-q',
  '--help',
  '-h',
  '--version',
  '--workspace',
]);

const TIMELINE_FILTER_FLAGS = new Set(['--package', '--pr']);
const EXCEPTION_FILTER_FLAGS = new Set([
  '--state',
  '--subject',
  '--limit',
  '--from',
  '--to',
  '--reason',
  '--expires-at',
]);
// PR-7A exposure-ingestion flags + PR-7B CI attribution flags. Validated
// on dispatch.
const EXPOSURE_INGEST_FLAGS = new Set([
  '--file',
  '--dry-run',
  '--ci',
  '--ci-provider',
  '--run-id',
  '--job',
  '--sha',
  '--ref',
  '--repository',
]);

// Commands that REJECT --workspace per PR-V1-E §3.1. Passing --workspace to
// these is a USAGE_ERROR.
export const WORKSPACE_FORBIDDEN_COMMANDS = new Set(['trust', 'login', 'logout']);

// Commands that REQUIRE --workspace whenever invoked (the exception
// subcommand group per PR-V1-E §4; the exposure ingestion group per PR-7A).
export const WORKSPACE_REQUIRED_COMMANDS = new Set(['exception', 'exposure']);

export function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {
    command: null,
    positional: [],
    json: false,
    noColor: false,
    apiBase: DEFAULT_API_BASE,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    quiet: false,
    help: false,
    version: false,
    dryRun: false,
    ci: false,
  };

  let i = 0;
  while (i < argv.length) {
    const tok = argv[i];

    if (tok === '--json') {
      result.json = true;
      i += 1;
      continue;
    }
    if (tok === '--no-color') {
      result.noColor = true;
      i += 1;
      continue;
    }
    if (tok === '--quiet' || tok === '-q') {
      result.quiet = true;
      i += 1;
      continue;
    }
    if (tok === '--help' || tok === '-h') {
      result.help = true;
      i += 1;
      continue;
    }
    if (tok === '--version') {
      result.version = true;
      i += 1;
      continue;
    }
    if (tok === '--api-base') {
      const v = argv[i + 1];
      if (!v) {
        result.unknownFlag = '--api-base';
        return result;
      }
      result.apiBase = v.replace(/\/+$/, '');
      i += 2;
      continue;
    }
    if (tok === '--timeout') {
      const v = argv[i + 1];
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) {
        result.unknownFlag = '--timeout';
        result.unknownFlagValue = v;
        return result;
      }
      result.timeoutMs = n;
      i += 2;
      continue;
    }
    if (tok === '--workspace') {
      const v = argv[i + 1];
      if (!v) {
        result.unknownFlag = '--workspace';
        return result;
      }
      result.workspace = v;
      i += 2;
      continue;
    }
    if (tok === '--package') {
      const v = argv[i + 1];
      if (!v) {
        result.unknownFlag = '--package';
        return result;
      }
      result.packageFilter = v;
      i += 2;
      continue;
    }
    if (tok === '--pr') {
      const v = argv[i + 1];
      const n = Number(v);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
        result.unknownFlag = '--pr';
        result.unknownFlagValue = v;
        return result;
      }
      result.prFilter = n;
      i += 2;
      continue;
    }
    // Exception-command flags. Validated separately on dispatch.
    if (tok === '--state') {
      const v = argv[i + 1];
      if (!v) { result.unknownFlag = '--state'; return result; }
      result.exceptionState = v;
      i += 2; continue;
    }
    if (tok === '--subject') {
      const v = argv[i + 1];
      if (!v) { result.unknownFlag = '--subject'; return result; }
      result.exceptionSubject = v;
      i += 2; continue;
    }
    if (tok === '--limit') {
      const v = argv[i + 1];
      const n = Number(v);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
        result.unknownFlag = '--limit';
        result.unknownFlagValue = v;
        return result;
      }
      result.exceptionLimit = n;
      i += 2; continue;
    }
    if (tok === '--from') {
      const v = argv[i + 1];
      if (!v) { result.unknownFlag = '--from'; return result; }
      result.exceptionFrom = v;
      i += 2; continue;
    }
    if (tok === '--to') {
      const v = argv[i + 1];
      if (!v) { result.unknownFlag = '--to'; return result; }
      result.exceptionTo = v;
      i += 2; continue;
    }
    if (tok === '--reason') {
      const v = argv[i + 1];
      if (!v) { result.unknownFlag = '--reason'; return result; }
      result.exceptionReason = v;
      i += 2; continue;
    }
    if (tok === '--expires-at') {
      const v = argv[i + 1];
      if (!v) { result.unknownFlag = '--expires-at'; return result; }
      result.exceptionExpiresAt = v;
      i += 2; continue;
    }
    // Exposure-ingestion flags (PR-7A). Validated on dispatch.
    if (tok === '--file') {
      const v = argv[i + 1];
      if (!v) { result.unknownFlag = '--file'; return result; }
      result.file = v;
      i += 2; continue;
    }
    if (tok === '--dry-run') {
      result.dryRun = true;
      i += 1; continue;
    }
    // CI attribution flags (PR-7B). Validated on dispatch.
    if (tok === '--ci') {
      result.ci = true;
      i += 1; continue;
    }
    if (tok === '--ci-provider') {
      const v = argv[i + 1];
      if (!v) { result.unknownFlag = '--ci-provider'; return result; }
      result.ciProvider = v;
      i += 2; continue;
    }
    if (tok === '--run-id') {
      const v = argv[i + 1];
      if (!v) { result.unknownFlag = '--run-id'; return result; }
      result.ciRunId = v;
      i += 2; continue;
    }
    if (tok === '--job') {
      const v = argv[i + 1];
      if (!v) { result.unknownFlag = '--job'; return result; }
      result.ciJob = v;
      i += 2; continue;
    }
    if (tok === '--sha') {
      const v = argv[i + 1];
      if (!v) { result.unknownFlag = '--sha'; return result; }
      result.ciSha = v;
      i += 2; continue;
    }
    if (tok === '--ref') {
      const v = argv[i + 1];
      if (!v) { result.unknownFlag = '--ref'; return result; }
      result.ciRef = v;
      i += 2; continue;
    }
    if (tok === '--repository') {
      const v = argv[i + 1];
      if (!v) { result.unknownFlag = '--repository'; return result; }
      result.ciRepository = v;
      i += 2; continue;
    }

    if (tok.startsWith('-')) {
      if (!KNOWN_GLOBAL_FLAGS.has(tok)
        && !TIMELINE_FILTER_FLAGS.has(tok)
        && !EXCEPTION_FILTER_FLAGS.has(tok)
        && !EXPOSURE_INGEST_FLAGS.has(tok)) {
        result.unknownFlag = tok;
        return result;
      }
      i += 1;
      continue;
    }

    if (!result.command) {
      result.command = tok;
    } else if (result.command === 'exception' && !result.subcommand) {
      // exception list | propose | revoke
      result.subcommand = tok;
    } else if (result.command === 'exposure' && !result.subcommand) {
      // exposure ingest-dependencies (PR-7A)
      result.subcommand = tok;
    } else {
      result.positional.push(tok);
    }
    i += 1;
  }

  return result;
}
