// READING A COMPLETED ORDER FORM BACK IN.
//
// The point of the whole exercise: somebody measures a job into the spreadsheet
// and what comes back becomes quote lines instead of being retyped. These tests
// fill a REAL generated form in the way a person would and read it back,
// because a reader tested against a hand-built fixture proves nothing about the
// file we actually send out.
//
// FOUR MEASURING TABS. Most jobs use two of them, so a missing tab is a job
// without that kind of work on it and never an error.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";

import { buildOrderFormWorkbook } from "../lib/pcd-order-form-workbook.js";
import {
  DETAIL_FIELDS,
  findHeaderRow,
  lineForQuote,
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

/**
 * A real order form, filled in the way somebody fills one in.
 *
 * `tabs` is keyed by sheet name, so a test writes only the tabs its job has.
 */
async function filledForm(tabs = {}, details = {}) {
  const workbook = await buildOrderFormWorkbook({ colours: COLOURS, hardware: HARDWARE });

  Object.entries(tabs).forEach(([sheetName, rows]) => {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) throw new Error(`the form has no sheet called "${sheetName}"`);
    const at = new Map();
    sheet.getRow(7).eachCell((cell, column) => {
      at.set(String(cell.value || "").replace(/ \*$/, ""), column);
    });
    rows.forEach((row, index) => {
      Object.entries(row).forEach(([head, value]) => {
        if (!at.has(head)) throw new Error(`${sheetName} has no column headed "${head}"`);
        sheet.getRow(8 + index).getCell(at.get(head)).value = value;
      });
    });
  });

  const detailSheet = workbook.getWorksheet("Start here");
  Object.entries(details).forEach(([head, value]) => {
    for (let row = 1; row <= 90; row += 1) {
      if (String(detailSheet.getCell(`B${row}`).value || "").replace(/ \*$/, "") === head) {
        detailSheet.getCell(`C${row}`).value = value;
        return;
      }
    }
    throw new Error(`the details sheet has no question "${head}"`);
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const fronts = (rows) => ({ "Fronts and panels": rows });

const DOOR = {
  "Room or area": "Kitchen",
  "Cabinet reference": "B3",
  "Type": "Door",
  "Brand": "Polytec",
  "Material": "Thermolaminate",
  "Thickness": "18mm",
  "Finish": "Smooth",
  "Colour": "Alabaster",
  "Grain direction": "Vertical",
  "Edge profile": "EM1 6mm Pencil Round",
  "Edges to finish": "All four edges",
  "Door profile group": "Minimal",
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

const BOX = {
  "Room or area": "Kitchen",
  "Cabinet reference": "B3",
  "Cabinet type": "Base cabinet",
  "Height mm": 720,
  "Width mm": 900,
  "Depth mm": 560,
  "Qty": 2,
  "Carcass material": "Decorative Board",
  "Carcass thickness": "18mm",
  "Carcass finish": "Matt",
  "Carcass colour": "Classic White",
  "Back panel": "Yes",
  "Back thickness": "18mm",
  "Shelves": 2,
  "Shelf heights, mm from bottom": "300, 600",
  "Notes for this line": "Waste pipe on the left",
};

// ── it reads our own form ───────────────────────────────────────────────────

test("every answer on a filled in front comes back", async () => {
  const read = await readOrderForm(await filledForm(fronts([DOOR])));
  assert.ok(read.ok, read.error);
  assert.equal(read.lines.length, 1);

  assert.deepEqual(read.lines[0], {
    source_tab: "fronts",
    room: "Kitchen",
    cabinet_ref: "B3",
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
    cabinet_brand: "",
    panel_use: "",
    grain_direction: "Vertical",
    edge_finish: "All four edges",
    hinge_holes: true,
    hinge_qty: "3 hinges",
    hinge_side: "Left",
    hinge_from_bottom_mm: 100,
    hinge_from_top_mm: 100,
    hinge_middles_mm: [],
    notes: "Match the laundry run",
  });
});

test("every column on every tab matches on its heading, with none left over", async () => {
  // The writer and the reader read the same definitions in
  // lib/pcd-order-form-tabs.js, so a column renamed in one is renamed in the
  // other. If this ever fails, they have drifted.
  const read = await readOrderForm(
    await filledForm({
      "Kit fronts": [{ "Cabinet range": "IKEA Metod", "Front type": "Door", "Qty": 1 }],
      "Fronts and panels": [DOOR],
      "Carcasses": [BOX],
      "Hardware": [{ "Hardware type": "Hinge", "Hardware item": "Blum 110 Deg Inserta", "Qty": 20 }],
    })
  );
  assert.deepEqual(read.unmatched, [], `unmatched: ${read.unmatched.map((entry) => entry.label).join(", ")}`);
  assert.deepEqual(
    read.tabs.map((tab) => `${tab.sheet}:${tab.lines}`),
    ["Kit fronts:1", "Fronts and panels:1", "Carcasses:1", "Hardware:1"]
  );
});

test("a job with no carcasses is not a broken file", async () => {
  // Most jobs use two of the four tabs. An empty tab is a kind of work this job
  // does not have, and refusing the file over it would be absurd.
  const read = await readOrderForm(await filledForm(fronts([DOOR])));
  assert.ok(read.ok);
  assert.equal(read.cabinets.length, 0);
  assert.deepEqual(read.tabs.filter((tab) => tab.lines).map((tab) => tab.id), ["fronts"]);
});

test("the footer paragraph is not read as a line item", async () => {
  // THE BUG THIS PINS. Each tab ends with a paragraph saying where to send the
  // file, in a cell merged right across the table. A merged cell reports its
  // value in every column it covers, so reading to the bottom of the sheet
  // picked the footer up as an item with a whole sentence in one of its fields.
  const read = await readOrderForm(await filledForm(fronts([DOOR])));
  assert.equal(read.lines.length, 1, "the footer came back as a line again");
  assert.ok(!read.lines.some((line) => /perthcabinetdoors\.com\.au/.test(JSON.stringify(line))));
});

test("blank rows between items do not end the table", async () => {
  const read = await readOrderForm(await filledForm(fronts([DOOR, {}, {}, { ...DOOR, "Qty": 2 }])));
  assert.equal(read.lines.length, 2);
  assert.equal(read.lines[1].qty, 2);
});

test("the header row and the line number column are found, not assumed", async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await filledForm(fronts([DOOR])));
  assert.equal(findHeaderRow(workbook.getWorksheet("Fronts and panels"), "fronts"), 7);
  assert.equal(findHeaderRow(workbook.getWorksheet("Carcasses"), "carcasses"), 7);
  assert.equal(lineNumberColumn(workbook.getWorksheet("Fronts and panels"), 7), 1);
});

// ── the kit tab ─────────────────────────────────────────────────────────────

test("a standard size fills the height and width when they were typed over", async () => {
  const read = await readOrderForm(
    await filledForm({
      "Kit fronts": [
        {
          "Cabinet range": "IKEA Metod",
          "Front type": "Door",
          "Standard size (height x width)": "800 x 400",
          "Height mm": "",
          "Width mm": "",
          "Material": "Thermolaminate",
          "Thickness": "18mm",
          "Colour": "Alabaster",
          "Qty": 2,
        },
      ],
    })
  );
  assert.equal(read.lines[0].height_mm, 800);
  assert.equal(read.lines[0].width_mm, 400);
  assert.equal(read.lines[0].cabinet_brand, "IKEA Metod");
});

test("\"Not applicable\" for the cabinet is stored as blank", async () => {
  // It is an answer, but it is the same as blank to everything downstream, and
  // storing the words would make every reader learn to ignore them.
  const read = await readOrderForm(
    await filledForm({
      "Kit fronts": [{ "Cabinet range": "Not applicable", "Front type": "Door", "Qty": 1 }],
    })
  );
  assert.equal(read.lines[0].cabinet_brand, "");
});

// ── the awkward ones ────────────────────────────────────────────────────────

test("an undrilled door carries no drilling at all", async () => {
  // A measurement left behind on an undrilled door is one that reaches a
  // workshop sheet for a door with no holes in it.
  const read = await readOrderForm(await filledForm(fronts([{ ...DOOR, "Drill hinge holes": "No" }])));
  const line = read.lines[0];
  assert.equal(line.hinge_holes, false);
  assert.equal(line.hinge_side, "");
  assert.equal(line.hinge_from_bottom_mm, null);
  assert.equal(line.hinge_from_top_mm, null);
  assert.deepEqual(line.hinge_middles_mm, []);
});

test("the middle cups come across when they are given", async () => {
  const read = await readOrderForm(await filledForm(fronts([{ ...DOOR, "2nd hinge, mm from bottom": 1400 }])));
  assert.deepEqual(read.lines[0].hinge_middles_mm, [1400]);
});

test("a panel says what kind of panel it is, and a door does not", async () => {
  // An end panel, a filler and a kickboard all quote as "Panel" and are all
  // made differently. The answer used to be buried in the notes.
  const read = await readOrderForm(
    await filledForm(
      fronts([
        { ...DOOR, "Type": "Panel", "What is the panel?": "Kickboard" },
        { ...DOOR, "What is the panel?": "Kickboard" },
      ])
    )
  );
  assert.equal(read.lines[0].panel_use, "Kickboard");
  assert.equal(read.lines[1].panel_use, "", "a door is not a kickboard");
});

test("a word we do not offer is dropped rather than stored", async () => {
  // The dropdowns warn rather than refuse, so anything can be typed. What
  // cannot happen is a value reaching the database that no screen can show.
  const read = await readOrderForm(await filledForm(fronts([{ ...DOOR, "Grain direction": "diagonal-ish" }])));
  assert.equal(read.lines[0].grain_direction, "");
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

// ── the carcasses ───────────────────────────────────────────────────────────

test("a carcass row comes back as a line with its box attached", async () => {
  // A cabinet is not priced like a board. It is priced off a cut list worked
  // out from the box, so the box has to survive the trip.
  const read = await readOrderForm(await filledForm({ Carcasses: [BOX] }));
  assert.ok(read.ok, read.error);
  assert.equal(read.cabinets.length, 1);

  const line = read.lines[0];
  assert.equal(line.product_type, "base_cabinet");
  assert.equal(line.cabinet_item_type, "base_cabinet");
  assert.equal(line.qty, 2);

  // NO width or height on the LINE. The quote editor's auto cost is rate times
  // width times height, and real dimensions here would silently reprice a cut
  // list as a flat sheet.
  assert.equal(line.height_mm, null);
  assert.equal(line.width_mm, null);

  assert.deepEqual(line.cabinet_config, {
    label: "B3",
    is_corner: false,
    corner_style: "l_shape",
    height_mm: 720,
    width_mm: 900,
    secondary_width_mm: 0,
    depth_mm: 560,
    carcass_material: "Decorative Board",
    carcass_finish: "Matt",
    carcass_colour: "Classic White",
    carcass_thickness_mm: 18,
    back_panel_included: true,
    back_panel_material: "Decorative Board",
    back_panel_thickness_mm: 18,
    shelf_qty: 2,
    shelf_material: "Decorative Board",
    shelf_finish: "Matt",
    shelf_colour: "Classic White",
    shelf_thickness_mm: 18,
    shelf_heights_mm: [300, 600],
    has_rangehood: false,
    rangehood_housing_height_mm: 0,
    rangehood_channel_width_mm: 0,
    mount_height_mm: null,
    cost_per_sqm_carcass: 0,
    cost_per_sqm_shelf: 0,
    notes: "Waste pipe on the left",
  });
});

test("a blank shelf colour means the same board as the box", async () => {
  // Which is the usual answer and what the column heading promises. Left empty
  // it would be a shelf cut out of nothing.
  const read = await readOrderForm(await filledForm({ Carcasses: [BOX] }));
  const box = read.lines[0].cabinet_config;
  assert.equal(box.shelf_colour, "Classic White");
  assert.equal(box.shelf_material, "Decorative Board");
  assert.equal(box.shelf_thickness_mm, 18);
});

test("no back panel means no back thickness either", async () => {
  const read = await readOrderForm(await filledForm({ Carcasses: [{ ...BOX, "Back panel": "No" }] }));
  const box = read.lines[0].cabinet_config;
  assert.equal(box.back_panel_included, false);
  assert.equal(box.back_panel_thickness_mm, 0);
  assert.equal(box.back_panel_material, "");
});

test("a corner is read as a corner, from the cabinet type alone", async () => {
  const read = await readOrderForm(
    await filledForm({
      Carcasses: [{ ...BOX, "Cabinet type": "Corner cabinet", "Second width mm (corners)": 900 }],
    })
  );
  const box = read.lines[0].cabinet_config;
  assert.equal(box.is_corner, true);
  assert.equal(box.secondary_width_mm, 900);
  assert.equal(read.lines[0].cabinet_item_type, "corner_base_cabinet");
});

test("a corner with one width is flagged, not quietly cut in half", async () => {
  const read = await readOrderForm(
    await filledForm({ Carcasses: [{ ...BOX, "Cabinet type": "Corner cabinet" }] })
  );
  assert.ok(read.ok, "a flag is never a refusal");
  assert.ok(read.warnings.some((warning) => /second width/.test(warning)), read.warnings.join(" | "));
});

test("a rangehood housing turns the rangehood on by itself", async () => {
  const read = await readOrderForm(
    await filledForm({
      Carcasses: [{ ...BOX, "Cabinet type": "Wall cabinet", "Rangehood housing height mm": 400 }],
    })
  );
  assert.equal(read.lines[0].cabinet_config.has_rangehood, true);
  assert.equal(read.lines[0].cabinet_config.rangehood_housing_height_mm, 400);
});

test("a box with no sizes is flagged rather than imported as nothing to cut", async () => {
  const read = await readOrderForm(
    await filledForm({ Carcasses: [{ ...BOX, "Depth mm": "", "Width mm": "" }] })
  );
  assert.ok(read.warnings.some((warning) => /box sizes/.test(warning)), read.warnings.join(" | "));
});

// ── the hardware ────────────────────────────────────────────────────────────

test("a hardware line names the item and who is supplying it", async () => {
  const read = await readOrderForm(
    await filledForm({
      Hardware: [
        {
          "Room or area": "Kitchen",
          "For which cabinet": "B3",
          "Hardware type": "Hinge",
          "Hardware item": "Blum 110 Deg Inserta",
          "Qty": 20,
          "Supplied by": "Customer supplies",
        },
      ],
    })
  );
  const line = read.lines[0];
  assert.equal(line.product_type, "Hardware");
  assert.equal(line.product_name, "Blum 110 Deg Inserta");
  assert.equal(line.hardware_type, "hinge");
  assert.equal(line.supplied_by, "Customer supplies");
  assert.equal(line.qty, 20);
  // And it is said out loud, because it changes whether the line is priced.
  assert.ok(read.warnings.some((warning) => /customer is supplying/.test(warning)));
});

// ── what is worth a person's attention ──────────────────────────────────────

test("a pair ordered on one line is flagged, because it is what costs a remake", async () => {
  const read = await readOrderForm(await filledForm(fronts([{ ...DOOR, "Qty": 2 }])));
  assert.ok(read.warnings.some((warning) => /matched pair/.test(warning)), read.warnings.join(" | "));
});

test("a warning names the tab it came off", async () => {
  // Four tabs each have a row 1, so "Row 1" on its own sends somebody looking
  // in the wrong place.
  const read = await readOrderForm(await filledForm(fronts([{ ...DOOR, "Qty": 2 }])));
  assert.ok(read.warnings.every((warning) => warning.startsWith("Fronts and panels row")), read.warnings.join(" | "));
});

test("a drilled door with no handing is flagged", async () => {
  const read = await readOrderForm(await filledForm(fronts([{ ...DOOR, "Hinge side": "" }])));
  assert.ok(read.warnings.some((warning) => /which side/.test(warning)));
});

test("one hinge position without the other is flagged", async () => {
  const read = await readOrderForm(await filledForm(fronts([{ ...DOOR, "Top hinge, mm from top": "" }])));
  assert.ok(read.warnings.some((warning) => /one hinge position without the other/.test(warning)));
});

test("a flag is never a refusal", async () => {
  // Refusing the file over one line would send somebody back to retyping, which
  // is the thing this exists to stop. A line with two things wrong with it
  // still comes in, named, with both said.
  const read = await readOrderForm(
    await filledForm(fronts([{ ...DOOR, "Qty": 2, "Top hinge, mm from top": "" }]))
  );
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

// ── where it goes ───────────────────────────────────────────────────────────

test("the room and the cabinet reference survive onto the line", async () => {
  // Neither has a column on a quote line yet, and both are how somebody finds a
  // line again three weeks later, so they go at the FRONT of the note rather
  // than being lost.
  const read = await readOrderForm(await filledForm(fronts([DOOR])));
  const line = lineForQuote(read.lines[0]);
  assert.equal(line.notes, "Kitchen / B3 - Match the laundry run");
});

test("a line with no note still says where it goes", async () => {
  const read = await readOrderForm(await filledForm(fronts([{ ...DOOR, "Notes for this line": "" }])));
  assert.equal(lineForQuote(read.lines[0]).notes, "Kitchen / B3");
});

// ── the customer block ──────────────────────────────────────────────────────

test("the details tab fills the customer and the job", async () => {
  const read = await readOrderForm(
    await filledForm(fronts([DOOR]), {
      "First name": "Jason",
      "Last name": "Brown",
      "Company": "Brown Joinery",
      "Email": "jason@brownjoinery.com.au",
      "Phone": "0412 998 300",
      "Street address": "14 Kembla Way",
      "Suburb": "Myaree",
      "Postcode": "6154",
      "Your reference for this job": "Kembla Way laundry",
    })
  );

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

test("what the new doors are going onto reaches the quote as a field", async () => {
  // Not a sentence in the notes. The workshop reads it, and a note nobody can
  // filter on is a note that gets missed on the one job it mattered.
  const read = await readOrderForm(
    await filledForm(fronts([DOOR]), { "Existing hinge brand": "Blum", "Door overlay": "Full overlay" })
  );
  const { patch } = quotePatchFromDetails(read.details);
  assert.equal(patch.existing_hinge_brand, "Blum");
  assert.equal(patch.door_overlay, "Full overlay");
});

test("the answers with nowhere to go end up in the notes", async () => {
  // A quote has no field for a state, a delivery choice, a needed-by date or
  // who measured it. Somebody answered them, so losing them silently is worse
  // than putting them somewhere imperfect.
  const read = await readOrderForm(
    await filledForm(fronts([DOOR]), {
      "State": "WA",
      "Delivery or pickup": "Delivery",
      "Date needed by": "Late September",
      "Measured by": "Jason",
    })
  );
  const { patch, homeless } = quotePatchFromDetails(read.details);
  assert.ok(homeless.includes("State: WA"));
  assert.ok(homeless.includes("Measured by: Jason"));
  assert.match(patch.client_notes, /State: WA/);
  assert.match(patch.client_notes, /Date needed by: Late September/);
});

test("the fields with no home are the ones we know about, and no others", () => {
  const homeless = DETAIL_FIELDS.filter((field) => !field.target).map((field) => field.head);
  assert.deepEqual(homeless, [
    "State",
    "Delivery or pickup",
    "Date needed by",
    "What kind of job is this",
    "Measured by",
    "Date measured",
  ]);
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

test("a cabinet is costed by the same builder the design importer uses", () => {
  // So a cabinet measured on site and a cabinet drawn in the tool cannot end up
  // with two different cut lists.
  assert.match(ROUTE, /withCalculatedCabinetCost/);
  assert.match(ROUTE, /cabinetConfigRow\(/);
  assert.match(ROUTE, /onConflict: "line_item_id"/);
});

test("a cabinet whose box fails to save does not lose the lines", () => {
  // The lines are the part that was going to be retyped. The recovery for a
  // missing box is opening the configurator, not uploading the file again and
  // getting every line twice.
  const tail = ROUTE.slice(ROUTE.indexOf("lines written, cabinets not"));
  assert.ok(!/throw/.test(tail.slice(0, 200)));
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

test("a database without the newest columns still gets the customer", () => {
  // Losing a name and an address over a column added last week would be the
  // wrong trade.
  assert.match(ROUTE, /PGRST204/);
  assert.match(ROUTE, /existing_hinge_brand, door_overlay, \.\.\.rest/);
});

test("a disagreeing customer is reported rather than overwritten", () => {
  assert.match(ROUTE, /conflicts\.push/);
  assert.match(ROUTE, /the form says/);
});
