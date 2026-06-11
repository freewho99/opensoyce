// Static MVP trust-record data, inlined for the CLI workspace.
//
// The CLI workspace must not import the web app's src/shared/ JS modules
// directly (different rootDir, different module resolution). For v0, the
// CLI keeps its own copy of the static MVP data here. A structural test
// in scripts/test-cli-v0.mjs asserts that the entries below match the
// shared module's data verbatim — so when the shared module updates
// (posture additions, timeline events), the CLI test fails until the CLI's
// copy updates too. The CLI never produces evidence; it only mirrors.
//
// When Phase 5 (Trust Vault) introduces a public JSON endpoint for the
// trust record, the CLI switches from inlined data to a runtime fetch and
// this file is removed in the same PR.

export interface CliStaticPosture {
  owner: string;
  repo: string;
  postureLabel: 'use-ready' | 'watchlist' | 'risky' | 'graveyard';
  postureSummary: string;
  references: ReadonlyArray<{ label: string; href: string }>;
}

export interface CliTimelineEvent {
  type: string;
  date: string;
  pr: number;
  sha: string;
  layer: string;
  summary: string;
  package?: string;
}

export const STATIC_POSTURES: ReadonlyArray<CliStaticPosture> = [
  {
    owner: 'freewho99',
    repo: 'opensoyce',
    postureLabel: 'watchlist',
    postureSummary:
      'One LOW-severity workflow finding (workflow write access, pull-requests scope — affects maintainers only, not downstream users). No risky deps in the lockfile. Gate example below illustrates the BLOCK + 4-pattern response on the canonical 2021 supply-chain compromise.',
    references: [
      { label: 'PR #28', href: 'https://github.com/freewho99/opensoyce/pull/28' },
      { label: 'PR #30', href: 'https://github.com/freewho99/opensoyce/pull/30' },
      { label: 'PR #32', href: 'https://github.com/freewho99/opensoyce/pull/32' },
    ],
  },
];

export const STATIC_TIMELINE: ReadonlyArray<CliTimelineEvent> = [
  {
    type: 'evidence_capture',
    date: '2026-05-31',
    pr: 20,
    sha: 'bff98ae',
    layer: 'evidence',
    package: 'ua-parser-js',
    summary:
      'First verbatim capture of ua-parser-js@0.7.29 gate evidence: 1 pattern (medium), ALLOW. Evidence-layer gap named honestly.',
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
  },
  {
    type: 'surface_shipped',
    date: '2026-06-02',
    pr: 32,
    sha: '8521602',
    layer: 'surface',
    summary:
      'Public /proof/gate?package=name@version UI shipped — calls the same compliance-gate API Guard PR comments use.',
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
  },
  {
    type: 'surface_shipped',
    date: '2026-06-03',
    pr: 41,
    sha: 'b84b5e0',
    layer: 'surface',
    summary:
      'Discoverability cross-links from /proof/ots-replays (live-detector cards) and /incidents/:id (unambiguous single-version targets) to /proof/gate.',
  },
  {
    type: 'surface_shipped',
    date: '2026-06-03',
    pr: 42,
    sha: '17e28af',
    layer: 'surface',
    summary:
      'Phase closeout doc shipped. OTS proof-package engineering arc closed with all four named engineering gaps closed.',
  },
];
