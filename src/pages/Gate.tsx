import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  BookOpen,
  Loader2,
  CheckCircle2,
} from 'lucide-react';

// Same response shape as api/exceptions.js handleComplianceGate.
type GatePattern = {
  patternId: string;
  severity: string;
  policyImpact: string;
  confidence: number;
  evidence?: Array<{ label: string; value: string }>;
};

type GateEvaluation = {
  package: string;
  score: number;
  verdict: string;
  license: string;
  status: string;
  action: 'BLOCK' | 'WARN' | 'ALLOW';
  reason: string;
  exception: boolean;
  remediation: string;
  patterns: GatePattern[];
};

type GateResponse = {
  decision: 'BLOCK' | 'ALLOW';
  overallScore: number;
  dependenciesChecked: number;
  cache: 'hit' | 'miss';
  evaluation: GateEvaluation[];
};

const actionColor: Record<string, string> = {
  BLOCK: 'bg-soy-red text-white',
  WARN: 'bg-yellow-400 text-soy-bottle',
  ALLOW: 'bg-emerald-500 text-white',
};

const PRESETS: Array<{ label: string; value: string; note: string }> = [
  {
    label: 'ua-parser-js@0.7.29',
    value: 'ua-parser-js@0.7.29',
    note: 'Canonical 2021 supply-chain compromise. Expect BLOCK + 4 patterns post-PR-#30.',
  },
  {
    label: 'lodash@4.17.20',
    value: 'lodash@4.17.20',
    note: 'Real package with a known CVE in this version range. Routine vuln, not compromise.',
  },
  {
    label: 'react@18.2.0',
    value: 'react@18.2.0',
    note: 'Healthy reference. Expect ALLOW with no patterns fired.',
  },
];

async function runGate(packageInput: string): Promise<GateResponse> {
  const res = await fetch('/api/exceptions?action=compliance-gate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dependencies: [packageInput] }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}${text ? `: ${text}` : ''}`);
  }
  return (await res.json()) as GateResponse;
}

export default function Gate() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initial = searchParams.get('package') || '';
  const [input, setInput] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<GateResponse | null>(null);
  const [activeQuery, setActiveQuery] = useState<string | null>(null);

  const submit = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      setLoading(true);
      setError(null);
      setResponse(null);
      setActiveQuery(trimmed);
      // Sync URL so the result is shareable.
      setSearchParams({ package: trimmed }, { replace: true });
      try {
        const out = await runGate(trimmed);
        setResponse(out);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [setSearchParams],
  );

  // Auto-run on first load if the URL carried a package param.
  useEffect(() => {
    if (initial) {
      submit(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const evalRow = response?.evaluation?.[0];

  return (
    <div className="max-w-6xl mx-auto px-4 py-12 md:py-20 font-sans text-soy-bottle">
      <Link
        to="/proof/ots-replays"
        className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-soy-bottle/60 hover:text-soy-red mb-8 transition-colors"
      >
        <ArrowLeft size={14} /> Back to OTS Incident Replays
      </Link>

      <header className="mb-12 border-b-8 border-soy-bottle pb-8">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className="border-2 border-soy-bottle bg-soy-red text-white px-3 py-1 text-xs font-black uppercase tracking-widest shadow-[2px_2px_0px_#302C26]">
            Proof Layer
          </span>
          <span className="border-2 border-soy-bottle bg-white text-soy-bottle px-3 py-1 text-xs font-black uppercase tracking-widest shadow-[2px_2px_0px_#302C26]">
            v0
          </span>
          <span className="border-2 border-soy-bottle bg-emerald-500 text-white px-3 py-1 text-xs font-black uppercase tracking-widest shadow-[2px_2px_0px_#302C26]">
            Live Production Gate
          </span>
        </div>
        <h1 className="text-4xl md:text-5xl font-black uppercase italic tracking-tight mb-4">
          Production Gate Lookup
        </h1>
        <p className="text-base font-bold leading-relaxed text-soy-bottle/80 max-w-3xl mb-3">
          Type a package name (optionally with <code>@version</code>) and see the verbatim output of the same compliance gate that drives Guard PR comments. No synthetic fixtures. No narration. Output below is whatever the production gate returned.
        </p>
        <p className="text-sm font-bold leading-relaxed text-soy-bottle/60 max-w-3xl">
          The proof package's verbatim repo-doc evidence (
          <a
            href="https://github.com/freewho99/opensoyce/blob/main/docs/proof/before-after-risk-example.md"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-2 underline-offset-2 hover:text-soy-red"
          >
            before-after-risk-example.md
          </a>
          ) preserves three historical captures of the <code>ua-parser-js@0.7.29</code> output across PR #28 and PR #30. This page is the live equivalent — the same gate endpoint, called from a browser instead of a CLI.
        </p>
      </header>

      {/* Methodology box */}
      <section className="mb-12 border-4 border-soy-bottle bg-soy-label p-6 shadow-[6px_6px_0px_#302C26]">
        <h2 className="text-sm font-black uppercase tracking-widest text-soy-bottle mb-3 flex items-center gap-2">
          <ShieldAlert size={16} className="text-soy-red" /> How This Page Works
        </h2>
        <ol className="space-y-1.5 text-xs font-bold text-soy-bottle/80 leading-relaxed">
          <li>
            <span className="text-soy-red font-black">1.</span> The form posts <code>{`{ dependencies: ['<your-input>'] }`}</code> to <code>/api/exceptions?action=compliance-gate</code> — the same endpoint Guard PR comments use.
          </li>
          <li>
            <span className="text-soy-red font-black">2.</span> The gate runs the live pipeline: OSV fast-path (bulk + per-vuln detail enrichment, max-of-both severity) → resolver (snapshot or live npm + GitHub) → compromise-indicator derivation (CWE-829 / CWE-912) → <code>detectOtsPatternsForRow()</code> → policy evaluation.
          </li>
          <li>
            <span className="text-soy-red font-black">3.</span> Returned JSON is rendered below verbatim — patterns, evidence rows, decision, reason. If a field is empty, the gate returned it empty.
          </li>
          <li>
            <span className="text-soy-red font-black">4.</span> OSV v1 is package-level, not version-aware. Indicators apply to the package family regardless of the version typed. The honest caveat is named in the proof docs.
          </li>
        </ol>
      </section>

      {/* Input form */}
      <section className="mb-12 border-4 border-soy-bottle bg-white p-6 shadow-[6px_6px_0px_#302C26]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
        >
          <label
            htmlFor="package-input"
            className="block text-xs font-black uppercase tracking-widest text-soy-bottle mb-2"
          >
            Package <span className="text-soy-bottle/50">(name or name@version)</span>
          </label>
          <div className="flex flex-col md:flex-row gap-3">
            <input
              id="package-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. ua-parser-js@0.7.29"
              className="flex-1 border-4 border-soy-bottle bg-soy-label px-4 py-3 text-sm font-mono font-bold placeholder:text-soy-bottle/40 focus:outline-none focus:bg-white"
              autoFocus
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="border-4 border-soy-bottle bg-soy-bottle text-white px-6 py-3 text-xs font-black uppercase tracking-widest shadow-[4px_4px_0px_#302C26] hover:bg-soy-red transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Running Gate…
                </>
              ) : (
                <>Run Gate</>
              )}
            </button>
          </div>
        </form>

        <div className="mt-4 pt-4 border-t-2 border-soy-bottle/20">
          <p className="text-[10px] font-black uppercase tracking-widest text-soy-bottle/50 mb-2">
            Presets — every result is live, no fixtures
          </p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => {
                  setInput(preset.value);
                  submit(preset.value);
                }}
                title={preset.note}
                className="border-2 border-soy-bottle bg-white text-soy-bottle px-3 py-1.5 text-[11px] font-black uppercase tracking-wide hover:bg-soy-label transition-colors shadow-[2px_2px_0px_#302C26]"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Results */}
      {error && (
        <section className="mb-12 border-4 border-soy-red bg-soy-red/10 p-6 shadow-[6px_6px_0px_#302C26]">
          <h2 className="text-sm font-black uppercase tracking-widest text-soy-red mb-2 flex items-center gap-2">
            <AlertTriangle size={16} /> Gate Call Failed
          </h2>
          <p className="text-xs font-bold text-soy-bottle/80 font-mono break-all">{error}</p>
          <p className="text-[10px] font-bold text-soy-bottle/50 uppercase tracking-wider mt-3">
            The gate endpoint did not return a successful response. Cause is shown verbatim above.
          </p>
        </section>
      )}

      {loading && !response && (
        <section className="mb-12 border-4 border-soy-bottle bg-white p-12 shadow-[6px_6px_0px_#302C26] flex flex-col items-center gap-3">
          <Loader2 size={32} className="animate-spin text-soy-red" />
          <p className="text-xs font-black uppercase tracking-widest text-soy-bottle/60">
            Running gate for <span className="text-soy-bottle">{activeQuery}</span>…
          </p>
          <p className="text-[10px] font-bold text-soy-bottle/40 uppercase tracking-wider text-center max-w-md">
            OSV bulk query + per-vuln detail enrichment + resolver live-fetch + pattern detector + policy evaluation
          </p>
        </section>
      )}

      {response && evalRow && (
        <article className="border-4 border-soy-bottle bg-white shadow-[12px_12px_0px_#302C26] mb-12">
          <header className="bg-soy-bottle text-white p-8 border-b-4 border-soy-bottle">
            <div className="flex flex-wrap items-center gap-2 mb-4 text-[10px] font-black uppercase tracking-widest">
              <span className="bg-soy-red text-white px-3 py-1 border-2 border-soy-bottle">
                Live Gate Result
              </span>
              <span className="border-2 border-white/30 px-3 py-1 bg-white/10">
                Cache: {response.cache}
              </span>
              <span className="border-2 border-white/30 px-3 py-1 bg-white/10">
                Score: {response.overallScore.toFixed(1)}
              </span>
            </div>
            <h2 className="text-3xl md:text-4xl font-black uppercase italic tracking-tight mb-3 break-all">
              {evalRow.package}
            </h2>
            <p className="text-sm font-bold text-white/80 mb-4 leading-relaxed">
              Verbatim output from <code>/api/exceptions?action=compliance-gate</code>. Same gate path as Guard PR comments.
            </p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
              <span className="font-black uppercase tracking-widest text-white/60">Verdict</span>
              <span className="font-bold">{evalRow.verdict}</span>
              <span className="font-black uppercase tracking-widest text-white/60">License</span>
              <span className="font-bold">{evalRow.license}</span>
              <span className="font-black uppercase tracking-widest text-white/60">Status</span>
              <span className="font-bold">{evalRow.status}</span>
            </div>
          </header>

          <div className="p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left: action + reason */}
            <div className="lg:col-span-5 space-y-6">
              <section>
                <h3 className="text-xs font-black uppercase tracking-widest text-soy-bottle/40 mb-3 flex items-center gap-2">
                  <ShieldCheck size={14} /> Gate Action
                </h3>
                <div
                  className={`inline-block px-6 py-3 border-4 border-soy-bottle font-black uppercase italic tracking-widest text-lg shadow-[4px_4px_0px_#302C26] ${actionColor[evalRow.action] || 'bg-gray-300 text-soy-bottle'}`}
                >
                  {evalRow.action}
                </div>
                {evalRow.exception && (
                  <p className="text-[10px] font-black uppercase tracking-wider mt-3 text-emerald-700">
                    ⚖ Exception active — action would otherwise have been BLOCK
                  </p>
                )}
              </section>

              {evalRow.reason && (
                <section className="border-t-4 border-soy-bottle pt-6">
                  <h3 className="text-xs font-black uppercase tracking-widest text-soy-bottle/40 mb-3 flex items-center gap-2">
                    <BookOpen size={14} /> Reason
                  </h3>
                  <p className="text-sm font-bold leading-relaxed text-soy-bottle/80 break-words">
                    {evalRow.reason}
                  </p>
                </section>
              )}

              {evalRow.remediation && evalRow.remediation !== 'None' && (
                <section className="border-t-4 border-soy-bottle pt-6">
                  <h3 className="text-xs font-black uppercase tracking-widest text-soy-bottle/40 mb-3 flex items-center gap-2">
                    <AlertTriangle size={14} className="text-yellow-600" /> Recommended Remediation
                  </h3>
                  <p className="text-sm font-bold leading-relaxed text-soy-bottle/80">
                    {evalRow.remediation}
                  </p>
                </section>
              )}
            </div>

            {/* Right: patterns */}
            <div className="lg:col-span-7 space-y-6 border-t-4 lg:border-t-0 lg:border-l-4 border-soy-bottle pt-8 lg:pt-0 lg:pl-8">
              <section>
                <h3 className="text-xs font-black uppercase tracking-widest text-soy-bottle/40 mb-4 flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-600" />{' '}
                  Detector Returned ({evalRow.patterns.length})
                </h3>
                {evalRow.patterns.length === 0 && (
                  <p className="text-xs font-bold text-soy-bottle/50 italic">
                    No patterns fired. The gate found no OTS-catalog signal for this package under default policy.
                  </p>
                )}
                <div className="space-y-3">
                  {evalRow.patterns.map((p, idx) => (
                    <Link
                      key={`${p.patternId}-${idx}`}
                      to={`/patterns/${p.patternId}`}
                      className="block p-4 border-2 border-soy-bottle bg-soy-label hover:bg-white transition-all shadow-[2px_2px_0px_#302C26]"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] font-black uppercase tracking-widest text-soy-red">
                          {p.severity} · {p.policyImpact}
                        </span>
                        <span className="text-[9px] font-black uppercase text-soy-bottle/40">
                          conf {(p.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                      <h4 className="text-xs font-black uppercase italic leading-tight mb-2 break-words">
                        {p.patternId}
                      </h4>
                      {p.evidence && p.evidence.length > 0 && (
                        <ul className="space-y-0.5">
                          {p.evidence.map((e, eIdx) => (
                            <li key={eIdx} className="text-[10px] leading-tight text-soy-bottle/70 break-words">
                              <span className="font-black uppercase">{e.label}:</span>{' '}
                              <span className="font-bold">{e.value}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </Link>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </article>
      )}

      {/* Footer: doctrine + proof links */}
      <section className="border-4 border-soy-bottle bg-white p-6 shadow-[6px_6px_0px_#302C26] mb-8">
        <h2 className="text-sm font-black uppercase tracking-widest text-soy-bottle mb-3 flex items-center gap-2">
          <BookOpen size={16} /> Where This Page Fits In The Proof Package
        </h2>
        <p className="text-xs font-bold text-soy-bottle/80 leading-relaxed mb-3">
          This is the deployed-UI surface for the production gate. The other proof surfaces show different layers of the same loop:
        </p>
        <ul className="space-y-2 text-xs font-bold text-soy-bottle/80 leading-relaxed">
          <li>
            <Link to="/patterns" className="text-soy-red font-black underline decoration-2 underline-offset-2 hover:no-underline">
              /patterns
            </Link>{' '}
            — catalog coverage (20 of 31 patterns gate-active today; the rest are catalog-only or roadmap).
          </li>
          <li>
            <Link to="/proof/ots-replays" className="text-soy-red font-black underline decoration-2 underline-offset-2 hover:no-underline">
              /proof/ots-replays
            </Link>{' '}
            — live-detector replays of cited public supply-chain incidents, with the fixture row shown above each result.
          </li>
          <li>
            <Link to="/proof/timeline" className="text-soy-red font-black underline decoration-2 underline-offset-2 hover:no-underline">
              /proof/timeline
            </Link>{' '}
            — static record of how trust decisions changed across the closed OTS proof-package arc.
          </li>
          <li>
            <a
              href="https://github.com/freewho99/opensoyce/blob/main/docs/proof/before-after-risk-example.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-soy-red font-black underline decoration-2 underline-offset-2 hover:no-underline inline-flex items-center gap-1"
            >
              before-after-risk-example.md
              <ExternalLink size={11} />
            </a>{' '}
            — three verbatim captures of <code>ua-parser-js@0.7.29</code> across PR #28 + PR #30, preserved as the historical record of the evidence layer improving.
          </li>
          <li>
            <a
              href="https://github.com/freewho99/opensoyce/blob/main/docs/proof/doctrine-pattern-enforcement.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-soy-red font-black underline decoration-2 underline-offset-2 hover:no-underline inline-flex items-center gap-1"
            >
              doctrine-pattern-enforcement.md
              <ExternalLink size={11} />
            </a>{' '}
            — why the gate sometimes fires more patterns and why the policy decision is sometimes stable across changes.
          </li>
        </ul>
        <p className="text-[10px] font-bold text-soy-bottle/50 uppercase tracking-wider mt-4">
          A pattern can be educational before it is enforceable. The product always says which is which.
        </p>
      </section>
    </div>
  );
}
