#!/usr/bin/env node
/**
 * Test scaffold for the Dependency Identity Resolver v1.
 *
 * Runs the 7 documented cases. Cases 1–5 hit the live npm registry; cases
 * 6 and 7 use a stub fetchImpl so they're deterministic even though such
 * pathological packages are hard to find in the wild.
 *
 * Usage: node scripts/test-resolver.mjs
 */
import {
  resolveDepIdentity,
  parseRepositoryField,
  extractGithubFromUrl,
} from '../src/shared/resolveDepIdentity.js';

let pass = 0;
let fail = 0;

function check(name, ok, detail) {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}`);
    if (detail !== undefined) {
      console.log('        ' + JSON.stringify(detail));
    }
  }
}

/** Build a stub fetchImpl that returns a synthetic npm registry doc. */
function stubFetch(doc, { status = 200 } = {}) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    async json() { return doc; },
  });
}

async function run() {
  // -------------------------------------------------------------------------
  console.log('\n[1] lodash -> lodash/lodash (HIGH, npm.repository)');
  {
    const r = await resolveDepIdentity('lodash');
    check('lodash', r.resolvedRepo === 'lodash/lodash' && r.confidence === 'HIGH' && r.source === 'npm.repository', r);
  }

  // -------------------------------------------------------------------------
  console.log('\n[2] react -> facebook/react (HIGH, npm.repository)');
  {
    const r = await resolveDepIdentity('react');
    check('react', r.resolvedRepo === 'facebook/react' && r.confidence === 'HIGH' && r.source === 'npm.repository', r);
  }

  // -------------------------------------------------------------------------
  console.log('\n[3] @types/react -> DefinitelyTyped/DefinitelyTyped + directory');
  {
    const r = await resolveDepIdentity('@types/react');
    check(
      '@types/react resolvedRepo',
      r.resolvedRepo === 'DefinitelyTyped/DefinitelyTyped',
      r,
    );
    check('@types/react confidence', r.confidence === 'HIGH', r.confidence);
    check('@types/react source', r.source === 'npm.repository', r.source);
    check('@types/react directory', r.directory === 'types/react', r.directory);
  }

  // -------------------------------------------------------------------------
  console.log('\n[4] scoped GitHub package: @vercel/analytics (HIGH)');
  // @vercel/analytics has a clean repository.url + directory pointing at
  // vercel/analytics. Verified against the live npm registry doc.
  {
    const r = await resolveDepIdentity('@vercel/analytics');
    check(
      '@vercel/analytics HIGH',
      r.confidence === 'HIGH' && r.resolvedRepo === 'vercel/analytics' && r.source === 'npm.repository',
      r,
    );
  }

  // -------------------------------------------------------------------------
  console.log('\n[5] non-GitHub host: @gitlab-org/gitlab-svgs (expect NONE)');
  // Hosted on gitlab.com. The resolver only recognizes GitHub identities in
  // v1, so non-GitHub repos collapse to NONE rather than producing a partial
  // identity we can't score.
  {
    const r = await resolveDepIdentity('@gitlab-org/gitlab-svgs');
    check(
      '@gitlab-org/gitlab-svgs NONE',
      r.confidence === 'NONE' && r.resolvedRepo === null && r.source === null,
      r,
    );
  }

  // -------------------------------------------------------------------------
  console.log('\n[6] missing repository field (stubbed) -> NONE');
  {
    const r = await resolveDepIdentity('fake-no-repo', {
      fetchImpl: stubFetch({ name: 'fake-no-repo', description: 'no repo here' }),
      cache: new Map(),
    });
    check(
      'no-repo NONE',
      r.confidence === 'NONE' && r.resolvedRepo === null && r.source === null,
      r,
    );
  }

  // -------------------------------------------------------------------------
  console.log('\n[7] malformed repository.url (stubbed) -> NONE');
  {
    const r = await resolveDepIdentity('fake-bad-url', {
      fetchImpl: stubFetch({
        name: 'fake-bad-url',
        repository: { url: 'this-is-not-a-url' },
      }),
      cache: new Map(),
    });
    check(
      'malformed repo NONE',
      r.confidence === 'NONE' && r.resolvedRepo === null && r.source === null,
      r,
    );
  }

  // Quick sanity on pure helpers (not numbered cases, but cheap and catches
  // regressions in parsing).
  console.log('\n[pure helpers] spot checks');
  check(
    'extractGithubFromUrl git+https',
    JSON.stringify(extractGithubFromUrl('git+https://github.com/lodash/lodash.git')) ===
      JSON.stringify({ owner: 'lodash', repo: 'lodash' }),
  );
  check(
    'extractGithubFromUrl ssh',
    JSON.stringify(extractGithubFromUrl('git@github.com:facebook/react.git')) ===
      JSON.stringify({ owner: 'facebook', repo: 'react' }),
  );
  check(
    'extractGithubFromUrl shorthand',
    JSON.stringify(extractGithubFromUrl('github:owner/repo')) ===
      JSON.stringify({ owner: 'owner', repo: 'repo' }),
  );
  check(
    'extractGithubFromUrl tree subpath',
    JSON.stringify(extractGithubFromUrl('https://github.com/owner/repo/tree/main/packages/sub')) ===
      JSON.stringify({ owner: 'owner', repo: 'repo', directory: 'packages/sub' }),
  );
  check(
    'extractGithubFromUrl non-github',
    extractGithubFromUrl('https://gitlab.com/owner/repo') === null,
  );
  check(
    'extractGithubFromUrl garbage',
    extractGithubFromUrl('this-is-not-a-url') === null,
  );
  check(
    'parseRepositoryField with directory',
    JSON.stringify(parseRepositoryField({
      type: 'git',
      url: 'https://github.com/DefinitelyTyped/DefinitelyTyped.git',
      directory: 'types/react',
    })) === JSON.stringify({
      host: 'github.com',
      owner: 'DefinitelyTyped',
      repo: 'DefinitelyTyped',
      directory: 'types/react',
    }),
  );

  console.log(`\nResults: ${pass} pass, ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error('Test runner threw:', e);
  process.exit(2);
});
