// THE BRANDED EXCEL ORDER FORM.
//
// A customer who will not use the website form gets this instead, and so does
// whoever is standing in a kitchen with a tape measure. What comes back can be
// read straight down the columns instead of being deciphered out of an email.
//
// SIX SHEETS A PERSON SEES. "Start here" is the job, the customer and the
// answers that are true for the whole kitchen, set up to print on one A4 page.
// Then four measuring tabs, one per kind of work: Kit fronts, Fronts and
// panels, Carcasses, Hardware. Then "How to fill this in", in plain words. Two
// more are hidden: "Lists" is the machinery behind every dropdown, and "Colour
// list" is a full copy of the library.
//
// WHICH COLUMNS ARE ON WHICH TAB IS NOT DECIDED HERE. It is in
// lib/pcd-order-form-tabs.js, which the IMPORTER reads as well, so the sheet
// that asks the questions and the reader that takes the answers cannot come to
// different views about what a column is called.
//
// EVERY SHEET IS PASSWORD PROTECTED and every cell a person fills in is
// unlocked. See SHEET_PASSWORD: it is there to stop the machinery being edited
// by accident, not to keep anybody out of their own form.
//
// HOW THE DROPDOWNS FILTER. Excel has no way to say "offer the colours for
// whatever material this row picked", so every reachable combination is
// published as its own named range on a hidden sheet, and a lookup table maps a
// row's answers so far onto the name of the list the next column should offer
// (see lib/pcd-order-form-data.js).
//
// Each filtered column then has two pieces: a hidden helper cell that works out
// WHICH list applies, and a validation that is only ever `INDIRECT(<that
// cell>)`. Keeping the logic in an ordinary cell formula and the validation
// trivial is deliberate: Excel is fussy about what it will accept inside a
// validation, and a profile name or a category with punctuation in it is how
// that breaks. Looking the list up in a table cannot break.
//
// NOTHING ON THIS FORM STOPS YOU. Every dropdown WARNS and then lets the answer
// through, and a narrowed list whose earlier columns are blank offers everything
// rather than telling somebody to go back a column. It is filled in on site,
// under time pressure, and a refusal there is a line that never gets written
// down. What we cannot match is flagged on the way back in instead.
//
// HEIGHT BEFORE WIDTH, EVERYWHERE. On the site, on a quote and on the workshop
// sheet a size is written height first. A form that put width first would be
// the one place in the business they were the other way round, and the cost of
// that is a door made the wrong way round.
//
// WHAT IS DELIBERATELY NOT HERE. No prices. The form is what the customer
// wants, not what it costs: much of the colour library has no rate against it
// and those lines are costed by hand at quote time. Putting a number on the
// form would either be blank half the time or be a quote we never gave.

import ExcelJS from "exceljs";
import { CABINET_BRANDS } from "./quote-form-data";
import { HINGE_COUNTS, HINGE_COUNT_BREAKS } from "./pcd-hinges";
import {
  ANY_BRAND,
  CHOOSE_EARLIER_FIRST,
  NOT_A_KIT_CABINET,
  SIZE_SEPARATOR,
  buildOptionTree,
} from "./pcd-order-form-data";
import {
  ITEM_ROWS,
  SHEET_COLOURS,
  SHEET_DETAILS,
  SHEET_HELP,
  SHEET_LISTS,
  TABS,
  answerColumns,
  helperKeys,
} from "./pcd-order-form-tabs";

export {
  ITEM_ROWS,
  SHEET_COLOURS,
  SHEET_DETAILS,
  SHEET_HELP,
  SHEET_LISTS,
  TABS,
} from "./pcd-order-form-tabs";

// Brand palette, from app/globals.css so the sheet matches the site.
const INK = "FF1C2B1E"; // --color-brand-700, the sidebar green
const DEEP = "FF2D5E28"; // --accent-dark
const ACCENT = "FF6B9E61"; // --accent
const PAPER = "FFFAF9F6"; // --page-bg
const LINE = "FFDBD8CC"; // --border
const WASH = "FFEDF4EB"; // --accent-light
const MUTED = "FF5A5A52"; // --text-muted
const WHITE = "FFFFFFFF";
// The wash a column wears when it does not apply to the row as it stands. It
// says "not this one" without ever stopping somebody typing in it, which is the
// whole difference between a hint and a dead end.
const GREYED = "FFF0EFEA";

/** First row of an item table, and the two header rows above it. */
export const GROUP_ROW = 6;
export const HEAD_ROW = 7;
export const FIRST_ITEM_ROW = 8;

/** Excel's A1 letter for a 1-based column index. */
export function columnLetter(index) {
  let n = index;
  let out = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    out = String.fromCharCode(65 + remainder) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

// THE PASSWORD ON THE SHEETS.
//
// Not a secret and not security. It is there so that the machinery of this
// workbook cannot be edited by accident: the hidden helper columns, the check
// formulas, the line numbers, the lists behind every dropdown. A customer who
// clears a helper cell breaks the dropdown beside it and gets nothing to say
// why, and the first anybody here knows is a returned form with half its
// answers missing.
export const SHEET_PASSWORD = "pcdorderform2026";

// What protection allows on the sheets a person works in.
//
// formatColumns is DENIED on purpose. It is what would otherwise let somebody
// unhide the helper columns, and editing one of those is the exact accident the
// password is here to prevent. Row height stays theirs, so a long note still
// grows its row.
const CUSTOMER_SHEET_PROTECTION = {
  selectLockedCells: true,
  selectUnlockedCells: true,
  formatColumns: false,
  formatRows: true,
  autoFilter: true,
  sort: true,
};

/** The named range offered when there is genuinely nothing to offer. */
const EMPTY_LIST = "opt_none";

const quote = (value) => `"${String(value).replace(/"/g, '""')}"`;

// ---------------------------------------------------------------------------

function styleCell(cell, { fill, font, align, border } = {}) {
  if (fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
  if (font) cell.font = font;
  if (align) cell.alignment = align;
  if (border) cell.border = border;
}

const thin = { style: "thin", color: { argb: LINE } };
const gridBorder = { top: thin, left: thin, bottom: thin, right: thin };

/** Where each column and each helper of one tab sits, as A1 letters. */
function geometryFor(tab) {
  const at = {};
  tab.columns.forEach((column, i) => {
    at[column.key] = columnLetter(i + 1);
  });
  // Past a blank gutter, so nothing lands beside the notes by accident.
  const helperStart = tab.columns.length + 2;
  const help = {};
  helperKeys(tab).forEach((key, i) => {
    help[key] = columnLetter(helperStart + i);
  });
  return { at, help, helperStart, lastColumn: tab.columns.length };
}

// ---------------------------------------------------------------------------

/**
 * @param {object} input
 * @param {Array} input.colours   pcd_colour_library rows
 * @param {Array} input.hardware  pcd_hardware rows
 * @param {string[]} input.rooms      the editable room list
 * @param {string[]} input.panelUses  the editable panel use list
 * @param {string} input.generatedOn  the date printed on the sheet
 * @param {Buffer|null} input.logo    horizontal PCD logo, PNG
 * @returns {Promise<ExcelJS.Workbook>}
 */
export async function buildOrderFormWorkbook({
  colours = [],
  hardware = [],
  rooms = [],
  panelUses = [],
  generatedOn = "",
  logo = null,
} = {}) {
  const tree = buildOptionTree({ colours, hardware, rooms, panelUses });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Perth Cabinet Doors";
  workbook.lastModifiedBy = "Perth Cabinet Doors";
  workbook.title = "Perth Cabinet Doors order form";

  const details = workbook.addWorksheet(SHEET_DETAILS, {
    views: [{ showGridLines: false }],
    pageSetup: {
      // A4 portrait, one page. This is the sheet somebody prints and staples to
      // the job, so it has to come out as one page rather than one and a strip.
      paperSize: 9,
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      horizontalCentered: true,
      margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  });

  const sheets = TABS.map((tab) => {
    const { lastColumn } = geometryFor(tab);
    return {
      tab,
      sheet: workbook.addWorksheet(tab.sheet, {
        views: [{ state: "frozen", xSplit: 3, ySplit: HEAD_ROW, showGridLines: false }],
        pageSetup: {
          orientation: "landscape",
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
          printTitlesRow: `${GROUP_ROW}:${HEAD_ROW}`,
          margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
        },
      }),
      lastColumn,
    };
  });

  const help = workbook.addWorksheet(SHEET_HELP, { views: [{ showGridLines: false }] });
  // OUT OF THE TAB STRIP. The dropdowns already narrow the colours to what we
  // stock in the material and thickness chosen, which is the part that has to be
  // right; a browsable copy of the whole library beside it is clutter on a form
  // and a stock list we are handing out. veryHidden rather than hidden, so it
  // cannot be brought back through Unhide and edited by somebody who then
  // believes they have changed what we stock.
  const colourSheet = workbook.addWorksheet(SHEET_COLOURS, {
    state: "veryHidden",
    views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
  });
  const lists = workbook.addWorksheet(SHEET_LISTS, { state: "veryHidden" });

  await writeLists(workbook, lists, tree);
  // The details sheet is written FIRST because the measuring tabs read from it:
  // the colour and the profiles set there fill in every new row, and a row that
  // differs is typed over. It hands back where each of those answers landed.
  const defaults = await writeDetailsSheet(details, { generatedOn, logo, workbook });

  for (const entry of sheets) {
    // The logo goes on every sheet a person looks at. They are tabs of one
    // document and one of them turning up plain reads as a different, less
    // careful document.
    await writeMeasuringSheet(entry.sheet, entry.tab, { generatedOn, logo, workbook, defaults });
  }

  await writeHelpSheet(help, { generatedOn });
  await writeColourSheet(colourSheet, tree);

  return workbook;
}

// ---------------------------------------------------------------------------
// The hidden sheet: one column per list, plus the lookup table that reaches
// them. Nothing on it is meant to be read by a person, which is why it ships
// veryHidden: a stray edit here silently empties a dropdown somewhere else.
// ---------------------------------------------------------------------------

async function writeLists(workbook, sheet, tree) {
  const defineName = (name, first, last) => {
    workbook.definedNames.add(`'${SHEET_LISTS}'!${first}:${last}`, name);
  };

  // Column A/B are the lookup table, so the lists themselves start at D.
  let column = 4;
  const names = [];

  const publish = (values) => {
    const letter = columnLetter(column);
    const name = `opt_${column}`;
    values.forEach((value, i) => {
      sheet.getCell(`${letter}${i + 1}`).value = value;
    });
    defineName(name, `$${letter}$1`, `$${letter}$${values.length}`);
    column += 1;
    return name;
  };

  // The placeholder list. A dropdown with genuinely nothing to offer opens on
  // this one line rather than on an error, so it says what is going on instead
  // of looking broken.
  const noneLetter = columnLetter(column);
  sheet.getCell(`${noneLetter}1`).value = CHOOSE_EARLIER_FIRST;
  defineName(EMPTY_LIST, `$${noneLetter}$1`, `$${noneLetter}$1`);
  column += 1;

  // THE FIXED LISTS, and the ones a narrowed column falls back to while the
  // columns it depends on are still blank.
  const fixed = {
    brands: tree.brands,
    types: tree.types,
    fronttypes: tree.frontTypes,
    cabinets: tree.cabinets,
    materials: tree.materials,
    thicknesses: tree.fallbacks.thicknesses,
    finishes: tree.fallbacks.finishes,
    colours: tree.fallbacks.colours,
    edges: tree.fallbacks.edges,
    profilegroups: tree.fallbacks.profileGroups,
    profiles: tree.fallbacks.profiles,
    rooms: tree.rooms,
    paneluses: tree.panelUses,
    grains: tree.grains,
    edgefinishes: tree.edgeFinishes,
    suppliedby: tree.suppliedBy,
    cabinettypes: tree.cabinetTypes,
    hingebrands: tree.hingeBrands,
    overlays: tree.overlays,
    yesno: ["Yes", "No"],
    // Numbers, not text, because the Hinges per door column fills itself in
    // with a number worked out from the door height. A list of text "2" beside
    // a numeric 2 warns on every row it filled in itself.
    hingecounts: HINGE_COUNTS,
    // Handing is the one that reaches the workshop wrong most often, and it is
    // deliberately only two answers. A door is hinged left or it is hinged
    // right; a "pair" is not one door, it is two doors drilled as mirror
    // images, and offering it as one answer let a pair be ordered on a single
    // line.
    hingesides: ["Left", "Right"],
    hardwaretypes: tree.hardwareTypes.length ? tree.hardwareTypes : [CHOOSE_EARLIER_FIRST],
    hardwareitems: tree.fallbacks.hardware.length ? tree.fallbacks.hardware : [CHOOSE_EARLIER_FIRST],
    delivery: ["Delivery", "Pickup from Myaree"],
    states: ["WA", "SA", "NT", "QLD", "NSW", "ACT", "VIC", "TAS"],
    // The same list the website asks the question with, so a customer who has
    // filled that in once is answering the same question the same way.
    cabinetbrands: CABINET_BRANDS,
  };
  Object.entries(fixed).forEach(([name, values]) => {
    const letter = columnLetter(column);
    const rows = values.length ? values : [CHOOSE_EARLIER_FIRST];
    rows.forEach((value, i) => {
      sheet.getCell(`${letter}${i + 1}`).value = value;
    });
    defineName(name, `$${letter}$1`, `$${letter}$${rows.length}`);
    column += 1;
  });

  tree.lists.forEach((list) => {
    names.push({ key: list.key, name: publish(list.values) });
  });

  sheet.getCell("A1").value = "key";
  sheet.getCell("B1").value = "list";
  names.forEach((entry, i) => {
    sheet.getCell(`A${i + 2}`).value = entry.key;
    sheet.getCell(`B${i + 2}`).value = entry.name;
  });
  workbook.definedNames.add(`'${SHEET_LISTS}'!$A$2:$B$${names.length + 1}`, "keymap");

  // The colour library itself, for the reference sheet to read.
  const colourStart = column;
  ["Brand", "Material", "Thickness", "Finish", "Colour"].forEach((head, i) => {
    sheet.getCell(`${columnLetter(colourStart + i)}1`).value = head;
  });
  tree.colourRows.forEach((row, i) => {
    const at = i + 2;
    sheet.getCell(`${columnLetter(colourStart)}${at}`).value = row.brand;
    sheet.getCell(`${columnLetter(colourStart + 1)}${at}`).value = row.material;
    sheet.getCell(`${columnLetter(colourStart + 2)}${at}`).value = row.thickness;
    sheet.getCell(`${columnLetter(colourStart + 3)}${at}`).value = row.finish;
    sheet.getCell(`${columnLetter(colourStart + 4)}${at}`).value = row.name;
  });

  await sheet.protect(SHEET_PASSWORD, { selectLockedCells: false, selectUnlockedCells: false });
}

// ---------------------------------------------------------------------------
// The masthead, shared by every sheet a person looks at.
// ---------------------------------------------------------------------------

function writeMasthead(sheet, { lastColumn, generatedOn, logo, workbook, subtitle, splitAfter }) {
  const lastLetter = columnLetter(lastColumn);
  // Two blocks rather than one, because the logo sits over the left of it and
  // the title is set against the right. Where the split falls is passed in on
  // the narrow sheet: leaving the title two columns to sit in wraps it onto
  // three lines and it reads as cramped rather than as a masthead.
  const split = splitAfter || Math.max(2, Math.min(4, lastColumn - 1));
  sheet.mergeCells(`A1:${columnLetter(split)}3`);
  sheet.mergeCells(`${columnLetter(split + 1)}1:${lastLetter}3`);
  [1, 2, 3].forEach((row) => {
    for (let column = 1; column <= lastColumn; column += 1) {
      styleCell(sheet.getCell(`${columnLetter(column)}${row}`), { fill: INK });
    }
  });
  sheet.getRow(1).height = 26;
  sheet.getRow(2).height = 26;
  sheet.getRow(3).height = 14;

  if (logo) {
    const imageId = workbook.addImage({ buffer: logo, extension: "png" });
    sheet.addImage(imageId, { tl: { col: 0.3, row: 0.6 }, ext: { width: 200, height: 42 } });
  }

  const titleCell = sheet.getCell(`${columnLetter(split + 1)}1`);
  titleCell.value = {
    richText: [
      { text: "ORDER FORM\n", font: { name: "Calibri", size: 18, bold: true, color: { argb: WHITE } } },
      {
        text:
          subtitle ||
          (generatedOn
            ? `Colours, profiles and hardware as at ${generatedOn}`
            : "Colours, profiles and hardware from our current library"),
        font: { name: "Calibri", size: 10, color: { argb: "FFA8C5A0" } },
      },
    ],
  };
  // Left, hard against the logo. Right-aligned it sat at the far edge of the
  // sheet, which on a wide tab is twenty seven columns away from the logo and
  // reads as two unrelated things rather than one masthead.
  styleCell(titleCell, { align: { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 } });
}

// ---------------------------------------------------------------------------
// SHEET ONE: who they are, where it is going, and what is true for the whole
// job.
//
// The job defaults block is the part that saves the most time on site. Set the
// colour and the profiles once and every new row on every measuring tab starts
// filled in with them; a row that is different is typed over and the row wins.
// ---------------------------------------------------------------------------

const DETAIL_LAST_COLUMN = 6;

// Every answer box is the same width and every hint sits under the box it is
// about. Both were learned the hard way: fields of three different widths
// stacked down a page look like a mistake even when each one is deliberate, and
// a hint parked in the column to the right needs a column wide enough to hold
// it, which on A4 there is not, so it wrapped and got cut off.
const DETAIL_FIELD_FIRST = 3;

// The hidden helpers behind the cascading answers in the job defaults block,
// well clear of the printed area.
const DETAIL_HELPER_FIRST = 9;

async function writeDetailsSheet(sheet, { generatedOn, logo, workbook }) {
  // A narrow margin, a label column, then four equal columns the answer boxes
  // are merged across. Adding up to a page A4 can print without shrinking.
  [2, 30, 15, 15, 15, 15].forEach((width, i) => {
    sheet.getColumn(i + 1).width = width;
  });

  writeMasthead(sheet, {
    lastColumn: DETAIL_LAST_COLUMN,
    // Three columns for the logo, three for the title, so neither is squeezed.
    splitAfter: 3,
    generatedOn,
    logo,
    workbook,
    subtitle: "Fill this page in first. It sets the colour on every other tab.",
  });

  const FIELD_FIRST = columnLetter(DETAIL_FIELD_FIRST);
  const FIELD_LAST = columnLetter(DETAIL_LAST_COLUMN);
  let row = 5;
  let helperColumn = DETAIL_HELPER_FIRST;

  /** Where each default answer landed, for the measuring tabs to read. */
  const defaults = {};

  const section = (title, note) => {
    row += 1;
    sheet.getRow(row).height = 22;
    sheet.mergeCells(`B${row}:${FIELD_LAST}${row}`);
    const cell = sheet.getCell(`B${row}`);
    cell.value = {
      richText: [
        { text: `${title}   `, font: { name: "Calibri", size: 10, bold: true, color: { argb: DEEP } } },
        { text: note || "", font: { name: "Calibri", size: 9, color: { argb: MUTED } } },
      ],
    };
    styleCell(cell, { fill: WASH, align: { vertical: "middle", indent: 1 } });
    row += 1;
  };

  /**
   * One question: the label on the left, one answer box the same width as every
   * other, and the hint on its own thin row underneath.
   *
   * `narrow` gives the answer a dropdown that depends on the answers above it,
   * exactly as a row on a measuring tab does, through a hidden helper cell out
   * to the right. `defaultFor` files the cell address so the tabs can read it.
   */
  const field = (label, { required = false, validation = null, narrow = null, hint = "", height = 22, defaultFor = "" } = {}) => {
    sheet.getRow(row).height = height;

    const labelCell = sheet.getCell(`B${row}`);
    labelCell.value = required ? `${label} *` : label;
    styleCell(labelCell, {
      font: { name: "Calibri", size: 10, bold: true, color: { argb: required ? INK : MUTED } },
      align: { vertical: "middle", wrapText: true },
    });

    sheet.mergeCells(`${FIELD_FIRST}${row}:${FIELD_LAST}${row}`);
    const valueCell = sheet.getCell(`${FIELD_FIRST}${row}`);
    valueCell.value = null;
    styleCell(valueCell, {
      fill: WHITE,
      font: { name: "Calibri", size: 11, color: { argb: INK } },
      align: { vertical: "middle", wrapText: true, indent: 1 },
      border: gridBorder,
    });
    valueCell.protection = { locked: false };

    if (narrow) {
      const helperLetter = columnLetter(helperColumn);
      helperColumn += 1;
      // Every answer a default depends on is asked further up this same block,
      // so it is already filed by the time we get here.
      const cellFor = (key) => {
        const known = defaults[key];
        return known ? `$${known.letter}$${known.row}` : `$${FIELD_FIRST}$${row}`;
      };
      sheet.getCell(`${helperLetter}${row}`).value = { formula: narrowFormula(narrow, cellFor) };
      valueCell.dataValidation = listValidation(`INDIRECT($${helperLetter}$${row})`);
    } else if (validation) {
      valueCell.dataValidation = validation;
    }

    if (defaultFor) defaults[defaultFor] = { letter: FIELD_FIRST, row, ref: `'${SHEET_DETAILS}'!$${FIELD_FIRST}$${row}` };
    row += 1;

    if (hint) {
      sheet.getRow(row).height = 14;
      sheet.mergeCells(`${FIELD_FIRST}${row}:${FIELD_LAST}${row}`);
      const hintCell = sheet.getCell(`${FIELD_FIRST}${row}`);
      hintCell.value = hint;
      styleCell(hintCell, {
        font: { name: "Calibri", size: 9, italic: true, color: { argb: MUTED } },
        align: { vertical: "middle", indent: 1 },
      });
      row += 1;
    }
  };

  // The same warn-then-allow rule the measuring tabs use. See listValidation.
  const list = (name) => listValidation(name);

  section("ABOUT YOU", "The starred ones are what we need to be able to send a quote back.");
  field("Company", { hint: "Leave blank if this is a home job" });
  field("First name", { required: true });
  field("Last name");
  field("Email", { required: true, hint: "This is where the quote goes" });
  field("Phone", { required: true });

  section("WHERE IT IS GOING");
  field("Delivery or pickup", { validation: list("delivery") });
  field("Street address");
  field("Suburb", { required: true });
  field("State", { validation: list("states") });
  field("Postcode");
  field("Anything we need to know to deliver", {
    height: 32,
    hint: "Access, parking, gate codes, best times",
  });

  section("ABOUT THE JOB");
  field("Your reference for this job", { hint: "Whatever you call it, so we can both find it" });
  field("What kind of job is this", {
    validation: list("jobkinds"),
    hint: "Tells us which tabs to read. It does not lock or hide any of them",
  });
  field("Measured by", { hint: "Who stood in the kitchen" });
  field("Date measured", { hint: "So we know how old the sizes are" });
  field("Date needed by", { hint: "Approximate is fine" });
  field("Anything else we should know", {
    height: 40,
    hint: "Timing, site conditions, anything that helps us quote it properly",
  });

  section("THE SAME ON EVERY LINE", "Fill these in once and every row on every tab starts here. Change a row and the row wins.");
  field("Cabinet brand", {
    validation: list("cabinetbrands"),
    defaultFor: "cabinet",
    hint: "Whose carcasses the fronts are going on. Fills in the Kit fronts tab",
  });
  field("Brand", { validation: list("brands"), defaultFor: "brand", hint: "Leave blank to see every colour we can get" });
  field("Material", { validation: list("materials"), defaultFor: "material" });
  field("Thickness", {
    narrow: { key: "THICKNESS", parts: ["material"], fallback: "thicknesses" },
    defaultFor: "thickness",
  });
  field("Finish", {
    narrow: { key: "FINISH", parts: [{ brandOr: "brand" }, "material", "thickness"], fallback: "finishes" },
    defaultFor: "finish",
  });
  field("Colour", {
    narrow: {
      key: "COLOUR",
      parts: [{ brandOr: "brand" }, "material", "thickness", "finish"],
      blankWhen: ["finish"],
      fallback: {
        key: "COLOUR",
        parts: [{ brandOr: "brand" }, "material", "thickness"],
        blankWhen: ["material", "thickness"],
        fallback: "colours",
      },
    },
    defaultFor: "colour",
  });
  field("Edge profile", {
    narrow: { key: "EDGE", parts: ["material"], fallback: "edges" },
    defaultFor: "edge",
  });
  field("Door profile group", {
    narrow: { key: "PROFILEGROUP", parts: ["material", "thickness"], fallback: "profilegroups" },
    defaultFor: "profileGroup",
    hint: "Thermolaminate only. There is nothing to route into a board",
  });
  field("Door profile", {
    narrow: {
      key: "PROFILE",
      parts: ["profileGroup", "material", "thickness"],
      blankWhen: ["profileGroup"],
      fallback: {
        key: "PROFILEANY",
        parts: ["material", "thickness"],
        blankWhen: ["material", "thickness"],
        fallback: "profiles",
      },
    },
    defaultFor: "profile",
  });

  section("WHAT IS ALREADY THERE", "Refresh jobs. What the new doors are going onto.");
  field("Existing hinge brand", { validation: list("hingebrands") });
  field("Door overlay", { validation: list("overlays") });

  row += 1;
  sheet.getRow(row).height = 42;
  sheet.mergeCells(`B${row}:${FIELD_LAST}${row}`);
  const foot = sheet.getCell(`B${row}`);
  foot.value =
    "Now fill in the tabs your job has: Kit fronts for IKEA and Kaboodle, Fronts and panels for anything made to a size " +
    "you measured, Carcasses for the boxes, Hardware for hinges and handles. When you are done, email the file to " +
    "sales@perthcabinetdoors.com.au and we will come back with a written quote. " +
    "This form is not a quote and no prices are shown on it.";
  styleCell(foot, {
    font: { name: "Calibri", size: 9, italic: true, color: { argb: MUTED } },
    align: { vertical: "top", wrapText: true },
  });

  // The job kinds list is only ever asked here, so it is defined here rather
  // than carried through the tree.
  sheet.getCell(`${columnLetter(DETAIL_HELPER_FIRST + 12)}1`).value = "Kit fronts";
  sheet.getCell(`${columnLetter(DETAIL_HELPER_FIRST + 12)}2`).value = "Refresh, fronts only";
  sheet.getCell(`${columnLetter(DETAIL_HELPER_FIRST + 12)}3`).value = "Full custom";
  sheet.getCell(`${columnLetter(DETAIL_HELPER_FIRST + 12)}4`).value = "Mixed";
  workbook.definedNames.add(
    `'${SHEET_DETAILS}'!$${columnLetter(DETAIL_HELPER_FIRST + 12)}$1:$${columnLetter(DETAIL_HELPER_FIRST + 12)}$4`,
    "jobkinds"
  );

  for (let column = DETAIL_HELPER_FIRST; column <= DETAIL_HELPER_FIRST + 12; column += 1) {
    const held = sheet.getColumn(column);
    held.width = 30;
    held.hidden = true;
  }

  await sheet.protect(SHEET_PASSWORD, CUSTOMER_SHEET_PROTECTION);
  return defaults;
}

// ---------------------------------------------------------------------------
// A MEASURING TAB.
// ---------------------------------------------------------------------------

/**
 * The formula for a helper cell: the NAME of the list its column should offer.
 *
 * `cellFor` turns a column key into the address of that answer, so the same
 * builder serves a row on a measuring tab and a field on the details sheet.
 */
function narrowFormula(narrow, cellFor) {
  const part = (entry) => {
    if (typeof entry === "string") return cellFor(entry);
    if (entry && entry.brandOr) return `IF(${cellFor(entry.brandOr)}="",${quote(ANY_BRAND)},${cellFor(entry.brandOr)})`;
    if (entry && entry.literal !== undefined) return quote(entry.literal);
    return quote("");
  };
  // "COLOUR|"&brand&"|"&material&"|"&thickness&"|"&finish, which is exactly what
  // listKey builds on the other side. The two have to agree character for
  // character or every lookup misses.
  const keyExpression = (descriptor) =>
    `${quote(`${descriptor.key}|`)}&${descriptor.parts.map(part).join('&"|"&')}`;
  const lookup = (descriptor) => `IFERROR(VLOOKUP(${keyExpression(descriptor)},keymap,2,FALSE),${quote(EMPTY_LIST)})`;

  // WHAT THE COLUMN OFFERS WHILE THE ONES IT DEPENDS ON ARE BLANK: everything.
  // Narrowing is a convenience and not a gate. Once those columns ARE answered
  // the narrowing is real, and an empty list then is an honest answer rather
  // than a dead end.
  const blankWhen = narrow.blankWhen || narrow.parts.filter((entry) => typeof entry === "string");

  // A fallback can itself be a narrowed list, so the widening happens a step at
  // a time rather than all at once. With the finish blank the colour column
  // still narrows by material and thickness, and only drops to every colour we
  // hold when the material is blank too.
  const fallback = !narrow.fallback
    ? quote(EMPTY_LIST)
    : typeof narrow.fallback === "string"
      ? quote(narrow.fallback)
      : narrowFormula(narrow.fallback, cellFor);

  if (!blankWhen.length) return lookup(narrow);
  const blankTest = blankWhen.map((key) => `${cellFor(key)}=""`).join(",");
  return `IF(OR(${blankTest}),${fallback},${lookup(narrow)})`;
}

const listValidation = (formula) => ({
  type: "list",
  allowBlank: true,
  showErrorMessage: true,
  // WARNING, NEVER STOP. This form is filled in on site. A refusal there is a
  // line that does not get written down, which costs far more than a value we
  // have to match up by hand on the way back in.
  errorStyle: "warning",
  errorTitle: "Not one of ours",
  error:
    "That is not on our list for what you have chosen so far. Pick from the dropdown, or keep what you typed and we will sort it out.",
  formulae: [formula],
});

/** A heading said as the thing being measured, for a warning that reads. */
function measureWords(head) {
  return String(head)
    .replace(/\s*mm\b.*$/i, "")
    .replace(/\s*\(.*$/, "")
    .trim()
    .toLowerCase();
}

function numberValidation(what, { whole = false } = {}) {
  return {
    type: whole ? "whole" : "decimal",
    operator: "greaterThan",
    allowBlank: true,
    showErrorMessage: true,
    errorStyle: "warning",
    errorTitle: `${what[0].toUpperCase()}${what.slice(1)} in millimetres`,
    error: `Give the ${what} as a number in millimetres. 597 rather than 59.7cm. Keep what you typed if you need to and put the detail in the notes.`,
    formulae: [0],
  };
}

const qtyValidation = {
  type: "whole",
  operator: "greaterThan",
  allowBlank: true,
  showErrorMessage: true,
  errorStyle: "warning",
  errorTitle: "How many?",
  error: "A quantity is a whole number of pieces, at least 1.",
  formulae: [0],
};

async function writeMeasuringSheet(sheet, tab, { generatedOn, logo, workbook, defaults }) {
  const { at, help, lastColumn } = geometryFor(tab);

  tab.columns.forEach((column, i) => {
    sheet.getColumn(i + 1).width = column.width;
  });
  sheet.getColumn(lastColumn + 1).width = 2;
  helperKeys(tab).forEach((key) => {
    const column = sheet.getColumn(help[key]);
    column.width = 30;
    column.hidden = true;
  });

  const lastLetter = columnLetter(lastColumn);

  writeMasthead(sheet, {
    lastColumn,
    generatedOn,
    logo,
    workbook,
    subtitle: generatedOn ? `${tab.subtitle} Library as at ${generatedOn}.` : tab.subtitle,
  });

  // ── The instruction strip ─────────────────────────────────────────────────
  sheet.getRow(4).height = 8;
  sheet.getRow(5).height = 32;
  sheet.mergeCells(`A5:${lastLetter}5`);
  const strip = sheet.getCell("A5");
  const [lead, ...rest] = tab.strip.split("   ");
  strip.value = {
    richText: [
      { text: `${lead}   `, font: { name: "Calibri", size: 10, bold: true, color: { argb: DEEP } } },
      { text: rest.join("   "), font: { name: "Calibri", size: 9, color: { argb: MUTED } } },
    ],
  };
  styleCell(strip, { fill: PAPER, align: { vertical: "middle", wrapText: true, indent: 1 } });

  // ── Group band and column headers ─────────────────────────────────────────
  sheet.getRow(GROUP_ROW).height = 18;
  sheet.getRow(HEAD_ROW).height = 34;

  let cursor = 1;
  while (cursor <= lastColumn) {
    const group = tab.columns[cursor - 1].group;
    let span = 1;
    while (cursor + span <= lastColumn && tab.columns[cursor + span - 1].group === group) span += 1;
    const first = columnLetter(cursor);
    const last = columnLetter(cursor + span - 1);
    if (span > 1) sheet.mergeCells(`${first}${GROUP_ROW}:${last}${GROUP_ROW}`);
    const cell = sheet.getCell(`${first}${GROUP_ROW}`);
    cell.value = group ? group.toUpperCase() : "";
    styleCell(cell, {
      fill: group ? DEEP : INK,
      font: { name: "Calibri", size: 9, bold: true, color: { argb: WHITE } },
      align: { vertical: "middle", horizontal: "center" },
    });
    cursor += span;
  }

  tab.columns.forEach((column, i) => {
    const cell = sheet.getCell(`${columnLetter(i + 1)}${HEAD_ROW}`);
    cell.value = column.required ? `${column.head} *` : column.head;
    styleCell(cell, {
      fill: INK,
      font: { name: "Calibri", size: 10, bold: true, color: { argb: column.required ? "FFD4E8D0" : WHITE } },
      align: { vertical: "middle", horizontal: "center", wrapText: true },
      border: { bottom: { style: "medium", color: { argb: ACCENT } } },
    });
  });

  // ── The item rows ─────────────────────────────────────────────────────────
  const lastRow = FIRST_ITEM_ROW + ITEM_ROWS - 1;
  for (let row = FIRST_ITEM_ROW; row <= lastRow; row += 1) {
    writeItemRow(sheet, tab, { at, help, row, defaults });
  }

  // ── The columns that do not apply to this row, shaded rather than shut ────
  //
  // Conditional formatting, so a column reads as "not this one" the moment the
  // row says so. It is only a colour: every one of these cells can still be
  // typed in, which is the difference between a hint and a dead end.
  tab.columns.forEach((column) => {
    if (!column.greyUnless) return;
    const test =
      column.greyUnless === "corner"
        ? `AND($${at.cabinetType}${FIRST_ITEM_ROW}<>"",ISERROR(SEARCH("corner",$${at.cabinetType}${FIRST_ITEM_ROW})))`
        : `$${at.backPanel}${FIRST_ITEM_ROW}="No"`;
    sheet.addConditionalFormatting({
      ref: `${at[column.key]}${FIRST_ITEM_ROW}:${at[column.key]}${lastRow}`,
      rules: [
        {
          type: "expression",
          formulae: [test],
          style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: GREYED } } },
        },
      ],
    });
  });

  // ── Grouping the blocks that can be rolled up ─────────────────────────────
  //
  // The hinge block on the made to measure tab and the rangehood block on the
  // carcasses tab. A job with no doors, or no rangehood, can collapse them and
  // the tab is only as wide as the work is.
  const collapsible = tab.columns.filter((column) => column.group === "Hinges (doors only)" || column.group === "Only when it applies");
  if (collapsible.length > 2) {
    collapsible.forEach((column) => {
      sheet.getColumn(at[column.key]).outlineLevel = 1;
    });
  }

  sheet.autoFilter = { from: `A${HEAD_ROW}`, to: `${lastLetter}${lastRow}` };

  const footRow = lastRow + 2;
  sheet.mergeCells(`A${footRow}:${lastLetter}${footRow}`);
  const foot = sheet.getCell(`A${footRow}`);
  foot.value =
    "Send the completed file to sales@perthcabinetdoors.com.au. We will come back with a written quote before anything is made. " +
    "This form is not a quote and no prices are shown on it.";
  styleCell(foot, {
    font: { name: "Calibri", size: 9, italic: true, color: { argb: MUTED } },
    align: { vertical: "middle", wrapText: true, indent: 1 },
  });
  sheet.getRow(footRow).height = 26;

  // Everything is locked except the cells a person is meant to fill in, which
  // writeItemRow unlocks one by one. Without this a stray paste over the check
  // column takes the validation with it.
  await sheet.protect(SHEET_PASSWORD, CUSTOMER_SHEET_PROTECTION);
}

/** The Excel form of the same rule hingesForHeight applies on this side. */
function hingeCountFormula(heightCell) {
  const above = 5;
  return HINGE_COUNT_BREAKS.reduceRight(
    (inner, step) => `IF(N(${heightCell})<=${step.upToMm},${step.hinges},${inner})`,
    String(above)
  );
}

function writeItemRow(sheet, tab, { at, help, row, defaults }) {
  const cellFor = (key) => `$${at[key]}${row}`;

  // The helper cells. Each works out the NAME of the list its column offers, so
  // the validation beside it never has to be more than INDIRECT of one cell.
  tab.columns.forEach((column) => {
    if (!column.narrow) return;
    sheet.getCell(`${help[column.key]}${row}`).value = { formula: narrowFormula(column.narrow, cellFor) };
  });

  // The standard size pulled apart, so the height and width columns can fill
  // themselves in from it. Zero when nothing is picked, which is what the size
  // formulas and the check both test.
  if (help.stdHeight) {
    const sizeCell = cellFor("frontSize");
    const cut = (from) => `IFERROR(VALUE(${from}),0)`;
    sheet.getCell(`${help.stdHeight}${row}`).value = {
      formula: cut(`LEFT(${sizeCell},FIND(${quote(SIZE_SEPARATOR)},${sizeCell})-1)`),
    };
    sheet.getCell(`${help.stdWidth}${row}`).value = {
      formula: cut(`MID(${sizeCell},FIND(${quote(SIZE_SEPARATOR)},${sizeCell})+${SIZE_SEPARATOR.length},10)`),
    };
  }

  sheet.getCell(`${help.gaps}${row}`).value = { formula: gapsFormula(tab, { at, help, row }) };

  const style = (letter, extra = {}) => {
    const cell = sheet.getCell(`${letter}${row}`);
    styleCell(cell, {
      font: { name: "Calibri", size: 10, color: { argb: INK } },
      align: { vertical: "middle" },
      border: gridBorder,
      ...extra,
    });
    return cell;
  };

  const lineCell = style(at.line, {
    fill: WASH,
    font: { name: "Calibri", size: 9, color: { argb: MUTED } },
    align: { vertical: "middle", horizontal: "center" },
  });
  lineCell.value = row - FIRST_ITEM_ROW + 1;

  tab.columns.forEach((column) => {
    if (column.key === "line" || column.key === "check") return;
    const cell = style(at[column.key], column.required ? { fill: "FFFCFCFA" } : {});
    cell.protection = { locked: false };

    if (column.narrow) cell.dataValidation = listValidation(`INDIRECT($${help[column.key]}${row})`);
    else if (column.list) cell.dataValidation = listValidation(column.list);
    if (column.key === "qty" || column.key === "shelfQty") cell.dataValidation = qtyValidation;
    else if (column.number) cell.dataValidation = numberValidation(measureWords(column.head), { whole: column.wholeNumber });

    if (column.number) {
      cell.numFmt = "0";
      cell.alignment = { vertical: "middle", horizontal: "right" };
    }
    if (column.key === "qty" || column.key === "shelfQty") {
      cell.alignment = { vertical: "middle", horizontal: "center" };
    }
    if (column.key === "notes") cell.alignment = { vertical: "middle", wrapText: true };

    // ── WHAT THE CELL STARTS AS ───────────────────────────────────────────
    //
    // A formula, and typing over it is expected rather than a mistake. That is
    // how a job default gets overridden on the one row that differs, and how a
    // front that is not a standard size gets its own millimetres.
    const formula = startingFormula(column, { at, help, row, defaults });
    if (formula) cell.value = { formula };
  });

  // A blank row says nothing rather than shouting about every column at once.
  //
  // Judged on the columns a PERSON fills in, never on the ones that fill
  // themselves. A job default set on the first tab writes a colour into all
  // hundred rows, and counting those would have every untouched row on every
  // tab reporting itself incomplete.
  const started = answerColumns(tab)
    .filter((column) => !column.defaultFrom && !column.auto)
    .map((column) => `(${cellFor(column.key)}<>"")`)
    .join("+");

  const check = style(at.check, {
    font: { name: "Calibri", size: 9, color: { argb: MUTED } },
    align: { vertical: "middle", wrapText: true },
  });
  check.value = {
    formula:
      `IF(${started}=0,"",` +
      `IF($${help.gaps}${row}="","Ready",` +
      `"Needs: "&LEFT($${help.gaps}${row},LEN($${help.gaps}${row})-2)))`,
  };

  sheet.getRow(row).height = 18;
}

/** What a cell holds before anybody touches it. */
function startingFormula(column, { at, help, row, defaults }) {
  const cellFor = (key) => `$${at[key]}${row}`;

  if (column.auto === "standardHeight") return `IF($${help.stdHeight}${row}=0,"",$${help.stdHeight}${row})`;
  if (column.auto === "standardWidth") return `IF($${help.stdWidth}${row}=0,"",$${help.stdWidth}${row})`;
  // A door is drilled unless somebody says otherwise. A drawer front and a
  // panel are not, and saying "No" on those rows would be answering a question
  // nobody asked about them.
  if (column.auto === "hingeHoles") return `IF(${cellFor("type")}="Door","Yes","")`;
  if (column.auto === "hingeQty") {
    return (
      `IF(${cellFor("hingeHoles")}<>"Yes","",` +
      `IF(N(${cellFor("height")})<=0,"",${hingeCountFormula(cellFor("height"))}))`
    );
  }
  if (column.auto === "backPanel") return `IF(${cellFor("cabinetType")}="","","Yes")`;

  // A job default, read off the first tab. Blank there means blank here, so a
  // job that has not set one is not given an answer it did not choose.
  if (column.defaultFrom && defaults && defaults[column.defaultFrom]) {
    const ref = defaults[column.defaultFrom].ref;
    return `IF(${ref}="","",${ref})`;
  }
  return "";
}

/**
 * What is missing on this row, as one string ending in ", " per part.
 *
 * Kept out of the check column so that formula stays readable, and so the same
 * string can be reused without being written three times.
 */
function gapsFormula(tab, { at, help, row }) {
  const cellFor = (key) => `$${at[key]}${row}`;
  const parts = [];

  answerColumns(tab).forEach((column) => {
    if (!column.required) return;
    const test = column.number ? `N(${cellFor(column.key)})<=0` : `${cellFor(column.key)}=""`;
    parts.push(`IF(${test},${quote(`${column.gap || column.head.toLowerCase()}, `)},"")`);
  });

  const has = (key) => Boolean(at[key]);

  // The drilling. Blank positions are the normal answer and mean our standard
  // ones, so there is nothing to nag about there. One end without the other is
  // a different thing: it is half a pattern, which is what somebody leaves
  // behind when they are interrupted mid-thought.
  if (has("hingeHoles")) {
    parts.push(
      `IF(AND(${cellFor("hingeHoles")}="Yes",${cellFor("hingeQty")}=""),${quote("how many hinges per door, ")},"")`
    );
    parts.push(
      `IF(AND(${cellFor("hingeHoles")}="Yes",${cellFor("hingeSide")}=""),${quote("which side the hinges go, ")},"")`
    );
  }
  if (has("hingeFromBottom")) {
    parts.push(
      `IF(OR(AND(N(${cellFor("hingeFromBottom")})>0,N(${cellFor("hingeFromTop")})<=0),` +
        `AND(N(${cellFor("hingeFromTop")})>0,N(${cellFor("hingeFromBottom")})<=0)),` +
        `${quote("both hinge positions, or neither, ")},"")`
    );
    // A middle cup on a door with nothing to space it between.
    parts.push(
      `IF(AND(OR(N(${cellFor("hingeMiddle1")})>0,N(${cellFor("hingeMiddle2")})>0),` +
        `OR(N(${cellFor("hingeFromBottom")})<=0,N(${cellFor("hingeFromTop")})<=0)),` +
        `${quote("the bottom and top hinge as well, ")},"")`
    );
  }

  // THE ONES A DROPDOWN CANNOT PREVENT: an answer chosen first and then had the
  // column it depends on changed underneath it. Each asks the SAME list the
  // dropdown offers, so none of them can disagree with it.
  const stale = (key, words) => {
    if (!has(key) || !help[key]) return;
    parts.push(
      `IF(AND(${cellFor(key)}<>"",COUNTIF(INDIRECT($${help[key]}${row}),${cellFor(key)})=0),${quote(`${words}, `)},"")`
    );
  };
  stale("colour", "a colour that comes in that thickness");
  stale("carcassColour", "a carcass colour that comes in that thickness");
  stale("edge", "an edge profile that suits that material");
  // The one that catches a profile picked on a thermolaminate line and then the
  // material changed to decorative board, which cannot be routed at all.
  stale("profileGroup", "no door profile (only thermolaminate can be routed)");
  stale("profile", "a door profile made in that material and thickness");
  stale("hardware", "a hardware item of that kind");

  // A standard size left behind when somebody typed over the height or width
  // it filled in.
  if (help.stdHeight) {
    parts.push(
      `IF(AND($${help.stdHeight}${row}>0,` +
        `OR(N(${cellFor("height")})<>$${help.stdHeight}${row},N(${cellFor("width")})<>$${help.stdWidth}${row})),` +
        `${quote("the height and width to match the standard size, or clear the standard size, ")},"")`
    );
  }

  // A corner box is two widths. Without the return leg there is no cut list.
  if (has("secondaryWidth")) {
    parts.push(
      `IF(AND(ISNUMBER(SEARCH("corner",${cellFor("cabinetType")})),N(${cellFor("secondaryWidth")})<=0),` +
        `${quote("the second width for a corner, ")},"")`
    );
  }

  return parts.join("&");
}

// ---------------------------------------------------------------------------

async function writeHelpSheet(sheet, { generatedOn }) {
  sheet.getColumn(1).width = 4;
  sheet.getColumn(2).width = 30;
  sheet.getColumn(3).width = 96;

  const heading = (at, textValue) => {
    sheet.mergeCells(`B${at}:C${at}`);
    const cell = sheet.getCell(`B${at}`);
    cell.value = textValue;
    styleCell(cell, {
      font: { name: "Calibri", size: 12, bold: true, color: { argb: DEEP } },
      align: { vertical: "middle" },
    });
    sheet.getRow(at).height = 26;
  };

  const item = (at, term, detail) => {
    const termCell = sheet.getCell(`B${at}`);
    termCell.value = term;
    styleCell(termCell, {
      font: { name: "Calibri", size: 10, bold: true, color: { argb: INK } },
      align: { vertical: "top", wrapText: true },
    });
    const detailCell = sheet.getCell(`C${at}`);
    detailCell.value = detail;
    styleCell(detailCell, {
      font: { name: "Calibri", size: 10, color: { argb: MUTED } },
      align: { vertical: "top", wrapText: true },
    });
    sheet.getRow(at).height = Math.max(18, Math.ceil(detail.length / 95) * 15 + 4);
  };

  sheet.mergeCells("B2:C2");
  const title = sheet.getCell("B2");
  title.value = "How to fill this in";
  styleCell(title, { font: { name: "Calibri", size: 20, bold: true, color: { argb: INK } } });
  sheet.getRow(2).height = 34;

  sheet.mergeCells("B3:C3");
  const sub = sheet.getCell("B3");
  sub.value = generatedOn
    ? `Perth Cabinet Doors. Colours, profiles and hardware as at ${generatedOn}.`
    : "Perth Cabinet Doors.";
  styleCell(sub, { font: { name: "Calibri", size: 10, color: { argb: MUTED } } });

  let row = 5;
  const block = (title2, entries) => {
    heading(row, title2);
    row += 1;
    entries.forEach(([term, detail]) => {
      item(row, term, detail);
      row += 1;
    });
    row += 1;
  };

  block("Nothing here can stop you", [
    [
      "Type it anyway",
      "Every dropdown warns and then lets your answer through. If a list has not got what you need, type it, click through the warning and keep measuring. We match it up at this end rather than you losing the line.",
    ],
    [
      "Answer in any order",
      "A dropdown whose earlier columns are still blank shows you everything rather than telling you to go back a column. Filling them in left to right just makes the lists shorter.",
    ],
    [
      "Nothing is compulsory",
      'A star on a heading means we need it before we can price the line, and the last column tells you what is still missing on that row. Neither one stops you typing, and neither stops you sending the form.',
    ],
  ]);

  block("Which tab", [
    ["Start here", "Fill this page in first. The email address is where the quote goes back to, and the colour block near the bottom fills in every row on every other tab."],
    ["Kit fronts", "Doors, drawer fronts and panels going onto an IKEA or Kaboodle carcass. Pick the range and the standard size and the millimetres fill themselves in."],
    ["Fronts and panels", "Anything made to a size you measured. Replacement doors on an existing kitchen, and the fronts of a custom job. This is the tab with the hinge positions on it."],
    ["Carcasses", "The boxes, when we are making them. A cabinet is priced off its cut list, so this tab asks about the box: height, width, depth, back, shelves."],
    ["Hardware", "Hinges, runners, handles and legs ordered as their own lines, with a quantity and who is supplying them."],
  ]);

  block("The short version", [
    ["1. One row per size", "A row is one size of one thing. Six identical doors are one row with a quantity of 6. Six different sizes are six rows."],
    ["2. Use the same cabinet reference across tabs", "A box on the Carcasses tab and its doors on Fronts and panels should carry the same reference. That is how they are read back as one cabinet."],
    ["3. Watch the last column", 'It tells you what is still missing on that line, and says "Ready" when there is enough there for us to quote it.'],
    ["4. Send it back", "Email the file to sales@perthcabinetdoors.com.au."],
  ]);

  block("Sizes are always height first", [
    [
      "Height, then Width",
      "Every size on this form, on our quotes and on our workshop sheets is written height first. Height is up the door, width is across it. Millimetres, as numbers: 597, not 59.7cm.",
    ],
    [
      "Depth is the carcass",
      "On the Carcasses tab, depth is the box itself and not the finished depth with a front on it. We add the front.",
    ],
  ]);

  block("Kit fronts", [
    [
      "Cabinet range",
      "IKEA Metod, IKEA Besta, IKEA Pax, Kaboodle. We do not sell the cabinets, only the fronts and panels that go on them. Naming the range is how we know which sizes you mean.",
    ],
    [
      "Front type before the size",
      "A Metod drawer front comes in different heights to a Metod door, so the type is asked first and the size list follows it. Choose the type and the sizes narrow to real ones.",
    ],
    [
      "If your size is not on the list",
      "Then it is not a standard front, and it belongs on the Fronts and panels tab where you type the height and width yourself. We are happy to make a size IKEA does not.",
    ],
    [
      "Hinge positions are not asked here",
      "A kit front is bored to its range's own pattern, so there is nothing to measure. A front that has to match positions you measured goes on Fronts and panels.",
    ],
  ]);

  block("Fronts and panels", [
    [
      "What is the panel",
      "An end panel, a filler, a kickboard and a bulkhead all quote as a panel, and they are all made differently. This column is how the workshop knows which one it is.",
    ],
    [
      "Grain direction",
      'Leave it on Standard and we run the grain the way we always do: up a door, across a drawer front. Set it when a run has to match something already there.',
    ],
    [
      "Edges to finish",
      "All four is the standard and what you get if you leave it blank. Say so here when a panel is scribed into a wall and one edge is never seen.",
    ],
    [
      "Thickness before Colour",
      "This one matters. We hold a colour per material AND thickness, and plenty of colours come in one and not the other. Choosing the thickness first is what makes the colour list correct rather than hopeful.",
    ],
    [
      "Profile group and Door profile",
      "A routed profile is a thermolaminate thing and only a thermolaminate thing: it is a vinyl skin pressed over a routed face, and there is nothing to press onto a decorative board or a compact laminate. Both columns come up empty unless the material is Thermolaminate.",
    ],
  ]);

  block("Hinges", [
    [
      "Drill hinge holes",
      "Fills itself in as Yes on a door and blank on anything else. A door that needed drilling and did not get it is scrap, and a door drilled that should not have been is the same, so this one is worth being certain about.",
    ],
    [
      "Hinges per door",
      "Fills itself in from the door height: two up to 900, three to 1600, four to 2000, five above that. Change it whenever you want to, because weight is what really decides it.",
    ],
    [
      "Hinge side",
      "Which side the hinges go as you look at the front of the door. A matched pair is TWO rows, one hinged left and one hinged right, not one row with a quantity of two. We drill them as mirror images, so they have to be asked for separately or they come back identical.",
    ],
    [
      "Bottom hinge, mm from bottom",
      "Measured from the bottom edge of the door up to the CENTRE of the bottom hinge cup. Leave it blank, along with the top, and we set every cup the way we always do, which is right almost every time. Fill both in when you are matching an existing run.",
    ],
    [
      "Top hinge, mm from top",
      "Measured from the top edge of the door down to the CENTRE of the top hinge cup. Extra hinges are spaced evenly between these two, so these two numbers are the whole specification.",
    ],
    [
      "2nd and 3rd hinge",
      "Only on a door that hangs on three or four AND was not drilled evenly. Blank is normal.",
    ],
  ]);

  block("Carcasses", [
    [
      "One row per box",
      "Two identical cabinets are one row with a quantity of 2. The doors and drawer fronts are not on this tab: they are rows on Fronts and panels carrying the same cabinet reference.",
    ],
    [
      "Second width",
      "Only a corner has one. It is the return leg, and the column shades itself grey on a cabinet type that is not a corner. You can still type in it.",
    ],
    [
      "Shelves",
      'How many, and where they sit measured up from the bottom: "300, 600, 900". Leave the heights blank and they space evenly, which is what we do anyway.',
    ],
    [
      "Shelf colour and thickness",
      "Blank means the same board as the box, which is the usual answer. Fill them in only when the shelves are different.",
    ],
    [
      "Mount height",
      "Floor to the underside of the box. Wall cabinets and anything hung.",
    ],
  ]);

  block("Hardware", [
    [
      "Type first, then the item",
      "The kind of hardware narrows the item list to something you can scroll. Both come from what we actually stock.",
    ],
    [
      "Supplied by",
      "Say when the customer is buying it themselves. It is recorded on the quote either way, and priced only when it is ours to supply.",
    ],
    [
      "Hinges you want us to supply",
      "Go here, as their own line, rather than as a note on a door. That way they are priced and picked as stock.",
    ],
  ]);

  block("Why some of the sheet will not let you type in it", [
    [
      "The cells you fill in are open, the rest is not",
      "Everything you are meant to answer can be typed in or picked from a dropdown. The line numbers, the last column and the workings behind the dropdowns are locked, because clearing one of those breaks the dropdown beside it and nothing tells you it has happened.",
    ],
    [
      "To clear a row",
      "Select the columns you filled in, from the second column across to Notes, and press Delete. Selecting the whole row including the line number will not work, because the line number is locked.",
    ],
    [
      "There are a hundred rows on each tab",
      "If your job needs more than that, fill this one in, send it, and start a second copy. Rows cannot be added to a protected sheet.",
    ],
    [
      "If you really need it unlocked",
      "Ask us and we will tell you the password. There is nothing hidden in here, it is only locked so it cannot be broken by accident.",
    ],
  ]);

  block("If your Excel does not show the dropdowns", [
    [
      "Open it in Excel",
      "The filtering is built on Excel formulas. Google Sheets and Numbers will open the file and keep everything you type, but the dropdowns will not filter. If you cannot use Excel, fill in what you can, put the rest in the Notes column, and we will confirm it with you.",
    ],
    [
      "Enable editing",
      'A file emailed to you opens read-only in Protected View. Click "Enable Editing" at the top and the dropdowns come to life.',
    ],
  ]);

  await sheet.protect(SHEET_PASSWORD, CUSTOMER_SHEET_PROTECTION);
}

// ---------------------------------------------------------------------------

async function writeColourSheet(sheet, tree) {
  const heads = ["Brand", "Material", "Thickness", "Finish", "Colour"];
  const widths = [16, 20, 12, 18, 34];
  heads.forEach((head, i) => {
    sheet.getColumn(i + 1).width = widths[i];
    const cell = sheet.getCell(`${columnLetter(i + 1)}1`);
    cell.value = head;
    styleCell(cell, {
      fill: INK,
      font: { name: "Calibri", size: 10, bold: true, color: { argb: WHITE } },
      align: { vertical: "middle" },
      border: { bottom: { style: "medium", color: { argb: ACCENT } } },
    });
  });
  sheet.getRow(1).height = 24;

  const sorted = [...tree.colourRows].sort(
    (a, b) =>
      a.name.localeCompare(b.name) ||
      a.material.localeCompare(b.material) ||
      a.thickness.localeCompare(b.thickness)
  );
  sorted.forEach((row, i) => {
    const at = i + 2;
    [row.brand, row.material, row.thickness, row.finish, row.name].forEach((value, column) => {
      const cell = sheet.getCell(`${columnLetter(column + 1)}${at}`);
      cell.value = value;
      styleCell(cell, {
        font: { name: "Calibri", size: 10, color: { argb: INK } },
        align: { vertical: "middle" },
        border: gridBorder,
        fill: i % 2 ? PAPER : WHITE,
      });
    });
  });

  sheet.autoFilter = { from: "A1", to: `E${sorted.length + 1}` };
  await sheet.protect(SHEET_PASSWORD, CUSTOMER_SHEET_PROTECTION);
}

export { NOT_A_KIT_CABINET };
