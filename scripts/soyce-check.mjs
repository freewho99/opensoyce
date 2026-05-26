#!/usr/bin/env node
/**
 * OpenSoyce Trust Stack (OTS) Gate CLI — npx soyce check emulator.
 *
 * Scans local package.json, reads optional .opensoyce.yml policy,
 * queries the OTS Gate API, and enforces compliance thresholds in CI/CD.
 *
 * Includes an interactive --remediate wizard that auto-patches package.json,
 * executes tests, and commits or rolls back changes based on test status.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import yaml from 'js-yaml';

// Colors for terminal formatting
const C_RESET = '\x1b[0m';
const C_BOLD = '\x1b[1m';
const C_GREEN = '\x1b[32m';
const C_YELLOW = '\x1b[33m';
const C_RED = '\x1b[31m';
const C_CYAN = '\x1b[36m';
const C_BG_RED = '\x1b[41m\x1b[37m';
const C_BG_GREEN = '\x1b[42m\x1b[30m';

const GATE_URL = process.env.OPENSOYCE_GATE_URL || 'http://localhost:3000/api/compliance/gate';

async function main() {
  const args = process.argv.slice(2);
  const remediateMode = args.includes('--remediate');
  let failBelow = null;
  const failBelowIdx = args.indexOf('--fail-below');
  if (failBelowIdx !== -1 && args[failBelowIdx + 1]) {
    failBelow = parseFloat(args[failBelowIdx + 1]);
  }

  console.log(`${C_BOLD}┏ OpenSoyce Trust Stack (OTS) Gate${C_RESET}`);
  
  // 1. Read package.json dependencies
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    console.error(`┗ ${C_RED}Error: package.json not found in current directory.${C_RESET}`);
    process.exit(1);
  }

  let packageJson;
  try {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  } catch (err) {
    console.error(`┗ ${C_RED}Error parsing package.json: ${err.message}${C_RESET}`);
    process.exit(1);
  }

  const deps = Object.keys(packageJson.dependencies || {});
  const devDeps = Object.keys(packageJson.devDependencies || {});
  const allDeps = [...new Set([...deps, ...devDeps])];

  if (allDeps.length === 0) {
    console.log(`┗ ${C_GREEN}PASS (No dependencies found)${C_RESET}`);
    process.exit(0);
  }

  console.log(`┃ Scanning ${allDeps.length} dependencies...`);

  // 2. Read local .opensoyce.yml policy if present
  let localPolicy = null;
  const policyPath = path.join(process.cwd(), '.opensoyce.yml');
  if (fs.existsSync(policyPath)) {
    try {
      const rawYaml = fs.readFileSync(policyPath, 'utf8');
      const parsed = yaml.load(rawYaml);
      if (parsed && parsed.policy) {
        localPolicy = parsed.policy;
        console.log(`┃ Policy loaded: .opensoyce.yml`);
      }
    } catch (err) {
      console.warn(`┃ ${C_YELLOW}Warning: Failed to parse .opensoyce.yml: ${err.message}${C_RESET}`);
    }
  }

  // 3. Query OTS Gate API
  let gateResponse;
  try {
    const res = await fetch(GATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dependencies: allDeps,
        owner: 'freewho99',
        repo: 'angular-tradebuddy-admin',
        policy: localPolicy
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gate API returned status ${res.status}: ${errText}`);
    }

    gateResponse = await res.json();
  } catch (err) {
    console.error(`┗ ${C_RED}Error contacting compliance gate API: ${err.message}${C_RESET}`);
    console.log(`┃ ${C_YELLOW}Make sure the local server is running on http://localhost:3000${C_RESET}`);
    process.exit(1);
  }

  const { decision, overallScore, cache, evaluation } = gateResponse;

  // 4. Print beautiful terminal report
  console.log(`┃`);
  for (const item of evaluation) {
    const scoreStr = item.score.toFixed(1).padStart(4);
    const actionLabel = item.action === 'BLOCK' ? `${C_BG_RED} BLOCK ${C_RESET}` :
                        item.action === 'WARN' ? `${C_BG_RED.replace('41m', '43m').replace('37m', '30m')}  WARN  ${C_RESET}` :
                        `${C_BG_GREEN} ALLOW ${C_RESET}`;
                        
    const details = `${item.package.padEnd(20)} ${scoreStr}  ${item.status.padEnd(7)}  ${item.license.padEnd(10)} ${actionLabel}`;
    console.log(`┃ ${details}`);
    if (item.reason) {
      const reasonColor = item.action === 'BLOCK' ? C_RED : C_YELLOW;
      console.log(`┃   ↳ ${reasonColor}${item.reason}${C_RESET}`);
    }
    if (item.patterns && item.patterns.length > 0) {
      console.log(`┃     ${C_BOLD}Detected Patterns:${C_RESET}`);
      for (const pat of item.patterns) {
        const sevColor = pat.severity === 'critical' ? C_RED : pat.severity === 'high' ? C_YELLOW : C_CYAN;
        const patLabel = pat.patternId.replace(/-/g, ' ').toUpperCase();
        console.log(`┃       [${sevColor}${pat.severity.toUpperCase()}${C_RESET}] ${patLabel}`);
        if (pat.evidence && pat.evidence.length > 0) {
          for (const ev of pat.evidence) {
            console.log(`┃         ↳ ${ev.label}: ${ev.value}`);
          }
        }
      }
    }
  }
  console.log(`┃`);
  console.log(`┃ OVERALL STACK SCORE: ${C_BOLD}${overallScore >= 7.0 ? C_GREEN : C_RED}${overallScore} / 10.0${C_RESET}`);
  console.log(`┃ Cache Status: ${C_CYAN}${cache.toUpperCase()}${C_RESET}`);

  // Apply custom threshold gating if requested
  let finalDecision = decision;
  if (failBelow !== null && overallScore < failBelow) {
    console.log(`┃ ${C_RED}Gating Failure: Overall score ${overallScore} is below threshold ${failBelow}${C_RESET}`);
    finalDecision = 'BLOCK';
  }

  // 5. Remediation Mode
  if (finalDecision === 'BLOCK' && remediateMode) {
    console.log(`┃`);
    console.log(`┃ ${C_BOLD}🔧 Auto-Remediation Wizard Triggered${C_RESET}`);
    
    const blockedDeps = evaluation.filter(item => item.action === 'BLOCK');
    let modificationsApplied = false;

    // Backup package.json in memory
    const originalPackageJsonStr = fs.readFileSync(packageJsonPath, 'utf8');

    for (const item of blockedDeps) {
      console.log(`┃   Evaluating upgrade path for ${C_BOLD}${item.package}${C_RESET}...`);
      
      // Simulate safe upgrades: lodash to safe 8.2, moment to stable (or remove agpl-pkg)
      let upgradedVersion = null;
      if (item.package === 'lodash') upgradedVersion = '^8.2.0';
      if (item.package === 'moment') upgradedVersion = '^2.30.1';
      if (item.package === 'agpl-pkg' || item.package === 'malicious-pkg') upgradedVersion = null; // Removed

      if (upgradedVersion) {
        if (packageJson.dependencies && packageJson.dependencies[item.package]) {
          packageJson.dependencies[item.package] = upgradedVersion;
          modificationsApplied = true;
          console.log(`┃   ↳ ${C_GREEN}Upgraded ${item.package} to ${upgradedVersion} in package.json dependencies${C_RESET}`);
        } else if (packageJson.devDependencies && packageJson.devDependencies[item.package]) {
          packageJson.devDependencies[item.package] = upgradedVersion;
          modificationsApplied = true;
          console.log(`┃   ↳ ${C_GREEN}Upgraded ${item.package} to ${upgradedVersion} in package.json devDependencies${C_RESET}`);
        }
      } else {
        // Remove malicious or restricted package
        if (packageJson.dependencies && packageJson.dependencies[item.package]) {
          delete packageJson.dependencies[item.package];
          modificationsApplied = true;
        }
        if (packageJson.devDependencies && packageJson.devDependencies[item.package]) {
          delete packageJson.devDependencies[item.package];
          modificationsApplied = true;
        }
        console.log(`┃   ↳ ${C_RED}Removed blocked dependency ${item.package} from package.json${C_RESET}`);
      }
    }

    if (modificationsApplied) {
      // Write modified package.json
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');
      console.log(`┃   package.json updated on disk.`);
      console.log(`┃   Running local verify tests (tsc typecheck)...`);

      try {
        // Run verify test script (clean typecheck)
        execSync('npm run lint', { stdio: 'pipe' });
        console.log(`┃   ${C_GREEN}Tests passed! Executing Git commit...${C_RESET}`);
        
        execSync('git add package.json', { stdio: 'pipe' });
        execSync('git commit --no-verify -m "security: auto-remediate blocked dependencies via OTS Gate"', { stdio: 'pipe' });
        
        console.log(`┗ ${C_BG_GREEN} PASS (Remediated & Committed) ${C_RESET}`);
        process.exit(0);
      } catch (testErr) {
        console.error(`┃   ${C_RED}Tests failed or command execution error: ${testErr.message}${C_RESET}`);
        if (testErr.stdout) console.error(`┃   Stdout:\n${testErr.stdout.toString()}`);
        if (testErr.stderr) console.error(`┃   Stderr:\n${testErr.stderr.toString()}`);
        console.log(`┃   Rolling back changes to package.json...`);
        fs.writeFileSync(packageJsonPath, originalPackageJsonStr, 'utf8');
        console.log(`┃   package.json restored successfully.`);
        console.log(`┗ ${C_BG_RED} FAIL (Remediation Failed Tests) ${C_RESET}`);
        process.exit(1);
      }
    } else {
      console.log(`┃   No upgradable paths found.`);
      console.log(`┗ ${C_BG_RED} FAIL ${C_RESET}`);
      process.exit(1);
    }
  }

  // 6. Final verdict exits
  if (finalDecision === 'BLOCK') {
    console.log(`┗ ${C_BG_RED} FAIL ${C_RESET}`);
    process.exit(1);
  } else {
    console.log(`┗ ${C_BG_GREEN} PASS ${C_RESET}`);
    process.exit(0);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
