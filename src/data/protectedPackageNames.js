/**
 * Typo-squat homoglyph detection v0 — curated protected-name list.
 *
 * High-value npm package names worth protecting from homoglyph typo-squat
 * attacks. The scanner reduces every scanned package name AND every name in
 * this list to its Unicode-TR39 confusables skeleton (`src/data/unicode
 * Confusables.js`); a skeleton collision between a scanned name and a
 * protected name — where the actual byte sequences differ — is surfaced as a
 * `⚠ POSSIBLE TYPO-SQUAT` chip on inventory + vuln + selected-health rows.
 *
 * Composition: roughly the top ~50 most-installed npm packages (download
 * counts as of late 2025) plus ~50 AI / ML / security-critical names. Hand-
 * curated, baked in. Not fetched at runtime.
 *
 * Tuning knobs:
 *   - When in doubt about a name, leave it OUT. The chip is informational
 *     only, but every false positive teaches users to ignore the signal.
 *   - Scoped names (`@scope/pkg`) are included verbatim. The skeleton folds
 *     `@` and `/` to themselves, so `@langchain/core` only collides with a
 *     scoped attack name and never with the unscoped `langchain` (the
 *     skeletons differ).
 *
 * Not exhaustive — v0.1 can extend. Crowdsourced PRs welcome.
 */

import { skeleton } from './unicodeConfusables.js';

/** @type {string[]} */
export const PROTECTED_PACKAGE_NAMES = [
  // -------------------------------------------------------------------
  // Top npm installs (general web ecosystem)
  // -------------------------------------------------------------------
  'lodash',
  'react',
  'react-dom',
  'react-router-dom',
  'axios',
  'express',
  'webpack',
  'next',
  'typescript',
  'eslint',
  'prettier',
  'jest',
  'vitest',
  'rollup',
  'esbuild',
  'vite',
  'chalk',
  'commander',
  'yargs',
  'minimist',
  'dotenv',
  'cors',
  'morgan',
  'helmet',
  'mongoose',
  'mongodb',
  'pg',
  'redis',
  'tailwindcss',
  'postcss',
  'autoprefixer',
  'vue',
  'svelte',
  'fastify',
  'koa',
  'hono',
  'underscore',
  'moment',
  'luxon',
  'date-fns',
  'uuid',
  'nanoid',
  'zod',
  'yup',
  'joi',
  'classnames',
  'clsx',
  'lru-cache',
  'semver',
  'glob',
  'fs-extra',
  'rimraf',
  'cross-env',
  'concurrently',
  'nodemon',
  'ts-node',
  'tsx',
  'pnpm',
  'turbo',
  'nx',
  'graphql',
  'apollo-server',
  '@apollo/client',
  'socket.io',
  'socket.io-client',
  'ws',
  'sharp',
  'puppeteer',
  'playwright',
  'cypress',
  '@playwright/test',
  'react-native',
  'expo',
  'electron',

  // -------------------------------------------------------------------
  // AI / ML / agentic ecosystem
  // -------------------------------------------------------------------
  'langchain',
  '@langchain/core',
  '@langchain/openai',
  '@langchain/anthropic',
  '@langchain/community',
  '@langchain/google-genai',
  'openai',
  '@anthropic-ai/sdk',
  '@google/genai',
  '@google/generative-ai',
  '@huggingface/transformers',
  '@huggingface/inference',
  '@xenova/transformers',
  'transformers',
  'litellm',
  '@instructor-ai/instructor',
  'llamaindex',
  '@llamaindex/core',
  '@pinecone-database/pinecone',
  '@qdrant/js-client-rest',
  'weaviate-ts-client',
  'chromadb',
  '@vercel/ai',
  'ai',
  'tiktoken',
  '@dqbd/tiktoken',
  'js-tiktoken',
  '@mistralai/mistralai',
  '@cohere-ai/cohere',
  '@replicate/replicate',
  'groq-sdk',
  '@inkeep/agents-core',

  // -------------------------------------------------------------------
  // Security-critical / cloud SDKs
  // -------------------------------------------------------------------
  'jsonwebtoken',
  'crypto-js',
  'bcrypt',
  'bcryptjs',
  'argon2',
  '@aws-sdk/client-s3',
  '@aws-sdk/client-dynamodb',
  '@aws-sdk/client-secrets-manager',
  '@aws-sdk/client-sts',
  '@google-cloud/storage',
  '@azure/identity',
  '@azure/storage-blob',
  'stripe',
  'twilio',
  '@sentry/node',
  '@sentry/react',
  '@sentry/nextjs',
  'firebase',
  'firebase-admin',
  'jwks-rsa',
  'passport',
  'next-auth',
  '@auth/core',
];

/**
 * Pre-computed at module load time: skeleton -> first-seen original
 * protected name. Skeleton collisions inside the curated list are rare
 * (none expected for the v0 entries) but if one does occur, the first
 * entry wins — matching downstream "first-seen wins" behavior elsewhere
 * in the scanner.
 *
 * @type {Map<string, string>}
 */
const SKELETON_TO_PROTECTED = (() => {
  const m = new Map();
  for (const name of PROTECTED_PACKAGE_NAMES) {
    const skel = skeleton(name);
    if (!skel) continue; // defensive: shouldn't happen for any curated entry
    if (!m.has(skel)) m.set(skel, name);
  }
  return m;
})();

/**
 * Check whether a scanned package name is a possible homoglyph typo-squat
 * of a curated protected name.
 *
 * Rules:
 *   - Skeleton match required (the suspected attacker and the protected
 *     name fold to the same canonical form).
 *   - Self-match suppression: if the skeleton matches AND the names are
 *     byte-for-byte identical, the scanned name IS the protected package
 *     itself; we return null so the legitimate `langchain` install never
 *     fires the chip.
 *   - Non-string / empty input returns null — never throws.
 *
 * Self-match suppression is intentionally **byte-exact**. We compare the
 * caller's `name` against the original protected entry without any case
 * folding or normalization, so `LangChain` (case-different but legitimate
 * package name) does NOT byte-match `langchain` and WILL fire the chip.
 * This is conservative: npm package names are required to be lowercase,
 * so any case-divergent install string is itself a red flag worth
 * surfacing for review.
 *
 * @param {string} name  scanned package name (with scope if applicable)
 * @returns {{ matched: string, suspectedTarget: string } | null}
 */
export function detectTypoSquat(name) {
  if (typeof name !== 'string' || name.length === 0) return null;
  const skel = skeleton(name);
  if (!skel) return null;
  const target = SKELETON_TO_PROTECTED.get(skel);
  if (!target) return null;
  // Self-match: same skeleton AND same original bytes -> legitimate install.
  // Byte-exact comparison (no toLowerCase / no normalize) is intentional —
  // npm normalizes its own canonical names to lowercase, so any case-
  // divergent caller string is itself suspicious enough to chip.
  if (target === name) return null;
  return { matched: name, suspectedTarget: target };
}

/**
 * Pure helper for tests + debug. Identical signature to skeleton() from
 * unicodeConfusables.js but re-exported here so tests + downstream code
 * have a single import surface for the typo-squat detector.
 *
 * @param {string} name
 * @returns {string}
 */
export function skeletonOf(name) {
  return skeleton(name);
}

export const __internal = { SKELETON_TO_PROTECTED };
