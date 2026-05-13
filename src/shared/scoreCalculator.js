/**
 * @typedef {Object} ScoreBreakdown
 * @property {number} maintenance  0.0 - 3.0
 * @property {number} community    0.0 - 2.5
 * @property {number} security     0.0 - 2.0
 * @property {number} documentation 0.0 - 1.5
 * @property {number} activity     0.0 - 1.0
 *
 * @typedef {Object} AdvisorySummary
 * @property {number}   total         Total non-withdrawn published advisories ever filed
 * @property {number}   openCount     Advisories not withdrawn (we treat all published advisories as "open" since GitHub doesn't track resolved-vs-active)
 * @property {number}   recentOpen    Advisories published within the last 365 days
 * @property {number}   critical
 * @property {number}   high
 * @property {number}   medium
 * @property {number}   low
 *
 * @typedef {Object} ScoreMeta
 * @property {string}   lastCommit  ISO timestamp of the most recent commit
 * @property {number}   totalStars
 * @property {number}   totalForks
 * @property {number}   openIssues
 * @property {string}   license     SPDX id or 'No License'
 * @property {string}   language
 * @property {string[]} topics
 * @property {number}   contributors Number of contributors observed (capped by fetch page size)
 * @property {AdvisorySummary | null} advisories  null when the advisory fetch failed; populated summary (possibly all zeroes) when it succeeded
 *
 * @typedef {Object} ScoreResult
 * @property {number}          total      0.0 - 10.0, sum of all pillars, rounded to 1 decimal
 * @property {ScoreBreakdown}  breakdown
 * @property {ScoreMeta}       meta
 */

/**
 * Compute the OpenSoyce score for a repository.
 *
 * Inputs are raw GitHub REST payloads. The function is pure: it does no I/O
 * and mutates none of its arguments.
 *
 * @param {any}   repoData          GET /repos/{owner}/{repo}
 * @param {any[]} commits           GET /repos/{owner}/{repo}/commits (may be empty)
 * @param {any[]} contributors      GET /repos/{owner}/{repo}/contributors (may be empty)
 * @param {{content?: string, encoding?: string} | null} [readme]   GET /repos/{owner}/{repo}/readme (may be null when none exists)
 * @param {any | null} [communityProfile]  GET /repos/{owner}/{repo}/community/profile (may be null)
 * @param {any | null} [latestRelease]     GET /repos/{owner}/{repo}/releases/latest (may be null when no releases)
 * @param {any[] | null} [repoAdvisories]  GET /repos/{owner}/{repo}/security-advisories (null on fetch failure, [] when none)
 * @returns {ScoreResult}
 */
export function calculateSoyceScore(repoData, commits, contributors, readme, communityProfile, latestRelease, repoAdvisories) {
  const now = new Date();
  const safeCommits = Array.isArray(commits) ? commits : [];
  const safeContributors = Array.isArray(contributors) ? contributors : [];

  // 1. MAINTENANCE (max 3.0) - how recently the project was touched
  const lastCommitDate = safeCommits.length > 0
    ? new Date(safeCommits[0].commit.author.date)
    : new Date(repoData.pushed_at);
  const diffDays = Math.floor((now.getTime() - lastCommitDate.getTime()) / 86400000);

  let maintenance;
  if (diffDays <= 7) maintenance = 3.0;
  else if (diffDays <= 30) maintenance = 2.5;
  else if (diffDays <= 90) maintenance = 1.5;
  else if (diffDays <= 365) maintenance = 0.8;
  else maintenance = 0.2;

  // 2. COMMUNITY (max 2.5) - stars (log-scaled), contributor count, fork milestone
  const stars = repoData.stargazers_count || 0;
  let community = Math.min(1.5, (Math.log10(stars + 1) / Math.log10(100000)) * 1.5);

  const contributorCount = safeContributors.length;
  if (contributorCount >= 10) community += 0.5;
  else if (contributorCount >= 5) community += 0.3;
  else if (contributorCount >= 2) community += 0.1;

  if ((repoData.forks_count || 0) >= 1000) community += 0.5;
  community = Math.min(2.5, community);

  // 3. SECURITY (max 2.0) - license, issue load, SECURITY.md, release maturity
  let security = 0;
  if (repoData.license) security += 0.4;
  const licenseId = repoData.license?.spdx_id?.toUpperCase() || '';
  if (['MIT', 'APACHE-2.0', 'BSD-2-CLAUSE', 'BSD-3-CLAUSE'].includes(licenseId)) security += 0.4;

  // Issue-to-popularity ratio. The previous absolute-count check rewarded
  // abandonment: a 0-star unmaintained repo with 0 issues earned the bonus.
  // Now we use issues-per-star AND require recent maintenance (last commit
  // within 365 days) so an abandoned-but-tidy repo doesn't earn this bonus.
  // For tiny repos (<50 stars) the ratio isn't meaningful, no bonus awarded.
  const openIssues = repoData.open_issues_count || 0;
  const starCount = repoData.stargazers_count || 0;
  const isActivelyMaintained = diffDays <= 365;
  if (starCount >= 50 && isActivelyMaintained) {
    const issuesPerStar = openIssues / starCount;
    if (issuesPerStar < 0.005) security += 0.3;
    else if (issuesPerStar < 0.02) security += 0.15;
  }

  security += scoreSecurityExtras(communityProfile, latestRelease, now);
  security += scoreRepoAdvisories(repoAdvisories, now);
  if (security < 0) security = 0;
  security = Math.min(2.0, security);

  // 4. DOCUMENTATION (max 1.5)
  //    - metadata flags (description, topics, homepage): up to 0.6
  //    - README content scoring: up to 0.9
  let documentation = 0;
  if (repoData.description) documentation += 0.2;
  if (repoData.topics && repoData.topics.length >= 3) documentation += 0.2;
  if (repoData.homepage) documentation += 0.2;
  documentation += scoreReadme(readme);
  documentation = Math.min(1.5, documentation);

  // 5. ACTIVITY (max 1.0) - commits in the last 30 days from the page we fetched
  const last30DaysCommits = safeCommits.filter(c => {
    const cDate = new Date(c.commit.author.date);
    return (now.getTime() - cDate.getTime()) / 86400000 <= 30;
  }).length;

  let activity;
  if (last30DaysCommits >= 10) activity = 1.0;
  else if (last30DaysCommits >= 5) activity = 0.7;
  else if (last30DaysCommits >= 1) activity = 0.4;
  else activity = 0.1;

  const total = round1(maintenance + community + security + documentation + activity);

  return {
    total,
    breakdown: {
      maintenance: round1(maintenance),
      community: round1(community),
      security: round1(security),
      documentation: round1(documentation),
      activity: round1(activity),
    },
    meta: {
      lastCommit: lastCommitDate.toISOString(),
      totalStars: stars,
      totalForks: repoData.forks_count || 0,
      openIssues,
      license: repoData.license ? repoData.license.spdx_id : 'No License',
      language: repoData.language || 'Unknown',
      topics: repoData.topics || [],
      contributors: contributorCount,
      advisories: summarizeAdvisories(repoAdvisories, now),
    },
  };
}

function round1(n) {
  return parseFloat(n.toFixed(1));
}

/**
 * Score the "real signal" portion of Security: SECURITY.md presence and
 * release publishing maturity. Returns 0.0 - 0.9.
 *
 *   0.4  SECURITY.md or equivalent declared on the community profile
 *   0.3  >= 1 release ever published
 *   0.2  most recent release published <= 365 days ago (cumulative)
 *
 * @param {any | null | undefined} communityProfile
 * @param {any | null | undefined} latestRelease
 * @param {Date} now
 * @returns {number}
 */
function scoreSecurityExtras(communityProfile, latestRelease, now) {
  let score = 0;

  // SECURITY.md: GitHub's /community/profile endpoint returns
  // files.security_policy = null when absent, or an object with html_url when present.
  if (communityProfile && communityProfile.files && communityProfile.files.security_policy) {
    score += 0.4;
  }

  if (latestRelease && latestRelease.published_at) {
    score += 0.3;
    const releaseDate = new Date(latestRelease.published_at);
    const days = (now.getTime() - releaseDate.getTime()) / 86400000;
    if (days <= 365) score += 0.2;
  }

  return score;
}

/**
 * Score a README payload from GET /repos/{owner}/{repo}/readme.
 *
 * Returns 0.0 - 0.9. Awarded:
 *   0.2 README exists at all
 *   0.1 length >= 300 chars
 *   0.1 length >= 1500 chars (cumulative — long README gets both)
 *   0.15 >= 2 headings (lines starting with #)
 *   0.15 >= 1 fenced code block (```)
 *   0.1 has a heading containing install/setup/getting started/quick start
 *
 * @param {{content?: string, encoding?: string} | null | undefined} readme
 * @returns {number}
 */
function scoreReadme(readme) {
  if (!readme || typeof readme.content !== 'string' || readme.content.length === 0) return 0;

  let text;
  if (readme.encoding === 'base64') {
    try {
      // Strip whitespace GitHub inserts every 60 chars in base64 output.
      const clean = readme.content.replace(/\s/g, '');
      text = typeof Buffer !== 'undefined'
        ? Buffer.from(clean, 'base64').toString('utf-8')
        : atob(clean);
    } catch {
      return 0;
    }
  } else {
    text = readme.content;
  }

  // Strip HTML comments to avoid rewarding a single giant <!-- ... --> blob.
  const stripped = text.replace(/<!--[\s\S]*?-->/g, '');
  const length = stripped.length;

  let score = 0.2; // exists
  if (length >= 300) score += 0.1;
  if (length >= 1500) score += 0.1;

  const headings = (stripped.match(/^#{1,6}\s+\S/gm) || []);
  if (headings.length >= 2) score += 0.15;

  const codeBlocks = (stripped.match(/```/g) || []).length;
  // Each fenced block uses two ``` fences, so >= 2 markers means >= 1 block.
  if (codeBlocks >= 2) score += 0.15;

  const installPattern = /^#{1,6}\s+.*\b(install|installation|setup|getting[\s-]+started|quick[\s-]+start|quickstart|usage)\b/im;
  if (installPattern.test(stripped)) score += 0.1;

  return Math.min(0.9, score);
}

/**
 * Score the real-CVE sub-signal from GitHub's repo-level advisory list.
 *
 * Pure: no I/O, no input mutation.
 *
 * Returns a number in [-0.6, +0.5]:
 *   +0.5 baseline when no published, non-withdrawn advisories exist
 *   subtract penalty per advisory weighted by severity × recency
 *
 * Failure modes:
 *   null / undefined / non-array → 0.0 (unknown — neither rewarded nor penalized)
 *   []                          → +0.5 (no self-disclosed CVEs)
 *
 * Caveat: this measures CVEs the maintainers themselves disclosed in this
 * repo's own code. It does NOT measure vulnerabilities in dependencies.
 *
 * @param {Array<{severity?: string, state?: string, published_at?: string, withdrawn_at?: string | null}> | null | undefined} advisories
 * @param {Date} now
 * @returns {number}
 */
function scoreRepoAdvisories(advisories, now) {
  if (advisories === null || advisories === undefined) return 0;
  if (!Array.isArray(advisories)) return 0;
  if (advisories.length === 0) return 0.5;

  const sevWeight = { critical: 0.4, high: 0.25, medium: 0.1, moderate: 0.1, low: 0.05 };
  let penalty = 0;

  for (const a of advisories) {
    if (!a || a.withdrawn_at) continue;
    if (a.state && a.state !== 'published') continue;
    const sev = (a.severity || '').toLowerCase();
    const w = sevWeight[sev];
    if (!w) continue;

    let recencyMult = 0.1;
    if (a.published_at) {
      const days = (now.getTime() - new Date(a.published_at).getTime()) / 86400000;
      if (days <= 180) recencyMult = 1.0;
      else if (days <= 365) recencyMult = 0.6;
      else if (days <= 1095) recencyMult = 0.3;
    }
    penalty += w * recencyMult;
  }

  const result = 0.5 - penalty;
  return result < -0.6 ? -0.6 : result;
}

/**
 * Build the AdvisorySummary the UI consumes from the same raw advisory list.
 *
 * Returns null when the fetch itself failed (advisories === null/undefined),
 * so the UI can distinguish "no advisories" from "couldn't tell." When the
 * list is an empty array, returns a zeroed summary (clearly: "we asked, the
 * answer was zero").
 *
 * @param {Array<any> | null | undefined} advisories
 * @param {Date} now
 * @returns {AdvisorySummary | null}
 */
function summarizeAdvisories(advisories, now) {
  if (advisories === null || advisories === undefined) return null;
  if (!Array.isArray(advisories)) return null;

  const out = { total: 0, openCount: 0, recentOpen: 0, critical: 0, high: 0, medium: 0, low: 0 };
  for (const a of advisories) {
    if (!a || a.withdrawn_at) continue;
    if (a.state && a.state !== 'published') continue;
    out.total += 1;
    out.openCount += 1;
    const sev = (a.severity || '').toLowerCase();
    if (sev === 'critical') out.critical += 1;
    else if (sev === 'high') out.high += 1;
    else if (sev === 'medium' || sev === 'moderate') out.medium += 1;
    else if (sev === 'low') out.low += 1;
    if (a.published_at) {
      const days = (now.getTime() - new Date(a.published_at).getTime()) / 86400000;
      if (days <= 365) out.recentOpen += 1;
    }
  }
  return out;
}
