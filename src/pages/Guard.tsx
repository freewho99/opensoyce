import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ShieldCheck, GitPullRequest, FileCode, MessageSquare, Download, Check, X, AlertTriangle, Lock, Activity, Users, Zap, FlaskConical, AlertOctagon, Shuffle, Scale, History, Skull } from 'lucide-react';
import GuardPrCommentPreview from '../components/GuardPrCommentPreview';

const POLICY_YAML = `policy:
  block:
    - graveyard
    - risky
  warn:
    - watchlist
    - stable
  allow:
    - use-ready
    - forkable

exceptions:
  require_reason: true
  expire_after_days: 30

reports:
  signed: true
  sarif: true`;

const STEPS = [
  { icon: Download, title: 'Install GitHub App', body: 'Add OpenSoyce Guard to your org or repo in two clicks.' },
  { icon: GitPullRequest, title: 'PR opens', body: 'Any pull request that touches a lockfile triggers Guard.' },
  { icon: ShieldCheck, title: 'Guard scans lockfile changes', body: 'Each added or upgraded dependency is labeled across nine risk signals.' },
  { icon: MessageSquare, title: 'Comment with labels + verdict', body: 'A single readable comment shows what to allow, warn on, or block.' },
];

const CHECKS = [
  { icon: AlertOctagon, label: 'Vulnerabilities', body: 'Known CVEs and unresolved advisories.' },
  { icon: Users, label: 'Maintainer concentration', body: 'How many people actually control the code.' },
  { icon: Activity, label: 'Fork velocity', body: 'Is the source repo moving — or stalling?' },
  { icon: Zap, label: 'Postinstall scripts', body: 'Code that runs on `npm install`. Always inspected.' },
  { icon: Shuffle, label: 'Typosquats', body: 'Names that look like popular packages.' },
  { icon: FlaskConical, label: 'Dependency confusion', body: 'Internal names colliding with public registries.' },
  { icon: Scale, label: 'License risk', body: 'Copyleft, custom, missing, or recently changed.' },
  { icon: History, label: 'Advisory history', body: 'Repeat offenders flagged automatically.' },
  { icon: Skull, label: 'Abandonment signals', body: 'No releases, no commits, no answers.' },
];

const FREE_FEATURES = [
  'Public labels on any repo',
  'Free one-shot scans via /scanner',
  'Shareable public reports',
  'Public-repo GitHub Action',
];

const TEAM_FEATURES = [
  'Private repos',
  'PR comments with verdict',
  'Policy enforcement (.opensoyce.yml)',
  'Full history & audit log',
  'Exceptions with reason + expiry',
  'Watchlists across the org',
  'Slack alerts',
];

function PrimaryCTA() {
  return (
    <Link
      to="/guard/install"
      className="inline-flex items-center gap-2 bg-soy-red text-white px-8 py-4 text-lg font-black uppercase italic tracking-tight border-4 border-black shadow-[6px_6px_0px_#000] hover:translate-x-1 hover:translate-y-1 hover:shadow-[2px_2px_0px_#000] transition-all"
    >
      Install GitHub Guard <ArrowRight size={20} />
    </Link>
  );
}

function SecondaryCTA() {
  return (
    <Link
      to="/scanner"
      className="inline-flex items-center gap-2 bg-white text-soy-bottle px-8 py-4 text-lg font-black uppercase italic tracking-tight border-4 border-soy-bottle shadow-[6px_6px_0px_#302C26] hover:translate-x-1 hover:translate-y-1 hover:shadow-[2px_2px_0px_#302C26] transition-all"
    >
      Try a Free Scan <ArrowRight size={20} />
    </Link>
  );
}

export default function Guard() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-16">
      {/* HERO */}
      <section className="text-center mb-24">
        <div className="inline-flex items-center gap-2 bg-black text-white px-4 py-1.5 text-[10px] font-black uppercase tracking-widest italic mb-6 border-2 border-soy-red shadow-[4px_4px_0px_#E63322]">
          <ShieldCheck size={12} /> GitHub App · PR-native
        </div>
        <h1 className="text-5xl md:text-7xl font-black uppercase italic tracking-tighter mb-6 text-soy-bottle">
          Stop risky dependencies <br className="hidden md:block" />
          <span className="text-soy-red">before they merge.</span>
        </h1>
        <p className="max-w-3xl mx-auto text-lg md:text-xl font-bold uppercase tracking-widest opacity-60 italic leading-relaxed mb-10">
          OpenSoyce Guard scans dependency changes in pull requests, labels risk, and helps your team decide what to allow, warn, or block.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <PrimaryCTA />
          <SecondaryCTA />
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="mb-24">
        <h2 className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter mb-12 text-center">How it works</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={step.title} className="bg-white border-4 border-soy-bottle p-6 shadow-[6px_6px_0px_#302C26] relative">
                <div className="absolute -top-4 -left-4 w-10 h-10 bg-soy-red text-white font-black italic flex items-center justify-center border-4 border-black text-lg">
                  {i + 1}
                </div>
                <Icon size={28} className="text-soy-red mb-4" />
                <h3 className="text-lg font-black uppercase italic tracking-tight mb-2 text-soy-bottle">{step.title}</h3>
                <p className="text-xs font-bold uppercase tracking-widest opacity-60 italic leading-relaxed">{step.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* PR COMMENT PREVIEW */}
      <section className="mb-24">
        <div className="text-center mb-10">
          <span className="inline-block bg-soy-red text-white text-[10px] font-black px-3 py-1 uppercase tracking-widest italic mb-3">Live example</span>
          <h2 className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter text-soy-bottle">What your team sees on a PR</h2>
          <p className="mt-3 text-sm font-bold uppercase tracking-widest opacity-60 italic">One readable comment. No dashboard hunting.</p>
        </div>
        <GuardPrCommentPreview />
      </section>

      {/* POLICY FILE */}
      <section className="mb-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div>
            <FileCode size={32} className="text-soy-red mb-4" />
            <h2 className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter mb-4 text-soy-bottle">
              Your policy. <br /><span className="text-soy-red">Your repo.</span>
            </h2>
            <p className="text-sm font-bold uppercase tracking-widest opacity-60 italic leading-relaxed mb-4">
              Drop a <code className="bg-soy-label px-1.5 py-0.5 not-italic">.opensoyce.yml</code> at the root of any repo to control what Guard blocks, warns on, or allows. Exceptions need a reason and expire automatically.
            </p>
            <ul className="space-y-2 text-xs font-bold uppercase tracking-widest text-soy-bottle">
              <li className="flex items-start gap-2"><Check size={14} className="text-soy-red mt-0.5 shrink-0" /> Block graveyard + risky by default</li>
              <li className="flex items-start gap-2"><Check size={14} className="text-soy-red mt-0.5 shrink-0" /> Exceptions require justification</li>
              <li className="flex items-start gap-2"><Check size={14} className="text-soy-red mt-0.5 shrink-0" /> Signed reports, SARIF export</li>
            </ul>
          </div>
          <div className="bg-black border-4 border-soy-red shadow-[8px_8px_0px_#000] overflow-hidden">
            <div className="flex items-center justify-between bg-soy-red px-4 py-2 border-b-4 border-black">
              <span className="text-[10px] font-black uppercase tracking-widest text-white italic">.opensoyce.yml</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-white/80">YAML</span>
            </div>
            <pre className="p-6 text-xs md:text-sm font-mono text-emerald-300 overflow-x-auto leading-relaxed">
              <code>{POLICY_YAML}</code>
            </pre>
          </div>
        </div>
      </section>

      {/* WHAT GUARD CHECKS */}
      <section className="mb-24">
        <h2 className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter mb-12 text-center">What OpenSoyce checks</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {CHECKS.map((check) => {
            const Icon = check.icon;
            return (
              <div key={check.label} className="bg-white border-2 border-soy-bottle p-5 hover:shadow-[6px_6px_0px_#E63322] hover:-translate-x-1 hover:-translate-y-1 transition-all">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-soy-label border-2 border-soy-bottle flex items-center justify-center shrink-0">
                    <Icon size={18} className="text-soy-red" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase italic tracking-tight text-soy-bottle mb-1">{check.label}</h3>
                    <p className="text-[11px] font-bold uppercase tracking-widest opacity-60 italic leading-relaxed">{check.body}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* FREE VS TEAM */}
      <section className="mb-24">
        <h2 className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter mb-3 text-center">Free vs Team</h2>
        <p className="text-sm font-bold uppercase tracking-widest opacity-60 italic text-center mb-12">Start free. Upgrade when policy enforcement matters.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* FREE */}
          <div className="bg-white border-4 border-soy-bottle p-8 shadow-[8px_8px_0px_#302C26]">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-2xl font-black uppercase italic tracking-tight text-soy-bottle">FREE</h3>
              <span className="text-[10px] font-black uppercase tracking-widest bg-soy-label px-2 py-1 italic">Public repos</span>
            </div>
            <p className="text-xs font-bold uppercase tracking-widest opacity-60 italic mb-6">For open source maintainers and curious devs.</p>
            <ul className="space-y-3 mb-8">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-xs font-black uppercase tracking-widest text-soy-bottle">
                  <Check size={16} className="text-soy-red mt-0.5 shrink-0" /> {f}
                </li>
              ))}
              <li className="flex items-start gap-2 text-xs font-black uppercase tracking-widest opacity-30">
                <X size={16} className="mt-0.5 shrink-0" /> Private repos
              </li>
              <li className="flex items-start gap-2 text-xs font-black uppercase tracking-widest opacity-30">
                <X size={16} className="mt-0.5 shrink-0" /> Policy enforcement
              </li>
            </ul>
            <Link to="/scanner" className="block w-full text-center bg-soy-bottle text-white py-4 text-sm font-black uppercase italic tracking-widest border-4 border-soy-bottle hover:bg-soy-red transition-colors">
              Try a Free Scan
            </Link>
          </div>

          {/* TEAM */}
          <div className="bg-white border-4 border-soy-red p-8 shadow-[8px_8px_0px_#E63322] relative">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-soy-red text-white px-4 py-1 text-xs font-black uppercase tracking-widest italic border-2 border-black">
              Recommended
            </div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-2xl font-black uppercase italic tracking-tight text-soy-bottle flex items-center gap-2">
                <Lock size={20} className="text-soy-red" /> TEAM
              </h3>
              <span className="text-[10px] font-black uppercase tracking-widest bg-soy-red text-white px-2 py-1 italic">Private + policy</span>
            </div>
            <p className="text-xs font-bold uppercase tracking-widest opacity-60 italic mb-6">For teams that ship to production.</p>
            <ul className="space-y-3 mb-8">
              {TEAM_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-xs font-black uppercase tracking-widest text-soy-bottle">
                  <Check size={16} className="text-soy-red mt-0.5 shrink-0" /> {f}
                </li>
              ))}
            </ul>
            <Link to="/pricing" className="block w-full text-center bg-soy-red text-white py-4 text-sm font-black uppercase italic tracking-widest border-4 border-black shadow-[4px_4px_0px_#000] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[2px_2px_0px_#000] transition-all">
              See Team Pricing <ArrowRight size={14} className="inline ml-1" />
            </Link>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="bg-soy-bottle text-white border-4 border-black shadow-[12px_12px_0px_#E63322] p-12 md:p-16 text-center">
        <AlertTriangle size={40} className="text-soy-red mx-auto mb-6" />
        <h2 className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter mb-4">
          One install. <span className="text-soy-red">Every PR protected.</span>
        </h2>
        <p className="max-w-2xl mx-auto text-sm md:text-base font-bold uppercase tracking-widest opacity-70 italic mb-10 leading-relaxed">
          Add OpenSoyce Guard to GitHub in under a minute. It comments on the next risky pull request that lands.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <PrimaryCTA />
          <SecondaryCTA />
        </div>
      </section>
    </div>
  );
}
