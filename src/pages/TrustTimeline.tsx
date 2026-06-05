import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import {
  TRUST_TIMELINE_EVENTS,
  TRUST_TIMELINE_MVP_FOCUS_PACKAGE,
  type TrustTimelineEvent,
  type TrustTimelineEventType,
  type TrustTimelineLayer,
} from '../data/trustTimeline';

const typeColor: Record<TrustTimelineEventType, string> = {
  decision_change: 'bg-soy-red text-white',
  firing_set_change: 'bg-yellow-400 text-soy-bottle',
  parity_event: 'bg-emerald-500 text-white',
  surface_shipped: 'bg-soy-bottle text-white',
  evidence_capture: 'bg-white text-soy-bottle border-2 border-soy-bottle',
  review_event: 'bg-yellow-500 text-soy-bottle',
};

const typeLabel: Record<TrustTimelineEventType, string> = {
  decision_change: 'DECISION CHANGE',
  firing_set_change: 'FIRING SET CHANGE',
  parity_event: 'PARITY EVENT',
  surface_shipped: 'SURFACE SHIPPED',
  evidence_capture: 'EVIDENCE CAPTURE',
  review_event: 'REVIEW EVENT',
};

const layerLabel: Record<TrustTimelineLayer, string> = {
  evidence: 'EVIDENCE',
  wiring: 'WIRING',
  surface: 'SURFACE',
  policy: 'POLICY',
};

function EventCard({ event }: { event: TrustTimelineEvent }) {
  const prHref = `https://github.com/freewho99/opensoyce/pull/${event.pr}`;
  const shaHref = `https://github.com/freewho99/opensoyce/commit/${event.sha}`;
  return (
    <article className="border-4 border-soy-bottle bg-white p-6 shadow-[6px_6px_0px_#302C26]">
      <div className="flex flex-wrap items-center gap-2 mb-3 text-[10px] font-black uppercase tracking-widest">
        <span className={`px-3 py-1 border-2 border-soy-bottle ${typeColor[event.type]}`}>
          {typeLabel[event.type]}
        </span>
        <span className="border-2 border-soy-bottle bg-soy-label text-soy-bottle px-3 py-1">
          LAYER · {layerLabel[event.layer]}
        </span>
        <span className="border-2 border-soy-bottle bg-soy-label text-soy-bottle/60 px-3 py-1">
          {event.date}
        </span>
      </div>
      <p className="text-sm font-bold leading-relaxed text-soy-bottle mb-4">
        {event.summary}
      </p>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] font-black uppercase tracking-wider text-soy-bottle/70">
        <a
          href={prHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:text-soy-red"
        >
          PR #{event.pr} <ExternalLink size={10} />
        </a>
        <a
          href={shaHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-mono hover:text-soy-red"
        >
          {event.sha} <ExternalLink size={10} />
        </a>
        {event.references?.map((ref) =>
          ref.href.startsWith('/') ? (
            <Link
              key={ref.href}
              to={ref.href}
              className="inline-flex items-center gap-1 hover:text-soy-red"
            >
              {ref.label} <ArrowRight size={10} />
            </Link>
          ) : (
            <a
              key={ref.href}
              href={ref.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-soy-red"
            >
              {ref.label} <ExternalLink size={10} />
            </a>
          ),
        )}
      </div>
    </article>
  );
}

export default function TrustTimeline() {
  // Reverse-chronological by default (most recent first). 8 events fit on
  // one viewport; no filter / search / pagination per the sketch's MVP rules.
  const events = [...TRUST_TIMELINE_EVENTS].reverse();
  const focusGateHref = `/proof/gate?package=${encodeURIComponent(`${TRUST_TIMELINE_MVP_FOCUS_PACKAGE}@0.7.29`)}`;
  return (
    <div className="max-w-6xl mx-auto px-4 py-12 md:py-20 font-sans text-soy-bottle">
      <Link
        to="/proof/gate"
        className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-soy-bottle/60 hover:text-soy-red mb-8 transition-colors"
      >
        <ArrowLeft size={14} /> Back to Production Gate Lookup
      </Link>

      {/* Hero */}
      <header className="mb-12 border-b-8 border-soy-bottle pb-8">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className="border-2 border-soy-bottle bg-soy-red text-white px-3 py-1 text-xs font-black uppercase tracking-widest shadow-[2px_2px_0px_#302C26]">
            Proof Layer
          </span>
          <span className="border-2 border-soy-bottle bg-white text-soy-bottle px-3 py-1 text-xs font-black uppercase tracking-widest shadow-[2px_2px_0px_#302C26]">
            v0
          </span>
          <span className="border-2 border-soy-bottle bg-emerald-500 text-white px-3 py-1 text-xs font-black uppercase tracking-widest shadow-[2px_2px_0px_#302C26]">
            Static MVP · {TRUST_TIMELINE_EVENTS.length} events
          </span>
        </div>
        <h1 className="text-4xl md:text-5xl font-black uppercase italic tracking-tight mb-4">
          Trust changes should leave a record.
        </h1>
        <p className="text-base font-bold leading-relaxed text-soy-bottle/80 max-w-3xl">
          The Trust Timeline is not the current gate decision — for that, use <Link to="/proof/gate" className="underline decoration-2 underline-offset-2 hover:text-soy-red">/proof/gate</Link>. The Timeline is the record of how trust decisions changed, and why, anchored to merged PRs and commit SHAs already on <code>main</code>. The MVP focuses on a single package, <code>ua-parser-js@0.7.29</code>, across the closed OTS proof-package arc.
        </p>
      </header>

      {/* Methodology */}
      <section className="mb-12 border-4 border-soy-bottle bg-soy-label p-6 shadow-[6px_6px_0px_#302C26]">
        <h2 className="text-sm font-black uppercase tracking-widest text-soy-bottle mb-3 flex items-center gap-2">
          <ShieldAlert size={16} className="text-soy-red" /> How To Read The Timeline
        </h2>
        <ol className="space-y-1.5 text-xs font-bold text-soy-bottle/80 leading-relaxed">
          <li>
            <span className="text-soy-red font-black">1.</span> Every event has a <strong>type</strong> (one of six: decision change, firing-set change, parity event, surface shipped, evidence capture, review event) and a <strong>layer</strong> (evidence, wiring, surface, policy). Type and layer are separate fields — same doctrine as the proof package's four-layer model.
          </li>
          <li>
            <span className="text-soy-red font-black">2.</span> Every event has a <strong>PR number</strong> and a <strong>commit SHA</strong>. Both link to GitHub. There are no synthesized events.
          </li>
          <li>
            <span className="text-soy-red font-black">3.</span> A <strong>decision change</strong> means the policy result flipped (e.g., ALLOW → BLOCK). A <strong>firing-set change</strong> means the patterns the detector emitted changed but the decision did not. A <strong>parity event</strong> means a deployed surface and the canonical local evidence diverged or re-converged.
          </li>
          <li>
            <span className="text-soy-red font-black">4.</span> The MVP data lives in <code>src/data/trustTimeline.ts</code> as a static array. No database. No persistence. Migration to git-backed or DB-backed events is a separate ADR.
          </li>
        </ol>
      </section>

      {/* Focus package card */}
      <section className="mb-12 border-4 border-soy-bottle bg-white p-6 shadow-[6px_6px_0px_#302C26]">
        <div className="flex flex-wrap items-center gap-3 mb-3 text-[10px] font-black uppercase tracking-widest text-soy-bottle/40">
          MVP FOCUS PACKAGE
        </div>
        <h2 className="text-2xl md:text-3xl font-black uppercase italic tracking-tight mb-2">
          {TRUST_TIMELINE_MVP_FOCUS_PACKAGE}@0.7.29
        </h2>
        <p className="text-sm font-bold text-soy-bottle/70 leading-relaxed mb-4">
          Four captured states across the arc: ALLOW (medium, 1 pattern) → BLOCK (critical, 1 pattern) → BLOCK (critical, 4 patterns) → production parity restored. All three transitions visible below. MVP scope is one package; repo-specific and multi-package timelines are queued in their own ADRs.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            to={focusGateHref}
            className="inline-flex items-center gap-2 border-4 border-soy-bottle bg-soy-bottle text-white px-4 py-2 text-xs font-black uppercase tracking-widest shadow-[4px_4px_0px_#302C26] hover:bg-soy-red transition-colors"
          >
            Run live gate now <ArrowRight size={12} />
          </Link>
          <a
            href="https://github.com/freewho99/opensoyce/blob/main/docs/proof/before-after-risk-example.md#capture-history"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 border-4 border-soy-bottle bg-white text-soy-bottle px-4 py-2 text-xs font-black uppercase tracking-widest shadow-[4px_4px_0px_#302C26] hover:bg-soy-label transition-colors"
          >
            Capture history <ExternalLink size={12} />
          </a>
        </div>
      </section>

      {/* Event list */}
      <section className="mb-12">
        <h2 className="text-xs font-black uppercase tracking-widest text-soy-bottle/40 mb-6 flex items-center gap-2">
          <ShieldCheck size={14} className="text-emerald-600" /> Events ({events.length}, reverse-chronological)
        </h2>
        <div className="space-y-4">
          {events.map((event) => (
            <Fragment key={`${event.pr}-${event.type}`}>
              <EventCard event={event} />
            </Fragment>
          ))}
        </div>
      </section>

      {/* Event type legend */}
      <section className="mb-12 border-4 border-soy-bottle bg-white p-6 shadow-[6px_6px_0px_#302C26]">
        <h2 className="text-sm font-black uppercase tracking-widest text-soy-bottle mb-4">
          Event Type Legend
        </h2>
        <ul className="space-y-2 text-xs font-bold text-soy-bottle/80 leading-relaxed">
          <li><span className={`inline-block px-2 py-0.5 mr-2 text-[9px] font-black uppercase tracking-widest border-2 border-soy-bottle ${typeColor.decision_change}`}>DECISION CHANGE</span> The policy result (ALLOW / WARN / BLOCK) flipped on the same input.</li>
          <li><span className={`inline-block px-2 py-0.5 mr-2 text-[9px] font-black uppercase tracking-widest border-2 border-soy-bottle ${typeColor.firing_set_change}`}>FIRING SET CHANGE</span> The set of patterns the detector emitted changed; the decision did not.</li>
          <li><span className={`inline-block px-2 py-0.5 mr-2 text-[9px] font-black uppercase tracking-widest border-2 border-soy-bottle ${typeColor.parity_event}`}>PARITY EVENT</span> A deployed surface and the canonical local evidence diverged or re-converged.</li>
          <li><span className={`inline-block px-2 py-0.5 mr-2 text-[9px] font-black uppercase tracking-widest border-2 border-soy-bottle ${typeColor.surface_shipped}`}>SURFACE SHIPPED</span> A new public surface for inspecting trust decisions went live.</li>
          <li><span className={`inline-block px-2 py-0.5 mr-2 text-[9px] font-black uppercase tracking-widest border-2 border-soy-bottle ${typeColor.evidence_capture}`}>EVIDENCE CAPTURE</span> A verbatim trust-decision capture was recorded in the repo.</li>
          <li><span className={`inline-block px-2 py-0.5 mr-2 text-[9px] font-black uppercase tracking-widest border-2 border-soy-bottle ${typeColor.review_event}`}>REVIEW EVENT</span> A human review action altered the trust state. Reserved for cross-arc use; not in the MVP data set.</li>
        </ul>
      </section>

      {/* Production verification recipe */}
      <section className="mb-12 border-4 border-soy-bottle bg-soy-bottle text-white p-6 shadow-[6px_6px_0px_#302C26]">
        <h2 className="text-sm font-black uppercase tracking-widest mb-3 flex items-center gap-2">
          <ShieldCheck size={16} className="text-emerald-400" /> Production Verification Recipe
        </h2>
        <p className="text-xs font-bold text-white/70 leading-relaxed mb-3">
          Run this any time you doubt the Timeline. If the curl returns anything other than <code>"action":"BLOCK"</code>, the live gate is not at parity with the canonical capture history.
        </p>
        <pre className="text-[11px] font-mono bg-black text-white p-4 overflow-x-auto border-2 border-white/20 whitespace-pre-wrap">
{`curl -sS -X POST "https://opensoyce-f336.vercel.app/api/exceptions?action=compliance-gate" \\
  -H "Content-Type: application/json" \\
  -d '{"dependencies":["ua-parser-js@0.7.29"]}' | grep -o '"action":"[^"]*"'`}
        </pre>
        <p className="text-[10px] font-bold text-white/50 uppercase tracking-wider mt-3">
          Same recipe as docs/proof/phase-closeout.md.
        </p>
      </section>

      {/* Cross-link panel */}
      <section className="border-4 border-soy-bottle bg-white p-6 shadow-[6px_6px_0px_#302C26]">
        <h2 className="text-sm font-black uppercase tracking-widest text-soy-bottle mb-3 flex items-center gap-2">
          <BookOpen size={16} /> Where The Timeline Fits
        </h2>
        <p className="text-xs font-bold text-soy-bottle/80 leading-relaxed mb-3">
          The Timeline is one node in the proof-surface graph. The other surfaces:
        </p>
        <ul className="space-y-2 text-xs font-bold text-soy-bottle/80 leading-relaxed">
          <li>
            <Link to="/patterns" className="text-soy-red font-black underline decoration-2 underline-offset-2 hover:no-underline">/patterns</Link> — catalog coverage (20 of 31 gate-active today).
          </li>
          <li>
            <Link to="/proof/ots-replays" className="text-soy-red font-black underline decoration-2 underline-offset-2 hover:no-underline">/proof/ots-replays</Link> — live-detector replays of cited public incidents.
          </li>
          <li>
            <Link to="/proof/gate" className="text-soy-red font-black underline decoration-2 underline-offset-2 hover:no-underline">/proof/gate</Link> — live production gate, verbatim API mirror.
          </li>
          <li>
            <a
              href="https://github.com/freewho99/opensoyce/blob/main/docs/proof/doctrine-pattern-enforcement.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-soy-red font-black underline decoration-2 underline-offset-2 hover:no-underline inline-flex items-center gap-1"
            >
              doctrine-pattern-enforcement.md <ExternalLink size={11} />
            </a>{' '}
            — the four-layer doctrine (pattern, evidence, policy, enforcement).
          </li>
          <li>
            <a
              href="https://github.com/freewho99/opensoyce/blob/main/docs/proof/phase-closeout.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-soy-red font-black underline decoration-2 underline-offset-2 hover:no-underline inline-flex items-center gap-1"
            >
              phase-closeout.md <ExternalLink size={11} />
            </a>{' '}
            — full arc record. The Timeline is the visual rendering of the transitions listed there.
          </li>
        </ul>
        <p className="text-[10px] font-bold text-soy-bottle/50 uppercase tracking-wider mt-4">
          Risk does not lose its name because someone needed to ship.
        </p>
      </section>
    </div>
  );
}
