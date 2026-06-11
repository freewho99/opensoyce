/**
 * Repo Trust Dashboard — static MVP data for the
 * /projects/:owner/:repo/trust page.
 *
 * One posture object per supported repo. MVP supports exactly one:
 * freewho99/opensoyce. Other :owner/:repo pairs render an honest empty
 * state (no fabricated posture data).
 *
 * Hard rules enforced by scripts/test-repo-trust-dashboard.mjs:
 *   - exactly one posture in the MVP data set
 *   - posture's owner+repo matches the MVP focus repo
 *   - postureLabel is from the fixed four-label vocabulary
 *   - postureSummary is non-empty and under 280 chars
 *   - gateExamples is non-empty; each has packageQuery + expectedAction
 *     + expectedPatternCount + rationale
 *   - workflowFindingsSource is one of 'live' / 'static-snapshot'
 *     (MVP uses 'static-snapshot')
 *   - riskyDeps is an array (MAY be empty — empty is the honest MVP value)
 *   - timelinePreviewFilter has byPackage or byPr (non-empty)
 *   - exceptionsPlaceholder.count === 0 (anything else means
 *     persistence leaked into the MVP)
 *   - references have non-empty label + href
 *   - every PR cited in references appears in TRUST_TIMELINE_EVENTS
 *     (cross-source consistency with PR #45)
 *
 * Migration to multi-repo or persistent posture is a separate ADR.
 * The static MVP delivers product value before either lands.
 */

export const REPO_TRUST_POSTURE_LABELS = Object.freeze([
  'use-ready',
  'watchlist',
  'risky',
  'graveyard',
]);

export const REPO_TRUST_GATE_ACTIONS = Object.freeze(['BLOCK', 'WARN', 'ALLOW']);

export const REPO_TRUST_SEVERITIES = Object.freeze([
  'critical',
  'high',
  'medium',
  'low',
]);

export const REPO_TRUST_WORKFLOW_SOURCES = Object.freeze([
  'live',
  'static-snapshot',
]);

export const REPO_TRUST_MVP_FOCUS = Object.freeze({
  owner: 'freewho99',
  repo: 'opensoyce',
});

/**
 * Static MVP posture for freewho99/opensoyce. Every field is anchored to
 * a merged PR + SHA on main as of this commit. The workflow finding
 * mirrors the verbatim output of the existing repo workflow scan
 * (PRs #15 / #16 / #18). The gate example mirrors the Trust Timeline's
 * focus package across the closed OTS proof-package arc.
 */
export const REPO_TRUST_POSTURES = Object.freeze([
  Object.freeze({
    owner: 'freewho99',
    repo: 'opensoyce',
    postureLabel: 'watchlist',
    postureSummary:
      'One LOW-severity workflow finding (workflow write access, pull-requests scope — affects maintainers only, not downstream users). No risky deps in the lockfile. Gate example below illustrates the BLOCK + 4-pattern response on the canonical 2021 supply-chain compromise.',
    lastEvaluated: '2026-06-05',
    gateExamples: Object.freeze([
      Object.freeze({
        packageQuery: 'ua-parser-js@0.7.29',
        expectedAction: 'BLOCK',
        expectedPatternCount: 4,
        rationale:
          'Canonical 2021 supply-chain compromise. Evaluated here to demonstrate the gate response after PR #28 (severity normalization) and PR #30 (compromise-indicator enrichment). Not actually in this repo’s lockfile.',
      }),
    ]),
    workflowFindingsSource: 'static-snapshot',
    workflowFindings: Object.freeze([
      Object.freeze({
        patternId: 'dangerous-release-permission',
        patternName: 'WORKFLOW WRITE ACCESS',
        severity: 'low',
        policyImpact: 'warn',
        source: 'GitHub workflow',
        origin: '.github/workflows/opensoyce-scan.yml#scan',
        writeScopes: 'pull-requests',
      }),
    ]),
    riskyDeps: Object.freeze([]),
    timelinePreviewFilter: Object.freeze({
      byPackage: Object.freeze(['ua-parser-js']),
    }),
    exceptionsPlaceholder: Object.freeze({
      count: 0,
      message:
        'No repo-specific exceptions configured. Repo-scoped exception storage is queued in a separate ADR. Today, exceptions live in the gate handler’s per-call exception-lookup path and are scoped per-call, not per-repo.',
    }),
    references: Object.freeze([
      Object.freeze({ label: 'PR #28 — OSV severity normalization', href: 'https://github.com/freewho99/opensoyce/pull/28' }),
      Object.freeze({ label: 'PR #30 — Live-fetch row enrichment', href: 'https://github.com/freewho99/opensoyce/pull/30' }),
      Object.freeze({ label: 'PR #32 — Public /proof/gate UI', href: 'https://github.com/freewho99/opensoyce/pull/32' }),
      Object.freeze({ label: 'PR #33 — Production-parity bug fix', href: 'https://github.com/freewho99/opensoyce/pull/33' }),
      Object.freeze({ label: 'Project detail (existing SOYCE view)', href: '/projects/freewho99/opensoyce' }),
      Object.freeze({ label: '/proof/gate', href: '/proof/gate?package=ua-parser-js@0.7.29' }),
      Object.freeze({ label: '/proof/timeline', href: '/proof/timeline' }),
    ]),
  }),
]);

/**
 * Lookup the static posture for an owner/repo. Returns the posture
 * object if a static MVP entry exists; returns null otherwise (caller
 * is responsible for rendering the honest empty state).
 */
export function getRepoTrustPosture(owner, repo) {
  const o = String(owner || '').trim().toLowerCase();
  const r = String(repo || '').trim().toLowerCase();
  if (!o || !r) return null;
  for (const p of REPO_TRUST_POSTURES) {
    if (p.owner.toLowerCase() === o && p.repo.toLowerCase() === r) return p;
  }
  return null;
}

/**
 * Predicate used by the page to decide whether to render the dashboard
 * sections or the honest empty state. Same logic as getRepoTrustPosture,
 * exposed for testability.
 */
export function isMvpFocusRepo(owner, repo) {
  return getRepoTrustPosture(owner, repo) !== null;
}
