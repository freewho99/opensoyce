#!/usr/bin/env node
/**
 * PR-17C invariants for the Trust Record API + webhooks.
 *
 * DOCTRINE:
 *   The API exposes records; it does not create new trust conclusions.
 *   Webhooks notify that a record changed; they do not certify the
 *   meaning of the change.
 *   Existing evidence builders remain the source of exported truth.
 *   Make the record portable, not more opinionated.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  buildWebhookPayload,
  signWebhookBody,
  validateTargetUrl,
  WEBHOOK_EVENT_TYPES,
  WEBHOOK_NON_CLAIM,
} from '../src/server/vault/webhooks.js';
import { mintApiToken, hashApiToken, API_TOKEN_PREFIX } from '../src/server/vault/reader-auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
const pending = [];

function test(name, fn) {
  pending.push(async () => {
    try {
      await fn();
      console.log(`PASS  ${name}`);
      passed += 1;
    } catch (e) {
      console.log(`FAIL  ${name} -- ${e.message}`);
      failed += 1;
    }
  });
}
function ok(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

function readSqlNoComments(rel) {
  return read(rel)
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('--');
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join('\n');
}

function stripJsComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('//');
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join('\n');
}

const MIGRATION = 'supabase/migrations/0027_trust_record_api_webhooks.sql';
const READER_AUTH = 'src/server/vault/reader-auth.js';
const API_TOKENS = 'src/server/vault/api-tokens.js';
const WEBHOOKS = 'src/server/vault/webhooks.js';
const TRUST_API = 'src/server/vault/trust-record-api.js';
const ROUTES = 'src/server/vault/trust-record-routes.js';

// ---------- 0027: plumbing tables, never conclusions ----------

test('0027 tokens: hashed secret only, read scope only, revocable (PR-17C)', () => {
  const sql = readSqlNoComments(MIGRATION);
  ok(/create table if not exists public\.vault_api_tokens/.test(sql), '0027 must create vault_api_tokens');
  ok(/token_hash\s+text not null unique check \(length\(token_hash\) = 64\)/.test(sql),
    'only the SHA-256 hash is stored, unique, fixed-length');
  ok(/scope\s+text not null default 'read' check \(scope = 'read'\)/.test(sql),
    'read is the ONLY scope that exists in v0 — write tokens are impossible by schema');
  ok(/revoked_at\s+timestamptz/.test(sql), 'tokens must be revocable');
  ok(/created_by\s+uuid not null references public\.vault_users/.test(sql),
    'every token records who minted it');
  ok(!/raw_token|token_secret|token_plain/.test(sql), 'no raw-token column may exist');
  ok(/alter table public\.vault_api_tokens enable row level security/.test(sql), 'RLS on tokens');
});

test('0027 webhooks: subscriptions + append-only delivery log, RLS (PR-17C)', () => {
  const sql = readSqlNoComments(MIGRATION);
  ok(/create table if not exists public\.vault_webhook_subscriptions/.test(sql), 'subscriptions table');
  ok(/event_types\s+text\[\] not null check \(array_length\(event_types, 1\) >= 1\)/.test(sql),
    'event types are non-empty by schema');
  ok(/disabled_at\s+timestamptz/.test(sql), 'subscriptions must be disable-able');
  ok(/create table if not exists public\.vault_webhook_deliveries/.test(sql), 'delivery log table');
  ok(/payload\s+jsonb not null/.test(sql), 'the delivery log keeps the body exactly as signed and sent');
  ok(/alter table public\.vault_webhook_subscriptions enable row level security/.test(sql)
    && /alter table public\.vault_webhook_deliveries enable row level security/.test(sql),
    'RLS on both webhook tables');
  // Plumbing, never conclusions.
  ok(!/'fixed'|'verified'|'certified'|'compliant'/.test(sql),
    'no verdict vocabulary anywhere in 0027');
  ok(!/vault_timeline_events|component_exposure/.test(sql),
    '0027 must not reference audit or observation tables');
});

// ---------- reader auth: read-only by construction ----------

test('reader auth: token is hashed, never logged, falls back to session (PR-17C)', () => {
  const src = stripJsComments(read(READER_AUTH));
  ok(/createHash\('sha256'\)/.test(src), 'tokens are matched by SHA-256 hash');
  ok(/requireVaultSession\(req, res, next\)/.test(src),
    'no bearer token -> the session path owns the response (401 included)');
  ok(/revoked_at/.test(src) && /invalid or revoked API token/.test(read(READER_AUTH)),
    'revoked tokens fail closed');
  ok(!/console\.log|console\.error/.test(src), 'the raw token must never be logged');
  const mintBlock = stripJsComments(read(API_TOKENS));
  ok(/token_hash:\s*hashApiToken\(rawToken\)/.test(mintBlock),
    'mint stores ONLY the hash');
  ok(/raw_token:\s*rawToken/.test(mintBlock) && /shown once/i.test(read(API_TOKENS)),
    'the raw token is returned once at mint and never stored');
});

test('token format + hash are stable and verifiable (PR-17C)', () => {
  const raw = mintApiToken();
  ok(raw.startsWith(API_TOKEN_PREFIX), `tokens carry the ${API_TOKEN_PREFIX} prefix`);
  ok(raw.length === API_TOKEN_PREFIX.length + 40, '20 random bytes hex-encoded');
  ok(hashApiToken(raw) === crypto.createHash('sha256').update(raw, 'utf8').digest('hex'),
    'the stored hash is plain SHA-256 of the raw token');
  ok(hashApiToken(raw).length === 64, 'hash length matches the 0027 CHECK');
});

test('read-only by construction: token auth is mounted on GET routes only (PR-17C)', () => {
  // Across EVERY route registrar, requireVaultReader may only appear in
  // app.get blocks — no write route consults token auth, so a token can
  // never write regardless of its scope column.
  const registrars = [
    ROUTES,
    'src/server/vault/routes.js',
    'src/server/vault/resolution-routes.js',
    'src/server/vault/evidence-export-routes.js',
    'src/server/vault/remediation-evidence-routes.js',
    'src/server/vault/evidence-rollup-routes.js',
    'src/server/cei/routes.js',
  ];
  for (const rel of registrars) {
    const src = read(rel);
    const writeBlocks = [...src.matchAll(/app\.(post|patch|delete|put)\(\s*'[^']+'[\s\S]*?\);/g)];
    for (const block of writeBlocks) {
      ok(!/requireVaultReader/.test(block[0]),
        `${rel}: a write route must never accept token auth (${block[0].slice(0, 60)}...)`);
    }
  }
  // The management routes (mint/revoke/webhook create/disable) are
  // session + CSRF.
  const routes = read(ROUTES);
  for (const path of ['/api-tokens\'', '/api-tokens/:id/revoke', '/webhooks\'', '/webhooks/:id/disable']) {
    const block = routes.match(new RegExp(`app\\.post\\(\\s*'[^']*${path.replace(/[/:'\\]/g, (c) => '\\' + c)}[\\s\\S]*?\\);`));
    if (block) {
      ok(/requireVaultSession/.test(block[0]) && /requireCsrf/.test(block[0]),
        `management write ${path} must be session + CSRF`);
    }
  }
});

test('workspace scoping: a token reads ONLY its own workspace (PR-17C)', () => {
  const src = stripJsComments(read(READER_AUTH));
  ok(/workspace\.workspace_id !== req\.vaultApiToken\.workspace_id/.test(src),
    'a token presented against another workspace slug must 404');
  ok(/not_found/.test(src), 'the refusal is the same indistinguishable 404 as non-membership');
});

// ---------- stable reads: records out, no new conclusions ----------

test('trust-record API reuses the shared builders and adds no facts (PR-17C)', () => {
  const src = stripJsComments(read(TRUST_API));
  ok(!/\.(insert|update|upsert|delete)\(/.test(src), 'the read API contains zero write verbs');
  ok(!/\.rpc\(/.test(src), 'no RPC');
  ok(/loadEvidenceBundleForExposure/.test(src) && /composeEvidencePacket/.test(src)
    && /summarizeChainBundle/.test(src),
    'every chain comes from the SAME builders the export and packet use');
  ok(!/from\(['"]component_exposure/.test(src) && !/from\(['"]vault_exception/.test(src),
    'the API module performs no record-table queries of its own');
  ok(/resolveWorkspaceForReader/.test(src), 'reader-gated reads');
});

test('export-like responses carry honest non-claims and disclosed caps (PR-17C)', () => {
  const src = read(TRUST_API);
  ok(/non_claims: \[\.\.\.PACKET_NON_CLAIMS\]/.test(src),
    'the list response carries the packet non-claims');
  ok(/non_claims: \[\.\.\.BUNDLE_DOES_NOT_PROVE\]/.test(src),
    'the single-record response carries the bundle non-claims');
  ok(/limitations: packet\.honest_edges\.limitations/.test(src),
    'caps and truncation are disclosed in the list response');
  ok(/chains_not_included/.test(src), 'capped-out chains stay identifiable');
});

// ---------- webhook payloads: evidence vocabulary, direction =/= evidence ----------

function resolutionEvent() {
  return {
    eventId: '11111111-1111-1111-1111-111111111111',
    eventType: 'reviewer_resolution.recorded',
    workspace: { workspace_id: 'w1', slug: 'acme' },
    occurredAt: '2026-06-12T12:00:00.000Z',
    actor: { github_login: 'reviewer' },
    recordIds: { exception_id: 'e1', resolution_id: 'r1' },
    state: 'remediation_required',
    reviewerDirection: 'remediation_required',
  };
}

function evidenceEvent() {
  return {
    eventId: '22222222-2222-2222-2222-222222222222',
    eventType: 'remediation_evidence.recorded',
    workspace: { workspace_id: 'w1', slug: 'acme' },
    occurredAt: '2026-06-12T12:05:00.000Z',
    actor: { github_login: 'closer' },
    recordIds: { exception_id: 'e1', evidence_id: 'v1', resolution_id: 'r1', exposure_id: 'x1' },
    state: 'evidence_recorded',
    remediationEvidence: { evidence_type: 'fixed_version_observed', evidence_ref: 'pkg@2.0.0 observed', related_resolution_id: 'r1' },
  };
}

test('webhook payload separates reviewer direction from remediation evidence (PR-17C)', () => {
  const direction = buildWebhookPayload(resolutionEvent());
  ok(direction.reviewer_direction === 'remediation_required', 'direction events carry reviewer_direction');
  ok(direction.remediation_evidence === undefined,
    'a direction event must NOT carry remediation_evidence — a direction is not evidence');
  const evidence = buildWebhookPayload(evidenceEvent());
  ok(evidence.remediation_evidence.evidence_ref === 'pkg@2.0.0 observed',
    'evidence events carry the citation');
  ok(evidence.reviewer_direction === undefined,
    'an evidence event must NOT carry reviewer_direction — evidence is not a direction');
  ok(evidence.remediation_evidence.related_resolution_id === 'r1',
    'evidence cites the direction it answers, by id');
});

test('webhook payload preserves actor, timestamp, linkage, and the non-claim (PR-17C)', () => {
  const p = buildWebhookPayload(evidenceEvent());
  ok(p.event_id === '22222222-2222-2222-2222-222222222222' && p.event_type === 'remediation_evidence.recorded',
    'event identity preserved');
  ok(p.workspace.slug === 'acme' && p.occurred_at === '2026-06-12T12:05:00.000Z', 'workspace + timestamp preserved');
  ok(p.actor.github_login === 'closer', 'actor preserved when available');
  ok(p.record_ids.exception_id === 'e1' && p.record_ids.evidence_id === 'v1' && p.record_ids.exposure_id === 'x1',
    'linkable chain ids preserved');
  ok(p.non_claim === WEBHOOK_NON_CLAIM, 'every payload carries the non-claim');
  ok(/does not certify/.test(WEBHOOK_NON_CLAIM), 'the non-claim disclaims certification');
});

test('webhook payload vocabulary is evidence-based; banned verdict values never appear (PR-17C)', () => {
  for (const event of [resolutionEvent(), evidenceEvent()]) {
    const json = JSON.stringify(buildWebhookPayload(event));
    for (const banned of ['"fixed"', '"verified_safe"', '"certified"', '"compliant"', '"approved_release"']) {
      ok(!json.includes(banned), `payload must never carry the verdict value ${banned}`);
    }
  }
  const src = read(WEBHOOKS);
  ok(!/'fixed'|'verified_safe'|'certified'|'compliant'|'approved_release'/.test(stripJsComments(src)),
    'no verdict vocabulary in the webhook module');
  ok(JSON.stringify(WEBHOOK_EVENT_TYPES)
    === JSON.stringify(['exception.expired', 'reviewer_resolution.recorded', 'remediation_evidence.recorded']),
    'v0 event types are exactly the three record-change events');
});

test('webhook signature is present and independently verifiable (PR-17C)', () => {
  const body = JSON.stringify(buildWebhookPayload(resolutionEvent()));
  const secret = 'whsec_' + 'a'.repeat(48);
  const sig = signWebhookBody(body, secret);
  ok(sig.startsWith('sha256='), 'signature uses the sha256= scheme');
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
  ok(sig === expected, 'a receiver can verify with plain HMAC-SHA256 over the raw body');
  ok(signWebhookBody(body, 'whsec_' + 'b'.repeat(48)) !== sig, 'a different secret yields a different signature');
  const src = read(WEBHOOKS);
  ok(/X-OpenSoyce-Webhook-Signature/.test(src), 'the signature travels in the documented header');
});

test('delivery is bounded and safe: https-only SSRF guard, timeout, no retries (PR-17C)', () => {
  ok(validateTargetUrl('https://hooks.example.com/opensoyce') === null, 'a normal https target is valid');
  for (const bad of [
    'http://hooks.example.com/x',
    'https://localhost/x',
    'https://127.0.0.1/x',
    'https://10.1.2.3/x',
    'https://192.168.1.5/x',
    'https://172.20.0.1/x',
    'https://169.254.169.254/latest/meta-data',
    'https://internal.service.local/x',
    'https://metadata.internal/x',
    'not a url',
  ]) {
    ok(validateTargetUrl(bad) !== null, `${bad} must be refused`);
  }
  const src = stripJsComments(read(WEBHOOKS));
  ok(/AbortController/.test(src) && /DELIVERY_TIMEOUT_MS/.test(src), 'delivery has a bounded timeout');
  ok(!/retry|setInterval|backoff/i.test(src), 'no retry machinery in v0 — one attempt, logged');
  ok(/validateTargetUrl\(sub\.target_url\)/.test(src), 'the target is re-checked at delivery time');
  ok(/redirect:\s*'error'/.test(src), 'redirects are refused (no SSRF via 302)');
});

test('disabled webhooks never deliver; delivery is per-event bounded and logged (PR-17C)', () => {
  const src = stripJsComments(read(WEBHOOKS));
  ok(/\.is\('disabled_at', null\)/.test(src), 'only enabled subscriptions are loaded for delivery');
  ok(/MAX_SUBS_PER_EVENT/.test(src), 'subscriptions notified per event are capped');
  ok(/from\(['"]vault_webhook_deliveries['"]\)\.insert/.test(src),
    'every attempt is logged to the delivery table');
  ok(/return \{ delivered: 0, failed: 0/.test(src),
    'delivery never throws into the record-writing caller');
});

// ---------- emit points: notification only, record invariants intact ----------

test('record-change emits exist at the 16B / 16C / reaper write points, call-only (PR-17C)', () => {
  const resolution = stripJsComments(read('src/server/vault/exception-resolutions.js'));
  ok(/deliverWorkspaceWebhooks/.test(resolution) && /reviewer_resolution\.recorded/.test(resolution),
    '16B resolve emits reviewer_resolution.recorded');
  const evidence = stripJsComments(read('src/server/vault/remediation-evidence.js'));
  ok(/deliverWorkspaceWebhooks/.test(evidence) && /remediation_evidence\.recorded/.test(evidence),
    '16C record emits remediation_evidence.recorded');
  const reaper = stripJsComments(read('scripts/reap-expired-exceptions.mjs'));
  ok(/deliverWorkspaceWebhooks/.test(reaper) && /exception\.expired/.test(reaper),
    'the reaper emits exception.expired');
  ok(/expired_pending_review/.test(reaper), 'the expired state speaks the evidence vocabulary');
  // The emitters add NO writes to the record modules — their one-table
  // invariants are still pinned by the 16B/16C suites; here we assert the
  // emit is a bare call, not an inline delivery implementation.
  for (const [rel, src] of [['exception-resolutions.js', resolution], ['remediation-evidence.js', evidence]]) {
    ok(!/vault_webhook/.test(src), `${rel} must not touch webhook tables directly — the delivery module owns them`);
  }
});

// ---------- routes, guard, wiring ----------

test('trust-record routes: own registrar, reader reads, session-only management (PR-17C)', () => {
  const routes = read(ROUTES);
  for (const r of ['trust-records\'', 'trust-records/:id', 'evidence-bundles/:id']) {
    ok(routes.includes(r), `route ${r} must be registered`);
  }
  const getBlocks = [...routes.matchAll(/app\.get\(\s*'[^']*(trust-records|evidence-bundles)[^']*'[\s\S]*?\);/g)];
  ok(getBlocks.length === 3, 'three stable read routes');
  for (const block of getBlocks) {
    ok(/requireVaultReader/.test(block[0]), 'stable reads accept session OR read-only token');
  }
  const literals = [...routes.matchAll(/'(\/api\/[^']+)'/g)].map((m) => m[1]);
  ok(literals.every((l) => l.startsWith('/api/vault/')), 'all literals under the private prefix');
  const vaultRoutes = read('src/server/vault/routes.js');
  ok(/registerTrustRecordRoutes/.test(vaultRoutes), 'mounted from the single private route table');
  ok(!/trust-records'/.test(vaultRoutes) && !/api-tokens'/.test(vaultRoutes),
    'routes.js must not carry the new literals (snapshot invariant)');
});

test('release-integrity guard knows the 0027 tables and the new route family (PR-17C)', () => {
  const guard = read('scripts/check-release-integrity.mjs');
  ok(/vault_api_tokens/.test(guard) && /vault_webhook_subscriptions/.test(guard)
    && /vault_webhook_deliveries/.test(guard),
    'REQUIRED_TABLES must include the three 0027 tables');
  ok(/trust-record-routes\.js/.test(guard), 'literal scan must include the registrar');
  ok(/__guard__\/trust-records/.test(guard), 'runtime layer must probe the trust-records family');
});

test('package.json wires test:trust-record-api-v0 into test:ci (PR-17C)', () => {
  const pkg = JSON.parse(read('package.json'));
  ok(pkg.scripts['test:trust-record-api-v0'], 'missing test:trust-record-api-v0 script');
  ok(/test-trust-record-api-v0\.mjs/.test(pkg.scripts['test:ci'] || ''),
    'test:ci must chain scripts/test-trust-record-api-v0.mjs');
});

(async () => {
  for (const fn of pending) await fn();
  console.log(`\nTrust Record API v0 tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
