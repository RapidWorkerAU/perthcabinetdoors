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
  // The profile is keyed per panel, not stored on the style object, so the two
  // ends of a cabinet can differ even though they share one finish_panel_style.
  const item = cabinet({
    finish_panel_style: { material: "decorative board", colour: "Ecru Oak", thickness_mm: 18, cost_per_sqm: 90 },
    panel_options: { end_left: { profile_type: "V-Groove", profile: "V-Groove 3" } },
  });
  const left = finishPanelBoard(item, null, "end_left");
  assert.equal(left.profile_type, "V-Groove");
  assert.equal(left.profile, "V-Groove 3");
  // ...and it reaches the quote line.
  assert.equal(panelBoardFields(left).profile, "V-Groove 3");

  // The other end shares the colour but not the profile.
  const right = finishPanelBoard(item, null, "end_right");
  assert.equal(right.colour, "Ecru Oak");
  assert.equal(right.profile, "");
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

const plainBase = () => ({
  material: "melamine", colour: "White", rate: 40, thicknessMm: 16,
  supplier_name: "", finish: "", profile_type: "", profile: "",
});

test("an empty override changes nothing", () => {
  // Every override starts blank and means "match", so a stray {} left on an
  // item can not quietly reprice anything.
  assert.deepEqual(applyPanelOverride(plainBase(), {}), plainBase());
  assert.deepEqual(applyPanelOverride(plainBase(), null), plainBase());
});

test("a profile with no colour routes the default board", () => {
  // Colour and profile are set in two different screens, so a shaker kickboard
  // in plain carcass colour has to be expressible: the profile applies and
  // nothing about the board changes.
  const board = carcassPanelBoard(
    cabinet({ panel_options: { kickboard: { profile_type: "Shaker", profile: "Shaker 60" } } }),
    "kickboard_style",
    16,
    "kickboard"
  );
  assert.equal(board.profile_type, "Shaker");
  assert.equal(board.profile, "Shaker 60");
  assert.equal(board.colour, "White");
  assert.equal(board.rate, 40);
  assert.equal(board.thicknessMm, 16);
});

test("a colour override keeps the panel's own profile", () => {
  // The two are independent: recolouring a kickboard doesn't un-route it.
  const board = carcassPanelBoard(
    cabinet({
      kickboard_style: { material: "decorative board", colour: "Black Wenge", thickness_mm: 18, cost_per_sqm: 88 },
      panel_options: { kickboard: { profile_type: "Shaker", profile: "Shaker 60" } },
    }),
    "kickboard_style",
    16,
    "kickboard"
  );
  assert.equal(board.colour, "Black Wenge");
  assert.equal(board.rate, 88);
  assert.equal(board.profile, "Shaker 60");
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

test("a panel nobody routed is flat", () => {
  // No entry for this panel means no profile — a back panel given its own
  // colour doesn't inherit the ends' profile along with it.
  const board = finishPanelBoard(
    cabinet({
      panel_options: { end_left: { profile_type: "Shaker", profile: "Shaker 60" } },
      back_panel_style: { material: "melamine", colour: "White", thickness_mm: 16, cost_per_sqm: 40 },
    }),
    "back_panel_style",
    "back"
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
