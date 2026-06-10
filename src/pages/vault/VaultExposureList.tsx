// /vault/:slug/exposures — Component Exposure Intelligence read surface (PR-6B).
//
// READ-ONLY. Lists the workspace's private component exposures recorded by
// the PR-6A foundation. There is NO create button, NO "propose exception"
// action, NO ingestion hook — an exposure is an observation, not a trust
// decision. This page only consumes the existing PR-6A GET endpoints.
//
// Doctrine surfaced in the UI: every row is marked [PRIVATE]. Exposure is
// not an exception, not evidence, not policy.

import React from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  listExposures,
  isOk,
  type ComponentExposure,
} from '../../shared/vault/api-client';
import VaultAuthGate from '../../components/VaultAuthGate';

type Phase = 'loading' | 'unauth' | 'notfound' | 'ready' | 'error';

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: 'all' },
  { value: 'observed', label: 'observed' },
  { value: 'review_required', label: 'review required' },
  { value: 'allowed', label: 'allowed' },
  { value: 'blocked', label: 'blocked' },
  { value: 'excepted', label: 'excepted' },
  { value: 'resolved', label: 'resolved' },
];

function statusClass(status: string): string {
  if (status === 'observed') return 'text-slate-300';
  if (status === 'review_required') return 'text-amber-300';
  if (status === 'allowed') return 'text-emerald-300';
  if (status === 'blocked') return 'text-red-300';
  if (status === 'excepted') return 'text-sky-300';
  if (status === 'resolved') return 'text-slate-500';
  return 'text-slate-300';
}

const PAGE_SIZE = 50;

export default function VaultExposureList() {
  const { slug = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [phase, setPhase] = React.useState<Phase>('loading');
  const [items, setItems] = React.useState<ComponentExposure[]>([]);
  const [total, setTotal] = React.useState(0);
  const [error, setError] = React.useState('');
  const [loadingMore, setLoadingMore] = React.useState(false);

  const statusFilter = searchParams.get('status') || '';

  React.useEffect(() => {
    let cancelled = false;
    if (!slug) return;
    setPhase('loading');
    setError('');
    (async () => {
      const res = await listExposures(slug, {
        status: statusFilter || undefined,
        limit: PAGE_SIZE,
        offset: 0,
      });
      if (cancelled) return;
      if (isOk(res)) {
        setItems(res.data.exposures);
        setTotal(res.data.total_count_estimate);
        setPhase('ready');
        return;
      }
      if (res.status === 401) { setPhase('unauth'); return; }
      if (res.status === 404) { setPhase('notfound'); return; }
      setError(res.message);
      setPhase('error');
    })();
    return () => { cancelled = true; };
  }, [slug, statusFilter]);

  async function loadMore() {
    setLoadingMore(true);
    setError('');
    const res = await listExposures(slug, {
      status: statusFilter || undefined,
      limit: PAGE_SIZE,
      offset: items.length,
    });
    setLoadingMore(false);
    if (!isOk(res)) {
      setError(res.message);
      return;
    }
    setItems((prev) => [...prev, ...res.data.exposures]);
    setTotal(res.data.total_count_estimate);
  }

  function setFilter(value: string) {
    const params = new URLSearchParams(searchParams);
    if (value) params.set('status', value); else params.delete('status');
    setSearchParams(params, { replace: true });
  }

  if (phase === 'loading') return <p className="text-sm font-mono text-slate-400">Loading...</p>;
  if (phase === 'unauth') return <VaultAuthGate message="Sign in to view exposures. You'll land back here." />;
  if (phase === 'notfound') return <p className="text-sm font-mono text-slate-300">Workspace not found.</p>;
  if (phase === 'error') return <p className="text-sm font-mono text-red-300" role="alert">{error}</p>;

  const hasMore = total > items.length;

  return (
    <div>
      <header className="mb-2 flex items-baseline justify-between">
        <h1 className="text-xl font-mono font-bold tracking-tight">Component Exposures</h1>
        <p className="text-xs font-mono text-slate-500">{total} total</p>
      </header>
      <p className="mb-4 text-xs font-mono text-slate-500">
        [PRIVATE] An exposure records that a component exists or changed. It is
        not an exception, not evidence, not policy.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value || 'all'}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1 text-xs font-mono border ${
              statusFilter === f.value
                ? 'border-slate-400 bg-slate-100 text-slate-900'
                : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="text-sm font-mono text-slate-400 border border-slate-800 p-4">
          No exposures on record{statusFilter ? ` with status=${statusFilter}` : ''}.
        </p>
      ) : (
        <div className="overflow-x-auto border border-slate-800">
          <table className="min-w-full text-xs font-mono">
            <thead className="bg-slate-900 border-b border-slate-800">
              <tr>
                <th className="text-left px-3 py-2 uppercase tracking-wider text-slate-400">type</th>
                <th className="text-left px-3 py-2 uppercase tracking-wider text-slate-400">subject</th>
                <th className="text-left px-3 py-2 uppercase tracking-wider text-slate-400">status</th>
                <th className="text-left px-3 py-2 uppercase tracking-wider text-slate-400">source</th>
                <th className="text-left px-3 py-2 uppercase tracking-wider text-slate-400">last seen</th>
                <th className="text-left px-3 py-2 uppercase tracking-wider text-slate-400">id</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {items.map((ex) => (
                <tr key={ex.exposure_id} className="hover:bg-slate-800/40">
                  <td className="px-3 py-2 text-slate-300">{ex.exposure_type || '—'}</td>
                  <td className="px-3 py-2 text-slate-100">
                    <span className="text-slate-500 mr-1">{ex.subject_kind}</span>
                    {ex.subject_name}
                  </td>
                  <td className={`px-3 py-2 ${statusClass(ex.status)}`}>{ex.status}</td>
                  <td className="px-3 py-2 text-slate-400">
                    {ex.source_kind}{ex.source_ref ? `:${ex.source_ref}` : ''}
                  </td>
                  <td className="px-3 py-2 text-slate-400">{ex.last_seen_at.slice(0, 10)}</td>
                  <td className="px-3 py-2">
                    <Link
                      to={`/vault/${slug}/exposures/${encodeURIComponent(ex.exposure_id)}`}
                      className="text-slate-400 hover:text-slate-100 underline"
                    >
                      {ex.exposure_id.slice(0, 8)}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasMore && items.length > 0 && (
        <p className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="px-3 py-1 text-xs font-mono border border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500 disabled:opacity-50"
          >
            {loadingMore ? 'loading...' : 'load more'}
          </button>
          <span className="text-xs font-mono text-slate-500">
            showing {items.length} of {total}
          </span>
        </p>
      )}
    </div>
  );
}
