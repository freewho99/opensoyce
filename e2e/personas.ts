/**
 * OpenSoyce AI Swarm Personas
 *
 * 12 synthetic users representing realistic OpenSoyce visitors:
 * maintainers, job seekers, CTOs, indie devs, open source enthusiasts, etc.
 */

export interface OpenSoycePersona {
  id: string;
  name: string;
  role: string;
  archetype:
    | 'oss-maintainer'
    | 'github-power-user'
    | 'hiring-manager'
    | 'indie-dev'
    | 'cto'
    | 'student'
    | 'security-engineer'
    | 'devrel';
  techLevel: 'low' | 'medium' | 'high' | 'expert';
  goal: string; // Why they came to OpenSoyce
  reposToLookup: string[]; // owner/repo they'd realistically search
  personality: {
    patience: number;       // 1-10
    criticalness: number;   // 1-10
    curiosity: number;      // 1-10
  };
  behaviorNotes: string;
}

export const PERSONAS: OpenSoycePersona[] = [
  {
    id: 'oss-maya',
    name: 'Maya Chen',
    role: 'Open Source Maintainer',
    archetype: 'oss-maintainer',
    techLevel: 'expert',
    goal: 'Check her own repo health score before adding a README badge',
    reposToLookup: ['facebook/react', 'vercel/next.js'],
    personality: { patience: 8, criticalness: 9, curiosity: 10 },
    behaviorNotes: 'Looks at every pillar score detail. Will try edge cases.',
  },
  {
    id: 'github-dan',
    name: 'Dan Abramov',
    role: 'GitHub Power User',
    archetype: 'github-power-user',
    techLevel: 'expert',
    goal: 'Evaluate a library before adding it as a dependency',
    reposToLookup: ['sindresorhus/got', 'axios/axios'],
    personality: { patience: 7, criticalness: 8, curiosity: 9 },
    behaviorNotes: 'Focuses on maintenance and security scores. Reads the pillar breakdown carefully.',
  },
  {
    id: 'cto-sarah',
    name: 'Sarah Mitchell',
    role: 'CTO at Startup',
    archetype: 'cto',
    techLevel: 'high',
    goal: 'Audit open source tools the team uses in production',
    reposToLookup: ['expressjs/express', 'lodash/lodash'],
    personality: { patience: 5, criticalness: 10, curiosity: 7 },
    behaviorNotes: 'Time-pressured. Wants quick verdict. Will bail if score takes too long to load.',
  },
  {
    id: 'indie-carlos',
    name: 'Carlos Ruiz',
    role: 'Indie Developer',
    archetype: 'indie-dev',
    techLevel: 'medium',
    goal: 'Randomly exploring, landed from a tweet about open source health',
    reposToLookup: ['vitejs/vite', 'tailwindlabs/tailwindcss'],
    personality: { patience: 6, criticalness: 5, curiosity: 8 },
    behaviorNotes: 'Explores the UI casually. Might try a repo they are building on.',
  },
  {
    id: 'student-priya',
    name: 'Priya Nair',
    role: 'CS Student',
    archetype: 'student',
    techLevel: 'low',
    goal: 'Researching OSS health for a university paper',
    reposToLookup: ['torvalds/linux', 'microsoft/vscode'],
    personality: { patience: 9, criticalness: 4, curiosity: 10 },
    behaviorNotes: 'Reads everything carefully. May not know what some scores mean.',
  },
  {
    id: 'security-james',
    name: 'James Hollis',
    role: 'Security Engineer',
    archetype: 'security-engineer',
    techLevel: 'expert',
    goal: 'Check if a vendor dependency has an active security posture',
    reposToLookup: ['nodejs/node', 'openssl/openssl'],
    personality: { patience: 6, criticalness: 10, curiosity: 7 },
    behaviorNotes: 'Zooms in on Security pillar. Skeptical of the scoring algorithm.',
  },
  {
    id: 'devrel-anna',
    name: 'Anna Petrov',
    role: 'Developer Relations Engineer',
    archetype: 'devrel',
    techLevel: 'high',
    goal: 'Checking community health of repos she promotes in her newsletters',
    reposToLookup: ['supabase/supabase', 'prettier/prettier'],
    personality: { patience: 8, criticalness: 7, curiosity: 10 },
    behaviorNotes: 'Cares deeply about community and docs scores. Will share the badge if impressed.',
  },
  {
    id: 'hiring-tom',
    name: 'Tom Bennett',
    role: 'Engineering Manager',
    archetype: 'hiring-manager',
    techLevel: 'medium',
    goal: 'Evaluating candidate portfolio repos before an interview',
    reposToLookup: ['tiangolo/fastapi', 'remix-run/remix'],
    personality: { patience: 7, criticalness: 6, curiosity: 6 },
    behaviorNotes: 'Wants a fast, clean "is this good?" signal. Not deeply technical.',
  },
  {
    id: 'power-kenji',
    name: 'Kenji Watanabe',
    role: 'Senior Staff Engineer',
    archetype: 'github-power-user',
    techLevel: 'expert',
    goal: 'Batch-checking several OSS tools before a big architecture decision',
    reposToLookup: ['kubernetes/kubernetes', 'hashicorp/terraform'],
    personality: { patience: 4, criticalness: 9, curiosity: 8 },
    behaviorNotes: 'Fast-moving. Will run multiple lookups. Frustrated by slow API or missing data.',
  },
  {
    id: 'oss-leila',
    name: 'Leila Hassan',
    role: 'OSS Enthusiast & Blogger',
    archetype: 'devrel',
    techLevel: 'high',
    goal: 'Writing an article about OSS health metrics, using OpenSoyce as a tool demo',
    reposToLookup: ['facebook/react', 'angular/angular'],
    personality: { patience: 9, criticalness: 6, curiosity: 10 },
    behaviorNotes: 'Takes in the full experience. Cares about visual design and UX.',
  },
  {
    id: 'student-felix',
    name: 'Felix Braun',
    role: 'Bootcamp Grad',
    archetype: 'student',
    techLevel: 'low',
    goal: 'Checking the repo of a library he just learned',
    reposToLookup: ['jquery/jquery', 'chartjs/Chart.js'],
    personality: { patience: 8, criticalness: 3, curiosity: 9 },
    behaviorNotes: 'Will look up something familiar. Delighted by nice UI, confused by jargon.',
  },
  {
    id: 'cto-grace',
    name: 'Grace Okafor',
    role: 'Founding Engineer',
    archetype: 'cto',
    techLevel: 'expert',
    goal: 'Vetting dependencies for a new SaaS product',
    reposToLookup: ['prisma/prisma', 'trpc/trpc'],
    personality: { patience: 6, criticalness: 9, curiosity: 8 },
    behaviorNotes: 'Runs 2-3 lookups in a row. Cares about maintenance + activity scores heavily.',
  },
];

export function getRandomPersonas(count: number): OpenSoycePersona[] {
  return [...PERSONAS].sort(() => Math.random() - 0.5).slice(0, count);
}
