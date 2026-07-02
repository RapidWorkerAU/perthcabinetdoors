// Shared drawer front-height math — used by the config panel (live preview),
// the elevation view (rendering), and the quote import route, so all three
// agree on the actual finished panel sizes.
//
// heights_mm are OPENING heights (the vertical slot each drawer occupies,
// summing to the cabinet/section height) — the finished FRONT panel is
// shorter wherever a finger-pull gap is configured. The gap always sits
// above a drawer's own front (recessed into the top of its own opening
// slot, flush at the bottom) and applies to EVERY drawer, including the
// top one — its gap just recesses below the cabinet's own top edge rather
// than a neighbouring drawer. Nothing is needed below the bottom-most
// drawer since its own gap already sits above it.
export function computeDrawerFrontHeights(heightsMm, gapEnabled, gapMm) {
  const heights = Array.isArray(heightsMm) ? heightsMm : [];
  const gap = gapEnabled ? (Number(gapMm) || 0) : 0;
  if (!gap) return heights.map((h) => Math.max(0, Number(h) || 0));
  return heights.map((h) => Math.max(0, (Number(h) || 0) - gap));
}
