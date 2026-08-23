// WHAT THE PRODUCTION SHEET ACTUALLY PRINTS.
//
// ── WHAT WAS MISSING ─────────────────────────────────────────────────────────
//
// Somebody ticking off finished panels could not tell which profile a front was
// meant to have. The profile was CALCULATED on every row and printed nowhere:
// neither table had a column for it.
//
// Worse for the case that prompted this. Thermolaminate can only ever be
// supplier made, so a thermolaminated front prints on the supplier table, and
// that table carried no profile, no edging and no notes at all. A profiled
// thermo door reached the bench with none of the three.
//
// And a note written against a panel silently hid whatever was written on the
// line itself, because the two collapsed into one value.
//
// ── WHY THESE TESTS BUILD A REAL PDF ─────────────────────────────────────────
//
// Every one of those faults compiled, passed review and rendered a perfectly
// valid document. They were only visible on paper. So these generate an actual
// PDF and read the text back out of it, rather than checking that a function was
// called somewhere.

import test from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";

import { generateOrderCutListPdf } from "../lib/pcd-cabinet-pdf.js";

// The text a PDF draws lives in compressed content streams. Pulling it back out
// is what makes "did it print" answerable instead of assumed.
function textOf(buffer) {
  const raw = buffer.toString("latin1");
  let found = "";
  const pattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match = pattern.exec(raw);
  while (match) {
    const chunk = Buffer.from(match[1], "latin1");
    let body = "";
    try {
      body = zlib.inflateSync(chunk).toString("latin1");
    } catch {
      body = chunk.toString("latin1");
    }
    for (const shown of body.matchAll(/\(((?:[^()\\]|\\.)*)\)\s*Tj/g)) {
      found += shown[1].replace(/\\([()\\])/g, "$1") + "\n";
    }
    match = pattern.exec(raw);
  }
  return found;
}

const ORDER = {
  id: "o1",
  order_number: "PCD-O-2026-TEST",
  customer_name: "J Smith",
  currency: "AUD",
  internal_notes: "Do not cut fronts until the site measure is confirmed.",
};

// A thermolaminated, profiled front. Thermolaminate is always supplier made, so
// this is the exact row that printed with nothing useful on it.
function thermoDoor(overrides = {}) {
  return {
    id: "l1",
    sort_order: 0,
    title: "Door",
    product_type: "Door",
    material: "Thermolaminate",
    colour: "Greige",
    finish: "Matt",
    profile_type: "Shaker",
    profile: "Sussex",
    edge_mould: "Bevel 3mm",
    thickness: "18mm",
    height_mm: 720,
    width_mm: 397,
    qty: 2,
    notes: "Handle holes drilled by us",
    fulfilment_method: "supplier_ready_made",
    status: "Not Ordered",
    ...overrides,
  };
}

function build(items, extra = {}) {
  return textOf(generateOrderCutListPdf({ order: ORDER, items, ...extra }));
}

// ── the fault that prompted this ───────────────────────────────────────────

test("a thermolaminated front prints its profile", () => {
  const printed = build([thermoDoor()]);
  assert.match(printed, /Sussex/, "the profile was calculated on every row and printed nowhere");
});

test("a thermolaminated front prints its edge profile", () => {
  const printed = build([thermoDoor()]);
  assert.match(printed, /Bevel 3mm/, "the supplier table had no edging column at all");
});

test("a supplier made row prints its notes", () => {
  const printed = build([thermoDoor()]);
  assert.match(printed, /Handle holes/, "the supplier table had no notes column at all");
});

test("an in-house line prints profile, edging and notes too", () => {
  const printed = build([thermoDoor({ material: "Decorative Board", fulfilment_method: "in_house" })]);
  assert.match(printed, /Sussex/);
  assert.match(printed, /Bevel 3mm/);
  assert.match(printed, /Handle holes/);
});

// ── notes must not hide each other ─────────────────────────────────────────

test("a line note and a production note both print", () => {
  const printed = build([
    thermoDoor({ notes: "Customer collecting", production_notes: "Check the hinge side" }),
  ]);
  assert.match(printed, /Customer collecting/);
  assert.match(printed, /Check the hinge side/, "these used to collapse to one, so writing one hid the other");
});

// ── a blank is a question, not an instruction ──────────────────────────────

test("a line with no edge recorded says so rather than saying As specified", () => {
  const printed = build([thermoDoor({ edge_mould: null })]);
  assert.match(printed, /Not recorded/, "the same words the workshop labels use");
  assert.doesNotMatch(printed, /As specified/, "that read as a direction and meant nobody had said");
});

// ── open issues ────────────────────────────────────────────────────────────
//
// A panel recorded as damaged still printed as a panel to cut, because an issue
// reached the workshop nowhere at all.

test("an open issue prints, with what it stops and whose it is", () => {
  const printed = build([thermoDoor()], {
    issues: [
      {
        id: "i1",
        kind: "damaged_in_production",
        detail: "Corner chipped on the left front",
        blocks: "order",
        owner: "us",
        resolved_at: null,
      },
    ],
  });
  assert.match(printed, /Open issues/);
  assert.match(printed, /Corner chipped/);
});

test("a resolved issue is history and does not print", () => {
  const printed = build([thermoDoor()], {
    issues: [
      { id: "i1", kind: "wrong_size", detail: "Cut 5mm short", resolved_at: "2026-08-01T00:00:00Z", blocks: "panel", owner: "us" },
    ],
  });
  assert.doesNotMatch(printed, /Cut 5mm short/, "a sheet is what somebody works from today");
});

test("no issues at all prints no issues section", () => {
  assert.doesNotMatch(build([thermoDoor()]), /Open issues/);
});

// ── the order's own notes ──────────────────────────────────────────────────

test("the order's notes reach the sheet", () => {
  assert.match(build([thermoDoor()]), /site measure/);
});

// ── nothing regressed ──────────────────────────────────────────────────────

test("the sheet still carries the basics", () => {
  const printed = build([thermoDoor()]);
  assert.match(printed, /PCD-O-2026-TEST/, "which order");
  assert.match(printed, /Greige/, "the colour");
  assert.match(printed, /720/, "the size");
  assert.match(printed, /18mm/, "the thickness");
});

// A carcass panel is not profiled. Printing a profile against every side panel
// would bury the fronts that actually have one.
test("a cabinet's carcass panels are not given a profile line", () => {
  const cabinet = {
    id: "c1",
    sort_order: 0,
    title: "Base cabinet",
    product_type: "base_cabinet",
    material: "Decorative Board",
    colour: "White",
    profile_type: "Shaker",
    profile: "Sussex",
    qty: 1,
    fulfilment_method: "in_house",
    cabinet_config: {
      label: "Base cabinet 1",
      calculated_cut_list: [
        { label: "Left side panel", qty: 1, width_mm: 560, height_mm: 720, thickness_mm: 16, material: "Decorative Board - White" },
      ],
    },
  };
  const printed = build([cabinet]);
  assert.match(printed, /Left side panel/, "the panel still prints");
  assert.doesNotMatch(printed, /Sussex profile/, "but not with the cabinet's front profile against it");
});
