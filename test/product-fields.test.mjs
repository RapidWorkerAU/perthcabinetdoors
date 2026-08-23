// ASK EACH PRODUCT ONLY WHAT IT NEEDS.
//
// The quote form showed every field for every product and wrote "N/A" in the
// ones that did not apply. A door has eleven; hardware has two. So somebody
// ordering handles was shown nine boxes that meant nothing, and the one thing
// they needed to say was not there: the material dropdown was empty, because
// hardware has no board, and the row could not be finished at all.
//
// A greyed-out field is not information. It is a question we are asking and then
// refusing to accept the answer to.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PRODUCT_FIELDS, fieldsForProductType, isHardwareType, productTypeChoices } from "../lib/pcd-product-fields.js";
import { MATERIALS_BY_TYPE, PRODUCT_TYPES } from "../lib/quote-form-data.js";
import { materialsForProductType } from "../lib/pcd-materials.js";
import { lineGaps, lineIsReady, missingFields } from "../lib/pcd-quote-ready.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// ── A TABLE TOP IS NOT A DOOR ──────────────────────────────────────────────
//
// Thermolaminate is a vinyl skin pressed over a routed face, made for a door
// front. As a work surface it will not take heat, moisture or wear. It was
// offered anyway, because the rule was "everything except Hardware", which is
// not a rule, it is the absence of one.

test("a table top cannot be ordered in thermolaminate", () => {
  const allowed = materialsForProductType("Table top");
  assert.ok(!allowed.includes("Thermolaminate"), "it will not survive being used as a work surface");
  assert.deepEqual(allowed, ["Decorative Board", "Compact Laminate"]);
});

test("a door still gets every board", () => {
  assert.deepEqual(materialsForProductType("Door"), ["Decorative Board", "Thermolaminate", "Compact Laminate"]);
});

test("hardware gets none, because it is not cut from a board", () => {
  assert.deepEqual(materialsForProductType("Hardware"), []);
});

// A type nobody has written a rule for gets everything, so renaming a product
// type cannot silently empty its material list.
test("an unrestricted type is unrestricted", () => {
  assert.deepEqual(materialsForProductType("Something New"), [
    "Decorative Board",
    "Thermolaminate",
    "Compact Laminate",
  ]);
});

// Every screen reads the same map, so the rule cannot hold on one and not
// another.
test("the map every screen reads carries the rule", () => {
  assert.ok(!MATERIALS_BY_TYPE["Table top"].includes("Thermolaminate"));
  assert.deepEqual(MATERIALS_BY_TYPE.Hardware, []);
  PRODUCT_TYPES.forEach((type) => {
    assert.ok(Array.isArray(MATERIALS_BY_TYPE[type]), `${type} has no material list`);
  });
});

// The dropdowns handle somebody filling the form in today. This is for a tab
// open from before the change, a line copied off an older quote, or an import.
test("a thermolaminate table top is refused on the way in, not just hidden", () => {
  const gaps = lineGaps({
    productType: "Table top",
    material: "Thermolaminate",
    thickness: "18mm",
    colour: "Char Oak",
    width: 600,
    height: 900,
  });
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].field, "material");
  assert.match(gaps[0].message, /Thermolaminate is not one/, "and it says which material is the problem");
});

test("a table top in a material it can be made from passes", () => {
  assert.equal(
    lineIsReady({
      productType: "Table top",
      material: "Compact Laminate",
      thickness: "13mm",
      colour: "Snow",
      width: 600,
      height: 900,
    }),
    true
  );
});

// ── HARDWARE HAD NO WAY THROUGH ────────────────────────────────────────────
//
// Picking Hardware left an empty Material dropdown and nothing else to fill in,
// so the row could not be completed. Meanwhile lineGaps returned [] for it, so
// "Hardware" with nothing on it counted as ready to price and somebody had to
// email and ask which handles.

test("a hardware line must say which hardware", () => {
  assert.deepEqual(missingFields({ productType: "Hardware" }), ["hardware"]);
  assert.equal(lineIsReady({ productType: "Hardware", hardwareCatalogueId: "abc" }), true);
});

test("and is asked nothing else", () => {
  // No board, no size, no finish. Asking anyway is what made it unfinishable.
  assert.deepEqual(missingFields({ productType: "Hardware", hardwareCatalogueId: "abc" }), []);
});

test("hardware is the only type chosen from a catalogue", () => {
  assert.equal(isHardwareType("Hardware"), true);
  ["Door", "Drawer front", "Panel", "Table top"].forEach((type) => {
    assert.equal(isHardwareType(type), false, `${type} is made, not bought`);
  });
});

// ── WHAT EACH TYPE IS ASKED ────────────────────────────────────────────────

test("only a door is drilled for hinges", () => {
  assert.equal(fieldsForProductType("Door").hinges, true);
  ["Drawer front", "Panel", "Table top", "Hardware"].forEach((type) => {
    assert.equal(fieldsForProductType(type).hinges, false, `${type} has no hinge to hang on`);
  });
});

test("a table top is not offered a routed face", () => {
  assert.equal(fieldsForProductType("Table top").profile, false);
});

test("hardware is asked for no board, no size and no edge", () => {
  const fields = fieldsForProductType("Hardware");
  assert.equal(fields.board, false);
  assert.equal(fields.size, false);
  assert.equal(fields.edge, false);
  assert.equal(fields.hardware, true);
});

// A type with no field set would render an empty step two, which is the same
// dead end in a new place.
test("every offered product type has a field set", () => {
  PRODUCT_TYPES.forEach((type) => {
    assert.ok(PRODUCT_FIELDS[type], `${type} is offered with no idea what to ask for it`);
  });
});

test("every type says what it is in plain words", () => {
  productTypeChoices(PRODUCT_TYPES).forEach((entry) => {
    assert.ok(entry.label, `${entry.value} has no label`);
    assert.ok(entry.blurb && entry.blurb.length > 15, `${entry.value} needs a line saying what it is`);
  });
});

// An unknown type gets the board treatment rather than an empty form, so a line
// from an older quote still shows its fields.
test("an unknown type still gets a form", () => {
  const fields = fieldsForProductType("Something New");
  assert.equal(fields.board, true);
  assert.equal(fields.size, true);
});

// ── THE FORM ITSELF ────────────────────────────────────────────────────────

const FORM = read("app/(site)/request-quote/RequestQuoteFormClient.js");

test("the type is asked first, on its own", () => {
  assert.match(FORM, /<ProductTypeChooser/);
  assert.match(FORM, /const pickingType = pickingTypeState \|\| !editingItem\.type/);
  assert.match(FORM, /Step 1 of 2/);
});

test("step two renders from the field set rather than a wall of conditionals", () => {
  assert.match(FORM, /const fields = fieldsForProductType\(editingItem\.type\)/);
  ["fields.hardware", "fields.board", "fields.size", "fields.edge", "fields.profile", "fields.hinges"].forEach(
    (guard) => {
      assert.ok(FORM.includes(guard), `step two does not consult ${guard}`);
    }
  );
});

// The point of the change: a field that does not apply is not rendered at all.
test("no field is rendered only to be marked N/A", () => {
  const step = FORM.slice(FORM.indexOf("Step 2 of 2"), FORM.indexOf("productModalFooter"));
  assert.ok(
    !/Hinge options only apply to doors/.test(step),
    "the hinge N/A message is gone because the field is gone"
  );
});

test("there is a way back to the type", () => {
  assert.match(FORM, /Choose something else/);
});

// A door drilled for hinges that becomes a table top must not still be drilled,
// and hardware has no board, so a colour left on it would be a spec we cannot
// act on.
test("changing the type drops what the new type cannot use", () => {
  assert.match(FORM, /function chooseType\(id, type\)/);
  assert.match(FORM, /preDrill: next\.hinges \? row\.preDrill : false/);
  assert.match(FORM, /hardwareId: next\.hardware \? row\.hardwareId : ""/);
  assert.match(
    FORM,
    /const keepsBoard = next\.board && materialsForProductType\(type\)\.includes\(row\.material\)/,
    "and a material the new type cannot use goes, with the colour and brand chosen under it"
  );
});

test("the chosen hardware travels with the request", () => {
  assert.match(FORM, /hardwareCatalogueId: item\.hardwareId \|\| undefined/);
  assert.match(FORM, /productName: item\.hardwareName \|\| item\.type/, "so the line names what they picked");
  const api = read("app/api/quote-requests/route.js");
  assert.match(api, /hardwareCatalogueId: z\.string\(\)\.uuid\(\)\.optional\(\)/, "or zod strips it silently");
});

// ── THE PUBLIC HARDWARE LIST ───────────────────────────────────────────────

const HARDWARE_API = read("app/api/hardware/route.js");

test("our cost does not go out to the public", () => {
  assert.match(HARDWARE_API, /admin \? row\.unit_cost_ex_gst \?\? 0 : withoutCost\(row\)\.unit_cost_ex_gst/);
  assert.match(HARDWARE_API, /isAdminRequest/);
});

// An item we have stopped selling must not be offered on a NEW request, or the
// line gets quoted against something we can no longer buy.
test("retired hardware is offered to nobody", () => {
  assert.match(HARDWARE_API, /row\.is_active !== false/);
});

// An empty list and a failed read look identical to a picker.
test("the hardware list says when it failed rather than looking empty", () => {
  assert.match(HARDWARE_API, /ok: false/);
  assert.match(HARDWARE_API, /status: 500/);
  assert.match(FORM, /setStatus\("failed"\)/);
  assert.match(FORM, /We could not load our hardware list just now/);
});
