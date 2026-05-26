import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, HeartPulse, Send, AlertTriangle, Play, HelpCircle, MessageSquare } from 'lucide-react';
import { EvidenceFocus, EvidenceTabKey } from './index';

interface ChatMessage {
  sender: 'system' | 'agent' | 'user';
  text: string;
  timestamp: string;
}

interface SauceJudgePanelProps {
  owner: string;
  repo: string;
  score: number;
  breakdown: {
    maintenance: number;
    security: number;
    community: number;
    documentation: number;
    activity: number;
  };
  meta: {
    lastCommit: string;
    license: string;
    hasDependabot: boolean;
    hasSast: boolean;
    contributors: number;
    busFactorHealthy: boolean;
    avgResolutionDays: number | null;
  };
  activeFocus: EvidenceFocus | null;
  setFocus: (focus: EvidenceFocus) => void;
  onActionTrigger: (action: string) => void;
  verdict: string;
  trustPosture: string;
  extensionExploitRisk?: {
    active: boolean;
    status: 'HIJACK RISK' | 'MAINTAINER BOTTLENECK' | 'NONE';
    reasons: { code: string; label: string }[];
    confidence: 'low' | 'medium' | 'high';
  } | null;
  onOpenTraceDrawer: () => void;
  simulatorActive: boolean;
  setSimulatorActive: (active: boolean) => void;
  simHasDependabot: boolean;
  setSimHasDependabot: (has: boolean) => void;
  simHasSast: boolean;
  setSimHasSast: (has: boolean) => void;
  simBusFactorHealthy: boolean;
  setSimBusFactorHealthy: (healthy: boolean) => void;
  baselineHasDependabot?: boolean;
  baselineHasSast?: boolean;
  baselineBusFactorHealthy?: boolean;
  automergeResult: any;
  depPackageName: string;
  setDepPackageName: (name: string) => void;
  depChangeType: 'patch' | 'minor' | 'major';
  setDepChangeType: (type: 'patch' | 'minor' | 'major') => void;
  depAddsLifecycleScript: boolean;
  setDepAddsLifecycleScript: (val: boolean) => void;
  depAddsNativeBinary: boolean;
  setDepAddsNativeBinary: (val: boolean) => void;
  depNewTransitiveDepsCount: number;
  setDepNewTransitiveDepsCount: (count: number) => void;
  depPublishAgeHours: number;
  setDepPublishAgeHours: (hours: number) => void;
  depProvenancePresent: boolean;
  setDepProvenancePresent: (val: boolean) => void;
  depRegistrySignatureVerified: boolean;
  setDepRegistrySignatureVerified: (val: boolean) => void;
  depMaintainerIdentityStable: boolean;
  setDepMaintainerIdentityStable: (val: boolean) => void;
  depSastUpstream: boolean;
  setDepSastUpstream: (val: boolean) => void;
  depVulnerabilityAuditPass: boolean;
  setDepVulnerabilityAuditPass: (val: boolean) => void;
  depCiPasses: boolean;
  setDepCiPasses: (val: boolean) => void;
  depLockfileDiffSize: 'small' | 'large';
  setDepLockfileDiffSize: (val: 'small' | 'large') => void;
}

export default function SauceJudgePanel({
  owner,
  repo,
  score,
  breakdown,
  meta,
  activeFocus,
  setFocus,
  onActionTrigger,
  verdict,
  trustPosture,
  extensionExploitRisk,
  onOpenTraceDrawer,
  simulatorActive,
  setSimulatorActive,
  simHasDependabot,
  setSimHasDependabot,
  simHasSast,
  setSimHasSast,
  simBusFactorHealthy,
  setSimBusFactorHealthy,
  baselineHasDependabot = false,
  baselineHasSast = false,
  baselineBusFactorHealthy = true,
  automergeResult,
  depPackageName,
  setDepPackageName,
  depChangeType,
  setDepChangeType,
  depAddsLifecycleScript,
  setDepAddsLifecycleScript,
  depAddsNativeBinary,
  setDepAddsNativeBinary,
  depNewTransitiveDepsCount,
  setDepNewTransitiveDepsCount,
  depPublishAgeHours,
  setDepPublishAgeHours,
  depProvenancePresent,
  setDepProvenancePresent,
  depRegistrySignatureVerified,
  setDepRegistrySignatureVerified,
  depMaintainerIdentityStable,
  setDepMaintainerIdentityStable,
  depSastUpstream,
  setDepSastUpstream,
  depVulnerabilityAuditPass,
  setDepVulnerabilityAuditPass,
  depCiPasses,
  setDepCiPasses,
  depLockfileDiffSize,
  setDepLockfileDiffSize,
}: SauceJudgePanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [hasSavedPreset, setHasSavedPreset] = useState(false);
  const [showGlossary, setShowGlossary] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);
  const [jsonCopied, setJsonCopied] = useState(false);
  const [simActiveHelp, setSimActiveHelp] = useState<string | null>(null);

  // Staged states for Simulator overrides
  const [stagedHasDependabot, setStagedHasDependabot] = useState(simHasDependabot);
  const [stagedHasSast, setStagedHasSast] = useState(simHasSast);
  const [stagedBusFactorHealthy, setStagedBusFactorHealthy] = useState(simBusFactorHealthy);
  const [stagedDepPackageName, setStagedDepPackageName] = useState(depPackageName);
  const [stagedDepChangeType, setStagedDepChangeType] = useState(depChangeType);
  const [stagedDepAddsLifecycleScript, setStagedDepAddsLifecycleScript] = useState(depAddsLifecycleScript);
  const [stagedDepAddsNativeBinary, setStagedDepAddsNativeBinary] = useState(depAddsNativeBinary);
  const [stagedDepNewTransitiveDepsCount, setStagedDepNewTransitiveDepsCount] = useState(depNewTransitiveDepsCount);
  const [stagedDepPublishAgeHours, setStagedDepPublishAgeHours] = useState(depPublishAgeHours);
  const [stagedDepProvenancePresent, setStagedDepProvenancePresent] = useState(depProvenancePresent);
  const [stagedDepRegistrySignatureVerified, setStagedDepRegistrySignatureVerified] = useState(depRegistrySignatureVerified);
  const [stagedDepMaintainerIdentityStable, setStagedDepMaintainerIdentityStable] = useState(depMaintainerIdentityStable);
  const [stagedDepSastUpstream, setStagedDepSastUpstream] = useState(depSastUpstream);
  const [stagedDepVulnerabilityAuditPass, setStagedDepVulnerabilityAuditPass] = useState(depVulnerabilityAuditPass);
  const [stagedDepCiPasses, setStagedDepCiPasses] = useState(depCiPasses);
  const [stagedDepLockfileDiffSize, setStagedDepLockfileDiffSize] = useState(depLockfileDiffSize);

  // Sync staged states with applied props when simulator active status, repository, or owner changes
  useEffect(() => {
    setStagedHasDependabot(simHasDependabot);
    setStagedHasSast(simHasSast);
    setStagedBusFactorHealthy(simBusFactorHealthy);
    setStagedDepPackageName(depPackageName);
    setStagedDepChangeType(depChangeType);
    setStagedDepAddsLifecycleScript(depAddsLifecycleScript);
    setStagedDepAddsNativeBinary(depAddsNativeBinary);
    setStagedDepNewTransitiveDepsCount(depNewTransitiveDepsCount);
    setStagedDepPublishAgeHours(depPublishAgeHours);
    setStagedDepProvenancePresent(depProvenancePresent);
    setStagedDepRegistrySignatureVerified(depRegistrySignatureVerified);
    setStagedDepMaintainerIdentityStable(depMaintainerIdentityStable);
    setStagedDepSastUpstream(depSastUpstream);
    setStagedDepVulnerabilityAuditPass(depVulnerabilityAuditPass);
    setStagedDepCiPasses(depCiPasses);
    setStagedDepLockfileDiffSize(depLockfileDiffSize);
  }, [owner, repo, simulatorActive]);

  useEffect(() => {
    setHasSavedPreset(!!localStorage.getItem('opensoyce_simulator_preset'));
  }, []);

  const isPresetModified = React.useMemo(() => {
    const saved = localStorage.getItem('opensoyce_simulator_preset');
    if (!saved) return false;
    try {
      const p = JSON.parse(saved);
      return (
        p.simHasDependabot !== stagedHasDependabot ||
        p.simHasSast !== stagedHasSast ||
        p.simBusFactorHealthy !== stagedBusFactorHealthy ||
        p.depPackageName !== stagedDepPackageName ||
        p.depChangeType !== stagedDepChangeType ||
        p.depAddsLifecycleScript !== stagedDepAddsLifecycleScript ||
        p.depAddsNativeBinary !== stagedDepAddsNativeBinary ||
        p.depNewTransitiveDepsCount !== stagedDepNewTransitiveDepsCount ||
        p.depPublishAgeHours !== stagedDepPublishAgeHours ||
        p.depProvenancePresent !== stagedDepProvenancePresent ||
        p.depRegistrySignatureVerified !== stagedDepRegistrySignatureVerified ||
        p.depMaintainerIdentityStable !== stagedDepMaintainerIdentityStable ||
        p.depSastUpstream !== stagedDepSastUpstream ||
        p.depVulnerabilityAuditPass !== stagedDepVulnerabilityAuditPass ||
        p.depCiPasses !== stagedDepCiPasses ||
        p.depLockfileDiffSize !== stagedDepLockfileDiffSize
      );
    } catch {
      return false;
    }
  }, [
    stagedHasDependabot, stagedHasSast, stagedBusFactorHealthy,
    stagedDepPackageName, stagedDepChangeType, stagedDepAddsLifecycleScript,
    stagedDepAddsNativeBinary, stagedDepNewTransitiveDepsCount, stagedDepPublishAgeHours,
    stagedDepProvenancePresent, stagedDepRegistrySignatureVerified, stagedDepMaintainerIdentityStable,
    stagedDepSastUpstream, stagedDepVulnerabilityAuditPass, stagedDepCiPasses, stagedDepLockfileDiffSize,
    hasSavedPreset
  ]);

  const diffsCount = [
    stagedHasDependabot !== simHasDependabot,
    stagedHasSast !== simHasSast,
    stagedBusFactorHealthy !== simBusFactorHealthy,
    stagedDepPackageName !== depPackageName,
    stagedDepChangeType !== depChangeType,
    stagedDepAddsLifecycleScript !== depAddsLifecycleScript,
    stagedDepAddsNativeBinary !== depAddsNativeBinary,
    stagedDepNewTransitiveDepsCount !== depNewTransitiveDepsCount,
    stagedDepPublishAgeHours !== depPublishAgeHours,
    stagedDepProvenancePresent !== depProvenancePresent,
    stagedDepRegistrySignatureVerified !== depRegistrySignatureVerified,
    stagedDepMaintainerIdentityStable !== depMaintainerIdentityStable,
    stagedDepSastUpstream !== depSastUpstream,
    stagedDepVulnerabilityAuditPass !== depVulnerabilityAuditPass,
    stagedDepCiPasses !== depCiPasses,
    stagedDepLockfileDiffSize !== depLockfileDiffSize
  ].filter(Boolean).length;

  const hasUnstagedChanges = diffsCount > 0;

  const handleApplyChanges = () => {
    setSimHasDependabot(stagedHasDependabot);
    setSimHasSast(stagedHasSast);
    setSimBusFactorHealthy(stagedBusFactorHealthy);
    setDepPackageName(stagedDepPackageName);
    setDepChangeType(stagedDepChangeType);
    setDepAddsLifecycleScript(stagedDepAddsLifecycleScript);
    setDepAddsNativeBinary(stagedDepAddsNativeBinary);
    setDepNewTransitiveDepsCount(stagedDepNewTransitiveDepsCount);
    setDepPublishAgeHours(stagedDepPublishAgeHours);
    setDepProvenancePresent(stagedDepProvenancePresent);
    setDepRegistrySignatureVerified(stagedDepRegistrySignatureVerified);
    setDepMaintainerIdentityStable(stagedDepMaintainerIdentityStable);
    setDepSastUpstream(stagedDepSastUpstream);
    setDepVulnerabilityAuditPass(stagedDepVulnerabilityAuditPass);
    setDepCiPasses(stagedDepCiPasses);
    setDepLockfileDiffSize(stagedDepLockfileDiffSize);
  };

  const handlePublishPolicy = () => {
    setPublishSuccess(true);
    setTimeout(() => {
      setPublishSuccess(false);
    }, 3000);
  };

  const handleClearChat = () => {
    const key = `opensoyce_chat_history_${owner}/${repo}`;
    localStorage.removeItem(key);
    setMessages([]);
  };

  // Dynamic Suggestion Chips based on Repository Context & Score
  const suggestions = React.useMemo(() => {
    const list = [];
    if (!meta.hasDependabot) {
      list.push('How to setup Dependabot?');
    }
    if (!meta.hasSast) {
      list.push('How to enable SAST scans?');
    }
    if (!meta.busFactorHealthy) {
      list.push('What is bus factor bottleneck?');
    }
    if (extensionExploitRisk && extensionExploitRisk.active && extensionExploitRisk.status !== 'NONE') {
      list.push('Why is this repo risky?');
    }
    list.push('How to get badge code?');
    list.push('What is Automerge Governor?');
    return list.slice(0, 3);
  }, [meta.hasDependabot, meta.hasSast, meta.busFactorHealthy, extensionExploitRisk, score]);

  const handleSavePreset = () => {
    if (hasSavedPreset) {
      const confirmOverwrite = window.confirm("An existing simulator preset already exists. Are you sure you want to overwrite it?");
      if (!confirmOverwrite) return;
    }
    const preset = {
      simHasDependabot: stagedHasDependabot,
      simHasSast: stagedHasSast,
      simBusFactorHealthy: stagedBusFactorHealthy,
      depPackageName: stagedDepPackageName,
      depChangeType: stagedDepChangeType,
      depAddsLifecycleScript: stagedDepAddsLifecycleScript,
      depAddsNativeBinary: stagedDepAddsNativeBinary,
      depNewTransitiveDepsCount: stagedDepNewTransitiveDepsCount,
      depPublishAgeHours: stagedDepPublishAgeHours,
      depProvenancePresent: stagedDepProvenancePresent,
      depRegistrySignatureVerified: stagedDepRegistrySignatureVerified,
      depMaintainerIdentityStable: stagedDepMaintainerIdentityStable,
      depSastUpstream: stagedDepSastUpstream,
      depVulnerabilityAuditPass: stagedDepVulnerabilityAuditPass,
      depCiPasses: stagedDepCiPasses,
      depLockfileDiffSize: stagedDepLockfileDiffSize
    };
    localStorage.setItem('opensoyce_simulator_preset', JSON.stringify(preset));
    setHasSavedPreset(true);
  };

  const handleLoadPreset = () => {
    const saved = localStorage.getItem('opensoyce_simulator_preset');
    if (saved) {
      try {
        const preset = JSON.parse(saved);
        if (preset.simHasDependabot !== undefined) setStagedHasDependabot(preset.simHasDependabot);
        if (preset.simHasSast !== undefined) setStagedHasSast(preset.simHasSast);
        if (preset.simBusFactorHealthy !== undefined) setStagedBusFactorHealthy(preset.simBusFactorHealthy);
        if (preset.depPackageName !== undefined) setStagedDepPackageName(preset.depPackageName);
        if (preset.depChangeType !== undefined) setStagedDepChangeType(preset.depChangeType);
        if (preset.depAddsLifecycleScript !== undefined) setStagedDepAddsLifecycleScript(preset.depAddsLifecycleScript);
        if (preset.depAddsNativeBinary !== undefined) setStagedDepAddsNativeBinary(preset.depAddsNativeBinary);
        if (preset.depNewTransitiveDepsCount !== undefined) setStagedDepNewTransitiveDepsCount(preset.depNewTransitiveDepsCount);
        if (preset.depPublishAgeHours !== undefined) setStagedDepPublishAgeHours(preset.depPublishAgeHours);
        if (preset.depProvenancePresent !== undefined) setStagedDepProvenancePresent(preset.depProvenancePresent);
        if (preset.depRegistrySignatureVerified !== undefined) setStagedDepRegistrySignatureVerified(preset.depRegistrySignatureVerified);
        if (preset.depMaintainerIdentityStable !== undefined) setStagedDepMaintainerIdentityStable(preset.depMaintainerIdentityStable);
        if (preset.depSastUpstream !== undefined) setStagedDepSastUpstream(preset.depSastUpstream);
        if (preset.depVulnerabilityAuditPass !== undefined) setStagedDepVulnerabilityAuditPass(preset.depVulnerabilityAuditPass);
        if (preset.depCiPasses !== undefined) setStagedDepCiPasses(preset.depCiPasses);
        if (preset.depLockfileDiffSize !== undefined) setStagedDepLockfileDiffSize(preset.depLockfileDiffSize);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleExportPolicy = () => {
    const dataToExport = {
      timestamp: new Date().toISOString(),
      targetPackage: {
        name: depPackageName,
        changeType: depChangeType,
        publishAgeHours: depPublishAgeHours,
        newTransitiveDepsCount: depNewTransitiveDepsCount,
        lockfileDiffSize: depLockfileDiffSize,
        addsLifecycleScript: depAddsLifecycleScript,
        addsNativeBinary: depAddsNativeBinary,
        provenancePresent: depProvenancePresent,
        registrySignatureVerified: depRegistrySignatureVerified,
        maintainerIdentityStable: depMaintainerIdentityStable,
        sastUpstream: depSastUpstream,
        vulnerabilityAuditPass: depVulnerabilityAuditPass,
        ciPasses: depCiPasses
      },
      automergeResult
    };

    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'automerge-policy-diff.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyPolicyJson = () => {
    const dataToExport = {
      timestamp: new Date().toISOString(),
      targetPackage: {
        name: depPackageName,
        changeType: depChangeType,
        publishAgeHours: depPublishAgeHours,
        newTransitiveDepsCount: depNewTransitiveDepsCount,
        lockfileDiffSize: depLockfileDiffSize,
        addsLifecycleScript: depAddsLifecycleScript,
        addsNativeBinary: depAddsNativeBinary,
        provenancePresent: depProvenancePresent,
        registrySignatureVerified: depRegistrySignatureVerified,
        maintainerIdentityStable: depMaintainerIdentityStable,
        sastUpstream: depSastUpstream,
        vulnerabilityAuditPass: depVulnerabilityAuditPass,
        ciPasses: depCiPasses
      },
      automergeResult
    };

    navigator.clipboard.writeText(JSON.stringify(dataToExport, null, 2));
    setJsonCopied(true);
    setTimeout(() => setJsonCopied(false), 2000);
  };

  // Load initial chat history or stream judgment completed summary
  useEffect(() => {
    const key = `opensoyce_chat_history_${owner}/${repo}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        setMessages(JSON.parse(stored));
      } catch (e) {
        console.error(e);
        setMessages([]);
      }
    } else {
      const assessment =
        score >= 80
          ? 'Healthy code distribution, active release cadences, and standard license posture verify this as stable.'
          : score >= 60
          ? 'A stable repository. However, minor gaps like missing SECURITY policies or low automated scanners adjust the score.'
          : 'High risk detected. Low commit frequency, lack of package updates, and ownership concentration found.';

      const verdictText = `📢 **Verdict Summary**: Overall Score of **${score.toFixed(1)}/100.0**. ${assessment}`;
      setMessages([]);
      streamResponse(verdictText, []);
    }
  }, [owner, repo]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const streamResponse = (fullText: string, currentMessagesList?: ChatMessage[]) => {
    setIsTyping(true);
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setTimeout(() => {
      setIsTyping(false);
      const words = fullText.split(' ');
      let currentText = '';
      let index = 0;

      const baseMessages = currentMessagesList !== undefined ? currentMessagesList : messages;

      const newAgentMsg: ChatMessage = {
        sender: 'agent',
        text: '',
        timestamp,
      };
      
      const newMessages = [...baseMessages, newAgentMsg];
      setMessages(newMessages);

      const interval = setInterval(() => {
        if (index < words.length) {
          currentText += (index === 0 ? '' : ' ') + words[index];
          setMessages((prev) => {
            const copy = [...prev];
            if (copy.length > 0) {
              copy[copy.length - 1].text = currentText;
            }
            return copy;
          });
          index++;
        } else {
          clearInterval(interval);
          setMessages((prev) => {
            const key = `opensoyce_chat_history_${owner}/${repo}`;
            localStorage.setItem(key, JSON.stringify(prev));
            return prev;
          });
        }
      }, 30);
    }, 600);
  };

  const handleSendMessage = (textToSend: string) => {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg: ChatMessage = {
      sender: 'user',
      text: textToSend,
      timestamp,
    };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    const key = `opensoyce_chat_history_${owner}/${repo}`;
    localStorage.setItem(key, JSON.stringify(updatedMessages));

    const query = textToSend.toLowerCase();
    let reply = '';

    if (query.includes('security') || query.includes('dependabot') || query.includes('sast') || query.includes('gap')) {
      reply = `🛡️ **Security Audit Details**:
* Dependabot: ${meta.hasDependabot ? '✓ CONFIGURED' : '✗ MISSING'}
* SAST analysis: ${meta.hasSast ? '✓ DETECTED' : '✗ NOT DETECTED'}
* Risks: ${meta.hasDependabot ? 'None detected.' : 'Vulnerable packages could go undetected without Dependabot alerts.'}

💡 *Try asking: "What is bus factor bottleneck?" next.*`;
    } else if (query.includes('risk') || query.includes('factor') || query.includes('bottleneck')) {
      reply = `⚠️ **Ownership & Risk Assessment**:
* Contributor count: ${meta.contributors} developers
* Bus Factor status: ${meta.busFactorHealthy ? '✓ HEALTHY' : '✗ BOTTLENECK RISK'}
* Impact: ${meta.busFactorHealthy ? 'Low operational risk.' : 'A single primary maintainer commits most of the code base.'}

💡 *Try asking: "Explain security gaps" next.*`;
    } else if (query.includes('action') || query.includes('improve') || query.includes('reach trusted')) {
      reply = `💡 **Improvement Actions**:
1. Setup Dependabot (click action below)
2. Deploy a SECURITY.md file
3. Claim repository to enable real-time scoring updates.

💡 *Try asking: "How to get badge code?" next.*`;
    } else if (query.includes('badge') || query.includes('claim') || query.includes('get badge code')) {
      const badgeMarkdown = `[![OpenSoyce Score](https://img.shields.io/badge/OpenSoyce-${score.toFixed(1)}%20%2F%20100.0-success)](https://opensoyce.com/lookup)`;
      reply = `🏷️ **Badge Integration & Claiming**:
To claim your repository, authenticate via GitHub OAuth by clicking the **Claim Repository** button under Recommended Actions.

Once claimed, you can embed your live OpenSoyce health badge into your README.md:

\`\`\`markdown
${badgeMarkdown}
\`\`\`

💡 *Try asking: "What is Automerge Governor?" next.*`;
    } else if (query.includes('trusted') || query.includes('stable')) {
      reply = `🌟 **Trust Evaluation**:
This repository has an overall score of **${score.toFixed(1)}/100.0** and is categorized under adoption band **${verdict}**.
It demonstrates solid engineering practices, but security hygiene and ownership distribution are vital for high-assurance environments.

💡 *Try asking: "What is Automerge Governor?" next.*`;
    } else if (query.includes('automerge')) {
      reply = `⚙️ **Automerge Governor**:
The Automerge Governor checks dependency updates against live compliance rules. Packages failing lockfile checks or lacking signatures will hold auto-merges and trigger human reviews.

💡 *Try asking: "Why is this repo risky?" next.*`;
    } else {
      reply = `I am the **Sauce Judge AI**. Ask me about the repository's **security configuration**, **bus factor risk**, or **how to improve the overall score**!`;
    }

    streamResponse(reply, updatedMessages);
  };

  // Determine primary risks dynamically
  const primaryRisks = [];
  if (!meta.hasDependabot) {
    primaryRisks.push({ text: 'Automated package monitoring (Dependabot) is missing.', tab: 'security' as EvidenceTabKey, reason: 'Security Scan Alert: Dependabot configuration file is absent.' });
  }
  if (!meta.busFactorHealthy) {
    primaryRisks.push({ text: 'High developer ownership concentration (Bus Factor risk).', tab: 'commits' as EvidenceTabKey, reason: 'Commit Log Check: Single author contributes over 80% of lines.' });
  }
  if (meta.license === 'No License' || meta.license === 'Unknown') {
    primaryRisks.push({ text: 'No standard open-source license found.', tab: 'license' as EvidenceTabKey, reason: 'Compliance Alert: Project missing distribution license.' });
  }
  if (primaryRisks.length === 0) {
    primaryRisks.push({ text: 'No critical security or compliance risks detected.', tab: 'security' as EvidenceTabKey, reason: 'Risk Index: Overall metrics indicate safe operations.' });
  }

  // Dynamic recommended actions mapping list
  const recommendedActions = [];
  const erReasons = extensionExploitRisk?.reasons || [];
  const erCodes = erReasons.map(r => r.code);

  if (erCodes.includes('NO_DEPENDABOT_DETECTED')) {
    recommendedActions.push({
      label: 'Configure Dependabot Alerts',
      tab: 'templates' as EvidenceTabKey,
      reason: 'Action focus: Set up Dependabot scanning alerts in .github/dependabot.yml.',
      onTrigger: () => onActionTrigger('dependabot')
    });
  }
  if (erCodes.includes('NO_SAST_DETECTED')) {
    recommendedActions.push({
      label: 'Configure CodeQL SAST',
      tab: 'templates' as EvidenceTabKey,
      reason: 'Action focus: Set up CodeQL SAST workflow in .github/workflows/codeql.yml.',
      onTrigger: () => onActionTrigger('codeql')
    });
  }
  if (erCodes.some(c => c.startsWith('SINGLE_MAINTAINER_DRIFT_'))) {
    recommendedActions.push({
      label: 'Audit Maintainer Churn',
      tab: 'commits' as EvidenceTabKey,
      reason: 'Action focus: Review recent commit logs and contribution distribution.',
      onTrigger: () => {}
    });
  }
  if (erCodes.includes('UNKNOWN_EVIDENCE_POSTURE')) {
    recommendedActions.push({
      label: 'Request Manual Review',
      tab: 'readme' as EvidenceTabKey,
      reason: 'Action focus: Request human verification for unknown posture scan.',
      onTrigger: () => {
        handleSendMessage('Explain security score and unknown evidence posture');
      }
    });
  }

  // Always offer claiming the repository
  recommendedActions.push({
    label: 'Claim Repository',
    tab: 'readme' as EvidenceTabKey,
    reason: 'Action focus: Add OpenSoyce badge to repository README.',
    onTrigger: () => onActionTrigger('badge')
  });

  // Highlight comparison checks
  const isDependabotOverride = stagedHasDependabot !== baselineHasDependabot;
  const isSastOverride = stagedHasSast !== baselineHasSast;
  const isBusFactorOverride = stagedBusFactorHealthy !== baselineBusFactorHealthy;
  const isPackageOverride = stagedDepPackageName !== 'lodash';
  const isChangeTypeOverride = stagedDepChangeType !== 'patch';
  const isPublishAgeOverride = stagedDepPublishAgeHours !== 48;
  const isTransitiveOverride = stagedDepNewTransitiveDepsCount !== 0;
  const isLockfileOverride = stagedDepLockfileDiffSize !== 'small';
  const isLifecycleOverride = stagedDepAddsLifecycleScript !== false;
  const isNativeOverride = stagedDepAddsNativeBinary !== false;
  const isProvenanceOverride = !stagedDepProvenancePresent;
  const isSignatureOverride = !stagedDepRegistrySignatureVerified;
  const isMaintainerOverride = !stagedDepMaintainerIdentityStable;
  const isSastUpstreamOverride = !stagedDepSastUpstream;
  const isVulnerabilityOverride = !stagedDepVulnerabilityAuditPass;
  const isCiOverride = !stagedDepCiPasses;

  const toggleSimHelp = (key: string) => {
    setSimActiveHelp(prev => prev === key ? null : key);
  };

  const renderSimHelpText = (key: string, text: string) => {
    if (simActiveHelp !== key) return null;
    return (
      <div className="mt-1 p-2 rounded text-[9px] bg-soy-bottle/20 text-soy-label border border-[#3a3028] font-sans leading-relaxed">
        {text}
      </div>
    );
  };

  // Helper to highlight and parse technical terms in chat response
  const renderChatMessageText = (text: string) => {
    const terms = ['Dependabot', 'SAST', 'Bus Factor', 'Automerge Governor'];
    let elements: React.ReactNode[] = [text];
    
    terms.forEach(term => {
      const nextElements: React.ReactNode[] = [];
      elements.forEach(el => {
        if (typeof el === 'string') {
          const parts = el.split(new RegExp(`\\b(${term})\\b`, 'gi'));
          parts.forEach((part, index) => {
            if (part.toLowerCase() === term.toLowerCase()) {
              nextElements.push(
                <button
                  key={`${term}-${index}`}
                  type="button"
                  onClick={() => setShowGlossary(true)}
                  className="text-soy-red font-bold underline hover:text-red-500 cursor-pointer inline p-0 bg-transparent border-0 font-mono text-[10px] select-text"
                  title={`Click to view ${term} in Glossary`}
                >
                  {part}
                </button>
              );
            } else {
              nextElements.push(part);
            }
          });
        } else {
          nextElements.push(el);
        }
      });
      elements = nextElements;
    });
    return elements;
  };

  return (
    <div className="flex flex-col h-full bg-[#17130f] text-soy-label select-none text-xs font-mono">
      {/* Title */}
      <div className="px-4 py-3 bg-[#100d0b] border-b border-[#3a3028]">
        <span className="text-[10px] font-black uppercase tracking-widest opacity-50">Sauce Judge Panel</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {/* Project Judgment Matrix */}
        <div className="bg-[#100d0b] border-2 border-soy-bottle p-4 rounded shadow-[3px_3px_0px_#000] relative overflow-hidden">
          <div className="flex flex-col gap-2 mb-4 border-b border-[#3a3028] pb-3">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black uppercase tracking-wider text-soy-label/50">Adoption Verdict</span>
              <span className="bg-soy-red text-white text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-sm">
                {verdict}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black uppercase tracking-wider text-soy-label/50">Trust Posture</span>
              <span className="bg-[#efe8dc] text-black border border-black text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-sm">
                {trustPosture}
              </span>
            </div>
          </div>

          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-4xl font-black text-soy-label tracking-tighter leading-none">{Math.round(score)}</span>
            <span className="text-xs text-soy-label/40 font-bold">/ 100</span>
            <span className="text-[10px] font-black uppercase tracking-widest text-soy-red ml-auto">
              ADOPTION: {score >= 85 ? 'EXCELLENT' : score >= 70 ? 'GOOD' : score >= 60 ? 'STABLE' : 'RISKY'}
            </span>
          </div>

          {/* Breakdown Pillars */}
          <div className="space-y-1.5 border-t border-[#3a3028] pt-3">
            <div className="flex justify-between items-center text-[9px] text-soy-label/60 font-bold uppercase mb-1">
              <span>Why This Score</span>
              <button
                type="button"
                onClick={onOpenTraceDrawer}
                className="text-soy-red hover:underline cursor-pointer lowercase italic"
              >
                [why this verdict? view trace]
              </button>
            </div>
            {[
              { name: 'Maintenance', val: Math.round(breakdown.maintenance), weight: 30, tab: 'commits' as EvidenceTabKey, reason: 'Inspecting commit cadence and developer activity logs.' },
              { name: 'Security', val: Math.round(breakdown.security), weight: 20, tab: 'security' as EvidenceTabKey, reason: 'Checking for automated scanners and vulnerability response policies.' },
              { name: 'Community', val: Math.round(breakdown.community), weight: 25, tab: 'dependencies' as EvidenceTabKey, reason: 'Evaluating total contributors and external dependencies.' },
              { name: 'Docs', val: Math.round(breakdown.documentation), weight: 15, tab: 'readme' as EvidenceTabKey, reason: 'Scanning README installation guides and project metadata.' },
              { name: 'Activity', val: Math.round(breakdown.activity), weight: 10, tab: 'commits' as EvidenceTabKey, reason: 'Analyzing code churn rates and release cycles.' },
            ].map((pillar) => (
              <button
                key={pillar.name}
                type="button"
                onClick={() => setFocus({ tab: pillar.tab, source: 'signal', reason: pillar.reason })}
                className="w-full flex justify-between items-center text-[10px] text-soy-label/80 hover:text-soy-red transition-all text-left py-0.5 cursor-pointer"
              >
                <span className="font-bold">{pillar.name}</span>
                <span className="font-mono text-soy-label/50">{pillar.val} <span className="opacity-40">/ 100 <span className="text-[8px]">({pillar.weight}%)</span></span></span>
              </button>
            ))}
          </div>
        </div>

        {/* Automerge Governor Card */}
        <div className="bg-[#100d0b] border-2 border-soy-bottle p-4 rounded shadow-[3px_3px_0px_#000] relative overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#3a3028] pb-2 mb-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[9px] font-black uppercase tracking-wider text-soy-label/50">Automerge Governor</span>
              <button
                type="button"
                id="export-policy-json-btn"
                onClick={handleExportPolicy}
                className="text-soy-red hover:underline text-[9px] cursor-pointer"
              >
                [Export JSON]
              </button>
              <button
                type="button"
                id="copy-policy-json-btn"
                onClick={handleCopyPolicyJson}
                className="text-soy-red hover:underline text-[9px] cursor-pointer"
              >
                {jsonCopied ? '[✓ Copied]' : '[📋 Copy JSON]'}
              </button>
              <button
                type="button"
                id="publish-live-policy-btn"
                onClick={handlePublishPolicy}
                className="text-soy-red hover:underline text-[9px] cursor-pointer"
              >
                [Publish]
              </button>
              {publishSuccess && (
                <span className="text-[8px] bg-green-900 text-green-300 px-1 border border-green-700 rounded animate-bounce">
                  PUBLISHED!
                </span>
              )}
            </div>
            <span className="text-[8px] px-1.5 py-0.5 bg-black border border-[#3a3028] text-soy-label/60 font-black rounded-sm">
              FIREWALL ACTIVE
            </span>
          </div>

          {/* Dependency Info */}
          <div className="flex justify-between items-start mb-3">
            <div>
              <div className="text-xs font-black text-soy-label uppercase">
                {depPackageName}
              </div>
              <div className="text-[10px] text-soy-label/50 font-bold mt-0.5">
                {depChangeType === 'major' ? '3.0.0 → 4.0.0' : depChangeType === 'minor' ? '4.17.0 → 4.18.0' : '4.17.21 → 4.17.22'} ({depChangeType})
              </div>
            </div>
            <div className="text-right">
              <span className="bg-[#1c120c] text-amber-500 border border-amber-500/30 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-sm">
                {automergeResult.tierName}
              </span>
            </div>
          </div>

          {/* Automerge Decision Badge */}
          <div className="mb-3">
            {(() => {
              const decision = automergeResult.decision;
              let badgeColorClass = "";
              if (decision.includes("ALLOWED")) {
                badgeColorClass = "text-emerald-500 border-emerald-500 bg-emerald-500/10";
              } else if (decision.includes("DELAYED")) {
                badgeColorClass = "text-amber-500 border-amber-500 bg-amber-500/10";
              } else if (decision.includes("NEEDS REVIEW")) {
                badgeColorClass = "text-sky-500 border-sky-500 bg-sky-500/10";
              } else {
                badgeColorClass = "text-rose-500 border-rose-500 bg-rose-500/10";
              }
              return (
                <div className={`border-2 px-3 py-1.5 text-center font-black uppercase tracking-widest rounded-sm ${badgeColorClass}`}>
                  {decision}
                </div>
              );
            })()}
          </div>

          {/* Behavior Diff */}
          <div className="space-y-1 mb-3">
            <div className="text-[9px] font-black text-soy-label/40 uppercase tracking-widest">Behavior Diff</div>
            <div className="space-y-0.5">
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-soy-label/70">Lifecycle scripts</span>
                <span className={depAddsLifecycleScript ? "text-rose-500 font-bold" : "text-emerald-500"}>
                  {depAddsLifecycleScript ? "⚠ Adds postinstall/preinstall" : "✓ None added"}
                </span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-soy-label/70">Native binary</span>
                <span className={depAddsNativeBinary ? "text-rose-500 font-bold" : "text-emerald-500"}>
                  {depAddsNativeBinary ? "⚠ Adds platform binary" : "✓ None added"}
                </span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-soy-label/70">Transitive deps</span>
                <span className={depNewTransitiveDepsCount > 10 ? "text-sky-500 font-bold" : "text-soy-label/50"}>
                  {depNewTransitiveDepsCount > 0 ? `+ ${depNewTransitiveDepsCount} new` : "None introduced"}
                </span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-soy-label/70">Publish age</span>
                <span className={depPublishAgeHours < 24 ? "text-amber-500 font-bold" : depPublishAgeHours < 72 ? "text-amber-500/80 font-bold" : "text-emerald-500"}>
                  {depPublishAgeHours} hours ago
                </span>
              </div>
            </div>
          </div>

          {/* Trust & Integrity Signals */}
          <div className="space-y-1 mb-3 border-t border-[#3a3028] pt-2">
            <div className="text-[9px] font-black text-soy-label/40 uppercase tracking-widest">Trust & Integrity</div>
            <div className="space-y-0.5">
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-soy-label/70">NPM Provenance</span>
                <span className={depProvenancePresent ? "text-emerald-500" : "text-amber-500"}>
                  {depProvenancePresent ? "✓ Present" : "⚠ Missing"}
                </span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-soy-label/70">Registry Signature</span>
                <span className={depRegistrySignatureVerified ? "text-emerald-500" : "text-rose-500 font-bold"}>
                  {depRegistrySignatureVerified ? "✓ Verified" : "✗ Verification failed"}
                </span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-soy-label/70">Maintainer Profile</span>
                <span className={depMaintainerIdentityStable ? "text-emerald-500" : "text-amber-500"}>
                  {depMaintainerIdentityStable ? "✓ Stable" : "⚠ Unstable / Unknown"}
                </span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-soy-label/70">Upstream SAST</span>
                <span className={depSastUpstream ? "text-emerald-500" : "text-soy-label/50"}>
                  {depSastUpstream ? "✓ Active" : "Missing / Unknown"}
                </span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-soy-label/70">Vulnerability Scan</span>
                <span className={depVulnerabilityAuditPass ? "text-emerald-500" : "text-rose-500 font-bold"}>
                  {depVulnerabilityAuditPass ? "✓ Clean (NPM audit)" : "✗ Vulnerable"}
                </span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-soy-label/70">CI Status</span>
                <span className={depCiPasses ? "text-emerald-500" : "text-rose-500 font-bold"}>
                  {depCiPasses ? "✓ Passing" : "✗ Failing checks"}
                </span>
              </div>
            </div>
          </div>

          {/* Action / Explanation */}
          <div className="border-t border-[#3a3028] pt-2 mt-2">
            {automergeResult.reasons && automergeResult.reasons.length > 0 && (
              <div className="mb-2 space-y-1">
                <span className="text-[8px] font-black uppercase text-soy-red tracking-wider">Gate Failures ({automergeResult.reasons.length})</span>
                <div className="space-y-1">
                  {automergeResult.reasons.map((r: any, idx: number) => (
                    <div key={idx} className="text-[9px] leading-normal flex items-start gap-1">
                      <span className={`font-black shrink-0 ${
                        r.severity === 'BLOCKED' ? 'text-rose-500' :
                        r.severity === 'NEEDS REVIEW' ? 'text-sky-500' : 'text-amber-500'
                      }`}>[{r.severity}]</span>
                      <span className="text-soy-label/80">{r.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="bg-[#100d0b] p-2 border border-[#3a3028] rounded-sm">
              <div className="text-[8px] font-black text-soy-label/40 uppercase tracking-widest">Recommended Action</div>
              <p className="text-[10px] text-soy-label font-bold leading-normal mt-0.5">
                {automergeResult.recommendedAction}
              </p>
            </div>
            {!simulatorActive && (
              <button
                type="button"
                onClick={() => {
                  setSimulatorActive(true);
                  setTimeout(() => {
                    const el = document.getElementById("trust-posture-simulator-section");
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                  }, 50);
                }}
                className="w-full text-soy-red hover:underline text-[9px] cursor-pointer mt-2 text-center font-bold"
              >
                [⚙ Simulate override settings for this governor below]
              </button>
            )}
          </div>
        </div>

        {/* Primary Risks */}
        <div className="space-y-2">
          <h3 className="text-[9px] font-black text-soy-red uppercase tracking-widest opacity-60">Primary Risks</h3>
          <div className="bg-[#100d0b] border border-[#3a3028] p-3 rounded space-y-2">
            {primaryRisks.map((risk, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setFocus({ tab: risk.tab, source: 'risk', reason: risk.reason })}
                className="w-full flex items-start gap-2 text-[10px] text-left text-soy-label/70 hover:text-soy-red transition-all cursor-pointer bg-transparent border-0 font-mono"
              >
                <AlertTriangle size={12} className="text-amber-500 shrink-0 mt-0.5" />
                <span className="leading-tight">{risk.text}</span>
              </button>
            ))}
          </div>
          {extensionExploitRisk && extensionExploitRisk.active && (
            <div className="bg-[#1c120c] border border-soy-red p-3 rounded space-y-2 mt-2">
              <h4 className="text-[9px] font-black text-soy-red uppercase tracking-widest flex items-center gap-1.5">
                <span>⚠ EXPLOIT RISK: {extensionExploitRisk.status}</span>
              </h4>
              <p className="text-[10px] text-soy-label/80 leading-normal font-sans">
                This project is a developer tool target (confidence: <span className="font-bold text-soy-red">{extensionExploitRisk.confidence}</span>) but lacks security automation:
              </p>
              <div className="space-y-1 pl-2 border-l border-soy-red/30">
                {extensionExploitRisk.reasons.map((r, idx) => (
                  <div key={idx} className="text-[9px] text-soy-label/70 leading-normal">
                    • {r.label}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Recommended Actions */}
        <div className="space-y-2">
          <h3 className="text-[9px] font-black text-soy-red uppercase tracking-widest opacity-60">Recommended Actions</h3>
          <div className="grid grid-cols-1 gap-1.5">
            {recommendedActions.map((action, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setFocus({ tab: action.tab, source: 'action', reason: action.reason });
                  action.onTrigger?.();
                }}
                className="w-full bg-[#100d0b] hover:bg-[#efe8dc]/5 border border-[#3a3028] py-2 rounded font-bold uppercase tracking-wider text-[10px] flex items-center justify-between px-3 cursor-pointer text-soy-label/80 text-left"
              >
                <span>{action.label}</span>
                <Play size={10} className="text-soy-red font-bold shrink-0 ml-2" />
              </button>
            ))}
          </div>
        </div>

        {/* Trust Posture Simulator */}
        <div className="space-y-2 border-t border-[#3a3028] pt-4" id="trust-posture-simulator-section">
          <div className="flex items-center justify-between">
            <h3 className="text-[9px] font-black text-soy-label/40 uppercase tracking-widest">
              Trust Posture Simulator
            </h3>
            <button
              type="button"
              onClick={() => setSimulatorActive(!simulatorActive)}
              className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-sm border transition-all cursor-pointer ${
                simulatorActive
                  ? 'bg-soy-red text-white border-soy-red font-black'
                  : 'bg-black text-soy-label/50 border-[#3a3028] hover:text-white'
              }`}
            >
              {simulatorActive ? 'ACTIVE' : 'OFF'}
            </button>
          </div>

          {simulatorActive && (
            <div className="bg-[#100d0b] border border-[#3a3028] p-3 rounded space-y-3">
              {/* Preset management */}
              <div className="flex flex-col gap-1 pb-2 border-b border-[#3a3028]/60">
                <div className="flex gap-2">
                  <button
                    type="button"
                    id="save-preset-btn"
                    onClick={handleSavePreset}
                    className="flex-1 bg-[#1c120c] hover:bg-soy-red hover:text-white border border-[#3a3028] py-1 rounded font-bold uppercase tracking-wider text-[9px] cursor-pointer text-center text-soy-label"
                  >
                    Save Preset
                  </button>
                  <button
                    type="button"
                    id="load-preset-btn"
                    onClick={handleLoadPreset}
                    disabled={!hasSavedPreset}
                    className={`flex-1 border py-1 rounded font-bold uppercase tracking-wider text-[9px] cursor-pointer text-center ${
                      hasSavedPreset
                        ? 'bg-[#1c120c] hover:bg-soy-red hover:text-white border-[#3a3028] text-soy-label'
                        : 'bg-black/40 border-black/20 text-soy-label/20 cursor-not-allowed'
                    }`}
                  >
                    Load Preset
                  </button>
                </div>
                {hasSavedPreset && (
                  <div className="text-[8px] font-bold uppercase tracking-widest text-right flex items-center justify-end gap-1 mt-0.5">
                    <span className="opacity-45">Active Preset:</span>
                    {isPresetModified ? (
                      <span className="text-amber-500 animate-pulse font-black">Modified ⚠</span>
                    ) : (
                      <span className="text-green-500 font-black">Synced ✓</span>
                    )}
                  </div>
                )}
              </div>

              {/* Apply Changes Button & Export JSON */}
              <div className="pb-2 border-b border-[#3a3028]/60 flex gap-2">
                <button
                  type="button"
                  id="apply-simulator-changes-btn"
                  onClick={handleApplyChanges}
                  disabled={!hasUnstagedChanges}
                  className={`flex-[2] py-2 rounded font-black uppercase tracking-wider text-[10px] text-center transition-all cursor-pointer ${
                    hasUnstagedChanges
                      ? 'bg-soy-red text-white border-black animate-pulse shadow-[2px_2px_0px_#000]'
                      : 'bg-black/40 border-black/20 text-soy-label/20 cursor-not-allowed'
                  }`}
                >
                  Apply Changes {hasUnstagedChanges ? `(${diffsCount} pending)` : ''}
                </button>
                <button
                  type="button"
                  id="simulator-export-policy-json-btn"
                  onClick={handleExportPolicy}
                  className="bg-[#1c120c] hover:bg-soy-red hover:text-white border border-[#3a3028] px-2 py-2 rounded font-bold uppercase tracking-wider text-[9px] cursor-pointer text-center text-soy-label flex-1"
                  title="Export current policy and simulated overrides to JSON file"
                >
                  Export JSON
                </button>
              </div>

              {/* Part 1: Adoption & Posture */}
              <div className="border-b border-[#3a3028]/60 pb-1 mb-1 text-[8px] font-black text-soy-label/40 uppercase tracking-wider">
                Adoption & Posture Overrides
              </div>

              <div className={`flex flex-col gap-0.5 p-1 rounded-sm border ${isDependabotOverride ? 'border-amber-600/40 bg-amber-600/5' : 'border-transparent'}`}>
                <label className="flex items-center gap-2 text-[10px] cursor-pointer text-soy-label/70 hover:text-white">
                  <input
                    type="checkbox"
                    checked={stagedHasDependabot}
                    onChange={(e) => setStagedHasDependabot(e.target.checked)}
                    className="accent-soy-red border-[#3a3028] bg-black rounded-sm"
                  />
                  <span>Add Dependabot scanning</span>
                  {isDependabotOverride && (
                    <span className="text-[7px] bg-amber-600 text-white font-sans px-1 rounded-sm uppercase tracking-wide font-black">
                      OVERRIDE
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleSimHelp('dependabot')}
                    className="text-soy-red hover:underline p-0.5 ml-auto flex items-center justify-center bg-transparent border-0 cursor-pointer"
                  >
                    <HelpCircle size={10} />
                  </button>
                </label>
                {renderSimHelpText('dependabot', 'Simulates adding Dependabot config. Standard configuration scans manifest file updates and reports known security vulnerabilities.')}
                <span className="text-[8px] text-soy-label/40 pl-6 leading-none">
                  (Enables automatic security alert tracking and update PRs)
                </span>
              </div>

              <div className={`flex flex-col gap-0.5 p-1 rounded-sm border ${isSastOverride ? 'border-amber-600/40 bg-amber-600/5' : 'border-transparent'}`}>
                <label className="flex items-center gap-2 text-[10px] cursor-pointer text-soy-label/70 hover:text-white">
                  <input
                    type="checkbox"
                    checked={stagedHasSast}
                    onChange={(e) => setStagedHasSast(e.target.checked)}
                    className="accent-soy-red border-[#3a3028] bg-black rounded-sm"
                  />
                  <span>Configure CodeQL/Semgrep SAST</span>
                  {isSastOverride && (
                    <span className="text-[7px] bg-amber-600 text-white font-sans px-1 rounded-sm uppercase tracking-wide font-black">
                      OVERRIDE
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleSimHelp('sast')}
                    className="text-soy-red hover:underline p-0.5 ml-auto flex items-center justify-center bg-transparent border-0 cursor-pointer"
                  >
                    <HelpCircle size={10} />
                  </button>
                </label>
                {renderSimHelpText('sast', 'Static Application Security Testing. Detects security issues like SQL Injection, path traversal, or hardcoded secrets in the source code.')}
                <span className="text-[8px] text-soy-label/40 pl-6 leading-none">
                  (Integrates automated static analysis scanning workflows)
                </span>
              </div>

              <div className={`flex flex-col gap-0.5 p-1 rounded-sm border ${isBusFactorOverride ? 'border-amber-600/40 bg-amber-600/5' : 'border-transparent'}`}>
                <label className="flex items-center gap-2 text-[10px] cursor-pointer text-soy-label/70 hover:text-white">
                  <input
                    type="checkbox"
                    checked={stagedBusFactorHealthy}
                    onChange={(e) => setStagedBusFactorHealthy(e.target.checked)}
                    className="accent-soy-red border-[#3a3028] bg-black rounded-sm"
                  />
                  <span>Expand maintainer base (multi-maintainer)</span>
                  {isBusFactorOverride && (
                    <span className="text-[7px] bg-amber-600 text-white font-sans px-1 rounded-sm uppercase tracking-wide font-black">
                      OVERRIDE
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleSimHelp('busFactor')}
                    className="text-soy-red hover:underline p-0.5 ml-auto flex items-center justify-center bg-transparent border-0 cursor-pointer"
                  >
                    <HelpCircle size={10} />
                  </button>
                </label>
                {renderSimHelpText('busFactor', 'Simulates adding multiple maintainers to mitigate operational bottlenecks if the primary maintainer goes inactive.')}
                <span className="text-[8px] text-soy-label/40 pl-6 leading-none">
                  (Clears single-maintainer bottleneck and abandonment caps)
                </span>
              </div>

              {/* Part 2: Dependency Automerge */}
              <div className="border-b border-[#3a3028]/60 pb-1 pt-2 text-[8px] font-black text-soy-label/40 uppercase tracking-wider">
                Dependency Update Overrides
              </div>

              <div className={`space-y-1 p-1 rounded-sm border ${isPackageOverride ? 'border-amber-600/40 bg-amber-600/5' : 'border-transparent'}`}>
                <div className="flex items-center justify-between">
                  <label className="text-[9px] text-soy-label/50 font-bold block">Package Name</label>
                  {isPackageOverride && <span className="text-[7px] bg-amber-600 text-white font-sans px-1 rounded-sm uppercase tracking-wide font-black">OVERRIDE</span>}
                  <button
                    type="button"
                    onClick={() => toggleSimHelp('packageName')}
                    className="text-soy-red hover:underline p-0.5 ml-auto flex items-center justify-center bg-transparent border-0 cursor-pointer"
                  >
                    <HelpCircle size={10} />
                  </button>
                </div>
                {renderSimHelpText('packageName', 'Specify the package name being updated to evaluate against custom organization-wide rule lists.')}
                <input
                  type="text"
                  value={stagedDepPackageName}
                  onChange={(e) => setStagedDepPackageName(e.target.value)}
                  className="w-full bg-black border border-[#3a3028] text-soy-label text-[10px] p-1.5 outline-none rounded focus:border-soy-red font-mono"
                  placeholder="e.g. lodash"
                />
              </div>

              <div className={`space-y-1 p-1 rounded-sm border ${isChangeTypeOverride ? 'border-amber-600/40 bg-amber-600/5' : 'border-transparent'}`}>
                <div className="flex items-center justify-between">
                  <label className="text-[9px] text-soy-label/50 font-bold block">Change Type</label>
                  {isChangeTypeOverride && <span className="text-[7px] bg-amber-600 text-white font-sans px-1 rounded-sm uppercase tracking-wide font-black">OVERRIDE</span>}
                  <button
                    type="button"
                    onClick={() => toggleSimHelp('changeType')}
                    className="text-soy-red hover:underline p-0.5 ml-auto flex items-center justify-center bg-transparent border-0 cursor-pointer"
                  >
                    <HelpCircle size={10} />
                  </button>
                </div>
                {renderSimHelpText('changeType', 'Major changes signify breaking API changes. The Automerge Governor blocks major auto-updates by default.')}
                <select
                  value={stagedDepChangeType}
                  onChange={(e) => setStagedDepChangeType(e.target.value as 'patch' | 'minor' | 'major')}
                  className="w-full bg-black border border-[#3a3028] text-soy-label text-[10px] p-1.5 outline-none rounded focus:border-soy-red font-mono cursor-pointer"
                >
                  <option value="patch">Patch update</option>
                  <option value="minor">Minor update</option>
                  <option value="major">Major update</option>
                </select>
              </div>

              <div className={`space-y-1 p-1 rounded-sm border ${isPublishAgeOverride ? 'border-amber-600/40 bg-amber-600/5' : 'border-transparent'}`}>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] text-soy-label/50 font-bold">Publish Age:</span>
                    <span className="text-white font-bold">{stagedDepPublishAgeHours} hours</span>
                  </div>
                  {isPublishAgeOverride && <span className="text-[7px] bg-amber-600 text-white font-sans px-1 rounded-sm uppercase tracking-wide font-black">OVERRIDE</span>}
                  <button
                    type="button"
                    onClick={() => toggleSimHelp('publishAge')}
                    className="text-soy-red hover:underline p-0.5 ml-auto flex items-center justify-center bg-transparent border-0 cursor-pointer"
                  >
                    <HelpCircle size={10} />
                  </button>
                </div>
                {renderSimHelpText('publishAge', 'Mitigates zero-day malware attacks. Releases under 24-72 hours are held back by the governor to allow community analysis.')}
                <input
                  type="range"
                  min="1"
                  max="120"
                  value={stagedDepPublishAgeHours}
                  onChange={(e) => setStagedDepPublishAgeHours(Number(e.target.value))}
                  className="w-full accent-soy-red bg-[#17130f] h-1 rounded cursor-pointer"
                />
              </div>

              <div className={`space-y-1 p-1 rounded-sm border ${isTransitiveOverride ? 'border-amber-600/40 bg-amber-600/5' : 'border-transparent'}`}>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] text-soy-label/50 font-bold">New Transitive Deps:</span>
                    <span className="text-white font-bold">{stagedDepNewTransitiveDepsCount} packages</span>
                  </div>
                  {isTransitiveOverride && <span className="text-[7px] bg-amber-600 text-white font-sans px-1 rounded-sm uppercase tracking-wide font-black">OVERRIDE</span>}
                  <button
                    type="button"
                    onClick={() => toggleSimHelp('transitiveDeps')}
                    className="text-soy-red hover:underline p-0.5 ml-auto flex items-center justify-center bg-transparent border-0 cursor-pointer"
                  >
                    <HelpCircle size={10} />
                  </button>
                </div>
                {renderSimHelpText('transitiveDeps', 'Recursively added dependencies. Introducing a high count of transitive dependencies raises audit complexity.')}
                <input
                  type="range"
                  min="0"
                  max="30"
                  value={stagedDepNewTransitiveDepsCount}
                  onChange={(e) => setStagedDepNewTransitiveDepsCount(Number(e.target.value))}
                  className="w-full accent-soy-red bg-[#17130f] h-1 rounded cursor-pointer"
                />
              </div>

              <div className={`space-y-1 p-1 rounded-sm border ${isLockfileOverride ? 'border-amber-600/40 bg-amber-600/5' : 'border-transparent'}`}>
                <div className="flex items-center justify-between">
                  <label className="text-[9px] text-soy-label/50 font-bold block">Lockfile Diff Size</label>
                  {isLockfileOverride && <span className="text-[7px] bg-amber-600 text-white font-sans px-1 rounded-sm uppercase tracking-wide font-black">OVERRIDE</span>}
                  <button
                    type="button"
                    onClick={() => toggleSimHelp('lockfileDiff')}
                    className="text-soy-red hover:underline p-0.5 ml-auto flex items-center justify-center bg-transparent border-0 cursor-pointer"
                  >
                    <HelpCircle size={10} />
                  </button>
                </div>
                {renderSimHelpText('lockfileDiff', 'Large changes in lockfiles can hide malicious dependencies or modified source lines.')}
                <select
                  value={stagedDepLockfileDiffSize}
                  onChange={(e) => setStagedDepLockfileDiffSize(e.target.value as 'small' | 'large')}
                  className="w-full bg-black border border-[#3a3028] text-soy-label text-[10px] p-1.5 outline-none rounded focus:border-soy-red font-mono cursor-pointer"
                >
                  <option value="small">Small lockfile diff</option>
                  <option value="large">Large lockfile diff</option>
                </select>
              </div>

              <div className="grid grid-cols-1 gap-1.5 pt-1">
                <div className={`flex flex-col gap-0.5 p-1 rounded-sm border ${isLifecycleOverride ? 'border-amber-600/40 bg-amber-600/5' : 'border-transparent'}`}>
                  <label className="flex items-center gap-2 text-[10px] cursor-pointer text-soy-label/70 hover:text-white">
                    <input
                      type="checkbox"
                      checked={stagedDepAddsLifecycleScript}
                      onChange={(e) => setStagedDepAddsLifecycleScript(e.target.checked)}
                      className="accent-soy-red border-[#3a3028] bg-black rounded-sm"
                    />
                    <span>Adds lifecycle script</span>
                    {isLifecycleOverride && <span className="text-[7px] bg-amber-600 text-white font-sans px-1 rounded-sm uppercase tracking-wide font-black">OVERRIDE</span>}
                    <button
                      type="button"
                      onClick={() => toggleSimHelp('lifecycleScript')}
                      className="text-soy-red hover:underline p-0.5 ml-auto flex items-center justify-center bg-transparent border-0 cursor-pointer"
                    >
                      <HelpCircle size={10} />
                    </button>
                  </label>
                  {renderSimHelpText('lifecycleScript', 'Scripts (e.g. postinstall) run automatically during npm installation. The governor blocks auto-updates with new lifecycle scripts.')}
                  <span className="text-[8px] text-soy-label/40 pl-6 leading-none">
                    (⚠ Scripts run on install — triggers immediate block firewall gate)
                  </span>
                </div>

                <div className={`flex flex-col gap-0.5 p-1 rounded-sm border ${isNativeOverride ? 'border-amber-600/40 bg-amber-600/5' : 'border-transparent'}`}>
                  <label className="flex items-center gap-2 text-[10px] cursor-pointer text-soy-label/70 hover:text-white">
                    <input
                      type="checkbox"
                      checked={stagedDepAddsNativeBinary}
                      onChange={(e) => setStagedDepAddsNativeBinary(e.target.checked)}
                      className="accent-soy-red border-[#3a3028] bg-black rounded-sm"
                    />
                    <span>Adds native binary</span>
                    {isNativeOverride && <span className="text-[7px] bg-amber-600 text-white font-sans px-1 rounded-sm uppercase tracking-wide font-black">OVERRIDE</span>}
                    <button
                      type="button"
                      onClick={() => toggleSimHelp('nativeBinary')}
                      className="text-soy-red hover:underline p-0.5 ml-auto flex items-center justify-center bg-transparent border-0 cursor-pointer"
                    >
                      <HelpCircle size={10} />
                    </button>
                  </label>
                  {renderSimHelpText('nativeBinary', 'Pre-compiled binaries can bypass source code auditing and present high exploit capability.')}
                  <span className="text-[8px] text-soy-label/40 pl-6 leading-none">
                    (⚠ Pre-compiled platform-specific machine code — high audit overhead)
                  </span>
                </div>

                <div className={`flex flex-col gap-0.5 p-1 rounded-sm border ${isProvenanceOverride ? 'border-amber-600/40 bg-amber-600/5' : 'border-transparent'}`}>
                  <label className="flex items-center gap-2 text-[10px] cursor-pointer text-soy-label/70 hover:text-white">
                    <input
                      type="checkbox"
                      checked={!stagedDepProvenancePresent}
                      onChange={(e) => setStagedDepProvenancePresent(!e.target.checked)}
                      className="accent-soy-red border-[#3a3028] bg-black rounded-sm"
                    />
                    <span>Missing NPM provenance</span>
                    {isProvenanceOverride && <span className="text-[7px] bg-amber-600 text-white font-sans px-1 rounded-sm uppercase tracking-wide font-black">OVERRIDE</span>}
                    <button
                      type="button"
                      onClick={() => toggleSimHelp('provenance')}
                      className="text-soy-red hover:underline p-0.5 ml-auto flex items-center justify-center bg-transparent border-0 cursor-pointer"
                    >
                      <HelpCircle size={10} />
                    </button>
                  </label>
                  {renderSimHelpText('provenance', 'Provenance links the published npm package cryptographically to its build workflow and source Git repository.')}
                  <span className="text-[8px] text-soy-label/40 pl-6 leading-none">
                    (⚠ Cryptographic proof linking the registry bundle to source git ref is missing)
                  </span>
                </div>

                <div className={`flex flex-col gap-0.5 p-1 rounded-sm border ${isSignatureOverride ? 'border-amber-600/40 bg-amber-600/5' : 'border-transparent'}`}>
                  <label className="flex items-center gap-2 text-[10px] cursor-pointer text-soy-label/70 hover:text-white">
                    <input
                      type="checkbox"
                      checked={!stagedDepRegistrySignatureVerified}
                      onChange={(e) => setStagedDepRegistrySignatureVerified(!e.target.checked)}
                      className="accent-soy-red border-[#3a3028] bg-black rounded-sm"
                    />
                    <span>Signature verification fails</span>
                    {isSignatureOverride && <span className="text-[7px] bg-amber-600 text-white font-sans px-1 rounded-sm uppercase tracking-wide font-black">OVERRIDE</span>}
                    <button
                      type="button"
                      onClick={() => toggleSimHelp('signature')}
                      className="text-soy-red hover:underline p-0.5 ml-auto flex items-center justify-center bg-transparent border-0 cursor-pointer"
                    >
                      <HelpCircle size={10} />
                    </button>
                  </label>
                  {renderSimHelpText('signature', 'Cryptographic package signatures verify that the registry package matches the publisher\'s key.')}
                  <span className="text-[8px] text-soy-label/40 pl-6 leading-none">
                    (✗ Package registry signature could not be verified by trust governors)
                  </span>
                </div>

                <div className={`flex flex-col gap-0.5 p-1 rounded-sm border ${isMaintainerOverride ? 'border-amber-600/40 bg-amber-600/5' : 'border-transparent'}`}>
                  <label className="flex items-center gap-2 text-[10px] cursor-pointer text-soy-label/70 hover:text-white">
                    <input
                      type="checkbox"
                      checked={!stagedDepMaintainerIdentityStable}
                      onChange={(e) => setStagedDepMaintainerIdentityStable(!e.target.checked)}
                      className="accent-soy-red border-[#3a3028] bg-black rounded-sm"
                    />
                    <span>Unstable maintainer profile</span>
                    {isMaintainerOverride && <span className="text-[7px] bg-amber-600 text-white font-sans px-1 rounded-sm uppercase tracking-wide font-black">OVERRIDE</span>}
                    <button
                      type="button"
                      onClick={() => toggleSimHelp('maintainerIdentity')}
                      className="text-soy-red hover:underline p-0.5 ml-auto flex items-center justify-center bg-transparent border-0 cursor-pointer"
                    >
                      <HelpCircle size={10} />
                    </button>
                  </label>
                  {renderSimHelpText('maintainerIdentity', 'Triggers alerts if the publishing developer account is new, has low activity, or lacks 2FA security settings.')}
                  <span className="text-[8px] text-soy-label/40 pl-6 leading-none">
                    (⚠ Newly added authors or accounts missing 2FA security status)
                  </span>
                </div>

                <div className={`flex flex-col gap-0.5 p-1 rounded-sm border ${isSastUpstreamOverride ? 'border-amber-600/40 bg-amber-600/5' : 'border-transparent'}`}>
                  <label className="flex items-center gap-2 text-[10px] cursor-pointer text-soy-label/70 hover:text-white">
                    <input
                      type="checkbox"
                      checked={!stagedDepSastUpstream}
                      onChange={(e) => setStagedDepSastUpstream(!e.target.checked)}
                      className="accent-soy-red border-[#3a3028] bg-black rounded-sm"
                    />
                    <span>No upstream SAST scanner</span>
                    {isSastUpstreamOverride && <span className="text-[7px] bg-amber-600 text-white font-sans px-1 rounded-sm uppercase tracking-wide font-black">OVERRIDE</span>}
                    <button
                      type="button"
                      onClick={() => toggleSimHelp('sastUpstream')}
                      className="text-soy-red hover:underline p-0.5 ml-auto flex items-center justify-center bg-transparent border-0 cursor-pointer"
                    >
                      <HelpCircle size={10} />
                    </button>
                  </label>
                  {renderSimHelpText('sastUpstream', 'Assesses whether the upstream package repository runs static analysis checks in its CI pipeline.')}
                  <span className="text-[8px] text-soy-label/40 pl-6 leading-none">
                    (⚠ Static application security auditing workflows not detected in source)
                  </span>
                </div>

                <div className={`flex flex-col gap-0.5 p-1 rounded-sm border ${isVulnerabilityOverride ? 'border-amber-600/40 bg-amber-600/5' : 'border-transparent'}`}>
                  <label className="flex items-center gap-2 text-[10px] cursor-pointer text-soy-label/70 hover:text-white">
                    <input
                      type="checkbox"
                      checked={!stagedDepVulnerabilityAuditPass}
                      onChange={(e) => setStagedDepVulnerabilityAuditPass(!e.target.checked)}
                      className="accent-soy-red border-[#3a3028] bg-black rounded-sm"
                    />
                    <span>Fails vulnerability audit</span>
                    {isVulnerabilityOverride && <span className="text-[7px] bg-amber-600 text-white font-sans px-1 rounded-sm uppercase tracking-wide font-black">OVERRIDE</span>}
                    <button
                      type="button"
                      onClick={() => toggleSimHelp('vulnerabilityScan')}
                      className="text-soy-red hover:underline p-0.5 ml-auto flex items-center justify-center bg-transparent border-0 cursor-pointer"
                    >
                      <HelpCircle size={10} />
                    </button>
                  </label>
                  {renderSimHelpText('vulnerabilityScan', 'Blocks auto-merging if the new package version has known CVE security advisory entries.')}
                  <span className="text-[8px] text-soy-label/40 pl-6 leading-none">
                    (✗ Known CVE advisory entries currently match the package version)
                  </span>
                </div>

                <div className={`flex flex-col gap-0.5 p-1 rounded-sm border ${isCiOverride ? 'border-amber-600/40 bg-amber-600/5' : 'border-transparent'}`}>
                  <label className="flex items-center gap-2 text-[10px] cursor-pointer text-soy-label/70 hover:text-white">
                    <input
                      type="checkbox"
                      checked={!stagedDepCiPasses}
                      onChange={(e) => setStagedDepCiPasses(!e.target.checked)}
                      className="accent-soy-red border-[#3a3028] bg-black rounded-sm"
                    />
                    <span>CI checks failing</span>
                    {isCiOverride && <span className="text-[7px] bg-amber-600 text-white font-sans px-1 rounded-sm uppercase tracking-wide font-black">OVERRIDE</span>}
                    <button
                      type="button"
                      onClick={() => toggleSimHelp('ciStatus')}
                      className="text-soy-red hover:underline p-0.5 ml-auto flex items-center justify-center bg-transparent border-0 cursor-pointer"
                    >
                      <HelpCircle size={10} />
                    </button>
                  </label>
                  {renderSimHelpText('ciStatus', 'Checks if automated test workflows pass successfully on the dependency version.')}
                  <span className="text-[8px] text-soy-label/40 pl-6 leading-none">
                    (✗ Source code build checks or regression testing suites are failing)
                  </span>
                </div>
              </div>

              {/* Apply Changes Button at bottom if unstaged exists */}
              {hasUnstagedChanges && (
                <button
                  type="button"
                  id="apply-simulator-changes-bottom-btn"
                  onClick={handleApplyChanges}
                  className="w-full py-2 bg-soy-red text-white border border-black animate-pulse shadow-[2px_2px_0px_#000] rounded font-black uppercase tracking-wider text-[10px] text-center transition-all cursor-pointer"
                >
                  Apply Simulator Changes ({diffsCount} pending)
                </button>
              )}
              
              <div className="text-[9px] text-soy-red font-black uppercase tracking-wider bg-soy-red/5 p-1.5 border border-soy-red/20 rounded-sm text-center">
                ⚠ Click 'Apply Simulator Changes' to update overall score & verdicts.
              </div>
            </div>
          )}
        </div>

        {/* AI Chat Widget */}
        <div className="space-y-2 border-t border-[#3a3028] pt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[9px] font-black text-soy-label/40 uppercase tracking-widest flex items-center gap-1.5">
              <span>Ask Sauce Auditor</span>
              <span className="w-1.5 h-1.5 bg-soy-red rounded-full animate-pulse" />
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                id="clear-chat-btn"
                onClick={handleClearChat}
                className="text-soy-red hover:underline text-[9px] cursor-pointer"
              >
                [Clear Chat]
              </button>
              <button
                type="button"
                id="glossary-help-btn"
                onClick={() => setShowGlossary(!showGlossary)}
                className="text-soy-red hover:underline text-[9px] cursor-pointer"
              >
                [?] Help Definitions
              </button>
            </div>
          </div>

          {showGlossary && (
            <div className="bg-[#100d0b] border border-[#3a3028] p-3 rounded space-y-2 text-[10px] leading-relaxed relative">
              <button
                type="button"
                onClick={() => setShowGlossary(false)}
                className="absolute top-1 right-2 text-soy-label/40 hover:text-white"
              >
                ✕
              </button>
              <div className="text-[9px] font-black text-soy-red uppercase tracking-wider mb-1">Glossary Helper</div>
              <div className="space-y-2 max-h-[160px] overflow-y-auto custom-scrollbar pr-1">
                <div>
                  <span className="font-bold text-white">Automerge Governor:</span> An automated firewall that determines whether direct dependencies can be safely auto-merged into the codebase based on strict security checks and publish parameters.
                </div>
                <div>
                  <span className="font-bold text-white">Bus Factor:</span> The number of key developers who would need to leave or become inactive before the project stalls. A low bus factor indicates high ownership concentration risk.
                </div>
                <div>
                  <span className="font-bold text-white">SAST Analysis:</span> Static Application Security Testing. Scans source code for potential vulnerabilities, hardcoded credentials, and formatting defects.
                </div>
                <div>
                  <span className="font-bold text-white">Dependabot:</span> An automated bot that scans the project's dependency manifest files and alerts developers to outdated packages or security vulnerability advisories.
                </div>
                <div>
                  <span className="font-bold text-white">Adoption Verdicts:</span> Recommended bands (like TRUSTED, STABLE, WATCHLIST, FORKABLE) indicating suitability for use in enterprise production environments.
                </div>
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="max-h-[140px] overflow-y-auto space-y-3 bg-[#100d0b]/40 p-2 border border-[#3a3028] rounded custom-scrollbar">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex flex-col text-[10px] ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`p-2 rounded max-w-[90%] leading-relaxed whitespace-pre-wrap font-mono ${
                  msg.sender === 'user'
                    ? 'bg-soy-red text-white'
                    : 'bg-[#100d0b] text-soy-label/85 border border-[#3a3028]'
                }`}>
                  {renderChatMessageText(msg.text)}
                  {msg.text.includes("```markdown") && (
                    <button
                      type="button"
                      onClick={() => {
                        const badgeMarkdown = `[![OpenSoyce Score](https://img.shields.io/badge/OpenSoyce-${score.toFixed(1)}%20%2F%2010.0-success)](https://opensoyce.com/lookup)`;
                        navigator.clipboard.writeText(badgeMarkdown);
                        alert("Badge Markdown copied to clipboard!");
                      }}
                      className="mt-1.5 px-2 py-0.5 bg-soy-red hover:bg-soy-red/80 text-white rounded font-sans font-bold text-[8px] uppercase cursor-pointer block"
                    >
                      Copy Badge Markdown 📋
                    </button>
                  )}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex gap-1 items-center p-2">
                <span className="w-1 h-1 bg-soy-red rounded-full animate-bounce" />
                <span className="w-1 h-1 bg-soy-red rounded-full animate-bounce delay-75" />
                <span className="w-1 h-1 bg-soy-red rounded-full animate-bounce delay-150" />
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick chips */}
          <div className="flex flex-wrap gap-1">
            {suggestions.map((sug) => (
              <button
                key={sug}
                type="button"
                onClick={() => handleSendMessage(sug)}
                className="flex items-center gap-1 px-1.5 py-0.5 text-[8px] bg-[#100d0b] border border-[#3a3028] hover:border-soy-red hover:text-white rounded text-soy-label/50 cursor-pointer"
              >
                <MessageSquare size={8} />
                <span>{sug}</span>
              </button>
            ))}
          </div>

          {/* Send Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (inputMessage.trim()) {
                handleSendMessage(inputMessage.trim());
                setInputMessage('');
              }
            }}
            className="flex gap-1"
          >
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Ask about score..."
              className="flex-1 bg-[#100d0b] text-soy-label text-[10px] p-2 outline-none border border-[#3a3028] rounded focus:border-soy-red font-mono"
            />
            <button
              type="submit"
              className="px-2.5 bg-soy-red hover:bg-soy-red/80 text-white rounded transition-all cursor-pointer flex items-center justify-center border-0"
            >
              <Send size={10} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
