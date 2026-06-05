import { Fragment } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Workflow,
  History,
  KeyRound,
} from 'lucide-react';
import {
  getRepoTrustPosture,
  REPO_TRUST_MVP_FOCUS,
  type RepoTrustPosture,
  type RepoTrustPostureLabel,
  type RepoTrustSeverity,
} from '../data/repoTrustDashboard';
import {
  TRUST_TIMELINE_EVENTS,
  type TrustTimelineEvent,
  type TrustTimelineEventType,
  type TrustTimelineLayer,
} from '../data/trustTimeline';

const postureColor: Record<RepoTrustPostureLabel, string> = {
  'use-ready': 'bg-emerald-500 text-white',
  watchlist: 'bg-yellow-400 text-soy-bottle',
  risky: 'bg-soy-red text-white',
  graveyard: 'bg-soy-bottle text-white',
};

const postureCopy: Record<RepoTrustPostureLabel, string> = {
  'use-ready': 'USE READY',
  watchlist: 'WATCHLIST',
  risky: 'RISKY',
  graveyard: 'GRAVEYARD',
};

const actionColor: Record<string, string> = {
  BLOCK: 'bg-soy-red text-white',
  WARN: 'bg-yellow-400 text-soy-bottle',
  ALLOW: 'bg-emerald-500 text-white',
};

const severityColor: Record<RepoTrustSeverity, string> = {
  critical: 'bg-soy-red text-white',
  high: 'bg-yellow-500 text-soy-bottle',
  medium: 'bg-yellow-400 text-soy-bottle',
  low: 'bg-soy-label text-soy-bottle',
};

const timelineTypeColor: Record<TrustTimelineEventType, string> = {
  decision_change: 'bg-soy-red text-white',
  firing_set_change: 'bg-yellow-400 text-soy-bottle',
  parity_event: 'bg-emerald-500 text-white',
  surface_shipped: 'bg-soy-bottle text-white',
  evidence_capture: 'bg-white text-soy-bottle border-2 border-soy-bottle',
  review_event: 'bg-yellow-500 text-soy-bottle',
};

const timelineTypeLabel: Record<TrustTimelineEventType, string> = {
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

function filterTimelineEvents(posture: RepoTrustPosture, limit: number): TrustTimelineEvent[] {
  const byPkg = posture.timelinePreviewFilter.byPackage;
  const byPr = posture.timelinePreviewFilter.byPr;
  const matches = TRUST_TIMELINE_EVENTS.filter((ev) => {
    if (byPkg && byPkg.length > 0) {
      if (!ev.package || !byPkg.includes(ev.package)) return false;
    }
    if (byPr && byPr.length > 0) {
      if (!byPr.includes(ev.pr)) return false;
    }
    return true;
  });
  return [...matches].reverse().slice(0, limit);
}

function PostureHeader({ posture }: { posture: RepoTrustPosture }) {
  return (
    <header className="mb-12 border-b-8 border-soy-bottle pb-8">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <span className="border-2 border-soy-bottle bg-soy-red text-white px-3 py-1 text-xs font-black uppercase tracking-widest shadow-[2px_2px_0px_#302C26]">
          REPO TRUST DASHBOARD
        </span>
        <span className="border-2 border-soy-bottle bg-white text-soy-bottle px-3 py-1 text-xs font-black uppercase tracking-widest shadow-[2px_2px_0px_#302C26]">
          v0 · static MVP
        </span>
        <span className={`border-2 border-soy-bottle px-3 py-1 text-xs font-black uppercase tracking-widest shadow-[2px_2px_0px_#302C26] ${postureColor[posture.postureLabel]}`}>
          {postureCopy[posture.postureLabel]}
        </span>
      </div>
      <h1 className="text-4xl md:text-5xl font-black uppercase italic tracking-tight mb-4 break-all">
        {posture.owner} / {posture.repo}
      </h1>
      <p className="text-base font-bold leading-relaxed text-soy-bottle/80 max-w-3xl">
        {posture.postureSummary}
      </p>
      <p className="text-xs font-bold text-soy-bottle/50 uppercase tracking-wider mt-4">
        Last evaluated: {posture.lastEvaluated} · Workflow findings source: {posture.workflowFindingsSource}
      </p>
    </header>
  );
}

function SummarySection({ posture }: { posture: RepoTrustPosture }) {
  return (
    <section className="mb-10 border-4 border-soy-bottle bg-white p-6 shadow-[6px_6px_0px_#302C26]">
      <h2 className="text-sm font-black uppercase tracking-widest text-soy-bottle mb-3 flex items-center gap-2">
        <BookOpen size={16} /> 1 · Summary
      </h2>
      <p className="text-xs font-bold text-soy-bottle/80 leading-relaxed mb-4">
        Posture: <span className={`inline-block px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border-2 border-soy-bottle ${postureColor[posture.postureLabel]}`}>{postureCopy[posture.postureLabel]}</span>{' '}
        — composed from the gate examples below, the workflow findings, and the absence of risky deps in this repo's static MVP posture.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          to={`/projects/${posture.owner}/${posture.repo}`}
          className="inline-flex items-center gap-2 border-4 border-soy-bottle bg-white text-soy-bottle px-4 py-2 text-xs font-black uppercase tracking-widest shadow-[4px_4px_0px_#302C26] hover:bg-soy-label transition-colors"
        >
          Project detail (SOYCE score, full scan) <ArrowRight size={12} />
        </Link>
        <Link
          to="/proof/gate"
          className="inline-flex items-center gap-2 border-4 border-soy-bottle bg-soy-bottle text-white px-4 py-2 text-xs font-black uppercase tracking-widest shadow-[4px_4px_0px_#302C26] hover:bg-soy-red transition-colors"
        >
          Run live gate on a dependency <ArrowRight size={12} />
        </Link>
      </div>
    </section>
  );
}

function GateStatusSection({ posture }: { posture: RepoTrustPosture }) {
  return (
    <section className="mb-10 border-4 border-soy-bottle bg-white p-6 shadow-[6px_6px_0px_#302C26]">
      <h2 className="text-sm font-black uppercase tracking-widest text-soy-bottle mb-3 flex items-center gap-2">
        <ShieldCheck size={16} className="text-emerald-600" /> 2 · Gate Status
      </h2>
      <p className="text-xs font-bold text-soy-bottle/70 leading-relaxed mb-4">
        Each example below links out to <Link to="/proof/gate" className="underline decoration-2 underline-offset-2 hover:text-soy-red">/proof/gate</Link>. This page does not call the gate API — the gate page is the verbatim API mirror.
      </p>
      <div className="space-y-3">
        {posture.gateExamples.map((ex) => (
          <Fragment key={ex.packageQuery}>
            <div className="p-4 border-2 border-soy-bottle bg-soy-label shadow-[2px_2px_0px_#302C26]">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border-2 border-soy-bottle ${actionColor[ex.expectedAction] || 'bg-gray-300 text-soy-bottle'}`}>
                  {ex.expectedAction}
                </span>
                <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border-2 border-soy-bottle bg-white text-soy-bottle/70">
                  {ex.expectedPatternCount} {ex.expectedPatternCount === 1 ? 'pattern' : 'patterns'} expected
                </span>
              </div>
              <h3 className="text-base font-black uppercase italic tracking-tight break-all mb-2">
                {ex.packageQuery}
              </h3>
              <p className="text-xs font-bold text-soy-bottle/70 leading-relaxed mb-3">
                {ex.rationale}
              </p>
              <Link
                to={`/proof/gate?package=${encodeURIComponent(ex.packageQuery)}`}
                className="inline-flex items-center gap-2 border-4 border-soy-bottle bg-soy-bottle text-white px-3 py-1.5 text-[11px] font-black uppercase tracking-widest shadow-[2px_2px_0px_#302C26] hover:bg-soy-red transition-colors"
              >
                Run live gate <ArrowRight size={12} />
              </Link>
            </div>
          </Fragment>
        ))}
      </div>
    </section>
  );
}

function RiskyDepsSection({ posture }: { posture: RepoTrustPosture }) {
  if (posture.riskyDeps.length === 0) {
    return (
      <section className="mb-10 border-4 border-soy-bottle bg-white p-6 shadow-[6px_6px_0px_#302C26]">
        <h2 className="text-sm font-black uppercase tracking-widest text-soy-bottle mb-3 flex items-center gap-2">
          <AlertTriangle size={16} className="text-yellow-600" /> 3 · Risky Deps
        </h2>
        <p className="text-xs font-bold text-soy-bottle/70 italic leading-relaxed">
          No risky deps in this repo's static MVP posture. The MVP exposes the gate examples (above) and the workflow risks (below) instead. Inventing rows here would be a doctrine violation.
        </p>
      </section>
    );
  }
  return (
    <section className="mb-10 border-4 border-soy-bottle bg-white p-6 shadow-[6px_6px_0px_#302C26]">
      <h2 className="text-sm font-black uppercase tracking-widest text-soy-bottle mb-3 flex items-center gap-2">
        <AlertTriangle size={16} className="text-soy-red" /> 3 · Risky Deps
      </h2>
      <div className="space-y-2">
        {posture.riskyDeps.map((dep) => (
          <Fragment key={dep.packageQuery}>
            <div className="p-3 border-2 border-soy-bottle bg-soy-label">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border-2 border-soy-bottle ${severityColor[dep.severity]}`}>
                  {dep.severity.toUpperCase()}
                </span>
                <span className="text-xs font-black uppercase italic tracking-tight break-all">
                  {dep.packageQuery}
                </span>
              </div>
              <p className="text-[11px] font-bold text-soy-bottle/70 leading-relaxed">
                {dep.reason}
              </p>
            </div>
          </Fragment>
        ))}
      </div>
    </section>
  );
}

function WorkflowRisksSection({ posture }: { posture: RepoTrustPosture }) {
  if (posture.workflowFindings.length === 0) {
    return (
      <section className="mb-10 border-4 border-soy-bottle bg-white p-6 shadow-[6px_6px_0px_#302C26]">
        <h2 className="text-sm font-black uppercase tracking-widest text-soy-bottle mb-3 flex items-center gap-2">
          <Workflow size={16} /> 4 · Workflow Risks
        </h2>
        <p className="text-xs font-bold text-soy-bottle/70 italic leading-relaxed">
          No workflow risks in this repo's static MVP posture.
        </p>
      </section>
    );
  }
  return (
    <section className="mb-10 border-4 border-soy-bottle bg-white p-6 shadow-[6px_6px_0px_#302C26]">
      <h2 className="text-sm font-black uppercase tracking-widest text-soy-bottle mb-3 flex items-center gap-2">
        <Workflow size={16} /> 4 · Workflow Risks ({posture.workflowFindings.length})
      </h2>
      <p className="text-xs font-bold text-soy-bottle/70 leading-relaxed mb-4">
        Source: <code>{posture.workflowFindingsSource}</code>. Findings mirror the verbatim output of <code>scanRepoWorkflows</code> on this repo's <code>.github/workflows/*.yml</code>.
      </p>
      <div className="space-y-3">
        {posture.workflowFindings.map((f) => (
          <Fragment key={`${f.patternId}-${f.origin}`}>
            <Link
              to={`/patterns/${f.patternId}`}
              className="block p-4 border-2 border-soy-bottle bg-soy-label hover:bg-white transition-all shadow-[2px_2px_0px_#302C26]"
            >
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border-2 border-soy-bottle ${severityColor[f.severity]}`}>
                  {f.severity.toUpperCase()}
                </span>
                <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border-2 border-soy-bottle ${actionColor[f.policyImpact.toUpperCase()] || 'bg-white text-soy-bottle'}`}>
                  {f.policyImpact.toUpperCase()}
                </span>
              </div>
              <h3 className="text-sm font-black uppercase italic tracking-tight leading-tight mb-2">
                {f.patternName}
              </h3>
              <ul className="space-y-0.5">
                <li className="text-[11px] leading-tight text-soy-bottle/70 break-words">
                  <span className="font-black uppercase">Source:</span> <span className="font-bold">{f.source}</span>
                </li>
                <li className="text-[11px] leading-tight text-soy-bottle/70 break-words">
                  <span className="font-black uppercase">Origin:</span> <span className="font-bold font-mono">{f.origin}</span>
                </li>
                {f.writeScopes && (
                  <li className="text-[11px] leading-tight text-soy-bottle/70 break-words">
                    <span className="font-black uppercase">Write Scopes:</span> <span className="font-bold font-mono">{f.writeScopes}</span>
                  </li>
                )}
              </ul>
            </Link>
          </Fragment>
        ))}
      </div>
    </section>
  );
}

function TimelinePreviewSection({ posture }: { posture: RepoTrustPosture }) {
  const events = filterTimelineEvents(posture, 3);
  return (
    <section className="mb-10 border-4 border-soy-bottle bg-white p-6 shadow-[6px_6px_0px_#302C26]">
      <h2 className="text-sm font-black uppercase tracking-widest text-soy-bottle mb-3 flex items-center gap-2">
        <History size={16} /> 5 · Timeline Preview (most recent {events.length})
      </h2>
      <p className="text-xs font-bold text-soy-bottle/70 leading-relaxed mb-4">
        Filtered from <Link to="/proof/timeline" className="underline decoration-2 underline-offset-2 hover:text-soy-red">/proof/timeline</Link>{' '}
        by package: <code>{posture.timelinePreviewFilter.byPackage?.join(', ') ?? '—'}</code>.
      </p>
      {events.length === 0 ? (
        <p className="text-xs font-bold text-soy-bottle/70 italic leading-relaxed">
          No timeline events match this repo's filter.
        </p>
      ) : (
        <div className="space-y-3">
          {events.map((ev) => (
            <Fragment key={`${ev.pr}-${ev.type}`}>
              <article className="p-3 border-2 border-soy-bottle bg-soy-label shadow-[2px_2px_0px_#302C26]">
                <div className="flex flex-wrap items-center gap-2 mb-2 text-[9px] font-black uppercase tracking-widest">
                  <span className={`px-2 py-0.5 border-2 border-soy-bottle ${timelineTypeColor[ev.type]}`}>{timelineTypeLabel[ev.type]}</span>
                  <span className="px-2 py-0.5 border-2 border-soy-bottle bg-white text-soy-bottle/70">LAYER · {layerLabel[ev.layer]}</span>
                  <span className="px-2 py-0.5 border-2 border-soy-bottle bg-white text-soy-bottle/50">{ev.date}</span>
                </div>
                <p className="text-xs font-bold leading-relaxed text-soy-bottle">
                  {ev.summary}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-black uppercase tracking-wider text-soy-bottle/60">
                  <a
                    href={`https://github.com/freewho99/opensoyce/pull/${ev.pr}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:text-soy-red"
                  >
                    PR #{ev.pr} <ExternalLink size={9} />
                  </a>
                  <a
                    href={`https://github.com/freewho99/opensoyce/commit/${ev.sha}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-mono hover:text-soy-red"
                  >
                    {ev.sha} <ExternalLink size={9} />
                  </a>
                </div>
              </article>
            </Fragment>
          ))}
        </div>
      )}
      <div className="mt-4">
        <Link
          to="/proof/timeline"
          className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-soy-bottle hover:text-soy-red"
        >
          View full Timeline <ArrowRight size={12} />
        </Link>
      </div>
    </section>
  );
}

function ExceptionsPlaceholderSection({ posture }: { posture: RepoTrustPosture }) {
  return (
    <section className="mb-10 border-4 border-soy-bottle bg-white p-6 shadow-[6px_6px_0px_#302C26]">
      <h2 className="text-sm font-black uppercase tracking-widest text-soy-bottle mb-3 flex items-center gap-2">
        <KeyRound size={16} /> 6 · Repo-Specific Gate Exceptions
      </h2>
      <p className="text-xs font-bold text-soy-bottle/70 leading-relaxed mb-3">
        Active exceptions: <span className="font-black">{posture.exceptionsPlaceholder.count}</span>
      </p>
      <p className="text-xs font-bold text-soy-bottle/70 leading-relaxed mb-3">
        {posture.exceptionsPlaceholder.message}
      </p>
      <Link
        to="/admin/appeals"
        className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-soy-bottle/60 hover:text-soy-red"
      >
        Existing appeal flow (candidate-pipeline arc) <ArrowRight size={12} />
      </Link>
    </section>
  );
}

function CrossLinkPanel({ posture }: { posture: RepoTrustPosture }) {
  return (
    <section className="border-4 border-soy-bottle bg-white p-6 shadow-[6px_6px_0px_#302C26]">
      <h2 className="text-sm font-black uppercase tracking-widest text-soy-bottle mb-3 flex items-center gap-2">
        <BookOpen size={16} /> Where The Dashboard Fits
      </h2>
      <p className="text-xs font-bold text-soy-bottle/80 leading-relaxed mb-3">
        The Dashboard composes existing surfaces; it does not replace them.
      </p>
      <ul className="space-y-2 text-xs font-bold text-soy-bottle/80 leading-relaxed">
        <li>
          <Link to="/proof/gate" className="text-soy-red font-black underline decoration-2 underline-offset-2 hover:no-underline">/proof/gate</Link>{' '}
          — current gate decision (verbatim API mirror).
        </li>
        <li>
          <Link to="/proof/timeline" className="text-soy-red font-black underline decoration-2 underline-offset-2 hover:no-underline">/proof/timeline</Link>{' '}
          — full trust-decision history.
        </li>
        <li>
          <Link to={`/projects/${posture.owner}/${posture.repo}`} className="text-soy-red font-black underline decoration-2 underline-offset-2 hover:no-underline">/projects/{posture.owner}/{posture.repo}</Link>{' '}
          — existing project detail (SOYCE score, full scan).
        </li>
        <li>
          <Link to="/patterns" className="text-soy-red font-black underline decoration-2 underline-offset-2 hover:no-underline">/patterns</Link>{' '}
          — catalog coverage (20 of 31 gate-active).
        </li>
        <li>
          <Link to="/proof/ots-replays" className="text-soy-red font-black underline decoration-2 underline-offset-2 hover:no-underline">/proof/ots-replays</Link>{' '}
          — live-detector replays of cited public incidents.
        </li>
      </ul>
      <p className="text-[10px] font-bold text-soy-bottle/50 uppercase tracking-wider mt-4">
        Risk does not lose its name because someone needed to ship.
      </p>
    </section>
  );
}

function EmptyStateForUnknownRepo({ owner, repo }: { owner: string; repo: string }) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16 font-sans text-soy-bottle">
      <Link
        to={`/projects/${owner}/${repo}`}
        className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-soy-bottle/60 hover:text-soy-red mb-8 transition-colors"
      >
        <ArrowLeft size={14} /> Back to project detail
      </Link>
      <div className="border-4 border-soy-bottle bg-white p-8 shadow-[8px_8px_0px_#302C26]">
        <ShieldAlert className="text-soy-red mb-4" size={48} />
        <h1 className="text-2xl md:text-3xl font-black uppercase italic tracking-tight mb-4 break-all">
          No static posture for {owner}/{repo}
        </h1>
        <p className="text-sm font-bold text-soy-bottle/70 leading-relaxed mb-3">
          The Repo Trust Dashboard MVP supports exactly one focus repo today:{' '}
          <Link to={`/projects/${REPO_TRUST_MVP_FOCUS.owner}/${REPO_TRUST_MVP_FOCUS.repo}/trust`} className="text-soy-red underline decoration-2 underline-offset-2 hover:no-underline">
            {REPO_TRUST_MVP_FOCUS.owner}/{REPO_TRUST_MVP_FOCUS.repo}
          </Link>.
        </p>
        <p className="text-xs font-bold text-soy-bottle/60 leading-relaxed">
          Multi-repo support, persistent posture, and auth-gated dashboards for org-private repos are queued in separate ADRs. Inventing posture data for an unscanned repo would be a doctrine violation.
        </p>
      </div>
    </div>
  );
}

export default function RepoTrustDashboard() {
  const { owner = '', repo = '' } = useParams<{ owner: string; repo: string }>();
  const posture = getRepoTrustPosture(owner, repo);

  if (!posture) {
    return <EmptyStateForUnknownRepo owner={owner} repo={repo} />;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 md:py-20 font-sans text-soy-bottle">
      <Link
        to={`/projects/${posture.owner}/${posture.repo}`}
        className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-soy-bottle/60 hover:text-soy-red mb-8 transition-colors"
      >
        <ArrowLeft size={14} /> Back to project detail
      </Link>

      <PostureHeader posture={posture} />
      <SummarySection posture={posture} />
      <GateStatusSection posture={posture} />
      <RiskyDepsSection posture={posture} />
      <WorkflowRisksSection posture={posture} />
      <TimelinePreviewSection posture={posture} />
      <ExceptionsPlaceholderSection posture={posture} />
      <CrossLinkPanel posture={posture} />
    </div>
  );
}
