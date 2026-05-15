/**
 * OpenSoyce GitHub App v0 webhook handler.
 *
 * Flow:
 *   1. POST gate                          (405 otherwise)
 *   2. HMAC-SHA256 signature verification (401 on mismatch) — uses RAW body
 *   3. Event gate (pull_request only; ping/install/etc -> 200 ignored)
 *   4. Action gate (opened/synchronize/reopened only)
 *   5. Mint App JWT (RS256) -> exchange for installation token
 *   6. Fetch package-lock.json @ PR head SHA via Contents API (.raw)
 *   7. Run shared runScan pipeline (no PR code execution, lockfile-only)
 *   8. Build v3d markdown report + Check Run summary
 *   9. POST a new Check Run per head SHA (conclusion: success | neutral)
 *
 * Locked design:
 *   - Auth: short-lived App JWT (10 min max) -> installation access token.
 *   - No new npm deps. JWT + HMAC signing use only node:crypto.
 *   - No git clone. No npm install. Only the lockfile text.
 *   - 5 MB lockfile size cap (matches api/scan.js).
 *   - Check Run is CREATED fresh per head SHA. synchronize events ship new
 *     head SHAs, which is what users expect — one Check Run per commit.
 *   - Always conclusion: success in v0 (report-only; threshold blocking
 *     lands in v0.1). Lockfile missing / scanner crash -> neutral.
 *
 * Punted to v0.1:
 *   - No installation-token cache (every webhook mints a fresh token).
 *   - No retry on transient 5xx from GitHub or OSV.
 *   - No sticky comment, no settings, no persistent state.
 */

import crypto from 'node:crypto';

import { analyzeRepo, githubHeaders } from '../src/shared/analyzeRepo.js';
import { resolveDepIdentity } from '../src/shared/resolveDepIdentity.js';
import { runScan, mapWithConcurrency } from '../src/shared/runScan.js';
import { summarizeScan } from '../src/shared/scanSummary.js';
import { computeRiskProfile } from '../src/shared/riskProfile.js';
import { buildMarkdownReport } from '../src/shared/buildScanReport.js';

// Vercel: bump function timeout to 60s (max on Hobby plan, as of 2025+).
// The scan pipeline (parse + OSV + identity + 25-row health) lands ~30s
// on cold cache. 60s gives us comfortable headroom without the
// fire-and-forget Option A risk.
export const maxDuration = 60;

// Required: raw body bytes for HMAC verification. Vercel auto-parses JSON
// by default; turning off the body parser hands us the raw request stream.
export const config = {
  api: { bodyParser: false },
};

const CHECK_RUN_NAME = 'OpenSoyce Dependency Risk';
const MAX_LOCKFILE_BYTES = 5_000_000;
const MAX_CHECK_RUN_SUMMARY = 65_535;

// ---------------------------------------------------------------------------
// Injectable deps (so the unit test can stub GitHub + runScan without touching
// real network). Production uses the real implementations.
// ---------------------------------------------------------------------------
const realDeps = {
  signAppJwt,
  getInstallationToken,
  ghFetch,
  fetchLockfile,
  createCheckRun,
  runScan,
  buildScanDeps,
};

let activeDeps = realDeps;

/**
 * Test-only seam. Swap any of the injectable deps; pass `null` to reset.
 * Yes it's a bit ugly. v0 ships with it.
 * @param {Partial<typeof realDeps>|null} overrides
 */
export function __setDepsForTesting(overrides) {
  if (overrides == null) {
    activeDeps = realDeps;
    return;
  }
  activeDeps = { ...realDeps, ...overrides };
}

// ---------------------------------------------------------------------------
// Crypto helpers (JWT + base64url + signature compare)
// ---------------------------------------------------------------------------

function base64url(bufOrString) {
  const buf = Buffer.isBuffer(bufOrString) ? bufOrString : Buffer.from(bufOrString, 'utf8');
  return buf.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

/**
 * Sign a short-lived JWT (RS256) for the GitHub App.
 *
 * Header:  { alg: 'RS256', typ: 'JWT' }
 * Payload: { iat: now-60, exp: now+540, iss: appId }
 *
 * @param {string|number} appId
 * @param {string} privateKeyPem  multi-line PEM, BEGIN/END markers included
 * @returns {string}
 */
export function signAppJwt(appId, privateKeyPem) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iat: now - 60,
    exp: now + 540, // 9 min — GitHub max is 10 min, leave 1 min jitter
    iss: typeof appId === 'string' ? appId : String(appId),
  };
  const encHeader = base64url(JSON.stringify(header));
  const encPayload = base64url(JSON.stringify(payload));
  const data = `${encHeader}.${encPayload}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(data);
  signer.end();
  const signature = signer.sign(privateKeyPem);
  return `${data}.${base64url(signature)}`;
}

/**
 * Exchange the App JWT for an installation access token (~1hr lifetime).
 * @param {string} appJwt
 * @param {number|string} installationId
 * @returns {Promise<{ token: string, expires_at: string }>}
 */
export async function getInstallationToken(appJwt, installationId) {
  const url = `https://api.github.com/app/installations/${installationId}/access_tokens`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${appJwt}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'opensoyce-app',
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '(no body)');
    throw new Error(`INSTALLATION_TOKEN_FAILED status=${res.status} body=${body.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Generic GitHub API caller with an installation token.
 * @param {string} installationToken
 * @param {string} path        full URL or "/repos/..." path
 * @param {{ method?: string, body?: any, accept?: string }} [opts]
 */
export async function ghFetch(installationToken, path, opts = {}) {
  const url = path.startsWith('http') ? path : `https://api.github.com${path}`;
  const method = opts.method || 'GET';
  const accept = opts.accept || 'application/vnd.github+json';
  /** @type {Record<string, string>} */
  const headers = {
    'Authorization': `Bearer ${installationToken}`,
    'Accept': accept,
    'User-Agent': 'opensoyce-app',
  };
  /** @type {RequestInit} */
  const init = { method, headers };
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
  }
  const res = await fetch(url, init);
  return res;
}

// ---------------------------------------------------------------------------
// Webhook signature verification
// ---------------------------------------------------------------------------

/**
 * Constant-time compare of "sha256=<hex>" vs HMAC(secret, body).
 * @param {string|undefined|null} headerValue
 * @param {Buffer} rawBody
 * @param {string} secret
 * @returns {boolean}
 */
export function verifySignature(headerValue, rawBody, secret) {
  if (typeof headerValue !== 'string' || !headerValue.startsWith('sha256=')) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(headerValue);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Raw body reader (Vercel/Node IncomingMessage)
// ---------------------------------------------------------------------------

async function readRawBody(req) {
  // If a previous middleware already buffered it, prefer that.
  if (req.body && Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.rawBody === 'string') return Buffer.from(req.rawBody, 'utf8');
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody;

  return await new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Lockfile fetch + Check Run create
// ---------------------------------------------------------------------------

/**
 * Fetch package-lock.json text at a specific commit SHA. Returns one of:
 *   - { ok: true, text }                  — file present, raw text fetched
 *   - { ok: false, reason: 'missing' }    — 404 or directory
 *   - { ok: false, reason: 'too_large' }  — file present but > 5 MB
 *   - { ok: false, reason: 'fetch_failed', detail } — other upstream failure
 *
 * @param {string} token
 * @param {{ owner: string, repo: string, ref: string }} args
 */
export async function fetchLockfile(token, { owner, repo, ref }) {
  const path = `/repos/${owner}/${repo}/contents/package-lock.json?ref=${encodeURIComponent(ref)}`;
  const res = await ghFetch(token, path, { accept: 'application/vnd.github.raw' });
  if (res.status === 404) return { ok: false, reason: 'missing' };
  if (res.status === 403 || res.status === 451) return { ok: false, reason: 'missing' };
  if (!res.ok) {
    const body = await res.text().catch(() => '(no body)');
    return { ok: false, reason: 'fetch_failed', detail: `status=${res.status} ${body.slice(0, 200)}` };
  }
  // Contents API with Accept: raw returns the raw bytes for a file. For a
  // directory at that path, it returns JSON listing — content-type is JSON.
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    // It's a directory, not a file.
    return { ok: false, reason: 'missing' };
  }
  const text = await res.text();
  if (text.length > MAX_LOCKFILE_BYTES) {
    return { ok: false, reason: 'too_large' };
  }
  return { ok: true, text };
}

/**
 * Create a new Check Run on the head SHA. v0 always creates a NEW one per
 * head SHA — no PATCH-by-id, no external_id dedupe. Each synchronize event
 * ships a new SHA which naturally gets its own Check Run; that's the
 * GitHub-native behavior users expect.
 *
 * @param {string} token
 * @param {{
 *   owner: string,
 *   repo: string,
 *   headSha: string,
 *   conclusion: 'success' | 'neutral' | 'failure',
 *   title: string,
 *   summaryMarkdown: string,
 *   prNumber: number,
 * }} args
 */
export async function createCheckRun(token, args) {
  let summary = args.summaryMarkdown;
  if (summary.length > MAX_CHECK_RUN_SUMMARY) {
    const footer = '\n\n...report truncated, download via the JSON API for full data...';
    summary = summary.slice(0, MAX_CHECK_RUN_SUMMARY - footer.length) + footer;
  }
  const body = {
    name: CHECK_RUN_NAME,
    head_sha: args.headSha,
    status: 'completed',
    conclusion: args.conclusion,
    external_id: `opensoyce-v0-${args.prNumber}-${args.headSha}`,
    output: {
      title: args.title,
      summary,
    },
  };
  const res = await ghFetch(token, `/repos/${args.owner}/${args.repo}/check-runs`, {
    method: 'POST',
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '(no body)');
    throw new Error(`CHECK_RUN_CREATE_FAILED status=${res.status} body=${text.slice(0, 200)}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Scan dep builder — mirrors the CLI shape so scoring stays bit-identical.
// ---------------------------------------------------------------------------

function buildScanDeps(githubToken) {
  const headers = githubHeaders(githubToken);
  const cache = new Map();
  const getAnalysis = async (owner, repo) => {
    const key = `${owner}/${repo}`;
    if (cache.has(key)) return cache.get(key);
    const p = analyzeRepo(owner, repo, headers);
    cache.set(key, p);
    return p;
  };
  return {
    getAnalysis,
    resolveIdentity: (name, opts) => resolveDepIdentity(name, opts || {}),
    mapWithConcurrency,
  };
}

// ---------------------------------------------------------------------------
// Title builder
// ---------------------------------------------------------------------------

const LABEL_DISPLAY = {
  CLEAN: 'CLEAN',
  PATCH_AVAILABLE: 'PATCH AVAILABLE',
  REVIEW_REQUIRED: 'REVIEW REQUIRED',
  VERIFY_LATER: 'VERIFY LATER',
};

function buildCheckRunTitle(summary) {
  const label = summary?.label;
  const reason = summary?.labelReason;
  if (label && reason) return `${LABEL_DISPLAY[label] || label} — ${reason}`;
  if (label) return LABEL_DISPLAY[label] || label;
  return 'OpenSoyce Dependency Risk';
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Read raw bytes BEFORE any JSON parse so signature verification has the
  // exact bytes GitHub sent.
  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (err) {
    return res.status(400).json({ error: 'BODY_READ_FAILED' });
  }

  const secret = process.env.GITHUB_APP_WEBHOOK_SECRET;
  if (!secret) {
    console.error('github-webhook: GITHUB_APP_WEBHOOK_SECRET missing');
    return res.status(500).json({ error: 'WEBHOOK_SECRET_MISSING' });
  }

  const sig = req.headers['x-hub-signature-256'];
  if (!verifySignature(sig, rawBody, secret)) {
    return res.status(401).json({ error: 'SIGNATURE_MISMATCH' });
  }

  const event = req.headers['x-github-event'];
  if (event !== 'pull_request') {
    // ping / installation / installation_repositories / etc. -> 200 cleanly.
    // (GitHub will mark the App install red in its UI if ping doesn't 200.)
    return res.status(200).json({ ignored: String(event || 'unknown') });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'INVALID_JSON' });
  }

  const action = payload?.action;
  if (action !== 'opened' && action !== 'synchronize' && action !== 'reopened') {
    return res.status(200).json({ ignored: String(action || 'unknown_action') });
  }

  const installationId = payload?.installation?.id;
  const headSha = payload?.pull_request?.head?.sha;
  const owner = payload?.repository?.owner?.login;
  const repo = payload?.repository?.name;
  const prNumber = payload?.pull_request?.number;

  if (!installationId || !headSha || !owner || !repo || typeof prNumber !== 'number') {
    return res.status(400).json({ error: 'PAYLOAD_MISSING_FIELDS' });
  }

  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !privateKey) {
    console.error('github-webhook: GITHUB_APP_ID or GITHUB_APP_PRIVATE_KEY missing');
    return res.status(500).json({ error: 'APP_CREDENTIALS_MISSING' });
  }

  // Mint installation token. No caching in v0 — every webhook gets a fresh
  // token. Tokens are ~1hr; we use it for ~30s and discard.
  let installationToken;
  try {
    const jwt = activeDeps.signAppJwt(appId, privateKey);
    const tokenResp = await activeDeps.getInstallationToken(jwt, installationId);
    installationToken = tokenResp.token;
  } catch (err) {
    console.error('github-webhook: installation token mint failed', err?.message || err);
    return res.status(500).json({ error: 'INSTALLATION_TOKEN_FAILED' });
  }

  // Fetch the lockfile at PR head SHA. No git clone; no npm install.
  const lockfile = await activeDeps.fetchLockfile(installationToken, { owner, repo, ref: headSha });

  if (!lockfile.ok) {
    let title, summaryMarkdown;
    if (lockfile.reason === 'missing') {
      title = 'No package-lock.json at this PR head — OpenSoyce skipped.';
      summaryMarkdown = `OpenSoyce did not find a \`package-lock.json\` at the root of this PR head (\`${headSha.slice(0, 7)}\`). Nothing to scan.`;
    } else if (lockfile.reason === 'too_large') {
      title = 'Lockfile exceeds 5 MB cap — OpenSoyce skipped.';
      summaryMarkdown = `The \`package-lock.json\` at this PR head exceeds the 5 MB scan cap. Open an issue if your tree is legitimately this large.`;
    } else {
      title = 'Lockfile fetch failed — OpenSoyce skipped.';
      summaryMarkdown = `OpenSoyce could not fetch \`package-lock.json\` from this PR head. Detail: \`${(lockfile.detail || 'unknown').slice(0, 200)}\``;
    }
    try {
      await activeDeps.createCheckRun(installationToken, {
        owner, repo, headSha, prNumber,
        conclusion: 'neutral',
        title,
        summaryMarkdown,
      });
    } catch (err) {
      console.error('github-webhook: createCheckRun (neutral) failed', err?.message || err);
      return res.status(500).json({ error: 'CHECK_RUN_FAILED' });
    }
    return res.status(200).json({ ok: true, status: 'skipped', reason: lockfile.reason });
  }

  // Run the scan. Same pipeline the CLI and /api/scan use.
  let scanResult;
  try {
    const deps = activeDeps.buildScanDeps(process.env.GITHUB_TOKEN || installationToken);
    scanResult = await activeDeps.runScan({
      lockfileText: lockfile.text,
      filename: 'package-lock.json',
      deps,
    });
  } catch (err) {
    const code = err && err.scanError ? err.code : null;
    const title = code
      ? `Scanner did not run — ${code}`
      : 'Scanner crashed — OpenSoyce skipped.';
    const summaryMarkdown = code
      ? `OpenSoyce rejected this lockfile: \`${code}\`. (npm v1/v2/v3 \`package-lock.json\` only in v0; yarn/pnpm coming.)`
      : 'OpenSoyce encountered an unexpected error while scanning this lockfile. The error has been logged.';
    if (!code) console.error('github-webhook: runScan crashed', err?.message || err);
    try {
      await activeDeps.createCheckRun(installationToken, {
        owner, repo, headSha, prNumber,
        conclusion: 'neutral',
        title,
        summaryMarkdown,
      });
    } catch (e2) {
      console.error('github-webhook: createCheckRun (scan-error) failed', e2?.message || e2);
      return res.status(500).json({ error: 'CHECK_RUN_FAILED' });
    }
    return res.status(200).json({ ok: true, status: 'scan_error', code: code || 'CRASH' });
  }

  // Build the v3d report.
  const vulns = scanResult.vulnerabilities || [];
  const inventory = scanResult.inventory || null;
  const selectedHealth = scanResult.selectedHealth || null;
  const summary = summarizeScan(vulns);
  const profile = computeRiskProfile({
    vulnerabilities: vulns,
    inventory,
    selectedHealth,
    osvError: !!scanResult.osvError,
  });
  const markdown = buildMarkdownReport({
    summary,
    profile,
    vulnerabilities: vulns,
    inventory,
    selectedHealth,
    scannedAt: scanResult.scannedAt,
  });

  try {
    await activeDeps.createCheckRun(installationToken, {
      owner, repo, headSha, prNumber,
      // v0 is report-only; never block merges.
      conclusion: 'success',
      title: buildCheckRunTitle(summary),
      summaryMarkdown: markdown,
    });
  } catch (err) {
    console.error('github-webhook: createCheckRun (success) failed', err?.message || err);
    return res.status(500).json({ error: 'CHECK_RUN_FAILED' });
  }

  return res.status(200).json({ ok: true, status: 'scanned', label: summary?.label || null });
}
