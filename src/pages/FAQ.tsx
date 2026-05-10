import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, HelpCircle, Compass, Zap, ShieldCheck, CreditCard } from 'lucide-react';

const AccordionItem = ({ question, answer }: { question: string; answer: string; key?: React.Key }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={`border-b-2 border-soy-bottle/20 transition-all ${isOpen ? 'bg-white' : ''}`}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full py-6 flex items-center justify-between text-left px-4 hover:bg-soy-label/50 transition-colors group ${isOpen ? 'border-l-8 border-soy-red' : ''}`}
      >
        <span className={`text-xl font-black uppercase italic tracking-tight ${isOpen ? 'text-soy-red' : ''}`}>
          {question}
        </span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown size={24} className={isOpen ? 'text-soy-red' : 'opacity-40'} />
        </motion.div>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-8 pt-0 font-bold opacity-60 uppercase tracking-widest text-sm leading-relaxed">
              {answer}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function FAQ() {
  const sections = [
    {
      title: "THE SCORE",
      icon: <HelpCircle className="text-soy-red" />,
      items: [
        {
          question: "How is the Soyce Score calculated?",
          answer: "The Soyce Score is a weighted average of four key dimensions: Maintenance (30%), Security (25%), Community (25%), and Documentation (20%). We aggregate data from the GitHub API, version history, and issue trackers to generate a real-time health rating on a 0-10 scale."
        },
        {
          question: "What's considered a good score?",
          answer: "A score of 8.0+ is considered 'Production Safe'. Scores between 6.0 and 7.9 are decent but require caution. Anything below 6.0 represents serious technical or security risk, and anything below 4.0 should be replaced or avoided in mission-critical applications."
        },
        {
          question: "Can I dispute my project's score?",
          answer: "Yes. Every project owner can claim their repo, complete a Sauce Audit, and submit a dispute if they believe a metric is misrepresented. Verified maintainers receive priority review as part of our commitment to accuracy."
        },
        {
          question: "How often are scores updated?",
          answer: "Claimed and verified repositories receive real-time updates based on activity. Unclaimed repositories are re-scanned every 72 hours to ensure metrics remain fresh without overloading API resources."
        }
      ]
    },
    {
      title: "FRESH VS STALE",
      icon: <Zap className="text-soy-red" />,
      items: [
        {
          question: "What does FRESH mean?",
          answer: "A project is FRESH if it has active commits in the last 30 days, high issue response rates, and recent releases. It's a sign of a vibrant, well-maintained project that is safe to build on."
        },
        {
          question: "What does AGING mean?",
          answer: "AGING indicates the last meaningful activity was 31 to 90 days ago. The project isn't dead, but velocity is slowing. You should watch it closely for signs of total abandonment."
        },
        {
          question: "What does STALE mean?",
          answer: "STALE means no meaningful activity in 90+ days. This is a high-risk category because security vulnerabilities are likely going unpatched and the project may no longer be compatible with newer dependency versions."
        },
        {
          question: "Can a project be STALE but still safe to use?",
          answer: "Yes. Some utility libraries are 'feature complete' and don't require frequent updates. If a library is STALE but maintains a high Soyce Score in documentation and has no known security issues, it may still be safe. Context is everything."
        }
      ]
    },
    {
      title: "CLAIMING & VERIFICATION",
      icon: <ShieldCheck className="text-soy-red" />,
      items: [
        {
          question: "Why should I claim my repo?",
          answer: "Claiming unlocks the VERIFIED badge, gives you a maintainer dashboard, allows you to dispute scores, and lets you control how your project's nutritional information is presented on our leaderboards."
        },
        {
          question: "How long does verification take?",
          answer: "Standard verification takes under 24 hours. However, adding the 'opensoyce-verified' topic to your GitHub repository or adding the README badge can speed this up to under 2 hours."
        },
        {
          question: "What is the Sauce Audit?",
          answer: "The Sauce Audit is a 10-question self-assessment covering maintenance habits, security policies, and documentation quality. Honest answers that reveal weaknesses earn our 'Transparent Maintainer' badge, which often builds more trust than a perfect score."
        },
        {
          question: "Is the Sauce Audit score public?",
          answer: "The final blended Soyce Score is public. However, your individual responses to the audit questions are private by default unless you choose to share your full health report publicly."
        }
      ]
    },
    {
      title: "PRICING & PLANS",
      icon: <CreditCard className="text-soy-red" />,
      items: [
        {
          question: "Is the free tier really free forever?",
          answer: "Yes. Our goal is to make open source safer for everyone. The free tier includes 10 lookups per day, stack scanning, AI recipes, and watchlist capabilities for up to 5 repos. No credit card required."
        },
        {
          question: "What's the difference between PRO and TEAM?",
          answer: "PRO is designed for individual power users. TEAM adds collaborative features like shared watchlists, SSO/SAML, Slack and Discord integrations, custom webhooks, and priority SLA support for enterprises."
        },
        {
          question: "Can I cancel anytime?",
          answer: "Absolutely. There are no long-term contracts or hidden cancellation fees. If you downgrade, you keep your claimed repos and VERIFIED status, but lose access to professional-grade tools like unlimited watchlists."
        }
      ]
    }
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-20">
      <header className="mb-20 text-center">
        <h1 className="text-5xl md:text-8xl font-black uppercase italic tracking-tighter leading-none mb-4">
          FREQUENTLY ASKED QUESTIONS
        </h1>
        <p className="text-2xl font-bold uppercase tracking-widest text-soy-red italic uppercase">
          NO FLUFF. JUST SAUCE.
        </p>
      </header>

      <div className="space-y-24">
        {sections.map((section) => (
          <section key={section.title}>
            <div className="flex items-center gap-4 mb-12 border-b-8 border-soy-bottle pb-4">
              {section.icon}
              <h2 className="text-4xl font-black uppercase italic tracking-tight">
                {section.title}
              </h2>
            </div>
            <div className="border-4 border-soy-bottle bg-white shadow-[12px_12px_0px_#000]">
              {section.items.map((item, idx) => (
                <AccordionItem 
                  key={idx}
                  question={item.question}
                  answer={item.answer}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-32 p-12 bg-soy-bottle text-center shadow-[12px_12px_0px_#E63322]">
        <h3 className="text-3xl font-black uppercase italic tracking-tighter text-white mb-8">
          STILL HAVE QUESTIONS?
        </h3>
        <button className="bg-soy-red text-white px-12 py-6 text-xl font-black uppercase italic hover:scale-105 transition-transform">
          CONTACT SUPPORT HEROES
        </button>
      </div>
    </div>
  );
}
