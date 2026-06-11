// /vault/:slug/exceptions — Trust Expiry table.
//
// PR-V2-E. The dashboard's primary read surface. Columns:
//   state | original→allowed | subject | reviewer | expires_at | id
//
// Sorted with active+soon-to-expire at top; expired/revoked grouped at
// the bottom. The "control room, not vulnerability table" doctrine from
// the parking-lot doc applies — dense, mono, no marketing copy.

import React from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  listExceptions,
  isOk,
  type VaultException,
} from '../../shared/vault/api-client';
import VaultAuthGate from '../../components/VaultAuthGate';

type Phase = 'loading' | 'unauth' | 'notfound' | 'ready' | 'error';

const STATE_FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: 'all' },
  { value: 'active', label: 'active' },
  { value: 'proposed', label: 'proposed' },
  { value: 'rejected', label: 'rejected' },
  { value: 'revoked', label: 'revoked' },
  { value: 'expired', label: 'expired' },
];

function stateClass(state: string): string {
  if (state === 'active') return 'text-emerald-300';
  if (state === 'proposed') return 'text-amber-300';
  if (state === 'rejected') return 'text-slate-400';
  if (state === 'revoked') return 'text-red-300';
  if (state === 'expired') return 'text-slate-500';
  return 'text-slate-300';
}

function expiryUrgency(state: string, expiresAt: string | null): { label: string; class: string } {
  // PR-DOGFOOD-1: ramp the label by remaining time. The old version
  // floored to "days" which collapsed any sub-24h expiry to "0d ⚠"
  // and hid the fact that an exception was hours away from expiring.
  if (!expiresAt) return { label: '—', class: 'text-slate-500' };
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms < 0) {
    // PR-16A review pressure: an exception past its window is not quiet.
    // Still-active means the reaper has not yet observed it — that is the
    // loudest state on the board: temporary trust outliving its window.
    if (state === 'active') return { label: 'review due ⚠', class: 'text-red-300' };
    return { label: 'elapsed', class: 'text-slate-500' };
  }
  const hours = ms / (60 * 60 * 1000);
  if (hours < 1) {
    const minutes = Math.max(1, Math.floor(ms / (60 * 1000)));
    return { label: `${minutes}m ⚠`, class: 'text-red-300' };
  }
  if (hours < 24) {
    return { label: `${Math.floor(hours)}h ⚠`, class: 'text-red-300' };
  }
  const days = Math.floor(hours / 24);
  if (days <= 3) return { label: `${days}d ⚠`, class: 'text-red-300' };
  if (days <= 14) return { label: `${days}d`, class: 'text-amber-300' };
  return { label: `${days}d`, class: 'text-slate-300' };
}

const PAGE_SIZE = 50;

export default function VaultExceptionList() {
  const { slug = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [phase, setPhase] = React.useState<Phase>('loading');
  const [items, setItems] = React.useState<VaultException[]>([]);
  const [error, setError] = React.useState('');
  const [total, setTotal] = React.useState(0);
  const [maskedFields, setMaskedFields] = React.useState<string[]>([]);
  const [loadingMore, setLoadingMore] = React.useState(false);

  const stateFilter = searchParams.get('state') || '';

  React.useEffect(() => {
    // PR-DOGFOOD-1: initial load takes a PAGE_SIZE-sized slice. The
    // Load More button below pages through with offset, exposing
    // exceptions beyond the first page (#101+ used to be invisible).
    let cancelled = false;
    if (!slug) return;
    setPhase('loading');
    setError('');
    (async () => {
      const res = await listExceptions(slug, {
        state: stateFilter || undefined,
        limit: PAGE_SIZE,
        offset: 0,
      });
      if (cancelled) return;
      if (isOk(res)) {
        setItems(res.data.exceptions);
        setTotal(res.data.total_count_estimate);
        setMaskedFields(res.maskedFields);
        setPhase('ready');
        return;
      }
      if (res.status === 401) { setPhase('unauth'); return; }
      if (res.status === 404) { setPhase('notfound'); return; }
      setError(res.message);
      setPhase('error');
    })();
    return () => { cancelled = true; };
  }, [slug, stateFilter]);

  async function loadMore() {
    setLoadingMore(true);
    setError('');
    const res = await listExceptions(slug, {
      state: stateFilter || undefined,
      limit: PAGE_SIZE,
      offset: items.length,
    });
    setLoadingMore(false);
    if (!isOk(res)) {
      setError(res.message);
      return;
    }
    setItems((prev) => [...prev, ...res.data.exceptions]);
    setTotal(res.data.total_count_estimate);
  }

  function setFilter(value: string) {
    const params = new URLSearchParams(searchParams);
    if (value) params.set('state', value); else params.delete('state');
    setSearchParams(params, { replace: true });
  }

  if (phase === 'loading') return <p className="text-sm font-mono text-slate-400">Loading...</p>;
  if (phase === 'unauth') return <VaultAuthGate message="Sign in to view exceptions. You'll land back here." />;
  if (phase === 'notfound') return <p className="text-sm font-mono text-slate-300">Workspace not found.</p>;
  if (phase === 'error') return <p className="text-sm font-mono text-red-300" role="alert">{error}</p>;

  const hasMore = total > items.length;

  return (
    <div>
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="text-xl font-mono font-bold tracking-tight">Trust Expiry</h1>
        <p className="text-xs font-mono text-slate-500">{total} total</p>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        {STATE_FILTERS.map((f) => (
          <button
            key={f.value || 'all'}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1 text-xs font-mono border ${
              stateFilter === f.value
                ? 'border-slate-400 bg-slate-100 text-slate-900'
                : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {maskedFields.length > 0 && (
        <p className="mb-3 text-xs font-mono text-slate-500">
          fields masked by role: {maskedFields.join(', ')}
        </p>
      )}

      {items.length === 0 ? (
        <p className="text-sm font-mono text-slate-400 border border-slate-800 p-4">
          No exceptions on record{stateFilter ? ` with state=${stateFilter}` : ''}.
        </p>
      ) : (
        <div className="overflow-x-auto border border-slate-800">
          <table className="min-w-full text-xs font-mono">
            <thead className="bg-slate-900 border-b border-slate-800">
              <tr>
                <th className="text-left px-3 py-2 uppercase tracking-wider text-slate-400">state</th>
                <th className="text-left px-3 py-2 uppercase tracking-wider text-slate-400">action</th>
                <th className="text-left px-3 py-2 uppercase tracking-wider text-slate-400">subject</th>
                <th className="text-left px-3 py-2 uppercase tracking-wider text-slate-400">reviewer</th>
                <th className="text-left px-3 py-2 uppercase tracking-wider text-slate-400">expires</th>
                <th className="text-left px-3 py-2 uppercase tracking-wider text-slate-400">id</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {items.map((ex) => {
                const urgency = expiryUrgency(ex.state, ex.expires_at);
                return (
                  <tr key={ex.exception_id} className="hover:bg-slate-800/40">
                    <td className={`px-3 py-2 ${stateClass(ex.state)}`}>{ex.state}</td>
                    <td className="px-3 py-2 text-slate-300">{ex.original_action}→{ex.allowed_action}</td>
                    <td className="px-3 py-2 text-slate-100">
                      <span className="text-slate-500 mr-1">{ex.subject_kind === 'package' ? 'pkg' : 'repo'}</span>
                      {ex.subject_name}
                    </td>
                    <td className="px-3 py-2 text-slate-400">{ex.reviewed_by ? '✓' : '—'}</td>
                    <td className={`px-3 py-2 ${urgency.class}`}>{urgency.label}</td>
                    <td className="px-3 py-2">
                      <Link
                        to={`/vault/${slug}/exceptions/${encodeURIComponent(ex.exception_id)}`}
                        className="text-slate-400 hover:text-slate-100 underline"
                      >
                        {ex.exception_id.slice(0, 8)}
                      </Link>
                    </td>
                  </tr>
                );
              })}
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
