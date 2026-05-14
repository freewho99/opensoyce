import React, { useRef, useState } from 'react';
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

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'unknown';

interface Vulnerability {
  package: string;
  version: string;
  severity: Severity;
  ids: string[];
  summary: string;
  fixedIn?: string;
}

interface ScanResponse {
  totalDeps: number;
  directDeps: number;
  vulnerabilities: Vulnerability[];
  scannedAt: string;
  cacheHit: boolean;
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
        <div className="inline-block bg-soy-red text-white text-[10px] font-black px-3 py-1 mb-4 tracking-[0.4em] border-2 border-black">
          SCANNER v2
        </div>
        <h1 className="text-4xl md:text-5xl font-bold uppercase italic tracking-tighter mb-4">
          Find Known Vulnerabilities
        </h1>
        <p className="text-base md:text-xl font-medium opacity-60 max-w-3xl">
          Upload a <code className="bg-soy-bottle/10 px-1.5 py-0.5 font-mono text-sm">package-lock.json</code>{' '}
          to find known vulnerabilities hiding in your resolved dependency tree.
        </p>
      </div>

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
    </div>
  );
}

function VulnRow({ v }: { v: Vulnerability }) {
  const sev = SEVERITY_ORDER.includes(v.severity) ? v.severity : 'unknown';
  const styles = SEVERITY_STYLES[sev];
  const lookupHref = `/lookup?q=${encodeURIComponent(v.package)}`;

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

      {/* CVE / GHSA IDs */}
      {v.ids?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {v.ids.map((id) => (
            <span
              key={id}
              className="bg-soy-label/40 text-soy-bottle px-2 py-0.5 text-[10px] font-mono font-bold border border-soy-bottle/30 break-all"
            >
              {id}
            </span>
          ))}
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
        <a
          href={lookupHref}
          className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-widest text-soy-red hover:text-soy-bottle"
        >
          Analyze in Lookup
          <ArrowUpRight size={14} />
        </a>
      </div>
    </div>
  );
}
