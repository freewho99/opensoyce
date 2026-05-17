/**
 * Band-drop notifier v0.1 -- Vercel cron tick.
 *
 * GET /api/band-drop-tick
 * Authorization: Bearer ${CRON_SECRET}
 *
 * Every 6 hours (vercel.json crons) this endpoint:
 *   1. Lists open issues on freewho99/opensoyce labeled `band-drop-subscribed`.
 *   2. Parses each issue body for the subscriber marker
 *      `<!-- opensoyce-subscriber: login=X repo=O/R watches=band-drop -->`
 *      and the optional last-band marker
 *      `<!-- opensoyce-last-band: BAND -->`.
 *   3. Re-runs analyzeRepo + verdictFor for each subscribed repo.
 *   4. On DOWNWARD band transitions (ladder: USE READY > FORKABLE > STABLE >
 *      WATCHLIST > RISKY > STALE) -- posts a comment @-mentioning the
 *      subscriber and updates the marker.
 *      First tick (no marker) -- writes baseline marker, no comment.
 *      Unchanged or upward -- silently updates marker if needed, no comment.
 *
 * Failure isolation: per-subscriber errors are caught, logged, and counted as
 * `errored`. The tick always returns 200 with a summary so Vercel cron's
 * non-2xx-is-failure semantics don't false-alarm on partial failure.
 */

import { signAppJwt } from './github-webhook.js';
import { findInstallationId, getInstallationToken } from './claim-submit.js';
import { analyzeRepo, githubHeaders } from '../src/shared/analyzeRepo.js';
import { verdictFor } from '../src/shared/verdict.js';
import { mapWithConcurrency } from '../src/shared/runScan.js';

const ISSUE_OWNER = 'freewho99';
const ISSUE_REPO = 'opensoyce';
const BAND_DROP_LABEL = 'band-drop-subscribed';
const MAX_PAGES = 10;
const PER_PAGE = 100;
const CONCURRENCY = 3;

export const BAND_LADDER = ['USE READY', 'FORKABLE', 'STABLE', 'WATCHLIST', 'RISKY', 'STALE'];

const SUBSCRIBER_RE = /<!-- opensoyce-subscriber: login=([^ ]+) repo=([^ ]+) watches=band-drop -->/;
const LAST_BAND_RE = /<!-- opensoyce-last-band: (.+?) -->/;

// ---------------------------------------------------------------------------
// Marker helpers (pure, side-effect free)
// ---------------------------------------------------------------------------

export function parseSubscriberMarker(issueBody) {
  if (typeof issueBody !== 'string') return null;
  const m = issueBody.match(SUBSCRIBER_RE);
  if (!m) return null;
  const login = m[1];
  const repoFull = m[2];
  const slash = repoFull.indexOf('/');
  if (slash < 1 || slash === repoFull.length - 1) return null;
  return {
    login,
    owner: repoFull.slice(0, slash),
    repo: repoFull.slice(slash + 1),
  };
}

export function parseLastBandMarker(issueBody) {
  if (typeof issueBody !== 'string') return null;
  const m = issueBody.match(LAST_BAND_RE);
  return m ? m[1] : null;
}

export function upsertLastBandMarker(issueBody, band) {
  const marker = `<!-- opensoyce-last-band: ${band} -->`;
  if (LAST_BAND_RE.test(issueBody)) {
    return issueBody.replace(LAST_BAND_RE, marker);
  }
  // Append after subscriber marker if present, else at end.
  if (SUBSCRIBER_RE.test(issueBody)) {
    return issueBody.replace(SUBSCRIBER_RE, (match) => `${match}\n${marker}`);
  }
  return `${issueBody}\n\n${marker}`;
}

export function isBandDrop(prevBand, newBand) {
  const prevIdx = BAND_LADDER.indexOf(prevBand);
  const newIdx = BAND_LADDER.indexOf(newBand);
  if (prevIdx === -1 || newIdx === -1) return false;
  return newIdx > prevIdx;
}

export function buildDropCommentBody({ login, owner, repo, prevBand, newBand }) {
  return `@${login} -- the verdict band for [${owner}/${repo}](https://github.com/${owner}/${repo}) dropped from **${prevBand}** to **${newBand}**.

See the current Soyce Score and breakdown at https://www.opensoyce.com/lookup?q=${owner}/${repo}.

*You're receiving this because you opted in via the /claim flow. To unsubscribe, close this issue.*`;
}

// ---------------------------------------------------------------------------
// GitHub API helpers
// ---------------------------------------------------------------------------

function ghHeaders(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'opensoyce-notifier',
  };
}

function parseNextLink(linkHeader) {
  if (!linkHeader || typeof linkHeader !== 'string') return null;
  // Format: <https://api.github.com/...?page=2>; rel="next", <...>; rel="last"
  const parts = linkHeader.split(',');
  for (const part of parts) {
    const m = part.match(/<([^>]+)>;\s*rel="next"/);
    if (m) return m[1];
  }
  return null;
}

export async function listIssuesByLabel(token, owner, repo, label) {
  const issues = [];
  let url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?labels=${encodeURIComponent(label)}&state=open&per_page=${PER_PAGE}`;
  let pages = 0;
  while (url && pages < MAX_PAGES) {
    const res = await fetch(url, { headers: ghHeaders(token) });
    if (!res.ok) {
      throw new Error(`LIST_ISSUES_FAILED status=${res.status}`);
    }
    const batch = await res.json();
    if (!Array.isArray(batch)) break;
    for (const issue of batch) {
      // /issues returns PRs too -- filter to actual issues only.
      if (!issue.pull_request) issues.push(issue);
    }
    url = parseNextLink(res.headers.get('link'));
    pages += 1;
  }
  return issues;
}

export async function postIssueComment(token, owner, repo, issueNumber, body) {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/comments`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '(no body)');
    throw new Error(`POST_COMMENT_FAILED status=${res.status} body=${text.slice(0, 200)}`);
  }
  return res.json();
}

export async function patchIssueBody(token, owner, repo, issueNumber, body) {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '(no body)');
    throw new Error(`PATCH_ISSUE_FAILED status=${res.status} body=${text.slice(0, 200)}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Injectable deps
// ---------------------------------------------------------------------------

const realDeps = {
  signAppJwt,
  findInstallationId,
  getInstallationToken,
  listIssuesByLabel,
  postIssueComment,
  patchIssueBody,
  analyzeRepo,
  verdictFor,
};

let activeDeps = realDeps;

export function __setDepsForTesting(overrides) {
  if (overrides == null) { activeDeps = realDeps; return; }
  activeDeps = { ...realDeps, ...overrides };
}

// ---------------------------------------------------------------------------
// Per-subscriber processing
// ---------------------------------------------------------------------------

async function processSubscriber({ issue, installationToken, githubTokenForAnalyze }) {
  const sub = parseSubscriberMarker(issue.body);
  if (!sub) {
    return { outcome: 'skipped-malformed', issueNumber: issue.number };
  }
  const { login, owner, repo } = sub;

  // Re-analyze.
  const headers = githubHeaders(githubTokenForAnalyze);
  const scoreResult = await activeDeps.analyzeRepo(owner, repo, headers);
  if (!scoreResult) {
    // 404 repo. Treat as errored; do NOT touch the marker.
    return { outcome: 'errored', issueNumber: issue.number, reason: 'REPO_NOT_FOUND' };
  }

  const newBand = activeDeps.verdictFor(scoreResult.total, {
    advisorySummary: (scoreResult.meta && scoreResult.meta.advisories) || null,
    maintainerConcentration: scoreResult.maintainerConcentration || null,
    vendorSdkMatch: !!scoreResult.vendorSdk,
  });

  const prevBand = parseLastBandMarker(issue.body);

  // First tick: baseline only, no comment.
  if (!prevBand) {
    const newBody = upsertLastBandMarker(issue.body || '', newBand);
    await activeDeps.patchIssueBody(installationToken, ISSUE_OWNER, ISSUE_REPO, issue.number, newBody);
    return { outcome: 'baselined', issueNumber: issue.number, band: newBand };
  }

  // Drop -- post comment + update marker.
  if (isBandDrop(prevBand, newBand)) {
    const commentBody = buildDropCommentBody({ login, owner, repo, prevBand, newBand });
    await activeDeps.postIssueComment(installationToken, ISSUE_OWNER, ISSUE_REPO, issue.number, commentBody);
    const newBody = upsertLastBandMarker(issue.body || '', newBand);
    await activeDeps.patchIssueBody(installationToken, ISSUE_OWNER, ISSUE_REPO, issue.number, newBody);
    return { outcome: 'dropped', issueNumber: issue.number, prevBand, newBand };
  }

  // Unchanged or upward. Sync marker if needed; no comment.
  if (prevBand !== newBand) {
    const newBody = upsertLastBandMarker(issue.body || '', newBand);
    await activeDeps.patchIssueBody(installationToken, ISSUE_OWNER, ISSUE_REPO, issue.number, newBody);
    return { outcome: 'synced-up', issueNumber: issue.number, prevBand, newBand };
  }

  return { outcome: 'unchanged', issueNumber: issue.number, band: newBand };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('band-drop-tick: CRON_SECRET missing');
    return res.status(500).json({ error: 'CRON_NOT_CONFIGURED' });
  }
  const auth = req.headers && req.headers.authorization;
  if (auth !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !privateKey) {
    console.error('band-drop-tick: GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY missing');
    return res.status(500).json({ error: 'APP_CREDENTIALS_MISSING' });
  }

  // Mint installation token ONCE per tick.
  let installationToken;
  try {
    const jwt = activeDeps.signAppJwt(appId, privateKey);
    const installationId = await activeDeps.findInstallationId(jwt, ISSUE_OWNER, ISSUE_REPO);
    const tokenResp = await activeDeps.getInstallationToken(jwt, installationId);
    installationToken = tokenResp.token;
  } catch (err) {
    console.error('band-drop-tick: installation token mint failed', err && err.message);
    return res.status(502).json({ error: 'GITHUB_APP_UNAVAILABLE' });
  }

  // Discover subscribers.
  let subscribed;
  try {
    subscribed = await activeDeps.listIssuesByLabel(installationToken, ISSUE_OWNER, ISSUE_REPO, BAND_DROP_LABEL);
  } catch (err) {
    console.error('band-drop-tick: listIssuesByLabel failed', err && err.message);
    return res.status(502).json({ error: 'LIST_ISSUES_FAILED' });
  }

  if (subscribed.length === 0) {
    return res.status(200).json({ ok: true, scanned: 0, baselined: 0, dropped: 0, errored: 0 });
  }

  const githubTokenForAnalyze = process.env.GITHUB_TOKEN || '';

  const results = await mapWithConcurrency(subscribed, CONCURRENCY, async (issue) => {
    return processSubscriber({ issue, installationToken, githubTokenForAnalyze });
  });

  let scanned = 0, baselined = 0, dropped = 0, errored = 0;
  const breakdown = [];
  for (const r of results) {
    if (!r.ok) {
      errored += 1;
      console.error('band-drop-tick: subscriber error', r.error && r.error.message);
      breakdown.push({ outcome: 'errored', reason: r.error && r.error.message });
      continue;
    }
    const v = r.value;
    breakdown.push(v);
    if (v.outcome === 'errored') errored += 1;
    else if (v.outcome === 'baselined') { baselined += 1; scanned += 1; }
    else if (v.outcome === 'dropped') { dropped += 1; scanned += 1; }
    else if (v.outcome === 'skipped-malformed') errored += 1;
    else scanned += 1;
  }

  return res.status(200).json({
    ok: true,
    scanned,
    baselined,
    dropped,
    errored,
    breakdown,
  });
}
