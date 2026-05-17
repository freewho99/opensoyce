import { isValidGithubName } from '../src/shared/validateRepo.js';
import { analyzeRepo, githubHeaders } from '../src/shared/analyzeRepo.js';
import { signReport } from '../src/shared/reportSigning.js';

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
    // Opt-in signing via `?signed=1` (same pattern as /api/scan). Default
    // unsigned for backward compat.
    const wantsSigned = req.query && (req.query.signed === '1' || req.query.signed === 'true');
    const signingKey = process.env.OPENSOYCE_SIGNING_PRIVATE_KEY;
    if (wantsSigned && signingKey && signingKey.trim()) {
      try {
        const signed = signReport(data, {
          privateKeyPem: signingKey,
          publicKeyPem: process.env.OPENSOYCE_SIGNING_PUBLIC_KEY,
          location: 'top-level',
        });
        return res.status(200).json(signed);
      } catch (e) {
        res.setHeader('X-OpenSoyce-Signing-Error', String(e.message || e).slice(0, 200));
        return res.status(200).json(data);
      }
    }
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
