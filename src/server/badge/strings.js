// All user-facing Trust Badge strings (SVG text + JSON labels + recommended
// README embed). Hygiene is enforced on this file by
// scripts/test-open-source-trust-center.mjs: every banned-substring
// vocabulary is scoped to windows around any /opensource-trust reference.
//
// The trust record lives at https://opensoyce.com/opensource-trust.

export const TRUST_RECORD_URL = 'https://opensoyce.com/opensource-trust';

// Posture text vocabulary, locked at 5 entries.
export const POSTURE_TEXT = Object.freeze({
  'use-ready': 'USE READY',
  watchlist: 'WATCHLIST',
  risky: 'RISKY',
  graveyard: 'GRAVEYARD',
  not_evaluated: 'NOT EVALUATED',
});

// Mandatory brand prefix on every badge.
export const BADGE_LABEL = 'OPENSOYCE';

// Aria-label / SVG <title> template.
export function ariaLabelFor(postureText) {
  return `OpenSoyce posture: ${postureText}`;
}

// Recommended README embed block.
//
// Reads the trust record at https://opensoyce.com/opensource-trust.
export function recommendedReadmeEmbed(owner, repo) {
  return `[![OpenSoyce Trust](https://opensoyce.com/badge/${owner}/${repo}/posture.svg)](https://opensoyce.com/projects/${owner}/${repo}/trust)`;
}
