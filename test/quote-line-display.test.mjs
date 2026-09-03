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
  lineHeading,
  lineSubLines,
} from "../lib/pcd-quote-line-display.js";
import { HARDWARE_TYPES, hardwareTypeLabel } from "../lib/pcd-hardware-types.js";
import { quoteLineRow } from "../app/api/admin/quotes/[id]/_quote-line-save.js";

const VIEWER = readFileSync(new URL("../app/(site)/quotes/QuoteApprovalClient.js", import.meta.url), "utf8");
const EDITOR = readFileSync(new URL("../app/admin/quotes/[id]/QuoteEditor.js", import.meta.url), "utf8");

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
  assert.match(VIEWER, /from "\.\.\/\.\.\/\.\.\/lib\/pcd-quote-line-display"/);
  assert.match(VIEWER, /lineHeading\(line\)/);
  assert.match(VIEWER, /lineSubLines\(line\)/);
  // The old local copy is gone, so there is nothing left to drift.
  assert.ok(!/function productDisplayName/.test(VIEWER), "the viewer still has its own naming");
});

test("a hardware row is not asked about a board it has not got", () => {
  // Four columns used to print N/A on a hardware row, which made a complete
  // line read as an unfinished one.
  const desktop = VIEWER.slice(VIEWER.indexOf("const isHardware = isHardwareLine(line)"), VIEWER.indexOf("</tbody>"));
  ["quoteLineSizeText(line)", "line.edge_mould", "line.profile_type", "line.hinge_holes"].forEach((field) => {
    const at = desktop.indexOf(field);
    assert.ok(at > 0, `${field} is not on the row any more`);
    assert.ok(
      desktop.lastIndexOf("isHardware", at) > desktop.lastIndexOf("<td>", at) - 200,
      `${field} is still printed on a hardware row`
    );
  });
});

test("the mobile card leaves the board sections off a hardware line too", () => {
  // Same page, same rule. The two views disagreeing about what a line says is
  // how somebody on a phone rings up about a quote that reads differently.
  const mobile = VIEWER.slice(VIEWER.indexOf("quoteItemMobileSpecs"));
  assert.match(mobile, /isHardware \?/);
  assert.ok(mobile.includes("lineSubLines(line)"), "the card never names the item");
});
