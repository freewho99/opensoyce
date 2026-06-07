#!/usr/bin/env node
/**
 * Structural invariants for the OpenSoyce Trust Badge v0 (Phase 4 PR-B2).
 *
 * Doctrine enforced (matches docs/architecture/trust-badge-architecture-sub-sketch.md):
 *   - Two routes: /badge/:owner/:repo/posture.svg + .json. No PNG, no
 *     variants, no query-string customization.
 *   - SVG dimensions locked at 188x20. Two text nodes (OPENSOYCE prefix +
 *     posture text). role=img + aria-label + <title>.
 *   - No <script>, <iframe>, <foreignObject>, <a>, <image>, <use>, or
 *     xlink:href in the SVG output.
 *   - Posture source single-table: renderer pulls from
 *     getRepoTrustPosture only. Unknown repo returns NOT EVALUATED.
 *   - Renderer ignores query strings, request headers, and bodies as
 *     posture inputs.
 *   - JSON sibling: 7 fields, no score / confidence / signature /
 *     visibility / timeline / disclaimers / telemetry.
 *   - Recommended embed block in docs/badge.md uses the canonical URL.
 *   - Both routes share cache headers + ETag.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolvePosture,
  renderBadgeSvg,
  buildBadgeJson,
  postureEtag,
} from '../src/server/badge/renderer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
const pending = [];

function test(name, fn) {
  pending.push(async () => {
    try {
      await fn();
      console.log(`PASS  ${name}`);
      passed += 1;
    } catch (e) {
      console.log(`FAIL  ${name} -- ${e.message}\n${e.stack}`);
      failed += 1;
    }
  });
}
function ok(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

// ---------------------------------------------------------------------------
// Source-level assertions
// ---------------------------------------------------------------------------

test('routes file registers exactly two GET routes', () => {
  const src = read('src/server/badge/routes.js');
  ok(
    src.includes("'/badge/:owner/:repo/posture.svg'") ||
      src.includes('"/badge/:owner/:repo/posture.svg"'),
    'routes.ts must register /badge/:owner/:repo/posture.svg',
  );
  ok(
    src.includes("'/badge/:owner/:repo/posture.json'") ||
      src.includes('"/badge/:owner/:repo/posture.json"'),
    'routes.ts must register /badge/:owner/:repo/posture.json',
  );
  const gets = (src.match(/app\.get\(/g) || []).length;
  eq(gets, 2, 'routes.ts must register exactly 2 GET routes');
  ok(!src.includes('app.post'), 'badge routes must not include POST handlers (read-only)');
  ok(!src.includes('app.put'), 'badge routes must not include PUT handlers');
  ok(!src.includes('app.delete'), 'badge routes must not include DELETE handlers');
});

test('routes file forbids badge variant routes', () => {
  const src = read('src/server/badge/routes.js');
  for (const banned of ['posture.png', 'score.svg', 'health.svg', 'timeline.svg', 'badge.png']) {
    ok(!src.includes(banned), `routes.ts must not register banned variant ${banned}`);
  }
});

test('renderer source pulls posture exclusively from getRepoTrustPosture', () => {
  const src = read('src/server/badge/renderer.js');
  ok(
    src.includes('getRepoTrustPosture'),
    'renderer.ts must use getRepoTrustPosture for posture lookups',
  );
  // No other posture-source mechanism may appear.
  for (const banned of ['fetch(', 'http.request', 'https.request', 'fs.readFile', 'process.env.POSTURE', 'req.query', 'req.body', 'req.headers']) {
    ok(!src.includes(banned), `renderer.ts must not consult ${banned} as a posture source`);
  }
});

test('renderer SVG output forbids script / iframe / foreignObject / a / image / use', () => {
  const banned = ['<script', '<iframe', '<foreignObject', '<a ', '<image', '<use', 'xlink:href'];
  for (const key of ['use-ready', 'watchlist', 'risky', 'graveyard', 'not_evaluated']) {
    const svg = renderBadgeSvg({ postureKey: key, postureText: 'X', source: 'static-mvp' });
    for (const b of banned) {
      ok(!svg.toLowerCase().includes(b.toLowerCase()), `SVG for ${key} must not contain ${b}`);
    }
  }
});

test('renderer SVG declares locked 188x20 geometry + role/aria/title', () => {
  const svg = renderBadgeSvg({ postureKey: 'watchlist', postureText: 'WATCHLIST', source: 'static-mvp' });
  ok(svg.includes('width="188"'), 'SVG width must be 188');
  ok(svg.includes('height="20"'), 'SVG height must be 20');
  ok(svg.includes('role="img"'), 'SVG must declare role=img');
  ok(svg.includes('aria-label='), 'SVG must include aria-label');
  ok(svg.includes('<title>'), 'SVG must include a <title> element');
  ok(svg.includes('OPENSOYCE'), 'SVG must include the mandatory OPENSOYCE brand prefix');
});

test('renderer SVG renders one of the five posture text values verbatim', () => {
  const expected = {
    'use-ready': 'USE READY',
    watchlist: 'WATCHLIST',
    risky: 'RISKY',
    graveyard: 'GRAVEYARD',
    not_evaluated: 'NOT EVALUATED',
  };
  for (const [key, text] of Object.entries(expected)) {
    const svg = renderBadgeSvg({ postureKey: key, postureText: text, source: 'static-mvp' });
    ok(svg.includes(`>${text}<`), `SVG for ${key} must contain text "${text}"`);
  }
});

test('strings module forbids softened NOT EVALUATED copy', () => {
  // The SVG renderer is a pure function of the text it is given. The
  // strings module (which feeds it) is the gate: assert no banned softened
  // form for the empty state appears at the source level.
  const src = read('src/server/badge/strings.js');
  for (const softened of ['NOT EVALUATED YET', 'EVALUATION COMING SOON', 'EVALUATION IN PROGRESS', 'PENDING EVALUATION', 'COMING SOON']) {
    ok(!src.includes(softened), `strings.ts must not contain softened empty-state copy "${softened}"`);
  }
});

test('resolvePosture returns NOT EVALUATED for unknown repos', () => {
  const data = resolvePosture('does-not-exist', 'nope');
  eq(data.postureKey, 'not_evaluated', 'unknown repo posture key');
  eq(data.postureText, 'NOT EVALUATED', 'unknown repo posture text');
  eq(data.source, 'static-mvp', 'unknown repo source');
});

test('resolvePosture returns the canonical MVP posture for freewho99/opensoyce', () => {
  const data = resolvePosture('freewho99', 'opensoyce');
  eq(data.postureKey, 'watchlist', 'MVP focus repo posture key');
  eq(data.postureText, 'WATCHLIST', 'MVP focus repo posture text');
});

test('buildBadgeJson returns the locked 7-field shape', () => {
  const data = resolvePosture('freewho99', 'opensoyce');
  const json = buildBadgeJson('freewho99', 'opensoyce', data);
  const keys = Object.keys(json).sort();
  const expected = ['fetchedAt', 'owner', 'postureLabel', 'postureText', 'proofAnchor', 'repo', 'source'].sort();
  eq(keys.join(','), expected.join(','), 'JSON top-level field set');
  eq(json.proofAnchor.proofType, 'live-surface', 'proofAnchor type');
  ok(json.proofAnchor.href.startsWith('/projects/'), 'proofAnchor href must point at Dashboard');
});

test('buildBadgeJson rejects forbidden fields by construction', () => {
  const data = resolvePosture('freewho99', 'opensoyce');
  const json = buildBadgeJson('freewho99', 'opensoyce', data);
  for (const banned of ['score', 'confidence', 'signature', 'visibility', 'timeline', 'disclaimers', 'sentAt', 'clientId']) {
    ok(!(banned in json), `JSON output must not contain forbidden field ${banned}`);
  }
});

test('buildBadgeJson returns null postureLabel for unknown repos', () => {
  const data = resolvePosture('does-not-exist', 'nope');
  const json = buildBadgeJson('does-not-exist', 'nope', data);
  eq(json.postureLabel, null, 'unknown repo postureLabel must be null');
  eq(json.postureText, 'NOT EVALUATED', 'unknown repo postureText');
});

test('postureEtag is stable per (owner, repo, postureKey)', () => {
  const a = postureEtag('o', 'r', { postureKey: 'risky', postureText: 'RISKY', source: 'static-mvp' });
  const b = postureEtag('o', 'r', { postureKey: 'risky', postureText: 'RISKY', source: 'static-mvp' });
  eq(a, b, 'postureEtag must be stable across calls');
  ok(/^".+"$/.test(a), 'postureEtag must be a quoted string');
  // Etag must NOT include time/random components.
  ok(!a.includes(new Date().getFullYear().toString().slice(0, 3)), 'postureEtag must not include current year');
});

test('routes use Cache-Control and ETag headers and accept If-None-Match', () => {
  const src = read('src/server/badge/routes.js');
  ok(src.includes("'Cache-Control'") || src.includes('"Cache-Control"'), 'routes.ts must set Cache-Control');
  ok(src.includes("'ETag'") || src.includes('"ETag"'), 'routes.ts must set ETag');
  ok(src.includes('if-none-match') || src.includes('If-None-Match'), 'routes.ts must honor If-None-Match');
  ok(src.includes('public, max-age=300'), 'routes.ts must use the canonical Cache-Control value');
});

test('routes return 400 with BAD_OWNER / BAD_REPO for invalid path params', () => {
  const src = read('src/server/badge/routes.js');
  ok(src.includes('BAD_OWNER'), 'routes.ts must reject bad owners with BAD_OWNER');
  ok(src.includes('BAD_REPO'), 'routes.ts must reject bad repos with BAD_REPO');
  ok(src.includes('isValidGithubName'), 'routes.ts must validate via isValidGithubName');
});

test('server.ts registers Trust Badge routes via the badge module', () => {
  const src = read('server.ts');
  ok(
    src.includes('registerTrustBadgeRoutes'),
    'server.ts must import + call registerTrustBadgeRoutes',
  );
  ok(
    src.includes('./src/server/badge/routes'),
    'server.ts must import from src/server/badge/routes',
  );
});

test('docs/badge.md contains the canonical embed block and the trust record URL', () => {
  const src = read('docs/badge.md');
  ok(
    src.includes('/badge/<owner>/<repo>/posture.svg'),
    'docs/badge.md must show the canonical badge URL pattern',
  );
  ok(
    src.includes('/projects/<owner>/<repo>/trust'),
    'docs/badge.md must show the canonical Dashboard link target',
  );
  ok(
    src.includes('https://opensoyce.com/opensource-trust'),
    'docs/badge.md must point at the trust record',
  );
});

test('docs/badge.md is wired into the linking-page hygiene list', () => {
  const t = read('scripts/test-open-source-trust-center.mjs');
  ok(t.includes("'docs/badge.md'"), 'docs/badge.md must be in LINKING_PAGES');
  ok(t.includes("'src/server/badge/strings.js'"), 'src/server/badge/strings.js must be in LINKING_PAGES');
});

test('root package.json wires test:ci and test:trust-badge-v0 script', () => {
  const pkg = JSON.parse(read('package.json'));
  ok(pkg.scripts['test:trust-badge-v0'], 'missing test:trust-badge-v0 script');
  ok(
    pkg.scripts['test:trust-badge-v0'].includes('scripts/test-trust-badge-v0.mjs'),
    'bad test:trust-badge-v0 script wiring',
  );
  ok(
    pkg.scripts['test:ci'].includes('scripts/test-trust-badge-v0.mjs'),
    'test:ci must include the Trust Badge v0 invariants test',
  );
});

(async () => {
  for (const fn of pending) await fn();
  console.log(`\nTrust Badge v0 tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
