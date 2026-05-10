import React, { useState } from 'react';
import { useProjects } from '../context/ProjectContext';
import { ShieldCheck, AlertCircle, Search, FileJson, ArrowRight, Activity, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Project } from '../types';

export default function Scan() {
  const { projects } = useProjects();
  const [input, setInput] = useState('');
  const [results, setResults] = useState<{
    dependencies: { name: string; version: string; project?: Project }[];
    overallScore: number;
    healthStatus: 'Excellent' | 'Good' | 'Risky' | 'Critical';
  } | null>(null);

  const handleScan = () => {
    try {
      const pkg = JSON.parse(input);
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      
      const scannedDeps = Object.entries(allDeps).map(([name, version]) => {
        // Try to match by name (case-insensitive)
        const match = projects.find(p => p.name.toLowerCase() === name.toLowerCase());
        return {
          name,
          version: version as string,
          project: match
        };
      });

      const projectsWithScores = scannedDeps.filter(d => d.project).map(d => d.project!);
      const totalScore = projectsWithScores.length > 0
        ? projectsWithScores.reduce((acc, p) => acc + p.score.overall, 0) / projectsWithScores.length
        : 0;

      let status: 'Excellent' | 'Good' | 'Risky' | 'Critical' = 'Critical';
      if (totalScore >= 8.5) status = 'Excellent';
      else if (totalScore >= 7) status = 'Good';
      else if (totalScore >= 5) status = 'Risky';

      setResults({
        dependencies: scannedDeps,
        overallScore: totalScore,
        healthStatus: status
      });
    } catch (e) {
      alert('Invalid package.json format. Please check your syntax.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="mb-12">
        <h1 className="text-5xl font-bold uppercase italic tracking-tighter mb-4">Stack Scanner</h1>
        <p className="text-xl font-medium opacity-60">Paste your package.json to reveal the hidden health of your dependencies.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <div className="space-y-6">
          <div className="bg-white border-4 border-soy-bottle p-6 shadow-[8px_8px_0px_#302C26]">
            <div className="flex items-center gap-2 mb-4">
              <FileJson className="text-soy-red" size={24} />
              <h2 className="text-xl font-bold uppercase italic tracking-tight">Input Manifest</h2>
            </div>
            <textarea
              className="w-full h-96 bg-soy-label/20 p-4 font-mono text-xs border-2 border-soy-bottle outline-none focus:ring-2 focus:ring-soy-red resize-none"
              placeholder='{ "dependencies": { "betaswarm": "^1.0.0", ... } }'
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button
              onClick={handleScan}
              className="w-full mt-6 bg-soy-bottle text-soy-label py-4 font-bold uppercase tracking-widest hover:bg-soy-red transition-all flex items-center justify-center gap-2"
            >
              Run Soyce Scan <Search size={20} />
            </button>
          </div>
        </div>

        <div>
          <AnimatePresence mode="wait">
            {results ? (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                {/* Health Overview */}
                <div className="bg-soy-bottle text-soy-label p-8 border-l-8 border-soy-red shadow-xl">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-[0.3em] text-soy-red mb-2">Stack Health Report</h3>
                      <div className="text-4xl font-bold uppercase italic tracking-tighter">{results.healthStatus}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold uppercase opacity-50">Stack Score</div>
                      <div className="text-5xl font-bold">{(results.overallScore ?? 0).toFixed(1)}</div>
                    </div>
                  </div>
                  
                  <div className="h-4 bg-white/10 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${results.overallScore * 10}%` }}
                      className="h-full bg-soy-red"
                    />
                  </div>
                </div>

                {/* Dependency List */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-[0.3em] opacity-40">Ingredient Analysis</h3>
                  <div className="space-y-2">
                    {results.dependencies.map((dep, idx) => (
                      <div key={idx} className="bg-white border-2 border-soy-bottle p-4 flex justify-between items-center group hover:bg-soy-label transition-colors">
                        <div>
                          <div className="font-bold uppercase tracking-tight flex items-center gap-2">
                            {dep.name}
                            {dep.project && (
                              <span className="bg-soy-red/10 text-soy-red text-[8px] px-1 font-bold border border-soy-red uppercase tracking-wider">
                                Scanned
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] font-mono opacity-50">{dep.version}</div>
                        </div>
                        <div className="text-right">
                          {dep.project ? (
                            <div className="flex items-center gap-3">
                              <div className="text-[10px] space-y-0.5">
                                <div className="font-bold flex items-center justify-end gap-1">
                                  {dep.project.score.overall}
                                  {dep.project.scoreTrend === 'up' && <TrendingUp size={10} className="text-emerald-500" />}
                                </div>
                                <div className="opacity-40 uppercase tracking-tighter italic">Soyce Score</div>
                              </div>
                              <ArrowRight size={16} className="opacity-20 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                            </div>
                          ) : (
                            <span className="text-[10px] font-bold uppercase tracking-widest opacity-20 italic">Unscanned</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-12 border-4 border-dashed border-soy-bottle/20 rounded-xl text-center">
                 <Activity size={48} className="opacity-10 mb-4" />
                 <p className="text-lg font-bold uppercase italic tracking-widest opacity-20">Waiting for stack manifest...</p>
                 <p className="text-xs font-medium opacity-20 max-w-xs mt-2">Upload your package.json on the left to verify the nutritional value of your code.</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
