# Enterprise Trust Narrative

## The Problem

Open-source enters production faster than organizations can reason about trust.

A modern software organization ingests thousands of open-source packages, dozens of GitHub Actions, and a continuously shifting set of maintainers, registries, and release pipelines. Most of those decisions happen automatically. Most of them are never reviewed.

Open-source risk is no longer only a vulnerability problem.

It is a trust-decision problem.

## The Buyer Pain

Security teams are being asked to answer board-level and compliance-level questions about software supply-chain trust:

- What open-source code are we shipping?
- Which dependencies are allowed?
- Which workflows can release artifacts?
- What happens when known risk is accepted?
- Can we prove the decision later?

These questions cannot be answered by a CVE count. They require a record of decisions, with evidence, that survives an audit.

Today, most teams answer those questions by exporting screenshots from three different tools, attaching them to a Confluence page, and hoping the auditor accepts the narration. That is not a trust system. That is a trust theater.

## Why Existing Tools Are Not Enough

Traditional scanners find vulnerabilities. That work is real, and it is necessary.

It is also not sufficient.

A scanner answers: does this package have a known advisory?

A trust system has to answer: should this code be allowed into our software under our policy, with what evidence, by what authority, until when, and how do we prove it later?

The gap between the two questions is where supply-chain incidents live.

## The Category Shift

OpenSoyce is not only a scanner.

OpenSoyce is a trust decision layer.

It sits between the dependency / workflow inputs an organization actually consumes and the policy outputs the organization actually has to defend. Scanners feed the bottom of that layer. Policy feeds the top. OpenSoyce makes the layer between them legible.

## The OTS Loop

Detect → Decide → Explain → Act → Record → Prove.

Each verb maps to a real surface in the product:

- **Detect.** Live repo signals, OSV advisory overlay, package and workflow pattern detection.
- **Decide.** Configurable policy evaluation against verdicts, licenses, and detected patterns.
- **Explain.** Per-pattern evidence rows naming the signal source, severity tier, and confidence.
- **Act.** Block, warn, allow, or open an exception. Workflow-aware so the action can target a specific job or step.
- **Record.** Exceptions persist with reviewer identity, expiry, reason. Signed where signing is configured.
- **Prove.** Replays against cited public incidents. Coverage status visible on every catalog entry.

A single open-source decision flows through all six. None of them are hidden from the buyer.

## What OpenSoyce Does

- Detects package and workflow risk patterns against real repository inputs.
- Overlays OSV advisory intelligence for day-0 vulnerability signal.
- Scans `.github/workflows/*.yml` files in the target repository and emits findings down to the exact job and step.
- Separates catalog coverage from gate enforcement, in public, on every pattern.
- Applies configurable policy with per-package and per-license tier rules.
- Records signed, time-boxed exceptions with reviewer identity.
- Produces replay evidence against named public supply-chain incidents.

Every one of those items is a surface a buyer can inspect today. The proof package names the gaps where coverage is still partial.

## Why Honesty Is The Product

The first concrete proof artifact in this package is the verbatim gate evidence for `ua-parser-js@0.7.29`.

Five real advisories surfaced. One pattern fired. Default policy returned ALLOW.

The product said so.

A trust system that quietly reshapes its own evidence to produce a tidier story is not a trust system. It is a marketing surface. The decisions it produces will not hold up when an auditor, a board, or a regulator asks for the reasoning trail.

OpenSoyce publishes the reasoning trail before the buyer asks for it.

> OpenSoyce does not promise that every risk becomes a block.
>
> It promises that every risk decision becomes explainable.

That is the line that separates this product from the category.

## Enterprise Outcome

Teams get fewer vague red badges and more defensible decisions.

Security leaders get a record they can present to the board. Compliance teams get evidence they can attach to an audit. Engineering teams get policy outcomes that say "this dependency is allowed under this rule until this date" instead of "good luck."

The result is not a smaller risk surface. The risk surface is what it is.

The result is a smaller decision surface. Fewer ad-hoc judgement calls. Fewer Slack threads about whether a package is safe enough. Fewer auditor follow-ups asking who approved a dependency in 2024.

## What This Requires Of OpenSoyce

To earn the enterprise role, the product holds itself to four standing rules:

1. **Catalog reflects reality.** A pattern is labeled `gate-active`, `catalog-only`, `roadmap`, or `fixture-only` according to whether the gate actually fires it on real signals today. The ratio is public.
2. **Evidence is named.** Every pattern emission carries its signal source. Every policy decision carries its reason.
3. **Exceptions are recorded, not absorbed.** Risk can be accepted. Risk cannot disappear.
4. **Proof is replayable.** The product runs against cited public incidents, in the open, on a page anyone can read.

Those four rules constrain what OpenSoyce is allowed to claim. They are also what makes the claims hold.

## Strong Close

OpenSoyce helps organizations ship software with trust decisions they can inspect, explain, and defend.

It does not sell fear.

It does not invent risk where there is none.

It does not erase risk where the policy chose to accept it.

It builds a record — pattern by pattern, package by package, workflow by workflow — that the organization can stand behind the next time someone asks how the decision was made.

That record is the product.
