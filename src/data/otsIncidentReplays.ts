import {
  OTS_INCIDENT_REPLAYS as JS_REPLAYS,
  getOtsIncidentReplay as jsGetReplay,
} from '../shared/otsIncidentReplays.js';
import type { OtsPatternSeverity } from './patterns';

export type OtsReplayMode = 'live-detector' | 'catalog-mapping';

export interface OtsDetectorEvidence {
  readonly label: string;
  readonly value: string;
}

export interface OtsDetectedPattern {
  readonly patternId: string;
  readonly severity: OtsPatternSeverity;
  readonly policyImpact: 'allow' | 'warn' | 'block';
  readonly confidence: number;
  readonly evidence: readonly OtsDetectorEvidence[];
}

export interface OtsIncidentReplayLive {
  readonly incidentId: string;
  readonly replayMode: 'live-detector';
  readonly observedFacts: readonly string[];
  /** Synthetic row fed to detectOtsPatternsForRow at render time. */
  readonly fixtureRow: Record<string, unknown>;
  readonly fixtureContext: Record<string, unknown>;
  readonly expectedPatternIds: readonly string[];
}

export interface OtsIncidentReplayCatalogMapping {
  readonly incidentId: string;
  readonly replayMode: 'catalog-mapping';
  /** Why detector v1 doesn't have a live branch for this signal shape. */
  readonly detectorGap: string;
  readonly observedFacts: readonly string[];
  readonly expectedPatternIds: readonly string[];
}

export type OtsIncidentReplay = OtsIncidentReplayLive | OtsIncidentReplayCatalogMapping;

export const OTS_INCIDENT_REPLAYS = JS_REPLAYS as readonly OtsIncidentReplay[];

export function getOtsIncidentReplay(incidentId: string): OtsIncidentReplay | undefined {
  return jsGetReplay(incidentId) as OtsIncidentReplay | undefined;
}
