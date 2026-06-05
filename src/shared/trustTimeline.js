/**
 * Trust Timeline — static MVP data for the /proof/timeline page.
 *
 * Each event records a transition in the trust state of OpenSoyce against
 * a specific package, anchored to a merged PR + SHA already on main.
 *
 * Hard rules enforced by scripts/test-trust-timeline.mjs:
 *   - every event has a valid type from the six-type taxonomy
 *   - every event has a positive integer `pr` field
 *   - every event has a `sha` matching a 7- or 40-char hex string
 *   - every event has a non-empty `summary` under 280 chars
 *   - events with a `package` field use the same package across the MVP
 *   - no two events share the same (pr, type) tuple
 *   - event count for the MVP equals 8
 *   - no event has type 'policy_change' (anti-category)
 *
 * Migration to persistence is a separate ADR. The static MVP delivers
 * product value before either git-backed events or a Supabase event
 * table exists.
 */

export const TRUST_TIMELINE_EVENT_TYPES = Object.freeze([
  'decision_change',
  'firing_set_change',
  'parity_event',
  'surface_shipped',
  'evidence_capture',
  'review_event',
]);

export const TRUST_TIMELINE_LAYERS = Object.freeze([
  'evidence',
  'wiring',
  'surface',
  'policy',
]);

export const TRUST_TIMELINE_MVP_FOCUS_PACKAGE = 'ua-parser-js';

/**
 * Eight events from the closed OTS proof-package arc. Each event's claim
 * is verifiable against the linked PR title or doc section heading — no
 * synthesized prose. References point at deployed surfaces or repo-doc
 * anchors that exist on main as of the static MVP commit.
 */
export const TRUST_TIMELINE_EVENTS = Object.freeze([
  {
    type: 'evidence_capture',
    date: '2026-05-31',
    pr: 20,
    sha: 'bff98ae',
    layer: 'evidence',
    package: 'ua-parser-js',
    summary:
      'First verbatim capture of ua-parser-js@0.7.29 gate evidence: 1 pattern (medium), ALLOW. Evidence-layer gap named honestly.',
    references: [
      { label: 'Capture history', href: 'https://github.com/freewho99/opensoyce/blob/main/docs/proof/before-after-risk-example.md#capture-history' },
    ],
  },
  {
    type: 'decision_change',
    date: '2026-06-01',
    pr: 28,
    sha: '392b1df',
    layer: 'evidence',
    package: 'ua-parser-js',
    summary:
      'OSV severity normalization (bulk + per-vuln detail enrichment, max-of-both severity). ua-parser-js@0.7.29 flipped ALLOW → BLOCK.',
    references: [
      { label: 'PR #28', href: 'https://github.com/freewho99/opensoyce/pull/28' },
    ],
  },
  {
    type: 'firing_set_change',
    date: '2026-06-01',
    pr: 30,
    sha: '084297a',
    layer: 'evidence',
    package: 'ua-parser-js',
    summary:
      'Live-fetch row enrichment (CWE-829/CWE-912 → install-script + remote-execution + maintainer-compromise signals). Firing set 1 → 4 patterns; decision stayed BLOCK.',
    references: [
      { label: 'PR #30', href: 'https://github.com/freewho99/opensoyce/pull/30' },
    ],
  },
  {
    type: 'surface_shipped',
    date: '2026-06-02',
    pr: 32,
    sha: '8521602',
    layer: 'surface',
    summary:
      'Public /proof/gate?package=name@version UI shipped — calls the same compliance-gate API Guard PR comments use.',
    references: [
      { label: 'Live surface', href: '/proof/gate?package=ua-parser-js@0.7.29' },
    ],
  },
  {
    type: 'parity_event',
    date: '2026-06-03',
    pr: 33,
    sha: '169397b',
    layer: 'wiring',
    package: 'ua-parser-js',
    summary:
      'Production version-suffix lookup bug surfaced by /proof/gate first live render and fixed. Deployed API caught up to canonical local evidence.',
    references: [
      { label: 'PR #33', href: 'https://github.com/freewho99/opensoyce/pull/33' },
    ],
  },
  {
    type: 'evidence_capture',
    date: '2026-06-03',
    pr: 40,
    sha: '74ad3fd',
    layer: 'evidence',
    package: 'ua-parser-js',
    summary:
      'Doc-repair captured the parity event under Capture History. Three captures now preserved verbatim across the arc.',
    references: [
      { label: 'Capture history', href: 'https://github.com/freewho99/opensoyce/blob/main/docs/proof/before-after-risk-example.md#capture-history' },
    ],
  },
  {
    type: 'surface_shipped',
    date: '2026-06-03',
    pr: 41,
    sha: 'b84b5e0',
    layer: 'surface',
    summary:
      'Discoverability cross-links from /proof/ots-replays (live-detector cards) and /incidents/:id (unambiguous single-version targets) to /proof/gate.',
    references: [
      { label: 'Replay lab', href: '/proof/ots-replays' },
    ],
  },
  {
    type: 'surface_shipped',
    date: '2026-06-03',
    pr: 42,
    sha: '17e28af',
    layer: 'surface',
    summary:
      'Phase closeout doc shipped. OTS proof-package engineering arc closed with all four named engineering gaps closed.',
    references: [
      { label: 'Phase closeout', href: 'https://github.com/freewho99/opensoyce/blob/main/docs/proof/phase-closeout.md' },
    ],
  },
]);
