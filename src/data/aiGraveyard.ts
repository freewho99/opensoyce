// AI Graveyard Watch — curated list of AI / ML projects showing visible
// signs of abandonment that nevertheless still appear in modern lockfiles,
// tutorials, or transitive dependency trees.
//
// Inclusion criteria (each entry should satisfy at least two):
//   1. 1+ year since last commit, OR archived flag, OR explicit deprecation
//      notice from maintainers.
//   2. Still has nonzero install signals — high historical stars, transitive
//      deps in modern lockfiles, recurring mentions in tutorials.
//   3. A maintained replacement exists (so users have somewhere to go).
//
// The "lastCommitClaim" field is the curator's note about why this is on
// the list — the actual lastCommit shown to users is fetched live from
// /api/analyze and may differ if a project has been revived. The page
// reconciles both: if /api/analyze shows recent activity, the card still
// renders with the live date so we don't lie to readers.

import type { AiCategory } from './aiEcosystem';

export type AiGraveyardEntry = {
  owner: string;
  repo: string;
  category: AiCategory;
  tagline: string;
  /**
   * Curator's claim about why this is on the graveyard — a short, honest
   * note. Shown as the secondary line under the live last-commit date.
   * Examples: "Renamed to transformers in 2019", "Archived 2023",
   * "Superseded by langgraph".
   */
  lastCommitClaim: string;
};

export const AI_GRAVEYARD: AiGraveyardEntry[] = [
  {
    owner: 'huggingface',
    repo: 'pytorch-transformers',
    category: 'llm-frameworks',
    tagline: 'The original Transformers package, pre-rename.',
    lastCommitClaim: 'Renamed to huggingface/transformers in 2019 — old name still pip-installed in legacy tutorials.',
  },
  {
    owner: 'huggingface',
    repo: 'pytorch-pretrained-BERT',
    category: 'llm-frameworks',
    tagline: 'Pre-Transformers-era BERT loader.',
    lastCommitClaim: 'Superseded by transformers in 2018 — still surfaces in academic notebooks and old Colabs.',
  },
  {
    owner: 'hwchase17',
    repo: 'langchain-hub',
    category: 'agents',
    tagline: 'Original LangChain prompt sharing repo.',
    lastCommitClaim: 'Replaced by LangChain Hub on smith.langchain.com — repo dormant but still linked in tutorials.',
  },
  {
    owner: 'openai',
    repo: 'gpt-2',
    category: 'training',
    tagline: 'The original GPT-2 release.',
    lastCommitClaim: 'Frozen as a historical artifact — still cloned for educational projects despite being obsolete.',
  },
  {
    owner: 'openai',
    repo: 'gpt-3',
    category: 'llm-frameworks',
    tagline: 'GPT-3 paper repo (no model code).',
    lastCommitClaim: 'Paper-only repo, never received the model — still starred and forked as if it had source.',
  },
  {
    owner: 'EleutherAI',
    repo: 'gpt-neo',
    category: 'training',
    tagline: 'Pre-Pythia EleutherAI model code.',
    lastCommitClaim: 'Superseded by gpt-neox and pythia — old training scripts still copied into derivative projects.',
  },
  {
    owner: 'tatsu-lab',
    repo: 'stanford_alpaca',
    category: 'training',
    tagline: 'The original Alpaca fine-tuning recipe.',
    lastCommitClaim: 'Research artifact from early 2023 — recipe still pasted into fine-tuning blog posts.',
  },
  {
    owner: 'tloen',
    repo: 'alpaca-lora',
    category: 'training',
    tagline: 'LoRA fine-tuning recipe for LLaMA.',
    lastCommitClaim: 'Effectively unmaintained since LLaMA 2 launch — PEFT replaces it but tutorials still link here.',
  },
  {
    owner: 'AntonOsika',
    repo: 'gpt-engineer',
    category: 'agents',
    tagline: 'Early autonomous coding agent.',
    lastCommitClaim: 'Maintenance slowed dramatically as the category moved to aider / OpenHands / Cursor.',
  },
  {
    owner: 'Significant-Gravitas',
    repo: 'Auto-GPT',
    category: 'agents',
    tagline: 'The viral 2023 autonomous agent.',
    lastCommitClaim: 'Rebranded to AutoGPT Platform; the original v0 loop is no longer the maintained surface.',
  },
  {
    owner: 'yoheinakajima',
    repo: 'babyagi',
    category: 'agents',
    tagline: 'Minimal task-driven autonomous agent.',
    lastCommitClaim: 'Pinned-in-time demo from early 2023 — still forked as an agent-loop tutorial template.',
  },
  {
    owner: 'TransformerOptimus',
    repo: 'SuperAGI',
    category: 'agents',
    tagline: 'Autonomous AI agent framework.',
    lastCommitClaim: 'Activity dropped sharply through 2024 while the company pivoted; framework still listed in agent surveys.',
  },
];
