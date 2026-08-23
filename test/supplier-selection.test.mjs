// PICK THE SUPPLIER FIRST. EVERYTHING ELSE FOLLOWS FROM IT.
//
// A door is one brand's colour pressed onto that brand's profile. The ranges
// cannot be mixed, and Laminex makes no edge profiles at all.
//
// Every screen used to offer every colour and every profile in one list and
// trust whoever was filling it in to know which went together. The first anybody
// finds out is when the door arrives.
//
// These tests are shared ground for the public quote form, the quote editor and
// the variation editor. All three ask this module, so none of them can decide
// differently what a valid line looks like.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  coloursForSupplier,
  edgesForSupplier,
  fieldsClearedBySupplierChange,
  profileCategoriesForSupplier,
  profilesForSupplier,
  supplierConflicts,
  supplierOffersEdges,
  supplierOffersProfiles,
  suppliersForMaterial,
} from "../lib/pcd-supplier-selection.js";

const COLOURS = [
  { name: "Amaro", supplier_name: "Polytec", material_type: "thermolaminate" },
  { name: "Greige", supplier_name: "Polytec", material_type: "thermolaminate" },
  { name: "Domino", supplier_name: "Laminex", material_type: "thermolaminate" },
  { name: "Chalk", supplier_name: "Laminex", material_type: "decorative board" },
];

const PROFILES = [
  { kind: "door", supplier_name: "Polytec", category: "Soft", name: "Albury", available_18mm: true, available_21mm: true },
  { kind: "door", supplier_name: "Polytec", category: "Detailed", name: "Allandale", available_18mm: false, available_21mm: true },
  { kind: "door", supplier_name: "Polytec", category: "Detailed", name: "Country Square", available_18mm: true, available_21mm: true },
  { kind: "door", supplier_name: "Laminex", category: "Series 3: Pocket Routered Doors", name: "Shaker", available_18mm: true, available_21mm: false },
  { kind: "door", supplier_name: "Laminex", category: "Series 2: Recessed Handles and Face Routered Doors", name: "Country Square", available_18mm: true, available_21mm: false },
  { kind: "door", supplier_name: "Laminex", category: "Series 3: Pocket Routered Doors", name: "Retired One", available_18mm: true, is_active: false },
  { kind: "edge", supplier_name: "Polytec", category: "Thermolaminate", name: "EM1 6mm Pencil Round" },
  { kind: "edge", supplier_name: "Polytec", category: "Decorative Board", name: "1mm Bevel Edge" },
];

// ── which brands are on offer ──────────────────────────────────────────────

test("the supplier list is derived from the colours, not written down anywhere", () => {
  assert.deepEqual(suppliersForMaterial(COLOURS, "thermolaminate"), ["Laminex", "Polytec"]);
  assert.deepEqual(suppliersForMaterial(COLOURS, "decorative board"), ["Laminex"], "only Laminex stocks this here");
});

// Adding Formica has to be adding rows and nothing else. This proves it.
test("a brand appears the moment its first colour exists", () => {
  const withFormica = [...COLOURS, { name: "Oyster", supplier_name: "Formica", material_type: "thermolaminate" }];
  assert.deepEqual(suppliersForMaterial(withFormica, "thermolaminate"), ["Formica", "Laminex", "Polytec"]);
});

test("no material means every brand we stock", () => {
  assert.deepEqual(suppliersForMaterial(COLOURS), ["Laminex", "Polytec"]);
});

// ── what one brand offers ──────────────────────────────────────────────────

test("colours narrow to the chosen brand", () => {
  assert.deepEqual(coloursForSupplier(COLOURS, "Polytec").map((c) => c.name), ["Amaro", "Greige"]);
  assert.deepEqual(coloursForSupplier(COLOURS, "Laminex").map((c) => c.name), ["Domino", "Chalk"]);
});

test("nothing is offered until a brand is chosen", () => {
  assert.deepEqual(coloursForSupplier(COLOURS, ""), [], "an unfiltered list is how the mixing happened");
  assert.deepEqual(profilesForSupplier(PROFILES, { supplier: "" }), []);
  assert.deepEqual(edgesForSupplier(PROFILES, { supplier: "" }), []);
});

test("profiles narrow to the chosen brand and drop retired ones", () => {
  const names = profilesForSupplier(PROFILES, { supplier: "Laminex" }).map((p) => p.name);
  assert.deepEqual(names, ["Shaker", "Country Square"], "a hidden profile stays on old quotes, not on new ones");
});

// The thickness rules run in OPPOSITE directions between the ranges, which is
// why they are read off each row rather than inferred from the brand.
test("18mm hides the Polytec profiles that are 21mm only", () => {
  const names = profilesForSupplier(PROFILES, { supplier: "Polytec", thickness: "18mm" }).map((p) => p.name);
  assert.ok(!names.includes("Allandale"), "Allandale cannot be made in 18mm");
  assert.ok(names.includes("Albury"));
});

test("21mm hides every Laminex profile, because FormWrap is 18mm only", () => {
  assert.deepEqual(profilesForSupplier(PROFILES, { supplier: "Laminex", thickness: "21mm" }), []);
  const polytec = profilesForSupplier(PROFILES, { supplier: "Polytec", thickness: "21mm" }).map((p) => p.name);
  assert.ok(polytec.includes("Allandale"), "and shows the ones that are 21mm only");
});

test("categories follow the same narrowing", () => {
  assert.deepEqual(profileCategoriesForSupplier(PROFILES, { supplier: "Laminex" }), [
    "Series 3: Pocket Routered Doors",
    "Series 2: Recessed Handles and Face Routered Doors",
  ]);
  assert.deepEqual(profileCategoriesForSupplier(PROFILES, { supplier: "Polytec", thickness: "18mm" }), [
    "Soft",
    "Detailed",
  ]);
});

// ── the field that should not be shown at all ──────────────────────────────
//
// An empty Edge dropdown reads as "we could not load the options". No edge field
// reads as "this brand does not do edges", which is the truth.

test("Laminex offers no edges, and that is a real answer", () => {
  assert.equal(supplierOffersEdges(PROFILES, "Laminex"), false);
  assert.deepEqual(edgesForSupplier(PROFILES, { supplier: "Laminex" }), []);
  assert.equal(supplierOffersEdges(PROFILES, "Polytec"), true);
});

test("edges narrow by board type as well as by brand", () => {
  const thermo = edgesForSupplier(PROFILES, { supplier: "Polytec", material: "Thermolaminate" }).map((e) => e.name);
  assert.deepEqual(thermo, ["EM1 6mm Pencil Round"]);
});

// A brand can be stocked for its board and have no routed fronts at all, which
// is how Formica would arrive: colour rows first, profile rows later or never.
test("a brand with no profile rows does not show a profile field either", () => {
  assert.equal(
    supplierOffersProfiles(PROFILES, "Formica"),
    false,
    "no profile rows for this brand, so plenty of board and no routed front"
  );
  assert.equal(supplierOffersProfiles(PROFILES, "Polytec"), true);
  assert.equal(supplierOffersProfiles([], "Polytec"), false, "and no rows at all offers nothing");
});

// Every real row carries a kind, because the column defaults to 'door'. A row
// arriving without one is treated as a door profile to match that default,
// rather than being dropped and quietly shortening the list.
test("a row with no kind is treated as a door profile, matching the column default", () => {
  const noKind = [{ supplier_name: "Formica", category: "Flat", name: "Plain", is_active: true }];
  assert.equal(supplierOffersProfiles(noKind, "Formica"), true);
  assert.equal(supplierOffersEdges(noKind, "Formica"), false, "an edge has to say so explicitly");
});

// ── the conflict check all three tools share ───────────────────────────────

test("a Laminex colour on a Polytec line is refused, and says which is which", () => {
  const problems = supplierConflicts(
    { supplier_name: "Polytec", colour: "Domino" },
    { colourRows: COLOURS, profileRows: PROFILES }
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /Domino is a Laminex colour, not Polytec/);
});

test("a Polytec profile on a Laminex line is refused", () => {
  const problems = supplierConflicts(
    { supplier_name: "Laminex", profile: "Albury" },
    { colourRows: COLOURS, profileRows: PROFILES }
  );
  assert.match(problems[0], /Albury is a Polytec profile, not Laminex/);
});

test("an edge on a Laminex line is refused because the brand makes none", () => {
  const problems = supplierConflicts(
    { supplier_name: "Laminex", edge_mould: "EM1 6mm Pencil Round" },
    { colourRows: COLOURS, profileRows: PROFILES }
  );
  assert.match(problems[0], /Laminex does not make edge profiles/);
});

// "Country Square" is a real profile in BOTH ranges, so it is valid on either
// line and must not be reported as a conflict on either.
test("a name both brands use is valid on either line", () => {
  ["Polytec", "Laminex"].forEach((supplier) => {
    assert.deepEqual(
      supplierConflicts({ supplier_name: supplier, profile: "Country Square" }, { colourRows: COLOURS, profileRows: PROFILES }),
      []
    );
  });
});

// A half-finished line is somebody mid-thought, not a mistake.
test("nothing is refused until there is something to refuse", () => {
  const ctx = { colourRows: COLOURS, profileRows: PROFILES };
  assert.deepEqual(supplierConflicts({}, ctx), [], "no supplier chosen yet");
  assert.deepEqual(supplierConflicts({ supplier_name: "Polytec" }, ctx), [], "nothing filled in yet");
  assert.deepEqual(
    supplierConflicts({ supplier_name: "Polytec", colour: "Something We Do Not Stock" }, ctx),
    [],
    "a colour we have never heard of is a different conversation, not a brand conflict"
  );
});

test("a correct line is silent", () => {
  assert.deepEqual(
    supplierConflicts(
      { supplier_name: "Polytec", colour: "Amaro", profile: "Albury", edge_mould: "EM1 6mm Pencil Round" },
      { colourRows: COLOURS, profileRows: PROFILES }
    ),
    []
  );
});

// ── changing the supplier on a line already filled in ──────────────────────

test("changing brand says what it is about to lose, rather than silently emptying boxes", () => {
  const cleared = fieldsClearedBySupplierChange(
    { supplier_name: "Polytec", colour: "Amaro", profile: "Albury", edge_mould: "EM1 6mm Pencil Round" },
    "Laminex",
    { colourRows: COLOURS, profileRows: PROFILES }
  );
  const fields = cleared.map((entry) => entry.field).sort();
  assert.deepEqual(fields, ["colour", "edge_mould", "profile"]);
  assert.equal(cleared.find((entry) => entry.field === "colour").was, "Amaro", "and what the old value was");
});

test("changing to a brand that can make the same things loses nothing", () => {
  assert.deepEqual(
    fieldsClearedBySupplierChange({ supplier_name: "Polytec", profile: "Country Square" }, "Laminex", {
      colourRows: COLOURS,
      profileRows: PROFILES,
    }),
    [],
    "both ranges have a Country Square"
  );
});

// ── CHOOSING A FINISH IS NOT CHOOSING A BRAND ──────────────────────────────
//
// Reported from the live form: pick a brand, then pick a finish, and the brand
// box empties and the colour box locks itself again.
//
// chooseFinish cleared supplierName. That was right when the brand was read off
// whichever colour got picked, because changing the finish invalidated it. Once
// the brand became the step that decides the list, clearing it from there undid
// the answer two fields up, and the colour field is gated on the brand, so it
// went back to "Choose a brand first".

const QUOTE_FORM = readFileSync(
  new URL("../app/(site)/request-quote/RequestQuoteFormClient.js", import.meta.url),
  "utf8"
);

test("picking a finish leaves the brand alone", () => {
  const chooseFinish = QUOTE_FORM.slice(
    QUOTE_FORM.indexOf("function chooseFinish"),
    QUOTE_FORM.indexOf("function handleBlur")
  );
  assert.doesNotMatch(chooseFinish, /supplierName/, "the finish must not touch the brand that narrows it");
  assert.match(chooseFinish, /colour: "", colourSrc: "", colourLibraryId: ""/, "but the colour under it still goes");
});

// The brand decided WHETHER the colour field appeared, and then had no say in
// what was in it: a line set to Polytec still listed every Laminex finish and
// colour, and picking one quietly moved the brand underneath.
test("the colour list is narrowed to the brand, not merely gated by it", () => {
  assert.match(QUOTE_FORM, /const finishGroups = \(colourFamily\?\.groups \|\| \[\]\)\s*\n\s*\.map\(/);
  assert.match(QUOTE_FORM, /!supplier \|\| sameBrand\(colour\.supplier\)/);
  assert.match(QUOTE_FORM, /\.filter\(\(group\) => group\.colours\.length\)/, "a finish with nothing left under it is not offered");
});

test("picking a colour does not move the brand", () => {
  assert.match(QUOTE_FORM, /supplierName: supplier \|\| option\.supplier \|\| ""/);
});

// We may stock plenty in that thickness, just not from this brand, and the
// other way out is to change the brand rather than the thickness.
test("an empty list names the brand rather than blaming the thickness", () => {
  assert.match(QUOTE_FORM, /has no \$\{String\(item\.material\)\.toLowerCase\(\)\} colours in \$\{item\.thickness\}/);
  assert.match(QUOTE_FORM, /Try another thickness, or another brand/);
});

// ── SWITCHING BRAND HAS TO TAKE THE COLOUR WITH IT ─────────────────────────
//
// The public form is handed only the brand-and-material pairs, which carry no
// colour names. So the lookup could never match a colour, never cleared one, and
// somebody could pick a Polytec colour, switch to Laminex and keep both. The mix
// was only refused at the very end, which is a dead end rather than a guardrail.

test("changing brand clears the colour even when it cannot be looked up", () => {
  const cleared = fieldsClearedBySupplierChange(
    { supplier_name: "Polytec", colour: "Some Colour We Cannot Look Up" },
    "Laminex",
    // What the public quote form actually has: pairs, with no names in them.
    { colourRows: [{ supplier_name: "Polytec", material_type: "thermolaminate" }], profileRows: PROFILES }
  );
  assert.deepEqual(cleared.map((entry) => entry.field), ["colour"]);
  assert.equal(cleared[0].was, "Some Colour We Cannot Look Up");
});

// Two brands may both sell something called Snow. They are different boards at
// different prices, so the name matching proves nothing.
test("a colour name both brands use is still cleared", () => {
  const rows = [
    { name: "Snow", supplier_name: "Polytec", material_type: "thermolaminate" },
    { name: "Snow", supplier_name: "Laminex", material_type: "thermolaminate" },
  ];
  const cleared = fieldsClearedBySupplierChange({ supplier_name: "Polytec", colour: "Snow" }, "Laminex", {
    colourRows: rows,
    profileRows: PROFILES,
  });
  assert.deepEqual(cleared.map((entry) => entry.field), ["colour"]);
});

// A line from before the brand was recorded is having one ADDED, not changed.
// Throwing away its colour over that would lose real work.
test("adding a brand to a line that never had one keeps what it can", () => {
  const cleared = fieldsClearedBySupplierChange({ colour: "Something Unrecognised" }, "Polytec", {
    colourRows: [{ supplier_name: "Polytec", material_type: "thermolaminate" }],
    profileRows: PROFILES,
  });
  assert.deepEqual(cleared, [], "nothing here is provably another brand's");
});

// The finish is part of the colour choice, and a finish the new brand does not
// offer is not in the narrowed list, so the colour box would open onto nothing.
test("the finish goes with the colour", () => {
  const select = readFileSync(new URL("../app/(site)/request-quote/SupplierSelect.js", import.meta.url), "utf8");
  assert.match(select, /patch\.colour = "";\s*\n[\s\S]{0,180}patch\.finish = "";/);
});

// ── WHAT MAY AND MAY NOT CLEAR THE BRAND ───────────────────────────────────
//
// Three separate reports, one root cause. Picking a finish cleared the brand.
// Picking a thickness cleared the brand. Both were correct once: the brand used
// to be read off whichever colour got chosen, so anything that invalidated the
// colour invalidated the brand with it.
//
// The brand is now chosen BEFORE both of them and is what produces their lists.
// Clearing it from either undoes the answer a step above, empties the list that
// answer produced, and locks the colour field, which is gated on the brand.
// Picking a thickness undid the step that made picking a thickness possible.
//
// The rule now: only a MATERIAL change clears the brand, because which brands
// stock a board differs by board. Nothing downstream of the brand touches it.

test("picking a thickness leaves the brand alone", () => {
  const update = QUOTE_FORM.slice(
    QUOTE_FORM.indexOf('hasOwnProperty.call(patch, "thickness")'),
    QUOTE_FORM.indexOf('hasOwnProperty.call(patch, "profileType")')
  );
  assert.doesNotMatch(update, /supplierName/, "the thickness is chosen after the brand and must not undo it");
  assert.match(update, /next\.colour = ""/, "but the colour still goes: a board at 18mm is not the same board at 21mm");
});

test("picking a material does clear the brand", () => {
  const update = QUOTE_FORM.slice(
    QUOTE_FORM.indexOf('hasOwnProperty.call(patch, "material")'),
    QUOTE_FORM.indexOf('hasOwnProperty.call(patch, "thickness")')
  );
  assert.match(update, /next\.supplierName = ""/, "a brand chosen for one board says nothing about another");
});

// One place, so a fourth report of the same shape cannot appear.
test("the material change is the only thing that clears the brand", () => {
  const clears = (QUOTE_FORM.match(/supplierName = ""/g) || []).length;
  assert.equal(clears, 1, "exactly one rule may clear the brand, and it is the material rule");
});

// The two admin editors were checked for the same bug and never had it: their
// thickness rules touch the colour and the cost, never the supplier.
test("neither admin editor clears the supplier on a thickness change", () => {
  const quoteEditor = readFileSync(new URL("../app/admin/quotes/[id]/QuoteEditor.js", import.meta.url), "utf8");
  const thicknessRule = quoteEditor.slice(
    quoteEditor.indexOf('hasOwnProperty.call(patch, "thickness")'),
    quoteEditor.indexOf('hasOwnProperty.call(patch, "unit_cost_per_sqm_ex_gst")')
  );
  assert.doesNotMatch(thicknessRule, /supplier_name/);

  const variationEditor = readFileSync(
    new URL("../app/admin/orders/[id]/variations/[variationId]/VariationEditor.js", import.meta.url),
    "utf8"
  );
  const variationRule = variationEditor.slice(
    variationEditor.indexOf('has("thickness")'),
    variationEditor.indexOf('has("profile_type")')
  );
  assert.doesNotMatch(variationRule, /supplier_name/);
});
