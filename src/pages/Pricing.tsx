import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ArrowRight, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type Tier = {
  name: string;
  price: string;
  period?: string;
  value: string;
  features: string[];
  ctaLabel: string;
  ctaTo: string;
  highlighted?: boolean;
};

const tiers: Tier[] = [
  {
    name: 'FREE',
    price: '$0',
    value: 'Public labels, free scans, shareable reports.',
    features: [
      'Public repo scans (unlimited)',
      'Soyce Score + verdict band',
      'Shareable scan reports',
      'README badge',
    ],
    ctaLabel: 'Start Free',
    ctaTo: '/scanner',
  },
  {
    name: 'STARTER',
    price: '$19',
    period: 'MO',
    value: 'One private repo. Guard basics for solo builders.',
    features: [
      'One private repo',
      'Basic Guard checks (Standard security scans & CVE vulnerability matching)',
      'Email alerts on score drops',
      'Lockfile scans on demand',
    ],
    ctaLabel: 'Join Early Access',
    ctaTo: '/guard/early-access?plan=starter',
  },
  {
    name: 'TEAM',
    price: '$99',
    period: 'MO',
    value: 'Block risky merges. PR comments + policy you control.',
    features: [
      'PR comments on every push',
      'Policy rules (Custom block/allow gates for license, activity & CVEs)',
      'Scan history + diffs',
      'Up to 10 private repos',
      'Slack + email alerts',
    ],
    ctaLabel: 'Join Early Access',
    ctaTo: '/guard/early-access?plan=team',
    highlighted: true,
  },
  {
    name: 'GROWTH',
    price: '$299',
    period: 'MO',
    value: 'Org-wide watchlists, exception workflow, SARIF export.',
    features: [
      'Multi-repo + multi-org',
      'Watchlists across teams',
      'SARIF output for code scanning',
      'Exception + waiver workflow',
      'Priority support',
    ],
    ctaLabel: 'Join Early Access',
    ctaTo: '/guard/early-access?plan=growth',
  },
  {
    name: 'ENTERPRISE',
    price: 'Custom',
    value: 'SSO, API access, audit exports, procurement-friendly.',
    features: [
      'SSO / SAML',
      'API access + webhooks',
      'Audit log exports',
      'Custom policy bundles',
      'Dedicated support',
    ],
    ctaLabel: 'Request Access',
    ctaTo: '/guard/early-access?plan=enterprise',
  },
];

const FAQItem = ({ question, answer }: { question: string; answer: string }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="border-b-4 border-soy-bottle">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full py-6 flex items-center justify-between text-left group"
      >
        <span className="text-xl font-black uppercase italic tracking-tight group-hover:text-soy-red transition-colors">{question}</span>
        {isOpen ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <p className="pb-6 font-bold opacity-60 uppercase tracking-widest text-sm leading-relaxed">
              {answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function Pricing() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-20">
      {/* Header */}
      <div className="text-center mb-16">
        <h1 className="text-6xl md:text-8xl font-black uppercase italic tracking-tighter mb-4">
          OpenSoyce Pricing
        </h1>
        <p className="text-lg md:text-xl font-bold uppercase tracking-widest opacity-60 max-w-3xl mx-auto leading-relaxed">
          Catch risky dependencies before they merge.<br />
          Free for public repos, paid for teams.
        </p>
      </div>

      {/* Pricing Grid — 5 tiers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 mb-24">
        {tiers.map((tier) => {
          const highlighted = !!tier.highlighted;
          return (
            <div
              key={tier.name}
              className={`relative bg-white border-4 border-soy-bottle p-6 flex flex-col h-full transition-transform hover:-translate-y-1 ${
                highlighted
                  ? 'border-soy-red shadow-[8px_8px_0px_#E63322]'
                  : 'shadow-[6px_6px_0px_#000]'
              }`}
            >
              {highlighted && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-soy-red text-white px-3 py-1 text-[10px] font-black uppercase tracking-widest italic whitespace-nowrap">
                  Recommended
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-xl font-black uppercase italic tracking-tight mb-3">{tier.name}</h3>
                <div className="flex items-baseline gap-1 mb-3">
                  <span className="text-4xl font-black italic tracking-tighter">{tier.price}</span>
                  {tier.period && (
                    <span className="text-base font-bold opacity-40 italic">/{tier.period}</span>
                  )}
                </div>
                <p className="text-xs font-bold uppercase tracking-widest opacity-60 leading-relaxed italic min-h-[3rem]">
                  {tier.value}
                </p>
              </div>

              <div className="flex-1 space-y-3 mb-8">
                {tier.features.map((feature, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Check className="text-soy-red mt-0.5 shrink-0" size={14} />
                    <span className="text-[11px] font-black uppercase tracking-wide leading-tight">{feature}</span>
                  </div>
                ))}
              </div>

              <Link
                to={tier.ctaTo}
                className={`block w-full py-4 px-3 text-center text-sm font-black uppercase tracking-widest border-4 border-soy-bottle transition-all group ${
                  highlighted
                    ? 'bg-soy-red text-white hover:bg-soy-bottle'
                    : 'bg-soy-bottle text-soy-label hover:bg-soy-red hover:text-white'
                }`}
              >
                {tier.ctaLabel}
                <ArrowRight className="inline ml-1 group-hover:translate-x-1 transition-transform" size={14} />
              </Link>
            </div>
          );
        })}
      </div>

      {/* FAQ */}
      <div className="max-w-3xl mx-auto">
        <h2 className="text-4xl font-black uppercase italic tracking-tighter mb-12 flex items-center gap-4">
          <HelpCircle size={32} className="text-soy-red" />
          Frequently Asked Questions
        </h2>
        <div className="border-t-4 border-soy-bottle">
          <FAQItem
            question="What is the difference between Basic Guard checks and Policy rules?"
            answer="Basic Guard checks (Starter tier) scan your PRs for known vulnerabilities (CVEs) and basic score drops. Policy rules (Team tier and above) allow you to define custom gating criteria—such as blocking merges for copyleft licenses (e.g. GPL), low project activity/maintenance scores, or specific CVE severity thresholds."
          />
          <FAQItem
            question="What's the difference between Scanner and Guard?"
            answer="Scanner is the free public tool — paste a lockfile or repo URL, get a score. Guard runs on every PR in your private repos, posts inline comments, and blocks merges that violate your policy."
          />
          <FAQItem
            question="Is the free tier really free?"
            answer="Yes. Public repo scans, scores, and shareable reports stay free forever. No credit card. Paid tiers cover private repos, PR automation, and team workflows."
          />
          <FAQItem
            question="What does early access mean?"
            answer="Paid tiers are in early access. Join the waitlist and we'll onboard you personally — billing turns on once you've used Guard on a real PR and we know it works for your stack."
          />
          <FAQItem
            question="Do you offer open source discounts?"
            answer="If you maintain a popular open source project, email oss@opensoyce.io. We'll get you set up."
          />
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="mt-32 p-12 bg-soy-bottle text-soy-label border-4 border-soy-bottle shadow-[12px_12px_0px_#E63322] flex flex-col md:flex-row items-center justify-between gap-12">
        <div className="max-w-xl">
          <h2 className="text-4xl font-black uppercase italic tracking-tighter mb-4 text-white">Scale your dependency intelligence</h2>
          <p className="font-bold opacity-60 uppercase tracking-widest leading-relaxed">Powering modern software engineering teams to secure their production supply chains.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
          <Link
            to="/scan"
            className="bg-soy-red text-white px-8 py-4 text-xl font-black uppercase italic hover:scale-105 transition-transform whitespace-nowrap text-center border-2 border-white shadow-[4px_4px_0px_#000]"
          >
            SCAN CODEBASE
          </Link>
          <Link
            to="/claim"
            className="bg-white text-soy-bottle px-8 py-4 text-xl font-black uppercase italic hover:scale-105 transition-transform whitespace-nowrap text-center border-2 border-soy-bottle shadow-[4px_4px_0px_#000]"
          >
            CLAIM PROJECT
          </Link>
        </div>
      </div>
    </div>
  );
}
