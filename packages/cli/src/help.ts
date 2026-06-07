// Help text. Subject to the same hygiene constraints as strings.ts.
// Every block ends with a footer pointing at the trust record.
// The URL is inlined (not interpolated from a constant) so the structural
// hygiene test that reads this source file directly sees the
// /opensource-trust marker and can window banned vocabulary around it.

const FOOTER = `Reads the trust record at https://opensoyce.com/opensource-trust`;

export const TOP_LEVEL_HELP = `opensoyce — reads the OpenSoyce trust record.

USAGE:
  opensoyce <command> [options]

COMMANDS:
  check <pkg>                  Current gate decision for one package
  lockfile [path]              Per-entry gate decision for an npm lockfile
  trust <owner>/<repo>         Per-repo trust posture
  timeline [--package <p>]     Recorded trust-decision events
  why <pkg>                    Current decision plus timeline events

GLOBAL OPTIONS:
  --json                       Machine-consumable JSON output
  --no-color                   Disable ANSI color in default output
  --api-base <url>             Override the public API base URL
  --timeout <ms>               Network timeout (default 10000)
  --quiet, -q                  Suppress non-error stdout in default mode
  --help, -h                   Show help
  --version                    Print the CLI version

EXIT CODES:
  0  ALLOW (or read-only command succeeded)
  1  BLOCK
  2  WARN
  3  NOT EVALUATED
  4  Network or remote failure
  5  Usage error

${FOOTER}
`;

export const COMMAND_HELP: Record<string, string> = {
  check: `opensoyce check <pkg>

Read the current gate decision for a single package.

EXAMPLES:
  opensoyce check ua-parser-js@0.7.29
  opensoyce check left-pad@1.3.0 --json

${FOOTER}
`,

  lockfile: `opensoyce lockfile [path]

Read the current gate decision for every entry in an npm lockfile.
Defaults to ./package-lock.json. CLI v0 supports package-lock.json only;
other formats return a usage error.

EXAMPLES:
  opensoyce lockfile
  opensoyce lockfile ./some-repo/package-lock.json --json

${FOOTER}
`,

  trust: `opensoyce trust <owner>/<repo>

Read the per-repo trust posture for the named repository.

EXAMPLES:
  opensoyce trust freewho99/opensoyce
  opensoyce trust freewho99/opensoyce --json

${FOOTER}
`,

  timeline: `opensoyce timeline [--package <p>] [--pr <n>]

Read recorded trust-decision events. Filter by package or by PR number.

EXAMPLES:
  opensoyce timeline
  opensoyce timeline --package ua-parser-js
  opensoyce timeline --pr 28

${FOOTER}
`,

  why: `opensoyce why <pkg>

Read the current decision plus the timeline events that produced it.

EXAMPLES:
  opensoyce why ua-parser-js@0.7.29

${FOOTER}
`,
};
