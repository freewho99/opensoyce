# Sub-Sketch: Trust Badge v0 Architecture (Phase 4, PR-B1)

**Status:** Proposed (this sub-sketch)
**Date:** 2026-06-06
**Phase:** 4 — OSS Distribution (sub-sketch PR-B1 per the [Phase 4 ADR](./oss-distribution-cli-badge-adr.md) §7.2)
**Type:** Docs-only sub-sketch. No application code, no route registration, no `package.json` changes, no test changes, no banned-substring vocabulary lifted.

**Predecessors:**

- [Phase 4 ADR — OSS Distribution: CLI + Trust Badge](./oss-distribution-cli-badge-adr.md) (#58)
- [CLI v0 Sub-Sketch](./cli-architecture-sub-sketch.md) (#59)
- [CLI v0 Implementation (PR-A2)](../../packages/cli/src/cli.ts) (#60)
- [CLI v0 Closeout](../proof/cli-v0-closeout.md) (#61)

This sub-sketch refines the Trust Badge section of the Phase 4 ADR into something an implementation PR (PR-B2) can build against without re-litigating decisions. It does not authorize implementation.

## 0. Inherited doctrine (non-negotiable)

From Phase 4 ADR §0:

> 1. The CLI reads the trust record.
> 2. **The badge points to the trust record.**
> 3. Neither replaces the trust record.

Rule 2 governs every decision below. If any decision in implementation drifts from this, the decision changes — not the rule.

Concretely, the badge is **a pointer**:

- The badge image embeds **only** the posture label that already exists in the public trust record.
- The badge image **cannot** survive detachment from the canonical URL. The link target is the source of truth.
- The badge **cannot** assert anything the Dashboard does not assert. No "verified", no "certified", no "safe", no "secure" — the Phase 4 banned vocabulary protects this structurally.

## 1. Route shape (v0)

### 1.1 Canonical routes

| Route | Purpose | Method | Response shape |
|---|---|---|---|
| `/badge/:owner/:repo/posture.svg` | Posture badge image | GET | `image/svg+xml` |
| `/badge/:owner/:repo/posture.json` | Same posture data, machine-readable | GET | `application/json` |

No other route family ships in v0:

- No `/badge/:owner/:repo/health.svg` or `/badge/:owner/:repo/score.svg` — v0 is posture only.
- No `/badge/:owner/:repo/posture.png` — SVG only in v0.
- No `/badge/:owner/:repo/timeline.svg` or any other surface.
- No query-string variants (no `?style=flat`, no `?theme=dark`, no `?color=blue`).

### 1.2 Path parameter discipline

| Parameter | Format | Rejection behavior |
|---|---|---|
| `:owner` | `[A-Za-z0-9][\w.-]*` (matches the CLI regex) | 400 + `BAD_OWNER` response shape |
| `:repo` | `[A-Za-z0-9][\w.-]*` | 400 + `BAD_REPO` response shape |
| extra path segments | none allowed | 404 |

### 1.3 Cache-Control + ETag (proposed for PR-B2)

| Header | Value | Why |
|---|---|---|
| `Cache-Control` | `public, max-age=300, stale-while-revalidate=3600` | Short cache so posture changes propagate within 5 minutes; SWR so transient origin issues don't break embedded badges |
| `ETag` | hash of posture label + last-evaluated date | Lets `If-None-Match` short-circuit unchanged badges |
| `Content-Type` | `image/svg+xml; charset=utf-8` (SVG) or `application/json; charset=utf-8` (JSON) | Both UTF-8 |
| `X-OpenSoyce-Posture-Source` | `static-mvp` (v0) / `live` (future) | Operational diagnostic; documented in the response-shape contract |

### 1.4 No new web framework decisions

The badge routes use the existing Express server in `server.ts`. No new dependencies. No new middleware. The PR-B2 implementation adds two route handlers under the existing app router. The structural-invariants test asserts no new top-level dependency landed in `package.json` with PR-B2.

## 2. SVG rendering contract

### 2.1 Visual dimensions

Width and height are fixed for v0. No customization.

| Dimension | Value | Rationale |
|---|---|---|
| Width | 188 px | Fits comfortably in a README block alongside other shields |
| Height | 20 px | Matches the de-facto README badge height convention |
| Label width | 88 px | Left segment containing "OPENSOYCE" |
| Value width | 100 px | Right segment containing posture text |
| Font | system-ui, sans-serif fallback | No web font fetch in v0 |
| Font size | 11 px | Standard README badge |
| Padding | 6 px each side | Standard README badge |

### 2.2 Color contract

Reuses the existing `RepoTrustDashboard.tsx` `postureColor` mapping (or its hex-equivalent). Mandatory parity test in PR-B2 ensures the SVG color and the Dashboard React color stay in lockstep.

| Posture | Label segment color | Value segment color | Text color |
|---|---|---|---|
| `use-ready` | `#302C26` (soy-bottle) | `#10b981` (emerald-500) | white on both |
| `watchlist` | `#302C26` | `#facc15` (yellow-400) | white / soy-bottle |
| `risky` | `#302C26` | `#E63322` (soy-red) | white on both |
| `graveyard` | `#302C26` | `#1f2937` (deep gray) | white on both |
| `NOT EVALUATED` | `#302C26` | `#a8a29e` (warm gray) | white / soy-bottle |

No `--no-color` equivalent and no theme switching in v0. The badge has one canonical look.

### 2.3 Text content

The badge SVG contains exactly two text nodes:

| Slot | Text | Notes |
|---|---|---|
| Label | `OPENSOYCE` | Mandatory prefix — protects against the badge being repurposed as a generic "USE READY" badge for non-OpenSoyce evaluation |
| Value | one of: `USE READY`, `WATCHLIST`, `RISKY`, `GRAVEYARD`, `NOT EVALUATED` | The fixed posture vocabulary; no new labels |

No other text. No tagline. No URL. No date. No version stamp. The badge is the posture, period.

### 2.4 Accessibility

| Surface | Value |
|---|---|
| `<svg role>` | `img` |
| `<svg aria-label>` | `OpenSoyce posture: USE READY` (concatenation of label + value) |
| `<title>` (first child of `<svg>`) | Same as `aria-label` |
| Hidden text fallback | None — the visible text is the content |

### 2.5 Anti-fabrication

The SVG renderer must NOT:

- Synthesize a posture for an owner/repo that has no entry in the trust record. Unknown subjects render `OPENSOYCE: NOT EVALUATED`.
- Smooth over `NOT EVALUATED` with a softer label like "Pending" or "Coming Soon" — that's a future-tense tell and is structurally banned.
- Substitute a different posture if the requested one is "embarrassing". `RISKY` and `GRAVEYARD` render verbatim.
- Include version-suffix transformations like the historical gate-handler bug. The badge handler reads the posture record by owner/repo, never by package name; no per-version posture exists.

### 2.6 Anti-forgery

The SVG renderer must NOT:

- Accept upstream request headers that would change the posture (e.g., `X-OpenSoyce-Override-Posture`). The posture source is the public Dashboard data only.
- Trust an authenticated caller's claimed identity. v0 has no auth, and authenticated bypass paths are out of scope.
- Sign the SVG in v0. Anti-forgery in v0 relies on the canonical URL plus honest degradation (per Phase 4 ADR §2.3). Cryptographic signatures are queued behind their own ADR.

The PR-B2 structural test must assert the renderer pulls posture from `REPO_TRUST_POSTURES` (the shared data module) and rejects every other input as a posture source.

## 3. JSON sibling contract

### 3.1 Shape

```text
TrustBadgeJson {
  owner:        string
  repo:         string
  postureLabel: 'use-ready' | 'watchlist' | 'risky' | 'graveyard' | null
  postureText:  'USE READY' | 'WATCHLIST' | 'RISKY' | 'GRAVEYARD' | 'NOT EVALUATED'
  source:       'static-mvp'                    // v0 always; widens when Phase 5 ships
  fetchedAt:    string                          // ISO timestamp
  proofAnchor:  {
    proofType: 'live-surface',
    label:     '/projects/<owner>/<repo>/trust',
    href:      '/projects/<owner>/<repo>/trust'
  }
}
```

Notes:

- `postureLabel` is `null` when the repo has no record; `postureText` is `NOT EVALUATED` in that case.
- `proofAnchor.proofType` is restricted to `live-surface` for v0 — the badge JSON is itself a pointer to the Dashboard, not a self-contained claim.
- The JSON sibling and the SVG share the same posture-source resolution. A repo cannot show one posture in SVG and a different one in JSON.

### 3.2 Forbidden JSON fields

- No `score` field (the badge surface posture is record-only, not score-derived).
- No `confidence` field (no scoring narrative).
- No `signature` field in v0 (anti-forgery via canonical URL, not signed payload).
- No `visibility` field (carried-forward `visibility`-field guard from the Trust Center).
- No `timeline` field (the Timeline is its own surface; this JSON is posture-only).
- No `disclaimers` field (the trust record is the disclaimer).
- No telemetry fields (`sentAt`, `clientId`, etc.) — the badge is a read surface.

### 3.3 Error shape

All bad requests share the shape:

```text
TrustBadgeError {
  error:    'BAD_OWNER' | 'BAD_REPO' | 'NOT_FOUND'
  message:  string
  hint?:    string
}
```

`NOT_FOUND` does NOT fire for unknown owner/repo. Unknown owner/repo always succeeds with `postureLabel: null, postureText: 'NOT EVALUATED'`. `NOT_FOUND` is reserved for malformed routes (e.g., extra path segments under `/badge/`).

## 4. Posture source and NOT EVALUATED fallback

### 4.1 Source of truth

The badge's posture source is the existing `REPO_TRUST_POSTURES` from `src/shared/repoTrustDashboard.js` — the same static MVP data the Dashboard renders.

| owner / repo | posture | Source |
|---|---|---|
| `freewho99/opensoyce` | `watchlist` | `REPO_TRUST_POSTURES[0]` |
| everything else | (none) | renders as `NOT EVALUATED` |

### 4.2 Lookup semantics

The badge handler does **NOT** call any new service, scan, or evaluation. It performs a case-insensitive owner/repo lookup against the in-memory `REPO_TRUST_POSTURES` array.

```text
function lookupPosture(owner, repo) {
  const o = String(owner || '').trim().toLowerCase();
  const r = String(repo || '').trim().toLowerCase();
  for (const p of REPO_TRUST_POSTURES) {
    if (p.owner.toLowerCase() === o && p.repo.toLowerCase() === r) return p;
  }
  return null;
}
```

This is the same shape as `getRepoTrustPosture()` from the shared module. The PR-B2 implementation should reuse the existing helper, not re-implement.

### 4.3 NOT EVALUATED fallback contract

| Field | Value when unknown |
|---|---|
| SVG label segment | `OPENSOYCE` (always) |
| SVG value segment | `NOT EVALUATED` |
| SVG value color | `#a8a29e` (warm gray) — distinct from any of the four real postures |
| JSON `postureLabel` | `null` |
| JSON `postureText` | `NOT EVALUATED` |
| HTTP status | `200 OK` |
| `Cache-Control` | same as evaluated postures (`max-age=300, stale-while-revalidate=3600`) |
| `proofAnchor.href` | still `/projects/<owner>/<repo>/trust` (which renders the Dashboard's honest empty state) |

`NOT EVALUATED` is a first-class state, exactly the way `NOT_EVALUATED` is for the CLI exit code 3. A reviewer reading the badge can tell "no evidence" from "negative evidence."

### 4.4 What `NOT EVALUATED` does NOT mean

- It does NOT mean "soon to be evaluated." There is no implied future commitment.
- It does NOT mean "we don't trust this repo." `NOT EVALUATED` is the absence of a posture; `RISKY` is the presence of a negative posture. The two are distinct claims.
- It does NOT mean "the repo doesn't exist on GitHub." The badge doesn't check existence on GitHub — only existence in the OpenSoyce trust record.

The badge SVG and JSON must NOT add any copy that implies any of the above. The implementation hygiene test enforces this.

## 5. Canonical link-to-record behavior

### 5.1 Link target

Every badge image is intended for use **inside a markdown link**:

```markdown
[![OpenSoyce Trust](https://opensoyce.com/badge/<owner>/<repo>/posture.svg)](https://opensoyce.com/projects/<owner>/<repo>/trust)
```

The link target is the existing Trust Dashboard route. OpenSoyce commits to preserving this URL across future renames per Phase 4 ADR §2.3 rule 3 ("the link survives the image"). If `/projects/<owner>/<repo>/trust` is ever renamed (e.g., as part of a Phase 5 multi-subject restructure), the old URL responds with `301` to the new path.

### 5.2 Detachment behavior

If a README embeds just the SVG without the link wrapper:

- The image still renders the posture label.
- The image alt-text (`OpenSoyce Trust`) is still meaningful for screen readers and crawlers.
- The image does NOT contain an embedded URL — clicking it does nothing.
- This is a worse UX than the recommended embed, but it does not violate doctrine. The image still points at the trust record through the literal "OPENSOYCE" prefix and the README context.

PR-B2 documentation calls out the link wrapper as the recommended form.

### 5.3 Self-hosted SVG screenshots

A third party can technically download `posture.svg`, host it on `their-site.com`, and embed it in a README. The result is a static "OPENSOYCE: USE READY" image that does not refresh.

This is **not an OpenSoyce badge**. The canonical URL is the badge. A self-hosted copy is a screenshot. OpenSoyce does not guarantee its accuracy, does not preserve link-survives-image semantics for it, and does not take responsibility for stale claims it makes.

The badge documentation should call this out plainly so maintainers know what they are giving up if they self-host.

## 6. README embed block (recommended copy)

### 6.1 Canonical embed

```markdown
[![OpenSoyce Trust](https://opensoyce.com/badge/<owner>/<repo>/posture.svg)](https://opensoyce.com/projects/<owner>/<repo>/trust)
```

This is the only recommended embed. Variants are documented but not promoted.

### 6.2 Variants

| Use case | Embed |
|---|---|
| Plain Markdown link | Above (canonical) |
| HTML (e.g., in a docs site) | `<a href="https://opensoyce.com/projects/<owner>/<repo>/trust"><img src="https://opensoyce.com/badge/<owner>/<repo>/posture.svg" alt="OpenSoyce Trust" /></a>` |
| RST | `.. image:: https://opensoyce.com/badge/<owner>/<repo>/posture.svg` followed by `:target:` line |
| JSON consumer (no human render) | GET `/badge/<owner>/<repo>/posture.json` directly |

### 6.3 Embed-time copy constraints

The README embed block in the badge documentation is treated as a linking-page for hygiene purposes. The full vocabulary applies:

- No `SOC 2` / `SOC2` / `Vanta` / `Drata` / `enterprise compliance` / `continuous monitoring` / `compliance certified` / `audit-ready`
- No future-tense tells (`coming soon` / `we will` / `roadmap` / `planned for` / `in development`)
- No soft-banned verbs (`Learn more` / `Discover` / `Explore` / `Unlock`) near `/opensource-trust` references
- No Phase-3 launch bans (`zero noise` / `drop-in` / `auto-fix` / `autonomous agent` etc.)
- No Phase-4 plain bans (`certified` / `verified`)
- No Phase-4 word-boundary bans (`secure` / `safe` standalone)

The PR-B2 implementation extends the linking-page hygiene list to include the badge documentation surface (proposed: `docs/badge.md` or wherever the embed block lives in the implementation).

## 7. Anti-forgery / anti-fabrication boundaries

### 7.1 Three forgery vectors and their mitigations

| Vector | Risk | v0 mitigation |
|---|---|---|
| **A. Spoofed posture via query string / header** | Attacker requests `/badge/foo/bar/posture.svg?posture=use-ready` and gets back a forged "USE READY" badge | Routes accept **no** query-string variants. Headers don't influence posture. The renderer reads the in-memory data only. |
| **B. Spoofed posture via copy-and-host** | Attacker downloads `posture.svg`, edits it to swap `RISKY` → `USE READY`, hosts the edited SVG, embeds it in a README | Not preventable by v0. Documented in §5.3 as "not an OpenSoyce badge". Future signed-payload ADR addresses this if it becomes a real problem. |
| **C. Spoofed link target** | Attacker embeds the canonical SVG but links to a different (non-Dashboard) destination | Not preventable by the badge surface. The visible "OPENSOYCE" prefix and the README context are the only mitigation in v0. |

A and C are common attacks; A is structurally blocked, C is bounded by the brand prefix. B is the hardest and is explicitly deferred. The implementation PR adds a structural test for vector A (assert renderer ignores query strings, headers).

### 7.2 Two fabrication vectors and their mitigations

| Vector | Risk | v0 mitigation |
|---|---|---|
| **a. OpenSoyce renders a posture for a repo it never evaluated** | The badge handler invents a posture for an arbitrary owner/repo | Renderer looks up via `getRepoTrustPosture()` only. Unknown owner/repo always returns `NOT EVALUATED`. Structural test asserts the renderer doesn't construct a `postureLabel` value outside `{use-ready, watchlist, risky, graveyard, null}`. |
| **b. OpenSoyce smooths an embarrassing posture (RISKY) into something gentler** | Marketing impulse to swap `RISKY` → `WATCHLIST` for "important" subjects | Posture text is a direct map from the data's `postureLabel`. No alternate-mapping logic ships. Structural test reads the renderer and asserts a single posture-to-text mapping table. |

### 7.3 No analytics, no fingerprinting

The badge route handlers do NOT:

- Log requesting IPs, User-Agents, or referrers beyond the existing server access log.
- Set cookies on badge responses.
- Embed any tracking pixel, script, or external resource fetch in the SVG.
- Make any outbound HTTP call from the badge handler.

The PR-B2 structural test asserts the renderer's SVG output contains no `<script>`, `<iframe>`, `<foreignObject>`, or `<a xlink:href>` elements.

## 8. Badge copy hygiene and Phase-4 banned vocabulary enforcement

### 8.1 Renderer source files in scope

The PR-B2 implementation should keep the badge renderer's user-facing strings in a small, hygiene-testable module — e.g., `src/server/badge/strings.ts` or `src/shared/badgeStrings.js`. The exact location lands in PR-B2.

Both files (the renderer and the strings module) are added to `LINKING_PAGES` in `scripts/test-open-source-trust-center.mjs` with mode `window`. The README-embed block documentation file is added separately.

### 8.2 Full vocabulary inheritance

Every banned vocabulary from prior phases applies to badge output (SVG text content + JSON copy + README embed documentation):

| Vocabulary | Where applied |
|---|---|
| `OPEN_SOURCE_TRUST_CENTER_BANNED_SUBSTRINGS` (Trust Center) | SVG text + JSON + docs |
| `OPEN_SOURCE_TRUST_CENTER_FUTURE_TENSE_TELLS` | Same |
| Soft-banned marketing verbs (word-boundary) | Same |
| `OPEN_SOURCE_TRUST_CENTER_PHASE_3_LAUNCH_BANNED_SUBSTRINGS` | Same |
| `OPEN_SOURCE_TRUST_CENTER_PHASE_4_DISTRIBUTION_BANNED_SUBSTRINGS` | Same (CLI's `certified`/`verified` carries forward to badge) |
| `OPEN_SOURCE_TRUST_CENTER_PHASE_4_WORD_BOUNDARY_BANNED` | Same (CLI's standalone `secure`/`safe` carries forward) |

### 8.3 No new banned vocabulary in v0

PR-B2 does NOT add new entries to any vocabulary. The vocabulary lift discipline stays whole — additions atomic with new capabilities, never speculative.

### 8.4 Empty-state copy

The `NOT EVALUATED` text and any surrounding copy (in JSON `postureText`, in SVG value text, in the docs) must not soften the absence of a posture into a future-tense tell:

- ✘ `NOT EVALUATED YET` (`yet` implies future-tense)
- ✘ `EVALUATION COMING SOON` (banned future-tense substring)
- ✘ `EVALUATION IN PROGRESS` (`in progress` implies a live process the badge does not have)
- ✓ `NOT EVALUATED` (factual, present-tense)

The implementation hygiene test enforces this by including the SVG and JSON output paths in the vocabulary check.

## 9. Implementation PR-B2 scope

PR-B2 (`feat(distribution): add Trust Badge v0`) is authorized to:

- Register two new routes on the existing Express server: `GET /badge/:owner/:repo/posture.svg` and `GET /badge/:owner/:repo/posture.json`.
- Add the SVG renderer (likely under `src/server/badge/` or similar; final path picked in PR-B2 by reading the existing server structure).
- Reuse `getRepoTrustPosture()` from `src/shared/repoTrustDashboard.js` (NOT re-implement).
- Reuse posture color constants from a shared location accessible to both the React `RepoTrustDashboard.tsx` and the new server-side renderer. The PR-B2 implementation may extract these into a small shared module if they don't already live in one.
- Add the JSON sibling handler with the §3.1 shape.
- Add the `Cache-Control` + `ETag` headers per §1.3.
- Add a recommended-embed documentation surface (likely `docs/badge.md` or extend an existing doc).
- Extend `scripts/test-open-source-trust-center.mjs` `LINKING_PAGES` with the badge renderer strings module + the embed documentation surface (mode `window`).
- Add a new structural-invariants test `scripts/test-trust-badge-v0.mjs` enforcing the boundary doctrine (anti-forgery, anti-fabrication, no analytics, no scripts in SVG, route-shape lock, posture-source single-table).
- Wire `test:trust-badge-v0` into `test:ci` and add a `test:trust-badge-v0` npm script.

PR-B2 is NOT authorized to:

- Add any badge variant route (e.g., `posture.png`, `health.svg`, `timeline.svg`).
- Add query-string customization (`?style=`, `?theme=`, `?color=`).
- Add cryptographic signing of any badge response.
- Add badge customization API.
- Add badge analytics.
- Change the existing `/projects/:owner/:repo/trust` Dashboard route.
- Change the existing `REPO_TRUST_POSTURES` data shape.
- Touch the CLI.
- Lift any banned-substring vocabulary entry.
- Add CLI publish workflow work (that's the recommended-but-still-queued post-Phase-4 PR per the CLI v0 closeout §6.5).
- Modify the legacy SOC 2 deferral.
- Add any web-app `src/pages/` content.

## 10. Phase 4 closeout PR-B3 criteria

PR-B3 (`docs(distribution): close out Phase 4 OSS Distribution`) is the **Phase 4 closeout**. Per Phase 4 ADR §8 it closes when **all** of the following are true and recorded in the closeout doc:

### 10.1 Surfaces

- [ ] `opensoyce` CLI is installable via `npm` and `npx`. `opensoyce check <pkg>` returns a real gate result. **State after CLI v0 closeout (PR #61): `private: true` keeps publish from happening; "installable" is satisfied conditionally on the publish workflow shipping. PR-B3 records whether the publish ships before Phase 4 closes, or whether it is explicitly deferred to a post-Phase-4 PR with a documented timeline.**
- [ ] `/badge/<owner>/<repo>/posture.svg` renders SVG for the focus repo and `NOT EVALUATED` for any other owner/repo.
- [ ] `/badge/<owner>/<repo>/posture.json` renders the same posture data in JSON.
- [ ] The badge image's link target resolves to the existing `/projects/<owner>/<repo>/trust` Dashboard.

### 10.2 Hygiene tests

- [ ] CLI source directory is in `LINKING_PAGES` (or has a parallel hygiene suite) enforcing all banned-substring vocabularies. **Done in PR #60.**
- [ ] Badge renderer strings module and recommended-embed docs are in `LINKING_PAGES`. **Pending PR-B2.**
- [ ] Every Phase 4 PR passed `npm run test:ci` with no relaxation of prior-phase invariants.
- [ ] Phase-3 banned vocabulary fully enforced on Phase 4 surfaces; Phase 4 may add new entries but lifts none. **State: Phase 4 added 4 entries (2 plain + 2 word-boundary), lifted 0.**
- [ ] `visibility` field guard still active. No CLI or badge surface has a `visibility` field.

### 10.3 Doctrine

- [ ] CLI does not run a local gate. **Verified structurally in PR #60.**
- [ ] Badge does not embed a self-contained claim. The SVG `aria-label` and `title` contain only "OpenSoyce posture: <text>"; the posture text only appears in the SVG render fetched from the canonical URL.
- [ ] Neither surface invents a new `proofAnchor.proofType`.
- [ ] Neither surface invents a new posture label.
- [ ] Neither surface invents a new Timeline event type.

### 10.4 Documentation

- [ ] Phase 4 closeout doc (PR-B3) lists PRs, SHAs, what shipped, what is deferred, what unblocks Phase 5.
- [ ] Roadmap doc updates Phase 4 from "Now" to "✅ Closed" and Phase 5 (Trust Vault) from "Later" to "Now" — in the same PR.
- [ ] Legacy SOC 2 deferral (`LEGACY_SOC2_COPY_DEFERRAL`) remains untouched; the Phase 4 closeout explicitly carries the TODO ID forward.

### 10.5 New decision-gate items added by this sub-sketch

- [ ] CLI publish workflow + anti-typosquat name reservations (per CLI v0 closeout §6.5) — either done before PR-B3 ships, or **explicitly deferred** to a post-Phase-4 PR with a documented timeline in the PR-B3 closeout body.
- [ ] Badge response cache headers verified in production (manual curl check; recorded in PR-B3's production-verification section).

### 10.6 What PR-B3 closeout does NOT include

- The closeout does not authorize Phase 5 implementation. It only moves Phase 5 to "Now" in the roadmap.
- The closeout does not lift any banned-substring entry.
- The closeout does not promise badge customization, plugin support, or any v1 features.
- The closeout does not declare "OpenSoyce is now widely adopted" or any adoption claim the deployed surfaces cannot back.

## 11. What this sub-sketch does NOT do

- Does not authorize PR-B2. The user explicitly approves PR-B2 before any code lands.
- Does not change any source code.
- Does not change `package.json`.
- Does not change any test.
- Does not register any new route.
- Does not lift any banned-substring vocabulary entry.
- Does not touch the legacy SOC 2 deferral.
- Does not authorize PR-B3 (Phase 4 closeout) or any later PR.
- Does not promote Phase 5+ scope into Phase 4.
- Does not introduce VEX / reachability / sandbox / remediation / drop-in / AI-agent / agentic framing.
- Does not touch the CLI (CLI track closed at PR #61).
- Does not touch the candidate-pipeline arc.
- Does not touch the `threat_feed` ADR.
- Does not authorize the `hn-exploits-log.json` cleanup.

## 12. Status

**Proposed.** Awaiting explicit user decision before PR-B2 begins.

Docs only. No application code, no route registration, no `package.json` change, no test change, no banned-substring vocabulary lifted.

Recommended next PR after this merges:

**PR-B2 — `feat(distribution): add Trust Badge v0`** (per Phase 4 ADR §7.2)

Recommended, not pre-authorized. The user calls "approve PR-B2" with explicit scope before any implementation begins.

---

> The badge points to the trust record. It does not become the trust record.
> Five posture states. Two routes. One canonical URL. Zero embedded claims.
