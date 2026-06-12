// OpenSoyce Trust Vault (PR-17C) — webhook subscriptions + delivery.
//
// DOCTRINE: a webhook notifies that a record changed; it does not
// certify the meaning of the change. Payloads carry evidence-based state
// vocabulary, actor, timestamps, and record ids — and keep the reviewer
// DIRECTION separate from remediation EVIDENCE, exactly like the export.
//
// Delivery is safe and bounded by construction:
//   - https targets only; loopback/private/link-local hosts refused at
//     create time AND re-checked at delivery time
//   - one attempt per event per subscription, 5s timeout, NO retries
//   - at most MAX_SUBS_PER_EVENT subscriptions notified per event
//   - every attempt is logged to vault_webhook_deliveries (append-only)
//   - delivery NEVER throws into its caller: the record write it echoes
//     has already succeeded and stands regardless
//
// Signature: HMAC-SHA256 of the exact JSON body with the subscription's
// shared secret, sent as `X-OpenSoyce-Webhook-Signature: sha256=<hex>`.

import crypto from 'node:crypto';
import { vaultDb } from './db.js';
import { sendError, ERROR_CODES } from './errors.js';
import { resolveWorkspaceForMember, requireRole } from './rbac.js';

export const WEBHOOK_EVENT_TYPES = Object.freeze([
  'exception.expired',
  'reviewer_resolution.recorded',
  'remediation_evidence.recorded',
  // PR-EV-1: a citation check was recorded. The state speaks the check
  // vocabulary (check_passed / check_failed / check_inconclusive) —
  // never a verdict about remediation.
  'evidence_verification.checked',
  // PR-18A: Trust Agent draft lifecycle. A draft is a suggestion record;
  // approval/rejection is a separate human action. None of these events
  // is a trust decision.
  'agent_draft.created',
  'agent_draft.approved',
  'agent_draft.rejected',
]);

export const WEBHOOK_SIGNATURE_HEADER = 'X-OpenSoyce-Webhook-Signature';
const DELIVERY_TIMEOUT_MS = 5000;
const MAX_SUBS_PER_EVENT = 5;
const MAX_SUBSCRIPTIONS_PER_WORKSPACE = 10;

// The non-claim that travels in EVERY payload — a notification separated
// from this module still carries its boundary.
export const WEBHOOK_NON_CLAIM =
  'A webhook notifies that a record changed; it does not certify the meaning of the change.';

// ---------------------------------------------------------------------------
// Pure pieces (exported for deterministic tests — no I/O)
// ---------------------------------------------------------------------------

/**
 * Validate a webhook target URL: https only, no loopback / private /
 * link-local / metadata hosts. Returns null when valid, else the refusal
 * message. Pure.
 */
export function validateTargetUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return 'target_url must be a valid absolute URL';
  }
  if (url.protocol !== 'https:') {
    return 'target_url must use https';
  }
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host === '0.0.0.0' || host === '[::1]' || host === '::1'
    || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return 'target_url must not point at a loopback or internal host';
  }
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)
    || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
    return 'target_url must not point at a private or link-local address';
  }
  return null;
}

/**
 * Build the JSON payload for one event. Pure: every value comes from the
 * already-written record; the payload adds vocabulary, never conclusions.
 *
 * event = {
 *   eventId, eventType, workspace: {workspace_id, slug}, occurredAt,
 *   actor: {github_login} | {kind:'system'} | null,
 *   recordIds: { exposure_id?, exception_id?, resolution_id?, evidence_id?, question_id? },
 *   state: evidence-vocabulary string,
 *   reviewerDirection?: string        (resolution events ONLY)
 *   remediationEvidence?: { evidence_type, evidence_ref, related_resolution_id }  (evidence events ONLY)
 * }
 */
export function buildWebhookPayload(event) {
  const payload = {
    event_id: event.eventId,
    event_type: event.eventType,
    workspace: {
      workspace_id: event.workspace.workspace_id,
      slug: event.workspace.slug || null,
    },
    occurred_at: event.occurredAt,
    actor: event.actor || null,
    record_ids: event.recordIds || {},
    state: event.state,
    non_claim: WEBHOOK_NON_CLAIM,
  };
  // Direction and evidence are DISTINCT fields and never coexist on one
  // event: a direction says what a reviewer decided should happen; the
  // evidence says what a human cited as having happened.
  if (event.reviewerDirection !== undefined) {
    payload.reviewer_direction = event.reviewerDirection;
  }
  if (event.remediationEvidence !== undefined) {
    payload.remediation_evidence = {
      evidence_type: event.remediationEvidence.evidence_type,
      evidence_ref: event.remediationEvidence.evidence_ref,
      related_resolution_id: event.remediationEvidence.related_resolution_id || null,
    };
  }
  // PR-EV-1: a citation check result. Distinct from direction AND from
  // evidence — a check is a system observation about a citation, made at
  // a point in time, never a verdict.
  if (event.verificationCheck !== undefined) {
    payload.verification_check = {
      check_kind: event.verificationCheck.check_kind,
      check_status: event.verificationCheck.check_status,
    };
  }
  // PR-18A: a Trust Agent draft. Distinct from everything above — a
  // draft is a suggestion derived from records; the status says whether
  // a human has decided on the DRAFT, never on the trust.
  if (event.agentDraft !== undefined) {
    payload.agent_draft = {
      draft_kind: event.agentDraft.draft_kind,
      draft_status: event.agentDraft.draft_status,
    };
  }
  return payload;
}

/** HMAC-SHA256 over the exact body string. Pure. */
export function signWebhookBody(body, secret) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

async function postWithTimeout(targetUrl, body, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body,
      signal: controller.signal,
      redirect: 'error',
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, status: null, error: (err && err.message) || 'delivery failed' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Notify a workspace's enabled subscriptions that a record changed.
 * Best-effort, bounded, and NEVER throws: the record write this echoes
 * has already succeeded; delivery is a courtesy, the record is the truth.
 * Every attempt (success or failure) is logged to vault_webhook_deliveries.
 *
 * Accepts the supabase client as an argument so the same function serves
 * the API handlers (vaultDb) and the reaper (service-role client).
 */
export async function deliverWorkspaceWebhooks(supabase, event) {
  try {
    if (!event.eventId) event.eventId = crypto.randomUUID();
    const { data, error } = await supabase
      .from('vault_webhook_subscriptions')
      .select('subscription_id, target_url, event_types, signing_secret, disabled_at')
      .eq('workspace_id', event.workspace.workspace_id)
      .is('disabled_at', null)
      .order('created_at', { ascending: true })
      .limit(MAX_SUBS_PER_EVENT * 2);
    if (error) return { delivered: 0, failed: 0, error: error.message };
    const subs = (Array.isArray(data) ? data : [])
      .filter((s) => Array.isArray(s.event_types) && s.event_types.includes(event.eventType))
      .slice(0, MAX_SUBS_PER_EVENT);
    if (subs.length === 0) return { delivered: 0, failed: 0 };

    const payload = buildWebhookPayload(event);
    const body = JSON.stringify(payload);

    let delivered = 0;
    let failed = 0;
    await Promise.all(subs.map(async (sub) => {
      // Re-check the target at delivery time — a URL that became invalid
      // since creation fails closed.
      const urlError = validateTargetUrl(sub.target_url);
      const result = urlError
        ? { ok: false, status: null, error: urlError }
        : await postWithTimeout(sub.target_url, body, {
          [WEBHOOK_SIGNATURE_HEADER]: signWebhookBody(body, sub.signing_secret),
          'X-OpenSoyce-Webhook-Event': event.eventType,
          'X-OpenSoyce-Webhook-Id': event.eventId,
        });
      if (result.ok) delivered += 1; else failed += 1;
      // Append-only delivery log; a logging failure never affects the
      // outcome (the attempt already happened).
      await supabase.from('vault_webhook_deliveries').insert({
        workspace_id: event.workspace.workspace_id,
        subscription_id: sub.subscription_id,
        event_id: event.eventId,
        event_type: event.eventType,
        target_url: sub.target_url,
        payload,
        ok: result.ok,
        status_code: result.status,
        error: result.error ? String(result.error).slice(0, 500) : null,
      });
    }));
    return { delivered, failed };
  } catch (err) {
    // Never throw into the record-writing caller.
    return { delivered: 0, failed: 0, error: (err && err.message) || 'webhook delivery error' };
  }
}

// ---------------------------------------------------------------------------
// Subscription management (session + CSRF + owner)
// ---------------------------------------------------------------------------

function shapeSubscriptionRow(row) {
  if (!row) return null;
  return {
    subscription_id: row.subscription_id,
    workspace_id: row.workspace_id,
    target_url: row.target_url,
    event_types: row.event_types,
    created_by: row.created_by_user
      ? {
        user_id: row.created_by_user.user_id,
        github_login: row.created_by_user.github_login,
        display_name: row.created_by_user.display_name || null,
      }
      : null,
    created_at: row.created_at,
    disabled_at: row.disabled_at || null,
    visibility: 'private',
  };
}

// The signing secret is deliberately ABSENT from this select: it is
// returned exactly once at creation and never again.
const SUBSCRIPTION_SELECT =
  'subscription_id, workspace_id, target_url, event_types, created_at, disabled_at,'
  + ' created_by_user:created_by(user_id, github_login, display_name)';

/** GET /api/vault/workspaces/:slug/webhooks — owner list, secrets absent. */
export async function handleListWebhooks(req, res) {
  const slug = (req.params && req.params.slug) || '';
  const resolved = await resolveWorkspaceForMember(req, res, slug);
  if (!resolved) return;
  const { workspace, membership } = resolved;
  if (!requireRole(res, membership, 'owner')) return;

  const supabase = vaultDb();
  const { data, error } = await supabase
    .from('vault_webhook_subscriptions')
    .select(SUBSCRIPTION_SELECT)
    .eq('workspace_id', workspace.workspace_id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'webhook list failed');
  }
  res.status(200).json({
    webhooks: (Array.isArray(data) ? data : []).map(shapeSubscriptionRow),
    event_types: [...WEBHOOK_EVENT_TYPES],
    visibility: 'private',
  });
}

/**
 * POST /api/vault/workspaces/:slug/webhooks   { target_url, event_types }
 * The signing secret is generated server-side and returned ONCE.
 */
export async function handleCreateWebhook(req, res) {
  const slug = (req.params && req.params.slug) || '';
  const resolved = await resolveWorkspaceForMember(req, res, slug);
  if (!resolved) return;
  const { workspace, membership } = resolved;
  if (!requireRole(res, membership, 'owner')) return;

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const targetUrl = typeof body.target_url === 'string' ? body.target_url.trim() : '';
  const urlError = validateTargetUrl(targetUrl);
  if (urlError || targetUrl.length > 512) {
    return sendError(res, 400, ERROR_CODES.bad_request, urlError || 'target_url must be at most 512 characters');
  }
  const eventTypes = Array.isArray(body.event_types)
    ? [...new Set(body.event_types.filter((t) => typeof t === 'string'))]
    : [];
  if (eventTypes.length === 0 || eventTypes.some((t) => !WEBHOOK_EVENT_TYPES.includes(t))) {
    return sendError(res, 400, ERROR_CODES.bad_request,
      `event_types must be a non-empty subset of: ${WEBHOOK_EVENT_TYPES.join(', ')}`);
  }

  const supabase = vaultDb();
  const { count, error: countError } = await supabase
    .from('vault_webhook_subscriptions')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspace.workspace_id)
    .is('disabled_at', null);
  if (countError) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'webhook count failed');
  }
  if (typeof count === 'number' && count >= MAX_SUBSCRIPTIONS_PER_WORKSPACE) {
    return sendError(res, 400, ERROR_CODES.bad_request,
      `a workspace carries at most ${MAX_SUBSCRIPTIONS_PER_WORKSPACE} enabled webhooks — disable one first`);
  }

  const signingSecret = 'whsec_' + crypto.randomBytes(24).toString('hex');
  const { data: inserted, error: insertError } = await supabase
    .from('vault_webhook_subscriptions')
    .insert({
      workspace_id: workspace.workspace_id,
      target_url: targetUrl,
      event_types: eventTypes,
      signing_secret: signingSecret,
      created_by: req.vaultSession.user_id,
    })
    .select(SUBSCRIPTION_SELECT)
    .limit(1);
  if (insertError) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'webhook create failed');
  }
  res.status(201).json({
    webhook: shapeSubscriptionRow(Array.isArray(inserted) && inserted[0]),
    // Shown ONCE. Verify deliveries with HMAC-SHA256 over the raw body.
    signing_secret: signingSecret,
    signing_secret_notice: 'Store this secret now — it is shown once and cannot be retrieved again.',
    signature_header: WEBHOOK_SIGNATURE_HEADER,
    visibility: 'private',
  });
}

/** POST /api/vault/workspaces/:slug/webhooks/:id/disable — idempotent. */
export async function handleDisableWebhook(req, res) {
  const slug = (req.params && req.params.slug) || '';
  const subscriptionId = (req.params && req.params.id) || '';
  const resolved = await resolveWorkspaceForMember(req, res, slug);
  if (!resolved) return;
  const { workspace, membership } = resolved;
  if (!requireRole(res, membership, 'owner')) return;

  const supabase = vaultDb();
  const { data: existing, error: lookupError } = await supabase
    .from('vault_webhook_subscriptions')
    .select('subscription_id, disabled_at')
    .eq('workspace_id', workspace.workspace_id)
    .eq('subscription_id', subscriptionId)
    .limit(1);
  if (lookupError) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'webhook lookup failed');
  }
  if (!(Array.isArray(existing) && existing[0])) {
    return sendError(res, 404, ERROR_CODES.not_found, 'not found');
  }
  if (!existing[0].disabled_at) {
    const { error: updateError } = await supabase
      .from('vault_webhook_subscriptions')
      .update({ disabled_at: new Date().toISOString() })
      .eq('workspace_id', workspace.workspace_id)
      .eq('subscription_id', subscriptionId);
    if (updateError) {
      return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'webhook disable failed');
    }
  }
  const { data } = await supabase
    .from('vault_webhook_subscriptions').select(SUBSCRIPTION_SELECT)
    .eq('subscription_id', subscriptionId).limit(1);
  res.status(200).json({ webhook: shapeSubscriptionRow(Array.isArray(data) && data[0]), visibility: 'private' });
}

/** GET /api/vault/workspaces/:slug/webhooks/:id/deliveries — recent log. */
export async function handleListWebhookDeliveries(req, res) {
  const slug = (req.params && req.params.slug) || '';
  const subscriptionId = (req.params && req.params.id) || '';
  const resolved = await resolveWorkspaceForMember(req, res, slug);
  if (!resolved) return;
  const { workspace, membership } = resolved;
  if (!requireRole(res, membership, 'owner')) return;

  const supabase = vaultDb();
  const { data, error } = await supabase
    .from('vault_webhook_deliveries')
    .select('delivery_id, event_id, event_type, target_url, ok, status_code, error, created_at')
    .eq('workspace_id', workspace.workspace_id)
    .eq('subscription_id', subscriptionId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'webhook delivery list failed');
  }
  res.status(200).json({
    deliveries: Array.isArray(data) ? data : [],
    visibility: 'private',
  });
}
