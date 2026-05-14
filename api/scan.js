import { parseNpmLockfile, queryOsvBatch, detectLockfileFormat } from '../src/shared/scanLockfile.js';

// Severity tiering for response sort. Lower index = higher severity.
const SEVERITY_ORDER = ['critical', 'high', 'medium', 'moderate', 'low', 'unknown'];

function severityRank(sev) {
  const key = (sev || 'unknown').toLowerCase();
  // Treat 'moderate' (GH/OSV synonym) as 'medium'.
  const normalized = key === 'moderate' ? 'medium' : key;
  const idx = SEVERITY_ORDER.indexOf(normalized);
  return idx === -1 ? SEVERITY_ORDER.length : idx;
}

function sortVulnerabilities(vulns) {
  return [...vulns].sort((a, b) => {
    const sa = severityRank(a.severity);
    const sb = severityRank(b.severity);
    if (sa !== sb) return sa - sb;
    const na = (a.package || a.name || '').toLowerCase();
    const nb = (b.package || b.name || '').toLowerCase();
    return na.localeCompare(nb);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { lockfile } = req.body || {};
  if (typeof lockfile !== 'string') {
    return res.status(400).json({ error: 'UNPARSEABLE_LOCKFILE' });
  }
  if (lockfile.length > 5_000_000) {
    return res.status(413).json({ error: 'TOO_LARGE' });
  }

  const format = detectLockfileFormat(lockfile);
  if (format === 'package-json') {
    return res.status(400).json({ error: 'PACKAGE_JSON_NOT_SUPPORTED' });
  }
  if (format === 'yarn-v1' || format === 'yarn-v2') {
    return res.status(400).json({ error: 'YARN_COMING_SOON' });
  }
  if (format === 'unknown' || format === undefined || format === null) {
    return res.status(400).json({ error: 'UNPARSEABLE_LOCKFILE' });
  }

  let parsed;
  try {
    parsed = parseNpmLockfile(lockfile);
  } catch (e) {
    return res.status(400).json({ error: 'UNPARSEABLE_LOCKFILE' });
  }

  let vulnerabilities;
  try {
    vulnerabilities = await queryOsvBatch(parsed.all);
  } catch (e) {
    console.error('OSV failure', e);
    return res.status(503).json({ error: 'OSV_UNAVAILABLE' });
  }

  res.status(200).json({
    totalDeps: parsed.all.length,
    directDeps: parsed.direct.length,
    vulnerabilities: sortVulnerabilities(vulnerabilities || []),
    scannedAt: new Date().toISOString(),
    cacheHit: false,
  });
}
