import { calculateSoyceScore } from '../src/shared/scoreCalculator.js';

export default async function handler(req, res) {
  const parts = req.url.replace('/api/github/', '').split('/');
  const owner = parts[0];
  const repo = parts[1]?.split('?')[0];
  if (!owner || !repo) return res.status(400).json({ error: 'Missing owner or repo' });

  const token = process.env.GITHUB_TOKEN;
  const headers = {
    Authorization: `Bearer ${token}`,
    'User-Agent': 'opensoyce',
    'Accept': 'application/vnd.github+json',
  };

  try {
    const [repoRes, commitsRes, contributorsRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers }),
      fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=30`, { headers }),
      fetch(`https://api.github.com/repos/${owner}/${repo}/contributors?per_page=30`, { headers }),
    ]);

    const repoData = await repoRes.json();
    if (repoData.message) return res.status(404).json({ error: repoData.message });

    const commits = commitsRes.ok ? await commitsRes.json() : [];
    const contributors = contributorsRes.ok ? await contributorsRes.json() : [];

    const { total, breakdown } = calculateSoyceScore(repoData, commits, contributors);

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
