// OpenSoyce Trust Vault — minimal browser chrome for the Vault Dashboard.
//
// PR-V2-E. Per PR-V1-D §7.1 + Trust Vault ADR §2.3 (public/private surface
// isolation). This layout is intentionally separate from the public
// Layout component — the Vault Dashboard MUST NOT inherit the public-
// spine nav chrome, footer, or analytics hooks. The structural test
// asserts neither this file nor its routed children import any public
// renderer file or shared public-data module.
//
// Design intent (per the parking-lot doctrine): "control room, not
// vulnerability table." Slate background, mono header, dense link list.
// No marketing copy.

import React from 'react';
import { Link, Outlet, useParams, NavLink } from 'react-router-dom';
import { logoutVault } from '../shared/vault/api-client';

function VaultBreadcrumb() {
  const params = useParams();
  const slug = params.slug;
  return (
    <nav aria-label="vault breadcrumbs" className="text-xs font-mono text-slate-400">
      <Link to="/vault" className="hover:text-slate-100">vault</Link>
      {slug ? (
        <>
          <span className="px-2 text-slate-600">/</span>
          <Link to={`/vault/${slug}`} className="hover:text-slate-100">{slug}</Link>
        </>
      ) : null}
    </nav>
  );
}

function WorkspaceNav() {
  const params = useParams();
  const slug = params.slug;
  if (!slug) return null;
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `block px-3 py-2 text-sm font-mono ${
      isActive ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-100'
    }`;
  return (
    <nav aria-label="vault workspace" className="border-r border-slate-800 bg-slate-950 min-w-[12rem]">
      <NavLink to={`/vault/${slug}`} end className={linkClass}>workspace</NavLink>
      <NavLink to={`/vault/${slug}/exceptions`} className={linkClass}>exceptions</NavLink>
      <NavLink to={`/vault/${slug}/timeline`} className={linkClass}>timeline</NavLink>
    </nav>
  );
}

export default function VaultLayout() {
  const [loggingOut, setLoggingOut] = React.useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await logoutVault();
    window.location.href = '/';
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <Link to="/vault" className="text-sm font-mono font-bold tracking-tight text-slate-100">
              opensoyce / vault
            </Link>
            <span className="px-2 py-0.5 text-[10px] font-mono uppercase border border-slate-700 text-slate-400">
              PRIVATE
            </span>
            <VaultBreadcrumb />
          </div>
          <div className="flex items-center gap-3">
            <Link to="/" className="text-xs font-mono text-slate-400 hover:text-slate-100">
              public site
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="text-xs font-mono text-slate-400 hover:text-slate-100 disabled:opacity-50"
            >
              {loggingOut ? 'logging out...' : 'logout'}
            </button>
          </div>
        </div>
      </header>
      <div className="flex">
        <WorkspaceNav />
        <main className="flex-1 px-6 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
