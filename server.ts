import express from "express";
import rateLimit from "express-rate-limit";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GitHubService } from "./src/server/github.js";
import { calculateSoyceScore } from "./src/shared/scoreCalculator.js";
import { isValidGithubName } from "./src/shared/validateRepo.js";
import { parseNpmLockfile, queryOsvBatch, detectLockfileFormat, buildInventory } from "./src/shared/scanLockfile.js";
import { resolveDepIdentity } from "./src/shared/resolveDepIdentity.js";
import { verdictFor } from "./src/shared/verdict.js";
import { selectHealthCandidates } from "./src/shared/selectHealthCandidates.js";

/**
 * Resolve GitHub identity for each vulnerable package only. We deliberately
 * skip non-vulnerable packages — every entry hits the npm registry, so doing
 * the full dep tree would add 30+ sequential roundtrips for no current product
 * value. Failures default to NONE without breaking the response.
 */
async function attachIdentitiesToVulnerabilities(vulns: any[]): Promise<any[]> {
  if (!Array.isArray(vulns) || vulns.length === 0) return vulns || [];
  const results = await Promise.allSettled(
    vulns.map(v => resolveDepIdentity(v.package, { version: v.version }))
  );
  return vulns.map((v, i) => {
    const r = results[i];
    if (r.status === 'fulfilled' && r.value) {
      const ident = r.value;
      const merged: any = {
        ...v,
        resolvedRepo: ident.resolvedRepo,
        confidence: ident.confidence,
        source: ident.source,
      };
      if (ident.directory) merged.directory = ident.directory;
      return merged;
    }
    return { ...v, resolvedRepo: null, confidence: 'NONE', source: null };
  });
}

/**
 * Bounded-concurrency map. Used by Scanner v2.1a so a 20-vuln scan doesn't
 * fan out 20 GitHub analyses in parallel (each is 8 GH endpoints). Errors are
 * captured per-item so one failing repo never poisons the batch.
 *
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T, idx: number) => Promise<R>} fn
 * @returns {Promise<({ ok: true, value: R } | { ok: false, error: unknown })[]>}
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, idx: number) => Promise<R>,
): Promise<({ ok: true; value: R } | { ok: false; error: unknown })[]> {
  const results: ({ ok: true; value: R } | { ok: false; error: unknown })[] = new Array(items.length);
  let i = 0;
  const workerCount = Math.min(limit, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        const value = await fn(items[idx], idx);
        results[idx] = { ok: true, value };
      } catch (error) {
        results[idx] = { ok: false, error };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

/** Parse "owner/repo" into a tuple. Returns null on malformed input. */
function splitOwnerRepo(slug: string | null | undefined): { owner: string; repo: string } | null {
  if (typeof slug !== 'string') return null;
  const parts = slug.split('/');
  if (parts.length !== 2) return null;
  const [owner, repo] = parts;
  if (!owner || !repo) return null;
  return { owner, repo };
}

/**
 * Scanner v3b -- selective dependency health scoring.
 *
 * Picks up to `budget` non-vulnerable inventory packages, resolves each one's
 * GitHub identity, and (when confidence is HIGH/MEDIUM) calls the cached
 * analyzer to attach a Soyce score + verdict + signals. Per-row try/catch
 * means a single bad analysis can never poison the whole result. The 24h
 * caches inside resolveDepIdentity and getCachedAnalysis carry across scans
 * for free.
 *
 * The "unknown is not a verdict" rule is enforced here: when identity is
 * unresolved we emit status:'IDENTITY_UNRESOLVED' with soyceScore null. We do
 * NOT compute a "missing identity" penalty score.
 */
type SelectedHealthRow = {
  package: string;
  version: string;
  direct: boolean;
  scope: 'prod' | 'dev' | 'optional' | 'unknown';
  primaryReason: string;
  secondaryReasons: string[];
  resolvedRepo: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'NONE';
  soyceScore: number | null;
  verdict: string | null;
  signals: { maintenance: number; security: number; activity: number } | null;
  status: 'SCORED' | 'IDENTITY_UNRESOLVED' | 'SCORE_UNAVAILABLE';
};

async function selectAndScoreHealth(
  inventory: any,
  vulnerablePackageNames: Set<string>,
  getAnalysis: (owner: string, repo: string) => Promise<any>,
): Promise<{ scored: SelectedHealthRow[]; skippedBudget: number; qualifyingTotal: number; budget: number }> {
  const BUDGET = 25;
  const { selected, skippedBudget, qualifyingTotal } = selectHealthCandidates({
    inventory,
    vulnerablePackageNames,
    budget: BUDGET,
  });

  // Concurrency 5 mirrors v2.1a. Each worker resolves identity then (if good)
  // pulls a cached analysis. Per-row outcome is captured in the row's status
  // field, never thrown.
  const outcomes = await mapWithConcurrency(selected, 5, async (cand) => {
    const ident = await resolveDepIdentity(cand.package, { version: cand.version });
    const resolvedRepo = ident && ident.resolvedRepo ? ident.resolvedRepo : null;
    const confidence: 'HIGH' | 'MEDIUM' | 'NONE' = ident && (ident.confidence === 'HIGH' || ident.confidence === 'MEDIUM')
      ? ident.confidence
      : 'NONE';

    if (!resolvedRepo || confidence === 'NONE') {
      return {
        resolvedRepo: null,
        confidence: 'NONE' as const,
        analysis: null,
        analysisFailed: false,
      };
    }
    const parts = splitOwnerRepo(resolvedRepo);
    if (!parts) {
      return { resolvedRepo: null, confidence: 'NONE' as const, analysis: null, analysisFailed: false };
    }
    try {
      const data = await getAnalysis(parts.owner, parts.repo);
      return { resolvedRepo, confidence, analysis: data, analysisFailed: !data };
    } catch {
      return { resolvedRepo, confidence, analysis: null, analysisFailed: true };
    }
  });

  const scored: SelectedHealthRow[] = selected.map((cand, i) => {
    const base: SelectedHealthRow = {
      package: cand.package,
      version: cand.version,
      direct: cand.direct,
      scope: cand.scope,
      primaryReason: cand.primaryReason,
      secondaryReasons: cand.secondaryReasons,
      resolvedRepo: null,
      confidence: 'NONE',
      soyceScore: null,
      verdict: null,
      signals: null,
      status: 'IDENTITY_UNRESOLVED',
    };
    const outcome = outcomes[i];
    if (!outcome || !outcome.ok) {
      // Top-level worker failure -- treat as score unavailable rather than
      // a fake unresolved-identity. We tried, the resolve/analysis path
      // crashed, the user deserves to know.
      base.status = 'SCORE_UNAVAILABLE';
      return base;
    }
    const v = outcome.value;
    base.resolvedRepo = v.resolvedRepo;
    base.confidence = v.confidence;
    if (!v.resolvedRepo || v.confidence === 'NONE') {
      base.status = 'IDENTITY_UNRESOLVED';
      return base;
    }
    if (v.analysisFailed || !v.analysis || typeof v.analysis.total !== 'number' || !v.analysis.breakdown) {
      base.status = 'SCORE_UNAVAILABLE';
      return base;
    }
    base.soyceScore = v.analysis.total;
    base.verdict = verdictFor(v.analysis.total, { earlyBreakout: false });
    base.signals = {
      maintenance: v.analysis.breakdown.maintenance ?? 0,
      security: v.analysis.breakdown.security ?? 0,
      activity: v.analysis.breakdown.activity ?? 0,
    };
    base.status = 'SCORED';
    return base;
  });

  return { scored, skippedBudget, qualifyingTotal, budget: BUDGET };
}

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

    // Resolve identity for the vulnerable packages only. Wrapped so that a
    // resolver crash never poisons the scan response.
    try {
      vulnerabilities = await attachIdentitiesToVulnerabilities(vulnerabilities || []);
    } catch (e) {
      console.error('Identity resolver failure (non-fatal)', e);
      vulnerabilities = (vulnerabilities || []).map(v => ({
        ...v, resolvedRepo: null, confidence: 'NONE', source: null
      }));
    }

    // Scanner v2.1a — attach repo health (Soyce score + verdict + signals) to
    // each HIGH/MEDIUM resolved vuln. Bounded concurrency keeps the GitHub
    // fan-out predictable (5 parallel analyses). Per-vuln errors land in
    // `repoHealthError` rather than failing the response. Non-resolved vulns
    // are marked IDENTITY_NONE so the UI can render a distinct fallback that
    // never reads as "safe".
    try {
      const eligible: { idx: number; owner: string; repo: string }[] = [];
      const enriched: any[] = (vulnerabilities || []).map(v => ({
        ...v,
        repoHealth: null,
        repoHealthError: null,
      }));

      enriched.forEach((v, idx) => {
        const isResolved = (v.confidence === 'HIGH' || v.confidence === 'MEDIUM') && !!v.resolvedRepo;
        if (!isResolved) {
          v.repoHealthError = 'IDENTITY_NONE';
          return;
        }
        const parts = splitOwnerRepo(v.resolvedRepo);
        if (!parts) {
          v.repoHealthError = 'IDENTITY_NONE';
          return;
        }
        eligible.push({ idx, owner: parts.owner, repo: parts.repo });
      });

      const outcomes = await mapWithConcurrency(eligible, 5, async ({ owner, repo }) => {
        return await getCachedAnalysis(owner, repo);
      });

      eligible.forEach((target, i) => {
        const outcome = outcomes[i];
        const v = enriched[target.idx];
        if (!outcome.ok) {
          v.repoHealthError = 'ANALYSIS_FAILED';
          return;
        }
        const data = outcome.value;
        if (!data || typeof data.total !== 'number' || !data.breakdown) {
          v.repoHealthError = 'ANALYSIS_FAILED';
          return;
        }
        v.repoHealth = {
          soyceScore: data.total,
          verdict: verdictFor(data.total, { earlyBreakout: false }),
          signals: {
            maintenance: data.breakdown.maintenance ?? 0,
            security: data.breakdown.security ?? 0,
            activity: data.breakdown.activity ?? 0,
          },
        };
        v.repoHealthError = null;
      });

      vulnerabilities = enriched;
    } catch (e) {
      console.error('Repo health attachment failure (non-fatal)', e);
      vulnerabilities = (vulnerabilities || []).map(v => ({
        ...v,
        repoHealth: null,
        repoHealthError: 'ANALYSIS_FAILED',
      }));
    }

    // Scanner v3a — whole-tree inventory. Purely additive; never fails the
    // scan. We pass the raw text so buildInventory can re-detect the format
    // independently of the existing path.
    let inventory = null;
    let inventoryError = null;
    try {
      inventory = buildInventory(lockfile);
    } catch (e) {
      console.error('Inventory build failure (non-fatal)', e);
      inventory = null;
      inventoryError = 'INVENTORY_FAILED';
    }

    // Scanner v3b -- selective dependency health scoring. Top-25 picker over
    // the non-vulnerable inventory subset. Errors here NEVER fail the scan;
    // the whole block is wrapped and a failure sets selectedHealthError.
    let selectedHealth: any = null;
    let selectedHealthError: string | null = null;
    try {
      if (inventory && Array.isArray((inventory as any).packages)) {
        const vulnerableNames = new Set<string>(
          (vulnerabilities || []).map((v: any) => v.package).filter(Boolean),
        );
        selectedHealth = await selectAndScoreHealth(
          inventory,
          vulnerableNames,
          getCachedAnalysis,
        );
      }
    } catch (e) {
      console.error('Selected health scoring failure (non-fatal)', e);
      selectedHealth = null;
      selectedHealthError = 'SELECTED_HEALTH_FAILED';
    }

    const payload: any = {
      totalDeps: parsed.all.length,
      directDeps: parsed.direct.length,
      vulnerabilities: sortScanVulnerabilities(vulnerabilities || []),
      scannedAt: new Date().toISOString(),
      cacheHit: false,
      inventory,
      selectedHealth,
    };
    if (inventoryError) payload.inventoryError = inventoryError;
    if (selectedHealthError) payload.selectedHealthError = selectedHealthError;
    res.status(200).json(payload);
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
