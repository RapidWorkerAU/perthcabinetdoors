import {
  PRODUCT_TYPES as CANONICAL_PRODUCT_TYPES,
  MATERIAL_LABELS,
  materialsForProductType,
  THICKNESS_BY_LABEL,
  materialKeyFromLabel,
} from "./pcd-materials";

// Re-derived from lib/pcd-materials.js — the single source of truth — so the
// design tool, quote editor, colour library and importer can't drift apart.
// Runtime values are identical to the previous hard-coded ones.
export const PRODUCT_TYPES = CANONICAL_PRODUCT_TYPES;

export const MATERIAL_OPTIONS = MATERIAL_LABELS;

export const THICKNESS_BY_MATERIAL = THICKNESS_BY_LABEL;

// Which materials each type may be made from. The rule lives beside the
// materials themselves in pcd-materials.js so every screen reads the same one.
export const MATERIALS_BY_TYPE = Object.fromEntries(
  PRODUCT_TYPES.map((type) => [type, materialsForProductType(type)])
);

// WHOSE CABINET THE FRONT IS GOING ON.
//
// Asked per LINE, not per job: a kitchen is routinely Metod fronts with a
// custom panel closing the end of a run, and one answer for the whole job
// cannot say that. The job level answer on a quote request stays as the
// default a new line starts from, so nobody answers it eleven times.
//
// Naming the IKEA range in the answer is what removes the need for a second
// "which range" column. "IKEA Metod" already says both.
//
// "Not sure" WAS on this list and has been taken off. It was the joint second
// most common answer on the requests we have, so the rows that already say it
// are left exactly as they are: that is what the customer told us, and
// rewriting it to "Not applicable" would put words in their mouth. A stored
// value that is no longer offered is shown as it is rather than blanked.
export const CABINET_BRANDS = [
  "IKEA Metod",
  "IKEA Besta",
  "IKEA Pax",
  "Kaboodle",
  "Custom panel",
  "Custom carcass",
  "Not applicable",
];

/**
 * The list to show for a line, with whatever it already holds kept on it.
 *
 * A line saved when "Not sure" was offered still says "Not sure", and a
 * dropdown that silently drops it would show a blank where an answer is, and
 * save that blank the next time anybody touched the line.
 */
export function cabinetBrandOptions(current) {
  const value = String(current || "").trim();
  if (!value || CABINET_BRANDS.includes(value)) return CABINET_BRANDS;
  return [...CABINET_BRANDS, value];
}

export const THERMOLAMINATE_EDGE_PROFILES = [
  "EM0 Square",
  "EM1 6mm Pencil Round",
  "EM12 Small Chamfer",
  "EM2 Thumb Mould",
  "EM3 Large Bevel",
  "EM4 Step Pencil Round",
  "EM5 Step Bevel",
  "EM6 Roman",
  "EM7 Small Bevel",
  "EM8 Softline",
  "EM9 3mm Pencil Round",
];

export const DECORATIVE_BOARD_EDGE_PROFILES = [
  "1mm Square Edge",
  "1mm Bevel Edge",
];

export const EDGE_PROFILES = THERMOLAMINATE_EDGE_PROFILES;

export function edgeProfilesForMaterial(material) {
  if (material === "Decorative Board") return DECORATIVE_BOARD_EDGE_PROFILES;
  if (material === "Thermolaminate") return THERMOLAMINATE_EDGE_PROFILES;
  return [];
}

export function isEdgeProfileSelectionAvailable(edgeProfile, material) {
  if (!edgeProfile) return true;
  return edgeProfilesForMaterial(material).includes(edgeProfile);
}

export const PROFILE_NAMES_BY_TYPE = {
  Minimal: [
    "Brussels",
    "Guilford",
    "Hamilton",
    "Kiama",
    "Kunda",
    "Manchester",
    "Munich",
    "Napoli",
    "Paterson",
    "Sanda",
    "Softline",
    "Vienna",
  ],
  Soft: [
    "Albury",
    "Auckland",
    "Bathurst",
    "Bega",
    "Bendigo",
    "Calcutta",
    "Cleveland",
    "Cooma",
    "Croydon",
    "Dorrigo",
    "Hanoi",
    "Lithgow",
    "Longreach",
    "Madrid",
    "Maroochydore",
    "Mildura",
    "Molong",
    "Mona Vale",
    "Monterey",
    "Mudgee",
    "Parkes",
    "Portsea",
    "Preston",
    "Swan",
    "Teralba",
    "Torino",
    "Wellington",
    "Yass",
  ],
  Sharp: [
    "Amsterdam",
    "Argentina",
    "Atlanta",
    "Bali",
    "Bari",
    "Beirut",
    "Broadway",
    "Calcutta 35",
    "Cambridge",
    "Carlton",
    "Chesterfield",
    "Christchurch",
    "Colombo",
    "Copenhagen",
    "Dublin",
    "Edinburgh",
    "Leon",
    "Lima",
    "Prague",
    "Rio",
    "Seoul",
    "Tokyo",
    "Valencia",
    "Washington",
  ],
  Detailed: [
    "Ascot",
    "Ballarat",
    "Bayswater",
    "Berrilee",
    "Berrima",
    "Bowral",
    "Broome",
    "Calcutta 10",
    "Calcutta 25",
    "Cammeray",
    "Casino",
    "Chifley",
    "Classic Square",
    "Country Square",
    "Dural",
    "Farmhouse",
    "Farnborough",
    "Federation",
    "Gerroa",
    "Grafton",
    "Hampton",
    "Jersey",
    "Lismore",
    "Macquarie",
    "Mallee",
    "Manhattan",
    "Oberon",
    "Patonga",
    "Stratford",
    "Sussex",
    "Tamworth",
    "Valla",
    "Woongarrah",
    "Allandale",
    "Branxton",
    "Briar",
    "Chiswick 12",
    "Chiswick 6",
    "Hampshire",
    "Keimbah",
    "Malabar",
    "Pokolbin",
    "Rothbury",
  ],
  Fluted: [
    "Cove 25",
    "Cove 50",
    "Peak",
  ],
};

export const PROFILE_TYPES = Object.keys(PROFILE_NAMES_BY_TYPE);

export const PROFILE_21MM_ONLY_BY_TYPE = {
  Detailed: [
    "Allandale",
    "Branxton",
    "Briar",
    "Chiswick 12",
    "Chiswick 6",
    "Hampshire",
    "Keimbah",
    "Malabar",
    "Pokolbin",
    "Rothbury",
  ],
  Fluted: [
    "Cove 25",
    "Cove 50",
    "Peak",
  ],
};

export function materialKey(material) {
  return materialKeyFromLabel(material);
}

export function thicknessOptionsForMaterial(material) {
  return THICKNESS_BY_MATERIAL[material] || [];
}

export function profileTypesForSelection(material, thickness) {
  if (material !== "Thermolaminate") return [];
  if (thickness === "21mm") return PROFILE_TYPES;
  return PROFILE_TYPES.filter((profileType) => profileType !== "Fluted");
}

export function profileNamesForSelection(profileType, material, thickness) {
  const names = PROFILE_NAMES_BY_TYPE[profileType] || [];
  if (material !== "Thermolaminate") return [];
  if (thickness === "21mm") return names;
  const restrictedNames = new Set(PROFILE_21MM_ONLY_BY_TYPE[profileType] || []);
  return names.filter((name) => !restrictedNames.has(name));
}

/**
 * WHICH PROFILE ANSWERS A SAVED LINE KEEPS.
 *
 * The lists above are Polytec's catalogue, written in by hand. The pickers do
 * not read them any more: every screen offers profiles from the profile library,
 * which holds Laminex too. So checking a saved line against these lists alone
 * threw away every Laminex profile anybody picked, on the website and in the
 * quote editor, silently, on every save.
 *
 * So this only refuses what it KNOWS is wrong: a profile on a board that is not
 * thermolaminate, or a Polytec profile at a thickness Polytec does not press it
 * in. A name these lists have never heard of is one the profile library offered,
 * and it is kept.
 */
const POLYTEC_PROFILE_NAMES = new Set(Object.values(PROFILE_NAMES_BY_TYPE).flat());

export function savedProfileChecks({ profileType = "", profile = "", material = "", thickness = "", supplier = "" } = {}) {
  const thermo = String(material || "").trim().toLowerCase() === "thermolaminate";
  const supplierKey = String(supplier || "").trim().toLowerCase();
  // A blank supplier is an older line, from before the brand was recorded, and
  // every profile we sold then was Polytec's.
  const polytec = !supplierKey || supplierKey === "polytec";
  const typeKnown = polytec && PROFILE_TYPES.includes(profileType);
  const nameKnown = polytec && POLYTEC_PROFILE_NAMES.has(profile);

  const typeOk = !profileType || (thermo && (!typeKnown || profileTypesForSelection("Thermolaminate", thickness).includes(profileType)));
  const nameOk = !profile || (typeOk && thermo && (!nameKnown || !typeKnown || profileNamesForSelection(profileType, "Thermolaminate", thickness).includes(profile)));
  return { typeOk, nameOk };
}

export function isProfileSelectionAvailable(profileType, profile, material, thickness) {
  if (!profileType) return true;
  const profileTypes = profileTypesForSelection(material, thickness);
  if (!profileTypes.includes(profileType)) return false;
  if (!profile) return true;
  return profileNamesForSelection(profileType, material, thickness).includes(profile);
}
