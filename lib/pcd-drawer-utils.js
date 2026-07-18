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
// `revealMm` is the standard full-overlay gap between stacked fronts. A
// finger-pull gap, where present, IS the reveal on that edge (just a
// deliberate 20mm one), so the two never stack — the larger wins. Fronts
// used to be cut at the full opening height with nothing between them, so a
// stack of drawers had zero clearance and would bind.
export function computeDrawerFrontHeights(heightsMm, gapEnabled, gapMm, revealMm = 0) {
  const heights = Array.isArray(heightsMm) ? heightsMm : [];
  const gap = gapEnabled ? (Number(gapMm) || 0) : 0;
  const above = gap || Math.max(0, Number(revealMm) || 0);
  if (!above) return heights.map((h) => Math.max(0, Number(h) || 0));
  return heights.map((h) => Math.max(0, (Number(h) || 0) - above));
}

// Drawer runners.
//
// PCD supplies the drawer FRONT, not the box or the runners — so the runner is
// a SPEC for whoever fits the drawer, carried on the quote line as a note. It
// is deliberately not costed. That was already how the import behaved; making
// it explicit here is the point, so it reads as a decision rather than a gap.
//
// The catalogue and the default both live here — the ONE place — because the
// config panel displayed `runner_type || "standard"` while the importer read
// the raw field, so a drawer bank whose runner was never touched imported with
// NO runner note at all: the screen said "Standard ball-bearing" and the
// fabricator was told nothing. Same shape as the finger-pull default.
export const DRAWER_RUNNER_LABELS = {
  standard: "Standard ball-bearing",
  soft_close_undermount: "Soft-close undermount",
  soft_close_side: "Soft-close side-mount",
};

export const DEFAULT_DRAWER_RUNNER = "standard";

// The runner actually in effect — the stored one, or the default the panel has
// always shown. Never returns empty, so the spec is never silently dropped.
export function resolveRunnerType(cfg = {}) {
  return DRAWER_RUNNER_LABELS[cfg.runner_type] ? cfg.runner_type : DEFAULT_DRAWER_RUNNER;
}

// The human label, e.g. for the quote line note.
export function runnerLabel(cfg = {}) {
  return DRAWER_RUNNER_LABELS[resolveRunnerType(cfg)];
}
