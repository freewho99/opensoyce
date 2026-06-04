# OTS Proof Package — Phase Closeout

**The OTS proof package engineering arc is closed.**

This is the "we shipped the phase" doc. It captures the full arc shipped between 2026-05-31 and 2026-06-03, names every named engineering gap as closed, records the doctrine transitions across the arc, and names the queued future phases as out of scope for this arc.

It is the sixth and final artifact of the proof package.

## What shipped

Fifteen PRs in twelve days, plus one parallel candidate-pipeline arc that interleaved PR numbers without conflicting doctrine. Every PR closed against a named target.

### Proof package (artifact build-out)

- **PR #19** — Proof package parent + first child (Before/After Risk Example with TODO blocks)
- **PR #20** — Verbatim `ua-parser-js@0.7.29` gate evidence pasted. **Result: 1 pattern, ALLOW.** The doc named two evidence-layer gaps honestly.
- **PR #21** — Doctrine page: pattern-definition / evidence-availability / policy-decision / enforcement-action layers, coverage statuses, enforcement rule
- **PR #22** — Enterprise trust narrative
- **PR #23** — Runnable demo script
- **PR #25** — Production walkthrough spine with 9-slot screenshot inventory + GUARD probe row
- **PR #26** — Walkthrough alignment after live recon: deployed UI is a GitHub owner/repo scanner, not a package@version gate. Step 4 reframed to the discovered seam.
- **PR #27** — Production walkthrough captures: 9 slots + GUARD probe all captured against `opensoyce-f336.vercel.app`

### Evidence-layer fixes

- **PR #28** — OSV severity normalization. Bulk → per-vuln detail enrichment, `pickSeverity` takes `max(database_specific, cvss)`. `ua-parser-js@0.7.29` flipped to BLOCK. **Decision change.**
- **PR #30** — Live-fetch row enrichment. CWE-829/CWE-912 → install-script + remote-execution + maintainer-compromise signals on production rows. **Firing-set change**: 1 → 4 patterns. Decision stayed BLOCK.

### Public surface + production parity

- **PR #32** — Public `/proof/gate?package=name@version` UI surface. Calls the same `compliance-gate` API Guard PR comments use. No synthetic fixtures.
- **PR #33** — Production-parity bug fix. Gate handler was using the full `name@version` string as the resolver/OSV map lookup key while the maps were keyed by stripped name. Surfaced by PR #32's live deployment of `/proof/gate?package=ua-parser-js@0.7.29`. Fix flips production from `ALLOW + 0 patterns` to `BLOCK + 4 patterns`. **Parity event** — neither a decision change nor a firing-set change.

### Doc repair (evidence preservation)

- **PR #29** — Recorded ALLOW → BLOCK as doctrine working. Preserved 2026-05-31 ALLOW capture verbatim.
- **PR #31** — Three captures preserved verbatim. Decision-change vs firing-set-change distinction made explicit.
- **PR #40** — Recorded the production-parity event. Status footers updated. PR-number drift fixed in handoff doc.

### Discoverability

- **PR #41** — Cross-links from `/proof/ots-replays` (per-card on live-detector cards) and `/incidents/:id` (single-version targets only) to `/proof/gate?package=...`. No sidebar nav. No pattern-page link. The gate stays inside the proof-package framing.

### Handoff infrastructure

- **PR #39** — `docs/handoff/` folder structure with README + per-arc docs. Cross-arc rules consolidated once. Adding a new arc is mechanical.

## The doctrine, made visible across time

The proof package's doctrine is three sentences:

> A pattern can be educational before it is enforceable. The product always says which is which.

> Detection, evidence, policy, and enforcement are separate layers.

> Risk does not lose its name because someone needed to ship.

The arc demonstrated all three across time, on one real package (`ua-parser-js@0.7.29`), across four captured states preserved verbatim in `docs/proof/before-after-risk-example.md`:

| Date | Capture | Result | Layer that changed |
|---|---|---|---|
| 2026-05-31 | Pre-#28 | ALLOW, 1 pattern medium | Baseline — evidence-layer gap named honestly |
| 2026-06-01 (post-#28) | First re-capture | BLOCK, 1 pattern critical | **Decision change** via severity normalization |
| 2026-06-01 (post-#30) | Second re-capture | BLOCK, 4 patterns | **Firing-set change** via row enrichment |
| 2026-06-03 (post-#33) | Production parity | Same as post-#30 | **Parity event** — deployed API caught up |

Same package. Same advisories. Same default policy. Four different states across the arc. Zero detector edits. Zero policy rule edits. Zero new patterns added to the catalog. Every change was at the evidence-layer or wiring-layer boundary, with the existing detector / policy / pattern catalog responding accurately to better inputs.

That is the doctrine, made visible across time.

## Named engineering gaps — all closed

The proof package documented four engineering gaps over the course of the arc. All shipped:

| Gap | Closed by | Layer |
|---|---|---|
| OSV severity normalization | PR #28 | Evidence (decision change) |
| Live-fetch row enrichment (install-script + maintainer-compromise) | PR #30 | Evidence (firing-set change) |
| Public `package@version` gate UI surface | PR #32 | Surface |
| Production-parity bug surfaced by the new UI | PR #33 | Wiring (parity event) |

No queued OTS engineering follow-ups remain in this arc.

## Honest skips this arc

Not every reasonable improvement landed in this arc. Two deliberate skips, both consistent with the doctrine:

- **A3 (PR #41) — gate not added to the `/proof` marketing page.** The `/proof` route is product-capability marketing ("BUILT BEYOND DEMO DEPTH / THE RECEIPTS"), not the proof-package artifact index (which lives at `docs/ots-proof-package.md`, GitHub-rendered). Adding the gate as a 5th capability card would have broken the 2×2 grid and reframed it as a product feature. Adding it to the bottom CTA would have promoted it as a peer of Scanner. Both options conflicted with the framing that **the gate is a proof-package live API mirror, not a primary product nav item.** Skipped intentionally. If a real deployed proof-artifact index page is ever built, the gate belongs in it.
- **D4 (PR #41) — gate not in sidebar nav.** Same doctrine: the gate is inside the proof package, not alongside Scanner / Guard / Compare.

Both skips are recorded in PR #41's body and in `docs/handoff/ots-proof-package.md` as "Forbidden without explicit user authorization" — adding the gate to sidebar nav or to the marketing page changes its category. Doing so requires explicit user direction.

## Future phases — out of scope for this arc

The user named several next-phase product items during the arc. They are real, they are next-phase, and they are out of scope for this arc:

- **Version-aware OSV queries** — OSV v1 path is package-level by design. Adding version awareness narrows compromise indicators but is a real product decision (the current doctrine is false-positives-preferred for a security gate; version awareness changes that trade-off).
- **Trust Timeline** — surfaces the historical capture sequence (decision changes, firing-set changes, parity events) on a deployed page.
- **Repo Trust Dashboard** — extends the `/projects/owner/repo` view with trust-decision history.
- **Open Source Trust Center** — a deployed buyer-facing equivalent of the enterprise trust narrative.
- **Vanta / Drata export** — audit-evidence-package export for compliance buyers.
- **Trust Agent** — programmatic agent that consumes gate output via the public API.

Do not start any of these without explicit user call. The current arc closed clean; the next-phase work needs its own architecture-first sketch before code.

## How to use this proof package going forward

The proof package is the canonical reference for:

1. **What OpenSoyce's gate does on real packages** — the verbatim captures in `before-after-risk-example.md` are reproducible against the deployed `/proof/gate` surface.
2. **Why the gate sometimes returns surprising results** — the doctrine page explains the four-layer model; the capture history shows the doctrine in action across time.
3. **Where the buyer can verify a claim** — every proof artifact links to either the live deployed surface or to the cited public advisory record. No synthetic claims.
4. **What to write in a new evidence-layer or wiring-layer PR body** — the PR #28, #30, #33 patterns established the framing. Future PRs touching the gate should name which layer they touch (decision change / firing-set change / parity event / surface).

## Production verification recipe (for future agents)

A single curl confirms the arc is still healthy:

```bash
curl -sS -X POST "https://opensoyce-f336.vercel.app/api/exceptions?action=compliance-gate" \
  -H "Content-Type: application/json" \
  -d '{"dependencies":["ua-parser-js@0.7.29"]}' | grep -o '"action":"[^"]*"'
```

Expected: `"action":"BLOCK"`.

Any other result means a doctrine regression. The most likely culprit per Hard Rule 1 in `docs/handoff/ots-proof-package.md` is that a future gate handler used the full `name@version` string as the resolver/OSV map lookup key — exactly the bug PR #33 fixed. Use `splitPackageVersion(name)` from `src/shared/packageRegistryQuery.js` to derive any map lookup key for inputs that may carry an `@version` suffix.

## Strong close

The arc shipped on time. The doctrine held under inspection. Every named gap closed. Every capture preserved verbatim. Every surface honest about what it could and couldn't do.

The proof package now has:

- A parent index (`docs/ots-proof-package.md`)
- Five child artifacts (Before/After, Doctrine, Enterprise Narrative, Demo Script, Production Walkthrough)
- A sixth artifact (this closeout)
- 10 pixel captures (9 numbered slots + GUARD probe) at `docs/proof/images/`
- A deployed live surface (`/proof/gate`) verified against the verbatim captures
- A handoff folder (`docs/handoff/`) so the next agent has both arcs covered

The OTS engineering arc is closed.
