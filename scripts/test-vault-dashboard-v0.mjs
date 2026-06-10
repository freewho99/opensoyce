#!/usr/bin/env node
/**
 * PR-V2-E structural invariants for the Vault Dashboard + /cli-auth page.
 *
 * Covers the 9 scope items from the user-approved PR-V2-E call:
 *
 *   1. /cli-auth browser approval page exists and authenticates session
 *   2. Vault Dashboard shell exists with its own minimal chrome
 *   3. Workspace-aware Vault state is rendered (workspaces, members)
 *   4. Trust Expiry table (exception list with expires_at column) exists
 *   5. Evidence private-read links only when authorized
 *   6. Vault Timeline read view exists with [PRIVATE] marker
 *   7. Uses existing PR-V2-B / PR-V2-C APIs only (no new server routes)
 *   8. Preserves CLI behavior from PR-V2-D
 *   9. Preserves public Trust Center / Badge / Timeline behavior
 *
 * Plus PR-V1-D §7 + PR-V2-E specific structural rules:
 *
 *   - Vault Dashboard pages live ONLY under the documented allowlist
 *   - Public-spine pages do NOT import vault dashboard files
 *   - Vault Dashboard pages do NOT import public-spine pages / data
 *   - The shared API client is the ONLY place that adds the CSRF header
 *   - No `private-anchor` literal escapes into public-spine source
 *   - The dashboard routes are wired under their own VaultLayout (not
 *     under the public Layout)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
const pending = [];

function test(name, fn) {
  pending.push(() => {
    try {
      fn();
      console.log(`PASS  ${name}`);
      passed += 1;
    } catch (e) {
      console.log(`FAIL  ${name} -- ${e.message}\n${e.stack}`);
      failed += 1;
    }
  });
}
function ok(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

// Strip // line comments and /* */ block comments so content greps test the
// actual code, not doctrine prose in the comments (which deliberately NAMES
// the patterns it is explaining the ABSENCE of, e.g. "NO propose exception").
function readNoComments(rel) {
  return read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('//');
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join('\n');
}

const VAULT_DASHBOARD_FILES = [
  'src/pages/CliAuth.tsx',
  'src/pages/vault/VaultDashboard.tsx',
  'src/pages/vault/VaultWorkspace.tsx',
  'src/pages/vault/VaultExceptionList.tsx',
  'src/pages/vault/VaultExceptionDetail.tsx',
  'src/pages/vault/VaultTimeline.tsx',
  'src/pages/vault/VaultEvidenceDetail.tsx',
  'src/pages/vault/VaultExposureList.tsx',
  'src/pages/vault/VaultExposureDetail.tsx',
  'src/components/VaultLayout.tsx',
  'src/components/VaultAuthGate.tsx',
  'src/shared/vault/api-client.ts',
];

// ---------- 1. /cli-auth page ----------

test('CliAuth page exists and gates on a logged-in session', () => {
  const src = read('src/pages/CliAuth.tsx');
  ok(/fetchVaultMe/.test(src), 'CliAuth must call fetchVaultMe to detect session');
  ok(/'unauth'/.test(src), 'CliAuth must surface an unauth phase when not logged in');
  ok(/approveCliCode/.test(src), 'CliAuth must POST through approveCliCode');
  // PR-DOGFOOD-1 correction: the previous invariant grep'd for
  // `/api/vault/auth/login?redirect_to=` and passed because the literal
  // existed — but that endpoint is the OAuth CALLBACK, not the start.
  // It returned 400 missing-code. The corrected rule: CliAuth must
  // delegate to startVaultOAuth() which actually constructs the
  // GitHub authorize URL. See test below for the OAuth-start invariant.
  ok(/startVaultOAuth/.test(src),
    'CliAuth must delegate the login redirect to startVaultOAuth (the helper that builds the github.com/login/oauth/authorize URL)');
});

test('CliAuth route is wired in App.tsx', () => {
  const app = read('src/App.tsx');
  ok(/path="\/cli-auth"\s+element=\{<CliAuth\s*\/>\}/.test(app),
    'App.tsx must register a Route at /cli-auth that renders CliAuth');
});

test('startVaultOAuth helper constructs the real GitHub OAuth start URL', () => {
  // PR-DOGFOOD-1: locks the fix for the broken login button.
  // The helper must:
  //   - fetch /api/config for the GitHub OAuth client_id
  //   - mint a CSRF state and store it in sessionStorage
  //   - redirect to https://github.com/login/oauth/authorize?... with
  //     client_id + state + redirect_uri set
  //   - round-trip redirect_to back to the calling page through the
  //     server-side redirect_to query parameter
  const src = read('src/shared/vault/oauth-start.ts');
  ok(/['"`]\/api\/config['"`]/.test(src),
    'startVaultOAuth must fetch /api/config to obtain the GitHub OAuth client_id');
  ok(/sessionStorage\.setItem/.test(src),
    'startVaultOAuth must persist the state in sessionStorage for CSRF round-trip');
  ok(/https:\/\/github\.com\/login\/oauth\/authorize/.test(src),
    'startVaultOAuth must redirect to the real github.com/login/oauth/authorize URL');
  ok(/client_id/.test(src) && /state/.test(src) && /redirect_uri/.test(src),
    'startVaultOAuth must include client_id, state, and redirect_uri in the GitHub authorize params');
  ok(/redirect_to=/.test(src),
    'startVaultOAuth must round-trip the return path through the server-side redirect_to query parameter');
});

test('VaultDashboard delegates login to startVaultOAuth (not the callback URL)', () => {
  const src = read('src/pages/vault/VaultDashboard.tsx');
  ok(/startVaultOAuth/.test(src),
    'VaultDashboard must use startVaultOAuth — not navigate to /api/vault/auth/login directly');
  // Negative assertion: the old broken pattern must be gone.
  ok(!/window\.location\.href\s*=\s*[`'"]\/api\/vault\/auth\/login\?redirect_to=/.test(src),
    'VaultDashboard must not navigate directly to the OAuth callback URL (that returns 400 missing-code)');
});

// ---------- 2. Vault Dashboard shell ----------

test('VaultLayout renders outside the public Layout', () => {
  const app = read('src/App.tsx');
  // VaultLayout is the wrapping element of the /vault Route group.
  ok(/path="\/vault"\s+element=\{<VaultLayout\s*\/>\}/.test(app),
    'App.tsx must wire /vault under VaultLayout (not the public Layout)');
  // Public Layout must NOT envelope the vault path. Search for any line
  // matching `<Route path="/" element={<Layout ...>` and confirm `/vault`
  // is NOT under it.
  const layoutBlockMatch = app.match(/<Route path="\/" element=\{<Layout[\s\S]*?<\/Route>/);
  ok(layoutBlockMatch, 'public Layout block not found in App.tsx');
  ok(!/path="\/?(?:cli-auth|vault)/.test(layoutBlockMatch[0]),
    'public Layout block must not contain /cli-auth or /vault routes');
});

test('VaultLayout does NOT import the public Layout', () => {
  const src = read('src/components/VaultLayout.tsx');
  ok(!/from\s+['"][^'"]*\/components\/Layout['"]/i.test(src),
    'VaultLayout must not import the public Layout');
  ok(!/import\s+Layout\b/.test(src),
    'VaultLayout must not import a Layout symbol from the public chrome');
});

// ---------- 3 + 4. Workspace state + Trust Expiry table ----------

test('VaultDashboard fetches workspaces and renders the list', () => {
  const src = read('src/pages/vault/VaultDashboard.tsx');
  ok(/fetchVaultMe/.test(src), 'VaultDashboard must call fetchVaultMe');
  ok(/workspaces\.map/.test(src), 'VaultDashboard must render the workspaces list');
});

test('VaultExceptionList renders the Trust Expiry table with expires_at', () => {
  const src = read('src/pages/vault/VaultExceptionList.tsx');
  ok(/listExceptions/.test(src), 'VaultExceptionList must call listExceptions');
  ok(/Trust Expiry/.test(src), 'VaultExceptionList must label the Trust Expiry surface');
  ok(/expires_at/.test(src), 'VaultExceptionList must surface expires_at');
  ok(/expiryUrgency/.test(src) || /urgency/.test(src),
    'VaultExceptionList must apply expiry urgency styling');
});

test('VaultExceptionList paginates with offset + load more (PR-DOGFOOD-1)', () => {
  // The previous implementation hardcoded `limit: 100` with no
  // pagination — exception #101 was invisible. Lock the fix:
  // a Load More button + an offset-driven follow-up fetch.
  const src = read('src/pages/vault/VaultExceptionList.tsx');
  ok(/offset:\s*0/.test(src) || /offset:\s*items\.length/.test(src),
    'VaultExceptionList must pass offset to listExceptions');
  ok(/load more/.test(src),
    'VaultExceptionList must render a load-more affordance');
  ok(/loadMore/.test(src),
    'VaultExceptionList must define a loadMore handler');
});

test('VaultExceptionList urgency labels ramp through hours + minutes (PR-DOGFOOD-1)', () => {
  // The previous implementation floored to days, collapsing any
  // sub-24h expiry to "0d ⚠". Lock the fix: explicit sub-day branches.
  const src = read('src/pages/vault/VaultExceptionList.tsx');
  ok(/hours\s*<\s*1/.test(src) && /minutes/.test(src),
    'expiryUrgency must surface minutes for sub-hour expiries');
  ok(/hours\s*<\s*24/.test(src),
    'expiryUrgency must surface hours for sub-day expiries');
});

test('VaultExceptionDetail converts datetime-local to UTC ISO correctly (PR-DOGFOOD-1)', () => {
  // Previous implementation appended ":00.000Z" to the naive local
  // input value, silently shifting by the reviewer's timezone offset.
  // The fix uses Date constructor + toISOString to convert properly.
  const src = read('src/pages/vault/VaultExceptionDetail.tsx');
  ok(/localInputToUtcIso/.test(src),
    'VaultExceptionDetail must use a local-to-UTC conversion helper');
  // Negative: the broken pattern must be gone.
  ok(!/setExtendIso\(`\$\{[^}]+\}:00\.000Z`\)/.test(src),
    'VaultExceptionDetail must not append ":00.000Z" to a naive local input value');
  ok(/utcIsoToLocalInput/.test(src),
    'VaultExceptionDetail must display stored UTC time in the reviewer\'s local timezone');
});

test('Vault deep-link pages use the shared VaultAuthGate (PR-DOGFOOD-1)', () => {
  // Previously these pages returned plain text on unauth, dead-ending
  // a user who deep-linked while unauthenticated. The shared
  // VaultAuthGate component renders the same sign-in card on all of
  // them and preserves the current path as the OAuth return target.
  const TRAPPED_BEFORE = [
    'src/pages/vault/VaultWorkspace.tsx',
    'src/pages/vault/VaultExceptionList.tsx',
    'src/pages/vault/VaultExceptionDetail.tsx',
    'src/pages/vault/VaultTimeline.tsx',
    'src/pages/vault/VaultEvidenceDetail.tsx',
  ];
  for (const rel of TRAPPED_BEFORE) {
    const src = read(rel);
    ok(/import VaultAuthGate/.test(src),
      `${rel} must import VaultAuthGate`);
    ok(/<VaultAuthGate\b/.test(src),
      `${rel} must render <VaultAuthGate /> on the unauth phase`);
  }
  // The gate itself must use startVaultOAuth + preserve the current
  // URL as the return target.
  const gate = read('src/components/VaultAuthGate.tsx');
  ok(/startVaultOAuth/.test(gate),
    'VaultAuthGate must delegate to startVaultOAuth');
  ok(/useLocation/.test(gate),
    'VaultAuthGate must read the current location to preserve the return path');
});

test('VaultTimeline clears stale error on retry + initial fetch (PR-DOGFOOD-1)', () => {
  // Previously the error banner stuck around after a successful retry.
  const src = read('src/pages/vault/VaultTimeline.tsx');
  // Both the useEffect initial fetch and loadMore must call setError('').
  const setErrorEmpty = src.match(/setError\(\s*['"`]\s*['"`]\s*\)/g) || [];
  ok(setErrorEmpty.length >= 2,
    'VaultTimeline must clear error state on both the initial fetch AND loadMore retry');
});

test('VaultEvidenceDetail renders body in a <pre> with JSON pretty-print (PR-DOGFOOD-1)', () => {
  const src = read('src/pages/vault/VaultEvidenceDetail.tsx');
  ok(/<pre\b/.test(src),
    'VaultEvidenceDetail must render body in a <pre> block to preserve formatting');
  ok(/formatEvidenceBody/.test(src) || /JSON\.parse/.test(src),
    'VaultEvidenceDetail must attempt JSON pretty-printing when body looks like JSON');
});

test('VaultWorkspace renders members and quick-action links', () => {
  const src = read('src/pages/vault/VaultWorkspace.tsx');
  ok(/fetchWorkspace/.test(src), 'VaultWorkspace must call fetchWorkspace');
  ok(/\/exceptions/.test(src) && /\/timeline/.test(src),
    'VaultWorkspace must link to /exceptions and /timeline sub-routes');
});

// ---------- CEI read surface (PR-6B) ----------

test('CEI exposure routes are wired under VaultLayout only (PR-6B)', () => {
  const app = read('src/App.tsx');
  ok(/path=":slug\/exposures"\s+element=\{<VaultExposureList\s*\/>\}/.test(app),
    'App.tsx must register :slug/exposures under VaultExposureList');
  ok(/path=":slug\/exposures\/:id"\s+element=\{<VaultExposureDetail\s*\/>\}/.test(app),
    'App.tsx must register :slug/exposures/:id under VaultExposureDetail');
  // The exposure routes must sit inside the /vault VaultLayout group, NOT
  // the public Layout. The public Layout block check below already asserts
  // no /vault route leaks into it; here we assert the exposure routes
  // appear in the file after the VaultLayout open tag.
  const vaultGroup = app.match(/<Route path="\/vault" element=\{<VaultLayout[\s\S]*?<\/Route>/);
  ok(vaultGroup, 'VaultLayout route group not found');
  ok(/exposures/.test(vaultGroup[0]),
    'exposure routes must live inside the VaultLayout group');
});

test('public Layout block does not include CEI exposures (PR-6B)', () => {
  const app = read('src/App.tsx');
  const layoutBlock = app.match(/<Route path="\/" element=\{<Layout[\s\S]*?<\/Route>/);
  ok(layoutBlock, 'public Layout block not found');
  ok(!/exposures/.test(layoutBlock[0]),
    'public Layout must not contain any /exposures route');
});

test('VaultExposureList is read-only — no create / propose / mutate (PR-6B)', () => {
  const src = readNoComments('src/pages/vault/VaultExposureList.tsx');
  ok(/listExposures/.test(src), 'VaultExposureList must call listExposures');
  ok(/\[PRIVATE\]/.test(read('src/pages/vault/VaultExposureList.tsx')),
    'VaultExposureList must surface the [PRIVATE] marker');
  // No mutation helpers may be imported or referenced (code, not comments).
  for (const banned of ['createExposure', 'proposeException', 'approveException', 'rejectException', 'revokeException', 'extendException']) {
    ok(!src.includes(banned), `VaultExposureList must not reference ${banned} (read-only surface)`);
  }
  // No "propose exception" / "create exposure" affordance in rendered code.
  ok(!/propose exception/i.test(src) && !/create exposure/i.test(src),
    'VaultExposureList must not offer exposure->exception linkage or create UI');
});

test('VaultExposureDetail renders the exposure read-only (no exposure mutation)', () => {
  // PR-6B read invariant, REVISED by PR-6C: the EXPOSURE itself is never
  // mutated. proposeException (creating a NEW exception draft) is the
  // authorized 6C linkage and is asserted separately below — but the
  // exposure-write and exception-decision verbs stay banned here.
  const src = readNoComments('src/pages/vault/VaultExposureDetail.tsx');
  ok(/getExposure/.test(src), 'VaultExposureDetail must call getExposure');
  ok(/metadata/.test(src) && /trust_boundary/.test(src),
    'VaultExposureDetail must render metadata and trust_boundary');
  ok(/\[PRIVATE\]/.test(read('src/pages/vault/VaultExposureDetail.tsx')),
    'VaultExposureDetail must surface the [PRIVATE] marker');
  // No exposure mutation, and no exception DECISION verbs (approve/reject/
  // revoke/extend). proposeException is intentionally NOT in this list —
  // 6C authorizes proposing a draft, not deciding.
  for (const banned of ['createExposure', 'updateExposure', 'deleteExposure', 'approveException', 'rejectException', 'revokeException', 'revokeExceptionApi', 'extendException', 'handleApprove', 'handleReject']) {
    ok(!src.includes(banned), `VaultExposureDetail must not reference ${banned}`);
  }
});

// ---------- PR-6C: exposure -> proposed exception linkage ----------

test('VaultExposureDetail proposes a PROPOSED exception only (PR-6C)', () => {
  const src = readNoComments('src/pages/vault/VaultExposureDetail.tsx');
  ok(/proposeException/.test(src),
    'VaultExposureDetail must call proposeException (the 6C linkage)');
  // The action targets the existing propose endpoint via the api-client
  // helper; the server hardcodes state: proposed. The page must NOT pass a
  // state field or hit any approve/active path.
  ok(!/state:\s*['"]active['"]/.test(src),
    'VaultExposureDetail must not request an active exception');
  ok(!/\/approve|\/reject|\/revoke|\/extend/.test(src),
    'VaultExposureDetail must not call approve/reject/revoke/extend paths');
});

test('PR-6C requires explicit review + submit (no one-click auto-submit)', () => {
  const src = readNoComments('src/pages/vault/VaultExposureDetail.tsx');
  // Two distinct steps: the entry button opens a review card (openReview),
  // and a SEPARATE submit button inside the card does the POST
  // (submitProposal). The proposal POST happens only from submitProposal.
  ok(/onClick=\{\(\)\s*=>\s*openReview\(/.test(src),
    'the entry button must open a review step (openReview), not submit');
  ok(/onClick=\{\(\)\s*=>\s*submitProposal\(/.test(src),
    'a separate submit button must call submitProposal');
  // The actual proposeException call must live inside submitProposal, not
  // inside openReview (review must not auto-submit).
  const openReviewBody = src.match(/function openReview[\s\S]*?\n  \}/);
  ok(openReviewBody && !/proposeException/.test(openReviewBody[0]),
    'openReview must not call proposeException (review must not auto-submit)');
  const submitBody = src.match(/async function submitProposal[\s\S]*?\n  \}/);
  ok(submitBody && /proposeException/.test(submitBody[0]),
    'submitProposal must be the only place that calls proposeException');
});

test('PR-6C does not mutate the exposure when proposing (separation preserved)', () => {
  const src = readNoComments('src/pages/vault/VaultExposureDetail.tsx');
  // After a successful proposal the page records the new exception id and
  // does NOT re-fetch or write the exposure. There is exactly ONE
  // setExposure call (the initial load) and no exposure-status writer.
  ok(/proposedExceptionId/.test(src),
    'success path must surface the new proposed exception id');
  const setExposureCount = (src.match(/setExposure\(/g) || []).length;
  ok(setExposureCount <= 1,
    `exposure must be set only on initial load (found ${setExposureCount} setExposure calls)`);
  // No exposure-status mutation helper anywhere.
  ok(!/setExposureStatus|updateExposureStatus|patchExposure/.test(src),
    'proposing must not mutate exposure status');
});

test('PR-6C surfaces a link to the new proposed exception on success', () => {
  const src = read('src/pages/vault/VaultExposureDetail.tsx');
  ok(/\/vault\/\$\{slug\}\/exceptions\/\$\{proposedExceptionId\}/.test(src)
    || /exceptions\/\$\{proposedExceptionId\}/.test(src),
    'success state must link to the new proposed exception');
});

test('PR-6C propose helper is GET+POST propose only — no decision helpers added', () => {
  const api = read('src/shared/vault/api-client.ts');
  ok(/export async function proposeException/.test(api),
    'api-client must export proposeException');
  // proposeException must hit the base exceptions collection (POST), not a
  // decision sub-path.
  const proposeBlock = api.match(/export async function proposeException[\s\S]*?\n}/);
  ok(proposeBlock, 'proposeException block not found');
  ok(/\/exceptions`/.test(proposeBlock[0]) && /method:\s*['"]POST['"]/.test(proposeBlock[0]),
    'proposeException must POST to the exceptions collection');
  ok(!/approve|reject|revoke|extend/.test(proposeBlock[0]),
    'proposeException must not touch a decision sub-path');
});

// ---------- PR-6D: CEI-native proposal audit on the exposure detail ----------

test('PR-6D cites the source exposure when proposing', () => {
  const src = readNoComments('src/pages/vault/VaultExposureDetail.tsx');
  ok(/source_exposure_id:\s*ex\.exposure_id/.test(src),
    'the proposal body must cite source_exposure_id so the server records the audit event');
  const api = read('src/shared/vault/api-client.ts');
  ok(/source_exposure_id\?:\s*string/.test(api),
    'ProposeExceptionBody must carry an optional source_exposure_id');
});

test('PR-6D renders a read-only event history from listExposureEvents', () => {
  const src = readNoComments('src/pages/vault/VaultExposureDetail.tsx');
  ok(/listExposureEvents/.test(src),
    'exposure detail must read the event history via listExposureEvents');
  // PR-6F deliberately renamed the section: the history now includes
  // reviewer outcomes, so "Proposal history" became "Decision history".
  ok(/Decision history/.test(src),
    'exposure detail must surface a "Decision history" section');
  ok(/event_kind/.test(src), 'history rows must show the event kind');
  ok(/related_exception_id/.test(src), 'history rows must link the related exception');
  // The history is read-only: listExposureEvents is GET (no method literal
  // in the helper), and the detail page never mutates an event.
  const api = read('src/shared/vault/api-client.ts');
  const eventsBlock = api.match(/export async function listExposureEvents[\s\S]*?\n}/);
  ok(eventsBlock, 'listExposureEvents helper not found');
  ok(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(eventsBlock[0]),
    'listExposureEvents must be a GET');
  ok(!/createEvent|deleteEvent|updateEvent/.test(api),
    'api-client must NOT expose event mutation helpers (audit is append-only via the propose flow)');
});

test('PR-6D adds no exposure mutation and no decision helpers on the detail page', () => {
  const src = readNoComments('src/pages/vault/VaultExposureDetail.tsx');
  // Still no exposure-write or exception-decision verbs (6C invariant holds).
  for (const banned of ['createExposure', 'updateExposure', 'deleteExposure', 'approveException', 'rejectException', 'revokeException', 'extendException']) {
    ok(!src.includes(banned), `VaultExposureDetail must not reference ${banned}`);
  }
  // The page must not write vault_timeline_events client-side (it can't, but
  // assert the literal is absent so the separation is visible).
  ok(!/vault_timeline_events/.test(src),
    'the dashboard must not reference vault_timeline_events');
});

// ---------- PR-6E: reviewer-side source-exposure context ----------

test('VaultExceptionDetail shows read-only source-exposure context (PR-6E)', () => {
  const src = readNoComments('src/pages/vault/VaultExceptionDetail.tsx');
  ok(/listExceptionSourceEvents/.test(src),
    'exception detail must read source context via listExceptionSourceEvents');
  ok(/Source exposure/.test(src),
    'exception detail must render a "Source exposure" section');
  ok(/source_exposure/.test(src), 'must surface the source exposure fields');
  ok(/\/vault\/\$\{slug\}\/exposures\/\$\{sourceEvent\.source_exposure\.exposure_id\}/.test(src)
    || /exposures\/\$\{sourceEvent\.source_exposure\.exposure_id\}/.test(src),
    'must link back to the source exposure');
});

test('PR-6E source context is informational — no review-semantics change', () => {
  const src = readNoComments('src/pages/vault/VaultExceptionDetail.tsx');
  // The existing reviewer actions are unchanged: approve/reject/extend/revoke
  // still present (this page legitimately decides). 6E adds a READ, not a
  // new decision path. Assert the source-context block writes nothing.
  ok(/listExceptionSourceEvents/.test(src), 'source context is a read');
  // No mutation of exposures from the exception page.
  for (const banned of ['createExposure', 'updateExposure', 'deleteExposure', 'recordProposalFromExposure']) {
    ok(!src.includes(banned), `exception detail must not reference ${banned}`);
  }
  // No shared Vault Timeline reference.
  ok(!/vault_timeline_events/.test(src),
    'exception detail must not reference vault_timeline_events');
});

test('PR-6E source-context helper is GET-only — no new event kind / no event write', () => {
  const api = read('src/shared/vault/api-client.ts');
  ok(/export async function listExceptionSourceEvents/.test(api),
    'api-client must export listExceptionSourceEvents');
  const block = api.match(/export async function listExceptionSourceEvents[\s\S]*?\n}/);
  ok(block, 'listExceptionSourceEvents block not found');
  ok(/exposure-events\?/.test(block[0]) && /related_exception_id/.test(block[0]),
    'must GET /exposure-events filtered by related_exception_id');
  ok(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(block[0]),
    'listExceptionSourceEvents must be a GET');
  // No event-mutation helper exists anywhere in the api-client.
  ok(!/createEvent|updateEvent|deleteEvent|recordEvent/.test(api),
    'api-client must expose no event-mutation helper');
});

// ---------- PR-6F: reviewer-outcome audit on the dashboard ----------

test('PR-6F source card pins the PROPOSAL event — outcomes never impersonate the proposer', () => {
  const src = readNoComments('src/pages/vault/VaultExceptionDetail.tsx');
  // After 6F the related events include reviewer outcomes; the newest event
  // is no longer guaranteed to be the proposal. The "Source exposure" card
  // ("proposed by / proposed at") must select the proposal kind explicitly.
  ok(/\.find\(/.test(src) && /event_kind === 'exception_proposed_from_exposure'/.test(src),
    'exception detail must select the proposal event by kind');
  ok(!/setSourceEvent\(\s*\w+\.data\.events\[0\]\s*\)/.test(src),
    'exception detail must not blindly take events[0] as the source card');
});

test('PR-6F api-client kind union matches the server allowlist (no expired until reaper)', () => {
  const api = read('src/shared/vault/api-client.ts');
  const kindMatch = api.match(/export type ExposureEventKind\s*=([\s\S]*?);/);
  ok(kindMatch, 'api-client must export the ExposureEventKind union');
  const kinds = (kindMatch[1].match(/'[a-z_]+'/g) || []).map((s) => s.replace(/'/g, ''));
  const expected = [
    'exception_proposed_from_exposure',
    'exception_approved_from_exposure',
    'exception_rejected_from_exposure',
    'exception_revoked_from_exposure',
  ];
  ok(JSON.stringify([...kinds].sort()) === JSON.stringify([...expected].sort()),
    `ExposureEventKind must be exactly ${JSON.stringify(expected)}, found ${JSON.stringify(kinds)}`);
  ok(!/exception_expired_from_exposure/.test(api),
    'the expired kind must not appear client-side until the reaper scope block');
  // Outcome events arrive through the SAME GET surfaces — 6F adds no event
  // mutation helper and no new client write path.
  ok(!/createEvent|updateEvent|deleteEvent|recordEvent|recordOutcome/.test(api),
    'api-client must still expose no event-mutation helper');
});

// ---------- PR-15A: vulnerability-intelligence context on the dashboard ----

test('PR-15A intel section is context-only on the exposure detail', () => {
  const src = readNoComments('src/pages/vault/VaultExposureDetail.tsx');
  ok(/listExposureVulnIntel/.test(src), 'detail page must read intel via listExposureVulnIntel');
  ok(/refreshExposureVulnIntel/.test(src), 'detail page must refresh intel via the dedicated helper');
  ok(/Vulnerability intelligence/.test(src), 'detail page must render a "Vulnerability intelligence" section');
  ok(/does not decide the answer/.test(src),
    'the section must carry the context-only doctrine copy');
  // Intelligence never feeds a decision from this page: the decision verbs
  // stay banned (re-asserted), and severity is display-only — the decision
  // vocabulary may not appear in the intel section logic.
  for (const banned of ['approveException', 'rejectException', 'revokeException', 'extendException', 'updateExposure']) {
    ok(!src.includes(banned), `detail page must not reference ${banned}`);
  }
});

test('PR-15A api-client intel helpers: private read + intel-scoped refresh only', () => {
  const api = read('src/shared/vault/api-client.ts');
  ok(/export interface ExposureVulnIntel/.test(api), 'api-client must export the ExposureVulnIntel type');
  const listBlock = api.match(/export async function listExposureVulnIntel[\s\S]*?\n}/);
  ok(listBlock, 'listExposureVulnIntel not found');
  ok(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(listBlock[0]), 'list helper must be a GET');
  const refreshBlock = api.match(/export async function refreshExposureVulnIntel[\s\S]*?\n}/);
  ok(refreshBlock, 'refreshExposureVulnIntel not found');
  ok(/vuln-intel\/refresh/.test(refreshBlock[0]) && /method:\s*['"]POST['"]/.test(refreshBlock[0]),
    'refresh helper must POST to the vuln-intel/refresh sub-path only');
  ok(!/exceptions/.test(refreshBlock[0]), 'refresh helper must never touch the exception lane');
});

test('CEI read pages use only GET helpers + VaultAuthGate (PR-6B)', () => {
  for (const rel of ['src/pages/vault/VaultExposureList.tsx', 'src/pages/vault/VaultExposureDetail.tsx']) {
    const src = readNoComments(rel);
    ok(/VaultAuthGate/.test(src), `${rel} must use VaultAuthGate on unauth`);
    // No POST/PATCH/DELETE method literals (the api-client GET helpers carry
    // no method field; any method literal here would mean a mutation).
    ok(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(src),
      `${rel} must not issue a mutating request`);
  }
  // The api-client exposure helpers must be GET-only: no exposure mutation
  // export exists.
  const api = read('src/shared/vault/api-client.ts');
  ok(/export async function listExposures/.test(api), 'api-client must export listExposures');
  ok(/export async function getExposure/.test(api), 'api-client must export getExposure');
  ok(!/export async function createExposure/.test(api),
    'api-client must NOT export a createExposure helper (6B is read-only)');
});

test('CEI read surface adds no ingestion / upload hooks (PR-6B)', () => {
  // Ingestion-specific patterns only — NOT bare words like "import" which
  // legitimately appear in ES import statements, NOR doctrine prose in the
  // file header comments (which name the absence of these hooks).
  for (const rel of ['src/pages/vault/VaultExposureList.tsx', 'src/pages/vault/VaultExposureDetail.tsx']) {
    const src = readNoComments(rel).toLowerCase();
    for (const banned of ['type="file"', 'filereader', 'multipart', 'formdata', 'sbom', 'ingest', 'onupload', 'handleupload', 'handleimport']) {
      ok(!src.includes(banned),
        `${rel} must not add an ingestion/upload hook (${banned})`);
    }
  }
});

// ---------- 5. Evidence private-read links + masking honesty ----------

test('VaultEvidenceDetail honestly surfaces masking instead of empty-stringing', () => {
  const src = read('src/pages/vault/VaultEvidenceDetail.tsx');
  ok(/maskedFields/.test(src),
    'VaultEvidenceDetail must read the X-OpenSoyce-Vault-Masked-Fields header');
  ok(/body masked/.test(src),
    'VaultEvidenceDetail must render an explicit "body masked" notice when applicable');
});

// ---------- 6. Vault Timeline view with [PRIVATE] marker ----------

test('VaultTimeline renders the [PRIVATE] marker per PR-V1-E §5.2', () => {
  const src = read('src/pages/vault/VaultTimeline.tsx');
  ok(/\[PRIVATE\]/.test(src),
    'VaultTimeline must include the [PRIVATE] marker on Vault-sourced rows');
  ok(/listTimeline/.test(src), 'VaultTimeline must call listTimeline');
  ok(/next_cursor/.test(src), 'VaultTimeline must support cursor pagination');
});

// ---------- 7. No new server endpoints ----------

test('PR-V2-E does not introduce any new /api/vault/* routes', () => {
  const routes = read('src/server/vault/routes.js');
  // Snapshot of the exact route paths that should exist on main BEFORE
  // PR-V2-E ships. PR-V2-E is a UI-only PR; no additions allowed.
  const EXPECTED_ROUTES = new Set([
    "'/api/vault/auth/login'",
    "'/api/vault/auth/logout'",
    "'/api/vault/me'",
    "'/api/vault/workspaces'",
    "'/api/vault/workspaces/:slug'",
    "'/api/vault/workspaces/:slug/exceptions'",
    "'/api/vault/workspaces/:slug/exceptions/:id'",
    "'/api/vault/workspaces/:slug/exceptions/:id/approve'",
    "'/api/vault/workspaces/:slug/exceptions/:id/reject'",
    "'/api/vault/workspaces/:slug/exceptions/:id/revoke'",
    "'/api/vault/workspaces/:slug/exceptions/:id/extend'",
    "'/api/vault/workspaces/:slug/evidence/:id'",
    "'/api/vault/workspaces/:slug/timeline'",
    "'/api/vault/workspaces/:slug/timeline/:id'",
    "'/api/vault/cli/device-code'",
    "'/api/vault/cli/device-token'",
    "'/api/vault/cli/approve'",
  ]);
  const re = /'\/api\/vault\/[^']+'/g;
  let m;
  while ((m = re.exec(routes)) !== null) {
    ok(EXPECTED_ROUTES.has(m[0]),
      `${m[0]} is not in the PR-V2-D snapshot — PR-V2-E must NOT add new server routes`);
  }
});

// ---------- 8. CLI behavior preserved ----------

test('packages/cli is unchanged by PR-V2-E (dashboard does not touch CLI)', () => {
  // The PR-V2-E commit must not modify packages/cli/. We assert this by
  // checking that NO dashboard file imports the CLI package and that the
  // CLI sources still pass test:cli-v0 + test:cli-workspace-v0 (those
  // suites run separately; here we just structurally verify no cross-
  // imports).
  for (const rel of VAULT_DASHBOARD_FILES) {
    const src = read(rel);
    ok(!/from\s+['"][^'"]*packages\/cli/i.test(src),
      `${rel} must not import packages/cli/* (CLI surface stays atomic)`);
  }
});

// ---------- 9. Public spine behavior preserved ----------

test('Vault Dashboard files do not import public-spine pages or shared data', () => {
  const FORBIDDEN_PREFIXES = [
    '../pages/Home',
    '../pages/Proof',
    '../pages/TrustTimeline',
    '../pages/RepoTrustDashboard',
    '../pages/OpenSourceTrustCenter',
    '../components/Layout',
    '../../components/Layout',
    '../shared/trustTimeline',
    '../shared/repoTrustDashboard',
    '../shared/openSourceTrustCenter',
    '../../shared/trustTimeline',
    '../../shared/repoTrustDashboard',
    '../../shared/openSourceTrustCenter',
    '../server/badge',
    '../../server/badge',
  ];
  for (const rel of VAULT_DASHBOARD_FILES) {
    const src = read(rel);
    const imports = src.match(/from\s+['"]([^'"]+)['"]/g) || [];
    for (const imp of imports) {
      const m = imp.match(/from\s+['"]([^'"]+)['"]/);
      if (!m) continue;
      const spec = m[1];
      for (const banned of FORBIDDEN_PREFIXES) {
        ok(!spec.startsWith(banned),
          `${rel} imports ${spec} (banned public-spine prefix: ${banned})`);
      }
    }
  }
});

test('Public-spine pages do not import vault dashboard files', () => {
  // Walk every src/pages and src/components file that is NOT one of the
  // dashboard-allowed files and assert no import references the dashboard
  // tree, the /cli-auth page, or the api-client.
  const DASH_TARGETS = [
    '/CliAuth',
    '/vault/Vault',
    '/components/VaultLayout',
    '/shared/vault/api-client',
  ];
  const isDashboard = (rel) => VAULT_DASHBOARD_FILES.includes(rel);
  const walkSrc = (dir) => {
    const out = [];
    const stack = [path.join(root, dir)];
    while (stack.length > 0) {
      const cur = stack.pop();
      if (!fs.existsSync(cur)) continue;
      const st = fs.statSync(cur);
      if (st.isDirectory()) {
        for (const child of fs.readdirSync(cur)) stack.push(path.join(cur, child));
      } else if (st.isFile() && /\.(tsx?|jsx?|mjs)$/.test(cur)) {
        out.push(cur);
      }
    }
    return out;
  };
  const candidates = [
    ...walkSrc('src/pages'),
    ...walkSrc('src/components'),
    ...walkSrc('src/shared'),
  ];
  for (const f of candidates) {
    const rel = f.slice(root.length + 1).replace(/\\/g, '/');
    if (isDashboard(rel)) continue;
    if (rel.startsWith('src/shared/vault/')) continue;
    // App.tsx wires the routes — that's the one allowed cross-reference.
    if (rel === 'src/App.tsx') continue;
    const src = fs.readFileSync(f, 'utf8');
    for (const target of DASH_TARGETS) {
      const re = new RegExp(`from\\s+['"][^'"]*${target.replace(/\//g, '\\/')}`);
      if (re.test(src)) {
        throw new Error(`${rel} imports vault-dashboard target ${target}`);
      }
    }
  }
});

// ---------- API client + CSRF ----------

test('api-client.ts is the single source of CSRF header injection', () => {
  const src = read('src/shared/vault/api-client.ts');
  ok(/X-OpenSoyce-Vault-CSRF/.test(src),
    'api-client must set X-OpenSoyce-Vault-CSRF on mutating requests');
  ok(/opensoyce_vault_csrf/.test(src),
    'api-client must read the opensoyce_vault_csrf cookie');
  ok(/credentials:\s*['"]include['"]/.test(src),
    'api-client must use credentials: "include" so the Vault session cookie is attached');
});

test('Vault dashboard pages do NOT set the CSRF header themselves', () => {
  // Pages must delegate transport to api-client; setting CSRF anywhere else
  // creates two sources of truth and a leak risk.
  const pages = VAULT_DASHBOARD_FILES.filter((p) => p !== 'src/shared/vault/api-client.ts');
  for (const rel of pages) {
    const src = read(rel);
    ok(!/X-OpenSoyce-Vault-CSRF/.test(src),
      `${rel} sets the CSRF header directly — that must live in api-client.ts`);
  }
});

test('No vault dashboard file contains a literal "private-anchor" string', () => {
  // PR-V1-E §8: public-spine never emits private-anchor; the dashboard
  // renders private-anchors that come from the server (already shaped),
  // it does not synthesize the proofType literal client-side.
  for (const rel of VAULT_DASHBOARD_FILES) {
    const src = read(rel);
    ok(!/['"]private-anchor['"]/.test(src),
      `${rel} contains literal "private-anchor" (must not be synthesized client-side)`);
  }
});

// ---------- Reviewer-action wiring (uses existing endpoints) ----------

test('VaultExceptionDetail wires approve / reject / extend / revoke via the api-client', () => {
  const src = read('src/pages/vault/VaultExceptionDetail.tsx');
  ok(/approveException/.test(src), 'must import approveException');
  ok(/rejectException/.test(src), 'must import rejectException');
  ok(/extendException/.test(src), 'must import extendException');
  ok(/revokeExceptionApi/.test(src), 'must import revokeExceptionApi');
  // Role gating: only reviewer/owner sees the buttons.
  ok(/role === 'reviewer'\s*\|\|\s*role === 'owner'/.test(src),
    'reviewer actions must be role-gated to reviewer/owner');
});

// ---------- Wiring ----------

test('package.json wires test:vault-dashboard-v0 into test:ci', () => {
  const pkg = JSON.parse(read('package.json'));
  ok(pkg.scripts['test:vault-dashboard-v0'],
    'package.json must define test:vault-dashboard-v0');
  ok(/test-vault-dashboard-v0\.mjs/.test(pkg.scripts['test:ci'] || ''),
    'test:ci must chain scripts/test-vault-dashboard-v0.mjs');
});

(async () => {
  for (const fn of pending) await fn();
  console.log(`\nVault dashboard v0 tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
