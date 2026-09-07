// HOW MANY BOARDS DOES THIS QUOTE NEED?
//
// ── THE FAULT ────────────────────────────────────────────────────────────────
//
// A quote said what we were making and never said what to buy. Working it out
// meant adding up square metres and dividing by 2.88, which is wrong twice: it
// assumes a 2100 door and a 400 bulkhead share a board neatly, and it ignores
// grain. Four tall doors that all have to run the same way take two boards
// however the square metres divide.
//
// ── THE RULE ─────────────────────────────────────────────────────────────────
//
// GRAIN BELONGS TO THE BOARD. A solid colour has no direction, so every panel
// cut from it can be turned to pack tighter whatever the line says. Only once
// the board has a grain does the line's own answer matter. That is why
// has_grain is a colour library field and not a quote field.
//
// BOARD SIZE BELONGS TO THE BOARD TOO, and always did: it has been on
// pcd_colour_library since the August 2026 price update. This reads it rather
// than assuming 1200 x 2400, and says out loud when a row has no size.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  BOARD_ORDER_DEFAULTS,
  FALLBACK_BOARD,
  boardKey,
  boardOrderText,
  buildBoardOrder,
  finishLooksGrained,
  grainAxisFor,
  nestPanels,
  normalizeBoardOrderSettings,
} from "../lib/pcd-board-order.js";
import { calculateCabinetCutList, calculateCabinetMaterialCost, cutPieceRole } from "../lib/pcd-cabinet-utils.js";
import { DEFAULT_BUSINESS_DEFAULTS, normalizeBusinessDefaults } from "../lib/pcd-quote-utils.js";
import { businessDefaultsToDbRow } from "../lib/pcd-business-defaults.js";

const MIGRATION = readFileSync(new URL("../supabase/202609071900_pcd_board_order.sql", import.meta.url), "utf8");
const COLOUR_LIB = readFileSync(new URL("../lib/pcd-colour-library.js", import.meta.url), "utf8");

// A grained board and a plain one, as the colour library hands them over.
const COLOURS = [
  { id: "c1", supplier: "Polytec", colour: "Sepia Oak", finish: "Ravine", thicknessMm: 18,
    boardWidthMm: 1200, boardHeightMm: 2400, hasGrain: true },
  { id: "c2", supplier: "Polytec", colour: "Classic White", finish: "Matt", thicknessMm: 16,
    boardWidthMm: 1800, boardHeightMm: 3600, hasGrain: false },
];

const line = (over = {}) => ({
  id: "l1", product_type: "Door", supplier_name: "Polytec", colour: "Sepia Oak",
  finish: "Ravine", thickness: "18mm", height_mm: 720, width_mm: 397, qty: 1,
  grain_direction: "Standard", ...over,
});

const run = (lines, settings = {}) => buildBoardOrder({ lines, colours: COLOURS, settings });
const only = (result) => {
  assert.equal(result.groups.length, 1, "expected exactly one board");
  return result.groups[0];
};

// ── Grain belongs to the board ───────────────────────────────────────────────

test("a board with no grain lets every panel turn, whatever the line says", () => {
  const board = { has_grain: false };
  for (const said of ["Standard", "Vertical", "Horizontal", "No grain", ""]) {
    assert.equal(
      grainAxisFor({ grain_direction: said, product_type: "Door" }, BOARD_ORDER_DEFAULTS, board),
      "free",
      `a plain board should not lock a line saying ${said || "nothing"}`
    );
  }
});

test("a grained board honours what the line says", () => {
  const board = { has_grain: true };
  const axis = (said, settings = BOARD_ORDER_DEFAULTS) =>
    grainAxisFor({ grain_direction: said, product_type: "Door" }, settings, board);

  assert.equal(axis("Vertical"), "height");
  assert.equal(axis("Horizontal"), "width");
  assert.equal(axis("No grain"), "free");
  assert.equal(axis("Standard"), "height");
});

test("Standard means what the quote says it means, and only for a drawer front", () => {
  const board = { has_grain: true };
  const byType = { ...BOARD_ORDER_DEFAULTS, standard_grain: "by_type" };

  assert.equal(grainAxisFor({ grain_direction: "Standard", product_type: "Drawer front" }, byType, board), "width");
  assert.equal(grainAxisFor({ grain_direction: "Standard", product_type: "Door" }, byType, board), "height");
  // The house rule, unchanged, runs everything up the height.
  assert.equal(
    grainAxisFor({ grain_direction: "Standard", product_type: "Drawer front" }, BOARD_ORDER_DEFAULTS, board),
    "height"
  );
});

test("a carcass panel has no grain answer of its own, so it takes the house rule", () => {
  const panel = { source: "carcass", grain_direction: "", product_type: "Carcass" };
  assert.equal(grainAxisFor(panel, BOARD_ORDER_DEFAULTS, { has_grain: true }), "height");
  assert.equal(grainAxisFor(panel, BOARD_ORDER_DEFAULTS, { has_grain: false }), "free");
});

test("grain costs boards, and the tab can say how many", () => {
  // Six 1150 x 600 panels on a 1200 x 2400 board, trimmed 10 all round, so
  // 1180 x 2380 is usable.
  //
  // Locked upright: 600 + kerf + 600 is 1203, which does not fit 1180, so one
  // per run, and 1150 + kerf + 1150 fits the 2380, so two runs per board.
  // Two per board, three boards.
  //
  // Turned on their side: one per run again, but the runs are only 600 deep so
  // three fit down the board. Three per board, two boards.
  const panels = [line({ height_mm: 1150, width_mm: 600, qty: 6, grain_direction: "Vertical" })];
  const grained = only(run(panels));
  assert.equal(grained.boards, 3);
  assert.equal(grained.boards_if_no_grain, 2);
  assert.equal(grained.grain_cost_boards, 1, "the grain should be costing exactly one board");
  assert.equal(grained.boards - grained.boards_if_no_grain, grained.grain_cost_boards);

  // The same panels on a board with no grain really do take two.
  const free = only(run(panels, { boards: { [grained.key]: { has_grain: false } } }));
  assert.equal(free.boards, 2, "turning the panels should save a board");
  assert.equal(free.grain_cost_boards, 0, "a plain board cannot be costing anything for grain");
});

test("what the grain costs is never a negative number", () => {
  // The nester is greedy, so which way round it is handed the panels decides
  // what it finds. Handed seven 300 x 1150 panels tall first it used two boards
  // where the grained layout used one, which came out as grain SAVING a board.
  // A board with no grain can always do at least what a grained one did.
  for (const [height, width, qty] of [[300, 1150, 7], [2100, 497, 4], [1150, 300, 7], [900, 400, 6]]) {
    const group = only(run([line({ height_mm: height, width_mm: width, qty, grain_direction: "Vertical" })]));
    assert.ok(
      group.boards_if_no_grain <= group.boards,
      `${qty} x ${height}x${width}: no grain should never need more boards than a grain does`
    );
    assert.ok(group.grain_cost_boards >= 0);
  }
});

// ── Where each answer comes from ─────────────────────────────────────────────

test("the board size comes from the colour library", () => {
  const group = only(run([line({ colour: "Classic White", finish: "Matt", thickness: "16mm" })]));
  assert.equal(group.board.width_mm, 1800);
  assert.equal(group.board.length_mm, 3600);
  assert.equal(group.board.size_source, "library");
});

test("a colour with no size in the library is counted at the default and says so", () => {
  const group = only(run([line({ colour: "Chalk", finish: "Silk", supplier_name: "Laminex" })]));
  assert.equal(group.board.width_mm, FALLBACK_BOARD.width_mm);
  assert.equal(group.board.length_mm, FALLBACK_BOARD.length_mm);
  assert.equal(group.board.size_source, "fallback");
  assert.equal(run([line({ colour: "Chalk", finish: "Silk" })]).totals.boards_without_library_size, 1);
});

test("what the quote sets beats the library, and is marked as the quote's", () => {
  const key = boardKey({ supplier: "Polytec", colour: "Sepia Oak", finish: "Ravine", thickness: 18 });
  const group = only(run([line()], { boards: { [key]: { width_mm: 1800, length_mm: 3600 } } }));

  assert.equal(group.board.width_mm, 1800);
  assert.equal(group.board.size_source, "quote");
  // And the library's own answer is still there to go back to.
  assert.equal(group.board.library_width_mm, 1200);
  assert.equal(group.board.library_length_mm, 2400);
});

test("grain is the library's answer when it has one, and a flagged guess when it does not", () => {
  const fromLibrary = only(run([line()]));
  assert.equal(fromLibrary.board.has_grain, true);
  assert.equal(fromLibrary.board.grain_source, "library");

  // A colour the library has never been asked about. Ravine is a woodgrain, so
  // the guess is right, but it must still read as a guess.
  const guessed = only(run([line({ colour: "Notaio Walnut" })]));
  assert.equal(guessed.board.has_grain, true);
  assert.equal(guessed.board.grain_source, "finish");
  assert.equal(run([line({ colour: "Notaio Walnut" })]).totals.boards_guessing_grain, 1);

  // A library row saying false beats the finish name guessing true.
  const plain = COLOURS.concat([{
    supplier: "Polytec", colour: "Tempest", finish: "Ravine", thicknessMm: 18,
    boardWidthMm: 1200, boardHeightMm: 2400, hasGrain: false,
  }]);
  const overruled = buildBoardOrder({ lines: [line({ colour: "Tempest" })], colours: plain, settings: {} }).groups[0];
  assert.equal(overruled.board.has_grain, false);
  assert.equal(overruled.board.grain_source, "library");
});

test("the finish name guess is the same list the migration seeds from", () => {
  for (const finish of ["Ravine", "Woodmatt", "Ashgrain", "Natura", "Notaio", "Nuance", "Woodgrain"]) {
    assert.equal(finishLooksGrained(finish), true, `${finish} should read as grained`);
    assert.ok(MIGRATION.toLowerCase().includes(`'${finish.toLowerCase()}'`), `${finish} should be seeded true`);
  }
  for (const finish of ["Matt", "Gloss", "Legato", "Venette", "Silk", ""]) {
    assert.equal(finishLooksGrained(finish), false, `${finish || "blank"} should not read as grained`);
  }
});

// ── Cabinets ─────────────────────────────────────────────────────────────────

const CABINET_LINE = {
  id: "cab", product_type: "base_cabinet", supplier_name: "Polytec", qty: 1,
  cabinet_config: {
    label: "Base cabinet", height_mm: 720, width_mm: 900, depth_mm: 560,
    carcass_thickness_mm: 16, carcass_colour: "Classic White", carcass_finish: "Matt",
    back_panel_included: true, back_panel_thickness_mm: 6,
    shelf_qty: 1, shelf_colour: "Classic White", shelf_finish: "Matt", shelf_thickness_mm: 16,
  },
};

test("a cabinet's carcass is counted, from the same cut list it is priced from", () => {
  const withCabinets = run([CABINET_LINE]);
  assert.ok(withCabinets.totals.panels > 0, "a cabinet should contribute panels");

  const cutList = calculateCabinetCutList(CABINET_LINE.cabinet_config);
  const expected = cutList.reduce((total, piece) => total + piece.qty, 0);
  assert.equal(withCabinets.totals.panels, expected, "every cut piece should be a panel to order");

  // And turning them off leaves nothing at all on a quote that is only cabinets.
  assert.equal(run([CABINET_LINE], { include_carcass: false }).totals.panels, 0);
});

test("a 6mm back is ordered on its own board, not with the 16mm sides", () => {
  const groups = run([CABINET_LINE]).groups;
  const thicknesses = groups.map((g) => g.board.thickness_mm).sort((a, b) => a - b);
  assert.deepEqual(thicknesses, [6, 16], "the back and the carcass are two different boards");

  const back = groups.find((g) => g.board.thickness_mm === 6);
  assert.equal(back.panels.length, 1, "one back panel");
  assert.equal(back.panels[0].name, "Back panel");
});

test("what a cut piece is has one definition, so its board and its rate agree", () => {
  assert.equal(cutPieceRole("Shelf"), "shelf");
  assert.equal(cutPieceRole("Shelf — left of channel"), "shelf");
  assert.equal(cutPieceRole("Back panel"), "back");
  assert.equal(cutPieceRole("Back panel — wall 2 leg"), "back");
  assert.equal(cutPieceRole("Left side panel"), "carcass");
  assert.equal(cutPieceRole("Rangehood housing divider"), "carcass");

  // A back is still priced at the carcass rate, exactly as it always was.
  const cutList = calculateCabinetCutList(CABINET_LINE.cabinet_config);
  const carcassOnly = calculateCabinetMaterialCost(cutList, 100, 0);
  const backArea = cutList.find((p) => p.label === "Back panel").area_sqm;
  assert.ok(carcassOnly > 0);
  assert.ok(
    Math.abs(carcassOnly - cutList.filter((p) => cutPieceRole(p.label) !== "shelf")
      .reduce((t, p) => t + p.area_sqm * p.qty * 100, 0)) < 0.02,
    "the back should be charged at the carcass rate"
  );
  assert.ok(backArea > 0);
});

// ── The layout ───────────────────────────────────────────────────────────────

test("nothing on a board overlaps anything else, or hangs off the edge", () => {
  const result = run([
    line({ qty: 6 }),
    line({ id: "l2", height_mm: 2100, width_mm: 497, qty: 3, grain_direction: "Vertical" }),
    line({ id: "l3", product_type: "Drawer front", height_mm: 140, width_mm: 897, qty: 4 }),
  ]);
  const group = only(result);
  const trim = group.board.trim_mm;

  for (const sheet of group.layout.sheets) {
    const placed = sheet.runs.flatMap((r) => r.items);
    for (const item of placed) {
      assert.ok(item.x >= -0.01, "a panel started off the left edge");
      assert.ok(item.x + item.across <= group.board.width_mm - 2 * trim + 0.01, "a panel ran off the width");
      assert.ok(item.y + item.along <= group.board.length_mm - 2 * trim + 0.01, "a panel ran off the length");
    }
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i];
        const b = placed[j];
        const apart =
          a.x + a.across <= b.x + 0.01 || b.x + b.across <= a.x + 0.01 ||
          a.y + a.along <= b.y + 0.01 || b.y + b.along <= a.y + 0.01;
        assert.ok(apart, "two panels were laid on top of each other");
      }
    }
  }
});

test("a panel too big for the board is reported, never squeezed on", () => {
  const group = only(run([line({ height_mm: 2500, width_mm: 1300, grain_direction: "Vertical" })]));
  assert.equal(group.layout.sheets.length, 0, "nothing should be ordered for a panel that does not fit");
  assert.equal(group.unplaced.length, 1);
  assert.equal(run([line({ height_mm: 2500, width_mm: 1300 })]).totals.unplaced, 1);
});

test("the kerf is taken off between panels", () => {
  // Three 399 wide doors are 1197 across, which fits a 1200 board only if the
  // blade takes nothing. Two 3.2mm cuts between them puts it over.
  const panels = Array.from({ length: 3 }, () => ({ along: 720, across: 399, rotatable: false }));
  const noKerf = nestPanels(panels, { width_mm: 1200, length_mm: 2400, kerf_mm: 0, trim_mm: 0 });
  const withKerf = nestPanels(panels, { width_mm: 1200, length_mm: 2400, kerf_mm: 3.2, trim_mm: 0 });

  assert.equal(noKerf.sheets[0].runs[0].items.length, 3);
  assert.equal(withKerf.sheets[0].runs[0].items.length, 2, "the third door should not fit once the blade is counted");
});

test("the trim is taken off all four edges", () => {
  const full = nestPanels([{ along: 2400, across: 1200, rotatable: false }],
    { width_mm: 1200, length_mm: 2400, kerf_mm: 0, trim_mm: 0 });
  const trimmed = nestPanels([{ along: 2400, across: 1200, rotatable: false }],
    { width_mm: 1200, length_mm: 2400, kerf_mm: 0, trim_mm: 10 });

  assert.equal(full.sheets.length, 1);
  assert.equal(trimmed.sheets.length, 0, "a full sheet panel cannot survive a trim");
  assert.equal(trimmed.unplaced.length, 1);
});

// ── What is counted, and what is not ─────────────────────────────────────────

test("hardware and benchtops are left out, and said to be left out", () => {
  const result = run([
    line(),
    { id: "h", product_type: "Hardware", qty: 24 },
    { id: "b", product_type: "Benchtop", width_mm: 3600, height_mm: 600, qty: 1 },
  ]);
  assert.equal(result.groups.length, 1, "only the door is made from board");
  assert.deepEqual(result.excluded_lines.map((e) => e.product_type), ["Hardware", "Benchtop"]);
});

test("a line with no size or no quantity is not counted", () => {
  assert.equal(run([line({ height_mm: 0 })]).totals.panels, 0);
  assert.equal(run([line({ width_mm: null })]).totals.panels, 0);
  assert.equal(run([line({ qty: 0 })]).totals.panels, 0);
});

test("the same colour typed two ways lands on one board", () => {
  const result = run([line(), line({ id: "l2", supplier_name: "polytec", colour: " Sepia Oak ", thickness: "18" })]);
  assert.equal(result.groups.length, 1, "spacing and case must not split a board in two");
  assert.equal(result.groups[0].panels.length, 2);
});

// ── Settings ─────────────────────────────────────────────────────────────────

test("a missing kerf or trim inherits rather than becoming zero", () => {
  const settings = normalizeBoardOrderSettings({}, { kerf_mm: 4.4, trim_mm: 12 });
  assert.equal(settings.kerf_mm, 4.4);
  assert.equal(settings.trim_mm, 12);
  // A zero somebody actually typed is a real answer and is kept.
  assert.equal(normalizeBoardOrderSettings({ trim_mm: 0 }, { trim_mm: 12 }).trim_mm, 0);
});

test("saw kerf and edge trim are Business Defaults, not numbers in the code", () => {
  assert.equal(typeof DEFAULT_BUSINESS_DEFAULTS.saw_kerf_mm, "number");
  assert.equal(typeof DEFAULT_BUSINESS_DEFAULTS.board_edge_trim_mm, "number");

  // Read back off the settings screen, and written to the database. The second
  // half is what the drawer runner rates were missing, which is why they could
  // never be configured.
  const normalized = normalizeBusinessDefaults({ saw_kerf_mm: 4.4, board_edge_trim_mm: 12 });
  assert.equal(normalized.saw_kerf_mm, 4.4);
  assert.equal(normalized.board_edge_trim_mm, 12);

  const row = businessDefaultsToDbRow({ saw_kerf_mm: 4.4, board_edge_trim_mm: 12 });
  assert.equal(row.saw_kerf_mm, 4.4);
  assert.equal(row.board_edge_trim_mm, 12);
});

// ── The database and the order list ──────────────────────────────────────────

test("the migration adds the three things the tab needs", () => {
  assert.match(MIGRATION, /pcd_colour_library[\s\S]*add column if not exists has_grain/);
  assert.match(MIGRATION, /pcd_quotes[\s\S]*add column if not exists board_order_settings jsonb/);
  assert.match(MIGRATION, /add column if not exists saw_kerf_mm/);
  assert.match(MIGRATION, /add column if not exists board_edge_trim_mm/);
  // One runnable block, no check query appended to the end of it.
  assert.match(MIGRATION, /^begin;$/m);
  assert.match(MIGRATION, /^commit;$/m);
});

test("the colour library hands the board size and the grain on", () => {
  // They were both being dropped in the mapping, which is why the board order
  // had to assume 1200 x 2400 for every colour.
  assert.match(COLOUR_LIB, /boardWidthMm: Number\(row\.preferred_board_width_mm/);
  assert.match(COLOUR_LIB, /boardHeightMm: Number\(row\.preferred_board_height_mm/);
  assert.match(COLOUR_LIB, /hasGrain: typeof row\.has_grain === "boolean" \? row\.has_grain : null/);
});

test("the order list says the board size on every line", () => {
  const text = boardOrderText(run([line(), line({ id: "l2", colour: "Classic White", finish: "Matt", thickness: "16mm" })]));
  const lines = text.split("\n");
  assert.equal(lines.length, 2);
  // A colour that does not come 1200 x 2400 is exactly the one somebody would
  // otherwise order wrong.
  assert.ok(lines.some((row) => row.includes("1800 wide x 3600 long")));
  assert.ok(lines.every((row) => /\d+ wide x \d+ long$/.test(row)), "every line ends in a board size");
});
