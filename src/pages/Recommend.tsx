import React, { useState } from 'react';
import { useProjects } from '../context/ProjectContext';
import { BrainCircuit, Sparkles, ArrowRight, Shield, Rocket, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Project } from '../types';
import ProjectCard from '../components/ProjectCard';

export default function Recommend() {
  const { projects } = useProjects();
  const [prompt, setPrompt] = useState('');
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [recommendations, setRecommendations] = useState<{
    items: { project: Project; reason: string }[];
    combinedScore: number;
    explanation: string;
  } | null>(null);

  const techOptions = ['React', 'Angular', 'Node.js', 'Python', 'Rust', 'Go', 'Docker', 'Redis', 'Wasm', 'Warp', 'SQLite'];

  const handleRecommend = (e: React.FormEvent) => {
    e.preventDefault();
    
    const query = (prompt + ' ' + selectedTools.join(' ')).toLowerCase();
    
    // Simple mock logic for recommendation
    const matches = projects.map(p => {
      let weight = 0;
      if (query.includes(p.name.toLowerCase())) weight += 10;
      if (query.includes(p.category.toLowerCase())) weight += 5;
      p.techStack.forEach(t => {
        if (query.includes(t.toLowerCase())) weight += 3;
      });
      p.description.toLowerCase().split(' ').forEach(word => {
        if (query.includes(word) && word.length > 4) weight += 1;
      });

      return { project: p, score: weight };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

    const combined = matches.length > 0
      ? matches.reduce((acc, m) => acc + m.project.score.overall, 0) / matches.length
      : 0;

    setRecommendations({
      items: matches.map(m => ({
        project: m.project,
        reason: `Based on your interest in ${m.project.category} and your tech stack preferences.`
      })),
      combinedScore: combined,
      explanation: `We've curated a high-trust stack with an average Soyce Score of ${(combined ?? 0).toFixed(1)}. These projects provide the most reliable foundations for building ${prompt}.`
    });
  };

  const toggleTech = (tech: string) => {
    setSelectedTools(prev => 
      prev.includes(tech) ? prev.filter(t => t !== tech) : [...prev, tech]
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="mb-12">
        <h1 className="text-5xl font-bold uppercase italic tracking-tighter mb-4">AI Ingredient Recommender</h1>
        <p className="text-xl font-medium opacity-60">Describe your project, and we'll find the highest-quality open-source sauce for your stack.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Form Column */}
        <div className="lg:col-span-12">
          <form onSubmit={handleRecommend} className="bg-white border-4 border-soy-bottle p-8 shadow-[8px_8px_0px_#302C26] space-y-8">
            <div className="space-y-4">
              <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.3em] opacity-40">
                <BrainCircuit size={16} className="text-soy-red" /> What are you building?
              </label>
              <textarea
                className="w-full bg-soy-label/20 p-6 text-2xl font-bold uppercase italic border-2 border-soy-bottle outline-none focus:ring-4 focus:ring-soy-red transition-all resize-none"
                placeholder="e.g. A privacy-first multi-agent chat system..."
                rows={2}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                required
              />
            </div>

            <div className="space-y-4">
              <label className="text-xs font-bold uppercase tracking-[0.3em] opacity-40">Target Tech Stack</label>
              <div className="flex flex-wrap gap-2">
                {techOptions.map(tech => (
                  <button
                    key={tech}
                    type="button"
                    onClick={() => toggleTech(tech)}
                    className={`px-4 py-2 border-2 text-xs font-bold uppercase transition-all ${
                      selectedTools.includes(tech) 
                        ? 'bg-soy-red text-white border-soy-bottle' 
                        : 'bg-white text-soy-bottle border-soy-bottle/20 hover:border-soy-bottle'
                    }`}
                  >
                    {tech}
                  </button>
                ))}
              </div>
            </div>

            <button 
              type="submit"
              className="w-full bg-soy-red text-white py-6 text-xl font-bold uppercase tracking-[0.2em] italic flex items-center justify-center gap-3 hover:bg-soy-bottle transition-all"
            >
              Simulate Recommendation <Sparkles size={24} />
            </button>
          </form>
        </div>

        {/* Results Column */}
        {recommendations && (
          <div className="lg:col-span-12 mt-12 space-y-12">
             <div className="bg-soy-bottle text-soy-label p-10 border-l-8 border-soy-red shadow-2xl relative overflow-hidden">
                <div className="relative z-10">
                  <div className="flex items-center gap-2 text-soy-red uppercase font-bold tracking-[0.4em] mb-4">
                    <Rocket size={20} /> Optimized Recipe
                  </div>
                  <h2 className="text-5xl font-bold uppercase italic tracking-tighter mb-6 leading-tight max-w-2xl">
                    The {prompt.split(' ').slice(0, 3).join('-')} Stack
                  </h2>
                  <p className="text-xl font-medium opacity-80 mb-8 max-w-3xl leading-relaxed">
                    {recommendations.explanation}
                  </p>
                  <div className="flex items-baseline gap-4">
                    <span className="text-sm font-bold uppercase tracking-widest opacity-40">Combined Stack Score:</span>
                    <span className="text-5xl font-bold text-soy-red">{(recommendations.combinedScore ?? 0).toFixed(1)}</span>
                  </div>
                </div>
                <div className="absolute top-0 right-0 w-64 h-64 bg-soy-red/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
             </div>

             <div className="space-y-6">
                <h3 className="text-xs font-bold uppercase tracking-[0.3em] opacity-40 flex items-center gap-2">
                  <Info size={14} /> RECOMMENDED INGREDIENTS
                </h3>
                <div className="grid grid-cols-1 gap-6">
                  {recommendations.items.map((item, idx) => (
                    <motion.div
                      key={item.project.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className="space-y-2"
                    >
                      <ProjectCard project={item.project} />
                      <div className="px-6 py-3 bg-white/50 border-x-2 border-b-2 border-soy-bottle text-[10px] font-bold uppercase tracking-widest text-soy-red italic">
                        Why this: {item.reason}
                      </div>
                    </motion.div>
                  ))}
                </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
