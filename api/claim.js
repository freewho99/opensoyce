/**
 * Unified claim handler — merges claim-start, claim-callback, claim-submit
 * into a single Vercel function to stay under the 12-function Hobby limit.
 *
 * Routes:
 *   GET  /api/claim/start?owner=<o>&repo=<r>
 *   GET  /api/claim/callback?code=<code>&state=<state>
 *   POST /api/claim/submit
 */

import { signStateToken, verifyStateToken, signClaimToken, verifyClaimToken } from '../src/shared/claimTokens.js';
import { isValidGithubName } from '../src/shared/validateRepo.js';
import { signAppJwt } from './github-webhook.js';

const FRONTEND_ORIGIN = 'https://www.opensoyce.com';
const CALLBACK_URL    = 'https://www.opensoyce.com/api/claim/callback';
const SCOPES          = 'read:user repo';
const ISSUE_OWNER     = 'freewho99';
const ISSUE_REPO      = 'opensoyce';
const ISSUE_LABEL     = 'claim-rebuttal';
const BAND_DROP_LABEL = 'band-drop-subscribed';
const MIN_BODY        = 30;
const MAX_BODY        = 10_000;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
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

function getQuery(req) {
  if (req.query && typeof req.query === 'object') return req.query;
  try {
    const url = new URL(req.url || '', 'http://x');
    return Object.fromEntries(url.searchParams.entries());
  } catch { return {}; }
}

export async function exchangeCodeForToken({ clientId, clientSecret, code }) {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'opensoyce-claim' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });
  if (!res.ok) return { error: 'http_' + res.status };
  return res.json();
}

export async function getAuthenticatedLogin(accessToken) {
  const res = await fetch('https://api.github.com/user', {
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'opensoyce-claim' },
  });
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  if (!body || typeof body.login !== 'string') return null;
  return body.login;
}

export async function checkCollaborator({ accessToken, owner, repo, login }) {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/collaborators/${encodeURIComponent(login)}`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'opensoyce-claim' },
  });
  if (res.status === 204) return 'collaborator';
  if (res.status === 404) return 'not_member';
  if (res.status === 403) return 'forbidden';
  return 'error';
}

export async function findInstallationId(appJwt, owner, repo) {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/installation`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${appJwt}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'opensoyce-claim' },
  });
  if (!res.ok) throw new Error(`INSTALLATION_LOOKUP_FAILED status=${res.status}`);
  const body = await res.json();
  if (!body || typeof body.id !== 'number') throw new Error('INSTALLATION_ID_MISSING');
  return body.id;
}

export async function getInstallationToken(appJwt, installationId) {
  const url = `https://api.github.com/app/installations/${installationId}/access_tokens`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${appJwt}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'opensoyce-claim' },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '(no body)');
    throw new Error(`INSTALLATION_TOKEN_FAILED status=${res.status} body=${text.slice(0, 200)}`);
  }
  return res.json();
}

export async function createIssue(installationToken, { owner, repo, title, body, labels }) {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${installationToken}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'opensoyce-claim', 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body, labels }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '(no body)');
    throw new Error(`ISSUE_CREATE_FAILED status=${res.status} body=${text.slice(0, 200)}`);
  }
  return res.json();
}

export function buildIssueTitle({ owner, repo, login }) {
  return `Score rebuttal: ${owner}/${repo} — @${login}`;
}

export function buildIssueBody({ owner, repo, login, rebuttalBody, timestamp, notifyOnBandDrop }) {
  const base = `**Repo:** [${owner}/${repo}](https://github.com/${owner}/${repo})
**Submitted by:** @${login} (verified collaborator at ${timestamp})
**Current Soyce Score:** see https://www.opensoyce.com/lookup?q=${owner}/${repo}

---

### Maintainer's rebuttal

${rebuttalBody}

---

*Submitted via opensoyce.com/claim. The submitter was verified as a collaborator on the repo at submission time. OpenSoyce does not retain the GitHub access token used for verification.*`;
  if (!notifyOnBandDrop) return base;
  return `${base}

---

**Verdict-band notification subscription:** @${login} requested
notifications when the verdict band for ${owner}/${repo} drops.

<!-- opensoyce-subscriber: login=${login} repo=${owner}/${repo} watches=band-drop -->`;
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text.trim() ? JSON.parse(text) : {});
      } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const realDeps = { exchangeCodeForToken, getAuthenticatedLogin, checkCollaborator, signAppJwt, findInstallationId, getInstallationToken, createIssue };
let activeDeps = realDeps;
export function __setDepsForTesting(overrides) {
  activeDeps = overrides == null ? realDeps : { ...realDeps, ...overrides };
}

async function handleStart(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Method not allowed' }); }
  const q = getQuery(req);
  const owner = typeof q.owner === 'string' ? q.owner : '';
  const repo  = typeof q.repo  === 'string' ? q.repo  : '';
  if (!owner || !repo || !isValidGithubName(owner) || !isValidGithubName(repo))
    return res.status(400).json({ error: 'INVALID_OWNER_OR_REPO' });
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const hmacKey  = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  if (!clientId || !hmacKey) { console.error('claim/start: env vars missing'); return res.status(500).json({ error: 'OAUTH_NOT_CONFIGURED' }); }
  const state = signStateToken({ owner, repo }, hmacKey);
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: CALLBACK_URL, scope: SCOPES, state, allow_signup: 'false' });
  res.setHeader('Cache-Control', 'no-store');
  res.statusCode = 302;
  res.setHeader('Location', `https://github.com/login/oauth/authorize?${params.toString()}`);
  return res.end();
}

async function handleCallback(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Method not allowed' }); }
  const q     = getQuery(req);
  const code  = typeof q.code  === 'string' ? q.code  : '';
  const state = typeof q.state === 'string' ? q.state : '';
  if (!code || !state) return sendErrorPage(res, 400, 'Missing OAuth response', 'GitHub did not return the expected code and state parameters. Try <a href="/claim">starting again</a>.');
  const hmacKey  = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  if (!hmacKey || !clientId) { console.error('claim/callback: env vars missing'); return sendErrorPage(res, 500, 'OAuth not configured', 'OpenSoyce is missing its GitHub OAuth credentials.'); }
  const verified = verifyStateToken(state, hmacKey);
  if (!verified) return sendErrorPage(res, 400, 'Invalid state', 'The state parameter could not be verified. <a href="/claim">Start over</a>.');
  const { owner, repo } = verified;
  if (!isValidGithubName(owner) || !isValidGithubName(repo)) return sendErrorPage(res, 400, 'Invalid repo identifier', 'The repository named in this OAuth flow is not a valid GitHub identifier.');
  let exch;
  try { exch = await activeDeps.exchangeCodeForToken({ clientId, clientSecret: hmacKey, code }); }
  catch (err) { console.error('claim/callback: token exchange threw', err?.message); return sendErrorPage(res, 502, 'GitHub OAuth unreachable', 'OpenSoyce could not reach GitHub to exchange your authorization code. Try again.'); }
  if (!exch || typeof exch.access_token !== 'string' || !exch.access_token) {
    const detail = exch && (exch.error_description || exch.error) ? escapeHtml(String(exch.error_description || exch.error)) : 'unknown error';
    return sendErrorPage(res, 400, 'OAuth failed', `GitHub rejected the authorization code: ${detail}. <a href="/claim">Try again</a>.`);
  }
  const accessToken = exch.access_token;
  let login;
  try { login = await activeDeps.getAuthenticatedLogin(accessToken); } catch (err) { console.error('claim/callback: getLogin threw', err?.message); login = null; }
  if (!login) return sendErrorPage(res, 502, 'Could not read your GitHub identity', 'OpenSoyce got a token but GitHub did not return your login. <a href="/claim">Restart</a>.');
  let status;
  try { status = await activeDeps.checkCollaborator({ accessToken, owner, repo, login }); } catch (err) { console.error('claim/callback: checkCollaborator threw', err?.message); status = 'error'; }
  if (status === 'not_member') return sendErrorPage(res, 403, 'Not a collaborator', `GitHub says @${escapeHtml(login)} is not a collaborator on ${escapeHtml(owner)}/${escapeHtml(repo)}. <a href="/claim">Try again</a>.`);
  if (status === 'forbidden')  return sendErrorPage(res, 403, 'Could not verify access', 'GitHub denied permission to check collaborator status. <a href="/claim">Try again</a> and accept all requested permissions.');
  if (status !== 'collaborator') return sendErrorPage(res, 502, 'GitHub error', 'OpenSoyce got an unexpected response from GitHub. Try again in a minute.');
  const claimToken = signClaimToken({ owner, repo, login }, hmacKey);
  const params = new URLSearchParams({ owner, repo, token: claimToken });
  res.statusCode = 302;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Location', `${FRONTEND_ORIGIN}/claim?${params.toString()}`);
  return res.end();
}

async function handleSubmit(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  let body;
  try { body = await readJsonBody(req); } catch { return res.status(400).json({ error: 'INVALID_JSON' }); }
  const token          = body && typeof body.token === 'string' ? body.token : '';
  const rebuttalBody   = body && typeof body.rebuttalBody === 'string' ? body.rebuttalBody : '';
  const notifyOnBandDrop = body && body.notifyOnBandDrop === true;
  if (!token) return res.status(400).json({ error: 'MISSING_TOKEN' });
  const hmacKey = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  if (!hmacKey) { console.error('claim/submit: GITHUB_OAUTH_CLIENT_SECRET missing'); return res.status(500).json({ error: 'OAUTH_NOT_CONFIGURED' }); }
  const claim = verifyClaimToken(token, hmacKey);
  if (!claim) return res.status(401).json({ error: 'INVALID_OR_EXPIRED_TOKEN' });
  const { owner, repo, login } = claim;
  const trimmed = rebuttalBody.trim();
  if (trimmed.length < MIN_BODY) return res.status(400).json({ error: 'BODY_TOO_SHORT', minChars: MIN_BODY });
  if (trimmed.length > MAX_BODY) return res.status(400).json({ error: 'BODY_TOO_LONG',  maxChars: MAX_BODY });
  const appId      = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !privateKey) { console.error('claim/submit: app credentials missing'); return res.status(500).json({ error: 'APP_CREDENTIALS_MISSING' }); }
  let installationToken;
  try {
    const jwt            = activeDeps.signAppJwt(appId, privateKey);
    const installationId = await activeDeps.findInstallationId(jwt, ISSUE_OWNER, ISSUE_REPO);
    const tokenResp      = await activeDeps.getInstallationToken(jwt, installationId);
    installationToken    = tokenResp.token;
  } catch (err) { console.error('claim/submit: installation token failed', err?.message); return res.status(502).json({ error: 'GITHUB_APP_UNAVAILABLE', message: 'OpenSoyce could not authenticate to its GitHub App. Try again later.' }); }
  const timestamp = new Date().toISOString();
  const title     = buildIssueTitle({ owner, repo, login });
  const issueBody = buildIssueBody({ owner, repo, login, rebuttalBody: trimmed, timestamp, notifyOnBandDrop });
  const labels    = notifyOnBandDrop ? [ISSUE_LABEL, BAND_DROP_LABEL] : [ISSUE_LABEL];
  let issue;
  try { issue = await activeDeps.createIssue(installationToken, { owner: ISSUE_OWNER, repo: ISSUE_REPO, title, body: issueBody, labels }); }
  catch (err) { console.error('claim/submit: createIssue failed', err?.message); return res.status(502).json({ error: 'ISSUE_CREATE_FAILED', message: 'Could not open the rebuttal issue.' }); }
  if (!issue || typeof issue.html_url !== 'string' || typeof issue.number !== 'number') return res.status(502).json({ error: 'ISSUE_RESPONSE_MALFORMED' });
  return res.status(200).json({ ok: true, issueUrl: issue.html_url, issueNumber: issue.number, notifyOnBandDrop });
}

export default async function handler(req, res) {
  const path = (req.url || '').split('?')[0].replace(/\/$/, '');
  if (path.endsWith('/start'))    return handleStart(req, res);
  if (path.endsWith('/callback')) return handleCallback(req, res);
  if (path.endsWith('/submit'))   return handleSubmit(req, res);
  return res.status(404).json({ error: 'NOT_FOUND', hint: 'Use /api/claim/start, /api/claim/callback, or /api/claim/submit' });
}
