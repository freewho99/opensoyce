export interface CategoryProject {
  owner: string;
  repo: string;
  name: string;
  tagline: string;
  badge?: string;
  githubFallback?: boolean;
  earlyBreakout?: boolean;
  momentumNote?: string;
  whyItsHot?: string;
  useCase?: string;
  forkCase?: string;
  growCase?: string;
}

export interface Category {
  slug: string;
  title: string;
  tagline: string;
  icon: string;
  keywords: string[];
  projects: CategoryProject[];
  verdict: {
    bestForTeams: string; // repo name
    bestPerformance: string;
    easiestOnboarding: string;
  };
}

export const CATEGORIES: Category[] = [
  {
    slug: 'testing-harnesses',
    title: 'TESTING HARNESSES',
    tagline: 'Pick wrong and you rewrite 10,000 tests.',
    icon: '🧪',
    keywords: ['testing', 'test-runner', 'e2e', 'unit-testing', 'integration-testing', 'playwright', 'cypress', 'jest', 'vitest'],
    projects: [
      { 
        owner: 'microsoft', 
        repo: 'playwright', 
        name: 'PLAYWRIGHT', 
        tagline: 'Cross-browser automation built for the modern web.', 
        badge: 'MICROSOFT BACKED',
        whyItsHot: 'Playwright has effectively replaced Selenium for the modern web with its first-class auto-waiting and tracer tools.',
        useCase: 'Best for standardizing E2E testing across enterprise-scale frontend teams.',
        forkCase: 'Excellent base for building vision-based automated testing agents.',
        growCase: 'Contribute to the VS Code extension ecosystem or component testing features.'
      },
      { 
        owner: 'cypress-io', 
        repo: 'cypress', 
        name: 'CYPRESS', 
        tagline: 'The gold standard for E2E testing with a killer DX.', 
        badge: 'BATTLE-TESTED',
        whyItsHot: 'Still the best DX in the industry. The visual debugger is legendary.',
        useCase: 'Rapidly prototyping tests for developers who value immediate feedback loops.',
        forkCase: 'Refactor into custom specialized browser environments for legacy systems.',
        growCase: 'Build custom plugins for the Cypress cloud alternative ecosystem.'
      },
      { owner: 'vitest-dev', repo: 'vitest', name: 'VITEST', tagline: 'Blazing fast unit tests powered by Vite.', badge: 'VITE-NATIVE' },
      { owner: 'jestjs', repo: 'jest', name: 'JEST', tagline: 'The industry standard. Billions of test suites run.', badge: 'INDUSTRY STANDARD' },
      { owner: 'puppeteer', repo: 'puppeteer', name: 'PUPPETEER', tagline: 'Chrome automation direct from Google.', badge: 'GOOGLE BACKED' },
    ],
    verdict: {
      bestForTeams: 'playwright',
      bestPerformance: 'vitest',
      easiestOnboarding: 'cypress',
    }
  },
  {
    slug: 'ui-libraries',
    title: 'UI & DESIGN SYSTEMS',
    tagline: 'Your components are only as healthy as their foundation.',
    icon: '🎨',
    keywords: ['ui', 'components', 'design-system', 'react-components', 'component-library', 'shadcn', 'radix', 'mui', 'chakra', 'tailwind'],
    projects: [
      { 
        owner: 'shadcn-ui', 
        repo: 'ui', 
        name: 'SHADCN/UI', 
        tagline: 'Copy-paste components. No lock-in. Full control.', 
        badge: 'COMMUNITY FAVORITE',
        whyItsHot: 'Copy-paste model copied everywhere · New registry launched. It redefined how we think about "libraries".',
        useCase: 'Teams that want full ownership of their component code without the node_modules weight.',
        forkCase: 'Turn into a specialized Design Studio for specific frameworks (Angular/Vue/Svelte).',
        growCase: 'Contribute new blocks or component primitives to the ever-expanding registry.'
      },
      { owner: 'radix-ui', repo: 'primitives', name: 'RADIX UI', tagline: 'Unstyled, accessible component primitives.', badge: 'ACCESSIBILITY FIRST' },
      { owner: 'mui', repo: 'material-ui', name: 'MATERIAL UI', tagline: 'The most installed React UI library on the planet.', badge: 'MOST INSTALLED' },
      { owner: 'chakra-ui', repo: 'chakra-ui', name: 'CHAKRA UI', tagline: 'Accessible, themeable, and delightful to use.', badge: 'DEV FRIENDLY' },
      { owner: 'ant-design', repo: 'ant-design', name: 'ANT DESIGN', tagline: 'Enterprise-grade design language from Alibaba.', badge: 'ENTERPRISE GRADE' },
    ],
    verdict: {
      bestForTeams: 'material-ui',
      bestPerformance: 'primitives',
      easiestOnboarding: 'ui',
    }
  },
  {
    slug: 'build-tools',
    title: 'BUILD TOOLS',
    tagline: 'Milliseconds matter when you ship 100 times a day.',
    icon: '⚡',
    keywords: ['bundler', 'build-tool', 'vite', 'webpack', 'rollup', 'esbuild', 'turbopack', 'parcel', 'build'],
    projects: [
      { owner: 'vitejs', repo: 'vite', name: 'VITE', tagline: 'The build tool that made webpack feel old overnight.', badge: 'FASTEST GROWING' },
      { owner: 'webpack', repo: 'webpack', name: 'WEBPACK', tagline: 'The one that built the modern web. Still standing.', badge: 'BATTLE-TESTED' },
      { owner: 'rollup', repo: 'rollup', name: 'ROLLUP', tagline: 'ESM-first bundling. What Vite is built on.', badge: 'ESM NATIVE' },
      { owner: 'evanw', repo: 'esbuild', name: 'ESBUILD', tagline: '100x faster than webpack. Written in Go.', badge: 'FASTEST' },
      { owner: 'parcel-bundler', repo: 'parcel', name: 'PARCEL', tagline: 'Zero-config bundling for the rest of us.', badge: 'ZERO CONFIG' },
    ],
    verdict: {
      bestForTeams: 'vite',
      bestPerformance: 'esbuild',
      easiestOnboarding: 'parcel',
    }
  },
  {
    slug: 'meta-frameworks',
    title: 'META-FRAMEWORKS',
    tagline: 'The decision that shapes your entire architecture.',
    icon: '🏗️',
    keywords: ['framework', 'meta-framework', 'nextjs', 'astro', 'nuxt', 'sveltekit', 'remix', 'react', 'full-stack'],
    projects: [
      { 
        owner: 'vercel', 
        repo: 'next.js', 
        name: 'NEXT.JS', 
        tagline: 'React for production. The default choice.', 
        badge: 'MOST ADOPTED',
        whyItsHot: 'Commit velocity sustained · New App Router patterns shipping. It remains the center of gravity for React.',
        useCase: 'Best for standardizing high-traffic production React applications.',
        forkCase: 'Build a specialized Static-Only or Edge-Only framework on top of the Turbopack engine.',
        growCase: 'Sponsor the core foundation or contribute to technical documentation fixes.'
      },
      { 
        owner: 'withastro', 
        repo: 'astro', 
        name: 'ASTRO', 
        tagline: 'Ship less JavaScript. Win on performance.', 
        badge: 'PERFORMANCE FIRST',
        whyItsHot: 'Content site benchmark · v5 content collections reshaping DX. Islands architecture is winning.',
        useCase: 'Content-heavy sites, blogs, and documentation that need perfect SEO.',
        forkCase: 'Build a visual content CMS using the content collections engine.',
        growCase: 'Develop themes or integrations for the Astro ecosystem.'
      },
      { owner: 'nuxt', repo: 'nuxt', name: 'NUXT', tagline: 'The Vue equivalent of Next.js. Equally powerful.', badge: 'VUE ECOSYSTEM' },
      { owner: 'sveltejs', repo: 'kit', name: 'SVELTEKIT', tagline: 'No virtual DOM. Compiles away at build time.', badge: 'MOST LOVED' },
      { owner: 'remix-run', repo: 'remix', name: 'REMIX', tagline: 'Web fundamentals first. Forms, loaders, actions.', badge: 'WEB STANDARDS' },
    ],
    verdict: {
      bestForTeams: 'next.js',
      bestPerformance: 'astro',
      easiestOnboarding: 'remix',
    }
  },
  {
    slug: 'orm-database',
    title: 'ORM & DATABASE LAYER',
    tagline: 'Your data layer outlives every framework decision.',
    icon: '🗄️',
    keywords: ['orm', 'database', 'prisma', 'drizzle', 'typeorm', 'sequelize', 'mongoose', 'sql', 'postgres'],
    projects: [
      { owner: 'prisma', repo: 'prisma', name: 'PRISMA', tagline: 'Type-safe database access with a great DX.', badge: 'TYPE-SAFE' },
      { owner: 'drizzle-team', repo: 'drizzle-orm', name: 'DRIZZLE', tagline: 'Lightweight, SQL-like, zero overhead ORM.', badge: 'FASTEST GROWING' },
      { owner: 'typeorm', repo: 'typeorm', name: 'TYPEORM', tagline: 'Active Record and Data Mapper patterns in TypeScript.', badge: 'ENTERPRISE PATTERN' },
      { owner: 'sequelize', repo: 'sequelize', name: 'SEQUELIZE', tagline: 'The veteran. Multi-dialect, battle-hardened.', badge: 'BATTLE-TESTED' },
      { owner: 'Automattic', repo: 'mongoose', name: 'MONGOOSE', tagline: 'MongoDB ODM. Schema validation out of the box.', badge: 'MONGODB STANDARD' },
    ],
    verdict: {
      bestForTeams: 'prisma',
      bestPerformance: 'drizzle-orm',
      easiestOnboarding: 'mongoose',
    }
  },
  {
    slug: 'ai-sdks',
    title: 'AI SDK LANDSCAPE',
    tagline: 'The fastest moving category in open source. Score carefully.',
    icon: '🤖',
    keywords: ['ai', 'llm', 'openai', 'langchain', 'ai-sdk', 'machine-learning', 'agents', 'rag'],
    projects: [
      { owner: 'vercel', repo: 'ai', name: 'VERCEL AI SDK', tagline: 'Stream-first AI for React and Node. Dead simple.', badge: 'VERCEL BACKED' },
      { owner: 'langchain-ai', repo: 'langchainjs', name: 'LANGCHAIN.JS', tagline: 'The Swiss Army knife of LLM orchestration.', badge: 'MOST STARRED' },
      { owner: 'run-llama', repo: 'LlamaIndexTS', name: 'LLAMAINDEX', tagline: 'RAG-first. Build knowledge bases over your data.', badge: 'RAG SPECIALIST' },
      { owner: 'backstage', repo: 'backstage', name: 'BACKSTAGE', tagline: 'Spotify\'s developer portal. AI tooling hub.', badge: 'SPOTIFY BACKED' },
      { owner: 'mastra-ai', repo: 'mastra', name: 'MASTRA', tagline: 'TypeScript-first agent framework. New but fast.', badge: 'EMERGING' },
    ],
    verdict: {
      bestForTeams: 'ai',
      bestPerformance: 'mastra',
      easiestOnboarding: 'ai',
    }
  },
  {
    slug: 'ai-agent-harnesses',
    title: 'AI AGENT HARNESSES',
    tagline: 'PICK WRONG AND YOUR AGENTS GO ROGUE.',
    icon: '⚙️',
    keywords: ['ai-agent', 'harness', 'yaml', 'coding-automation', 'llm', 'agentic', 'declarative', 'orchestration', 'observability', 'production', 'autonomous', 'coding', 'issue-tracker'],
    projects: [
      { owner: 'coleam00', repo: 'archon', name: 'ARCHON', tagline: 'YAML-DEFINED AI CODING WORKFLOWS', badge: 'HARNESS PIONEER' },
      { owner: 'openharness', repo: 'ohmo', name: 'OPENHARNESS', tagline: 'LIGHTWEIGHT CLI-FIRST HARNESS', badge: 'CLI FIRST', githubFallback: true, earlyBreakout: true, momentumNote: 'CLI-NATIVE AGENT INFRA — WATCH THIS SPACE' },
      { owner: 'mezmo', repo: 'aura', name: 'AURA', tagline: 'DECLARATIVE AGENTIC HARNESS FOR PRODUCTION', badge: 'PRODUCTION READY' },
      { owner: 'openai', repo: 'symphony', name: 'SYMPHONY', tagline: 'TURN LINEAR ISSUES INTO AUTONOMOUS WORKFLOWS', badge: 'OPENAI BACKED', githubFallback: true },
    ],
    verdict: {
      bestForTeams: 'archon',
      bestPerformance: 'symphony',
      easiestOnboarding: 'ohmo',
    }
  },
  {
    slug: 'claude-design-alternatives',
    title: 'CLAUDE DESIGN ALTERNATIVES',
    tagline: 'PROMPT-TO-PRODUCT. YOUR MODEL. YOUR MACHINE.',
    icon: '🎨',
    keywords: ['design', 'ui', 'figma', 'claude', 'claude-design', 'local-first', 'ai-design', 'open-source', 'model-agnostic', 'desktop', 'multi-provider', 'ollama', 'openai', 'design-tool', 'clone', 'community', 'fig-files'],
    projects: [
      { owner: 'nicholasgasior', repo: 'open-design', name: 'OPEN DESIGN', tagline: 'LOCAL-FIRST CLAUDE DESIGN CLONE. ANY MODEL.', badge: 'APACHE 2.0', earlyBreakout: true, momentumNote: 'GOING VIRAL — COMMUNITY BUILT IN DAYS' },
      { owner: 'opencodesign', repo: 'open-codesign', name: 'OPEN CODESIGN', tagline: 'DESKTOP APP. MULTI-PROVIDER. LOCAL HISTORY.', badge: 'MIT LICENSE', earlyBreakout: true, momentumNote: 'DESKTOP-FIRST, MULTI-MODEL, GROWING FAST' },
      { owner: 'anthropics-community', repo: 'open-claude-design', name: 'OPEN CLAUDE DESIGN', tagline: 'COMMUNITY CLONE OF CLAUDE DESIGN BEHAVIOR', badge: 'COMMUNITY', githubFallback: true },
      { owner: 'openpencil-ai', repo: 'openpencil', name: 'OPENPENCIL', tagline: 'AI-NATIVE EDITOR. OPENS FIGMA FILES.', badge: 'FIGMA COMPATIBLE' },
    ],
    verdict: {
      bestForTeams: 'open-codesign',
      bestPerformance: 'openpencil',
      easiestOnboarding: 'open-design',
    }
  },
  {
    slug: 'skills-agents',
    title: 'SKILLS & AGENTS',
    tagline: 'Reusable capabilities and autonomous workers for AI-native workflows.',
    icon: '🧠',
    keywords: ['ai-agent', 'agents', 'skills', 'autonomous', 'workflow', 'automation', 'coding-assistant', 'orchestration', 'multi-agent', 'langgraph', 'crewai', 'autogen'],
    projects: [
      { 
        owner: 'opendevin', 
        repo: 'OpenHands', 
        name: 'OpenHands', 
        tagline: 'Autonomous software engineering agent.', 
        badge: 'CODING AGENT' 
      },
      { 
        owner: 'crewAIInc', 
        repo: 'crewAI', 
        name: 'crewAI', 
        tagline: 'Multi-agent orchestration framework.', 
        badge: 'MULTI-AGENT' 
      },
      { 
        owner: 'microsoft', 
        repo: 'autogen', 
        name: 'AutoGen', 
        tagline: 'Multi-agent conversation framework.', 
        badge: 'MULTI-AGENT' 
      },
      { 
        owner: 'langchain-ai', 
        repo: 'langgraph', 
        name: 'LangGraph', 
        tagline: 'Controllable agent workflows.', 
        badge: 'WORKFLOW AGENT' 
      },
      { 
        owner: 'princeton-nlp', 
        repo: 'SWE-agent', 
        name: 'SWE-agent', 
        tagline: 'Software engineering agent.', 
        badge: 'CODING AGENT' 
      },
      { 
        owner: 'continuedev', 
        repo: 'continue', 
        name: 'Continue', 
        tagline: 'Open-source coding assistant.', 
        badge: 'DEV ASSISTANT' 
      },
      { 
        owner: 'paul-gauthier', 
        repo: 'aider', 
        name: 'Aider', 
        tagline: 'Terminal-based AI pair programmer.', 
        badge: 'DEV ASSISTANT' 
      },
      { 
        owner: 'geekan', 
        repo: 'MetaGPT', 
        name: 'MetaGPT', 
        tagline: 'Multi-agent meta-programming framework.', 
        badge: 'MULTI-AGENT' 
      },
      { 
        owner: 'SuperAGI', 
        repo: 'SuperAGI', 
        name: 'SuperAGI', 
        tagline: 'Autonomous AI agent framework.', 
        badge: 'AUTONOMOUS AGENT' 
      },
      { 
        owner: 'Pythagora-io', 
        repo: 'gpt-pilot', 
        name: 'GPT Pilot', 
        tagline: 'Autonomous coding agent.', 
        badge: 'CODING AGENT' 
      },
    ],
    verdict: {
      bestForTeams: 'OpenHands',
      bestPerformance: 'LangGraph',
      easiestOnboarding: 'crewAI',
    }
  },
];

// Lookup function — pure logic, no AI
export function findCategoryForRepo(owner: string, repo: string, topics: string[] = []): Category | null {
  // Step 1: exact match
  const exact = CATEGORIES.find(c =>
    c.projects.some(p => p.owner.toLowerCase() === owner.toLowerCase() && p.repo.toLowerCase() === repo.toLowerCase())
  );
  if (exact) return exact;
  // Step 2: topic keyword intersection
  const byTopic = CATEGORIES.find(c =>
    c.keywords.some(k => topics.map(t => t.toLowerCase()).includes(k.toLowerCase()))
  );
  return byTopic || null;
}

export function getSimilarProjects(owner: string, repo: string, topics: string[] = []): { category: Category; others: CategoryProject[] } | null {
  const category = findCategoryForRepo(owner, repo, topics);
  if (!category) return null;
  const others = category.projects.filter(p => !(p.owner.toLowerCase() === owner.toLowerCase() && p.repo.toLowerCase() === repo.toLowerCase()));
  return { category, others };
}
