import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GitHubService } from "./src/server/github.js";
import { calculateSoyceScore } from "./src/shared/scoreCalculator.js";
import { isValidGithubName } from "./src/shared/validateRepo.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware for parsing JSON
  app.use(express.json());

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

    const [repoData, commits, contributors, readme] = await Promise.all([
      gh.getRepo(owner, repo),
      gh.getCommits(owner, repo),
      gh.getContributors(owner, repo),
      gh.getReadme(owner, repo)
    ]);
    if (!repoData) return null;

    const scoreResult = calculateSoyceScore(repoData, commits || [], contributors || [], readme);
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

  app.post("/api/analyze", async (req, res) => {
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

  app.get("/api/badge/:owner/:repo.svg", async (req, res) => {
    const { owner, repo } = req.params;
    if (!isValidGithubName(owner) || !isValidGithubName(repo)) {
      return res.status(400).send('Invalid owner or repo');
    }
    try {
      const data = await getCachedAnalysis(owner, repo);
      if (!data) return res.status(404).send('Not found');

      const score = data.total ?? 0;
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
  app.get("/api/github/:owner/:repo", async (req, res) => {
    const { owner, repo } = req.params;
    if (!isValidGithubName(owner) || !isValidGithubName(repo)) {
      return res.status(400).json({ error: 'INVALID_OWNER_OR_REPO' });
    }
    try {
      const data = await getCachedAnalysis(owner, repo);
      if (!data) return res.status(404).json({ error: 'Not found' });

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
