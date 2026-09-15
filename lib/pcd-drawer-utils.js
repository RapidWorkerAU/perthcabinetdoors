
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
// The runner type is a SPEC, not a price. It rides on the drawer front line as
// a note for whoever fits the drawer, and that is all it does here. Runners
// used to carry a rate per type in business defaults, and the importer turned
// that rate into a priced "Hardware" line; they are ordinary hardware now,
// picked from the hardware library and added to a quote as their own line, so
// there is no rate in this file and no automatic line any more.
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


// ── THE RUNNER AS A REAL BOUGHT ITEM ────────────────────────────────────────
//
// The three labels above are a SPEC: words for whoever fits the drawer. They
// describe a runner without naming one, carry no price, and produce no line, so
// a bank of drawers arrived on a quote with the runners invisible and somebody
// added them by hand or forgot.
//
// A runner picked from the hardware library is a different thing: a named
// product with a length, a brand and a price, which becomes its own line on the
// quote exactly as a hinge or a pull-out bin does.
//
// ── BOTH, ON PURPOSE, AND WHY THE OLD ONE IS NOT DELETED ────────────────────
//
// Every drawer designed before this carries runner_type and nothing else. Those
// designs are real: they are on sent quotes and on jobs in the workshop.
// Dropping the field would blank the fit spec on all of them, so runner_type is
// still read and still written onto the drawer line as a note. What changes is
// that a design can now ALSO name the actual runner, and when it does, that is
// what gets quoted.
//
// A drawer with a hardware runner needs no generic spec: the product name is
// more specific than any of the three words could be.

/** The library runner picked for these drawers, or null if it is still a spec. */
export function resolveRunnerHardware(cfg = {}) {
  const id = String(cfg?.runner_hardware_id || "").trim();
  if (!id) return null;
  return {
    id,
    // Kept beside the id so a line, a note or a picker can say the name without
    // a lookup, the same way an accessory does. The id is what it is priced by.
    name: String(cfg?.runner_name || "").trim(),
  };
}

/** Whether these drawers name a real runner rather than a generic spec. */
export function hasRunnerHardware(cfg = {}) {
  return Boolean(resolveRunnerHardware(cfg));
}

/**
 * The runner note for the drawer line.
 *
 * A named runner says its own name. Anything else falls back to the generic
 * spec, which is what every drawer designed before this has.
 */
export function runnerNoteLabel(cfg = {}) {
  const picked = resolveRunnerHardware(cfg);
  if (picked) return picked.name || "Runner from the hardware library";
  return runnerLabel(cfg);
}
