// READING A COMPLETED ORDER FORM BACK IN.
//
// The other half of lib/pcd-order-form-workbook.js. That module asks the
// questions; this one reads the answers and turns them into quote lines, so a
// customer who filled in a spreadsheet is not retyped by hand.
//
// THE HEADINGS ARE THE CONTRACT. A column is found by what its heading says,
// read from the SAME list the workbook is written from, so the writer and the
// reader cannot disagree about what a column is called. Anything unrecognised
// is reported rather than guessed at, and the caller can point it somewhere by
// hand before the import runs.
//
// NOTHING HERE WRITES. It reads a file and hands back what it found, what it
// could not place and what looks wrong. The decision to write is the caller's,
// after somebody has looked at it: a quote that already has priced lines on it
// is the normal case, not the exception, so a wrong file has to be something
// you back out of rather than something you undo.

import ExcelJS from "exceljs";
import { COLUMNS, SHEET_DETAILS, SHEET_ORDER } from "./pcd-order-form-workbook";
import { parseFrontSize } from "./pcd-order-form-data";
import { normaliseHingeSide, readMiddles } from "./pcd-hinges";
import { CABINET_BRANDS } from "./quote-form-data";

/** How the customer block on the details sheet maps onto a quote. */
export const DETAIL_FIELDS = [
  { key: "firstName", head: "First name", label: "First name", target: "customer_name" },
  { key: "lastName", head: "Last name", label: "Last name", target: "customer_name" },
  { key: "company", head: "Company", label: "Company", target: "company_name" },
  { key: "email", head: "Email", label: "Email", target: "customer_email" },
  { key: "phone", head: "Phone", label: "Phone", target: "customer_phone" },
  { key: "street", head: "Street address", label: "Street address", target: "site_street" },
  { key: "suburb", head: "Suburb", label: "Suburb", target: "site_suburb" },
  { key: "postcode", head: "Postcode", label: "Postcode", target: "site_postcode" },
  { key: "reference", head: "Your reference for this job", label: "Job name", target: "project_name" },
  { key: "cabinet", head: "Cabinet brand", label: "Cabinet brand", target: "cabinet_brand" },
  { key: "notes", head: "Anything else we should know", label: "Notes", target: "client_notes" },
  { key: "delivery", head: "Anything we need to know to deliver", label: "Delivery notes", target: "client_notes" },
  // ASKED ON THE FORM, WITH NOWHERE TO PUT IT. A quote has no field for any of
  // these three. They are appended to the notes rather than dropped, because a
  // customer answered them and silently losing an answer is worse than putting
  // it somewhere imperfect.
  { key: "state", head: "State", label: "State", target: null },
  { key: "deliveryOrPickup", head: "Delivery or pickup", label: "Delivery or pickup", target: null },
  { key: "neededBy", head: "Date needed by", label: "Date needed by", target: null },
];

const text = (value) => {
  if (value === null || value === undefined) return "";
  // A cell can come back as a rich text run, a formula result, a hyperlink or a
  // date. Every one of those has to end up as the words a person typed.
  if (typeof value === "object") {
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("").trim();
    if (value.text !== undefined) return String(value.text).trim();
    if (value.result !== undefined) return String(value.result).trim();
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return "";
  }
  return String(value).trim();
};

const mm = (value) => {
  const number = Number(text(value));
  return Number.isFinite(number) && number > 0 ? number : null;
};

const yes = (value) => /^(y|yes|true|1)$/i.test(text(value));

/** The line columns a person can point at something, in sheet order. */
export function lineColumnHeads() {
  return COLUMNS.filter((column) => !["line", "check"].includes(column.key)).map((column) => column.head);
}

/**
 * Which physical column each heading sits in.
 *
 * Matched on the heading, ignoring the trailing star that marks a required
 * column, so a sheet whose columns have been dragged around still reads
 * correctly. A sheet with a renamed heading comes back missing that key, which
 * is what the caller offers to fix by hand.
 */
export function headingIndex(sheet, headerRow) {
  const found = new Map();
  const row = sheet.getRow(headerRow);
  row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    const head = text(cell.value).replace(/\s*\*$/, "");
    if (head) found.set(head, columnNumber);
  });
  return found;
}

/**
 * The column holding our line numbers, which is what says where the table ends.
 *
 * Found by looking for a run of 1, 2, 3 under the header rather than by its
 * heading, because that heading is "#" and a customer's own sheet may not have
 * one at all. Returns 0 when there is nothing that looks like it.
 */
export function lineNumberColumn(sheet, headerRow) {
  for (let column = 1; column <= 4; column += 1) {
    const first = Number(text(sheet.getRow(headerRow + 1).getCell(column).value));
    const second = Number(text(sheet.getRow(headerRow + 2).getCell(column).value));
    if (first === 1 && second === 2) return column;
  }
  return 0;
}

/** Where the item table starts, found rather than assumed. */
export function findHeaderRow(sheet) {
  for (let row = 1; row <= 30; row += 1) {
    const values = [];
    sheet.getRow(row).eachCell({ includeEmpty: false }, (cell) => values.push(text(cell.value).replace(/\s*\*$/, "")));
    // Three headings we have always written and would never rename lightly.
    if (values.includes("Type") && values.includes("Material") && values.includes("Colour")) return row;
  }
  return 0;
}

/**
 * The customer block, read by walking the label column and taking what is
 * beside it. Read that way rather than from fixed cells because the details
 * sheet grows a row whenever a question gains a hint under it.
 */
export function readDetails(sheet) {
  const values = {};
  if (!sheet) return values;
  for (let row = 1; row <= 60; row += 1) {
    const label = text(sheet.getCell(`B${row}`).value).replace(/\s*\*$/, "");
    if (!label) continue;
    const field = DETAIL_FIELDS.find((entry) => entry.head === label);
    if (field) values[field.key] = text(sheet.getCell(`C${row}`).value);
  }
  return values;
}

/**
 * One spreadsheet row as a quote line.
 *
 * `at` maps our column key to a column number, so a caller that has repointed a
 * column by hand gets the same treatment as one that matched automatically.
 */
export function readLine(sheet, rowNumber, at) {
  const cell = (key) => (at.has(key) ? sheet.getRow(rowNumber).getCell(at.get(key)).value : null);
  const drills = yes(cell("hingeHoles"));

  // A standard front size fills the height and width. The sheet already does
  // this with a formula, so this only matters for a row where somebody typed
  // over one of them, or for a file built before those formulas existed.
  const size = parseFrontSize(text(cell("frontSize")));
  const height = mm(cell("height")) ?? size?.height ?? null;
  const width = mm(cell("width")) ?? size?.width ?? null;

  const cabinet = text(cell("cabinet"));
  return {
    product_type: text(cell("type")),
    product_name: text(cell("hardware")) || text(cell("type")),
    supplier_name: text(cell("brand")),
    material: text(cell("material")),
    thickness: text(cell("thickness")),
    finish: text(cell("finish")),
    colour: text(cell("colour")),
    edge_mould: text(cell("edge")),
    profile_type: text(cell("profileGroup")),
    profile: text(cell("profile")),
    height_mm: height,
    width_mm: width,
    qty: Number(text(cell("qty"))) || 1,
    // "Not applicable" is an answer, not a blank, but it is the same as blank to
    // everything downstream, so it is stored as blank rather than as a word
    // every reader would then have to know to ignore.
    cabinet_brand: cabinet && cabinet !== "Not applicable" ? cabinet : "",
    hinge_holes: drills,
    hinge_qty: drills ? text(cell("hingeQty")) : "",
    hinge_side: drills ? normaliseHingeSide(cell("hingeSide")) : "",
    hinge_from_bottom_mm: drills ? mm(cell("hingeFromBottom")) : null,
    hinge_from_top_mm: drills ? mm(cell("hingeFromTop")) : null,
    hinge_middles_mm: drills
      ? readMiddles([mm(cell("hingeMiddle1")), mm(cell("hingeMiddle2"))].filter((value) => value !== null))
      : [],
    notes: text(cell("notes")),
  };
}

/** True when nothing on the row was filled in. */
export function rowIsEmpty(line) {
  const answered = [
    line.product_type, line.material, line.thickness, line.colour, line.notes,
    line.supplier_name, line.finish, line.edge_mould, line.profile, line.cabinet_brand,
    line.product_name === line.product_type ? "" : line.product_name,
  ].some((value) => String(value || "").trim());
  return !answered && !line.height_mm && !line.width_mm && !line.hinge_holes;
}

/**
 * What is worth a person's attention before this is written.
 *
 * Deliberately not refusals. A colour we have stopped stocking still comes in,
 * named, with no price and flagged: refusing the file over one line would send
 * somebody back to retyping, which is the thing this exists to stop.
 */
export function lineWarnings(line, index) {
  const where = `Row ${index}`;
  const out = [];
  if (!line.product_type) out.push(`${where} has no product type, so it cannot be priced yet.`);
  if (line.cabinet_brand && !CABINET_BRANDS.includes(line.cabinet_brand)) {
    out.push(`${where} names a cabinet we do not offer any more (${line.cabinet_brand}).`);
  }
  if (line.hinge_holes && !line.hinge_side) {
    out.push(`${where} is drilled but does not say which side the hinges go.`);
  }
  // The one that turns a pair into two identical doors.
  if (line.hinge_holes && line.hinge_side && Number(line.qty) > 1) {
    out.push(
      `${where} is hinged ${line.hinge_side.toLowerCase()} with a quantity of ${line.qty}. ` +
        `If that is a matched pair it needs to be two lines, one left and one right.`
    );
  }
  const oneEnd = (line.hinge_from_bottom_mm === null) !== (line.hinge_from_top_mm === null);
  if (line.hinge_holes && oneEnd) {
    out.push(`${where} gives one hinge position without the other, so we cannot space the rest.`);
  }
  return out;
}

/**
 * Read a completed order form.
 *
 * @param {Buffer} buffer         the uploaded .xlsx
 * @param {object} [options]
 * @param {Record<string,string>} [options.mapping]  our column key to a heading
 *        in THEIR sheet, for anything that did not match on its own.
 * @returns {Promise<{ok: boolean, error?: string, details: object, lines: object[],
 *          matched: object[], unmatched: string[], warnings: string[]}>}
 */
export async function readOrderForm(buffer, { mapping = {} } = {}) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    return {
      ok: false,
      error: "That file could not be opened as a spreadsheet.",
      details: {}, lines: [], matched: [], unmatched: [], warnings: [],
    };
  }

  // Named sheet first, then whichever sheet has our headings on it, so a file
  // that has been through Google Sheets and come back renamed still reads.
  const order =
    workbook.getWorksheet(SHEET_ORDER) ||
    workbook.worksheets.find((sheet) => findHeaderRow(sheet) > 0);
  if (!order) {
    return {
      ok: false,
      error: "That does not look like a PCD order form. No sheet in it has our column headings.",
      details: {}, lines: [], matched: [], unmatched: [], warnings: [],
    };
  }

  const headerRow = findHeaderRow(order);
  const heads = headingIndex(order, headerRow);

  // Our key to a column number, matched on the heading and then overridden by
  // anything a person has repointed by hand.
  const at = new Map();
  const matched = [];
  const unmatched = [];
  COLUMNS.forEach((column) => {
    if (["line", "check"].includes(column.key)) return;
    const wanted = mapping[column.key] !== undefined ? mapping[column.key] : column.head;
    // An explicit blank is somebody saying "this one is not in my sheet".
    if (wanted === "") {
      unmatched.push(column.head);
      matched.push({ key: column.key, label: column.head, from: "", found: false });
      return;
    }
    if (heads.has(wanted)) {
      at.set(column.key, heads.get(wanted));
      matched.push({ key: column.key, label: column.head, from: wanted, found: true });
    } else {
      unmatched.push(column.head);
      matched.push({ key: column.key, label: column.head, from: "", found: false });
    }
  });

  // WHERE THE TABLE STOPS.
  //
  // The sheet ends with a paragraph telling the customer where to send it, and
  // that paragraph lives in a cell merged right across the table. A merged cell
  // reports its value in every column it covers, so reading to the bottom of the
  // sheet picked the footer up as a line item with the whole sentence sitting in
  // one of its fields.
  //
  // The line number column is the fence. It is locked, we write it, and it stops
  // exactly where the table stops. A sheet that has been rearranged until that
  // column cannot be found falls back to stopping at the first run of blank
  // rows, which is the same fence drawn less precisely.
  const numbered = at.has("line") ? at.get("line") : lineNumberColumn(order, headerRow);
  const lines = [];
  const warnings = [];
  const lastRow = Math.min(order.rowCount, headerRow + 500);
  let blankRun = 0;

  for (let rowNumber = headerRow + 1; rowNumber <= lastRow; rowNumber += 1) {
    if (numbered) {
      // Past the last numbered row is past the table, whatever else is down there.
      if (!Number.isFinite(Number(text(order.getRow(rowNumber).getCell(numbered).value)))) break;
    }
    const line = readLine(order, rowNumber, at);
    if (rowIsEmpty(line)) {
      blankRun += 1;
      if (!numbered && blankRun >= 5) break;
      continue;
    }
    blankRun = 0;
    lines.push(line);
    lineWarnings(line, lines.length).forEach((warning) => warnings.push(warning));
  }

  const details = readDetails(workbook.getWorksheet(SHEET_DETAILS));

  return {
    ok: true,
    details,
    lines,
    matched,
    unmatched,
    warnings,
    // What the sheet actually offers, so a person repointing a column picks
    // from their own headings rather than typing one and hoping.
    availableHeadings: [...heads.keys()],
  };
}

/**
 * The details block as a patch for the quote, plus what had nowhere to go.
 *
 * The three homeless answers become a line of notes rather than being dropped.
 */
export function quotePatchFromDetails(details = {}) {
  const name = [details.firstName, details.lastName].filter(Boolean).join(" ").trim();
  const homeless = DETAIL_FIELDS.filter((field) => !field.target && details[field.key])
    .map((field) => `${field.label}: ${details[field.key]}`);

  const notes = [details.notes, details.delivery && `Delivery: ${details.delivery}`, ...homeless]
    .filter(Boolean)
    .join("\n");

  return {
    patch: {
      ...(name ? { customer_name: name } : {}),
      ...(details.email ? { customer_email: details.email } : {}),
      ...(details.phone ? { customer_phone: details.phone } : {}),
      ...(details.street ? { site_street: details.street } : {}),
      ...(details.suburb ? { site_suburb: details.suburb } : {}),
      ...(details.postcode ? { site_postcode: details.postcode } : {}),
      ...(details.reference ? { project_name: details.reference } : {}),
      ...(notes ? { client_notes: notes } : {}),
    },
    company: details.company || "",
    homeless,
  };
}
