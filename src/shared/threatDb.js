import { getSupabase } from '../../api/_supabase.js';

/**
 * Queries the `threat_feed` table in Supabase for a batch of package names/versions.
 * Returns a Map of key `packageName@version` to threat objects.
 * Failing open if Supabase is unavailable.
 *
 * @param {Array<{name: string, version: string}>} packages
 * @param {'npm'|'PyPI'} ecosystem
 * @returns {Promise<Map<string, {package_name: string, version: string, ecosystem: string, threat_type: string, evidence: any, verdict: string}>>}
 */
export async function checkThreats(packages, ecosystem = 'npm') {
  const threatMap = new Map();
  if (!Array.isArray(packages) || packages.length === 0) return threatMap;

  let supabase;
  try {
    supabase = getSupabase();
  } catch (err) {
    // Fail-open: if Supabase config is missing, return empty threat map
    return threatMap;
  }

  try {
    const CHUNK_SIZE = 50;
    for (let i = 0; i < packages.length; i += CHUNK_SIZE) {
      const chunk = packages.slice(i, i + CHUNK_SIZE);
      const orFilter = chunk.map(p => `and(package_name.eq."${p.name}",version.eq."${p.version}")`).join(',');

      const { data, error } = await supabase
        .from('threat_feed')
        .select('*')
        .eq('ecosystem', ecosystem)
        .or(orFilter);

      if (error) {
        console.error('Failed to query threat_feed:', error);
        continue;
      }

      if (Array.isArray(data)) {
        for (const row of data) {
          const key = `${row.package_name}@${row.version}`;
          threatMap.set(key, row);
        }
      }
    }
  } catch (err) {
    console.error('Error checking threats:', err);
  }

  return threatMap;
}

/**
 * Inserts or updates a threat record in the `threat_feed` table.
 */
export async function reportThreat(threatRecord) {
  let supabase;
  try {
    supabase = getSupabase();
  } catch (err) {
    throw new Error('Supabase client not initialized: ' + err.message);
  }

  const { error } = await supabase
    .from('threat_feed')
    .upsert({
      package_name: threatRecord.package_name,
      version: threatRecord.version,
      ecosystem: threatRecord.ecosystem,
      threat_type: threatRecord.threat_type,
      evidence: threatRecord.evidence,
      verdict: threatRecord.verdict || 'flagged',
      resolved_at: threatRecord.resolved_at || null
    }, {
      onConflict: 'package_name,version,ecosystem'
    });

  if (error) {
    throw new Error(`Failed to report threat: ${error.message}`);
  }
}
