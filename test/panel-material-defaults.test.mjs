// KICKBOARDS, FILLERS AND FINISHED PANELS FOLLOW THE PROJECT DEFAULTS.
//
// A kickboard is cut from its cabinet's carcass and a finished panel matches
// the doors, both only while nobody has picked a colour on that one panel.
// Once somebody has, Material Defaults could not reach it: there was no setting
// for it, and "apply to all" never touched a panel style. On the live projects
// that was half the kickboards and a third of the fillers, frozen on a colour
// that only a hand edit would ever change again.
//
// So each of the three can now be set once for the project. Left blank they
// follow what they always followed, which is why an existing job that never
// sets one sees no change at all.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { PANEL_STYLE_DEFAULTS, panelStyleFromDefault } from "../lib/pcd-panel-options.js";
import { boardSummary } from "../lib/pcd-colour-library.js";
import { applyMaterialDefaults, buildItemRow } from "../lib/pcd-design-item-io.js";
import { carcassPanelBoard, finishPanelBoard } from "../lib/pcd-panel-board.js";
import { CLEAT_THICKNESS_MM, cleatIsThin, cleatStyle, cleatThicknessMm, shelfRailConfig } from "../lib/pcd-shelf-rail-utils.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const MODAL = read("app/admin/design/_components/MaterialDefaultsModal.js");
const APPLY = read("app/api/admin/design/projects/[projectId]/apply-material-defaults/route.js");

const BLACK = { material: "decorative board", finish: "Matt", colour: "Black Ash", thickness_mm: 16, cost_per_sqm: 52 };

// ── The three of them, in one place ─────────────────────────────────────────

test("the three panels with a default are defined once and read everywhere", () => {
  assert.deepEqual(PANEL_STYLE_DEFAULTS.map((d) => d.key), ["kickboard", "filler_panel", "finish_panel"]);
  assert.deepEqual(PANEL_STYLE_DEFAULTS.map((d) => d.styleKey),
    ["kickboard_style", "filler_panel_style", "finish_panel_style"]);
  // The modal offers all three, and neither the modal nor the apply route
  // keeps a list of its own.
  ["Kickboards", "Filler Panels", "Finished Panels"].forEach((label) => assert.ok(MODAL.includes(label), label));
  ["kickboard: {}", "filler_panel: {}", "finish_panel: {}"].forEach((bucket) => assert.ok(MODAL.includes(bucket), bucket));
  assert.match(APPLY, /for \(const def of PANEL_STYLE_DEFAULTS\)/);
  assert.match(read("lib/pcd-design-item-io.js"), /for \(const def of PANEL_STYLE_DEFAULTS\)/);
});

test("a blank default writes nothing, so a job that never sets one is untouched", () => {
  PANEL_STYLE_DEFAULTS.forEach((def) => {
    assert.equal(panelStyleFromDefault(def, undefined), null, def.key);
    assert.equal(panelStyleFromDefault(def, {}), null, def.key);
    // A colour with no material behind it is not a board.
    assert.equal(panelStyleFromDefault(def, { colour: "Black Ash" }), null, def.key);
  });
});

test("a style is stored whole, price and library row included", () => {
  const def = PANEL_STYLE_DEFAULTS[0];
  assert.deepEqual(panelStyleFromDefault(def, { ...BLACK, colour_library_id: "lib-1", supplier: "Polytec" }), {
    material: "decorative board", finish: "Matt", colour: "Black Ash",
    thickness_mm: 16, cost_per_sqm: 52, colour_library_id: "lib-1", supplier: "Polytec",
  });
  // A zero cost is a real answer and must survive; only a missing one is left out.
  assert.equal(panelStyleFromDefault(def, { ...BLACK, cost_per_sqm: 0 }).cost_per_sqm, 0);
});

// ── Which cabinets each one reaches ─────────────────────────────────────────

test("each default only reaches the cabinets that can carry that panel", () => {
  const [kick, filler, finish] = PANEL_STYLE_DEFAULTS;
  assert.equal(kick.applies({ item_type: "base_cabinet" }), true);
  assert.equal(kick.applies({ item_type: "wall_cabinet" }), false, "a wall cabinet has no kickboard");
  assert.equal(filler.applies({ item_type: "wall_cabinet" }), true);
  assert.equal(filler.applies({ item_type: "tall_cabinet" }), true);
  assert.equal(filler.applies({ item_type: "base_cabinet" }), false, "nothing fills above a base cabinet");
  assert.equal(finish.applies({ item_type: "base_cabinet" }), true, "any cabinet can be finished on an end");
});

// ── A new cabinet ───────────────────────────────────────────────────────────

test("a new cabinet starts with the project's kickboard, not the carcass", () => {
  const defaults = {
    carcass: { base_cabinet: { material: "decorative board", finish: "Matt", colour: "Classic White", thickness_mm: 16 } },
    kickboard: BLACK,
  };
  const payload = applyMaterialDefaults({ item_type: "base_cabinet" }, defaults);
  assert.equal(payload.colour, "Classic White", "the carcass is still the carcass");
  assert.equal(payload.kickboard_style.colour, "Black Ash");
  assert.equal(payload.kickboard_thickness_mm, 16, "and the thickness comes with it");
  assert.equal(payload.filler_panel_style, undefined, "nothing was set for the filler, so nothing is written");

  // And it survives the trip into the row that is actually saved.
  const row = buildItemRow({ ...payload, design_project_id: "p1", room_id: "r1", item_type: "base_cabinet" });
  assert.equal(row.kickboard_style.colour, "Black Ash");
  assert.equal(row.filler_panel_style, null);
});

test("a colour already on the payload wins over the default", () => {
  const picked = { material: "thermolaminate", finish: "Smooth", colour: "Greige" };
  const payload = applyMaterialDefaults(
    { item_type: "base_cabinet", kickboard_style: picked },
    { kickboard: BLACK }
  );
  assert.deepEqual(payload.kickboard_style, picked, "a new item is only ever filled in, never overwritten");
});

// ── Apply to all ────────────────────────────────────────────────────────────

test("apply to all replaces a panel colour picked on one cabinet", () => {
  // The whole point of the button, and the one thing it could not do.
  assert.match(APPLY, /patch\[def\.styleKey\] = style/);
  assert.match(APPLY, /if \(style\.thickness_mm && def\.thicknessField\) patch\[def\.thicknessField\] = style\.thickness_mm/);
  // Replaced whole rather than merged: a half-overwritten style keeps the old
  // supplier and library row sitting behind the new colour.
  assert.ok(!/patch\[def\.styleKey\] = \{ \.\.\.\(item\[def\.styleKey\]/.test(APPLY));
  // A category nobody configured is still left alone.
  assert.match(APPLY, /if \(!style\) continue/);
});

test("a colour on one end panel is cleared, or the finished default would do nothing", () => {
  const finish = PANEL_STYLE_DEFAULTS[2];
  assert.deepEqual(finish.clears,
    ["end_left_style", "end_right_style", "back_panel_style", "top_panel_style", "bottom_panel_style"]);
  // The kickboard and the filler have no piece below them to clear: their style
  // key IS the per-piece colour.
  assert.deepEqual(PANEL_STYLE_DEFAULTS[0].clears, []);
  assert.deepEqual(PANEL_STYLE_DEFAULTS[1].clears, []);
  assert.match(APPLY, /for \(const key of def\.clears\) patch\[key\] = null/);
});

// ── What the quote then sees ────────────────────────────────────────────────

test("the board the quote cuts the panel from follows the default", () => {
  const cabinet = {
    item_type: "base_cabinet",
    material: "decorative board", finish: "Matt", colour: "Classic White",
    cost_per_sqm_carcass: 40, kickboard_thickness_mm: 16,
    kickboard_style: panelStyleFromDefault(PANEL_STYLE_DEFAULTS[0], BLACK),
  };
  const board = carcassPanelBoard(cabinet, "kickboard_style", cabinet.kickboard_thickness_mm, "kickboard");
  assert.equal(board.colour, "Black Ash");
  assert.equal(board.rate, 52, "priced from the default's own rate, not the carcass");

  // With no default set it is the carcass again, exactly as before.
  const plain = carcassPanelBoard({ ...cabinet, kickboard_style: null }, "kickboard_style", 16, "kickboard");
  assert.equal(plain.colour, "Classic White");
  assert.equal(plain.rate, 40);
});

test("a finished panel takes the default ahead of the doors", () => {
  const cabinet = {
    item_type: "base_cabinet",
    material: "decorative board", finish: "Matt", colour: "Classic White",
    door_style: { material: "thermolaminate", finish: "Smooth", colour: "Greige", cost_per_sqm: 90 },
    finish_panel_style: panelStyleFromDefault(PANEL_STYLE_DEFAULTS[2], { ...BLACK, thickness_mm: 18 }),
  };
  assert.equal(finishPanelBoard(cabinet, "end_left_style", "end_left").colour, "Black Ash");
  assert.equal(finishPanelBoard(cabinet, "end_left_style", "end_left").thicknessMm, 18);
  // Blank again and it matches the doors, which is what it always did.
  assert.equal(finishPanelBoard({ ...cabinet, finish_panel_style: null }, "end_left_style", "end_left").colour, "Greige");
});

// ── READING A BOARD BACK IN ONE LINE ────────────────────────────────────────
//
// The collapsed sections said "Black" and nothing else, which is not enough to
// check a default by: two brands stock a Black, the same colour comes in three
// finishes at different money, and the thickness is the thing most worth
// catching before a whole job is cut from it.

test("a board reads as who makes it, what colour, what finish, how thick", () => {
  assert.equal(
    boardSummary({ supplier: "Polytec", colour: "Black Wenge", finish: "Matt", thickness_mm: 16, material: "decorative board" }),
    "Polytec Black Wenge Matt 16mm"
  );
  // Anything missing is left out rather than shown as a gap.
  assert.equal(boardSummary({ colour: "Black Wenge", thickness_mm: 16 }), "Black Wenge 16mm");
  assert.equal(boardSummary({ supplier: "Polytec", colour: "Black Wenge" }), "Polytec Black Wenge");
  // The supplier is spelt our way, whatever case it was stored in. One speller.
  assert.equal(boardSummary({ supplier: "POLYTEC", colour: "Black" }), "Polytec Black");
  assert.equal(boardSummary({ supplier_name: "polytec", colour: "Black" }), "Polytec Black", "either key");
  // A board with no colour is still worth describing by its material.
  assert.equal(boardSummary({ material: "decorative board", thickness_mm: 18 }), "18mm decorative board");
  // Nothing set is blank, and the caller says what to show instead.
  assert.equal(boardSummary({}), "");
  assert.equal(boardSummary(null), "");
});

test("the modal shows it, and so does the field inside it", () => {
  assert.match(MODAL, /const summary = boardSummary\(data\) \|\| "Not set"/);
  assert.match(MODAL, /<ColourField[\s\S]{0,120}detail/, "the field agrees with the row above it");
  // The config sidebar keeps the short version. It is a narrow column, the
  // board is being chosen there rather than checked, and the cabinet's own
  // colour is already on screen beside it.
  const field = read("app/admin/design/_components/ColourField.js");
  assert.match(field, /if \(detail\) return boardSummary\(style\) \|\| null/);
  assert.match(field, /detail = false/, "off unless a screen asks for it");
  const sidebar = read("app/admin/design/_components/DesignRightPanel.js");
  const sidebarFields = sidebar.match(/<ColourField[\s\S]{0,500}?\/>/g) || [];
  assert.ok(sidebarFields.length > 5, "the sidebar is where most of them are");
  // One exception, and it earns it: on the cleats the board and its thickness
  // are the whole question, so that field spells it out.
  const spelledOut = sidebarFields.filter((tag) => /\bdetail\b/.test(tag));
  assert.equal(spelledOut.length, 1);
  assert.match(spelledOut[0], /label="Cleats & front rail"/);
});

// ── THE BOARD IS THE ROW, NOT THE WORDS ─────────────────────────────────────
//
// 13 September 2026. A whole wardrobe job was set to Polytec Black Texture
// 16mm, applied to every item, and reached the quote with four cabinets priced
// from a Laminex Black AbsoluteMatte 18mm at $145.49 a square metre and one
// from a Polytec Carcass Matt 18mm at $66.81, every one of them printed as
// "16mm Black Texture". Nothing was wrong with the words. What was wrong was
// that a board is TWO things on an item, the words and which library row it is,
// and three screens in a row wrote the first and left the second.

test("apply to all writes which library row the board is, not just its name", () => {
  // Every branch: a cabinet, its shelves, its fronts, a shelf and rail, a
  // floating shelf, a standalone panel. Missing it on any one of them puts a
  // wrong price on a real quote.
  ["patch.colour_library_id = boardId(carcass)", "patch.supplier_name = boardSupplier(carcass)",
   "patch.shelf_colour_library_id = boardId(shelf)", "patch.shelf_supplier_name = boardSupplier(shelf)",
   "patch.colour_library_id = boardId(sr)", "patch.colour_library_id = boardId(fs)",
   "patch.colour_library_id = boardId(panel)"].forEach((line) => assert.ok(APPLY.includes(line), line));
  // The fronts are merged to keep the profile, so they have to say it outright.
  assert.match(APPLY, /\.\.\.door, colour_library_id: boardId\(door\), supplier: boardSupplier\(door\) \|\| null/);
  assert.match(APPLY, /\.\.\.drawer, colour_library_id: boardId\(drawer\), supplier: boardSupplier\(drawer\) \|\| null/);
  // Set to nothing when the default has none, never left behind: no id prices
  // by name and says when it cannot, a wrong id prices off the wrong board.
  assert.match(APPLY, /const boardId = \(obj\) => obj\.colour_library_id \|\| null/);
});

test("a scribe's thickness moves with the default, like everything else", () => {
  // It kept the 18mm it was created at while the rest of the job went to 16mm,
  // because a scribe's thickness is not carcass_thickness_mm.
  assert.match(APPLY, /patch\.scribe_thickness_mm = panel\.thickness_mm/);
  assert.match(APPLY, /patch\.panel_thickness_mm = panel\.thickness_mm/);
});

test("Same as... brings the library row and the supplier with it", () => {
  assert.match(MODAL, /colour_library_id: s\.colour_library_id \|\| null/);
  assert.match(MODAL, /supplier: s\.supplier \|\| s\.supplier_name \|\| ""/);
});

test("every cabinet type in the tool can be set", () => {
  // corner_tall_cabinet had a bucket in the defaults and no section on screen,
  // so it could never be set and every apply skipped it.
  ["base_cabinet", "wall_cabinet", "tall_cabinet", "corner_base_cabinet",
   "corner_tall_cabinet", "blind_corner_cabinet", "bookcase"]
    .forEach((type) => assert.ok(MODAL.includes(`key: "${type}"`), `${type} has a section`));
});

// ── THE CLEATS AND THE FRONT RAIL ───────────────────────────────────────────
//
// Picking their board was restricted to library colours stocked in 18mm, which
// meant a robe done in a 16mm colour could not have its cleats in that colour
// at all: the only 18mm board to hand was the carcass, so a black robe came out
// with grey cleats priced off a different board. Any board now, and the cleats
// are as thick as the one picked.

test("the cleats can be any board, and are as thick as the one picked", () => {
  const sixteen = { shelf_rail_config: { cleat_style: { material: "decorative board", colour: "Black", thickness_mm: 16 } } };
  assert.equal(cleatThicknessMm(sixteen), 16);
  assert.equal(cleatIsThin(sixteen), true, "and it says so, because they are the structural part");
  assert.equal(cleatStyle(sixteen).thickness_mm, 16);

  // Nothing picked: 18mm, and the shelf's colour, exactly as before.
  const plain = { material: "decorative board", finish: "Matt", colour: "Classic White", carcass_thickness_mm: 16 };
  assert.equal(cleatThicknessMm(plain), CLEAT_THICKNESS_MM);
  assert.equal(cleatIsThin(plain), false);
  assert.equal(cleatStyle(plain).colour, "Classic White");
  assert.equal(cleatStyle(plain).thickness_mm, 18, "borrowed colour, still cut at the structural 18");

  // The front rail's setback is measured off the cleat, so the cut list moves
  // with it rather than staying on a number nobody chose.
  assert.equal(shelfRailConfig(sixteen).cleat_thickness_mm, 16);
  assert.equal(shelfRailConfig(plain).cleat_thickness_mm, 18);
});

test("the cleat board carries its library row, like every other board", () => {
  const item = { shelf_rail_config: { cleat_style: {
    material: "decorative board", colour: "Black", finish: "Texture", thickness_mm: 16,
    colour_library_id: "row-9", supplier: "Polytec",
  } } };
  assert.equal(cleatStyle(item).colour_library_id, "row-9");
  assert.equal(cleatStyle(item).supplier, "Polytec");
  // Borrowed from the shelf, the shelf's row comes with it.
  const borrowed = { material: "decorative board", colour: "Black", colour_library_id: "row-1", supplier_name: "Polytec" };
  assert.equal(cleatStyle(borrowed).colour_library_id, "row-1");
  assert.equal(cleatStyle(borrowed).supplier, "Polytec");
});

test("a whole job's cleats can be set at once", () => {
  assert.ok(MODAL.includes('key: "shelf_rail_cleat"'), "there is a section for them");
  assert.ok(MODAL.includes("shelf_rail_cleat: {}"));
  // Merged into the config so the supports, the rail height and the setback on
  // that one shelf are not thrown away.
  assert.match(APPLY, /const cleat = defaults\.shelf_rail_cleat/);
  assert.match(APPLY, /\.\.\.\(item\.shelf_rail_config \|\| \{\}\),/);
  assert.match(APPLY, /cleat_style: \{/);
  assert.match(read("lib/pcd-design-item-io.js"), /defaults\.shelf_rail_cleat/);
});

test("the picker no longer refuses every board but 18mm", () => {
  const panel = read("app/admin/design/_components/DesignRightPanel.js");
  const field = panel.slice(panel.indexOf('label="Cleats & front rail"'));
  const tag = field.slice(0, field.indexOf("/>"));
  assert.ok(!/onlyThicknessMm/.test(tag), "any board can be chosen");
  assert.ok(!/matchOptions=\{matchOptions\.filter/.test(tag), "and matched against any of them");
  assert.match(panel, /cleatIsThin\(draft\) &&/, "with a word of warning under 18mm");
});
