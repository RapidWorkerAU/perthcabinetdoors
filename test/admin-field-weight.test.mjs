/*
 * A LABEL IS BOLD. WHAT SOMEBODY TYPES INTO IT IS NOT.
 *
 * Every form control on the admin sits inside its own label element, and the
 * label is bold so it reads as a heading for the field. The shared control rule
 * then says `font: inherit`, which is a shorthand and carries font-weight with
 * it, so the label's weight came straight back down into the control. Notes,
 * sizes, colours and prices all rendered bold, as though the value had been
 * emphasised on purpose. It showed up first in the line notes modal on
 * quotes/[id], but it was every form on the admin.
 *
 * Pinned here because the fix is one declaration that is easy to lose in a
 * later tidy of that rule, and because the same fault has to stay fixed in both
 * places the editor styles a field: the CSS module and the Tailwind twin.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Read with the carriage returns taken out, so a selector written across lines
// below matches whichever line ending the file happens to be saved with.
const CR = String.fromCharCode(13);
const CSS = fs.readFileSync(new URL("../app/admin/admin-content.module.css", import.meta.url), "utf8").split(CR).join("");
const EDITOR = fs.readFileSync(new URL("../app/admin/quotes/[id]/QuoteEditor.js", import.meta.url), "utf8");

/** The declarations inside the rule whose selector list contains `selector`. */
function ruleBodyContaining(css, selector) {
  const at = css.indexOf(selector);
  assert.notEqual(at, -1, selector + " has gone from the stylesheet");
  const open = css.indexOf("{", at);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

test("the shared control rule resets the weight it inherits", () => {
  const body = ruleBodyContaining(CSS, ".textareaInput,\n.statusSelect,\n.customerSearchInput");
  assert.ok(body.includes("font: inherit"), "the rule no longer inherits, check whether the reset is still needed");
  assert.ok(body.includes("font-weight: 400"), "controls are inheriting the label's bold weight again");
  // Order matters: `font` is a shorthand, so a reset written above it is undone.
  assert.ok(
    body.indexOf("font-weight: 400") > body.indexOf("font: inherit"),
    "font-weight must be set after the font shorthand or the shorthand wins"
  );
});

test("the label itself is still bold", () => {
  // The point is the contrast between the two, so a fix that flattened both
  // would be no fix at all.
  const body = ruleBodyContaining(CSS, ".fieldLabel,\n.checkboxRow");
  assert.ok(body.includes("font-weight: 600"));
});

test("the quote editor's Tailwind fields say the same thing", () => {
  const tw = EDITOR.slice(EDITOR.indexOf("  fieldLabel: \""), EDITOR.indexOf("  grid2: \""));
  assert.ok(tw.includes("font-medium"), "the Tailwind label is no longer bold, check the reset is still needed");
  ["fieldInput: \"", "textarea: \""].forEach((key) => {
    const at = tw.indexOf(key);
    assert.notEqual(at, -1, key + " has gone from the editor's style map");
    const line = tw.slice(at, tw.indexOf("\n", at));
    assert.ok(line.includes("font-normal"), key + " inherits the label's weight and renders bold");
  });
});
