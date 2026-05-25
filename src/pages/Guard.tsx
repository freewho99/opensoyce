import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Shield, ShieldAlert, ShieldCheck, Trash2, Search, Loader2, AlertCircle, RefreshCw, Check, ArrowRight, GitPullRequest, FileCode, MessageSquare, Download, X, AlertTriangle, Lock, Activity, Users, Zap, FlaskConical, AlertOctagon, Shuffle, Scale, History, Skull, CheckCircle } from 'lucide-react';
import { trackEvent } from '../utils/analytics';
import { motion, AnimatePresence } from 'motion/react';
import GuardPrCommentPreview from '../components/GuardPrCommentPreview';
import { TSC_CONTROLS, PRESETS } from '../data/complianceControls';

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

const POLICY_YAML = `policy:
  block:
    - graveyard
    - risky
  warn:
    - watchlist
    - stable
  allow:
    - use-ready
    - forkable

exceptions:
  require_reason: true
  expire_after_days: 30

reports:
  signed: true
  sarif: true`;

const STEPS = [
  { icon: Download, title: 'Install GitHub App', body: 'Add OpenSoyce Guard to your org or repo in two clicks.' },
  { icon: GitPullRequest, title: 'PR opens', body: 'Any pull request that touches a lockfile triggers Guard.' },
  { icon: ShieldCheck, title: 'Guard scans lockfile changes', body: 'Each added or upgraded dependency is labeled across nine risk signals.' },
  { icon: MessageSquare, title: 'Comment with labels + verdict', body: 'A single readable comment shows what to allow, warn on, or block.' },
];

const CHECKS = [
  { icon: AlertOctagon, label: 'Vulnerabilities', body: 'Known CVEs and unresolved advisories.' },
  { icon: Users, label: 'Maintainer concentration', body: 'How many people actually control the code.' },
  { icon: Activity, label: 'Fork velocity', body: 'Is the source repo moving — or stalling?' },
  { icon: Zap, label: 'Postinstall scripts', body: 'Code that runs on `npm install`. Always inspected.' },
  { icon: Shuffle, label: 'Typosquats', body: 'Names that look like popular packages.' },
  { icon: FlaskConical, label: 'Dependency confusion', body: 'Internal names colliding with public registries.' },
  { icon: Scale, label: 'License risk', body: 'Copyleft, custom, missing, or recently changed.' },
  { icon: History, label: 'Advisory history', body: 'Repeat offenders flagged automatically.' },
  { icon: Skull, label: 'Abandonment signals', body: 'No releases, no commits, no answers.' },
];

const FREE_FEATURES = [
  'Public labels on any repo',
  'Free one-shot scans via /scanner',
  'Shareable public reports',
  'Public-repo GitHub Action',
];

const TEAM_FEATURES = [
  'Private repos',
  'PR comments with verdict',
  'Policy enforcement (.opensoyce.yml)',
  'Full history & audit log',
  'Exceptions with reason + expiry',
  'Watchlists across the org',
  'Slack alerts',
];

function classifyCompStatus(row: any): 'active' | 'expired' | 'revoked' {
  if (row.revoked_at) return 'revoked';
  const expiresMs = Date.parse(row.expires_at);
  if (Number.isFinite(expiresMs) && expiresMs <= Date.now()) return 'expired';
  return 'active';
}

export default function Guard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');

  const [activeTab, setActiveTab] = useState<'sandbox' | 'app' | 'compliance'>(() => {
    if (tabParam === 'sandbox' || tabParam === 'app' || tabParam === 'compliance') {
      return tabParam;
    }
    const saved = localStorage.getItem('soyce_guarded_repos');
    if (saved && JSON.parse(saved).length > 0) {
      return 'sandbox';
    }
    return 'app';
  });

  const [activePreset, setActivePreset] = useState('soc2');

  // Sync state if search params change
  useEffect(() => {
    if (tabParam === 'sandbox' || tabParam === 'app' || tabParam === 'compliance') {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const handleTabChange = (tab: 'sandbox' | 'app' | 'compliance') => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

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

  // Compliance tab state
  const [authStatus, setAuthStatus] = useState<'checking' | 'authenticated' | 'unauthenticated'>('checking');
  const [sessionUser, setSessionUser] = useState<string | null>(null);
  const [complianceRepos, setComplianceRepos] = useState<Array<{ owner: string; repo: string }>>([]);
  const [selectedCompRepo, setSelectedCompRepo] = useState<{ owner: string; repo: string } | null>(null);
  const [compReport, setCompReport] = useState<any>(null);
  const [compLoading, setCompLoading] = useState(false);
  const [compError, setCompError] = useState<string | null>(null);
  const [downloadingReport, setDownloadingReport] = useState(false);

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

  // Compliance tab: Auth check & repo list loading
  useEffect(() => {
    if (activeTab !== 'compliance') return;

    let cancelled = false;
    const checkAuth = async () => {
      try {
        setAuthStatus('checking');
        const resp = await fetch('/api/exceptions?action=whoami');
        if (resp.ok) {
          const body = await resp.json();
          if (cancelled) return;
          setSessionUser(body.login || null);
          setAuthStatus('authenticated');

          const reposResp = await fetch('/api/exceptions?action=my-repos');
          if (reposResp.ok) {
            const reposBody = await reposResp.json();
            if (!cancelled) {
              setComplianceRepos(reposBody.repos || []);
              if (reposBody.repos && reposBody.repos.length > 0) {
                setSelectedCompRepo(reposBody.repos[0]);
              }
            }
          }
        } else {
          if (!cancelled) setAuthStatus('unauthenticated');
        }
      } catch (err) {
        if (!cancelled) setAuthStatus('unauthenticated');
      }
    };
    checkAuth();
    return () => { cancelled = true; };
  }, [activeTab]);

  // Compliance tab: Fetch report data
  useEffect(() => {
    if (activeTab !== 'compliance' || !selectedCompRepo) return;

    let cancelled = false;
    const fetchReport = async () => {
      try {
        setCompLoading(true);
        setCompError(null);
        const url = `/api/exceptions?action=compliance-report&owner=${encodeURIComponent(selectedCompRepo.owner)}&repo=${encodeURIComponent(selectedCompRepo.repo)}`;
        const resp = await fetch(url);
        if (!resp.ok) {
          const body = await resp.json().catch(() => null);
          throw new Error((body && body.message) || `Failed to fetch compliance report (${resp.status})`);
        }
        const body = await resp.json();
        if (!cancelled) {
          setCompReport(body);
        }
      } catch (err: any) {
        if (!cancelled) setCompError(err.message || 'Error loading report');
      } finally {
        if (!cancelled) setCompLoading(false);
      }
    };
    fetchReport();
    return () => { cancelled = true; };
  }, [activeTab, selectedCompRepo]);

  const handleDownloadReport = async () => {
    if (!selectedCompRepo) return;
    try {
      setDownloadingReport(true);
      const url = `/api/exceptions?action=compliance-report&owner=${encodeURIComponent(selectedCompRepo.owner)}&repo=${encodeURIComponent(selectedCompRepo.repo)}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('Download failed');
      const blob = await resp.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `opensoyce-soc2-compliance-${selectedCompRepo.owner}-${selectedCompRepo.repo}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('SOC 2 Compliance Report downloaded!');
    } catch (err) {
      showToast('Failed to download compliance report');
    } finally {
      setDownloadingReport(false);
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

      {/* HEADER */}
      <div className="mb-8 border-b-4 border-soy-bottle pb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
        <div>
          <h1 className="text-5xl font-black uppercase italic tracking-tighter mb-2 flex items-center gap-3">
            <Shield className="text-soy-red" size={48} />
            Repository Guard
          </h1>
          <p className="text-sm font-bold uppercase tracking-widest opacity-60 italic">
            Continuous vulnerability tracking and merge gate protection.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex flex-wrap bg-soy-label border-4 border-soy-bottle p-1 font-black uppercase italic tracking-wider text-xs gap-1">
          <button
            onClick={() => handleTabChange('sandbox')}
            className={`px-4 py-2 transition-all ${
              activeTab === 'sandbox'
                ? 'bg-soy-red text-white shadow-[2px_2px_0px_#000]'
                : 'text-soy-bottle hover:text-soy-red'
            }`}
          >
            🛡️ Sandbox Guard
          </button>
          <button
            onClick={() => handleTabChange('compliance')}
            className={`px-4 py-2 transition-all ${
              activeTab === 'compliance'
                ? 'bg-soy-red text-white shadow-[2px_2px_0px_#000]'
                : 'text-soy-bottle hover:text-soy-red'
            }`}
          >
            🛡️ SOC 2 Compliance
          </button>
          <button
            onClick={() => handleTabChange('app')}
            className={`px-4 py-2 transition-all ${
              activeTab === 'app'
                ? 'bg-soy-red text-white shadow-[2px_2px_0px_#000]'
                : 'text-soy-bottle hover:text-soy-red'
            }`}
          >
            ⚙️ GitHub App Info
          </button>
        </div>
      </div>

      {activeTab === 'sandbox' && (
        <div className="space-y-12">
          {/* SANDBOX GUARD VIEW */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            {/* Form Column */}
            <div className="lg:col-span-12 xl:col-span-12 h-fit">
              <form onSubmit={handleAddRepo} className="bg-white border-4 border-soy-bottle p-8 space-y-6 shadow-[6px_6px_0px_#000]">
                <div className="flex items-center gap-3 mb-4">
                  <ShieldCheck className="text-soy-red" size={32} />
                  <h2 className="text-2xl font-black uppercase italic tracking-tight">Protect Repository</h2>
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
                  className="w-full bg-soy-bottle text-white py-5 text-xl font-black uppercase tracking-widest hover:bg-soy-red transition-all flex items-center justify-center gap-3 disabled:opacity-50 border-4 border-black"
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
      )}

      {activeTab === 'compliance' && (
        <div className="space-y-16">
          {/* ─── COMPLIANCE INFRASTRUCTURE OVERVIEW ─────────────────────── */}
          <section className="bg-black text-white p-8 md:p-12 border-4 border-soy-red shadow-[8px_8px_0px_#000] relative overflow-hidden">
            <div className="absolute inset-0 opacity-5 pointer-events-none"
              style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 40px, #E63322 40px, #E63322 41px), repeating-linear-gradient(90deg, transparent, transparent 40px, #E63322 40px, #E63322 41px)' }}
            />
            <div className="relative z-10 font-mono">
              <div className="inline-flex items-center gap-3 bg-soy-red text-white px-5 py-2 text-xs font-black uppercase tracking-widest italic mb-6 shadow-[4px_4px_0px_rgba(255,255,255,0.2)]">
                <Shield size={14} /> COMPLIANCE INFRASTRUCTURE
              </div>
              <h2 className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter mb-4">
                SOC 2 TYPE II & ISO 27001 READY
              </h2>
              <p className="text-sm font-bold uppercase tracking-widest text-white/70 italic leading-relaxed max-w-3xl">
                OpenSoyce maps directly to SOC 2 Trust Service Criteria and ISO 27001 controls. Policy-as-code, signed audit trails, and automated PR gates — built in, not bolted on.
              </p>
            </div>
          </section>

          {/* ─── TRUST SERVICE CRITERIA GRID ──────────────────────────────── */}
          <section className="font-mono">
            <div className="mb-8">
              <div className="inline-block bg-soy-red text-white px-4 py-1 text-[10px] font-black uppercase tracking-widest italic mb-3 shadow-[2px_2px_0px_#000]">
                CRITERIA MAPPING
              </div>
              <h3 className="text-3xl font-black uppercase italic tracking-tighter text-soy-bottle">Every Control. Covered.</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {TSC_CONTROLS.map((ctrl) => {
                const Icon = ctrl.icon;
                return (
                  <div
                    key={ctrl.id}
                    className="bg-white border-4 border-black shadow-[6px_6px_0px_#000] overflow-hidden flex flex-col"
                  >
                    <div className={`${ctrl.accent} text-white px-4 py-2 flex items-center justify-between`}>
                      <div className="flex items-center gap-2">
                        <Icon size={14} />
                        <span className="font-black uppercase tracking-widest text-[10px]">{ctrl.code}</span>
                      </div>
                      <span className="text-[8px] font-black uppercase tracking-widest opacity-70 italic">{ctrl.category}</span>
                    </div>

                    <div className="p-5 flex-1 flex flex-col">
                      <h4 className="text-base font-black uppercase italic tracking-tight leading-tight mb-2 text-soy-bottle">{ctrl.title}</h4>
                      <p className="text-[11px] font-bold opacity-60 leading-relaxed mb-4 text-soy-bottle">{ctrl.desc}</p>

                      <ul className="mt-auto space-y-1.5">
                        {ctrl.features.map(f => (
                          <li key={f} className="flex items-start gap-2.5 text-[10px] font-bold text-soy-bottle">
                            <CheckCircle size={12} className="text-emerald-500 shrink-0 mt-0.5" />
                            <span className="opacity-80 leading-snug">{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ─── POLICY PRESET STUDIO ─────────────────────────────────────── */}
          <section className="bg-black text-white p-8 border-4 border-soy-red shadow-[8px_8px_0px_#000] font-mono">
            <div className="mb-8">
              <div className="inline-block bg-soy-red text-white px-4 py-1 text-[10px] font-black uppercase tracking-widest italic mb-3 shadow-[2px_2px_0px_rgba(255,255,255,0.2)]">
                POLICY-AS-CODE
              </div>
              <h3 className="text-3xl font-black uppercase italic tracking-tighter">One line. Full compliance.</h3>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-4 space-y-3">
                {PRESETS.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setActivePreset(p.id)}
                    className={`w-full text-left px-4 py-3 border-4 transition-all font-mono ${p.color} ${
                      activePreset === p.id
                        ? `${p.bgActive} shadow-[4px_4px_0px_rgba(255,255,255,0.2)]`
                        : 'bg-white/5 text-white hover:bg-white/10 border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-black uppercase italic tracking-tight text-sm">{p.label}</span>
                      <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 border ${
                        activePreset === p.id ? 'bg-white/20 border-white/40' : 'border-white/20 opacity-60'
                      }`}>{p.badge}</span>
                    </div>
                    <div className="text-[9px] opacity-60 uppercase tracking-wider mt-1 font-bold">
                      {p.id === 'soc2' ? 'blocks graveyard + risky · warns watchlist' :
                       p.id === 'iso27001' ? 'identical thresholds, different audit framing' :
                       'blocks graveyard + risky + watchlist · warns stable'}
                    </div>
                  </button>
                ))}
              </div>

              <div className="lg:col-span-8">
                {(() => {
                  const currentPreset = PRESETS.find(p => p.id === activePreset)!;
                  return (
                    <div className={`border-4 ${currentPreset.color} bg-[#0d0d0d] overflow-hidden`}>
                      <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/10">
                        <div className="flex gap-2">
                          <div className="w-2.5 h-2.5 rounded-full bg-soy-red" />
                          <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                        </div>
                        <span className="text-[9px] font-black uppercase tracking-widest opacity-40 font-mono">.opensoyce.yml</span>
                        <span className="text-[9px] font-black uppercase tracking-widest opacity-40">{currentPreset.label}</span>
                      </div>

                      <pre className="p-4 font-mono text-xs leading-relaxed overflow-x-auto text-white/80">
                        {currentPreset.yaml.split('\n').map((line, i) => {
                          const isComment = line.trim().startsWith('#');
                          const isKey = line.includes(':') && !isComment;
                          const isValue = line.trim().startsWith('- ');
                          return (
                            <div key={i} className={
                              isComment ? 'text-white/30' :
                              isValue ? 'text-emerald-400' :
                              isKey ? 'text-soy-red' :
                              'text-white/80'
                            }>
                              {line || '\u00A0'}
                            </div>
                          );
                        })}
                      </pre>
                    </div>
                  );
                })()}
              </div>
            </div>
          </section>

          {/* ─── LIVE COMPLIANCE AUDIT TRAIL ────────────────────────────── */}
          <section className="pt-8 border-t-4 border-soy-bottle/30 space-y-6">
            <div className="mb-4">
              <div className="inline-block bg-soy-red text-white px-4 py-1 text-[10px] font-black uppercase tracking-widest italic mb-3 shadow-[2px_2px_0px_#000]">
                ACTIVE AUDIT RECORDS
              </div>
              <h3 className="text-3xl font-black uppercase italic tracking-tighter text-soy-bottle">Cryptographic Evidence Trail</h3>
            </div>

            <div className="font-mono text-soy-bottle">
              {authStatus === 'checking' && (
            <div className="flex flex-col items-center justify-center p-12 bg-white border-4 border-soy-bottle shadow-[6px_6px_0px_#000]">
              <Loader2 className="animate-spin text-soy-red mb-4" size={32} />
              <p className="text-xs font-black uppercase tracking-widest opacity-60">Verifying your dashboard session...</p>
            </div>
          )}

          {authStatus === 'unauthenticated' && (
            <div className="flex flex-col items-center justify-center p-12 bg-white border-4 border-soy-bottle shadow-[6px_6px_0px_#000] text-center">
              <Lock className="text-soy-red mb-4" size={48} />
              <h3 className="text-2xl font-black uppercase italic tracking-tight mb-2">SOC 2 Compliance Log Access Gated</h3>
              <p className="text-xs font-bold uppercase tracking-widest opacity-60 max-w-md mb-6 leading-relaxed">
                Authentication is required to retrieve compliance audit trails and cryptographically signed reports. Please sign in to the dashboard first.
              </p>
              <Link to="/dashboard" className="bg-soy-bottle text-white py-3 px-8 text-sm font-black uppercase tracking-widest hover:bg-soy-red transition-all border-4 border-black shadow-[4px_4px_0px_#000]">
                Go to Dashboard to Sign In
              </Link>
            </div>
          )}

          {authStatus === 'authenticated' && complianceRepos.length === 0 && (
            <div className="flex flex-col items-center justify-center p-12 bg-white border-4 border-soy-bottle shadow-[6px_6px_0px_#000] text-center">
              <ShieldAlert className="text-soy-red mb-4" size={48} />
              <h3 className="text-2xl font-black uppercase italic tracking-tight mb-2">No Eligible Repositories Found</h3>
              <p className="text-xs font-bold uppercase tracking-widest opacity-60 max-w-md leading-relaxed">
                OpenSoyce Guard must be installed on at least one GitHub repository where you have write or admin permissions to view compliance reports.
              </p>
            </div>
          )}

          {authStatus === 'authenticated' && complianceRepos.length > 0 && (
            <div className="space-y-8">
              {/* Selector */}
              <div className="bg-white border-4 border-soy-bottle p-6 shadow-[6px_6px_0px_#000] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="text-soy-red" size={28} />
                  <div>
                    <h3 className="text-lg font-black uppercase italic">Compliance Audit Trail</h3>
                    <p className="text-[10px] opacity-60 font-bold uppercase tracking-wider">Select repository to view SOC 2 change control logs</p>
                  </div>
                </div>
                
                <div>
                  <select
                    value={selectedCompRepo ? `${selectedCompRepo.owner}/${selectedCompRepo.repo}` : ''}
                    onChange={(e) => {
                      const parts = e.target.value.split('/');
                      setSelectedCompRepo({ owner: parts[0], repo: parts[1] });
                    }}
                    className="bg-soy-label border-4 border-soy-bottle px-4 py-2 font-mono text-xs font-black uppercase tracking-widest outline-none focus:bg-white"
                  >
                    {complianceRepos.map((r: any) => (
                      <option key={`${r.owner}/${r.repo}`} value={`${r.owner}/${r.repo}`}>
                        {r.owner}/{r.repo}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {compLoading && !compReport ? (
                <div className="flex justify-center p-12 bg-white border-4 border-soy-bottle shadow-[6px_6px_0px_#000]">
                  <Loader2 className="animate-spin text-soy-red" size={32} />
                </div>
              ) : compError ? (
                <div className="p-6 bg-soy-red/10 border-4 border-soy-red text-soy-red font-bold flex items-center gap-3 shadow-[6px_6px_0px_#000]">
                  <AlertCircle size={24} />
                  <div>
                    <h4 className="font-black uppercase tracking-tight">Failed to Load Compliance Data</h4>
                    <p className="text-xs opacity-80 mt-1">{compError}</p>
                  </div>
                </div>
              ) : compReport ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  {/* Summary Stats Column */}
                  <div className="lg:col-span-4 space-y-6">
                    <div className="bg-white border-4 border-black p-6 shadow-[6px_6px_0px_#000]">
                      <h4 className="text-lg font-black uppercase italic mb-4 border-b-2 border-black/10 pb-2">Audit Statistics</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-soy-label/20 p-4 border-2 border-soy-bottle">
                          <span className="block text-[10px] font-bold opacity-60 uppercase">Total Logged</span>
                          <span className="text-3xl font-black">{compReport.summary.total}</span>
                        </div>
                        <div className="bg-emerald-50 p-4 border-2 border-emerald-600">
                          <span className="block text-[10px] font-bold text-emerald-700 uppercase">Active</span>
                          <span className="text-3xl font-black text-emerald-800">{compReport.summary.active}</span>
                        </div>
                        <div className="bg-amber-50 p-4 border-2 border-amber-500">
                          <span className="block text-[10px] font-bold text-amber-700 uppercase">Expired</span>
                          <span className="text-3xl font-black text-amber-800">{compReport.summary.expired}</span>
                        </div>
                        <div className="bg-soy-label/10 p-4 border-2 border-soy-bottle opacity-60">
                          <span className="block text-[10px] font-bold opacity-60 uppercase">Revoked</span>
                          <span className="text-3xl font-black">{compReport.summary.revoked}</span>
                        </div>
                      </div>
                    </div>

                    {/* Policy Summary */}
                    <div className="bg-white border-4 border-black p-6 shadow-[6px_6px_0px_#000]">
                      <h4 className="text-lg font-black uppercase italic mb-4 border-b-2 border-black/10 pb-2">Policy Settings</h4>
                      <div className="space-y-3 font-mono text-[11px]">
                        <div className="flex justify-between border-b border-black/5 pb-1">
                          <span className="opacity-60">RESOLVED VIA</span>
                          <span className="font-bold uppercase">{compReport.policy.source}</span>
                        </div>
                        {compReport.policy.preset && (
                          <div className="flex justify-between border-b border-black/5 pb-1">
                            <span className="opacity-60">PRESET MODE</span>
                            <span className="font-bold uppercase text-soy-red">{compReport.policy.preset}</span>
                          </div>
                        )}
                        {compReport.policy.orgPolicyRepo && (
                          <div className="flex justify-between border-b border-black/5 pb-1">
                            <span className="opacity-60">ORG REPO</span>
                            <span className="font-bold truncate max-w-[150px]">{compReport.policy.orgPolicyRepo}</span>
                          </div>
                        )}
                        <div className="pt-2">
                          <span className="block text-[10px] font-black opacity-60 uppercase mb-2">BLOCKED RISK LABELS</span>
                          <div className="flex flex-wrap gap-1">
                            {compReport.policy.resolved.block.length > 0 ? (
                              compReport.policy.resolved.block.map((lbl: string) => (
                                <span key={lbl} className="bg-soy-red text-white text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 border border-black">{lbl}</span>
                              ))
                            ) : (
                              <span className="text-gray-400 italic">None</span>
                            )}
                          </div>
                        </div>
                        <div className="pt-2">
                          <span className="block text-[10px] font-black opacity-60 uppercase mb-2">WARNED RISK LABELS</span>
                          <div className="flex flex-wrap gap-1">
                            {compReport.policy.resolved.warn && compReport.policy.resolved.warn.length > 0 ? (
                              compReport.policy.resolved.warn.map((lbl: string) => (
                                <span key={lbl} className="bg-amber-400 text-black text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 border border-black">{lbl}</span>
                              ))
                            ) : (
                              <span className="text-gray-400 italic">None</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Action Button */}
                    <button
                      onClick={handleDownloadReport}
                      disabled={downloadingReport}
                      className="w-full bg-soy-bottle text-white py-4 text-sm font-black uppercase tracking-widest hover:bg-soy-red transition-all flex items-center justify-center gap-2 border-4 border-black shadow-[6px_6px_0px_#000] disabled:opacity-50"
                    >
                      {downloadingReport ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
                      {downloadingReport ? 'Generating Report...' : 'Download Signed Audit Log'}
                    </button>
                  </div>

                  {/* Exceptions List Column */}
                  <div className="lg:col-span-8 space-y-6">
                    {/* Signing verification banner */}
                    {compReport.signature ? (
                      <div className="bg-emerald-50 border-4 border-emerald-600 p-4 flex items-start gap-3 shadow-[4px_4px_0px_#10B981]">
                        <Check size={20} className="text-emerald-700 shrink-0 mt-0.5" />
                        <div className="font-mono text-xs">
                          <h4 className="font-black text-[11px] uppercase text-emerald-800 tracking-tight">
                            Cryptographically Signed Report
                          </h4>
                          <p className="text-[10px] opacity-80 mt-1 leading-relaxed">
                            Algorithm: {compReport.signature.algorithm} <br />
                            Key ID / Fingerprint: <span className="break-all font-bold">{compReport.signature.keyFingerprint}</span> <br />
                            Signed At: {new Date(compReport.signature.signedAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-amber-50 border-4 border-amber-600 p-4 flex items-start gap-3 shadow-[4px_4px_0px_#F59E0B]">
                        <AlertTriangle size={20} className="text-amber-700 shrink-0 mt-0.5" />
                        <div className="font-mono text-xs">
                          <h4 className="font-black text-[11px] uppercase text-amber-800 tracking-tight">
                            Unsigned Report Payload
                          </h4>
                          <p className="text-[10px] opacity-80 mt-1 leading-relaxed">
                            Crypto signing key not configured on server. Report content is valid but lacks cryptographic verification signature.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Table of Exceptions */}
                    <div className="bg-white border-4 border-black p-6 shadow-[6px_6px_0px_#000] overflow-hidden">
                      <h4 className="text-lg font-black uppercase italic mb-4">Logged Exceptions</h4>
                      {compReport.exceptions.length === 0 ? (
                        <div className="p-8 border-2 border-dashed border-soy-bottle/20 text-center">
                          <p className="text-sm font-bold uppercase tracking-widest opacity-40">No exceptions logged for this repository</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse font-mono text-[11px]">
                            <thead>
                              <tr className="border-b-2 border-soy-bottle text-left opacity-60 uppercase font-black">
                                <th className="pb-2">Package</th>
                                <th className="pb-2">Ecosystem</th>
                                <th className="pb-2">Granted By</th>
                                <th className="pb-2">Expires At</th>
                                <th className="pb-2 text-right">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-soy-bottle/10">
                              {compReport.exceptions.map((row: any) => {
                                const status = classifyCompStatus(row);
                                const statusCls = 
                                  status === 'active' ? 'bg-emerald-500 text-white border-black' :
                                  status === 'expired' ? 'bg-amber-400 text-black border-black' :
                                  'bg-black text-white border-black';
                                return (
                                  <tr key={row.id} className="hover:bg-soy-label/10">
                                    <td className="py-3 font-bold">{row.package_name}</td>
                                    <td className="py-3"><span className="border border-soy-bottle/40 px-1 py-0.5 text-[9px] font-black">{row.ecosystem}</span></td>
                                    <td className="py-3">@{row.granted_by}</td>
                                    <td className="py-3">{new Date(row.expires_at).toLocaleDateString()}</td>
                                    <td className="py-3 text-right">
                                      <span className={`inline-block px-1.5 py-0.5 text-[9px] font-black uppercase border ${statusCls}`}>
                                        {status}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </section>
    </div>
  )}

      {activeTab === 'app' && (
        <div className="space-y-24">
          {/* MARKETING / INFO GITHUB APP VIEW */}
          <section className="text-center">
            <div className="inline-flex items-center gap-2 bg-black text-white px-4 py-1.5 text-[10px] font-black uppercase tracking-widest italic mb-6 border-2 border-soy-red shadow-[4px_4px_0px_#E63322]">
              <ShieldCheck size={12} /> GitHub App · PR-native
            </div>
            <h1 className="text-5xl md:text-7xl font-black uppercase italic tracking-tighter mb-6 text-soy-bottle">
              Stop risky dependencies <br className="hidden md:block" />
              <span className="text-soy-red">before they merge.</span>
            </h1>
            <p className="max-w-3xl mx-auto text-lg md:text-xl font-bold uppercase tracking-widest opacity-60 italic leading-relaxed mb-10">
              OpenSoyce Guard scans dependency changes in pull requests, labels risk, and helps your team decide what to allow, warn, or block.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/guard/install"
                className="inline-flex items-center gap-2 bg-soy-red text-white px-8 py-4 text-lg font-black uppercase italic tracking-tight border-4 border-black shadow-[6px_6px_0px_#000] hover:translate-x-1 hover:translate-y-1 hover:shadow-[2px_2px_0px_#000] transition-all"
              >
                Install GitHub Guard <ArrowRight size={20} />
              </Link>
              <button
                onClick={() => handleTabChange('sandbox')}
                className="inline-flex items-center gap-2 bg-white text-soy-bottle px-8 py-4 text-lg font-black uppercase italic tracking-tight border-4 border-soy-bottle shadow-[6px_6px_0px_#302C26] hover:translate-x-1 hover:translate-y-1 hover:shadow-[2px_2px_0px_#302C26] transition-all"
              >
                Try Sandbox Guard <ArrowRight size={20} />
              </button>
            </div>
          </section>

          {/* HOW IT WORKS */}
          <section>
            <h2 className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter mb-12 text-center">How it works</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {STEPS.map((step, i) => {
                const Icon = step.icon;
                return (
                  <div key={step.title} className="bg-white border-4 border-soy-bottle p-6 shadow-[6px_6px_0px_#302C26] relative">
                    <div className="absolute -top-4 -left-4 w-10 h-10 bg-soy-red text-white font-black italic flex items-center justify-center border-4 border-black text-lg">
                      {i + 1}
                    </div>
                    <Icon size={28} className="text-soy-red mb-4" />
                    <h3 className="text-lg font-black uppercase italic tracking-tight mb-2 text-soy-bottle">{step.title}</h3>
                    <p className="text-xs font-bold uppercase tracking-widest opacity-60 italic leading-relaxed">{step.body}</p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* PR COMMENT PREVIEW */}
          <section>
            <div className="text-center mb-10">
              <span className="inline-block bg-soy-red text-white text-[10px] font-black px-3 py-1 uppercase tracking-widest italic mb-3">Live example</span>
              <h2 className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter text-soy-bottle">What your team sees on a PR</h2>
              <p className="mt-3 text-sm font-bold uppercase tracking-widest opacity-60 italic">One readable comment. No dashboard hunting.</p>
            </div>
            <GuardPrCommentPreview />
          </section>

          {/* POLICY FILE */}
          <section>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
              <div>
                <FileCode size={32} className="text-soy-red mb-4" />
                <h2 className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter mb-4 text-soy-bottle">
                  Your policy. <br /><span className="text-soy-red">Your repo.</span>
                </h2>
                <p className="text-sm font-bold uppercase tracking-widest opacity-60 italic leading-relaxed mb-4">
                  Drop a <code className="bg-soy-label px-1.5 py-0.5 not-italic">.opensoyce.yml</code> at the root of any repo to control what Guard blocks, warns on, or allows. Exceptions need a reason and expire automatically.
                </p>
                <ul className="space-y-2 text-xs font-bold uppercase tracking-widest text-soy-bottle">
                  <li className="flex items-start gap-2"><Check size={14} className="text-soy-red mt-0.5 shrink-0" /> Block graveyard + risky by default</li>
                  <li className="flex items-start gap-2"><Check size={14} className="text-soy-red mt-0.5 shrink-0" /> Exceptions require justification</li>
                  <li className="flex items-start gap-2"><Check size={14} className="text-soy-red mt-0.5 shrink-0" /> Signed reports, SARIF export</li>
                </ul>
              </div>
              <div className="bg-black border-4 border-soy-red shadow-[8px_8px_0px_#000] overflow-hidden">
                <div className="flex items-center justify-between bg-soy-red px-4 py-2 border-b-4 border-black">
                  <span className="text-[10px] font-black uppercase tracking-widest text-white italic">.opensoyce.yml</span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/80">YAML</span>
                </div>
                <pre className="p-6 text-xs md:text-sm font-mono text-emerald-300 overflow-x-auto leading-relaxed">
                  <code>{POLICY_YAML}</code>
                </pre>
              </div>
            </div>
          </section>

          {/* WHAT GUARD CHECKS */}
          <section>
            <h2 className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter mb-12 text-center">What OpenSoyce checks</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {CHECKS.map((check) => {
                const Icon = check.icon;
                return (
                  <div key={check.label} className="bg-white border-2 border-soy-bottle p-5 hover:shadow-[6px_6px_0px_#E63322] hover:-translate-x-1 hover:-translate-y-1 transition-all">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-soy-label border-2 border-soy-bottle flex items-center justify-center shrink-0">
                        <Icon size={18} className="text-soy-red" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black uppercase italic tracking-tight text-soy-bottle mb-1">{check.label}</h3>
                        <p className="text-[11px] font-bold uppercase tracking-widest opacity-60 italic leading-relaxed">{check.body}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* FREE VS TEAM */}
          <section>
            <h2 className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter mb-3 text-center">Free vs Team</h2>
            <p className="text-sm font-bold uppercase tracking-widest opacity-60 italic text-center mb-12">Start free. Upgrade when policy enforcement matters.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* FREE */}
              <div className="bg-white border-4 border-soy-bottle p-8 shadow-[302C26]">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-2xl font-black uppercase italic tracking-tight text-soy-bottle">FREE</h3>
                  <span className="text-[10px] font-black uppercase tracking-widest bg-soy-label px-2 py-1 italic">Public repos</span>
                </div>
                <p className="text-xs font-bold uppercase tracking-widest opacity-60 italic mb-6">For open source maintainers and curious devs.</p>
                <ul className="space-y-3 mb-8">
                  {FREE_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs font-black uppercase tracking-widest text-soy-bottle">
                      <Check size={16} className="text-soy-red mt-0.5 shrink-0" /> {f}
                    </li>
                  ))}
                  <li className="flex items-start gap-2 text-xs font-black uppercase tracking-widest opacity-30">
                    <X size={16} className="mt-0.5 shrink-0" /> Private repos
                  </li>
                  <li className="flex items-start gap-2 text-xs font-black uppercase tracking-widest opacity-30">
                    <X size={16} className="mt-0.5 shrink-0" /> Policy enforcement
                  </li>
                </ul>
                <Link to="/scanner" className="block w-full text-center bg-soy-bottle text-white py-4 text-sm font-black uppercase italic tracking-widest border-4 border-soy-bottle hover:bg-soy-red transition-colors">
                  Try a Free Scan
                </Link>
              </div>

              {/* TEAM */}
              <div className="bg-white border-4 border-soy-red p-8 shadow-[8px_8px_0px_#E63322] relative">
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-soy-red text-white px-4 py-1 text-xs font-black uppercase tracking-widest italic border-2 border-black">
                  Recommended
                </div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-2xl font-black uppercase italic tracking-tight text-soy-bottle flex items-center gap-2">
                    <Lock size={20} className="text-soy-red" /> TEAM
                  </h3>
                  <span className="text-[10px] font-black uppercase tracking-widest bg-soy-red text-white px-2 py-1 italic">Private + policy</span>
                </div>
                <p className="text-xs font-bold uppercase tracking-widest opacity-60 italic mb-6">For teams that ship to production.</p>
                <ul className="space-y-3 mb-8">
                  {TEAM_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs font-black uppercase tracking-widest text-soy-bottle">
                      <Check size={16} className="text-soy-red mt-0.5 shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
                <Link to="/pricing" className="block w-full text-center bg-soy-red text-white py-4 text-sm font-black uppercase italic tracking-widest border-4 border-black shadow-[4px_4px_0px_#000] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[2px_2px_0px_#000] transition-all">
                  See Team Pricing <ArrowRight size={14} className="inline ml-1" />
                </Link>
              </div>
            </div>
          </section>

          {/* FINAL CTA */}
          <section className="bg-soy-bottle text-white border-4 border-black shadow-[12px_12px_0px_#E63322] p-12 md:p-16 text-center animate-fade-in">
            <AlertTriangle size={40} className="text-soy-red mx-auto mb-6" />
            <h2 className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter mb-4">
              One install. <span className="text-soy-red">Every PR protected.</span>
            </h2>
            <p className="max-w-2xl mx-auto text-sm md:text-base font-bold uppercase tracking-widest opacity-70 italic mb-10 leading-relaxed">
              Add OpenSoyce Guard to GitHub in under a minute. It comments on the next risky pull request that lands.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/guard/install"
                className="inline-flex items-center gap-2 bg-soy-red text-white px-8 py-4 text-lg font-black uppercase italic tracking-tight border-4 border-black shadow-[6px_6px_0px_#000] hover:translate-x-1 hover:translate-y-1 hover:shadow-[2px_2px_0px_#000] transition-all"
              >
                Install GitHub Guard <ArrowRight size={20} />
              </Link>
              <button
                onClick={() => handleTabChange('sandbox')}
                className="inline-flex items-center gap-2 bg-white text-soy-bottle px-8 py-4 text-lg font-black uppercase italic tracking-tight border-4 border-soy-bottle shadow-[6px_6px_0px_#302C26] hover:translate-x-1 hover:translate-y-1 hover:shadow-[2px_2px_0px_#302C26] transition-all"
              >
                Try Sandbox Guard <ArrowRight size={20} />
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
