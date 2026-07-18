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

import { islandVirtualWall, cabinetVerticalSpanMm } from "./pcd-kickboard-utils";
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
// How close a cabinet's back has to be to a wall before it's counted as on it.
const WALL_SNAP_MM = 400;

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

// Perpendicular (depth-direction) gaps for a wall-mounted item during a drag:
// the distance from its FRONT face to the nearest thing in front (another item
// whose along-wall range overlaps, or the far wall) and from its BACK face to
// the wall behind. Measured between physical extents, so a benchtop / applied
// panel is what the distance is taken to. Complements the existing along-wall
// (left/right) gaps to cover all four sides. Room-space mm; null for islands
// (which already get all four via their room-boundary gaps).
export function perpendicularGaps(item, allItems, roomW, roomD) {
  const wall = item?.wall;
  if (!["top", "bottom", "left", "right"].includes(wall)) return null;
  const self = physicalFootprint(item, roomW, roomD);
  if (!self) return null;

  const vertical = wall === "top" || wall === "bottom"; // depth runs along y
  const roomMax = vertical ? roomD : roomW;
  const along = (r) => (vertical ? [r.x, r.x + r.w] : [r.y, r.y + r.h]);
  const depth = (r) => (vertical ? [r.y, r.y + r.h] : [r.x, r.x + r.w]);

  const [aLo, aHi] = along(self);
  const [dLo, dHi] = depth(self);
  // Front is the room-facing edge: the high side for top/left walls, low for bottom/right.
  const frontHigh = wall === "top" || wall === "left";
  const frontFace = frontHigh ? dHi : dLo;
  const backFace  = frontHigh ? dLo : dHi;

  let frontBound = frontHigh ? roomMax : 0;
  let backBound  = frontHigh ? 0 : roomMax;

  for (const o of allItems || []) {
    if (!o || o.id === item.id || o.item_type === "obstruction") continue;
    const ofp = o.wall === "island" ? islandOccupiedRect(o) : physicalFootprint(o, roomW, roomD);
    if (!ofp) continue;
    const [oaLo, oaHi] = along(ofp);
    if (oaHi <= aLo || oaLo >= aHi) continue; // no along-wall overlap → doesn't obstruct
    const [odLo, odHi] = depth(ofp);
    if (frontHigh) {
      if (odLo >= frontFace - 0.5) frontBound = Math.min(frontBound, odLo);
      if (odHi <= backFace + 0.5)  backBound  = Math.max(backBound, odHi);
    } else {
      if (odHi <= frontFace + 0.5) frontBound = Math.max(frontBound, odHi);
      if (odLo >= backFace - 0.5)  backBound  = Math.min(backBound, odLo);
    }
  }

  return {
    vertical,
    alongMid: (aLo + aHi) / 2,
    frontFace, backFace, frontBound, backBound,
    frontGap: Math.round(Math.abs(frontBound - frontFace)),
    backGap:  Math.round(Math.abs(backBound - backFace)),
  };
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

function computeGaps1D(xMm, widthMm, others, roomMax) {
  const right = xMm + widthMm;
  const leftObs  = others.filter((o) => (o.x_mm || 0) + (o.width_mm || 0) <= xMm);
  const rightObs = others.filter((o) => (o.x_mm || 0) >= right);
  const leftBound  = leftObs.length  ? Math.max(...leftObs.map((o) => (o.x_mm || 0) + (o.width_mm || 0))) : 0;
  const rightBound = rightObs.length ? Math.min(...rightObs.map((o) => o.x_mm || 0)) : roomMax;
  return { leftGap: xMm - leftBound, rightGap: rightBound - right, leftBoundMm: leftBound, rightBoundMm: rightBound };
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
const RETURN_TYPES = new Set(["base_cabinet", "wall_cabinet", "tall_cabinet"]);
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
      return { item: it, alongMm, depthMm, bottomMm, topMm };
    })
    .filter(Boolean);
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
  computeGaps1D,
  frontEdgeFor,
  panelSideEdges,
  islandEffectiveDims,
  SNAP_MM,
  WALL_SNAP_MM,
};
