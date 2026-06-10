# OpenSoyce Strategy Update — After PR-7C

Status: strategy doctrine (user-authored, 2026-06-10)
Scope: docs-only. This document changes direction, not code. No claims expand until the lanes it names actually ship.

## Where the repo stands

The observation ingestion lane is complete and packaged:

```txt
11. Local CLI observation          PR-7A / 1b3b30b
12. CI-attributed observation      PR-7B / 107d941
13. Server-side semantic dedupe    PR-7C / 7928c9f
14. CI-native packaging            PR-7D / 66f9029
```

7C shipped the correct long-term trust-record shape:

```txt
one stable dependency-exposure fact
  + repeat-observation metadata (seen_count, first_seen_at, last_seen_at)
  + latest/bounded provenance (original source_ref preserved, latest_source_ref updated)
  + upsert-touch over unique-reject
```

```txt
Observation is not judgment.
Repetition is not new evidence.
Provenance must not be erased.
```

Operational gate that still stands: migration 0021 must be applied to prod Supabase before ingestion is used again, or dependency-exposure creates will 503.

## Strategic correction 1 — SOC 2 evidence is a first-class adoption lane

SOC 2 evidence support is not a late marketing add-on. Buyers ask:

- Do you have a controlled process for vulnerability management?
- How do you track exceptions?
- Who approved accepted risk?
- How do you prove remediation decisions?
- What evidence can be shown to auditors or customers?

OpenSoyce should not claim "we make you SOC 2 compliant."

OpenSoyce should claim:

> OpenSoyce produces audit-ready evidence for software-component trust, vulnerability review, exception approval, remediation decisions, and customer/security review workflows.

The do-not-claim firewall in `architecture-manifest.md` ("OpenSoyce is SOC 2 ready" / "OpenSoyce replaces Vanta or Drata") continues to govern public copy until the 14B and 17 lanes actually ship. Direction is authorized; claims are not.

## Strategic correction 2 — remediation comes back, as a question loop

The original canonical Phase 7 idea — Remediation Drafts — remains strategically important even though the PR-7x labels became the ingestion lane (ledger steps 11–14).

Remediation returns as a controlled **Remediation Question Loop**, not auto-remediation:

```txt
The scanner observes.
The system asks the remediation question.
The human decides.
The record remembers.
```

## Updated forward roadmap

```txt
14   CI-native packaging                          SHIPPED (PR-7D)
14B  SOC 2 evidence map / audit-readiness rider   map records to SOC 2-style
                                                  control/evidence questions
                                                  WITHOUT claiming compliance
15A  Scanner + vulnerability-intelligence          OSV, GHSA, CVE, scanner
     observations                                  findings, malicious-package
                                                  signals, license risk —
                                                  ingested as OBSERVATIONS
15B  Remediation Question Loop                     vulnerability observations →
                                                  reviewable decisions: fix,
                                                  defer, except, reject,
                                                  owner-review, not applicable
15C  Broader ecosystems / SBOM                     pnpm, yarn, poetry, uv,
                                                  CycloneDX/SPDX, scanner/SBOM
                                                  input formats
16   Lifecycle / reaper                            expiry, stale exposure,
                                                  resolved exposure, overdue
                                                  remediation, exception
                                                  review pressure
17   Enterprise evidence exports                   SOC 2 evidence bundle,
                                                  auditor packet, customer-
                                                  security-review packet,
                                                  Vanta/Drata-style export
18   Trust agent                                   drafts recommendations,
                                                  evidence summaries,
                                                  remediation options, review
                                                  prompts; NEVER decides
```

Each lane still requires its own explicit scope block before any implementation begins. The 18-step build ledger remains the canonical working frame; the 9-phase roadmap in `docs/architecture/open-soyce-roadmap-integration.md` remains the strategic roadmap.

## Positioning

Category sentence:

> OpenSoyce is the system of record for software-component trust decisions.

Adoption sentence:

> OpenSoyce gives engineering, security, and compliance teams a provable record of how software-component risks were observed, reviewed, remediated, excepted, and exported for audit.

Top-dog sentence:

> OpenSoyce turns software supply-chain noise into provable trust decisions.

## Key product artifact — the Trust Decision Artifact

One view per component that shows:

- Component
- Observation history
- First seen / last seen
- seen_count
- source refs
- vulnerability / risk signals
- remediation question
- proposed action
- reviewer decision
- exception status
- expiration
- evidence
- timeline
- export proof

The 7C columns are its observation spine. The Phase 6 loop is its decision spine. Lane 17 is its export spine.

## Operating rule

Every new feature must improve one of four things:

```txt
1. More observations enter cleanly.
2. Less noise reaches the reviewer.
3. Decisions become easier to make.
4. Proof becomes easier to show.
```

If a proposed feature improves none of the four, it does not belong in the product.
