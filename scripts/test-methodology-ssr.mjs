#!/usr/bin/env node
// scripts/test-methodology-ssr.mjs
//
// Network test: asserts that /methodology is served as prerendered HTML
// (i.e. `curl` returns substantive content, not just the SPA shell).
//
// Run AFTER deploy completes. Not part of the auto-running tsc + suite —
// this is network-dependent and intentionally separate.
//
// Usage:
//   node scripts/test-methodology-ssr.mjs
//   node scripts/test-methodology-ssr.mjs --url https://www.opensoyce.com/methodology
//   node scripts/test-methodology-ssr.mjs --url http://localhost:3000/methodology
//   node scripts/test-methodology-ssr.mjs --url file:///c:/.../dist/methodology/index.html
//
// Exit codes:
//   0 — all assertions PASS
//   1 — one or more assertions FAILED
//   2 — URL unreachable / 4xx-5xx (treated as "deploy not live", not a regression)

import fs from 'node:fs/promises';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import path from 'node:path';

const DEFAULT_URL = 'https://www.opensoyce.com/methodology';

function parseArgs(argv) {
  const args = { url: DEFAULT_URL };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--url' && argv[i + 1]) {
      args.url = argv[i + 1];
      i++;
    }
  }
  return args;
}

async function fetchBody(url) {
  if (url.startsWith('file://')) {
    const filePath = fileURLToPath(url);
    const body = await fs.readFile(filePath, 'utf8');
    return { status: 200, body };
  }
  const res = await fetch(url, { redirect: 'follow' });
  const body = await res.text();
  return { status: res.status, body };
}

function assert(name, cond, detail) {
  if (cond) {
    console.log(`  PASS  ${name}`);
    return true;
  }
  console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`);
  return false;
}

async function main() {
  const { url } = parseArgs(process.argv.slice(2));
  console.log(`test-methodology-ssr: ${url}\n`);

  let status, body;
  try {
    const r = await fetchBody(url);
    status = r.status;
    body = r.body;
  } catch (err) {
    console.error(`UNREACHABLE  ${url}`);
    console.error(`  ${err?.message ?? err}`);
    console.error('  Deploy not yet live or page not accessible.');
    process.exit(2);
  }

  if (status < 200 || status >= 300) {
    console.error(`HTTP ${status}  ${url}`);
    console.error('  Deploy not yet live or page not accessible.');
    process.exit(2);
  }

  let passes = 0;
  let total = 0;
  const check = (name, cond, detail) => {
    total++;
    if (assert(name, cond, detail)) passes++;
  };

  // Size sanity: SPA shell is ~1.5KB, prerendered page should be much larger.
  check('response > 5000 bytes', body.length > 5000, `actual: ${body.length}`);

  // Methodology content fingerprints.
  check('contains "Maintenance" (case-insensitive)', /maintenance/i.test(body));
  check('contains "Security"', /Security/.test(body));
  check(
    'contains methodology pillar or vocab copy',
    /Soyce Score|FORKABLE|WATCHLIST|GRAVEYARD|Signal Vocabulary/i.test(body),
  );

  // Title check — must NOT still be the bare shell title.
  const titleMatch = body.match(/<title>([^<]*)<\/title>/i);
  const title = titleMatch ? titleMatch[1] : '';
  check(
    '<title> is methodology-specific',
    /methodology/i.test(title) || /How.*Scores/i.test(title),
    `title was: "${title}"`,
  );

  // Meta description should NOT be the shell description.
  const shellDescFragment = 'fresh, safe, documented, and worth building on';
  check(
    'meta description is NOT the generic shell description',
    !body.includes(shellDescFragment),
    'still contains the homepage description from index.html',
  );

  // Body content present.
  check(
    'rendered body content is inside #root',
    /<div id="root"><[^>]+/.test(body),
    'expected non-empty markup inside <div id="root">',
  );

  console.log(`\n${passes}/${total} assertions passed`);
  process.exit(passes === total ? 0 : 1);
}

main().catch(err => {
  console.error('test-methodology-ssr: unexpected error');
  console.error(err);
  process.exit(1);
});
