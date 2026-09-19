// THE ADMIN APPROVAL OF A VARIATION, AND THE THINGS IT MUST NEVER DO.
//
// An admin approving a variation for the customer skips the one mechanism by
// which an order is allowed to change: the customer reading what is being done
// and saying yes.
//
// That is safe for three things and three only, because none of them moves the
// price: a size, a colour on the same board, and where the top and bottom
// hinges sit. Everything else is unsafe, and the price is held either way.
//
// So the rule is not a preference. Every case below is a way the order's money,
// its invoice or its contents could have moved without anybody agreeing to it,
// and each one has to keep being refused.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CHANGEABLE_COLUMNS,
  lineEdits,
  lineOverrideProblems,
  overrideApprovalEligibility,
  sizeWords,
} from "../lib/pcd-variation-override.js";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const ROUTE = read("app/api/admin/orders/[id]/variations/[variationId]/approve-override/route.js");
const VARIATIONS = read("lib/pcd-order-variations.js");
const EDITOR = read("app/admin/orders/[id]/variations/[variationId]/VariationEditor.js");
const WEEKLY = read("lib/pcd-weekly-updates.js");
const WORDING = read("lib/pcd-update-wording.js");

const orderLine = {
  id: "line-1",
  title: "Shaker door",
  product_type: "door",
  material: "Decorative Board",
  supplier_name: "Polytec",
  thickness: "18mm",
  finish: "Matt",
  colour: "Classic White",
  profile_type: "Shaker",
  profile: "Nordic",
  edge_mould: "Square",
  height_mm: 720,
  width_mm: 397,
  qty: 12,
  line_total_ex_gst: 1240,
  banded_edges: ["top", "bottom"],
  hinge_qty: "2",
  hinge_side: "Left",
  hinge_from_bottom_mm: 100,
  hinge_from_top_mm: 100,
};

const sizeOnly = {
  id: "var-1",
  action: "change",
  order_line_item_id: "line-1",
  title: "Shaker door",
  product_type: "door",
  material: "Decorative Board",
  supplier_name: "Polytec",
  thickness: "18mm",
  finish: "Matt",
  colour: "Classic White",
  profile_type: "Shaker",
  profile: "Nordic",
  edge_mould: "Square",
  height_mm: 715,
  width_mm: 397,
  qty: 12,
  hinge_qty: "2",
  hinge_side: "Left",
  hinge_from_bottom_mm: 100,
  hinge_from_top_mm: 100,
};

const check = (line) => overrideApprovalEligibility([line], [orderLine]);

test("a size change on an existing line qualifies", () => {
  const result = check(sizeOnly);
  assert.equal(result.ok, true, "it qualifies");
  assert.deepEqual(result.reasons, []);
  assert.equal(result.changes.length, 1);
  assert.deepEqual(result.changes[0].edits, [
    { what: "Size", from: "720 x 397mm", to: "715 x 397mm" },
  ], "height before width, as everywhere else");
  assert.equal(result.changes[0].held_line_total_ex_gst, 1240, "the price it keeps is shown");
});

test("a colour change qualifies, because the board is priced by its finish", () => {
  // The shade is not part of the price. Finish, material, thickness and brand
  // all stay locked below, and with those fixed Classic White and Alabaster are
  // the same money, so holding the price costs nothing at all.
  const result = check({ ...sizeOnly, height_mm: 720, width_mm: 397, colour: "Alabaster" });
  assert.equal(result.ok, true);
  assert.deepEqual(result.changes[0].edits, [
    { what: "Colour", from: "Classic White", to: "Alabaster" },
  ]);
});

test("the hinge positions qualify, because drilling is charged per hole", () => {
  // The number of holes is locked, so moving one up or down is free.
  const bottom = check({ ...sizeOnly, height_mm: 720, width_mm: 397, hinge_from_bottom_mm: 90 });
  assert.equal(bottom.ok, true);
  assert.deepEqual(bottom.changes[0].edits, [{ what: "Bottom hinge", from: "100mm", to: "90mm" }]);

  const top = check({ ...sizeOnly, height_mm: 720, width_mm: 397, hinge_from_top_mm: 85 });
  assert.equal(top.ok, true);
  assert.deepEqual(top.changes[0].edits, [{ what: "Top hinge", from: "100mm", to: "85mm" }]);
});

test("several allowed changes on one line are each named", () => {
  // So nobody confirms a colour swap thinking they approved a size.
  const result = check({ ...sizeOnly, colour: "Alabaster", hinge_from_top_mm: 85 });
  assert.equal(result.ok, true);
  assert.deepEqual(result.changes[0].edits.map((e) => e.what), ["Size", "Colour", "Top hinge"]);
});

test("a blank hinge position reads as our standard, not as nothing", () => {
  const edits = lineEdits({ hinge_from_bottom_mm: 90 }, { hinge_from_bottom_mm: null });
  assert.deepEqual(edits, [{ what: "Bottom hinge", from: "our standard", to: "90mm" }]);
});

test("adding a panel is refused: it is new work at a new price", () => {
  const result = overrideApprovalEligibility(
    [{ id: "v", action: "add", title: "End panel", height_mm: 800, width_mm: 600 }],
    [orderLine]
  );
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(" "), /adds a new item/);
});

test("removing a panel is refused: something they ordered would not be made", () => {
  const result = check({ ...sizeOnly, action: "remove" });
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(" "), /removes an item/);
});

test("changing the quantity is refused: it is the price again", () => {
  const result = check({ ...sizeOnly, qty: 14 });
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(" "), /changes the quantity/);
});

test("a price adjustment line is refused, and so is a job cost", () => {
  assert.match(
    overrideApprovalEligibility([{ id: "v", action: "price_adjustment", title: "Goodwill" }], [orderLine]).reasons.join(" "),
    /is a price adjustment/
  );
  assert.match(
    overrideApprovalEligibility([{ id: "v", action: "job_cost", title: "Install" }], [orderLine]).reasons.join(" "),
    /changes a job cost/
  );
});

test("the four that set the price are refused, one at a time", () => {
  // THE FINISH, MATERIAL, THICKNESS AND BRAND ARE WHAT MAKE A COLOUR FREE.
  // A board is priced by those four. Unlock any of them and the override starts
  // giving away money it cannot see, because the price is held either way.
  const cases = [
    ["material", "Thermolaminate", /changes the material/],
    ["thickness", "16mm", /changes the thickness/],
    ["finish", "Gloss", /changes the finish/],
    ["supplier_name", "Laminex", /changes the supplier/],
  ];
  for (const [field, value, expected] of cases) {
    const result = check({ ...sizeOnly, [field]: value });
    assert.equal(result.ok, false, `${field} must be refused`);
    assert.match(result.reasons.join(" "), expected, `${field} must say so`);
  }
});

test("everything else about the product is still refused", () => {
  const cases = [
    ["profile", "Bevel", /changes the profile\./],
    ["profile_type", "Slab", /changes the profile type/],
    ["edge_mould", "Bullnose", /changes the edge/],
    ["product_type", "drawer_front", /changes the item type/],
  ];
  for (const [field, value, expected] of cases) {
    const result = check({ ...sizeOnly, [field]: value });
    assert.equal(result.ok, false, `${field} must be refused`);
    assert.match(result.reasons.join(" "), expected);
  }
});

test("the hinge COUNT and the side are still refused, only the positions moved", () => {
  // A door drilled wrong is scrap, and the count is what the drilling is
  // charged on. The side decides which way it swings, which a customer notices.
  assert.equal(check({ ...sizeOnly, hinge_holes: true }).ok, false);
  assert.equal(check({ ...sizeOnly, hinge_side: "Right" }).ok, false);
  assert.equal(check({ ...sizeOnly, hinge_qty: "3" }).ok, false);
});

test("banded edges are refused when the variation actually names a different set", () => {
  assert.equal(check({ ...sizeOnly, banded_edges: ["top"] }).ok, false, "a different set is a change");
  assert.equal(
    check({ ...sizeOnly, banded_edges: ["bottom", "top"] }).ok,
    true,
    "the same set in another order is not"
  );
  assert.equal(check(sizeOnly).ok, true, "and a line that never mentions them has not changed them");
});

test("a variation that changes nothing we can approve is refused", () => {
  // Approving it would put an admin's name against a change nobody made.
  const result = check({ ...sizeOnly, height_mm: 720, width_mm: 397 });
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(" "), /changes nothing we can approve here/);
});

test("a line pointing at nothing on the order is refused", () => {
  assert.match(check({ ...sizeOnly, order_line_item_id: "gone" }).reasons.join(" "), /no longer on the order/);
  assert.match(check({ ...sizeOnly, order_line_item_id: null }).reasons.join(" "), /not attached to a line/);
});

test("an empty variation is refused rather than approved as a no-op", () => {
  assert.equal(overrideApprovalEligibility([], [orderLine]).ok, false);
});

test("one bad line among good ones fails the whole variation", () => {
  // Partial approval would put half a customer's agreed change onto the order
  // and leave the rest waiting, which nothing downstream can describe.
  const result = overrideApprovalEligibility(
    [sizeOnly, { id: "v2", action: "add", title: "End panel" }],
    [orderLine]
  );
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(" "), /adds a new item/);
});

test("a blank and a null are the same answer, not a change", () => {
  // A variation line carries undefined where an order line carries "". If those
  // counted as different, no override would ever qualify.
  assert.deepEqual(lineOverrideProblems({ ...sizeOnly, finish: undefined }, { ...orderLine, finish: "" }), []);
});

test("a size reads height first", () => {
  assert.equal(sizeWords(720, 397), "720 x 397mm");
  assert.equal(sizeWords(null, null), "no size");
});

// ── The route ───────────────────────────────────────────────────────────────

test("the route asks for who, how and why, and refuses without each", () => {
  assert.match(ROUTE, /approved_by/, "who");
  assert.match(ROUTE, /ACCEPTANCE_CHANNEL_KEYS\.includes/, "how, off the same list a quote uses");
  assert.match(ROUTE, /payload\.reason/, "why");
  assert.equal((ROUTE.match(/status: 400/g) || []).length, 3, "each of the three refuses on its own");
});

test("the route checks the rule itself rather than trusting the screen", () => {
  assert.match(ROUTE, /overrideApprovalEligibility\(lines, orderLines\)/, "against rows it read");
  assert.match(ROUTE, /status: 422/, "and refuses with the reasons");
});

test("the route claims the status it read, so a customer approving at once cannot be overwritten", () => {
  assert.match(ROUTE, /\.eq\("status", variation\.status\)/);
  assert.match(ROUTE, /status: 409/);
});

test("the route applies with the price held", () => {
  assert.match(ROUTE, /holdPricing: true/);
});

test("nothing is emailed, because they never pressed approve", () => {
  assert.ok(!/sendVariationApprovedToCustomer/.test(ROUTE), "no customer confirmation is sent");
});

test("a failed apply is recorded rather than thrown away", () => {
  assert.match(ROUTE, /apply_error:/);
  assert.match(ROUTE, /variation_apply_failed/);
  assert.match(ROUTE, /Do not cut to these sizes yet/);
});

// ── Holding the price ───────────────────────────────────────────────────────

test("a held apply does not write the order's totals at all", () => {
  // Not "the same numbers written again": nothing written, so no rounding pass
  // and no missing column can move a total that was supposed to stand still.
  assert.match(VARIATIONS, /let \{ error: orderError \} = holdPricing\s*\n\s*\? \{ error: null \}/);
});

test("a held change writes every column the gate lets through, and no others", () => {
  // THE GATE AND THE WRITE READ THE SAME LIST. A field allowed through the gate
  // and not written here is a change that never reaches the workshop, which is
  // how a door gets cut in last month's colour with every screen looking right.
  assert.match(VARIATIONS, /for \(const column of CHANGEABLE_COLUMNS\) \{/);
  assert.ok(
    VARIATIONS.includes('import { CHANGEABLE_COLUMNS } from "./pcd-variation-override"'),
    "read from the gate, not copied"
  );
  assert.deepEqual(
    [...CHANGEABLE_COLUMNS].sort(),
    ["colour", "height_mm", "hinge_from_bottom_mm", "hinge_from_top_mm", "width_mm"],
    "and the list itself is the five that cost nothing to move"
  );
});

test("a held change still leaves every costing column alone", () => {
  const held = VARIATIONS.slice(VARIATIONS.indexOf("const heldPatch = {"));
  const patch = held.slice(0, held.indexOf("const { error: heldError }"));
  assert.ok(!patch.includes("line_total_ex_gst"), "the price is not touched");
  assert.ok(!patch.includes("markup_percent"), "nor the markup");
  assert.ok(!patch.includes("unit_cost_per_sqm_ex_gst"), "nor the board rate");
});

test("a colour change drops the cost source rather than leaving it pointing at the old shade", () => {
  // An id that contradicts the words beside it is the exact fault that put a
  // wardrobe on a quote at the wrong rate. See matchBoardCost.
  assert.match(VARIATIONS, /THE COST SOURCE CANNOT SURVIVE A COLOUR CHANGE/);
  assert.match(VARIATIONS, /heldPatch\.unit_cost_source_id = null/);
});

test("the history says it was not charged, with the figure it was not charged at", () => {
  assert.match(VARIATIONS, /Variation applied to order at no charge/);
  assert.match(VARIATIONS, /not charged/);
  assert.match(VARIATIONS, /pricing_held: holdPricing/);
});

// ── What the customer is told ───────────────────────────────────────────────

test("a no-charge variation never reaches a customer as an amount owing", () => {
  // The activity row names the figure so WE can see what was given away. Read
  // as an amount it would go out in an email telling the customer their order
  // went up by a sum nobody is charging them.
  assert.match(WEEKLY, /const held = Boolean\(row\.metadata\?\.pricing_held\)/);
  assert.match(WEEKLY, /amount: held \? 0 : money\(desc\)/);
  assert.match(WORDING, /at no extra cost/);
});

// ── The screen ──────────────────────────────────────────────────────────────

test("the screen decides what to offer with the same function the route allows with", () => {
  assert.match(EDITOR, /overrideApprovalEligibility\(lines, orderItems\)/);
});

test("the button sits beside Send variation and is offered until the customer answers", () => {
  const send = EDITOR.indexOf("Send variation</button>");
  const approve = EDITOR.indexOf("Approve for the customer");
  assert.ok(send > 0 && approve > send, "it is to the right of the send button");
  assert.match(EDITOR, /const canApproveForCustomer = !\["approved", "approved_pending_payment", "applied", "rejected", "cancelled"\]/);
});

test("approving reloads both sides, because applying rewrote the order's lines", () => {
  assert.match(EDITOR, /onApproved=\{async \(payload\) => \{[\s\S]*?await loadAll\(\);/);
});
