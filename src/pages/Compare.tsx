import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CATEGORIES, Category } from '../data/categories';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, ArrowUpRight, Crown, Loader2, Zap, Rocket, ShieldCheck } from 'lucide-react';

export default function Compare() {
  const { slug } = useParams();
  
  if (!slug) {
    return <CompareIndex />;
  }

  const category = CATEGORIES.find(c => c.slug === slug);
  if (!category) {
    return <div className="p-20 text-center font-black italic uppercase">Category Lost in the Void.</div>;
  }

  return <CategoryComparison category={category} />;
}

function CompareIndex() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-16">
      <div className="mb-16">
        <h1 className="text-6xl md:text-8xl font-black uppercase italic tracking-tighter leading-none mb-4">
          COMPARISON GUIDES
        </h1>
        <p className="text-xl font-bold uppercase tracking-widest text-soy-red italic">
          BATTLE-TESTED DATA. REAL SCORES. NO OPINIONS.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
        {CATEGORIES.map((cat, idx) => (
          <motion.div
            key={cat.slug}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="group"
          >
            <Link to={`/compare/${cat.slug}`} className="block h-full">
              <div className="bg-white border-4 border-black p-8 h-full flex flex-col justify-between hover:translate-y-[-8px] hover:translate-x-[4px] transition-all shadow-[8px_8px_0px_#000] group-hover:shadow-[4px_4px_0px_#E63322]">
                <div>
                   <div className="text-4xl mb-4">{cat.icon}</div>
                   <h3 className="text-2xl font-black uppercase italic tracking-tight mb-2 leading-none group-hover:text-soy-red transition-colors">
                     {cat.title}
                   </h3>
                   <p className="text-[10px] font-bold opacity-60 uppercase tracking-wider mb-6">
                     {cat.tagline}
                   </p>
                </div>
                
                <div className="flex justify-between items-end">
                   <div className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">
                     {cat.projects.length} PROJECTS SCANNING
                   </div>
                   <ArrowUpRight className="text-soy-red opacity-0 group-hover:opacity-100 transition-all" size={24} />
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

interface ProjectScore {
  owner: string;
  repo: string;
  score: number;
  breakdown: any;
  loading: boolean;
  githubFallback?: boolean;
  earlyBreakout?: boolean;
  momentumNote?: string;
}

function CategoryComparison({ category }: { category: Category }) {
  const [scores, setScores] = useState<ProjectScore[]>(
    category.projects.map(p => ({ ...p, score: 0, breakdown: null, loading: !p.githubFallback, earlyBreakout: p.earlyBreakout, momentumNote: p.momentumNote }))
  );

  useEffect(() => {
    async function fetchAllScores() {
      const results = await Promise.all(
        category.projects.map(async p => {
          if (p.githubFallback) {
            return { ...p, score: 0, breakdown: null, loading: false };
          }
          try {
            const res = await fetch('/api/analyze', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ owner: p.owner, repo: p.repo })
            });
            const data = await res.json();
            return { ...p, score: data.total, breakdown: data.breakdown, loading: false };
          } catch (e) {
            return { ...p, score: 0, breakdown: null, loading: false };
          }
        })
      );
      // Sort by score descending
      setScores(results.sort((a, b) => b.score - a.score));
    }
    fetchAllScores();
  }, [category]);

  const topScorer = scores.find(s => !s.loading && !s.githubFallback);

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <Link to="/compare" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest mb-8 hover:text-soy-red transition-all">
        <ArrowLeft size={14} /> BACK TO COMPARISON GUIDES
      </Link>

      {/* Header Section */}
      <div className="mb-12 border-b-8 border-black pb-8">
        <div className="flex items-start gap-4 mb-4">
          <span className="text-6xl">{category.icon}</span>
          <div>
            <h1 className="text-5xl md:text-7xl font-black uppercase italic tracking-tighter leading-none">
              {category.title}
            </h1>
            <p className="text-xl font-bold uppercase tracking-widest text-soy-red italic mt-2">
              {category.tagline}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-emerald-500 text-white px-3 py-1 text-[10px] font-black uppercase tracking-widest italic animate-pulse">
            LIVE SCORES — UPDATED IN REAL TIME
          </div>
        </div>
      </div>

      {/* Comparison Grid */}
      <div className="space-y-4 mb-16">
        {scores.map((s, idx) => (
          <motion.div
            key={`${s.owner}/${s.repo}`}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.1 }}
            className={`bg-white border-2 border-black p-6 flex flex-col md:flex-row items-center justify-between gap-6 relative shadow-[4px_4px_0px_#000] ${idx === 0 && !s.loading && !s.githubFallback ? 'border-soy-red border-4' : ''}`}
          >
            {idx === 0 && !s.loading && !s.githubFallback && (
              <div className="absolute -top-3 -right-3 bg-soy-red text-white p-2 rounded-full shadow-[2px_2px_0px_#000] rotate-12">
                <Crown size={20} />
              </div>
            )}

            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-2xl font-black uppercase italic tracking-tight">{s.owner} / {s.repo}</h3>
                {s.earlyBreakout && (
                  <span className="bg-[#E63322] text-white text-[9px] font-bold tracking-widest px-2 py-0.5 border border-black flex items-center gap-1">
                    🚀 EARLY BREAKOUT
                  </span>
                )}
                {idx === 0 && !s.loading && !s.githubFallback && (
                   <span className="text-[10px] font-black uppercase tracking-widest text-soy-red italic">#1 RANKED IN {category.slug}</span>
                )}
                {s.githubFallback && (
                  <span className="bg-black text-white px-2 py-0.5 text-[8px] font-black uppercase tracking-widest italic">NOT YET ON GITHUB</span>
                )}
              </div>
              <p className="text-xs font-bold opacity-60 uppercase tracking-wider">{category.projects.find(p => p.repo === s.repo)?.tagline}</p>
              {s.earlyBreakout && (
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-soy-red mt-2 italic">
                  {s.momentumNote}
                </p>
              )}
            </div>

            <div className="flex items-center gap-8 min-w-[300px]">
              {s.loading ? (
                <div className="flex items-center gap-3 bg-soy-label/20 border border-black/5 px-6 py-3 w-full justify-center">
                   <Loader2 size={24} className="animate-spin opacity-40" />
                   <span className="text-[10px] font-black uppercase tracking-widest opacity-40">CALCULATING VITALITY...</span>
                </div>
              ) : (
                <>
                  <div className="flex gap-4">
                    <PillarSmall label="MTN" value={s.githubFallback ? 0 : (s.breakdown?.maintenance / 3.0) * 100} />
                    <PillarSmall label="SEC" value={s.githubFallback ? 0 : (s.breakdown?.security / 2.0) * 100} />
                    <PillarSmall label="COM" value={s.githubFallback ? 0 : (s.breakdown?.community / 2.5) * 100} />
                  </div>
                  <div className="bg-soy-red text-white p-4 flex flex-col items-center justify-center min-w-[80px] shadow-[4px_4px_0px_#000]">
                    <span className="text-3xl font-black italic leading-none">{s.githubFallback ? 'N/A' : (s.score ?? 0).toFixed(1)}</span>
                    <span className="text-[8px] font-black uppercase tracking-widest opacity-60">SOYCE</span>
                  </div>
                </>
              )}
            </div>

            <Link 
              to={s.githubFallback ? '#' : `/lookup?q=${s.owner}/${s.repo}`}
              className={`px-6 py-4 text-[10px] font-black uppercase tracking-widest italic transition-all flex items-center gap-2 ${s.githubFallback ? 'bg-soy-bottle/20 text-black/40 cursor-not-allowed' : 'bg-black text-white hover:bg-soy-red'}`}
              onClick={(e) => s.githubFallback && e.preventDefault()}
            >
              {s.githubFallback ? 'COMING SOON' : 'ANALYZE REPO'} <ArrowUpRight size={14} />
            </Link>
          </motion.div>
        ))}
      </div>

      {/* VERDICT Section */}
      <div className="bg-soy-label border-4 border-black p-1 space-y-1 shadow-[12px_12px_0px_#000] mb-12">
        <div className="bg-black text-white p-8">
           <h3 className="text-4xl font-black uppercase italic tracking-tighter mb-8 leading-none">THE SOYCE VERDICT</h3>
           <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <VerdictChip 
                icon={<ShieldCheck className="text-emerald-500" />} 
                label="BEST FOR TEAMS" 
                project={category.projects.find(p => p.repo === category.verdict.bestForTeams)?.name || ''} 
              />
              <VerdictChip 
                icon={<Zap className="text-soy-red" />} 
                label="BEST PERFORMANCE" 
                project={category.projects.find(p => p.repo === category.verdict.bestPerformance)?.name || ''} 
              />
              <VerdictChip 
                icon={<Rocket className="text-blue-500" />} 
                label="EASIEST ONBOARDING" 
                project={category.projects.find(p => p.repo === category.verdict.easiestOnboarding)?.name || ''} 
              />
           </div>
        </div>
      </div>

      <div className="text-[10px] font-bold uppercase tracking-widest opacity-40 text-center italic">
        🚀 EARLY BREAKOUT = strong community signal, GitHub stats still catching up to real adoption
      </div>
    </div>
  );
}

function PillarSmall({ label, value }: { label: string, value: number }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[8px] font-black uppercase tracking-widest opacity-40">{label}</span>
      <div className="w-1.5 h-10 bg-soy-bottle/10 relative">
        <motion.div 
          initial={{ height: 0 }}
          animate={{ height: `${value}%` }}
          className="absolute bottom-0 inset-x-0 bg-soy-bottle"
        />
      </div>
    </div>
  );
}

function VerdictChip({ icon, label, project }: { icon: React.ReactNode, label: string, project: string }) {
  return (
    <div className="border border-white/20 p-6 hover:border-white transition-colors group">
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60 group-hover:opacity-100 transition-opacity">
          {label}
        </span>
      </div>
      <div className="text-2xl font-black uppercase italic tracking-tight">{project}</div>
    </div>
  );
}
