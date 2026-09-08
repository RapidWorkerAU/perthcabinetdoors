// EVERY TABLE ON THE QUOTE IS THE SAME TABLE.
//
// ── THE FAULT ────────────────────────────────────────────────────────────────
//
// The column widths were scaled to whatever columns a group happened to need. A
// board group has Edge, Profile and Hinges; a hardware group has none of them.
// So the hardware table divided the page between six columns where the board
// table above it divided the same page between nine, and every column on it
// came out half as wide again. Size and Qty on the hardware table were visibly
// wider than the same two columns on the board table directly above.
//
// The other half of it was the item name. Every value on the table was wrapped
// before it was drawn except that one, so a name longer than its column ran out
// over the rule and across the next cell. "Blum TANDEMBOX antaro Drawer Runners
// 450NL 30kg Pair" is a real product and it did exactly that.
//
// ── THE RULE ─────────────────────────────────────────────────────────────────
//
// The shared columns are laid out against the full set, so they are one width
// for the whole document. The width the missing columns would have taken goes
// to Item, which is the column on a hardware row that needs it. And nothing is
// drawn without being wrapped first, by word.

import test from "node:test";
import assert from "node:assert/strict";

import { quoteCellLines, quoteColumnsFor } from "../lib/pcd-cabinet-pdf.js";

const board = {
  hardware: false,
  configKeys: ["edge", "profile", "hinges"],
};
const hardware = { hardware: true, configKeys: [] };
const partial = { hardware: false, configKeys: ["hinges"] };

const widths = (group) =>
  Object.fromEntries(quoteColumnsFor(group).map((column) => [column.key, column.width]));

const SHARED = ["index", "size", "qty", "unit", "total"];

test("the shared columns are the same width on every table", () => {
  const a = widths(board);
  const b = widths(hardware);
  const c = widths(partial);

  for (const key of SHARED) {
    assert.equal(b[key], a[key], `${key} should be the same on a hardware table`);
    assert.equal(c[key], a[key], `${key} should be the same on a partly configured table`);
  }
});

test("the width the missing columns would have taken goes to the item", () => {
  const a = widths(board);
  const b = widths(hardware);

  assert.ok(b.item > a.item, "a hardware row should have a wider item column");
  // Everything Edge, Profile and Hinges would have taken, and nothing else.
  assert.equal(b.item, a.item + a.edge + a.profile + a.hinges);
});

test("no table is drawn wider than the page", () => {
  // The symptom of this one is the last column hanging off the right edge, one
  // render and one download after the mistake.
  const total = (group) => quoteColumnsFor(group).reduce((sum, column) => sum + column.width, 0);
  const full = total(board);
  assert.equal(total(hardware), full, "a hardware table fills the same width");
  assert.equal(total(partial), full, "so does a partly configured one");
  assert.ok(full > 0);
});

test("a group with no columns of its own still leaves the item readable", () => {
  // The floor exists so a page size or a share nobody has thought about yet
  // cannot squeeze the name to nothing.
  const b = widths(hardware);
  assert.ok(b.item >= 60, "the item column has a floor");
});

test("every column a group asks for is a column it gets", () => {
  const keys = quoteColumnsFor(board).map((column) => column.key);
  assert.deepEqual(keys, ["index", "item", "size", "qty", "edge", "profile", "hinges", "unit", "total"]);
  assert.deepEqual(quoteColumnsFor(hardware).map((c) => c.key), ["index", "item", "size", "qty", "unit", "total"]);
});

// ── WHAT THE ITEM CELL HOLDS ────────────────────────────────────────────────
//
// THE GROUPING IS THE POINT. Lines are gathered under a board heading so that
// the material, the finish and the colour are said once at the top instead of
// on every row. A change that put all three back under every item name undid
// the whole reason the tables are grouped, and it looked like an improvement
// while it was being written.

const ITEM_COLUMN = quoteColumnsFor({ configKeys: ["edge", "profile", "hinges"] }).find((c) => c.key === "item");
// Joined with a space, because a cell is a list of WRAPPED lines: a name or a
// note longer than the column arrives here already broken across two of them.
const cell = (line) => quoteCellLines(line, ITEM_COLUMN).map((part) => part.text).join(" ");

const boardLine = {
  product_type: "Door", material: "Decorative Board", finish: "Matt", colour: "Classic White",
  height_mm: 800, width_mm: 497, qty: 3,
};
const hardwareLine = {
  product_type: "Hardware", product_name: "Blum TANDEMBOX antaro Drawer Runners 450NL 30kg Pair", qty: 4,
};

test("a board row does not repeat what its group heading already says", () => {
  const text = cell(boardLine);
  assert.equal(text, "Door", "the name, and nothing the heading has already said");
  for (const said of ["Decorative Board", "Matt", "Classic White", "Material", "Finish", "Colour"]) {
    assert.ok(!text.includes(said), said + " is on the group heading and must not be on the row");
  }
});

test("a hardware row says which one it is, because it has no heading to carry it", () => {
  const text = cell(hardwareLine);
  assert.ok(text.includes("Blum TANDEMBOX"), "the row names the item");
  assert.ok(text.includes("450NL 30kg Pair"), "and all of it, wrapped rather than cut off");
});

test("a long name wraps by word instead of running out over the rule", () => {
  const parts = quoteCellLines(hardwareLine, ITEM_COLUMN);
  assert.ok(parts.length > 2, "the label, then a name too long for one line");

  // The bold line is the kind. Everything under it is the quiet type.
  assert.equal(parts[0].text, "Hardware");
  assert.equal(parts[0].bold, true);
  assert.ok(parts.slice(1).every((part) => !part.bold), "nothing under the label is bold");

  // And the name is wrapped at the spaces, so no line starts or ends mid word.
  const rejoined = parts.slice(1).map((part) => part.text).join(" ");
  assert.equal(rejoined, hardwareLine.product_name);
});

test("the note reads under the line it is about, not behind a button", () => {
  // It was a column with a button that opened a dialog: three clicks and a
  // layer over the page to read one sentence, on the one screen a customer is
  // meant to check and answer.
  const parts = quoteCellLines({ ...boardLine, client_note: "Door number 4" }, ITEM_COLUMN);
  assert.equal(parts[0].text, "Door");
  assert.equal(parts[0].bold, true);
  assert.equal(parts[1].text, "Note: Door number 4");
  assert.ok(!parts[1].bold, "the note is not bold");
  assert.equal(parts[1].muted, true);
});

test("who supplies it is said, when it is not us", () => {
  const ours = cell({ ...hardwareLine, supplied_by: "We supply" });
  const theirs = cell({ ...hardwareLine, supplied_by: "Customer supplies" });
  assert.ok(!ours.includes("Supplied by"), "our own supply is the normal case and goes unsaid");
  assert.ok(theirs.includes("Supplied by Customer supplies"));
});

test("a note still prints under the name, on either kind of line", () => {
  assert.ok(cell({ ...boardLine, client_note: "Door number 4" }).includes("Note: Door number 4"));
  assert.ok(cell({ ...hardwareLine, client_note: "Soft close" }).includes("Note: Soft close"));
});
