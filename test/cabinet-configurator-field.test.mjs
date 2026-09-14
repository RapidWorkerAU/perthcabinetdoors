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
// These are source checks rather than DOM ones because there is no renderer in
// this suite, and the thing worth locking is structural: a wrapper around mixed
// content must not be a label.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../components/admin/CabinetConfigurator.tsx", import.meta.url), "utf8");

// The declaration and its body, up to the next top-level function.
const fieldBlock = source.slice(source.indexOf("function Field("));
const fieldBody = fieldBlock.slice(0, fieldBlock.indexOf("\nfunction "));

test("Field does not wrap its children in a label", () => {
  assert.ok(fieldBody.includes("function Field("), "Field must still exist to be checked");
  assert.equal(
    /<label[^>]*>\s*\n?\s*\{?\s*(?:<span|\{label\})/.test(fieldBody) && !fieldBody.includes("htmlFor={htmlFor}"),
    false,
    "a label wrapping the row forwards clicks to the first labelable child, which is not the control the caption names"
  );
  assert.ok(
    /<div className=\{`flex flex-col/.test(fieldBody),
    "the wrapper has to be a plain element, so a click lands on whatever was actually clicked"
  );
});

test("Field can still associate a caption with a real control, by id", () => {
  assert.ok(fieldBody.includes("htmlFor"), "the escape hatch for genuine native inputs must remain");
  assert.ok(
    /<label className=\{caption\} htmlFor=\{htmlFor\}>/.test(fieldBody),
    "pointing AT a control by id is the association that does not swallow other clicks"
  );
});

// The two pickers are the reason this file exists. Each sits in a row beside a
// Lookup button, which is exactly the arrangement the label broke.
test("both colour pickers still sit beside their Lookup button", () => {
  const lookups = source.match(/lookupMaterialCost\("(carcass|shelf)"\)/g) || [];
  assert.ok(lookups.length >= 2, "the carcass and the shelf each keep a Lookup button");
});

// A thickness the board is not made in returns no colours from the library, so
// the picker comes up empty with no way to reach a thickness that would fill
// it. The toggle has to offer what the chosen board actually comes in.
test("the thickness toggles are driven by the board, not hardcoded", () => {
  assert.ok(
    source.includes("thicknessOptionsForMaterial"),
    "thicknesses come from the material vocabulary"
  );
  assert.ok(
    source.includes("options={carcassThicknesses}"),
    "the carcass toggle offers the carcass board's thicknesses"
  );
  assert.ok(
    source.includes("options={shelfThicknesses}"),
    "the shelf toggle offers the shelf board's thicknesses"
  );
});
