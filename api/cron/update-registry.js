/**
 * Package Registry Snapshot Updater — Vercel cron tick.
 *
 * GET /api/cron/update-registry
 * Authorization: Bearer ${CRON_SECRET}
 */

import { getSupabase } from '../_supabase.js';
import { npmHighImpact } from 'npm-high-impact';
import { resolveDepIdentity } from '../../src/shared/resolveDepIdentity.js';
import { analyzeRepo, githubHeaders } from '../../src/shared/analyzeRepo.js';

const BATCH_SIZE = 50;

function getStatus(lastCommitIso) {
  if (!lastCommitIso) return 'STALE';
  const ageMs = Date.now() - Date.parse(lastCommitIso);
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  if (ageDays <= 90) return 'FRESH';
  if (ageDays <= 180) return 'AGING';
  return 'STALE';
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('update-registry: CRON_SECRET missing');
    return res.status(500).json({ error: 'CRON_NOT_CONFIGURED' });
  }
  const auth = req.headers && req.headers.authorization;
  if (auth !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  let sb;
  try {
    sb = getSupabase();
  } catch (e) {
    console.error('update-registry: supabase init failed', e.message);
    return res.status(500).json({ error: 'DB_NOT_CONFIGURED' });
  }

  // 1. Self-seeding check: ensure top 1000 packages exist in the database.
  try {
    const { count, error: countErr } = await sb
      .from('package_registry')
      .select('*', { count: 'exact', head: true });

    if (countErr) throw countErr;

    if (count < 1000) {
      console.log(`Self-seeding: current count ${count} is less than 1000. Populating...`);
      const top1k = npmHighImpact.slice(0, 1000);
      const insertRows = top1k.map(name => ({
        package_name: name.toLowerCase(),
        ecosystem: 'npm',
        score: 8.0,
        license: 'MIT',
        verdict: 'stable',
        status: 'FRESH',
        updated_at: '1970-01-01T00:00:00Z' // Force scan on next tick
      }));

      // Upsert packages (conflict do nothing)
      const { error: upsertErr } = await sb
        .from('package_registry')
        .upsert(insertRows, { onConflict: 'package_name,ecosystem', ignoreDuplicates: true });

      if (upsertErr) throw upsertErr;
      console.log('Self-seeding completed successfully.');
    }
  } catch (err) {
    console.error('update-registry: self-seeding failed', err.message);
    return res.status(502).json({ error: 'SEEDING_FAILED', message: err.message });
  }

  // 2. Query batch of oldest updated packages
  let batch;
  try {
    const { data, error: batchErr } = await sb
      .from('package_registry')
      .select('package_name')
      .order('updated_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (batchErr) throw batchErr;
    batch = data || [];
  } catch (err) {
    console.error('update-registry: querying batch failed', err.message);
    return res.status(502).json({ error: 'BATCH_QUERY_FAILED', message: err.message });
  }

  if (batch.length === 0) {
    return res.status(200).json({ ok: true, message: 'No packages found to scan' });
  }

  const githubToken = process.env.GITHUB_TOKEN || '';
  const headers = githubHeaders(githubToken);
  const updatedCount = { success: 0, failed: 0, nonGithub: 0 };
  const details = [];

  // 3. Process each package in the batch sequentially to stay within rate limits and execution budgets
  for (const item of batch) {
    const pkgName = item.package_name;
    try {
      const identity = await resolveDepIdentity(pkgName);
      if (identity && identity.resolvedRepo) {
        const [owner, repo] = identity.resolvedRepo.split('/');
        const result = await analyzeRepo(owner, repo, headers);
        if (result) {
          const { error: updateErr } = await sb
            .from('package_registry')
            .update({
              score: result.total,
              license: result.meta?.license || 'MIT',
              verdict: result.verdict.toLowerCase(),
              status: getStatus(result.meta?.lastCommit),
              critical: !!(result.meta?.advisories?.critical > 0 || result.extensionExploitRisk?.status === 'HIJACK RISK'),
              description: result.repo?.description || null,
              updated_at: new Date().toISOString()
            })
            .eq('package_name', pkgName)
            .eq('ecosystem', 'npm');

          if (updateErr) throw updateErr;

          updatedCount.success += 1;
          details.push({ package: pkgName, status: 'updated', score: result.total });
        } else {
          // Repo 404/not found — update timestamp so we don't try again immediately
          await sb
            .from('package_registry')
            .update({ updated_at: new Date().toISOString() })
            .eq('package_name', pkgName)
            .eq('ecosystem', 'npm');

          updatedCount.failed += 1;
          details.push({ package: pkgName, status: 'failed_repo_missing' });
        }
      } else {
        // No GitHub repo associated — update timestamp to push to back of queue
        await sb
          .from('package_registry')
          .update({ updated_at: new Date().toISOString() })
          .eq('package_name', pkgName)
          .eq('ecosystem', 'npm');

        updatedCount.nonGithub += 1;
        details.push({ package: pkgName, status: 'non_github' });
      }
    } catch (e) {
      console.warn(`update-registry: failed to update package ${pkgName}:`, e.message);
      updatedCount.failed += 1;
      details.push({ package: pkgName, status: 'error', error: e.message });
    }
  }

  return res.status(200).json({
    ok: true,
    scanned: batch.length,
    results: updatedCount,
    details
  });
}
