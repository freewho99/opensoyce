import React, { useMemo, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldAlert,
  ShieldCheck,
  Upload,
  Loader2,
  AlertTriangle,
  AlertCircle,
  FileWarning,
  ArrowUpRight,
  Package,
} from 'lucide-react';
import { summarizeScan } from '../shared/scanSummary.js';
import { computeRiskProfile } from '../shared/riskProfile.js';
import { buildMarkdownReport, buildJsonReport } from '../shared/buildScanReport.js';
import { isTrustedInstallScript } from '../data/trustedInstallScripts.js';

// Typo-squat homoglyph detection v0 — shape emitted by detectTypoSquat() in
// src/data/protectedPackageNames.js. Informational only; the chip never
// affects Risk Profile, score, or verdict band.
interface PossibleTypoSquat {
  matched: string;
  suspectedTarget: string;
}

// Dependency-confusion detection v0 — shape emitted by detectDepConfusion()
// + escalated in runScan. Informational only; the chip never affects Risk
// Profile, score, or verdict band. MEDIUM = static match on the user's
// .opensoyce-private file. HIGH = same + active public-registry confirmation.
interface DependencyConfusion {
  confidence: 'MEDIUM' | 'HIGH';
  reason: string;
  userComment: string | null;
}

// Model-weight loader posture v0 — shape emitted by getModelWeightLoader()
// in src/data/modelWeightLoaders.js. Posture recommendation only; never
// affects Risk Profile, score, or verdict band. 'safe' tier renders a
// green affirmation chip; 'load_pickle' / 'torch_load' render amber.
interface ModelWeightLoader {
  name: string;
  ecosystem: 'npm' | 'PyPI';
  risk: 'load_pickle' | 'torch_load' | 'safe';
  safer: string | null;
  reason: string;
}

// Cross-ecosystem bridge v0 — shape emitted by getCrossEcosystemBridge() in
// src/data/crossEcosystemBridges.js. Informational only — surfaces when a
// scanned package has a well-known sibling in the OTHER ecosystem (npm ↔
// PyPI). Never affects Risk Profile, composite score, or verdict band.
interface CrossEcosystemBridge {
  matched: string;
  sibling: string;
  siblingEcosystem: 'npm' | 'PyPI';
  reason: string;
}

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'unknown';
// Resolver v1 only emits HIGH/MEDIUM/NONE; LOW stays in the type for
// forward-compat with future inference logic in v2.1+.
type ResolverConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
type ResolverSource = 'npm.repository' | 'npm.homepage' | 'npm.bugs';

// Verdict labels match the canonical band set in src/shared/verdict.js.
type RepoVerdict =
  | 'USE READY'
  | 'FORKABLE'
  | 'HIGH MOMENTUM'
  | 'STABLE'
  | 'WATCHLIST'
  | 'RISKY'
  | 'STALE';

// Fork-velocity-of-namesake v0. Informational — never affects score / verdict.
interface RepoMigration {
  successor: { owner: string; repo: string } | null;
  migratedAt: string | null;
  reason: string;
  confidence: 'HIGH' | 'MEDIUM';
  source: 'curated' | 'fork-chain';
  successorStars?: number;
  successorPushedAt?: string;
}

interface RepoHealth {
  soyceScore: number;
  verdict: RepoVerdict;
  signals: {
    maintenance: number;
    security: number;
    activity: number;
  };
  // Fork-velocity-of-namesake v0 — null in the common case. When set, the
  // scanner row renders a small ⚠ MIGRATED chip linking to the successor.
  migration?: RepoMigration | null;
}

type RepoHealthError = 'IDENTITY_NONE' | 'ANALYSIS_FAILED';

interface Vulnerability {
  package: string;
  version: string;
  severity: Severity;
  ids: string[];
  summary: string;
  fixedIn?: string;
  // Identity fields added by the Dependency Identity Resolver. Absent on
  // older responses; render defensively.
  resolvedRepo?: string | null;
  confidence?: ResolverConfidence;
  source?: ResolverSource | null;
  directory?: string;
  // Borrowed-trust cross-check (P0-AI-2). `true` = GitHub package.json `name`
  // matched the npm package name. `false` = mismatch — a typo-squat is
  // inheriting an unrelated repo's Soyce score. `'unverified'` (string) =
  // cross-check not performed (e.g. GitHub fetch failed). Absent on
  // responses from servers older than May 2026.
  verified?: boolean | 'unverified';
  mismatchReason?: 'github_pkg_name_different' | 'github_root_pkg_missing';
  // Scanner v2.1a — repo health (paired with advisory severity per-row).
  // Mutually exclusive: when `repoHealth` is set, `repoHealthError` is null,
  // and vice versa. Both absent on responses from older servers — render
  // defensively (sub-block hidden).
  repoHealth?: RepoHealth | null;
  repoHealthError?: RepoHealthError | null;
  // Postinstall analysis v0 — populated by runScan from the matching
  // inventory record. Informational only; does not affect scoring or
  // verdict bands. Absent on responses from older servers — render
  // defensively (chip hidden).
  hasInstallScript?: boolean;
  // Typo-squat homoglyph detection v0 — populated by runScan from the
  // matching inventory record. Null when no homoglyph attack is suspected;
  // present (with suspectedTarget) when the package name's confusables
  // skeleton collides with a protected name AND the bytes differ.
  possibleTypoSquat?: PossibleTypoSquat | null;
  // Dependency-confusion detection v0 — populated by runScan when the
  // package name appears in the user's `.opensoyce-private` file.
  // Null when the package is not on the list (or the list is absent).
  dependencyConfusion?: DependencyConfusion | null;
  // Cross-ecosystem bridge v0 — populated by runScan when the package has a
  // well-known sibling in the other ecosystem (npm ↔ PyPI). Informational
  // only; chip points the user at the sibling so they remember to scan both.
  crossEcosystemBridge?: CrossEcosystemBridge | null;
  // Model-weight loader posture v0 — populated by runScan from the matching
  // inventory record. Posture recommendation only; does not affect scoring,
  // band, or Risk Profile.
  modelWeightLoader?: ModelWeightLoader | null;
}

// Scanner v3a -- whole-tree dependency inventory. Purely additive surface;
// older servers may omit it, so the UI must render defensively when null.
type InventoryScope = 'prod' | 'dev' | 'optional' | 'unknown';
type InventoryFormat = 'npm-v3' | 'npm-v2' | 'npm-v1' | 'yarn-v1' | 'unknown';

interface InventoryPackage {
  name: string;
  versions: string[];
  direct: boolean;
  scope: InventoryScope;
  hasLicense: boolean;
  hasRepository: boolean;
  // Postinstall analysis v0 — true when the lockfile flagged this package
  // with `hasInstallScript: true` (npm) or `requiresBuild: true` (pnpm).
  // Sticky across versions: ANY version having the flag flips the merged
  // record to true. Defaults false on older responses.
  hasInstallScript?: boolean;
  // Typo-squat homoglyph detection v0 — set when the package name's
  // confusables skeleton collides with a curated protected name AND the
  // names differ byte-for-byte (legitimate self-installs return null).
  possibleTypoSquat?: PossibleTypoSquat | null;
  // Dependency-confusion detection v0 — set when the package name appears
  // in the user's `.opensoyce-private` file.
  dependencyConfusion?: DependencyConfusion | null;
  // Cross-ecosystem bridge v0 — set when the package name appears in the
  // curated CROSS_ECOSYSTEM_BRIDGES list. Informational chip only.
  crossEcosystemBridge?: CrossEcosystemBridge | null;
  // Model-weight loader posture v0 — set when the package name appears in
  // the curated MODEL_WEIGHT_LOADERS list AND the ecosystem matches.
  modelWeightLoader?: ModelWeightLoader | null;
}

interface InventoryTotals {
  totalPackages: number;
  totalEntries: number;
  directCount: number;
  transitiveCount: number;
  prodCount: number;
  devCount: number;
  optionalCount: number;
  unknownScopeCount: number;
  duplicateCount: number;
  missingLicenseCount: number;
  missingRepositoryCount: number;
  // Postinstall analysis v0 — count of packages with hasInstallScript===true.
  // Absent on older server responses; render defensively.
  installScriptCount?: number;
  // Typo-squat homoglyph detection v0 — count of packages with a non-null
  // possibleTypoSquat. Absent on older server responses; render defensively.
  possibleTypoSquatCount?: number;
  // Dependency-confusion detection v0 — count of packages with a non-null
  // dependencyConfusion entry (MEDIUM or HIGH combined). Absent on older
  // server responses; render defensively.
  dependencyConfusionCount?: number;
  // Count of HIGH-confidence (active squat) hits within
  // dependencyConfusionCount above. Set only when the active probe ran.
  activeDependencyConfusionCount?: number;
  // Cross-ecosystem bridge v0 — count of packages with a non-null
  // crossEcosystemBridge entry. Absent on older server responses.
  crossEcosystemBridgeCount?: number;
  // Model-weight loader posture v0 — count of packages with a non-null
  // modelWeightLoader entry. Absent on older server responses.
  modelWeightLoaderCount?: number;
}

interface Inventory {
  format: InventoryFormat;
  packages: InventoryPackage[];
  totals: InventoryTotals;
}

// Scanner v3b -- Selected Dependency Health. Top-25 picker over the
// non-vulnerable inventory subset; each row carries its own status so the
// UI can render score / unresolved / unavailable copy without inferring
// a band from absence.
type SelectedHealthReason =
  | 'DIRECT_PROD'
  | 'DIRECT_DEV'
  | 'MULTI_VERSION'
  | 'IDENTITY_UNRESOLVED'
  | 'HIGH_FAN_IN';
type SelectedHealthStatus = 'SCORED' | 'IDENTITY_UNRESOLVED' | 'SCORE_UNAVAILABLE';

interface SelectedHealthRow {
  package: string;
  version: string;
  direct: boolean;
  scope: InventoryScope;
  primaryReason: SelectedHealthReason;
  secondaryReasons: SelectedHealthReason[];
  resolvedRepo: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'NONE';
  soyceScore: number | null;
  verdict: RepoVerdict | null;
  signals: { maintenance: number; security: number; activity: number } | null;
  status: SelectedHealthStatus;
  // Postinstall analysis v0 — copied from the matching inventory record.
  hasInstallScript?: boolean;
  // Typo-squat homoglyph detection v0 — copied from the matching inventory record.
  possibleTypoSquat?: PossibleTypoSquat | null;
  // Dependency-confusion detection v0 — copied from the matching inventory record.
  dependencyConfusion?: DependencyConfusion | null;
  // Cross-ecosystem bridge v0 — copied from the matching inventory record.
  crossEcosystemBridge?: CrossEcosystemBridge | null;
  // Model-weight loader posture v0 — copied from the matching inventory record.
  modelWeightLoader?: ModelWeightLoader | null;
  // Fork-velocity-of-namesake v0 — copied from the analysis result.
  migration?: RepoMigration | null;
}

interface SelectedHealth {
  scored: SelectedHealthRow[];
  skippedBudget: number;
  qualifyingTotal: number;
  budget: number;
}

interface ScanResponse {
  totalDeps: number;
  directDeps: number;
  vulnerabilities: Vulnerability[];
  scannedAt: string;
  cacheHit: boolean;
  inventory?: Inventory | null;
  inventoryError?: 'INVENTORY_FAILED';
  selectedHealth?: SelectedHealth | null;
  selectedHealthError?: 'SELECTED_HEALTH_FAILED';
}

type ApiErrorCode =
  | 'PACKAGE_JSON_NOT_SUPPORTED'
  | 'YARN_COMING_SOON'
  | 'UNPARSEABLE_LOCKFILE'
  | 'OSV_UNAVAILABLE'
  | 'TOO_LARGE'
  | 'UNKNOWN';

interface ScanErrorState {
  code: ApiErrorCode;
  message: string;
  /**
   * Critical UX flag — when true the error must NEVER render as a clean
   * "no vulnerabilities found" state. Currently set for OSV_UNAVAILABLE.
   */
  unsafeToInterpretAsClean: boolean;
}

const MAX_BYTES = 5 * 1024 * 1024; // 5MB

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'unknown'];

const SEVERITY_STYLES: Record<Severity, { pill: string; label: string }> = {
  critical: { pill: 'bg-soy-red text-white', label: 'CRITICAL' },
  high: { pill: 'bg-amber-500 text-black', label: 'HIGH' },
  medium: { pill: 'bg-yellow-500 text-black', label: 'MEDIUM' },
  low: { pill: 'bg-emerald-500 text-black', label: 'LOW' },
  unknown: { pill: 'bg-gray-400 text-black', label: 'UNKNOWN' },
};

function errorFromCode(code: string | undefined): ScanErrorState {
  switch (code) {
    case 'PACKAGE_JSON_NOT_SUPPORTED':
      return {
        code: 'PACKAGE_JSON_NOT_SUPPORTED',
        message:
          'Scanner v2 requires a lockfile. Run `npm install` to generate `package-lock.json`, then upload that.',
        unsafeToInterpretAsClean: false,
      };
    case 'YARN_COMING_SOON':
      return {
        code: 'YARN_COMING_SOON',
        message: 'Yarn support coming soon. Currently npm-only.',
        unsafeToInterpretAsClean: false,
      };
    case 'UNPARSEABLE_LOCKFILE':
      return {
        code: 'UNPARSEABLE_LOCKFILE',
        message: 'Could not parse the file as a npm lockfile.',
        unsafeToInterpretAsClean: false,
      };
    case 'OSV_UNAVAILABLE':
      return {
        code: 'OSV_UNAVAILABLE',
        message:
          "Advisory lookup unavailable — try again in a minute. We can't confirm whether your deps are safe.",
        unsafeToInterpretAsClean: true,
      };
    case 'TOO_LARGE':
      return {
        code: 'TOO_LARGE',
        message: 'File exceeds 5MB limit. Lockfiles for typical projects are 100KB–2MB.',
        unsafeToInterpretAsClean: false,
      };
    default:
      return {
        code: 'UNKNOWN',
        message: 'Something went wrong scanning that lockfile. Try again.',
        unsafeToInterpretAsClean: false,
      };
  }
}

function groupBySeverity(vulns: Vulnerability[]): Record<Severity, Vulnerability[]> {
  const out: Record<Severity, Vulnerability[]> = {
    critical: [],
    high: [],
    medium: [],
    low: [],
    unknown: [],
  };
  for (const v of vulns) {
    const sev = SEVERITY_ORDER.includes(v.severity) ? v.severity : 'unknown';
    out[sev].push(v);
  }
  return out;
}

export default function Scanner() {
  const [input, setInput] = useState('');
  const [filename, setFilename] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [errorState, setErrorState] = useState<ScanErrorState | null>(null);
  // Chip glossary modal (P1a — Wei + Marco grading-swarm finding). Tooltips on
  // chips exist via `title` attrs but aren't discoverable; a single ? trigger
  // in the page header opens an inventory of every chip + its trigger logic.
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setResult(null);
    setErrorState(null);
  };

  const handleFile = async (file: File) => {
    reset();
    if (file.size > MAX_BYTES) {
      setErrorState(errorFromCode('TOO_LARGE'));
      setFilename(file.name);
      return;
    }
    const text = await file.text();
    setInput(text);
    setFilename(file.name);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void handleFile(f);
    // Reset the input so re-selecting the same file works.
    e.target.value = '';
  };

  const onAnalyze = async () => {
    reset();
    const text = input.trim();
    if (!text) {
      setErrorState({
        code: 'UNKNOWN',
        message: 'Paste a package-lock.json or upload a file first.',
        unsafeToInterpretAsClean: false,
      });
      return;
    }

    // Client-side size guard — matches server limit so users get fast feedback.
    if (new Blob([text]).size > MAX_BYTES) {
      setErrorState(errorFromCode('TOO_LARGE'));
      return;
    }

    setScanning(true);
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lockfile: text, format: 'npm' }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data?.error) {
        setErrorState(errorFromCode(data?.error));
        setScanning(false);
        return;
      }

      setResult(data as ScanResponse);
    } catch {
      setErrorState({
        code: 'UNKNOWN',
        message: 'Network error reaching /api/scan. Check your connection and try again.',
        unsafeToInterpretAsClean: false,
      });
    } finally {
      setScanning(false);
    }
  };

  const grouped = result ? groupBySeverity(result.vulnerabilities) : null;
  const counts: Record<Severity, number> = grouped
    ? {
        critical: grouped.critical.length,
        high: grouped.high.length,
        medium: grouped.medium.length,
        low: grouped.low.length,
        unknown: grouped.unknown.length,
      }
    : { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };

  const totalVulns = result?.vulnerabilities.length ?? 0;

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="mb-12">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="inline-block bg-soy-red text-white text-[10px] font-black px-3 py-1 tracking-[0.4em] border-2 border-black">
            SCANNER v2
          </div>
          <button
            type="button"
            onClick={() => setGlossaryOpen(true)}
            title="Open chip glossary — what every scanner chip means"
            aria-label="Open chip glossary"
            className="shrink-0 inline-flex items-center gap-1.5 border-2 border-soy-bottle bg-white text-soy-bottle hover:bg-soy-bottle hover:text-white transition-colors px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em]"
          >
            <span className="font-black">?</span>
            <span>CHIP GLOSSARY</span>
          </button>
        </div>
        <h1 className="text-4xl md:text-5xl font-bold uppercase italic tracking-tighter mb-4">
          Find Known Vulnerabilities
        </h1>
        <p className="text-base md:text-xl font-medium opacity-60 max-w-3xl">
          Upload a <code className="bg-soy-bottle/10 px-1.5 py-0.5 font-mono text-sm">package-lock.json</code>{' '}
          to find known vulnerabilities hiding in your resolved dependency tree.
        </p>
      </div>
      {glossaryOpen && <ChipGlossaryModal onClose={() => setGlossaryOpen(false)} />}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Form column */}
        <div className="lg:col-span-12">
          <div className="bg-white border-4 border-soy-bottle p-6 md:p-8 shadow-[8px_8px_0px_#000]">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
              <div className="flex items-center gap-3">
                <Package className="text-soy-red" size={28} />
                <h2 className="text-xl md:text-2xl font-bold uppercase italic tracking-tight">
                  Lockfile Input
                </h2>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 bg-soy-label/40 hover:bg-soy-label border-2 border-soy-bottle px-4 py-2 text-[11px] font-black uppercase tracking-widest"
                >
                  <Upload size={14} />
                  Upload package-lock.json
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={onFileChange}
                  className="hidden"
                />
                {filename && (
                  <span className="text-[10px] font-mono opacity-60 break-all">{filename}</span>
                )}
              </div>
            </div>

            <label className="block text-[10px] font-black uppercase tracking-widest opacity-40 mb-2">
              Paste lockfile contents OR upload above
            </label>
            <textarea
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (errorState) setErrorState(null);
              }}
              placeholder='{ "name": "my-app", "lockfileVersion": 3, "packages": { ... } }'
              rows={10}
              spellCheck={false}
              className="w-full bg-soy-label/20 border-4 border-soy-bottle p-4 font-mono text-xs md:text-sm outline-none focus:bg-white resize-y"
            />

            <div className="mt-2 flex items-center justify-between text-[10px] font-black uppercase tracking-widest opacity-40">
              <span>NPM ONLY · 5MB MAX</span>
              <span>{input ? `${(new Blob([input]).size / 1024).toFixed(0)} KB` : '0 KB'}</span>
            </div>

            <button
              type="button"
              onClick={onAnalyze}
              disabled={scanning}
              className="mt-6 w-full bg-soy-bottle text-soy-label py-5 text-lg md:text-xl font-bold uppercase tracking-widest hover:bg-soy-red transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {scanning ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  Scanning…
                </>
              ) : (
                <>
                  <ShieldAlert size={20} />
                  Analyze Lockfile
                </>
              )}
            </button>
          </div>

          {/* Error states — sit outside the form card so they're impossible to miss */}
          {errorState && <ErrorBanner state={errorState} />}

          {/* Loading state */}
          {scanning && !errorState && (
            <div className="mt-6 bg-soy-bottle text-white p-6 border-4 border-black flex items-center gap-4 shadow-[6px_6px_0px_#E63322]">
              <Loader2 className="animate-spin shrink-0" size={28} />
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.4em] opacity-60 mb-1">
                  WORKING
                </div>
                <div className="text-lg md:text-xl font-black uppercase italic tracking-tight">
                  Scanning dependencies against OSV…
                </div>
              </div>
            </div>
          )}

          {/* Results */}
          {result && !errorState && (
            <ResultsPanel result={result} counts={counts} totalVulns={totalVulns} grouped={grouped!} />
          )}
        </div>
      </div>
    </div>
  );
}

function ErrorBanner({ state }: { state: ScanErrorState }) {
  // OSV_UNAVAILABLE gets the loudest possible treatment: red border, alert
  // icon, and explicit "we cannot confirm safety" copy. This must never look
  // like a clean / safe result.
  const isCritical = state.unsafeToInterpretAsClean;
  const Icon = isCritical ? AlertTriangle : state.code === 'TOO_LARGE' ? FileWarning : AlertCircle;

  return (
    <div
      role="alert"
      className={`mt-6 border-4 p-6 md:p-8 flex flex-col md:flex-row items-start gap-4 ${
        isCritical
          ? 'bg-soy-red text-white border-black shadow-[8px_8px_0px_#000]'
          : 'bg-white border-soy-red text-soy-red'
      }`}
    >
      <Icon size={32} className="shrink-0 mt-1" />
      <div className="flex-1">
        <div
          className={`text-[10px] font-black uppercase tracking-[0.4em] mb-2 ${
            isCritical ? 'opacity-80' : 'opacity-60'
          }`}
        >
          {isCritical ? 'CANNOT CONFIRM SAFETY' : 'SCAN BLOCKED'}
        </div>
        <p
          className={`text-lg md:text-2xl font-black uppercase italic tracking-tight leading-tight ${
            isCritical ? '' : 'text-soy-bottle'
          }`}
        >
          {state.message}
        </p>
        {isCritical && (
          <p className="mt-3 text-xs md:text-sm font-bold uppercase tracking-widest opacity-80">
            This is NOT a clean result — it means our advisory source didn't respond. Re-run the scan
            before trusting these dependencies.
          </p>
        )}
      </div>
    </div>
  );
}

function ResultsPanel({
  result,
  counts,
  totalVulns,
  grouped,
}: {
  result: ScanResponse;
  counts: Record<Severity, number>;
  totalVulns: number;
  grouped: Record<Severity, Vulnerability[]>;
}) {
  const clean = totalVulns === 0;
  // Scanner v2.1b — interpretation panel. Pure summary, derived from the same
  // vulnerabilities array the per-row list iterates. Memoized only because the
  // panel rerenders on every Scanner state change and the math touches every
  // row; correctness does not depend on the memo.
  const summary = useMemo(() => summarizeScan(result.vulnerabilities), [result.vulnerabilities]);

  return (
    <div className="mt-8">
      {/* Top summary row */}
      <div className="bg-soy-bottle text-white border-4 border-black p-6 md:p-8 mb-6 shadow-[8px_8px_0px_#E63322]">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.4em] opacity-60 mb-1">
              SCAN SUMMARY {result.cacheHit && <span className="opacity-50">· CACHED</span>}
            </div>
            <div className="text-2xl md:text-4xl font-black uppercase italic tracking-tighter leading-none">
              {result.totalDeps.toLocaleString()} DEPS · {result.directDeps.toLocaleString()} DIRECT
            </div>
          </div>
          <div className="text-[10px] font-mono opacity-60">
            {new Date(result.scannedAt).toLocaleString()}
          </div>
        </div>

        {/* Severity counts */}
        {!clean && (
          <div className="mt-6 flex flex-wrap gap-2">
            {SEVERITY_ORDER.filter((s) => counts[s] > 0).map((s) => (
              <span
                key={s}
                className={`px-3 py-1.5 text-[11px] font-black uppercase tracking-widest border-2 border-black ${SEVERITY_STYLES[s].pill}`}
              >
                {SEVERITY_STYLES[s].label}: {counts[s]}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* v2.1b judgement panel — sits above the vuln list, below the input. */}
      <ScanSummaryPanel summary={summary} />

      {/* v3c risk profile panel — interpretation layer over evidence the
          earlier passes already produced. No new fetches. Sits between the
          v2.1b judgement and the vuln rows so the page reads top-to-bottom
          as decision → shape → detail. */}
      <RiskProfilePanel result={result} />

      {clean ? (
        <div className="bg-emerald-500 text-black border-4 border-black p-6 md:p-8 flex items-start gap-4 shadow-[8px_8px_0px_#000]">
          <ShieldCheck size={36} className="shrink-0 mt-1" />
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.4em] opacity-70 mb-1">
              CLEAN SCAN
            </div>
            <p className="text-xl md:text-3xl font-black uppercase italic tracking-tight leading-tight">
              No known vulnerabilities in {result.totalDeps.toLocaleString()} dependencies.
            </p>
            <p className="mt-2 text-xs md:text-sm font-bold uppercase tracking-widest opacity-70">
              Based on OSV data at scan time. New advisories appear every day — re-scan before releases.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {SEVERITY_ORDER.flatMap((sev) =>
            grouped[sev].map((v, i) => (
              <div key={`${sev}-${i}-${v.package}`}>
                <VulnRow v={v} />
              </div>
            )),
          )}
        </div>
      )}

      {/* Scanner v3b -- Selected Dependency Health. Sits between the vuln
          list and the v3a inventory. Renders the top-25 non-vulnerable
          candidates with their own scored / unresolved / unavailable copy.
          Older servers may not return `selectedHealth`; we render defensively. */}
      {result.selectedHealth && (
        <SelectedHealthPanel data={result.selectedHealth} />
      )}
      {!result.selectedHealth && result.selectedHealthError && (
        <div className="mt-6 bg-soy-label/20 border-4 border-soy-bottle/30 p-4 text-[11px] font-black uppercase tracking-widest text-soy-bottle/70">
          Selected dependency health unavailable for this scan -- analysis still completed.
        </div>
      )}

      {/* Scanner v3a -- Dependency Inventory. Renders below the vuln list.
          Only repo-health data already gathered on vulnerable rows feeds the
          identity chip here; we do NOT fetch identity for non-vulnerable
          packages. */}
      {result.inventory && (
        <InventoryPanel
          inventory={result.inventory}
          vulnerabilities={result.vulnerabilities}
        />
      )}
      {!result.inventory && result.inventoryError && (
        <div className="mt-6 bg-soy-label/20 border-4 border-soy-bottle/30 p-4 text-[11px] font-black uppercase tracking-widest text-soy-bottle/70">
          Inventory unavailable for this scan -- analysis still completed.
        </div>
      )}
    </div>
  );
}

// Scanner v3a -- Dependency Inventory section.
//
// Honesty constraints baked into the copy:
//   - Subhead must say "Whole-tree inventory is available. Whole-tree Soyce
//     scoring is coming later." Both halves are mandatory.
//   - Identity / repo-health chips only appear if v2.1a already gathered the
//     data on a vulnerable row. Non-vulnerable rows never trigger a fetch.
//   - `unknown` scope is a real, visible label -- never coerced to prod.
//
// Renderer is a hand-rolled virtualized list: fixed row height, sentinel
// spacers preserve scrollbar position, overscan smooths fast scrolling.
// No new npm deps.

const ROW_HEIGHT = 44;
const VIEWPORT_HEIGHT = 480;
const OVERSCAN = 5;

type IdentityChip = { kind: 'resolved' | 'unresolved' };

function InventoryPanel({
  inventory,
  vulnerabilities,
}: {
  inventory: Inventory;
  vulnerabilities: Vulnerability[];
}) {
  const [filter, setFilter] = useState('');
  const [duplicatesFirst, setDuplicatesFirst] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [scrollTop, setScrollTop] = useState(0);

  // Index vulnerabilities by package name so inventory rows can light up the
  // vuln + identity chips. We use the WORST severity if the same package
  // has multiple advisories. Identity is "resolved" iff the vuln row carried
  // a HIGH/MEDIUM resolvedRepo (v2.1a behavior, already on the wire).
  const vulnIndex = useMemo(() => {
    const map = new Map<
      string,
      { severity: Severity; identity: IdentityChip | null }
    >();
    for (const v of vulnerabilities || []) {
      const sev: Severity = SEVERITY_ORDER.includes(v.severity) ? v.severity : 'unknown';
      const prev = map.get(v.package);
      const worse =
        !prev || severityRank(sev) < severityRank(prev.severity) ? sev : prev.severity;
      let identity: IdentityChip | null = prev?.identity ?? null;
      const hasResolved =
        !!v.resolvedRepo && (v.confidence === 'HIGH' || v.confidence === 'MEDIUM');
      if (hasResolved) identity = { kind: 'resolved' };
      else if (!identity && v.confidence === 'NONE') identity = { kind: 'unresolved' };
      map.set(v.package, { severity: worse, identity });
    }
    return map;
  }, [vulnerabilities]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let list = inventory.packages;
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q));
    // Sort by name ascending by default. Duplicates-first re-orders so that
    // packages with >1 version sit at the top while preserving alphabetical
    // order within each bucket.
    if (duplicatesFirst) {
      list = [...list].sort((a, b) => {
        const da = a.versions.length > 1 ? 0 : 1;
        const db = b.versions.length > 1 ? 0 : 1;
        if (da !== db) return da - db;
        return a.name.localeCompare(b.name);
      });
    } else {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    }
    return list;
  }, [inventory.packages, filter, duplicatesFirst]);

  const totalCount = filtered.length;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(
    totalCount,
    Math.ceil((scrollTop + VIEWPORT_HEIGHT) / ROW_HEIGHT) + OVERSCAN,
  );
  const visible = filtered.slice(startIndex, endIndex);
  const topSpacer = startIndex * ROW_HEIGHT;
  const bottomSpacer = (totalCount - endIndex) * ROW_HEIGHT;

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const toggleExpand = useCallback((name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const isYarn = inventory.format === 'yarn-v1';
  const { totals } = inventory;

  return (
    <div className="mt-8 bg-white border-4 border-soy-bottle p-6 md:p-8 shadow-[8px_8px_0px_#000]">
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-xl md:text-2xl font-bold uppercase italic tracking-tight">
          Dependency Inventory
        </h3>
        <p className="mt-1 text-[11px] md:text-xs font-bold uppercase tracking-widest text-soy-bottle/60">
          Whole-tree inventory is available. Whole-tree Soyce scoring is coming later.
        </p>
      </div>

      {/* Stat strip */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4 pb-4 border-b-2 border-soy-bottle/10 text-[11px] font-black uppercase tracking-widest">
        <div className="text-soy-bottle">
          <span className="opacity-50">TOTAL</span>{' '}
          <span>{totals.totalPackages.toLocaleString()}</span>
        </div>
        {!isYarn && (totals.directCount > 0 || totals.transitiveCount > 0) && (
          <div className="text-soy-bottle">
            <span className="opacity-50">DIRECT</span>{' '}
            <span>{totals.directCount}</span>
            <span className="mx-1 opacity-30">/</span>
            <span className="opacity-50">TRANS</span>{' '}
            <span>{totals.transitiveCount}</span>
          </div>
        )}
        {!isYarn && (
          <div className="flex flex-wrap gap-1.5">
            {totals.prodCount > 0 && (
              <span className="bg-emerald-500 text-black px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border-2 border-black">
                PROD: {totals.prodCount}
              </span>
            )}
            {totals.devCount > 0 && (
              <span className="bg-soy-label text-soy-bottle px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border-2 border-soy-bottle">
                DEV: {totals.devCount}
              </span>
            )}
            {totals.optionalCount > 0 && (
              <span className="bg-amber-500 text-black px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border-2 border-black">
                OPT: {totals.optionalCount}
              </span>
            )}
            {totals.unknownScopeCount > 0 && (
              <span className="bg-gray-400 text-black px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border-2 border-black">
                UNKNOWN: {totals.unknownScopeCount}
              </span>
            )}
          </div>
        )}
        {totals.duplicateCount > 0 && (
          <div className="text-soy-bottle">
            <span className="opacity-50">DUPES</span>{' '}
            <span>{totals.duplicateCount}</span>
          </div>
        )}
        <div className="text-soy-bottle">
          <span className="opacity-50">MISSING LICENSE</span>{' '}
          <span>{totals.missingLicenseCount}</span>
          <span className="mx-1 opacity-30">/</span>
          <span className="opacity-50">REPO</span>{' '}
          <span>{totals.missingRepositoryCount}</span>
        </div>
      </div>

      {isYarn && (
        <div className="mb-4 bg-soy-label/30 border-2 border-soy-bottle/30 px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-soy-bottle/70">
          Yarn lockfiles provide limited metadata; install scope and direct/transitive may be unavailable.
        </div>
      )}

      {/* Filter + duplicates toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by package name..."
          className="flex-1 bg-soy-label/20 border-2 border-soy-bottle px-3 py-2 font-mono text-xs md:text-sm outline-none focus:bg-white"
        />
        <label className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-soy-bottle cursor-pointer select-none">
          <input
            type="checkbox"
            checked={duplicatesFirst}
            onChange={(e) => setDuplicatesFirst(e.target.checked)}
            className="accent-soy-red"
          />
          Show duplicates first
        </label>
      </div>

      <div className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-2">
        Showing {totalCount.toLocaleString()} of {totals.totalPackages.toLocaleString()} packages
      </div>

      {/* Virtualized list -- hand-rolled, no new deps. */}
      <div
        onScroll={onScroll}
        className="border-2 border-soy-bottle/30 overflow-y-auto bg-soy-label/10"
        style={{ height: VIEWPORT_HEIGHT }}
      >
        <div style={{ height: topSpacer }} />
        {visible.map((p: InventoryPackage) => {
          const vulnInfo: InventoryRowProps['vulnInfo'] = vulnIndex.get(p.name) ?? null;
          const isExpanded: boolean = expanded.has(p.name);
          const onToggleFn: () => void = () => toggleExpand(p.name);
          // Wrap in keyed div -- this file's existing convention is to put
          // `key` on a plain DOM element rather than the custom component,
          // since the TS JSX inference for custom function components in
          // this project does not surface React's special `key` slot.
          return (
            <div key={p.name}>
              <InventoryRow
                pkg={p}
                vulnInfo={vulnInfo}
                expanded={isExpanded}
                onToggle={onToggleFn}
              />
            </div>
          );
        })}
        <div style={{ height: bottomSpacer }} />
      </div>
    </div>
  );
}

// Scanner v3b -- Selected Dependency Health panel.
//
// Honesty constraints baked into the copy:
//   - Subtitle MUST contain "intentionally limited" + name the reason
//     (scan speed and API budget). We never imply we scored the whole tree.
//   - IDENTITY_UNRESOLVED rows show the literal "identity unresolved" line --
//     no score number, no inferred band. This is a review signal, not a verdict.
//   - SCORE_UNAVAILABLE rows say "score unavailable -- analysis failed" --
//     also no inferred band.
//   - Skipped-budget chip is a single line at the bottom; no row-by-row
//     listing of who didn't make the cut, no "score more" button.
const REASON_LABEL: Record<SelectedHealthReason, string> = {
  DIRECT_PROD: 'DIRECT PROD',
  DIRECT_DEV: 'DIRECT DEV',
  MULTI_VERSION: 'MULTI VERSION',
  IDENTITY_UNRESOLVED: 'NO REPO FIELD',
  HIGH_FAN_IN: 'HIGH FAN-IN',
};

function SelectedHealthPanel({ data }: { data: SelectedHealth }) {
  const { scored, skippedBudget, qualifyingTotal, budget } = data;
  return (
    <div className="mt-8 bg-white border-4 border-soy-bottle p-6 md:p-8 shadow-[8px_8px_0px_#000]">
      <div className="mb-4">
        <h3 className="text-xl md:text-2xl font-bold uppercase italic tracking-tight">
          Selected Dependency Health
        </h3>
        <p className="mt-1 text-[11px] md:text-xs font-bold uppercase tracking-widest text-soy-bottle/60">
          OpenSoyce scored the dependencies most likely to affect adoption risk.
          Full-tree scoring is intentionally limited to protect scan speed and API budget.
        </p>
      </div>

      {/* Stat strip. "SCORED" counts only rows whose status is actually
          SCORED; rows that resolved identity but failed analysis show up
          as SCORE UNAVAILABLE and must not inflate the success count. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4 pb-4 border-b-2 border-soy-bottle/10 text-[11px] font-black uppercase tracking-widest">
        <div className="text-soy-bottle">
          <span>{scored.filter(r => r.status === 'SCORED').length}</span>{' '}
          <span className="opacity-50">SCORED</span>
          <span className="mx-1 opacity-30">/</span>
          <span>{qualifyingTotal}</span>{' '}
          <span className="opacity-50">QUALIFYING</span>
        </div>
        <span className="bg-soy-label text-soy-bottle border-2 border-soy-bottle px-2 py-0.5 text-[10px] font-black uppercase tracking-widest">
          BUDGET {budget}
        </span>
      </div>

      {scored.length === 0 ? (
        <div className="bg-soy-label/20 border-2 border-soy-bottle/20 px-3 py-3 text-[11px] font-bold uppercase tracking-widest text-soy-bottle/60">
          No candidates qualified for scoring. Vulnerable rows are scored separately above.
        </div>
      ) : (
        <ul className="space-y-2">
          {scored.map((row) => (
            <li key={`${row.package}@${row.version}`}>
              <SelectedHealthRowView row={row} />
            </li>
          ))}
        </ul>
      )}

      {skippedBudget > 0 && (
        <div className="mt-4 pt-4 border-t-2 border-soy-bottle/10">
          <span className="bg-soy-label/40 text-soy-bottle border-2 border-soy-bottle/40 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest">
            {skippedBudget} MORE CANDIDATES NOT SCORED (BUDGET {budget})
          </span>
        </div>
      )}
    </div>
  );
}

function SelectedHealthRowView({ row }: { row: SelectedHealthRow }) {
  // Reuse the existing VERDICT_CHIP map -- do NOT duplicate verdictFor or
  // its band colors. Status-driven rendering: SCORED uses verdict + score,
  // IDENTITY_UNRESOLVED uses literal copy, SCORE_UNAVAILABLE uses its own copy.
  const verdictChipClass =
    row.status === 'SCORED' && row.verdict ? VERDICT_CHIP[row.verdict] : null;

  return (
    <div className="bg-soy-label/10 border-2 border-soy-bottle/20 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs md:text-sm font-bold text-soy-bottle break-all">
          {row.package}
        </span>
        <span className="font-mono text-[11px] opacity-60">@ {row.version || '—'}</span>
        <span
          className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border-2 border-black ${
            row.direct
              ? 'bg-soy-bottle text-white'
              : 'bg-soy-label/40 text-soy-bottle border-soy-bottle/40'
          }`}
        >
          {row.direct ? 'DIRECT' : 'TRANS'}
        </span>
        <span
          className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border-2 border-black ${SCOPE_CHIP[row.scope]}`}
        >
          {SCOPE_LABEL[row.scope]}
        </span>
        <span className="bg-soy-label text-soy-bottle border-2 border-soy-bottle px-2 py-0.5 text-[10px] font-black uppercase tracking-widest">
          {REASON_LABEL[row.primaryReason] || row.primaryReason}
        </span>
        {row.secondaryReasons.length > 0 && (
          <span className="text-[10px] font-bold uppercase tracking-widest text-soy-bottle/50">
            + {row.secondaryReasons.map(r => REASON_LABEL[r] || r).join(' / ')}
          </span>
        )}
        {/* Postinstall analysis v0 — same suppression rules as elsewhere. */}
        <InstallScriptChip name={row.package} hasInstallScript={row.hasInstallScript} />
        {/* Typo-squat homoglyph v0 — same suppression rules as elsewhere. */}
        <TypoSquatChip typoSquat={row.possibleTypoSquat} />
        {/* Dependency-confusion v0 — fires only for names in the user's
            `.opensoyce-private` file. MEDIUM static; HIGH after active check. */}
        <DepConfusionChip dependencyConfusion={row.dependencyConfusion} />
        {/* Cross-ecosystem bridge v0 — informational chip; sky blue (not
            amber/red) because it's a "scan the other ecosystem too" reminder,
            not a severity warning. */}
        <CrossEcosystemBridgeChip bridge={row.crossEcosystemBridge} />
        {/* Model-weight loader posture v0 — informational chip; AMBER for
            pickle-loading packages, GREEN for safer formats (safetensors,
            ONNX). Never affects score, band, or Risk Profile. */}
        <ModelWeightChip loader={row.modelWeightLoader} />
      </div>

      {/* Status zone -- separate row so the copy / chips never collide with
          the metadata above. Each branch is mutually exclusive. */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {row.status === 'SCORED' && row.soyceScore !== null && row.verdict && (
          <>
            {row.resolvedRepo && (
              <a
                href={`https://github.com/${row.resolvedRepo}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[11px] text-soy-red hover:text-soy-bottle break-all"
              >
                {row.resolvedRepo}
              </a>
            )}
            <span
              className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border-2 border-black ${verdictChipClass || 'bg-soy-label text-black'}`}
            >
              REPO: {row.verdict}
            </span>
            <span className="font-mono text-[11px] font-bold tracking-tight text-soy-bottle">
              Soyce {row.soyceScore.toFixed(1)}
            </span>
            {row.signals && (
              <span className="font-mono italic text-[10px] tracking-tight opacity-60">
                Maint {row.signals.maintenance.toFixed(1)} / Sec {row.signals.security.toFixed(1)} / Act {row.signals.activity.toFixed(1)}
              </span>
            )}
            {/* Fork-velocity-of-namesake v0 — same chip surface as the
                per-vuln row block above. */}
            <MigrationChip migration={row.migration ?? null} />
          </>
        )}
        {row.status === 'IDENTITY_UNRESOLVED' && (
          <span className="text-[11px] font-bold uppercase tracking-widest text-soy-bottle/60">
            identity unresolved -- OpenSoyce cannot verify source health
          </span>
        )}
        {row.status === 'SCORE_UNAVAILABLE' && (
          <span className="text-[11px] font-bold uppercase tracking-widest text-soy-bottle/60 flex items-center gap-2">
            <AlertCircle size={12} className="shrink-0" />
            score unavailable -- analysis failed
          </span>
        )}
      </div>
    </div>
  );
}

const SCOPE_CHIP: Record<InventoryScope, string> = {
  prod: 'bg-emerald-500 text-black',
  dev: 'bg-soy-label text-soy-bottle border-soy-bottle',
  optional: 'bg-amber-500 text-black',
  unknown: 'bg-gray-400 text-black',
};

const SCOPE_LABEL: Record<InventoryScope, string> = {
  prod: 'PROD',
  dev: 'DEV',
  optional: 'OPT',
  unknown: 'UNKNOWN',
};

function severityRank(s: Severity): number {
  return SEVERITY_ORDER.indexOf(s);
}

// Postinstall analysis v0 — informational chip surfaced on inventory rows,
// vuln rows, and v3b selected-health rows. Suppressed for curated trusted
// packages (TypeScript, esbuild, sharp, husky, etc.). The chip never
// contributes to the Risk Profile or composite score; it's a heads-up only.
const INSTALL_SCRIPT_TOOLTIP =
  'This package runs install scripts on `npm install` — install scripts can execute arbitrary code. Verify the package is trustworthy.';

function InstallScriptChip({ name, hasInstallScript }: { name: string; hasInstallScript: boolean | undefined }) {
  if (!hasInstallScript) return null;
  if (isTrustedInstallScript(name)) return null;
  return (
    <span
      title={INSTALL_SCRIPT_TOOLTIP}
      className="px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border-2 border-black bg-amber-300 text-black"
    >
      ⚠ INSTALL SCRIPT
    </span>
  );
}

// Typo-squat homoglyph detection v0 — informational chip. Surfaces when the
// scanned package name's confusables skeleton matches a curated protected
// name AND the byte sequences differ (the legitimate-install self-match is
// suppressed inside detectTypoSquat()). The chip never contributes to the
// Risk Profile or composite score.
function TypoSquatChip({ typoSquat }: { typoSquat: PossibleTypoSquat | null | undefined }) {
  if (!typoSquat) return null;
  const tooltip = `Package name uses characters that visually resemble "${typoSquat.suspectedTarget}". This could be a typo-squat attack — verify the package is the one you intended.`;
  return (
    <span
      title={tooltip}
      className="px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border-2 border-black bg-amber-500 text-black"
    >
      ⚠ POSSIBLE TYPO-SQUAT
    </span>
  );
}

// Dependency-confusion v0. Surfaces when the package name appears in the
// user's `.opensoyce-private` list. MEDIUM = static match. HIGH = static
// match plus the public registry returned 200 for that name (active squat).
// The chip is informational only — no score / band / Risk Profile impact.
// The user's own trailing `# comment` from the file (when present) is
// appended to the tooltip in parentheses so the team's annotation travels
// with the warning.
function DepConfusionChip({ dependencyConfusion }: { dependencyConfusion: DependencyConfusion | null | undefined }) {
  if (!dependencyConfusion) return null;
  const isActive = dependencyConfusion.confidence === 'HIGH';
  const tooltip = `${dependencyConfusion.reason}${dependencyConfusion.userComment ? ` (${dependencyConfusion.userComment})` : ''}`;
  return (
    <span
      title={tooltip}
      className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border-2 border-black ${
        isActive ? 'bg-red-500 text-white' : 'bg-amber-500 text-black'
      }`}
    >
      {isActive ? '⚠ ACTIVE DEP CONFUSION' : '⚠ POSSIBLE DEP CONFUSION'}
    </span>
  );
}

// Model-weight loader posture v0 — informational chip surfaced when the
// inventory contains a known model-loading package (huggingface_hub,
// transformers, torch, …). The chip is a POSTURE recommendation, not an
// RCE detector — we do NOT inspect actual model files. Three tiers:
//   load_pickle / torch_load → AMBER chip recommending safetensors
//   safe                     → GREEN affirmation chip
// Never affects Risk Profile, composite score, or verdict band.
function ModelWeightChip({ loader }: { loader: ModelWeightLoader | null | undefined }) {
  if (!loader) return null;
  const isSafe = loader.risk === 'safe';
  const isTorch = loader.risk === 'torch_load';
  const saferText = loader.safer ? ` Prefer ${loader.safer}.` : '';
  const tooltip = isSafe
    ? `${loader.reason} (using safer model-weight format).`
    : `${loader.reason}.${saferText} Posture recommendation — OpenSoyce does not scan model files.`;
  const label = isSafe
    ? '✓ SAFE MODEL FORMAT'
    : isTorch
      ? '⚠ TORCH.LOAD: USE SAFETENSORS'
      : '⚠ USE SAFETENSORS';
  return (
    <span
      title={tooltip}
      className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border-2 border-black ${
        isSafe ? 'bg-emerald-500 text-black' : 'bg-amber-300 text-black'
      }`}
    >
      {label}
    </span>
  );
}

// Cross-ecosystem bridge v0 — informational chip surfaced when the inventory
// contains a package that has a well-known sibling in the OTHER ecosystem
// (npm ↔ PyPI). The chip's job is "did you scan the other side too?" — it
// is NOT a security-severity warning. Distinct sky/cyan color so users can
// visually distinguish it from the amber/red squat-class chips. Never
// affects Risk Profile, composite score, or verdict band.
function CrossEcosystemBridgeChip({ bridge }: { bridge: CrossEcosystemBridge | null | undefined }) {
  if (!bridge) return null;
  const tooltip = `This package has a sibling in ${bridge.siblingEcosystem}: ${bridge.sibling}. ${bridge.reason}. Verify both ecosystems are scanned when assessing supply-chain risk.`;
  return (
    <span
      title={tooltip}
      className="px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border-2 border-black bg-sky-500 text-black"
    >
      ⚠ CROSS-ECOSYSTEM BRIDGE
    </span>
  );
}

interface InventoryRowProps {
  pkg: InventoryPackage;
  vulnInfo: { severity: Severity; identity: IdentityChip | null } | null;
  expanded: boolean;
  onToggle: () => void;
}

function InventoryRow({ pkg, vulnInfo, expanded, onToggle }: InventoryRowProps) {
  const multi = pkg.versions.length > 1;
  const sevStyle = vulnInfo ? SEVERITY_STYLES[vulnInfo.severity] : null;

  // Expanded rows render outside the fixed row band; we use a wrapper so
  // the virtualization math (which assumes ROW_HEIGHT per row) still works
  // -- the wrapper height stays ROW_HEIGHT, expansion floats below with
  // absolute positioning collapsed back to inline-flow by removing the
  // overflow constraint at the container. Simpler: when expanded, we
  // render the extra detail INLINE and accept a slight scroll-position
  // drift; spec allows this since the click is user-initiated.
  return (
    <div
      className="bg-white border-b border-soy-bottle/10 px-3 hover:bg-soy-label/20"
      style={{ minHeight: ROW_HEIGHT }}
    >
      <div className="flex items-center gap-2 flex-wrap" style={{ height: ROW_HEIGHT }}>
        <span className="font-mono text-xs md:text-sm font-bold text-soy-bottle break-all flex-1 min-w-0 truncate">
          {pkg.name}
        </span>
        {multi ? (
          <button
            type="button"
            onClick={onToggle}
            className="bg-soy-red text-white px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border-2 border-black hover:bg-soy-bottle"
          >
            {pkg.versions.length} VERSIONS {expanded ? '−' : '+'}
          </button>
        ) : (
          <span className="font-mono text-[11px] opacity-60">{pkg.versions[0] || '—'}</span>
        )}
        <span
          className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border-2 border-black ${
            pkg.direct ? 'bg-soy-bottle text-white' : 'bg-soy-label/40 text-soy-bottle border-soy-bottle/40'
          }`}
        >
          {pkg.direct ? 'DIRECT' : 'TRANS'}
        </span>
        <span
          className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border-2 border-black ${SCOPE_CHIP[pkg.scope]}`}
        >
          {SCOPE_LABEL[pkg.scope]}
        </span>
        {sevStyle && (
          <span
            className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border-2 border-black ${sevStyle.pill}`}
          >
            VULN: {sevStyle.label}
          </span>
        )}
        {/* Identity chip only when v2.1a already resolved it for free on a
            vulnerable row. We do NOT fetch identity for non-vulnerable
            packages in v3a. */}
        {vulnInfo?.identity?.kind === 'resolved' && (
          <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border-2 border-black bg-emerald-500 text-black">
            REPO RESOLVED
          </span>
        )}
        {vulnInfo?.identity?.kind === 'unresolved' && (
          <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border-2 border-black bg-gray-400 text-black">
            REPO UNRESOLVED
          </span>
        )}
        {/* Postinstall analysis v0 — informational only; suppressed for
            curated trusted packages (TypeScript, esbuild, sharp, etc.). */}
        <InstallScriptChip name={pkg.name} hasInstallScript={pkg.hasInstallScript} />
        {/* Typo-squat homoglyph v0 — informational only; never affects
            score or band. Suppressed for the legitimate-install self-match
            inside detectTypoSquat() so this only fires on attacks. */}
        <TypoSquatChip typoSquat={pkg.possibleTypoSquat} />
        {/* Dependency-confusion v0 — only fires for names listed in
            `.opensoyce-private`. MEDIUM static / HIGH on active squat. */}
        <DepConfusionChip dependencyConfusion={pkg.dependencyConfusion} />
        {/* Cross-ecosystem bridge v0 — informational only. The chip points
            at the sibling package in the other ecosystem (npm ↔ PyPI) so
            users remember to scan both lockfiles when both are in play. */}
        <CrossEcosystemBridgeChip bridge={pkg.crossEcosystemBridge} />
        {/* Model-weight loader posture v0 — fires for curated AI model
            loaders (huggingface_hub, transformers, torch, safetensors, …).
            Posture recommendation, not an RCE detector. */}
        <ModelWeightChip loader={pkg.modelWeightLoader} />
      </div>
      {expanded && multi && (
        <div className="pb-3 pt-1 pl-2 border-t border-soy-bottle/10">
          <div className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-1">
            ALL VERSIONS
          </div>
          <ul className="space-y-1">
            {pkg.versions.map((v) => (
              <li
                key={v}
                className="font-mono text-[11px] flex items-center gap-2 text-soy-bottle"
              >
                <span className="bg-soy-label/40 px-2 py-0.5 border border-soy-bottle/30">
                  {v}
                </span>
                <span className="opacity-50">
                  {pkg.direct ? 'direct occurrence' : 'transitive occurrence'} · scope {SCOPE_LABEL[pkg.scope]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Verdict-band chip colors. Mirrors the score-band semantics in
// src/shared/verdict.js: green = trust, amber = caution, red = avoid.
// The "REPO" prefix is mandatory at call sites so this never visually collides
// with the advisory severity pill (which is also green/amber/red but means
// something entirely different).
//
// HIGH MOMENTUM is included for type completeness only — the runScan path
// never produces it (editorial-only tier; see src/shared/verdict.js).
const VERDICT_CHIP: Record<RepoVerdict, string> = {
  'USE READY': 'bg-emerald-500 text-black',
  'FORKABLE': 'bg-emerald-500 text-black',
  'STABLE': 'bg-emerald-500 text-black',
  'HIGH MOMENTUM': 'bg-amber-500 text-black',
  'WATCHLIST': 'bg-amber-500 text-black',
  'RISKY': 'bg-soy-red text-white',
  'STALE': 'bg-soy-red text-white',
};

function VulnRow({ v }: { v: Vulnerability }) {
  const sev = SEVERITY_ORDER.includes(v.severity) ? v.severity : 'unknown';
  const styles = SEVERITY_STYLES[sev];
  // Identity-aware routing: when the resolver gave us a HIGH/MEDIUM repo,
  // jump straight to /projects/<owner>/<repo> (which hydrates on demand via
  // /api/analyze). Otherwise fall back to /lookup, preserving the original
  // dead-end-prone behavior only when we genuinely have nothing better.
  const hasResolved =
    !!v.resolvedRepo && (v.confidence === 'HIGH' || v.confidence === 'MEDIUM');
  const lookupHref = hasResolved
    ? `/projects/${v.resolvedRepo}`
    : `/lookup?q=${encodeURIComponent(v.package)}`;

  return (
    <div className="bg-white border-4 border-soy-bottle p-4 md:p-6 shadow-[4px_4px_0px_#000]">
      {/* Header row: package + severity. Stacks vertically on mobile so the
          severity pill drops below the package name at <=390px. */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="font-black text-base md:text-lg uppercase italic tracking-tight break-all">
            {v.package}
          </div>
          <div className="text-[11px] font-mono opacity-60 break-all">@ {v.version}</div>
        </div>
        <span
          className={`self-start sm:self-auto px-3 py-1 text-[11px] font-black uppercase tracking-widest border-2 border-black ${styles.pill}`}
        >
          {styles.label}
        </span>
      </div>

      {/* CVE / GHSA IDs + postinstall chip. The chip lives next to the IDs
          so the "vulnerable AND runs install scripts" combo is unmistakable.
          Suppressed for curated trusted packages (TypeScript, sharp, …). */}
      {(v.ids?.length > 0 || (v.hasInstallScript && !isTrustedInstallScript(v.package)) || v.possibleTypoSquat || v.dependencyConfusion || v.crossEcosystemBridge || v.modelWeightLoader) && (
        <div className="flex flex-wrap gap-1.5 mb-3 items-center">
          {(v.ids || []).map((id) => (
            <span
              key={id}
              className="bg-soy-label/40 text-soy-bottle px-2 py-0.5 text-[10px] font-mono font-bold border border-soy-bottle/30 break-all"
            >
              {id}
            </span>
          ))}
          <InstallScriptChip name={v.package} hasInstallScript={v.hasInstallScript} />
          {/* Typo-squat homoglyph v0 — the "vulnerable AND homoglyph"
              combo is the most-dangerous case, so the chip lives next to
              the IDs alongside the install-script chip. */}
          <TypoSquatChip typoSquat={v.possibleTypoSquat} />
          {/* Dependency-confusion v0 — same chip surface. The "vulnerable
              AND active dep-confusion" combo is the worst-case stack. */}
          <DepConfusionChip dependencyConfusion={v.dependencyConfusion} />
          {/* Cross-ecosystem bridge v0 — informational. Points at the
              sibling in the other ecosystem so users scan both sides. */}
          <CrossEcosystemBridgeChip bridge={v.crossEcosystemBridge} />
          {/* Model-weight loader posture v0 — chip surface alongside the
              other informational chips. Posture recommendation only. */}
          <ModelWeightChip loader={v.modelWeightLoader} />
        </div>
      )}

      {/* Summary — wrapped naturally; max-w forces ~80ch on wide screens */}
      <p className="text-sm font-medium text-soy-bottle/90 leading-relaxed max-w-[80ch] mb-3">
        {v.summary}
      </p>

      {/* Fixed-in + Lookup link */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-3 border-t-2 border-soy-bottle/10">
        <div className="text-[11px] font-black uppercase tracking-widest">
          {v.fixedIn ? (
            <>
              <span className="opacity-50">FIXED IN</span>{' '}
              <span className="bg-emerald-500 text-black px-2 py-0.5 border border-black font-mono">
                {v.fixedIn}
              </span>
            </>
          ) : (
            <span className="opacity-50">NO FIX RECORDED</span>
          )}
        </div>
        <Link
          to={lookupHref}
          className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-widest text-soy-red hover:text-soy-bottle"
        >
          Analyze in Lookup
          <ArrowUpRight size={14} />
        </Link>
      </div>

      {/* REPO HEALTH sub-block (Scanner v2.1a). Distinct from the advisory
          metadata above: advisory = "is this version of the dep vulnerable?",
          repo health = "are the maintainers actively fixing things?". */}
      <RepoHealthBlock v={v} />
    </div>
  );
}

// Scanner v2.1b — Dependency Risk Summary panel.
//
// The panel renders four logical zones, top to bottom:
//   1. Big decision-label pill + one-sentence reason
//   2. Totals row (vulnerable packages, severity chips, fix availability)
//   3. Health distribution chips for the source repos of vulnerable packages
//   4. Needs-attention list (only when count > 0)
//
// Honesty constraints are enforced in the copy itself, not just the logic:
// - never says "safe" / "secure" / "all clear"
// - always bounds CLEAN by "we scanned"
// - VERIFY_LATER copy names what's missing
// - health distribution is framed as the source repos of vulnerable packages,
//   not "your dependency tree health"

type ScanSummary = ReturnType<typeof summarizeScan>;
type SummaryLabel = ScanSummary['label'];
type SummarySeverityKey = keyof ScanSummary['totals']['bySeverity'];
type HealthBandKey = keyof ScanSummary['healthDistribution'];

const LABEL_STYLES: Record<SummaryLabel, { pill: string; copy: string }> = {
  CLEAN: { pill: 'bg-emerald-500 text-black', copy: 'CLEAN' },
  PATCH_AVAILABLE: { pill: 'bg-soy-bottle text-white', copy: 'PATCH AVAILABLE' },
  REVIEW_REQUIRED: { pill: 'bg-amber-500 text-black', copy: 'REVIEW REQUIRED' },
  VERIFY_LATER: { pill: 'bg-gray-400 text-black', copy: 'VERIFY LATER' },
};

// Distribution band display order. UNAVAILABLE last so the eye lands on
// healthy bands first when they exist. Reuses the VERDICT_CHIP colors.
//
// HIGH MOMENTUM is intentionally omitted: it is an editorial-only tier
// (see src/shared/verdict.js) and runScan never produces it, so it does
// not appear in the scan-result health distribution chip set.
const HEALTH_BAND_ORDER: HealthBandKey[] = [
  'USE READY',
  'FORKABLE',
  'STABLE',
  'WATCHLIST',
  'RISKY',
  'STALE',
  'UNAVAILABLE',
];

const HEALTH_BAND_CHIP: Record<HealthBandKey, string> = {
  'USE READY': 'bg-emerald-500 text-black',
  'FORKABLE': 'bg-emerald-500 text-black',
  'STABLE': 'bg-emerald-500 text-black',
  'HIGH MOMENTUM': 'bg-amber-500 text-black',
  'WATCHLIST': 'bg-amber-500 text-black',
  'RISKY': 'bg-soy-red text-white',
  'STALE': 'bg-soy-red text-white',
  UNAVAILABLE: 'bg-gray-400 text-black',
};

const SUMMARY_SEVERITY_ORDER: SummarySeverityKey[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'];
const SUMMARY_SEVERITY_STYLE: Record<SummarySeverityKey, string> = {
  CRITICAL: 'bg-soy-red text-white',
  HIGH: 'bg-amber-500 text-black',
  MEDIUM: 'bg-yellow-500 text-black',
  LOW: 'bg-emerald-500 text-black',
  UNKNOWN: 'bg-gray-400 text-black',
};

const REASON_COPY: Record<ScanSummary['needsAttention'][number]['reason'], string> = {
  HIGH_OR_CRITICAL_WEAK_HEALTH: 'high severity + weak repo health',
  NO_FIX: 'no fix available',
  HEALTH_UNAVAILABLE: 'repo health unavailable',
  IDENTITY_UNRESOLVED: 'source repo unresolved',
};

function ScanSummaryPanel({ summary }: { summary: ScanSummary }) {
  const labelStyle = LABEL_STYLES[summary.label];
  const { totals, healthDistribution, needsAttention } = summary;
  const hasAdvisories = totals.advisories > 0;
  const hasHealthChips = HEALTH_BAND_ORDER.some((b) => healthDistribution[b] > 0);

  return (
    <div className="bg-white border-4 border-soy-bottle p-6 md:p-8 mb-6 shadow-[8px_8px_0px_#000]">
      {/* Zone 1: label pill + sentence */}
      <div className="flex flex-col md:flex-row md:items-start md:gap-5 gap-3">
        <span
          className={`self-start px-4 py-2 text-[13px] md:text-sm font-black uppercase tracking-[0.3em] border-2 border-black ${labelStyle.pill}`}
        >
          {labelStyle.copy}
        </span>
        <p className="text-sm md:text-base font-bold text-soy-bottle leading-snug max-w-[80ch]">
          {summary.labelReason}
        </p>
      </div>

      {/* Zone 2: totals row */}
      {hasAdvisories && (
        <div className="mt-5 pt-4 border-t-2 border-soy-bottle/10 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] font-black uppercase tracking-widest">
          <div className="text-soy-bottle">
            <span className="opacity-50">PACKAGES</span>{' '}
            <span>{totals.vulnerablePackages}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SUMMARY_SEVERITY_ORDER.filter((s) => totals.bySeverity[s] > 0).map((s) => (
              <span
                key={s}
                className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-widest border-2 border-black ${SUMMARY_SEVERITY_STYLE[s]}`}
              >
                {s}: {totals.bySeverity[s]}
              </span>
            ))}
          </div>
          <div className="text-soy-bottle">
            <span className="bg-emerald-500 text-black px-2 py-0.5 border border-black font-mono">
              {totals.fixAvailable} FIX
            </span>
            <span className="mx-1 opacity-40">/</span>
            <span className="bg-soy-label/40 px-2 py-0.5 border border-soy-bottle/30 font-mono">
              {totals.fixUnavailable} NONE
            </span>
          </div>
        </div>
      )}

      {/* Zone 3: health distribution row */}
      {hasHealthChips && (
        <div className="mt-5 pt-4 border-t-2 border-soy-bottle/10">
          <div className="text-[10px] font-black uppercase tracking-[0.4em] opacity-50 mb-2">
            HEALTH OF SOURCE REPOS FOR VULNERABLE PACKAGES
          </div>
          <div className="flex flex-wrap gap-1.5">
            {HEALTH_BAND_ORDER.filter((b) => healthDistribution[b] > 0).map((b) => (
              <span
                key={b}
                className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-widest border-2 border-black ${HEALTH_BAND_CHIP[b]}`}
              >
                {b}: {healthDistribution[b]}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Zone 4: needs attention */}
      {needsAttention.length > 0 && (
        <div className="mt-5 pt-4 border-t-2 border-soy-bottle/10">
          <div className="text-[10px] font-black uppercase tracking-[0.4em] opacity-60 mb-3">
            NEEDS ATTENTION ({needsAttention.length})
          </div>
          <ul className="space-y-1.5">
            {needsAttention.map((e, i) => {
              const sevKey = (
                SUMMARY_SEVERITY_ORDER.includes(e.severity as SummarySeverityKey)
                  ? e.severity
                  : 'UNKNOWN'
              ) as SummarySeverityKey;
              return (
                <li
                  key={`${e.package}-${e.reason}-${i}`}
                  className="flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-widest"
                >
                  <span className="font-mono normal-case tracking-tight text-sm font-bold text-soy-bottle break-all">
                    {e.package}
                  </span>
                  <span
                    className={`px-2 py-0.5 text-[10px] border-2 border-black ${SUMMARY_SEVERITY_STYLE[sevKey]}`}
                  >
                    {sevKey}
                  </span>
                  <span className="px-2 py-0.5 text-[10px] bg-soy-label/40 border-2 border-soy-bottle/30 text-soy-bottle">
                    {REASON_COPY[e.reason]}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Per-vuln repo health block. Three states:
 *   1. `repoHealth` present       → score + verdict + signals (the success path)
 *   2. `repoHealthError` set      → muted fallback message; NEVER renders as green
 *   3. neither present (defensive)→ block hidden (only happens against an older
 *                                   server that predates v2.1a)
 */
function RepoHealthBlock({ v }: { v: Vulnerability }) {
  if (!v.repoHealth && !v.repoHealthError) return null;

  const labelRow = (
    <div className="text-[10px] font-black uppercase tracking-[0.4em] opacity-50 mb-2">
      REPO HEALTH
    </div>
  );

  if (v.repoHealthError === 'IDENTITY_NONE') {
    return (
      <div className="mt-4 pt-3 border-t-2 border-soy-bottle/10">
        {labelRow}
        <div className="bg-soy-label/20 border-2 border-soy-bottle/20 px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-soy-bottle/60">
          Repo identity unresolved — no health context available.
        </div>
      </div>
    );
  }

  if (v.repoHealthError === 'ANALYSIS_FAILED') {
    return (
      <div className="mt-4 pt-3 border-t-2 border-soy-bottle/10">
        {labelRow}
        <div className="bg-soy-label/20 border-2 border-soy-bottle/20 px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-soy-bottle/70 flex items-center gap-2">
          <AlertCircle size={14} className="shrink-0" />
          GitHub analysis unavailable — try again in a minute.
        </div>
      </div>
    );
  }

  if (!v.repoHealth) return null;
  const { soyceScore, verdict, signals, migration } = v.repoHealth;
  const chip = VERDICT_CHIP[verdict] || 'bg-soy-label text-black';

  return (
    <div className="mt-4 pt-3 border-t-2 border-soy-bottle/10">
      {labelRow}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {v.resolvedRepo ? (
            <a
              href={`https://github.com/${v.resolvedRepo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs md:text-sm text-soy-red hover:text-soy-bottle break-all"
            >
              {v.resolvedRepo}
            </a>
          ) : null}
          {/* Borrowed-trust signal (P0-AI-2). When the GitHub package.json
              names a different package than the npm registry claims, the
              Soyce score is being inherited from an unrelated repo. */}
          {v.verified === false ? (
            <span
              className="self-start px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border-2 border-black bg-amber-300 text-black"
              title={
                v.mismatchReason === 'github_pkg_name_different'
                  ? 'GitHub repo package.json names a different npm package — score may be borrowed.'
                  : 'GitHub repo has no root package.json with a name field — identity unverifiable.'
              }
            >
              ⚠ UNVERIFIED IDENTITY
            </span>
          ) : null}
          <span
            className={`self-start px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest border-2 border-black ${chip}`}
          >
            REPO: {verdict}
          </span>
          <span className="font-mono text-xs md:text-sm font-bold tracking-tight">
            Soyce {soyceScore.toFixed(1)}
          </span>
          {/* Fork-velocity-of-namesake v0 — small ⚠ MIGRATED chip. Tooltip
              carries the full reason; click target links to the successor
              when one is known (deprecated entries link to lookup root). */}
          <MigrationChip migration={migration ?? null} />
        </div>
        <div className="font-mono italic text-[11px] tracking-tight opacity-70">
          Maint {signals.maintenance.toFixed(1)} / Sec {signals.security.toFixed(1)} / Activity {signals.activity.toFixed(1)}
        </div>
      </div>
    </div>
  );
}

/**
 * Fork-velocity-of-namesake v0 — small chip surfaced on vuln + selected-health
 * rows when the scored repo has been migrated. Click target links to the
 * successor (or to the lookup root when the entry was deprecated). Tooltip
 * carries the full reason + confidence. Hidden when migration is null (the
 * common case).
 */
function MigrationChip({ migration }: { migration: RepoMigration | null | undefined }) {
  if (!migration) return null;
  const succ = migration.successor;
  const tooltip = succ
    ? `Migrated to ${succ.owner}/${succ.repo}${migration.migratedAt ? ` on ${migration.migratedAt}` : ''} — ${migration.reason} (Confidence: ${migration.confidence})`
    : `Deprecated${migration.migratedAt ? ` on ${migration.migratedAt}` : ''} — ${migration.reason} (Confidence: ${migration.confidence})`;
  const href = succ
    ? `/lookup?q=${succ.owner}/${succ.repo}`
    : null;
  const inner = (
    <span
      title={tooltip}
      className="inline-flex items-center self-start px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border-2 border-black bg-amber-300 text-black"
    >
      ⚠ MIGRATED
    </span>
  );
  return href ? (
    <Link to={href} className="no-underline">
      {inner}
    </Link>
  ) : (
    inner
  );
}

// Scanner v3c — Whole-Tree Risk Profile panel.
//
// Pure interpretation layer over evidence already gathered by v2.1a, v2.1b,
// v3a, v3b. No new fetches; no new analysis. The panel sits between the
// v2.1b ScanSummaryPanel (decision label) and the vuln-row list (detail)
// so the page reads top-to-bottom as decision → shape → detail.
//
// Honesty constraints baked into the copy at the source:
//   - "Synthesizes evidence from the layers below. Whole-tree scoring is
//     intentionally limited."  — never claims full-tree scoring.
//   - Coverage strip names selected/installed counts explicitly.
//   - UNKNOWN is its own band with its own gray pill; never collapses to LOW.

type RiskBand = 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH' | 'UNKNOWN';
type RiskProfileResult = ReturnType<typeof computeRiskProfile>;
type RiskDimensionKey = keyof RiskProfileResult['dimensions'];

const RISK_BAND_CHIP: Record<RiskBand, string> = {
  LOW: 'bg-emerald-500 text-black',
  MODERATE: 'bg-blue-500 text-white',
  ELEVATED: 'bg-amber-500 text-black',
  HIGH: 'bg-soy-red text-white',
  UNKNOWN: 'bg-gray-400 text-black',
};

const DIMENSION_LABEL: Record<RiskDimensionKey, string> = {
  vulnerabilityExposure: 'VULN EXPOSURE',
  remediationReadiness: 'REMEDIATION',
  maintainerTrust: 'MAINTAINER TRUST',
  treeComplexity: 'TREE COMPLEXITY',
  identityResolution: 'IDENTITY RESOLUTION',
};

const DIMENSION_ORDER: RiskDimensionKey[] = [
  'vulnerabilityExposure',
  'remediationReadiness',
  'maintainerTrust',
  'treeComplexity',
  'identityResolution',
];

function RiskProfilePanel({ result }: { result: ScanResponse }) {
  // computeRiskProfile is pure; memo only for rerender efficiency. We feed
  // the raw scan response through — vulnerabilities, inventory, and
  // selectedHealth are the only inputs the function consults.
  const profile = useMemo<RiskProfileResult>(
    () => computeRiskProfile({
      vulnerabilities: result.vulnerabilities,
      inventory: result.inventory ?? null,
      selectedHealth: result.selectedHealth ?? null,
    }),
    [result.vulnerabilities, result.inventory, result.selectedHealth],
  );

  // v2.1b summary feeds the report builders. computeRiskProfile and
  // summarizeScan are both pure — recomputing here keeps the panel
  // self-contained without needing to thread props down from the page.
  const summary = useMemo(
    () => summarizeScan(result.vulnerabilities),
    [result.vulnerabilities],
  );

  const reportArgs = useMemo(() => ({
    summary,
    profile,
    vulnerabilities: result.vulnerabilities,
    inventory: result.inventory ?? null,
    selectedHealth: result.selectedHealth ?? null,
    scannedAt: result.scannedAt,
  }), [summary, profile, result.vulnerabilities, result.inventory, result.selectedHealth, result.scannedAt]);

  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [fallbackText, setFallbackText] = useState<string | null>(null);

  const onCopyReport = useCallback(async () => {
    const md = buildMarkdownReport(reportArgs);
    try {
      if (typeof navigator !== 'undefined'
          && navigator.clipboard
          && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(md);
        setCopyState('copied');
        setFallbackText(null);
        window.setTimeout(() => setCopyState((s) => (s === 'copied' ? 'idle' : s)), 2000);
        return;
      }
      throw new Error('CLIPBOARD_UNAVAILABLE');
    } catch {
      setCopyState('failed');
      setFallbackText(md);
    }
  }, [reportArgs]);

  const onDownloadJson = useCallback(() => {
    try {
      const j = buildJsonReport(reportArgs);
      const blob = new Blob([JSON.stringify(j, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const isoDate = (result.scannedAt || new Date().toISOString()).slice(0, 10);
      a.download = `opensoyce-scan-${isoDate}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Defer revoke so the browser actually triggers the download.
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      // Best-effort: nothing else we can do if Blob/URL is blocked.
    }
  }, [reportArgs, result.scannedAt]);

  const buttonsDisabled = !result;

  const { dimensions, coverage } = profile;

  return (
    <div className="bg-white border-4 border-soy-bottle p-6 md:p-8 mb-6 shadow-[8px_8px_0px_#000]">
      <div className="mb-4 flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <h3 className="text-xl md:text-2xl font-bold uppercase italic tracking-tight">
            Dependency Risk Profile
          </h3>
          <p className="mt-1 text-[11px] md:text-xs font-bold uppercase tracking-widest text-soy-bottle/60">
            Synthesizes evidence from the layers below. Whole-tree scoring is intentionally limited.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onCopyReport}
            disabled={buttonsDisabled}
            className="bg-soy-label/40 hover:bg-soy-label border-2 border-soy-bottle px-3 py-2 text-[11px] font-black uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Copy Report
          </button>
          <button
            type="button"
            onClick={onDownloadJson}
            disabled={buttonsDisabled}
            className="bg-soy-label/40 hover:bg-soy-label border-2 border-soy-bottle px-3 py-2 text-[11px] font-black uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Download JSON
          </button>
          {copyState === 'copied' && (
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700">
              Copied
            </span>
          )}
          {copyState === 'failed' && (
            <span className="text-[10px] font-black uppercase tracking-widest text-soy-red">
              Copy failed — paste manually
            </span>
          )}
        </div>
      </div>
      {copyState === 'failed' && fallbackText && (
        <textarea
          readOnly
          value={fallbackText}
          rows={8}
          className="w-full bg-soy-label/20 border-2 border-soy-bottle p-3 font-mono text-[11px] mb-4"
        />
      )}

      {/* Dimension rows */}
      <div className="space-y-2">
        {DIMENSION_ORDER.map((key) => {
          const dim = dimensions[key];
          const band = dim.band as RiskBand;
          return (
            <div
              key={key}
              className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 py-1.5"
            >
              <div className="sm:w-44 shrink-0 text-[11px] font-black uppercase tracking-widest text-soy-bottle/80">
                {DIMENSION_LABEL[key]}
              </div>
              <span
                className={`self-start sm:self-auto px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest border-2 border-black ${RISK_BAND_CHIP[band]}`}
              >
                {band}
              </span>
              <p className="text-xs md:text-sm font-medium text-soy-bottle/90 leading-snug max-w-[80ch]">
                {dim.because}
              </p>
            </div>
          );
        })}
      </div>

      {/* Coverage strip — locked honesty sentence + the counts that make it
          falsifiable. We intentionally do NOT hide this when counts are
          zero; an empty scan still needs the literal coverage admission. */}
      <div className="mt-5 pt-4 border-t-2 border-soy-bottle/10">
        <p className="text-[11px] md:text-xs font-bold uppercase tracking-widest text-soy-bottle/70 leading-snug">
          {coverage.selectedScored} selected dependencies scored out of {coverage.totalInstalled} installed.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-black uppercase tracking-widest">
          <div className="text-soy-bottle">
            <span className="opacity-50">VULNERABLE</span>{' '}
            <span>{coverage.vulnerableCount}</span>
            {(coverage.vulnerableDirect > 0 || coverage.vulnerableTransitive > 0) && (
              <>
                <span className="mx-1 opacity-30">·</span>
                <span className="opacity-50">DIRECT</span>{' '}
                <span>{coverage.vulnerableDirect}</span>
                <span className="mx-1 opacity-30">/</span>
                <span className="opacity-50">TRANS</span>{' '}
                <span>{coverage.vulnerableTransitive}</span>
              </>
            )}
          </div>
          <div className="text-soy-bottle">
            <span className="opacity-50">UNRESOLVED IDENTITIES</span>{' '}
            <span>{coverage.unresolvedIdentities}</span>
          </div>
          {coverage.selectedSkippedBudget > 0 && (
            <div className="text-soy-bottle">
              <span className="opacity-50">SKIPPED BY BUDGET</span>{' '}
              <span>{coverage.selectedSkippedBudget}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Chip glossary modal (P1a — grading-swarm finding from Wei + Marco). Lists
// every chip the Scanner can render plus the signal that triggers it. Tooltips
// on individual chips remain unchanged; this is the discoverable inventory.
// Brutalist style matches the rest of Scanner: thick borders, dark backdrop,
// inline panel. No new dependencies — fixed-position overlay + backdrop click.
function ChipGlossaryModal({ onClose }: { onClose: () => void }) {
  // Keep the entry list co-located with the rendering so adding a new chip
  // means touching one place. Order: severity → identity/security → repo
  // health bands → maintainer/identity → ecosystem → model weights, matching
  // the visual scan order on a typical results row.
  const sections: Array<{
    title: string;
    entries: Array<{ chip: string; tone?: 'red' | 'amber' | 'green' | 'neutral'; desc: string }>;
  }> = [
    {
      title: 'VULNERABILITY / SECURITY',
      entries: [
        {
          chip: 'CRITICAL / HIGH / MEDIUM / LOW',
          tone: 'red',
          desc: 'OSV-reported severity for known advisories on this exact package version. The severity pill mirrors what OSV says — we do not invent severities or override them.',
        },
        {
          chip: '⚠ N OPEN HIGH/CRIT',
          tone: 'red',
          desc: 'Verdict-band cap. The repo\'s composite score would be USE READY but it has N open CRITICAL/HIGH advisories on its OWN code. The band is capped at FORKABLE / WATCHLIST. Source: P0-AI-1 logic in src/shared/verdict.js.',
        },
        {
          chip: '⚠ UNVERIFIED IDENTITY',
          tone: 'amber',
          desc: 'The npm package\'s "repository" URL points at a GitHub repo whose package.json#name (or pyproject.toml [project].name) does NOT match this package\'s name. Possible borrowed-trust attack — a typo-squat squatting a healthy repo\'s repository field to inherit its score.',
        },
        {
          chip: '⚠ POSSIBLE TYPO-SQUAT',
          tone: 'amber',
          desc: 'Package name reduces to the same Unicode confusables skeleton as a curated protected name (e.g. Cyrillic а in lаngchain). No false-positive on legitimate installs — self-match is byte-exact.',
        },
        {
          chip: '⚠ POSSIBLE DEP CONFUSION',
          tone: 'amber',
          desc: 'Package name appears in the user\'s .opensoyce-private declaration. Static signal — the name exists in your private namespace AND could exist on a public registry, so an attacker could squat it.',
        },
        {
          chip: '⚠ ACTIVE DEP CONFUSION',
          tone: 'red',
          desc: 'Escalated form of the above: the public registry actually returned 200 for that private name RIGHT NOW. An attacker may already be squatting — investigate immediately.',
        },
        {
          chip: '⚠ INSTALL SCRIPT',
          tone: 'amber',
          desc: 'Package runs preinstall / install / postinstall hooks on `npm install` (the event-stream / ua-parser-js attack vector). Informational only — many legitimate packages do this. Trusted packages (typescript, esbuild, sharp, …) are suppressed via src/data/trustedInstallScripts.js.',
        },
      ],
    },
    {
      title: 'REPO HEALTH BANDS (Soyce verdict)',
      entries: [
        { chip: 'USE READY  ≥ 8.5', tone: 'green', desc: 'Safe to adopt — strong across all pillars (maintenance, community, security, docs, activity).' },
        { chip: 'FORKABLE   ≥ 7.0', tone: 'green', desc: 'Healthy and trustworthy — fork-worthy as a base. NOT a verdict that the project is abandoned: most popular OSS projects land here. The label means the codebase is solid enough to build on.' },
        { chip: 'STABLE     ≥ 6.0', tone: 'neutral', desc: 'Mature, lower-velocity, still maintained — releases + triage without daily commits.' },
        { chip: 'WATCHLIST  ≥ 4.0', tone: 'amber', desc: 'Real issues; verify per-pillar breakdown before adoption.' },
        { chip: 'RISKY      ≥ 2.5', tone: 'red', desc: 'Multiple bands flag concerns — maintenance debt, license gap, unaddressed advisories.' },
        { chip: 'STALE      < 2.5', tone: 'red', desc: 'Abandoned or dormant — no recent commits, releases, or triage.' },
      ],
    },
    {
      title: 'MAINTAINER / IDENTITY',
      entries: [
        {
          chip: '⚠ SINGLE-MAINTAINER',
          tone: 'amber',
          desc: 'Verdict-band cap. Top-1 commit share > 85% AND ≤ 2 non-bot contributors AND > 30 days since last commit. Caps USE READY → FORKABLE only. Suppressed for vendor-official SDKs via src/data/vendorSdks.ts.',
        },
        {
          chip: 'REPO RESOLVED',
          tone: 'green',
          desc: 'We mapped this npm / PyPI package to a concrete GitHub repo via the registry "repository" field (HIGH confidence).',
        },
        {
          chip: 'REPO UNRESOLVED',
          tone: 'neutral',
          desc: 'We could not map the package to a source repo — repository field missing, malformed, or pointing somewhere we can\'t verify.',
        },
      ],
    },
    {
      title: 'ECOSYSTEM / SUPPLY CHAIN',
      entries: [
        {
          chip: '⚠ CROSS-ECOSYSTEM BRIDGE',
          tone: 'amber',
          desc: 'This package has a curated sibling in the OTHER ecosystem (npm ↔ PyPI). If you only scanned one lockfile, you missed half the supply-chain surface. Click the sibling to investigate.',
        },
        {
          chip: '⚠ MIGRATED',
          tone: 'amber',
          desc: 'Project has migrated to a successor repo. The score shown reflects the OLD repo (which is now dormant). Click for the successor — the active codebase is elsewhere.',
        },
      ],
    },
    {
      title: 'MODEL WEIGHTS (POSTURE, not RCE detection)',
      entries: [
        {
          chip: '⚠ USE SAFETENSORS',
          tone: 'amber',
          desc: 'Package can load pickle-format model weights, and pickle deserialization executes arbitrary code at load time. Prefer safetensors / ONNX. NOTE: we don\'t scan the weight files themselves — we flag the loader.',
        },
        {
          chip: '⚠ TORCH.LOAD: USE SAFETENSORS',
          tone: 'amber',
          desc: 'Same RCE-on-load risk, specific to torch.load(). Use weights_only=True (PyTorch ≥ 2.0) or convert to safetensors.',
        },
        {
          chip: '✓ SAFE MODEL FORMAT',
          tone: 'green',
          desc: 'Package IS safetensors / onnxruntime — the safer choice. No code execution on weight load.',
        },
      ],
    },
  ];

  const toneClass = (tone?: 'red' | 'amber' | 'green' | 'neutral') => {
    switch (tone) {
      case 'red': return 'bg-soy-red text-white border-soy-red';
      case 'amber': return 'bg-amber-400 text-black border-black';
      case 'green': return 'bg-emerald-500 text-black border-black';
      default: return 'bg-white text-black border-black';
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Chip glossary"
      className="fixed inset-0 z-[100] flex items-start justify-center p-4 md:p-8 overflow-y-auto"
    >
      {/* Backdrop — click to dismiss */}
      <button
        type="button"
        aria-label="Close glossary"
        onClick={onClose}
        className="fixed inset-0 bg-black/70 cursor-default"
      />
      {/* Panel */}
      <div className="relative bg-soy-label border-4 border-black shadow-[12px_12px_0px_#E63322] max-w-4xl w-full my-4">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 bg-black text-white border-b-4 border-soy-red px-6 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="bg-soy-red text-white px-2 py-1 text-[10px] font-black uppercase tracking-[0.3em] shrink-0">
              GLOSSARY
            </div>
            <h2 className="text-xl md:text-2xl font-black uppercase italic tracking-tight truncate">
              Chip Glossary
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 border-2 border-white px-3 py-1 text-[11px] font-black uppercase tracking-widest hover:bg-white hover:text-black transition-colors"
          >
            CLOSE
          </button>
        </div>

        <div className="px-6 py-6 space-y-8">
          <p className="text-xs font-bold uppercase tracking-widest opacity-60 leading-relaxed">
            Every chip rendered by the scanner, plus the signal that triggers it. Informational chips never change the composite score, Risk Profile, or verdict band unless explicitly noted as a band-cap.
          </p>

          {sections.map(section => (
            <div key={section.title}>
              <h3 className="text-[11px] md:text-xs font-black uppercase tracking-[0.3em] text-soy-red mb-3 border-b-2 border-soy-bottle/20 pb-2">
                {section.title}
              </h3>
              <ul className="space-y-3">
                {section.entries.map(entry => (
                  <li key={entry.chip} className="flex flex-col md:flex-row md:items-start gap-3">
                    <span
                      className={`shrink-0 inline-block self-start border-2 px-2 py-1 text-[10px] font-black uppercase tracking-[0.15em] md:min-w-[16rem] ${toneClass(entry.tone)}`}
                    >
                      {entry.chip}
                    </span>
                    <p className="text-xs md:text-sm font-medium opacity-80 leading-relaxed">
                      {entry.desc}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <p className="text-[10px] font-bold uppercase tracking-widest opacity-50 border-t-2 border-soy-bottle/20 pt-4">
            Want the full math? See the{' '}
            <a href="/methodology" className="underline text-soy-red hover:opacity-80">
              methodology page
            </a>{' '}
            — every signal, every weight, every known limitation, named out loud.
          </p>
        </div>
      </div>
    </div>
  );
}
