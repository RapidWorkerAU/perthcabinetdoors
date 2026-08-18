// Which board a finished panel is made from, and whether its own profile
// reaches the quote. The per-piece overrides (kickboard / filler / underside /
// top / back) were settable in the design tool but read by nothing, so a
// kickboard given its own colour still imported in carcass colour.
import test from "node:test";
import assert from "node:assert/strict";
import {
  applyPanelOverride,
  finishPanelBoard,
  carcassPanelBoard,
  panelBoardFields,
} from "../lib/pcd-panel-board.js";

// A cabinet with shaker doors, a plain white carcass, and a finishing-panel
// board of its own.
const cabinet = (over = {}) => ({
  material: "melamine", finish: "Matt", colour: "White",
  carcass_thickness_mm: 16, cost_per_sqm_carcass: 40,
  supplier_name: "Polytec",
  door_style: {
    material: "decorative board", finish: "Woodmatt", colour: "Ecru Oak",
    thickness_mm: 18, cost_per_sqm: 90,
    profile_type: "Shaker", profile: "Shaker 60",
  },
  ...over,
});

test("a finished panel follows the finishing-panel board, then the doors", () => {
  // No finish_panel_style: falls back to the door material.
  const fromDoor = finishPanelBoard(cabinet());
  assert.equal(fromDoor.colour, "Ecru Oak");
  assert.equal(fromDoor.rate, 90);

  // With one set, it wins.
  const own = finishPanelBoard(cabinet({
    finish_panel_style: { material: "decorative board", finish: "Woodmatt", colour: "Notaio Walnut", thickness_mm: 18, cost_per_sqm: 105 },
  }));
  assert.equal(own.colour, "Notaio Walnut");
  assert.equal(own.rate, 105);
});

test("a panel does NOT inherit the door's profile", () => {
  // The door is Shaker 60. A finished end panel that nobody gave a profile to
  // is flat — guessing the door's on would add routing cost to every quote
  // with a finished end.
  const board = finishPanelBoard(cabinet());
  assert.equal(board.profile_type, "");
  assert.equal(board.profile, "");
});

test("a panel can carry a profile different from the fronts", () => {
  const board = finishPanelBoard(cabinet({
    finish_panel_style: {
      material: "decorative board", colour: "Ecru Oak", thickness_mm: 18, cost_per_sqm: 90,
      profile_type: "V-Groove", profile: "V-Groove 3",
    },
  }));
  assert.equal(board.profile_type, "V-Groove");
  assert.equal(board.profile, "V-Groove 3");
  // ...and it reaches the quote line.
  assert.equal(panelBoardFields(board).profile, "V-Groove 3");
});

test("kickboards and fillers match the carcass until overridden", () => {
  const plain = carcassPanelBoard(cabinet(), "kickboard_style", 16);
  assert.equal(plain.colour, "White");
  assert.equal(plain.rate, 40);
  assert.equal(plain.profile_type, "");

  const over = carcassPanelBoard(
    cabinet({ kickboard_style: { material: "decorative board", colour: "Black Wenge", thickness_mm: 18, cost_per_sqm: 88 } }),
    "kickboard_style",
    16
  );
  assert.equal(over.colour, "Black Wenge");
  assert.equal(over.rate, 88);
  assert.equal(over.thicknessMm, 18);
});

test("an empty override changes nothing", () => {
  // Every override starts blank and means "match". Only a picked colour
  // counts, so a stray {} left on an item can not quietly reprice anything.
  const base = { material: "melamine", colour: "White", rate: 40, thicknessMm: 16, supplier_name: "", finish: "", profile_type: "", profile: "" };
  assert.deepEqual(applyPanelOverride(base, {}), base);
  assert.deepEqual(applyPanelOverride(base, null), base);
  assert.deepEqual(applyPanelOverride(base, { profile_type: "Shaker" }), base);
});

test("a partial override keeps the default rate and thickness", () => {
  // Picking only a colour shouldn't zero the board rate — a $0 rate is how a
  // line gets flagged as incomplete on import.
  const board = carcassPanelBoard(
    cabinet({ kickboard_style: { colour: "Black Wenge" } }),
    "kickboard_style",
    16
  );
  assert.equal(board.colour, "Black Wenge");
  assert.equal(board.material, "melamine");
  assert.equal(board.rate, 40);
  assert.equal(board.thicknessMm, 16);
});

test("an overridden panel is flat unless the override says otherwise", () => {
  // The override replaces the piece outright, profile included: a back panel
  // moved to a different colour doesn't keep the finishing panel's profile.
  const board = finishPanelBoard(
    cabinet({
      finish_panel_style: { material: "decorative board", colour: "Ecru Oak", thickness_mm: 18, cost_per_sqm: 90, profile_type: "Shaker", profile: "Shaker 60" },
      back_panel_style: { material: "melamine", colour: "White", thickness_mm: 16, cost_per_sqm: 40 },
    }),
    "back_panel_style"
  );
  assert.equal(board.colour, "White");
  assert.equal(board.profile_type, "");
  assert.equal(board.profile, "");
});

test("panelBoardFields writes the thickness as a label, and blank when unset", () => {
  assert.equal(panelBoardFields({ thicknessMm: 18 }).thickness, "18mm");
  assert.equal(panelBoardFields({ thicknessMm: null }).thickness, "");
  assert.equal(panelBoardFields({ rate: 0 }).unit_cost_mode, "auto");
});
