/**
 * Maintainer-concentration helper for AI signals v0.1.
 *
 * Computes a small bundle of bus-factor signals from the contributors +
 * commits data analyzeRepo already fetches per scan. No new GitHub API
 * calls — we're just reading the same payloads the scorer reads.
 *
 * Used by the verdict-band cap in `src/shared/verdict.js`: when one
 * contributor authored > 85% of recorded contributions AND there are
 * <= 2 non-bot contributors AND no commit landed in the last 30 days,
 * `isSingleMaintainer` is true and `daysSinceLastCommit > 30` together
 * trip the band cap (USE READY → FORKABLE). Composite score is unchanged.
 *
 * Bot detection is heuristic — documented as such in Methodology. The
 * three rules we apply (in this order, with `||`):
 *   1. GitHub `type === 'Bot'` on the contributor entry
 *   2. login ends with `[bot]`         (e.g. dependabot[bot])
 *   3. login matches a common bot pattern: literal `dependabot`,
 *      `renovate`, `github-actions`, `snyk-bot`, `greenkeeper`,
 *      `mergify`, `codecov`, `stale`; OR login contains `-bot`,
 *      `bot-`, or ends with `-bot`.
 *
 * @typedef {{ login?: string, contributions?: number, type?: string }} GhContributor
 * @typedef {{ author?: { login?: string, type?: string } | null, commit?: { author?: { date?: string } } }} GhCommit
 *
 * @typedef {Object} MaintainerConcentration
 * @property {number}        topShare              0..1, top-1 non-bot contribution share
 * @property {number}        nonBotContributorCount
 * @property {string | null} lastCommitDate
 * @property {number | null} daysSinceLastCommit
 * @property {boolean}       isSingleMaintainer
 */

const KNOWN_BOT_LOGINS = new Set([
  'dependabot',
  'renovate',
  'renovate-bot',
  'github-actions',
  'snyk-bot',
  'greenkeeper',
  'mergify',
  'codecov',
  'stale',
  'allcontributors',
  'imgbot',
  'pre-commit-ci',
]);

/**
 * Heuristic bot detection. Returns true if any of three rules fires.
 * @param {GhContributor | null | undefined} c
 * @returns {boolean}
 */
export function isBotContributor(c) {
  if (!c) return false;
  if (c.type === 'Bot') return true;
  const login = typeof c.login === 'string' ? c.login.toLowerCase() : '';
  if (!login) return false;
  if (login.endsWith('[bot]')) return true;
  if (KNOWN_BOT_LOGINS.has(login)) return true;
  if (login.includes('-bot') || login.startsWith('bot-') || login.endsWith('-bot')) return true;
  return false;
}

/**
 * Compute maintainer-concentration metrics.
 *
 * @param {GhContributor[] | null | undefined} contributors
 * @param {GhCommit[] | null | undefined} commits
 * @param {Date} [now]  injectable for tests
 * @returns {MaintainerConcentration}
 */
export function computeMaintainerConcentration(contributors, commits, now = new Date()) {
  const safeContribs = Array.isArray(contributors) ? contributors : [];
  const safeCommits = Array.isArray(commits) ? commits : [];

  // Filter bots, then sort by contributions desc.
  const nonBots = safeContribs.filter(c => !isBotContributor(c));
  const sorted = nonBots
    .map(c => ({ login: c?.login || '', contributions: Number(c?.contributions) || 0 }))
    .sort((a, b) => b.contributions - a.contributions);

  const totalContribs = sorted.reduce((sum, c) => sum + c.contributions, 0);
  const topShare = totalContribs > 0 ? sorted[0].contributions / totalContribs : 0;
  const nonBotContributorCount = sorted.filter(c => c.contributions > 0).length;

  // Last commit: prefer the first commit in the commits array (GitHub returns
  // newest-first), fall back to scanning for the max date.
  let lastCommitMs = null;
  for (const c of safeCommits) {
    const d = c && c.commit && c.commit.author && c.commit.author.date;
    if (!d) continue;
    const ts = Date.parse(d);
    if (!Number.isFinite(ts)) continue;
    if (lastCommitMs == null || ts > lastCommitMs) lastCommitMs = ts;
  }

  const lastCommitDate = lastCommitMs != null ? new Date(lastCommitMs).toISOString() : null;
  const daysSinceLastCommit = lastCommitMs != null
    ? Math.floor((now.getTime() - lastCommitMs) / 86400000)
    : null;

  const isSingleMaintainer = topShare > 0.85 && nonBotContributorCount <= 2 && nonBotContributorCount >= 1;

  return {
    topShare,
    nonBotContributorCount,
    lastCommitDate,
    daysSinceLastCommit,
    isSingleMaintainer,
  };
}
