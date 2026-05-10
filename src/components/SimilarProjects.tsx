import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getSimilarProjects, CategoryProject } from '../data/categories';
import { motion } from 'motion/react';
import { ArrowRight, Sparkles } from 'lucide-react';

interface Props {
  owner: string;
  repo: string;
  topics?: string[];
}

export default function SimilarProjects({ owner, repo, topics = [] }: Props) {
  const result = getSimilarProjects(owner, repo, topics);
  const navigate = useNavigate();

  if (!result) return null;

  const { category, others } = result;

  return (
    <div className="mt-16 mb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8">
        <div>
          <h3 className="text-2xl font-black uppercase italic tracking-tighter flex items-center gap-3">
            <span className="text-soy-red">{category.icon}</span> 
            SIMILAR PROJECTS IN: {category.title}
          </h3>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40 italic mt-1">
            {category.tagline}
          </p>
        </div>
        <Link 
          to={`/compare/${category.slug}`}
          className="text-[10px] font-black uppercase tracking-widest text-soy-red hover:text-black transition-colors flex items-center gap-2"
        >
          SEE FULL COMPARISON <ArrowRight size={14} />
        </Link>
      </div>

      <div className="flex overflow-x-auto pb-4 gap-4 scrollbar-hide">
        {others.map((project) => (
          <SimilarCard key={`${project.owner}/${project.repo}`} project={project} />
        ))}
      </div>
    </div>
  );
}

function SimilarCard({ project }: { project: CategoryProject, key?: string }) {
  const [score, setScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(!project.githubFallback);
  const navigate = useNavigate();

  useEffect(() => {
    if (project.githubFallback) return;

    async function fetchScore() {
      try {
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ owner: project.owner, repo: project.repo })
        });
        const data = await res.json();
        if (res.ok) {
          setScore(data.total);
        }
      } catch (e) {
        console.error('Failed to fetch similar project score', e);
      } finally {
        setLoading(false);
      }
    }
    fetchScore();
  }, [project.owner, project.repo, project.githubFallback]);

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="min-w-[280px] bg-soy-label/20 border-2 border-black p-5 relative overflow-hidden flex flex-col justify-between shadow-[4px_4px_0px_#000]"
    >
      <div>
        <div className="flex justify-between items-start mb-3">
          <h4 className="text-sm font-black uppercase italic tracking-tight truncate max-w-[160px]">
            {project.name}
          </h4>
          <div className="bg-white border border-black px-2 py-0.5 shadow-[2px_2px_0px_#E63322]">
            {loading ? (
              <motion.span 
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className="text-[10px] font-black italic tracking-tighter"
              >
                --
              </motion.span>
            ) : (
              <motion.span 
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-xs font-black italic text-soy-red"
              >
                {project.githubFallback ? 'N/A' : (score?.toFixed(1) || 'N/A')}
              </motion.span>
            )}
          </div>
        </div>

        <p className="text-[10px] font-bold opacity-70 mb-4 leading-relaxed line-clamp-2">
          {project.tagline}
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          {project.badge && (
            <span className="bg-soy-red text-white px-2 py-0.5 text-[8px] font-black uppercase tracking-widest italic">
              {project.badge}
            </span>
          )}
          {project.earlyBreakout && (
             <span className="bg-[#E63322] text-white text-[8px] font-black uppercase tracking-widest px-2 py-0.5 border border-black flex items-center gap-1">
              🚀 EARLY BREAKOUT
            </span>
          )}
          {project.githubFallback && (
            <span className="bg-black text-white px-2 py-0.5 text-[8px] font-black uppercase tracking-widest italic">
              NOT YET ON GITHUB
            </span>
          )}
        </div>
        {project.earlyBreakout && project.momentumNote && (
          <p className="text-[7px] font-black uppercase tracking-[0.2em] text-soy-red mt-[-8px] mb-4 italic leading-tight">
            {project.momentumNote}
          </p>
        )}
      </div>

      <button 
        onClick={() => navigate(`/lookup?q=${project.owner}/${project.repo}`)}
        className="w-full bg-black text-white py-2 text-[10px] font-black uppercase tracking-widest italic hover:bg-soy-red transition-all flex items-center justify-center gap-2"
        disabled={project.githubFallback}
      >
        {project.githubFallback ? 'COMING SOON' : 'ANALYZE'} <ArrowRight size={12} />
      </button>

      {/* Decorative pulse background */}
      {loading && (
        <motion.div 
          animate={{ scale: [1, 1.2, 1], opacity: [0.05, 0.1, 0.05] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="absolute -right-4 -bottom-4 text-soy-red pointer-events-none"
        >
          <Sparkles size={80} />
        </motion.div>
      )}
    </motion.div>
  );
}
