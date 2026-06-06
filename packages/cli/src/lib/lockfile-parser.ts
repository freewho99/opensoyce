// Minimal npm package-lock.json parser for CLI v0.
// Detects the format and extracts unique name@version tuples. Other lockfile
// formats (yarn-v1, pnpm-lock, uv.lock, poetry.lock) are reported as
// "not supported in CLI v0" with USAGE_ERROR. Format extension is its own
// future PR.
//
// This parser is intentionally narrow: it does NOT evaluate, score, or fetch
// OSV data. It only extracts entries the CLI then sends to the public gate
// API one at a time.

export type LockfileFormat =
  | 'npm-v1'
  | 'npm-v2'
  | 'npm-v3'
  | 'yarn-v1'
  | 'pnpm-lock'
  | 'uv-lock'
  | 'poetry-lock'
  | 'unknown';

export function detectFormat(text: string): LockfileFormat {
  if (typeof text !== 'string' || !text.trim()) return 'unknown';
  const t = text.trimStart();
  if (t.startsWith('# yarn lockfile v1')) return 'yarn-v1';
  if (!t.startsWith('{')) {
    if (/^lockfileVersion:\s*['"]?[0-9]+(?:\.[0-9]+)?['"]?\s*$/m.test(t)) {
      return 'pnpm-lock';
    }
    if (/^#.*Poetry/m.test(t)) return 'poetry-lock';
    if (/^#.*uv/m.test(t)) return 'uv-lock';
    return 'unknown';
  }
  try {
    const parsed = JSON.parse(t) as { lockfileVersion?: number };
    if (parsed.lockfileVersion === 1) return 'npm-v1';
    if (parsed.lockfileVersion === 2) return 'npm-v2';
    if (parsed.lockfileVersion === 3) return 'npm-v3';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export interface LockfileEntry {
  name: string;
  version: string;
}

interface NpmDependencyShape {
  version?: string;
  resolved?: string;
  integrity?: string;
  dependencies?: Record<string, NpmDependencyShape>;
}

interface NpmPackageShape {
  version?: string;
  resolved?: string;
  integrity?: string;
  name?: string;
}

interface NpmLockfileShape {
  lockfileVersion?: number;
  dependencies?: Record<string, NpmDependencyShape>;
  packages?: Record<string, NpmPackageShape>;
}

export function parseNpmLockfile(text: string): LockfileEntry[] {
  const parsed = JSON.parse(text) as NpmLockfileShape;
  const seen = new Map<string, LockfileEntry>();
  const add = (name: string, version: string | undefined) => {
    if (!name || !version) return;
    const key = `${name}@${version}`;
    if (!seen.has(key)) seen.set(key, { name, version });
  };

  if (parsed.packages) {
    for (const [path, info] of Object.entries(parsed.packages)) {
      if (!path) continue;
      const idx = path.lastIndexOf('node_modules/');
      if (idx === -1) continue;
      const name = path.slice(idx + 'node_modules/'.length);
      add(name, info.version);
    }
  }

  if (parsed.dependencies) {
    const walk = (deps: Record<string, NpmDependencyShape>) => {
      for (const [name, info] of Object.entries(deps)) {
        add(name, info.version);
        if (info.dependencies) walk(info.dependencies);
      }
    };
    walk(parsed.dependencies);
  }

  return Array.from(seen.values()).sort((a, b) =>
    a.name === b.name ? a.version.localeCompare(b.version) : a.name.localeCompare(b.name),
  );
}
