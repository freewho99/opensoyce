import { calculateSoyceScore } from '../src/shared/scoreCalculator.js';
import { isValidGithubName } from '../src/shared/validateRepo.js';

export default async function handler(req, res) {
  const parts = req.url.replace('/api/github/', '').split('/');
  const owner = parts[0];
  const repo = parts[1]?.split('?')[0];
  if (!owner || !repo) return res.status(400).json({ error: 'Missing owner or repo' });
  if (!isValidGithubName(owner) || !isValidGithubName(repo)) {
    return res.status(400).json({ error: 'INVALID_OWNER_OR_REPO' });
  }

  const token = process.env.GITHUB_TOKEN;
  const headers = {
    'User-Agent': 'opensoyce',
    'Accept': 'application/vnd.github+json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
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

    // Map GitHub error responses to a small client-facing enum instead of
    // leaking upstream messages verbatim.
    if (repoRes.status === 404) {
      return res.status(404).json({ error: 'REPO_NOT_FOUND' });
    }
    if (repoRes.status === 403 && repoRes.headers.get('x-ratelimit-remaining') === '0') {
      return res.status(429).json({ error: 'RATE_LIMIT_HIT' });
    }
    if (!repoRes.ok) {
      console.error('Upstream GitHub error', repoRes.status, await repoRes.text().catch(() => '(no body)'));
      return res.status(502).json({ error: 'UPSTREAM_ERROR' });
    }
    const repoData = await repoRes.json();

    const commits = commitsRes.ok ? await commitsRes.json() : [];
    const contributors = contributorsRes.ok ? await contributorsRes.json() : [];
    const readme = readmeRes.ok ? await readmeRes.json() : null;
    const communityProfile = communityRes.ok ? await communityRes.json() : null;
    const latestRelease = releaseRes.ok ? await releaseRes.json() : null;
    const repoAdvisories = advisoriesRes.ok ? await advisoriesRes.json() : null;
    const recentIssues = issuesRes.ok ? await issuesRes.json() : null;

    const { total, breakdown } = calculateSoyceScore(repoData, commits, contributors, readme, communityProfile, latestRelease, repoAdvisories, recentIssues);

    res.status(200).json({
      name: repoData.name,
      owner: repoData.owner.login,
      description: repoData.description,
      stars: repoData.stargazers_count,
      forks: repoData.forks_count,
      lastScanned: 'Just now',
      techStack: repoData.topics || [],
      license: repoData.license?.spdx_id || 'No License',
      score: {
        overall: total,
        maintenance: parseFloat((breakdown.maintenance / 3.0 * 100).toFixed(1)),
        security: parseFloat((breakdown.security / 2.0 * 100).toFixed(1)),
        community: parseFloat((breakdown.community / 2.5 * 100).toFixed(1)),
        documentation: parseFloat((breakdown.documentation / 1.5 * 100).toFixed(1)),
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
