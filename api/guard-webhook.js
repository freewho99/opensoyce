/**
 * OpenSoyce Guard — GitHub App webhook handler (v0.2).
 *
 * Purpose:
 *   Catch risky dependency changes before they merge. For every PR with a
 *   lockfile change, post a Check Run + a PR comment summarizing the real
 *   per-dependency verdicts from the shared runScan pipeline.
 *
 * v0.2 scope (this file):
 *   1. Verify x-hub-signature-256 (HMAC-SHA256, constant-time compare).
 *   2. Dispatch by x-github-event:
 *        installation / installation_repositories  -> log + 200
 *        pull_request (opened|synchronize|reopened) -> handlePullRequest()
 *        anything else -> 200 no-op (incl. ping)
 *   3. handlePullRequest():
 *        - Mint installation token (App JWT -> token exchange).
 *        - List PR files; filter to known lockfiles.
 *        - No lockfile changes -> neutral check run + return.
 *        - Lockfile changes  -> in-progress check run -> fetch each
 *                                lockfile at the PR head -> runScan each
 *                                -> aggregate verdicts -> completed
 *                                check run + PR comment.
 *   4. Idempotency: durable, GitHub-side. Every invocation queries the
 *      existing OpenSoyce Guard check run for the head SHA — a completed
 *      run short-circuits (no duplicate comment, no duplicate check run);
 *      an in-progress run is PATCHed in place. Cold-start safe — the
 *      function instance no longer needs to remember anything. Operators
 *      can force a rescore with GUARD_FORCE_RESCORE=1.
 *   5. Always return 200 on processed events. NEVER 5xx to GitHub — it
 *      retries failed deliveries aggressively and we'd spam ourselves.
 *
 * Out of scope (separate follow-ups):
 *   - Sticky PR comments / marker-based dedupe (PR 2).
 *   - .opensoyce.yml policy file parsing / failure conclusions (PR 4).
 *   - Live-fire dogfooding pass (PR 5).
 *
 * Engine-verdict → Guard-label mapping:
 *   USE READY → USE READY, FORKABLE → STABLE, STABLE → STABLE,
 *   WATCHLIST → WATCHLIST, RISKY → RISKY, STALE → GRAVEYARD.
 *
 * Why a separate file from github-webhook.js:
 *   This is a distinct App (different App ID, different secret, different
 *   permissions). Both apps can coexist installed on the same repo —
 *   github-webhook.js is the v3d risk scanner, guard-webhook.js is the
 *   lockfile-diff Guard.
 */

import crypto from 'node:crypto';

import { getInstallationToken, githubFetch, fetchLockfileContent } from './_guard-app.js';
import { analyzeRepo, githubHeaders } from '../src/shared/analyzeRepo.js';
import { resolveDepIdentity } from '../src/shared/resolveDepIdentity.js';
import { runScan, mapWithConcurrency } from '../src/shared/runScan.js';

// Vercel: 60s function timeout (matches github-webhook.js).
export const maxDuration = 60;

// Required: raw bytes for HMAC. Vercel auto-parses JSON; disable it.
export const config = {
  api: { bodyParser: false },
};

const CHECK_RUN_NAME = 'OpenSoyce Guard';

// Hidden HTML marker injected as the first line of every Guard PR comment.
// Lets a later event find the existing Guard comment and PATCH it in place
// instead of posting a fresh one. PRs 3 (dedupe) and 4 (policy) reuse this.
const GUARD_COMMENT_MARKER = '<!-- opensoyce-guard-comment -->';

const LOCKFILE_NAMES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'uv.lock',
  'poetry.lock',
]);

// Within-invocation re-entry guard. Keyed by `${owner}/${repo}@${headSha}`.
// Durable dedupe (across invocations / cold starts) is handled by querying
// the existing OpenSoyce Guard check run on GitHub — see findExistingCheckRun.
// This Set only protects against duplicate webhook events arriving while a
// previous invocation in the SAME function instance is still executing.
const IN_FLIGHT_RUNS = new Set();

// ---------------------------------------------------------------------------
// Signature verification (HMAC-SHA256, constant-time compare)
// ---------------------------------------------------------------------------

function verifySignature(headerValue, rawBody, secret) {
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

async function readRawBody(req) {
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
// GitHub helpers (Check Runs, PR files, PR comments)
// ---------------------------------------------------------------------------

async function listPrFiles(token, owner, repo, prNumber) {
  // PRs can have >30 files; GitHub returns 30/page. For v0.1 we walk up to
  // 3 pages (90 files) which covers ~all real-world PRs. Beyond that we
  // intentionally stop — scoring a 300-file PR is sprint+1 territory.
  const collected = [];
  for (let page = 1; page <= 3; page++) {
    const res = await githubFetch(token, `/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100&page=${page}`);
    if (!res.ok) {
      const body = await res.text().catch(() => '(no body)');
      throw new Error(`LIST_FILES_FAILED status=${res.status} body=${body.slice(0, 200)}`);
    }
    const batch = await res.json();
    collected.push(...batch);
    if (batch.length < 100) break;
  }
  return collected;
}

function filterLockfiles(files) {
  return files.filter((f) => {
    if (!f || typeof f.filename !== 'string') return false;
    const base = f.filename.split('/').pop();
    return LOCKFILE_NAMES.has(base);
  });
}

async function createCheckRun(token, { owner, repo, headSha, status, conclusion, title, summary, prNumber }) {
  const body = {
    name: CHECK_RUN_NAME,
    head_sha: headSha,
    external_id: `guard-v0.2-${prNumber}-${headSha}`,
    status,
    output: { title, summary },
  };
  if (status === 'completed' && conclusion) {
    body.conclusion = conclusion;
  }
  const res = await githubFetch(token, `/repos/${owner}/${repo}/check-runs`, {
    method: 'POST',
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '(no body)');
    throw new Error(`CHECK_RUN_CREATE_FAILED status=${res.status} body=${text.slice(0, 200)}`);
  }
  return res.json();
}

async function updateCheckRun(token, { owner, repo, checkRunId, status, conclusion, title, summary }) {
  const effectiveStatus = status || 'completed';
  const body = {
    status: effectiveStatus,
    output: { title, summary },
  };
  if (effectiveStatus === 'completed' && conclusion) {
    body.conclusion = conclusion;
  }
  const res = await githubFetch(token, `/repos/${owner}/${repo}/check-runs/${checkRunId}`, {
    method: 'PATCH',
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '(no body)');
    throw new Error(`CHECK_RUN_UPDATE_FAILED status=${res.status} body=${text.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Query GitHub for the latest OpenSoyce Guard check run for a given head SHA.
 * Returns `{ id, status, conclusion } | null`. Never throws — on 5xx / network
 * failure, logs and returns null so processing proceeds (better risk a
 * duplicate than skip the user-visible PR comment).
 */
async function findExistingCheckRun(token, owner, repo, headSha) {
  try {
    const path = `/repos/${owner}/${repo}/commits/${headSha}/check-runs?check_name=${encodeURIComponent(CHECK_RUN_NAME)}&filter=latest`;
    const res = await githubFetch(token, path);
    if (!res.ok) {
      const text = await res.text().catch(() => '(no body)');
      console.error('guard-webhook: findExistingCheckRun failed', res.status, text.slice(0, 200));
      return null;
    }
    const json = await res.json();
    const runs = Array.isArray(json?.check_runs) ? json.check_runs : [];
    if (runs.length === 0) return null;
    // Multiple runs returned (race) → take most recent by created_at.
    const sorted = runs.slice().sort((a, b) => {
      const at = Date.parse(a?.created_at || '') || 0;
      const bt = Date.parse(b?.created_at || '') || 0;
      return bt - at;
    });
    const latest = sorted[0];
    return {
      id: latest.id,
      status: latest.status,
      conclusion: latest.conclusion || null,
    };
  } catch (err) {
    console.error('guard-webhook: findExistingCheckRun threw', err?.message || err);
    return null;
  }
}

/**
 * Walk up to 3 pages of PR comments looking for one tagged with our hidden
 * marker. Returns `{ id }` if found, `null` otherwise. Never throws — any
 * API error is logged and we return null so the caller falls back to POST.
 */
async function findGuardComment(token, owner, repo, prNumber) {
  try {
    for (let page = 1; page <= 3; page++) {
      const res = await githubFetch(
        token,
        `/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=100&page=${page}`,
      );
      if (!res.ok) {
        const text = await res.text().catch(() => '(no body)');
        console.error('guard-webhook: list comments failed', res.status, text.slice(0, 200));
        return null;
      }
      const batch = await res.json();
      if (!Array.isArray(batch)) return null;
      for (const c of batch) {
        if (c && typeof c.body === 'string' && c.body.includes(GUARD_COMMENT_MARKER)) {
          return { id: c.id };
        }
      }
      if (batch.length < 100) break;
    }
    return null;
  } catch (err) {
    console.error('guard-webhook: findGuardComment threw', err?.message || err);
    return null;
  }
}

/**
 * Sticky PR comment: if a prior Guard comment exists (matched via the hidden
 * marker), PATCH it with the new body. Otherwise POST a new comment. Either
 * failure mode falls back to POST so a transient API hiccup never silences
 * the signal.
 */
async function upsertPrComment(token, { owner, repo, prNumber, body }) {
  const existing = await findGuardComment(token, owner, repo, prNumber);
  if (existing && existing.id) {
    try {
      const res = await githubFetch(token, `/repos/${owner}/${repo}/issues/comments/${existing.id}`, {
        method: 'PATCH',
        body: { body },
      });
      if (res.ok) return res.json();
      const text = await res.text().catch(() => '(no body)');
      console.error('guard-webhook: PATCH comment failed', res.status, text.slice(0, 200));
      // Fall through to POST.
    } catch (err) {
      console.error('guard-webhook: PATCH comment threw', err?.message || err);
      // Fall through to POST.
    }
  }
  // PR-level comments use the Issues API (PRs are issues).
  const res = await githubFetch(token, `/repos/${owner}/${repo}/issues/${prNumber}/comments`, {
    method: 'POST',
    body: { body },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '(no body)');
    throw new Error(`PR_COMMENT_FAILED status=${res.status} body=${text.slice(0, 200)}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Scanner integration (v0.2). Calls the same runScan pipeline /api/scan uses
// so the comment / check-run numbers can't drift from the marketing scanner.
//
// Engine-verdict → Guard-label mapping. The scoring engine emits
// USE READY / FORKABLE / STABLE / WATCHLIST / RISKY / STALE (see
// src/shared/verdict.js). The PR-comment design (GuardPrCommentPreview.tsx)
// surfaces only USE READY / STABLE / WATCHLIST / RISKY / GRAVEYARD. Mapping:
//   USE READY → USE READY
//   FORKABLE  → STABLE   (still healthy enough to adopt, just not "best in class")
//   STABLE    → STABLE
//   WATCHLIST → WATCHLIST
//   RISKY     → RISKY
//   STALE     → GRAVEYARD
// HIGH MOMENTUM is editorial-only and never emitted by runScan.
// ---------------------------------------------------------------------------

const LABELS = ['USE READY', 'STABLE', 'WATCHLIST', 'RISKY', 'GRAVEYARD'];

function mapVerdictToLabel(engineVerdict) {
  switch (engineVerdict) {
    case 'USE READY': return 'USE READY';
    case 'FORKABLE': return 'STABLE';
    case 'STABLE': return 'STABLE';
    case 'WATCHLIST': return 'WATCHLIST';
    case 'RISKY': return 'RISKY';
    case 'STALE': return 'GRAVEYARD';
    default: return null;
  }
}

/**
 * Per-request analysis memo. Vercel functions are stateless across requests
 * so a single Guard scan can ref the same repo multiple times; memo keeps
 * that to one analysis call. Same shape as api/scan.js's memo.
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

/**
 * Scan a single lockfile through the shared runScan pipeline. Returns a
 * normalized result: `{ ok, scored: Array<{ name, ecosystem, label, reason }>,
 * totalDeps, error }`. Never throws — all engine errors are captured.
 *
 * @param {string} lockfileText
 * @param {string} filename
 * @param {(owner: string, repo: string) => Promise<any>} getAnalysis
 * @returns {Promise<{
 *   ok: boolean,
 *   scored: Array<{ name: string, ecosystem: string, label: string, reason: string }>,
 *   totalDeps: number,
 *   error: string | null,
 * }>}
 */
async function scanOneLockfile(lockfileText, filename, getAnalysis) {
  try {
    const result = await runScan({
      lockfileText,
      filename,
      deps: {
        getAnalysis,
        resolveIdentity: (name, opts) => resolveDepIdentity(name, opts || {}),
        mapWithConcurrency,
      },
    });
    const ecosystem = result.ecosystem || 'unknown';
    const scored = [];
    // The scoring engine attaches verdicts in two places: per-vuln rows
    // (`vulnerabilities[].repoHealth.verdict`) and selectedHealth rows
    // (`selectedHealth.scored[].verdict`). We collect both; dedupe by
    // `${ecosystem}:${name}` to avoid double-counting the same package.
    const seen = new Set();
    const pushRow = (name, label, reason) => {
      if (!name || !label) return;
      const key = `${ecosystem}:${name}`;
      if (seen.has(key)) return;
      seen.add(key);
      scored.push({ name, ecosystem, label, reason: reason || label });
    };
    for (const v of result.vulnerabilities || []) {
      const verdict = v.repoHealth && v.repoHealth.verdict;
      const label = mapVerdictToLabel(verdict);
      if (!label) continue;
      // Reason: prefer the highest-severity vuln summary when present, else
      // fall back to the verdict label itself.
      const sev = (v.severity || '').toLowerCase();
      const reason = sev
        ? `open ${sev} advisory on ${v.package}`
        : label;
      pushRow(v.package, label, reason);
    }
    if (result.selectedHealth && Array.isArray(result.selectedHealth.scored)) {
      for (const row of result.selectedHealth.scored) {
        if (row.status !== 'SCORED') continue;
        const label = mapVerdictToLabel(row.verdict);
        if (!label) continue;
        // The engine doesn't surface a free-text reason for selected-health
        // rows. Fall back to verdict label — per spec, "don't invent reasons".
        pushRow(row.package, label, label);
      }
    }
    return {
      ok: true,
      scored,
      totalDeps: typeof result.totalDeps === 'number' ? result.totalDeps : 0,
      error: result.osvError ? 'OSV_UNAVAILABLE' : null,
    };
  } catch (err) {
    const code = (err && err.scanError && err.code) || (err && err.message) || 'SCAN_FAILED';
    return { ok: false, scored: [], totalDeps: 0, error: String(code).slice(0, 120) };
  }
}

/**
 * Aggregate per-lockfile results across the PR. Same-ecosystem same-name
 * packages collapse to one entry (a monorepo touching both pnpm-lock.yaml
 * and a sub-package's package-lock.json shouldn't double-count `react`).
 * Cross-ecosystem same-name packages stay separate (`requests` PyPI vs.
 * `requests` npm — different packages despite the name collision).
 */
function aggregateScans(perFile) {
  const byKey = new Map(); // `${ecosystem}:${name}` -> row
  for (const f of perFile) {
    if (!f.scan || !f.scan.ok) continue;
    for (const row of f.scan.scored) {
      const key = `${row.ecosystem}:${row.name}`;
      // First-write-wins is fine: per-lockfile rows are already deduped, and
      // cross-lockfile collisions are rare enough that the more conservative
      // choice (keep the first verdict) avoids flapping.
      if (!byKey.has(key)) byKey.set(key, row);
    }
  }
  const all = Array.from(byKey.values());
  const counts = { 'USE READY': 0, 'STABLE': 0, 'WATCHLIST': 0, 'RISKY': 0, 'GRAVEYARD': 0 };
  for (const r of all) {
    if (counts[r.label] !== undefined) counts[r.label] += 1;
  }
  return { all, counts, totalChanged: all.length };
}

// ---------------------------------------------------------------------------
// Report builders. PR comment matches GuardPrCommentPreview.tsx visual shape.
// ---------------------------------------------------------------------------

function buildNoLockfileCheck(headSha) {
  return {
    conclusion: 'neutral',
    title: 'No lockfile changes detected.',
    summary: [
      `OpenSoyce Guard inspected the file list for \`${headSha.slice(0, 7)}\` and found no changes to:`,
      '',
      ...Array.from(LOCKFILE_NAMES, (n) => `- \`${n}\``),
      '',
      'Nothing to scan. This check is informational.',
    ].join('\n'),
  };
}

/**
 * Conclusion logic (PR 1 of 5 — no policy file yet, that's PR 4):
 *   - All lockfiles failed to scan → failure.
 *   - Any GRAVEYARD or RISKY → neutral.
 *   - WATCHLIST only → neutral.
 *   - Otherwise → success.
 */
function decideConclusion(perFile, agg) {
  const anyOk = perFile.some((f) => f.scan && f.scan.ok);
  if (!anyOk) return 'failure';
  if (agg.counts.GRAVEYARD > 0 || agg.counts.RISKY > 0) return 'neutral';
  if (agg.counts.WATCHLIST > 0) return 'neutral';
  return 'success';
}

function buildReport(perFile, agg) {
  const n = perFile.length;
  const list = perFile.map((f) => {
    const status = f.scan && f.scan.ok
      ? f.lockfileFile.status
      : `scan failed: ${f.scan && f.scan.error ? f.scan.error : 'unknown'}`;
    return `- \`${f.lockfileFile.filename}\` (${status})`;
  }).join('\n');
  const top = agg.all
    .filter((r) => r.label === 'GRAVEYARD' || r.label === 'RISKY' || r.label === 'WATCHLIST')
    .slice(0, 5)
    .map((r) => `- \`${r.name}\` — ${r.label}`)
    .join('\n') || '_none_';
  const title = `Guard scanned ${n} lockfile${n === 1 ? '' : 's'} — ${agg.counts.GRAVEYARD} graveyard, ${agg.counts.RISKY} risky, ${agg.counts.WATCHLIST} watchlist.`;
  const summary = [
    `**Guard scanned ${n} lockfile${n === 1 ? '' : 's'}. ${agg.counts.GRAVEYARD} graveyard, ${agg.counts.RISKY} risky, ${agg.counts.WATCHLIST} watchlist.**`,
    '',
    'Lockfiles inspected:',
    list,
    '',
    'Top issues:',
    top,
    '',
    '(_Full breakdown in PR comment._)',
  ].join('\n');
  return { title, summary };
}

function buildAllFailedReport(perFile) {
  const list = perFile.map((f) => {
    const why = f.scan && f.scan.error ? f.scan.error : 'unknown';
    return `- \`${f.lockfileFile.filename}\` — ${why}`;
  }).join('\n');
  return {
    title: 'Guard could not scan any lockfile.',
    summary: [
      '**Guard scan failed for every lockfile in this PR.**',
      '',
      'Lockfiles attempted:',
      list,
      '',
      'No verdict can be issued. Check Vercel logs for details.',
    ].join('\n'),
  };
}

function renderRows(rows) {
  if (!rows.length) return '_none_';
  return rows.map((r) => `- \`${r.name}\` — ${r.label} — ${r.reason}`).join('\n');
}

function buildPrComment(headSha, perFile, agg) {
  const blocked = agg.all.filter((r) => r.label === 'GRAVEYARD' || r.label === 'RISKY');
  const warnings = agg.all.filter((r) => r.label === 'WATCHLIST');
  const lockfileLines = perFile.map((f) => {
    const status = f.scan && f.scan.ok
      ? f.lockfileFile.status
      : `scan failed: ${f.scan && f.scan.error ? f.scan.error : 'unknown'}`;
    return `- \`${f.lockfileFile.filename}\` (${status})`;
  }).join('\n');
  if (agg.totalChanged === 0) {
    return [
      GUARD_COMMENT_MARKER,
      `### OpenSoyce Guard — verdict for \`${headSha.slice(0, 7)}\``,
      '',
      'No dependency changes scored — lockfile changed but no resolvable deps.',
      '',
      `**Lockfiles inspected:**`,
      lockfileLines,
      '',
      '<sub>OpenSoyce Guard v0.2</sub>',
    ].join('\n');
  }
  const summaryLines = LABELS.map((l) => `- ${l}: ${agg.counts[l]}`).join('\n');
  return [
    GUARD_COMMENT_MARKER,
    `### OpenSoyce Guard — verdict for \`${headSha.slice(0, 7)}\``,
    '',
    `**This PR changes ${agg.totalChanged} dependenc${agg.totalChanged === 1 ? 'y' : 'ies'}.**`,
    '',
    `**Lockfiles inspected:**`,
    lockfileLines,
    '',
    '**Verdict Summary:**',
    summaryLines,
    '',
    '**Blocked dependencies:**',
    renderRows(blocked),
    '',
    '**Warnings:**',
    renderRows(warnings),
    '',
    '**Suggested next moves:**',
    '- Replace graveyard dependencies',
    '- Pin and watch risky dependencies',
    '- Review warnings before merging',
    '',
    '<sub>OpenSoyce Guard v0.2</sub>',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Main PR handler
// ---------------------------------------------------------------------------

async function handlePullRequest(payload) {
  const installationId = payload?.installation?.id;
  const owner = payload?.repository?.owner?.login;
  const repo = payload?.repository?.name;
  const prNumber = payload?.pull_request?.number;
  const headSha = payload?.pull_request?.head?.sha;

  if (!installationId || !owner || !repo || typeof prNumber !== 'number' || !headSha) {
    console.error('guard-webhook: payload missing fields', { installationId, owner, repo, prNumber, headSha });
    return { status: 'bad_payload' };
  }

  // Within-invocation re-entry guard: if a duplicate webhook event arrives
  // while THIS function instance is still processing the same (owner, repo,
  // head SHA), don't fight ourselves. Durable cross-invocation dedupe is
  // handled by the GitHub-side check-run lookup below.
  const inFlightKey = `${owner}/${repo}@${headSha}`;
  if (IN_FLIGHT_RUNS.has(inFlightKey)) {
    return { status: 'duplicate', reason: 'in_flight', headSha };
  }

  // Mint installation token. No caching in v0.1.
  const tokenResp = await getInstallationToken(installationId);
  const token = tokenResp.token;

  // Durable dedupe via GitHub-side check-run lookup. Operators can force a
  // rescore with GUARD_FORCE_RESCORE=1 (PR 2's sticky-comment logic will
  // PATCH the prior comment in place, so a force-rescore overwrites instead
  // of stacking).
  const forceRescore = process.env.GUARD_FORCE_RESCORE === '1';
  let existingRun = null;
  if (!forceRescore) {
    existingRun = await findExistingCheckRun(token, owner, repo, headSha);
    if (existingRun && existingRun.status === 'completed') {
      // Already processed. No duplicate comment, no duplicate check run.
      return { status: 'duplicate', reason: 'already_completed', headSha, conclusion: existingRun.conclusion };
    }
    // status: in_progress | queued → crashed mid-flight or a duplicate event
    // arrived while a prior invocation was still running. We'll PATCH that
    // existing run rather than POSTing a new one (handled below).
  }

  IN_FLIGHT_RUNS.add(inFlightKey);
  try {
    return await runPullRequestScan({
      token, owner, repo, prNumber, headSha, existingRun,
    });
  } finally {
    IN_FLIGHT_RUNS.delete(inFlightKey);
  }
}

async function runPullRequestScan({ token, owner, repo, prNumber, headSha, existingRun }) {
  // If we already have an in-progress/queued check run for this head SHA
  // (crash recovery, or duplicate-event race), PATCH it rather than POST
  // a new one. Applies to both the no-lockfile and lockfile-found paths.
  const recoverableRunId = existingRun && existingRun.status !== 'completed' ? existingRun.id : null;

  // List PR files first so we can decide whether to even create a check run.
  let files;
  try {
    files = await listPrFiles(token, owner, repo, prNumber);
  } catch (err) {
    console.error('guard-webhook: listPrFiles failed', err?.message || err);
    // Create (or PATCH) a failure check so the PR author sees something went wrong.
    if (recoverableRunId) {
      await updateCheckRun(token, {
        owner, repo, checkRunId: recoverableRunId,
        conclusion: 'failure',
        title: 'Guard could not list PR files.',
        summary: `Error: \`${(err?.message || 'unknown').slice(0, 300)}\``,
      }).catch((e) => console.error('guard-webhook: failure check patch failed', e?.message || e));
    } else {
      await createCheckRun(token, {
        owner, repo, headSha, prNumber,
        status: 'completed',
        conclusion: 'failure',
        title: 'Guard could not list PR files.',
        summary: `Error: \`${(err?.message || 'unknown').slice(0, 300)}\``,
      }).catch((e) => console.error('guard-webhook: failure check create failed', e?.message || e));
    }
    return { status: 'list_files_failed' };
  }

  const lockfileFiles = filterLockfiles(files);

  if (lockfileFiles.length === 0) {
    const { conclusion, title, summary } = buildNoLockfileCheck(headSha);
    if (recoverableRunId) {
      // Crashed → recovered no-lockfile path: PATCH instead of creating a duplicate.
      await updateCheckRun(token, {
        owner, repo, checkRunId: recoverableRunId,
        conclusion, title, summary,
      });
    } else {
      await createCheckRun(token, {
        owner, repo, headSha, prNumber,
        status: 'completed',
        conclusion,
        title,
        summary,
      });
    }
    return { status: 'no_lockfile' };
  }

  // Two-step: in_progress first (so PR shows a running check), then complete.
  // If we already have an in-progress/queued check (crash recovery), reuse it.
  let checkRunId = recoverableRunId;
  if (checkRunId) {
    try {
      await updateCheckRun(token, {
        owner, repo, checkRunId,
        status: 'in_progress',
        title: 'OpenSoyce Guard scanning…',
        summary: `Inspecting ${lockfileFiles.length} lockfile change(s).`,
      });
    } catch (err) {
      console.error('guard-webhook: in_progress check patch failed', err?.message || err);
      // Don't bail — we'll attempt the completion update below.
    }
  } else {
    try {
      const created = await createCheckRun(token, {
        owner, repo, headSha, prNumber,
        status: 'in_progress',
        title: 'OpenSoyce Guard scanning…',
        summary: `Inspecting ${lockfileFiles.length} lockfile change(s).`,
      });
      checkRunId = created?.id;
    } catch (err) {
      console.error('guard-webhook: in_progress check create failed', err?.message || err);
      // Don't bail — fall through to single-shot completion below.
    }
  }

  // Real scanner: fetch each lockfile's content at the PR head, then run the
  // shared runScan pipeline (same path /api/scan uses). Auth: prefer the
  // operator's GITHUB_TOKEN (broad public read for scoring upstreams), fall
  // back to the installation token (App-scoped; will work for public repo
  // metadata but is rate-limited per installation). Removed files are
  // skipped — there's no lockfile-at-head to score.
  const scannerToken = process.env.GITHUB_TOKEN || token;
  const headers = githubHeaders(scannerToken);
  const getAnalysis = makeAnalysisMemo(headers);

  const perFile = await Promise.all(
    lockfileFiles.map(async (lockfileFile) => {
      if (lockfileFile.status === 'removed') {
        return {
          lockfileFile,
          scan: { ok: false, scored: [], totalDeps: 0, error: 'FILE_REMOVED' },
        };
      }
      let fetched;
      try {
        fetched = await fetchLockfileContent(token, owner, repo, lockfileFile.filename, headSha);
      } catch (err) {
        console.error('guard-webhook: lockfile fetch failed', lockfileFile.filename, err?.message || err);
        return {
          lockfileFile,
          scan: { ok: false, scored: [], totalDeps: 0, error: (err && err.code) || 'FETCH_FAILED' },
        };
      }
      const scan = await scanOneLockfile(fetched.text, lockfileFile.filename.split('/').pop(), getAnalysis);
      return { lockfileFile, scan };
    }),
  );

  const agg = aggregateScans(perFile);
  const allFailed = perFile.every((f) => !f.scan || !f.scan.ok);
  const { title, summary } = allFailed ? buildAllFailedReport(perFile) : buildReport(perFile, agg);
  const conclusion = decideConclusion(perFile, agg);

  try {
    if (checkRunId) {
      await updateCheckRun(token, { owner, repo, checkRunId, conclusion, title, summary });
    } else {
      await createCheckRun(token, {
        owner, repo, headSha, prNumber,
        status: 'completed',
        conclusion,
        title,
        summary,
      });
    }
  } catch (err) {
    console.error('guard-webhook: completed check post failed', err?.message || err);
    // If we have an in_progress check sitting there with no completion, try
    // a final failure update so the PR doesn't show a perpetually-running check.
    if (checkRunId) {
      await updateCheckRun(token, {
        owner, repo, checkRunId,
        conclusion: 'failure',
        title: 'Guard error.',
        summary: `Error: \`${(err?.message || 'unknown').slice(0, 300)}\``,
      }).catch(() => {});
    }
    return { status: 'check_completion_failed' };
  }

  // PR comment (mirrors the check summary, formatted as GuardPrCommentPreview).
  // Skip the comment when every lockfile scan failed — the check run already
  // surfaces the failure; a comment with zero numbers is just noise.
  if (!allFailed) {
    try {
      await upsertPrComment(token, {
        owner, repo, prNumber,
        body: buildPrComment(headSha, perFile, agg),
      });
    } catch (err) {
      // Comment failure is non-fatal; the check run is the source of truth.
      console.error('guard-webhook: PR comment failed', err?.message || err);
    }
  }

  return {
    status: 'scanned',
    lockfiles: lockfileFiles.length,
    changed: agg.totalChanged,
    counts: agg.counts,
    conclusion,
  };
}

// ---------------------------------------------------------------------------
// Handler entry
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch {
    return res.status(400).json({ error: 'BODY_READ_FAILED' });
  }

  const secret = process.env.GUARD_WEBHOOK_SECRET;
  if (!secret) {
    console.error('guard-webhook: GUARD_WEBHOOK_SECRET missing');
    // We return 500 here because there's no way the operator set this up
    // correctly — and at this point we haven't even verified the request
    // is from GitHub. Once env is set, this path is dead.
    return res.status(500).json({ error: 'WEBHOOK_SECRET_MISSING' });
  }

  const sig = req.headers['x-hub-signature-256'];
  if (!verifySignature(sig, rawBody, secret)) {
    return res.status(401).json({ error: 'SIGNATURE_MISMATCH' });
  }

  const event = req.headers['x-github-event'];

  // ping is what GitHub fires when the App is first installed / webhook
  // URL is updated. Must 200 cleanly or GitHub flags the webhook red.
  if (event === 'ping') {
    return res.status(200).json({ ok: true, pong: true });
  }

  if (event === 'installation' || event === 'installation_repositories') {
    let payload;
    try { payload = JSON.parse(rawBody.toString('utf8')); } catch { payload = null; }
    console.log('guard-webhook: install event', {
      event,
      action: payload?.action,
      account: payload?.installation?.account?.login,
      repos: payload?.repositories?.length ?? payload?.repositories_added?.length ?? 0,
    });
    return res.status(200).json({ ok: true, event });
  }

  if (event !== 'pull_request') {
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

  try {
    const result = await handlePullRequest(payload);
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    // Hard catch-all — we MUST 200 to GitHub, otherwise it retries forever.
    // The error is logged; if it was a check-run error we already tried to
    // surface it inside handlePullRequest().
    console.error('guard-webhook: unhandled error', err?.message || err, err?.stack);
    return res.status(200).json({ ok: false, error: 'INTERNAL_ERROR_LOGGED' });
  }
}
