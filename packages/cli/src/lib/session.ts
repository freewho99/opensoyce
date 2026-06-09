// OpenSoyce CLI — Vault session storage.
//
// PR-V2-D. Per PR-V1-E §2.3.
//
// File path: ~/.opensoyce/session.json (NOT XDG; matches `gh`, `npm`, etc.)
// Mode: 0600 — owner read/write only. chmod is called immediately after
// writeFileSync so an interrupted process never leaves a world-readable
// session file on disk.
//
// Shape:
//   {
//     "session_token": "<opaque-id>",
//     "github_login":  "<login>",
//     "issued_at":     "<iso>",
//     "expires_at":    "<iso>",
//     "api_base":      "<url>"
//   }
//
// IMPORTANT INVARIANTS (PR-V1-E §2.3 + §8.5-6):
//   - The session_token NEVER appears in stdout, stderr, or telemetry.
//     Only this module reads the file; the vault-api client passes the
//     token straight into the Cookie header.
//   - Logout is locally idempotent: clearSession() removes the file even
//     if the server-side delete failed; CLI v0 doctrine says network
//     errors never leave the user in an undefined state.
//   - The default CLI v0 path (no login, no --workspace) NEVER reads this
//     file. Only commands that opt into workspace mode call loadSession().

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface VaultSession {
  session_token: string;
  github_login: string;
  issued_at: string;
  expires_at: string;
  api_base: string;
}

export function sessionDir(): string {
  return path.join(os.homedir(), '.opensoyce');
}

export function sessionFilePath(): string {
  return path.join(sessionDir(), 'session.json');
}

/**
 * Read the session file. Returns null if the file does not exist or is
 * malformed. The caller MUST treat null as "not logged in" — never as an
 * error to surface. The default CLI v0 path never invokes this function.
 */
export function loadSession(): VaultSession | null {
  let raw: string;
  try {
    raw = fs.readFileSync(sessionFilePath(), 'utf8');
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  if (
    typeof obj.session_token !== 'string'
    || typeof obj.github_login !== 'string'
    || typeof obj.issued_at !== 'string'
    || typeof obj.expires_at !== 'string'
    || typeof obj.api_base !== 'string'
  ) return null;
  return {
    session_token: obj.session_token,
    github_login: obj.github_login,
    issued_at: obj.issued_at,
    expires_at: obj.expires_at,
    api_base: obj.api_base,
  };
}

/**
 * Write the session file with mode 0600. The chmod call is the second
 * statement so a crash between writeFileSync and chmod leaves a file
 * that the structural test would catch (no test runs after a crash, of
 * course — the invariant is that EVERY successful login leaves a 0600
 * file).
 *
 * The directory is created on demand.
 */
export function saveSession(session: VaultSession): void {
  const dir = sessionDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  const file = sessionFilePath();
  const json = JSON.stringify(session, null, 2);
  fs.writeFileSync(file, json, { encoding: 'utf8', mode: 0o600 });
  // Defense in depth — set mode again explicitly. writeFileSync's mode
  // option is the creation mode; existing-file overwrites respect the
  // current mode of the file. Calling chmod guarantees the final mode.
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // chmod is a no-op on Windows. The invariant is best-effort there.
  }
}

/**
 * Delete the session file. Idempotent: no error if the file is already
 * missing.
 */
export function clearSession(): void {
  const file = sessionFilePath();
  if (fs.existsSync(file)) {
    fs.rmSync(file, { force: true });
  }
}

/**
 * True when a session file exists. Used by commands gated on a session
 * to short-circuit before any network call when the user is obviously
 * not logged in.
 */
export function hasSession(): boolean {
  return loadSession() !== null;
}
