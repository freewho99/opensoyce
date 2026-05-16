/**
 * OAuth callback for the /claim rebuttal flow.
 *
 * GET /api/claim-callback?code=<code>&state=<signed-state>
 *
 * Steps:
 *   1. Verify the state-token signature; reject if forged / tampered / expired.
 *   2. Exchange the OAuth code for an access token (server-side only).
 *   3. Verify the user is a collaborator on the claimed owner/repo.
 *   4. Mint a short-lived (10 min) claim-token bound to { owner, repo, login }.
 *   5. Redirect to /claim?token=... and DROP the OAuth access token. It is
 *      never persisted, never logged, never put in a URL.
 *
 * The OAuth token's only job is to answer "is this user a collaborator on
 * this repo." We answer that, then discard it.
 */

import { verifyStateToken, signClaimToken } from '../src/shared/claimTokens.js';
import { isValidGithubName } from '../src/shared/validateRepo.js';

const FRONTEND_ORIGIN = 'https://www.opensoyce.com';

// Injectable deps so tests can stub network calls.
const realDeps = {
  exchangeCodeForToken,
  getAuthenticatedLogin,
  checkCollaborator,
};

let activeDeps = realDeps;

export function __setDepsForTesting(overrides) {
  if (overrides == null) { activeDeps = realDeps; return; }
  activeDeps = { ...realDeps, ...overrides };
}

// ---------------------------------------------------------------------------
// HTML helpers (minimal — error pages only, never need to be pretty)
// ---------------------------------------------------------------------------

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderErrorPage(title, message) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)} — OpenSoyce</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font-family:system-ui,sans-serif;max-width:640px;margin:80px auto;padding:0 24px;color:#1a1a1a;}
h1{font-weight:900;text-transform:uppercase;font-style:italic;letter-spacing:-0.02em;font-size:2.5rem;margin-bottom:1rem;color:#E63322;}
p{font-size:1.1rem;line-height:1.55;}
a{color:#302C26;font-weight:700;}
.box{border:4px solid #302C26;padding:32px;box-shadow:8px 8px 0 #000;background:#fff;}
</style></head>
<body><div class="box">
<h1>${escapeHtml(title)}</h1>
<p>${message}</p>
<p><a href="/claim">&larr; Back to /claim</a></p>
</div></body></html>`;
}

function sendErrorPage(res, status, title, message) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.end(renderErrorPage(title, message));
}

// ---------------------------------------------------------------------------
// GitHub helpers
// ---------------------------------------------------------------------------

/**
 * Exchange an OAuth `code` for a user access token.
 * @returns {Promise<{ access_token?: string, error?: string, error_description?: string }>}
 */
export async function exchangeCodeForToken({ clientId, clientSecret, code }) {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'opensoyce-claim',
    },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });
  if (!res.ok) {
    return { error: 'http_' + res.status };
  }
  return res.json();
}

export async function getAuthenticatedLogin(accessToken) {
  const res = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'opensoyce-claim',
    },
  });
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  if (!body || typeof body.login !== 'string') return null;
  return body.login;
}

/**
 * Returns:
 *   'collaborator'  -> 204 from GitHub
 *   'not_member'    -> 404
 *   'forbidden'     -> 403 (token missing scope)
 *   'error'         -> anything else
 */
export async function checkCollaborator({ accessToken, owner, repo, login }) {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/collaborators/${encodeURIComponent(login)}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'opensoyce-claim',
    },
  });
  if (res.status === 204) return 'collaborator';
  if (res.status === 404) return 'not_member';
  if (res.status === 403) return 'forbidden';
  return 'error';
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

function getQuery(req) {
  if (req.query && typeof req.query === 'object') return req.query;
  try {
    const url = new URL(req.url || '', 'http://x');
    return Object.fromEntries(url.searchParams.entries());
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const q = getQuery(req);
  const code = typeof q.code === 'string' ? q.code : '';
  const state = typeof q.state === 'string' ? q.state : '';

  if (!code || !state) {
    return sendErrorPage(res, 400, 'Missing OAuth response',
      'GitHub did not return the expected <code>code</code> and <code>state</code> parameters. Try <a href="/claim">starting again</a>.');
  }

  const hmacKey = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  if (!hmacKey || !clientId) {
    console.error('claim-callback: OAuth env vars missing');
    return sendErrorPage(res, 500, 'OAuth not configured',
      'OpenSoyce is missing its GitHub OAuth credentials. This is a server-side problem; please open an issue.');
  }

  const verified = verifyStateToken(state, hmacKey);
  if (!verified) {
    return sendErrorPage(res, 400, 'Invalid state',
      'The <code>state</code> parameter could not be verified. This is a CSRF protection — your request may have been tampered with, or the flow may have expired. <a href="/claim">Start over</a>.');
  }
  const { owner, repo } = verified;

  // Defense in depth: even though we signed it, re-validate the names.
  if (!isValidGithubName(owner) || !isValidGithubName(repo)) {
    return sendErrorPage(res, 400, 'Invalid repo identifier',
      'The repository named in this OAuth flow is not a valid GitHub identifier.');
  }

  // 1. Exchange code -> token.
  let exch;
  try {
    exch = await activeDeps.exchangeCodeForToken({
      clientId,
      clientSecret: hmacKey,
      code,
    });
  } catch (err) {
    console.error('claim-callback: token exchange threw', err && err.message);
    return sendErrorPage(res, 502, 'GitHub OAuth unreachable',
      'OpenSoyce could not reach GitHub to exchange your authorization code. Try again in a minute.');
  }
  if (!exch || typeof exch.access_token !== 'string' || !exch.access_token) {
    const detail = exch && (exch.error_description || exch.error) ? escapeHtml(String(exch.error_description || exch.error)) : 'unknown error';
    return sendErrorPage(res, 400, 'OAuth failed',
      `GitHub rejected the authorization code: <code>${detail}</code>. <a href="/claim">Try again</a>.`);
  }
  const accessToken = exch.access_token;

  // 2. Identify the user.
  let login;
  try {
    login = await activeDeps.getAuthenticatedLogin(accessToken);
  } catch (err) {
    console.error('claim-callback: getAuthenticatedLogin threw', err && err.message);
    login = null;
  }
  if (!login) {
    // Don't leak the token anywhere.
    return sendErrorPage(res, 502, 'Could not read your GitHub identity',
      'OpenSoyce got a token but GitHub did not return your login. Try again. <a href="/claim">Restart</a>.');
  }

  // 3. Verify collaborator status.
  let status;
  try {
    status = await activeDeps.checkCollaborator({ accessToken, owner, repo, login });
  } catch (err) {
    console.error('claim-callback: checkCollaborator threw', err && err.message);
    status = 'error';
  }

  // From this point on we no longer need the OAuth access token.
  // It is not stored, not logged, not put in the redirect URL.

  if (status === 'not_member') {
    return sendErrorPage(res, 403, 'Not a collaborator',
      `GitHub says <strong>@${escapeHtml(login)}</strong> isn't a collaborator on <strong>${escapeHtml(owner)}/${escapeHtml(repo)}</strong>. If this is wrong, check your repo permissions and <a href="/claim">try again</a>.`);
  }
  if (status === 'forbidden') {
    return sendErrorPage(res, 403, 'Could not verify access',
      `GitHub denied OpenSoyce permission to check your collaborator status on <strong>${escapeHtml(owner)}/${escapeHtml(repo)}</strong>. This usually means the OAuth grant didn't include enough scope. <a href="/claim">Try again</a> and accept all requested permissions.`);
  }
  if (status !== 'collaborator') {
    return sendErrorPage(res, 502, 'GitHub error',
      'OpenSoyce got an unexpected response from GitHub while verifying your access. Try again in a minute.');
  }

  // 4. Mint short-lived claim-token. The form POSTs this to /api/claim-submit.
  const claimToken = signClaimToken({ owner, repo, login }, hmacKey);

  const params = new URLSearchParams({ owner, repo, token: claimToken });
  const redirect = `${FRONTEND_ORIGIN}/claim?${params.toString()}`;

  res.statusCode = 302;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Location', redirect);
  return res.end();
}
