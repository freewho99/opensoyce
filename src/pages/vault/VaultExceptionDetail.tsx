// /vault/:slug/exceptions/:id — single exception with reviewer actions.
//
// PR-V2-E. Renders the full exception row + private-anchor references.
// Reviewer/owner roles see approve / reject / extend / revoke buttons
// gated by the row's current state. These buttons drive the existing
// PR-V2-B mutating endpoints — PR-V2-E adds NO new exception state
// machine semantics; the buttons just call the documented APIs.

import React from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getException,
  approveException,
  rejectException,
  extendException,
  revokeExceptionApi,
  fetchWorkspace,
  isOk,
  type VaultException,
  type VaultWorkspaceDetail,
} from '../../shared/vault/api-client';

type Phase = 'loading' | 'unauth' | 'notfound' | 'ready' | 'error';

function defaultExtension(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 30);
  return d.toISOString();
}

export default function VaultExceptionDetail() {
  const { slug = '', id = '' } = useParams();
  const [phase, setPhase] = React.useState<Phase>('loading');
  const [exception, setException] = React.useState<VaultException | null>(null);
  const [workspace, setWorkspace] = React.useState<VaultWorkspaceDetail | null>(null);
  const [error, setError] = React.useState('');
  const [actionError, setActionError] = React.useState('');
  const [actionPending, setActionPending] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState('');
  const [revokeReason, setRevokeReason] = React.useState('');
  const [extendIso, setExtendIso] = React.useState(defaultExtension());

  React.useEffect(() => {
    let cancelled = false;
    if (!slug || !id) return;
    (async () => {
      const [ws, ex] = await Promise.all([fetchWorkspace(slug), getException(slug, id)]);
      if (cancelled) return;
      if (!isOk(ws)) {
        if (ws.status === 401) { setPhase('unauth'); return; }
        if (ws.status === 404) { setPhase('notfound'); return; }
        setError(ws.message); setPhase('error'); return;
      }
      if (!isOk(ex)) {
        if (ex.status === 404) { setPhase('notfound'); return; }
        setError(ex.message); setPhase('error'); return;
      }
      setWorkspace(ws.data);
      setException(ex.data);
      setPhase('ready');
    })();
    return () => { cancelled = true; };
  }, [slug, id]);

  async function handleApprove() {
    setActionError(''); setActionPending(true);
    const res = await approveException(slug, id, { expires_at: defaultExtension() });
    setActionPending(false);
    if (!isOk(res)) { setActionError(res.message); return; }
    setException(res.data);
  }
  async function handleReject() {
    if (!rejectReason.trim()) { setActionError('Reason is required.'); return; }
    setActionError(''); setActionPending(true);
    const res = await rejectException(slug, id, { reason: rejectReason });
    setActionPending(false);
    if (!isOk(res)) { setActionError(res.message); return; }
    setException(res.data); setRejectReason('');
  }
  async function handleExtend() {
    if (!extendIso) { setActionError('expires_at is required.'); return; }
    setActionError(''); setActionPending(true);
    const res = await extendException(slug, id, { expires_at: extendIso });
    setActionPending(false);
    if (!isOk(res)) { setActionError(res.message); return; }
    setException(res.data);
  }
  async function handleRevoke() {
    if (!revokeReason.trim()) { setActionError('Revoke reason is required.'); return; }
    setActionError(''); setActionPending(true);
    const res = await revokeExceptionApi(slug, id, { revoke_reason: revokeReason });
    setActionPending(false);
    if (!isOk(res)) { setActionError(res.message); return; }
    setException(res.data); setRevokeReason('');
  }

  if (phase === 'loading') return <p className="text-sm font-mono text-slate-400">Loading...</p>;
  if (phase === 'unauth') return <p className="text-sm font-mono text-slate-300">Sign in to view this exception.</p>;
  if (phase === 'notfound') {
    return (
      <div className="border border-slate-700 bg-slate-800/40 p-5 max-w-xl">
        <p className="text-sm text-slate-300">Exception not found, or you are not a member of the workspace.</p>
        <p className="mt-3 text-xs font-mono">
          <Link to={`/vault/${slug}/exceptions`} className="text-slate-400 hover:text-slate-100">← back to exceptions</Link>
        </p>
      </div>
    );
  }
  if (phase === 'error') return <p className="text-sm font-mono text-red-300" role="alert">{error}</p>;
  if (!exception || !workspace) return null;

  const role = workspace.membership.role;
  const isReviewerOrOwner = role === 'reviewer' || role === 'owner';
  const isProposed = exception.state === 'proposed';
  const isActive = exception.state === 'active';

  return (
    <div className="max-w-3xl">
      <p className="mb-4 text-xs font-mono">
        <Link to={`/vault/${slug}/exceptions`} className="text-slate-400 hover:text-slate-100">← exceptions</Link>
      </p>

      <header className="mb-6">
        <h1 className="text-xl font-mono font-bold tracking-tight">
          {exception.subject_kind === 'package' ? 'pkg' : 'repo'} {exception.subject_name}
        </h1>
        <p className="text-xs font-mono text-slate-400 mt-1">
          {exception.state} · {exception.original_action}→{exception.allowed_action} ·
          proposed {exception.proposed_at.slice(0, 10)}
        </p>
      </header>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mb-8 text-sm">
        <div>
          <dt className="font-mono text-xs uppercase tracking-wider text-slate-500">expires_at</dt>
          <dd className="font-mono text-slate-100">{exception.expires_at || '—'}</dd>
        </div>
        <div>
          <dt className="font-mono text-xs uppercase tracking-wider text-slate-500">reviewer</dt>
          <dd className="font-mono text-slate-100">{exception.reviewed_by || '—'}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-mono text-xs uppercase tracking-wider text-slate-500">reason (public)</dt>
          <dd className="font-mono text-slate-100 whitespace-pre-wrap">{exception.reason_public || '—'}</dd>
        </div>
        {exception.reason_private !== undefined && (
          <div className="sm:col-span-2">
            <dt className="font-mono text-xs uppercase tracking-wider text-slate-500">reason (private)</dt>
            <dd className="font-mono text-slate-100 whitespace-pre-wrap">{exception.reason_private || '—'}</dd>
          </div>
        )}
        {exception.revoke_reason && (
          <div className="sm:col-span-2">
            <dt className="font-mono text-xs uppercase tracking-wider text-slate-500">revoke reason</dt>
            <dd className="font-mono text-slate-100 whitespace-pre-wrap">{exception.revoke_reason}</dd>
          </div>
        )}
      </dl>

      <section className="mb-8">
        <h2 className="text-sm font-mono font-bold mb-2 uppercase tracking-wider text-slate-400">proof anchors</h2>
        <ul className="text-xs font-mono space-y-1 border border-slate-800 p-3">
          {exception.proof_anchors.map((anchor, i) => {
            const a = anchor as { proofType?: string; label?: string; href?: string; visibility?: string };
            return (
              <li key={i} className="flex items-baseline gap-2">
                <span className="text-slate-500 uppercase">[{a.proofType || '?'}]</span>
                {a.visibility === 'private' ? (
                  <span className="text-slate-400">{a.label} <span className="text-slate-600">(private anchor)</span></span>
                ) : (
                  <a
                    href={a.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-slate-100 underline hover:text-white"
                  >
                    {a.label}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {isReviewerOrOwner && (isProposed || isActive) && (
        <section className="border border-slate-700 bg-slate-800/40 p-4">
          <h2 className="text-sm font-mono font-bold mb-3 uppercase tracking-wider text-slate-300">reviewer actions</h2>
          {actionError && <p className="mb-3 text-xs font-mono text-red-300" role="alert">{actionError}</p>}
          <div className="space-y-3 text-sm">
            {isProposed && (
              <>
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={actionPending}
                  className="px-3 py-1 font-mono bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
                >approve</button>
                <div className="flex items-start gap-2">
                  <input
                    type="text"
                    placeholder="rejection reason (1..280 chars)"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-700 px-3 py-1 font-mono text-xs text-slate-100"
                    maxLength={280}
                  />
                  <button
                    type="button"
                    onClick={handleReject}
                    disabled={actionPending || !rejectReason.trim()}
                    className="px-3 py-1 font-mono bg-slate-700 text-white hover:bg-slate-600 disabled:opacity-50"
                  >reject</button>
                </div>
              </>
            )}
            {isActive && (
              <>
                <div className="flex items-start gap-2">
                  <input
                    type="datetime-local"
                    value={extendIso.slice(0, 16)}
                    onChange={(e) => setExtendIso(`${e.target.value}:00.000Z`)}
                    className="bg-slate-900 border border-slate-700 px-3 py-1 font-mono text-xs text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={handleExtend}
                    disabled={actionPending}
                    className="px-3 py-1 font-mono bg-slate-700 text-white hover:bg-slate-600 disabled:opacity-50"
                  >extend</button>
                </div>
                <div className="flex items-start gap-2">
                  <input
                    type="text"
                    placeholder="revoke reason"
                    value={revokeReason}
                    onChange={(e) => setRevokeReason(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-700 px-3 py-1 font-mono text-xs text-slate-100"
                    maxLength={280}
                  />
                  <button
                    type="button"
                    onClick={handleRevoke}
                    disabled={actionPending || !revokeReason.trim()}
                    className="px-3 py-1 font-mono bg-red-700 text-white hover:bg-red-600 disabled:opacity-50"
                  >revoke</button>
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {!isReviewerOrOwner && (isProposed || isActive) && (
        <p className="text-xs font-mono text-slate-500">
          Promote to reviewer or owner to approve / reject / extend / revoke this exception.
        </p>
      )}
    </div>
  );
}
