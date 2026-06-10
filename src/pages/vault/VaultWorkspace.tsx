// /vault/:slug — workspace home.
//
// PR-V2-E. Shows the workspace metadata, the member list, and quick
// links into the exception list and timeline.

import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchWorkspace, isOk, type VaultWorkspaceDetail } from '../../shared/vault/api-client';
import VaultAuthGate from '../../components/VaultAuthGate';

type Phase = 'loading' | 'unauth' | 'notfound' | 'ready' | 'error';

export default function VaultWorkspace() {
  const { slug = '' } = useParams();
  const [phase, setPhase] = React.useState<Phase>('loading');
  const [detail, setDetail] = React.useState<VaultWorkspaceDetail | null>(null);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    let cancelled = false;
    if (!slug) return;
    (async () => {
      const res = await fetchWorkspace(slug);
      if (cancelled) return;
      if (isOk(res)) {
        setDetail(res.data);
        setPhase('ready');
        return;
      }
      if (res.status === 401) {
        setPhase('unauth');
        return;
      }
      if (res.status === 404) {
        setPhase('notfound');
        return;
      }
      setError(res.message);
      setPhase('error');
    })();
    return () => { cancelled = true; };
  }, [slug]);

  if (phase === 'loading') return <p className="text-sm font-mono text-slate-400">Loading...</p>;
  if (phase === 'unauth') return <VaultAuthGate message="Sign in to view this workspace. You'll land back here." />;
  if (phase === 'notfound') {
    return (
      <div className="border border-slate-700 bg-slate-800/40 p-5">
        <p className="text-sm text-slate-300">
          Workspace not found, or you are not a member.
        </p>
        <p className="mt-3 text-xs font-mono">
          <Link to="/vault" className="text-slate-400 hover:text-slate-100">← back to workspaces</Link>
        </p>
      </div>
    );
  }
  if (phase === 'error') return <p className="text-sm font-mono text-red-300" role="alert">{error}</p>;
  if (!detail) return null;

  return (
    <div>
      <header className="mb-6 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-xl font-mono font-bold tracking-tight">{detail.display_name}</h1>
          <p className="text-xs font-mono text-slate-400 mt-1">
            /{detail.slug}
            <span className="ml-3 px-2 py-0.5 border border-slate-700 uppercase tracking-wider">
              {detail.membership.role}
            </span>
          </p>
        </div>
      </header>

      <section className="mb-8">
        <h2 className="text-sm font-mono font-bold mb-3 uppercase tracking-wider text-slate-400">Quick actions</h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
          <li>
            <Link
              to={`/vault/${detail.slug}/exceptions`}
              className="block border border-slate-700 hover:border-slate-500 bg-slate-800/40 p-4"
            >
              <span className="block font-mono text-sm text-slate-100">Trust Expiry</span>
              <span className="block font-mono text-xs text-slate-400 mt-1">View active exceptions and review queue</span>
            </Link>
          </li>
          <li>
            <Link
              to={`/vault/${detail.slug}/timeline`}
              className="block border border-slate-700 hover:border-slate-500 bg-slate-800/40 p-4"
            >
              <span className="block font-mono text-sm text-slate-100">Vault Timeline</span>
              <span className="block font-mono text-xs text-slate-400 mt-1">Workspace audit history (private)</span>
            </Link>
          </li>
          <li>
            <Link
              to={`/vault/${detail.slug}/exposures`}
              className="block border border-slate-700 hover:border-slate-500 bg-slate-800/40 p-4"
            >
              <span className="block font-mono text-sm text-slate-100">Component Exposures</span>
              <span className="block font-mono text-xs text-slate-400 mt-1">Recorded component exposure records (private)</span>
            </Link>
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-sm font-mono font-bold mb-3 uppercase tracking-wider text-slate-400">Members</h2>
        <ul className="divide-y divide-slate-800 border border-slate-800 max-w-xl">
          {detail.members.map((m) => (
            <li key={`${m.github_login}-${m.added_at}`} className="flex items-center justify-between px-3 py-2">
              <span className="font-mono text-sm">@{m.github_login}</span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400 border border-slate-700 px-2 py-0.5">
                {m.role}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
