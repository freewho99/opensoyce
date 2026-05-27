/**
 * OTS Gate — Dependency Firewall Engine
 *
 * Implements a risk-tiered policy gate for package auto-updates.
 * Dictates whether a dependency update PR can be safely merged.
 *
 * Part of the Open-source Trust Stack (OTS).
 * Legacy name: Automerge Governor (preserved as backward-compat aliases below).
 */

/**
 * Classifies a dependency into a Risk Tier (0 - 4).
 * 
 * @param {string} name - Package name
 * @returns {{ tier: number, name: string }}
 */
export function classifyDependency(name) {
  const lowercaseName = name.toLowerCase();
  
  // TIER 0: Safe-ish Auto-merge Candidates (pure types, eslint configs, formatters, presets)
  if (
    lowercaseName.startsWith('@types/') ||
    lowercaseName.includes('eslint-config') ||
    lowercaseName.includes('prettier-config') ||
    lowercaseName.includes('jest-config') ||
    lowercaseName.includes('@babel/preset') ||
    lowercaseName.includes('@babel/types')
  ) {
    return { tier: 0, name: 'Tier 0: Safe-ish Auto-merge' };
  }

  // TIER 4: Never Blind Auto-merge (Auth, Crypto, Payment, CI/CD, secret keys, browser/IDE extensions)
  const tier4Keywords = [
    'auth', 'jwt', 'passport', 'crypto', 'bcrypt', 'jsonwebtoken', 'oauth', 
    'stripe', 'paypal', 'braintree', 'ci', 'cd', 'publish', 'deploy', 
    'secret', 'vault', 'keychain', 'keyring', 'web3', 'solana', 'ethers', 'wallet',
    'browser-ext', 'chrome-ext', 'firefox-ext', 'safari-ext'
  ];
  if (tier4Keywords.some(kw => lowercaseName.includes(kw))) {
    return { tier: 4, name: 'Tier 4: Never Blind Auto-merge' };
  }

  // TIER 3: Privileged Developer Tool (CLIs, VS Code/editor extensions, package managers, deploy platforms)
  const tier3Keywords = [
    'cli', 'plugin', 'addon', 'terminal', 'shell', 'devtool', 'neovim', 'vim', 
    'vscode', 'cursor', 'jetbrains', 'intellij', 'copilot', 'mcp', 'agent', 
    'npm', 'yarn', 'pnpm', 'lerna', 'yeoman', 'serverless', '@vercel/', 'netlify', 
    'firebase-tools', 'aws-cli', 'gh-pages', 'release-it', 'semantic-release', 
    'husky', 'lint-staged', 'eslint', 'nx'
  ];
  if (tier3Keywords.some(kw => lowercaseName.includes(kw))) {
    return { tier: 3, name: 'Tier 3: Privileged Dev Tool' };
  }

  // TIER 2: Build-chain Dependency (Vite, webpack, compilers, transpilers, bundlers)
  const tier2Keywords = [
    'vite', 'webpack', 'rollup', 'babel', 'swc', 'esbuild', 'typescript', 
    '@nx/', 'gulp', 'ts-loader', 'postcss'
  ];
  if (tier2Keywords.some(kw => lowercaseName.includes(kw))) {
    return { tier: 2, name: 'Tier 2: Build-chain' };
  }

  // TIER 1: Normal App Dependency (UI libs, styling, common helpers, networking)
  return { tier: 1, name: 'Tier 1: Normal App Dependency' };
}

/**
 * Assesses an update PR against the firewall policy.
 * 
 * @param {object} updatePRData 
 * @param {string} updatePRData.packageName
 * @param {string} updatePRData.fromVersion
 * @param {string} updatePRData.toVersion
 * @param {'patch' | 'minor' | 'major'} updatePRData.changeType
 * @param {boolean} updatePRData.addsLifecycleScript
 * @param {boolean} updatePRData.addsNativeBinary
 * @param {number} updatePRData.newTransitiveDepsCount
 * @param {number} updatePRData.publishAgeHours
 * @param {boolean} updatePRData.provenancePresent
 * @param {boolean} updatePRData.registrySignatureVerified
 * @param {boolean} updatePRData.maintainerIdentityStable
 * @param {boolean} updatePRData.sastUpstream
 * @param {boolean} updatePRData.vulnerabilityAuditPass
 * @param {boolean} updatePRData.ciPasses
 * @param {'small' | 'large'} updatePRData.lockfileDiffSize
 * @param {any} [repoData]
 * @param {{
 *   exceptionLookup?: (packageName: string, version: string) => Promise<any|null>,
 * }} [opts]  Injectable options. `exceptionLookup` is called before any block
 *   decision — if it returns an active exception, the gate returns
 *   EXCEPTION_ACTIVE without evaluating tier rules. This keeps the module
 *   pure: no filesystem I/O lives here.
 * @returns {{ decision: string, tier: number, tierName: string, reasons: Array<{ severity: string, message: string }>, recommendedAction: string, exception?: any }}
 */
export async function assessAutomergePolicy(updatePRData, repoData = {}, opts = {}) {
  const { tier, name: tierName } = classifyDependency(updatePRData.packageName);
  const reasons = [];

  // --- Exception check (before any block logic) ----------------------------
  // If an active exception exists for this exact package@version, short-circuit
  // and return EXCEPTION_ACTIVE. The exceptionLookup is injected by the caller
  // (CLI, CI runner) so this function stays pure and synchronous-compatible.
  if (typeof opts.exceptionLookup === 'function') {
    let activeException = null;
    try {
      activeException = await opts.exceptionLookup(updatePRData.packageName, updatePRData.toVersion);
    } catch (e) {
      // Lookup failure must NEVER unblock a dependency — fail closed.
      // The gate proceeds as if no exception exists.
      console.warn(`OTS Gate: exceptionLookup threw — proceeding without exception: ${e.message}`);
    }
    if (activeException) {
      const topReason = activeException.gateDecisionRef?.topReason
        || 'Exception approved for this version';
      return {
        decision: 'EXCEPTION_ACTIVE',
        tier,
        tierName,
        reasons: [],
        recommendedAction: `Exception ${activeException.id} active until ${activeException.expiresAt?.slice(0, 10) || 'unknown'}. Approved by @${activeException.reviewedBy || 'unknown'}.`,
        exception: activeException,
      };
    }
  }

  // 1. Critical Execution & Verification Gates (Always Block)
  if (updatePRData.ciPasses === false) {
    reasons.push({ severity: 'BLOCKED', message: 'CI validation checks failed' });
  }
  if (updatePRData.vulnerabilityAuditPass === false) {
    reasons.push({ severity: 'BLOCKED', message: 'Package version contains known vulnerabilities (NPM audit/OSV)' });
  }
  if (updatePRData.registrySignatureVerified === false) {
    reasons.push({ severity: 'BLOCKED', message: 'NPM registry signature verification failed' });
  }
  if (updatePRData.addsLifecycleScript === true) {
    reasons.push({ severity: 'BLOCKED', message: 'Suspicious execution behavior: new lifecycle script added' });
  }
  if (updatePRData.addsNativeBinary === true) {
    reasons.push({ severity: 'BLOCKED', message: 'Suspicious execution behavior: new native platform binary added' });
  }

  // 2. Delay Window Gates
  if (tier <= 1) {
    if (updatePRData.publishAgeHours < 24) {
      reasons.push({ 
        severity: 'DELAYED', 
        message: `Published ${updatePRData.publishAgeHours}h ago. Delaying for community verification window (24h).` 
      });
    }
  } else {
    if (updatePRData.publishAgeHours < 72) {
      reasons.push({ 
        severity: 'DELAYED', 
        message: `Published ${updatePRData.publishAgeHours}h ago. Delaying for security evaluation window (72h).` 
      });
    }
  }

  // 3. Provenance & Integrity Signals
  if (updatePRData.provenancePresent === false && tier >= 2) {
    reasons.push({ severity: 'NEEDS REVIEW', message: 'Missing NPM package provenance for privileged dependency' });
  }
  if (updatePRData.maintainerIdentityStable === false) {
    reasons.push({ severity: 'NEEDS REVIEW', message: 'Unstable package maintainer profile (potential hijack risk)' });
  }
  if (updatePRData.newTransitiveDepsCount > 10) {
    reasons.push({ 
      severity: 'NEEDS REVIEW', 
      message: `High quantity of new transitive dependencies introduced (${updatePRData.newTransitiveDepsCount} packages)` 
    });
  }
  if (updatePRData.sastUpstream === false && tier >= 3) {
    reasons.push({ severity: 'NEEDS REVIEW', message: 'No upstream SAST scanning detected on source repository' });
  }

  // 4. Tier-Specific Semver Gates
  if (tier === 4) {
    reasons.push({ severity: 'BLOCKED', message: 'Privileged category (Auth/Crypto/CI/CD) requires manual security owner approval' });
  } else if (tier === 3) {
    reasons.push({ severity: 'NEEDS REVIEW', message: 'Privileged developer tool requires manual review' });
  } else if (tier === 2) {
    if (updatePRData.changeType === 'major' || updatePRData.changeType === 'minor') {
      reasons.push({ severity: 'NEEDS REVIEW', message: `${updatePRData.changeType === 'major' ? 'Major' : 'Minor'} build-chain update requires review` });
    } else if (updatePRData.lockfileDiffSize === 'large') {
      reasons.push({ severity: 'NEEDS REVIEW', message: 'Build-chain patch update introduces a large lockfile diff' });
    }
  } else if (tier === 1) {
    if (updatePRData.changeType === 'major' || updatePRData.changeType === 'minor') {
      reasons.push({ severity: 'NEEDS REVIEW', message: `${updatePRData.changeType === 'major' ? 'Major' : 'Minor'} update to application dependency requires review` });
    }
  } else if (tier === 0) {
    if (updatePRData.changeType === 'major') {
      reasons.push({ severity: 'NEEDS REVIEW', message: 'Major update to helper package requires review' });
    }
  }

  // Determine final decision based on highest severity
  const severityRank = {
    'BLOCKED': 4,
    'NEEDS REVIEW': 3,
    'DELAYED': 2,
    'ALLOWED': 1
  };
  
  let maxSeverity = 'ALLOWED';
  let sortedReasons = [];
  
  if (reasons.length > 0) {
    let maxRank = 0;
    for (const r of reasons) {
      const rank = severityRank[r.severity];
      if (rank > maxRank) {
        maxRank = rank;
        maxSeverity = r.severity;
      }
    }
    sortedReasons = reasons.sort((a, b) => severityRank[b.severity] - severityRank[a.severity]);
  }
  
  const decision = `AUTO-MERGE ${maxSeverity}`;
  
  // Recommended action formulation
  let recommendedAction = 'Merge auto-allowed after CI checks pass.';
  if (maxSeverity === 'BLOCKED') {
    const blockReasons = reasons.filter(r => r.severity === 'BLOCKED');
    const firstMsg = blockReasons.length > 0 ? blockReasons[0].message : '';
    if (firstMsg.includes('vulnerabilities')) {
      recommendedAction = 'Audit vulnerabilities, resolve patch versions, or apply manual override.';
    } else if (firstMsg.includes('lifecycle') || firstMsg.includes('platform binary') || firstMsg.includes('category')) {
      recommendedAction = 'Manual review required. Run sandbox install. Inspect package tarball.';
    } else if (firstMsg.includes('CI validation')) {
      recommendedAction = 'Check CI logs and fix test regressions before merging.';
    } else {
      recommendedAction = 'Manual review and security-owner signoff required.';
    }
  } else if (maxSeverity === 'NEEDS REVIEW') {
    recommendedAction = 'Inspect package changelog and lockfile diff. Run dry-run install in sandbox.';
  } else if (maxSeverity === 'DELAYED') {
    recommendedAction = 'Hold merge until community verification period expires.';
  }
  
  return {
    decision,
    tier,
    tierName,
    reasons: sortedReasons.map(r => ({ severity: r.severity, message: r.message })),
    recommendedAction
  };
}

// ---------------------------------------------------------------------------
// OTS-branded aliases (new code should use these)
// ---------------------------------------------------------------------------

/**
 * OTS Gate — classify a dependency into a Risk Tier (0-4).
 * Alias of `classifyDependency` for code following the OTS naming convention.
 *
 * @param {string} name - Package name
 * @returns {{ tier: number, name: string }}
 */
export const classifyOtsDependency = classifyDependency;

/**
 * OTS Gate — assess a dependency update PR against the gate policy.
 * Alias of `assessAutomergePolicy` for code following the OTS naming convention.
 *
 * @param {object} updatePRData
 * @param {any} [repoData]
 * @returns {{ decision: string, tier: number, tierName: string, reasons: Array<{ severity: string, message: string }>, recommendedAction: string }}
 */
export const assessOtsGatePolicy = assessAutomergePolicy;
