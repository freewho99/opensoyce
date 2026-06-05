#!/usr/bin/env node
/**
 * Structural invariants for the static Repo Trust Dashboard MVP.
 *
 * This test keeps the PR #47 scope boring:
 * one repo, one static posture, no live dashboard API, no persistence,
 * honest empty risky-deps posture, and links into existing proof surfaces.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REPO_TRUST_POSTURES,
  REPO_TRUST_POSTURE_LABELS,
  REPO_TRUST_GATE_ACTIONS,
  REPO_TRUST_SEVERITIES,
  REPO_TRUST_WORKFLOW_SOURCES,
  REPO_TRUST_MVP_FOCUS,
  getRepoTrustPosture,
  isMvpFocusRepo,
} from '../src/shared/repoTrustDashboard.js';
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

const posture = REPO_TRUST_POSTURES[0];
const timelinePrs = new Set(TRUST_TIMELINE_EVENTS.map((ev) => ev.pr));

// ---------------------------------------------------------------------------

test('MVP contains exactly one static posture for freewho99/opensoyce', () => {
  eq(REPO_TRUST_POSTURES.length, 1, 'posture count');
  eq(REPO_TRUST_MVP_FOCUS.owner, 'freewho99', 'MVP focus owner');
  eq(REPO_TRUST_MVP_FOCUS.repo, 'opensoyce', 'MVP focus repo');
  eq(posture.owner, REPO_TRUST_MVP_FOCUS.owner, 'posture owner');
  eq(posture.repo, REPO_TRUST_MVP_FOCUS.repo, 'posture repo');
});

test('lookup only returns the supported MVP repo', () => {
  ok(isMvpFocusRepo('freewho99', 'opensoyce'), 'focus repo should be supported');
  ok(getRepoTrustPosture('FREEWHO99', 'OPENSOYCE'), 'lookup should be case-insensitive');
  eq(getRepoTrustPosture('freewho99', 'not-opensoyce'), null, 'unsupported repo');
  eq(isMvpFocusRepo('freewho99', 'not-opensoyce'), false, 'unsupported predicate');
});

test('posture fields use fixed vocabularies and concise copy', () => {
  ok(REPO_TRUST_POSTURE_LABELS.includes(posture.postureLabel), `bad posture label ${posture.postureLabel}`);
  ok(typeof posture.postureSummary === 'string' && posture.postureSummary.length > 0, 'missing postureSummary');
  ok(posture.postureSummary.length < 280, `postureSummary too long: ${posture.postureSummary.length}`);
  ok(REPO_TRUST_WORKFLOW_SOURCES.includes(posture.workflowFindingsSource), `bad workflow source ${posture.workflowFindingsSource}`);
  ok(/^\d{4}-\d{2}-\d{2}$/.test(posture.lastEvaluated), `bad lastEvaluated ${posture.lastEvaluated}`);
});

test('gate section links out to the canonical /proof/gate package query', () => {
  eq(posture.gateExamples.length, 1, 'gate example count');
  const ex = posture.gateExamples[0];
  eq(ex.packageQuery, 'ua-parser-js@0.7.29', 'canonical gate package query');
  ok(REPO_TRUST_GATE_ACTIONS.includes(ex.expectedAction), `bad gate action ${ex.expectedAction}`);
  eq(ex.expectedAction, 'BLOCK', 'canonical expected action');
  eq(ex.expectedPatternCount, 4, 'canonical expected pattern count');
  ok(ex.rationale.includes('Not actually in this repo'), 'gate example must not pretend the package is in this repo');

  const page = read('src/pages/RepoTrustDashboard.tsx');
  ok(page.includes('/proof/gate?package='), 'dashboard must link out to /proof/gate with a package query');
  ok(!page.includes('fetch('), 'dashboard must not proxy or call the gate API');
});

test('risky deps section is honestly empty for the static MVP posture', () => {
  ok(Array.isArray(posture.riskyDeps), 'riskyDeps must be an array');
  eq(posture.riskyDeps.length, 0, 'risky deps count');
  const page = read('src/pages/RepoTrustDashboard.tsx');
  ok(page.includes("No risky deps in this repo's static MVP posture."), 'empty risky deps copy must stay explicit');
});

test('workflow findings stay static and use allowed severity vocabulary', () => {
  eq(posture.workflowFindingsSource, 'static-snapshot', 'workflow source');
  eq(posture.workflowFindings.length, 1, 'workflow finding count');
  for (const finding of posture.workflowFindings) {
    ok(REPO_TRUST_SEVERITIES.includes(finding.severity), `bad severity ${finding.severity}`);
    ok(['block', 'warn'].includes(finding.policyImpact), `bad policyImpact ${finding.policyImpact}`);
    ok(typeof finding.patternId === 'string' && finding.patternId.length > 0, 'missing patternId');
    ok(typeof finding.origin === 'string' && finding.origin.length > 0, 'missing origin');
  }
});

test('timeline preview reuses shipped timeline events', () => {
  ok(posture.timelinePreviewFilter.byPackage?.includes('ua-parser-js'), 'timeline preview must filter by shipped focus package');
  const matches = TRUST_TIMELINE_EVENTS.filter((ev) => ev.package === 'ua-parser-js');
  ok(matches.length > 0, 'timeline filter must match existing events');
  const page = read('src/pages/RepoTrustDashboard.tsx');
  ok(page.includes('TRUST_TIMELINE_EVENTS'), 'dashboard page must import shipped timeline events');
  ok(!page.includes('const timelineEvents'), 'dashboard must not duplicate a new history model');
});

test('exception placeholder proves no persistence leaked into MVP', () => {
  eq(posture.exceptionsPlaceholder.count, 0, 'exception placeholder count');
  ok(posture.exceptionsPlaceholder.message.includes('separate ADR'), 'exception placeholder should name deferred ADR');
});

test('references are non-empty and cited PRs exist in Trust Timeline', () => {
  ok(posture.references.length > 0, 'references should be non-empty');
  for (const ref of posture.references) {
    ok(typeof ref.label === 'string' && ref.label.length > 0, 'bad reference label');
    ok(typeof ref.href === 'string' && ref.href.length > 0, 'bad reference href');
    const match = ref.label.match(/PR #(\d+)/);
    if (match) {
      ok(timelinePrs.has(Number(match[1])), `reference ${ref.label} is not present in Trust Timeline`);
    }
  }
});

test('route, project inbound link, and gate cross-link are wired', () => {
  const app = read('src/App.tsx');
  const project = read('src/pages/ProjectDetail.tsx');
  const gate = read('src/pages/Gate.tsx');
  ok(app.includes('path="/projects/:owner/:repo/trust"'), 'trust route missing');
  ok(project.includes('View Trust Dashboard'), 'ProjectDetail inbound link missing');
  ok(gate.includes('/projects/freewho99/opensoyce/trust'), 'Gate cross-link missing');
});

test('dashboard outbound cross-link to Open Source Trust Center is wired', () => {
  const dashboard = read('src/pages/RepoTrustDashboard.tsx');
  ok(dashboard.includes('/opensource-trust'), 'Dashboard cross-link to Open Source Trust Center missing');
});

test('package test:ci wires the structural invariant test', () => {
  const pkg = JSON.parse(read('package.json'));
  ok(pkg.scripts['test:repo-trust-dashboard'], 'missing test:repo-trust-dashboard script');
  ok(pkg.scripts['test:repo-trust-dashboard'].includes('scripts/test-repo-trust-dashboard.mjs'), 'bad repo trust dashboard script');
  ok(pkg.scripts['test:ci'].includes('scripts/test-repo-trust-dashboard.mjs'), 'test:ci must include repo trust dashboard test');
});

test('scope guardrails stay out of the dashboard files', () => {
  const files = [
    'src/shared/repoTrustDashboard.js',
    'src/data/repoTrustDashboard.ts',
    'src/pages/RepoTrustDashboard.tsx',
  ];
  const combined = files.map(read).join('\n');
  // Note: 'Trust Center' was on this banned list until PR #49 shipped the
  // public Open Source Trust Center. Per the sketch doctrine (§4 of
  // open-source-trust-center-sketch.md), the banned-substring list updates
  // in the same PR that ships the underlying capability, never separately.
  // The dashboard's cross-link panel may reference /opensource-trust now;
  // Vanta / Drata / Trust Agent remain unauthorized scope.
  for (const banned of ['threat_feed', 'Vanta', 'Drata', 'Trust Agent']) {
    ok(!combined.includes(banned), `forbidden scope leaked into dashboard files: ${banned}`);
  }
});

// ---------------------------------------------------------------------------

(async () => {
  for (const fn of pending) await fn();
  console.log(`\nRepo Trust Dashboard tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
