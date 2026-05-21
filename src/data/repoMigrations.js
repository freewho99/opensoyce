/**
 * Curated repo-migration table — fork-velocity-of-namesake v0.
 *
 * When the resolver (or a Lookup query) lands on a repo in this list,
 * OpenSoyce surfaces a "migrated to {successor}" banner. The banner is
 * INFORMATIONAL — it never changes the composite score, the Risk Profile,
 * or the verdict band of the scored repo. It only tells the user that the
 * repo they're looking at is not where the actual maintenance is happening.
 *
 * Why curated first, fork-walk later (src/shared/detectMigration.js):
 *   - well-known migrations (xenova → huggingface) have HIGH confidence and
 *     deserve precise authored copy; we don't want fuzzy heuristics there.
 *   - fork-chain walk costs an extra GitHub API call, so it only fires when
 *     we couldn't satisfy from the curated list AND the verdict is already
 *     low (WATCHLIST/RISKY/STALE).
 *
 * Entries with `to: null` are "deprecated, no canonical successor". That's a
 * valid signal too — we render "was deprecated" instead of "migrated to X".
 *
 * @typedef {Object} RepoMigrationOwnerRepo
 * @property {string} owner
 * @property {string} repo
 *
 * @typedef {Object} RepoMigrationEntry
 * @property {RepoMigrationOwnerRepo} from
 * @property {RepoMigrationOwnerRepo|null} to  null = deprecated without canonical successor
 * @property {string} migratedAt  ISO-ish date string (YYYY-MM-DD); approximate is fine
 * @property {string} reason      short explanation surfaced as the banner subtext
 */

/** @type {RepoMigrationEntry[]} */
export const REPO_MIGRATIONS = [
  // AI / ML ecosystem migrations — the swarm finding that motivated this file.
  {
    from: { owner: 'xenova', repo: 'transformers' },
    to: { owner: 'huggingface', repo: 'transformers.js' },
    migratedAt: '2024-08-01',
    reason: 'Original author moved the project to the Hugging Face org; the xenova namespace is now an archived predecessor.',
  },
  {
    from: { owner: 'xenova', repo: 'whisper-web' },
    to: { owner: 'huggingface', repo: 'transformers.js-examples' },
    migratedAt: '2024-09-15',
    reason: 'Whisper-web example was absorbed into the official transformers.js examples repo after the namespace migration.',
  },
  {
    from: { owner: 'huggingface', repo: 'pytorch-transformers' },
    to: { owner: 'huggingface', repo: 'transformers' },
    migratedAt: '2019-09-26',
    reason: 'Renamed from pytorch-transformers to transformers when multi-framework (TF + JAX) support landed.',
  },
  {
    from: { owner: 'huggingface', repo: 'pytorch-pretrained-BERT' },
    to: { owner: 'huggingface', repo: 'transformers' },
    migratedAt: '2019-07-15',
    reason: 'Predecessor of pytorch-transformers / transformers; superseded by the broader transformers library.',
  },
  {
    from: { owner: 'hwchase17', repo: 'langchain' },
    to: { owner: 'langchain-ai', repo: 'langchain' },
    migratedAt: '2023-04-21',
    reason: 'Original author transferred the project from a personal namespace to the LangChain AI org.',
  },
  {
    from: { owner: 'hwchase17', repo: 'langchainjs' },
    to: { owner: 'langchain-ai', repo: 'langchainjs' },
    migratedAt: '2023-04-21',
    reason: 'Transferred to LangChain AI org alongside the Python repo.',
  },
  {
    from: { owner: 'jerryjliu', repo: 'llama_index' },
    to: { owner: 'run-llama', repo: 'llama_index' },
    migratedAt: '2023-08-15',
    reason: 'Transferred from the original author to the run-llama org under the GPT Index → LlamaIndex rename.',
  },
  {
    from: { owner: 'jerryjliu', repo: 'gpt_index' },
    to: { owner: 'run-llama', repo: 'llama_index' },
    migratedAt: '2023-02-21',
    reason: 'Renamed from gpt_index to llama_index and later transferred to the run-llama org.',
  },

  // JS classic OSS migrations.
  {
    from: { owner: 'jashkenas', repo: 'underscore' },
    to: { owner: 'lodash', repo: 'lodash' },
    migratedAt: '2012-04-23',
    reason: 'Effectively succeeded by lodash, originally a fork; underscore.js is maintained as a historical archive.',
  },
  {
    from: { owner: 'request', repo: 'request' },
    to: null,
    migratedAt: '2020-02-11',
    reason: 'Officially deprecated; the ecosystem fragmented across axios, node-fetch, and undici with no single canonical successor.',
  },
  {
    from: { owner: 'request', repo: 'request-promise' },
    to: null,
    migratedAt: '2020-02-11',
    reason: 'Deprecated alongside request; users moved to native fetch or axios with no canonical successor.',
  },
  {
    from: { owner: 'kriskowal', repo: 'q' },
    to: null,
    migratedAt: '2017-05-30',
    reason: 'Promise library superseded by native ES2015 Promises; no canonical replacement library.',
  },
  {
    from: { owner: 'moment', repo: 'moment' },
    to: null,
    migratedAt: '2020-09-15',
    reason: 'Marked as a legacy project by its maintainers; ecosystem moved to date-fns, day.js, and Luxon with no single successor.',
  },
  {
    from: { owner: 'tj', repo: 'co' },
    to: null,
    migratedAt: '2017-06-01',
    reason: 'Generator-based control flow superseded by native async/await; no canonical replacement library.',
  },
  {
    from: { owner: 'sindresorhus', repo: 'gulp-cli' },
    to: { owner: 'gulpjs', repo: 'gulp-cli' },
    migratedAt: '2017-12-01',
    reason: 'Moved from personal namespace to the official gulpjs org.',
  },
  {
    from: { owner: 'visionmedia', repo: 'mocha' },
    to: { owner: 'mochajs', repo: 'mocha' },
    migratedAt: '2016-01-15',
    reason: 'Transferred from TJ Holowaychuk to the mochajs org for community maintenance.',
  },
  {
    from: { owner: 'visionmedia', repo: 'express' },
    to: { owner: 'expressjs', repo: 'express' },
    migratedAt: '2014-07-15',
    reason: 'Transferred to the expressjs org as part of the StrongLoop / community handoff.',
  },
  {
    from: { owner: 'visionmedia', repo: 'commander.js' },
    to: { owner: 'tj', repo: 'commander.js' },
    migratedAt: '2018-06-10',
    reason: 'Moved back to TJ Holowaychuk personal namespace after the visionmedia org wound down.',
  },
  {
    from: { owner: 'eligrey', repo: 'FileSaver.js' },
    to: null,
    migratedAt: '2020-06-01',
    reason: 'Maintainer-archived; users moved to streamsaver.js or native showSaveFilePicker with no single successor.',
  },
  {
    from: { owner: 'broofa', repo: 'node-mime' },
    to: { owner: 'broofa', repo: 'mime' },
    migratedAt: '2016-10-01',
    reason: 'Renamed from node-mime to mime within the same author namespace; old name retained as a redirect.',
  },
  {
    from: { owner: 'feross', repo: 'standard' },
    to: { owner: 'standard', repo: 'standard' },
    migratedAt: '2018-03-01',
    reason: 'Transferred from author personal namespace to the standard org.',
  },

  // Python ecosystem migrations.
  {
    from: { owner: 'ansible', repo: 'ansible' },
    to: { owner: 'ansible', repo: 'ansible-core' },
    migratedAt: '2021-05-26',
    reason: 'Ansible 2.10+ split into ansible-core (engine) and the ansible package (curated collections); the original repo is the engine layer.',
  },
  {
    from: { owner: 'pallets', repo: 'flask-restful' },
    to: null,
    migratedAt: '2021-10-01',
    reason: 'Community-maintained successor unclear; users typically move to FastAPI or Flask-RESTX (a maintained fork) — neither is canonical.',
  },
  {
    from: { owner: 'kennethreitz', repo: 'requests' },
    to: { owner: 'psf', repo: 'requests' },
    migratedAt: '2019-02-15',
    reason: 'Transferred from Kenneth Reitz personal namespace to the Python Software Foundation org.',
  },
  {
    from: { owner: 'kennethreitz', repo: 'pipenv' },
    to: { owner: 'pypa', repo: 'pipenv' },
    migratedAt: '2019-11-01',
    reason: 'Transferred from Kenneth Reitz personal namespace to the Python Packaging Authority.',
  },
];

function eq(a, b) {
  return typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
}

function isValidOwnerRepo(x) {
  return (
    x
    && typeof x === 'object'
    && typeof x.owner === 'string'
    && typeof x.repo === 'string'
    && x.owner.length > 0
    && x.repo.length > 0
  );
}

/**
 * Look up a curated migration entry for `owner/repo`. Case-insensitive on
 * both owner and repo. Returns null when no curated entry exists or when
 * the input is malformed. Entries with `to: null` are returned as-is —
 * callers must handle the "deprecated without successor" shape.
 *
 * @param {string} owner
 * @param {string} repo
 * @returns {RepoMigrationEntry | null}
 */
export function getCuratedMigration(owner, repo) {
  if (typeof owner !== 'string' || typeof repo !== 'string') return null;
  if (!owner || !repo) return null;
  for (const entry of REPO_MIGRATIONS) {
    if (!entry || !isValidOwnerRepo(entry.from)) continue;
    if (eq(entry.from.owner, owner) && eq(entry.from.repo, repo)) {
      return entry;
    }
  }
  return null;
}

/**
 * Boolean shortcut — true when a curated migration exists for `owner/repo`.
 * Case-insensitive. Handles `to: null` correctly (the entry still counts).
 *
 * @param {string} owner
 * @param {string} repo
 * @returns {boolean}
 */
export function hasCuratedMigration(owner, repo) {
  return getCuratedMigration(owner, repo) !== null;
}
