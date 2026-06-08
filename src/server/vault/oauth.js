// OpenSoyce Trust Vault — GitHub OAuth code exchange + session bootstrap.
//
// PR-V2-A. Per PR-V1-A §1 (auth provider) + PR-V1-B §2.4 (session row).
//
// Reuses the existing candidate-pipeline OAuth pattern:
//   - Client redirects to GitHub authorize with state.
//   - GitHub redirects back to /api/vault/auth/login with code + state.
//   - This handler POSTs to GitHub's token endpoint, looks up /user, then
//     upserts a vault_users row (anchored on github_id) and inserts a
//     vault_sessions row.
//   - The cookie is set; the client is redirected to a configured
//     post-login URL.

import { vaultDb } from './db.js';
import { sendError, ERROR_CODES } from './errors.js';
import { sessionTtlSeconds } from './auth.js';
import { generateCsrfToken } from './csrf.js';

const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';
const POST_LOGIN_DEFAULT = '/dashboard';

function readQuery(req, key) {
  const v = req.query && req.query[key];
  return typeof v === 'string' ? v.trim() : '';
}

async function exchangeCodeForToken(clientId, clientSecret, code) {
  const resp = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'opensoyce-vault',
    },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });
  if (!resp.ok) return { error: `token exchange status ${resp.status}` };
  const body = await resp.json().catch(() => null);
  if (!body || typeof body.access_token !== 'string' || !body.access_token) {
    const detail = body && (body.error_description || body.error) ? String(body.error_description || body.error) : 'unknown';
    return { error: `GitHub rejected the OAuth code: ${detail}` };
  }
  return { token: body.access_token };
}

async function fetchGithubUser(token) {
  const resp = await fetch(GITHUB_USER_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'opensoyce-vault',
    },
  });
  if (!resp.ok) return { error: `user lookup status ${resp.status}` };
  const body = await resp.json().catch(() => null);
  if (!body || typeof body.login !== 'string' || typeof body.id !== 'number') {
    return { error: 'user payload missing login/id' };
  }
  return {
    user: {
      login: body.login,
      id: body.id,
      name: typeof body.name === 'string' ? body.name : null,
      avatar_url: typeof body.avatar_url === 'string' ? body.avatar_url : null,
    },
  };
}

async function upsertVaultUser(supabase, ghUser) {
  const { data: existing, error: lookupError } = await supabase
    .from('vault_users')
    .select('user_id')
    .eq('github_id', ghUser.id)
    .limit(1);
  if (lookupError) return { error: lookupError };
  const nowIso = new Date().toISOString();
  if (Array.isArray(existing) && existing[0]) {
    const userId = existing[0].user_id;
    const { error: updateError } = await supabase
      .from('vault_users')
      .update({
        github_login: ghUser.login,
        display_name: ghUser.name,
        avatar_url: ghUser.avatar_url,
        last_login_at: nowIso,
      })
      .eq('user_id', userId);
    if (updateError) return { error: updateError };
    return { userId };
  }
  const { data: inserted, error: insertError } = await supabase
    .from('vault_users')
    .insert({
      github_id: ghUser.id,
      github_login: ghUser.login,
      display_name: ghUser.name,
      avatar_url: ghUser.avatar_url,
      last_login_at: nowIso,
    })
    .select('user_id')
    .limit(1);
  if (insertError) return { error: insertError };
  const userId = inserted && inserted[0] && inserted[0].user_id;
  if (!userId) return { error: new Error('vault_users insert returned no row') };
  return { userId };
}

async function createVaultSession(supabase, userId, req) {
  const expiresAt = new Date(Date.now() + sessionTtlSeconds() * 1000).toISOString();
  const userAgent = (req.headers && req.headers['user-agent']) || null;
  const xff = (req.headers && req.headers['x-forwarded-for']) || '';
  const firstOctet = typeof xff === 'string' ? xff.split(',')[0].trim().split('.')[0] : '';
  const { data, error } = await supabase
    .from('vault_sessions')
    .insert({
      user_id: userId,
      expires_at: expiresAt,
      user_agent: userAgent ? String(userAgent).slice(0, 200) : null,
      ip_origin: firstOctet || null,
    })
    .select('session_id')
    .limit(1);
  if (error) return { error };
  const sessionId = data && data[0] && data[0].session_id;
  if (!sessionId) return { error: new Error('vault_sessions insert returned no row') };
  return { sessionId };
}

/**
 * GET /api/vault/auth/login
 *
 * Query: code (required), state (required), redirect_to (optional)
 *
 * The code+state pair comes from GitHub's redirect after the user clicked
 * Authorize. The state was generated client-side and verified there before
 * sending us this request (mirrors the candidate-pipeline OAuth pattern).
 *
 * On success: sets cookie + 302 to redirect_to (or POST_LOGIN_DEFAULT).
 * On failure: JSON error response.
 */
export async function handleVaultLogin(req, res) {
  const code = readQuery(req, 'code');
  const state = readQuery(req, 'state');
  const redirectRaw = readQuery(req, 'redirect_to');
  const redirectTo = redirectRaw && redirectRaw.startsWith('/') ? redirectRaw : POST_LOGIN_DEFAULT;
  if (!code) return sendError(res, 400, ERROR_CODES.bad_request, 'missing code');
  if (!state) return sendError(res, 400, ERROR_CODES.oauth_state_invalid, 'missing state');

  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return sendError(
      res,
      500,
      ERROR_CODES.oauth_not_configured,
      'Vault OAuth is not configured on the server',
    );
  }

  const exch = await exchangeCodeForToken(clientId, clientSecret, code);
  if (exch.error) return sendError(res, 502, ERROR_CODES.oauth_exchange_failed, exch.error);

  const userLookup = await fetchGithubUser(exch.token);
  if (userLookup.error) return sendError(res, 502, ERROR_CODES.oauth_exchange_failed, userLookup.error);

  let supabase;
  try {
    supabase = vaultDb();
  } catch {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault database is not configured');
  }

  const upsert = await upsertVaultUser(supabase, userLookup.user);
  if (upsert.error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault user write failed');
  }
  const sessionInsert = await createVaultSession(supabase, upsert.userId, req);
  if (sessionInsert.error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault session write failed');
  }

  // Set the session cookie AND the CSRF token cookie atomically. The CSRF
  // token is rotated on session establishment per PR-V1-C §5.4. Two
  // Set-Cookie headers — the Express response supports an array.
  const csrfToken = generateCsrfToken();
  res.setHeader('Set-Cookie', [
    `opensoyce_vault_session=${encodeURIComponent(sessionInsert.sessionId)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${sessionTtlSeconds()}`,
    `opensoyce_vault_csrf=${encodeURIComponent(csrfToken)}; Path=/; Secure; SameSite=Lax; Max-Age=${sessionTtlSeconds()}`,
  ]);
  res.status(302).setHeader('Location', redirectTo);
  res.end();
}

/**
 * POST /api/vault/auth/logout
 *
 * Deletes the session row server-side AND clears the cookie. Idempotent.
 */
export async function handleVaultLogout(req, res) {
  const cookie = req.vaultSession && req.vaultSession.session_id;
  if (cookie) {
    try {
      const supabase = vaultDb();
      await supabase.from('vault_sessions').delete().eq('session_id', cookie);
    } catch {
      // Cookie still cleared; server-side row will reap by expires_at.
    }
  }
  // Clear both the session cookie AND the CSRF cookie. Logout must rotate
  // (here: invalidate) the CSRF token per PR-V1-C §5.4.
  res.setHeader('Set-Cookie', [
    'opensoyce_vault_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
    'opensoyce_vault_csrf=; Path=/; Secure; SameSite=Lax; Max-Age=0',
  ]);
  res.status(204).end();
}
