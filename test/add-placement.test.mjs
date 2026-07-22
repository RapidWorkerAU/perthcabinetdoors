// Auto-placement when adding a new item — findFreeWallSlot() drops a new
// cabinet into the first free gap on its wall so it never lands on top of an
// existing item (the "next free slot" behaviour of plan tools like 2020).
import test from "node:test";
import assert from "node:assert/strict";
import { findFreeWallSlot, getAbsPos } from "../lib/pcd-plan-geometry.js";

const ROOM = { width_mm: 3000, depth_mm: 2400 };
const base = (over = {}) => ({ item_type: "base_cabinet", width_mm: 600, depth_mm: 600, height_mm: 720, mount_height_mm: 0, ...over });

test("empty wall → item lands at the start corner", () => {
  const slot = findFreeWallSlot("top", base(), [], ROOM);
  assert.deepEqual(slot, { wall: "top", x_mm: 0, y_mm: 0 });
});

test("top wall → new item butts past the existing one", () => {
  const existing = [base({ wall: "top", x_mm: 0, y_mm: 0 })];
  const slot = findFreeWallSlot("top", base(), existing, ROOM);
  assert.equal(slot.wall, "top");
  assert.equal(slot.x_mm, 600);
});

test("top wall → new item drops into a gap between two items", () => {
  const existing = [
    base({ wall: "top", x_mm: 0, y_mm: 0 }),
    base({ wall: "top", x_mm: 1500, y_mm: 0 }),
  ];
  // 900mm gap (600→1500) easily fits a 600 item, so it lands at 600.
  const slot = findFreeWallSlot("top", base(), existing, ROOM);
  assert.equal(slot.x_mm, 600);
});

test("top wall → too-small gap is skipped for the next one", () => {
  const existing = [
    base({ wall: "top", x_mm: 0, y_mm: 0 }),
    base({ wall: "top", x_mm: 900, y_mm: 0 }),   // gap 600→900 is only 300mm
  ];
  const slot = findFreeWallSlot("top", base({ width_mm: 600 }), existing, ROOM);
  assert.equal(slot.x_mm, 1500); // past the second item (900+600)
});

test("left wall → position is stored in y_mm, x_mm pinned to 0", () => {
  const existing = [base({ wall: "left", x_mm: 0, y_mm: 0 })];
  const slot = findFreeWallSlot("left", base(), existing, ROOM);
  assert.equal(slot.wall, "left");
  assert.equal(slot.x_mm, 0);
  assert.equal(slot.y_mm, 600);
  // And it reads back to an absolute position that doesn't overlap the existing.
  const abs = getAbsPos({ ...base(), ...slot }, ROOM.width_mm, ROOM.depth_mm);
  assert.equal(abs.absY, 600);
});

test("a wall cabinet above does not block a base cabinet below", () => {
  // Wall cabinet hung at 1400mm shares the same x but a different height band,
  // so the base cabinet can still take x=0.
  const existing = [base({ item_type: "wall_cabinet", wall: "top", x_mm: 0, y_mm: 0, mount_height_mm: 1400 })];
  const slot = findFreeWallSlot("top", base(), existing, ROOM);
  assert.equal(slot.x_mm, 0);
});
