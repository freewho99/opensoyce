import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, ShieldCheck, Zap, Star,
  ArrowUpRight, Rocket, Skull, AlertCircle, Info,
  Flame, TrendingUp, RefreshCw
} from 'lucide-react';
import NutritionLabel from '../components/NutritionLabel';
import ProjectCard from '../components/ProjectCard';
import Soycie from '../components/Soycie';
import { useProjects } from '../context/ProjectContext';
import { CATEGORIES } from '../data/categories';
import { trackEvent } from '../utils/analytics';

const CATEGORY_USE_CASES: Record<string, { use: string; fork: string }> = {
  'next.js': { use: "Full-stack web apps", fork: "Headless storefront engine" },
  'react': { use: "Any UI layer", fork: "Component marketplace" },
  'vite': { use: "Blazing dev builds", fork: "Custom bundler preset" },
  'astro': { use: "Content-heavy sites", fork: "Visual CMS builder" },
  'biome': { use: "Linting + formatting", fork: "Team code-quality CLI" },
  'deno': { use: "Secure server runtime", fork: "Edge function toolkit" },
  'bun': { use: "Fast Node replacement", fork: "Serverless runtime platform" },
  'ui': { use: "Drop-in UI components", fork: "Branded design system" },
  'hono': { use: "Ultra-fast API layer", fork: "Edge API gateway" },
  'trpc': { use: "Type-safe API calls", fork: "API-as-a-product starter" },
  'prisma': { use: "Type-safe DB queries", fork: "Multi-tenant SaaS ORM" },
  'supabase': { use: "Instant backend layer", fork: "White-label BaaS" },
  'aider': { use: "AI pair programming in the terminal", fork: "Team-specific coding agents" },
  'openhands': { use: "Autonomous software engineering tasks", fork: "Internal dev automation platforms" },
  'langgraph': { use: "Controllable, stateful agent workflows", fork: "Visual agent orchestration tools" },
};

const STALE_PROJECTS = [
  { repo: 'moment', owner: 'moment', stars: '47K', stale: '18MO', score: 4.2, note: "STILL USED IN LEGACY CODE. NOT RECOMMENDED FOR NEW PROJECTS." },
  { repo: 'left-pad', owner: 'leftpad', stars: '8K', stale: '36MO', score: 1.1, note: "THE INCIDENT THAT BROKE THE INTERNET. NOW A MUSEUM PIECE." },
  { repo: 'request', owner: 'request', stars: '26K', stale: '24MO', score: 3.5, note: "DEPRECATED BY ITS OWN MAINTAINERS. MILLIONS STILL DEPEND ON IT." },
];

const REMIX_PROJECTS = [
  { 
    name: 'OPEN DESIGN', 
    owner: 'nicholasgasior', 
    repo: 'open-design', 
    idea: 'Turn into Angular 20 design studio',
    why: "A local-first AI design workflow that works with every model — Angular teams have been waiting for this."
  },
  { 
    name: 'ASTRO', 
    owner: 'withastro', 
    repo: 'astro', 
    idea: 'Build a visual content CMS',
    why: "Content-first architecture maps perfectly to CMS use cases — the template ecosystem gap is wide open."
  },
  { 
    name: 'BIOME', 
    owner: 'biomejs', 
    repo: 'biome', 
    idea: 'Ship as team code-quality CLI',
    why: "One binary, zero config, 100x faster — teams will pay for an opinionated CLI wrapper."
  },
  { 
    name: 'ARCHON', 
    owner: 'coleam00', 
    repo: 'archon', 
    idea: 'Package as AI workflow builder',
    why: "YAML-defined agent workflows are the next Docker Compose — the tooling category is at day one."
  },
];

// EDITORIAL PICKS: bands below were baked once via verdictFor() from src/shared/verdict.js
// against curated scores. Numeric scores are intentionally NOT shown on the card to
// avoid drift vs. live /api/analyze; click-through goes to /lookup for the live scan.
const TRENDING_DATA = [
  { owner: 'paul-gauthier', repo: 'aider', band: 'USE READY', tagline: 'Terminal-based AI pair programmer', signals: ['FRESH', 'MOMENTUM'], category: 'skills-agents', hotLine: '↑ Best-in-class terminal coding experience' },
  { owner: 'opendevin', repo: 'OpenHands', band: 'USE READY', tagline: 'Autonomous software engineering agent', signals: ['MOMENTUM', 'FORKABLE'], category: 'skills-agents', hotLine: '↑ Autonomous dev workflows surging' },
  { owner: 'langchain-ai', repo: 'langgraph', band: 'USE READY', tagline: 'Controllable agent workflows', signals: ['FRESH', 'DOCS STRONG'], category: 'skills-agents', hotLine: '↑ Advanced stateful orchestration' },
  { owner: 'vercel', repo: 'next.js', band: 'USE READY', tagline: 'The React Framework for the Web', signals: ['HIGH ADOPT', 'FORKABLE'], category: 'meta-frameworks', hotLine: '↑ Commit velocity sustained · New App Router patterns shipping' },
  { owner: 'withastro', repo: 'astro', band: 'USE READY', tagline: 'The web framework for content-driven websites', signals: ['FRESH', 'FORKABLE'], category: 'meta-frameworks', hotLine: '↑ Content site benchmark · v5 content collections reshaping DX' },
  { owner: 'biomejs', repo: 'biome', band: 'USE READY', tagline: 'One toolchain for your web project', signals: ['FRESH', 'MOMENTUM'], category: 'build-tools', hotLine: '↑ Linting + formatting unified · Fast adoption replacing ESLint' },
  { owner: 'shadcn-ui', repo: 'ui', band: 'USE READY', tagline: 'Beautifully designed components', signals: ['HIGH ADOPT', 'DOCS STRONG'], category: 'ui-libraries', hotLine: '↑ Copy-paste model copied everywhere · New registry launched' },
  { owner: 'honojs', repo: 'hono', band: 'USE READY', tagline: 'Ultrafast web framework for the Edges', signals: ['MOMENTUM', 'LOW RISK'], category: 'meta-frameworks', hotLine: '↑ Cloudflare Workers standard · 100k weekly downloads milestone' },
  { owner: 'trpc', repo: 'trpc', band: 'USE READY', tagline: 'End-to-end typesafe APIs made easy', signals: ['DOCS STRONG', 'LOW RISK'], category: 'meta-frameworks', hotLine: '↑ Type-safe APIs spreading · TanStack integration shipped' },
  { owner: 'vitejs', repo: 'vite', band: 'USE READY', tagline: 'Next generation frontend tooling', signals: ['HIGH ADOPT', 'FRESH'], category: 'build-tools', hotLine: '↑ Fastest growing build tool · Vite 6 ecosystem expanding' },
  { owner: 'facebook', repo: 'react', band: 'USE READY', tagline: 'A JavaScript library for building user interfaces', signals: ['HIGH ADOPT', 'LOW RISK'], category: 'ui-libraries', hotLine: '↑ React 19 adoption accelerating · Compiler going stable' },
  { owner: 'denoland', repo: 'deno', band: 'USE READY', tagline: 'A secure runtime for JavaScript and TypeScript', signals: ['DOCS STRONG', 'MOMENTUM'], category: 'build-tools', hotLine: '↑ npm compat complete · KV store going production' },
  { owner: 'oven-sh', repo: 'bun', band: 'USE READY', tagline: 'Incredibly fast JavaScript runtime', signals: ['MOMENTUM', 'FRESH'], category: 'build-tools', hotLine: '↑ Node replacement gaining teams · Bun 2 runtime performance' },
  { owner: 'prisma', repo: 'prisma', band: 'USE READY', tagline: 'Next-generation Node.js and TypeScript ORM', signals: ['LOW RISK', 'DOCS STRONG'], category: 'orm-database', hotLine: '↑ Prisma 6 GA · Accelerate edge queries launching' },
  { owner: 'supabase', repo: 'supabase', band: 'USE READY', tagline: 'The open source Firebase alternative', signals: ['HIGH ADOPT', 'FORKABLE'], category: 'orm-database', hotLine: '↑ Auth + storage + DB in one · Vector/AI features shipping' },
  { owner: 'coleam00', repo: 'archon', band: 'USE READY', tagline: 'YAML-DEFINED AI CODING WORKFLOWS', signals: ['FRESH', 'MOMENTUM'], category: 'ai-agent-harnesses', hotLine: '↑ YAML-defined agent workflows surging' },
  // openharness/ohmo previously baked band: 'HIGH MOMENTUM' here. Removed
  // because HIGH MOMENTUM is no longer a publicly-displayed verdict tier
  // (editorial-only — see src/shared/verdict.js). Reintroduce when a real
  // momentum heuristic ships so the band can be earned by the algorithm.
];

export default function Home() {
  const { projects } = useProjects();
  const featured = projects[0];
  const [filter, setFilter] = useState('All');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [tickerIndex, setTickerIndex] = useState(0);

  const tickerMessages = [
    "FROM THE BOARD: 30 PROJECTS SCANNED · 6 CATEGORIES · REAL SCORES · UPDATED DAILY",
    "FROM THE BOARD: 4 STALE PROJECTS FLAGGED · 2 NEW VERIFIED MAINTAINERS",
    "FROM THE BOARD: 7 HIGH-FORKABILITY PROJECTS DETECTED THIS WEEK",
    "FROM THE BOARD: 3 NEW AI HARNESS ENTRIES · ARCHON LEADS THE CATEGORY"
  ];

  React.useEffect(() => {
    const interval = setInterval(() => {
      setTickerIndex((prev) => (prev + 1) % tickerMessages.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const categories = [
    { label: 'ALL', id: 'All' },
    { label: 'SKILLS / AGENTS', id: 'skills-agents' },
    { label: 'AI HARNESSES', id: 'ai-agent-harnesses' },
    { label: 'UI/DESIGN', id: 'ui-libraries' },
    { label: 'BUILD TOOLS', id: 'build-tools' },
    { label: 'META-FRAMEWORKS', id: 'meta-frameworks' },
    { label: 'DATABASE', id: 'orm-database' },
    { label: 'TESTING', id: 'testing-harnesses' },
  ];

  const filteredTrending = filter === 'All' 
    ? TRENDING_DATA 
    : TRENDING_DATA.filter(t => t.category === filter);

  if (!featured) {
    return (
      <div className="min-h-screen bg-soy-label flex items-center justify-center">
        <Soycie size="lg" mood="alert" className="animate-pulse" />
      </div>
    );
  }

  const scrollToIndex = (index: number) => {
    if (scrollRef.current) {
      const cardWidth = 400 + 32; // card width + gap
      scrollRef.current.scrollTo({ left: index * cardWidth, behavior: 'smooth' });
    }
  };

  return (
    <div className="flex flex-col bg-soy-label/20">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b-4 border-soy-bottle py-20 px-4 bg-white">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-7 z-10 text-center lg:text-left">
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="mb-6 bg-soy-red text-white text-[10px] font-black px-4 py-1.5 uppercase tracking-[0.2em] inline-block shadow-[4px_4px_0px_#000]"
            >
              The Trust Layer is Here
            </motion.div>
            <motion.h1 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-6xl md:text-[5.5rem] font-bold uppercase tracking-tighter italic leading-[0.9] mb-8"
            >
              BEFORE YOU BUILD ON <span className="text-soy-red">OPEN SOURCE,</span><br/>CHECK THE LABEL.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-xl md:text-2xl font-normal max-w-2xl mx-auto lg:mx-0 mb-10 leading-snug opacity-80"
            >
              OpenSoyce ranks open-source projects by health, forkability, momentum, and adoption readiness — so builders can decide what to use, remix, or avoid.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex flex-col sm:flex-row flex-wrap gap-4 justify-center lg:justify-start"
            >
              <Link 
                to="/leaderboards" 
                onClick={() => trackEvent('hero_explore_click', { source: 'home' })}
                className="bg-black text-[#F5F0E8] px-10 py-5 text-sm font-black uppercase tracking-widest hover:bg-soy-red transition-all flex items-center justify-center gap-3 shadow-[6px_6px_0px_#000]"
              >
                EXPLORE THE BOARD →
              </Link>
              <Link to="/claim" className="bg-[#F5F0E8] text-black border-2 border-black px-10 py-5 text-sm font-black uppercase tracking-widest hover:bg-white transition-all flex items-center justify-center gap-3 shadow-[6px_6px_0px_#000]">
                SUBMIT A PROJECT
              </Link>
            </motion.div>
          </div>

          <div className="lg:col-span-5 flex justify-center relative">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, rotate: 5 }}
              animate={{ opacity: 1, scale: 1, rotate: 2 }}
              transition={{ delay: 0.4 }}
              className="relative z-10"
            >
              <NutritionLabel project={featured} />
            </motion.div>
            
            <Soycie size="md" className="absolute -bottom-10 -right-10 z-20" mood="cool" />
          </div>
        </div>
        
        <div className="absolute top-0 right-0 w-full h-full opacity-[0.03] pointer-events-none -z-10 bg-[radial-gradient(#302C26_1px,transparent_1px)] [background-size:40px_40px]"></div>
      </section>

      {/* AI Dependency Framing Band */}
      {/* Bands below are baked once via verdictFor() from src/shared/verdict.js.
          langchain WATCHLIST = verdict-cap from commit 8c0d6ab firing on
          1 critical + 3 high open advisories (hidden-vulns cap). Numeric
          scores are deliberately not shown — click-through hits /lookup
          for the live scan. */}
      <section className="py-16 px-4 bg-white border-b-4 border-black">
        <div className="max-w-7xl mx-auto">
          <div className="mb-10 flex flex-wrap items-center gap-3">
            <span className="bg-soy-red text-white px-4 py-2 text-xs font-black uppercase tracking-[0.4em] shadow-[4px_4px_0px_#000]">
              NOW SCANNING AI DEPS
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-60 italic">
              Verdict bands shown — click any card for the live score.
            </span>
          </div>

          <div className="mb-3">
            <h2 className="text-5xl font-black uppercase italic tracking-tighter leading-none mb-4">
              BUILT FOR THE AI DEPENDENCY TREE
            </h2>
            <p className="text-xl font-bold uppercase tracking-wide opacity-70 italic max-w-3xl">
              Lockfile-aware scoring across npm, uv, and Poetry — so the models, agents, and SDKs you ship on get the same nutrition label as everything else.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-10">
            {[
              { owner: 'langchain-ai', repo: 'langchain', band: 'WATCHLIST', tagline: 'LLM app framework', note: '⚠ 4 OPEN HIGH/CRIT' },
              { owner: 'huggingface', repo: 'transformers', band: 'USE READY', tagline: 'State-of-the-art ML models', note: 'Reference stack for OSS AI' },
              { owner: 'vercel', repo: 'ai', band: 'USE READY', tagline: 'AI SDK for TS/React', note: 'Vercel-backed · fast-moving' },
              { owner: 'openai', repo: 'openai-node', band: 'USE READY', tagline: 'Official OpenAI Node SDK', note: 'First-party SDK · widely used' },
            ].map((pkg, i) => {
              const bandStyle = pkg.band === 'WATCHLIST'
                ? { bg: 'bg-yellow-500', textCol: 'text-black' }
                : { bg: 'bg-green-600', textCol: 'text-white' };
              return (
                <Link
                  key={i}
                  to={`/lookup?q=${pkg.owner}/${pkg.repo}`}
                  onClick={() => trackEvent('ai_band_card_click', { repo: `${pkg.owner}/${pkg.repo}`, source: 'ai_framing_band' })}
                  className="group bg-white border-4 border-black p-6 shadow-[6px_6px_0px_#000] hover:shadow-[10px_10px_0px_#D12D2D] hover:-translate-y-1 transition-all flex flex-col"
                >
                  <div className="flex justify-between items-start mb-4 gap-3">
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] font-black uppercase tracking-widest opacity-40 leading-none mb-1 truncate">{pkg.owner} /</span>
                      <h3 className="text-2xl font-black uppercase italic tracking-tighter leading-none group-hover:text-soy-red transition-all truncate">
                        {pkg.repo}
                      </h3>
                    </div>
                    <div className={`px-2 py-1 ${bandStyle.bg} ${bandStyle.textCol} text-[9px] font-black uppercase tracking-[0.15em] border-2 border-black shadow-[3px_3px_0px_#000] shrink-0`}>
                      {pkg.band}
                    </div>
                  </div>
                  <p className="text-[11px] font-bold uppercase tracking-widest opacity-60 italic mb-3">
                    "{pkg.tagline}"
                  </p>
                  <p className={`text-[10px] font-black uppercase tracking-wider mt-auto ${pkg.band === 'WATCHLIST' ? 'text-soy-red' : 'opacity-70'}`}>
                    {pkg.note}
                  </p>
                  <div className="mt-4 pt-3 border-t border-black/10 text-[9px] font-black uppercase tracking-[0.2em] text-soy-red flex items-center gap-2">
                    SCAN LIVE <ArrowRight size={12} />
                  </div>
                </Link>
              );
            })}
          </div>

          <p className="mt-8 text-[10px] font-bold uppercase tracking-widest opacity-50 italic">
            Verdict bands shown; click any card for the live score. Now supports npm, uv, and Poetry lockfiles.
          </p>

          <div className="mt-6 flex flex-col sm:flex-row gap-4">
            <Link
              to="/leaderboard/ai"
              onClick={() => trackEvent('ai_leaderboard_cta_click', { source: 'ai_framing_band' })}
              className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest border-b-2 border-black pb-1 hover:text-soy-red hover:border-soy-red transition-all"
            >
              See the full AI ecosystem leaderboard <ArrowRight size={14} />
            </Link>
            <Link
              to="/graveyard/ai"
              onClick={() => trackEvent('ai_graveyard_cta_click', { source: 'ai_framing_band' })}
              className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest border-b-2 border-black pb-1 hover:text-soy-red hover:border-soy-red transition-all"
            >
              Browse the AI graveyard <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 px-4 bg-white border-b-4 border-black">
        <div className="max-w-7xl mx-auto">
          <div className="mb-16 text-center">
            <h2 className="text-4xl font-bold uppercase tracking-widest border-b-4 border-black inline-block pb-2 mb-4 italic">The Secret Sauce</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border-4 border-black">
            <FeatureItem
              icon={<ShieldCheck className="text-soy-red" size={40} />}
              title="Soyce Score"
              description="A 0–10 score built from maintenance, community, security, documentation, and activity signals."
            />
            <FeatureItem
              icon={<Zap className="text-soy-red" size={40} />}
              title="Nutrition Labels"
              description="See repo health at a glance without digging through issues, commits, and dependency files."
            />
            <FeatureItem
              icon={<RefreshCw className="text-soy-red" size={40} />}
              title="Fresh Analysis"
              description="Analyze any GitHub repo on demand. Live data, 5-minute cache, and an embeddable badge for your README."
              last
            />
          </div>
        </div>
      </section>

      {/* HEAT CHECK Ticker */}
      <div className="bg-black text-white py-3 border-y-4 border-black relative overflow-hidden h-12">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-center h-full">
          <motion.div 
            key={tickerIndex}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="flex items-center gap-4"
          >
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-center">
              {tickerMessages[tickerIndex]}
            </span>
          </motion.div>
        </div>
      </div>

      {/* Heat Check Section */}
      <section className="py-20 px-4 bg-soy-label/20 border-b-4 border-black">
        <div className="max-w-7xl mx-auto">
          <div className="mb-12">
            <h2 className="text-6xl font-black uppercase italic tracking-tighter mb-4 bg-black text-white inline-block px-6 py-2 transform -skew-x-12">
              OPEN-SOURCE HEAT CHECK 🔥
            </h2>

            <div className="mb-8 flex flex-wrap items-center gap-3">
              <span className="bg-soy-red text-white px-4 py-2 text-xs font-black uppercase tracking-[0.4em] shadow-[4px_4px_0px_#000]">
                EDITORIAL PICKS
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-60 italic">
                Verdict bands are static — click any card for the live score.
              </span>
            </div>

            {/* Filter Chips */}
            <div className="flex flex-wrap gap-2 mb-12 overflow-x-auto pb-4 scrollbar-hide">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setFilter(cat.id)}
                  className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all border-2 border-black shadow-[2px_2px_0px_#000] whitespace-nowrap outline-none ${
                    filter === cat.id ? 'bg-black text-[#F5F0E8]' : 'bg-white text-black hover:bg-soy-red hover:text-white'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div 
            ref={scrollRef}
            className="flex overflow-x-auto gap-8 pb-12 scrollbar-hide snap-x"
          >
            {filteredTrending.map((trend, i) => (
              <OpportunityCard key={i} trend={trend} />
            ))}
          </div>

          {/* Ticker Rail */}
          <div className="mt-8 border-t-2 border-black/10 pt-6 overflow-x-auto scrollbar-hide">
            <div className="flex gap-0 items-center justify-between min-w-max px-4">
              {filteredTrending.map((trend, i) => (
                <React.Fragment key={i}>
                  <button
                    onClick={() => scrollToIndex(i)}
                    className={`text-[9px] font-black uppercase tracking-widest transition-all p-2 hover:text-soy-red ${
                      // Logic for active could be complex based on scroll position, but we'll stick to hover/scroll trigger
                      'opacity-40 hover:opacity-100 hover:underline hover:decoration-soy-red hover:decoration-2'
                    }`}
                  >
                    [ {trend.repo.toUpperCase()} ]
                  </button>
                  {i < filteredTrending.length - 1 && <span className="opacity-10">──</span>}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </section>
      
      {/* Trending Leaderboard Preview */}
      <section className="py-20 px-4 border-b-4 border-black bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-end mb-12">
            <div>
              <h2 className="text-4xl font-bold uppercase italic tracking-tighter">Trending Projects</h2>
              <p className="font-medium opacity-60">High-growth tools with the clean labels.</p>
            </div>
            <Link to="/leaderboards" className="hidden md:flex items-center gap-2 font-bold uppercase text-sm border-b-2 border-soy-bottle pb-1 hover:text-soy-red hover:border-soy-red transition-all">
              EXPLORE THE BOARD →
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-6">
            {projects.slice(0, 3).map(project => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        </div>
      </section>

      {/* Section A: Battle-Tested Categories */}
      <section className="py-20 px-4 bg-white border-b-4 border-black">
        <div className="max-w-7xl mx-auto">
          <div className="mb-16">
            <h2 className="text-5xl font-black uppercase italic tracking-tighter leading-none mb-4">BATTLE-TESTED CATEGORIES</h2>
            <p className="text-xl font-bold uppercase tracking-widest text-soy-red italic">REAL SCORES. NO OPINIONS.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {CATEGORIES.slice(0, 9).map((cat) => (
              <Link 
                key={cat.slug} 
                to={`/compare/${cat.slug}`}
                className="group border-4 border-black p-8 bg-soy-label/20 hover:shadow-[8px_8px_0px_#000] hover:-translate-y-1 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="text-4xl mb-4 group-hover:scale-110 transition-transform origin-left">{cat.icon}</div>
                  <h3 className="text-2xl font-black uppercase italic tracking-tight mb-2">{cat.title}</h3>
                  <p className="text-[10px] font-bold opacity-60 uppercase tracking-widest leading-relaxed mb-6 italic">"{cat.tagline}"</p>
                </div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-soy-red flex items-center gap-2">
                  COMPARE CATEGORY <ArrowRight size={14} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Section B: Projects Worth Remixing */}
      <section className="py-20 px-4 bg-soy-label/30 border-b-4 border-black overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="mb-16">
            <h2 className="text-5xl font-black uppercase italic tracking-tighter leading-none mb-4">PROJECTS WORTH REMIXING 🍴</h2>
            <p className="font-bold uppercase tracking-widest opacity-60 italic">These repos are begging to be forked.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {REMIX_PROJECTS.map((remix, i) => (
              <motion.div
                key={i}
                whileHover={{ x: 4, y: -4 }}
                className="bg-white border-2 border-black/80 p-10 shadow-[4px_4px_0px_#000] relative group overflow-hidden flex flex-col justify-between h-full"
              >
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-20 transition-opacity">
                  <Zap size={120} />
                </div>
                <div className="relative z-10 mb-8">
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2 block">{remix.owner} /</span>
                  <h3 className="text-5xl font-black tracking-tighter italic mb-4">{remix.name}</h3>
                  <p className="text-xl font-bold uppercase italic text-soy-red mb-4 tracking-wide">
                    "{remix.idea}"
                  </p>
                  <p className="text-[10px] font-bold opacity-60 uppercase tracking-widest italic mb-2">WHY IT MATTERS:</p>
                  <p className="text-xs font-medium opacity-80 leading-relaxed mb-8 max-w-sm">
                    {remix.why}
                  </p>
                </div>
                <Link 
                  to={`/lookup?q=${remix.owner}/${remix.repo}`}
                  className="relative z-10 inline-flex items-center gap-3 bg-black text-white px-8 py-4 text-xs font-black uppercase tracking-[0.2em] transform group-hover:scale-105 transition-all w-fit"
                >
                  FORK THIS <ArrowRight size={16} />
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Section C: Popular But Stale */}
      <section className="py-24 px-4 bg-black text-white">
        <div className="max-w-7xl mx-auto">
          <div className="mb-16 text-center">
            <h2 className="text-6xl font-black uppercase italic tracking-tighter mb-4 flex items-center justify-center gap-4">
               POPULAR BUT STALE <Skull size={48} className="text-soy-red" />
            </h2>
            <p className="text-xl font-bold uppercase tracking-[0.3em] opacity-40 italic">Popular. Influential. No longer fresh.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
            {STALE_PROJECTS.map((stale, i) => (
              <div key={i} className="border-4 border-white/20 p-8 relative overflow-hidden group hover:border-soy-red transition-all">
                <div className="absolute -right-8 -top-8 text-soy-red opacity-10 rotate-12 group-hover:opacity-30 group-hover:scale-110 transition-all pointer-events-none">
                  <Skull size={180} />
                </div>
                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-6">
                    <h3 className="text-4xl font-black italic tracking-tighter">{stale.repo}.js</h3>
                    <div className="bg-soy-red text-white px-3 py-1 text-sm font-black italic border-2 border-white shadow-[4px_4px_0px_#000]">
                      {stale.score}
                    </div>
                  </div>
                  <div className="space-y-4 mb-8">
                    <div className="flex justify-between text-[10px] font-black uppercase tracking-widest opacity-60">
                      <span>STARS</span>
                      <span>{stale.stars}</span>
                    </div>
                    <div className="flex justify-between text-xs font-black uppercase tracking-widest text-soy-red">
                      <span>LAST COMMIT</span>
                      <span>{stale.stale} AGO</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="border-4 border-soy-red py-2 px-4 inline-block text-2xl font-black italic text-soy-red tracking-widest transform -rotate-6">
                      STALE
                    </div>
                    <p className="text-[8px] tracking-widest uppercase opacity-60 font-bold leading-tight mt-4">
                      {stale.note}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center">
            <Link 
              to="/graveyard" 
              className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest border-b-2 border-white/40 pb-1 hover:text-soy-red hover:border-soy-red transition-all"
            >
              SEE FULL GRAVEYARD <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-soy-bottle text-soy-label text-center overflow-hidden relative">
        <div className="max-w-3xl mx-auto relative z-10">
          <h2 className="text-5xl md:text-7xl font-bold uppercase italic tracking-tighter leading-none mb-8">
            Ready to add <span className="text-soy-red">Extra Sauce</span> to your repo?
          </h2>
          <p className="text-lg md:text-xl font-medium opacity-80 mb-10 text-center">
            Join 1,000+ maintainers building trust with OpenSoyce. 
            Get your badge, verify your ownership, and boost your discovery.
          </p>
          <button 
            onClick={() => trackEvent('start_free_click', { source: 'home' })}
            className="bg-soy-label text-soy-bottle px-12 py-5 text-xl font-bold uppercase tracking-widest hover:bg-soy-red hover:text-white transition-all shadow-[6px_6px_0px_#D12D2D]"
          >
            Start for Free
          </button>
        </div>
        
        {/* Floating elements */}
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 20, repeat: Infinity, ease: 'linear' }} className="absolute -top-20 -left-20 opacity-10 pointer-events-none">
          <Star size={300} />
        </motion.div>
        <motion.div animate={{ rotate: -360 }} transition={{ duration: 25, repeat: Infinity, ease: 'linear' }} className="absolute -bottom-20 -right-20 opacity-10 pointer-events-none">
          <ShieldCheck size={300} />
        </motion.div>
      </section>
    </div>
  );
}

function OpportunityCard({ trend }: { trend: any, key?: any }) {
  const useCases = CATEGORY_USE_CASES[trend.repo.toLowerCase()] || { use: "Generic development", fork: "Custom ecosystem component" };

  // Band is baked at curation time via verdictFor() — see TRENDING_DATA.
  // Numeric scores are deliberately not displayed here to avoid drift vs.
  // the live /api/analyze. Click-through to /lookup shows the real score.
  //
  // HIGH MOMENTUM is intentionally not mapped here: it is an editorial-only
  // tier and is not surfaced on the public home page. See verdict.js for the
  // full rationale.
  const getBadge = () => {
    const band = trend.band || 'FORKABLE';
    if (band === 'STALE') return { text: 'STALE', bg: 'bg-gray-600', textCol: 'text-white' };
    if (band === 'USE READY') return { text: 'USE READY', bg: 'bg-green-600', textCol: 'text-white' };
    if (band === 'FORKABLE') return { text: 'FORKABLE', bg: 'bg-blue-600', textCol: 'text-white' };
    if (band === 'STABLE') return { text: 'STABLE', bg: 'bg-slate-500', textCol: 'text-white' };
    if (band === 'WATCHLIST') return { text: 'WATCHLIST', bg: 'bg-yellow-500', textCol: 'text-black' };
    if (band === 'RISKY') return { text: 'RISKY', bg: 'bg-red-700', textCol: 'text-white' };
    return { text: band, bg: 'bg-blue-600', textCol: 'text-white' };
  };

  const badge = getBadge();

  return (
    <div className="min-w-[280px] sm:min-w-[400px] min-h-[460px] bg-white border-4 border-black p-8 shadow-[8px_8px_0px_#000] hover:shadow-[12px_12px_0px_#D12D2D] transition-all snap-center relative flex flex-col group">
      {/* Badge */}
      <div className={`absolute top-0 right-0 px-2 py-0.5 ${badge.bg} ${badge.textCol} text-[8px] font-black uppercase tracking-widest border border-black shadow-[-2px_2px_0px_#000]`}>
        {badge.text}
      </div>

      <div className="flex-1">
        <div className="flex justify-between items-start mb-1 gap-4">
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-widest opacity-40 leading-none mb-1">{trend.owner} /</span>
            <h3 className="text-4xl font-black uppercase italic tracking-tighter leading-none group-hover:text-soy-red transition-all">
              {trend.repo}
            </h3>
          </div>
          <div className={`mt-1 px-3 py-1.5 ${badge.bg} ${badge.textCol} text-[10px] font-black uppercase tracking-[0.2em] border-2 border-black shadow-[3px_3px_0px_#000] shrink-0`}>
            {badge.text}
          </div>
        </div>

        <p className="text-xs font-bold uppercase tracking-widest opacity-60 italic mb-2 truncate">
          "{trend.tagline}"
        </p>

        {trend.hotLine && (
          <p className="text-[9px] tracking-wider text-[#E63322] font-bold uppercase mb-4 truncate">
            {trend.hotLine}
          </p>
        )}

        {/* Signal Pills */}
        <div className="flex flex-wrap gap-2 mb-6">
          {trend.signals.slice(0, 2).map((sig: string) => (
            <span key={sig} className="text-[8px] font-black uppercase tracking-tighter border border-black/20 px-2 py-0.5 opacity-60">
              {sig}
            </span>
          ))}
          <span className="text-[8px] font-black uppercase tracking-tighter border border-black/20 px-2 py-0.5 opacity-40 italic">
            EDITORIAL · LIVE SCORE ON CLICK
          </span>
        </div>

        {/* Use / Fork Lines */}
        <div className="space-y-3 mb-6 pt-4 border-t border-black/10">
          <div className="flex items-start gap-3">
            <span className="text-[10px] font-black text-white bg-black px-1.5 py-0.5 shrink-0">USE</span>
            <span className="text-xs font-bold uppercase tracking-tight">{useCases.use}</span>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-[10px] font-black text-soy-red border border-soy-red px-1.5 py-0.5 shrink-0">FORK</span>
            <span className="text-xs font-bold uppercase tracking-tight italic">{useCases.fork}</span>
          </div>
        </div>
      </div>

      <div className="mt-auto space-y-3 pt-4 border-t border-black/5">
        <div className="flex gap-2">
          <ActionBtn label="USE" repo={`${trend.owner}/${trend.repo}`} />
          <ActionBtn label="FORK" repo={`${trend.owner}/${trend.repo}`} />
          <ActionBtn label="GROW" repo={`${trend.owner}/${trend.repo}`} />
        </div>
        <Link
          to={`/lookup?q=${trend.owner}/${trend.repo}`}
          onClick={() => trackEvent('analyze_project_click', { repo: `${trend.owner}/${trend.repo}`, source: 'opportunity_card' })}
          className="w-full bg-black text-white py-3 text-[10px] font-black uppercase tracking-widest italic hover:bg-soy-red transition-all text-center flex items-center justify-center gap-2"
        >
          SCAN LIVE →
        </Link>
      </div>
    </div>
  );
}

function ScoreStrip({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[8px] font-black uppercase tracking-widest opacity-40 w-16">{label}</span>
      <div className="flex-1 h-1.5 bg-black/5 relative overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          whileInView={{ width: `${value}%` }} 
          className="absolute inset-y-0 bg-black opacity-60"
        />
      </div>
    </div>
  );
}

function ActionBtn({ label, repo }: { label: string, repo: string }) {
  return (
    <button 
      onClick={() => trackEvent(`${label.toLowerCase()}_click`, { repo, page: '/' })}
      className="flex-1 border border-black py-2 text-[10px] font-black uppercase tracking-widest hover:bg-soy-red hover:text-white transition-all"
    >
      {label}
    </button>
  );
}

function FeatureItem({ icon, title, description, last = false }: { icon: React.ReactNode, title: string, description: string, last?: boolean }) {
  return (
    <div className={`p-10 flex flex-col items-center text-center ${!last ? 'md:border-r-4 border-black border-b-4 md:border-b-0' : ''}`}>
      <div className="mb-6">{icon}</div>
      <h3 className="text-2xl font-bold uppercase italic mb-4">{title}</h3>
      <p className="font-medium opacity-70 leading-relaxed">
        {description}
      </p>
    </div>
  );
}

