// How a front is shaped, for the rendered 3D view. Every one of these is built
// as real geometry standing proud of the door slab, so what you see is the
// scene's own light falling into a real groove — never a dark line painted onto
// a flat face, which stops looking like a profile the moment the colour or the
// viewing angle changes.
export const FRONT_PROFILE_PRESETS = [
  { value: "slab", label: "Slab" },
  { value: "shaker", label: "Shaker" },
  { value: "bevel", label: "Bevel" },
  { value: "vj", label: "VJ panel" },
];

export function normaliseFrontProfile(value) {
  const key = String(value || "").trim();
  return FRONT_PROFILE_PRESETS.some((profile) => profile.value === key) ? key : "slab";
}

export function frontProfileLabel(value) {
  return FRONT_PROFILE_PRESETS.find((profile) => profile.value === normaliseFrontProfile(value))?.label || "Slab";
}

// ---- VJ panelling ----
//
// Nominal board cover. Real VJ lining runs about 100mm between grooves, and the
// boards across one door are always equal — so this is a target that the actual
// width is rounded to, never a hard number that would leave a sliver at one end.
export const VJ_BOARD_PITCH_MM = 100;
export const VJ_GROOVE_MM = 6;

// Where each VJ board sits across a front of `widthMm`, as { a0, a1 } offsets
// from its left edge.
//
// Half a groove comes off each side of every board, so all the grooves end up
// the same width — including the two at the outer edges, which would otherwise
// read half-width against the door reveal.
//
// The groove itself is not returned because it is not a thing that gets drawn:
// it is the GAP between two boards standing proud of the door slab, and what
// you see in it is the slab behind, in the same colour, in shadow.
export function vjBoards(widthMm, { pitchMm = VJ_BOARD_PITCH_MM, grooveMm = VJ_GROOVE_MM } = {}) {
  const w = Number(widthMm) || 0;
  if (w <= 0) return [];
  const count = Math.max(2, Math.round(w / pitchMm));
  const board = w / count;
  // A groove wider than the board it separates would eat the panelling, so on a
  // very narrow front it tightens rather than inverting.
  const groove = Math.min(grooveMm, board * 0.4);
  const out = [];
  for (let i = 0; i < count; i++) {
    const left = i * board;
    out.push({ a0: left + groove / 2, a1: left + board - groove / 2 });
  }
  return out;
}
