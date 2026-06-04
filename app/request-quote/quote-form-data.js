import { colourGroupsForMaterial } from "../products/product-data";

export const PRODUCT_TYPES = ["Door", "Drawer front", "Panel", "Table top"];

export const MATERIALS_BY_TYPE = {
  Door: ["Thermolaminate", "16mm Decorative Board", "18mm Decorative Board", "Compact Laminate"],
  "Drawer front": ["Thermolaminate", "16mm Decorative Board", "18mm Decorative Board", "Compact Laminate"],
  Panel: ["16mm Decorative Board", "18mm Decorative Board", "Compact Laminate"],
  "Table top": ["Compact Laminate", "18mm Decorative Board"],
};

export const CABINET_BRANDS = [
  "IKEA Metod",
  "IKEA Besta",
  "IKEA Pax",
  "Kaboodle",
  "Custom carcass",
  "Not sure",
  "Not applicable",
];

export const EDGE_PROFILES = [
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
  ],
};

export const PROFILE_TYPES = Object.keys(PROFILE_NAMES_BY_TYPE);

export function materialKey(material) {
  if (material === "Thermolaminate") return "thermolaminate";
  if (material === "Compact Laminate") return "compact";
  if (material === "16mm Decorative Board") return "16mm";
  if (material === "18mm Decorative Board") return "18mm";
  return "";
}

export function colourOptionsForMaterial(material) {
  const key = materialKey(material);
  if (!key) return [];

  const family = colourGroupsForMaterial(key);
  return family.groups.flatMap((group) =>
    group.colours.map((colour) => ({
      finish: group.label,
      name: colour.name,
      src: colour.src,
      label: `${group.label} - ${colour.name}`,
    }))
  );
}

