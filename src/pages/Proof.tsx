import React from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Gauge,
  Package,
  Radar,
  ShieldCheck,
} from 'lucide-react';
import { trackEvent } from '../utils/analytics';

export default function Proof() {
  return (
    <div className="bg-soy-label min-h-screen">
      {/* HERO */}
      <section className="py-24 px-4 bg-white border-b-4 border-black">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-block bg-soy-red text-white px-4 py-2 text-xs font-black uppercase tracking-[0.4em] mb-8"
          >
            THE RECEIPTS
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-6xl md:text-8xl font-black uppercase italic tracking-tighter mb-8 leading-[0.9]"
          >
            BUILT BEYOND DEMO DEPTH.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-2xl md:text-3xl font-medium opacity-80 leading-snug italic"
          >
            OpenSoyce Guard runs on a real scoring engine, real lockfile parsers, and real supply-chain signals. Here&rsquo;s what&rsquo;s under the hood.
          </motion.p>
        </div>
      </section>

      {/* FOUR SECTION CARDS */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <ProofCard
              icon={<Gauge size={36} strokeWidth={2.5} />}
              tag="SCORING ENGINE"
              title="Five pillars, thirteen signals, six bands."
              items={[
                '5 pillars: maintenance, community, security, documentation, activity',
                '13 signals across 8 GitHub endpoints',
                'Verdict bands: USE READY · STABLE · WATCHLIST · RISKY · GRAVEYARD',
                'Advisory caps on hidden CVEs (band-cap on score, not silent)',
                'Maintainer concentration analysis with vendor-SDK allowlist',
              ]}
            />
            <ProofCard
              icon={<Package size={36} strokeWidth={2.5} />}
              tag="LOCKFILE COVERAGE"
              title="Every lockfile a working dev team ships."
              items={[
                'npm v1 / v2 / v3',
                'yarn v1',
                'pnpm',
                'uv.lock',
                'poetry.lock',
              ]}
            />
            <ProofCard
              icon={<Radar size={36} strokeWidth={2.5} />}
              tag="SUPPLY-CHAIN SIGNALS"
              title="The attack classes that actually shipped malware."
              items={[
                'postinstall script detection (with curated allowlist)',
                'typosquat / homoglyph detection (TR39 confusables)',
                'dependency confusion (.opensoyce-private, active registry probe)',
                'cross-ecosystem bridges (npm ↔ PyPI sibling map)',
                'fork-velocity namesakes (migration / successor detection)',
              ]}
            />
            <ProofCard
              icon={<ShieldCheck size={36} strokeWidth={2.5} />}
              tag="TRUST INFRASTRUCTURE"
              title="Reports you can verify without trusting us."
              items={[
                'Ed25519-signed scan reports (JSON + SARIF)',
                'Public /api/verify-report endpoint',
                'GitHub App checks on every PR',
                'Open claim / rebuttal channel for maintainers',
                'Band-drop notifier (per-issue last-band marker)',
              ]}
            />
          </div>
        </div>
      </section>

      {/* TESTING STRIP */}
      <section className="py-24 px-4 bg-black text-white border-y-4 border-black">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 items-center">
            <div className="md:col-span-1">
              <div className="text-[10px] font-black uppercase tracking-[0.4em] text-soy-red mb-4">
                TEST COVERAGE
              </div>
              <div className="text-7xl md:text-9xl font-black italic tracking-tighter font-mono leading-none">
                458+
              </div>
              <div className="mt-4 text-xs font-black uppercase tracking-widest opacity-60">
                TESTS PASSING
              </div>
            </div>
            <div className="md:col-span-2">
              <p className="text-2xl md:text-3xl font-medium leading-snug italic opacity-90">
                Across the scoring engine, lockfile parsers, supply-chain detectors, and trust infrastructure.
              </p>
              <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4 text-[10px] font-black uppercase tracking-[0.2em] opacity-60">
                <div className="border-l-2 border-soy-red pl-3 py-1">SCORING ENGINE</div>
                <div className="border-l-2 border-soy-red pl-3 py-1">LOCKFILE PARSERS</div>
                <div className="border-l-2 border-soy-red pl-3 py-1">SUPPLY-CHAIN</div>
                <div className="border-l-2 border-soy-red pl-3 py-1">TRUST &amp; SIGNING</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SHIP STATS */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
          <StatCard num="121" label="COMMITS SHIPPED" sub="Real changelog, not a roadmap." />
          <StatCard num="13" label="SCORING SIGNALS" sub="Across 8 GitHub endpoints." />
          <StatCard num="5" label="LOCKFILE PARSERS" sub="npm, yarn, pnpm, uv, poetry." />
        </div>
      </section>

      {/* BOTTOM CTA */}
      <section className="py-24 px-4 bg-white border-t-4 border-black">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-6xl font-black uppercase italic tracking-tighter mb-12 leading-[0.95]">
            Want the gory details?
          </h2>
          <div className="flex flex-col md:flex-row gap-6 justify-center items-center">
            <Link
              to="/methodology"
              onClick={() => trackEvent('proof_methodology_click', { source: 'proof_cta' })}
              className="inline-flex items-center gap-3 bg-black text-white px-10 py-5 text-lg font-black uppercase italic tracking-widest hover:bg-soy-red transition-all shadow-[8px_8px_0px_#E63322]"
            >
              READ THE METHODOLOGY <ArrowRight size={24} />
            </Link>
            <Link
              to="/scanner"
              onClick={() => trackEvent('proof_scan_click', { source: 'proof_cta' })}
              className="inline-flex items-center gap-3 bg-soy-red text-white px-10 py-5 text-lg font-black uppercase italic tracking-widest hover:bg-black transition-all shadow-[8px_8px_0px_#000]"
            >
              TRY A FREE SCAN <ArrowRight size={24} />
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-12 border-t-4 border-black text-center text-[10px] font-black uppercase tracking-[0.5em] opacity-40">
        &copy; 2026 OPENSOYCE LABS. ALL SAUCE RESERVED.
      </footer>
    </div>
  );
}

function ProofCard({
  icon,
  tag,
  title,
  items,
}: {
  icon: React.ReactNode;
  tag: string;
  title: string;
  items: string[];
}) {
  return (
    <div className="bg-white border-4 border-black p-8 shadow-[10px_10px_0px_#000] flex flex-col">
      <div className="flex items-start justify-between gap-4 mb-6">
        <span className="inline-block bg-black text-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.3em]">
          {tag}
        </span>
        <div className="text-soy-red flex-shrink-0">{icon}</div>
      </div>
      <h3 className="text-2xl md:text-3xl font-black uppercase italic tracking-tight mb-6 leading-tight">
        {title}
      </h3>
      <ul className="space-y-3 mt-auto">
        {items.map((item) => (
          <li
            key={item}
            className="flex items-start gap-3 text-sm font-medium leading-snug border-l-2 border-soy-red pl-4 py-1"
          >
            <span className="opacity-85">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatCard({ num, label, sub }: { num: string; label: string; sub: string }) {
  return (
    <div className="bg-soy-label border-4 border-black p-8 shadow-[8px_8px_0px_#000]">
      <div className="text-6xl md:text-7xl font-black italic font-mono tracking-tighter text-soy-red leading-none mb-4">
        {num}
      </div>
      <div className="text-sm font-black uppercase tracking-widest mb-2">{label}</div>
      <p className="text-xs font-medium opacity-60 italic leading-snug">{sub}</p>
    </div>
  );
}
