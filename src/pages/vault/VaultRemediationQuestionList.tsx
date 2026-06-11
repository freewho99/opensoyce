// /vault/:slug/remediation-questions — Remediation Question Loop list
// surface (PR-15B).
//
// READ-ONLY list. A remediation question is the QUESTION LAYER on observed
// component risk: the scanner observes, intelligence adds context, the
// system asks, the human decides, the record remembers. This page only
// consumes the list GET endpoint — questions are opened from the exposure
// detail page, and answered on the question detail page.

import React from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  listRemediationQuestions,
  isOk,
  type RemediationQuestion,
  type RemediationQuestionStatus,
} from '../../shared/vault/api-client';
import VaultAuthGate from '../../components/VaultAuthGate';

type Phase = 'loading' | 'unauth' | 'notfound' | 'ready' | 'error';

const STATUS_FILTERS: Array<{ value: '' | RemediationQuestionStatus; label: string }> = [
  { value: '', label: 'all' },
  { value: 'open', label: 'open' },
  { value: 'answered', label: 'answered' },
  { value: 'cancelled', label: 'cancelled' },
];

function statusClass(status: string): string {
  if (status === 'open') return 'text-amber-300';
  if (status === 'answered') return 'text-emerald-300';
  if (status === 'cancelled') return 'text-slate-500';
  return 'text-slate-300';
}

export function outcomeLabel(outcome: string): string {
  return outcome.replace(/_/g, ' ');
}

const PAGE_SIZE = 50;

export default function VaultRemediationQuestionList() {
  const { slug = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [phase, setPhase] = React.useState<Phase>('loading');
  const [items, setItems] = React.useState<RemediationQuestion[]>([]);
  const [total, setTotal] = React.useState(0);
  const [error, setError] = React.useState('');
  const [loadingMore, setLoadingMore] = React.useState(false);

  const statusFilter = (searchParams.get('status') || '') as '' | RemediationQuestionStatus;

  React.useEffect(() => {
    let cancelled = false;
    if (!slug) return;
    setPhase('loading');
    setError('');
    (async () => {
      const res = await listRemediationQuestions(slug, {
        status: statusFilter || undefined,
        limit: PAGE_SIZE,
        offset: 0,
      });
      if (cancelled) return;
      if (isOk(res)) {
        setItems(res.data.questions);
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
    const res = await listRemediationQuestions(slug, {
      status: statusFilter || undefined,
      limit: PAGE_SIZE,
      offset: items.length,
    });
    setLoadingMore(false);
    if (!isOk(res)) {
      setError(res.message);
      return;
    }
    setItems((prev) => [...prev, ...res.data.questions]);
    setTotal(res.data.total_count_estimate);
  }

  function setFilter(value: string) {
    const params = new URLSearchParams(searchParams);
    if (value) params.set('status', value); else params.delete('status');
    setSearchParams(params, { replace: true });
  }

  if (phase === 'loading') return <p className="text-sm font-mono text-slate-400">Loading...</p>;
  if (phase === 'unauth') return <VaultAuthGate message="Sign in to view remediation questions. You'll land back here." />;
  if (phase === 'notfound') return <p className="text-sm font-mono text-slate-300">Workspace not found.</p>;
  if (phase === 'error') return <p className="text-sm font-mono text-red-300" role="alert">{error}</p>;

  const hasMore = total > items.length;

  return (
    <div>
      <header className="mb-2 flex items-baseline justify-between">
        <h1 className="text-xl font-mono font-bold tracking-tight">Remediation Questions</h1>
        <p className="text-xs font-mono text-slate-500">{total} total</p>
      </header>
      <p className="mb-4 text-xs font-mono text-slate-500">
        [PRIVATE] A remediation question turns observed component risk into a
        reviewable operational question. The system asks; the human decides;
        the record remembers. A question is not a decision.
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
          No remediation questions on record{statusFilter ? ` with status=${statusFilter}` : ''}.
          Questions are opened from a component exposure&apos;s detail page.
        </p>
      ) : (
        <div className="overflow-x-auto border border-slate-800">
          <table className="min-w-full text-xs font-mono">
            <thead className="bg-slate-900 border-b border-slate-800">
              <tr>
                <th className="text-left px-3 py-2 uppercase tracking-wider text-slate-400">package</th>
                <th className="text-left px-3 py-2 uppercase tracking-wider text-slate-400">vulnerability</th>
                <th className="text-left px-3 py-2 uppercase tracking-wider text-slate-400">kind</th>
                <th className="text-left px-3 py-2 uppercase tracking-wider text-slate-400">status</th>
                <th className="text-left px-3 py-2 uppercase tracking-wider text-slate-400">outcome</th>
                <th className="text-left px-3 py-2 uppercase tracking-wider text-slate-400">opened</th>
                <th className="text-left px-3 py-2 uppercase tracking-wider text-slate-400">id</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {items.map((q) => (
                <tr key={q.question_id} className="hover:bg-slate-800/40">
                  <td className="px-3 py-2 text-slate-100">
                    {q.package_name}{q.observed_version ? <span className="text-slate-500">@{q.observed_version}</span> : null}
                  </td>
                  <td className="px-3 py-2 text-slate-300">{q.vuln_id || '—'}</td>
                  <td className="px-3 py-2 text-slate-400">{q.question_kind.replace(/_/g, ' ')}</td>
                  <td className={`px-3 py-2 ${statusClass(q.status)}`}>{q.status}</td>
                  <td className="px-3 py-2 text-slate-300">
                    {q.selected_outcome ? outcomeLabel(q.selected_outcome) : '—'}
                  </td>
                  <td className="px-3 py-2 text-slate-400">{q.created_at.slice(0, 10)}</td>
                  <td className="px-3 py-2">
                    <Link
                      to={`/vault/${slug}/remediation-questions/${encodeURIComponent(q.question_id)}`}
                      className="text-slate-400 hover:text-slate-100 underline"
                    >
                      {q.question_id.slice(0, 8)}
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
