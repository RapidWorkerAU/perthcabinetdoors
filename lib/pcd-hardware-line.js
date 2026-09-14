// A HARDWARE LINE, FILLED FROM THE CATALOGUE ROW IT NAMES.
//
// Picking a hinge in the quote editor fills the line from the catalogue: the
// price, the kind, the description, the size. A hinge a customer picked on the
// website converted with its NAME and nothing else, so it landed on the quote
// at no price, with nothing to look the price up by, and it was not on the list
// of lines with no price either because a hardware line was never priced here
// at all. One definition now, used by both.
//
// Pure, so the conversion can be tested without a database.

const text = (value) => String(value ?? "").trim();

/** How the quote editor names a catalogue row: brand, name and SKU. */
export function hardwareOptionLabel(item = {}) {
  return [item.brand, item.name, item.sku ? `(${item.sku})` : ""].filter(Boolean).join(" ");
}

/** How the website names one: brand and name, no SKU. */
export function hardwareWebsiteLabel(item = {}) {
  return [item.brand, item.name].filter(Boolean).join(" ");
}

/** Everything a catalogue row decides about the line it is picked for. */
export function hardwareLinePatch(item = {}) {
  const label = hardwareOptionLabel(item);
  return {
    product_type: "Hardware",
    // WHICH KIND, carried onto the line rather than left in the catalogue.
    // Without it the quote viewer can only say the bare word "Hardware".
    hardware_type: item.type || "",
    product_name: label,
    description: item.description || label,
    material: "",
    supplier_name: "",
    thickness: "",
    finish: "",
    colour: "",
    edge_mould: "",
    profile_type: "",
    profile: "",
    width_mm: item.width_mm || item.length_mm || "",
    height_mm: item.height_mm || item.projection_mm || "",
    product_unit_cost_ex_gst: Number(item.unit_cost_ex_gst || 0),
    unit_cost_mode: "manual",
    unit_cost_source_id: item.id,
    unit_cost_source_label: label,
    unit_cost_per_sqm_ex_gst: 0,
    calculated_unit_cost_ex_gst: 0,
  };
}

/**
 * Find the catalogue row a request line meant.
 *
 * By the id the customer actually picked. A request saved before the id was
 * kept is matched by the name the website showed them, which is brand and name,
 * and only when exactly one row carries it: two rows with one name is a guess,
 * and a guessed price is worse than an honest blank.
 */
export function createHardwareResolver(rows = []) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const byName = new Map();
  for (const row of rows) {
    for (const name of new Set([hardwareWebsiteLabel(row), hardwareOptionLabel(row)])) {
      const key = text(name).toLowerCase();
      if (!key) continue;
      byName.set(key, byName.has(key) ? null : row);
    }
  }
  return ({ id, name } = {}) => {
    if (id && byId.has(id)) return byId.get(id);
    const key = text(name).toLowerCase();
    return (key && byName.get(key)) || null;
  };
}
