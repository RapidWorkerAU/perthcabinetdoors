// EVERY VERSION OF AN ORDER, RECONSTRUCTED.
//
// The per-line before-state has always been stored. What did not exist was a way
// to see the WHOLE order at each version, so five variations meant five sets of
// disconnected snapshots and "what was agreed in March" was a hand exercise.
//
// This walks backwards from the order as it is now, undoing one variation at a
// time. The test that matters is the last one: five variations, and every
// version still correct.

import test from "node:test";
import assert from "node:assert/strict";

import {
  appliedVariations,
  describeVariation,
  historyGaps,
  orderVersions,
  rewindVariation,
} from "../lib/pcd-order-history.js";

function line(id, overrides = {}) {
  return {
    id,
    title: `Door ${id}`,
    product_type: "Door",
    material: "Decorative Board",
    thickness: "18mm",
    colour: "Amaro",
    finish: "Woodmatt",
    height_mm: 720,
    width_mm: 397,
    qty: 1,
    line_total_ex_gst: 100,
    variation_id: null,
    variation_status: null,
    ...overrides,
  };
}

function snapshotOf(source) {
  const { id, title, product_type, material, supplier_name, thickness, width_mm, height_mm, finish, colour, profile_type, profile, edge_mould, qty, line_total_ex_gst } = source;
  return { id, title, product_type, material, supplier_name: supplier_name ?? null, thickness, width_mm, height_mm, finish, colour, profile_type: profile_type ?? null, profile: profile ?? null, edge_mould: edge_mould ?? null, qty, line_total_ex_gst };
}

// ── one step back ──────────────────────────────────────────────────────────

test("a changed line is put back to what it was", () => {
  const was = line("a");
  const now = line("a", { colour: "Greige", variation_id: "v1", variation_status: "changed" });
  const rewound = rewindVariation([now], [
    { id: "vl1", action: "change", order_line_item_id: "a", original_item_snapshot: snapshotOf(was), colour: "Greige" },
  ]);
  assert.equal(rewound.length, 1);
  assert.equal(rewound[0].colour, "Amaro", "the before-state is what the version has to show");
  assert.equal(rewound[0].id, "a", "the order line keeps its identity");
  assert.equal(rewound[0].variation_status, null, "before the variation it carried no variation mark");
});

test("a line the variation added is not there beforehand", () => {
  const added = line("b", { variation_id: "v1", variation_status: "added" });
  const rewound = rewindVariation([line("a"), added], [{ id: "vl1", action: "add", order_line_item_id: null }], "v1");
  assert.deepEqual(rewound.map((l) => l.id), ["a"], "an added line did not exist before the variation that added it");
});

// An order carries lines added by several different variations. Rewinding one
// must not delete another's work, which an earlier version of this did.
test("rewinding one variation leaves lines another variation added alone", () => {
  const fromV1 = line("b", { variation_id: "v1", variation_status: "added" });
  const fromV2 = line("c", { variation_id: "v2", variation_status: "added" });
  const rewound = rewindVariation([line("a"), fromV1, fromV2], [{ id: "vl1", action: "add" }], "v2");
  assert.deepEqual(rewound.map((l) => l.id), ["a", "b"], "b was added by v1 and still existed before v2");
});

test("a line the variation removed is still there beforehand", () => {
  const was = line("a");
  const removed = line("a", { variation_status: "removed", line_total_ex_gst: 0 });
  const rewound = rewindVariation([removed], [
    { id: "vl1", action: "remove", order_line_item_id: "a", original_item_snapshot: snapshotOf(was) },
  ]);
  assert.equal(rewound[0].variation_status, null, "it had not been removed yet");
  assert.equal(rewound[0].line_total_ex_gst, 100, "and it still carried its money");
});

// A change with no recorded before-state has to be shown as unknown rather than
// as the current state. Presenting today's value as history is how a wrong
// history becomes a confident one.
test("a change with no before-state is marked unknown, not guessed", () => {
  const rewound = rewindVariation([line("a", { colour: "Greige" })], [
    { id: "vl1", action: "change", order_line_item_id: "a", original_item_snapshot: null },
  ]);
  assert.equal(rewound[0].history_unknown, true);
  assert.equal(rewound[0].colour, "Greige", "it is not invented, it is flagged");
});

// ── which variations count ─────────────────────────────────────────────────

test("only variations that reached the order are versions", () => {
  const applied = appliedVariations([
    { id: "1", status: "draft" },
    { id: "2", status: "sent" },
    { id: "3", status: "rejected" },
    { id: "4", status: "applied", applied_at: "2026-03-01T00:00:00Z" },
    { id: "5", status: "approved", approved_at: "2026-02-01T00:00:00Z" },
    { id: "6", status: "cancelled" },
  ]);
  assert.deepEqual(applied.map((v) => v.id), ["5", "4"], "oldest first, and rejected or draft ones never happened");
});

// ── what changed, in words ─────────────────────────────────────────────────

test("a change names the fields that actually moved", () => {
  const was = line("a");
  const [change] = describeVariation([
    {
      action: "change",
      order_line_item_id: "a",
      title: "Door a",
      original_item_snapshot: snapshotOf(was),
      ...line("a", { colour: "Greige", height_mm: 800 }),
      proposed_line_total_ex_gst: 100,
    },
  ]);
  const moved = change.fields.map((f) => f.field).sort();
  assert.deepEqual(moved, ["colour", "height_mm"], '"this line changed" is not traceability; which field is');
  const colour = change.fields.find((f) => f.field === "colour");
  assert.equal(colour.from, "Amaro");
  assert.equal(colour.to, "Greige");
});

test("job cost lines are not described as item changes", () => {
  assert.deepEqual(describeVariation([{ action: "job_cost", cost_type: "labour" }]), []);
});

// ── the whole thing ────────────────────────────────────────────────────────

test("five variations, and every version of the order is still correct", () => {
  // The order as it stands today, after all five.
  const current = [
    line("a", { colour: "Charcoal", variation_id: "v5", variation_status: "changed" }),
    line("b", { variation_status: "removed", line_total_ex_gst: 0 }),
    line("d", { title: "Panel d", variation_id: "v3", variation_status: "added" }),
    line("e", { title: "Panel e", variation_id: "v5", variation_status: "added" }),
  ];

  const v = (id, status, at) => ({ id, variation_number: `PCD-V-2026-${id.toUpperCase()}`, status, applied_at: at, title: "Change" });
  const variations = [
    v("v1", "applied", "2026-01-01T00:00:00Z"),
    v("v2", "applied", "2026-02-01T00:00:00Z"),
    v("v3", "applied", "2026-03-01T00:00:00Z"),
    v("v4", "rejected", "2026-04-01T00:00:00Z"),
    v("v5", "applied", "2026-05-01T00:00:00Z"),
  ];

  const byVariation = new Map([
    // v1 changed line a's colour from Amaro to Greige
    ["v1", [{ id: "l1", action: "change", order_line_item_id: "a", title: "Door a", original_item_snapshot: snapshotOf(line("a", { colour: "Amaro" })) }]],
    // v2 removed line b
    ["v2", [{ id: "l2", action: "remove", order_line_item_id: "b", title: "Door b", original_item_snapshot: snapshotOf(line("b")) }]],
    // v3 added panel d
    ["v3", [{ id: "l3", action: "add", order_line_item_id: null, title: "Panel d" }]],
    // v5 changed a again (Greige to Charcoal) and added panel e
    ["v5", [
      { id: "l5a", action: "change", order_line_item_id: "a", title: "Door a", original_item_snapshot: snapshotOf(line("a", { colour: "Greige" })) },
      { id: "l5b", action: "add", order_line_item_id: null, title: "Panel e" },
    ]],
  ]);

  const versions = orderVersions({
    order: { order_number: "PCD-O-2026-TEST", accepted_at: "2025-12-01T00:00:00Z" },
    lines: current,
    variations,
    variationLinesByVariationId: byVariation,
  });

  // Four applied variations plus the accepted state.
  assert.equal(versions.length, 5, "a rejected variation is not a version of the order");
  assert.deepEqual(
    versions.map((version) => version.label),
    ["As accepted", "PCD-V-2026-V1", "PCD-V-2026-V2", "PCD-V-2026-V3", "PCD-V-2026-V5"]
  );

  const at = (label) => versions.find((version) => version.label === label);

  // As accepted: a and b, both original, nothing added.
  const accepted = at("As accepted");
  assert.deepEqual(accepted.lines.map((l) => l.id).sort(), ["a", "b"], "d and e did not exist at acceptance");
  assert.equal(accepted.lines.find((l) => l.id === "a").colour, "Amaro");
  assert.equal(accepted.lines.find((l) => l.id === "b").variation_status, null, "b had not been removed yet");

  // After v1: a is Greige, b still present.
  const afterV1 = at("PCD-V-2026-V1");
  assert.equal(afterV1.lines.find((l) => l.id === "a").colour, "Greige");
  assert.ok(afterV1.lines.some((l) => l.id === "b" && l.variation_status !== "removed"));

  // After v2: b removed.
  const afterV2 = at("PCD-V-2026-V2");
  assert.equal(afterV2.lines.find((l) => l.id === "b").variation_status, "removed");

  // After v3: d exists, e does not.
  const afterV3 = at("PCD-V-2026-V3");
  assert.ok(afterV3.lines.some((l) => l.id === "d"), "v3 added d");
  assert.ok(!afterV3.lines.some((l) => l.id === "e"), "e comes two variations later");

  // After v5: everything, and a is Charcoal.
  const afterV5 = at("PCD-V-2026-V5");
  assert.equal(afterV5.lines.find((l) => l.id === "a").colour, "Charcoal");
  assert.ok(afterV5.lines.some((l) => l.id === "e"));

  // The money follows, and a removed line stops counting.
  assert.equal(accepted.total, 200, "two lines at 100");
  assert.equal(afterV2.total, 100, "b was removed");
});

test("a history with a gap in it says so rather than looking complete", () => {
  const versions = orderVersions({
    order: { order_number: "PCD-O-2026-GAP" },
    lines: [line("a", { colour: "Greige" })],
    variations: [{ id: "v1", variation_number: "PCD-V-2026-V1", status: "applied", applied_at: "2026-01-01T00:00:00Z" }],
    variationLinesByVariationId: new Map([
      ["v1", [{ id: "l1", action: "change", order_line_item_id: "a", title: "Door a", original_item_snapshot: null }]],
    ]),
  });
  const gaps = historyGaps(versions);
  assert.ok(gaps.length > 0, "a gap presented as a fact is worse than a gap presented as a gap");
  assert.match(gaps.map((g) => g.reason).join(" "), /not recorded|no before-state/i);
});

test("an order with no variations is one version and does not fall over", () => {
  const versions = orderVersions({ order: { order_number: "PCD-O-2026-PLAIN" }, lines: [line("a")], variations: [] });
  assert.equal(versions.length, 1);
  assert.equal(versions[0].label, "As accepted");
  assert.deepEqual(historyGaps(versions), []);
});

// ── THE LOADING RENDER ─────────────────────────────────────────────────────
//
// These hooks have to sit above the page's loading gate, or React counts a
// different number of hooks on each render and stops. That means they run once
// with nothing loaded, where order, lines and variations are all genuinely
// null.
//
// A parameter or destructuring default only applies to `undefined`. A null goes
// straight past it, and the first property read throws. That is exactly what
// happened: "Cannot read properties of null (reading 'order_number')" on every
// order page.
//
// So every export here has to survive being handed nothing at all.

test("the first render, with nothing loaded, produces one empty version", () => {
  const versions = orderVersions({ order: null, lines: null, variations: null, variationLinesByVariationId: null });
  assert.equal(versions.length, 1);
  assert.equal(versions[0].label, "As accepted");
  assert.deepEqual(versions[0].lines, []);
  assert.equal(versions[0].total, 0);
});

test("every export survives null, undefined and the wrong type", () => {
  [null, undefined, "not an array", 42, {}].forEach((rubbish) => {
    assert.doesNotThrow(() => appliedVariations(rubbish), `appliedVariations(${JSON.stringify(rubbish)})`);
    assert.doesNotThrow(() => describeVariation(rubbish), `describeVariation(${JSON.stringify(rubbish)})`);
    assert.doesNotThrow(() => historyGaps(rubbish), `historyGaps(${JSON.stringify(rubbish)})`);
    assert.doesNotThrow(() => rewindVariation([], rubbish, null), `rewindVariation(_, ${JSON.stringify(rubbish)})`);
  });
  assert.doesNotThrow(() => orderVersions(), "called with no argument at all");
  assert.doesNotThrow(() => orderVersions(null), "called with null");
});

// A Map is the only thing that answers .get(). Anything else here is a caller
// mid-load, and calling .get() on it would throw rather than degrade.
test("a variation map that is not a Map does not take the page down", () => {
  const versions = orderVersions({
    order: { order_number: "PCD-O-1" },
    lines: [line("a")],
    variations: [{ id: "v1", status: "applied", applied_at: "2026-01-01T00:00:00Z" }],
    variationLinesByVariationId: { v1: [] },
  });
  assert.equal(versions.length, 2, "the versions still list, they just have no changes to describe");
});
