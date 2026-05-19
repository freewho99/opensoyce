# OpenSoyce Swarm Report — MINI-3

**Generated:** 2026-05-19T20:38:02.094Z
**Success Rate:** 100% (3/3)

## Summary Table

| Persona | Archetype | Pass | Repos Checked | Duration |
|---------|-----------|------|---------------|----------|
| Maya Chen | oss-maintainer | ✅ | facebook/react→8.2, vercel/next.js→7.6 | 28s |
| Tom Bennett | hiring-manager | ✅ | tiangolo/fastapi→ERR, remix-run/remix→8.5 | 77s |
| Dan Abramov | github-power-user | ✅ | sindresorhus/got→7.5, axios/axios→8.2 | 19s |

---


## Maya Chen (oss-maintainer)

**Goal:** Check her own repo health score before adding a README badge
**Result:** ✅ PASS — 28s

### Repos Checked
- `facebook/react` → Score: **8.2** (1330ms)
  - Maintenance: Maintenance2.8 / 3.0
  - Security: Security0.5 / 2.0
  - Community: Community2.4 / 2.5
  - Documentation: Documentation1.5 / 1.5
  - Activity: Activity1.0 / 1.0

- `vercel/next.js` → Score: **7.6** (1627ms)
  - Maintenance: Maintenance3.0 / 3.0
  - Security: Security0.0 / 2.0
  - Community: Community2.4 / 2.5
  - Documentation: Documentation1.2 / 1.5
  - Activity: Activity1.0 / 1.0


### AI Review

**UX Grade**: 85/100
**Performance Grade**: 90/100
**Trust Grade**: 70/100

> The initial health scores for React and Next.js, 8.2 and 7.6 respectively, provide a decent high-level overview, and the accompanying verdict band offers helpful context. I found the input interface clean and intuitive, making it easy to quickly check repositories. While the detailed pillar scores are valuable for an expert like me to really scrutinize the underlying data, the load times exceeding a second for both queries suggest that uncached results might impact my workflow for deeper dives into edge cases. I'll definitely integrate OpenSoyce into my pre-badge workflow for personal projects, but I'll be meticulously validating the underlying data via the methodology page.

**Actionable Feedback**: While the methodology is comprehensive, consider offering a way to visualize comparative pillar scores for multiple analyzed repos directly on the UI, rather than having to dive into each individually. This would significantly streamline workflow for maintainers researching multiple dependencies or benchmarking.




---

## Tom Bennett (hiring-manager)

**Goal:** Evaluating candidate portfolio repos before an interview
**Result:** ✅ PASS — 77s

### Repos Checked
- `tiangolo/fastapi` → Score: **N/A** (0ms)

  - ⚠️ Error: locator.waitFor: Timeout 60000ms exceeded.
Call log:
[2m  - waiting for locator('span[aria-label^="Soyce Score"]').first() to be visible[22m

- `remix-run/remix` → Score: **8.5** (1920ms)
  - Maintenance: Maintenance2.8 / 3.0
  - Security: Security1.2 / 2.0
  - Community: Community2.2 / 2.5
  - Documentation: Documentation1.3 / 1.5
  - Activity: Activity1.0 / 1.0


### AI Review

**UX Grade**: 85/100
**Performance Grade**: 75/100
**Trust Grade**: 70/100

> OpenSoyce offered a mixed experience for evaluating candidate portfolios. While the 8.5 score for remix-run/remix was a clear and useful signal, it took almost two seconds to load, which isn't ideal when I need quick insights. More concerning was the complete failure to process tiangolo/fastapi; a timeout error isn't helpful for someone just wanting a quick verdict. The UI was intuitive, but the inconsistency makes me hesitant to fully trust it for critical evaluations right now, although I might try it again for specific cases.

**Actionable Feedback**: The failure for tiangolo/fastapi was a significant blocker; please provide clearer, non-technical feedback when a repo cannot be processed instead of a timeout message. Additionally, consistently achieving sub-second load times is crucial for delivering a truly 'fast' evaluation signal.


### Errors
- [tiangolo/fastapi] locator.waitFor: Timeout 60000ms exceeded.
Call log:
[2m  - waiting for locator('span[aria-label^="Soyce Score"]').first() to be visible[22m


---

## Dan Abramov (github-power-user)

**Goal:** Evaluate a library before adding it as a dependency
**Result:** ✅ PASS — 19s

### Repos Checked
- `sindresorhus/got` → Score: **7.5** (1124ms)
  - Maintenance: Maintenance2.7 / 3.0
  - Security: Security1.2 / 2.0
  - Community: Community1.6 / 2.5
  - Documentation: Documentation1.3 / 1.5
  - Activity: Activity0.7 / 1.0

- `axios/axios` → Score: **8.2** (1643ms)
  - Maintenance: Maintenance2.8 / 3.0
  - Security: Security0.6 / 2.0
  - Community: Community2.3 / 2.5
  - Documentation: Documentation1.5 / 1.5
  - Activity: Activity1.0 / 1.0


### AI Review

**UX Grade**: 85/100
**Performance Grade**: 90/100
**Trust Grade**: 70/100

> The numerical scores for 'got' and 'axios' provided a solid initial comparison point, especially with the accompanying verdict band for quick context. I appreciated the clearly linked methodology and the deep integration of the security subscore with GitHub Advisory, which is paramount for evaluating new dependencies. While the UI was clean and intuitive, the initial load times for both repos felt a bit sluggish, clocking in over a second each. Despite this, OpenSoyce offers a valuable starting point for dependency evaluation, and I would certainly integrate it into my workflow for a quick, informed gut-check before committing to a library.

**Actionable Feedback**: The initial data retrieval times, particularly when comparing multiple repositories, felt somewhat slow. Optimizing this aspect to provide near-instant results on the first lookup would significantly improve the flow for expert users evaluating several dependencies.




