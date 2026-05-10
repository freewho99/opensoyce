import React, { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import {
  FlaskConical as Sauce,
  Github,
  Trophy,
  Shuffle,
  BookOpen,
  Send,
  Search,
  Newspaper,
  Star,
  DollarSign,
  Terminal,
  Skull,
  Flame,
  ScanLine,
  Wand2,
  GitCompare,
  Info,
  Settings,
  LifeBuoy,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';

declare function trackEvent(name: string, props?: Record<string, unknown>): void;

export default function Layout() {
  const { isLoggedIn, user, login, logout, isLoading } = useAuth();
  const [showSecretOverlay, setShowSecretOverlay] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [lastClickTime, setLastClickTime] = useState(0);

  const handleLogoClick = () => {
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
    `flex items-center gap-2.5 px-3 py-[7px] text-[11px] font-black uppercase tracking-widest transition-colors duration-150 hover:text-soy-red hover:bg-soy-bottle/5 rounded-sm ${
      isActive ? 'text-soy-red border-l-2 border-soy-red pl-[10px]' : 'text-soy-bottle/70'
    }`;

  const bottomLinkClass =
    'flex items-center gap-2.5 px-3 py-[7px] text-[11px] font-black uppercase tracking-widest transition-colors duration-150 hover:text-soy-red hover:bg-soy-bottle/5 rounded-sm text-soy-bottle/50 hover:text-soy-bottle/80';

  return (
    <div className="min-h-screen bg-soy-label font-sans text-soy-bottle">

      {/* ── Top Header ── */}
      <header className="fixed top-0 left-0 right-0 h-14 bg-soy-label z-50 flex items-center justify-between px-5">
        <div onClick={handleLogoClick} className="cursor-pointer">
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

      {/* ── Left Sidebar ── */}
      <aside className="fixed top-14 left-0 h-[calc(100vh-3.5rem)] w-52 bg-soy-label border-r border-soy-bottle/20 z-40 flex flex-col overflow-hidden">

        {/* Scrollable nav */}
        <nav className="flex flex-col px-2 py-3 gap-0.5 flex-1 overflow-y-auto">
          <NavLink to="/leaderboards" onClick={() => trackEvent('leaderboards_click', { source: 'nav' })} className={navLinkClass}>
            <Trophy size={13} strokeWidth={2.5} /><span>Leaderboards</span>
          </NavLink>
          <NavLink to="/remix" onClick={() => trackEvent('remix_click', { source: 'nav' })} className={navLinkClass}>
            <Shuffle size={13} strokeWidth={2.5} /><span>Remix</span>
          </NavLink>
          <NavLink to="/methodology" onClick={() => trackEvent('methodology_click', { source: 'nav' })} className={navLinkClass}>
            <BookOpen size={13} strokeWidth={2.5} /><span>Methodology</span>
          </NavLink>
          <NavLink to="/submit-project" onClick={() => trackEvent('submit_project_click', { source: 'nav' })} className={navLinkClass}>
            <Send size={13} strokeWidth={2.5} /><span>Submit</span>
          </NavLink>
          <NavLink to="/lookup" onClick={() => trackEvent('lookup_click', { source: 'nav' })} className={navLinkClass}>
            <Search size={13} strokeWidth={2.5} /><span>Lookup</span>
          </NavLink>
          <NavLink to="/blog" onClick={() => trackEvent('blog_click', { source: 'nav' })} className={navLinkClass}>
            <Newspaper size={13} strokeWidth={2.5} /><span>Blog</span>
          </NavLink>
          <NavLink to="/watchlist" className={navLinkClass}>
            <Star size={13} strokeWidth={2.5} /><span>Watchlist</span>
          </NavLink>
          <NavLink to="/pricing" className={navLinkClass}>
            <DollarSign size={13} strokeWidth={2.5} /><span>Pricing</span>
          </NavLink>

          <div className="border-t border-soy-bottle/15 my-2 mx-1" />
          <p className="text-[8px] font-black uppercase tracking-widest opacity-30 px-3 mb-1">Tools</p>

          <NavLink to="/cli" className={navLinkClass}>
            <Terminal size={13} strokeWidth={2.5} /><span>CLI</span>
          </NavLink>
          <NavLink to="/graveyard" className={navLinkClass}>
            <Skull size={13} strokeWidth={2.5} /><span>Graveyard</span>
          </NavLink>
          <NavLink to="/heat-check" className={navLinkClass}>
            <Flame size={13} strokeWidth={2.5} /><span>Heat Check</span>
          </NavLink>
          <NavLink to="/scan" className={navLinkClass}>
            <ScanLine size={13} strokeWidth={2.5} /><span>Scanner</span>
          </NavLink>
          <NavLink to="/recommend" className={navLinkClass}>
            <Wand2 size={13} strokeWidth={2.5} /><span>AI Recipes</span>
          </NavLink>
          <NavLink to="/compare" className={navLinkClass}>
            <GitCompare size={13} strokeWidth={2.5} /><span>Compare</span>
          </NavLink>
          <NavLink to="/about" className={navLinkClass}>
            <Info size={13} strokeWidth={2.5} /><span>About</span>
          </NavLink>
        </nav>

        {/* Bottom pinned: subtle dancing bottle + settings + support */}
        <div className="border-t border-soy-bottle/15 px-2 pb-3 pt-3 flex-shrink-0">
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
