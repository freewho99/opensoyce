export default async function handler(req, res) {
  const { owner, repo } = req.query;
  const token = process.env.GITHUB_TOKEN;
  const headers = { Authorization: `Bearer ${token}`, 'User-Agent': 'opensoyce', 'Accept': 'application/vnd.github+json' };

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
    const now = new Date();
    const lastCommitDate = commits.length > 0 ? new Date(commits[0].commit.author.date) : new Date(repoData.pushed_at);
    const diffDays = Math.floor((now - lastCommitDate) / 86400000);

    let maintenance = diffDays <= 7 ? 3.0 : diffDays <= 30 ? 2.5 : diffDays <= 90 ? 1.5 : diffDays <= 365 ? 0.8 : 0.2;
    const stars = repoData.stargazers_count || 0;
    let community = Math.min(1.5, (Math.log10(stars + 1) / Math.log10(100000)) * 1.5);
    const contributorCount = Array.isArray(contributors) ? contributors.length : 0;
    if (contributorCount >= 10) community += 0.5; else if (contributorCount >= 5) community += 0.3; else if (contributorCount >= 2) community += 0.1;
    if (repoData.forks_count >= 1000) community += 0.5;
    community = Math.min(2.5, community);

    const openIssues = repoData.open_issues_count || 0;
    let security = 0;
    if (repoData.license) security += 0.5;
    const lic = repoData.license?.spdx_id?.toUpperCase() || '';
    if (['MIT','APACHE-2.0','BSD-2-CLAUSE','BSD-3-CLAUSE'].includes(lic)) security += 0.5;
    if (openIssues < 20) security += 0.5; else if (openIssues < 100) security += 0.3;
    if ((repoData.topics?.length > 0) || repoData.description) security += 0.5;
    security = Math.min(2.0, security);

    let documentation = 0;
    if (repoData.description) documentation += 0.5;
    if (repoData.topics?.length >= 3) documentation += 0.5;
    if (repoData.homepage) documentation += 0.5;
    documentation = Math.min(1.5, documentation);

    const last30 = Array.isArray(commits) ? commits.filter(c => (now - new Date(c.commit.author.date)) / 86400000 <= 30).length : 0;
    const activity = last30 >= 10 ? 1.0 : last30 >= 5 ? 0.7 : last30 >= 1 ? 0.4 : 0.1;
    const total = parseFloat((maintenance + community + security + documentation + activity).toFixed(1));

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
        maintenance: parseFloat((maintenance / 3.0 * 100).toFixed(1)),
        security: parseFloat((security / 2.0 * 100).toFixed(1)),
        community: parseFloat((community / 2.5 * 100).toFixed(1)),
        documentation: parseFloat((documentation / 1.5 * 100).toFixed(1)),
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
