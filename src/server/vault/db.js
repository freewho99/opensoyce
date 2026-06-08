// OpenSoyce Trust Vault — Supabase client wrapper.
//
// PR-V2-A. Reuses the existing api/_supabase.js lazy client by re-exporting
// getSupabase(). Defensive: if the env vars are missing the existing helper
// throws SUPABASE_ENV_MISSING and Vault routes degrade to 503.

import { getSupabase } from '../../../api/_supabase.js';

export function vaultDb() {
  return getSupabase();
}
