// A FIELD YOU CANNOT EMPTY READS AS A BUG.
//
// Coercing what was typed on its way INTO the box is what causes it. Backspace
// over the last character, the box is briefly empty, the coercion turns that
// into 0 or into a minimum or into the calculated figure, and the number
// reappears under the cursor. Selecting it and typing over it works, because
// that never passes through empty. Deleting it does not.
//
// These are source assertions on purpose. The fault is a shape, not a value:
// what has to be true is that no field puts something back into itself.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const QUOTE_EDITOR = read("app/admin/quotes/[id]/QuoteEditor.js");
const DESIGN_PANEL = read("app/admin/design/_components/DesignRightPanel.js");
const VARIATION = read("app/admin/orders/[id]/variations/[variationId]/VariationEditor.js");

// ── nothing is coerced on the way in ───────────────────────────────────────

test("the design panel keeps what was typed, empty included", () => {
  assert.match(DESIGN_PANEL, /const typedNumber = \(raw, clamp\) => \{/);
  assert.match(DESIGN_PANEL, /if \(text\.trim\(\) === ""\) return "";/, "an empty box stays empty");
});

test("no number field in the design panel coerces an empty box into a number", () => {
  const offenders = [
    /Number\(e\.target\.value\) \|\| 0/,
    /parseInt\(e\.target\.value, 10\) \|\| 0/,
    /Math\.max\(1, Number\(e\.target\.value\)/,
    /Math\.max\(0\.1, Number\(e\.target\.value\)/,
  ];
  offenders.forEach((pattern) =>
    assert.doesNotMatch(DESIGN_PANEL, pattern, `still coerces on the way in: ${pattern}`)
  );
});

test("no field is rendered through a falsy fallback", () => {
  // value={x || 0} is the same fault written the other way round: the box shows
  // 0 the moment what is behind it is empty.
  [QUOTE_EDITOR, DESIGN_PANEL, VARIATION].forEach((source) => {
    assert.doesNotMatch(source, /value=\{[^}]*\|\| 0\}/, "a field falls back to 0 while being typed in");
  });
});

// ── a calculated box shows the calculation, and still lets you empty it ────

test("both editors hold an empty box while the cursor is in it", () => {
  assert.match(QUOTE_EDITOR, /const showsTyped = \(field, overridden\) => overridden \|\| focusedField === field/);
  assert.match(DESIGN_PANEL, /const holdsTyped = \(key, typed\) => focusedField === key \|\| String\(typed \?\? ""\)\.trim\(\) !== ""/);
});

test("the bay share box can be emptied", () => {
  // It showed the worked-out share whenever it was blank, so blanking it put
  // the share straight back.
  assert.match(DESIGN_PANEL, /value=\{holdsTyped\(`bay-pct-\$\{idx\}`, sec\.height_pct\)/);
  assert.match(DESIGN_PANEL, /onFocus=\{\(\) => setFocusedField\(`bay-pct-\$\{idx\}`\)\}/);
});

// ── and typing a zero is allowed to mean zero ──────────────────────────────

test("a typed zero counts as an answer, not as an empty box", () => {
  // The screen tells you what the lines work out to and offers a way back, so
  // there is no reason to refuse a deliberate nothing. isOverridden asks
  // whether anything was TYPED, which "0" was.
  assert.match(QUOTE_EDITOR, /const isOverridden = \(value\) => String\(value \?\? ""\)\.trim\(\) !== ""/);
  // And it survives the round trip: 0 is kept, only a genuinely blank box
  // becomes null.
  assert.match(
    QUOTE_EDITOR,
    /manual_labour_hours: String\(nextForm\.labour_hours \?\? ""\)\.trim\(\) === "" \? null : Number\(nextForm\.labour_hours\)/
  );
  assert.match(
    QUOTE_EDITOR,
    /edging_cost_override_ex_gst: quote\.edging_cost_override_ex_gst \?\? ""/,
    "a zero edging override is a decision and has to survive"
  );
});
