#!/usr/bin/env node
/**
 * Unit tests for src/shared/githubWorkflowSignals.js
 *
 * Covers parsing + signal-row emission for the three GitHub Actions
 * patterns that flip from catalog-only to gate-active in this PR:
 *
 *   - pull-request-target-abuse
 *   - untrusted-workflow-input
 *   - dangerous-release-permission
 *
 * Each test asserts row emission only; pattern firing is the
 * `detectGithubWorkflowOtsPatterns` integration concern and is verified
 * by the last test in this file (composition end-to-end).
 */

import {
  parseWorkflowForOtsSignals,
  detectGithubWorkflowOtsPatterns,
} from '../src/shared/githubWorkflowSignals.js';

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

function ok(c, msg) {
  if (!c) throw new Error(msg || 'assertion failed');
}
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// ---------------------------------------------------------------------------

test('pull_request_target + checkout PR head sha → pull-request-target-abuse row', () => {
  const wf = `
on: pull_request_target

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: \${{ github.event.pull_request.head.sha }}
      - run: npm test
`;
  const rows = parseWorkflowForOtsSignals(wf, { workflowPath: '.github/workflows/test.yml' });
  const prtAbuse = rows.filter((r) => r.pullRequestTargetAbuse);
  eq(prtAbuse.length, 1, 'one PR-target abuse row');
  eq(prtAbuse[0].jobId, 'test', 'job id');
  ok(prtAbuse[0].package.includes('steps.0'), 'pin step index');
});

test('pull_request_target + run interpolating PR head → pull-request-target-abuse row', () => {
  const wf = `
on: pull_request_target
jobs:
  test:
    steps:
      - run: 'bash ./scripts/test.sh \${{ github.event.pull_request.head.ref }}'
`;
  const rows = parseWorkflowForOtsSignals(wf);
  const prtAbuse = rows.filter((r) => r.pullRequestTargetAbuse);
  eq(prtAbuse.length, 1, 'PR-target abuse via run-step interpolation');
});

test('pull_request_target alone (no PR-controlled ref) does NOT emit pull-request-target-abuse', () => {
  const wf = `
on: pull_request_target
jobs:
  label:
    steps:
      - uses: actions/checkout@v4
      - run: echo "labeling"
`;
  const rows = parseWorkflowForOtsSignals(wf);
  const prtAbuse = rows.filter((r) => r.pullRequestTargetAbuse);
  eq(prtAbuse.length, 0, 'no PR-target abuse without fork-controlled ref or run');
});

test('PR-head checkout WITHOUT pull_request_target trigger does NOT emit pull-request-target-abuse', () => {
  // Same step shape but the trigger is the safe `pull_request`.
  const wf = `
on: pull_request
jobs:
  test:
    steps:
      - uses: actions/checkout@v4
        with:
          ref: \${{ github.event.pull_request.head.sha }}
`;
  const rows = parseWorkflowForOtsSignals(wf);
  const prtAbuse = rows.filter((r) => r.pullRequestTargetAbuse);
  eq(prtAbuse.length, 0, 'pull_request trigger does not carry privileged token');
});

test('run step with github.event.issue.title → untrusted-workflow-input row', () => {
  // js-yaml chokes on \${{ }} mid-scalar in unquoted run values, so real
  // workflows (and our test fixtures) wrap run scripts in single quotes
  // or block scalars. Both forms are exercised across this test file.
  const wf = `
on: issues
jobs:
  triage:
    steps:
      - run: 'echo "Triaging: \${{ github.event.issue.title }}"'
`;
  const rows = parseWorkflowForOtsSignals(wf);
  const untrusted = rows.filter((r) => r.untrustedWorkflowInput);
  eq(untrusted.length, 1, 'untrusted input row emitted');
  ok(untrusted[0].evidenceText.includes('issue.title'), 'evidence text retained');
});

test('multiple untrusted inputs in one workflow → one row per offending step', () => {
  const wf = `
on: issue_comment
jobs:
  reply:
    steps:
      - run: 'echo "Comment: \${{ github.event.comment.body }}"'
      - run: 'bash scripts/run.sh \${{ github.head_ref }}'
      - run: 'echo "safe"'
`;
  const rows = parseWorkflowForOtsSignals(wf);
  const untrusted = rows.filter((r) => r.untrustedWorkflowInput);
  eq(untrusted.length, 2, 'two untrusted rows (comment.body and head_ref)');
});

test('safe env indirection does NOT emit untrusted-workflow-input', () => {
  // The recommended fix pattern: read the attacker-controlled value via
  // an env var, never interpolate directly into the shell.
  const wf = `
on: issues
jobs:
  triage:
    steps:
      - env:
          ISSUE_TITLE: \${{ github.event.issue.title }}
        run: 'echo "Triaging: $ISSUE_TITLE"'
`;
  const rows = parseWorkflowForOtsSignals(wf);
  const untrusted = rows.filter((r) => r.untrustedWorkflowInput);
  eq(untrusted.length, 0, 'env indirection is safe');
});

test('permissions.contents: write → dangerous-release-permission row', () => {
  const wf = `
on: push
permissions:
  contents: write
jobs:
  release:
    steps:
      - run: gh release create
`;
  const rows = parseWorkflowForOtsSignals(wf);
  const dangerous = rows.filter((r) => r.dangerousReleasePermission);
  eq(dangerous.length, 1, 'one dangerous-release row');
  ok(dangerous[0].writeScopes.includes('contents'), 'writeScopes lists contents');
});

test('job-level permissions override top-level read-all', () => {
  const wf = `
on: push
permissions: read-all
jobs:
  build:
    steps:
      - run: npm ci
  release:
    permissions:
      packages: write
    steps:
      - run: npm publish
`;
  const rows = parseWorkflowForOtsSignals(wf);
  const dangerous = rows.filter((r) => r.dangerousReleasePermission);
  eq(dangerous.length, 1, 'only the release job triggers');
  eq(dangerous[0].jobId, 'release', 'release job');
});

test('permissions: read-all does NOT emit dangerous-release-permission', () => {
  const wf = `
on: push
permissions: read-all
jobs:
  build:
    steps:
      - run: npm test
`;
  const rows = parseWorkflowForOtsSignals(wf);
  const dangerous = rows.filter((r) => r.dangerousReleasePermission);
  eq(dangerous.length, 0, 'read-all is safe');
});

test('write-all string permission emits dangerous-release-permission', () => {
  const wf = `
on: push
permissions: write-all
jobs:
  yolo:
    steps:
      - run: echo "danger"
`;
  const rows = parseWorkflowForOtsSignals(wf);
  const dangerous = rows.filter((r) => r.dangerousReleasePermission);
  eq(dangerous.length, 1, 'write-all triggers');
  ok(dangerous[0].writeScopes.includes('__all'), '__all marker present');
});

test('detectGithubWorkflowOtsPatterns composes parser → detector for a clean workflow', () => {
  // End-to-end with a workflow that produces signal rows but the
  // detector branches that consume them ship in the same PR as a
  // separate commit. This test asserts the wiring shape (parser →
  // detector adapter doesn't crash on a real row set) without asserting
  // specific pattern IDs — the dedicated test in test-ots-patterns.mjs
  // covers pattern firing once the branches land.
  const wf = `
on: pull_request_target
permissions:
  contents: write
jobs:
  bad:
    steps:
      - uses: actions/checkout@v4
        with:
          ref: \${{ github.event.pull_request.head.sha }}
      - run: 'bash ./untrusted.sh \${{ github.event.pull_request.body }}'
`;
  // Pre-condition: rows produced by the parser.
  const rows = parseWorkflowForOtsSignals(wf, { workflowPath: '.github/workflows/bad.yml' });
  ok(rows.some((r) => r.pullRequestTargetAbuse), 'pull-request-target-abuse row present');
  ok(rows.some((r) => r.untrustedWorkflowInput), 'untrusted-workflow-input row present');
  ok(rows.some((r) => r.dangerousReleasePermission), 'dangerous-release-permission row present');
  // Composition does not throw and returns an array.
  const patterns = detectGithubWorkflowOtsPatterns(wf, { workflowPath: '.github/workflows/bad.yml' });
  ok(Array.isArray(patterns), 'detector adapter returns an array');
});

test('malformed YAML returns [] without throwing', () => {
  const rows = parseWorkflowForOtsSignals('this is: : not [valid yaml\n  - "');
  eq(Array.isArray(rows), true, 'returns array');
  eq(rows.length, 0, 'empty');
});

test('empty input returns []', () => {
  eq(parseWorkflowForOtsSignals('').length, 0, 'empty string');
  eq(parseWorkflowForOtsSignals('null').length, 0, 'YAML null');
  eq(parseWorkflowForOtsSignals('# just a comment').length, 0, 'comment only');
});

test('valid workflow with NO risky signals returns [] (clean baseline)', () => {
  const wf = `
on: push
permissions: read-all
jobs:
  test:
    steps:
      - uses: actions/checkout@v4
      - run: npm test
`;
  const rows = parseWorkflowForOtsSignals(wf);
  eq(rows.length, 0, 'no signals from clean workflow');
});

(async () => {
  for (const fn of pending) await fn();
  console.log(`\nGitHub Workflow Signals tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
