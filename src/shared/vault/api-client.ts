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

// PR-6C: propose a NEW exception draft (state = 'proposed'). This calls the
// existing PR-V2-B propose endpoint, which HARDCODES state: 'proposed' on
// the server — there is no way for this helper to create an active
// exception, approve one, or change the state machine. It is used by the
// "Propose exception from this exposure" action on VaultExposureDetail.
export interface ProposeExceptionBody {
  subject: { kind: 'package' | 'repo'; name: string };
  original_action: 'BLOCK' | 'WARN';
  allowed_action: 'WARN' | 'ALLOW';
  reason_public: string;
  reason_private?: string;
  proof_anchors: Array<Record<string, unknown>>;
  // PR-6D: when proposing FROM a component exposure, cite it so the server
  // records a CEI-native audit event. Optional — absent means the legacy
  // (non-CEI) propose flow.
  source_exposure_id?: string;
  idempotency_key?: string;
}

export async function proposeException(slug: string, body: ProposeExceptionBody) {
  return vaultRequest<VaultException>({
    path: `/api/vault/workspaces/${encodeURIComponent(slug)}/exceptions`,
    method: 'POST',
    body,
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

// PR-16B: expired trust reviewer resolution. Expired trust creates review
// pressure; reviewer resolution creates the next trust decision. A
// resolution is a RECORD, not a state transition — the expired state is
// time truth and never changes from this lane. 'renew' CITES a separate
// exception created through the existing propose lane (these helpers never
// create or extend trust); 'remediation_question' cites a 15B question.
export type ResolutionOutcome =
  | 'renew'
  | 'revoke'
  | 'remediation_required'
  | 'resolved_externally'
  | 'defer'
  | 'remediation_question';

export interface ExceptionResolution {
  resolution_id: string;
  workspace_id: string;
  exception_id: string;
  outcome: ResolutionOutcome;
  resolved_by: { user_id: string; github_login: string; display_name: string | null } | null;
  reason_public: string;
  reason_private: string | null;
  renewed_exception_id: string | null;
  linked_question_id: string | null;
  created_at: string;
  visibility: 'private';
}

export async function listExceptionResolutions(slug: string, exceptionId: string) {
  return vaultRequest<{ resolutions: ExceptionResolution[]; visibility: 'private' }>({
    path: `/api/vault/workspaces/${encodeURIComponent(slug)}/exceptions/${encodeURIComponent(exceptionId)}/resolutions`,
  });
}

export interface ResolveExpiredExceptionBody {
  outcome: ResolutionOutcome;
  reason_public: string;
  reason_private?: string;
  renewed_exception_id?: string;
  linked_question_id?: string;
}

export async function resolveExpiredException(slug: string, exceptionId: string, body: ResolveExpiredExceptionBody) {
  return vaultRequest<ExceptionResolution>({
    path: `/api/vault/workspaces/${encodeURIComponent(slug)}/exceptions/${encodeURIComponent(exceptionId)}/resolve`,
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

// ---------- evidence export bundle (PR-17A) ----------
//
// Read-only assembly of one component trust-decision chain from existing
// records. Export is not certification, not a decision — a faithful view
// of the record. There is exactly ONE helper and it is a GET: generating
// an export mutates nothing, so no mutating helper exists in this lane.

export interface EvidenceBundleSection {
  present: boolean;
  [key: string]: unknown;
}

export interface EvidenceBundle {
  format: 'opensoyce-evidence-bundle';
  version: number;
  generated_at: string;
  visibility: 'private';
  workspace: { slug: string; display_name: string | null };
  subject: { kind: string; name: string; observed_version: string | null };
  evidence_scope: string;
  sections: {
    observation: EvidenceBundleSection;
    vulnerability_context: EvidenceBundleSection;
    remediation_questions: EvidenceBundleSection;
    exceptions: EvidenceBundleSection;
    expiry_pressure: EvidenceBundleSection;
    resolutions: EvidenceBundleSection;
    receipts: EvidenceBundleSection;
  };
  honest_edges: { proves: string[]; does_not_prove: string[]; missing: string[] };
}

export interface EvidenceExportResponse {
  bundle: EvidenceBundle;
  markdown: string;
  visibility: 'private';
}

export async function getEvidenceExport(slug: string, exposureId: string) {
  return vaultRequest<EvidenceExportResponse>({
    path: `/api/vault/workspaces/${encodeURIComponent(slug)}/exposures/${encodeURIComponent(exposureId)}/evidence-export`,
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

// ---------- Component Exposure Intelligence reads (PR-6B) ----------
//
// Read-only consumption of the PR-6A private exposure foundation. The
// Vault Dashboard's CEI surface uses ONLY these GET helpers — there is no
// create/update/delete exposure helper here, and no exposure-to-exception
// linkage. An exposure is a private workspace observation, not a trust
// decision.

export type ExposureStatus =
  | 'observed'
  | 'review_required'
  | 'allowed'
  | 'blocked'
  | 'excepted'
  | 'resolved';

export interface ComponentExposure {
  exposure_id: string;
  workspace_id: string;
  exposure_type: string | null;
  subject_kind: string;
  subject_name: string;
  trust_boundary: Record<string, unknown>;
  metadata: Record<string, unknown>;
  source_kind: string;
  source_ref: string | null;
  status: ExposureStatus;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
  visibility: 'private';
}

export interface ComponentExposureListResponse {
  exposures: ComponentExposure[];
  total_count_estimate: number;
  limit: number;
  offset: number;
  visibility: 'private';
}

export async function listExposures(
  slug: string,
  query?: { status?: string; limit?: number; offset?: number },
) {
  const params = new URLSearchParams();
  if (query?.status) params.set('status', query.status);
  if (typeof query?.limit === 'number') params.set('limit', String(query.limit));
  if (typeof query?.offset === 'number') params.set('offset', String(query.offset));
  const qs = params.toString();
  return vaultRequest<ComponentExposureListResponse>({
    path: `/api/vault/workspaces/${encodeURIComponent(slug)}/exposures${qs ? `?${qs}` : ''}`,
  });
}

export async function getExposure(slug: string, id: string) {
  return vaultRequest<ComponentExposure>({
    path: `/api/vault/workspaces/${encodeURIComponent(slug)}/exposures/${encodeURIComponent(id)}`,
  });
}

// PR-6D: CEI-native proposal-history for one exposure (read-only).
// PR-6F widens the kind union with the reviewer outcomes. PR-16A adds the
// expired kind the 6F note deferred to the reaper scope block — a SYSTEM
// observation (actor is null on those events): time passed; review became
// due; nothing was decided.
export type ExposureEventKind =
  | 'exception_proposed_from_exposure'
  | 'exception_approved_from_exposure'
  | 'exception_rejected_from_exposure'
  | 'exception_revoked_from_exposure'
  | 'exception_expired_from_exposure';
export interface ExposureEventActor {
  user_id: string;
  github_login: string;
  display_name: string | null;
}
export interface ComponentExposureEvent {
  event_id: string;
  workspace_id: string;
  exposure_id: string;
  event_kind: ExposureEventKind;
  related_exception_id: string | null;
  actor: ExposureEventActor | null;
  metadata: Record<string, unknown>;
  created_at: string;
  visibility: 'private';
}

export async function listExposureEvents(slug: string, exposureId: string) {
  return vaultRequest<{ events: ComponentExposureEvent[]; visibility: 'private' }>({
    path: `/api/vault/workspaces/${encodeURIComponent(slug)}/exposures/${encodeURIComponent(exposureId)}/events`,
  });
}

// PR-15A: vulnerability-intelligence context attached to a dependency
// exposure. Intelligence is observation, not judgment — it opens a review
// question; it never decides the answer, never mutates the exposure, and
// never creates exceptions/proposals/outcomes.
export interface ExposureVulnIntel {
  vuln_intel_id: string;
  exposure_id: string;
  vuln_id: string;
  source: string;
  match_basis: string;
  package_name: string;
  observed_version: string;
  ecosystem: string | null;
  severity: string | null;
  affected_range: string | null;
  source_ref: string | null;
  metadata: Record<string, unknown>;
  first_seen_at: string;
  last_seen_at: string;
  seen_count: number;
  visibility: 'private';
}

export async function listExposureVulnIntel(slug: string, exposureId: string) {
  return vaultRequest<{ intel: ExposureVulnIntel[]; visibility: 'private' }>({
    path: `/api/vault/workspaces/${encodeURIComponent(slug)}/exposures/${encodeURIComponent(exposureId)}/vuln-intel`,
  });
}

export async function refreshExposureVulnIntel(slug: string, exposureId: string) {
  return vaultRequest<{
    intel: ExposureVulnIntel[];
    created: number;
    seen_again: number;
    total_reported_by_source: number;
    truncated: boolean;
    visibility: 'private';
  }>({
    path: `/api/vault/workspaces/${encodeURIComponent(slug)}/exposures/${encodeURIComponent(exposureId)}/vuln-intel/refresh`,
    method: 'POST',
    body: {},
  });
}

// PR-15B: the Remediation Question Loop. A remediation question turns an
// observed component risk (a dependency exposure, optionally with attached
// vulnerability intelligence) into a reviewable operational question. The
// system asks; the HUMAN decides; the record remembers. Opening a question
// changes nothing else (no exposure status, no exception, no proposal);
// answering records a direction, never a state transition. When the human
// selects 'propose_exception', the actual proposal still travels the
// existing Phase 5 exception lane (proposeException above) — these helpers
// never touch /exceptions.
export type RemediationQuestionKind = 'vulnerability_review' | 'component_risk_review';
export type RemediationQuestionStatus = 'open' | 'answered' | 'cancelled';
export type RemediationOutcome =
  | 'fix_required'
  | 'defer'
  | 'propose_exception'
  | 'not_applicable'
  | 'needs_owner_review'
  | 'replace_or_remove';

export interface RemediationQuestionUser {
  user_id: string;
  github_login: string;
  display_name: string | null;
}

export interface RemediationQuestionSourceExposure {
  exposure_id: string;
  exposure_type: string | null;
  subject_kind: string;
  subject_name: string;
  source_kind: string;
  source_ref: string | null;
  status: ExposureStatus;
}

export interface RemediationQuestionSourceVulnIntel {
  vuln_intel_id: string;
  vuln_id: string;
  source: string;
  match_basis: string;
  severity: string | null;
  affected_range: string | null;
  source_ref: string | null;
  metadata: Record<string, unknown>;
}

export interface RemediationQuestion {
  question_id: string;
  workspace_id: string;
  source_exposure_id: string;
  source_vuln_intel_id: string | null;
  package_name: string;
  observed_version: string | null;
  vuln_id: string | null;
  question_kind: RemediationQuestionKind;
  status: RemediationQuestionStatus;
  selected_outcome: RemediationOutcome | null;
  created_by: RemediationQuestionUser | null;
  answered_by: RemediationQuestionUser | null;
  reason_public: string | null;
  reason_private: string | null;
  due_at: string | null;
  created_at: string;
  updated_at: string;
  answered_at: string | null;
  // Present on the detail read only (read-only embedded context).
  source_exposure?: RemediationQuestionSourceExposure | null;
  source_vuln_intel?: RemediationQuestionSourceVulnIntel | null;
  visibility: 'private';
}

export interface RemediationQuestionListResponse {
  questions: RemediationQuestion[];
  total_count_estimate: number;
  limit: number;
  offset: number;
  visibility: 'private';
}

export async function listRemediationQuestions(
  slug: string,
  query?: { status?: RemediationQuestionStatus; source_exposure_id?: string; limit?: number; offset?: number },
) {
  const params = new URLSearchParams();
  if (query?.status) params.set('status', query.status);
  if (query?.source_exposure_id) params.set('source_exposure_id', query.source_exposure_id);
  if (typeof query?.limit === 'number') params.set('limit', String(query.limit));
  if (typeof query?.offset === 'number') params.set('offset', String(query.offset));
  const qs = params.toString();
  return vaultRequest<RemediationQuestionListResponse>({
    path: `/api/vault/workspaces/${encodeURIComponent(slug)}/remediation-questions${qs ? `?${qs}` : ''}`,
  });
}

export async function getRemediationQuestion(slug: string, id: string) {
  return vaultRequest<RemediationQuestion>({
    path: `/api/vault/workspaces/${encodeURIComponent(slug)}/remediation-questions/${encodeURIComponent(id)}`,
  });
}

export interface OpenRemediationQuestionBody {
  source_exposure_id: string;
  source_vuln_intel_id?: string;
  due_at?: string;
}

export async function openRemediationQuestion(slug: string, body: OpenRemediationQuestionBody) {
  return vaultRequest<RemediationQuestion>({
    path: `/api/vault/workspaces/${encodeURIComponent(slug)}/remediation-questions`,
    method: 'POST',
    body,
  });
}

export interface AnswerRemediationQuestionBody {
  selected_outcome: RemediationOutcome;
  reason_public?: string;
  reason_private?: string;
}

export async function answerRemediationQuestion(slug: string, id: string, body: AnswerRemediationQuestionBody) {
  return vaultRequest<RemediationQuestion>({
    path: `/api/vault/workspaces/${encodeURIComponent(slug)}/remediation-questions/${encodeURIComponent(id)}/answer`,
    method: 'POST',
    body,
  });
}

// PR-6E: reviewer-side source-exposure context. Given a proposed exception,
// list the CEI events that relate to it — each embeds the SOURCE exposure
// (read-only). The exception review page uses this to show "this exception
// came from this exposure".
export interface SourceExposureContext {
  exposure_id: string;
  exposure_type: string | null;
  subject_kind: string;
  subject_name: string;
  source_kind: string;
  source_ref: string | null;
  status: ExposureStatus;
}
export interface ExceptionSourceEvent {
  event_id: string;
  workspace_id: string;
  exposure_id: string;
  event_kind: ExposureEventKind;
  related_exception_id: string | null;
  actor: ExposureEventActor | null;
  source_exposure: SourceExposureContext | null;
  created_at: string;
  visibility: 'private';
}

export async function listExceptionSourceEvents(slug: string, exceptionId: string) {
  const params = new URLSearchParams({ related_exception_id: exceptionId });
  return vaultRequest<{ events: ExceptionSourceEvent[]; visibility: 'private' }>({
    path: `/api/vault/workspaces/${encodeURIComponent(slug)}/exposure-events?${params.toString()}`,
  });
}
