#!/usr/bin/env node
/**
 * Structural invariants for the OpenSoyce CLI.
 *
 * Doctrine enforced (matches docs/architecture/cli-architecture-sub-sketch.md
 * + the PR-V2-D atomic lift per docs/architecture/vault-cli-workspace-extension-sub-sketch.md
 * §7):
 *
 *   v0 SURFACE (lifted by PR-V2-D — was 5/7, now 8/8):
 *   - 8 top-level commands present: check, lockfile, trust, timeline, why,
 *     login, logout, exception   (login + logout + exception added in PR-V2-D)
 *   - 8 global flags present in args.ts: --json, --no-color, --api-base,
 *     --timeout, --quiet/-q, --help/-h, --version, --workspace
 *     (--workspace added in PR-V2-D per PR-V1-E §3)
 *   - 6 exit codes exported: EXIT_ALLOW (0), EXIT_BLOCK (1), EXIT_WARN (2),
 *     EXIT_NOT_EVALUATED (3), EXIT_NETWORK_ERROR (4), EXIT_USAGE_ERROR (5)
 *
 *   ISOLATION (unchanged across the PR-V2-D lift):
 *   - No local gate execution: CLI source does not import from
 *     src/shared/ paths that perform gate evaluation
 *   - No auth: no "Authorization" header anywhere in CLI source. PR-V2-D
 *     uses a Cookie header (opensoyce_vault_session) — that's not a
 *     bearer auth scheme; the existing "no Authorization" rule stays.
 *   - No PAT / token env reads — device-code is the only auth path
 *   - No telemetry: every network call targets the --api-base URL
 *   - The CLI's inlined static-data file mirrors the shared MVP data
 *   - package.json bin entry points at dist/cli.js
 *   - CLI strings file exists and is in the LINKING_PAGES hygiene list
 *
 *   WRITE ACTIONS (atomically lifted by PR-V2-D):
 *   - fs.writeFileSync + fs.chmodSync are now permitted, BUT ONLY in
 *     packages/cli/src/lib/session.ts — the dedicated Vault session
 *     storage module. The CLI's structural test asserts every other
 *     CLI source file remains free of destructive fs methods.
 *
 *   PRIVATE-OUTPUT DOCTRINE (added by PR-V2-D):
 *   - No `private-anchor` proofType string in CLI source — public CLI
 *     mode must not emit private-anchor hrefs (per PR-V1-E §8). The
 *     workspace-mode output uses the [PRIVATE] line marker convention,
 *     not the private-anchor proof type literal.
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

// -- 8 commands present (atomically lifted by PR-V2-D from 5) -------------

test('all 8 CLI commands have a runner module', () => {
  // Atomic lift in PR-V2-D: was 5 commands (check, lockfile, trust,
  // timeline, why); now 8 with login (login.ts), logout (logout.ts), and
  // exception/ subdirectory carrying three subcommands (list/propose/revoke).
  const flatCommands = ['check', 'lockfile', 'trust', 'timeline', 'why', 'login', 'logout'];
  for (const cmd of flatCommands) {
    const p = path.join(root, 'packages', 'cli', 'src', 'commands', `${cmd}.ts`);
    ok(fs.existsSync(p), `missing command module: ${p}`);
  }
  // exception/ holds the three subcommand modules.
  const exceptionDir = path.join(root, 'packages', 'cli', 'src', 'commands', 'exception');
  ok(fs.existsSync(exceptionDir), 'missing exception/ subdirectory');
  for (const sub of ['list', 'propose', 'revoke']) {
    const p = path.join(exceptionDir, `${sub}.ts`);
    ok(fs.existsSync(p), `missing exception subcommand module: ${p}`);
  }
});

test('cli.ts dispatches all 8 commands and nothing outside the lifted surface', () => {
  const cli = read('packages/cli/src/cli.ts');
  // The 8 top-level commands the lift authorizes.
  const allowedCases = ['check', 'lockfile', 'trust', 'timeline', 'why', 'login', 'logout', 'exception'];
  for (const cmd of allowedCases) {
    ok(cli.includes(`case '${cmd}':`), `cli.ts missing case for ${cmd}`);
  }
  // Forbidden additions OUTSIDE the lifted surface. login + logout +
  // exception were lifted; the rest stay banned.
  const stillBanned = ['fix', 'upgrade', 'replace', 'remediate', 'install', 'init', 'audit', 'export'];
  for (const banned of stillBanned) {
    ok(!cli.includes(`case '${banned}':`), `cli.ts contains forbidden case for ${banned} (outside the PR-V2-D lifted surface)`);
  }
  // The four-eye exception verbs stay UI-only — never wired into the CLI.
  const fourEyeUiOnly = ['approve', 'reject', 'extend', 'withdraw'];
  for (const ui of fourEyeUiOnly) {
    ok(
      !cli.includes(`runException${ui[0].toUpperCase()}${ui.slice(1)}`),
      `cli.ts must not dispatch exception ${ui} (UI-only per PR-V1-E §4.2)`,
    );
  }
});

// -- 8 global flags present in args.ts (atomically lifted from 7) ---------

test('args.ts exposes all 8 global flags', () => {
  const args = read('packages/cli/src/args.ts');
  const flags = [
    '--json',
    '--no-color',
    '--api-base',
    '--timeout',
    '--quiet',
    '-q',
    '--help',
    '-h',
    '--version',
    '--workspace',
  ];
  for (const flag of flags) {
    ok(args.includes(`'${flag}'`), `args.ts missing flag literal ${flag}`);
  }
  // --workspace was the atomic lift; --config / --cache / --profile /
  // --token / --fail-on remain banned.
  const bannedFlags = ['--config', '--cache', '--profile', '--token', '--fail-on'];
  for (const banned of bannedFlags) {
    ok(!args.includes(`'${banned}'`), `args.ts contains forbidden flag ${banned} (outside the lifted surface)`);
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

// -- No write actions OUTSIDE the lifted session.ts allow-list ------------

test('CLI source uses no destructive fs methods outside the session-storage allow-list', () => {
  // Atomic lift in PR-V2-D: packages/cli/src/lib/session.ts is the SINGLE
  // file allowed to write to disk (it persists ~/.opensoyce/session.json
  // with mode 0600 per PR-V1-E §2.3). Every other CLI source file remains
  // free of destructive fs methods.
  const SESSION_ALLOWLIST = 'packages/cli/src/lib/session.ts';
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
    if (rel === SESSION_ALLOWLIST) continue;
    for (const b of banned) {
      ok(!src.includes(b), `${rel} uses forbidden write method ${b} (only ${SESSION_ALLOWLIST} is allowed to write to disk)`);
    }
  }
});

// -- No bearer-style auth headers; no token env vars ----------------------

test('CLI source carries no Authorization HTTP header or token env vars', () => {
  // Atomic refinement in PR-V2-D: the v0 rule was "no auth at all." PR-V2-D
  // adds device-code login which uses a Cookie header (opensoyce_vault_session),
  // NOT an Authorization bearer header. The original case-insensitive
  // includes('authorization') was over-broad — it caught the RFC 8628
  // standard error code `authorization-pending` which is OAuth Device Grant
  // vocabulary, not a bearer scheme. Tighten the rule to the actual concern:
  // no HTTP `Authorization` header literal, no token env reads.
  for (const { rel, src } of allCliSource()) {
    // HTTP Authorization header literal (capital A, as the spec writes it).
    // Reject any string that looks like an HTTP-header assignment.
    ok(!/['"]Authorization['"]\s*[:,]/.test(src), `${rel} sets an Authorization HTTP header (no bearer auth in this CLI)`);
    ok(!/Authorization\s*:\s*['"]?Bearer/i.test(src), `${rel} carries a Bearer Authorization header (no bearer auth in this CLI)`);
    ok(!src.includes('OPENSOYCE_TOKEN'), `${rel} reads OPENSOYCE_TOKEN env (no PAT auth in this CLI)`);
    ok(!src.includes('GITHUB_TOKEN'), `${rel} reads GITHUB_TOKEN env (no PAT auth in this CLI)`);
    ok(!src.includes('NPM_TOKEN'), `${rel} reads NPM_TOKEN env (no PAT auth in this CLI)`);
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
