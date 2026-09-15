// DRAWER RUNNERS AS A REAL BOUGHT ITEM.
//
// A runner used to be one of three generic words on the drawer line: "Standard
// ball-bearing", "Soft-close undermount", "Soft-close side-mount". They
// describe a runner without naming one, carry no price and produce no line, so
// a bank of four drawers reached a quote with its runners invisible and
// somebody either added them by hand or did not.
//
// A design can now name the actual runner out of the hardware library, and when
// it does it becomes a line of its own, priced from the library at import, the
// same way a hinge or a pull-out bin is.
//
// THE OLD FIELD STILL WORKS, and that is not optional: every drawer designed
// before this carries runner_type and nothing else, and those designs are on
// sent quotes and on jobs in the workshop.

import test from "node:test";
import assert from "node:assert/strict";

import { hasRunnerHardware, resolveRunnerHardware, runnerNoteLabel } from "../lib/pcd-drawer-utils.js";
import { hardwareMetaLabel, hardwareSizeLabel } from "../lib/pcd-hardware-types.js";
import { runnerLinesForCabinet } from "../lib/pcd-design-to-lines.js";
import { withLibraryHardwareRates } from "../lib/pcd-design-hardware-rates.js";

// The two runners actually in the library, with their real figures.
const LEGRABOX = {
  id: "48b14982-03c5-4b26-aa5d-f4dfcfa5dd7a",
  type: "drawer_runner",
  name: "LEGRABOX Drawer Kit C",
  brand: "Blum",
  length_mm: 400,
  height_mm: 177,
  unit_cost_ex_gst: 116.33,
  is_active: true,
};
const TANDEMBOX = {
  id: "ae12687e-000e-4af9-9916-bb4a250838a6",
  type: "drawer_runner",
  name: "TANDEMBOX antaro Drawer Runners 450NL 30kg Pair",
  brand: "Blum",
  length_mm: 450,
  unit_cost_ex_gst: 39,
  is_active: true,
};

const pick = (row) => ({ runner_hardware_id: row.id, runner_name: row.name });
const bank = (drawers, cfg) => ({
  id: "cab-1",
  front_type: "drawers",
  qty: 1,
  drawer_config: { heights_mm: Array(drawers).fill(180), ...cfg },
});

// ── WHAT THE PICKER SHOWS ───────────────────────────────────────────────────
//
// The length is what decides whether a runner fits the cabinet at all, and two
// runners named TANDEMBOX and LEGRABOX are indistinguishable without it.
test("each runner reads with its size, so the right one can be picked", () => {
  assert.equal(hardwareSizeLabel(TANDEMBOX), "450mm long");
  assert.equal(hardwareSizeLabel(LEGRABOX), "400mm long, 177mm high");
  assert.match(hardwareMetaLabel(LEGRABOX), /400mm long, 177mm high.*Blum.*\$116\.33/);
});

test("a row with no sizes says nothing rather than inventing zeroes", () => {
  assert.equal(hardwareSizeLabel({ name: "Something" }), "");
  assert.equal(hardwareSizeLabel({ length_mm: 0, height_mm: null }), "");
  // The brand and price still show; the name is never left bare with "0 x 0mm".
  assert.equal(hardwareMetaLabel({ brand: "Hafele", unit_cost_ex_gst: 12 }), "Hafele  ·  $12.00 ea ex GST");
});

// ── THE QUANTITY IS COUNTED, NOT TYPED ──────────────────────────────────────

test("one runner per drawer, times the number of cabinets", () => {
  assert.equal(runnerLinesForCabinet(bank(4, pick(LEGRABOX)), "Kitchen")[0].qty, 4);
  assert.equal(runnerLinesForCabinet({ ...bank(4, pick(LEGRABOX)), qty: 3 }, "Kitchen")[0].qty, 12);
});

test("a drawer added to the bank takes its runner with it", () => {
  const before = runnerLinesForCabinet(bank(3, pick(LEGRABOX)), "")[0].qty;
  const after = runnerLinesForCabinet(bank(4, pick(LEGRABOX)), "")[0].qty;
  assert.equal(after, before + 1, "the count follows the drawers rather than being stored beside them");
});

// A MIXED CABINET CAN CARRY MORE THAN ONE KIND. Deep pan drawers on heavy
// runners above a bank of shallow ones is a real cabinet.
test("a mixed cabinet counts only its drawer sections, per runner", () => {
  const item = {
    id: "cab-mixed",
    front_type: "mixed",
    qty: 1,
    section_config: {
      sections: [
        { type: "drawers", drawer: { heights_mm: [150, 150], ...pick(LEGRABOX) } },
        { type: "doors", door: { columns: 2, rows: 1 } },
        { type: "drawers", drawer: { heights_mm: [300], ...pick(TANDEMBOX) } },
      ],
    },
  };
  const lines = runnerLinesForCabinet(item, "Kitchen");
  assert.equal(lines.length, 2, "one line per runner, not one per section");
  assert.equal(lines.find((l) => l.unit_cost_source_id === LEGRABOX.id).qty, 2);
  assert.equal(lines.find((l) => l.unit_cost_source_id === TANDEMBOX.id).qty, 1);
});

test("two sections on the same runner are added up, not listed twice", () => {
  const item = {
    id: "cab-same",
    front_type: "mixed",
    qty: 1,
    section_config: {
      sections: [
        { type: "drawers", drawer: { heights_mm: [150, 150], ...pick(LEGRABOX) } },
        { type: "drawers", drawer: { heights_mm: [200], ...pick(LEGRABOX) } },
      ],
    },
  };
  const lines = runnerLinesForCabinet(item, "");
  assert.equal(lines.length, 1);
  assert.equal(lines[0].qty, 3);
});

// ── NOTHING NAMED MEANS NOTHING QUOTED ──────────────────────────────────────

test("a design from before this produces no runner line and keeps its spec", () => {
  const old = bank(2, { runner_type: "soft_close_undermount" });
  assert.deepEqual(runnerLinesForCabinet(old, "Kitchen"), [], "nothing is invented for it");
  assert.equal(hasRunnerHardware(old.drawer_config), false);
  assert.equal(runnerNoteLabel(old.drawer_config), "Soft-close undermount", "and the fit spec survives");
});

test("a named runner is what the drawer line says, over the generic spec", () => {
  const cfg = { ...pick(LEGRABOX), runner_type: "standard" };
  assert.equal(runnerNoteLabel(cfg), "LEGRABOX Drawer Kit C", "the product name is more specific than any of the three words");
  assert.equal(resolveRunnerHardware(cfg).id, LEGRABOX.id);
});

test("a door cabinet never gets runners", () => {
  assert.deepEqual(runnerLinesForCabinet({ id: "d", front_type: "doors", qty: 1, door_config: { columns: 2, rows: 1 } }, ""), []);
});

// ── THE PRICE COMES FROM THE LIBRARY, ON THE DAY IT IS IMPORTED ─────────────
//
// The line carries the library row it was picked from and no cost of its own,
// so a runner that went up last week is quoted at this week's price without
// anybody re-picking it on every design.
test("the runner is priced from the library at import, not frozen at design time", () => {
  const lines = runnerLinesForCabinet(bank(4, pick(LEGRABOX)), "Kitchen");
  assert.equal(lines[0].product_unit_cost_ex_gst, 0, "no price is set when the design is drawn");
  assert.equal(lines[0].unit_cost_source_id, LEGRABOX.id, "it carries which row to ask");

  const { lines: rated } = withLibraryHardwareRates(lines, [LEGRABOX]);
  assert.equal(rated[0].product_unit_cost_ex_gst, 116.33);

  // The same design, after the supplier put the price up.
  const { lines: later } = withLibraryHardwareRates(lines, [{ ...LEGRABOX, unit_cost_ex_gst: 129.0 }]);
  assert.equal(later[0].product_unit_cost_ex_gst, 129.0, "today's price, not the one it was drawn at");
});

test("the line is a Hardware line, tagged as a runner", () => {
  const line = runnerLinesForCabinet(bank(2, pick(TANDEMBOX)), "Kitchen")[0];
  assert.equal(line.product_type, "Hardware");
  assert.equal(line.hardware_type, "drawer_runner");
  assert.equal(line.product_name, TANDEMBOX.name);
  assert.match(line.description, /Kitchen/, "it says which cabinet it belongs to");
  assert.match(line.notes, /2 drawers/);
});
