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
    emoji: "🧩",
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
    emoji: "⚔️",
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
    emoji: "📊",
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
    emoji: "🔒",
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
    emoji: "🔥",
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
    emoji: "🪦",
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
    emoji: "🌡️",
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
    emoji: "🍴",
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

Biome -> Ship as a team code-quality CLI. Biome is a unified linting and formatting toolchain - one binary, zero config, runs 100x faster than ESLint. The core project is excellent and growing fast. But the enterprise and team workflow layer doesn't exist yet. A fork that wraps Biome in opinionated team configuration, adds policy enforcement, and ships as a managed CLI for engineering orgs has a real market and a clean foundation. Forkability: high. Architecture is modular, docs are strong, license is MIT.

[img:/blog/forking-shortlist-2.png:Stop Blind Forking - the ultimate vetted shortlist for your next major build.]

Archon -> Package as an AI workflow builder. Archon is a YAML-defined AI coding workflow framework - think Docker Compose, but for agent pipelines. The concept is right and the timing is early. A visual layer and managed execution environment forked from Archon could be a serious product. Forkability: high.

Astro -> Build a visual content CMS. Astro's content collections approach in v5 is reshaping how developers think about content structure. But the visual editing layer is wide open. A headless CMS product forked from Astro, with a built-in visual editor and managed content layer, targets a gap Contentful and Sanity haven't fully closed. Forkability: high.

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
,

  {
    slug: "npm-worm-mini-shai-hulud-tanstack",
    title: "THE NPM WORM THAT HIT TANSTACK AND INTERCOM IN THE SAME WEEK",
    subtitle: "A self-replicating supply chain attack crossed four package registries. Here is what actually happened and how your stack scores against it.",
    category: "HOT TAKE",
    date: "May 12, 2026",
    readTime: "8 min",
    emoji: "🪱",
    heroImage: "/blog/npm-worm-hero.png",
    tags: ["supply-chain", "npm", "security", "malware"],
    metaDescription: "The Mini Shai-Hulud worm compromised TanStack, Intercom, and PyTorch Lightning across npm and PyPI. Here is the full breakdown and what OpenSoyce scores reveal about your risk.",
    author: "The Sauce Report",
    content: `
# The NPM Worm That Hit TanStack and Intercom in the Same Week

Open source supply chain attacks just hit a new level. A self-replicating worm dubbed **Mini Shai-Hulud** compromised 84 npm package artifacts in the TanStack namespace, then crossed into Intercom's official Node.js SDK, and then into PyTorch Lightning on PyPI - all within weeks of each other in spring 2026.

This is not a theoretical attack vector. It is an active, credential-stealing, CI-poisoning campaign that your team is likely already exposed to.

## What Is Mini Shai-Hulud

Socket's Threat Research team named the campaign after the sandworms in Dune - because once it gets into an ecosystem, it spreads. The attack works in three stages.

Stage one: the attacker compromises a developer account - most likely through credential theft or a prior breach. Stage two: they publish a malicious version of a popular package containing a heavily obfuscated JavaScript file called router_init.js. At roughly 2.3 MB, the file is deliberately oversized to evade quick review. Stage three: the malicious package contains worm logic that attempts to find and re-infect adjacent packages in the same npm namespace.

The TanStack packages flagged include @tanstack/react-router - which has over 12 million weekly downloads. Socket's AI scanner flagged the malicious versions within six minutes of publication. That six-minute window is the entire window your team has if you are pulling packages in CI without lockfiles.

## Intercom and PyTorch Lightning Were Also Hit

The same worm pattern showed up in intercom-client@7.0.4, the official Node.js SDK for Intercom's API. That package sees roughly 360,000 weekly downloads and is installed in backend services and CI/CD pipelines globally. Version 7.0.4 added two files not present in 7.0.3: setup.mjs and router_runtime.js - the same worm payload.

Then PyTorch Lightning got hit. The lightning PyPI package - a deep learning framework used to train and ship ML models - had versions 2.6.2 and 2.6.3 flagged as malicious. Version 2.6.1 was clean. The jump from clean to compromised happened on April 30, 2026.

## What the Soyce Score Would Have Told You

This is exactly what OpenSoyce's Graveyard and Scanner features exist to catch. If you run any of these packages through the Scanner today, you will see:

- Sudden version jump with no corresponding commit activity
- Spike in file additions not matching the package changelog
- Maintainer account activity inconsistencies
- Download velocity mismatches between npm stats and GitHub release traffic

A Soyce Score looks at maintenance percentage, security signals, community health, documentation consistency, and activity patterns. A package whose account was compromised will often show a sharp drop in community score alongside an anomalous activity spike - a pattern that does not match organic development.

## The Real Problem: No One Checks Before Install

The default developer workflow is still broken. You need a package. You search npm. You find something with stars and downloads. You run npm install. You never check when the last legitimate maintainer committed. You never check if the publisher account recently changed passwords or had suspicious login activity. You never verify that the new version's file additions match the stated changelog.

This is not a failure of developers. It is a failure of tooling. The package registries themselves do not surface this information at install time.

## What To Do Right Now

Lock your dependencies. If you are using TanStack, Intercom, or PyTorch Lightning in any project, audit which version is pinned in your lockfile right now. Versions 7.0.4 of intercom-client, versions 2.6.2 and 2.6.3 of lightning, and any TanStack packages published between May 5 and May 8, 2026 should be treated as suspect until you can verify the hash.

Run your full dependency tree through OpenSoyce Scanner. Not just direct dependencies - transitive ones too. The TanStack compromise was especially dangerous because it spreads transitively: you might not depend on @tanstack/react-router directly, but something you depend on might.

Treat this as a pattern, not an isolated incident. Mini Shai-Hulud has already crossed five package ecosystems: npm, PyPI, Go Modules, crates.io, and Packagist. Any account with publish rights to multiple registries using reused credentials is a potential entry point.

[img:/blog/npm-worm-inline.png:The Mini Shai-Hulud attack chain - from credential theft to worm replication across npm and PyPI]

## The Transparency Problem

Here is the uncomfortable truth: TanStack, Intercom, and the PyTorch Lightning maintainer did nothing wrong in the traditional sense. Their accounts were compromised. Their code was backdoored without their knowledge. The packages looked legitimate because they came from the official publisher namespace.

This is the core argument for nutrition label transparency in open source. It is not enough to know who published a package. You need to know the health of the account, the consistency of commit patterns, the correspondence between published versions and repository activity. You need a Soyce Score.

The mini Shai-Hulud campaign will not be the last worm to cross registry boundaries. The question is whether your team is running blind or whether you are checking the label before you install.

Check the label at opensoyce.com/scanner.
`
  },
  {
    slug: "ai-is-writing-your-open-source-now-what",
    title: "AI IS WRITING YOUR OPEN SOURCE. NOW WHAT?",
    subtitle: "OpenAI Codex and the coming wave of AI-generated packages raise questions the ecosystem is not ready to answer.",
    category: "HOT TAKE",
    date: "May 12, 2026",
    readTime: "9 min",
    emoji: "🤖",
    heroImage: "/blog/ai-open-source-hero.png",
    tags: ["ai", "openai", "codex", "open-source", "maintainership"],
    metaDescription: "OpenAI Codex can now commit to your GitHub repo autonomously. What does AI-generated open source code mean for trust, maintenance health scores, and the Soyce Score?",
    author: "The Sauce Report",
    content: `
# AI Is Writing Your Open Source. Now What?

In May 2025, OpenAI launched Codex - a cloud-based software engineering agent that can work on many tasks in parallel, commit to your GitHub repo autonomously, and run CI checks to verify its own output. By mid-2026 it is available to ChatGPT Pro, Enterprise, and Business users globally. That means right now, today, thousands of developers are assigning AI agents to open source tasks.

The ecosystem is not ready for what this means.

## What Codex Actually Does

Codex is powered by codex-1, a version of OpenAI's o3 model optimized for software engineering. You assign it tasks through a sidebar in ChatGPT. It runs in an isolated cloud container preloaded with your codebase. It browses files, runs terminal commands, writes code, commits changes, and verifies its work against test suites.

It can handle bug fixes, feature implementation, documentation, test coverage, and refactoring. OpenAI's internal teams use it daily. Early external testers include Cisco, Temporal, Superhuman, and Kodiak AI.

The model can also be guided by AGENTS.md files placed in your repository - essentially a set of instructions the AI reads before acting on your codebase.

## The Open Source Trust Problem

Here is the issue that no one in the Codex launch coverage is talking about: every metric we use to evaluate open source health assumes the work was done by humans.

Commit frequency. Contributor diversity. Response time to issues. Review quality. These are all proxies for human judgment, human availability, and human accountability. When an AI agent is making dozens of commits a day, all of these metrics become meaningless as trust signals.

Imagine a package maintainer who sets up Codex to automatically triage issues, patch bugs, and bump versions. From the outside, this project looks extremely healthy. High commit frequency. Fast issue response. Regular releases. The Soyce Score, if it only looked at activity, would rate it highly.

But who is accountable when something goes wrong? Who reviewed the AI's output? Was the AI's commit actually correct, or was it an optimistic-looking patch that introduced a subtle regression? An AI can write code that passes tests. It cannot yet judge whether the tests are testing the right things.

## The Maintenance Percentage Question

OpenSoyce's Nutrition Label tracks maintenance percentage as one of its five core dimensions. The question was always: is this project actively maintained by humans who understand the codebase? Now we need to ask a harder question: is it maintained by humans at all?

A project maintained entirely by Codex might show 100% maintenance health by traditional metrics. But the underlying accountability structure - the thing that actually protects you when there is a production incident - has changed fundamentally.

This is not an argument against AI-assisted development. OpenAI's Codex is genuinely impressive and will make developers more productive. Cisco, Temporal, and Superhuman are not wrong to use it. The question is what signals you need to evaluate AI-maintained packages differently from human-maintained ones.

[img:/blog/ai-open-source-inline.png:OpenAI Codex dashboard showing parallel task assignment and autonomous commit workflow]

## What Needs to Change in How We Score Trust

OpenSoyce is thinking about this problem. A few signals we think matter:

Human review rate on commits. AI-assisted is fine. AI-autonomous with no human review is a different trust category. The question is not whether an AI touched the code - it is whether a human signed off on it.

AGENTS.md presence and content. A project that has published its AI behavior instructions is being transparent. That transparency should be a positive signal. A project with no AGENTS.md but clearly AI-generated commit messages is being opaque.

Commit message quality and consistency. AI commit messages often have a specific pattern - slightly too thorough, slightly too uniform. This is actually a useful signal if you know what to look for.

Issue-to-commit correspondence. Human maintainers respond to issues that matter to users. AI agents respond to whatever they are assigned. A mismatch between what users are asking in issues and what is being committed is a governance signal worth tracking.

## The Anthropic Glasswing Angle

In March 2026, Anthropic announced Project Glasswing alongside AWS, Apple, Broadcom, Cisco, CrowdStrike, Google, JPMorganChase, the Linux Foundation, Microsoft, NVIDIA, and Palo Alto Networks. The stated goal: to secure the world's most critical software. The Linux Foundation's involvement is notable - this initiative is specifically about open source software security at scale.

Glasswing has not published its methodology yet, but the framing suggests AI-assisted security analysis of the open source ecosystem. If major AI labs and enterprise security companies are about to run automated security analysis across the OSS ecosystem, the question of how AI-generated vs. human-generated code gets evaluated becomes much more urgent.

## The Bottom Line

AI-generated open source is here. Codex is already committing to repos used by millions of developers. The supply chain is about to get a lot harder to evaluate with traditional health metrics alone.

What this means for your team: in addition to checking standard Soyce Scores, start asking whether a project you depend on has AGENTS.md files, what they say, and what percentage of recent commits have human sign-offs in the PR review history.

The nutrition label for open source needs new ingredients. We are working on it.

Check any package's current health at opensoyce.com.
`
  },
  {
    slug: "48000-cves-in-2025-the-math-does-not-work",
    title: "48,000 CVES IN 2025. THE MATH DOES NOT WORK ANYMORE.",
    subtitle: "One hundred and thirty new vulnerabilities every day is not a problem you can patch your way out of. Here is what the numbers mean for your stack.",
    category: "ANALYSIS",
    date: "May 10, 2026",
    readTime: "8 min",
    emoji: "📈",
    heroImage: "/blog/cve-math-hero.png",
    tags: ["cve", "vulnerabilities", "security", "open-source", "risk"],
    metaDescription: "48,185 CVEs were published in 2025 - a 20% increase over 2024. That is 130 new vulnerabilities per day. Here is why the traditional patch-and-pray approach is broken and what to do instead.",
    author: "The Sauce Report",
    content: `
# 48,000 CVEs in 2025. The Math Does Not Work Anymore.

The Open Source Security Foundation published a number recently that should make every engineering team stop and think. In 2025, 48,185 Common Vulnerabilities and Exposures were published. That is a 20.6% increase over 2024's already record-breaking total of 39,962. It works out to roughly 130 new vulnerabilities disclosed every single day.

Here is the uncomfortable math. Most engineering teams do a security audit once a quarter. In that 90-day window, approximately 11,700 new CVEs will have been published. Your team will meaningfully evaluate maybe 20 of them. The gap between disclosed vulnerabilities and your team's actual remediation capacity is not a gap. It is a chasm.

## Why the Volume Keeps Growing

The CVE count is increasing for several compounding reasons. AI-assisted security research is finding vulnerabilities faster - tools like GPT-5.5-Cyber, announced by OpenAI in May 2026, are explicitly designed to scale trusted access for security work. More researchers with better tools means more discoveries.

The open source ecosystem is also getting larger and more complex. The average production application has hundreds of direct dependencies and thousands of transitive ones. Each one of those is a potential vulnerability surface. As the ecosystem grows, so does the attack surface.

Package registry growth compounds this. npm alone has over 3 million packages. PyPI has over 500,000. The review capacity of the security community has not grown proportionally to the size of the ecosystem it is trying to secure.

## The Patch-and-Pray Approach Is Broken

The traditional response to CVEs is to run a vulnerability scanner, get a list of affected packages, prioritize by CVSS score, and patch in order of severity. This worked in 2018 when there were maybe 15,000 CVEs per year. It does not work in 2026.

At 130 CVEs per day, a CVSS-sorted patch queue is a treadmill moving faster than you can run. A critical vulnerability published today will likely be followed by 25 more critical vulnerabilities before you finish patching the first one. Meanwhile, your team is also shipping features, responding to incidents, and maintaining existing infrastructure.

The problem is not that engineering teams are lazy or incompetent. The problem is that the model of reviewing every CVE individually is structurally broken at this volume.

[img:/blog/cve-math-inline.png:CVE publication count 2020-2025 showing exponential growth curve, with 2025 at 48,185 total]

## From Noise to Signal: What Runtime Context Changes

The OpenSSF published a compelling piece in April 2026 arguing for runtime context as a filter. The core insight: not all vulnerabilities in your dependency tree are reachable by your application. A CVE in a package you depend on is only dangerous if your application actually calls the vulnerable code path.

Runtime context - knowing which functions are actually called in production - dramatically shrinks the list of vulnerabilities that matter to your specific deployment. A critical CVE in a package you depend on might score 9.8 on CVSS but be completely unreachable in your application because you only use three functions from that package and none of them touch the vulnerable code.

This is still an emerging area of tooling. But it points toward a more sustainable model: instead of patching everything at maximum urgency, you understand your actual attack surface and prioritize accordingly.

## The OpenSoyce Approach: Health Before Patching

Here is a perspective that often gets missed in vulnerability discussions: the packages that are most likely to have unpatched CVEs are the ones with the worst maintenance health scores.

An actively maintained package with strong maintainer engagement, regular releases, and high community score will typically patch a critical CVE within days. An abandoned or low-maintenance package might take months or never. When you are trying to prioritize remediation across a dependency tree with hundreds of packages, maintenance health is a leading indicator of CVE exposure risk.

OpenSoyce's Soyce Score tracks maintenance percentage as a first-class signal. A package with a maintenance score below 40% is not just potentially outdated - it is a package where the maintainers may not be responding to CVE reports at all. That is a different risk posture than a high-activity package with a temporary vulnerability.

The Graveyard feature shows you which of your dependencies have been effectively abandoned. Packages in the Graveyard are not just cosmetically unmaintained - they are packages where the security response loop is broken. A CVE can sit open indefinitely with no remediation available except forking or migrating.

## What Your Team Should Actually Do

Stop treating every CVE as equivalent. A critical CVE in an actively maintained package that has already published a patch is a routine update. A medium CVE in an abandoned package with no patch timeline is a strategic risk.

Add maintenance health to your vulnerability triage process. Before asking "how severe is this CVE?", ask "is this package's maintainer actively responding to security issues?". The Soyce Score answers that question in seconds.

Build a minimum health threshold into your dependency approval process. If a package has a Soyce Score below a threshold your team sets, require explicit sign-off before adding it as a dependency - not because it definitely has a CVE today, but because it is a package where you have less confidence that future CVEs will be patched.

Audit your transitive dependency tree, not just your direct dependencies. The TanStack and Intercom compromises in May 2026 spread transitively. The 48,000 CVE problem is not just about your direct installs.

130 new vulnerabilities per day is a systems problem, not an attention problem. The teams that stay ahead of it are the ones who have built health evaluation into the dependency lifecycle from the start.

Check your stack at opensoyce.com/scanner.
`
  },
  {
    slug: "the-maintainer-who-got-locked-out",
    title: "THE MAINTAINER WHO GOT LOCKED OUT (AND WHY IT MATTERS TO YOUR TEAM)",
    subtitle: "The fsnotify dispute is not drama. It is a preview of the governance crisis coming for every open source project that never wrote down its own rules.",
    category: "ANALYSIS",
    date: "May 8, 2026",
    readTime: "7 min",
    emoji: "🔐",
    heroImage: "/blog/maintainer-lockout-hero.png",
    tags: ["maintainership", "governance", "supply-chain", "open-source", "risk"],
    metaDescription: "When fsnotify contributors were removed from the GitHub org in a maintainer dispute, the downstream concern was not just drama - it was a preview of a supply chain risk. Here is what it means for your team.",
    author: "The Sauce Report",
    content: `
# The Maintainer Who Got Locked Out (And Why It Matters to Your Team)

In early May 2026, a dispute over maintainer access in fsnotify - a widely used Go library for cross-platform filesystem notifications - briefly raised supply chain concerns across the Go ecosystem.

Contributors were removed from the project's GitHub organization. Recent releases came under scrutiny. Kubernetes users started discussing forks and alternatives. The question spreading through Go community forums was uncomfortable: when a popular project has unclear maintainer roles and release access, how do you tell the difference between routine open source conflict and the early signs of a takeover?

## What Actually Happened with fsnotify

So far, there is no evidence that any fsnotify release was compromised. The concern is messier than that - and more important.

fsnotify has 10,700 GitHub stars and 969 forks. It provides cross-platform filesystem notifications for Windows, Linux, macOS, BSD, and illumos. It is a dependency for many tools in the Kubernetes ecosystem and the broader Go infrastructure. The kind of package that ends up in production environments without anyone actively thinking about it.

The dispute involved rushed merges, changes to sponsorship arrangements, and decisions about who had access to what parts of the project infrastructure. Contributors were removed. Some felt the process was opaque. The community did not have a clear source of truth for who was authorized to make decisions about the project.

No malicious code. No compromised releases. Just a governance crisis that briefly made it impossible for downstream users to have confidence in the package.

## Why This Is a Supply Chain Risk Even Without Compromise

The security framing usually focuses on compromised accounts and malicious code. But the fsnotify situation points to a different category of risk: governance opacity.

If you cannot tell who legitimately controls a package, you cannot evaluate the risk of depending on it. A project where it is unclear who has publish rights is a project where a future compromise might be harder to detect. Was this release authorized? By whom? Under what review process? If the project has never answered those questions publicly, you are trusting a black box.

This is exactly the kind of signal that OpenSoyce's community health score tries to surface. Unclear contributor roles, opaque release processes, and sponsorship structures that create conflicts of interest are all governance signals. They do not mean a package is dangerous today. They mean the risk of a future problem is higher than a project with clear, documented governance.

[img:/blog/maintainer-lockout-inline.png:fsnotify GitHub repository showing stars, forks, and contributor activity patterns]

## The Governance Gap Is Industry-Wide

fsnotify is not exceptional in having governance opacity. Most open source projects of this scale never wrote down their governance model. Who can approve a PR? Who can publish a release? What happens if the primary maintainer becomes unavailable? What is the escalation path if a contributor disagrees with a decision?

For large, well-funded projects - Linux kernel, major Apache projects, CNCF graduated projects - there are answers to these questions. Written governance documents, release management processes, multi-stakeholder review.

For the vast middle tier of open source - packages with 5,000 to 50,000 stars, meaningful download counts, real production usage - governance is usually implicit. It is whatever the maintainer decides. That is fine when the maintainer is present, aligned, and acting in good faith. It becomes a risk when any of those conditions change.

## What Downstream Users Actually Need

The fsnotify situation highlights what downstream users actually need to evaluate dependency health - and it is not just code quality or test coverage.

Who has publish rights to this package right now? This is not always public information. npm and PyPI log publisher accounts but do not always make historical access changes easy to audit.

Has the maintainer structure changed recently? A sudden change in who has repository access or publish rights is a signal worth investigating. It might be routine - a maintainer transitioning the project - or it might be an early indicator of something more serious.

Is there a governance document? Projects with written governance documents have explicitly thought through their decision-making process. That is a trust signal worth surfacing.

What is the fork activity pattern? When a project has an internal dispute, fork activity spikes. This is visible in GitHub's network graph. A fork spike without a corresponding explanation is worth investigating.

OpenSoyce tracks community health score as one of five dimensions in the Soyce Score. Contributor diversity, review process transparency, maintainer responsiveness - these are the signals that predict governance risk before it becomes a security incident.

## The Kubernetes Lesson

The Kubernetes community's response to the fsnotify dispute was notable: they immediately started discussing forks and alternatives. This is actually good dependency hygiene. For a critical piece of infrastructure, you want to know in advance what your fallback is if a dependency becomes unavailable or untrusted.

Most teams only have this conversation after a problem has already occurred. The time to evaluate your dependency on any single-maintainer project is before the maintainer dispute, not during one.

Check any package's community health score at opensoyce.com.
`
  },
  {
    slug: "pypi-had-two-high-severity-holes-heres-what-they-were",
    title: "PYPI HAD TWO HIGH-SEVERITY HOLES. HERE IS WHAT THEY WERE.",
    subtitle: "A Trail of Bits audit found access control bugs that could have let org members invite new owners. The fix is in. But the audit reveals a deeper problem with registry trust.",
    category: "DEEP DIVE",
    date: "May 6, 2026",
    readTime: "7 min",
    emoji: "🔑",
    heroImage: "/blog/pypi-audit-hero.png",
    tags: ["pypi", "security-audit", "access-control", "supply-chain", "python"],
    metaDescription: "PyPI's second external security audit by Trail of Bits found two high-severity access control bugs. Here is the technical breakdown and what it means for Python package trust.",
    author: "The Sauce Report",
    content: `
# PyPI Had Two High-Severity Holes. Here Is What They Were.

PyPI has patched two high-severity vulnerabilities found during its second external security audit. The audit was performed by Trail of Bits, funded by the Sovereign Tech Agency, and reviewed Warehouse - the open source Python application that powers PyPI.

The assessment produced 14 findings in total: two High, one Medium, one Low, and ten Informational. The two High-severity findings are the ones worth understanding in detail.

## Finding One: Organization Members Could Invite New Owners

The first high-severity finding is the scarier of the two. Organization members had a code path that allowed them to invite new organization owners. This is a privilege escalation vulnerability. An organization member - someone with legitimate but limited access to a PyPI organization - could potentially invite additional accounts to the owner tier.

In an attack scenario: a compromised or malicious organization member account could use this path to install a fully-trusted account into the organization. From there, the attacker would have publish rights across all packages owned by the organization.

This is the kind of vulnerability that matters most in supply chain attacks. The attack pattern for mini Shai-Hulud and similar campaigns is to compromise an account with limited access, then escalate privileges to gain publish rights. This finding is exactly that escalation path.

PyPI has fixed this. But the existence of this code path in a registry that hosts over 500,000 packages and serves billions of downloads per month is worth sitting with.

## Finding Two: Project Transfers Left Stale Upload Access

The second high-severity finding involves what happens when a Python package changes ownership. When a project is transferred from one organization to another, the old organization's teams could retain upload access to the package.

This is a ghost access problem. If you transferred a package last year, the previous owner might still be able to publish new versions today. This is not a hypothetical concern. The Heartbleed and XZ Utils incidents both involved confusion about who legitimately had access to critical projects.

In a supply chain attack context, ghost access is an attacker's best friend. It is access that does not appear in the current owner's access control list, that does not trigger obvious security alerts, and that might persist indefinitely if no one is auditing stale permissions.

[img:/blog/pypi-audit-inline.png:Trail of Bits audit timeline showing PyPI security assessment findings and remediation status]

## The Audit Also Found OIDC Replay Issues and IDOR in Token Deletion

Beyond the two high-severity findings, the audit identified trusted publishing replay edge cases in OIDC-based publishing, gaps in audit logging, and an insecure direct object reference in API token deletion.

The OIDC findings are particularly relevant for teams using GitHub Actions to publish to PyPI via trusted publishing. Replay edge cases in authentication flows can enable token reuse in ways that bypass expected access controls. The details have not been fully published, but the existence of the finding suggests that trusted publishing - which many teams use precisely because it is supposed to be more secure than static tokens - has more surface area than commonly understood.

## What This Means for Registry Trust

Here is the uncomfortable meta-point: this is PyPI's second external security audit. The first one found similar classes of issues. The fact that access control bugs of this severity existed in a system that handled billions of package downloads is not a failure unique to PyPI - it is a reflection of how difficult it is to build and maintain a secure package registry at scale.

npm, crates.io, RubyGems - these registries all have access control complexity that has never been fully audited by independent security researchers. The Sovereign Tech Agency's funding of the PyPI audit is a model worth expanding. But it also means that the security posture of registries you publish to and install from is, at least partially, a known unknown.

## What Your Team Should Take From This

Use trusted publishing where possible, but understand its limitations. OIDC-based publishing reduces the surface area for credential theft but does not eliminate trust assumptions. Understand the OIDC configuration for any packages you publish.

Audit your PyPI organization's current member list and access levels. If you have transferred packages in the last few years, verify that the previous organization's access has been fully revoked. Ghost access is not always visible without active auditing.

Pay attention to publisher account stability when evaluating packages you depend on. A package whose publisher organization has had recent member changes is worth extra scrutiny - not because it is definitely compromised, but because the access control picture is noisier.

OpenSoyce tracks security score as one of five dimensions in the Soyce Score. Security score includes signals about publisher account stability, version history consistency, and anomalous publish patterns. The PyPI findings are exactly the class of upstream risk that this score is designed to surface.

Check any Python package's current Soyce Score at opensoyce.com.
`
  }
];
