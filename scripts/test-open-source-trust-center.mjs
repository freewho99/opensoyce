#!/usr/bin/env node
/**
 * Structural invariants for the static Open Source Trust Center MVP.
 *
 * Doctrine enforced (matches §9 of the merged sketch in
 * docs/architecture/open-source-trust-center-sketch.md):
 *   - exactly one subject (the only subject the MVP supports)
 *   - that subject is freewho99/opensoyce
 *   - every claim's sectionId is one of the seven §5 section types
 *   - every section has at least one claim
 *   - every claim has a non-empty headline under 80 chars
 *   - every claim has a non-empty body under 280 chars
 *   - every claim has an audience from the five-audience vocabulary
 *   - every claim has a non-empty proofAnchors array
 *   - every proofAnchor has a known proofType + non-empty label + non-empty href
 *   - every proofAnchor with proofType === 'pr' has a positive integer pr +
 *     a 7- or 40-char hex sha
 *   - no claim contains a banned marketing substring
 *   - no claim contains a future-tense marketing tell
 *   - no claim has a `visibility` field (would telegraph private scope creep)
 *   - every PR cited by a proofAnchor either exists in TRUST_TIMELINE_EVENTS
 *     or is documented exceptionally inline
 *   - shared/data/page files do not contain unauthorized scope leakage
 *     (SOC 2 / Vanta / Drata / threat_feed / Trust Vault / Trust Agent)
 *   - /opensource-trust route is registered in src/App.tsx
 *   - cross-links from /proof/gate, /proof/timeline, and the Dashboard
 *     each point at /opensource-trust
 *   - package.json wires the test into test:ci
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OPEN_SOURCE_TRUST_CENTER_SUBJECTS,
  OPEN_SOURCE_TRUST_CENTER_SECTION_IDS,
  OPEN_SOURCE_TRUST_CENTER_AUDIENCES,
  OPEN_SOURCE_TRUST_CENTER_PROOF_TYPES,
  OPEN_SOURCE_TRUST_CENTER_POSTURE_LABELS,
  OPEN_SOURCE_TRUST_CENTER_BANNED_SUBSTRINGS,
  OPEN_SOURCE_TRUST_CENTER_FUTURE_TENSE_TELLS,
  OPEN_SOURCE_TRUST_CENTER_PHASE_3_LAUNCH_BANNED_SUBSTRINGS,
  OPEN_SOURCE_TRUST_CENTER_PHASE_4_DISTRIBUTION_BANNED_SUBSTRINGS,
  OPEN_SOURCE_TRUST_CENTER_PHASE_4_WORD_BOUNDARY_BANNED,
  OPEN_SOURCE_TRUST_CENTER_MVP_SUBJECT,
  getOpenSourceTrustCenterSubject,
  groupClaimsBySection,
} from '../src/shared/openSourceTrustCenter.js';
import {
  TRUST_TIMELINE_EVENTS,
} from '../src/shared/trustTimeline.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
const pending = [];

function test(name, fn) {
  pending.push(() => {
    try {
      fn();
      console.log(`PASS  ${name}`);
      passed += 1;
    } catch (e) {
      console.log(`FAIL  ${name} -- ${e.message}\n${e.stack}`);
      failed += 1;
    }
  });
}

function ok(c, msg) {
  if (!c) throw new Error(msg || 'assertion failed');
}
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

// PRs that the MVP cites but that legitimately do not appear inside
// TRUST_TIMELINE_EVENTS as event entries. PR #45 added the Timeline data
// itself; PR #47 added the Dashboard MVP. Both are merged on main; both
// are public PR + SHA evidence; neither is a Timeline event row.
const PR_REFERENCE_EXCEPTIONS = new Set([45, 47]);

const subject = OPEN_SOURCE_TRUST_CENTER_SUBJECTS[0];
const timelinePrs = new Set(TRUST_TIMELINE_EVENTS.map((ev) => ev.pr));

// ---------------------------------------------------------------------------

test('MVP contains exactly one Trust Center subject', () => {
  eq(OPEN_SOURCE_TRUST_CENTER_SUBJECTS.length, 1, 'subject count');
  eq(OPEN_SOURCE_TRUST_CENTER_MVP_SUBJECT.owner, 'freewho99', 'MVP subject owner');
  eq(OPEN_SOURCE_TRUST_CENTER_MVP_SUBJECT.repo, 'opensoyce', 'MVP subject repo');
  eq(subject.owner, OPEN_SOURCE_TRUST_CENTER_MVP_SUBJECT.owner, 'subject owner');
  eq(subject.repo, OPEN_SOURCE_TRUST_CENTER_MVP_SUBJECT.repo, 'subject repo');
});

test('subject lookup is case-insensitive and gates unknown subjects', () => {
  ok(getOpenSourceTrustCenterSubject('FREEWHO99', 'OPENSOYCE'), 'lookup should be case-insensitive');
  eq(getOpenSourceTrustCenterSubject('freewho99', 'not-opensoyce'), null, 'unknown subject');
  eq(getOpenSourceTrustCenterSubject('', ''), null, 'empty inputs');
});

test('subject uses the fixed posture vocabulary and concise summary', () => {
  ok(OPEN_SOURCE_TRUST_CENTER_POSTURE_LABELS.includes(subject.postureLabel), `bad posture ${subject.postureLabel}`);
  ok(typeof subject.postureSummary === 'string' && subject.postureSummary.length > 0, 'missing postureSummary');
  ok(subject.postureSummary.length < 280, `postureSummary too long: ${subject.postureSummary.length}`);
  ok(/^\d{4}-\d{2}-\d{2}$/.test(subject.lastEvaluated), `bad lastEvaluated ${subject.lastEvaluated}`);
  ok(typeof subject.primaryCta.label === 'string' && subject.primaryCta.label.length > 0, 'missing CTA label');
  ok(subject.primaryCta.href.startsWith('/proof/gate'), 'primary CTA must point at the live gate');
});

test('every section ID is from the §5 vocabulary', () => {
  for (const claim of subject.claims) {
    ok(OPEN_SOURCE_TRUST_CENTER_SECTION_IDS.includes(claim.sectionId), `bad sectionId ${claim.sectionId} on claim ${claim.id}`);
  }
});

test('every section has at least one claim', () => {
  const grouped = groupClaimsBySection(subject);
  eq(grouped.length, OPEN_SOURCE_TRUST_CENTER_SECTION_IDS.length, 'section group count');
  for (const { sectionId, claims } of grouped) {
    ok(claims.length > 0, `section ${sectionId} has no claims`);
  }
});

test('every claim has a non-empty headline under 80 chars', () => {
  for (const claim of subject.claims) {
    ok(typeof claim.headline === 'string' && claim.headline.length > 0, `claim ${claim.id}: missing headline`);
    ok(claim.headline.length < 80, `claim ${claim.id}: headline too long (${claim.headline.length})`);
  }
});

test('every claim has a non-empty body under 280 chars', () => {
  for (const claim of subject.claims) {
    ok(typeof claim.body === 'string' && claim.body.length > 0, `claim ${claim.id}: missing body`);
    ok(claim.body.length < 280, `claim ${claim.id}: body too long (${claim.body.length})`);
  }
});

test('every claim audience is in the five-audience vocabulary', () => {
  for (const claim of subject.claims) {
    ok(OPEN_SOURCE_TRUST_CENTER_AUDIENCES.includes(claim.audience), `claim ${claim.id}: bad audience ${claim.audience}`);
  }
});

test('every claim has a non-empty proofAnchors array with valid types', () => {
  for (const claim of subject.claims) {
    ok(Array.isArray(claim.proofAnchors) && claim.proofAnchors.length > 0, `claim ${claim.id}: empty proofAnchors`);
    for (const anchor of claim.proofAnchors) {
      ok(OPEN_SOURCE_TRUST_CENTER_PROOF_TYPES.includes(anchor.proofType), `claim ${claim.id}: bad proofType ${anchor.proofType}`);
      ok(typeof anchor.label === 'string' && anchor.label.length > 0, `claim ${claim.id}: empty label`);
      ok(typeof anchor.href === 'string' && anchor.href.length > 0, `claim ${claim.id}: empty href`);
    }
  }
});

test('every PR proofAnchor carries pr + 7-or-40-char hex sha', () => {
  for (const claim of subject.claims) {
    for (const anchor of claim.proofAnchors) {
      if (anchor.proofType !== 'pr') continue;
      ok(typeof anchor.pr === 'number' && Number.isInteger(anchor.pr) && anchor.pr > 0, `claim ${claim.id}: bad pr`);
      ok(typeof anchor.sha === 'string' && /^([0-9a-f]{7}|[0-9a-f]{40})$/.test(anchor.sha), `claim ${claim.id}: bad sha ${anchor.sha}`);
    }
  }
});

test('no claim contains a banned marketing substring', () => {
  for (const claim of subject.claims) {
    const text = `${claim.headline} ${claim.body}`.toLowerCase();
    for (const banned of OPEN_SOURCE_TRUST_CENTER_BANNED_SUBSTRINGS) {
      ok(!text.includes(banned.toLowerCase()), `claim ${claim.id}: contains banned substring "${banned}"`);
    }
  }
});

test('no claim contains a future-tense marketing tell', () => {
  for (const claim of subject.claims) {
    const text = `${claim.headline} ${claim.body}`.toLowerCase();
    for (const tell of OPEN_SOURCE_TRUST_CENTER_FUTURE_TENSE_TELLS) {
      ok(!text.includes(tell.toLowerCase()), `claim ${claim.id}: contains future-tense tell "${tell}"`);
    }
  }
});

test('no claim record carries a visibility field (private-scope creep guard)', () => {
  for (const claim of subject.claims) {
    ok(!Object.prototype.hasOwnProperty.call(claim, 'visibility'), `claim ${claim.id}: unexpected visibility field`);
  }
});

test('every PR proofAnchor cites a Timeline event or a documented exception', () => {
  for (const claim of subject.claims) {
    for (const anchor of claim.proofAnchors) {
      if (anchor.proofType !== 'pr') continue;
      const known = timelinePrs.has(anchor.pr) || PR_REFERENCE_EXCEPTIONS.has(anchor.pr);
      ok(known, `claim ${claim.id}: PR #${anchor.pr} is neither in Trust Timeline nor in PR_REFERENCE_EXCEPTIONS`);
    }
  }
});

test('every deployed-surface anchor resolves to a known proof surface family', () => {
  const allowedSurfacePrefixes = ['/proof/gate', '/proof/timeline', '/projects/', '/patterns', '/opensource-trust'];
  for (const claim of subject.claims) {
    for (const anchor of claim.proofAnchors) {
      if (anchor.proofType !== 'live-surface') continue;
      ok(
        allowedSurfacePrefixes.some((p) => anchor.href.startsWith(p)),
        `claim ${claim.id}: anchor ${anchor.href} not in allowed surface families`,
      );
    }
  }
});

test('shared/data/page files do not leak unauthorized scope', () => {
  const sharedPath = 'src/shared/openSourceTrustCenter.js';
  const dataPath = 'src/data/openSourceTrustCenter.ts';
  const pagePath = 'src/pages/OpenSourceTrustCenter.tsx';
  const sharedSrc = read(sharedPath);
  const dataSrc = read(dataPath);
  const pageSrc = read(pagePath);
  const combined = `${sharedSrc}\n${dataSrc}\n${pageSrc}`;

  // The page surface itself must never carry these — page copy reaches users.
  for (const banned of ['Trust Vault', 'Trust Agent', 'threat_feed']) {
    ok(!pageSrc.includes(banned), `forbidden scope leaked into page surface: ${banned}`);
  }

  // The shared / data modules may name future-ADR scope ONLY in module
  // doctrine comments (so the rule itself can be encoded honestly).
  // Reject any occurrence outside an "ADR" / "doctrine" / "banned" context window.
  for (const banned of ['Trust Vault', 'Trust Agent', 'threat_feed']) {
    const lower = combined.toLowerCase();
    let from = 0;
    while (true) {
      const idx = lower.indexOf(banned.toLowerCase(), from);
      if (idx === -1) break;
      const win = combined.slice(Math.max(0, idx - 200), Math.min(combined.length, idx + 200));
      const allowed = ['ADR', 'adr', 'doctrine', 'banned', 'future-tense', 'unauthorized'];
      ok(
        allowed.some((c) => win.includes(c)),
        `"${banned}" appears outside a doctrine / ADR / banned-vocabulary comment in shared/data/page files`,
      );
      from = idx + banned.length;
    }
  }

  // Anti-marketing banned substrings: same windowing rule.
  for (const banned of OPEN_SOURCE_TRUST_CENTER_BANNED_SUBSTRINGS) {
    const lower = combined.toLowerCase();
    let from = 0;
    while (true) {
      const idx = lower.indexOf(banned.toLowerCase(), from);
      if (idx === -1) break;
      const win = combined.slice(Math.max(0, idx - 200), Math.min(combined.length, idx + 200));
      const allowed = ['OPEN_SOURCE_TRUST_CENTER_BANNED_SUBSTRINGS', 'banned', 'doctrine', 'ADR'];
      ok(
        allowed.some((c) => win.includes(c)),
        `"${banned}" appears outside the banned-vocabulary or doctrine context in shared/data/page files`,
      );
      from = idx + banned.length;
    }
  }
});

test('route, page registration, and cross-link wiring are present', () => {
  const app = read('src/App.tsx');
  const gate = read('src/pages/Gate.tsx');
  const timeline = read('src/pages/TrustTimeline.tsx');
  const dashboard = read('src/pages/RepoTrustDashboard.tsx');
  const page = read('src/pages/OpenSourceTrustCenter.tsx');

  ok(app.includes('path="/opensource-trust"'), '/opensource-trust route missing');
  ok(app.includes('OpenSourceTrustCenter'), 'OpenSourceTrustCenter import missing in App.tsx');
  ok(gate.includes('/opensource-trust'), 'Gate cross-link to /opensource-trust missing');
  ok(timeline.includes('/opensource-trust'), 'Timeline cross-link to /opensource-trust missing');
  ok(dashboard.includes('/opensource-trust'), 'Dashboard cross-link to /opensource-trust missing');

  // The page is read-only by doctrine: no fetch / no API calls.
  ok(!page.includes('fetch('), 'Trust Center page must not call any API');
});

// ---------------------------------------------------------------------------
// Linking-page copy hygiene
//
// Per docs/architecture/public-trust-spine-discoverability-adr.md §7, every
// page that links to /opensource-trust inherits the Trust Center's
// anti-marketing banned-substring + future-tense vocabulary. The test
// enforces that hygiene on the paragraph surrounding each link, so the
// linking layer cannot make claims the Trust Center itself refuses.
//
// Linking pages enforced today:
//   - src/pages/Proof.tsx (A3 resolution: one CTA card)
//
// The global Layout footer (src/components/Layout.tsx) does NOT carry a
// /opensource-trust link in this phase — its existing footer columns
// (Tools / Discover / Company) do not include a proof / trust cluster, so
// the conditional footer link from ADR §3.8 / §4 is deferred. If a future
// PR adds a proof/trust cluster + a /opensource-trust footer link, this
// suite should be extended to enforce the same hygiene on Layout.tsx.
// ---------------------------------------------------------------------------

// LINKING_PAGES.mode controls how copy hygiene is scoped per linking page:
//   - 'window': use a ±400 char window around each /opensource-trust
//     occurrence (correct for page-level surfaces where authored copy
//     surrounds the link).
//   - 'line':   extract just the line containing /opensource-trust
//     (correct for config-array files like Layout.tsx, where adjacent
//     NavItem entries are unrelated authored copy that ADR §3.4 names
//     as legacy debt deferred to a separate PR — especially the SOC 2
//     nav slot which the Phase 3 launch-narrative ADR explicitly
//     leaves untouched).
//
// When the legacy-copy decision PR lands (per launch-narrative ADR §7.2),
// 'line' mode on Layout.tsx should be revisited: either widen back to
// 'window' (after legacy SOC 2 nav/testimonial copy is rewritten) or
// keep 'line' if quarantine is the chosen resolution. Either change is
// part of that PR, not this one.
const LINKING_PAGES = [
  { path: 'src/pages/Proof.tsx', label: 'Proof', mode: 'window' },
  { path: 'src/pages/Home.tsx', label: 'Home', mode: 'window' },
  { path: 'src/components/Layout.tsx', label: 'Layout', mode: 'line' },
  // Phase 4 (PR-A2): CLI strings, help text, and README inherit the
  // launch-copy doctrine. Window mode because CLI source files are
  // narrowly authored — no adjacent legacy debt to scope around.
  { path: 'packages/cli/src/strings.ts', label: 'CLI strings', mode: 'window' },
  { path: 'packages/cli/src/help.ts', label: 'CLI help', mode: 'window' },
  { path: 'packages/cli/README.md', label: 'CLI README', mode: 'window' },
  // Phase 4 (PR-B2): Trust Badge surfaces. Strings module + README embed
  // documentation. Window mode — both files are narrowly authored.
  { path: 'src/server/badge/strings.js', label: 'Badge strings', mode: 'window' },
  { path: 'docs/badge.md', label: 'Badge docs', mode: 'window' },
];

const SOFT_BANNED_VERBS = ['Learn more', 'Discover', 'Explore', 'Unlock'];

function copyWindowsAround(source, marker, radius) {
  const windows = [];
  let from = 0;
  while (true) {
    const idx = source.indexOf(marker, from);
    if (idx === -1) break;
    const start = Math.max(0, idx - radius);
    const end = Math.min(source.length, idx + marker.length + radius);
    windows.push({ idx, snippet: source.slice(start, end) });
    from = idx + marker.length;
  }
  return windows;
}

function lineWindowsAround(source, marker) {
  const windows = [];
  let from = 0;
  while (true) {
    const idx = source.indexOf(marker, from);
    if (idx === -1) break;
    const lineStart = source.lastIndexOf('\n', idx) + 1;
    const lineEndRaw = source.indexOf('\n', idx);
    const lineEnd = lineEndRaw === -1 ? source.length : lineEndRaw;
    windows.push({ idx, snippet: source.slice(lineStart, lineEnd) });
    from = idx + marker.length;
  }
  return windows;
}

function hygieneWindowsFor(linkingPage, source) {
  if (linkingPage.mode === 'line') return lineWindowsAround(source, '/opensource-trust');
  return copyWindowsAround(source, '/opensource-trust', 400);
}

test('every linking page contains a link to /opensource-trust', () => {
  for (const { path: rel, label } of LINKING_PAGES) {
    const src = read(rel);
    ok(src.includes('/opensource-trust'), `${label} page (${rel}) missing /opensource-trust link`);
  }
});

test('linking-page copy near each link is free of banned marketing substrings', () => {
  for (const { path: rel, label } of LINKING_PAGES) {
    const src = read(rel);
    const windows = hygieneWindowsFor(LINKING_PAGES.find(p => p.path === rel), src);
    ok(windows.length > 0, `${label} page (${rel}) has no /opensource-trust occurrences`);
    for (const { idx, snippet } of windows) {
      const lower = snippet.toLowerCase();
      for (const banned of OPEN_SOURCE_TRUST_CENTER_BANNED_SUBSTRINGS) {
        ok(
          !lower.includes(banned.toLowerCase()),
          `${label} page (${rel}) link copy near offset ${idx} contains banned substring "${banned}"`,
        );
      }
    }
  }
});

test('linking-page copy near each link is free of future-tense marketing tells', () => {
  for (const { path: rel, label } of LINKING_PAGES) {
    const src = read(rel);
    const windows = hygieneWindowsFor(LINKING_PAGES.find(p => p.path === rel), src);
    for (const { idx, snippet } of windows) {
      const lower = snippet.toLowerCase();
      for (const tell of OPEN_SOURCE_TRUST_CENTER_FUTURE_TENSE_TELLS) {
        ok(
          !lower.includes(tell.toLowerCase()),
          `${label} page (${rel}) link copy near offset ${idx} contains future-tense tell "${tell}"`,
        );
      }
    }
  }
});

test('linking-page copy near each link avoids soft-banned marketing verbs', () => {
  // Word-boundary match so "Discover" (verb) is caught but "discoverability"
  // (path segment in the ADR reference URL) is not. Same for "Explore" vs.
  // "explorer", etc.
  for (const { path: rel, label } of LINKING_PAGES) {
    const src = read(rel);
    const windows = hygieneWindowsFor(LINKING_PAGES.find(p => p.path === rel), src);
    for (const { idx, snippet } of windows) {
      for (const verb of SOFT_BANNED_VERBS) {
        const re = new RegExp(`\\b${verb.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        ok(
          !re.test(snippet),
          `${label} page (${rel}) link copy near offset ${idx} contains soft-banned verb "${verb}" (implies marketing reveal)`,
        );
      }
    }
  }
});

test('linking-page copy near each link is free of Phase-4 distribution banned substrings', () => {
  // Per Phase 4 ADR §5.4 and CLI v0 sub-sketch §5.2. Plain-substring bans:
  // "certified" and "verified" must not appear near any /opensource-trust
  // reference. They come off the list only when an underlying capability
  // shipping justifies the claim.
  for (const linkingPage of LINKING_PAGES) {
    const src = read(linkingPage.path);
    const windows = hygieneWindowsFor(linkingPage, src);
    for (const { idx, snippet } of windows) {
      const lower = snippet.toLowerCase();
      for (const banned of OPEN_SOURCE_TRUST_CENTER_PHASE_4_DISTRIBUTION_BANNED_SUBSTRINGS) {
        ok(
          !lower.includes(banned.toLowerCase()),
          `${linkingPage.label} (${linkingPage.path}) link copy near offset ${idx} contains Phase-4 banned substring "${banned}"`,
        );
      }
    }
  }
});

test('linking-page copy near each link avoids Phase-4 word-boundary bans', () => {
  // Word-boundary bans: "secure" and "safe" are banned as standalone
  // adjectives near /opensource-trust references but legitimate inside
  // composite words (e.g. "secured", "safety"). Same word-boundary
  // semantics as the soft-banned-verb check.
  for (const linkingPage of LINKING_PAGES) {
    const src = read(linkingPage.path);
    const windows = hygieneWindowsFor(linkingPage, src);
    for (const { idx, snippet } of windows) {
      for (const word of OPEN_SOURCE_TRUST_CENTER_PHASE_4_WORD_BOUNDARY_BANNED) {
        const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        ok(
          !re.test(snippet),
          `${linkingPage.label} (${linkingPage.path}) link copy near offset ${idx} contains Phase-4 word-boundary banned word "${word}" (standalone-adjective claim)`,
        );
      }
    }
  }
});

test('linking-page copy near each link is free of Phase-3 launch banned substrings', () => {
  // Per docs/architecture/launch-narrative-positioning-adr.md §6.2.
  // Bans "zero noise", "drop-in", "auto-fix", "autonomous agent", etc. near
  // every /opensource-trust occurrence. These come off the list in the same
  // PR that ships the underlying capability (Phase 6 / 7 / 9), never
  // separately.
  for (const { path: rel, label } of LINKING_PAGES) {
    const src = read(rel);
    const windows = hygieneWindowsFor(LINKING_PAGES.find(p => p.path === rel), src);
    for (const { idx, snippet } of windows) {
      const lower = snippet.toLowerCase();
      for (const banned of OPEN_SOURCE_TRUST_CENTER_PHASE_3_LAUNCH_BANNED_SUBSTRINGS) {
        ok(
          !lower.includes(banned.toLowerCase()),
          `${label} page (${rel}) link copy near offset ${idx} contains Phase-3 banned substring "${banned}"`,
        );
      }
    }
  }
});

test('global Layout footer carries no /opensource-trust link in this phase', () => {
  // Deferred per discoverability ADR §3.8 / §4 — the global footer's Tools /
  // Discover / Company columns still do not group proof / trust together, so
  // the conditional footer link from that ADR remains deferred. The Phase 3
  // launch-narrative ADR §4 resolved D4 for the sidebar nav (TRUST group),
  // but did NOT lift the footer deferral. Scoped to the actual <footer>
  // element so the new nav-group entry is allowed.
  const layout = read('src/components/Layout.tsx');
  const footerStart = layout.indexOf('<footer');
  const footerEnd = layout.indexOf('</footer>', footerStart);
  ok(footerStart !== -1 && footerEnd !== -1, 'Layout.tsx must contain a <footer> element to scope this check');
  const footerSrc = layout.slice(footerStart, footerEnd);
  ok(
    !footerSrc.includes('/opensource-trust'),
    'Layout.tsx <footer> contains a /opensource-trust link outside the discoverability ADR — deferred until a proof/trust footer cluster lands',
  );
});

test('package.json wires test:ci and the dedicated script', () => {
  const pkg = JSON.parse(read('package.json'));
  ok(pkg.scripts['test:open-source-trust-center'], 'missing test:open-source-trust-center script');
  ok(
    pkg.scripts['test:open-source-trust-center'].includes('scripts/test-open-source-trust-center.mjs'),
    'bad open-source-trust-center script wiring',
  );
  ok(
    pkg.scripts['test:ci'].includes('scripts/test-open-source-trust-center.mjs'),
    'test:ci must include the Trust Center invariants test',
  );
});

// ---------------------------------------------------------------------------

(async () => {
  for (const fn of pending) await fn();
  console.log(`\nOpen Source Trust Center tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
