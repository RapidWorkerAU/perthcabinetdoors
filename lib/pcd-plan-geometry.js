// Room-space plan geometry for design-tool items.
//
// Extracted from DesignCanvas.js, which is a "use client" React component that
// was carrying ~430 lines of pure arithmetic with no rendering in it. That had
// two costs. It couldn't be tested without bundling a React tree — so the
// snapping and overlap maths, some of the most bug-prone code here, had no
// tests at all. And it couldn't be read from a server route, which is why
// CABINET_MOUNT_MM ended up redeclared in three other places.
//
// Everything here is a pure function of millimetres. Nothing in this file
// knows about SVG, scale, or the DOM — the view-space helpers (cabinetSvgRect,
// the corner polygons, the strip rects) stay in the component, because they
// genuinely are about drawing.
//
// mm in, mm out. If a function here needs a scale or a layout, it belongs in
// the component, not here.

import { islandVirtualWall, cabinetVerticalSpanMm, isCornerShaped, kickboardOffsetMm } from "./pcd-kickboard-utils";
import { benchtopThicknessMm } from "./pcd-benchtop-utils";
import {
  endPanelSpanMm,
  backPanelDepthMm,
  bottomPanelThicknessMm,
} from "./pcd-finishpanel-utils";
import { benchtopDepthMm } from "./pcd-benchtop-utils";

// Grid the free-drag positions land on. Snapped and collision-resolved
// positions are exact and must never be re-quantised to it — that rounding is
// what pushed flush cabinets back into their neighbours.
const SNAP_MM = 10;
// How close a cabinet has to get to a wall before it counts as on that wall.
//
// This was 400mm, most of a base cabinet's own depth: an item dropped well out
// in the room still leapt onto the nearest wall, and keeping anything
// freestanding meant dragging it almost to the middle. 100mm asks you to
// actually put the cabinet against the wall, and is still a comfortable target
// at normal plan zoom.
const WALL_SNAP_MM = 100;

// A scribe's plan-view footprint depth (how far it projects from the wall
// it's against) is its own scribe_thickness_mm — unlike every other item
// type, which stores its real footprint depth in depth_mm directly. Scribe
// keeps width_mm at its normal along-wall-span meaning, the mirror image of
// "panel" (which overloads width_mm as thickness and depth_mm as its span).
export function itemDepthMm(item) {
  return item.item_type === "scribe" ? (item.scribe_thickness_mm || 18) : (item.depth_mm || 600);
}

// --- Applied end panels ---

// Whether an item's WIDTH runs along the room's Y axis rather than X — true
// on the left/right walls, and for a freestanding item whose rotation points
// it at a left/right virtual wall (the same axis swap islandEffectiveDims()
// applies to its rendered box).
function widthRunsVertically(item, effectiveWall) {
  const wall = effectiveWall ?? (item?.wall === "island" ? islandVirtualWall(item) : item?.wall);
  return wall === "left" || wall === "right";
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
  if (!isCornerShaped(item)) return patch;
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
export function getAbsPos(item, roomW, roomD) {
  const x = item.x_mm || 0;
  const y = item.y_mm || 0;
  const d = itemDepthMm(item);
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
  const d = itemDepthMm(item);
  switch (item.wall) {
    case "top":
    case "bottom": return { x: absX, y: absY, w,   h: d };
    case "left":
    case "right":  return { x: absX, y: absY, w: d, h: w };
    default:       return null;
  }
}

// Full occupied floor footprint: carcass PLUS any applied end panels. This
// is what collision, magnetic snapping and the overlap warning all measure
// against, so "flush" means touching real outer faces rather than carcasses
// that happen to have a 16-18mm board between them.
//
// cabinetFootprint() above stays carcass-only on purpose:
// cornerSecondaryFootprint() derives the return leg from it, and corner
// cabinets never carry applied ends.
function occupiedFootprint(item, roomW, roomD) {
  const fp = cabinetFootprint(item, roomW, roomD);
  if (!fp) return null;
  const { lowT, highT } = endPanelSpanMm(item);
  if (!lowT && !highT) return fp;
  return widthRunsVertically(item)
    ? { x: fp.x, y: fp.y - lowT, w: fp.w, h: fp.h + lowT + highT }
    : { x: fp.x - lowT, y: fp.y, w: fp.w + lowT + highT, h: fp.h };
}

// Island counterpart to occupiedFootprint(). Freestanding items aren't on a
// wall, so they carry x_mm/y_mm directly and take their box from
// islandEffectiveDims() (rotation-aware) rather than getAbsPos().
//
// An island is also the one place a finished BACK panel is dimensional: its
// back faces the room, so the board projects off the back face and deepens
// the footprint. backPanelDepthMm() returns 0 for anything wall-mounted.
function islandOccupiedRect(item) {
  const { ew, ed } = islandEffectiveDims(item);
  const { lowT, highT } = endPanelSpanMm(item);
  const backT = backPanelDepthMm(item);
  const x = item.x_mm || 0;
  const y = item.y_mm || 0;
  // islandVirtualWall() names the wall the BACK faces, so a back facing
  // "top"/"left" sits on the low side of its axis and the board projects
  // further down it; "bottom"/"right" projects up it instead.
  const back = islandVirtualWall(item);
  const depthGrowsLow = back === "top" || back === "left";
  if (widthRunsVertically(item)) {
    return {
      x: depthGrowsLow ? x - backT : x,
      y: y - lowT,
      w: ew + backT,
      h: ed + lowT + highT,
    };
  }
  return {
    x: x - lowT,
    y: depthGrowsLow ? y - backT : y,
    w: ew + lowT + highT,
    h: ed + backT,
  };
}

// The benchtop's front overhang past the carcass footprint — how far the top
// projects into the room past the cabinet's own front face. A depth gap should
// measure to this, not the box front.
const BENCHTOP_FOOTPRINT_TYPES = new Set(["base_cabinet", "corner_base_cabinet", "blind_corner_cabinet"]);
function benchtopFrontOverhangMm(item) {
  if (!item?.has_benchtop || !BENCHTOP_FOOTPRINT_TYPES.has(item?.item_type)) return 0;
  return Math.max(0, benchtopDepthMm(item) - (Number(item?.depth_mm) || 0));
}

// occupiedFootprint (which already includes end panels along the wall) extended
// on the FRONT side by the benchtop overhang — the item's true physical extent
// into the room.
function physicalFootprint(item, roomW, roomD) {
  const fp = occupiedFootprint(item, roomW, roomD);
  if (!fp) return null;
  const o = benchtopFrontOverhangMm(item);
  if (!o) return fp;
  switch (item.wall) {
    case "top":    return { x: fp.x, y: fp.y, w: fp.w, h: fp.h + o };
    case "bottom": return { x: fp.x, y: fp.y - o, w: fp.w, h: fp.h + o };
    case "left":   return { x: fp.x, y: fp.y, w: fp.w + o, h: fp.h };
    case "right":  return { x: fp.x - o, y: fp.y, w: fp.w + o, h: fp.h };
    default:       return fp;
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
  if (!isCornerShaped(item) || !item.secondary_wall || item.secondary_wall === item.wall) {
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

// A kickboard genuinely lifts the carcass, so it belongs in the range this
// returns — without it a kickboarded base cabinet is treated as sitting a
// full kickboard lower than it does, and a real clash with a wall cabinet
// just above it goes unflagged. A finished underside panel hangs below the
// carcass and extends the range the other way for the same reason.
function cabinetVerticalRange(item) {
  const [bottom, top] = cabinetVerticalSpanMm(item);
  return [bottom - bottomPanelThicknessMm(item), top];
}
function verticalRangesOverlap([a0, a1], [b0, b1]) { return a0 < b1 && a1 > b0; }

/**
 * The nearest thing in each of the four room directions from one item, as
 * { bound, gap } per side: another item's face if anything is in the way, and
 * only the room wall when nothing is.
 *
 * ONE RULE FOR EVERY ITEM. The measurements used to be worked out three
 * different ways — along-wall gaps for wall items, a separate depth pass that
 * skipped obstructions outright, and freestanding items measured blindly to the
 * four room walls with no regard for anything between. So a dimension line
 * routinely read straight through a fridge recess, an island, or a cabinet on
 * another wall and reported the distance to the wall behind it.
 *
 * What blocks what:
 *   - the physical extent is used, so a benchtop overhang or an applied end
 *     panel is what the distance is taken to, not the carcass;
 *   - an item only blocks a direction if it actually overlaps on the other
 *     axis — something off to one side isn't in the way;
 *   - height is respected, so a wall cabinet doesn't block a base cabinet
 *     under it, and vice versa;
 *   - obstructions count. A fridge recess or a post is as solid as a cabinet
 *     and is exactly the thing you want the measurement to stop at;
 *   - a corner cabinet's second leg counts, since it lies along a different
 *     wall from the one the cabinet is filed under.
 */
export function nearestGaps(item, allItems, roomW, roomD, excludeId = null) {
  const self = item?.wall === "island" ? islandOccupiedRect(item) : physicalFootprint(item, roomW, roomD);
  if (!self) return null;
  const vRange = cabinetVerticalRange(item);

  let left = 0, right = roomW, up = 0, down = roomD;

  const consider = (r) => {
    if (!r) return;
    // Overlapping on y → it can stand in the way to the left or the right.
    if (r.y < self.y + self.h && r.y + r.h > self.y) {
      if (r.x + r.w <= self.x + 0.5)     left  = Math.max(left,  r.x + r.w);
      if (r.x >= self.x + self.w - 0.5)  right = Math.min(right, r.x);
    }
    // Overlapping on x → it can stand in the way above or below.
    if (r.x < self.x + self.w && r.x + r.w > self.x) {
      if (r.y + r.h <= self.y + 0.5)     up   = Math.max(up,   r.y + r.h);
      if (r.y >= self.y + self.h - 0.5)  down = Math.min(down, r.y);
    }
  };

  for (const o of allItems || []) {
    if (!o || o.id === item.id || (excludeId && o.id === excludeId)) continue;
    if (!verticalRangesOverlap(vRange, cabinetVerticalRange(o))) continue;
    consider(o.wall === "island" ? islandOccupiedRect(o) : physicalFootprint(o, roomW, roomD));
    consider(cornerSecondaryFootprint(o, roomW, roomD));
  }

  return {
    rect: self,
    left:  { bound: left,  gap: Math.round(self.x - left) },
    right: { bound: right, gap: Math.round(right - (self.x + self.w)) },
    up:    { bound: up,    gap: Math.round(self.y - up) },
    down:  { bound: down,  gap: Math.round(down - (self.y + self.h)) },
  };
}

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
      return [islandOccupiedRect(item)];
    }
    const rects = [];
    const primary = occupiedFootprint(item, W, D);
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

/**
 * Everything that blocks an item along one wall, as 1D {x_mm, width_mm} spans.
 *
 * ONE RULE, USED TWICE: by the drag, to decide where an item may land, and by
 * the on-screen measurements, to say how far it is from its neighbours. They
 * used to be worked out separately and disagreed. Measurement counted only
 * items on the SAME wall, so a dimension line would happily report 400mm of
 * clear space to the wall while collision refused to let anything into it,
 * because a freestanding fridge recess was standing there.
 *
 * What counts as blocking:
 *   same wall      its occupied footprint, end panels included
 *   other walls    only where it intrudes into the depth band this wall uses
 *   freestanding   the same test, measured from its island rect
 *   corner returns a corner cabinet's second leg lying along this wall
 *
 * Height is respected throughout, so a wall cabinet never blocks a base
 * cabinet under it.
 */
export function wallAxisObstacles(dragged, items, wall, roomW, roomD, excludeId = null) {
  if (!wall || wall === "island") return [];
  const vRange = cabinetVerticalRange(dragged);
  const depth = itemDepthMm(dragged);
  const acrossAxis = wall === "left" || wall === "right";
  const project = (fp) => (acrossAxis ? { x_mm: fp.y, width_mm: fp.h } : { x_mm: fp.x, width_mm: fp.w });

  // Does a footprint reach into the strip of floor this wall's items occupy?
  const intrudes = (fp) => {
    if (acrossAxis) {
      const x0 = wall === "left" ? 0 : roomW - depth;
      return fp.x < (wall === "left" ? depth : roomW) && fp.x + fp.w > x0;
    }
    const y0 = wall === "top" ? 0 : roomD - depth;
    return fp.y < (wall === "top" ? depth : roomD) && fp.y + fp.h > y0;
  };

  const out = [];
  for (const other of items) {
    if (excludeId && other.id === excludeId) continue;
    if (!other.wall) continue;
    if (!verticalRangesOverlap(vRange, cabinetVerticalRange(other))) continue;

    const fp = other.wall === "island" ? islandOccupiedRect(other) : occupiedFootprint(other, roomW, roomD);
    if (fp && (other.wall === wall || intrudes(fp))) out.push(project(fp));

    // A corner cabinet's return leg lies along a different wall from the one it
    // is filed under, and is just as solid.
    if (other.secondary_wall === wall && other.wall !== wall) {
      const leg = cornerSecondaryFootprint(other, roomW, roomD);
      if (leg) out.push(project(leg));
    }
  }
  return out;
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

// For a freestanding ("island") cabinet, a 90°/270° rotation swaps which
// physical dimension runs horizontally vs vertically in plan view — a
// wall-mounted cabinet's orientation is already fully determined by which
// wall it's on, so this only applies to wall === "island". Used everywhere
// an island item's footprint size matters (render, drag start, collision)
// so the rotation picker actually changes the plan-view shape, not just
// the front-facing indicator.
function islandEffectiveDims(item) {
  const w = item.width_mm || 600;
  const d = itemDepthMm(item);
  if (item.wall === "island" && (item.rotation || 0) % 180 === 90) {
    return { ew: d, ed: w };
  }
  return { ew: w, ed: d };
}

// Cabinets on a wall PERPENDICULAR to the one being viewed, that reach the
// viewed wall's corner — their depth-side "returns" into this elevation.
//
// Standing looking at wall 2, a cabinet on wall 1 that butts wall 2 at the
// corner shows you its side (depth × height). Corner cabinets already do this
// via their explicit secondary_wall; a regular base/wall/tall cabinet has no
// such field, so nothing told wall 2's elevation it was there. This finds them.
//
// Returns, for each butting cabinet: its along-wall offset (already
// axisFlipped so svg-left is the viewer's left, matching every other item in
// the elevation), the depth to draw along the wall, and the true vertical span
// (kickboard included). Pure mm — the component multiplies by scale and draws.
// Obstructions are included so a nib wall / bulkhead / recess that sits in a
// corner on one wall shows its return poking into the adjacent wall's
// elevation, exactly as a base/wall/tall cabinet does. Corner cabinets are
// handled separately, through their explicit secondary_wall.
//
// Floating shelves and shelf rails return too. They were left out originally
// on the assumption that a board is too thin to be worth drawing, but a shelf
// running into a corner is exactly the thing you need to see from the next
// wall: it is what a cabinet on that wall has to stop short of, and its end
// grain is visible in the room. Thin is the point, not a reason to hide it.
// EVERYTHING SOLID THAT CAN BUTT A CORNER belongs here. The rule is physical,
// not categorical: if it occupies floor or wall space and can reach a corner,
// the next wall's elevation has to show it, because it is what a cabinet on
// that wall must stop short of.
//
// A blind corner cabinet was the one that proved the point. It is not in
// CORNER_TYPES, so the explicit secondary_wall route ignored it, and it was not
// listed here either, so it fell through both and appeared on one elevation
// only. An appliance does the same thing: a fridge in a corner is the most
// solid object in the room and showed on neither.
//
// Windows and door openings are deliberately absent. They are holes in a wall
// rather than objects standing in the room, so they have no return to draw.
const RETURN_TYPES = new Set([
  "base_cabinet",
  "wall_cabinet",
  "tall_cabinet",
  "blind_corner_cabinet",
  "bookcase",
  "appliance",
  "obstruction",
  "panel",
  "floating_shelf",
  "shelf_rail",
]);
const CORNER_BUTT_TOL_MM = 30;

export function perpendicularCornerReturns(wall, items, room) {
  const roomW = room?.width_mm || 4000;
  const roomD = room?.depth_mm || 3000;
  const wallWidthMm = (wall === "top" || wall === "bottom") ? roomW : roomD;
  const axisFlipped = wall === "bottom" || wall === "left";
  const perpWalls = (wall === "top" || wall === "bottom") ? ["left", "right"] : ["top", "bottom"];

  return (items || [])
    .filter((it) => RETURN_TYPES.has(it.item_type) && perpWalls.includes(it.wall))
    .map((it) => {
      const fp = cabinetFootprint(it, roomW, roomD);
      if (!fp) return null;
      // Does its near end actually reach THIS wall's corner?
      let butts = false;
      if (wall === "top")         butts = fp.y <= CORNER_BUTT_TOL_MM;
      else if (wall === "bottom") butts = fp.y + fp.h >= roomD - CORNER_BUTT_TOL_MM;
      else if (wall === "left")   butts = fp.x <= CORNER_BUTT_TOL_MM;
      else if (wall === "right")  butts = fp.x + fp.w >= roomW - CORNER_BUTT_TOL_MM;
      if (!butts) return null;

      const depthMm = itemDepthMm(it);
      // Cabinets on the top/left wall sit at this wall's LOW corner; bottom/
      // right at the high corner. The standard axisFlipped transform then maps
      // that to the correct svg end, exactly as getWallPos does for real items.
      const lowCorner = it.wall === "top" || it.wall === "left";
      const rawStart = lowCorner ? 0 : Math.max(0, wallWidthMm - depthMm);
      const alongMm = axisFlipped ? wallWidthMm - rawStart - depthMm : rawStart;
      const [bottomMm, topMm] = cabinetVerticalSpanMm(it);
      // The kickboard as well as the carcass. cabinetVerticalSpanMm starts the
      // span ABOVE the kickboard, because that is where the box begins, so a
      // return drawn from it alone left a gap of bare floor underneath and made
      // a kickboarded cabinet look like it was hovering. The kickboard is real
      // and it is what the cabinet on this wall has to stop short of.
      //
      // kickboardOffsetMm returns 0 for an inset plinth, which lifts nothing,
      // so a bookcase correctly draws no strip.
      // The benchtop too. Standing on the next wall you see the end of the top
      // as well as the cabinet under it, and it is the highest thing there: a
      // cabinet on this wall has to stop short of the top's edge, not the
      // carcass below it.
      const benchMm = it.has_benchtop ? benchtopThicknessMm(it) : 0;
      return { item: it, alongMm, depthMm, bottomMm, topMm, kickMm: kickboardOffsetMm(it), benchMm };
    })
    .filter(Boolean);
}

// --- Auto-placement when adding a new item ---

// The along-wall interval [start, end] an existing item occupies on `wall`, in
// that wall's own axis (x for top/bottom, y for left/right).
function alongWallInterval(item, roomW, roomD) {
  const { absX, absY } = getAbsPos(item, roomW, roomD);
  const along = (item.wall === "left" || item.wall === "right") ? absY : absX;
  const span = Number(item.width_mm) || 600;
  return [along, along + span];
}

// Maps an along-wall position to new-format {wall, x_mm, y_mm} coordinates —
// the mirror of getAbsPos()/snapToWall()'s storage convention (top/bottom carry
// the position in x_mm; left/right in y_mm with x_mm pinned to 0).
function wallSlotCoords(wall, along, depthMm, roomW, roomD) {
  switch (wall) {
    case "top":    return { wall, x_mm: along, y_mm: 0 };
    case "bottom": return { wall, x_mm: along, y_mm: Math.max(0, roomD - depthMm) };
    case "left":   return { wall, x_mm: 0, y_mm: along };
    case "right":  return { wall, x_mm: 0, y_mm: along };
    default:       return { wall: "top", x_mm: along, y_mm: 0 };
  }
}

// Finds a free spot on `wall` for a newly added item so it doesn't land on top
// of an existing one — the "drop it into the next gap" behaviour that plan
// tools like 2020 and the IKEA planner use. Scans the wall from its start
// corner and returns the first gap wide enough for the item; if the wall is
// full it butts the item past the last one (a nudge target just off the end,
// never an overlap). Only items whose VERTICAL span overlaps the new item's
// block a slot, so a base cabinet can still be dropped under a wall cabinet.
// Returns new-format { wall, x_mm, y_mm }.
export function findFreeWallSlot(wall, newItem, items, room) {
  const roomW = room?.width_mm || 4000;
  const roomD = room?.depth_mm || 3000;
  const width = Number(newItem?.width_mm) || 600;
  const depth = itemDepthMm(newItem);
  const newVSpan = cabinetVerticalSpanMm(newItem);

  const occupied = (items || [])
    .filter((i) => i.wall === wall
      && (Number(i.width_mm) || 0) > 0
      && verticalRangesOverlap(newVSpan, cabinetVerticalSpanMm(i)))
    .map((i) => alongWallInterval(i, roomW, roomD))
    .sort((a, b) => a[0] - b[0]);

  // Walk the occupied intervals; stop at the first gap the item fits in. cursor
  // is always a non-overlapping position (a gap start, or just past the run).
  let cursor = 0;
  for (const [s, e] of occupied) {
    if (s - cursor >= width) break;
    cursor = Math.max(cursor, e);
  }
  return wallSlotCoords(wall, snap(cursor), depth, roomW, roomD);
}

// Returns {x, y, w, h} in SVG coordinates using absolute room position.
export {
  widthRunsVertically,
  snap,
  clamp,
  withCornerWallDetection,
  snapToWall,
  resolveCollision1D,
  resolveCollision2D,
  findEdgeSnap,
  cabinetFootprint,
  occupiedFootprint,
  islandOccupiedRect,
  cornerSecondaryFootprint,
  cabinetVerticalRange,
  verticalRangesOverlap,
  rectsOverlap,
  frontEdgeFor,
  panelSideEdges,
  islandEffectiveDims,
  SNAP_MM,
  WALL_SNAP_MM,
};
