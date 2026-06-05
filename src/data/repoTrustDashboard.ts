import {
  REPO_TRUST_POSTURES as JS_POSTURES,
  REPO_TRUST_POSTURE_LABELS as JS_LABELS,
  REPO_TRUST_GATE_ACTIONS as JS_ACTIONS,
  REPO_TRUST_SEVERITIES as JS_SEVERITIES,
  REPO_TRUST_WORKFLOW_SOURCES as JS_SOURCES,
  REPO_TRUST_MVP_FOCUS as JS_FOCUS,
  getRepoTrustPosture as jsGetRepoTrustPosture,
  isMvpFocusRepo as jsIsMvpFocusRepo,
} from '../shared/repoTrustDashboard.js';

export type RepoTrustPostureLabel =
  | 'use-ready'
  | 'watchlist'
  | 'risky'
  | 'graveyard';

export type RepoTrustGateAction = 'BLOCK' | 'WARN' | 'ALLOW';

export type RepoTrustSeverity = 'critical' | 'high' | 'medium' | 'low';

export type RepoTrustWorkflowFindingsSource = 'live' | 'static-snapshot';

export interface RepoTrustReference {
  readonly label: string;
  readonly href: string;
}

export interface RepoTrustGateExample {
  readonly packageQuery: string;
  readonly expectedAction: RepoTrustGateAction;
  readonly expectedPatternCount: number;
  readonly rationale: string;
}

export interface RepoTrustWorkflowFinding {
  readonly patternId: string;
  readonly patternName: string;
  readonly severity: RepoTrustSeverity;
  readonly policyImpact: 'block' | 'warn';
  readonly source: string;
  readonly origin: string;
  readonly writeScopes?: string;
}

export interface RepoTrustRiskyDep {
  readonly packageQuery: string;
  readonly severity: RepoTrustSeverity;
  readonly reason: string;
}

export interface RepoTrustTimelinePreviewFilter {
  readonly byPackage?: readonly string[];
  readonly byPr?: readonly number[];
}

export interface RepoTrustExceptionsPlaceholder {
  readonly count: 0;
  readonly message: string;
}

export interface RepoTrustPosture {
  readonly owner: string;
  readonly repo: string;
  readonly postureLabel: RepoTrustPostureLabel;
  readonly postureSummary: string;
  readonly lastEvaluated: string;
  readonly gateExamples: readonly RepoTrustGateExample[];
  readonly workflowFindingsSource: RepoTrustWorkflowFindingsSource;
  readonly workflowFindings: readonly RepoTrustWorkflowFinding[];
  readonly riskyDeps: readonly RepoTrustRiskyDep[];
  readonly timelinePreviewFilter: RepoTrustTimelinePreviewFilter;
  readonly exceptionsPlaceholder: RepoTrustExceptionsPlaceholder;
  readonly references: readonly RepoTrustReference[];
}

export interface RepoTrustMvpFocus {
  readonly owner: string;
  readonly repo: string;
}

export const REPO_TRUST_POSTURE_LABELS = JS_LABELS as readonly RepoTrustPostureLabel[];
export const REPO_TRUST_GATE_ACTIONS = JS_ACTIONS as readonly RepoTrustGateAction[];
export const REPO_TRUST_SEVERITIES = JS_SEVERITIES as readonly RepoTrustSeverity[];
export const REPO_TRUST_WORKFLOW_SOURCES = JS_SOURCES as readonly RepoTrustWorkflowFindingsSource[];
export const REPO_TRUST_MVP_FOCUS = JS_FOCUS as RepoTrustMvpFocus;
export const REPO_TRUST_POSTURES = JS_POSTURES as readonly RepoTrustPosture[];

export function getRepoTrustPosture(owner: string, repo: string): RepoTrustPosture | null {
  return (jsGetRepoTrustPosture(owner, repo) as RepoTrustPosture | null) ?? null;
}

export function isMvpFocusRepo(owner: string, repo: string): boolean {
  return jsIsMvpFocusRepo(owner, repo) as boolean;
}
