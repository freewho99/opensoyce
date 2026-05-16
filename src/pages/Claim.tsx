import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Github, Loader2, Check, AlertCircle, ShieldCheck, ExternalLink, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { trackEvent } from '../utils/analytics';

/**
 * /claim — the maintainer rebuttal channel.
 *
 * Flow:
 *   1. User lands on /claim with no query params. Sees the entry form:
 *      owner + repo input, "Verify with GitHub" CTA.
 *   2. Click "Verify with GitHub" -> browser GET /api/claim-start?owner=&repo=,
 *      which 302-redirects to GitHub OAuth.
 *   3. After auth, GitHub redirects to /api/claim-callback. The callback
 *      verifies collaborator status, then 302-redirects to
 *      /claim?owner=...&repo=...&token=<signed-claim-token>.
 *   4. With ?token=... present, the page renders the rebuttal textarea.
 *      Submit POSTs { token, rebuttalBody } to /api/claim-submit.
 *   5. On success, the page renders the freshly-created GitHub issue URL.
 *
 * Note: localStorage "claim" is gone — that flow was theater.
 */

const MIN_BODY = 30;
const MAX_BODY = 10_000;

const NAME_RX = /^[A-Za-z0-9._-]+$/;
function isValidName(s: string): boolean {
  return !!s && s.length <= 100 && NAME_RX.test(s) && !s.includes('..') && s !== '.' && s !== '..';
}

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success'; issueUrl: string; issueNumber: number }
  | { kind: 'error'; message: string };

function useQueryParams() {
  return useMemo(() => {
    if (typeof window === 'undefined') return { owner: '', repo: '', token: '' };
    const sp = new URLSearchParams(window.location.search);
    return {
      owner: sp.get('owner') || '',
      repo: sp.get('repo') || '',
      token: sp.get('token') || '',
    };
  }, []);
}

export default function Claim() {
  const { owner: qOwner, repo: qRepo, token: qToken } = useQueryParams();

  useEffect(() => {
    trackEvent('page_view', { page: '/claim', hasToken: !!qToken });
  }, [qToken]);

  // Verified mode = we came back from OAuth with a signed claim-token.
  if (qToken && qOwner && qRepo) {
    return <RebuttalForm owner={qOwner} repo={qRepo} token={qToken} />;
  }

  return <ClaimEntry />;
}

// ---------------------------------------------------------------------------
// Entry form — owner/repo input + Verify-with-GitHub button.
// ---------------------------------------------------------------------------
function ClaimEntry() {
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const canSubmit = isValidName(owner) && isValidName(repo);

  const handleVerify = () => {
    if (!canSubmit) {
      setError('Owner and repo must be valid GitHub names (letters, numbers, ., -, _).');
      return;
    }
    setError(null);
    trackEvent('claim_verify_click', { owner, repo });
    const params = new URLSearchParams({ owner, repo });
    // Full page navigation — the OAuth round-trip leaves the SPA.
    window.location.href = `/api/claim-start?${params.toString()}`;
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-20 min-h-[80vh]">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <div className="bg-soy-red text-white p-6 rotate-1 mb-8 shadow-[8px_8px_0px_#000] inline-block">
          <h1 className="text-3xl md:text-5xl font-black uppercase italic tracking-tighter">PUSH BACK ON YOUR SOYCE SCORE</h1>
        </div>

        <p className="text-xl font-bold uppercase tracking-widest opacity-60 mb-8 max-w-2xl">
          Maintain a repo OpenSoyce got wrong? File a rebuttal. It opens a public,
          labeled GitHub issue against <span className="text-soy-bottle">freewho99/opensoyce</span>{' '}
          that the team is on the hook to respond to.
        </p>

        <div className="bg-white border-4 border-soy-bottle p-8 shadow-[8px_8px_0px_#302C26] mb-8">
          <h3 className="text-sm font-black uppercase tracking-widest mb-6 opacity-40 italic">REPO YOU MAINTAIN</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
            <input
              type="text"
              placeholder="OWNER"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              className="bg-soy-label/20 border-2 border-soy-bottle p-4 font-black italic outline-none focus:ring-2 focus:ring-soy-red"
            />
            <input
              type="text"
              placeholder="REPO"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              className="bg-soy-label/20 border-2 border-soy-bottle p-4 font-black italic outline-none focus:ring-2 focus:ring-soy-red"
            />
          </div>
          {error && (
            <div className="flex items-center gap-2 mt-4 text-soy-red font-bold uppercase tracking-widest text-xs">
              <AlertCircle size={16} /> {error}
            </div>
          )}
        </div>

        <button
          onClick={handleVerify}
          disabled={!canSubmit}
          className="w-full md:w-auto group relative bg-soy-red text-white px-12 py-6 text-2xl font-black uppercase italic shadow-[8px_8px_0px_#000] hover:translate-x-1 hover:-translate-y-1 transition-transform disabled:opacity-40"
        >
          <div className="flex items-center gap-4 justify-center">
            <Github size={28} />
            VERIFY WITH GITHUB &rarr;
          </div>
        </button>

        <div className="mt-10 bg-soy-label/40 border-2 border-soy-bottle p-6 max-w-2xl">
          <div className="flex gap-3">
            <Info size={20} className="flex-shrink-0 mt-1" />
            <div className="text-sm font-bold leading-relaxed">
              <p className="mb-2 uppercase tracking-widest text-xs opacity-60">OAUTH SCOPE</p>
              <p className="mb-2">
                You'll authorize OpenSoyce to read your repo memberships
                (<code className="bg-white px-1">read:user</code> +{' '}
                <code className="bg-white px-1">repo</code>). We use this only to
                confirm you maintain <strong>{owner || 'owner'}/{repo || 'repo'}</strong>,
                then we discard the token. We never store it, never log it, never
                write to your repo.
              </p>
              <p>The rebuttal is opened by the OpenSoyce GitHub App, not by your account.</p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Verified rebuttal form — visible after OAuth callback round-trip.
// ---------------------------------------------------------------------------
function RebuttalForm({ owner, repo, token }: { owner: string; repo: string; token: string }) {
  const [text, setText] = useState('');
  const [state, setState] = useState<SubmitState>({ kind: 'idle' });

  const trimmed = text.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_BODY;
  const tooLong = trimmed.length > MAX_BODY;
  const canSubmit = trimmed.length >= MIN_BODY && trimmed.length <= MAX_BODY && state.kind !== 'submitting';

  const submit = async () => {
    if (!canSubmit) return;
    setState({ kind: 'submitting' });
    trackEvent('claim_rebuttal_submit', { owner, repo, length: trimmed.length });
    try {
      const res = await fetch('/api/claim-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, rebuttalBody: trimmed }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) {
        const code = (data && data.error) || `HTTP_${res.status}`;
        let message = 'Something went wrong filing the rebuttal.';
        if (code === 'INVALID_OR_EXPIRED_TOKEN') {
          message = 'Your verification token has expired (10-minute window). Please re-verify with GitHub.';
        } else if (code === 'BODY_TOO_SHORT') {
          message = `Rebuttal must be at least ${MIN_BODY} characters.`;
        } else if (code === 'BODY_TOO_LONG') {
          message = `Rebuttal must be at most ${MAX_BODY} characters.`;
        } else if (code === 'ISSUE_CREATE_FAILED' || code === 'GITHUB_APP_UNAVAILABLE') {
          message = (data && data.message) || 'OpenSoyce could not open the GitHub issue. Try again shortly.';
        }
        setState({ kind: 'error', message });
        return;
      }
      setState({ kind: 'success', issueUrl: data.issueUrl, issueNumber: data.issueNumber });
    } catch (err) {
      setState({ kind: 'error', message: 'Network error. Try again.' });
    }
  };

  if (state.kind === 'success') {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 min-h-[80vh]">
        <motion.div initial={{ opacity: 0, rotate: -1 }} animate={{ opacity: 1, rotate: 0 }}>
          <div className="bg-emerald-500 text-white p-12 shadow-[12px_12px_0px_#000] text-center mb-10">
            <Check size={80} className="mx-auto mb-6" strokeWidth={4} />
            <h2 className="text-5xl md:text-7xl font-black uppercase italic tracking-tighter mb-4 leading-none">REBUTTAL FILED.</h2>
            <p className="text-xl font-black uppercase tracking-widest italic opacity-80">Issue #{state.issueNumber} on freewho99/opensoyce</p>
          </div>

          <div className="bg-white border-4 border-soy-bottle p-8 shadow-[8px_8px_0px_#000] space-y-6">
            <p className="font-bold leading-relaxed">
              Your rebuttal for <strong>{owner}/{repo}</strong> is now a public, labeled
              GitHub issue. Subscribe to the thread to get email updates when the
              OpenSoyce team responds.
            </p>
            <a
              href={state.issueUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 bg-soy-bottle text-soy-label px-6 py-4 text-lg font-black uppercase tracking-widest hover:bg-soy-red transition-colors shadow-[4px_4px_0px_#000]"
            >
              <ExternalLink size={20} /> OPEN ISSUE ON GITHUB
            </a>
            <p className="text-xs font-bold uppercase tracking-widest opacity-40 pt-4 border-t-2 border-soy-label">
              Click "Subscribe" on the GitHub issue to receive notifications when the team replies.
            </p>
            <Link to="/" className="block text-center font-black uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity">
              &larr; Back home
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-20 min-h-[80vh]">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <div className="inline-flex items-center gap-2 bg-soy-bottle text-soy-label px-4 py-2 font-black uppercase tracking-widest italic mb-6 shadow-[4px_4px_0px_#E63322]">
          <ShieldCheck size={20} /> COLLABORATOR VERIFIED
        </div>
        <h1 className="text-3xl md:text-5xl font-black uppercase italic tracking-tighter mb-4">
          REBUT THE SOYCE SCORE FOR {owner}/{repo}
        </h1>
        <p className="text-base font-bold uppercase tracking-widest opacity-60 mb-8 max-w-2xl">
          GitHub confirmed you're a collaborator. Write your rebuttal below — it
          becomes a public GitHub issue against the OpenSoyce repo.
        </p>

        <div className="bg-white border-4 border-soy-bottle p-8 shadow-[8px_8px_0px_#302C26] mb-6">
          <label className="block text-sm font-black uppercase tracking-widest mb-4 opacity-60">
            YOUR REBUTTAL
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What does OpenSoyce get wrong about your project? Be specific."
            className="w-full min-h-[240px] bg-soy-label/20 border-2 border-soy-bottle p-4 font-mono text-sm outline-none focus:ring-2 focus:ring-soy-red resize-y"
            maxLength={MAX_BODY + 100}
            disabled={state.kind === 'submitting'}
          />
          <div className="flex justify-between items-center mt-3 text-xs font-bold uppercase tracking-widest">
            <span className={tooShort ? 'text-soy-red' : tooLong ? 'text-soy-red' : 'opacity-40'}>
              {tooShort && `Need at least ${MIN_BODY} chars`}
              {tooLong && `Max ${MAX_BODY} chars`}
              {!tooShort && !tooLong && `${trimmed.length} / ${MAX_BODY} chars`}
            </span>
            <span className="opacity-40">Markdown supported</span>
          </div>
        </div>

        {state.kind === 'error' && (
          <div className="bg-soy-red text-white border-2 border-black p-4 mb-6 font-bold flex items-center gap-3">
            <AlertCircle size={20} />
            <span>{state.message}</span>
          </div>
        )}

        <button
          onClick={submit}
          disabled={!canSubmit}
          className="w-full bg-soy-red text-white py-6 text-2xl font-black uppercase italic tracking-tighter hover:bg-black transition-all shadow-[8px_8px_0px_#000] disabled:opacity-40"
        >
          {state.kind === 'submitting' ? (
            <span className="flex items-center justify-center gap-3"><Loader2 className="animate-spin" /> FILING...</span>
          ) : (
            <>FILE REBUTTAL &rarr;</>
          )}
        </button>

        <p className="mt-6 text-xs font-bold uppercase tracking-widest opacity-40">
          Verification token expires in 10 minutes. If it expires, re-verify and refile.
        </p>
      </motion.div>
    </div>
  );
}
