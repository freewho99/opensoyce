/**
 * OpenSoyce — Policy Inheritance (Phase 3).
 *
 * Handles three sources of policy truth, merged in priority order:
 *
 *   1. PRESET  — a named preset (soc2, iso27001, strict, permissive) that
 *                maps to a fixed block/warn/allow triple.
 *   2. ORG     — `.opensoyce.yml` from a central policy repo
 *                (e.g. `my-org/opensoyce-policy`). Fetched from its default
 *                branch so PR authors can't weaken it in the PR under review.
 *   3. REPO    — `.opensoyce.yml` from the repo being scanned.
 *
 * Merge rules (security-conservative):
 *   block = org.block ∪ repo.block          (either party can block)
 *   warn  = (org.warn ∪ repo.warn) \ block  (WARN never overrides BLOCK)
 *   allow = everything else
 *
 * Presets are resolved BEFORE org/repo policies and provide the floor. Org
 * and repo policies can only add to the preset's block/warn lists, never
 * remove from them.
 *
 * All exported functions are failure-isolated: network errors, 404s, YAML
 * parse failures, and missing keys ALL return the safe DEFAULT_POLICY. The
 * Guard Check Run must never fail because a policy file is unreachable.
 */

import yaml from 'js-yaml';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLICY_KEYS = new Set([
  'use-ready', 'stable', 'forkable', 'watchlist', 'risky', 'graveyard',
]);

/** Safe fallback — warn-only on risky/watchlist, block nothing. */
export const DEFAULT_POLICY = Object.freeze({
  block: [],
  warn: ['graveyard', 'risky', 'watchlist'],
  allow: ['use-ready', 'stable', 'forkable'],
});

// ---------------------------------------------------------------------------
// Presets (Phase 3 — SOC 2 / ISO 27001 compliance modes)
// ---------------------------------------------------------------------------

/**
 * Named policy presets. Keys match the `preset:` value in .opensoyce.yml.
 * Preset is resolved first and acts as the lowest-priority base; org/repo
 * policies merge on top using the same security-conservative rules.
 *
 * @type {Record<string, Readonly<{block: string[], warn: string[], allow: string[]}>>}
 */
export const POLICY_PRESETS = Object.freeze({
  /**
   * SOC 2 Compliance Mode.
   * Blocks abandoned (graveyard) and high-risk (risky) deps. Warns on
   * watchlist deps that need active monitoring. Satisfies SOC 2 CC6.8
   * "software with known vulnerabilities" controls.
   */
  soc2: Object.freeze({
    block: ['graveyard', 'risky'],
    warn: ['watchlist'],
    allow: ['use-ready', 'stable', 'forkable'],
  }),

  /**
   * ISO 27001 Compliance Mode (A.14 — System Acquisition / A.12.6 — Vuln Mgmt).
   * Identical risk thresholds to SOC 2; different audit-framework framing.
   * Aliased to soc2 — both require the same controls in practice.
   */
  iso27001: Object.freeze({
    block: ['graveyard', 'risky'],
    warn: ['watchlist'],
    allow: ['use-ready', 'stable', 'forkable'],
  }),

  /**
   * Strict Mode.
   * Blocks graveyard, risky, AND watchlist. Only explicitly scored deps
   * can pass without warning. For high-assurance environments.
   */
  strict: Object.freeze({
    block: ['graveyard', 'risky', 'watchlist'],
    warn: ['stable', 'forkable'],
    allow: ['use-ready'],
  }),

  /**
   * Permissive Mode.
   * Only blocks truly abandoned (graveyard) deps. Useful for rapid
   * prototyping or greenfield projects. NOT recommended for production.
   */
  permissive: Object.freeze({
    block: ['graveyard'],
    warn: ['risky', 'watchlist'],
    allow: ['use-ready', 'stable', 'forkable'],
  }),
});

/**
 * Resolve a preset name to its policy triple. Returns DEFAULT_POLICY on
 * unknown preset names (with a console.warn) so a typo never silently
 * weakens security.
 *
 * @param {string} name
 * @returns {{ block: string[], warn: string[], allow: string[] }}
 */
export function resolvePreset(name) {
  if (typeof name !== 'string') return { ...DEFAULT_POLICY };
  const key = name.toLowerCase().trim();
  const preset = POLICY_PRESETS[key];
  if (!preset) {
    console.warn(`policyInheritance: unknown preset "${name}", using default policy`);
    return { ...DEFAULT_POLICY };
  }
  return {
    block: [...preset.block],
    warn: [...preset.warn],
    allow: [...preset.allow],
  };
}

// ---------------------------------------------------------------------------
// Bucket normalization (shared with guard-webhook.js)
// ---------------------------------------------------------------------------

/**
 * Coerce one policy bucket (block/warn/allow) to a clean lowercase array of
 * known POLICY_KEYS. Unknown labels are dropped with a console.warn so
 * operators can see typos in their YAML.
 *
 * @param {unknown} raw
 * @param {string} bucketName  For the console.warn message.
 * @returns {string[]}
 */
export function normalizeBucket(raw, bucketName) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const lower = entry.toLowerCase().trim();
    if (!POLICY_KEYS.has(lower)) {
      console.warn(`policyInheritance: dropping unknown label in ${bucketName}: "${entry}"`);
      continue;
    }
    out.push(lower);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Policy merging
// ---------------------------------------------------------------------------

/**
 * Merge two policies (org + repo, or preset + repo) using security-
 * conservative rules:
 *
 *   result.block = union(a.block, b.block)
 *   result.warn  = union(a.warn, b.warn) minus result.block
 *   result.allow = POLICY_KEYS minus (block ∪ warn)
 *
 * Either policy can escalate a label to BLOCK; neither can demote it.
 *
 * @param {{ block: string[], warn: string[], allow: string[] }} a
 * @param {{ block: string[], warn: string[], allow: string[] }} b
 * @returns {{ block: string[], warn: string[], allow: string[] }}
 */
export function mergePolicy(a, b) {
  const aBlock = normalizeBucket(a && a.block, 'a.block');
  const bBlock = normalizeBucket(b && b.block, 'b.block');
  const aWarn = normalizeBucket(a && a.warn, 'a.warn');
  const bWarn = normalizeBucket(b && b.warn, 'b.warn');

  const block = [...new Set([...aBlock, ...bBlock])];
  const blockSet = new Set(block);

  // WARN is the union of both warn sets, minus anything promoted to BLOCK.
  const rawWarn = [...new Set([...aWarn, ...bWarn])];
  const warn = rawWarn.filter((k) => !blockSet.has(k));
  const warnSet = new Set(warn);

  // ALLOW is whatever's left — explicit or implicit.
  const allow = [...POLICY_KEYS].filter((k) => !blockSet.has(k) && !warnSet.has(k));

  return { block, warn, allow };
}

// ---------------------------------------------------------------------------
// Org-policy fetch
// ---------------------------------------------------------------------------

/**
 * Parse a raw .opensoyce.yml string into a normalized policy triple.
 * Returns null if the YAML doesn't contain a valid `policy` object.
 *
 * @param {string} rawYaml
 * @returns {{ block: string[], warn: string[], allow: string[] } | null}
 */
export function parseYamlPolicy(rawYaml) {
  let parsed;
  try {
    parsed = yaml.load(rawYaml);
  } catch (err) {
    console.error('policyInheritance: YAML parse error:', err && err.message ? err.message : err);
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  // Support preset shorthand: if only `preset:` is set (no `policy:` block).
  if (!parsed.policy && parsed.preset) {
    return resolvePreset(String(parsed.preset));
  }

  if (!parsed.policy || typeof parsed.policy !== 'object') return null;

  return {
    block: normalizeBucket(parsed.policy.block, 'block'),
    warn: normalizeBucket(parsed.policy.warn, 'warn'),
    allow: normalizeBucket(parsed.policy.allow, 'allow'),
  };
}

/**
 * Extract metadata from a parsed .opensoyce.yml for use by the Guard:
 *   - `orgPolicyRepo` — the `org:` key value (e.g. "my-org/opensoyce-policy")
 *   - `preset` — the `preset:` key value (e.g. "soc2")
 *
 * Returns null for each key that isn't present or isn't a string.
 *
 * @param {string} rawYaml
 * @returns {{ orgPolicyRepo: string | null, preset: string | null }}
 */
export function extractPolicyMetadata(rawYaml) {
  let parsed;
  try {
    parsed = yaml.load(rawYaml);
  } catch {
    return { orgPolicyRepo: null, preset: null };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { orgPolicyRepo: null, preset: null };
  }
  const orgPolicyRepo = typeof parsed.org === 'string' && parsed.org.includes('/')
    ? parsed.org.trim()
    : null;
  const preset = typeof parsed.preset === 'string' && parsed.preset.trim()
    ? parsed.preset.trim()
    : null;
  return { orgPolicyRepo, preset };
}

/**
 * Fetch .opensoyce.yml from a central policy repo's default branch.
 * The `githubFetch` dependency is injected so this module stays testable
 * without a real GitHub token.
 *
 * Returns `{ source: 'org', policy }` on success.
 * Returns `{ source: 'default', policy: DEFAULT_POLICY }` on any failure
 * (404, network, parse error) — NEVER throws.
 *
 * @param {(path: string) => Promise<Response>} githubFetch
 * @param {string} orgPolicyRepo  e.g. "my-org/opensoyce-policy"
 * @returns {Promise<{ source: 'org' | 'default', policy: { block: string[], warn: string[], allow: string[] } }>}
 */
export async function fetchOrgPolicy(githubFetch, orgPolicyRepo) {
  if (typeof orgPolicyRepo !== 'string' || !orgPolicyRepo.includes('/')) {
    return { source: 'default', policy: { ...DEFAULT_POLICY } };
  }

  let raw;
  try {
    // No `?ref=` — always reads from the default branch tip.
    const res = await githubFetch(`/repos/${orgPolicyRepo}/contents/.opensoyce.yml`);
    if (res.status === 404) {
      return { source: 'default', policy: { ...DEFAULT_POLICY } };
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '(no body)');
      console.error(
        `policyInheritance: fetchOrgPolicy non-OK for ${orgPolicyRepo}:`,
        res.status,
        text.slice(0, 200),
      );
      return { source: 'default', policy: { ...DEFAULT_POLICY } };
    }
    const json = await res.json();
    if (!json || typeof json.content !== 'string') {
      console.error('policyInheritance: fetchOrgPolicy missing content field');
      return { source: 'default', policy: { ...DEFAULT_POLICY } };
    }
    raw = Buffer.from(json.content, 'base64').toString('utf8');
  } catch (err) {
    console.error(
      `policyInheritance: fetchOrgPolicy threw for ${orgPolicyRepo}:`,
      err && err.message ? err.message : err,
    );
    return { source: 'default', policy: { ...DEFAULT_POLICY } };
  }

  const policy = parseYamlPolicy(raw);
  if (!policy) {
    return { source: 'default', policy: { ...DEFAULT_POLICY } };
  }
  return { source: 'org', policy };
}

/**
 * Full policy resolution pipeline for the Guard:
 *
 *   1. Start with DEFAULT_POLICY as the base.
 *   2. If `preset` is set, resolve it and merge on top of DEFAULT_POLICY.
 *   3. If `orgPolicyRepo` is set, fetch and merge org policy.
 *   4. Merge repo-local policy on top.
 *
 * Returns the resolved policy plus a `policySource` string for audit
 * display in the PR comment footer.
 *
 * @param {{
 *   githubFetch: (path: string) => Promise<Response>,
 *   orgPolicyRepo: string | null,
 *   preset: string | null,
 *   repoPolicy: { block: string[], warn: string[], allow: string[] } | null,
 * }} opts
 * @returns {Promise<{
 *   policy: { block: string[], warn: string[], allow: string[] },
 *   policySource: 'preset+org+repo' | 'preset+org' | 'preset+repo' | 'org+repo' | 'preset' | 'org' | 'repo' | 'default',
 * }>}
 */
export async function resolvePolicy({ githubFetch, orgPolicyRepo, preset, repoPolicy }) {
  const sources = [];
  let merged = { ...DEFAULT_POLICY };

  // Step 1: preset floor
  if (preset) {
    const presetPolicy = resolvePreset(preset);
    merged = mergePolicy(merged, presetPolicy);
    sources.push('preset');
  }

  // Step 2: org policy
  if (orgPolicyRepo) {
    const { source, policy: orgPolicy } = await fetchOrgPolicy(githubFetch, orgPolicyRepo);
    if (source === 'org') {
      merged = mergePolicy(merged, orgPolicy);
      sources.push('org');
    }
  }

  // Step 3: repo policy
  if (repoPolicy) {
    merged = mergePolicy(merged, repoPolicy);
    sources.push('repo');
  }

  const policySource = sources.length > 0 ? sources.join('+') : 'default';
  return { policy: merged, policySource };
}
