import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";

import {
  ANY_BRAND,
  CABINET_OPTIONS,
  NOT_A_KIT_CABINET,
  buildOptionTree,
  cabinetsWithStandardSizes,
  colourOptions,
  formatFrontSize,
  hardwareOptions,
  hingeOptions,
  listKey,
  parseFrontSize,
  standardFrontSizes,
} from "../lib/pcd-order-form-data.js";
import { buildOrderFormWorkbook, columnLetter, ITEM_ROWS } from "../lib/pcd-order-form-workbook.js";
import { orderFormFileName, formatGeneratedOn } from "../lib/pcd-order-form.js";
import { PRODUCT_TYPES, MATERIAL_LABELS, THICKNESS_BY_LABEL } from "../lib/pcd-materials.js";
import { profileTypesForSelection, edgeProfilesForMaterial, CABINET_BRANDS } from "../lib/quote-form-data.js";
import { lineIsReady } from "../lib/pcd-quote-ready.js";

// A small stand-in for the libraries, shaped exactly like the rows the tables
// hand back. Deliberately includes the awkward cases: a colour that comes in
// one thickness and not the other, and a switched-off row.
const COLOURS = [
  { name: "Classic White", supplier_name: "Polytec", material_type: "decorative board", thickness: "16mm", finish_type: "Matt", is_active: true },
  { name: "Classic White", supplier_name: "Polytec", material_type: "decorative board", thickness: "18mm", finish_type: "Matt", is_active: true },
  { name: "Notaio Walnut", supplier_name: "Polytec", material_type: "decorative board", thickness: "16mm", finish_type: "Ravine", is_active: true },
  { name: "Sixteen Only", supplier_name: "Polytec", material_type: "decorative board", thickness: "16mm", finish_type: "Matt", is_active: true },
  { name: "Coastal Oak", supplier_name: "Laminex", material_type: "thermolaminate", thickness: "18mm", finish_type: "Woodmatt", is_active: true },
  { name: "Retired Beige", supplier_name: "Laminex", material_type: "decorative board", thickness: "18mm", finish_type: "Matt", is_active: false },
];

const HARDWARE = [
  { type: "hinge", brand: "Blum", name: "110 Deg Inserta", is_active: true },
  { type: "hinge", brand: "Blum", name: "155 Deg", is_active: true },
  { type: "drawer_runner", brand: "Blum", name: "TANDEMBOX antaro", is_active: true },
  { type: "hinge", brand: "Blum", name: "Discontinued", is_active: false },
];

// A one pixel PNG, so the logo can be tested without reading one off disk.
const PNG_PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const tree = () => buildOptionTree({ colours: COLOURS, hardware: HARDWARE });
const listFor = (built, key) => built.lists.find((list) => list.key === key)?.values || null;

// ── The lists are the site's lists ──────────────────────────────────────────

test("the form offers the same product types the rest of the system uses", () => {
  // Not a copy of them. A type added to lib/pcd-materials.js has to reach the
  // form without anybody remembering this file exists.
  assert.deepEqual(tree().types, PRODUCT_TYPES);
});

test("a type only offers the materials it can be made from", () => {
  const built = tree();
  // Hardware is bought, not pressed, so it has no board at all and gets no list.
  assert.equal(listFor(built, listKey("MATERIAL", "Hardware")), null);
  // A table top is a work surface, so no thermolaminate.
  assert.deepEqual(listFor(built, listKey("MATERIAL", "Table top")), ["Decorative Board", "Compact Laminate"]);
  assert.deepEqual(listFor(built, listKey("MATERIAL", "Door")), MATERIAL_LABELS);
});

test("thickness comes from the material", () => {
  const built = tree();
  MATERIAL_LABELS.forEach((material) => {
    assert.deepEqual(listFor(built, listKey("THICKNESS", material)), THICKNESS_BY_LABEL[material]);
  });
});

test("a colour switched off in the library is not on the form", () => {
  // Offering one is inviting an order we then have to go back on.
  const names = colourOptions(COLOURS).map((row) => row.name);
  assert.ok(!names.includes("Retired Beige"));
  assert.ok(names.includes("Classic White"));
});

test("only hinges are offered as hinge models, and a discontinued one is left off", () => {
  assert.deepEqual(hingeOptions(HARDWARE).sort(), ["Blum 110 Deg Inserta", "Blum 155 Deg"]);
  assert.ok(!hingeOptions(HARDWARE).includes("Blum Discontinued"));
  assert.ok(hardwareOptions(HARDWARE).includes("Blum TANDEMBOX antaro"));
});

// ── A routed profile is a thermolaminate thing ──────────────────────────────

test("no material but thermolaminate is offered a door profile", () => {
  // A profile is a vinyl skin pressed over a routed face. There is nothing to
  // press onto a decorative board or a compact laminate, so the columns have to
  // be EMPTY for them rather than quietly taking an answer we cannot make.
  const built = tree();
  MATERIAL_LABELS.filter((material) => material !== "Thermolaminate").forEach((material) => {
    (THICKNESS_BY_LABEL[material] || []).forEach((thickness) => {
      assert.equal(
        listFor(built, listKey("PROFILEGROUP", material, thickness)),
        null,
        `${material} ${thickness} is being offered a profile group`
      );
    });
  });
});

test("thickness narrows the profiles too, because Fluted is 21mm only", () => {
  const built = tree();
  const at18 = listFor(built, listKey("PROFILEGROUP", "Thermolaminate", "18mm"));
  const at21 = listFor(built, listKey("PROFILEGROUP", "Thermolaminate", "21mm"));
  assert.ok(!at18.includes("Fluted"), "Fluted is not made in 18mm");
  assert.ok(at21.includes("Fluted"));

  // And ten of the Detailed ones are 21mm only, so even a group that IS offered
  // at both thicknesses offers fewer profiles at the thinner one.
  const detailed18 = listFor(built, listKey("PROFILE", "Detailed", "Thermolaminate", "18mm"));
  const detailed21 = listFor(built, listKey("PROFILE", "Detailed", "Thermolaminate", "21mm"));
  assert.ok(detailed21.length > detailed18.length);
  assert.ok(!detailed18.includes("Allandale") && detailed21.includes("Allandale"));
});

test("the profile rule is the website's rule, not a second copy of it", () => {
  // Two copies would drift, and the one that got it wrong would be the one a
  // customer filled in unsupervised.
  const built = tree();
  MATERIAL_LABELS.forEach((material) => {
    (THICKNESS_BY_LABEL[material] || []).forEach((thickness) => {
      const expected = profileTypesForSelection(material, thickness);
      const offered = listFor(built, listKey("PROFILEGROUP", material, thickness)) || [];
      assert.deepEqual(offered, expected.length ? expected : []);
    });
  });
});

test("an edge profile is offered per material, and compact laminate gets none", () => {
  const built = tree();
  MATERIAL_LABELS.forEach((material) => {
    const expected = edgeProfilesForMaterial(material);
    assert.deepEqual(listFor(built, listKey("EDGE", material)) || [], expected);
  });
  assert.equal(listFor(built, listKey("EDGE", "Compact Laminate")), null);
});

// ── The one that made thickness sit in the middle of the chain ──────────────

test("the colour list is narrowed by thickness, not just by material", () => {
  // This is the whole reason thickness is asked before finish and colour. Our
  // library holds a row per material AND thickness, and most colours are listed
  // at one of them only. Keying the colours on the material alone would put a
  // 16mm-only colour on an 18mm door and nothing would say so.
  const built = tree();
  assert.deepEqual(listFor(built, listKey("COLOUR", ANY_BRAND, "Decorative Board", "16mm", "Matt")), [
    "Classic White",
    "Sixteen Only",
  ]);
  assert.deepEqual(
    listFor(built, listKey("COLOUR", ANY_BRAND, "Decorative Board", "18mm", "Matt")),
    ["Classic White"],
    "Sixteen Only is not made in 18mm"
  );
});

test("choosing a brand narrows the colours, and leaving it alone shows everything", () => {
  const built = tree();
  assert.deepEqual(listFor(built, listKey("COLOUR", "Polytec", "Decorative Board", "16mm", "Matt")), [
    "Classic White",
    "Sixteen Only",
  ]);
  assert.equal(listFor(built, listKey("COLOUR", "Laminex", "Decorative Board", "16mm", "Matt")), null);
  assert.equal(built.brands[0], ANY_BRAND, "the opt-out is first, so it reads as the default");
});

// ── The IKEA and Kaboodle columns ───────────────────────────────────────────

test("a size is written height first, the way every other size in the business is", () => {
  assert.equal(formatFrontSize(720, 400), "720 x 400");
  assert.deepEqual(parseFrontSize("720 x 400"), { height: 720, width: 400 });
  assert.equal(parseFrontSize("not a size"), null);
});

test("the cabinet list is the website's list, not a second copy of it", () => {
  // One question, not two. "IKEA Metod" already names the brand and the range,
  // and it is the same list lib/quote-form-data.js gives the website form and
  // the quote editor, so an answer on the spreadsheet is the same answer there.
  assert.deepEqual(tree().cabinets, CABINET_OPTIONS);
  assert.ok(CABINET_OPTIONS.includes("Custom panel"));
  assert.ok(!CABINET_OPTIONS.includes("Not sure"), "taken off the list, see quote-form-data.js");
  assert.ok(CABINET_OPTIONS.includes(NOT_A_KIT_CABINET));
});

test("only the kit cabinets have standard sizes", () => {
  // A custom panel is made to a size somebody measured. Offering it a list of
  // IKEA sizes would be offering an answer that cannot be right.
  assert.deepEqual(cabinetsWithStandardSizes(), ["IKEA Besta", "IKEA Metod", "IKEA Pax", "Kaboodle"]);
  const built = tree();
  ["Custom panel", "Custom carcass", NOT_A_KIT_CABINET].forEach((cabinet) => {
    assert.equal(listFor(built, listKey("FRONTSIZE", cabinet, "Door")), null, cabinet);
  });
});

test("the standard sizes are the audited catalogue, not worked out from a frame", () => {
  // The rule that matters: a Metod frame is made 800 wide and the door that
  // goes on it is not, there is no 500 wide Metod door at all, and a Pax door
  // is only ever 250, 370 or 500. Deriving these from frame sizes would offer
  // sizes IKEA does not sell.
  const built = tree();
  const metodDoors = listFor(built, listKey("FRONTSIZE", "IKEA Metod", "Door"));
  assert.ok(metodDoors.length);
  assert.ok(!metodDoors.some((size) => parseFrontSize(size).width === 500), "there is no 500 wide Metod door");
  assert.ok(!metodDoors.some((size) => parseFrontSize(size).width === 800), "an 800 frame takes two 400 doors");

  const paxWidths = new Set(listFor(built, listKey("FRONTSIZE", "IKEA Pax", "Door")).map((s) => parseFrontSize(s).width));
  assert.deepEqual([...paxWidths].sort((a, b) => a - b), [250, 370, 500]);
});

test("the standard sizes are split by what the piece is", () => {
  // A Metod drawer front comes 100, 200 or 400 high and a Metod door never
  // does. One combined list would offer a door size that does not exist.
  const built = tree();
  const doors = listFor(built, listKey("FRONTSIZE", "IKEA Metod", "Door"));
  const drawers = listFor(built, listKey("FRONTSIZE", "IKEA Metod", "Drawer front"));
  assert.ok(drawers.includes("100 x 400"));
  assert.ok(!doors.includes("100 x 400"));
});

test("a size list is filed under exactly the words the column shows", () => {
  // The bug this pins, which cost a rebuild the first time. Sizes were filed
  // under a name the Cabinet column never displays, so the lookup missed and
  // the customer got an empty dropdown with no way to tell that from "we do
  // not do those". The cabinet's own name IS the key now.
  const built = tree();
  tree().cabinets.forEach((cabinet) => {
    const doors = listFor(built, listKey("FRONTSIZE", cabinet, "Door"));
    const expected = standardFrontSizes().find((e) => e.cabinet === cabinet && e.type === "Door");
    assert.deepEqual(doors, expected ? expected.sizes : null, cabinet);
  });
  assert.ok(listFor(built, listKey("FRONTSIZE", "Kaboodle", "Door")).includes("717 x 450"));
});

test("a range with no piece of that type offers nothing rather than the wrong thing", () => {
  // Besta is doors and drawer fronts. Asking it for a panel size has to come
  // back empty, not fall through to another range's list.
  const built = tree();
  assert.equal(listFor(built, listKey("FRONTSIZE", "IKEA Besta", "Panel")), null);
  assert.ok(listFor(built, listKey("FRONTSIZE", "IKEA Besta", "Door")));
});

test("every standard size the catalogue holds is reachable", () => {
  const built = tree();
  standardFrontSizes().forEach((entry) => {
    assert.deepEqual(listFor(built, listKey("FRONTSIZE", entry.cabinet, entry.type)), entry.sizes);
  });
});

// ── The workbook itself ─────────────────────────────────────────────────────

async function build() {
  const workbook = await buildOrderFormWorkbook({
    colours: COLOURS,
    hardware: HARDWARE,
    generatedOn: "1 January 2026",
  });
  const buffer = await workbook.xlsx.writeBuffer();
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(buffer);
  return reopened;
}

/** Every formula in the hidden machinery columns of a row. */
function helperFormulas(sheet, row) {
  const out = [];
  for (let column = 1; column <= 60; column += 1) {
    const letter = columnLetter(column);
    if (!sheet.getColumn(letter).hidden) continue;
    const formula = sheet.getCell(`${letter}${row}`).formula;
    if (formula) out.push(formula);
  }
  return out;
}

/** The column a heading sits in, so the tests do not pin letters that shift. */
function headings(sheet, headRow) {
  const found = new Map();
  for (let column = 1; column <= 40; column += 1) {
    const letter = columnLetter(column);
    const value = sheet.getCell(`${letter}${headRow}`).value;
    if (value) found.set(String(value).replace(/ \*$/, ""), letter);
  }
  return found;
}

test("the details sheet comes first, because it is filled in first", async () => {
  const workbook = await build();
  assert.deepEqual(
    workbook.worksheets.map((sheet) => sheet.name),
    ["Your Details", "Order Form", "How to fill this in", "Colour list", "Lists"]
  );
});

test("the details sheet is set up to print on one A4 page", async () => {
  // It gets printed and stapled to the job, so coming out as one page and a
  // strip is the difference between useful and annoying.
  const workbook = await build();
  const setup = workbook.getWorksheet("Your Details").pageSetup;
  assert.equal(setup.paperSize, 9, "9 is A4");
  assert.equal(setup.orientation, "portrait");
  assert.equal(setup.fitToWidth, 1);
  assert.equal(setup.fitToHeight, 1);
});

test("the details sheet asks everything the website asks, plus what an order needs", async () => {
  const workbook = await build();
  const sheet = workbook.getWorksheet("Your Details");
  const labels = [];
  for (let row = 4; row <= 40; row += 1) {
    const value = sheet.getCell(`B${row}`).value;
    const asText = value && typeof value === "object" && value.richText
      ? value.richText.map((part) => part.text).join("")
      : value;
    if (asText) labels.push(String(asText).replace(/ \*$/, "").trim());
  }

  // Everything the website request form collects.
  ["First name", "Last name", "Email", "Phone", "Cabinet brand"].forEach((field) => {
    assert.ok(labels.includes(field), `the website asks for ${field} and this does not`);
  });
  assert.ok(labels.includes("Suburb"), "the website asks for a delivery suburb");

  // And what an ORDER needs that a website enquiry does not: somewhere to send
  // it, and the company name for the trade customers this form is really for.
  ["Company", "Street address", "State", "Postcode", "Delivery or pickup"].forEach((field) => {
    assert.ok(labels.includes(field), `an order needs ${field}`);
  });
});

test("the cabinet brand on the details sheet is the website's own list", async () => {
  const workbook = await build();
  const lists = workbook.getWorksheet("Lists");
  const range = workbook.definedNames.model.find((entry) => entry.name === "cabinetbrands").ranges[0];
  const match = String(range).match(/\$([A-Z]+)\$(\d+):\$[A-Z]+\$(\d+)/);
  const values = [];
  for (let row = Number(match[2]); row <= Number(match[3]); row += 1) {
    values.push(String(lists.getCell(`${match[1]}${row}`).value));
  }
  assert.deepEqual(values, CABINET_BRANDS);
});

test("height is asked for before width", async () => {
  // Every size in this business is written height first: on the site, on a
  // quote, on the workshop sheet. A form that put width first would be the one
  // place they were the other way round, and that costs a door.
  const workbook = await build();
  const sheet = workbook.getWorksheet("Order Form");
  const at = headings(sheet, 7);
  assert.ok(at.has("Height mm") && at.has("Width mm"));
  assert.ok(
    columnLetter.length && at.get("Height mm") < at.get("Width mm"),
    `height is in ${at.get("Height mm")} and width in ${at.get("Width mm")}`
  );
  // And the standard size label says which way round it reads.
  assert.ok([...at.keys()].some((head) => /height x width/i.test(head)));
});

test("the kit cabinet columns come after the type and before the board", async () => {
  // The order the answers actually arrive in: what it is, whose carcass it goes
  // on, which of their sizes, and only then what it is made of. The size list
  // cannot be offered before the type, because a drawer front and a door are
  // sold in different sizes.
  const workbook = await build();
  const at = headings(workbook.getWorksheet("Order Form"), 7);
  const order = ["Type", "Which cabinet", "Standard size", "Material"];
  const letters = order.map((head) => at.get(head) || [...at.entries()].find(([k]) => k.startsWith(head))?.[1]);
  letters.forEach((letter, i) => {
    if (i === 0) return;
    assert.ok(letter > letters[i - 1], `${order[i]} should come after ${order[i - 1]}`);
  });
});

test("every list on the hidden sheet is reachable by name", async () => {
  // A dropdown points at a defined name. A list published without one, or a
  // name pointing at the wrong column, is a dropdown that opens empty, and the
  // customer has no way to tell that from "we do not stock any".
  const workbook = await build();
  const built = tree();
  const lists = workbook.getWorksheet("Lists");

  const keymapRows = [];
  for (let row = 2; ; row += 1) {
    const key = lists.getCell(`A${row}`).value;
    if (!key) break;
    keymapRows.push({ key: String(key), name: String(lists.getCell(`B${row}`).value) });
  }
  assert.equal(keymapRows.length, built.lists.length, "one lookup row per list");

  const names = new Map(workbook.definedNames.model.map((entry) => [entry.name, entry.ranges]));
  keymapRows.forEach((entry, i) => {
    assert.equal(entry.key, built.lists[i].key);
    const ranges = names.get(entry.name);
    assert.ok(ranges && ranges.length, `${entry.key} has no defined name`);

    // A list of one is written as a single cell rather than a range of one,
    // which is the same thing to Excel and a different string here.
    const match = String(ranges[0]).match(/\$([A-Z]+)\$(\d+)(?::\$[A-Z]+\$(\d+))?$/);
    assert.ok(match, `unreadable range for ${entry.key}: ${ranges[0]}`);
    const [, letter, from, to = match[2]] = match;
    const values = [];
    for (let row = Number(from); row <= Number(to); row += 1) {
      values.push(String(lists.getCell(`${letter}${row}`).value));
    }
    assert.deepEqual(values, built.lists[i].values, `wrong values behind ${entry.key}`);
  });
});

test("the placeholder list says what to do rather than opening empty", async () => {
  const workbook = await build();
  const names = new Map(workbook.definedNames.model.map((entry) => [entry.name, entry.ranges]));
  assert.ok(names.has("opt_none"));
  const lists = workbook.getWorksheet("Lists");
  const cell = String(names.get("opt_none")[0]).match(/\$([A-Z]+)\$(\d+)/);
  assert.match(String(lists.getCell(`${cell[1]}${cell[2]}`).value), /fill in the columns/i);
});

test("the filtered columns validate against their helper cell and nothing more", async () => {
  // The validation is kept trivial on purpose: all the work is in an ordinary
  // cell formula beside it. Excel is fussy about what it accepts inside a
  // validation, so anything more here is a dropdown that quietly stops working
  // in somebody else's copy of Excel.
  const workbook = await build();
  const sheet = workbook.getWorksheet("Order Form");
  const at = headings(sheet, 7);
  const filtered = [
    "Material",
    "Thickness",
    "Finish",
    "Colour",
    "Edge profile",
    "Profile group",
    "Door profile",
  ];
  filtered.forEach((head) => {
    const letter = at.get(head);
    const validation = sheet.getCell(`${letter}8`).dataValidation;
    assert.ok(validation, `${head} has no validation`);
    assert.equal(validation.type, "list");
    assert.match(validation.formulae[0], /^INDIRECT\(\$[A-Z]+8\)$/, `${head}: ${validation.formulae[0]}`);
  });
});

test("a filtered dropdown falls back to the placeholder rather than an error", async () => {
  const workbook = await build();
  const sheet = workbook.getWorksheet("Order Form");
  // IFERROR around the lookup. Without it a row with no type yet shows #N/A in
  // the helper cell and the dropdown beside it refuses to open at all.
  const lookups = helperFormulas(sheet, 8).filter((formula) => formula.includes("VLOOKUP"));
  assert.ok(lookups.length >= 8, "every filtered column needs a helper");
  lookups.forEach((formula) => {
    assert.match(formula, /^IFERROR\(VLOOKUP\(/, formula);
    assert.match(formula, /"opt_none"\)$/, formula);
  });
});

test("every item row is wired, not just the first", async () => {
  const workbook = await build();
  const sheet = workbook.getWorksheet("Order Form");
  const at = headings(sheet, 7);
  const last = 8 + ITEM_ROWS - 1;
  [8, 9, Math.floor((8 + last) / 2), last].forEach((row) => {
    const colour = sheet.getCell(`${at.get("Colour")}${row}`).dataValidation;
    assert.match(colour.formulae[0], new RegExp(`^INDIRECT\\(\\$[A-Z]+${row}\\)$`), `row ${row}`);
    assert.ok(sheet.getCell(`${at.get("Is this line complete?")}${row}`).formula, `row ${row} has no check`);
  });
  assert.equal(sheet.getCell(`A${last}`).value, ITEM_ROWS);
});

test("the helper columns are hidden and the lists sheet cannot be stumbled into", async () => {
  // Not for secrecy. The helpers are machinery, and a customer who deletes one
  // silently breaks the dropdown next to it with nothing to say why.
  const workbook = await build();
  const sheet = workbook.getWorksheet("Order Form");
  for (let column = 28; column <= 40; column += 1) {
    const excel = sheet.getColumn(columnLetter(column));
    if (excel.width && excel.width > 5) {
      assert.equal(excel.hidden, true, `${columnLetter(column)} should be hidden`);
    }
  }
  assert.equal(workbook.getWorksheet("Lists").state, "veryHidden");
});

test("the cells a person fills in are the only ones left unlocked", async () => {
  const workbook = await build();
  const sheet = workbook.getWorksheet("Order Form");
  const at = headings(sheet, 7);
  assert.equal(sheet.getCell(`${at.get("Type")}8`).protection?.locked, false, "type is theirs to fill in");
  assert.equal(sheet.getCell(`${at.get("Notes for this line")}8`).protection?.locked, false);
  // The line number and the check are ours, and a paste over either takes the
  // formula with it.
  assert.notEqual(sheet.getCell("A8").protection?.locked, false);
  assert.notEqual(sheet.getCell(`${at.get("Is this line complete?")}8`).protection?.locked, false);

  // The details sheet is the same: the answers are unlocked, the labels are not.
  const details = workbook.getWorksheet("Your Details");
  const firstAnswer = [];
  for (let row = 5; row <= 40; row += 1) {
    if (details.getCell(`C${row}`).protection?.locked === false) firstAnswer.push(row);
  }
  assert.ok(firstAnswer.length >= 14, "every question needs a box that can be typed in");
  assert.notEqual(details.getCell(`B${firstAnswer[0]}`).protection?.locked, false, "its label is not editable");
});

test("every answer box on the details sheet is the same width", async () => {
  // Boxes of three different widths stacked down a page look like a mistake
  // even when each one is deliberate. They all span the same four columns now.
  const workbook = await build();
  const details = workbook.getWorksheet("Your Details");
  const spans = [];
  for (let row = 5; row <= 40; row += 1) {
    if (details.getCell(`C${row}`).protection?.locked !== false) continue;
    let last = "C";
    ["D", "E", "F"].forEach((letter) => {
      if (details.getCell(`${letter}${row}`).protection?.locked === false) last = letter;
    });
    spans.push(`C:${last}`);
  }
  assert.ok(spans.length, "no answer boxes found");
  assert.equal(new Set(spans).size, 1, `boxes come in ${new Set(spans).size} widths: ${[...new Set(spans)].join(", ")}`);
});

test("a hint sits under the box it is about, not beside it", async () => {
  // Parked in the column to the right it needed a column wide enough to hold
  // it, which on A4 there is not, so it wrapped and got cut off mid sentence.
  const workbook = await build();
  const details = workbook.getWorksheet("Your Details");
  // Nothing at all in the column past the answer boxes.
  for (let row = 4; row <= 40; row += 1) {
    assert.ok(!details.getCell(`G${row}`).value, `something is still parked in G${row}`);
  }
  // And the hint for the email question is on the row under it.
  let emailRow = 0;
  for (let row = 5; row <= 40; row += 1) {
    if (String(details.getCell(`B${row}`).value || "").startsWith("Email")) emailRow = row;
  }
  assert.ok(emailRow, "the email question is missing");
  assert.match(String(details.getCell(`C${emailRow + 1}`).value), /where the quote goes/i);
});

test("the logo is on both sheets a customer looks at", async () => {
  // They are two tabs of one document, and one of them turning up plain reads
  // as a different, less careful document.
  const workbook = await buildOrderFormWorkbook({
    colours: COLOURS,
    hardware: HARDWARE,
    generatedOn: "1 January 2026",
    logo: PNG_PIXEL,
  });
  assert.equal(workbook.getWorksheet("Your Details").getImages().length, 1);
  assert.equal(workbook.getWorksheet("Order Form").getImages().length, 1, "the Order Form tab lost its branding");
});

// ── The standard size fills in the height and the width ─────────────────────

test("picking a standard size fills in the height and width columns", async () => {
  // There is one place a size lives on a row whichever kind of line it is, so
  // nobody reading the sheet back has to look in two columns to find it.
  const workbook = await build();
  const sheet = workbook.getWorksheet("Order Form");
  const at = headings(sheet, 7);

  const height = sheet.getCell(`${at.get("Height mm")}8`).formula;
  const width = sheet.getCell(`${at.get("Width mm")}8`).formula;
  assert.match(height, /^IF\(\$[A-Z]+8=0,"",\$[A-Z]+8\)$/);
  assert.match(width, /^IF\(\$[A-Z]+8=0,"",\$[A-Z]+8\)$/);
  assert.notEqual(height, width, "height and width read different halves of the size");

  // And they read the size apart on the same separator the labels are built
  // with, so a change to one cannot leave the other behind.
  const helpers = helperFormulas(sheet, 8).filter((formula) => formula.includes("VALUE("));
  assert.equal(helpers.length, 2, "one helper for the height, one for the width");
  assert.ok(helpers.every((formula) => formula.includes('" x "')));
  assert.ok(helpers.some((formula) => formula.startsWith("IFERROR(VALUE(LEFT(")), "the height is the left half");
  assert.ok(helpers.some((formula) => formula.startsWith("IFERROR(VALUE(MID(")), "the width is the right half");
});

test("a blank row says nothing at all, even though every row carries formulas", async () => {
  // SUMPRODUCT rather than COUNTA. The height and width columns hold a formula
  // on every one of the hundred rows, and COUNTA counts a formula returning ""
  // as filled in, so every row would have reported itself incomplete.
  const workbook = await build();
  const sheet = workbook.getWorksheet("Order Form");
  const at = headings(sheet, 7);
  const check = sheet.getCell(`${at.get("Is this line complete?")}8`).formula;
  assert.match(check, /^IF\(SUMPRODUCT\(--\(\$B8:\$[A-Z]+8<>""\)\)=0,""/);
  assert.ok(!check.includes("COUNTA"), "COUNTA counts a formula-blank as filled in");
});

// ── The check column ────────────────────────────────────────────────────────

function gapsFormula(workbook) {
  const sheet = workbook.getWorksheet("Order Form");
  const found = helperFormulas(sheet, 8).find((formula) => formula.includes("a product type, "));
  if (!found) throw new Error("the gaps helper is missing");
  return found;
}

test("the check column asks for exactly what lib/pcd-quote-ready.js asks for", async () => {
  // The sheet cannot import the rule, so this pins the two together: anything
  // the site would refuse to quote has to be something the form asks for, or a
  // customer fills the form in, sees "Ready", sends it, and gets a phone call.
  const workbook = await build();
  const formula = gapsFormula(workbook);

  const board = {
    productType: "Door",
    material: "Decorative Board",
    thickness: "18mm",
    colour: "Classic White",
    width: 500,
    height: 700,
  };
  assert.ok(lineIsReady(board), "the fixture is a line the site would quote");

  [
    ["productType", "a product type"],
    ["material", "a material"],
    ["thickness", "a thickness"],
    ["colour", "a colour"],
    ["width", "a width"],
    ["height", "a height"],
  ].forEach(([field, wording]) => {
    const blanked = { ...board, [field]: field === "width" || field === "height" ? 0 : "" };
    assert.ok(!lineIsReady(blanked), `${field} is required by the site`);
    assert.ok(formula.includes(`"${wording}, "`), `the form never asks for ${wording}`);
  });
});

test("the check catches an answer left behind when the column above it changed", async () => {
  // A dropdown cannot prevent this: pick a profile on a thermolaminate line,
  // then change the material to decorative board, and the profile stays put on
  // a board that cannot be routed at all. Each of these asks the SAME list the
  // dropdown offers, so none of them can disagree with it.
  const formula = gapsFormula(await build());
  [
    "a colour that comes in that thickness, ",
    "an edge profile that suits that material, ",
    "no door profile (only thermolaminate can be routed), ",
    "a door profile made in that material and thickness, ",
  ].forEach((wording) => assert.ok(formula.includes(`"${wording}"`), `missing check: ${wording}`));
  assert.ok(formula.includes("COUNTIF(INDIRECT("), "the checks read the dropdown's own list");
});

test("the check catches a standard size typed over", async () => {
  // The one cost of letting the height and width be typed over: a row typed
  // over and THEN given a standard size would not update itself.
  const formula = gapsFormula(await build());
  assert.ok(formula.includes('"the height and width to match the standard size, or clear the standard size, "'));
});

test("the check reads a hardware line on its own terms", async () => {
  // A hardware line is bought rather than made, so it has no board, size or
  // finish to be missing. Judging it by the board rules would report six things
  // wrong with a line that is perfectly complete.
  const workbook = await build();
  const at = headings(workbook.getWorksheet("Order Form"), 7);
  const check = workbook.getWorksheet("Order Form").getCell(`${at.get("Is this line complete?")}8`).formula;
  assert.match(check, /="Hardware"/);
  assert.match(check, /Needs: which hardware item/);
  assert.ok(lineIsReady({ productType: "Hardware", hardwareId: "blum-110" }));
  assert.ok(!lineIsReady({ productType: "Hardware" }));
});

test("the drilling positions are two numbered columns, not a sentence in the notes", async () => {
  // "100 from each end" written in prose has to be read and retyped by a person,
  // and that is how a run of doors ends up drilled to two different patterns.
  const workbook = await build();
  const sheet = workbook.getWorksheet("Order Form");
  const at = headings(sheet, 7);

  ["Bottom hinge, mm from bottom", "Top hinge, mm from top"].forEach((head) => {
    const cell = sheet.getCell(`${at.get(head)}8`);
    assert.equal(cell.dataValidation.type, "decimal", `${head} should take a measurement`);
    assert.equal(cell.dataValidation.operator, "greaterThan");
    assert.equal(cell.numFmt, "0", "millimetres, whole numbers");
  });

  // Blank positions are the normal answer and mean our standard ones, so there
  // is nothing to nag about there. ONE end without the other is different: it
  // is half a pattern, which is what somebody leaves behind mid-thought.
  const formula = gapsFormula(workbook);
  assert.ok(formula.includes('"both hinge positions, or neither, "'));
  assert.ok(!formula.includes("As set out in the next two columns"), "the mode column is gone");
});

test("the middle cups are asked for on a door that has any", async () => {
  // Only on three or four hinges, and only once there are two ends to space
  // between. A middle measurement with no bottom and top is a number with
  // nothing to measure it against.
  const workbook = await build();
  const sheet = workbook.getWorksheet("Order Form");
  const at = headings(sheet, 7);
  ["2nd hinge, mm from bottom", "3rd hinge, mm from bottom"].forEach((head) => {
    const cell = sheet.getCell(`${at.get(head)}8`);
    assert.equal(cell.dataValidation.type, "decimal", head);
    assert.equal(cell.numFmt, "0");
  });
  assert.ok(gapsFormula(workbook).includes('"the bottom and top hinge as well, "'));
});

// ── The reference sheet and the file name ───────────────────────────────────

test("the colour sheet lists every active colour and no others", async () => {
  const workbook = await build();
  const sheet = workbook.getWorksheet("Colour list");
  const names = [];
  for (let row = 2; ; row += 1) {
    const value = sheet.getCell(`E${row}`).value;
    if (!value) break;
    names.push(String(value));
  }
  assert.equal(names.length, colourOptions(COLOURS).length);
  assert.ok(!names.includes("Retired Beige"));
});

test("the file is dated, so a form filled in from an old copy shows it", () => {
  assert.equal(orderFormFileName(new Date("2026-08-25T02:00:00Z")), "PCD-Order-Form-2026-08-25.xlsx");
  // Perth, not UTC. Ten in the morning here is two in the morning UTC, and a
  // form downloaded on the 25th should not be stamped the 24th.
  assert.equal(orderFormFileName(new Date("2026-08-24T17:00:00Z")), "PCD-Order-Form-2026-08-25.xlsx");
  assert.equal(formatGeneratedOn(new Date("2026-08-24T17:00:00Z")), "25 August 2026");
});

test("columnLetter counts past Z the way Excel does", () => {
  assert.equal(columnLetter(1), "A");
  assert.equal(columnLetter(26), "Z");
  assert.equal(columnLetter(27), "AA");
  assert.equal(columnLetter(52), "AZ");
  assert.equal(columnLetter(53), "BA");
});
