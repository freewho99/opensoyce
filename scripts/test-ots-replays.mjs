#!/usr/bin/env node
/**
 * OTS Incident Replays — structural invariant tests.
 *
 * Enforces the ship rule from the proof-layer design:
 *   - every replay points at an existing OTS_INCIDENTS entry
 *   - every replay's incident has sourceConfidence in
 *     ('primary' | 'authoritative-secondary') — 'unverified' entries are
 *     excluded from the proof surface
 *   - every live-detector replay's expectedPatternIds equals the set
 *     `detectOtsPatternsForRow(fixtureRow, fixtureContext)` actually emits
 *     (set equality — order-independent, no extras, no misses)
 *   - every catalog-mapping replay's expectedPatternIds all exist in the
 *     catalog (so /patterns/:id deep-links resolve)
 *   - every expected pattern is reachable from /patterns via a pack
 */

import {
  detectOtsPatternsForRow,
  OTS_INCIDENTS,
  OTS_PATTERN_DEFINITIONS,
  OTS_PATTERN_PACKS,
} from '../src/shared/otsPatterns.js';
import { OTS_INCIDENT_REPLAYS } from '../src/shared/otsIncidentReplays.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
    passed += 1;
  } catch (err) {
    console.log(`FAIL ${name} -- ${err.message}`);
    failed += 1;
  }
}

function ok(value, msg) {
  if (!value) throw new Error(msg);
}

function eqSet(actual, expected, msg) {
  const a = new Set(actual);
  const b = new Set(expected);
  if (a.size !== b.size) {
    throw new Error(`${msg}: set size mismatch — expected ${[...b].sort()}, got ${[...a].sort()}`);
  }
  for (const v of b) {
    if (!a.has(v)) {
      throw new Error(`${msg}: missing expected item "${v}" (got ${[...a].sort()})`);
    }
  }
}

const incidentById = new Map(OTS_INCIDENTS.map((i) => [i.id, i]));
const definedIds = new Set(OTS_PATTERN_DEFINITIONS.map((d) => d.id));
const packedIds = new Set();
for (const pack of OTS_PATTERN_PACKS) for (const id of pack.patternIds) packedIds.add(id);

test('every replay points to a known OTS_INCIDENTS entry', () => {
  for (const r of OTS_INCIDENT_REPLAYS) {
    ok(incidentById.has(r.incidentId), `replay references unknown incident "${r.incidentId}"`);
  }
});

test('every replay\'s incident has sourceConfidence primary or authoritative-secondary', () => {
  const allowed = new Set(['primary', 'authoritative-secondary']);
  for (const r of OTS_INCIDENT_REPLAYS) {
    const inc = incidentById.get(r.incidentId);
    ok(
      allowed.has(inc.sourceConfidence),
      `incident "${r.incidentId}" has sourceConfidence "${inc.sourceConfidence}" — only ${[...allowed].join(' or ')} allowed on the proof page`,
    );
    ok(typeof inc.sourceUrl === 'string' && inc.sourceUrl.startsWith('http'), `incident "${r.incidentId}" missing sourceUrl`);
  }
});

test('every live-detector replay: detector output equals expectedPatternIds', () => {
  for (const r of OTS_INCIDENT_REPLAYS) {
    if (r.replayMode !== 'live-detector') continue;
    ok(r.fixtureRow, `live-detector replay "${r.incidentId}" missing fixtureRow`);
    const detected = detectOtsPatternsForRow(r.fixtureRow, r.fixtureContext || {});
    const detectedIds = detected.map((p) => p.patternId);
    eqSet(detectedIds, r.expectedPatternIds, `replay "${r.incidentId}" detector output`);
  }
});

test('every catalog-mapping replay: expected patterns all exist in catalog', () => {
  for (const r of OTS_INCIDENT_REPLAYS) {
    if (r.replayMode !== 'catalog-mapping') continue;
    ok(
      typeof r.detectorGap === 'string' && r.detectorGap.length > 20,
      `catalog-mapping replay "${r.incidentId}" must declare detectorGap (why detector v1 doesn\'t cover it)`,
    );
    for (const id of r.expectedPatternIds) {
      ok(definedIds.has(id), `catalog-mapping replay "${r.incidentId}" claims undefined pattern "${id}"`);
    }
  }
});

test('every expected pattern (across all replays) is reachable via a pack', () => {
  const allExpected = new Set();
  for (const r of OTS_INCIDENT_REPLAYS) for (const id of r.expectedPatternIds) allExpected.add(id);
  for (const id of allExpected) {
    ok(packedIds.has(id), `expected pattern "${id}" exists in catalog but is not in any pack — /patterns filter UI cannot reach it`);
  }
});

test('every replay mode is recognized', () => {
  const allowed = new Set(['live-detector', 'catalog-mapping']);
  for (const r of OTS_INCIDENT_REPLAYS) {
    ok(allowed.has(r.replayMode), `replay "${r.incidentId}" has unknown replayMode "${r.replayMode}"`);
  }
});

test('replay coverage: at least 4 live-detector + 2 catalog-mapping in v0', () => {
  const live = OTS_INCIDENT_REPLAYS.filter((r) => r.replayMode === 'live-detector');
  const map = OTS_INCIDENT_REPLAYS.filter((r) => r.replayMode === 'catalog-mapping');
  ok(live.length >= 4, `v0 needs at least 4 live-detector replays, found ${live.length}`);
  ok(map.length >= 2, `v0 needs at least 2 catalog-mapping replays, found ${map.length}`);
});

if (failed > 0) {
  console.log(`\nOTS incident replay tests: ${passed} passed, ${failed} failed`);
  process.exit(1);
}

console.log(`\nOTS incident replay tests passed: ${passed}`);
