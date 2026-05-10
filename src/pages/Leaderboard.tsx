import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, ArrowUpDown, ChevronRight, Loader2 } from 'lucide-react';
import ProjectCard from '../components/ProjectCard';
import { useProjects } from '../context/ProjectContext';
import { motion, AnimatePresence } from 'motion/react';
import { Project } from '../types';
import { LEADERBOARD_REPOS } from '../data/leaderboardRepos';

export default function Leaderboard() {
  const { projects: localProjects } = useProjects();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [searchResults, setSearchResults] = useState<Project[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const categories = ['All', 'INFRASTRUCTURE', 'DEVTOOLS', 'DATA SOVEREIGNTY', 'AGENTIC AI', 'DESIGN TOOLS', 'SKILLS & AGENTS', 'SECURITY'];

  // Map real repos to project type
  const realProjects: Project[] = LEADERBOARD_REPOS.map(r => ({
    id: `${r.owner}-${r.repo}`,
    name: r.name,
    owner: r.owner,
    description: r.description,
    stars: r.stars,
    forks: Math.floor(r.stars / 10), // mock forks if not in data
    lastScanned: 'Just now',
    status: 'Verified',
    category: r.category,
    scoreTrend: 'up',
    score: {
      overall: r.score,
      maintenance: r.score * 10,
      security: 85,
      community: 90,
      documentation: 95
    },
    techStack: [r.language],
    license: r.license
  }));

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!search.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(search)}`);
        const data = await res.json();
        
        if (data.items) {
          const mapped: Project[] = data.items.map((repo: any) => ({
            id: repo.id.toString(),
            name: repo.name,
            owner: repo.owner.login,
            description: repo.description || 'No description provided.',
            stars: repo.stargazers_count,
            forks: repo.forks_count,
            lastScanned: 'Live Search',
            status: 'Verified', // Match the UI requirement for search results
            category: repo.language || 'Unknown',
            scoreTrend: 'flat',
            score: {
              overall: (repo.stargazers_count > 1000 ? 8.5 : 7.2), // Mock score for search results as per instructions
              maintenance: 80,
              security: 75,
              community: 90,
              documentation: 85
            },
            techStack: repo.topics || [],
            license: repo.license ? repo.license.spdx_id : 'No License'
          }));
          setSearchResults(mapped);
        }
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [search]);

  // Use real projects by default, then filter
  const displayProjects = search.trim() ? searchResults : realProjects.filter(p => {
    const matchesCategory = category === 'All' || p.category === category;
    return matchesCategory;
  });

  const toggleCompare = (id: string) => {
    setCompareIds(prev => {
      if (prev.includes(id)) return prev.filter(i => i !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  };

  const handleCompare = () => {
    if (compareIds.length >= 2) {
      navigate(`/compare?ids=${compareIds.join(',')}`);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-12 relative">
      <div className="flex justify-between items-end mb-12">
        <div>
          <h1 className="text-5xl font-bold uppercase italic tracking-tighter mb-4">Leaderboards</h1>
          <p className="text-xl font-medium opacity-60">Ranked by Soyce Score. High maintenance, higher trust.</p>
        </div>
        <button 
          onClick={() => setIsCompareMode(!isCompareMode)}
          className={`px-6 py-3 text-xs font-bold uppercase tracking-widest border-2 border-soy-bottle hover:bg-soy-red hover:text-white transition-all ${
            isCompareMode ? 'bg-soy-red text-white' : 'bg-white'
          }`}
        >
          {isCompareMode ? 'Exit Compare' : 'Compare Mode'}
        </button>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col lg:flex-row gap-4 mb-8">
        <div className="flex-1 relative">
          {isSearching ? (
            <Loader2 className="absolute left-4 top-1/2 -translate-y-1/2 text-soy-red animate-spin" size={20} />
          ) : (
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 opacity-30" size={20} />
          )}
          <input 
            type="text" 
            placeholder={isSearching ? "SEARCHING GITHUB..." : "Search projects, technology, or keywords..."}
            className={`w-full bg-white border-2 border-soy-bottle p-4 pl-12 font-medium focus:ring-2 focus:ring-soy-red outline-none transition-all ${isSearching ? 'placeholder-soy-red opacity-80' : ''}`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        <div className="flex gap-4 overflow-x-auto pb-2 lg:pb-0 scrollbar-hide">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => {
                setCategory(cat);
                setSearch(''); // Clear search when switching categories to avoid confusion
              }}
              className={`px-6 py-4 text-xs font-bold uppercase tracking-widest border-2 border-soy-bottle whitespace-nowrap transition-all ${
                category === cat ? 'bg-soy-bottle text-soy-label' : 'bg-white hover:bg-soy-label'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Leaderboard Grid */}
      <div className="space-y-6">
        <div className="hidden lg:grid grid-cols-12 px-6 text-[10px] font-black uppercase tracking-[0.2em] opacity-40 mb-2">
          <div className="col-span-6">PROJECT IDENTITY</div>
          <div className="col-span-3 text-center">SOYCE SCORE</div>
          <div className="col-span-3 text-right">OPERATIONS</div>
        </div>
        
        {displayProjects.length > 0 ? (
          displayProjects.map((project, index) => (
            <ProjectCard 
              key={project.id} 
              project={project} 
              isCompareMode={isCompareMode}
              isSelected={compareIds.includes(project.id)}
              onToggleCompare={() => toggleCompare(project.id)}
              source="leaderboard"
            />
          ))
        ) : (
          <div className="py-20 text-center border-4 border-dashed border-soy-bottle/20 rounded-lg">
             <p className="text-xl font-medium opacity-40 uppercase italic tracking-widest">
               {isSearching ? 'SCANNING GITHUB REPOSITORIES...' : 'No sauce found for this query.'}
             </p>
          </div>
        )}
      </div>

      {/* Sticky Compare Button */}
      <AnimatePresence>
        {compareIds.length >= 2 && (
          <motion.div 
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 pointer-events-auto"
          >
            <button 
              onClick={handleCompare}
              className="bg-soy-red text-white px-12 py-5 text-xl font-bold uppercase tracking-[0.2em] italic shadow-[8px_8px_0px_#302C26] hover:bg-soy-bottle transition-all flex items-center gap-4"
            >
              Compare ({compareIds.length}) Projects <ChevronRight />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Suggest Tool */}
      <div className="mt-20 border-4 border-soy-bottle p-12 bg-white flex flex-col md:flex-row items-center justify-between gap-8">
        <div>
          <h3 className="text-3xl font-bold uppercase italic tracking-tighter mb-2">Missing a great tool?</h3>
          <p className="font-medium opacity-60">Help us grow the ecosystem by submitting a new open-source project.</p>
        </div>
        <button className="bg-soy-red text-white px-10 py-5 text-lg font-bold uppercase tracking-widest hover:bg-soy-bottle transition-all shadow-[6px_6px_0px_#302C26] flex items-center gap-2">
          Submit Project <ChevronRight />
        </button>
      </div>
    </div>
  );
}
