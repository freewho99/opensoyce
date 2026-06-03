# Agent Handoff — OpenSoyce

**Folder index. Updated 2026-06-03.**

You're picking up the OpenSoyce repo. Multiple engineering arcs have shipped end-to-end in parallel. Each arc has its own handoff doc in this folder. Read this README first for orientation, then the relevant arc doc(s) for whatever you're touching.

This folder grows. New arcs add a new doc; the index below + the cross-arc rules section stay current.

## Shipped arcs

| Arc | What it built | Doc | Status |
|---|---|---|---|
| Candidate Pipeline | HN scraper → admin review queue → bot-PR promotion | [candidate-pipeline.md](candidate-pipeline.md) | Closed clean (PRs #34, #35, #37, #38) |
| OTS Proof Package | Proof package + visual captures + 3 evidence-layer engineering fixes + public gate UI + version-suffix lookup fix | [ots-proof-package.md](ots-proof-package.md) | Closed clean (PRs #19 → #33) |

Both arcs ran concurrently on the same `main`. PR numbering interleaves; the OTS arc's queued #34/#35/#36 sequence was invalidated by the candidate arc's already-merged #34/#35/#37, which is why OTS's remaining follow-ups now start at #39. Treat PR-number ranges as historical anchors, not absolute slots.

The doctrines do not conflict. Both shipped clean. Future work in either area must respect the hard rules of its arc.

## How to pick up cold

1. Read this README — under 5 minutes
2. Read the arc doc for whatever the user wants to touch
3. Verify on-disk state:

   ```bash
   cd ~/projects/opensoyce
   git status         # expect clean except pre-existing untracked
   git log --oneline -5
   npm run test:ci    # expect 158 passing across both arcs
   ```

4. Verify production state for the OTS arc (current regression-test recipe):

   ```bash
   curl -sS -X POST "https://opensoyce-f336.vercel.app/api/exceptions?action=compliance-gate" \
     -H "Content-Type: application/json" \
     -d '{"dependencies":["ua-parser-js@0.7.29"]}' | grep -o '"action":"[^"]*"'
   ```

   Expected: `"action":"BLOCK"`. Anything else means OTS Hard Rule 1 (stripped-name lookup) is broken.

5. Ask the user what they want — pick from a backlog, address open prod debt, or something else
6. For non-trivial work: sketch architecture decisions first, get user sign-off via `A:foo B:bar` shorthand, THEN build (see Working Style below)
7. Match the PR body checklist pattern when opening any new PR (see Working Style)

## Cross-arc rules

These apply across every arc. Call them out in any new arc doc too.

### Forbidden without explicit user authorization

- Destructive git ops: `reset --hard`, `push --force`, `branch -D`, `clean -f`
- Merging PRs into main
- Pushing commits to main directly
- Modifying Vercel environment variables
- Deleting GitHub Actions secrets

### Working style (consistent across arcs)

- **Sketch decisions before code.** For non-trivial work, the user wants 3–6 architecture choices surfaced as binary options with recommended defaults BEFORE you write a line. Use the `A:foo B:bar C:baz` shorthand format for their reply.
- **Splits over bundles.** When a chunk of work has natural seams, the user prefers separate PRs. Don't bundle multiple architectural decisions into one mega-PR.
- **Reviews are real.** Across both arcs, the user has caught real bugs in PR review. Take review findings seriously — they're not pro-forma.
- **Doctrine is enforced in code, not decoration.** When the user says "X never writes Y" or "X always goes through Z" — those are hard rules. Catching violations is part of the job.
- **PR body checklist pattern.** Every PR in both arcs includes an 8-item merge review checklist in the body, with each item anchored to a specific file/test to verify against. Match this pattern for any new PR.
- **Code-level + sandbox verification when end-to-end isn't possible.** The user accepts mocked tests + sandbox UI verification as merge gates when production end-to-end is blocked by infra.
- **Memory hygiene.** User memory files at `~/.claude/projects/c--Users-pfinn-projects-angular-tradebuddy-admin/memory/` are the cross-session anchor. Update them when significant work closes or new doctrine/findings emerge. Markdownlint warnings on those files are cosmetic noise — ignore them.

## Adding a new arc

When a new engineering arc closes, write its handoff at `docs/handoff/<arc-slug>.md` and add a row to the Shipped arcs table above. Each arc doc should have these sections, in this order:

1. **TL;DR for the impatient** — 5 bullets max, orients a cold reader in 10 seconds
2. **What's on main** — table of merged PRs with hashes + 1-line descriptions
3. **Doctrine** — hard rules enforced in code, not aspirational prose
4. **Architecture quick map** — ASCII diagram of the data flow
5. **What's safe vs. what needs user input vs. forbidden** — three-tier matrix
6. **Codebase quick reference** — where files live, test commands, auth model
7. **Open prod debt** — known broken things in production, framed as decisions not engineering
8. **Backlog** — queued PRs that the next agent must NOT start without explicit user call
9. **Production verification recipe** — exact commands / SQL / click-through to confirm the arc is healthy
10. **Stuff that's NOT this arc** — list pre-existing debt or parallel work the agent will trip over
11. **Getting-started sequence** — 6 steps for a new agent picking up from cold start

Keep doctrine, working style, and forbidden-ops at the README level if they're cross-arc. Keep arc-specific doctrine inside the arc doc.

## Contact

Repo: <https://github.com/freewho99/opensoyce>
Primary maintainer: @freewho99 (also the reviewer for `OPENSOYCE_REVIEWERS`)
