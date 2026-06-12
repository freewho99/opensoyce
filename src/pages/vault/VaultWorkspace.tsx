// /vault/:slug — workspace home.
//
// PR-V2-E. Shows the workspace metadata, the member list, and quick
// links into the exception list and timeline.

import React from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  fetchWorkspace,
  getEvidencePacket,
  listApiTokens,
  mintApiTokenRequest,
  revokeApiToken,
  listWebhooks,
  createWebhook,
  disableWebhook,
  isOk,
  type VaultWorkspaceDetail,
  type EvidencePacketResponse,
  type VaultApiToken,
  type VaultWebhook,
  type WebhookEventType,
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

  // PR-17C: Trust Record API tokens + webhook subscriptions (owner-only
  // admin). Tokens are READ-ONLY machine credentials; the raw token and
  // the webhook signing secret are each shown exactly once at creation.
  const [apiTokens, setApiTokens] = React.useState<VaultApiToken[]>([]);
  const [webhooks, setWebhooks] = React.useState<VaultWebhook[]>([]);
  const [adminLoaded, setAdminLoaded] = React.useState(false);
  const [adminError, setAdminError] = React.useState('');
  const [tokenName, setTokenName] = React.useState('');
  const [mintedToken, setMintedToken] = React.useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = React.useState('');
  const [webhookEvents, setWebhookEvents] = React.useState<WebhookEventType[]>([]);
  const [createdSecret, setCreatedSecret] = React.useState<string | null>(null);
  const [adminPending, setAdminPending] = React.useState(false);

  const isOwner = detail?.membership.role === 'owner';

  React.useEffect(() => {
    if (!isOwner || adminLoaded || !slug) return;
    let cancelled = false;
    (async () => {
      const [tokens, hooks] = await Promise.all([listApiTokens(slug), listWebhooks(slug)]);
      if (cancelled) return;
      if (isOk(tokens)) setApiTokens(tokens.data.tokens);
      if (isOk(hooks)) setWebhooks(hooks.data.webhooks);
      setAdminLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [isOwner, adminLoaded, slug]);

  async function handleMintToken() {
    if (!tokenName.trim()) { setAdminError('Token name is required.'); return; }
    setAdminError(''); setAdminPending(true);
    const res = await mintApiTokenRequest(slug, tokenName.trim());
    setAdminPending(false);
    if (!isOk(res)) { setAdminError(res.message); return; }
    setMintedToken(res.data.raw_token);
    setApiTokens((prev) => [res.data.token, ...prev]);
    setTokenName('');
  }

  async function handleRevokeToken(tokenId: string) {
    setAdminError(''); setAdminPending(true);
    const res = await revokeApiToken(slug, tokenId);
    setAdminPending(false);
    if (!isOk(res)) { setAdminError(res.message); return; }
    setApiTokens((prev) => prev.map((t) => (t.token_id === tokenId ? res.data.token : t)));
  }

  async function handleCreateWebhook() {
    if (!webhookUrl.trim() || webhookEvents.length === 0) {
      setAdminError('A target URL and at least one event type are required.');
      return;
    }
    setAdminError(''); setAdminPending(true);
    const res = await createWebhook(slug, { target_url: webhookUrl.trim(), event_types: webhookEvents });
    setAdminPending(false);
    if (!isOk(res)) { setAdminError(res.message); return; }
    setCreatedSecret(res.data.signing_secret);
    setWebhooks((prev) => [res.data.webhook, ...prev]);
    setWebhookUrl('');
    setWebhookEvents([]);
  }

  async function handleDisableWebhook(subscriptionId: string) {
    setAdminError(''); setAdminPending(true);
    const res = await disableWebhook(slug, subscriptionId);
    setAdminPending(false);
    if (!isOk(res)) { setAdminError(res.message); return; }
    setWebhooks((prev) => prev.map((w) => (w.subscription_id === subscriptionId ? res.data.webhook : w)));
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

      {/* PR-17C: Trust Record API + webhooks (owner admin). The API
          exposes records; it does not create new trust conclusions. A
          webhook notifies that a record changed; it does not certify the
          meaning of the change. Raw token / signing secret are shown
          exactly once. */}
      {isOwner && (
        <section className="mb-8 border border-slate-700 bg-slate-800/40 p-4 max-w-3xl">
          <h2 className="text-sm font-mono font-bold mb-2 uppercase tracking-wider text-slate-300">
            Trust Record API &amp; webhooks
          </h2>
          <p className="text-xs font-mono text-slate-400 mb-3">
            [PRIVATE] Read-only API tokens let external systems consume this
            workspace&apos;s trust records (<span className="text-slate-200">Authorization: Bearer osy_…</span>).
            Webhooks notify your endpoint when a record changes — they do not
            certify the meaning of the change.
          </p>
          {adminError && <p className="mb-2 text-xs font-mono text-red-300" role="alert">{adminError}</p>}

          <h3 className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">Read-only API tokens</h3>
          {mintedToken && (
            <div className="mb-3 border border-emerald-700 bg-emerald-900/30 p-3">
              <p className="text-xs font-mono text-emerald-200">
                Token minted — store it now; it is shown once and cannot be retrieved again.
              </p>
              <pre className="mt-2 font-mono text-xs text-emerald-100 break-all whitespace-pre-wrap">{mintedToken}</pre>
              <button
                type="button"
                onClick={() => setMintedToken(null)}
                className="mt-2 px-2 py-0.5 text-[10px] font-mono border border-emerald-700 text-emerald-200 hover:bg-emerald-900/40"
              >
                I stored it — dismiss
              </button>
            </div>
          )}
          {apiTokens.length > 0 && (
            <ul className="border border-slate-800 divide-y divide-slate-800 text-xs font-mono mb-3">
              {apiTokens.map((t) => (
                <li key={t.token_id} className="px-3 py-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-slate-100">{t.token_name}</span>
                  <span className="text-slate-500">scope: {t.scope}</span>
                  <span className="text-slate-500">created {t.created_at.slice(0, 10)}</span>
                  {t.last_used_at && <span className="text-slate-500">last used {t.last_used_at.slice(0, 10)}</span>}
                  {t.revoked_at ? (
                    <span className="text-red-300">revoked</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleRevokeToken(t.token_id)}
                      disabled={adminPending}
                      className="px-2 py-0.5 text-[10px] font-mono border border-slate-600 text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                    >
                      revoke
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-2 mb-5">
            <input
              type="text"
              value={tokenName}
              onChange={(e) => setTokenName(e.target.value)}
              placeholder="token name (e.g. ci-reader)"
              maxLength={80}
              className="flex-1 bg-slate-900 border border-slate-700 px-3 py-1 font-mono text-xs text-slate-100"
            />
            <button
              type="button"
              onClick={handleMintToken}
              disabled={adminPending}
              className="px-3 py-1 text-xs font-mono border border-slate-600 text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            >
              Mint read-only token
            </button>
          </div>

          <h3 className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">Webhook subscriptions</h3>
          {createdSecret && (
            <div className="mb-3 border border-emerald-700 bg-emerald-900/30 p-3">
              <p className="text-xs font-mono text-emerald-200">
                Webhook created — store the signing secret now; it is shown once.
                Verify deliveries with HMAC-SHA256 over the raw body
                (X-OpenSoyce-Webhook-Signature).
              </p>
              <pre className="mt-2 font-mono text-xs text-emerald-100 break-all whitespace-pre-wrap">{createdSecret}</pre>
              <button
                type="button"
                onClick={() => setCreatedSecret(null)}
                className="mt-2 px-2 py-0.5 text-[10px] font-mono border border-emerald-700 text-emerald-200 hover:bg-emerald-900/40"
              >
                I stored it — dismiss
              </button>
            </div>
          )}
          {webhooks.length > 0 && (
            <ul className="border border-slate-800 divide-y divide-slate-800 text-xs font-mono mb-3">
              {webhooks.map((w) => (
                <li key={w.subscription_id} className="px-3 py-2 space-y-1">
                  <p className="text-slate-100 break-all">{w.target_url}</p>
                  <p className="text-slate-500">
                    {w.event_types.join(', ')} · created {w.created_at.slice(0, 10)}
                    {w.disabled_at ? (
                      <span className="text-red-300 ml-2">disabled</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleDisableWebhook(w.subscription_id)}
                        disabled={adminPending}
                        className="ml-2 px-2 py-0.5 text-[10px] font-mono border border-slate-600 text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                      >
                        disable
                      </button>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <div className="space-y-2">
            <input
              type="text"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://your-endpoint.example.com/opensoyce"
              maxLength={512}
              className="w-full bg-slate-900 border border-slate-700 px-3 py-1 font-mono text-xs text-slate-100"
            />
            <div className="flex flex-wrap gap-3">
              {(['exception.expired', 'reviewer_resolution.recorded', 'remediation_evidence.recorded'] as WebhookEventType[]).map((ev) => (
                <label key={ev} className="flex items-baseline gap-1 text-xs font-mono text-slate-300">
                  <input
                    type="checkbox"
                    checked={webhookEvents.includes(ev)}
                    onChange={(e) => setWebhookEvents((prev) => (
                      e.target.checked ? [...prev, ev] : prev.filter((x) => x !== ev)
                    ))}
                  />
                  {ev}
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={handleCreateWebhook}
              disabled={adminPending}
              className="px-3 py-1 text-xs font-mono border border-slate-600 text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            >
              Create webhook
            </button>
          </div>
        </section>
      )}

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
