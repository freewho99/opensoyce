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
  login                        Sign in to a Vault workspace via device code
  logout                       Clear the local Vault session
  exception <subcommand>       Vault workspace exceptions (list | propose | revoke)

GLOBAL OPTIONS:
  --json                       Machine-consumable JSON output
  --no-color                   Disable ANSI color in default output
  --api-base <url>             Override the public API base URL
  --timeout <ms>               Network timeout (default 10000)
  --quiet, -q                  Suppress non-error stdout in default mode
  --help, -h                   Show help
  --version                    Print the CLI version
  --workspace <id>             Run a command inside a Vault workspace

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

  login: `opensoyce login

Sign in to a Vault workspace via the device-code flow. Opens a one-shot
verification URL; you confirm in a browser. The CLI writes a session
file at ~/.opensoyce/session.json (mode 0600) on success.

EXAMPLES:
  opensoyce login
  opensoyce login --json

${FOOTER}
`,

  logout: `opensoyce logout

Clear the local Vault session. Locally idempotent: the session file is
deleted even if the server-side logout call fails.

EXAMPLES:
  opensoyce logout

${FOOTER}
`,

  exception: `opensoyce exception <list | propose | revoke> --workspace <id>

Read or write workspace exceptions. Requires a Vault session and the
--workspace flag.

  list      List exceptions in the workspace (optional --state, --subject, --limit)
  propose   Propose a new exception (downgrade only: BLOCK->WARN|ALLOW, WARN->ALLOW)
  revoke    Revoke an active exception (safety operation; tightens the gate)

The four-eye gates (approve / reject / extend) remain UI-only in v0.

EXAMPLES:
  opensoyce exception list --workspace acme --state active
  opensoyce exception propose --workspace acme --subject ua-parser-js@0.7.29 --from BLOCK --to WARN --reason "Patched fork pinned for 30 days"
  opensoyce exception revoke b4d6a47d-1e9c-4ce4-9c63-79c6c4f1c0a3 --reason "Patched upstream" --workspace acme

${FOOTER}
`,
};
