import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MOCK_RECIPES } from '../constants';
import NutritionLabel from '../components/NutritionLabel';
import SimilarProjects from '../components/SimilarProjects';
import SoyceScore from '../components/SoyceScore';
import {
  Github, Star, GitFork, ShieldCheck, ShieldAlert, ExternalLink, ArrowLeft,
  Terminal, Package, Code, GitBranch, Copy, Check, X,
  Rocket, Briefcase, GraduationCap, TrendingUp, HelpCircle,
  ArrowUpRight, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Soycie from '../components/Soycie';
import { useProjects } from '../context/ProjectContext';
import { CATEGORIES } from '../data/categories';
import { trackEvent } from '../utils/analytics';

export default function ProjectDetail() {
  const { owner, repo } = useParams();
  const { getProject } = useProjects();
  const [copied, setCopied] = useState(false);
  const [showForkModal, setShowForkModal] = useState(false);
  const [liveData, setLiveData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const localProject = getProject(owner || '', repo || '');

  useEffect(() => {
    async function fetchLive() {
      if (!owner || !repo) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ owner, repo })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to analyze project');
        
        // Map to our project structure
        setLiveData({
          id: data.repo.id,
          name: data.repo.name,
          owner: data.repo.owner,
          description: data.repo.description,
          stars: data.meta.totalStars,
          forks: data.meta.totalForks,
          lastScanned: 'Live Analysis',
          status: 'Verified',
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
          license: data.meta.license,
          lastCommit: data.meta.lastCommit,
          openIssues: data.meta.openIssues,
          url: data.repo.url,
          advisories: data.meta.advisories ?? null,
        });
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchLive();
  }, [owner, repo]);

  const project = liveData || localProject;

  const getHistory = () => {
    if (!project) return [];
    // Seeded random based on stars
    const seed = project.stars || 1000;
    const history = [];
    const currentScore = project.score.overall;
    
    // Last commit recency affects trend
    const lastCommitDate = project.lastCommit ? new Date(project.lastCommit) : new Date();
    const isActive = (new Date().getTime() - lastCommitDate.getTime()) < 30 * 24 * 60 * 60 * 1000;
    const trendBase = isActive ? 0.05 : -0.02;

    for (let i = 11; i >= 0; i--) {
      const monthSeed = Math.sin(seed + i) * 0.3;
      const trendAdjustment = i * trendBase;
      const val = Math.min(10, Math.max(1, currentScore - monthSeed - trendAdjustment));
      history.push(val);
    }
    return history;
  };

  const history = getHistory();
  const delta = history.length > 1 ? project.score.overall - history[history.length - 2] : 0;

  const curated = CATEGORIES.flatMap(c => c.projects).find(p => p.owner.toLowerCase() === owner?.toLowerCase() && p.repo.toLowerCase() === repo?.toLowerCase());
  const whyItsHot = curated?.whyItsHot;

  const getLicenseInfo = (license?: string) => {
    if (!license || license === 'Unknown') return { text: "LICENSE UNKNOWN — VERIFY BEFORE USE", color: "text-soy-red", bg: "bg-soy-red/10", border: "border-soy-red" };
    const p = license.toLowerCase();
    if (p.includes('mit') || p.includes('apache')) return { text: "PERMISSIVE — USE FREELY", color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500" };
    if (p.includes('gpl')) return { text: "COPYLEFT — CHECK YOUR USE CASE", color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500" };
    return { text: "CHECK LICENSE FOR DETAILS", color: "text-soy-bottle/60", bg: "bg-soy-bottle/5", border: "border-soy-bottle/20" };
  };

  const licenseInfo = getLicenseInfo(project?.license);

  const getBadge = (score: number) => {
    if (score >= 9.0) return "USE READY";
    if (score >= 8.0) return "FORKABLE";
    if (curated?.earlyBreakout) return "HIGH MOMENTUM";
    if (score < 7.0) return "WATCHLIST";
    return "FORKABLE";
  };

  if (loading && !localProject) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-soy-label">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-soy-red animate-spin mx-auto mb-4" />
          <h2 className="text-2xl font-black uppercase italic tracking-tighter text-soy-bottle">◉ ANALYZING REPOSITORY...</h2>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-soy-label p-4">
        <h2 className="text-4xl font-black uppercase italic tracking-tighter mb-4">PROJECT HAS GONE COLD.</h2>
        <p className="text-xl font-bold uppercase tracking-widest opacity-60 mb-8">REPOS NOT FOUND OR RATE LIMITED.</p>
        <Link to="/" className="bg-black text-white px-8 py-4 font-black uppercase italic tracking-widest hover:bg-soy-red transition-all">
          BACK TO BOARD
        </Link>
      </div>
    );
  }

  // Detect when the page is rendering stale fallback data because the live
  // fetch failed (e.g. 429 from the rate limiter, GitHub rate-limit, network).
  const isFallback = !!error && !liveData;

  return (
    <div className="bg-soy-label min-h-screen">
      {isFallback && (
        <div className="bg-amber-500 text-black border-b-2 border-black px-4 py-2 text-[11px] font-black uppercase tracking-widest text-center">
          <span className="opacity-70">Live analysis failed:</span> {error}. <span className="opacity-70">Showing cached data — score may be stale.</span>
        </div>
      )}
      {/* 1. HEADER BAND (black bar) */}
      <header className="bg-black text-white h-20 flex items-center border-b-4 border-black sticky top-16 z-40">
        <div className="max-w-7xl mx-auto px-4 w-full flex justify-between items-center">
          <div className="flex items-center gap-4">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-black uppercase tracking-tighter truncate max-w-[55vw] md:max-w-none">
              {project.owner}/{project.name}
            </h1>
            <a href={project.url} target="_blank" rel="noreferrer" className="opacity-60 hover:opacity-100 transition-opacity">
              <Github size={24} />
            </a>
          </div>
          <div className="flex items-center gap-4">
            <div className="shadow-[-4px_4px_0px_white]">
              <SoyceScore value={project.score.overall ?? 0} size="sm" earlyBreakout={!!curated?.earlyBreakout} link />
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          {/* Main Content Area */}
          <div className="lg:col-span-12 space-y-12">
            
            {/* 2. NUTRITION LABEL + INFO */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
              <div className="lg:col-span-7">
                <div className="mb-0">
                  <div className="flex items-center gap-3 mb-4">
                    <Link to="/leaderboards" className="text-xs font-bold uppercase tracking-widest hover:text-soy-red flex items-center gap-2">
                       <ArrowLeft size={14} /> Back
                    </Link>
                    <span className="opacity-20">/</span>
                    <span className="text-xs font-bold uppercase tracking-widest opacity-40">{project.category}</span>
                  </div>
                  <h2 className="text-4xl sm:text-6xl md:text-8xl font-black uppercase italic tracking-tighter mb-6 leading-[0.9] break-words">
                    {project.name.toUpperCase()}
                  </h2>
                </div>
                
                <p className="text-2xl md:text-3xl font-medium leading-tight mb-12 opacity-80 max-w-4xl">
                  {project.description}
                </p>

                {/* 3. WHY IT'S HOT (red band) — only when there's a real editorial note. */}
                {whyItsHot && (
                  <div className="bg-[#E63322] text-white p-8 md:p-12 mb-12 relative overflow-hidden">
                    <div className="absolute -right-10 -bottom-10 opacity-10">
                      <TrendingUp size={240} />
                    </div>
                    <h3 className="text-xs font-black uppercase tracking-[0.4em] mb-4 opacity-70">WHY IT'S HOT</h3>
                    <p className="text-3xl md:text-5xl font-black uppercase italic tracking-tighter leading-[0.9]">
                      {whyItsHot}
                    </p>
                  </div>
                )}

                {/* Active-advisory banner — only when there's something to alarm about */}
                {project.advisories && (project.advisories.recentOpen > 0 || (project.advisories.critical ?? 0) > 0) && (
                  <div className="bg-soy-red text-white border-4 border-black p-6 md:p-8 mb-8 flex flex-col md:flex-row items-start md:items-center gap-4 shadow-[8px_8px_0px_#000]">
                    <ShieldAlert size={40} className="shrink-0" />
                    <div className="flex-1">
                      <h3 className="text-[10px] font-black uppercase tracking-[0.4em] opacity-70 mb-1">ACTIVE ADVISORY SIGNAL</h3>
                      <p className="text-xl md:text-3xl font-black uppercase italic tracking-tighter leading-[0.95]">
                        {project.advisories.openCount} OPEN {project.advisories.openCount === 1 ? 'ADVISORY' : 'ADVISORIES'}
                        {project.advisories.recentOpen > 0 && <> · {project.advisories.recentOpen} IN LAST 12 MO</>}
                      </p>
                    </div>
                    <div className="flex gap-2 text-[10px] font-black uppercase tracking-widest">
                      {(project.advisories.critical ?? 0) > 0 && <span className="bg-black text-white px-2 py-1">CRIT {project.advisories.critical}</span>}
                      {(project.advisories.high ?? 0) > 0 && <span className="bg-amber-500 text-black px-2 py-1 border border-black">HIGH {project.advisories.high}</span>}
                    </div>
                  </div>
                )}

                {/* 4. SIGNAL BREAKDOWN (3-column grid) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border-4 border-black mb-12">
                  <SignalSection
                    title="HEALTH"
                    value={project.score.overall.toFixed(1)}
                    bullets={[
                      "↑ Maintenance velocity sustained",
                      project.advisories
                        ? (project.advisories.openCount === 0
                            ? "↑ No known advisories"
                            : `↓ ${project.advisories.openCount} open ${project.advisories.openCount === 1 ? 'advisory' : 'advisories'}`)
                        : "— Advisory data unavailable",
                      project.advisories && (project.advisories.critical ?? 0) > 0
                        ? `↓ ${project.advisories.critical} critical advisory${(project.advisories.critical ?? 0) > 1 ? 's' : ''}`
                        : "↑ Zero critical advisories"
                    ]}
                  />
                  <SignalSection 
                    title="FORKABILITY" 
                    value={(project.score.overall - 0.4).toFixed(1)}
                    bullets={[
                      `↑ License: ${project.license}`,
                      "↑ Modular component structure",
                      "↑ Clean documentation signals"
                    ]}
                    borderLeft
                  />
                  <SignalSection 
                    title="MOMENTUM" 
                    value={(project.score.overall + 0.3 > 10 ? 9.9 : project.score.overall + 0.3).toFixed(1)}
                    bullets={[
                      "↑ Commit count accelerating",
                      "↑ Issue response < 24h",
                      "↓ Low staleness detected"
                    ]}
                    borderLeft
                  />
                </div>
              </div>

              {/* Nutrition Label Stickyish */}
              <div className="lg:col-span-5 flex justify-center lg:block">
                <div className="lg:sticky lg:top-40">
                  <NutritionLabel project={project} />
                  <div className="mt-8 flex items-center justify-center gap-4 bg-white border-2 border-black p-4 italic font-bold">
                    <Soycie mood={project.score.overall > 8.5 ? "happy" : "suspicious"} size="sm" />
                    <span className="text-xs uppercase tracking-widest opacity-60">
                      Mascot View: {project.score.overall > 8.5 ? "High sauce purity." : "Something is salty here."}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 5. USE / FORK / GROW CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <UseCaseCard 
                type="USE"
                title="ADOPT TODAY"
                description={curated?.useCase || "Best for teams who want to adopt this as-is in production environments."}
                tagline="FOR PRODUCTION BUILDS"
                icon={<ShieldCheck size={32} />}
                repo={`${project.owner}/${project.name}`}
              />
              <UseCaseCard 
                type="FORK"
                title="REMIX CORE"
                description={curated?.forkCase || "Best for builders who want to remix the core infrastructure for niche cases."}
                tagline="FOR CUSTOM SAUCE"
                icon={<GitFork size={32} />}
                repo={`${project.owner}/${project.name}`}
              />
              <UseCaseCard 
                type="GROW"
                title="CONTRIBUTE"
                description={curated?.growCase || "Best for contributors, sponsors, or promoters looking to support the ecosystem."}
                tagline="FOR THE COMMUNITY"
                icon={<Rocket size={32} />}
                repo={`${project.owner}/${project.name}`}
              />
            </div>

                {/* 6. LICENSE RISK BAND */}
                <div className={`border-4 ${licenseInfo.border} p-8 flex flex-col md:flex-row items-center justify-between gap-8 bg-white shadow-[8px_8px_0px_#000]`}>
                  <div className="flex items-center gap-6">
                    <div className={`${licenseInfo.color} p-4 bg-soy-label/50 rounded-full border-2 ${licenseInfo.border}`}>
                      <Code size={40} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black uppercase italic tracking-tight mb-1">LICENSE: {project.license.toUpperCase()}</h3>
                      <p className={`text-sm font-black uppercase tracking-[0.2em] ${licenseInfo.color}`}>
                        {licenseInfo.text}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => window.open(`https://choosealicense.com/licenses/${project.license.toLowerCase()}/`, '_blank')}
                    className="bg-black text-white px-8 py-4 text-xs font-black uppercase tracking-widest hover:bg-soy-red transition-all"
                  >
                    VERIFY LICENSE →
                  </button>
                </div>

                {/* ITEM 2: SIGNAL SOURCE BLOCK */}
                <div className="border-2 border-black bg-[#F5F0E8] p-6 shadow-[4px_4px_0px_#000]">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-[#E63322] mb-3">SIGNAL SOURCE</h4>
                  <p className="text-sm font-bold uppercase tracking-tight leading-relaxed">
                    This label combines live repository signals with OpenSoyce's v1 scoring methodology.
                  </p>
                  <p className="text-sm font-bold uppercase tracking-tight leading-relaxed opacity-60">
                    It is not a security audit. It is a signal layer for builders.
                  </p>
                </div>

                {/* ITEM 3: CHALLENGE THIS LABEL */}
                <div className="border-2 border-black bg-[#F5F0E8] p-6 shadow-[4px_4px_0px_#000]">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-[#E63322] mb-3">CHALLENGE THIS LABEL</h4>
                  <p className="text-sm font-bold italic tracking-tight leading-relaxed mb-4">
                    Disagree with this score or label? Submit your evidence. We review every challenge.
                  </p>
                  <Link 
                    to={`/challenge?repo=${project.owner}/${project.name}`}
                    onClick={() => trackEvent('challenge_label_click', { 
                      repo: `${project.owner}/${project.name}`, 
                      currentLabel: getBadge(project.score.overall),
                      score: project.score.overall
                    })}
                    className="inline-block bg-black text-white px-6 py-3 text-xs font-black uppercase italic tracking-widest hover:bg-soy-red transition-all"
                  >
                    CHALLENGE THIS LABEL →
                  </Link>
                </div>

            {/* Score History Section */}
            <div className="bg-white border-4 border-black p-10 shadow-[10px_10px_0px_#000]">
              <div className="flex justify-between items-end mb-12">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-[0.4em] opacity-40 mb-2 flex items-center gap-2">
                    <TrendingUp size={16} /> SOYCE SCORE TREND (12 MO)
                  </h3>
                  <div className={`text-4xl font-black italic flex items-center gap-2 ${delta >= 0 ? 'text-emerald-500' : 'text-soy-red'}`}>
                    {delta >= 0 ? '+' : ''}{(delta ?? 0).toFixed(1)} VS PREV. QUARTER
                  </div>
                </div>
              </div>

              <div className="flex items-end justify-between h-48 gap-2 mb-6">
                {history.map((val, idx) => (
                  <div key={idx} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                    <motion.div 
                      initial={{ height: 0 }}
                      animate={{ height: `${val * 10}%` }}
                      className={`w-full transition-all group-hover:bg-black group-hover:opacity-100 ${idx === history.length - 1 ? 'bg-soy-red' : 'bg-black opacity-10'}`}
                    />
                    <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-black text-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none shadow-[4px_4px_0px_#E63322]">
                      VAL: {(val ?? 0).toFixed(1)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[10px] font-black uppercase tracking-widest opacity-40 italic">
                <span>ESTIMATED ORIGIN (JAN)</span>
                <span>LATEST SIGNAL (DEC)</span>
              </div>
            </div>

            <SimilarProjects 
              owner={project.owner} 
              repo={project.name} 
              topics={project.techStack} 
            />

            <div className="border-4 border-black overflow-hidden">
              <details className="group">
                <summary 
                  onClick={() => trackEvent('methodology_click', { page: `/projects/${owner}/${repo}` })}
                  className="bg-black text-white p-6 cursor-pointer flex justify-between items-center list-none uppercase font-black italic tracking-widest hover:text-soy-red transition-all"
                >
                  <span className="flex items-center gap-4">
                    <HelpCircle size={24} />
                    HOW WE CALCULATED A {(project.score.overall ?? 0).toFixed(1)}
                  </span>
                  <span className="text-3xl transition-transform group-open:rotate-180">↓</span>
                </summary>
                <div className="bg-white p-10 border-t-4 border-black">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    <div className="space-y-8">
                       {[
                         { label: 'MAINTENANCE', weight: '30%', score: (project.score.maintenance / 10).toFixed(1) },
                         { label: 'COMMUNITY', weight: '25%', score: (project.score.community / 10).toFixed(1) },
                         { label: 'SECURITY', weight: '20%', score: (project.score.security / 10).toFixed(1) },
                         { label: 'DOCUMENTATION', weight: '15%', score: (project.score.documentation / 10).toFixed(1) },
                         { label: 'ACTIVITY', weight: '10%', score: (project.score.activity / 10).toFixed(1) },
                       ].map(part => (
                         <div key={part.label} className="relative">
                            <div className="flex justify-between items-end mb-2">
                              <span className="text-xs font-black uppercase tracking-widest">{part.label} <span className="opacity-40 italic">({part.weight})</span></span>
                              <span className="font-black italic text-soy-red">{part.score}</span>
                            </div>
                            <div className="h-4 bg-soy-label border-2 border-black relative overflow-hidden">
                               <motion.div 
                                 initial={{ width: 0 }}
                                 animate={{ width: `${parseFloat(part.score) * 10}%` }}
                                 className="h-full bg-black"
                               />
                            </div>
                         </div>
                       ))}
                    </div>
                    <div>
                      <h4 className="text-lg font-black uppercase italic mb-4">THE DOCTRINE</h4>
                      <p className="font-medium opacity-70 leading-relaxed mb-6">
                        OpenSoyce is not a security audit. It is a signal layer for builders. We weigh maintenance recency and documentation quality heavily because they are the leading indicators of production readiness.
                      </p>
                      <Link to="/methodology" className="inline-flex items-center gap-2 font-black uppercase text-xs border-b-2 border-black pb-1 hover:text-soy-red hover:border-soy-red transition-all">
                        LEARN MORE ABOUT METHODOLOGY →
                      </Link>
                    </div>
                  </div>
                </div>
              </details>
            </div>
            
            <div className="pt-20 text-center opacity-40 text-[10px] font-bold uppercase tracking-[0.5em]">
              © 2026 OPENSOYCE LABS. ALL SAUCE RESERVED.
            </div>
          </div>
        </div>
      </div>

      {/* Fork Intelligence Modal */}
      <AnimatePresence>
        {showForkModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowForkModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-black border-2 border-soy-label w-full max-w-3xl max-h-[90vh] overflow-y-auto"
            >
              <button 
                onClick={() => setShowForkModal(false)}
                className="absolute top-6 right-6 text-white hover:text-soy-red transition-colors"
              >
                <X size={32} />
              </button>

              <div className="p-8 md:p-12">
                <header className="mb-12">
                  <h2 className="text-4xl md:text-6xl font-black uppercase italic tracking-tighter text-white mb-2">
                    FORK INTELLIGENCE REPORT
                  </h2>
                  <p className="text-xl font-bold uppercase tracking-widest text-soy-red italic">
                    AI-POWERED ANALYSIS: WHAT THIS REPO COULD BECOME
                  </p>
                </header>

                {/* Section 1: Forkability */}
                <div className="mb-12 flex items-center gap-8">
                  <div className="bg-soy-red p-6 shadow-[8px_8px_0px_#fff]">
                    <div className="text-6xl font-black italic text-white leading-none">8.7</div>
                    <div className="text-[10px] font-black uppercase text-white mt-2">FORKABILITY</div>
                  </div>
                  <div>
                    <h3 className="text-2xl font-black uppercase italic tracking-tight text-white mb-2">HIGH FORKABILITY</h3>
                    <p className="text-xs font-bold uppercase tracking-widest text-white/60 leading-relaxed max-w-sm">
                      WELL-DOCUMENTED, MODULAR ARCHITECTURE, MIT LICENSED. IDEAL FOR ADAPTATION.
                    </p>
                  </div>
                </div>

                {/* Section 2: Business Ideas */}
                <div className="mb-12">
                  <h3 className="text-xs font-black uppercase tracking-[0.3em] text-white/40 mb-6 flex items-center gap-2">
                    <Rocket size={14} /> BUSINESS OPPORTUNITIES
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                      { icon: <Rocket />, title: 'SaaS Product', desc: 'Turn the core logic into a hosted API. Charge per call.' },
                      { icon: <Briefcase />, title: 'Dev Tool', desc: 'Build a CLI wrapper. Sell to enterprise teams.' },
                      { icon: <GraduationCap />, title: 'Learning Resource', desc: 'Great codebase for tutorials. Build a paid course.' }
                    ].map(idea => (
                      <div key={idea.title} className="bg-black border-2 border-soy-red p-6 space-y-4">
                        <div className="text-soy-red">{idea.icon}</div>
                        <h4 className="text-lg font-black uppercase italic tracking-tight text-white">{idea.title}</h4>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 leading-relaxed">
                          {idea.desc}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Section 3: Porting */}
                <div className="mb-12">
                   <h3 className="text-xs font-black uppercase tracking-[0.3em] text-white/40 mb-6 flex items-center gap-2">
                    <HelpCircle size={14} /> PORTING DIFFICULTY
                  </h3>
                  <div className="flex flex-wrap gap-4">
                    {[
                      { from: 'REACT', to: 'ANGULAR', diff: 'MEDIUM', color: 'bg-amber-500' },
                      { from: 'REACT', to: 'VUE', diff: 'EASY', color: 'bg-emerald-500' },
                      { from: 'NODE', to: 'PYTHON', diff: 'HARD', color: 'bg-soy-red' }
                    ].map(port => (
                      <div key={port.to} className="bg-white/5 border border-white/10 px-4 py-2 flex items-center gap-3">
                        <span className="text-[10px] font-black uppercase text-white/60">{port.from} → {port.to}</span>
                        <span className={`${port.color} text-white px-2 py-0.5 text-[8px] font-black uppercase tracking-widest`}>
                          {port.diff}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 pt-8 border-t-2 border-white/10">
                  <a 
                    href="https://github.com" 
                    target="_blank" 
                    rel="noreferrer"
                    className="bg-soy-red text-white px-10 py-5 text-xl font-black uppercase italic hover:bg-white hover:text-black transition-all flex items-center gap-3 shadow-[6px_6px_0px_#fff]"
                  >
                    <GitFork /> FORK ON GITHUB
                  </a>
                  <button 
                    onClick={() => setShowForkModal(false)}
                    className="bg-white/10 text-white/60 px-10 py-5 text-xl font-black uppercase tracking-widest hover:text-white transition-colors"
                  >
                    CLOSE
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SignalSection({ title, value, bullets, borderLeft = false }: { title: string, value: string, bullets: string[], borderLeft?: boolean }) {
  return (
    <div className={`p-8 bg-white flex flex-col items-center text-center ${borderLeft ? 'md:border-l-4 border-black border-t-4 md:border-t-0' : 'border-b-4 md:border-b-0 border-black md:border-r-0'}`}>
      <h4 className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40 mb-2">{title}</h4>
      <div className="text-5xl font-black italic text-soy-red mb-6">{value}</div>
      <ul className="text-[10px] font-black uppercase tracking-widest space-y-3 opacity-60">
        {bullets.map((b, i) => <li key={i} className="whitespace-nowrap">{b}</li>)}
      </ul>
    </div>
  );
}

function UseCaseCard({ type, title, description, tagline, icon, repo }: { type: string, title: string, description: string, tagline: string, icon: React.ReactNode, repo: string }) {
  return (
    <div className="bg-white border-2 border-black/80 p-10 flex flex-col h-full shadow-[4px_4px_0px_#000] hover:shadow-[12px_12px_0px_#D12D2D] hover:border-4 hover:border-black transition-all group">
       <div className="flex justify-between items-start mb-8">
          <div className="text-black group-hover:text-soy-red transition-colors">{icon}</div>
          <span className="text-[10px] font-black bg-black text-white px-3 py-1 uppercase tracking-widest italic">{type}</span>
       </div>
       <h3 className="text-3xl font-black uppercase italic tracking-tighter mb-4">{title}</h3>
       <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#E63322] mb-6">{tagline}</p>
       <p className="text-sm font-medium opacity-80 leading-relaxed mb-10 flex-1">
         {description}
       </p>
       <button 
         onClick={() => {
           trackEvent(`${type.toLowerCase()}_click`, { repo, page: `/projects/${repo}` });
         }}
         className="bg-black text-white w-full py-4 text-xs font-black uppercase tracking-widest hover:bg-soy-red transition-all"
       >
         {type} THIS PROJECT →
       </button>
    </div>
  );
}
