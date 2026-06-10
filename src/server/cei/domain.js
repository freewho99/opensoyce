// OpenSoyce Component Exposure Intelligence (Phase 6A) — domain helpers.
//
// PR-6A. Per docs/strategy/component-exposure-intelligence-lock-in.md.
//
// Pure validation + native-type lookup. No HTTP, no response writing.
// These helpers enforce the Phase 6A invariants:
//   - native exposure types only (no custom types, no dynamic schemas)
//   - subject_kind must be one the native type accepts
//   - metadata must be a JSON object (not array, not scalar, not null)
//   - source_kind / source_ref are within the fixed allowlists
//
// DOCTRINE: an exposure records that a component EXISTS or CHANGED. It is
// not an exception, not evidence, not policy. Validation here keeps the
// exposure record honest; it never makes a trust decision.

import { vaultDb } from '../vault/db.js';

// The six native exposure types seeded by migration 0017. This list is the
// single source of truth on the application side; the structural test
// asserts it matches the migration seed exactly.
export const NATIVE_EXPOSURE_TYPES = Object.freeze([
  'dependency-exposure',
  'github-action-exposure',
  'container-image-exposure',
  'base-image-exposure',
  'dev-tool-exposure',
  'runtime-version-exposure',
]);

// Each native type accepts exactly one subject_kind. The mapping keeps the
// recorded subject coherent with the exposure class (a dependency-exposure
// is about a package; a base-image-exposure is about a base-image).
export const TYPE_SUBJECT_KINDS = Object.freeze({
  'dependency-exposure': 'package',
  'github-action-exposure': 'github-action',
  'container-image-exposure': 'container-image',
  'base-image-exposure': 'base-image',
  'dev-tool-exposure': 'dev-tool',
  'runtime-version-exposure': 'runtime',
});

export const SOURCE_KINDS = Object.freeze(['manual', 'api', 'cli', 'ci']);

export const EXPOSURE_STATUSES = Object.freeze([
  'observed',
  'review_required',
  'allowed',
  'blocked',
  'excepted',
  'resolved',
]);

/**
 * Look up a native, active exposure type by slug. Returns:
 *   { type }            on success
 *   { notFound: true }  when the slug is unknown OR the row is non-native
 *                       OR inactive (all collapse to the same outcome so
 *                       the caller renders one honest "type-not-found")
 *   { error }           on a database failure
 *
 * The is_native + is_active guard is what keeps Phase 6A native-only: even
 * if a future migration seeds a non-native row, this lookup refuses it.
 */
export async function findNativeExposureType(typeSlug) {
  if (typeof typeSlug !== 'string' || !NATIVE_EXPOSURE_TYPES.includes(typeSlug)) {
    return { notFound: true };
  }
  const supabase = vaultDb();
  const { data, error } = await supabase
    .from('component_exposure_types')
    .select('exposure_type_id, type_slug, display_name, description, is_native, is_active')
    .eq('type_slug', typeSlug)
    .limit(1);
  if (error) return { error };
  const row = Array.isArray(data) && data[0];
  if (!row || row.is_native !== true || row.is_active !== true) {
    return { notFound: true };
  }
  return { type: row };
}

/**
 * Validate the subject for a given native type slug. Returns an error
 * string, or null when valid.
 */
export function validateSubject(typeSlug, subjectKind, subjectName) {
  const expectedKind = TYPE_SUBJECT_KINDS[typeSlug];
  if (!expectedKind) return 'unknown exposure type';
  if (subjectKind !== expectedKind) {
    return `subject_kind must be "${expectedKind}" for ${typeSlug}`;
  }
  if (typeof subjectName !== 'string' || subjectName.length < 1 || subjectName.length > 400) {
    return 'subject_name must be 1-400 chars';
  }
  return null;
}

/**
 * metadata + trust_boundary must be plain JSON objects. Arrays, null, and
 * scalars are rejected. Phase 6A enforces object-ness ONLY — no per-type
 * schema validation (that is future custom-type scope).
 */
export function isJsonObject(value) {
  return (
    value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
  );
}

export function validateMetadata(metadata) {
  // Absent metadata is allowed (the column defaults to {}).
  if (metadata === undefined) return null;
  if (!isJsonObject(metadata)) return 'metadata must be a JSON object';
  return null;
}

export function validateTrustBoundary(trustBoundary) {
  if (trustBoundary === undefined) return null;
  if (!isJsonObject(trustBoundary)) return 'trust_boundary must be a JSON object';
  return null;
}

/**
 * source_kind must be one of the fixed allowlist; source_ref is optional
 * but bounded when present.
 */
export function validateSource(sourceKind, sourceRef) {
  if (!SOURCE_KINDS.includes(sourceKind)) {
    return `source_kind must be one of: ${SOURCE_KINDS.join(', ')}`;
  }
  if (sourceRef !== undefined && sourceRef !== null) {
    if (typeof sourceRef !== 'string' || sourceRef.length < 1 || sourceRef.length > 512) {
      return 'source_ref must be 1-512 chars when present';
    }
  }
  return null;
}

export function validateStatus(status) {
  if (status === undefined) return null;
  if (!EXPOSURE_STATUSES.includes(status)) {
    return `status must be one of: ${EXPOSURE_STATUSES.join(', ')}`;
  }
  return null;
}
