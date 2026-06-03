import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle2, XCircle, Inbox, Clock, User,
  AlertTriangle, RefreshCw, ShieldAlert, ExternalLink, Package,
  Hash, Tag, Newspaper, Sparkles, AlertOctagon,
} from 'lucide-react';
import { PromoteIncidentForm, type PromoteIncidentPayload } from '../components/PromoteIncidentForm';

// Mirrors public.incident_candidates (migration 0004). Keep in sync with
// api/exceptions.js handleCandidatesList SELECT list.
type CandidateRow = {
  id: string;
  source: 'hn-heuristic' | 'github-advisory' | 'osv-delta' | 'manual';
  source_id: string;
  source_url: string | null;
  title: string;
  author: string | null;
  published_at: string | null;
  parsed_package: string | null;
  parsed_version: string | null;
  parsed_ecosystem: 'npm' | 'PyPI' | null;
  parsed_threat_type:
    | 'typosquat'
    | 'dependency_confusion'
    | 'obfuscated_payload'
    | 'malicious_script'
    | 'suspicious_network'
    | null;
  parser_confidence: 'low' | 'medium' | 'high';
  status: 'pending' | 'promoted' | 'rejected' | 'duplicate';
  promoted_to_incident_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
};

type Phase = 'loading' | 'unauth' | 'forbidden' | 'auth';
type Filter = 'pending' | 'rejected' | 'promoted' | 'all';

const OAUTH_STATE_KEY = 'dashboard_oauth_state';
const SANDBOX_STORAGE_KEY = 'soyce_sb_incident_candidates';

const CONFIDENCE_STYLE: Record<CandidateRow['parser_confidence'], string> = {
  low: 'bg-amber-100 border-amber-400 text-amber-900',
  medium: 'bg-blue-100 border-blue-400 text-blue-900',
  high: 'bg-emerald-100 border-emerald-400 text-emerald-900',
};

const CONFIDENCE_LABEL: Record<CandidateRow['parser_confidence'], string> = {
  low: 'LOW CONFIDENCE — VERIFY MANUALLY',
  medium: 'MEDIUM CONFIDENCE',
  high: 'HIGH CONFIDENCE',
};

const THREAT_TYPE_LABEL: Record<NonNullable<CandidateRow['parsed_threat_type']>, string> = {
  typosquat: 'TYPOSQUAT',
  dependency_confusion: 'DEPENDENCY CONFUSION',
  obfuscated_payload: 'OBFUSCATED PAYLOAD',
  malicious_script: 'MALICIOUS SCRIPT',
  suspicious_network: 'SUSPICIOUS NETWORK',
};

export default function IncidentCandidatesReview() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [login, setLogin] = useState<string | null>(null);
  const [, setIsReviewer] = useState(false);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [notesInput, setNotesInput] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<Record<string, string>>({});
  // Which candidate's promote form is open (one at a time). null = none.
  const [promotingId, setPromotingId] = useState<string | null>(null);

  const [filter, setFilter] = useState<Filter>('pending');

  const [isSandbox, setIsSandbox] = useState<boolean>(() =>
    localStorage.getItem('soyce_dashboard_sandbox') === 'true',
  );

  // OAuth client_id is fetched from /api/config (backed by the
  // GITHUB_OAUTH_CLIENT_ID env var), NOT hardcoded. Mirrors Dashboard.tsx.
  // null = not yet fetched, '' = fetched but missing/unconfigured.
  const [oauthClientId, setOauthClientId] = useState<string | null>(null);

  const initSandboxMockData = (forceReset = false): CandidateRow[] => {
    const defaults: CandidateRow[] = [
      {
        id: 'mock-cand-1',
        source: 'hn-heuristic',
        source_id: '48369265',
        source_url: 'https://access.redhat.com/security/vulnerabilities/RHSB-2026-006',
        title: 'RHSB-2026-006 Supply chain compromise of RedHat-cloud-services NPM packages',
        author: 'dralley',
        published_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
        parsed_package: 'redhat-cloud-services',
        parsed_version: null,
        parsed_ecosystem: 'npm',
        parsed_threat_type: 'malicious_script',
        parser_confidence: 'medium',
        status: 'pending',
        promoted_to_incident_id: null,
        reviewed_by: null,
        reviewed_at: null,
        review_notes: null,
        created_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
      },
      {
        id: 'mock-cand-2',
        source: 'hn-heuristic',
        source_id: '48370101',
        source_url: 'https://example.com/typosquat-disclosure',
        title: "Typosquatting attack 'lоdash' (Cyrillic homoglyph) on npm registry",
        author: 'researcher42',
        published_at: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
        parsed_package: 'lоdash',
        parsed_version: null,
        parsed_ecosystem: 'npm',
        parsed_threat_type: 'typosquat',
        parser_confidence: 'medium',
        status: 'pending',
        promoted_to_incident_id: null,
        reviewed_by: null,
        reviewed_at: null,
        review_notes: null,
        created_at: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
      },
      {
        id: 'mock-cand-3',
        source: 'hn-heuristic',
        source_id: '48370523',
        source_url: 'https://blog.example.com/dependency-confusion-write-up',
        title: 'Dependency confusion exploit discovered in @scope/core-package',
        author: 'secresearcher',
        published_at: new Date(Date.now() - 1 * 86400 * 1000).toISOString(),
        parsed_package: '@scope/core-package',
        parsed_version: null,
        parsed_ecosystem: 'npm',
        parsed_threat_type: 'dependency_confusion',
        parser_confidence: 'low',
        status: 'pending',
        promoted_to_incident_id: null,
        reviewed_by: null,
        reviewed_at: null,
        review_notes: null,
        created_at: new Date(Date.now() - 1 * 86400 * 1000).toISOString(),
      },
      {
        id: 'mock-cand-4',
        source: 'hn-heuristic',
        source_id: '48370900',
        source_url: 'https://news.ycombinator.com/item?id=48370900',
        title: 'Random unrelated cybersecurity marketing post',
        author: 'spammer',
        published_at: new Date(Date.now() - 2 * 86400 * 1000).toISOString(),
        parsed_package: 'random-package',
        parsed_version: null,
        parsed_ecosystem: null,
        parsed_threat_type: 'malicious_script',
        parser_confidence: 'low',
        status: 'rejected',
        promoted_to_incident_id: null,
        reviewed_by: 'freewho99',
        reviewed_at: new Date(Date.now() - 1 * 86400 * 1000).toISOString(),
        review_notes: 'Not an incident — marketing post. Parser matched on a generic security keyword.',
        created_at: new Date(Date.now() - 2 * 86400 * 1000).toISOString(),
      },
    ];

    const existing = localStorage.getItem(SANDBOX_STORAGE_KEY);
    if (existing && !forceReset) {
      try { return JSON.parse(existing) as CandidateRow[]; } catch { /* fallthrough */ }
    }
    localStorage.setItem(SANDBOX_STORAGE_KEY, JSON.stringify(defaults));
    return defaults;
  };

  // Memoize on [isSandbox] — without this, apiFetch is rebuilt every
  // render and any consumer callback whose own dep array doesn't change
  // at the moment sandbox activates ends up holding a stale closure that
  // still routes to the real backend. handlePromote (deps `[]`) is the
  // worst case; handleReject was vulnerable too.
  const apiFetch = useCallback(async (url: string, init?: RequestInit): Promise<Response> => {
    if (!isSandbox) {
      return window.fetch(url, init);
    }

    const parsedUrl = new URL(url, window.location.origin);
    const action = parsedUrl.searchParams.get('action');

    const jsonResponse = (data: any, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });

    const store = initSandboxMockData();

    if (action === 'whoami') {
      return jsonResponse({ login: 'freewho99', orgs: [], isReviewer: true });
    }
    if (action === 'candidates-list') {
      return jsonResponse({ candidates: store });
    }
    if (action === 'candidate-reject') {
      const body = JSON.parse(init?.body as string);
      let updated: CandidateRow | null = null;
      const next = store.map((c) => {
        if (c.id === body.id && c.status === 'pending') {
          updated = {
            ...c,
            status: body.status === 'duplicate' ? 'duplicate' : 'rejected',
            reviewed_by: 'freewho99',
            reviewed_at: new Date().toISOString(),
            review_notes: body.review_notes || null,
          };
          return updated;
        }
        return c;
      });
      localStorage.setItem(SANDBOX_STORAGE_KEY, JSON.stringify(next));
      return jsonResponse({ ok: true, candidate: updated });
    }
    if (action === 'candidate-promote') {
      // Sandbox does NOT actually open a PR — it returns a mock URL so the
      // reviewer can see the full UI flow end-to-end. The candidate flips
      // locally; nothing leaves the browser.
      const body = JSON.parse(init?.body as string);
      const mockPrNumber = Math.floor(Math.random() * 900) + 100;
      const mockPrUrl = `https://github.com/freewho99/opensoyce/pull/${mockPrNumber}#sandbox-mock`;
      let updated: CandidateRow | null = null;
      const next = store.map((c) => {
        if (c.id === body.id && c.status === 'pending') {
          updated = {
            ...c,
            status: 'promoted',
            promoted_to_incident_id: mockPrUrl,
            reviewed_by: 'freewho99',
            reviewed_at: new Date().toISOString(),
            review_notes: body.review_notes || null,
          };
          return updated;
        }
        return c;
      });
      localStorage.setItem(SANDBOX_STORAGE_KEY, JSON.stringify(next));
      return jsonResponse({ ok: true, candidate: updated, pr: { url: mockPrUrl, number: mockPrNumber } });
    }

    return window.fetch(url, init);
  }, [isSandbox]);

  // Bootstrap auth — identical model to AppealsReview.
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
          setPhase(reviewer ? 'auth' : 'forbidden');
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

  const fetchCandidates = useCallback(async () => {
    if (phase !== 'auth') return;
    setLoading(true);
    setError(null);
    try {
      const resp = await apiFetch('/api/exceptions?action=candidates-list', { credentials: 'same-origin' });
      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        setError((body && body.message) || `Failed to load candidates (${resp.status}).`);
      } else {
        const body = await resp.json();
        setCandidates(Array.isArray(body.candidates) ? body.candidates : []);
      }
    } catch {
      setError('Network error loading candidates.');
    } finally {
      setLoading(false);
    }
  }, [phase, apiFetch]);

  useEffect(() => { fetchCandidates(); }, [fetchCandidates]);

  const handlePromote = useCallback(async (
    candidateId: string,
    incident: PromoteIncidentPayload,
    reviewNotes: string,
  ): Promise<{ ok: boolean; prUrl?: string; error?: string }> => {
    try {
      const resp = await apiFetch('/api/exceptions?action=candidate-promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ id: candidateId, incident, review_notes: reviewNotes }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        return { ok: false, error: (body && body.message) || `Promote failed (${resp.status})` };
      }
      const body = await resp.json();
      // DO NOT refetch the list or clear promotingId here. The form needs
      // to stay mounted long enough to render its success UI (the
      // "PROMOTE PR OPENED" panel with the clickable PR URL — this is
      // the "repo remembers" handoff moment). Both side-effects unmount
      // the form: setPromotingId(null) directly, and fetchCandidates()
      // indirectly because the candidate's status flips to 'promoted'
      // and isPending becomes false, dropping the form out of the
      // pending-only render branch. They run in handlePromoteFormClose
      // instead, when the reviewer dismisses the success UI.
      return { ok: true, prUrl: body.pr && body.pr.url };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
    }
  }, [apiFetch]);

  // Wired as the form's onCancel: both the X/Cancel buttons (pre-submit)
  // and the "Close form" button on the success UI (post-submit) route
  // here. Always refetch — cheap, and the candidate's status changed
  // server-side if the reviewer reached the success screen.
  const handlePromoteFormClose = useCallback(() => {
    setPromotingId(null);
    void fetchCandidates();
  }, [fetchCandidates]);

  const handleReject = useCallback(async (id: string, status: 'rejected' | 'duplicate') => {
    setActionError((prev) => ({ ...prev, [id]: '' }));
    setReviewingId(id);
    const notes = notesInput[id] || '';

    try {
      const resp = await apiFetch('/api/exceptions?action=candidate-reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ id, status, review_notes: notes.trim() }),
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        setActionError((prev) => ({ ...prev, [id]: (body && body.message) || `Reject failed (${resp.status})` }));
      } else {
        setNotesInput((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        await fetchCandidates();
      }
    } catch {
      setActionError((prev) => ({ ...prev, [id]: 'Network error submitting rejection.' }));
    } finally {
      setReviewingId(null);
    }
  }, [notesInput, fetchCandidates, apiFetch]);

  const stats = useMemo(
    () => ({
      total: candidates.length,
      pending: candidates.filter((c) => c.status === 'pending').length,
      rejected: candidates.filter((c) => c.status === 'rejected' || c.status === 'duplicate').length,
      promoted: candidates.filter((c) => c.status === 'promoted').length,
    }),
    [candidates],
  );

  const filteredCandidates = useMemo(() => {
    if (filter === 'all') return candidates;
    if (filter === 'rejected') {
      return candidates.filter((c) => c.status === 'rejected' || c.status === 'duplicate');
    }
    return candidates.filter((c) => c.status === filter);
  }, [candidates, filter]);

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
    localStorage.removeItem(SANDBOX_STORAGE_KEY);
    setIsSandbox(false);
    setPhase('loading');
    window.location.reload();
  };

  // -------------------------------------------------------- Render phases

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
            THE INCIDENT CANDIDATE REVIEW QUEUE IS RESTRICTED TO DESIGNATED OPENSOYCE REVIEWERS. PLEASE SIGN IN.
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
      {isSandbox && (
        <div className="bg-emerald-50 border-b-4 border-emerald-600 p-4 shadow-[0px_4px_0px_#10B981] text-left">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h4 className="font-black text-xs uppercase text-emerald-800 tracking-tight">
                ⚙️ LOCAL SANDBOX PLAYGROUND ACTIVE
              </h4>
              <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-700 mt-1 leading-relaxed">
                Candidate actions are simulated locally. Exit sandbox mode to restore live database connection.
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

      {/* HERO */}
      <section className="bg-black py-12 px-4 border-b-4 border-black text-white">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
              <div className="bg-soy-red text-white px-3 py-0.5 text-[10px] font-black uppercase tracking-[0.3em] mb-4 inline-block">
                INTERNAL — INCIDENT INTAKE QUEUE
              </div>
              <h1 className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter text-white">
                INCIDENT CANDIDATE REVIEW
              </h1>
              <p className="text-white/60 text-xs font-bold uppercase tracking-widest mt-2">
                The scraper proposes. You decide. The repo remembers.
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

      {/* Doctrine banner — explains the promote-opens-a-PR contract */}
      <div className="bg-amber-50 border-b-4 border-amber-600">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-start gap-3">
          <AlertOctagon className="text-amber-700 shrink-0 mt-0.5" size={16} />
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-900 leading-relaxed">
            <strong>Promote</strong> opens a PR appending to <code className="bg-white px-1 border border-amber-700">src/data/promotedIncidents.json</code> — nothing is published until that PR is reviewed and merged.{' '}
            <strong>Reject</strong> and <strong>Mark Duplicate</strong> close the candidate locally without touching the public catalog.
          </p>
        </div>
      </div>

      {/* STATS */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white border-4 border-black p-4 shadow-[4px_4px_0px_#000]">
            <div className="text-[8px] font-black uppercase tracking-widest opacity-40 mb-1">TOTAL CANDIDATES</div>
            <div className="text-3xl font-black italic">{stats.total}</div>
          </div>
          <div className="bg-white border-4 border-black p-4 shadow-[4px_4px_0px_#E63322] border-l-soy-red">
            <div className="text-[8px] font-black uppercase tracking-widest text-soy-red mb-1">PENDING REVIEW</div>
            <div className="text-3xl font-black italic text-soy-red">{stats.pending}</div>
          </div>
          <div className="bg-white border-4 border-black p-4 shadow-[4px_4px_0px_#22C55E] border-l-emerald-500">
            <div className="text-[8px] font-black uppercase tracking-widest text-emerald-600 mb-1">PROMOTED</div>
            <div className="text-3xl font-black italic text-emerald-600">{stats.promoted}</div>
          </div>
          <div className="bg-white border-4 border-black p-4 shadow-[4px_4px_0px_#302C26] border-l-black">
            <div className="text-[8px] font-black uppercase tracking-widest opacity-40 mb-1">REJECTED</div>
            <div className="text-3xl font-black italic">{stats.rejected}</div>
          </div>
        </div>

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
            onClick={() => setFilter('promoted')}
            className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest border-2 transition-all ${
              filter === 'promoted'
                ? 'bg-emerald-500 text-white border-black shadow-[2px_2px_0px_#000]'
                : 'bg-white text-black border-black hover:bg-black hover:text-white'
            }`}
          >
            PROMOTED ({stats.promoted})
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
            ALL ({stats.total})
          </button>
        </div>

        {error && (
          <div className="bg-soy-red text-white border-4 border-black p-4 mb-6 shadow-[4px_4px_0px_#000] flex items-start gap-2">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-black uppercase">FETCH ERROR</div>
              <p className="text-[10px] font-bold uppercase mt-1 opacity-95">{error}</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-24 text-center">
            <RefreshCw className="mx-auto animate-spin text-soy-bottle mb-4" size={24} />
            <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Syncing with candidate queue…</p>
          </div>
        ) : filteredCandidates.length === 0 ? (
          <div className="py-20 text-center bg-white border-4 border-black shadow-[6px_6px_0px_#000] text-soy-bottle">
            <Inbox className="mx-auto opacity-35 mb-4" size={48} />
            <h4 className="text-xl font-black uppercase italic tracking-tighter">No candidates in this view</h4>
            <p className="text-[9px] font-bold uppercase tracking-widest opacity-50 mt-1">
              {filter === 'pending'
                ? 'Review queue is clean — the scraper has nothing new to propose.'
                : 'Switch filter to see other candidates.'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <AnimatePresence mode="popLayout">
              {filteredCandidates.map((cand) => {
                const notes = notesInput[cand.id] || '';
                const actErr = actionError[cand.id] || '';
                const isPending = cand.status === 'pending';

                return (
                  <motion.div
                    layout
                    key={cand.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white border-4 border-black p-6 shadow-[6px_6px_0px_#000] relative"
                  >
                    {/* Header — raw source + status pill */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 pb-4 border-b-2 border-black/10">
                      <div className="flex-1">
                        <div className="flex items-center flex-wrap gap-2 mb-2">
                          <span className="border-2 border-black bg-soy-label text-soy-bottle px-1.5 py-0.5 text-[8px] font-black uppercase">
                            {cand.source}
                          </span>
                          {isPending && (
                            <span className="bg-soy-red text-white px-1.5 py-0.5 text-[8px] font-black uppercase border border-black">
                              PENDING REVIEW
                            </span>
                          )}
                          {cand.status === 'rejected' && (
                            <span className="bg-black text-white px-1.5 py-0.5 text-[8px] font-black uppercase border border-black">
                              REJECTED
                            </span>
                          )}
                          {cand.status === 'duplicate' && (
                            <span className="bg-black text-white px-1.5 py-0.5 text-[8px] font-black uppercase border border-black">
                              DUPLICATE
                            </span>
                          )}
                          {cand.status === 'promoted' && (
                            <span className="bg-emerald-500 text-white px-1.5 py-0.5 text-[8px] font-black uppercase border border-black">
                              PROMOTED → {cand.promoted_to_incident_id}
                            </span>
                          )}
                        </div>
                        <div className="text-base sm:text-lg font-black uppercase italic tracking-tight leading-tight">
                          {cand.title}
                        </div>
                        {cand.source_url && (
                          <a
                            href={cand.source_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest opacity-60 hover:text-soy-red mt-2"
                          >
                            <ExternalLink size={10} /> {cand.source_url}
                          </a>
                        )}
                      </div>
                      <div className="text-[9px] font-bold uppercase tracking-widest opacity-50 flex items-center gap-1 shrink-0">
                        <Clock size={12} /> {new Date(cand.created_at).toLocaleString()}
                      </div>
                    </div>

                    {/* Source author */}
                    {cand.author && (
                      <div className="mb-4 flex items-center gap-2">
                        <User size={14} className="opacity-50 shrink-0" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">
                          Source author: <span className="font-black">@{cand.author}</span>
                        </span>
                        {cand.published_at && (
                          <span className="text-[9px] font-bold uppercase tracking-widest opacity-50">
                            Published: {new Date(cand.published_at).toLocaleString()}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Parsed metadata — the parser's GUESS, clearly labeled */}
                    <div className="mb-6">
                      <div className="text-[9px] font-black uppercase tracking-widest opacity-40 mb-2 flex items-center gap-1">
                        <Sparkles size={10} /> Parser interpretation (heuristic guess — verify against source)
                      </div>
                      <div className="bg-soy-label/20 border-2 border-black/30 p-4 space-y-2">
                        <div className="flex flex-wrap gap-x-6 gap-y-2 items-center text-[10px] font-bold uppercase tracking-wider">
                          <span className="flex items-center gap-1.5">
                            <Package size={12} className="opacity-50" />
                            Package:{' '}
                            <span className="font-black">
                              {cand.parsed_package ?? <em className="opacity-50 font-bold">(none parsed)</em>}
                            </span>
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Hash size={12} className="opacity-50" />
                            Version:{' '}
                            <span className="font-black">
                              {cand.parsed_version ?? <em className="opacity-50 font-bold">unknown</em>}
                            </span>
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Newspaper size={12} className="opacity-50" />
                            Ecosystem:{' '}
                            <span className="font-black">
                              {cand.parsed_ecosystem ?? <em className="opacity-50 font-bold">unknown</em>}
                            </span>
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Tag size={12} className="opacity-50" />
                            Threat:{' '}
                            <span className="font-black">
                              {cand.parsed_threat_type
                                ? THREAT_TYPE_LABEL[cand.parsed_threat_type]
                                : <em className="opacity-50 font-bold">unknown</em>}
                            </span>
                          </span>
                        </div>
                        {/* Confidence badge — the load-bearing piece */}
                        <div>
                          <span className={`inline-flex items-center gap-1 border-2 px-2 py-1 text-[9px] font-black uppercase tracking-widest ${CONFIDENCE_STYLE[cand.parser_confidence]}`}>
                            PARSER CONFIDENCE: {CONFIDENCE_LABEL[cand.parser_confidence]}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action panel */}
                    {isPending ? (
                      <div className="pt-6 border-t-2 border-black/10 space-y-4">
                        <div>
                          <label className="block text-[9px] font-black uppercase tracking-widest opacity-60 mb-1">
                            Reviewer Notes (Optional)
                          </label>
                          <textarea
                            value={notes}
                            onChange={(e) => setNotesInput((prev) => ({ ...prev, [cand.id]: e.target.value }))}
                            placeholder="Why is this a rejection? Bad parse, not an incident, duplicate of an existing entry, etc."
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
                          {/* Promote — opens inline form that submits to the bot-PR API (PR #2b) */}
                          <button
                            type="button"
                            disabled={reviewingId !== null || promotingId !== null}
                            onClick={() => setPromotingId(cand.id)}
                            className="bg-emerald-500 text-white px-5 py-2.5 text-[10px] font-black uppercase tracking-widest border-2 border-black shadow-[2px_2px_0px_#000] hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                          >
                            <CheckCircle2 size={12} /> Promote → Public Incident
                          </button>
                          <button
                            type="button"
                            disabled={reviewingId !== null || promotingId !== null}
                            onClick={() => handleReject(cand.id, 'rejected')}
                            className="bg-soy-red text-white px-5 py-2.5 text-[10px] font-black uppercase tracking-widest border-2 border-black shadow-[2px_2px_0px_#000] hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                          >
                            <XCircle size={12} /> Reject Candidate
                          </button>
                          <button
                            type="button"
                            disabled={reviewingId !== null || promotingId !== null}
                            onClick={() => handleReject(cand.id, 'duplicate')}
                            className="bg-black text-white px-5 py-2.5 text-[10px] font-black uppercase tracking-widest border-2 border-black shadow-[2px_2px_0px_#000] hover:bg-soy-bottle transition-colors disabled:opacity-50 flex items-center gap-1.5"
                          >
                            Mark Duplicate
                          </button>
                        </div>

                        {/* Inline promote form — rendered only for the candidate the
                            reviewer chose to promote. One open at a time. */}
                        {promotingId === cand.id && (
                          <PromoteIncidentForm
                            candidate={{
                              id: cand.id,
                              title: cand.title,
                              source_url: cand.source_url,
                              parsed_package: cand.parsed_package,
                              parsed_version: cand.parsed_version,
                              parsed_ecosystem: cand.parsed_ecosystem,
                            }}
                            onSubmit={handlePromote}
                            onCancel={handlePromoteFormClose}
                          />
                        )}
                      </div>
                    ) : (
                      <div className="pt-6 border-t-2 border-black/10 mt-6 bg-black/5 p-4 border border-black/5">
                        <div className="flex items-center gap-2 mb-2">
                          {cand.status === 'promoted' ? (
                            <CheckCircle2 className="text-emerald-500 shrink-0" size={16} />
                          ) : (
                            <XCircle className="text-black shrink-0" size={16} />
                          )}
                          <span className="text-[10px] font-black uppercase tracking-wider">
                            {cand.status.toUpperCase()} BY @{cand.reviewed_by ?? '—'}
                          </span>
                          <span className="text-[9px] font-bold uppercase tracking-widest opacity-50 ml-auto">
                            Reviewed: {cand.reviewed_at ? new Date(cand.reviewed_at).toLocaleDateString() : '—'}
                          </span>
                        </div>
                        {cand.review_notes ? (
                          <p className="text-xs font-bold leading-normal mt-2 pl-6 opacity-85">
                            Notes: "{cand.review_notes}"
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
