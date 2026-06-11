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
  listExceptionSourceEvents,
  isOk,
  type VaultException,
  type VaultWorkspaceDetail,
  type ExceptionSourceEvent,
} from '../../shared/vault/api-client';
import VaultAuthGate from '../../components/VaultAuthGate';

type Phase = 'loading' | 'unauth' | 'notfound' | 'ready' | 'error';

function defaultExtension(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 30);
  return d.toISOString();
}

// PR-DOGFOOD-1: <input type="datetime-local"> returns a naive local
// calendar string like "2026-07-09T14:00". The previous handler
// appended ":00.000Z" — claiming UTC — which silently shifted the
// reviewer's intent by their timezone offset. The Date constructor
// interprets a naive ISO string as LOCAL time, so wrapping with
// new Date(localStr).toISOString() converts to true UTC correctly.
function localInputToUtcIso(localValue: string): string {
  if (!localValue) return defaultExtension();
  const d = new Date(localValue);
  if (Number.isNaN(d.getTime())) return defaultExtension();
  return d.toISOString();
}

// Inverse: turn the stored UTC ISO into a "datetime-local"-friendly
// string in the reviewer's LOCAL timezone for display in the input.
// The native input expects "YYYY-MM-DDTHH:MM" without offset.
function utcIsoToLocalInput(utcIso: string): string {
  const d = new Date(utcIso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
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

  // PR-6E reviewer-side context: the CEI source exposure this exception was
  // proposed from (if any). Read-only, informational. A failure to load it
  // never blocks the review.
  const [sourceEvent, setSourceEvent] = React.useState<ExceptionSourceEvent | null>(null);

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
      // Source-exposure context is a separate, best-effort read. PR-6F: the
      // related events now include reviewer OUTCOMES, so the card must pin
      // the PROPOSAL event specifically — "proposed by / proposed at" must
      // never show the reviewer's decision instead of the proposal.
      const src = await listExceptionSourceEvents(slug, id);
      if (cancelled) return;
      if (isOk(src)) {
        const proposal = src.data.events.find(
          (ev) => ev.event_kind === 'exception_proposed_from_exposure',
        );
        if (proposal) setSourceEvent(proposal);
      }
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
  if (phase === 'unauth') return <VaultAuthGate message="Sign in to view this exception. You'll land back here." />;
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
  // PR-16A review pressure. Two distinct honest states:
  //   - expired: the reaper observed that time passed (active -> expired).
  //   - active past expires_at: the window elapsed but no reaper run has
  //     observed it yet — still review-due, shown loudly, not hidden.
  // Neither is a decision. Expired is NOT revoked; the original approval
  // and reviewer are preserved below; the reviewer decides what happens
  // next (renewal/closeout is its own future lane).
  const isExpired = exception.state === 'expired';
  const isPastDue = isActive
    && !!exception.expires_at
    && new Date(exception.expires_at).getTime() < Date.now();

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

      {(isExpired || isPastDue) && (
        <section className="mb-6 border border-amber-700 bg-amber-900/20 p-4">
          <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-amber-200 mb-1">
            {isExpired ? 'Expired — review due' : 'Past expiry window — review due'}
          </h2>
          <p className="text-xs font-mono text-amber-200/80">
            {isExpired
              ? 'This temporary acceptance passed its expiry window and the system marked it expired. '
              : 'This temporary acceptance has passed its expiry window; the reaper has not yet recorded the transition. '}
            Expired is not revoked, not renewed, and not proof of remediation —
            the original decision below is preserved, and a reviewer still
            decides what happens next.
          </p>
        </section>
      )}

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

      {/* PR-6E: read-only source-exposure context. If this exception was
          proposed from a component exposure, show the reviewer where it came
          from. Informational only — it does not change review semantics. */}
      {sourceEvent && sourceEvent.source_exposure && (
        <section className="mb-8 border border-sky-900 bg-sky-950/30 p-4">
          <h2 className="text-sm font-mono font-bold mb-2 uppercase tracking-wider text-sky-300">
            Source exposure
          </h2>
          <p className="text-xs font-mono text-slate-400 mb-3">
            [PRIVATE] This exception was proposed from a component exposure.
            Context only — you still decide.
          </p>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs font-mono">
            <div>
              <dt className="text-slate-500 uppercase tracking-wider">exposure type</dt>
              <dd className="text-slate-100">{sourceEvent.source_exposure.exposure_type || '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500 uppercase tracking-wider">status</dt>
              <dd className="text-slate-100">{sourceEvent.source_exposure.status}</dd>
            </div>
            <div>
              <dt className="text-slate-500 uppercase tracking-wider">subject</dt>
              <dd className="text-slate-100">
                <span className="text-slate-500">{sourceEvent.source_exposure.subject_kind}</span>{' '}
                {sourceEvent.source_exposure.subject_name}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 uppercase tracking-wider">source</dt>
              <dd className="text-slate-100">
                {sourceEvent.source_exposure.source_kind}
                {sourceEvent.source_exposure.source_ref ? ` · ${sourceEvent.source_exposure.source_ref}` : ''}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 uppercase tracking-wider">proposed by</dt>
              <dd className="text-slate-100">
                {sourceEvent.actor ? `@${sourceEvent.actor.github_login}` : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 uppercase tracking-wider">proposed at</dt>
              <dd className="text-slate-100">{sourceEvent.created_at.slice(0, 19).replace('T', ' ')}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs font-mono">
            <Link
              to={`/vault/${slug}/exposures/${sourceEvent.source_exposure.exposure_id}`}
              className="text-sky-300 underline hover:text-white"
            >
              View source exposure {sourceEvent.source_exposure.exposure_id.slice(0, 8)}
            </Link>
          </p>
        </section>
      )}

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
                    value={utcIsoToLocalInput(extendIso)}
                    onChange={(e) => setExtendIso(localInputToUtcIso(e.target.value))}
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
