// Front profiles, and the VJ board layout in particular.
//
// The rule every profile here follows: it is real geometry standing proud of
// the door slab, so what you see is the scene's own light falling into a real
// recess. A dark line painted on a flat face stops reading as a profile the
// moment the colour or the viewing angle changes, which is exactly what the old
// bevel did.
import test from "node:test";
import assert from "node:assert/strict";
import {
  FRONT_PROFILE_PRESETS,
  normaliseFrontProfile,
  frontProfileLabel,
  vjBoards,
  VJ_BOARD_PITCH_MM,
  VJ_GROOVE_MM,
} from "../lib/pcd-front-profiles.js";

test("VJ panel is offered, and an unknown value still falls back to slab", () => {
  assert.ok(FRONT_PROFILE_PRESETS.some((p) => p.value === "vj"));
  assert.equal(frontProfileLabel("vj"), "VJ panel");
  assert.equal(normaliseFrontProfile("vj"), "vj");
  assert.equal(normaliseFrontProfile("beaded"), "slab");
  assert.equal(normaliseFrontProfile(null), "slab");
});

test("boards are equal across the door, at the count nearest the nominal cover", () => {
  // 600 wide at ~100mm cover is six boards, and they must be identical — a
  // door is lined out board by board on site the same way.
  const boards = vjBoards(600);
  assert.equal(boards.length, 6);
  const widths = boards.map((b) => +(b.a1 - b.a0).toFixed(6));
  assert.equal(new Set(widths).size, 1, `boards differ: ${widths.join(", ")}`);
});

test("every groove is the same width, the outer ones included", () => {
  // Half a groove comes off each side of every board. Without that the two
  // grooves at the door's outer edges come out half-width against the reveal.
  const boards = vjBoards(600);
  const half = VJ_GROOVE_MM / 2;
  assert.equal(boards[0].a0, half, "left edge carries a half groove");
  assert.equal(+(600 - boards[boards.length - 1].a1).toFixed(6), half, "and so does the right");
  for (let i = 1; i < boards.length; i++) {
    assert.equal(+(boards[i].a0 - boards[i - 1].a1).toFixed(6), VJ_GROOVE_MM, `groove ${i}`);
  }
});

test("the boarding always spans the whole front, never leaving a sliver", () => {
  // Any width, not just the ones that divide neatly.
  for (const w of [300, 447, 598, 601, 900, 1234]) {
    const boards = vjBoards(w);
    assert.equal(boards[0].a0, VJ_GROOVE_MM / 2, `w=${w}`);
    assert.ok(Math.abs(w - boards[boards.length - 1].a1 - VJ_GROOVE_MM / 2) < 1e-6, `w=${w}`);
    const cover = w / boards.length;
    assert.ok(cover > VJ_BOARD_PITCH_MM * 0.5 && cover < VJ_BOARD_PITCH_MM * 1.5, `w=${w} cover ${cover}`);
  }
});

test("a narrow front tightens its grooves rather than inverting them", () => {
  // A groove wider than the board it separates would eat the panelling and
  // produce boards with a negative width.
  const boards = vjBoards(30);
  assert.ok(boards.length >= 2);
  for (const b of boards) assert.ok(b.a1 > b.a0, "no inside-out board");
});

test("never fewer than two boards, and no boards at all for no width", () => {
  assert.ok(vjBoards(40).length >= 2, "one board is not panelling");
  assert.deepEqual(vjBoards(0), []);
  assert.deepEqual(vjBoards(null), []);
});
