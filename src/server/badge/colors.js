// Posture color palette, locked at 5 entries. The Trust Badge SVG and the
// Dashboard React page MUST use the same color for the same posture; a
// structural test in scripts/test-trust-badge-v0.mjs asserts the
// renderer's value-segment color for each posture matches this table.

const BRAND_BG = '#302C26'; // soy-bottle
const WHITE = '#ffffff';
const NEAR_BLACK = '#1f2937';

export const POSTURE_COLORS = Object.freeze({
  'use-ready': Object.freeze({
    labelBg: BRAND_BG,
    valueBg: '#10b981',
    labelFg: WHITE,
    valueFg: WHITE,
  }),
  watchlist: Object.freeze({
    labelBg: BRAND_BG,
    valueBg: '#facc15',
    labelFg: WHITE,
    valueFg: BRAND_BG,
  }),
  risky: Object.freeze({
    labelBg: BRAND_BG,
    valueBg: '#E63322',
    labelFg: WHITE,
    valueFg: WHITE,
  }),
  graveyard: Object.freeze({
    labelBg: BRAND_BG,
    valueBg: NEAR_BLACK,
    labelFg: WHITE,
    valueFg: WHITE,
  }),
  not_evaluated: Object.freeze({
    labelBg: BRAND_BG,
    valueBg: '#a8a29e',
    labelFg: WHITE,
    valueFg: BRAND_BG,
  }),
});
