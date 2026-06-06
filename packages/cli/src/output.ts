// Default and JSON output formatters.
// Default output is short, factual, present-tense, free of marketing verbs.
// JSON output is verbatim CliEvidence per the sub-sketch §4.1.

import { STRINGS } from './strings.js';
import type { ParsedArgs } from './args.js';
import type { GateAction } from './exit-codes.js';

export type ProofType = 'pr' | 'live-surface' | 'doc-anchor' | 'proof-artifact';

export interface ProofAnchor {
  proofType: ProofType;
  label: string;
  href: string;
  pr?: number;
  sha?: string;
}

export interface CheckEvidence {
  command: 'check' | 'why';
  query: { package: string };
  action: GateAction;
  firedPatterns: Array<{ id?: string; name?: string; severity?: string }>;
  proofAnchors: ProofAnchor[];
  fetchedAt: string;
  apiBase: string;
  timelineContext?: TimelineEvent[];
}

export interface TrustEvidence {
  command: 'trust';
  query: { owner: string; repo: string };
  postureLabel: 'use-ready' | 'watchlist' | 'risky' | 'graveyard' | null;
  postureSummary?: string;
  action: GateAction;
  proofAnchors: ProofAnchor[];
  fetchedAt: string;
  apiBase: string;
}

export interface TimelineEvent {
  type: string;
  date: string;
  pr: number;
  sha: string;
  layer: string;
  summary: string;
  package?: string;
}

export interface TimelineEvidence {
  command: 'timeline';
  query: { packageFilter?: string; prFilter?: number };
  events: TimelineEvent[];
  fetchedAt: string;
}

export interface LockfileEntryEvidence {
  package: string;
  action: GateAction;
  firedPatternCount: number;
  proofAnchor: ProofAnchor;
}

export interface LockfileEvidence {
  command: 'lockfile';
  query: { lockfilePath: string };
  parserUsed: string;
  entries: LockfileEntryEvidence[];
  summary: { allow: number; warn: number; block: number; notEvaluated: number };
  worstAction: GateAction;
  fetchedAt: string;
  apiBase: string;
}

export function formatCheck(ev: CheckEvidence, args: ParsedArgs): string {
  if (args.json) return JSON.stringify(ev, null, 2) + '\n';
  if (args.quiet) return '';
  const action = STRINGS.actionCopy[ev.action];
  const lines: string[] = [
    `${STRINGS.labels.package}: ${ev.query.package}`,
    `${STRINGS.labels.action}: ${action}`,
    `${STRINGS.labels.patterns}: ${ev.firedPatterns.length}`,
  ];
  for (const a of ev.proofAnchors.slice(0, 3)) {
    lines.push(`${STRINGS.labels.proof}: ${a.label}`);
  }
  if (ev.timelineContext && ev.timelineContext.length > 0) {
    lines.push('');
    lines.push(`${STRINGS.labels.timeline}:`);
    for (const e of ev.timelineContext.slice(0, 5)) {
      lines.push(`  ${e.date} ${STRINGS.labels.pr} #${e.pr} ${e.sha.slice(0, 7)} ${e.summary}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

export function formatTrust(ev: TrustEvidence, args: ParsedArgs): string {
  if (args.json) return JSON.stringify(ev, null, 2) + '\n';
  if (args.quiet) return '';
  if (ev.postureLabel === null) {
    return STRINGS.notEvaluated.repo(ev.query.owner, ev.query.repo) + '\n';
  }
  const lines: string[] = [
    `${STRINGS.labels.repo}: ${ev.query.owner}/${ev.query.repo}`,
    `${STRINGS.labels.posture}: ${STRINGS.postureCopy[ev.postureLabel]}`,
  ];
  if (ev.postureSummary) lines.push(`${STRINGS.labels.summary}: ${ev.postureSummary}`);
  for (const a of ev.proofAnchors.slice(0, 3)) {
    lines.push(`${STRINGS.labels.proof}: ${a.label}`);
  }
  lines.push('');
  return lines.join('\n');
}

export function formatTimeline(ev: TimelineEvidence, args: ParsedArgs): string {
  if (args.json) return JSON.stringify(ev, null, 2) + '\n';
  if (args.quiet) return '';
  if (ev.events.length === 0) {
    return STRINGS.notEvaluated.timelineEmpty + '\n';
  }
  const lines: string[] = [];
  for (const e of ev.events) {
    lines.push(
      `${e.date}  ${e.type.padEnd(20)}  ${STRINGS.labels.pr} #${String(e.pr).padEnd(4)}  ${e.sha.slice(0, 7)}  ${e.summary}`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

export function formatLockfile(ev: LockfileEvidence, args: ParsedArgs): string {
  if (args.json) return JSON.stringify(ev, null, 2) + '\n';
  if (args.quiet) return '';
  const lines: string[] = [
    `${STRINGS.labels.package} count: ${ev.entries.length}`,
    `Parser: ${ev.parserUsed}`,
    `Worst action: ${STRINGS.actionCopy[ev.worstAction]}`,
    `ALLOW ${ev.summary.allow}  WARN ${ev.summary.warn}  BLOCK ${ev.summary.block}  NOT_EVALUATED ${ev.summary.notEvaluated}`,
    '',
  ];
  for (const e of ev.entries) {
    if (e.action === 'ALLOW') continue;
    lines.push(`  ${STRINGS.actionCopy[e.action].padEnd(14)} ${e.package} (${e.firedPatternCount})`);
  }
  lines.push('');
  return lines.join('\n');
}
