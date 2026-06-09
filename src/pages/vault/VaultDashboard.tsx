// /vault — Vault Dashboard landing page.
//
// PR-V2-E. Lists the workspaces the signed-in user is a member of and
// invites the unsigned visitor to log in. The Layout is intentionally
// minimal — Vault-only chrome, no public-spine nav.

import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchVaultMe, isOk, type VaultUser, type VaultWorkspaceSummary } from '../../shared/vault/api-client';

type Phase = 'loading' | 'unauth' | 'ready' | 'error';

export default function VaultDashboard() {
  const navigate = useNavigate();
  const [phase, setPhase] = React.useState<Phase>('loading');
  const [user, setUser] = React.useState<VaultUser | null>(null);
  const [workspaces, setWorkspaces] = React.useState<VaultWorkspaceSummary[]>([]);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const me = await fetchVaultMe();
      if (cancelled) return;
      if (isOk(me)) {
        setUser(me.data.user);
        setWorkspaces(me.data.workspaces);
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

  function handleLoginRedirect() {
    window.location.href = `/api/vault/auth/login?redirect_to=${encodeURIComponent('/vault')}`;
  }

  if (phase === 'loading') {
    return <p className="text-sm font-mono text-slate-400">Loading...</p>;
  }
  if (phase === 'unauth') {
    return (
      <div className="border border-slate-700 bg-slate-800/40 p-5 max-w-lg">
        <h2 className="text-sm font-mono font-bold mb-2">Sign in required</h2>
        <p className="text-sm text-slate-400 mb-4">
          The Vault Dashboard is private. Sign in once to view the workspaces you
          belong to.
        </p>
        <button
          type="button"
          onClick={handleLoginRedirect}
          className="px-4 py-2 text-sm font-mono bg-slate-100 text-slate-900 hover:bg-white"
        >
          Sign in with GitHub
        </button>
      </div>
    );
  }
  if (phase === 'error') {
    return <p className="text-sm font-mono text-red-300" role="alert">{error}</p>;
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-xl font-mono font-bold tracking-tight">Workspaces</h1>
        <p className="text-xs font-mono text-slate-400 mt-1">
          Signed in as <span className="text-slate-100">@{user?.github_login}</span>
        </p>
      </header>
      {workspaces.length === 0 ? (
        <div className="border border-slate-700 bg-slate-800/40 p-5">
          <p className="text-sm text-slate-300">
            You are not a member of any workspaces yet. Ask a workspace owner to
            invite you, or contact your administrator.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-800 border border-slate-800">
          {workspaces.map((w) => (
            <li key={w.workspace_id}>
              <button
                type="button"
                onClick={() => navigate(`/vault/${encodeURIComponent(w.slug)}`)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-800/60"
              >
                <span className="flex flex-col">
                  <span className="font-mono text-sm text-slate-100">{w.display_name}</span>
                  <span className="font-mono text-xs text-slate-500">/{w.slug}</span>
                </span>
                <span className="font-mono text-[10px] uppercase tracking-wider border border-slate-700 px-2 py-0.5 text-slate-300">
                  {w.role}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 text-xs font-mono text-slate-500">
        <Link to="/cli-auth" className="hover:text-slate-100">
          Authorize a CLI session
        </Link>
      </p>
    </div>
  );
}
