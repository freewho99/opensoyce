/**
 * Exceptions dashboard (Sprint+3 PR 3).
 *
 * Flow:
 *   1. Mount → probe /api/exceptions?action=whoami.
 *   2. If 401 → show "Sign in with GitHub" CTA. Click generates a UUID state,
 *      stores it in sessionStorage, redirects to GitHub OAuth authorize.
 *   3. GitHub redirects back to /dashboard?code=...&state=... → we POST
 *      { code, state } to /api/exceptions?action=auth-callback, which mints
 *      the osg_session cookie and returns { login }.
 *   4. With a session, fetch my-repos and let the user pick one. Selecting a
 *      repo lists its exceptions and lets the user grant / revoke.
 *
 * CSRF posture (acknowledged weakness): the OAuth state is a client-generated
 * UUID round-tripped through sessionStorage. We verify the returned state
 * matches what we stored, but the backend does NOT verify a signature on it.
 * The OAuth code itself is single-use and bound to redirect_uri, which limits
 * forgery blast radius. Server-signed state is a follow-up.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Github, Shield, Trash2, RefreshCw, AlertTriangle, Plus, LogOut, ChevronRight, Eye } from 'lucide-react';

type ExceptionRow = {
  id: string;
  owner: string;
  repo: string;
  package_name: string;
  ecosystem: string;
  reason: string;
  expires_at: string;
  granted_by: string;
  created_at: string;
  revoked_at: string | null;
};

type RepoRef = { owner: string; repo: string };

type WatchVerdict = {
  owner: string;
  repo: string;
  label: string;
  scanned_at: string;
};

type WatchedRow = {
  id: string;
  package_name: string;
  ecosystem: string;
  created_at: string;
  verdicts: WatchVerdict[];
};

type WatchChange = {
  package_name: string;
  ecosystem: string;
  owner: string;
  repo: string;
  prev_label: string;
  new_label: string;
  scanned_at: string;
};

type Phase =
  | 'loading'
  | 'oauth-callback'
  | 'unauth'
  | 'auth'
  | 'error-config';

const ECOSYSTEMS = ['npm', 'pnpm', 'yarn', 'uv', 'poetry', 'mixed'] as const;
const EXPIRY_OPTIONS = [7, 14, 30, 60, 90];
const REASON_MIN = 10;
const REASON_MAX = 2000;
const OAUTH_STATE_KEY = 'dashboard_oauth_state';

function classifyStatus(row: ExceptionRow): 'active' | 'expired' | 'revoked' {
  if (row.revoked_at) return 'revoked';
  const expiresMs = Date.parse(row.expires_at);
  if (Number.isFinite(expiresMs) && expiresMs <= Date.now()) return 'expired';
  return 'active';
}

function formatExpires(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

// Tiny relative-time helper. Avoids the bundle cost of Intl.RelativeTimeFormat
// import elsewhere and keeps copy phrased like the rest of the dashboard.
function formatRelative(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const diffMs = Date.now() - t;
  const abs = Math.abs(diffMs);
  const suffix = diffMs >= 0 ? 'ago' : 'from now';
  const min = 60 * 1000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (abs < min) return 'just now';
  if (abs < hr) {
    const n = Math.round(abs / min);
    return `${n} minute${n === 1 ? '' : 's'} ${suffix}`;
  }
  if (abs < day) {
    const n = Math.round(abs / hr);
    return `${n} hour${n === 1 ? '' : 's'} ${suffix}`;
  }
  if (abs < 30 * day) {
    const n = Math.round(abs / day);
    return `${n} day${n === 1 ? '' : 's'} ${suffix}`;
  }
  if (abs < 365 * day) {
    const n = Math.round(abs / (30 * day));
    return `${n} month${n === 1 ? '' : 's'} ${suffix}`;
  }
  const n = Math.round(abs / (365 * day));
  return `${n} year${n === 1 ? '' : 's'} ${suffix}`;
}

// Mirror GuardPrCommentPreview's chip palette. FORKABLE isn't in the comment
// preview's union but the backend label rank includes it, so we map it to the
// soy-label/STABLE band (closest neutral). If the backend returns an unknown
// label, fall back to a neutral chip rather than crashing.
const VERDICT_CHIP_STYLES: Record<string, string> = {
  'USE READY': 'bg-emerald-500 text-white border-black',
  'STABLE': 'bg-soy-label text-soy-bottle border-soy-bottle',
  'FORKABLE': 'bg-soy-label text-soy-bottle border-soy-bottle',
  'WATCHLIST': 'bg-amber-400 text-black border-black',
  'RISKY': 'bg-soy-red text-white border-black',
  'GRAVEYARD': 'bg-black text-soy-red border-soy-red',
};

function VerdictChip({ label }: { label: string }) {
  const cls = VERDICT_CHIP_STYLES[label] || 'bg-white text-soy-bottle border-soy-bottle';
  return (
    <span className={`inline-block px-2 py-0.5 text-[10px] font-black uppercase tracking-widest italic border-2 ${cls}`}>
      {label}
    </span>
  );
}

export default function Dashboard() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [login, setLogin] = useState<string | null>(null);
  const [oauthClientId, setOauthClientId] = useState<string | null>(null);
  const [repos, setRepos] = useState<RepoRef[] | null>(null);
  const [reposLoading, setReposLoading] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<RepoRef | null>(null);
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // Grant form state.
  const [pkgName, setPkgName] = useState('');
  const [ecosystem, setEcosystem] = useState<typeof ECOSYSTEMS[number]>('npm');
  const [reason, setReason] = useState('');
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [granting, setGranting] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);

  // Watchlist state (Sprint+4 PR 3).
  const [watched, setWatched] = useState<WatchedRow[] | null>(null);
  const [watchedLoading, setWatchedLoading] = useState(false);
  const [watchedError, setWatchedError] = useState<string | null>(null);
  const [changes, setChanges] = useState<WatchChange[]>([]);
  const [changesExpanded, setChangesExpanded] = useState(false);
  const [watchPkgName, setWatchPkgName] = useState('');
  const [watchEcosystem, setWatchEcosystem] = useState<typeof ECOSYSTEMS[number]>('npm');
  const [watchAdding, setWatchAdding] = useState(false);
  const [watchAddError, setWatchAddError] = useState<string | null>(null);

  // ------------------------------------------------------------- bootstrap
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1. Detect an OAuth callback (?code= & ?state= in URL).
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const state = params.get('state');

      if (code && state) {
        setPhase('oauth-callback');
        const stored = sessionStorage.getItem(OAUTH_STATE_KEY);
        if (!stored || stored !== state) {
          setErrorMessage('OAUTH state mismatch — try signing in again.');
          // Strip the bogus query params either way.
          window.history.replaceState({}, '', '/dashboard');
          setPhase('unauth');
          return;
        }
        sessionStorage.removeItem(OAUTH_STATE_KEY);
        try {
          const resp = await fetch('/api/exceptions?action=auth-callback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, state }),
          });
          // Strip query params regardless of success so a refresh doesn't
          // re-attempt with the now-consumed code.
          window.history.replaceState({}, '', '/dashboard');
          if (!resp.ok) {
            const body = await resp.json().catch(() => null);
            const msg = body && body.error === 'OAUTH_NOT_CONFIGURED'
              ? 'OpenSoyce is missing its GitHub OAuth credentials. Contact support@opensoyce.com.'
              : body && body.message ? body.message : `Sign-in failed (${resp.status}).`;
            if (cancelled) return;
            setErrorMessage(msg);
            setPhase('unauth');
            return;
          }
          const body = await resp.json();
          if (cancelled) return;
          setLogin(body.login || null);
          setPhase('auth');
          return;
        } catch (e: unknown) {
          if (cancelled) return;
          setErrorMessage('Network error during sign-in. Try again.');
          setPhase('unauth');
          return;
        }
      }

      // 2. Probe whoami for an existing session.
      try {
        const resp = await fetch('/api/exceptions?action=whoami', { credentials: 'same-origin' });
        if (cancelled) return;
        if (resp.ok) {
          const body = await resp.json();
          setLogin(body.login || null);
          setPhase('auth');
        } else {
          setPhase('unauth');
        }
      } catch {
        if (cancelled) return;
        setPhase('unauth');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Once we're 'auth', fetch the user's repos.
  useEffect(() => {
    if (phase !== 'auth') return;
    if (repos !== null) return;
    let cancelled = false;
    (async () => {
      setReposLoading(true);
      try {
        const resp = await fetch('/api/exceptions?action=my-repos', { credentials: 'same-origin' });
        if (!resp.ok) {
          if (cancelled) return;
          setRepos([]);
          setReposLoading(false);
          return;
        }
        const body = await resp.json();
        if (cancelled) return;
        setRepos(Array.isArray(body.repos) ? body.repos : []);
      } catch {
        if (cancelled) return;
        setRepos([]);
      } finally {
        if (!cancelled) setReposLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [phase, repos]);

  // Fetch oauth client_id once for the sign-in button.
  useEffect(() => {
    if (oauthClientId !== null) return;
    if (phase !== 'unauth') return;
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch('/api/config');
        if (!resp.ok) return;
        const body = await resp.json();
        if (cancelled) return;
        if (typeof body.githubOauthClientId === 'string') {
          setOauthClientId(body.githubOauthClientId);
        } else {
          setOauthClientId('');
        }
      } catch {
        if (cancelled) return;
        setOauthClientId('');
      }
    })();
    return () => { cancelled = true; };
  }, [phase, oauthClientId]);

  // Fetch exceptions whenever selectedRepo changes.
  const refreshExceptions = useCallback(async (repo: RepoRef) => {
    setListLoading(true);
    setListError(null);
    try {
      const url = `/api/exceptions?owner=${encodeURIComponent(repo.owner)}&repo=${encodeURIComponent(repo.repo)}`;
      const resp = await fetch(url, { credentials: 'same-origin' });
      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        setListError((body && body.message) || `Failed to load exceptions (${resp.status}).`);
        setExceptions([]);
      } else {
        const body = await resp.json();
        setExceptions(Array.isArray(body.exceptions) ? body.exceptions : []);
      }
    } catch {
      setListError('Network error loading exceptions.');
      setExceptions([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedRepo) return;
    refreshExceptions(selectedRepo);
  }, [selectedRepo, refreshExceptions]);

  // ------------------------------------------------------------- actions
  const handleSignIn = useCallback(() => {
    if (!oauthClientId) {
      setErrorMessage('OpenSoyce is missing its GitHub OAuth client ID. Contact support@opensoyce.com.');
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
      scope: 'read:user',
      state,
      allow_signup: 'false',
    });
    window.location.href = `https://github.com/login/oauth/authorize?${params.toString()}`;
  }, [oauthClientId]);

  const handleSignOut = useCallback(async () => {
    try {
      await fetch('/api/exceptions?action=logout', { method: 'POST', credentials: 'same-origin' });
    } catch {
      // best-effort; we still tear down local state.
    }
    setLogin(null);
    setRepos(null);
    setSelectedRepo(null);
    setExceptions([]);
    setPhase('unauth');
  }, []);

  const handleGrant = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRepo) return;
    setGrantError(null);
    const trimmedReason = reason.trim();
    if (trimmedReason.length < REASON_MIN || trimmedReason.length > REASON_MAX) {
      setGrantError(`Reason must be ${REASON_MIN}–${REASON_MAX} characters after trimming.`);
      return;
    }
    if (!pkgName.trim()) {
      setGrantError('Package name is required.');
      return;
    }
    setGranting(true);
    try {
      const resp = await fetch('/api/exceptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          owner: selectedRepo.owner,
          repo: selectedRepo.repo,
          package_name: pkgName.trim(),
          ecosystem,
          reason: trimmedReason,
          expires_in_days: expiresInDays,
        }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        setGrantError((body && body.message) || `Failed to grant exception (${resp.status}).`);
      } else {
        setPkgName('');
        setReason('');
        await refreshExceptions(selectedRepo);
      }
    } catch {
      setGrantError('Network error granting exception.');
    } finally {
      setGranting(false);
    }
  }, [selectedRepo, pkgName, ecosystem, reason, expiresInDays, refreshExceptions]);

  const handleRevoke = useCallback(async (id: string) => {
    if (!selectedRepo) return;
    try {
      const resp = await fetch(`/api/exceptions?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        setListError((body && body.message) || `Failed to revoke (${resp.status}).`);
        return;
      }
      await refreshExceptions(selectedRepo);
    } catch {
      setListError('Network error revoking exception.');
    }
  }, [selectedRepo, refreshExceptions]);

  // ----------------------------------------------------------- watchlist

  const refreshWatched = useCallback(async () => {
    setWatchedLoading(true);
    setWatchedError(null);
    try {
      const resp = await fetch('/api/exceptions?action=watchlist-list', { credentials: 'same-origin' });
      if (resp.status === 401) {
        // Session expired mid-session — tear down so the user is prompted to sign in again.
        setLogin(null);
        setRepos(null);
        setSelectedRepo(null);
        setExceptions([]);
        setWatched(null);
        setChanges([]);
        setPhase('unauth');
        return;
      }
      if (!resp.ok) {
        setWatchedError('Couldn’t load watchlist — refresh to retry.');
        setWatched([]);
      } else {
        const body = await resp.json();
        setWatched(Array.isArray(body.watched) ? body.watched : []);
      }
    } catch {
      setWatchedError('Couldn’t load watchlist — refresh to retry.');
      setWatched([]);
    } finally {
      setWatchedLoading(false);
    }
  }, []);

  const refreshChanges = useCallback(async () => {
    try {
      const resp = await fetch('/api/exceptions?action=watchlist-changes', { credentials: 'same-origin' });
      if (!resp.ok) {
        // Silent on changes failure — list still loads independently.
        setChanges([]);
        return;
      }
      const body = await resp.json();
      setChanges(Array.isArray(body.changes) ? body.changes : []);
    } catch {
      setChanges([]);
    }
  }, []);

  // Initial fetch on auth.
  useEffect(() => {
    if (phase !== 'auth') return;
    if (watched !== null) return;
    refreshWatched();
    refreshChanges();
  }, [phase, watched, refreshWatched, refreshChanges]);

  const handleWatchAdd = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setWatchAddError(null);
    const trimmed = watchPkgName.trim();
    if (!trimmed) {
      setWatchAddError('Package name is required.');
      return;
    }
    setWatchAdding(true);
    try {
      const resp = await fetch('/api/exceptions?action=watchlist-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ package_name: trimmed, ecosystem: watchEcosystem }),
      });
      if (resp.status === 201 || resp.status === 200) {
        // 201 == new row, 200 with already_watched == duplicate. Either way
        // we clear the form and refresh; refresh will surface the existing row.
        setWatchPkgName('');
        await refreshWatched();
      } else if (resp.status >= 500) {
        setWatchAddError('Couldn’t add — try again.');
      } else {
        const body = await resp.json().catch(() => null);
        setWatchAddError((body && (body.message || body.error)) || `Failed to add (${resp.status}).`);
      }
    } catch {
      setWatchAddError('Couldn’t add — try again.');
    } finally {
      setWatchAdding(false);
    }
  }, [watchPkgName, watchEcosystem, refreshWatched]);

  const handleUnwatch = useCallback(async (id: string) => {
    try {
      const resp = await fetch('/api/exceptions?action=watchlist-remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ id }),
      });
      if (resp.ok) {
        // Optimistic local removal; the next refresh would do the same but
        // the row disappears instantly this way.
        setWatched(prev => (prev ? prev.filter(w => w.id !== id) : prev));
      } else {
        setWatchedError('Couldn’t remove that watch — refresh and retry.');
      }
    } catch {
      setWatchedError('Couldn’t remove that watch — refresh and retry.');
    }
  }, []);

  // ------------------------------------------------------------- render
  const reasonLen = reason.trim().length;
  const sortedRepos = useMemo(() => repos || [], [repos]);

  if (phase === 'loading' || phase === 'oauth-callback') {
    return (
      <div className="max-w-4xl mx-auto px-4 py-32 text-center">
        <p className="text-xs font-black uppercase tracking-widest opacity-60">
          {phase === 'oauth-callback' ? 'SIGNING YOU IN…' : 'LOADING DASHBOARD…'}
        </p>
      </div>
    );
  }

  if (phase === 'unauth') {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 flex flex-col items-center justify-center min-h-[60vh]">
        <div className="bg-white border-4 border-soy-bottle p-12 shadow-[12px_12px_0px_#E63322] text-center w-full max-w-md">
          <Shield size={64} className="text-soy-red mx-auto mb-8" />
          <h2 className="text-3xl font-black uppercase italic tracking-tighter mb-4">EXCEPTIONS DASHBOARD</h2>
          <p className="text-xs font-bold uppercase tracking-widest opacity-60 mb-6 leading-relaxed">
            SIGN IN WITH GITHUB TO MANAGE EXCEPTIONS FOR REPOS WHERE GUARD IS INSTALLED.
          </p>
          {errorMessage && (
            <div className="bg-soy-red text-white border-2 border-soy-bottle p-3 mb-6 text-[10px] font-black uppercase tracking-widest">
              {errorMessage}
            </div>
          )}
          <button
            type="button"
            onClick={handleSignIn}
            disabled={!oauthClientId}
            className="w-full bg-soy-bottle text-soy-label py-4 text-xl font-black uppercase tracking-widest hover:bg-soy-red transition-all flex items-center justify-center gap-3 disabled:opacity-50"
          >
            <Github size={24} />
            {oauthClientId === null ? 'LOADING…' : oauthClientId === '' ? 'OAUTH NOT CONFIGURED' : 'SIGN IN WITH GITHUB'}
          </button>
        </div>
      </div>
    );
  }

  // phase === 'auth'
  return (
    <div className="max-w-7xl mx-auto px-4 py-12 font-mono">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8 border-b-4 border-soy-bottle pb-6">
        <div>
          <h1 className="text-4xl font-black uppercase italic tracking-tighter leading-none mb-2">EXCEPTIONS DASHBOARD</h1>
          <div className="text-[10px] font-black uppercase tracking-widest opacity-60">
            SIGNED IN AS <span className="text-soy-red">@{login}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="self-start md:self-auto flex items-center gap-2 border-2 border-soy-bottle px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-soy-bottle hover:text-soy-label transition-colors"
        >
          <LogOut size={14} /> Sign Out
        </button>
      </header>

      {!selectedRepo ? (
        <section className="bg-white border-4 border-soy-bottle p-8 shadow-[8px_8px_0px_#000]">
          <h2 className="text-2xl font-black uppercase italic tracking-tighter mb-2">PICK A REPO</h2>
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-6">
            REPOS WHERE GUARD IS INSTALLED AND YOU HAVE WRITE OR ADMIN ACCESS.
          </p>
          {reposLoading ? (
            <p className="text-xs font-black uppercase tracking-widest opacity-60">LOADING REPOS…</p>
          ) : sortedRepos.length === 0 ? (
            <div className="bg-soy-label/20 border-2 border-soy-bottle p-6">
              <p className="text-xs font-bold uppercase tracking-widest opacity-70 leading-relaxed">
                NO ELIGIBLE REPOS FOUND. INSTALL THE OPENSOYCE GUARD GITHUB APP ON A REPO
                YOU HAVE WRITE ACCESS TO, THEN COME BACK.
              </p>
            </div>
          ) : (
            <ul className="divide-y-2 divide-soy-label border-2 border-soy-bottle">
              {sortedRepos.map(r => (
                <li key={`${r.owner}/${r.repo}`}>
                  <button
                    type="button"
                    onClick={() => setSelectedRepo(r)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-soy-label transition-colors"
                  >
                    <span className="text-xs font-black uppercase tracking-widest">{r.owner}/{r.repo}</span>
                    <ChevronRight size={16} className="text-soy-red" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-6">
            <button
              type="button"
              onClick={() => setSelectedRepo(null)}
              className="text-[10px] font-black uppercase tracking-widest underline decoration-2 underline-offset-4 hover:text-soy-red"
            >
              ← All repos
            </button>
            <span className="text-[10px] font-black uppercase tracking-widest opacity-60">/</span>
            <span className="text-xs font-black uppercase tracking-widest">{selectedRepo.owner}/{selectedRepo.repo}</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            {/* Grant form */}
            <section className="lg:col-span-2 bg-white border-4 border-soy-bottle p-6 shadow-[8px_8px_0px_#000]">
              <h2 className="text-xl font-black uppercase italic tracking-tighter mb-4 flex items-center gap-2">
                <Plus size={20} /> Grant exception
              </h2>
              <form onSubmit={handleGrant} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest mb-1">Package name</label>
                  <input
                    type="text"
                    value={pkgName}
                    onChange={e => setPkgName(e.target.value)}
                    placeholder="lodash"
                    className="w-full border-2 border-soy-bottle bg-soy-label/10 px-3 py-2 text-xs font-mono focus:outline-none focus:bg-white"
                    maxLength={214}
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest mb-1">Ecosystem</label>
                  <select
                    value={ecosystem}
                    onChange={e => setEcosystem(e.target.value as typeof ECOSYSTEMS[number])}
                    className="w-full border-2 border-soy-bottle bg-soy-label/10 px-3 py-2 text-xs font-mono focus:outline-none focus:bg-white"
                  >
                    {ECOSYSTEMS.map(eco => <option key={eco} value={eco}>{eco}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest mb-1">
                    Reason <span className="opacity-60">({reasonLen}/{REASON_MAX})</span>
                  </label>
                  <textarea
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="Approved by security team on 2026-05-18; vendor SBOM attached…"
                    className="w-full border-2 border-soy-bottle bg-soy-label/10 px-3 py-2 text-xs font-mono focus:outline-none focus:bg-white min-h-[120px]"
                    maxLength={REASON_MAX + 100}
                    required
                  />
                  {reasonLen > 0 && reasonLen < REASON_MIN && (
                    <p className="text-[10px] font-black uppercase tracking-widest text-soy-red mt-1">
                      Need at least {REASON_MIN} characters.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest mb-1">Expires in</label>
                  <select
                    value={expiresInDays}
                    onChange={e => setExpiresInDays(Number(e.target.value))}
                    className="w-full border-2 border-soy-bottle bg-soy-label/10 px-3 py-2 text-xs font-mono focus:outline-none focus:bg-white"
                  >
                    {EXPIRY_OPTIONS.map(d => <option key={d} value={d}>{d} days</option>)}
                  </select>
                </div>
                {grantError && (
                  <div className="bg-soy-red text-white border-2 border-soy-bottle p-3 text-[10px] font-black uppercase tracking-widest flex items-start gap-2">
                    <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" /> {grantError}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={granting}
                  className="w-full bg-soy-red text-white py-3 text-xs font-black uppercase tracking-widest hover:bg-soy-bottle transition-all disabled:opacity-50 border-2 border-soy-bottle"
                >
                  {granting ? 'GRANTING…' : 'GRANT EXCEPTION'}
                </button>
              </form>
            </section>

            {/* List */}
            <section className="lg:col-span-3 bg-white border-4 border-soy-bottle p-6 shadow-[8px_8px_0px_#000]">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-black uppercase italic tracking-tighter">Active exceptions</h2>
                <button
                  type="button"
                  onClick={() => selectedRepo && refreshExceptions(selectedRepo)}
                  className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest hover:text-soy-red"
                >
                  <RefreshCw size={12} /> Refresh
                </button>
              </div>
              {listError && (
                <div className="bg-soy-red text-white border-2 border-soy-bottle p-3 mb-4 text-[10px] font-black uppercase tracking-widest">
                  {listError}
                </div>
              )}
              {listLoading ? (
                <p className="text-xs font-black uppercase tracking-widest opacity-60">LOADING…</p>
              ) : exceptions.length === 0 ? (
                <div className="bg-soy-label/20 border-2 border-soy-bottle p-6">
                  <p className="text-xs font-bold uppercase tracking-widest opacity-70">
                    NO EXCEPTIONS GRANTED YET.
                  </p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {exceptions.map(row => {
                    const status = classifyStatus(row);
                    const dim = status !== 'active';
                    return (
                      <li
                        key={row.id}
                        className={`border-2 border-soy-bottle p-4 ${dim ? 'bg-soy-label/30 opacity-60' : 'bg-white'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="text-sm font-black uppercase tracking-widest break-all">{row.package_name}</span>
                              <span className="text-[9px] font-bold uppercase tracking-widest bg-soy-label/40 px-1.5 py-0.5">
                                {row.ecosystem}
                              </span>
                              {status === 'expired' && (
                                <span className="text-[9px] font-black uppercase tracking-widest bg-amber-400 text-soy-bottle px-1.5 py-0.5">EXPIRED</span>
                              )}
                              {status === 'revoked' && (
                                <span className="text-[9px] font-black uppercase tracking-widest bg-soy-bottle text-white px-1.5 py-0.5">REVOKED</span>
                              )}
                            </div>
                            <p className="text-xs leading-relaxed mb-2 whitespace-pre-wrap break-words">{row.reason}</p>
                            <p className="text-[9px] font-black uppercase tracking-widest opacity-60">
                              Expires {formatExpires(row.expires_at)} · Granted by @{row.granted_by}
                            </p>
                          </div>
                          {status === 'active' && (
                            <button
                              type="button"
                              onClick={() => handleRevoke(row.id)}
                              className="flex items-center gap-1 border-2 border-soy-bottle px-3 py-1.5 text-[10px] font-black uppercase tracking-widest hover:bg-soy-red hover:text-white hover:border-soy-red transition-colors flex-shrink-0"
                            >
                              <Trash2 size={12} /> Revoke
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </>
      )}

      {/* ----------------------------------------------------- watchlist */}
      <section className="mt-12">
        <div className="flex items-center justify-between mb-4 border-b-4 border-soy-bottle pb-3">
          <h2 className="text-3xl font-black uppercase italic tracking-tighter leading-none flex items-center gap-2">
            <Eye size={26} /> Watched packages
          </h2>
          <button
            type="button"
            onClick={() => { refreshWatched(); refreshChanges(); }}
            className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest hover:text-soy-red"
          >
            <RefreshCw size={12} /> Refresh
          </button>
        </div>

        {/* Recent degradations banner */}
        {changes.length > 0 && (
          <div className="bg-soy-red text-white border-4 border-soy-bottle p-4 mb-6 shadow-[6px_6px_0px_#000]">
            <button
              type="button"
              onClick={() => setChangesExpanded(v => !v)}
              className="w-full flex items-center justify-between gap-3 text-left"
            >
              <span className="flex items-center gap-2 text-xs font-black uppercase tracking-widest">
                <AlertTriangle size={16} /> [!] {changes.length} watched package{changes.length === 1 ? '' : 's'} degraded recently
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest opacity-80">
                {changesExpanded ? 'HIDE' : 'SHOW'}
              </span>
            </button>
            {(changesExpanded || changes.length <= 3) && (
              <ul className="mt-3 space-y-2 border-t-2 border-white/40 pt-3">
                {changes.map((c, i) => (
                  <li key={`${c.package_name}-${c.ecosystem}-${c.owner}-${c.repo}-${i}`} className="text-[11px] font-mono">
                    <span className="font-black">{c.package_name}</span>
                    <span className="opacity-80"> ({c.ecosystem})</span>
                    <span className="opacity-80"> &mdash; {c.owner}/{c.repo}: </span>
                    <span className="font-black">{c.prev_label}</span>
                    <span className="opacity-80"> &rarr; </span>
                    <span className="font-black">{c.new_label}</span>
                    <span className="opacity-80"> &middot; {formatRelative(c.scanned_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Watchlist load error */}
        {watchedError && (
          <div className="bg-soy-red text-white border-2 border-soy-bottle p-3 mb-4 text-[10px] font-black uppercase tracking-widest">
            {watchedError}
          </div>
        )}

        {watchedLoading && watched === null ? (
          <p className="text-xs font-black uppercase tracking-widest opacity-60 text-center py-8">LOADING WATCHLIST...</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            {/* Add form */}
            <section className="lg:col-span-2 bg-white border-4 border-soy-bottle p-6 shadow-[8px_8px_0px_#000]">
              <h3 className="text-xl font-black uppercase italic tracking-tighter mb-4 flex items-center gap-2">
                <Plus size={20} /> Watch a package
              </h3>
              <form onSubmit={handleWatchAdd} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest mb-1">Package name</label>
                  <input
                    type="text"
                    value={watchPkgName}
                    onChange={e => setWatchPkgName(e.target.value)}
                    placeholder="react"
                    className="w-full border-2 border-soy-bottle bg-soy-label/10 px-3 py-2 text-xs font-mono focus:outline-none focus:bg-white"
                    maxLength={214}
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest mb-1">Ecosystem</label>
                  <select
                    value={watchEcosystem}
                    onChange={e => setWatchEcosystem(e.target.value as typeof ECOSYSTEMS[number])}
                    className="w-full border-2 border-soy-bottle bg-soy-label/10 px-3 py-2 text-xs font-mono focus:outline-none focus:bg-white"
                  >
                    {ECOSYSTEMS.map(eco => <option key={eco} value={eco}>{eco}</option>)}
                  </select>
                </div>
                {watchAddError && (
                  <div className="bg-soy-red text-white border-2 border-soy-bottle p-3 text-[10px] font-black uppercase tracking-widest flex items-start gap-2">
                    <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" /> {watchAddError}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={watchAdding}
                  className="w-full bg-soy-red text-white py-3 text-xs font-black uppercase tracking-widest hover:bg-soy-bottle transition-all disabled:opacity-50 border-2 border-soy-bottle"
                >
                  {watchAdding ? 'ADDING...' : 'ADD TO WATCHLIST'}
                </button>
              </form>
            </section>

            {/* List */}
            <section className="lg:col-span-3 bg-white border-4 border-soy-bottle p-6 shadow-[8px_8px_0px_#000]">
              <h3 className="text-xl font-black uppercase italic tracking-tighter mb-4">Your watchlist</h3>
              {(watched === null || watched.length === 0) && changes.length === 0 ? (
                <div className="bg-soy-label/20 border-2 border-soy-bottle p-6">
                  <p className="text-xs font-bold uppercase tracking-widest opacity-70 leading-relaxed">
                    YOU&apos;RE NOT WATCHING ANY PACKAGES YET. ADD A PACKAGE TO THE LEFT TO GET
                    NOTIFICATIONS WHEN ITS VERDICT DEGRADES ON ANY OF YOUR GUARD-INSTALLED REPOS.
                  </p>
                </div>
              ) : watched && watched.length === 0 ? (
                <div className="bg-soy-label/20 border-2 border-soy-bottle p-6">
                  <p className="text-xs font-bold uppercase tracking-widest opacity-70">
                    NO PACKAGES WATCHED.
                  </p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {(watched || []).map(w => (
                    <li key={w.id} className="border-2 border-soy-bottle p-4 bg-white">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-sm font-black uppercase tracking-widest break-all">{w.package_name}</span>
                            <span className="text-[9px] font-bold uppercase tracking-widest bg-soy-label/40 px-1.5 py-0.5">
                              {w.ecosystem}
                            </span>
                          </div>
                          <p className="text-[9px] font-black uppercase tracking-widest opacity-60">
                            Added {formatRelative(w.created_at)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleUnwatch(w.id)}
                          className="flex items-center gap-1 border-2 border-soy-bottle px-3 py-1.5 text-[10px] font-black uppercase tracking-widest hover:bg-soy-red hover:text-white hover:border-soy-red transition-colors flex-shrink-0"
                        >
                          <Trash2 size={12} /> Unwatch
                        </button>
                      </div>
                      {w.verdicts.length === 0 ? (
                        <div className="border-t-2 border-dashed border-soy-bottle/30 pt-3 mt-2">
                          <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 leading-relaxed">
                            NO SCANS YET &mdash; THIS PACKAGE HASN&apos;T BEEN SEEN IN ANY OF YOUR GUARD
                            RUNS. TRIGGER A PR ON A REPO THAT INCLUDES IT.
                          </p>
                        </div>
                      ) : (
                        <div className="border-t-2 border-dashed border-soy-bottle/30 pt-3 mt-2">
                          <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2">
                            Current verdicts across your repos:
                          </p>
                          <ul className="space-y-1.5">
                            {w.verdicts.map(v => (
                              <li
                                key={`${v.owner}/${v.repo}`}
                                className="flex items-center justify-between gap-2 text-[11px] font-mono flex-wrap"
                              >
                                <span className="font-black truncate">{v.owner}/{v.repo}</span>
                                <span className="flex items-center gap-2 flex-shrink-0">
                                  <VerdictChip label={v.label} />
                                  <span className="opacity-60 text-[10px]">{formatRelative(v.scanned_at)}</span>
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </section>
    </div>
  );
}
