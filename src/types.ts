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

export type MaintenanceBreakdown = {
  commit: number;     // 0.0-1.5
  release: number;    // 0.0-1.0
  triage: number;     // 0.0-0.5
  triageDataAvailable: boolean;
};

export type MaintainerConcentration = {
  topShare: number;                // 0..1
  nonBotContributorCount: number;
  lastCommitDate: string | null;
  daysSinceLastCommit: number | null;
  isSingleMaintainer: boolean;
};

export type VendorSdkMatch = {
  owner: string;
  repo: string;
  vendor: string;
  reason: string;
};

// Fork-velocity-of-namesake v0. The scored repo may have been migrated to
// a successor; this is INFORMATIONAL only — score/verdict are unchanged.
export type RepoMigration = {
  successor: { owner: string; repo: string } | null;
  migratedAt: string | null;
  reason: string;
  confidence: 'HIGH' | 'MEDIUM';
  source: 'curated' | 'fork-chain';
  successorStars?: number;
  successorPushedAt?: string;
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
  maintenanceBreakdown?: MaintenanceBreakdown | null;
  hasDependabot?: boolean;
  hasSast?: boolean;
  busFactorHealthy?: boolean;
  avgResolutionDays?: number | null;
  contributors?: number;
  maintainerConcentration?: MaintainerConcentration | null;
  vendorSdk?: VendorSdkMatch | null;
  migration?: RepoMigration | null;
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
  extensionExploitRisk?: ExtensionExploitRisk | null;
  trustPosture?: TrustPosture | null;
};

export type ExtensionExploitRiskReason = {
  code: string;
  label: string;
};

export type ExtensionExploitRisk = {
  active: boolean;
  status: 'HIJACK RISK' | 'MAINTAINER BOTTLENECK' | 'NONE';
  reasons: ExtensionExploitRiskReason[];
  confidence: 'low' | 'medium' | 'high';
};

export type TrustPosture = 'TRUSTED' | 'LIMITED TRUST' | 'HIJACK RISK' | 'COMPROMISED';

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

export type AutomergeVerdict = 'AUTO-MERGE ALLOWED' | 'AUTO-MERGE DELAYED' | 'AUTO-MERGE NEEDS REVIEW' | 'AUTO-MERGE BLOCKED';

export type DependencyUpdatePR = {
  packageName: string;
  fromVersion: string;
  toVersion: string;
  changeType: 'patch' | 'minor' | 'major';
  
  // Behavior Diff
  addsLifecycleScript: boolean;
  addsNativeBinary: boolean;
  newTransitiveDepsCount: number;
  publishAgeHours: number;
  
  // Integrity & Trust Signals
  provenancePresent: boolean;
  registrySignatureVerified: boolean;
  maintainerIdentityStable: boolean;
  sastUpstream: boolean;
  vulnerabilityAuditPass: boolean;
  ciPasses: boolean;
  lockfileDiffSize: 'small' | 'large';
};

export type AutomergeReason = {
  severity: 'BLOCKED' | 'NEEDS REVIEW' | 'DELAYED' | 'ALLOWED';
  message: string;
};

export type AutomergeResult = {
  decision: AutomergeVerdict;
  tier: number;
  tierName: string;
  reasons: AutomergeReason[];
  recommendedAction: string;
};

