// WHAT A COLOUR CAN BE MADE AS, on the public finishes page.
//
// People were browsing the colour library, choosing a colour we only press as
// decorative board, and then asking for it as a profiled door. We cannot make
// that: a routed profile is pressed into a vinyl wrapped front, so it is
// thermolaminate or it is nothing. The page said the opposite in its own intro
// copy, which read "Every colour here is available across doors, drawer fronts
// and panels".
//
// So the page now asks what you are making first, and these are the rules that
// answer it. They live in lib/pcd-materials.js beside the materials themselves
// rather than in the page, so the quote form, the design tool and this page
// cannot end up disagreeing about what is possible.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PROFILED_FRONT_MATERIAL_KEY,
  PUBLIC_PRODUCT_TYPES,
  materialKeysForPublicProductType,
  materialsForProductType,
  publicProductType,
  publicProductTypesForMaterials,
} from "../lib/pcd-materials.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const BROWSER = read("app/(site)/finishes/FinishesBrowser.js");
const PAGE = read("app/(site)/finishes/page.js");

test("a profiled front is thermolaminate and nothing else", () => {
  assert.deepEqual(materialKeysForPublicProductType("profiled-fronts"), [PROFILED_FRONT_MATERIAL_KEY]);
});

test("a decorative board colour is never offered as a profiled front", () => {
  const offered = publicProductTypesForMaterials(["decorative_board"]).map((type) => type.id);
  assert.ok(!offered.includes("profiled-fronts"), "decorative board must not reach the profiled fronts list");
  // It is still a perfectly good flat front, panel or table top, so the filter
  // has to narrow the range rather than write the colour off.
  assert.deepEqual(offered, ["flat-fronts", "panels", "table-tops"]);
});

test("a thermolaminate colour is offered as both a profiled and a flat front", () => {
  const offered = publicProductTypesForMaterials(["thermolaminate"]).map((type) => type.id);
  assert.ok(offered.includes("profiled-fronts"));
  assert.ok(offered.includes("flat-fronts"));
  // Table tops are decorative board or compact laminate. A vinyl wrapped face
  // will not take heat, moisture or wear as a work surface.
  assert.ok(!offered.includes("table-tops"));
});

test("a colour pressed in both boards is offered as everything", () => {
  const offered = publicProductTypesForMaterials(["decorative_board", "thermolaminate"]);
  assert.equal(offered.length, PUBLIC_PRODUCT_TYPES.length);
});

test("the materials come from MATERIALS_ALLOWED_BY_TYPE, not a second copy of it", () => {
  // Table tops are the type that is restricted, so they are the one that proves
  // the derivation. If somebody changes the allowed list, this list moves too.
  const allowed = materialsForProductType("Table top");
  assert.deepEqual(allowed, ["Decorative Board", "Compact Laminate"]);
  assert.deepEqual(materialKeysForPublicProductType("table-tops"), ["decorative_board", "compact_laminate"]);
});

test("an unknown product type shows the library rather than an empty page", () => {
  // A stale /finishes?product=... link must not leave a customer on a blank grid.
  assert.ok(materialKeysForPublicProductType("no-such-thing").length >= 2);
  assert.equal(publicProductType("no-such-thing"), null);
});

test("every product type carries a plain English label and a reason", () => {
  PUBLIC_PRODUCT_TYPES.forEach((type) => {
    assert.ok(type.label && type.label === type.label.trim(), `${type.id} needs a label`);
    assert.ok(type.note && type.note.length > 40, `${type.id} needs a note explaining what it can be made in`);
    assert.ok(type.productTypes.length, `${type.id} needs at least one quote product type`);
  });
});

test("the page carries the colour's materials through to the browser", () => {
  // One tile stands for a colour that may be pressed in both boards, so the
  // loader has to collect every material rather than keep the first row.
  assert.match(PAGE, /materials: materialKey \? \[materialKey\] : \[\]/);
  assert.match(PAGE, /existing\.materials\.push\(materialKey\)/);
  assert.match(PAGE, /materials: \[\.\.\.new Set\(colour\.materials\)\]/);
});

test("the page no longer promises every colour across every product", () => {
  assert.ok(
    !PAGE.includes("Every colour here is available across"),
    "the intro claim that caused the wrong enquiries must not come back"
  );
  assert.match(PAGE, /thermolaminate colours only/);
});

test("the browser filters on the product type and keeps it across tabs", () => {
  assert.match(BROWSER, /const \[productType, setProductType\] = useState\(initialProductType\)/);
  assert.match(BROWSER, /<span>Product type<\/span>/);
  // The results, and the brand / finish / family option lists, all read the
  // scoped list, so their counts match what is on screen.
  assert.match(BROWSER, /const scoped = useMemo\(\(\) => dataset\.filter\(matchesProduct\)/);
  assert.ok(!/}, \[dataset, supplier\]\);/.test(BROWSER), "option lists must be built from the scoped list");

  // switchTab clears the filters under the tab but not the product type.
  const switchTab = BROWSER.slice(BROWSER.indexOf("function switchTab"), BROWSER.indexOf("function chooseProductType"));
  assert.ok(!switchTab.includes("setProductType"), "the product type must survive a tab switch");
  // Clearing everything does clear it.
  const clear = BROWSER.slice(BROWSER.indexOf("function clearFilters"));
  assert.match(clear.slice(0, 300), /setProductType\(ALL\)/);
});

test("door profiles are marked as thermolaminate fronts so they drop off panels", () => {
  assert.match(BROWSER, /materials: \[PROFILED_FRONT_MATERIAL_KEY\]/);
  assert.match(BROWSER, /productTypes: \["Door", "Drawer front"\]/);
  // Panels and table tops are not doors, so nothing on the profiles tab applies.
  const panels = publicProductType("panels");
  assert.ok(!["Door", "Drawer front"].some((type) => panels.productTypes.includes(type)));
});

test("edge details know which board they go on", () => {
  assert.match(BROWSER, /materials: \[normaliseMaterialKey\(group\)\]/);
});
