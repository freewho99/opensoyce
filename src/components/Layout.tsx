import React, { useState, useRef, useEffect } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
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
  ArrowRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';

declare function trackEvent(name: string, props?: Record<string, unknown>): void;

const PAGES = [
  { label: 'Leaderboards', path: '/leaderboards', hint: 'Top ranked open-source projects' },
  { label: 'Remix', path: '/remix', hint: 'Remix and fork projects' },
  { label: 'Methodology', path: '/methodology', hint: 'How we score projects' },
  { label: 'Submit a Project', path: '/submit-project', hint: 'Add your project' },
  { label: 'Lookup', path: '/lookup', hint: 'Analyze any GitHub repo' },
  { label: 'Blog', path: '/blog', hint: 'News and updates' },
  { label: 'Watchlist', path: '/watchlist', hint: 'Track your favorite repos' },
  { label: 'Pricing', path: '/pricing', hint: 'Plans and pricing' },
  { label: 'CLI', path: '/cli', hint: 'Command line tool' },
  { label: 'Graveyard', path: '/graveyard', hint: 'Abandoned projects' },
  { label: 'Heat Check', path: '/heat-check', hint: 'Trending right now' },
  { label: 'Scanner', path: '/scan', hint: 'Deep scan a repository' },
  { label: 'AI Recipes', path: '/recommend', hint: 'AI-powered stack recommendations' },
  { label: 'Compare', path: '/compare', hint: 'Side-by-side repo comparison' },
  { label: 'About', path: '/about', hint: 'About OpenSoyce' },
  { label: 'Settings', path: '/settings', hint: 'Your account settings' },
];

export default function Layout() {
  const { isLoggedIn, user, login, logout, isLoading } = useAuth();
  const navigate = useNavigate();
  const [showSecretOverlay, setShowSecretOverlay] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [lastClickTime, setLastClickTime] = useState(0);

  // Search state
  const [query, setQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isRepo = (q: string) => /^[\w.-]+\/[\w.-]+$/.test(q.trim());

  const pageMatches = query.trim().length > 0
    ? PAGES.filter(p =>
        p.label.toLowerCase().includes(query.toLowerCase()) ||
        p.hint.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 5)
    : [];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    trackEvent('header_search', { query: q });
    if (isRepo(q)) {
      navigate(`/lookup?q=${encodeURIComponent(q)}`);
    } else {
      navigate(`/lookup?q=${encodeURIComponent(q)}`);
    }
    setQuery('');
    setShowDropdown(false);
    inputRef.current?.blur();
  };

  const handlePageSelect = (path: string) => {
    setQuery('');
    setShowDropdown(false);
    navigate(path);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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

      {/* Top Header */}
      <header className="fixed top-0 left-0 right-0 h-14 bg-soy-label z-50 flex items-center px-5 gap-4">
        {/* Logo */}
        <div onClick={handleLogoClick} className="cursor-pointer flex-shrink-0">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="bg-soy-red p-1 rotate-12 group-hover:rotate-0 transition-transform duration-200 flex-shrink-0">
              <Sauce size={20} className="text-white" />
            </div>
            <span className="text-xl font-bold uppercase tracking-tighter italic">OpenSoyce</span>
          </Link>
        </div>

        {/* Search bar — center */}
        <div ref={searchRef} className="flex-1 max-w-lg mx-auto relative">
          <form onSubmit={handleSearch} className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-soy-bottle/40 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setShowDropdown(true); }}
              onFocus={() => setShowDropdown(true)}
              placeholder="Search projects, pages... (owner/repo to analyze)"
              className="w-full bg-soy-bottle/5 border border-soy-bottle/20 pl-8 pr-10 py-1.5 text-[11px] font-bold uppercase tracking-widest placeholder:normal-case placeholder:font-normal placeholder:tracking-normal placeholder:text-soy-bottle/35 focus:outline-none focus:border-soy-bottle/50 focus:bg-white transition-colors"
            />
            {query && (
              <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 text-soy-bottle/40 hover:text-soy-red transition-colors">
                <ArrowRight size={13} />
              </button>
            )}
          </form>

          {/* Dropdown */}
          <AnimatePresence>
            {showDropdown && query.trim().length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.1 }}
                className="absolute top-full left-0 right-0 mt-1 bg-soy-label border-2 border-soy-bottle/80 shadow-lg z-[100] overflow-hidden"
              >
                {/* If looks like a repo slug, show analyze option */}
                {isRepo(query.trim()) && (
                  <button
                    onClick={() => handlePageSelect(`/lookup?q=${encodeURIComponent(query.trim())}`)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-soy-red hover:text-white transition-colors group border-b border-soy-bottle/10"
                  >
                    <Search size={12} className="flex-shrink-0 text-soy-red group-hover:text-white" />
                    <div className="text-left">
                      <div className="text-[10px] font-black uppercase tracking-widest">Analyze {query.trim()}</div>
                      <div className="text-[9px] opacity-60 normal-case font-normal tracking-normal">Run full OpenSoyce score</div>
                    </div>
                    <ArrowRight size={11} className="ml-auto opacity-40 group-hover:opacity-100" />
                  </button>
                )}

                {/* Page matches */}
                {pageMatches.length > 0 && pageMatches.map(p => (
                  <button
                    key={p.path}
                    onClick={() => handlePageSelect(p.path)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-soy-bottle/5 hover:text-soy-red transition-colors group border-b border-soy-bottle/5 last:border-0"
                  >
                    <ArrowRight size={11} className="flex-shrink-0 opacity-30 group-hover:opacity-100 group-hover:text-soy-red" />
                    <div className="text-left">
                      <div className="text-[10px] font-black uppercase tracking-widest">{p.label}</div>
                      <div className="text-[9px] opacity-50 normal-case font-normal tracking-normal">{p.hint}</div>
                    </div>
                  </button>
                ))}

                {/* No matches — offer lookup */}
                {pageMatches.length === 0 && !isRepo(query.trim()) && (
                  <button
                    onClick={() => handlePageSelect(`/lookup?q=${encodeURIComponent(query.trim())}`)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-soy-bottle/5 hover:text-soy-red transition-colors group"
                  >
                    <Search size={12} className="flex-shrink-0 opacity-40 group-hover:text-soy-red group-hover:opacity-100" />
                    <div className="text-left">
                      <div className="text-[10px] font-black uppercase tracking-widest">Search for &ldquo;{query}&rdquo;</div>
                      <div className="text-[9px] opacity-50 normal-case font-normal tracking-normal">Look up on Lookup page</div>
                    </div>
                    <ArrowRight size={11} className="ml-auto opacity-40 group-hover:opacity-100" />
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Auth */}
        <div className="flex items-center gap-3 flex-shrink-0">
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

      {/* Left Sidebar */}
      <aside className="fixed top-14 left-0 h-[calc(100vh-3.5rem)] w-52 bg-soy-label border-r border-soy-bottle/20 z-40 flex flex-col overflow-hidden">
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
        <div className="border-t border-soy-bottle/15 px-2 pb-3 pt-2 flex-shrink-0">
          <NavLink to="/settings" className={navLinkClass}>
            <Settings size={13} strokeWidth={2.5} /><span>Settings</span>
          </NavLink>
          <a
            href="mailto:support@opensoyce.com"
            className={bottomLinkClass}
            onClick={() => trackEvent('support_click', { source: 'nav' })}
          >
            <LifeBuoy size={13} strokeWidth={2.5} /><span>Support</span>
          </a>
        </div>
      </aside>

      {/* Page content */}
      <div className="ml-52 pt-14">
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

        <main><Outlet /></main>

        <footer className="border-t-4 border-soy-bottle bg-soy-label mt-20">
          <div className="max-w-7xl mx-auto px-4 py-12">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
              <div className="col-span-1 md:col-span-2">
                <div className="flex items-center gap-2 mb-4">
                  <div className="bg-soy-bottle p-1"><Sauce size={20} className="text-white" /></div>
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
