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

import yaml from 'js-yaml';

import { getInstallationToken, githubFetch, fetchLockfileContent } from './_guard-app.js';
import { getSupabase } from './_supabase.js';
import { analyzeRepo, githubHeaders } from '../src/shared/analyzeRepo.js';
import { resolveDepIdentity } from '../src/shared/resolveDepIdentity.js';
import { runScan, mapWithConcurrency } from '../src/shared/runScan.js';
import { resolvePolicy, extractPolicyMetadata, parseYamlPolicy } from '../src/shared/policyInheritance.js';

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

// External-ID encoding for Check Runs. The base form keeps the Sprint+1
// dedupe shape (`guard-v0.2-{pr}-{sha}`); after we post the first PR comment
// for a given head SHA we append `:c{commentId}` so the NEXT webhook can read
// the comment ID directly off the check run lookup it already does — turning
// a 90-item paginated comment walk into a single GET.
const EXTERNAL_ID_PREFIX = 'guard-v0.2';

function buildExternalId(prNumber, headSha, commentId) {
  const base = `${EXTERNAL_ID_PREFIX}-${prNumber}-${headSha}`;
  return commentId ? `${base}:c${commentId}` : base;
}

function parseCommentIdFromExternalId(externalId) {
  if (typeof externalId !== 'string') return null;
  const m = /:c(\d+)$/.exec(externalId);
  return m ? Number(m[1]) : null;
}

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
    external_id: buildExternalId(prNumber, headSha),
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
      externalId: typeof latest.external_id === 'string' ? latest.external_id : null,
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
 * Patch ONLY the `external_id` of a check run, leaving status / conclusion /
 * output untouched. Used to stash the PR comment ID on the check run after
 * the first successful POST so the next webhook can skip `findGuardComment()`
 * entirely. Never throws — caller treats it as fire-and-forget.
 */
async function patchCheckRunExternalId(token, owner, repo, checkRunId, externalId) {
  const res = await githubFetch(token, `/repos/${owner}/${repo}/check-runs/${checkRunId}`, {
    method: 'PATCH',
    body: { external_id: externalId },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '(no body)');
    throw new Error(`CHECK_RUN_EXTERNAL_ID_PATCH_FAILED status=${res.status} body=${text.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Try the memoized comment ID. Returns the parsed comment object if the
 * direct GET returns 200 AND the body still carries our marker (defensive —
 * if a user has overwritten the comment with something else the marker is
 * gone and we want the marker-walk fallback to take over). Returns null
 * for 404, non-200, missing marker, or any thrown error.
 */
async function tryMemoizedComment(token, owner, repo, commentId) {
  try {
    const res = await githubFetch(token, `/repos/${owner}/${repo}/issues/comments/${commentId}`);
    if (res.status === 404) return null;
    if (!res.ok) {
      const text = await res.text().catch(() => '(no body)');
      console.error('guard-webhook: memoized comment GET non-OK', res.status, text.slice(0, 200));
      return null;
    }
    const json = await res.json();
    if (!json || typeof json.body !== 'string' || !json.body.includes(GUARD_COMMENT_MARKER)) {
      // Defensive: cheap safety against an external edit that stripped the
      // marker. Falling through to the marker-walk costs at most one GET.
      return null;
    }
    return { id: json.id };
  } catch (err) {
    console.error('guard-webhook: memoized comment GET threw', err?.message || err);
    return null;
  }
}

/**
 * Sticky PR comment: if a prior Guard comment exists (located either via the
 * memoized comment ID stashed on the check run's `external_id`, or — fallback
 * — by walking the PR's issue comments looking for the hidden HTML marker),
 * PATCH it with the new body. Otherwise POST a new comment. Either failure
 * mode falls back to POST so a transient API hiccup never silences the signal.
 *
 * Returns `{ commentId, wasCreated }` so the caller knows whether to stash
 * the new comment ID onto the check run's external_id.
 */
async function upsertPrComment(token, { owner, repo, prNumber, body, memoizedCommentId }) {
  // Fast path: direct GET on the memoized comment ID. Cuts a 1–3 page issue-
  // comment walk down to a single GET when the memo is intact.
  let existing = null;
  if (memoizedCommentId) {
    existing = await tryMemoizedComment(token, owner, repo, memoizedCommentId);
  }
  // Marker-walk fallback covers: first run on a PR, comment deleted by a
  // user, marker stripped by an external edit, or a malformed external_id
  // from a prior version of this code.
  if (!existing) {
    existing = await findGuardComment(token, owner, repo, prNumber);
  }
  if (existing && existing.id) {
    try {
      const res = await githubFetch(token, `/repos/${owner}/${repo}/issues/comments/${existing.id}`, {
        method: 'PATCH',
        body: { body },
      });
      if (res.ok) {
        await res.json().catch(() => null);
        return { commentId: existing.id, wasCreated: false };
      }
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
  const created = await res.json();
  return { commentId: created?.id ?? null, wasCreated: true };
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
    const pushRow = (name, label, reason, rawLabel) => {
      if (!name || !label) return;
      const key = `${ecosystem}:${name}`;
      if (seen.has(key)) return;
      seen.add(key);
      // `rawLabel` is the engine's pre-mapping verdict (USE READY / FORKABLE /
      // STABLE / WATCHLIST / RISKY / STALE). Carried through so the Sprint+4
      // verdict_snapshots writer can record lossless history — the comment/
      // SARIF surfaces still use `label` (FORKABLE collapsed to STABLE).
      scored.push({ name, ecosystem, label, reason: reason || label, rawLabel });
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
      pushRow(v.package, label, reason, verdict);
    }
    if (result.selectedHealth && Array.isArray(result.selectedHealth.scored)) {
      for (const row of result.selectedHealth.scored) {
        if (row.status !== 'SCORED') continue;
        const label = mapVerdictToLabel(row.verdict);
        if (!label) continue;
        // The engine doesn't surface a free-text reason for selected-health
        // rows. Fall back to verdict label — per spec, "don't invent reasons".
        pushRow(row.package, label, label, row.verdict);
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
  // `byKey` is exposed alongside `all` so the Sprint+4 verdict_snapshots
  // writer can iterate `${ecosystem}:${name}` keys without re-deriving them.
  return { all, byKey, counts, totalChanged: all.length };
}

// ---------------------------------------------------------------------------
// .opensoyce.yml policy support (PR 4).
//
// A repo can ship `.opensoyce.yml` in its DEFAULT BRANCH (we deliberately do
// NOT pass `?ref=` to the contents API so a PR author can't loosen policy in
// the same PR they're trying to land). Shape (only `policy` is honored — the
// other top-level keys parse-but-ignore for forward compat):
//
//   policy:
//     block: [graveyard, risky]
//     warn:  [watchlist, stable]
//     allow: [use-ready, forkable]
//
// Default (no file / fetch error / parse error / missing `policy` key) is
// warn-only and matches the PR-1-era hardcoded logic exactly:
//   block: []
//   warn:  [graveyard, risky, watchlist]
//   allow: [use-ready, stable, forkable]
// ---------------------------------------------------------------------------

const POLICY_KEYS = new Set(['use-ready', 'stable', 'forkable', 'watchlist', 'risky', 'graveyard']);

const DEFAULT_POLICY = Object.freeze({
  block: [],
  warn: ['graveyard', 'risky', 'watchlist'],
  allow: ['use-ready', 'stable', 'forkable'],
});

// Verdict-label → lowercase policy-key mapping. The engine emits FORKABLE
// distinct from STABLE; the UI collapses FORKABLE→STABLE for display but
// the policy keys stay distinct so a team can carve out forkable separately
// from stable if they want.
const LABEL_TO_POLICY_KEY = {
  'USE READY': 'use-ready',
  'STABLE': 'stable',
  'FORKABLE': 'forkable',
  'WATCHLIST': 'watchlist',
  'RISKY': 'risky',
  'GRAVEYARD': 'graveyard',
};

/**
 * Coerce one bucket (block/warn/allow) into a clean lowercase array of known
 * policy keys. Anything that isn't an array → []. Anything not a string →
 * dropped. Unknown labels → dropped with console.warn (so operators see when
 * they've typo'd a key).
 */
function normalizeBucket(raw, bucketName) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const lower = entry.toLowerCase().trim();
    if (!POLICY_KEYS.has(lower)) {
      console.warn(`guard-webhook: dropping unknown policy label in ${bucketName}: ${entry}`);
      continue;
    }
    out.push(lower);
  }
  return out;
}

/**
 * Fetch .opensoyce.yml from the repo's default branch.
 * Returns `{ raw, source: 'custom' | 'default', policy }` where `raw` is the
 * decoded YAML text (needed for org/preset metadata extraction).
 * Any failure mode falls back to the safe default — we never break the PR
 * check on policy-fetch problems.
 */
async function fetchPolicy(token, owner, repo) {
  let raw;
  try {
    // No `?ref=` → contents API uses the repo's default branch tip. That's
    // load-bearing: it means a PR author can't ship a weaker policy IN the
    // same PR they want to merge.
    const res = await githubFetch(token, `/repos/${owner}/${repo}/contents/.opensoyce.yml`);
    if (res.status === 404) {
      return { raw: null, source: 'default', policy: DEFAULT_POLICY };
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '(no body)');
      console.error('guard-webhook: fetchPolicy non-OK', res.status, text.slice(0, 200));
      return { raw: null, source: 'default', policy: DEFAULT_POLICY };
    }
    const json = await res.json();
    if (!json || typeof json.content !== 'string') {
      console.error('guard-webhook: fetchPolicy missing content field');
      return { raw: null, source: 'default', policy: DEFAULT_POLICY };
    }
    raw = Buffer.from(json.content, 'base64').toString('utf8');
  } catch (err) {
    console.error('guard-webhook: fetchPolicy threw', err?.message || err);
    return { raw: null, source: 'default', policy: DEFAULT_POLICY };
  }

  const policy = parseYamlPolicy(raw);
  if (!policy) {
    return { raw, source: 'default', policy: DEFAULT_POLICY };
  }
  return { raw, source: 'custom', policy };
}

/**
 * Apply a policy to the aggregated scan results. Per dep:
 *   - label in policy.block → BLOCK
 *   - else label in policy.warn → WARN
 *   - else → OK (covers explicit allow + anything unclassified)
 *
 * Sprint+3 exception demotion (BLOCK → WARN only):
 *   When `exceptions` (Map<`${ecosystem}:${name}`, { reason, expires_at,
 *   granted_by }>) contains a dep that WOULD have been BLOCKed by policy,
 *   that dep is demoted to WARN instead. The dep stays visible in the
 *   "Warnings" section, annotated with the exception reason + expiry, but
 *   it no longer drives the Check Run to `failure`. Exceptions DO NOT
 *   affect WARN deps (no WARN→OK demotion) and DO NOT affect deps whose
 *   label isn't in `policy.block`. Tracks demoted rows in
 *   `decision.exceptionsApplied` so the comment footer can surface the
 *   "N active exception(s)" suffix.
 *
 * Returns `{ conclusion, blockedDeps, warnDeps, exceptionsApplied }`:
 *   - Any BLOCK → `failure`
 *   - No BLOCK, any WARN → `neutral`
 *   - All OK → `success`
 */
function applyPolicy(policy, agg, exceptions) {
  const block = new Set(policy.block);
  const warn = new Set(policy.warn);
  const exceptionMap = exceptions instanceof Map ? exceptions : null;
  const blockedDeps = [];
  const warnDeps = [];
  let exceptionsApplied = 0;
  for (const row of agg.all) {
    const key = LABEL_TO_POLICY_KEY[row.label];
    if (!key) continue;
    if (block.has(key)) {
      const exKey = `${row.ecosystem}:${row.name}`;
      const exception = exceptionMap ? exceptionMap.get(exKey) : null;
      if (exception) {
        // BLOCK → WARN demotion. Keep visibility, lose the failure conclusion.
        // Carry exception metadata onto the row so the comment renderer can
        // surface "(exception expires <date>: <reason>)".
        warnDeps.push({ ...row, exception });
        exceptionsApplied += 1;
      } else {
        blockedDeps.push(row);
      }
    } else if (warn.has(key)) {
      warnDeps.push(row);
    }
  }
  let conclusion;
  if (blockedDeps.length > 0) conclusion = 'failure';
  else if (warnDeps.length > 0) conclusion = 'neutral';
  else conclusion = 'success';
  return { conclusion, blockedDeps, warnDeps, exceptionsApplied };
}

// ---------------------------------------------------------------------------
// Exceptions lookup (Sprint+3).
//
// Reads non-revoked, non-expired rows from Supabase's `exceptions` table for
// the current (owner, repo). Returns a Map keyed by `${ecosystem}:${package}`
// (the same shape `aggregateScans` uses) so `applyPolicy` can demote BLOCKs
// in O(1) per dep.
//
// FAILURE-MODE CONTRACT: this lookup is best-effort. Missing env vars, table
// not migrated, network failures, query errors — every failure mode returns
// an EMPTY MAP with a single console.warn. The check run MUST NEVER fail
// because Supabase is down or unconfigured.
// ---------------------------------------------------------------------------

async function fetchExceptions(owner, repo) {
  let sb;
  try {
    sb = getSupabase();
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    if (msg === 'SUPABASE_ENV_MISSING') {
      console.warn('guard-webhook: exceptions lookup skipped: SUPABASE_ENV_MISSING');
    } else {
      console.warn('guard-webhook: exceptions lookup skipped:', msg);
    }
    return new Map();
  }
  try {
    const { data, error } = await sb
      .from('exceptions')
      .select('package_name, ecosystem, reason, expires_at, granted_by, status')
      .eq('owner', owner)
      .eq('repo', repo)
      .is('revoked_at', null)
      .or('status.eq.approved,status.is.null')
      .gt('expires_at', new Date().toISOString());
    if (error) {
      console.warn('guard-webhook: exceptions lookup failed:', error.message);
      return new Map();
    }
    const map = new Map();
    for (const row of data || []) {
      if (!row || typeof row.ecosystem !== 'string' || typeof row.package_name !== 'string') continue;
      map.set(`${row.ecosystem}:${row.package_name}`, {
        reason: row.reason || '',
        expires_at: row.expires_at,
        granted_by: row.granted_by || '',
      });
    }
    return map;
  } catch (err) {
    console.warn('guard-webhook: exceptions lookup threw:', err && err.message ? err.message : err);
    return new Map();
  }
}

// ---------------------------------------------------------------------------
// Verdict snapshots writer (Sprint+4 PR 1).
//
// After every PR scan, insert one row per scored dep into Supabase's
// `verdict_snapshots` table. This is the data the Sprint+4 watchlist
// dashboard (PRs 2/3) will read to surface current verdicts across watched
// repos and detect recent degradations.
//
// Stores the RAW engine label (USE READY / FORKABLE / STABLE / WATCHLIST /
// RISKY / GRAVEYARD — note GRAVEYARD is the schema's spelling for STALE), not
// the FORKABLE→STABLE-collapsed display label, so the history is lossless
// for future analysis.
//
// FAILURE-MODE CONTRACT (mirrors fetchExceptions): the webhook MUST NEVER
// fail because Supabase is down or unconfigured. Env missing, insert error,
// or 1s timeout all degrade to a single console.warn and an empty return.
// ---------------------------------------------------------------------------

const VALID_SNAPSHOT_LABELS = new Set([
  'USE READY', 'STABLE', 'FORKABLE', 'WATCHLIST', 'RISKY', 'GRAVEYARD',
]);

// Engine emits STALE; the snapshot schema's check constraint spells it
// GRAVEYARD. Normalize at the boundary so the raw history is still lossless
// against the agreed schema vocabulary (STALE and GRAVEYARD mean the same
// thing — "the package is abandoned"; the engine and the schema just picked
// different words).
function normalizeRawLabel(rawLabel) {
  if (typeof rawLabel !== 'string') return null;
  if (rawLabel === 'STALE') return 'GRAVEYARD';
  return VALID_SNAPSHOT_LABELS.has(rawLabel) ? rawLabel : null;
}

async function recordVerdictSnapshots(owner, repo, agg) {
  const byKey = agg && agg.byKey instanceof Map ? agg.byKey : null;
  if (!byKey || byKey.size === 0) return;

  const rows = [];
  for (const [key, dep] of byKey.entries()) {
    const sepIdx = key.indexOf(':');
    if (sepIdx <= 0) continue;
    const ecosystem = key.slice(0, sepIdx);
    const name = key.slice(sepIdx + 1);
    const normalized = normalizeRawLabel(dep.rawLabel);
    if (!normalized) {
      console.warn(
        'guard-webhook: snapshot dropping row with invalid label',
        { ecosystem, name, rawLabel: dep.rawLabel },
      );
      continue;
    }
    rows.push({
      owner,
      repo,
      package_name: name,
      ecosystem,
      label: normalized,
    });
  }
  if (rows.length === 0) return;

  let sb;
  try {
    sb = getSupabase();
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    console.warn('guard-webhook: snapshot write skipped:', msg);
    return;
  }

  // Race the insert against a 1s timeout so a slow / hung Supabase never
  // pushes us past the Check Run round-trip budget. Vercel recycles the
  // function after the response is sent so a fire-and-forget Promise might
  // not complete — we have to wait, but only for 1s.
  const insertPromise = sb.from('verdict_snapshots').insert(rows);
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('snapshot_insert_timeout')), 1000),
  );
  try {
    const result = await Promise.race([insertPromise, timeoutPromise]);
    if (result && result.error) {
      console.warn('guard-webhook: snapshot insert error:', result.error.message);
    }
  } catch (err) {
    console.warn(
      'guard-webhook: snapshot insert timed out or threw:',
      err && err.message ? err.message : err,
    );
  }
}

/**
 * Sprint+5 PR 1: post a one-line Slack alert when the Guard decision concludes
 * `failure`. Per-repo Slack incoming-webhook URLs live in the `notifications`
 * table (see docs/supabase-sprint-5.md). Runs in parallel with the check-run
 * / comment / snapshot writes so it adds zero wall-clock latency when Slack
 * is healthy.
 *
 * Hard contract: this function NEVER throws. Every failure path —
 * `SUPABASE_ENV_MISSING`, DB timeout, missing row, NULL URL, bad URL prefix,
 * 4xx/5xx from Slack, fetch timeout, network error — collapses to a
 * console.warn / console.error + silent return so the Check Run pipeline
 * stays insulated from notification breakage.
 */
async function maybePostSlackAlert(owner, repo, decision, prNumber, prTitle, prUrl, headSha) {
  try {
    if (!decision || decision.conclusion !== 'failure') return;

    let sb;
    try {
      sb = getSupabase();
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      console.warn('guard-webhook: slack alert skipped:', msg);
      return;
    }

    // 1s DB-lookup budget — same shape as recordVerdictSnapshots. A slow
    // Supabase must not push us past the Check Run round-trip.
    const lookupPromise = sb
      .from('notifications')
      .select('slack_webhook_url')
      .eq('owner', owner)
      .eq('repo', repo)
      .maybeSingle();
    const lookupTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('slack_lookup_timeout')), 1000),
    );

    let row;
    try {
      const result = await Promise.race([lookupPromise, lookupTimeout]);
      if (result && result.error) {
        console.warn(
          'guard-webhook: slack notifications lookup error:',
          result.error.message,
        );
        return;
      }
      row = result && result.data;
    } catch (err) {
      console.warn(
        'guard-webhook: slack notifications lookup timed out or threw:',
        err && err.message ? err.message : err,
      );
      return;
    }

    if (!row || !row.slack_webhook_url) {
      // No row → repo never configured Slack. NULL URL → notifications
      // intentionally disabled (row kept for audit). Either way, silent.
      return;
    }

    const url = row.slack_webhook_url;
    if (typeof url !== 'string' || !url.startsWith('https://hooks.slack.com/services/')) {
      // Defense in depth: a malformed or spoofed value can't redirect
      // alerts to an attacker-controlled host.
      console.warn(
        'guard-webhook: slack url rejected (bad prefix)',
        { owner, repo, headSha: typeof headSha === 'string' ? headSha.slice(0, 7) : null },
      );
      return;
    }

    const blockerCount = Array.isArray(decision.blockedDeps) ? decision.blockedDeps.length : 0;
    const hasTitle = typeof prTitle === 'string' && prTitle.length > 0;
    // Slack `text` mode uses `<url|label>` for inline links — Markdown's
    // `[label](url)` is ignored. Backticks render as code, same as Markdown.
    const linkLabel = hasTitle ? `#${prNumber} ${prTitle}` : `PR #${prNumber}`;
    const text = `:warning: OpenSoyce Guard found ${blockerCount} blocker(s) in <${prUrl}|${linkLabel}> on \`${owner}/${repo}\``;
    const payload = { text };

    // 2s fetch budget — Slack incoming webhooks normally respond in <500ms.
    const controller = new AbortController();
    const fetchTimeout = setTimeout(() => controller.abort(), 2000);
    let resp;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      if (err && err.name === 'AbortError') {
        console.warn('guard-webhook: slack post timed out (>2s)');
      } else {
        console.warn('guard-webhook: slack post fetch failed:', msg);
      }
      return;
    } finally {
      clearTimeout(fetchTimeout);
    }

    if (!resp.ok) {
      let bodyText = '';
      try {
        bodyText = (await resp.text()).slice(0, 200);
      } catch {
        // Body unreadable — log just the status.
      }
      console.warn(
        'guard-webhook: slack post non-2xx:',
        { status: resp.status, body: bodyText },
      );
      return;
    }
  } catch (err) {
    // Catch-all guard: contract is "never throws".
    console.error(
      'guard-webhook: slack alert unexpected failure:',
      err && err.message ? err.message : err,
    );
  }
}

/**
 * Format an exception's `expires_at` timestamp (ISO string) as a bare date
 * for the comment annotation. Falls back gracefully on malformed input.
 */
function formatExpiry(expiresAt) {
  if (typeof expiresAt !== 'string' || !expiresAt) return 'unknown';
  const d = new Date(expiresAt);
  if (Number.isNaN(d.getTime())) return 'unknown';
  // YYYY-MM-DD — short, unambiguous, locale-free.
  return d.toISOString().slice(0, 10);
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
 * Conclusion logic (PR 4): if NO lockfile scanned successfully → failure.
 * Otherwise the policy decision drives it (block/warn/allow). Pass through
 * `decision.conclusion` from `applyPolicy()`.
 */
function decideConclusion(perFile, decision) {
  const anyOk = perFile.some((f) => f.scan && f.scan.ok);
  if (!anyOk) return 'failure';
  return decision.conclusion;
}

// ---------------------------------------------------------------------------
// SARIF 2.1.0 inline report (Sprint+2 PR 3).
//
// We emit a SARIF doc as a fenced JSON code block inside the Check Run's
// `output.text` (via `output.summary`, GitHub treats both the same — 64 KB
// cap). The doc is wrapped in a <details> so the human verdict stays the
// headline; reviewers expand the block to copy/save SARIF, and downstream
// tooling polling the Check Run API can grep the fence to extract it.
//
// One `result` entry per (non-OK dep, lockfile) pair. USE READY is skipped
// entirely (it's "all clear" — nothing for a SARIF consumer to triage).
// FORKABLE is collapsed to STABLE (matches the rest of the comment shape).
//
// Severity mapping:
//   graveyard, risky → error
//   watchlist        → warning
//   stable           → note
// ---------------------------------------------------------------------------

const SARIF_TOOL_DRIVER = Object.freeze({
  name: 'OpenSoyce Guard',
  informationUri: 'https://www.opensoyce.com/guard',
  version: '0.2.0',
  rules: [
    { id: 'graveyard', name: 'GraveyardDependency', shortDescription: { text: 'Dependency on an abandoned package.' }, defaultConfiguration: { level: 'error' } },
    { id: 'risky', name: 'RiskyDependency', shortDescription: { text: 'Dependency with unresolved security or maintenance risk.' }, defaultConfiguration: { level: 'error' } },
    { id: 'watchlist', name: 'WatchlistDependency', shortDescription: { text: 'Dependency on a fast-moving package or recent advisory history.' }, defaultConfiguration: { level: 'warning' } },
    { id: 'stable', name: 'StableDependency', shortDescription: { text: 'Dependency on a stable package.' }, defaultConfiguration: { level: 'note' } },
  ],
});

// Severity rank for descending-severity truncation (error first).
const SARIF_LEVEL_RANK = { error: 3, warning: 2, note: 1 };

/**
 * Map a Guard label to the SARIF ruleId / level pair.
 * Returns null for USE READY (skipped entirely per spec).
 */
function sarifClassify(label) {
  switch (label) {
    case 'GRAVEYARD': return { ruleId: 'graveyard', level: 'error' };
    case 'RISKY': return { ruleId: 'risky', level: 'error' };
    case 'WATCHLIST': return { ruleId: 'watchlist', level: 'warning' };
    // FORKABLE arrives mapped to STABLE already (mapVerdictToLabel above).
    case 'STABLE': return { ruleId: 'stable', level: 'note' };
    case 'USE READY': return null;
    default: return null;
  }
}

/**
 * Build a SARIF 2.1.0 document from the per-file scan rows. One `result` per
 * (dep, lockfile) pair — SARIF consumers expect granular locations, and a
 * monorepo with the same risky dep in multiple lockfiles should surface each.
 *
 * @param {Array<{ lockfileFile: { filename: string }, scan: { ok: boolean, scored: Array<{ name: string, label: string, reason: string }> } }>} perFile
 * @returns {object} SARIF 2.1.0 document.
 */
function buildSarifReport(perFile) {
  const results = [];
  for (const f of perFile) {
    if (!f.scan || !f.scan.ok) continue;
    const uri = f.lockfileFile.filename;
    for (const row of f.scan.scored) {
      const cls = sarifClassify(row.label);
      if (!cls) continue;
      // version isn't surfaced by runScan's per-dep output today; reason
      // carries the engine's "why" string (or the label as a fallback).
      const messageParts = [row.name];
      if (row.reason && row.reason !== row.label) {
        messageParts.push(` — ${row.reason}`);
      }
      results.push({
        ruleId: cls.ruleId,
        level: cls.level,
        message: { text: messageParts.join('') },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri },
            },
            logicalLocations: [
              { name: row.name, kind: 'package' },
            ],
          },
        ],
      });
    }
  }
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: { driver: SARIF_TOOL_DRIVER },
        results,
      },
    ],
  };
}

/**
 * JSON.stringify the SARIF doc with size-aware truncation. If the serialized
 * doc + already-built human summary would exceed `maxBytes`, drop SARIF
 * `results` entries (lowest severity first) until it fits. The driver block
 * stays — a SARIF doc with zero results is still valid.
 *
 * Returns `{ text, truncatedCount, totalCount }` where `text` is the final
 * JSON string and `truncatedCount` is how many results were dropped.
 */
function serializeSarif(sarif, maxBytes) {
  const totalCount = sarif.runs?.[0]?.results?.length ?? 0;
  // Quick path: full doc fits.
  let text = JSON.stringify(sarif, null, 2);
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) {
    return { text, truncatedCount: 0, totalCount };
  }
  // Sort results by severity desc (error > warning > note); within the same
  // severity, preserve original order (stable sort in V8).
  const original = sarif.runs[0].results;
  const ranked = original
    .map((r, idx) => ({ r, idx, rank: SARIF_LEVEL_RANK[r.level] ?? 0 }))
    .sort((a, b) => (b.rank - a.rank) || (a.idx - b.idx))
    .map((x) => x.r);
  // Binary-search the largest prefix that fits. Avoids quadratic stringify.
  let lo = 0;
  let hi = ranked.length;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const trial = {
      ...sarif,
      runs: [{ ...sarif.runs[0], results: ranked.slice(0, mid) }],
    };
    const trialText = JSON.stringify(trial, null, 2);
    if (Buffer.byteLength(trialText, 'utf8') <= maxBytes) {
      best = mid;
      text = trialText;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return { text, truncatedCount: totalCount - best, totalCount };
}

/**
 * Append the SARIF doc to a Check Run summary as a collapsed <details> block.
 * 64 KB is the Check Run output.text cap; we leave a margin so the GitHub UI
 * (which adds whitespace) doesn't trip on the edge.
 *
 * Returns the new summary string. If the summary alone is already over the
 * SARIF budget the SARIF block is omitted (the human verdict wins).
 */
function appendSarifBlock(summary, perFile) {
  const CHECK_RUN_BUDGET = 64 * 1024;
  const SAFETY_MARGIN = 1024; // leave a kilobyte for GitHub's UI overhead
  const summaryBytes = Buffer.byteLength(summary, 'utf8');
  // Reserve ~400 bytes for the <details> wrapper + truncation footer.
  const sarifBudget = CHECK_RUN_BUDGET - SAFETY_MARGIN - summaryBytes - 400;
  if (sarifBudget < 512) {
    // Not enough room left even for the smallest meaningful SARIF doc.
    return summary;
  }
  const sarif = buildSarifReport(perFile);
  if ((sarif.runs?.[0]?.results?.length ?? 0) === 0) {
    // Nothing to triage — all deps are USE READY (or there were no deps).
    // Skip the block entirely; the human summary already says "0 blocked, 0 warned".
    return summary;
  }
  const { text, truncatedCount, totalCount } = serializeSarif(sarif, sarifBudget);
  const truncationNote = truncatedCount > 0
    ? `\n<sub>SARIF results truncated to first ${totalCount - truncatedCount} of ${totalCount}.</sub>`
    : '';
  // Note: the inner fence uses ``` and the outer markdown context keeps the
  // <details> open — GitHub renders this exactly as the spec illustrates.
  const block = [
    '',
    '<details>',
    '<summary>SARIF report (click to expand)</summary>',
    '',
    '```json',
    text,
    '```',
    '',
    '</details>',
    truncationNote,
  ].join('\n');
  return summary + block;
}

function buildReport(perFile, agg, decision) {
  const n = perFile.length;
  const list = perFile.map((f) => {
    const status = f.scan && f.scan.ok
      ? f.lockfileFile.status
      : `scan failed: ${f.scan && f.scan.error ? f.scan.error : 'unknown'}`;
    return `- \`${f.lockfileFile.filename}\` (${status})`;
  }).join('\n');
  const top = [...decision.blockedDeps, ...decision.warnDeps]
    .slice(0, 5)
    .map((r) => `- \`${r.name}\` — ${r.label}`)
    .join('\n') || '_none_';
  const title = `Guard scanned ${n} lockfile${n === 1 ? '' : 's'} — ${decision.blockedDeps.length} blocked, ${decision.warnDeps.length} warned.`;
  const humanSummary = [
    `**Guard scanned ${n} lockfile${n === 1 ? '' : 's'}. ${decision.blockedDeps.length} blocked, ${decision.warnDeps.length} warned.**`,
    '',
    'Lockfiles inspected:',
    list,
    '',
    'Top issues:',
    top,
    '',
    '(_Full breakdown in PR comment._)',
  ].join('\n');
  const summary = appendSarifBlock(humanSummary, perFile);
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
  return rows.map((r) => {
    // Demoted-from-BLOCK rows carry an `exception` payload. Distinguish them
    // visually from organic WATCHLIST/WARN rows so the team can see at a
    // glance which warnings are "excepted blocks" vs. raw warnings.
    if (r.exception) {
      const expiry = formatExpiry(r.exception.expires_at);
      const reason = r.exception.reason ? `: "${r.exception.reason}"` : '';
      return `- \`${r.name}\` — ${r.label} (exception expires ${expiry}${reason})`;
    }
    return `- \`${r.name}\` — ${r.label} — ${r.reason}`;
  }).join('\n');
}

function buildPrComment(headSha, perFile, agg, decision, policySource) {
  const lockfileLines = perFile.map((f) => {
    const status = f.scan && f.scan.ok
      ? f.lockfileFile.status
      : `scan failed: ${f.scan && f.scan.error ? f.scan.error : 'unknown'}`;
    return `- \`${f.lockfileFile.filename}\` (${status})`;
  }).join('\n');
  const exceptionsApplied = decision && typeof decision.exceptionsApplied === 'number'
    ? decision.exceptionsApplied
    : 0;
  const exceptionSuffix = exceptionsApplied > 0
    ? ` — ${exceptionsApplied} active exception${exceptionsApplied === 1 ? '' : 's'}.`
    : '';
  // Phase 3: richer policy source labels (preset/org/repo/default).
  const policyBase = policySource && policySource !== 'default'
    ? `Policy: ${policySource}.`
    : 'Policy: default warn-only.';
  const policyFooter = `<sub>${policyBase} v0.2${exceptionSuffix}</sub>`;
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
      policyFooter,
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
    renderRows(decision.blockedDeps),
    '',
    '**Warnings:**',
    renderRows(decision.warnDeps),
    '',
    '**Suggested next moves:**',
    '- Replace graveyard dependencies',
    '- Pin and watch risky dependencies',
    '- Review warnings before merging',
    '',
    policyFooter,
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
  // Sprint+5 PR 1: surface these to the Slack alert path. Both may be
  // missing on edge-case payloads — maybePostSlackAlert handles falsy values.
  const prTitle = payload?.pull_request?.title;
  const prUrl = payload?.pull_request?.html_url;

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

  // Pull the memoized comment ID off the existing check run's external_id
  // (if present). On a warm second-webhook this avoids the 1–3 page issue-
  // comment walk in upsertPrComment.
  const memoizedCommentId = existingRun
    ? parseCommentIdFromExternalId(existingRun.externalId)
    : null;

  IN_FLIGHT_RUNS.add(inFlightKey);
  try {
    return await runPullRequestScan({
      token, owner, repo, prNumber, headSha, existingRun, memoizedCommentId,
      prTitle, prUrl,
    });
  } finally {
    IN_FLIGHT_RUNS.delete(inFlightKey);
  }
}

async function runPullRequestScan({ token, owner, repo, prNumber, headSha, existingRun, memoizedCommentId, prTitle, prUrl }) {
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

  // Phase 3: Full policy resolution pipeline (preset → org → repo merge).
  // fetchPolicy gives us the raw YAML + local repo policy. We then extract
  // org:/preset: metadata and run the security-conservative merge.
  const { raw: rawYaml, policy: repoPolicy } = await fetchPolicy(token, owner, repo);
  const { orgPolicyRepo, preset } = rawYaml
    ? extractPolicyMetadata(rawYaml)
    : { orgPolicyRepo: null, preset: null };
  const boundGithubFetch = (path) => githubFetch(token, path);
  const { policy, policySource } = await resolvePolicy({
    githubFetch: boundGithubFetch,
    orgPolicyRepo,
    preset,
    repoPolicy: repoPolicy && repoPolicy !== DEFAULT_POLICY ? repoPolicy : null,
  });

  // Sprint+3: consult the exceptions table. Failure modes (Supabase down,
  // env unset, table not migrated, query error) all degrade to an empty
  // Map inside fetchExceptions — the check run NEVER fails because of an
  // exceptions-lookup hiccup.
  const exceptions = await fetchExceptions(owner, repo);
  const decision = applyPolicy(policy, agg, exceptions);

  const { title, summary } = allFailed ? buildAllFailedReport(perFile) : buildReport(perFile, agg, decision);
  const conclusion = decideConclusion(perFile, decision);

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
  // surfaces the failure; a comment with zero numbers is just noise. The
  // Sprint+4 snapshot write runs in parallel with the comment upsert so the
  // Supabase round-trip costs zero perceived latency when the DB is healthy
  // (the comment write is its peer in wall-clock time); when Supabase is
  // slow/down the 1s timeout inside recordVerdictSnapshots caps the worst case.
  const commentPromise = allFailed
    ? Promise.resolve()
    : (async () => {
        try {
          const { commentId, wasCreated } = await upsertPrComment(token, {
            owner, repo, prNumber,
            body: buildPrComment(headSha, perFile, agg, decision, policySource),
            memoizedCommentId,
          });
          // After posting a FRESH comment (first time on this head SHA, or after
          // the prior one was deleted), stash its ID on the check run's
          // external_id so the next webhook can skip findGuardComment(). PATCH
          // path doesn't need this — the existing external_id already points at
          // the same comment we just updated. Fire-and-forget: the marker-walk
          // fallback covers any failure here, so don't block the response.
          if (wasCreated && commentId && checkRunId) {
            patchCheckRunExternalId(
              token, owner, repo, checkRunId,
              buildExternalId(prNumber, headSha, commentId),
            ).catch((err) => console.error(
              'guard-webhook: patch external_id failed', err?.message || err,
            ));
          }
        } catch (err) {
          // Comment failure is non-fatal; the check run is the source of truth.
          console.error('guard-webhook: PR comment failed', err?.message || err);
        }
      })();

  // recordVerdictSnapshots never throws — its contract is to swallow every
  // failure mode (env missing, insert error, 1s timeout) into a console.warn —
  // so plain Promise.all is safe here without a wrapping try/catch.
  // maybePostSlackAlert follows the same contract (Sprint+5 PR 1): it
  // short-circuits when conclusion !== 'failure' (no DB call) and absorbs
  // every error path (missing env, DB timeout, missing/disabled config,
  // bad URL prefix, Slack 4xx/5xx, fetch timeout) into a log + return.
  await Promise.all([
    commentPromise,
    recordVerdictSnapshots(owner, repo, agg),
    maybePostSlackAlert(owner, repo, decision, prNumber, prTitle, prUrl, headSha),
  ]);

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
