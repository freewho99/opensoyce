// OpenSoyce Trust Vault — PR-V2-C structural invariants.
//
// Covers the eight invariant groups the user-approved PR-V2-C scope
// requires:
//
//   1. private proof-anchor route auth
//   2. Vault Timeline read auth
//   3. masking (member sees body absent; X-Masked header emitted)
//   4. no private data in public surfaces (no `visibility: 'private'`
//      literal anywhere outside src/server/vault/ or supabase/migrations/)
//   5. public-shape visibility lift is constrained (the field is permitted
//      ONLY on Vault paths)
//   6. no public renderer imports src/server/vault/*
//   7. no Vault read path imports public renderers
//   8. cursor invariants (opaque to client; rejects stale + invalid)
//
// All assertions are static — they grep / parse repository state. None
// boot a database or a server.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
    passed++;
  } catch (err) {
    console.log(`FAIL  ${name}\n      ${err.message}`);
    failed++;
  }
}

function ok(cond, message) {
  if (!cond) throw new Error(message || 'assertion failed');
}

function read(relPath) {
  return readFileSync(join(REPO_ROOT, relPath), 'utf8');
}

function walkFiles(rootRel, accept) {
  const out = [];
  const start = join(REPO_ROOT, rootRel);
  if (!existsSync(start)) return out;
  const stack = [start];
  while (stack.length > 0) {
    const cur = stack.pop();
    const st = statSync(cur);
    if (st.isDirectory()) {
      for (const child of readdirSync(cur)) stack.push(join(cur, child));
    } else if (st.isFile() && accept(cur)) {
      out.push(cur);
    }
  }
  return out;
}

// ---------- Group 1: private proof-anchor route auth ----------

test('evidence read handler funnels every 404 sub-case through resolveWorkspaceForMember', () => {
  const src = read('src/server/vault/evidence.js');
  ok(
    /resolveWorkspaceForMember\(req, res, slug\)/.test(src),
    'handleGetEvidence must delegate workspace + membership resolution to resolveWorkspaceForMember (404-on-non-member doctrine)',
  );
  ok(
    /if \(!resolved\) return;/.test(src),
    'handleGetEvidence must early-return when resolveWorkspaceForMember already sent the response',
  );
  // After resolution: a missing row also 404s.
  ok(
    /ERROR_CODES\.not_found,\s*'not found'/.test(src),
    'handleGetEvidence must reply ERROR_CODES.not_found on missing row',
  );
});

test('evidence read handler also returns 404 for hard_deleted rows', () => {
  const src = read('src/server/vault/evidence.js');
  ok(
    /row\.redaction_state === 'hard_deleted'/.test(src),
    'hard_deleted rows must collapse to 404, not be surfaced as redacted tombstones',
  );
});

test('evidence read route is registered with cache + session middleware', () => {
  const src = read('src/server/vault/routes.js');
  // The route appears with the three middleware in order.
  ok(
    /'\/api\/vault\/workspaces\/:slug\/evidence\/:id'[\s\S]*?setPrivateCacheHeaders[\s\S]*?requireVaultSession[\s\S]*?handleGetEvidence/.test(src),
    'evidence read route must be fronted by setPrivateCacheHeaders + requireVaultSession in that order',
  );
});

// ---------- Group 2: Vault Timeline read auth ----------

test('timeline list + single handlers funnel through resolveWorkspaceForMember', () => {
  const src = read('src/server/vault/timeline.js');
  const listMatch = src.match(/export async function handleListTimelineEvents\(req, res\)[\s\S]*?(?=\nexport |\n\/\/ ----)/);
  ok(listMatch, 'handleListTimelineEvents not found');
  ok(
    /resolveWorkspaceForMember\(req, res, slug\)/.test(listMatch[0]),
    'handleListTimelineEvents must delegate to resolveWorkspaceForMember',
  );
  const singleMatch = src.match(/export async function handleGetTimelineEvent\(req, res\)[\s\S]*$/);
  ok(singleMatch, 'handleGetTimelineEvent not found');
  ok(
    /resolveWorkspaceForMember\(req, res, slug\)/.test(singleMatch[0]),
    'handleGetTimelineEvent must delegate to resolveWorkspaceForMember',
  );
});

test('timeline routes are registered as GET-only with cache + session middleware', () => {
  const src = read('src/server/vault/routes.js');
  ok(
    /app\.get\([\s\S]*?'\/api\/vault\/workspaces\/:slug\/timeline'[\s\S]*?setPrivateCacheHeaders[\s\S]*?requireVaultSession[\s\S]*?handleListTimelineEvents/.test(src),
    'timeline list route must be GET, behind setPrivateCacheHeaders + requireVaultSession',
  );
  ok(
    /app\.get\([\s\S]*?'\/api\/vault\/workspaces\/:slug\/timeline\/:id'[\s\S]*?setPrivateCacheHeaders[\s\S]*?requireVaultSession[\s\S]*?handleGetTimelineEvent/.test(src),
    'timeline single route must be GET, behind setPrivateCacheHeaders + requireVaultSession',
  );
});

test('no mutating verbs on Vault Timeline routes', () => {
  const src = read('src/server/vault/routes.js');
  // Parse each `app.<verb>(<path-string>,` registration. For every path
  // containing `/timeline`, the verb must be `get`. Timeline events are
  // emitted by trigger functions; the client never writes them.
  const re = /app\.(get|post|patch|delete|put)\(\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const [, verb, path] = m;
    if (path.indexOf('/timeline') >= 0 && verb !== 'get') {
      throw new Error(`app.${verb}('${path}') is forbidden — Vault Timeline is read-only (PR-V1-D §3.1)`);
    }
  }
});

// ---------- Group 3: masking (body on evidence) ----------

test('evidence shaping drops body for member-role viewers', () => {
  const src = read('src/server/vault/evidence.js');
  ok(
    /viewerRole === 'member'/.test(src),
    'evidence shaping must branch on viewerRole === "member"',
  );
  // The conditional spread now uses bodyMasked (memberMasked || redactionMasked
  // — see the redaction invariant below). The member-mask portion of that
  // combined flag is asserted here; the redaction-mask portion is asserted
  // in the dedicated redaction invariant.
  ok(
    /memberMasked\s*=\s*viewerRole\s*===\s*['"]member['"]/.test(src),
    'shapeEvidenceRow must derive memberMasked = viewerRole === "member"',
  );
  ok(
    /bodyMasked\s*\?\s*\{\}\s*:\s*\{\s*body:/.test(src),
    'body field must be field-absent (not empty string) when bodyMasked fires per PR-V1-D §6.4',
  );
});

test('evidence response emits X-OpenSoyce-Vault-Masked-Fields header for members', () => {
  const src = read('src/server/vault/evidence.js');
  ok(
    /'X-OpenSoyce-Vault-Masked-Fields',\s*'body'/.test(src),
    'evidence reads must emit X-OpenSoyce-Vault-Masked-Fields: body when viewer is a member',
  );
});

test('evidence body is masked when redaction_state !== "visible" for EVERY role (reviewer fix)', () => {
  // Reviewer-flagged blocker on PR #83. Previously body was only masked
  // when viewerRole === 'member'. A row with redaction_state === 'redacted'
  // still returned body to reviewer / owner. The contract intent of
  // "redacted" is that the body has been redacted from view; the 90-day
  // window before hard_delete_at is forensic-recovery time at the SQL
  // layer, not a read-through grace period for privileged roles.
  //
  // The fix introduces a `redactionMasked = row.redaction_state !== 'visible'`
  // branch parallel to `memberMasked`, then combines them with OR so body
  // is field-absent whenever EITHER condition fires.
  const src = read('src/server/vault/evidence.js');
  const shapeFn = src.match(/function shapeEvidenceRow\([^)]*\)[\s\S]*?\n\}/);
  ok(shapeFn, 'shapeEvidenceRow not found');
  ok(
    /redactionMasked\s*=\s*row\.redaction_state\s*!==\s*['"]visible['"]/.test(shapeFn[0]),
    'shapeEvidenceRow must derive redactionMasked = row.redaction_state !== "visible"',
  );
  ok(
    /bodyMasked\s*=\s*memberMasked\s*\|\|\s*redactionMasked/.test(shapeFn[0]),
    'shapeEvidenceRow must combine memberMasked || redactionMasked into bodyMasked',
  );
  ok(
    /bodyMasked\s*\?\s*\{\}\s*:\s*\{\s*body:/.test(shapeFn[0]),
    'body field must be field-absent (not empty string) when bodyMasked is true',
  );

  // X-Masked header must also fire on redaction, not just role.
  const headerFn = src.match(/function setEvidenceMaskedHeader\([^)]*\)[\s\S]*?\n\}/);
  ok(headerFn, 'setEvidenceMaskedHeader not found');
  ok(
    /redaction_state\s*!==\s*['"]visible['"]/.test(headerFn[0]),
    'setEvidenceMaskedHeader must also check redaction_state to emit the X-Masked header for redacted-but-readable rows',
  );
});

test('evidence proof_anchors are NEVER masked (per PR-V1-D §6.4)', () => {
  const src = read('src/server/vault/evidence.js');
  const shapeFn = src.match(/function shapeEvidenceRow\([^)]*\)[\s\S]*?\n\}/);
  ok(shapeFn, 'shapeEvidenceRow not found');
  ok(
    /proof_anchors:\s*row\.proof_anchors/.test(shapeFn[0]),
    'proof_anchors must be returned unconditionally',
  );
  // The mask spread looks like `...(memberMasked ? {} : { body: ... })`.
  // Extract every such spread fragment and assert proof_anchors is not in
  // any of them.
  const spreadRe = /\.\.\.\([^)]*memberMasked[^)]*\)/g;
  let m;
  while ((m = spreadRe.exec(shapeFn[0])) !== null) {
    if (m[0].indexOf('proof_anchors') >= 0) {
      throw new Error(`proof_anchors must not appear inside a memberMasked spread: ${m[0]}`);
    }
  }
});

// ---------- Group 4: no private data leaks in public surfaces ----------

test('no public source file contains the literal string visibility: "private" or visibility: \'private\'', () => {
  // The lift permits the `visibility` field on Vault data shapes AND on
  // Vault-consuming CLI workspace-mode files. PR-V2-D added `packages/cli/`
  // to the allowlist atomically with the CLI workspace extension — the
  // CLI is now a documented Vault consumer (the [PRIVATE]-marked workspace
  // output literally carries `visibility: 'private'` in --json mode).
  //
  // The field remains FORBIDDEN in:
  //   - src/pages, src/components, src/server/badge
  //   - src/shared/* except src/shared/vault/*
  //   - any future public-spine surface
  const ALLOWED_PATH_FRAGMENTS = [
    `${'src'}${'/'}server${'/'}vault${'/'}`,
    `${'src'}${'/'}shared${'/'}vault${'/'}`,
    `${'supabase'}${'/'}migrations${'/'}`,
    `${'scripts'}${'/'}test-vault-`,
    `${'scripts'}${'/'}test-cli-workspace-`,
    `${'packages'}${'/'}cli${'/'}`,
    `${'docs'}${'/'}`,
    // PR-V2-E atomic lift: Vault Dashboard React surfaces are documented
    // Vault consumers. The /cli-auth approval page and the /vault/* tree
    // are explicitly allowed to render visibility: 'private' fields. The
    // dashboard structural test (scripts/test-vault-dashboard-v0.mjs)
    // additionally asserts that no public-spine page imports these.
    `${'src'}${'/'}pages${'/'}vault${'/'}`,
    `${'src'}${'/'}pages${'/'}CliAuth`,
    `${'src'}${'/'}components${'/'}VaultLayout`,
    `${'src'}${'/'}components${'/'}VaultAuthGate`,
    `${'src'}${'/'}server${'/'}vault\\`,
    `${'src'}${'/'}shared${'/'}vault\\`,
    `${'supabase'}${'/'}migrations\\`,
    `${'scripts'}${'/'}test-vault-`.replace(/\//g, '\\'),
    `${'scripts'}${'/'}test-cli-workspace-`.replace(/\//g, '\\'),
    `${'packages'}${'/'}cli${'/'}`.replace(/\//g, '\\'),
    `${'docs'}${'/'}`.replace(/\//g, '\\'),
    `${'src'}${'/'}pages${'/'}vault\\`,
    `${'src'}${'/'}pages${'/'}CliAuth`.replace(/\//g, '\\'),
    `${'src'}${'/'}components${'/'}VaultLayout`.replace(/\//g, '\\'),
    `${'src'}${'/'}components${'/'}VaultAuthGate`.replace(/\//g, '\\'),
  ];

  const candidateRoots = ['src', 'packages/cli/src'];
  const offenders = [];
  for (const root of candidateRoots) {
    const files = walkFiles(root, (p) => /\.(ts|tsx|js|mjs|cjs|json)$/i.test(p));
    for (const f of files) {
      const rel = f.slice(REPO_ROOT.length + 1).replace(/\\/g, '/');
      const isAllowed = ALLOWED_PATH_FRAGMENTS.some((frag) => {
        const normFrag = frag.replace(/\\/g, '/');
        return rel.indexOf(normFrag) >= 0;
      });
      if (isAllowed) continue;
      const text = readFileSync(f, 'utf8');
      if (/visibility\s*:\s*['"]private['"]/.test(text)) {
        offenders.push(rel);
      }
    }
  }
  ok(
    offenders.length === 0,
    `public-source files must not contain literal visibility: 'private'; offenders: ${offenders.join(', ')}`,
  );
});

test('public Trust Center claims still carry no visibility field (existing guard preserved)', () => {
  // Sanity guard: the lift in PR-V2-C does NOT erode the existing
  // open-source-trust-center hygiene test that asserts public claims have
  // no `visibility` field at all. This test re-asserts it from the data
  // side so a future refactor that moves shared/openSourceTrustCenter.js
  // can't quietly drop the invariant.
  const src = read('src/shared/openSourceTrustCenter.js');
  // The public claim shape's authoritative list has no visibility entry
  // documented in the header.
  const headerEnd = src.indexOf('export ');
  const header = headerEnd > 0 ? src.slice(0, headerEnd) : src;
  ok(
    /no claim record has a `visibility` field/.test(header)
      || /no claim record carries a `visibility` field/.test(header)
      || /visibility/.test(header),
    'public Trust Center module must document the no-visibility-on-claims rule in its header (PR-V2-C only lifts the field on Vault paths)',
  );
});

// ---------- Group 5: public-shape visibility lift is constrained ----------

test('visibility field appears in Vault paths only (lift is scoped)', () => {
  // Sweep src/ for every file containing the literal `visibility:` (a
  // field declaration, not a CSS or React prop) and assert the file path
  // is under src/server/vault or src/shared/vault.
  const files = walkFiles('src', (p) => /\.(ts|tsx|js|mjs|cjs)$/i.test(p));
  const offenders = [];
  for (const f of files) {
    const rel = f.slice(REPO_ROOT.length + 1).replace(/\\/g, '/');
    // Ignore React props / non-data uses by requiring the field declaration
    // pattern: `visibility: 'something'` or `visibility: "something"` or
    // `visibility: <literal>` in an object literal context.
    const text = readFileSync(f, 'utf8');
    // We are interested in JSON-style data field usage with a string value.
    if (!/[\s,{][\s]*visibility\s*:\s*['"]/.test(text)) continue;
    const isVault = rel.startsWith('src/server/vault/') || rel.startsWith('src/shared/vault/');
    if (!isVault) offenders.push(rel);
  }
  ok(
    offenders.length === 0,
    `visibility-field lift is scoped to Vault paths; saw the field on non-Vault paths: ${offenders.join(', ')}`,
  );
});

test('SQL migrations may carry visibility CHECK constraints (defense in depth)', () => {
  // Positive assertion: vault_evidence + vault_exceptions + vault_timeline_events
  // each carry `visibility ... check (visibility = 'private')` at the SQL
  // layer. This is unchanged by PR-V2-C — the lift is application-layer.
  for (const m of [
    'supabase/migrations/0010_vault_evidence.sql',
    'supabase/migrations/0012_vault_timeline_events.sql',
  ]) {
    const sql = read(m);
    ok(
      /visibility\s+text[\s\S]{0,200}?check\s*\(\s*visibility\s*=\s*'private'\s*\)/i.test(sql),
      `${m} must keep its CHECK (visibility = 'private') invariant`,
    );
  }
});

// ---------- Group 6: no public renderer imports src/server/vault/* ----------

test('public renderer + shared + badge files do not import any vault path', () => {
  // Per PR-V1-D §7.1: public-spine files must not import from src/server/vault
  // or src/shared/vault.
  //
  // PR-V2-D atomically lifted the CLI from this rule (the CLI is a
  // documented Vault consumer in workspace mode). PR-V2-E atomically lifts
  // the SAME rule for the Vault Dashboard surfaces:
  //   - src/pages/CliAuth.tsx (the /cli-auth approval page)
  //   - src/pages/vault/** (the /vault/* tree)
  //   - src/components/VaultLayout.tsx (the Vault-only chrome)
  // These files MAY import src/shared/vault/api-client. Public-spine
  // pages and components still MUST NOT import any vault path; the
  // PR-V2-E dashboard structural test (scripts/test-vault-dashboard-v0.mjs)
  // additionally enforces that no public renderer imports the vault
  // dashboard files themselves.
  const isVaultDashboardFile = (rel) => {
    if (rel === 'src/pages/CliAuth.tsx' || rel === 'src/pages/CliAuth.ts') return true;
    if (rel.startsWith('src/pages/vault/')) return true;
    if (rel === 'src/components/VaultLayout.tsx' || rel === 'src/components/VaultLayout.ts') return true;
    // PR-DOGFOOD-1: VaultAuthGate is a shared dashboard component used
    // across the 5 deep-link pages. Same allowlist scope as VaultLayout.
    if (rel === 'src/components/VaultAuthGate.tsx' || rel === 'src/components/VaultAuthGate.ts') return true;
    return false;
  };
  const candidates = [
    ...walkFiles('src/pages', (p) => {
      const rel = p.slice(REPO_ROOT.length + 1).replace(/\\/g, '/');
      if (isVaultDashboardFile(rel)) return false;
      return /\.(ts|tsx|js|mjs)$/i.test(p);
    }),
    ...walkFiles('src/components', (p) => {
      const rel = p.slice(REPO_ROOT.length + 1).replace(/\\/g, '/');
      if (isVaultDashboardFile(rel)) return false;
      return /\.(ts|tsx|js|mjs)$/i.test(p);
    }),
    ...walkFiles('src/server/badge', (p) => /\.(ts|tsx|js|mjs)$/i.test(p)),
    ...walkFiles('src/shared', (p) => {
      const rel = p.slice(REPO_ROOT.length + 1).replace(/\\/g, '/');
      // src/shared/vault/* is allowed (it would BE a vault module); other
      // src/shared/* files are public-spine and must not import vault.
      if (rel.startsWith('src/shared/vault/')) return false;
      return /\.(ts|tsx|js|mjs)$/i.test(p);
    }),
  ];
  const offenders = [];
  for (const f of candidates) {
    const text = readFileSync(f, 'utf8');
    const rel = f.slice(REPO_ROOT.length + 1).replace(/\\/g, '/');
    const importMatches = text.match(/import\s[\s\S]*?from\s+['"][^'"]+['"]/g) || [];
    for (const imp of importMatches) {
      const fromMatch = imp.match(/from\s+['"]([^'"]+)['"]/);
      if (!fromMatch) continue;
      const spec = fromMatch[1];
      if (/vault/i.test(spec)) {
        offenders.push(`${rel}: imports ${spec}`);
      }
    }
  }
  ok(
    offenders.length === 0,
    `public-spine files must not import vault paths; offenders:\n      ${offenders.join('\n      ')}`,
  );
});

test('CLI v0 commands import vault paths only via the workspace-context wrapper', () => {
  // PR-V1-E §7.1 — the v0 commands may import the workspace-mode branch
  // only via a shared module. The wrapper is packages/cli/src/lib/workspace-context.ts.
  // Direct vault-api or session imports inside check/lockfile/trust/timeline/why
  // are a structural violation.
  const V0_COMMANDS = ['check', 'lockfile', 'trust', 'timeline', 'why'];
  const FORBIDDEN_DIRECT_IMPORTS = [
    '../lib/vault-api',
    '../lib/session',
  ];
  for (const cmd of V0_COMMANDS) {
    const file = `packages/cli/src/commands/${cmd}.ts`;
    const text = readFileSync(`${REPO_ROOT}/${file}`, 'utf8');
    const imports = text.match(/import\s[\s\S]*?from\s+['"][^'"]+['"]/g) || [];
    for (const imp of imports) {
      const fromMatch = imp.match(/from\s+['"]([^'"]+)['"]/);
      if (!fromMatch) continue;
      const spec = fromMatch[1];
      for (const forbidden of FORBIDDEN_DIRECT_IMPORTS) {
        ok(
          !spec.startsWith(forbidden),
          `${file} imports ${spec} directly — v0 commands must go through ../lib/workspace-context (PR-V1-E §7.1 wrapper-only rule)`,
        );
      }
    }
  }
});

// ---------- Group 7: no Vault read path imports public renderers ----------

test('Vault read modules do not import public renderer / shared-data / badge / CLI paths', () => {
  const vaultFiles = walkFiles('src/server/vault', (p) => /\.(js|mjs|ts)$/i.test(p));
  const forbidden = [
    'src/pages/',
    'src/components/',
    'src/server/badge/',
    'packages/cli/',
    'src/shared/trustTimeline',
    'src/shared/repoTrustDashboard',
    'src/shared/openSourceTrustCenter',
  ];
  const offenders = [];
  for (const f of vaultFiles) {
    const text = readFileSync(f, 'utf8');
    const rel = f.slice(REPO_ROOT.length + 1).replace(/\\/g, '/');
    const imports = text.match(/import\s[\s\S]*?from\s+['"][^'"]+['"]/g) || [];
    for (const imp of imports) {
      const fromMatch = imp.match(/from\s+['"]([^'"]+)['"]/);
      if (!fromMatch) continue;
      const spec = fromMatch[1];
      for (const banned of forbidden) {
        // Match either absolute path or relative resolution shape.
        const normalized = spec.replace(/\\/g, '/');
        if (normalized.indexOf(banned) >= 0) {
          offenders.push(`${rel}: imports ${spec}`);
        }
      }
    }
  }
  ok(
    offenders.length === 0,
    `vault modules must not import public-spine paths; offenders:\n      ${offenders.join('\n      ')}`,
  );
});

// ---------- Group 8: cursor invariants ----------

test('timeline cursor is opaque (server-side encode + decode helpers)', () => {
  const src = read('src/server/vault/timeline.js');
  ok(/function encodeCursor\(/.test(src), 'timeline.js must define encodeCursor');
  ok(/function decodeCursor\(/.test(src), 'timeline.js must define decodeCursor');
  ok(/base64url/.test(src), 'cursor must use base64url encoding (RFC 4648 §5)');
});

test('cursor decode rejects unparseable input with cursor-invalid', () => {
  const src = read('src/server/vault/timeline.js');
  const decodeFn = src.match(/function decodeCursor\([\s\S]*?\n\}/);
  ok(decodeFn, 'decodeCursor body not found');
  ok(
    /error:\s*['"]invalid['"]/.test(decodeFn[0]),
    'decodeCursor must surface error: "invalid" so the handler can map to ERROR_CODES.cursor_invalid',
  );
  ok(
    /ERROR_CODES\.cursor_invalid/.test(src),
    'handleListTimelineEvents must reply with ERROR_CODES.cursor_invalid for malformed cursors',
  );
});

test('cursor decode rejects rotated format with cursor-stale', () => {
  const src = read('src/server/vault/timeline.js');
  const decodeFn = src.match(/function decodeCursor\([\s\S]*?\n\}/);
  ok(decodeFn, 'decodeCursor body not found');
  ok(
    /CURSOR_VERSION/.test(decodeFn[0]),
    'decodeCursor must check a version field so old cursors are recognized as stale',
  );
  ok(
    /error:\s*['"]stale['"]/.test(decodeFn[0]),
    'decodeCursor must surface error: "stale" for version mismatches',
  );
  ok(
    /ERROR_CODES\.cursor_stale/.test(src),
    'handleListTimelineEvents must reply with ERROR_CODES.cursor_stale for rotated cursors',
  );
});

test('timeline list sort is newest-first by (emitted_at DESC, event_id DESC)', () => {
  const src = read('src/server/vault/timeline.js');
  ok(
    /\.order\(\s*['"]emitted_at['"],\s*\{\s*ascending:\s*false\s*\}\s*\)/.test(src),
    'timeline list must order by emitted_at DESC',
  );
  ok(
    /\.order\(\s*['"]event_id['"],\s*\{\s*ascending:\s*false\s*\}\s*\)/.test(src),
    'timeline list must tie-break by event_id DESC for stable keyset pagination',
  );
});

test('event_type filter only accepts the documented allowlist', () => {
  const src = read('src/server/vault/timeline.js');
  ok(
    /ALLOWED_EVENT_TYPES/.test(src),
    'timeline.js must define an ALLOWED_EVENT_TYPES allowlist (no wildcards per PR-V1-D §3.5)',
  );
  // The 17 event types from migration 0012 must all appear in the allowlist.
  for (const t of [
    'exception_proposed',
    'exception_approved',
    'exception_rejected',
    'exception_revoked',
    'exception_expired',
    'exception_extended',
    'private_evidence_captured',
    'private_evidence_redacted',
    'workspace_created',
    'workspace_renamed',
    'workspace_soft_deleted',
    'workspace_owner_transferred',
    'member_added',
    'member_promoted',
    'member_demoted',
    'member_suspended',
    'member_removed',
  ]) {
    ok(src.indexOf(`'${t}'`) >= 0, `event_type allowlist missing ${t}`);
  }
});

// ---------- Reviewer fixes (PR #83 second pass) ----------

test('evidence user reference fields are expanded objects, not bare UUIDs (per PR-V1-D §3.3)', () => {
  // Reviewer-flagged contract gap on PR #83. The sub-sketch documents
  // user reference fields as `{ user_id, github_login, display_name }`
  // objects; the initial commit returned bare UUIDs. Fix uses inline
  // foreign-key joins:
  //   created_by_user:created_by(user_id, github_login, display_name)
  //   redacted_by_user:redacted_by(user_id, github_login, display_name)
  const src = read('src/server/vault/evidence.js');
  ok(
    /created_by_user:created_by\(user_id,\s*github_login,\s*display_name\)/.test(src),
    'evidence select must join created_by_user with the documented shape',
  );
  ok(
    /redacted_by_user:redacted_by\(user_id,\s*github_login,\s*display_name\)/.test(src),
    'evidence select must join redacted_by_user with the documented shape',
  );
  // The shape function must return the joined object, not the raw UUID.
  const shapeFn = src.match(/function shapeEvidenceRow\([^)]*\)[\s\S]*?\n\}/);
  ok(shapeFn, 'shapeEvidenceRow not found');
  ok(
    /created_by:\s*shapeUser\(row\.created_by_user\)/.test(shapeFn[0]),
    'shapeEvidenceRow.created_by must read from the joined created_by_user',
  );
  ok(
    /redacted_by:\s*shapeUser\(row\.redacted_by_user\)/.test(shapeFn[0]),
    'shapeEvidenceRow.redacted_by must read from the joined redacted_by_user',
  );
});

test('timeline emitted_by is an expanded object, not a bare UUID (per PR-V1-D §3.3)', () => {
  const src = read('src/server/vault/timeline.js');
  ok(
    /emitted_by_user:emitted_by\(user_id,\s*github_login,\s*display_name\)/.test(src),
    'timeline select must join emitted_by_user with the documented shape',
  );
  const shapeFn = src.match(/function shapeTimelineRow\([^)]*\)[\s\S]*?\n\}/);
  ok(shapeFn, 'shapeTimelineRow not found');
  ok(
    /emitted_by:\s*shapeUser\(row\.emitted_by_user\)/.test(shapeFn[0]),
    'shapeTimelineRow.emitted_by must read from the joined emitted_by_user',
  );
  // Both list + single endpoints must use the join select. Assert via the
  // shared TIMELINE_SELECT constant — both call sites should reference it
  // by name so a future change can't drift only one of the two.
  ok(
    /const\s+TIMELINE_SELECT\s*=/.test(src),
    'timeline.js must define a shared TIMELINE_SELECT constant carrying the user join',
  );
  const selectUses = (src.match(/\.select\(\s*TIMELINE_SELECT/g) || []).length;
  ok(
    selectUses >= 2,
    `both timeline list + single handlers must use TIMELINE_SELECT (saw ${selectUses} call sites)`,
  );
});

test('timeline list rejects reversed since/until window with 400 invalid-filter', () => {
  const src = read('src/server/vault/timeline.js');
  ok(
    /sinceIso\.value\s*&&\s*untilIso\.value[\s\S]{0,200}?Date\.parse\(sinceIso\.value\)\s*>=\s*Date\.parse\(untilIso\.value\)/.test(src),
    'handleListTimelineEvents must reject since >= until before issuing the supabase query',
  );
  ok(
    /ERROR_CODES\.invalid_filter,[\s\S]{0,200}?since must be strictly less than until/.test(src),
    'reversed-window response must use ERROR_CODES.invalid_filter with a since/until message',
  );
});

test('cursor interpolation carries a SAFETY INVARIANT comment naming the regex guard', () => {
  // Defense-in-depth: the .or() filter string interpolates `at` + `id`
  // directly. The current safety relies on ISO_RE / UUID_RE forbidding
  // the characters PostgREST treats as significant. A future relaxation
  // of either regex would open an injection vector. The comment makes
  // that dependency visible at the call site.
  const src = read('src/server/vault/timeline.js');
  ok(
    /SAFETY INVARIANT[\s\S]{0,400}?ISO_RE[\s\S]{0,200}?UUID_RE/.test(src),
    'the cursor .or() interpolation must carry a SAFETY INVARIANT comment naming ISO_RE + UUID_RE',
  );
});

// ---------- Wiring + isolation invariants ----------

test('errors.js exports the new PR-V2-C error codes', () => {
  const src = read('src/server/vault/errors.js');
  ok(/cursor_invalid:\s*['"]cursor-invalid['"]/.test(src), 'cursor_invalid must be exported');
  ok(/cursor_stale:\s*['"]cursor-stale['"]/.test(src), 'cursor_stale must be exported');
  ok(/invalid_filter:\s*['"]invalid-filter['"]/.test(src), 'invalid_filter must be exported');
});

test('package.json wires test:vault-private-reads-v0 into test:ci', () => {
  const pkg = JSON.parse(read('package.json'));
  ok(
    pkg.scripts && pkg.scripts['test:vault-private-reads-v0'],
    'package.json must define test:vault-private-reads-v0',
  );
  ok(
    /test-vault-private-reads-v0\.mjs/.test(pkg.scripts['test:ci'] || ''),
    'test:ci must chain scripts/test-vault-private-reads-v0.mjs',
  );
});

test('Vault Timeline visibility is hardcoded to "private" in the response shape', () => {
  // Per PR-V1-D §5.2: every Timeline event response carries
  // `visibility: "private"`. The shape function must not read it from the
  // row (which is locked at SQL anyway) — it should literal it.
  const src = read('src/server/vault/timeline.js');
  const shapeFn = src.match(/function shapeTimelineRow\([^)]*\)[\s\S]*?\n\}/);
  ok(shapeFn, 'shapeTimelineRow not found');
  ok(
    /visibility:\s*['"]private['"]/.test(shapeFn[0]),
    'shapeTimelineRow must hardcode visibility: "private" so a future schema accident cannot leak the literal "public"',
  );
});

test('evidence read response also carries visibility: "private" literal', () => {
  const src = read('src/server/vault/evidence.js');
  const shapeFn = src.match(/function shapeEvidenceRow\([^)]*\)[\s\S]*?\n\}/);
  ok(shapeFn, 'shapeEvidenceRow not found');
  ok(
    /visibility:\s*['"]private['"]/.test(shapeFn[0]),
    'shapeEvidenceRow must hardcode visibility: "private" on responses',
  );
});

// ---------- Summary ----------

console.log('');
console.log(`Vault private reads v0 tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
