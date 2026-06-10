// PR-7A dependency-ingestion parsing.
//
// Turns one input file into a flat list of dependency entries the ingest
// command then sends to the EXISTING PR-6A create-exposure API, one record
// at a time. Three input shapes, detected by basename:
//
//   package.json        dependencies (prod) + devDependencies (dev);
//                       version is the DECLARED range, recorded as-is.
//   package-lock.json   npm lockfile v1/v2/v3; version is the RESOLVED
//                       version; dev flag read from the lockfile when
//                       present. Other lockfile formats are a usage error
//                       (same narrowness as the v0 lockfile command).
//   <anything>.json     the explicit PR-7A format:
//                       { "dependencies": [ { "name", "version", "dev"? } ] }
//
// DOCTRINE (PR-7A): ingestion observes. This module does NOT evaluate,
// score, fetch advisories, or decide anything. It extracts names and
// versions. Nothing more.

export interface DependencyEntry {
  name: string;
  version: string;
  dev: boolean;
}

export type ManifestKind = 'package.json' | 'package-lock.json' | 'explicit-json';

export interface ParsedDependencyFile {
  ok: true;
  manifestKind: ManifestKind;
  entries: DependencyEntry[];
}

export interface ParseFailure {
  ok: false;
  message: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function dedupeSort(entries: DependencyEntry[]): DependencyEntry[] {
  const seen = new Map<string, DependencyEntry>();
  for (const e of entries) {
    const key = `${e.name}@${e.version}`;
    if (!seen.has(key)) seen.set(key, e);
  }
  return Array.from(seen.values()).sort((a, b) =>
    a.name === b.name ? a.version.localeCompare(b.version) : a.name.localeCompare(b.name),
  );
}

function parsePackageJson(parsed: Record<string, unknown>): DependencyEntry[] {
  const out: DependencyEntry[] = [];
  const collect = (field: string, dev: boolean) => {
    const deps = parsed[field];
    if (!isRecord(deps)) return;
    for (const [name, version] of Object.entries(deps)) {
      if (typeof name === 'string' && name && typeof version === 'string' && version) {
        out.push({ name, version, dev });
      }
    }
  };
  collect('dependencies', false);
  collect('devDependencies', true);
  return dedupeSort(out);
}

interface LockPackageShape { version?: unknown; dev?: unknown }
interface LockDependencyShape { version?: unknown; dev?: unknown; dependencies?: unknown }

function parsePackageLock(parsed: Record<string, unknown>): DependencyEntry[] {
  const out: DependencyEntry[] = [];
  const add = (name: string, info: LockPackageShape) => {
    if (!name || typeof info.version !== 'string' || !info.version) return;
    out.push({ name, version: info.version, dev: info.dev === true });
  };
  // npm v2/v3: "packages" keyed by node_modules path.
  const packages = parsed['packages'];
  if (isRecord(packages)) {
    for (const [pkgPath, info] of Object.entries(packages)) {
      if (!pkgPath || !isRecord(info)) continue;
      const idx = pkgPath.lastIndexOf('node_modules/');
      if (idx === -1) continue;
      add(pkgPath.slice(idx + 'node_modules/'.length), info as LockPackageShape);
    }
  }
  // npm v1: nested "dependencies" tree.
  const walk = (deps: unknown) => {
    if (!isRecord(deps)) return;
    for (const [name, info] of Object.entries(deps)) {
      if (!isRecord(info)) continue;
      add(name, info as LockDependencyShape);
      walk((info as LockDependencyShape).dependencies);
    }
  };
  if (out.length === 0) walk(parsed['dependencies']);
  return dedupeSort(out);
}

function parseExplicit(parsed: Record<string, unknown>): DependencyEntry[] | null {
  const deps = parsed['dependencies'];
  if (!Array.isArray(deps)) return null;
  const out: DependencyEntry[] = [];
  for (const item of deps) {
    if (!isRecord(item)) return null;
    const name = item['name'];
    const version = item['version'];
    if (typeof name !== 'string' || !name || typeof version !== 'string' || !version) return null;
    out.push({ name, version, dev: item['dev'] === true });
  }
  return dedupeSort(out);
}

/**
 * Parse one dependency input file. `basename` decides the shape:
 * package.json and package-lock.json get their native parsers; any other
 * .json basename must be the explicit PR-7A format.
 */
export function parseDependencyFile(text: string, basename: string): ParsedDependencyFile | ParseFailure {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, message: `${basename} is not valid JSON.` };
  }
  if (!isRecord(parsed)) {
    return { ok: false, message: `${basename} must be a JSON object.` };
  }

  if (basename === 'package.json') {
    return { ok: true, manifestKind: 'package.json', entries: parsePackageJson(parsed) };
  }
  if (basename === 'package-lock.json') {
    const lv = parsed['lockfileVersion'];
    if (lv !== 1 && lv !== 2 && lv !== 3) {
      return { ok: false, message: 'Unsupported lockfile format. PR-7A supports npm package-lock.json v1/v2/v3 only.' };
    }
    return { ok: true, manifestKind: 'package-lock.json', entries: parsePackageLock(parsed) };
  }
  const explicit = parseExplicit(parsed);
  if (explicit === null) {
    return {
      ok: false,
      message: `${basename} is not the explicit ingest format: { "dependencies": [ { "name", "version", "dev"? } ] }.`,
    };
  }
  return { ok: true, manifestKind: 'explicit-json', entries: explicit };
}
