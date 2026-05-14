/**
 * SECURITY.md resolver. GitHub's /community/profile endpoint under-reports
 * security policies — facebook/react has SECURITY.md at the repo root yet
 * the endpoint returns null for security_policy. This resolver runs as a
 * fallback only when the community profile says no policy, checking the
 * three standard locations directly.
 *
 * @param {string} owner
 * @param {string} repo
 * @param {Record<string, string>} headers  Fetch headers (User-Agent, Authorization)
 * @returns {Promise<boolean>}  true if any standard path returns 200
 */
export async function findSecurityPolicy(owner, repo, headers) {
  const paths = [
    `/repos/${owner}/${repo}/contents/SECURITY.md`,
    `/repos/${owner}/${repo}/contents/.github/SECURITY.md`,
    `/repos/${owner}/${repo}/contents/docs/SECURITY.md`,
  ];
  for (const p of paths) {
    try {
      const res = await fetch(`https://api.github.com${p}`, { headers });
      if (res.status === 200) return true;
      // 404 → keep trying; any other status → treat as inconclusive and continue
    } catch {
      // Network error — fall through to the next path. Worst case all three
      // fail and we return false, which is the same as "no policy detected."
    }
  }
  return false;
}
