// THE BRANDED EXCEL ORDER FORM.
//
// A customer who will not use the website form gets this instead: the same
// questions, the same answers to choose from, in a file they will actually
// fill in. What comes back can be read straight down the columns instead of
// being deciphered out of an email.
//
// THREE SHEETS A CUSTOMER SEES. "Your Details" is the job and the customer,
// set up to print on one A4 page. "Order Form" is the items. "How to fill this
// in" is the plain words. Two more are hidden: "Lists" is the machinery behind
// every dropdown, and "Colour list" is a full copy of the library that used to
// be a tab and is kept only because the sheet is cheap to carry.
//
// EVERY SHEET IS PASSWORD PROTECTED and every cell a person fills in is
// unlocked. See SHEET_PASSWORD: it is there to stop the machinery being edited
// by accident, not to keep anybody out of their own form.
//
// HOW THE DROPDOWNS FILTER. Excel has no way to say "offer the colours for
// whatever material this row picked", so every reachable combination is
// published as its own named range on a hidden sheet, and a lookup table maps
// a row's answers so far onto the name of the list the next column should
// offer (see lib/pcd-order-form-data.js).
//
// Each filtered column then has two pieces: a hidden helper cell that works out
// WHICH list applies, and a validation that is only ever `INDIRECT(<that
// cell>)`. Keeping the logic in an ordinary cell formula and the validation
// trivial is deliberate: Excel is fussy about what it will accept inside a
// validation, and a profile name or a category with punctuation in it is how
// that breaks. Looking the list up in a table cannot break.
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
import {
  ANY_BRAND,
  CHOOSE_EARLIER_FIRST,
  NOT_A_KIT_CABINET,
  SIZE_SEPARATOR,
  buildOptionTree,
} from "./pcd-order-form-data";

// Brand palette, from app/globals.css so the sheet matches the site.
const INK = "FF1C2B1E"; // --color-brand-700, the sidebar green
const DEEP = "FF2D5E28"; // --accent-dark
const ACCENT = "FF6B9E61"; // --accent
const PAPER = "FFFAF9F6"; // --page-bg
const LINE = "FFDBD8CC"; // --border
const WASH = "FFEDF4EB"; // --accent-light
const MUTED = "FF5A5A52"; // --text-muted
const WHITE = "FFFFFFFF";

export const SHEET_DETAILS = "Your Details";
export const SHEET_ORDER = "Order Form";
export const SHEET_HELP = "How to fill this in";
export const SHEET_COLOURS = "Colour list";
export const SHEET_LISTS = "Lists";

/** How many blank item rows the form ships with. */
export const ITEM_ROWS = 100;

/** First row of the item table, and the header row above it. */
const GROUP_ROW = 6;
const HEAD_ROW = 7;
const FIRST_ITEM_ROW = 8;

// The visible columns, in the order they are answered.
//
// The kit cabinet block sits between the type and the board because that is the
// order the answers actually arrive in: what it is, whose carcass it goes on,
// which of their sizes, and only then what it is made of.
// Exported because the IMPORTER reads the same list. A sheet is matched to our
// fields by heading, so the writer and the reader have to agree about what the
// headings are, and two copies of that list is one copy that can be wrong.
export const COLUMNS = [
  { key: "line", head: "#", width: 5, group: "" },
  { key: "brand", head: "Brand", width: 15, group: "The item" },
  { key: "type", head: "Type", width: 15, group: "The item", required: true },
  // ONE question, not two. "IKEA Metod" already names the brand and the range,
  // so a second "which range" column had nothing left to ask. It is also the
  // same list the website form and the quote editor offer, so an answer here
  // is the same answer there.
  { key: "cabinet", head: "Which cabinet", width: 18, group: "Cabinet" },
  { key: "frontSize", head: `Standard size (height${SIZE_SEPARATOR}width)`, width: 20, group: "Cabinet" },
  { key: "material", head: "Material", width: 19, group: "Board", required: true },
  { key: "thickness", head: "Thickness", width: 11, group: "Board", required: true },
  { key: "finish", head: "Finish", width: 15, group: "Board" },
  { key: "colour", head: "Colour", width: 26, group: "Board", required: true },
  { key: "edge", head: "Edge profile", width: 22, group: "Profiles" },
  { key: "profileGroup", head: "Profile group", width: 16, group: "Profiles" },
  { key: "profile", head: "Door profile", width: 20, group: "Profiles" },
  { key: "height", head: "Height mm", width: 11, group: "Size", required: true },
  { key: "width", head: "Width mm", width: 11, group: "Size", required: true },
  { key: "qty", head: "Qty", width: 7, group: "Size", required: true },
  { key: "hingeHoles", head: "Drill hinge holes", width: 16, group: "Hinges (doors only)" },
  { key: "hingeQty", head: "Hinges per door", width: 15, group: "Hinges (doors only)" },
  { key: "hingeSide", head: "Hinge side", width: 16, group: "Hinges (doors only)" },
  // The two numbers that actually locate the drilling, and the same datum the
  // workshop reads: the bottom hinge measured up from the bottom edge, the top
  // hinge measured down from the top edge. Anything in between is spaced evenly
  // between those two and is not drilled independently, so two numbers is the
  // whole specification however many hinges the door hangs on.
  { key: "hingeFromBottom", head: "Bottom hinge, mm from bottom", width: 17, group: "Hinges (doors only)" },
  { key: "hingeFromTop", head: "Top hinge, mm from top", width: 17, group: "Hinges (doors only)" },
  // The cups in between, on a door that hangs on three or four. Left blank they
  // space evenly, which is what we do anyway; they are here for the door being
  // matched to an existing one that was not drilled evenly.
  { key: "hingeMiddle1", head: "2nd hinge, mm from bottom", width: 16, group: "Hinges (doors only)" },
  { key: "hingeMiddle2", head: "3rd hinge, mm from bottom", width: 16, group: "Hinges (doors only)" },
  { key: "hardware", head: "Hardware item", width: 30, group: "Hardware lines" },
  { key: "notes", head: "Notes for this line", width: 40, group: "Notes" },
  { key: "check", head: "Is this line complete?", width: 42, group: "Notes" },
];

const columnAt = (key) => COLUMNS.findIndex((column) => column.key === key) + 1;

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

const AT = Object.fromEntries(COLUMNS.map((column) => [column.key, columnLetter(columnAt(column.key))]));

// The hidden helper columns, past a blank gutter so nothing lands beside the
// notes by accident. Most hold the NAME of the list their column should offer;
// the last three hold the standard size pulled apart and the list of what is
// still missing.
const HELPERS = [
  "material",
  "thickness",
  "finish",
  "colour",
  "edge",
  "profileGroup",
  "profile",
  "frontSize",
  "stdHeight",
  "stdWidth",
  "gaps",
];
const HELPER_START = COLUMNS.length + 2;
const HELP_AT = Object.fromEntries(HELPERS.map((key, i) => [key, columnLetter(HELPER_START + i)]));

// THE PASSWORD ON THE SHEETS.
//
// Not a secret and not security. It is there so that the machinery of this
// workbook cannot be edited by accident: the hidden helper columns, the check
// formulas, the line numbers, the lists behind every dropdown. A customer who
// clears a helper cell breaks the dropdown beside it and gets nothing to say
// why, and the first anybody here knows is a returned form with half its
// answers missing.
//
// Every cell a person is meant to fill in is unlocked, on both sheets, so none
// of this is in their way. Nothing here stops them typing, pasting, or writing
// over the height and width a standard size filled in.
export const SHEET_PASSWORD = "pcdorderform2026";

// What protection allows on the sheets a customer works in.
//
// formatColumns is DENIED on purpose. It is what would otherwise let somebody
// unhide the helper columns, and a customer editing one of those is the exact
// accident the password is here to prevent. Row height stays theirs, so a long
// note still grows its row.
const CUSTOMER_SHEET_PROTECTION = {
  selectLockedCells: true,
  selectUnlockedCells: true,
  formatColumns: false,
  formatRows: true,
  autoFilter: true,
  sort: true,
};

/** The named range offered when the columns it depends on are not filled in. */
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

// ---------------------------------------------------------------------------

/**
 * @param {object} input
 * @param {Array} input.colours   pcd_colour_library rows
 * @param {Array} input.hardware  pcd_hardware rows
 * @param {string} input.generatedOn  the date printed on the sheet
 * @param {Buffer|null} input.logo    horizontal PCD logo, PNG
 * @returns {Promise<ExcelJS.Workbook>}
 */
export async function buildOrderFormWorkbook({
  colours = [],
  hardware = [],
  generatedOn = "",
  logo = null,
} = {}) {
  const tree = buildOptionTree({ colours, hardware });

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
  const order = workbook.addWorksheet(SHEET_ORDER, {
    views: [{ state: "frozen", xSplit: 3, ySplit: HEAD_ROW, showGridLines: false }],
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: `${GROUP_ROW}:${HEAD_ROW}`,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
  });
  const help = workbook.addWorksheet(SHEET_HELP, { views: [{ showGridLines: false }] });
  // OUT OF THE TAB STRIP. The dropdowns already narrow the colours to what we
  // stock in the material and thickness chosen, which is the part that has to
  // be right; a browsable copy of the whole library beside it is clutter on a
  // form and a stock list we are handing out. veryHidden rather than hidden, so
  // it cannot be brought back through Unhide and edited by somebody who then
  // believes they have changed what we stock.
  const colourSheet = workbook.addWorksheet(SHEET_COLOURS, {
    state: "veryHidden",
    views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
  });
  const lists = workbook.addWorksheet(SHEET_LISTS, { state: "veryHidden" });

  await writeLists(workbook, lists, tree);
  await writeDetailsSheet(details, { generatedOn, logo, workbook });
  // The logo goes on BOTH sheets a customer looks at. They are two tabs of one
  // document and one of them turning up plain reads as a different, less
  // careful document.
  await writeOrderSheet(order, { generatedOn, logo, workbook });
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

  // The placeholder list. A dropdown whose earlier columns are blank opens on
  // this one line rather than on an error, so it says what to do instead of
  // looking broken.
  const noneLetter = columnLetter(column);
  sheet.getCell(`${noneLetter}1`).value = CHOOSE_EARLIER_FIRST;
  defineName(EMPTY_LIST, `$${noneLetter}$1`, `$${noneLetter}$1`);
  column += 1;

  const fixed = {
    brands: tree.brands,
    types: tree.types,
    cabinets: tree.cabinets,
    yesno: ["Yes", "No"],
    hingecounts: ["2", "3", "4", "5", "6"],
    // Handing is the one that reaches the workshop wrong most often, and it is
    // deliberately only two answers. A door is hinged left or it is hinged
    // right; there is no third state to pick, and a "pair" is not one door, it
    // is two doors that need drilling as mirror images. Offering it as one
    // answer let a pair be ordered on a single line, which the workshop then
    // has to interpret, and interpreting handing is exactly how a pair reaches
    // the customer as two identical doors.
    hingesides: ["Left", "Right"],
    hardwareitems: tree.hardware.length ? tree.hardware : [CHOOSE_EARLIER_FIRST],
    delivery: ["Delivery", "Pickup from Myaree"],
    states: ["WA", "SA", "NT", "QLD", "NSW", "ACT", "VIC", "TAS"],
    // The same list the website asks the question with, so a customer who has
    // filled that in once is answering the same question the same way.
    cabinetbrands: CABINET_BRANDS,
  };
  Object.entries(fixed).forEach(([name, values]) => {
    const letter = columnLetter(column);
    values.forEach((value, i) => {
      sheet.getCell(`${letter}${i + 1}`).value = value;
    });
    defineName(name, `$${letter}$1`, `$${letter}$${values.length}`);
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
// The masthead, shared by the two sheets a customer looks at.
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
  // sheet, which on the item tab is twenty seven columns away from the logo and
  // reads as two unrelated things rather than one masthead.
  styleCell(titleCell, { align: { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 } });
}

// ---------------------------------------------------------------------------
// SHEET ONE: who they are and where it is going.
//
// Everything the website form asks, plus what an ORDER needs that a website
// enquiry does not: a full address rather than a suburb, and a company name for
// the trade customers this form is really for.
// ---------------------------------------------------------------------------

const DETAIL_LAST_COLUMN = 6;

// Every answer box is the same width and every hint sits under the box it is
// about. Both of those were learned the hard way: fields of three different
// widths stacked down a page look like a mistake even when each one is
// deliberate, and a hint parked in the column to the right needs a column wide
// enough to hold it, which on A4 there is not, so it wrapped and got cut off.
const DETAIL_FIELD_FIRST = 3;

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
    subtitle: "Fill this page in first, then the Order Form tab.",
  });

  const FIELD_FIRST = columnLetter(DETAIL_FIELD_FIRST);
  const FIELD_LAST = columnLetter(DETAIL_LAST_COLUMN);
  let row = 5;

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
   */
  const field = (label, { required = false, validation = null, hint = "", height = 22 } = {}) => {
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
    if (validation) valueCell.dataValidation = validation;
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

  const list = (name) => ({ type: "list", allowBlank: true, formulae: [name] });

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
  field("Cabinet brand", {
    validation: list("cabinetbrands"),
    hint: "Whose carcasses the fronts are going on",
  });
  field("Date needed by", { hint: "Approximate is fine" });
  field("Anything else we should know", {
    height: 54,
    hint: "Timing, site conditions, anything that helps us quote it properly",
  });

  row += 1;
  sheet.getRow(row).height = 40;
  sheet.mergeCells(`B${row}:${FIELD_LAST}${row}`);
  const foot = sheet.getCell(`B${row}`);
  foot.value =
    "Now fill in the Order Form tab, one row per size. When you are done, email the file to " +
    "sales@perthcabinetdoors.com.au and we will come back with a written quote. " +
    "This form is not a quote and no prices are shown on it.";
  styleCell(foot, {
    font: { name: "Calibri", size: 9, italic: true, color: { argb: MUTED } },
    align: { vertical: "top", wrapText: true },
  });

  await sheet.protect(SHEET_PASSWORD, CUSTOMER_SHEET_PROTECTION);
}

// ---------------------------------------------------------------------------

async function writeOrderSheet(sheet, { generatedOn, logo, workbook }) {
  COLUMNS.forEach((column, i) => {
    sheet.getColumn(i + 1).width = column.width;
  });
  sheet.getColumn(COLUMNS.length + 1).width = 2;
  HELPERS.forEach((key) => {
    const column = sheet.getColumn(HELP_AT[key]);
    column.width = 30;
    column.hidden = true;
  });

  const lastLetter = columnLetter(COLUMNS.length);

  writeMasthead(sheet, {
    lastColumn: COLUMNS.length,
    generatedOn,
    logo,
    workbook,
    subtitle: generatedOn
      ? `Your items. Colours, profiles and hardware as at ${generatedOn}.`
      : "Your items.",
  });

  // ── The instruction strip ─────────────────────────────────────────────────
  sheet.getRow(4).height = 8;
  sheet.getRow(5).height = 30;
  sheet.mergeCells(`A5:${lastLetter}5`);
  const strip = sheet.getCell("A5");
  strip.value = {
    richText: [
      { text: "ONE ROW PER SIZE   ", font: { name: "Calibri", size: 10, bold: true, color: { argb: DEEP } } },
      {
        text:
          "Six identical doors are one row with a quantity of 6. Work left to right: each column only offers what fits what you have already chosen. " +
          "The last column tells you whether the line is complete.",
        font: { name: "Calibri", size: 9, color: { argb: MUTED } },
      },
    ],
  };
  styleCell(strip, { fill: PAPER, align: { vertical: "middle", wrapText: true, indent: 1 } });

  // ── Group band and column headers ─────────────────────────────────────────
  sheet.getRow(GROUP_ROW).height = 18;
  sheet.getRow(HEAD_ROW).height = 34;

  let at = 1;
  while (at <= COLUMNS.length) {
    const group = COLUMNS[at - 1].group;
    let span = 1;
    while (at + span <= COLUMNS.length && COLUMNS[at + span - 1].group === group) span += 1;
    const first = columnLetter(at);
    const last = columnLetter(at + span - 1);
    if (span > 1) sheet.mergeCells(`${first}${GROUP_ROW}:${last}${GROUP_ROW}`);
    const cell = sheet.getCell(`${first}${GROUP_ROW}`);
    cell.value = group ? group.toUpperCase() : "";
    styleCell(cell, {
      fill: group ? DEEP : INK,
      font: { name: "Calibri", size: 9, bold: true, color: { argb: WHITE } },
      align: { vertical: "middle", horizontal: "center" },
    });
    at += span;
  }

  COLUMNS.forEach((column, i) => {
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
    writeItemRow(sheet, row);
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

function writeItemRow(sheet, row) {
  const brandOrAny = `IF($${AT.brand}${row}="",${quote(ANY_BRAND)},$${AT.brand}${row})`;
  const lookup = (key) => `IFERROR(VLOOKUP(${key},keymap,2,FALSE),${quote(EMPTY_LIST)})`;

  // The helper cells. Each works out the NAME of the list its column offers, so
  // the validation beside it never has to be more than INDIRECT of one cell.
  const helpers = {
    material: lookup(`${quote("MATERIAL|")}&$${AT.type}${row}`),
    thickness: lookup(`${quote("THICKNESS|")}&$${AT.material}${row}`),
    finish: lookup(`${quote("FINISH|")}&${brandOrAny}&"|"&$${AT.material}${row}&"|"&$${AT.thickness}${row}`),
    colour: lookup(
      `${quote("COLOUR|")}&${brandOrAny}&"|"&$${AT.material}${row}&"|"&$${AT.thickness}${row}&"|"&$${AT.finish}${row}`
    ),
    edge: lookup(`${quote("EDGE|")}&$${AT.material}${row}`),
    // A routed profile is a thermolaminate thing and the thickness decides which
    // ranges are on. Both come from the material and thickness, not from the
    // profile group, so a decorative board row offers nothing at all here.
    profileGroup: lookup(`${quote("PROFILEGROUP|")}&$${AT.material}${row}&"|"&$${AT.thickness}${row}`),
    profile: lookup(
      `${quote("PROFILE|")}&$${AT.profileGroup}${row}&"|"&$${AT.material}${row}&"|"&$${AT.thickness}${row}`
    ),
    // Reached from the Cabinet answer and the piece type. Split by type because
    // a Metod drawer front comes 100, 200 or 400 high and a Metod door never
    // does; one combined list would offer a door size that does not exist.
    frontSize: lookup(`${quote("FRONTSIZE|")}&${AT.cabinet}${row}&"|"&${AT.type}${row}`),
  };
  Object.entries(helpers).forEach(([key, formula]) => {
    sheet.getCell(`${HELP_AT[key]}${row}`).value = { formula };
  });

  // The standard size pulled apart, so the height and width columns can fill
  // themselves in from it. Zero when nothing is picked, which is what the size
  // formulas and the check both test.
  const sizeCell = `$${AT.frontSize}${row}`;
  const cut = (from) =>
    `IFERROR(VALUE(${from}),0)`;
  sheet.getCell(`${HELP_AT.stdHeight}${row}`).value = {
    formula: cut(`LEFT(${sizeCell},FIND(${quote(SIZE_SEPARATOR)},${sizeCell})-1)`),
  };
  sheet.getCell(`${HELP_AT.stdWidth}${row}`).value = {
    formula: cut(`MID(${sizeCell},FIND(${quote(SIZE_SEPARATOR)},${sizeCell})+${SIZE_SEPARATOR.length},10)`),
  };

  // What is missing, as one string ending in ", " per part. Kept out of the
  // check column so that formula stays readable, and so the same string can be
  // reused without being written three times.
  const gaps = [
    `IF($${AT.type}${row}="",${quote("a product type, ")},"")`,
    `IF($${AT.material}${row}="",${quote("a material, ")},"")`,
    `IF($${AT.thickness}${row}="",${quote("a thickness, ")},"")`,
    `IF($${AT.colour}${row}="",${quote("a colour, ")},"")`,
    `IF(N($${AT.height}${row})<=0,${quote("a height, ")},"")`,
    `IF(N($${AT.width}${row})<=0,${quote("a width, ")},"")`,
    `IF(N($${AT.qty}${row})<=0,${quote("a quantity, ")},"")`,
    `IF(AND($${AT.hingeHoles}${row}="Yes",$${AT.hingeQty}${row}=""),${quote("how many hinges per door, ")},"")`,
    `IF(AND($${AT.hingeHoles}${row}="Yes",$${AT.hingeSide}${row}=""),${quote("which side the hinges go, ")},"")`,
    // Blank positions are the normal answer and mean our standard ones, so
    // there is nothing to nag about there. One end without the other is a
    // different thing: it is half a pattern, which is what somebody leaves
    // behind when they are interrupted mid-thought.
    `IF(OR(AND(N(${AT.hingeFromBottom}${row})>0,N(${AT.hingeFromTop}${row})<=0),` +
      `AND(N(${AT.hingeFromTop}${row})>0,N(${AT.hingeFromBottom}${row})<=0)),` +
      `${quote("both hinge positions, or neither, ")},"")`,
    // A middle cup on a door with nothing to space it between.
    `IF(AND(OR(N(${AT.hingeMiddle1}${row})>0,N(${AT.hingeMiddle2}${row})>0),` +
      `OR(N(${AT.hingeFromBottom}${row})<=0,N(${AT.hingeFromTop}${row})<=0)),` +
      `${quote("the bottom and top hinge as well, ")},"")`,
    // The three a dropdown cannot prevent: an answer chosen first and then had
    // the column it depends on changed underneath it. Each asks the SAME list
    // the dropdown offers, so none of them can disagree with it.
    `IF(AND($${AT.colour}${row}<>"",COUNTIF(INDIRECT($${HELP_AT.colour}${row}),$${AT.colour}${row})=0),` +
      `${quote("a colour that comes in that thickness, ")},"")`,
    `IF(AND($${AT.edge}${row}<>"",COUNTIF(INDIRECT($${HELP_AT.edge}${row}),$${AT.edge}${row})=0),` +
      `${quote("an edge profile that suits that material, ")},"")`,
    // The one Jason will hit: a profile picked on a thermolaminate line and then
    // the material changed to decorative board, which cannot be routed at all.
    `IF(AND($${AT.profileGroup}${row}<>"",COUNTIF(INDIRECT($${HELP_AT.profileGroup}${row}),$${AT.profileGroup}${row})=0),` +
      `${quote("no door profile (only thermolaminate can be routed), ")},"")`,
    `IF(AND($${AT.profile}${row}<>"",COUNTIF(INDIRECT($${HELP_AT.profile}${row}),$${AT.profile}${row})=0),` +
      `${quote("a door profile made in that material and thickness, ")},"")`,
    // And the standard size left behind when somebody typed over the height or
    // width it filled in.
    `IF(AND($${HELP_AT.stdHeight}${row}>0,` +
      `OR(N($${AT.height}${row})<>$${HELP_AT.stdHeight}${row},N($${AT.width}${row})<>$${HELP_AT.stdWidth}${row})),` +
      `${quote("the height and width to match the standard size, or clear the standard size, ")},"")`,
  ];
  sheet.getCell(`${HELP_AT.gaps}${row}`).value = { formula: gaps.join("&") };

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

  const lineCell = style(AT.line, {
    fill: WASH,
    font: { name: "Calibri", size: 9, color: { argb: MUTED } },
    align: { vertical: "middle", horizontal: "center" },
  });
  lineCell.value = row - FIRST_ITEM_ROW + 1;

  const listValidation = (formula) => ({
    type: "list",
    allowBlank: true,
    showErrorMessage: true,
    errorStyle: "warning",
    errorTitle: "Not one of ours",
    error:
      "That is not on our list for what you have chosen so far. Pick from the dropdown, or type it in the notes and we will sort it out.",
    formulae: [formula],
  });

  const validations = {
    brand: listValidation("brands"),
    type: listValidation("types"),
    cabinet: listValidation("cabinets"),
    frontSize: listValidation(`INDIRECT(${HELP_AT.frontSize}${row})`),
    material: listValidation(`INDIRECT($${HELP_AT.material}${row})`),
    thickness: listValidation(`INDIRECT($${HELP_AT.thickness}${row})`),
    finish: listValidation(`INDIRECT($${HELP_AT.finish}${row})`),
    colour: listValidation(`INDIRECT($${HELP_AT.colour}${row})`),
    edge: listValidation(`INDIRECT($${HELP_AT.edge}${row})`),
    profileGroup: listValidation(`INDIRECT($${HELP_AT.profileGroup}${row})`),
    profile: listValidation(`INDIRECT($${HELP_AT.profile}${row})`),
    hingeHoles: listValidation("yesno"),
    hingeQty: listValidation("hingecounts"),
    hingeSide: listValidation("hingesides"),
    hingeFromBottom: sizeValidation("distance from the bottom edge"),
    hingeFromTop: sizeValidation("distance from the top edge"),
    hingeMiddle1: sizeValidation("distance from the bottom edge"),
    hingeMiddle2: sizeValidation("distance from the bottom edge"),
    hardware: listValidation("hardwareitems"),
    qty: {
      type: "whole",
      operator: "greaterThan",
      allowBlank: true,
      showErrorMessage: true,
      errorStyle: "stop",
      errorTitle: "How many?",
      error: "A quantity is a whole number of pieces, at least 1.",
      formulae: [0],
    },
  };

  COLUMNS.forEach((column) => {
    if (column.key === "line" || column.key === "check") return;
    const cell = style(AT[column.key], column.required ? { fill: "FFFCFCFA" } : {});
    cell.protection = { locked: false };
    if (validations[column.key]) cell.dataValidation = validations[column.key];
    if (["height", "width", "hingeFromBottom", "hingeFromTop", "hingeMiddle1", "hingeMiddle2"].includes(column.key)) {
      cell.numFmt = "0";
      cell.alignment = { vertical: "middle", horizontal: "right" };
    }
    if (column.key === "qty") cell.alignment = { vertical: "middle", horizontal: "center" };
    if (column.key === "notes") cell.alignment = { vertical: "middle", wrapText: true };
  });

  // HEIGHT AND WIDTH FILL THEMSELVES IN FROM A STANDARD SIZE, and can be typed
  // over. There is one place a size lives on this row whichever kind of line it
  // is, so nobody reading the sheet back has to look in two columns to find it.
  //
  // Typing over the formula is expected, not a mistake: that is how a line that
  // is not a kit cabinet gets its size. The cost is that a row typed over and
  // THEN given a standard size would not update, which is what the last check in
  // the gaps list above is watching for.
  sheet.getCell(`${AT.height}${row}`).value = {
    formula: `IF($${HELP_AT.stdHeight}${row}=0,"",$${HELP_AT.stdHeight}${row})`,
  };
  sheet.getCell(`${AT.width}${row}`).value = {
    formula: `IF($${HELP_AT.stdWidth}${row}=0,"",$${HELP_AT.stdWidth}${row})`,
  };

  // A blank row says nothing rather than shouting about every column at once.
  //
  // SUMPRODUCT rather than COUNTA, because the height and width columns hold a
  // formula on every row and COUNTA counts a formula that returns "" as filled
  // in. Every one of the hundred rows would have reported itself incomplete.
  //
  // A hardware line is judged on the one thing it needs, because it is bought
  // rather than made and has no board, size or finish to be missing.
  const check = style(AT.check, {
    font: { name: "Calibri", size: 9, color: { argb: MUTED } },
    align: { vertical: "middle", wrapText: true },
  });
  check.value = {
    formula:
      `IF(SUMPRODUCT(--($${AT.brand}${row}:$${AT.notes}${row}<>""))=0,"",` +
      `IF($${AT.type}${row}="Hardware",IF($${AT.hardware}${row}="","Needs: which hardware item","Ready"),` +
      `IF($${HELP_AT.gaps}${row}="","Ready",` +
      `"Needs: "&LEFT($${HELP_AT.gaps}${row},LEN($${HELP_AT.gaps}${row})-2))))`,
  };

  sheet.getRow(row).height = 18;
}

function sizeValidation(what) {
  return {
    type: "decimal",
    operator: "greaterThan",
    allowBlank: true,
    showErrorMessage: true,
    errorStyle: "stop",
    errorTitle: `${what[0].toUpperCase()}${what.slice(1)} in millimetres`,
    error: `Give the ${what} in millimetres, as a number. 597 rather than 59.7cm or "about 600".`,
    formulae: [0],
  };
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

  block("The short version", [
    ["1. Your Details tab", "Fill that page in first. The email address is where the quote goes back to."],
    [
      "2. Order Form tab, one row per size",
      "A row is one size of one thing. Six identical doors are one row with a quantity of 6. Six different sizes are six rows.",
    ],
    [
      "3. Work left to right",
      "Each dropdown only offers what fits what you have already chosen. Material offers what that Type can be made from, Thickness offers what that Material comes in, and Colour offers what we actually stock in that material, thickness and finish.",
    ],
    [
      "4. Watch the last column",
      'It tells you what is still missing on that line, and says "Ready" when there is enough there for us to quote it.',
    ],
    ["5. Send it back", "Email the file to sales@perthcabinetdoors.com.au."],
  ]);

  block("Sizes are always height first", [
    [
      "Height, then Width",
      "Every size on this form, on our quotes and on our workshop sheets is written height first. Height is up the door, width is across it. Millimetres, as numbers: 597, not 59.7cm.",
    ],
  ]);

  block("Which cabinet the front is going on", [
    [
      "Which cabinet",
      'IKEA Metod, IKEA Besta, IKEA Pax, Kaboodle, a custom panel, a custom carcass, or Not applicable. Asked per line, because a kitchen is often IKEA fronts with a custom panel closing the end of a run.',
    ],
    [
      "Standard size",
      "Pick a kit cabinet and this offers the real front sizes it is sold in, for the type of piece you chose. A Metod drawer front comes in different heights to a Metod door, so choose the Type first. Pick a size and the Height and Width fill themselves in.",
    ],
    [
      "If your size is not on the list",
      "Then it is not a standard front. Leave the Standard size column blank and type the height and width yourself. We are happy to make a size IKEA does not.",
    ],
    [
      "We do not sell the cabinets",
      "Only the fronts and panels that go on them. Naming the cabinet is how we know which sizes you mean and how the workshop knows what it is fitting to.",
    ],
  ]);

  block("The columns that catch people out", [
    [
      "Brand",
      `Leave it on "${ANY_BRAND}" and you will see every colour we can get. Set it to a brand only if you already know which one you want, and it will narrow the finishes and colours to that brand.`,
    ],
    [
      "Thickness before Colour",
      "This one matters. We hold a colour per material AND thickness, and plenty of colours come in one thickness and not the other. Choosing the thickness first is what makes the colour list correct rather than hopeful.",
    ],
    [
      "Finish",
      "The surface, not the colour. Matt, Woodmatt, Gloss, Ravine and so on. If you do not know it, leave it and the colour list will show everything in that material and thickness.",
    ],
    [
      "Edge profile",
      "Only offered where it exists. Thermolaminate takes the EM series, decorative board takes a 1mm square or bevel edge, and compact laminate takes neither, so the dropdown will be empty for it.",
    ],
    [
      "Profile group and Door profile",
      "A routed profile is a thermolaminate thing and only a thermolaminate thing: it is a vinyl skin pressed over a routed face, and there is nothing to press onto a decorative board or a compact laminate. Both columns will be empty unless the material is Thermolaminate. Thickness narrows it further, because the Fluted range and some of the Detailed ones are only made in 21mm.",
    ],
    [
      "Hardware item",
      'For ordering handles, hinges or runners on their own rather than as part of a door. Set the Type to "Hardware", pick the item, give a quantity, and leave the board, size and profile columns empty. There is no board on a bought item, so the check column will not ask you for one.',
    ],
  ]);

  block("Hinges", [
    [
      "Drill hinge holes",
      "Yes if you want us to bore the 35mm cups. A door that needed drilling and did not get it is scrap, and a door drilled that should not have been is the same, so this one is worth being certain about.",
    ],
    ["Hinges per door", "How many hinges that one door hangs on. Two is usual, three on a tall door."],
    [
      "Hinge side",
      'Which side the hinges go as you look at the front of the door. A matched pair is TWO rows, one hinged left and one hinged right, not one row with a quantity of two. We drill them as mirror images, so they have to be asked for separately or they come back identical.',
    ],
    [
      "Bottom hinge, mm from bottom",
      "Measured from the bottom edge of the door up to the CENTRE of the bottom hinge cup. Leave it blank, along with the top, and we set every cup on that door the way we always do, which is right almost every time. Fill both in if you are matching an existing run.",
    ],
    [
      "Top hinge, mm from top",
      "Measured from the top edge of the door down to the CENTRE of the top hinge cup. If the door hangs on three or more hinges, the extra ones are spaced evenly between these two, so these two numbers are the whole specification.",
    ],
    [
      "2nd and 3rd hinge",
      "Only on a door that hangs on three or four. Leave them blank and they space evenly between the bottom and the top, which is what we do anyway. Fill them in if you are matching a door that was not drilled evenly.",
    ],
    [
      "Hinges you want us to supply",
      'Add them as their own line: set the Type to "Hardware" and pick the hinge. That way they are priced and picked as stock, rather than as a note on a door.',
    ],
  ]);

  block("Why some of the sheet will not let you type in it", [
    [
      "The cells you fill in are open, the rest is not",
      "Everything you are meant to answer can be typed in or picked from a dropdown. The line numbers, the last column and the workings behind the dropdowns are locked, because clearing one of those breaks the dropdown beside it and nothing tells you it has happened.",
    ],
    [
      "To clear a row",
      "Select the columns you filled in, from Brand across to Notes, and press Delete. Selecting the whole row including the line number will not work, because the line number is locked.",
    ],
    [
      "There are a hundred rows",
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
    [
      "Something we do not stock",
      "The dropdowns only offer what is in our library, and they warn rather than block. If you need something that is not there, put it in the Notes column on that line and we will price it.",
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
