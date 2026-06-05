import {
  TRUST_TIMELINE_EVENTS as JS_EVENTS,
  TRUST_TIMELINE_EVENT_TYPES as JS_TYPES,
  TRUST_TIMELINE_LAYERS as JS_LAYERS,
  TRUST_TIMELINE_MVP_FOCUS_PACKAGE as JS_FOCUS,
} from '../shared/trustTimeline.js';

export type TrustTimelineEventType =
  | 'decision_change'
  | 'firing_set_change'
  | 'parity_event'
  | 'surface_shipped'
  | 'evidence_capture'
  | 'review_event';

export type TrustTimelineLayer =
  | 'evidence'
  | 'wiring'
  | 'surface'
  | 'policy';

export interface TrustTimelineReference {
  readonly label: string;
  readonly href: string;
}

export interface TrustTimelineEvent {
  readonly type: TrustTimelineEventType;
  readonly date: string;
  readonly pr: number;
  readonly sha: string;
  readonly layer: TrustTimelineLayer;
  readonly summary: string;
  readonly package?: string;
  readonly references?: readonly TrustTimelineReference[];
}

export const TRUST_TIMELINE_EVENT_TYPES = JS_TYPES as readonly TrustTimelineEventType[];
export const TRUST_TIMELINE_LAYERS = JS_LAYERS as readonly TrustTimelineLayer[];
export const TRUST_TIMELINE_EVENTS = JS_EVENTS as readonly TrustTimelineEvent[];
export const TRUST_TIMELINE_MVP_FOCUS_PACKAGE = JS_FOCUS as string;
