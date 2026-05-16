# OpenSoyce `/claim` rebuttal channel

`/claim` is the maintainer push-back path for a wrong Soyce Score. It is not
a self-grading badge; it is a real GitHub OAuth-gated channel that opens a
public, labeled issue against `freewho99/opensoyce`.

## What it does

1. The maintainer visits `/claim`, enters the `owner/repo` they maintain.
2. They click **Verify with GitHub** — the browser hits `/api/claim-start`,
   which 302-redirects to GitHub OAuth.
3. After authorize, GitHub redirects to `/api/claim-callback`, which:
   - verifies the HMAC-signed `state` parameter (CSRF defense),
   - exchanges the code for an OAuth token,
   - calls `GET /repos/{owner}/{repo}/collaborators/{login}` to confirm the
     authenticated user maintains the claimed repo,
   - **discards the OAuth token**,
   - mints a short-lived (10 min) HMAC-signed claim-token bound to
     `{ owner, repo, login, exp }`, and redirects back to `/claim`.
4. The form on `/claim` (now in "verified" mode) accepts a markdown rebuttal
   body (30–10 000 chars). The form POSTs `{ token, rebuttalBody }` to
   `/api/claim-submit`.
5. `/api/claim-submit` verifies the claim-token, then uses the OpenSoyce
   GitHub App (`GITHUB_APP_ID` + `GITHUB_APP_PRIVATE_KEY`) to open an issue
   on `freewho99/opensoyce` with label `claim-rebuttal`. Returns the issue
   URL to the client, which renders a confirmation.

## OAuth scope

We request `read:user repo`:

- `read:user` reads the authenticated user's login (`@handle`) so we can
  bind the rebuttal to a specific person.
- `repo` is required so the collaborators API works on both public and
  private repos through one code path.

The OAuth access token lives in memory for the duration of two GitHub API
calls (~one second) and is discarded the moment collaborator verification
returns. **It is never stored, never logged, and never placed in any
URL or redirect query string.** Maintainers can revoke the OpenSoyce OAuth
authorization at any time from
https://github.com/settings/applications — revoking has no effect on
already-filed rebuttals.

## Where rebuttals land

Every successful submission opens a new public issue at
`https://github.com/freewho99/opensoyce/issues` with:

- Label: `claim-rebuttal`
- Title: `Score rebuttal: {owner}/{repo} — @{login}`
- Body: a markdown block linking the repo, naming the verified
  collaborator, the verification timestamp, the rebuttal text, and a
  trailing disclosure that the OAuth token was not retained.

The issue is opened by the **OpenSoyce GitHub App**, not by the maintainer's
own account — so the rebuttal does not consume their personal GitHub API
budget and the App carries the audit identity.

## Subscribing as the rebuttal author

The submitter is *not* automatically subscribed to the new issue (the App,
not the user, opened it). When the success screen renders the issue URL,
click **Subscribe** on the GitHub issue page to receive email notifications
when the OpenSoyce team replies.

## Failure modes (user-visible)

| Condition                            | Where         | Response                                                                              |
| ------------------------------------ | ------------- | ------------------------------------------------------------------------------------- |
| Bad owner/repo input                 | `/claim-start`| 400 JSON `INVALID_OWNER_OR_REPO`                                                      |
| OAuth missing `code` or `state`      | `/callback`   | 400 friendly HTML, link back to `/claim`                                              |
| State token tampered / wrong key     | `/callback`   | 400 HTML "Invalid state" (CSRF defense)                                               |
| OAuth code exchange failed           | `/callback`   | 400 HTML "OAuth failed", error description shown                                      |
| User is not a collaborator (`404`)   | `/callback`   | 403 HTML "GitHub says @{login} isn't a collaborator on {owner}/{repo}"                |
| OAuth lacked scope (`403`)           | `/callback`   | 403 HTML "Could not verify access"                                                    |
| Claim token expired (>10 min)        | `/submit`     | 401 JSON, frontend renders "Re-verify with GitHub"                                    |
| Rebuttal < 30 chars                  | `/submit`     | 400 JSON `BODY_TOO_SHORT`                                                             |
| Rebuttal > 10 000 chars              | `/submit`     | 400 JSON `BODY_TOO_LONG`                                                              |
| GitHub App auth failed               | `/submit`     | 502 JSON `GITHUB_APP_UNAVAILABLE`, retry suggested                                    |
| Issue create denied (App perm gone)  | `/submit`     | 502 JSON `ISSUE_CREATE_FAILED` — usually means the App lost Issues:write on the repo  |

If `ISSUE_CREATE_FAILED` shows up, check that the OpenSoyce App still has
**Issues: write** permission on `freewho99/opensoyce` in
https://github.com/organizations/.../settings/apps (or the user account
that owns the repo). Re-installing or updating the App permissions resolves
it.

## Env vars used

- `GITHUB_OAUTH_CLIENT_ID` — OAuth App client ID (public).
- `GITHUB_OAUTH_CLIENT_SECRET` — OAuth client secret. **Also reused as the
  HMAC key** for signing state + claim tokens (it's already private and
  already loaded; no new env var).
- `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` — existing GitHub App credentials
  used to open the issue on `freewho99/opensoyce`.

The GitHub App's webhook secret is unrelated to this flow.
