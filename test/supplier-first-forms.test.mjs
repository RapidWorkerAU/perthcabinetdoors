// SUPPLIER FIRST, ON EVERY SCREEN THAT BUILDS A LINE.
//
// A door is one brand's colour pressed onto that brand's profile. The ranges
// cannot be mixed, and Laminex makes no edge profiles at all.
//
// Three screens build quote lines: the public quote form, the quote editor and
// the variation editor. If they each decide separately what a valid line is, one
// of them will be wrong, and the first anybody finds out is when the door
// arrives. So all three read lib/pcd-supplier-selection.js, and these tests hold
// them to it.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const PUBLIC_FORM = readFileSync(
  new URL("../app/(site)/request-quote/RequestQuoteFormClient.js", import.meta.url),
  "utf8"
);
const SUPPLIER_SELECT = readFileSync(
  new URL("../app/(site)/request-quote/SupplierSelect.js", import.meta.url),
  "utf8"
);
const PROFILE_API = readFileSync(new URL("../app/api/profile-library/route.js", import.meta.url), "utf8");
const COLOUR_API = readFileSync(new URL("../app/api/colour-library/route.js", import.meta.url), "utf8");
const HOOK = readFileSync(new URL("../lib/use-profile-library.js", import.meta.url), "utf8");

// ── the public quote form ──────────────────────────────────────────────────

test("the public form asks for the brand and narrows everything by it", () => {
  assert.match(PUBLIC_FORM, /<SupplierSelect/, "the brand has to be a field, not an assumption");
  assert.match(PUBLIC_FORM, /const supplier = editingItem\.supplierName \|\| ""/);
  assert.match(PUBLIC_FORM, /profileCategoriesForSupplier\(profileRows/);
  assert.match(PUBLIC_FORM, /profilesForSupplier\(profileRows/);
  assert.match(PUBLIC_FORM, /edgesForSupplier\(profileRows/);
});

test("nothing is offered before a brand is chosen", () => {
  assert.match(PUBLIC_FORM, /Choose a brand first/, "an unfiltered colour list is how the mixing happened");
  assert.match(PUBLIC_FORM, /Boolean\(supplier\) &&/, "and the profile and edge fields hang off it too");
});

// An empty Edge dropdown reads as "we could not load it". No edge field at all
// reads as "this brand does not do edges", which is the truth.
test("the edge field is hidden for a brand that makes no edges, not shown empty", () => {
  assert.match(PUBLIC_FORM, /supplierOffersEdges\(profileRows, supplier\)/);
  assert.match(
    PUBLIC_FORM,
    /profileLibrary\.isReady &&/,
    "and only once the library has actually loaded, so a failed read is not mistaken for a brand with no edges"
  );
});

test("the form loads the catalogue once, not once per line", () => {
  const hookCalls = (PUBLIC_FORM.match(/useProfileLibrary\(\)/g) || []).length;
  assert.equal(hookCalls, 1, "opening ten rows must not be ten requests");
});

test("photos come from the library row, with the old path as a fallback", () => {
  assert.match(PUBLIC_FORM, /image: profile\.image \|\| profileImageSrc/);
  assert.match(PUBLIC_FORM, /image: edge\.image \|\| edgeImageSrc/);
});

// ── changing brand on a half-filled line ───────────────────────────────────

test("changing brand says what it will clear rather than silently emptying boxes", () => {
  assert.match(SUPPLIER_SELECT, /fieldsClearedBySupplierChange/);
  assert.match(SUPPLIER_SELECT, /does not make what you have chosen/);
  assert.match(SUPPLIER_SELECT, /Keep \{item\?\.supplierName\}/, "and offers a way out");
});

// Keeping the library id would price the line off a board the customer is no
// longer choosing.
test("switching brand drops the identity of the old board, not just its name", () => {
  assert.match(SUPPLIER_SELECT, /colourLibraryId: ""/);
});

test("a brand no longer stocked still shows on a line that already has it", () => {
  assert.match(
    SUPPLIER_SELECT,
    /if \(current && !suppliers\.some/,
    "otherwise an older line silently reads as having no brand"
  );
});

test("the brand list is derived from the colours, so Formica needs no code change", () => {
  assert.match(SUPPLIER_SELECT, /suppliersForMaterial\(colourRows/);
  assert.doesNotMatch(SUPPLIER_SELECT, /"Polytec"|"Laminex"/, "no brand is written into the picker");
});

// ── the endpoints that feed it ─────────────────────────────────────────────

test("the profile API hides retired profiles from everyone, not just the public", () => {
  assert.match(PROFILE_API, /is_active !== false/);
  assert.match(
    PROFILE_API,
    /ADMIN\s*\n\s*\/\/ reads this endpoint too/,
    "RLS hides them from anon; the admin can see them and must still not be offered them on a new quote"
  );
});

// An empty list and a failed read look identical to a picker.
test("the profile API says when it failed rather than returning an empty catalogue", () => {
  assert.match(PROFILE_API, /ok: false/);
  assert.match(PROFILE_API, /status: 500/);
});

test("the hook distinguishes loading, ready and failed", () => {
  assert.match(HOOK, /setStatus\("failed"\)/);
  assert.match(HOOK, /isReady: status === "ready"/);
  assert.match(HOOK, /"Laminex makes\s*\n\/\/ no edge profiles" and "the library could not be read"/);
});

test("the colour API says which brands stock which material", () => {
  assert.match(COLOUR_API, /brandPairs/);
  assert.match(
    COLOUR_API,
    /Per material, not one flat list/,
    "a brand that stocks board but not thermolaminate must not be offered on a thermolaminate line"
  );
});

// The pairs are deduplicated, so this stays a handful of entries however many
// colours the library holds.
test("the brand pairs are deduplicated rather than one per colour row", () => {
  assert.match(COLOUR_API, /brandPairs\.find\(\(entry\) =>/);
});

// The brand is chosen BEFORE the thickness, so each pair has to carry the
// thicknesses that brand stocks. Without them the form would offer Laminex
// 21mm, which is the same wrong turn the order was changed to prevent, one
// step later.
test("each brand pair carries the thicknesses that brand stocks", () => {
  assert.match(COLOUR_API, /pair\.thicknesses\.includes\(thickness\)/);
  assert.match(COLOUR_API, /pair\.thicknesses\.sort/, "in the same order the material-wide list uses");
});

// ── A BRAND THAT MAKES PROFILES, BUT NONE IN THIS THICKNESS ────────────────
//
// Every Laminex profile is 18mm only. A 21mm Laminex line therefore has a real
// brand, a real material and nothing to offer, which is not the same as a brand
// that makes no profiles at all.
//
// All three screens have to say N/A rather than show an empty dropdown, for the
// same reason the edge field is hidden rather than emptied: an empty box reads
// as a screen that failed to load.

const QUOTE_EDITOR = readFileSync(new URL("../app/admin/quotes/[id]/QuoteEditor.js", import.meta.url), "utf8");
const VARIATION_EDITOR = readFileSync(
  new URL("../app/admin/orders/[id]/variations/[variationId]/VariationEditor.js", import.meta.url),
  "utf8"
);

test("the public form hides the profile field when the brand has none in this thickness", () => {
  assert.match(PUBLIC_FORM, /profileTypes\.length > 0/);
});

test("the quote editor hides it too, from the same list the dropdown uses", () => {
  assert.match(QUOTE_EDITOR, /profileTypesFor\(line, supplier, useLibrary\)\.length > 0/);
  assert.match(
    QUOTE_EDITOR,
    /const profileTypeOptions = profileTypesFor\(line, supplier, useLibrary\)/,
    "the gate and the dropdown must not derive the list separately"
  );
});

test("the variation editor hides it too", () => {
  assert.match(VARIATION_EDITOR, /lineDraftProfileTypeOptions\.length > 0/);
});

// All three narrow the profile list by thickness, so the library's per-profile
// thickness flags are load-bearing, not decoration.
test("all three screens pass the thickness when asking for profiles", () => {
  [
    [PUBLIC_FORM, "the public form"],
    [QUOTE_EDITOR, "the quote editor"],
    [VARIATION_EDITOR, "the variation editor"],
  ].forEach(([source, what]) => {
    assert.match(source, /profilesForSupplier\(profileRows, \{[^}]*thickness/s, `${what} asks without the thickness`);
  });
});

// ── THE BRAND SHOWING UP AS THE COLOUR ─────────────────────────────────────
//
// The colour picker matches its selection with an internal key: supplier,
// finish, colour and thickness joined with "::". `.filter(Boolean)` drops the
// empty parts, so on a line with a brand and nothing else the whole key
// collapsed to "Laminex". No option matched it, and the picker fell back to
// printing the raw key, which read on screen as though Laminex were the colour
// that had been chosen.
//
// Two things were wrong and both are fixed, because either alone leaves the
// other able to put a key on screen.

const SHARED_COMBOBOX = readFileSync(new URL("../components/admin/QuoteComboboxes.js", import.meta.url), "utf8");

test("a key with no colour in it is no key at all", () => {
  [
    [SHARED_COMBOBOX, "the shared picker"],
    [QUOTE_EDITOR, "the quote editor's own copy"],
  ].forEach(([source, what]) => {
    assert.match(
      source,
      /const selectedValue = line\.colour\s*\n\s*\?\s*\[selectedSupplier, line\.finish, line\.colour, line\.thickness\]/,
      `${what} still builds a selection key out of the brand alone`
    );
  });
});

test("neither picker prints an internal key it could not match", () => {
  [
    [SHARED_COMBOBOX, "the shared picker"],
    [QUOTE_EDITOR, "the quote editor's own copy"],
  ].forEach(([source, what]) => {
    assert.match(source, /!String\(value\)\.includes\("::"\)/, `${what} can still show a raw key`);
  });
});

// The point of the fallback is a caller whose value IS its label. That has to
// keep working, or unrelated pickers go blank.
test("an ordinary unmatched value still shows", () => {
  [SHARED_COMBOBOX, QUOTE_EDITOR].forEach((source) => {
    assert.match(source, /displayValue \|\|/, "displayValue is still preferred over the raw value");
    assert.match(source, /\? String\(value\) : ""|\? value : ""/, "a plain value is still shown");
  });
});

// ── BRAND BEFORE THICKNESS, NOT AFTER IT ───────────────────────────────────
//
// The brand used to be asked after the thickness, which reads backwards to
// anyone who arrives knowing what they want. Somebody after Laminex who picks
// 21mm reaches the brand step, finds no Laminex, and concludes we do not sell
// it. The truth is only that they chose a thickness Laminex does not make.
//
// With the brand ahead of it, the thickness list is that brand's thicknesses and
// the wrong turn is not there to take.

test("the public form asks the brand before the thickness", () => {
  const brand = PUBLIC_FORM.indexOf("<SupplierSelect");
  const material = PUBLIC_FORM.indexOf("<label>Material<Required /></label>");
  const thickness = PUBLIC_FORM.indexOf("<label>Thickness<Required /></label>");
  assert.ok(material > -1 && brand > -1 && thickness > -1);
  assert.ok(brand > material, "the brand belongs to a material, so the material comes first");
  assert.ok(brand < thickness, "but everything the brand decides comes after it, thickness included");
});

test("the thickness list is the chosen brand's", () => {
  assert.match(PUBLIC_FORM, /thicknessOptionsForSelection\(\s*\n\s*editingItem\.material,\s*\n\s*colourAvailability,\s*\n\s*supplierColourRows,\s*\n\s*supplier\s*\n\s*\)/);
  assert.match(PUBLIC_FORM, /if \(pair\?\.thicknesses\?\.length\) return pair\.thicknesses/);
});

// A field that is empty for a reason nobody can see is the failure this whole
// change is about.
test("the thickness says which step is still missing", () => {
  assert.match(PUBLIC_FORM, /!editingItem\.material \? "Select material first" : !supplier \? "Choose a brand first" : "Thickness"/);
});

// Changing brand can strand a thickness the new one does not make, and the
// colour list under it would then be empty.
test("switching brand drops a thickness the new brand does not stock", () => {
  assert.match(SUPPLIER_SELECT, /function keepsThickness\(nextSupplier\)/);
  assert.match(SUPPLIER_SELECT, /if \(!keepsThickness\(pending\.next\)\) patch\.thickness = ""/);
  assert.match(
    SUPPLIER_SELECT,
    /if \(!pair\?\.thicknesses\?\.length\) return true/,
    "and does not guess when it has nothing to check against"
  );
});

// Both admin editors already ask for the supplier immediately after the
// material, and their thickness is set by whichever colour gets picked rather
// than chosen on its own, so the same rule already holds there.
test("the quote editor asks for the supplier straight after the material", () => {
  assert.match(QUOTE_EDITOR, /'Type', 'Item \/ material', 'Supplier', 'Finish', 'Colour', 'Thickness'/);
});
