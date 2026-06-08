// OpenSoyce Trust Vault — idempotency key store helpers.
//
// PR-V2-B. Per PR-V1-C §7.
//
// Optional idempotency_key per mutating POST. Stored in
// vault_idempotency_keys keyed on (workspace_id, idempotency_key). TTL is
// 24 hours; lookups always filter by (created_at >= now() - 24h) so a stale
// reaper schedule doesn't return wrong snapshots.
//
// Authorization is NOT bypassed by an idempotency replay: the stored
// row's user_id is compared against the current session's user_id, and a
// mismatch returns 403 (a different user retrying with the same key gets
// rejected per PR-V1-C §7.3).

import { vaultDb } from './db.js';
import { sendError, ERROR_CODES } from './errors.js';

const TTL_MS = 24 * 60 * 60 * 1000;

const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_:\-./]{1,128}$/;

export function isValidIdempotencyKey(value) {
  return typeof value === 'string' && IDEMPOTENCY_KEY_RE.test(value);
}

/**
 * Look up a prior response for the (workspace_id, idempotency_key) tuple.
 * Returns null if there is no prior matching row inside the TTL window.
 *
 * On HIT: returns { response_status, response_snapshot, user_id }. The
 * caller checks user_id against session.user_id; mismatch -> 403.
 * On MISS: returns null.
 */
export async function lookupIdempotencyResponse(workspaceId, idempotencyKey) {
  if (!isValidIdempotencyKey(idempotencyKey)) return null;
  const supabase = vaultDb();
  const since = new Date(Date.now() - TTL_MS).toISOString();
  const { data, error } = await supabase
    .from('vault_idempotency_keys')
    .select('user_id, response_status, response_snapshot, created_at')
    .eq('workspace_id', workspaceId)
    .eq('idempotency_key', idempotencyKey)
    .gte('created_at', since)
    .limit(1);
  if (error) return null;
  const row = Array.isArray(data) && data[0];
  return row || null;
}

/**
 * Save a (workspace_id, idempotency_key) → response mapping for replay.
 * Best-effort: a duplicate-row race (two simultaneous identical requests)
 * lands on the (workspace_id, idempotency_key) unique constraint and the
 * second insert silently fails — that's the correct behavior; the
 * lookup-before-doing-work above will see the first row on the retry.
 */
export async function storeIdempotencyResponse({
  workspaceId,
  userId,
  idempotencyKey,
  requestRoute,
  responseStatus,
  responseSnapshot,
}) {
  if (!isValidIdempotencyKey(idempotencyKey)) return;
  const supabase = vaultDb();
  await supabase.from('vault_idempotency_keys').insert({
    workspace_id: workspaceId,
    user_id: userId,
    idempotency_key: idempotencyKey,
    request_route: requestRoute,
    response_status: responseStatus,
    response_snapshot: responseSnapshot,
  });
}

/**
 * Wrapper used by handlers: if an idempotency_key was provided and we have a
 * prior response inside the TTL, replay it (with auth check). Returns:
 *   { replayed: true }   — response was written to res; handler should return
 *   { replayed: false }  — no prior response; handler proceeds
 */
export async function maybeReplayIdempotent(req, res, session, workspaceId, idempotencyKey) {
  if (!idempotencyKey) return { replayed: false };
  if (!isValidIdempotencyKey(idempotencyKey)) {
    sendError(res, 400, ERROR_CODES.bad_request, 'idempotency_key invalid (1-128 chars; alnum + _-:./ only)');
    return { replayed: true };
  }
  const prior = await lookupIdempotencyResponse(workspaceId, idempotencyKey);
  if (!prior) return { replayed: false };
  if (prior.user_id !== session.user_id) {
    sendError(res, 403, ERROR_CODES.forbidden_role, 'idempotency_key belongs to a different session');
    return { replayed: true };
  }
  res.status(prior.response_status).json(prior.response_snapshot);
  return { replayed: true };
}
