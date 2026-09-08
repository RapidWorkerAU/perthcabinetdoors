// A FILLER IS A PANEL, AND THE ROW SHOULD SAY FILLER.
//
// ── THE FAULT ────────────────────────────────────────────────────────────────
//
// The Type cell on the quote items table offered five words: Door, Drawer
// front, Panel, Table top, Hardware, plus Benchtop and Base cabinet. A filler,
// a scribe, a kickboard and an end panel all had to be entered as "Panel" and
// nothing more.
//
// panel_use has existed the whole time and is exactly this answer. The Excel
// order form asks it, the quote request carries it, the saver writes it. It
// simply had no cell anywhere on the quote editor, so a line typed by hand
// could never carry one, and six panels on a quote read as six lines called
// Panel. A scribe went into the notes or nowhere.
//
// ── THE RULE ─────────────────────────────────────────────────────────────────
//
// The picker offers the kinds, and picking one sets BOTH fields. Underneath it
// is still a Panel, so the same materials are offered, the same fields asked
// and the same rules price it. The only thing that changes is that the row can
// say what it is.
//
// The kinds come from PANEL_USES, so one added in Settings, Lists appears in
// the picker without anybody editing a screen, and the label is the panel use
// spelt exactly as it is there. Two names for one thing is how vocabularies
// drift apart.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  PANEL_USES,
  itemTypeFromValue,
  itemTypeGroup,
  itemTypeLabel,
  itemTypeOptions,
  itemTypeValue,
  panelUseFor,
} from "../lib/pcd-line-details.js";
import { PRODUCT_TYPES, materialsForProductType } from "../lib/pcd-materials.js";
import { quoteLineRow } from "../app/api/admin/quotes/[id]/_quote-line-save.js";

const EDITOR = readFileSync(new URL("../app/admin/quotes/[id]/QuoteEditor.js", import.meta.url), "utf8");
const OPTIONS = itemTypeOptions({ productTypes: PRODUCT_TYPES });
const labels = OPTIONS.map((o) => o.label);

// ── The kinds are on the list ────────────────────────────────────────────────

test("a scribe is a kind of panel, and it is on the list", () => {
  assert.ok(PANEL_USES.includes("Scribe"), "Scribe should be a panel use");
  assert.ok(labels.includes("Scribe"), "Scribe should be pickable as an item type");
  assert.ok(labels.includes("Filler"), "Filler should be pickable as an item type");
});

test("every panel use is offered, so the list cannot fall behind Settings", () => {
  for (const use of PANEL_USES) {
    assert.ok(labels.includes(use), `${use} should be on the item type list`);
  }
  // A use added in Settings turns up without this file or the screen changing.
  const withCustom = itemTypeOptions({ productTypes: PRODUCT_TYPES, panelUses: [...PANEL_USES, "Post"] });
  assert.ok(withCustom.some((o) => o.label === "Post" && o.product_type === "Panel"));
});

test("what a panel can be is a short list of things we actually make", () => {
  // Bulkhead and Upstand are not things we make. "Other" answers nothing: a
  // panel nobody has named already reads as Panel, which says the same without
  // looking like somebody chose it.
  for (const gone of ["Bulkhead", "Upstand", "Other"]) {
    assert.equal(PANEL_USES.includes(gone), false, gone + " should not be a panel use");
    assert.equal(labels.includes(gone), false, gone + " should not be pickable");
    // And it is not quietly accepted from a spreadsheet either.
    assert.equal(panelUseFor("Panel", gone), "", gone + " should not survive being typed at us");
  }
  assert.deepEqual(PANEL_USES, ["End panel", "Filler", "Scribe", "Kickboard", "Shelf", "Back panel"]);
});

test("the words are taken out of the list rows too, not just the code", () => {
  // They live in two places and both are read: the built-in list this file
  // exports, and pcd_list_items, which is what the Excel order form's dropdown
  // is written from. Changing one leaves the spreadsheet offering the other.
  const migration = readFileSync(new URL("../supabase/202609081000_pcd_panel_uses.sql", import.meta.url), "utf8");
  assert.ok(migration.includes("delete from public.pcd_list_items"));
  assert.ok(
    migration.includes("item_key in ('Bulkhead', 'Upstand', 'Other')"),
    "all three should be deleted by name"
  );
  // And Scribe is put in, or the spreadsheet would not offer it.
  assert.ok(migration.includes("insert into public.pcd_list_items"));
  assert.ok(migration.includes("'Scribe', 'Scribe'"));
  // One runnable block, the way every migration here is written.
  assert.ok(migration.includes("begin;"));
  assert.ok(migration.trimEnd().endsWith("commit;"));
});

test("plain Panel is still there, for a panel nobody has said the kind of", () => {
  const plain = OPTIONS.find((o) => o.label === "Panel");
  assert.ok(plain, "Panel itself must stay on the list");
  assert.equal(plain.panel_use, "", "plain Panel carries no kind");
  assert.equal(plain.value, "Panel");
});

test("the kinds are grouped with the panels, and hardware is not a front", () => {
  assert.equal(itemTypeGroup("Panel"), "Panels");
  assert.equal(itemTypeGroup("Scribe") === "Panels", false, "a group is asked of a product type, not a use");
  assert.equal(itemTypeGroup("Door"), "Fronts and tops");
  assert.equal(itemTypeGroup("Table top"), "Fronts and tops");
  assert.equal(itemTypeGroup("Hardware"), "Everything else");
  for (const use of PANEL_USES) {
    assert.equal(OPTIONS.find((o) => o.label === use).group, "Panels");
  }
});

// ── Underneath, it is still a Panel ──────────────────────────────────────────

test("picking a kind sets both fields, and only ever a real one", () => {
  assert.deepEqual(itemTypeFromValue("Panel :: Filler"), { product_type:"Panel", panel_use:"Filler" });
  assert.deepEqual(itemTypeFromValue("Panel :: Scribe"), { product_type:"Panel", panel_use:"Scribe" });
  assert.deepEqual(itemTypeFromValue("Door"), { product_type:"Door", panel_use:"" });
  // A kind only means something on a panel. A door is not a filler.
  assert.deepEqual(itemTypeFromValue("Door :: Filler"), { product_type:"Door", panel_use:"" });
  // And a word nobody offers is not a kind.
  assert.deepEqual(itemTypeFromValue("Panel :: Gubbins"), { product_type:"Panel", panel_use:"" });
});

test("changing a filler to a door leaves no kind behind", () => {
  // The picker always answers with both fields, so the old one cannot survive.
  const patch = itemTypeFromValue("Door");
  assert.equal(patch.panel_use, "");
  // And the saver refuses it a second time, whatever reaches it.
  assert.equal(panelUseFor("Door", "Filler"), "");
  assert.equal(quoteLineRow({ product_type:"Door", panel_use:"Filler" }, 0, {}).panel_use, null);
});

test("a filler is offered exactly the materials a panel is", () => {
  // The whole point of keeping it a Panel: nothing downstream has to learn a
  // new word to go on offering the same things.
  const panel = materialsForProductType("Panel");
  const filler = materialsForProductType(itemTypeFromValue("Panel :: Filler").product_type);
  assert.deepEqual(filler, panel);
  assert.ok(panel.includes("Decorative Board") && panel.includes("Thermolaminate"));
  // A table top is the one front that is genuinely narrower, and it still is.
  assert.equal(materialsForProductType("Table top").includes("Thermolaminate"), false);
});

test("a filler saves as a Panel, with its kind on it", () => {
  const row = quoteLineRow({ product_type:"Panel", panel_use:"Scribe", qty:2 }, 0, {});
  assert.equal(row.product_type, "Panel");
  assert.equal(row.panel_use, "Scribe");
});

// ── The row says what it is ──────────────────────────────────────────────────

test("a panel with a kind reads as that kind", () => {
  assert.equal(itemTypeLabel({ product_type:"Panel", panel_use:"Filler" }), "Filler");
  assert.equal(itemTypeLabel({ product_type:"Panel", panel_use:"Scribe" }), "Scribe");
  assert.equal(itemTypeLabel({ product_type:"Panel" }), "Panel");
  assert.equal(itemTypeLabel({ product_type:"Door", panel_use:"Filler" }), "Door");
  assert.equal(itemTypeLabel({}), "");
});

test("the picker finds the line it is showing", () => {
  // The value has to match an option or the cell renders empty, which is the
  // bug the supplier cell had.
  const values = OPTIONS.map((o) => o.value);
  assert.ok(values.includes(itemTypeValue({ product_type:"Panel", panel_use:"Filler" })));
  assert.ok(values.includes(itemTypeValue({ product_type:"Panel" })));
  assert.ok(values.includes(itemTypeValue({ product_type:"Door" })));
  // A legacy panel carrying a use we no longer offer falls back to Panel rather
  // than showing nothing.
  assert.equal(itemTypeValue({ product_type:"Panel", panel_use:"Gubbins" }), "Panel");
});

// ── The screen reads the shared list ─────────────────────────────────────────

test("the quote editor builds its type list from the shared one", () => {
  assert.match(EDITOR, /itemTypeOptions\(\{ productTypes: PRODUCT_TYPES \}\)/);
  assert.match(EDITOR, /onChange=\{option => updateProductLine\(index, itemTypeFromValue\(/);
  assert.match(EDITOR, /onChange=\{option => updateProductLine\(idx, itemTypeFromValue\(/);
  // Both the row and the phone card read the kind back.
  assert.match(EDITOR, /value=\{itemTypeValue\(line\)\}/);
  assert.equal((EDITOR.match(/value=\{itemTypeValue\(line\)\}/g) || []).length, 2, "the table and the phone card");
  assert.match(EDITOR, /displayLineType\(line\)/);
  // And a line carries the field, so a new one is not missing it.
  assert.match(EDITOR, /^ {2}panel_use: "",$/m);
});

test("the kinds are shown grouped, not as one long list", () => {
  assert.match(EDITOR, /group: t\.group/);
});
