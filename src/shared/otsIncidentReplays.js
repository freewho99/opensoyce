/**
 * OTS Incident Replays — the proof layer for the OpenSoyce pattern engine.
 *
 * Each entry pairs a publicly cited supply-chain incident with either:
 *   - a `live-detector` fixture (a synthetic row + context fed through
 *     `detectOtsPatternsForRow` at render time; the page shows the
 *     ACTUAL output, not a narrated claim), or
 *   - a `catalog-mapping` (observed facts mapped against catalog
 *     pattern entries; honest where the detector does not yet have
 *     coverage for the incident's signal shape).
 *
 * Hard rules enforced by scripts/test-ots-replays.mjs:
 *   - every replay must point at an existing OTS_INCIDENTS entry with
 *     sourceConfidence in ('primary' | 'authoritative-secondary')
 *   - every live-detector replay's expectedPatternIds must equal the
 *     set the detector actually emits for fixtureRow + fixtureContext
 *   - every expectedPatternId must exist in the catalog
 *
 * Detector Coverage Roadmap: workflow rows (tj-actions shape) and
 * CDN/runtime-script rows (polyfill.io shape) are catalog-mapping for
 * now; live-detector branches for those signal shapes are queued for
 * OTS Detector v2.
 */

export const OTS_INCIDENT_REPLAYS = [
  // ------------------------------------------------------------------
  // Live-detector replays — detector runs the fixture at render time
  // ------------------------------------------------------------------
  {
    incidentId: 'xz-utils-backdoor',
    replayMode: 'live-detector',
    observedFacts: [
      'CVE-2024-3094 published against xz-utils 5.6.0 and 5.6.1.',
      'Backdoor was present in the release tarballs but absent from the upstream git source tree.',
      'Discovered by Andres Freund 2024-03-29 via investigation of ~500ms sshd latency.',
      'Build-time injection compromised sshd authentication path.'
    ],
    fixtureRow: {
      package: 'xz-utils',
      version: '5.6.1',
      ids: ['CVE-2024-3094'],
      severity: 'critical',
      verified: false,
      mismatchReason: 'Backdoor in release tarball; absent from upstream git source.'
    },
    fixtureContext: {},
    expectedPatternIds: ['known-vulnerability-exposure', 'source-package-mismatch']
  },
  {
    incidentId: 'ua-parser-js-compromise',
    replayMode: 'live-detector',
    observedFacts: [
      'GHSA-pjwm-rvh2-c87w confirmed malicious versions 0.7.29, 0.8.0, 1.0.0 published to npm 2021-10-22.',
      'Preinstall lifecycle script fetched and executed a remote payload (Windows credential stealer + miner; Linux miner).',
      'Single maintainer\'s npm account was compromised; patches 0.7.30 / 0.8.1 / 1.0.1 followed within hours.',
      'Advisory instructs treating affected machines as fully compromised and rotating all accessible secrets.'
    ],
    fixtureRow: {
      package: 'ua-parser-js',
      version: '0.7.29',
      ids: ['GHSA-pjwm-rvh2-c87w'],
      severity: 'critical',
      hasInstallScript: true,
      capabilityProfile: { remoteExecution: true },
      maintainerCompromise: { reason: 'Single maintainer npm account compromise — credential rotation required (advisory).' }
    },
    fixtureContext: {},
    expectedPatternIds: [
      'known-vulnerability-exposure',
      'install-time-remote-execution',
      'maintainer-account-compromise-signal'
    ]
  },
  {
    incidentId: 'event-stream-flatmap-stream',
    replayMode: 'live-detector',
    observedFacts: [
      'npm postmortem confirms flatmap-stream@0.1.1 was added as a direct dependency of event-stream@3.3.6 by a new maintainer.',
      'Obfuscated payload activated only inside Copay cryptocurrency wallet builds.',
      'Maintainer-transfer event predated the malicious release: original maintainer handed off control to an unknown contributor.',
      'Conditional payload evaded initial review; activated against specific build environment fingerprints.'
    ],
    fixtureRow: {
      package: 'event-stream',
      version: '3.3.6',
      hiddenDependency: {
        newDep: 'flatmap-stream@0.1.1',
        reason: 'New maintainer added flatmap-stream as direct dependency; payload targeted Copay builds.'
      },
      maintainerCompromise: { reason: 'Package ownership transferred to new contributor with no prior reputation.' }
    },
    fixtureContext: {},
    expectedPatternIds: [
      'hidden-dependency-injection',
      'maintainer-account-compromise-signal'
    ]
  },
  {
    incidentId: 'ledger-connect-kit',
    replayMode: 'live-detector',
    observedFacts: [
      'Ledger incident report: former employee\'s NPMJS account compromised via phishing 2023-12-14.',
      'Malicious versions 1.1.5, 1.1.6, 1.1.7 of @ledgerhq/connect-kit published.',
      'Injected payload was a wallet drainer.',
      'DApps loaded Connect Kit via CDN at runtime — propagation reached every consumer within the ~5-hour window before takedown.'
    ],
    fixtureRow: {
      package: '@ledgerhq/connect-kit',
      version: '1.1.6',
      maintainerCompromise: { reason: 'Former employee npm account phished post-offboarding (Ledger incident report).' },
      unknownRemoteEndpoint: {
        host: 'CDN runtime loader',
        reason: 'DApps load Connect Kit dynamically; a malicious npm publish reaches every consumer without a rebuild.'
      }
    },
    fixtureContext: {},
    expectedPatternIds: [
      'maintainer-account-compromise-signal',
      'unknown-remote-endpoint'
    ]
  },

  // ------------------------------------------------------------------
  // Catalog-mapping replays — detector v1 lacks the signal shape;
  // patterns are matched honestly against the catalog. Detector v2
  // will add workflow-row + CDN-runtime branches.
  // ------------------------------------------------------------------
  {
    incidentId: 'tj-actions-changed-files',
    replayMode: 'catalog-mapping',
    detectorGap: 'OTS Detector v1 is package-row shaped. GitHub Actions workflow rows (mutable tags, third-party action references, CI secret context) are queued for Detector v2.',
    observedFacts: [
      'GitHub Advisory GHSA-mrrh-fwg8-r2c3: attackers retroactively rewrote multiple version tags of tj-actions/changed-files to point to a single malicious commit.',
      'Injected script extracted secrets from Runner Worker process memory and printed them into GitHub Actions logs.',
      'Active window: 2025-03-14 to 2025-03-15.',
      'Over 23,000 repositories impacted; public-log repos faced higher exposure because leaked secrets became publicly readable.'
    ],
    expectedPatternIds: [
      'mutable-ci-tag-drift',
      'ci-secret-exposure-path',
      'unpinned-action-reference',
      'third-party-action-with-secrets'
    ]
  },
  {
    incidentId: 'polyfill-io-supply-chain',
    replayMode: 'catalog-mapping',
    detectorGap: 'OTS Detector v1 does not yet inspect runtime-loaded CDN scripts referenced from HTML. CDN/runtime-trust branches are queued for Detector v2.',
    observedFacts: [
      'Sansec investigation: after domain ownership change, polyfill.io began injecting malicious JavaScript that redirected mobile users.',
      'Payload used fake Google-Analytics-looking domains and conditionally evaded admin/analytics contexts.',
      'Cloudflare independently warned polyfill.io could no longer be trusted and shipped automatic mirror replacement.',
      'Embedded directly into HTML of 100,000+ sites via <script src="..."> tags.'
    ],
    expectedPatternIds: [
      'unknown-remote-endpoint',
      'publisher-identity-drift'
    ]
  }
];

export function getOtsIncidentReplay(incidentId) {
  return OTS_INCIDENT_REPLAYS.find((r) => r.incidentId === incidentId);
}
