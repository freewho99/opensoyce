export class GitHubService {
  private token: string | undefined;

  constructor() {
    this.token = process.env.GITHUB_TOKEN;
  }

  private async fetchGH(path: string) {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'OpenSoyce-App'
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`https://api.github.com${path}`, { headers });
    
    if (response.status === 404) return null;
    if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
      throw new Error('RATE_LIMIT_HIT');
    }
    
    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: 'GitHub API Error' }));
      throw new Error(err.message || 'GitHub API Error');
    }
    
    return response.json();
  }

  async getRepo(owner: string, repo: string) {
    return this.fetchGH(`/repos/${owner}/${repo}`);
  }

  async getCommits(owner: string, repo: string) {
    return this.fetchGH(`/repos/${owner}/${repo}/commits?per_page=30`);
  }

  async getContributors(owner: string, repo: string) {
    return this.fetchGH(`/repos/${owner}/${repo}/contributors?per_page=30`);
  }

  async getReadme(owner: string, repo: string) {
    return this.fetchGH(`/repos/${owner}/${repo}/readme`);
  }

  async getCommunityProfile(owner: string, repo: string) {
    return this.fetchGH(`/repos/${owner}/${repo}/community/profile`);
  }

  /**
   * Detect whether a SECURITY.md (or equivalent) exists at one of the
   * standard locations. The community-profile endpoint is the canonical
   * source but is known to under-report: facebook/react has SECURITY.md at
   * the repo root and the endpoint returns null for security_policy anyway.
   *
   * This fallback only runs when community profile says null, so the extra
   * calls are paid only by repos GitHub didn't surface a policy for.
   * Returns true on first 200; false if all four paths 404.
   */
  async findSecurityPolicy(owner: string, repo: string): Promise<boolean> {
    const paths = [
      `/repos/${owner}/${repo}/contents/SECURITY.md`,
      `/repos/${owner}/${repo}/contents/.github/SECURITY.md`,
      `/repos/${owner}/${repo}/contents/docs/SECURITY.md`,
    ];
    for (const p of paths) {
      try {
        const result = await this.fetchGH(p);
        if (result) return true;
      } catch {
        // fetchGH throws on rate-limit / non-200-non-404; treat as inconclusive
        // and fall through to the next path.
      }
    }
    return false;
  }

  async getLatestRelease(owner: string, repo: string) {
    return this.fetchGH(`/repos/${owner}/${repo}/releases/latest`);
  }

  async getRepoAdvisories(owner: string, repo: string) {
    return this.fetchGH(`/repos/${owner}/${repo}/security-advisories?per_page=100`);
  }

  async getRecentIssues(owner: string, repo: string) {
    // Issues opened/updated in the last 90 days. GitHub's /issues endpoint
    // mixes PRs into the response; the scorer filters them via item.pull_request.
    const since = new Date(Date.now() - 90 * 86400000).toISOString();
    return this.fetchGH(`/repos/${owner}/${repo}/issues?state=all&since=${since}&per_page=100`);
  }

  async getWorkflows(owner: string, repo: string) {
    return this.fetchGH(`/repos/${owner}/${repo}/actions/workflows`);
  }

  async getSecurityAdvisories(owner: string, repo: string) {
    return this.fetchGH(`/repos/${owner}/${repo}/security-advisories`);
  }

  async searchRepos(query: string) {
    return this.fetchGH(`/search/repositories?q=${encodeURIComponent(query)}+in:name,description&sort=stars&order=desc&per_page=8`);
  }
}
