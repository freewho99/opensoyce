import React, { useState } from 'react';
import { Check, X, ArrowRight, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const FAQItem = ({ question, answer }: { question: string, answer: string }) => {
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
  const [isAnnual, setIsAnnual] = useState(true);

  const tiers = [
    {
      name: 'FREE',
      price: '0',
      description: 'Perfect for enthusiasts tracking a few critical repos.',
      features: [
        'Repo Lookup (10/day)',
        'Stack Scanner',
        'AI Recipes',
        'Watchlist (5 repos)',
        'Compare (2 repos)',
        'README Badge'
      ],
      cta: 'START FREE',
      highlighted: false
    },
    {
      name: 'PRO',
      price: isAnnual ? '99' : '12',
      period: isAnnual ? 'YR' : 'MO',
      savings: isAnnual ? 'SAVE 31%' : '',
      description: 'For professionals managing complex dependency stacks.',
      features: [
        'Everything in Free, PLUS:',
        'Unlimited Lookups',
        'Watchlist (Unlimited)',
        'Compare (Up to 6 repos)',
        'Score Drop Alerts (Email)',
        'Priority API (5000 req/hr)',
        'Export Reports (PDF/JSON)'
      ],
      cta: 'GO PRO',
      highlighted: true
    },
    {
      name: 'TEAM',
      price: '49',
      period: 'MO',
      description: 'Standardize health metrics across your organization.',
      features: [
        'Everything in Pro, PLUS:',
        'Team Dashboard',
        'Shared Watchlists',
        'SSO / SAML',
        'Slack Integration',
        'Custom Webhooks',
        'SLA Support',
        'API Access'
      ],
      cta: 'CONTACT SALES',
      highlighted: false
    }
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-20">
      {/* Header */}
      <div className="text-center mb-16">
        <h1 className="text-6xl md:text-8xl font-black uppercase italic tracking-tighter mb-4">Pricing Plans</h1>
        <p className="text-xl font-bold uppercase tracking-widest opacity-60 mb-12">Select your level of dependency insurance.</p>
        
        {/* Toggle */}
        <div className="flex items-center justify-center gap-4">
          <span className={`text-sm font-black uppercase tracking-widest ${!isAnnual ? 'text-soy-red' : 'opacity-40'}`}>Monthly</span>
          <button 
            onClick={() => setIsAnnual(!isAnnual)}
            className="w-16 h-8 bg-soy-bottle rounded-full relative p-1 transition-colors"
          >
            <motion.div 
              animate={{ x: isAnnual ? 32 : 0 }}
              className="w-6 h-6 bg-soy-red rounded-full shadow-lg"
            />
          </button>
          <span className={`text-sm font-black uppercase tracking-widest ${isAnnual ? 'text-soy-red' : 'opacity-40'}`}>
            Annual <span className="ml-1 bg-soy-red text-white text-[10px] px-1.5 py-0.5 rounded-sm">SAVE 20%</span>
          </span>
        </div>
        
        <AnimatePresence>
          {isAnnual && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mt-4"
            >
              <span className="bg-emerald-500 text-white text-[10px] font-black px-4 py-1.5 uppercase tracking-widest italic shadow-[2px_2px_0px_#000]">
                SAVE 20% WITH ANNUAL
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Pricing Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-24">
        {tiers.map((tier) => (
          <div 
            key={tier.name}
            className={`relative bg-white border-4 border-soy-bottle p-8 shadow-[8px_8px_0px_#000] flex flex-col h-full transition-transform hover:-translate-y-2 ${
              tier.highlighted ? 'border-soy-red shadow-[8px_8px_0px_#E63322]' : ''
            }`}
          >
            {tier.highlighted && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-soy-red text-white px-4 py-1 text-xs font-black uppercase tracking-widest italic">
                Most Popular
              </div>
            )}
            
            <div className="mb-8">
              <h3 className="text-2xl font-black uppercase italic tracking-tight mb-2">{tier.name}</h3>
              <div className="flex flex-col mb-4">
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-black italic tracking-tighter">${tier.price}</span>
                  {tier.period && <span className="text-lg font-bold opacity-40 italic">/{tier.period}</span>}
                </div>
                {tier.name === 'PRO' && isAnnual && (
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-40 italic">≈ $8.25/mo billed annually</span>
                )}
                {tier.name === 'TEAM' && (
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-40 italic">$49/mo per seat</span>
                )}
              </div>
              <p className="text-xs font-bold uppercase tracking-widest opacity-60 leading-relaxed italic">{tier.description}</p>
            </div>

            <div className="flex-1 space-y-4 mb-12">
              {tier.features.map((feature, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Check className="text-soy-red mt-0.5 shrink-0" size={16} />
                  <span className="text-xs font-black uppercase tracking-widest leading-tight">{feature}</span>
                </div>
              ))}
            </div>

            <button className={`w-full py-5 text-xl font-black uppercase tracking-widest border-4 border-soy-bottle transition-all relative group ${
              tier.highlighted 
                ? 'bg-soy-red text-white hover:bg-soy-bottle' 
                : 'bg-soy-bottle text-soy-label hover:bg-soy-red hover:text-white'
            }`}>
              {tier.cta}
              <ArrowRight className="inline ml-2 group-hover:translate-x-2 transition-transform" />
            </button>
          </div>
        ))}
      </div>

      {/* FAQ */}
      <div className="max-w-3xl mx-auto">
        <h2 className="text-4xl font-black uppercase italic tracking-tighter mb-12 flex items-center gap-4">
          <HelpCircle size={32} className="text-soy-red" />
          Frequently Asked Questions
        </h2>
        <div className="border-t-4 border-soy-bottle">
          <FAQItem 
            question="Is the free tier really free?"
            answer="Yes. No credit card required. You get 10 repo lookups per day and access to all standard core features forever."
          />
          <FAQItem 
            question="What counts as a repo lookup?"
            answer="Each time you analyze a new GitHub repository on the Lookup page, it counts as one lookup. Subsequent views of the same repo within 24 hours are free."
          />
          <FAQItem 
            question="Can I cancel anytime?"
            answer="Absolutely. You can cancel your subscription at any time from your account settings. You will retain access to your plan features until the end of your current billing period."
          />
          <FAQItem 
            question="Do you offer open source discounts?"
            answer="We love open source! If you maintain a popular open source project, email us at oss@opensoyce.io for a complimentary Pro account."
          />
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="mt-32 p-12 bg-soy-bottle text-soy-label border-4 border-soy-bottle shadow-[12px_12px_0px_#E63322] flex flex-col md:flex-row items-center justify-between gap-12">
        <div className="max-w-xl">
          <h2 className="text-4xl font-black uppercase italic tracking-tighter mb-4 text-white">Scale your dependency intelligence</h2>
          <p className="font-bold opacity-60 uppercase tracking-widest leading-relaxed">Join 12,000+ engineers who use OpenSoyce to secure their production supply chains every day.</p>
        </div>
        <button className="bg-soy-red text-white px-12 py-6 text-2xl font-black uppercase italic hover:scale-105 transition-transform whitespace-nowrap">
          GET STARTED NOW
        </button>
      </div>
    </div>
  );
}
