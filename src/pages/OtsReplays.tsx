import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  FlaskConical,
  BookOpen,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { OTS_INCIDENT_REPLAYS, type OtsIncidentReplay } from '../data/otsIncidentReplays';
import { getOtsIncident, getOtsPatternDefinition, type OtsIncidentCaseStudy } from '../data/patterns';
import {
  detectOtsPatternsForRow,
  otsPatternVerdict,
} from '../shared/otsPatterns.js';

type DetectorEvidence = { label: string; value: string };
type DetectedPattern = {
  patternId: string;
  severity: string;
  policyImpact: string;
  confidence: number;
  evidence: DetectorEvidence[];
};

const verdictColor: Record<string, string> = {
  BLOCK: 'bg-soy-red text-white',
  WARN: 'bg-yellow-400 text-soy-bottle',
  ALLOW: 'bg-emerald-500 text-white',
};

const confidenceColor: Record<string, string> = {
  primary: 'bg-emerald-600 text-white',
  'authoritative-secondary': 'bg-yellow-500 text-soy-bottle',
};

const confidenceLabel: Record<string, string> = {
  primary: 'PRIMARY SOURCE',
  'authoritative-secondary': 'AUTHORITATIVE SECONDARY',
};

function ReplayCard({ replay, incident }: { replay: OtsIncidentReplay; incident: OtsIncidentCaseStudy }) {
  // The proof of the proof page: we run the live detector here, at render
  // time, against the fixture row declared in the replay data. Anything
  // the detector returns is what shows up on screen. If the detector
  // implementation drifts from the claim, scripts/test-ots-replays.mjs
  // fails in CI.
  const detectorOutput = useMemo<DetectedPattern[]>(() => {
    if (replay.replayMode !== 'live-detector') return [];
    return detectOtsPatternsForRow(replay.fixtureRow, replay.fixtureContext);
  }, [replay]);

  const verdict =
    replay.replayMode === 'live-detector'
      ? otsPatternVerdict(detectorOutput)
      : otsPatternVerdict(
          replay.expectedPatternIds
            .map((id) => getOtsPatternDefinition(id))
            .filter(Boolean)
            .map((def) => ({
              policyImpact: def!.defaultPolicyImpact,
              severity: def!.defaultSeverity,
            })),
        );

  return (
    <article
      id={incident.id}
      className="border-4 border-soy-bottle bg-white shadow-[12px_12px_0px_#302C26] mb-12 scroll-mt-12"
    >
      {/* Header */}
      <header className="bg-soy-bottle text-white p-8 border-b-4 border-soy-bottle">
        <div className="flex flex-wrap items-center gap-2 mb-4 text-[10px] font-black uppercase tracking-widest">
          <span className="bg-soy-red text-white px-3 py-1 border-2 border-soy-bottle">
            INCIDENT REPLAY
          </span>
          <span className={`px-3 py-1 border-2 border-soy-bottle ${confidenceColor[incident.sourceConfidence] || 'bg-white/10'}`}>
            {confidenceLabel[incident.sourceConfidence] || incident.sourceConfidence?.toUpperCase()}
          </span>
          <span className="border-2 border-white/30 px-3 py-1 bg-white/10">
            {replay.replayMode === 'live-detector' ? 'LIVE DETECTOR' : 'CATALOG MAPPING'}
          </span>
          <span className="border-2 border-white/30 px-3 py-1 bg-white/10">
            DATE: {incident.date}
          </span>
        </div>
        <h2 className="text-3xl md:text-4xl font-black uppercase italic tracking-tight mb-3">
          {incident.name}
        </h2>
        <p className="text-sm font-bold text-white/80 mb-4 leading-relaxed">
          {incident.description}
        </p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
          <span className="font-black uppercase tracking-widest text-white/60">TARGET</span>
          <span className="font-bold">{incident.target}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs mt-3">
          <span className="font-black uppercase tracking-widest text-white/60">SOURCE</span>
          <a
            href={incident.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold underline decoration-2 underline-offset-2 hover:text-yellow-300 break-all inline-flex items-center gap-1"
          >
            {incident.sourceUrl}
            <ExternalLink size={12} />
          </a>
          {incident.corroboratingSourceUrl && (
            <a
              href={incident.corroboratingSourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold underline decoration-2 underline-offset-2 hover:text-yellow-300 break-all inline-flex items-center gap-1"
            >
              corroborating: {incident.corroboratingSourceUrl}
              <ExternalLink size={12} />
            </a>
          )}
        </div>
      </header>

      <div className="p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left column: facts + (live fixture or detector gap) */}
        <div className="lg:col-span-7 space-y-8">
          <section>
            <h3 className="text-xs font-black uppercase tracking-widest text-soy-bottle/40 mb-3 flex items-center gap-2">
              <BookOpen size={14} /> OBSERVED FACTS (from primary source)
            </h3>
            <ul className="space-y-2 text-sm font-bold leading-relaxed text-soy-bottle/80">
              {replay.observedFacts.map((fact, idx) => (
                <li key={idx} className="flex gap-2">
                  <span className="text-soy-red flex-shrink-0">▪</span>
                  <span>{fact}</span>
                </li>
              ))}
            </ul>
          </section>

          {replay.replayMode === 'live-detector' && (
            <section className="border-t-4 border-soy-bottle pt-6">
              <h3 className="text-xs font-black uppercase tracking-widest text-soy-bottle/40 mb-3 flex items-center gap-2">
                <FlaskConical size={14} /> FIXTURE ROW FED TO DETECTOR
              </h3>
              <pre className="text-[11px] font-mono bg-soy-bottle text-white p-4 overflow-x-auto border-2 border-soy-bottle shadow-[3px_3px_0px_#302C26]">
                {JSON.stringify(replay.fixtureRow, null, 2)}
              </pre>
              <p className="text-[10px] font-bold text-soy-bottle/50 uppercase tracking-wider mt-2">
                This page calls detectOtsPatternsForRow() at render time. Output below is live, not narrated.
              </p>
            </section>
          )}

          {replay.replayMode === 'catalog-mapping' && (
            <section className="border-t-4 border-soy-bottle pt-6">
              <h3 className="text-xs font-black uppercase tracking-widest text-soy-bottle/40 mb-3 flex items-center gap-2">
                <AlertTriangle size={14} className="text-yellow-600" /> DETECTOR COVERAGE GAP
              </h3>
              <div className="border-l-8 border-yellow-500 bg-yellow-50/70 p-4 text-sm font-bold leading-relaxed text-soy-bottle/80">
                {replay.detectorGap}
              </div>
              <p className="text-[10px] font-bold text-soy-bottle/50 uppercase tracking-wider mt-2">
                For this incident the patterns are matched against the catalog directly. Live detector branches queued for v2.
              </p>
            </section>
          )}
        </div>

        {/* Right column: pattern matches + verdict */}
        <div className="lg:col-span-5 space-y-6 border-t-4 lg:border-t-0 lg:border-l-4 border-soy-bottle pt-8 lg:pt-0 lg:pl-8">
          {/* Verdict pill */}
          <section>
            <h3 className="text-xs font-black uppercase tracking-widest text-soy-bottle/40 mb-3 flex items-center gap-2">
              <ShieldCheck size={14} /> OTS GATE VERDICT
            </h3>
            <div
              className={`inline-block px-6 py-3 border-4 border-soy-bottle font-black uppercase italic tracking-widest text-lg shadow-[4px_4px_0px_#302C26] ${verdictColor[verdict]}`}
            >
              {verdict}
            </div>
          </section>

          {/* Pattern matches */}
          <section className="border-t-4 border-soy-bottle pt-6">
            <h3 className="text-xs font-black uppercase tracking-widest text-soy-bottle/40 mb-4 flex items-center gap-2">
              {replay.replayMode === 'live-detector' ? (
                <>
                  <CheckCircle2 size={14} className="text-emerald-600" /> DETECTOR RETURNED ({detectorOutput.length})
                </>
              ) : (
                <>
                  <BookOpen size={14} /> CATALOG MATCHES ({replay.expectedPatternIds.length})
                </>
              )}
            </h3>

            {replay.replayMode === 'live-detector' && (
              <div className="space-y-3">
                {detectorOutput.length === 0 && (
                  <p className="text-xs font-bold text-soy-bottle/50 italic">No patterns fired.</p>
                )}
                {detectorOutput.map((p) => {
                  const def = getOtsPatternDefinition(p.patternId);
                  return (
                    <Link
                      key={p.patternId}
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
                      <h4 className="text-xs font-black uppercase italic leading-tight mb-2">
                        {def ? def.name : p.patternId}
                      </h4>
                      {p.evidence && p.evidence.length > 0 && (
                        <ul className="space-y-0.5 mb-2">
                          {p.evidence.map((e, idx) => (
                            <li key={idx} className="text-[10px] leading-tight text-soy-bottle/70">
                              <span className="font-black uppercase">{e.label}:</span>{' '}
                              <span className="font-bold">{e.value}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="text-[9px] font-black uppercase text-soy-bottle/40 flex items-center gap-1">
                        VIEW SPEC <ArrowRight size={10} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}

            {replay.replayMode === 'catalog-mapping' && (
              <div className="space-y-3">
                {replay.expectedPatternIds.map((patternId) => {
                  const def = getOtsPatternDefinition(patternId);
                  if (!def) return null;
                  return (
                    <Link
                      key={patternId}
                      to={`/patterns/${patternId}`}
                      className="block p-4 border-2 border-soy-bottle bg-soy-label hover:bg-white transition-all shadow-[2px_2px_0px_#302C26]"
                    >
                      <span className="text-[9px] font-black uppercase tracking-widest text-soy-red block mb-1">
                        {def.defaultSeverity} · {def.defaultPolicyImpact}
                      </span>
                      <h4 className="text-xs font-black uppercase italic leading-tight mb-2">
                        {def.name}
                      </h4>
                      <p className="text-[10px] font-bold text-soy-bottle/60 line-clamp-2 leading-tight mb-2">
                        {def.shortDescription}
                      </p>
                      <div className="text-[9px] font-black uppercase text-soy-bottle/40 flex items-center gap-1">
                        VIEW SPEC <ArrowRight size={10} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          <section className="border-t-4 border-soy-bottle pt-6">
            <Link
              to={`/incidents/${incident.id}`}
              className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-soy-bottle hover:text-soy-red"
            >
              Read full case study <ArrowRight size={12} />
            </Link>
          </section>
        </div>
      </div>
    </article>
  );
}

export default function OtsReplays() {
  const visibleReplays = useMemo(() => {
    const allowed = new Set(['primary', 'authoritative-secondary']);
    return OTS_INCIDENT_REPLAYS
      .map((replay) => ({ replay, incident: getOtsIncident(replay.incidentId) }))
      .filter(
        (entry): entry is { replay: OtsIncidentReplay; incident: OtsIncidentCaseStudy } =>
          !!entry.incident && allowed.has(entry.incident.sourceConfidence),
      );
  }, []);

  const liveCount = visibleReplays.filter((e) => e.replay.replayMode === 'live-detector').length;
  const mappingCount = visibleReplays.filter((e) => e.replay.replayMode === 'catalog-mapping').length;

  return (
    <div className="max-w-6xl mx-auto px-4 py-12 md:py-20 font-sans text-soy-bottle">
      <Link
        to="/patterns"
        className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-soy-bottle/60 hover:text-soy-red mb-8 transition-colors"
      >
        <ArrowLeft size={14} /> Back to Pattern Library
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
            {liveCount} LIVE DETECTOR · {mappingCount} CATALOG MAPPING
          </span>
        </div>
        <h1 className="text-4xl md:text-5xl font-black uppercase italic tracking-tight mb-4">
          OTS Incident Replay Lab
        </h1>
        <p className="text-base font-bold leading-relaxed text-soy-bottle/80 max-w-3xl mb-3">
          We prove our pattern library by replaying real supply-chain incidents through the OTS detector and showing what it actually returns — not what we wish it would say.
        </p>
        <p className="text-sm font-bold leading-relaxed text-soy-bottle/60 max-w-3xl">
          Every replay on this page cites a primary or authoritative-secondary public source. For incidents whose signal shape isn't yet covered by detector v1 (workflow rows, CDN-runtime scripts), patterns are matched honestly against the catalog with a visible coverage gap note.
        </p>
      </header>

      {/* Methodology box */}
      <section className="mb-12 border-4 border-soy-bottle bg-soy-label p-6 shadow-[6px_6px_0px_#302C26]">
        <h2 className="text-sm font-black uppercase tracking-widest text-soy-bottle mb-3 flex items-center gap-2">
          <ShieldAlert size={16} className="text-soy-red" /> How To Read A Replay Card
        </h2>
        <ol className="space-y-1.5 text-xs font-bold text-soy-bottle/80 leading-relaxed">
          <li>
            <span className="text-soy-red font-black">1.</span> <strong>Source</strong> — every incident links to the primary postmortem, GitHub Advisory, or vendor disclosure. Click through and verify.
          </li>
          <li>
            <span className="text-soy-red font-black">2.</span> <strong>Observed facts</strong> — bullets pulled directly from the source above, not OpenSoyce narration.
          </li>
          <li>
            <span className="text-soy-red font-black">3.</span> <strong>Fixture row</strong> — for live-detector replays, the synthetic input we feed into <code>detectOtsPatternsForRow()</code> at render time.
          </li>
          <li>
            <span className="text-soy-red font-black">4.</span> <strong>Detector returned</strong> — the actual output of the detector, computed on this page render. If the detector or the fixture drifts from the claim, our CI fails.
          </li>
          <li>
            <span className="text-soy-red font-black">5.</span> <strong>Verdict</strong> — ALLOW / WARN / BLOCK computed from the detector output via <code>otsPatternVerdict()</code>.
          </li>
        </ol>
      </section>

      {/* Replays */}
      {visibleReplays.map(({ replay, incident }) => (
        <React.Fragment key={incident.id}>
          <ReplayCard replay={replay} incident={incident} />
        </React.Fragment>
      ))}

      {/* Detector Coverage Roadmap */}
      <section className="border-4 border-soy-bottle bg-white p-6 shadow-[6px_6px_0px_#302C26] mb-8">
        <h2 className="text-sm font-black uppercase tracking-widest text-soy-bottle mb-3 flex items-center gap-2">
          <AlertTriangle size={16} className="text-yellow-600" /> Detector Coverage Roadmap
        </h2>
        <p className="text-xs font-bold text-soy-bottle/80 leading-relaxed mb-3">
          OTS Detector v1 is package-row shaped. The two catalog-mapping replays on this page document signal shapes the detector does not yet cover natively:
        </p>
        <ul className="space-y-2 text-xs font-bold text-soy-bottle/80 leading-relaxed">
          <li>
            <span className="text-soy-red font-black">▪</span> <strong>Workflow rows</strong> (tj-actions shape) — mutable tag drift, third-party action references, secret-bearing CI jobs. Queued for Detector v2.
          </li>
          <li>
            <span className="text-soy-red font-black">▪</span> <strong>CDN / runtime-script rows</strong> (polyfill.io shape) — third-party origin trust, runtime payload inspection. Queued for Detector v2.
          </li>
        </ul>
        <p className="text-[10px] font-bold text-soy-bottle/50 uppercase tracking-wider mt-4">
          We surface this gap on the proof page rather than hide it. Honesty about coverage is part of the trust story.
        </p>
      </section>
    </div>
  );
}
