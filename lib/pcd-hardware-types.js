// WHAT A PIECE OF HARDWARE IS.
//
// One definition. There were four: the hardware manager's dropdown, the quote
// editor's label map, the variation editor's identical label map, and the API
// route's allowlist of what may be saved. Four copies of the same nine words,
// which meant a tenth kind of hardware had to be added in four places or it
// would save and then display as the bare word "Hardware".
//
// The order form's hardware tab would have been the fifth, and a form that
// offered a type the API refuses is a form that loses a line on upload.

// ── WHICH KINDS GO IN A CABINET ON THEIR OWN ─────────────────────────────────
//
// `fitsInCabinet` marks the kinds that are fitted INTO a cabinet as a thing in
// their own right: a hanging rail, a slide out bin, a light. Those are what the
// design tool's Accessories section offers.
//
// Everything else belongs to a door or a drawer and is asked where that is
// asked, so it is never offered twice: a handle and a hinge are chosen on the
// cabinet's Hardware section, runners and push to open belong to the drawer or
// door they are fitted to, and a cutlery tray is part of a drawer. Decided
// 13 September 2026.
export const HARDWARE_TYPES = [
  { value: "handle", label: "Handle", fitsInCabinet: false },
  { value: "hinge", label: "Hinge", fitsInCabinet: false },
  { value: "drawer_runner", label: "Drawer runner", fitsInCabinet: false },
  { value: "push_to_open", label: "Push-to-Open", fitsInCabinet: false },
  { value: "cutlery_tray", label: "Cutlery Tray", fitsInCabinet: false },
  { value: "wardrobe_hanging_rail", label: "Wardrobe Hanging Rail", fitsInCabinet: true },
  { value: "slide_out_bin", label: "Slide Out Bin", fitsInCabinet: true },
  { value: "bi_fold_door", label: "Bi-fold Door", fitsInCabinet: false },
  { value: "cabinet_inserts", label: "Cabinet Inserts", fitsInCabinet: true },
  // Fitted on runners at a height inside a wardrobe, so it is its own kind
  // rather than an insert. Added 13 September 2026 with
  // supabase/202609131500_pcd_hardware_shoe_rail.sql, which holds the same list.
  { value: "pull_out_shoe_rail", label: "Pull Out Shoe Rail", fitsInCabinet: true },
  // A frame of arms you lay trousers over, on runners at a height. Added with
  // supabase/202609131600_pcd_hardware_trouser_rack.sql, which holds the same
  // list.
  { value: "pull_out_trouser_rack", label: "Pull Out Trouser Rack", fitsInCabinet: true },
];

/** The stored values, for anywhere that only needs to know what is allowed. */
export const HARDWARE_TYPE_VALUES = HARDWARE_TYPES.map((type) => type.value);

/** The kinds the design tool offers as a cabinet accessory. */
export const ACCESSORY_TYPES = HARDWARE_TYPES.filter((type) => type.fitsInCabinet);

export const ACCESSORY_TYPE_VALUES = ACCESSORY_TYPES.map((type) => type.value);

/** Can this kind be fitted into a cabinet on its own? */
export function isAccessoryType(value) {
  return ACCESSORY_TYPE_VALUES.includes(String(value || ""));
}

/**
 * A stored type in words.
 *
 * "Hardware" for anything unrecognised, which is what a row saved before its
 * type was retired reads as, rather than an empty cell.
 */
export function hardwareTypeLabel(value) {
  const found = HARDWARE_TYPES.find((type) => type.value === value);
  return found ? found.label : "Hardware";
}

/** A label back to the value behind it, or "" for one we do not offer. */
export function hardwareTypeFromLabel(label) {
  const wanted = String(label || "").trim().toLowerCase();
  if (!wanted) return "";
  const found = HARDWARE_TYPES.find((type) => type.label.toLowerCase() === wanted);
  return found ? found.value : "";
}

// WHO MAKES IT. A vocabulary rather than a text box, for the same reason the
// board finishes are: typed by hand, "Hafele" and "Häfele" and "HAFELE" are
// three brands to a database and one brand to a person, and the filters,
// groupings and supplier reports then disagree with each other.
//
// Seeded from what the hardware table actually holds. Anything else is added
// through Settings, Lists or the Add new box on the hardware itself.
export const HARDWARE_BRANDS = ["Blum", "Finista", "Hafele", "Galvins"];

/**
 * THE SIZE OF A PIECE OF HARDWARE, AS ONE SHORT LINE.
 *
 * For picking the right one out of a list. Two drawer runners that read
 * "TANDEMBOX antaro" and "LEGRABOX Drawer Kit C" are two names; the same two
 * reading "450mm" and "400 x 177mm" are two things you can tell apart without
 * opening the library, and the length is the number that decides whether a
 * runner fits the cabinet at all.
 *
 * ONLY WHAT THE ROW ACTUALLY HOLDS. Every dimension on pcd_hardware is
 * nullable and most rows fill in one or two, so this prints the ones that are
 * there and says nothing about the rest. A row with no sizes returns an empty
 * string, and the caller shows the name alone rather than "0 x 0mm".
 *
 * Length first, because on a runner that is the nominal length, the figure
 * everything is chosen by.
 */
export function hardwareSizeLabel(row = {}) {
  const mm = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  };

  const length = mm(row.length_mm);
  const height = mm(row.height_mm);
  const width = mm(row.width_mm);
  const depth = mm(row.depth_mm);

  const parts = [];
  if (length) parts.push(`${length}mm long`);
  // Height and width read as a pair when both are there, because that is how a
  // person says the size of a face: "400 x 177".
  if (height && width) parts.push(`${height} x ${width}mm`);
  else if (height) parts.push(`${height}mm high`);
  else if (width) parts.push(`${width}mm wide`);
  if (depth) parts.push(`${depth}mm deep`);

  return parts.join(", ");
}

/**
 * The one line a picker shows under a hardware item: its size, its brand and
 * what it costs, in that order, skipping whatever is missing.
 */
export function hardwareMetaLabel(row = {}) {
  const size = hardwareSizeLabel(row);
  const cost = Number(row.unit_cost_ex_gst);
  return [
    size,
    String(row.brand || "").trim(),
    Number.isFinite(cost) && cost > 0 ? `$${cost.toFixed(2)} ea ex GST` : "",
  ]
    .filter(Boolean)
    .join("  ·  ");
}
