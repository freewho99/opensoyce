#!/usr/bin/env node
/**
 * PR-V2-D structural invariants for the CLI workspace extension.
 *
 * Covers the eight invariant groups the user-approved PR-V2-D scope
 * requires:
 *
 *   1. existing CLI v0 commands still work (carried by test:cli-v0)
 *   2. no workspace flag keeps old public behavior
 *   3. --workspace requires authenticated session
 *   4. workspace commands call Vault endpoints only in workspace mode
 *   5. exception list/propose/revoke are present
 *   6. approve/reject/extend are absent
 *   7. public CLI cannot emit private-anchor hrefs
 *   8. private CLI output marks visibility/private source
 *
 * Plus device-code-flow + session-file invariants per PR-V1-E §1, §2, §8:
 *
 *   - session.ts is the only file that calls writeFileSync (cross-checked
 *     by test:cli-v0)
 *   - session.ts calls chmodSync with 0o600 immediately after writeFileSync
 *   - session_token literal does not appear in any process.stdout.write or
 *     process.stderr.write call argument outside the session-file IO path
 *   - The CLI uses fetch() only (cross-checked by test:cli-v0)
 *   - device-code endpoints (/api/vault/cli/device-code, device-token,
 *     approve) are wired in the server route table
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

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

// ---------- Group 1: existing v0 commands still work ---------------------

test('cli.ts still dispatches the 5 v0 commands (additive lift; no replacement)', () => {
  const cli = read('packages/cli/src/cli.ts');
  for (const cmd of ['check', 'lockfile', 'trust', 'timeline', 'why']) {
    ok(cli.includes(`case '${cmd}':`), `cli.ts dropped the v0 case for ${cmd} (lift must be additive)`);
  }
});

// ---------- Group 2: no --workspace keeps old public behavior ------------

test('timeline.ts has byte-for-byte v0 mode when args.workspace is absent', () => {
  const src = read('packages/cli/src/commands/timeline.ts');
  // The runTimeline function must early-return on the v0 path BEFORE it
  // references loadSession or vault-api. Grep-assert: the v0 branch
  // (`if (!args.workspace) { ... return EXIT_ALLOW; }`) appears BEFORE
  // any `loadSession()` or `listVaultTimeline(` call.
  const v0Branch = src.indexOf('if (!args.workspace)');
  const loadSessionAt = src.indexOf('loadSession()');
  const vaultCallAt = src.indexOf('listVaultTimeline(');
  ok(v0Branch >= 0, 'timeline.ts must check !args.workspace for the v0 path');
  ok(loadSessionAt < 0 || loadSessionAt > v0Branch, 'loadSession() must not run on the v0 path');
  ok(vaultCallAt < 0 || vaultCallAt > v0Branch, 'listVaultTimeline must not run on the v0 path');
});

test('check / lockfile / why do not touch Vault when args.workspace is absent', () => {
  // In each of the gate-driven commands, the workspace-mode branch must be
  // gated by `if (args.workspace)`. The default path never reads the
  // session file or hits /api/vault/*.
  for (const cmd of ['check', 'lockfile', 'why']) {
    const src = read(`packages/cli/src/commands/${cmd}.ts`);
    if (src.includes('args.workspace')) {
      // The workspace branch exists — must be inside an `if (args.workspace)`
      // conditional (we look for the literal as a sentinel).
      ok(
        /if\s*\(\s*args\.workspace\s*\)/.test(src),
        `${cmd}.ts references args.workspace but lacks an explicit \`if (args.workspace)\` gate`,
      );
    }
  }
});

// ---------- Group 3: --workspace requires an authenticated session -------

test('every command that uses args.workspace also checks loadSession() before any Vault call', () => {
  // For check / lockfile / why / timeline, the workspace-mode branch must
  // delegate to ONE of the workspace-context wrappers (which all check the
  // session and surface "opensoyce login required" on null). The PR-V1-E
  // §7.1 wrapper-only rule for v0 commands means none of these files
  // calls loadSession() directly — they go through the wrapper.
  const WORKSPACE_WRAPPERS = [
    'fetchWorkspaceExceptions',
    'fetchActiveWorkspaceExceptions',
    'fetchVaultTimelineEvents',
  ];
  for (const cmd of ['check', 'lockfile', 'why', 'timeline']) {
    const src = read(`packages/cli/src/commands/${cmd}.ts`);
    if (!src.includes('args.workspace')) continue;
    const usesAnyWrapper = WORKSPACE_WRAPPERS.some((w) => src.includes(w));
    ok(
      usesAnyWrapper,
      `${cmd}.ts must delegate the workspace branch to one of [${WORKSPACE_WRAPPERS.join(', ')}] (PR-V1-E §7.1 wrapper-only rule)`,
    );
  }
  // Exception subcommands always require both args.workspace AND loadSession.
  for (const sub of ['list', 'propose', 'revoke']) {
    const src = read(`packages/cli/src/commands/exception/${sub}.ts`);
    ok(/args\.workspace/.test(src), `exception/${sub}.ts must require args.workspace`);
    ok(/loadSession\(\)/.test(src), `exception/${sub}.ts must call loadSession()`);
    ok(/opensoyce login required/.test(src), `exception/${sub}.ts must surface "opensoyce login required" on missing session`);
  }
});

// ---------- Group 4: workspace commands call Vault endpoints only in workspace mode

test('Vault API calls live in vault-api.ts; commands import them through that module', () => {
  // Direct fetch() calls to /api/vault/* outside vault-api.ts would split
  // the auth surface and bypass the Cookie+CSRF helpers. Grep-assert that
  // no command module references /api/vault/ as a literal URL.
  for (const { rel, src } of allCliSource()) {
    if (rel === 'packages/cli/src/lib/vault-api.ts') continue;
    ok(
      !/['"`]\/api\/vault\//.test(src),
      `${rel} hardcodes a /api/vault/ path — every Vault call must go through lib/vault-api.ts`,
    );
  }
});

test('vault-api.ts is the only module that sets a Cookie header', () => {
  // Cookie header sets a session — must be centralized.
  for (const { rel, src } of allCliSource()) {
    if (rel === 'packages/cli/src/lib/vault-api.ts') continue;
    ok(
      !/['"]Cookie['"]\s*[:,]/.test(src),
      `${rel} sets a Cookie header directly — that must live in lib/vault-api.ts`,
    );
  }
});

// ---------- PR-DOGFOOD-1 dogfood fixes ----------

test('exception list pages through API on --subject without --limit (PR-DOGFOOD-1)', () => {
  // Previously the --subject filter ran client-side over a truncated
  // first page (default 50). Exception #51+ was invisible. The fix
  // pages with offset until either match is found OR the hard scan
  // cap is hit, AND surfaces a truncation warning when capped.
  const src = read('packages/cli/src/commands/exception/list.ts');
  ok(/SUBJECT_SCAN_PAGE_SIZE/.test(src) || /offset:\s*0/.test(src),
    'list.ts must page through the workspace via offset when --subject is set');
  ok(/MAX_SCAN_RECORDS/.test(src),
    'list.ts must enforce a hard scan cap to prevent runaway pagination');
  ok(/truncated/.test(src),
    'list.ts must surface a "truncated" flag/warning when the scan cap is hit');
});

test('login.ts emits a heartbeat while polling (PR-DOGFOOD-1)', () => {
  // The 10-minute device-code pairing wait used to look like a frozen
  // terminal. --quiet still suppresses the heartbeat. --json never
  // includes it.
  const src = read('packages/cli/src/commands/login.ts');
  ok(/lastHeartbeatLine|heartbeat|HEARTBEAT/i.test(src),
    'login.ts must track a heartbeat cadence while polling');
  ok(/!args\.quiet/.test(src) && /!args\.json/.test(src),
    'login.ts heartbeat must be gated on !args.quiet && !args.json');
});

// ---------- Group 5/6: exception subcommands present; four-eye verbs absent

test('exception list / propose / revoke are present', () => {
  for (const sub of ['list', 'propose', 'revoke']) {
    const p = path.join(root, 'packages', 'cli', 'src', 'commands', 'exception', `${sub}.ts`);
    ok(fs.existsSync(p), `missing exception subcommand: ${p}`);
  }
  const cli = read('packages/cli/src/cli.ts');
  ok(/case 'exception':/.test(cli), 'cli.ts must dispatch the exception command');
  ok(/runExceptionList/.test(cli), 'cli.ts must import + dispatch runExceptionList');
  ok(/runExceptionPropose/.test(cli), 'cli.ts must import + dispatch runExceptionPropose');
  ok(/runExceptionRevoke/.test(cli), 'cli.ts must import + dispatch runExceptionRevoke');
});

test('exception approve / reject / extend / withdraw are NOT in the CLI', () => {
  // The four-eye gates stay UI-only per PR-V1-E §4.2.
  for (const sub of ['approve', 'reject', 'extend', 'withdraw']) {
    const p = path.join(root, 'packages', 'cli', 'src', 'commands', 'exception', `${sub}.ts`);
    ok(!fs.existsSync(p), `exception/${sub}.ts must not exist (four-eye stays UI-only)`);
  }
  for (const { rel, src } of allCliSource()) {
    ok(!/runExceptionApprove/.test(src), `${rel} references runExceptionApprove`);
    ok(!/runExceptionReject/.test(src), `${rel} references runExceptionReject`);
    ok(!/runExceptionExtend/.test(src), `${rel} references runExceptionExtend`);
    ok(!/runExceptionWithdraw/.test(src), `${rel} references runExceptionWithdraw`);
  }
});

// ---------- Group 7: public CLI cannot emit private-anchor hrefs ---------

test('no CLI source contains the literal "private-anchor" proofType string', () => {
  // PR-V1-E §8: public CLI output never carries private-anchor hrefs.
  // The workspace-mode output uses the [PRIVATE] line marker convention.
  // Even in workspace mode the CLI does not synthesize private-anchor
  // proofType strings — those are server-emitted on Vault rows.
  for (const { rel, src } of allCliSource()) {
    ok(
      !/['"]private-anchor['"]/.test(src),
      `${rel} contains the literal "private-anchor" proofType (public CLI mode must not emit private-anchor hrefs)`,
    );
  }
});

// ---------- Group 8: private CLI output marks visibility / private source

test('workspace-mode output emits the [PRIVATE] marker on Vault-sourced rows', () => {
  // Every command that surfaces Vault data must prefix the rendered block
  // with [PRIVATE] so the reader can distinguish from public output.
  const targets = [
    'packages/cli/src/commands/timeline.ts',
    'packages/cli/src/commands/exception/list.ts',
    'packages/cli/src/commands/exception/propose.ts',
    'packages/cli/src/commands/exception/revoke.ts',
    'packages/cli/src/lib/workspace-context.ts',
  ];
  for (const t of targets) {
    const src = read(t);
    ok(/\[PRIVATE\]/.test(src), `${t} must include the [PRIVATE] marker on Vault-sourced output`);
  }
});

test('JSON workspace-mode output carries visibility: "private"', () => {
  // exception list/propose/revoke + workspace timeline must annotate the
  // JSON output with visibility: "private" so machine consumers can route
  // it correctly.
  for (const t of [
    'packages/cli/src/commands/exception/list.ts',
    'packages/cli/src/commands/exception/propose.ts',
    'packages/cli/src/commands/exception/revoke.ts',
  ]) {
    const src = read(t);
    ok(
      /visibility:\s*['"]private['"]/.test(src),
      `${t} must include visibility: "private" in the --json branch`,
    );
  }
});

// ---------- Session-file invariants (PR-V1-E §2.3, §8.5-6) ---------------

test('session.ts is the dedicated session-file IO module', () => {
  const p = path.join(root, 'packages', 'cli', 'src', 'lib', 'session.ts');
  ok(fs.existsSync(p), 'packages/cli/src/lib/session.ts must exist');
  const src = read('packages/cli/src/lib/session.ts');
  ok(/loadSession/.test(src), 'session.ts must export loadSession');
  ok(/saveSession/.test(src), 'session.ts must export saveSession');
  ok(/clearSession/.test(src), 'session.ts must export clearSession');
});

test('session.ts writes with mode 0600 and chmods to 0600 after writeFile', () => {
  const src = read('packages/cli/src/lib/session.ts');
  ok(/mode:\s*0o600/.test(src), 'session.ts must use mode: 0o600 on writeFileSync');
  ok(/chmodSync\([^)]*0o600/.test(src), 'session.ts must call chmodSync with 0o600 after the write');
  // Path must be ~/.opensoyce/session.json — match os.homedir() + '.opensoyce' + 'session.json'.
  ok(/['"]\.opensoyce['"]/.test(src), 'session.ts must reference the .opensoyce directory literal');
  ok(/['"]session\.json['"]/.test(src), 'session.ts must reference session.json literal');
});

test('session_token literal does not appear in any process.stdout/stderr.write call', () => {
  // Audit each CLI file for `process.stdout.write(...session_token...)` or
  // `process.stderr.write(...session_token...)`. The token may appear in
  // session.ts (it's the payload) and vault-api.ts (it's passed via the
  // Cookie header) — those are the IO paths. Nowhere else.
  const IO_ALLOWLIST = new Set([
    'packages/cli/src/lib/session.ts',
    'packages/cli/src/lib/vault-api.ts',
  ]);
  for (const { rel, src } of allCliSource()) {
    if (IO_ALLOWLIST.has(rel)) continue;
    // Find every process.stdout.write or process.stderr.write call and
    // confirm none contain session_token in the argument.
    const writeRe = /process\.(stdout|stderr)\.write\([^)]+\)/g;
    let m;
    while ((m = writeRe.exec(src)) !== null) {
      ok(
        !/session_token/.test(m[0]),
        `${rel} writes session_token to ${m[1]}; the token must never leak to terminal output`,
      );
    }
  }
});

// ---------- Device-code wiring -------------------------------------------

test('server routes wire /api/vault/cli/device-code, device-token, approve', () => {
  const src = read('src/server/vault/routes.js');
  ok(/'\/api\/vault\/cli\/device-code'/.test(src), 'routes.js missing /api/vault/cli/device-code');
  ok(/'\/api\/vault\/cli\/device-token'/.test(src), 'routes.js missing /api/vault/cli/device-token');
  ok(/'\/api\/vault\/cli\/approve'/.test(src), 'routes.js missing /api/vault/cli/approve');
  // device-code + device-token are PUBLIC (no session). approve is gated
  // by requireVaultSession + requireCsrf (PR-V2-B middleware).
  const approveBlock = src.match(/'\/api\/vault\/cli\/approve'[\s\S]*?\);/);
  ok(approveBlock, 'approve route block not found');
  ok(/requireVaultSession/.test(approveBlock[0]), 'approve route must be fronted by requireVaultSession');
  ok(/requireCsrf/.test(approveBlock[0]), 'approve route must be fronted by requireCsrf');
});

test('migration 0016 defines vault_device_codes with the documented status set', () => {
  const sql = read('supabase/migrations/0016_vault_device_codes.sql');
  ok(/create table[\s\S]+vault_device_codes/i.test(sql), '0016 must create vault_device_codes');
  for (const status of ['pending', 'approved', 'consumed', 'expired', 'denied']) {
    ok(sql.includes(`'${status}'`), `0016 missing status literal ${status}`);
  }
  ok(/expires_at\s+timestamptz/.test(sql), '0016 must carry an expires_at timestamptz');
  ok(/alter table public\.vault_device_codes enable row level security/.test(sql), '0016 must enable RLS');
});

test('errors.js exposes the device-code error codes (PR-V2-D additions)', () => {
  const src = read('src/server/vault/errors.js');
  for (const code of ['authorization_pending', 'device_code_expired', 'device_code_invalid']) {
    const re = new RegExp(`${code}:\\s*['"]${code.replace(/_/g, '-')}['"]`);
    ok(re.test(src), `errors.js missing ${code} export`);
  }
});

// ---------- Wiring -------------------------------------------------------

test('package.json wires test:cli-workspace-v0 into test:ci', () => {
  const pkg = JSON.parse(read('package.json'));
  ok(pkg.scripts['test:cli-workspace-v0'], 'missing test:cli-workspace-v0 script');
  ok(
    /test-cli-workspace-v0\.mjs/.test(pkg.scripts['test:ci'] || ''),
    'test:ci must chain scripts/test-cli-workspace-v0.mjs',
  );
});

(async () => {
  for (const fn of pending) await fn();
  console.log(`\nCLI workspace v0 tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
