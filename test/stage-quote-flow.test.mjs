// THE THIRD ROUTE INTO A QUOTE: the backend design tool's Stage Quote.
//
// Two of the three ways a quote gets made are covered field by field elsewhere:
//
//   quote-request-flow      the public form, and its conversion
//   design-to-quote-flow    the public design tool, and its pricing
//
// This one covers Stage Quote, which posts to the design importer. The importer
// is a route rather than a library, so what a person can actually check is that
// every field a quote needs is assigned somewhere in it, and that the fields it
// deliberately withholds stay withheld. A missing assignment here is a spec that
// silently arrives blank on the quote, which is the failure this file exists to
// stop: a thickness that never made it is a line nobody can price.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { PRODUCT_TYPES } from "../lib/pcd-materials.js";

const IMPORTER = readFileSync(
  new URL("../app/api/admin/design/projects/[projectId]/import/route.js", import.meta.url),
  "utf8"
);

// Assigned as `name:` in an object literal, or as `line.name =` afterwards.
// Both are how this route builds a line.
function assigns(field) {
  const asKey = new RegExp(`(^|[\\s{,])${field}\\s*:`, "m");
  const asPatch = new RegExp(`line\\.${field}\\s*=`, "m");
  return asKey.test(IMPORTER) || asPatch.test(IMPORTER);
}

// ── the spec a quote cannot be priced without ──────────────────────────────
//
// Every one of these is a thing somebody would have to ask the customer again
// if it did not survive the trip.

const REQUIRED = [
  ["material", "what the piece is made from"],
  ["thickness", "which board, and it is a separate field for a reason"],
  ["finish", "the finish, which is part of the board's identity"],
  ["colour", "the colour the customer chose"],
  ["supplier_name", "the brand, because a colour name is not unique across suppliers"],
  ["profile_type", "whether it is profiled, and which family"],
  ["profile", "the profile itself"],
  ["edge_mould", "the edge, which is priced per lineal metre"],
  ["qty", "how many"],
  ["product_type", "what kind of thing it is"],
];

REQUIRED.forEach(([field, why]) => {
  test(`the importer carries ${field}, ${why}`, () => {
    assert.ok(assigns(field), `nothing in the importer assigns ${field}, so it arrives blank on the quote`);
  });
});

// The bug that started this audit: a thickness that ends up somewhere other than
// the thickness field. They are separate columns and separate controls, so they
// must be separate assignments.
test("thickness and colour are assigned separately, never combined", () => {
  assert.ok(assigns("thickness"), "no thickness assignment");
  assert.ok(assigns("colour"), "no colour assignment");
  const combined = /colour\s*:\s*[^,\n]*thickness/i;
  assert.ok(!combined.test(IMPORTER), "a thickness is being folded into the colour field");
});

// ── what it deliberately withholds ─────────────────────────────────────────
//
// A cabinet is priced from its cut list, not from a height times a width. Giving
// it real dimensions once repriced a $139.50 carcass to $29.16 as though it were
// one flat sheet, with no warning. The absence is the feature.
test("a cabinet is not given the dimensions that would reprice it as a flat sheet", () => {
  assert.match(
    IMPORTER,
    /isCabinet\s*\?\s*\{\}\s*:\s*\{\s*width_mm/,
    "a cabinet must not be given width and height, or its cut-list cost is overwritten"
  );
});

// ── the product types it emits must exist in the editor ────────────────────
//
// The quote editor only understands the types in pcd-materials. A line arriving
// as a type the dropdown has never heard of cannot be edited, only deleted.
test("every product type the importer names is one the quote editor knows", () => {
  const named = new Set();
  const pattern = /product_type\s*:\s*["'`]([^"'`]+)["'`]/g;
  let match = pattern.exec(IMPORTER);
  while (match) {
    named.add(match[1]);
    match = pattern.exec(IMPORTER);
  }
  // Nothing hard coded is fine; what is not fine is a type off the list.
  const unknown = [...named].filter((type) => !PRODUCT_TYPES.includes(type));
  assert.deepEqual(unknown, [], `the quote editor has no such product type: ${unknown.join(", ")}`);
});

// ── material case ──────────────────────────────────────────────────────────
//
// The design tool stores material lowercase ("compact laminate"); the quote
// editor matches Title Case. A line that skips the conversion looks right on
// screen and matches no board at all.
test("material is converted to the case the quote editor matches on", () => {
  assert.match(
    IMPORTER,
    /materialLabelForType/,
    "the importer must convert material case, or a design line matches no board"
  );
});

// ── re-importing replaces, never duplicates ────────────────────────────────
//
// Stage Quote can be pressed twice. Without the design tag the second press adds
// a second copy of every line rather than replacing the first.
test("lines are tagged to their design so a second Stage Quote replaces them", () => {
  assert.ok(assigns("design_project_id"), "nothing tags a line back to its design");
  assert.match(IMPORTER, /design_project_id/, "the importer's sweep is scoped by this column");
});

// ── the board rate is looked up, not frozen ────────────────────────────────
//
// A design can sit for weeks. Importing the rate stored on the item would quote
// last month's board price as though it were today's.
test("board rates come from the library at import, not from the design", () => {
  assert.match(
    IMPORTER,
    /withLibraryBoardRatesForAll/,
    "the importer must re-read the library, or a stale rate is quoted as current"
  );
});

// ── which board the line was priced from ───────────────────────────────────
//
// The other two routes record this. The public form's conversion sets it in
// boardCostLinePatch, and the quote editor's colour picker sets it in
// colourSelectionPatch. The importer set the RATE but not the row it came from,
// so a line staged out of the backend design tool arrived priced with nothing to
// say what it was priced from: a blank source in the editor, and nothing for a
// later reprice to match on but five loose strings that change when somebody
// tidies up the library.

import { designSourcePatch } from "../lib/pcd-board-cost.js";

test("a design-sourced line records the library row it was priced from", () => {
  const patch = designSourcePatch(
    { colour_library_id: "row-1", supplier_name: "Polytec", colour: "Boston Oak" },
    { rate: 48.5 }
  );
  assert.equal(patch.unit_cost_source_id, "row-1");
  assert.equal(patch.unit_cost_source_label, "Polytec - Boston Oak");
  assert.equal(patch.unit_cost_per_sqm_ex_gst, 48.5);
});

// A colour typed by hand, or a design saved before the picker recorded the row.
// The rate still stands so the line prices; it just cannot claim a source it
// does not have.
test("a board that was never picked from the library claims no source", () => {
  assert.deepEqual(designSourcePatch({ supplier_name: "Polytec", colour: "Boston Oak" }, { rate: 48.5 }), {});
  assert.deepEqual(designSourcePatch({}, { rate: 0 }), {});
  assert.deepEqual(designSourcePatch(), {});
});

test("a zero rate is left alone rather than written over the line's own", () => {
  const patch = designSourcePatch({ colour_library_id: "row-1", colour: "Boston Oak" }, { rate: 0 });
  assert.equal(patch.unit_cost_source_id, "row-1");
  assert.equal("unit_cost_per_sqm_ex_gst" in patch, false, "a zero rate must not overwrite one already on the line");
});

test("supplier and colour both reach the label, and a missing one is not printed", () => {
  assert.equal(
    designSourcePatch({ colour_library_id: "r", colour: "Boston Oak" }).unit_cost_source_label,
    "Boston Oak",
    "no supplier must not leave a dangling separator"
  );
});

// Every line the importer prices off a style must also record which library row
// that style is. Counting calls would pass the day somebody adds a tenth line
// builder and forgets, so this looks for the omission itself: a style rate being
// read without the matching stamp on the same line maker.
test("every line priced off a board style also records that board", () => {
  // Written without a regular expression on purpose: the marker it looks for
  // is full of characters a pattern would have to escape, and an escape that
  // goes wrong here turns the guard into something that always passes.
  const MARKER = ".cost_per_sqm || 0,";
  const unstamped = [];
  let at = IMPORTER.indexOf(MARKER);
  while (at >= 0) {
    // Walk back over the variable name to find whose style it is.
    let from = at;
    while (from > 0 && /[A-Za-z0-9_]/.test(IMPORTER[from - 1])) from -= 1;
    const variable = IMPORTER.slice(from, at);
    const after = IMPORTER.slice(at, at + 400);
    if (!after.includes("designSourcePatch(" + variable)) {
      const line = IMPORTER.slice(0, at).split("\n").length;
      unstamped.push(variable + " on line " + line);
    }
    at = IMPORTER.indexOf(MARKER, at + MARKER.length);
  }
  assert.deepEqual(
    unstamped,
    [],
    "these lines are priced off a board but do not record which board: " + unstamped.join(", ")
  );
});

// A manual rate came from a person, not from a board, so it must never claim a
// library source. Labelling it with one would say the price came from somewhere
// it did not.
test("a hand-set rate never claims to have come from the library", () => {
  assert.match(
    IMPORTER,
    /if \(manualRate <= 0\) Object\.assign\(line, designSourcePatch/,
    "a manual carcass rate must not be stamped with a library source"
  );
  assert.match(
    IMPORTER,
    /if \(item\.unit_cost_mode !== "manual"\)/,
    "a manual piece rate must not be stamped with a library source"
  );
});
