// /vault/:slug/exposures/:id — single component exposure (PR-6B).
//
// READ-ONLY. Renders one exposure record from the PR-6A foundation:
// metadata, trust_boundary, source, timestamps, status. There is NO edit
// control, NO "propose exception" button, NO linkage to the exception
// state machine. An exposure is an observation; turning one into a trust
// decision is a future, separately-authorized phase (6C).

import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { getExposure, isOk, type ComponentExposure } from '../../shared/vault/api-client';
import VaultAuthGate from '../../components/VaultAuthGate';

type Phase = 'loading' | 'unauth' | 'notfound' | 'ready' | 'error';

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

export default function VaultExposureDetail() {
  const { slug = '', id = '' } = useParams();
  const [phase, setPhase] = React.useState<Phase>('loading');
  const [exposure, setExposure] = React.useState<ComponentExposure | null>(null);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    let cancelled = false;
    if (!slug || !id) return;
    (async () => {
      const res = await getExposure(slug, id);
      if (cancelled) return;
      if (isOk(res)) {
        setExposure(res.data);
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

      <section>
        <h2 className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">metadata</h2>
        <pre className="font-mono text-sm text-slate-100 border border-slate-800 p-3 overflow-x-auto whitespace-pre">
          {formatJson(exposure.metadata)}
        </pre>
      </section>
    </div>
  );
}
