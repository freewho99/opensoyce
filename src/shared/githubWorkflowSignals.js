/**
 * OpenSoyce — GitHub workflow signal extractor.
 *
 * Parses `.github/workflows/*.yml` content into rows the OTS pattern
 * detector can consume. Closes the catalog-only gap on three documented
 * GitHub Actions patterns by giving the detector real signal sources:
 *
 *   pull-request-target-abuse       (catalog-only → gate-active)
 *   untrusted-workflow-input        (catalog-only → gate-active)
 *   dangerous-release-permission    (catalog-only → gate-active)
 *
 * v1 scope: parser + adapter only. No GitHub API fetching, no repo
 * installation scanning, no branch protection checks — those are
 * separate scope.
 *
 * Detection rules (conservative on purpose; expand later only with cited
 * incident evidence):
 *
 *   pull_request_target abuse fires when a workflow uses the
 *   `pull_request_target` trigger AND either:
 *     - an `actions/checkout` step pins a ref derived from the PR
 *       (e.g. `github.event.pull_request.head.sha` / `head.ref`), OR
 *     - any `run` step interpolates the PR head ref/sha into a shell
 *       command (executes attacker-controlled code with the
 *       privileged-context token).
 *
 *   Untrusted workflow input fires when a `run` step interpolates one
 *   of a small allowlist of attacker-controllable expressions directly
 *   into the shell:
 *     ${{ github.event.issue.title|body }}
 *     ${{ github.event.pull_request.title|body|head.ref }}
 *     ${{ github.head_ref }}
 *     ${{ github.event.comment.body }}
 *     ${{ github.event.review.body }}
 *     ${{ github.event.pages[*].page_name }}
 *   The fix pattern (env indirection) is recognized and does not fire.
 *
 *   Dangerous release permission fires when a workflow declares any of
 *   the write scopes that let it ship code/artifacts:
 *     contents, packages, deployments, actions, id-token, pull-requests,
 *     issues, repository-projects, security-events
 *   at write level. Catalog default policy impact is `warn` — we do not
 *   auto-block on this signal alone because legitimate release
 *   workflows need it. Combine with PR-target/untrusted-input for the
 *   real blocking case (which the existing patterns handle).
 */

import yaml from 'js-yaml';
import { detectOtsPatternsForRow } from './otsPatterns.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const UNTRUSTED_INPUT_EXPRESSIONS = [
  /\$\{\{\s*github\.event\.issue\.title\s*\}\}/i,
  /\$\{\{\s*github\.event\.issue\.body\s*\}\}/i,
  /\$\{\{\s*github\.event\.pull_request\.title\s*\}\}/i,
  /\$\{\{\s*github\.event\.pull_request\.body\s*\}\}/i,
  /\$\{\{\s*github\.event\.pull_request\.head\.ref\s*\}\}/i,
  /\$\{\{\s*github\.event\.pull_request\.head\.label\s*\}\}/i,
  /\$\{\{\s*github\.head_ref\s*\}\}/i,
  /\$\{\{\s*github\.event\.comment\.body\s*\}\}/i,
  /\$\{\{\s*github\.event\.review\.body\s*\}\}/i,
  /\$\{\{\s*github\.event\.pages\[/i,
];

const PR_HEAD_REF_EXPRESSIONS = [
  /\$\{\{\s*github\.event\.pull_request\.head\.sha\s*\}\}/i,
  /\$\{\{\s*github\.event\.pull_request\.head\.ref\s*\}\}/i,
  /\$\{\{\s*github\.head_ref\s*\}\}/i,
];

// Permissions that let a workflow ship code or artifacts. Catalog impact
// is `warn` (not block) — legitimate release workflows need these.
const DANGEROUS_WRITE_SCOPES = [
  'contents',
  'packages',
  'deployments',
  'actions',
  'id-token',
  'pull-requests',
  'issues',
  'repository-projects',
  'security-events',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalize the workflow's `on:` field to a flat list of trigger names.
 * Accepts string, list, or object forms.
 *
 *   on: push                       → ['push']
 *   on: [push, pull_request]       → ['push', 'pull_request']
 *   on: { push: { branches: [..] } } → ['push']
 */
function normalizeTriggers(on) {
  if (!on) return [];
  if (typeof on === 'string') return [on];
  if (Array.isArray(on)) return on.filter((t) => typeof t === 'string');
  if (typeof on === 'object') return Object.keys(on);
  return [];
}

/**
 * Normalize permissions block to a {scope: level} map.
 *
 *   permissions: read-all              → { __all: 'read' }
 *   permissions: write-all             → { __all: 'write' }
 *   permissions: { contents: write }   → { contents: 'write' }
 */
function normalizePermissions(perm) {
  if (perm == null) return {};
  if (typeof perm === 'string') {
    if (perm === 'read-all') return { __all: 'read' };
    if (perm === 'write-all') return { __all: 'write' };
    return {};
  }
  if (typeof perm === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(perm)) {
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  }
  return {};
}

function hasDangerousReleasePermission(permissions) {
  if (permissions.__all === 'write') return true;
  for (const scope of DANGEROUS_WRITE_SCOPES) {
    if (permissions[scope] === 'write') return true;
  }
  return false;
}

function isCheckoutUses(uses) {
  if (typeof uses !== 'string') return false;
  // Match actions/checkout@anyversion (any ref).
  return /^actions\/checkout(@|$)/i.test(uses);
}

function withConfigUsesPrHead(withConfig) {
  if (!withConfig || typeof withConfig !== 'object') return false;
  const ref = withConfig.ref;
  if (typeof ref !== 'string') return false;
  return PR_HEAD_REF_EXPRESSIONS.some((re) => re.test(ref));
}

function runUsesPrHead(run) {
  if (typeof run !== 'string') return false;
  return PR_HEAD_REF_EXPRESSIONS.some((re) => re.test(run));
}

function runInterpolatesUntrustedInput(run) {
  if (typeof run !== 'string') return false;
  return UNTRUSTED_INPUT_EXPRESSIONS.some((re) => re.test(run));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a workflow YAML string into a list of OTS signal rows. Each row
 * carries the boolean flags the detector branches read. Returns `[]` on
 * parse failure rather than throwing — the gate must never crash on a
 * malformed workflow file.
 *
 * `opts.workflowPath` (string, default `.github/workflows/workflow.yml`)
 * — surfaced in evidence for traceability.
 */
export function parseWorkflowForOtsSignals(source, opts = {}) {
  const workflowPath = opts.workflowPath || '.github/workflows/workflow.yml';
  let doc;
  try {
    doc = yaml.load(source);
  } catch {
    return [];
  }
  if (!doc || typeof doc !== 'object') return [];

  const triggers = normalizeTriggers(doc.on || doc['on']);
  const hasPullRequestTarget = triggers.includes('pull_request_target');
  const jobs = doc.jobs && typeof doc.jobs === 'object' ? doc.jobs : {};
  const topLevelPermissions = normalizePermissions(doc.permissions);
  const rows = [];

  for (const [jobId, job] of Object.entries(jobs)) {
    if (!job || typeof job !== 'object') continue;
    const jobPermissions = normalizePermissions(job.permissions);
    const effectivePermissions = Object.keys(jobPermissions).length > 0
      ? jobPermissions
      : topLevelPermissions;
    const steps = Array.isArray(job.steps) ? job.steps : [];

    // dangerous-release-permission — one row per job that holds the write scope.
    if (hasDangerousReleasePermission(effectivePermissions)) {
      const writeScopes = effectivePermissions.__all === 'write'
        ? ['__all']
        : DANGEROUS_WRITE_SCOPES.filter((s) => effectivePermissions[s] === 'write');
      rows.push({
        package: `${workflowPath}#${jobId}`,
        isWorkflowAction: true,
        workflowPath,
        jobId,
        dangerousReleasePermission: true,
        writeScopes,
      });
    }

    for (const [stepIndex, step] of steps.entries()) {
      if (!step || typeof step !== 'object') continue;
      const uses = typeof step.uses === 'string' ? step.uses : '';
      const run = typeof step.run === 'string' ? step.run : '';
      const withConfig = step.with && typeof step.with === 'object' ? step.with : {};

      // pull-request-target-abuse — fork-controlled checkout OR run step
      // executing the PR ref under the privileged pull_request_target token.
      if (hasPullRequestTarget) {
        const checkoutFromPr = isCheckoutUses(uses) && withConfigUsesPrHead(withConfig);
        const runFromPr = runUsesPrHead(run);
        if (checkoutFromPr || runFromPr) {
          rows.push({
            package: `${workflowPath}#${jobId}.steps.${stepIndex}`,
            isWorkflowAction: true,
            workflowPath,
            jobId,
            stepIndex,
            pullRequestTargetAbuse: true,
            evidenceText: uses || run,
          });
        }
      }

      // untrusted-workflow-input — attacker-controllable expression
      // interpolated directly into a shell command.
      if (run && runInterpolatesUntrustedInput(run)) {
        rows.push({
          package: `${workflowPath}#${jobId}.steps.${stepIndex}`,
          isWorkflowAction: true,
          workflowPath,
          jobId,
          stepIndex,
          untrustedWorkflowInput: true,
          evidenceText: run.slice(0, 200),
        });
      }
    }
  }

  return rows;
}

/**
 * Convenience: parse + run through the OTS pattern detector in one call.
 * Returns the flattened pattern array. Each returned pattern carries the
 * standard {patternId, severity, policyImpact, confidence, evidence}
 * shape so downstream consumers (gate response, /proof page) don't need
 * to know about the workflow-specific row shape.
 */
export function detectGithubWorkflowOtsPatterns(source, opts = {}) {
  const rows = parseWorkflowForOtsSignals(source, opts);
  const out = [];
  for (const row of rows) {
    for (const p of detectOtsPatternsForRow(row, { ci: true, hasSecrets: true, allowDemoFixtures: false })) {
      out.push(p);
    }
  }
  return out;
}
