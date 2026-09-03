// READING A COMPLETED ORDER FORM BACK IN.
//
// The other half of lib/pcd-order-form-workbook.js. That module asks the
// questions; this one reads the answers, so a customer or a person on site who
// filled in a spreadsheet is not then retyped by hand.
//
// FOUR MEASURING TABS, ONE QUOTE. Kit fronts, Fronts and panels and Hardware
// each become quote lines. A row on the Carcasses tab is NOT a quote line on
// its own: a cabinet is priced off a cut list worked out from the box, so it
// becomes a line with a cabinet configuration attached, the same shape the
// design importer and the configurator produce. Rows come back in tab order,
// which is the order somebody measured in.
//
// THE HEADINGS ARE THE CONTRACT. A column is found by what its heading says,
// read from the SAME definitions the workbook is written from, so the writer
// and the reader cannot disagree about what a column is called. Anything
// unrecognised is reported rather than guessed at, and the caller can point it
// somewhere by hand before the import runs.
//
// A MISSING TAB IS NOT AN ERROR. Most jobs use two of the four. A file with no
// Carcasses sheet is a job with no carcasses on it, not a broken file.
//
// NOTHING HERE WRITES. It reads a file and hands back what it found, what it
// could not place and what looks wrong. The decision to write is the caller's,
// after somebody has looked at it: a quote that already has priced lines on it
// is the normal case, not the exception, so a wrong file has to be something
// you back out of rather than something you undo.

import ExcelJS from "exceljs";
import { SHEET_DETAILS, TABS, answerColumns } from "./pcd-order-form-tabs";
import { parseFrontSize } from "./pcd-order-form-data";
import { normaliseHingeSide, readMiddles } from "./pcd-hinges";
import { CABINET_BRANDS } from "./quote-form-data";
import { cabinetTypeFromLabel } from "./pcd-design-parts";
import { isCornerType } from "./pcd-kickboard-utils";
import { hardwareTypeFromLabel } from "./pcd-hardware-types";
import {
  EDGE_FINISHES,
  EXISTING_HINGE_BRANDS,
  DOOR_OVERLAYS,
  GRAIN_DIRECTIONS,
  SUPPLIED_BY,
  oneOf,
  panelUseFor,
} from "./pcd-line-details";

/** How the block on the first sheet maps onto a quote. */
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
  // What the new doors are going onto, on a refresh. Real columns on the quote,
  // because the workshop reads them and a note nobody can filter on is a note
  // that gets missed on the one job it mattered.
  { key: "hingeBrand", head: "Existing hinge brand", label: "Existing hinge brand", target: "existing_hinge_brand" },
  { key: "overlay", head: "Door overlay", label: "Door overlay", target: "door_overlay" },
  { key: "notes", head: "Anything else we should know", label: "Notes", target: "client_notes" },
  { key: "delivery", head: "Anything we need to know to deliver", label: "Delivery notes", target: "client_notes" },
  // ASKED ON THE FORM, WITH NOWHERE TO PUT IT. A quote has no field for any of
  // these. They are appended to the notes rather than dropped, because somebody
  // answered them and silently losing an answer is worse than putting it
  // somewhere imperfect.
  { key: "state", head: "State", label: "State", target: null },
  { key: "deliveryOrPickup", head: "Delivery or pickup", label: "Delivery or pickup", target: null },
  { key: "neededBy", head: "Date needed by", label: "Date needed by", target: null },
  { key: "jobKind", head: "What kind of job is this", label: "Kind of job", target: null },
  { key: "measuredBy", head: "Measured by", label: "Measured by", target: null },
  { key: "measuredOn", head: "Date measured", label: "Date measured", target: null },
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

const count = (value) => {
  const number = Number(text(value));
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
};

const yes = (value) => /^(y|yes|true|1)$/i.test(text(value));

/** The line columns a person can point at something, per tab. */
export function lineColumnHeads(tabId) {
  const tab = TABS.find((entry) => entry.id === tabId);
  return tab ? answerColumns(tab).map((column) => column.head) : [];
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

/**
 * Where a tab's table starts, found rather than assumed.
 *
 * Each tab is recognised by three of its own headings, which are the ones we
 * would never rename lightly. A sheet matching none of them is not one of ours.
 */
const TAB_FINGERPRINTS = {
  kit: ["Cabinet range", "Front type", "Colour"],
  fronts: ["Type", "Material", "Colour"],
  carcasses: ["Cabinet type", "Depth mm", "Carcass material"],
  hardware: ["Hardware type", "Hardware item", "Qty"],
};

export function findHeaderRow(sheet, tabId = "") {
  const wanted = TAB_FINGERPRINTS[tabId];
  for (let row = 1; row <= 30; row += 1) {
    const values = [];
    sheet.getRow(row).eachCell({ includeEmpty: false }, (cell) => values.push(text(cell.value).replace(/\s*\*$/, "")));
    if (wanted) {
      if (wanted.every((head) => values.includes(head))) return row;
    } else if (Object.values(TAB_FINGERPRINTS).some((heads) => heads.every((head) => values.includes(head)))) {
      return row;
    }
  }
  return 0;
}

/** Which tab a sheet's headings say it is, for a file whose tabs were renamed. */
export function tabForSheet(sheet) {
  // Most specific first: the fronts fingerprint is the loosest of the four and
  // would otherwise claim a kit sheet, which carries all three of its headings.
  const order = ["carcasses", "hardware", "kit", "fronts"];
  return order.find((id) => findHeaderRow(sheet, id) > 0) || "";
}

/**
 * The block on the first sheet, read by walking the label column and taking
 * what is beside it. Read that way rather than from fixed cells because the
 * sheet grows a row whenever a question gains a hint under it.
 */
export function readDetails(sheet) {
  const values = {};
  if (!sheet) return values;
  for (let row = 1; row <= 90; row += 1) {
    const label = text(sheet.getCell(`B${row}`).value).replace(/\s*\*$/, "");
    if (!label) continue;
    const field = DETAIL_FIELDS.find((entry) => entry.head === label);
    if (field) values[field.key] = text(sheet.getCell(`C${row}`).value);
  }
  return values;
}

// ---------------------------------------------------------------------------
// One row, per tab.
// ---------------------------------------------------------------------------

/** Everything the three front and hardware tabs share. */
function commonLine(cell) {
  return {
    // Where it goes. No column of its own on a quote line yet, so it is put
    // back at the front of the notes rather than dropped: it is how a line is
    // found again on site, and losing it means reading a hundred rows to work
    // out which cupboard a door belongs to.
    room: text(cell("room")),
    cabinet_ref: text(cell("cabinetRef")),
    qty: count(cell("qty")) || 1,
    notes: text(cell("notes")),
  };
}

/** The board answers, which three tabs ask in the same words. */
function boardLine(cell) {
  return {
    supplier_name: text(cell("brand")),
    material: text(cell("material")),
    thickness: text(cell("thickness")),
    finish: text(cell("finish")),
    colour: text(cell("colour")),
    edge_mould: text(cell("edge")),
    profile_type: text(cell("profileGroup")),
    profile: text(cell("profile")),
  };
}

/** The drilling, and only while the line is actually drilled. */
function hingeLine(cell, { positions = true } = {}) {
  const drills = yes(cell("hingeHoles"));
  if (!drills) {
    return {
      hinge_holes: false,
      hinge_qty: "",
      hinge_side: "",
      hinge_from_bottom_mm: null,
      hinge_from_top_mm: null,
      hinge_middles_mm: [],
    };
  }
  return {
    hinge_holes: true,
    hinge_qty: text(cell("hingeQty")),
    hinge_side: normaliseHingeSide(cell("hingeSide")),
    hinge_from_bottom_mm: positions ? mm(cell("hingeFromBottom")) : null,
    hinge_from_top_mm: positions ? mm(cell("hingeFromTop")) : null,
    hinge_middles_mm: positions
      ? readMiddles([mm(cell("hingeMiddle1")), mm(cell("hingeMiddle2"))].filter((value) => value !== null))
      : [],
  };
}

/** A row on the Kit fronts tab. */
function readKitLine(cell) {
  // A standard size fills the height and width. The sheet already does this
  // with a formula, so this only matters for a row where somebody typed over
  // one of them, or for a file built before those formulas existed.
  const size = parseFrontSize(text(cell("frontSize")));
  const cabinet = text(cell("cabinet"));
  const type = text(cell("type"));
  return {
    ...commonLine(cell),
    ...boardLine(cell),
    ...hingeLine(cell, { positions: false }),
    product_type: type,
    product_name: type,
    height_mm: mm(cell("height")) ?? size?.height ?? null,
    width_mm: mm(cell("width")) ?? size?.width ?? null,
    // "Not applicable" is an answer, not a blank, but it is the same as blank to
    // everything downstream, so it is stored as blank rather than as a word
    // every reader would then have to know to ignore.
    cabinet_brand: cabinet && cabinet !== "Not applicable" ? cabinet : "",
  };
}

/** A row on the Fronts and panels tab. */
function readFrontLine(cell) {
  const type = text(cell("type"));
  return {
    ...commonLine(cell),
    ...boardLine(cell),
    ...hingeLine(cell),
    product_type: type,
    product_name: type,
    height_mm: mm(cell("height")),
    width_mm: mm(cell("width")),
    cabinet_brand: "",
    panel_use: panelUseFor(type, cell("panelUse")),
    grain_direction: oneOf(GRAIN_DIRECTIONS, cell("grain")),
    edge_finish: oneOf(EDGE_FINISHES, cell("edgeFinish")),
  };
}

/** A row on the Hardware tab. */
function readHardwareLine(cell) {
  const item = text(cell("hardware"));
  const kind = text(cell("hardwareType"));
  return {
    ...commonLine(cell),
    // BLANK ON A ROW NOBODY TOUCHED. Naming the type on every row would make a
    // hundred empty rows look like a hundred hardware lines, which is exactly
    // what rowIsEmpty is reading these fields to find out.
    product_type: item || kind ? "Hardware" : "",
    product_name: item || kind,
    hardware_type: hardwareTypeFromLabel(cell("hardwareType")),
    supplied_by: oneOf(SUPPLIED_BY, cell("suppliedBy")),
    height_mm: null,
    width_mm: null,
    hinge_holes: false,
    hinge_middles_mm: [],
  };
}

/**
 * A row on the Carcasses tab, as a quote line WITH ITS BOX.
 *
 * product_type is "base_cabinet" because that is what every other path that
 * produces a cabinet writes, and it is what the quote editor, the cut list and
 * the cabinet PDF all branch on. A cabinet line deliberately carries NO width
 * or height of its own: the editor's auto cost is rate times width times
 * height, and real dimensions on the line would silently reprice a cut list as
 * a flat sheet. The real box lives in cabinet_config.
 */
function readCarcassLine(cell) {
  const label = text(cell("cabinetType"));
  const itemType = cabinetTypeFromLabel(label);
  const shelfQty = count(cell("shelfQty"));
  const material = text(cell("carcassMaterial"));
  const finish = text(cell("carcassFinish"));
  const colour = text(cell("carcassColour"));
  const thickness = text(cell("carcassThickness"));
  const shelfColour = text(cell("shelfColour"));
  const shelfThickness = text(cell("shelfThickness"));
  const hasBack = text(cell("backPanel")).toLowerCase() !== "no";
  const common = commonLine(cell);
  const reference = common.cabinet_ref;

  const named = [label, reference].filter(Boolean).join(" ");
  return {
    ...common,
    product_type: "base_cabinet",
    // Blank on a row nobody touched, for the same reason a hardware row is.
    // "Cabinet" on every one of the hundred rows would be a hundred cabinets.
    product_name: named,
    material,
    thickness,
    finish,
    colour,
    supplier_name: "",
    height_mm: null,
    width_mm: null,
    cabinet_item_type: itemType,
    cabinet_config: {
      label: reference || label || "Cabinet",
      is_corner: itemType ? isCornerType(itemType) : /corner/i.test(label),
      // The form asks for a corner's return leg, not which way it is cut. An L
      // shape is what we make unless somebody says otherwise in the notes,
      // which is the same default the configurator opens on.
      corner_style: "l_shape",
      height_mm: mm(cell("height")) || 0,
      width_mm: mm(cell("width")) || 0,
      secondary_width_mm: mm(cell("secondaryWidth")) || 0,
      depth_mm: mm(cell("depth")) || 0,
      carcass_material: material,
      carcass_finish: finish,
      carcass_colour: colour,
      carcass_thickness_mm: millimetresFromThickness(thickness, 16),
      back_panel_included: hasBack,
      back_panel_material: hasBack ? material : "",
      back_panel_thickness_mm: hasBack
        ? millimetresFromThickness(text(cell("backThickness")) || thickness, 16)
        : 0,
      shelf_qty: shelfQty,
      // BLANK MEANS THE SAME BOARD AS THE BOX, which is the usual answer and
      // the one the column heading promises. Falling back to the carcass here
      // rather than leaving it empty is what stops a shelf being cut out of
      // nothing.
      shelf_material: material,
      shelf_finish: finish,
      shelf_colour: shelfColour || colour,
      shelf_thickness_mm: millimetresFromThickness(shelfThickness || thickness, 16),
      shelf_heights_mm: readMiddles(cell("shelfHeights")),
      has_rangehood: mm(cell("rangehoodHeight")) !== null || mm(cell("rangehoodWidth")) !== null,
      rangehood_housing_height_mm: mm(cell("rangehoodHeight")) || 0,
      rangehood_channel_width_mm: mm(cell("rangehoodWidth")) || 0,
      mount_height_mm: mm(cell("mountHeight")),
      // NO RATES. What a board costs is a fact about today's colour library and
      // is resolved when the quote is priced, not when a spreadsheet is read.
      cost_per_sqm_carcass: 0,
      cost_per_sqm_shelf: 0,
      notes: common.notes,
    },
  };
}

/** "16mm" as 16. The library writes thicknesses with the unit on them. */
function millimetresFromThickness(value, fallback) {
  const match = String(value || "").match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : fallback;
}

const READERS = {
  kit: readKitLine,
  fronts: readFrontLine,
  carcasses: readCarcassLine,
  hardware: readHardwareLine,
};

/**
 * One spreadsheet row as a line.
 *
 * `at` maps our column key to a column number, so a caller that has repointed a
 * column by hand gets the same treatment as one that matched automatically.
 */
export function readLine(sheet, rowNumber, at, tabId = "fronts") {
  const cell = (key) => (at.has(key) ? sheet.getRow(rowNumber).getCell(at.get(key)).value : null);
  const read = READERS[tabId] || readFrontLine;
  return { ...read(cell), source_tab: tabId };
}

/** True when nothing on the row was filled in. */
export function rowIsEmpty(line) {
  if (line.source_tab === "carcasses") {
    const box = line.cabinet_config || {};
    const answered = [line.product_name, line.room, line.cabinet_ref, line.notes, line.material, line.colour]
      .some((value) => String(value || "").trim());
    return !answered && !box.height_mm && !box.width_mm && !box.depth_mm && !box.shelf_qty;
  }
  const answered = [
    line.product_type, line.material, line.thickness, line.colour, line.notes,
    line.supplier_name, line.finish, line.edge_mould, line.profile, line.cabinet_brand,
    line.room, line.cabinet_ref,
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
export function lineWarnings(line, index, tabLabel = "") {
  const where = tabLabel ? `${tabLabel} row ${index}` : `Row ${index}`;
  const out = [];

  if (line.source_tab === "carcasses") {
    const box = line.cabinet_config || {};
    if (!line.cabinet_item_type) {
      out.push(`${where} does not name a cabinet type we make, so its cut list cannot be worked out.`);
    }
    if (!box.height_mm || !box.width_mm || !box.depth_mm) {
      out.push(`${where} is missing one of the three box sizes, so it will import with nothing to cut.`);
    }
    if (box.is_corner && !box.secondary_width_mm) {
      out.push(`${where} is a corner with no second width, so only one leg of it can be cut.`);
    }
    if (box.shelf_heights_mm.length && box.shelf_heights_mm.length !== box.shelf_qty) {
      out.push(
        `${where} gives ${box.shelf_heights_mm.length} shelf heights for ${box.shelf_qty} shelves. ` +
          `The rest will be spaced evenly.`
      );
    }
    return out;
  }

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
  if (line.supplied_by === "Customer supplies") {
    out.push(`${where} is hardware the customer is supplying, so it comes in recorded but not priced.`);
  }
  return out;
}

// ---------------------------------------------------------------------------

/** One measuring tab, read. */
function readTab(sheet, tab, mapping = {}) {
  const headerRow = findHeaderRow(sheet, tab.id);
  if (!headerRow) return null;

  const heads = headingIndex(sheet, headerRow);
  const at = new Map();
  const matched = [];
  const unmatched = [];

  answerColumns(tab).forEach((column) => {
    const key = `${tab.id}.${column.key}`;
    const wanted = mapping[key] !== undefined ? mapping[key] : column.head;
    // An explicit blank is somebody saying "this one is not in my sheet".
    if (wanted === "") {
      unmatched.push({ tab: tab.id, label: column.head });
      matched.push({ tab: tab.id, key, label: column.head, from: "", found: false });
      return;
    }
    if (heads.has(wanted)) {
      at.set(column.key, heads.get(wanted));
      matched.push({ tab: tab.id, key, label: column.head, from: wanted, found: true });
    } else {
      unmatched.push({ tab: tab.id, label: column.head });
      matched.push({ tab: tab.id, key, label: column.head, from: "", found: false });
    }
  });

  // WHERE THE TABLE STOPS.
  //
  // Each tab ends with a paragraph saying where to send the file, and that
  // paragraph lives in a cell merged right across the table. A merged cell
  // reports its value in every column it covers, so reading to the bottom of
  // the sheet picks the footer up as a line item with the whole sentence
  // sitting in one of its fields.
  //
  // The line number column is the fence. It is locked, we write it, and it
  // stops exactly where the table stops. A sheet rearranged until that column
  // cannot be found falls back to stopping at the first run of blank rows,
  // which is the same fence drawn less precisely.
  const numbered = lineNumberColumn(sheet, headerRow);
  const lines = [];
  const warnings = [];
  const lastRow = Math.min(sheet.rowCount, headerRow + 500);
  let blankRun = 0;

  for (let rowNumber = headerRow + 1; rowNumber <= lastRow; rowNumber += 1) {
    if (numbered) {
      // Past the last numbered row is past the table, whatever else is down
      // there. BLANK COUNTS AS PAST IT: Number("") is 0, which is a perfectly
      // finite number, so testing the number alone walked straight off the end
      // of the table and read the footer paragraph as a line.
      const number = text(sheet.getRow(rowNumber).getCell(numbered).value);
      if (!number || !Number.isFinite(Number(number))) break;
    }
    const line = readLine(sheet, rowNumber, at, tab.id);
    if (rowIsEmpty(line)) {
      blankRun += 1;
      if (!numbered && blankRun >= 5) break;
      continue;
    }
    blankRun = 0;
    lines.push(line);
    lineWarnings(line, lines.length, tab.sheet).forEach((warning) => warnings.push(warning));
  }

  return { lines, matched, unmatched, warnings, availableHeadings: [...heads.keys()] };
}

/**
 * Read a completed order form.
 *
 * @param {Buffer} buffer         the uploaded .xlsx
 * @param {object} [options]
 * @param {Record<string,string>} [options.mapping]  "<tab>.<column key>" to a
 *        heading in THEIR sheet, for anything that did not match on its own.
 * @returns {Promise<object>}
 */
export async function readOrderForm(buffer, { mapping = {} } = {}) {
  const workbook = new ExcelJS.Workbook();
  const nothing = { details: {}, lines: [], cabinets: [], matched: [], unmatched: [], warnings: [], tabs: [] };

  try {
    await workbook.xlsx.load(buffer);
  } catch {
    return { ok: false, error: "That file could not be opened as a spreadsheet.", ...nothing };
  }

  const lines = [];
  const matched = [];
  const unmatched = [];
  const warnings = [];
  const tabsFound = [];
  const availableHeadings = new Set();
  const claimed = new Set();

  for (const tab of TABS) {
    // Named sheet first, then whichever sheet carries that tab's headings, so a
    // file that has been through Google Sheets and come back renamed still
    // reads.
    const sheet =
      workbook.getWorksheet(tab.sheet) ||
      workbook.worksheets.find((candidate) => !claimed.has(candidate.name) && tabForSheet(candidate) === tab.id);
    if (!sheet) continue;
    claimed.add(sheet.name);

    const read = readTab(sheet, tab, mapping);
    if (!read) continue;

    read.matched.forEach((entry) => matched.push(entry));
    read.unmatched.forEach((entry) => unmatched.push(entry));
    read.warnings.forEach((warning) => warnings.push(warning));
    read.availableHeadings.forEach((head) => availableHeadings.add(head));
    read.lines.forEach((line) => lines.push(line));
    tabsFound.push({ id: tab.id, sheet: tab.sheet, lines: read.lines.length });
  }

  if (!tabsFound.length) {
    return {
      ok: false,
      error: "That does not look like a PCD order form. No sheet in it has our column headings.",
      ...nothing,
    };
  }

  const details = readDetails(workbook.getWorksheet(SHEET_DETAILS) || workbook.worksheets[0]);

  return {
    ok: true,
    details,
    lines,
    // The carcass rows on their own, because the caller writes them differently:
    // a line, and then a cabinet configuration attached to it.
    cabinets: lines.filter((line) => line.source_tab === "carcasses"),
    tabs: tabsFound,
    matched,
    unmatched,
    warnings,
    // What the sheets actually offer, so a person repointing a column picks
    // from their own headings rather than typing one and hoping.
    availableHeadings: [...availableHeadings],
  };
}

/**
 * The details block as a patch for the quote, plus what had nowhere to go.
 *
 * The homeless answers become a line of notes rather than being dropped.
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
      ...(oneOf(EXISTING_HINGE_BRANDS, details.hingeBrand)
        ? { existing_hinge_brand: oneOf(EXISTING_HINGE_BRANDS, details.hingeBrand) }
        : {}),
      ...(oneOf(DOOR_OVERLAYS, details.overlay)
        ? { door_overlay: oneOf(DOOR_OVERLAYS, details.overlay) }
        : {}),
      ...(notes ? { client_notes: notes } : {}),
    },
    company: details.company || "",
    homeless,
  };
}

/**
 * A read line with its room and cabinet reference put where they will survive.
 *
 * Neither has a column on a quote line yet, and both are how somebody finds a
 * line again three weeks later, so they go at the FRONT of the note rather than
 * being lost. One place, so the route and the preview agree about what a line
 * will end up saying.
 */
export function lineForQuote(line) {
  const where = [line.room, line.cabinet_ref].filter(Boolean).join(" / ");
  const notes = [where, line.notes].filter(Boolean).join(" - ");
  return { ...line, notes };
}
