import React, { useState, useEffect, useRef } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { FlaskConical as Sauce, Github, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';

declare function trackEvent(name: string, props?: Record<string, unknown>): void;

export default function Layout() {
  const { isLoggedIn, user, login, logout, isLoading } = useAuth();
  const [showSecretOverlay, setShowSecretOverlay] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [lastClickTime, setLastClickTime] = useState(0);

  const handleLogoClick = (e: React.MouseEvent) => {
    const now = Date.now();
    const newCount = now - lastClickTime < 2000 ? clickCount + 1 : 1;
    setClickCount(newCount);
    if (newCount >= 5) {
      setShowSecretOverlay(true);
      setClickCount(0);
    }
    setLastClickTime(now);
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `block px-3 py-2 text-xs font-bold uppercase tracking-widest transition-colors duration-200 hover:text-soy-red hover:bg-soy-bottle/10 rounded-sm ${isActive ? 'text-soy-red border-l-2 border-soy-red pl-[10px]' : ''}`;

  return (
    <div className="min-h-screen bg-soy-label font-sans text-soy-bottle">

      {/* ── Top Header: logo left, auth right ── */}
      <header className="fixed top-0 left-0 right-0 h-14 bg-soy-label border-b-4 border-soy-bottle z-50 flex items-center justify-between px-5">
        <div onClick={handleLogoClick}>
          <Link to="/" className="flex items-center gap-2 group">
            <div className="bg-soy-red p-1 rotate-12 group-hover:rotate-0 transition-transform duration-200 flex-shrink-0">
              <Sauce size={20} className="text-white" />
            </div>
            <span className="text-xl font-bold uppercase tracking-tighter italic">OpenSoyce</span>
          </Link>
        </div>
        <div className="flex items-center gap-3">
          {isLoggedIn && user ? (
            <div className="flex items-center gap-3">
              <img src={user.avatar_url} alt={user.login} className="w-7 h-7 rounded-full border-2 border-soy-red" />
              <span className="text-[9px] font-black uppercase tracking-widest hidden sm:block">{user.login}</span>
              <button onClick={logout} className="text-[9px] text-soy-red hover:underline font-bold uppercase tracking-widest">Sign Out</button>
            </div>
          ) : (
            <>
              <Link to="/claim" className="bg-soy-red text-white px-4 py-1.5 font-black uppercase tracking-widest text-[10px] hover:bg-black transition-colors border-2 border-soy-bottle">
                Claim
              </Link>
              <button
                onClick={() => login()}
                disabled={isLoading}
                className="flex items-center gap-1.5 border-2 border-soy-bottle px-3 py-1.5 text-[9px] font-black uppercase tracking-widest hover:bg-soy-bottle hover:text-white transition-colors"
              >
                <Github size={12} />
                {isLoading ? '...' : 'Sign In'}
              </button>
            </>
          )}
        </div>
      </header>

      {/* ── Left Sidebar: nav links only ── */}
      <aside className="fixed top-14 left-0 h-[calc(100vh-3.5rem)] w-52 bg-soy-label border-r-4 border-soy-bottle z-40 overflow-y-auto">
        <nav className="flex flex-col px-2 py-4 gap-0.5">
          <NavLink to="/leaderboards" onClick={() => trackEvent('leaderboards_click', { source: 'nav' })} className={navLinkClass}>Leaderboards</NavLink>
          <NavLink to="/remix" onClick={() => trackEvent('remix_click', { source: 'nav' })} className={navLinkClass}>Remix</NavLink>
          <NavLink to="/methodology" onClick={() => trackEvent('methodology_click', { source: 'nav' })} className={navLinkClass}>Methodology</NavLink>
          <NavLink to="/submit-project" onClick={() => trackEvent('submit_project_click', { source: 'nav' })} className={navLinkClass}>Submit</NavLink>
          <NavLink to="/lookup" onClick={() => trackEvent('lookup_click', { source: 'nav' })} className={navLinkClass}>Lookup</NavLink>
          <NavLink to="/blog" onClick={() => trackEvent('blog_click', { source: 'nav' })} className={navLinkClass}>Blog</NavLink>
          <NavLink to="/watchlist" className={navLinkClass}>Watchlist</NavLink>
          <NavLink to="/pricing" className={navLinkClass}>Pricing</NavLink>
          <div className="border-t-2 border-soy-bottle/30 my-3 mx-2" />
          <p className="text-[9px] font-black uppercase tracking-widest opacity-40 px-3 mb-1">Tools</p>
          <NavLink to="/cli" className={navLinkClass}>CLI</NavLink>
          <NavLink to="/graveyard" className={navLinkClass}>Graveyard</NavLink>
          <NavLink to="/heat-check" className={navLinkClass}>Heat Check</NavLink>
          <NavLink to="/scan" className={navLinkClass}>Scanner</NavLink>
          <NavLink to="/recommend" className={navLinkClass}>AI Recipes</NavLink>
          <NavLink to="/compare" className={navLinkClass}>Compare</NavLink>
          <NavLink to="/about" className={navLinkClass}>About</NavLink>
        </nav>
      </aside>

      {/* ── Page content: offset right of sidebar, below header ── */}
      <div className="ml-52 pt-14">

        {/* Secret Overlay */}
        <AnimatePresence>
          {showSecretOverlay && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center text-white text-center p-8"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                className="text-8xl mb-12"
              >
                🧪
              </motion.div>
              <h2 className="text-4xl md:text-7xl font-black uppercase italic tracking-tighter mb-6">
                YOU FOUND THE SECRET SAUCE
              </h2>
              <p className="text-xl md:text-2xl font-bold uppercase tracking-widest mb-12 opacity-60">
                THE REAL SOYCE WAS THE REPOS WE ANALYZED ALONG THE WAY
              </p>
              <button
                onClick={() => setShowSecretOverlay(false)}
                className="bg-soy-red text-white border-2 border-white px-12 py-4 text-xl font-black uppercase tracking-widest hover:bg-white hover:text-soy-red transition-colors"
              >
                CLOSE
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <main>
          <Outlet />
        </main>

        {/* Footer */}
        <footer className="border-t-4 border-soy-bottle bg-soy-label mt-20">
          <div className="max-w-7xl mx-auto px-4 py-12">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
              <div className="col-span-1 md:col-span-2">
                <div className="flex items-center gap-2 mb-4">
                  <div className="bg-soy-bottle p-1">
                    <Sauce size={20} className="text-white" />
                  </div>
                  <span className="text-xl font-bold uppercase tracking-tighter italic">OpenSoyce</span>
                </div>
                <p className="text-sm font-medium opacity-70 max-w-sm mb-6">
                  OpenSoyce is the trust and discovery layer for the open-source ecosystem.
                </p>
                <div className="flex gap-4">
                  <a href="https://github.com/freewho99/opensoyce" target="_blank" rel="noopener noreferrer" className="hover:text-soy-red transition-colors">
                    <Github size={20} />
                  </a>
                </div>
              </div>
              <div>
                <h4 className="font-black uppercase tracking-widest text-xs mb-4">Product</h4>
                <div className="flex flex-col gap-2 text-sm font-medium opacity-70">
                  <Link to="/leaderboards" className="hover:text-soy-red hover:opacity-100 transition-colors">Leaderboards</Link>
                  <Link to="/lookup" className="hover:text-soy-red hover:opacity-100 transition-colors">Lookup</Link>
                  <Link to="/methodology" className="hover:text-soy-red hover:opacity-100 transition-colors">Methodology</Link>
                  <Link to="/pricing" className="hover:text-soy-red hover:opacity-100 transition-colors">Pricing</Link>
                </div>
              </div>
              <div>
                <h4 className="font-black uppercase tracking-widest text-xs mb-4">Company</h4>
                <div className="flex flex-col gap-2 text-sm font-medium opacity-70">
                  <Link to="/about" className="hover:text-soy-red hover:opacity-100 transition-colors">About</Link>
                  <Link to="/submit-project" className="hover:text-soy-red hover:opacity-100 transition-colors">Submit a Project</Link>
                </div>
              </div>
            </div>
            <div className="mt-12 pt-8 border-t border-soy-bottle flex flex-col md:flex-row justify-between gap-4 text-[10px] font-bold uppercase tracking-widest opacity-40">
              <span>2026 OPENSOYCE LABS. ALL SAUCE RESERVED.</span>
              <span>POWERED BY SWARM INTELLIGENCE</span>
            </div>
          </div>
        </footer>

      </div>
    </div>
  );
}
