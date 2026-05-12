export type BlogPost = {
  heroImage?: string;
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
    emoji: "ð§©",
    tags: ["history", "trust", "npm"],
    content: `In March 2016, a developer named Azer Koculu unpublished 273 packages from npm in a dispute over a naming conflict with Kik. One of those packages was left-pad - 11 lines of code that left-padded a string with zeros or spaces. Within hours, React, Babel, and thousands of other projects were broken worldwide. CI pipelines failed. Production deployments stalled. The internet had a meltdown over a function that could be written in a tweet.

The lesson wasn't "don't use small packages." The lesson was that the open-source ecosystem had no trust layer. There was no signal for which packages were actively maintained, which had single points of failure, and which were one angry email away from disappearing. Developers were flying blind, trusting npm stars and gut instinct.

This is exactly the problem OpenSoyce was built to solve. A Soyce Score surfaces the signals that matter: Is this package maintained? Does it have multiple contributors or a bus factor of one? Is there a license? When was the last commit? These aren't vanity metrics - they're the difference between a dependency you can bet your stack on and one that will leave you stranded at 2am.

The left-pad incident is now a footnote. But the underlying problem - opacity in open-source health - never went away. Every week, projects are abandoned, maintainers burn out, and security vulnerabilities sit unpatched in packages that millions of applications depend on. OpenSoyce is the nutrition label we should have had in 2016. Better late than never.`
  },
  {
    slug: "framework-wars-are-over",
    title: "THE FRAMEWORK WARS ARE OVER (EVERYONE LOST)",
    subtitle: "Maintenance discipline matters more than your view library.",
    category: "FRAMEWORK WARS",
    date: "APRIL 15, 2026",
    readTime: "8 min read",
    emoji: "âï¸",
    tags: ["react", "vue", "angular", "maintenance"],
    content: `The React vs Vue vs Angular vs Svelte debate is a massive distraction. While developers argue about syntax and reactivity models, the real signals of project success are being ignored. If you look at the top tier of any framework ecosystem, you'll find that their core library scores on OpenSoyce are remarkably similar - almost all of them sit comfortably above 8.5.

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
    emoji: "ð",
    tags: ["methodology", "metrics", "transparency"],
    content: `A Soyce Score is a 0-10 metric derived from five core pillars: Maintenance, Community, Security, Documentation, and Activity. Each pillar represents a critical health signal. Maintenance tracks how often code is pushed and how long bugs sit open. Community looks at the contributor base. Security audits licenses and known CVEs. Documentation uses AI to judge how well the code is explained. Activity measures the pulse of the last 30 days.

However, a score is just a starting point. It's a quantitative summary, not a qualitative review. A score of 9.2 tells you the project is vital, well-maintained, and popular, but it doesn't tell you if the architecture is over-engineered or if the API is a nightmare to use. It doesn't tell you if the community is toxic or if the maintainers have a history of breaking changes.

We built this system to be a "Nutrition Label." Just like a label on a cereal box tells you the sugar content but not how it tastes, OpenSoyce tells you the health of the project's management but not the quality of its code. You still need to open the source code, check the issue tracker for architectural debates, and see if the philosophy aligns with your team's.

Use the Soyce Score to filter out the noise. If a project has a 3.5, you probably shouldn't even look at the code - it's decaying. But for projects in the 7-10 range, the score is just your invitation to do a deeper manual audit. Trust the data to filter, trust your gut to choose.`
  },
  {
    slug: "supply-chain-security-open-source",
    title: "SUPPLY CHAIN SECURITY IS THE NEXT FRONTIER FOR OPEN SOURCE",
    subtitle: "Why dependency health is now a Tier-1 security issue.",
    category: "SECURITY",
    date: "MARCH 20, 2026",
    readTime: "7 min read",
    emoji: "ð¡ï¸",
    tags: ["security", "xz-utils", "supply-chain"],
    content: `The security landscape changed forever after the SolarWinds and Log4Shell incidents. More recently, the XZ Utils backdoor proved that attackers are no longer just looking for bugs - they are looking for maintainers. By social engineering their way into a position of trust over years, a state-sponsored actor almost compromised the foundations of Linux worldwide.

Supply chain attacks have made dependency health a Tier-1 security issue. It's not enough to run a vulnerability scanner on your built code. You need to know who is maintaining your dependencies and what their activity looks like. A sudden shift in maintainers or a weird spike in commits to a stable project are now potential security signals, not just maintenance updates.

OpenSoyce's scoring serves as a first-pass filter against these risks. A high Security score doesn't just mean "no known bugs"; it means the project has a clear license, a security policy, and a history of responsive fixes. It means the project is "visible" to the ecosystem. Attackers love the shadows of unmaintained, low-visibility packages.

In 2026, every engineering team needs a supply chain posture. You wouldn't hire a developer without a background check - why are you installing code from a stranger who hasn't pushed a commit in two years? Visibility is the only antidote to supply chain risk. Stay in the light.`
  },
  {
    slug: "maintainer-burnout-crisis",
    title: "THE MAINTAINER BURNOUT CRISIS AND WHAT COMPANIES OWE OPEN SOURCE",
    subtitle: "The imbalance between corporate consumption and maintainer sanity.",
    category: "ANALYSIS",
    date: "MARCH 5, 2026",
    readTime: "9 min read",
    emoji: "ð¯ï¸",
    tags: ["burnout", "philosophy", "sustainability"],
    content: `Open source is built on a foundation of volunteers who are often overworked and underappreciated. From OpenSSL to curl to the Faker.js incident, we've seen maintainers reach their breaking point after years of providing free labor to billion-dollar corporations. The imbalance between corporate consumption and contribution is a crisis.

When a maintainer burns out, the project doesn't just stop - it rots. It becomes a security risk. And often, companies only realize the "free" software they were using had a price when they have to spend millions to replace it after it fails. A low Activity or Maintenance score on OpenSoyce is often just an early warning signal of maintainer burnout.

We need to shift from a culture of extraction to a culture of stewardship. Companies that rely on open-source packages should be funding those maintainers directly through platforms like GitHub Sponsors or Open Collective. It's not an act of charity; it's an insurance policy for your own technical infrastructure.

OpenSource sustainability is the biggest challenge facing our industry. If we don't find a way to support the humans behind the code, the "Nutrition Label" of our favorite packages will eventually just show empty shelves. Support the repos that support your business. Maintainer sanity is your problem too.`
  }  ,
  {
    slug: "stop-shipping-zombie-code",
    heroImage: "/blog/zombie-code-hero.png",
    title: "STOP SHIPPING ZOMBIE CODE",
    subtitle: "The open-source graveyard is bigger than you think - and your production stack might already be in it.",
    category: "ANALYSIS",
    date: "MAY 19, 2026",
    readTime: "8 min read",
    emoji: "ðª¦",
    tags: ["zombie-dependencies", "npm", "graveyard", "soyce-score", "supply-chain", "maintenance", "technical-debt"],
    content: `You shipped that feature six months ago. It works. Tests pass. Nobody's touched it. Life goes on.

Somewhere inside that feature, buried three layers deep in your node_modules, is a library that hasn't seen a commit since 2022. Its maintainer posted a "stepping away" notice on GitHub that got three thumbs-up reactions and was then promptly forgotten by every developer who ever ran npm install and moved on with their day.

The library isn't broken. That's the problem. Zombie code doesn't announce itself. It just sits there - inert, undead, waiting for someone to discover the unpatched CVE that's been sitting in its issue tracker for fourteen months.

**The Graveyard Is Not a Metaphor**

Open source has a serious abandonment problem, and most codebases are haunted by it.

The numbers are brutal. A 2023 analysis of the top 100,000 npm packages found that roughly 40% hadn't received a meaningful update in over two years. Of those, the majority were still being actively downloaded - not because developers were choosing them, but because they were transitive dependencies: packages pulled in by other packages, inherited without review, compounding quietly underneath the surface of every npm install.

The most famous ghost in the machine is request.js. Over 26,000 GitHub stars. Millions of dependent packages. Deprecated by its own maintainers - they literally posted a notice saying "do not use this for new projects" - and yet it remains one of the most-downloaded packages in the entire npm ecosystem. Millions of production apps still depend on it. Most of those developers have no idea.

Then there's moment.js. Beloved date library. 47,000 stars. Last meaningful commit: eighteen months ago. The maintainers themselves now recommend alternatives. And still, moment shows up in greenfield projects started last quarter, copy-pasted from a Stack Overflow answer from 2019.

[img:/blog/zombie-code-2.png:POPULARITY IS NOT A PULSE - millions of downloads, zero commits since 2021.]

And of course, left-pad. Eleven lines of code. Pulled from npm in 2016. The entire internet broke. Major companies went down. All because of eleven lines of JavaScript that added spaces to the left side of strings.

This is the ecosystem. These are the foundations we build on.

**Why Developers Keep Shipping Zombie Code**

The honest answer is that nobody has time to audit the full dependency tree before every sprint. And the current tooling doesn't make it easy.

The typical developer workflow: you need a library. You search npm or GitHub. You find something with a lot of stars and a decent README. You run the install. You wire it up, ship it, move on. The library is now part of your codebase forever - or until someone gets to it in a "technical debt sprint" that gets deprioritized every single quarter.

The problem is that the signals developers use - star count, download numbers, README quality - are almost entirely lagging indicators. They tell you how popular something was. They tell you nothing about whether it's being actively maintained right now, whether its security posture is sound, or whether the maintainer burned out eighteen months ago and never came back.

GitHub stars are vanity metrics. Download counts include every CI pipeline that hasn't been updated in three years. A polished README is a snapshot of a moment in time that may have no relationship to the current state of the project.

And dependency trees are deep. Your app might directly depend on forty packages. Those forty packages might collectively depend on four hundred more. Auditing every level manually is not a sprint task - it's a full-time job that nobody has.

So zombie code gets shipped. Not because developers are careless. Because the tooling hasn't kept up with the scale of the problem.

**What the Soyce Score Actually Measures**

The OpenSoyce Nutrition Label exists to replace vibes-based dependency selection with something that actually reflects the current state of a project.

Every package gets a Soyce Score from 0 to 10, built from five weighted signals:

Maintenance % - Is the repo being actively maintained? This isn't just "when was the last commit." It looks at issue response time, PR merge velocity, release cadence, and whether the maintainer is actually engaging with the community or has gone dark.

Security % - Does this project have a security policy? Are vulnerabilities being disclosed and patched in a reasonable window? Are there known unpatched CVEs? This is the signal most developers skip entirely.

Community % - Is there an active community around this project, or is it a one-person operation with no bus factor? Community health looks at contributor count, discussion activity, and the presence of governance documentation.

Documentation % - Can a new developer use this thing without reading the source? This sounds soft until you've spent four hours debugging a library because the README describes an API deprecated two versions ago.

Activity % - Live GitHub webhook sync. This is the real-time signal. It shows you where momentum actually is right now, not six months ago.

**The Graveyard**

The OpenSoyce Graveyard is a curated index of open-source projects that have gone dark - ranked by the gap between their continued usage and their current health score.

moment.js: 4.2/10. Still used in millions of codebases. Maintainers recommend migration.
left-pad.js: 1.1/10. A historical artifact. Still circulating.
request.js: 3.5/10. Deprecated by its own authors. Millions still depend on it.

These aren't obscure packages. They're the ones you've definitely shipped.

[img:/blog/zombie-code-3.png:Meet the Ghost Packages - spot the abandoned repos lurking in your production environment before they break.]

The Graveyard isn't a shame list. It's a radar. If a package you depend on shows up there, that's a data point - not a verdict. The Graveyard just makes sure you're making that decision consciously, not by accident.

**What To Do About It**

Before you ship a new dependency, run it through the Scanner. Check the Soyce Score. If the maintenance score is below 60% and the security score is low, flag it in your PR. Make that a team norm.

For existing codebases, the Graveyard and Scanner together give you a starting point for a dependency health review - not the panic-sprint kind, but the steady, sustainable kind that gets done one sprint at a time.

The zombie code in your stack isn't going to fix itself. It's just going to sit there, inert, waiting.

Check the label. Build on what's actually alive.`
  },
  {
    slug: "trending-but-is-it-safe",
    heroImage: "/blog/trending-safe-hero.png",
    title: "TRENDING, BUT IS IT SAFE?",
    subtitle: "GitHub stars have been lying to you. Here's the data you've been missing.",
    category: "HOT TAKE",
    date: "MAY 26, 2026",
    readTime: "9 min read",
    emoji: "ð¥",
    tags: ["security", "supply-chain", "github-stars", "heat-check", "cve", "soyce-score", "risk", "npm"],
    content: `It's a Thursday afternoon. You're deep in a Slack thread about the architecture for a new service. Someone drops a GitHub link. "We should use this," they say. "It's got 12,000 stars and everyone's talking about it."

The conversation moves on. The decision is made. The package goes into your package.json. Two months later, you're in a postmortem trying to figure out how a known vulnerability in a transitive dependency made it into your production environment.

The library had 12,000 stars. It also had a critical security issue reported six months before your team adopted it, with zero response from the maintainer. You couldn't have known - not without digging through issue trackers none of your engineers had time to read.

This is how most open-source dependency decisions get made. And it's why supply chain security has become a Tier-1 engineering risk.

**The Star Problem**

GitHub stars are the social currency of open source. They're also almost entirely useless as a quality signal.

Stars are a lagging indicator - they reflect what the community found impressive at some point in the past, not what's safe to build on today. A library can accumulate 50,000 stars and then have its maintainer disappear, its codebase go stale, and its issue tracker fill with unaddressed security reports - all while the star count stays exactly the same, because nobody unstars something after they stop using it.

Download counts are even more misleading. A deprecated package can have millions of weekly downloads because it's a transitive dependency in another widely-used package. Those downloads have nothing to do with active developer choice. They're an artifact of dependency trees nobody is actively auditing.

The signals developers actually need - active maintenance, security posture, community governance, documentation currency - aren't surfaced anywhere in a GitHub star count. They require manual research that takes hours, and in a typical sprint, nobody has those hours.

So teams fall back on the social proof heuristic: this has a lot of stars, other people are using it, it's probably fine. And usually it is fine. Until it isn't.

**The Supply Chain Is the Attack Surface**

In 2021, a malicious actor compromised ua-parser-js, a widely-used npm package with nearly 8 million weekly downloads. The compromised version shipped cryptomining and credential-stealing malware to every project that ran npm install during the window when the infected package was live. Downstream impact: millions of users across thousands of projects.

In 2022, the node-ipc package - a transitive dependency used by Vue CLI and dozens of other popular tools - was intentionally modified by its maintainer to include destructive code targeting Russian and Belarusian IP addresses. Developers who ran updates had malicious code execute in their environments without their knowledge.

[img:/blog/trending-safe-2.png:NO BLIND TRUST. JUST SCORES - Every dependency is an ingredient. We provide the score before you take the first bite.]

These aren't edge cases. They're part of a documented, accelerating pattern of supply chain attacks that treat popular open-source packages as attack vectors precisely because developers trust them without verification. The more stars a package has, the more attractive it becomes as a target. Popularity is a liability if it isn't paired with active security governance.

**Heat Check: Separating Trending from Trustworthy**

The OpenSoyce Heat Check exists to answer the question GitHub trending can't: is this thing actually healthy, or is it just hot?

Heat Check is a live leaderboard of the most active, most discussed open-source projects across key categories. It surfaces what's moving. But unlike GitHub trending, every project on the Heat Check carries its full Soyce Nutrition Label.

Vite - 9.5/10 Soyce Score. Fastest-growing build tool in the ecosystem. HIGH ADOPT, FRESH signals. This is a library where the hype and the health actually align.

Hono - 9.0/10. Ultrafast edge framework, now the standard for Cloudflare Workers deployments. LOW RISK signal. The momentum is real and the governance is solid.

Bun - 8.5/10. Fast Node replacement with real team adoption. MOMENTUM and FRESH signals, but the score reflects that it's still maturing - which is information you need before you bet a production service on it.

Then there are projects where the story is more complicated. A 7.2 on the Soyce Score with HIGH MOMENTUM means you're looking at something growing fast but with real questions around maintenance discipline or security posture. That's not a rejection - it might be perfect for your use case - but it's a flag that deserves a second look before you add it as a core dependency.

[img:/blog/trending-safe-3.png:The OpenSoyce Heat Check leaderboard - trending projects ranked by Soyce Score, not just star count.]

This is the information gap that Heat Check closes. Trending on GitHub tells you what developers are excited about. The Heat Check tells you what's safe to build on - and distinguishes between the two when they're not the same thing.

**The Hidden Risk in "Everyone's Using It"**

There's a specific failure mode that happens when a technology achieves wide adoption: it becomes too popular to criticize and too entrenched to remove, even when its health signals deteriorate.

moment.js is the clearest example. At its peak, moment was the default date library for JavaScript. So ubiquitous that it became a given. The maintainers themselves eventually concluded the library's architecture was too flawed to fix and recommended migrating to alternatives. They wrote that recommendation into the official README.

None of that stopped moment from being added to new projects for years afterward. The "everyone uses it" heuristic was stronger than the official deprecation notice from the people who built it.

High adoption tells you that something was good enough, at some point, for a lot of people. It tells you nothing about whether it's the right choice today, for your use case, with your security requirements, on your timeline.

The Soyce Score breaks the adoption heuristic by surfacing what's actually happening with a package right now. Not historically. Now. Live webhook sync means that when a project's maintenance score drops, that change shows up in the score. Not in six months when someone writes a blog post about it. Now.

**A Different Way to Make Dependency Decisions**

The goal isn't to make dependency selection slower. It's to make it smarter in the same amount of time.

The workflow change is small: before you add a new dependency, check the Heat Check. If the project you're looking at is on there with a high Soyce Score and clean signals, you've got confidence. If it's on there with mixed signals, you know to dig deeper. If it's not on there at all, run it through the Scanner - paste the GitHub URL, get the full Nutrition Label in seconds.

That's the entire change. One extra step, thirty seconds, a full picture of what you're actually adding to your codebase.

Trending means people are excited. Trustworthy means you can ship on it. The Heat Check tells you which is which.`
  },
  {
    slug: "the-ultimate-forking-shortlist",
    heroImage: "/blog/forking-shortlist-hero.png",
    title: "THE ULTIMATE FORKING SHORTLIST",
    subtitle: "Stop forking blind. Here's how the best builders decide what's worth forking - and what isn't.",
    category: "DEEP DIVE",
    date: "JUNE 2, 2026",
    readTime: "10 min read",
    emoji: "ð´",
    tags: ["forking", "remix", "forkability", "open-source-strategy", "license", "mit", "architecture", "biome", "archon", "astro", "soyce-score", "compare-tool"],
    content: `Every great product built on open source started with a fork decision.

Someone looked at an existing project, decided it was 80% of what they needed, and chose to build the remaining 20% rather than start from scratch. That decision - when it's right - is one of the most powerful moves in software. It compresses months of foundational work into a weekend. It lets you stand on years of community investment without paying the full cost of creating it.

When it's wrong, it's a different story. You've taken on a codebase you don't fully understand, inherited technical debt that wasn't yours, and built a product dependency on something that turns out to be barely maintained. Months later, you're trying to merge upstream changes into a fork that's diverged beyond recognition, or rebuilding from scratch anyway - just with extra steps.

The fork decision deserves more than a vibe check.

**What Makes Something Actually Worth Forking**

Not every popular project is a good fork candidate. The signals that make something worth forking are different from the signals that make it worth using as a dependency.

When you're using a package as a dependency, you want stability, maintenance, and low risk. You're outsourcing ongoing work to someone else.

When you're forking, the calculus shifts. You're taking ownership. You're committing to maintain a divergent codebase, which means the upstream project's long-term maintenance trajectory matters less - but the quality of the foundation matters more. You want solid architecture, clean code, comprehensive documentation, and a permissive license.

The OpenSoyce Forkability signal is built around this distinction. A project can have a low Soyce Score overall - maybe the community is thin and the maintainer is slow - but still have strong Forkability because the codebase is well-structured, the documentation is thorough, and the license is MIT. Conversely, a project with a 9.0 Soyce Score might have low Forkability because it's architecturally monolithic or governed under a license that restricts what you can do with derivatives.

**The Projects Worth Remixing Right Now**

The OpenSoyce Remix section is a curated list of repos that are specifically good fork candidates - projects where there's a clear gap between what the original does and what the ecosystem needs.

Biome â Ship as a team code-quality CLI. Biome is a unified linting and formatting toolchain - one binary, zero config, runs 100x faster than ESLint. The core project is excellent and growing fast. But the enterprise and team workflow layer doesn't exist yet. A fork that wraps Biome in opinionated team configuration, adds policy enforcement, and ships as a managed CLI for engineering orgs has a real market and a clean foundation. Forkability: high. Architecture is modular, docs are strong, license is MIT.

[img:/blog/forking-shortlist-2.png:Stop Blind Forking - the ultimate vetted shortlist for your next major build.]

Archon â Package as an AI workflow builder. Archon is a YAML-defined AI coding workflow framework - think Docker Compose, but for agent pipelines. The concept is right and the timing is early. A visual layer and managed execution environment forked from Archon could be a serious product. Forkability: high.

Astro â Build a visual content CMS. Astro's content collections approach in v5 is reshaping how developers think about content structure. But the visual editing layer is wide open. A headless CMS product forked from Astro, with a built-in visual editor and managed content layer, targets a gap Contentful and Sanity haven't fully closed. Forkability: high.

**The Forking Mistakes That Kill Projects**

Forking something with a license that creates problems. GPL projects require that derivatives also be GPL. AGPL has additional requirements around network use. If you're building a commercial product and you fork something under a restrictive license without reading it carefully, you may be creating legal obligations that constrain your business model. Always check the license field in the Soyce Nutrition Label before you commit.

Forking something with an undocumented architecture. If the codebase is a maze and the only documentation is "read the source," you're going to spend the first three months just figuring out what you've inherited. Documentation % is a real forkability signal.

[img:/blog/forking-shortlist-3.png:OpenSoyce Compare - side-by-side Nutrition Labels for smarter fork decisions.]

Forking something that's already heading toward where you want to go. If you fork a project because it doesn't have Feature X, and Feature X is already on the upstream roadmap, you've just committed to maintaining a divergent codebase. The Activity % signal on the Soyce Label shows you how fast upstream is moving. If it's moving fast toward your destination, contributing upstream is almost always better than forking.

Forking a one-person project without a succession plan. The bus factor problem is real. Community % measures this risk.

**How to Build a Forking Shortlist**

The best approach to forking isn't reactive - finding a gap in your current project and scrambling to fill it. The best approach is proactive: maintaining a running shortlist of high-forkability projects in categories adjacent to what you're building.

The OpenSoyce Compare tool makes this practical. You can pull up two or three candidates side-by-side - not just comparing star counts, but comparing full Nutrition Labels across all five dimensions. The project with 8,000 stars and strong forkability signals often beats the one with 50,000 stars and poor documentation, if your goal is to own and extend the codebase.

**The Fork Decision Is a Product Decision**

Here's the thing about forking that doesn't get said enough: it's not a technical decision, it's a product decision. You're deciding what your team will own, maintain, and be responsible for - in addition to everything you're building on top of it. That decision has long-term implications for velocity, hiring, technical debt, and legal exposure.

The fact that it's often made in fifteen minutes based on a GitHub star count is one of the most expensive habits in software engineering.

The information required to make it well is now available, organized, and searchable. Forkability scores, license checks, architecture documentation ratings, community health assessments - all in the Nutrition Label, in seconds, before you write a single line of fork-specific code.

Stop forking blind. The shortlist you build before you need it is worth more than the emergency decision you make when you do.

Score before you fork. Build on what's actually solid.`
  }
];
