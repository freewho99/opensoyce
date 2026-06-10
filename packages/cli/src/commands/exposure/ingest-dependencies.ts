// `opensoyce exposure ingest-dependencies --workspace <slug> --file <path> [--dry-run]`
//
// PR-7A: the first ingestion lane. Boring and narrow on purpose:
// dependency-exposure records from package metadata. Parses one input file
// (package.json | package-lock.json | explicit JSON) and creates one
// EXPOSURE RECORD per name@version via the EXISTING PR-6A create API.
//
// DOCTRINE (PR-7A):
//   Ingestion observes.
//   Ingestion does not decide.
//   Ingestion creates exposure records.
//   Humans still propose.
//   Reviewers still decide.
//   CEI still records the relationship.
//
// Structurally enforced: this command creates exposures ONLY. No exception
// proposal, no decision verbs, no policy evaluation, no status mutation
// (the server defaults every created record to 'observed'), no custom
// types, no scanning.

import fs from 'node:fs';
import path from 'node:path';
import type { ParsedArgs } from '../../args.js';
import { EXIT_ALLOW, EXIT_USAGE_ERROR } from '../../exit-codes.js';
import { loadSession } from '../../lib/session.js';
import {
  listExposures,
  createExposure,
  type ComponentExposure,
  type CreateExposureBody,
} from '../../lib/vault-api.js';
import { parseDependencyFile, type DependencyEntry, type ManifestKind } from '../../lib/dependency-ingest.js';

// Dedupe scan paging (same shape as the exception-list subject scan).
const EXPOSURE_SCAN_PAGE_SIZE = 200;
const MAX_SCAN_RECORDS = 5000;
const MAX_SOURCE_REF_LEN = 512;

// PR-7B CI attribution. Attribution only: --ci flips source_kind to 'ci'
// and records WHERE the observation ran. It changes nothing about WHAT is
// recorded (still dependency-exposure / package) and adds no verbs.
const CI_PROVIDER_RE = /^[a-z0-9][a-z0-9-]*$/;
const CI_REPO_RE = /^[\w.-]+\/[\w.-]+$/;

interface CiAttribution {
  provider: string;
  repository: string;
  runId: string;
  job?: string;
  sha?: string;
  ref?: string;
}

// CI source_ref: a provider/repo/run/job/sha summary. Run-specific BY
// DESIGN — a retry of the same run dedupes; a new run is a new
// observation. Aggregating repeat observations (last_seen_at upsert)
// is the deferred server-side dedupe lane.
function ciSourceRef(ci: CiAttribution): string {
  let ref = `${ci.provider}/${ci.repository}/run/${ci.runId}`;
  if (ci.job) ref += `/job/${ci.job}`;
  if (ci.sha) ref += `/sha/${ci.sha}`;
  return ref;
}

function dedupeKey(name: string, version: string, sourceRef: string): string {
  return `${name}|${version}|${sourceRef}`;
}

function existingKey(row: ComponentExposure): string | null {
  if (row.exposure_type !== 'dependency-exposure') return null;
  const version = typeof row.metadata?.['version'] === 'string' ? (row.metadata['version'] as string) : '';
  return dedupeKey(row.subject_name, version, row.source_ref || '');
}

function buildBody(
  entry: DependencyEntry,
  sourceRef: string,
  manifestKind: ManifestKind,
  ci: CiAttribution | null,
): CreateExposureBody {
  return {
    exposure_type: 'dependency-exposure',
    subject_kind: 'package',
    subject_name: entry.name,
    source_kind: ci ? 'ci' : 'cli',
    source_ref: sourceRef,
    metadata: {
      package: entry.name,
      version: entry.version,
      dev: entry.dev,
      dependency_class: entry.dev ? 'dev' : 'prod',
      ...(ci ? {
        ci_provider: ci.provider,
        repository: ci.repository,
        run_id: ci.runId,
        ...(ci.job ? { job: ci.job } : {}),
        ...(ci.sha ? { sha: ci.sha } : {}),
        ...(ci.ref ? { ref: ci.ref } : {}),
      } : {}),
    },
    trust_boundary: {
      package_manager: 'npm',
      manifest_kind: manifestKind,
      ...(ci ? {
        ci_provider: ci.provider,
        repository: ci.repository,
        ...(ci.ref ? { ref: ci.ref } : {}),
      } : {}),
    },
  };
}

export async function runExposureIngestDependencies(args: ParsedArgs): Promise<number> {
  if (!args.workspace) {
    process.stderr.write('Usage error: --workspace <id> is required.\n');
    return EXIT_USAGE_ERROR;
  }
  if (!args.file) {
    process.stderr.write('Usage error: --file <package.json|package-lock.json|deps.json> is required.\n');
    return EXIT_USAGE_ERROR;
  }

  // PR-7B CI attribution validation. Attribution flags without --ci are a
  // usage error (never silently mis-attribute); --ci requires the minimum
  // attribution a reviewer needs to find the run: provider, repo, run id.
  if (!args.ci && (args.ciProvider || args.ciRunId || args.ciJob || args.ciSha || args.ciRef || args.ciRepository)) {
    process.stderr.write('Usage error: CI attribution flags (--ci-provider, --run-id, --job, --sha, --ref, --repository) require --ci.\n');
    return EXIT_USAGE_ERROR;
  }
  let ci: CiAttribution | null = null;
  if (args.ci) {
    if (!args.ciProvider || !CI_PROVIDER_RE.test(args.ciProvider)) {
      process.stderr.write('Usage error: --ci requires --ci-provider <provider> (e.g. github-actions).\n');
      return EXIT_USAGE_ERROR;
    }
    if (!args.ciRepository || !CI_REPO_RE.test(args.ciRepository)) {
      process.stderr.write('Usage error: --ci requires --repository <owner/repo>.\n');
      return EXIT_USAGE_ERROR;
    }
    if (!args.ciRunId) {
      process.stderr.write('Usage error: --ci requires --run-id <id>.\n');
      return EXIT_USAGE_ERROR;
    }
    ci = {
      provider: args.ciProvider,
      repository: args.ciRepository,
      runId: args.ciRunId,
      job: args.ciJob,
      sha: args.ciSha,
      ref: args.ciRef,
    };
  }

  const session = loadSession();
  if (!session) {
    process.stderr.write('opensoyce login required before --workspace <id>.\n');
    return EXIT_USAGE_ERROR;
  }
  const apiBase = session.api_base || args.apiBase;
  const workspace = args.workspace;

  let text: string;
  try {
    text = fs.readFileSync(args.file, 'utf8');
  } catch {
    process.stderr.write(`Usage error: cannot read file ${args.file}.\n`);
    return EXIT_USAGE_ERROR;
  }

  const parsed = parseDependencyFile(text, path.basename(args.file));
  if (!parsed.ok) {
    process.stderr.write(`Usage error: ${parsed.message}\n`);
    return EXIT_USAGE_ERROR;
  }
  // CLI mode: source_ref is the file path. CI mode: source_ref is the
  // provider/repo/run/job/sha summary (where the observation ran).
  const sourceRef = (ci ? ciSourceRef(ci) : args.file).slice(0, MAX_SOURCE_REF_LEN);

  if (parsed.entries.length === 0) {
    if (args.json) {
      process.stdout.write(JSON.stringify({
        workspace, file: args.file, manifest_kind: parsed.manifestKind,
        source_kind: ci ? 'ci' : 'cli', source_ref: sourceRef,
        planned: [], created: 0, skipped_existing: 0, failed: 0,
        dry_run: args.dryRun, visibility: 'private',
      }) + '\n');
    } else if (!args.quiet) {
      process.stdout.write(`[PRIVATE] No dependencies found in ${args.file}; nothing to ingest.\n`);
    }
    return EXIT_ALLOW;
  }

  // Dedupe guard: page through the workspace's existing exposures and skip
  // entries whose (package, version, source_ref) already exist. Client-side
  // only — a server-side uniqueness constraint is documented as DEFERRED in
  // the PR-7A scope record; this guard makes re-running the command cheap,
  // not transactional.
  const existing = new Set<string>();
  let offset = 0;
  let dedupeTruncated = false;
  while (offset < MAX_SCAN_RECORDS) {
    const page = await listExposures(apiBase, session.session_token, workspace, {
      limit: EXPOSURE_SCAN_PAGE_SIZE,
      offset,
    }, args.timeoutMs);
    if (!page.ok) {
      process.stderr.write(page.message + '\n');
      return page.exitCode;
    }
    for (const row of page.data.exposures) {
      const key = existingKey(row);
      if (key) existing.add(key);
    }
    if (page.data.exposures.length < EXPOSURE_SCAN_PAGE_SIZE) break;
    offset += EXPOSURE_SCAN_PAGE_SIZE;
    if (offset >= MAX_SCAN_RECORDS && page.data.total_count_estimate > MAX_SCAN_RECORDS) {
      dedupeTruncated = true;
    }
  }
  if (dedupeTruncated && !args.quiet) {
    process.stderr.write(
      `Warning: dedupe scan stopped after ${MAX_SCAN_RECORDS} existing records; duplicates beyond that are not detected.\n`,
    );
  }

  const planned = parsed.entries.filter(
    (e) => !existing.has(dedupeKey(e.name, e.version, sourceRef)),
  );
  const skippedExisting = parsed.entries.length - planned.length;

  // Dry-run: print the plan, write NOTHING. The early return below is the
  // write-free guarantee — no createExposure call is reachable in this mode.
  if (args.dryRun) {
    if (args.json) {
      process.stdout.write(JSON.stringify({
        workspace, file: args.file, manifest_kind: parsed.manifestKind,
        source_kind: ci ? 'ci' : 'cli', source_ref: sourceRef,
        planned: planned.map((e) => ({ name: e.name, version: e.version, dev: e.dev })),
        created: 0, skipped_existing: skippedExisting, failed: 0,
        dry_run: true, visibility: 'private',
      }) + '\n');
    } else if (!args.quiet) {
      for (const e of planned) {
        process.stdout.write(`[PRIVATE] would create dependency-exposure pkg ${e.name}@${e.version}${e.dev ? ' (dev)' : ''}\n`);
      }
      process.stdout.write(
        `[PRIVATE] dry-run: ${planned.length} would be created, ${skippedExisting} skipped as already ingested. No records written.\n`,
      );
    }
    return EXIT_ALLOW;
  }

  let created = 0;
  const failures: Array<{ name: string; version: string; message: string }> = [];
  let failureExitCode = EXIT_ALLOW;
  for (const entry of planned) {
    const res = await createExposure(
      apiBase, session.session_token, workspace,
      buildBody(entry, sourceRef, parsed.manifestKind, ci), args.timeoutMs,
    );
    if (res.ok) {
      created += 1;
      if (!args.json && !args.quiet) {
        process.stdout.write(`[PRIVATE] created dependency-exposure pkg ${entry.name}@${entry.version}${entry.dev ? ' (dev)' : ''}\n`);
      }
    } else {
      failures.push({ name: entry.name, version: entry.version, message: res.message });
      failureExitCode = res.exitCode;
      if (!args.json) {
        process.stderr.write(`Failed to create exposure for ${entry.name}@${entry.version}: ${res.message}\n`);
      }
    }
  }

  if (args.json) {
    process.stdout.write(JSON.stringify({
      workspace, file: args.file, manifest_kind: parsed.manifestKind,
      source_kind: ci ? 'ci' : 'cli', source_ref: sourceRef,
      created, skipped_existing: skippedExisting, failed: failures.length,
      failures, dry_run: false, visibility: 'private',
    }) + '\n');
  } else if (!args.quiet) {
    process.stdout.write(
      `[PRIVATE] Ingested ${created} dependency-exposure record${created === 1 ? '' : 's'}`
      + ` (${skippedExisting} skipped as already ingested, ${failures.length} failed).`
      + ' Exposures observe; they do not decide.\n',
    );
  }
  return failures.length > 0 ? failureExitCode : EXIT_ALLOW;
}
