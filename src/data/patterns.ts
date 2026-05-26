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
}

export interface OtsPatternPack {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly patternIds: readonly string[];
}

export interface OtsIncidentCaseStudy {
  readonly id: string;
  readonly name: string;
  readonly date: string;
  readonly target: string;
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
