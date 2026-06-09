// OpenSoyce Trust Vault — CLI device-code handlers.
//
// PR-V2-D. Per PR-V1-E §1.1 (device-code flow).
//
// Three endpoints:
//   POST /api/vault/cli/device-code   — public; mints a pending device_code
//   POST /api/vault/cli/device-token  — public; polls for token
//   POST /api/vault/cli/approve       — requires browser session; flips
//                                       a pending row to approved
//
// The CLI calls device-code, displays user_code + verification URI, then
// polls device-token until the user opens the URL in a browser, signs in
// via the existing PR-V2-A OAuth flow, and POSTs the user_code to approve.
// The next device-token poll mints a vault_sessions row and returns the
// session token.
//
// PR-V2-D ships the endpoints. PR-V2-E (Vault Dashboard UI) ships the
// verification page that drives /approve via the browser; in the meantime
// the approve endpoint is reachable to any authenticated session.
//
// Logout reuses the existing /api/vault/auth/logout handler. The CLI
// session is identical to a browser session at the vault_sessions row
// level — only the cookie-vs-Cookie-header transport differs.

import crypto from 'node:crypto';
import { vaultDb } from './db.js';
import { sendError, ERROR_CODES } from './errors.js';
import { sessionTtlSeconds } from './auth.js';

const DEVICE_CODE_BYTES = 32; // 64 hex chars
const USER_CODE_LENGTH = 8;
const DEVICE_CODE_TTL_SEC = 10 * 60;
const POLL_INTERVAL_SEC = 5;
const USER_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O / I / 0 / 1

function generateDeviceCode() {
  return crypto.randomBytes(DEVICE_CODE_BYTES).toString('hex');
}

function generateUserCode() {
  let out = '';
  const bytes = crypto.randomBytes(USER_CODE_LENGTH);
  for (let i = 0; i < USER_CODE_LENGTH; i++) {
    out += USER_CODE_ALPHABET[bytes[i] % USER_CODE_ALPHABET.length];
  }
  // Format as XXXX-XXXX for readability.
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

function originFromRequest(req) {
  const forwardedProto = req.headers && req.headers['x-forwarded-proto'];
  const proto = (typeof forwardedProto === 'string' && forwardedProto.split(',')[0].trim()) || 'https';
  const host = req.headers && req.headers.host;
  if (typeof host !== 'string' || host.length === 0) return null;
  return `${proto}://${host}`;
}

/**
 * POST /api/vault/cli/device-code
 *
 * Body: (none required)
 * Response: { device_code, user_code, verification_uri, interval, expires_in }
 *
 * Public — no session required. The handler is fronted by
 * setPrivateCacheHeaders only.
 */
export async function handleCreateDeviceCode(req, res) {
  let supabase;
  try {
    supabase = vaultDb();
  } catch {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault database is not configured');
  }

  const deviceCode = generateDeviceCode();
  let userCode;
  let inserted = null;
  // Retry on the rare user_code collision (partial unique index). Three
  // tries is enough; the alphabet is 32^8 ≈ 1e12.
  for (let attempt = 0; attempt < 3 && !inserted; attempt++) {
    userCode = generateUserCode();
    const expiresAt = new Date(Date.now() + DEVICE_CODE_TTL_SEC * 1000).toISOString();
    const apiBase = originFromRequest(req) || '';
    const { data, error } = await supabase
      .from('vault_device_codes')
      .insert({
        device_code: deviceCode,
        user_code: userCode,
        status: 'pending',
        api_base: apiBase,
        expires_at: expiresAt,
      })
      .select('device_code, user_code, expires_at')
      .limit(1);
    if (!error) {
      inserted = data && data[0];
      break;
    }
    if (error.code !== '23505') {
      return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault device-code mint failed');
    }
  }
  if (!inserted) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault device-code retry exhausted');
  }

  const origin = originFromRequest(req) || '';
  res.status(201).json({
    device_code: inserted.device_code,
    user_code: inserted.user_code,
    verification_uri: `${origin}/cli-auth`,
    interval: POLL_INTERVAL_SEC,
    expires_in: DEVICE_CODE_TTL_SEC,
  });
}

/**
 * POST /api/vault/cli/device-token
 *
 * Body: { device_code }
 * Response:
 *   200 + { session_token, expires_at, user: {...} }     — approved + consumed
 *   202 + { error: "authorization-pending" }              — still waiting
 *   400 + { error: "device-code-expired" }                — TTL passed
 *   400 + { error: "device-code-invalid" }                — bad / unknown / consumed
 *
 * Public — no session required. The CLI polls this at `interval` seconds.
 */
export async function handlePollDeviceToken(req, res) {
  const body = req.body || {};
  const deviceCode = typeof body.device_code === 'string' ? body.device_code : '';
  if (deviceCode.length < 32 || deviceCode.length > 128) {
    return sendError(res, 400, ERROR_CODES.bad_request, 'device_code missing or wrong length');
  }
  let supabase;
  try {
    supabase = vaultDb();
  } catch {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault database is not configured');
  }

  const { data, error } = await supabase
    .from('vault_device_codes')
    .select('device_code_id, status, approved_by, expires_at')
    .eq('device_code', deviceCode)
    .limit(1);
  if (error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault device-code lookup failed');
  }
  const row = Array.isArray(data) && data[0];
  if (!row) {
    return sendError(res, 400, ERROR_CODES.device_code_invalid, 'device code not recognized');
  }
  if (row.status === 'consumed' || row.status === 'denied') {
    return sendError(res, 400, ERROR_CODES.device_code_invalid, 'device code already used');
  }
  const expired = new Date(row.expires_at).getTime() <= Date.now();
  if (expired || row.status === 'expired') {
    if (row.status !== 'expired') {
      await supabase
        .from('vault_device_codes')
        .update({ status: 'expired' })
        .eq('device_code_id', row.device_code_id);
    }
    return sendError(res, 400, ERROR_CODES.device_code_expired, 'device code expired');
  }
  if (row.status === 'pending') {
    return sendError(res, 202, ERROR_CODES.authorization_pending, 'authorization pending');
  }
  if (row.status !== 'approved' || !row.approved_by) {
    return sendError(res, 400, ERROR_CODES.device_code_invalid, 'device code in unexpected state');
  }

  // approved + paired with a user → mint the vault_sessions row and consume
  // the device-code row in the same flow.
  const expiresAt = new Date(Date.now() + sessionTtlSeconds() * 1000).toISOString();
  const userAgent = (req.headers && req.headers['user-agent']) || null;
  const { data: sessionRows, error: sessionError } = await supabase
    .from('vault_sessions')
    .insert({
      user_id: row.approved_by,
      expires_at: expiresAt,
      user_agent: userAgent ? String(userAgent).slice(0, 200) : null,
      ip_origin: null,
    })
    .select('session_id')
    .limit(1);
  if (sessionError) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault session mint failed');
  }
  const sessionId = sessionRows && sessionRows[0] && sessionRows[0].session_id;
  if (!sessionId) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault session mint returned no row');
  }
  await supabase
    .from('vault_device_codes')
    .update({ status: 'consumed', consumed_at: new Date().toISOString() })
    .eq('device_code_id', row.device_code_id);

  // Look up the user record for the response payload.
  const { data: userRows } = await supabase
    .from('vault_users')
    .select('user_id, github_login, display_name')
    .eq('user_id', row.approved_by)
    .limit(1);
  const user = Array.isArray(userRows) && userRows[0] ? userRows[0] : null;

  res.status(200).json({
    session_token: sessionId,
    expires_at: expiresAt,
    user: user
      ? { user_id: user.user_id, github_login: user.github_login, display_name: user.display_name || null }
      : null,
  });
}

/**
 * POST /api/vault/cli/approve
 *
 * Body: { user_code }
 * Response:
 *   200 + { approved: true, user_code }
 *   400 + { error: "device-code-invalid" }     — unknown / wrong-state user code
 *   400 + { error: "device-code-expired" }     — TTL passed
 *
 * Requires a Vault browser session (requireVaultSession + requireCsrf
 * middleware). The CLI never calls this endpoint — only the browser
 * approval surface does.
 */
export async function handleApproveDeviceCode(req, res) {
  const body = req.body || {};
  const rawCode = typeof body.user_code === 'string' ? body.user_code.trim().toUpperCase() : '';
  if (rawCode.length < 6 || rawCode.length > 32) {
    return sendError(res, 400, ERROR_CODES.bad_request, 'user_code missing or wrong length');
  }
  let supabase;
  try {
    supabase = vaultDb();
  } catch {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault database is not configured');
  }

  const { data, error } = await supabase
    .from('vault_device_codes')
    .select('device_code_id, status, expires_at')
    .eq('user_code', rawCode)
    .eq('status', 'pending')
    .limit(1);
  if (error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault device-code lookup failed');
  }
  const row = Array.isArray(data) && data[0];
  if (!row) {
    return sendError(res, 400, ERROR_CODES.device_code_invalid, 'user code not recognized');
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await supabase
      .from('vault_device_codes')
      .update({ status: 'expired' })
      .eq('device_code_id', row.device_code_id);
    return sendError(res, 400, ERROR_CODES.device_code_expired, 'user code expired');
  }

  // Race-guarded UPDATE: only flip to approved if still pending.
  const { data: updated, error: updateError } = await supabase
    .from('vault_device_codes')
    .update({
      status: 'approved',
      approved_by: req.vaultSession.user_id,
      approved_at: new Date().toISOString(),
    })
    .eq('device_code_id', row.device_code_id)
    .eq('status', 'pending')
    .select('user_code')
    .limit(1);
  if (updateError) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault device-code approve failed');
  }
  const updatedRow = Array.isArray(updated) && updated[0];
  if (!updatedRow) {
    return sendError(res, 400, ERROR_CODES.device_code_invalid, 'user code state changed concurrently');
  }

  res.status(200).json({ approved: true, user_code: updatedRow.user_code });
}
