import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from 'react-router-dom';
import { 
  ArrowLeft, CheckCircle2, XCircle, AlertCircle, 
  Inbox, Clock, User, GitBranch, MessageSquare, 
  Filter, ShieldAlert, Check, AlertTriangle, RefreshCw
} from 'lucide-react';

type AppealRow = {
  id: string;
  package_name: string;
  ecosystem: string;
  source_owner: string;
  source_repo: string;
  submitted_by: string;
  submitted_by_role: 'admin' | 'write';
  rationale: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
};

type Phase = 'loading' | 'unauth' | 'forbidden' | 'auth';

const OAUTH_STATE_KEY = 'dashboard_oauth_state';

export default function AppealsReview() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [login, setLogin] = useState<string | null>(null);
  const [isReviewer, setIsReviewer] = useState(false);
  const [appeals, setAppeals] = useState<AppealRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Review action state
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [notesInput, setNotesInput] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<Record<string, string>>({});

  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');

  const [isSandbox, setIsSandbox] = useState<boolean>(() => {
    return localStorage.getItem('soyce_dashboard_sandbox') === 'true';
  });

  // OAuth client_id is fetched from /api/config (backed by the
  // GITHUB_OAUTH_CLIENT_ID env var), NOT hardcoded. Mirrors Dashboard.tsx.
  // null = not yet fetched, '' = fetched but missing/unconfigured.
  const [oauthClientId, setOauthClientId] = useState<string | null>(null);

  const initSandboxMockData = (forceReset = false) => {
    const defaultAppeals: AppealRow[] = [
      {
        id: 'mock-appeal-1',
        package_name: 'moment',
        ecosystem: 'npm',
        source_owner: 'moment',
        source_repo: 'moment',
        submitted_by: 'maintainer-bob',
        submitted_by_role: 'admin',
        rationale: 'Vulnerability CVE-2022-24999 is only present in older Node.js environments. Our server runs on Node 20 with safe defaults, making the exposure surface non-existent.',
        status: 'pending',
        reviewed_by: null,
        reviewed_at: null,
        review_notes: null,
        created_at: new Date(Date.now() - 1 * 86400 * 1000).toISOString(),
      },
      {
        id: 'mock-appeal-2',
        package_name: 'agpl-pkg',
        ecosystem: 'npm',
        source_owner: 'example-org',
        source_repo: 'agpl-pkg',
        submitted_by: 'alice-dev',
        submitted_by_role: 'write',
        rationale: 'We are requesting re-evaluation of agpl-pkg since we only run it in a sandboxed CLI environment, not as a library linked into public products. No copyleft bleed risk.',
        status: 'pending',
        reviewed_by: null,
        reviewed_at: null,
        review_notes: null,
        created_at: new Date(Date.now() - 2 * 86400 * 1000).toISOString(),
      },
      {
        id: 'mock-appeal-3',
        package_name: 'react',
        ecosystem: 'npm',
        source_owner: 'facebook',
        source_repo: 'react',
        submitted_by: 'dan-abramov',
        submitted_by_role: 'admin',
        rationale: 'Core React ecosystem package re-evaluation after repository structure audit.',
        status: 'approved',
        reviewed_by: 'freewho99',
        reviewed_at: new Date(Date.now() - 5 * 86400 * 1000).toISOString(),
        review_notes: 'Legitimate package configuration and maintainer identity verified manually.',
        created_at: new Date(Date.now() - 6 * 86400 * 1000).toISOString(),
      },
      {
        id: 'mock-appeal-4',
        package_name: 'malicious-pkg',
        ecosystem: 'npm',
        source_owner: 'attacker',
        source_repo: 'malicious-pkg',
        submitted_by: 'dodgy-user',
        submitted_by_role: 'write',
        rationale: 'This was just a research project. Please unblock so others can test it.',
        status: 'rejected',
        reviewed_by: 'freewho99',
        reviewed_at: new Date(Date.now() - 4 * 86400 * 1000).toISOString(),
        review_notes: 'Contains verified install-time exfiltration script. Will remain in Graveyard.',
        created_at: new Date(Date.now() - 4 * 86400 * 1000 - 2 * 3600 * 1000).toISOString(),
      }
    ];

    const existing = localStorage.getItem('soyce_sb_appeals');
    if (existing && !forceReset) {
      return JSON.parse(existing);
    }
    localStorage.setItem('soyce_sb_appeals', JSON.stringify(defaultAppeals));
    return defaultAppeals;
  };

  // Memoize on [isSandbox] — without this, apiFetch is rebuilt every
  // render and any consumer callback whose own dep array doesn't change
  // at the moment sandbox activates ends up holding a stale closure
  // that still routes to the real backend. Same shape and rationale as
  // the fix landed for IncidentCandidatesReview in PR #37.
  const apiFetch = useCallback(async (url: string, init?: RequestInit): Promise<Response> => {
    if (!isSandbox) {
      return window.fetch(url, init);
    }

    const parsedUrl = new URL(url, window.location.origin);
    const action = parsedUrl.searchParams.get('action');
    const method = init?.method?.toUpperCase() || 'GET';

    const jsonResponse = (data: any, status = 200) => {
      return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' }
      });
    };

    const store = initSandboxMockData();

    if (action === 'whoami') {
      return jsonResponse({ login: 'freewho99', orgs: [], isReviewer: true });
    }
    if (action === 'appeals-list') {
      return jsonResponse({ appeals: store });
    }
    if (action === 'appeal-review') {
      const body = JSON.parse(init?.body as string);
      let updatedAppeal: AppealRow | null = null;
      const updatedStore = store.map((a: AppealRow) => {
        if (a.id === body.id) {
          updatedAppeal = {
            ...a,
            status: body.status,
            reviewed_by: 'freewho99',
            reviewed_at: new Date().toISOString(),
            review_notes: body.review_notes || null
          };
          return updatedAppeal;
        }
        return a;
      });
      localStorage.setItem('soyce_sb_appeals', JSON.stringify(updatedStore));
      return jsonResponse({ ok: true, appeal: updatedAppeal });
    }

    return window.fetch(url, init);
  }, [isSandbox]);

  // Bootstrap Auth
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isSandbox) {
        setLogin('freewho99');
        setIsReviewer(true);
        setPhase('auth');
        return;
      }

      try {
        const resp = await window.fetch('/api/exceptions?action=whoami', { credentials: 'same-origin' });
        if (cancelled) return;
        if (resp.ok) {
          const body = await resp.json();
          setLogin(body.login || null);
          const reviewer = Boolean(body.isReviewer);
          setIsReviewer(reviewer);
          if (reviewer) {
            setPhase('auth');
          } else {
            setPhase('forbidden');
          }
        } else {
          setPhase('unauth');
        }
      } catch {
        if (cancelled) return;
        setPhase('unauth');
      }
    })();
    return () => { cancelled = true; };
  }, [isSandbox]);

  // Fetch OAuth client_id once when the page lands in unauth phase.
  // Mirrors Dashboard.tsx:555-577. /api/config returns
  // { githubOauthClientId } from the GITHUB_OAUTH_CLIENT_ID env var.
  // Sets empty string on missing/error so handleSignIn can surface
  // the "missing client ID" message instead of redirecting to a 404
  // GitHub URL with a stale hardcoded value.
  useEffect(() => {
    if (oauthClientId !== null) return;
    if (phase !== 'unauth') return;
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch('/api/config');
        if (!resp.ok) {
          if (!cancelled) setOauthClientId('');
          return;
        }
        const body = await resp.json();
        if (cancelled) return;
        setOauthClientId(typeof body.githubOauthClientId === 'string' ? body.githubOauthClientId : '');
      } catch {
        if (!cancelled) setOauthClientId('');
      }
    })();
    return () => { cancelled = true; };
  }, [phase, oauthClientId]);

  // Fetch Appeals
  const fetchAppeals = useCallback(async () => {
    if (phase !== 'auth') return;
    setLoading(true);
    setError(null);
    try {
      const resp = await apiFetch('/api/exceptions?action=appeals-list', { credentials: 'same-origin' });
      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        setError((body && body.message) || `Failed to load appeals (${resp.status}).`);
      } else {
        const body = await resp.json();
        setAppeals(Array.isArray(body.appeals) ? body.appeals : []);
      }
    } catch {
      setError('Network error loading appeals.');
    } finally {
      setLoading(false);
    }
  }, [phase, apiFetch]);

  useEffect(() => {
    fetchAppeals();
  }, [fetchAppeals]);

  // Review Submissions
  const handleReview = useCallback(async (id: string, status: 'approved' | 'rejected') => {
    setActionError(prev => ({ ...prev, [id]: '' }));
    setReviewingId(id);
    const notes = notesInput[id] || '';
    
    try {
      const resp = await apiFetch('/api/exceptions?action=appeal-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          id,
          status,
          review_notes: notes.trim(),
        }),
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        setActionError(prev => ({ ...prev, [id]: (body && body.message) || `Review failed (${resp.status})` }));
      } else {
        setNotesInput(prev => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        await fetchAppeals();
      }
    } catch {
      setActionError(prev => ({ ...prev, [id]: 'Network error submitting review.' }));
    } finally {
      setReviewingId(null);
    }
  }, [notesInput, fetchAppeals, apiFetch]);

  // Stats computation
  const stats = useMemo(() => {
    return {
      total: appeals.length,
      pending: appeals.filter(a => a.status === 'pending').length,
      approved: appeals.filter(a => a.status === 'approved').length,
      rejected: appeals.filter(a => a.status === 'rejected').length,
    };
  }, [appeals]);

  // Filtered List
  const filteredAppeals = useMemo(() => {
    if (filter === 'all') return appeals;
    return appeals.filter(a => a.status === filter);
  }, [appeals, filter]);

  const handleSignIn = useCallback(() => {
    if (!oauthClientId) {
      setError('OpenSoyce is missing its GitHub OAuth client ID. Contact support@opensoyce.com.');
      return;
    }
    const state = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem(OAUTH_STATE_KEY, state);
    const redirectUri = `${window.location.origin}/dashboard`;

    // We redirect to dashboard page which has OAuth code handling logic
    const params = new URLSearchParams({
      client_id: oauthClientId,
      redirect_uri: redirectUri,
      scope: 'read:user read:org',
      state,
      allow_signup: 'false',
    });
    window.location.href = `https://github.com/login/oauth/authorize?${params.toString()}`;
  }, [oauthClientId]);

  const handleExitSandbox = () => {
    localStorage.removeItem('soyce_dashboard_sandbox');
    localStorage.removeItem('soyce_sb_appeals');
    setIsSandbox(false);
    setPhase('loading');
    window.location.reload();
  };

  // ----------------------------------------------------------- Render Phases

  if (phase === 'loading') {
    return (
      <div className="bg-[#F5F0E8] min-h-screen flex items-center justify-center font-mono">
        <div className="text-center">
          <RefreshCw className="mx-auto mb-4 animate-spin text-soy-red" size={32} />
          <p className="text-xs font-black uppercase tracking-widest opacity-60">Initializing Authorization Status…</p>
        </div>
      </div>
    );
  }

  if (phase === 'unauth') {
    return (
      <div className="bg-[#F5F0E8] min-h-screen py-20 px-4 font-mono">
        <div className="max-w-md mx-auto bg-white border-4 border-black p-8 shadow-[8px_8px_0px_#000] text-center">
          <ShieldAlert size={48} className="text-soy-red mx-auto mb-6 shrink-0" />
          <h2 className="text-3xl font-black uppercase italic tracking-tighter mb-4">ACCESS GATED</h2>
          <p className="text-xs font-bold uppercase tracking-widest opacity-60 mb-8 leading-relaxed">
            THE APPEALS REVIEW INTERFACE IS RESTRICTED TO DESIGNATED OPENSOYCE SECURITY ADMINISTRATORS. PLEASE SIGN IN.
          </p>

          {oauthClientId === '' ? (
            <div className="bg-soy-red text-white border-4 border-black p-4 shadow-[4px_4px_0px_#000] text-left mb-2">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={16} className="shrink-0" />
                <span className="font-black uppercase tracking-widest text-[11px]">OAUTH NOT CONFIGURED</span>
              </div>
              <p className="text-[9px] font-bold uppercase tracking-wider leading-normal">
                This instance of OpenSoyce is missing its GitHub OAuth client ID. Set <code className="bg-black/20 px-1">GITHUB_OAUTH_CLIENT_ID</code> in your Vercel environment, then redeploy. Sandbox mode below is available without auth.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleSignIn}
              disabled={oauthClientId === null}
              className="w-full bg-black text-white py-4 text-xs font-black uppercase tracking-widest hover:bg-soy-red transition-all border-2 border-black flex items-center justify-center gap-2 shadow-[4px_4px_0px_#E63322] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {oauthClientId === null ? 'LOADING…' : 'SIGN IN WITH GITHUB →'}
            </button>
          )}

          <div className="mt-8 pt-6 border-t-2 border-black/10">
            <button
              type="button"
              onClick={() => {
                localStorage.setItem('soyce_dashboard_sandbox', 'true');
                setIsSandbox(true);
                setLogin('freewho99');
                setIsReviewer(true);
                setPhase('auth');
              }}
              className="text-[10px] font-black uppercase tracking-widest text-soy-red hover:underline"
            >
              Or Activate Local Sandbox Mode
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'forbidden') {
    return (
      <div className="bg-[#F5F0E8] min-h-screen py-20 px-4 font-mono">
        <div className="max-w-md mx-auto bg-white border-4 border-black p-8 shadow-[8px_8px_0px_#000] text-center">
          <XCircle size={48} className="text-soy-red mx-auto mb-6 shrink-0" />
          <h2 className="text-3xl font-black uppercase italic tracking-tighter mb-4">UNAUTHORIZED</h2>
          <p className="text-xs font-bold uppercase tracking-widest opacity-60 mb-8 leading-relaxed">
            YOUR ACCOUNT <span className="text-soy-red">@{login}</span> IS NOT IN THE DESIGNATED OPENSOYCE REVIEWER LIST.
          </p>
          <div className="space-y-4">
            <Link
              to="/dashboard"
              className="w-full bg-white text-black py-4 text-xs font-black uppercase tracking-widest hover:bg-black hover:text-white transition-all border-2 border-black flex items-center justify-center gap-2 shadow-[4px_4px_0px_#000]"
            >
              <ArrowLeft size={14} /> BACK TO DASHBOARD
            </Link>
            <button
              type="button"
              onClick={() => {
                localStorage.setItem('soyce_dashboard_sandbox', 'true');
                setIsSandbox(true);
                setLogin('freewho99');
                setIsReviewer(true);
                setPhase('auth');
              }}
              className="w-full text-center text-[10px] font-black uppercase tracking-widest text-soy-red hover:underline block pt-2"
            >
              Activate Local Sandbox Mode
            </button>
          </div>
        </div>
      </div>
    );
  }

  // phase === 'auth'
  return (
    <div className="bg-[#F5F0E8] min-h-screen font-mono text-soy-bottle">
      {/* Sandbox Header Banner */}
      {isSandbox && (
        <div className="bg-emerald-50 border-b-4 border-emerald-600 p-4 shadow-[0px_4px_0px_#10B981] text-left">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h4 className="font-black text-xs uppercase text-emerald-800 tracking-tight">
                ⚙️ LOCAL SANDBOX PLAYGROUND ACTIVE
              </h4>
              <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-700 mt-1 leading-relaxed">
                Appeals and transition actions are simulated locally. Exit sandbox mode to restore live database connection.
              </p>
            </div>
            <button
              type="button"
              onClick={handleExitSandbox}
              className="bg-soy-bottle text-soy-label border-2 border-black text-[9px] font-black uppercase tracking-widest px-3 py-1.5 shadow-[2px_2px_0px_#000] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0px_#000] transition-all cursor-pointer flex-shrink-0"
            >
              Reset & Exit Sandbox
            </button>
          </div>
        </div>
      )}

      {/* HERO SECTION */}
      <section className="bg-black py-12 px-4 border-b-4 border-black text-white">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
              <div className="bg-soy-red text-white px-3 py-0.5 text-[10px] font-black uppercase tracking-[0.3em] mb-4 inline-block">
                INTERNAL — SECURITY WORKSPACE
              </div>
              <h1 className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter text-white">
                APPEALS REVIEW PANEL
              </h1>
              <p className="text-white/60 text-xs font-bold uppercase tracking-widest mt-2">
                Evaluate maintainer appeals and resolve score override requests.
              </p>
            </div>
            <Link 
              to="/dashboard" 
              className="text-white text-xs font-black uppercase tracking-widest flex items-center gap-2 hover:text-soy-red transition-colors border-2 border-white/20 px-4 py-2 hover:border-soy-red bg-white/5"
            >
              <ArrowLeft size={16} /> BACK TO DASHBOARD
            </Link>
          </div>
        </div>
      </section>

      {/* STATS METRIC PANEL */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white border-4 border-black p-4 shadow-[4px_4px_0px_#000]">
            <div className="text-[8px] font-black uppercase tracking-widest opacity-40 mb-1">TOTAL APPEALS</div>
            <div className="text-3xl font-black italic">{stats.total}</div>
          </div>
          <div className="bg-white border-4 border-black p-4 shadow-[4px_4px_0px_#E63322] border-l-soy-red">
            <div className="text-[8px] font-black uppercase tracking-widest text-soy-red mb-1">PENDING REVIEW</div>
            <div className="text-3xl font-black italic text-soy-red">{stats.pending}</div>
          </div>
          <div className="bg-white border-4 border-black p-4 shadow-[4px_4px_0px_#22C55E] border-l-emerald-500">
            <div className="text-[8px] font-black uppercase tracking-widest text-emerald-600 mb-1">APPROVED</div>
            <div className="text-3xl font-black italic text-emerald-600">{stats.approved}</div>
          </div>
          <div className="bg-white border-4 border-black p-4 shadow-[4px_4px_0px_#302C26] border-l-black">
            <div className="text-[8px] font-black uppercase tracking-widest opacity-40 mb-1">REJECTED</div>
            <div className="text-3xl font-black italic">{stats.rejected}</div>
          </div>
        </div>

        {/* FILTER SELECTOR BAR */}
        <div className="flex flex-wrap gap-2 mb-8 border-b-4 border-black pb-4">
          <button
            onClick={() => setFilter('pending')}
            className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest border-2 transition-all ${
              filter === 'pending'
                ? 'bg-soy-red text-white border-black shadow-[2px_2px_0px_#000]'
                : 'bg-white text-black border-black hover:bg-black hover:text-white'
            }`}
          >
            PENDING ({stats.pending})
          </button>
          <button
            onClick={() => setFilter('approved')}
            className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest border-2 transition-all ${
              filter === 'approved'
                ? 'bg-emerald-500 text-white border-black shadow-[2px_2px_0px_#000]'
                : 'bg-white text-black border-black hover:bg-black hover:text-white'
            }`}
          >
            APPROVED ({stats.approved})
          </button>
          <button
            onClick={() => setFilter('rejected')}
            className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest border-2 transition-all ${
              filter === 'rejected'
                ? 'bg-black text-white border-black shadow-[2px_2px_0px_#E63322]'
                : 'bg-white text-black border-black hover:bg-black hover:text-white'
            }`}
          >
            REJECTED ({stats.rejected})
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest border-2 transition-all ${
              filter === 'all'
                ? 'bg-soy-bottle text-soy-label border-black shadow-[2px_2px_0px_#000]'
                : 'bg-white text-black border-black hover:bg-black hover:text-white'
            }`}
          >
            ALL APPEALS ({stats.total})
          </button>
        </div>

        {/* ERROR MESSAGE */}
        {error && (
          <div className="bg-soy-red text-white border-4 border-black p-4 mb-6 shadow-[4px_4px_0px_#000] flex items-start gap-2">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-black uppercase">FETCH ERROR</div>
              <p className="text-[10px] font-bold uppercase mt-1 opacity-95">{error}</p>
            </div>
          </div>
        )}

        {/* LIST */}
        {loading ? (
          <div className="py-24 text-center">
            <RefreshCw className="mx-auto animate-spin text-soy-bottle mb-4" size={24} />
            <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Syncing with registry…</p>
          </div>
        ) : filteredAppeals.length === 0 ? (
          <div className="py-20 text-center bg-white border-4 border-black shadow-[6px_6px_0px_#000] text-soy-bottle">
            <Inbox className="mx-auto opacity-35 mb-4" size={48} />
            <h4 className="text-xl font-black uppercase italic tracking-tighter">No appeals found in this view</h4>
            <p className="text-[9px] font-bold uppercase tracking-widest opacity-50 mt-1">Review queue is clean.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <AnimatePresence mode="popLayout">
              {filteredAppeals.map(appeal => {
                const notes = notesInput[appeal.id] || '';
                const actErr = actionError[appeal.id] || '';
                
                return (
                  <motion.div
                    layout
                    key={appeal.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white border-4 border-black p-6 shadow-[6px_6px_0px_#000] relative"
                  >
                    {/* Header bar of appeal */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 pb-4 border-b-2 border-black/10">
                      <div>
                        <div className="flex items-center flex-wrap gap-2">
                          <span className="text-lg font-black uppercase italic tracking-tight">{appeal.package_name}</span>
                          <span className="border-2 border-black bg-soy-label text-soy-bottle px-1.5 py-0.5 text-[8px] font-black uppercase">{appeal.ecosystem}</span>
                          {appeal.status === 'pending' && <span className="bg-soy-red text-white px-1.5 py-0.5 text-[8px] font-black uppercase border border-black">PENDING</span>}
                          {appeal.status === 'approved' && <span className="bg-emerald-500 text-white px-1.5 py-0.5 text-[8px] font-black uppercase border border-black">APPROVED</span>}
                          {appeal.status === 'rejected' && <span className="bg-black text-white px-1.5 py-0.5 text-[8px] font-black uppercase border border-black">REJECTED</span>}
                        </div>
                        <div className="text-[9px] font-bold uppercase tracking-wider opacity-60 mt-1 flex items-center gap-1.5">
                          <GitBranch size={10} /> 
                          Source Repo: 
                          <a 
                            href={`https://github.com/${appeal.source_owner}/${appeal.source_repo}`} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="underline font-black hover:text-soy-red"
                          >
                            {appeal.source_owner}/{appeal.source_repo}
                          </a>
                        </div>
                      </div>
                      <div className="text-[9px] font-bold uppercase tracking-widest opacity-50 flex items-center gap-1">
                        <Clock size={12} /> {new Date(appeal.created_at).toLocaleString()}
                      </div>
                    </div>

                    {/* Submitter Box */}
                    <div className="mb-6 flex items-center gap-2">
                      <User size={14} className="opacity-50 shrink-0" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">
                        Submitted by: 
                        <a 
                          href={`https://github.com/${appeal.submitted_by}`} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="font-black underline mx-1 hover:text-soy-red"
                        >
                          @{appeal.submitted_by}
                        </a>
                      </span>
                      <span className={`border px-1 text-[8px] font-black uppercase tracking-widest rounded ${
                        appeal.submitted_by_role === 'admin' 
                          ? 'bg-amber-100 border-amber-300 text-amber-800' 
                          : 'bg-blue-100 border-blue-300 text-blue-800'
                      }`}>
                        Verified {appeal.submitted_by_role}
                      </span>
                    </div>

                    {/* Rationale Body */}
                    <div className="mb-6">
                      <div className="text-[9px] font-black uppercase tracking-widest opacity-40 mb-1.5 flex items-center gap-1">
                        <MessageSquare size={10} /> Maintainer Rationale
                      </div>
                      <blockquote className="bg-soy-label/20 border-l-4 border-black p-4 text-xs font-bold leading-normal italic text-soy-bottle/90 break-words whitespace-pre-wrap">
                        {appeal.rationale || "(No rationale provided)"}
                      </blockquote>
                    </div>

                    {/* Action container */}
                    {appeal.status === 'pending' ? (
                      <div className="pt-6 border-t-2 border-black/10 space-y-4">
                        <div>
                          <label className="block text-[9px] font-black uppercase tracking-widest opacity-60 mb-1">
                            Reviewer Notes (Optional)
                          </label>
                          <textarea
                            value={notes}
                            onChange={e => setNotesInput(prev => ({ ...prev, [appeal.id]: e.target.value }))}
                            placeholder="Add evaluation logs, override reasons, or rejection rationale…"
                            className="w-full border-2 border-black bg-soy-label/10 px-3 py-2 text-xs font-mono focus:outline-none focus:bg-white min-h-[70px]"
                            maxLength={2000}
                          />
                        </div>

                        {actErr && (
                          <div className="bg-soy-red text-white border-2 border-black p-3 text-[9px] font-black uppercase tracking-widest flex items-center gap-2">
                            <AlertTriangle size={12} className="shrink-0" /> {actErr}
                          </div>
                        )}

                        <div className="flex flex-wrap gap-3">
                          <button
                            type="button"
                            disabled={reviewingId !== null}
                            onClick={() => handleReview(appeal.id, 'approved')}
                            className="bg-emerald-500 text-white px-5 py-2.5 text-[10px] font-black uppercase tracking-widest border-2 border-black shadow-[2px_2px_0px_#000] hover:bg-emerald-600 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                          >
                            <CheckCircle2 size={12} /> Approve Appeal
                          </button>
                          <button
                            type="button"
                            disabled={reviewingId !== null}
                            onClick={() => handleReview(appeal.id, 'rejected')}
                            className="bg-soy-red text-white px-5 py-2.5 text-[10px] font-black uppercase tracking-widest border-2 border-black shadow-[2px_2px_0px_#000] hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                          >
                            <XCircle size={12} /> Reject Appeal
                          </button>
                        </div>
                      </div>
                    ) : (
                      // Review details (approved or rejected logs)
                      <div className={`pt-6 border-t-2 border-black/10 mt-6 ${
                        appeal.status === 'approved' 
                          ? 'border-t-emerald-500/20 bg-emerald-50/10' 
                          : 'border-t-black/20 bg-black/5'
                      } p-4 border border-black/5`}>
                        <div className="flex items-center gap-2 mb-2">
                          {appeal.status === 'approved' ? (
                            <CheckCircle2 className="text-emerald-500 shrink-0" size={16} />
                          ) : (
                            <XCircle className="text-black shrink-0" size={16} />
                          )}
                          <span className="text-[10px] font-black uppercase tracking-wider">
                            {appeal.status === 'approved' ? 'APPROVED' : 'REJECTED'} BY @{appeal.reviewed_by}
                          </span>
                          <span className="text-[9px] font-bold uppercase tracking-widest opacity-50 ml-auto">
                            Reviewed: {appeal.reviewed_at ? new Date(appeal.reviewed_at).toLocaleDateString() : '—'}
                          </span>
                        </div>
                        {appeal.review_notes ? (
                          <p className="text-xs font-bold leading-normal mt-2 pl-6 opacity-85">
                            Notes: "{appeal.review_notes}"
                          </p>
                        ) : (
                          <p className="text-xs font-bold italic leading-normal mt-2 pl-6 opacity-40">
                            (No review notes recorded)
                          </p>
                        )}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      <footer className="py-12 border-t-2 border-black/10 text-center text-[10px] font-black uppercase tracking-[0.5em] opacity-40 mt-16">
        © 2026 OPENSOYCE LABS. ALL SAUCE RESERVED.
      </footer>
    </div>
  );
}
