import {
  OPEN_SOURCE_TRUST_CENTER_SUBJECTS as JS_SUBJECTS,
  OPEN_SOURCE_TRUST_CENTER_SECTION_IDS as JS_SECTION_IDS,
  OPEN_SOURCE_TRUST_CENTER_AUDIENCES as JS_AUDIENCES,
  OPEN_SOURCE_TRUST_CENTER_PROOF_TYPES as JS_PROOF_TYPES,
  OPEN_SOURCE_TRUST_CENTER_POSTURE_LABELS as JS_POSTURE_LABELS,
  OPEN_SOURCE_TRUST_CENTER_BANNED_SUBSTRINGS as JS_BANNED,
  OPEN_SOURCE_TRUST_CENTER_FUTURE_TENSE_TELLS as JS_FUTURE_TELLS,
  OPEN_SOURCE_TRUST_CENTER_MVP_SUBJECT as JS_MVP_SUBJECT,
  getOpenSourceTrustCenterSubject as jsGetOpenSourceTrustCenterSubject,
  groupClaimsBySection as jsGroupClaimsBySection,
} from '../shared/openSourceTrustCenter.js';

export type TrustCenterSectionId =
  | 'trust-posture'
  | 'gate-proof'
  | 'timeline-proof'
  | 'dashboard-proof'
  | 'exception-placeholder'
  | 'methodology'
  | 'export-placeholder';

export type TrustCenterAudience =
  | 'buyer'
  | 'security-reviewer'
  | 'engineering-leader'
  | 'maintainer'
  | 'all';

export type TrustCenterProofType =
  | 'pr'
  | 'live-surface'
  | 'doc-anchor'
  | 'proof-artifact';

export type TrustCenterPostureLabel =
  | 'use-ready'
  | 'watchlist'
  | 'risky'
  | 'graveyard';

export interface TrustProofAnchor {
  readonly proofType: TrustCenterProofType;
  readonly label: string;
  readonly href: string;
  readonly pr?: number;
  readonly sha?: string;
}

export interface TrustClaim {
  readonly id: string;
  readonly sectionId: TrustCenterSectionId;
  readonly audience: TrustCenterAudience;
  readonly headline: string;
  readonly body: string;
  readonly proofAnchors: readonly TrustProofAnchor[];
}

export interface TrustCenterPrimaryCta {
  readonly label: string;
  readonly href: string;
}

export interface TrustCenterSubject {
  readonly owner: string;
  readonly repo: string;
  readonly displayName: string;
  readonly postureLabel: TrustCenterPostureLabel;
  readonly postureSummary: string;
  readonly primaryCta: TrustCenterPrimaryCta;
  readonly lastEvaluated: string;
  readonly claims: readonly TrustClaim[];
}

export interface TrustCenterMvpSubject {
  readonly owner: string;
  readonly repo: string;
  readonly displayName: string;
}

export interface TrustCenterSectionGroup {
  readonly sectionId: TrustCenterSectionId;
  readonly claims: readonly TrustClaim[];
}

export const OPEN_SOURCE_TRUST_CENTER_SECTION_IDS = JS_SECTION_IDS as readonly TrustCenterSectionId[];
export const OPEN_SOURCE_TRUST_CENTER_AUDIENCES = JS_AUDIENCES as readonly TrustCenterAudience[];
export const OPEN_SOURCE_TRUST_CENTER_PROOF_TYPES = JS_PROOF_TYPES as readonly TrustCenterProofType[];
export const OPEN_SOURCE_TRUST_CENTER_POSTURE_LABELS = JS_POSTURE_LABELS as readonly TrustCenterPostureLabel[];
export const OPEN_SOURCE_TRUST_CENTER_BANNED_SUBSTRINGS = JS_BANNED as readonly string[];
export const OPEN_SOURCE_TRUST_CENTER_FUTURE_TENSE_TELLS = JS_FUTURE_TELLS as readonly string[];
export const OPEN_SOURCE_TRUST_CENTER_MVP_SUBJECT = JS_MVP_SUBJECT as TrustCenterMvpSubject;
export const OPEN_SOURCE_TRUST_CENTER_SUBJECTS = JS_SUBJECTS as readonly TrustCenterSubject[];

export function getOpenSourceTrustCenterSubject(
  owner: string,
  repo: string,
): TrustCenterSubject | null {
  return (jsGetOpenSourceTrustCenterSubject(owner, repo) as TrustCenterSubject | null) ?? null;
}

export function groupClaimsBySection(
  subject: TrustCenterSubject | null | undefined,
): readonly TrustCenterSectionGroup[] {
  return jsGroupClaimsBySection(subject) as readonly TrustCenterSectionGroup[];
}
