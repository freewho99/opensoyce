import { Lock, ShieldCheck, Bell, ClipboardList, Key, FileText } from 'lucide-react';

export const TSC_CONTROLS = [
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

export const PRESETS = [
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
