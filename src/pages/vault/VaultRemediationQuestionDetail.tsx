// /vault/:slug/remediation-questions/:id — one remediation question
// (PR-15B).
//
// The page separates, visibly and deliberately:
//   1. OBSERVATION           — the dependency exposure the question is about
//   2. VULNERABILITY CONTEXT — the intelligence that prompted it (if any)
//   3. REMEDIATION QUESTION  — what is being asked, by whom, since when
//   4. HUMAN-SELECTED OUTCOME — the direction a person chose, or the form
//
// Answering records a DIRECTION; it does not execute it. If the human
// selects propose_exception, this page does NOT create a proposal — it
// links to the source exposure page, where the existing Phase 5 exception
// lane (explicit review + submit, then reviewer approval) lives. There is
// no parallel exception mechanism here.

import React from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getRemediationQuestion,
  answerRemediationQuestion,
  isOk,
  type RemediationQuestion,
  type RemediationOutcome,
} from '../../shared/vault/api-client';
import VaultAuthGate from '../../components/VaultAuthGate';

type Phase = 'loading' | 'unauth' | 'notfound' | 'ready' | 'error';

// Every entry is a direction for a PERSON to act on — never a transition
// the system performs.
const OUTCOME_OPTIONS: Array<{ value: RemediationOutcome; label: string; hint: string }> = [
  { value: 'fix_required', label: 'fix required', hint: 'A human will upgrade or patch the component.' },
  { value: 'defer', label: 'defer', hint: 'Reviewed; deliberately revisit later.' },
  { value: 'propose_exception', label: 'propose exception', hint: 'Continue in the exception lane — a reviewer still decides.' },
  { value: 'not_applicable', label: 'not applicable', hint: 'The risk context does not apply here.' },
  { value: 'needs_owner_review', label: 'needs owner review', hint: 'Escalate the question to the component owner.' },
  { value: 'replace_or_remove', label: 'replace or remove', hint: 'A human will swap or drop the package.' },
];

function outcomeLabel(outcome: string): string {
  return outcome.replace(/_/g, ' ');
}

function statusClass(status: string): string {
  if (status === 'open') return 'text-amber-300';
  if (status === 'answered') return 'text-emerald-300';
  if (status === 'cancelled') return 'text-slate-500';
  return 'text-slate-300';
}

export default function VaultRemediationQuestionDetail() {
  const { slug = '', id = '' } = useParams();
  const [phase, setPhase] = React.useState<Phase>('loading');
  const [question, setQuestion] = React.useState<RemediationQuestion | null>(null);
  const [error, setError] = React.useState('');

  // Answer-form state. Submitting answers the question exactly once; the
  // server guards the open -> answered transition.
  const [selectedOutcome, setSelectedOutcome] = React.useState<RemediationOutcome | ''>('');
  const [reasonPublic, setReasonPublic] = React.useState('');
  const [reasonPrivate, setReasonPrivate] = React.useState('');
  const [answerPending, setAnswerPending] = React.useState(false);
  const [answerError, setAnswerError] = React.useState('');

  React.useEffect(() => {
    let cancelled = false;
    if (!slug || !id) return;
    (async () => {
      const res = await getRemediationQuestion(slug, id);
      if (cancelled) return;
      if (isOk(res)) {
        setQuestion(res.data);
        setPhase('ready');
        return;
      }
      if (res.status === 401) { setPhase('unauth'); return; }
      if (res.status === 404) { setPhase('notfound'); return; }
      setError(res.message);
      setPhase('error');
    })();
    return () => { cancelled = true; };
  }, [slug, id]);

  async function submitAnswer() {
    if (!selectedOutcome) {
      setAnswerError('Select a direction first — the question stays open until a human decides.');
      return;
    }
    setAnswerPending(true);
    setAnswerError('');
    const res = await answerRemediationQuestion(slug, id, {
      selected_outcome: selectedOutcome,
      reason_public: reasonPublic.trim() || undefined,
      reason_private: reasonPrivate || undefined,
    });
    setAnswerPending(false);
    if (!isOk(res)) {
      setAnswerError(res.message);
      return;
    }
    setQuestion(res.data);
  }

  if (phase === 'loading') return <p className="text-sm font-mono text-slate-400">Loading...</p>;
  if (phase === 'unauth') return <VaultAuthGate message="Sign in to view this remediation question. You'll land back here." />;
  if (phase === 'notfound') {
    return (
      <div className="border border-slate-700 bg-slate-800/40 p-5 max-w-xl">
        <p className="text-sm text-slate-300">Remediation question not found, or you are not a member of the workspace.</p>
        <p className="mt-3 text-xs font-mono">
          <Link to={`/vault/${slug}/remediation-questions`} className="text-slate-400 hover:text-slate-100">← back to remediation questions</Link>
        </p>
      </div>
    );
  }
  if (phase === 'error') return <p className="text-sm font-mono text-red-300" role="alert">{error}</p>;
  if (!question) return null;

  const exposure = question.source_exposure || null;
  const intel = question.source_vuln_intel || null;

  return (
    <div className="max-w-3xl">
      <p className="mb-4 text-xs font-mono">
        <Link to={`/vault/${slug}/remediation-questions`} className="text-slate-400 hover:text-slate-100">← remediation questions</Link>
      </p>

      <header className="mb-6">
        <h1 className="text-xl font-mono font-bold tracking-tight">
          <span className="text-slate-500">remediation question</span> {question.package_name}
          {question.observed_version ? <span className="text-slate-400">@{question.observed_version}</span> : null}
        </h1>
        <p className="text-xs font-mono text-slate-400 mt-1">
          [PRIVATE] {question.question_kind.replace(/_/g, ' ')} ·
          <span className={`ml-1 ${statusClass(question.status)}`}>{question.status}</span>
        </p>
      </header>

      {/* 1. OBSERVATION — what was seen. Read-only; this page never writes
          the exposure. */}
      <section className="mb-6">
        <h2 className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">Observation</h2>
        {exposure ? (
          <div className="border border-slate-800 p-3 text-xs font-mono space-y-1">
            <p className="text-slate-100">
              <span className="text-slate-500 mr-1">{exposure.subject_kind}</span>
              {exposure.subject_name}
              <span className="ml-2 text-slate-500">{exposure.exposure_type || '—'}</span>
            </p>
            <p className="text-slate-400">
              source: {exposure.source_kind}{exposure.source_ref ? ` · ${exposure.source_ref}` : ''}
            </p>
            <p>
              <Link
                to={`/vault/${slug}/exposures/${encodeURIComponent(exposure.exposure_id)}`}
                className="text-slate-400 hover:text-slate-100 underline"
              >
                View source exposure {exposure.exposure_id.slice(0, 8)}
              </Link>
            </p>
          </div>
        ) : (
          <p className="text-xs font-mono text-slate-500 border border-slate-800 p-3">
            The source exposure is no longer on record. The question keeps what
            was observed: {question.package_name}
            {question.observed_version ? `@${question.observed_version}` : ''}.
          </p>
        )}
      </section>

      {/* 2. VULNERABILITY CONTEXT — what a source asserted. Context only:
          it opened this question; it does not decide the answer. */}
      <section className="mb-6">
        <h2 className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">Vulnerability context</h2>
        {intel ? (
          <div className="border border-slate-800 p-3 text-xs font-mono space-y-1">
            <p className="text-slate-100">
              {intel.source_ref ? (
                <a href={intel.source_ref} target="_blank" rel="noreferrer noopener" className="underline hover:text-white">
                  {intel.vuln_id}
                </a>
              ) : intel.vuln_id}
              <span className="ml-2 text-slate-400">{intel.severity || 'severity unrated'}</span>
              <span className="ml-2 text-slate-500">{intel.source} · {intel.match_basis}</span>
            </p>
            {intel.affected_range && <p className="text-slate-400">affected: {intel.affected_range}</p>}
            {typeof intel.metadata?.summary === 'string' && intel.metadata.summary && (
              <p className="text-slate-400">{intel.metadata.summary}</p>
            )}
            <p className="text-slate-500">
              Context only — it opened this question; it does not decide the answer.
            </p>
          </div>
        ) : question.vuln_id ? (
          <p className="text-xs font-mono text-slate-500 border border-slate-800 p-3">
            Opened from intelligence about {question.vuln_id}; the intelligence
            row is no longer on record. The question preserved the identifier.
          </p>
        ) : (
          <p className="text-xs font-mono text-slate-500 border border-slate-800 p-3">
            No vulnerability context — this is a component risk review opened
            directly from the observation.
          </p>
        )}
      </section>

      {/* 3. REMEDIATION QUESTION — what is being asked, by whom, since when. */}
      <section className="mb-6">
        <h2 className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">Remediation question</h2>
        <div className="border border-slate-800 p-3 text-xs font-mono space-y-1">
          <p className="text-slate-100">
            {question.question_kind === 'vulnerability_review'
              ? `A source reports ${question.vuln_id || 'a vulnerability'} against ${question.package_name}${question.observed_version ? `@${question.observed_version}` : ''}. What should the organization do about it?`
              : `${question.package_name}${question.observed_version ? `@${question.observed_version}` : ''} was observed in use. What should the organization do about its risk?`}
          </p>
          <p className="text-slate-400">
            opened by {question.created_by ? `@${question.created_by.github_login}` : '—'} · {question.created_at.slice(0, 19).replace('T', ' ')}
          </p>
          {question.due_at && (
            <p className="text-slate-400">
              due {question.due_at.slice(0, 10)}
              <span className="text-slate-500 ml-2">(recorded context — nothing transitions automatically on this date)</span>
            </p>
          )}
        </div>
      </section>

      {/* 4. HUMAN-SELECTED OUTCOME — the decision, or the form. The system
          asks; the human decides; the record remembers. */}
      <section className="border border-slate-700 bg-slate-800/40 p-4">
        <h2 className="text-sm font-mono font-bold mb-2 uppercase tracking-wider text-slate-300">
          Human-selected outcome
        </h2>
        <p className="text-xs font-mono text-slate-400 mb-3">
          The question does not decide. A selected outcome records a direction
          for a person to act on — it does not fix, except, approve, or change
          trust state.
        </p>

        {question.status === 'answered' && question.selected_outcome ? (
          <div className="space-y-2">
            <p className="text-sm font-mono text-emerald-200">
              {outcomeLabel(question.selected_outcome)}
            </p>
            <p className="text-xs font-mono text-slate-400">
              answered by {question.answered_by ? `@${question.answered_by.github_login}` : '—'}
              {question.answered_at ? ` · ${question.answered_at.slice(0, 19).replace('T', ' ')}` : ''}
            </p>
            {question.reason_public && (
              <p className="text-xs font-mono text-slate-300">{question.reason_public}</p>
            )}
            {question.reason_private && (
              <p className="text-xs font-mono text-slate-500">[private] {question.reason_private}</p>
            )}
            {question.selected_outcome === 'propose_exception' && (
              <div className="border border-sky-800 bg-sky-900/20 p-3 mt-2">
                <p className="text-xs font-mono text-sky-200">
                  This direction continues in the exception lane. Proposing is
                  its own explicit step on the source exposure page, and a
                  reviewer still decides.
                </p>
                {exposure && (
                  <p className="mt-2 text-xs font-mono">
                    <Link
                      to={`/vault/${slug}/exposures/${encodeURIComponent(exposure.exposure_id)}`}
                      className="text-sky-200 underline hover:text-white"
                    >
                      Continue on exposure {exposure.exposure_id.slice(0, 8)}
                    </Link>
                  </p>
                )}
              </div>
            )}
          </div>
        ) : question.status === 'cancelled' ? (
          <p className="text-xs font-mono text-slate-500">
            This question was cancelled without an answer.
          </p>
        ) : (
          <div className="space-y-3">
            {answerError && (
              <p className="text-xs font-mono text-red-300" role="alert">{answerError}</p>
            )}
            <fieldset>
              <legend className="block text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-2">
                direction (answered exactly once)
              </legend>
              <div className="space-y-1">
                {OUTCOME_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex items-baseline gap-2 text-xs font-mono text-slate-200">
                    <input
                      type="radio"
                      name="remediation-outcome"
                      value={opt.value}
                      checked={selectedOutcome === opt.value}
                      onChange={() => setSelectedOutcome(opt.value)}
                    />
                    <span>
                      {opt.label}
                      <span className="text-slate-500 ml-2">{opt.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block">
              <span className="block text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1">public reason (optional, 280 max)</span>
              <input
                type="text"
                value={reasonPublic}
                onChange={(e) => setReasonPublic(e.target.value)}
                maxLength={280}
                className="w-full bg-slate-900 border border-slate-700 px-3 py-1 font-mono text-xs text-slate-100"
              />
            </label>
            <label className="block">
              <span className="block text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1">private reason (optional)</span>
              <textarea
                value={reasonPrivate}
                onChange={(e) => setReasonPrivate(e.target.value)}
                rows={3}
                className="w-full bg-slate-900 border border-slate-700 px-3 py-1 font-mono text-xs text-slate-100"
              />
            </label>
            <button
              type="button"
              onClick={submitAnswer}
              disabled={answerPending}
              className="px-4 py-2 text-sm font-mono bg-slate-100 text-slate-900 hover:bg-white disabled:opacity-50"
            >
              {answerPending ? 'Recording...' : 'Record human decision'}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
