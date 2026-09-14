/*
 * WHAT A LINE IS ASKED, AND IN WHAT ORDER.
 *
 * Which questions a line gets is not one rule, it is six, and they lived in six
 * modules with nothing putting them together. So every screen that asked
 * somebody to describe a line re-derived the chain by hand and they drifted:
 * the public form asked for an edge mould on compact laminate, which takes
 * none; it asked about hinges on a scribe, which is never drilled; and it never
 * asked which kind of panel at all.
 *
 * lib/pcd-quote-steps.js is the one place that composes them. Nothing in it
 * invents a rule, so these tests are really asking one thing: does the
 * composition still say what the six modules underneath it say.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  answerLine,
  asksFor,
  isBanded,
  narrowLine,
  quoteItemTypes,
  stepsForLine,
} from "../lib/pcd-quote-steps.js";
import { PANEL_USES } from "../lib/pcd-line-details.js";
import { EDGE_FINISHES } from "../lib/pcd-line-details.js";

const keys = (line) => stepsForLine(line).map((s) => s.key);
const door = (over = {}) => ({ productType: "Door", material: "Decorative Board", thickness: "18mm", ...over });

// ── What a customer may say they want ────────────────────────────────────────

test("the list offers every panel use under Panel", () => {
  const types = quoteItemTypes();
  assert.deepEqual(types.map((t) => t.value), [
    "Door", "Drawer front", "Panel",
    ...PANEL_USES.map((u) => `Panel :: ${u}`),
    "Table top", "Hardware",
  ]);
});

test("a panel use is a Panel that says which kind, not a type of its own", () => {
  const scribe = quoteItemTypes().find((t) => t.label === "Scribe");
  assert.equal(scribe.productType, "Panel");
  assert.equal(scribe.panelUse, "Scribe");
});

test("a staff only type is never offered", () => {
  // Laminate is marked internal so it can sit on the quote editor without a
  // customer picking it instead of decorative board.
  const values = quoteItemTypes().map((t) => t.value);
  assert.ok(!values.includes("Laminate"));
  assert.ok(!values.includes("base_cabinet"));
});

// ── The chain ────────────────────────────────────────────────────────────────

test("a thermolaminate door is asked about its routed face", () => {
  assert.deepEqual(keys(door({ material: "Thermolaminate" })), [
    "itemType", "cabinetBrand", "material", "supplier", "thickness", "colour",
    "frontProfile", "edgeMould", "size", "hinges", "qty", "notes",
  ]);
});

test("a decorative board door is asked which edges are banded, and not about a routed face", () => {
  assert.deepEqual(keys(door()), [
    "itemType", "cabinetBrand", "material", "supplier", "thickness", "colour",
    "edgeMould", "size", "bandedEdges", "hinges", "qty", "notes",
  ]);
});

test("brand sits between the board and its thickness", () => {
  // It narrows both of the questions under it. The thickness rules run in
  // OPPOSITE directions between the ranges and the colours are not shared, so a
  // thickness list built before a brand is known is a list of the wrong sizes.
  const order = keys(door());
  assert.ok(order.indexOf("material") < order.indexOf("supplier"));
  assert.ok(order.indexOf("supplier") < order.indexOf("thickness"));
  assert.ok(order.indexOf("supplier") < order.indexOf("colour"));
});

test("banding is asked after the size, so the drawing can show it", () => {
  const order = keys(door());
  assert.ok(order.indexOf("size") < order.indexOf("bandedEdges"));
});

test("compact laminate takes no mould and no tape", () => {
  // Solid through the thickness. There is nothing to band and nothing to rout.
  const steps = keys(door({ material: "Compact Laminate", thickness: "13mm" }));
  assert.ok(!steps.includes("edgeMould"));
  assert.ok(!steps.includes("bandedEdges"));
  assert.ok(!steps.includes("frontProfile"));
});

test("only a door is drilled", () => {
  assert.ok(keys(door()).includes("hinges"));
  for (const productType of ["Drawer front", "Panel", "Table top"]) {
    assert.ok(!keys(door({ productType })).includes("hinges"), `${productType} was asked about hinges`);
  }
  for (const use of PANEL_USES) {
    const line = door({ productType: "Panel", panelUse: use });
    assert.ok(!keys(line).includes("hinges"), `a ${use} was asked about hinges`);
  }
});

test("a table top is never routed", () => {
  const steps = keys({ productType: "Table top", material: "Decorative Board", thickness: "18mm" });
  assert.ok(!steps.includes("frontProfile"));
});

test("hardware is asked almost nothing", () => {
  // Which cabinet it is going on is the one thing hardware is still asked, and
  // it is optional. Everything else about it is a board question.
  assert.deepEqual(keys({ productType: "Hardware" }), [
    "itemType", "cabinetBrand", "hardwareType", "qty", "notes",
  ]);
});

test("a step with nothing to offer is not asked at all", () => {
  // An empty dropdown is a question somebody tries to answer and cannot.
  for (const step of stepsForLine(door({ material: "Thermolaminate" }))) {
    if (step.options === null) continue;
    assert.ok(step.options.length > 0, `${step.key} was offered with no options`);
  }
});

test("banding follows the board, not the product", () => {
  assert.equal(isBanded("Decorative Board"), true);
  assert.equal(isBanded("decorative board"), true);
  assert.equal(isBanded("Thermolaminate"), false);
  assert.equal(isBanded("Compact Laminate"), false);
  assert.equal(asksFor(door(), "bandedEdges"), true);
  assert.equal(asksFor(door({ material: "Thermolaminate" }), "bandedEdges"), false);
});

// ── Narrowing ────────────────────────────────────────────────────────────────

test("an answer that is still valid is kept", () => {
  // Resetting a field somebody filled in, when it is still a legal answer,
  // throws away their work for nothing.
  const line = narrowLine(door({ thickness: "16mm" }));
  assert.equal(line.thickness, "16mm");
});

test("an answer the new board cannot take is moved", () => {
  const line = narrowLine(door({ material: "Thermolaminate", thickness: "16mm" }));
  assert.ok(["18mm", "21mm"].includes(line.thickness), "16mm is not a thermolaminate thickness");
});

test("dropping to 18mm gives up a 21mm only profile", () => {
  let line = narrowLine(door({ material: "Thermolaminate", thickness: "21mm", profileType: "Fluted", profile: "Peak" }));
  assert.equal(line.profileType, "Fluted");
  line = answerLine(line, "thickness", "18mm");
  assert.notEqual(line.profileType, "Fluted", "Fluted is 21mm only");
  assert.ok(line.profile, "and it should land on a profile that does exist");
});

test("moving to a board with no routed face clears the profile", () => {
  const line = answerLine(
    narrowLine(door({ material: "Thermolaminate", profileType: "Sharp", profile: "Amsterdam" })),
    "material",
    "Compact Laminate"
  );
  assert.equal(line.profileType, "");
  assert.equal(line.profile, "");
  assert.equal(line.edgeMould, "", "compact laminate takes no mould either");
});

test("moving off decorative board takes the tape with it", () => {
  const line = answerLine(narrowLine(door({ bandedEdges: ["Top", "Left"] })), "material", "Thermolaminate");
  assert.equal(line.bandedEdges, null, "a wrapped front has no taped edges");
});

test("a table top cannot stay on thermolaminate", () => {
  const line = answerLine(narrowLine(door({ material: "Thermolaminate" })), "itemType", "Table top");
  assert.notEqual(line.material, "Thermolaminate");
});

test("picking a panel use sets both fields, and leaving Panel clears it", () => {
  let line = answerLine(door(), "itemType", "Panel :: Scribe");
  assert.equal(line.productType, "Panel");
  assert.equal(line.panelUse, "Scribe");
  line = answerLine(line, "itemType", "Door");
  assert.equal(line.panelUse, "");
});

test("a line that is not drilled cannot want a boring", () => {
  const line = answerLine(narrowLine(door({ hingeHoles: true, holeType: "Blum Inserta" })), "itemType", "Panel :: Filler");
  assert.equal(line.hingeHoles, false);
  assert.equal(line.holeType, "");
});

test("switching to hardware drops every board answer", () => {
  const line = answerLine(narrowLine(door({ profileType: "Sharp", bandedEdges: ["Top"] })), "itemType", "Hardware");
  for (const field of ["material", "thickness", "finish", "colour", "profileType", "profile", "edgeMould"]) {
    assert.equal(line[field], "", `${field} survived the switch to hardware`);
  }
  assert.equal(line.bandedEdges, null);
  assert.equal(line.height, null);
});

test("narrowing is settled: running it twice changes nothing", () => {
  // If a second pass moved something, the first pass left the line invalid.
  for (const start of [
    door(),
    door({ material: "Thermolaminate", thickness: "21mm" }),
    door({ productType: "Table top" }),
    door({ productType: "Hardware" }),
    door({ productType: "Panel", panelUse: "Kickboard" }),
  ]) {
    const once = narrowLine(start);
    assert.deepEqual(narrowLine(once), once, JSON.stringify(start) + " was not settled after one pass");
  }
});

test("the old three phrase edge answer is still a phrase the line knows", () => {
  // banded_edges is the exact answer; edge_finish is derived from it and every
  // existing screen still reads that one.
  assert.ok(EDGE_FINISHES.includes("All four edges"));
  assert.ok(EDGE_FINISHES.includes("Leave one edge raw, see notes"));
});

/* ═══════════════════════════════════════════════════════════════════════════
   THE PUBLIC FORM ASKS THEM, AND SENDS THEM

   The three answers the form could never give: which kind of panel, which edges
   are taped, and which hinge boring. Read off the source, because the value is
   in the wiring being present at all rather than in any one line of markup.
   ═══════════════════════════════════════════════════════════════════════════ */

const FORM = readFileSync(new URL("../app/(site)/request-quote/RequestQuoteFormClient.js", import.meta.url), "utf8");

test("a new line has somewhere to put all three", () => {
  const empty = FORM.slice(FORM.indexOf("function emptyItem"), FORM.indexOf("function value(formData"));
  assert.match(empty, /panelUse: ""/);
  assert.match(empty, /bandedEdges: null/, "null, not [], so not asked stays distinguishable");
  assert.match(empty, /holeType: ""/);
});

test("the chooser offers the panel uses", () => {
  assert.match(FORM, /types=\{quoteItemTypes\(\)\}/, "it still offers only the five product types");
  assert.ok(!FORM.includes("types={productTypeChoices(PRODUCT_TYPES)}"), "the old list is still wired in");
});

test("picking a panel use sets both fields and neither is left stale", () => {
  const fn = FORM.slice(FORM.indexOf("function chooseType"), FORM.indexOf("function chooseType") + 1400);
  assert.match(fn, /String\(value\)\.split\(" :: "\)/, "one answer has to set two fields");
  assert.match(fn, /panelUse,/, "the new use is written onto the row");
  assert.match(fn, /row\.type === type && row\.panelUse === panelUse/, "changing only the use has to count as a change");
});

test("the tape and the boring go when the question stops being asked", () => {
  const at = FORM.indexOf("function chooseType");
  const fn = FORM.slice(at, FORM.indexOf("setLineErrors", at));
  assert.ok(fn.includes(`holeType: next.hinges ? row.holeType : ""`), "a boring survived a type that is not drilled");
  assert.ok(fn.includes("bandedEdges: next.edge && keepsBoard ? row.bandedEdges : null"), "tape survived a type with no edges");
});

test("the edges question is asked through the shared rule, not a local guess", () => {
  // A local copy is how the six rules drifted in the first place.
  assert.match(FORM, /asksFor\(\{ productType: editingItem\.type, material: editingItem\.material \}, "bandedEdges"\)/);
});

test("the boring is only asked on a door that is being drilled", () => {
  // The hinge questions are the shared component the shop asks them with too,
  // so the rule is checked where it now lives, and the form must still use it.
  const HINGES = readFileSync(new URL("../app/(site)/_builder/HingeFields.js", import.meta.url), "utf8");
  const drilled = HINGES.indexOf("{item.preDrill ? (");
  const boring = HINGES.indexOf("What kind of hole");
  assert.ok(drilled !== -1 && boring > drilled, "the boring question sits inside the drilled branch");
  assert.match(FORM, /<HingeFields item={editingItem}/, "and the quote form asks through it");
});

test("all three are sent", () => {
  // What goes to the endpoint moved to lib/pcd-quote-request-payload.js when
  // sending moved to /request-quote/send. The rule did not move: an answer to a
  // question we never put is still not sent.
  const payload = readFileSync(new URL("../lib/pcd-quote-request-payload.js", import.meta.url), "utf8");
  assert.match(payload, /panelUse: item\.panelUse \|\| ""/);
  assert.match(
    payload,
    /bandedEdges: Array\.isArray\(item\.bandedEdges\) \? item\.bandedEdges : undefined/,
    "an unasked tape answer must be absent, not empty"
  );
  assert.match(payload, /const drilled = item\.type === "Door" && Boolean\(item\.preDrill\)/);
  assert.match(payload, /holeType: drilled \? item\.holeType \|\| "" : ""/);
});

test("the four toggles have somewhere to be styled", () => {
  const css = readFileSync(new URL("../app/(site)/contact/contact.module.css", import.meta.url), "utf8");
  for (const cls of ["edgeToggles", "edgeToggle", "edgeToggleOn", "fieldHint"]) {
    assert.ok(css.includes("." + cls), "." + cls + " is used by the form and defined nowhere");
  }
  // Four across, never a ragged two and one, and two across on a phone.
  assert.match(css, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /repeat\(2, minmax\(0, 1fr\)\)/);
});

// ── THE COLOUR PICKER FILLS ITS QUESTION ────────────────────────────────────
//
// 13 September 2026. The finish buttons and the colour tiles drew at half the
// width of every other question on the page: four to a row in a field wide
// enough for eight. The field around them was still the two-column grid built
// for the control that used to live there, a pair of side-by-side boxes with
// the label spanning both. The shared picker is one full-width stack, so it
// landed in column one and stopped.

test("the colour field is one column, so the picker fills it", () => {
  const css = readFileSync(new URL("../app/(site)/contact/contact.module.css", import.meta.url), "utf8");
  const rule = css.match(/\.productModalColourField \{[^}]*\}/);
  assert.ok(rule, "the colour field is still styled here");
  assert.match(rule[0], /grid-template-columns: minmax\(0, 1fr\)/);
  assert.ok(!/repeat\(2/.test(rule[0]), "not two columns any more");
  // And anything in it spans the field, not just the label.
  assert.match(css, /\.productModalColourField > \*\s*\{\s*grid-column: 1 \/ -1;/);
});

test("no question is stamped with a class that does not exist", () => {
  // styles.step is undefined in contact.module.css, so every question after
  // the first carried a literal "undefined" class in the DOM.
  ["app/(site)/products/[slug]/ShopProductClient.js", "app/(site)/request-quote/RequestQuoteFormClient.js"]
    .forEach((path) => {
      const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
      assert.ok(!/styles\.step\b/.test(source), `${path} no longer reaches for a class that is not there`);
      assert.match(source, /className=\{index \? styles\.stepRuled : undefined\}/);
    });
});
