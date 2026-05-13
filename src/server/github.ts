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

  async getLatestRelease(owner: string, repo: string) {
    return this.fetchGH(`/repos/${owner}/${repo}/releases/latest`);
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
