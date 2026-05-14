/**
 * Scanner v3b -- Selective Dependency Health candidate selection.
 *
 * Pure function. No I/O, no React. Consumes the v3a inventory shape
 * (see buildInventory in scanLockfile.js) plus the set of package names
 * already covered by v2.1a (vulnerable, repo-health-scored). Returns the
 * top-N packages most worth scoring under the v3b budget, with each row's
 * primary tier and any secondary tiers it also matches.
 *
 * Priority tiers (fill until budget):
 *   1. DIRECT_PROD          -- direct production dependency
 *   2. DIRECT_DEV           -- direct development dependency
 *   3. MULTI_VERSION        -- transitive with >1 version in the tree
 *   4. IDENTITY_UNRESOLVED  -- inventory hint: package has no repository field
 *   5. HIGH_FAN_IN          -- transitive with high fan-in (skipped if inventory
 *                              does not expose fan-in data; we do NOT invent it)
 *
 * A package qualifies under every tier it matches; the highest tier becomes
 * primaryReason and the others go into secondaryReasons (still ranked by
 * tier order). Within a tier, tiebreak alphabetically by package name.
 *
 * Vulnerable packages are intentionally excluded -- v2.1a already scored them
 * and they should not consume v3b budget slots.
 *
 * IDENTITY_UNRESOLVED is a hint, not a verdict: a package missing a repository
 * field in its lockfile metadata is a strong signal that resolver lookup will
 * also fail or be MEDIUM-confidence. We surface it here so the eventual scorer
 * spends a slot on it; the cost guard ('unknown is not a verdict') is enforced
 * downstream by the analyzer, not here.
 *
 * @param {{
 *   inventory: { packages: Array<{
 *     name: string,
 *     versions: string[],
 *     direct: boolean,
 *     scope: 'prod'|'dev'|'optional'|'unknown',
 *     hasLicense: boolean,
 *     hasRepository: boolean,
 *     fanIn?: number,
 *   }> } | null | undefined,
 *   vulnerablePackageNames: Set<string>,
 *   budget?: number,
 * }} args
 * @returns {{
 *   selected: Array<{
 *     package: string,
 *     version: string,
 *     direct: boolean,
 *     scope: 'prod'|'dev'|'optional'|'unknown',
 *     primaryReason: 'DIRECT_PROD'|'DIRECT_DEV'|'MULTI_VERSION'|'IDENTITY_UNRESOLVED'|'HIGH_FAN_IN',
 *     secondaryReasons: string[],
 *   }>,
 *   skippedBudget: number,
 *   qualifyingTotal: number,
 * }}
 */
export function selectHealthCandidates({ inventory, vulnerablePackageNames, budget = 25 } = {}) {
  const empty = { selected: [], skippedBudget: 0, qualifyingTotal: 0 };
  if (!inventory || !Array.isArray(inventory.packages) || inventory.packages.length === 0) {
    return empty;
  }
  const excluded = vulnerablePackageNames instanceof Set
    ? vulnerablePackageNames
    : new Set(Array.isArray(vulnerablePackageNames) ? vulnerablePackageNames : []);

  // Does the inventory expose fan-in data on ANY row? If not, the HIGH_FAN_IN
  // tier is silently dropped -- we never fake the signal.
  const fanInAvailable = inventory.packages.some(p =>
    typeof p.fanIn === 'number' && Number.isFinite(p.fanIn) && p.fanIn > 0,
  );
  // Fan-in threshold: 5+ dependents is the cheap heuristic for "lots of code
  // touches this." Only meaningful when fanInAvailable === true.
  const FAN_IN_MIN = 5;

  /**
   * Compute every tier a package qualifies for. Order in the return value is
   * the priority order; first entry becomes primaryReason.
   * @param {{name:string,direct:boolean,scope:string,versions:string[],hasRepository:boolean,fanIn?:number}} p
   * @returns {string[]}
   */
  function reasonsFor(p) {
    const out = [];
    if (p.direct && p.scope === 'prod') out.push('DIRECT_PROD');
    if (p.direct && p.scope === 'dev') out.push('DIRECT_DEV');
    if (Array.isArray(p.versions) && p.versions.length > 1) out.push('MULTI_VERSION');
    if (!p.hasRepository) out.push('IDENTITY_UNRESOLVED');
    if (fanInAvailable && typeof p.fanIn === 'number' && p.fanIn >= FAN_IN_MIN) {
      out.push('HIGH_FAN_IN');
    }
    return out;
  }

  // Bucket every qualifying package by its primary tier.
  /** @type {Record<string, Array<{pkg: any, secondary: string[]}>>} */
  const buckets = {
    DIRECT_PROD: [],
    DIRECT_DEV: [],
    MULTI_VERSION: [],
    IDENTITY_UNRESOLVED: [],
    HIGH_FAN_IN: [],
  };
  const TIER_ORDER = ['DIRECT_PROD', 'DIRECT_DEV', 'MULTI_VERSION', 'IDENTITY_UNRESOLVED', 'HIGH_FAN_IN'];

  for (const pkg of inventory.packages) {
    if (!pkg || typeof pkg.name !== 'string' || !pkg.name) continue;
    if (excluded.has(pkg.name)) continue;
    const reasons = reasonsFor(pkg);
    if (reasons.length === 0) continue;
    const primary = reasons[0];
    const secondary = reasons.slice(1);
    buckets[primary].push({ pkg, secondary });
  }

  // Stable alphabetical sort within each tier.
  for (const tier of TIER_ORDER) {
    buckets[tier].sort((a, b) => a.pkg.name.localeCompare(b.pkg.name));
  }

  const qualifyingTotal = TIER_ORDER.reduce((acc, t) => acc + buckets[t].length, 0);
  const cap = typeof budget === 'number' && budget > 0 ? Math.floor(budget) : 25;

  const selected = [];
  for (const tier of TIER_ORDER) {
    for (const entry of buckets[tier]) {
      if (selected.length >= cap) break;
      const p = entry.pkg;
      // Pick the highest-priority version: for now that means the first entry
      // in versions[]. v3a sorts versions semver-loose ascending, so versions[0]
      // is the lowest -- but it is also the stable canonical entry the user
      // sees in the inventory table. We deliberately mirror the inventory's
      // first-shown version rather than guess "latest installed."
      const version = Array.isArray(p.versions) && p.versions.length > 0
        ? p.versions[0]
        : '';
      selected.push({
        package: p.name,
        version,
        direct: !!p.direct,
        scope: p.scope || 'unknown',
        primaryReason: tier,
        secondaryReasons: entry.secondary,
      });
    }
    if (selected.length >= cap) break;
  }

  const skippedBudget = Math.max(0, qualifyingTotal - selected.length);
  return { selected, skippedBudget, qualifyingTotal };
}
