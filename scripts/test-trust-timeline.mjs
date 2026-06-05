#!/usr/bin/env node
/**
 * Structural invariants for src/shared/trustTimeline.js
 *
 * Enforces the rules from the Trust Timeline sketch (PR #44):
 *   - every event has a valid type from the six-type taxonomy
 *   - every event has a positive integer `pr` field
 *   - every event has a `sha` matching a 7- or 40-char hex string
 *   - every event has a non-empty `summary` under 280 chars
 *   - every event has a valid `layer` from the four-layer taxonomy
 *   - every event has a date in YYYY-MM-DD ISO format
 *   - events with a `package` field use the MVP focus package
 *   - no two events share the same (pr, type) tuple
 *   - event count for the MVP equals 8
 *   - no event has type 'policy_change' (anti-category)
 */

import {
  TRUST_TIMELINE_EVENTS,
  TRUST_TIMELINE_EVENT_TYPES,
  TRUST_TIMELINE_LAYERS,
  TRUST_TIMELINE_MVP_FOCUS_PACKAGE,
} from '../src/shared/trustTimeline.js';

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

// ---------------------------------------------------------------------------

test('MVP event count is exactly 8', () => {
  eq(TRUST_TIMELINE_EVENTS.length, 8, 'event count');
});

test('every event has a valid type from the six-type taxonomy', () => {
  const allowed = new Set(TRUST_TIMELINE_EVENT_TYPES);
  for (const ev of TRUST_TIMELINE_EVENTS) {
    ok(allowed.has(ev.type), `unknown event type ${ev.type} on PR #${ev.pr}`);
  }
});

test('no event uses the policy_change anti-category', () => {
  for (const ev of TRUST_TIMELINE_EVENTS) {
    ok(ev.type !== 'policy_change', `event on PR #${ev.pr} uses banned type policy_change`);
  }
});

test('every event has a valid layer from the four-layer taxonomy', () => {
  const allowed = new Set(TRUST_TIMELINE_LAYERS);
  for (const ev of TRUST_TIMELINE_EVENTS) {
    ok(allowed.has(ev.layer), `event on PR #${ev.pr} has unknown layer ${ev.layer}`);
  }
});

test('every event has a positive integer pr field', () => {
  for (const ev of TRUST_TIMELINE_EVENTS) {
    ok(Number.isInteger(ev.pr) && ev.pr > 0, `bad pr ${ev.pr}`);
  }
});

test('every event has a sha matching 7-or-40-char hex string', () => {
  const re = /^[0-9a-f]{7}$|^[0-9a-f]{40}$/;
  for (const ev of TRUST_TIMELINE_EVENTS) {
    ok(typeof ev.sha === 'string' && re.test(ev.sha), `bad sha ${ev.sha} on PR #${ev.pr}`);
  }
});

test('every event has a non-empty summary under 280 chars', () => {
  for (const ev of TRUST_TIMELINE_EVENTS) {
    ok(typeof ev.summary === 'string', `non-string summary on PR #${ev.pr}`);
    ok(ev.summary.length > 0, `empty summary on PR #${ev.pr}`);
    ok(ev.summary.length < 280, `summary >280 chars on PR #${ev.pr} (got ${ev.summary.length})`);
  }
});

test('every event has an ISO YYYY-MM-DD date', () => {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  for (const ev of TRUST_TIMELINE_EVENTS) {
    ok(re.test(ev.date), `bad date ${ev.date} on PR #${ev.pr}`);
  }
});

test('events with a package field use the MVP focus package', () => {
  for (const ev of TRUST_TIMELINE_EVENTS) {
    if ('package' in ev && ev.package !== undefined) {
      eq(ev.package, TRUST_TIMELINE_MVP_FOCUS_PACKAGE, `event on PR #${ev.pr} uses non-focus package`);
    }
  }
});

test('no two events share the same (pr, type) tuple', () => {
  const seen = new Set();
  for (const ev of TRUST_TIMELINE_EVENTS) {
    const key = `${ev.pr}:${ev.type}`;
    ok(!seen.has(key), `duplicate (pr, type) tuple ${key}`);
    seen.add(key);
  }
});

test('references (when present) have label and href strings', () => {
  for (const ev of TRUST_TIMELINE_EVENTS) {
    if (!ev.references) continue;
    ok(Array.isArray(ev.references), `non-array references on PR #${ev.pr}`);
    for (const ref of ev.references) {
      ok(typeof ref.label === 'string' && ref.label.length > 0, `bad reference label on PR #${ev.pr}`);
      ok(typeof ref.href === 'string' && ref.href.length > 0, `bad reference href on PR #${ev.pr}`);
    }
  }
});

// ---------------------------------------------------------------------------

(async () => {
  for (const fn of pending) await fn();
  console.log(`\nTrust Timeline tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
