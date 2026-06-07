/**
 * Open Source Trust Center — static MVP data for /opensource-trust.
 *
 * One Trust Center, one subject (OpenSoyce itself). Every claim is anchored
 * to a publicly verifiable artifact: a merged PR + commit SHA, a deployed
 * surface URL, a doc on `main`, or one of the six proof-package artifacts.
 *
 * Hard rules enforced by scripts/test-open-source-trust-center.mjs:
 *   - exactly one subject in the MVP data set
 *   - subject is freewho99/opensoyce (the only subject the MVP supports)
 *   - every claim's sectionId is one of the seven §5 section types
 *   - every claim has a non-empty headline under 80 chars
 *   - every claim has a non-empty body under 280 chars
 *   - every claim has an audience from the fixed five-audience vocabulary
 *   - every claim has a non-empty proofAnchors array
 *   - every proofAnchor has a known proofType, non-empty label, non-empty href
 *   - every proofAnchor with proofType === 'pr' has a positive integer pr +
 *     a 7- or 40-char hex sha
 *   - no claim's headline or body contains a banned marketing substring
 *     (SOC 2 / SOC2 / Vanta / Drata / enterprise compliance /
 *      continuous monitoring / compliance certified / audit-ready)
 *   - no claim record has a `visibility` field (would telegraph private
 *     scope creep; private evidence belongs to a future Trust Vault ADR)
 *   - no claim's headline or body contains future-tense marketing tells
 *     (coming soon / we will / roadmap / planned for / in development)
 *   - every PR proofAnchor cites a PR that appears in TRUST_TIMELINE_EVENTS
 *     (PR #45 data) OR is documented exceptionally inline
 *   - every section from §5 has at least one claim
 *
 * Multi-subject, Trust Vault (private evidence), embeddable badges, Vanta
 * / Drata export, and SOC 2 claim activation each require their own ADR.
 * Marketing language for any of those flips the banned-substring test red.
 *
 * Doctrine: the MVP is honest about what does not exist. Empty sections
 * (exception policy, export) render as placeholders, not as "coming soon"
 * marketing.
 */

export const OPEN_SOURCE_TRUST_CENTER_SECTION_IDS = Object.freeze([
  'trust-posture',
  'gate-proof',
  'timeline-proof',
  'dashboard-proof',
  'exception-placeholder',
  'methodology',
  'export-placeholder',
]);

export const OPEN_SOURCE_TRUST_CENTER_AUDIENCES = Object.freeze([
  'buyer',
  'security-reviewer',
  'engineering-leader',
  'maintainer',
  'all',
]);

export const OPEN_SOURCE_TRUST_CENTER_PROOF_TYPES = Object.freeze([
  'pr',
  'live-surface',
  'doc-anchor',
  'proof-artifact',
]);

export const OPEN_SOURCE_TRUST_CENTER_POSTURE_LABELS = Object.freeze([
  'use-ready',
  'watchlist',
  'risky',
  'graveyard',
]);

export const OPEN_SOURCE_TRUST_CENTER_BANNED_SUBSTRINGS = Object.freeze([
  'SOC 2',
  'SOC2',
  'Vanta',
  'Drata',
  'enterprise compliance',
  'continuous monitoring',
  'compliance certified',
  'audit-ready',
]);

export const OPEN_SOURCE_TRUST_CENTER_FUTURE_TENSE_TELLS = Object.freeze([
  'coming soon',
  'we will',
  'roadmap',
  'planned for',
  'in development',
]);

/**
 * Phase 3 launch-narrative-specific banned vocabulary.
 *
 * Per docs/architecture/launch-narrative-positioning-adr.md §6.2. Applied to
 * the linking-page hygiene windows around every /opensource-trust occurrence
 * in addition to the four prior vocabularies (banned substrings,
 * future-tense tells, soft-banned marketing verbs, and visibility-field
 * guard). The launch surface is the strictest copy surface yet.
 *
 * The entries protect against three drift patterns:
 *   - "zero noise" framing of VEX / reachability (Phase 6 doctrine)
 *   - "drop-in" / "auto-fix" / "auto-replace" / "remediate" framing
 *     (Phase 7 + Phase 9 doctrine)
 *   - "AI agent" / "agentic" framing of the public surface
 *     (strategic-frame defense)
 *
 * These come off the list in the same PR that ships the underlying
 * capability — never separately.
 */
export const OPEN_SOURCE_TRUST_CENTER_PHASE_3_LAUNCH_BANNED_SUBSTRINGS = Object.freeze([
  'zero noise',
  'noise-free',
  'noise free',
  'false-positive elimination',
  'false positive elimination',
  'drop-in',
  'drop in replacement',
  'auto-fix',
  'auto fix',
  'auto-replace',
  'auto replace',
  'autonomous agent',
  'agentic remediation',
]);

/**
 * Phase 4 distribution-specific banned vocabulary.
 *
 * Per docs/architecture/oss-distribution-cli-badge-adr.md §5.4 and the CLI
 * v0 sub-sketch §5.2. Applied to CLI strings, CLI help text, CLI README,
 * and (when the badge ships in PR-B2) the badge SVG copy + recommended
 * README block. Word-boundary semantics for `secure` and `safe` so the
 * standalone-adjective case is caught but longer composite words
 * (e.g. `secured`, `safety`) are not false-positives.
 *
 * Comes off the list only when an underlying capability shipping
 * justifies the claim — never separately.
 */
export const OPEN_SOURCE_TRUST_CENTER_PHASE_4_DISTRIBUTION_BANNED_SUBSTRINGS = Object.freeze([
  'certified',
  'verified',
]);

/**
 * Phase 4 word-boundary entries: standalone adjectives that read as safety
 * claims when used alone but are legitimate in compound forms. Enforced
 * with a word-boundary regex, not a plain substring check.
 */
export const OPEN_SOURCE_TRUST_CENTER_PHASE_4_WORD_BOUNDARY_BANNED = Object.freeze([
  'secure',
  'safe',
]);

export const OPEN_SOURCE_TRUST_CENTER_MVP_SUBJECT = Object.freeze({
  owner: 'freewho99',
  repo: 'opensoyce',
  displayName: 'OpenSoyce',
});

/**
 * Static MVP Trust Center for OpenSoyce. Every claim's anchor points at an
 * artifact that already exists on `main` as of this commit, or at a
 * deployed surface that already renders public data.
 *
 * Section order matches §5 of docs/architecture/open-source-trust-center-sketch.md.
 */
export const OPEN_SOURCE_TRUST_CENTER_SUBJECTS = Object.freeze([
  Object.freeze({
    owner: 'freewho99',
    repo: 'opensoyce',
    displayName: 'OpenSoyce',
    postureLabel: 'use-ready',
    postureSummary:
      'OpenSoyce shows how trust decisions are made, changed, and recorded. Every claim below links to a deployed surface, a merged PR, or a doc on main.',
    primaryCta: Object.freeze({
      label: 'See a real trust decision now',
      href: '/proof/gate?package=ua-parser-js@0.7.29',
    }),
    lastEvaluated: '2026-06-05',
    claims: Object.freeze([
      // -------------------------------------------------------------------
      // §5.1 Trust posture
      // -------------------------------------------------------------------
      Object.freeze({
        id: 'posture-use-ready',
        sectionId: 'trust-posture',
        audience: 'buyer',
        headline: 'Subject posture: use-ready.',
        body:
          'The posture reflects that OpenSoyce’s evaluations are use-ready today. It does not claim that every dependency it evaluates is risk-free.',
        proofAnchors: Object.freeze([
          Object.freeze({
            proofType: 'live-surface',
            label: 'Repo Trust Dashboard (per-repo posture)',
            href: '/projects/freewho99/opensoyce/trust',
          }),
        ]),
      }),
      Object.freeze({
        id: 'posture-cta-live-gate',
        sectionId: 'trust-posture',
        audience: 'all',
        headline: 'Run a live trust decision.',
        body:
          'The primary CTA runs a real evaluation on a canonical supply-chain compromise. The gate is the same one Guard PR comments call.',
        proofAnchors: Object.freeze([
          Object.freeze({
            proofType: 'live-surface',
            label: '/proof/gate?package=ua-parser-js@0.7.29',
            href: '/proof/gate?package=ua-parser-js@0.7.29',
          }),
        ]),
      }),

      // -------------------------------------------------------------------
      // §5.2 Gate proof
      // -------------------------------------------------------------------
      Object.freeze({
        id: 'gate-callable',
        sectionId: 'gate-proof',
        audience: 'buyer',
        headline: 'The gate is callable at a public URL.',
        body:
          'Every visitor can evaluate a package by URL. The /proof/gate page is the verbatim API mirror; no proxying, no narration.',
        proofAnchors: Object.freeze([
          Object.freeze({
            proofType: 'live-surface',
            label: '/proof/gate',
            href: '/proof/gate',
          }),
        ]),
      }),
      Object.freeze({
        id: 'gate-osv-advisories',
        sectionId: 'gate-proof',
        audience: 'security-reviewer',
        headline: 'The gate evaluates real OSV advisories.',
        body:
          'Severity normalization (PR #28) feeds the policy layer. Live-fetch row enrichment (PR #30) turns CWE-829/CWE-912 into install-script + maintainer-compromise signals.',
        proofAnchors: Object.freeze([
          Object.freeze({
            proofType: 'pr',
            label: 'PR #28 — OSV severity normalization',
            href: 'https://github.com/freewho99/opensoyce/pull/28',
            pr: 28,
            sha: '392b1df',
          }),
          Object.freeze({
            proofType: 'pr',
            label: 'PR #30 — Live-fetch row enrichment',
            href: 'https://github.com/freewho99/opensoyce/pull/30',
            pr: 30,
            sha: '084297a',
          }),
        ]),
      }),
      Object.freeze({
        id: 'gate-output-verbatim',
        sectionId: 'gate-proof',
        audience: 'security-reviewer',
        headline: 'The gate’s output is verbatim, not narrated.',
        body:
          'Three captures of ua-parser-js@0.7.29 are preserved in docs/proof/before-after-risk-example.md across the closed arc. The historical record is not edited.',
        proofAnchors: Object.freeze([
          Object.freeze({
            proofType: 'proof-artifact',
            label: 'docs/proof/before-after-risk-example.md',
            href: 'https://github.com/freewho99/opensoyce/blob/main/docs/proof/before-after-risk-example.md',
          }),
        ]),
      }),

      // -------------------------------------------------------------------
      // §5.3 Timeline proof
      // -------------------------------------------------------------------
      Object.freeze({
        id: 'timeline-decision-changes',
        sectionId: 'timeline-proof',
        audience: 'security-reviewer',
        headline: 'Decision changes are recorded with PR + SHA.',
        body:
          'The Trust Timeline renders 8 static events across the closed OTS proof-package arc. Each event carries its PR number and merge commit SHA.',
        proofAnchors: Object.freeze([
          Object.freeze({
            proofType: 'live-surface',
            label: '/proof/timeline',
            href: '/proof/timeline',
          }),
        ]),
      }),
      Object.freeze({
        id: 'timeline-evidence-verbatim',
        sectionId: 'timeline-proof',
        audience: 'security-reviewer',
        headline: 'Historical evidence is preserved verbatim, not edited.',
        body:
          'The capture history holds three preserved gate evaluations across PR #20, #28, and #33. Earlier captures are not rewritten when the gate later evolves.',
        proofAnchors: Object.freeze([
          Object.freeze({
            proofType: 'proof-artifact',
            label: 'docs/proof/before-after-risk-example.md#capture-history',
            href: 'https://github.com/freewho99/opensoyce/blob/main/docs/proof/before-after-risk-example.md#capture-history',
          }),
        ]),
      }),
      Object.freeze({
        id: 'timeline-doctrine-enforced',
        sectionId: 'timeline-proof',
        audience: 'security-reviewer',
        headline: 'The doctrine “risk does not lose its name” is enforced by test.',
        body:
          'The Trust Timeline structural-invariants test (PR #45) rejects synthesized prose, bans the policy_change anti-category, and requires every event to carry a PR + SHA.',
        proofAnchors: Object.freeze([
          Object.freeze({
            proofType: 'pr',
            label: 'PR #45 — Trust Timeline structural-invariants test',
            href: 'https://github.com/freewho99/opensoyce/pull/45',
            pr: 45,
            sha: '8a3e53a',
          }),
        ]),
      }),

      // -------------------------------------------------------------------
      // §5.4 Dashboard proof
      // -------------------------------------------------------------------
      Object.freeze({
        id: 'dashboard-composes-spine',
        sectionId: 'dashboard-proof',
        audience: 'engineering-leader',
        headline: 'The Dashboard composes Gate + Timeline + workflow scan into one view.',
        body:
          'The Repo Trust Dashboard is the per-repo trust surface. It reuses gate examples, timeline events, and workflow findings without duplicating their data models.',
        proofAnchors: Object.freeze([
          Object.freeze({
            proofType: 'live-surface',
            label: '/projects/freewho99/opensoyce/trust',
            href: '/projects/freewho99/opensoyce/trust',
          }),
        ]),
      }),
      Object.freeze({
        id: 'dashboard-no-fabricated-risks',
        sectionId: 'dashboard-proof',
        audience: 'engineering-leader',
        headline: 'Inventing risky deps is a doctrine violation enforced by test.',
        body:
          'PR #47’s invariants assert that the static MVP posture has zero risky deps and that the page renders an explicit empty-state copy. Fabricating posture rows fails CI.',
        proofAnchors: Object.freeze([
          Object.freeze({
            proofType: 'pr',
            label: 'PR #47 — Repo Trust Dashboard MVP + invariants',
            href: 'https://github.com/freewho99/opensoyce/pull/47',
            pr: 47,
            sha: 'b3ee8d3',
          }),
        ]),
      }),
      Object.freeze({
        id: 'dashboard-empty-state-honest',
        sectionId: 'dashboard-proof',
        audience: 'maintainer',
        headline: 'Non-MVP repos render an honest empty state, not fabricated posture.',
        body:
          'The Dashboard architecture sketch defines the empty-state discipline: any owner/repo without a static MVP posture renders an unambiguous “no static posture” card.',
        proofAnchors: Object.freeze([
          Object.freeze({
            proofType: 'proof-artifact',
            label: 'docs/architecture/repo-trust-dashboard-sketch.md',
            href: 'https://github.com/freewho99/opensoyce/blob/main/docs/architecture/repo-trust-dashboard-sketch.md',
          }),
        ]),
      }),

      // -------------------------------------------------------------------
      // §5.5 Exception policy placeholder
      // -------------------------------------------------------------------
      Object.freeze({
        id: 'exception-placeholder-empty',
        sectionId: 'exception-placeholder',
        audience: 'security-reviewer',
        headline: 'Repo-specific gate exceptions: queued in a separate ADR.',
        body:
          'Exceptions today live in the gate handler’s per-call exception-lookup path and are scoped per-call, not per-repo. Repo-scoped exception persistence has not shipped. This section is intentionally empty.',
        proofAnchors: Object.freeze([
          Object.freeze({
            proofType: 'doc-anchor',
            label: 'docs/architecture/repo-trust-dashboard-sketch.md',
            href: 'https://github.com/freewho99/opensoyce/blob/main/docs/architecture/repo-trust-dashboard-sketch.md',
          }),
        ]),
      }),

      // -------------------------------------------------------------------
      // §5.6 Methodology
      // -------------------------------------------------------------------
      Object.freeze({
        id: 'methodology-four-layers',
        sectionId: 'methodology',
        audience: 'security-reviewer',
        headline: 'OpenSoyce separates detection, evidence, policy, and enforcement.',
        body:
          'The four-layer doctrine page documents what each layer can and cannot say. A pattern can be educational before it is enforceable; the product says which is which.',
        proofAnchors: Object.freeze([
          Object.freeze({
            proofType: 'doc-anchor',
            label: 'docs/proof/doctrine-pattern-enforcement.md#the-four-layers',
            href: 'https://github.com/freewho99/opensoyce/blob/main/docs/proof/doctrine-pattern-enforcement.md#the-four-layers',
          }),
        ]),
      }),
      Object.freeze({
        id: 'methodology-coverage-honest',
        sectionId: 'methodology',
        audience: 'maintainer',
        headline: 'Coverage is published honestly: 20 of 31 patterns are gate-active.',
        body:
          'The /patterns catalog renders every pattern with its gate-active state. Catalog-only patterns are labeled as such; nothing pretends to enforce what it cannot.',
        proofAnchors: Object.freeze([
          Object.freeze({
            proofType: 'live-surface',
            label: '/patterns',
            href: '/patterns',
          }),
        ]),
      }),
      Object.freeze({
        id: 'methodology-regression-curl',
        sectionId: 'methodology',
        audience: 'security-reviewer',
        headline: 'A regression curl verifies the live gate any time.',
        body:
          'The phase-closeout doc carries a single-curl recipe against the production gate. The doctrine and the recipe live on the same page.',
        proofAnchors: Object.freeze([
          Object.freeze({
            proofType: 'doc-anchor',
            label: 'docs/proof/phase-closeout.md#production-verification-recipe',
            href: 'https://github.com/freewho99/opensoyce/blob/main/docs/proof/phase-closeout.md#production-verification-recipe',
          }),
        ]),
      }),

      // -------------------------------------------------------------------
      // §5.7 Export placeholder
      // -------------------------------------------------------------------
      Object.freeze({
        id: 'export-placeholder-empty',
        sectionId: 'export-placeholder',
        audience: 'buyer',
        headline: 'Evidence export: queued in a separate ADR.',
        body:
          'Compliance-platform integrations are future ADRs. This MVP does not claim export readiness. The section is intentionally empty; the doctrine forbids pretending otherwise.',
        proofAnchors: Object.freeze([
          Object.freeze({
            proofType: 'doc-anchor',
            label: 'docs/architecture/ots-next-phase-adr.md',
            href: 'https://github.com/freewho99/opensoyce/blob/main/docs/architecture/ots-next-phase-adr.md',
          }),
        ]),
      }),
    ]),
  }),
]);

/**
 * Lookup the static Trust Center subject. Returns the subject record if a
 * static MVP entry exists; returns null otherwise (the page renders an
 * honest empty state). Today only the freewho99/opensoyce subject exists.
 */
export function getOpenSourceTrustCenterSubject(owner, repo) {
  const o = String(owner || '').trim().toLowerCase();
  const r = String(repo || '').trim().toLowerCase();
  if (!o || !r) return null;
  for (const s of OPEN_SOURCE_TRUST_CENTER_SUBJECTS) {
    if (s.owner.toLowerCase() === o && s.repo.toLowerCase() === r) return s;
  }
  return null;
}

/**
 * Group a subject's claims by their §5 section ID, preserving section order.
 * Returns an array of { sectionId, claims } in the canonical section order
 * defined by OPEN_SOURCE_TRUST_CENTER_SECTION_IDS.
 */
export function groupClaimsBySection(subject) {
  if (!subject || !Array.isArray(subject.claims)) return [];
  const grouped = OPEN_SOURCE_TRUST_CENTER_SECTION_IDS.map((sectionId) => ({
    sectionId,
    claims: subject.claims.filter((c) => c.sectionId === sectionId),
  }));
  return grouped;
}
