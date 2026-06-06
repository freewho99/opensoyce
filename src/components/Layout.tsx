import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
    FlaskConical as Sauce,
    Github,
    Trophy,
    Shuffle,
    BookOpen,
    Search,
    Newspaper,
    DollarSign,
    Terminal,
    Skull,
    Flame,
    ScanLine,
    Wand2,
    GitCompare,
    Info,
    LifeBuoy,
    ArrowRight,
    Menu,
    X,
    Shield,
    ShieldCheck,
    HelpCircle,
    BarChart3,
    LayoutDashboard,
    ChevronDown,
    Star,
    type LucideIcon,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { trackEvent } from '../utils/analytics';

type NavGroup = 'CORE' | 'DISCOVER' | 'COMMUNITY' | 'TRUST' | 'DEVELOPER';

type NavItem = {
    label: string;
    path: string;
    hint: string;
    icon: LucideIcon;
    group: NavGroup;
};

type GitHubRepo = {
    full_name: string;
    description: string | null;
    stargazers_count: number;
    language: string | null;
};

const NAV_ITEMS: NavItem[] = [
  { label: 'Scanner', path: '/scanner', hint: 'Deep scan a repository', icon: ScanLine, group: 'CORE' },
  { label: 'Guard', path: '/guard', hint: 'PR-time supply-chain checks', icon: Shield, group: 'CORE' },
  { label: 'Compare', path: '/compare', hint: 'Side-by-side repo comparison', icon: GitCompare, group: 'CORE' },
  { label: 'Pricing', path: '/pricing', hint: 'Plans and pricing', icon: DollarSign, group: 'CORE' },
  { label: 'Leaderboards', path: '/leaderboards', hint: 'Top ranked open-source projects', icon: Trophy, group: 'DISCOVER' },
  { label: 'Heat Check', path: '/heat-check', hint: 'Trending right now', icon: Flame, group: 'DISCOVER' },
  { label: 'Graveyard', path: '/graveyard', hint: 'Abandoned projects', icon: Skull, group: 'DISCOVER' },
  { label: 'Lookup', path: '/lookup', hint: 'Analyze any GitHub repo', icon: Search, group: 'DISCOVER' },
  { label: 'Blog', path: '/blog', hint: 'News and updates', icon: Newspaper, group: 'COMMUNITY' },
  { label: 'AI Recipes', path: '/recipes', hint: 'AI-powered stack recommendations', icon: Wand2, group: 'COMMUNITY' },
  { label: 'Remix', path: '/remix', hint: 'Remix and fork projects', icon: Shuffle, group: 'COMMUNITY' },
  { label: 'Methodology', path: '/methodology', hint: 'How we score projects', icon: BookOpen, group: 'TRUST' },
  { label: 'Trust Center', path: '/opensource-trust', hint: 'Public proof-backed trust record', icon: ShieldCheck, group: 'TRUST' },
  { label: 'SOC 2', path: '/guard?tab=compliance', hint: 'SOC 2 & ISO 27001 compliance', icon: Shield, group: 'TRUST' },
  { label: 'About', path: '/about', hint: 'About OpenSoyce', icon: Info, group: 'TRUST' },
  { label: 'FAQ', path: '/faq', hint: 'Frequently asked questions', icon: HelpCircle, group: 'TRUST' },
  { label: 'Dashboard', path: '/dashboard', hint: 'Your Guard dashboard', icon: LayoutDashboard, group: 'DEVELOPER' },
  { label: 'Analytics', path: '/analytics', hint: 'Usage analytics', icon: BarChart3, group: 'DEVELOPER' },
  { label: 'CLI', path: '/cli', hint: 'Command line tool', icon: Terminal, group: 'DEVELOPER' },
  ];

const NAV_GROUP_ORDER: NavGroup[] = ['CORE', 'DISCOVER', 'COMMUNITY', 'TRUST', 'DEVELOPER'];
const PAGES = NAV_ITEMS.map(({ label, path, hint }) => ({ label, path, hint }));

function formatStars(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
}

interface CollapsibleGroupProps {
  label: string;
  expanded: boolean;
  onToggle: () => void;
  items: NavItem[];
  getNavLinkClass: (path: string) => string;
  onNavClick: (label: string) => void;
}

function CollapsibleGroup({
  label,
  expanded,
  onToggle,
  items,
  getNavLinkClass,
  onNavClick,
}: CollapsibleGroupProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center justify-between px-3 py-[7px] text-[9px] font-black uppercase tracking-[0.2em] text-soy-bottle/50 hover:text-soy-bottle/80 transition-colors w-full mt-1 mb-0.5"
      >
        <span>{label}</span>
        <ChevronDown
          size={11}
          strokeWidth={2.5}
          className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        />
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden flex flex-col gap-0.5"
          >
            {items.map(item => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => onNavClick(item.label)}
                  className={getNavLinkClass(item.path)}
                >
                  <Icon size={13} strokeWidth={2.5} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Layout() {
    const { isLoggedIn, user, login, logout, isLoading } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [showSecretOverlay, setShowSecretOverlay] = useState(false);
    const [clickCount, setClickCount] = useState(0);
    const [lastClickTime, setLastClickTime] = useState(0);
    const [query, setQuery] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const [focused, setFocused] = useState(false);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [devExpanded, setDevExpanded] = useState(false);
    const [githubSuggestions, setGithubSuggestions] = useState<GitHubRepo[]>([]);
    const [suggestionsLoading, setSuggestionsLoading] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);
    useEffect(() => { setDevExpanded(isLoggedIn); }, [isLoggedIn]);

  // Auto-expand the group that owns the currently active route
  const activeGroup = NAV_ITEMS.find(i => {
    const basePath = i.path.split('?')[0];
    return basePath === location.pathname;
  })?.group;
  const [discoverExpanded, setDiscoverExpanded] = useState(() => activeGroup === 'DISCOVER');
  const [communityExpanded, setCommunityExpanded] = useState(() => activeGroup === 'COMMUNITY');
  const [trustExpanded, setTrustExpanded] = useState(() => activeGroup === 'TRUST');

  // Keep groups open when navigating within them
  useEffect(() => {
    if (activeGroup === 'DISCOVER') setDiscoverExpanded(true);
    if (activeGroup === 'COMMUNITY') setCommunityExpanded(true);
    if (activeGroup === 'TRUST') setTrustExpanded(true);
  }, [activeGroup]);

  const isRepo = (q: string) => /^[\w.-]+\/[\w.-]+$/.test(q.trim());

  const fetchGithubSuggestions = useCallback(async (q: string) => {
        if (q.trim().length < 2) { setGithubSuggestions([]); return; }
        setSuggestionsLoading(true);
        try {
                const res = await fetch(
                          `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=5`,
                  { headers: { Accept: 'application/vnd.github+json' } }
                        );
                if (res.ok) {
                          const data = await res.json();
                          setGithubSuggestions(data.items ?? []);
                }
        } catch {
                setGithubSuggestions([]);
        } finally {
                setSuggestionsLoading(false);
        }
  }, []);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setQuery(val);
        setShowDropdown(true);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => fetchGithubSuggestions(val), 350);
  };

  const pageMatches = query.trim().length > 0
      ? PAGES.filter(p =>
                p.label.toLowerCase().includes(query.toLowerCase()) ||
                p.hint.toLowerCase().includes(query.toLowerCase())
                           ).slice(0, 3)
        : [];

  const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        const q = query.trim();
        if (!q) return;
        trackEvent('header_search', { query: q });
        navigate(`/lookup?q=${encodeURIComponent(q)}`);
        setQuery('');
        setShowDropdown(false);
        setGithubSuggestions([]);
        inputRef.current?.blur();
  };

  const handlePageSelect = (path: string) => {
        setQuery('');
        setShowDropdown(false);
        setGithubSuggestions([]);
        navigate(path);
  };

  const handleRepoSelect = (fullName: string) => {
        trackEvent('header_search_repo_select', { repo: fullName });
        setQuery('');
        setShowDropdown(false);
        setGithubSuggestions([]);
        navigate(`/lookup?q=${encodeURIComponent(fullName)}`);
  };

  useEffect(() => {
        const handler = (e: MouseEvent) => {
                if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
                          setShowDropdown(false);
                          setFocused(false);
                }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogoClick = () => {
        const now = Date.now();
        const newCount = now - lastClickTime < 2000 ? clickCount + 1 : 1;
        setClickCount(newCount);
        if (newCount >= 5) { setShowSecretOverlay(true); setClickCount(0); }
        setLastClickTime(now);
  };

  const getIsGuardActive = () => {
    return location.pathname === '/guard' && new URLSearchParams(location.search).get('tab') !== 'compliance';
  };

  const getNavLinkClass = (path: string) => {
    const [base, query] = path.split('?');
    const isPathActive = location.pathname === base;
    let isQueryActive = true;
    if (query) {
      const searchParams = new URLSearchParams(location.search);
      const [qKey, qVal] = query.split('=');
      isQueryActive = searchParams.get(qKey) === qVal;
    } else if (base === '/guard') {
      // If guard link, only active if not on compliance tab
      const searchParams = new URLSearchParams(location.search);
      isQueryActive = searchParams.get('tab') !== 'compliance';
    }
    const active = isPathActive && isQueryActive;
    return `flex items-center gap-2.5 px-3 py-[7px] text-[11px] font-black uppercase tracking-widest transition-colors duration-150 hover:text-soy-red hover:bg-soy-bottle/5 rounded-sm ${
      active ? 'text-soy-red border-l-2 border-soy-red pl-[10px]' : 'text-soy-bottle/70'
    }`;
  };

  const bottomLinkClass = 'flex items-center gap-2.5 px-3 py-[7px] text-[11px] font-black uppercase tracking-widest transition-colors duration-150 hover:text-soy-red hover:bg-soy-bottle/5 rounded-sm text-soy-bottle/50 hover:text-soy-bottle/80';

  const hasGithubResults = githubSuggestions.length > 0;
    const showAnalyzePrompt = isRepo(query.trim()) && !hasGithubResults;

  return (
        <div className="min-h-screen bg-soy-label font-sans text-soy-bottle">
        
          {/* Top Header */}
              <header className="fixed top-0 left-0 right-0 h-14 bg-soy-label z-50 flex items-center px-3 sm:px-5 gap-2 sm:gap-4">
                      <button
                                  type="button"
                                  aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
                                  onClick={() => setDrawerOpen(o => !o)}
                                  className="lg:hidden flex-shrink-0 p-1.5 -ml-1.5 text-soy-bottle hover:text-soy-red transition-colors"
                                >
                        {drawerOpen ? <X size={20} strokeWidth={2.5} /> : <Menu size={20} strokeWidth={2.5} />}
                      </button>
                      <div onClick={handleLogoClick} className="cursor-pointer flex-shrink-0">
                                <Link to="/" className="flex items-center gap-2 group">
                                            <div className="bg-soy-red p-1 rotate-12 group-hover:rotate-0 transition-transform duration-200 flex-shrink-0">
                                                          <Sauce size={20} className="text-white" />
                                            </div>
                                            <span className="text-xl font-bold uppercase tracking-tighter italic">OpenSoyce</span>
                                </Link>
                      </div>
              
                      <div className="flex-1 sm:hidden" />
              
                {/* Search */}
                      <div ref={searchRef} className="hidden sm:block flex-1 max-w-lg mx-auto relative">
                                <form onSubmit={handleSearch} className="relative">
                                            <Search size={12} strokeWidth={2.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-soy-bottle/50 pointer-events-none" />
                                            <input
                                                            ref={inputRef}
                                                            type="text"
                                                            value={query}
                                                            onChange={handleQueryChange}
                                                            onFocus={() => { setShowDropdown(true); setFocused(true); }}
                                                            placeholder="Search repos by name, e.g. react, lodash..."
                                                            className={[
                                                                              'w-full pl-8 pr-9 py-[7px] text-[11px] font-black uppercase tracking-widest border-2 bg-transparent',
                                                                              'placeholder:normal-case placeholder:font-normal placeholder:tracking-normal placeholder:text-soy-bottle/40',
                                                                              'focus:outline-none transition-colors duration-150',
                                                                              focused ? 'border-soy-bottle bg-white' : 'border-soy-bottle/50 hover:border-soy-bottle/80',
                                                                            ].join(' ')}
                                                          />
                                  {query && (
                        <button type="submit" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-soy-bottle/60 hover:text-soy-red transition-colors">
                                        <ArrowRight size={13} strokeWidth={2.5} />
                        </button>
                                            )}
                                </form>
                                <AnimatePresence>
                                  {showDropdown && query.trim().length > 0 && (
                        <motion.div
                                          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                                          transition={{ duration: 0.1 }}
                                          className="absolute top-full left-0 right-0 mt-0.5 bg-soy-label border-2 border-soy-bottle shadow-[4px_4px_0px_0px_rgba(0,0,0,0.15)] z-[100] overflow-hidden"
                                        >
                          {/* GitHub repo suggestions */}
                          {suggestionsLoading && (
                                                            <div className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-soy-bottle/50">
                                                                                Searching GitHub...
                                                            </div>
                                        )}
                          {!suggestionsLoading && hasGithubResults && (
                                                            <>
                                                                                <div className="px-4 py-1.5 text-[8px] font-black uppercase tracking-[0.2em] text-soy-bottle/40 border-b border-soy-bottle/10">
                                                                                                      GitHub Repos
                                                                                  </div>
                                                              {githubSuggestions.map((repo, i) => (
                                                                                    <button
                                                                                                              key={repo.full_name}
                                                                                                              onClick={() => handleRepoSelect(repo.full_name)}
                                                                                                              className={[
                                                                                                                                          'w-full flex items-center gap-3 px-4 py-2.5 hover:bg-soy-red hover:text-white transition-colors group text-left',
                                                                                                                                          i < githubSuggestions.length - 1 ? 'border-b border-soy-bottle/10' : '',
                                                                                                                                        ].join(' ')}
                                                                                                            >
                                                                                                            <Github size={11} strokeWidth={2.5} className="flex-shrink-0 opacity-40 group-hover:opacity-100" />
                                                                                                            <div className="flex-1 min-w-0">
                                                                                                                                      <div className="text-[10px] font-black uppercase tracking-widest truncate">{repo.full_name}</div>
                                                                                                              {repo.description && (
                                                                                                                                          <div className="text-[9px] opacity-60 normal-case font-normal tracking-normal truncate group-hover:opacity-80">
                                                                                                                                            {repo.description}
                                                                                                                                            </div>
                                                                                                                                      )}
                                                                                                              </div>
                                                                                                            <div className="flex items-center gap-1.5 flex-shrink-0 opacity-50 group-hover:opacity-80">
                                                                                                              {repo.language && (
                                                                                                                                          <span className="text-[8px] font-bold uppercase tracking-wide">{repo.language}</span>
                                                                                                                                      )}
                                                                                                                                      <Star size={9} strokeWidth={2.5} />
                                                                                                                                      <span className="text-[9px] font-bold">{formatStars(repo.stargazers_count)}</span>
                                                                                                              </div>
                                                                                      </button>
                                                                                  ))}
                                                                                <button
                                                                                                        onClick={() => handlePageSelect(`/lookup?q=${encodeURIComponent(query.trim())}`)}
                                                                                                        className="w-full flex items-center gap-3 px-4 py-2 hover:bg-soy-bottle/5 hover:text-soy-red transition-colors group border-t-2 border-soy-bottle/20"
                                                                                                      >
                                                                                                      <Search size={10} strokeWidth={2.5} className="flex-shrink-0 opacity-30 group-hover:opacity-100 group-hover:text-soy-red" />
                                                                                                      <div className="text-[9px] font-black uppercase tracking-widest opacity-60 group-hover:opacity-100">
                                                                                                                              Search all results for &ldquo;{query}&rdquo;
                                                                                                        </div>
                                                                                  </button>
                                                            </>
                                                          )}
                        
                          {/* Exact owner/repo format — direct analyze */}
                          {showAnalyzePrompt && (
                                                            <button onClick={() => handlePageSelect(`/lookup?q=${encodeURIComponent(query.trim())}`)}
                                                                                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-soy-red hover:text-white transition-colors group border-b-2 border-soy-bottle/20">
                                                                                <Search size={11} strokeWidth={2.5} className="flex-shrink-0 text-soy-red group-hover:text-white" />
                                                                                <div className="text-left">
                                                                                                      <div className="text-[10px] font-black uppercase tracking-widest">Analyze {query.trim()}</div>
                                                                                                      <div className="text-[9px] opacity-60 normal-case font-normal tracking-normal">Run full OpenSoyce score</div>
                                                                                  </div>
                                                                                <ArrowRight size={11} strokeWidth={2.5} className="ml-auto opacity-50 group-hover:opacity-100" />
                                                            </button>
                                        )}
                        
                          {/* Page nav matches */}
                          {pageMatches.length > 0 && (
                                                            <>
                                                              {(hasGithubResults || showAnalyzePrompt) && (
                                                                                    <div className="px-4 py-1.5 text-[8px] font-black uppercase tracking-[0.2em] text-soy-bottle/40 border-t border-soy-bottle/10">
                                                                                                            Pages
                                                                                      </div>
                                                                                )}
                                                              {pageMatches.map((p, i) => (
                                                                                    <button key={p.path} onClick={() => handlePageSelect(p.path)}
                                                                                                              className={['w-full flex items-center gap-3 px-4 py-2.5 hover:bg-soy-bottle/5 hover:text-soy-red transition-colors group', i < pageMatches.length - 1 ? 'border-b border-soy-bottle/10' : ''].join(' ')}>
                                                                                                            <ArrowRight size={10} strokeWidth={2.5} className="flex-shrink-0 opacity-25 group-hover:opacity-100 group-hover:text-soy-red" />
                                                                                                            <div className="text-left">
                                                                                                                                      <div className="text-[10px] font-black uppercase tracking-widest">{p.label}</div>
                                                                                                                                      <div className="text-[9px] opacity-50 normal-case font-normal tracking-normal">{p.hint}</div>
                                                                                                              </div>
                                                                                      </button>
                                                                                  ))}
                                                            </>
                                                          )}
                        
                          {/* Fallback */}
                          {!suggestionsLoading && !hasGithubResults && !isRepo(query.trim()) && pageMatches.length === 0 && (
                                                            <button onClick={() => handlePageSelect(`/lookup?q=${encodeURIComponent(query.trim())}`)}
                                                                                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-soy-bottle/5 hover:text-soy-red transition-colors group">
                                                                                <Search size={11} strokeWidth={2.5} className="flex-shrink-0 opacity-40 group-hover:text-soy-red group-hover:opacity-100" />
                                                                                <div className="text-left">
                                                                                                      <div className="text-[10px] font-black uppercase tracking-widest">Search &ldquo;{query}&rdquo;</div>
                                                                                                      <div className="text-[9px] opacity-50 normal-case font-normal tracking-normal">Look up on Lookup page</div>
                                                                                  </div>
                                                                                <ArrowRight size={11} strokeWidth={2.5} className="ml-auto opacity-40 group-hover:opacity-100" />
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
                                    <Link to="/claim" className="bg-soy-red text-white px-4 py-1.5 font-black uppercase tracking-widest text-[10px] hover:bg-black transition-colors border-2 border-soy-bottle">Claim</Link>
                                    <button onClick={() => login()} disabled={isLoading}
                                                      className="flex items-center gap-1.5 border-2 border-soy-bottle px-3 py-1.5 text-[9px] font-black uppercase tracking-widest hover:bg-soy-bottle hover:text-white transition-colors">
                                                    <Github size={12} />
                                      {isLoading ? '...' : 'Sign In'}
                                    </button>
                      </>
                    )}
                      </div>
              </header>
        
          {/* Mobile backdrop */}
          {drawerOpen && (
                  <button
                              type="button"
                              aria-label="Dismiss menu"
                              onClick={() => setDrawerOpen(false)}
                              className="lg:hidden fixed inset-0 top-14 z-30 bg-black/40 cursor-default"
                            />
                )}
                     <aside className={`fixed top-14 left-0 h-[calc(100vh-3.5rem)] w-64 lg:w-52 bg-soy-label border-r border-soy-bottle/20 z-40 flex-col overflow-hidden transform transition-transform duration-200 ease-out lg:translate-x-0 ${drawerOpen ? 'flex translate-x-0' : 'hidden lg:flex -translate-x-full'}`}>
                      <nav className="flex flex-col px-2 py-3 gap-0.5 flex-1 overflow-y-auto">

                        {/* ── CORE — Always visible, visually prioritised ──────────── */}
                        <div className="flex flex-col gap-1 mb-1">
                          {NAV_ITEMS.filter(i => i.group === 'CORE').map(item => {
                            const Icon = item.icon;
                            const isGuard = item.path === '/guard';
                            const isPricing = item.path === '/pricing';

                            if (isGuard) {
                              const isActive = getIsGuardActive();
                              return (
                                <Link
                                  key={item.path}
                                  to={item.path}
                                  onClick={() => trackEvent('nav_click', { source: 'nav', label: item.label, group: item.group })}
                                  className={
                                    `flex items-center gap-2.5 px-3 py-[8px] text-[11px] font-black uppercase tracking-widest transition-all duration-150 border-2 ${
                                      isActive
                                        ? 'bg-soy-red text-white border-soy-red shadow-[2px_2px_0px_#000]'
                                        : 'bg-soy-red/10 text-soy-red border-soy-red/30 hover:bg-soy-red hover:text-white hover:border-soy-red hover:shadow-[2px_2px_0px_#000]'
                                    }`
                                  }
                                >
                                  <Icon size={13} strokeWidth={2.5} />
                                  <span className="flex-1">{item.label}</span>
                                  <span className="text-[8px] font-black uppercase tracking-widest opacity-60 border border-current px-1 py-0.5 leading-none">PRO</span>
                                </Link>
                              );
                            }

                            if (isPricing) {
                              // We can use standard getNavLinkClass for pricing since it has no tabs
                              const isActive = location.pathname === '/pricing';
                              return (
                                <Link
                                  key={item.path}
                                  to={item.path}
                                  onClick={() => trackEvent('nav_click', { source: 'nav', label: item.label, group: item.group })}
                                  className={
                                    `flex items-center gap-2.5 px-3 py-[7px] text-[11px] font-black uppercase tracking-widest transition-all duration-150 border-l-2 ${
                                      isActive
                                        ? 'text-soy-red border-amber-500 bg-amber-500/10'
                                        : 'text-soy-bottle/80 border-amber-500/40 hover:text-amber-700 hover:border-amber-500 hover:bg-amber-500/5'
                                    }`
                                  }
                                >
                                  <Icon size={13} strokeWidth={2.5} />
                                  <span>{item.label}</span>
                                </Link>
                              );
                            }

                            // Standard CORE item (Scanner, Compare)
                            return (
                              <Link
                                key={item.path}
                                to={item.path}
                                onClick={() => trackEvent('nav_click', { source: 'nav', label: item.label, group: item.group })}
                                className={getNavLinkClass(item.path)}
                              >
                                <Icon size={13} strokeWidth={2.5} />
                                <span>{item.label}</span>
                              </Link>
                            );
                          })}
                        </div>

                        {/* ── DISCOVER — Collapsible ────────────────────────────────── */}
                        <CollapsibleGroup
                          label="Explore"
                          expanded={discoverExpanded}
                          onToggle={() => setDiscoverExpanded(v => !v)}
                          items={NAV_ITEMS.filter(i => i.group === 'DISCOVER')}
                          getNavLinkClass={getNavLinkClass}
                          onNavClick={(label) => trackEvent('nav_click', { source: 'nav', label, group: 'DISCOVER' })}
                        />

                        {/* ── COMMUNITY — Collapsible ───────────────────────────────── */}
                        <CollapsibleGroup
                          label="Community"
                          expanded={communityExpanded}
                          onToggle={() => setCommunityExpanded(v => !v)}
                          items={NAV_ITEMS.filter(i => i.group === 'COMMUNITY')}
                          getNavLinkClass={getNavLinkClass}
                          onNavClick={(label) => trackEvent('nav_click', { source: 'nav', label, group: 'COMMUNITY' })}
                        />

                        {/* ── TRUST / Resources — Collapsible ──────────────────────── */}
                        <CollapsibleGroup
                          label="Resources"
                          expanded={trustExpanded}
                          onToggle={() => setTrustExpanded(v => !v)}
                          items={NAV_ITEMS.filter(i => i.group === 'TRUST')}
                          getNavLinkClass={getNavLinkClass}
                          onNavClick={(label) => trackEvent('nav_click', { source: 'nav', label, group: 'TRUST' })}
                        />

                        {/* ── DEVELOPER — Collapsible (auto-expands when logged in) ── */}
                        <div className="flex flex-col gap-0.5">
                          <div className="border-t border-soy-bottle/15 my-2 mx-1" />
                          <button
                            type="button"
                            onClick={() => setDevExpanded(v => !v)}
                            className="flex items-center justify-between px-3 py-[7px] text-[9px] font-black uppercase tracking-[0.2em] text-soy-bottle/50 hover:text-soy-bottle/80 transition-colors w-full mt-1 mb-0.5"
                          >
                            <span>Developer</span>
                            <ChevronDown
                              size={11}
                              strokeWidth={2.5}
                              className={`transition-transform duration-200 ${devExpanded ? 'rotate-180' : ''}`}
                            />
                          </button>
                          <AnimatePresence initial={false}>
                            {devExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.18 }}
                                className="overflow-hidden flex flex-col gap-0.5"
                              >
                                {NAV_ITEMS.filter(i => i.group === 'DEVELOPER').map(item => {
                                  const Icon = item.icon;
                                  return (
                                    <Link
                                      key={item.path}
                                      to={item.path}
                                      onClick={() => trackEvent('nav_click', { source: 'nav', label: item.label, group: item.group })}
                                      className={getNavLinkClass(item.path)}
                                    >
                                      <Icon size={13} strokeWidth={2.5} />
                                      <span>{item.label}</span>
                                    </Link>
                                  );
                                })}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                      </nav>
                      <div className="border-t border-soy-bottle/15 px-2 pb-3 pt-2 flex-shrink-0">
                                <a href="mailto:support@opensoyce.com" className={bottomLinkClass} onClick={() => trackEvent('support_click', { source: 'nav' })}>
                                            <LifeBuoy size={13} strokeWidth={2.5} /><span>Support</span>
                                </a>
                      </div>
              </aside>
        
          {/* Page content */}
              <div className="ml-0 lg:ml-52 pt-14">
                      <AnimatePresence>
                        {showSecretOverlay && (
                      <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                                      className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center text-white text-center p-8">
                                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }} className="text-8xl mb-12">🧪</motion.div>
                                    <h2 className="text-4xl md:text-7xl font-black uppercase italic tracking-tighter mb-6">YOU FOUND THE SECRET SAUCE</h2>
                                    <p className="text-xl md:text-2xl font-bold uppercase tracking-widest mb-12 opacity-60">THE REAL SOYCE WAS THE REPOS WE ANALYZED ALONG THE WAY</p>
                                    <button onClick={() => setShowSecretOverlay(false)} className="bg-soy-red text-white border-2 border-white px-12 py-4 text-xl font-black uppercase tracking-widest hover:bg-white hover:text-soy-red transition-colors">CLOSE</button>
                      </motion.div>
                    )}
                      </AnimatePresence>
                      <main><Outlet /></main>
                      <footer className="border-t-4 border-soy-bottle bg-soy-label mt-20">
                                <div className="max-w-7xl mx-auto px-4 py-12">
                                            <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
                                                          <div className="col-span-1 md:col-span-2">
                                                                          <div className="flex items-center gap-2 mb-4">
                                                                                            <div className="bg-soy-bottle p-1"><Sauce size={20} className="text-white" /></div>
                                                                                            <span className="text-xl font-bold uppercase tracking-tighter italic">OpenSoyce</span>
                                                                          </div>
                                                                          <p className="text-sm font-medium opacity-70 max-w-sm mb-6">OpenSoyce is the trust and discovery layer for the open-source ecosystem.</p>
                                                                          <div className="flex gap-4">
                                                                                            <a href="https://github.com/freewho99/opensoyce" target="_blank" rel="noopener noreferrer" className="hover:text-soy-red transition-colors"><Github size={20} /></a>
                                                                          </div>
                                                          </div>
                                                          <div>
                                                                          <h4 className="font-black uppercase tracking-widest text-xs mb-4">Tools</h4>
                                                                          <div className="flex flex-col gap-2 text-sm font-medium opacity-70">
                                                                                            <Link to="/scanner" className="hover:text-soy-red hover:opacity-100 transition-colors">Scanner</Link>
                                                                                            <Link to="/guard" className="hover:text-soy-red hover:opacity-100 transition-colors">Guard</Link>
                                                                                            <Link to="/compare" className="hover:text-soy-red hover:opacity-100 transition-colors">Compare</Link>
                                                                                            <Link to="/heat-check" className="hover:text-soy-red hover:opacity-100 transition-colors">Heat Check</Link>
                                                                                            <Link to="/graveyard" className="hover:text-soy-red hover:opacity-100 transition-colors">Graveyard</Link>
                                                                                            <Link to="/leaderboards" className="hover:text-soy-red hover:opacity-100 transition-colors">Leaderboards</Link>
                                                                          </div>
                                                          </div>
                                                          <div>
                                                                          <h4 className="font-black uppercase tracking-widest text-xs mb-4">Discover</h4>
                                                                          <div className="flex flex-col gap-2 text-sm font-medium opacity-70">
                                                                                            <Link to="/blog" className="hover:text-soy-red hover:opacity-100 transition-colors">Blog</Link>
                                                                                            <Link to="/recipes" className="hover:text-soy-red hover:opacity-100 transition-colors">AI Recipes</Link>
                                                                                            <Link to="/remix" className="hover:text-soy-red hover:opacity-100 transition-colors">Remix</Link>
                                                                                            <Link to="/lookup" className="hover:text-soy-red hover:opacity-100 transition-colors">Lookup</Link>
                                                                                            <Link to="/pricing" className="hover:text-soy-red hover:opacity-100 transition-colors">Pricing</Link>
                                                                          </div>
                                                          </div>
                                                          <div>
                                                                          <h4 className="font-black uppercase tracking-widest text-xs mb-4">Company</h4>
                                                                          <div className="flex flex-col gap-2 text-sm font-medium opacity-70">
                                                                                            <Link to="/about" className="hover:text-soy-red hover:opacity-100 transition-colors">About</Link>
                                                                                            <Link to="/faq" className="hover:text-soy-red hover:opacity-100 transition-colors">FAQ</Link>
                                                                                            <Link to="/methodology" className="hover:text-soy-red hover:opacity-100 transition-colors">Methodology</Link>
                                                                                            <Link to="/claim" className="hover:text-soy-red hover:opacity-100 transition-colors">Claim a Project</Link>
                                                                                            <Link to="/cli" className="hover:text-soy-red hover:opacity-100 transition-colors">CLI</Link>
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
