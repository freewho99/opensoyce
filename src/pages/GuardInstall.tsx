import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, Github, FileCode, Settings as SettingsIcon, ArrowRight, Mail } from 'lucide-react';

type TabKey = 'app' | 'action' | 'policy';

const ACTION_YAML = `name: OpenSoyce Guard

on:
  pull_request:
    paths:
      - "package-lock.json"
      - "pnpm-lock.yaml"
      - "yarn.lock"
      - "uv.lock"
      - "poetry.lock"

jobs:
  opensoyce:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - name: Run OpenSoyce Guard
        run: npx opensoyce scan --ci --report
`;

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
  sarif: true
`;

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-2 bg-soy-red text-white px-4 py-2 text-xs font-black uppercase tracking-widest border-2 border-black shadow-[3px_3px_0px_#000] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_#000] transition-all"
      type="button"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? 'Copied' : label ?? 'Copy'}
    </button>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      type="button"
      className={`flex items-center gap-2 px-6 py-4 text-sm font-black uppercase tracking-widest border-4 border-black transition-all ${
        active
          ? 'bg-soy-red text-white shadow-[6px_6px_0px_#000] -translate-y-1'
          : 'bg-soy-bottle text-white hover:bg-soy-red shadow-[3px_3px_0px_#000]'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function StepRow({ n, title, body }: { n: number; title: string; body: React.ReactNode }) {
  return (
    <div className="flex gap-6 border-b-4 border-soy-bottle/30 py-6 last:border-b-0">
      <div className="shrink-0 w-14 h-14 bg-soy-red text-white border-4 border-black flex items-center justify-center text-2xl font-black italic shadow-[4px_4px_0px_#000]">
        {n}
      </div>
      <div className="flex-1">
        <h3 className="text-2xl font-black uppercase italic tracking-tight mb-2">{title}</h3>
        <div className="text-sm font-bold uppercase tracking-widest opacity-70 leading-relaxed">
          {body}
        </div>
      </div>
    </div>
  );
}

export default function GuardInstall() {
  const [tab, setTab] = useState<TabKey>('app');

  return (
    <div className="max-w-6xl mx-auto px-4 py-20">
      {/* Hero */}
      <div className="mb-16">
        <div className="inline-block bg-soy-red text-white px-3 py-1 text-[10px] font-black uppercase tracking-widest italic mb-6 shadow-[3px_3px_0px_#000] border-2 border-black">
          Guard / Install
        </div>
        <h1 className="text-5xl md:text-7xl font-black uppercase italic tracking-tighter mb-4">
          Install OpenSoyce Guard
        </h1>
        <p className="text-xl md:text-2xl font-bold uppercase tracking-widest opacity-60 max-w-3xl">
          Two ways to add dependency risk checks to your pull requests.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-3 mb-10">
        <TabButton active={tab === 'app'} onClick={() => setTab('app')} icon={<Github size={16} />}>
          GitHub App
        </TabButton>
        <TabButton
          active={tab === 'action'}
          onClick={() => setTab('action')}
          icon={<FileCode size={16} />}
        >
          GitHub Action
        </TabButton>
        <TabButton
          active={tab === 'policy'}
          onClick={() => setTab('policy')}
          icon={<SettingsIcon size={16} />}
        >
          Policy File
        </TabButton>
      </div>

      {/* Tab Panels */}
      <div className="bg-white border-4 border-black shadow-[12px_12px_0px_#000] p-8 md:p-12 mb-16">
        {tab === 'app' && (
          <div>
            <h2 className="text-3xl font-black uppercase italic tracking-tighter mb-2">
              GitHub App
            </h2>
            <p className="text-sm font-bold uppercase tracking-widest opacity-60 mb-8">
              One-click install. Automatic check runs on every PR that touches a lockfile.
            </p>

            <div className="mb-10">
              <a
                href="https://github.com/apps/opensoyce-guard"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 bg-black text-white px-8 py-5 text-lg font-black uppercase italic tracking-widest border-4 border-black shadow-[6px_6px_0px_#E63322] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[8px_8px_0px_#E63322] transition-all"
              >
                <Github size={20} />
                Install on GitHub
                <ArrowRight size={18} />
              </a>
            </div>

            <div className="mb-10">
              <StepRow
                n={1}
                title="Click Install on GitHub"
                body="You will be redirected to GitHub to authorize the OpenSoyce Guard app for your account or organization."
              />
              <StepRow
                n={2}
                title="Choose repos"
                body="Select all repositories, or pick a subset. Guard only reads lockfiles and writes PR check runs — no source code is stored."
              />
              <StepRow
                n={3}
                title="Open a PR that changes a lockfile"
                body="Any change to package-lock.json, pnpm-lock.yaml, yarn.lock, uv.lock, or poetry.lock triggers a Guard scan."
              />
              <StepRow
                n={4}
                title="Get an OpenSoyce check run with verdict + comment"
                body="A check run appears on the PR with PASS / WARN / BLOCK, plus an inline comment listing the risky packages and the Soyce signals behind each verdict."
              />
            </div>

            <div className="border-2 border-soy-label/20 aspect-video flex items-center justify-center text-soy-label/40 text-sm font-black uppercase tracking-widest">
              PR comment screenshot
            </div>
          </div>
        )}

        {tab === 'action' && (
          <div>
            <h2 className="text-3xl font-black uppercase italic tracking-tighter mb-2">
              GitHub Action
            </h2>
            <p className="text-sm font-bold uppercase tracking-widest opacity-60 mb-8">
              Use this when you want copy-paste control or the App doesn't have access to your org.
            </p>

            <div className="mb-4 flex items-center justify-between gap-4 flex-wrap">
              <code className="text-xs font-mono font-bold uppercase tracking-widest opacity-70">
                .github/workflows/opensoyce.yml
              </code>
              <CopyButton text={ACTION_YAML} label="Copy YAML" />
            </div>

            <pre className="bg-black text-white border-4 border-black p-6 overflow-x-auto text-sm leading-relaxed shadow-[6px_6px_0px_#E63322]">
              <code className="font-mono">{ACTION_YAML}</code>
            </pre>

            <div className="mt-8 grid md:grid-cols-2 gap-4">
              <div className="border-4 border-soy-bottle/30 p-5 bg-soy-bottle/5">
                <div className="text-[10px] font-black uppercase tracking-widest text-soy-red mb-1">
                  Triggers on
                </div>
                <p className="text-xs font-bold uppercase tracking-widest opacity-80 leading-relaxed">
                  Any PR touching a supported lockfile (npm, pnpm, yarn, uv, poetry).
                </p>
              </div>
              <div className="border-4 border-soy-bottle/30 p-5 bg-soy-bottle/5">
                <div className="text-[10px] font-black uppercase tracking-widest text-soy-red mb-1">
                  Reports
                </div>
                <p className="text-xs font-bold uppercase tracking-widest opacity-80 leading-relaxed">
                  <code className="font-mono">--report</code> writes SARIF + JSON for the GitHub UI.
                </p>
              </div>
            </div>
          </div>
        )}

        {tab === 'policy' && (
          <div>
            <h2 className="text-3xl font-black uppercase italic tracking-tighter mb-2">
              Policy File
            </h2>
            <p className="text-sm font-bold uppercase tracking-widest opacity-60 mb-8">
              Drop <code className="font-mono">.opensoyce.yml</code> at the repo root. Guard reads it on every scan.
            </p>

            <div className="mb-4 flex items-center justify-between gap-4 flex-wrap">
              <code className="text-xs font-mono font-bold uppercase tracking-widest opacity-70">
                .opensoyce.yml
              </code>
              <CopyButton text={POLICY_YAML} label="Copy Policy" />
            </div>

            <pre className="bg-black text-white border-4 border-black p-6 overflow-x-auto text-sm leading-relaxed shadow-[6px_6px_0px_#E63322]">
              <code className="font-mono">{POLICY_YAML}</code>
            </pre>

            <div className="mt-8 space-y-4">
              <div className="border-l-4 border-soy-red pl-4">
                <div className="text-sm font-black uppercase tracking-widest mb-1">policy.block</div>
                <p className="text-xs font-bold uppercase tracking-widest opacity-70 leading-relaxed">
                  Verdict bands that fail the check run. PR cannot merge until resolved or excepted.
                </p>
              </div>
              <div className="border-l-4 border-amber-500 pl-4">
                <div className="text-sm font-black uppercase tracking-widest mb-1">policy.warn</div>
                <p className="text-xs font-bold uppercase tracking-widest opacity-70 leading-relaxed">
                  Bands that surface a warning comment but do not block merge.
                </p>
              </div>
              <div className="border-l-4 border-emerald-500 pl-4">
                <div className="text-sm font-black uppercase tracking-widest mb-1">policy.allow</div>
                <p className="text-xs font-bold uppercase tracking-widest opacity-70 leading-relaxed">
                  Healthy bands. Silent pass — no comment noise on green PRs.
                </p>
              </div>
              <div className="border-l-4 border-soy-bottle pl-4">
                <div className="text-sm font-black uppercase tracking-widest mb-1">exceptions</div>
                <p className="text-xs font-bold uppercase tracking-widest opacity-70 leading-relaxed">
                  Require a written reason on every override. Exceptions auto-expire after N days so they don't rot.
                </p>
              </div>
              <div className="border-l-4 border-black pl-4">
                <div className="text-sm font-black uppercase tracking-widest mb-1">reports</div>
                <p className="text-xs font-bold uppercase tracking-widest opacity-70 leading-relaxed">
                  <code className="font-mono">signed</code> produces a tamper-evident verdict.
                  <code className="font-mono ml-1">sarif</code> uploads to GitHub's security tab.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Help CTA */}
      <div className="bg-soy-bottle text-white border-4 border-black shadow-[12px_12px_0px_#E63322] p-10 md:p-14 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
        <div>
          <h2 className="text-3xl md:text-4xl font-black uppercase italic tracking-tighter mb-3">
            Need help?
          </h2>
          <p className="font-bold uppercase tracking-widest opacity-70 leading-relaxed">
            Stuck on install, policy tuning, or a verdict you disagree with? We answer fast.
          </p>
        </div>
        <a
          href="mailto:spcpengcheng@gmail.com"
          className="inline-flex items-center gap-3 bg-soy-red text-white px-8 py-5 text-lg font-black uppercase italic tracking-widest border-4 border-black shadow-[6px_6px_0px_#000] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[8px_8px_0px_#000] transition-all whitespace-nowrap"
        >
          <Mail size={20} />
          Email Support
        </a>
      </div>
    </div>
  );
}
