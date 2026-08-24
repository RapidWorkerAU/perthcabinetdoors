// Who supplies a line, in one place.
//
// WHY THIS EXISTS. The order screen showed a supplier against every supplier
// made row and the printed production sheet showed a dash against the same row.
// Neither was lying: the screen was WORKING ONE OUT from the colour, because a
// board's brand follows from the colour in the library, and the sheet had no
// idea that was happening. So the person planning the job saw "Polytec" and the
// person unloading the delivery saw nothing.
//
// A value a screen works out and never stores is a value nothing else can see.
// It is now worked out here, and the screen, the sheet and anything else read
// the same answer from the same function.
//
// Framework free and pure so a React table and a PDF generator can share it.

const clean = (value) => String(value ?? "").trim();

/** How a colour is keyed when looking a brand up. Spacing and case ignored. */
export function supplierLookupKey(value) {
  return clean(value).toLowerCase().replace(/\s+/g, " ");
}

/**
 * A brand for every way a colour might be written down.
 *
 * The colour library knows "Classic White" is Polytec. A line writes its board
 * as some combination of material, thickness, finish and colour, and which
 * combination depends on where the line came from, so every combination is
 * tried rather than guessing which one this line used.
 */
function lookupValues(item = {}) {
  const { colour, finish, thickness, material } = item;
  return [
    colour,
    finish,
    thickness,
    material,
    [finish, colour],
    [material, thickness],
    [material, finish],
    [material, colour],
    [material, thickness, finish],
    [material, thickness, colour],
    [material, finish, colour],
    [material, thickness, finish, colour],
  ]
    .map((value) => (Array.isArray(value) ? value.filter(Boolean).join(" - ") : value))
    .map(clean)
    .filter(Boolean);
}

/**
 * The brand behind a line's board, worked out from the colour library.
 *
 * Returns "" when nothing matches, which is a real answer: some lines are
 * hardware, and a hardware line has no board and therefore no board brand.
 */
export function supplierFromColour(item, colourSupplierMap = {}) {
  const values = lookupValues(item);

  for (const value of values) {
    const supplier = colourSupplierMap[supplierLookupKey(value)];
    if (supplier) return supplier;
  }

  // Nothing matched outright. A colour written "Classic White 18mm" against a
  // library key of "classic white" still means the same board, so the last pass
  // accepts one string containing the other. Keys of two characters or fewer
  // are left out: "18" would otherwise match half the library.
  const normalised = values.map(supplierLookupKey).filter(Boolean);
  const entries = Object.entries(colourSupplierMap).filter(([key]) => key.length > 2);
  for (const value of normalised) {
    const match = entries.find(([key]) => value.includes(key) || key.includes(value));
    if (match?.[1]) return match[1];
  }

  return "";
}

/**
 * Who supplies this panel, in the order the answers are trusted.
 *
 *   1. What somebody typed against this panel. A decision beats a derivation.
 *   2. What the quote recorded against the line, which is the brand of board.
 *   3. What the colour says the brand must be.
 *
 * `plan` is the panel plan; pass nothing for a line with no panels.
 */
export function supplierForLine(item = {}, plan = {}, colourSupplierMap = {}) {
  return (
    clean(plan?.supplier_name) ||
    clean(item?.supplier_name) ||
    supplierFromColour(item, colourSupplierMap) ||
    ""
  );
}

/**
 * The colour to brand map, from colour library rows.
 *
 * Keyed every way a line might name the same board, for the same reason
 * lookupValues tries every combination.
 */
export function buildColourSupplierMap(rows = []) {
  const map = {};
  const add = (value, supplier) => {
    const key = supplierLookupKey(value);
    if (!key || !supplier || map[key]) return;
    map[key] = supplier;
  };

  for (const row of rows) {
    const supplier = clean(row?.supplier_name);
    if (!supplier) continue;
    const { name, material_type: material, thickness, finish_type: finish } = row;
    add(name, supplier);
    add([finish, name].filter(Boolean).join(" - "), supplier);
    add([material, name].filter(Boolean).join(" - "), supplier);
    add([material, thickness, finish, name].filter(Boolean).join(" - "), supplier);
    add([material, finish, name].filter(Boolean).join(" - "), supplier);
  }

  return map;
}
