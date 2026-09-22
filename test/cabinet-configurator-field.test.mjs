// THE CABINET CONFIGURATOR'S COLOUR PICKERS, AND THE WRAPPER THAT BROKE THEM.
//
// The carcass and shelf "finish and colour" pickers could not be used at all.
// Clicking either one opened nothing and put "Pick the carcass finish and
// colour first" on screen, which is the message the Lookup button shows when
// no colour has been chosen: the field you would have chosen one in.
//
// The cause was the Field wrapper being a <label>. A label forwards every click
// inside it to its labeled control, and the spec defines that as the first
// LABELABLE descendant: button, input, meter, output, progress, select or
// textarea. The picker's trigger is a <div role="combobox">, which is not one.
// The Lookup button beside it is. So every click on the picker pressed Lookup.
//
// ── WHY THIS FILE CHANGED, 21 SEPTEMBER 2026 ─────────────────────────────────
//
// It used to open by saying "These are source checks rather than DOM ones
// because there is no renderer in this suite". There is one now, so the part
// that can be checked in the rendered HTML is checked there. That is worth
// doing because the old version matched a particular spelling of the wrapper's
// className with a regular expression: harmless rewording of the source would
// have failed it, and a label reintroduced in a different shape would have
// passed it.
//
// ── WHAT THE RENDER STILL CANNOT REACH, AND WHY THAT IS SAID OUT LOUD ────────
//
// The two pickers are on the "Boards and labour" tab. A render with no
// interaction shows the "Dimensions" tab, so the pickers, their Lookup buttons
// and their comboboxes are not in the output at all: rendering the blank
// configurator produces fifteen buttons and not one of them is Lookup.
//
// So the rule below is asserted against everything that DOES render, and the
// picker-specific checks stay source checks, honestly labelled. Driving the tab
// would need a real DOM and an event, which this suite still does not have.
// Do not "fix" that by asserting the render contains a Lookup button. It does
// not, and a test written to expect one would simply be wrong.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

const { default: CabinetConfigurator } = await import("../components/admin/CabinetConfigurator.tsx");

const source = readFileSync(new URL("../components/admin/CabinetConfigurator.tsx", import.meta.url), "utf8");

// Rendered once, on a blank cabinet: nothing chosen, which is the state
// somebody adding a cabinet by hand starts in.
const html = renderToStaticMarkup(
  createElement(CabinetConfigurator, {
    lineItemId: "line-1",
    quoteId: "quote-1",
    onSave: () => {},
    onCancel: () => {},
  })
);

/** Anything a person can click or type into, labelable or not. */
const INTERACTIVE = /<(button|input|select|textarea|meter|output|progress)\b|role="(combobox|button|switch|listbox)"|tabindex="0"/g;

function labelsWithoutFor(markup) {
  return [...markup.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/g)]
    .filter((match) => !/htmlFor=|for=/.test(match[1]))
    .map((match) => ({ whole: match[0], inner: match[2] }));
}

// ── The fault itself, checked on what actually renders ───────────────────────

test("no label holds more than one thing to click", () => {
  // A label with no htmlFor sends every click inside it to its first labelable
  // descendant. With exactly one control in there that is correct and normal:
  // <label><input type="checkbox">Corner cabinet</label> is the right way to
  // write a checkbox. With TWO, one of them is being clicked on behalf of the
  // other, and that is precisely what happened to the colour pickers: the
  // combobox and the Lookup button shared a label, so the combobox was
  // unreachable and every click on it pressed Lookup.
  const offenders = labelsWithoutFor(html).filter((label) => {
    const found = label.inner.match(INTERACTIVE) || [];
    return found.length > 1;
  });

  assert.deepEqual(
    offenders.map((o) => o.whole.slice(0, 120)),
    [],
    "a label with no htmlFor and two controls inside it makes one of them unclickable"
  );
});

test("the configurator renders, so the check above proved something", () => {
  // Without this, the assertion above passes trivially if the component renders
  // nothing, and the file becomes a test that can never fail.
  assert.ok(html.length > 0, "rendered nothing at all");
  assert.ok(labelsWithoutFor(html).length > 0, "rendered no bare labels, so there was nothing to check");
});

// ── The parts the render cannot reach ────────────────────────────────────────
//
// Source checks, and said so. See the note at the top of this file.

test("the Field wrapper is not a label (source check: Field renders on another tab)", () => {
  const fieldBlock = source.slice(source.indexOf("function Field("));
  const fieldBody = fieldBlock.slice(0, fieldBlock.indexOf("\nfunction "));
  assert.ok(fieldBody.includes("function Field("), "Field must still exist to be checked");
  assert.ok(
    /<div className=\{`flex flex-col/.test(fieldBody),
    "the wrapper has to be a plain element, so a click lands on whatever was actually clicked"
  );
});

test("Field can still name a real control by id (source check)", () => {
  const fieldBlock = source.slice(source.indexOf("function Field("));
  const fieldBody = fieldBlock.slice(0, fieldBlock.indexOf("\nfunction "));
  assert.ok(fieldBody.includes("htmlFor"), "the escape hatch for genuine native inputs must remain");
  assert.ok(
    /<label className=\{caption\} htmlFor=\{htmlFor\}>/.test(fieldBody),
    "pointing AT a control by id is the association that does not swallow other clicks"
  );
});

test("both colour pickers still sit beside their Lookup button (source check)", () => {
  const lookups = source.match(/lookupMaterialCost\("(carcass|shelf)"\)/g) || [];
  assert.ok(lookups.length >= 2, "the carcass and the shelf each keep a Lookup button");
});

// A thickness the board is not made in returns no colours from the library, so
// the picker comes up empty with no way to reach a thickness that would fill
// it. The toggle has to offer what the chosen board actually comes in.
test("the thickness toggles are driven by the board, not hardcoded (source check)", () => {
  assert.ok(source.includes("thicknessOptionsForMaterial"), "thicknesses come from the material vocabulary");
  assert.ok(source.includes("options={carcassThicknesses}"), "the carcass toggle offers the carcass board's thicknesses");
  assert.ok(source.includes("options={shelfThicknesses}"), "the shelf toggle offers the shelf board's thicknesses");
});
