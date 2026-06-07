# ADR: Trust Vault Architecture (Phase 5 Sketch)

**Status:** Proposed (this ADR)
**Date:** 2026-06-07
**Phase:** 5 — Trust Vault: private evidence + exceptions (the "Now" slot per the [roadmap integration doc](./open-soyce-roadmap-integration.md))
**Type:** Docs-only architecture decision record. No application code, no route registration, no database tables, no auth implementation, no banned-substring vocabulary lifted.

**Predecessors:**

- [Phase 4 Closeout — OSS Distribution](../proof/oss-distribution-phase-4-closeout.md) (#66)
- [Roadmap Integration](./open-soyce-roadmap-integration.md) (#53)
- [Repo Trust Dashboard Sketch](./repo-trust-dashboard-sketch.md) (#46) — §9 backlog: repo-scoped exception storage
- [Open Source Trust Center Sketch](./open-source-trust-center-sketch.md) (#48) — §6: public/private evidence boundary
- [Public Trust Spine Closeout](../proof/public-trust-spine-closeout.md) (#50) — §8: no editable exceptions today

This sketch answers one paired question:

> **What evidence must OpenSoyce hold that cannot live on the public spine?**
> **How does a customer decide that some risk is allowed without erasing that risk?**

It does not authorize implementation. It establishes the surface boundaries, the evidence shapes, the auth/workspace model at architecture level, the exception contract, and the implementation PR sequence. Each Phase 5 implementation PR is its own approval.

## 0. Load-bearing doctrine

Three rules govern every decision in this ADR.

1. **Public trust record shows what can be shared.** The `/proof/gate`, `/proof/timeline`, `/projects/:owner/:repo/trust`, and `/opensource-trust` surfaces still answer "what is publicly verifiable." They do not become Vault surfaces.
2. **Trust Vault stores what must be controlled.** Customer-scoped audit trails, embargoed CVE work, reviewer-private exception justifications — evidence that is real but not safe to publish.
3. **Exceptions are allowed decisions, not erased risk.** A repo accepting a `RISKY` posture on a dependency is a recorded decision with a recorded reason and a recorded reviewer. The exception does not change the gate's posture; it changes the gate's *action* for one workspace.

If any decision in implementation drifts from these three rules, the decision changes — not the rule.

## 1. What "private evidence + exceptions" means

### 1.1 Private evidence

Evidence that the public trust record cannot honestly carry:

| Class | Why it's private | Example |
|---|---|---|
| **Pre-disclosure CVE work** | A confirmed compromise that a maintainer has not yet patched. Publishing the evidence in real time would burn the embargo. | An OpenSoyce reviewer marks a package as "embargoed; do not publish until 2026-08-15" pending a coordinated disclosure. |
| **Per-customer audit trails** | "Customer A queried package X on date Y, got BLOCK, accepted the exception" is the customer's data, not OpenSoyce's. | A customer's CI pipeline produced 200 gate calls on a specific lockfile last week. The customer can audit it; the public spine cannot. |
| **Reviewer-private exception justifications** | An exception's *reason* may include details the reviewer cannot share publicly (vendor NDA, customer contract, etc.). | "Vendor confirmed this is a false positive in private; cannot publish vendor's name." |
| **Customer-scoped trust evidence** | The fact that *this specific customer* runs *this specific dependency tree* is itself sensitive. | A customer's lockfile contents are not public. |
| **Internal review trails** | OpenSoyce's own reviewer discussion before promoting a candidate to a pattern. | Reviewer A and reviewer B discussed evidence quality before pattern-id `X` shipped; that discussion is not public. |

None of this is fabrication. Each class corresponds to evidence the public spine **already cannot carry** under the existing `visibility`-field guard.

### 1.2 Exceptions

A workspace-scoped, time-bounded, reviewer-attested decision to allow a gate action that would otherwise BLOCK or WARN. The fields below are the sketch contract; the implementation PR may refine names and types.

```text
Exception {
  exceptionId:       string                              // stable UUID
  workspaceId:       string                              // workspace owning the exception (per §3)
  subject:           PackageSubject | RepoSubject        // what the exception covers
  originalAction:    'BLOCK' | 'WARN'                    // what the gate said
  allowedAction:     'WARN' | 'ALLOW'                    // what the exception lets through
  reviewerId:        string                              // who approved
  reviewedAt:        string                              // ISO timestamp
  expiresAt:         string                              // ISO timestamp; null forbidden
  reasonPublic:      string                              // short, sharable rationale
  reasonPrivate?:    string                              // long-form, vault-scoped rationale
  proofAnchors:      TrustProofAnchor[]                  // PR + SHA, ticket URL, etc.
}
```

The shape rejects three drift patterns:

- **`expiresAt: null` is forbidden.** Every exception has a known end. Indefinite exceptions are bugs, not features. The implementation PR's structural test asserts.
- **`reasonPublic` is required, `reasonPrivate` is optional.** An exception without a public reason cannot be summarized on a buyer-facing surface; the field name forces the reviewer to write something safe to share.
- **`proofAnchors` is non-empty.** An exception is itself anchored. "We decided to allow this" requires a link to the decision (a ticket, a PR comment, a Slack thread URL, a doctrine doc anchor).

### 1.3 What "private evidence + exceptions" does NOT mean

- It does NOT mean editable trust posture. The Dashboard's posture is still derived from public signals. An exception changes the *gate action* for one workspace; it does not change the posture.
- It does NOT mean editable Timeline. The Timeline records public trust decision changes. A workspace's local exception is not a Timeline event.
- It does NOT mean private fork of the trust record. Private evidence is *additional*; it does not replace the public record.
- It does NOT mean "OpenSoyce ratifies your risk." An exception is the customer's recorded decision, attributed to a specific reviewer. OpenSoyce hosts the record; OpenSoyce does not author the decision.

## 2. Separate public trust record from private trust vault

### 2.1 The boundary

| Question | Public trust record (Phase 1–4) | Trust Vault (Phase 5) |
|---|---|---|
| Who can read it? | Anyone | Authenticated members of one workspace |
| Where does it live? | `/proof/*` + `/projects/*/trust` + `/opensource-trust` + CLI + `/badge/*` | A new route family `/vault/*` (proposed; final path in PR-V1-A) |
| What evidence types? | `pr` / `live-surface` / `doc-anchor` / `proof-artifact` | Same four, plus `private-anchor` (vault-internal pointer) |
| Visibility field on claims? | Forbidden (structural test asserts) | **Permitted on Vault evidence only** (this is the field-guard lift, atomic with Phase 5) |
| `NOT EVALUATED` semantics? | Honest empty state, public | Workspace may show "EVIDENCE REDACTED" for items the viewer lacks scope to see |
| Cache-Control | 5 min `public, max-age=300, stale-while-revalidate=3600` | `private, no-store` (proposed) |

### 2.2 No re-derivation

The Vault NEVER re-derives a posture or a gate action by running a parallel scan. It consumes the public gate output, the public posture, and the public Timeline as inputs. Vault-only data is layered ON the public data; the public data is the substrate.

### 2.3 No public leakage

The Vault MUST NOT leak workspace-private data into public surfaces. The implementation PR's structural test asserts the public renderers (`src/pages/Proof.tsx`, `RepoTrustDashboard.tsx`, `OpenSourceTrustCenter.tsx`, the badge SVG/JSON, the CLI output) do not import any vault module that exposes a `visibility: 'private'` record.

### 2.4 No private leakage of the public spine

The Vault MUST NOT pretend to "extend" the public spine. A workspace member viewing the Vault surface sees the public spine's existing public anchors plus the workspace's vault-only additions. Nothing about the public spine is hidden, redacted, or rewritten by the Vault for that viewer.

## 3. Auth / workspace / subject boundaries (architecture level)

This section is **architecture only**. It does not pre-commit to a specific auth provider, RBAC vocabulary, or token shape.

### 3.1 Subject vs. workspace

| Concept | Definition | Example |
|---|---|---|
| **Subject** | The thing being evaluated. Today: a package (`name@version`) or a repo (`owner/repo`). Multi-subject Trust Center scope is its own ADR. | `ua-parser-js@0.7.29`, `freewho99/opensoyce` |
| **Workspace** | The entity that owns evidence and exceptions in the Vault. A workspace has members. | Acme Corp's "platform" workspace; a solo developer's personal workspace. |

A subject is global; a workspace is private. A workspace's exception on `ua-parser-js@0.7.29` is not visible to other workspaces, and the same subject can have different exceptions in different workspaces.

### 3.2 Membership model (architecture level)

Three roles, no more in v0:

| Role | Read public spine | Read workspace vault | Write workspace vault | Manage members |
|---|---|---|---|---|
| **public visitor** | ✓ | ✗ | ✗ | ✗ |
| **workspace member** | ✓ | ✓ | ✗ | ✗ |
| **workspace reviewer** | ✓ | ✓ | ✓ (create / extend / revoke exceptions; write private reasons) | ✗ |
| **workspace owner** | ✓ | ✓ | ✓ | ✓ |

A 5th role (e.g., "compliance auditor — read-only on private reasons") is out of scope for v0. Adding it later requires a sub-sketch revision PR.

### 3.3 What this ADR does NOT decide

- The auth provider (Auth0 / Clerk / Supabase Auth / GitHub OAuth / custom). The implementation sub-sketch (PR-V1-A, see §9) picks.
- The session-token shape (cookie / Bearer header / signed JWT / opaque session).
- The persistence layer (PostgreSQL row / Supabase table / DynamoDB document / git-backed evidence log). The implementation sub-sketch picks; the choice is constrained by the audit-anchor discipline (every Vault entry must be SHA-pinned somewhere).
- The workspace-creation flow (self-serve sign-up / invitation-only / GitHub-org-bound). Implementation decision.
- The pricing/tier shape. Not in scope for any Phase 5 ADR; pricing is a Phase 5+ business decision separate from this architecture.

### 3.4 What this ADR DOES require

- **Every vault evidence record is anchored.** Same audit-anchor discipline as the public spine. A vault exception with a `proofAnchors: []` array is structurally rejected.
- **Every vault evidence record names its workspace.** `workspaceId` is a required, non-empty, well-formed field on every Vault record.
- **Every vault read is auth-checked.** No anonymous access to `/vault/*` routes. The implementation PR's structural test asserts every `/vault/*` route handler calls an `assertWorkspaceMember()` (or equivalent) middleware before reading any Vault record.
- **Every vault write is reviewer-attested.** Exceptions and private-reason updates require `workspace reviewer` role minimum. Owner-only operations are member management.

## 4. Exception evidence model

The exception shape (§1.2) is the contract. This section names the lifecycle.

### 4.1 Lifecycle states

```text
proposed   → reviewed   → active   → expired
                       ↘ rejected
            active     → revoked
```

| State | Created when | Meaning | Gate behavior |
|---|---|---|---|
| `proposed` | A member files an exception request | Awaiting reviewer action | Gate behaves as if no exception (returns `originalAction`) |
| `rejected` | Reviewer rejects | Decision recorded; no exception applied | Same as `proposed` (no exception) |
| `active` | Reviewer approves with `expiresAt` and `reasonPublic` | Currently allowing `allowedAction` for the subject | Gate returns `allowedAction` |
| `expired` | Wall-clock passes `expiresAt` | Exception no longer applies | Gate behaves as if no exception (returns `originalAction`) |
| `revoked` | Reviewer explicitly revokes before `expiresAt` | Decision reversed; recorded with revoke reason | Gate behaves as if no exception |

State transitions emit a Vault Timeline event (per §5.4). The public Timeline is NOT affected.

### 4.2 The `originalAction → allowedAction` matrix

| originalAction | allowedAction options | Why |
|---|---|---|
| `BLOCK` | `WARN` or `ALLOW` | A workspace may downgrade BLOCK to WARN (annoy CI but don't fail) or ALLOW (silent acceptance). |
| `WARN` | `ALLOW` only | A workspace may suppress a warning. Cannot upgrade WARN to BLOCK via exception. |
| `ALLOW` | (no exception possible) | Cannot make ALLOW into WARN or BLOCK via exception. |

Cannot use an exception to upgrade gate severity. The Vault is **permissive only**: exceptions accept risk, they do not invent risk.

### 4.3 Exception scope

Per the §1.2 shape, exceptions are scoped to a `subject` (a package or a repo). Two scope shapes:

```text
PackageSubject {
  kind:    'package'
  name:    string                                        // e.g., 'ua-parser-js'
  version: string | 'any' | string[]                     // pinned, wildcard, or array
}

RepoSubject {
  kind:    'repo'
  owner:   string
  repo:    string
}
```

- **Package exception** applies to gate decisions for the named package(s) inside the workspace. Other workspaces are unaffected.
- **Repo exception** applies to posture-derived actions for the named repo inside the workspace. Affects how the workspace's Vault Dashboard renders the repo; does NOT alter the public Dashboard posture.

### 4.4 What exceptions CANNOT do

- An exception cannot apply to "every package matching pattern X" (no wildcard regex). Each subject is explicit.
- An exception cannot reference a future package version that doesn't exist yet (e.g., `>2.0.0`). Version arrays are explicit lists.
- An exception cannot point at a different workspace.
- An exception cannot survive its `expiresAt`. There is no auto-renew.
- An exception cannot be rewritten in place. Editing produces a new exception record; the old one is `revoked`. Audit trail intact.

## 5. Private proof-anchor model

The public spine uses four proofType values. Phase 5 adds **one** type, atomic with the visibility-field lift.

### 5.1 New anchor type

```text
TrustProofAnchor {
  proofType: 'pr' | 'live-surface' | 'doc-anchor' | 'proof-artifact' | 'private-anchor'
  label:     string
  href:      string                                      // vault-internal path
  pr?:       number                                      // unchanged
  sha?:      string                                      // unchanged
  visibility?: 'private'                                 // permitted ONLY on private-anchor
}
```

### 5.2 `private-anchor` semantics

- `href` points at a vault-internal URL (`/vault/<workspace>/evidence/<id>` or similar).
- The href is **valid only when the requester is a workspace member**. Following it without auth returns 404 (NOT 401, NOT 403 — 404 to avoid leaking the anchor's existence).
- The label is workspace-private: the public spine cannot show it. The implementation PR's structural test asserts public renderers never see a `private-anchor`.

### 5.3 Atomic lift

When the Phase 5 implementation PR ships:

- `OPEN_SOURCE_TRUST_CENTER_PHASE_4_*` banned vocabulary stays banned.
- The `visibility` field guard stays banned on the public Trust Center, Timeline, Dashboard, CLI, and Badge — same PR widens the vault shapes only.
- The structural test grows to assert: `visibility: 'private'` may appear in Vault-only data shapes; **must not** appear in any public shape.

This is the only banned-substring/forbidden-field item Phase 5 lifts. Nothing else.

### 5.4 Vault Timeline (parallel surface)

Vault exceptions and private-evidence captures emit events to a Vault Timeline — a per-workspace event log distinct from the public `/proof/timeline`.

| Field | Same as public? |
|---|---|
| `type` | Extended vocabulary: public types + `exception_proposed`, `exception_approved`, `exception_rejected`, `exception_revoked`, `exception_expired`, `private_evidence_capture` |
| `pr` / `sha` | Required when the event references a public PR; optional otherwise |
| `summary` | Required, ≤ 280 chars |
| `references` | Required; non-empty |
| `visibility` | Always `private` for Vault Timeline events (this is the only place where the field is required, not just permitted) |

The Vault Timeline never appears on the public `/proof/timeline` surface. A workspace can render its own private timeline at a vault-only route.

## 6. What can become public later, what must stay private

The Vault is not a one-way trap. Some private evidence can transition to public once the privacy reason ends. This section is the contract.

### 6.1 Can become public

| Class | Trigger to publicize |
|---|---|
| Pre-disclosure CVE work | The maintainer publishes the patch / the embargo expires. The Vault entry is *copied* (not moved) to a public Timeline event in a dedicated PR. The Vault entry remains; the public version is its public-visible mirror. |
| A reviewer's published-after-embargo writeup | The same trigger as above. |
| Successful exception expirations (aggregate stats only) | Workspace consent. With explicit owner approval, a workspace may consent to anonymized aggregate metrics being included in the public methodology page. Subject-level details are never automatically promoted. |

### 6.2 Must stay private

| Class | Why permanently private |
|---|---|
| Per-customer audit trails | Customer's data. Even after embargo / disclosure, "Customer A queried Y on date Z" is not OpenSoyce's to publish. |
| Reviewer-private exception justifications (the `reasonPrivate` field) | The whole point of the field is that it's not safe to share. Promoting it publicly defeats the purpose. |
| Customer-scoped lockfile contents | Customer's IP. |
| Internal reviewer discussion before pattern promotion | Process discussion is not public evidence; the *outcome* (the pattern) is public via the existing `/patterns` surface. |

### 6.3 Promotion mechanism (not pre-authorized)

The Vault → public promotion is its own future PR. It is NOT part of the Phase 5 implementation. The recommended shape:

```text
Vault entry V (visibility: private, workspace: W)
  → Public Timeline event T (visibility absent, anchored to V's outcome only)
```

The promotion PR must:

- Be filed by a workspace owner.
- Carry a public reason explaining why publication is safe now.
- Be reviewed by a public-spine maintainer (not a workspace reviewer).
- Update the Vault entry's metadata: `publishedAs: <Timeline-event-id>`. The Vault entry is not deleted; the public mirror is created.

This is sketch-level scope. The actual promotion-PR template ships in its own ADR.

### 6.4 What promotion CANNOT do

- Cannot rewrite the public Timeline's audit-anchor shape.
- Cannot back-date a public event to before the workspace's exception was filed.
- Cannot promote `reasonPrivate` to public copy.
- Cannot promote workspace identity to public copy (the public mirror anonymizes the workspace).

## 7. Relationship to CLI and Badge

### 7.1 CLI

The CLI v0 was built read-only against the public API. Phase 5 introduces auth-gated reads. The CLI track must extend:

- **`opensoyce login`** — new command (the 6th, requires sub-sketch revision). v0 sub-sketch locked the CLI at 5 commands; Phase 5 lifts that lock atomically with the workspace auth implementation.
- **`--workspace <id>`** — new flag. The v0 sub-sketch locked the CLI at 7 flags; Phase 5 lifts that lock atomically.
- **`opensoyce check <pkg> --workspace acme`** — when the workspace flag is set, the gate result reflects the workspace's active exceptions. Without the flag, the CLI behaves identically to v0 (public gate only).
- **`opensoyce exception list / propose / revoke`** — proposed; final command set in the CLI extension sub-sketch.

**Boundary:** the v0 CLI doctrine ("the CLI reads the trust record; does not run a parallel gate") still applies. Workspace queries hit the *same* gate via an auth-gated endpoint; the CLI does not evaluate exceptions locally.

### 7.2 Badge

The badge is **public-only in Phase 5**. The Vault does NOT introduce a per-workspace badge variant:

- A workspace's private exceptions do not change the public badge.
- A workspace member viewing the public badge sees the same SVG every other visitor sees.
- A vault-internal "this workspace's view of this repo's posture" surface is its own future ADR — not in Phase 5.

This preserves the badge's anti-fabrication contract (PR-B1 §2.5). A badge that shifts based on the viewer's workspace is a different artifact category and needs its own decisions.

### 7.3 Trust Center

The public Trust Center stays single-subject (OpenSoyce itself). Multi-subject Trust Center is a separate ADR. The Vault does NOT promote arbitrary workspaces to Trust Center surfaces.

## 8. What Phase 5 does NOT ship

Phase 5 sketches the private evidence layer. It does NOT ship:

### 8.1 Architecture-level non-shipments

- No specific auth provider commitment (Auth0 / Clerk / Supabase Auth / etc.).
- No specific persistence layer commitment.
- No specific RBAC implementation beyond the 4 roles in §3.2.
- No specific workspace-creation flow.
- No pricing tier work.
- No multi-subject Trust Center work.
- No vault-aware badge variant.

### 8.2 Implementation non-shipments (per Phase 4 ADR §6 and roadmap §3)

- No VEX statement ingestion (Phase 6).
- No reachability analysis (Phase 6).
- No sandbox behavioral telemetry (Phase 6).
- No Remediation Drafts (Phase 7).
- No Enterprise Evidence Exports / Vanta / Drata (Phase 8).
- No SOC 2 attestation activation (Phase 8).
- No drop-in replacement engine (Phase 9).

### 8.3 Phase-5-specific non-shipments

- No per-customer trust-record cloning. Customers see the same public record; the Vault is additive.
- No editable trust posture. Vault exceptions change the gate action, not the Dashboard's posture.
- No editable Timeline. Vault Timeline is separate; public Timeline stays read-only static data.
- No vault-side scan engine. The Vault consumes public scan outputs.
- No vault-side compromise database. The Vault is evidence + exceptions, not a parallel `threat_feed`.
- No public/private mixed rendering. A surface is one or the other; the implementation cannot show a mixed view.
- No vault badge variant (per §7.2).
- No CLI workspace commands in the v0 CLI binary. The CLI extension is its own implementation PR set.

### 8.4 Cross-cutting non-shipments

- No `threat_feed` activation.
- No candidate-pipeline arc merge with the Vault.
- No `hn-exploits-log.json` cleanup.
- No `/opensource-trust` URL alias or rename.
- No changes to `/projects/:owner/:repo/trust` (the public per-repo posture stays public-only).
- No legacy SOC 2 deferral resolution (`LEGACY_SOC2_COPY_DEFERRAL` stays OPEN — gated to Phase 8).
- No banned-substring vocabulary lifted EXCEPT the `visibility` field, which only lifts on Vault-only shapes, atomic with the implementation PR.

## 9. Implementation PR sequence

Phase 5 is the largest phase yet — it adds auth, persistence, and a parallel surface family. The implementation MUST be broken into multiple sub-sketches and implementation PRs. The closeout cannot collapse this into a single feat PR.

### 9.1 Sub-sketches (each its own PR, none pre-authorized)

| Sub-sketch | Title shape | Decides |
|---|---|---|
| PR-V1-A | `docs(vault): sketch auth + workspace model` | Auth provider, session token shape, workspace data shape, membership flows, RBAC vocabulary detail. |
| PR-V1-B | `docs(vault): sketch persistence layer` | DB choice, table shapes (or git-backed evidence log), migration policy, backup model, retention policy. |
| PR-V1-C | `docs(vault): sketch exception state machine + API` | Concrete state-machine transitions, POST/PATCH/DELETE shapes, race-condition handling, audit-event emission. |
| PR-V1-D | `docs(vault): sketch private proof-anchor + Vault Timeline` | Concrete shapes for `private-anchor`, the Vault Timeline event store, the public-spine isolation tests. |
| PR-V1-E | `docs(vault): sketch CLI workspace extension` | The 6th command (`login`), the workspace flag, the exception-management commands. Lifts the 5-command + 7-flag CLI v0 locks atomically. |

Each sub-sketch is docs only.

### 9.2 Implementation PRs (each its own PR, none pre-authorized)

| PR | Title shape | Depends on |
|---|---|---|
| PR-V2-A | `feat(vault): add auth + workspace foundation` | PR-V1-A + PR-V1-B |
| PR-V2-B | `feat(vault): add exception state machine + API` | PR-V1-C, PR-V2-A |
| PR-V2-C | `feat(vault): add private proof-anchor + Vault Timeline` | PR-V1-D, PR-V2-B |
| PR-V2-D | `feat(vault): add CLI workspace extension` | PR-V1-E, PR-V2-C |
| PR-V2-E | `feat(vault): add Vault Dashboard view` | PR-V2-C |

Each implementation PR carries its own structural-invariants test extension. The Phase-5-extended Trust Center hygiene suite must continue to assert NO `visibility` field on public shapes, even as the Vault shapes gain it.

### 9.3 Closeout

| PR | Title shape | Marks |
|---|---|---|
| PR-V3 | `docs(vault): close out Phase 5 Trust Vault` | Phase 5 → ✅ Closed; Phase 6 (Signal Intelligence) Later → Now |

Nine total Phase 5 PRs (5 sub-sketches + 5 implementations + 1 closeout = 11 max; some sub-sketches may collapse into one ADR if scope warrants). The exact PR count lands per-sub-sketch.

### 9.4 Branching / blocking rules

- No implementation PR may merge before its corresponding sub-sketch lands.
- Sub-sketches may be authored in parallel; implementations are sequential per their dependency chain.
- The closeout (PR-V3) cannot ship while any sub-sketch's implementation is still open.
- The `visibility` field guard lift on public shapes happens **in PR-V2-C**, not earlier and not later. PR-V2-A and PR-V2-B may NOT introduce `visibility` to any shape.

## 10. Phase 5 closeout criteria

Phase 5 closes when **all** of the following are true and recorded in the closeout doc (PR-V3):

### 10.1 Surfaces

- [ ] `/vault/*` route family registered with auth middleware verifying workspace membership.
- [ ] Vault Dashboard view operational: a workspace member can see their workspace's exception list + Vault Timeline + private-anchor evidence.
- [ ] CLI workspace extension operational: `opensoyce login`, `opensoyce check <pkg> --workspace <id>`, exception-management commands, all reading the auth-gated endpoints.
- [ ] Existing public spine surfaces (`/proof/gate`, `/proof/timeline`, `/projects/*/trust`, `/opensource-trust`, public badge) unchanged in shape and content.

### 10.2 Structural invariants

- [ ] No public shape carries a `visibility` field. The Trust Center hygiene test (currently 26 invariants) extends with assertions that the public renderers do not import Vault-only modules.
- [ ] No public renderer imports a Vault module that surfaces `visibility: 'private'`.
- [ ] Every Vault evidence record carries `workspaceId` (required, non-empty).
- [ ] Every Vault evidence record carries `proofAnchors[]` (required, non-empty).
- [ ] Every `Exception` carries `expiresAt` (required, non-null).
- [ ] Every `Exception` carries `reasonPublic` (required, non-empty).
- [ ] Vault Timeline events always carry `visibility: 'private'`. Vault-side events that lack `visibility` fail CI.
- [ ] Every `/vault/*` route handler is fronted by `assertWorkspaceMember()` (or equivalent). Grep-asserted.
- [ ] Vault exceptions cannot reference a different workspace (asserted structurally and at request time).

### 10.3 Doctrine

- [ ] The Vault never re-derives a posture or runs a parallel gate. (Verified by reading the source; asserted by test on the import graph.)
- [ ] The badge is unchanged — no vault-aware variant.
- [ ] The Trust Center is unchanged — still single-subject, still public-only.
- [ ] The CLI v0 surface (5 commands + 7 flags + 6 exit codes) is preserved as a `cli v0 mode`; the Phase 5 CLI extension is gated behind the workspace flag and additional commands.

### 10.4 Banned vocabulary state at closeout

- [ ] All Phase 1–4 banned vocabularies still enforced.
- [ ] No new vocabulary entries lifted EXCEPT the atomic `visibility` field lift on Vault shapes, recorded in PR-V2-C's body.
- [ ] Legacy SOC 2 deferral (`LEGACY_SOC2_COPY_DEFERRAL`) untouched.

### 10.5 Documentation

- [ ] Phase 5 closeout doc lists all sub-sketches + implementation PRs with SHAs.
- [ ] Roadmap doc updates Phase 5 from "Now" to "✅ Closed" and Phase 6 (Signal Intelligence) from "Later" to "Now" in the same PR.

### 10.6 What PR-V3 closeout does NOT include

- The closeout does not authorize Phase 6 implementation.
- The closeout does not promote arbitrary workspaces to Trust Center surfaces.
- The closeout does not ship a vault-aware badge variant.
- The closeout does not declare any compliance posture.
- The closeout does not lift SOC 2 / Vanta / Drata / `certified` / `verified` / `secure` / `safe` from the banned vocabularies.

## 11. What this sketch does NOT do

Carried verbatim from the user's scope, plus structural items.

- Does not authorize any Phase 5 sub-sketch. PR-V1-A is the recommended next step; even it requires explicit user approval.
- Does not change any source code.
- Does not change `package.json`.
- Does not change any test.
- Does not register any new route.
- Does not create any database table.
- Does not implement any auth.
- Does not implement any exception workflow.
- Does not change the CLI.
- Does not change the badge.
- Does not introduce VEX / reachability / sandbox telemetry / remediation drafts / compliance export / drop-in replacement / AI-agent / agentic framing.
- Does not touch the candidate-pipeline arc.
- Does not touch the `threat_feed` ADR.
- Does not authorize the `hn-exploits-log.json` cleanup.
- Does not lift any banned-substring vocabulary entry. The `visibility` field lift is described as Phase 5's eventual atomic action; it does NOT happen in this PR.

## 12. Status

**Proposed.** Awaiting explicit user decision before any Phase 5 sub-sketch begins.

Docs only. No application code, no route registration, no `package.json` change, no test change, no banned-substring vocabulary lifted.

Recommended next PR after this merges:

**PR-V1-A — `docs(vault): sketch auth + workspace model`** (per §9.1)

Recommended, not pre-authorized. The user calls "approve auth + workspace sub-sketch" with explicit scope before any sub-sketch work begins.

---

> Public trust record shows what can be shared.
> Trust Vault stores what must be controlled.
> Exceptions are allowed decisions, not erased risk.
