// OpenSoyce CLI — Vault API client.
//
// PR-V2-D. Per PR-V1-E §1.1 (device-code), §3 (workspace flag), §4
// (exception subcommands), §5 (Vault Timeline read).
//
// Transport invariants:
//   - HTTPS only — every fetch goes through the configured apiBase.
//   - Vault session is carried in the Cookie header:
//       Cookie: opensoyce_vault_session=<token>
//     This reuses the server-side requireVaultSession middleware exactly
//     as written for browsers; no server change is needed for the CLI to
//     authenticate. The CLI does not use the word "Authorization" — its
//     auth scheme is cookie-based, not bearer.
//   - Mutating requests (POST/PATCH) also carry a freshly-generated CSRF
//     token in BOTH the cookie and the X-OpenSoyce-Vault-CSRF header.
//     The server's requireCsrf middleware checks cookie===header — the
//     CLI satisfies that with a self-minted token. (The CSRF rule was
//     written to defeat cross-site browser forgery; a CLI is not a
//     cross-site context, so a self-issued token is safe.)
//   - The session_token NEVER appears in stdout/stderr. It is read from
//     the session file by session.ts, passed into this module as a
//     parameter, and only ever travels via outbound HTTP headers.
//
// The CLI does NOT use http.request / https.request. fetch() only. This
// is enforced by scripts/test-cli-v0.mjs (preserved through the atomic
// v0-locks lift).

import crypto from 'node:crypto';
import { EXIT_NETWORK_ERROR, EXIT_USAGE_ERROR } from '../exit-codes.js';

const VAULT_SESSION_COOKIE = 'opensoyce_vault_session';
const VAULT_CSRF_COOKIE = 'opensoyce_vault_csrf';
const VAULT_CSRF_HEADER = 'X-OpenSoyce-Vault-CSRF';

export interface VaultApiSuccess<T> {
  ok: true;
  status: number;
  data: T;
}
export interface VaultApiFailure {
  ok: false;
  status: number;
  exitCode: number;
  message: string;
  errorCode?: string;
}
export type VaultApiResult<T> = VaultApiSuccess<T> | VaultApiFailure;

interface VaultRequestOptions {
  apiBase: string;
  path: string;
  method: 'GET' | 'POST' | 'PATCH';
  sessionToken?: string;
  body?: unknown;
  timeoutMs: number;
  acceptStatuses?: number[]; // statuses that map to ok=true (default [200, 201])
}

function buildCookieHeader(sessionToken: string | undefined, csrfToken: string | undefined): string | null {
  const parts: string[] = [];
  if (sessionToken) parts.push(`${VAULT_SESSION_COOKIE}=${encodeURIComponent(sessionToken)}`);
  if (csrfToken) parts.push(`${VAULT_CSRF_COOKIE}=${encodeURIComponent(csrfToken)}`);
  if (parts.length === 0) return null;
  return parts.join('; ');
}

function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function vaultRequest<T>(opts: VaultRequestOptions): Promise<VaultApiResult<T>> {
  const url = `${opts.apiBase}${opts.path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  const acceptStatuses = opts.acceptStatuses || [200, 201];

  const isMutating = opts.method === 'POST' || opts.method === 'PATCH';
  const csrfToken = isMutating ? generateCsrfToken() : undefined;
  const cookieHeader = buildCookieHeader(opts.sessionToken, csrfToken);

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookieHeader) headers.Cookie = cookieHeader;
  if (csrfToken) headers[VAULT_CSRF_HEADER] = csrfToken;

  try {
    const res = await fetch(url, {
      method: opts.method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      parsed = null;
    }
    if (acceptStatuses.indexOf(res.status) >= 0) {
      return { ok: true, status: res.status, data: parsed as T };
    }
    const body = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    const errorCode = body && typeof body.error === 'string' ? body.error : undefined;
    const message = body && typeof body.message === 'string'
      ? body.message
      : `Vault API responded ${res.status} ${res.statusText}`;
    const exitCode = res.status === 401 || res.status === 403 || res.status === 404
      ? EXIT_USAGE_ERROR
      : EXIT_NETWORK_ERROR;
    return { ok: false, status: res.status, exitCode, message, errorCode };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const aborted = msg.includes('aborted') || msg.includes('abort');
    return {
      ok: false,
      status: 0,
      exitCode: EXIT_NETWORK_ERROR,
      message: aborted ? `Network timeout after ${opts.timeoutMs}ms.` : `Network error: ${msg}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Device-code flow ----------

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  interval: number;
  expires_in: number;
}

export async function requestDeviceCode(apiBase: string, timeoutMs: number) {
  return vaultRequest<DeviceCodeResponse>({
    apiBase,
    path: '/api/vault/cli/device-code',
    method: 'POST',
    body: {},
    timeoutMs,
    acceptStatuses: [201],
  });
}

export interface DeviceTokenResponse {
  session_token: string;
  expires_at: string;
  user: { user_id: string; github_login: string; display_name: string | null } | null;
}

export async function pollDeviceToken(apiBase: string, deviceCode: string, timeoutMs: number) {
  return vaultRequest<DeviceTokenResponse>({
    apiBase,
    path: '/api/vault/cli/device-token',
    method: 'POST',
    body: { device_code: deviceCode },
    timeoutMs,
    acceptStatuses: [200], // 202 authorization-pending falls through to ok=false with errorCode
  });
}

export async function callLogout(apiBase: string, sessionToken: string, timeoutMs: number) {
  return vaultRequest<{ ok: true }>({
    apiBase,
    path: '/api/vault/auth/logout',
    method: 'POST',
    sessionToken,
    body: {},
    timeoutMs,
    acceptStatuses: [200, 204],
  });
}

// ---------- Vault Timeline reads ----------

export interface VaultTimelineEvent {
  event_id: string;
  workspace_id: string;
  event_type: string;
  subject_evidence_id?: string | null;
  subject_exception_id?: string | null;
  subject_membership_id?: string | null;
  summary: string;
  references: unknown[];
  visibility: 'private';
  emitted_at: string;
  emitted_by: { user_id: string; github_login: string; display_name: string | null } | null;
}

export interface VaultTimelineListResponse {
  events: VaultTimelineEvent[];
  next_cursor: string | null;
  total_count_estimate: number;
}

export async function listVaultTimeline(
  apiBase: string,
  sessionToken: string,
  workspace: string,
  query: Record<string, string | number | undefined>,
  timeoutMs: number,
) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  const path = `/api/vault/workspaces/${encodeURIComponent(workspace)}/timeline${qs ? `?${qs}` : ''}`;
  return vaultRequest<VaultTimelineListResponse>({
    apiBase,
    path,
    method: 'GET',
    sessionToken,
    timeoutMs,
  });
}

// ---------- Vault Exceptions ----------

export interface VaultException {
  exception_id: string;
  workspace_id: string;
  subject_kind: 'package' | 'repo';
  subject_name: string;
  state: 'proposed' | 'reviewed' | 'active' | 'rejected' | 'revoked' | 'expired';
  original_action: 'BLOCK' | 'WARN';
  allowed_action: 'WARN' | 'ALLOW';
  proposed_by: string;
  proposed_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  expires_at: string | null;
  reason_public: string | null;
  reason_private?: string | null;
  proof_anchors: unknown[];
  revoked_at: string | null;
  revoked_by: string | null;
  revoke_reason: string | null;
}

export async function listExceptions(
  apiBase: string,
  sessionToken: string,
  workspace: string,
  query: Record<string, string | number | undefined>,
  timeoutMs: number,
) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  const path = `/api/vault/workspaces/${encodeURIComponent(workspace)}/exceptions${qs ? `?${qs}` : ''}`;
  return vaultRequest<{ exceptions: VaultException[]; total_count_estimate: number; limit: number; offset: number }>({
    apiBase,
    path,
    method: 'GET',
    sessionToken,
    timeoutMs,
  });
}

export interface ProposeBody {
  subject: { kind: 'package' | 'repo'; name: string };
  original_action: 'BLOCK' | 'WARN';
  allowed_action: 'WARN' | 'ALLOW';
  reason_public: string;
  reason_private?: string;
  expires_at?: string;
  proof_anchors: unknown[];
  idempotency_key?: string;
}

export async function proposeException(
  apiBase: string,
  sessionToken: string,
  workspace: string,
  body: ProposeBody,
  timeoutMs: number,
) {
  return vaultRequest<VaultException>({
    apiBase,
    path: `/api/vault/workspaces/${encodeURIComponent(workspace)}/exceptions`,
    method: 'POST',
    sessionToken,
    body,
    timeoutMs,
    acceptStatuses: [201],
  });
}

export async function revokeException(
  apiBase: string,
  sessionToken: string,
  workspace: string,
  exceptionId: string,
  body: { revoke_reason: string; idempotency_key?: string },
  timeoutMs: number,
) {
  return vaultRequest<VaultException>({
    apiBase,
    path: `/api/vault/workspaces/${encodeURIComponent(workspace)}/exceptions/${encodeURIComponent(exceptionId)}/revoke`,
    method: 'POST',
    sessionToken,
    body,
    timeoutMs,
  });
}
