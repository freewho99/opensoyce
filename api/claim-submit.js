/**
 * Final POST endpoint for the /claim rebuttal flow.
 *
 * POST /api/claim-submit
 * Body: { token: <signed claim-token>, rebuttalBody: <markdown text> }
 *
 * Verifies the claim-token (CSRF + replay + expiry defense), then uses the
 * OpenSoyce GitHub App (NOT the user's OAuth token, which was discarded in
 * /api/claim-callback) to open an issue on freewho99/opensoyce labeled
 * `claim-rebuttal`. Returns { ok, issueUrl }.
 */

import { signAppJwt } from './github-webhook.js';
import { verifyClaimToken } from '../src/shared/claimTokens.js';

const ISSUE_OWNER = 'freewho99';
const ISSUE_REPO = 'opensoyce';
const ISSUE_LABEL = 'claim-rebuttal';
const BAND_DROP_LABEL = 'band-drop-subscribed';

const MIN_BODY = 30;
const MAX_BODY = 10_000;

// Injectable deps for tests.
const realDeps = {
  signAppJwt,
  findInstallationId,
  getInstallationToken,
  createIssue,
};

let activeDeps = realDeps;

export function __setDepsForTesting(overrides) {
  if (overrides == null) { activeDeps = realDeps; return; }
  activeDeps = { ...realDeps, ...overrides };
}

// ---------------------------------------------------------------------------
// GitHub App helpers (the installation token flow mirrors github-webhook.js)
// ---------------------------------------------------------------------------

export async function findInstallationId(appJwt, owner, repo) {
  // The Apps API lets us look up the installation ID for a repo when we have
  // an App JWT. We use this rather than hard-coding the install ID — that way
  // re-installs don't break the endpoint.
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/installation`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${appJwt}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'opensoyce-claim',
    },
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
    headers: {
      'Authorization': `Bearer ${appJwt}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'opensoyce-claim',
    },
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
    headers: {
      'Authorization': `Bearer ${installationToken}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'opensoyce-claim',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title, body, labels }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '(no body)');
    throw new Error(`ISSUE_CREATE_FAILED status=${res.status} body=${text.slice(0, 200)}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Issue body builder
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Body reader
// ---------------------------------------------------------------------------

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  // Fallback: stream-read.
  return await new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return res.status(400).json({ error: 'INVALID_JSON' });
  }

  const token = body && typeof body.token === 'string' ? body.token : '';
  const rebuttalBody = body && typeof body.rebuttalBody === 'string' ? body.rebuttalBody : '';
  // Defensive: only accept a literal boolean true; anything else (incl. "yes",
  // 1, null, undefined, "true") defaults to false. Opt-in must be explicit.
  const notifyOnBandDrop = body && body.notifyOnBandDrop === true;

  if (!token) return res.status(400).json({ error: 'MISSING_TOKEN' });

  const hmacKey = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  if (!hmacKey) {
    console.error('claim-submit: GITHUB_OAUTH_CLIENT_SECRET missing');
    return res.status(500).json({ error: 'OAUTH_NOT_CONFIGURED' });
  }

  const claim = verifyClaimToken(token, hmacKey);
  if (!claim) {
    return res.status(401).json({ error: 'INVALID_OR_EXPIRED_TOKEN' });
  }
  const { owner, repo, login } = claim;

  const trimmed = rebuttalBody.trim();
  if (trimmed.length < MIN_BODY) {
    return res.status(400).json({ error: 'BODY_TOO_SHORT', minChars: MIN_BODY });
  }
  if (trimmed.length > MAX_BODY) {
    return res.status(400).json({ error: 'BODY_TOO_LONG', maxChars: MAX_BODY });
  }

  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !privateKey) {
    console.error('claim-submit: GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY missing');
    return res.status(500).json({ error: 'APP_CREDENTIALS_MISSING' });
  }

  // Mint App JWT, find the install on freewho99/opensoyce, mint installation token.
  let installationToken;
  try {
    const jwt = activeDeps.signAppJwt(appId, privateKey);
    const installationId = await activeDeps.findInstallationId(jwt, ISSUE_OWNER, ISSUE_REPO);
    const tokenResp = await activeDeps.getInstallationToken(jwt, installationId);
    installationToken = tokenResp.token;
  } catch (err) {
    console.error('claim-submit: installation token mint failed', err && err.message);
    return res.status(502).json({ error: 'GITHUB_APP_UNAVAILABLE',
      message: 'OpenSoyce could not authenticate to its own GitHub App. The maintainer has been alerted; try again later.' });
  }

  const timestamp = new Date().toISOString();
  const title = buildIssueTitle({ owner, repo, login });
  const issueBody = buildIssueBody({ owner, repo, login, rebuttalBody: trimmed, timestamp, notifyOnBandDrop });
  const labels = notifyOnBandDrop ? [ISSUE_LABEL, BAND_DROP_LABEL] : [ISSUE_LABEL];

  let issue;
  try {
    issue = await activeDeps.createIssue(installationToken, {
      owner: ISSUE_OWNER,
      repo: ISSUE_REPO,
      title,
      body: issueBody,
      labels,
    });
  } catch (err) {
    console.error('claim-submit: createIssue failed', err && err.message);
    return res.status(502).json({ error: 'ISSUE_CREATE_FAILED',
      message: 'OpenSoyce could not open the rebuttal issue. This usually means the App lacks Issues:write permission on freewho99/opensoyce.' });
  }

  if (!issue || typeof issue.html_url !== 'string' || typeof issue.number !== 'number') {
    return res.status(502).json({ error: 'ISSUE_RESPONSE_MALFORMED' });
  }

  return res.status(200).json({
    ok: true,
    issueUrl: issue.html_url,
    issueNumber: issue.number,
    notifyOnBandDrop,
  });
}
