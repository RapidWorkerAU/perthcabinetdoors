// THE TABS OF THE ORDER FORM, AND EVERY COLUMN ON THEM.
//
// ── WHY THERE IS MORE THAN ONE TAB ───────────────────────────────────────────
//
// There was one, of twenty four columns, and it asked every job the same
// questions. Measuring up a refresh meant scrolling past a cabinet range, a
// standard size and four hinge position columns that could not apply, while the
// columns that did apply were narrowed by an answer the job never had. Under
// time pressure in somebody's kitchen that is not a nuisance, it is a line that
// does not get written down.
//
// So the questions are split by the job that asks them:
//
//   Kit fronts          IKEA and Kaboodle. Pick a range and a standard size and
//                       the millimetres fill themselves in.
//   Fronts and panels   made to a size somebody measured. This is the refresh
//                       tab, and it is the fronts half of a full custom job.
//   Carcasses           the boxes. Priced off a cut list, not off a board.
//   Hardware            bought, not made. No board, no size, no colour.
//
// Refresh fronts and full custom fronts SHARE a tab on purpose. Their columns
// are identical and the only difference is whether the hinge positions were
// read off a door that is already hanging. That is a filled column or a blank
// one, not a different tab, and two copies of twenty seven columns is two
// copies to keep in step.
//
// ── THE FIVE COLUMNS EVERY MEASURING TAB HAS ─────────────────────────────────
//
// Room, cabinet reference, quantity, notes, and the completeness check. They
// are defined once, below, and spread into each tab. That is what lets four
// tabs be read into one quote, and what lets somebody find a line again three
// weeks later.
//
// ── HOW A COLUMN SAYS HOW IT IS FILLED ───────────────────────────────────────
//
//   list      a dropdown that is always the same
//   narrow    a dropdown that changes with the answers already on the row
//   auto      the sheet works it out, and you can type over it
//   (neither) you type it
//
// A NARROWED LIST IS NEVER A GATE. With its earlier columns still blank it
// shows everything rather than telling somebody to go back a column, which is
// the dead end the single tab had. `fallback` is what it shows then. Once those
// columns ARE answered the narrowing is real and an empty list is an honest
// answer: there is no door profile for a decorative board, and offering every
// profile there would be offering something we cannot make.

import { ANY_BRAND, SIZE_SEPARATOR } from "./pcd-order-form-data";

export const SHEET_DETAILS = "Start here";
export const SHEET_KIT = "Kit fronts";
export const SHEET_FRONTS = "Fronts and panels";
export const SHEET_CARCASSES = "Carcasses";
export const SHEET_HARDWARE = "Hardware";
export const SHEET_HELP = "How to fill this in";
export const SHEET_COLOURS = "Colour list";
export const SHEET_LISTS = "Lists";

/** How many blank item rows each measuring tab ships with. */
export const ITEM_ROWS = 100;

/** The brand cell read as "any brand" when it is blank. */
const BRAND_OR_ANY = { brandOr: "brand" };

/** Carcasses are not asked whose colour range they come from. */
const ANY = { literal: ANY_BRAND };

// ── The columns every measuring tab carries ─────────────────────────────────

const lineColumn = { key: "line", head: "#", width: 5, group: "" };

const whereColumns = [
  {
    key: "room",
    head: "Room or area",
    width: 16,
    group: "Where it goes",
    list: "rooms",
  },
  {
    key: "cabinetRef",
    head: "Cabinet reference",
    width: 18,
    group: "Where it goes",
  },
];

const qtyColumn = (group) => ({
  key: "qty",
  head: "Qty",
  width: 7,
  group,
  required: true,
  gap: "a quantity",
  number: true,
  wholeNumber: true,
});

const notesColumns = [
  { key: "notes", head: "Notes for this line", width: 40, group: "Notes" },
  { key: "check", head: "Is this line complete?", width: 42, group: "Notes" },
];

// ── The colour chain, which three tabs ask in the same order ────────────────
//
// Thickness sits in the MIDDLE of it, and that is the part worth not moving. A
// colour is held per material AND thickness and only some of ours come in both,
// so offering colours before the thickness is known puts a 16mm-only colour on
// an 18mm door most of the time.

function colourChain({ group, materialSource, brand = BRAND_OR_ANY, heads = {}, keys = {}, required = {} }) {
  const key = (name) => keys[name] || name;
  return [
    {
      key: key("material"),
      head: heads.material || "Material",
      width: 19,
      group,
      required: required.material !== false,
      gap: "a material",
      ...(materialSource
        ? { narrow: { key: "MATERIAL", parts: [materialSource], fallback: "materials" } }
        : { list: "materials" }),
    },
    {
      key: key("thickness"),
      head: heads.thickness || "Thickness",
      width: 11,
      group,
      required: required.thickness !== false,
      gap: "a thickness",
      narrow: { key: "THICKNESS", parts: [key("material")], fallback: "thicknesses" },
    },
    {
      key: key("finish"),
      head: heads.finish || "Finish",
      width: 15,
      group,
      narrow: {
        key: "FINISH",
        parts: [brand, key("material"), key("thickness")],
        fallback: "finishes",
      },
    },
    {
      key: key("colour"),
      head: heads.colour || "Colour",
      width: 26,
      group,
      required: required.colour !== false,
      gap: "a colour",
      // Widened a step at a time. Blank finish still narrows by material and
      // thickness; only a blank material drops to the whole library.
      narrow: {
        key: "COLOUR",
        parts: [brand, key("material"), key("thickness"), key("finish")],
        blankWhen: [key("finish")],
        fallback: {
          key: "COLOUR",
          parts: [brand, key("material"), key("thickness")],
          blankWhen: [key("material"), key("thickness")],
          fallback: "colours",
        },
      },
    },
  ];
}

const profileColumns = (group) => [
  {
    key: "profileGroup",
    head: "Door profile group",
    width: 16,
    group,
    narrow: { key: "PROFILEGROUP", parts: ["material", "thickness"], fallback: "profilegroups" },
  },
  {
    key: "profile",
    head: "Door profile",
    width: 20,
    group,
    narrow: {
      key: "PROFILE",
      parts: ["profileGroup", "material", "thickness"],
      blankWhen: ["profileGroup"],
      // With no group chosen, every profile made in that material and
      // thickness. Which is still nothing at all on a decorative board.
      fallback: {
        key: "PROFILEANY",
        parts: ["material", "thickness"],
        blankWhen: ["material", "thickness"],
        fallback: "profiles",
      },
    },
  },
];

const edgeColumn = (group) => ({
  key: "edge",
  head: "Edge profile",
  width: 22,
  group,
  narrow: { key: "EDGE", parts: ["material"], fallback: "edges" },
});

// ── The hinge columns ───────────────────────────────────────────────────────
//
// Two of them are on both front tabs and four are on one. A kit front is bored
// to its own range's pattern, so there is nothing to measure and the four
// position columns would sit empty through an entire IKEA job. A front we make
// to a size somebody measured is the one that gets them.

const hingeStart = (group) => [
  {
    key: "hingeHoles",
    head: "Drill hinge holes",
    width: 16,
    group,
    list: "yesno",
    auto: "hingeHoles",
  },
  {
    key: "hingeQty",
    head: "Hinges per door",
    width: 15,
    group,
    list: "hingecounts",
    auto: "hingeQty",
  },
  { key: "hingeSide", head: "Hinge side", width: 16, group, list: "hingesides" },
];

// The two numbers that locate the drilling, and the same datum the workshop
// reads: the bottom cup measured up from the bottom edge, the top cup measured
// down from the top edge. Anything between them is spaced evenly unless it is
// given, so two numbers is the whole specification however many hinges a door
// hangs on.
const hingePositions = (group) => [
  { key: "hingeFromBottom", head: "Bottom hinge, mm from bottom", width: 17, group, number: true },
  { key: "hingeFromTop", head: "Top hinge, mm from top", width: 17, group, number: true },
  { key: "hingeMiddle1", head: "2nd hinge, mm from bottom", width: 16, group, number: true },
  { key: "hingeMiddle2", head: "3rd hinge, mm from bottom", width: 16, group, number: true },
];

// ── The tabs ────────────────────────────────────────────────────────────────

export const TABS = [
  {
    id: "kit",
    sheet: SHEET_KIT,
    kind: "lines",
    subtitle: "Fronts going onto an IKEA or Kaboodle carcass.",
    strip:
      "ONE ROW PER SIZE   Pick the range and the standard size and the height and width fill themselves in. " +
      "A kit front is drilled to its range's own hinge pattern, so there is nothing to measure. " +
      "A front that needs measured hinge positions, or a size the range does not make, goes on the Fronts and panels tab.",
    columns: [
      lineColumn,
      ...whereColumns,
      {
        key: "cabinet",
        head: "Cabinet range",
        width: 18,
        group: "The cabinet",
        required: true,
        gap: "which cabinet range",
        list: "cabinets",
        defaultFrom: "cabinet",
      },
      {
        key: "type",
        head: "Front type",
        width: 15,
        group: "The cabinet",
        required: true,
        gap: "a front type",
        narrow: { key: "FRONTTYPE", parts: ["cabinet"], fallback: "fronttypes" },
      },
      {
        key: "frontSize",
        head: `Standard size (height${SIZE_SEPARATOR}width)`,
        width: 20,
        group: "The cabinet",
        // Falls back to every size that range makes while the type is blank,
        // rather than to nothing at all.
        narrow: {
          key: "FRONTSIZE",
          parts: ["cabinet", "type"],
          blankWhen: ["type"],
          fallback: { key: "FRONTSIZE", parts: ["cabinet"], blankWhen: ["cabinet"] },
        },
      },
      {
        key: "height",
        head: "Height mm",
        width: 11,
        group: "Size",
        required: true,
        gap: "a height",
        number: true,
        auto: "standardHeight",
      },
      {
        key: "width",
        head: "Width mm",
        width: 11,
        group: "Size",
        required: true,
        gap: "a width",
        number: true,
        auto: "standardWidth",
      },
      qtyColumn("Size"),
      {
        key: "brand",
        head: "Brand",
        width: 15,
        group: "Board",
        list: "brands",
        defaultFrom: "brand",
      },
      ...colourChain({ group: "Board", materialSource: "type" }).map((column) => ({
        ...column,
        defaultFrom: column.key,
      })),
      ...profileColumns("Profiles").map((column) => ({ ...column, defaultFrom: column.key })),
      { ...edgeColumn("Profiles"), defaultFrom: "edge" },
      ...hingeStart("Hinges (doors only)"),
      ...notesColumns,
    ],
  },

  {
    id: "fronts",
    sheet: SHEET_FRONTS,
    kind: "lines",
    subtitle: "Doors, drawer fronts, panels and table tops made to a size you measured.",
    strip:
      "ONE ROW PER SIZE   Six identical doors are one row with a quantity of 6. A hinged pair is TWO rows, one left and one right. " +
      "Leave the hinge positions blank and we drill our standard ones; fill them in when you are matching a door that is already hanging.",
    columns: [
      lineColumn,
      ...whereColumns,
      {
        key: "type",
        head: "Type",
        width: 15,
        group: "The item",
        required: true,
        gap: "a type",
        list: "fronttypes",
      },
      {
        key: "panelUse",
        head: "What is the panel?",
        width: 18,
        group: "The item",
        // Offers nothing once the type is something other than a panel, which is
        // the honest answer: a door is not an end panel or a kickboard.
        narrow: { key: "PANELUSE", parts: ["type"], fallback: "paneluses" },
      },
      {
        key: "height",
        head: "Height mm",
        width: 11,
        group: "Size",
        required: true,
        gap: "a height",
        number: true,
      },
      {
        key: "width",
        head: "Width mm",
        width: 11,
        group: "Size",
        required: true,
        gap: "a width",
        number: true,
      },
      qtyColumn("Size"),
      {
        key: "brand",
        head: "Brand",
        width: 15,
        group: "Board",
        list: "brands",
        defaultFrom: "brand",
      },
      ...colourChain({ group: "Board", materialSource: "type" }).map((column) => ({
        ...column,
        defaultFrom: column.key,
      })),
      {
        key: "grain",
        head: "Grain direction",
        width: 16,
        group: "Board",
        list: "grains",
      },
      { ...edgeColumn("Profiles"), defaultFrom: "edge" },
      {
        key: "edgeFinish",
        head: "Edges to finish",
        width: 22,
        group: "Profiles",
        list: "edgefinishes",
      },
      ...profileColumns("Profiles").map((column) => ({ ...column, defaultFrom: column.key })),
      ...hingeStart("Hinges (doors only)"),
      ...hingePositions("Hinges (doors only)"),
      ...notesColumns,
    ],
  },

  {
    id: "carcasses",
    sheet: SHEET_CARCASSES,
    kind: "cabinets",
    subtitle: "The boxes. Priced off a cut list, so the box is what it asks about.",
    strip:
      "ONE ROW PER BOX   Two identical cabinets are one row with a quantity of 2. " +
      "The doors are NOT on this tab: they are rows on Fronts and panels carrying the same cabinet reference. " +
      "Leave the shelf colour and thickness blank and the shelves are made of the same board as the box.",
    columns: [
      lineColumn,
      ...whereColumns,
      {
        key: "cabinetType",
        head: "Cabinet type",
        width: 20,
        group: "The box",
        required: true,
        gap: "a cabinet type",
        list: "cabinettypes",
      },
      {
        key: "height",
        head: "Height mm",
        width: 11,
        group: "The box",
        required: true,
        gap: "a height",
        number: true,
      },
      {
        key: "width",
        head: "Width mm",
        width: 11,
        group: "The box",
        required: true,
        gap: "a width",
        number: true,
      },
      {
        key: "secondaryWidth",
        head: "Second width mm (corners)",
        width: 15,
        group: "The box",
        number: true,
        greyUnless: "corner",
      },
      {
        key: "depth",
        head: "Depth mm",
        width: 11,
        group: "The box",
        required: true,
        gap: "a depth",
        number: true,
      },
      qtyColumn("The box"),
      ...colourChain({
        group: "What it is made of",
        materialSource: null,
        brand: ANY,
        keys: {
          material: "carcassMaterial",
          thickness: "carcassThickness",
          finish: "carcassFinish",
          colour: "carcassColour",
        },
        heads: {
          material: "Carcass material",
          thickness: "Carcass thickness",
          finish: "Carcass finish",
          colour: "Carcass colour",
        },
      }),
      {
        key: "backPanel",
        head: "Back panel",
        width: 12,
        group: "Back and shelves",
        list: "yesno",
        auto: "backPanel",
      },
      {
        key: "backThickness",
        head: "Back thickness",
        width: 13,
        group: "Back and shelves",
        narrow: { key: "THICKNESS", parts: ["carcassMaterial"], fallback: "thicknesses" },
        greyUnless: "hasBack",
      },
      {
        key: "shelfQty",
        head: "Shelves",
        width: 9,
        group: "Back and shelves",
        number: true,
        wholeNumber: true,
      },
      {
        key: "shelfHeights",
        head: "Shelf heights, mm from bottom",
        width: 24,
        group: "Back and shelves",
      },
      {
        key: "shelfColour",
        head: "Shelf colour (blank = same as carcass)",
        width: 26,
        group: "Back and shelves",
        narrow: {
          key: "COLOUR",
          parts: [ANY, "carcassMaterial", "carcassThickness", "carcassFinish"],
          fallback: "colours",
        },
      },
      {
        key: "shelfThickness",
        head: "Shelf thickness (blank = same)",
        width: 15,
        group: "Back and shelves",
        narrow: { key: "THICKNESS", parts: ["carcassMaterial"], fallback: "thicknesses" },
      },
      {
        key: "mountHeight",
        head: "Mount height mm",
        width: 14,
        group: "Only when it applies",
        number: true,
      },
      {
        key: "rangehoodHeight",
        head: "Rangehood housing height mm",
        width: 16,
        group: "Only when it applies",
        number: true,
      },
      {
        key: "rangehoodWidth",
        head: "Rangehood channel width mm",
        width: 16,
        group: "Only when it applies",
        number: true,
      },
      ...notesColumns,
    ],
  },

  {
    id: "hardware",
    sheet: SHEET_HARDWARE,
    kind: "lines",
    subtitle: "Hinges, runners, handles and legs as their own lines.",
    strip:
      "ONE ROW PER ITEM   A hardware line is bought rather than made, so it carries no board, no size and no colour. " +
      "Say who is supplying it: a line the customer is buying themselves is recorded but not priced.",
    columns: [
      lineColumn,
      ...whereColumns.map((column) =>
        column.key === "cabinetRef"
          ? { ...column, head: "For which cabinet", width: 18 }
          : column
      ),
      {
        key: "hardwareType",
        head: "Hardware type",
        width: 18,
        group: "The item",
        required: true,
        gap: "a hardware type",
        list: "hardwaretypes",
      },
      {
        key: "hardware",
        head: "Hardware item",
        width: 34,
        group: "The item",
        required: true,
        gap: "which hardware item",
        narrow: { key: "HARDWARE", parts: ["hardwareType"], fallback: "hardwareitems" },
      },
      qtyColumn("The item"),
      {
        key: "suppliedBy",
        head: "Supplied by",
        width: 18,
        group: "The item",
        list: "suppliedby",
      },
      ...notesColumns,
    ],
  },
];

/** One tab by its id. */
export function tabById(id) {
  return TABS.find((tab) => tab.id === id) || null;
}

/** One tab by the name on its sheet tab. */
export function tabBySheet(name) {
  const wanted = String(name || "").trim().toLowerCase();
  return TABS.find((tab) => tab.sheet.toLowerCase() === wanted) || null;
}

/** The columns a person answers, which is everything but the machinery. */
export function answerColumns(tab) {
  return tab.columns.filter((column) => !["line", "check"].includes(column.key));
}

/** The headings a person answers, in sheet order. Read by the importer. */
export function columnHeads(tab) {
  return answerColumns(tab).map((column) => column.head);
}

/**
 * The columns needing a hidden helper cell, in the order they are written.
 *
 * A narrowed column has one: it works out the NAME of the list the column
 * should offer, so the validation beside it is never more than INDIRECT of one
 * cell. Excel is fussy about what it will accept inside a validation, and a
 * profile name with punctuation in it is how that breaks; looking a list up in
 * a table cannot break.
 */
export function helperKeys(tab) {
  const keys = tab.columns.filter((column) => column.narrow).map((column) => column.key);
  if (tab.columns.some((column) => column.auto === "standardHeight")) {
    keys.push("stdHeight", "stdWidth");
  }
  keys.push("gaps");
  return keys;
}

/** Every sheet name the workbook carries, in tab strip order. */
export const SHEET_ORDER = [
  SHEET_DETAILS,
  ...TABS.map((tab) => tab.sheet),
  SHEET_HELP,
];
