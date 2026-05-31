#!/usr/bin/env node
/**
 * Unit tests for src/shared/repoWorkflowScan.js — the on-demand glue that
 * fetches `.github/workflows/*.yml` from a real repo and runs each file
 * through PR #15's `detectGithubWorkflowOtsPatterns`.
 *
 * All tests stub the HTTP client via `__setHttpClientForTests` and use
 * fixture workflow YAML strings inline. Network is never touched — by
 * design, per the PR acceptance criteria.
 */

import {
  scanRepoWorkflows,
  __setHttpClientForTests,
} from '../src/shared/repoWorkflowScan.js';

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
    } finally {
      __setHttpClientForTests(null);
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
// Fixtures
// ---------------------------------------------------------------------------

const VULNERABLE_PR_TARGET_WF = `
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

const CLEAN_WF = `
on: push
permissions: read-all
jobs:
  test:
    steps:
      - uses: actions/checkout@v4
      - run: npm test
`;

const DANGEROUS_PERMISSION_WF = `
on: push
permissions: write-all
jobs:
  publish:
    steps:
      - run: npm publish
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('happy path: lists workflows, fetches each, returns flattened patterns', async () => {
  __setHttpClientForTests({
    listWorkflowsDir: async (owner, repo) => {
      eq(owner, 'acme', 'owner threaded through');
      eq(repo, 'demo', 'repo threaded through');
      return [
        { name: 'release.yml', path: '.github/workflows/release.yml', size: 512 },
        { name: 'ci.yml', path: '.github/workflows/ci.yml', size: 300 },
      ];
    },
    fetchWorkflowFile: async (_owner, _repo, path) => {
      if (path.endsWith('release.yml')) return DANGEROUS_PERMISSION_WF;
      return CLEAN_WF;
    },
  });

  const result = await scanRepoWorkflows('acme', 'demo', {});

  eq(result.scanned, true, 'scanned true');
  eq(result.error, null, 'no error');
  eq(result.workflows.length, 2, 'both workflows present');
  ok(result.workflows.every((w) => w.fetched), 'all fetched');
  ok(result.workflows.every((w) => w.parsed), 'all parsed');
  ok(result.patterns.length >= 1, 'at least one pattern from dangerous-permission workflow');
  ok(
    result.patterns.some((p) => p.patternId === 'dangerous-release-permission'),
    'dangerous-release-permission fired'
  );
});

test('no workflows directory → scanned: true, error: NO_WORKFLOWS_DIR, patterns: []', async () => {
  __setHttpClientForTests({
    listWorkflowsDir: async () => {
      const e = new Error('NO_WORKFLOWS_DIR');
      e.code = 'NO_WORKFLOWS_DIR';
      throw e;
    },
    fetchWorkflowFile: async () => { throw new Error('should not be called'); },
  });

  const result = await scanRepoWorkflows('acme', 'norepo', {});

  eq(result.scanned, true, 'scanned true (404 is a clean answer)');
  eq(result.error, 'NO_WORKFLOWS_DIR', 'error code');
  eq(result.workflows.length, 0, 'no workflows');
  eq(result.patterns.length, 0, 'no patterns');
});

test('rate-limited listing → scanned: false, error: RATE_LIMIT_HIT, never throws', async () => {
  __setHttpClientForTests({
    listWorkflowsDir: async () => {
      const e = new Error('RATE_LIMIT_HIT');
      e.code = 'RATE_LIMIT_HIT';
      throw e;
    },
    fetchWorkflowFile: async () => { throw new Error('should not be called'); },
  });

  const result = await scanRepoWorkflows('acme', 'demo', {});

  eq(result.scanned, false, 'scanned false');
  eq(result.error, 'RATE_LIMIT_HIT', 'error code');
  eq(result.patterns.length, 0, 'no patterns');
});

test('upstream listing failure → scanned: false, error: UPSTREAM_ERROR, never throws', async () => {
  __setHttpClientForTests({
    listWorkflowsDir: async () => { throw new Error('socket reset'); },
    fetchWorkflowFile: async () => { throw new Error('should not be called'); },
  });

  const result = await scanRepoWorkflows('acme', 'demo', {});

  eq(result.scanned, false, 'scanned false');
  eq(result.error, 'UPSTREAM_ERROR', 'error code');
});

test('per-file fetch failure is isolated — sibling workflows still scan', async () => {
  __setHttpClientForTests({
    listWorkflowsDir: async () => [
      { name: 'good.yml', path: '.github/workflows/good.yml', size: 300 },
      { name: 'bad.yml', path: '.github/workflows/bad.yml', size: 300 },
    ],
    fetchWorkflowFile: async (_owner, _repo, path) => {
      if (path.endsWith('bad.yml')) throw new Error('file fetch failed');
      return VULNERABLE_PR_TARGET_WF;
    },
  });

  const result = await scanRepoWorkflows('acme', 'demo', {});

  eq(result.scanned, true, 'scanned true');
  eq(result.workflows.length, 2, 'both workflow entries returned');
  const good = result.workflows.find((w) => w.path.endsWith('good.yml'));
  const bad = result.workflows.find((w) => w.path.endsWith('bad.yml'));
  eq(good.fetched, true, 'good.yml fetched');
  eq(good.parsed, true, 'good.yml parsed');
  ok(good.patternCount >= 1, 'good.yml emitted patterns');
  eq(bad.fetched, false, 'bad.yml not fetched');
  eq(bad.parsed, false, 'bad.yml not parsed');
  eq(bad.patternCount, 0, 'bad.yml emitted no patterns');
});

test('malformed YAML body returns parsed: true (parser returns [] cleanly) and no patterns', async () => {
  // The parser swallows YAML errors and returns []. From the scan's
  // perspective, that file "parsed" in the sense that we ran the parser
  // and got a clean (empty) signal set — distinct from a fetch failure.
  __setHttpClientForTests({
    listWorkflowsDir: async () => [
      { name: 'broken.yml', path: '.github/workflows/broken.yml', size: 50 },
    ],
    fetchWorkflowFile: async () => 'this is: : not [valid yaml\n  - "',
  });

  const result = await scanRepoWorkflows('acme', 'demo', {});

  eq(result.scanned, true, 'scanned true');
  eq(result.workflows.length, 1, 'one workflow');
  eq(result.workflows[0].fetched, true, 'fetched');
  eq(result.workflows[0].parsed, true, 'parser ran cleanly (empty signals)');
  eq(result.workflows[0].patternCount, 0, 'no patterns');
  eq(result.patterns.length, 0, 'no flattened patterns');
});

test('non-yaml entries are skipped, not scanned', async () => {
  __setHttpClientForTests({
    listWorkflowsDir: async () => [
      { name: 'README.md', path: '.github/workflows/README.md', size: 100 },
      { name: 'release.yml', path: '.github/workflows/release.yml', size: 300 },
    ],
    fetchWorkflowFile: async () => DANGEROUS_PERMISSION_WF,
  });

  const result = await scanRepoWorkflows('acme', 'demo', {});

  eq(result.scanned, true, 'scanned true');
  eq(result.workflows.length, 1, 'only the yml workflow is in workflows list');
  eq(result.skipped.nonYaml, 1, 'README counted as skipped non-yaml');
});

test('.yaml extension is accepted (not just .yml)', async () => {
  __setHttpClientForTests({
    listWorkflowsDir: async () => [
      { name: 'release.yaml', path: '.github/workflows/release.yaml', size: 300 },
    ],
    fetchWorkflowFile: async () => DANGEROUS_PERMISSION_WF,
  });

  const result = await scanRepoWorkflows('acme', 'demo', {});
  eq(result.workflows.length, 1, '.yaml accepted');
  ok(result.patterns.some((p) => p.patternId === 'dangerous-release-permission'), 'pattern fired');
});

test('oversize file is skipped, not fetched', async () => {
  let fetchCalls = 0;
  __setHttpClientForTests({
    listWorkflowsDir: async () => [
      { name: 'huge.yml', path: '.github/workflows/huge.yml', size: 10_000_000 },
      { name: 'ok.yml', path: '.github/workflows/ok.yml', size: 200 },
    ],
    fetchWorkflowFile: async () => {
      fetchCalls += 1;
      return CLEAN_WF;
    },
  });

  const result = await scanRepoWorkflows('acme', 'demo', {});
  eq(fetchCalls, 1, 'only the in-cap file was fetched');
  eq(result.skipped.oversize, 1, 'oversize skip counted');
  eq(result.workflows.length, 1, 'only the in-cap file in workflows list');
});

test('a workflow scan combining all three patterns produces 1+ of each', async () => {
  __setHttpClientForTests({
    listWorkflowsDir: async () => [
      { name: 'bad.yml', path: '.github/workflows/bad.yml', size: 400 },
    ],
    fetchWorkflowFile: async () => VULNERABLE_PR_TARGET_WF,
  });

  const result = await scanRepoWorkflows('acme', 'demo', {});
  const ids = new Set(result.patterns.map((p) => p.patternId));
  ok(ids.has('pull-request-target-abuse'), 'pull-request-target-abuse present');
  ok(ids.has('untrusted-workflow-input'), 'untrusted-workflow-input present');
  ok(ids.has('dangerous-release-permission'), 'dangerous-release-permission present');
});

test('missing owner or repo returns scanned: false + error: INVALID_REPO without calling http', async () => {
  let httpCalled = false;
  __setHttpClientForTests({
    listWorkflowsDir: async () => { httpCalled = true; return []; },
    fetchWorkflowFile: async () => { httpCalled = true; return ''; },
  });

  const r1 = await scanRepoWorkflows('', 'repo', {});
  const r2 = await scanRepoWorkflows('owner', '', {});

  eq(r1.scanned, false, 'r1 scanned false');
  eq(r1.error, 'INVALID_REPO', 'r1 error');
  eq(r2.scanned, false, 'r2 scanned false');
  eq(r2.error, 'INVALID_REPO', 'r2 error');
  eq(httpCalled, false, 'http never called');
});

test('patterns from production scan never carry demo-fixture firings', async () => {
  // Coverage-honesty pass guarantee: production paths pass
  // `allowDemoFixtures: false`. detectGithubWorkflowOtsPatterns already
  // hardcodes that. The workflow row shape carries no `package: 'axios'`
  // / `package: 'malicious-pkg'` triggers, but assert anyway to lock the
  // contract.
  __setHttpClientForTests({
    listWorkflowsDir: async () => [
      { name: 'demo.yml', path: '.github/workflows/demo.yml', size: 200 },
    ],
    fetchWorkflowFile: async () => VULNERABLE_PR_TARGET_WF,
  });

  const result = await scanRepoWorkflows('acme', 'demo', {});
  const demoFixtureIds = ['hidden-dependency-injection', 'unknown-remote-endpoint', 'maintainer-account-compromise-signal'];
  for (const id of demoFixtureIds) {
    ok(!result.patterns.some((p) => p.patternId === id), `${id} not present (demo fixtures off)`);
  }
});

// ---------------------------------------------------------------------------

(async () => {
  for (const fn of pending) await fn();
  console.log(`\nRepo Workflow Scan tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
