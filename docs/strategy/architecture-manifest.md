# OpenSoyce Architecture Manifest

Status: strategic manifest
Scope: index of implemented, approved-next, planned, parked, and do-not-claim architecture items.

## Purpose

This manifest prevents architecture drift by distinguishing what exists from what is planned or parked.

## Status Labels

```txt
implemented:
  Merged and on main.

approved-next:
  Explicitly authorized next PR scope.

planned:
  Strategically agreed, but no implementation authorization.

parked:
  Useful future direction, not current roadmap work.

research:
  Needs validation.

do-not-claim:
  Too speculative, overbroad, or unimplemented.
```

## Implemented

| Artifact | Status | Phase | Source | Purpose |
|---|---:|---|---|---|
| Vault auth + workspace foundation | implemented | PR-V2-A | PR #78 / `5beb8fa` | Auth/session/workspace base |
| Atomic workspace + owner creation | implemented | forward-fix | PR #80 / `34aad06` | Atomic workspace initialization |
| Weakness-to-strength strategy | implemented | strategy docs | PR #82 / `c560468` | Strategic positioning |
| Exception state machine + API | implemented | PR-V2-B | PR #81 / `bc7b5d9` | Exception write lifecycle |
| Private proof anchors + Vault Timeline reads | implemented | PR-V2-C | PR #83 / `3adc0fc` | Private reads / timeline loop |
| CLI workspace mode | implemented | PR-V2-D | PR #84 / `15fc8eb` | Device-code login, `--workspace`, exception list/propose/revoke, atomic CLI v0 lock lift |
| CEI architecture lock-in + v3 addendum | implemented | strategy docs | PR #85 / `34ef316` | Do-not-claim firewall, parking lot, resilience doctrine, v3 enterprise boundaries |
| Vault Dashboard + `/cli-auth` approval | implemented | PR-V2-E | PR #86 / `47f86bc` | Browser approval page + Dashboard shell (workspaces, Trust Expiry table, exception detail w/ reviewer actions, Vault Timeline, evidence detail) |
| Phase 5 closeout | implemented | PR-V3 | PR #87 / `83486c8` | Phase 5 marked COMPLETE; final doctrine; closeout checklist; Phase 6 parked-not-authorized language |
| CEI foundation (native catalog + exposure records) | implemented | PR-6A | PR #93 / `4b3127a` | `component_exposure_types` (6 native, read-only) + workspace-scoped `component_exposures`; migrations 0017/0018; private, RLS deny-by-default |
| Exposure read surface | implemented | PR-6B | PR #94 / `adbb4f2` | Read-only `/vault/:slug/exposures` list + detail inside VaultLayout; GET-only api-client |
| Propose exception from exposure | implemented | PR-6C | PR #95 / `abfe03f` | Two-step review→submit draft via the existing Phase 5 propose endpoint; proposed-only; exposure never mutated |
| CEI-native proposal audit | implemented | PR-6D | PR #96 / `9a3c46f` | `component_exposure_events` (migration 0019); single proposal event kind; additive best-effort recording; `vault_timeline_events` untouched |
| Reviewer-side source-exposure context | implemented | PR-6E | PR #97 / `1a48e84` | Read-only "Source exposure" card on the exception review page; reviewer actions unchanged |
| CEI reviewer-outcome audit | implemented | PR-6F | PR #98 / `da986f4` | Migration 0020 widens event-kind allowlist to 4; approve/reject/revoke additively record the outcome back to the exposure; expired kind deliberately deferred to the reaper scope |
| Phase 6 proposal/audit loop closeout | implemented | PR-6-CLOSEOUT | PR #99 / `578ee18` | Phase 6 loop marked CLOSED; doctrine; demo walkthrough; 6G+ parked-not-authorized language |
| Dependency-exposure ingestion (CLI) | implemented | PR-7A | PR #100 / `1b3b30b` | `opensoyce exposure ingest-dependencies` — package.json / package-lock.json / explicit JSON → dependency-exposure records via the PR-6A create API; dry-run; client-side dedupe; ingestion observes, never decides |
| CI-attributed ingestion | implemented | PR-7B | PR #101 / `107d941` | `--ci --ci-provider --repository --run-id [--job --sha --ref]` on the 7A path; `source_kind: ci`; run-specific source_ref; explicit flags only (no ambient env); attribution-only, no annotations / PR comments |
| Server-side semantic dedupe | implemented | PR-7C | PR #102 / `7928c9f` | Migration 0021: `observation_identity` + `seen_count` + `latest_source_ref` + partial unique index; upsert-touch, not unique-reject; identity = fact (name/version/manager/manifest/class), never source_ref; repetition is quiet, provenance is not erased |
| CI-native packaging (thin wrapper) | implemented | PR-7D | PR #103 / `66f9029` | `actions/ingest-dependencies` composite Action around the 7B CLI command; explicit inputs only (expressions live in the caller's workflow); session-token secret → 0600 session file, removed `if: always()`; no octokit / API / annotations / check runs / comments / policy |
| Vault/CEI production runtime | implemented | PR-RUNTIME-1 | PR #105 / `bc24bb1` | `api/vault.js` Vercel function mounting the existing `registerVaultRoutes` + `/api/vault/:path*` rewrite; fixes production finding #2 (route family was local-only since Phase 5); runtime-presence + 12-function-cap structural guards; band-drop-tick folded (and its dead claim-submit import fixed) |
| Release Integrity Guard | implemented | PR-INTEGRITY-1 | PR #106 / `3da3cf0` | `scripts/check-release-integrity.mjs` — 4 layers (static shape / schema presence / runtime presence / provider config), read-only by construction, target-coherent, strict release-gate mode; see [`release-integrity-guard.md`](./release-integrity-guard.md) |
| Production CEI decision loop proof | implemented | PR-PROOF-1 | PR #107 / `771cabb` | First category artifact: [`production-cei-decision-loop-proof.md`](../proof/production-cei-decision-loop-proof.md) + 7 production screenshots; proof-package artifact #7; honest-edges section; no compliance claims |
| SOC 2 evidence map | implemented | PR-14B | PR #108 / `1035f85` | Doc-level map of trust records to audit-relevant evidence questions — [`soc2-evidence-map.md`](./soc2-evidence-map.md); buyer/auditor language, honest gaps per lane, NO compliance claims; the bridge from proof artifact to evidence exports (lane 17) |
| Vulnerability-intelligence observations | implemented | PR-15A | PR #109 / `5449aae` | Migration 0022 `component_exposure_vulnerabilities` — intel as CONTEXT attached to dependency exposures (Option B: context table, native catalog stays at 6); on-demand OSV version-query association; 7C dedupe discipline; structurally cannot decide anything; closes the evidence-map Q3 seam for the shipped scope |
| Remediation Question Loop | implemented | PR-15B | PR #110 / `1574d15` | Migration 0023 `component_remediation_questions` — the QUESTION layer on observed component risk: opened from a dependency exposure or its attached intelligence; six bounded human directions (fix / defer / propose-exception / not-applicable / owner-review / replace-or-remove); answer-coherence CHECK (no answer without a human); propose_exception routes through the Phase 5 lane (no FK to vault_exceptions); no auto-remediation, no policy engine, no overdue transition (due_at is recorded context; lane 16 owns pressure) |
| Exception expiry reaper + review pressure | implemented | PR-16A | PR #111 / `1d88706` | `reap:exceptions` command (safe-by-default dry-run; `--execute`): guarded `active → expired` touching ONLY state — original reviewer/approval/expiry/reasons/anchors preserved; 0015 trigger emits `exception_expired` (NULL actor) transactionally; migration 0024 adds `exception_expired_from_exposure` (the kind 6F deferred) + actor-nullable-for-expired-only CHECK + one-expired-event-per-exception unique index; read-time "review due ⚠" on active-past-window rows; expired ≠ revoked ≠ renewed ≠ remediated — see [`expiry-reaper-doctrine.md`](./expiry-reaper-doctrine.md) |
| Expired trust reviewer resolution | implemented | PR-16B | PR #112 / `118f519` | Migration 0025 `vault_exception_resolutions` — the expired exception as a REVIEW CASE: append-only reviewer-authored resolutions (`resolved_by` NOT NULL — no system resolution), six bounded directions (renew / revoke / remediation-required / resolved-externally / defer / remediation-question), required reason, citation-coherence CHECK (renew cites a NEW proposal from the existing Phase 5 lane — no revive, no silent extension; the module structurally cannot write `vault_exceptions`); own route registrar; reviewer-role gated; defer keeps the case revisitable |
| Production full-chain evidence export proof | implemented | PR-PROOF-2 | this PR | Second category artifact: [`production-full-chain-evidence-export-proof.md`](../proof/production-full-chain-evidence-export-proof.md) + artifacts under `docs/proof/artifacts/pr-proof-2/` (the verbatim bundle + reaper receipts) — `lodash@4.17.20` observed → 5 OSV advisories → question answered → BLOCK→WARN approved with short expiry → expired by clock time → reaped (system actor) → resolved twice (append-only, honest edge) → exported with all 9 sections present; accelerated, not fabricated: purpose-built is allowed, backdating and DB hacking are not; proof-package artifact #8 |
| Remediation evidence loop proof | implemented | PR-PROOF-3 | this PR | Third category artifact: [`remediation-evidence-loop-proof.md`](../proof/remediation-evidence-loop-proof.md) + artifacts under `docs/proof/artifacts/pr-proof-3/` — the PROOF-2 chain continued on prod: `remediation_required` direction → derived case `awaiting_evidence` → REAL follow-up CLI ingest of lodash@4.17.21 (exposure `28f6c108`) → human-cited evidence `eccefc1a` recorded through the deployed runtime → derived case `evidence_recorded` → first TEN-section production bundle, `missing: []`; exception still expired, resolutions untouched — the case moved because the record grew, not because anything was edited; proof-package artifact #9 |
| Fix Evidence Loop: remediation evidence | implemented | PR-16C | PR #117 / `ba72254` | Migration 0026 `component_remediation_evidence` — append-only human-cited evidence on a `remediation_required` case: evidence_ref REQUIRED by CHECK ("evidence without a reference is a claim, and a claim cannot close the loop"), 4 evidence-based types (fixed-version-observed / pr-or-commit / rescan-no-longer-matches / manual-note), `recorded_by` NOT NULL (no system evidence), chain citations validated never created; the CASE is DERIVED (direction opens it, evidence marks it `evidence_recorded`) — no historical record mutated, no verdict vocabulary anywhere; export gains section 8 after the reviewer direction; doctrine: not "we fixed the vuln" — "we recorded evidence that the human says closes the remediation loop" |
| Production Trust Record API + webhook proof | implemented | PR-PROOF-5 | this PR | Fifth category artifact: [`trust-record-api-webhook-proof.md`](../proof/trust-record-api-webhook-proof.md) + redacted receipts under `docs/proof/artifacts/pr-proof-5/` — Bearer lifecycle on prod (mint→200 reads→writes 401 by routing→cross-workspace 404→bogus 401→revoke immediate) + ONE signed `remediation_evidence.recorded` delivery captured at a one-time user-authorized endpoint and HMAC-verified with independent local crypto; direction/evidence separate on the wire; no secrets in artifacts; `b777fb25` untouched; core claim: "trust records are now portable — without creating new trust conclusions or mutating historical records"; proof-package artifact #11 |
| Production evidence citation check proof | implemented | PR-PROOF-6 | this PR | Sixth category artifact: [`evidence-citation-check-proof.md`](../proof/evidence-citation-check-proof.md) + artifacts under `docs/proof/artifacts/pr-proof-6/` — first prod citation check: `internal_exposure_reference` on evidence `eccefc1a` → `check_passed` (cited 28f6c108 lodash@4.17.21 exists in-workspace, {different, comparable, later} vs 4.17.20), summary carries "this does not claim the vulnerability is fixed"; FIRST 11-section production bundle (missing:[], direction/evidence/check distinct); packet composed the check via the shared path; certification sweep clean; b777fb25 untouched; proof-package artifact #12 |
| Trust Agent evidence drafter | implemented | PR-18A | this PR | Migration 0029 `agent_evidence_drafts` — append-only suggestion records: 5 kinds (remediation-evidence-suggestion w/ prefill, trust-record / packet / gap / citation-check summaries), 4 statuses with schema-enforced decision coherence (approved/rejected = one-shot human stamps; title/body never edited); `generated_by_kind='agent'` is the ONLY generator and `requested_by` NOT NULL (no autonomous rows); **deterministic drafter v0** — pure functions over the SAME bundles/packets the exports use, so drafts can only derive from records (cite source ids) and can never contain private reasoning; suggestion never records evidence ("Use draft" = prefill-only, the 16C lane stays the only evidence path); **drafts deliberately ABSENT from evidence exports** (the strongest draft≠evidence wall); 3 webhook events (created/approved/rejected, distinct `agent_draft` payload field, now 7 events); session-only routes (tokens can neither create nor decide); doctrine: "the agent drafts; the human decides; agent output is not evidence until a human records a separate approved action" |
| Evidence citation verification checks | implemented | PR-EV-1 | PR #123 / `3a81b7e` | Migration 0028 `evidence_verification_checks` — append-only system OBSERVATIONS about cited references at check time: 3 narrow kinds (internal-exposure-reference w/ same-component + different/later-version shape check; github-reference-reachable w/ `pr_merged_observed` labeling; source-rescan-no-longer-matches, advisory-named + source-vocabulary + timestamped), 3 statuses ONLY (check_passed / check_failed / **check_inconclusive — a first-class honest answer**); evidence rows never mutated; export gains §9 Citation checks (bundle now 11 sections) with the non-claim "a passing citation check does not certify remediation or prove absence of vulnerabilities"; webhook event `evidence_verification.checked` (check vocabulary, distinct field); doctrine: "the human records evidence; the system may check the reference; the export preserves both" |
| Trust Record API + webhooks | implemented | PR-17C | PR #121 / `2a59445` | Migration 0027 (3 tables: `vault_api_tokens` hashed-secret read-only machine credentials; `vault_webhook_subscriptions`; `vault_webhook_deliveries` append-only log) — stable reads `GET /trust-records[/:id]` + `/evidence-bundles/:id` + the packet route, all via reader auth (session OR `Bearer osy_…` token; token write-incapable BY ROUTING — token auth is mounted on GET routes only, and scope='read' is the only scope the schema allows); webhooks notify 3 record-change events (`exception.expired` / `reviewer_resolution.recorded` / `remediation_evidence.recorded`) with HMAC-SHA256 signatures, https-only SSRF guard (re-checked at delivery, redirects refused), 5s timeout, one attempt + logged delivery, NO retry queue; payloads keep reviewer direction and remediation evidence as DISTINCT fields and carry the non-claim "a webhook notifies that a record changed; it does not certify the meaning of the change"; emit points are bare calls — 16B/16C one-table invariants intact; doctrine: "the API exposes records; it does not create new trust conclusions — make the record portable, not more opinionated" |
| Production rollup evidence packet proof | implemented | PR-PROOF-4 | PR #120 / `d70e4d5` | Fourth category artifact: [`rollup-evidence-packet-proof.md`](../proof/rollup-evidence-packet-proof.md) + artifacts under `docs/proof/artifacts/pr-proof-4/` — the first production rollup packet (READ-ONLY GET against prod) composes two chains with mixed states preserved: lodash@4.17.20 expired+resolved+`evidence_recorded` (PROOF-3 loop) beside express@4.21.2 `b777fb25` ACTIVE-until-2026-07-10 with 3 sections honestly absent, + 4 observation-only inventory rows + 6 packet non-claims; `b777fb25` read, verified unchanged; "a rollup is composition, not certification"; proof-package artifact #10 |
| Rollup evidence bundles | implemented | PR-17B | PR #119 / `7bbadd0` | NO new schema — GET `/evidence-packet` composes multiple chains into one packet (workspace / selected exposure ids / source-ref); every chain built by the SAME per-chain loader as 17A (per-chain logic exists once); decision-bearing chains in full + observation-only inventory; packet state rollup reports mixed states separately (never a single verdict, no traffic lights); honest edges SCALE UP (packet non-claims + per-chain gaps named per chain + cap notes + caller-selection caveat); internal Q1–Q7 question map only ("may support review", no CC-series IDs); caps: 10 chains / 100 inventory rows, capped packets say so; doctrine: "a rollup is composition, not certification — 17B composes existing truth; it does not create new truth" |
| Auditor / customer evidence export bundle | implemented | PR-17A | PR #113 / `b67ce04` | NO new schema — GET `/exposures/:id/evidence-export` assembles one component trust-decision chain from existing records ONLY (observation → intel context → question → decision → expiry pressure → resolution → receipts), JSON + Markdown, nine sections; structurally read-only (zero write verbs — no CEI event, no timeline event, no state change); missing links reported as "not present in the record", never fabricated; severity stays source vocabulary; `reason_private` never exported; honest-edges non-claims embedded in every bundle; private surface only (session + membership; no portal, no PDF, no Vanta/Drata) — see [`evidence-export-doctrine.md`](./evidence-export-doctrine.md) |

**Phase 5 is CLOSED.** See [`phase-5-closeout.md`](./phase-5-closeout.md) for the full handoff record.

**The Phase 6 proposal/audit loop is CLOSED.** See [`phase-6-closeout.md`](./phase-6-closeout.md) for the full handoff record and [`../proof/cei-decision-loop-demo.md`](../proof/cei-decision-loop-demo.md) for the runnable walkthrough.

## Approved Next

_(none — PR-7D closed the packaging lane; further lanes are parked and each requires explicit user approval with a scope block before any implementation begins)_

## Parked — forward lanes (per [`post-7c-strategy-update.md`](./post-7c-strategy-update.md))

| Artifact | Status | Lane | Purpose |
|---|---:|---|---|
| 15A+ intelligence extensions | parked | 15A+ | Continuous/at-ingest enrichment, scanner-output ingestion, malicious-package signal feeds, license-risk intelligence; PR-15A shipped on-demand OSV association only |
| 15B+ remediation extensions | parked | 15B+ | PR-15B shipped the question loop (open + human answer); remediation COMPLETION tracking (a fix path is not proof of fix), question cancellation flow, and due_at overdue pressure (lane 16) remain parked |
| Broader ecosystems / SBOM | parked | 15C | pnpm / yarn / poetry / uv, CycloneDX/SPDX, scanner/SBOM input formats |
| Reaper scheduling | parked | 16+ | Wiring `reap:exceptions --execute` to a cron is an ops decision; the command is explicit and safe-by-default until then; first production reap deliberately manual |
| Resolution-completion verification | parked | 16+ | Nothing verifies a "remediation required" resolution was remediated or a "renew" proposal was approved — directions are recorded, not enforced |
| Exposure status lifecycle | parked | 16+ | `observed` → `resolved`, stale exposure, overdue remediation, remediation-question due_at pressure, unresolved-case markers on the Trust Expiry list |
| Enterprise evidence exports | parked | 17 | SOC 2 evidence bundle, auditor packet, customer-security-review packet, Vanta/Drata-style export |
| Trust agent | parked | 18 | Drafts recommendations / evidence summaries / remediation options / review prompts; NEVER decides |
| Vault health endpoint (`/api/vault/health`) | parked | optional | Would let the integrity guard verify schema presence without service credentials; new endpoint, own scope block |
| CLI seen_again reporting | parked | minor | Teach the CLI to report created vs seen-again from the 7C response body; possibly drop the redundant client-side scan |
| GitHub-native judgment surfaces (annotations / PR comments / check runs) | parked | minor | A NEW product surface, deliberately not "packaging"; own scope block after the observation lane earns operational trust |
| Versioned action releases (`@v1` tags) | parked | minor | Release-management decision after the wrapper is dogfooded |
| Custom exposure type registry | parked | 6G+ | Workspace-defined types beyond the 6 native |
| Dynamic JSON Schema validation | parked | 6G+ | `validation_schema` for custom exposure metadata |
| Shared Vault Timeline integration | parked | 6G+ | The 6A deferral stands; CEI audits stay in CEI's own surface |
| Cloud permission drift evidence | parked | Phase 6+ | Compare cloud entitlement changes against trust policy |
| Decision-Event Reconciliation | parked | Phase 6+ | Decide whether external events were allowed by trust record |

## Parked — Ingestion / Ops

| Artifact | Status | Phase | Purpose |
|---|---:|---|---|
| Ingestion API | parked | Phase 6+ | Accept exposure evidence |
| Go ingestion worker | parked | Phase 6+ | Batch event processing |
| Docker Compose integration harness | parked | Phase 6+ | Local worker/API/database testing |
| Prometheus metrics | parked | Phase 6+ | Ops observability |
| Grafana ops dashboard | parked | Phase 6+ | Ingestion health visualization |
| Kubernetes HPA | parked | Phase 6+ | Scale workers on queue pressure |

## Parked — Enterprise Evidence

| Artifact | Status | Phase | Purpose |
|---|---:|---|---|
| Cold storage archive export | parked | Phase 8 | Long-term private evidence retention |
| Auditor export bundle | parked | Phase 8 | Compliance evidence packaging |
| Vanta/Drata export | parked | Phase 8 | Evidence producer into GRC systems |

## Parked — v3 / Enterprise Expansion (long-range)

| Artifact | Status | Phase | Purpose |
|---|---:|---|---|
| SPIFFE/SPIRE identity direction | parked / research | v3 | Workload identity attestation for future collectors / agents |
| Cross-cloud trust scope synthesis | parked | Phase 6+ | Explicit per-scope exception applicability across environments |
| Predictive blast-radius preview | parked | Phase 6+ | Trust Impact Analysis on proposed exceptions (advises only) |
| Compliance evidence export projection | parked | Phase 8+ | Projection from `vault_exceptions` / `vault_evidence` / `vault_timeline_events` |
| Compliance Evidence Exports dashboard | parked | Phase 8+ | Audit Evidence Mapping; control-code rows; review-required statuses |
| DR reconciliation playbook | parked | Future resilience | Post-outage local audit upload + reconcile |
| Post-Incident Review template | parked | Future resilience | Break-glass governance closure |
| Decision-Event Reconciliation API | parked | Phase 6+ | `component-exposures/reconcile` route family |
| Pricing around trust-surface complexity | parked | Phase 8+ | Team / Platform / Enterprise tier framing (no exact prices in repo) |

## Parked — Resilience

| Artifact | Status | Phase | Purpose |
|---|---:|---|---|
| Signed decision bundles | parked | Future Guard resilience | Bounded offline decisions |
| Offline-grace mode | parked | Future Guard resilience | Continue known safe decisions during outage |
| Break-glass workflow | parked | Future Guard resilience | Emergency override with audit debt |
| Local audit reconciliation | parked | Future Guard resilience | Attach outage decisions to Vault Timeline |

## Do-Not-Claim

These are not current capabilities:

```txt
OpenSoyce controls cluster traffic.
OpenSoyce intercepts runtime cloud permission changes.
OpenSoyce automatically isolates nodes.
OpenSoyce revokes IAM permissions.
OpenSoyce issues trust tokens.
OpenSoyce uses HSM-backed Vault signatures.
OpenSoyce has immutable ledger storage.
OpenSoyce has a Go telemetry worker.
OpenSoyce supports gRPC streaming agent protocols.
OpenSoyce guarantees sub-second reconciliation.
OpenSoyce replaces CIEM / CSPM / SIEM / EDR.
OpenSoyce is SOC 2 ready.
OpenSoyce replaces Vanta or Drata.
OpenSoyce supports dynamic custom exposure types today.
```

## Architecture Spine

```txt
Exposure says: something exists or changed.
Policy says: what should happen.
Exception says: why risk is temporarily allowed.
Evidence says: what supports the decision.
Timeline says: what happened.
Archive says: what must be retained.
```

## Working Rule

Every new OpenSoyce feature must answer:

```txt
What component is trusted?
What evidence supports that trust?
Who decided?
What policy applies?
Is there an exception?
When does trust expire?
What record proves this later?
```
