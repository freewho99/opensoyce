// OpenSoyce Trust Vault (PR-17C) — the stable Trust Record read API.
//
// DOCTRINE: the API exposes records; it does not create new trust
// conclusions. Existing evidence builders remain the source of exported
// truth. Make the record portable, not more opinionated.
//
// Structurally enforced: this module performs READS ONLY and never
// builds chain data itself — every chain comes from the SAME
// loadEvidenceBundleForExposure / composeEvidencePacket paths the 17A
// export and 17B packet use. The API adds shapes and bounds, never
// facts. Honest non-claims travel in every export-like response.
//
// Auth: requireVaultReader (session OR read-only API token) at the route
// layer; resolveWorkspaceForReader here (404-on-non-member for sessions,
// 404-on-wrong-workspace for tokens — indistinguishable by design).

import { vaultDb } from './db.js';
import { sendError, ERROR_CODES } from './errors.js';
import { resolveWorkspaceForReader } from './reader-auth.js';
import {
  loadEvidenceBundleForExposure,
  renderEvidenceBundleMarkdown,
  BUNDLE_DOES_NOT_PROVE,
} from './evidence-export.js';
import {
  composeEvidencePacket,
  parsePacketSelection,
  summarizeChainBundle,
  PACKET_NON_CLAIMS,
} from './evidence-rollup.js';

/**
 * GET /api/vault/workspaces/:slug/trust-records
 *
 * Bounded list of component trust chains: decision-bearing chains first
 * (as summaries with state, ids, and provenance pointers), observation-
 * only exposures as compact records. Built on the SAME selection +
 * composition path as the evidence packet; this endpoint returns the
 * summaries without the full embedded bundles. Capped results say so.
 */
export async function handleListTrustRecords(req, res) {
  const slug = (req.params && req.params.slug) || '';
  const resolved = await resolveWorkspaceForReader(req, res, slug);
  if (!resolved) return;
  const { workspace } = resolved;

  const selection = parsePacketSelection(req, res);
  if (!selection) return;

  const supabase = vaultDb();
  const result = await composeEvidencePacket(supabase, workspace, slug, {
    ...selection,
    generatedAt: new Date().toISOString(),
  });
  if (result.error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, result.error);
  }
  if (result.notFound) {
    return sendError(res, 404, ERROR_CODES.not_found, 'not found');
  }
  const packet = result.packet;
  res.status(200).json({
    trust_records: packet.chains.map((c) => c.summary),
    observation_inventory: packet.observation_inventory,
    state_rollup: packet.state_rollup,
    selection: packet.selection,
    generated_at: packet.generated_at,
    // Caps and truncation are disclosed, never silent.
    limitations: packet.honest_edges.limitations,
    chains_not_included: packet.honest_edges.chains_not_included,
    non_claims: [...PACKET_NON_CLAIMS],
    visibility: 'private',
  });
}

/**
 * GET /api/vault/workspaces/:slug/trust-records/:exposureId
 *
 * One chain-level trust record, aligned with the single-chain evidence
 * export model: the chain summary (state + ids) plus the full bundle
 * (record ids, source provenance, honest edges).
 */
export async function handleGetTrustRecord(req, res) {
  const slug = (req.params && req.params.slug) || '';
  const exposureId = (req.params && req.params.id) || '';
  const resolved = await resolveWorkspaceForReader(req, res, slug);
  if (!resolved) return;
  const { workspace } = resolved;

  const supabase = vaultDb();
  const result = await loadEvidenceBundleForExposure(
    supabase, workspace, slug, exposureId, new Date().toISOString(),
  );
  if (result.error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, result.error);
  }
  if (result.notFound) {
    return sendError(res, 404, ERROR_CODES.not_found, 'not found');
  }
  res.status(200).json({
    trust_record: summarizeChainBundle(result.bundle),
    bundle: result.bundle,
    non_claims: [...BUNDLE_DOES_NOT_PROVE],
    visibility: 'private',
  });
}

/**
 * GET /api/vault/workspaces/:slug/evidence-bundles/:exposureId
 *
 * The single-chain evidence bundle through the stable API: JSON bundle +
 * Markdown rendering, identical content to the 17A export route, now
 * reachable by read-only API tokens as well as sessions.
 */
export async function handleGetEvidenceBundleStable(req, res) {
  const slug = (req.params && req.params.slug) || '';
  const exposureId = (req.params && req.params.id) || '';
  const resolved = await resolveWorkspaceForReader(req, res, slug);
  if (!resolved) return;
  const { workspace } = resolved;

  const supabase = vaultDb();
  const result = await loadEvidenceBundleForExposure(
    supabase, workspace, slug, exposureId, new Date().toISOString(),
  );
  if (result.error) {
    return sendError(res, 503, ERROR_CODES.vault_db_unavailable, result.error);
  }
  if (result.notFound) {
    return sendError(res, 404, ERROR_CODES.not_found, 'not found');
  }
  res.status(200).json({
    bundle: result.bundle,
    markdown: renderEvidenceBundleMarkdown(result.bundle),
    visibility: 'private',
  });
}
