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

  // Stream initial judgment completed summary
  useEffect(() => {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const assessment =
      score >= 8
        ? 'Healthy code distribution, active release cadences, and standard license posture verify this as stable.'
        : score >= 6
        ? 'A stable repository. However, minor gaps like missing SECURITY policies or low automated scanners adjust the score.'
        : 'High risk detected. Low commit frequency, lack of package updates, and ownership concentration found.';

    const verdictText = `📢 **Verdict Summary**: Overall Score of **${score.toFixed(1)}/10.0**. ${assessment}`;
    streamResponse(verdictText);
  }, [owner, repo, score]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const streamResponse = (fullText: string) => {
    setIsTyping(true);
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setTimeout(() => {
      setIsTyping(false);
      const words = fullText.split(' ');
      let currentText = '';
      let index = 0;

      setMessages((prev) => [
        ...prev,
        {
          sender: 'agent',
          text: '',
          timestamp,
        },
      ]);

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
        }
      }, 30);
    }, 600);
  };

  const handleSendMessage = (textToSend: string) => {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages((prev) => [
      ...prev,
      {
        sender: 'user',
        text: textToSend,
        timestamp,
      },
    ]);

    const query = textToSend.toLowerCase();
    let reply = '';

    if (query.includes('security') || query.includes('dependabot') || query.includes('sast')) {
      reply = `🛡️ **Security Audit Details**:
* Dependabot: ${meta.hasDependabot ? '✓ CONFIGURED' : '✗ MISSING'}
* SAST analysis: ${meta.hasSast ? '✓ DETECTED' : '✗ NOT DETECTED'}
* Risks: ${meta.hasDependabot ? 'None detected.' : 'Vulnerable packages could go undetected without dependabot alerts.'}`;
    } else if (query.includes('risk') || query.includes('factor') || query.includes('bottleneck')) {
      reply = `⚠️ **Ownership & Risk Assessment**:
* Contributor count: ${meta.contributors} developers
* Bus Factor status: ${meta.busFactorHealthy ? '✓ HEALTHY' : '✗ BOTTLENECK RISK'}
* Impact: ${meta.busFactorHealthy ? 'Low operational risk.' : 'A single primary maintainer commits most of the code base.'}`;
    } else if (query.includes('action') || query.includes('improve')) {
      reply = `💡 **Improvement Actions**:
1. Setup Dependabot (click action below)
2. Deploy a SECURITY.md file
3. Claim repository to enable real-time scoring updates.`;
    } else {
      reply = `I am the **Sauce Judge AI**. Ask me about the repository's **security configuration**, **bus factor risk**, or **how to improve the overall score**!`;
    }

    streamResponse(reply);
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

  const suggestions = ['Explain Security score', 'Show ownership risk', 'How to improve?'];

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
            <span className="text-4xl font-black text-soy-label tracking-tighter leading-none">{score.toFixed(1)}</span>
            <span className="text-xs text-soy-label/40 font-bold">/ 10.0</span>
            <span className="text-[10px] font-black uppercase tracking-widest text-soy-red ml-auto">
              ADOPTION: {score >= 8.5 ? 'EXCELLENT' : score >= 7.0 ? 'GOOD' : score >= 6.0 ? 'STABLE' : 'RISKY'}
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
              { name: 'Maintenance', val: breakdown.maintenance.toFixed(1), max: '3.0', tab: 'commits' as EvidenceTabKey, reason: 'Inspecting commit cadence and developer activity logs.' },
              { name: 'Security', val: breakdown.security.toFixed(1), max: '2.0', tab: 'security' as EvidenceTabKey, reason: 'Checking for automated scanners and vulnerability response policies.' },
              { name: 'Community', val: breakdown.community.toFixed(1), max: '2.5', tab: 'dependencies' as EvidenceTabKey, reason: 'Evaluating total contributors and external dependencies.' },
              { name: 'Docs', val: breakdown.documentation.toFixed(1), max: '1.5', tab: 'readme' as EvidenceTabKey, reason: 'Scanning README installation guides and project metadata.' },
              { name: 'Activity', val: breakdown.activity.toFixed(1), max: '1.0', tab: 'commits' as EvidenceTabKey, reason: 'Analyzing code churn rates and release cycles.' },
            ].map((pillar) => (
              <button
                key={pillar.name}
                onClick={() => setFocus({ tab: pillar.tab, source: 'signal', reason: pillar.reason })}
                className="w-full flex justify-between items-center text-[10px] text-soy-label/80 hover:text-soy-red transition-all text-left py-0.5 cursor-pointer"
              >
                <span className="font-bold">{pillar.name}</span>
                <span className="font-mono text-soy-label/50">{pillar.val} <span className="opacity-40">/ {pillar.max}</span></span>
              </button>
            ))}
          </div>
        </div>

        {/* Automerge Governor Card */}
        <div className="bg-[#100d0b] border-2 border-soy-bottle p-4 rounded shadow-[3px_3px_0px_#000] relative overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#3a3028] pb-2 mb-3">
            <span className="text-[9px] font-black uppercase tracking-wider text-soy-label/50">Automerge Governor</span>
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
          </div>
        </div>

        {/* Primary Risks */}
        <div className="space-y-2">
          <h3 className="text-[9px] font-black text-soy-red uppercase tracking-widest opacity-60">Primary Risks</h3>
          <div className="bg-[#100d0b] border border-[#3a3028] p-3 rounded space-y-2">
            {primaryRisks.map((risk, idx) => (
              <button
                key={idx}
                onClick={() => setFocus({ tab: risk.tab, source: 'risk', reason: risk.reason })}
                className="w-full flex items-start gap-2 text-[10px] text-left text-soy-label/70 hover:text-soy-red transition-all cursor-pointer"
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
        <div className="space-y-2 border-t border-[#3a3028] pt-4">
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
              {/* Part 1: Adoption & Posture */}
              <div className="border-b border-[#3a3028]/60 pb-1 mb-1 text-[8px] font-black text-soy-label/40 uppercase tracking-wider">
                Adoption & Posture Overrides
              </div>

              <label className="flex items-center gap-2 text-[10px] cursor-pointer text-soy-label/70 hover:text-white">
                <input
                  type="checkbox"
                  checked={simHasDependabot}
                  onChange={(e) => setSimHasDependabot(e.target.checked)}
                  className="accent-soy-red border-[#3a3028] bg-black rounded-sm"
                />
                <span>Add Dependabot scanning</span>
              </label>

              <label className="flex items-center gap-2 text-[10px] cursor-pointer text-soy-label/70 hover:text-white">
                <input
                  type="checkbox"
                  checked={simHasSast}
                  onChange={(e) => setSimHasSast(e.target.checked)}
                  className="accent-soy-red border-[#3a3028] bg-black rounded-sm"
                />
                <span>Configure CodeQL/Semgrep SAST</span>
              </label>

              <label className="flex items-center gap-2 text-[10px] cursor-pointer text-soy-label/70 hover:text-white">
                <input
                  type="checkbox"
                  checked={simBusFactorHealthy}
                  onChange={(e) => setSimBusFactorHealthy(e.target.checked)}
                  className="accent-soy-red border-[#3a3028] bg-black rounded-sm"
                />
                <span>Expand maintainer base (multi-maintainer)</span>
              </label>

              {/* Part 2: Dependency Automerge */}
              <div className="border-b border-[#3a3028]/60 pb-1 pt-2 text-[8px] font-black text-soy-label/40 uppercase tracking-wider">
                Dependency Update Overrides
              </div>

              <div className="space-y-1">
                <label className="text-[9px] text-soy-label/50 font-bold block">Package Name</label>
                <input
                  type="text"
                  value={depPackageName}
                  onChange={(e) => setDepPackageName(e.target.value)}
                  className="w-full bg-black border border-[#3a3028] text-soy-label text-[10px] p-1.5 outline-none rounded focus:border-soy-red font-mono"
                  placeholder="e.g. lodash"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] text-soy-label/50 font-bold block">Change Type</label>
                <select
                  value={depChangeType}
                  onChange={(e) => setDepChangeType(e.target.value as 'patch' | 'minor' | 'major')}
                  className="w-full bg-black border border-[#3a3028] text-soy-label text-[10px] p-1.5 outline-none rounded focus:border-soy-red font-mono cursor-pointer"
                >
                  <option value="patch">Patch update</option>
                  <option value="minor">Minor update</option>
                  <option value="major">Major update</option>
                </select>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[9px] text-soy-label/50 font-bold">
                  <span>Publish Age</span>
                  <span>{depPublishAgeHours} hours</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="120"
                  value={depPublishAgeHours}
                  onChange={(e) => setDepPublishAgeHours(Number(e.target.value))}
                  className="w-full accent-soy-red bg-[#17130f] h-1 rounded cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[9px] text-soy-label/50 font-bold">
                  <span>New Transitive Deps</span>
                  <span>{depNewTransitiveDepsCount} packages</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="30"
                  value={depNewTransitiveDepsCount}
                  onChange={(e) => setDepNewTransitiveDepsCount(Number(e.target.value))}
                  className="w-full accent-soy-red bg-[#17130f] h-1 rounded cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] text-soy-label/50 font-bold block">Lockfile Diff Size</label>
                <select
                  value={depLockfileDiffSize}
                  onChange={(e) => setDepLockfileDiffSize(e.target.value as 'small' | 'large')}
                  className="w-full bg-black border border-[#3a3028] text-soy-label text-[10px] p-1.5 outline-none rounded focus:border-soy-red font-mono cursor-pointer"
                >
                  <option value="small">Small lockfile diff</option>
                  <option value="large">Large lockfile diff</option>
                </select>
              </div>

              <div className="grid grid-cols-1 gap-1.5 pt-1">
                <label className="flex items-center gap-2 text-[10px] cursor-pointer text-soy-label/70 hover:text-white">
                  <input
                    type="checkbox"
                    checked={depAddsLifecycleScript}
                    onChange={(e) => setDepAddsLifecycleScript(e.target.checked)}
                    className="accent-soy-red border-[#3a3028] bg-black rounded-sm"
                  />
                  <span>Adds lifecycle script</span>
                </label>

                <label className="flex items-center gap-2 text-[10px] cursor-pointer text-soy-label/70 hover:text-white">
                  <input
                    type="checkbox"
                    checked={depAddsNativeBinary}
                    onChange={(e) => setDepAddsNativeBinary(e.target.checked)}
                    className="accent-soy-red border-[#3a3028] bg-black rounded-sm"
                  />
                  <span>Adds native binary</span>
                </label>

                <label className="flex items-center gap-2 text-[10px] cursor-pointer text-soy-label/70 hover:text-white">
                  <input
                    type="checkbox"
                    checked={!depProvenancePresent}
                    onChange={(e) => setDepProvenancePresent(!e.target.checked)}
                    className="accent-soy-red border-[#3a3028] bg-black rounded-sm"
                  />
                  <span>Missing NPM provenance</span>
                </label>

                <label className="flex items-center gap-2 text-[10px] cursor-pointer text-soy-label/70 hover:text-white">
                  <input
                    type="checkbox"
                    checked={!depRegistrySignatureVerified}
                    onChange={(e) => setDepRegistrySignatureVerified(!e.target.checked)}
                    className="accent-soy-red border-[#3a3028] bg-black rounded-sm"
                  />
                  <span>Signature verification fails</span>
                </label>

                <label className="flex items-center gap-2 text-[10px] cursor-pointer text-soy-label/70 hover:text-white">
                  <input
                    type="checkbox"
                    checked={!depMaintainerIdentityStable}
                    onChange={(e) => setDepMaintainerIdentityStable(!e.target.checked)}
                    className="accent-soy-red border-[#3a3028] bg-black rounded-sm"
                  />
                  <span>Unstable maintainer profile</span>
                </label>

                <label className="flex items-center gap-2 text-[10px] cursor-pointer text-soy-label/70 hover:text-white">
                  <input
                    type="checkbox"
                    checked={!depSastUpstream}
                    onChange={(e) => setDepSastUpstream(!e.target.checked)}
                    className="accent-soy-red border-[#3a3028] bg-black rounded-sm"
                  />
                  <span>No upstream SAST scanner</span>
                </label>

                <label className="flex items-center gap-2 text-[10px] cursor-pointer text-soy-label/70 hover:text-white">
                  <input
                    type="checkbox"
                    checked={!depVulnerabilityAuditPass}
                    onChange={(e) => setDepVulnerabilityAuditPass(!e.target.checked)}
                    className="accent-soy-red border-[#3a3028] bg-black rounded-sm"
                  />
                  <span>Fails vulnerability audit</span>
                </label>

                <label className="flex items-center gap-2 text-[10px] cursor-pointer text-soy-label/70 hover:text-white">
                  <input
                    type="checkbox"
                    checked={!depCiPasses}
                    onChange={(e) => setDepCiPasses(!e.target.checked)}
                    className="accent-soy-red border-[#3a3028] bg-black rounded-sm"
                  />
                  <span>CI checks failing</span>
                </label>
              </div>
              
              <div className="text-[9px] text-soy-red font-black uppercase tracking-wider bg-soy-red/5 p-1.5 border border-soy-red/20 rounded-sm">
                ⚠ Simulator mode overrides score & governor in real-time.
              </div>
            </div>
          )}
        </div>

        {/* AI Chat Widget */}
        <div className="space-y-2 border-t border-[#3a3028] pt-4">
          <h3 className="text-[9px] font-black text-soy-label/40 uppercase tracking-widest flex items-center gap-1.5">
            <span>Ask Sauce Auditor</span>
            <span className="w-1.5 h-1.5 bg-soy-red rounded-full animate-pulse" />
          </h3>

          {/* Messages */}
          <div className="max-h-[140px] overflow-y-auto space-y-3 bg-[#100d0b]/40 p-2 border border-[#3a3028] rounded custom-scrollbar">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex flex-col text-[10px] ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`p-2 rounded max-w-[90%] leading-relaxed whitespace-pre-wrap font-mono ${
                  msg.sender === 'user'
                    ? 'bg-soy-red text-white'
                    : 'bg-[#100d0b] text-soy-label/85 border border-[#3a3028]'
                }`}>
                  {msg.text}
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
              className="px-2.5 bg-soy-red hover:bg-soy-red/80 text-white rounded transition-all cursor-pointer flex items-center justify-center"
            >
              <Send size={10} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
