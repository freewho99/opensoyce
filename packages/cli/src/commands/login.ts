// `opensoyce login` — Vault device-code flow per PR-V1-E §2.1.
//
// 1. POST /api/vault/cli/device-code → { device_code, user_code, verification_uri, interval }
// 2. Print user_code + verification_uri so the user can confirm in a browser.
// 3. Poll /api/vault/cli/device-token at `interval` until:
//    - 200 + token → write ~/.opensoyce/session.json (mode 0600), success
//    - 400 device-code-expired → exit 3 (NOT_EVALUATED — pairing didn't complete)
//    - 400 device-code-invalid → exit 4 (network/state error)
//
// Exit codes (per PR-V1-E §2.1):
//   0 = logged in
//   3 = pairing not completed before TTL (NOT_EVALUATED)
//   4 = network / API error
//   5 = usage error

import type { ParsedArgs } from '../args.js';
import { EXIT_ALLOW, EXIT_NOT_EVALUATED, EXIT_NETWORK_ERROR, EXIT_USAGE_ERROR } from '../exit-codes.js';
import { requestDeviceCode, pollDeviceToken } from '../lib/vault-api.js';
import { saveSession } from '../lib/session.js';

export async function runLogin(args: ParsedArgs): Promise<number> {
  if (args.workspace) {
    process.stderr.write('Usage error: --workspace is not valid on `login`.\n');
    return EXIT_USAGE_ERROR;
  }

  const initRes = await requestDeviceCode(args.apiBase, args.timeoutMs);
  if (!initRes.ok) {
    process.stderr.write(`${initRes.message}\n`);
    return initRes.exitCode;
  }
  const { device_code, user_code, verification_uri, interval, expires_in } = initRes.data;

  if (!args.quiet) {
    process.stdout.write(
      `Open ${verification_uri} in a browser and enter this code:\n\n    ${user_code}\n\nWaiting up to ${Math.round(expires_in / 60)} minutes for pairing...\n`,
    );
  }

  const startedMs = Date.now();
  const deadlineMs = startedMs + expires_in * 1000;
  const intervalMs = Math.max(1, interval) * 1000;

  // Long-poll the token endpoint. Each call respects args.timeoutMs.
  while (Date.now() < deadlineMs) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const pollRes = await pollDeviceToken(args.apiBase, device_code, args.timeoutMs);
    if (pollRes.ok) {
      const { session_token, expires_at, user } = pollRes.data;
      const githubLogin = (user && user.github_login) || '<unknown>';
      saveSession({
        session_token,
        github_login: githubLogin,
        issued_at: new Date().toISOString(),
        expires_at,
        api_base: args.apiBase,
      });
      if (args.json) {
        process.stdout.write(
          `${JSON.stringify({ logged_in: true, user: { github_login: githubLogin }, api_base: args.apiBase })}\n`,
        );
      } else if (!args.quiet) {
        process.stdout.write(`Logged in as ${githubLogin}.\n`);
      }
      return EXIT_ALLOW;
    }
    // The poll surface returns ok=false for pending/expired/invalid; the
    // errorCode tells us which.
    if (pollRes.errorCode === 'authorization-pending') {
      // expected — keep polling
      continue;
    }
    if (pollRes.errorCode === 'device-code-expired') {
      process.stderr.write('Device-code pairing did not complete before expiry.\n');
      return EXIT_NOT_EVALUATED;
    }
    if (pollRes.errorCode === 'device-code-invalid') {
      process.stderr.write(`Device-code invalid: ${pollRes.message}\n`);
      return EXIT_NETWORK_ERROR;
    }
    // Unknown error — surface honestly.
    process.stderr.write(`${pollRes.message}\n`);
    return pollRes.exitCode;
  }

  process.stderr.write('Device-code pairing did not complete before expiry.\n');
  return EXIT_NOT_EVALUATED;
}
