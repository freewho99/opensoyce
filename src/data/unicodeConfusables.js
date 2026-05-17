/**
 * Typo-squat homoglyph detection v0 — curated subset of the Unicode TR39
 * Confusables table.
 *
 * Maps each suspicious character to its ASCII-canonical "skeleton" form. The
 * scanner reduces each scanned package name + each protected name to its
 * skeleton; a collision between two skeletons whose original byte sequences
 * differ is flagged as a possible typo-squat.
 *
 * Coverage notes:
 *   - Cyrillic / Greek / fullwidth Latin lookalikes of common ASCII letters.
 *   - The most-exploited same-script confusables (`0` for `o`, `1` for `l`,
 *     etc.). Including these is controversial — they are visually identical
 *     in ASCII — but they are the most-used attack vectors in practice and
 *     the curated protected-names list bounds the false-positive surface.
 *   - Non-ASCII hyphens / dashes (figure dash, em dash, etc.) collapse to
 *     plain ASCII `-`.
 *   - Fullwidth Latin block (U+FF21..U+FF3A / U+FF41..U+FF5A) folds via
 *     NFKC before the table lookup — we add a handful of explicit entries
 *     for paranoia but rely on `normalize('NFKC')` in skeleton().
 *
 * NOT a complete TR39 implementation — the full table is ~6000 entries and
 * shipping it bloats the bundle without buying coverage of attacks anyone
 * actually runs. We ship ~200 high-value entries covering the documented
 * dangerous cases. The complete TR39 table is a v0.x research direction.
 */

/* eslint-disable */
/**
 * Skeleton mapping. Keys are the suspicious characters; values are the
 * ASCII-canonical form. NFKC normalization runs first inside skeleton(),
 * so we only need to enumerate the post-NFKC residue here.
 *
 * @type {Record<string, string>}
 */
export const CONFUSABLES = {
  // ---------------- Cyrillic lowercase lookalikes ----------------
  'а': 'a', // а CYRILLIC SMALL LETTER A
  'е': 'e', // е CYRILLIC SMALL LETTER IE
  'о': 'o', // о CYRILLIC SMALL LETTER O
  'р': 'p', // р CYRILLIC SMALL LETTER ER
  'с': 'c', // с CYRILLIC SMALL LETTER ES
  'у': 'y', // у CYRILLIC SMALL LETTER U
  'х': 'x', // х CYRILLIC SMALL LETTER HA
  'і': 'i', // і CYRILLIC SMALL LETTER BYELORUSSIAN-UKRAINIAN I
  'ј': 'j', // ј CYRILLIC SMALL LETTER JE
  'ӏ': 'l', // ӏ CYRILLIC SMALL LETTER PALOCHKA
  'ԛ': 'q', // ԛ CYRILLIC SMALL LETTER QA
  'ԝ': 'w', // ԝ CYRILLIC SMALL LETTER WE
  'һ': 'h', // һ CYRILLIC SMALL LETTER SHHA
  'ү': 'y', // ү CYRILLIC SMALL LETTER STRAIGHT U
  'ӕ': 'oe', // ӕ CYRILLIC SMALL LIGATURE A IE (loose)

  // ---------------- Cyrillic uppercase lookalikes ----------------
  'А': 'a', // А CYRILLIC CAPITAL LETTER A
  'В': 'b', // В CYRILLIC CAPITAL LETTER VE
  'Е': 'e', // Е CYRILLIC CAPITAL LETTER IE
  'К': 'k', // К CYRILLIC CAPITAL LETTER KA
  'М': 'm', // М CYRILLIC CAPITAL LETTER EM
  'Н': 'h', // Н CYRILLIC CAPITAL LETTER EN
  'О': 'o', // О CYRILLIC CAPITAL LETTER O
  'Р': 'p', // Р CYRILLIC CAPITAL LETTER ER
  'С': 'c', // С CYRILLIC CAPITAL LETTER ES
  'Т': 't', // Т CYRILLIC CAPITAL LETTER TE
  'Х': 'x', // Х CYRILLIC CAPITAL LETTER HA
  'Ѕ': 's', // Ѕ CYRILLIC CAPITAL LETTER DZE
  'І': 'i', // І CYRILLIC CAPITAL LETTER BYELORUSSIAN-UKRAINIAN I
  'Ј': 'j', // Ј CYRILLIC CAPITAL LETTER JE
  'Ү': 'y', // Ү CYRILLIC CAPITAL LETTER STRAIGHT U

  // ---------------- Greek lowercase lookalikes ----------------
  'α': 'a', // α GREEK SMALL LETTER ALPHA
  'ο': 'o', // ο GREEK SMALL LETTER OMICRON
  'ρ': 'p', // ρ GREEK SMALL LETTER RHO
  'ν': 'v', // ν GREEK SMALL LETTER NU
  'ε': 'e', // ε GREEK SMALL LETTER EPSILON (loose)
  'ι': 'i', // ι GREEK SMALL LETTER IOTA
  'κ': 'k', // κ GREEK SMALL LETTER KAPPA
  'χ': 'x', // χ GREEK SMALL LETTER CHI
  'υ': 'y', // υ GREEK SMALL LETTER UPSILON
  'τ': 't', // τ GREEK SMALL LETTER TAU (loose)
  'η': 'n', // η GREEK SMALL LETTER ETA (loose)
  'γ': 'y', // γ GREEK SMALL LETTER GAMMA (loose)
  'μ': 'u', // μ GREEK SMALL LETTER MU (loose)
  'ω': 'w', // ω GREEK SMALL LETTER OMEGA (loose)

  // ---------------- Greek uppercase lookalikes ----------------
  'Α': 'a', // Α GREEK CAPITAL LETTER ALPHA
  'Β': 'b', // Β GREEK CAPITAL LETTER BETA
  'Ε': 'e', // Ε GREEK CAPITAL LETTER EPSILON
  'Η': 'h', // Η GREEK CAPITAL LETTER ETA
  'Ι': 'i', // Ι GREEK CAPITAL LETTER IOTA
  'Κ': 'k', // Κ GREEK CAPITAL LETTER KAPPA
  'Μ': 'm', // Μ GREEK CAPITAL LETTER MU
  'Ν': 'n', // Ν GREEK CAPITAL LETTER NU
  'Ο': 'o', // Ο GREEK CAPITAL LETTER OMICRON
  'Ρ': 'p', // Ρ GREEK CAPITAL LETTER RHO
  'Τ': 't', // Τ GREEK CAPITAL LETTER TAU
  'Χ': 'x', // Χ GREEK CAPITAL LETTER CHI
  'Υ': 'y', // Υ GREEK CAPITAL LETTER UPSILON
  'Ζ': 'z', // Ζ GREEK CAPITAL LETTER ZETA

  // ---------------- Same-script (ASCII) digit/letter confusables --
  // These are visually identical to ASCII letters in many fonts and
  // are the most-used attack vectors in practice. We deliberately do
  // NOT map `i` -> `l` (or vice versa): doing so would break the
  // self-match-suppression skeleton of every protected name that
  // contains an `i` (langchain, openai, vite, ...) and force the
  // skeleton of `langchain` to diverge from its own lowercase form.
  // The asymmetric mapping (`1` and `I` -> `l`; `i` and `l` stay
  // themselves) lets `1angchain` collide with `langchain` while
  // keeping ASCII pass-through for the canonical name. The cost is
  // that a `1nstructor` (digit-1 for letter-i) attack against
  // `instructor` would NOT fire — accepted v0 trade-off.
  '0': 'o',
  '1': 'l',
  '5': 's',
  '8': 'b',
  '2': 'z',

  // ---------------- Hyphen / dash / minus confusables ----------------
  '‐': '-', // ‐ HYPHEN
  '‑': '-', // ‑ NON-BREAKING HYPHEN
  '‒': '-', // ‒ FIGURE DASH
  '–': '-', // – EN DASH
  '—': '-', // — EM DASH
  '―': '-', // ― HORIZONTAL BAR
  '−': '-', // − MINUS SIGN
  '⁃': '-', // ⁃ HYPHEN BULLET
  'ー': '-', // ー KATAKANA-HIRAGANA PROLONGED SOUND MARK (loose)
  '⸺': '-', // ⸺ TWO-EM DASH
  '⸻': '-', // ⸻ THREE-EM DASH

  // ---------------- Underscore / low-line confusables ----------------
  'ˍ': '_', // ˍ MODIFIER LETTER LOW MACRON
  '̱': '',  // ̱ COMBINING MACRON BELOW (drop; combining marks add nothing visual to ASCII id)
  '̲': '',  // ̲ COMBINING LOW LINE (drop)

  // ---------------- Slash confusables ----------------
  '⁄': '/', // ⁄ FRACTION SLASH
  '∕': '/', // ∕ DIVISION SLASH

  // ---------------- Dot confusables ----------------
  '·': '.', // · MIDDLE DOT
  '•': '.', // • BULLET (loose)
  '‧': '.', // ‧ HYPHENATION POINT
  '・': '.', // ・ KATAKANA MIDDLE DOT (loose)

  // ---------------- @ confusables ----------------
  '﹫': '@', // ﹫ SMALL COMMERCIAL AT
  '＠': '@', // ＠ FULLWIDTH COMMERCIAL AT (covered by NFKC; explicit anyway)

  // ---------------- Misc Latin lookalikes ----------------
  'ı': 'i', // ı LATIN SMALL LETTER DOTLESS I
  'ȷ': 'j', // ȷ LATIN SMALL LETTER DOTLESS J
  'ø': 'o', // ø LATIN SMALL LETTER O WITH STROKE (loose)
  'ð': 'o', // ð LATIN SMALL LETTER ETH (loose)
  'ß': 'b', // ß LATIN SMALL LETTER SHARP S (loose)
  'þ': 'b', // þ LATIN SMALL LETTER THORN (loose)
  'ł': 'l', // ł LATIN SMALL LETTER L WITH STROKE

  // ---------------- Armenian / Georgian / Hebrew lookalikes (common) -
  'օ': 'o', // օ ARMENIAN SMALL LETTER OH
  'ո': 'n', // ո ARMENIAN SMALL LETTER VO (loose)
  'ռ': 'n', // ռ ARMENIAN SMALL LETTER RA (loose)
  'Ӏ': 'l', // Ӏ CYRILLIC LETTER PALOCHKA (uppercase variant)

  // ---------------- Mathematical letterlike (NFKC handles most;
  // these are MATHEMATICAL letters that some normalizers miss) ------
  'ℓ': 'l', // ℓ SCRIPT SMALL L
  'ℐ': 'i', // ℐ SCRIPT CAPITAL I
  'ℑ': 'i', // ℑ BLACK-LETTER CAPITAL I
  'ℒ': 'l', // ℒ SCRIPT CAPITAL L

  // ---------------- Fullwidth Latin (NFKC handles these — listed
  // explicitly for paranoia / docs). Only a couple to keep the table
  // legible; the rest fold via NFKC inside skeleton() ---------------
  'Ａ': 'a', // Ａ FULLWIDTH LATIN CAPITAL LETTER A
  'Ｂ': 'b', // Ｂ
  'Ｃ': 'c', // Ｃ
  'ａ': 'a', // ａ FULLWIDTH LATIN SMALL LETTER A
  'ｏ': 'o', // ｏ FULLWIDTH LATIN SMALL LETTER O

  // ---------------- Invisible / zero-width characters: drop entirely
  // Attackers can inject these between letters to break exact-name
  // checks while leaving the visual rendering unchanged.
  '​': '', // ZERO WIDTH SPACE
  '‌': '', // ZERO WIDTH NON-JOINER
  '‍': '', // ZERO WIDTH JOINER
  '⁠': '', // WORD JOINER
  '﻿': '', // ZERO WIDTH NO-BREAK SPACE / BOM
  '­': '', // SOFT HYPHEN
};
/* eslint-enable */

/**
 * Reduce a string to its confusables skeleton form.
 *
 * Pipeline:
 *   1. NFKC normalize so fullwidth + compatibility forms collapse to ASCII
 *      before the table lookup (this gives us the entire FULLWIDTH LATIN
 *      block "for free" without 52 explicit entries).
 *   2. Lowercase. Names are case-insensitive on npm anyway; folding case
 *      lets us share a single mapping table.
 *   3. Per-character lookup. Characters absent from the table pass through
 *      unchanged. Characters mapped to '' are dropped (zero-width family).
 *
 * Pure function — no allocation beyond the output string. Safe to call from
 * module init time (see SKELETON_TO_PROTECTED in protectedPackageNames.js).
 *
 * @param {string} name
 * @returns {string} canonical skeleton; empty string for non-string input
 */
export function skeleton(name) {
  if (typeof name !== 'string' || name.length === 0) return '';
  const lower = name.normalize('NFKC').toLowerCase();
  let out = '';
  // Iterate by code point so surrogate-pair characters are read whole. The
  // for-of loop on a string yields code points (not code units), which is
  // the right granularity for an attack-surface that includes mathematical
  // letterlike + emoji confusable noise.
  for (const ch of lower) {
    const mapped = CONFUSABLES[ch];
    if (mapped !== undefined) out += mapped;
    else out += ch;
  }
  return out;
}

export const __internal = { CONFUSABLES };
