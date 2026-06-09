// OpenSoyce Trust Vault — browser API client.
//
// PR-V2-E. Per PR-V1-A §2.1 + PR-V1-C §5 (CSRF) + PR-V1-D §3.4 (cursor).
//
// Transport model:
//   - The Vault session cookie (opensoyce_vault_session) is HttpOnly so JS
//     cannot read it; the browser attaches it automatically via
//     credentials: 'include'.
//   - The CSRF cookie (opensoyce_vault_csrf) is NOT HttpOnly so JS reads
//     it from document.cookie and echoes the value into the
//     X-OpenSoyce-Vault-CSRF header. The server's requireCsrf middleware
//     compares the two and passes when they match.
//
// IMPORTANT: this module lives under src/shared/vault/ — which is the
// vault-allowed import root. Public-spine source MUST NOT import from
// this path; the PR-V2-C structural test enforces the boundary, with the
// PR-V2-E atomic extension permitting src/pages/vault/ and
// src/components/VaultLayout to import it.

const CSRF_COOKIE_NAME = 'opensoyce_vault_csrf';
const CSRF_HEADER_NAME = 'X-OpenSoyce-Vault-CSRF';

export interface VaultUser {
  user_id: string;
  github_login: string;
  display_name?: string | null;
}

export interface VaultWorkspaceSummary {
  workspace_id: string;
  slug: string;
  display_name: string;
  created_at: string;
  role: 'owner' | 'reviewer' | 'member';
}

export interface VaultMeResponse {
  user: VaultUser;
  workspaces: VaultWorkspaceSummary[];
}

export interface VaultWorkspaceDetail {
  workspace_id: string;
  slug: string;
  display_name: string;
  created_at: string;
  membership: { role: 'owner' | 'reviewer' | 'member'; added_at: string };
  members: Array<{ role: string; added_at: string; github_login: string }>;
}

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
  proof_anchors: Array<Record<string, unknown>>;
  revoked_at: string | null;
  revoked_by: string | null;
  revoke_reason: string | null;
}

export interface VaultExceptionListResponse {
  exceptions: VaultException[];
  total_count_estimate: number;
  limit: number;
  offset: number;
}

export interface VaultTimelineEvent {
  event_id: string;
  workspace_id: string;
  event_type: string;
  subject_evidence_id?: string | null;
  subject_exception_id?: string | null;
  subject_membership_id?: string | null;
  summary: string;
  references: Array<Record<string, unknown>>;
  visibility: 'private';
  emitted_at: string;
  emitted_by: { user_id: string; github_login: string; display_name: string | null } | null;
}

export interface VaultTimelineListResponse {
  events: VaultTimelineEvent[];
  next_cursor: string | null;
  total_count_estimate: number;
}

export interface VaultEvidence {
  evidence_id: string;
  workspace_id: string;
  evidence_class: string;
  subject_kind: string | null;
  subject_name: string | null;
  summary: string;
  body?: string | null;
  proof_anchors: Array<Record<string, unknown>>;
  visibility: 'private';
  redaction_state: 'visible' | 'redacted' | 'hard_deleted';
  created_at: string;
  created_by: VaultUser | null;
  redacted_at: string | null;
  redacted_by: VaultUser | null;
  hard_delete_at: string | null;
}

export interface VaultApiSuccess<T> {
  ok: true;
  status: number;
  data: T;
  maskedFields: string[];
}
export interface VaultApiFailure {
  ok: false;
  status: number;
  errorCode?: string;
  message: string;
}
export type VaultApiResult<T> = VaultApiSuccess<T> | VaultApiFailure;

// Type guard for narrowing. `if (isOk(res))` reliably narrows `res` to
// VaultApiSuccess<T>; using `if (res.ok)` directly trips a TypeScript
// narrowing edge case when the discriminant comes through a generic.
export function isOk<T>(r: VaultApiResult<T>): r is VaultApiSuccess<T> {
  return r.ok === true;
}

function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const cookies = document.cookie.split(';');
  for (const raw of cookies) {
    const pair = raw.trim();
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    if (pair.slice(0, eq) === CSRF_COOKIE_NAME) {
      return decodeURIComponent(pair.slice(eq + 1));
    }
  }
  return null;
}

interface VaultRequestOptions {
  path: string;
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
}

async function vaultRequest<T>(opts: VaultRequestOptions): Promise<VaultApiResult<T>> {
  const method = opts.method || 'GET';
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method === 'POST' || method === 'PATCH') {
    const csrf = readCsrfCookie();
    if (csrf) headers[CSRF_HEADER_NAME] = csrf;
  }

  let res: Response;
  try {
    res = await fetch(opts.path, {
      method,
      headers,
      credentials: 'include',
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  const masked = res.headers.get('X-OpenSoyce-Vault-Masked-Fields');
  const maskedFields = masked ? masked.split(',').map((s) => s.trim()).filter(Boolean) : [];

  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }

  if (res.status >= 200 && res.status < 300) {
    return { ok: true, status: res.status, data: parsed as T, maskedFields };
  }
  const body = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  const errorCode = body && typeof body.error === 'string' ? body.error : undefined;
  const message = body && typeof body.message === 'string'
    ? body.message
    : `Vault API responded ${res.status}`;
  return { ok: false, status: res.status, errorCode, message };
}

// ---------- /api/vault/me ----------

export async function fetchVaultMe() {
  return vaultRequest<VaultMeResponse>({ path: '/api/vault/me' });
}

export async function logoutVault() {
  return vaultRequest<{ ok: boolean }>({ path: '/api/vault/auth/logout', method: 'POST', body: {} });
}

// ---------- workspace ----------

export async function fetchWorkspace(slug: string) {
  return vaultRequest<VaultWorkspaceDetail>({ path: `/api/vault/workspaces/${encodeURIComponent(slug)}` });
}

// ---------- exceptions ----------

export async function listExceptions(slug: string, query?: { state?: string; limit?: number; offset?: number }) {
  const params = new URLSearchParams();
  if (query?.state) params.set('state', query.state);
  if (typeof query?.limit === 'number') params.set('limit', String(query.limit));
  if (typeof query?.offset === 'number') params.set('offset', String(query.offset));
  const qs = params.toString();
  return vaultRequest<VaultExceptionListResponse>({
    path: `/api/vault/workspaces/${encodeURIComponent(slug)}/exceptions${qs ? `?${qs}` : ''}`,
  });
}

export async function getException(slug: string, id: string) {
  return vaultRequest<VaultException>({
    path: `/api/vault/workspaces/${encodeURIComponent(slug)}/exceptions/${encodeURIComponent(id)}`,
  });
}

export async function approveException(slug: string, id: string, body: { expires_at?: string; idempotency_key?: string }) {
  return vaultRequest<VaultException>({
    path: `/api/vault/workspaces/${encodeURIComponent(slug)}/exceptions/${encodeURIComponent(id)}/approve`,
    method: 'POST',
    body,
  });
}

export async function rejectException(slug: string, id: string, body: { reason: string; idempotency_key?: string }) {
  return vaultRequest<VaultException>({
    path: `/api/vault/workspaces/${encodeURIComponent(slug)}/exceptions/${encodeURIComponent(id)}/reject`,
    method: 'POST',
    body,
  });
}

export async function extendException(slug: string, id: string, body: { expires_at: string; idempotency_key?: string }) {
  return vaultRequest<VaultException>({
    path: `/api/vault/workspaces/${encodeURIComponent(slug)}/exceptions/${encodeURIComponent(id)}/extend`,
    method: 'POST',
    body,
  });
}

export async function revokeExceptionApi(slug: string, id: string, body: { revoke_reason: string; idempotency_key?: string }) {
  return vaultRequest<VaultException>({
    path: `/api/vault/workspaces/${encodeURIComponent(slug)}/exceptions/${encodeURIComponent(id)}/revoke`,
    method: 'POST',
    body,
  });
}

// ---------- timeline ----------

export async function listTimeline(slug: string, query?: { limit?: number; cursor?: string }) {
  const params = new URLSearchParams();
  if (typeof query?.limit === 'number') params.set('limit', String(query.limit));
  if (query?.cursor) params.set('cursor', query.cursor);
  const qs = params.toString();
  return vaultRequest<VaultTimelineListResponse>({
    path: `/api/vault/workspaces/${encodeURIComponent(slug)}/timeline${qs ? `?${qs}` : ''}`,
  });
}

// ---------- evidence ----------

export async function getEvidence(slug: string, id: string) {
  return vaultRequest<VaultEvidence>({
    path: `/api/vault/workspaces/${encodeURIComponent(slug)}/evidence/${encodeURIComponent(id)}`,
  });
}

// ---------- CLI device-code approval ----------

export async function approveCliCode(userCode: string) {
  return vaultRequest<{ approved: boolean; user_code: string }>({
    path: '/api/vault/cli/approve',
    method: 'POST',
    body: { user_code: userCode },
  });
}
