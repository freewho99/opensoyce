/**
 * Vercel scan handler. Thin wrapper over the shared runScan pipeline; the
 * Vercel-specific bits are: per-request analysis memo (no cross-request cache
 * on stateless functions), GITHUB_TOKEN injection, and HTTP status mapping.
 *
 * Pipeline logic lives in src/shared/runScan.js — DO NOT add scan logic here.
 */

import { analyzeRepo, githubHeaders } from '../src/shared/analyzeRepo.js';
import { resolveDepIdentity } from '../src/shared/resolveDepIdentity.js';
import { runScan, mapWithConcurrency } from '../src/shared/runScan.js';
import { signReport } from '../src/shared/reportSigning.js';

/**
 * Per-request analysis memo. Vercel functions are stateless across requests
 * so we get no cross-request caching here, but a single scan can ref the same
 * repo multiple times (e.g. two advisories on lodash) — memo keeps that to
 * one analysis call.
 */
function makeAnalysisMemo(headers) {
  const cache = new Map();
  return async function getAnalysis(owner, repo) {
    const key = `${owner}/${repo}`;
    if (cache.has(key)) return cache.get(key);
    const p = analyzeRepo(owner, repo, headers);
    cache.set(key, p);
    return p;
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { lockfile } = req.body || {};
  if (typeof lockfile !== 'string') {
    return res.status(400).json({ error: 'UNPARSEABLE_LOCKFILE' });
  }
  // 5MB business cap. Stays at the route layer, NOT inside runScan.
  if (lockfile.length > 5_000_000) {
    return res.status(413).json({ error: 'TOO_LARGE' });
  }

  const headers = githubHeaders(process.env.GITHUB_TOKEN);
  const getAnalysis = makeAnalysisMemo(headers);

  try {
    const result = await runScan({
      lockfileText: lockfile,
      filename: 'package-lock.json',
      deps: {
        getAnalysis,
        resolveIdentity: (name, opts) => resolveDepIdentity(name, opts || {}),
        mapWithConcurrency,
      },
    });
    if (result.osvError) {
      return res.status(503).json({ error: 'OSV_UNAVAILABLE' });
    }
    // Opt-in signing for HTTP responses that will be embedded elsewhere.
    // Default unsigned (backward compat; TLS already covers the transient
    // channel). Caller asks for a signed response via `?signed=1`.
    const wantsSigned = req.query && (req.query.signed === '1' || req.query.signed === 'true');
    const signingKey = process.env.OPENSOYCE_SIGNING_PRIVATE_KEY;
    if (wantsSigned && signingKey && signingKey.trim()) {
      try {
        const signed = signReport(result, {
          privateKeyPem: signingKey,
          publicKeyPem: process.env.OPENSOYCE_SIGNING_PUBLIC_KEY,
          location: 'top-level',
        });
        return res.status(200).json(signed);
      } catch (e) {
        // Signing failure is operator-side; return the unsigned result with
        // a header so the caller can detect the degradation.
        res.setHeader('X-OpenSoyce-Signing-Error', String(e.message || e).slice(0, 200));
        return res.status(200).json(result);
      }
    }
    return res.status(200).json(result);
  } catch (err) {
    const code = err && err.scanError ? err.code : null;
    if (code === 'PACKAGE_JSON_NOT_SUPPORTED') return res.status(400).json({ error: 'PACKAGE_JSON_NOT_SUPPORTED' });
    if (code === 'YARN_COMING_SOON') return res.status(400).json({ error: 'YARN_COMING_SOON' });
    if (code === 'UNPARSEABLE_LOCKFILE') return res.status(400).json({ error: 'UNPARSEABLE_LOCKFILE' });
    console.error('Scan failure', err);
    if (err && err.message === 'RATE_LIMIT_HIT') return res.status(429).json({ error: 'RATE_LIMIT_HIT' });
    return res.status(500).json({ error: 'UPSTREAM_ERROR' });
  }
}
