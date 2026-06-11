# Evidence bundle — package lodash@4.17.20

> An export is a view of records, not a new source of truth.
> Evidence shows what happened. Evidence does not certify compliance by itself.

## 1. Executive summary

- Component: package `lodash`
- Observed version: `4.17.20`
- Workspace: `opensoyce` (OpenSoyce)
- Export generated: 2026-06-11T07:11:29.980Z
- Evidence scope: One component trust-decision chain, assembled from existing private records only.
- Visibility: private

## 2. Observation record

- Exposure id: `65d32e84-a27c-4855-a60b-c6b0be47f285`
- Type: dependency-exposure · status: observed
- Source: cli (`c:\tmp\opensoyce-proof2\deps.json`)
- First seen: 2026-06-11T04:59:41.3636+00:00 · last seen: 2026-06-11T04:59:41.3636+00:00 · seen count: 1
- Trust boundary: `{"manifest_kind":"explicit-json","package_manager":"npm"}`

## 3. Vulnerability / risk context

Severity is reproduced in the source’s vocabulary; OpenSoyce does not branch on it.

- `GHSA-xxjr-mmjv-4gpg` — source: osv · match basis: osv-version-query · severity (as reported by source): medium
  - affected range: introduced 4.0.0, fixed 4.17.23
  - source summary: Lodash has Prototype Pollution Vulnerability in `_.unset` and `_.omit` functions
  - source ref: https://osv.dev/vulnerability/GHSA-xxjr-mmjv-4gpg
  - first seen 2026-06-11T05:00:44.516298+00:00 · last seen 2026-06-11T05:00:44.516298+00:00 · seen ×1 · record `97d40dd0-004c-4ab9-8e9e-595739531cfa`
- `GHSA-r5fr-rjxr-66jc` — source: osv · match basis: osv-version-query · severity (as reported by source): high
  - affected range: introduced 4.0.0, fixed 4.18.0
  - source summary: lodash vulnerable to Code Injection via `_.template` imports key names
  - source ref: https://osv.dev/vulnerability/GHSA-r5fr-rjxr-66jc
  - first seen 2026-06-11T05:00:44.457254+00:00 · last seen 2026-06-11T05:00:44.457254+00:00 · seen ×1 · record `249d219d-1e97-47c5-b8d1-742f02a87bf3`
- `GHSA-f23m-r3pf-42rh` — source: osv · match basis: osv-version-query · severity (as reported by source): medium
  - affected range: introduced 0, fixed 4.18.0
  - source summary: lodash vulnerable to Prototype Pollution via array path bypass in `_.unset` and `_.omit`
  - source ref: https://osv.dev/vulnerability/GHSA-f23m-r3pf-42rh
  - first seen 2026-06-11T05:00:44.397071+00:00 · last seen 2026-06-11T05:00:44.397071+00:00 · seen ×1 · record `35aa593b-ab75-4f7e-897a-0500747dd19b`
- `GHSA-35jh-r3h4-6jhm` — source: osv · match basis: osv-version-query · severity (as reported by source): high
  - affected range: introduced 0, fixed 4.17.21
  - source summary: Command Injection in lodash
  - source ref: https://osv.dev/vulnerability/GHSA-35jh-r3h4-6jhm
  - first seen 2026-06-11T05:00:44.33235+00:00 · last seen 2026-06-11T05:00:44.33235+00:00 · seen ×1 · record `48fdc627-481d-4cf8-9b1f-792fab73faed`
- `GHSA-29mw-wpgm-hmr9` — source: osv · match basis: osv-version-query · severity (as reported by source): medium
  - affected range: introduced 4.0.0, fixed 4.17.21
  - source summary: Regular Expression Denial of Service (ReDoS) in lodash
  - source ref: https://osv.dev/vulnerability/GHSA-29mw-wpgm-hmr9
  - first seen 2026-06-11T05:00:44.261696+00:00 · last seen 2026-06-11T05:00:44.261696+00:00 · seen ×1 · record `0ccb925a-e403-47f3-8632-3a2d408bc497`

## 4. Remediation question

- Question `da53bf51-96c7-4b39-a7aa-9930926582d7` — kind: vulnerability_review · about: GHSA-35jh-r3h4-6jhm · status: answered
  - opened by @freewho99 at 2026-06-11T05:01:11.13553+00:00
  - answered by @freewho99 at 2026-06-11T05:01:11.368+00:00
  - selected direction: `propose_exception`
  - reason: Command-injection advisory on lodash 4.17.20; upgrade to 4.17.21 is scheduled. Accepting the risk briefly via the exception lane while the upgrade lands.

## 5. Exception / accepted risk

Private reasoning is held in the underlying record and is not reproduced in this export.

- Exception `888aae0f-eb07-4eec-a16a-a093294b8c76` — package lodash · proposed transition: BLOCK → WARN · current state: expired
  - proposed at 2026-06-11T05:01:48.687387+00:00
  - reviewed by: `a95395e5-d59e-4d98-9928-511d730f2512` at 2026-06-11T05:01:48.967+00:00
  - expires at: 2026-06-11T05:04:17.099+00:00
  - public reason: Short-window risk acceptance for lodash 4.17.20 while the 4.17.21 upgrade lands (per answered remediation question da53bf51).

## 6. Expiry pressure

- Exception `888aae0f-eb07-4eec-a16a-a093294b8c76` is expired (time truth) — scheduled expiry: 2026-06-11T05:04:17.099+00:00
- System observation `1f381ff9-325d-403a-991b-6092af865571` (exception_expired_from_exposure) — actor: system
  - expired at 2026-06-11T05:04:17.099+00:00 · observed by the reaper at 2026-06-11T06:36:32.675Z
  - recorded at 2026-06-11T06:36:35.04614+00:00
- Timeline event `b6a72b57-9f69-40e1-a8bd-07261e7b2336` (exception_expired) at 2026-06-11T06:36:34.896759+00:00: Exception expired on lodash at scheduled 2026-06-11T05:04:17Z.

## 7. Reviewer resolution

- Resolution `08efc01d-4961-4e95-9003-19750b37ecff` on exception `888aae0f-eb07-4eec-a16a-a093294b8c76` — direction: `remediation_required`
  - resolved by @freewho99 at 2026-06-11T07:06:25.08121+00:00
  - reason: PR-PROOF-2 production dogfood chain. lodash@4.17.20 was observed through the real CLI, OSV context recorded five advisories, the remediation question was answered by @freewho99 with propose_exception, and exception 888aae0f was approved BLOCK→WARN with a short expiry. The expiry
- Resolution `c2d42dd3-9b8b-481e-b2c5-7592ec7a8253` on exception `888aae0f-eb07-4eec-a16a-a093294b8c76` — direction: `remediation_required`
  - resolved by @freewho99 at 2026-06-11T07:09:07.756083+00:00
  - reason: PR-PROOF-2: lodash@4.17.20 was observed by real CLI, OSV recorded 5 advisories, question da53bf51 led to exception 888aae0f. The short expiry passed naturally and the prod reaper marked it expired. Reviewer resolution: remediation required.

## 8. Receipt trail

CEI relationship events:

- 2026-06-11T05:01:48.747852+00:00 — `exception_proposed_from_exposure` · actor: @freewho99 · exception `888aae0f-eb07-4eec-a16a-a093294b8c76` · event `1fc05bdd-9cd2-4318-9b01-3789eedb4189`
- 2026-06-11T05:01:49.026736+00:00 — `exception_approved_from_exposure` · actor: @freewho99 · exception `888aae0f-eb07-4eec-a16a-a093294b8c76` · event `0691f330-9f9a-49ae-ab87-68ab43913571`
- 2026-06-11T06:36:35.04614+00:00 — `exception_expired_from_exposure` · actor: system · exception `888aae0f-eb07-4eec-a16a-a093294b8c76` · event `1f381ff9-325d-403a-991b-6092af865571`

Vault timeline events:

- 2026-06-11T05:01:48.687387+00:00 — `exception_proposed` · Proposed exception on lodash: BLOCK -> WARN. Reason: Short-window risk acceptance for lodash 4.17.20 while the 4.17.21 upgrade lands (per answered remediation question da53bf51).. · emitted by @freewho99 · event `a3a0bab0-538a-40d6-a0bd-664f9254c90e`
- 2026-06-11T05:01:48.975976+00:00 — `exception_approved` · Approved exception on lodash: BLOCK -> WARN until 2026-06-11T05:04:17Z. Reason: Short-window risk acceptance for lodash 4.17.20 while the 4.17.21 upgrade lands (per answered remediation question da53bf51).. · emitted by @freewho99 · event `6422c83d-dcad-4325-9515-9c8c3de4db1d`
- 2026-06-11T06:36:34.896759+00:00 — `exception_expired` · Exception expired on lodash at scheduled 2026-06-11T05:04:17Z. · emitted by system · event `b6a72b57-9f69-40e1-a8bd-07261e7b2336`

Source record ids:

- exposure: `65d32e84-a27c-4855-a60b-c6b0be47f285`
- vulnerability intelligence: `97d40dd0-004c-4ab9-8e9e-595739531cfa`, `249d219d-1e97-47c5-b8d1-742f02a87bf3`, `35aa593b-ab75-4f7e-897a-0500747dd19b`, `48fdc627-481d-4cf8-9b1f-792fab73faed`, `0ccb925a-e403-47f3-8632-3a2d408bc497`
- remediation questions: `da53bf51-96c7-4b39-a7aa-9930926582d7`
- exceptions: `888aae0f-eb07-4eec-a16a-a093294b8c76`
- resolutions: `08efc01d-4961-4e95-9003-19750b37ecff`, `c2d42dd3-9b8b-481e-b2c5-7592ec7a8253`

## 9. Honest edges

What this export proves:

- A component observation was recorded, with source provenance and timestamps.
- The vulnerability/risk context shown is what the cited source asserted at recording time.
- The remediation questions, trust decisions, expiry observations, and reviewer resolutions shown were recorded by the identified actors at the identified times.
- Each step links to the underlying record by id — the export is a view of those records, not a separate source of truth.

What this export does not prove:

- This export is not a compliance certification, and OpenSoyce does not certify controls.
- It does not prove a vulnerability was remediated — a recorded direction is not a completed action.
- It does not prove the absence of vulnerabilities — "no intelligence recorded" means the record holds none, not that none exist.
- It does not replace an auditor or guarantee acceptance by any customer security review.

---

Generated by OpenSoyce at 2026-06-11T07:11:29.980Z. This document is a faithful view of private workspace records and is not a compliance certification.
