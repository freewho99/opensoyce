#!/usr/bin/env node
/**
 * Test scaffold for the Dependency Identity Resolver v1.1.
 *
 * Runs the 7 documented cases plus the P0-AI-2 borrowed-trust battery.
 * Cases 1–5 hit the live npm registry; everything else uses stubbed
 * fetchImpl + deps.fetchGithubPackageJson so behavior is deterministic.
 *
 * Usage: node scripts/test-resolver.mjs
 */
import {
  resolveDepIdentity,
  parseRepositoryField,
  extractGithubFromUrl,
  fetchGithubPackageJson,
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
    async text() { return JSON.stringify(doc); },
  });
}

/**
 * Build a deps.fetchGithubPackageJson stub. Pass a map of `owner/repo` →
 * `{ name }` for matches, `'404'` for missing, `'error'` for null (fetch
 * failure), or omit a key to default to null.
 */
function stubGithubPkg(map) {
  return async (owner, repo) => {
    const key = `${owner}/${repo}`;
    const v = map[key];
    if (v === undefined) return null;
    if (v === '404') return { __missing: true };
    if (v === 'error') return null;
    return v;
  };
}

/** A no-op deps that prevents live tests from also hitting GitHub. */
function noGithub() {
  return { fetchGithubPackageJson: async () => null };
}

async function run() {
  // Live tests use `deps: noGithub()` so they don't ALSO hit GitHub's API
  // (which would couple test runs to GitHub rate limits). With the GitHub
  // fetcher returning null, the resolver stamps `verified: 'unverified'`
  // and keeps HIGH confidence — same downstream effect as a real GitHub
  // outage. The borrowed-trust scenarios below cover the verified=true /
  // false paths with fully stubbed fetches.
  const liveOpts = { deps: noGithub() };

  // -------------------------------------------------------------------------
  console.log('\n[1] lodash -> lodash/lodash (HIGH, npm.repository)');
  {
    const r = await resolveDepIdentity('lodash', liveOpts);
    check('lodash', r.resolvedRepo === 'lodash/lodash' && r.confidence === 'HIGH' && r.source === 'npm.repository', r);
    check('lodash verified=unverified (no github stub)', r.verified === 'unverified', r);
  }

  // -------------------------------------------------------------------------
  console.log('\n[2] react -> facebook/react (HIGH, npm.repository)');
  {
    const r = await resolveDepIdentity('react', liveOpts);
    check('react', r.resolvedRepo === 'facebook/react' && r.confidence === 'HIGH' && r.source === 'npm.repository', r);
  }

  // -------------------------------------------------------------------------
  console.log('\n[3] @types/react -> DefinitelyTyped/DefinitelyTyped + directory');
  {
    const r = await resolveDepIdentity('@types/react', liveOpts);
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
    const r = await resolveDepIdentity('@vercel/analytics', liveOpts);
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
    const r = await resolveDepIdentity('@gitlab-org/gitlab-svgs', liveOpts);
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

  // -------------------------------------------------------------------------
  // P0-AI-2 — borrowed-trust cross-check battery
  // -------------------------------------------------------------------------

  console.log('\n[8] happy path: npm name matches github pkg.json name (verified true, HIGH)');
  {
    const r = await resolveDepIdentity('lodash', {
      cache: new Map(),
      fetchImpl: stubFetch({
        name: 'lodash',
        repository: { url: 'git+https://github.com/lodash/lodash.git' },
      }),
      deps: { fetchGithubPackageJson: stubGithubPkg({ 'lodash/lodash': { name: 'lodash' } }) },
    });
    check('lodash verified true', r.verified === true, r);
    check('lodash confidence HIGH', r.confidence === 'HIGH', r);
    check('lodash resolvedRepo', r.resolvedRepo === 'lodash/lodash', r);
    check('lodash no mismatchReason', r.mismatchReason === undefined, r);
  }

  console.log('\n[9] BORROWED TRUST: npm typo-squat points at langchainjs (verified false, MEDIUM)');
  {
    const r = await resolveDepIdentity('langchain-core-evil', {
      cache: new Map(),
      fetchImpl: stubFetch({
        name: 'langchain-core-evil',
        // The attack: typo-squat publishes itself with langchainjs's repo URL.
        repository: { url: 'git+https://github.com/langchain-ai/langchainjs.git' },
      }),
      deps: {
        fetchGithubPackageJson: stubGithubPkg({
          'langchain-ai/langchainjs': { name: 'langchain' },
        }),
      },
    });
    check('attack: verified false', r.verified === false, r);
    check('attack: confidence downgraded MEDIUM', r.confidence === 'MEDIUM', r);
    check('attack: mismatchReason set', r.mismatchReason === 'github_pkg_name_different', r);
    check('attack: resolvedRepo preserved (still useful)', r.resolvedRepo === 'langchain-ai/langchainjs', r);
    check('attack: meta.githubPkgName surfaced', r.meta && r.meta.githubPkgName === 'langchain', r);
  }

  console.log('\n[10] GitHub fetch fails / 404 repo: HIGH preserved, verified unverified');
  {
    const r = await resolveDepIdentity('some-pkg', {
      cache: new Map(),
      fetchImpl: stubFetch({
        name: 'some-pkg',
        repository: { url: 'git+https://github.com/some-owner/some-repo.git' },
      }),
      deps: { fetchGithubPackageJson: stubGithubPkg({ /* unknown -> null */ }) },
    });
    check('fetch-fail: verified unverified', r.verified === 'unverified', r);
    check('fetch-fail: HIGH preserved', r.confidence === 'HIGH', r);
    check('fetch-fail: no mismatchReason', r.mismatchReason === undefined, r);
  }

  console.log('\n[11] monorepo root pkg.json with no name: verified false (root_pkg_missing)');
  {
    const r = await resolveDepIdentity('some-sub-pkg', {
      cache: new Map(),
      fetchImpl: stubFetch({
        name: 'some-sub-pkg',
        repository: {
          url: 'git+https://github.com/big-org/monorepo.git',
          directory: 'packages/sub',
        },
      }),
      deps: {
        fetchGithubPackageJson: stubGithubPkg({
          'big-org/monorepo': { /* no name field */ private: true },
        }),
      },
    });
    check('monorepo: verified false', r.verified === false, r);
    check('monorepo: mismatchReason root_pkg_missing', r.mismatchReason === 'github_root_pkg_missing', r);
    check('monorepo: confidence MEDIUM', r.confidence === 'MEDIUM', r);
  }

  console.log('\n[12] github 404 (package.json file missing): verified false (root_pkg_missing)');
  {
    const r = await resolveDepIdentity('weirdpkg', {
      cache: new Map(),
      fetchImpl: stubFetch({
        name: 'weirdpkg',
        repository: { url: 'git+https://github.com/owner/repo.git' },
      }),
      deps: { fetchGithubPackageJson: stubGithubPkg({ 'owner/repo': '404' }) },
    });
    check('gh-404: verified false', r.verified === false, r);
    check('gh-404: mismatchReason root_pkg_missing', r.mismatchReason === 'github_root_pkg_missing', r);
  }

  console.log('\n[13] cached identity holds verified state across calls');
  {
    const cache = new Map();
    let ghCalls = 0;
    const deps = {
      fetchGithubPackageJson: async (o, repo) => {
        ghCalls += 1;
        return { name: o === 'langchain-ai' && repo === 'langchainjs' ? 'langchain' : 'lodash' };
      },
    };
    const r1 = await resolveDepIdentity('langchain-core-evil', {
      cache,
      fetchImpl: stubFetch({
        name: 'langchain-core-evil',
        repository: { url: 'https://github.com/langchain-ai/langchainjs' },
      }),
      deps,
    });
    const r2 = await resolveDepIdentity('langchain-core-evil', {
      cache,
      fetchImpl: stubFetch({ name: 'should-not-be-used' }),
      deps,
    });
    check('cache: first call verified false', r1.verified === false, r1);
    check('cache: second call also verified false (cached)', r2.verified === false, r2);
    check('cache: second call mismatchReason preserved', r2.mismatchReason === 'github_pkg_name_different', r2);
    check('cache: github fetched only once', ghCalls === 1, { ghCalls });
  }

  console.log('\n[14] MEDIUM from homepage/bugs is marked unverified (no cross-check spent)');
  {
    let ghCalls = 0;
    const r = await resolveDepIdentity('homepage-only', {
      cache: new Map(),
      fetchImpl: stubFetch({
        name: 'homepage-only',
        homepage: 'https://github.com/some-owner/some-repo',
      }),
      deps: {
        fetchGithubPackageJson: async () => { ghCalls += 1; return { name: 'whatever' }; },
      },
    });
    check('homepage: confidence MEDIUM', r.confidence === 'MEDIUM', r);
    check('homepage: verified unverified', r.verified === 'unverified', r);
    check('homepage: no github budget spent', ghCalls === 0, { ghCalls });
  }

  console.log('\n[15] fetchGithubPackageJson helper unit checks');
  {
    // 404 path → __missing
    const m1 = await fetchGithubPackageJson('a', 'b', {
      cache: new Map(),
      fetchImpl: async () => ({ ok: false, status: 404, async text() { return ''; } }),
    });
    check('helper 404 returns __missing', m1 && m1.__missing === true, m1);

    // success path via raw text
    const m2 = await fetchGithubPackageJson('a', 'b', {
      cache: new Map(),
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        async text() { return JSON.stringify({ name: 'thing', version: '1' }); },
      }),
    });
    check('helper parses raw text', m2 && m2.name === 'thing', m2);

    // network error → null, caught
    const m3 = await fetchGithubPackageJson('a', 'b', {
      cache: new Map(),
      fetchImpl: async () => { throw new Error('boom'); },
    });
    check('helper swallows fetch errors', m3 === null, m3);

    // bad input → null
    const m4 = await fetchGithubPackageJson('', '', {});
    check('helper rejects empty input', m4 === null, m4);
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
