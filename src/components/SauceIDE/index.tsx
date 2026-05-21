import React, { useState } from 'react';
import RepoMapPanel from './RepoMapPanel';
import EvidenceViewer from './EvidenceViewer';
import SauceJudgePanel from './SauceJudgePanel';
import SauceTracePanel from './SauceTracePanel';
import { Project, ExtensionExploitRisk } from '../../types';
import { ShieldAlert, ExternalLink } from 'lucide-react';
import { verdictFor, trustPostureFor, detectExtensionExploitRisk } from '../../shared/verdict.js';
import ReasoningTraceDrawer from './ReasoningTraceDrawer';

export type EvidenceTabKey =
  | 'readme'
  | 'package'
  | 'license'
  | 'security'
  | 'commits'
  | 'dependencies'
  | 'templates';

export interface EvidenceFocus {
  tab: EvidenceTabKey;
  source: 'file' | 'signal' | 'risk' | 'action';
  highlightId?: string;
  reason?: string;
}

interface SauceIDEProps {
  result: Project;
  viewMode?: 'ide' | 'standard';
  setViewMode?: (mode: 'ide' | 'standard') => void;
  onSearchNew?: () => void;
}

export default function SauceIDE({ result, viewMode, setViewMode, onSearchNew }: SauceIDEProps) {
  // Simulator State Toggles
  const [simulatorActive, setSimulatorActive] = useState(false);
  const [simHasDependabot, setSimHasDependabot] = useState(!!result.hasDependabot);
  const [simHasSast, setSimHasSast] = useState(!!result.hasSast);
  const [simBusFactorHealthy, setSimBusFactorHealthy] = useState(result.busFactorHealthy !== false);
  const [showTraceDrawer, setShowTraceDrawer] = useState(false);

  // Sync simulator state when result changes
  React.useEffect(() => {
    setSimHasDependabot(!!result.hasDependabot);
    setSimHasSast(!!result.hasSast);
    setSimBusFactorHealthy(result.busFactorHealthy !== false);
  }, [result]);

  const breakdown = result.score.raw || {
    maintenance: (result.score.maintenance / 100) * 3.0,
    security: (result.score.security / 100) * 2.0,
    community: (result.score.community / 100) * 2.5,
    documentation: (result.score.documentation / 100) * 1.5,
    activity: ((result.score.activity || 0) / 100) * 1.0,
  };

  // Re-compute scoring and exploit risk using overrides if simulator is active
  let simSecurity = breakdown.security;
  if (simulatorActive) {
    if (!result.hasDependabot && simHasDependabot) {
      simSecurity += 0.25;
    }
    if (result.hasDependabot && !simHasDependabot) {
      simSecurity -= 0.25;
    }
    if (!result.hasSast && simHasSast) {
      simSecurity += 0.25;
    }
    if (result.hasSast && !simHasSast) {
      simSecurity -= 0.25;
    }
    simSecurity = Math.max(0, Math.min(2.0, simSecurity));
  }

  let simCommunity = breakdown.community;
  if (simulatorActive) {
    if (result.busFactorHealthy === false && simBusFactorHealthy) {
      simCommunity += 0.2;
    }
    if (result.busFactorHealthy !== false && !simBusFactorHealthy) {
      simCommunity -= 0.2;
    }
    simCommunity = Math.max(0, Math.min(2.5, simCommunity));
  }

  const simBreakdown = {
    ...breakdown,
    security: simSecurity,
    community: simCommunity,
  };

  const simTotal = simulatorActive
    ? parseFloat((breakdown.maintenance + simSecurity + simCommunity + breakdown.documentation + breakdown.activity).toFixed(1))
    : result.score.overall;

  const total = simTotal;

  const currentMc = result.maintainerConcentration || {
    isSingleMaintainer: result.busFactorHealthy === false,
    topShare: 0.9,
    nonBotContributorCount: result.contributors ?? 1,
    daysSinceLastCommit: 45,
  };

  const simMc = simulatorActive
    ? {
        ...currentMc,
        isSingleMaintainer: !simBusFactorHealthy,
        nonBotContributorCount: simBusFactorHealthy ? Math.max(currentMc.nonBotContributorCount, 3) : 1,
      }
    : currentMc;

  const simDependabot = simulatorActive ? simHasDependabot : !!result.hasDependabot;
  const simSast = simulatorActive ? simHasSast : !!result.hasSast;

  const er = detectExtensionExploitRisk({
    repoData: result,
    workflows: null,
    hasDependabot: simDependabot ? true : false,
    hasSast: simSast ? true : false,
    maintainerConcentration: simMc,
  }) as ExtensionExploitRisk;

  const verdict = verdictFor(simTotal, {
    advisorySummary: result.advisories,
    maintainerConcentration: simMc,
    vendorSdkMatch: !!result.vendorSdk,
    extensionExploitRisk: er,
  });

  const posture = trustPostureFor(simTotal, {
    advisorySummary: result.advisories,
    maintainerConcentration: simMc,
    vendorSdkMatch: !!result.vendorSdk,
    extensionExploitRisk: er,
    hasDependabot: simDependabot,
    hasSast: simSast,
  });

  const meta = {
    totalStars: result.stars,
    totalForks: result.forks,
    openIssues: result.openIssues || 0,
    license: result.license,
    language: result.category,
    topics: result.techStack,
    contributors: simulatorActive && simBusFactorHealthy ? Math.max(result.contributors ?? 1, 3) : (result.contributors ?? (result.maintenanceBreakdown ? 10 : 3)),
    hasDependabot: simDependabot,
    hasSast: simSast,
    lastCommit: result.lastCommit || new Date().toISOString(),
    busFactorHealthy: simulatorActive ? simBusFactorHealthy : (result.busFactorHealthy !== false),
    avgResolutionDays: result.avgResolutionDays ?? null,
  };

  const repo = {
    name: result.name,
    owner: result.owner,
    url: `https://github.com/${result.owner}/${result.name}`,
    avatar: `https://github.com/${result.owner}.png`,
    id: result.id,
  };

  // Shared navigation and focus state for the trust learning loop
  const [evidenceFocus, setEvidenceFocus] = useState<EvidenceFocus>({
    tab: 'readme',
    source: 'file',
    reason: '',
  });

  const handleActionTrigger = (actionType: string) => {
    if (actionType === 'badge') {
      setEvidenceFocus({
        tab: 'readme',
        source: 'action',
        reason: 'Recommended Action complete: Generated repository claim code and shield badge template.',
      });
    } else if (actionType === 'dependabot') {
      setEvidenceFocus({
        tab: 'templates',
        source: 'action',
        reason: 'Recommended Action: Set up Dependabot scanning alerts in .github/dependabot.yml.',
      });
    } else if (actionType === 'codeql') {
      setEvidenceFocus({
        tab: 'templates',
        source: 'action',
        reason: 'Recommended Action: Set up CodeQL SAST workflow in .github/workflows/codeql.yml.',
      });
    }
  };

  return (
    <div className="w-full bg-soy-label p-6 font-mono text-soy-bottle selection:bg-soy-red/20 flex flex-col items-center select-none">
      {/* Evidence IDE border container */}
      <div className="w-full max-w-[1500px] border-2 border-black bg-[#17130f] shadow-[6px_6px_0_#000] overflow-hidden rounded-sm flex flex-col relative">
        
        {/* RepoCommandBar (Top Header) */}
        <div className="bg-[#efe8dc] border-b-2 border-black p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3">
            <img
              src={repo.avatar || 'https://github.com/github.png'}
              alt={repo.name}
              className="w-10 h-10 border-2 border-black rounded-sm"
            />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-black uppercase tracking-tight italic leading-none text-[#211a15]">
                  {repo.name}
                </h2>
                <a
                  href={repo.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-soy-red hover:underline p-0.5"
                >
                  <ExternalLink size={14} />
                </a>
              </div>
              <p className="text-[9px] font-black text-[#211a15]/50 uppercase tracking-widest mt-1">
                {repo.owner} · github.com/{repo.owner}/{repo.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            {/* Status label */}
            <div className="flex items-center gap-4 px-3 py-1.5 bg-[#efe8dc] border border-black text-[10px] font-black uppercase text-[#211a15]">
              <div className="flex flex-col pr-3 border-r border-black/20">
                <span className="opacity-50 text-[8px] tracking-wider leading-none">PROJECT JUDGMENT</span>
                <span className="text-xs font-black mt-0.5">SOYCE ENGINE</span>
              </div>
              <div className="flex flex-col pr-3 border-r border-black/20">
                <span className="opacity-50 text-[8px] tracking-wider leading-none">Adoption</span>
                <span className="text-soy-red font-black mt-0.5">{verdict}</span>
              </div>
              <div className="flex flex-col">
                <span className="opacity-50 text-[8px] tracking-wider leading-none">Trust Posture</span>
                <span className="text-soy-red font-black mt-0.5">{posture}</span>
              </div>
              {er.active && er.status !== 'NONE' && (
                <div 
                  className="flex flex-col pl-3 border-l border-black/20 cursor-help"
                  title={`Confidence: ${er.confidence}\nReasons:\n${er.reasons.map(r => `• ${r.label}`).join('\n')}`}
                >
                  <span className="text-soy-red font-black bg-soy-red/10 border border-soy-red px-1.5 py-0.5 rounded-sm flex items-center gap-1 animate-pulse">
                    ⚠ {er.status === 'HIJACK RISK' ? 'HIJACK RISK' : 'BOTTLENECK'}
                  </span>
                </div>
              )}
            </div>

            {/* Verdict Pill score capsule */}
            <div className="flex items-center border border-black overflow-hidden shadow-[2px_2px_0px_#000] bg-[#efe8dc]">
              <div className="bg-black text-[#efe8dc] px-3 py-2 text-[9px] font-black uppercase tracking-widest italic">
                SOYCE SCORE
              </div>
              <div className="bg-soy-red text-white px-4 py-1 text-2xl font-black italic">
                {total.toFixed(1)}
              </div>
            </div>
          </div>
        </div>

        {/* Capped-height Triple-column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(520px,1fr)_360px] h-[min(720px,calc(100vh-230px))] min-h-[520px] overflow-hidden">
          {/* Left panel: RepoMapPanel */}
          <RepoMapPanel
            meta={meta}
            breakdown={simBreakdown}
            activeFocus={evidenceFocus}
            setFocus={setEvidenceFocus}
          />

          {/* Center panel: EvidenceViewer */}
          <EvidenceViewer
            owner={repo.owner}
            repo={repo.name}
            activeFocus={evidenceFocus}
            setFocus={setEvidenceFocus}
            onActionTrigger={handleActionTrigger}
          />

           {/* Right panel: SauceJudgePanel */}
          <SauceJudgePanel
            owner={repo.owner}
            repo={repo.name}
            score={total}
            breakdown={simBreakdown}
            meta={meta}
            activeFocus={evidenceFocus}
            setFocus={setEvidenceFocus}
            onActionTrigger={handleActionTrigger}
            verdict={verdict}
            trustPosture={posture}
            extensionExploitRisk={er}
            onOpenTraceDrawer={() => setShowTraceDrawer(true)}
            simulatorActive={simulatorActive}
            setSimulatorActive={setSimulatorActive}
            simHasDependabot={simHasDependabot}
            setSimHasDependabot={setSimHasDependabot}
            simHasSast={simHasSast}
            setSimHasSast={setSimHasSast}
            simBusFactorHealthy={simBusFactorHealthy}
            setSimBusFactorHealthy={setSimBusFactorHealthy}
          />
        </div>

        {/* SauceTracePanel status line */}
        <SauceTracePanel
          owner={repo.owner}
          repo={repo.name}
          score={total}
        />

        {/* ModeRail view toggler (Sleek full-width Status Bar) */}
        {viewMode && setViewMode && (
          <div className="border-t border-[#3a3028] bg-[#100d0b] h-10 flex items-center justify-between text-xs font-black uppercase tracking-wider text-soy-bottle/60 w-full select-none">
            <div className="flex items-center h-full">
              <button
                type="button"
                onClick={() => setViewMode('ide')}
                className={`h-full px-5 flex items-center gap-1.5 transition-all cursor-pointer font-black border-r border-[#3a3028] ${
                  viewMode === 'ide'
                    ? 'bg-soy-red text-white'
                    : 'text-[#efe8dc]/80 hover:bg-[#efe8dc]/10'
                }`}
              >
                <span>🖥</span> Sauce IDE
              </button>
              <button
                type="button"
                onClick={() => setViewMode('standard')}
                className={`h-full px-5 flex items-center gap-1.5 transition-all cursor-pointer font-black border-r border-[#3a3028] ${
                  viewMode === 'standard'
                    ? 'bg-soy-red text-white'
                    : 'text-[#efe8dc]/80 hover:bg-[#efe8dc]/10'
                }`}
              >
                <span>📄</span> Nutrition Card
              </button>
              <button
                type="button"
                onClick={() => onSearchNew?.()}
                className="h-full px-5 flex items-center gap-1.5 text-white/80 hover:bg-[#efe8dc]/10 border-r border-[#3a3028] transition-all cursor-pointer font-black"
              >
                <span>🔍</span> New Lookup
              </button>
            </div>
            
            {/* Status bar right-side warning metadata */}
            <div className="hidden md:flex items-center gap-4 px-4 text-[10px] font-bold opacity-60 text-[#efe8dc]">
              <span className="flex items-center gap-1.5">
                <ShieldAlert size={12} className="text-soy-red animate-pulse" />
                <span>Not a substitute for full security analysis. Use responsibly.</span>
              </span>
            </div>
          </div>
        )}

        {/* Reasoning Trace Drawer */}
        <ReasoningTraceDrawer
          isOpen={showTraceDrawer}
          onClose={() => setShowTraceDrawer(false)}
          owner={repo.owner}
          repo={repo.name}
          score={total}
          breakdown={simBreakdown}
          meta={meta}
          verdict={verdict}
          trustPosture={posture}
          extensionExploitRisk={er}
        />
      </div>

      {/* Footer warning */}
      <div className="mt-4 flex items-center justify-between text-[10px] text-soy-bottle/60 uppercase font-bold select-none px-1 w-full max-w-[1500px]">
        <span className="flex items-center gap-1">
          <ShieldAlert size={12} className="text-soy-red" />
          <span>Not a substitute for full security analysis. Use responsibly.</span>
        </span>
        <span>© 2026 OpenSoyce. All Rights Reserved.</span>
      </div>
    </div>
  );
}
