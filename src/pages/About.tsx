import React from 'react';
import { Shield, Target, Users, Code, Zap, Globe, Github } from 'lucide-react';
import { motion } from 'motion/react';

export default function About() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-16">
      {/* Hero Section */}
      <section className="mb-24 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-block bg-soy-red text-white px-6 py-2 text-sm font-black uppercase tracking-widest italic mb-6 shadow-[4px_4px_0px_#000]"
        >
          THE MISSION
        </motion.div>
        <h1 className="text-6xl md:text-8xl font-black uppercase italic tracking-tighter leading-none mb-8">
          ABOUT OPENSOYCE
        </h1>
        <p className="text-2xl md:text-3xl font-bold uppercase tracking-widest text-soy-red italic max-w-4xl mx-auto">
          WE BELIEVE EVERY DEPENDENCY DECISION DESERVES A DATA LAYER.
        </p>
      </section>

      {/* Mission Content */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-16 mb-32 items-center">
        <div className="space-y-8">
          <div className="h-2 bg-soy-red w-32" />
          <p className="text-xl font-medium leading-relaxed opacity-80">
            In 2016, the "left-pad" incident proved that the modern web is a house of cards. Eleven lines of code, unpublished in a dispute, broke thousands of production pipelines overnight. It exposed a fundamental flaw in how we build: we trust blindly, and we have no way to measure the health of the ground we're standing on.
          </p>
          <p className="text-xl font-medium leading-relaxed opacity-80 pb-8 border-b-2 border-soy-bottle/10">
            OpenSoyce was built to fix the trust model of open source. By surfacing metadata into a readable "Nutrition Label," we give developers a first-pass filter for maintenance, security, and community vitality. We don't just score repository state; we score the discipline of its maintainers.
          </p>
          <div className="flex gap-4">
             <div className="bg-black text-white px-6 py-4 flex flex-col items-center justify-center min-w-[120px] shadow-[4px_4px_0px_#E63322]">
                <span className="text-3xl font-black italic">5.2B</span>
                <span className="text-[8px] font-black uppercase tracking-widest opacity-60">monthly downloads scanned</span>
             </div>
             <div className="bg-white border-2 border-black px-6 py-4 flex flex-col items-center justify-center min-w-[120px] shadow-[4px_4px_0px_#000]">
                <span className="text-3xl font-black italic">12K</span>
                <span className="text-[8px] font-black uppercase tracking-widest opacity-60">verified maintainers</span>
             </div>
          </div>
        </div>
          <div className="bg-soy-label p-12 border-4 border-black shadow-[16px_16px_0px_#000] relative">
          <div className="absolute top-4 right-4 text-soy-red opacity-20">
            <Shield size={120} />
          </div>
          <h3 className="text-3xl font-black uppercase italic tracking-tight mb-8 relative z-10">THE PROBLEM WE SOLVE</h3>
          <div className="space-y-4 relative z-10">
             <div className="flex items-start gap-0 border-4 border-soy-red bg-white shadow-[4px_4px_0px_#E63322] overflow-hidden">
               <div className="bg-soy-red text-white p-4 flex items-center justify-center shrink-0">
                 <Target size={24} className="text-white" />
               </div>
               <div className="p-4">
                 <span className="block font-black uppercase italic text-sm text-soy-red mb-1">Invisible Rot</span>
                 <span className="text-xs font-bold opacity-70 uppercase tracking-wider leading-relaxed">Packages that haven't been touched in 3 years but still have 10M downloads per month.</span>
               </div>
             </div>
             <div className="flex items-start gap-0 border-4 border-amber-500 bg-amber-50 shadow-[4px_4px_0px_#F59E0B] overflow-hidden">
               <div className="bg-amber-500 text-white p-4 flex items-center justify-center shrink-0">
                 <Shield size={24} className="text-white" />
               </div>
               <div className="p-4">
                 <span className="block font-black uppercase italic text-sm text-amber-800 mb-1">Supply Chain Risk</span>
                 <span className="text-xs font-bold opacity-70 uppercase tracking-wider leading-relaxed">Signals that indicate a maintainer is burnt out or a project is being quietly hijacked.</span>
               </div>
             </div>
             <div className="flex items-start gap-0 border-4 border-soy-bottle bg-soy-bottle shadow-[4px_4px_0px_#302C26] overflow-hidden">
               <div className="bg-soy-label p-4 flex items-center justify-center shrink-0">
                 <Users size={24} className="text-soy-red" />
               </div>
               <div className="p-4">
                 <span className="block font-black uppercase italic text-sm text-soy-label mb-1">The "Bus Factor"</span>
                 <span className="text-xs font-bold text-soy-label/60 uppercase tracking-wider leading-relaxed">Projects that rely entirely on one individual with no succession plan or handoff strategy.</span>
               </div>
             </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mb-32">
        <h2 className="text-5xl font-black uppercase italic tracking-tighter mb-12 text-center">HOW IT WORKS</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <HowItem step="01" icon={<Github />} label="SCAN" desc="We sync with the GitHub API to gather raw metadata." />
          <HowItem step="02" icon={<Code />} label="PARSE" desc="Our engine analyzes commit velocity and PR cycles." />
          <HowItem step="03" icon={<Shield />} label="AUDIT" desc="We check for licenses, CVEs, and security policies." />
          <HowItem step="04" icon={<Zap />} label="SCORE" desc="Weighted algorithms calculate 5 core pillars." />
          <HowItem step="05" icon={<Globe />} label="DEPLOY" desc="A Live Soyce Score is published for the ecosystem." />
        </div>
      </section>

      {/* Team Section */}
      <section className="bg-black text-white p-12 md:p-20 border-t-8 border-soy-red shadow-[20px_20px_0px_#333] mb-12">
        <div className="max-w-5xl mx-auto space-y-16">
          <div className="text-center">
            <h2 className="text-5xl md:text-6xl font-black uppercase italic tracking-tighter leading-none mb-4">
              WE ARE OPENSOYCE LABS
            </h2>
            <p className="text-sm font-bold uppercase tracking-widest opacity-60 italic max-w-2xl mx-auto">
              A small team of paranoid engineers obsessing over open-source dependency health so you don't have to.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="border-2 border-white/20 p-6 bg-white/5">
              <h3 className="text-xl font-black uppercase italic text-soy-red mb-1">Sarah Mitchell</h3>
              <span className="text-[9px] font-black uppercase tracking-widest opacity-40 block mb-3">Head of Supply Chain Research</span>
              <p className="text-xs opacity-70 leading-relaxed normal-case">
                Former enterprise security architect. Obsessed with SBOM integration, license compliance, and static dependency analysis.
              </p>
            </div>
            <div className="border-2 border-white/20 p-6 bg-white/5">
              <h3 className="text-xl font-black uppercase italic text-soy-red mb-1">Maya Chen</h3>
              <span className="text-[9px] font-black uppercase tracking-widest opacity-40 block mb-3">Lead Engine Architect</span>
              <p className="text-xs opacity-70 leading-relaxed normal-case">
                Compiler engineer turned open-source advocate. Architect of the Soyce scoring v2 engine and typo-squat detection algorithms.
              </p>
            </div>
            <div className="border-2 border-white/20 p-6 bg-white/5">
              <h3 className="text-xl font-black uppercase italic text-soy-red mb-1">Carlos Ruiz</h3>
              <span className="text-[9px] font-black uppercase tracking-widest opacity-40 block mb-3">Head of Community & Platform</span>
              <p className="text-xs opacity-70 leading-relaxed normal-case">
                Developer relations manager and security auditor. Orchestrates the community rebuttal program and developer integrations.
              </p>
            </div>
          </div>

          <div className="border-t border-white/10 pt-12 text-center space-y-6">
            <h3 className="text-2xl font-black uppercase italic tracking-tight">DEVELOPER OUTREACH</h3>
            <p className="text-xs font-bold uppercase tracking-wider opacity-60 leading-relaxed max-w-lg mx-auto">
              Have questions about how we index repos, want to verify your own package, or need custom enterprise integrations?
            </p>
            <div>
              <a 
                href="mailto:contact@opensoyce.io"
                className="inline-block bg-soy-red text-white hover:bg-white hover:text-black border-2 border-white px-8 py-4 font-black uppercase italic tracking-widest transition-all shadow-[4px_4px_0px_#333]"
              >
                contact@opensoyce.io
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function HowItem({ step, icon, label, desc }: { step: string, icon: React.ReactNode, label: string, desc: string }) {
  return (
    <div className="bg-white border-2 border-black p-6 hover:translate-y-[-4px] transition-all shadow-[4px_4px_0px_#000]">
      <div className="text-[10px] font-black text-soy-red mb-4">{step}</div>
      <div className="mb-4 opacity-40">{icon}</div>
      <div className="text-xl font-black uppercase italic mb-2 tracking-tight">{label}</div>
      <div className="text-[10px] font-bold uppercase opacity-60 tracking-wider leading-relaxed">{desc}</div>
    </div>
  );
}
