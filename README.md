<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# OpenSoyce

A "nutrition label" for open-source GitHub repositories. Enter `owner/repo`, get a 0-10 Soyce Score across five pillars (maintenance, community, security, documentation, activity) and an embeddable README badge.

## Run Locally

**Prerequisites:** Node.js 20+

1. Install dependencies:

   ```sh
   npm install
   ```

2. Optional — create `.env` and set `GITHUB_TOKEN` to a GitHub Personal Access Token. Without it, the GitHub API allows 60 unauthenticated requests per hour; with it, 5000.

   ```sh
   GITHUB_TOKEN=ghp_...
   ```

3. Run the dev server (Express + Vite middleware on port 3000):

   ```sh
   npm run dev
   ```

## Project Layout

- `server.ts` — Express dev server (API routes + Vite SPA)
- `api/` — Vercel serverless functions used in production
- `src/shared/scoreCalculator.js` — single scoring algorithm shared by both runtimes
- `src/pages/Lookup.tsx` — the repo lookup UI

## Encoding check

The blog content has repeatedly had its emoji and em-dashes mangled into Latin-1-style byte sequences by an editor that doesn't preserve UTF-8 on save. `.gitattributes` can't prevent this because the mangled bytes are technically valid UTF-8.

A scanner is available:

```sh
npm run check:mojibake
```

Exits non-zero and lists offending files + lines if mangled byte sequences are present. Run before committing content edits; consider wiring into a pre-commit hook locally. The real fix is to use an editor that writes UTF-8 correctly (VS Code with default settings does; some web-based editors and AI Studio export paths do not).
