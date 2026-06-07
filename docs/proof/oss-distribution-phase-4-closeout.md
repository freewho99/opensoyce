# Phase 4 Closeout — OSS Distribution: CLI + Trust Badge

**Status:** Closed
**Date:** 2026-06-07
**Phase:** 4 — OSS Distribution: CLI + Trust Badge
**Predecessor phase:** [Phase 3 — Launch Narrative / Positioning (closed at `6110c13`)](./launch-narrative-positioning-closeout.md)
**Successor phase:** Phase 5 — Trust Vault: private evidence + exceptions (promoted from "Later" to "Now" by this PR)
**Arc PRs:** #58 → #59 → #60 → #61 → #62 → #64 → #66 (one ADR, two sub-sketches, two implementations, two closeouts — seven PRs total)

This closeout records what shipped in Phase 4, what stayed deferred, what doctrine carried forward, and which roadmap status moves on `main` because of this phase. Per the [launch narrative closeout pattern](./launch-narrative-positioning-closeout.md), the roadmap doc updates in the same PR so the source of truth and the narrative agree at the same SHA.

No application code, no test, no source, no route, no copy changes in this PR. The closeout is a checkpoint.

## 0. Load-bearing closeout rule

> Phase 4 closes distribution.
> Phase 5 opens private evidence.
> Do not let Phase 4 closeout smuggle Phase 5 implementation.

Every section below respects that boundary. Phase 4 ships two public read surfaces. Phase 5 will ship a different category of capability (auth-gated private evidence). This doc does not blur the two.

## 1. What shipped

### 1.1 CLI track

| Surface | Shipped in |
|---|---|
| `packages/cli/` workspace (TypeScript source, `package.json` `name: opensoyce`, bin `dist/cli.js`, tsconfig, README, .gitignore) | PR #60 (`bfd3441`) |
| Five commands: `check`, `lockfile`, `trust`, `timeline`, `why` | PR #60 |
| Seven global flags: `--json`, `--no-color`, `--api-base`, `--timeout`, `--quiet`/`-q`, `--help`/`-h`, `--version` | PR #60 |
| Six deterministic exit codes: 0 ALLOW / 1 BLOCK / 2 WARN / 3 NOT_EVALUATED / 4 NETWORK_ERROR / 5 USAGE_ERROR | PR #60 |
| `CliEvidence` shape reusing `TrustProofAnchor` verbatim | PR #60 |
| Inlined static MVP data with structural parity assertion | PR #60 |
| Hygiene for CLI strings + help + README | PR #60 |
| Phase 4 banned vocabulary (`certified`, `verified`, standalone `secure`, standalone `safe`) | PR #60 |
| 14 structural CLI v0 invariants | PR #60 (13 + 1 fix `f80185e`) |
| Network-failure doctrine: any `lockfile` partial failure → `EXIT_NETWORK_ERROR` | PR #60 fix `f80185e` |
| CLI track closeout doc | PR #61 (`e44d4bb`) |

### 1.2 Badge track

| Surface | Shipped in |
|---|---|
| `src/server/badge/` module (strings, colors, renderer, routes) | PR #64 (`13e22cc`) |
| `GET /badge/:owner/:repo/posture.svg` route | PR #64 |
| `GET /badge/:owner/:repo/posture.json` route | PR #64 |
| Locked 188×20 SVG geometry with mandatory `OPENSOYCE:` brand prefix | PR #64 |
| Locked 7-field JSON shape with `proofAnchor` pointing at the Dashboard | PR #64 |
| `Cache-Control: public, max-age=300, stale-while-revalidate=3600` + stable per-`(owner, repo, postureKey)` `ETag` + `If-None-Match` honoring | PR #64 |
| `X-OpenSoyce-Posture-Source: static-mvp` operational header | PR #64 |
| `BAD_OWNER` / `BAD_REPO` 400 error shape | PR #64 |
| `NOT EVALUATED` first-class state for unknown repos | PR #64 |
| 19 structural Trust Badge v0 invariants | PR #64 |
| Mid-flight fix: double-applied brand prefix in aria-label corrected | PR #64 |
| `docs/badge.md` public documentation surface | PR #64 |
| Badge strings + docs added to Trust Center LINKING_PAGES hygiene | PR #64 |

### 1.3 Architecture / closeouts

| Surface | Shipped in |
|---|---|
| Phase 4 ADR (CLI + Badge as distribution surfaces) | PR #58 (`f117666`) |
| CLI v0 sub-sketch (5 commands / 7 flags / 6 exit codes locked) | PR #59 (`68c6ab4`) |
| Trust Badge sub-sketch (2 routes / SVG + JSON contract locked) | PR #62 (`888b2e3`) |
| CLI v0 closeout (CLI track only) | PR #61 (`e44d4bb`) |
| Phase 4 closeout (this PR) + roadmap status update | PR #66 |

## 2. PR lineage

| PR | SHA | Type | Title | Role in the arc |
|---|---|---|---|---|
| #58 | `f117666` | docs | sketch CLI and Trust Badge ADR | Phase 4 ADR. Frames CLI + badge as distribution surfaces over the trust spine. CLI-first ordering decided. |
| #59 | `68c6ab4` | docs | sketch CLI v0 architecture | CLI sub-sketch (PR-A1). Locks commands, flags, exit codes, evidence model, npm-primary distribution, boundaries. |
| #60 | `bfd3441` | feat | add CLI v0 | CLI implementation (PR-A2). Three commits on the branch: scaffold + impl, sibling-repo tsconfig exclude `52cf913`, lockfile network-failure fix `f80185e`. |
| #61 | `e44d4bb` | docs | close out CLI v0 | CLI track closeout (PR-A3). Records the CLI track as closed; not the Phase 4 closeout. |
| #62 | `888b2e3` | docs | sketch Trust Badge architecture | Badge sub-sketch (PR-B1). Locks routes, SVG dimensions, JSON shape, anti-forgery doctrine, hygiene constraints. |
| #64 | `13e22cc` | feat | add Trust Badge v0 | Badge implementation (PR-B2). Single commit on the branch: full module + docs + 19 invariants + mid-flight aria-label fix. |
| #66 | _(this PR)_ | docs | close out Phase 4 OSS distribution | Phase 4 closeout. This doc + roadmap update. |

Seven PRs. Two numbering gaps in the GitHub sequence, both honestly recorded:

- #63 was opened on `feat/miasma-npm-worm` by parallel work in the candidate-pipeline arc. Not part of the Phase 4 arc.
- #65 was claimed by parallel work between the Trust Badge merge and this closeout being filed. Not part of the Phase 4 arc.

GitHub assigns PR numbers in commit order across the whole repo, not per-arc. The arc's identity is the SHA chain, not the PR numbers.

## 3. Current guardrails (post-Phase-4)

Every guardrail from prior closeouts carries forward, plus the Phase 4 additions.

### 3.1 Audit-anchor discipline (carried forward)

Every claim on every shipped trust surface still carries `pr` + `sha` or a `proofAnchors` array with `pr` / `live-surface` / `doc-anchor` / `proof-artifact` types. No claim ships unanchored. The badge `proofAnchor.proofType` is restricted to `live-surface` — the badge is a pointer; it does not assert anchor types beyond what already exists.

### 3.2 Honest empty state (extended by Phase 4)

- CLI: `NOT_EVALUATED` is exit code 3, distinct from `BLOCK` (1) and `WARN` (2). Reviewers can distinguish "no evidence" from "negative evidence."
- Badge: `OPENSOYCE: NOT EVALUATED` is a first-class state with its own color, 200 OK status, same `Cache-Control` as evaluated postures.
- Both surfaces forbid future-tense softening (`NOT EVALUATED YET`, `EVALUATION COMING SOON`, `IN PROGRESS`) at the source level.

### 3.3 Anti-marketing structural enforcement (extended by Phase 4)

The banned-substring vocabulary on every `/opensource-trust` link's hygiene window grew by **2 plain-substring + 2 word-boundary** entries in Phase 4.

**Pre-Phase-4 (still enforced):**

- Trust Center bans: `SOC 2`, `SOC2`, `Vanta`, `Drata`, `enterprise compliance`, `continuous monitoring`, `compliance certified`, `audit-ready`
- Future-tense tells: `coming soon`, `we will`, `roadmap`, `planned for`, `in development`
- Soft-banned marketing verbs (word-boundary): `Learn more`, `Discover`, `Explore`, `Unlock`
- Phase 3 launch bans: `zero noise`, `noise-free`, `noise free`, `false-positive elimination`, `false positive elimination`, `drop-in`, `drop in replacement`, `auto-fix`, `auto fix`, `auto-replace`, `auto replace`, `autonomous agent`, `agentic remediation`

**Phase 4 distribution-specific (new in PR #60):**

- Plain bans: `certified`, `verified`
- Word-boundary bans: `secure`, `safe`

**`visibility` field guard (still enforced):** no `CliEvidence`, `TrustBadgeJson`, or any other Phase 4 evidence shape carries a `visibility` field. Private-evidence scope creep is structurally blocked. Phase 5 is where this lifts; it does NOT lift here.

### 3.4 Consume-not-orchestrate (extended by Phase 4)

- CLI: source does NOT import gate-evaluation modules from `src/shared/` (asserted structurally).
- Badge: renderer pulls posture exclusively from `getRepoTrustPosture`; renderer does NOT consult `fetch` / `http` / `fs` / `env` / `req.query` / `req.body` / `req.headers` as posture sources.
- CLI: every `fetch(` call uses the configured `--api-base`; no literal-host URLs; no `http(s).request(`.
- Badge: no analytics SDK literals; no `<script>` / `<iframe>` / `<foreignObject>` / `<a>` / `<image>` / `<use>` / `xlink:href` in SVG output.

### 3.5 Verbatim API mirror (carried forward)

`/proof/gate` is still the verbatim API mirror. The CLI `check`/`lockfile`/`why` commands call the same endpoint; they do not narrate, transform, or proxy.

### 3.6 Phase-4-specific guardrails

- **CLI:** five commands, seven flags, six exit codes — locked. A 6th command (`fix`, `upgrade`, `replace`, `remediate`, `install`, `init`, `login`, `audit`, `export`) is structurally rejected.
- **CLI:** no destructive `fs` methods (`writeFile`, `appendFile`, `unlink`, `mkdir`, `rename`, `cp`, `symlink` + Sync variants). No `Authorization` header. No `OPENSOYCE_TOKEN` / `GITHUB_TOKEN` / `NPM_TOKEN` env reads.
- **CLI:** lockfile partial network failures never silently degrade. `failures: LockfileFailure[]` typed array; `if (failures.length > 0) return EXIT_NETWORK_ERROR;` is mandatory.
- **Badge:** exactly two GET routes; no POST/PUT/DELETE on the badge surface; no badge variants (`posture.png`, `score.svg`, `health.svg`, `timeline.svg`).
- **Badge:** SVG is 188×20, `role="img"` + `aria-label` + `<title>` mandatory.
- **Badge:** JSON sibling rejects 8 forbidden fields by construction (`score`, `confidence`, `signature`, `visibility`, `timeline`, `disclaimers`, `sentAt`, `clientId`).
- **Badge:** ETag is stable per `(owner, repo, postureKey)` — no time component, no random.

## 4. Invariant tests now protecting doctrine

| Suite | Script | Count | Phase-4 delta |
|---|---|---|---|
| Trust Timeline | `scripts/test-trust-timeline.mjs` | 11 | unchanged |
| Repo Trust Dashboard | `scripts/test-repo-trust-dashboard.mjs` | 13 | unchanged |
| Open Source Trust Center | `scripts/test-open-source-trust-center.mjs` | **26** | +3 LINKING_PAGES (CLI strings / help / README) in PR #60; +2 (Badge strings / Badge docs) in PR #64; +1 Phase-4 plain-substring invariant; +1 Phase-4 word-boundary invariant |
| CLI v0 | `scripts/test-cli-v0.mjs` | **14** | new in PR #60 (13 + 1 fix `f80185e`) |
| Trust Badge v0 | `scripts/test-trust-badge-v0.mjs` | **19** | new in PR #64 |
| Pre-existing OTS suites | various | many | unchanged |
| Candidate pipeline | three scripts | many | unchanged |

Net new doctrine assertions from Phase 4: **14 (CLI) + 19 (Badge) + 2 (Trust Center vocabulary) = +35**.

## 5. CLI publish workflow + anti-typosquat reservation decision

Per the [CLI v0 closeout §6.4 + §6.5](./cli-v0-closeout.md), the Phase 4 closeout decision-gate required either:

- **(a) Complete** the CLI publish workflow + anti-typosquat name reservations before this PR, OR
- **(b) Defer** with a documented timeline.

**Decision: (b) Defer.** Recorded honestly.

### 5.1 What is deferred

- The CI workflow file for tag-push npm publish (likely under `.github/workflows/`).
- The token-storage decision (recommendation from the CLI sub-sketch: OIDC with npm provenance).
- The first npm publish of `opensoyce` v0.0.x.
- Removal of `"private": true` from `packages/cli/package.json` (which currently blocks accidental publish).
- Anti-typosquat npm name reservations for variants like `opensoyce-cli`, `opensauce`, `open-soyce`, etc., generated by running the existing OTS typosquat-detection logic against the canonical name.

### 5.2 Why deferred

The closeout doctrine throughout this arc has been "ADR-gated, not date-gated." Shipping the publish workflow without an external trigger (a real "how do I install this?" ask, a public demo, a security review, a press cycle) risks burning the `opensoyce` namespace before there is demand to receive it.

The npm namespace is durable — once a package name is taken, it cannot be casually returned. Burning the canonical name on a v0.0.0 alpha that nobody asked for produces no value and forecloses future naming flexibility.

The same logic applies to the typosquat reservations: each reserved variant is a published stub package that must thereafter be maintained, transferred carefully if the org structure changes, and surveilled for impersonation. Reserving them before the canonical package is published reverses the order — you cannot anti-typosquat a name that doesn't yet exist.

### 5.3 Timeline / unblock condition

**Trigger condition (any one of):**

1. An external party (developer, maintainer, security team) explicitly asks how to install or run the OpenSoyce CLI.
2. A public demo or walkthrough that promises the CLI as a public artifact warrants making that promise honest.
3. The roadmap reaches a phase that requires the CLI to be installable as a precondition (e.g., a Phase 6 sandbox-telemetry workflow that the CLI ingests).

**On trigger:** A dedicated PR (call it PR-A4 in retrospect, not in the named ADR sequence) ships:

- The CI workflow file
- Token-storage configuration
- Removal of `"private": true`
- Generation + reservation of typosquat variant names via the existing OTS typosquat-detection logic
- Stub packages for each reserved variant (README pointing at canonical)
- The first npm publish

**Estimated calendar:** None committed. The trigger is signal-driven, not calendar-driven. This is the same discipline the launch narrative ADR (#54) applied to Phase 3 — prefer to ship when an external trigger exists.

### 5.4 What the deferral does NOT do

- Does not relax the doctrine. The CLI cannot demonstrate supply-chain trust while leaving its own brand undefended **when it claims a brand**. While the package stays `private: true` and unpublished, the brand is not claimed, and the typosquat surface does not exist yet.
- Does not promise the publish will happen. It records the unblock condition.
- Does not let a future "let's just publish" move skip the typosquat reservations. The trigger PR is bounded: it includes both, atomically. Splitting them is not authorized.

## 6. Badge response cache header production verification

Per the Trust Badge sub-sketch §10.5, the Phase 4 closeout requires a production verification of the badge response headers.

### 6.1 State

The badge surface is **on `main` at `13e22cc`** as of PR #64. Whether the Vercel/production deployment has received this commit at closeout time is independent of `main` state — production deployment lag is a separate concern.

### 6.2 Verification recipe (manual, to be run post-deploy)

```bash
# 1. Known repo (freewho99/opensoyce) — SVG with watchlist posture
curl -sS -i https://opensoyce.com/badge/freewho99/opensoyce/posture.svg \
  | head -12

# Expected:
#   HTTP/2 200
#   content-type: image/svg+xml; charset=utf-8
#   cache-control: public, max-age=300, stale-while-revalidate=3600
#   etag: "opensoyce-badge-v0-freewho99-opensoyce-watchlist"
#   x-opensoyce-posture-source: static-mvp
#   <svg ... width="188" height="20" ...><title>OpenSoyce posture: WATCHLIST</title>...OPENSOYCE...WATCHLIST...</svg>
```

```bash
# 2. Known repo JSON sibling
curl -sS https://opensoyce.com/badge/freewho99/opensoyce/posture.json \
  | jq -e '.postureLabel == "watchlist" and .proofAnchor.href == "/projects/freewho99/opensoyce/trust"'

# Expected: true
```

```bash
# 3. Unknown repo → 200 OK + NOT EVALUATED (first-class state)
curl -sS https://opensoyce.com/badge/some/unknown-repo/posture.json \
  | jq -e '.postureLabel == null and .postureText == "NOT EVALUATED"'

# Expected: true
```

```bash
# 4. If-None-Match 304 short-circuit
curl -sS -o /dev/null -w "%{http_code}\n" \
  -H 'If-None-Match: "opensoyce-badge-v0-freewho99-opensoyce-watchlist"' \
  https://opensoyce.com/badge/freewho99/opensoyce/posture.svg

# Expected: 304
```

```bash
# 5. Invalid path param → 400 BAD_OWNER
curl -sS -o /dev/null -w "%{http_code}\n" https://opensoyce.com/badge/!!!/repo/posture.svg

# Expected: 400
```

### 6.3 Verification status

**Pending production deployment of `13e22cc`.** The local verification on `npm run dev` against `http://localhost:3000` passed for all five shapes in PR #64 (recorded in the PR body). Reproducing against `https://opensoyce.com` is the production gate and is not a code change.

If any of the five shapes fail post-deploy, the badge has drifted from its contract. The fix lives in `src/server/badge/`, not in this closeout doc. The closeout doctrine ("Phase 4 closes distribution") does not absorb future fix work into itself.

## 7. What is explicitly NOT shipped

Phase 4 ships the CLI workspace and the badge route family. It does NOT ship:

### 7.1 Phase 5 surfaces (now "Now", but not yet implemented)

- No Trust Vault.
- No private evidence layer.
- No auth-gated trust surfaces.
- No `visibility` field on any evidence shape.
- No per-customer trust pages.
- No repo-scoped exception persistence.

### 7.2 Phase 6+ surfaces (still "Later")

- No VEX statement ingestion.
- No reachability analysis.
- No sandbox behavioral telemetry.
- No Remediation Drafts.
- No Enterprise Evidence Exports (Vanta / Drata).
- No SOC 2 attestation activation.
- No drop-in replacement engine.
- No multi-subject Trust Center.
- No persistence / database / event tables for any trust surface.
- No comparison view.
- No alerting / notifications.

### 7.3 Phase-4-specific non-shipments

- No CLI plugin system. No `--config` flag. No `--cache` flag. No `--profile` flag. No `--token` flag. No `--fail-on` flag. (Locked in the sub-sketch.)
- No CLI shell completion.
- No CLI publish workflow (deferred per §5).
- No anti-typosquat npm reservations (deferred per §5).
- No yarn / pnpm / uv.lock / poetry.lock CLI parsers.
- No CLI Homebrew tap, no standalone binaries, no Cargo crate, no Docker image, no GitHub Releases binary.
- No badge variants (`posture.png`, `score.svg`, `health.svg`, `timeline.svg`).
- No badge query-string customization.
- No cryptographic badge signing.
- No badge analytics.
- No multi-subject badge support beyond what the Dashboard data exposes.

### 7.4 Cross-cutting non-shipments

- No `threat_feed` activation.
- No candidate-pipeline arc merge with the Phase 4 surfaces.
- No `hn-exploits-log.json` cleanup.
- No `/opensource-trust` URL alias or rename.
- No `/about`, `/methodology`, `/scanner`, `/guard`, `/pricing` changes.
- No new shared / data modules beyond the Phase 4 banned vocabulary.
- No legacy SOC 2 deferral (`LEGACY_SOC2_COPY_DEFERRAL`) work — stays OPEN.

## 8. Roadmap status changes

This PR updates `docs/architecture/open-soyce-roadmap-integration.md`:

| Phase | Status before this PR | Status after this PR |
|---|---|---|
| 4 — OSS Distribution: CLI + Trust Badge | **Now** | ✅ Closed (PRs #58 → #66, last impl merge `13e22cc`) |
| 5 — Trust Vault: private evidence + exceptions | Later | **Now** |
| 1, 2, 3 | ✅ Closed (unchanged) | ✅ Closed (unchanged) |
| 6, 7, 8, 9 | (Later / Blocked / Do not claim publicly yet) | unchanged |

The roadmap doc + this closeout doc land in the same PR so the source-of-truth and the narrative agree at the same SHA.

## 9. Production verification checklist

Walk this list after the production deploy of `13e22cc` lands.

### 9.1 CLI (after the eventual publish workflow ships)

The CLI is not yet published. The §6 verification recipe above is the badge gate. The CLI's production-verification walkthrough lives in [CLI v0 closeout §7](./cli-v0-closeout.md#7-cli-v0-production-verification) and is run against a local build (`npm run cli:build` → `node packages/cli/dist/cli.js`) until §5 publishes.

### 9.2 Badge (per §6.2)

- [ ] `/badge/freewho99/opensoyce/posture.svg` → 200 OK with `Cache-Control`, `ETag`, `X-OpenSoyce-Posture-Source` headers; body contains `width="188"`, `height="20"`, `<title>OpenSoyce posture: WATCHLIST</title>`, `OPENSOYCE`, `WATCHLIST`
- [ ] `/badge/freewho99/opensoyce/posture.json` → 7-field JSON with `postureLabel: "watchlist"` and `proofAnchor.href: "/projects/freewho99/opensoyce/trust"`
- [ ] `/badge/some/unknown-repo/posture.json` → 200 OK with `postureLabel: null`, `postureText: "NOT EVALUATED"`
- [ ] `If-None-Match` 304 short-circuit honored
- [ ] `/badge/!!!/repo/posture.svg` → 400 BAD_OWNER

### 9.3 Anti-discoverability assertions still hold

- [ ] `/`, `/about`, `/methodology`, `/scanner`, `/guard`, `/pricing` carry no new `/opensource-trust` links beyond the Phase 3 hero CTA
- [ ] Global Layout footer does NOT include a `/opensource-trust` link (footer-link deferral from PR #52 still standing)
- [ ] Trust Center `/opensource-trust` page still renders all 7 sections; live gate CTA still returns `BLOCK` for `ua-parser-js@0.7.29`

### 9.4 Anti-fabrication

- [ ] No README in the wild claims an `OPENSOYCE: USE READY` badge for a repo OpenSoyce never evaluated. (Unenforceable at scale, but the badge's `NOT EVALUATED` honest fallback prevents the OpenSoyce surface from being the source of fabrication.)
- [ ] Search the deployed surfaces for `certified`, `verified`, standalone `secure`/`safe`, `drop-in`, `auto-fix`, `autonomous agent`. None present near any `/opensource-trust` link.

## 10. Next decision options (not pre-authorized)

Phase 5 is now **Now**. The user calls the Phase 5 sketch ADR when ready. Five movement options follow:

### Option A — Phase 5 sketch ADR

Open the next architecture-only sketch for **Trust Vault: private evidence + exceptions**. Scope per roadmap §3 Phase 5 row:

- Auth-gated private trust evidence (per-customer logs, embargoed CVE work, reviewer-private exception justifications).
- Repo-scoped exception persistence (resolving the carried-forward deferral from [`repo-trust-dashboard-sketch.md` §9](../architecture/repo-trust-dashboard-sketch.md) backlog).
- The Trust Center's `visibility` field guard lifts only when this phase ships, in the same PR.
- Decision on auth provider, persistence layer, and RBAC scope.
- Decision on whether Trust Vault is a separate route family or extends `/opensource-trust` / `/projects/.../trust` with visibility-aware sections.

Recommended next step. Mirrors the Phase 1 → 4 cadence: sketch first.

### Option B — Defer Phase 5; ship the CLI publish workflow first

The §5 deferral has an unblock condition that an external "how do I install this?" ask satisfies. If such an ask arrives between Phase 4 closeout and the Phase 5 sketch decision, the publish PR (named PR-A4 in retrospect) precedes Phase 5.

### Option C — Skip ahead

Treat Phase 5 as low-priority and elevate Phase 6 (Signal Intelligence: VEX + reachability + sandbox) to "Now". This requires a roadmap revision PR — not a default move. The strategic frame ("trust record, not action") supports Phase 5 ahead of Phase 6 because Phase 5 deepens the record, Phase 6 acts on it.

### Option D — Pause and produce a launch artifact

Phase 4 shipped the distribution surfaces. A non-engineering artifact (blog post, walkthrough, demo script) could convert the four-phase arc into a launch-ready story. This is its own ADR per the launch narrative ADR §10.

### Option E — Pause entirely

The arc has shipped seven PRs in Phase 4 plus the prior four phases. A pause to evaluate adoption signal before sketching Phase 5 is legitimate. The roadmap stays at "Phase 5 Now" but no PR opens.

None of A–E is pre-authorized. The user calls.

## 11. Phase status

**Closed.**

Seven PRs (#58 → #59 → #60 → #61 → #62 → #64 → #66). Two new public surfaces: the `opensoyce` CLI (locally functional, npm publish deferred) and the Trust Badge route family (live on `main` at `13e22cc`). +35 net new doctrine-encoding invariants. 38 total banned tokens across 6 categories — **none lifted**.

The principle that produced this phase —

> The CLI reads the trust record.
> The badge points to the trust record.
> Neither replaces the trust record.

— stays whole.

**Phase 5 is now "Now".** No work begins until the user explicitly approves the Phase 5 sketch.

> Capability + banned-substring exception ship in the same PR, never separately.
> Phase 4 closes distribution. Phase 5 opens private evidence.
> Do not let Phase 4 closeout smuggle Phase 5 implementation.
