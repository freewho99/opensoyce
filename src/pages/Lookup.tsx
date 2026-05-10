import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Github, AlertCircle, Loader2, Copy, Check, Eye, EyeOff, ArrowRight, ArrowUpRight } from 'lucide-react';
import NutritionLabel from '../components/NutritionLabel';
import SimilarProjects from '../components/SimilarProjects';
import { Project } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { useWatchlist } from '../context/WatchlistContext';
import { trackEvent } from '../utils/analytics';

export default function Lookup() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Project | null>(null);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<{ message: string; show: boolean }>({ message: '', show: false });
  const showToast = (message: string) => {
    setToast({ message, show: true });
    setTimeout(() => setToast({ message: '', show: false }), 3000);
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) {
      setError('FORMAT: owner/repo (e.g. facebook/react)');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, repo })
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === 'REPO_NOT_FOUND') {
          throw new Error('REPO NOT FOUND. CHECK THE OWNER/REPO FORMAT.');
        } else if (data.error === 'RATE_LIMIT_HIT' || res.status === 429) {
          throw new Error('GITHUB API RATE LIMIT HIT. TRY AGAIN IN A MINUTE.');
        } else {
          throw new Error(data.error || 'ANALYSIS FAILED');
        }
      }

      // Map API response to UI state
      const repoPath = `${owner}/${repo}`;
      trackEvent('analyze_project_click', { repo: repoPath, source: 'lookup' });
      
      setResult({
        id: data.repo.id,
        name: data.repo.name,
        owner: data.repo.owner,
        description: data.repo.description,
        stars: data.meta.totalStars,
        forks: data.meta.totalForks,
        lastScanned: 'Just now (Live)',
        status: 'Unverified',
        category: data.meta.language,
        scoreTrend: 'up',
        score: {
          overall: data.total,
          maintenance: (data.breakdown.maintenance / 3.0) * 100,
          security: (data.breakdown.security / 2.0) * 100,
          community: (data.breakdown.community / 2.5) * 100,
          documentation: (data.breakdown.documentation / 1.5) * 100,
          activity: (data.breakdown.activity / 1.0) * 100,
          raw: data.breakdown
        },
        techStack: data.meta.topics,
        license: data.meta.license
      });
      
      showToast('Analysis complete!');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyBadge = () => {
    if (!result) return;
    const origin = window.location.origin;
    const markdown = `[![OpenSoyce Score](${origin}/api/badge/${result.owner}/${result.name}.svg)](${origin}/project/${result.owner}/${result.name})`;
    navigator.clipboard.writeText(markdown);
    setCopied(true);
    showToast('BADGE COPIED! PASTE INTO YOUR README.');
    setTimeout(() => setCopied(false), 3000);
  };

  const toggleWatch = () => {
    if (!result) return;
    if (isWatching(result.owner, result.name)) {
      removeFromWatchlist(result.owner, result.name);
      showToast('Removed from watchlist');
    } else {
      addToWatchlist(result.owner, result.name, result.score.overall);
      showToast('Added to watchlist!');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-12 relative">
      <AnimatePresence>
        {toast.show && (
          <motion.div 
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            className="fixed bottom-8 left-1/2 z-[100] bg-soy-bottle text-white px-6 py-3 font-black uppercase italic tracking-widest border-2 border-white shadow-[4px_4px_0px_#E63322] flex items-center gap-3"
          >
            <div className="bg-soy-red p-1"><Check size={16} /></div>
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mb-12">
        <h1 className="text-5xl font-bold uppercase italic tracking-tighter mb-4">Repo Lookup</h1>
        <p className="text-xl font-medium opacity-60">Import any GitHub project and generate its OpenSoyce Nutrition Label instantly.</p>
        
        
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Form Column */}
        <div className="lg:col-span-12 xl:col-span-12 h-fit">
          <form onSubmit={handleAnalyze} className="bg-white border-4 border-soy-bottle p-8 shadow-[8px_8px_0px_#302C26] space-y-6">
            <div className="flex items-center gap-3 mb-4">
              <Github className="text-soy-red" size={32} />
              <h2 className="text-2xl font-bold uppercase italic tracking-tight">Source</h2>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-[10px] font-bold uppercase tracking-widest opacity-40">GITHUB REPOSITORY</label>
                <div className="relative">
                  <input 
                    type="text" 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    className={`w-full bg-soy-label/20 border-4 p-5 font-black outline-none transition-all ${input && !input.includes('/') ? 'border-soy-red' : 'border-soy-bottle'} focus:bg-white`}
                    placeholder="e.g. facebook/react or vercel/next.js"
                    required
                  />
                  {input && !input.includes('/') && (
                    <div className="absolute top-full right-0 mt-1 text-[8px] font-black uppercase text-soy-red tracking-widest">
                      FORMAT: owner/repo
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-soy-bottle text-white p-4 font-mono text-[10px] flex items-center gap-3">
                <Search size={14} className="text-soy-red" />
                <span className="opacity-40">AUTO-DETECT:</span>
                <span className="tracking-widest">
                  github.com / <span className={owner ? 'text-soy-red' : 'text-white/20'}>{owner || '[owner]'}</span> / <span className={repo ? 'text-soy-red' : 'text-white/20'}>{repo || '[repo]'}</span>
                </span>
              </div>
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-soy-bottle text-soy-label py-5 text-xl font-bold uppercase tracking-widest hover:bg-soy-red transition-all flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" /> : <Search />}
              {loading ? 'Analyzing...' : 'Analyze Repo'}
            </button>
          </form>

          {error && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 p-4 bg-soy-red/10 border-2 border-soy-red text-soy-red flex items-center gap-3 font-bold"
            >
              <AlertCircle size={20} />
              {error}
            </motion.div>
          )}
        </div>

        {/* Result Column */}
        <div className="lg:col-span-12 xl:col-span-12" ref={resultsRef}>
          <AnimatePresence mode="wait">
            {result ? (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="flex flex-col lg:flex-row gap-8 items-start"
              >
                <div className="flex-1 w-full">
                  <div className="bg-white border-4 border-soy-bottle p-8 mb-6 shadow-[8px_8px_0px_#000]">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
                      <div>
                        <h2 className="text-5xl font-black uppercase italic tracking-tighter leading-none mb-2">{result.name}</h2>
                        <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest opacity-40">
                          <span>{result.owner}</span>
                          <span className="w-1 h-1 bg-soy-bottle rounded-full opacity-20" />
                          <span>{result.id}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 bg-soy-red text-white p-4 shadow-[4px_4px_0px_#000]">
                        <div className="flex flex-col items-center leading-none">
                          <span className="text-5xl font-black italic tracking-tighter">{(result.score.overall ?? 0).toFixed(1)}</span>
                          <span className="text-[8px] font-black uppercase tracking-[0.2em] mt-1 opacity-80">SOYCE SCORE</span>
                        </div>
                      </div>
                    </div>

                    <p className="text-sm font-bold uppercase italic tracking-tight opacity-70 mb-8 leading-relaxed border-l-4 border-soy-red pl-4">
                      "{result.description}"
                    </p>
                    
                    {/* Meta Row */}
                    <div className="flex flex-wrap items-center gap-4 py-6 border-y-2 border-soy-bottle/5 mb-8 text-[11px] font-black uppercase tracking-wider italic">
                      <div className="flex items-center gap-1.5"><span className="text-soy-red font-normal">ÃÂ¢ÃÂ­ÃÂ</span> {((result.stars || 0) / 1000).toFixed(1)}K</div>
                      <div className="flex items-center gap-1.5"><span className="text-soy-red font-normal">ÃÂ°ÃÂÃÂÃÂ´</span> {result.forks}</div>
                      <div className="flex items-center gap-1.5"><span className="text-soy-red font-normal">ÃÂ°ÃÂÃÂÃÂ</span> {(result as any).openIssues || 0} OPEN</div>
                      <div className="flex items-center gap-1.5"><span className="text-soy-red font-normal">ÃÂ°ÃÂÃÂÃÂ</span> {(result as any).lastCommit ? new Date((result as any).lastCommit).toLocaleDateString() : 'RECENTLY'}</div>
                      <div className="flex items-center gap-1.5"><span className="text-soy-red font-normal">ÃÂ°ÃÂÃÂÃÂ</span> {result.license}</div>
                    </div>

                    {/* 5 Pillars Breakdown */}
                    <div className="grid grid-cols-1 md:grid-cols-1 gap-6 mb-8 bg-soy-label/20 p-6 border-2 border-soy-bottle/10">
                       <h3 className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40 mb-2">SCRIBED SCORE BREAKDOWN</h3>
                       <div className="space-y-4">
                        <PillarRow label="Maintenance" value={result.score.maintenance} raw={result.score.raw?.maintenance} max={3.0} />
                        <PillarRow label="Community" value={result.score.community} raw={result.score.raw?.community} max={2.5} />
                        <PillarRow label="Security" value={result.score.security} raw={result.score.raw?.security} max={2.0} />
                        <PillarRow label="Documentation" value={result.score.documentation} raw={result.score.raw?.documentation} max={1.5} />
                        <PillarRow label="Activity" value={result.score.activity || 0} raw={result.score.raw?.activity} max={1.0} />
                       </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-[10px] font-black uppercase tracking-widest opacity-40">INGREDIENTS</h4>
                      <div className="flex flex-wrap gap-2">
                        {result.techStack.length > 0 ? (
                          <>
                            <span className="bg-soy-red text-white px-3 py-1 text-[10px] font-black uppercase tracking-widest italic">{result.category}</span>
                            {result.techStack.slice(0, 5).map(t => (
                              <span key={t} className="bg-soy-bottle text-white px-3 py-1 text-[10px] font-black uppercase tracking-widest italic">{t}</span>
                            ))}
                          </>
                        ) : (
                          <span className="text-[10px] font-bold opacity-30">No topics detected</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <SimilarProjects 
                    owner={result.owner} 
                    repo={result.name} 
                    topics={result.techStack} 
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Link 
                      to={`/projects/${result.owner}/${result.name}`}
                      onClick={() => trackEvent('analyze_project_click', { repo: `${result.owner}/${result.name}`, source: 'lookup' })}
                      className="md:col-span-2 bg-black text-white py-6 text-2xl font-black uppercase italic tracking-tighter hover:bg-soy-red transition-all flex items-center justify-center gap-4 shadow-[8px_8px_0px_#444]"
                    >
                      VIEW FULL PROFILE <ArrowUpRight size={24} />
                    </Link>

                    <button 
                      onClick={copyBadge}
                      className="bg-white border-4 border-soy-bottle py-4 font-bold uppercase tracking-widest hover:bg-soy-label transition-all flex flex-col items-center justify-center gap-2"
                    >
                      <div className="flex items-center gap-2">
                        {copied ? <Check size={20} className="text-soy-red" /> : <Copy size={20} />}
                        {copied ? 'Markdown Copied!' : 'Copy Badge Markdown'}
                      </div>
                      <div className="mt-2 pt-2 border-t border-soy-bottle/10 w-full px-4">
                        <div className="text-[8px] opacity-40 mb-2">LIVE PREVIEW</div>
                        <img 
                          src={`/api/badge/${result.owner}/${result.name}.svg?t=${Date.now()}`} 
                          alt="Soyce Badge" 
                          className="h-5 mx-auto"
                        />
                      </div>
                    </button>

                    <button 
                      onClick={toggleWatch}
                      className={`py-4 font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 border-4 border-soy-bottle ${
                        isWatching(result.owner, result.name) 
                          ? 'bg-soy-bottle text-white' 
                          : 'bg-white text-soy-bottle hover:bg-soy-label'
                      }`}
                    >
                      {isWatching(result.owner, result.name) ? (
                        <>
                          <EyeOff size={20} />
                          <span>ÃÂ¢ÃÂÃÂ WATCHING | UNWATCH</span>
                        </>
                      ) : (
                        <>
                          <Eye size={20} />
                          <span>WATCH REPO</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex-shrink-0 mx-auto lg:mx-0 shadow-[12px_12px_0px_#D12D2D]">
                  <NutritionLabel project={result} />
                </div>
              </motion.div>
            ) : !loading && (
              <div className="h-full flex flex-col items-center justify-center p-20 border-4 border-dashed border-soy-bottle/10 rounded-xl text-center opacity-20">
                 <Github size={64} className="mb-4" />
                 <p className="text-xl font-bold uppercase italic tracking-widest">Awaiting Sauce data</p>
                 <p className="text-sm font-medium mt-2">Enter a GitHub repository to verify its nutritional profile.</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string, value: string }) {
  return (
    <div className="bg-soy-label/20 border border-soy-bottle/10 px-4 py-2">
      <div className="text-[8px] font-black uppercase tracking-widest opacity-40">{label}</div>
      <div className="text-sm font-black italic tracking-tight">{value}</div>
    </div>
  );
}

function PillarRow({ label, value, raw, max }: { label: string, value: number, raw?: number, max: number }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-end text-[10px] font-black uppercase tracking-[0.2em] italic">
        <span>{label}</span>
        <span className="opacity-40">{raw !== undefined ? `${raw.toFixed(1)} / ${max.toFixed(1)}` : `${Math.round(value)}%`}</span>
      </div>
      <div className="h-4 bg-white/50 border border-soy-bottle/10 relative overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          className="absolute inset-0 bg-soy-red"
        />
        {/* Progress ticks */}
        <div className="absolute inset-0 flex justify-between pointer-events-none">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="w-[1px] h-full bg-black/5" />
          ))}
        </div>
      </div>
    </div>
  );
}
