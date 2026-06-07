# opensoyce

The `opensoyce` CLI reads the OpenSoyce trust record from the terminal.

It is the developer-facing read surface of the trust spine. The same evidence the website renders, in a different shell.

## Install

```bash
# One-off
npx opensoyce check ua-parser-js@0.7.29

# Global
npm i -g opensoyce
opensoyce check ua-parser-js@0.7.29
```

## What it does

| Command | What it reads |
|---|---|
| `opensoyce check <pkg>` | Current gate decision for one package |
| `opensoyce lockfile [path]` | Per-entry gate decision for an npm lockfile (v0 supports `package-lock.json`) |
| `opensoyce trust <owner>/<repo>` | Per-repo trust posture from the deployed Dashboard |
| `opensoyce timeline [--package <p>] [--pr <n>]` | Recorded trust-decision events |
| `opensoyce why <pkg>` | Current decision plus the timeline events that produced it |

## What it does not do

- It does not run a parallel gate. Every decision comes from the public API.
- It does not write to your filesystem.
- It does not open PRs.
- It does not modify lockfiles.
- It does not authenticate. Public reads only.

## Flags

| Flag | Purpose | Default |
|---|---|---|
| `--json` | Machine-consumable JSON output | off |
| `--no-color` | Disable ANSI color in default output | off (auto-detect TTY) |
| `--api-base <url>` | Override the public API base URL | `https://opensoyce.com` |
| `--timeout <ms>` | Network timeout for the gate call | `10000` |
| `--quiet` / `-q` | Suppress non-error stdout in default mode | off |
| `--help` / `-h` | Show help | off |
| `--version` | Print the CLI version | off |

## Exit codes

| Code | Meaning |
|---|---|
| 0 | All evaluated packages returned ALLOW (or read-only command succeeded) |
| 1 | At least one package returned BLOCK |
| 2 | At least one package returned WARN, no BLOCKs |
| 3 | A queried repo or package has no recorded posture (`NOT_EVALUATED`) |
| 4 | Network error or remote failure |
| 5 | Usage error (unknown command, missing arg, bad flag) |

## Doctrine

The CLI reads the trust record at https://opensoyce.com/opensource-trust.

The CLI does not become the trust record.
