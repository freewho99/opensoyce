import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, ArrowLeft } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { trackEvent } from '../utils/analytics';

export default function Challenge() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const repoParam = searchParams.get('repo') || '';

  const [formData, setFormData] = useState({
    repo: repoParam,
    currentLabel: 'USE READY',
    proposedLabel: 'USE READY',
    evidence: '',
    githubHandle: ''
  });

  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    trackEvent('challenge_label_click', { 
      repo: formData.repo, 
      currentLabel: formData.currentLabel, 
      proposedLabel: formData.proposedLabel 
    });

    // Save to Signal Inbox
    const signal = {
      ...formData,
      timestamp: Date.now(),
      status: 'NEW'
    };
    try {
      const raw = localStorage.getItem('opensoyce_challenges');
      const existing = raw ? JSON.parse(raw) : [];
      existing.unshift(signal);
      if (existing.length > 100) existing.length = 100;
      localStorage.setItem('opensoyce_challenges', JSON.stringify(existing));
    } catch (e) {
      console.error('Failed to save challenge', e);
    }

    setIsSubmitted(true);
  };

  const handleReset = () => {
    setFormData({
      repo: '',
      currentLabel: 'USE READY',
      proposedLabel: 'USE READY',
      evidence: '',
      githubHandle: ''
    });
    setIsSubmitted(false);
  };

  // HIGH MOMENTUM omitted — editorial-only tier, not a public verdict band.
  // See src/shared/verdict.js for the rationale.
  const labels = [
    'USE READY',
    'FORKABLE',
    'WATCHLIST',
    'RISKY BUT HOT',
    'STALE',
    'GRAVEYARD'
  ];

  return (
    <div className="bg-soy-label min-h-screen">
      {/* Hero */}
      <section className="bg-black py-24 px-4 text-center">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-soy-red text-white px-4 py-1 text-[10px] font-black uppercase tracking-[0.4em] mb-8 inline-block"
          >
            COMMUNITY REVIEW
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-6xl md:text-8xl font-black uppercase italic tracking-tighter mb-8 leading-[0.8] text-white"
          >
            CHALLENGE THIS LABEL
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-xl md:text-2xl font-bold uppercase tracking-widest text-soy-red italic"
          >
            OpenSoyce scores are signal, not gospel. If you have evidence that changes the picture, show us.
          </motion.p>
        </div>
      </section>

      {/* Form Section */}
      <section className="py-20 px-4">
        <div className="max-w-xl mx-auto">
          <AnimatePresence mode="wait">
            {!isSubmitted ? (
              <motion.div 
                key="form"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white border-4 border-black p-8 md:p-12 shadow-[12px_12px_0px_#000]"
              >
                <h2 className="text-3xl font-black uppercase italic tracking-tighter mb-8 border-b-4 border-black pb-4">
                  LABEL CHALLENGE
                </h2>
                
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest mb-2">GITHUB REPO</label>
                    <input 
                      type="text" 
                      required
                      placeholder="owner/repo"
                      className="w-full bg-soy-label/50 border-2 border-black p-4 font-black italic outline-none focus:bg-white transition-all uppercase"
                      value={formData.repo}
                      onChange={e => setFormData({...formData, repo: e.target.value})}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest mb-2">CURRENT LABEL</label>
                      <select 
                        className="w-full bg-soy-label/50 border-2 border-black p-4 font-black italic outline-none focus:bg-white transition-all appearance-none cursor-pointer"
                        value={formData.currentLabel}
                        onChange={e => setFormData({...formData, currentLabel: e.target.value})}
                      >
                        {labels.map(L => <option key={L}>{L}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-soy-red">PROPOSED LABEL</label>
                      <select 
                        className="w-full bg-soy-label/50 border-2 border-black p-4 font-black italic outline-none focus:bg-white transition-all appearance-none cursor-pointer"
                        value={formData.proposedLabel}
                        onChange={e => setFormData({...formData, proposedLabel: e.target.value})}
                      >
                        {labels.map(L => <option key={L}>{L}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest mb-2">YOUR EVIDENCE</label>
                    <textarea 
                      required
                      rows={5}
                      placeholder="Share links, data, recent commits, changelogs, community signals, or anything that changes the picture. Be specific."
                      className="w-full bg-soy-label/50 border-2 border-black p-4 font-black italic outline-none focus:bg-white transition-all resize-none"
                      value={formData.evidence}
                      onChange={e => setFormData({...formData, evidence: e.target.value})}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest mb-2">YOUR GITHUB HANDLE (optional)</label>
                    <input 
                      type="text" 
                      placeholder="@yourhandle — we may credit accurate challenges"
                      className="w-full bg-soy-label/50 border-2 border-black p-4 font-black italic outline-none focus:bg-white transition-all"
                      value={formData.githubHandle}
                      onChange={e => setFormData({...formData, githubHandle: e.target.value})}
                    />
                  </div>

                  <button 
                    type="submit"
                    className="w-full bg-black text-white py-6 text-xl font-black uppercase italic tracking-widest hover:bg-soy-red transition-all shadow-[6px_6px_0px_#E63322]"
                  >
                    SUBMIT CHALLENGE →
                  </button>
                </form>
              </motion.div>
            ) : (
              <motion.div 
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white border-4 border-black p-12 md:p-20 shadow-[12px_12px_0px_#000] text-center"
              >
                <div className="bg-soy-red text-white w-20 h-20 flex items-center justify-center mx-auto mb-8 shadow-[4px_4px_0px_#000]">
                  <Check size={40} strokeWidth={4} />
                </div>
                <h2 className="text-4xl font-black uppercase italic tracking-tighter mb-4 text-soy-red">
                  ✓ CHALLENGE RECEIVED
                </h2>
                <p className="text-lg font-bold uppercase tracking-widest mb-12 opacity-80 leading-relaxed italic">
                  We'll review your evidence against our live signals. If the score changes, we'll note the community challenge in the project record.
                </p>
                <button 
                  onClick={handleReset}
                  className="bg-black text-white px-10 py-5 text-sm font-black uppercase tracking-widest hover:bg-soy-red transition-all shadow-[6px_6px_0px_#000]"
                >
                  CHALLENGE ANOTHER →
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <p className="mt-12 text-center text-[10px] font-black uppercase tracking-widest opacity-40 leading-relaxed max-w-sm mx-auto italic">
            All challenges are reviewed manually. OpenSoyce adjusts scores based on live GitHub signals, not subjective opinions. Strong challenges come with verifiable evidence.
          </p>

          <div className="mt-12 flex flex-col sm:flex-row justify-center gap-6">
            <button 
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest hover:text-soy-red transition-colors"
            >
              <ArrowLeft size={14} /> BACK TO PROJECT
            </button>
            <Link 
              to="/leaderboards"
              className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest hover:text-soy-red transition-colors"
            >
              EXPLORE ALL PROJECTS →
            </Link>
          </div>
        </div>
      </section>

      <footer className="py-12 border-t-4 border-black text-center text-[10px] font-black uppercase tracking-[0.5em] opacity-40">
        © 2026 OPENSOYCE LABS. ALL SAUCE RESERVED.
      </footer>
    </div>
  );
}

function Link({ to, children, className }: { to: string, children: React.ReactNode, className?: string }) {
  const navigate = useNavigate();
  return (
    <a 
      href={to} 
      onClick={(e) => { e.preventDefault(); navigate(to); }} 
      className={className}
    >
      {children}
    </a>
  );
}
