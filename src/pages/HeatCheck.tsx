import React from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { 
  TrendingUp, ShieldCheck, Zap, 
  AlertTriangle, Clock, ArrowRight,
  FlaskConical, CheckCircle2
} from 'lucide-react';
import { trackEvent } from '../utils/analytics';

export default function HeatCheck() {
  return (
    <div className="bg-soy-label min-h-screen">
      {/* Hero Section */}
      <section className="py-24 px-4 bg-white border-b-4 border-black text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-soy-red text-white px-4 py-1 text-[10px] font-black uppercase tracking-[0.4em] mb-8 inline-block"
        >
          EDITION #001 — MAY 2026
        </motion.div>
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-6xl md:text-9xl font-black uppercase italic tracking-tighter mb-6 leading-[0.8]"
        >
          OPENSOYCE HEAT CHECK
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-xl md:text-2xl font-bold uppercase tracking-widest text-soy-red italic"
        >
          The most signal-rich open-source projects right now. Curated. Scored. Honest.
        </motion.p>
      </section>

      {/* Section 1: USE READY */}
      <HeatSection 
        title="USE READY — SHIP THESE TODAY" 
        color="bg-[#E63322]" 
        projects={[
          {
            name: "next.js",
            owner: "vercel",
            score: 9.5,
            comment: "Commit velocity sustained. App Router is production-proven.",
            url: "/projects/vercel/next.js"
          },
          {
            name: "astro",
            owner: "withastro",
            score: 9.1,
            comment: "V5 content collections. Edge-first by default.",
            url: "/projects/withastro/astro"
          },
          {
            name: "biome",
            owner: "biomejs",
            score: 8.8,
            comment: "Linting + formatting unified. Fast adoption curve.",
            url: "/projects/biomejs/biome"
          }
        ]}
      />

      {/* Section 2: FORKABLE */}
      <HeatSection 
        title="FORKABLE — REMIX THE CORE" 
        color="bg-blue-600" 
        projects={[
          {
            name: "ui",
            owner: "shadcn-ui",
            score: 9.0,
            comment: "CLI-based code gen. Radix primitives. Port to any framework.",
            url: "/projects/shadcn-ui/ui"
          },
          {
            name: "awesome",
            owner: "sindresorhus",
            score: 7.9,
            comment: "The atomic unit of community knowledge. Clone the format.",
            url: "/projects/sindresorhus/awesome"
          },
          {
            name: "react",
            owner: "facebook",
            score: 9.5,
            comment: "Compiler-era React is shipping. Most forkable renderer architecture.",
            url: "/projects/facebook/react"
          }
        ]}
      />

      {/* Section 3: WATCHLIST */}
      <HeatSection 
        title="AI HARNESS WATCHLIST" 
        color="bg-orange-500" 
        projects={[
          {
            name: "archon",
            owner: "archon-labs",
            score: 9.3,
            badge: "EARLY BREAKOUT",
            comment: "Multi-agent orchestration with swarm intelligence. Moving fast.",
            url: "/projects/archon-labs/archon"
          },
          {
            name: "aura",
            owner: "aura-ai",
            score: 8.3,
            comment: "Observability-first AI harness. Enterprise signal.",
            url: "/projects/aura-ai/aura"
          }
        ]}
      />

      {/* Section 4: STALE */}
      <HeatSection 
        title="POPULAR BUT STALE — USE WITH CAUTION" 
        subtitle="Popular. Influential. No longer fresh."
        color="bg-black" 
        projects={[
          {
            name: "moment.js",
            owner: "moment",
            score: 4.2,
            badge: "STALE SINCE SEPT 2020",
            comment: "Superseded by date-fns, Day.js, and Temporal.",
            url: "/graveyard"
          },
          {
            name: "request",
            owner: "request",
            score: 3.5,
            badge: "STALE SINCE FEB 2020",
            comment: "Deprecated by its own maintainers.",
            url: "/graveyard"
          }
        ]}
      />

      {/* Bottom CTA & Footer */}
      <section className="py-24 px-4 bg-white border-t-4 border-black">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-black uppercase italic tracking-tighter mb-12">GET THE NEXT HEAT CHECK</h2>
          <div className="max-w-md mx-auto">
            <form 
              onSubmit={(e) => {
                trackEvent('email_subscribe', { source: 'heat_check' });
              }}
              className="flex flex-col sm:flex-row gap-0"
            >
              <input 
                type="email" 
                placeholder="your@email.com" 
                className="flex-1 bg-soy-label border-4 border-black px-6 py-4 font-bold outline-none focus:bg-white text-black"
                required
              />
              <button 
                type="submit"
                className="bg-[#E63322] text-white px-8 py-4 font-black uppercase tracking-widest hover:bg-black transition-all border-4 border-black border-t-0 sm:border-t-4 sm:border-l-0"
              >
                JOIN THE LIST
              </button>
            </form>
          </div>
          <div className="mt-12 inline-block bg-black text-white px-6 py-2 text-xs font-black uppercase tracking-widest italic">
            NEXT EDITION: JUNE 2026
          </div>
        </div>
      </section>

      <footer className="py-12 border-t-4 border-black text-center text-[10px] font-black uppercase tracking-[0.5em] opacity-40">
        © 2026 OPENSOYCE LABS. ALL SAUCE RESERVED.
      </footer>
    </div>
  );
}

function HeatSection({ title, subtitle, color, projects }: { title: string, subtitle?: string, color: string, projects: any[] }) {
  return (
    <section className="py-20 border-b-4 border-black">
      <div className="max-w-7xl mx-auto px-4">
        <div className={`${color} text-white p-6 md:p-10 mb-12 shadow-[8px_8px_0px_#000]`}>
          <h2 className="text-3xl md:text-5xl font-black uppercase italic tracking-tighter leading-none">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-4 text-sm md:text-lg font-bold uppercase tracking-widest opacity-60 italic">
              {subtitle}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {projects.map((p, i) => (
            <Link 
              key={i} 
              to={p.url} 
              onClick={() => trackEvent('analyze_project_click', { repo: `${p.owner}/${p.name}`, source: 'heat_check' })}
              className="bg-white border-4 border-black p-8 hover:shadow-[10px_10px_0px_#E63322] transition-all group flex flex-col h-full"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-40">{p.owner}</span>
                  <h3 className="text-2xl font-black uppercase italic tracking-tight group-hover:text-[#E63322] transition-colors">
                    {p.name}
                  </h3>
                </div>
                <div className="bg-soy-label border-2 border-black px-2 py-1 text-xs font-black italic">
                   {p.score.toFixed(1)}
                </div>
              </div>

              {p.badge && (
                <div className="mb-6">
                  <span className="bg-[#E63322] text-white px-3 py-1 text-[8px] font-black uppercase tracking-widest italic">
                    {p.badge}
                  </span>
                </div>
              )}

              <p className="text-sm font-medium opacity-80 leading-relaxed italic mb-8 flex-1">
                "{p.comment}"
              </p>

              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest group-hover:gap-4 transition-all">
                ANALYZE SIGNAL <ArrowRight size={14} className="text-[#E63322]" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
