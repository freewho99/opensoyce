import { calculateSoyceScore } from '../src/shared/scoreCalculator.js';
import { isValidGithubName } from '../src/shared/validateRepo.js';

export default async function handler(req, res) {
  const match = req.url.match(/\/api\/badge\/([^/]+)\/([^/.?]+)/);
  const owner = match?.[1];
  const repo = match?.[2];
  if (!owner || !repo) return res.status(400).send('Missing owner or repo');
  if (!isValidGithubName(owner) || !isValidGithubName(repo)) {
    return res.status(400).send('Invalid owner or repo');
  }

  const token = process.env.GITHUB_TOKEN;
  const headers = {
    'User-Agent': 'opensoyce',
    'Accept': 'application/vnd.github+json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const [repoRes, commitsRes, contributorsRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers }),
      fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=30`, { headers }),
      fetch(`https://api.github.com/repos/${owner}/${repo}/contributors?per_page=30`, { headers }),
    ]);

    if (!repoRes.ok) return res.status(404).send('Not found');

    const repoData = await repoRes.json();
    const commits = commitsRes.ok ? await commitsRes.json() : [];
    const contributors = contributorsRes.ok ? await contributorsRes.json() : [];

    const { total } = calculateSoyceScore(repoData, commits, contributors);
    const score = total ?? 0;
    const color = score >= 8 ? '#22c55e' : score >= 6 ? '#f59e0b' : '#E63322';

    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    res.status(200).send(
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
  } catch (e) {
    res.status(500).send('Error');
  }
}
