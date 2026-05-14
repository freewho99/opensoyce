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
import { resolve as pathResolve } from 'node:path';
import process from 'node:process';

import { analyzeRepo, githubHeaders } from '../src/shared/analyzeRepo.js';
import { resolveDepIdentity } from '../src/shared/resolveDepIdentity.js';
import { runScan, mapWithConcurrency } from '../src/shared/runScan.js';
import { summarizeScan } from '../src/shared/scanSummary.js';
import { computeRiskProfile } from '../src/shared/riskProfile.js';
import { buildMarkdownReport, buildJsonReport } from '../src/shared/buildScanReport.js';

const MAX_LOCKFILE_BYTES = 5_000_000;
const FAIL_ON_LEVELS = new Set(['none', 'review-required', 'high-vuln', 'critical-vuln']);

const USAGE = `Usage: node scripts/opensoyce-scan-report.mjs <package-lock.json> [options]

Options:
  --out <path>          Write markdown report to <path> (default: stdout)
  --json <path>         Also write JSON report to <path>
  --fail-on <level>     none|review-required|high-vuln|critical-vuln (default: none)
  --github-token <tok>  Token for higher rate limits; otherwise reads GITHUB_TOKEN env
  --quiet               Suppress progress lines on stderr
  --help                Print this message and exit
`;

/**
 * Hand-rolled argv parser. Keep it small — we do NOT take a new npm dep.
 * @param {string[]} argv  process.argv.slice(2)
 */
export function parseArgs(argv) {
  /** @type {{ positionals: string[], out: string|null, json: string|null, failOn: string, token: string|null, quiet: boolean, help: boolean, _error: string|null }} */
  const out = {
    positionals: [],
    out: null,
    json: null,
    failOn: 'none',
    token: null,
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

  progress(args.quiet, 'Parsing lockfile...');
  progress(args.quiet, 'Querying OSV...');

  let scanResult;
  try {
    scanResult = await runScan({
      lockfileText,
      filename: 'package-lock.json',
      deps: {
        getAnalysis,
        resolveIdentity: (name, opts) => resolveDepIdentity(name, opts || {}),
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
    });
    try {
      writeFileSync(pathResolve(process.cwd(), args.json), JSON.stringify(jsonReport, null, 2), 'utf8');
    } catch (e) {
      process.stderr.write(`failed to write JSON: ${e.message}\n`);
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
