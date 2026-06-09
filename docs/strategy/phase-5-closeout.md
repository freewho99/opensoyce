# Phase 5 — Trust Vault Closeout

Status: **closed** as of PR-V3 (2026-06-09)
Scope: docs-only closeout doc
Implementation status: every Phase 5 implementation PR is merged to `main`.

## Summary

Phase 5 — Trust Vault — is **complete**. The auth-gated private evidence layer is on main, with both a CLI and a browser dashboard as read/control surfaces. The public Trust Center, public Timeline, public Repo Trust Dashboard, public Gate, and Trust Badge are byte-for-byte unchanged; private and public surfaces remain isolated by import graph, by SQL CHECK, by cache header, by structural test, and by 404 doctrine.

This document records the closeout. It introduces no new code, no new routes, no new claims.

## Final Phase 5 stack on main

```text
47f86bc  PR-V2-E  Vault Dashboard + /cli-auth approval page          (#86)
34ef316  #85       docs(strategy): CEI architecture + v3 addendum
15fc8eb  PR-V2-D  CLI workspace mode                                  (#84)
3adc0fc  PR-V2-C  private proof anchors + Vault Timeline reads        (#83)
c560468  #82       docs(strategy): weakness-to-strength
bc7b5d9  PR-V2-B  exception state machine + API + CSRF + idempotency  (#81)
34aad06  forward-fix: atomic workspace+owner                          (#80)
5beb8fa  PR-V2-A  auth + workspace foundation                         (#78)
```

| PR | Subject | Shipped |
|---|---|---|
| `5beb8fa` (PR-V2-A) | Vault auth + workspace foundation | OAuth code-exchange, opaque session cookie + 30-day sliding TTL, `vault_users` / `vault_workspaces` / `vault_workspace_memberships` / `vault_sessions` tables with RLS deny-by-default, 4-role RBAC (`member < reviewer < owner` + `public_visitor`), 404-on-non-member doctrine, `setPrivateCacheHeaders`, `requireVaultSession`, `/api/vault/me`, `/api/vault/workspaces`, `/api/vault/workspaces/:slug` |
| `34aad06` (forward-fix #80) | Atomic workspace + owner creation | Migration 0013 `vault_create_workspace_with_owner` PL/pgSQL function; single SQL transaction commits both rows or neither |
| `c560468` (#82) | Weakness-to-strength strategy doc | 12-weakness living strategy document with master status board and SOC 2 gap-framing |
| `bc7b5d9` (PR-V2-B) | Exception state machine + API + CSRF + idempotency | 8 endpoints (list / get / propose / approve / reject / revoke / extend / patch + DELETE 405), 6-state machine (proposed / reviewed / active / rejected / revoked / expired) with `.eq('state', '<expected>')` race guards, severity-downgrade-only SQL CHECK, four-eye principle, double-submit CSRF, opaque `idempotency_key` with 24h TTL replay (mandatory ordering: maybeReplayIdempotent BEFORE state/etag truth checks), private-anchor proofType with `visibility: 'private'` SQL constraint |
| `3adc0fc` (PR-V2-C) | Private proof anchors + Vault Timeline reads | `GET /api/vault/workspaces/:slug/evidence/:id` with role-and-redaction body masking (`X-OpenSoyce-Vault-Masked-Fields`), `GET /timeline` (list, opaque base64url cursor + version gate) + `GET /timeline/:id`, expanded user-object shape `{ user_id, github_login, display_name } \| null`, atomic visibility-field guard lift on PUBLIC shapes |
| `15fc8eb` (PR-V2-D) | CLI workspace mode | `opensoyce login` / `logout` via device-code flow, `~/.opensoyce/session.json` (mode 0600), `--workspace` 8th flag, three exception subcommands (list / propose / revoke — `approve` / `reject` / `extend` / `withdraw` stay UI-only), Cookie-based auth (NOT bearer) + CSRF self-mint, atomic CLI v0 5→8 commands + 7→8 flags + writeFile + visibility-field + vault-imports lifts |
| `34ef316` (#85) | Strategy / do-not-claim firewall | Six strategy docs under `docs/strategy/`: architecture manifest, CEI architecture lock-in, future-architecture parking lot, resilience doctrine, PR-V2-D scope record, v3 enterprise expansion addendum. Locks the do-not-claim firewall against future scope drift |
| `47f86bc` (PR-V2-E) | Vault Dashboard + `/cli-auth` approval page | Seven new browser routes (`/cli-auth` + `/vault` + `/vault/:slug` + exceptions list/detail + timeline + evidence detail) rendered OUTSIDE the public Layout, shared `src/shared/vault/api-client.ts` as the single CSRF transport boundary, reviewer actions drive existing PR-V2-B endpoints with no new server semantics, evidence masking surfaced honestly, Timeline rendered with `[PRIVATE]` marker per PR-V1-E §5.2 |

## Final Phase 5 doctrine

The Phase 5 implementation arc, distilled to seven lines that must hold for every future surface:

```txt
The user authenticates.
The workspace resolves.
The exception lifecycle records the decision.
The evidence explains why.
The Timeline remembers what happened.
The CLI and the Dashboard are read/control surfaces.
They are not the trust record.
```

The trust record is the persistence layer — `vault_workspaces`, `vault_exceptions`, `vault_evidence`, `vault_timeline_events` — under deny-by-default RLS. The CLI and the Dashboard are consumers; the Vault is the source of truth.

## Closeout checklist

Verified at PR-V3 merge:

- [x] No public claims expanded. The do-not-claim list from `architecture-manifest.md` and `component-exposure-intelligence-lock-in.md` is preserved verbatim.
- [x] No new product surface beyond Phase 5 scope. The Phase 5 implementation arc closed at `47f86bc`; PR-V3 adds documentation only.
- [x] Public Trust Center, public Timeline, public Repo Trust Dashboard, public Gate, and Trust Badge behavior unchanged. The structural tests `test:open-source-trust-center`, `test:trust-timeline`, `test:trust-badge-v0`, `test:repo-trust-dashboard` continue to pass on main.
- [x] Vault API behavior unchanged. The PR-V2-E snapshot guard in `test:vault-dashboard-v0` continues to assert the route set is the same as PR-V2-D's tip.
- [x] CLI behavior unchanged. `test:cli-v0` (14 invariants) and `test:cli-workspace-v0` (18 invariants) continue to pass.
- [x] No SOC 2 / Vanta / Drata claim added. The "may later support" framing from the v3 enterprise addendum is the strongest language permitted.
- [x] No pricing pages added. Trust-surface-complexity framing only.
- [x] Mojibake check unchanged — only the pre-existing `e2e/playwright-report/index.html` offender.

## Next phase — parked, not authorized

**Phase 6 — Component Exposure Intelligence — is the next strategic phase. It is NOT authorized by this PR.**

Phase 6 must require a separate, explicit user approval call with scope before any implementation begins. The scope-locking pattern from PRs V2-A through V2-E applies: allowed scope, permitted file families, hard non-scope, required verification, MERGE call.

What "parked" means in practice for Phase 6:

- No `component_exposure_types` table, no `component_exposures` table, no JSON Schema validator, no exposure-type API, no CI/CD ingestion endpoint, no SBOM imports, no manifest ingestion, no GitHub Action exposure, no base-image exposure, no runtime-version evidence, no `cloud-permission-drift` exposure type, no Decision-Event Reconciliation API.
- No Go code. No Docker Compose / Kubernetes / Prometheus / Grafana / HPA. No ingestion worker. No dynamic exposure types. No custom workspace schemas.

The do-not-claim list from PR-V2-C onwards remains in force. The strategic firewall in `architecture-manifest.md`, `component-exposure-intelligence-lock-in.md`, `future-architecture-parking-lot.md`, and `v3-enterprise-expansion-addendum.md` continues to govern public copy.

## Handoff point

After PR-V3 merges, the repository has a clean handoff point:

| State | Value |
|---|---|
| Phase 5 status | **CLOSED** |
| Phase 5 implementation PRs | 6 merged (V2-A through V2-E plus the atomic workspace forward-fix) |
| Phase 5 strategy PRs | 3 merged (#82, #85, PR-V3) |
| Phase 6 status | parked, **not authorized** |
| Phase 7 status | parked |
| Phase 8 status | blocked until Phase 6 evidence exists |
| Phase 9 status | do-not-claim publicly |

The next call belongs to the user.
