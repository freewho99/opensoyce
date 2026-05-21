/**
 * Guard early-access waitlist intake.
 *
 * POST /api/early-access
 * Body: { name, email, company?, githubOrg?, visibility, ecosystem, concern, plan }
 *
 * Validates the basics (name + email) and opens a labeled issue in a private
 * GitHub repo so the maintainer triages waitlist signups in their normal issue
 * inbox. Zero storage infra — GitHub is the storage. If the repo isn't
 * configured, we accept the submission and warn in logs so the prospect never
 * sees a misconfiguration error.
 *
 * Auth uses a plain GITHUB_TOKEN (PAT or fine-grained token with Issues:write
 * on the target repo). We intentionally do NOT reuse the OpenSoyce GitHub App
 * here — the App is scoped to public scoring use, not waitlist intake.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ALLOWED_PLANS = new Set(['starter', 'team', 'growth', 'enterprise', 'unknown']);
const ALLOWED_VISIBILITY = new Set(['public', 'private', 'both']);
const ALLOWED_ECOSYSTEM = new Set(['npm', 'pnpm', 'yarn', 'uv', 'poetry', 'mixed']);
const ALLOWED_CONCERN = new Set([
  'vulnerabilities',
  'stale dependencies',
  'AI packages',
  'license risk',
  'dependency confusion',
  'client audit',
  'maintainer trust',
  'other',
]);

const MAX_FIELD_LEN = 200;

// ---------------------------------------------------------------------------
// Body reader (mirrors api/claim-submit.js)
// ---------------------------------------------------------------------------

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  return await new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Normalization + validation
// ---------------------------------------------------------------------------

function clip(value, max = MAX_FIELD_LEN) {
  if (typeof value !== 'string') return '';
  const t = value.trim();
  return t.length > max ? t.slice(0, max) : t;
}

function pickEnum(value, allowed, fallback) {
  return typeof value === 'string' && allowed.has(value) ? value : fallback;
}

export function buildIssueBody(fields) {
  const rows = [
    ['Plan', fields.plan],
    ['Name', fields.name],
    ['Email', fields.email],
    ['Company / team', fields.company || '_(not provided)_'],
    ['GitHub org', fields.githubOrg || '_(not provided)_'],
    ['Repo visibility', fields.visibility],
    ['Primary ecosystem', fields.ecosystem],
    ['Biggest concern', fields.concern],
    ['Submitted at', fields.submittedAt],
  ];
  const table =
    `| Field | Value |\n| --- | --- |\n` +
    rows.map(([k, v]) => `| ${k} | ${escapePipes(v)} |`).join('\n');
  return `${table}\n\n<!-- opensoyce-early-access: plan=${fields.plan} -->`;
}

function escapePipes(value) {
  return String(value == null ? '' : value).replace(/\|/g, '\\|');
}

export function buildIssueTitle({ name, plan }) {
  return `Guard early access: ${name} (${plan})`;
}

// ---------------------------------------------------------------------------
// GitHub call
// ---------------------------------------------------------------------------

async function createGithubIssue({ token, owner, repo, title, body, labels }) {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'opensoyce-early-access',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title, body, labels }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '(no body)');
    throw new Error(`ISSUE_CREATE_FAILED status=${res.status} body=${text.slice(0, 200)}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  let raw;
  try {
    raw = await readJsonBody(req);
  } catch {
    return res.status(400).json({ ok: false, error: 'INVALID_JSON' });
  }

  const name = clip(raw && raw.name);
  const email = clip(raw && raw.email);
  if (!name) return res.status(400).json({ ok: false, error: 'MISSING_NAME' });
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ ok: false, error: 'INVALID_EMAIL' });
  }

  const fields = {
    plan: pickEnum(raw && raw.plan, ALLOWED_PLANS, 'unknown'),
    name,
    email,
    company: clip(raw && raw.company),
    githubOrg: clip(raw && raw.githubOrg),
    visibility: pickEnum(raw && raw.visibility, ALLOWED_VISIBILITY, 'both'),
    ecosystem: pickEnum(raw && raw.ecosystem, ALLOWED_ECOSYSTEM, 'npm'),
    concern: pickEnum(raw && raw.concern, ALLOWED_CONCERN, 'other'),
    submittedAt: new Date().toISOString(),
  };

  const owner = process.env.EARLY_ACCESS_REPO_OWNER;
  const repo = process.env.EARLY_ACCESS_REPO_NAME;
  const token = process.env.GITHUB_TOKEN;

  if (!owner || !repo || !token) {
    // No-storage soft path: prospect succeeds even if env isn't wired, so the
    // form is never the limiting factor. Submissions land in server logs.
    console.warn(
      `early-access: storage not configured (owner=${!!owner} repo=${!!repo} token=${!!token}); submission accepted but not persisted`,
      JSON.stringify({ plan: fields.plan, email: fields.email })
    );
    return res.status(200).json({ ok: true, persisted: false });
  }

  const title = buildIssueTitle({ name: fields.name, plan: fields.plan });
  const body = buildIssueBody(fields);
  const labels = ['early-access', `plan:${fields.plan}`];

  try {
    const issue = await createGithubIssue({ token, owner, repo, title, body, labels });
    return res.status(200).json({
      ok: true,
      persisted: true,
      issueNumber: typeof issue.number === 'number' ? issue.number : null,
    });
  } catch (err) {
    console.error('early-access: createGithubIssue failed', err && err.message);
    return res.status(500).json({ ok: false, error: 'UPSTREAM_ERROR' });
  }
}
