// THE ADMIN APPROVAL OF A VARIATION, AND THE THINGS IT MUST NEVER DO.
//
// An admin approving a variation for the customer skips the one mechanism by
// which an order is allowed to change: the customer reading what is being done
// and saying yes. That is safe for exactly one kind of change, a size, at the
// price the order already holds, and unsafe for every other kind.
//
// So the rule is not a preference. Every case below is a way the order's money,
// its invoice or its contents could have moved without anybody agreeing to it,
// and each one has to keep being refused.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
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
};

const check = (line) => overrideApprovalEligibility([line], [orderLine]);

test("a size change on an existing line is the one thing this allows", () => {
  const result = check(sizeOnly);
  assert.equal(result.ok, true, "it qualifies");
  assert.deepEqual(result.reasons, []);
  assert.equal(result.changes.length, 1);
  assert.equal(result.changes[0].from, "720 x 397mm", "height before width, as everywhere else");
  assert.equal(result.changes[0].to, "715 x 397mm");
  assert.equal(result.changes[0].held_line_total_ex_gst, 1240, "the price it keeps is shown");
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

test("every spec field is refused, one at a time", () => {
  // A door's size is a measurement; its colour is a decision, and a decision is
  // the customer's. Each of these would reach the workshop as a different
  // product than the one that was agreed to.
  const cases = [
    ["colour", "Alabaster", /changes the colour/],
    ["material", "Thermolaminate", /changes the material/],
    ["thickness", "16mm", /changes the thickness/],
    ["profile", "Bevel", /changes the profile\./],
    ["profile_type", "Slab", /changes the profile type/],
    ["edge_mould", "Bullnose", /changes the edge/],
    ["finish", "Gloss", /changes the finish/],
    ["supplier_name", "Laminex", /changes the supplier/],
    ["product_type", "drawer_front", /changes the item type/],
  ];
  for (const [field, value, expected] of cases) {
    const result = check({ ...sizeOnly, [field]: value });
    assert.equal(result.ok, false, `${field} must be refused`);
    assert.match(result.reasons.join(" "), expected, `${field} must say so`);
  }
});

test("hinge boring is refused: a door drilled wrong is scrap", () => {
  assert.equal(check({ ...sizeOnly, hinge_holes: true }).ok, false);
  assert.equal(check({ ...sizeOnly, hinge_side: "Left" }).ok, false);
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

test("a variation that changes no size at all is refused", () => {
  // Nothing to approve, and approving it would put an admin's name against a
  // change nobody made.
  const result = check({ ...sizeOnly, height_mm: 720, width_mm: 397 });
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(" "), /changes nothing about the size/);
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

test("a held change writes the size and leaves the costing columns alone", () => {
  assert.match(VARIATIONS, /if \(holdPricing\) \{\s*\n\s*const heldPatch = \{/);
  const held = VARIATIONS.slice(VARIATIONS.indexOf("const heldPatch = {"));
  const patch = held.slice(0, held.indexOf("};"));
  assert.ok(patch.includes("height_mm"), "the new size lands");
  assert.ok(patch.includes("width_mm"), "both of it");
  assert.ok(!patch.includes("line_total_ex_gst"), "the price is not touched");
  assert.ok(!patch.includes("markup_percent"), "nor the markup");
  assert.ok(!patch.includes("colour"), "nor the spec, which is already known to match");
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
