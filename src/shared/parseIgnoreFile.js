/**
 * .opensoyce-ignore parser + matcher.
 *
 * gitignore-flavored, but mutes specific advisories or packages instead of
 * paths. Pure functions; no I/O.
 *
 * Supported rule kinds:
 *   pkg:<name>              suppress all advisories for package <name>
 *   pkg:<name>@<version>    suppress only that exact version
 *   cve:<id>                suppress by CVE id  (e.g. cve:CVE-2020-28500)
 *   ghsa:<id>               suppress by GHSA id (e.g. ghsa:GHSA-29mw-wpgm-hmr9)
 *   advisory:<id>           same as cve:/ghsa: but accepts either form
 *
 * Lines beginning with `#` are comments. Blank lines are ignored. A trailing
 * `# reason` on any rule line is captured in `rule.comment` and re-surfaced
 * in the SARIF run.properties.suppressions block.
 *
 * Parser is lenient by design — an unknown line goes into `errors` but does
 * not crash the scan. CI integrators see the error in stderr and move on.
 */

/** @typedef {{ kind: 'pkg' | 'cve' | 'ghsa' | 'advisory', value: string, version?: string, comment?: string }} IgnoreRule */

const KNOWN_KINDS = new Set(['pkg', 'cve', 'ghsa', 'advisory']);

/**
 * Parse a `.opensoyce-ignore` file's text contents into rules + errors.
 *
 * @param {string} text
 * @returns {{ rules: IgnoreRule[], errors: string[] }}
 */
export function parseIgnoreFile(text) {
  /** @type {IgnoreRule[]} */
  const rules = [];
  /** @type {string[]} */
  const errors = [];
  if (typeof text !== 'string' || text.length === 0) {
    return { rules, errors };
  }

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.startsWith('#')) continue;

    // Split off trailing comment. The `#` MUST be preceded by whitespace to
    // count as a comment — this lets pkg names containing `#` survive
    // (none exist today, but the rule keeps the parser predictable).
    let body = trimmed;
    let comment;
    const hashMatch = trimmed.match(/^(\S.*?)\s+#\s*(.*)$/);
    if (hashMatch) {
      body = hashMatch[1].trim();
      comment = hashMatch[2].trim();
    }

    const colonIdx = body.indexOf(':');
    if (colonIdx <= 0) {
      errors.push(`line ${i + 1}: invalid rule (expected <kind>:<value>): ${raw}`);
      continue;
    }
    const kind = body.slice(0, colonIdx).toLowerCase();
    const value = body.slice(colonIdx + 1).trim();
    if (!KNOWN_KINDS.has(kind) || !value) {
      errors.push(`line ${i + 1}: invalid rule (expected <kind>:<value>): ${raw}`);
      continue;
    }

    /** @type {IgnoreRule} */
    const rule = { kind: /** @type {any} */ (kind), value };
    if (kind === 'pkg') {
      const at = value.lastIndexOf('@');
      // `@` at index 0 is a scoped-package leading marker (e.g. @scope/pkg),
      // not a version separator. Only treat `@` as a version separator when
      // it appears after at least one char (and is not the scoped-leading @).
      if (at > 0) {
        const name = value.slice(0, at);
        const version = value.slice(at + 1);
        if (name && version) {
          rule.value = name;
          rule.version = version;
        }
      }
    }
    if (comment) rule.comment = comment;
    rules.push(rule);
  }

  return { rules, errors };
}

/**
 * Returns the first matching rule for a given vuln, or null. Order of
 * preference matches the order rules were declared in the file — a
 * `pkg:lodash` followed by `cve:CVE-x` will match `pkg:lodash` first for
 * a lodash advisory; this is intentional so the suppression file remains
 * declarative (the user's first listed rule wins).
 *
 * @param {{ package?: string, version?: string, ids?: string[] }} vuln
 * @param {IgnoreRule[]} rules
 * @returns {IgnoreRule | null}
 */
export function matchesIgnoreRule(vuln, rules) {
  if (!vuln || !Array.isArray(rules) || rules.length === 0) return null;
  const pkg = typeof vuln.package === 'string' ? vuln.package : null;
  const version = typeof vuln.version === 'string' ? vuln.version : null;
  const ids = Array.isArray(vuln.ids) ? vuln.ids : [];

  for (const rule of rules) {
    if (rule.kind === 'pkg') {
      if (!pkg || rule.value !== pkg) continue;
      if (rule.version) {
        if (version === rule.version) return rule;
        continue;
      }
      return rule;
    }
    if (rule.kind === 'cve') {
      if (ids.some(id => id === rule.value)) return rule;
      continue;
    }
    if (rule.kind === 'ghsa') {
      if (ids.some(id => id === rule.value)) return rule;
      continue;
    }
    if (rule.kind === 'advisory') {
      if (ids.some(id => id === rule.value)) return rule;
      continue;
    }
  }
  return null;
}
