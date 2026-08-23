// Standard IKEA frame sizes, offered in the PUBLIC planner as PROPS.
//
// A prop is an ordinary base / wall / tall cabinet with its box size fixed. It
// stands in for a cabinet the customer already owns so they can plan the doors,
// drawer fronts and panels that go on it. Nothing here presets the front: a
// prop lands with the same starting config as any other new cabinet, and every
// control in the right hand panel stays live. The range and size decide the
// box, and that is all they decide.
//
// Props never reach a quote. We do not supply IKEA cabinets. The fronts and
// panels the customer puts on them are what we quote, and they come through as
// normal. See the submit route.
//
// ─────────────────────────────────────────────────────────────────────────────
// METOD: checked against ikea.com.au on 18 Aug 2026, every base, wall and high
// frame IKEA lists and nothing else. Sizes are IKEA's own, which they write as
// width x DEPTH x height in cm, so 60x37x80 and 60x60x80 are two different
// cabinets that look identical from the front.
//
// PAX AND BESTA STILL NEED VERIFYING. They are the published frame sizes
// carried over from app/(site)/ikea-kaboodle/cabinet-data.js and nobody has
// checked them. A locked size is exactly the kind a customer will not question,
// so a wrong one here is worse than a wrong one they can type over.
// ─────────────────────────────────────────────────────────────────────────────

export const IKEA_RANGES = [
  { id: "metod", label: "IKEA Metod", note: "Kitchen cabinets" },
  { id: "pax", label: "IKEA Pax", note: "Wardrobes" },
  { id: "besta", label: "IKEA Besta", note: "Living room storage" },
];

// Each group maps a set of frame sizes onto one of OUR cabinet types, so the
// planner, the elevation, the 3D view and the config panel all treat a prop as
// the ordinary cabinet it is. mount_height_mm is the tool's normal default for
// that type and stays editable: where someone hung their own cabinet is their
// business, and it is placement rather than a size we would ever cut to.
const GROUPS = [
  // Base and high frames each come in two depths, and a depth is a different
  // cabinet rather than a variation on one, so each depth is its own group.
  // A ref is range:group:WxH, so keeping them apart is what stops a 370 deep
  // frame resolving to the 600 deep one at the same face size.
  {
    range: "metod", key: "base", label: "Base cabinets",
    item_type: "base_cabinet", depth_mm: 600, mount_height_mm: 0,
    sizes: [[200, 800], [300, 800], [400, 800], [600, 800], [800, 800]],
  },
  {
    range: "metod", key: "base_shallow", label: "Base cabinets",
    item_type: "base_cabinet", depth_mm: 370, mount_height_mm: 0,
    // 200 wide is the deep frame only.
    sizes: [[300, 800], [400, 800], [600, 800], [800, 800]],
  },
  {
    // Every wall frame is 370 deep. There is no deep wall cabinet.
    range: "metod", key: "wall", label: "Wall cabinets",
    item_type: "wall_cabinet", depth_mm: 370, mount_height_mm: 1400,
    sizes: [
      [400, 400], [600, 400], [800, 400],
      [300, 600], [400, 600], [600, 600], [800, 600],
      [200, 800], [300, 800], [400, 800], [600, 800], [800, 800],
      [400, 1000], [600, 1000], [800, 1000],
    ],
  },
  {
    range: "metod", key: "high", label: "High cabinets",
    item_type: "tall_cabinet", depth_mm: 600, mount_height_mm: 0,
    // 2200 high is the deep frame only, and there is no 800 wide.
    sizes: [[400, 2000], [600, 2000], [400, 2200], [600, 2200]],
  },
  {
    range: "metod", key: "high_shallow", label: "High cabinets",
    item_type: "tall_cabinet", depth_mm: 370, mount_height_mm: 0,
    // The shallow frame stops at 2000, and it is the only tall one made 800 wide.
    sizes: [[400, 2000], [600, 2000], [800, 2000]],
  },
  {
    // A PAX IS SOLD AT ITS OVERALL HEIGHT, PLINTH INCLUDED.
    //
    // 2010 and 2360 are the frame standing on the floor, and the doors that go
    // on them are 1950 and 2290. What is left is the recessed base the frame
    // stands on: 60mm on the shorter frame, 70mm on the taller. Both numbers
    // are the audited catalogue subtracted from itself, not a guess. See the
    // door list in app/(site)/ikea-kaboodle/cabinet-data.js.
    //
    // Metod and Besta are the other way round. Their heights are the box alone,
    // standing on legs, which is why a Metod can take a kickboard of ours and a
    // Pax cannot: it already has one.
    range: "pax", key: "frame", label: "Wardrobe frames",
    item_type: "tall_cabinet", depth_mm: 580, mount_height_mm: 0,
    plinth_by_height: { 2010: 60, 2360: 70 },
    sizes: [[500, 2010], [750, 2010], [1000, 2010], [500, 2360], [750, 2360], [1000, 2360]],
  },
  {
    // Besta is hung on the wall as often as it stands on the floor, so it maps
    // to a wall cabinet: that is the one type whose "height off floor" is on
    // the panel, letting someone drop it to 0 for a floor-standing unit.
    range: "besta", key: "frame", label: "Frames",
    item_type: "wall_cabinet", depth_mm: 400, mount_height_mm: 300,
    sizes: [[600, 380], [600, 640], [1200, 380], [1200, 640], [600, 1280]],
  },
];

const RANGE_LABEL = Object.fromEntries(IKEA_RANGES.map((r) => [r.id, r.label]));

export function presetRef(range, groupKey, width, height) {
  return `ikea:${range}:${groupKey}:${width}x${height}`;
}

function presetFrom(group, width, height) {
  return {
    ref: presetRef(group.range, group.key, width, height),
    range: group.range,
    range_label: RANGE_LABEL[group.range] || "IKEA",
    group_label: group.label,
    item_type: group.item_type,
    width_mm: width,
    height_mm: height,
    depth_mm: group.depth_mm,
    mount_height_mm: group.mount_height_mm,
    // The part of this frame's height that is its own plinth. 0 for a frame
    // that stands on legs, which is most of them.
    plinth_mm: group.plinth_by_height?.[height] || 0,
    // What the customer sees on the item and in the panel header.
    label: `${RANGE_LABEL[group.range] || "IKEA"} ${height} × ${width}`,
  };
}

// Every preset for one range, kept in its groups so the rail can head them
// "Base cabinets", "Wall cabinets" and so on.
export function ikeaGroupsForRange(rangeId) {
  return GROUPS.filter((g) => g.range === rangeId).map((g) => ({
    key: g.key,
    label: g.label,
    presets: g.sizes.map(([w, h]) => presetFrom(g, w, h)),
  }));
}

// A ref back to its preset, or null. The server resolves the ref itself rather
// than trusting sizes sent by the browser, so a locked size is actually locked
// and not merely greyed out on screen.
export function resolveIkeaPreset(ref) {
  if (typeof ref !== "string") return null;
  const parts = ref.split(":");
  if (parts.length !== 4 || parts[0] !== "ikea") return null;
  const [, range, key, size] = parts;
  const group = GROUPS.find((g) => g.range === range && g.key === key);
  if (!group) return null;
  const [w, h] = size.split("x").map((n) => parseInt(n, 10));
  if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
  if (!group.sizes.some(([gw, gh]) => gw === w && gh === h)) return null;
  return presetFrom(group, w, h);
}

export function isIkeaPreset(item) {
  return Boolean(item && typeof item.preset_ref === "string" && item.preset_ref.startsWith("ikea:"));
}

// ── kickboards on IKEA cabinets ──────────────────────────────────────────────
//
// IKEA cabinets come with their own plinth, so a prop must never arrive with
// one of ours already ticked. A customer who added a Pax wardrobe was getting a
// kickboard on their quote that they neither asked for nor need, with no colour
// on it because a prop has no board spec of its own.
//
// Metod is the exception: a Metod kitchen sits on adjustable legs and people do
// front them with a matching kickboard, so the toggle stays available there. It
// is off until someone turns it on. Pax and Besta do not offer it at all.
//
// One definition, because four places have to agree: the toggle in the config
// panel, the parts a customer can pick, the lines a request is built from, and
// the cut list.

export function ikeaRangeOf(item) {
  if (!isIkeaPreset(item)) return "";
  return String(item.preset_ref).split(":")[1] || "";
}

// Which IKEA ranges we will front with a kickboard of ours.
const KICKBOARD_RANGES = ["metod"];

// True for everything we build ourselves. For a prop, true only for Metod.
export function kickboardAllowedFor(item) {
  if (!isIkeaPreset(item)) return true;
  return KICKBOARD_RANGES.includes(ikeaRangeOf(item));
}

/**
 * How much of this item's height is a plinth the frame already has.
 *
 * Drawing only, and never a board on a cut list: it is IKEA's base, not one of
 * ours. The views use it to stop the fronts short of the floor, which is what a
 * real Pax looks like, and it is why kickboardAllowedFor says no to one here.
 */
export function builtInPlinthMm(item) {
  return resolveIkeaPreset(item?.preset_ref)?.plinth_mm || 0;
}

// What a Metod kickboard is made of when it is switched on.
//
// A prop has no board spec of its own, so without this the kickboard reaches
// the quote with no material and no colour, which is the "not chosen yet" a
// customer cannot fix from anywhere on the page. Carcass white 16mm is the
// board we would cut it from anyway, and it is a real colour library row
// ('decorative board', '16mm', 'Matt', 'Carcass' — see
// supabase/import_polytec_colour_library.sql), not an invented name.
//
// It is a DEFAULT, not a lock: the colour control on the kickboard stays live.
export const METOD_KICKBOARD_STYLE = {
  material: "decorative board",
  thickness_mm: 16,
  finish: "Matt",
  colour: "Carcass",
};

// The patch that turns a kickboard on, so every caller sets the same fields.
export function kickboardOnPatch(item) {
  const patch = { has_kickboard: true };
  if (!isIkeaPreset(item)) return patch;
  return {
    ...patch,
    kickboard_thickness_mm: METOD_KICKBOARD_STYLE.thickness_mm,
    kickboard_style: { ...METOD_KICKBOARD_STYLE },
  };
}
