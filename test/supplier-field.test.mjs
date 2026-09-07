// THE SUPPLIER THAT KEPT DISAPPEARING.
//
// ── WHAT WAS REPORTED ────────────────────────────────────────────────────────
//
// Three things on the quote items table, all of them about the Supplier cell:
//
//   1. Change a line from a drawer front to a door and the supplier vanishes.
//      Set it again and the colour resets.
//   2. Change a line from Polytec to Laminex, save, and the supplier is gone,
//      or the brand reads Laminex against the old Polytec colour.
//   3. Duplicate a line that is entirely correct and the copy has no supplier.
//
// ── WHY THEY WERE ALL THE SAME BUG, TWICE ────────────────────────────────────
//
// ONE. The dropdown matched its value with ===. The Supplier cell offers brands
// built from the colour library and holds whatever spelling is on the line, and
// those come from different places: normaliseSupplierName is handed the live
// brands list when the Board Library saves a row, so a brand added in Settings
// keeps the spelling somebody typed, and the read paths call it WITHOUT that
// list, so anything outside the four built-in names is title-cased on the way
// out. IKEA is stored IKEA and offered as Ikea. The line was never empty; the
// box just could not find its own value, and rendered the placeholder.
//
// That is why it looked like three bugs. A read-only cell prints the line and
// looks right; an editable one has to match. So it "vanished" when you opened
// the row to change the type (1), and a duplicate opened in edit mode while its
// original did not (3). Setting the brand again cleared the colour because
// changing supplier is supposed to clear the colour.
//
// TWO. Saving retried without EVERY late column whenever ANY one of them was
// missing, so a database one migration behind silently dropped the supplier,
// the panel use, the grain, the edges, who supplies it, four hinge positions
// and the hardware kind on every save, and reported success (2).
//
// ── THE RULE ─────────────────────────────────────────────────────────────────
//
// A control never shows blank for a value the line holds. A save never drops a
// field the database can take.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  isMissingSupplierNameSchemaError,
  missingLateColumn,
  withoutSupplierName,
} from "../app/api/admin/quotes/[id]/_quote-line-save.js";
import { normaliseSupplierName } from "../lib/pcd-colour-library.js";
import { suppliersForMaterial } from "../lib/pcd-supplier-selection.js";

const EDITOR = readFileSync(new URL("../app/admin/quotes/[id]/QuoteEditor.js", import.meta.url), "utf8");

// The combobox, sliced out so these read the right code.
const TILE_COMBOBOX = (() => {
  const start = EDITOR.indexOf("const QuoteTileCombobox = memo(");
  assert.ok(start > 0, "QuoteTileCombobox should still exist");
  return EDITOR.slice(start, EDITOR.indexOf("\nconst QuoteColourCombobox", start));
})();

// ── One. The box could not find its own value ────────────────────────────────

test("the supplier dropdown matches on spelling, not on ===", () => {
  // The exact match is what emptied the field. Anything that trims and lowers
  // both sides is fine; an === against the raw value is not.
  assert.ok(
    !/\[option\.value, option\.name, option\.label\]\.filter\(Boolean\)\.includes\(value\)/.test(TILE_COMBOBOX),
    "the dropdown must not look its value up with an exact match"
  );
  assert.match(TILE_COMBOBOX, /trim\(\)\.toLowerCase\(\)/);
});

test("a value no option carries is still shown, not dropped", () => {
  // An older line naming a brand we have stopped stocking has to read as that
  // brand, rather than emptying itself the next time somebody opens the row.
  assert.match(TILE_COMBOBOX, /shownOptions/);
  assert.match(TILE_COMBOBOX, /value=\{selected\?\.value \|\| \(wanted \? String\(value\)\.trim\(\) : ""\)\}/);
  // And picking one has to find it in the list that was actually rendered.
  assert.match(TILE_COMBOBOX, /shownOptions\.find\(\(option\) => option\.value === nextValue\)/);
});

test("the two spellings this had to survive really do differ", () => {
  // The library stores what Settings says, because the save is given the brands.
  const stored = normaliseSupplierName("IKEA", [{ key: "IKEA" }]);
  // The read paths are not, so they title-case it.
  const offered = normaliseSupplierName("IKEA");

  assert.equal(stored, "IKEA");
  assert.equal(offered, "Ikea");
  assert.notEqual(stored, offered, "these are the two spellings that emptied the field");
  // A built-in brand is safe either way, which is why this only ever happened
  // on some lines and looked random.
  assert.equal(normaliseSupplierName("polytec"), "Polytec");
  assert.equal(normaliseSupplierName("POLYTEC"), "Polytec");
});

test("the brand list keeps whatever spelling the library row carries", () => {
  // suppliersForMaterial does not re-spell, so a library holding one case and a
  // line holding another is entirely possible. The dropdown has to cope.
  const rows = [
    { supplier_name: "IKEA", material_type: "decorative board" },
    { supplier_name: "ikea", material_type: "decorative board" },
  ];
  assert.deepEqual(suppliersForMaterial(rows, "decorative board"), ["IKEA"]);
});

// ── Two. The save dropped ten fields to get past one ─────────────────────────

const ROW = {
  product_type: "Door",
  supplier_name: "Laminex",
  colour: "Chalk",
  panel_use: "End panel",
  grain_direction: "Vertical",
  hardware_type: null,
  qty: 2,
};

const missing = (column) => ({ code: "PGRST204", message: `Could not find the '${column}' column of 'pcd_quote_line_items' in the schema cache` });

test("a missing column costs that column, and nothing else", () => {
  const saved = withoutSupplierName(ROW, missing("hardware_type"));

  assert.equal("hardware_type" in saved, false, "the column the database named should go");
  assert.equal(saved.supplier_name, "Laminex", "the supplier must survive somebody else's missing column");
  assert.equal(saved.panel_use, "End panel");
  assert.equal(saved.grain_direction, "Vertical");
  assert.equal(saved.colour, "Chalk");
  assert.equal(saved.qty, 2);
});

test("the column the error names is the column that is dropped", () => {
  assert.equal(missingLateColumn(missing("supplier_name")), "supplier_name");
  assert.equal(missingLateColumn(missing("grain_direction")), "grain_direction");
  assert.equal(missingLateColumn({ code: "PGRST204", message: "some other column" }), "");
  assert.equal(missingLateColumn({ code: "23505", message: "supplier_name" }), "", "only a schema cache miss counts");
  assert.equal(missingLateColumn(null), "");
  // The old name still answers the same question, because six routes ask it.
  assert.equal(isMissingSupplierNameSchemaError(missing("panel_use")), true);
  assert.equal(isMissingSupplierNameSchemaError(null), false);
});

test("the save retries per column rather than giving up on all of them", () => {
  const save = readFileSync(new URL("../app/api/admin/quotes/[id]/_quote-line-save.js", import.meta.url), "utf8");
  const fn = save.slice(save.indexOf("async function saveQuoteLineRow"), save.indexOf("export function cabinetConfigRow"));
  assert.match(fn, /for \(let attempt = 0; attempt < LATE_COLUMNS\.length; attempt\+\+\)/);
  assert.match(fn, /missingLateColumn\(result\.error\)/);
});

test("every route that retries a bulk write says which column failed", () => {
  // Passing the row alone falls back to dropping all eleven, which is the
  // behaviour this fixes. Each of these has an error in hand, so each passes it.
  for (const path of [
    "../app/api/admin/quote-requests/route.js",
    "../app/api/admin/quotes/route.js",
    "../app/api/admin/quotes/[id]/duplicate/route.js",
    "../app/api/admin/quotes/[id]/import-order-form/route.js",
    "../app/api/admin/quotes/[id]/reprice/route.js",
    "../app/api/admin/quotes/[id]/route.js",
  ]) {
    const text = readFileSync(new URL(path, import.meta.url), "utf8");
    const calls = text.match(/withoutSupplierName\([^)]*\)/g) || [];
    assert.ok(calls.length, `${path} should still retry`);
    for (const call of calls) {
      assert.match(call, /,/, `${path}: ${call} must say which column failed`);
    }
  }
});

test("with no error to read, the old all or nothing behaviour is still there", () => {
  // A caller that cannot say which column failed must still get a row that
  // saves, rather than one that fails again.
  const saved = withoutSupplierName(ROW);
  assert.equal("supplier_name" in saved, false);
  assert.equal("grain_direction" in saved, false);
  assert.equal(saved.colour, "Chalk", "only the late columns are ever dropped");
});
