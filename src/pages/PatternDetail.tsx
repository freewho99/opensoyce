import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, ShieldAlert, CheckCircle, HelpCircle, AlertCircle, FileCode } from 'lucide-react';
import { getOtsPatternDefinition, OTS_INCIDENTS } from '../data/patterns';

const severityClass: Record<string, string> = {
  critical: 'bg-soy-red text-white border-soy-bottle',
  high: 'bg-orange-500 text-white border-soy-bottle',
  medium: 'bg-yellow-400 text-soy-bottle border-soy-bottle',
  low: 'bg-blue-400 text-white border-soy-bottle',
  info: 'bg-soy-label text-soy-bottle border-soy-bottle',
};

const policyImpactClass: Record<string, string> = {
  block: 'text-soy-red border-soy-red bg-soy-red/5',
  warn: 'text-orange-500 border-orange-500 bg-orange-500/5',
  'requires-approval': 'text-yellow-600 border-yellow-600 bg-yellow-600/5',
  none: 'text-emerald-600 border-emerald-600 bg-emerald-600/5',
};

export default function PatternDetail() {
  const { patternId } = useParams<{ patternId: string }>();
  const pattern = patternId ? getOtsPatternDefinition(patternId) : undefined;

  if (!pattern) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 font-sans text-soy-bottle text-center">
        <div className="border-4 border-soy-bottle bg-white p-12 shadow-[8px_8px_0px_#302C26]">
          <ShieldAlert className="mx-auto text-soy-red mb-6" size={64} />
          <h1 className="text-4xl font-black uppercase tracking-tight mb-4">SPECIFICATION NOT FOUND</h1>
          <p className="text-sm font-bold text-soy-bottle/60 uppercase mb-8">
            The OTS risk pattern ID "{patternId}" does not exist in our active dictionary database.
          </p>
          <Link
            to="/patterns"
            className="inline-flex items-center gap-2 border-4 border-soy-bottle bg-soy-red text-white px-8 py-4 font-black uppercase italic shadow-[4px_4px_0px_#302C26] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all"
          >
            <ArrowLeft size={18} /> BACK TO DIRECTORY
          </Link>
        </div>
      </div>
    );
  }

  // Find incidents matching this pattern
  const associatedIncidents = OTS_INCIDENTS.filter((inc) =>
    inc.triggeredPatternIds.includes(pattern.id)
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 md:py-20 font-sans text-soy-bottle">
      {/* Back navigation */}
      <Link
        to="/patterns"
        className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-soy-bottle/60 hover:text-soy-red mb-8 transition-colors"
      >
        <ArrowLeft size={14} /> Back to Pattern Library
      </Link>

      {/* Main card */}
      <div className="border-4 border-soy-bottle bg-white shadow-[12px_12px_0px_#302C26] overflow-hidden mb-12">
        {/* Banner */}
        <div className="bg-soy-bottle text-white p-8 md:p-12 flex flex-col md:flex-row md:items-center justify-between gap-6 border-b-4 border-soy-bottle">
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <span className={`text-[10px] font-black uppercase border-2 px-3 py-1 ${severityClass[pattern.defaultSeverity]}`}>
                SEVERITY: {pattern.defaultSeverity}
              </span>
              <span className="text-[10px] font-black uppercase border-2 border-white bg-white/10 text-white px-3 py-1">
                CATEGORY: {pattern.category}
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl font-black uppercase italic tracking-tight leading-none">
              {pattern.name}
            </h1>
          </div>
          <div className="flex flex-col items-start md:items-end">
            <span className="text-[10px] font-black uppercase text-white/50 tracking-widest">ID SPECIFIER</span>
            <span className="font-mono text-sm font-bold bg-white/10 px-3 py-1 border border-white/20 mt-1">
              {pattern.id}
            </span>
          </div>
        </div>

        {/* Content columns */}
        <div className="p-8 md:p-12 grid grid-cols-1 md:grid-cols-12 gap-8">
          {/* Main Info (8 columns) */}
          <div className="md:col-span-8 space-y-8">
            {/* Overview */}
            <section>
              <h2 className="text-xs font-black uppercase tracking-widest text-soy-bottle/40 mb-3">
                SHORT SPECIFICATION
              </h2>
              <p className="text-lg font-black uppercase italic leading-relaxed">
                {pattern.shortDescription}
              </p>
            </section>

            {/* Why It Matters */}
            <section className="border-t-4 border-soy-bottle pt-6">
              <h3 className="text-xs font-black uppercase tracking-widest text-soy-bottle/40 mb-3 flex items-center gap-2">
                <HelpCircle size={16} /> WHY THIS IS A SUPPLY-CHAIN RISK
              </h3>
              <p className="text-sm font-bold leading-relaxed text-soy-bottle/70">
                {pattern.whyItMatters}
              </p>
            </section>

            {/* Evidence details */}
            <section className="border-t-4 border-soy-bottle pt-6">
              <h3 className="text-xs font-black uppercase tracking-widest text-soy-bottle/40 mb-3 flex items-center gap-2">
                <FileCode size={16} /> EVIDENCE SPECIFICATION & DETECTOR CRITERIA
              </h3>
              <div className="bg-soy-label p-6 border-2 border-soy-bottle font-mono text-xs text-soy-bottle/80 space-y-3">
                <div className="font-bold border-b border-soy-bottle/15 pb-2 uppercase tracking-wide">
                  DETECTION PARAMETERS:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <span className="font-bold sm:col-span-1">Registry Context:</span>
                  <span className="sm:col-span-2">npm / PyPI package release version analysis</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <span className="font-bold sm:col-span-1">Trigger Signal:</span>
                  <span className="sm:col-span-2">Mismatch, Lifecycle Script capability, or Dependency Confusion metadata</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <span className="font-bold sm:col-span-1">Policy Enforcement:</span>
                  <span className="sm:col-span-2">Evaluated at Compliance Gate during CI runner lifecycle</span>
                </div>
              </div>
            </section>

            {/* Remediation Action */}
            <section className="border-t-4 border-soy-bottle pt-6">
              <h3 className="text-xs font-black uppercase tracking-widest text-soy-bottle/40 mb-3 flex items-center gap-2">
                <CheckCircle size={16} className="text-emerald-600" /> RECOMMENDED REMEDIATION
              </h3>
              <div className="border-l-8 border-emerald-600 bg-emerald-50/50 p-6">
                <p className="text-sm font-black leading-relaxed">
                  {pattern.recommendedAction}
                </p>
              </div>
            </section>
          </div>

          {/* Sidebar Policy & Case studies (4 columns) */}
          <div className="md:col-span-4 space-y-8 border-t-4 md:border-t-0 md:border-l-4 border-soy-bottle pt-8 md:pt-0 md:pl-8">
            {/* Policy impact box */}
            <section>
              <h3 className="text-xs font-black uppercase tracking-widest text-soy-bottle/40 mb-3">
                DEFAULT POLICY RULE
              </h3>
              <div className={`border-4 p-6 text-center ${policyImpactClass[pattern.defaultPolicyImpact]}`}>
                <span className="text-[10px] font-black uppercase tracking-widest block mb-1 opacity-60">
                  OTS GATE ACTION
                </span>
                <span className="text-3xl font-black uppercase tracking-tighter leading-none italic block">
                  {pattern.defaultPolicyImpact}
                </span>
              </div>
            </section>

            {/* Associated Incident */}
            <section>
              <h3 className="text-xs font-black uppercase tracking-widest text-soy-bottle/40 mb-3">
                ASSOCIATED INCIDENTS
              </h3>
              {associatedIncidents.length === 0 ? (
                <div className="p-4 bg-soy-label border-2 border-soy-bottle text-xs font-bold text-soy-bottle/60 uppercase">
                  No registered incidents directly reference this pattern.
                </div>
              ) : (
                <div className="space-y-3">
                  {associatedIncidents.map((inc) => (
                    <Link
                      key={inc.id}
                      to={`/incidents/${inc.id}`}
                      className="block p-4 border-2 border-soy-bottle bg-white hover:bg-soy-label transition-all shadow-[2px_2px_0px_#302C26]"
                    >
                      <span className="text-[9px] font-black uppercase text-soy-red tracking-widest block mb-1">
                        REAL EXPLOIT HISTORY
                      </span>
                      <h4 className="text-xs font-black uppercase leading-tight">
                        {inc.name}
                      </h4>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
