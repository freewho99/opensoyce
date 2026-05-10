import React, { useState } from 'react';
import { Star, Shield, ExternalLink, ArrowUpRight, GitFork, ArrowUp, ArrowDown, Minus, Clock, Copy, Check, Loader2 } from 'lucide-react';
import { Project } from '../types';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useProjects } from '../context/ProjectContext';

import { trackEvent } from '../utils/analytics';

interface ProjectCardProps {
  project: Project;
  key?: string;
  isCompareMode?: boolean;
  isSelected?: boolean;
  onToggleCompare?: () => void;
  source?: string;
}

export default function ProjectCard({ project, isCompareMode, isSelected, onToggleCompare, source }: ProjectCardProps) {
  const navigate = useNavigate();
  const { forkProject } = useProjects(); // Mock usage if needed
  const [showTooltip, setShowTooltip] = useState(false);
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const getFreshness = (lastScanned: string) => {
    const text = lastScanned.toLowerCase();
    if (text.includes('today') || text.includes('yesterday') || text.match(/[1-6]\s+day/)) {
      return { label: 'Fresh', color: 'bg-emerald-500' };
    }
    if (text.match(/([7-9]|1[0-9]|2[0-9]|30)\s+day/)) {
      return { label: 'Aging', color: 'bg-amber-500' };
    }
    return { label: 'Stale', color: 'bg-rose-500' };
  };

  const freshness = getFreshness(project.lastScanned);
  const { updateProject } = useProjects();

  const copyBadge = (e: React.MouseEvent) => {
    e.stopPropagation();
    const markdown = `[![OpenSoyce Score](https://opensoyce.io/badge/${project.owner}/${project.name}.svg)](https://opensoyce.io/projects/${project.owner}/${project.name})`;
    navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDetailsClick = async (e: React.MouseEvent) => {
    trackEvent('analyze_project_click', { 
      repo: `${project.owner}/${project.name}`, 
      source: source || 'card' 
    });
    // If it's a real GH project (has owner and not mock-like user), refresh in background
    if (project.owner && project.owner !== 'current-user') {
      setRefreshing(true);
      try {
        const res = await fetch(`/api/github/${project.owner}/${project.name}`);
        if (res.ok) {
          const data = await res.json();
          // Update global state live
          updateProject(project.id, {
            ...data,
            id: project.id // Keep local ID
          });
        }
      } catch (err) {
        console.error('Live refresh failed:', err);
      } finally {
        setRefreshing(false);
      }
    }
  };

  return (
    <div 
      className={`group bg-white border-2 border-soy-bottle p-6 transition-all flex flex-col lg:grid lg:grid-cols-12 gap-6 items-center relative ${
        isSelected ? 'ring-4 ring-soy-red shadow-[8px_8px_0px_#D12D2D]' : 'hover:shadow-[8px_8px_0px_#302C26]'
      }`}
    >
      {isCompareMode && (
        <div className="absolute top-4 right-4 z-10">
          <input 
            type="checkbox" 
            checked={isSelected} 
            onChange={onToggleCompare}
            className="w-6 h-6 border-2 border-soy-bottle text-soy-red focus:ring-soy-red cursor-pointer"
          />
        </div>
      )}

      {/* LEFT: Project Identity */}
      <div className="lg:col-span-6 w-full">
        <div className="flex flex-col mb-2">
          <div className="flex items-center gap-3">
            <Link to={`/projects/${project.owner}/${project.name}`} className="text-2xl font-black uppercase italic tracking-tight hover:text-soy-red transition-colors">
              {project.name}
            </Link>
            {project.status === 'Verified' && (
              <span className="bg-soy-red text-white text-[8px] font-black px-2 py-0.5 uppercase tracking-widest italic">
                VERIFIED
              </span>
            )}
            {project.category === 'skills-agents' && project.score.overall >= 7.5 && (
              <span className="border border-[#16a34a] text-[#16a34a] text-[8px] font-black px-2 py-0.5 uppercase tracking-widest">
                SKILL READY
              </span>
            )}
            {project.category === 'skills-agents' && project.score.overall >= 8.0 && (
              <span className="border border-[#2563eb] text-[#2563eb] text-[8px] font-black px-2 py-0.5 uppercase tracking-widest">
                AGENT READY
              </span>
            )}
          </div>
          {project.isFork && (
            <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest opacity-40 italic mt-1">
              <GitFork size={10} /> ADAPTED FROM {project.parentOwner}/{project.parentName}
            </div>
          )}
        </div>
        <p className="text-soy-bottle/70 text-sm mb-4 line-clamp-2 uppercase font-medium italic opacity-60">
          "{project.description}"
        </p>
        
        <div className="flex flex-wrap gap-4 text-xs font-mono font-bold uppercase text-soy-bottle/60">
          <div className="flex items-center gap-1 bg-soy-label px-2 py-1">
            <Star size={12} className="text-soy-red" />
            <span>{((project.stars || 0) / 1000).toFixed(1)}k</span>
          </div>
          
          <div className="flex items-center gap-1.5 px-2 py-1 bg-soy-bottle/5 border border-soy-bottle/10 text-[10px] font-black uppercase tracking-wider">
            <div className={`w-2 h-2 rounded-full ${freshness.color}`} />
            <span>{freshness.label}</span>
          </div>

          <div className="flex items-center gap-1 opacity-50 text-[10px]">
            <Clock size={12} />
            <span>{project.lastScanned}</span>
          </div>
        </div>
      </div>

      {/* CENTER: Big Score */}
      <div className="lg:col-span-3 w-full flex flex-col items-center justify-center border-y-2 lg:border-y-0 lg:border-x-2 border-soy-bottle/10 py-6 lg:py-0">
        <div className="flex items-baseline gap-1">
          <span className="text-5xl font-black italic tracking-tighter text-soy-red leading-none">
            {(project.score.overall ?? 0).toFixed(1)}
          </span>
          <span className="text-xs font-black uppercase tracking-widest opacity-30 italic">/ 10</span>
        </div>
        
        <div 
          className="relative flex items-center gap-1 text-[10px] font-black uppercase tracking-widest mt-2 cursor-help group/tooltip"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          {refreshing ? <Loader2 size={12} className="animate-spin" /> : (
            <>
              {project.scoreTrend === 'up' && <ArrowUp size={12} className="text-emerald-500" />}
              {project.scoreTrend === 'down' && <ArrowDown size={12} className="text-rose-500" />}
              {project.scoreTrend === 'flat' && <Minus size={12} className="text-soy-bottle/30" />}
              <span className="opacity-40">DETAILS</span>
            </>
          )}

          <AnimatePresence>
            {showTooltip && (
              <motion.div 
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 z-50 w-56 bg-black text-white p-4 shadow-xl border-2 border-soy-red"
              >
                <div className="text-[10px] font-black uppercase tracking-widest border-b border-white/10 pb-2 mb-3 italic">Score Breakdown</div>
                <div className="space-y-3">
                  <TooltipRow label="Maintenance" value={project.score.maintenance} />
                  <TooltipRow label="Security" value={project.score.security} />
                  <TooltipRow label="Community" value={project.score.community} />
                  <TooltipRow label="Documentation" value={project.score.documentation} />
                </div>
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[8px] border-t-black"></div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* RIGHT: Actions */}
      <div className="lg:col-span-3 w-full flex flex-col gap-2">
        <Link 
          to={`/projects/${project.owner}/${project.name}`}
          onClick={handleDetailsClick}
          className="w-full bg-black text-white text-center py-3 text-[10px] font-black uppercase tracking-widest hover:bg-soy-red transition-colors flex items-center justify-center gap-2 shadow-[4px_4px_0px_#444]"
        >
          ANALYZE REPO <ArrowUpRight size={14} />
        </Link>
        <button 
          onClick={copyBadge}
          className="w-full bg-white border-2 border-black py-3 text-[10px] font-black uppercase tracking-widest hover:bg-soy-label transition-all flex items-center justify-center gap-2"
        >
          {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
          {copied ? 'COPIED' : 'COPY BADGE'}
        </button>
      </div>
    </div>
  );
}

function TooltipRow({ label, value }: { label: string, value: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[8px] font-bold uppercase tracking-tighter">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-1 bg-white/20 w-full rounded-full overflow-hidden">
        <div 
          className="h-full bg-soy-red" 
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
