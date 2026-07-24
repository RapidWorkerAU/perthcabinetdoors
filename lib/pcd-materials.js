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
