import React from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { 
  ShieldCheck, Activity, Users, BookOpen, 
  TrendingUp, ArrowRight, Info, AlertTriangle,
  FlaskConical, CheckCircle2, GitFork
} from 'lucide-react';
import { trackEvent } from '../utils/analytics';

export default function Methodology() {
  return (
    <div className="bg-soy-label min-h-screen">
      {/* HERO Section */}
      <section className="py-24 px-4 bg-white border-b-4 border-black">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-block bg-soy-red text-white px-4 py-2 text-xs font-black uppercase tracking-[0.4em] mb-8"
          >
            THE DOCTRINE
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-6xl md:text-8xl font-black uppercase italic tracking-tighter mb-8 leading-[0.9]"
          >
            HOW OPENSOYCE SCORES PROJECTS
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-2xl md:text-3xl font-medium opacity-80 leading-snug italic"
          >
            "OpenSoyce is not a security audit. It is a signal layer for builders."
          </motion.p>
        </div>
      </section>

      {/* THE SOYCE SCORE Breakdown */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
            <div>
              <h2 className="text-4xl font-black uppercase italic tracking-tighter mb-8">THE SOYCE SCORE</h2>
              <p className="text-xl font-medium opacity-70 mb-12 leading-relaxed">
                The Soyce Score is a weighted composite index built from over 20 proprietary signals gathered from the GitHub API and community metadata.
              </p>
              
              <div className="space-y-6">
                {[
                  { label: 'MAINTENANCE', weight: 30, desc: 'Commit recency, release frequency, and versioning hygiene.' },
                  { label: 'COMMUNITY', weight: 25, desc: 'Contributor diversity, issue responsiveness, and star velocity.' },
                  { label: 'SECURITY', weight: 20, desc: 'Vulnerability history, dependency health, and security.md existence.' },
                  { label: 'DOCUMENTATION', weight: 15, desc: 'Readme length, example clarity, and API reference completeness.' },
                  { label: 'ACTIVITY', weight: 10, desc: 'Recent pull request volume and CI pipeline health.' },
                ].map(item => (
                  <div key={item.label} className="bg-white border-4 border-black p-6 shadow-[6px_6px_0px_#000]">
                    <div className="flex justify-between items-center mb-2">
                       <span className="text-lg font-black uppercase italic">{item.label}</span>
                       <span className="text-soy-red font-black text-2xl">{item.weight}%</span>
                    </div>
                    <p className="text-xs font-bold uppercase tracking-widest opacity-60">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-black text-white p-12 shadow-[12px_12px_0px_#E63322]">
              <h3 className="text-3xl font-black uppercase italic tracking-tighter mb-8 text-soy-red">SCORE RANGES</h3>
              <div className="space-y-8">
                 <ScoreRange label="9.0+" status="USE READY" desc="Production grade. Stable, documented, and actively maintained." color="text-green-500" />
                 <ScoreRange label="8.0 – 8.9" status="FORKABLE" desc="Strong core infrastructure. May have minor gaps in docs or PR response time." color="text-blue-500" />
                 <ScoreRange label="7.0 – 7.9" status="WATCHLIST" desc="Emerging breakout or previously strong project losing steam." color="text-yellow-500" />
                 <ScoreRange label="5.0 – 6.9" status="RISKY" desc="High maintenance debt or stale signals. Verify before using." color="text-orange-500" />
                 <ScoreRange label="BELOW 5.0" status="STALE" desc="Inactive for >18 months or abandoned by maintainers." color="text-soy-red" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* WHAT EACH SIGNAL MEANS */}
      <section className="py-20 px-4 bg-white border-y-4 border-black">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-black uppercase italic tracking-tighter mb-16 text-center">THE FOUR PILLARS</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <PillarCard 
              icon={<ShieldCheck size={40} />}
              title="HEALTH"
              desc="Is the project actively maintained? Are security advisories handled? Is the build passing?"
            />
            <PillarCard 
              icon={<GitFork size={40} />}
              title="FORKABILITY"
              desc="Is the code modular? Is the license permissive? Is it easy to strip and reuse the core infra?"
              highlight
            />
            <PillarCard 
              icon={<Activity size={40} />}
              title="MOMENTUM"
              desc="Are commits accelerating? Are stars growing organically? Are issues being triaged quickly?"
            />
            <PillarCard 
              icon={<BookOpen size={40} />}
              title="ADOPTION"
              desc="Would a production team trust this today? Is there a clear upgrade path and API stability?"
            />
          </div>
        </div>
      </section>

      {/* GRAVEYARD RULES */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-soy-red text-white p-12 border-4 border-black shadow-[10px_10px_0px_#000]">
            <h2 className="text-4xl font-black uppercase italic tracking-tighter mb-8">GRAVEYARD RULES</h2>
            <p className="text-xl font-medium mb-8 leading-relaxed">
              A project doesn't die when people stop starring it. It dies when the pulse stops.
            </p>
            <div className="space-y-4 border-l-4 border-white/30 pl-8">
              <p className="text-lg font-black uppercase italic">A PROJECT ENTERS THE GRAVEYARD WHEN:</p>
              <ul className="space-y-2 text-sm font-bold uppercase tracking-widest opacity-80">
                <li>• LAST COMMIT &gt; 18 MONTHS AGO</li>
                <li>• ISSUES HAVE GONE UNRESPONSIVE FOR &gt; 1 QUARTER</li>
                <li>• NO RECENT TAGGED RELEASES OR NPM PUBLISHES</li>
                <li>• EXPLICIT DEPRECATION BY MAINTAINERS</li>
              </ul>
              <p className="mt-8 text-xs font-bold uppercase tracking-widest opacity-60">
                NOTE: GRAVEYARD ≠ WORTHLESS. SOME GRAVEYARD PROJECTS HAVE EXCELLENT FORKABLE INFRASTRUCTURE.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* DISCLAIMERS */}
      <section className="py-20 px-4 bg-black text-white">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row gap-12 items-center">
            <div className="md:w-1/3">
              <AlertTriangle size={80} className="text-soy-red mb-6" />
              <h2 className="text-4xl font-black uppercase italic tracking-tighter mb-4">WHAT WE DON'T CLAIM</h2>
            </div>
            <div className="md:w-2/3 grid grid-cols-1 md:grid-cols-2 gap-8 text-[10px] font-black uppercase tracking-[0.2em] opacity-60">
              <div className="border-l-2 border-soy-red pl-4 py-2">
                OPENSOYCE SCORES ARE NOT SECURITY CERTIFICATIONS.
              </div>
              <div className="border-l-2 border-soy-red pl-4 py-2">
                A HIGH SCORE DOES NOT GUARANTEE PRODUCTION SAFETY.
              </div>
              <div className="border-l-2 border-soy-red pl-4 py-2">
                A LOW SCORE DOES NOT MEAN THE PROJECT IS BROKEN.
              </div>
              <div className="border-l-2 border-soy-red pl-4 py-2">
                ALWAYS VERIFY LICENSES AND SECURITY ADVISORIES INDEPENDENTLY.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* THE SIGNAL VOCABULARY */}
      <section className="py-24 px-4 bg-soy-label border-y-4 border-black">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-5xl md:text-7xl font-black uppercase italic tracking-tighter mb-4">THE SIGNAL VOCABULARY</h2>
            <p className="text-xl font-bold uppercase tracking-widest text-soy-red italic">Every label has a definition. These are frozen.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            <VocabCard title="USE READY" score="≥ 9.0" desc="Production-grade signals. Actively maintained, well-documented, and ready for serious adoption evaluation." />
            <VocabCard title="FORKABLE" score="8.0–8.9" desc="Strong core infrastructure. Best for teams who want to build on top of it." />
            <VocabCard title="HIGH MOMENTUM" score="earlyBreakout" desc="GitHub stats still catching up to real adoption. Community signal is outpacing the numbers." />
            <VocabCard title="WATCHLIST" score="7.0–7.9" desc="Emerging breakout or previously strong project losing steam. Worth monitoring." />
            <VocabCard title="RISKY BUT HOT" score="< 7.0 + earlyBreakout" desc="High community signal, but instability or sparse docs. Use with eyes open." />
            <VocabCard title="STALE" score="< 5.0 or last commit > 18mo" desc="No longer gaining ground. Not recommended for new greenfield projects." />
            <VocabCard title="GRAVEYARD" score="Deprecated" desc="Shaped the ecosystem. Now a museum piece. Some have forkable infrastructure." />
          </div>
        </div>
      </section>

      {/* BADGE PREVIEW */}
      <section className="py-24 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-5xl md:text-7xl font-black uppercase italic tracking-tighter mb-4">EMBEDDABLE BADGES — COMING SOON</h2>
            <p className="text-xl font-bold uppercase tracking-widest text-soy-red italic">Every OpenSoyce-verified project will display its live Soyce Score as an embeddable badge.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-20">
            <BadgePreview color="bg-emerald-500" label="USE READY" score="9.5" />
            <BadgePreview color="bg-blue-500" label="FORKABLE" score="8.3" />
            <BadgePreview color="bg-orange-500" label="HIGH MOMENTUM" icon="🚀" />
            <BadgePreview color="bg-gray-400" label="STALE" score="3.2" />
          </div>

          <div className="max-w-4xl mx-auto text-center">
            <Link 
              to="/claim" 
              onClick={() => trackEvent('badge_claim_click', { source: 'badge_preview', page: '/methodology' })}
              className="inline-flex items-center gap-4 bg-soy-red text-white px-12 py-6 text-xl font-black uppercase italic tracking-widest hover:bg-black transition-all shadow-[10px_10px_0px_#000]"
            >
              CLAIM YOUR PROJECT TO UNLOCK BADGES →
            </Link>
          </div>
        </div>
      </section>

      {/* BOTTOM CTA */}
      <section className="py-24 px-4 text-center">
        <Link 
          to="/leaderboards" 
          onClick={() => trackEvent('hero_explore_click', { source: 'methodology_footer' })}
          className="inline-flex items-center gap-4 bg-black text-white px-12 py-6 text-2xl font-black uppercase italic tracking-widest hover:bg-soy-red transition-all shadow-[10px_10px_0px_#E63322]"
        >
          EXPLORE THE BOARD <ArrowRight size={32} />
        </Link>
      </section>

      {/* FOOTER */}
      <footer className="py-12 border-t-4 border-black text-center text-[10px] font-black uppercase tracking-[0.5em] opacity-40">
        © 2026 OPENSOYCE LABS. ALL SAUCE RESERVED.
      </footer>
    </div>
  );
}

function ScoreRange({ label, status, desc, color }: { label: string, status: string, desc: string, color: string }) {
  return (
    <div className="flex flex-col md:flex-row md:items-start gap-4">
      <div className={`text-2xl font-black italic min-w-[120px] ${color}`}>{label}</div>
      <div>
        <div className="text-sm font-black uppercase tracking-widest mb-1">{status}</div>
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function PillarCard({ icon, title, desc, highlight = false }: { icon: React.ReactNode, title: string, desc: string, highlight?: boolean }) {
  return (
    <div className={`p-10 border-4 border-black flex flex-col items-center text-center group transition-all ${highlight ? 'bg-soy-red text-white shadow-[8px_8px_0px_#000]' : 'bg-white hover:bg-soy-label'}`}>
      <div className={`mb-6 ${highlight ? 'text-white' : 'text-soy-red group-hover:scale-110 transition-transform'}`}>{icon}</div>
      <h3 className="text-2xl font-black uppercase italic mb-4 tracking-tight">{title}</h3>
      <p className="text-xs font-bold uppercase tracking-widest leading-relaxed opacity-70">{desc}</p>
    </div>
  );
}

function VocabCard({ title, score, desc }: { title: string, score: string, desc: string }) {
  return (
    <div className="bg-white border-4 border-black p-8 shadow-[8px_8px_0px_#000]">
      <div className="mb-4">
        <h3 className="text-2xl font-black uppercase italic tracking-tight mb-1">{title}</h3>
        <div className="text-soy-red font-black text-xs uppercase tracking-widest">{score}</div>
      </div>
      <p className="text-sm font-medium opacity-80 leading-relaxed italic">"{desc}"</p>
    </div>
  );
}

function BadgePreview({ color, label, score, icon }: { color: string, label: string, score?: string, icon?: string }) {
  return (
    <div className="space-y-4">
      <div className={`inline-flex items-center overflow-hidden rounded-full border-4 border-black shadow-[4px_4px_0px_#000]`}>
        <div className="bg-black text-white px-3 py-1.5 text-[8px] font-black uppercase tracking-widest border-r-2 border-white/20">
          OpenSoyce
        </div>
        <div className={`${color} text-white px-3 py-1.5 text-[8px] font-black uppercase tracking-widest flex items-center gap-1`}>
          {label} {score && `· ${score}`} {icon && icon}
        </div>
      </div>
      <div className="bg-soy-label p-4 border-2 border-black font-mono text-[8px] overflow-x-auto whitespace-nowrap">
        <code>
          [![OpenSoyce](https://opensoyce.com/badge/example.svg)](https://opensoyce.com/projects/example)
        </code>
      </div>
    </div>
  );
}
