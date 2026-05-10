import { Project, Recipe } from './types';

export const MOCK_PROJECTS: Project[] = [
  {
    id: '1',
    name: 'betaSwarm',
    owner: 'betaswarm-labs',
    description: 'A multi-agent swarm intelligence framework for autonomous task execution.',
    stars: 12400,
    forks: 850,
    lastScanned: 'Today',
    status: 'Verified',
    category: 'Agentic AI',
    scoreTrend: 'up',
    score: {
      overall: 8.5,
      maintenance: 82,
      security: 91,
      community: 64,
      documentation: 73
    },
    techStack: ['Python', 'LangChain', 'Redis', 'Docker'],
    license: 'MIT'
  },
  {
    id: '2',
    name: 'GhostGuard',
    owner: 'cyber-shield',
    description: 'Real-time supply chain security scanner for Node.js dependencies.',
    stars: 8900,
    forks: 320,
    lastScanned: '15 days ago',
    status: 'Unverified',
    category: 'Security',
    scoreTrend: 'down',
    score: {
      overall: 7.2,
      maintenance: 65,
      security: 98,
      community: 42,
      documentation: 88
    },
    techStack: ['TypeScript', 'Rust', 'Wasm'],
    license: 'Apache-2.0'
  },
  {
    id: '3',
    name: 'SovereignDB',
    owner: 'privacy-tech',
    description: 'Local-first, encrypted database for peer-to-peer data sovereignty.',
    stars: 15600,
    forks: 1200,
    lastScanned: '45 days ago',
    status: 'Verified',
    category: 'Data Sovereignty',
    scoreTrend: 'flat',
    score: {
      overall: 9.1,
      maintenance: 94,
      security: 89,
      community: 82,
      documentation: 95
    },
    techStack: ['C++', 'SQLite', 'Libp2p'],
    license: 'GPL-3.0'
  }
];

export const MOCK_RECIPES: Recipe[] = [
  {
    id: 'r1',
    title: 'Autonomous Code Reviewer',
    description: 'A system that automatically reviews PRs using a swarm of agents.',
    ingredients: ['betaSwarm', 'GitHub API', 'OpenAI', 'Supabase'],
    outcome: 'Structured architectural feedback on every commit.'
  }
];
