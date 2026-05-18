/**
 * Public client-side config.
 *
 * Returns env-derived values that the frontend needs to drive flows like the
 * dashboard OAuth redirect. ONLY public values (e.g. OAuth client_id, which
 * GitHub designed to live in browser URLs) belong here — never secrets.
 */

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    hasGithubToken: !!process.env.GITHUB_TOKEN,
    // GitHub OAuth client_id is public by design — it's what we redirect to
    // GitHub with. The matching client_secret is server-only and used to
    // exchange auth codes (api/claim.js + api/exceptions.js auth-callback).
    githubOauthClientId: process.env.GITHUB_OAUTH_CLIENT_ID || null,
  });
}
