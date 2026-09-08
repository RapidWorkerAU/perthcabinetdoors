// MEASURING A JOB ON SITE.
//
// ── WHAT THIS IS FOR ─────────────────────────────────────────────────────────
//
// Six answers, asked standing in somebody's kitchen with a tape in one hand:
// what it is, how big, how many, and on a door which side it hangs and where
// the cups go. Everything else about the line is answered at the office.
//
// ── THE RULE ─────────────────────────────────────────────────────────────────
//
// A MEASURED LINE IS AN ORDINARY LINE. Every answer has a column on a quote
// line already, so nothing is parked in the notes and nothing downstream has to
// know a site measure happened: the same pricing, the same cut list, the same
// board order. The one exception is the reference, D1, which is what is
// pencilled on the door and has nowhere else to go.
//
// AND IT SAVES AS IT GOES. Each item is written the moment it is added, through
// the same save the items table uses for a line typed by hand. On site that is
// the whole point: a lost tab or a dropped phone loses nothing.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  SITE_MEASURE_TYPES,
  hingeFieldsFromCups,
  measureIsComplete,
  measuredQuoteLine,
  measuredSummary,
  nextReference,
  noteWithReference,
  referenceFromNote,
  siteMeasureType,
} from "../lib/pcd-site-measure.js";
import { PANEL_USES, itemTypeLabel } from "../lib/pcd-line-details.js";
import { cupPositions, hingeCount, normaliseHingeSide, usesStandardPositions } from "../lib/pcd-hinges.js";
import { quoteLineRow } from "../app/api/admin/quotes/[id]/_quote-line-save.js";

const EDITOR = readFileSync(new URL("../app/admin/quotes/[id]/QuoteEditor.js", import.meta.url), "utf8");
const MODAL = readFileSync(new URL("../app/admin/quotes/[id]/SiteMeasureModal.js", import.meta.url), "utf8");

const door = (over = {}) => ({
  ref: "D1", type: "door", height_mm: 2100, width_mm: 497, qty: 1,
  hinge_side: "Left", hinge_count: 4, cups: [110, 770, 1430, 1990], standard: false, ...over,
});

// ── The six things it asks ───────────────────────────────────────────────────

test("it offers the six things that get measured, and only those", () => {
  assert.deepEqual(
    SITE_MEASURE_TYPES.map((t) => t.label),
    ["Door", "Drawer front", "Panel", "Filler", "Scribe", "Kickboard"]
  );
  // Every one is a product type and a panel use the quote already knows.
  for (const type of SITE_MEASURE_TYPES) {
    if (!type.panel_use) continue;
    assert.ok(PANEL_USES.includes(type.panel_use), `${type.panel_use} should be a real panel use`);
  }
  // Only a door is drilled.
  assert.deepEqual(SITE_MEASURE_TYPES.filter((t) => t.hinges).map((t) => t.key), ["door"]);
});

test("a size is all it takes to make a line", () => {
  assert.equal(measureIsComplete({ height_mm: 720, width_mm: 397 }), true);
  assert.equal(measureIsComplete({ height_mm: 720 }), false);
  assert.equal(measureIsComplete({ height_mm: 0, width_mm: 397 }), false);
  assert.equal(measureIsComplete({}), false);
});

// ── It lands in real columns ─────────────────────────────────────────────────

test("a scribe measured on site is the same line as a scribe typed at a desk", () => {
  const line = measuredQuoteLine({ ref: "S1", type: "scribe", height_mm: "2100", width_mm: "40", qty: "2" }, {});

  assert.equal(line.product_type, "Panel");
  assert.equal(line.panel_use, "Scribe");
  assert.equal(itemTypeLabel(line), "Scribe", "the items table should read it as a Scribe");
  assert.equal(line.height_mm, 2100);
  assert.equal(line.width_mm, 40);
  assert.equal(line.qty, 2);

  // And the saver takes it exactly as it takes any other line.
  const row = quoteLineRow(line, 0, {});
  assert.equal(row.product_type, "Panel");
  assert.equal(row.panel_use, "Scribe");
  assert.equal(row.height_mm, 2100);
  assert.equal(row.qty, 2);
});

test("everything the card asks has a column, so nothing but the reference is a note", () => {
  const line = measuredQuoteLine(door(), {});
  const row = quoteLineRow(line, 0, {});

  for (const field of [
    "product_type", "panel_use", "height_mm", "width_mm", "qty",
    "hinge_holes", "hinge_qty", "hinge_side", "hinge_from_bottom_mm", "hinge_from_top_mm", "hinge_middles_mm",
  ]) {
    assert.ok(field in row, `${field} should be a column on the line`);
  }
  // The reference is the only thing in the note, and it is the whole note.
  assert.equal(row.notes, "Site measure ref D1.");
});

test("a new line keeps everything the form did not ask about", () => {
  // The editor's own empty line is the base, so the markup, the rates and every
  // field this card does not ask arrive as they would on Add line item.
  const base = { markup_percent: 40, worker_hourly_rate: 85, unit_cost_mode: "manual", notes: "" };
  const line = measuredQuoteLine({ ref: "P1", type: "panel", height_mm: 600, width_mm: 300 }, base);
  assert.equal(line.markup_percent, 40);
  assert.equal(line.worker_hourly_rate, 85);
  assert.equal(line.unit_cost_mode, "manual");
  // And the board is deliberately left blank, to be filled in at the office.
  assert.equal(line.material ?? "", "");
  assert.equal(line.colour ?? "", "");
});

// ── The hinges ───────────────────────────────────────────────────────────────

test("cups are typed up from the bottom, and stored the way the line stores them", () => {
  // One datum for the whole door: a tape hooked over the bottom edge. The line
  // holds the top cup as a distance from the TOP, so the turn-round happens
  // here rather than in somebody's head.
  const line = measuredQuoteLine(door(), {});
  assert.equal(line.hinge_from_bottom_mm, 110);
  assert.deepEqual(line.hinge_middles_mm, [770, 1430]);
  assert.equal(line.hinge_from_top_mm, 110, "1990 up a 2100 door is 110 down from the top");

  // And read back the other way it is the list that was typed.
  assert.deepEqual(cupPositions({ ...line, hinge_holes: true }), [110, 770, 1430, 1990]);
});

test("cups out of order are still read bottom first", () => {
  const line = measuredQuoteLine(door({ cups: [1990, 110, 1430, 770] }), {});
  assert.equal(line.hinge_from_bottom_mm, 110);
  assert.deepEqual(line.hinge_middles_mm, [770, 1430]);
  assert.equal(line.hinge_from_top_mm, 110);
});

test("a cup past the top of the door is not stored as a measurement", () => {
  // A door somebody has mistyped. Nulled rather than kept as a negative, so it
  // reads as "not said" instead of as a number that was meant.
  const bad = hingeFieldsFromCups([110, 2500], 2100);
  assert.equal(bad.hinge_from_top_mm, null);
  assert.equal(bad.hinge_from_bottom_mm, 110);
});

test("standard positions leave the measurements blank, which is what blank means", () => {
  const line = measuredQuoteLine(door({ standard: true }), {});
  assert.equal(line.hinge_holes, true, "it is still drilled");
  assert.equal(hingeCount(line), 4);
  assert.equal(line.hinge_from_bottom_mm, null);
  assert.equal(line.hinge_from_top_mm, null);
  assert.deepEqual(line.hinge_middles_mm, []);
  assert.equal(usesStandardPositions(line), true, "the whole pattern is left to us");
});

test("only a door is drilled, whatever is left on the card", () => {
  // Switch a door to a panel with the hinge answers still filled in and none of
  // them survives, so a panel cannot reach the workshop asking to be drilled.
  const line = measuredQuoteLine({ ...door(), type: "kickboard" }, {});
  assert.equal(line.hinge_holes, false);
  assert.equal(line.hinge_qty, "");
  assert.equal(line.hinge_side, "");
  assert.deepEqual(line.hinge_middles_mm, []);
  assert.equal(quoteLineRow(line, 0, {}).hinge_side, null);
});

test("the side is one of the two the workshop understands", () => {
  assert.equal(normaliseHingeSide(measuredQuoteLine(door({ hinge_side: "Left" }), {}).hinge_side), "Left");
  assert.equal(normaliseHingeSide(measuredQuoteLine(door({ hinge_side: "Right" }), {}).hinge_side), "Right");
});

// ── The reference ────────────────────────────────────────────────────────────

test("the reference is written and read back in one form", () => {
  assert.equal(noteWithReference("Chipped corner", "D3"), "Site measure ref D3. Chipped corner");
  assert.equal(noteWithReference("", "D3"), "Site measure ref D3.");
  assert.equal(noteWithReference("Chipped", ""), "Chipped");
  assert.equal(referenceFromNote("Site measure ref D9. blah"), "D9");
  assert.equal(referenceFromNote("nothing here"), "");
  assert.equal(referenceFromNote(null), "");
  // Re-referencing replaces rather than stacking two of them up.
  assert.equal(noteWithReference("Site measure ref D3. Chipped", "D4"), "Site measure ref D4. Chipped");
});

test("the numbering carries on from the quote, not from the screen", () => {
  // Read off the lines, so closing the tab does not start again at D1 and give
  // two doors the same name.
  const lines = [
    { notes: "Site measure ref D1. Chipped." },
    { notes: "Site measure ref D2." },
    { notes: "Site measure ref DR1." },
    { notes: "an ordinary note" },
    {},
  ];
  assert.equal(nextReference(lines, "door"), "D3");
  assert.equal(nextReference(lines, "drawer"), "DR2", "DR1 must not be read as a D");
  assert.equal(nextReference(lines, "kickboard"), "K1");
  assert.equal(nextReference([], "panel"), "P1");
});

test("every kind has its own letter, so two of them cannot collide", () => {
  const prefixes = SITE_MEASURE_TYPES.map((t) => t.prefix);
  assert.equal(new Set(prefixes).size, prefixes.length, "each prefix should be its own");
  // And a longer prefix is matched exactly, not as its first letter.
  assert.equal(nextReference([{ notes: "Site measure ref DR4." }], "door"), "D1");
});

// ── It is the ordinary save ──────────────────────────────────────────────────

test("a measured item goes through the save the items table already uses", () => {
  // No second endpoint and no second way for a line to reach a quote.
  assert.match(EDITOR, /async function addMeasuredItem\(item\)/);
  assert.match(EDITOR, /measuredQuoteLine\(item, emptyLineWithDefaults\(businessDefaults, defaultsLoaded\)\)/);
  assert.match(EDITOR, /await saveLineAtIndex\(index, line, \{ updateDraft: false \}\)/);
});

test("a save that fails takes the line back off the list", () => {
  // Otherwise the card would show something the quote has not got.
  assert.match(EDITOR, /if \(!saved\) setForm\(\(current\) => \(\{ \.\.\.current, lines: current\.lines\.filter/);
});

test("a row left open for editing is saved before the measure appends under it", () => {
  const fn = EDITOR.slice(EDITOR.indexOf("async function openSiteMeasure"), EDITOR.indexOf("async function addMeasuredItem"));
  assert.match(fn, /editableLineIndex !== null/);
  assert.match(fn, /saveLineAtIndex\(editableLineIndex/);
  assert.match(fn, /if \(!saved\) return;/, "a failed save must not open the measure");
});

test("the button sits on the items toolbar and cannot be used on a locked quote", () => {
  const at = EDITOR.indexOf("onClick={openSiteMeasure}");
  assert.ok(at > 0, "the button should exist");
  const button = EDITOR.slice(at - 400, at + 500);
  assert.match(button, /Site measure/);
  assert.match(button, /disabled=\{isLocked \|\| savingLineIndex !== null\}/);
});

// ── The card ─────────────────────────────────────────────────────────────────

test("the card says what the item will become before it is added", () => {
  assert.equal(
    measuredSummary(door({ qty: 2 })),
    "Door, 2100 x 497, x2, 4 hinges left, cups 110 / 770 / 1430 / 1990 up"
  );
  assert.equal(measuredSummary({ type: "scribe", height_mm: 2100, width_mm: 40 }), "Scribe, 2100 x 40");
  assert.equal(measuredSummary(door({ standard: true })), "Door, 2100 x 497, 4 hinges left, standard cup positions");
});

test("nothing on the card is left to wrap", () => {
  // Six tiles in a three column grid is two tidy rows. Left to wrap they broke
  // into a ragged one and a half, which is what the first attempt at this did.
  assert.match(MODAL, /gridTemplateColumns: `repeat\(\$\{cols\},minmax\(0,1fr\)\)`/);
  assert.match(MODAL, /cols=\{3\}/, "the item types");
  assert.match(MODAL, /cols=\{2\}/, "the hinge side");
  assert.match(MODAL, /cols=\{4\}/, "the hinge count");
  assert.match(MODAL, /whitespace-nowrap/);
});

test("the card does not delete, because those are quote lines now", () => {
  // A delete belongs where every other line is deleted, not behind a second
  // button that only some lines have.
  assert.equal(/onRemove|data-remove|Delete/.test(MODAL), false);
  assert.match(MODAL, /These are quote lines already/);
});

test("the type is asked of the shared list, not written out again", () => {
  assert.match(MODAL, /SITE_MEASURE_TYPES\.map/);
  assert.match(MODAL, /hingesForHeight/, "the hinge count starts from the height rule everything else uses");
  assert.equal(siteMeasureType("nonsense").key, "door", "an unknown key falls back rather than throwing");
});
