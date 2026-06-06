# ADR: OSS Distribution — CLI + Trust Badge (Phase 4 Sketch)

**Status:** Proposed (this ADR)
**Date:** 2026-06-06
**Phase:** 4 — OSS Distribution: CLI + Trust Badge (the "Now" slot per the [roadmap integration doc](./open-soyce-roadmap-integration.md))
**Type:** Docs-only architecture decision record. No application code, no route changes, no link wiring, no copy changes, no banned-substring vocabulary lifted.

**Predecessors:**

- [Public Trust Spine Closeout](../proof/public-trust-spine-closeout.md) (#50)
- [Trust Spine Discoverability ADR](./public-trust-spine-discoverability-adr.md) (#51) + impl (#52)
- [Roadmap Integration](./open-soyce-roadmap-integration.md) (#53)
- [Launch Narrative & Positioning ADR](./launch-narrative-positioning-adr.md) (#54) + impl (#55, #56)
- [Phase 3 Closeout](../proof/launch-narrative-positioning-closeout.md) (#57)

This sketch answers two paired questions and then sequences the implementation that follows from the answers:

> **How does OpenSoyce reach a developer who never visits the website?**
> **How does an open-source project carry its trust record into the rest of the world?**

It does not authorize implementation. It establishes the surface shapes, the consume-not-orchestrate boundaries, the public URL contracts, the implementation order, and the closeout criteria. Each Phase 4 implementation PR is its own approval.

## 0. Load-bearing doctrine (this phase's strategic frame)

Three rules govern every decision in this ADR. Every section below is a corollary.

1. **The CLI reads the trust record.** It does not compute a new posture. It does not run a new gate. It does not produce evidence the public surfaces do not already produce.
2. **The badge points to the trust record.** It does not embed a self-contained claim. It does not assert a posture that survives detachment from the live URL. A badge whose image lives on but whose URL dies must decay honestly.
3. **Neither replaces the trust record.** Both surfaces are **reads** of the public spine. The deployed `/proof/gate`, `/proof/timeline`, `/projects/.../trust`, and `/opensource-trust` surfaces remain the source of truth. CLI and badge are distribution; they do not become the record.

If a design decision in any later section conflicts with rule 1, 2, or 3, the design changes — not the rule.

## 1. CLI purpose, boundaries, commands, evidence model

### 1.1 Purpose

The `opensoyce` CLI is the developer-facing read surface of the trust record. It serves three audiences without branching on persona:

- **Developer at the terminal** — wants to check a dependency before adding it
- **CI pipeline** — wants a machine-consumable trust decision in build/test/release flows
- **Maintainer** — wants to read their own repo's trust posture and the patterns it triggers

All three see the same evidence the website renders. The CLI is the same evidence in a different shell.

### 1.2 Boundaries

The CLI **does**:

- Query the public gate API at `/api/compliance-gate` (the same endpoint `/proof/gate` mirrors).
- Read repo trust posture from `/projects/:owner/:repo/trust` data (static MVP data today; future-persistent in later phases).
- Render Timeline events relevant to a queried package or repo.
- Output the same `proofAnchor` shape the Trust Center uses: `pr` / `live-surface` / `doc-anchor` / `proof-artifact`.
- Support `--json` for CI consumption.
- Map gate actions to documented exit codes.

The CLI **does NOT**:

- Run a new gate locally. It does not evaluate patterns; it asks the deployed gate.
- Cache trust posture across runs in a way that survives package updates (per-invocation freshness; no offline mode in v0).
- Submit, modify, or annotate any evidence. Read-only.
- Authenticate. Public surfaces only.
- Open PRs, write files, modify lockfiles, or take any other write action against the user's repo.
- Render a "score" that is not already in the public posture vocabulary.
- Invent CLI-only banned substrings, posture labels, or evidence types.
- Send telemetry to OpenSoyce beyond what the public API already logs.

### 1.3 Commands (proposed; final list lands in implementation sketch)

| Command | Reads | Output |
|---|---|---|
| `opensoyce check <pkg>` | `/api/compliance-gate` for the named package | gate action, firing-set count, the same `proofAnchors` the Trust Center shows |
| `opensoyce lockfile [path]` | parses lockfile + queries gate for each entry | per-entry action; overall verdict; exit code = worst action |
| `opensoyce trust <owner>/<repo>` | per-repo trust posture (static MVP today; future persistence) | posture label, gate examples, workflow findings, timeline preview, cross-link |
| `opensoyce timeline [--package <p>] [--pr <n>]` | `/proof/timeline` static event data | event list filtered by package or PR |
| `opensoyce why <pkg>` | same as `check` + Timeline events that touch the package | decision + the history that produced it |

The command list is illustrative. The implementation sketch picks the final names, the flag set, and the exit-code mapping. This sketch authorizes the *shape*, not the names.

### 1.4 Evidence model

Every CLI output carries the same evidence types the Trust Center already publishes. No new type, no narration, no inferred claims.

```text
CliEvidence {
  command: 'check' | 'lockfile' | 'trust' | 'timeline' | 'why' | ...
  query: { package?: string, lockfilePath?: string, owner?: string, repo?: string, pr?: number }
  result: GateResult | TrustPosture | TimelineEvents[]   // verbatim from the public surface
  proofAnchors: TrustProofAnchor[]                       // same shape as the Trust Center
  exitCode: number                                       // 0 ALLOW, 1 BLOCK, 2 WARN, 3 ERROR, 4 USAGE
}
```

`TrustProofAnchor` reuses the type defined in `src/data/openSourceTrustCenter.ts`. The CLI must not introduce a parallel anchor shape.

### 1.5 Distribution

Primary distribution: **npm** (`npm i -g opensoyce`, plus `npx opensoyce`). Most lockfile-aware users already have it.

Secondary distribution (decided in the implementation sketch, not pre-authorized here):

- Homebrew tap (`brew install opensoyce`).
- Cargo crate (decided if/when the runtime is rewritten; v0 is likely TypeScript over Node).
- Standalone binaries (`opensoyce-linux-x64`, etc.) — adds CI complexity; only if the npm path proves friction in real adoption.

**Out of scope for this sketch:** Cargo, Homebrew, standalone binaries. Named here so the implementation sketch knows what is queued and what is not.

### 1.6 Anti-marketing copy hygiene for CLI output

CLI human-readable output (default, not `--json`) is subject to the Trust Center's full banned vocabulary, plus the Phase-3 launch additions. Specifically:

- No `SOC 2` / `Vanta` / `Drata` / `enterprise compliance` / `continuous monitoring` / `compliance certified` / `audit-ready` in any CLI string.
- No `zero noise` / `false-positive elimination` framing.
- No `drop-in` / `auto-fix` / `auto-replace` / `remediation` framing.
- No `autonomous agent` / `agentic` framing.
- No `coming soon` / `we will` / `roadmap` / `planned for` / `in development` in CLI strings.
- No `Learn more` / `Discover` / `Explore` / `Unlock` verbs near CLI output that references `/opensource-trust`.

Implementation enforces this by adding the CLI source directory to the `LINKING_PAGES` list in `scripts/test-open-source-trust-center.mjs` (or by writing a parallel hygiene test scoped to CLI strings).

## 2. Trust Badge purpose, rendering model, anti-forgery constraints, public URL shape

### 2.1 Purpose

The Trust Badge is a README-embeddable artifact that lets any open-source project show its current OpenSoyce posture without claiming anything the trust record does not back. The badge is **a pointer to the live record**, not a self-contained claim.

### 2.2 Rendering model

The badge is rendered server-side as an SVG at a stable public URL. Markdown looks like:

```markdown
[![OpenSoyce Trust](https://opensoyce.com/badge/freewho99/opensoyce/posture.svg)](https://opensoyce.com/projects/freewho99/opensoyce/trust)
```

- The image is the badge.
- The link target is the Trust Dashboard page (the source of truth for the posture).
- The badge text is the posture label (`USE READY` / `WATCHLIST` / `RISKY` / `GRAVEYARD`) — same fixed vocabulary as the Dashboard.
- The badge color matches the Dashboard's posture-color mapping (no new colors invented).

### 2.3 Anti-forgery constraints

The badge must satisfy three constraints to remain honest:

1. **The badge URL is canonical.** The badge image renders only from `https://opensoyce.com/badge/<owner>/<repo>/posture.svg` (or a versioned equivalent). Self-hosted badge images that look the same but live on a third-party host are not "OpenSoyce badges" — they are screenshots.
2. **The badge degrades honestly.** If the repo has no recorded posture (e.g., not yet scanned), the badge renders `NOT EVALUATED` — not "GREEN", not "USE READY", not blank. A repo with no record gets a badge that says so.
3. **The link survives the image.** Clicking the badge image always goes to the live Trust Dashboard URL. If the dashboard URL changes (route rename, etc.), the badge URL responds with a 301 to the new path. The trust record stays reachable even after the badge image has been cached for months.

### 2.4 Public URL shape

| URL | Purpose | Constraint |
|---|---|---|
| `/badge/<owner>/<repo>/posture.svg` | Current posture badge image (SVG) | Stable. No query-string variants in v0 (no `?style=flat`, no `?theme=dark`). Single canonical shape. |
| `/projects/<owner>/<repo>/trust` | Existing Dashboard route (link target) | Unchanged from Phase 1. |
| `/badge/<owner>/<repo>/posture.json` | Same posture data, JSON form | For machine consumers that want the badge data without the SVG render. |

The `/badge/` route family is new. Adding it requires a route-registration PR in the implementation arc; it is NOT pre-authorized here.

### 2.5 Anti-forgery vs anti-fabrication

Two distinct concerns:

- **Anti-forgery** — preventing a third party from rendering a fake "USE READY" badge for a repo they don't own. Addressed by §2.3 (URL is canonical; self-hosted screenshots are not OpenSoyce badges; the link target is the source of truth).
- **Anti-fabrication** — preventing OpenSoyce itself from rendering a posture the trust record cannot back. Addressed by reusing the Dashboard's posture vocabulary and the Dashboard's static MVP data (today, only `freewho99/opensoyce` has a posture; every other repo renders `NOT EVALUATED`).

Both concerns are in scope. The implementation sketch picks specific mechanisms.

### 2.6 Out of scope for badge

- No badge for non-public repos.
- No badge for hosted services (only source repos).
- No badge that asserts anything beyond posture (no "100% SOC 2 compliant" badges, no "0 vulnerabilities" badges, etc.).
- No badge customization (no `?color=blue`, no `?style=plastic`, no logo upload).
- No analytics on badge views (would require third-party JS execution from the badge URL, which the rendering model forbids).
- No signed payloads / cryptographic signatures in v0. The anti-forgery model relies on canonical URL + honest degradation. Cryptographic signatures are queued behind their own ADR if the canonical-URL approach proves insufficient.

## 3. CLI or Badge first?

### 3.1 The decision

**CLI first. Badge second.**

### 3.2 Why CLI first

Three reasons.

**Reason 1 — Discovery via the CLI is more direct than via the badge.** A developer running `npx opensoyce check left-pad` sees the trust record in their terminal in seconds. A maintainer adding a badge to a README publishes the trust record to every reader of that README — but they have to know the badge exists, decide to add it, and convince themselves it isn't marketing fluff. The CLI builds the developer relationship that the badge later capitalizes on.

**Reason 2 — The badge depends on the per-repo trust posture being available for arbitrary repos.** Today the Dashboard is single-repo MVP. The badge is only honest when it can render `NOT EVALUATED` for unscanned repos and a real posture for scanned ones. That requires either the Dashboard to support multi-repo (a Phase 5+ concern overlapping with Trust Vault scope) or a separate badge-data store. CLI does not have this dependency — it can ask the live gate API about any package today.

**Reason 3 — CLI failures are recoverable; badge failures are public.** A CLI bug in v0 affects one developer's terminal session. A badge bug in v0 misrepresents a repo's posture in every reader's view of the README. Shipping CLI first lets us learn the consume-not-orchestrate boundaries in a lower-blast-radius surface.

### 3.3 Why not both in parallel

The Phase 4 closeout (§8) requires both surfaces to ship for the phase to close. Shipping both in parallel risks neither closing — the badge waits on multi-repo posture, the CLI waits on the badge, both PRs sit open. Sequential shipping closes the surface that is ready (CLI) and gives the badge a clearer dependency surface to build against.

### 3.4 Order of implementation PRs (per §7)

1. CLI sketch (architecture-only sub-sketch, follows the existing sketch-before-implementation discipline)
2. CLI v0 implementation
3. CLI closeout
4. Badge sketch
5. Badge v0 implementation
6. Badge closeout (also the Phase 4 closeout)

Six PRs total. The badge sketch in step 4 may surface a multi-repo dependency that blocks step 5; if so, step 5 waits and Phase 4 stays "Now" until the dependency resolves. This is the honest sequencing.

## 4. What reuses existing Gate / Dashboard / Trust Center / Timeline data

### 4.1 Reused (must, not may)

| Reuse target | Used by | Why mandatory |
|---|---|---|
| `/api/compliance-gate` endpoint | CLI `check`, `lockfile`, `why` | The CLI must not run a parallel gate. Doctrine rule 1. |
| `TrustProofAnchor` shape from `src/data/openSourceTrustCenter.ts` | CLI evidence output, badge JSON output | Same evidence vocabulary across all surfaces. |
| Posture labels (`use-ready` / `watchlist` / `risky` / `graveyard`) | CLI `trust` command, badge SVG text | Same fixed vocabulary, no CLI-only labels, no badge-only labels. |
| Posture color mapping from `src/pages/RepoTrustDashboard.tsx` | Badge SVG render | Same visual identity; the badge is the Dashboard distilled. |
| Timeline event taxonomy + Timeline data | CLI `timeline`, CLI `why` (event lookup) | Same event types and same event store. No CLI-only event types. |
| Trust Center anti-marketing banned vocabulary | CLI strings, badge SVG copy, README documentation | The launch-copy doctrine extends to every Phase 4 output surface. |
| Phase-3 banned vocabulary | Same | Carried forward. |
| Soft-banned verbs (with word-boundary semantics) | CLI strings near references to `/opensource-trust` | Carried forward. |
| `visibility` field guard | CLI evidence shape, badge JSON shape | Private-evidence scope creep stays blocked; CLI and badge are public surfaces only. |

### 4.2 Separate (CLI/badge gets its own thing)

| Separation target | Why separate |
|---|---|
| CLI command vocabulary | `check` / `lockfile` / `trust` / `timeline` / `why` are CLI-specific surface names. No analog in the Trust Center. |
| Exit codes | The CLI maps gate actions to exit codes; the web surfaces do not have exit codes. |
| `/badge/<owner>/<repo>/posture.svg` route family | New route family for Phase 4. Implementation PR registers; sketch authorizes shape only. |
| Badge SVG rendering pipeline | New code path. Reuses posture vocabulary + color map but not the React render of the Dashboard. |
| CLI v0 distribution channel (npm) | The web spine has no analog. |

### 4.3 Not reused (intentional gaps)

- **Repo Trust Dashboard React rendering** — the badge does NOT screenshot the Dashboard. It renders SVG from the posture data. Screenshots would couple the badge to the Dashboard's layout decisions.
- **Trust Center page** — neither CLI nor badge embeds Trust Center copy. The CLI surfaces evidence; the badge surfaces posture; both link to the Trust Center for the human-readable narrative.
- **Candidate-pipeline arc** — Phase 4 does NOT consume candidate-pipeline data. The candidate-pipeline is a parallel ingest arc; CLI/badge are read surfaces over the trust spine. Crossing the two is a separate ADR.

## 5. Badge copy and README constraints

### 5.1 Default badge copy

Per §2.2, the badge text is the posture label. No verbs, no decoration, no "OpenSoyce certified" framing.

| Posture | Badge text | Color (from existing Dashboard mapping) |
|---|---|---|
| `use-ready` | `OPENSOYCE: USE READY` | emerald-500 on bottle |
| `watchlist` | `OPENSOYCE: WATCHLIST` | yellow-400 on bottle |
| `risky` | `OPENSOYCE: RISKY` | soy-red on white |
| `graveyard` | `OPENSOYCE: GRAVEYARD` | soy-bottle on white |
| _no posture on record_ | `OPENSOYCE: NOT EVALUATED` | soy-label on bottle |

The `OPENSOYCE:` prefix is mandatory. The badge cannot be repurposed as "USE READY" without naming OpenSoyce as the source.

### 5.2 README copy constraint

The badge ships with **recommended README markdown** in the badge route's documentation. The recommended markdown is the only README copy this ADR authorizes:

```markdown
[![OpenSoyce Trust](https://opensoyce.com/badge/<owner>/<repo>/posture.svg)](https://opensoyce.com/projects/<owner>/<repo>/trust)
```

The recommended copy does NOT include adjectives ("the leading", "trusted by", "certified"). The link text alt is literal: "OpenSoyce Trust".

Repos that adopt the badge are free to add their own copy around it. OpenSoyce is not responsible for downstream README rewording. But OpenSoyce's *own* recommendation must satisfy the Trust Center's banned-substring vocabulary. The implementation enforces this with a hygiene test over the recommended-copy block in the badge route's documentation.

### 5.3 Detachment behavior

If a README references a badge URL that no longer renders (route rename, server down, etc.):

- The image alt-text (`OpenSoyce Trust`) remains, so screen readers and crawlers see a literal name.
- The link target points to the Dashboard URL, which OpenSoyce commits to preserving (per §2.3 rule 3).
- A reader who clicks the broken badge image still lands on a real Trust Dashboard page.

The badge can break visually without breaking the trust record's reachability. That asymmetry is the doctrine rule 2 in action.

### 5.4 What badge copy is NOT allowed to say

The badge SVG text and the recommended README copy must not contain (case-insensitive):

- `SOC 2`, `SOC2`, `Vanta`, `Drata`
- `enterprise compliance`, `continuous monitoring`, `compliance certified`, `audit-ready`
- `coming soon`, `we will`, `roadmap`, `planned for`, `in development`
- `zero noise`, `noise-free`, `false-positive elimination`
- `drop-in`, `auto-fix`, `auto-replace`, `autonomous agent`, `agentic`
- `Learn more`, `Discover`, `Explore`, `Unlock` near `/opensource-trust` (word-boundary)
- `certified`, `verified` (broader than the Trust Center bans; new for Phase 4 because these read as third-party stamps OpenSoyce has not earned)
- `secure`, `safe` as standalone adjectives on the badge itself (a posture is a record, not a safety claim)

The Phase 4 implementation extends `OPEN_SOURCE_TRUST_CENTER_PHASE_3_LAUNCH_BANNED_SUBSTRINGS` (rename to phase-agnostic vocabulary or add a sibling Phase 4 constant — implementation sketch picks) and wires the new entries into the existing hygiene test.

## 6. What is explicitly NOT shipped (Phase 4)

This sketch defines Phase 4 as **OSS Distribution: CLI + Trust Badge**, narrowly. The following are explicitly out of scope for the entire Phase 4 arc:

### 6.1 Phase 5+ scope stays untouched

- No Trust Vault. No auth-gated CLI commands. No private evidence reads.
- No VEX statement ingestion. The CLI does not consume VEX. The badge does not reflect VEX-modified postures.
- No reachability analysis.
- No sandbox behavioral telemetry.

### 6.2 Phase 7+ scope stays untouched

- No remediation drafts. The CLI never proposes a fix. The CLI never opens a PR.
- No `opensoyce fix` / `opensoyce upgrade` / `opensoyce replace` commands.
- No drop-in replacement engine. No badge variant that asserts "auto-fix available".

### 6.3 Phase 8 scope stays untouched

- No compliance exports. No CLI command that emits Vanta / Drata / SOC 2 evidence packages.
- No badge variant for compliance posture.
- No banned-substring vocabulary lifted (Phase 4 does not ship the underlying capability).

### 6.4 Cross-cutting non-shipments

- No `threat_feed` activation by the CLI.
- No candidate-pipeline merge into CLI evidence.
- No `hn-exploits-log.json` cleanup.
- No new gate-handler code. No new detectors. No new patterns.
- No persistence layer changes.
- No auth.
- No write actions of any kind.

### 6.5 Surface-shape non-shipments

- No CLI plugin system. The CLI is a fixed command set in v0.
- No CLI config file (`.opensoycerc`). The CLI is stateless in v0.
- No CLI shell completion in v0 (queued behind the v0 closeout if there is real demand).
- No badge with embedded analytics.
- No badge with cryptographic signatures in v0 (anti-forgery via canonical URL + honest degradation).
- No badge for non-public repos.
- No multi-subject Trust Center support added by Phase 4. The badge consumes whatever the Dashboard exposes; if the Dashboard is single-repo at Phase 4's start, the badge is single-repo at Phase 4's start, and multi-repo is its own future scope.

## 7. Implementation PR sequence

Phase 4 splits across **six PRs**, three per surface, plus this sketch. Each PR requires its own user approval. None is pre-authorized.

### 7.1 CLI track (ships first)

| PR | Title shape | Scope |
|---|---|---|
| PR-A1 | `docs(distribution): sketch CLI architecture` | Sub-sketch detailing CLI commands, flags, exit-code mapping, evidence model in detail, distribution channel decision (npm primary; secondary channels queued). Docs only. |
| PR-A2 | `feat(distribution): add CLI v0` | Adds the CLI source (likely `cli/` or `packages/cli/`), the npm package config, the structural-invariants test, and the hygiene test extension. No web surface changes. |
| PR-A3 | `docs(distribution): close out CLI v0` | Phase-progress doc; not a phase closeout. Records what CLI shipped, what is deferred, what unblocks Phase 4 closeout. |

### 7.2 Badge track (ships second)

| PR | Title shape | Scope |
|---|---|---|
| PR-B1 | `docs(distribution): sketch Trust Badge architecture` | Sub-sketch detailing the SVG render pipeline, the `/badge/...` route registration, the `NOT EVALUATED` degradation, the cache-control headers, the hygiene-test extension. Docs only. |
| PR-B2 | `feat(distribution): add Trust Badge v0` | Adds the badge route, the SVG render, the JSON sibling route, the recommended-README documentation block, the hygiene-test extension. No CLI changes. |
| PR-B3 | `docs(distribution): close out Phase 4 OSS Distribution` | Phase 4 closeout. Records both surfaces, updates roadmap (Phase 4 Now → ✅ Closed, Phase 5 Later → Now), lists what is still deferred. |

### 7.3 Branching / blocking rules

- PR-A2 cannot ship without PR-A1 merged.
- PR-A3 cannot ship without PR-A2 merged AND CLI verified in production.
- PR-B1 may begin sketching once PR-A1 merges (parallel sketch work allowed for the badge while CLI implementation lands).
- PR-B2 cannot ship without PR-B1 merged AND the multi-repo-Dashboard dependency resolved (or explicitly waived in PR-B1 via "v0 ships single-repo, multi-repo is its own future PR").
- PR-B3 cannot ship without PR-A3 AND PR-B2 verified in production.

## 8. Phase 4 closeout criteria

Phase 4 closes when **all** of the following are true and recorded in the closeout doc (PR-B3 above):

### 8.1 Surfaces

- [ ] `opensoyce` CLI is installable via npm and `npx`. `opensoyce check <pkg>` returns a real gate result.
- [ ] `https://opensoyce.com/badge/<owner>/<repo>/posture.svg` renders an SVG for the MVP focus repo (`freewho99/opensoyce`) and `NOT EVALUATED` for any other owner/repo.
- [ ] `https://opensoyce.com/badge/<owner>/<repo>/posture.json` renders the same posture data in JSON.
- [ ] The badge image's link target resolves to the existing `/projects/<owner>/<repo>/trust` Dashboard.

### 8.2 Hygiene tests

- [ ] CLI source directory is in `LINKING_PAGES` (or has a parallel hygiene suite) enforcing all banned-substring vocabularies on every CLI string near `/opensource-trust` references.
- [ ] Badge SVG render pipeline is hygiene-tested for default copy, posture-label substitution, `NOT EVALUATED` degradation, and the recommended README block.
- [ ] Every Phase 4 PR passed `npm run test:ci` with no relaxation of prior phase invariants.
- [ ] Phase-3 banned vocabulary is fully enforced on Phase 4 surfaces; Phase 4 may add new entries but lifts none.
- [ ] `visibility` field guard still active. No CLI or badge surface has a `visibility` field.

### 8.3 Doctrine

- [ ] The CLI does not run a local gate. (Verified by reading the source; asserted by test if practical.)
- [ ] The badge does not embed a self-contained claim. The image alt text contains only the literal "OpenSoyce Trust" name; the posture only appears in the SVG render fetched from the canonical URL.
- [ ] Neither surface invents a new `proofAnchor.proofType`.
- [ ] Neither surface invents a new posture label.
- [ ] Neither surface invents a new Timeline event type.

### 8.4 Documentation

- [ ] Phase 4 closeout doc (PR-B3) lists PRs, SHAs, what shipped, what is deferred, what unblocks Phase 5.
- [ ] Roadmap doc updates Phase 4 from "Now" to "✅ Closed" and Phase 5 (Trust Vault) from "Later" to "Now" — in the same PR.
- [ ] Legacy SOC 2 deferral (`docs/architecture/legacy-soc2-copy-deferral.md`) remains untouched; the Phase 4 closeout explicitly carries the TODO ID forward.

### 8.5 What Phase 4 closeout does NOT include

- The closeout does not authorize Phase 5 implementation. It only moves Phase 5 to "Now" in the roadmap.
- The closeout does not lift any banned-substring entry. SOC 2 / Vanta / Drata / compliance-certified all remain banned. Drop-in / auto-fix / autonomous-agent all remain banned.
- The closeout does not promise CLI plugin support, badge customization, or any v1 features.
- The closeout does not declare "OpenSoyce is now widely adopted" or any adoption claim the deployed surfaces cannot back.

## 9. What this sketch does NOT do

Final discipline list. Every guardrail the user named, plus the structural ones.

- Does not authorize any implementation PR. PR-A1 (CLI sub-sketch) is the recommended next step, and even it requires explicit user approval.
- Does not change `src/`, `scripts/`, `package.json`, `e2e/`, or any other code path.
- Does not register any new route.
- Does not add any new linking page to the hygiene test.
- Does not lift any entry from `OPEN_SOURCE_TRUST_CENTER_BANNED_SUBSTRINGS`, `OPEN_SOURCE_TRUST_CENTER_FUTURE_TENSE_TELLS`, or `OPEN_SOURCE_TRUST_CENTER_PHASE_3_LAUNCH_BANNED_SUBSTRINGS`.
- Does not change the legacy SOC 2 deferral (`LEGACY_SOC2_COPY_DEFERRAL` stays OPEN, gated to Phase 8).
- Does not touch the candidate-pipeline arc.
- Does not touch the `threat_feed` ADR.
- Does not authorize the `hn-exploits-log.json` cleanup.
- Does not promote Phase 5+ scope into Phase 4.
- Does not introduce CLI plugin scope, badge customization scope, or drop-in replacement scope.
- Does not introduce AI-agent / agentic framing in any Phase 4 surface.

## 10. Status

**Proposed.** Awaiting explicit user decision before any sub-sketch begins.

Docs only. No application code, no route changes, no link wiring, no copy changes, no test changes, no banned vocabulary lifted.

Recommended sub-sketch after this ADR:

**PR — `docs(distribution): sketch CLI architecture`** (per §7.1, PR-A1)

Recommended, not pre-authorized. The user calls "approve CLI sub-sketch" before any work begins.

---

> The CLI reads the trust record.
> The badge points to the trust record.
> Neither replaces the trust record.
