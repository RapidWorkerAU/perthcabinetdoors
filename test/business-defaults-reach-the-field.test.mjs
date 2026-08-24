// A DEFAULT THAT IS APPLIED BUT NOT SHOWN IS A DEAD END.
//
// Every business default ends up in a figure on a quote. The rule these tests
// hold is that the figure lands in the FIELD, so it can be read, changed and
// cleared, rather than being applied behind a box that shows something else.
//
// Two ways it was broken:
//
//   the ABS edging cost   the calculated figure was the input's PLACEHOLDER, so
//                         the box was empty when you clicked into it and there
//                         was nothing to edit.
//   the labour hours      the box held a "manual" figure that automatic hours
//                         were added to, so the total on screen was one nobody
//                         could change. Clearing the box did not clear the
//                         hours.
//
// Both are now the same rule: the box shows the calculated figure, typing pins
// it, clearing goes back to following the lines.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { calculateQuoteLine, calculateQuoteTotals, DEFAULT_BUSINESS_DEFAULTS } from "../lib/pcd-quote-utils.js";

const EDITOR = readFileSync(new URL("../app/admin/quotes/[id]/QuoteEditor.js", import.meta.url), "utf8");
const IMPORTER = readFileSync(new URL("../app/api/admin/design/projects/[projectId]/import/route.js", import.meta.url), "utf8");

const DEFAULTS = {
  ...DEFAULT_BUSINESS_DEFAULTS,
  worker_hourly_rate: 85,
  labour_hours_per_cabinet: 2.5,
  inhouse_processing_hours_per_piece: 0.5,
  abs_edging_cost_per_lineal_metre_ex_gst: 2.5,
};

const panel = (over = {}) => ({
  product_type: "Panel", material: "Decorative Board", width_mm: 600, height_mm: 850, qty: 1, ...over,
});

// ── the figure has to be in the box ─────────────────────────────────────────

test("the calculated figure is what the boxes are filled with, not a placeholder", () => {
  assert.match(EDITOR, /value=\{labourFieldValue\}/);
  assert.match(EDITOR, /value=\{edgingFieldValue\}/);
  assert.match(EDITOR, /labourFieldValue = showsTyped\("labour_hours", labourOverridden\)[\s\S]{0,120}totals\.calculated_labour_hours/);
  assert.match(EDITOR, /edgingFieldValue = showsTyped\("edging_cost_override_ex_gst", edgingOverridden\)[\s\S]{0,160}totals\.edging_calculated_cost_ex_gst/);
  // The placeholder that used to ghost the figure behind an empty box.
  assert.ok(
    !EDITOR.includes("placeholder={String(totals.edging_calculated_cost_ex_gst"),
    "the edging cost is a placeholder again"
  );
});

// ── and it has to be possible to empty it ─────────────────────────────────
//
// Showing the calculated figure whenever the box is blank made the box
// impossible to clear: backspace over the last character and "blank" meant
// "follow the lines", so the figure went straight back in on the next render.
// Selecting the number and typing over it worked, because that never passes
// through blank. Deleting it did not.
test("a calculated box holds an empty box while somebody is clearing it", () => {
  assert.match(EDITOR, /const showsTyped = \(field, overridden\) => overridden \|\| focusedField === field/);
  assert.match(EDITOR, /onFocus=\{\(\) => setFocusedField\("labour_hours"\)\}/);
  assert.match(EDITOR, /onFocus=\{\(\) => setFocusedField\("edging_cost_override_ex_gst"\)\}/);
  // Leaving it empty is what puts it back to following the lines.
  assert.match(EDITOR, /onBlur=\{\(\) => setFocusedField\(""\)\}/);
});

// A cost of nothing is an empty box. Stored as a number, a cleared cost came
// back as "0" typed in the box, which is the same complaint one save later.
test("a cost cleared to nothing comes back empty, not as a zero", () => {
  assert.match(EDITOR, /function costForForm\(value\) \{[\s\S]{0,80}Number\(value\) > 0 \? value : ""/);
  assert.match(EDITOR, /travel_cost_ex_gst: costForForm\(quote\.travel_cost_ex_gst\)/);
  assert.match(EDITOR, /removal_cost_ex_gst: costForForm\(quote\.removal_cost_ex_gst\)/);
});

test("both boxes can be put back to the calculated figure", () => {
  // Without this, typing over a calculated figure is a one way door.
  assert.match(EDITOR, /Reset to calculated/);
  assert.match(EDITOR, /updateForm\("labour_hours", ""\)/);
  assert.match(EDITOR, /updateForm\("edging_cost_override_ex_gst", ""\)/);
});

test("a blank box is saved as nothing, not as a zero that pins the hours", () => {
  assert.match(EDITOR, /manual_labour_hours: String\(nextForm\.labour_hours \?\? ""\)\.trim\(\) === "" \? null : Number\(nextForm\.labour_hours\)/);
});

// ── the arithmetic behind them ──────────────────────────────────────────────

test("two panels at half an hour each is one hour", () => {
  // The reported fault: this came out at four.
  const totals = calculateQuoteTotals([panel(), panel()], 0.1, { business_defaults: DEFAULTS });
  assert.equal(totals.calculated_labour_hours, 1);
  assert.equal(totals.labour_hours, 1);
  assert.equal(totals.labour_cost_ex_gst, 85);
});

test("pricing the same lines again does not change the answer", () => {
  // Every route to a quote calculates the lines and then totals them, which
  // calculates them again. That must not count the labour twice.
  const once = [panel(), panel()].map((line) => calculateQuoteLine(line, DEFAULTS));
  const twice = once.map((line) => calculateQuoteLine(line, DEFAULTS));
  const thrice = twice.map((line) => calculateQuoteLine(line, DEFAULTS));
  assert.equal(calculateQuoteTotals(once, 0.1, { business_defaults: DEFAULTS }).labour_hours, 1);
  assert.equal(calculateQuoteTotals(twice, 0.1, { business_defaults: DEFAULTS }).labour_hours, 1);
  assert.equal(calculateQuoteTotals(thrice, 0.1, { business_defaults: DEFAULTS }).labour_hours, 1);
});

test("the labour hours a person types survive being recalculated", () => {
  const first = calculateQuoteTotals([panel(), panel()], 0.1, { business_defaults: DEFAULTS, manual_labour_hours: 6 });
  assert.equal(first.labour_hours, 6);
  const second = calculateQuoteTotals([panel(), panel()], 0.1, {
    business_defaults: DEFAULTS,
    manual_labour_hours: first.manual_labour_hours,
    labour_hours: first.labour_hours,
  });
  assert.equal(second.labour_hours, 6);
});

test("clearing the labour hours goes back to the calculated figure", () => {
  const cleared = calculateQuoteTotals([panel(), panel()], 0.1, { business_defaults: DEFAULTS, manual_labour_hours: null });
  assert.equal(cleared.labour_hours, 1);
  assert.equal(cleared.labour_hours_overridden, false);
});

// ── an hourly rate of zero ──────────────────────────────────────────────────

test("a stored hourly rate of zero prices at the configured rate, and the field says so too", () => {
  // normalizeBusinessDefaults has always treated a 0 rate as an unfilled column
  // rather than free labour. The form did not, so the quote charged $85 an hour
  // while the box on screen said $0.
  const totals = calculateQuoteTotals([panel(), panel()], 0.1, {
    business_defaults: DEFAULTS,
    worker_hourly_rate: 0,
  });
  assert.equal(totals.worker_hourly_rate, 85);
  assert.match(EDITOR, /const isBlankOrZero = \(value\) => isBlank\(value\) \|\| Number\(value\) === 0;/);
  assert.match(EDITOR, /worker_hourly_rate: isBlankOrZero\(current\.worker_hourly_rate\)/);
});

// ── what the design tool hands over ─────────────────────────────────────────

test("a cabinet imported from a design carries the quote editor's material spelling", () => {
  // The design tool stores "decorative board"; the editor's dropdown, its
  // thickness list and its edge validation all match "Decorative Board". Every
  // other line type was converted; a cabinet returned before reaching it.
  const cabinetBranch = IMPORTER.slice(
    IMPORTER.indexOf("function withCalculatedCabinetCost"),
    IMPORTER.indexOf("function designItemToLine")
  );
  assert.match(cabinetBranch, /material: materialLabelForType\(line\.material \|\| ""\)/);
});

test("a line imported from a design is tagged back to it", () => {
  // What makes re-importing REPLACE those lines instead of adding a second copy
  // of the whole design.
  assert.match(IMPORTER, /design_item_id: itemId, design_project_id: projectId/);
});

// ── the markup a line is born with ──────────────────────────────────────────
//
// businessDefaults starts as the built-in constants and is replaced when the
// settings arrive from the server. A line added in that gap was stamped with
// the built-in 40% and nothing ever put it right, because the effect that fills
// in defaults only touches a BLANK markup and 40 is not blank. It then looked
// exactly like a rate somebody had chosen.

test("a blank markup means the business default, not nothing", () => {
  // Number("") is 0, so a line waiting for its default would have been a 0%
  // markup rather than the configured one.
  const line = { product_type: "Door", material: "Thermolaminate", qty: 1, width_mm: 600, height_mm: 700, product_unit_cost_ex_gst: 100, markup_percent: "" };
  const priced = calculateQuoteLine(line, { ...DEFAULTS, markup_percent: 75 });
  assert.equal(priced.markup_percent, 75);
  assert.equal(priced.markup_amount_ex_gst, 75);
});

test("a typed 0% markup is a real answer and stays 0", () => {
  const line = { product_type: "Door", material: "Thermolaminate", qty: 1, product_unit_cost_ex_gst: 100, markup_percent: 0 };
  const priced = calculateQuoteLine(line, { ...DEFAULTS, markup_percent: 75 });
  assert.equal(priced.markup_percent, 0);
  assert.equal(priced.markup_amount_ex_gst, 0);
});

test("a new line never carries the built-in markup", () => {
  // The built-in 40% and a configured 40% are indistinguishable once written to
  // a line, so the line is left blank until the real settings are in.
  assert.match(EDITOR, /function emptyLineWithDefaults\(defaults, loaded = false\)/);
  assert.match(EDITOR, /loaded && defaults\?\.markup_percent != null \? defaults\.markup_percent : ""/);
  assert.match(EDITOR, /const \[defaultsLoaded, setDefaultsLoaded\] = useState\(false\)/);
  assert.match(EDITOR, /setDefaultsLoaded\(true\)/);
  // And every place a line is made knows whether the settings actually arrived.
  assert.ok(
    !/emptyLineWithDefaults\(businessDefaults\)/.test(EDITOR),
    "a call site still assumes the defaults are loaded"
  );
});
