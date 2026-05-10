import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, ArrowRight, Github } from 'lucide-react';
import { trackEvent } from '../utils/analytics';

export default function SubmitProject() {
  const [formData, setFormData] = useState({
    githubUrl: '',
    category: 'AI Agent Harnesses',
    description: '',
    suggestedLabel: 'USE READY',
    email: ''
  });
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    trackEvent('submit_project_click', { 
      githubUrl: formData.githubUrl, 
      category: formData.category, 
      suggestedLabel: formData.suggestedLabel 
    });

    // Save to Signal Inbox
    const signal = {
      ...formData,
      timestamp: Date.now(),
      status: 'NEW'
    };
    try {
      const raw = localStorage.getItem('opensoyce_submissions');
      const existing = raw ? JSON.parse(raw) : [];
      existing.unshift(signal);
      if (existing.length > 100) existing.length = 100;
      localStorage.setItem('opensoyce_submissions', JSON.stringify(existing));
    } catch (e) {
      console.error('Failed to save submission', e);
    }

    setIsSubmitted(true);
  };

  const handleReset = () => {
    setFormData({
      githubUrl: '',
      category: 'AI Agent Harnesses',
      description: '',
      suggestedLabel: 'USE READY',
      email: ''
    });
    setIsSubmitted(false);
  };

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
            PUBLIC ALPHA — COMMUNITY SUBMISSIONS
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-6xl md:text-8xl font-black uppercase italic tracking-tighter mb-8 leading-[0.8] text-white"
          >
            SUBMIT A PROJECT
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-xl md:text-2xl font-bold uppercase tracking-widest text-soy-red italic"
          >
            Know a repo worth analyzing? Nominate it for OpenSoyce.
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
                  PROJECT SUBMISSION
                </h2>
                
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest mb-2">GitHub URL</label>
                    <input 
                      type="url" 
                      required
                      placeholder="https://github.com/owner/repo"
                      className="w-full bg-soy-label/50 border-2 border-black p-4 font-black italic outline-none focus:bg-white transition-all"
                      value={formData.githubUrl}
                      onChange={e => setFormData({...formData, githubUrl: e.target.value})}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest mb-2">Category</label>
                    <select 
                      className="w-full bg-soy-label/50 border-2 border-black p-4 font-black italic outline-none focus:bg-white transition-all appearance-none cursor-pointer"
                      value={formData.category}
                      onChange={e => setFormData({...formData, category: e.target.value})}
                    >
                      <option>AI Agent Harnesses</option>
                      <option>CSS & Design Systems</option>
                      <option>Developer Tooling</option>
                      <option>Framework Alternatives</option>
                      <option>Data & Backend</option>
                      <option>Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest mb-2">Why should this be on OpenSoyce?</label>
                    <textarea 
                      required
                      rows={4}
                      placeholder="What makes this repo worth analyzing? Why is it forkable, hot, or underrated?"
                      className="w-full bg-soy-label/50 border-2 border-black p-4 font-black italic outline-none focus:bg-white transition-all resize-none"
                      value={formData.description}
                      onChange={e => setFormData({...formData, description: e.target.value})}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest mb-2">Suggested Label</label>
                    <select 
                      className="w-full bg-soy-label/50 border-2 border-black p-4 font-black italic outline-none focus:bg-white transition-all appearance-none cursor-pointer"
                      value={formData.suggestedLabel}
                      onChange={e => setFormData({...formData, suggestedLabel: e.target.value})}
                    >
                      <option>USE READY</option>
                      <option>FORKABLE</option>
                      <option>WATCHLIST</option>
                      <option>HIGH MOMENTUM</option>
                      <option>STALE</option>
                      <option>NOT SURE</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest mb-2">Your Email (optional)</label>
                    <input 
                      type="email" 
                      placeholder="we'll notify you when it's analyzed"
                      className="w-full bg-soy-label/50 border-2 border-black p-4 font-black italic outline-none focus:bg-white transition-all"
                      value={formData.email}
                      onChange={e => setFormData({...formData, email: e.target.value})}
                    />
                  </div>

                  <button 
                    type="submit"
                    className="w-full bg-black text-white py-6 text-xl font-black uppercase italic tracking-widest hover:bg-soy-red transition-all shadow-[6px_6px_0px_#E63322]"
                  >
                    SUBMIT FOR ANALYSIS →
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
                  ✓ SUBMISSION RECEIVED
                </h2>
                <p className="text-lg font-bold uppercase tracking-widest mb-12 opacity-80 leading-relaxed italic">
                  We'll analyze this repo and add it to the board if it meets the signal threshold.
                </p>
                <button 
                  onClick={handleReset}
                  className="bg-black text-white px-10 py-5 text-sm font-black uppercase tracking-widest hover:bg-soy-red transition-all shadow-[6px_6px_0px_#000]"
                >
                  SUBMIT ANOTHER →
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <p className="mt-12 text-center text-[10px] font-black uppercase tracking-widest opacity-40 leading-relaxed max-w-sm mx-auto italic">
            OpenSoyce reviews all submissions manually. Not all submitted repos will be added. The Soyce Score is determined by live GitHub signals, not by the submitter's suggested label.
          </p>
        </div>
      </section>

      <footer className="py-12 border-t-4 border-black text-center text-[10px] font-black uppercase tracking-[0.5em] opacity-40">
        © 2026 OPENSOYCE LABS. ALL SAUCE RESERVED.
      </footer>
    </div>
  );
}
