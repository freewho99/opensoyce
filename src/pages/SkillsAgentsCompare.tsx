import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, ArrowUpRight, Crown, Loader2, Zap, ShieldCheck } from 'lucide-react';
import { trackEvent } from '../utils/analytics';

const AGENT_PROJECTS = [
  { owner: 'opendevin', repo: 'OpenHands', name: 'OpenHands', type: 'CODING AGENT', verdict: 'BEST FOR AUTONOMOUS DEV WORK' },
  { owner: 'crewAIInc', repo: 'crewAI', name: 'crewAI', type: 'MULTI-AGENT', verdict: 'BEST FOR MULTI-AGENT WORKFLOWS' },
  { owner: 'microsoft', repo: 'autogen', name: 'AutoGen', type: 'MULTI-AGENT', verdict: 'BEST FOR ENTERPRISE MULTI-AGENT' },
  { owner: 'langchain-ai', repo: 'langgraph', name: 'LangGraph', type: 'WORKFLOW AGENT', verdict: 'BEST FOR CONTROLLABLE WORKFLOWS' },
  { owner: 'princeton-nlp', repo: 'SWE-agent', name: 'SWE-agent', type: 'CODING AGENT', verdict: 'BEST FOR RESEARCH-GRADE AUTOMATION' },
  { owner: 'continuedev', repo: 'continue', name: 'Continue', type: 'DEV ASSISTANT', verdict: 'BEST FOR LOCAL DEV ASSISTANCE' },
  { owner: 'paul-gauthier', repo: 'aider', name: 'Aider', type: 'DEV ASSISTANT', verdict: 'BEST FOR TERMINAL CODING' },
  { owner: 'geekan', repo: 'MetaGPT', name: 'MetaGPT', type: 'MULTI-AGENT', verdict: 'BEST FOR STRUCTURED AGENT PIPELINES' },
  { owner: 'SuperAGI', repo: 'SuperAGI', name: 'SuperAGI', type: 'AUTONOMOUS AGENT', verdict: 'BEST FOR SELF-HOSTED AGENTS' },
  { owner: 'Pythagora-io', repo: 'gpt-pilot', name: 'gpt-pilot', type: 'CODING AGENT', verdict: 'BEST FOR FULL-STACK SCAFFOLDING' }
];

export default function SkillsAgentsCompare() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    trackEvent('page_view', { page: '/compare/skills-agents', category: 'skills-agents' });
    
    async function fetchScores() {
      const results = await Promise.all(
        AGENT_PROJECTS.map(async (p) => {
          try {
            const res = await fetch('/api/analyze', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ owner: p.owner, repo: p.repo })
            });
            const scores = await res.json();
            return {
              ...p,
              overall: scores.total,
              health: (scores.breakdown.maintenance / 3.0) * 10,
              forkability: (scores.breakdown.community / 2.5) * 10,
              momentum: (scores.breakdown.activity / 1.0 || 0.85) * 10,
              bestFor: p.verdict.split('BEST FOR ')[1]
            };
          } catch (e) {
            return {
              ...p,
              overall: 0,
              health: 0,
              forkability: 0,
              momentum: 0,
              bestFor: 'N/A'
            };
          }
        })
      );
      setData(results.sort((a, b) => b.overall - a.overall));
      setLoading(false);
    }
    fetchScores();
  }, []);

  return (
    <div className="bg-[#F5F0E8] min-h-screen">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <Link 
          to="/compare" 
          className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest mb-8 hover:text-soy-red transition-all"
        >
          <ArrowLeft size={14} /> BACK TO COMPARISON GUIDES
        </Link>

        {/* HERO */}
        <section className="mb-12 border-b-8 border-black pb-8">
          <div className="bg-soy-red text-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] mb-6 inline-block shadow-[4px_4px_0px_#000]">
            CATEGORY COMPARISON
          </div>
          <h1 className="text-6xl md:text-8xl font-black uppercase italic tracking-tighter leading-none mb-4">
            SKILLS & AGENTS
          </h1>
          <p className="text-2xl font-bold uppercase tracking-widest text-soy-red italic mb-4">
            The reusable labor layer of open-source AI.
          </p>
          <p className="text-xl font-medium max-w-3xl opacity-80 leading-relaxed uppercase italic">
            Autonomous workers, coding agents, and capability packs for AI-native workflows. Compare what's forkable, what's production-ready, and what's still experimental.
          </p>
        </section>

        {/* TABLE */}
        <div className="overflow-x-auto mb-16 border-4 border-black">
          <table className="w-full text-left border-collapse bg-white">
            <thead>
              <tr className="bg-black text-[#F5F0E8] text-[10px] font-black uppercase tracking-widest">
                <th className="p-6 border-b-4 border-black">PROJECT</th>
                <th className="p-6 border-b-4 border-black text-center">SOYCE SCORE</th>
                <th className="p-6 border-b-4 border-black text-center">HEALTH</th>
                <th className="p-6 border-b-4 border-black text-center">FORKABILITY</th>
                <th className="p-6 border-b-4 border-black text-center">MOMENTUM</th>
                <th className="p-6 border-b-4 border-black">BEST FOR</th>
                <th className="p-6 border-b-4 border-black">TYPE</th>
                <th className="p-6 border-b-4 border-black">VERDICT</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-20 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <Loader2 size={48} className="animate-spin text-soy-red" />
                      <span className="text-xl font-black uppercase italic tracking-tighter opacity-40">
                        Analyzing Agent Vitality...
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                data.map((p, idx) => (
                  <tr key={p.repo} className="border-b-2 border-black hover:bg-soy-label/20 transition-colors">
                    <td className="p-6">
                      <Link 
                        to={`/projects/${p.owner}/${p.repo}`}
                        className="text-xl font-black uppercase italic tracking-tight hover:text-soy-red flex items-center gap-2"
                      >
                        {p.name} {idx === 0 && <Crown size={16} className="text-soy-red" />}
                      </Link>
                      <div className="text-[10px] font-bold opacity-40 uppercase tracking-widest">{p.owner}</div>
                    </td>
                    <td className="p-6 text-center">
                      <div className="inline-block bg-soy-red text-white px-4 py-2 text-2xl font-black italic shadow-[4px_4px_0px_#000]">
                        {p.overall.toFixed(1)}
                      </div>
                    </td>
                    <td className="p-6 text-center">
                      <ScoreBar value={p.health} />
                    </td>
                    <td className="p-6 text-center">
                      <ScoreBar value={p.forkability} color="bg-blue-600" />
                    </td>
                    <td className="p-6 text-center">
                      <ScoreBar value={p.momentum} color="bg-orange-500" />
                    </td>
                    <td className="p-6">
                      <span className="text-[10px] font-black uppercase tracking-tight leading-none block max-w-[120px]">
                        {p.bestFor}
                      </span>
                    </td>
                    <td className="p-6">
                      <span className="bg-black text-white px-2 py-1 text-[8px] font-black uppercase tracking-widest">
                        {p.type}
                      </span>
                    </td>
                    <td className="p-6 font-black uppercase italic text-soy-red text-[10px] leading-tight max-w-[180px]">
                      {p.verdict}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* FOOTER VERDICT */}
        <div className="bg-black text-white p-12 border-4 border-black shadow-[12px_12px_0px_#000] mb-20 relative overflow-hidden">
           <Zap className="absolute -right-10 -bottom-10 opacity-10 text-white" size={300} />
           <div className="relative z-10">
             <h2 className="text-5xl font-black uppercase italic tracking-tighter mb-8">THE SOYCE VERDICT</h2>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
               <div>
                  <div className="text-soy-red text-[10px] font-black uppercase tracking-widest mb-4 flex items-center gap-2">
                    <ShieldCheck size={16} /> BATTLE READY
                  </div>
                  <h3 className="text-3xl font-black italic uppercase mb-2">OpenHands</h3>
                  <p className="text-sm opacity-60 font-medium uppercase italic">The most complete autonomous foundation for software engineering teams.</p>
               </div>
               <div>
                  <div className="text-soy-red text-[10px] font-black uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Zap size={16} /> ORCHESTRATION KING
                  </div>
                  <h3 className="text-3xl font-black italic uppercase mb-2">crewAI</h3>
                  <p className="text-sm opacity-60 font-medium uppercase italic">Industry standard for multi-agent workflows with zero-friction onboarding.</p>
               </div>
               <div>
                  <div className="text-soy-red text-[10px] font-black uppercase tracking-widest mb-4 flex items-center gap-2">
                    <ArrowUpRight size={16} /> DEVELOPER'S CHOICE
                  </div>
                  <h3 className="text-3xl font-black italic uppercase mb-2">LangGraph</h3>
                  <p className="text-sm opacity-60 font-medium uppercase italic">For teams that need absolute control over the state machine of their agents.</p>
               </div>
             </div>
           </div>
        </div>
      </div>

      <footer className="py-12 border-t-2 border-black/10 text-center text-[10px] font-black uppercase tracking-[0.5em] opacity-40">
        © 2026 OPENSOYCE LABS. ALL SAUCE RESERVED.
      </footer>
    </div>
  );
}

function ScoreBar({ value, color = 'bg-soy-red' }: { value: number, color?: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="text-[10px] font-black italic">{(value).toFixed(1)}</div>
      <div className="w-20 h-2 bg-black/5 border border-black/10 relative overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${value * 10}%` }}
          className={`absolute inset-y-0 ${color}`}
        />
      </div>
    </div>
  );
}
