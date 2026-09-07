// THE NOTE BUBBLE HAS TO SIT OVER THE TABLE, NOT UNDER IT.
//
// ── THE FAULT ────────────────────────────────────────────────────────────────
//
// Hovering the note icon on a quote line showed a bubble with the client note
// and the internal note in it. Only the top sliver of it was ever visible. The
// rest was painted over by the rows underneath.
//
// The bubble was already position: fixed with a z-index of 60, which reads like
// it should sit over everything. It did not, because of where it was rendered.
// The note icon lives in the actions column, and that column is sticky with a
// z-index so it stays put while the table scrolls sideways. A positioned
// element with a z-index starts its own stacking context, so the bubble's 60
// only ordered it inside its OWN cell. Every row below has an actions cell at
// the same z-index and later in the document, so each one painted over it.
//
// ── THE RULE ─────────────────────────────────────────────────────────────────
//
// Anything that has to float over this table is rendered on the body, not
// inside a cell of it. Fixed positioning is not enough on its own.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const EDITOR = readFileSync(new URL("../app/admin/quotes/[id]/QuoteEditor.js", import.meta.url), "utf8");

// The note button and its bubble, sliced out so these read the right code.
const NOTE_BUTTON = (() => {
  const start = EDITOR.indexOf("function LineNoteButton(");
  assert.ok(start > 0, "LineNoteButton should still exist");
  const end = EDITOR.indexOf("\nfunction ", start + 1);
  return EDITOR.slice(start, end);
})();

test("the hover bubble is rendered on the body, not inside the row", () => {
  assert.match(NOTE_BUTTON, /createPortal\(/, "the bubble should be portalled");
  assert.match(NOTE_BUTTON, /document\.body/, "the portal target should be the body");
  // Guarded, because this file is rendered on the server before it is hydrated.
  assert.match(NOTE_BUTTON, /typeof document !== "undefined"/);
});

test("the bubble is still placed off the button rather than inside it", () => {
  // Fixed and portalled are two separate fixes for two separate faults: fixed
  // is what gets it out of the table's own sideways scroll box, portalled is
  // what gets it out of the sticky cell's stacking context. Losing either one
  // brings back a clipped bubble.
  assert.match(NOTE_BUTTON, /\bfixed z-\[60\]/);
  assert.match(NOTE_BUTTON, /getBoundingClientRect\(\)/);
  assert.ok(
    !/\babsolute\b[^"]*\bz-\[60\]/.test(NOTE_BUTTON),
    "the bubble must not be positioned inside the row"
  );
});

test("the column the button sits in really is a sticky stacking context", () => {
  // The premise of the fix. If the actions column ever stops being sticky this
  // test is what says the portal was there for a reason.
  assert.match(EDITOR, /sticky right-0 z-20/);
});

test("both notes and the empty state all still show on hover", () => {
  assert.match(NOTE_BUTTON, /Shown on the quote/);
  assert.match(NOTE_BUTTON, /Internal only/);
  assert.match(NOTE_BUTTON, /No notes on this line/);
});
