// OpenSoyce Trust Vault — browser OAuth start helper.
//
// PR-DOGFOOD-1. Fixes the broken login button on /cli-auth and /vault.
//
// What was broken before this fix:
//   Both CliAuth and VaultDashboard set window.location.href to
//   /api/vault/auth/login?redirect_to=... — but that endpoint is the
//   OAuth CALLBACK (it expects `code` and `state` from GitHub) and
//   returned 400 "missing code" immediately. The Phase 5 UI loop was
//   unreachable until this fix.
//
// What this helper does:
//   1. Fetches /api/config for the GitHub OAuth client_id (the same
//      endpoint Dashboard.tsx and AppealsReview.tsx hit).
//   2. Mints a UUID state, stores it in sessionStorage under a Vault-
//      scoped key. Verifies the round-trip later if a caller wants
//      extra CSRF defense.
//   3. Sets window.location.href to the GitHub OAuth authorize URL
//      (https://github.com/login/oauth/authorize?...) with the Vault
//      callback as redirect_uri.
//
// Round-trip mechanism:
//   The redirect_uri carries a `redirect_to` query parameter that
//   GitHub preserves verbatim when redirecting back. The server-side
//   handler (oauth.js handleVaultLogin) already reads redirect_to from
//   the query string and 302s to it after setting cookies. No server
//   change needed.
//
// IMPORTANT BOUNDARY:
//   This module lives under src/shared/vault/ — the public-spine import
//   isolation invariant from PR-V2-C / PR-V2-E forbids public renderers
//   from importing it. The PR-V2-E structural test allowlist permits
//   src/pages/CliAuth.tsx and src/pages/vault/** to consume it.

const OAUTH_STATE_KEY = 'opensoyce_vault_oauth_state';
const OAUTH_RETURN_KEY = 'opensoyce_vault_oauth_returnto';

export interface OAuthStartError {
  code: 'missing-client-id' | 'config-fetch-failed' | 'env-unsupported';
  message: string;
}

function generateState(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for older browsers / SSR shadow — best-effort entropy.
  return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

async function fetchOauthClientId(): Promise<string> {
  const resp = await fetch('/api/config', { credentials: 'same-origin' });
  if (!resp.ok) return '';
  const body = await resp.json().catch(() => null);
  if (!body || typeof body.githubOauthClientId !== 'string') return '';
  return body.githubOauthClientId;
}

/**
 * Start the GitHub OAuth flow for a Vault session.
 *
 * On success, this function never returns — it triggers a top-level
 * navigation to github.com.
 *
 * On failure (missing client_id, environment without window/sessionStorage,
 * /api/config 5xx), returns an OAuthStartError the caller can surface
 * in the UI. The caller is expected to render the failure honestly
 * rather than silently dead-end the user.
 *
 * `returnPath` should be the relative path the user expected to land
 * on after sign-in (e.g. "/cli-auth?user_code=ABCD-EFGH" or
 * "/vault/acme/exceptions"). It is round-tripped through the
 * server-side redirect_to query parameter; the server already
 * validates that redirect_to starts with "/" (open-redirect guard).
 */
export async function startVaultOAuth(returnPath: string): Promise<OAuthStartError | void> {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') {
    return { code: 'env-unsupported', message: 'Browser environment required.' };
  }

  let clientId: string;
  try {
    clientId = await fetchOauthClientId();
  } catch {
    return { code: 'config-fetch-failed', message: 'Could not reach /api/config.' };
  }
  if (!clientId) {
    return {
      code: 'missing-client-id',
      message: 'OpenSoyce is missing its GitHub OAuth client ID. Contact support@opensoyce.com.',
    };
  }

  const state = generateState();
  sessionStorage.setItem(OAUTH_STATE_KEY, state);
  // Stash the desired return path BOTH in the server-bound redirect_to
  // query (the load-bearing channel — server reads it) AND in
  // sessionStorage (a fallback the post-login page can check if the
  // server-side 302 was lost for any reason).
  sessionStorage.setItem(OAUTH_RETURN_KEY, returnPath);

  const origin = window.location.origin;
  const safeReturnPath = returnPath.startsWith('/') ? returnPath : '/vault';
  const redirectUri = `${origin}/api/vault/auth/login?redirect_to=${encodeURIComponent(safeReturnPath)}`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: 'read:user',
    allow_signup: 'false',
  });
  window.location.href = `https://github.com/login/oauth/authorize?${params.toString()}`;
}

/**
 * Read the stashed return path from sessionStorage and clear it. Used
 * by the post-login landing if the server-side redirect_to was lost.
 * Returns null when no stash exists.
 */
export function consumeStashedReturnPath(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  const v = sessionStorage.getItem(OAUTH_RETURN_KEY);
  sessionStorage.removeItem(OAUTH_RETURN_KEY);
  return v;
}

export const __oauth_internals__ = {
  OAUTH_STATE_KEY,
  OAUTH_RETURN_KEY,
};
