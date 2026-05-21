/**
 * .opensoyce-private parser — declares private package names for the
 * dependency-confusion detector.
 *
 * Format spec:
 *
 *   # .opensoyce-private — private package names for dependency-confusion detection
 *   #
 *   # One package name per line. Case-sensitive (npm + PyPI both are).
 *   # A trailing `# comment` on a name line is captured and surfaced in
 *   # the chip tooltip on the inventory / vuln / selected-health rows.
 *   #
 *   #   PyPI:     mycompany-internal-utils
 *   #   npm:      @mycompany/ai-client (scoped) or mycompany-utils (unscoped)
 *
 *   mycompany-internal-utils       # python: internal helper library
 *   @mycompany/ai-client           # npm: scoped private SDK
 *   mycompany-llm-tools            # python: AI utilities
 *
 * The file is ecosystem-agnostic — npm and PyPI names rarely collide and
 * a name listed here is treated as "private wherever it appears." See
 * detectDepConfusion.js for the static + active-check semantics.
 *
 * The parser never throws. Malformed lines accumulate in `errors` so the
 * CLI can surface them on stderr (mirroring parseIgnoreFile.js).
 */

/**
 * Parse a `.opensoyce-private` file's text contents.
 *
 * @param {string} text
 * @returns {{
 *   names: string[],
 *   nameSet: Set<string>,
 *   errors: string[],
 *   comments: Map<string, string>,
 * }}
 */
export function parsePrivateFile(text) {
  /** @type {string[]} */
  const names = [];
  /** @type {Set<string>} */
  const nameSet = new Set();
  /** @type {string[]} */
  const errors = [];
  /** @type {Map<string, string>} */
  const comments = new Map();

  if (typeof text !== 'string' || text.length === 0) {
    return { names, nameSet, errors, comments };
  }

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.startsWith('#')) continue;

    // Strip trailing `# comment`. The `#` MUST be preceded by whitespace to
    // count as a comment — package names never contain `#`, but this rule
    // keeps the parser predictable and matches parseIgnoreFile.js.
    let body = trimmed;
    let comment;
    const hashMatch = trimmed.match(/^(\S.*?)\s+#\s*(.*)$/);
    if (hashMatch) {
      body = hashMatch[1].trim();
      comment = hashMatch[2].trim();
    }

    // Defensive sanity check on the bare token. A valid npm or PyPI name has
    // no whitespace and at least one character. Anything else goes to errors.
    if (!body || /\s/.test(body)) {
      errors.push(`line ${i + 1}: invalid package name: ${raw}`);
      continue;
    }

    // Case-sensitive de-dupe — listing the same name twice is harmless but
    // we keep the first occurrence's comment.
    if (!nameSet.has(body)) {
      nameSet.add(body);
      names.push(body);
      if (comment) comments.set(body, comment);
    } else if (comment && !comments.has(body)) {
      comments.set(body, comment);
    }
  }

  return { names, nameSet, errors, comments };
}

/**
 * Check if a given package name is in the parsed private list.
 * Case-sensitive — npm and PyPI both treat package names as case-sensitive
 * on their registries (PyPI normalizes on lookup but the listed identity
 * is case-preserving).
 *
 * @param {string} name
 * @param {{ nameSet: Set<string> }} parsed
 * @returns {boolean}
 */
export function isPrivateName(name, parsed) {
  if (typeof name !== 'string' || !name) return false;
  if (!parsed || !(parsed.nameSet instanceof Set)) return false;
  return parsed.nameSet.has(name);
}
