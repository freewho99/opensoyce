// OpenSoyce Trust Vault — vault_evidence read handlers.
//
// PR-V2-C. Per PR-V1-D §2.1 (404 decision tree), §6.1 (body masking for
// members), §6.3 (X-OpenSoyce-Vault-Masked-Fields header).
//
// One v0 endpoint:
//   GET /api/vault/workspaces/:slug/evidence/:evidence_id
//
// Why no list endpoint in PR-V2-C: the sub-sketch §9 only authorizes the
// single-row evidence read (it's the target of `private-anchor` hrefs from
// Vault Timeline `references`). A list/index of evidence is a Vault
// Dashboard surface deferred to PR-V2-E.
//
// Masking contract:
//   - member sees the row WITHOUT body (field absent, never empty string)
//   - reviewer / owner sees body
//   - X-OpenSoyce-Vault-Masked-Fields: body header emitted on member reads
//
// proof_anchors is NEVER masked. Per PR-V1-D §6.4: private-anchor pointers
// are visible to all members (they prove the audit chain exists); only the
// body text is masked.

import { vaultDb } from './db.js';
import { sendError, ERROR_CODES } from './errors.js';
import { resolveWorkspaceForMember } from './rbac.js';

function shapeEvidenceRow(row, viewerRole) {
  if (!row) return null;
  const memberMasked = viewerRole === 'member';
  return {
    evidence_id: row.evidence_id,
    workspace_id: row.workspace_id,
    evidence_class: row.evidence_class,
    subject_kind: row.subject_kind || null,
    subject_name: row.subject_name || null,
    summary: row.summary,
    ...(memberMasked ? {} : { body: row.body || null }),
    proof_anchors: row.proof_anchors,
    visibility: 'private',
    redaction_state: row.redaction_state,
    created_at: row.created_at,
    created_by: row.created_by,
    redacted_at: row.redacted_at || null,
    redacted_by: row.redacted_by || null,
    hard_delete_at: row.hard_delete_at || null,
  };
}

function setEvidenceMaskedHeader(res, viewerRole) {
  if (viewerRole === 'member') {
    res.setHeader('X-OpenSoyce-Vault-Masked-Fields', 'body');
  }
}

export async function handleGetEvidence(req, res) {
  const slug = (req.params && req.params.slug) || '';
  const id = (req.params && req.params.id) || '';
  const resolved = await resolveWorkspaceForMember(req, res, slug);
  if (!resolved) return;
  const { workspace, membership } = resolved;

  const supabase = vaultDb();
  const { data, error } = await supabase
    .from('vault_evidence')
    .select('*')
    .eq('workspace_id', workspace.workspace_id)
    .eq('evidence_id', id)
    .limit(1);
  if (error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, 'Vault evidence read failed');
  }
  const row = Array.isArray(data) && data[0];
  if (!row) {
    return sendError(res, 404, ERROR_CODES.not_found, 'not found');
  }
  if (row.redaction_state === 'hard_deleted') {
    // Per PR-V1-B §4.1: hard_deleted rows are tombstones — treat as absent
    // for read API purposes. The 90-day audit reaper is responsible for
    // actually purging the row body; until then it stays for forensic
    // recovery, but the API does not surface it.
    return sendError(res, 404, ERROR_CODES.not_found, 'not found');
  }
  setEvidenceMaskedHeader(res, membership.role);
  res.status(200).json(shapeEvidenceRow(row, membership.role));
}
