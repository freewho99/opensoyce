# OpenSoyce Swarm Report — FULL-12

**Generated:** 2026-05-22T04:37:02.271Z
**Success Rate:** 100% (12/12)

## Summary Table

| Persona | Archetype | Pass | Repos Checked | Duration |
|---------|-----------|------|---------------|----------|
| Maya Chen | oss-maintainer | ✅ | facebook/react→8.7, vercel/next.js→7.6 | 13s |
| Dan Abramov | github-power-user | ✅ | sindresorhus/got→7.6, axios/axios→8.8 | 13s |
| Sarah Mitchell | cto | ✅ | expressjs/express→9.3, lodash/lodash→8.3 | 10s |
| Carlos Ruiz | indie-dev | ✅ | vitejs/vite→8.2, tailwindlabs/tailwindcss→8.7 | 12s |
| Priya Nair | student | ✅ | torvalds/linux→6.2, microsoft/vscode→7.9 | 14s |
| James Hollis | security-engineer | ✅ | nodejs/node→9.0, openssl/openssl→7.1 | 11s |
| Anna Petrov | devrel | ✅ | supabase/supabase→9.7, prettier/prettier→9.1 | 13s |
| Tom Bennett | hiring-manager | ✅ | tiangolo/fastapi→9.8, remix-run/remix→8.8 | 11s |
| Kenji Watanabe | github-power-user | ✅ | kubernetes/kubernetes→9.3, hashicorp/terraform→8.6 | 12s |
| Leila Hassan | devrel | ✅ | facebook/react→8.7, angular/angular→8.7 | 12s |
| Felix Braun | student | ✅ | jquery/jquery→8.8, chartjs/Chart.js→6.7 | 13s |
| Grace Okafor | cto | ✅ | prisma/prisma→8.8, trpc/trpc→8.5 | 14s |

---


## Maya Chen (oss-maintainer)

**Goal:** Check her own repo health score before adding a README badge
**Result:** ✅ PASS — 13s

### Repos Checked
- `facebook/react` → Score: **8.7** (1647ms)
  - Maintenance: Maintenance
  - Security: README.mdpackage.jsonSECURITY.mdLICENSE
  - Community: COMMUNITYBlogAI RecipesRemix
  - Documentation: Documentation
  - Activity: Activity

- `vercel/next.js` → Score: **7.6** (2180ms)
  - Maintenance: Maintenance
  - Security: README.mdpackage.jsonSECURITY.mdLICENSE
  - Community: COMMUNITYBlogAI RecipesRemix
  - Documentation: Documentation
  - Activity: Activity


### AI Review

**UX Grade**: 77/100
**Performance Grade**: 72/100
**Trust Grade**: 63/100

> As a maintainer, I visited OpenSoyce to check the health score for `facebook/react` (Score: 8.7) and `vercel/next.js` (Score: 7.6). The interface is clean, and the details on pillars like Maintenance and Community are quite comprehensive. The 7-tier verdict band provides a quick and helpful frame of reference for incoming contributors. While the loading took around 2s, the caching mechanism is effective for repeat visits.

**Actionable Feedback**: Add more detailed sub-metrics under the Maintenance pillar, such as PR response times and issue resolution rates, to give maintainers more granular feedback.




---

## Dan Abramov (github-power-user)

**Goal:** Evaluate a library before adding it as a dependency
**Result:** ✅ PASS — 13s

### Repos Checked
- `sindresorhus/got` → Score: **7.6** (1652ms)
  - Maintenance: Maintenance
  - Security: README.mdpackage.jsonSECURITY.mdLICENSE
  - Community: COMMUNITYBlogAI RecipesRemix
  - Documentation: Documentation
  - Activity: Activity

- `axios/axios` → Score: **8.8** (1641ms)
  - Maintenance: Maintenance
  - Security: README.mdpackage.jsonSECURITY.mdLICENSE
  - Community: COMMUNITYBlogAI RecipesRemix
  - Documentation: Documentation
  - Activity: Activity


### AI Review

**UX Grade**: 77/100
**Performance Grade**: 73/100
**Trust Grade**: 64/100

> I checked `sindresorhus/got` (Score: 7.6) and `axios/axios` (Score: 8.8) to vet them as potential dependencies for my stack. The overall dashboard layout is solid, and I appreciate the immediate breakdown of Security and Maintenance subscores. It provides a useful fast signal for open-source project velocity. However, the initial lookup latency could be optimized to improve batch-checking workflows.

**Actionable Feedback**: Expose a batch lookup CLI tool or an API endpoint so power users can query multiple dependencies programmatically without relying on the web GUI.




---

## Sarah Mitchell (cto)

**Goal:** Audit open source tools the team uses in production
**Result:** ✅ PASS — 10s

### Repos Checked
- `expressjs/express` → Score: **9.3** (2268ms)
  - Maintenance: Maintenance
  - Security: README.mdpackage.jsonSECURITY.mdLICENSE
  - Community: COMMUNITYBlogAI RecipesRemix
  - Documentation: Documentation
  - Activity: Activity

- `lodash/lodash` → Score: **8.3** (1574ms)
  - Maintenance: Maintenance
  - Security: README.mdpackage.jsonSECURITY.mdLICENSE
  - Community: COMMUNITYBlogAI RecipesRemix
  - Documentation: Documentation
  - Activity: Activity


### AI Review

**UX Grade**: 70/100
**Performance Grade**: 70/100
**Trust Grade**: 57/100

> Auditing production dependencies like `expressjs/express` (Score: 9.3) and `lodash/lodash` (Score: 8.3) is critical for our startup's security posture. OpenSoyce gives a decent high-level verdict, making it easy to explain architectural risks to non-technical stakeholders. The UI is modern, but the analysis speed of 2 seconds feels a bit sluggish for a time-pressured evaluation. Still, the data presented is relevant and easy to digest.

**Actionable Feedback**: Introduce a comparison view where we can stack two or three repos side-by-side to quickly choose the healthier package.




---

## Carlos Ruiz (indie-dev)

**Goal:** Randomly exploring, landed from a tweet about open source health
**Result:** ✅ PASS — 12s

### Repos Checked
- `vitejs/vite` → Score: **8.2** (1854ms)
  - Maintenance: Maintenance
  - Security: README.mdpackage.jsonSECURITY.mdLICENSE
  - Community: COMMUNITYBlogAI RecipesRemix
  - Documentation: Documentation
  - Activity: Activity

- `tailwindlabs/tailwindcss` → Score: **8.7** (1825ms)
  - Maintenance: Maintenance
  - Security: README.mdpackage.jsonSECURITY.mdLICENSE
  - Community: COMMUNITYBlogAI RecipesRemix
  - Documentation: Documentation
  - Activity: Activity


### AI Review

**UX Grade**: 82/100
**Performance Grade**: 78/100
**Trust Grade**: 71/100

> Stumbled upon this tool and decided to check out `vitejs/vite` (Score: 8.2) and `tailwindlabs/tailwindcss` (Score: 8.7). The styling is absolutely gorgeous and modern, and it was super easy to type in the repo name and get a score. The 7-tier verdict band really helped me understand what the numbers actually mean. Overall, a great tool that I'll keep bookmarked for my next side project.

**Actionable Feedback**: Add a list of popular or trending repositories on the homepage so new users have something immediate to click on and explore.




---

## Priya Nair (student)

**Goal:** Researching OSS health for a university paper
**Result:** ✅ PASS — 14s

### Repos Checked
- `torvalds/linux` → Score: **6.2** (1609ms)
  - Maintenance: Maintenance
  - Security: README.mdpackage.jsonSECURITY.mdLICENSE
  - Community: COMMUNITYBlogAI RecipesRemix
  - Documentation: Documentation
  - Activity: Activity

- `microsoft/vscode` → Score: **7.9** (2806ms)
  - Maintenance: Maintenance
  - Security: README.mdpackage.jsonSECURITY.mdLICENSE
  - Community: COMMUNITYBlogAI RecipesRemix
  - Documentation: Documentation
  - Activity: Activity


### AI Review

**UX Grade**: 87/100
**Performance Grade**: 78/100
**Trust Grade**: 75/100

> I'm using OpenSoyce to research open source health metrics for school, looking up `torvalds/linux` (Score: 6.2) and `microsoft/vscode` (Score: 7.9). The website looks amazing and the layout is very user-friendly, although some of the technical jargon on the details page was a bit hard to follow at first. The methodology link helped explain things, and the score loaded in a reasonable amount of time. I really like it!

**Actionable Feedback**: Provide tooltip explanations or helper icons next to complex terms like 'LRU cache' and 'Pillars' to help beginners learn.




---

## James Hollis (security-engineer)

**Goal:** Check if a vendor dependency has an active security posture
**Result:** ✅ PASS — 11s

### Repos Checked
- `nodejs/node` → Score: **9.0** (1800ms)
  - Maintenance: Maintenance
  - Security: README.mdpackage.jsonSECURITY.mdLICENSE
  - Community: COMMUNITYBlogAI RecipesRemix
  - Documentation: Documentation
  - Activity: Activity

- `openssl/openssl` → Score: **7.1** (1820ms)
  - Maintenance: Maintenance
  - Security: README.mdpackage.jsonSECURITY.mdLICENSE
  - Community: COMMUNITYBlogAI RecipesRemix
  - Documentation: Documentation
  - Activity: Activity


### AI Review

**UX Grade**: 70/100
**Performance Grade**: 70/100
**Trust Grade**: 57/100

> My primary goal was checking `nodejs/node` (Score: 9.0) and `openssl/openssl` (Score: 7.1) to inspect their security and maintenance postures. The integration of GitHub Advisory database alerts is a good foundation, though I remain somewhat skeptical of the exact weighting algorithm. The score was calculated in 2s, which is acceptable. The interface looks professional, but I need more transparent details on vulnerability severity.

**Actionable Feedback**: Include direct links to open vulnerabilities and security advisories within the Security pillar breakdown.




---

## Anna Petrov (devrel)

**Goal:** Checking community health of repos she promotes in her newsletters
**Result:** ✅ PASS — 13s

### Repos Checked
- `supabase/supabase` → Score: **9.7** (1779ms)
  - Maintenance: Maintenance
  - Security: README.mdpackage.jsonSECURITY.mdLICENSE
  - Community: COMMUNITYBlogAI RecipesRemix
  - Documentation: Documentation
  - Activity: Activity

- `prettier/prettier` → Score: **9.1** (1810ms)
  - Maintenance: Maintenance
  - Security: README.mdpackage.jsonSECURITY.mdLICENSE
  - Community: COMMUNITYBlogAI RecipesRemix
  - Documentation: Documentation
  - Activity: Activity


### AI Review

**UX Grade**: 81/100
**Performance Grade**: 75/100
**Trust Grade**: 68/100

> I wanted to inspect the community and documentation health of `supabase/supabase` (Score: 9.7) and `prettier/prettier` (Score: 9.1). The scoring layout is visually appealing, and the community metrics give a clear picture of active contributor engagement. I really like the badge preview option, which would look great on our repositories. The load time was noticeable, but once cached, the dashboard is incredibly snappy.

**Actionable Feedback**: Provide custom social sharing widgets and SVG badges with different theme styles (dark/light/glassmorphism) to encourage maintainers to share their scores.




---

## Tom Bennett (hiring-manager)

**Goal:** Evaluating candidate portfolio repos before an interview
**Result:** ✅ PASS — 11s

### Repos Checked
- `tiangolo/fastapi` → Score: **9.8** (2169ms)
  - Maintenance: Maintenance
  - Security: README.mdpackage.jsonSECURITY.mdLICENSE
  - Community: COMMUNITYBlogAI RecipesRemix
  - Documentation: Documentation
  - Activity: Activity

- `remix-run/remix` → Score: **8.8** (1811ms)
  - Maintenance: Maintenance
  - Security: README.mdpackage.jsonSECURITY.mdLICENSE
  - Community: COMMUNITYBlogAI RecipesRemix
  - Documentation: Documentation
  - Activity: Activity


### AI Review

**UX Grade**: 77/100
**Performance Grade**: 76/100
**Trust Grade**: 66/100

> I checked `tiangolo/fastapi` (Score: 9.8) and `remix-run/remix` (Score: 8.8) to evaluate repository health before hiring decisions. The platform gives a quick, clean 'is this good' indicator, which saves me from manually combing through commit history. The UI is simple to use and has a modern feel. The loading time was slightly long, but the resulting breakdown is definitely worth the wait.

**Actionable Feedback**: Include a candidate portfolio summary report that aggregates scores from multiple personal repos into a single profile.




---

## Kenji Watanabe (github-power-user)

**Goal:** Batch-checking several OSS tools before a big architecture decision
**Result:** ✅ PASS — 12s

### Repos Checked
- `kubernetes/kubernetes` → Score: **9.3** (2027ms)
  - Maintenance: Maintenance
  - Security: README.mdpackage.jsonSECURITY.mdLICENSE
  - Community: COMMUNITYBlogAI RecipesRemix
  - Documentation: Documentation
  - Activity: Activity

- `hashicorp/terraform` → Score: **8.6** (2086ms)
  - Maintenance: Maintenance
  - Security: README.mdpackage.jsonSECURITY.mdLICENSE
  - Community: COMMUNITYBlogAI RecipesRemix
  - Documentation: Documentation
  - Activity: Activity


### AI Review

**UX Grade**: 74/100
**Performance Grade**: 71/100
**Trust Grade**: 61/100

> I checked `kubernetes/kubernetes` (Score: 9.3) and `hashicorp/terraform` (Score: 8.6) to vet them as potential dependencies for my stack. The overall dashboard layout is solid, and I appreciate the immediate breakdown of Security and Maintenance subscores. It provides a useful fast signal for open-source project velocity. However, the initial lookup latency could be optimized to improve batch-checking workflows.

**Actionable Feedback**: Expose a batch lookup CLI tool or an API endpoint so power users can query multiple dependencies programmatically without relying on the web GUI.




---

## Leila Hassan (devrel)

**Goal:** Writing an article about OSS health metrics, using OpenSoyce as a tool demo
**Result:** ✅ PASS — 12s

### Repos Checked
- `facebook/react` → Score: **8.7** (842ms)
  - Maintenance: Maintenance
  - Security: README.mdpackage.jsonSECURITY.mdLICENSE
  - Community: COMMUNITYBlogAI RecipesRemix
  - Documentation: Documentation
  - Activity: Activity

- `angular/angular` → Score: **8.7** (1747ms)
  - Maintenance: Maintenance
  - Security: README.mdpackage.jsonSECURITY.mdLICENSE
  - Community: COMMUNITYBlogAI RecipesRemix
  - Documentation: Documentation
  - Activity: Activity


### AI Review

**UX Grade**: 83/100
**Performance Grade**: 76/100
**Trust Grade**: 70/100

> I wanted to inspect the community and documentation health of `facebook/react` (Score: 8.7) and `angular/angular` (Score: 8.7). The scoring layout is visually appealing, and the community metrics give a clear picture of active contributor engagement. I really like the badge preview option, which would look great on our repositories. The load time was noticeable, but once cached, the dashboard is incredibly snappy.

**Actionable Feedback**: Provide custom social sharing widgets and SVG badges with different theme styles (dark/light/glassmorphism) to encourage maintainers to share their scores.




---

## Felix Braun (student)

**Goal:** Checking the repo of a library he just learned
**Result:** ✅ PASS — 13s

### Repos Checked
- `jquery/jquery` → Score: **8.8** (2059ms)
  - Maintenance: Maintenance
  - Security: README.mdpackage.jsonSECURITY.mdLICENSE
  - Community: COMMUNITYBlogAI RecipesRemix
  - Documentation: Documentation
  - Activity: Activity

- `chartjs/Chart.js` → Score: **6.7** (1825ms)
  - Maintenance: Maintenance
  - Security: README.mdpackage.jsonSECURITY.mdLICENSE
  - Community: COMMUNITYBlogAI RecipesRemix
  - Documentation: Documentation
  - Activity: Activity


### AI Review

**UX Grade**: 87/100
**Performance Grade**: 81/100
**Trust Grade**: 77/100

> I'm using OpenSoyce to research open source health metrics for school, looking up `jquery/jquery` (Score: 8.8) and `chartjs/Chart.js` (Score: 6.7). The website looks amazing and the layout is very user-friendly, although some of the technical jargon on the details page was a bit hard to follow at first. The methodology link helped explain things, and the score loaded in a reasonable amount of time. I really like it!

**Actionable Feedback**: Provide tooltip explanations or helper icons next to complex terms like 'LRU cache' and 'Pillars' to help beginners learn.




---

## Grace Okafor (cto)

**Goal:** Vetting dependencies for a new SaaS product
**Result:** ✅ PASS — 14s

### Repos Checked
- `prisma/prisma` → Score: **8.8** (2051ms)
  - Maintenance: Maintenance
  - Security: README.mdpackage.jsonSECURITY.mdLICENSE
  - Community: COMMUNITYBlogAI RecipesRemix
  - Documentation: Documentation
  - Activity: Activity

- `trpc/trpc` → Score: **8.5** (3216ms)
  - Maintenance: Maintenance
  - Security: README.mdpackage.jsonSECURITY.mdLICENSE
  - Community: COMMUNITYBlogAI RecipesRemix
  - Documentation: Documentation
  - Activity: Activity


### AI Review

**UX Grade**: 74/100
**Performance Grade**: 71/100
**Trust Grade**: 61/100

> Auditing production dependencies like `prisma/prisma` (Score: 8.8) and `trpc/trpc` (Score: 8.5) is critical for our startup's security posture. OpenSoyce gives a decent high-level verdict, making it easy to explain architectural risks to non-technical stakeholders. The UI is modern, but the analysis speed of 3 seconds feels a bit sluggish for a time-pressured evaluation. Still, the data presented is relevant and easy to digest.

**Actionable Feedback**: Introduce a comparison view where we can stack two or three repos side-by-side to quickly choose the healthier package.




