// READING A COMPLETED ORDER FORM BACK IN.
//
// The point of the whole exercise: a customer who will not use the website form
// fills in the spreadsheet, and what comes back becomes quote lines instead of
// being retyped. These tests fill a REAL generated form in the way a customer
// would and read it back, because a reader tested against a hand-built fixture
// proves nothing about the file we actually send out.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";

import { buildOrderFormWorkbook } from "../lib/pcd-order-form-workbook.js";
import {
  DETAIL_FIELDS,
  findHeaderRow,
  lineNumberColumn,
  lineWarnings,
  quotePatchFromDetails,
  readOrderForm,
} from "../lib/pcd-order-form-import.js";

const ROUTE = readFileSync(
  new URL("../app/api/admin/quotes/[id]/import-order-form/route.js", import.meta.url),
  "utf8"
);

const COLOURS = [
  { name: "Alabaster", supplier_name: "Polytec", material_type: "thermolaminate", thickness: "18mm", finish_type: "Smooth", is_active: true },
  { name: "Classic White", supplier_name: "Polytec", material_type: "decorative board", thickness: "18mm", finish_type: "Matt", is_active: true },
];
const HARDWARE = [{ type: "hinge", brand: "Blum", name: "110 Deg Inserta", is_active: true }];

/** A real order form, filled in the way a customer fills one in. */
async function filledForm(rows = [], details = {}) {
  const workbook = await buildOrderFormWorkbook({ colours: COLOURS, hardware: HARDWARE });
  const sheet = workbook.getWorksheet("Order Form");
  const detailSheet = workbook.getWorksheet("Your Details");

  const headerRow = 7;
  const at = new Map();
  sheet.getRow(headerRow).eachCell((cell, column) => {
    at.set(String(cell.value || "").replace(/ \*$/, ""), column);
  });

  rows.forEach((row, index) => {
    Object.entries(row).forEach(([head, value]) => {
      if (!at.has(head)) throw new Error(`the form has no column headed "${head}"`);
      sheet.getRow(8 + index).getCell(at.get(head)).value = value;
    });
  });

  Object.entries(details).forEach(([head, value]) => {
    for (let row = 1; row <= 60; row += 1) {
      if (String(detailSheet.getCell(`B${row}`).value || "").replace(/ \*$/, "") === head) {
        detailSheet.getCell(`C${row}`).value = value;
        return;
      }
    }
    throw new Error(`the details sheet has no question "${head}"`);
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const DOOR = {
  "Type": "Door",
  "Which cabinet": "IKEA Metod",
  "Brand": "Polytec",
  "Material": "Thermolaminate",
  "Thickness": "18mm",
  "Finish": "Smooth",
  "Colour": "Alabaster",
  "Edge profile": "EM1 6mm Pencil Round",
  "Profile group": "Minimal",
  "Door profile": "Brussels",
  "Height mm": 2000,
  "Width mm": 400,
  "Qty": 4,
  "Drill hinge holes": "Yes",
  "Hinges per door": "3 hinges",
  "Hinge side": "Left",
  "Bottom hinge, mm from bottom": 100,
  "Top hinge, mm from top": 100,
  "Notes for this line": "Match the laundry run",
};

// ── it reads our own form ───────────────────────────────────────────────────

test("every answer on a filled in form comes back", async () => {
  const read = await readOrderForm(await filledForm([DOOR]));
  assert.ok(read.ok, read.error);
  assert.equal(read.lines.length, 1);

  assert.deepEqual(read.lines[0], {
    product_type: "Door",
    product_name: "Door",
    supplier_name: "Polytec",
    material: "Thermolaminate",
    thickness: "18mm",
    finish: "Smooth",
    colour: "Alabaster",
    edge_mould: "EM1 6mm Pencil Round",
    profile_type: "Minimal",
    profile: "Brussels",
    height_mm: 2000,
    width_mm: 400,
    qty: 4,
    cabinet_brand: "IKEA Metod",
    hinge_holes: true,
    hinge_qty: "3 hinges",
    hinge_side: "Left",
    hinge_from_bottom_mm: 100,
    hinge_from_top_mm: 100,
    hinge_middles_mm: [],
    notes: "Match the laundry run",
  });
});

test("every column matches on its heading, with none left over", async () => {
  // The writer and the reader read the same COLUMNS list, so a column renamed
  // in one is renamed in the other. If this ever fails, they have drifted.
  const read = await readOrderForm(await filledForm([DOOR]));
  assert.deepEqual(read.unmatched, [], `unmatched: ${read.unmatched.join(", ")}`);
});

test("the footer paragraph is not read as a line item", async () => {
  // THE BUG THIS PINS. The sheet ends with a paragraph telling the customer
  // where to send it, in a cell merged right across the table. A merged cell
  // reports its value in every column it covers, so reading to the bottom of
  // the sheet picked the footer up as an item with a whole sentence in one of
  // its fields.
  const read = await readOrderForm(await filledForm([DOOR]));
  assert.equal(read.lines.length, 1, "the footer came back as a line again");
  assert.ok(!read.lines.some((line) => /perthcabinetdoors\.com\.au/.test(JSON.stringify(line))));
});

test("blank rows between items do not end the table", async () => {
  const read = await readOrderForm(await filledForm([DOOR, {}, {}, { ...DOOR, "Qty": 2 }]));
  assert.equal(read.lines.length, 2);
  assert.equal(read.lines[1].qty, 2);
});

test("the header row and the line number column are found, not assumed", async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await filledForm([DOOR]));
  const sheet = workbook.getWorksheet("Order Form");
  assert.equal(findHeaderRow(sheet), 7);
  assert.equal(lineNumberColumn(sheet, 7), 1);
});

// ── the awkward ones ────────────────────────────────────────────────────────

test("an undrilled door carries no drilling at all", async () => {
  // A measurement left behind on an undrilled door is one that reaches a
  // workshop sheet for a door with no holes in it.
  const read = await readOrderForm(await filledForm([{
    ...DOOR,
    "Drill hinge holes": "No",
  }]));
  const line = read.lines[0];
  assert.equal(line.hinge_holes, false);
  assert.equal(line.hinge_side, "");
  assert.equal(line.hinge_from_bottom_mm, null);
  assert.equal(line.hinge_from_top_mm, null);
  assert.deepEqual(line.hinge_middles_mm, []);
});

test("the middle cups come across when they are given", async () => {
  const read = await readOrderForm(await filledForm([{
    ...DOOR,
    "2nd hinge, mm from bottom": 1400,
  }]));
  assert.deepEqual(read.lines[0].hinge_middles_mm, [1400]);
});

test("\"Not applicable\" for the cabinet is stored as blank", async () => {
  // It is an answer, but it is the same as blank to everything downstream, and
  // storing the words would make every reader learn to ignore them.
  const read = await readOrderForm(await filledForm([{ ...DOOR, "Which cabinet": "Not applicable" }]));
  assert.equal(read.lines[0].cabinet_brand, "");
});

test("a standard size fills the height and width when they were typed over", async () => {
  const read = await readOrderForm(await filledForm([{
    ...DOOR,
    "Standard size (height x width)": "800 x 400",
    "Height mm": "",
    "Width mm": "",
  }]));
  assert.equal(read.lines[0].height_mm, 800);
  assert.equal(read.lines[0].width_mm, 400);
});

test("something that is not an order form is refused, not half read", async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Whatever").getCell("A1").value = "not a form";
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const read = await readOrderForm(buffer);
  assert.equal(read.ok, false);
  assert.match(read.error, /does not look like a PCD order form/);
});

test("a file that is not a spreadsheet says so", async () => {
  const read = await readOrderForm(Buffer.from("this is a text file"));
  assert.equal(read.ok, false);
  assert.match(read.error, /could not be opened/);
});

// ── what is worth a person's attention ──────────────────────────────────────

test("a pair ordered on one line is flagged, because it is what costs a remake", async () => {
  const read = await readOrderForm(await filledForm([{ ...DOOR, "Qty": 2 }]));
  assert.ok(read.warnings.some((warning) => /matched pair/.test(warning)), read.warnings.join(" | "));
});

test("a drilled door with no handing is flagged", async () => {
  const read = await readOrderForm(await filledForm([{ ...DOOR, "Hinge side": "" }]));
  assert.ok(read.warnings.some((warning) => /which side/.test(warning)));
});

test("one hinge position without the other is flagged", async () => {
  const read = await readOrderForm(await filledForm([{ ...DOOR, "Top hinge, mm from top": "" }]));
  assert.ok(read.warnings.some((warning) => /one hinge position without the other/.test(warning)));
});

test("a flag is never a refusal", async () => {
  // Refusing the file over one line would send somebody back to retyping, which
  // is the thing this exists to stop. A line with two things wrong with it
  // still comes in, named, with both said.
  const read = await readOrderForm(await filledForm([{
    ...DOOR,
    "Qty": 2,
    "Top hinge, mm from top": "",
  }]));
  assert.ok(read.ok);
  assert.equal(read.lines.length, 1, "the line still comes in");
  assert.ok(read.warnings.some((warning) => /matched pair/.test(warning)));
  assert.ok(read.warnings.some((warning) => /one hinge position without the other/.test(warning)));
});

test("the pair warning only fires once there is a handing to be wrong about", () => {
  // A door with no handing at all gets the "which side" warning instead. Saying
  // both would be telling somebody to split a line into a left and a right
  // before they have told us it is either.
  const noSide = lineWarnings({ hinge_holes: true, hinge_side: "", qty: 2 }, 1);
  assert.ok(noSide.some((warning) => /which side/.test(warning)));
  assert.ok(!noSide.some((warning) => /matched pair/.test(warning)));
});

// ── the customer block ──────────────────────────────────────────────────────

test("the details tab fills the customer and the job", async () => {
  const read = await readOrderForm(await filledForm([DOOR], {
    "First name": "Jason",
    "Last name": "Brown",
    "Company": "Brown Joinery",
    "Email": "jason@brownjoinery.com.au",
    "Phone": "0412 998 300",
    "Street address": "14 Kembla Way",
    "Suburb": "Myaree",
    "Postcode": "6154",
    "Your reference for this job": "Kembla Way laundry",
  }));

  const { patch, company } = quotePatchFromDetails(read.details);
  assert.equal(patch.customer_name, "Jason Brown");
  assert.equal(patch.customer_email, "jason@brownjoinery.com.au");
  assert.equal(patch.customer_phone, "0412 998 300");
  assert.equal(patch.site_street, "14 Kembla Way");
  assert.equal(patch.site_suburb, "Myaree");
  assert.equal(patch.site_postcode, "6154");
  assert.equal(patch.project_name, "Kembla Way laundry");
  assert.equal(company, "Brown Joinery");
});

test("the three answers with nowhere to go end up in the notes", async () => {
  // A quote has no field for a state, a delivery choice or a needed-by date.
  // A customer answered them, so losing them silently is worse than putting
  // them somewhere imperfect.
  const read = await readOrderForm(await filledForm([DOOR], {
    "State": "WA",
    "Delivery or pickup": "Delivery",
    "Date needed by": "Late September",
  }));
  const { patch, homeless } = quotePatchFromDetails(read.details);
  assert.deepEqual(homeless, ["State: WA", "Delivery or pickup: Delivery", "Date needed by: Late September"]);
  assert.match(patch.client_notes, /State: WA/);
  assert.match(patch.client_notes, /Date needed by: Late September/);
});

test("the fields with no home are the ones we know about, and no others", () => {
  const homeless = DETAIL_FIELDS.filter((field) => !field.target).map((field) => field.head);
  assert.deepEqual(homeless, ["State", "Delivery or pickup", "Date needed by"]);
});

// ── the route ───────────────────────────────────────────────────────────────

test("nothing is written until the import is actually applied", () => {
  // A quote with priced lines on it is the normal case, so a wrong file has to
  // be something you back out of rather than something you undo.
  const preview = ROUTE.indexOf("if (!apply)");
  const writes = ROUTE.indexOf("from here on it writes");
  assert.ok(preview > 0 && writes > preview, "the preview must return before anything writes");
});

test("the import goes through the same line writer as everything else", () => {
  // Going straight to insert is how a converted quote once opened with zero
  // dollar lines: nothing computed the markup, the drilling or the totals.
  assert.match(ROUTE, /calculateQuoteLine\(/);
  assert.match(ROUTE, /quoteLineRow\(/);
  assert.match(ROUTE, /recalculateQuoteTotals\(/);
});

test("a quote that is sent or ordered cannot be imported over", () => {
  // The QUOTE lock, not the generic document one. It names the order the quote
  // became and carries a 409, so a refusal reaches the screen as a rule rather
  // than as a crash.
  assert.match(ROUTE, /assertQuoteEditable\(context\.supabase, quoteId/);
  assert.match(ROUTE, /status: error\?\.status \|\| 500/, "a 409 must not be flattened to a 500");
});

test("the customer block is only written when it was asked for, and never fatally", () => {
  assert.match(ROUTE, /if \(read\.withCustomer && Object\.keys\(patch\)\.length\)/);
  const tail = ROUTE.slice(ROUTE.indexOf("lines written, customer not updated"));
  assert.ok(!/throw/.test(tail.slice(0, 200)), "a failed customer update must not lose the lines");
});

test("a disagreeing customer is reported rather than overwritten", () => {
  assert.match(ROUTE, /conflicts\.push/);
  assert.match(ROUTE, /the form says/);
});
