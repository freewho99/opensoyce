import express from "express";
import rateLimit from "express-rate-limit";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GitHubService } from "./src/server/github.js";
import { calculateSoyceScore } from "./src/shared/scoreCalculator.js";
import { isValidGithubName } from "./src/shared/validateRepo.js";
import { parseNpmLockfile, queryOsvBatch, detectLockfileFormat } from "./src/shared/scanLockfile.js";

// Severity tiering for /api/scan response sort. Lower index = higher severity.
const SCAN_SEVERITY_ORDER = ['critical', 'high', 'medium', 'moderate', 'low', 'unknown'];
function scanSeverityRank(sev: string | undefined): number {
  const key = (sev || 'unknown').toLowerCase();
  const normalized = key === 'moderate' ? 'medium' : key;
  const idx = SCAN_SEVERITY_ORDER.indexOf(normalized);
  return idx === -1 ? SCAN_SEVERITY_ORDER.length : idx;
}
function sortScanVulnerabilities(vulns: any[]): any[] {
  return [...vulns].sort((a, b) => {
    const sa = scanSeverityRank(a.severity);
    const sb = scanSeverityRank(b.severity);
    if (sa !== sb) return sa - sb;
    const na = (a.package || a.name || '').toLowerCase();
    const nb = (b.package || b.name || '').toLowerCase();
    return na.localeCompare(nb);
  });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware for parsing JSON. Default 100KB is too small for /api/scan
  // which accepts package-lock.json paste (typical real lockfiles are
  // 100KB–2MB). 6MB ceiling here lets the route handler's own 5MB business
  // check actually fire — without this bump, Express would 413 first and
  // the route would never see the body.
  app.use(express.json({ limit: '6mb' }));

  // Per-IP rate limit on the three scoring routes (the only ones that hit
  // GitHub). 30 requests/minute is generous for human use, cheap for abuse.
  // Health/config/search endpoints are not rate-limited.
  const scoringLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'RATE_LIMIT_HIT_LOCAL' },
  });

  const gh = new GitHubService();

  // Simple in-memory cache with TTL and a FIFO size cap.
  const cache = new Map<string, { data: any, timestamp: number }>();
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  const CACHE_MAX_ENTRIES = 200;

  function cacheGet(key: string) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp >= CACHE_TTL) {
      cache.delete(key);
      return null;
    }
    // Bump-on-read: move this entry to the end of the iteration order so
    // FIFO eviction in cacheSet evicts genuinely-cold entries, not hot ones.
    cache.delete(key);
    cache.set(key, entry);
    return entry.data;
  }

  function cacheSet(key: string, data: any) {
    cache.set(key, { data, timestamp: Date.now() });
    while (cache.size > CACHE_MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  }

  async function getCachedAnalysis(owner: string, repo: string) {
    const key = `analyze:${owner}/${repo}`;
    const hit = cacheGet(key);
    if (hit) return hit;

    const [repoData, commits, contributors, readme, communityProfile, latestRelease, repoAdvisories, recentIssues] = await Promise.all([
      gh.getRepo(owner, repo),
      gh.getCommits(owner, repo),
      gh.getContributors(owner, repo),
      gh.getReadme(owner, repo),
      gh.getCommunityProfile(owner, repo),
      gh.getLatestRelease(owner, repo),
      gh.getRepoAdvisories(owner, repo),
      gh.getRecentIssues(owner, repo)
    ]);
    if (!repoData) return null;

    // SECURITY.md resolver: community/profile is known to under-report
    // (facebook/react has SECURITY.md at root but the endpoint returns null).
    // Only fall back when the community profile says no policy; mutate the
    // profile in place so the scorer doesn't need a new parameter.
    if (communityProfile && communityProfile.files && !communityProfile.files.security_policy) {
      const found = await gh.findSecurityPolicy(owner, repo);
      if (found) {
        communityProfile.files.security_policy = { source: 'opensoyce_resolver' };
      }
    }

    const scoreResult = calculateSoyceScore(repoData, commits || [], contributors || [], readme, communityProfile, latestRelease, repoAdvisories, recentIssues);
    const data = {
      ...scoreResult,
      repo: {
        name: repoData.name,
        description: repoData.description,
        url: repoData.html_url,
        owner: repoData.owner.login,
        avatar: repoData.owner.avatar_url,
        id: repoData.id.toString()
      }
    };
    cacheSet(key, data);
    return data;
  }

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "OpenSoyce API is running" });
  });

  app.get("/api/config", (req, res) => {
    res.json({
      hasGithubToken: !!process.env.GITHUB_TOKEN
    });
  });

  app.post("/api/analyze", scoringLimiter, async (req, res) => {
    const { owner, repo } = req.body;
    if (!owner || !repo) {
      return res.status(400).json({ error: 'Owner and repo are required' });
    }
    if (!isValidGithubName(owner) || !isValidGithubName(repo)) {
      return res.status(400).json({ error: 'INVALID_OWNER_OR_REPO' });
    }

    try {
      const data = await getCachedAnalysis(owner, repo);
      if (!data) return res.status(404).json({ error: 'REPO_NOT_FOUND' });
      res.json(data);
    } catch (error: any) {
      console.error('Analysis Error:', error);
      if (error.message === 'RATE_LIMIT_HIT') {
        return res.status(429).json({ error: 'RATE_LIMIT_HIT' });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/scan", scoringLimiter, async (req, res) => {
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
      vulnerabilities: sortScanVulnerabilities(vulnerabilities || []),
      scannedAt: new Date().toISOString(),
      cacheHit: false,
    });
  });

  app.get("/api/search", async (req, res) => {
    const query = req.query.q as string;
    if (!query) return res.json({ items: [] });

    try {
      const results = await gh.searchRepos(query);
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/badge/:owner/:repo.svg", scoringLimiter, async (req, res) => {
    const { owner, repo } = req.params;
    if (!isValidGithubName(owner) || !isValidGithubName(repo)) {
      return res.status(400).send('Invalid owner or repo');
    }
    try {
      const data = await getCachedAnalysis(owner, repo);
      if (!data) return res.status(404).send('Not found');

      const score = Number.isFinite(data.total) ? data.total : 0;
      const color = score >= 8 ? '#22c55e' : score >= 6 ? '#f59e0b' : '#E63322';
      
      res.setHeader('Content-Type', 'image/svg+xml');
      res.send(`
        <svg xmlns="http://www.w3.org/2000/svg" width="160" height="22">
          <rect width="160" height="22" rx="3" fill="#1a1a1a"/>
          <path fill="${color}" d="M110 0h50v22H110z"/>
          <rect width="160" height="22" rx="3" fill="none" stroke="#ffffff" stroke-opacity="0.1"/>
          <g fill="#fff" text-anchor="middle" font-family="ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,liberation mono,courier new,monospace" font-size="9" font-weight="bold">
            <text x="55" y="15" fill="#ffffff" letter-spacing="0.1em">SOYCE SCORE</text>
            <text x="135" y="15" fill="#ffffff" font-size="10">${(score || 0).toFixed(1)}</text>
          </g>
          <line x1="110" y1="0" x2="110" y2="22" stroke="#ffffff" stroke-opacity="0.2"/>
        </svg>
      `);
    } catch (e) {
      res.status(404).send('Not found');
    }
  });

  // Legacy endpoint for backward compatibility. Returns a percentage-scaled
  // shape distinct from /api/analyze; always derived from the same cached
  // analysis, so the response shape no longer depends on cache state.
  app.get("/api/github/:owner/:repo", scoringLimiter, async (req, res) => {
    const { owner, repo } = req.params;
    if (!isValidGithubName(owner) || !isValidGithubName(repo)) {
      return res.status(400).json({ error: 'INVALID_OWNER_OR_REPO' });
    }
    try {
      const data = await getCachedAnalysis(owner, repo);
      if (!data) return res.status(404).json({ error: 'REPO_NOT_FOUND' });

      const { breakdown, meta, total, repo: repoBlock } = data;
      res.json({
        total,
        breakdown,
        meta,
        name: repoBlock.name,
        owner: repoBlock.owner,
        description: repoBlock.description,
        stars: meta.totalStars,
        forks: meta.totalForks,
        score: {
          overall: total,
          maintenance: (breakdown.maintenance / 3.0) * 100,
          security: (breakdown.security / 2.0) * 100,
          community: (breakdown.community / 2.5) * 100,
          documentation: (breakdown.documentation / 1.5) * 100,
        },
        techStack: meta.topics,
        license: meta.license,
        lastScanned: 'Just now'
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve static files from dist
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`OpenSoyce server running on http://localhost:${PORT}`);
  });
}

startServer();
