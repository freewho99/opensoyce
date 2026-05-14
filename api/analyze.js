import { isValidGithubName } from '../src/shared/validateRepo.js';
import { analyzeRepo, githubHeaders } from '../src/shared/analyzeRepo.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { owner, repo } = req.body || {};
  if (!owner || !repo) return res.status(400).json({ error: 'Owner and repo are required' });
  if (!isValidGithubName(owner) || !isValidGithubName(repo)) {
    return res.status(400).json({ error: 'INVALID_OWNER_OR_REPO' });
  }

  const headers = githubHeaders(process.env.GITHUB_TOKEN);
  try {
    const data = await analyzeRepo(owner, repo, headers);
    if (!data) return res.status(404).json({ error: 'REPO_NOT_FOUND' });
    res.status(200).json(data);
  } catch (e) {
    if (e && e.message === 'RATE_LIMIT_HIT') {
      return res.status(429).json({ error: 'RATE_LIMIT_HIT' });
    }
    if (e && e.message === 'UPSTREAM_ERROR') {
      return res.status(502).json({ error: 'UPSTREAM_ERROR' });
    }
    res.status(500).json({ error: e.message });
  }
}
