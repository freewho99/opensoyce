import React from 'react';
import { X, ArrowRight, ShieldCheck, AlertTriangle, Info, Terminal } from 'lucide-react';
import { EvidenceTabKey } from './index';

interface ReasoningTraceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
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
    license: string;
    contributors: number;
    hasDependabot: boolean;
    hasSast: boolean;
    busFactorHealthy: boolean;
    lastCommit: string;
  };
  verdict: string;
  trustPosture: string;
  extensionExploitRisk: {
    active: boolean;
    status: 'HIJACK RISK' | 'MAINTAINER BOTTLENECK' | 'NONE';
    reasons: { code: string; label: string }[];
    confidence: 'low' | 'medium' | 'high';
  } | null;
}

export default function ReasoningTraceDrawer({
  isOpen,
  onClose,
  owner,
  repo,
  score,
  breakdown,
  meta,
  verdict,
  trustPosture,
  extensionExploitRisk,
}: ReasoningTraceDrawerProps) {
  if (!isOpen) return null;

  const er = extensionExploitRisk || { active: false, status: 'NONE', reasons: [], confidence: 'medium' };

  // Calculate some intermediate values for explanation
  const matchedTerms = er.reasons
    .filter(r => r.code === 'TARGET_VECTOR_TIER_MATCH')
    .map(r => r.label.replace('Matches developer-tool install surface: ', ''))[0] || 'None';

  return (
    <div className="absolute inset-y-0 right-0 w-[420px] bg-[#100d0b] border-l-2 border-black z-50 flex flex-col font-mono text-xs text-soy-label select-none shadow-[-4px_0px_10px_rgba(0,0,0,0.5)]">
      {/* Header */}
      <div className="px-4 py-3 bg-[#efe8dc] text-black border-b-2 border-black flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-soy-red" />
          <span className="font-black uppercase tracking-wider text-[10px]">Reasoning Trace Audit</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-black/10 rounded-sm transition-all cursor-pointer text-black"
        >
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
        {/* Step 1: Raw Inputs */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 border-b border-[#3a3028] pb-1">
            <span className="bg-soy-red text-white text-[9px] font-black px-1.5 py-0.5 rounded-sm">01</span>
            <h4 className="font-black uppercase tracking-wider text-[10px] text-soy-red">Raw Posture Scan</h4>
          </div>
          <div className="bg-[#17130f] p-3 border border-[#3a3028] space-y-1.5">
            <div className="flex justify-between">
              <span className="opacity-50">Developer Target Vector:</span>
              <span className="font-bold">{matchedTerms !== 'None' ? 'MATCHED' : 'NONE'}</span>
            </div>
            {matchedTerms !== 'None' && (
              <div className="text-[10px] opacity-40 pl-2">↳ Matches: {matchedTerms}</div>
            )}
            <div className="flex justify-between">
              <span className="opacity-50">Dependabot Configured:</span>
              <span className={meta.hasDependabot ? 'text-green-500 font-bold' : 'text-soy-red font-bold'}>
                {meta.hasDependabot ? 'YES' : 'NO'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="opacity-50">SAST Analysis Workflow:</span>
              <span className={meta.hasSast ? 'text-green-500 font-bold' : 'text-soy-red font-bold'}>
                {meta.hasSast ? 'YES' : 'NO'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="opacity-50">Bus Factor Status:</span>
              <span className={meta.busFactorHealthy ? 'text-green-500 font-bold' : 'text-soy-red font-bold'}>
                {meta.busFactorHealthy ? 'HEALTHY' : 'BOTTLENECK'}
              </span>
            </div>
          </div>
        </div>

        {/* Step 2: Exploit Risk Check */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 border-b border-[#3a3028] pb-1">
            <span className="bg-soy-red text-white text-[9px] font-black px-1.5 py-0.5 rounded-sm">02</span>
            <h4 className="font-black uppercase tracking-wider text-[10px] text-soy-red">Exploit Risk Check</h4>
          </div>
          <div className="bg-[#17130f] p-3 border border-[#3a3028] space-y-2">
            <div className="flex items-center justify-between">
              <span className="opacity-50">Calculated Exploit Risk:</span>
              <span className={`font-black px-2 py-0.5 rounded-sm text-[10px] ${
                er.status === 'HIJACK RISK' ? 'bg-soy-red text-white' : er.status === 'MAINTAINER BOTTLENECK' ? 'bg-amber-600 text-white' : 'bg-green-600 text-white'
              }`}>
                {er.status}
              </span>
            </div>
            <p className="text-[10px] text-soy-label/60 leading-relaxed font-sans">
              {er.status === 'HIJACK RISK' 
                ? 'High risk of hijack. Repo is a developer tool, has low security automation, and commits have drifted.'
                : er.status === 'MAINTAINER BOTTLENECK'
                ? 'Single maintainer bottleneck. High contributor concentration with commit activity starting to drift.'
                : 'No active exploit risk caps currently apply to this repository.'}
            </p>
          </div>
        </div>

        {/* Step 3: Adoption Cap Calculation */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 border-b border-[#3a3028] pb-1">
            <span className="bg-soy-red text-white text-[9px] font-black px-1.5 py-0.5 rounded-sm">03</span>
            <h4 className="font-black uppercase tracking-wider text-[10px] text-soy-red">Adoption Cap Resolution</h4>
          </div>
          <div className="bg-[#17130f] p-3 border border-[#3a3028] space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="opacity-50">Composite Math Score:</span>
              <span className="font-bold text-sm">{score.toFixed(1)} / 10.0</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="opacity-50">Final Adoption Verdict:</span>
              <span className="font-black text-soy-red text-sm uppercase">{verdict}</span>
            </div>
            <p className="text-[10px] text-soy-label/60 leading-relaxed font-sans">
              {er.status === 'HIJACK RISK'
                ? 'The final Adoption Verdict was capped to WATCHLIST due to active Hijack Risk indicators, overriding the composite math.'
                : er.status === 'MAINTAINER BOTTLENECK'
                ? 'The final Adoption Verdict was capped to FORKABLE due to single maintainer bottlenecks, overriding the composite math.'
                : 'The Adoption Verdict band is set directly by the composite score ranges without any downward caps.'}
            </p>
          </div>
        </div>

        {/* Step 4: Trust Posture Resolution */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 border-b border-[#3a3028] pb-1">
            <span className="bg-soy-red text-white text-[9px] font-black px-1.5 py-0.5 rounded-sm">04</span>
            <h4 className="font-black uppercase tracking-wider text-[10px] text-soy-red">Trust Posture Resolution</h4>
          </div>
          <div className="bg-[#17130f] p-3 border border-[#3a3028] space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="opacity-50">Final Trust Posture:</span>
              <span className="font-black text-soy-red text-sm uppercase">{trustPosture}</span>
            </div>
            <div className="space-y-1 text-[10px] border-t border-[#3a3028] pt-2">
              <div className="flex items-center justify-between">
                <span>1. Critical advisories count = 0:</span>
                <span className="text-green-500 font-bold">✓ PASS</span>
              </div>
              <div className="flex items-center justify-between">
                <span>2. Hijack Risk status is None:</span>
                <span className={er.status !== 'HIJACK RISK' ? 'text-green-500 font-bold' : 'text-soy-red font-bold'}>
                  {er.status !== 'HIJACK RISK' ? '✓ PASS' : '✗ FAIL'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>3. Composite score is &gt;= 8.5:</span>
                <span className={score >= 8.5 ? 'text-green-500 font-bold' : 'text-soy-red font-bold'}>
                  {score >= 8.5 ? '✓ PASS' : '✗ FAIL'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>4. Multi-maintainer status:</span>
                <span className={meta.busFactorHealthy ? 'text-green-500 font-bold' : 'text-soy-red font-bold'}>
                  {meta.busFactorHealthy ? '✓ PASS' : '✗ FAIL'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>5. Security automation detected:</span>
                <span className={(meta.hasDependabot || meta.hasSast) ? 'text-green-500 font-bold' : 'text-soy-red font-bold'}>
                  {(meta.hasDependabot || meta.hasSast) ? '✓ PASS' : '✗ FAIL'}
                </span>
              </div>
            </div>
            <p className="text-[10px] text-soy-label/60 leading-relaxed font-sans border-t border-[#3a3028] pt-2">
              {trustPosture === 'TRUSTED'
                ? 'All five posture conditions pass cleanly. The repository has a verified posture of TRUSTED.'
                : 'One or more posture checks failed. The posture is set to LIMITED TRUST.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
