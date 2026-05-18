/**
 * OpenSoyce Guard — GitHub App webhook handler (v0.1).
 *
 * Purpose:
 *   Catch risky dependency changes before they merge. For every PR with a
 *   lockfile change, post a Check Run + a PR comment summarizing what
 *   would be scanned.
 *
 * v0.1 scope (this file):
 *   1. Verify x-hub-signature-256 (HMAC-SHA256, constant-time compare).
 *   2. Dispatch by x-github-event:
 *        installation / installation_repositories  -> log + 200
 *        pull_request (opened|synchronize|reopened) -> handlePullRequest()
 *        anything else -> 200 no-op (incl. ping)
 *   3. handlePullRequest():
 *        - Mint installation token (App JWT -> token exchange).
 *        - List PR files; filter to known lockfiles.
 *        - No lockfile changes -> neutral check run + return.
 *        - Lockfile changes  -> in-progress check run -> success stub
 *                                + PR comment.
 *   4. Idempotency: in-memory Set of head SHAs already processed.
 *   5. Always return 200 on processed events. NEVER 5xx to GitHub — it
 *      retries failed deliveries aggressively and we'd spam ourselves.
 *
 * Out of scope (sprint+1):
 *   - Real scoring engine integration (currently stubbed at 0/0/0).
 *   - Persistent dedupe (in-memory Map is wiped on cold start).
 *   - Sticky PR comments (always posts a new comment per event).
 *
 * Why a separate file from github-webhook.js:
 *   This is a distinct App (different App ID, different secret, different
 *   permissions). Both apps can coexist installed on the same repo —
 *   github-webhook.js is the v3d risk scanner, guard-webhook.js is the
 *   lockfile-diff Guard.
 */

import crypto from 'node:crypto';

import { generateAppJwt, getInstallationToken, githubFetch } from './_guard-app.js';

// Vercel: 60s function timeout (matches github-webhook.js).
export const maxDuration = 60;

// Required: raw bytes for HMAC. Vercel auto-parses JSON; disable it.
export const config = {
  api: { bodyParser: false },
};

const CHECK_RUN_NAME = 'OpenSoyce Guard';

const LOCKFILE_NAMES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'uv.lock',
  'poetry.lock',
]);

// In-memory dedupe. Vercel functions are short-lived but warm instances
// reuse this. Bounded so a long-lived warm instance can't leak memory.
// Persistent dedupe is sprint+1.
const PROCESSED_SHAS = new Set();
const PROCESSED_MAX = 500;

function markProcessed(sha) {
  PROCESSED_SHAS.add(sha);
  if (PROCESSED_SHAS.size > PROCESSED_MAX) {
    // Drop the oldest entry (insertion order = iteration order in Set).
    const first = PROCESSED_SHAS.values().next().value;
    if (first !== undefined) PROCESSED_SHAS.delete(first);
  }
}

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
    external_id: `guard-v0.1-${prNumber}-${headSha}`,
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

async function updateCheckRun(token, { owner, repo, checkRunId, conclusion, title, summary }) {
  const res = await githubFetch(token, `/repos/${owner}/${repo}/check-runs/${checkRunId}`, {
    method: 'PATCH',
    body: {
      status: 'completed',
      conclusion,
      output: { title, summary },
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '(no body)');
    throw new Error(`CHECK_RUN_UPDATE_FAILED status=${res.status} body=${text.slice(0, 200)}`);
  }
  return res.json();
}

async function postPrComment(token, { owner, repo, prNumber, body }) {
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
// v0.1 stub report builders. The real scorer integration is sprint+1.
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

function buildStubReport(lockfileFiles) {
  const n = lockfileFiles.length;
  const list = lockfileFiles.map((f) => `- \`${f.filename}\` (${f.status})`).join('\n');
  const summary = [
    `**Guard scanned ${n} lockfile${n === 1 ? '' : 's'}. 0 graveyard, 0 risky, 0 watchlist.**`,
    '',
    'Lockfiles inspected:',
    list,
    '',
    '_Full scoring integration coming in v0.2._',
  ].join('\n');
  return {
    title: `Guard scanned ${n} lockfile${n === 1 ? '' : 's'} — 0 issues (stub).`,
    summary,
  };
}

function buildPrComment(headSha, lockfileFiles) {
  const n = lockfileFiles.length;
  const fileList = lockfileFiles.map((f) => `- \`${f.filename}\` (${f.status})`).join('\n');
  // GuardPrCommentPreview shape: verdict header, scanned-list, blocked-list.
  // v0.1: blocked list is always empty (stub scorer).
  return [
    `### OpenSoyce Guard — verdict for \`${headSha.slice(0, 7)}\``,
    '',
    `**Verdict:** clean (stub) — 0 graveyard, 0 risky, 0 watchlist.`,
    '',
    `**Lockfiles scanned (${n}):**`,
    fileList,
    '',
    `**Blocked dependencies:** _none_`,
    '',
    `<sub>v0.1 stub. Real scoring integration is in flight — this comment will gain richer detail in v0.2.</sub>`,
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

  // Dedupe by head SHA. Same SHA shouldn't be re-scored if we're warm.
  const dedupeKey = `${owner}/${repo}#${prNumber}@${headSha}`;
  if (PROCESSED_SHAS.has(dedupeKey)) {
    return { status: 'duplicate', headSha };
  }

  // Mint installation token. No caching in v0.1.
  const tokenResp = await getInstallationToken(installationId);
  const token = tokenResp.token;

  // List PR files first so we can decide whether to even create a check run.
  let files;
  try {
    files = await listPrFiles(token, owner, repo, prNumber);
  } catch (err) {
    console.error('guard-webhook: listPrFiles failed', err?.message || err);
    // Create a failure check so the PR author sees something went wrong.
    await createCheckRun(token, {
      owner, repo, headSha, prNumber,
      status: 'completed',
      conclusion: 'failure',
      title: 'Guard could not list PR files.',
      summary: `Error: \`${(err?.message || 'unknown').slice(0, 300)}\``,
    }).catch((e) => console.error('guard-webhook: failure check create failed', e?.message || e));
    markProcessed(dedupeKey);
    return { status: 'list_files_failed' };
  }

  const lockfileFiles = filterLockfiles(files);

  if (lockfileFiles.length === 0) {
    const { conclusion, title, summary } = buildNoLockfileCheck(headSha);
    await createCheckRun(token, {
      owner, repo, headSha, prNumber,
      status: 'completed',
      conclusion,
      title,
      summary,
    });
    markProcessed(dedupeKey);
    return { status: 'no_lockfile' };
  }

  // Two-step: in_progress first (so PR shows a running check), then complete.
  // For v0.1 the second step happens immediately; the gap exists so v0.2's
  // real scorer can slot in here without changing the UI contract.
  let checkRunId;
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
    // Don't bail — the scorer stub still has value. Fall through to single-shot.
  }

  const { title, summary } = buildStubReport(lockfileFiles);

  try {
    if (checkRunId) {
      await updateCheckRun(token, { owner, repo, checkRunId, conclusion: 'success', title, summary });
    } else {
      await createCheckRun(token, {
        owner, repo, headSha, prNumber,
        status: 'completed',
        conclusion: 'success',
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
    markProcessed(dedupeKey);
    return { status: 'check_completion_failed' };
  }

  // PR comment (mirrors the check summary, formatted as GuardPrCommentPreview).
  try {
    await postPrComment(token, {
      owner, repo, prNumber,
      body: buildPrComment(headSha, lockfileFiles),
    });
  } catch (err) {
    // Comment failure is non-fatal; the check run is the source of truth.
    console.error('guard-webhook: PR comment failed', err?.message || err);
  }

  markProcessed(dedupeKey);
  return { status: 'scanned', lockfiles: lockfileFiles.length };
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
