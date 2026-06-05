import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  History,
  KeyRound,
  Workflow,
  GraduationCap,
  Download,
  Compass,
} from 'lucide-react';
import {
  OPEN_SOURCE_TRUST_CENTER_MVP_SUBJECT,
  OPEN_SOURCE_TRUST_CENTER_SUBJECTS,
  groupClaimsBySection,
  type TrustCenterPostureLabel,
  type TrustCenterProofType,
  type TrustCenterSectionId,
  type TrustClaim,
  type TrustCenterSubject,
  type TrustProofAnchor,
} from '../data/openSourceTrustCenter';

const postureColor: Record<TrustCenterPostureLabel, string> = {
  'use-ready': 'bg-emerald-500 text-white',
  watchlist: 'bg-yellow-400 text-soy-bottle',
  risky: 'bg-soy-red text-white',
  graveyard: 'bg-soy-bottle text-white',
};

const postureCopy: Record<TrustCenterPostureLabel, string> = {
  'use-ready': 'USE READY',
  watchlist: 'WATCHLIST',
  risky: 'RISKY',
  graveyard: 'GRAVEYARD',
};

const proofTypeBadge: Record<TrustCenterProofType, string> = {
  pr: 'bg-soy-red text-white',
  'live-surface': 'bg-emerald-500 text-white',
  'doc-anchor': 'bg-yellow-400 text-soy-bottle',
  'proof-artifact': 'bg-soy-bottle text-white',
};

const proofTypeLabel: Record<TrustCenterProofType, string> = {
  pr: 'PR + SHA',
  'live-surface': 'LIVE SURFACE',
  'doc-anchor': 'DOC ANCHOR',
  'proof-artifact': 'PROOF ARTIFACT',
};

type SectionMeta = {
  number: string;
  title: string;
  icon: typeof ShieldCheck;
  blurb: string;
  emptyPlaceholder?: boolean;
};

const sectionMeta: Record<TrustCenterSectionId, SectionMeta> = {
  'trust-posture': {
    number: '1',
    title: 'Trust Posture',
    icon: ShieldCheck,
    blurb:
      'How OpenSoyce reads on the same posture vocabulary the Repo Trust Dashboard uses for everyone else.',
  },
  'gate-proof': {
    number: '2',
    title: 'Gate Proof',
    icon: ShieldAlert,
    blurb:
      'Trust decisions are made by a deployed gate. Every claim here links to the surface that proves it.',
  },
  'timeline-proof': {
    number: '3',
    title: 'Timeline Proof',
    icon: History,
    blurb:
      'Trust changes leave a record. The Timeline page renders the static 8-event MVP across the closed OTS arc.',
  },
  'dashboard-proof': {
    number: '4',
    title: 'Dashboard Proof',
    icon: Workflow,
    blurb:
      'Per-repo trust posture is a deployed surface. The Dashboard composes Gate + Timeline + workflow scan into one view.',
  },
  'exception-placeholder': {
    number: '5',
    title: 'Exception Policy',
    icon: KeyRound,
    blurb:
      'An honest empty card. Repo-scoped exception persistence has not shipped and the page does not pretend otherwise.',
    emptyPlaceholder: true,
  },
  methodology: {
    number: '6',
    title: 'Methodology',
    icon: GraduationCap,
    blurb:
      'The four-layer doctrine (detection / evidence / policy / enforcement) and how to verify the live gate any time.',
  },
  'export-placeholder': {
    number: '7',
    title: 'Evidence Export',
    icon: Download,
    blurb:
      'Another honest empty card. Compliance-platform integrations are future ADRs; nothing here claims export readiness.',
    emptyPlaceholder: true,
  },
};

function ProofAnchorRow({ anchor }: { anchor: TrustProofAnchor }) {
  const external = anchor.href.startsWith('http://') || anchor.href.startsWith('https://');
  const body = (
    <span className="inline-flex items-center gap-1">
      {anchor.label}
      {external ? <ExternalLink size={11} /> : <ArrowRight size={11} />}
    </span>
  );
  return (
    <li className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-soy-bottle/80 leading-tight">
      <span
        className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-widest border-2 border-soy-bottle ${proofTypeBadge[anchor.proofType]}`}
      >
        {proofTypeLabel[anchor.proofType]}
      </span>
      {anchor.proofType === 'pr' && anchor.pr && anchor.sha ? (
        <span className="font-mono text-[10px] text-soy-bottle/70">
          #{anchor.pr} @ {anchor.sha}
        </span>
      ) : null}
      {external ? (
        <a
          href={anchor.href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-soy-red underline decoration-2 underline-offset-2 hover:no-underline"
        >
          {body}
        </a>
      ) : (
        <Link
          to={anchor.href}
          className="text-soy-red underline decoration-2 underline-offset-2 hover:no-underline"
        >
          {body}
        </Link>
      )}
    </li>
  );
}

function ClaimCard({ claim }: { claim: TrustClaim }) {
  return (
    <article className="p-4 border-2 border-soy-bottle bg-soy-label shadow-[2px_2px_0px_#302C26]">
      <h3 className="text-sm font-black uppercase italic tracking-tight leading-tight mb-2 break-words">
        {claim.headline}
      </h3>
      <p className="text-xs font-bold text-soy-bottle/80 leading-relaxed mb-3">
        {claim.body}
      </p>
      <ul className="space-y-1.5">
        {claim.proofAnchors.map((anchor) => (
          <Fragment key={`${claim.id}-${anchor.proofType}-${anchor.href}`}>
            <ProofAnchorRow anchor={anchor} />
          </Fragment>
        ))}
      </ul>
    </article>
  );
}

function SectionBlock({
  sectionId,
  claims,
}: {
  sectionId: TrustCenterSectionId;
  claims: readonly TrustClaim[];
}) {
  const meta = sectionMeta[sectionId];
  const Icon = meta.icon;
  return (
    <section className="mb-10 border-4 border-soy-bottle bg-white p-6 shadow-[6px_6px_0px_#302C26]">
      <h2 className="text-sm font-black uppercase tracking-widest text-soy-bottle mb-3 flex items-center gap-2">
        <Icon size={16} /> {meta.number} · {meta.title}
      </h2>
      <p className="text-xs font-bold text-soy-bottle/70 leading-relaxed mb-4">
        {meta.blurb}
      </p>
      {meta.emptyPlaceholder ? (
        <p className="text-[11px] font-bold text-soy-bottle/60 italic leading-relaxed mb-4">
          This section is intentionally empty pending a future ADR. Honest empty state is itself proof: the product is not pretending to ship what it has not built.
        </p>
      ) : null}
      <div className="space-y-3">
        {claims.map((claim) => (
          <Fragment key={claim.id}>
            <ClaimCard claim={claim} />
          </Fragment>
        ))}
      </div>
    </section>
  );
}

function PostureHeader({ subject }: { subject: TrustCenterSubject }) {
  return (
    <header className="mb-12 border-b-8 border-soy-bottle pb-8">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <span className="border-2 border-soy-bottle bg-soy-red text-white px-3 py-1 text-xs font-black uppercase tracking-widest shadow-[2px_2px_0px_#302C26]">
          OPEN SOURCE TRUST CENTER
        </span>
        <span className="border-2 border-soy-bottle bg-white text-soy-bottle px-3 py-1 text-xs font-black uppercase tracking-widest shadow-[2px_2px_0px_#302C26]">
          v0 · static MVP
        </span>
        <span
          className={`border-2 border-soy-bottle px-3 py-1 text-xs font-black uppercase tracking-widest shadow-[2px_2px_0px_#302C26] ${postureColor[subject.postureLabel]}`}
        >
          {postureCopy[subject.postureLabel]}
        </span>
      </div>
      <h1 className="text-4xl md:text-5xl font-black uppercase italic tracking-tight mb-4 break-all">
        {subject.displayName}
      </h1>
      <p className="text-base font-bold leading-relaxed text-soy-bottle/80 max-w-3xl mb-4">
        {subject.postureSummary}
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          to={subject.primaryCta.href}
          className="inline-flex items-center gap-2 border-4 border-soy-bottle bg-soy-bottle text-white px-4 py-2 text-xs font-black uppercase tracking-widest shadow-[4px_4px_0px_#302C26] hover:bg-soy-red transition-colors"
        >
          {subject.primaryCta.label} <ArrowRight size={12} />
        </Link>
        <Link
          to={`/projects/${subject.owner}/${subject.repo}/trust`}
          className="inline-flex items-center gap-2 border-4 border-soy-bottle bg-white text-soy-bottle px-4 py-2 text-xs font-black uppercase tracking-widest shadow-[4px_4px_0px_#302C26] hover:bg-soy-label transition-colors"
        >
          View per-repo trust posture <ArrowRight size={12} />
        </Link>
      </div>
      <p className="text-xs font-bold text-soy-bottle/50 uppercase tracking-wider mt-4">
        Subject: {subject.owner}/{subject.repo} · Last evaluated: {subject.lastEvaluated}
      </p>
    </header>
  );
}

function CrossLinkPanel({ subject }: { subject: TrustCenterSubject }) {
  return (
    <section className="border-4 border-soy-bottle bg-white p-6 shadow-[6px_6px_0px_#302C26]">
      <h2 className="text-sm font-black uppercase tracking-widest text-soy-bottle mb-3 flex items-center gap-2">
        <Compass size={16} /> Where The Trust Center Fits
      </h2>
      <p className="text-xs font-bold text-soy-bottle/80 leading-relaxed mb-3">
        The Trust Center is the public summary of surfaces that already ship. It does not re-derive any trust decision; it points at the surface that does.
      </p>
      <ul className="space-y-2 text-xs font-bold text-soy-bottle/80 leading-relaxed">
        <li>
          <Link to="/proof/gate" className="text-soy-red font-black underline decoration-2 underline-offset-2 hover:no-underline">/proof/gate</Link>{' '}
          — current gate decision (verbatim API mirror).
        </li>
        <li>
          <Link to="/proof/timeline" className="text-soy-red font-black underline decoration-2 underline-offset-2 hover:no-underline">/proof/timeline</Link>{' '}
          — full trust-decision history (static MVP).
        </li>
        <li>
          <Link to={`/projects/${subject.owner}/${subject.repo}/trust`} className="text-soy-red font-black underline decoration-2 underline-offset-2 hover:no-underline">/projects/{subject.owner}/{subject.repo}/trust</Link>{' '}
          — per-repo trust posture (static MVP).
        </li>
        <li>
          <Link to="/patterns" className="text-soy-red font-black underline decoration-2 underline-offset-2 hover:no-underline">/patterns</Link>{' '}
          — catalog coverage (20 of 31 gate-active).
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
          — the four-layer doctrine.
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
          — closed OTS arc record + production verification curl.
        </li>
      </ul>
      <p className="text-[10px] font-bold text-soy-bottle/50 uppercase tracking-wider mt-4">
        Risk does not lose its name because someone needed to ship.
      </p>
    </section>
  );
}

function EmptyTrustCenter() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16 font-sans text-soy-bottle">
      <div className="border-4 border-soy-bottle bg-white p-8 shadow-[8px_8px_0px_#302C26]">
        <ShieldAlert className="text-soy-red mb-4" size={48} />
        <h1 className="text-2xl md:text-3xl font-black uppercase italic tracking-tight mb-4">
          No static Trust Center subject configured
        </h1>
        <p className="text-sm font-bold text-soy-bottle/70 leading-relaxed mb-3">
          The Trust Center MVP supports exactly one subject:{' '}
          {OPEN_SOURCE_TRUST_CENTER_MVP_SUBJECT.displayName} ({OPEN_SOURCE_TRUST_CENTER_MVP_SUBJECT.owner}/{OPEN_SOURCE_TRUST_CENTER_MVP_SUBJECT.repo}).
        </p>
        <p className="text-xs font-bold text-soy-bottle/60 leading-relaxed">
          Multi-subject Trust Centers and customer-scoped private evidence are each their own ADR. Inventing a subject card would be a doctrine violation.
        </p>
      </div>
    </div>
  );
}

export default function OpenSourceTrustCenter() {
  const subject = OPEN_SOURCE_TRUST_CENTER_SUBJECTS[0];

  if (!subject) {
    return <EmptyTrustCenter />;
  }

  const grouped = groupClaimsBySection(subject);

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 md:py-20 font-sans text-soy-bottle">
      <PostureHeader subject={subject} />
      {grouped.map(({ sectionId, claims }) => (
        <Fragment key={sectionId}>
          <SectionBlock sectionId={sectionId} claims={claims} />
        </Fragment>
      ))}
      <CrossLinkPanel subject={subject} />
    </div>
  );
}
