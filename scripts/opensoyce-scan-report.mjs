#!/usr/bin/env node
/**
 * OpenSoyce CI Reporter v1.
 *
 * In-process CLI: imports the shared scan modules directly and makes its own
 * OSV + GitHub calls. Never spins up a server, never touches Express. Mirrors
 * the SAME data flow as the Express path so scoring does not drift between
 * web and CI.
 *
 * Usage:
 *   node scripts/opensoyce-scan-report.mjs <package-lock.json> [options]
 *
 * Options:
 *   --out <path>          Write markdown report to <path> (default: stdout)
 *   --json <path>         Also write JSON report to <path>
 *   --sarif <path>        Also write SARIF 2.1.0 report to <path>
 *   --ignore <path>       Path to a .opensoyce-ignore file (default: auto-discover
 *                         in the lockfile's parent directory)
 *   --fail-on <level>     Exit nonzero on: none|review-required|high-vuln|critical-vuln
 *                         (default: none)
 *   --github-token <tok>  Token for higher rate limits; otherwise reads GITHUB_TOKEN env
 *   --quiet               Suppress progress lines on stderr
 *   --help                Print usage and exit
 *
 * Exit codes:
 *   0  success and threshold not crossed
 *   1  threshold crossed OR fatal error (file missing, lockfile rejected)
 *   2  invocation error (bad flag, missing required positional)
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve as pathResolve, dirname as pathDirname, join as pathJoin } from 'node:path';
import process from 'node:process';

import { analyzeRepo, githubHeaders } from '../src/shared/analyzeRepo.js';
import { resolveDepIdentity, resolvePypiIdentity } from '../src/shared/resolveDepIdentity.js';
import { runScan, mapWithConcurrency } from '../src/shared/runScan.js';
import { summarizeScan } from '../src/shared/scanSummary.js';
import { computeRiskProfile } from '../src/shared/riskProfile.js';
import { buildMarkdownReport, buildJsonReport } from '../src/shared/buildScanReport.js';
import { buildSarifReport } from '../src/shared/buildSarifReport.js';
import { parseIgnoreFile, matchesIgnoreRule } from '../src/shared/parseIgnoreFile.js';
import { verifyReport, detectSignatureLocation, keyFingerprint } from '../src/shared/reportSigning.js';

const MAX_LOCKFILE_BYTES = 5_000_000;
const FAIL_ON_LEVELS = new Set(['none', 'review-required', 'high-vuln', 'critical-vuln']);
const PUBLIC_KEY_URL = 'https://www.opensoyce.com/.well-known/opensoyce-signing-key.pem';

const USAGE = `Usage: node scripts/opensoyce-scan-report.mjs <package-lock.json> [options]
       node scripts/opensoyce-scan-report.mjs --verify <report-path>

Options:
  --out <path>          Write markdown report to <path> (default: stdout)
  --json <path>         Also write JSON report to <path>
  --sarif <path>        Also write SARIF 2.1.0 report to <path>
  --ignore <path>       Path to a .opensoyce-ignore file (default: auto-discover
                        .opensoyce-ignore in the lockfile's parent directory)
  --fail-on <level>     none|review-required|high-vuln|critical-vuln (default: none)
  --github-token <tok>  Token for higher rate limits; otherwise reads GITHUB_TOKEN env
  --verify <path>       Verify a previously emitted JSON or SARIF report. Reads
                        OPENSOYCE_SIGNING_PUBLIC_KEY env var; if unset, fetches
                        ${PUBLIC_KEY_URL}.
                        Exits 0 on OK, 1 on INVALID.
  --quiet               Suppress progress lines on stderr
  --help                Print this message and exit

Signing:
  Reports emitted via --json / --sarif (or --out into a file) are signed when
  OPENSOYCE_SIGNING_PRIVATE_KEY is set in the environment. The signature is
  Ed25519 over a canonical (sorted-key) JSON form of the report. If the env
  var is unset, reports are emitted unsigned and a warning is printed to
  stderr.
`;

/**
 * Hand-rolled argv parser. Keep it small — we do NOT take a new npm dep.
 * @param {string[]} argv  process.argv.slice(2)
 */
export function parseArgs(argv) {
  /** @type {{ positionals: string[], out: string|null, json: string|null, sarif: string|null, ignore: string|null, failOn: string, token: string|null, verify: string|null, quiet: boolean, help: boolean, _error: string|null }} */
  const out = {
    positionals: [],
    out: null,
    json: null,
    sarif: null,
    ignore: null,
    failOn: 'none',
    token: null,
    verify: null,
    quiet: false,
    help: false,
    _error: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      out.help = true;
      continue;
    }
    if (a === '--quiet') {
      out.quiet = true;
      continue;
    }
    if (a === '--out') {
      const v = argv[++i];
      if (!v) { out._error = 'missing value for --out'; break; }
      out.out = v;
      continue;
    }
    if (a === '--json') {
      const v = argv[++i];
      if (!v) { out._error = 'missing value for --json'; break; }
      out.json = v;
      continue;
    }
    if (a === '--sarif') {
      const v = argv[++i];
      if (!v) { out._error = 'missing value for --sarif'; break; }
      out.sarif = v;
      continue;
    }
    if (a === '--ignore') {
      const v = argv[++i];
      if (!v) { out._error = 'missing value for --ignore'; break; }
      out.ignore = v;
      continue;
    }
    if (a === '--fail-on') {
      const v = argv[++i];
      if (!v) { out._error = 'missing value for --fail-on'; break; }
      if (!FAIL_ON_LEVELS.has(v)) {
        out._error = `--fail-on must be one of ${[...FAIL_ON_LEVELS].join(', ')} (got "${v}")`;
        break;
      }
      out.failOn = v;
      continue;
    }
    if (a === '--github-token') {
      const v = argv[++i];
      if (!v) { out._error = 'missing value for --github-token'; break; }
      out.token = v;
      continue;
    }
    if (a === '--verify') {
      const v = argv[++i];
      if (!v) { out._error = 'missing value for --verify'; break; }
      out.verify = v;
      continue;
    }
    if (a.startsWith('--')) {
      out._error = `unknown flag: ${a}`;
      break;
    }
    out.positionals.push(a);
  }
  return out;
}

/**
 * Compute the exit code given a scan result and the requested --fail-on
 * threshold. Pure for tests.
 *
 * @param {{ summary: any, vulnerabilities: any[]|null|undefined }} scanData
 * @param {'none'|'review-required'|'high-vuln'|'critical-vuln'} failOn
 * @returns {0|1}
 */
export function exitCodeForFailOn(scanData, failOn) {
  if (failOn === 'none') return 0;
  const vulns = Array.isArray(scanData?.vulnerabilities) ? scanData.vulnerabilities : [];
  if (failOn === 'review-required') {
    return scanData?.summary?.label === 'REVIEW_REQUIRED' ? 1 : 0;
  }
  if (failOn === 'high-vuln') {
    for (const v of vulns) {
      const sev = String(v?.severity || '').toLowerCase();
      if (sev === 'high' || sev === 'critical') return 1;
    }
    return 0;
  }
  if (failOn === 'critical-vuln') {
    for (const v of vulns) {
      const sev = String(v?.severity || '').toLowerCase();
      if (sev === 'critical') return 1;
    }
    return 0;
  }
  return 0;
}

/**
 * Build the CLI-side getAnalysis. Per-run Map cache, no TTL (CLI runs are
 * short-lived). Mirrors the Express server's data flow: all 8 GitHub endpoints
 * in parallel, SECURITY.md fallback, then calculateSoyceScore. We do this by
 * deferring to analyzeRepo() from src/shared — the same function the Vercel
 * function uses — so scoring stays bit-identical across runtimes.
 */
function makeCliAnalysisCache(token) {
  const headers = githubHeaders(token);
  const cache = new Map();
  return async function getAnalysis(owner, repo) {
    const key = `${owner}/${repo}`;
    if (cache.has(key)) return cache.get(key);
    const promise = analyzeRepo(owner, repo, headers);
    cache.set(key, promise);
    return promise;
  };
}

function progress(quiet, msg) {
  if (!quiet) process.stderr.write(`${msg}\n`);
}

/**
 * Load + parse an `.opensoyce-ignore` file. Returns the parsed rules plus a
 * human-readable source path for the progress line. Auto-discovery rule:
 * if `--ignore` is unset, look for `.opensoyce-ignore` in the lockfile's
 * parent directory. If neither path resolves to an existing file, returns
 * an empty rules array — suppression silently no-ops.
 *
 * Parser errors are surfaced on stderr but never fail the run; the file is
 * advisory, not authoritative.
 *
 * @param {string|null} explicitPath
 * @param {string} lockfilePath  absolute path to the lockfile
 * @param {boolean} quiet
 * @returns {{ ignoreRules: any[], ignoreSource: string }}
 */
function loadIgnoreRules(explicitPath, lockfilePath, quiet) {
  let candidate = null;
  if (explicitPath) {
    candidate = pathResolve(process.cwd(), explicitPath);
  } else {
    const auto = pathJoin(pathDirname(lockfilePath), '.opensoyce-ignore');
    if (existsSync(auto)) candidate = auto;
  }
  if (!candidate || !existsSync(candidate)) {
    return { ignoreRules: [], ignoreSource: 'no ignore file' };
  }
  let text = '';
  try {
    text = readFileSync(candidate, 'utf8');
  } catch (e) {
    process.stderr.write(`failed to read ignore file ${candidate}: ${e.message}\n`);
    return { ignoreRules: [], ignoreSource: 'no ignore file' };
  }
  const { rules, errors } = parseIgnoreFile(text);
  if (errors.length > 0 && !quiet) {
    for (const err of errors) process.stderr.write(`opensoyce-ignore: ${err}\n`);
  }
  return { ignoreRules: rules, ignoreSource: candidate };
}

/**
 * Resolve the public key for --verify. Order: explicit env var, then a
 * fetched copy from the .well-known URL. Returns the PEM string or null +
 * a human-readable reason.
 *
 * @returns {Promise<{ pem: string|null, source: string, reason?: string }>}
 */
async function resolveVerifyPublicKey() {
  const env = process.env.OPENSOYCE_SIGNING_PUBLIC_KEY;
  if (typeof env === 'string' && env.trim()) {
    return { pem: env, source: 'env OPENSOYCE_SIGNING_PUBLIC_KEY' };
  }
  try {
    const resp = await fetch(PUBLIC_KEY_URL);
    if (!resp.ok) {
      return {
        pem: null,
        source: PUBLIC_KEY_URL,
        reason: `fetched ${PUBLIC_KEY_URL} returned HTTP ${resp.status}`,
      };
    }
    const text = await resp.text();
    if (!text || !text.includes('BEGIN PUBLIC KEY')) {
      return {
        pem: null,
        source: PUBLIC_KEY_URL,
        reason: `fetched ${PUBLIC_KEY_URL} did not contain a PUBLIC KEY block`,
      };
    }
    return { pem: text, source: PUBLIC_KEY_URL };
  } catch (e) {
    return {
      pem: null,
      source: PUBLIC_KEY_URL,
      reason: `failed to fetch ${PUBLIC_KEY_URL}: ${e.message}`,
    };
  }
}

/**
 * Handle --verify <path>: read the file, parse JSON, run verifyReport, print
 * OK / INVALID and exit 0 / 1 accordingly.
 *
 * @param {string} verifyPath
 * @returns {Promise<0|1>}
 */
async function runVerify(verifyPath) {
  const abs = pathResolve(process.cwd(), verifyPath);
  if (!existsSync(abs)) {
    process.stderr.write(`INVALID: report file not found at ${abs}\n`);
    return 1;
  }
  let text;
  try {
    text = readFileSync(abs, 'utf8');
  } catch (e) {
    process.stderr.write(`INVALID: failed to read ${abs}: ${e.message}\n`);
    return 1;
  }
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    process.stderr.write(`INVALID: ${abs} is not valid JSON: ${e.message}\n`);
    return 1;
  }
  const { pem, source, reason } = await resolveVerifyPublicKey();
  if (!pem) {
    process.stderr.write(`INVALID: could not load OpenSoyce public key (${reason || 'no source'})\n`);
    return 1;
  }
  const location = detectSignatureLocation(obj);
  const result = verifyReport(obj, { publicKeyPem: pem, location });
  if (result.valid) {
    let expectedFingerprint = '';
    try {
      expectedFingerprint = keyFingerprint(pem);
    } catch { /* non-fatal */ }
    const lines = [
      `OK signature: ${result.keyFingerprint || '(no fingerprint in signature)'} signed at ${result.signedAt || '(unknown time)'}`,
      `  verified against ${source}${expectedFingerprint ? ` (fingerprint ${expectedFingerprint})` : ''}`,
    ];
    process.stdout.write(`${lines.join('\n')}\n`);
    return 0;
  }
  process.stderr.write(`INVALID: ${result.reason}\n`);
  return 1;
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (args._error) {
    process.stderr.write(`opensoyce-scan-report: ${args._error}\n\n${USAGE}`);
    return 2;
  }
  if (args.verify) {
    // Verify path: ignores all other flags / positionals.
    return runVerify(args.verify);
  }
  if (args.positionals.length === 0) {
    process.stderr.write(`opensoyce-scan-report: lockfile path is required\n\n${USAGE}`);
    return 2;
  }
  if (args.positionals.length > 1) {
    process.stderr.write(`opensoyce-scan-report: unexpected extra positional args: ${args.positionals.slice(1).join(', ')}\n`);
    return 2;
  }

  const lockfilePath = pathResolve(process.cwd(), args.positionals[0]);
  if (!existsSync(lockfilePath)) {
    process.stderr.write(`lockfile not found at ${lockfilePath}\n`);
    return 1;
  }

  let lockfileText;
  try {
    lockfileText = readFileSync(lockfilePath, 'utf8');
  } catch (e) {
    process.stderr.write(`failed to read lockfile: ${e.message}\n`);
    return 1;
  }
  // Same 5MB business cap the route handlers enforce.
  if (lockfileText.length > MAX_LOCKFILE_BYTES) {
    process.stderr.write(`lockfile exceeds 5MB cap (${lockfileText.length} bytes)\n`);
    return 1;
  }

  const token = args.token || process.env.GITHUB_TOKEN || '';
  const getAnalysis = makeCliAnalysisCache(token);

  // Signing: opt-in via OPENSOYCE_SIGNING_PRIVATE_KEY. If unset, emit a
  // single stderr warning so CI logs make the unsigned state visible.
  const signingPrivateKey = process.env.OPENSOYCE_SIGNING_PRIVATE_KEY || '';
  const signingPublicKey = process.env.OPENSOYCE_SIGNING_PUBLIC_KEY || '';
  if (!signingPrivateKey && !args.quiet) {
    process.stderr.write(
      'WARN OPENSOYCE_SIGNING_PRIVATE_KEY not set; reports will be emitted unsigned\n',
    );
  }
  const signingOpts = signingPrivateKey
    ? { privateKeyPem: signingPrivateKey, publicKeyPem: signingPublicKey || undefined }
    : {};

  progress(args.quiet, 'Parsing lockfile...');
  progress(args.quiet, 'Querying OSV...');

  // Resolver dispatch: runScan now passes `{ ecosystem }` in opts. Route
  // npm packages through the npm registry resolver and PyPI packages through
  // the PyPI JSON resolver. Both share the same return shape so the
  // downstream code (repo-health attach, selected-health scoring) is
  // ecosystem-agnostic.
  const resolveIdentity = (name, opts) => {
    const o = opts || {};
    if (o.ecosystem === 'PyPI') return resolvePypiIdentity(name, o);
    return resolveDepIdentity(name, o);
  };

  // Filename hint for parser format detection. We pass through the basename
  // of the input path so future per-format dispatch can pick it up; today
  // runScan still auto-detects by content. Common Python lockfile names:
  // `uv.lock`, `poetry.lock`. Common npm: `package-lock.json`.
  const filename = args.positionals[0].split(/[\\/]/).pop() || 'package-lock.json';

  let scanResult;
  try {
    scanResult = await runScan({
      lockfileText,
      filename,
      deps: {
        getAnalysis,
        resolveIdentity,
        mapWithConcurrency,
      },
    });
  } catch (err) {
    const code = err && err.scanError ? err.code : null;
    if (code) {
      process.stderr.write(`lockfile rejected: ${code}\n`);
      return 1;
    }
    process.stderr.write(`scan failed: ${err && err.message ? err.message : err}\n`);
    return 1;
  }

  const vulns = scanResult.vulnerabilities || [];
  const inventory = scanResult.inventory || null;
  const selectedHealth = scanResult.selectedHealth || null;

  progress(args.quiet, `Resolving repo identities (${vulns.length})...`);
  progress(args.quiet, `Scoring selected dependencies (${selectedHealth?.scored?.length || 0})...`);

  // Build summary + profile, same as the React panel.
  const summary = summarizeScan(vulns);
  const profile = computeRiskProfile({
    vulnerabilities: vulns,
    inventory,
    selectedHealth,
    osvError: !!scanResult.osvError,
  });

  const markdown = buildMarkdownReport({
    summary,
    profile,
    vulnerabilities: vulns,
    inventory,
    selectedHealth,
    scannedAt: scanResult.scannedAt,
    osvError: !!scanResult.osvError,
  });

  if (args.out) {
    try {
      writeFileSync(pathResolve(process.cwd(), args.out), markdown, 'utf8');
    } catch (e) {
      process.stderr.write(`failed to write markdown: ${e.message}\n`);
      return 1;
    }
  } else {
    process.stdout.write(markdown);
    if (!markdown.endsWith('\n')) process.stdout.write('\n');
  }

  if (args.json) {
    const jsonReport = buildJsonReport({
      summary,
      profile,
      vulnerabilities: vulns,
      inventory,
      selectedHealth,
      scannedAt: scanResult.scannedAt,
      osvError: !!scanResult.osvError,
    }, signingOpts);
    try {
      writeFileSync(pathResolve(process.cwd(), args.json), JSON.stringify(jsonReport, null, 2), 'utf8');
    } catch (e) {
      process.stderr.write(`failed to write JSON: ${e.message}\n`);
      return 1;
    }
  }

  if (args.sarif) {
    // Load + apply .opensoyce-ignore. Suppressions affect ONLY SARIF output —
    // markdown and JSON above remain full so users can't accidentally hide
    // advisories from their own dashboards by setting up the ignore file.
    const { ignoreRules, ignoreSource } = loadIgnoreRules(args.ignore, lockfilePath, args.quiet);
    /** @type {Array<{ vuln: any, rule: any }>} */
    const suppressed = [];
    /** @type {any[]} */
    const visibleVulns = [];
    if (ignoreRules.length > 0) {
      for (const v of vulns) {
        const rule = matchesIgnoreRule(v, ignoreRules);
        if (rule) suppressed.push({ vuln: v, rule });
        else visibleVulns.push(v);
      }
      progress(args.quiet, `Suppressed ${suppressed.length} of ${vulns.length} advisories per ${ignoreSource}`);
    } else {
      for (const v of vulns) visibleVulns.push(v);
    }
    const sarif = buildSarifReport({
      scanResult: { vulnerabilities: visibleVulns, scannedAt: scanResult.scannedAt },
      summary,
      profile,
      suppressions: suppressed,
    }, signingOpts);
    try {
      writeFileSync(pathResolve(process.cwd(), args.sarif), JSON.stringify(sarif, null, 2), 'utf8');
    } catch (e) {
      process.stderr.write(`failed to write SARIF: ${e.message}\n`);
      return 1;
    }
  }

  progress(args.quiet, 'Done.');

  return exitCodeForFailOn({ summary, vulnerabilities: vulns }, args.failOn);
}

// Only run main when invoked as a script (not when imported by tests).
const invokedDirectly = (() => {
  try {
    const argv1 = process.argv[1] ? pathResolve(process.argv[1]) : '';
    const modulePath = new URL(import.meta.url).pathname;
    // On Windows, URL pathname has a leading slash before the drive letter.
    const normalized = process.platform === 'win32' && modulePath.startsWith('/')
      ? modulePath.slice(1)
      : modulePath;
    return pathResolve(decodeURIComponent(normalized)) === argv1;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main(process.argv.slice(2)).then(
    code => process.exit(code),
    err => {
      process.stderr.write(`unhandled error: ${err && err.stack ? err.stack : err}\n`);
      process.exit(1);
    },
  );
}
