/*
 * LAMINATE: A STAFF PRODUCT TYPE THAT MUST NOT REACH THE WEBSITE.
 *
 * Laminate is the 0.7mm sheet, sold as a sheet. Two things about it are easy to
 * break by accident and both are pinned here:
 *
 *   1. It is not the stock anything else is cut from. If it leaks into a Door's
 *      material list somebody picks it and we build a door out of a 0.7mm sheet.
 *
 *   2. It is not offered to customers. Ashleigh's call, and the reason matters:
 *      it sits next to decorative board, it is cheaper, and a customer picking
 *      it when they wanted a door is a correction we would be making forever.
 *      The public request form is the screen that must never show it.
 *
 * And one that has bitten this codebase before: "thermolaminate" and "compact
 * laminate" both contain the word "laminate", so a careless substring match
 * turns every thermolaminate colour in the library into plain laminate.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  MATERIALS,
  MATERIAL_LABELS,
  PRODUCT_TYPES,
  PUBLIC_PRODUCT_TYPES,
  THICKNESS_BY_LABEL,
  materialsForProductType,
  normaliseMaterialKey,
} from "../lib/pcd-materials.js";
import { PRODUCT_FIELDS, fieldsForProductType, productTypeChoices, isInternalType } from "../lib/pcd-product-fields.js";
import { COLOUR_MATERIALS, COLOUR_THICKNESS_BY_MATERIAL } from "../lib/pcd-colour-library.js";
import { itemTypeOptions } from "../lib/pcd-line-details.js";
import { COLOUR_IMAGE_MATERIALS } from "../lib/pcd-colour-images.js";

test("laminate is a material in its own right, 0.7mm", () => {
  const laminate = MATERIALS.find((m) => m.key === "laminate");
  assert.ok(laminate, "laminate is missing from MATERIALS");
  assert.equal(laminate.label, "Laminate");
  assert.equal(laminate.design, "laminate");
  assert.deepEqual(laminate.thicknesses, ["0.7mm"]);
  assert.deepEqual(THICKNESS_BY_LABEL.Laminate, ["0.7mm"]);
  assert.ok(MATERIAL_LABELS.includes("Laminate"));
});

test("the colour library offers laminate, and 0.7mm with it", () => {
  // The library screen builds both dropdowns off MATERIALS, so this is really
  // asking that nothing between here and there filters it back out.
  assert.ok(COLOUR_MATERIALS.some((m) => m.value === "laminate" && m.label === "Laminate"));
  assert.deepEqual(COLOUR_THICKNESS_BY_MATERIAL.laminate, ["0.7mm"]);
});

test("the database will accept the material the library now offers", () => {
  // The check constraint is what rejected a laminate colour before this, so a
  // dropdown option with no matching migration is a save that fails at save
  // time rather than at build time.
  const sql = fs.readFileSync(new URL("../supabase/202609081400_pcd_laminate_material.sql", import.meta.url), "utf8");
  assert.ok(sql.includes("pcd_colour_library_material_type_check"));
  COLOUR_MATERIALS.forEach((m) => {
    assert.ok(sql.includes("'" + m.value + "'"), m.value + " is offered but not allowed by the constraint");
  });
});

test("nothing else is made out of a laminate sheet", () => {
  ["Door", "Drawer front", "Panel", "Table top"].forEach((type) => {
    assert.ok(
      !materialsForProductType(type).includes("Laminate"),
      type + " is offering Laminate as a material it can be made from"
    );
  });
  assert.deepEqual(materialsForProductType("Laminate"), ["Laminate"]);
  // An unknown type still falls back to the real board materials, not to none.
  assert.deepEqual(materialsForProductType("Something new"), [
    "Decorative Board",
    "Thermolaminate",
    "Compact Laminate",
  ]);
});

test("staff can pick Laminate as an item type", () => {
  assert.ok(PRODUCT_TYPES.includes("Laminate"));
  const option = itemTypeOptions({ productTypes: PRODUCT_TYPES }).find((o) => o.value === "Laminate");
  assert.ok(option, "Laminate is not on the quote item type picker");
  assert.equal(option.product_type, "Laminate");
  assert.equal(option.panel_use, "");
});

test("a laminate sheet is a board with a size and nothing else", () => {
  const fields = fieldsForProductType("Laminate");
  assert.equal(fields.board, true);
  assert.equal(fields.size, true);
  // No face to rout, no edge to tape, no cup to bore. It is a sheet.
  assert.equal(fields.profile, false);
  assert.equal(fields.edge, false);
  assert.equal(fields.hinges, false);
  assert.equal(fields.hardware, false);
});

test("laminate never reaches a customer-facing screen", () => {
  assert.equal(isInternalType("Laminate"), true);
  // The public request form's type list.
  assert.ok(!productTypeChoices(PRODUCT_TYPES).some((c) => c.value === "Laminate"));
  // The public finishes browser's type list.
  assert.ok(!PUBLIC_PRODUCT_TYPES.some((t) => t.label === "Laminate" || t.id === "laminate"));
  // The public finishes page names the materials it browses, and laminate is
  // not one of them.
  const finishes = fs.readFileSync(new URL("../app/(site)/finishes/page.js", import.meta.url), "utf8");
  const listed = finishes.match(/const MATERIAL_TYPES = \[[^\]]*\]/);
  assert.ok(listed, "MATERIAL_TYPES has moved, check laminate is still excluded");
  assert.ok(!listed[0].includes('"laminate"'));
});

test("the design tool does not offer laminate as a board", () => {
  // A design is a kitchen drawn out of cabinets and fronts. A sheet of laminate
  // is not something you draw, so it stays off the design tool's board pickers
  // and out of the colour images it loads for them.
  assert.ok(!COLOUR_IMAGE_MATERIALS.includes("laminate"));
  assert.deepEqual(COLOUR_IMAGE_MATERIALS, ["decorative board", "thermolaminate", "compact laminate"]);
});

test("every other type is still offered to customers", () => {
  // The internal filter is a scalpel, not a rule that quietly grew.
  const offered = productTypeChoices(PRODUCT_TYPES).map((c) => c.value);
  assert.deepEqual(offered, ["Door", "Drawer front", "Panel", "Table top", "Hardware"]);
  Object.entries(PRODUCT_FIELDS).forEach(([name, fields]) => {
    if (name === "Laminate") return;
    assert.notEqual(fields.internal, true, name + " has quietly been made staff only");
  });
});

test("laminate does not swallow thermolaminate or compact laminate", () => {
  assert.equal(normaliseMaterialKey("thermolaminate"), "thermolaminate");
  assert.equal(normaliseMaterialKey("Thermolaminate"), "thermolaminate");
  assert.equal(normaliseMaterialKey("compact laminate"), "compact_laminate");
  assert.equal(normaliseMaterialKey("Compact Laminate"), "compact_laminate");
  assert.equal(normaliseMaterialKey("compact"), "compact_laminate");
  assert.equal(normaliseMaterialKey("laminate"), "laminate");
  assert.equal(normaliseMaterialKey("Laminate"), "laminate");
  assert.equal(normaliseMaterialKey("0.7mm"), "laminate");
  // And the ones that were already right stay right.
  assert.equal(normaliseMaterialKey("decorative board"), "decorative_board");
  assert.equal(normaliseMaterialKey("18mm"), "decorative_board");
});
