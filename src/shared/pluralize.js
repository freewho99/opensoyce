/**
 * Singular/plural helper. Returns "1 advisory" / "2 advisories" etc.
 * Pure function, no side effects.
 *
 * @param {number} n
 * @param {string} singular - e.g. "advisory"
 * @param {string} [pluralForm] - e.g. "advisories" (defaults to singular + "s")
 * @returns {string} - e.g. "1 advisory" / "0 advisories" / "5 advisories"
 */
export function plural(n, singular, pluralForm) {
  const word = n === 1 ? singular : (pluralForm || `${singular}s`);
  return `${n} ${word}`;
}
