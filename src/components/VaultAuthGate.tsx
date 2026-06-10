// OpenSoyce Trust Vault — shared unauth guard for deep-linked pages.
//
// PR-DOGFOOD-1. Fixes the "trapped unauth view" friction across the
// 5 dashboard pages that previously dead-ended on a deep link with a
// static text notice and no sign-in affordance.
//
// Use:
//   if (phase === 'unauth') return <VaultAuthGate />;
//
// Behavior:
//   - Renders the same Vault-styled card as VaultDashboard's unauth
//     state so the experience is consistent across all 5 pages.
//   - The sign-in button uses startVaultOAuth() and preserves the
//     current URL (pathname + search) as the return path. After the
//     OAuth round-trip the user lands back exactly where they tried
//     to go — no more "you logged in but now you're on /dashboard"
//     friction.
//   - When startVaultOAuth surfaces a failure (missing client_id,
//     /api/config 5xx) the gate shows the error inline rather than
//     silently dead-ending the user.

import React from 'react';
import { useLocation } from 'react-router-dom';
import { startVaultOAuth } from '../shared/vault/oauth-start';

interface VaultAuthGateProps {
  message?: string;
}

export default function VaultAuthGate({ message }: VaultAuthGateProps) {
  const location = useLocation();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string>('');

  async function handleSignIn() {
    setPending(true);
    setError('');
    const returnPath = `${location.pathname}${location.search}`;
    const result = await startVaultOAuth(returnPath);
    // On success startVaultOAuth never returns (top-level navigation).
    // If it returns, it's an error.
    if (result) {
      setError(result.message);
      setPending(false);
    }
  }

  return (
    <div
      data-vault-auth-gate=""
      className="border border-slate-700 bg-slate-800/40 p-5 max-w-lg"
    >
      <h2 className="text-sm font-mono font-bold mb-2">Sign in required</h2>
      <p className="text-sm text-slate-400 mb-4">
        {message || 'This is a private workspace surface. Sign in once and you will land back here.'}
      </p>
      {error && (
        <p className="text-xs font-mono text-red-300 mb-3" role="alert">{error}</p>
      )}
      <button
        type="button"
        onClick={handleSignIn}
        disabled={pending}
        className="px-4 py-2 text-sm font-mono bg-slate-100 text-slate-900 hover:bg-white disabled:opacity-50"
      >
        {pending ? 'Redirecting...' : 'Sign in with GitHub'}
      </button>
    </div>
  );
}
