#!/usr/bin/env node
/**
 * Structural invariants for the OpenSoyce CLI v0 (Phase 4 PR-A2).
 *
 * Doctrine enforced (matches docs/architecture/cli-architecture-sub-sketch.md):
 *   - 5 commands present: check, lockfile, trust, timeline, why
 *   - 7 global flags present in args.ts: --json, --no-color, --api-base,
 *     --timeout, --quiet/-q, --help/-h, --version
 *   - 6 exit codes exported: EXIT_ALLOW (0), EXIT_BLOCK (1), EXIT_WARN (2),
 *     EXIT_NOT_EVALUATED (3), EXIT_NETWORK_ERROR (4), EXIT_USAGE_ERROR (5)
 *   - No local gate execution: CLI source does not import from
 *     src/shared/ paths that perform gate evaluation
 *   - No write actions: no fs.writeFile / fs.appendFile / fs.rename /
 *     fs.unlink / fs.rmdir / fs.mkdir / fs.cp / fs.symlink outside the
 *     CLI's own temp paths
 *   - No auth: no "Authorization" header anywhere in CLI source
 *   - No telemetry: every network call targets the --api-base URL (the
 *     allowed-host pattern); no fetch() with a literal hostname other than
 *     the configured API base
 *   - No process.env.OPENSOYCE_TOKEN or process.env.GITHUB_TOKEN reads
 *   - The CLI's inlined static-data file mirrors the shared MVP data
 *     (the CLI never invents posture or timeline events)
 *   - package.json bin entry points at dist/cli.js
 *   - CLI strings file exists and is in the LINKING_PAGES hygiene list
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REPO_TRUST_POSTURES,
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
function ok(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

// All CLI source files we structurally check.
function allCliSource() {
  const dir = path.join(root, 'packages', 'cli', 'src');
  const out = [];
  const walk = (d) => {
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      const stat = fs.statSync(p);
      if (stat.isDirectory()) walk(p);
      else if (stat.isFile() && p.endsWith('.ts')) {
        out.push({ rel: path.relative(root, p).replaceAll('\\', '/'), src: fs.readFileSync(p, 'utf8') });
      }
    }
  };
  walk(dir);
  return out;
}

// -- 5 commands present ----------------------------------------------------

test('all 5 CLI commands have a runner module', () => {
  const commands = ['check', 'lockfile', 'trust', 'timeline', 'why'];
  for (const cmd of commands) {
    const p = path.join(root, 'packages', 'cli', 'src', 'commands', `${cmd}.ts`);
    ok(fs.existsSync(p), `missing command module: ${p}`);
  }
});

test('cli.ts dispatches all 5 commands and nothing else', () => {
  const cli = read('packages/cli/src/cli.ts');
  for (const cmd of ['check', 'lockfile', 'trust', 'timeline', 'why']) {
    ok(cli.includes(`case '${cmd}':`), `cli.ts missing case for ${cmd}`);
  }
  const sixthCommand = ['fix', 'upgrade', 'replace', 'remediate', 'install', 'init', 'login', 'audit', 'export'];
  for (const banned of sixthCommand) {
    ok(!cli.includes(`case '${banned}':`), `cli.ts contains forbidden case for ${banned} (would exceed locked 5-command surface)`);
  }
});

// -- 7 global flags present in args.ts ------------------------------------

test('args.ts exposes all 7 global flags', () => {
  const args = read('packages/cli/src/args.ts');
  const flags = ['--json', '--no-color', '--api-base', '--timeout', '--quiet', '-q', '--help', '-h', '--version'];
  for (const flag of flags) {
    ok(args.includes(`'${flag}'`), `args.ts missing flag literal ${flag}`);
  }
  const bannedFlags = ['--config', '--cache', '--profile', '--token', '--fail-on'];
  for (const banned of bannedFlags) {
    ok(!args.includes(`'${banned}'`), `args.ts contains forbidden flag ${banned} (outside locked 7-flag surface)`);
  }
});

// -- 6 exit codes exported ------------------------------------------------

test('exit-codes.ts exports all 6 exit codes with correct values', () => {
  const src = read('packages/cli/src/exit-codes.ts');
  const expected = [
    ['EXIT_ALLOW', '0'],
    ['EXIT_BLOCK', '1'],
    ['EXIT_WARN', '2'],
    ['EXIT_NOT_EVALUATED', '3'],
    ['EXIT_NETWORK_ERROR', '4'],
    ['EXIT_USAGE_ERROR', '5'],
  ];
  for (const [name, value] of expected) {
    const re = new RegExp(`export const ${name} = ${value};`);
    ok(re.test(src), `exit-codes.ts missing or wrong-valued export ${name} = ${value}`);
  }
});

// -- No local gate execution ----------------------------------------------

test('CLI source does not import gate evaluation from src/shared/', () => {
  const forbidden = [
    'src/shared/governor',
    'src/shared/scanLockfile',
    'src/shared/scoreCalculator',
    'src/shared/osvFastPath',
    'src/shared/runScan',
    'src/shared/analyzeRepo',
    'src/shared/repoWorkflowScan',
    'src/shared/threatIngest',
    'src/shared/incidentCandidates',
  ];
  for (const { rel, src } of allCliSource()) {
    for (const f of forbidden) {
      ok(!src.includes(f), `${rel} imports gate-evaluating module ${f}`);
    }
  }
});

// -- No write actions -----------------------------------------------------

test('CLI source uses no destructive fs methods', () => {
  const banned = [
    'fs.writeFile',
    'fs.appendFile',
    'fs.rename',
    'fs.unlink',
    'fs.rmdir',
    'fs.mkdir',
    'fs.cp(',
    'fs.copyFile',
    'fs.symlink',
    'writeFileSync',
    'appendFileSync',
    'unlinkSync',
    'rmdirSync',
    'mkdirSync',
    'renameSync',
  ];
  for (const { rel, src } of allCliSource()) {
    for (const b of banned) {
      ok(!src.includes(b), `${rel} uses forbidden write method ${b}`);
    }
  }
});

// -- No auth --------------------------------------------------------------

test('CLI source carries no Authorization header or token env vars', () => {
  for (const { rel, src } of allCliSource()) {
    ok(!src.toLowerCase().includes('authorization'), `${rel} contains the word "Authorization" (no auth in v0)`);
    ok(!src.includes('OPENSOYCE_TOKEN'), `${rel} reads OPENSOYCE_TOKEN env (no auth in v0)`);
    ok(!src.includes('GITHUB_TOKEN'), `${rel} reads GITHUB_TOKEN env (no auth in v0)`);
    ok(!src.includes('NPM_TOKEN'), `${rel} reads NPM_TOKEN env (no auth in v0)`);
  }
});

// -- No telemetry / single allowed host -----------------------------------

test('CLI source only fetches against the configured api base', () => {
  // Look at fetch call sites specifically. Reference URLs in data files
  // (e.g. GitHub PR links in static-data.ts) are NOT fetch targets — they
  // are data. The check protects the network surface, not the data surface.
  for (const { rel, src } of allCliSource()) {
    // Each fetch( call must take a URL built from `${...apiBase...}`, NOT a
    // literal `https://...` host. Capture the first argument loosely.
    const fetchSites = src.match(/fetch\s*\(\s*([^,)\n]+)/g) || [];
    for (const site of fetchSites) {
      const arg = site.replace(/fetch\s*\(\s*/, '');
      // Allowed: template literal containing apiBase reference, or a `url`
      // variable that was built from apiBase. Reject any fetch with a
      // literal http/https URL as the first argument.
      const literalHostMatch = arg.match(/^['"`](https?:\/\/[^'"`]+)['"`]/);
      ok(
        !literalHostMatch,
        `${rel} contains fetch() with literal URL ${literalHostMatch?.[1]} — must go through apiBase`,
      );
    }
    // No analytics SDK / sentry / posthog / segment etc.
    for (const banned of ['posthog', 'segment.io', 'sentry.io', 'mixpanel', 'amplitude', 'datadog']) {
      ok(!src.toLowerCase().includes(banned), `${rel} contains analytics literal ${banned}`);
    }
    // No http.request / https.request usage — only fetch. Match the actual
    // call syntax (with open paren), not documentation strings in comments.
    for (const banned of ['http.request(', 'https.request(', 'http.get(', 'https.get(']) {
      ok(!src.includes(banned), `${rel} uses raw ${banned} (CLI v0 uses fetch only)`);
    }
    // Reject http/https module imports as a separate check.
    for (const banned of ["from 'node:http'", 'from "node:http"', "from 'node:https'", 'from "node:https"', "from 'http'", 'from "http"', "from 'https'", 'from "https"']) {
      ok(!src.includes(banned), `${rel} imports raw ${banned} (CLI v0 uses fetch only)`);
    }
  }
});

// -- Inlined static data mirrors the shared module ------------------------

test('CLI static-data static postures match the shared MVP posture data', () => {
  const cliSrc = read('packages/cli/src/lib/static-data.ts');
  const shared = REPO_TRUST_POSTURES[0];
  ok(cliSrc.includes(`owner: '${shared.owner}'`), 'CLI static-data missing posture owner');
  ok(cliSrc.includes(`repo: '${shared.repo}'`), 'CLI static-data missing posture repo');
  ok(cliSrc.includes(`postureLabel: '${shared.postureLabel}'`), 'CLI static-data missing posture label');
  ok(cliSrc.includes(shared.postureSummary), 'CLI static-data missing posture summary');
});

test('CLI static-data timeline mirrors every shared timeline event PR', () => {
  const cliSrc = read('packages/cli/src/lib/static-data.ts');
  for (const ev of TRUST_TIMELINE_EVENTS) {
    ok(cliSrc.includes(`pr: ${ev.pr}`), `CLI static-data missing timeline event for PR ${ev.pr}`);
    ok(cliSrc.includes(`sha: '${ev.sha}'`), `CLI static-data missing timeline event SHA ${ev.sha}`);
  }
  const cliEventPrs = (cliSrc.match(/pr: (\d+)/g) || []).map((s) => Number(s.replace('pr: ', '')));
  const sharedEventPrs = TRUST_TIMELINE_EVENTS.map((e) => e.pr);
  eq(cliEventPrs.length, sharedEventPrs.length, 'CLI static-data event count mismatch');
});

// -- package.json / bin ---------------------------------------------------

test('lockfile command returns EXIT_NETWORK_ERROR on any partial network failure', () => {
  // Doctrine: network errors never silently degrade. Any failed gate call
  // inside `opensoyce lockfile` MUST drive the final exit code to
  // EXIT_NETWORK_ERROR, even when other entries returned ALLOW/WARN/BLOCK.
  //
  // The structural check here is two-part:
  //   1. lockfile.ts collects failures explicitly into a `failures` array
  //      (not a boolean flag) so the JSON output can report them and the
  //      exit-code branch is unmistakable.
  //   2. lockfile.ts contains an unconditional `if (failures.length > 0)
  //      return EXIT_NETWORK_ERROR;` BEFORE any exit-code-from-action path.
  //
  // Reject the silent-degrade shape: a boolean `networkErrored` flag paired
  // with a `results.length === 0` guard, which lets partial successes
  // mask network failures.
  const src = read('packages/cli/src/commands/lockfile.ts');
  ok(
    src.includes('failures: LockfileFailure[]') ||
      src.includes('const failures'),
    'lockfile.ts must collect failures into a typed array, not a boolean flag',
  );
  ok(
    /if\s*\(\s*failures\.length\s*>\s*0\s*\)\s*\{?\s*return\s+EXIT_NETWORK_ERROR;?/.test(src),
    'lockfile.ts must return EXIT_NETWORK_ERROR when any callGate failure was recorded (any-partial-failure doctrine)',
  );
  ok(
    !src.includes('networkErrored && results.length === 0'),
    'lockfile.ts must not silently degrade partial network failures (forbidden pattern: "networkErrored && results.length === 0")',
  );
});

test('CLI package.json bin entry points at dist/cli.js', () => {
  const pkg = JSON.parse(read('packages/cli/package.json'));
  eq(pkg.name, 'opensoyce', 'CLI package name');
  eq(typeof pkg.bin === 'object' && pkg.bin.opensoyce, './dist/cli.js', 'CLI bin opensoyce');
});

test('root package.json wires test:ci and test:cli-v0 script', () => {
  const pkg = JSON.parse(read('package.json'));
  ok(pkg.scripts['test:cli-v0'], 'missing test:cli-v0 script');
  ok(
    pkg.scripts['test:cli-v0'].includes('scripts/test-cli-v0.mjs'),
    'bad test:cli-v0 script wiring',
  );
  ok(
    pkg.scripts['test:ci'].includes('scripts/test-cli-v0.mjs'),
    'test:ci must include the CLI v0 invariants test',
  );
});

// -- README / hygiene wiring ----------------------------------------------

test('CLI strings, help, and README are in the linking-page hygiene list', () => {
  const test = read('scripts/test-open-source-trust-center.mjs');
  ok(test.includes("'packages/cli/src/strings.ts'"), 'CLI strings.ts not wired into hygiene LINKING_PAGES');
  ok(test.includes("'packages/cli/src/help.ts'"), 'CLI help.ts not wired into hygiene LINKING_PAGES');
  ok(test.includes("'packages/cli/README.md'"), 'CLI README.md not wired into hygiene LINKING_PAGES');
});

(async () => {
  for (const fn of pending) await fn();
  console.log(`\nCLI v0 tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
