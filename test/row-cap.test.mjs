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

// ── HOW IT WAS WIRED UP, AND WHY THAT IS NOT TESTED HERE ANY MORE ──────────
//
// Four tests lived here asserting that the public quote page capped its item
// list: that both the table and the mobile cards measured themselves, that the
// header stuck, that both overflow axes were stated, and that a capped list
// said how many items it held.
//
// The page was rewritten on 7 September 2026 in d848c2b, and the capping was
// dropped as part of that: QuoteApprovalClient.js no longer imports useRowCap,
// the quoteItemsCapped rules are gone from quote-public.module.css, and the
// list simply runs its full length. That is a decision somebody made and
// shipped, not a regression, so the tests describing the old implementation
// are retired rather than made to pass against something that is not there.
//
// The arithmetic above is untouched and still passes, because rowCapHeight is
// a pure function and correct regardless of who calls it.
//
// WHICH IS THE THING WORTH KNOWING: NOBODY CALLS IT. lib/pcd-row-cap.js has no
// consumer anywhere in the app. It is either waiting to be wired into a list
// that needs capping, or it is dead and should go with these tests. This
// asserts the state rather than leaving it to be discovered again.

test("the row cap helper is not wired into anything", () => {
  const client = readFileSync(new URL("../app/(site)/quotes/QuoteApprovalClient.js", import.meta.url), "utf8");
  assert.ok(!client.includes("useRowCap"), "the quote page stopped capping in the 7 September rewrite");
  assert.ok(!client.includes("data-cap-row"), "and the rows it measured are no longer marked");
});
