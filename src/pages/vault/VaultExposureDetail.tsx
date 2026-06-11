// /vault/:slug/exposures/:id — single component exposure (PR-6B + PR-6C).
//
// READ of the exposure record (PR-6B): metadata, trust_boundary, source,
// timestamps, status. The exposure row is NEVER mutated by this page.
//
// PR-6C adds ONE narrow write: "Propose exception from this exposure".
// Doctrine:
//   An exposure can SUGGEST a trust decision.
//   A user must still PROPOSE the decision (explicit confirmation here).
//   A reviewer must still APPROVE it (elsewhere; not on this page).
//   The record remembers who decided.
//
// The action:
//   - creates a PROPOSED exception only (the server hardcodes state:
//     'proposed'; this page never approves/rejects/revokes/extends)
//   - does NOT mutate the exposure (no status change, no exposure write)
//   - requires an explicit review + submit (no one-click auto-submit)
//   - is only enabled when the exposure subject maps to an exception
//     subject (package). Exceptions cover package/repo subjects; other
//     exposure types show the action disabled with an honest note.

import React from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getExposure,
  proposeException,
  listExposureEvents,
  listExposureVulnIntel,
  refreshExposureVulnIntel,
  openRemediationQuestion,
  getEvidenceExport,
  isOk,
  type ComponentExposure,
  type ComponentExposureEvent,
  type ExposureVulnIntel,
  type ProposeExceptionBody,
  type EvidenceExportResponse,
} from '../../shared/vault/api-client';
import VaultAuthGate from '../../components/VaultAuthGate';

type Phase = 'loading' | 'unauth' | 'notfound' | 'ready' | 'error';

// Only exposures whose subject is a package map onto the exception subject
// model (package | repo) in 6C. The other native exposure kinds
// (github-action / container-image / base-image / dev-tool / runtime) have
// no clean exception-subject mapping yet, so the action is disabled for
// them rather than inventing a stretch mapping.
function exceptionSubjectFor(exposure: ComponentExposure): { kind: 'package' | 'repo'; name: string } | null {
  if (exposure.subject_kind === 'package') {
    return { kind: 'package', name: exposure.subject_name };
  }
  return null;
}

function clamp(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function statusClass(status: string): string {
  if (status === 'review_required') return 'text-amber-300';
  if (status === 'allowed') return 'text-emerald-300';
  if (status === 'blocked') return 'text-red-300';
  if (status === 'excepted') return 'text-sky-300';
  if (status === 'resolved') return 'text-slate-500';
  return 'text-slate-100';
}

// Pretty-print a JSON object for the metadata / trust_boundary blocks.
function formatJson(obj: Record<string, unknown>): string {
  try {
    return JSON.stringify(obj ?? {}, null, 2);
  } catch {
    return '{}';
  }
}

// The proposal draft the review card edits before submit. original_action
// defaults to the most conservative downgrade (BLOCK→WARN); the user can
// change it. allowed_action is constrained to a strict downgrade.
type ProposeDraft = {
  originalAction: 'BLOCK' | 'WARN';
  allowedAction: 'WARN' | 'ALLOW';
  reasonPublic: string;
  reasonPrivate: string;
};

export default function VaultExposureDetail() {
  const { slug = '', id = '' } = useParams();
  const [phase, setPhase] = React.useState<Phase>('loading');
  const [exposure, setExposure] = React.useState<ComponentExposure | null>(null);
  const [error, setError] = React.useState('');

  // PR-6C propose-exception local state. The exposure row is never touched
  // by any of this — only a NEW exception draft is created.
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<ProposeDraft | null>(null);
  const [proposePending, setProposePending] = React.useState(false);
  const [proposeError, setProposeError] = React.useState('');
  const [proposedExceptionId, setProposedExceptionId] = React.useState<string | null>(null);

  // PR-6D proposal-history (CEI-native audit). Read-only.
  const [events, setEvents] = React.useState<ComponentExposureEvent[]>([]);

  // PR-15A vulnerability-intelligence context. Reading and refreshing it
  // never mutates the exposure — intelligence is context, not judgment.
  const [vulnIntel, setVulnIntel] = React.useState<ExposureVulnIntel[]>([]);
  const [intelPending, setIntelPending] = React.useState(false);
  const [intelError, setIntelError] = React.useState('');
  const [intelChecked, setIntelChecked] = React.useState(false);

  // PR-15B remediation questions. Opening one creates a QUESTION record
  // only: no exposure write, no exception, no proposal, no CEI event. The
  // human answers on the question page; propose_exception still travels
  // the Phase 5 lane below.
  const [questionPending, setQuestionPending] = React.useState(false);
  const [questionError, setQuestionError] = React.useState('');
  const [openedQuestionId, setOpenedQuestionId] = React.useState<string | null>(null);

  // PR-17A evidence export. Generating the bundle is a READ — the record
  // is exactly the same after the export as before it.
  const [exportPending, setExportPending] = React.useState(false);
  const [exportError, setExportError] = React.useState('');
  const [exportResult, setExportResult] = React.useState<EvidenceExportResponse | null>(null);
  const [exportCopied, setExportCopied] = React.useState(false);

  const refreshEvents = React.useCallback(async () => {
    if (!slug || !id) return;
    const res = await listExposureEvents(slug, id);
    if (isOk(res)) setEvents(res.data.events);
  }, [slug, id]);

  // PR-15A: best-effort context read; a failure never blocks the exposure
  // view (same contract as the Decision history read).
  const loadVulnIntel = React.useCallback(async () => {
    if (!slug || !id) return;
    const res = await listExposureVulnIntel(slug, id);
    if (isOk(res)) setVulnIntel(res.data.intel);
  }, [slug, id]);

  async function handleRefreshIntel() {
    setIntelError('');
    setIntelPending(true);
    const res = await refreshExposureVulnIntel(slug, id);
    setIntelPending(false);
    setIntelChecked(true);
    if (!isOk(res)) { setIntelError(res.message); return; }
    setVulnIntel(res.data.intel);
  }

  // PR-15B: open a remediation question about this observation — from the
  // component itself, or from one attached intelligence finding. The server
  // derives the question kind from what it is anchored to.
  async function handleOpenQuestion(vulnIntelId?: string) {
    setQuestionError('');
    setQuestionPending(true);
    const res = await openRemediationQuestion(slug, {
      source_exposure_id: id,
      ...(vulnIntelId ? { source_vuln_intel_id: vulnIntelId } : {}),
    });
    setQuestionPending(false);
    if (!isOk(res)) { setQuestionError(res.message); return; }
    setOpenedQuestionId(res.data.question_id);
  }

  // PR-17A: assemble the evidence bundle for this component's trust-
  // decision chain. Read-only; missing chain links are reported as "not
  // present in the record", never fabricated.
  async function handleGenerateExport() {
    setExportError('');
    setExportCopied(false);
    setExportPending(true);
    const res = await getEvidenceExport(slug, id);
    setExportPending(false);
    if (!isOk(res)) { setExportError(res.message); return; }
    setExportResult(res.data);
  }

  async function handleCopyExport() {
    if (!exportResult) return;
    try {
      await navigator.clipboard.writeText(exportResult.markdown);
      setExportCopied(true);
    } catch {
      setExportError('Copy failed — select the text and copy manually.');
    }
  }

  function handleDownloadExport() {
    if (!exportResult || !exposure) return;
    const safeName = exposure.subject_name.replace(/[^A-Za-z0-9.-]+/g, '-');
    const blob = new Blob([exportResult.markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evidence-bundle-${safeName}-${exportResult.bundle.generated_at.slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  React.useEffect(() => {
    let cancelled = false;
    if (!slug || !id) return;
    (async () => {
      const res = await getExposure(slug, id);
      if (cancelled) return;
      if (isOk(res)) {
        setExposure(res.data);
        setPhase('ready');
        // Proposal history is a separate read; a failure here never blocks
        // the exposure view.
        refreshEvents();
        loadVulnIntel();
        return;
      }
      if (res.status === 401) { setPhase('unauth'); return; }
      if (res.status === 404) { setPhase('notfound'); return; }
      setError(res.message);
      setPhase('error');
    })();
    return () => { cancelled = true; };
  }, [slug, id, refreshEvents, loadVulnIntel]);

  function openReview(ex: ComponentExposure) {
    // Pre-fill the proposal from the exposure. The user reviews + edits
    // before any submit — there is no one-click auto-submit.
    const reasonPublic = clamp(
      `Proposed from ${ex.exposure_type || 'component'} exposure of ${ex.subject_name}`,
      280,
    );
    const trustBoundary = formatJson(ex.trust_boundary);
    const metadata = formatJson(ex.metadata);
    const reasonPrivate = clamp(
      `Source: ${ex.source_kind}${ex.source_ref ? ` (${ex.source_ref})` : ''}.\n`
        + `Exposure: ${ex.exposure_id} (${ex.exposure_type || '—'}), status ${ex.status}.\n`
        + `Trust boundary: ${trustBoundary}\nMetadata: ${metadata}`,
      10000,
    );
    setDraft({
      originalAction: 'BLOCK',
      allowedAction: 'WARN',
      reasonPublic,
      reasonPrivate,
    });
    setProposeError('');
    setReviewOpen(true);
  }

  async function submitProposal(ex: ComponentExposure) {
    if (!draft) return;
    const subject = exceptionSubjectFor(ex);
    if (!subject) {
      setProposeError('This exposure type cannot be proposed as an exception.');
      return;
    }
    if (draft.reasonPublic.trim().length < 1 || draft.reasonPublic.length > 280) {
      setProposeError('Public reason must be 1-280 characters.');
      return;
    }
    setProposePending(true);
    setProposeError('');
    // The proof anchor is a live-surface pointer back at THIS exposure —
    // the same client-constructed-anchor pattern the CLI `exception propose`
    // uses (live-surface, visibility absent). The server-side
    // validate_proof_anchors accepts it; the dashboard does not synthesize
    // a private-anchor proofType client-side.
    const body: ProposeExceptionBody = {
      subject,
      original_action: draft.originalAction,
      allowed_action: draft.allowedAction,
      reason_public: draft.reasonPublic.trim(),
      reason_private: draft.reasonPrivate || undefined,
      proof_anchors: [
        {
          proofType: 'live-surface',
          label: `Proposed from component exposure ${ex.exposure_id.slice(0, 8)}`,
          href: `/api/vault/workspaces/${encodeURIComponent(slug)}/exposures/${encodeURIComponent(ex.exposure_id)}`,
        },
      ],
      // PR-6D: cite the source exposure so the server records a CEI-native
      // audit event. This does NOT mutate the exposure.
      source_exposure_id: ex.exposure_id,
    };
    const res = await proposeException(slug, body);
    setProposePending(false);
    if (!isOk(res)) {
      setProposeError(res.message);
      return;
    }
    // Success: record the new proposed exception id, close the review card.
    // The exposure row is intentionally NOT re-fetched or mutated. Refresh
    // the proposal-history list so the new audit event appears.
    setProposedExceptionId(res.data.exception_id);
    setReviewOpen(false);
    refreshEvents();
  }

  if (phase === 'loading') return <p className="text-sm font-mono text-slate-400">Loading...</p>;
  if (phase === 'unauth') return <VaultAuthGate message="Sign in to view this exposure. You'll land back here." />;
  if (phase === 'notfound') {
    return (
      <div className="border border-slate-700 bg-slate-800/40 p-5 max-w-xl">
        <p className="text-sm text-slate-300">Exposure not found, or you are not a member of the workspace.</p>
        <p className="mt-3 text-xs font-mono">
          <Link to={`/vault/${slug}/exposures`} className="text-slate-400 hover:text-slate-100">← back to exposures</Link>
        </p>
      </div>
    );
  }
  if (phase === 'error') return <p className="text-sm font-mono text-red-300" role="alert">{error}</p>;
  if (!exposure) return null;

  const canPropose = exceptionSubjectFor(exposure) !== null;

  return (
    <div className="max-w-3xl">
      <p className="mb-4 text-xs font-mono">
        <Link to={`/vault/${slug}/exposures`} className="text-slate-400 hover:text-slate-100">← exposures</Link>
      </p>

      <header className="mb-6">
        <h1 className="text-xl font-mono font-bold tracking-tight">
          <span className="text-slate-500">{exposure.subject_kind}</span> {exposure.subject_name}
        </h1>
        <p className="text-xs font-mono text-slate-400 mt-1">
          [PRIVATE] {exposure.exposure_type || '—'} ·
          <span className={`ml-1 ${statusClass(exposure.status)}`}>{exposure.status}</span>
        </p>
      </header>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mb-8 text-sm">
        <div>
          <dt className="font-mono text-xs uppercase tracking-wider text-slate-500">exposure type</dt>
          <dd className="font-mono text-slate-100">{exposure.exposure_type || '—'}</dd>
        </div>
        <div>
          <dt className="font-mono text-xs uppercase tracking-wider text-slate-500">status</dt>
          <dd className={`font-mono ${statusClass(exposure.status)}`}>{exposure.status}</dd>
        </div>
        <div>
          <dt className="font-mono text-xs uppercase tracking-wider text-slate-500">source</dt>
          <dd className="font-mono text-slate-100">
            {exposure.source_kind}{exposure.source_ref ? ` · ${exposure.source_ref}` : ''}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-xs uppercase tracking-wider text-slate-500">visibility</dt>
          <dd className="font-mono text-slate-100">{exposure.visibility}</dd>
        </div>
        <div>
          <dt className="font-mono text-xs uppercase tracking-wider text-slate-500">first seen</dt>
          <dd className="font-mono text-slate-100">{exposure.first_seen_at}</dd>
        </div>
        <div>
          <dt className="font-mono text-xs uppercase tracking-wider text-slate-500">last seen</dt>
          <dd className="font-mono text-slate-100">{exposure.last_seen_at}</dd>
        </div>
        <div>
          <dt className="font-mono text-xs uppercase tracking-wider text-slate-500">created at</dt>
          <dd className="font-mono text-slate-100">{exposure.created_at}</dd>
        </div>
      </dl>

      <section className="mb-6">
        <h2 className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">trust boundary</h2>
        <pre className="font-mono text-sm text-slate-100 border border-slate-800 p-3 overflow-x-auto whitespace-pre">
          {formatJson(exposure.trust_boundary)}
        </pre>
      </section>

      <section className="mb-8">
        <h2 className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">metadata</h2>
        <pre className="font-mono text-sm text-slate-100 border border-slate-800 p-3 overflow-x-auto whitespace-pre">
          {formatJson(exposure.metadata)}
        </pre>
      </section>

      {/* PR-15A: vulnerability-intelligence context. Intelligence is
          observation, not judgment — it opens a review question; it does
          not decide the answer. Refreshing asks the source (OSV) what it
          currently asserts about this package@version and records/touches
          context rows. The exposure itself is never mutated; no exception,
          proposal, or outcome is ever created from here. */}
      {exposure.exposure_type === 'dependency-exposure' && (
        <section className="mb-8">
          <h2 className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">
            Vulnerability intelligence
          </h2>
          <p className="text-xs font-mono text-slate-400 mb-3">
            [PRIVATE] Intelligence is context only — it opens a review question;
            it does not decide the answer.
          </p>
          {intelError && <p className="mb-2 text-xs font-mono text-red-300" role="alert">{intelError}</p>}
          {vulnIntel.length > 0 && (
            <ul className="border border-slate-800 divide-y divide-slate-800 text-xs font-mono mb-3">
              {vulnIntel.map((iv) => (
                <li key={iv.vuln_intel_id} className="px-3 py-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  {iv.source_ref ? (
                    <a href={iv.source_ref} target="_blank" rel="noreferrer noopener" className="text-slate-100 underline hover:text-white shrink-0">
                      {iv.vuln_id}
                    </a>
                  ) : (
                    <span className="text-slate-100 shrink-0">{iv.vuln_id}</span>
                  )}
                  <span className="text-slate-400 shrink-0">{iv.severity || 'severity unrated'}</span>
                  <span className="text-slate-500 shrink-0">{iv.source} · {iv.match_basis}</span>
                  <span className="text-slate-500 shrink-0">
                    seen ×{iv.seen_count} · first {iv.first_seen_at.slice(0, 10)} · last {iv.last_seen_at.slice(0, 10)}
                  </span>
                  {typeof iv.metadata?.summary === 'string' && iv.metadata.summary && (
                    <span className="text-slate-400 basis-full">{iv.metadata.summary}</span>
                  )}
                  {/* PR-15B: turn this finding into a reviewable question.
                      Creates a question record only — nothing else changes. */}
                  <button
                    type="button"
                    onClick={() => handleOpenQuestion(iv.vuln_intel_id)}
                    disabled={questionPending}
                    className="px-2 py-0.5 text-[10px] font-mono border border-slate-600 text-slate-300 hover:bg-slate-800 disabled:opacity-50 shrink-0"
                  >
                    open remediation question
                  </button>
                </li>
              ))}
            </ul>
          )}
          {vulnIntel.length === 0 && intelChecked && !intelError && (
            <p className="text-xs font-mono text-slate-500 mb-3">
              No known intelligence reported by the source for this package@version.
            </p>
          )}
          <button
            type="button"
            onClick={handleRefreshIntel}
            disabled={intelPending}
            className="px-3 py-1 text-xs font-mono border border-slate-600 text-slate-200 hover:bg-slate-800 disabled:opacity-50"
          >
            {intelPending ? 'checking…' : vulnIntel.length > 0 ? 'Re-check vulnerability intelligence' : 'Check vulnerability intelligence'}
          </button>
        </section>
      )}

      {/* PR-15B: the Remediation Question Loop. Opening a question turns
          observed component risk into a reviewable operational question.
          It changes nothing else: no exposure status, no exception, no
          proposal, no reviewer outcome. The human answers on the question
          page; if they choose propose_exception, the actual proposal still
          travels the Trust decision lane below. */}
      {exposure.exposure_type === 'dependency-exposure' && (
        <section className="mb-8">
          <h2 className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">
            Remediation question
          </h2>
          <p className="text-xs font-mono text-slate-400 mb-3">
            [PRIVATE] The system asks; the human decides; the record remembers.
            Opening a question does not change this exposure or create any
            exception.
          </p>
          {questionError && <p className="mb-2 text-xs font-mono text-red-300" role="alert">{questionError}</p>}
          {openedQuestionId ? (
            <div className="border border-emerald-700 bg-emerald-900/30 p-3">
              <p className="text-sm font-mono text-emerald-200">Remediation question opened.</p>
              <p className="mt-2 text-xs font-mono">
                <Link
                  to={`/vault/${slug}/remediation-questions/${openedQuestionId}`}
                  className="text-emerald-200 underline hover:text-white"
                >
                  Answer remediation question {openedQuestionId.slice(0, 8)}
                </Link>
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => handleOpenQuestion()}
                disabled={questionPending}
                className="px-3 py-1 text-xs font-mono border border-slate-600 text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              >
                {questionPending ? 'opening…' : 'Open remediation question'}
              </button>
              <Link
                to={`/vault/${slug}/remediation-questions`}
                className="text-xs font-mono text-slate-400 hover:text-slate-100 underline"
              >
                view all remediation questions
              </Link>
            </div>
          )}
        </section>
      )}

      {/* PR-6D: CEI-native event history. Read-only audit of actions taken
          FROM this exposure — recorded without the shared Vault Timeline.
          PR-6F: now includes reviewer outcomes (approved / rejected /
          revoked), so the section reads "Decision history" — the full loop,
          not just the proposal. Renders nothing when there are no events. */}
      {events.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">
            Decision history
          </h2>
          <ul className="border border-slate-800 divide-y divide-slate-800 text-xs font-mono">
            {events.map((ev) => (
              <li key={ev.event_id} className="px-3 py-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 shrink-0">[PRIVATE]</span>
                <span className="text-slate-400 shrink-0">{ev.created_at.slice(0, 19).replace('T', ' ')}</span>
                <span className="text-slate-100 shrink-0">{ev.event_kind}</span>
                <span className="text-slate-500 shrink-0">
                  {ev.actor ? `@${ev.actor.github_login}` : '—'}
                </span>
                {ev.related_exception_id && (
                  <Link
                    to={`/vault/${slug}/exceptions/${ev.related_exception_id}`}
                    className="text-slate-400 hover:text-slate-100 underline shrink-0"
                  >
                    exception {ev.related_exception_id.slice(0, 8)}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* PR-6C: propose a NEW exception draft from this exposure. The
          exposure is never mutated; only a proposed exception is created,
          and only after explicit review + submit. */}
      <section className="border border-slate-700 bg-slate-800/40 p-4">
        <h2 className="text-sm font-mono font-bold mb-2 uppercase tracking-wider text-slate-300">
          Trust decision
        </h2>
        <p className="text-xs font-mono text-slate-400 mb-3">
          An exposure can suggest a trust decision. You still propose it; a
          reviewer still approves it. Proposing creates a <span className="text-slate-200">proposed</span> exception
          — it does not change this exposure.
        </p>

        {proposedExceptionId ? (
          <div className="border border-emerald-700 bg-emerald-900/30 p-3">
            <p className="text-sm font-mono text-emerald-200">Proposed exception created.</p>
            <p className="mt-2 text-xs font-mono">
              <Link
                to={`/vault/${slug}/exceptions/${proposedExceptionId}`}
                className="text-emerald-200 underline hover:text-white"
              >
                View proposed exception {proposedExceptionId.slice(0, 8)}
              </Link>
            </p>
          </div>
        ) : !canPropose ? (
          <p className="text-xs font-mono text-slate-500">
            Exceptions currently cover package and repo subjects. This
            exposure type ({exposure.subject_kind}) cannot be proposed as an
            exception yet.
          </p>
        ) : !reviewOpen ? (
          <button
            type="button"
            onClick={() => openReview(exposure)}
            className="px-4 py-2 text-sm font-mono bg-slate-100 text-slate-900 hover:bg-white"
          >
            Propose exception from this exposure
          </button>
        ) : draft ? (
          <div className="space-y-3">
            <p className="text-xs font-mono text-slate-400">
              Review the proposed exception. Nothing is created until you submit.
            </p>
            {proposeError && (
              <p className="text-xs font-mono text-red-300" role="alert">{proposeError}</p>
            )}
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs font-mono">
              <div>
                <dt className="text-slate-500 uppercase tracking-wider">subject</dt>
                <dd className="text-slate-100">package {exposure.subject_name}</dd>
              </div>
              <div>
                <dt className="text-slate-500 uppercase tracking-wider">state</dt>
                <dd className="text-slate-100">proposed</dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-4">
              <label className="block">
                <span className="block text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1">original action</span>
                <select
                  value={draft.originalAction}
                  onChange={(e) => {
                    const originalAction = e.target.value as 'BLOCK' | 'WARN';
                    // Keep allowed_action a strict downgrade of the new original.
                    const allowedAction = originalAction === 'WARN' ? 'ALLOW' : draft.allowedAction;
                    setDraft({ ...draft, originalAction, allowedAction });
                  }}
                  className="bg-slate-900 border border-slate-700 px-2 py-1 font-mono text-xs text-slate-100"
                >
                  <option value="BLOCK">BLOCK</option>
                  <option value="WARN">WARN</option>
                </select>
              </label>
              <label className="block">
                <span className="block text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1">allowed action</span>
                <select
                  value={draft.allowedAction}
                  onChange={(e) => setDraft({ ...draft, allowedAction: e.target.value as 'WARN' | 'ALLOW' })}
                  className="bg-slate-900 border border-slate-700 px-2 py-1 font-mono text-xs text-slate-100"
                >
                  {draft.originalAction === 'BLOCK' && <option value="WARN">WARN</option>}
                  <option value="ALLOW">ALLOW</option>
                </select>
              </label>
            </div>
            <label className="block">
              <span className="block text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1">public reason (1-280)</span>
              <input
                type="text"
                value={draft.reasonPublic}
                onChange={(e) => setDraft({ ...draft, reasonPublic: e.target.value })}
                maxLength={280}
                className="w-full bg-slate-900 border border-slate-700 px-3 py-1 font-mono text-xs text-slate-100"
              />
            </label>
            <label className="block">
              <span className="block text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1">private reason (optional)</span>
              <textarea
                value={draft.reasonPrivate}
                onChange={(e) => setDraft({ ...draft, reasonPrivate: e.target.value })}
                rows={4}
                className="w-full bg-slate-900 border border-slate-700 px-3 py-1 font-mono text-xs text-slate-100"
              />
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => submitProposal(exposure)}
                disabled={proposePending}
                className="px-4 py-2 text-sm font-mono bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {proposePending ? 'Submitting...' : 'Submit proposed exception'}
              </button>
              <button
                type="button"
                onClick={() => { setReviewOpen(false); setProposeError(''); }}
                disabled={proposePending}
                className="px-3 py-2 text-xs font-mono text-slate-400 hover:text-slate-100 disabled:opacity-50"
              >
                cancel
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {/* PR-17A: auditor / customer evidence export. Export is not
          certification, not a decision — a faithful view of the record.
          Generating the bundle is a READ: no CEI event, no timeline event,
          no state change. Private only — session + membership gated like
          every other vault read. */}
      <section className="mt-8 border border-slate-700 bg-slate-800/40 p-4">
        <h2 className="text-sm font-mono font-bold mb-2 uppercase tracking-wider text-slate-300">
          Evidence export
        </h2>
        <p className="text-xs font-mono text-slate-400 mb-3">
          [PRIVATE] Assemble this component&apos;s trust-decision chain —
          observation, context, question, decision, expiry pressure,
          resolution, receipts — as an audit-ready bundle. The export is a
          view of existing records; generating it changes nothing and
          certifies nothing.
        </p>
        {exportError && <p className="mb-2 text-xs font-mono text-red-300" role="alert">{exportError}</p>}
        {!exportResult ? (
          <button
            type="button"
            onClick={handleGenerateExport}
            disabled={exportPending}
            className="px-3 py-1 text-xs font-mono border border-slate-600 text-slate-200 hover:bg-slate-800 disabled:opacity-50"
          >
            {exportPending ? 'assembling…' : 'Generate evidence bundle'}
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleCopyExport}
                className="px-3 py-1 text-xs font-mono border border-slate-600 text-slate-200 hover:bg-slate-800"
              >
                {exportCopied ? 'copied ✓' : 'Copy Markdown'}
              </button>
              <button
                type="button"
                onClick={handleDownloadExport}
                className="px-3 py-1 text-xs font-mono border border-slate-600 text-slate-200 hover:bg-slate-800"
              >
                Download .md
              </button>
              <button
                type="button"
                onClick={handleGenerateExport}
                disabled={exportPending}
                className="px-3 py-1 text-xs font-mono text-slate-400 hover:text-slate-100 disabled:opacity-50"
              >
                {exportPending ? 'assembling…' : 're-generate'}
              </button>
              {exportResult.bundle.honest_edges.missing.length > 0 && (
                <span className="text-[10px] font-mono text-slate-500">
                  {exportResult.bundle.honest_edges.missing.length} chain section(s) not present in the record — reported honestly, never fabricated.
                </span>
              )}
            </div>
            <pre className="font-mono text-xs text-slate-100 border border-slate-800 p-3 overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
              {exportResult.markdown}
            </pre>
          </div>
        )}
      </section>
    </div>
  );
}
