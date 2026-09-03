// THE OPTION TREE BEHIND THE EXCEL ORDER FORM.
//
// WHY THIS EXISTS. Some customers will not use the website form. They send a
// list in an email or a Word document, and somebody here then has to work out
// what a line means, ring them about the half of it that is missing, and type
// it in. The Excel form is the same questions in a file they are willing to
// fill in, with the same answers to choose from.
//
// "The same answers" is the whole point, so nothing here invents a list.
//
//   types, materials, thicknesses   lib/pcd-materials.js
//   edge and door profiles          lib/quote-form-data.js, which is what the
//                                   website request form itself reads, so the
//                                   two cannot offer different things
//   colours                         the live colour library
//   standard IKEA and Kaboodle      app/(site)/ikea-kaboodle/cabinet-data.js
//   front sizes                     the audited catalogue, never worked out
//                                   from a frame size
//   hardware                        the live catalogue
//
// The one thing this module adds is the SHAPE the dropdowns need: Excel cannot
// filter a list the way a React select does, so every combination that can be
// arrived at gets its own list, and a lookup table maps a row's answers so far
// onto the name of the list the next column should offer.
//
// The colour chain is Brand, Type, Material, Thickness, Finish, Colour, and
// thickness sits in the middle of it on purpose. A colour library row is held
// per material, thickness, finish and colour, and only 104 of our colours are
// listed at more than one thickness. Offering the colours for a material
// without knowing the thickness would put a 16mm-only colour on an 18mm door
// most of the time.

import {
  PRODUCT_TYPES,
  MATERIAL_LABELS,
  THICKNESS_BY_LABEL,
  materialsForProductType,
  normaliseMaterialKey,
  materialLabelForKey,
} from "./pcd-materials";
import {
  CABINET_BRANDS,
  edgeProfilesForMaterial,
  profileTypesForSelection,
  profileNamesForSelection,
} from "./quote-form-data";
import { SYSTEMS, CABINETS } from "../app/(site)/ikea-kaboodle/cabinet-data";
import { HARDWARE_TYPES, hardwareTypeFromLabel } from "./pcd-hardware-types";
import { cabinetTypeOptions } from "./pcd-design-parts";
import {
  ROOM_AREAS,
  PANEL_USES,
  GRAIN_DIRECTIONS,
  EDGE_FINISHES,
  SUPPLIED_BY,
  EXISTING_HINGE_BRANDS,
  DOOR_OVERLAYS,
} from "./pcd-line-details";

// The cabinet the front is going on. ONE question, not two: "IKEA Metod"
// already names both the brand and the range, so there is nothing left for a
// second column to ask. It is the same list the website form and the quote
// editor offer, from lib/quote-form-data.js, so a form filled in here and a
// form filled in there give the same answer.
export const CABINET_OPTIONS = CABINET_BRANDS;

// Brand is a filter, not a question we make them answer. Somebody who knows
// they want Polytec can narrow the colour list to it; somebody who has only
// been given a colour name leaves this alone and sees everything. Kept first
// so the narrowing happens before the long lists, and given a name that reads
// as an opt-out rather than a blank.
export const ANY_BRAND = "Any / not sure";

/** Shown in a dropdown that has nothing to offer yet. */
export const CHOOSE_EARLIER_FIRST = "(fill in the columns to the left first)";

// The honest answer for most orders: a door we make to a size somebody measured
// is not for a kit carcass at all.
export const NOT_A_KIT_CABINET = "Not applicable";

const text = (value) => String(value ?? "").trim();

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/**
 * A colour library row reduced to what the form needs, with its material put
 * into the same words the rest of the form uses. The library stores the design
 * tool's lowercase value ("decorative board"); every dropdown on the form shows
 * the Title label ("Decorative Board"). Rows whose material does not resolve to
 * one we offer are dropped rather than shown under a heading nobody can pick.
 */
export function colourOptions(rows = []) {
  return rows
    .filter((row) => row.is_active !== false)
    .map((row) => ({
      name: text(row.name),
      brand: text(row.supplier_name),
      material: materialLabelForKey(normaliseMaterialKey(row.material_type)),
      thickness: text(row.thickness),
      finish: text(row.finish_type),
    }))
    .filter(
      (row) => row.name && row.material && row.thickness && row.finish && MATERIAL_LABELS.includes(row.material)
    );
}

/** A catalogue row named the way the catalogue names it, brand and all. */
function catalogueName(row) {
  return [text(row.brand), text(row.name)].filter(Boolean).join(" ");
}

/** The hinges we stock, for the line that says who is supplying them. */
export function hingeOptions(hardware = []) {
  return hardware
    .filter((row) => row.is_active !== false && text(row.type) === "hinge")
    .map(catalogueName)
    .filter(Boolean);
}

/** Everything a Hardware line may be. */
export function hardwareOptions(hardware = []) {
  return hardware
    .filter((row) => row.is_active !== false)
    .map(catalogueName)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

/**
 * The kinds of hardware we actually stock, in words.
 *
 * Read off the catalogue rather than offered as a fixed list, so a kind we hold
 * nothing in is not a dropdown entry that leads to an empty second dropdown.
 * The words are the hardware screen's own words. See lib/pcd-hardware-types.js.
 */
export function hardwareTypeOptions(hardware = []) {
  const present = new Set(
    hardware.filter((row) => row.is_active !== false).map((row) => text(row.type)).filter(Boolean)
  );
  return HARDWARE_TYPES.filter((type) => present.has(type.value)).map((type) => type.label);
}

/** The items of one kind, named the way the catalogue names them. */
export function hardwareOptionsByType(hardware = []) {
  const out = [];
  hardwareTypeOptions(hardware).forEach((label) => {
    const value = hardwareTypeFromLabel(label);
    const names = hardware
      .filter((row) => row.is_active !== false && text(row.type) === value)
      .map(catalogueName)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    if (names.length) out.push({ type: label, names });
  });
  return out;
}

// ---------------------------------------------------------------------------
// STANDARD FRONT SIZES
//
// The sizes a customer buying fronts for an IKEA or Kaboodle carcass will be
// asking for. Read out of the audited catalogue and never worked out from a
// frame size: a Metod frame is made 800 wide and the door that goes on it is
// not, there is no 500 wide Metod door at all, and a Pax door is only ever 250,
// 370 or 500. Deriving them would produce sizes IKEA does not sell.
//
// Height first, then width, everywhere. That is how every size is written on
// the site, on a quote and on the workshop sheet, and a form that swapped them
// would be the one place they were the other way round.
// ---------------------------------------------------------------------------

export const SIZE_SEPARATOR = " x ";

export function formatFrontSize(heightMm, widthMm) {
  return `${heightMm}${SIZE_SEPARATOR}${widthMm}`;
}

/** The height and width back out of one of our size labels. */
export function parseFrontSize(label) {
  const match = String(label || "").match(/^\s*(\d+)\s*x\s*(\d+)\s*$/i);
  if (!match) return null;
  return { height: Number(match[1]), width: Number(match[2]) };
}

/**
 * Every front size each range makes, split by what the piece is.
 *
 * Split by piece type because they genuinely differ: a Metod drawer front comes
 * 100, 200 or 400 high and a Metod door never does. One combined list would
 * offer a customer a door size that does not exist.
 *
 * @returns {Array<{cabinet: string, type: string, sizes: string[]}>}
 */
export function standardFrontSizes() {
  const out = [];
  SYSTEMS.forEach((system) => {
    const byType = new Map();
    (CABINETS[system.id] || []).forEach((group) => {
      (group.items || []).forEach((item) => {
        (item.layouts || []).forEach((layout) => {
          (layout.pieces || []).forEach((piece) => {
            const type = text(piece.type);
            if (!type) return;
            if (!byType.has(type)) byType.set(type, new Set());
            byType.get(type).add(formatFrontSize(piece.height, piece.width));
          });
        });
      });
    });

    // Filed under exactly the words the Cabinet column shows, because that is
    // what a size list is looked up by. The system's own name IS one of the
    // cabinet options ("IKEA Metod", "Kaboodle"), so there is nothing to
    // translate and nothing to get wrong: a range filed under a name the column
    // never displays is a size list nothing can reach, which is how Kaboodle's
    // sizes went missing the first time this was built.
    const cabinet = system.name;
    byType.forEach((sizes, type) => {
      out.push({
        cabinet,
        type,
        sizes: [...sizes].sort((a, b) => {
          const left = parseFrontSize(a);
          const right = parseFrontSize(b);
          return left.height - right.height || left.width - right.width;
        }),
      });
    });
  });
  return out;
}

/** The cabinets we hold standard front sizes for. The rest are made to size. */
export function cabinetsWithStandardSizes() {
  return uniqueSorted(standardFrontSizes().map((entry) => entry.cabinet));
}

/**
 * The pieces each range actually makes.
 *
 * A Pax is doors and nothing else; a Metod is doors and drawer fronts. Asking
 * the type first is what makes the size list correct, so the type column is
 * narrowed by the range rather than offering every product type we sell.
 *
 * "Panel" is added to every range on purpose. We do not read panels out of the
 * kit catalogue because a panel is not a catalogue item, but a run of IKEA
 * cabinets closed off with a panel we cut to size is the ordinary job, and a
 * range that would not let you say "panel" would send that line somewhere else.
 */
export function frontTypesForCabinet() {
  const byCabinet = new Map();
  standardFrontSizes().forEach((entry) => {
    if (!byCabinet.has(entry.cabinet)) byCabinet.set(entry.cabinet, new Set());
    byCabinet.get(entry.cabinet).add(entry.type);
  });
  return [...byCabinet.entries()].map(([cabinet, types]) => ({
    cabinet,
    types: [...uniqueSorted([...types]), "Panel"].filter(
      (type, index, all) => all.indexOf(type) === index
    ),
  }));
}

/** Every standard size a range makes, whatever the piece is. */
export function allFrontSizesForCabinet() {
  const byCabinet = new Map();
  standardFrontSizes().forEach((entry) => {
    if (!byCabinet.has(entry.cabinet)) byCabinet.set(entry.cabinet, new Set());
    entry.sizes.forEach((size) => byCabinet.get(entry.cabinet).add(size));
  });
  return [...byCabinet.entries()].map(([cabinet, sizes]) => ({
    cabinet,
    sizes: [...sizes].sort((a, b) => {
      const left = parseFrontSize(a);
      const right = parseFrontSize(b);
      return left.height - right.height || left.width - right.width;
    }),
  }));
}

// ---------------------------------------------------------------------------
// THE LOOKUP TABLE
//
// Excel's dropdowns take a range, not a rule, so each reachable combination is
// published as its own named range and this table says which one to use. A row
// on the order sheet builds its key from the answers already given and looks
// the list name up; nothing has to be spelled out in a validation formula, so
// a profile or a range with awkward punctuation in it cannot break the sheet.
// ---------------------------------------------------------------------------

const KEY_SEPARATOR = "|";

export function listKey(...parts) {
  return parts.map((part) => text(part)).join(KEY_SEPARATOR);
}

/**
 * Every list the form can offer, each with the key that reaches it.
 */
export function buildOptionTree({ colours = [], hardware = [], rooms = [], panelUses = [] } = {}) {
  const colourRows = colourOptions(colours);

  const brands = [ANY_BRAND, ...uniqueSorted(colourRows.map((row) => row.brand))];
  const lists = [];
  const add = (key, values) => {
    if (values.length) lists.push({ key, values });
  };

  // Which materials each product type may be made from. The rule is
  // materialsForProductType's, so Hardware getting nothing and a Table top
  // getting no Thermolaminate are decided in one place for every screen.
  PRODUCT_TYPES.forEach((type) => {
    add(listKey("MATERIAL", type), materialsForProductType(type));
  });

  MATERIAL_LABELS.forEach((material) => {
    add(listKey("THICKNESS", material), THICKNESS_BY_LABEL[material] || []);
    add(listKey("EDGE", material), edgeProfilesForMaterial(material));

    // A ROUTED DOOR PROFILE IS A THERMOLAMINATE THING AND ONLY A
    // THERMOLAMINATE THING. It is a vinyl skin pressed over a routed face;
    // there is nothing to press onto a decorative board, so the profile columns
    // have to be empty for it rather than quietly accepting an answer we cannot
    // make. Thickness matters too: the Fluted range and ten of the Detailed
    // ones are 21mm only.
    //
    // Both rules are quote-form-data.js's, which is the same module the website
    // request form reads, so the two cannot come to different answers.
    (THICKNESS_BY_LABEL[material] || []).forEach((thickness) => {
      const groups = profileTypesForSelection(material, thickness);
      add(listKey("PROFILEGROUP", material, thickness), groups);
      groups.forEach((group) => {
        add(
          listKey("PROFILE", group, material, thickness),
          profileNamesForSelection(group, material, thickness)
        );
      });
      // Every profile made in that material and thickness, whatever group it
      // belongs to. What the profile column offers while the group is blank, so
      // somebody who knows the profile name can pick it without first working
      // out which series it is in. Still empty for a decorative board, which is
      // the honest answer rather than a dead end.
      add(
        listKey("PROFILEANY", material, thickness),
        uniqueSorted(groups.flatMap((group) => profileNamesForSelection(group, material, thickness)))
      );
    });
  });

  // Finishes and colours, for each brand and again for "any brand". Built from
  // the rows themselves rather than from a list of expected finishes, so a
  // finish nobody here has heard of still reaches the form the day it is added.
  const brandScopes = brands.map((brand) => ({
    brand,
    rows: brand === ANY_BRAND ? colourRows : colourRows.filter((row) => row.brand === brand),
  }));

  brandScopes.forEach(({ brand, rows }) => {
    MATERIAL_LABELS.forEach((material) => {
      const forMaterial = rows.filter((row) => row.material === material);
      (THICKNESS_BY_LABEL[material] || []).forEach((thickness) => {
        const forThickness = forMaterial.filter((row) => row.thickness === thickness);
        const finishes = uniqueSorted(forThickness.map((row) => row.finish));
        add(listKey("FINISH", brand, material, thickness), finishes);
        // EVERY COLOUR IN THAT MATERIAL AND THICKNESS, whatever the finish. The
        // finish is an optional question, and a colour column that emptied
        // itself because nobody answered it would be a dead end on the one
        // column the whole form exists to get right.
        add(
          listKey("COLOUR", brand, material, thickness),
          uniqueSorted(forThickness.map((row) => row.name))
        );
        finishes.forEach((finish) => {
          add(
            listKey("COLOUR", brand, material, thickness, finish),
            uniqueSorted(forThickness.filter((row) => row.finish === finish).map((row) => row.name))
          );
        });
      });
    });
  });

  // The kit cabinet columns.
  // Standard front sizes, reached from the Cabinet answer and the piece type.
  // "Custom panel", "Custom carcass" and "Not applicable" have no standard
  // sizes at all, so they get no list and the size dropdown says so.
  // Keyed on the system AS WELL as the range, so "Not applicable" in the range
  // column means Kaboodle's sizes rather than being a name two systems could
  // both claim.
  standardFrontSizes().forEach((entry) => {
    add(listKey("FRONTSIZE", entry.cabinet, entry.type), entry.sizes);
  });
  // The same sizes again, filed under the range alone. This is what the size
  // column falls back to while the type is still blank: every size that range
  // makes, rather than an empty dropdown telling somebody to go back a column.
  allFrontSizesForCabinet().forEach((entry) => {
    add(listKey("FRONTSIZE", entry.cabinet), entry.sizes);
  });
  frontTypesForCabinet().forEach((entry) => {
    add(listKey("FRONTTYPE", entry.cabinet), entry.types);
  });

  // The hardware catalogue, split by kind, so the item dropdown is a list
  // somebody can scroll rather than everything we stock in one column.
  const hardwareByType = hardwareOptionsByType(hardware);
  hardwareByType.forEach((entry) => {
    add(listKey("HARDWARE", entry.type), entry.names);
  });

  return {
    lists,
    brands,
    types: [...PRODUCT_TYPES],
    // What a made to measure front can be. Hardware is its own tab now, with
    // its own columns, so offering it here would be a row that then wants a
    // board, a size and a colour it has not got.
    frontTypes: PRODUCT_TYPES.filter((type) => type !== "Hardware"),
    materials: [...MATERIAL_LABELS],
    cabinets: [...CABINET_OPTIONS],
    hinges: hingeOptions(hardware),
    hardware: hardwareOptions(hardware),
    hardwareTypes: hardwareTypeOptions(hardware),
    colourRows,

    // ── The vocabularies the measuring tabs ask for ────────────────────────
    // Rooms and panel uses are editable in Settings, Lists and arrive from
    // there. The rest are fixed, because each one changes what the workshop
    // does. See lib/pcd-line-details.js.
    rooms: rooms.length ? rooms : [...ROOM_AREAS],
    panelUses: panelUses.length ? panelUses : [...PANEL_USES],
    grains: [...GRAIN_DIRECTIONS],
    edgeFinishes: [...EDGE_FINISHES],
    suppliedBy: [...SUPPLIED_BY],
    hingeBrands: [...EXISTING_HINGE_BRANDS],
    overlays: [...DOOR_OVERLAYS],
    cabinetTypes: cabinetTypeOptions().map((option) => option.label),

    // ── WHAT A NARROWED LIST FALLS BACK TO ─────────────────────────────────
    //
    // A dropdown whose earlier columns are still blank shows EVERYTHING rather
    // than telling somebody to go back and fill in a column. Narrowing is a
    // convenience; it is not a gate, and on a job being measured under time
    // pressure a gate is how a line ends up unwritten.
    //
    // This is only for the blank case. A column whose dependencies ARE filled
    // in and still has nothing to offer keeps its empty list, because that is a
    // real answer: there is no door profile for a decorative board, and showing
    // every profile there would be offering something we cannot make.
    fallbacks: {
      thicknesses: uniqueSorted(Object.values(THICKNESS_BY_LABEL).flat()),
      finishes: uniqueSorted(colourRows.map((row) => row.finish)),
      colours: uniqueSorted(colourRows.map((row) => row.name)),
      edges: uniqueSorted(MATERIAL_LABELS.flatMap((material) => edgeProfilesForMaterial(material))),
      profileGroups: uniqueSorted(
        MATERIAL_LABELS.flatMap((material) =>
          (THICKNESS_BY_LABEL[material] || []).flatMap((thickness) =>
            profileTypesForSelection(material, thickness)
          )
        )
      ),
      profiles: uniqueSorted(
        MATERIAL_LABELS.flatMap((material) =>
          (THICKNESS_BY_LABEL[material] || []).flatMap((thickness) =>
            profileTypesForSelection(material, thickness).flatMap((group) =>
              profileNamesForSelection(group, material, thickness)
            )
          )
        )
      ),
      hardware: hardwareOptions(hardware),
    },
  };
}
