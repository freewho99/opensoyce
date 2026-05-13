#!/usr/bin/env node
// Detect mojibake — UTF-8 multibyte sequences that have been mangled into
// Latin-1-style byte sequences and re-saved. The bytes are valid UTF-8
// (single-byte codepoints in 0x80-0xFF range) so .gitattributes
// working-tree-encoding=UTF-8 doesn't catch them.
//
// Patterns to detect are the UTF-8 byte sequences of common mojibake glyphs.
// We scan files as bytes so we don't depend on what the runtime thinks
// the file's encoding is.
//
// Usage:
//   node scripts/check-mojibake.mjs           # scans tracked text files
//   node scripts/check-mojibake.mjs --fix     # not implemented; report only
//
// Exit codes:
//   0 — no mojibake found
//   1 — mojibake found (lists locations)
//   2 — invocation error

import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');

// Hex byte sequences indicating common UTF-8-as-Latin-1 re-encoding.
// Each entry: { name, bytes (hex), originallyMeant }.
// Patterns are the literal bytes you'd find on disk in a mangled file.
const PATTERNS = [
  // Common Latin-1 punctuation mangled to UTF-8 of the Latin-1 chars
  { name: 'mangled em-dash (—)', bytes: 'e2 80 94 c2'.replace(/ /g, '') /* unused — fallback */, originallyMeant: '—' },
  // Real-world mojibake byte sequences observed in this repo's history
  { name: 'em-dash mangled', bytes: 'c3a2', sample: 'â' },
  { name: '4-byte emoji leading mangled', bytes: 'c3b0c29f', sample: 'ð\x9f-prefix' },
  { name: '3-byte emoji leading mangled', bytes: 'c3a2c2ad', sample: 'â\xad-prefix (e.g. mangled ⭐)' },
  { name: 'check-mark mangled', bytes: 'c3a2c29cc293', sample: 'â\x9c\x93 (✓)' },
  { name: 'curly-quote left mangled', bytes: 'c3a2c282', sample: 'â\x82-prefix' },
  { name: 'curly-quote right mangled', bytes: 'c3a2c280', sample: 'â\x80-prefix' },
];

// Source file extensions to scan. We deliberately do not scan binary types
// (png/jpg/etc.) because the byte patterns can appear in image data.
const TEXT_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.html', '.css'];

function trackedTextFiles() {
  const out = execSync('git ls-files', { cwd: REPO_ROOT, encoding: 'utf-8' });
  return out.split(/\r?\n/).filter(Boolean).filter(f => {
    const dot = f.lastIndexOf('.');
    if (dot < 0) return false;
    return TEXT_EXTS.includes(f.slice(dot).toLowerCase());
  });
}

function scanFile(relPath) {
  let buf;
  try {
    buf = readFileSync(resolve(REPO_ROOT, relPath));
  } catch (e) {
    return [];
  }
  const hits = [];
  // Convert buffer to a hex string for a single sweep per pattern.
  // For large files this is still O(n * patterns) but n is tiny in practice.
  const hex = buf.toString('hex');
  for (const p of PATTERNS) {
    let idx = 0;
    while ((idx = hex.indexOf(p.bytes, idx)) >= 0) {
      // Translate hex offset back to byte offset, then to line number.
      const byteOffset = idx / 2;
      const upto = buf.subarray(0, byteOffset);
      const lineNumber = upto.toString('utf-8').split('\n').length;
      hits.push({ pattern: p.name, sample: p.sample, line: lineNumber });
      idx += p.bytes.length;
    }
  }
  return hits;
}

function main() {
  const files = trackedTextFiles();
  const findings = [];

  for (const f of files) {
    try {
      const stat = statSync(resolve(REPO_ROOT, f));
      if (!stat.isFile()) continue;
    } catch { continue; }

    const hits = scanFile(f);
    if (hits.length) findings.push({ file: f, hits });
  }

  if (findings.length === 0) {
    console.log('check-mojibake: no mojibake byte sequences found in tracked text files.');
    process.exit(0);
  }

  console.error('check-mojibake: mojibake-style byte sequences detected.\n');
  for (const { file, hits } of findings) {
    console.error(`  ${file}`);
    // Deduplicate hits per file: report each pattern only once with count.
    const byPattern = new Map();
    for (const h of hits) {
      const k = h.pattern;
      const acc = byPattern.get(k) || { count: 0, firstLine: h.line, sample: h.sample };
      acc.count += 1;
      acc.firstLine = Math.min(acc.firstLine, h.line);
      byPattern.set(k, acc);
    }
    for (const [pattern, info] of byPattern) {
      console.error(`    ${pattern} — ${info.count}× (first at line ${info.firstLine})${info.sample ? `, e.g. "${info.sample}"` : ''}`);
    }
  }
  console.error('\nThese byte sequences indicate UTF-8 content was saved through an');
  console.error('editor that mangled it to Latin-1 single bytes. The fix is in the');
  console.error('editor that produced the commit, not in the files. See README.');
  process.exit(1);
}

main();
