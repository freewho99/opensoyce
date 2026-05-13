export type SoyceScore = {
  overall: number; // 0-10
  maintenance: number; // 0-100 (for progress bars)
  security: number; // 0-100
  community: number; // 0-100
  documentation: number; // 0-100
  activity?: number; // 0-100
  raw?: {
    maintenance: number; // 0-3.0
    community: number; // 0-2.5
    security: number; // 0-2.0
    documentation: number; // 0-1.5
    activity: number; // 0-1.0
  };
};

export type AdvisorySummary = {
  total: number;
  openCount: number;
  recentOpen: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
};

export type Project = {
  id: string;
  name: string;
  owner: string;
  description: string;
  stars: number;
  forks: number;
  lastScanned: string;
  status: 'Verified' | 'Unverified';
  category: string;
  score: SoyceScore;
  techStack: string[];
  license: string;
  scoreTrend: 'up' | 'down' | 'flat';
  openIssues?: number;
  lastCommit?: string;
  advisories?: AdvisorySummary | null;
  parentId?: string; // ID of the original project if this is a fork
  parentName?: string;
  parentOwner?: string;
  isFork?: boolean;
  customRecipe?: {
    title: string;
    description: string;
    ingredients: string[];
    outcome: string;
  };
};

export type Recipe = {
  id: string;
  title: string;
  description: string;
  ingredients: string[];
  outcome: string;
};

export type WatchlistItem = {
  owner: string;
  repo: string;
  initialScore: number;
  dateAdded: string;
};
