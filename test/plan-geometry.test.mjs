// Plan-view snapping, collision and overlap detection.
//
// This maths had no tests for its whole life, because it lived inside a
// "use client" React component and couldn't be imported without bundling a
// tree. It is also where the most expensive bug of the lot lived — snap()
// re-rounding an exactly-flush position back into its neighbour — so the cost
// of that was not theoretical.
import test from "node:test";
import assert from "node:assert/strict";
import {
  snap, snapToWall, resolveCollision1D, findEdgeSnap,
  occupiedFootprint, islandOccupiedRect, cabinetVerticalRange,
  findOverlappingItemIds, getAbsPos, perpendicularGaps,
} from "../lib/pcd-plan-geometry.js";

const ROOM = { width_mm: 1800, depth_mm: 3000 };
const base = { item_type: "base_cabinet", height_mm: 720, depth_mm: 590, mount_height_mm: 0 };

// Mirrors the wall-branch of handleSvgPointerMove: quantise a FREE position,
// magnetically snap to a neighbour's edge, then resolve collisions — all in
// panel-inclusive span space, converting back to the carcass edge.
function dragAlongWall(item, desiredCarcassPos, obstacles, roomMax, wall) {
  const { lowT, highT } = item.__span ?? { lowT: 0, highT: 0 };
  const spanLen = (item.width_mm || 600) + lowT + highT;
  const spanPos = desiredCarcassPos - lowT;
  const edgeSnap = findEdgeSnap(spanPos, spanLen, obstacles.map((o) => ({ pos: o.x_mm, len: o.width_mm })));
  const desired = edgeSnap ? edgeSnap.newPos : snap(spanPos);
  return resolveCollision1D(desired, spanLen, obstacles, roomMax) + lowT;
}

test("the 10mm grid never re-rounds a snapped position", () => {
  // THE bug. findEdgeSnap returns an exact flush coordinate; snap() then
  // rounded it to the grid, and when the flush coordinate wasn't a multiple
  // of 10 — which a run of real cabinet widths hits constantly — it pushed
  // the cabinet BACK INTO its neighbour. 994 became 990: a 4mm overlap, far
  // too small to see at plan zoom, reported as an error the user couldn't
  // explain. The grid may only ever touch a FREE position.
  const obstacles = [{ x_mm: 0, width_mm: 994 }];
  const cab = { ...base, width_mm: 806 };
  assert.equal(snap(994), 990, "the grid really does round backwards");
  assert.equal(dragAlongWall(cab, 997, obstacles, 3000, "right"), 994, "snapped from above");
  assert.equal(dragAlongWall(cab, 991, obstacles, 3000, "right"), 994, "snapped from below");
  // A free drag with nothing nearby still lands on the grid.
  assert.equal(dragAlongWall(cab, 1447, [], 3000, "right"), 1450);
});

test("collision push-out is exact, not grid-rounded", () => {
  // resolveCollision1D's entire job is pushing an item clear to a flush
  // position. Re-quantising its output undid that just as surely.
  const cab = { ...base, width_mm: 806 };
  assert.equal(dragAlongWall(cab, 500, [{ x_mm: 0, width_mm: 994 }], 3000, "right"), 994);
});

test("the reported layout: a 994 corner leg and an 806 cabinet", () => {
  const corner = {
    id: "corner", item_type: "corner_base_cabinet", wall: "top", secondary_wall: "right",
    x_mm: 800, y_mm: 0, width_mm: 994, depth_mm: 590, secondary_width_mm: 994,
    height_mm: 720, mount_height_mm: 0,
  };
  const cookTop = (y) => ({ ...base, id: "cook", wall: "right", x_mm: 0, y_mm: y, width_mm: 806 });
  // What the old grid produced — and it really was overlapping.
  assert.equal([...findOverlappingItemIds([corner, cookTop(990)], ROOM)].length, 2);
  // Where it now lands.
  assert.equal([...findOverlappingItemIds([corner, cookTop(994)], ROOM)].length, 0);
});

test("end panels claim their space, so neighbours snap to the board's face", () => {
  const P = { finish_panel_style: { thickness_mm: 18 } };
  const a = { ...base, ...P, id: "a", wall: "top", x_mm: 0, y_mm: 0, width_mm: 800, end_panel_right: true };
  const b = { ...base, id: "b", wall: "top", x_mm: 0, y_mm: 0, width_mm: 806 };

  assert.deepEqual(occupiedFootprint(a, 1800, 3000), { x: 0, y: 0, w: 818, h: 590 },
    "800 carcass + 18mm end = 818 occupied");
  // B must land on 818 — the panel's outer face — not 800, which is on top of
  // a real board.
  assert.equal(dragAlongWall(b, 816, [{ x_mm: 0, width_mm: 818 }], 1800, "top"), 818);
  assert.equal([...findOverlappingItemIds([a, { ...b, x_mm: 800 }], ROOM)].length, 2, "800 sits on the panel");
  assert.equal([...findOverlappingItemIds([a, { ...b, x_mm: 818 }], ROOM)].length, 0);
});

test("vertical ranges: kickboard lifts, underside panel hangs", () => {
  assert.deepEqual(cabinetVerticalRange({ item_type: "base_cabinet", height_mm: 720 }), [0, 720]);
  assert.deepEqual(
    cabinetVerticalRange({ item_type: "base_cabinet", height_mm: 720, has_kickboard: true }),
    [120, 840], "the carcass sits ON the kickboard"
  );
  // A wall cabinet resolves its own 1400 default now CABINET_MOUNT_MM is shared.
  assert.deepEqual(cabinetVerticalRange({ item_type: "wall_cabinet", height_mm: 720 }), [1400, 2120]);
  assert.deepEqual(
    cabinetVerticalRange({
      item_type: "wall_cabinet", height_mm: 720, mount_height_mm: 1400,
      has_bottom_panel: true, finish_panel_style: { thickness_mm: 18 },
    }),
    [1382, 2120], "the underside panel hangs below the carcass"
  );
});

test("a kickboarded base cabinet's real top drives overlap detection", () => {
  const kickboarded = {
    id: "b", item_type: "base_cabinet", wall: "top", x_mm: 0, y_mm: 0,
    width_mm: 800, depth_mm: 590, height_mm: 720, has_kickboard: true,
  };
  const wallCab = (mount) => ({
    id: "w", item_type: "wall_cabinet", wall: "top", x_mm: 0, y_mm: 0,
    width_mm: 800, depth_mm: 350, height_mm: 700, mount_height_mm: mount,
  });
  // It tops out at 870, not 720 — so a wall cab at 800 genuinely clashes.
  assert.equal([...findOverlappingItemIds([kickboarded, wallCab(800)], ROOM)].length, 2);
  assert.equal([...findOverlappingItemIds([kickboarded, wallCab(870)], ROOM)].length, 0, "flush is clean");
});

test("a wall cabinet above a base cabinet is not a clash", () => {
  const cabs = [
    { id: "b1", item_type: "base_cabinet", wall: "top", x_mm: 0, y_mm: 0, width_mm: 800, depth_mm: 590, height_mm: 720, mount_height_mm: 0 },
    { id: "w1", item_type: "wall_cabinet", wall: "top", x_mm: 0, y_mm: 0, width_mm: 800, depth_mm: 350, height_mm: 720, mount_height_mm: 1400 },
  ];
  assert.equal([...findOverlappingItemIds(cabs, ROOM)].length, 0);
});

test("island back panels project off the back face, per rotation", () => {
  // islandVirtualWall names the wall the BACK faces, so a back facing top/left
  // sits on the low side of its axis and the board grows down it.
  const P = { finish_panel_style: { thickness_mm: 18 } };
  const isl = { ...P, item_type: "base_cabinet", wall: "island", x_mm: 1000, y_mm: 1000,
                width_mm: 900, depth_mm: 600, height_mm: 720, has_back_panel: true };
  assert.deepEqual(islandOccupiedRect({ ...isl, rotation: 0 }), { x: 1000, y: 982, w: 900, h: 618 });
  assert.deepEqual(islandOccupiedRect({ ...isl, rotation: 180 }), { x: 1000, y: 1000, w: 900, h: 618 });
  assert.deepEqual(islandOccupiedRect({ ...isl, rotation: 90 }), { x: 1000, y: 1000, w: 618, h: 900 });
  assert.deepEqual(islandOccupiedRect({ ...isl, rotation: 270 }), { x: 982, y: 1000, w: 618, h: 900 });
});

test("getAbsPos still reads both the old and new left/right formats", () => {
  // Old rows stored the along-wall position in x_mm; new ones use y_mm. Any
  // x_mm > 0 on those walls means legacy — which is why the mobile nudge
  // writing x_mm teleported cabinets.
  assert.deepEqual(getAbsPos({ wall: "left", x_mm: 800, y_mm: 0, depth_mm: 600 }, 4000, 3000), { absX: 0, absY: 800 });
  assert.deepEqual(getAbsPos({ wall: "left", x_mm: 0, y_mm: 800, depth_mm: 600 }, 4000, 3000), { absX: 0, absY: 800 });
  assert.deepEqual(getAbsPos({ wall: "top", x_mm: 500, y_mm: 0, depth_mm: 600 }, 4000, 3000), { absX: 500, absY: 0 });
});

test("snapToWall keeps right-wall items in the new format", () => {
  // Writing a real x_mm here made every right-wall item look legacy forever
  // after, so its saved y_mm was never read back and the cabinet appeared
  // stuck wherever the stale clamp landed it.
  const onRight = snapToWall(3900, 800, 600, 590, "top", 4000, 3000);
  assert.equal(onRight.wall, "right");
  assert.equal(onRight.x_mm, 0, "must stay 0 or getAbsPos reads it as legacy");
});

test("perpendicular gaps: front to the far wall, back flush", () => {
  // A lone top-wall base cabinet (depth 560) in a 4000×3000 room. Nothing in
  // front, so the front gap runs to the bottom wall; the back is on the wall.
  const cab = { id: "a", item_type: "base_cabinet", wall: "top", x_mm: 0, y_mm: 0, width_mm: 600, depth_mm: 560, height_mm: 720 };
  const g = perpendicularGaps(cab, [cab], 4000, 3000);
  assert.equal(g.frontGap, 3000 - 560, "front reaches the far wall");
  assert.equal(g.backGap, 0, "back is flush to its wall");
});

test("perpendicular gaps: measures to the item in front, along-overlap only", () => {
  const top = { id: "t", item_type: "base_cabinet", wall: "top", x_mm: 0, y_mm: 0, width_mm: 600, depth_mm: 560, height_mm: 720 };
  const bot = { id: "b", item_type: "base_cabinet", wall: "bottom", x_mm: 0, y_mm: 0, width_mm: 600, depth_mm: 560, height_mm: 720 };
  // Facing cabinets, x-overlapping: gap between their fronts.
  assert.equal(perpendicularGaps(top, [top, bot], 4000, 3000).frontGap, 3000 - 560 - 560);
  // Slide the bottom one out of the top one's width — no along overlap, so it
  // no longer obstructs and the front runs to the wall again.
  const botClear = { ...bot, x_mm: 2000 };
  assert.equal(perpendicularGaps(top, [top, botClear], 4000, 3000).frontGap, 3000 - 560);
});

test("perpendicular gaps: benchtop overhang is what's measured to", () => {
  const bare = { id: "a", item_type: "base_cabinet", wall: "top", x_mm: 0, y_mm: 0, width_mm: 600, depth_mm: 560, height_mm: 720, front_type: "doors", door_style: { thickness_mm: 18 } };
  const withTop = { ...bare, has_benchtop: true };
  const gBare = perpendicularGaps(bare, [bare], 4000, 3000).frontGap;
  const gTop  = perpendicularGaps(withTop, [withTop], 4000, 3000).frontGap;
  // The top projects past the carcass (door + overhang), so its front is closer
  // to the far wall — a smaller front gap than the bare carcass.
  assert.ok(gTop < gBare, `benchtop front (${gTop}) is proud of the carcass (${gBare})`);
  assert.equal(gBare - gTop, 18 + 20, "by the door thickness + default overhang");
});
