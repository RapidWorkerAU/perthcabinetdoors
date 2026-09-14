// REPRICE PULLS FROM EVERY OPTION LIBRARY, NOT JUST THE BOARDS.
//
// The button said "Reprice from colour library" and did exactly that, so a
// hinge price rise reached nothing on an open quote and a benchtop, which is
// only ever stored with a rate of zero and priced at import, could not be
// refreshed at all. Renamed and widened 13 September 2026.
//
// Three libraries have prices in them: Board, Hardware and Benchtop. The
// Profile Library holds no cost, so there is nothing in it to reprice, and it
// is deliberately absent rather than forgotten.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  CATALOGUES, catalogueForLine, catalogueLabel, catalogueNameForLine, matchCatalogueCost,
} from "../lib/pcd-catalogue-cost.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const ROUTE = read("app/api/admin/quotes/[id]/reprice/route.js");
const EDITOR = read("app/admin/quotes/[id]/QuoteEditor.js");

const HINGE = { id: "hw-1", brand: "Blum", name: "110 Deg Inserta", unit_cost_ex_gst: 7.22, is_active: true };
const HW = CATALOGUES.find((c) => c.key === "hardware");
const BT = CATALOGUES.find((c) => c.key === "benchtop");

// ── Which libraries ─────────────────────────────────────────────────────────

test("the libraries that carry prices, and only those", () => {
  assert.deepEqual(CATALOGUES.map((c) => c.key), ["hardware", "benchtop"], "boards have their own richer resolver");
  assert.deepEqual(CATALOGUES.map((c) => c.table), ["pcd_hardware", "pcd_benchtop_materials"]);
  // The Profile Library has no cost column, so it is not here.
  assert.ok(!CATALOGUES.some((c) => c.table.includes("profile")));
});

test("a line knows which library prices it", () => {
  assert.equal(catalogueForLine({ product_type: "Hardware" }).key, "hardware");
  assert.equal(catalogueForLine({ product_type: "Benchtop" }).key, "benchtop");
  assert.equal(catalogueForLine({ product_type: "Door" }), null, "a door is a board");
  assert.equal(catalogueForLine({ product_type: "base_cabinet" }), null);
});

// ── Matching ────────────────────────────────────────────────────────────────

test("the id on the line wins, and brings the library's own name with it", () => {
  const match = matchCatalogueCost([HINGE], { sourceId: "hw-1", name: "whatever" }, HW);
  assert.equal(match.ok, true);
  assert.equal(match.cost, 7.22);
  assert.equal(match.matchedBy, "id");
  assert.equal(match.label, "Blum 110 Deg Inserta", "so a row renamed since reads as what we sell");
});

test("no id falls back to the name, and refuses to guess between two prices", () => {
  const rows = [HINGE, { id: "hw-2", brand: "Blum", name: "Soft Close", unit_cost_ex_gst: 9.4, is_active: true }];
  const byName = matchCatalogueCost(rows, { name: "Blum 110 Deg Inserta" }, HW);
  assert.equal(byName.ok, true);
  assert.equal(byName.matchedBy, "name");
  assert.equal(byName.cost, 7.22);

  // Two rows of the same name at different money is a catalogue problem, and
  // picking one at random on somebody's quote is the worst way to surface it.
  const dupes = [HINGE, { ...HINGE, id: "hw-3", unit_cost_ex_gst: 11 }];
  const clash = matchCatalogueCost(dupes, { name: "Blum 110 Deg Inserta" }, HW);
  assert.equal(clash.ok, false);
  assert.equal(clash.reason, "ambiguous");
  assert.match(clash.message, /different prices/);

  // Same name, same price, is not an ambiguity worth stopping for.
  const same = matchCatalogueCost([HINGE, { ...HINGE, id: "hw-4" }], { name: "Blum 110 Deg Inserta" }, HW);
  assert.equal(same.ok, true);
});

test("a stale id falls through to the name rather than failing", () => {
  const match = matchCatalogueCost([HINGE], { sourceId: "gone", name: "Blum 110 Deg Inserta" }, HW);
  assert.equal(match.ok, true);
  assert.equal(match.matchedBy, "name");
  assert.equal(match.id, "hw-1");
});

test("a row with no price leaves the line alone rather than wiping it", () => {
  // Much of the catalogue is costed by hand at quote time. "The library has
  // nothing to say" is not the same as "this is worth nothing".
  const free = matchCatalogueCost([{ ...HINGE, unit_cost_ex_gst: 0 }], { sourceId: "hw-1" }, HW);
  assert.equal(free.ok, false);
  assert.equal(free.reason, "unpriced");
  assert.match(free.message, /no price in the library yet/);
});

test("a line naming nothing at all is reported, not guessed at", () => {
  const none = matchCatalogueCost([HINGE], {}, HW);
  assert.equal(none.ok, false);
  assert.equal(none.reason, "not_found");
  assert.match(none.message, /does not name a library row/);
});

test("a benchtop is looked up by its material, not the word Benchtop", () => {
  const rows = [{ id: "bt-1", name: "Laminate", cost_per_sqm_ex_gst: 150, is_active: true }];
  // Every benchtop line is called "Benchtop"; the material is the useful name.
  const line = { product_type: "Benchtop", product_name: "Benchtop", material: "Laminate" };
  assert.equal(catalogueNameForLine(line, BT), "Laminate");
  const match = matchCatalogueCost(rows, { name: catalogueNameForLine(line, BT) }, BT);
  assert.equal(match.ok, true);
  assert.equal(match.cost, 150);
  assert.equal(catalogueLabel(rows[0], BT.nameFields), "Laminate");
});

test("each library writes to the rate field that line is priced by", () => {
  // Hardware is per piece, a benchtop is per square metre. Writing one into
  // the other would put a $150 hinge or a 7 cent benchtop on a quote.
  assert.equal(HW.rateField, "product_unit_cost_ex_gst");
  assert.equal(BT.rateField, "unit_cost_per_sqm_ex_gst");
});

// ── Wired up ────────────────────────────────────────────────────────────────

test("the route prices from every catalogue, and only fetches the ones it needs", () => {
  assert.match(ROUTE, /for \(const catalogue of CATALOGUES\)/);
  assert.match(ROUTE, /if \(!catalogue\.productTypes\.some\(\(t\) => wantedTypes\.has\(t\)\)\) continue/);
  assert.match(ROUTE, /\.eq\("is_active", true\)/, "a retired row is not a price");
  assert.match(ROUTE, /const catalogue = catalogueForLine\(line\)/);
  assert.match(ROUTE, /\[catalogue\.rateField\]: match\.cost/);
  // Hardware and benchtop are no longer skipped outright.
  assert.ok(!/NON_BOARD_PRODUCT_TYPES/.test(ROUTE));
});

test("a typed price with no library row behind it is still left alone", () => {
  // Hardware is STORED as manual, which is not the same as overridden. The
  // override on these lines is a price with no row named beside it.
  assert.match(ROUTE, /if \(!named && !includeManual && Number\(line\[catalogue\.rateField\] \|\| 0\) > 0\) \{ skipped \+= 1; continue; \}/);
});

test("the report says which library moved what", () => {
  assert.match(ROUTE, /const byLibrary = \{ board: 0, hardware: 0, benchtop: 0 \}/);
  assert.match(ROUTE, /byLibrary\[catalogue\.key\] \+= 1/);
  assert.match(ROUTE, /byLibrary\.board \+= 1/);
  assert.match(ROUTE, /title: "Quote repriced from the option libraries"/);
  // One number for three libraries reads as if the boards changed when it was
  // the hardware that went up.
  assert.match(EDITOR, /const by = payload\.byLibrary \|\| \{\}/);
  assert.match(EDITOR, /by\.hardware \? by\.hardware \+ " hardware" : ""/);
});

test("the button says what it now does", () => {
  assert.match(EDITOR, /'Reprice from option libraries'/);
  assert.ok(!/Reprice from colour library/.test(EDITOR));
  assert.match(EDITOR, /Every line already matches the option libraries\./);
  assert.match(EDITOR, /boards, hardware and benchtops/);
});
