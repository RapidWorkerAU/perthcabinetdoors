// Carcass finishes for props the customer already owns (IKEA).
//
// Visual only. This exists so someone recognises the cabinet standing in their
// own kitchen: a dark grey Pax should look dark grey on screen. Nothing here is
// a product. It has no link to pcd_colour_library, it is never priced, and it
// never reaches a quote.
//
// Stored on the item as prop_carcass_finish, which is deliberately separate
// from the material / finish / colour columns. Kickboards, back panels and
// fillers inherit the carcass colour when they have no override of their own,
// and those are pieces we actually make, so an IKEA finish must never be able
// to become one of them.

const SWATCH_DIR = "/images/ikea/carcass";

// ─────────────────────────────────────────────────────────────────────────────
// EVERY ENTRY BELOW MUST HAVE ITS FILE IN public/images/ikea/carcass/
//
// The 3D view loads these as textures. A named file that is not there leaves
// that surface waiting on an image which never arrives, so adding a finish here
// without adding its image breaks the cabinet rather than just looking plain.
//
// `ranges` is which IKEA ranges actually sell a frame in that finish, so nobody
// paints a Metod kitchen in a colour Metod has never come in. `hex` is the flat
// fallback, painted behind the photo.
// ─────────────────────────────────────────────────────────────────────────────
export const IKEA_CARCASS_FINISHES = [
  {
    name: "White",
    hex: "#f0efe9",
    file: "white.png",
    ranges: ["metod", "pax", "besta"],
  },
  {
    name: "Dark grey",
    hex: "#6b6a67",
    file: "dark_grey.png",
    ranges: ["pax", "besta"],
  },
  {
    name: "Grey beige",
    hex: "#b6aea1",
    file: "grey_beige.png",
    // Pax only. Metod and Besta have never come in it.
    ranges: ["pax"],
  },
  {
    name: "White stained oak",
    hex: "#dcc7a8",
    file: "white_stained_oak.png",
    ranges: ["pax", "besta"],
  },
];

const BY_NAME = new Map(IKEA_CARCASS_FINISHES.map((f) => [f.name.toLowerCase(), f]));

export function ikeaCarcassFinish(name) {
  if (!name) return null;
  return BY_NAME.get(String(name).trim().toLowerCase()) || null;
}

// What a given range actually comes in. Metod is white only, so its picker is a
// single swatch rather than a choice that does not exist.
export function ikeaCarcassFinishesForRange(rangeId) {
  if (!rangeId) return IKEA_CARCASS_FINISHES;
  return IKEA_CARCASS_FINISHES.filter((f) => f.ranges.includes(rangeId));
}

// The finish a newly added prop starts in: the first one that range comes in,
// which is White everywhere. A display default so the box paints as a real
// cabinet straight away, not a guess about anything we would make.
export function defaultIkeaCarcassFinish(rangeId) {
  return ikeaCarcassFinishesForRange(rangeId)[0]?.name || "White";
}

// Flat colour for a finish, or "" if the name is not one of ours. Always safe
// to call, and always painted behind any photo.
export function ikeaCarcassHex(name) {
  return ikeaCarcassFinish(name)?.hex || "";
}

export function ikeaCarcassSrc(name) {
  const finish = ikeaCarcassFinish(name);
  return finish ? `${SWATCH_DIR}/${finish.file}` : "";
}
