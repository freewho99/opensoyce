// /cli-auth — browser approval page for the PR-V2-D device-code flow.
//
// PR-V2-E. Per PR-V1-E §1.1 step 5.
//
// Flow:
//   1. CLI's `opensoyce login` prints a verification URI + user code.
//   2. The user opens this page in a browser.
//   3. If not logged in, the page redirects to the Vault OAuth flow with
//      a return-to-here parameter so the user can sign in once and come
//      straight back to enter the code.
//   4. The user enters the displayed code and submits.
//   5. The page POSTs to /api/vault/cli/approve (requires session + CSRF;
//      the api-client handles both transparently).
//   6. On success, the CLI's next poll mints a vault_sessions row and
//      returns the session token.
//
// IMPORTANT scope boundary: this is the ONLY browser-side surface the
// device-code flow needs. It is intentionally a single small form, not
// the start of a Dashboard. The Vault Dashboard (/vault) is a separate
// route family — clicking around between them is fine but they do not
// share state.

import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchVaultMe, approveCliCode } from '../shared/vault/api-client';

type Phase = 'loading' | 'unauth' | 'ready' | 'submitting' | 'approved' | 'error';

const USER_CODE_RE = /^[A-Z2-9]{4}-?[A-Z2-9]{4}$/;

export default function CliAuth() {
  const [searchParams] = useSearchParams();
  const initialCode = (searchParams.get('user_code') || '').toUpperCase();
  const [phase, setPhase] = React.useState<Phase>('loading');
  const [userCode, setUserCode] = React.useState(initialCode);
  const [error, setError] = React.useState<string>('');
  const [user, setUser] = React.useState<{ github_login: string } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const me = await fetchVaultMe();
      if (cancelled) return;
      if (me.ok === true) {
        setUser({ github_login: me.data.user.github_login });
        setPhase('ready');
        return;
      }
      if (me.status === 401) {
        setPhase('unauth');
        return;
      }
      setError(me.message);
      setPhase('error');
    })();
    return () => { cancelled = true; };
  }, []);

  function normalisedCode(raw: string): string {
    // Accept "XXXXXXXX" or "XXXX-XXXX"; always send the hyphenated form.
    const upper = raw.trim().toUpperCase().replace(/\s+/g, '');
    if (/^[A-Z2-9]{8}$/.test(upper)) return `${upper.slice(0, 4)}-${upper.slice(4)}`;
    return upper;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const code = normalisedCode(userCode);
    if (!USER_CODE_RE.test(code)) {
      setError('Code must be 8 characters in the format XXXX-XXXX (letters and digits 2-9).');
      return;
    }
    setPhase('submitting');
    const res = await approveCliCode(code);
    if (res.ok === true) {
      setPhase('approved');
      return;
    }
    if (res.errorCode === 'device-code-expired') {
      setError('This code has expired. Restart `opensoyce login` to get a new one.');
    } else if (res.errorCode === 'device-code-invalid') {
      setError('Code not recognised. Double-check it on the terminal that displayed it.');
    } else {
      setError(res.message);
    }
    setPhase('ready');
  }

  function handleLoginRedirect() {
    // Stash where to come back to. The OAuth callback URL is the
    // public-spine /api/vault/auth/login route, which redirects to a
    // configured post-login URL. We pass our path as the return target.
    const returnTo = `/cli-auth${userCode ? `?user_code=${encodeURIComponent(userCode)}` : ''}`;
    window.location.href = `/api/vault/auth/login?redirect_to=${encodeURIComponent(returnTo)}`;
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex items-start justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <Link to="/" className="text-xs font-mono text-slate-400 hover:text-slate-100">opensoyce</Link>
            <span className="px-2 py-0.5 text-[10px] font-mono uppercase border border-slate-700 text-slate-400">
              PRIVATE
            </span>
          </div>
          <h1 className="text-2xl font-mono font-bold tracking-tight">Authorize CLI session</h1>
          <p className="mt-2 text-sm text-slate-400">
            Enter the code shown by <code className="font-mono text-slate-200">opensoyce login</code>.
            This page is the second step of the device-code flow; after you
            confirm here, the CLI receives a session token on its next poll.
          </p>
        </header>

        {phase === 'loading' && (
          <p className="text-sm font-mono text-slate-400">Checking session...</p>
        )}

        {phase === 'unauth' && (
          <div className="border border-slate-700 bg-slate-800/40 p-5">
            <h2 className="text-sm font-mono font-bold mb-2">Sign in required</h2>
            <p className="text-sm text-slate-400 mb-4">
              The CLI authorization page is private — sign in once to authorize the
              CLI session. You will land back here.
            </p>
            <button
              type="button"
              onClick={handleLoginRedirect}
              className="px-4 py-2 text-sm font-mono bg-slate-100 text-slate-900 hover:bg-white"
            >
              Sign in with GitHub
            </button>
          </div>
        )}

        {(phase === 'ready' || phase === 'submitting') && user && (
          <form onSubmit={handleSubmit} className="border border-slate-700 bg-slate-800/40 p-5 space-y-4">
            <p className="text-xs font-mono text-slate-400">
              Signed in as <span className="text-slate-100">@{user.github_login}</span>.
            </p>
            <label className="block">
              <span className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">
                Device code
              </span>
              <input
                type="text"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                value={userCode}
                onChange={(e) => setUserCode(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX"
                className="w-full bg-slate-900 border border-slate-700 px-3 py-2 font-mono text-lg tracking-widest text-slate-100 focus:outline-none focus:border-slate-400"
                disabled={phase === 'submitting'}
                aria-label="Device code"
              />
            </label>
            {error && (
              <p className="text-xs font-mono text-red-300" role="alert">{error}</p>
            )}
            <button
              type="submit"
              disabled={phase === 'submitting'}
              className="px-4 py-2 text-sm font-mono bg-slate-100 text-slate-900 hover:bg-white disabled:opacity-50"
            >
              {phase === 'submitting' ? 'Approving...' : 'Authorize CLI'}
            </button>
          </form>
        )}

        {phase === 'approved' && (
          <div className="border border-emerald-700 bg-emerald-900/30 p-5">
            <h2 className="text-sm font-mono font-bold text-emerald-200 mb-2">CLI authorized</h2>
            <p className="text-sm text-emerald-100/80">
              Return to your terminal. The CLI&apos;s next poll will receive a
              session token and write <code className="font-mono">~/.opensoyce/session.json</code>.
            </p>
            <p className="mt-4 text-xs font-mono">
              <Link to="/vault" className="text-emerald-200 underline hover:text-white">
                Open the Vault Dashboard
              </Link>
            </p>
          </div>
        )}

        {phase === 'error' && (
          <div className="border border-red-700 bg-red-900/30 p-5">
            <h2 className="text-sm font-mono font-bold text-red-200 mb-2">Could not load</h2>
            <p className="text-sm text-red-100/80">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
