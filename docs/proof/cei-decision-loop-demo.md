# CEI Decision Loop — Demo Walkthrough

## Purpose

This script demonstrates the Phase 6 proposal/audit loop end-to-end on a live workspace.

The goal is not to show that OpenSoyce found a risk.

The goal is to show that when a human turned an observed exposure into a trust decision, the system kept the receipts — who proposed, from what, who decided, what happened next — without ever deciding for them.

The script is human-runnable today. It uses only surfaces that exist on `main` at `da986f4`.

## Demo Setup

- A vault workspace you own or review in: `/vault/:slug` (sign in via GitHub OAuth).
- Two accounts are ideal — one `member` (proposer) and one `reviewer` — because the four-eye rule blocks a reviewer from approving their own proposal. One `owner` account works in a pinch (owner may self-approve).
- One package exposure to work with. Today exposures are created via the authenticated API only (manual create — that is the honest current state; ingestion is parked):

```txt
POST /api/vault/workspaces/:slug/exposures
{
  "exposure_type": "dependency-exposure",
  "subject_kind": "package",
  "subject_name": "ua-parser-js",
  "source_kind": "manual",
  "metadata": { "note": "observed in build manifest" },
  "trust_boundary": { "surface": "ci" }
}
```

- Proof docs referenced during the demo:
  - [Phase 6 Closeout](../strategy/phase-6-closeout.md)
  - [Phase 5 Closeout](../strategy/phase-5-closeout.md) (the decision machinery this loop rides on)

## Talk Track

Most tools stop at "we detected a risky component."

The real question comes after detection: someone decides to trust it anyway — temporarily, with reasons, with an expiry. Who proposed that? What was it based on? Who signed off? What happened next?

This walkthrough shows OpenSoyce answering all four questions from one screen each, with the system as scribe — never as judge.

---

## Beat 1 — The exposure exists

Click: `/vault/:slug/exposures`, then open the `ua-parser-js` exposure.

Say: "An exposure is an observation. Something exists or changed. It is not an exception, not evidence, not policy. It carries no decision."

Notice: the detail page is read-only facts — type, subject, source, trust boundary, timestamps. There is no approve button here. There never will be.

## Beat 2 — A human proposes a trust decision from it

Click: "Propose exception from this exposure" on the exposure detail page (as the member account).

Say: "The exposure can *suggest* a trust decision. It does not become one. A human opens a draft, reviews it, edits the reasons, and submits."

Notice: two steps — review, then submit. There is no one-click path. The proposal lands as `proposed`, never as active. The exposure itself did not change.

## Beat 3 — CEI recorded the relationship

Click: back to the exposure detail page. Scroll to **Decision history**.

Say: "The moment the proposal was created, CEI recorded the relationship in its own audit surface: this exception was proposed from this exposure, by this person, at this time."

Notice: this is not the shared Vault Timeline. The Phase 5 timeline records the decision lifecycle; CEI records the decision's *relationship* to the exposure. Separate tables, separate doctrine, structurally tested.

## Beat 4 — The reviewer sees where it came from

Click: the exception detail page (as the reviewer account). Scroll to the **Source exposure** card.

Say: "The reviewer evaluating this proposal sees the source exposure without leaving the page — type, status, subject, who proposed it, when. Context only. The card changes nothing about the review."

Notice: the card says it out loud: "Context only — you still decide."

## Beat 5 — The reviewer decides

Click: **approve** (or reject — both make the same point).

Say: "A human with the reviewer role makes the call. Approval requires an expiry and a public reason. A reviewer cannot approve their own proposal. The state machine enforces all of this — it is the Phase 5 machine, unchanged by Phase 6."

Notice: the decision is the exception's state change. Not a CEI event. CEI never touches the state machine.

## Beat 6 — CEI recorded the outcome, back on the exposure

Click: return to the exposure detail page. Look at **Decision history** again.

Say: "The loop closed. The history now reads: proposed from this exposure, then approved — who, and when. If the exception is later revoked, that lands here too."

Notice: the full story lives where the risk was first observed. Exposure observed → proposal → reviewer context → decision → recorded relationship.

## The Close

Six beats, one doctrine:

```txt
The exposure suggested.
The user proposed.
The reviewer saw context.
The reviewer decided.
CEI recorded the relationship.
The system did not decide for them.
```

OpenSoyce does not sell automation theater.

OpenSoyce sells trust decisions you can inspect — including the human who made them.

## Honest edges (name them if asked)

- Exposures are created by authenticated API call today. CLI/CI ingestion is parked, not missing by accident.
- Expiry is enforced at read/gate time; there is no reaper yet, so no `expired` outcome event exists — deliberately, because the event would have no actor and nothing transitions the state today.
- Exception subjects cover packages and repos; only package-subject exposure types offer the propose action. The other native types say so instead of pretending.
