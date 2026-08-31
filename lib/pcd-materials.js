// Single source of truth for board materials — their naming representations and
// their thickness options — plus the quote product types.
//
// Historically each system kept its own copy and they drifted:
//   - the design tool stores the lowercase value        ("thermolaminate")
//   - the quote editor / quote line uses the Title label ("Thermolaminate")
//   - the colour library keys by slug                    ("thermolaminate")
//   - the catalogue product filter uses its own values   ("18mm", "compact")
// and the thickness list lived in two files keyed two different ways. Adding a
// material or a thickness meant editing several places or it silently failed to
// match, and the design→quote importer had to patch between them at one fragile
// choke-point. Everything now derives from MATERIALS here, so a change in one
// place reaches the design tool, the quote editor, the colour library and the
// importer together.
//
// Each material record:
//   key         canonical slug — how the colour library keys it
//   label       Title-Case — the quote line value + display text
//   design      lowercase — what the design tool stores on an item
//   thicknesses "18mm"-style options offered for this material
//   aliases     other stored spellings that should resolve here (e.g. the
//               catalogue's "18mm" / "compact"), so cross-system values match

export const MATERIALS = [
  {
    key: "decorative_board",
    label: "Decorative Board",
    design: "decorative board",
    thicknesses: ["16mm", "18mm"],
    aliases: ["16mm", "18mm", "16", "18"],
  },
  {
    key: "thermolaminate",
    label: "Thermolaminate",
    design: "thermolaminate",
    thicknesses: ["18mm", "21mm"],
    aliases: [],
  },
  {
    key: "compact_laminate",
    label: "Compact Laminate",
    design: "compact laminate",
    thicknesses: ["13mm", "5mm", "18mm"],
    aliases: ["compact"],
  },
];

// Quote line product types (kept here so the material/type vocabulary lives in
// one module). The design→quote importer maps design item types onto these.
// "Hardware" (audit p2-3) covers runners / handles / hinges as priced lines —
// it carries no board material (see MATERIALS_BY_TYPE), just a unit cost.
export const PRODUCT_TYPES = ["Door", "Drawer front", "Panel", "Table top", "Hardware"];

/**
 * The board materials each product type may be made from.
 *
 * A type that is not listed here gets every material. Listing one is how you
 * say "not all of them", and the two that say it are:
 *
 *   Hardware   No board at all. A handle or a runner is bought, not pressed,
 *              so it carries a unit cost and nothing else.
 *
 *   Table top  No Thermolaminate. It is a vinyl skin pressed over a routed
 *              face, made for a door front. As a work surface it will not
 *              take heat, moisture or wear, so it is not offered rather than
 *              offered and regretted.
 */
export const MATERIALS_ALLOWED_BY_TYPE = {
  Hardware: [],
  "Table top": ["Decorative Board", "Compact Laminate"],
};

// WHAT A CUSTOMER IS BUYING, said the way a customer says it, and the board
// materials each one can actually be made from.
//
// PRODUCT_TYPES above is our internal vocabulary. This is the same fact for the
// public finishes page, plus the one split the internal list does not carry: a
// front is either routed with a profile or it is flat, and only Thermolaminate
// can be routed. That split is what people were getting wrong. They read the
// colour library, found a colour we only press as decorative board, and asked
// for it as a profiled door.
//
// The materials are worked out from MATERIALS_ALLOWED_BY_TYPE rather than
// written again here, so adding a material, or changing what a type may be made
// from, reaches this list too.
export const PROFILED_FRONT_MATERIAL_KEY = "thermolaminate";

export const PUBLIC_PRODUCT_TYPES = [
  {
    id: "profiled-fronts",
    label: "Profiled doors and drawer fronts",
    productTypes: ["Door", "Drawer front"],
    profiled: true,
    note: "A routed profile is pressed into a vinyl wrapped front, so profiled doors and drawer fronts are thermolaminate only. A colour we supply as decorative board alone cannot be made as a profiled front.",
  },
  {
    id: "flat-fronts",
    label: "Flat doors and drawer fronts",
    productTypes: ["Door", "Drawer front"],
    profiled: false,
    note: "Flat doors and drawer fronts are made in either decorative board or thermolaminate, so the whole colour range is open to you.",
  },
  {
    id: "panels",
    label: "Panels",
    productTypes: ["Panel"],
    profiled: false,
    note: "End panels, fillers and kickboards are made in either decorative board or thermolaminate, so a panel can be matched to either kind of front.",
  },
  {
    id: "table-tops",
    label: "Table tops",
    productTypes: ["Table top"],
    profiled: false,
    note: "Table tops are made in decorative board. Compact laminate tops are available as well and are quoted on request rather than listed here.",
  },
];

/**
 * The material keys one public product type can be made from.
 *
 * An id we do not know returns every material rather than none, so a stale link
 * such as /finishes?product=old-value shows the library instead of an empty
 * page.
 */
export function materialKeysForPublicProductType(id) {
  const entry = PUBLIC_PRODUCT_TYPES.find((type) => type.id === id);
  if (!entry) return MATERIAL_KEYS;
  const keys = new Set();
  entry.productTypes.forEach((type) => {
    materialsForProductType(type).forEach((label) => {
      const key = materialKeyFromLabel(label);
      if (key) keys.add(key);
    });
  });
  if (entry.profiled) return [...keys].filter((key) => key === PROFILED_FRONT_MATERIAL_KEY);
  return [...keys];
}

/** The public product type record for an id, or null when it is not one of ours. */
export function publicProductType(id) {
  return PUBLIC_PRODUCT_TYPES.find((type) => type.id === id) || null;
}

/** The public product types something made of `materialKeys` can be supplied as. */
export function publicProductTypesForMaterials(materialKeys = []) {
  const held = [...new Set(materialKeys.filter(Boolean))];
  return PUBLIC_PRODUCT_TYPES.filter((type) =>
    materialKeysForPublicProductType(type.id).some((key) => held.includes(key))
  );
}

/** The materials this type may use, every material when it is unrestricted. */
export function materialsForProductType(productType) {
  const allowed = MATERIALS_ALLOWED_BY_TYPE[productType];
  if (!allowed) return MATERIAL_LABELS;
  // Filtered against MATERIAL_LABELS rather than returned as written, so a
  // material renamed above cannot leave a name here pointing at nothing.
  return MATERIAL_LABELS.filter((label) => allowed.includes(label));
}

// Derived lists / maps — every existing export in quote-form-data.js and
// pcd-colour-library.js is rebuilt from these so their runtime values are
// byte-identical to before.
export const MATERIAL_LABELS = MATERIALS.map((m) => m.label);
export const MATERIAL_KEYS = MATERIALS.map((m) => m.key);
export const THICKNESS_BY_LABEL = Object.fromEntries(MATERIALS.map((m) => [m.label, m.thicknesses]));
export const THICKNESS_BY_DESIGN = Object.fromEntries(MATERIALS.map((m) => [m.design, m.thicknesses]));

function byKey(key) {
  return MATERIALS.find((m) => m.key === key) || null;
}

// Resolve any representation (slug / label / design value / catalogue alias) to
// its canonical key. Preserves the exact behaviour of the colour library's old
// normaliseColourMaterialKey: substring match on decorative/thermolaminate/
// compact, with "16"/"18" treated as decorative board, and the lowercased input
// returned unchanged when nothing matches.
export function normaliseMaterialKey(material) {
  const value = String(material || "").toLowerCase();
  const exact = MATERIALS.find(
    (m) => m.key === value || m.label.toLowerCase() === value || m.design === value || m.aliases.includes(value)
  );
  if (exact) return exact.key;
  if (value.includes("decorative") || value.includes("16") || value.includes("18")) return "decorative_board";
  if (value.includes("thermolaminate")) return "thermolaminate";
  if (value.includes("compact")) return "compact_laminate";
  return value || "";
}

// Exact Title-label → key only (returns "" for anything else), preserving the
// old quote-form-data materialKey() behaviour.
export function materialKeyFromLabel(label) {
  return MATERIALS.find((m) => m.label === label)?.key || "";
}

export function materialLabelForKey(key) {
  return byKey(key)?.label || "";
}

export function materialDesignForKey(key) {
  return byKey(key)?.design || "";
}
