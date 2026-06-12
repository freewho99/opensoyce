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
  listExceptionResolutions,
  resolveExpiredException,
  listRemediationEvidence,
  recordRemediationEvidence,
  listVerificationChecks,
  runVerificationCheck,
  isOk,
  type VaultException,
  type VaultWorkspaceDetail,
  type ExceptionSourceEvent,
  type ExceptionResolution,
  type ResolutionOutcome,
  type RemediationEvidence,
  type RemediationEvidenceType,
  type EvidenceVerificationCheck,
  type VerificationCheckKind,
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

  // PR-16B review case: append-only reviewer resolutions for an EXPIRED
  // exception. Recording one never changes the exception row — the expired
  // state is time truth. 'renew' cites a NEW proposal from the existing
  // lane; this page never creates or extends trust from here.
  const [resolutions, setResolutions] = React.useState<ExceptionResolution[]>([]);
  const [resolutionOutcome, setResolutionOutcome] = React.useState<ResolutionOutcome | ''>('');
  const [resolutionReason, setResolutionReason] = React.useState('');
  const [resolutionReasonPrivate, setResolutionReasonPrivate] = React.useState('');
  const [renewedExceptionId, setRenewedExceptionId] = React.useState('');
  const [linkedQuestionId, setLinkedQuestionId] = React.useState('');
  const [resolutionPending, setResolutionPending] = React.useState(false);
  const [resolutionError, setResolutionError] = React.useState('');

  // PR-16C Fix Evidence Loop: human-cited remediation evidence for a
  // remediation_required direction. Append-only; recording evidence never
  // changes the exception, the resolution, or the question — the system
  // validates that evidence is present and cited; it does not verify the
  // fix and never declares anything fixed.
  const [evidenceRows, setEvidenceRows] = React.useState<RemediationEvidence[]>([]);
  const [evidenceType, setEvidenceType] = React.useState<RemediationEvidenceType | ''>('');
  const [evidenceRef, setEvidenceRef] = React.useState('');
  const [evidenceReason, setEvidenceReason] = React.useState('');
  const [evidenceReasonPrivate, setEvidenceReasonPrivate] = React.useState('');
  const [evidencePending, setEvidencePending] = React.useState(false);
  const [evidenceError, setEvidenceError] = React.useState('');

  // PR-EV-1 citation checks: append-only system observations about cited
  // references at check time. A passing check confirms the citation, not
  // the remediation; inconclusive is an honest answer.
  const [checksByEvidence, setChecksByEvidence] = React.useState<Record<string, EvidenceVerificationCheck[]>>({});
  const [checkKindByEvidence, setCheckKindByEvidence] = React.useState<Record<string, VerificationCheckKind>>({});
  const [checkPending, setCheckPending] = React.useState(false);
  const [checkError, setCheckError] = React.useState('');

  React.useEffect(() => {
    if (!slug || evidenceRows.length === 0) return;
    let cancelled = false;
    (async () => {
      const results: Awaited<ReturnType<typeof listVerificationChecks>>[] = await Promise.all(
        evidenceRows.map((ev) => listVerificationChecks(slug, ev.evidence_id)),
      );
      if (cancelled) return;
      const next: Record<string, EvidenceVerificationCheck[]> = {};
      results.forEach((res, i) => {
        if (isOk(res)) next[evidenceRows[i].evidence_id] = res.data.checks;
      });
      setChecksByEvidence(next);
    })();
    return () => { cancelled = true; };
  }, [slug, evidenceRows]);

  async function handleRunCheck(evidenceId: string) {
    const kind = checkKindByEvidence[evidenceId] || 'internal_exposure_reference';
    setCheckError('');
    setCheckPending(true);
    const res = await runVerificationCheck(slug, evidenceId, kind);
    setCheckPending(false);
    if (!isOk(res)) { setCheckError(res.message); return; }
    setChecksByEvidence((prev) => ({
      ...prev,
      [evidenceId]: [res.data, ...(prev[evidenceId] || [])],
    }));
  }

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
      // PR-16B: the review-case record is a separate, best-effort read.
      const resList = await listExceptionResolutions(slug, id);
      if (cancelled) return;
      if (isOk(resList)) setResolutions(resList.data.resolutions);
      // PR-16C: the remediation evidence record is a separate, best-effort
      // read. A failure here never blocks the review.
      const evList = await listRemediationEvidence(slug, id);
      if (cancelled) return;
      if (isOk(evList)) setEvidenceRows(evList.data.evidence);
    })();
    return () => { cancelled = true; };
  }, [slug, id]);

  async function handleResolve() {
    if (!resolutionOutcome) {
      setResolutionError('Select a direction — expired trust waits for a reviewer, not the system.');
      return;
    }
    if (!resolutionReason.trim()) {
      setResolutionError('A reason is required — a resolution without a reason is not evidence.');
      return;
    }
    setResolutionError('');
    setResolutionPending(true);
    const res = await resolveExpiredException(slug, id, {
      outcome: resolutionOutcome,
      reason_public: resolutionReason.trim(),
      reason_private: resolutionReasonPrivate || undefined,
      renewed_exception_id: resolutionOutcome === 'renew' ? renewedExceptionId.trim() : undefined,
      linked_question_id: resolutionOutcome === 'remediation_question' ? linkedQuestionId.trim() : undefined,
    });
    setResolutionPending(false);
    if (!isOk(res)) { setResolutionError(res.message); return; }
    setResolutions((prev) => [res.data, ...prev]);
    setResolutionOutcome('');
    setResolutionReason('');
    setResolutionReasonPrivate('');
    setRenewedExceptionId('');
    setLinkedQuestionId('');
  }

  async function handleRecordEvidence() {
    if (!evidenceType) {
      setEvidenceError('Select an evidence type.');
      return;
    }
    if (!evidenceRef.trim()) {
      setEvidenceError('An evidence reference is required — evidence without a reference is a claim, and a claim cannot close the loop.');
      return;
    }
    if (!evidenceReason.trim()) {
      setEvidenceError('A reason is required — say why this evidence closes the remediation loop.');
      return;
    }
    setEvidenceError('');
    setEvidencePending(true);
    const res = await recordRemediationEvidence(slug, id, {
      evidence_type: evidenceType,
      evidence_ref: evidenceRef.trim(),
      reason_public: evidenceReason.trim(),
      reason_private: evidenceReasonPrivate || undefined,
    });
    setEvidencePending(false);
    if (!isOk(res)) { setEvidenceError(res.message); return; }
    setEvidenceRows((prev) => [res.data, ...prev]);
    setEvidenceType('');
    setEvidenceRef('');
    setEvidenceReason('');
    setEvidenceReasonPrivate('');
  }

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
  // PR-16C: the remediation case is DERIVED, never stored — a
  // remediation_required direction opens it; evidence rows mark it
  // evidence recorded. Neither word is a verdict about the vulnerability.
  const hasRemediationDirection = resolutions.some((r) => r.outcome === 'remediation_required');
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

      {/* PR-16B: the review case. Expired trust creates review pressure;
          reviewer resolution creates the next trust decision. Recording a
          resolution NEVER changes this exception — the expired state is
          time truth. Renew cites a NEW proposal from the existing propose
          lane; remediation_question cites a 15B question. Append-only:
          every prior resolution stays on the record. */}
      {isExpired && (
        <section className="mb-8 border border-slate-700 bg-slate-800/40 p-4">
          <h2 className="text-sm font-mono font-bold mb-2 uppercase tracking-wider text-slate-300">
            Reviewer resolution
          </h2>
          <p className="text-xs font-mono text-slate-400 mb-3">
            The reaper observed that time passed; it decided nothing. What
            happens next is a reviewer decision, recorded here. Resolving
            does not change this exception&apos;s state — renewing means a new
            proposal through the existing exception lane, with its own
            review and its own expiry.
          </p>

          {resolutions.length > 0 && (
            <ul className="border border-slate-800 divide-y divide-slate-800 text-xs font-mono mb-4">
              {resolutions.map((r) => (
                <li key={r.resolution_id} className="px-3 py-2 space-y-1">
                  <p>
                    <span className="text-emerald-200">{r.outcome.replace(/_/g, ' ')}</span>
                    <span className="text-slate-500 ml-2">
                      by {r.resolved_by ? `@${r.resolved_by.github_login}` : '—'} · {r.created_at.slice(0, 19).replace('T', ' ')}
                    </span>
                  </p>
                  <p className="text-slate-300">{r.reason_public}</p>
                  {r.reason_private && <p className="text-slate-500">[private] {r.reason_private}</p>}
                  {r.renewed_exception_id && (
                    <p>
                      <Link
                        to={`/vault/${slug}/exceptions/${r.renewed_exception_id}`}
                        className="text-slate-400 hover:text-slate-100 underline"
                      >
                        renewal proposal {r.renewed_exception_id.slice(0, 8)}
                      </Link>
                    </p>
                  )}
                  {r.linked_question_id && (
                    <p>
                      <Link
                        to={`/vault/${slug}/remediation-questions/${r.linked_question_id}`}
                        className="text-slate-400 hover:text-slate-100 underline"
                      >
                        remediation question {r.linked_question_id.slice(0, 8)}
                      </Link>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {resolutions.length === 0 && (
            <p className="text-xs font-mono text-amber-200/80 mb-4">
              Unresolved review case — no reviewer direction recorded yet.
            </p>
          )}

          {isReviewerOrOwner ? (
            <div className="space-y-3">
              {resolutionError && (
                <p className="text-xs font-mono text-red-300" role="alert">{resolutionError}</p>
              )}
              <fieldset>
                <legend className="block text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-2">
                  direction (append-only; the record keeps every resolution)
                </legend>
                <div className="space-y-1">
                  {([
                    ['renew', 'Cite a NEW proposal from the existing exception lane — it gets its own review and expiry.'],
                    ['revoke', 'Trust formally ended; do not renew. Records the direction; the expired state stands.'],
                    ['remediation_required', 'A human will fix or upgrade the component.'],
                    ['resolved_externally', 'The risk no longer applies — asserted by you, not proven by the system.'],
                    ['defer', 'Reviewed; deliberately revisit later. The case stays open to re-resolution.'],
                    ['remediation_question', 'Hand the next step to the question lane — cite an existing question.'],
                  ] as Array<[ResolutionOutcome, string]>).map(([value, hint]) => (
                    <label key={value} className="flex items-baseline gap-2 text-xs font-mono text-slate-200">
                      <input
                        type="radio"
                        name="resolution-outcome"
                        value={value}
                        checked={resolutionOutcome === value}
                        onChange={() => setResolutionOutcome(value)}
                      />
                      <span>
                        {value.replace(/_/g, ' ')}
                        <span className="text-slate-500 ml-2">{hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {resolutionOutcome === 'renew' && (
                <label className="block">
                  <span className="block text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1">
                    renewed exception id (propose it first via the existing lane, then cite it here)
                  </span>
                  <input
                    type="text"
                    value={renewedExceptionId}
                    onChange={(e) => setRenewedExceptionId(e.target.value)}
                    placeholder="uuid of the NEW proposed exception"
                    className="w-full bg-slate-900 border border-slate-700 px-3 py-1 font-mono text-xs text-slate-100"
                  />
                </label>
              )}
              {resolutionOutcome === 'remediation_question' && (
                <label className="block">
                  <span className="block text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1">
                    remediation question id (open it from the source exposure first, then cite it here)
                  </span>
                  <input
                    type="text"
                    value={linkedQuestionId}
                    onChange={(e) => setLinkedQuestionId(e.target.value)}
                    placeholder="uuid of the existing question"
                    className="w-full bg-slate-900 border border-slate-700 px-3 py-1 font-mono text-xs text-slate-100"
                  />
                </label>
              )}
              <label className="block">
                <span className="block text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1">reason (required, 280 max)</span>
                <input
                  type="text"
                  value={resolutionReason}
                  onChange={(e) => setResolutionReason(e.target.value)}
                  maxLength={280}
                  className="w-full bg-slate-900 border border-slate-700 px-3 py-1 font-mono text-xs text-slate-100"
                />
              </label>
              <label className="block">
                <span className="block text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1">private reason (optional)</span>
                <textarea
                  value={resolutionReasonPrivate}
                  onChange={(e) => setResolutionReasonPrivate(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-900 border border-slate-700 px-3 py-1 font-mono text-xs text-slate-100"
                />
              </label>
              <button
                type="button"
                onClick={handleResolve}
                disabled={resolutionPending}
                className="px-4 py-2 text-sm font-mono bg-slate-100 text-slate-900 hover:bg-white disabled:opacity-50"
              >
                {resolutionPending ? 'Recording...' : 'Record reviewer resolution'}
              </button>
            </div>
          ) : (
            <p className="text-xs font-mono text-slate-500">
              Resolving expired trust requires the reviewer or owner role.
            </p>
          )}
        </section>
      )}

      {/* PR-16C: the Fix Evidence Loop. Shown when a reviewer direction of
          remediation_required exists. A recorded direction is not completed
          remediation — a human records cited evidence that they say closes
          the remediation loop. Append-only; nothing else changes; the
          system validates that evidence is present and cited, it does not
          verify the fix. Certification language is banned from this
          surface — every label states what was recorded, never a system
          verdict. */}
      {hasRemediationDirection && (
        <section className="mb-8 border border-slate-700 bg-slate-800/40 p-4">
          <h2 className="text-sm font-mono font-bold mb-2 uppercase tracking-wider text-slate-300">
            Remediation evidence
          </h2>
          <p className="text-xs font-mono text-slate-400 mb-3">
            The reviewer directed <span className="text-slate-200">remediation required</span>.
            A recorded direction is not completed remediation — close the loop
            by citing evidence. OpenSoyce records the evidence a human says
            closes the remediation loop; it does not verify the fix.
          </p>

          {evidenceRows.length > 0 ? (
            <ul className="border border-slate-800 divide-y divide-slate-800 text-xs font-mono mb-4">
              {evidenceRows.map((ev) => (
                <li key={ev.evidence_id} className="px-3 py-2 space-y-1">
                  <p>
                    <span className="text-emerald-200">{ev.evidence_type.replace(/_/g, ' ')}</span>
                    <span className="text-slate-500 ml-2">
                      recorded by {ev.recorded_by ? `@${ev.recorded_by.github_login}` : '—'} · {ev.created_at.slice(0, 19).replace('T', ' ')}
                    </span>
                  </p>
                  <p className="text-slate-300">ref: <span className="text-slate-100">{ev.evidence_ref}</span></p>
                  <p className="text-slate-300">{ev.reason_public}</p>
                  {ev.reason_private && <p className="text-slate-500">[private] {ev.reason_private}</p>}

                  {/* PR-EV-1: Citation checks. A check confirms the cited
                      reference was reachable and matched the expected
                      shape at check time — it never asserts remediation.
                      Inconclusive is an honest answer. */}
                  <div className="mt-2 border-t border-slate-800 pt-2">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Citation checks</p>
                    {(checksByEvidence[ev.evidence_id] || []).length > 0 ? (
                      <ul className="space-y-1 mb-2">
                        {(checksByEvidence[ev.evidence_id] || []).slice(0, 3).map((c) => (
                          <li key={c.check_id} className="text-slate-400">
                            <span className={
                              c.check_status === 'check_passed' ? 'text-emerald-300'
                                : c.check_status === 'check_failed' ? 'text-red-300' : 'text-amber-300'
                            }>
                              {c.check_status.replace(/_/g, ' ')}
                            </span>
                            <span className="text-slate-500 ml-2">{c.check_kind.replace(/_/g, ' ')} · {c.checked_at.slice(0, 19).replace('T', ' ')}</span>
                            <span className="block text-slate-400">{c.summary_public}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-slate-500 mb-2">No citation checks run yet — checks are optional observations.</p>
                    )}
                    {checkError && <p className="mb-1 text-red-300" role="alert">{checkError}</p>}
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={checkKindByEvidence[ev.evidence_id] || 'internal_exposure_reference'}
                        onChange={(e) => setCheckKindByEvidence((prev) => ({ ...prev, [ev.evidence_id]: e.target.value as VerificationCheckKind }))}
                        className="bg-slate-900 border border-slate-700 px-2 py-0.5 font-mono text-[10px] text-slate-100"
                      >
                        <option value="internal_exposure_reference">internal exposure reference</option>
                        <option value="github_reference_reachable">github reference reachable</option>
                        <option value="source_rescan_no_longer_matches">source rescan no longer matches</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => handleRunCheck(ev.evidence_id)}
                        disabled={checkPending}
                        className="px-2 py-0.5 text-[10px] font-mono border border-slate-600 text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                      >
                        {checkPending ? 'checking…' : 'Run citation check'}
                      </button>
                      <span className="text-[10px] text-slate-500">
                        A passing check confirms the citation, not the remediation.
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs font-mono text-amber-200/80 mb-4">
              Awaiting evidence — the direction is recorded; no remediation
              evidence has been cited yet.
            </p>
          )}

          <div className="space-y-3">
            {evidenceError && (
              <p className="text-xs font-mono text-red-300" role="alert">{evidenceError}</p>
            )}
            <fieldset>
              <legend className="block text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-2">
                evidence type (append-only; the record keeps every entry)
              </legend>
              <div className="space-y-1">
                {([
                  ['fixed_version_observed', 'A newer version was observed in the record — cite the observation.'],
                  ['pr_or_commit_reference', 'Cite the PR or commit that remediated.'],
                  ['rescan_no_longer_matches', 'A re-check against the source no longer asserts the advisory — cite it.'],
                  ['manual_remediation_note', 'A human attests with a reference (ticket, doc, runbook).'],
                ] as Array<[RemediationEvidenceType, string]>).map(([value, hint]) => (
                  <label key={value} className="flex items-baseline gap-2 text-xs font-mono text-slate-200">
                    <input
                      type="radio"
                      name="evidence-type"
                      value={value}
                      checked={evidenceType === value}
                      onChange={() => setEvidenceType(value)}
                    />
                    <span>
                      {value.replace(/_/g, ' ')}
                      <span className="text-slate-500 ml-2">{hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block">
              <span className="block text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1">
                evidence reference (required — a claim without a citation cannot close the loop)
              </span>
              <input
                type="text"
                value={evidenceRef}
                onChange={(e) => setEvidenceRef(e.target.value)}
                placeholder="PR/commit URL, observed version, re-scan ref, ticket…"
                maxLength={512}
                className="w-full bg-slate-900 border border-slate-700 px-3 py-1 font-mono text-xs text-slate-100"
              />
            </label>
            <label className="block">
              <span className="block text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1">reason (required, 280 max)</span>
              <input
                type="text"
                value={evidenceReason}
                onChange={(e) => setEvidenceReason(e.target.value)}
                maxLength={280}
                className="w-full bg-slate-900 border border-slate-700 px-3 py-1 font-mono text-xs text-slate-100"
              />
            </label>
            <label className="block">
              <span className="block text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1">private note (optional)</span>
              <textarea
                value={evidenceReasonPrivate}
                onChange={(e) => setEvidenceReasonPrivate(e.target.value)}
                rows={3}
                className="w-full bg-slate-900 border border-slate-700 px-3 py-1 font-mono text-xs text-slate-100"
              />
            </label>
            <button
              type="button"
              onClick={handleRecordEvidence}
              disabled={evidencePending}
              className="px-4 py-2 text-sm font-mono bg-slate-100 text-slate-900 hover:bg-white disabled:opacity-50"
            >
              {evidencePending ? 'Recording...' : 'Record remediation evidence'}
            </button>
          </div>
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
