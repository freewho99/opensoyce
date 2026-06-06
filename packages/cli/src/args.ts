// Minimal arg parser. Flag set locked at 7 by the sub-sketch §2.2.
// No third-party dependency; no extra flags accepted.

export interface ParsedArgs {
  command: string | null;
  positional: string[];
  json: boolean;
  noColor: boolean;
  apiBase: string;
  timeoutMs: number;
  quiet: boolean;
  help: boolean;
  version: boolean;
  packageFilter?: string;
  prFilter?: number;
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
]);

const TIMELINE_FILTER_FLAGS = new Set(['--package', '--pr']);

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

    if (tok.startsWith('-')) {
      if (!KNOWN_GLOBAL_FLAGS.has(tok) && !TIMELINE_FILTER_FLAGS.has(tok)) {
        result.unknownFlag = tok;
        return result;
      }
      i += 1;
      continue;
    }

    if (!result.command) {
      result.command = tok;
    } else {
      result.positional.push(tok);
    }
    i += 1;
  }

  return result;
}
