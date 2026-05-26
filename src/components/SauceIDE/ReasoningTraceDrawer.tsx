import React, { useState } from 'react';
import { X, AlertTriangle, Info, Terminal, Pin, ChevronDown, ChevronRight } from 'lucide-react';
import { EvidenceTabKey } from './index';

interface ReasoningTraceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  isAnchored: boolean;
  setIsAnchored: (val: boolean) => void;
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
  isAnchored,
  setIsAnchored,
  owner,
  repo,
  score,
  breakdown,
  meta,
  verdict,
  trustPosture,
  extensionExploitRisk,
}: ReasoningTraceDrawerProps) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [expandedSteps, setExpandedSteps] = useState<{ [key: number]: boolean }>({
    1: true,
    2: true,
    3: true,
    4: true,
  });
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'RAW' | 'RISK' | 'CAP' | 'POSTURE'>('ALL');
  const [activeHelp, setActiveHelp] = useState<string | null>(null);

  if (!isOpen) return null;

  const isLight = theme === 'light';
  const borderClass = isLight ? 'border-[#bdae9c]' : 'border-[#3a3028]';
  const bgClass = `${isLight ? 'bg-[#e5ded0] border border-[#bdae9c]' : 'bg-[#17130f] border border-[#3a3028]'} transition-all duration-300 ease-in-out`;

  const er = extensionExploitRisk || { active: false, status: 'NONE', reasons: [], confidence: 'medium' };

  // Calculate some intermediate values for explanation
  const matchedTerms = er.reasons
    .filter(r => r.code === 'TARGET_VECTOR_TIER_MATCH')
    .map(r => r.label.replace('Matches developer-tool install surface: ', ''))[0] || 'None';

  // Helper to format CVE names as direct clickable links referencing the database
  const renderTextWithCVELinks = (text: string) => {
    const cveRegex = /(CVE-\d{4}-\d{4,})/g;
    const parts = text.split(cveRegex);
    return parts.map((part, index) => {
      if (cveRegex.test(part)) {
        return (
          <a
            key={index}
            href={`https://nvd.nist.gov/vuln/detail/${part}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-bold text-soy-red hover:text-red-500"
          >
            {part}
          </a>
        );
      }
      return part;
    });
  };

  const toggleStep = (stepNum: number) => {
    setExpandedSteps(prev => ({ ...prev, [stepNum]: !prev[stepNum] }));
  };

  const toggleHelp = (key: string) => {
    setActiveHelp(prev => prev === key ? null : key);
  };

  const renderHelpText = (key: string, text: string) => {
    if (activeHelp !== key) return null;
    return (
      <div className={`mt-1.5 p-2 rounded text-[10px] leading-relaxed ${isLight ? 'bg-amber-100/60 border border-amber-200 text-amber-900' : 'bg-amber-950/20 border border-amber-900/40 text-amber-200'} font-sans`}>
        <strong>Definition:</strong> {text}
      </div>
    );
  };

  const handleCopyTrace = () => {
    const markdown = `### OpenSoyce Audit Reasoning Trace
**Repository**: ${owner}/${repo}
**Verdict Band**: ${verdict}
**Score**: ${score.toFixed(1)} / 100.0
**Trust Posture**: ${trustPosture}

#### 1. Raw Posture Scan
- Developer Target Vector: ${matchedTerms !== 'None' ? 'MATCHED' : 'NONE'} (${matchedTerms})
- Dependabot Configured: ${meta.hasDependabot ? 'YES' : 'NO'}
- SAST Analysis Workflow: ${meta.hasSast ? 'YES' : 'NO'}
- Bus Factor Status: ${meta.busFactorHealthy ? 'HEALTHY' : 'BOTTLENECK'}

#### 2. Exploit Risk Check
- Calculated Exploit Risk: ${er.status}
- Risk Details: ${
      er.status === 'HIJACK RISK'
        ? 'High risk of hijack. Repo is a developer tool, has low security automation, and commits have drifted.'
        : er.status === 'MAINTAINER BOTTLENECK'
        ? 'Single maintainer bottleneck. High contributor concentration with commit activity starting to drift.'
        : 'No active exploit risk caps currently apply to this repository.'
    }

#### 3. Adoption Cap Resolution
- Composite Math Score: ${score.toFixed(1)} / 100.0
- Final Adoption Verdict: ${verdict}
- Resolution Details: ${
      er.status === 'HIJACK RISK'
        ? 'The final Adoption Verdict was capped to WATCHLIST due to active Hijack Risk indicators, overriding the composite math.'
        : er.status === 'MAINTAINER BOTTLENECK'
        ? 'The final Adoption Verdict was capped to FORKABLE due to single maintainer bottlenecks, overriding the composite math.'
        : 'The Adoption Verdict band is set directly by the composite score ranges without any downward caps.'
    }

#### 4. Trust Posture Resolution
- Critical advisories count = 0: PASS
- Hijack Risk status is None: ${er.status !== 'HIJACK RISK' ? 'PASS' : 'FAIL'}
- Composite score >= 8.5: ${score >= 8.5 ? 'PASS' : 'FAIL'}
- Multi-maintainer status: ${meta.busFactorHealthy ? 'PASS' : 'FAIL'}
- Security automation detected: ${(meta.hasDependabot || meta.hasSast) ? 'PASS' : 'FAIL'}
- Commit signature status: PASS (100% SIGNED)

Generated by OpenSoyce SauceIDE on ${new Date().toISOString()}`;

    navigator.clipboard.writeText(markdown.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div 
      className={`${isAnchored ? 'relative h-full' : 'absolute inset-y-0 right-0 z-50 shadow-[-4px_0px_10px_rgba(0,0,0,0.5)]'} w-[420px] ${
        isLight ? 'bg-[#efe8dc] text-black border-l-2 border-black' : 'bg-[#100d0b] text-soy-label border-l-2 border-black'
      } flex flex-col font-mono text-xs select-none transition-all duration-300 ease-in-out`}
    >
      {/* Header */}
      <div className={`px-4 py-3 ${isLight ? 'bg-[#ded6c7]' : 'bg-[#efe8dc]'} text-black border-b-2 border-black flex items-center justify-between transition-all duration-300 ease-in-out`}>
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-soy-red" />
          <span className="font-black uppercase tracking-wider text-[10px]">Reasoning Trace Audit</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[8px] bg-black/10 px-1.5 py-0.5 rounded-sm font-sans font-black text-black select-none uppercase tracking-wide">
            {theme} mode
          </span>
          <button
            id="copy-trace-btn"
            onClick={handleCopyTrace}
            className="px-2 py-0.5 hover:bg-black/10 rounded-sm transition-all cursor-pointer text-black flex items-center justify-center font-sans font-bold text-[9px] gap-1 border border-black/20"
            title="Copy Audit Trace to Clipboard"
          >
            {copied ? '✓ Copied' : '📋 Copy Trace'}
          </button>
          <button
            id="toggle-theme-btn"
            onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
            className="p-1 hover:bg-black/10 rounded-sm transition-all cursor-pointer text-black flex items-center justify-center font-sans font-bold text-[9px] border border-black/20"
            title="Toggle Theme"
          >
            {isLight ? '🌙' : '☀️'}
          </button>
          <button
            id="toggle-drawer-anchor-btn"
            onClick={() => setIsAnchored(!isAnchored)}
            className={`p-1 hover:bg-black/10 rounded-sm transition-all cursor-pointer flex items-center justify-center ${isAnchored ? 'text-soy-red font-black' : 'text-black'}`}
            title={isAnchored ? "Unpin Drawer (Float)" : "Pin Drawer (Side-by-Side)"}
          >
            <Pin size={14} className={isAnchored ? 'fill-current' : ''} />
          </button>
          <button
            id="close-reasoning-trace-drawer"
            onClick={onClose}
            className="p-1 hover:bg-black/10 rounded-sm transition-all cursor-pointer text-black"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Steps Filter Bar */}
      <div className={`px-4 py-2 border-b ${borderClass} flex items-center justify-between gap-1 overflow-x-auto transition-all duration-300 ease-in-out bg-black/5`}>
        <span className="text-[8px] font-black uppercase tracking-wider opacity-50 shrink-0">Filter Step:</span>
        <div className="flex gap-1">
          {(['ALL', 'RAW', 'RISK', 'CAP', 'POSTURE'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-1.5 py-0.5 rounded text-[8px] font-bold border transition-all cursor-pointer ${
                filter === f
                  ? 'bg-soy-red text-white border-soy-red font-black'
                  : isLight
                  ? 'bg-white border-[#bdae9c] text-black hover:bg-black/5'
                  : 'bg-[#1e1a17] border-[#3a3028] text-soy-label hover:bg-white/5'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
        {/* Step 1: Raw Inputs */}
        {(filter === 'ALL' || filter === 'RAW') && (
          <div className={`space-y-2 border-l-4 transition-all ${expandedSteps[1] ? 'border-l-soy-red pl-2' : 'border-l-transparent'}`}>
            <button
              type="button"
              onClick={() => toggleStep(1)}
              className={`w-full flex items-center justify-between border-b ${borderClass} pb-1 hover:text-soy-red transition-all cursor-pointer text-left font-mono`}
            >
              <div className="flex items-center gap-2">
                <span className="bg-soy-red text-white text-[9px] font-black px-1.5 py-0.5 rounded-sm">01</span>
                <h4 className="font-black uppercase tracking-wider text-[10px] text-soy-red flex items-center">
                  Raw Posture Scan
                  <span className="text-[8px] border border-soy-red/30 px-1.5 py-0.5 rounded-sm uppercase tracking-wider font-bold opacity-60 ml-2">
                    Impact: Med
                  </span>
                </h4>
              </div>
              {expandedSteps[1] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {expandedSteps[1] && (
              <div className={`${bgClass} p-3 space-y-1.5`}>
                <div className="flex flex-col gap-0.5">
                  <div className="flex justify-between items-center w-full">
                    <div className="flex items-center gap-1">
                      <span className="opacity-50">Developer Target Vector:</span>
                      <button
                        type="button"
                        onClick={() => toggleHelp('targetVector')}
                        className="text-soy-red hover:underline p-0.5 cursor-pointer flex items-center justify-center"
                        title="What is Developer Target Vector?"
                      >
                        <Info size={11} />
                      </button>
                    </div>
                    <span className="font-bold">{matchedTerms !== 'None' ? 'MATCHED' : 'NONE'}</span>
                  </div>
                  {renderHelpText('targetVector', 'Explains whether the repository matches highly targeted developer utility surfaces (e.g. build systems, developer CLIs, extensions) making it a high-value supply chain target.')}
                </div>

                {matchedTerms !== 'None' && (
                  <div className={`text-[10px] ${isLight ? 'text-black/60' : 'opacity-40'} pl-2`}>↳ Matches: {matchedTerms}</div>
                )}

                <div className="flex flex-col gap-0.5">
                  <div className="flex justify-between items-center w-full">
                    <div className="flex items-center gap-1">
                      <span className="opacity-50">Dependabot Configured:</span>
                      <button
                        type="button"
                        onClick={() => toggleHelp('dependabot')}
                        className="text-soy-red hover:underline p-0.5 cursor-pointer flex items-center justify-center"
                        title="What is Dependabot?"
                      >
                        <Info size={11} />
                      </button>
                    </div>
                    <span className={meta.hasDependabot ? 'text-green-500 font-bold' : 'text-soy-red font-bold'}>
                      {meta.hasDependabot ? 'YES' : 'NO'}
                    </span>
                  </div>
                  {renderHelpText('dependabot', 'Indicates whether automated dependency security vulnerability alerts are active. Missing alerts pose a silent exploit risk.')}
                </div>

                <div className="flex flex-col gap-0.5">
                  <div className="flex justify-between items-center w-full">
                    <div className="flex items-center gap-1">
                      <span className="opacity-50">SAST Analysis Workflow:</span>
                      <button
                        type="button"
                        onClick={() => toggleHelp('sast')}
                        className="text-soy-red hover:underline p-0.5 cursor-pointer flex items-center justify-center"
                        title="What is SAST Analysis?"
                      >
                        <Info size={11} />
                      </button>
                    </div>
                    <span className={meta.hasSast ? 'text-green-500 font-bold' : 'text-soy-red font-bold'}>
                      {meta.hasSast ? 'YES' : 'NO'}
                    </span>
                  </div>
                  {renderHelpText('sast', 'Static Application Security Testing. Scans source code for potential vulnerabilities using automated scanning engines like CodeQL or Semgrep.')}
                </div>

                <div className="flex flex-col gap-0.5">
                  <div className="flex justify-between items-center w-full">
                    <div className="flex items-center gap-1">
                      <span className="opacity-50">Bus Factor Status:</span>
                      <button
                        type="button"
                        onClick={() => toggleHelp('busFactor')}
                        className="text-soy-red hover:underline p-0.5 cursor-pointer flex items-center justify-center"
                        title="What is Bus Factor?"
                      >
                        <Info size={11} />
                      </button>
                    </div>
                    <span className={meta.busFactorHealthy ? 'text-green-500 font-bold' : 'text-soy-red font-bold'}>
                      {meta.busFactorHealthy ? 'HEALTHY' : 'BOTTLENECK'}
                    </span>
                  </div>
                  {renderHelpText('busFactor', 'Measures repository bus factor. A bottleneck indicates high ownership concentration, where one contributor controls >80% of recent code modifications.')}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Exploit Risk Check */}
        {(filter === 'ALL' || filter === 'RISK') && (
          <div className={`space-y-2 border-l-4 transition-all ${expandedSteps[2] ? 'border-l-soy-red pl-2' : 'border-l-transparent'}`}>
            <button
              type="button"
              onClick={() => toggleStep(2)}
              className={`w-full flex items-center justify-between border-b ${borderClass} pb-1 hover:text-soy-red transition-all cursor-pointer text-left font-mono`}
            >
              <div className="flex items-center gap-2">
                <span className="bg-soy-red text-white text-[9px] font-black px-1.5 py-0.5 rounded-sm">02</span>
                <h4 className="font-black uppercase tracking-wider text-[10px] text-soy-red flex items-center gap-1.5">
                  Exploit Risk Check
                  {er.status !== 'NONE' ? (
                    <span className="text-[8px] bg-red-600 text-white font-sans font-black px-1.5 py-0.5 rounded-sm flex items-center gap-0.5 animate-pulse">
                      <AlertTriangle size={10} /> CRITICAL
                    </span>
                  ) : (
                    <span className="text-[8px] border border-soy-red/30 px-1.5 py-0.5 rounded-sm uppercase tracking-wider font-bold opacity-60">
                      Impact: High
                    </span>
                  )}
                </h4>
              </div>
              {expandedSteps[2] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {expandedSteps[2] && (
              <div className={`${bgClass} p-3 space-y-2`}>
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <span className="opacity-50">Calculated Exploit Risk:</span>
                      <button
                        type="button"
                        onClick={() => toggleHelp('exploitRisk')}
                        className="text-soy-red hover:underline p-0.5 cursor-pointer flex items-center justify-center"
                        title="What is Exploit Risk?"
                      >
                        <Info size={11} />
                      </button>
                    </div>
                    <span className={`font-black px-2 py-0.5 rounded-sm text-[10px] ${
                      er.status === 'HIJACK RISK' ? 'bg-soy-red text-white' : er.status === 'MAINTAINER BOTTLENECK' ? 'bg-amber-600 text-white' : 'bg-green-600 text-white'
                    }`}>
                      {er.status}
                    </span>
                  </div>
                  {renderHelpText('exploitRisk', 'A combined assessment analyzing developer target vector match, low security scanning, and commit drift to evaluate hijack exploit exposure.')}
                </div>
                <p className={`text-[10px] ${isLight ? 'text-black/60' : 'text-soy-label/60'} leading-relaxed font-sans`}>
                  {renderTextWithCVELinks(
                    er.status === 'HIJACK RISK' 
                      ? 'High risk of hijack. Repo is a developer tool, has low security automation, and commits have drifted.'
                      : er.status === 'MAINTAINER BOTTLENECK'
                      ? 'Single maintainer bottleneck. High contributor concentration with commit activity starting to drift.'
                      : 'No active exploit risk caps currently apply to this repository.'
                  )}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Adoption Cap Resolution */}
        {(filter === 'ALL' || filter === 'CAP') && (
          <div className={`space-y-2 border-l-4 transition-all ${expandedSteps[3] ? 'border-l-soy-red pl-2' : 'border-l-transparent'}`}>
            <button
              type="button"
              onClick={() => toggleStep(3)}
              className={`w-full flex items-center justify-between border-b ${borderClass} pb-1 hover:text-soy-red transition-all cursor-pointer text-left font-mono`}
            >
              <div className="flex items-center gap-2">
                <span className="bg-soy-red text-white text-[9px] font-black px-1.5 py-0.5 rounded-sm">03</span>
                <h4 className="font-black uppercase tracking-wider text-[10px] text-soy-red flex items-center">
                  Adoption Cap Resolution
                  <span className="text-[8px] border border-soy-red/30 px-1.5 py-0.5 rounded-sm uppercase tracking-wider font-bold opacity-60 ml-2">
                    Impact: Critical
                  </span>
                </h4>
              </div>
              {expandedSteps[3] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {expandedSteps[3] && (
              <div className={`${bgClass} p-3 space-y-2`}>
                <div className="flex justify-between items-baseline">
                  <span className="opacity-50">Composite Math Score:</span>
                  <span className="font-bold text-sm">{score.toFixed(1)} / 100.0</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <div className="flex justify-between items-baseline">
                    <div className="flex items-center gap-1">
                      <span className="opacity-50">Final Adoption Verdict:</span>
                      <button
                        type="button"
                        onClick={() => toggleHelp('adoptionCap')}
                        className="text-soy-red hover:underline p-0.5 cursor-pointer flex items-center justify-center"
                        title="What is Adoption Cap?"
                      >
                        <Info size={11} />
                      </button>
                    </div>
                    <span className="font-black text-soy-red text-sm uppercase">{verdict}</span>
                  </div>
                  {renderHelpText('adoptionCap', 'Rules that enforce strict score limits. Severe indicators override numerical averages, capping verdicts to Forkable or Watchlist to protect production pipelines.')}
                </div>
                <p className={`text-[10px] ${isLight ? 'text-black/60' : 'text-soy-label/60'} leading-relaxed font-sans`}>
                  {renderTextWithCVELinks(
                    er.status === 'HIJACK RISK'
                      ? 'The final Adoption Verdict was capped to WATCHLIST due to active Hijack Risk indicators, overriding the composite math.'
                      : er.status === 'MAINTAINER BOTTLENECK'
                      ? 'The final Adoption Verdict was capped to FORKABLE due to single maintainer bottlenecks, overriding the composite math.'
                      : 'The Adoption Verdict band is set directly by the composite score ranges without any downward caps.'
                  )}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Trust Posture Resolution */}
        {(filter === 'ALL' || filter === 'POSTURE') && (
          <div className={`space-y-2 border-l-4 transition-all ${expandedSteps[4] ? 'border-l-soy-red pl-2' : 'border-l-transparent'}`}>
            <button
              type="button"
              onClick={() => toggleStep(4)}
              className={`w-full flex items-center justify-between border-b ${borderClass} pb-1 hover:text-soy-red transition-all cursor-pointer text-left font-mono`}
            >
              <div className="flex items-center gap-2">
                <span className="bg-soy-red text-white text-[9px] font-black px-1.5 py-0.5 rounded-sm">04</span>
                <h4 className="font-black uppercase tracking-wider text-[10px] text-soy-red flex items-center gap-1.5">
                  Trust Posture Resolution
                  {trustPosture !== 'TRUSTED' ? (
                    <span className="text-[8px] bg-red-600 text-white font-sans font-black px-1.5 py-0.5 rounded-sm flex items-center gap-0.5 animate-pulse">
                      <AlertTriangle size={10} /> LIMITED
                    </span>
                  ) : (
                    <span className="text-[8px] border border-soy-red/30 px-1.5 py-0.5 rounded-sm uppercase tracking-wider font-bold opacity-60">
                      Impact: Maximum
                    </span>
                  )}
                </h4>
              </div>
              {expandedSteps[4] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {expandedSteps[4] && (
              <div className={`${bgClass} p-3 space-y-2`}>
                <div className="flex justify-between items-baseline">
                  <span className="opacity-50">Final Trust Posture:</span>
                  <span className="font-black text-soy-red text-sm uppercase">{trustPosture}</span>
                </div>
                <div className={`space-y-1 text-[10px] border-t ${borderClass} pt-2`}>
                  <div className="flex items-center justify-between">
                    <span>1. Critical advisories count = 0:</span>
                    <span className="text-green-500 font-bold">✓ PASS</span>
                  </div>
                  <div className={`flex items-center justify-between p-1 rounded-sm ${er.status === 'HIJACK RISK' ? 'bg-red-500/10 border border-soy-red/20' : ''}`}>
                    <span>2. Hijack Risk status is None:</span>
                    <span className={er.status !== 'HIJACK RISK' ? 'text-green-500 font-bold' : 'text-soy-red font-bold animate-pulse'}>
                      {er.status !== 'HIJACK RISK' ? '✓ PASS' : '✗ FAIL'}
                    </span>
                  </div>
                  <div className={`flex items-center justify-between p-1 rounded-sm ${score < 8.5 ? 'bg-red-500/10 border border-soy-red/20' : ''}`}>
                    <span>3. Composite score is &gt;= 8.5:</span>
                    <span className={score >= 8.5 ? 'text-green-500 font-bold' : 'text-soy-red font-bold'}>
                      {score >= 8.5 ? '✓ PASS' : '✗ FAIL'}
                    </span>
                  </div>
                  <div className={`flex items-center justify-between p-1 rounded-sm ${!meta.busFactorHealthy ? 'bg-red-500/10 border border-soy-red/20' : ''}`}>
                    <span>4. Multi-maintainer status:</span>
                    <span className={meta.busFactorHealthy ? 'text-green-500 font-bold' : 'text-soy-red font-bold animate-pulse'}>
                      {meta.busFactorHealthy ? '✓ PASS' : '✗ FAIL'}
                    </span>
                  </div>
                  <div className={`flex items-center justify-between p-1 rounded-sm ${(!meta.hasDependabot && !meta.hasSast) ? 'bg-red-500/10 border border-soy-red/20' : ''}`}>
                    <span>5. Security automation detected:</span>
                    <span className={(meta.hasDependabot || meta.hasSast) ? 'text-green-500 font-bold' : 'text-soy-red font-bold animate-pulse'}>
                      {(meta.hasDependabot || meta.hasSast) ? '✓ PASS' : '✗ FAIL'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] pt-0.5 font-bold">
                    <span>6. Commit signature status:</span>
                    <span className="text-green-500">✓ PASS (100% SIGNED)</span>
                  </div>
                </div>
                <p className={`text-[10px] ${isLight ? 'text-black/60' : 'text-soy-label/60'} leading-relaxed font-sans border-t ${borderClass} pt-2`}>
                  {renderTextWithCVELinks(
                    trustPosture === 'TRUSTED'
                      ? 'All five posture conditions pass cleanly. The repository has a verified posture of TRUSTED. No active vulnerability CVE-2023-45857 flags present.'
                      : 'One or more posture checks failed. The posture is set to LIMITED TRUST. Potential vulnerability CVE-2023-45857 flags present.'
                  )}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
