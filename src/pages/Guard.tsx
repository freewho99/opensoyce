import React, { useState, useEffect } from 'react';
import { Shield, ShieldAlert, ShieldCheck, Trash2, Search, Loader2, AlertCircle, RefreshCw, Check, ArrowRight } from 'lucide-react';
import { useWatchlist } from '../context/WatchlistContext';
import { trackEvent } from '../utils/analytics';
import { motion, AnimatePresence } from 'motion/react';

interface GuardedRepo {
  id: string;
  owner: string;
  name: string;
  score: number;
  advisoriesCount: number;
  hasDependabot: boolean;
  hasSast: boolean;
  lastChecked: string;
}

export default function Guard() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardedList, setGuardedList] = useState<GuardedRepo[]>(() => {
    try {
      const saved = localStorage.getItem('soyce_guarded_repos');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error('Failed to load guarded list:', e);
      return [];
    }
  });

  const [toast, setToast] = useState<{message: string, show: boolean}>({message: '', show: false});

  const showToast = (message: string) => {
    setToast({ message, show: true });
    setTimeout(() => setToast({ message: '', show: false }), 3000);
  };

  const saveList = (list: GuardedRepo[]) => {
    setGuardedList(list);
    localStorage.setItem('soyce_guarded_repos', JSON.stringify(list));
  };

  const handleAddRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    const parts = input.split('/');
    const owner = parts[0]?.trim() || '';
    const repo = parts[1]?.trim() || '';

    if (!input.includes('/') || !owner || !repo) {
      setError('FORMAT: owner/repo (e.g. facebook/react)');
      return;
    }

    // Check if already guarded
    const alreadyGuarded = guardedList.some(
      item => item.owner.toLowerCase() === owner.toLowerCase() && item.name.toLowerCase() === repo.toLowerCase()
    );
    if (alreadyGuarded) {
      setError('THIS REPOSITORY IS ALREADY GUARDED.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, repo })
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === 'REPO_NOT_FOUND') {
          throw new Error('REPO NOT FOUND. CHECK THE OWNER/REPO FORMAT.');
        } else if (res.status === 429) {
          throw new Error('RATE LIMIT HIT. TRY AGAIN IN A MINUTE.');
        } else {
          throw new Error(data.error || 'GUARD ACTIVATION FAILED');
        }
      }

      trackEvent('guard_repo_added', { repo: `${owner}/${repo}` });

      const newRepo: GuardedRepo = {
        id: data.repo.id.toString(),
        owner: data.repo.owner,
        name: data.repo.name,
        score: data.total,
        advisoriesCount: data.meta.advisories?.total ?? 0,
        hasDependabot: !!data.meta.hasDependabot,
        hasSast: !!data.meta.hasSast,
        lastChecked: new Date().toISOString()
      };

      const updated = [newRepo, ...guardedList];
      saveList(updated);
      setInput('');
      showToast(`Guard activated for ${owner}/${repo}!`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveRepo = (id: string, owner: string, name: string) => {
    const updated = guardedList.filter(item => item.id !== id);
    saveList(updated);
    trackEvent('guard_repo_removed', { repo: `${owner}/${name}` });
    showToast(`Guard deactivated for ${owner}/${name}`);
  };

  const handleRefreshRepo = async (owner: string, name: string) => {
    showToast(`Refreshing guard status for ${owner}/${name}...`);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, repo: name })
      });

      if (!res.ok) throw new Error('Refresh failed');
      const data = await res.json();

      const updated = guardedList.map(item => {
        if (item.owner.toLowerCase() === owner.toLowerCase() && item.name.toLowerCase() === name.toLowerCase()) {
          return {
            ...item,
            score: data.total,
            advisoriesCount: data.meta.advisories?.total ?? 0,
            hasDependabot: !!data.meta.hasDependabot,
            hasSast: !!data.meta.hasSast,
            lastChecked: new Date().toISOString()
          };
        }
        return item;
      });
      saveList(updated);
      showToast(`Guard refreshed for ${owner}/${name}!`);
    } catch (err) {
      showToast(`Failed to refresh ${owner}/${name}`);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-12 relative">
      <AnimatePresence>
        {toast.show && (
          <motion.div 
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            className="fixed bottom-8 left-1/2 z-[100] bg-soy-bottle text-white px-6 py-3 font-black uppercase italic tracking-widest border-2 border-white shadow-[4px_4px_0px_#E63322] flex items-center gap-3"
          >
            <div className="bg-soy-red p-1"><Check size={16} /></div>
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mb-12">
        <h1 className="text-5xl font-bold uppercase italic tracking-tighter mb-4 flex items-center gap-3">
          <Shield className="text-soy-red" size={48} />
          Repository Guard
        </h1>
        <p className="text-xl font-medium opacity-60">
          Continuous security protection and vulnerability tracking for your dependencies.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Form Column */}
        <div className="lg:col-span-12 xl:col-span-12 h-fit">
          <form onSubmit={handleAddRepo} className="bg-white border-2 border-soy-bottle/40 p-8 space-y-6">
            <div className="flex items-center gap-3 mb-4">
              <ShieldCheck className="text-soy-red" size={32} />
              <h2 className="text-2xl font-bold uppercase italic tracking-tight">Protect Repository</h2>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-[10px] font-bold uppercase tracking-widest opacity-40">GITHUB REPOSITORY</label>
                <div className="relative">
                  <input 
                    type="text" 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    className={`w-full bg-soy-label/20 border-4 p-5 font-black outline-none transition-all ${input && !input.includes('/') ? 'border-soy-red' : 'border-soy-bottle'} focus:bg-white`}
                    placeholder="e.g. facebook/react or vercel/next.js"
                    required
                  />
                  {input && !input.includes('/') && (
                    <div className="absolute top-full right-0 mt-1 text-[8px] font-black uppercase text-soy-red tracking-widest">
                      FORMAT: owner/repo
                    </div>
                  )}
                </div>
              </div>
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-soy-bottle text-soy-label py-5 text-xl font-bold uppercase tracking-widest hover:bg-soy-red transition-all flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" /> : <Shield />}
              {loading ? 'Activating Guard...' : 'Activate Repository Guard'}
            </button>
          </form>

          {error && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 p-4 bg-soy-red/10 border-2 border-soy-red text-soy-red flex items-center gap-3 font-bold"
            >
              <AlertCircle size={20} />
              {error}
            </motion.div>
          )}
        </div>

        {/* Guard List Column */}
        <div className="lg:col-span-12 xl:col-span-12">
          {guardedList.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {guardedList.map(item => (
                <div key={item.id} className="bg-white border-4 border-black p-6 shadow-[8px_8px_0px_#000] relative flex flex-col justify-between group">
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-xl font-black uppercase italic tracking-tight">{item.name}</h3>
                        <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">{item.owner}</p>
                      </div>
                      <div className="bg-soy-label border-2 border-black px-2 py-1 text-xs font-black italic">
                        {item.score.toFixed(1)}
                      </div>
                    </div>

                    <div className="space-y-2 border-t border-b border-black/5 py-4 mb-4">
                      <div className="flex justify-between items-center text-xs font-mono">
                        <span className="opacity-60">ADVISORIES</span>
                        {item.advisoriesCount > 0 ? (
                          <span className="bg-soy-red text-white text-[9px] px-1.5 py-0.5 font-bold uppercase tracking-wider flex items-center gap-1">
                            <ShieldAlert size={10} /> {item.advisoriesCount} CVEs
                          </span>
                        ) : (
                          <span className="text-emerald-600 font-bold flex items-center gap-1">
                            <ShieldCheck size={12} /> SECURE
                          </span>
                        )}
                      </div>
                      <div className="flex justify-between items-center text-xs font-mono">
                        <span className="opacity-60">DEPENDABOT</span>
                        <span className={item.hasDependabot ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                          {item.hasDependabot ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs font-mono">
                        <span className="opacity-60">SAST / CI</span>
                        <span className={item.hasSast ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                          {item.hasSast ? 'ENABLED' : 'DISABLED'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-[9px] font-mono opacity-40 mb-4 uppercase">
                      Checked: {new Date(item.lastChecked).toLocaleString()}
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleRefreshRepo(item.owner, item.name)}
                        className="flex-1 border-2 border-black py-2 text-[10px] font-black uppercase tracking-widest hover:bg-soy-label transition-all flex items-center justify-center gap-1"
                        title="Force Scan Now"
                      >
                        <RefreshCw size={10} /> SCAN NOW
                      </button>
                      <button 
                        onClick={() => handleRemoveRepo(item.id, item.owner, item.name)}
                        className="border-2 border-black p-2 text-soy-red hover:bg-soy-red hover:text-white transition-all"
                        title="Deactivate Guard"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-20 border-4 border-dashed border-soy-bottle/20 rounded-xl text-center">
              <Shield size={64} className="opacity-15 text-soy-bottle mb-4" />
              <p className="text-xl font-bold uppercase italic tracking-widest opacity-35">No Repositories Guarded</p>
              <p className="text-sm font-medium opacity-35 max-w-sm mt-2">
                Enter a repository above to activate continuous security scanning and monitor vulnerabilities.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
