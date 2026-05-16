/**
 * OAuth start endpoint for the /claim rebuttal flow.
 *
 * GET /api/claim-start?owner=<o>&repo=<r>
 *
 * Validates owner/repo input, signs a state-token containing them, and
 * 302-redirects the browser to GitHub's OAuth authorize URL. The state-token
 * is HMAC-signed so the callback can prove the owner/repo pair came from us
 * (CSRF defense) and rejects forged callbacks.
 *
 * Scopes requested:
 *   - read:user  -> get the authenticated user's login
 *   - repo       -> required to call the collaborators API on private repos;
 *                   on public repos `public_repo` would suffice but we want a
 *                   single code path. Documented user-side on the Claim page.
 *
 * The OAuth token itself is never minted here — GitHub mints it after the
 * user clicks Authorize, and only the callback endpoint sees it.
 */

import { isValidGithubName } from '../src/shared/validateRepo.js';
import { signStateToken } from '../src/shared/claimTokens.js';

const CALLBACK_URL = 'https://www.opensoyce.com/api/claim-callback';
const SCOPES = 'read:user repo';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Vercel parses ?foo=bar onto req.query. Fall back to URL parsing for safety.
  let owner, repo;
  if (req.query && typeof req.query.owner === 'string') {
    owner = req.query.owner;
    repo = typeof req.query.repo === 'string' ? req.query.repo : '';
  } else {
    try {
      const url = new URL(req.url || '', 'http://x');
      owner = url.searchParams.get('owner') || '';
      repo = url.searchParams.get('repo') || '';
    } catch {
      return res.status(400).json({ error: 'INVALID_URL' });
    }
  }

  if (!owner || !repo || !isValidGithubName(owner) || !isValidGithubName(repo)) {
    return res.status(400).json({ error: 'INVALID_OWNER_OR_REPO' });
  }

  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const hmacKey = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  if (!clientId || !hmacKey) {
    console.error('claim-start: GITHUB_OAUTH_CLIENT_ID / _CLIENT_SECRET missing');
    return res.status(500).json({ error: 'OAUTH_NOT_CONFIGURED' });
  }

  const state = signStateToken({ owner, repo }, hmacKey);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: CALLBACK_URL,
    scope: SCOPES,
    state,
    allow_signup: 'false',
  });
  const url = `https://github.com/login/oauth/authorize?${params.toString()}`;

  res.setHeader('Cache-Control', 'no-store');
  res.statusCode = 302;
  res.setHeader('Location', url);
  return res.end();
}
