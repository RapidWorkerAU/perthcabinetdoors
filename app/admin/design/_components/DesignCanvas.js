"use client";

import { useCallback, useRef, useState } from "react";
import styles from "../design.module.css";
import { CABINET_MOUNT_MM } from "./FrontElevationView";
import { islandVirtualWall } from "../../../../lib/pcd-kickboard-utils";

const VIEW_W = 1100;
const VIEW_H = 720;
const BAND    = 52;
const MARGIN  = 24;
const SNAP_MM = 10;
const WALL_SNAP_MM = 400; // cabinet snaps to wall if back is within this mm of wall edge

const ITEM_COLORS = {
  base_cabinet:  "#3b82f6",
  wall_cabinet:  "#22c55e",
  tall_cabinet:  "#f97316",
  corner_base_cabinet: "#0ea5e9",
  door:          "#a855f7",
  drawer_front:  "#8b5cf6",
  panel:         "#6b7280",
  obstruction:   "#57534e",
};

const ITEM_SHORT = {
  base_cabinet:  "Base",
  wall_cabinet:  "Wall",
  tall_cabinet:  "Tall",
  corner_base_cabinet: "Corner",
  door:          "Door",
  drawer_front:  "Drwr",
  panel:         "Panel",
  obstruction:   "Obstr.",
};

// --- Geometry helpers ---

function computeLayout(room) {
  const W = room.width_mm || 4000;
  const D = room.depth_mm || 3000;
  const avW = VIEW_W - 2 * (BAND + MARGIN);
  const avH = VIEW_H - 2 * (BAND + MARGIN);
  const scale = Math.min(avW / W, avH / D);
  const roomW = W * scale;
  const roomH = D * scale;
  const ox = BAND + MARGIN + (avW - roomW) / 2;
  const oy = BAND + MARGIN + (avH - roomH) / 2;
  return { scale, roomW, roomH, ox, oy, W, D };
}

function snap(mm) { return Math.round(mm / SNAP_MM) * SNAP_MM; }
function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }

const CORNER_SNAP_MM = 100; // how close to a perpendicular wall counts as "sitting in that corner"

// For a corner cabinet, detects whether its final dragged position also sits
// flush against a perpendicular wall and auto-assigns secondary_wall to it —
// so the L-shape and dual-wall elevation just work once it's dropped into an
// actual room corner. Only ever SETS a positively-detected second wall —
// never clears an existing one just because this position isn't near a
// perpendicular wall. That "against one wall or island" case is exactly
// when the user is expected to set secondary_wall manually via the config
// panel, so a plain drag along the same wall must not wipe that choice out
// from under them.
function withCornerWallDetection(item, patch, roomWidthMm, roomDepthMm) {
  if (item.item_type !== "corner_base_cabinet") return patch;
  const wall = patch.wall ?? item.wall;
  const widthMm = item.width_mm || 900;

  let detectedWall = "";
  if (wall === "top" || wall === "bottom") {
    const xMm = patch.x_mm ?? item.x_mm ?? 0;
    if (xMm <= CORNER_SNAP_MM) detectedWall = "left";
    else if (xMm + widthMm >= roomWidthMm - CORNER_SNAP_MM) detectedWall = "right";
  } else if (wall === "left" || wall === "right") {
    const yMm = patch.y_mm ?? item.y_mm ?? 0;
    if (yMm <= CORNER_SNAP_MM) detectedWall = "top";
    else if (yMm + widthMm >= roomDepthMm - CORNER_SNAP_MM) detectedWall = "bottom";
  }

  if (!detectedWall) return patch;

  const next = { ...patch, secondary_wall: detectedWall };
  if (!item.secondary_width_mm) next.secondary_width_mm = 900;
  return next;
}

// ---- Absolute position helpers ----

// Returns absolute room-space (absX, absY) for any cabinet, normalising both old and new formats.
// Old format for left/right: x_mm = position along wall (room-space y), y_mm = 0.
// New format for left/right: x_mm = 0 (or roomW-depth), y_mm = position along wall.
function getAbsPos(item, roomW, roomD) {
  const x = item.x_mm || 0;
  const y = item.y_mm || 0;
  const d = item.depth_mm || 600;
  switch (item.wall) {
    case "top":    return { absX: x, absY: 0 };
    case "bottom": return { absX: x, absY: roomD - d };
    case "left":
      // x_mm > 0 = old format (x_mm stores the y position); otherwise new format
      return x > 0 ? { absX: 0, absY: x } : { absX: 0, absY: y };
    case "right":
      return x > 0 ? { absX: roomW - d, absY: x } : { absX: roomW - d, absY: y };
    default:
      return { absX: x, absY: y };
  }
}

// Snaps absolute position to nearest room wall if within WALL_SNAP_MM, else island.
// Returns {wall, x_mm, y_mm} in new coordinate format.
function snapToWall(rawAbsX, rawAbsY, itemW, itemD, currentWall, roomW, roomD) {
  // Bounding box depends on current orientation
  const isRotated = currentWall === "left" || currentWall === "right";
  const horizExt  = isRotated ? itemD : itemW;
  const vertExt   = isRotated ? itemW : itemD;

  const dTop    = rawAbsY;
  const dBottom = roomD - rawAbsY - vertExt;
  const dLeft   = rawAbsX;
  const dRight  = roomW - rawAbsX - horizExt;
  const minDist = Math.min(dTop, dBottom, dLeft, dRight);

  if (minDist > WALL_SNAP_MM) {
    return {
      wall:  "island",
      x_mm:  clamp(rawAbsX, 0, roomW - itemW),
      y_mm:  clamp(rawAbsY, 0, roomD - itemD),
    };
  }
  if (dTop <= dBottom && dTop <= dLeft && dTop <= dRight) {
    return { wall: "top",    x_mm: clamp(rawAbsX, 0, roomW - itemW), y_mm: 0            };
  }
  if (dBottom < dTop && dBottom <= dLeft && dBottom <= dRight) {
    return { wall: "bottom", x_mm: clamp(rawAbsX, 0, roomW - itemW), y_mm: roomD - itemD };
  }
  if (dLeft <= dRight) {
    return { wall: "left",   x_mm: 0,             y_mm: clamp(rawAbsY, 0, roomD - itemW) };
  }
  // x_mm must be 0 here (new-format convention, matching "left" above) —
  // getAbsPos() treats ANY x_mm > 0 on a left/right-wall item as "old
  // format" and reads the along-wall position from x_mm instead of y_mm.
  // Writing roomW - itemD here (a real, always-positive value) silently
  // made every right-wall item look like old-format data forever after,
  // so its saved y_mm was never actually read back — the cabinet appeared
  // stuck wherever clamping the stale absY happened to land it.
  return   { wall: "right",  x_mm: 0,  y_mm: clamp(rawAbsY, 0, roomD - itemW) };
}

// ---- Collision helpers ----

// Pushes `desired` out of every obstacle it overlaps along a single axis.
// A single left-to-right pass can resolve overlap with one obstacle by
// pushing straight into another — most likely when a very thin obstacle
// (e.g. an 18mm filler panel) sits right next to a wide one, since the
// push-direction heuristic (whichever side is "closer") can send the item
// toward the second obstacle without ever re-checking it. So this re-runs
// full passes until nothing moves (i.e. no obstacle overlaps any more),
// bounded by obstacle count as a safety cap against pathological inputs.
function resolveCollision1D(desired, width, obstacles, roomMax) {
  let x = clamp(desired, 0, roomMax - width);
  const sorted = obstacles
    .map((o) => ({ lo: o.x_mm || 0, hi: (o.x_mm || 0) + (o.width_mm || 0) }))
    .filter((o) => o.hi > o.lo)
    .sort((a, b) => a.lo - b.lo);

  for (let pass = 0; pass < sorted.length + 2; pass++) {
    let moved = false;
    for (const { lo, hi } of sorted) {
      if (x < hi && x + width > lo) {
        const pushLeft  = lo - width;
        const pushRight = hi;
        const next = (pushLeft >= 0 && x + width / 2 < (lo + hi) / 2) ? pushLeft : pushRight;
        x = clamp(next, 0, roomMax - width);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return x;
}

// Floor footprint of a cabinet in absolute room coordinates (for cross-wall collision).
function cabinetFootprint(item, roomW, roomD) {
  const { absX, absY } = getAbsPos(item, roomW, roomD);
  const w = item.width_mm || 600;
  const d = item.depth_mm || 600;
  switch (item.wall) {
    case "top":
    case "bottom": return { x: absX, y: absY, w,   h: d };
    case "left":
    case "right":  return { x: absX, y: absY, w: d, h: w };
    default:       return null;
  }
}

// Floor footprint of a corner cabinet's SECONDARY leg, in absolute room
// coordinates — the counterpart to cabinetFootprint() for the leg attached
// to secondary_wall. Without this, collision detection only ever sees a
// corner cabinet's primary-leg rectangle, so cabinets dragged onto its
// second wall would overlap the full L-shape (only the small corner-square
// sliver near the primary leg was ever protected). Not trimmed to exclude
// the corner-square overlap with the primary footprint — for collision
// purposes the two rects are just unioned, so overlap is harmless.
function cornerSecondaryFootprint(item, roomW, roomD) {
  if (item.item_type !== "corner_base_cabinet" || !item.secondary_wall || item.secondary_wall === item.wall) {
    return null;
  }
  const primary = cabinetFootprint(item, roomW, roomD);
  if (!primary) return null;
  const { x, y, w, h } = primary;
  const depth    = item.depth_mm || 600;
  const secWidth = item.secondary_width_mm || 900;

  switch (`${item.wall}:${item.secondary_wall}`) {
    case "top:left":     return { x,              y,                    w: depth,    h: secWidth };
    case "top:right":    return { x: x + w - depth, y,                  w: depth,    h: secWidth };
    case "bottom:left":  return { x,              y: y + h - secWidth,  w: depth,    h: secWidth };
    case "bottom:right": return { x: x + w - depth, y: y + h - secWidth, w: depth,   h: secWidth };
    case "left:top":     return { x,              y,                    w: secWidth, h: depth };
    case "left:bottom":  return { x,              y: y + h - depth,     w: secWidth, h: depth };
    case "right:top":    return { x: x + w - secWidth, y,                w: secWidth, h: depth };
    case "right:bottom": return { x: x + w - secWidth, y: y + h - depth, w: secWidth, h: depth };
    default: return null;
  }
}

// Same re-run-until-stable fix as resolveCollision1D — a single pass over
// obstacles can resolve overlap with one by pushing straight into another
// (e.g. escaping a wide cabinet by moving onto a thin filler panel right
// beside it), so this loops full passes until a pass makes no changes.
function resolveCollision2D(desiredX, desiredY, itemW, itemH, obstacles, roomW, roomD) {
  let x = clamp(desiredX, 0, roomW - itemW);
  let y = clamp(desiredY, 0, roomD - itemH);

  for (let pass = 0; pass < obstacles.length + 2; pass++) {
    let moved = false;
    for (const o of obstacles) {
      const oX = o.x_mm || 0;
      const oY = o.y_mm || 0;
      const oW = o.width_mm  || 0;
      const oH = o.depth_mm  || 0;
      const overlapX = Math.min(x + itemW, oX + oW) - Math.max(x, oX);
      const overlapY = Math.min(y + itemH, oY + oH) - Math.max(y, oY);
      if (overlapX > 0 && overlapY > 0) {
        if (overlapX <= overlapY) {
          x = x + itemW / 2 <= oX + oW / 2 ? oX - itemW : oX + oW;
          x = clamp(x, 0, roomW - itemW);
        } else {
          y = y + itemH / 2 <= oY + oH / 2 ? oY - itemH : oY + oH;
          y = clamp(y, 0, roomD - itemH);
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
  return { x, y };
}

const PLAN_SNAP_MM = 20;

// Magnetic edge alignment for plan-view drags — evaluates every candidate
// edge pairing (dragged item's near/far edge against each obstacle's
// near/far edge) and returns the closest one within PLAN_SNAP_MM, or null.
// `obstacles` items use generic {pos, len} fields so this same function
// covers both the along-wall 1D case and the X/Y axes of a freestanding
// island drag. `guide` is the room-space coordinate to draw the alignment
// line at (the obstacle's edge that was matched, not the dragged item's).
function findEdgeSnap(desired, length, obstacles) {
  let best = null;
  for (const o of obstacles) {
    const oPos = o.pos, oLen = o.len;
    const options = [
      { newPos: oPos + oLen,          guide: oPos + oLen },
      { newPos: oPos - length,        guide: oPos },
      { newPos: oPos,                 guide: oPos },
      { newPos: oPos + oLen - length, guide: oPos + oLen },
    ];
    for (const { newPos, guide } of options) {
      const dist = Math.abs(newPos - desired);
      if (dist <= PLAN_SNAP_MM && (!best || dist < best.dist)) best = { dist, newPos, guide };
    }
  }
  return best;
}

function cabinetVerticalRange(item) {
  const mount = item.mount_height_mm ?? (CABINET_MOUNT_MM[item.item_type] ?? 0);
  return [mount, mount + (item.height_mm || 720)];
}
function verticalRangesOverlap([a0, a1], [b0, b1]) { return a0 < b1 && a1 > b0; }

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Same footprint/vertical-range rules the interactive drag collision system
// above uses, but as a static "do these two already-placed items overlap"
// check with no drag in progress — collision is otherwise only ever
// evaluated while dragging, so resizing an item via the right panel's
// number inputs (width/height/depth/mount height) never re-checks it
// against its neighbours. Returns the Set of item ids currently overlapping
// at least one other item in the room, for the caller to flag/highlight.
export function findOverlappingItemIds(items, room) {
  const W = room?.width_mm || 4000;
  const D = room?.depth_mm || 3000;

  function footprintsFor(item) {
    if (item.wall === "island") {
      const { ew, ed } = islandEffectiveDims(item);
      return [{ x: item.x_mm || 0, y: item.y_mm || 0, w: ew, h: ed }];
    }
    const rects = [];
    const primary = cabinetFootprint(item, W, D);
    if (primary) rects.push(primary);
    const secondary = cornerSecondaryFootprint(item, W, D);
    if (secondary) rects.push(secondary);
    return rects;
  }

  const withFootprints = items
    .filter((item) => item.wall) // unplaced/freshly-added items have no footprint yet
    .map((item) => ({
      item,
      footprints: footprintsFor(item),
      vRange: cabinetVerticalRange(item),
    }));

  const overlapping = new Set();
  for (let i = 0; i < withFootprints.length; i++) {
    for (let j = i + 1; j < withFootprints.length; j++) {
      const a = withFootprints[i];
      const b = withFootprints[j];
      if (!verticalRangesOverlap(a.vRange, b.vRange)) continue;
      const anyOverlap = a.footprints.some((fa) => b.footprints.some((fb) => rectsOverlap(fa, fb)));
      if (anyOverlap) {
        overlapping.add(a.item.id);
        overlapping.add(b.item.id);
      }
    }
  }
  return overlapping;
}

function computeGaps1D(xMm, widthMm, others, roomMax) {
  const right = xMm + widthMm;
  const leftObs  = others.filter((o) => (o.x_mm || 0) + (o.width_mm || 0) <= xMm);
  const rightObs = others.filter((o) => (o.x_mm || 0) >= right);
  const leftBound  = leftObs.length  ? Math.max(...leftObs.map((o) => (o.x_mm || 0) + (o.width_mm || 0))) : 0;
  const rightBound = rightObs.length ? Math.min(...rightObs.map((o) => o.x_mm || 0)) : roomMax;
  return { leftGap: xMm - leftBound, rightGap: rightBound - right, leftBoundMm: leftBound, rightBoundMm: rightBound };
}

// ---- Gap dimension indicator ----
function GapDimension({ x1, y1, x2, y2, label, horizontal }) {
  if (!label || label <= 0) return null;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const textW = String(label).length * 6 + 10;
  return (
    <g style={{ pointerEvents: "none" }}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,210,50,0.45)" strokeWidth={1} strokeDasharray="3 2" />
      {horizontal ? (
        <>
          <line x1={x1} y1={my - 4} x2={x1} y2={my + 4} stroke="rgba(255,210,50,0.6)" strokeWidth={1} />
          <line x1={x2} y1={my - 4} x2={x2} y2={my + 4} stroke="rgba(255,210,50,0.6)" strokeWidth={1} />
        </>
      ) : (
        <>
          <line x1={mx - 4} y1={y1} x2={mx + 4} y2={y1} stroke="rgba(255,210,50,0.6)" strokeWidth={1} />
          <line x1={mx - 4} y1={y2} x2={mx + 4} y2={y2} stroke="rgba(255,210,50,0.6)" strokeWidth={1} />
        </>
      )}
      <rect x={mx - textW / 2} y={my - 8} width={textW} height={14} fill="rgba(0,0,0,0.7)" rx={3} />
      <text x={mx} y={my} textAnchor="middle" dominantBaseline="middle" fontSize={9} fontWeight="700" fill="rgba(255,210,50,1)" style={{ userSelect: "none" }}>
        {label}mm
      </text>
    </g>
  );
}

function frontEdgeFor(wall, rotation) {
  if (wall === "island") {
    return ["bottom", "left", "top", "right"][((rotation || 0) / 90) % 4] || "bottom";
  }
  switch (wall) {
    case "top":    return "bottom";
    case "bottom": return "top";
    case "left":   return "right";
    case "right":  return "left";
    default:       return "bottom";
  }
}

// Which rendered rect edge ("top"/"bottom"/"left"/"right") each of a
// cabinet's left end, right end, and back correspond to. Back is always
// the opposite edge from the front (frontEdgeFor's output). Left/right use
// the same axisFlipped convention as the elevation view (facing "bottom"
// or "left" mirrors the along-wall axis), so "left end panel" here lines
// up with what you'd see standing in the room facing that wall.
function panelSideEdges(item) {
  const front = frontEdgeFor(item.wall, item.rotation);
  const back  = { bottom: "top", top: "bottom", left: "right", right: "left" }[front];
  const wall  = item.wall === "island" ? islandVirtualWall(item) : item.wall;
  const flip  = wall === "bottom" || wall === "left";
  let leftEdge, rightEdge;
  if (wall === "top" || wall === "bottom") {
    leftEdge  = flip ? "right" : "left";
    rightEdge = flip ? "left"  : "right";
  } else {
    leftEdge  = flip ? "bottom" : "top";
    rightEdge = flip ? "top"    : "bottom";
  }
  return { leftEdge, rightEdge, backEdge: back };
}

function edgeStripRect(rect, edge, t = 4) {
  const { x, y, w, h } = rect;
  switch (edge) {
    case "top":    return { x,             y,             w,   h: t };
    case "bottom": return { x,             y: y + h - t,  w,   h: t };
    case "left":   return { x,             y,             w: t, h };
    case "right":  return { x: x + w - t,  y,             w: t, h };
    default:       return null;
  }
}

// For a freestanding ("island") cabinet, a 90°/270° rotation swaps which
// physical dimension runs horizontally vs vertically in plan view — a
// wall-mounted cabinet's orientation is already fully determined by which
// wall it's on, so this only applies to wall === "island". Used everywhere
// an island item's footprint size matters (render, drag start, collision)
// so the rotation picker actually changes the plan-view shape, not just
// the front-facing indicator.
function islandEffectiveDims(item) {
  const w = item.width_mm || 600;
  const d = item.depth_mm || 600;
  if (item.wall === "island" && (item.rotation || 0) % 180 === 90) {
    return { ew: d, ed: w };
  }
  return { ew: w, ed: d };
}

// Returns {x, y, w, h} in SVG coordinates using absolute room position.
function cabinetSvgRect(item, lay) {
  const { scale, ox, oy, W, D } = lay;
  const { ew, ed } = islandEffectiveDims(item);
  const iw  = Math.max(ew, 100);
  const id  = Math.max(ed, 100);
  const { absX, absY } = getAbsPos(item, W, D);

  switch (item.wall) {
    case "left":
    case "right": {
      // depth runs horizontally (into room), width runs vertically (along wall)
      return {
        x: ox + clamp(absX, 0, W - id) * scale,
        y: oy + clamp(absY, 0, D - iw) * scale,
        w: id * scale,
        h: iw * scale,
      };
    }
    default: {
      // top, bottom, island: width horizontal, depth vertical
      return {
        x: ox + clamp(absX, 0, W - iw) * scale,
        y: oy + clamp(absY, 0, D - id) * scale,
        w: iw * scale,
        h: id * scale,
      };
    }
  }
}

// Computes the single L-shaped outline (6 points, clockwise) for a corner
// cabinet that has both `wall` and `secondary_wall` set. `rect` is the
// primary leg's box (same width_mm × depth_mm any regular cabinet gets).
// The secondary leg is a depth_mm-thick, secondary_width_mm-long extension
// attached at whichever corner of `rect` touches secondary_wall. Returns
// null if the wall/secondary_wall pair isn't a valid perpendicular
// combination — callers fall back to the plain rect.
//
// Each of the 8 valid (wall, secondary_wall) pairs is written out directly
// rather than derived generically — the two legs' relative proportions flip
// (which one is "wider" vs "taller") between the top/bottom and left/right
// cases, and hand-verifying 8 known-good shapes was safer than one general
// formula that silently mishandles an orientation.
function cornerFootprintPoints(item, rect, lay) {
  if (!item.secondary_wall || item.secondary_wall === item.wall) return null;
  const { scale } = lay;
  const { x, y, w, h } = rect;
  const d = Math.max((item.depth_mm || 600) * scale, 4);
  const s = Math.max((item.secondary_width_mm || 900) * scale, 4);

  switch (`${item.wall}:${item.secondary_wall}`) {
    case "top:left":
      return [[x, y], [x + w, y], [x + w, y + h], [x + d, y + h], [x + d, y + s], [x, y + s]];
    case "top:right":
      return [[x, y], [x + w, y], [x + w, y + s], [x + w - d, y + s], [x + w - d, y + h], [x, y + h]];
    case "bottom:left":
      return [[x, y + h - s], [x + d, y + h - s], [x + d, y], [x + w, y], [x + w, y + h], [x, y + h]];
    case "bottom:right":
      return [[x + w, y + h - s], [x + w - d, y + h - s], [x + w - d, y], [x, y], [x, y + h], [x + w, y + h]];
    case "left:top":
      return [[x, y], [x + s, y], [x + s, y + d], [x + w, y + d], [x + w, y + h], [x, y + h]];
    case "left:bottom":
      return [[x, y], [x + w, y], [x + w, y + h - d], [x + s, y + h - d], [x + s, y + h], [x, y + h]];
    case "right:top":
      return [[x + w - s, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y + d], [x + w - s, y + d]];
    case "right:bottom":
      return [[x, y], [x + w, y], [x + w, y + h], [x + w - s, y + h], [x + w - s, y + h - d], [x, y + h - d]];
    default:
      return null;
  }
}

// The secondary leg's own bounding rect (depth × secondary_width), used for
// marking its back panel — the primary rect (cabinetSvgRect's own output)
// already IS the primary leg's rect, but there's no standalone rect for the
// secondary leg since it's normally only rendered as part of the fused
// L-shape polygon above. Same per-case geometry as cornerFootprintPoints,
// just returning the secondary leg's own box instead of the fused outline.
function cornerSecondaryRect(item, rect, lay) {
  if (!item.secondary_wall || item.secondary_wall === item.wall) return null;
  const { scale } = lay;
  const { x, y, w, h } = rect;
  const d = Math.max((item.depth_mm || 600) * scale, 4);
  const s = Math.max((item.secondary_width_mm || 900) * scale, 4);

  switch (`${item.wall}:${item.secondary_wall}`) {
    case "top:left":     return { x,             y,             w: d, h: s };
    case "top:right":    return { x: x + w - d,  y,             w: d, h: s };
    case "bottom:left":  return { x,             y: y + h - s,  w: d, h: s };
    case "bottom:right": return { x: x + w - d,  y: y + h - s,  w: d, h: s };
    case "left:top":     return { x,             y,             w: s, h: d };
    case "left:bottom":  return { x,             y: y + h - d,  w: s, h: d };
    case "right:top":    return { x: x + w - s,  y,             w: s, h: d };
    case "right:bottom": return { x: x + w - s,  y: y + h - d,  w: s, h: d };
    default: return null;
  }
}

// Computes the white "front/open" strips for a corner cabinet: two short
// segments, one per leg, each running along that leg's own outer (door)
// edge and inset toward that leg's wall — mirroring FrontFaceStrip's
// inset-toward-the-wall convention. Deliberately NOT one continuous strip:
// the two open faces sit at different offsets (each leg's edge is offset by
// depth_mm from its own wall) and meet at the inner/return corner rather
// than lining up, so a single strip would misrepresent the return zone as
// open. Returns null if not a valid corner pair.
function cornerFrontSegments(item, rect, lay) {
  if (!item.secondary_wall || item.secondary_wall === item.wall) return null;
  const { scale } = lay;
  const { x, y, w, h } = rect;
  const d = Math.max((item.depth_mm || 600) * scale, 4);
  const s = Math.max((item.secondary_width_mm || 900) * scale, 4);
  const t = 5;
  const secLen = Math.max(s - d, 0);

  switch (`${item.wall}:${item.secondary_wall}`) {
    case "top:left":
      return [
        { x: x + d, y: y + h - t, w: w - d, h: t },
        { x: x + d - t, y: y + h, w: t, h: secLen },
      ];
    case "top:right":
      return [
        { x: x, y: y + h - t, w: w - d, h: t },
        { x: x + w - d, y: y + h, w: t, h: secLen },
      ];
    case "bottom:left":
      return [
        { x: x + d, y: y, w: w - d, h: t },
        { x: x + d - t, y: y + h - s, w: t, h: secLen },
      ];
    case "bottom:right":
      return [
        { x: x, y: y, w: w - d, h: t },
        { x: x + w - d, y: y + h - s, w: t, h: secLen },
      ];
    case "left:top":
      return [
        { x: x + w - t, y: y + d, w: t, h: h - d },
        { x: x + w, y: y + d - t, w: secLen, h: t },
      ];
    case "left:bottom":
      return [
        { x: x + w - t, y: y, w: t, h: h - d },
        { x: x + w, y: y + h - d, w: secLen, h: t },
      ];
    case "right:top":
      return [
        { x: x, y: y + d, w: t, h: h - d },
        { x: x - secLen, y: y + d - t, w: secLen, h: t },
      ];
    case "right:bottom":
      return [
        { x: x, y: y, w: t, h: h - d },
        { x: x - secLen, y: y + h - d, w: secLen, h: t },
      ];
    default:
      return null;
  }
}

// --- SVG sub-components ---

function FrontFaceStrip({ rect, frontEdge }) {
  const { x, y, w, h } = rect;
  const t = 5;
  let rx, ry, rw, rh;
  switch (frontEdge) {
    case "bottom": rx = x;       ry = y + h - t; rw = w; rh = t; break;
    case "top":    rx = x;       ry = y;         rw = w; rh = t; break;
    case "right":  rx = x + w - t; ry = y;       rw = t; rh = h; break;
    case "left":   rx = x;       ry = y;         rw = t; rh = h; break;
    default: return null;
  }
  return (
    <rect
      x={rx} y={ry} width={rw} height={rh}
      fill="rgba(255,255,255,0.80)"
      rx={1}
      style={{ pointerEvents: "none" }}
    />
  );
}

function CabinetShape({ item, lay, selected, dragging, isOverlapping, onPointerDown, onPointerUp }) {
  const rect = cabinetSvgRect(item, lay);
  if (!rect) return null;

  const { x, y, w, h } = rect;
  const fill      = ITEM_COLORS[item.item_type] || "#888";
  const frontEdge = frontEdgeFor(item.wall, item.rotation);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const isCorner  = item.item_type === "corner_base_cabinet";
  const footprint = isCorner ? cornerFootprintPoints(item, rect, lay) : null;
  // Wall cabinets are mounted above the floor, so their plan footprint can
  // legitimately sit right over a base/tall cabinet below — render them
  // translucent + dashed (the standard "hidden line" convention for
  // something above) instead of a solid box, so both stay visible together
  // rather than one opaquely hiding the other.
  const isWallCab = item.item_type === "wall_cabinet";
  // Obstruction: a non-manufactured spatial blocker (nib wall, full wall,
  // brick recess) — solid + hazard-hatched so it reads as "structure", not
  // a cabinet, and never gets a front-face strip since it has no front.
  const isObstruction = item.item_type === "obstruction";

  const label      = item.label || ITEM_SHORT[item.item_type] || "?";
  const shortLabel = label.length > 12 ? label.slice(0, 11) + "…" : label;
  const dimText    = item.width_mm ? `${item.width_mm}w` + (item.depth_mm ? ` × ${item.depth_mm}d` : "") : "";
  const fontSize   = Math.min(w, h) > 50 ? 10 : 8;
  const showDims   = w > 55 && h > 34 && dimText;

  return (
    <g
      style={{ cursor: dragging ? "grabbing" : "grab" }}
      onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, item); }}
      onPointerUp={(e)   => { e.stopPropagation(); onPointerUp(e, item); }}
    >
      {footprint ? (
        <polygon
          points={footprint.map(([px, py]) => `${px},${py}`).join(" ")}
          fill={fill}
          fillOpacity={dragging ? 0.55 : selected ? 0.95 : 0.82}
          stroke={selected ? "#fff" : "rgba(255,255,255,0.35)"}
          strokeWidth={selected ? 2 : 1}
          strokeLinejoin="round"
        />
      ) : (
        <rect
          x={x} y={y} width={w} height={h}
          rx={3}
          fill={fill}
          fillOpacity={isWallCab
            ? (dragging ? 0.28 : selected ? 0.65 : 0.42)
            : (dragging ? 0.55 : selected ? 0.95 : 0.82)}
          strokeDasharray={isWallCab ? "4 2" : undefined}
          stroke={selected ? "#fff" : "rgba(255,255,255,0.35)"}
          strokeWidth={selected ? 2 : 1}
        />
      )}
      {isObstruction && (
        <rect
          x={x} y={y} width={w} height={h}
          rx={3}
          fill="url(#obstructionHatch)"
          style={{ pointerEvents: "none" }}
        />
      )}
      {/* Collision is only re-checked during an interactive drag, so a
          resize made via the right panel's number inputs can silently leave
          two items overlapping — flag it here since nothing else will. */}
      {isOverlapping && (
        <rect
          x={x} y={y} width={w} height={h}
          rx={3}
          fill="none"
          stroke="#ef4444"
          strokeWidth={2}
          strokeDasharray="5 3"
          style={{ pointerEvents: "none" }}
        />
      )}
      {w > 16 && h > 16 && (
        <rect
          x={x + 4} y={y + 4} width={Math.max(w - 8, 2)} height={Math.max(h - 8, 2)}
          fill="none"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={1}
          rx={1}
          style={{ pointerEvents: "none" }}
        />
      )}
      {isObstruction ? null : footprint ? (
        cornerFrontSegments(item, rect, lay)?.map((seg, i) => (
          <rect
            key={i}
            x={seg.x} y={seg.y} width={Math.max(seg.w, 0)} height={Math.max(seg.h, 0)}
            fill="rgba(255,255,255,0.80)"
            rx={1}
            style={{ pointerEvents: "none" }}
          />
        ))
      ) : (
        <FrontFaceStrip rect={rect} frontEdge={frontEdge} />
      )}
      {/* End / back panel indicators — base/tall cabinets only, matching
          the same scoping as has_back_panel/end_panel_left/right. */}
      {!isCorner && (item.end_panel_left || item.end_panel_right || item.has_back_panel) && (() => {
        const { leftEdge, rightEdge, backEdge } = panelSideEdges(item);
        const edges = [];
        if (item.end_panel_left)  edges.push({ edge: leftEdge,  key: "left" });
        if (item.end_panel_right) edges.push({ edge: rightEdge, key: "right" });
        if (item.has_back_panel)  edges.push({ edge: backEdge,  key: "back" });
        return edges.map(({ edge, key }) => {
          const s = edgeStripRect(rect, edge);
          if (!s) return null;
          return (
            <rect
              key={key}
              x={s.x} y={s.y} width={s.w} height={s.h}
              fill="#a855f7" fillOpacity={0.9}
              style={{ pointerEvents: "none" }}
            />
          );
        });
      })()}
      {/* Corner cabinet back panels — one per leg, manually toggled rather
          than auto-detected (a corner cabinet's second wall is often a
          manual/virtual assignment, not a real wall, so "exposed" can't be
          reliably sensed). The back edge name always equals the leg's own
          wall name (top/bottom/left/right), for both the primary rect and
          the secondary leg's own rect. */}
      {isCorner && (item.back_panel_wall1 || item.back_panel_wall2) && (() => {
        const strips = [];
        if (item.back_panel_wall1) {
          const s = edgeStripRect(rect, item.wall);
          if (s) strips.push({ ...s, key: "wall1" });
        }
        if (item.back_panel_wall2 && item.secondary_wall && item.secondary_wall !== item.wall) {
          const secRect = cornerSecondaryRect(item, rect, lay);
          const s = secRect ? edgeStripRect(secRect, item.secondary_wall) : null;
          if (s) strips.push({ ...s, key: "wall2" });
        }
        return strips.map(({ key, x: sx, y: sy, w: sw, h: sh }) => (
          <rect key={key} x={sx} y={sy} width={sw} height={sh}
            fill="#a855f7" fillOpacity={0.9} style={{ pointerEvents: "none" }} />
        ));
      })()}
      {w > 22 && h > 18 && (
        <text
          x={cx} y={cy + (showDims ? -6 : 0)}
          textAnchor="middle" dominantBaseline="middle"
          fontSize={fontSize} fontWeight="700" fill="#fff"
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          {shortLabel}
        </text>
      )}
      {showDims && (
        <text
          x={cx} y={cy + 7}
          textAnchor="middle" dominantBaseline="middle"
          fontSize={7} fill="rgba(255,255,255,0.65)"
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          {dimText}
        </text>
      )}
      {/* Wall badge */}
      {item.wall && item.wall !== "island" && w > 18 && h > 14 && (
        <g style={{ pointerEvents: "none" }}>
          <rect x={x + w - 13} y={y + 2} width={11} height={11} rx={2} fill="rgba(0,0,0,0.55)" />
          <text x={x + w - 7.5} y={y + 7.5} textAnchor="middle" dominantBaseline="middle"
            fontSize={6.5} fill="rgba(255,255,255,0.75)" fontWeight="700">
            {item.wall[0].toUpperCase()}
          </text>
        </g>
      )}
      {selected && (() => {
        const glowXs = footprint ? footprint.map((p) => p[0]) : [x, x + w];
        const glowYs = footprint ? footprint.map((p) => p[1]) : [y, y + h];
        const gx = Math.min(...glowXs), gx2 = Math.max(...glowXs);
        const gy = Math.min(...glowYs), gy2 = Math.max(...glowYs);
        return (
          <rect
            x={gx - 3} y={gy - 3} width={gx2 - gx + 6} height={gy2 - gy + 6}
            fill="none"
            stroke="rgba(255,255,255,0.9)"
            strokeWidth={1.5}
            strokeDasharray="5 3"
            rx={4}
            style={{ pointerEvents: "none" }}
          />
        );
      })()}
    </g>
  );
}

// --- Main canvas ---

export default function DesignCanvas({
  room,
  items,
  selectedItemId,
  overlappingItemIds,
  onItemClick,
  onDeselect,
  onItemDragEnd,
  onFrontView,
}) {
  const svgRef = useRef(null);
  const itemPressedRef = useRef(false);

  const [drag, setDrag] = useState(null);
  const [localPos, setLocalPos] = useState({});
  const [snapGuides, setSnapGuides] = useState(null); // { x?: mm, y?: mm } in room-space

  const lay = computeLayout(room);
  const { roomW, roomH, ox, oy, scale, W, D } = lay;

  function toSvgPt(clientX, clientY) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: ((clientX - rect.left) / rect.width)  * VIEW_W,
      y: ((clientY - rect.top)  / rect.height) * VIEW_H,
    };
  }

  // --- Drag handlers ---

  function handleItemPointerDown(e, item) {
    e.preventDefault();
    const pt = toSvgPt(e.clientX, e.clientY);
    itemPressedRef.current = true;
    const { absX, absY } = getAbsPos(item, W, D);
    const { ew, ed } = islandEffectiveDims(item);
    setDrag({
      itemId:      item.id,
      wall:        item.wall,   // starting wall — used for orientation during drag
      startPt:     pt,
      startAbsX:   absX,
      startAbsY:   absY,
      itemWidthMm: ew,
      itemDepthMm: ed,
    });
    onItemClick(item);
  }

  function handleItemPointerUp(e, item) {
    if (!drag || drag.itemId !== item.id) return;
    const current = localPos[item.id];
    if (current) {
      onItemDragEnd(item.id, withCornerWallDetection(item, current, W, D));
      setLocalPos((p) => { const n = { ...p }; delete n[item.id]; return n; });
    }
    setDrag(null);
    setSnapGuides(null);
  }

  const handleSvgPointerMove = useCallback(
    (e) => {
      if (!drag) return;
      const pt    = toSvgPt(e.clientX, e.clientY);
      const dxMm  = (pt.x - drag.startPt.x) / scale;
      const dyMm  = (pt.y - drag.startPt.y) / scale;

      const rawAbsX = drag.startAbsX + dxMm;
      const rawAbsY = drag.startAbsY + dyMm;

      // Detect target wall and get clamped snap position
      const snapped = snapToWall(rawAbsX, rawAbsY, drag.itemWidthMm, drag.itemDepthMm, drag.wall, W, D);
      const { wall: newWall } = snapped;
      let { x_mm: newX, y_mm: newY } = snapped;

      // Vertical range for height-aware collision (wall cabs above base cabs = no collision)
      const draggingItem   = items.find((i) => i.id === drag.itemId);
      const draggingVRange = draggingItem ? cabinetVerticalRange(draggingItem) : [0, 720];

      // Items on the detected target wall that conflict in height
      const sameWall = items.filter((i) =>
        i.id !== drag.itemId &&
        i.wall === newWall &&
        verticalRangesOverlap(draggingVRange, cabinetVerticalRange(i))
      );

      // Cross-wall footprint obstacles
      const dragDepth = drag.itemDepthMm;
      const crossWall = (newWall === "island") ? [] : items
        .filter((i) =>
          i.id !== drag.itemId &&
          i.wall !== newWall &&
          ["top","bottom","left","right"].includes(i.wall) &&
          verticalRangesOverlap(draggingVRange, cabinetVerticalRange(i))
        )
        .flatMap((other) => {
          const fp = cabinetFootprint(other, W, D);
          if (!fp) return [];
          if (newWall === "top" || newWall === "bottom") {
            const dragY0 = newWall === "top" ? 0 : D - dragDepth;
            const dragY1 = newWall === "top" ? dragDepth : D;
            if (fp.y < dragY1 && fp.y + fp.h > dragY0) return [{ x_mm: fp.x, width_mm: fp.w }];
          } else if (newWall === "left" || newWall === "right") {
            const dragX0 = newWall === "left" ? 0 : W - dragDepth;
            const dragX1 = newWall === "left" ? dragDepth : W;
            if (fp.x < dragX1 && fp.x + fp.w > dragX0) return [{ x_mm: fp.y, width_mm: fp.h }];
          }
          return [];
        });

      // Convert same-wall items to 1D obstacle format (position along wall axis)
      const sameWallObs = sameWall.map((o) => {
        const { absX: oAbsX, absY: oAbsY } = getAbsPos(o, W, D);
        return {
          x_mm:     (newWall === "left" || newWall === "right") ? oAbsY : oAbsX,
          width_mm: o.width_mm || 600,
        };
      });

      // Corner cabinets whose SECONDARY leg sits on the target wall (their
      // primary leg may be on a completely different wall) — without this,
      // only their primary leg's footprint would ever block other cabinets,
      // so anything dropped onto their second wall would overlap the return leg.
      const secondaryLegObs = items
        .filter((i) =>
          i.id !== drag.itemId &&
          i.item_type === "corner_base_cabinet" &&
          i.secondary_wall === newWall &&
          i.wall !== newWall &&
          verticalRangesOverlap(draggingVRange, cabinetVerticalRange(i))
        )
        .flatMap((other) => {
          const fp = cornerSecondaryFootprint(other, W, D);
          if (!fp) return [];
          return (newWall === "left" || newWall === "right")
            ? [{ x_mm: fp.y, width_mm: fp.h }]
            : [{ x_mm: fp.x, width_mm: fp.w }];
        });

      const others = [...sameWallObs, ...crossWall, ...secondaryLegObs];

      if (newWall === "top" || newWall === "bottom") {
        // Magnetic alignment to a nearby cabinet's edge on this wall, before
        // collision resolution — an exact edge-flush position never trips
        // the collision push-away against the very obstacle it aligned to,
        // so this and the overlap guard below compose cleanly.
        const edgeSnap = findEdgeSnap(newX, drag.itemWidthMm, others.map((o) => ({ pos: o.x_mm, len: o.width_mm })));
        setSnapGuides(edgeSnap ? { x: edgeSnap.guide } : null);
        if (edgeSnap) newX = edgeSnap.newPos;
        newX = snap(resolveCollision1D(newX, drag.itemWidthMm, others, W));
      } else if (newWall === "left" || newWall === "right") {
        const edgeSnap = findEdgeSnap(newY, drag.itemWidthMm, others.map((o) => ({ pos: o.x_mm, len: o.width_mm })));
        setSnapGuides(edgeSnap ? { y: edgeSnap.guide } : null);
        if (edgeSnap) newY = edgeSnap.newPos;
        newY = snap(resolveCollision1D(newY, drag.itemWidthMm, others, D));
      } else {
        // Island: 2D collision with other island items (rotation-aware —
        // a 90°/270°-rotated island cabinet's footprint is depth-wide, not
        // width-wide) PLUS wall-mounted cabinets' floor footprints,
        // including a corner cabinet's secondary leg — a freestanding item
        // shouldn't be droppable on top of either. Edge alignment snaps
        // each axis independently against the same obstacle set.
        const islandObs = items
          .filter((i) => i.id !== drag.itemId && i.wall === "island")
          .map((i) => {
            const { ew, ed } = islandEffectiveDims(i);
            return { x_mm: i.x_mm || 0, y_mm: i.y_mm || 0, width_mm: ew, depth_mm: ed };
          });
        const wallCabObs = items
          .filter((i) =>
            i.id !== drag.itemId &&
            ["top", "bottom", "left", "right"].includes(i.wall) &&
            verticalRangesOverlap(draggingVRange, cabinetVerticalRange(i))
          )
          .flatMap((other) => {
            const fps = [cabinetFootprint(other, W, D), cornerSecondaryFootprint(other, W, D)].filter(Boolean);
            return fps.map((fp) => ({ x_mm: fp.x, y_mm: fp.y, width_mm: fp.w, depth_mm: fp.h }));
          });
        const islandAndWallObs = [...islandObs, ...wallCabObs];

        const edgeSnapX = findEdgeSnap(rawAbsX, drag.itemWidthMm, islandAndWallObs.map((o) => ({ pos: o.x_mm, len: o.width_mm })));
        const edgeSnapY = findEdgeSnap(rawAbsY, drag.itemDepthMm, islandAndWallObs.map((o) => ({ pos: o.y_mm, len: o.depth_mm })));
        setSnapGuides((edgeSnapX || edgeSnapY)
          ? { ...(edgeSnapX ? { x: edgeSnapX.guide } : {}), ...(edgeSnapY ? { y: edgeSnapY.guide } : {}) }
          : null);
        const snappedX = edgeSnapX ? edgeSnapX.newPos : rawAbsX;
        const snappedY = edgeSnapY ? edgeSnapY.newPos : rawAbsY;

        const resolved = resolveCollision2D(snappedX, snappedY, drag.itemWidthMm, drag.itemDepthMm, islandAndWallObs, W, D);
        newX = snap(resolved.x);
        newY = snap(resolved.y);
      }

      setLocalPos((p) => ({ ...p, [drag.itemId]: { wall: newWall, x_mm: newX, y_mm: newY } }));
    },
    [drag, scale, W, D, items, room] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleSvgPointerUp = useCallback(
    () => {
      if (!drag) return;
      const current = localPos[drag.itemId];
      if (current) {
        const draggedItem = items.find((i) => i.id === drag.itemId);
        onItemDragEnd(drag.itemId, draggedItem ? withCornerWallDetection(draggedItem, current, W, D) : current);
        setLocalPos((p) => { const n = { ...p }; delete n[drag.itemId]; return n; });
      }
      setDrag(null);
      setSnapGuides(null);
    },
    [drag, localPos, onItemDragEnd, items, W, D]
  );

  // Merge live drag positions for display
  const displayItems = items.map((item) =>
    localPos[item.id] ? { ...item, ...localPos[item.id] } : item
  );

  // Wall band areas (visual reference + elevation buttons)
  const wallBands = [
    { wall: "top",    x: ox,          y: oy - BAND,   w: roomW, h: BAND },
    { wall: "bottom", x: ox,          y: oy + roomH,  w: roomW, h: BAND },
    { wall: "left",   x: ox - BAND,   y: oy,          w: BAND,  h: roomH },
    { wall: "right",  x: ox + roomW,  y: oy,          w: BAND,  h: roomH },
  ];

  const wallLabels = [
    { wall: "top",    x: ox + roomW / 2,        y: oy - BAND / 2 },
    { wall: "bottom", x: ox + roomW / 2,        y: oy + roomH + BAND / 2 },
    { wall: "left",   x: ox - BAND / 2,         y: oy + roomH / 2, rotate: -90 },
    { wall: "right",  x: ox + roomW + BAND / 2, y: oy + roomH / 2, rotate: 90  },
  ];

  // Wall colour during drag: show which wall the cabinet will snap to
  const dragWall = drag ? (localPos[drag.itemId]?.wall ?? drag.wall) : null;

  return (
    <svg
      ref={svgRef}
      className={styles.canvasSvg}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      onClick={(e) => {
        if (itemPressedRef.current) { itemPressedRef.current = false; return; }
        if (e.target === svgRef.current) onDeselect();
      }}
      onPointerMove={handleSvgPointerMove}
      onPointerUp={handleSvgPointerUp}
      onPointerLeave={handleSvgPointerUp}
    >
      <defs>
        {/* Fixed tile size in SVG user-space (not tied to each rect's own
            bounding box) — keeps stripe spacing/thickness identical no
            matter how big or small an obstruction is. */}
        <pattern id="obstructionHatch" width={14} height={14} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={14} stroke="rgba(255,255,255,0.16)" strokeWidth={3} />
        </pattern>
      </defs>

      {/* ---- Room floor ---- */}
      <rect
        x={ox} y={oy} width={roomW} height={roomH}
        fill="#1e2940"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth={1.5}
        onClick={onDeselect}
        style={{ cursor: "default" }}
      />

      {/* Floor grid — 600mm */}
      {Array.from({ length: Math.ceil((room.width_mm || 4000) / 600) }).map((_, i) => (
        <line key={`gx-${i}`}
          x1={ox + (i + 1) * 600 * scale} y1={oy}
          x2={ox + (i + 1) * 600 * scale} y2={oy + roomH}
          stroke="rgba(255,255,255,0.04)" strokeWidth={1}
          style={{ pointerEvents: "none" }} />
      ))}
      {Array.from({ length: Math.ceil((room.depth_mm || 3000) / 600) }).map((_, i) => (
        <line key={`gy-${i}`}
          x1={ox} y1={oy + (i + 1) * 600 * scale}
          x2={ox + roomW} y2={oy + (i + 1) * 600 * scale}
          stroke="rgba(255,255,255,0.04)" strokeWidth={1}
          style={{ pointerEvents: "none" }} />
      ))}

      {/* ---- Room dimension labels ---- */}
      {room.width_mm && (
        <>
          <line x1={ox} y1={oy - BAND - 10} x2={ox + roomW} y2={oy - BAND - 10} stroke="rgba(255,255,255,0.2)" strokeWidth={1} style={{ pointerEvents: "none" }} />
          <line x1={ox} y1={oy - BAND - 6} x2={ox} y2={oy - BAND - 14} stroke="rgba(255,255,255,0.2)" strokeWidth={1} style={{ pointerEvents: "none" }} />
          <line x1={ox + roomW} y1={oy - BAND - 6} x2={ox + roomW} y2={oy - BAND - 14} stroke="rgba(255,255,255,0.2)" strokeWidth={1} style={{ pointerEvents: "none" }} />
          <text x={ox + roomW / 2} y={oy - BAND - 17} textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.45)" style={{ pointerEvents: "none" }}>{room.width_mm}mm</text>
          <line x1={ox} y1={oy + roomH + BAND + 10} x2={ox + roomW} y2={oy + roomH + BAND + 10} stroke="rgba(255,255,255,0.2)" strokeWidth={1} style={{ pointerEvents: "none" }} />
          <line x1={ox} y1={oy + roomH + BAND + 6} x2={ox} y2={oy + roomH + BAND + 14} stroke="rgba(255,255,255,0.2)" strokeWidth={1} style={{ pointerEvents: "none" }} />
          <line x1={ox + roomW} y1={oy + roomH + BAND + 6} x2={ox + roomW} y2={oy + roomH + BAND + 14} stroke="rgba(255,255,255,0.2)" strokeWidth={1} style={{ pointerEvents: "none" }} />
          <text x={ox + roomW / 2} y={oy + roomH + BAND + 22} textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.45)" style={{ pointerEvents: "none" }}>{room.width_mm}mm</text>
        </>
      )}
      {room.depth_mm && (
        <>
          <line x1={ox - BAND - 10} y1={oy} x2={ox - BAND - 10} y2={oy + roomH} stroke="rgba(255,255,255,0.2)" strokeWidth={1} style={{ pointerEvents: "none" }} />
          <line x1={ox - BAND - 6} y1={oy} x2={ox - BAND - 14} y2={oy} stroke="rgba(255,255,255,0.2)" strokeWidth={1} style={{ pointerEvents: "none" }} />
          <line x1={ox - BAND - 6} y1={oy + roomH} x2={ox - BAND - 14} y2={oy + roomH} stroke="rgba(255,255,255,0.2)" strokeWidth={1} style={{ pointerEvents: "none" }} />
          <text x={ox - BAND - 17} y={oy + roomH / 2} textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.45)" transform={`rotate(-90, ${ox - BAND - 17}, ${oy + roomH / 2})`} style={{ pointerEvents: "none" }}>{room.depth_mm}mm</text>
          <line x1={ox + roomW + BAND + 10} y1={oy} x2={ox + roomW + BAND + 10} y2={oy + roomH} stroke="rgba(255,255,255,0.2)" strokeWidth={1} style={{ pointerEvents: "none" }} />
          <line x1={ox + roomW + BAND + 6} y1={oy} x2={ox + roomW + BAND + 14} y2={oy} stroke="rgba(255,255,255,0.2)" strokeWidth={1} style={{ pointerEvents: "none" }} />
          <line x1={ox + roomW + BAND + 6} y1={oy + roomH} x2={ox + roomW + BAND + 14} y2={oy + roomH} stroke="rgba(255,255,255,0.2)" strokeWidth={1} style={{ pointerEvents: "none" }} />
          <text x={ox + roomW + BAND + 17} y={oy + roomH / 2} textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.45)" transform={`rotate(90, ${ox + roomW + BAND + 17}, ${oy + roomH / 2})`} style={{ pointerEvents: "none" }}>{room.depth_mm}mm</text>
        </>
      )}

      {/* ---- Wall bands (visual reference only — no click-to-add) ---- */}
      {wallBands.map(({ wall, x, y, w, h }) => {
        const isTarget = dragWall === wall;
        return (
          <rect
            key={wall}
            x={x} y={y} width={w} height={h}
            fill={isTarget ? "rgba(99,179,237,0.12)" : "rgba(255,255,255,0.03)"}
            stroke={isTarget ? "rgba(99,179,237,0.5)" : "rgba(255,255,255,0.08)"}
            strokeWidth={1}
            strokeDasharray={isTarget ? "0" : "5 4"}
            rx={4}
            style={{ pointerEvents: "none" }}
          />
        );
      })}

      {/* Wall labels + elevation buttons */}
      {wallLabels.map(({ wall, x, y, rotate }) => {
        const isTarget = dragWall === wall;
        const btnW = 38, btnH = 14;
        let bx, by;
        if (wall === "top")    { bx = x - btnW / 2;     by = y + 8;  }
        if (wall === "bottom") { bx = x - btnW / 2;     by = y - 20; }
        if (wall === "left")   { bx = x - btnW / 2 + 2; by = y + 10; }
        if (wall === "right")  { bx = x - btnW / 2 - 2; by = y + 10; }

        return (
          <g key={`wl-${wall}`}>
            <text
              x={x} y={wall === "top" ? y - 10 : wall === "bottom" ? y + 10 : y}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={9} letterSpacing={1}
              fill={isTarget ? "rgba(99,179,237,0.9)" : "rgba(255,255,255,0.22)"}
              transform={rotate ? `rotate(${rotate}, ${x}, ${y})` : undefined}
              style={{ pointerEvents: "none", userSelect: "none", textTransform: "uppercase" }}
            >
              {wall}
            </text>
            <g style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); onFrontView(wall); }}>
              <rect x={bx} y={by} width={btnW} height={btnH} fill="rgba(255,255,255,0.08)" rx={3}
                onMouseEnter={(e) => e.currentTarget.setAttribute("fill", "rgba(255,255,255,0.18)")}
                onMouseLeave={(e) => e.currentTarget.setAttribute("fill", "rgba(255,255,255,0.08)")}
              />
              <text x={bx + btnW / 2} y={by + btnH / 2} textAnchor="middle" dominantBaseline="middle"
                fontSize={8} fill="rgba(255,255,255,0.5)" style={{ userSelect: "none", pointerEvents: "none" }}>
                ↗ Elevation
              </text>
            </g>
          </g>
        );
      })}

      {/* ---- Cabinets ----
          Wall cabinets are mounted above floor-level cabinets, so their plan
          footprint legitimately overlaps a base/tall cabinet at the same wall
          position — that's correct (real cabinetry works that way), but
          drawing both as identical solid boxes made whichever rendered last
          fully hide the other. Floor-level cabinets render first, wall
          cabinets always render last (on top) with a distinct dashed/
          translucent style — the standard "hidden line" CAD convention for
          something mounted above, not colliding at floor level. */}
      {displayItems
        .filter((item) => item.item_type !== "wall_cabinet" && item.item_type !== "obstruction")
        .map((item) => (
          <CabinetShape
            key={item.id}
            item={item}
            lay={lay}
            selected={item.id === selectedItemId}
            dragging={drag?.itemId === item.id}
            isOverlapping={Boolean(overlappingItemIds?.has(item.id))}
            onPointerDown={handleItemPointerDown}
            onPointerUp={handleItemPointerUp}
          />
        ))}
      {displayItems
        .filter((item) => item.item_type === "wall_cabinet")
        .map((item) => (
          <CabinetShape
            key={item.id}
            item={item}
            lay={lay}
            selected={item.id === selectedItemId}
            dragging={drag?.itemId === item.id}
            isOverlapping={Boolean(overlappingItemIds?.has(item.id))}
            onPointerDown={handleItemPointerDown}
            onPointerUp={handleItemPointerUp}
          />
        ))}
      {/* Obstructions render topmost — always clearly visible so they're
          impossible to accidentally place a cabinet through unnoticed. */}
      {displayItems
        .filter((item) => item.item_type === "obstruction")
        .map((item) => (
          <CabinetShape
            key={item.id}
            item={item}
            lay={lay}
            selected={item.id === selectedItemId}
            dragging={drag?.itemId === item.id}
            isOverlapping={Boolean(overlappingItemIds?.has(item.id))}
            onPointerDown={handleItemPointerDown}
            onPointerUp={handleItemPointerUp}
          />
        ))}

      {/* ---- Drag ghost line to wall ---- */}
      {drag && (() => {
        const draggingItem = displayItems.find((i) => i.id === drag.itemId);
        if (!draggingItem) return null;
        const r = cabinetSvgRect(draggingItem, lay);
        if (!r) return null;
        const cx = r.x + r.w / 2;
        const cy = r.y + r.h / 2;
        const fw = frontEdgeFor(draggingItem.wall, draggingItem.rotation);
        let lx2 = cx, ly2 = cy;
        switch (fw) {
          case "bottom": ly2 = oy + roomH; break;
          case "top":    ly2 = oy;          break;
          case "right":  lx2 = ox + roomW;  break;
          case "left":   lx2 = ox;          break;
        }
        return (
          <line x1={cx} y1={cy} x2={lx2} y2={ly2}
            stroke="rgba(255,255,255,0.15)" strokeWidth={1} strokeDasharray="3 3"
            style={{ pointerEvents: "none" }} />
        );
      })()}

      {/* ---- Gap measurements during drag ---- */}
      {drag && (() => {
        const draggingItem = displayItems.find((i) => i.id === drag.itemId);
        if (!draggingItem) return null;
        const r = cabinetSvgRect(draggingItem, lay);
        if (!r) return null;
        const currentWall = draggingItem.wall;
        const { absX: cAbsX, absY: cAbsY } = getAbsPos(draggingItem, W, D);

        const sameWallItems = items.filter((i) => i.id !== drag.itemId && i.wall === currentWall);

        if (currentWall === "top" || currentWall === "bottom") {
          const gapObs = sameWallItems.map((o) => ({
            x_mm:     getAbsPos(o, W, D).absX,
            width_mm: o.width_mm || 600,
          }));
          const { leftGap, rightGap, leftBoundMm, rightBoundMm } = computeGaps1D(cAbsX, drag.itemWidthMm, gapObs, W);
          const midY = r.y + r.h / 2;
          return (
            <>
              <GapDimension x1={ox + leftBoundMm * scale}  y1={midY} x2={r.x}       y2={midY} label={leftGap}  horizontal />
              <GapDimension x1={r.x + r.w}                 y1={midY} x2={ox + rightBoundMm * scale} y2={midY} label={rightGap} horizontal />
            </>
          );
        }

        if (currentWall === "left" || currentWall === "right") {
          const gapObs = sameWallItems.map((o) => ({
            x_mm:     getAbsPos(o, W, D).absY,
            width_mm: o.width_mm || 600,
          }));
          const { leftGap, rightGap, leftBoundMm, rightBoundMm } = computeGaps1D(cAbsY, drag.itemWidthMm, gapObs, D);
          const midX = r.x + r.w / 2;
          return (
            <>
              <GapDimension x1={midX} y1={oy + leftBoundMm * scale}  x2={midX} y2={r.y}       label={leftGap}  horizontal={false} />
              <GapDimension x1={midX} y1={r.y + r.h}                 x2={midX} y2={oy + rightBoundMm * scale} label={rightGap} horizontal={false} />
            </>
          );
        }

        if (currentWall === "island") {
          const midX = r.x + r.w / 2;
          const midY = r.y + r.h / 2;
          return (
            <>
              <GapDimension x1={ox}           y1={midY} x2={r.x}       y2={midY} label={cAbsX}                horizontal />
              <GapDimension x1={r.x + r.w}    y1={midY} x2={ox + roomW} y2={midY} label={W - cAbsX - drag.itemWidthMm} horizontal />
              <GapDimension x1={midX} y1={oy}           x2={midX} y2={r.y}       label={cAbsY}                horizontal={false} />
              <GapDimension x1={midX} y1={r.y + r.h}   x2={midX} y2={oy + roomH} label={D - cAbsY - drag.itemDepthMm} horizontal={false} />
            </>
          );
        }

        return null;
      })()}

      {/* Snap guide lines — cyan dashes showing the edge being aligned to */}
      {snapGuides?.x != null && (
        <line
          x1={ox + snapGuides.x * scale} y1={oy}
          x2={ox + snapGuides.x * scale} y2={oy + roomH}
          stroke="rgba(0,230,230,0.75)" strokeWidth={1} strokeDasharray="4 2"
          style={{ pointerEvents: "none" }}
        />
      )}
      {snapGuides?.y != null && (
        <line
          x1={ox} y1={oy + snapGuides.y * scale}
          x2={ox + roomW} y2={oy + snapGuides.y * scale}
          stroke="rgba(0,230,230,0.75)" strokeWidth={1} strokeDasharray="4 2"
          style={{ pointerEvents: "none" }}
        />
      )}
    </svg>
  );
}
