import { Link, NavLink, Outlet } from 'react-router-dom';
import { FlaskConical as Sauce, Github, Search, Menu, X, Check } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useWatchlist } from '../context/WatchlistContext';
import { trackEvent } from '../utils/analytics';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [lastClickTime, setLastClickTime] = useState(0);
  const [showSecretOverlay, setShowSecretOverlay] = useState(false);
  
  const { watchlist } = useWatchlist();
  const { user, isLoggedIn, login, logout, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      setSubscribed(true);
      setEmail('');
    }
  };

  const handleLogoClick = (e: React.MouseEvent) => {
    const now = Date.now();
    if (now - lastClickTime < 2000) {
      const newCount = clickCount + 1;
      setClickCount(newCount);
      if (newCount >= 5) {
        setShowSecretOverlay(true);
        setClickCount(0);
      }
    } else {
      setClickCount(1);
    }
    setLastClickTime(now);
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `block px-3 py-2 text-xs font-bold uppercase tracking-widest transition-colors duration-200 hover:text-soy-red hover:bg-soy-bottle/10 ${isActive ? 'text-soy-red border-l-2 border-soy-red pl-[10px]' : ''}`

  const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) => 
    `transition-colors duration-200 ${isActive ? 'text-soy-red' : ''}`;

  return (
    <div className="min-h-screen ml-56 bg-soy-label font-sans text-soy-bottle">
      {/* Left Sidebar */}
      <aside className="fixed top-0 left-0 h-screen w-56 bg-soy-label border-r-4 border-soy-bottle flex flex-col z-50 overflow-y-auto">
        {/* Logo */}
        <div className="px-4 py-5 border-b-4 border-soy-bottle" onClick={handleLogoClick}>
          <Link to="/" className="flex items-center gap-2 group">
            <div className="bg-soy-red p-1 rotate-12 group-hover:rotate-0 transition-transform duration-200 flex-shrink-0">
              <Sauce size={20} className="text-white" />
            </div>
            <span className="text-xl font-bold uppercase tracking-tighter italic">OpenSoyce</span>
          </Link>
        </div>

        {/* Nav Links */}
        <nav className="flex flex-col px-3 py-4 gap-1 flex-1">
          <NavLink to="/leaderboards" onClick={() => trackEvent('leaderboards_click', { source: 'nav' })} className={navLinkClass}>Leaderboards</NavLink>
          <NavLink to="/remix" onClick={() => trackEvent('remix_click', { source: 'nav' })} className={navLinkClass}>Remix</NavLink>
          <NavLink to="/methodology" onClick={() => trackEvent('methodology_click', { source: 'nav' })} className={navLinkClass}>Methodology</NavLink>
          <NavLink to="/submit-project" onClick={() => trackEvent('submit_project_click', { source: 'nav' })} className={navLinkClass}>Submit</NavLink>
          <NavLink to="/lookup" onClick={() => trackEvent('lookup_click', { source: 'nav' })} className={navLinkClass}>Lookup</NavLink>
          <NavLink to="/blog" onClick={() => trackEvent('blog_click', { source: 'nav' })} className={navLinkClass}>Blog</NavLink>
          <NavLink to="/watchlist" className={navLinkClass}>Watchlist</NavLink>
          <NavLink to="/pricing" className={navLinkClass}>Pricing</NavLink>

          <div className="border-t-2 border-soy-bottle/30 my-3" />

          <p className="text-[9px] font-black uppercase tracking-widest opacity-40 px-2 mb-1">Tools</p>
          <NavLink to="/cli" className={navLinkClass}>CLI</NavLink>
          <NavLink to="/graveyard" className={navLinkClass}>☠ Graveyard</NavLink>
          <NavLink to="/heat-check" className={navLinkClass}>Heat Check</NavLink>
          <NavLink to="/scan" className={navLinkClass}>Scanner</NavLink>
          <NavLink to="/recommend" className={navLinkClass}>AI Recipes</NavLink>
          <NavLink to="/compare" className={navLinkClass}>Compare</NavLink>
          <NavLink to="/about" className={navLinkClass}>About</NavLink>
        </nav>

        {/* Auth / Claim */}
        <div className="px-3 py-4 border-t-4 border-soy-bottle flex flex-col gap-2">
          {isLoggedIn && user ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <img src={user.avatar_url} alt={user.login} className="w-6 h-6 rounded-full border-2 border-soy-red" />
                <span className="text-[9px] font-black uppercase tracking-widest truncate">{user.login}</span>
              </div>
              <button onClick={logout} className="text-[9px] text-soy-red hover:underline text-left font-bold uppercase tracking-widest">Sign Out</button>
            </div>
          ) : (
            <>
              <Link to="/claim" className="bg-soy-red text-white px-3 py-2 font-black uppercase tracking-widest text-[10px] text-center hover:bg-black transition-colors border-2 border-soy-bottle">
                Claim
              </Link>
              <button
                onClick={() => login()}
                disabled={isLoading}
                className="flex items-center justify-center gap-2 border-2 border-soy-bottle px-3 py-2 text-[9px] font-black uppercase tracking-widest hover:bg-soy-bottle hover:text-white transition-colors"
              >
                <Github size={12} />
                {isLoading ? '...' : 'Sign In'}
              </button>
            </>
          )}
        </div>
      </aside>

      {/* Secret Overlay */}
      <AnimatePresence>
        {showSecretOverlay && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center p-4 text-center"
          >
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="text-8xl mb-12"
            >
              Ã°ÂÂ§Âª
            </motion.div>
            <h2 className="text-4xl md:text-7xl font-black uppercase italic tracking-tighter text-white mb-4">
              YOU FOUND THE SECRET SAUCE Ã°ÂÂ¤Â«
            </h2>
            <p className="text-xl md:text-2xl font-bold uppercase tracking-widest text-soy-red italic mb-12 max-w-2xl">
              THE REAL SOYCE WAS THE REPOS WE ANALYZED ALONG THE WAY
            </p>
            <button 
              onClick={() => setShowSecretOverlay(false)}
              className="bg-soy-red text-white border-2 border-white px-12 py-4 text-xl font-black uppercase italic hover:bg-white hover:text-black transition-colors shadow-[8px_8px_0px_#fff]"
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
                We believe health, security, and documentation are the secret ingredients to great software.
              </p>
              <div className="flex gap-4">
                <a href="#" className="hover:text-soy-red transition-colors"><Github size={20} /></a>
              </div>
            </div>
            
            <div>
              <h4 className="text-xs font-bold uppercase tracking-widest mb-4">Product</h4>
              <ul className="text-sm space-y-2 font-medium opacity-80">
                <li><Link to="/leaderboards" className="hover:text-soy-red transition-colors">Leaderboards</Link></li>
                <li><Link to="/blog" className="hover:text-soy-red transition-colors">Blog</Link></li>
                <li><Link to="/submit-project" className="hover:text-soy-red transition-colors">Submit a Project Ã¢ÂÂ</Link></li>
                <li><Link to="/faq" className="hover:text-soy-red transition-colors">FAQ</Link></li>
                <li><Link to="/pricing" className="hover:text-soy-red transition-colors">Pricing</Link></li>
                <li><Link to="/claim" className="hover:text-soy-red transition-colors">Claim Your Project</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-widest mb-4">Company</h4>
              <ul className="text-sm space-y-2 font-medium opacity-80">
                <li><Link to="/about" className="hover:text-soy-red transition-colors">About</Link></li>
                <li><Link to="/about" className="hover:text-soy-red transition-colors">How it works</Link></li>
                <li><Link to="/faq" className="hover:text-soy-red transition-colors">Contact</Link></li>
                <li><Link to="/faq" className="hover:text-soy-red transition-colors">Privacy</Link></li>
              </ul>
            </div>
          </div>
          
          <div className="mt-20 -mx-4">
            <div className="bg-black py-16 px-4 text-center">
              <h3 className="text-3xl md:text-5xl font-black uppercase italic tracking-tighter text-white mb-2">
                GET THE WEEKLY SOYCE REPORT
              </h3>
              <p className="text-sm md:text-base font-bold uppercase tracking-widest text-soy-red italic mb-10 opacity-80">
                Top repos, trend alerts, and dependency graveyard updates. No spam. Ever.
              </p>
              
              <div className="max-w-md mx-auto">
                <AnimatePresence mode="wait">
                  {!subscribed ? (
                    <motion.form 
                      key="form"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onSubmit={(e) => {
                        handleSubscribe(e);
                        trackEvent('email_subscribe', { source: 'footer' });
                      }} 
                      className="flex flex-col sm:flex-row gap-0"
                    >
                      <input 
                        type="email" 
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="your@email.com"
                        required
                        className="flex-1 bg-soy-label border-2 border-white px-6 py-4 font-bold outline-none focus:bg-white transition-all text-black"
                      />
                      <button 
                        type="submit"
                        className="bg-soy-red text-white px-8 py-4 font-black uppercase tracking-widest hover:bg-white hover:text-black transition-all border-2 border-soy-red"
                      >
                        SUBSCRIBE
                      </button>
                    </motion.form>
                  ) : (
                    <motion.div 
                      key="success"
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="bg-emerald-500 text-white p-4 font-black uppercase tracking-widest flex items-center justify-center gap-3 border-2 border-white italic"
                    >
                      <Check size={24} /> YOU'RE IN THE SAUCE.
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-soy-bottle flex flex-col md:flex-row justify-between gap-4 text-[10px] font-bold uppercase tracking-widest opacity-40">
            <span>ÃÂ© 2026 OPENSOYCE LABS. ALL SAUCE RESERVED.</span>
            <span>POWERED BY SWARM INTELLIGENCE</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
