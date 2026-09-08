// WHAT A QUOTE LINE SAYS TO THE CUSTOMER.
//
// THE BUG THESE PIN. The quote viewer stacked four things under every line: the
// product type, then the material, the finish and the colour, each falling back
// to "N/A". That reads correctly for a door and it reads as a fault for a piece
// of hardware, which has no board at all. The customer saw the word "Hardware"
// and three N/As, and never saw WHICH hinge they were being quoted for, even
// though the line had carried its name the whole time.
//
// Two halves to the fix and both are tested here: the KIND of hardware is now
// recorded on the line, because only the catalogue row knew it; and how a line
// is named and described is one shared answer rather than one per screen.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  isCabinetLine,
  isHardwareLine,
  lineHasBoard,
  lineDisplayName,
  lineHeading,
  lineSubLines,
} from "../lib/pcd-quote-line-display.js";
import { HARDWARE_TYPES, hardwareTypeLabel } from "../lib/pcd-hardware-types.js";
import { quoteLineRow } from "../app/api/admin/quotes/[id]/_quote-line-save.js";

const VIEWER = readFileSync(new URL("../app/(site)/quotes/QuoteApprovalClient.js", import.meta.url), "utf8");
const EDITOR = readFileSync(new URL("../app/admin/quotes/[id]/QuoteEditor.js", import.meta.url), "utf8");
const PDF = readFileSync(new URL("../lib/pcd-cabinet-pdf.js", import.meta.url), "utf8");

const HINGE = {
  product_type: "Hardware",
  product_name: "Blum 110 Deg Inserta",
  hardware_type: "hinge",
  qty: 20,
};

const DOOR = {
  product_type: "Door",
  product_name: "Door",
  material: "Thermolaminate",
  thickness: "18mm",
  finish: "Smooth",
  colour: "Alabaster",
  height_mm: 720,
  width_mm: 400,
};

const values = (line) => lineSubLines(line).map((sub) => sub.value);

// ── what a line is called ───────────────────────────────────────────────────

test("a hardware line is headed by what kind of hardware it is", () => {
  // "Hardware" on six rows in a row is indistinguishable at a glance, and the
  // kind is what somebody scanning a quote is actually looking for.
  assert.equal(lineHeading(HINGE), "Hinge");
  assert.equal(lineHeading({ ...HINGE, hardware_type: "drawer_runner" }), "Drawer runner");
});

test("a hardware line names the item, which is the thing that used to be missing", () => {
  assert.deepEqual(values(HINGE), ["Blum 110 Deg Inserta"]);
});

test("a hardware line saved before the kind was recorded still says Hardware", () => {
  // The honest answer. Guessing the kind out of the item name would read as
  // certainty about something nobody recorded.
  assert.equal(lineHeading({ ...HINGE, hardware_type: "" }), "Hardware");
  assert.equal(lineHeading({ ...HINGE, hardware_type: undefined }), "Hardware");
  // And the item name still comes through, which is most of the point.
  assert.deepEqual(values({ ...HINGE, hardware_type: "" }), ["Blum 110 Deg Inserta"]);
});

test("a kind we do not offer reads as Hardware rather than as a raw code", () => {
  assert.equal(lineHeading({ ...HINGE, hardware_type: "flux_capacitor" }), "Hardware");
});

test("who is supplying it is only said when it is not us", () => {
  // "We supply" is the assumption on every other line, so saying it adds
  // nothing. The customer buying it themselves is the case that changes what
  // they are paying for.
  assert.deepEqual(values({ ...HINGE, supplied_by: "We supply" }), ["Blum 110 Deg Inserta"]);
  assert.deepEqual(values({ ...HINGE, supplied_by: "Customer supplies" }), [
    "Blum 110 Deg Inserta",
    "Customer supplies",
  ]);
});

test("a board line is described exactly as it always was", () => {
  // The fix must not quietly change what a door row says.
  assert.equal(lineHeading(DOOR), "Door");
  assert.deepEqual(values(DOOR), ["Thermolaminate", "Smooth", "Alabaster"]);
  assert.deepEqual(
    lineSubLines(DOOR).map((sub) => sub.key),
    ["material", "finish", "colour"]
  );
});

test("a cabinet line is still called a Base Cabinet, not base_cabinet", () => {
  assert.equal(lineHeading({ product_type: "base_cabinet" }), "Base Cabinet");
  assert.ok(isCabinetLine({ product_type: "base_cabinet" }));
});

test("a line with nothing on it says something rather than nothing", () => {
  assert.equal(lineHeading({}), "Quote item");
  assert.equal(lineHeading({ product_name: "Something odd" }), "Something odd");
});

test("what is hardware is decided by the shared product rules", () => {
  // Not by a comparison against the word "Hardware" written out again here.
  assert.ok(isHardwareLine(HINGE));
  assert.ok(!isHardwareLine(DOOR));
  assert.ok(!lineHasBoard(HINGE));
  assert.ok(lineHasBoard(DOOR));
});

// ── the kind is recorded on the line ────────────────────────────────────────

test("the kind is saved on a hardware line", () => {
  const row = quoteLineRow(HINGE, "quote-1", 0);
  assert.equal(row.hardware_type, "hinge");
  assert.equal(row.product_name, "Blum 110 Deg Inserta");
});

test("a kind the catalogue does not offer is dropped rather than stored", () => {
  // A word no screen can show is worse than a blank, because the blank at least
  // reads as "nobody said".
  assert.equal(quoteLineRow({ ...HINGE, hardware_type: "flux_capacitor" }, "quote-1", 0).hardware_type, null);
});

test("a door carries no hardware kind at all", () => {
  // Switching a hardware line to a door and back again used to be how a stale
  // answer came with it.
  assert.equal(quoteLineRow({ ...DOOR, hardware_type: "hinge" }, "quote-1", 0).hardware_type, null);
});

test("a database without the column still saves the line", () => {
  // The same tolerance every column a later migration added gets. Losing a
  // whole line over a field added last week would be the wrong trade.
  const save = readFileSync(
    new URL("../app/api/admin/quotes/[id]/_quote-line-save.js", import.meta.url),
    "utf8"
  );
  const late = save.slice(save.indexOf("const LATE_COLUMNS"), save.indexOf("export function isMissingSupplierNameSchemaError"));
  assert.match(late, /"hardware_type"/);
});

test("the editor records the kind when the item is picked, and clears it when it is not hardware", () => {
  assert.match(EDITOR, /next\.hardware_type = item\.type \|\| "";/, "picking an item must record its kind");
  assert.match(EDITOR, /if \(patch\.product_type !== "Hardware"\) \{\s*\r?\n\s*next\.hardware_type = "";/);
});

test("the migration adds the column and says why", () => {
  const sql = readFileSync(new URL("../supabase/202609031700_pcd_order_form_fields.sql", import.meta.url), "utf8");
  assert.match(sql, /add column if not exists hardware_type/);
  assert.match(sql, /comment on column public\.pcd_quote_line_items\.hardware_type/);
});

test("every kind we offer reads as words", () => {
  // A label falling through to the bare stored value is how "drawer_runner"
  // reaches a customer.
  HARDWARE_TYPES.forEach((type) => {
    assert.equal(lineHeading({ product_type: "Hardware", hardware_type: type.value }), type.label);
    assert.ok(!/_/.test(hardwareTypeLabel(type.value)), type.value);
  });
});

// ── and the viewer actually uses it ─────────────────────────────────────────

test("the viewer reads the shared describer rather than keeping its own", () => {
  assert.ok(VIEWER.includes("from \"../../../lib/pcd-quote-line-display\""));
  assert.ok(VIEWER.includes("lineDisplayName(line)"), "what the line is called");
  assert.ok(VIEWER.includes("lineSubLines(line)"), "and what goes under it");
  // The old local copy is gone, so there is nothing left to drift.
  assert.ok(!VIEWER.includes("function productDisplayName"), "the viewer still has its own naming");
});

test("the PDF and the online copy call a line the same thing", () => {
  // They used to disagree twice over. The PDF led with the item and the page
  // led with the kind, and the page never named a hardware item at all: a hinge
  // read as the bare word "Hardware" while the PDF printed which hinge it was.
  //
  // Asserted on the ANSWER rather than on the two files, because two documents
  // both importing the right function and then using it differently is exactly
  // how they came apart in the first place.
  const board = { product_type: "Door", material: "Decorative Board", finish: "Matt", colour: "Classic White" };
  const hinge = { product_type: "Hardware", product_name: "Blum 110 Deg Inserta" };

  // The bold line is WHAT KIND OF THING IT IS, on every row without exception,
  // so a hardware row reads the same shape as the door row above it.
  assert.equal(lineDisplayName(board), "Door");
  assert.equal(lineDisplayName(hinge), "Hardware", "the kind, with which one underneath");
  assert.equal(lineDisplayName({ product_type: "Hardware", hardware_type: "hinge" }), "Hinge");

  // And which one it is goes under it, as a name on its own rather than
  // labelled: nobody writes "Item: Blum 110 Deg Inserta" on a quote.
  const under = lineSubLines(hinge);
  assert.equal(under[0].key, "item");
  assert.equal(under[0].value, "Blum 110 Deg Inserta");

  // And what a board line is made from is never on the row: it is on the group.
  assert.deepEqual(lineSubLines(board).map((part) => part.key), ["material", "finish", "colour"]);
  assert.ok(VIEWER.includes("isHardwareLine(line)"), "so the viewer only prints them on hardware");
});
test("a hardware row is not asked about a board it has not got", () => {
  // Four columns used to print N/A on a hardware row, which made a complete
  // line read as an unfinished one.
  //
  // WRITTEN AGAINST THE GROUPING, not against the row. This used to look for a
  // guard beside each field, and the viewer has since been rebuilt so the board
  // columns are decided once for the whole group and a hardware group is given
  // none. Same rule, one decision instead of four, and the test that went on
  // looking for the old shape was reporting a bug that had already been fixed.
  assert.ok(VIEWER.includes("cols: hardware ? [] : CONFIG_COLUMNS.filter"), "the group decides the columns");
  assert.ok(VIEWER.includes("colourSrc: hardware ? \"\" :"), "and no swatch either");
});

test("the two views read the same columns, so neither can grow one of its own", () => {
  // The same page disagreeing with itself is how somebody on a phone rings up
  // about a quote that reads differently from the one on their laptop.
  assert.ok(VIEWER.split("group.cols").length - 1 >= 3, "the table and the card both render group.cols");
});

test("a hardware line is named, in both views and on the PDF", () => {
  // A hardware line was reading as the bare word "Hardware": lineHeading names
  // the KIND, and these lines carry no kind. Which hinge it was sat in
  // product_name, printed on the PDF and shown nowhere on the page the customer
  // actually opens.
  assert.ok(VIEWER.includes("function ItemName(" + "{" + " line " + "}" + ")"), "the viewer names the item");
  assert.ok(VIEWER.includes("lineSubLines(line)"), "read from the shared describer");

  // Used by the table AND by the phone card, not one of them.
  const tag = "<ItemName line=" + "{" + "line" + "}" + " />";
  assert.equal(VIEWER.split(tag).length - 1, 2, "the table and the phone card");

  // And the PDF reads the same describer, so the two documents cannot drift.
  assert.ok(PDF.includes("lineSubLines(line)"), "the PDF names it the same way");

  // Nothing is added to a board line: its board is said once at the top of its
  // group, and repeating it on every row is what the grouping was built to stop.
  assert.ok(VIEWER.includes("isHardwareLine(line)"), "only a hardware line gets the detail");
});
