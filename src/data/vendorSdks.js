/**
 * Vendor-SDK allowlist for the maintainer-concentration band-cap.
 *
 * Background: AI signals v0.1 introduces a band-cap that downgrades USE READY
 * to FORKABLE when a repo shows clear single-maintainer drift (top-1 commit
 * share > 85% AND <= 2 non-bot contributors AND > 30 days since last commit).
 * That heuristic over-fires on vendor-official SDKs: openai-node is maintained
 * by a small OpenAI team and occasionally goes 30+ days between commits, but
 * "the OpenAI Node SDK" is a fundamentally different bus-factor story than
 * "a hobby project with one author."
 *
 * This curated allowlist suppresses the cap entirely for those repos. The
 * composite score is unchanged either way; only the band-cap path checks this.
 *
 * Single source of truth — the TypeScript shim at vendorSdks.ts re-exports
 * from here so the React UI and the JS scanner pipeline (runScan.js, the
 * Vercel functions, and the CLI) all read the same list.
 *
 * @typedef {Object} VendorSdkEntry
 * @property {string} owner
 * @property {string} repo
 * @property {string} vendor
 * @property {string} reason
 */

/** @type {VendorSdkEntry[]} */
export const VENDOR_SDKS = [
  // AI / LLM vendor SDKs
  { owner: 'openai', repo: 'openai-node', vendor: 'OpenAI', reason: 'Official OpenAI Node SDK' },
  { owner: 'openai', repo: 'openai-python', vendor: 'OpenAI', reason: 'Official OpenAI Python SDK' },
  { owner: 'openai', repo: 'openai-go', vendor: 'OpenAI', reason: 'Official OpenAI Go SDK' },
  { owner: 'anthropics', repo: 'anthropic-sdk-typescript', vendor: 'Anthropic', reason: 'Official Anthropic TypeScript SDK' },
  { owner: 'anthropics', repo: 'anthropic-sdk-python', vendor: 'Anthropic', reason: 'Official Anthropic Python SDK' },
  { owner: 'anthropics', repo: 'anthropic-sdk-go', vendor: 'Anthropic', reason: 'Official Anthropic Go SDK' },
  { owner: 'google', repo: 'generative-ai-js', vendor: 'Google', reason: 'Official Google Generative AI JS SDK' },
  { owner: 'google', repo: 'generative-ai-python', vendor: 'Google', reason: 'Official Google Generative AI Python SDK' },
  { owner: 'mistralai', repo: 'client-js', vendor: 'Mistral', reason: 'Official Mistral JS client' },
  { owner: 'mistralai', repo: 'client-python', vendor: 'Mistral', reason: 'Official Mistral Python client' },
  { owner: 'cohere-ai', repo: 'cohere-typescript', vendor: 'Cohere', reason: 'Official Cohere TypeScript SDK' },
  { owner: 'cohere-ai', repo: 'cohere-python', vendor: 'Cohere', reason: 'Official Cohere Python SDK' },

  // Vector DB SDKs
  { owner: 'pinecone-io', repo: 'pinecone-ts-client', vendor: 'Pinecone', reason: 'Official Pinecone TS client' },
  { owner: 'pinecone-io', repo: 'pinecone-python-client', vendor: 'Pinecone', reason: 'Official Pinecone Python client' },
  { owner: 'qdrant', repo: 'qdrant-client', vendor: 'Qdrant', reason: 'Official Qdrant Python client' },
  { owner: 'qdrant', repo: 'qdrant-js', vendor: 'Qdrant', reason: 'Official Qdrant JS client' },
  { owner: 'weaviate', repo: 'weaviate-python-client', vendor: 'Weaviate', reason: 'Official Weaviate Python client' },
  { owner: 'weaviate', repo: 'typescript-client', vendor: 'Weaviate', reason: 'Official Weaviate TypeScript client' },

  // Cloud / infra
  { owner: 'vercel', repo: 'ai', vendor: 'Vercel', reason: 'Official Vercel AI SDK' },
  { owner: 'vercel', repo: 'vercel', vendor: 'Vercel', reason: 'Official Vercel CLI' },
  { owner: 'aws', repo: 'aws-sdk-js-v3', vendor: 'AWS', reason: 'Official AWS SDK for JavaScript v3' },
  { owner: 'aws', repo: 'aws-sdk-go-v2', vendor: 'AWS', reason: 'Official AWS SDK for Go v2' },

  // Payment / classic vendor
  { owner: 'stripe', repo: 'stripe-node', vendor: 'Stripe', reason: 'Official Stripe Node SDK' },
  { owner: 'stripe', repo: 'stripe-python', vendor: 'Stripe', reason: 'Official Stripe Python SDK' },

  // Auth
  { owner: 'auth0', repo: 'node-auth0', vendor: 'Auth0', reason: 'Official Auth0 Node SDK' },

  // GitHub
  { owner: 'octokit', repo: 'octokit.js', vendor: 'GitHub', reason: 'Official GitHub SDK for JavaScript' },
];

/**
 * Case-insensitive owner+repo allowlist check.
 * @param {string} owner
 * @param {string} repo
 * @returns {boolean}
 */
export function isVendorSdk(owner, repo) {
  if (typeof owner !== 'string' || typeof repo !== 'string') return false;
  const o = owner.toLowerCase();
  const r = repo.toLowerCase();
  return VENDOR_SDKS.some(s => s.owner.toLowerCase() === o && s.repo.toLowerCase() === r);
}

/**
 * Returns the vendor-SDK entry (with `vendor` + `reason`) or null.
 * @param {string} owner
 * @param {string} repo
 * @returns {VendorSdkEntry | null}
 */
export function getVendorSdk(owner, repo) {
  if (typeof owner !== 'string' || typeof repo !== 'string') return null;
  const o = owner.toLowerCase();
  const r = repo.toLowerCase();
  return VENDOR_SDKS.find(s => s.owner.toLowerCase() === o && s.repo.toLowerCase() === r) || null;
}
