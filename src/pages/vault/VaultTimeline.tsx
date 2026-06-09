// /vault/:slug/timeline — Vault Timeline read view.
//
// PR-V2-E. Renders the workspace's private Timeline events with the
// [PRIVATE] marker convention from PR-V1-E §5. Each event references
// private-anchor hrefs; the renderer treats them as inert text unless
// the consumer role can see the linked row (the server's masking already
// gates the underlying read).

import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { listTimeline, isOk, type VaultTimelineEvent } from '../../shared/vault/api-client';

type Phase = 'loading' | 'unauth' | 'notfound' | 'ready' | 'error';

const EVENT_LABELS: Record<string, string> = {
  exception_proposed: 'proposed',
  exception_approved: 'approved',
  exception_rejected: 'rejected',
  exception_revoked: 'revoked',
  exception_expired: 'expired',
  exception_extended: 'extended',
  private_evidence_captured: 'evidence captured',
  private_evidence_redacted: 'evidence redacted',
  workspace_created: 'workspace created',
  workspace_renamed: 'workspace renamed',
  workspace_soft_deleted: 'workspace deleted',
  workspace_owner_transferred: 'owner transferred',
  member_added: 'member added',
  member_promoted: 'member promoted',
  member_demoted: 'member demoted',
  member_suspended: 'member suspended',
  member_removed: 'member removed',
};

export default function VaultTimeline() {
  const { slug = '' } = useParams();
  const [phase, setPhase] = React.useState<Phase>('loading');
  const [events, setEvents] = React.useState<VaultTimelineEvent[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [error, setError] = React.useState('');
  const [loadingMore, setLoadingMore] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    if (!slug) return;
    setPhase('loading');
    (async () => {
      const res = await listTimeline(slug, { limit: 50 });
      if (cancelled) return;
      if (isOk(res)) {
        setEvents(res.data.events);
        setNextCursor(res.data.next_cursor);
        setPhase('ready');
        return;
      }
      if (res.status === 401) { setPhase('unauth'); return; }
      if (res.status === 404) { setPhase('notfound'); return; }
      setError(res.message);
      setPhase('error');
    })();
    return () => { cancelled = true; };
  }, [slug]);

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    const res = await listTimeline(slug, { limit: 50, cursor: nextCursor });
    setLoadingMore(false);
    if (!isOk(res)) {
      setError(res.message);
      return;
    }
    setEvents((prev) => [...prev, ...res.data.events]);
    setNextCursor(res.data.next_cursor);
  }

  if (phase === 'loading') return <p className="text-sm font-mono text-slate-400">Loading...</p>;
  if (phase === 'unauth') return <p className="text-sm font-mono text-slate-300">Sign in to view the Vault Timeline.</p>;
  if (phase === 'notfound') return <p className="text-sm font-mono text-slate-300">Workspace not found.</p>;
  if (phase === 'error') return <p className="text-sm font-mono text-red-300" role="alert">{error}</p>;

  return (
    <div>
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="text-xl font-mono font-bold tracking-tight">Vault Timeline</h1>
        <p className="text-xs font-mono text-slate-500">{events.length} loaded</p>
      </header>

      {events.length === 0 ? (
        <p className="text-sm font-mono text-slate-400 border border-slate-800 p-4">
          No events recorded yet.
        </p>
      ) : (
        <ol className="border border-slate-800 divide-y divide-slate-800">
          {events.map((ev) => (
            <li key={ev.event_id} className="px-4 py-3 hover:bg-slate-800/40">
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex items-baseline gap-3 min-w-0">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500 shrink-0">
                    [PRIVATE]
                  </span>
                  <span className="font-mono text-xs text-slate-400 shrink-0">
                    {ev.emitted_at.slice(0, 19).replace('T', ' ')}
                  </span>
                  <span className="font-mono text-xs text-slate-100 shrink-0">
                    {EVENT_LABELS[ev.event_type] || ev.event_type}
                  </span>
                </div>
                <span className="font-mono text-[10px] text-slate-500 shrink-0">
                  {ev.emitted_by ? `@${ev.emitted_by.github_login}` : '—'}
                </span>
              </div>
              <p className="mt-1 ml-[5.5rem] font-mono text-xs text-slate-300 break-words">
                {ev.summary}
              </p>
              {ev.subject_exception_id && (
                <p className="mt-1 ml-[5.5rem] text-[10px] font-mono">
                  <Link
                    to={`/vault/${slug}/exceptions/${ev.subject_exception_id}`}
                    className="text-slate-500 hover:text-slate-100 underline"
                  >
                    exception {ev.subject_exception_id.slice(0, 8)}
                  </Link>
                </p>
              )}
              {ev.subject_evidence_id && (
                <p className="mt-1 ml-[5.5rem] text-[10px] font-mono">
                  <Link
                    to={`/vault/${slug}/evidence/${ev.subject_evidence_id}`}
                    className="text-slate-500 hover:text-slate-100 underline"
                  >
                    evidence {ev.subject_evidence_id.slice(0, 8)}
                  </Link>
                </p>
              )}
            </li>
          ))}
        </ol>
      )}

      {nextCursor && (
        <p className="mt-4">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="px-3 py-1 text-xs font-mono border border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500 disabled:opacity-50"
          >
            {loadingMore ? 'loading...' : 'load more'}
          </button>
        </p>
      )}
    </div>
  );
}
