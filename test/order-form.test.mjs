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
import { TABS } from "../lib/pcd-order-form-tabs.js";
import { orderFormFileName, formatGeneratedOn } from "../lib/pcd-order-form.js";
import { PRODUCT_TYPES, MATERIAL_LABELS, THICKNESS_BY_LABEL } from "../lib/pcd-materials.js";
import { profileTypesForSelection, edgeProfilesForMaterial, CABINET_BRANDS } from "../lib/quote-form-data.js";
import { lineIsReady } from "../lib/pcd-quote-ready.js";
import { HINGE_COUNT_BREAKS, hingesForHeight } from "../lib/pcd-hinges.js";
import { ROOM_AREAS } from "../lib/pcd-line-details.js";
import { cabinetTypeOptions } from "../lib/pcd-design-parts.js";
import { cabinetSpecFromDesignItem } from "../lib/pcd-cabinet-from-design.js";

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

async function build(extra = {}) {
  const workbook = await buildOrderFormWorkbook({
    colours: COLOURS,
    hardware: HARDWARE,
    generatedOn: "1 January 2026",
    ...extra,
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
function headings(sheet, headRow = 7) {
  const found = new Map();
  for (let column = 1; column <= 40; column += 1) {
    const letter = columnLetter(column);
    const value = sheet.getCell(`${letter}${headRow}`).value;
    if (value) found.set(String(value).replace(/ \*$/, ""), letter);
  }
  return found;
}

/** The labels down the details sheet, however far down it now runs. */
function detailLabels(sheet) {
  const labels = [];
  for (let row = 4; row <= 90; row += 1) {
    const value = sheet.getCell(`B${row}`).value;
    const asText =
      value && typeof value === "object" && value.richText
        ? value.richText.map((part) => part.text).join("")
        : value;
    if (asText) labels.push(String(asText).replace(/ \*$/, "").trim());
  }
  return labels;
}

/** The row a details question sits on. */
function detailRow(sheet, label) {
  for (let row = 4; row <= 90; row += 1) {
    if (String(sheet.getCell(`B${row}`).value || "").replace(/ \*$/, "").trim() === label) return row;
  }
  return 0;
}

/** The values behind a defined name. */
function namedValues(workbook, name) {
  const entry = workbook.definedNames.model.find((item) => item.name === name);
  if (!entry) return null;
  const sheetName = String(entry.ranges[0]).split("!")[0].replace(/'/g, "");
  const sheet = workbook.getWorksheet(sheetName);
  const match = String(entry.ranges[0]).match(/\$([A-Z]+)\$(\d+)(?::\$[A-Z]+\$(\d+))?$/);
  const values = [];
  for (let row = Number(match[2]); row <= Number(match[3] || match[2]); row += 1) {
    values.push(String(sheet.getCell(`${match[1]}${row}`).value));
  }
  return values;
}

// ── The tabs ────────────────────────────────────────────────────────────────

test("the sheets are in the order they are worked through", async () => {
  const workbook = await build();
  assert.deepEqual(
    workbook.worksheets.map((sheet) => sheet.name),
    [
      "Start here",
      "Kit fronts",
      "Fronts and panels",
      "Carcasses",
      "Hardware",
      "How to fill this in",
      "Colour list",
      "Lists",
    ]
  );
});

test("every measuring tab carries the same five columns", async () => {
  // Room, cabinet reference, quantity, notes and the check. They are what let
  // four tabs be read into one quote, and what lets somebody find a line again
  // three weeks later. Defined once in pcd-order-form-tabs.js and spread into
  // each tab, so they cannot drift apart.
  const workbook = await build();
  const shared = ["Room or area", "Qty", "Notes for this line", "Is this line complete?"];
  TABS.forEach((tab) => {
    const at = headings(workbook.getWorksheet(tab.sheet));
    shared.forEach((head) => assert.ok(at.has(head), `${tab.sheet} is missing ${head}`));
    // The hardware tab asks the same question in its own words, because the
    // line is for a cabinet rather than being one.
    assert.ok(
      at.has("Cabinet reference") || at.has("For which cabinet"),
      `${tab.sheet} has nowhere to say which cabinet`
    );
  });
});

test("a refresh measure is never shown a kit cabinet column", async () => {
  // The whole reason there is more than one tab. On the made to measure tab
  // there is no range to pick and no standard size to fail to find, because
  // neither can apply to a door somebody is measuring off an existing carcass.
  const workbook = await build();
  const at = headings(workbook.getWorksheet("Fronts and panels"));
  assert.ok(!at.has("Cabinet range"));
  assert.ok(![...at.keys()].some((head) => /standard size/i.test(head)));
  // And the sizes are typed, not filled in from a catalogue.
  const sheet = workbook.getWorksheet("Fronts and panels");
  assert.equal(sheet.getCell(`${at.get("Height mm")}8`).formula, undefined);
});

test("a kit front is not asked for hinge positions it cannot have", async () => {
  // It is bored to its range's own pattern, so there is nothing to measure and
  // four columns would sit empty through an entire IKEA job.
  const workbook = await build();
  const kit = headings(workbook.getWorksheet("Kit fronts"));
  const fronts = headings(workbook.getWorksheet("Fronts and panels"));
  const positions = ["Bottom hinge, mm from bottom", "Top hinge, mm from top", "2nd hinge, mm from bottom"];
  positions.forEach((head) => {
    assert.ok(!kit.has(head), `${head} does not belong on Kit fronts`);
    assert.ok(fronts.has(head), `${head} belongs on Fronts and panels`);
  });
  // But handing still does. A kit door is hinged left or right like any other.
  assert.ok(kit.has("Hinge side"));
});

test("a hardware line is asked nothing about board, size or colour", async () => {
  // It is bought rather than made. On the single sheet it sat in a row of
  // columns that all wanted a board, and the check had to be taught to ignore
  // them; on its own tab there is nothing to ignore.
  const workbook = await build();
  const at = headings(workbook.getWorksheet("Hardware"));
  ["Material", "Thickness", "Colour", "Height mm", "Width mm", "Edge profile"].forEach((head) => {
    assert.ok(!at.has(head), `${head} is not a question about a handle`);
  });
  assert.ok(at.has("Hardware type") && at.has("Hardware item") && at.has("Supplied by"));
});

test("the carcass tab asks for everything a cut list is worked out from", async () => {
  // A cabinet is priced off its box, and the box is the same shape the design
  // tool builds. Anything the shared builder produces that the form cannot ask
  // for is a cabinet that imports half configured.
  const workbook = await build();
  const at = headings(workbook.getWorksheet("Carcasses"));
  const asked = {
    height_mm: "Height mm",
    width_mm: "Width mm",
    secondary_width_mm: "Second width mm (corners)",
    depth_mm: "Depth mm",
    carcass_material: "Carcass material",
    carcass_finish: "Carcass finish",
    carcass_colour: "Carcass colour",
    carcass_thickness_mm: "Carcass thickness",
    back_panel_included: "Back panel",
    back_panel_thickness_mm: "Back thickness",
    shelf_qty: "Shelves",
    shelf_heights_mm: "Shelf heights, mm from bottom",
    shelf_colour: "Shelf colour (blank = same as carcass)",
    shelf_thickness_mm: "Shelf thickness (blank = same)",
    mount_height_mm: "Mount height mm",
    rangehood_housing_height_mm: "Rangehood housing height mm",
    rangehood_channel_width_mm: "Rangehood channel width mm",
  };
  Object.entries(asked).forEach(([field, head]) => {
    assert.ok(at.has(head), `${field} has no column (${head})`);
  });

  // And the fields it deliberately does not ask about, each for a reason.
  const spec = cabinetSpecFromDesignItem({});
  const notAsked = [
    "label", // the cabinet reference is the label
    "is_corner", // read off the cabinet type
    "corner_style", // the configurator's default, said in the notes if it differs
    "back_panel_material", // the same board as the box
    "shelf_material", // the same board as the box
    "shelf_finish", // follows the shelf colour
    "has_rangehood", // true when a rangehood measurement is given
    "cost_per_sqm_carcass", // no prices on this form, ever
    "cost_per_sqm_shelf",
    "notes",
  ];
  const covered = new Set([...Object.keys(asked), ...notAsked]);
  Object.keys(spec).forEach((field) => {
    assert.ok(covered.has(field), `${field} is neither asked for nor deliberately left out`);
  });
});

test("the cabinet types are the ones we actually make, not a new list", async () => {
  // That list is already written out in more places than it should be. The form
  // reads one of them rather than becoming another.
  const workbook = await build();
  assert.deepEqual(
    namedValues(workbook, "cabinettypes"),
    cabinetTypeOptions().map((option) => option.label)
  );
});

// ── Nothing on the form is a dead end ───────────────────────────────────────

test("every dropdown warns and then lets the answer through", async () => {
  // It is filled in on site, under time pressure. A refusal there is a line
  // that never gets written down, which costs far more than a value somebody
  // here has to match up by hand.
  const workbook = await build();
  TABS.forEach((tab) => {
    const sheet = workbook.getWorksheet(tab.sheet);
    for (let column = 1; column <= 30; column += 1) {
      const validation = sheet.getCell(`${columnLetter(column)}8`).dataValidation;
      if (!validation) continue;
      assert.equal(
        validation.errorStyle,
        "warning",
        `${tab.sheet} column ${columnLetter(column)} refuses instead of warning`
      );
    }
  });
});

test("a narrowed list shows everything while the columns it depends on are blank", async () => {
  // The dead end on the single sheet: answer out of order and the dropdown told
  // you to go back a column. Narrowing is a convenience, not a gate.
  const workbook = await build();
  const sheet = workbook.getWorksheet("Fronts and panels");
  const at = headings(sheet);
  const helperOf = (head) => {
    const validation = sheet.getCell(`${at.get(head)}8`).dataValidation;
    const letter = validation.formulae[0].match(/INDIRECT\(\$([A-Z]+)8\)/)[1];
    return sheet.getCell(`${letter}8`).formula;
  };

  assert.match(helperOf("Material"), /^IF\(OR\(\$[A-Z]+8=""\),"materials"/);
  assert.match(helperOf("Thickness"), /^IF\(OR\(\$[A-Z]+8=""\),"thicknesses"/);
  assert.match(helperOf("Edge profile"), /^IF\(OR\(\$[A-Z]+8=""\),"edges"/);
});

test("a blank finish still narrows the colours by material and thickness", async () => {
  // The finish is an optional question. A colour column that emptied itself
  // because nobody answered it would be a dead end on the one column the whole
  // form exists to get right, and falling all the way back to every colour we
  // hold would offer a 16mm colour on an 18mm door.
  const workbook = await build();
  const sheet = workbook.getWorksheet("Fronts and panels");
  const at = headings(sheet);
  const validation = sheet.getCell(`${at.get("Colour")}8`).dataValidation;
  const letter = validation.formulae[0].match(/INDIRECT\(\$([A-Z]+)8\)/)[1];
  const helper = sheet.getCell(`${letter}8`).formula;

  // Three steps, widening: finish blank falls to material and thickness, and
  // only a blank material falls to the whole library.
  assert.ok(helper.includes('"COLOUR|"'), helper);
  assert.ok(helper.includes('"colours"'), "no final fallback");
  assert.equal((helper.match(/VLOOKUP/g) || []).length, 2, "the middle step is missing");

  // And that middle list is really published.
  const built = tree();
  const withoutFinish = built.lists.find((list) => list.key === "COLOUR|Any / not sure|Decorative Board|16mm");
  assert.ok(withoutFinish, "no colour list keyed without a finish");
  assert.ok(withoutFinish.values.includes("Classic White"));
  assert.ok(withoutFinish.values.includes("Notaio Walnut"), "a Ravine colour is still a 16mm colour");
});

test("a decorative board is still offered no door profile at all", async () => {
  // The one place an empty list is the honest answer rather than a dead end. A
  // routed profile is a vinyl skin pressed over a routed face and there is
  // nothing to press onto a board, so widening the list there would be offering
  // something we cannot make.
  const built = tree();
  assert.equal(built.lists.find((list) => list.key === "PROFILEGROUP|Decorative Board|18mm"), undefined);
  assert.equal(built.lists.find((list) => list.key === "PROFILEANY|Decorative Board|18mm"), undefined);
  assert.ok(built.lists.find((list) => list.key === "PROFILEANY|Thermolaminate|18mm"));
});

test("a size warns rather than refusing, so an odd measurement still gets written down", async () => {
  const workbook = await build();
  const sheet = workbook.getWorksheet("Fronts and panels");
  const at = headings(sheet);
  const height = sheet.getCell(`${at.get("Height mm")}8`).dataValidation;
  assert.equal(height.errorStyle, "warning");
  assert.equal(sheet.getCell(`${at.get("Height mm")}8`).numFmt, "0");
});

// ── The job defaults ────────────────────────────────────────────────────────

test("the colour set once on the first tab starts every row on every tab", async () => {
  // The biggest saving on site: most kitchens are one colour, and picking it
  // sixty times is sixty chances to pick a different one.
  const workbook = await build();
  const details = workbook.getWorksheet("Start here");
  const colourRow = detailRow(details, "Colour");
  assert.ok(colourRow, "the job default colour is missing");

  ["Kit fronts", "Fronts and panels"].forEach((name) => {
    const sheet = workbook.getWorksheet(name);
    const at = headings(sheet);
    const formula = sheet.getCell(`${at.get("Colour")}8`).formula;
    assert.ok(formula, `${name} does not read the job default`);
    assert.ok(formula.includes(`'Start here'!$C$${colourRow}`), formula);
    // Blank there is blank here. A job that set no default is not given an
    // answer nobody chose.
    assert.match(formula, /^IF\('Start here'!\$C\$\d+="","",/);
  });
});

test("a row that differs is typed over, and the row wins", async () => {
  // The default is a formula in an unlocked cell, which is the same trick the
  // standard size uses. Typing over it is expected rather than a mistake.
  const workbook = await build();
  const sheet = workbook.getWorksheet("Fronts and panels");
  const at = headings(sheet);
  assert.equal(sheet.getCell(`${at.get("Colour")}8`).protection?.locked, false);
  assert.equal(sheet.getCell(`${at.get("Material")}40`).protection?.locked, false);
});

test("a job default does not make every untouched row report itself incomplete", async () => {
  // The trap in filling a hundred rows in with a colour: judged on every
  // column, all four hundred rows of the workbook would have looked started.
  // The check counts only the columns a PERSON fills in.
  const workbook = await build();
  const sheet = workbook.getWorksheet("Fronts and panels");
  const at = headings(sheet);
  const check = sheet.getCell(`${at.get("Is this line complete?")}8`).formula;
  assert.match(check, /^IF\(\(\$[A-Z]+8<>""\)/);
  assert.ok(!check.includes(`$${at.get("Colour")}8<>""`), "the check counts a defaulted colour as an answer");
  assert.ok(check.includes(`$${at.get("Height mm")}8<>""`), "a typed height is what starts a row");
});

// ── Hinges ──────────────────────────────────────────────────────────────────

test("hinges per door fills itself in from the height, on the shared rule", async () => {
  // One rule in one place. The sheet writes it as a formula and everything on
  // our side reads hingesForHeight, so the form and the quote cannot disagree
  // about a door of the same height.
  const workbook = await build();
  const sheet = workbook.getWorksheet("Fronts and panels");
  const at = headings(sheet);
  const formula = sheet.getCell(`${at.get("Hinges per door")}8`).formula;

  HINGE_COUNT_BREAKS.forEach((step) => {
    assert.ok(formula.includes(`<=${step.upToMm},${step.hinges}`), `the ${step.upToMm} break is missing`);
  });
  assert.equal(hingesForHeight(720), 2);
  assert.equal(hingesForHeight(900), 2);
  assert.equal(hingesForHeight(901), 3);
  assert.equal(hingesForHeight(2300), 5);
  // No height, no answer. A blank column beats a guess about a door nobody has
  // measured.
  assert.equal(hingesForHeight(0), 0);
  assert.ok(formula.includes('<=0,""'), "a door with no height should stay blank");
});

test("a door is drilled unless somebody says otherwise, and nothing else is", async () => {
  const workbook = await build();
  const sheet = workbook.getWorksheet("Fronts and panels");
  const at = headings(sheet);
  const formula = sheet.getCell(`${at.get("Drill hinge holes")}8`).formula;
  assert.match(formula, /^IF\(\$[A-Z]+8="Door","Yes",""\)$/);
});

test("handing is two answers, because a pair is two lines", async () => {
  const workbook = await build();
  assert.deepEqual(namedValues(workbook, "hingesides"), ["Left", "Right"]);
});

// ── The details sheet ───────────────────────────────────────────────────────

test("the details sheet is set up to print on one A4 page", async () => {
  // It gets printed and stapled to the job, so coming out as one page and a
  // strip is the difference between useful and annoying.
  const workbook = await build();
  const setup = workbook.getWorksheet("Start here").pageSetup;
  assert.equal(setup.paperSize, 9, "9 is A4");
  assert.equal(setup.orientation, "portrait");
  assert.equal(setup.fitToWidth, 1);
  assert.equal(setup.fitToHeight, 1);
});

test("the details sheet asks everything the website asks, plus what an order needs", async () => {
  const workbook = await build();
  const labels = detailLabels(workbook.getWorksheet("Start here"));

  // Everything the website request form collects.
  ["First name", "Last name", "Email", "Phone", "Cabinet brand"].forEach((field) => {
    assert.ok(labels.includes(field), `the website asks for ${field} and this does not`);
  });
  assert.ok(labels.includes("Suburb"), "the website asks for a delivery suburb");

  // And what an ORDER needs that a website enquiry does not.
  ["Company", "Street address", "State", "Postcode", "Delivery or pickup"].forEach((field) => {
    assert.ok(labels.includes(field), `an order needs ${field}`);
  });

  // And what a MEASURE needs that neither of them does.
  ["Measured by", "Date measured", "Existing hinge brand", "Door overlay"].forEach((field) => {
    assert.ok(labels.includes(field), `a measure needs ${field}`);
  });
});

test("the cabinet brand on the details sheet is the website's own list", async () => {
  const workbook = await build();
  assert.deepEqual(namedValues(workbook, "cabinetbrands"), CABINET_BRANDS);
});

test("every answer box on the details sheet is the same width", async () => {
  // Boxes of three different widths stacked down a page look like a mistake
  // even when each one is deliberate. They all span the same four columns.
  const workbook = await build();
  const details = workbook.getWorksheet("Start here");
  const spans = [];
  for (let row = 5; row <= 90; row += 1) {
    if (details.getCell(`C${row}`).protection?.locked !== false) continue;
    let last = "C";
    ["D", "E", "F"].forEach((letter) => {
      if (details.getCell(`${letter}${row}`).protection?.locked === false) last = letter;
    });
    spans.push(`C:${last}`);
  }
  assert.ok(spans.length >= 20, "no answer boxes found");
  assert.equal(new Set(spans).size, 1, `boxes come in ${new Set(spans).size} widths`);
});

test("a hint sits under the box it is about, not beside it", async () => {
  // Parked in the column to the right it needed a column wide enough to hold
  // it, which on A4 there is not, so it wrapped and got cut off mid sentence.
  const workbook = await build();
  const details = workbook.getWorksheet("Start here");
  for (let row = 4; row <= 90; row += 1) {
    assert.ok(!details.getCell(`G${row}`).value, `something is still parked in G${row}`);
  }
  const emailRow = detailRow(details, "Email");
  assert.ok(emailRow, "the email question is missing");
  assert.match(String(details.getCell(`C${emailRow + 1}`).value), /where the quote goes/i);
});

test("the machinery behind the job defaults is out of the printed area and hidden", async () => {
  const workbook = await build();
  const details = workbook.getWorksheet("Start here");
  for (let column = 9; column <= 21; column += 1) {
    assert.equal(details.getColumn(columnLetter(column)).hidden, true, `${columnLetter(column)} is visible`);
  }
});

// ── The lists behind the dropdowns ──────────────────────────────────────────

test("every list on the hidden sheet is reachable by name", async () => {
  // A dropdown points at a defined name. A list published without one, or a
  // name pointing at the wrong column, is a dropdown that opens empty, and
  // nobody can tell that from "we do not stock any".
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

test("every fallback a column can widen to is a real defined name", async () => {
  // A fallback naming a list that was never published is a dropdown that opens
  // empty on exactly the row somebody was in a hurry on.
  const workbook = await build();
  const names = new Set(workbook.definedNames.model.map((entry) => entry.name));
  [
    "materials", "thicknesses", "finishes", "colours", "edges", "profilegroups", "profiles",
    "fronttypes", "paneluses", "rooms", "grains", "edgefinishes", "suppliedby",
    "cabinettypes", "hardwaretypes", "hardwareitems", "hingebrands", "overlays", "jobkinds",
  ].forEach((name) => assert.ok(names.has(name), `${name} is not defined`));
});

test("the rooms and panel uses come from the editable lists", async () => {
  // Both are plain vocabulary that nothing branches on, so they live in
  // Settings, Lists. A business doing more shopfitting than kitchens adds its
  // own without a deploy.
  const workbook = await build({ rooms: ["Shop floor", "Store room"], panelUses: ["Shroud"] });
  assert.deepEqual(namedValues(workbook, "rooms"), ["Shop floor", "Store room"]);
  assert.deepEqual(namedValues(workbook, "paneluses"), ["Shroud"]);
  // And fall back to the built-in words rather than shipping an empty dropdown.
  const plain = await build();
  assert.deepEqual(namedValues(plain, "rooms"), ROOM_AREAS);
});

test("the hardware kinds are the ones we hold stock in", async () => {
  // Offered from the catalogue rather than as a fixed list, so a kind we hold
  // nothing in is not a dropdown entry leading to an empty second dropdown.
  const workbook = await build();
  assert.deepEqual(namedValues(workbook, "hardwaretypes"), ["Hinge", "Drawer runner"]);
  const built = tree();
  assert.deepEqual(
    built.lists.find((list) => list.key === "HARDWARE|Hinge").values,
    ["Blum 110 Deg Inserta", "Blum 155 Deg"]
  );
});

test("the placeholder list says what to do rather than opening empty", async () => {
  const workbook = await build();
  assert.match(String(namedValues(workbook, "opt_none")[0]), /fill in the columns/i);
});

test("the filtered columns validate against their helper cell and nothing more", async () => {
  // The validation is kept trivial on purpose: all the work is in an ordinary
  // cell formula beside it. Excel is fussy about what it accepts inside a
  // validation, so anything more here is a dropdown that quietly stops working
  // in somebody else's copy of Excel.
  const workbook = await build();
  const sheet = workbook.getWorksheet("Fronts and panels");
  const at = headings(sheet);
  ["Material", "Thickness", "Finish", "Colour", "Edge profile", "Door profile group", "Door profile"].forEach(
    (head) => {
      const validation = sheet.getCell(`${at.get(head)}8`).dataValidation;
      assert.ok(validation, `${head} has no validation`);
      assert.equal(validation.type, "list");
      assert.match(validation.formulae[0], /^INDIRECT\(\$[A-Z]+8\)$/, `${head}: ${validation.formulae[0]}`);
    }
  );
});

test("a filtered dropdown falls back rather than showing an error", async () => {
  const workbook = await build();
  // IFERROR around every lookup. Without it a row with no type yet shows #N/A
  // in the helper cell and the dropdown beside it refuses to open at all.
  TABS.forEach((tab) => {
    const lookups = helperFormulas(workbook.getWorksheet(tab.sheet), 8).filter((formula) =>
      formula.includes("VLOOKUP")
    );
    assert.ok(lookups.length, `${tab.sheet} has no filtered columns`);
    lookups.forEach((formula) => {
      assert.ok(!/VLOOKUP/.test(formula.replace(/IFERROR\(VLOOKUP\([^)]*\)[^)]*\)/g, "")), formula);
      assert.match(formula, /IFERROR\(VLOOKUP\(/, formula);
      assert.ok(formula.includes('"opt_none"'), formula);
    });
  });
});

test("every item row is wired, not just the first", async () => {
  const workbook = await build();
  const last = 8 + ITEM_ROWS - 1;
  TABS.forEach((tab) => {
    const sheet = workbook.getWorksheet(tab.sheet);
    const at = headings(sheet);
    [8, 9, Math.floor((8 + last) / 2), last].forEach((row) => {
      assert.ok(
        sheet.getCell(`${at.get("Is this line complete?")}${row}`).formula,
        `${tab.sheet} row ${row} has no check`
      );
    });
    assert.equal(sheet.getCell(`A${last}`).value, ITEM_ROWS, tab.sheet);
  });
});

test("the helper columns are hidden and the lists sheet cannot be stumbled into", async () => {
  // Not for secrecy. The helpers are machinery, and somebody who deletes one
  // silently breaks the dropdown next to it with nothing to say why.
  const workbook = await build();
  TABS.forEach((tab) => {
    const sheet = workbook.getWorksheet(tab.sheet);
    for (let column = 1; column <= 45; column += 1) {
      const letter = columnLetter(column);
      if (!sheet.getCell(`${letter}8`).formula) continue;
      if (sheet.getCell(`${letter}7`).value) continue; // a real column, with a heading
      assert.equal(sheet.getColumn(letter).hidden, true, `${tab.sheet} ${letter} should be hidden`);
    }
  });
  assert.equal(workbook.getWorksheet("Lists").state, "veryHidden");
  assert.equal(workbook.getWorksheet("Colour list").state, "veryHidden");
});

test("the cells a person fills in are the only ones left unlocked", async () => {
  const workbook = await build();
  const sheet = workbook.getWorksheet("Fronts and panels");
  const at = headings(sheet);
  assert.equal(sheet.getCell(`${at.get("Type")}8`).protection?.locked, false, "type is theirs to fill in");
  assert.equal(sheet.getCell(`${at.get("Notes for this line")}8`).protection?.locked, false);
  // The line number and the check are ours, and a paste over either takes the
  // formula with it.
  assert.notEqual(sheet.getCell("A8").protection?.locked, false);
  assert.notEqual(sheet.getCell(`${at.get("Is this line complete?")}8`).protection?.locked, false);

  const details = workbook.getWorksheet("Start here");
  const answers = [];
  for (let row = 5; row <= 90; row += 1) {
    if (details.getCell(`C${row}`).protection?.locked === false) answers.push(row);
  }
  assert.ok(answers.length >= 20, "every question needs a box that can be typed in");
  assert.notEqual(details.getCell(`B${answers[0]}`).protection?.locked, false, "its label is not editable");
});

test("the logo is on every sheet a person looks at", async () => {
  // They are tabs of one document, and one of them turning up plain reads as a
  // different, less careful document.
  const workbook = await buildOrderFormWorkbook({
    colours: COLOURS,
    hardware: HARDWARE,
    generatedOn: "1 January 2026",
    logo: PNG_PIXEL,
  });
  assert.equal(workbook.getWorksheet("Start here").getImages().length, 1);
  TABS.forEach((tab) => {
    assert.equal(workbook.getWorksheet(tab.sheet).getImages().length, 1, `${tab.sheet} lost its branding`);
  });
});

// ── The standard size fills in the height and the width ─────────────────────

test("picking a standard size fills in the height and width columns", async () => {
  // There is one place a size lives on a row whichever kind of line it is, so
  // nobody reading the sheet back has to look in two columns to find it.
  const workbook = await build();
  const sheet = workbook.getWorksheet("Kit fronts");
  const at = headings(sheet);

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

test("height is asked for before width", async () => {
  // Every size in this business is written height first: on the site, on a
  // quote, on the workshop sheet. A form that put width first would be the one
  // place they were the other way round, and that costs a door.
  const workbook = await build();
  TABS.filter((tab) => tab.id !== "hardware").forEach((tab) => {
    const at = headings(workbook.getWorksheet(tab.sheet));
    assert.ok(at.has("Height mm") && at.has("Width mm"), tab.sheet);
    assert.ok(at.get("Height mm") < at.get("Width mm"), `${tab.sheet}: width comes first`);
  });
  const kit = headings(workbook.getWorksheet("Kit fronts"));
  assert.ok([...kit.keys()].some((head) => /height x width/i.test(head)));
});

test("the kit columns come in the order the answers arrive", async () => {
  // What it goes on, what kind of piece, which of their sizes, and only then
  // what it is made of. The size list cannot be offered before the type,
  // because a drawer front and a door are sold in different sizes.
  const workbook = await build();
  const at = headings(workbook.getWorksheet("Kit fronts"));
  const order = ["Cabinet range", "Front type", "Standard size", "Material"];
  const letters = order.map(
    (head) => at.get(head) || [...at.entries()].find(([key]) => key.startsWith(head))?.[1]
  );
  letters.forEach((letter, i) => {
    if (i === 0) return;
    assert.ok(letter > letters[i - 1], `${order[i]} should come after ${order[i - 1]}`);
  });
});

// ── The check column ────────────────────────────────────────────────────────

function gapsFormula(workbook, sheetName = "Fronts and panels") {
  const sheet = workbook.getWorksheet(sheetName);
  const found = helperFormulas(sheet, 8).find((formula) => formula.includes("a colour, "));
  if (!found) throw new Error(`the gaps helper is missing on ${sheetName}`);
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
    ["productType", "a type"],
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
  const formula = gapsFormula(await build(), "Kit fronts");
  assert.ok(formula.includes('"the height and width to match the standard size, or clear the standard size, "'));
});

test("a hardware line is judged on the two things it needs", async () => {
  // On its own tab there are no board columns to teach the check to ignore.
  const workbook = await build();
  const sheet = workbook.getWorksheet("Hardware");
  const formula = helperFormulas(sheet, 8).find((entry) => entry.includes("which hardware item, "));
  assert.ok(formula, "the hardware check is missing");
  assert.ok(formula.includes('"a hardware type, "'));
  assert.ok(!formula.includes('"a material, "'), "a handle has no board");
  assert.ok(lineIsReady({ productType: "Hardware", hardwareId: "blum-110" }));
  assert.ok(!lineIsReady({ productType: "Hardware" }));
});

test("a corner box is asked for its second width", async () => {
  // Without the return leg there is no cut list for half the cabinet.
  const workbook = await build();
  const carcassGaps = helperFormulas(workbook.getWorksheet("Carcasses"), 8).find((entry) =>
    entry.includes("the second width for a corner, ")
  );
  assert.ok(carcassGaps, "a corner with one width imports as half a cabinet");
  assert.ok(carcassGaps.includes('SEARCH("corner"'), "it should only ask a corner");
});

test("the drilling positions are two numbered columns, not a sentence in the notes", async () => {
  // "100 from each end" written in prose has to be read and retyped by a person,
  // and that is how a run of doors ends up drilled to two different patterns.
  const workbook = await build();
  const sheet = workbook.getWorksheet("Fronts and panels");
  const at = headings(sheet);

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
  assert.ok(formula.includes('"the bottom and top hinge as well, "'));
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
