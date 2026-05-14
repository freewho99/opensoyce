/**
 * Runtime-agnostic GitHub repo analyzer. Both the Vercel function path
 * (api/analyze.js, api/scan.js) and the Express path (server.ts) can call
 * this — Express keeps its own GitHubService + cache layer, this is for the
 * stateless Vercel functions.
 *
 * Returns the same shape calculateSoyceScore returns, with a `repo` block
 * appended so the caller can render owner / avatar / description without a
 * second fetch.
 *
 * Failure modes:
 *   - 404 repo                 → returns null (caller should 404 / mark missing)
 *   - 403 rate limit           → throws Error('RATE_LIMIT_HIT')
 *   - other upstream failure   → throws Error('UPSTREAM_ERROR')
 *
 * @typedef {Object} AnalyzeResult
 * @property {number} total
 * @property {{ maintenance: number, security: number, activity: number, community: number, documentation: number }} breakdown
 * @property {object} meta
 * @property {{ id: number, name: string, owner: string, description: string|null }} repo
 */

import { calculateSoyceScore } from './scoreCalculator.js';
import { findSecurityPolicy } from './securityPolicyResolver.js';

const GH = 'https://api.github.com';

/**
 * @param {string} owner
 * @param {string} repo
 * @param {Record<string,string>} headers
 * @returns {Promise<AnalyzeResult|null>}
 */
export async function analyzeRepo(owner, repo, headers) {
  const issuesSince = new Date(Date.now() - 90 * 86400000).toISOString();
  const [repoRes, commitsRes, contributorsRes, readmeRes, communityRes, releaseRes, advisoriesRes, issuesRes] = await Promise.all([
    fetch(`${GH}/repos/${owner}/${repo}`, { headers }),
    fetch(`${GH}/repos/${owner}/${repo}/commits?per_page=30`, { headers }),
    fetch(`${GH}/repos/${owner}/${repo}/contributors?per_page=30`, { headers }),
    fetch(`${GH}/repos/${owner}/${repo}/readme`, { headers }),
    fetch(`${GH}/repos/${owner}/${repo}/community/profile`, { headers }),
    fetch(`${GH}/repos/${owner}/${repo}/releases/latest`, { headers }),
    fetch(`${GH}/repos/${owner}/${repo}/security-advisories?per_page=100`, { headers }),
    fetch(`${GH}/repos/${owner}/${repo}/issues?state=all&since=${issuesSince}&per_page=100`, { headers }),
  ]);

  if (repoRes.status === 404) return null;
  if (repoRes.status === 403 && repoRes.headers.get('x-ratelimit-remaining') === '0') {
    throw new Error('RATE_LIMIT_HIT');
  }
  if (!repoRes.ok) {
    throw new Error('UPSTREAM_ERROR');
  }

  const repoData = await repoRes.json();
  const commits = commitsRes.ok ? await commitsRes.json() : [];
  const contributors = contributorsRes.ok ? await contributorsRes.json() : [];
  const readme = readmeRes.ok ? await readmeRes.json() : null;
  const communityProfile = communityRes.ok ? await communityRes.json() : null;
  const latestRelease = releaseRes.ok ? await releaseRes.json() : null;
  const repoAdvisories = advisoriesRes.ok ? await advisoriesRes.json() : null;
  const recentIssues = issuesRes.ok ? await issuesRes.json() : null;

  // SECURITY.md resolver fallback when /community/profile under-reports.
  if (communityProfile && communityProfile.files && !communityProfile.files.security_policy) {
    const found = await findSecurityPolicy(owner, repo, headers);
    if (found) communityProfile.files.security_policy = { source: 'opensoyce_resolver' };
  }

  const scoreResult = calculateSoyceScore(repoData, commits, contributors, readme, communityProfile, latestRelease, repoAdvisories, recentIssues);
  return {
    ...scoreResult,
    repo: {
      id: repoData.id,
      name: repoData.name,
      owner: repoData.owner.login,
      description: repoData.description,
    },
  };
}

/** Build the standard GitHub request headers, honoring GITHUB_TOKEN if set. */
export function githubHeaders(token) {
  /** @type {Record<string,string>} */
  const h = {
    'User-Agent': 'opensoyce',
    'Accept': 'application/vnd.github+json',
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}
