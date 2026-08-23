// Freestanding appliances — what kinds exist, how big each one is by default,
// and the shape rules for the ones that aren't simple boxes.
//
// Lives in lib/ (framework-free) because everything that draws an appliance
// reads from here: the catalogue tiles, the plan, the front elevation and the
// 3D view. One copy means a size or a proportion is corrected once rather than
// drifting between the four.

export const APPLIANCE_KIND_DEFAULTS = {
  fridge:             { width_mm: 700, height_mm: 1750, depth_mm: 700, mount_height_mm: 0 },
  freezer:            { width_mm: 700, height_mm: 1750, depth_mm: 700, mount_height_mm: 0 },
  dishwasher:         { width_mm: 600, height_mm: 850,  depth_mm: 600, mount_height_mm: 0 },
  // A chimney hood is tall: the canopy is a fixed slab and the flue makes up
  // the rest, running up toward the ceiling. See rangehoodGeometry().
  rangehood:          { width_mm: 900, height_mm: 900,  depth_mm: 500, mount_height_mm: 1500 },
  freestanding_cooker:{ width_mm: 900, height_mm: 900,  depth_mm: 600, mount_height_mm: 0 },
  washer_front:       { width_mm: 600, height_mm: 850,  depth_mm: 600, mount_height_mm: 0 },
  washer_top:         { width_mm: 600, height_mm: 1000, depth_mm: 650, mount_height_mm: 0 },
  // Kinds that are no longer offered when adding, kept so items already drawn
  // with them keep their size and their drawing.
  washing_machine:    { width_mm: 600, height_mm: 850,  depth_mm: 600, mount_height_mm: 0 },
  oven:               { width_mm: 600, height_mm: 600,  depth_mm: 560, mount_height_mm: 0 },
  cooktop:            { width_mm: 600, height_mm: 60,   depth_mm: 520, mount_height_mm: 900 },
  microwave:          { width_mm: 500, height_mm: 300,  depth_mm: 400, mount_height_mm: 1400 },
  other:              { width_mm: 600, height_mm: 850,  depth_mm: 600, mount_height_mm: 0 },
};

export function applianceKindDefaults(kind) {
  return APPLIANCE_KIND_DEFAULTS[kind] || APPLIANCE_KIND_DEFAULTS.other;
}

// The appliances you can add, in catalogue order. Every one is drawn as the
// appliance it actually is, which is why there is no longer a generic "other
// appliance" to fall into — picking a specific thing and then being handed a
// featureless box helped nobody.
export const APPLIANCE_KINDS = [
  { kind: "fridge",              label: "Fridge / Freezer",  desc: "Tall fridge — single, double or French-door style." },
  { kind: "freestanding_cooker", label: "Freestanding cooker", desc: "Upright cooker — gas hob over a glass oven door." },
  { kind: "rangehood",           label: "Rangehood",         desc: "Canopy rangehood with a chimney flue above it." },
  { kind: "dishwasher",          label: "Dishwasher",        desc: "Under-bench dishwasher with a control strip + handle." },
  { kind: "washer_front",        label: "Washer — front loader", desc: "Front loading washing machine with a round door." },
  { kind: "washer_top",          label: "Washer — top loader",   desc: "Top loading washing machine with a lid and console." },
];

const KIND_LABELS = Object.fromEntries(APPLIANCE_KINDS.map((a) => [a.kind, a.label]));

// A readable name for any kind, including the retired ones.
export function applianceKindLabel(kind) {
  return KIND_LABELS[kind] || {
    freezer: "Freezer",
    washing_machine: "Washing machine",
    oven: "Oven",
    cooktop: "Cooktop",
    microwave: "Microwave",
    other: "Appliance",
  }[kind] || "Appliance";
}

// ---- Rangehood ----
//
// A chimney hood is two pieces that do NOT scale together, which is the whole
// point of splitting them out here: the canopy is the flared box over the
// cooktop, the flue is the duct running up from it.
//
//   taller  → the FLUE gets longer. The canopy is a fixed slab and never
//             changes height, so a 1200 hood is a 1200 flue over the same
//             canopy as a 700 one.
//   wider   → the canopy's bottom opening gets wider. The flue is a fixed duct
//             section and stays exactly as wide.
//   deeper  → the canopy's bottom opening gets deeper. The flue's depth is
//             fixed too, so the taper simply flares further.
//
// The angle of the flare is therefore never set directly — it falls out of the
// canopy's fixed height and the gap between the two openings, which is exactly
// how a real one is made.
export const RANGEHOOD_CANOPY_HEIGHT_MM = 180;
export const RANGEHOOD_FLUE_WIDTH_MM = 260;
export const RANGEHOOD_FLUE_DEPTH_MM = 260;

export function rangehoodGeometry(item) {
  const width  = Math.max(1, Number(item?.width_mm)  || 900);
  const depth  = Math.max(1, Number(item?.depth_mm)  || 500);
  const height = Math.max(1, Number(item?.height_mm) || 900);

  // On a hood too short to hold a full canopy the canopy takes what there is
  // and the flue disappears, rather than the canopy growing a negative flue.
  const canopyH = Math.min(RANGEHOOD_CANOPY_HEIGHT_MM, height);
  // The flue can never be wider or deeper than the canopy it rises out of —
  // on a narrow hood it just becomes a straight box with no flare.
  const flueW = Math.min(RANGEHOOD_FLUE_WIDTH_MM, width);
  const flueD = Math.min(RANGEHOOD_FLUE_DEPTH_MM, depth);

  return { width, depth, height, canopyH, flueH: Math.max(0, height - canopyH), flueW, flueD };
}

// The canopy and the flue as actual boxes, in the hood's own frame:
//   x  across the hood, 0 at its centre
//   z  runs BACK from the front face at 0 to -depth
//   y  up from the bottom of the canopy
//
// Both come out of here together because the flue's footprint and the canopy's
// TOP opening are the same rectangle — they have to be, or the flue floats off
// the hole it rises out of. Working them out in two places is exactly how that
// went wrong once already, so there is now only one place.
//
// The flue is pinned to the BACK of the hood rather than centred in it, which
// is where a wall hood's duct actually goes: the canopy is a steep slope at the
// front and barely a slope at the back.
export function rangehoodParts(item) {
  const g = rangehoodGeometry(item);
  const footprint = {
    x0: -g.flueW / 2,
    x1: g.flueW / 2,
    z0: -g.depth,
    z1: -g.depth + g.flueD,
  };
  return {
    ...g,
    canopy: {
      bottom: { x0: -g.width / 2, x1: g.width / 2, z0: -g.depth, z1: 0 },
      top: footprint,
      y0: 0,
      y1: g.canopyH,
    },
    flue: { ...footprint, y0: g.canopyH, y1: g.canopyH + g.flueH },
  };
}
