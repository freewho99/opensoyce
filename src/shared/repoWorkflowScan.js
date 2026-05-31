/**
 * OpenSoyce — on-demand repository workflow scanner.
 *
 * Bridges PR #15's `parseWorkflowForOtsSignals` parser to a real
 * GitHub repository. For a given (owner, repo) this:
 *
 *   1. Lists files under `.github/workflows/` via the GitHub contents API.
 *   2. Fetches each `*.yml` / `*.yaml` file's raw content.
 *   3. Runs the bytes through `detectGithubWorkflowOtsPatterns`.
 *   4. Returns a structured scan result with flattened patterns.
 *
 * Failure discipline (the gate must never crash):
 *
 *   - 404 on contents listing             → `error: 'NO_WORKFLOWS_DIR'`, patterns: []
 *   - 403 with x-ratelimit-remaining: 0   → `error: 'RATE_LIMIT_HIT'`,  patterns: []
 *   - any other listing failure           → `error: 'UPSTREAM_ERROR'`,  patterns: []
 *   - per-file fetch failure              → that workflow gets `fetched: false`,
 *                                            scan continues for siblings
 *   - per-file parse failure              → that workflow gets `parsed: false`,
 *                                            patterns: []; scan continues
 *
 * v1 scope: on-demand only. No cron, no incremental indexing, no branch
 * protection checks. Public repos work with an optional `GITHUB_TOKEN` for
 * higher rate limits; private repos require a token with `contents: read`.
 *
 * Authorization gating is the caller's job — this module trusts the
 * `headers` it is handed. Production paths (api/analyze) thread
 * `githubHeaders(process.env.GITHUB_TOKEN)`.
 */

import { detectGithubWorkflowOtsPatterns } from './githubWorkflowSignals.js';

const GH = 'https://api.github.com';

// Defensive caps. Real-world workflow directories are tiny (a few files,
// each a few KB). These exist to keep a hostile or pathological repo from
// blowing the gate's latency budget.
const MAX_WORKFLOWS = 50;
const MAX_FILE_BYTES = 256 * 1024;
const FETCH_CONCURRENCY = 5;
const FETCH_TIMEOUT_MS = 5000;

let _httpClient = defaultHttpClient();

function defaultHttpClient() {
  return {
    listWorkflowsDir: defaultListWorkflowsDir,
    fetchWorkflowFile: defaultFetchWorkflowFile,
  };
}

/**
 * Test seam — inject a stub HTTP client.
 *
 *   __setHttpClientForTests({
 *     listWorkflowsDir: async (owner, repo, headers) => [{ name, path, size }],
 *     fetchWorkflowFile: async (owner, repo, path, headers) => 'workflow yaml',
 *   })
 *
 * Each helper may also throw a structured error: `{ code: 'NO_WORKFLOWS_DIR' }`,
 * `{ code: 'RATE_LIMIT_HIT' }`, `{ code: 'UPSTREAM_ERROR' }`, or any other
 * Error (treated as upstream).
 *
 * Pass `null` to reset to the default fetch-backed client.
 */
export function __setHttpClientForTests(client) {
  _httpClient = client == null ? defaultHttpClient() : client;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function defaultListWorkflowsDir(owner, repo, headers) {
  const url = `${GH}/repos/${owner}/${repo}/contents/.github/workflows`;
  let res;
  try {
    res = await fetchWithTimeout(url, { headers }, FETCH_TIMEOUT_MS);
  } catch {
    throw structured('UPSTREAM_ERROR');
  }
  if (res.status === 404) throw structured('NO_WORKFLOWS_DIR');
  if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') {
    throw structured('RATE_LIMIT_HIT');
  }
  if (!res.ok) throw structured('UPSTREAM_ERROR');
  const data = await res.json().catch(() => null);
  if (!Array.isArray(data)) {
    // GitHub returns a single object when the path is a file, not a dir.
    throw structured('NO_WORKFLOWS_DIR');
  }
  return data
    .filter((entry) => entry && entry.type === 'file')
    .map((entry) => ({
      name: typeof entry.name === 'string' ? entry.name : '',
      path: typeof entry.path === 'string' ? entry.path : '',
      size: typeof entry.size === 'number' ? entry.size : 0,
    }));
}

async function defaultFetchWorkflowFile(owner, repo, path, headers) {
  // `Accept: application/vnd.github.raw` returns the file body directly,
  // bypassing the base64-wrapped contents JSON. Works for both public and
  // private repos with the same auth headers.
  //
  // Encoding: encode each path segment but preserve the `/` separators.
  // `encodeURIComponent('.github/workflows/ci.yml')` would emit
  // `.github%2Fworkflows%2Fci.yml`, which the GitHub contents API rejects
  // as path-not-found. Segment-wise encoding is the contract.
  const encodedPath = buildContentsPath(path);
  const url = `${GH}/repos/${owner}/${repo}/contents/${encodedPath}`;
  const rawHeaders = { ...headers, Accept: 'application/vnd.github.raw' };
  let res;
  try {
    res = await fetchWithTimeout(url, { headers: rawHeaders }, FETCH_TIMEOUT_MS);
  } catch {
    throw structured('UPSTREAM_ERROR');
  }
  if (!res.ok) throw structured('UPSTREAM_ERROR');
  return res.text();
}

/**
 * Encode a path for the GitHub contents API. Encodes each `/`-separated
 * segment with `encodeURIComponent`, then rejoins with literal `/`.
 * Exposed for test coverage — the URL builder is the only thing we can
 * lock without making a live HTTP call.
 */
export function buildContentsPath(path) {
  if (typeof path !== 'string' || path.length === 0) return '';
  return path.split('/').map(encodeURIComponent).join('/');
}

function structured(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

function isYamlWorkflowFile(name) {
  return /\.(ya?ml)$/i.test(name);
}

/**
 * Run the OTS workflow scan against a real repository.
 *
 * Returns:
 *   {
 *     scanned: boolean,
 *     workflows: [{ path, fetched, parsed, patternCount, patterns: [] }],
 *     patterns: [],            // flattened across all workflows
 *     skipped: { oversize: number, nonYaml: number, listingCap: number },
 *     error: 'NO_WORKFLOWS_DIR' | 'RATE_LIMIT_HIT' | 'UPSTREAM_ERROR' | null,
 *   }
 *
 * Never throws.
 */
export async function scanRepoWorkflows(owner, repo, headers) {
  const out = {
    scanned: false,
    workflows: [],
    patterns: [],
    skipped: { oversize: 0, nonYaml: 0, listingCap: 0 },
    error: null,
  };

  if (!owner || !repo) {
    out.error = 'INVALID_REPO';
    return out;
  }

  let entries;
  try {
    entries = await _httpClient.listWorkflowsDir(owner, repo, headers);
  } catch (e) {
    const code = e && e.code ? e.code : 'UPSTREAM_ERROR';
    out.error = code === 'NO_WORKFLOWS_DIR' ? 'NO_WORKFLOWS_DIR'
              : code === 'RATE_LIMIT_HIT'   ? 'RATE_LIMIT_HIT'
              :                                'UPSTREAM_ERROR';
    out.scanned = code === 'NO_WORKFLOWS_DIR';
    return out;
  }

  const yamlEntries = [];
  for (const entry of entries) {
    if (!isYamlWorkflowFile(entry.name)) {
      out.skipped.nonYaml += 1;
      continue;
    }
    if (entry.size > MAX_FILE_BYTES) {
      out.skipped.oversize += 1;
      continue;
    }
    yamlEntries.push(entry);
    if (yamlEntries.length >= MAX_WORKFLOWS) break;
  }
  if (yamlEntries.length < entries.filter((e) => isYamlWorkflowFile(e.name)).length) {
    out.skipped.listingCap = 1;
  }

  const results = await mapWithConcurrency(yamlEntries, FETCH_CONCURRENCY, async (entry) => {
    const wf = {
      path: entry.path,
      fetched: false,
      parsed: false,
      patternCount: 0,
      patterns: [],
    };
    let source;
    try {
      source = await _httpClient.fetchWorkflowFile(owner, repo, entry.path, headers);
      wf.fetched = true;
    } catch {
      return wf;
    }
    try {
      const patterns = detectGithubWorkflowOtsPatterns(source, { workflowPath: entry.path });
      wf.parsed = true;
      wf.patterns = Array.isArray(patterns) ? patterns : [];
      wf.patternCount = wf.patterns.length;
    } catch {
      // Should be impossible — detectGithubWorkflowOtsPatterns swallows
      // YAML errors — but stay defensive.
      wf.parsed = false;
    }
    return wf;
  });

  out.workflows = results;
  for (const wf of results) {
    if (wf.patterns.length) out.patterns.push(...wf.patterns);
  }
  out.scanned = true;
  return out;
}

// Local mapWithConcurrency clone to keep this module dep-free from
// runScan.js (which pulls in OSV / repo-health / scoring). Behaves the
// same: bounded concurrency, results array preserves input order.
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const idx = cursor;
      cursor += 1;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}
