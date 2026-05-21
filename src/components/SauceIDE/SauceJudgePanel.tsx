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

  const suggestions = ['Explain Security score', 'Show ownership risk', 'How to improve?'];

  return (
    <div className="flex flex-col h-full bg-[#17130f] text-soy-label select-none text-xs font-mono">
      {/* Title */}
      <div className="px-4 py-3 bg-[#100d0b] border-b border-[#3a3028]">
        <span className="text-[10px] font-black uppercase tracking-widest opacity-50">Sauce Judge Panel</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {/* Sauce Verdict Score Card */}
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
            <span className="text-xs font-black uppercase italic tracking-widest text-soy-red ml-auto">
              {score >= 8.5 ? 'EXCELLENT' : score >= 7.0 ? 'GOOD' : score >= 6.0 ? 'STABLE' : 'RISKY'}
            </span>
          </div>

          {/* Breakdown Pillars */}
          <div className="space-y-1.5 border-t border-[#3a3028] pt-3">
            <div className="flex justify-between text-[9px] text-soy-label/60 font-bold uppercase">
              <span>Why This Score</span>
              <span>Metric</span>
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
            <button
              onClick={() => {
                setFocus({ tab: 'security', source: 'action', reason: 'Action focus: Set up Dependabot scanning alerts.' });
                onActionTrigger('dependabot');
              }}
              className="w-full bg-[#100d0b] hover:bg-[#efe8dc]/5 border border-[#3a3028] py-2 rounded font-bold uppercase tracking-wider text-[10px] flex items-center justify-between px-3 cursor-pointer text-soy-label/80"
            >
              <span>Setup Dependabot</span>
              <Play size={10} className="text-soy-red" />
            </button>
            <button
              onClick={() => {
                setFocus({ tab: 'readme', source: 'action', reason: 'Action focus: Add OpenSoyce badge to repository README.' });
                onActionTrigger('badge');
              }}
              className="w-full bg-[#100d0b] hover:bg-[#efe8dc]/5 border border-[#3a3028] py-2 rounded font-bold uppercase tracking-wider text-[10px] flex items-center justify-between px-3 cursor-pointer text-soy-label/80"
            >
              <span>Claim Repository</span>
              <Play size={10} className="text-soy-red" />
            </button>
          </div>
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
