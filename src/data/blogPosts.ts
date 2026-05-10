export type BlogPost = {
  slug: string;
  title: string;
  subtitle: string;
  category: "ANALYSIS" | "HOT TAKE" | "DEEP DIVE" | "FRAMEWORK WARS" | "SECURITY" | "PRODUCT";
  date: string;
  readTime: string;
  emoji: string;
  content: string;
  tags: string[];
};

export const blogPosts: BlogPost[] = [
  {
    slug: "why-left-pad-broke-the-internet",
    title: "WHY LEFT-PAD BROKE THE INTERNET (AND WHAT WE LEARNED)",
    subtitle: "A story of 11 lines of code and the absolute fragility of our ecosystem.",
    category: "HOT TAKE",
    date: "APRIL 28, 2026",
    readTime: "6 min read",
    emoji: "🧩",
    tags: ["history", "trust", "npm"],
    content: `In March 2016, a developer named Azer Koçulu unpublished 273 packages from npm in a dispute over a naming conflict with Kik. One of those packages was left-pad — 11 lines of code that left-padded a string with zeros or spaces. Within hours, React, Babel, and thousands of other projects were broken worldwide. CI pipelines failed. Production deployments stalled. The internet had a meltdown over a function that could be written in a tweet.

The lesson wasn't "don't use small packages." The lesson was that the open-source ecosystem had no trust layer. There was no signal for which packages were actively maintained, which had single points of failure, and which were one angry email away from disappearing. Developers were flying blind, trusting npm stars and gut instinct.

This is exactly the problem OpenSoyce was built to solve. A Soyce Score surfaces the signals that matter: Is this package maintained? Does it have multiple contributors or a bus factor of one? Is there a license? When was the last commit? These aren't vanity metrics — they're the difference between a dependency you can bet your stack on and one that will leave you stranded at 2am.

The left-pad incident is now a footnote. But the underlying problem — opacity in open-source health — never went away. Every week, projects are abandoned, maintainers burn out, and security vulnerabilities sit unpatched in packages that millions of applications depend on. OpenSoyce is the nutrition label we should have had in 2016. Better late than never.`
  },
  {
    slug: "framework-wars-are-over",
    title: "THE FRAMEWORK WARS ARE OVER (EVERYONE LOST)",
    subtitle: "Maintenance discipline matters more than your view library.",
    category: "FRAMEWORK WARS",
    date: "APRIL 15, 2026",
    readTime: "8 min read",
    emoji: "⚔️",
    tags: ["react", "vue", "angular", "maintenance"],
    content: `The React vs Vue vs Angular vs Svelte debate is a massive distraction. While developers argue about syntax and reactivity models, the real signals of project success are being ignored. If you look at the top tier of any framework ecosystem, you'll find that their core library scores on OpenSoyce are remarkably similar — almost all of them sit comfortably above 8.5.

What actually differentiates a "good" choice from a "bad" one isn't the framework itself, but the maintenance discipline behind it. A React component library with a 9.2 score is infinitely better than a "blazing fast" new framework's core library with a 4.5. We've reached a plateau in frontend technology where the DX and performance are "good enough" across the board.

Instead of hunting for the latest framework that promises 5% better TTI, we should be auditing our existing dependencies for rot. The "winner" of the framework wars isn't the library that has the most GitHub stars; it's the one that will still be shipping security patches and maintaining a stable API three years from now.

Ultimately, the best framework is the one your team can maintain best. If you're building a mission-critical application, you shouldn't care about what's trending on Twitter. You should care about commit velocity, documentation freshness, and the responsiveness of the maintainers. The wars are over; it's time to get back to building reliable software.`
  },
  {
    slug: "how-to-read-a-soyce-score",
    title: "HOW TO READ A SOYCE SCORE (AND WHAT IT WON'T TELL YOU)",
    subtitle: "A transparency report on the numbers that drive your decisions.",
    category: "DEEP DIVE",
    date: "APRIL 2, 2026",
    readTime: "10 min read",
    emoji: "📖",
    tags: ["methodology", "metrics", "transparency"],
    content: `A Soyce Score is a 0-10 metric derived from five core pillars: Maintenance, Community, Security, Documentation, and Activity. Each pillar represents a critical health signal. Maintenance tracks how often code is pushed and how long bugs sit open. Community looks at the contributor base. Security audits licenses and known CVEs. Documentation uses AI to judge how well the code is explained. Activity measures the pulse of the last 30 days.

However, a score is just a starting point. It's a quantitative summary, not a qualitative review. A score of 9.2 tells you the project is vital, well-maintained, and popular, but it doesn't tell you if the architecture is over-engineered or if the API is a nightmare to use. It doesn't tell you if the community is toxic or if the maintainers have a history of breaking changes.

We built this system to be a "Nutrition Label." Just like a label on a cereal box tells you the sugar content but not how it tastes, OpenSoyce tells you the health of the project's management but not the quality of its code. You still need to open the source code, check the issue tracker for architectural debates, and see if the philosophy aligns with your team's.

Use the Soyce Score to filter out the noise. If a project has a 3.5, you probably shouldn't even look at the code — it's decaying. But for projects in the 7-10 range, the score is just your invitation to do a deeper manual audit. Trust the data to filter, trust your gut to choose.`
  },
  {
    slug: "supply-chain-security-open-source",
    title: "SUPPLY CHAIN SECURITY IS THE NEXT FRONTIER FOR OPEN SOURCE",
    subtitle: "Why dependency health is now a Tier-1 security issue.",
    category: "SECURITY",
    date: "MARCH 20, 2026",
    readTime: "7 min read",
    emoji: "🛡️",
    tags: ["security", "xz-utils", "supply-chain"],
    content: `The security landscape changed forever after the SolarWinds and Log4Shell incidents. More recently, the XZ Utils backdoor proved that attackers are no longer just looking for bugs — they are looking for maintainers. By social engineering their way into a position of trust over years, a state-sponsored actor almost compromised the foundations of Linux worldwide.

Supply chain attacks have made dependency health a Tier-1 security issue. It's not enough to run a vulnerability scanner on your built code. You need to know who is maintaining your dependencies and what their activity looks like. A sudden shift in maintainers or a weird spike in commits to a stable project are now potential security signals, not just maintenance updates.

OpenSoyce's scoring serves as a first-pass filter against these risks. A high Security score doesn't just mean "no known bugs"; it means the project has a clear license, a security policy, and a history of responsive fixes. It means the project is "visible" to the ecosystem. Attackers love the shadows of unmaintained, low-visibility packages.

In 2026, every engineering team needs a supply chain posture. You wouldn't hire a developer without a background check — why are you installing code from a stranger who hasn't pushed a commit in two years? Visibility is the only antidote to supply chain risk. Stay in the light.`
  },
  {
    slug: "maintainer-burnout-crisis",
    title: "THE MAINTAINER BURNOUT CRISIS AND WHAT COMPANIES OWE OPEN SOURCE",
    subtitle: "The imbalance between corporate consumption and maintainer sanity.",
    category: "ANALYSIS",
    date: "MARCH 5, 2026",
    readTime: "9 min read",
    emoji: "🕯️",
    tags: ["burnout", "philosophy", "sustainability"],
    content: `Open source is built on a foundation of volunteers who are often overworked and underappreciated. From OpenSSL to curl to the Faker.js incident, we've seen maintainers reach their breaking point after years of providing free labor to billion-dollar corporations. The imbalance between corporate consumption and contribution is a crisis.

When a maintainer burns out, the project doesn't just stop — it rots. It becomes a security risk. And often, companies only realize the "free" software they were using had a price when they have to spend millions to replace it after it fails. A low Activity or Maintenance score on OpenSoyce is often just an early warning signal of maintainer burnout.

We need to shift from a culture of extraction to a culture of stewardship. Companies that rely on open-source packages should be funding those maintainers directly through platforms like GitHub Sponsors or Open Collective. It's not an act of charity; it's an insurance policy for your own technical infrastructure.

OpenSource sustainability is the biggest challenge facing our industry. If we don't find a way to support the humans behind the code, the "Nutrition Label" of our favorite packages will eventually just show empty shelves. Support the repos that support your business. Maintainer sanity is your problem too.`
  }
];
