#!/usr/bin/env node
// Reverse the UTF-8-as-Latin-1-as-UTF-8 corruption that has crept into
// tracked text files. The detector at scripts/check-mojibake.mjs flagged
// these byte patterns; this script substitutes each known-mangled
// sequence with its original UTF-8 bytes.
//
// We deliberately do NOT match bare `0xC3 0xA2` (which is a valid `â`)
// because that would corrupt legitimate accented Latin characters. Each
// mapping below is a multi-byte sequence that only occurs in real text
// as a mangled multibyte glyph.
//
// Usage:
//   node scripts/fix-mojibake.mjs            # write changes
//   node scripts/fix-mojibake.mjs --dry      # report only, no writes

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const DRY_RUN = process.argv.includes('--dry');

// Skip files where the mangled bytes are LITERAL DATA we don't want to rewrite.
// scripts/check-mojibake.mjs contains the byte sequences inside string literals
// as part of its detection table.
const SKIP_FILES = new Set([
  'scripts/check-mojibake.mjs',
  'scripts/fix-mojibake.mjs',
]);

// Mapping table: each entry is mangled-hex -> original-utf8-hex.
// Format is paired chars: each mangled byte is `c3aX` or `c2YY`, and the
// original byte is decoded by going from Latin-1 back to its single byte.
//
// We list every observed mangled sequence rather than building a general
// "any 0xC3 0xAX followed by 0xC2 0xYY" replacer, because the general form
// would also rewrite legitimate sequences like `â\xa0` (a-circumflex + nbsp)
// that don't appear in mojibake but could appear in real text. Specific
// allowlisted sequences only.
//
// Each comment shows: mangled glyph -> intended glyph.
const FIXES = [
  // --- 3-byte UTF-8 sequences (lead byte 0xE2 — many typographic + symbols)
  { hex: 'c3a2c280c293', to: 'e28093', meaning: 'â\\u0080\\u0093 -> – (en-dash)' },
  { hex: 'c3a2c280c294', to: 'e28094', meaning: 'â\\u0080\\u0094 -> — (em-dash)' },
  { hex: 'c3a2c280c298', to: 'e28098', meaning: 'â\\u0080\\u0098 -> ‘ (left single quote)' },
  { hex: 'c3a2c280c299', to: 'e28099', meaning: 'â\\u0080\\u0099 -> ’ (right single quote / apostrophe)' },
  { hex: 'c3a2c280c29c', to: 'e2809c', meaning: 'â\\u0080\\u009c -> “ (left double quote)' },
  { hex: 'c3a2c280c29d', to: 'e2809d', meaning: 'â\\u0080\\u009d -> ” (right double quote)' },
  { hex: 'c3a2c280c2a6', to: 'e280a6', meaning: 'â\\u0080\\u00a6 -> … (ellipsis)' },
  { hex: 'c3a2c280c2a2', to: 'e280a2', meaning: 'â\\u0080\\u00a2 -> • (bullet)' },
  { hex: 'c3a2c280c2b9', to: 'e280b9', meaning: 'â\\u0080\\u00b9 -> ‹' },
  { hex: 'c3a2c280c2ba', to: 'e280ba', meaning: 'â\\u0080\\u00ba -> ›' },
  // ⭐ (U+2B50) and other symbols
  { hex: 'c3a2c2adc290', to: 'e2ad90', meaning: 'â\\u00ad\\u0090 -> ⭐' },
  // ✓ (U+2713)
  { hex: 'c3a2c29cc293', to: 'e29c93', meaning: 'â\\u009c\\u0093 -> ✓' },
  // ✗ (U+2717)
  { hex: 'c3a2c29cc297', to: 'e29c97', meaning: 'â\\u009c\\u0097 -> ✗' },
  // → (U+2192)
  { hex: 'c3a2c286c2920', to: 'e28692', meaning: 'â\\u0086\\u0092 -> → (arrow)', note: 'inline trailing byte' },
  { hex: 'c3a2c286c292', to: 'e28692', meaning: 'â\\u0086\\u0092 -> → (right arrow)' },
  // ← (U+2190)
  { hex: 'c3a2c286c290', to: 'e28690', meaning: 'â\\u0086\\u0090 -> ← (left arrow)' },

  // --- 4-byte UTF-8 sequences (lead byte 0xF0 — emojis above U+10000)
  // 🍴 fork
  { hex: 'c3b0c29fc28dc2b4', to: 'f09f8db4', meaning: '\\u00f0\\u009f\\u008d\\u00b4 -> 🍴' },
  // 🐛 bug
  { hex: 'c3b0c29fc290c29b', to: 'f09f909b', meaning: '\\u00f0\\u009f\\u0090\\u009b -> 🐛' },
  // 📅 calendar
  { hex: 'c3b0c29fc293c285', to: 'f09f9385', meaning: '\\u00f0\\u009f\\u0093\\u0085 -> 📅' },
  // 🔑 key
  { hex: 'c3b0c29fc294c291', to: 'f09f9491', meaning: '\\u00f0\\u009f\\u0094\\u0091 -> 🔑' },
  // 🧩 puzzle
  { hex: 'c3b0c29fc2a7c2a9', to: 'f09fa7a9', meaning: '\\u00f0\\u009f\\u00a7\\u00a9 -> 🧩' },
  // 🚀 rocket
  { hex: 'c3b0c29fc29a c280', to: 'f09f9a80', meaning: 'rocket variant a', note: 'inline space' },
  { hex: 'c3b0c29fc29ac280', to: 'f09f9a80', meaning: '\\u00f0\\u009f\\u009a\\u0080 -> 🚀' },
  // 🔥 fire
  { hex: 'c3b0c29fc294c2a5', to: 'f09f94a5', meaning: '\\u00f0\\u009f\\u0094\\u00a5 -> 🔥' },
  // 📊 bar chart
  { hex: 'c3b0c29fc293c28a', to: 'f09f938a', meaning: '\\u00f0\\u009f\\u0093\\u008a -> 📊' },
];

// Strip placeholder/invalid hex entries (spaces, comments-only).
const VALID_FIXES = FIXES.filter(f => /^[0-9a-f]+$/.test(f.hex) && f.hex.length % 2 === 0);

const TEXT_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.html', '.css'];

function trackedTextFiles() {
  const out = execSync('git ls-files', { cwd: REPO_ROOT, encoding: 'utf-8' });
  return out.split(/\r?\n/).filter(Boolean).filter(f => {
    const dot = f.lastIndexOf('.');
    if (dot < 0) return false;
    return TEXT_EXTS.includes(f.slice(dot).toLowerCase());
  });
}

function fixFile(relPath) {
  if (SKIP_FILES.has(relPath.replace(/\\/g, '/'))) return null;

  let buf;
  try {
    buf = readFileSync(resolve(REPO_ROOT, relPath));
  } catch { return null; }

  let hex = buf.toString('hex');
  let totalSubs = 0;
  const perPattern = [];

  for (const fix of VALID_FIXES) {
    let count = 0;
    let next = '';
    let i = 0;
    while (i < hex.length) {
      // Byte-align: only consider matches starting on even hex positions.
      if (i % 2 === 0 && hex.startsWith(fix.hex, i)) {
        next += fix.to;
        i += fix.hex.length;
        count += 1;
      } else {
        next += hex[i];
        i += 1;
      }
    }
    if (count > 0) {
      hex = next;
      totalSubs += count;
      perPattern.push({ meaning: fix.meaning, count });
    }
  }

  if (totalSubs === 0) return null;

  const newBuf = Buffer.from(hex, 'hex');
  if (!DRY_RUN) writeFileSync(resolve(REPO_ROOT, relPath), newBuf);
  return { totalSubs, perPattern };
}

function main() {
  const files = trackedTextFiles();
  const results = [];

  for (const f of files) {
    try {
      const stat = statSync(resolve(REPO_ROOT, f));
      if (!stat.isFile()) continue;
    } catch { continue; }

    const r = fixFile(f);
    if (r) results.push({ file: f, ...r });
  }

  if (results.length === 0) {
    console.log('fix-mojibake: no known-mangled sequences found.');
    process.exit(0);
  }

  const totalSubs = results.reduce((a, r) => a + r.totalSubs, 0);
  const mode = DRY_RUN ? 'WOULD REWRITE' : 'rewrote';
  console.log(`fix-mojibake: ${mode} ${results.length} files, ${totalSubs} substitutions.\n`);
  for (const r of results) {
    console.log(`  ${r.file} (${r.totalSubs})`);
    for (const p of r.perPattern) {
      console.log(`    ${p.count}× ${p.meaning}`);
    }
  }
  if (DRY_RUN) console.log('\n(dry run — no files written. Re-run without --dry to apply.)');
}

main();
