# OTS Pattern Enforcement Doctrine

## Core Doctrine

A pattern can be educational before it is enforceable.

The product always says which is which.

That doctrine is the credibility engine.

## Why This Doctrine Exists

Open-source trust signals mature at different speeds.

Some can safely block today.

Some should warn.

Some should educate.

Some need more signal infrastructure before enforcement is honest.

A trust product that pretends every catalog entry is gate-active is a trust product that will be wrong in public.

OpenSoyce refuses to be that product.

## The Four Layers

Pattern enforcement is not a single decision. It is four separate layers, each with its own honesty requirements.

1. **Pattern definition.** The catalog entry. Name, severity tier, signal source, policy intent. This is the "what could fire" layer. Defining a pattern does not enforce it.
2. **Evidence availability.** The signal source for that pattern, threaded into a real row at runtime. Some signals are present today (OSV advisory IDs, npm version, license). Some are not (maintainer-compromise hints in the production resolver row). A pattern with no live evidence input is educational, not enforceable.
3. **Policy decision.** What the configured policy does with the patterns that did fire, against the verdicts and licenses returned by the resolver. The same set of fired patterns can produce ALLOW under one policy and BLOCK under another.
4. **Enforcement action.** The actual block, warn, gate-pass, or exception write. This is the only layer the buyer sees first. Every other layer must justify itself before this one fires.

Conflating these four layers is what makes other tools feel either toothless or hysterical. Separating them is what makes OpenSoyce auditable.

## The ua-parser-js Example

The first proof artifact in this package is the verbatim gate evidence for `ua-parser-js@0.7.29` ([Before / After Risk Example](before-after-risk-example.md)).

Five advisories surfaced, including the canonical 2021 supply-chain compromise advisory.

One pattern fired: `known-vulnerability-exposure`.

Default policy returned: ALLOW.

The product said so.

It did not fake a BLOCK to make the story tidier.

## Why That Is Correct

A trust system should not pretend an input exists just because the story wants a BLOCK.

The production resolver row did not carry `row.maintainerCompromise`. So `maintainer-account-compromise-signal` did not fire.

The production resolver row did not carry `row.hasInstallScript`. So `install-time-remote-execution` did not fire.

The OSV severity normalization returned `unknown` for all five advisories. So the score-derived severity fell back to `medium`, and the OSV record's `critical` field stayed `false`.

Those are real, named gaps in the evidence layer. The buyer can see exactly where the next enforcement decision gets added.

That is the doctrine working as designed:

Detection, evidence, policy, and enforcement are separate layers.

Each layer either has the inputs it needs or it does not.

When inputs are missing, OpenSoyce says so, in the same document that shows what did fire.

## Coverage Status

Every catalog entry in `OTS_PATTERN_DEFINITIONS` carries a `coverageStatus` field. Four values. Public on `/patterns`. Honest by design.

- **gate-active** — the pattern fires in production against real signals. Today: 20 of 31 entries.
- **catalog-only** — the pattern is defined and documented, but the gate does not yet receive the signal source it needs. The pattern is educational. The catalog says so.
- **roadmap** — the signal source itself does not exist yet (no AI-agent telemetry, no dev-tool runtime probe). The pattern is a target, not a claim. Today: 11 entries.
- **fixture-only** — the pattern fires only against demo fixtures. The production gate path is held to `allowDemoFixtures: false`.

The `/patterns` page carries a per-pattern badge and a header that reads "X of Y enforced by the gate today." When the ratio changes, the badge changes. Nothing is hidden.

## Enforcement Rule

Risk can be accepted.

Risk cannot disappear.

An exception is the legitimate channel for allowing a blocked package or workflow into production under a documented, time-boxed, reviewer-approved trail. The gate records that the thing is risky. The exception records that the risk was accepted, by whom, for how long, with what reason.

The same input run through the same policy after the exception expires returns to BLOCK.

Risk does not lose its name because someone needed to ship.

## How To Read This Doctrine When Reviewing OpenSoyce

If a buyer, developer, or auditor asks: does OpenSoyce block this?

The correct answer is in four parts:

1. Which patterns fired against the inputs the gate received.
2. Whether the inputs needed for the other catalog patterns are present today.
3. What the configured policy did with the patterns that fired.
4. What enforcement action followed, and whether an exception is in play.

Any answer that collapses those four parts into a single sentence is a marketing answer, not a trust answer.

OpenSoyce sells the four-part answer. That is the product.

## Strong Close

OpenSoyce earns trust by refusing to overclaim.

The catalog says which patterns are enforced today. The proof package shows a real package the gate let through, and why. The enforcement rule says risk gets named even when risk gets accepted.

The doctrine is not a slogan. The doctrine is what makes the rest of the product hold up under inspection.

OpenSoyce is not just finding risk.

OpenSoyce is teaching software teams how to make trust decisions — and how to tell when a trust decision was made honestly.
