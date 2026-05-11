import { calculateSoyceScore } from '../src/shared/scoreCalculator.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { owner, repo } = req.body || {};
  if (!owner || !repo) return res.status(400).json({ error: 'Owner and repo are required' });

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
    if (repoData.message === 'Not Found') return res.status(404).json({ error: 'REPO_NOT_FOUND' });
    if (repoData.message) return res.status(500).json({ error: repoData.message });

    const commits = commitsRes.ok ? await commitsRes.json() : [];
    const contributors = contributorsRes.ok ? await contributorsRes.json() : [];

    const scoreResult = calculateSoyceScore(repoData, commits, contributors);

    res.status(200).json({
      ...scoreResult,
      repo: {
        id: repoData.id,
        name: repoData.name,
        owner: repoData.owner.login,
        description: repoData.description,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
