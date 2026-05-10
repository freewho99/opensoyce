export interface ScoreResult {
  total: number;
  breakdown: {
    maintenance: number;
    community: number;
    security: number;
    documentation: number;
    activity: number;
  };
  meta: {
    lastCommit: string;
    totalStars: number;
    totalForks: number;
    openIssues: number;
    license: string;
    language: string;
    topics: string[];
    contributors: number;
  };
}

export function calculateSoyceScore(repoData: any, commits: any[], contributors: any[], issues: any[]): ScoreResult {
  let maintenance = 0;
  let community = 0;
  let security = 0;
  let documentation = 0;
  let activity = 0;

  const now = new Date();
  
  // 1. MAINTENANCE (30% = 3.0 pts max)
  const lastCommitDate = commits && commits.length > 0 ? new Date(commits[0].commit.author.date) : new Date(repoData.pushed_at);
  const diffDays = Math.floor((now.getTime() - lastCommitDate.getTime()) / (1000 * 3600 * 24));

  if (diffDays <= 7) maintenance = 3.0;
  else if (diffDays <= 30) maintenance = 2.5;
  else if (diffDays <= 90) maintenance = 1.5;
  else if (diffDays <= 365) maintenance = 0.8;
  else maintenance = 0.2;

  // 2. COMMUNITY (25% = 2.5 pts max)
  const stars = repoData.stargazers_count || 0;
  const starScore = Math.min(1.5, (Math.log10(stars + 1) / Math.log10(100000)) * 1.5);
  community += starScore;

  const contributorCount = contributors ? contributors.length : 0;
  if (contributorCount >= 10) community += 0.5;
  else if (contributorCount >= 5) community += 0.3;
  else if (contributorCount >= 2) community += 0.1;

  if (repoData.forks_count >= 1000) community += 0.5;
  community = Math.min(2.5, community);

  // 3. SECURITY (20% = 2.0 pts max)
  if (repoData.license) security += 0.5;
  const licenseName = repoData.license?.spdx_id?.toUpperCase() || '';
  if (['MIT', 'APACHE-2.0', 'BSD-2-CLAUSE', 'BSD-3-CLAUSE'].includes(licenseName)) security += 0.5;
  
  const openIssues = repoData.open_issues_count || 0;
  if (openIssues < 20) security += 0.5;
  else if (openIssues < 100) security += 0.3;

  if ((repoData.topics && repoData.topics.length > 0) || repoData.description) security += 0.5;
  security = Math.min(2.0, security);

  // 4. DOCUMENTATION (15% = 1.5 pts max)
  if (repoData.description) documentation += 0.5;
  if (repoData.topics && repoData.topics.length >= 3) documentation += 0.5;
  if (repoData.homepage) documentation += 0.5;
  documentation = Math.min(1.5, documentation);

  // 5. ACTIVITY (10% = 1.0 pts max)
  const last30DaysCommits = commits ? commits.filter(c => {
    const cDate = new Date(c.commit.author.date);
    return (now.getTime() - cDate.getTime()) / (1000 * 3600 * 24) <= 30;
  }).length : 0;

  if (last30DaysCommits >= 10) activity = 1.0;
  else if (last30DaysCommits >= 5) activity = 0.7;
  else if (last30DaysCommits >= 1) activity = 0.4;
  else activity = 0.1;

  const total = parseFloat((maintenance + community + security + documentation + activity).toFixed(1));

  return {
    total,
    breakdown: {
      maintenance: parseFloat(maintenance.toFixed(1)),
      community: parseFloat(community.toFixed(1)),
      security: parseFloat(security.toFixed(1)),
      documentation: parseFloat(documentation.toFixed(1)),
      activity: parseFloat(activity.toFixed(1))
    },
    meta: {
      lastCommit: lastCommitDate.toISOString(),
      totalStars: stars,
      totalForks: repoData.forks_count,
      openIssues: openIssues,
      license: repoData.license ? repoData.license.spdx_id : 'No License',
      language: repoData.language || 'Unknown',
      topics: repoData.topics || [],
      contributors: contributorCount
    }
  };
}
