// SVG + JSON renderers for the Trust Badge.
//
// Renderer doctrine (locked by the PR-B1 sub-sketch):
//   - Posture source is exactly REPO_TRUST_POSTURES via getRepoTrustPosture.
//   - NOT EVALUATED is a first-class state; it renders 200 OK with the
//     same cache headers as a real posture.
//   - SVG dimensions are fixed (188x20). No customization.
//   - SVG contains exactly two text nodes (BADGE_LABEL + posture text)
//     plus a <title> and aria-label. No <script>, <iframe>, <foreignObject>,
//     or <a xlink:href>. The structural test rejects regressions.
//   - JSON sibling carries the same posture data; no score, no confidence,
//     no signature, no visibility, no telemetry.

import { getRepoTrustPosture } from '../../shared/repoTrustDashboard.js';
import { POSTURE_COLORS } from './colors.js';
import { POSTURE_TEXT, BADGE_LABEL, ariaLabelFor } from './strings.js';

// SVG geometry — locked for v0.
const BADGE_WIDTH = 188;
const BADGE_HEIGHT = 20;
const LABEL_WIDTH = 88;
const VALUE_WIDTH = BADGE_WIDTH - LABEL_WIDTH;
const FONT_FAMILY = 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
const FONT_SIZE = 11;
const VALUE_Y = 14;

/**
 * Look up the posture for an owner/repo. The renderer NEVER consults any
 * input other than getRepoTrustPosture, which is the public Dashboard
 * source of truth. Unknown owner/repo always returns the NOT EVALUATED
 * fallback.
 */
export function resolvePosture(owner, repo) {
  const found = getRepoTrustPosture(owner, repo);
  if (!found) {
    return {
      postureKey: 'not_evaluated',
      postureText: POSTURE_TEXT.not_evaluated,
      source: 'static-mvp',
    };
  }
  return {
    postureKey: found.postureLabel,
    postureText: POSTURE_TEXT[found.postureLabel],
    source: 'static-mvp',
  };
}

/** Render the SVG badge body. Pure function of the resolved posture data. */
export function renderBadgeSvg(data) {
  const colors = POSTURE_COLORS[data.postureKey];
  const aria = ariaLabelFor(data.postureText);
  const labelX = LABEL_WIDTH / 2;
  const valueX = LABEL_WIDTH + VALUE_WIDTH / 2;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BADGE_WIDTH}" height="${BADGE_HEIGHT}" role="img" aria-label="${escapeXml(aria)}">`,
    `<title>${escapeXml(aria)}</title>`,
    `<rect width="${LABEL_WIDTH}" height="${BADGE_HEIGHT}" fill="${colors.labelBg}"/>`,
    `<rect x="${LABEL_WIDTH}" width="${VALUE_WIDTH}" height="${BADGE_HEIGHT}" fill="${colors.valueBg}"/>`,
    `<g font-family="${FONT_FAMILY}" font-size="${FONT_SIZE}" font-weight="700" text-anchor="middle">`,
    `<text x="${labelX}" y="${VALUE_Y}" fill="${colors.labelFg}">${BADGE_LABEL}</text>`,
    `<text x="${valueX}" y="${VALUE_Y}" fill="${colors.valueFg}">${escapeXml(data.postureText)}</text>`,
    `</g>`,
    `</svg>`,
  ].join('');
}

/** Compute a stable ETag from posture data (no time component, no entropy). */
export function postureEtag(owner, repo, data) {
  return `"opensoyce-badge-v0-${owner}-${repo}-${data.postureKey}"`;
}

/** Build the JSON sibling response for a posture lookup. */
export function buildBadgeJson(owner, repo, data) {
  const dashboardPath = `/projects/${owner}/${repo}/trust`;
  return {
    owner,
    repo,
    postureLabel: data.postureKey === 'not_evaluated' ? null : data.postureKey,
    postureText: data.postureText,
    source: data.source,
    fetchedAt: new Date().toISOString(),
    proofAnchor: {
      proofType: 'live-surface',
      label: dashboardPath,
      href: dashboardPath,
    },
  };
}

function escapeXml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
