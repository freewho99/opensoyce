/**
 * Trusted-install-scripts allowlist (postinstall analysis v0).
 *
 * Background: npm `preinstall` / `install` / `postinstall` hooks run
 * arbitrary code on `npm install`. The lockfile flags this per-package
 * (`hasInstallScript: true` in npm v2/v3; `requiresBuild: true` in pnpm).
 * Famous supply-chain incidents (event-stream, ua-parser-js, colors.js,
 * faker.js) exploited install hooks, so the scanner surfaces this signal
 * as an informational chip on inventory + vuln rows.
 *
 * Many legitimate packages need install scripts for the package's stated
 * purpose (compilation, native binary download, git hook setup, etc.).
 * Flagging them as suspicious would teach users to ignore the chip
 * entirely. This curated allowlist suppresses the chip for those packages.
 *
 * Scope-aware: scoped packages (e.g. `@swc/core`) are stored with the
 * leading `@`. Matching is case-insensitive on the full name (scope
 * included), so `@SWC/CORE` and `@swc/core` both match.
 *
 * This module is JS (not TS) so the scanner pipeline (runScan.js, the
 * Vercel functions, the CLI, and the React UI via the bundler) all read
 * the same list.
 *
 * @typedef {Object} TrustedInstallScriptEntry
 * @property {string} name
 * @property {string} reason
 */

/** @type {TrustedInstallScriptEntry[]} */
export const TRUSTED_INSTALL_SCRIPTS = [
  // Build / compilation
  { name: 'typescript', reason: 'TypeScript compiler' },
  { name: 'esbuild', reason: 'Native binary download for the bundler' },
  { name: 'swc', reason: 'Rust-based compiler binary' },
  { name: '@swc/core', reason: 'Native SWC compiler binary' },

  // Native bindings — well-known, expected
  { name: 'sharp', reason: 'libvips native bindings' },
  { name: 'node-sass', reason: 'libsass native bindings (legacy)' },
  { name: 'sass-embedded', reason: 'Dart Sass binary download' },
  { name: 'bcrypt', reason: 'Native bcrypt bindings' },
  { name: 'argon2', reason: 'Native argon2 bindings' },
  { name: 'better-sqlite3', reason: 'Native SQLite bindings' },
  { name: 'canvas', reason: 'Cairo native bindings' },
  { name: 'sqlite3', reason: 'Native SQLite bindings' },

  // Browsers / runtimes
  { name: 'puppeteer', reason: 'Downloads Chromium binary' },
  { name: 'puppeteer-core', reason: 'Optional Chromium binary download' },
  { name: 'playwright', reason: 'Downloads browser binaries' },
  { name: '@playwright/test', reason: 'Downloads browser binaries' },
  { name: 'electron', reason: 'Downloads Electron binary' },
  { name: 'cypress', reason: 'Downloads Cypress binary' },

  // Dev tooling
  { name: 'husky', reason: 'Git hooks setup' },
  { name: 'simple-git-hooks', reason: 'Git hooks setup' },
  { name: 'lefthook', reason: 'Git hooks setup' },
  { name: 'core-js', reason: 'Postinstall banner only (informational, no code)' },

  // Other commonly-installed native deps
  { name: 'fsevents', reason: 'macOS file system events (optional)' },
  { name: 'protobufjs', reason: 'Optional native binding' },
  { name: 'segfault-handler', reason: 'Native segfault handler' },

  // Test frameworks with binary deps
  { name: 'jest', reason: 'Optional native modules for performance' },
  { name: 'vitest', reason: 'Optional native modules' },

  // Build tools
  { name: 'rollup', reason: 'Optional native binaries via @rollup/rollup-*' },
];

/**
 * Case-insensitive name allowlist check. Handles scoped names (`@scope/pkg`).
 * @param {string} name
 * @returns {boolean}
 */
export function isTrustedInstallScript(name) {
  if (typeof name !== 'string') return false;
  const lower = name.toLowerCase();
  return TRUSTED_INSTALL_SCRIPTS.some(t => t.name.toLowerCase() === lower);
}

/**
 * Returns the trusted-install-script entry (with `reason`) or null.
 * @param {string} name
 * @returns {TrustedInstallScriptEntry | null}
 */
export function getTrustedInstallScript(name) {
  if (typeof name !== 'string') return null;
  const lower = name.toLowerCase();
  return TRUSTED_INSTALL_SCRIPTS.find(t => t.name.toLowerCase() === lower) || null;
}
