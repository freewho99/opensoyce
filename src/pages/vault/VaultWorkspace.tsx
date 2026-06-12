// /vault/:slug — workspace home.
//
// PR-V2-E. Shows the workspace metadata, the member list, and quick
// links into the exception list and timeline.

import React from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  fetchWorkspace,
  getEvidencePacket,
  isOk,
  type VaultWorkspaceDetail,
  type EvidencePacketResponse,
} from '../../shared/vault/api-client';
import VaultAuthGate from '../../components/VaultAuthGate';

type Phase = 'loading' | 'unauth' | 'notfound' | 'ready' | 'error';

export default function VaultWorkspace() {
  const { slug = '' } = useParams();
  const [phase, setPhase] = React.useState<Phase>('loading');
  const [detail, setDetail] = React.useState<VaultWorkspaceDetail | null>(null);
  const [error, setError] = React.useState('');

  // PR-17B rollup evidence packet. Generating is a READ — a rollup is
  // composition, not certification; the record is unchanged by it.
  const [packetPending, setPacketPending] = React.useState(false);
  const [packetError, setPacketError] = React.useState('');
  const [packetResult, setPacketResult] = React.useState<EvidencePacketResponse | null>(null);
  const [packetIds, setPacketIds] = React.useState('');
  const [packetCopied, setPacketCopied] = React.useState(false);

  async function handleGeneratePacket() {
    setPacketError('');
    setPacketCopied(false);
    setPacketPending(true);
    const ids = packetIds.split(',').map((s) => s.trim()).filter(Boolean);
    const res = await getEvidencePacket(slug, ids.length > 0 ? { exposureIds: ids } : undefined);
    setPacketPending(false);
    if (!isOk(res)) { setPacketError(res.message); return; }
    setPacketResult(res.data);
  }

  async function handleCopyPacket() {
    if (!packetResult) return;
    try {
      await navigator.clipboard.writeText(packetResult.markdown);
      setPacketCopied(true);
    } catch {
      setPacketError('Copy failed — select the text and copy manually.');
    }
  }

  function handleDownloadPacket() {
    if (!packetResult) return;
    const blob = new Blob([packetResult.markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evidence-packet-${slug}-${packetResult.packet.generated_at.slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  React.useEffect(() => {
    let cancelled = false;
    if (!slug) return;
    (async () => {
      const res = await fetchWorkspace(slug);
      if (cancelled) return;
      if (isOk(res)) {
        setDetail(res.data);
        setPhase('ready');
        return;
      }
      if (res.status === 401) {
        setPhase('unauth');
        return;
      }
      if (res.status === 404) {
        setPhase('notfound');
        return;
      }
      setError(res.message);
      setPhase('error');
    })();
    return () => { cancelled = true; };
  }, [slug]);

  if (phase === 'loading') return <p className="text-sm font-mono text-slate-400">Loading...</p>;
  if (phase === 'unauth') return <VaultAuthGate message="Sign in to view this workspace. You'll land back here." />;
  if (phase === 'notfound') {
    return (
      <div className="border border-slate-700 bg-slate-800/40 p-5">
        <p className="text-sm text-slate-300">
          Workspace not found, or you are not a member.
        </p>
        <p className="mt-3 text-xs font-mono">
          <Link to="/vault" className="text-slate-400 hover:text-slate-100">← back to workspaces</Link>
        </p>
      </div>
    );
  }
  if (phase === 'error') return <p className="text-sm font-mono text-red-300" role="alert">{error}</p>;
  if (!detail) return null;

  return (
    <div>
      <header className="mb-6 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-xl font-mono font-bold tracking-tight">{detail.display_name}</h1>
          <p className="text-xs font-mono text-slate-400 mt-1">
            /{detail.slug}
            <span className="ml-3 px-2 py-0.5 border border-slate-700 uppercase tracking-wider">
              {detail.membership.role}
            </span>
          </p>
        </div>
      </header>

      <section className="mb-8">
        <h2 className="text-sm font-mono font-bold mb-3 uppercase tracking-wider text-slate-400">Quick actions</h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
          <li>
            <Link
              to={`/vault/${detail.slug}/exceptions`}
              className="block border border-slate-700 hover:border-slate-500 bg-slate-800/40 p-4"
            >
              <span className="block font-mono text-sm text-slate-100">Trust Expiry</span>
              <span className="block font-mono text-xs text-slate-400 mt-1">View active exceptions and review queue</span>
            </Link>
          </li>
          <li>
            <Link
              to={`/vault/${detail.slug}/timeline`}
              className="block border border-slate-700 hover:border-slate-500 bg-slate-800/40 p-4"
            >
              <span className="block font-mono text-sm text-slate-100">Vault Timeline</span>
              <span className="block font-mono text-xs text-slate-400 mt-1">Workspace audit history (private)</span>
            </Link>
          </li>
          <li>
            <Link
              to={`/vault/${detail.slug}/exposures`}
              className="block border border-slate-700 hover:border-slate-500 bg-slate-800/40 p-4"
            >
              <span className="block font-mono text-sm text-slate-100">Component Exposures</span>
              <span className="block font-mono text-xs text-slate-400 mt-1">Recorded component exposure records (private)</span>
            </Link>
          </li>
          <li>
            <Link
              to={`/vault/${detail.slug}/remediation-questions`}
              className="block border border-slate-700 hover:border-slate-500 bg-slate-800/40 p-4"
            >
              <span className="block font-mono text-sm text-slate-100">Remediation Questions</span>
              <span className="block font-mono text-xs text-slate-400 mt-1">Open questions on observed component risk (private)</span>
            </Link>
          </li>
        </ul>
      </section>

      {/* PR-17B: rollup evidence packet. Composition, not certification —
          the packet composes existing per-chain records, preserves mixed
          states, and carries its own non-claims. Read-only. */}
      <section className="mb-8 border border-slate-700 bg-slate-800/40 p-4 max-w-3xl">
        <h2 className="text-sm font-mono font-bold mb-2 uppercase tracking-wider text-slate-300">
          Evidence packet
        </h2>
        <p className="text-xs font-mono text-slate-400 mb-3">
          [PRIVATE] Compose the workspace&apos;s component trust chains into one
          evidence packet — decision-bearing chains in full, observation-only
          exposures as inventory, mixed states reported honestly. The packet
          is a view of existing records; generating it changes nothing and
          certifies nothing.
        </p>
        {packetError && <p className="mb-2 text-xs font-mono text-red-300" role="alert">{packetError}</p>}
        {!packetResult ? (
          <div className="space-y-3">
            <label className="block">
              <span className="block text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1">
                selected exposure ids (optional, comma-separated — leave empty for the workspace packet)
              </span>
              <input
                type="text"
                value={packetIds}
                onChange={(e) => setPacketIds(e.target.value)}
                placeholder="uuid, uuid, …"
                className="w-full bg-slate-900 border border-slate-700 px-3 py-1 font-mono text-xs text-slate-100"
              />
            </label>
            <button
              type="button"
              onClick={handleGeneratePacket}
              disabled={packetPending}
              className="px-3 py-1 text-xs font-mono border border-slate-600 text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            >
              {packetPending ? 'composing…' : packetIds.trim() ? 'Generate selected component packet' : 'Generate workspace evidence packet'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleCopyPacket}
                className="px-3 py-1 text-xs font-mono border border-slate-600 text-slate-200 hover:bg-slate-800"
              >
                {packetCopied ? 'copied ✓' : 'Copy Markdown'}
              </button>
              <button
                type="button"
                onClick={handleDownloadPacket}
                className="px-3 py-1 text-xs font-mono border border-slate-600 text-slate-200 hover:bg-slate-800"
              >
                Download .md
              </button>
              <button
                type="button"
                onClick={() => { setPacketResult(null); setPacketCopied(false); }}
                className="px-3 py-1 text-xs font-mono text-slate-400 hover:text-slate-100"
              >
                new packet
              </button>
              <span className="text-[10px] font-mono text-slate-500">
                {packetResult.packet.state_rollup.chains_included} chain(s) ·{' '}
                {packetResult.packet.state_rollup.observation_only_exposures} observation-only ·{' '}
                mixed states reported, not collapsed.
              </span>
            </div>
            <pre className="font-mono text-xs text-slate-100 border border-slate-800 p-3 overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
              {packetResult.markdown}
            </pre>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-mono font-bold mb-3 uppercase tracking-wider text-slate-400">Members</h2>
        <ul className="divide-y divide-slate-800 border border-slate-800 max-w-xl">
          {detail.members.map((m) => (
            <li key={`${m.github_login}-${m.added_at}`} className="flex items-center justify-between px-3 py-2">
              <span className="font-mono text-sm">@{m.github_login}</span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400 border border-slate-700 px-2 py-0.5">
                {m.role}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
