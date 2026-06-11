#!/usr/bin/env node
/**
 * PR-16A — the exception expiry reaper.
 *
 * DOCTRINE:
 *   Temporary trust must not become permanent by neglect.
 *   Expiry is time evidence, not reviewer judgment.
 *   The reaper observes that time passed.
 *   The reaper does not decide the risk.
 *   The record remembers that review pressure became due.
 *
 * WHAT THIS COMMAND DOES, exactly:
 *   1. Finds ACTIVE exceptions whose expires_at is in the past.
 *   2. For each (with --execute): flips state active -> expired via a
 *      guarded UPDATE that touches ONLY the state column. The original
 *      reviewer, approval timestamp, expiry date, reasons, and proof
 *      anchors are preserved untouched — the original decision remains
 *      the record. The Phase 5 trigger (migration 0015) emits the
 *      'exception_expired' timeline event with a NULL actor in the SAME
 *      transaction; this command writes nothing to the timeline itself.
 *   3. Records the CEI relationship event (exception_expired_from_exposure,
 *      system actor) ONLY when the exception was originally proposed from
 *      an exposure — discovered via the 6D proposal event, never invented.
 *
 * WHAT THIS COMMAND CAN NEVER DO:
 *   - revoke, approve, reject, renew, or extend anything
 *   - mutate any exposure
 *   - create remediation questions or exception proposals
 *   - touch policy: no gate action changes anywhere
 *   An expired exception is not a revoked exception. The reviewer still
 *   decides what happens next (renewal/closeout is lane 16B).
 *
 * IDEMPOTENT BY CONSTRUCTION:
 *   - the state flip is guarded (WHERE state = 'active'): a second run
 *     finds nothing to flip;
 *   - the CEI event is unique per exception (0024 partial index): a 23505
 *     resolves to already-recorded, never a duplicate.
 *
 * SAFE BY DEFAULT: without --execute this is a READ-ONLY report of what
 * is due. Nothing transitions until a human (or an explicitly configured
 * scheduler — not part of this PR) passes --execute.
 *
 * Usage:
 *   node scripts/reap-expired-exceptions.mjs              # dry-run report
 *   node scripts/reap-expired-exceptions.mjs --execute    # perform reaping
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for the TARGET
 * environment (same contract as check-release-integrity).
 */

import dotenv from 'dotenv';
import { recordExpiredFromExposure } from '../src/server/cei/events.js';

dotenv.config();

const args = process.argv.slice(2);
const execute = args.includes('--execute');

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('reap-expired-exceptions: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — nothing reaped.');
    process.exit(2);
  }
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const nowIso = new Date().toISOString();
  console.log(`exception expiry reaper — ${execute ? 'EXECUTE' : 'dry-run (pass --execute to act)'} at ${nowIso}\n`);

  // Workspace isolation is row-level: every row carries its own
  // workspace_id, every UPDATE is keyed by exception_id, and the CEI event
  // is recorded with the exception's OWN workspace. Nothing crosses.
  const { data, error } = await supabase
    .from('vault_exceptions')
    .select('exception_id, workspace_id, subject_kind, subject_name, state, expires_at, reviewed_by, reviewed_at')
    .eq('state', 'active')
    .lt('expires_at', nowIso)
    .order('expires_at', { ascending: true })
    .limit(500);
  if (error) {
    console.error(`FAIL  due-exception query: ${error.message}`);
    process.exit(1);
  }
  const due = Array.isArray(data) ? data : [];
  if (due.length === 0) {
    console.log('No active exceptions past their expiry window. Nothing due.');
    process.exit(0);
  }

  let expired = 0;
  let eventsRecorded = 0;
  let eventsAlready = 0;
  let eventsSkipped = 0;
  let failed = 0;

  for (const row of due) {
    const label = `${row.subject_kind} ${row.subject_name} (${row.exception_id.slice(0, 8)}, scheduled ${row.expires_at})`;
    if (!execute) {
      console.log(`DUE   ${label} — review pressure; would transition active -> expired`);
      continue;
    }

    // The guarded transition: ONLY the state column moves, and only on a
    // row that is still active and still past-due. The original decision
    // (reviewed_by / reviewed_at / expires_at / reasons / anchors) is
    // preserved verbatim. The 0015 trigger emits the timeline event with a
    // NULL actor in this same transaction.
    const { data: updated, error: updateError } = await supabase
      .from('vault_exceptions')
      .update({ state: 'expired' })
      .eq('exception_id', row.exception_id)
      .eq('state', 'active')
      .lt('expires_at', nowIso)
      .select('exception_id, state')
      .limit(1);
    if (updateError) {
      failed += 1;
      console.log(`FAIL  ${label} — ${updateError.message}`);
      continue;
    }
    const flipped = Array.isArray(updated) && updated[0];
    if (!flipped) {
      // Raced by another run or a reviewer action — the guard held; the
      // record decided. Nothing to do.
      console.log(`SKIP  ${label} — no longer active+due (raced); guard held`);
      continue;
    }
    expired += 1;

    // CEI relationship audit, only where a relationship exists. Best-effort:
    // the state flip above is the trust record; this event is its echo.
    const recorded = await recordExpiredFromExposure(supabase, {
      workspaceId: row.workspace_id,
      exceptionId: row.exception_id,
      expiredAt: row.expires_at,
      observedAt: nowIso,
    });
    if (recorded.error) {
      console.log(`WARN  ${label} — expired; CEI event failed (audit echo, transition stands): ${recorded.error.message}`);
    } else if (recorded.skipped) {
      eventsSkipped += 1;
      console.log(`DONE  ${label} — expired; not exposure-born, no CEI event (timeline trigger recorded the expiry)`);
    } else if (recorded.alreadyRecorded) {
      eventsAlready += 1;
      console.log(`DONE  ${label} — expired; CEI event already recorded (idempotent)`);
    } else {
      eventsRecorded += 1;
      console.log(`DONE  ${label} — expired; CEI relationship event recorded (system actor)`);
    }
  }

  if (!execute) {
    console.log(`\n${due.length} exception${due.length === 1 ? '' : 's'} due for review. Dry-run: nothing transitioned.`);
    process.exit(0);
  }
  console.log(`\nreaped ${expired}/${due.length} — CEI events: ${eventsRecorded} recorded, ${eventsAlready} already recorded, ${eventsSkipped} not exposure-born${failed ? `, ${failed} FAILED` : ''}`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
