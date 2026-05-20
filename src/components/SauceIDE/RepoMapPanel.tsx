import React from 'react';
import { FileText, Radio, ShieldAlert, Heart, Calendar, Users, BookOpen, Clock, Activity, FileCheck, HelpCircle } from 'lucide-react';
import { EvidenceFocus, EvidenceTabKey } from './index';

interface RepoMapPanelProps {
  meta: {
    lastCommit: string;
    license: string;
    hasDependabot: boolean;
    hasSast: boolean;
    contributors: number;
    busFactorHealthy: boolean;
  };
  breakdown: {
    maintenance: number;
    security: number;
    community: number;
    documentation: number;
    activity: number;
  };
  activeFocus: EvidenceFocus | null;
  setFocus: (focus: EvidenceFocus) => void;
}

export default function RepoMapPanel({
  meta,
  breakdown,
  activeFocus,
  setFocus,
}: RepoMapPanelProps) {

  const filesList = [
    { name: 'README.md', tab: 'readme' as EvidenceTabKey, icon: FileText },
    { name: 'package.json', tab: 'package' as EvidenceTabKey, icon: FileText },
    { name: 'SECURITY.md', tab: 'security' as EvidenceTabKey, icon: ShieldAlert },
    { name: 'LICENSE', tab: 'license' as EvidenceTabKey, icon: FileCheck },
  ];

  const signalsList = [
    { 
      name: 'Maintenance', 
      tab: 'commits' as EvidenceTabKey, 
      val: `${breakdown.maintenance.toFixed(1)}/3.0`,
      icon: Clock,
      reason: 'Commit cadence, issue triage rates, and active development lifecycles.'
    },
    { 
      name: 'Security', 
      tab: 'security' as EvidenceTabKey, 
      val: `${breakdown.security.toFixed(1)}/2.0`,
      icon: ShieldAlert,
      reason: 'Existence of vulnerability scanning policies and static analysis logs.'
    },
    { 
      name: 'Community', 
      tab: 'dependencies' as EvidenceTabKey, 
      val: `${breakdown.community.toFixed(1)}/2.5`,
      icon: Users,
      reason: 'Contributor density, organizational diversity, and dependency footprints.'
    },
    { 
      name: 'Documentation', 
      tab: 'readme' as EvidenceTabKey, 
      val: `${breakdown.documentation.toFixed(1)}/1.5`,
      icon: BookOpen,
      reason: 'Presence of standard setup instructions, installation procedures, and repository metadata.'
    },
    { 
      name: 'Activity', 
      tab: 'commits' as EvidenceTabKey, 
      val: `${breakdown.activity.toFixed(1)}/1.0`,
      icon: Activity,
      reason: 'Weekly code churn, release milestones, and active contributor schedules.'
    },
  ];

  const risksList = [
    { 
      name: 'Dependencies', 
      tab: 'dependencies' as EvidenceTabKey, 
      status: meta.hasDependabot ? 'HEALTHY' : 'WARN',
      reason: meta.hasDependabot ? 'Automated dependency tracking configured.' : 'No automated package scanners found.'
    },
    { 
      name: 'Release Health', 
      tab: 'commits' as EvidenceTabKey, 
      status: breakdown.maintenance >= 1.5 ? 'HEALTHY' : 'WARN',
      reason: breakdown.maintenance >= 1.5 ? 'Standard release releases found.' : 'Infrequent release schedule detected.'
    },
    { 
      name: 'Ownership', 
      tab: 'commits' as EvidenceTabKey, 
      status: meta.busFactorHealthy ? 'HEALTHY' : 'CRITICAL',
      reason: meta.busFactorHealthy ? 'Contributions distributed across multiple developers.' : 'High maintainer concentration bottleneck detected.'
    },
    { 
      name: 'License Posture', 
      tab: 'license' as EvidenceTabKey, 
      status: (meta.license !== 'No License' && meta.license !== 'Unknown') ? 'HEALTHY' : 'CRITICAL',
      reason: (meta.license !== 'No License' && meta.license !== 'Unknown') ? `Standard SPDX ${meta.license} compliant.` : 'No standard distribution permissions detected.'
    },
  ];

  const handleSelectFile = (tab: EvidenceTabKey, name: string) => {
    setFocus({
      tab,
      source: 'file',
      reason: `Inspecting active source file: ${name}`,
    });
  };

  const handleSelectSignal = (tab: EvidenceTabKey, name: string, reason: string) => {
    setFocus({
      tab,
      source: 'signal',
      reason: `${name} signal: ${reason}`,
    });
  };

  const handleSelectRisk = (tab: EvidenceTabKey, name: string, status: string, reason: string) => {
    setFocus({
      tab,
      source: 'risk',
      highlightId: name.toLowerCase().replace(' ', '-'),
      reason: `Risk alert in ${name} [${status}]: ${reason}`,
    });
  };

  return (
    <div className="flex flex-col h-full bg-[#17130f] text-soy-label border-r border-[#3a3028] select-none text-xs font-mono">
      {/* Title */}
      <div className="px-4 py-3 bg-[#100d0b] border-b border-[#3a3028] flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest opacity-50">Repo Map</span>
        <span className="text-[8px] opacity-30">V1.0</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
        {/* Files Section */}
        <div className="space-y-2">
          <h3 className="text-[9px] font-black text-soy-red uppercase tracking-widest opacity-60">Files</h3>
          <div className="space-y-1 pl-1">
            {filesList.map((file) => {
              const Icon = file.icon;
              const isActive = activeFocus?.tab === file.tab && activeFocus?.source === 'file';
              return (
                <button
                  key={file.name}
                  onClick={() => handleSelectFile(file.tab, file.name)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded transition-all text-left ${
                    isActive 
                      ? 'bg-soy-red text-white' 
                      : 'hover:bg-[#efe8dc]/5 text-soy-label/70'
                  }`}
                >
                  <Icon size={12} className={isActive ? 'text-white' : 'text-soy-red/60'} />
                  <span className="truncate">{file.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Signals Section */}
        <div className="space-y-2">
          <h3 className="text-[9px] font-black text-soy-red uppercase tracking-widest opacity-60">Signals</h3>
          <div className="space-y-1 pl-1">
            {signalsList.map((sig) => {
              const Icon = sig.icon;
              const isActive = activeFocus?.tab === sig.tab && activeFocus?.source === 'signal';
              return (
                <button
                  key={sig.name}
                  onClick={() => handleSelectSignal(sig.tab, sig.name, sig.reason)}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded transition-all text-left ${
                    isActive 
                      ? 'bg-soy-red text-white' 
                      : 'hover:bg-[#efe8dc]/5 text-soy-label/70'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Icon size={12} className={isActive ? 'text-white' : 'text-soy-red/60'} />
                    <span className="truncate">{sig.name}</span>
                  </div>
                  <span className={`text-[10px] font-bold shrink-0 ${isActive ? 'text-white' : 'text-soy-red'}`}>
                    {sig.val}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Risk Zones Section */}
        <div className="space-y-2">
          <h3 className="text-[9px] font-black text-soy-red uppercase tracking-widest opacity-60">Risk Zones</h3>
          <div className="space-y-1 pl-1">
            {risksList.map((risk) => {
              const isActive = activeFocus?.tab === risk.tab && activeFocus?.source === 'risk';
              const isCritical = risk.status === 'CRITICAL';
              const isWarn = risk.status === 'WARN';
              
              let statusColor = 'text-green-500';
              if (isCritical) statusColor = 'text-soy-red';
              else if (isWarn) statusColor = 'text-amber-500';

              return (
                <button
                  key={risk.name}
                  onClick={() => handleSelectRisk(risk.tab, risk.name, risk.status, risk.reason)}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded transition-all text-left ${
                    isActive 
                      ? 'bg-soy-red text-white' 
                      : 'hover:bg-[#efe8dc]/5 text-soy-label/70'
                  }`}
                >
                  <span className="truncate">{risk.name}</span>
                  <span className={`text-[9px] font-black uppercase shrink-0 ${isActive ? 'text-white' : statusColor}`}>
                    {risk.status}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
