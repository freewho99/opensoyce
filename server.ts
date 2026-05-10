import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GitHubService } from "./src/server/github.js";
import { calculateSoyceScore } from "./src/server/scoreCalculator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware for parsing JSON
  app.use(express.json());

  const gh = new GitHubService();

  // Simple in-memory cache
  const cache = new Map<string, { data: any, timestamp: number }>();
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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

    const cacheKey = `analyze:${owner}/${repo}`;
    if (cache.has(cacheKey)) {
      const cached = cache.get(cacheKey)!;
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        return res.json(cached.data);
      }
    }

    try {
      const [repoData, commits, contributors, issues] = await Promise.all([
        gh.getRepo(owner, repo),
        gh.getCommits(owner, repo),
        gh.getContributors(owner, repo),
        gh.getIssues(owner, repo)
      ]);

      if (!repoData) {
        return res.status(404).json({ error: 'REPO_NOT_FOUND' });
      }

      const scoreResult = calculateSoyceScore(repoData, commits || [], contributors || [], issues || []);
      
      const responseData = {
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

      cache.set(cacheKey, { data: responseData, timestamp: Date.now() });
      res.json(responseData);
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
    try {
      const cacheKey = `analyze:${owner}/${repo}`;
      let data;
      
      if (cache.has(cacheKey)) {
        data = cache.get(cacheKey)!.data;
      } else {
        const [repoData, commits, contributors, issues] = await Promise.all([
          gh.getRepo(owner, repo),
          gh.getCommits(owner, repo),
          gh.getContributors(owner, repo),
          gh.getIssues(owner, repo)
        ]);
        if (!repoData) throw new Error('Not found');
        data = calculateSoyceScore(repoData, commits || [], contributors || [], issues || []);
      }

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

  // Legacy endpoint for backward compatibility (optional but good to keep or update)
  app.get("/api/github/:owner/:repo", async (req, res) => {
    const { owner, repo } = req.params;
    // Just proxy to analyze logic for now
    req.body = { owner, repo };
    // Reuse analyze logic
    const cacheKey = `analyze:${owner}/${repo}`;
    if (cache.has(cacheKey)) {
        res.json(cache.get(cacheKey)!.data);
    } else {
        // Simple redirect or re-implementation
        try {
            const [repoData, commits, contributors, issues] = await Promise.all([
                gh.getRepo(owner, repo),
                gh.getCommits(owner, repo),
                gh.getContributors(owner, repo),
                gh.getIssues(owner, repo)
            ]);
            if (!repoData) return res.status(404).json({ error: 'Not found' });
            const scoreResult = calculateSoyceScore(repoData, commits || [], contributors || [], issues || []);
            res.json({
                ...scoreResult,
                // Map to old project structure if needed
                name: repoData.name,
                owner: repoData.owner.login,
                description: repoData.description,
                stars: repoData.stargazers_count,
                forks: repoData.forks_count,
                score: {
                    overall: scoreResult.total,
                    maintenance: scoreResult.breakdown.maintenance * 33.3, // scale to 100 for old UI
                    security: scoreResult.breakdown.security * 50,
                    community: scoreResult.breakdown.community * 40,
                    documentation: scoreResult.breakdown.documentation * 66.6
                },
                techStack: repoData.topics || [],
                license: repoData.license ? repoData.license.spdx_id : 'No License',
                lastScanned: 'Just now'
            });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
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
