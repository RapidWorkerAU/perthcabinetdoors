// Quote Items stops at five rows and scrolls inside itself.
//
// The height is measured from the rows on the page, so the arithmetic has to be
// right in the cases that are easy to get wrong: the gaps between rows (n rows
// have n-1 gaps), a sticky table header that sits inside the scrolling box, and
// the copy of the list that the breakpoint has hidden and which therefore
// measures nothing.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rowCapHeight } from "../lib/pcd-row-cap.js";

const ROWS = [40, 52, 40, 68, 40, 40, 52];

test("the cap is the height of the visible rows", () => {
  assert.equal(rowCapHeight({ rowHeights: ROWS, visibleRows: 5 }), 40 + 52 + 40 + 68 + 40);
});

test("rows past the cap are not counted", () => {
  // Six rows and seven rows cap at the same height: the extra ones are the
  // point of the scrollbox, not part of it.
  const six = rowCapHeight({ rowHeights: ROWS.slice(0, 6), visibleRows: 5 });
  assert.equal(rowCapHeight({ rowHeights: ROWS, visibleRows: 5 }), six);
  assert.equal(six, 40 + 52 + 40 + 68 + 40);
});

test("five rows have four gaps between them, not five", () => {
  const withGaps = rowCapHeight({ rowHeights: ROWS, gap: 14, visibleRows: 5 });
  const withoutGaps = rowCapHeight({ rowHeights: ROWS, visibleRows: 5 });
  assert.equal(withGaps - withoutGaps, 14 * 4);
});

test("a sticky table header counts, because it scrolls inside the box", () => {
  const withHead = rowCapHeight({ rowHeights: ROWS, headHeight: 33, visibleRows: 5 });
  const withoutHead = rowCapHeight({ rowHeights: ROWS, visibleRows: 5 });
  assert.equal(withHead - withoutHead, 33);
});

test("a list shorter than the cap is left alone", () => {
  // Five items or fewer is not a long section, so no scrollbox and no fixed
  // height. Exactly five must not be capped either.
  assert.equal(rowCapHeight({ rowHeights: [40, 40, 40], visibleRows: 5 }), null);
  assert.equal(rowCapHeight({ rowHeights: [40, 40, 40, 40, 40], visibleRows: 5 }), null);
  assert.equal(rowCapHeight({ rowHeights: [40, 40, 40, 40, 40, 40], visibleRows: 5 }), 200);
});

test("a list that is not on screen is left uncapped, not capped to nothing", () => {
  // The same lines render twice, as a table and as mobile cards. The one the
  // breakpoint hides measures zero. Capping it at zero would be wrong the
  // moment the window is resized past the breakpoint.
  assert.equal(rowCapHeight({ rowHeights: [0, 0, 0, 0, 0, 0], visibleRows: 5 }), null);
  assert.equal(rowCapHeight({ rowHeights: [0, 0, 0, 0, 0, 0], gap: 14, headHeight: 0, visibleRows: 5 }), 56);
});

test("nonsense in does not produce a broken height out", () => {
  assert.equal(rowCapHeight(), null);
  assert.equal(rowCapHeight({ rowHeights: [40, 40, 40, 40, 40, 40], visibleRows: 0 }), null);
  assert.equal(rowCapHeight({ rowHeights: [40, undefined, null, NaN, 40, 40], visibleRows: 5 }), 80);
});

test("the result is a whole number of pixels", () => {
  const value = rowCapHeight({ rowHeights: [40.4, 40.4, 40.4, 40.4, 40.4, 40], gap: 13.6, visibleRows: 5 });
  assert.equal(value, Math.round(40.4 * 5 + 13.6 * 4));
  assert.equal(Number.isInteger(value), true);
});

// ── how it is wired up ──────────────────────────────────────────────────────

const CLIENT = readFileSync(new URL("../app/(site)/quotes/QuoteApprovalClient.js", import.meta.url), "utf8");
const CSS = readFileSync(new URL("../app/(site)/quotes/quote-public.module.css", import.meta.url), "utf8");

test("both renderings of the lines are capped, and each measures itself", () => {
  // A table row and a mobile card are nothing like the same height, so one
  // shared measurement would be wrong for one of them.
  assert.match(CLIENT, /useRowCap\(lines\.length, VISIBLE_ITEM_ROWS\)[\s\S]*useRowCap\(lines\.length, VISIBLE_ITEM_ROWS\)/);
  assert.equal((CLIENT.match(/data-cap-row/g) || []).length, 3, "the tr, the article, and the query that finds them");
});

test("the table header stays put once the rows scroll under it", () => {
  const sticky = CSS.match(/\.quoteItemsCapped thead th \{[^}]*\}/);
  assert.ok(sticky, "the header must be sticky inside the capped box");
  assert.match(sticky[0], /position: sticky/);
  assert.match(sticky[0], /top: 0/);
});

test("both overflow axes are stated, so neither is set by accident", () => {
  // Setting one axis to auto forces a `visible` on the other to compute as auto,
  // and the desktop wrapper sets overflow-x: visible.
  const capped = CSS.match(/\.quoteItemsCapped,\n\.quoteViewCard \.quoteItemsCapped \{[^}]*\}/);
  assert.ok(capped, "the rule must match the wrapper's own specificity");
  assert.match(capped[0], /overflow-x: auto/);
  assert.match(capped[0], /overflow-y: auto/);
});

test("a capped list says how many items are in it", () => {
  // Overlay scrollbars are invisible until something is scrolled, so the only
  // sign that rows are hidden would otherwise be that they are missing.
  assert.match(CLIENT, /itemsAreCapped \? \(/);
  assert.match(CLIENT, /\{lines\.length\} items/);
});
