// /vault/:slug/evidence/:id — single evidence row.
//
// PR-V2-E. The server-side handler masks the `body` field when the
// viewer role lacks privilege OR the row is redacted (per the reviewer-
// fix from PR-V2-C). This page reads the X-OpenSoyce-Vault-Masked-Fields
// response header and surfaces the masking honestly: shows what's
// visible, names what was withheld, does NOT silently empty-string the
// missing data.

import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { getEvidence, isOk, type VaultEvidence } from '../../shared/vault/api-client';

type Phase = 'loading' | 'unauth' | 'notfound' | 'ready' | 'error';

export default function VaultEvidenceDetail() {
  const { slug = '', id = '' } = useParams();
  const [phase, setPhase] = React.useState<Phase>('loading');
  const [evidence, setEvidence] = React.useState<VaultEvidence | null>(null);
  const [maskedFields, setMaskedFields] = React.useState<string[]>([]);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    let cancelled = false;
    if (!slug || !id) return;
    (async () => {
      const res = await getEvidence(slug, id);
      if (cancelled) return;
      if (isOk(res)) {
        setEvidence(res.data);
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
  }, [slug, id]);

  if (phase === 'loading') return <p className="text-sm font-mono text-slate-400">Loading...</p>;
  if (phase === 'unauth') return <p className="text-sm font-mono text-slate-300">Sign in to view this evidence.</p>;
  if (phase === 'notfound') {
    return (
      <div className="border border-slate-700 bg-slate-800/40 p-5 max-w-xl">
        <p className="text-sm text-slate-300">Evidence not found.</p>
        <p className="mt-3 text-xs font-mono">
          <Link to={`/vault/${slug}/timeline`} className="text-slate-400 hover:text-slate-100">← back to timeline</Link>
        </p>
      </div>
    );
  }
  if (phase === 'error') return <p className="text-sm font-mono text-red-300" role="alert">{error}</p>;
  if (!evidence) return null;

  const bodyMasked = maskedFields.includes('body') || evidence.body === undefined;

  return (
    <div className="max-w-3xl">
      <p className="mb-4 text-xs font-mono">
        <Link to={`/vault/${slug}/timeline`} className="text-slate-400 hover:text-slate-100">← timeline</Link>
      </p>

      <header className="mb-6">
        <h1 className="text-xl font-mono font-bold tracking-tight">{evidence.evidence_class}</h1>
        <p className="text-xs font-mono text-slate-400 mt-1">
          {evidence.subject_kind ? `${evidence.subject_kind} ${evidence.subject_name}` : '—'} ·
          captured {evidence.created_at.slice(0, 10)} ·
          state: {evidence.redaction_state}
        </p>
      </header>

      <section className="mb-6">
        <h2 className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">summary</h2>
        <p className="font-mono text-sm text-slate-100 whitespace-pre-wrap">{evidence.summary}</p>
      </section>

      <section className="mb-6">
        <h2 className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">body</h2>
        {bodyMasked ? (
          <p className="font-mono text-sm text-slate-500 border border-slate-800 p-3">
            (body masked — {evidence.redaction_state !== 'visible'
              ? `row redaction_state = ${evidence.redaction_state}`
              : 'promote your role to view'})
          </p>
        ) : (
          <p className="font-mono text-sm text-slate-100 whitespace-pre-wrap border border-slate-800 p-3">
            {evidence.body || '—'}
          </p>
        )}
      </section>

      <section>
        <h2 className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">proof anchors</h2>
        <ul className="text-xs font-mono space-y-1 border border-slate-800 p-3">
          {evidence.proof_anchors.map((anchor, i) => {
            const a = anchor as { proofType?: string; label?: string; href?: string; visibility?: string };
            return (
              <li key={i} className="flex items-baseline gap-2">
                <span className="text-slate-500 uppercase">[{a.proofType || '?'}]</span>
                {a.visibility === 'private' ? (
                  <span className="text-slate-400">{a.label} <span className="text-slate-600">(private anchor)</span></span>
                ) : (
                  <a href={a.href} target="_blank" rel="noreferrer noopener" className="text-slate-100 underline hover:text-white">
                    {a.label}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
