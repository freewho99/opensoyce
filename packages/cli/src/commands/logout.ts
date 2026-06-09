// `opensoyce logout` — locally idempotent per PR-V1-E §2.2.
//
// 1. Read the local session file. If absent → already-logged-out path.
// 2. POST /api/vault/auth/logout with the session token to clear the
//    server-side vault_sessions row.
// 3. Delete the local session file. The deletion happens EVEN IF the
//    server call failed — network errors must never leave the user in an
//    undefined state. The server-side row's expires_at sliding window
//    will reap it eventually.
// 4. Print "Logged out" (or { logged_out: true } when --json).
//
// Exit codes (per PR-V1-E §2.2):
//   0 = logged out (or already not logged in)
//   4 = network error reaching the server (file IS still deleted)
//   5 = usage error (e.g. --workspace passed)

import type { ParsedArgs } from '../args.js';
import { EXIT_ALLOW, EXIT_NETWORK_ERROR, EXIT_USAGE_ERROR } from '../exit-codes.js';
import { loadSession, clearSession } from '../lib/session.js';
import { callLogout } from '../lib/vault-api.js';

export async function runLogout(args: ParsedArgs): Promise<number> {
  if (args.workspace) {
    process.stderr.write('Usage error: --workspace is not valid on `logout`.\n');
    return EXIT_USAGE_ERROR;
  }

  const session = loadSession();
  if (!session) {
    if (args.json) {
      process.stdout.write(`${JSON.stringify({ logged_out: true, already: true })}\n`);
    } else if (!args.quiet) {
      process.stdout.write('Already logged out.\n');
    }
    return EXIT_ALLOW;
  }

  let networkFailed = false;
  let networkMessage = '';
  const apiBase = session.api_base || args.apiBase;
  const logoutRes = await callLogout(apiBase, session.session_token, args.timeoutMs);
  if (!logoutRes.ok) {
    networkFailed = true;
    networkMessage = logoutRes.message;
  }

  // ALWAYS clear the local file. Logout doctrine: locally idempotent.
  clearSession();

  if (networkFailed) {
    process.stderr.write(`Local session cleared. Server logout failed: ${networkMessage}\n`);
    return EXIT_NETWORK_ERROR;
  }
  if (args.json) {
    process.stdout.write(`${JSON.stringify({ logged_out: true })}\n`);
  } else if (!args.quiet) {
    process.stdout.write('Logged out.\n');
  }
  return EXIT_ALLOW;
}
