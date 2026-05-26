import { calculateSoyceScore } from '../src/shared/scoreCalculator.js';
import { isValidGithubName } from '../src/shared/validateRepo.js';
import { findSecurityPolicy } from '../src/shared/securityPolicyResolver.js';

// Per-lambda in-memory cache and request-coalescing maps.
//
// Why this exists: /api/badge is unauthenticated GET. Without protection a
// single attacker who finds a badge URL can drain the shared GITHUB_TOKEN
// rate budget by triggering 8 GitHub API calls per cache miss across many
// owner/repo combinations. We cannot use Vercel KV on Hobby, so we layer:
//   1. CDN cache (Cache-Control headers below) — handles the bulk of traffic.
//   2. Per-lambda memo (this Map) — handles bursts that hit the same lambda
//      instance during the CDN window, especially after cold start.
//   3. Request coalescing (inflight Map) — when N simultaneous requests for
//      the same owner/repo arrive at one lambda, they share a single GitHub
//      fetch instead of stampeding.
//
// Per-IP rate limiting is intentionally NOT implemented in this PR: without
// an external store it would only be enforceable per-lambda-instance, which
// an attacker trivially defeats by spreading requests. The CDN + memo +
// coalesce combination already makes the upstream cost effectively constant.
const SCORE_CACHE_TTL_MS = 5 * 60 * 1000;
const scoreCache = new Map();
const inflightFetches = new Map();

function getCachedScore(key) {
  const hit = scoreCache.get(key);
  if (!hit) return null;
  if (Date.now() >= hit.expiresAt) {
    scoreCache.delete(key);
    return null;
  }
  return hit;
}

function setCachedScore(key, value) {
  scoreCache.set(key, { ...value, expiresAt: Date.now() + SCORE_CACHE_TTL_MS });
}

async function fetchScoreFromGitHub(owner, repo) {
  const token = process.env.GITHUB_TOKEN;
  const headers = {
    'User-Agent': 'opensoyce',
    'Accept': 'application/vnd.github+json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const issuesSince = new Date(Date.now() - 90 * 86400000).toISOString();
  const [repoRes, commitsRes, contributorsRes, readmeRes, communityRes, releaseRes, advisoriesRes, issuesRes] = await Promise.all([
    fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers }),
    fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=30`, { headers }),
    fetch(`https://api.github.com/repos/${owner}/${repo}/contributors?per_page=30`, { headers }),
    fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, { headers }),
    fetch(`https://api.github.com/repos/${owner}/${repo}/community/profile`, { headers }),
    fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, { headers }),
    fetch(`https://api.github.com/repos/${owner}/${repo}/security-advisories?per_page=100`, { headers }),
    fetch(`https://api.github.com/repos/${owner}/${repo}/issues?state=all&since=${issuesSince}&per_page=100`, { headers }),
  ]);

  if (!repoRes.ok) {
    return { notFound: true };
  }

  const repoData = await repoRes.json();
  const commits = commitsRes.ok ? await commitsRes.json() : [];
  const contributors = contributorsRes.ok ? await contributorsRes.json() : [];
  const readme = readmeRes.ok ? await readmeRes.json() : null;
  const communityProfile = communityRes.ok ? await communityRes.json() : null;
  const latestRelease = releaseRes.ok ? await releaseRes.json() : null;
  const repoAdvisories = advisoriesRes.ok ? await advisoriesRes.json() : null;
  const recentIssues = issuesRes.ok ? await issuesRes.json() : null;

  if (communityProfile && communityProfile.files && !communityProfile.files.security_policy) {
    const found = await findSecurityPolicy(owner, repo, headers);
    if (found) communityProfile.files.security_policy = { source: 'opensoyce_resolver' };
  }

  const { total } = calculateSoyceScore(repoData, commits, contributors, readme, communityProfile, latestRelease, repoAdvisories, recentIssues);
  const score = Number.isFinite(total) ? total : 0;
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#E63322';
  return { score, color };
}

async function getScoreCachedOrFetch(owner, repo) {
  const key = `${owner}/${repo}`;
  const cached = getCachedScore(key);
  if (cached) return cached;

  const inflight = inflightFetches.get(key);
  if (inflight) return inflight;

  const fetchPromise = fetchScoreFromGitHub(owner, repo)
    .then((result) => {
      if (!result.notFound) setCachedScore(key, result);
      return result;
    })
    .finally(() => {
      inflightFetches.delete(key);
    });

  inflightFetches.set(key, fetchPromise);
  return fetchPromise;
}

function renderBadgeSvg(score, color) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="22">` +
      `<rect width="160" height="22" rx="3" fill="#1a1a1a"/>` +
      `<path fill="${color}" d="M110 0h50v22H110z"/>` +
      `<rect width="160" height="22" rx="3" fill="none" stroke="#ffffff" stroke-opacity="0.1"/>` +
      `<g fill="#fff" text-anchor="middle" font-family="ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,liberation mono,courier new,monospace" font-size="9" font-weight="bold">` +
        `<text x="55" y="15" fill="#ffffff" letter-spacing="0.1em">SOYCE SCORE</text>` +
        `<text x="135" y="15" fill="#ffffff" font-size="10">${score.toFixed(1)}</text>` +
      `</g>` +
      `<line x1="110" y1="0" x2="110" y2="22" stroke="#ffffff" stroke-opacity="0.2"/>` +
    `</svg>`
  );
}

export default async function handler(req, res) {
  const match = req.url.match(/\/api\/badge\/([^/]+)\/([^/.?]+)/);
  const owner = match?.[1];
  const repo = match?.[2];
  if (!owner || !repo) return res.status(400).send('Missing owner or repo');
  if (!isValidGithubName(owner) || !isValidGithubName(repo)) {
    return res.status(400).send('Invalid owner or repo');
  }

  try {
    const result = await getScoreCachedOrFetch(owner, repo);
    if (result.notFound) return res.status(404).send('Not found');

    // Aggressive edge caching: browser holds 10 min, Vercel CDN holds 1 hour,
    // and stale content is served for 24 hours while revalidation runs in the
    // background. This is what actually defangs the quota-burn attack — the
    // in-memory layer is just insurance for cold-start bursts to one lambda.
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400');
    res.status(200).send(renderBadgeSvg(result.score, result.color));
  } catch (e) {
    res.status(500).send('Error');
  }
}

// Test-only: lets unit tests reset the per-lambda memo so cases don't bleed
// into each other. Production code never touches these.
export function __resetBadgeCachesForTests() {
  scoreCache.clear();
  inflightFetches.clear();
}
