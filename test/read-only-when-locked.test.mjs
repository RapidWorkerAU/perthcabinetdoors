// IF IT CANNOT BE SAVED, IT MUST NOT BE TYPEABLE.
//
// ── THE FAULT ────────────────────────────────────────────────────────────────
//
// An accepted quote refused to save, correctly. Every field on it stayed fully
// editable. So somebody could retype a line, change a colour, add an item, press
// Save, and only then be told none of it was allowed. The work is thrown away
// and the refusal arrives after the effort instead of before it.
//
// The lock reached exactly two things: the Save button and the reprice button.
// On the variation editor, twelve of twenty nine fields checked whether editing
// was allowed and the rest did not.
//
// A banner saying "this cannot be edited" above fields that accept typing is not
// a control. It is a warning that the screen is lying.
//
// ── THE RULE ─────────────────────────────────────────────────────────────────
//
// Wherever editing is refused, the fields go read only. One wrapper does it, so
// a field added next year is covered without anyone remembering to cover it.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const REGION = readFileSync(new URL("../app/admin/_components/LockedRegion.js", import.meta.url), "utf8");
const QUOTE = readFileSync(new URL("../app/admin/quotes/[id]/QuoteEditor.js", import.meta.url), "utf8");
const VARIATION = readFileSync(
  new URL("../app/admin/orders/[id]/variations/[variationId]/VariationEditor.js", import.meta.url),
  "utf8"
);

// ── the wrapper ────────────────────────────────────────────────────────────

test("the lock uses a fieldset, so it reaches fields nobody thought about", () => {
  assert.match(REGION, /<fieldset\s/, "a fieldset disables every native control inside it, however deeply nested");
  assert.match(REGION, /disabled=\{locked\}/);
});

// display:contents keeps it out of the layout, so wrapping an existing region
// changes nothing about how it looks.
test("the wrapper does not disturb the layout it wraps", () => {
  assert.match(REGION, /contents/, "without this the fieldset becomes a box and the page reflows");
});

// The comboboxes are divs with role="combobox", not native controls, so a
// fieldset cannot reach them. They would stay fully clickable inside a locked
// region, which is the exact fault in a smaller form.
test("the custom comboboxes are covered too, since a fieldset cannot reach them", () => {
  assert.match(REGION, /role=combobox/, "these are divs, not selects, and open on click");
  assert.match(REGION, /pointer-events-none/, "so they have to be stopped from opening");
  assert.match(REGION, /cursor-not-allowed/, "and look locked rather than look normal and refuse to respond");
});

// ── the two editors use it ─────────────────────────────────────────────────

test("the quote editor puts its whole editable body behind the lock", () => {
  assert.match(QUOTE, /import LockedRegion/);
  assert.match(QUOTE, /<LockedRegion locked=\{isLocked/, "not a field at a time, which is how the gaps got in");
});

test("the variation editor puts its whole editable body behind the lock", () => {
  assert.match(VARIATION, /import LockedRegion/);
  assert.match(VARIATION, /<LockedRegion locked=\{!isEditable\}/);
  assert.match(VARIATION, /<\/LockedRegion>/, "an unclosed wrapper covers the rest of the page");
});

// The override is the way OUT of the lock. Wrapping it would disable the only
// button that can unlock the screen, which is a dead end with extra steps.
test("the override button stays clickable inside a locked screen", () => {
  [
    ["the quote editor", QUOTE],
    ["the variation editor", VARIATION],
  ].forEach(([label, source]) => {
    const regionAt = source.indexOf("<LockedRegion");
    const overrideAt = source.indexOf("setOverrideOpen(true)");
    assert.ok(overrideAt >= 0, `${label} has no override button`);
    assert.ok(
      overrideAt < regionAt,
      `${label} puts the override button inside the locked region, so the only way out of the lock is disabled`
    );
  });
});

// ── the screen has to say why ──────────────────────────────────────────────
//
// Greyed out fields with no explanation are their own problem. Somebody looking
// at a dead form needs to know whether it is broken or deliberate.

test("a locked quote says why, and says it differently for the two reasons", () => {
  assert.match(QUOTE, /is with the customer, so it is read only/i, "sealed: they are holding a link");
  assert.match(QUOTE, /has been accepted and is read only/i, "accepted: it is the record of what was agreed");
  assert.match(QUOTE, /raise a variation/i, "and both have to say what to do instead");
  assert.match(QUOTE, /Edit with override/, "the sealed one names the way through");
});

test("a locked variation says why, and says it differently for the two reasons", () => {
  assert.match(VARIATION, /is with the customer, so it is read only/i);
  assert.match(VARIATION, /has been responded to, so it is read only/i);
  assert.match(VARIATION, /raise another variation/i);
});

// The notice must not be tied to one tab. A person on the line items tab seeing
// greyed fields with the explanation on a different section learns nothing.
test("the quote notice sits above every section, not inside one", () => {
  const noticeAt = QUOTE.indexOf("This quote has been accepted and is read only");
  const sectionAt = QUOTE.indexOf("{renderActiveSection()}");
  assert.ok(noticeAt >= 0 && sectionAt >= 0);
  assert.ok(noticeAt < sectionAt, "the notice renders before whichever section is open, so every tab carries it");
});
