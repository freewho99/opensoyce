import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import Layout from './components/Layout';
import Home from './pages/Home';
import Leaderboard from './pages/Leaderboard';
import ProjectDetail from './pages/ProjectDetail';
import ForkProject from './pages/ForkProject';
import Scan from './pages/Scan';
import Lookup from './pages/Lookup';
import Watchlist from './pages/Watchlist';
import CLI from './pages/CLI';
import Scanner from './pages/Scanner';
import Compare from './pages/Compare';
import Recommend from './pages/Recommend';
import Pricing from './pages/Pricing';
import Claim from './pages/Claim';
import Blog from './pages/Blog';
import BlogPost from './pages/BlogPost';
import FAQ from './pages/FAQ';
import About from './pages/About';
import Graveyard from './pages/Graveyard';
import AiLeaderboard from './pages/AiLeaderboard';
import AiGraveyard from './pages/AiGraveyard';
import Methodology from './pages/Methodology';
import Remix from './pages/Remix';
import HeatCheck from './pages/HeatCheck';
import SubmitProject from './pages/SubmitProject';
import Challenge from './pages/Challenge';
import Analytics from './pages/Analytics';
import SignalInbox from './pages/SignalInbox';
import SkillsAgentsCompare from './pages/SkillsAgentsCompare';
import OpenDesignCaseStudy from './pages/OpenDesignCaseStudy';
import Dashboard from './pages/Dashboard';
import NotFound from './pages/NotFound';

// Route tree extracted so the prerender entry can wrap it in <StaticRouter>
// while the browser entry uses <BrowserRouter>. Keep this in sync with the
// routes inside <App/> below.
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="/leaderboards" element={<Leaderboard />} />
        <Route path="/lookup" element={<Lookup />} />
        <Route path="/watchlist" element={<Watchlist />} />
        <Route path="/cli" element={<CLI />} />
        <Route path="/scan" element={<Scan />} />
        <Route path="/scanner" element={<Scanner />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="/recommend" element={<Recommend />} />
        <Route path="/recipes" element={<Recommend />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/claim" element={<Claim />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/blog/:slug" element={<BlogPost />} />
        <Route path="/faq" element={<FAQ />} />
        <Route path="/about" element={<About />} />
        <Route path="/methodology" element={<Methodology />} />
        <Route path="/remix" element={<Remix />} />
        <Route path="/heat-check" element={<HeatCheck />} />
        <Route path="/submit-project" element={<SubmitProject />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/admin/signals" element={<SignalInbox />} />
        <Route path="/compare/skills-agents" element={<SkillsAgentsCompare />} />
        <Route path="/challenge" element={<Challenge />} />
        <Route path="/case-study/open-design" element={<OpenDesignCaseStudy />} />
        <Route path="/compare/:slug" element={<Compare />} />
        <Route path="/graveyard" element={<Graveyard />} />
        <Route path="/leaderboard/ai" element={<AiLeaderboard />} />
        <Route path="/graveyard/ai" element={<AiGraveyard />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/projects/:owner/:repo" element={<ProjectDetail />} />
        <Route path="/project/:owner/:repo" element={<ProjectDetail />} />
        <Route path="/projects/:owner/:repo/fork" element={<ForkProject />} />
        <Route path="/project/:owner/:repo/fork" element={<ForkProject />} />
        {/* Fallback or other pages */}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  const [darkSauceMode, setDarkSauceMode] = React.useState(false);
  const [showToast, setShowToast] = React.useState(false);

  React.useEffect(() => {
    let keys: string[] = [];
    const konami = 'ArrowUp,ArrowUp,ArrowDown,ArrowDown,ArrowLeft,ArrowRight,ArrowLeft,ArrowRight,b,a';
    
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      keys.push(e.key);
      keys = keys.slice(-10);
      
      if (keys.join(',') === konami) {
        setDarkSauceMode(prev => !prev);
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  React.useEffect(() => {
    if (darkSauceMode) {
      document.body.classList.add('dark-sauce-mode');
    } else {
      document.body.classList.remove('dark-sauce-mode');
    }
  }, [darkSauceMode]);

  return (
    <BrowserRouter>
      <AppRoutes />

      {/* Konami Toast */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-10 left-1/2 z-[100] bg-soy-red text-white border-4 border-black px-8 py-4 shadow-[8px_8px_0px_#000]"
            style={{ left: '50%', transform: 'translateX(-50%)' }}
          >
            <span className="text-2xl font-black uppercase italic tracking-tighter">
              {darkSauceMode ? '🔥 DARK SAUCE MODE ACTIVATED' : '❄️ LIGHT SAUCE MODE RESTORED'}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </BrowserRouter>
  );
}

