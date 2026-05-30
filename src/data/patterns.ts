import {
  OTS_PATTERN_DEFINITIONS as JS_DEFS,
  OTS_PATTERN_PACKS as JS_PACKS,
  OTS_INCIDENTS as JS_INCIDENTS,
  getOtsPatternDefinition as jsGetDef,
  getOtsIncident as jsGetInc
} from '../shared/otsPatterns.js';

export type OtsPatternSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export type OtsPatternCategory =
  | 'known-vulnerability'
  | 'package-behavior'
  | 'release-anomaly'
  | 'provenance'
  | 'ci-cd'
  | 'developer-tool'
  | 'license'
  | 'dependency-chain'
  | 'ai-agent';

export type OtsPolicyImpact = 'none' | 'warn' | 'block' | 'requires-approval';

/**
 * Where a pattern stands in OpenSoyce's enforcement story.
 *
 *   gate-active   — the detector emits this pattern in normal gate mode.
 *   catalog-only  — documented, incident-backed, signal source exists,
 *                   but detector branch not wired yet (e.g. GitHub
 *                   Actions workflow patterns we could parse from .yml).
 *   roadmap       — needs new signal-source infrastructure before
 *                   enforcement (e.g. AI agent workflow patterns, dev
 *                   tool extension manifest scanners).
 *   fixture-only  — emitted only when allowDemoFixtures is passed
 *                   explicitly. Used for demo/replay/test paths.
 */
export type OtsCoverageStatus = 'gate-active' | 'catalog-only' | 'roadmap' | 'fixture-only';

export interface OtsPatternDefinition {
  readonly id: string;
  readonly name: string;
  readonly category: OtsPatternCategory;
  readonly defaultSeverity: OtsPatternSeverity;
  readonly shortDescription: string;
  readonly whyItMatters: string;
  readonly defaultPolicyImpact: OtsPolicyImpact;
  readonly recommendedAction: string;
  readonly realWorldExamples?: readonly string[];
  readonly coverageStatus: OtsCoverageStatus;
}

export interface OtsPatternPack {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly patternIds: readonly string[];
}

export type OtsSourceConfidence = 'primary' | 'authoritative-secondary' | 'unverified';

export interface OtsIncidentCaseStudy {
  readonly id: string;
  readonly name: string;
  readonly date: string;
  readonly target: string;
  readonly sourceUrl: string;
  readonly corroboratingSourceUrl?: string;
  readonly sourceConfidence: OtsSourceConfidence;
  readonly description: string;
  readonly context: string;
  readonly whatHappened: string;
  readonly triggeredPatternIds: readonly string[];
  readonly preventionStrategy: string;
}

export const OTS_PATTERN_DEFINITIONS = JS_DEFS as readonly OtsPatternDefinition[];
export const OTS_PATTERN_PACKS = JS_PACKS as readonly OtsPatternPack[];
export const OTS_INCIDENTS = JS_INCIDENTS as readonly OtsIncidentCaseStudy[];

export function getOtsPatternDefinition(id: string): OtsPatternDefinition | undefined {
  return jsGetDef(id) as OtsPatternDefinition | undefined;
}

export function getOtsIncident(id: string): OtsIncidentCaseStudy | undefined {
  return jsGetInc(id) as OtsIncidentCaseStudy | undefined;
}
