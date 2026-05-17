/**
 * Dependency-confusion detector v0 — orchestrates the static .opensoyce-private
 * list match against the active public-registry probe.
 *
 * The attack: an attacker publishes a package on public PyPI / npm with the
 * same name as your private package. Misconfigured pip / uv / npm index
 * priority pulls from public. Your CI installs attacker code. Real,
 * well-documented (Birsan 2021).
 *
 * We can't infer which packages are private without the user telling us.
 * The `.opensoyce-private` file is the user's curated list. v0 fires the
 * signal only when a scanned package name appears in that list. Zero false
 * positives if the list is correct.
 *
 * Confidence tiers:
 *   MEDIUM  Static match only. The name is in the user's private list. The
 *           public registry either does not have a package by that name OR
 *           the probe couldn't reach the registry. The signal says "verify
 *           your index priority configuration."
 *   HIGH    Static match + active confirmation. The same name has been
 *           published to the public registry. The signal says "active squat
 *           detected: an attacker may be attempting dependency confusion."
 *
 * Informational only. No score math, no Risk Profile contribution, no
 * band-cap. The chip + tooltip carry the story.
 */

/**
 * @typedef {{
 *   confidence: 'MEDIUM' | 'HIGH',
 *   reason: string,
 *   userComment: string | null,
 * }} DepConfusionSignal
 */

const MEDIUM_REASON =
  'Listed as private but also resolving to public registry — verify your index priority configuration.';
const HIGH_REASON =
  'Active squat detected: this private name has been published to the public registry. An attacker may be attempting dependency confusion.';

/**
 * Detect dependency-confusion risk for a single package name.
 *
 * @param {{
 *   name: string,
 *   ecosystem: 'npm' | 'PyPI',
 *   privateList: { nameSet: Set<string>, comments: Map<string, string> } | null,
 *   deps: {
 *     checkPublicRegistry: (name: string, ecosystem: 'npm' | 'PyPI', deps?: any) => Promise<boolean>,
 *     fetchImpl?: typeof fetch,
 *     cache?: Map<string, any>,
 *   },
 * }} args
 * @returns {Promise<DepConfusionSignal | null>}
 */
export async function detectDepConfusion(args) {
  const { name, ecosystem, privateList, deps } = args || {};
  if (typeof name !== 'string' || !name) return null;
  if (ecosystem !== 'npm' && ecosystem !== 'PyPI') return null;
  if (!privateList || !(privateList.nameSet instanceof Set)) return null;
  if (privateList.nameSet.size === 0) return null;
  if (!privateList.nameSet.has(name)) return null;

  const userComment = (privateList.comments instanceof Map && privateList.comments.has(name))
    ? privateList.comments.get(name)
    : null;

  // Static match → MEDIUM baseline.
  /** @type {DepConfusionSignal} */
  let signal = {
    confidence: 'MEDIUM',
    reason: MEDIUM_REASON,
    userComment,
  };

  // Active escalation. Any throw inside the registry probe is swallowed by
  // checkPublicRegistry itself (returns false on error); the MEDIUM static
  // signal is the floor and the only thing that can escalate is a clean
  // 200 from the public registry.
  if (deps && typeof deps.checkPublicRegistry === 'function') {
    let exists = false;
    try {
      exists = await deps.checkPublicRegistry(name, ecosystem, {
        fetchImpl: deps.fetchImpl,
        cache: deps.cache,
      });
    } catch {
      exists = false;
    }
    if (exists) {
      signal = {
        confidence: 'HIGH',
        reason: HIGH_REASON,
        userComment,
      };
    }
  }

  return signal;
}

export const __internal = { MEDIUM_REASON, HIGH_REASON };
