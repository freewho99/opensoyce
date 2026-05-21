/**
 * Cross-ecosystem bridges v0 — curated, bidirectional npm ↔ PyPI map.
 *
 * Elena's swarm finding: when an npm package transitively pulls in a Python
 * package via Python bindings (or vice-versa), a single-ecosystem scan misses
 * the OTHER half entirely. A PyPI dependency-confusion squat against
 * `langchain` is invisible to a user who only scans their npm
 * `package-lock.json` — even though the npm `langchain` package transitively
 * installs the Python one in many real deployments.
 *
 * v0 ships the **curated-map approach**: hand-maintained list of well-known
 * sibling packages. When a scanned package name matches an entry, the
 * inventory / vuln / selected-health rows get a `⚠ CROSS-ECOSYSTEM BRIDGE`
 * chip pointing at the sibling in the other ecosystem.
 *
 *   - Bidirectional: querying either side yields the same entry. npm
 *     `langchain` shows the chip pointing at PyPI `langchain`, AND PyPI
 *     `langchain` shows the chip pointing at npm `langchain`.
 *   - Informational only: NO score change, NO Risk Profile contribution, NO
 *     band-cap. The chip is the equivalent of "hey, did you scan the other
 *     side too?" — not a security-severity warning.
 *   - Asymmetric names handled explicitly: npm `@anthropic-ai/sdk` ↔ PyPI
 *     `anthropic`. The lookup never assumes the strings are equal across
 *     ecosystems; it always reads the table.
 *   - Case handling: npm package names canonicalize to lowercase, PyPI also
 *     lowercases on its end. Lookup is case-insensitive on input; the table
 *     stores the canonical mixed-case form (including npm scopes verbatim,
 *     e.g. `@huggingface/transformers`).
 *
 * The deeper algorithmic version (static analysis of `postinstall` scripts
 * for `pip install` invocations, parsing setup.py for npm dispatch, etc.) is
 * deferred to v0.1+.
 *
 * @typedef {'npm' | 'PyPI'} Ecosystem
 *
 * @typedef {Object} CrossEcosystemBridgeEntry
 * @property {string} npm     canonical npm name (with scope if scoped)
 * @property {string} pypi    canonical PyPI name (lowercase)
 * @property {string} reason  short human-readable explanation for the chip tooltip
 *
 * @typedef {Object} CrossEcosystemBridgeMatch
 * @property {string} matched           echo of the caller's input name
 * @property {string} sibling           the OTHER ecosystem's package name
 * @property {Ecosystem} siblingEcosystem  which ecosystem the sibling lives in
 * @property {string} reason            entry.reason — surfaced verbatim in the tooltip
 */

/** @type {CrossEcosystemBridgeEntry[]} */
export const CROSS_ECOSYSTEM_BRIDGES = [
  // ---------------------------------------------------------------------
  // AI / LLM framework parallel implementations
  // ---------------------------------------------------------------------
  {
    npm: 'langchain',
    pypi: 'langchain',
    reason: 'Parallel JS + Python implementations of the LangChain framework',
  },
  {
    npm: '@langchain/core',
    pypi: 'langchain-core',
    reason: 'LangChain core: parallel JS + Python packages',
  },
  {
    npm: '@langchain/community',
    pypi: 'langchain-community',
    reason: 'LangChain community integrations: parallel JS + Python packages',
  },
  {
    npm: '@langchain/openai',
    pypi: 'langchain-openai',
    reason: 'LangChain OpenAI integration: parallel JS + Python packages',
  },
  {
    npm: '@langchain/anthropic',
    pypi: 'langchain-anthropic',
    reason: 'LangChain Anthropic integration: parallel JS + Python packages',
  },
  {
    npm: '@langchain/google-genai',
    pypi: 'langchain-google-genai',
    reason: 'LangChain Google Gen AI integration: parallel JS + Python packages',
  },
  {
    npm: 'llamaindex',
    pypi: 'llama-index',
    reason: 'LlamaIndex: parallel JS + Python implementations of the indexing framework',
  },
  {
    npm: '@huggingface/transformers',
    pypi: 'transformers',
    reason: 'Hugging Face Transformers: JS port + Python reference implementation',
  },
  {
    npm: '@huggingface/inference',
    pypi: 'huggingface-hub',
    reason: 'Hugging Face Hub client + inference: parallel JS + Python clients',
  },
  {
    npm: '@xenova/transformers',
    pypi: 'transformers',
    reason: 'Predecessor of @huggingface/transformers; same upstream Python reference impl',
  },

  // ---------------------------------------------------------------------
  // LLM provider SDKs — sibling names often differ across ecosystems
  // ---------------------------------------------------------------------
  {
    npm: 'openai',
    pypi: 'openai',
    reason: 'OpenAI SDK: parallel JS + Python clients',
  },
  {
    npm: '@anthropic-ai/sdk',
    pypi: 'anthropic',
    reason: 'Anthropic SDK: parallel JS + Python clients (note the asymmetric name)',
  },
  {
    npm: '@google/genai',
    pypi: 'google-genai',
    reason: 'Google Gen AI SDK: parallel JS + Python clients',
  },
  {
    npm: '@google/generative-ai',
    pypi: 'google-generativeai',
    reason: 'Google Generative AI SDK (legacy): parallel JS + Python clients',
  },
  {
    npm: 'cohere-ai',
    pypi: 'cohere',
    reason: 'Cohere SDK: parallel JS + Python clients',
  },
  {
    npm: '@mistralai/mistralai',
    pypi: 'mistralai',
    reason: 'Mistral AI SDK: parallel JS + Python clients',
  },
  {
    npm: 'groq-sdk',
    pypi: 'groq',
    reason: 'Groq SDK: parallel JS + Python clients',
  },
  {
    npm: 'replicate',
    pypi: 'replicate',
    reason: 'Replicate SDK: parallel JS + Python clients',
  },
  {
    npm: '@ai-sdk/openai',
    pypi: 'openai',
    reason: 'Vercel AI SDK OpenAI provider wraps the OpenAI SDK; Python parity via the openai client',
  },
  {
    npm: 'litellm',
    pypi: 'litellm',
    reason: 'LiteLLM: parallel JS + Python multi-provider gateway',
  },
  {
    npm: '@instructor-ai/instructor',
    pypi: 'instructor',
    reason: 'Instructor: parallel JS + Python structured-output libraries',
  },

  // ---------------------------------------------------------------------
  // Vector databases / retrieval clients
  // ---------------------------------------------------------------------
  {
    npm: '@pinecone-database/pinecone',
    pypi: 'pinecone-client',
    reason: 'Pinecone vector DB: parallel JS + Python clients',
  },
  {
    npm: '@qdrant/js-client-rest',
    pypi: 'qdrant-client',
    reason: 'Qdrant vector DB: parallel JS + Python clients',
  },
  {
    npm: 'weaviate-ts-client',
    pypi: 'weaviate-client',
    reason: 'Weaviate vector DB: parallel JS + Python clients',
  },
  {
    npm: 'chromadb',
    pypi: 'chromadb',
    reason: 'Chroma vector DB: parallel JS + Python clients',
  },
  {
    npm: '@datastax/astra-db-ts',
    pypi: 'astrapy',
    reason: 'DataStax Astra DB: parallel JS + Python clients (asymmetric names)',
  },
  {
    npm: '@upstash/vector',
    pypi: 'upstash-vector',
    reason: 'Upstash Vector: parallel JS + Python clients',
  },

  // ---------------------------------------------------------------------
  // Observability / eval / tracing for LLM apps
  // ---------------------------------------------------------------------
  {
    npm: 'langfuse',
    pypi: 'langfuse',
    reason: 'Langfuse LLM observability: parallel JS + Python SDKs',
  },
  {
    npm: 'langsmith',
    pypi: 'langsmith',
    reason: 'LangSmith tracing/eval: parallel JS + Python SDKs',
  },
  {
    npm: '@sentry/node',
    pypi: 'sentry-sdk',
    reason: 'Sentry error tracking: parallel JS + Python SDKs (asymmetric names)',
  },
  {
    npm: '@opentelemetry/api',
    pypi: 'opentelemetry-api',
    reason: 'OpenTelemetry: parallel JS + Python implementations',
  },
  {
    npm: 'posthog-node',
    pypi: 'posthog',
    reason: 'PostHog analytics: parallel JS + Python clients',
  },

  // ---------------------------------------------------------------------
  // Tokenization / numerics — often pulled transitively by AI tooling
  // ---------------------------------------------------------------------
  {
    npm: 'tiktoken',
    pypi: 'tiktoken',
    reason: 'tiktoken tokenizer: JS port + Python reference (the JS port wraps the Rust impl)',
  },
  {
    npm: 'js-tiktoken',
    pypi: 'tiktoken',
    reason: 'Pure-JS tiktoken alternative; Python parity via the tiktoken package',
  },
  {
    npm: 'gpt-tokenizer',
    pypi: 'tiktoken',
    reason: 'Alternate JS GPT tokenizer; Python parity via tiktoken',
  },

  // ---------------------------------------------------------------------
  // Agent frameworks / orchestrators
  // ---------------------------------------------------------------------
  {
    npm: '@inkeep/agents-core',
    pypi: 'inkeep',
    reason: 'Inkeep agents: parallel JS + Python packages',
  },
  {
    npm: 'crewai',
    pypi: 'crewai',
    reason: 'CrewAI multi-agent framework: parallel JS + Python implementations',
  },

  // ---------------------------------------------------------------------
  // Cloud / data SDKs (frequently dual-ecosystem)
  // ---------------------------------------------------------------------
  {
    npm: '@aws-sdk/client-s3',
    pypi: 'boto3',
    reason: 'AWS S3 client: AWS SDK for JS v3 ↔ boto3 (the Python AWS SDK)',
  },
  {
    npm: '@aws-sdk/client-dynamodb',
    pypi: 'boto3',
    reason: 'AWS DynamoDB client: AWS SDK for JS v3 ↔ boto3',
  },
  {
    npm: '@google-cloud/storage',
    pypi: 'google-cloud-storage',
    reason: 'Google Cloud Storage: parallel JS + Python clients',
  },
  {
    npm: 'stripe',
    pypi: 'stripe',
    reason: 'Stripe SDK: parallel JS + Python clients',
  },
  {
    npm: 'twilio',
    pypi: 'twilio',
    reason: 'Twilio SDK: parallel JS + Python clients',
  },
  {
    npm: 'redis',
    pypi: 'redis',
    reason: 'Redis client: parallel JS + Python implementations',
  },
];

/**
 * Normalize a package name for lookup keys.
 *
 *   - npm: names are required to be lowercase by the registry; we still
 *     defensively lower-case the caller's input. Scoped names (`@scope/pkg`)
 *     are preserved verbatim aside from case.
 *   - PyPI: PEP 503 normalization replaces runs of `[-_.]` with a single `-`
 *     and lowercases. We apply the same rule on lookup so callers passing
 *     `Langchain_Core` / `langchain.core` / `langchain-core` all resolve.
 *
 * @param {string} name
 * @param {'npm' | 'PyPI'} ecosystem
 * @returns {string|null}
 */
function normalizeName(name, ecosystem) {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (ecosystem === 'npm') return trimmed.toLowerCase();
  if (ecosystem === 'PyPI') {
    // PEP 503 simple normalization. Safe on names that don't need it.
    return trimmed.toLowerCase().replace(/[-_.]+/g, '-');
  }
  return null;
}

/**
 * Pre-computed lookup maps at module load. Two maps so an npm-side query
 * never matches a PyPI-side name and vice-versa: querying `transformers` as
 * npm must return null (no such npm entry), but querying `transformers` as
 * PyPI must return the entry pointing at @huggingface/transformers (npm).
 *
 * @type {Map<string, CrossEcosystemBridgeEntry>}
 */
const NPM_KEY_TO_ENTRY = new Map();
/** @type {Map<string, CrossEcosystemBridgeEntry>} */
const PYPI_KEY_TO_ENTRY = new Map();

(function buildIndexes() {
  for (const entry of CROSS_ECOSYSTEM_BRIDGES) {
    if (!entry || typeof entry !== 'object') continue;
    if (typeof entry.npm === 'string' && entry.npm) {
      const k = normalizeName(entry.npm, 'npm');
      // First-seen wins on accidental duplicates — same rule as the
      // protected-name skeleton map.
      if (k && !NPM_KEY_TO_ENTRY.has(k)) NPM_KEY_TO_ENTRY.set(k, entry);
    }
    if (typeof entry.pypi === 'string' && entry.pypi) {
      const k = normalizeName(entry.pypi, 'PyPI');
      if (k && !PYPI_KEY_TO_ENTRY.has(k)) PYPI_KEY_TO_ENTRY.set(k, entry);
    }
  }
})();

/**
 * Look up a bridge entry by either side. Case-insensitive. PyPI lookups also
 * normalize `_` and `.` to `-` (PEP 503). Returns null when no entry exists
 * or when the input is malformed — never throws.
 *
 * The returned `matched` field echoes the caller's input verbatim (with
 * leading/trailing whitespace trimmed) so the UI can render the user's own
 * package name in the chip tooltip without re-canonicalizing.
 *
 * @param {string} name
 * @param {'npm' | 'PyPI'} ecosystem  which ecosystem the input name comes from
 * @returns {CrossEcosystemBridgeMatch | null}
 */
export function getCrossEcosystemBridge(name, ecosystem) {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (ecosystem !== 'npm' && ecosystem !== 'PyPI') return null;
  const key = normalizeName(trimmed, ecosystem);
  if (!key) return null;
  const entry = ecosystem === 'npm'
    ? NPM_KEY_TO_ENTRY.get(key)
    : PYPI_KEY_TO_ENTRY.get(key);
  if (!entry) return null;
  const siblingEcosystem = ecosystem === 'npm' ? 'PyPI' : 'npm';
  const sibling = ecosystem === 'npm' ? entry.pypi : entry.npm;
  return {
    matched: trimmed,
    sibling,
    siblingEcosystem,
    reason: entry.reason,
  };
}

/**
 * Boolean shortcut for tests + diagnostics. Same semantics as
 * getCrossEcosystemBridge() but returns true/false.
 *
 * @param {string} name
 * @param {'npm' | 'PyPI'} ecosystem
 * @returns {boolean}
 */
export function hasCrossEcosystemBridge(name, ecosystem) {
  return getCrossEcosystemBridge(name, ecosystem) !== null;
}

export const __internal = { NPM_KEY_TO_ENTRY, PYPI_KEY_TO_ENTRY, normalizeName };
