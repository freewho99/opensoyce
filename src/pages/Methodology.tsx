import React from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowRight, AlertTriangle } from 'lucide-react';
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
                The Soyce Score is a weighted composite computed from eleven GitHub repository signals: last commit date, star count, contributor count, fork count, license, open issue count, description / topics / homepage presence, 30-day commit volume, README content, SECURITY.md presence, and release recency.
              </p>

              <div className="space-y-6">
                {[
                  { label: 'MAINTENANCE', weight: 30, desc: 'Days since the most recent commit. Recent = high, stale = low.' },
                  { label: 'COMMUNITY', weight: 25, desc: 'Log-scaled star count, contributor count, fork milestone (1k+).' },
                  { label: 'SECURITY', weight: 20, desc: 'License presence + permissiveness (MIT / Apache / BSD), open issue load, SECURITY.md policy (must be at a location GitHub surfaces in its Security tab), and whether a tagged release was published within the last year.' },
                  { label: 'DOCUMENTATION', weight: 15, desc: 'Description, ≥3 topics, homepage URL — and README content: length, heading count, code examples, install instructions.' },
                  { label: 'ACTIVITY', weight: 10, desc: 'Number of commits in the last 30 days (sampled from the most recent 30 commits).' },
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
            <h2 className="text-5xl md:text-7xl font-black uppercase italic tracking-tighter mb-4">EMBEDDABLE BADGES</h2>
            <p className="text-xl font-bold uppercase tracking-widest text-soy-red italic">Any analyzed project gets a live Soyce Score badge. Color shifts with the number.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-20 justify-items-center">
            <BadgePreview color="#22c55e" score="9.5" caption="SCORE ≥ 8" />
            <BadgePreview color="#f59e0b" score="6.8" caption="SCORE ≥ 6" />
            <BadgePreview color="#E63322" score="3.2" caption="SCORE < 6" />
          </div>

          <div className="max-w-4xl mx-auto text-center">
            <Link
              to="/lookup"
              onClick={() => trackEvent('badge_lookup_click', { source: 'badge_preview', page: '/methodology' })}
              className="inline-flex items-center gap-4 bg-soy-red text-white px-12 py-6 text-xl font-black uppercase italic tracking-widest hover:bg-black transition-all shadow-[10px_10px_0px_#000]"
            >
              ANALYZE A REPO TO GET A BADGE →
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

function BadgePreview({ color, score, caption }: { color: string, score: string, caption: string }) {
  return (
    <div className="space-y-4 text-center">
      <svg xmlns="http://www.w3.org/2000/svg" width="160" height="22" className="mx-auto">
        <rect width="160" height="22" rx="3" fill="#1a1a1a" />
        <path fill={color} d="M110 0h50v22H110z" />
        <rect width="160" height="22" rx="3" fill="none" stroke="#ffffff" strokeOpacity="0.1" />
        <g fill="#fff" textAnchor="middle" fontFamily="ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,liberation mono,courier new,monospace" fontSize="9" fontWeight="bold">
          <text x="55" y="15" fill="#ffffff" letterSpacing="0.1em">SOYCE SCORE</text>
          <text x="135" y="15" fill="#ffffff" fontSize="10">{score}</text>
        </g>
        <line x1="110" y1="0" x2="110" y2="22" stroke="#ffffff" strokeOpacity="0.2" />
      </svg>
      <div className="text-[10px] font-black uppercase tracking-widest opacity-60">{caption}</div>
    </div>
  );
}
