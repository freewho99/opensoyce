/**
 * OpenSoyce — shared lazy Supabase client.
 *
 * Underscore-prefixed so Vercel does NOT route it as a serverless function
 * (it's import-only) — keeps us under the 12-function Hobby cap.
 *
 * Both api/exceptions.js (PR 1, CRUD) and api/guard-webhook.js (PR 2, scan-
 * time exception lookup) import `getSupabase()` from here so a single client
 * init is shared across the two surfaces that talk to the `exceptions` table.
 *
 * Failure mode: `getSupabase()` throws `SUPABASE_ENV_MISSING` when either
 * env var is unset. Callers MUST catch this and decide whether the lookup is
 * required (CRUD: yes, return 500) or optional (webhook: no, degrade to
 * "zero exceptions" with a warning log).
 */

import { createClient } from '@supabase/supabase-js';

let supabaseClient;

export function getSupabase() {
  if (supabaseClient) return supabaseClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_ENV_MISSING');
  supabaseClient = createClient(url, key, { auth: { persistSession: false } });
  return supabaseClient;
}

// Test-only: reset the memoized client. Not exported under a normal name so
// production code doesn't accidentally lean on it.
export function __resetSupabaseClientForTests() {
  supabaseClient = undefined;
}
