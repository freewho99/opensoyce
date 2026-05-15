#!/usr/bin/env node
// scripts/prerender.mjs
//
// Build-time prerender for /methodology.
//
// Runs AFTER `vite build`. Produces a small Node-targeted SSR bundle of
// `src/prerender-entry.tsx`, dynamically imports it, renders the React tree
// for /methodology to an HTML string, and injects the result into a copy of
// `dist/index.html`. The injected file is written to
// `dist/methodology/index.html` so that `curl https://opensoyce.com/methodology`
// returns ~real content instead of the ~1.5KB SPA shell.
//
// The SPA shell at `dist/index.html` is untouched — only /methodology is
// prerendered in this pass. Hydration still works: the browser script
// `/src/main.tsx` mounts <App/> which renders the same route tree under
// BrowserRouter, so React reconciles the SSR markup in place.
//
// No new npm deps; uses Vite + react-dom/server, both already installed.

import { build as viteBuild } from 'vite';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const SSR_OUT_DIR = path.join(root, 'dist-ssr');
const SSR_ENTRY = path.join(root, 'src', 'prerender-entry.tsx');
const DIST_DIR = path.join(root, 'dist');
const SHELL_HTML = path.join(DIST_DIR, 'index.html');

const TITLE = 'OpenSoyce Methodology — How Scores Are Calculated';
const DESCRIPTION =
  'How the Soyce Score is computed: thirteen GitHub signals across Maintenance (30%), Community (25%), Security (20%), Documentation (15%), and Activity (10%). Includes verdict bands, graveyard rules, and the signal vocabulary.';

async function main() {
  // Sanity: the regular Vite build must have run first.
  try {
    await fs.access(SHELL_HTML);
  } catch {
    throw new Error(
      `prerender: ${SHELL_HTML} not found. Run \`vite build\` before this script.`,
    );
  }

  // 1. Build a Node-targeted SSR bundle of the prerender entry.
  console.log('prerender: building SSR bundle...');
  await viteBuild({
    root,
    logLevel: 'warn',
    plugins: [react()],
    resolve: {
      alias: {
        '@': root,
      },
    },
    build: {
      ssr: SSR_ENTRY,
      outDir: SSR_OUT_DIR,
      emptyOutDir: true,
      rollupOptions: {
        input: SSR_ENTRY,
        output: {
          format: 'esm',
          entryFileNames: 'prerender-entry.mjs',
        },
      },
      // Don't minify SSR output; we'll throw it away after.
      minify: false,
      ssrManifest: false,
    },
  });

  const ssrEntryPath = path.join(SSR_OUT_DIR, 'prerender-entry.mjs');
  const ssrUrl = pathToFileURL(ssrEntryPath).href;

  // 2. Import the SSR bundle and render /methodology.
  console.log('prerender: rendering /methodology...');
  const mod = await import(ssrUrl);
  if (typeof mod.renderPath !== 'function') {
    throw new Error('prerender: SSR bundle did not export renderPath()');
  }
  const bodyHtml = mod.renderPath('/methodology');

  if (!bodyHtml || bodyHtml.length < 500) {
    throw new Error(
      `prerender: rendered body is suspiciously short (${bodyHtml?.length ?? 0} chars). Aborting.`,
    );
  }

  // 3. Read the SPA shell and inject the rendered HTML + page-specific meta.
  let shell = await fs.readFile(SHELL_HTML, 'utf8');

  // Title swap: replace the generic shell title with a methodology-specific one.
  shell = shell.replace(
    /<title>[^<]*<\/title>/,
    `<title>${escapeHtml(TITLE)}</title>`,
  );

  // Description swap: replace the generic <meta name="description"> with a
  // methodology-specific one. If a different content attr ordering is used,
  // this regex still matches because it's anchored on the name attribute.
  shell = shell.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${escapeHtml(DESCRIPTION)}" />`,
  );

  // Add og:title / og:url overrides for /methodology so social embeds aren't
  // just the generic homepage card. (og:description we re-use from the main
  // DESCRIPTION constant — same copy, same intent.)
  shell = shell.replace(
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:title" content="${escapeHtml(TITLE)}" />`,
  );
  shell = shell.replace(
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:description" content="${escapeHtml(DESCRIPTION)}" />`,
  );
  shell = shell.replace(
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:url" content="https://www.opensoyce.com/methodology" />`,
  );

  // Inject the rendered HTML into the empty <div id="root"></div>.
  if (!shell.includes('<div id="root"></div>')) {
    throw new Error(
      'prerender: could not find <div id="root"></div> in dist/index.html. Has the shell template changed?',
    );
  }
  shell = shell.replace(
    '<div id="root"></div>',
    `<div id="root">${bodyHtml}</div>`,
  );

  // 4. Write to dist/methodology/index.html.
  const outDir = path.join(DIST_DIR, 'methodology');
  const outFile = path.join(outDir, 'index.html');
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(outFile, shell, 'utf8');

  // 5. Clean up the temporary SSR bundle dir.
  await fs.rm(SSR_OUT_DIR, { recursive: true, force: true });

  const stat = await fs.stat(outFile);
  console.log(
    `prerender: wrote ${path.relative(root, outFile)} (${stat.size} bytes, ${bodyHtml.length} chars of body content)`,
  );
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

main().catch(err => {
  console.error('prerender: FAILED');
  console.error(err);
  process.exit(1);
});
