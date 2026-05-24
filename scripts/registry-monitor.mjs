#!/usr/bin/env node
/**
 * OpenSoyce Zero-Day Registry Threat Monitor.
 * Periodically polls npm registry changes feed, runs Sandbox checks on new publishes,
 * and reports discovered threats to the Supabase threat_feed table.
 */

import { checkThreats, reportThreat } from '../src/shared/threatDb.js';
import { analyzePackageContent } from '../src/shared/threatIngest.js';
import { resolve as pathResolve } from 'node:path';
import process from 'node:process';

const NPM_CHANGES_URL = 'https://replicate.npmjs.com/_changes?descending=true&limit=100';
const NPM_REGISTRY_URL = 'https://registry.npmjs.org/';

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  return res.json();
}

/**
 * Polls the last 100 NPM publishes, inspects new versions, and runs the sandbox.
 */
export async function pollNpmRegistryAndScan() {
  console.log(`Polling npm registry changes from ${NPM_CHANGES_URL}...`);
  let changesData;
  try {
    changesData = await fetchJson(NPM_CHANGES_URL);
  } catch (err) {
    console.error('Failed to fetch npm changes feed:', err.message);
    return;
  }

  const results = changesData.results || [];
  console.log(`Found ${results.length} changes. Analyzing...`);

  let processedCount = 0;
  let threatCount = 0;

  for (const change of results) {
    const pkgName = change.id;
    if (!pkgName || pkgName.startsWith('_')) continue;

    try {
      // Fetch full package info
      const pkgInfo = await fetchJson(NPM_REGISTRY_URL + encodeURIComponent(pkgName));
      const times = pkgInfo.time || {};
      const versions = Object.keys(pkgInfo.versions || {});
      if (versions.length === 0) continue;

      // Find the latest version published
      const latestVersion = versions.sort((a, b) => {
        const timeA = new Date(times[a] || 0).getTime();
        const timeB = new Date(times[b] || 0).getTime();
        return timeB - timeA; // newest first
      })[0];

      if (!latestVersion) continue;

      const verInfo = pkgInfo.versions[latestVersion];
      const scripts = verInfo.scripts || {};
      const scriptsText = Object.entries(scripts)
        .filter(([key]) => ['preinstall', 'install', 'postinstall'].includes(key))
        .map(([key, val]) => `${key}: ${val}`)
        .join('\n');

      // Run our static sandbox analyzer
      const analysis = analyzePackageContent(pkgName, latestVersion, 'npm', scriptsText, []);
      processedCount++;

      if (analysis.threatDetected) {
        console.warn(`[THREAT DETECTED] Package: ${pkgName}@${latestVersion}, Type: ${analysis.threatType}`);
        console.warn(`  Evidence: ${analysis.evidence.reason}`);

        // Write threat to Supabase threat_feed table
        await reportThreat({
          package_name: pkgName,
          version: latestVersion,
          ecosystem: 'npm',
          threat_type: analysis.threatType,
          evidence: {
            reason: analysis.evidence.reason,
            snippet: analysis.evidence.snippet || null,
            suspectedTarget: analysis.evidence.suspectedTarget || null
          },
          verdict: 'blocked' // Default to auto-blocking for zero-day threats
        });
        threatCount++;
      }
    } catch (err) {
      // Gracefully continue to next package in stream
    }
  }

  console.log(`Scan run complete. Processed: ${processedCount}, Threats Flagged: ${threatCount}`);
}

const invokedDirectly = (() => {
  try {
    const argv1 = process.argv[1] ? pathResolve(process.argv[1]) : '';
    const modulePath = new URL(import.meta.url).pathname;
    const normalized = process.platform === 'win32' && modulePath.startsWith('/')
      ? modulePath.slice(1)
      : modulePath;
    return pathResolve(decodeURIComponent(normalized)) === argv1;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  pollNpmRegistryAndScan().then(
    () => process.exit(0),
    err => {
      console.error('Registry monitor run failed:', err);
      process.exit(1);
    }
  );
}
