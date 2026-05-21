# OpenSoyce Guard — GitHub App setup

This is the operator runbook for getting **OpenSoyce Guard** live on a real GitHub repo. Code lives at `api/guard-webhook.js` + `api/_guard-app.js`. The webhook entrypoint is:

```
POST  https://<your-domain>/api/guard-webhook
```

On Vercel that's auto-routed from `api/guard-webhook.js`. No `vercel.json` change required (the underscore-prefixed `_guard-app.js` is intentionally skipped by Vercel's auto-router and is import-only).

---

## 1. Create the GitHub App

1. Go to **https://github.com/settings/apps/new** (or your org's equivalent: `https://github.com/organizations/<org>/settings/apps/new`).
2. Fill in:
   - **App name**: `OpenSoyce Guard` (or whatever — must be unique on GitHub).
   - **Homepage URL**: your marketing site (e.g. `https://opensoyce.example.com`).
   - **Webhook URL**: `https://<your-domain>/api/guard-webhook`.
   - **Webhook secret**: generate a strong random string and save it — you'll paste it into `GUARD_WEBHOOK_SECRET` in step 3.
3. **Permissions** (Repository permissions section):
   - **Pull requests**: Read & write (needed to post PR comments).
   - **Checks**: Read & write (needed to create/update check runs).
   - **Contents**: Read-only (needed to fetch lockfile content in future versions).
   - **Metadata**: Read-only (mandatory, GitHub adds this automatically).
4. **Subscribe to events**:
   - [x] Pull request
   - [x] Installation
   - [x] Installation repositories
5. **Where can this GitHub App be installed?** — your choice. "Only on this account" is safest for testing; "Any account" if you intend public installs.
6. Click **Create GitHub App**.

---

## 2. Capture credentials

After creation, GitHub drops you on the App's settings page. Collect three things:

### App ID
Visible at the top of the settings page (small integer, e.g. `123456`). Paste into `GUARD_APP_ID`.

### Webhook secret
The string you generated in step 1.2. Paste into `GUARD_WEBHOOK_SECRET`.

### Private key
Scroll to **Private keys** → click **Generate a private key**. This downloads a `.pem` file. **You only get one chance to download it — save it somewhere safe.**

You need to base64-encode the PEM file's bytes (the env-var transport mangles raw newlines). Pick the command for your OS:

**Linux / WSL / macOS:**
```bash
base64 -w0 <path-to-downloaded.pem>
```

**macOS (BSD base64, no `-w0`):**
```bash
base64 -i <path-to-downloaded.pem> | tr -d '\n'
```

**PowerShell (Windows):**
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("<path-to-downloaded.pem>"))
```

Paste the resulting single-line base64 string into `GUARD_APP_PRIVATE_KEY_BASE64`.

---

## 3. Wire env vars

Add to your Vercel project (Project → Settings → Environment Variables), and locally to `.env`:

```
GUARD_APP_ID=123456
GUARD_APP_PRIVATE_KEY_BASE64=LS0tLS1CRUdJTi...long-base64-blob...LS0tLS0K
GUARD_WEBHOOK_SECRET=<the webhook secret from step 1.2>
```

Deploy / redeploy so the new env vars are picked up.

---

## 4. Install the App on a test repo

1. On the App's settings page, left sidebar → **Install App** → pick an account/org → choose **Only select repositories** → pick a test repo → **Install**.
2. GitHub will fire an `installation` event to your webhook. Check Vercel function logs for `guard-webhook: install event`.

---

## 5. Verify with a test PR

1. In the test repo, open a PR that modifies `package-lock.json` (or any of: `pnpm-lock.yaml`, `yarn.lock`, `uv.lock`, `poetry.lock`).
2. Within ~5 seconds you should see:
   - A new **Check Run** named **OpenSoyce Guard** appear in the PR's checks panel, briefly *in progress*, then completing as `success` with the stub summary.
   - A new **PR comment** with the `OpenSoyce Guard — verdict for <sha>` header.
3. Open a different PR that **does not** touch a lockfile. The check run should appear as `neutral` with the message "No lockfile changes detected."

If nothing happens:
- Open the App settings page → **Advanced** → **Recent Deliveries**. Each delivery shows the request/response. A red icon means our handler 4xx/5xx'd; click in for the detail.
- Common: `401 SIGNATURE_MISMATCH` → `GUARD_WEBHOOK_SECRET` differs between GitHub App settings and your env.
- Common: `500 WEBHOOK_SECRET_MISSING` / `INSTALLATION_TOKEN_FAILED` → env vars not set or private key base64 is malformed.
- Use **Redeliver** on any failed delivery to retry without making a new commit.

---

## 6. Known limitations (v0.2)

**What v0.2 added.** Installation-token caching (reused across warm invocations, 5-min safety margin before expiry), comment-ID memoization via the Check Run's `external_id`, and inline SARIF 2.1.0 reports in the Check Run summary.

- **Bounded PR file walk.** We list up to 300 files (3 pages × 100). Lockfile-only filtering means this is fine for ~all real PRs; mega-PRs with deeply-nested lockfiles in many subdirs may slip past.
- **GITHUB_TOKEN for full upstream scoring fidelity.** The scorer fetches repo metadata to classify packages. Without a GITHUB_TOKEN env var, it falls back to unauthenticated calls (60 req/hr limit). Set GITHUB_TOKEN for production installs with high PR volume.

---

## File reference

| Path                       | Purpose                                                  |
|----------------------------|----------------------------------------------------------|
| `api/guard-webhook.js`     | Webhook entry: signature verify, dispatch, check+comment. |
| `api/_guard-app.js`        | App JWT + installation token + GitHub fetch helpers.      |
| `.env.example`             | Lists the three required env vars.                       |
| `docs/guard-app-setup.md`  | This file.                                               |
