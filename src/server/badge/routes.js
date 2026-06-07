// Express handler wiring for the Trust Badge routes.
//
// Routes registered (per PR-B1 sub-sketch §1.1):
//   GET /badge/:owner/:repo/posture.svg
//   GET /badge/:owner/:repo/posture.json
//
// No third route family, no query-string customization, no variants.
// Both routes share posture resolution and cache headers.

import { isValidGithubName } from '../../shared/validateRepo.js';
import {
  resolvePosture,
  renderBadgeSvg,
  postureEtag,
  buildBadgeJson,
} from './renderer.js';

const CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=3600';

function send400(res, error, message) {
  return res.status(400).json({ error, message });
}

export function registerTrustBadgeRoutes(app) {
  app.get('/badge/:owner/:repo/posture.svg', (req, res) => {
    const { owner, repo } = req.params;
    if (!isValidGithubName(owner)) {
      return send400(res, 'BAD_OWNER', 'Owner must match GitHub username rules.');
    }
    if (!isValidGithubName(repo)) {
      return send400(res, 'BAD_REPO', 'Repo must match GitHub repository name rules.');
    }
    const data = resolvePosture(owner, repo);
    const etag = postureEtag(owner, repo, data);
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', CACHE_CONTROL);
    res.setHeader('ETag', etag);
    res.setHeader('X-OpenSoyce-Posture-Source', data.source);
    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }
    return res.status(200).send(renderBadgeSvg(data));
  });

  app.get('/badge/:owner/:repo/posture.json', (req, res) => {
    const { owner, repo } = req.params;
    if (!isValidGithubName(owner)) {
      return send400(res, 'BAD_OWNER', 'Owner must match GitHub username rules.');
    }
    if (!isValidGithubName(repo)) {
      return send400(res, 'BAD_REPO', 'Repo must match GitHub repository name rules.');
    }
    const data = resolvePosture(owner, repo);
    const etag = postureEtag(owner, repo, data);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', CACHE_CONTROL);
    res.setHeader('ETag', etag);
    res.setHeader('X-OpenSoyce-Posture-Source', data.source);
    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }
    return res.status(200).json(buildBadgeJson(owner, repo, data));
  });
}
