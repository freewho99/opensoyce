import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWatchlist } from '../context/WatchlistContext';
import { Project } from '../types';
import { 
  Plus, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  AlertCircle, 
  Clock, 
  ChevronRight,
  ShieldAlert,
  ArrowUpRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Watchlist() {
  const { watchlist, removeFromWatchlist, addToWatchlist } = useWatchlist();
  const [projectsData, setProjectsData] = useState<Record<string, Project>>({});
  const [loading, setLoading] = useState(true);
  const [hasToken, setHasToken] = useState<boolean | null>(null);

  const PRESETS = [
    { owner: 'facebook', repo: 'react', score: 8.8, desc: 'Web UI Standard' },
    { owner: 'vercel', repo: 'next.js', score: 8.5, desc: 'Full-stack React Framework' },
    { owner: 'tiangolo', repo: 'fastapi', score: 9.2, desc: 'Python API Framework' },
    { owner: 'expressjs', repo: 'express', score: 7.8, desc: 'Node.js Web Server' },
    { owner: 'lodash', repo: 'lodash', score: 8.0, desc: 'Utility Toolkit' },
  ];

  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => setHasToken(data.hasGithubToken))
      .catch(() => setHasToken(false));
  }, []);

  useEffect(() => {
    const fetchWatchlistData = async () => {
      setLoading(true);
      const data: Record<string, Project> = {};
      
      const fetchPromises = watchlist.map(async (item) => {
        try {
          const res = await fetch(`/api/github/${item.owner}/${item.repo}`);
          if (res.ok) {
            const project = await res.json();
            data[`${item.owner}/${item.repo}`] = project;
          } else {
            // Fallback demo data if fetch fails
            data[`${item.owner}/${item.repo}`] = createDemoData(item.owner, item.repo);
          }
        } catch (err) {
          data[`${item.owner}/${item.repo}`] = createDemoData(item.owner, item.repo);
        }
      });

      await Promise.all(fetchPromises);
      setProjectsData(data);
      setLoading(false);
    };

    if (watchlist.length > 0) {
      fetchWatchlistData();
    } else {
      setLoading(false);
    }
  }, [watchlist]);

  const createDemoData = (owner: string, repo: string): Project => ({
    id: `demo-${owner}-${repo}`,
    name: repo,
    owner: owner,
    description: 'Demo project data.',
    stars: 5000,
    forks: 400,
    lastScanned: 'Just now (Demo)',
    status: 'Unverified',
    category: 'Simulation',
    scoreTrend: 'flat',
    score: {
      overall: 8.5,
      maintenance: 90,
      security: 80,
      community: 85,
      documentation: 70
    },
    techStack: ['Demo'],
    license: 'MIT'
  });

  const getScoreAlertBadge = (item: any, currentProject: Project | undefined) => {
    if (!currentProject) return null;
    const initial = item.initialScore;
    const current = currentProject.score.overall;
    
    if (current < initial - 0.5) {
      return (
        <div className="bg-soy-red text-white text-[10px] px-2 py-0.5 font-black uppercase tracking-tighter animate-pulse flex items-center gap-1">
          <ShieldAlert size={10} />
          SCORE DROP
        </div>
      );
    }
    
    if (current > initial + 0.1) {
      return (
        <div className="bg-green-600 text-white text-[10px] px-2 py-0.5 font-black uppercase tracking-tighter flex items-center gap-1">
          <TrendingUp size={10} />
          IMPROVED
        </div>
      );
    }
    
    return null;
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-16 h-16 border-4 border-soy-bottle border-t-soy-red rounded-full animate-spin mb-4 shadow-[4px_4px_0px_#000]"></div>
        <p className="font-bold uppercase tracking-widest italic">Syncing Watchlist...</p>
      </div>
    );
  }

  if (watchlist.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 flex flex-col items-center justify-center text-center">
        <h1 className="text-4xl md:text-6xl font-black uppercase italic tracking-tighter mb-8 bg-soy-bottle text-soy-label px-8 py-6 shadow-[12px_12px_0px_#E63322] leading-tight">
          START TRACKING YOUR CRITICAL DEPENDENCIES TO PREVENT SURPRISES!
        </h1>
        <p className="text-xl font-bold uppercase tracking-widest opacity-60 mb-12 max-w-2xl">
          Your watchlist is empty. Add dependencies to monitor score drops, license changes, and malware. Don't let your stack rot.
        </p>
        <div className="mb-16">
          <Link 
            to="/lookup" 
            className="group relative inline-flex items-center gap-4 bg-soy-red text-white text-3xl font-black uppercase italic px-12 py-6 hover:translate-x-1 hover:-translate-y-1 transition-transform"
          >
            <div className="absolute inset-0 bg-soy-bottle translate-x-3 translate-y-3 -z-10 group-hover:translate-x-4 group-hover:translate-y-4 transition-transform"></div>
            <Plus size={40} strokeWidth={4} />
            ADD REPO
          </Link>
        </div>

        <div className="w-full max-w-4xl border-4 border-soy-bottle bg-white p-8 shadow-[8px_8px_0px_#000] text-left">
          <h3 className="text-2xl font-black uppercase italic tracking-tight mb-4 text-soy-bottle">
            OR SEED WITH POPULAR PRESETS:
          </h3>
          <p className="text-xs font-bold uppercase tracking-widest opacity-60 mb-6">
            Quickly monitor some of the most common packages in the ecosystem with one click.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {PRESETS.map((preset) => (
              <div 
                key={`${preset.owner}/${preset.repo}`} 
                className="border-2 border-soy-bottle/40 p-4 bg-soy-label/20 flex items-center justify-between hover:bg-soy-label/50 transition-colors"
              >
                <div>
                  <h4 className="text-lg font-black uppercase tracking-tight">{preset.owner}/{preset.repo}</h4>
                  <p className="text-[10px] font-bold opacity-60 uppercase tracking-widest mt-1">{preset.desc}</p>
                </div>
                <button
                  onClick={() => addToWatchlist(preset.owner, preset.repo, preset.score)}
                  className="bg-soy-bottle text-soy-label text-xs font-black uppercase px-4 py-2 hover:bg-soy-red hover:text-white transition-colors border-2 border-black"
                >
                  ADD +
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div>
          <h1 className="text-5xl md:text-7xl font-black uppercase italic tracking-tighter mb-4">
            Watchlist <span className="text-soy-red">[{watchlist.length}]</span>
          </h1>
          <p className="text-xl font-medium opacity-60 uppercase tracking-widest">
            Monitoring critical dependency health transitions.
          </p>
        </div>
        
        {hasToken === false && (
          <div className="bg-amber-100 border-2 border-soy-bottle p-4 flex items-start gap-3 shadow-[4px_4px_0px_#000]">
            <AlertCircle className="text-amber-600 shrink-0" size={20} />
            <div>
              <p className="text-xs font-black uppercase tracking-widest mb-1">DEMO MODE ACTIVE</p>
              <p className="text-[10px] font-bold opacity-70">Add GITHUB_TOKEN to .env for real-time score updates.</p>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6">
        {watchlist.map((item) => {
          const project = projectsData[`${item.owner}/${item.repo}`];
          const key = `${item.owner}/${item.repo}`;
          
          return (
            <motion.div 
              key={key}
              layout
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white border-4 border-soy-bottle p-6 relative group hover:bg-soy-label transition-colors shadow-[8px_8px_0px_#000]"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <Link 
                      to={`/projects/${item.owner}/${item.repo}`}
                      className="text-2xl font-black uppercase italic hover:text-soy-red transition-colors flex items-center gap-2"
                    >
                      {item.owner}/{item.repo}
                      <ArrowUpRight size={20} className="opacity-40 group-hover:opacity-100" />
                    </Link>
                    {getScoreAlertBadge(item, project)}
                  </div>
                  
                  <div className="flex flex-wrap gap-4 text-[10px] font-bold uppercase tracking-widest opacity-60">
                    <span className="flex items-center gap-1"><Clock size={12} /> ADDED {new Date(item.dateAdded).toLocaleDateString()}</span>
                    <span className="flex items-center gap-1">INITIAL SCORE: {(item.initialScore ?? 0).toFixed(1)}</span>
                    {project && (
                      <span className="flex items-center gap-1 text-soy-bottle">LAST SYNC {project.lastScanned}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-8 md:border-l-4 md:border-soy-bottle md:pl-8">
                  {project ? (
                    <div className="text-right">
                      <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">CURRENT SCORE</p>
                      <div className="flex items-baseline gap-2">
                        {project.scoreTrend === 'up' && <TrendingUp className="text-green-600" size={24} />}
                        {project.scoreTrend === 'down' && <TrendingDown className="text-soy-red" size={24} />}
                        {project.scoreTrend === 'flat' && <Minus className="text-soy-bottle" size={24} />}
                        <span className="text-5xl font-black italic">{(project.score.overall ?? 0).toFixed(1)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="h-10 w-24 bg-soy-bottle/5 animate-pulse"></div>
                  )}

                  <div className="flex flex-col gap-2">
                    <Link 
                      to={`/projects/${item.owner}/${item.repo}`}
                      className="bg-soy-bottle text-soy-label p-2 hover:bg-soy-red transition-colors"
                      title="View Details"
                    >
                      <ChevronRight size={20} />
                    </Link>
                    <button 
                      onClick={() => {
                        removeFromWatchlist(item.owner, item.repo);
                      }}
                      className="bg-white border-2 border-soy-bottle text-[10px] font-black uppercase px-2 py-1 hover:bg-soy-red hover:text-white transition-colors"
                    >
                      UNWATCH
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
      
      <div className="mt-20 border-4 border-soy-bottle bg-white p-8 flex flex-col md:flex-row items-center justify-between gap-8 shadow-[8px_8px_0px_#E63322]">
        <div>
          <h3 className="text-3xl font-black uppercase italic tracking-tight mb-2 text-soy-bottle">NEED MORE COVERAGE?</h3>
          <p className="font-bold opacity-60 uppercase tracking-widest italic">ENTERPRISE SAUCE PLANS INCLUDE REAL-TIME SMS ALERTS ON ZERO-DAY DISCOVERIES.</p>
        </div>
        <Link to="/pricing" className="bg-soy-bottle text-soy-label text-xl font-black uppercase px-8 py-4 hover:bg-soy-red transition-colors whitespace-nowrap">UPGRADE NOW</Link>
      </div>
    </div>
  );
}
