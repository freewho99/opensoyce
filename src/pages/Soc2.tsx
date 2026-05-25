import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Shield, ShieldCheck, Lock, FileText, Bell, GitPullRequest,
  CheckCircle, ArrowRight, Download, Eye, Activity, ClipboardList,
  Key, RefreshCw, Zap, AlertTriangle,
} from 'lucide-react';

// ─── Trust Service Criteria mapping ────────────────────────────────────────
const TSC_CONTROLS = [
  {
    id: 'cc6.1',
    code: 'CC6.1',
    category: 'Logical Access',
    title: 'Restrict access to authorized users',
    desc: 'GitHub OAuth scoped to `read:user read:org` ensures only verified org members can view or modify exception policies.',
    features: ['GitHub OAuth session gating', 'Org-scoped watchlists (owner_org field)', 'Read-only vs write-access enforcement on notifications'],
    icon: Lock,
    accent: 'bg-soy-red',
  },
  {
    id: 'cc6.8',
    code: 'CC6.8',
    category: 'Vulnerability Management',
    title: 'Prevent or detect software with known vulnerabilities',
    desc: 'The SOC 2 policy preset blocks all `graveyard` and `risky`-labeled dependencies at the PR gate, satisfying CC6.8 "software with known vulnerabilities" controls.',
    features: ['SOC 2 preset: blocks graveyard + risky', 'Warns on watchlist packages needing monitoring', 'Guard PR check run fails builds on policy violation'],
    icon: ShieldCheck,
    accent: 'bg-amber-500',
  },
  {
    id: 'cc7.2',
    code: 'CC7.2',
    category: 'Monitoring',
    title: 'Monitor system components for anomalies',
    desc: 'Real-time score watchlists alert your team via Slack the instant a dependency\'s verdict band degrades — before it\'s merged.',
    features: ['Live score watchlist across org repos', 'Slack webhook alerts on band degradation (STABLE → RISKY)', 'Historical change log with timestamp + actor'],
    icon: Bell,
    accent: 'bg-blue-600',
  },
  {
    id: 'cc8.1',
    code: 'CC8.1',
    category: 'Change Management',
    title: 'Authorize changes to infrastructure',
    desc: 'Every exception requires a written justification, an expiry date, and is attributed to a named GitHub user — creating an immutable change control audit trail.',
    features: ['Time-bounded exceptions (7 / 14 / 30 / 60 / 90 days)', 'Mandatory written reason (10–2000 chars)', 'Full exception audit trail downloadable as JSON'],
    icon: ClipboardList,
    accent: 'bg-emerald-600',
  },
  {
    id: 'cc9.2',
    code: 'CC9.2',
    category: 'Risk Mitigation',
    title: 'Manage risks from vendors and business partners',
    desc: 'Cryptographically signed scan reports (Ed25519) let auditors verify the integrity of dependency assessments without trusting OpenSoyce\'s servers.',
    features: ['Ed25519-signed JSON + SARIF reports', 'Public /api/verify-report endpoint for external verification', 'Signing key published at /.well-known/opensoyce-signing-key.pem'],
    icon: Key,
    accent: 'bg-purple-600',
  },
  {
    id: 'a14',
    code: 'A.14',
    category: 'ISO 27001',
    title: 'System acquisition, dev & maintenance',
    desc: 'The iso27001 preset applies identical controls to the SOC 2 preset (block graveyard + risky, warn watchlist), satisfying A.12.6 and A.14 requirements.',
    features: ['iso27001 preset aliased to soc2 controls', 'Policy-as-code via .opensoyce.yml in the repo', 'Org-level policy repo inheritance (my-org/opensoyce-policy)'],
    icon: FileText,
    accent: 'bg-soy-bottle',
  },
];

// ─── Policy Presets ────────────────────────────────────────────────────────
const PRESETS = [
  {
    id: 'soc2',
    label: 'SOC 2',
    badge: 'CC6.8',
    yaml: `# SOC 2 Compliance Preset
preset: soc2

# Resolves to:
policy:
  block:
    - graveyard  # CC6.8 — abandoned packages
    - risky      # CC6.8 — high-risk vuln packages
  warn:
    - watchlist  # Active monitoring required

# Add repo-specific overrides below:
exceptions:
  require_reason: true
  expire_after_days: 30`,
    color: 'border-soy-red',
    bgActive: 'bg-soy-red text-white',
  },
  {
    id: 'iso27001',
    label: 'ISO 27001',
    badge: 'A.14',
    yaml: `# ISO 27001 Compliance Preset  
preset: iso27001

# Maps to A.12.6 (Vuln Mgmt) + A.14 (System Acq.)
# Identical thresholds to SOC 2 in practice:
policy:
  block:
    - graveyard  # A.12.6 — known exploitable
    - risky      # A.12.6 — high severity CVEs
  warn:
    - watchlist  # A.14.2 — active review queue

exceptions:
  require_reason: true
  expire_after_days: 14`,
    color: 'border-amber-500',
    bgActive: 'bg-amber-500 text-white',
  },
  {
    id: 'strict',
    label: 'Zero-Trust',
    badge: 'STRICT',
    yaml: `# Strict Zero-Trust Preset
preset: strict

# Maximum assurance — for high-security envs:
policy:
  block:
    - graveyard  # Abandoned — never allowed
    - risky      # High CVE risk — blocked
    - watchlist  # Monitoring not enough — blocked
  warn:
    - stable     # Explicit sign-off required
    - forkable   # Review before forking

# Only "use-ready" deps pass silently.`,
    color: 'border-purple-600',
    bgActive: 'bg-purple-600 text-white',
  },
];

// ─── Audit Trail mock rows ─────────────────────────────────────────────────
const AUDIT_ROWS = [
  { ts: '2026-05-23 14:32', actor: 'sarah-cto', pkg: 'lodash', action: 'EXCEPTION GRANTED', reason: 'Prototype pollution mitigated at network layer', expires: 'Jun 22, 2026', status: 'active' },
  { ts: '2026-05-21 09:11', actor: 'maya-sec', pkg: 'axios', action: 'EXCEPTION GRANTED', reason: 'SSRF handled at load balancer. Tracked in SEC-441.', expires: 'Jul 20, 2026', status: 'active' },
  { ts: '2026-05-18 17:44', actor: 'lead-dev', pkg: 'minimist', action: 'EXCEPTION EXPIRED', reason: 'Prototype pollution bypass — expired per policy.', expires: 'May 18, 2026', status: 'expired' },
  { ts: '2026-05-10 08:00', actor: 'carlos-r', pkg: 'event-stream', action: 'EXCEPTION REVOKED', reason: 'New CVE landed. Immediate removal required.', expires: 'Revoked', status: 'revoked' },
];

export default function Soc2() {
  const [activePreset, setActivePreset] = useState('soc2');
  const currentPreset = PRESETS.find(p => p.id === activePreset)!;

  return (
    <div className="min-h-screen bg-soy-label">
      {/* ─── HERO ─────────────────────────────────────────────────────── */}
      <section className="bg-black text-white py-24 px-4 border-b-8 border-soy-red relative overflow-hidden">
        <div className="absolute inset-0 opacity-5 pointer-events-none"
          style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 40px, #E63322 40px, #E63322 41px), repeating-linear-gradient(90deg, transparent, transparent 40px, #E63322 40px, #E63322 41px)' }}
        />
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-flex items-center gap-3 bg-soy-red text-white px-5 py-2 text-xs font-black uppercase tracking-widest italic mb-8 shadow-[4px_4px_0px_rgba(255,255,255,0.2)]"
              >
                <Shield size={14} /> COMPLIANCE INFRASTRUCTURE
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="text-6xl md:text-8xl font-black uppercase italic tracking-tighter leading-[0.9] mb-8"
              >
                SOC 2
                <span className="block text-soy-red">READY.</span>
              </motion.h1>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="text-xl font-bold uppercase tracking-widest text-white/60 italic leading-relaxed mb-10 max-w-xl"
              >
                OpenSoyce maps directly to SOC 2 Trust Service Criteria and ISO 27001 controls. Policy-as-code, signed audit trails, and automated PR gates — built in, not bolted on.
              </motion.p>
              <div className="flex flex-wrap gap-4">
                <Link
                  to="/guard"
                  className="inline-flex items-center gap-3 bg-soy-red text-white px-8 py-4 text-sm font-black uppercase italic tracking-widest hover:bg-white hover:text-black transition-all shadow-[6px_6px_0px_rgba(255,255,255,0.2)]"
                >
                  <ShieldCheck size={18} /> Activate Guard
                </Link>
                <Link
                  to="/methodology"
                  className="inline-flex items-center gap-3 border-4 border-white text-white px-8 py-4 text-sm font-black uppercase italic tracking-widest hover:bg-white hover:text-black transition-all"
                >
                  <FileText size={18} /> Read Methodology
                </Link>
              </div>
            </div>

            {/* Right — Compliance Badge Panel */}
            <div className="flex flex-col gap-4">
              {[
                { code: 'SOC 2 TYPE II', sub: 'CC6.1 · CC6.8 · CC7.2 · CC8.1 · CC9.2', color: 'border-soy-red', dot: 'bg-soy-red' },
                { code: 'ISO 27001', sub: 'A.12.6 · A.14.2 · A.14.3', color: 'border-amber-500', dot: 'bg-amber-500' },
                { code: 'SUPPLY CHAIN SECURITY', sub: 'Ed25519-Signed Reports · SARIF Output', color: 'border-emerald-500', dot: 'bg-emerald-500' },
              ].map(({ code, sub, color, dot }) => (
                <div key={code} className={`flex items-center gap-5 border-4 ${color} bg-black/40 px-6 py-4 backdrop-blur-sm`}>
                  <div className={`w-4 h-4 rounded-full ${dot} shrink-0 shadow-[0_0_12px_currentColor]`} />
                  <div>
                    <div className="font-black uppercase italic tracking-tight text-lg text-white">{code}</div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-white/40">{sub}</div>
                  </div>
                  <CheckCircle size={20} className="text-emerald-400 ml-auto shrink-0" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── TRUST SERVICE CRITERIA GRID ──────────────────────────────── */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="mb-14 text-center">
            <div className="inline-block bg-soy-red text-white px-5 py-2 text-xs font-black uppercase tracking-widest italic mb-6 shadow-[4px_4px_0px_#000]">
              CRITERIA MAPPING
            </div>
            <h2 className="text-5xl md:text-6xl font-black uppercase italic tracking-tighter leading-none">
              Every Control. Covered.
            </h2>
            <p className="text-lg font-bold uppercase tracking-widest opacity-60 italic mt-4 max-w-2xl mx-auto">
              Each SOC 2 Trust Service Criterion maps to a specific, auditable OpenSoyce feature — not a marketing promise.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {TSC_CONTROLS.map((ctrl, i) => {
              const Icon = ctrl.icon;
              return (
                <motion.div
                  key={ctrl.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07 }}
                  className="bg-white border-4 border-black shadow-[8px_8px_0px_#000] overflow-hidden flex flex-col"
                >
                  {/* Card Header */}
                  <div className={`${ctrl.accent} text-white px-5 py-3 flex items-center justify-between`}>
                    <div className="flex items-center gap-3">
                      <Icon size={18} />
                      <span className="font-black uppercase tracking-widest text-xs">{ctrl.code}</span>
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-widest opacity-70 italic">{ctrl.category}</span>
                  </div>

                  {/* Card Body */}
                  <div className="p-6 flex-1 flex flex-col">
                    <h3 className="text-xl font-black uppercase italic tracking-tight leading-tight mb-3">{ctrl.title}</h3>
                    <p className="text-xs font-bold opacity-60 leading-relaxed mb-5">{ctrl.desc}</p>

                    {/* Feature List */}
                    <ul className="mt-auto space-y-2">
                      {ctrl.features.map(f => (
                        <li key={f} className="flex items-start gap-2.5 text-[11px] font-bold">
                          <CheckCircle size={13} className="text-emerald-500 shrink-0 mt-0.5" />
                          <span className="opacity-80 leading-snug">{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── POLICY PRESET STUDIO ─────────────────────────────────────── */}
      <section className="py-20 px-4 bg-black text-white border-y-8 border-soy-red">
        <div className="max-w-7xl mx-auto">
          <div className="mb-12">
            <div className="inline-block bg-soy-red text-white px-5 py-2 text-xs font-black uppercase tracking-widest italic mb-6 shadow-[4px_4px_0px_rgba(255,255,255,0.2)]">
              POLICY-AS-CODE
            </div>
            <h2 className="text-5xl md:text-6xl font-black uppercase italic tracking-tighter leading-none">
              One line. Full compliance.
            </h2>
            <p className="text-lg font-bold uppercase tracking-widest text-white/50 italic mt-4 max-w-2xl">
              Drop a single <code className="bg-white/10 px-1 py-0.5 text-soy-red not-italic font-mono">preset:</code> key into your <code className="bg-white/10 px-1 py-0.5 text-white not-italic font-mono">.opensoyce.yml</code> to activate a compliance mode. No tickets. No vendor calls.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Preset Selector */}
            <div className="lg:col-span-4 space-y-3">
              {PRESETS.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActivePreset(p.id)}
                  className={`w-full text-left px-5 py-4 border-4 transition-all font-mono ${p.color} ${
                    activePreset === p.id
                      ? `${p.bgActive} shadow-[6px_6px_0px_rgba(255,255,255,0.2)]`
                      : 'bg-white/5 text-white hover:bg-white/10 border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-black uppercase italic tracking-tight text-lg">{p.label}</span>
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 border-2 ${
                      activePreset === p.id ? 'bg-white/20 border-white/40' : 'border-white/20 opacity-60'
                    }`}>{p.badge}</span>
                  </div>
                  <div className="text-[10px] opacity-60 uppercase tracking-wider mt-1 font-bold">
                    {p.id === 'soc2' ? 'blocks graveyard + risky · warns watchlist' :
                     p.id === 'iso27001' ? 'identical thresholds, different audit framing' :
                     'blocks graveyard + risky + watchlist · warns stable'}
                  </div>
                </button>
              ))}

              <div className="pt-4 border-t border-white/10">
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 leading-relaxed">
                  Org policies merge on top. Repo policies merge last. A more restrictive policy always wins — a BLOCK can never be downgraded to WARN.
                </p>
              </div>
            </div>

            {/* YAML Preview */}
            <div className="lg:col-span-8">
              <div className={`border-4 ${currentPreset.color} bg-[#0d0d0d] overflow-hidden shadow-[8px_8px_0px_rgba(255,255,255,0.1)]`}>
                {/* Window Chrome */}
                <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/10">
                  <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-soy-red" />
                    <div className="w-3 h-3 rounded-full bg-amber-400" />
                    <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-40 font-mono">.opensoyce.yml</span>
                  <span className="text-[9px] font-black uppercase tracking-widest opacity-40">{currentPreset.label}</span>
                </div>

                {/* YAML Code */}
                <pre className="p-6 font-mono text-sm leading-relaxed overflow-x-auto text-white/80">
                  {currentPreset.yaml.split('\n').map((line, i) => {
                    const isComment = line.trim().startsWith('#');
                    const isKey = line.includes(':') && !isComment;
                    const isValue = line.trim().startsWith('- ');
                    return (
                      <div key={i} className={
                        isComment ? 'text-white/30' :
                        isValue ? 'text-emerald-400' :
                        isKey ? 'text-soy-red' :
                        'text-white/80'
                      }>
                        {line || '\u00A0'}
                      </div>
                    );
                  })}
                </pre>
              </div>

              <div className="mt-4 flex items-start gap-3 text-white/40 text-[10px] font-bold uppercase tracking-widest">
                <Zap size={12} className="shrink-0 mt-0.5 text-soy-red" />
                <span>Policies merge security-conservatively: either org or repo can escalate a label to BLOCK, but neither can demote a BLOCK to WARN.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── AUDIT TRAIL VISUAL ───────────────────────────────────────── */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
            {/* Left Copy */}
            <div className="lg:col-span-4">
              <div className="inline-block bg-soy-red text-white px-5 py-2 text-xs font-black uppercase tracking-widest italic mb-6 shadow-[4px_4px_0px_#000]">
                AUDIT TRAIL
              </div>
              <h2 className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter leading-none mb-6">
                Every Exception.<br />Documented.
              </h2>
              <p className="text-sm font-bold opacity-60 uppercase tracking-wider leading-relaxed mb-8">
                Every exception grant, expiry, and revocation is logged with the actor's GitHub identity, a mandatory written reason, and a hard expiry date. Download the full log as a compliance-ready JSON report.
              </p>

              <div className="space-y-4">
                {[
                  { icon: ClipboardList, label: 'Immutable exception log', sub: 'Actor · package · reason · expiry · status' },
                  { icon: Download, label: 'Downloadable JSON report', sub: 'Signed + structured for your auditor' },
                  { icon: RefreshCw, label: 'Auto-expiry enforcement', sub: '7 / 14 / 30 / 60 / 90 day policies' },
                  { icon: Eye, label: 'Real-time watchlist', sub: 'Score degradation detected before merge' },
                ].map(({ icon: Icon, label, sub }) => (
                  <div key={label} className="flex items-start gap-4 bg-white border-2 border-soy-bottle p-4 shadow-[3px_3px_0px_#302C26]">
                    <Icon size={18} className="text-soy-red shrink-0 mt-0.5" />
                    <div>
                      <div className="text-sm font-black uppercase italic tracking-tight">{label}</div>
                      <div className="text-[10px] font-bold opacity-50 uppercase tracking-wider mt-0.5">{sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right — Live Audit Table */}
            <div className="lg:col-span-8">
              <div className="bg-white border-4 border-soy-bottle shadow-[12px_12px_0px_#000] overflow-hidden">
                {/* Table header */}
                <div className="bg-soy-bottle text-soy-label px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Activity size={16} className="text-soy-red" />
                    <span className="text-[11px] font-black uppercase tracking-widest">SOC 2 / ISO 27001 Exception Audit Log — acme/web-app</span>
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-widest opacity-50">4 entries · last 30 days</span>
                </div>

                {/* Column headers */}
                <div className="grid grid-cols-12 gap-2 px-5 py-2 border-b-2 border-soy-bottle/10 bg-soy-label/30">
                  {['TIMESTAMP', 'ACTOR', 'PACKAGE', 'ACTION', 'EXPIRES', 'STATUS'].map(h => (
                    <div key={h} className={`font-black uppercase tracking-widest text-[9px] opacity-50 ${
                      h === 'ACTION' ? 'col-span-3' : h === 'TIMESTAMP' ? 'col-span-2' : 'col-span-2'
                    }`}>
                      {h}
                    </div>
                  ))}
                </div>

                {/* Rows */}
                {AUDIT_ROWS.map((row, i) => (
                  <div key={i} className={`grid grid-cols-12 gap-2 px-5 py-3 font-mono text-[11px] border-b border-soy-bottle/10 ${
                    row.status === 'expired' || row.status === 'revoked' ? 'opacity-50 bg-soy-label/20' : 'bg-white'
                  }`}>
                    <div className="col-span-2 text-soy-bottle font-bold text-[10px]">{row.ts}</div>
                    <div className="col-span-2 font-black text-soy-red">@{row.actor}</div>
                    <div className={`col-span-2 font-black ${row.status !== 'active' ? 'line-through' : ''}`}>{row.pkg}</div>
                    <div className="col-span-3 text-[10px] font-bold opacity-70">{row.action}</div>
                    <div className="col-span-2 text-[10px] font-bold">{row.expires}</div>
                    <div className="col-span-1 text-right">
                      <span className={`px-1.5 py-0.5 text-[8px] font-black uppercase border ${
                        row.status === 'active' ? 'bg-emerald-500 text-white border-black' :
                        row.status === 'expired' ? 'bg-gray-400 text-white border-gray-600' :
                        'bg-soy-red text-white border-black'
                      }`}>
                        {row.status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                ))}

                {/* Download CTA */}
                <div className="px-5 py-4 bg-soy-label/30 border-t-2 border-soy-bottle/10 flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-50">
                    Full log downloadable as signed JSON report
                  </span>
                  <Link
                    to="/guard"
                    className="inline-flex items-center gap-2 bg-soy-bottle text-soy-label px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-soy-red hover:text-white transition-all border-2 border-black shadow-[2px_2px_0px_#000]"
                  >
                    <Download size={12} /> View Compliance Tab
                  </Link>
                </div>
              </div>

              {/* Signed Report badge */}
              <div className="mt-6 flex items-center gap-4 bg-black text-white px-6 py-4 border-4 border-emerald-500 shadow-[6px_6px_0px_#10B981]">
                <Key size={24} className="text-emerald-400 shrink-0" />
                <div className="flex-1">
                  <div className="text-sm font-black uppercase italic tracking-tight">Ed25519-Signed Audit Reports</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest opacity-50 mt-0.5">
                    Every report ships with a cryptographic signature. Verify independently at /api/verify-report or with the public key at /.well-known/opensoyce-signing-key.pem
                  </div>
                </div>
                <CheckCircle size={24} className="text-emerald-400 shrink-0" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── PR GATE VISUAL ───────────────────────────────────────────── */}
      <section className="py-20 px-4 bg-soy-bottle text-white border-y-4 border-black">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="inline-block bg-soy-red text-white px-5 py-2 text-xs font-black uppercase tracking-widest italic mb-6 shadow-[4px_4px_0px_rgba(255,255,255,0.2)]">
                PR GATE
              </div>
              <h2 className="text-5xl font-black uppercase italic tracking-tighter leading-none mb-6">
                Compliance at<br />the merge gate.
              </h2>
              <p className="text-sm font-bold text-white/60 uppercase tracking-wider leading-relaxed mb-8">
                OpenSoyce Guard posts a structured PR comment the moment a lockfile change touches a policy-violating dependency. The GitHub check run fails — blocking the merge — until the team either remediates or grants a documented exception.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link to="/guard/install" className="inline-flex items-center gap-3 bg-soy-red text-white px-7 py-4 text-sm font-black uppercase italic tracking-widest hover:bg-white hover:text-black transition-all shadow-[4px_4px_0px_rgba(0,0,0,0.4)]">
                  <GitPullRequest size={16} /> Install Guard
                </Link>
                <Link to="/guard/install" className="inline-flex items-center gap-3 border-4 border-white text-white px-7 py-4 text-sm font-black uppercase italic tracking-widest hover:bg-white hover:text-soy-bottle transition-all">
                  <ArrowRight size={16} /> See Install Guide
                </Link>
              </div>
            </div>

            {/* PR Comment Mock */}
            <div className="bg-white text-soy-bottle border-4 border-black shadow-[16px_16px_0px_#000] overflow-hidden font-mono text-sm">
              {/* PR Header */}
              <div className="bg-soy-label border-b-4 border-black px-4 py-3 flex items-center gap-3">
                <GitPullRequest size={16} className="text-soy-red" />
                <span className="font-black text-xs uppercase tracking-widest">PR #142 — feat: upgrade auth dependencies</span>
                <span className="ml-auto text-[9px] bg-red-100 text-red-700 border border-red-300 px-2 py-0.5 font-black uppercase">BLOCKED</span>
              </div>

              {/* Check Row */}
              <div className="px-4 py-3 border-b border-soy-bottle/10 flex items-center gap-3 bg-red-50">
                <AlertTriangle size={14} className="text-soy-red shrink-0" />
                <div>
                  <div className="font-black text-xs uppercase tracking-wider text-red-700">opensoyce/guard — Policy violation: 1 blocked dependency</div>
                  <div className="text-[10px] opacity-50 mt-0.5">Required status check · 2 minutes ago</div>
                </div>
              </div>

              {/* Package rows */}
              <div className="divide-y divide-soy-bottle/10">
                {[
                  { pkg: 'event-stream', verdict: '🪦 GRAVEYARD', action: 'BLOCKED', color: 'text-soy-red bg-red-50' },
                  { pkg: 'axios (3.0.1)', verdict: '👁️ WATCHLIST', action: 'WARN', color: 'text-amber-700 bg-amber-50' },
                  { pkg: 'next.js (15.1)', verdict: '✅ USE READY', action: 'PASS', color: 'text-emerald-700 bg-emerald-50' },
                ].map(({ pkg, verdict, action, color }) => (
                  <div key={pkg} className={`flex items-center justify-between px-4 py-2.5 ${color}`}>
                    <span className="font-bold text-xs">{pkg}</span>
                    <span className="text-[10px] font-black">{verdict}</span>
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 border-2 border-current`}>{action}</span>
                  </div>
                ))}
              </div>

              <div className="px-4 py-3 bg-soy-label/30 text-[10px] font-bold uppercase tracking-widest opacity-60">
                Policy: soc2 preset · Source: repo (.opensoyce.yml) · 1 exception required to proceed
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── BOTTOM CTA ───────────────────────────────────────────────── */}
      <section className="py-24 px-4 bg-white border-t-4 border-black text-center">
        <div className="max-w-4xl mx-auto">
          <div className="inline-block bg-soy-red text-white px-5 py-2 text-xs font-black uppercase tracking-widest italic mb-8 shadow-[4px_4px_0px_#000]">
            GET STARTED
          </div>
          <h2 className="text-5xl md:text-7xl font-black uppercase italic tracking-tighter leading-none mb-8">
            Your auditor<br />will love this.
          </h2>
          <p className="text-xl font-bold uppercase tracking-widest opacity-60 italic max-w-2xl mx-auto mb-12">
            Ship the SOC 2 evidence package your security team has been asking for — without changing how your developers work.
          </p>
          <div className="flex flex-wrap gap-6 justify-center">
            <Link to="/guard" className="inline-flex items-center gap-3 bg-black text-white px-10 py-5 text-xl font-black uppercase italic hover:bg-soy-red transition-all shadow-[8px_8px_0px_#E63322]">
              <Shield size={24} /> Activate Guard <ArrowRight size={20} />
            </Link>
            <Link to="/pricing" className="inline-flex items-center gap-3 border-4 border-black px-10 py-5 text-xl font-black uppercase italic hover:bg-black hover:text-white transition-all shadow-[8px_8px_0px_#000]">
              View Enterprise Pricing
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
