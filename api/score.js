export default async function handler(req, res) {
  const { repo } = req.query;
  if (!repo) return res.status(400).json({ error: 'Missing repo param' });
  const token = process.env.GITHUB_TOKEN;
  const headers = { Authorization: `Bearer ${token}`, 'User-Agent': 'opensoyce' };
  const [repoRes] = await Promise.all([
    fetch(`https://api.github.com/repos/${repo}`, { headers }),
  ]);
  const data = await repoRes.json();
  if (data.message) return res.status(404).json({ error: data.message });
  const daysSincePush = (Date.now() - new Date(data.pushed_at)) / 86400000;
  const momentum = Math.max(0, 100 - daysSincePush * 2);
  const health = Math.min(100, Math.max(0, (data.stargazers_count / 100) + (data.forks_count / 20) - (data.open_issues_count / 10)));
  const forkability = Math.min(100, data.forks_count / 5);
  const adoption = Math.min(100, data.stargazers_count / 50);
  res.status(200).json({
    repo, stars: data.stargazers_count, forks: data.forks_count, issues: data.open_issues_count, lastPush: data.pushed_at,
    scores: { health: Math.round(health), forkability: Math.round(forkability), momentum: Math.round(momentum), adoption: Math.round(adoption), overall: Math.round((health + forkability + momentum + adoption) / 4) }
  });
}
