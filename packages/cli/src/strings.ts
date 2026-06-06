// All user-facing CLI strings live in this file.
// Hygiene is enforced on this file by scripts/test-open-source-trust-center.mjs:
// every banned-substring vocabulary (Trust Center bans, future-tense tells,
// soft-banned verbs near /opensource-trust links, Phase-3 launch bans, and
// Phase-4 bans added with the CLI) is scoped to windows around any
// /opensource-trust reference. The footer points at the trust record.

export const TRUST_RECORD_URL = 'https://opensoyce.com/opensource-trust';

export const STRINGS = {
  footer: `Reads the trust record at ${TRUST_RECORD_URL}`,

  notEvaluated: {
    package: (pkg: string) => `No recorded posture for ${pkg}.`,
    repo: (owner: string, repo: string) => `No recorded posture for ${owner}/${repo}.`,
    timelineEmpty: 'No matching events on record.',
  },

  errors: {
    network: (msg: string) => `Network error: ${msg}`,
    api: (status: number, msg: string) => `API error ${status}: ${msg}`,
    usage: (msg: string) => `Usage error: ${msg}`,
    timeout: (ms: number) => `Network timeout after ${ms}ms.`,
    unknownCommand: (name: string) => `Unknown command: ${name}. Run \`opensoyce --help\`.`,
    missingArg: (cmd: string, arg: string) => `Command \`${cmd}\` requires \`${arg}\`.`,
    badFlag: (flag: string) => `Unknown flag: ${flag}.`,
    lockfileFormatNotSupported: (format: string) =>
      `Lockfile format \`${format}\` is not supported in CLI v0. Supported: package-lock.json.`,
    lockfileNotFound: (path: string) => `Lockfile not found at ${path}.`,
    invalidPackage: (input: string) =>
      `Invalid package spec: ${input}. Expected name@version.`,
    invalidRepo: (input: string) =>
      `Invalid repo spec: ${input}. Expected owner/repo.`,
  },

  labels: {
    action: 'ACTION',
    patterns: 'PATTERNS',
    posture: 'POSTURE',
    timeline: 'TIMELINE',
    pr: 'PR',
    sha: 'SHA',
    proof: 'PROOF',
    package: 'PACKAGE',
    repo: 'REPO',
    date: 'DATE',
    type: 'TYPE',
    summary: 'SUMMARY',
  },

  postureCopy: {
    'use-ready': 'USE READY',
    watchlist: 'WATCHLIST',
    risky: 'RISKY',
    graveyard: 'GRAVEYARD',
  } as const,

  actionCopy: {
    ALLOW: 'ALLOW',
    WARN: 'WARN',
    BLOCK: 'BLOCK',
    NOT_EVALUATED: 'NOT EVALUATED',
  } as const,
};
