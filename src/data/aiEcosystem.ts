// AI ecosystem leaderboard — curated, hand-picked list of AI projects across
// agents, LLM frameworks, vector DBs, inference, ML platforms, embeddings,
// RAG, and training.
//
// Scores and verdicts are deliberately NOT baked in here. The leaderboard
// page fetches them live from /api/analyze on mount so the displayed numbers
// always match what the algorithm currently says. See src/pages/AiLeaderboard.tsx
// for the throttled fetch logic.
//
// Curation rules:
//   - High-signal, broadly-used projects only — no obscure forks.
//   - Each entry must have a clear tagline that fits in a card.
//   - Categories are constrained; new categories require a UI update too.

export type AiCategory =
  | 'agents'
  | 'llm-frameworks'
  | 'vector-db'
  | 'inference'
  | 'ml-platform'
  | 'embeddings'
  | 'rag'
  | 'training';

export type AiEcosystemEntry = {
  owner: string;
  repo: string;
  category: AiCategory;
  tagline: string;
};

export const AI_CATEGORY_LABELS: Record<AiCategory, string> = {
  'agents': 'AGENTS',
  'llm-frameworks': 'LLM FRAMEWORKS',
  'vector-db': 'VECTOR DB',
  'inference': 'INFERENCE',
  'ml-platform': 'ML PLATFORM',
  'embeddings': 'EMBEDDINGS',
  'rag': 'RAG',
  'training': 'TRAINING',
};

export const AI_ECOSYSTEM: AiEcosystemEntry[] = [
  // Agents
  { owner: 'paul-gauthier', repo: 'aider', category: 'agents', tagline: 'Terminal-based AI pair programmer.' },
  { owner: 'All-Hands-AI', repo: 'OpenHands', category: 'agents', tagline: 'Autonomous software engineering agent.' },
  { owner: 'langchain-ai', repo: 'langgraph', category: 'agents', tagline: 'Controllable, stateful agent workflows.' },
  { owner: 'microsoft', repo: 'autogen', category: 'agents', tagline: 'Multi-agent conversation framework.' },
  { owner: 'BerriAI', repo: 'litellm', category: 'agents', tagline: 'Unified gateway across 100+ LLM providers.' },
  { owner: 'langfuse', repo: 'langfuse', category: 'agents', tagline: 'Open observability for LLM apps and agents.' },
  { owner: 'langchain-ai', repo: 'langchain', category: 'agents', tagline: 'LLM app orchestration framework.' },
  { owner: 'crewAIInc', repo: 'crewAI', category: 'agents', tagline: 'Multi-agent orchestration framework.' },

  // LLM frameworks / SDKs
  { owner: 'huggingface', repo: 'transformers', category: 'llm-frameworks', tagline: 'State-of-the-art ML models.' },
  { owner: 'huggingface', repo: 'transformers.js', category: 'llm-frameworks', tagline: 'Run Transformers in the browser.' },
  { owner: 'vercel', repo: 'ai', category: 'llm-frameworks', tagline: 'AI SDK for TypeScript and React.' },
  { owner: 'anthropics', repo: 'anthropic-sdk-typescript', category: 'llm-frameworks', tagline: 'Official Anthropic SDK for TypeScript.' },
  { owner: 'openai', repo: 'openai-node', category: 'llm-frameworks', tagline: 'Official OpenAI Node SDK.' },

  // Vector DB
  { owner: 'chroma-core', repo: 'chroma', category: 'vector-db', tagline: 'Open-source embedding database.' },
  { owner: 'qdrant', repo: 'qdrant', category: 'vector-db', tagline: 'High-performance Rust vector database.' },
  { owner: 'weaviate', repo: 'weaviate', category: 'vector-db', tagline: 'Cloud-native vector search engine.' },
  { owner: 'milvus-io', repo: 'milvus', category: 'vector-db', tagline: 'Scalable open vector database.' },

  // Inference
  { owner: 'ggml-org', repo: 'llama.cpp', category: 'inference', tagline: 'Local LLM inference in pure C/C++.' },
  { owner: 'ollama', repo: 'ollama', category: 'inference', tagline: 'Run open models locally with one command.' },
  { owner: 'vllm-project', repo: 'vllm', category: 'inference', tagline: 'High-throughput LLM serving engine.' },
  { owner: 'oobabooga', repo: 'text-generation-webui', category: 'inference', tagline: 'Web UI for running local language models.' },

  // ML platform
  { owner: 'ray-project', repo: 'ray', category: 'ml-platform', tagline: 'Distributed compute for ML workloads.' },
  { owner: 'mlflow', repo: 'mlflow', category: 'ml-platform', tagline: 'ML lifecycle and experiment tracking.' },
  { owner: 'wandb', repo: 'wandb', category: 'ml-platform', tagline: 'Experiment tracking and model registry.' },

  // Embeddings
  { owner: 'UKPLab', repo: 'sentence-transformers', category: 'embeddings', tagline: 'Sentence and text embeddings in Python.' },
  { owner: 'qdrant', repo: 'fastembed', category: 'embeddings', tagline: 'Lightweight, fast embedding generation.' },

  // RAG
  { owner: 'run-llama', repo: 'llama_index', category: 'rag', tagline: 'RAG-first data framework for LLMs.' },
  { owner: 'weaviate', repo: 'Verba', category: 'rag', tagline: 'Open RAG application with Weaviate.' },
];
