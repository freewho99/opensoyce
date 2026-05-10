import React from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Info, Zap, AlertTriangle, Layers, Github, Share2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { trackEvent } from '../utils/analytics';

export default function OpenDesignCaseStudy() {
  return (
    <div className="bg-soy-label min-h-screen">
      {/* Hero Section */}
      <section className="bg-black py-24 px-4 text-center">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-soy-red text-white px-4 py-1 text-[10px] font-black uppercase tracking-[0.4em] mb-8 inline-block"
          >
            REMIX INTELLIGENCE
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-8xl font-black uppercase italic tracking-tighter mb-8 leading-[0.8] text-white"
          >
            OPEN DESIGN → <br/>ANGULAR 20 DESIGN STUDIO
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-xl md:text-2xl font-bold uppercase tracking-widest text-soy-red italic"
          >
            GitHub shows what the repo is. OpenSoyce shows what it can become.
          </motion.p>
        </div>
      </section>

      {/* The Original Section */}
      <section className="py-20 px-4 border-b-4 border-black">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white border-4 border-black p-10 md:p-16 shadow-[15px_15px_0px_#000]">
            <div className="flex flex-col md:flex-row justify-between items-start gap-8 mb-12">
              <div>
                <span className="text-xs font-black uppercase tracking-widest opacity-40 mb-2 block">THE ORIGINAL</span>
                <h2 className="text-4xl md:text-6xl font-black uppercase italic tracking-tighter mb-4">
                  anthropics-community/open-design
                </h2>
                <div className="flex flex-wrap gap-4 items-center">
                  <div className="bg-black text-white px-4 py-2 text-2xl font-black italic">SCORE 0.0</div>
                  <div className="bg-soy-red text-white px-4 py-2 text-xs font-black uppercase tracking-widest italic animate-pulse">EARLY BREAKOUT</div>
                </div>
              </div>
              <div className="max-w-md">
                <p className="text-xl font-bold uppercase italic opacity-80 leading-tight border-l-4 border-soy-red pl-6">
                  "Community-driven design system for Anthropic's Claude. Going viral before GitHub stats catch up."
                </p>
              </div>
            </div>

            {/* Red Band */}
            <div className="bg-soy-red text-white p-8 mb-12 transform -rotate-1 shadow-[10px_10px_0px_#000]">
              <h3 className="text-2xl md:text-4xl font-black uppercase italic tracking-tighter">
                → TURN INTO ANGULAR 20 DESIGN STUDIO
              </h3>
              <p className="text-lg font-bold uppercase tracking-widest mt-2 opacity-90">
                Take the component architecture and design token system and rebuild it as a first-class Angular 20 standalone component library.
              </p>
            </div>

            {/* 3-Column Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border-4 border-black mb-12 divide-y-4 md:divide-y-0 md:divide-x-4 divide-black">
              <SignalColumn title="DESIGN TOKENS" text="Color palette, typography scale, spacing — the visual grammar is already defined." />
              <SignalColumn title="COMPONENT PATTERNS" text="Card layouts, button hierarchy, form patterns — the interaction model is proven." />
              <SignalColumn title="BRAND CONTEXT" text="Built around one of the most recognized AI brands. The design has authority." />
            </div>
          </div>
        </div>
      </section>

      {/* What Had To Be Rewritten Section */}
      <section className="bg-black py-24 px-4 text-white">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
          <div>
            <h2 className="text-5xl md:text-7xl font-black uppercase italic tracking-tighter mb-8 leading-none">
              WHAT HAD TO BE <span className="text-soy-red italic">REWRITTEN</span>
            </h2>
            <div className="space-y-8">
              <RewrittenItem original="React" remix="Angular 20 Standalone" />
              <RewrittenItem original="Vite" remix="Angular CLI" />
              <RewrittenItem original="Hooks" remix="Signals" />
              <RewrittenItem original="JSDoc" remix="Compodoc" />
            </div>
          </div>
          <div className="bg-soy-label p-12 border-4 border-soy-red text-black shadow-[15px_15px_0px_#E63322]">
            <h3 className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2">REWRITE DIFFICULTY</h3>
            <div className="text-6xl font-black italic text-soy-red mb-8">MEDIUM</div>
            <ul className="space-y-4 text-sm font-bold uppercase tracking-widest">
              {[
                "1. Extract tokens to tokens.json",
                "2. Build Angular 20 standalone components with signals",
                "3. Storybook for Angular",
                "4. Publish as @opendesign/angular",
                "5. Document as first Angular design studio for the AI era"
              ].map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
        </div>
      </section>

      {/* Business Potential Section */}
      <section className="py-24 px-4 bg-white border-b-4 border-black">
        <div className="max-w-4xl mx-auto text-center">
          <div className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-4">BUSINESS POTENTIAL</div>
          <div className="flex justify-center gap-4 mb-8">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="w-6 h-6 rounded-full bg-soy-red" />
            ))}
          </div>
          <p className="text-3xl font-black uppercase italic tracking-tighter leading-tight">
            "Angular 20 has no dominant design system in the Claude/AI space. <br/>First mover advantage — this niche is unclaimed."
          </p>
        </div>
      </section>

      {/* Final Verdict Card */}
      <section className="py-24 px-4 bg-soy-label">
        <div className="max-w-5xl mx-auto">
          <div className="bg-black text-white p-12 md:p-20 shadow-[20px_20px_0px_#E63322]">
            <h2 className="text-5xl md:text-8xl font-black uppercase italic tracking-tighter mb-10 leading-[0.8]">
              FORK THIS.
            </h2>
            <p className="text-xl md:text-2xl font-bold uppercase italic tracking-wide mb-12 opacity-90 leading-relaxed">
              The infrastructure is real. The niche is open. Angular 20 developers need a design studio for the AI era. Open Design gives you a 6-month head start.
            </p>
            <div className="flex flex-col sm:flex-row gap-6">
              <button 
                onClick={() => {
                  trackEvent('remix_case_study_click', { card: 'open-design-angular20' });
                }}
                className="bg-soy-red text-white px-12 py-6 text-xl font-black uppercase italic tracking-widest hover:bg-white hover:text-black transition-all"
              >
                FORK THIS →
              </button>
              <button className="border-4 border-white text-white px-12 py-6 text-xl font-black uppercase italic tracking-widest hover:bg-soy-red hover:border-soy-red transition-all">
                ANALYZE ORIGINAL →
              </button>
            </div>
          </div>
        </div>
      </section>

      <footer className="py-12 border-t-4 border-black text-center text-[10px] font-black uppercase tracking-[0.5em] opacity-40">
        © 2026 OPENSOYCE LABS. ALL SAUCE RESERVED.
      </footer>
    </div>
  );
}

function SignalColumn({ title, text }: { title: string, text: string }) {
  return (
    <div className="p-8 bg-white flex flex-col h-full">
      <h4 className="text-[10px] font-black uppercase tracking-widest text-soy-red mb-4">{title}</h4>
      <p className="text-sm font-bold uppercase tracking-wide leading-relaxed opacity-80">{text}</p>
    </div>
  );
}

function RewrittenItem({ original, remix }: { original: string, remix: string }) {
  return (
    <div className="flex items-center gap-6 group">
      <div className="text-right flex-1">
        <div className="text-xs font-black uppercase tracking-widest opacity-40 italic">ORIGINAL</div>
        <div className="text-2xl md:text-4xl font-black uppercase tracking-tighter group-hover:text-soy-red transition-colors">{original}</div>
      </div>
      <ArrowRight className="text-soy-red shrink-0" size={32} />
      <div className="flex-1">
        <div className="text-xs font-black uppercase tracking-widest text-soy-red italic">REMIX</div>
        <div className="text-2xl md:text-4xl font-black uppercase tracking-tighter">{remix}</div>
      </div>
    </div>
  );
}
