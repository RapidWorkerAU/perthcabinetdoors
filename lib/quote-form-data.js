import {
  PRODUCT_TYPES as CANONICAL_PRODUCT_TYPES,
  MATERIAL_LABELS,
  THICKNESS_BY_LABEL,
  materialKeyFromLabel,
} from "./pcd-materials";

// Re-derived from lib/pcd-materials.js — the single source of truth — so the
// design tool, quote editor, colour library and importer can't drift apart.
// Runtime values are identical to the previous hard-coded ones.
export const PRODUCT_TYPES = CANONICAL_PRODUCT_TYPES;

export const MATERIAL_OPTIONS = MATERIAL_LABELS;

export const THICKNESS_BY_MATERIAL = THICKNESS_BY_LABEL;

export const MATERIALS_BY_TYPE = Object.fromEntries(
  // Hardware (runners/handles/hinges) has no board material, so its material
  // dropdown is empty rather than offering Decorative Board / Thermolaminate.
  PRODUCT_TYPES.map((type) => [type, type === "Hardware" ? [] : MATERIAL_OPTIONS])
);

export const CABINET_BRANDS = [
  "IKEA Metod",
  "IKEA Besta",
  "IKEA Pax",
  "Kaboodle",
  "Custom carcass",
  "Not sure",
  "Not applicable",
];

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

export function isProfileSelectionAvailable(profileType, profile, material, thickness) {
  if (!profileType) return true;
  const profileTypes = profileTypesForSelection(material, thickness);
  if (!profileTypes.includes(profileType)) return false;
  if (!profile) return true;
  return profileNamesForSelection(profileType, material, thickness).includes(profile);
}
