import React from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { Skull, Ghost, ArrowRight, ExternalLink } from 'lucide-react';
import { trackEvent } from '../utils/analytics';

const DEAD_REPOS = [
  {
    name: "MOMENT.JS",
    owner: "moment",
    score: 3.5,
    staleSince: "SEPT 2020",
    whyItMattered: "The industry standard for date manipulation for nearly a decade.",
    replacedBy: "date-fns / Day.js / Temporal API",
    forkableParts: "Robust timezone database logic.",
    category: "UTILS"
  },
  {
    name: "REQUEST",
    owner: "request",
    score: 2.1,
    staleSince: "FEB 2020",
    whyItMattered: "Made HTTP requests readable before fetch() exist.",
    replacedBy: "Axios / native fetch()",
    forkableParts: "Excellent OAuth 1.0 logic.",
    category: "NETWORK"
  },
  {
    name: "GRUNT",
    owner: "gruntjs",
    score: 2.8,
    staleSince: "2018 (DE FACTO)",
    whyItMattered: "The first true JavaScript task runner.",
    replacedBy: "Vite / Turborepo",
    forkableParts: "Plugin architecture schema.",
    category: "DEVTOOLS"
  },
  {
    name: "BOWER",
    owner: "bower",
    score: 1.5,
    staleSince: "2017",
    whyItMattered: "Managed frontend dependencies when npm couldn't.",
    replacedBy: "npm / pnpm",
    forkableParts: "Registry coordination code.",
    category: "INFRA"
  }
];

export default function Graveyard() {
  const [filter, setFilter] = React.useState('ALL');

  React.useEffect(() => {
    trackEvent('graveyard_click', { page: '/graveyard' });
  }, []);
  const categories = ['ALL', 'MUSEUM PIECES', 'STILL USED NOT FRESH', 'REPLACED BY MODERN OPTIONS', 'STALE BUT FORKABLE'];

  const categoryMap: { [key: string]: string } = {
    'MUSEUM PIECES': 'UTILS',
    'STILL USED NOT FRESH': 'NETWORK',
    'REPLACED BY MODERN OPTIONS': 'DEVTOOLS',
    'STALE BUT FORKABLE': 'INFRA'
  };

  const filtered = filter === 'ALL' ? DEAD_REPOS : DEAD_REPOS.filter(r => r.category === categoryMap[filter]);

  return (
    <div className="min-h-screen bg-soy-label">
      {/* Hero */}
      <section className="bg-white py-24 px-4 border-b-4 border-black">
        <div className="max-w-7xl mx-auto text-center">
          <motion.div
             initial={{ opacity: 0, scale: 0.9 }}
             animate={{ opacity: 1, scale: 1 }}
             className="bg-black text-white px-4 py-2 text-xs font-black uppercase tracking-[0.4em] mb-8 inline-block"
          >
             POST-MORTEM REPORTS
          </motion.div>
          <h1 className="text-6xl md:text-9xl font-black uppercase italic tracking-tighter mb-4 leading-[0.8]">
            POPULAR. INFLUENTIAL. NO LONGER FRESH.
          </h1>
          <p className="text-xl md:text-3xl font-bold uppercase tracking-widest text-soy-red italic">
            These projects shaped the ecosystem. Some still run in production. None are gaining ground.
          </p>
        </div>
      </section>

      {/* Filters */}
      <div className="bg-soy-label border-b-4 border-black sticky top-16 z-30">
        <div className="max-w-7xl mx-auto px-4 py-6 flex flex-wrap justify-center gap-4">
          {categories.map(c => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={`px-6 py-2 text-[10px] font-black uppercase tracking-widest border-2 border-black transition-all ${filter === c ? 'bg-black text-white' : 'hover:bg-white'}`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="max-w-7xl mx-auto px-4 py-20 gap-12 grid grid-cols-1 md:grid-cols-2">
        {filtered.map((repo, index) => (
          <motion.div
            key={repo.name}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white border-4 border-black p-10 shadow-[10px_10px_0px_#000] relative overflow-hidden group"
          >
            {/* Red STALE stamp */}
            <div className="absolute -right-12 top-10 rotate-[25deg] border-4 border-soy-red text-soy-red px-12 py-3 text-3xl font-black uppercase italic tracking-[0.2em] bg-white/80 z-20 pointer-events-none group-hover:scale-110 transition-transform">
              STALE
            </div>

            <div className="flex justify-between items-start mb-8">
              <div>
                 <span className="text-[10px] font-black uppercase tracking-widest opacity-40">{repo.owner}</span>
                 <h2 className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter leading-none">
                    {repo.name}
                 </h2>
              </div>
              <div className="bg-soy-label border-2 border-black p-2 opacity-50">
                 <span className="text-[8px] font-black block uppercase opacity-60">SCORE</span>
                 <span className="text-xl font-black italic tracking-tighter">{(repo.score ?? 0).toFixed(1)}</span>
              </div>
            </div>

            <div className="space-y-6 mb-12">
               <div>
                  <span className="text-[8px] font-black uppercase tracking-widest opacity-40">STALE SINCE</span>
                  <div className="text-lg font-black uppercase italic text-soy-red">{repo.staleSince}</div>
               </div>
               
               <div>
                  <span className="text-[8px] font-black uppercase tracking-widest opacity-40">WHY IT MATTERED</span>
                  <p className="text-sm font-medium leading-relaxed italic">"{repo.whyItMattered}"</p>
               </div>

               <div className="grid grid-cols-2 gap-8">
                  <div>
                    <span className="text-[8px] font-black uppercase tracking-widest opacity-40">REPLACED BY</span>
                    <div className="text-xs font-black uppercase tracking-widest mt-1">{repo.replacedBy}</div>
                  </div>
                  <div>
                    <span className="text-[8px] font-black uppercase tracking-widest opacity-40">FORKABLE PARTS</span>
                    <div className="text-xs font-black uppercase tracking-widest mt-1">{repo.forkableParts}</div>
                  </div>
               </div>
            </div>

            <button className="w-full border-4 border-black py-4 font-black uppercase tracking-widest text-xs hover:bg-black hover:text-white transition-all">
               VIEW POST-MORTEM REPORT →
            </button>
          </motion.div>
        ))}
      </div>

      {/* Bottom CTA */}
      <section className="bg-black py-24 px-4 text-center">
        <motion.div
           whileHover={{ scale: 1.05 }}
           className="max-w-xl mx-auto"
        >
          <h2 className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter text-white mb-10">
            KNOW A DEAD PROJECT?
          </h2>
          <Link to="/claim" className="inline-block bg-soy-red text-white border-4 border-white px-12 py-6 text-xl font-black uppercase italic tracking-widest hover:bg-white hover:text-black transition-all shadow-[10px_10px_0px_#333]">
            NOMINATE IT →
          </Link>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t-4 border-black text-center text-[10px] font-black uppercase tracking-[0.5em] opacity-40">
        © 2026 OPENSOYCE LABS. ALL SAUCE RESERVED.
      </footer>
    </div>
  );
}
