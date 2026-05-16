import React from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowRight, AlertTriangle } from 'lucide-react';
import { trackEvent } from '../utils/analytics';

export default function Methodology() {
  return (
    <div className="bg-soy-label min-h-screen">
      {/* HERO Section */}
      <section className="py-24 px-4 bg-white border-b-4 border-black">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-block bg-soy-red text-white px-4 py-2 text-xs font-black uppercase tracking-[0.4em] mb-8"
          >
            THE DOCTRINE
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-6xl md:text-8xl font-black uppercase italic tracking-tighter mb-8 leading-[0.9]"
          >
            HOW OPENSOYCE SCORES PROJECTS
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-2xl md:text-3xl font-medium opacity-80 leading-snug italic"
          >
            "OpenSoyce is not a security audit. It is a signal layer for builders."
          </motion.p>
        </div>
      </section>

      {/* SCORE RECALIBRATION v2 CALLOUT */}
      <section className="px-4 -mt-4 mb-4">
        <div className="max-w-4xl mx-auto bg-soy-bottle text-soy-label border-4 border-soy-bottle p-6 md:p-8 shadow-[6px_6px_0px_#E63322]">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
            <div className="bg-soy-red text-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] shrink-0">
              v2 SCORING · MAY 2026
            </div>
            <p className="text-sm md:text-base font-medium leading-snug">
              Score distributions were recalibrated to spread out the 7–9 cluster and to actually use the 0–2 floor. Cosmetic metadata flags (license presence, GitHub description, etc.) award fewer points; real content signals (README depth, advisory cleanliness, SECURITY.md, star count past 100k) carry more. <strong className="text-white">Existing embedded badges will render different numbers</strong> on next cache refresh — this is intentional, not a regression.
            </p>
          </div>
        </div>
      </section>

      {/* THE SOYCE SCORE Breakdown */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
            <div>
              <h2 className="text-4xl font-black uppercase italic tracking-tighter mb-8">THE SOYCE SCORE</h2>
              <p className="text-xl font-medium opacity-70 mb-12 leading-relaxed">
                The Soyce Score is a weighted composite computed from thirteen GitHub repository signals: last commit date, star count, contributor count, fork count, license, open issue count, description / topics / homepage presence, 30-day commit volume, README content, SECURITY.md presence, release recency, recent-issue triage rate, and published security advisories (CVEs the maintainers disclosed in this repo's own code).
              </p>

              <div className="space-y-6">
                {[
                  { label: 'MAINTENANCE', weight: 30, desc: 'Three sub-signals so finished/stable libraries are not punished for being done. Commit recency: bucketed days since the latest commit (up to 1.5). Release recency: latest tagged release within 1 year scores full credit, within 2 years scores half (up to 1.0). Issue triage: percentage of issues opened in the last 90 days that received a comment or were closed (up to 0.5). PRs are filtered out; quiet repos with no recent issues score 0 on triage.' },
                  { label: 'COMMUNITY', weight: 25, desc: 'Log-scaled star count, contributor count, fork milestone (1k+).' },
                  { label: 'SECURITY', weight: 20, desc: 'Published security advisories (real CVEs the maintainers disclosed in this repo, weighted by severity and recency; withdrawn advisories ignored), license presence + permissiveness (MIT / Apache / BSD), low issues-per-star ratio on actively-maintained projects, and SECURITY.md policy. Release recency moved to MAINTENANCE — releases measure "still shipping?", not "secure?". Does NOT score vulnerabilities in this repo\'s dependencies.' },
                  { label: 'DOCUMENTATION', weight: 15, desc: 'Description, ≥3 topics, homepage URL — and README content: length, heading count, code examples, install instructions.' },
                  { label: 'ACTIVITY', weight: 10, desc: 'Number of commits in the last 30 days (sampled from the most recent 30 commits).' },
                ].map(item => (
                  <div key={item.label} className="bg-white border-4 border-black p-6 shadow-[6px_6px_0px_#000]">
                    <div className="flex justify-between items-center mb-2">
                       <span className="text-lg font-black uppercase italic">{item.label}</span>
                       <span className="text-soy-red font-black text-2xl">{item.weight}%</span>
                    </div>
                    <p className="text-xs font-bold uppercase tracking-widest opacity-60">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-black text-white p-12 shadow-[12px_12px_0px_#E63322]">
              <h3 className="text-3xl font-black uppercase italic tracking-tighter mb-8 text-soy-red">SCORE RANGES</h3>
              <div className="space-y-8">
                 <ScoreRange label="8.5+" status="USE READY" desc="Production grade. Real CVE hygiene, active maintenance, strong docs." color="text-green-500" />
                 <ScoreRange label="7.0 – 8.4" status="FORKABLE" desc="Mature core infrastructure. Minor gaps in one or two pillars." color="text-blue-500" />
                 <ScoreRange label="6.0 – 6.9" status="STABLE" desc="Healthy maintained library — may be in stable mode (releases + triage) without daily commits." color="text-emerald-500" />
                 <ScoreRange label="4.0 – 5.9" status="WATCHLIST" desc="Works today, but signals are mixed. Verify the per-pillar breakdown before adopting." color="text-yellow-500" />
                 <ScoreRange label="2.5 – 3.9" status="RISKY" desc="Real concerns in multiple pillars. Maintenance debt, licensing gap, or unaddressed advisories." color="text-orange-500" />
                 <ScoreRange label="BELOW 2.5" status="STALE" desc="Effectively abandoned. No recent commits, no releases, no triage." color="text-soy-red" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* GRAVEYARD RULES */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-soy-red text-white p-12 border-4 border-black shadow-[10px_10px_0px_#000]">
            <h2 className="text-4xl font-black uppercase italic tracking-tighter mb-8">GRAVEYARD RULES</h2>
            <p className="text-xl font-medium mb-8 leading-relaxed">
              A project doesn't die when people stop starring it. It dies when the pulse stops.
            </p>
            <div className="space-y-4 border-l-4 border-white/30 pl-8">
              <p className="text-lg font-black uppercase italic">A PROJECT ENTERS THE GRAVEYARD WHEN:</p>
              <ul className="space-y-2 text-sm font-bold uppercase tracking-widest opacity-80">
                <li>• LAST COMMIT &gt; 18 MONTHS AGO</li>
                <li>• ISSUES HAVE GONE UNRESPONSIVE FOR &gt; 1 QUARTER</li>
                <li>• NO RECENT TAGGED RELEASES OR NPM PUBLISHES</li>
                <li>• EXPLICIT DEPRECATION BY MAINTAINERS</li>
              </ul>
              <p className="mt-8 text-xs font-bold uppercase tracking-widest opacity-60">
                NOTE: GRAVEYARD ≠ WORTHLESS. SOME GRAVEYARD PROJECTS HAVE EXCELLENT FORKABLE INFRASTRUCTURE.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* DISCLAIMERS */}
      <section className="py-20 px-4 bg-black text-white">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row gap-12 items-center">
            <div className="md:w-1/3">
              <AlertTriangle size={80} className="text-soy-red mb-6" />
              <h2 className="text-4xl font-black uppercase italic tracking-tighter mb-4">WHAT WE DON'T CLAIM</h2>
            </div>
            <div className="md:w-2/3 grid grid-cols-1 md:grid-cols-2 gap-8 text-[10px] font-black uppercase tracking-[0.2em] opacity-60">
              <div className="border-l-2 border-soy-red pl-4 py-2">
                OPENSOYCE SCORES ARE NOT SECURITY CERTIFICATIONS.
              </div>
              <div className="border-l-2 border-soy-red pl-4 py-2">
                A HIGH SCORE DOES NOT GUARANTEE PRODUCTION SAFETY.
              </div>
              <div className="border-l-2 border-soy-red pl-4 py-2">
                A LOW SCORE DOES NOT MEAN THE PROJECT IS BROKEN.
              </div>
              <div className="border-l-2 border-soy-red pl-4 py-2">
                ALWAYS VERIFY LICENSES AND SECURITY ADVISORIES INDEPENDENTLY.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* THE SIGNAL VOCABULARY */}
      <section className="py-24 px-4 bg-soy-label border-y-4 border-black">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-5xl md:text-7xl font-black uppercase italic tracking-tighter mb-4">THE SIGNAL VOCABULARY</h2>
            <p className="text-xl font-bold uppercase tracking-widest text-soy-red italic">Every label has a definition. These are frozen.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            <VocabCard title="USE READY" score="≥ 8.5" desc="Production-grade signals. Real CVE hygiene, active maintenance, strong docs. Ready for serious adoption evaluation." />
            <VocabCard title="FORKABLE" score="7.0–8.4" desc="Mature core infrastructure. Best for teams who want to build on top of it." />
            <VocabCard title="STABLE" score="6.0–6.9" desc="Healthy maintained library — may be in stable mode (releases + triage) without daily commits. Don't confuse with risky." />
            <VocabCard title="WATCHLIST" score="4.0–5.9" desc="Works today, but signals are mixed. Check the per-pillar breakdown before adopting." />
            <VocabCard title="RISKY" score="2.5–3.9" desc="Real concerns in multiple pillars. Maintenance debt, licensing gap, or unaddressed advisories." />
            <VocabCard title="STALE" score="< 2.5" desc="Effectively abandoned. No recent commits, no releases, no triage." />
            <VocabCard title="GRAVEYARD" score="Deprecated" desc="Shaped the ecosystem. Now a museum piece. Some have forkable infrastructure." />
          </div>

          <p className="mt-12 text-xs font-bold uppercase tracking-widest text-soy-bottle/60 text-center max-w-3xl mx-auto">
            Editorial tiers (e.g. HIGH MOMENTUM for hand-curated rising stars) are not shown in the public score card. A real momentum heuristic is on the roadmap — until then, the algorithm only earns the bands above.
          </p>
        </div>
      </section>

      {/* KNOWN LIMITATIONS — AI ECOSYSTEM CAVEATS */}
      <section className="py-24 px-4 bg-white border-y-4 border-black">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-block bg-black text-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.4em] mb-6">
              OPEN SCIENTIFIC LIMITATIONS
            </div>
            <h2 className="text-5xl md:text-7xl font-black uppercase italic tracking-tighter mb-4">KNOWN LIMITATIONS</h2>
            <p className="text-xl font-bold uppercase tracking-widest text-soy-red italic">What this scanner does not see — named out loud.</p>
            <p className="mt-6 text-sm font-medium opacity-70 max-w-3xl mx-auto leading-relaxed italic">
              Honest disclosure, not marketing. The AI tooling ecosystem moves faster than any static scoring model, and several failure modes are specific to it. Below is what we know we don't yet cover, and where a mitigation exists, the commit that ships it.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <LimitationCard
              tag="VELOCITY"
              title="AI ecosystem velocity"
              body="Projects like LangChain and HuggingFace move weekly. Soyce scores reflect signals as of the most recent scan; a single bad release week can shift a score and a single good triage day can shift it back. Maintainers shouldn't read short-term score drift as a signal about the project's long-term health."
              status="OPEN"
            />
            <LimitationCard
              tag="BUS FACTOR"
              title="Single-maintainer projects with massive adoption"
              body="@huggingface/transformers.js has 18M monthly downloads and one primary maintainer. The current scoring model doesn't separately penalize bus-factor risk on these projects beyond the generic contributor-count signal. We see this as a real gap and a research direction for v0.x."
              status="RESEARCH DIRECTION"
            />
            <LimitationCard
              tag="NAMESPACE"
              title="Federation of @scope/pkg namespaces"
              body="@huggingface/* on npm is not the same as huggingface/* on GitHub. The resolver maps via the npm `repository` field but doesn't verify that the GitHub org name matches the npm scope. We cross-check package.json#name (P0-AI-2) but namespace-level verification is not yet enforced."
              status="PARTIAL · 8c0d6ab"
            />
            <LimitationCard
              tag="TYPO-SQUAT"
              title="Typo-squat detection on AI namespaces"
              body="We mitigate borrowed-trust attacks (an attacker pointing a typo-squat's `repository` field at a healthy repo) via the package.json cross-check, but we do NOT detect homoglyph typo-squats (e.g. `l&#1072;ngchain` with Cyrillic &#1072;). That's a known research direction."
              status="PARTIAL · 8c0d6ab"
            />
            <LimitationCard
              tag="CROSS-ECOSYSTEM"
              title="Cross-ecosystem bridge attacks"
              body="The npm `langchain` package transitively installs a Python `langchain` via Python bindings; our scanner sees only the npm side. PyPI dependency confusion against the Python side is invisible to a single-ecosystem scan today."
              status="OPEN"
            />
            <LimitationCard
              tag="WEIGHTS"
              title="huggingface_hub and model weights"
              body="OpenSoyce scores the maintainer + code health of repos. It does NOT analyze model weight pulls (e.g. pickle RCE risk in `from_pretrained` arbitrary downloads). That's a different threat class and is out of scope for v0."
              status="OUT OF SCOPE · v0"
            />
            <LimitationCard
              tag="PYPI"
              title="PyPI coverage edge cases"
              body="For poetry.lock without a companion pyproject.toml, we cannot reliably tell direct vs transitive dependencies. The Risk Profile surfaces this honestly via the `directUnknown` caveat in the Tree Complexity dimension."
              status="SURFACED · 2c07e54"
            />
            <LimitationCard
              tag="VERDICT BAND"
              title="Verdict bands cap on hidden vulns"
              body="If a repo's composite score is high (≥7.0) but the repo has 3+ open HIGH/CRITICAL advisories on its own code, the verdict band is capped at WATCHLIST. This is intentional honesty (P0-AI-1) but it means a repo with strong maintenance + many self-disclosed CVEs may score lower in the band display than its raw composite would suggest."
              status="BY DESIGN · 8c0d6ab"
            />
            <LimitationCard
              tag="MAINTAINER CONCENTRATION"
              title="Single-maintainer band-cap (AI signals v0.1)"
              body="When >85% of recent commits come from one contributor AND there are ≤2 non-bot contributors AND the last commit was >30 days ago, the verdict band caps from USE READY to FORKABLE. Composite score is unchanged — only the band label moves. Vendor-official SDKs (curated allowlist in src/data/vendorSdks.ts) are suppressed from this cap; a small in-house team maintaining the official OpenAI SDK is a different bus-factor story than a hobby project with one author. Bot detection is heuristic — we filter [bot] suffix, common logins (dependabot, renovate, github-actions, snyk-bot), and the GitHub type:Bot flag; some bot accounts will pass through as humans. The 85% / 2-contributor / 30-day thresholds are conservative — we prefer false-negatives (missing the cap) over false-positives."
              status="BY DESIGN · v0.1"
            />
            <LimitationCard
              tag="INSTALL SCRIPTS"
              title="Postinstall script detection (informational only)"
              body="npm preinstall / install / postinstall hooks run arbitrary code on `npm install` — the attack vector behind event-stream, ua-parser-js, colors.js, and faker.js. Inventory + vuln rows surface a ⚠ INSTALL SCRIPT chip when the lockfile flags `hasInstallScript: true` (npm v1/v2/v3) or `requiresBuild: true` (pnpm). A curated allowlist (src/data/trustedInstallScripts.js) suppresses the chip for ~30 packages where install scripts are expected and legitimate (TypeScript, esbuild, sharp, husky, electron, puppeteer, …). The chip is informational only — it does NOT contribute to the Risk Profile, does NOT band-cap the verdict, and does NOT change the composite score. Coverage gaps: yarn-v1 lockfiles don't expose the flag, and Python lockfiles (uv.lock, poetry.lock) have no equivalent — both are documented in docs/ci-reporter.md and reported as hasInstallScript: false."
              status="BY DESIGN · v0"
            />
          </div>

          <p className="mt-12 text-xs font-bold uppercase tracking-widest text-soy-bottle/60 text-center max-w-3xl mx-auto">
            If you find a failure mode that isn't listed here, that's a bug in our disclosure — please open an issue.
          </p>
        </div>
      </section>

      {/* BADGE PREVIEW */}
      <section className="py-24 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-5xl md:text-7xl font-black uppercase italic tracking-tighter mb-4">EMBEDDABLE BADGES</h2>
            <p className="text-xl font-bold uppercase tracking-widest text-soy-red italic">Any analyzed project gets a live Soyce Score badge. Color shifts with the number.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-20 justify-items-center">
            <BadgePreview color="#22c55e" score="9.5" caption="SCORE ≥ 8" />
            <BadgePreview color="#f59e0b" score="6.8" caption="SCORE ≥ 6" />
            <BadgePreview color="#E63322" score="3.2" caption="SCORE < 6" />
          </div>

          <div className="max-w-4xl mx-auto text-center">
            <Link
              to="/lookup"
              onClick={() => trackEvent('badge_lookup_click', { source: 'badge_preview', page: '/methodology' })}
              className="inline-flex items-center gap-4 bg-soy-red text-white px-12 py-6 text-xl font-black uppercase italic tracking-widest hover:bg-black transition-all shadow-[10px_10px_0px_#000]"
            >
              ANALYZE A REPO TO GET A BADGE →
            </Link>
          </div>
        </div>
      </section>

      {/* BOTTOM CTA */}
      <section className="py-24 px-4 text-center">
        <Link 
          to="/leaderboards" 
          onClick={() => trackEvent('hero_explore_click', { source: 'methodology_footer' })}
          className="inline-flex items-center gap-4 bg-black text-white px-12 py-6 text-2xl font-black uppercase italic tracking-widest hover:bg-soy-red transition-all shadow-[10px_10px_0px_#E63322]"
        >
          EXPLORE THE BOARD <ArrowRight size={32} />
        </Link>
      </section>

      {/* FOOTER */}
      <footer className="py-12 border-t-4 border-black text-center text-[10px] font-black uppercase tracking-[0.5em] opacity-40">
        © 2026 OPENSOYCE LABS. ALL SAUCE RESERVED.
      </footer>
    </div>
  );
}

function ScoreRange({ label, status, desc, color }: { label: string, status: string, desc: string, color: string }) {
  return (
    <div className="flex flex-col md:flex-row md:items-start gap-4">
      <div className={`text-2xl font-black italic min-w-[120px] ${color}`}>{label}</div>
      <div>
        <div className="text-sm font-black uppercase tracking-widest mb-1">{status}</div>
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function VocabCard({ title, score, desc }: { title: string, score: string, desc: string }) {
  return (
    <div className="bg-white border-4 border-black p-8 shadow-[8px_8px_0px_#000]">
      <div className="mb-4">
        <h3 className="text-2xl font-black uppercase italic tracking-tight mb-1">{title}</h3>
        <div className="text-soy-red font-black text-xs uppercase tracking-widest">{score}</div>
      </div>
      <p className="text-sm font-medium opacity-80 leading-relaxed italic">"{desc}"</p>
    </div>
  );
}

function LimitationCard({ tag, title, body, status }: { tag: string, title: string, body: string, status: string }) {
  return (
    <div className="bg-soy-label border-4 border-black p-8 shadow-[8px_8px_0px_#000] flex flex-col">
      <div className="flex items-center justify-between gap-2 mb-4">
        <span className="inline-block bg-black text-white px-2 py-1 text-[10px] font-black uppercase tracking-[0.3em]">{tag}</span>
        <span className="inline-block bg-soy-red text-white px-2 py-1 text-[10px] font-black uppercase tracking-[0.2em]">{status}</span>
      </div>
      <h3 className="text-xl font-black uppercase italic tracking-tight mb-3 leading-tight">{title}</h3>
      <p className="text-sm font-medium opacity-80 leading-relaxed">{body}</p>
    </div>
  );
}

function BadgePreview({ color, score, caption }: { color: string, score: string, caption: string }) {
  return (
    <div className="space-y-4 text-center">
      <svg xmlns="http://www.w3.org/2000/svg" width="160" height="22" className="mx-auto">
        <rect width="160" height="22" rx="3" fill="#1a1a1a" />
        <path fill={color} d="M110 0h50v22H110z" />
        <rect width="160" height="22" rx="3" fill="none" stroke="#ffffff" strokeOpacity="0.1" />
        <g fill="#fff" textAnchor="middle" fontFamily="ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,liberation mono,courier new,monospace" fontSize="9" fontWeight="bold">
          <text x="55" y="15" fill="#ffffff" letterSpacing="0.1em">SOYCE SCORE</text>
          <text x="135" y="15" fill="#ffffff" fontSize="10">{score}</text>
        </g>
        <line x1="110" y1="0" x2="110" y2="22" stroke="#ffffff" strokeOpacity="0.2" />
      </svg>
      <div className="text-[10px] font-black uppercase tracking-widest opacity-60">{caption}</div>
    </div>
  );
}
