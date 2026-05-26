import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, BookOpen, ShieldAlert, Cpu, Terminal, ArrowRight, ShieldCheck } from 'lucide-react';
import { getOtsIncident, getOtsPatternDefinition } from '../data/patterns';

export default function IncidentDetail() {
  const { incidentId } = useParams<{ incidentId: string }>();
  const incident = incidentId ? getOtsIncident(incidentId) : undefined;

  if (!incident) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 font-sans text-soy-bottle text-center">
        <div className="border-4 border-soy-bottle bg-white p-12 shadow-[8px_8px_0px_#302C26]">
          <ShieldAlert className="mx-auto text-soy-red mb-6" size={64} />
          <h1 className="text-4xl font-black uppercase tracking-tight mb-4">CASE STUDY NOT FOUND</h1>
          <p className="text-sm font-bold text-soy-bottle/60 uppercase mb-8">
            The incident case study "{incidentId}" is not in our archives.
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

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 md:py-20 font-sans text-soy-bottle">
      {/* Back Link */}
      <Link
        to="/patterns"
        className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-soy-bottle/60 hover:text-soy-red mb-8 transition-colors"
      >
        <ArrowLeft size={14} /> Back to Pattern Library
      </Link>

      {/* Case Study Header Card */}
      <div className="border-4 border-soy-bottle bg-white shadow-[12px_12px_0px_#302C26] overflow-hidden mb-12">
        <div className="bg-soy-bottle text-white p-8 md:p-12 border-b-4 border-soy-bottle">
          <div className="flex flex-wrap items-center gap-3 mb-4 text-xs font-black uppercase tracking-widest">
            <span className="bg-soy-red text-white px-3 py-1 border-2 border-soy-bottle">
              INCIDENT LOG
            </span>
            <span className="border-2 border-white/20 px-3 py-1 bg-white/10">
              DATE: {incident.date}
            </span>
            <span className="border-2 border-white/20 px-3 py-1 bg-white/10">
              TARGET: {incident.target}
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black uppercase italic tracking-tight mb-4">
            {incident.name}
          </h1>
          <p className="text-lg font-bold text-white/80 max-w-3xl leading-relaxed uppercase">
            {incident.description}
          </p>
        </div>

        {/* Case Study Body */}
        <div className="p-8 md:p-12 grid grid-cols-1 md:grid-cols-12 gap-8">
          {/* Detailed Narrative (8 columns) */}
          <div className="md:col-span-8 space-y-8">
            {/* Context */}
            <section>
              <h2 className="text-xs font-black uppercase tracking-widest text-soy-bottle/40 mb-3 flex items-center gap-2">
                <BookOpen size={16} /> BACKGROUND & CONTEXT
              </h2>
              <p className="text-sm font-bold leading-relaxed text-soy-bottle/70">
                {incident.context}
              </p>
            </section>

            {/* What Happened */}
            <section className="border-t-4 border-soy-bottle pt-6">
              <h2 className="text-xs font-black uppercase tracking-widest text-soy-bottle/40 mb-3 flex items-center gap-2">
                <ShieldAlert size={16} className="text-soy-red" /> TECHNICAL BREAKDOWN
              </h2>
              <p className="text-sm font-medium leading-relaxed text-soy-bottle/80 whitespace-pre-line">
                {incident.whatHappened}
              </p>
            </section>

            {/* Prevention Strategy */}
            <section className="border-t-4 border-soy-bottle pt-6">
              <h2 className="text-xs font-black uppercase tracking-widest text-soy-bottle/40 mb-3 flex items-center gap-2">
                <ShieldCheck size={16} className="text-emerald-600" /> PREVENTION & MITIGATION
              </h2>
              <div className="border-l-8 border-emerald-600 bg-emerald-50/50 p-6">
                <p className="text-sm font-black leading-relaxed">
                  {incident.preventionStrategy}
                </p>
              </div>
            </section>
          </div>

          {/* Triggered Patterns List (4 columns) */}
          <div className="md:col-span-4 space-y-6 border-t-4 md:border-t-0 md:border-l-4 border-soy-bottle pt-8 md:pt-0 md:pl-8">
            <section>
              <h3 className="text-xs font-black uppercase tracking-widest text-soy-bottle/40 mb-4">
                TRIGGERED OTS RISK PATTERNS
              </h3>
              <div className="space-y-4">
                {incident.triggeredPatternIds.map((patternId) => {
                  const patDef = getOtsPatternDefinition(patternId);
                  if (!patDef) return null;

                  return (
                    <Link
                      key={patternId}
                      to={`/patterns/${patternId}`}
                      className="block p-4 border-2 border-soy-bottle bg-soy-label hover:bg-white transition-all shadow-[2px_2px_0px_#302C26]"
                    >
                      <span className="text-[9px] font-black uppercase tracking-widest text-soy-red block mb-1">
                        {patDef.defaultSeverity} severity
                      </span>
                      <h4 className="text-xs font-black uppercase italic leading-tight mb-2">
                        {patDef.name}
                      </h4>
                      <p className="text-[10px] font-bold text-soy-bottle/60 line-clamp-2 leading-tight">
                        {patDef.shortDescription}
                      </p>
                      <div className="mt-2 text-[9px] font-black uppercase text-soy-bottle/40 flex items-center gap-1">
                        View Spec <ArrowRight size={10} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
