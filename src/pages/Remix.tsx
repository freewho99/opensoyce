import React from 'react';
import { motion } from 'motion/react';
import { 
  GitFork, Rocket, Zap, 
  Construction, Briefcase, 
  ArrowRight, ExternalLink,
  ShieldCheck, Star
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { trackEvent } from '../utils/analytics';

export default function Remix() {
  const remixIdeas = [
    {
      owner: 'shadcn-ui',
      repo: 'ui',
      score: 9.0,
      badge: 'FORKABLE',
      forkIdea: 'THE HEADLESS REVOLUTION',
      whyItMatters: 'It proved that builders want copy-paste CLI convenience over bloated npm packages. The core registry logic is pure gold.',
      reusableInfra: 'CLI-based code generation + Radix primitives integration.',
      difficulty: 'MEDIUM — LOGIC IS CLEAN',
      potential: 'HIGH — SWIPE THIS FOR ANY FRAMEWORK',
      url: '/projects/shadcn-ui/ui'
    },
    {
      owner: 'openai',
      repo: 'openai-python',
      score: 8.8,
      badge: 'STABLE',
      forkIdea: 'CLIENT-SIDE AGENT WRAPPER',
      whyItMatters: 'The internal state management and streaming handling are industry standard. Don\'t reinvent how you talk to LLMs.',
      reusableInfra: 'Streaming response management + robust error retries.',
      difficulty: 'LOW — WRAP AND SHIP',
      potential: 'MEDIUM — VERTICAL AI AGENTS',
      url: '/projects/openai/openai-python'
    },
    {
       owner: 'vercel',
       repo: 'next.js',
       score: 9.5,
       badge: 'MASTERPIECE',
       forkIdea: 'STATIC-FIRST MICRO FRAMEWORK',
       whyItMatters: 'Next.js is massive. Strip the complexity and keep the router. Use their server action architecture for a lightweight clone.',
       reusableInfra: 'Router architecture + image optimization patterns.',
       difficulty: 'CRITICAL — COMPLICATED GUTS',
       potential: 'ULTRA — EVERYONE WANTS LIGHTER NEXT',
       url: '/projects/vercel/next.js'
    },
    {
       owner: 'sindresorhus',
       repo: 'awesome',
       score: 7.5,
       badge: 'STALE DATA',
       forkIdea: 'AI-CURATED KNOWLEDGE GRAPH',
       whyItMatters: 'The lists are iconic but unmaintained. Use the same structure but automate the validation via AI signals.',
       reusableInfra: 'Community collection structure + markdown parsing.',
       difficulty: 'LOW — JUST RENAME IT',
       potential: 'HIGH — THE NEW YELLOW PAGES',
       url: '/projects/sindresorhus/awesome'
    }
  ];

  return (
    <div className="bg-soy-label min-h-screen">
      {/* Header */}
      <section className="pt-24 pb-16 px-4 bg-white border-b-4 border-black text-center">
        <motion.h1 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-6xl md:text-9xl font-black uppercase italic tracking-tighter mb-6 leading-[0.8]"
        >
          REMIX THE BOARD
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xl md:text-2xl font-bold uppercase tracking-widest text-soy-red italic"
        >
          DON'T START AT ZERO. FORK THE INFRASTRUCTURE OF GIANTS.
        </motion.p>
      </section>

      {/* Grid */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-12">
            {remixIdeas.map((remix, idx) => (
              <div key={idx}>
                <RemixCard remix={remix} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-24 px-4 text-center bg-black text-white">
        <h2 className="text-4xl font-black uppercase italic tracking-tighter mb-12">HAVE A FORK IDEA?</h2>
        <button className="bg-soy-red text-white border-4 border-white px-12 py-6 text-xl font-black uppercase italic hover:bg-white hover:text-black transition-all shadow-[10px_10px_0px_white]">
          SUGGEST A REMIX →
        </button>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t-4 border-black text-center text-[10px] font-black uppercase tracking-[0.5em] opacity-40">
        © 2026 OPENSOYCE LABS. ALL SAUCE RESERVED.
      </footer>
    </div>
  );
}

function RemixCard({ remix }: { remix: any }) {
  return (
    <div key={remix.repo} className="bg-white border-4 border-black p-10 shadow-[10px_10px_0px_#000] flex flex-col hover:shadow-[15px_15px_0px_#E63322] transition-all group">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h3 className="text-xs font-black uppercase tracking-widest opacity-40 mb-1">{remix.owner}/{remix.repo}</h3>
          <div className="flex items-center gap-2">
             <span className="text-2xl font-black italic tracking-tighter group-hover:text-soy-red transition-colors">{remix.repo.toUpperCase()}</span>
             <span className="bg-soy-label text-[8px] font-black uppercase px-2 py-0.5 border border-black">{remix.score.toFixed(1)}</span>
          </div>
        </div>
        <div className="bg-black text-white px-3 py-1 text-[10px] font-black uppercase italic tracking-widest">
           {remix.badge}
        </div>
      </div>

      <div className="mb-8">
        <h4 className="text-3xl font-black uppercase italic tracking-tighter text-soy-red mb-4">
          {remix.forkIdea}
        </h4>
        <p className="text-sm font-medium opacity-70 leading-relaxed italic">
          "{remix.whyItMatters}"
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12 flex-1">
        <div className="space-y-6">
           <div>
              <Label icon={<Construction size={14} />} text="REUSABLE INFRASTRUCTURE" />
              <p className="text-[10px] font-black uppercase tracking-widest leading-loose mt-2">{remix.reusableInfra}</p>
           </div>
           <div>
              <Label icon={<Zap size={14} />} text="REWRITE DIFFICULTY" />
              <p className="text-[10px] font-black uppercase tracking-widest leading-loose mt-2">{remix.difficulty}</p>
           </div>
        </div>
        <div className="bg-soy-label/50 border-2 border-black p-6">
           <Label icon={<Briefcase size={14} />} text="BUSINESS POTENTIAL" />
           <p className="text-xl font-black uppercase italic tracking-tighter mt-4 leading-tight">{remix.potential}</p>
        </div>
      </div>

      <Link 
        to={remix.url}
        onClick={() => trackEvent('remix_case_study_click', { card: remix.repo, page: '/remix' })}
        className="w-full bg-black text-white py-5 text-sm font-black uppercase tracking-widest text-center hover:bg-soy-red transition-all flex items-center justify-center gap-4"
      >
        FORK THIS <GitFork size={20} />
      </Link>
    </div>
  );
}

function Label({ icon, text }: { icon: React.ReactNode, text: string }) {
  return (
    <div className="flex items-center gap-2 text-[8px] font-black uppercase tracking-[0.3em] opacity-40">
      {icon} {text}
    </div>
  );
}
