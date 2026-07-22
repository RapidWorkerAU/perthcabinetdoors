"use client";

import { useCallback, useRef, useState } from "react";
import styles from "../design.module.css";
import { islandVirtualWall } from "../../../../lib/pcd-kickboard-utils";
import { resolveColourSrc } from "../../../../lib/pcd-colour-images";
import { endPanelSpanMm, finishPanelThicknessMm } from "../../../../lib/pcd-finishpanel-utils";
import { benchtopDepthMm, benchtopCutouts, benchtopWaterfallSides, benchtopThicknessMm } from "../../../../lib/pcd-benchtop-utils";
import { bayTypeForRow } from "../../../../lib/pcd-door-utils";
// The room-space maths lives in lib/pcd-plan-geometry.js. This file keeps only
// what's genuinely about drawing: SVG rects, polygons, scale.
import {
  itemDepthMm,
  getAbsPos,
  findOverlappingItemIds,
  widthRunsVertically,
  snap,
  clamp,
  withCornerWallDetection,
  snapToWall,
  resolveCollision1D,
  resolveCollision2D,
  findEdgeSnap,
  occupiedFootprint,
  islandOccupiedRect,
  perpendicularGaps,
  cornerSecondaryFootprint,
  cabinetVerticalRange,
  verticalRangesOverlap,
  computeGaps1D,
  frontEdgeFor,
  panelSideEdges,
  islandEffectiveDims,
} from "../../../../lib/pcd-plan-geometry";

// Re-exported because DesignRightPanel imports them from here. The definitions
// moved to the lib; the import path stays put.
export { itemDepthMm, getAbsPos, findOverlappingItemIds };

const VIEW_W = 1100;
const VIEW_H = 720;
const BAND    = 52;
const MARGIN  = 24;

const ITEM_COLORS = {
  base_cabinet:  "#3b82f6",
  wall_cabinet:  "#22c55e",
  tall_cabinet:  "#f97316",
  corner_base_cabinet: "#0ea5e9",
  blind_corner_cabinet: "#06b6d4",
  floating_shelf: "#14b8a6",
  door:          "#a855f7",
  drawer_front:  "#8b5cf6",
  panel:         "#6b7280",
  scribe:        "#ec4899",
  obstruction:   "#57534e",
};

const ITEM_SHORT = {
  base_cabinet:  "Base",
  wall_cabinet:  "Wall",
  tall_cabinet:  "Tall",
  corner_base_cabinet: "Corner",
  blind_corner_cabinet: "Blind",
  floating_shelf: "Shelf",
  door:          "Door",
  drawer_front:  "Drwr",
  panel:         "Panel",
  scribe:        "Scribe",
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

// A strip sitting immediately OUTSIDE `rect` along `edge` — where an applied
// end panel physically is, and drawn at its real scaled thickness so the
// board fills the gap the snapping now leaves between two cabinets instead
// of reading as a mystery void. edgeStripRect()'s inside-the-box strips are
// still right for the back-panel marker, which isn't modelled dimensionally.
function outerEdgeStripRect(rect, edge, t) {
  const { x, y, w, h } = rect;
  switch (edge) {
    case "top":    return { x,            y: y - t,  w,    h: t };
    case "bottom": return { x,            y: y + h,  w,    h: t };
    case "left":   return { x: x - t,     y,         w: t, h };
    case "right":  return { x: x + w,     y,         w: t, h };
    default:       return null;
  }
}

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

// The dead zone of a blind corner, as a sub-rect of its plan rect.
//
// blind_side is stated in VIEWER terms (the end you'd see on your left
// standing in front of the cabinet), so it goes through the same axisFlipped
// mapping end panels use — on the bottom and left walls the viewer's left is
// the HIGH room coordinate. Returns null for anything that isn't a blind
// corner with a blind width set.
function blindZoneRect(item, rect, lay) {
  if (item.item_type !== "blind_corner_cabinet") return null;
  const blindMm = Math.max(0, Number(item.blind_width_mm) || 0);
  if (!blindMm) return null;
  const { leftEdge, rightEdge } = panelSideEdges(item);
  const edge = (item.blind_side || "left") === "right" ? rightEdge : leftEdge;
  const { x, y, w, h } = rect;
  switch (edge) {
    case "left":   { const t = Math.min(blindMm * lay.scale, w); return { x, y, w: t, h }; }
    case "right":  { const t = Math.min(blindMm * lay.scale, w); return { x: x + w - t, y, w: t, h }; }
    case "top":    { const t = Math.min(blindMm * lay.scale, h); return { x, y, w, h: t }; }
    case "bottom": { const t = Math.min(blindMm * lay.scale, h); return { x, y: y + h - t, w, h: t }; }
    default: return null;
  }
}

// The benchtop, in plan: its front edge, and any cutouts.
//
// Only the front EDGE is drawn, not a filled box — partly so the cabinet
// underneath stays readable, and partly because adjacent cabinets' edges then
// join into one continuous line with no seam at each join. That means no run
// detection is needed here at all: each cabinet draws its own stretch and they
// simply meet.
//
// The edge sits benchtopDepthMm from the cabinet's BACK, which is what puts
// the overhang visibly proud of the doors — the one thing you want to see in
// plan and the reason the overhang field exists.
function benchtopPlanGeometry(item, rect, lay) {
  if (!item.has_benchtop) return null;
  const depthPx = benchtopDepthMm(item) * lay.scale;
  const { x, y, w, h } = rect;
  const front = frontEdgeFor(item.wall, item.rotation);

  // The edge line, plus the axis the cutouts are laid out along.
  switch (front) {
    case "bottom": return { line: { x1: x, y1: y + depthPx, x2: x + w, y2: y + depthPx }, horizontal: true, backAt: y, sign: 1 };
    case "top":    return { line: { x1: x, y1: y + h - depthPx, x2: x + w, y2: y + h - depthPx }, horizontal: true, backAt: y + h, sign: -1 };
    case "right":  return { line: { x1: x + depthPx, y1: y, x2: x + depthPx, y2: y + h }, horizontal: false, backAt: x, sign: 1 };
    case "left":   return { line: { x1: x + w - depthPx, y1: y, x2: x + w - depthPx, y2: y + h }, horizontal: false, backAt: x + w, sign: -1 };
    default:       return null;
  }
}

function CabinetShape({ item, lay, selected, dragging, isOverlapping, onPointerDown, onPointerUp, colourFill, lineOnly, printMode }) {
  const rect = cabinetSvgRect(item, lay);
  if (!rect) return null;

  const { x, y, w, h } = rect;
  // When "show colours" is on, paint the footprint with the carcass tile
  // pattern; otherwise the flat per-type colour. In line-only (schematic) mode
  // the body is unfilled so just the outline reads. Everything else (labels,
  // front strip) draws on top regardless.
  const fill      = lineOnly ? "none" : (colourFill || item.colour_hex || ITEM_COLORS[item.item_type] || "#888");
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
  const isWallCab = item.item_type === "wall_cabinet" || item.item_type === "floating_shelf";
  // Obstruction: a non-manufactured spatial blocker (nib wall, full wall,
  // brick recess) — solid + hazard-hatched so it reads as "structure", not
  // a cabinet, and never gets a front-face strip since it has no front.
  const isObstruction = item.item_type === "obstruction";

  const label      = item.label || ITEM_SHORT[item.item_type] || "?";
  const shortLabel = label.length > 12 ? label.slice(0, 11) + "…" : label;
  const itemDepth  = itemDepthMm(item);
  const dimText    = item.width_mm ? `${item.width_mm}w` + (itemDepth ? ` × ${itemDepth}d` : "") : "";
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
          stroke={selected ? "#fff" : (printMode ? "#1f2937" : "rgba(255,255,255,0.35)")}
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
          stroke={selected ? "#fff" : (printMode ? "#1f2937" : "rgba(255,255,255,0.35)")}
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
      {/* Free/appliance bays — invisible in a top-down plan, so flag them with
          a small badge listing the appliance(s) allocated in this tall unit. */}
      {item.item_type === "tall_cabinet" && Array.isArray(item.door_config?.bays) && w > 30 && h > 20 && (() => {
        const rows = Math.max(1, item.door_config.rows || 1);
        const LABELS = { oven: "OVEN", microwave: "MW", cooktop: "HOB" };
        const tags = [];
        for (let r = 0; r < rows; r++) {
          const t = bayTypeForRow(item.door_config, r);
          if (t === "appliance") tags.push(LABELS[item.door_config.bays[r]?.appliance] || "OVEN");
          else if (t === "open") tags.push("OPEN");
        }
        if (!tags.length) return null;
        const text = tags.join(" · ");
        const bw = Math.min(w - 6, Math.max(20, text.length * 5.4 + 8));
        return (
          <g style={{ pointerEvents: "none" }}>
            <rect x={cx - bw / 2} y={cy + fontSize / 2 + 2} width={bw} height={11}
              rx={2} fill="rgba(15,23,42,0.72)" />
            <text x={cx} y={cy + fontSize / 2 + 8} textAnchor="middle" dominantBaseline="middle"
              fontSize={7.5} fill="#fef3c7" letterSpacing={0.3} fontWeight={700}>
              {text}
            </text>
          </g>
        );
      })()}
      {/* Benchtop — drawn, never quoted. The front edge shows where the top
          lands relative to the doors; the cutouts tell the fabricator where
          the holes go. */}
      {(() => {
        const bt = benchtopPlanGeometry(item, rect, lay);
        if (!bt) return null;
        const { x1, y1, x2, y2 } = bt.line;
        const cutouts = benchtopCutouts(item);
        // Centred on the cabinet — see benchtopCutouts. Laid out along the
        // cabinet's own along-wall axis, and inset from the back by the same
        // margin they'd sit at on a real top.
        const midAlong = bt.horizontal ? (x1 + x2) / 2 : (y1 + y2) / 2;
        // Waterfall ends — a solid bold line down the end edge (back to front)
        // marks where the top drops to the floor. Uses this cabinet's own
        // left/right flags (each cabinet draws its own stretch in plan).
        const wf = benchtopWaterfallSides(item, item.wall === "island" ? islandVirtualWall(item) : item.wall);
        const wfT = benchtopThicknessMm(item) * lay.scale; // overhang the top sits proud by
        const wfLines = [];
        if (bt.horizontal) {
          // low = smaller x (x1), high = larger x (x2); the drop sits just past the end.
          if (wf.low)  wfLines.push({ x1: x1 - wfT, y1: bt.backAt, x2: x1 - wfT, y2: y1 });
          if (wf.high) wfLines.push({ x1: x2 + wfT, y1: bt.backAt, x2: x2 + wfT, y2 });
        } else {
          if (wf.low)  wfLines.push({ x1: bt.backAt, y1: y1 - wfT, x2: x1, y2: y1 - wfT });
          if (wf.high) wfLines.push({ x1: bt.backAt, y1: y2 + wfT, x2: x2, y2: y2 + wfT });
        }
        return (
          <g style={{ pointerEvents: "none" }}>
            <line x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="rgba(68,64,60,0.75)" strokeWidth={1.2} strokeDasharray="6 3" />
            {wfLines.map((l, i) => (
              <line key={`wf-${i}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
                stroke="#78716c" strokeWidth={2.6} strokeLinecap="round" />
            ))}
            {cutouts.map((cut, i) => {
              const alongPx = cut.width_mm * lay.scale;
              const acrossPx = cut.depth_mm * lay.scale;
              // Sat roughly centred in the top's depth, which is where a sink
              // or cooktop actually lands.
              const acrossStart = bt.backAt + bt.sign * ((benchtopDepthMm(item) * lay.scale - acrossPx) / 2);
              const r = bt.horizontal
                ? { x: midAlong - alongPx / 2, y: Math.min(acrossStart, acrossStart + bt.sign * acrossPx), w: alongPx, h: acrossPx }
                : { x: Math.min(acrossStart, acrossStart + bt.sign * acrossPx), y: midAlong - alongPx / 2, w: acrossPx, h: alongPx };
              return (
                <rect key={i} x={r.x} y={r.y} width={Math.max(r.w, 1)} height={Math.max(r.h, 1)}
                  fill="none" stroke={cut.type === "cooktop" ? "#dc2626" : "#0ea5e9"}
                  strokeWidth={1.2} strokeDasharray="3 2" rx={2} />
              );
            })}
          </g>
        );
      })()}
      {/* Blind corner dead zone — the part the return cabinet covers, which
          no door opens onto. Hatched over the front strip so it reads as
          unreachable rather than as openable frontage. */}
      {(() => {
        const bz = blindZoneRect(item, rect, lay);
        if (!bz) return null;
        return (
          <rect
            x={bz.x} y={bz.y} width={bz.w} height={bz.h}
            fill="url(#obstructionHatch)"
            stroke="rgba(255,255,255,0.28)"
            strokeWidth={1}
            style={{ pointerEvents: "none" }}
          />
        );
      })()}
      {/* End panels — drawn OUTSIDE the carcass at true scaled thickness,
          because that's where an applied finished end actually sits and the
          space is now reserved for it in the collision/snap geometry (see
          endPanelSpanMm). Floored at 1.5px so the board stays visible when
          the room is zoomed out far enough for 16mm to vanish. */}
      {!isCorner && (item.end_panel_left || item.end_panel_right) && (() => {
        const { leftEdge, rightEdge } = panelSideEdges(item);
        const t = Math.max(finishPanelThicknessMm(item) * lay.scale, 1.5);
        const edges = [];
        if (item.end_panel_left)  edges.push({ edge: leftEdge,  key: "left" });
        if (item.end_panel_right) edges.push({ edge: rightEdge, key: "right" });
        return edges.map(({ edge, key }) => {
          const s = outerEdgeStripRect(rect, edge, t);
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
      {/* Back panel marker — still an inside-the-box strip: unlike an end
          panel it isn't modelled as extra depth, so drawing it outside would
          claim space the collision geometry doesn't reserve. */}
      {!isCorner && item.has_back_panel && (() => {
        const { backEdge } = panelSideEdges(item);
        const s = edgeStripRect(rect, backEdge);
        if (!s) return null;
        return (
          <rect
            x={s.x} y={s.y} width={s.w} height={s.h}
            fill="#a855f7" fillOpacity={0.9}
            style={{ pointerEvents: "none" }}
          />
        );
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
          fontSize={fontSize} fontWeight="700" fill={printMode ? "#1f2937" : "#fff"}
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          {shortLabel}
        </text>
      )}
      {showDims && (
        <text
          x={cx} y={cy + 7}
          textAnchor="middle" dominantBaseline="middle"
          fontSize={7} fill={printMode ? "#6b7280" : "rgba(255,255,255,0.65)"}
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
  colourImages,
  showColours = false,
  lineOnly = false,
  printMode = false,
  // Mobile renders the canvas read-only: tapping a cabinet still selects it,
  // but dragging-to-position and the in-canvas elevation buttons are disabled
  // (mobile has its own elevation toggle and one cabinet per room, so there's
  // nothing to position). Defaults preserve the full desktop behaviour.
  interactive = true,
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
    // Read-only (mobile): select on tap, but never begin a drag.
    if (!interactive) { onItemClick(item); return; }
    const pt = toSvgPt(e.clientX, e.clientY);
    itemPressedRef.current = true;
    const { absX, absY } = getAbsPos(item, W, D);
    const { ew, ed } = islandEffectiveDims(item);
    setDrag({
      itemId:      item.id,
      wall:        item.wall,   // starting wall — used for orientation during drag
      // Scribes never get auto-assigned a wall by drag proximity — they're
      // always freeform (positioned relative to whichever cabinet they're
      // filling against, not a room wall), so nearest-wall detection kept
      // guessing wrong for one sitting in a corner. Rotation (via the
      // right panel's Rotation control, always shown once wall is
      // "island") is what determines which wall a scribe conceptually
      // supports, same mechanism as a rotated island cabinet.
      isFreeform:  item.item_type === "scribe",
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

      // Detect target wall and get clamped snap position — freeform items
      // (scribe) skip nearest-wall detection entirely and always stay
      // "island", so proximity to a room wall/corner never reassigns them.
      const snapped = drag.isFreeform
        ? { wall: "island", x_mm: clamp(rawAbsX, 0, W - drag.itemWidthMm), y_mm: clamp(rawAbsY, 0, D - drag.itemDepthMm) }
        : snapToWall(rawAbsX, rawAbsY, drag.itemWidthMm, drag.itemDepthMm, drag.wall, W, D);
      const { wall: newWall } = snapped;
      let { x_mm: newX, y_mm: newY } = snapped;

      // Vertical range for height-aware collision (wall cabs above base cabs = no collision)
      const draggingItem   = items.find((i) => i.id === drag.itemId);
      const draggingVRange = draggingItem ? cabinetVerticalRange(draggingItem) : [0, 720];

      // The dragged item's own applied end panels, measured against the
      // TARGET wall — dropping onto the bottom/left wall mirrors the
      // along-wall axis, so which physical end lands on the low coordinate
      // flips mid-drag. x_mm/y_mm keep meaning the CARCASS edge (that's what
      // gets saved, and what width_mm is measured from), so the snap and
      // collision maths below runs in panel-inclusive "span" space and
      // converts back before the position is stored.
      const dragWall  = newWall === "island" ? islandVirtualWall(draggingItem || {}) : newWall;
      const { lowT: dragLowT, highT: dragHighT } = endPanelSpanMm(draggingItem, dragWall);
      const dragPanelSpan = dragLowT + dragHighT;

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
          const fp = occupiedFootprint(other, W, D);
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

      // Same-wall items as 1D obstacles (position + length along the wall
      // axis), taken from each one's occupied footprint so a neighbour's own
      // end panels claim their space too — snapping to a bare width_mm is
      // what let a cabinet land on top of the board next door.
      const sameWallObs = sameWall.flatMap((o) => {
        const fp = occupiedFootprint(o, W, D);
        if (!fp) return [];
        return (newWall === "left" || newWall === "right")
          ? [{ x_mm: fp.y, width_mm: fp.h }]
          : [{ x_mm: fp.x, width_mm: fp.w }];
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
        //
        // The 10mm grid applies ONLY to a free position, and only BEFORE
        // snapping. findEdgeSnap() and resolveCollision1D() both return
        // exact flush coordinates — a neighbour's edge, or the outer face of
        // its end panel — and re-rounding those to the grid afterwards is
        // what shoved an exactly-flush cabinet back INTO its neighbour
        // whenever the flush coordinate wasn't a multiple of 10. A run of
        // real cabinet widths (806 + 994 …) lands off-grid constantly, and
        // the resulting few-mm overlap is far too small to see at plan zoom.
        const spanX = newX - dragLowT;
        const edgeSnap = findEdgeSnap(spanX, drag.itemWidthMm + dragPanelSpan, others.map((o) => ({ pos: o.x_mm, len: o.width_mm })));
        setSnapGuides(edgeSnap ? { x: edgeSnap.guide } : null);
        const desiredX = edgeSnap ? edgeSnap.newPos : snap(spanX);
        newX = resolveCollision1D(desiredX, drag.itemWidthMm + dragPanelSpan, others, W) + dragLowT;
      } else if (newWall === "left" || newWall === "right") {
        const spanY = newY - dragLowT;
        const edgeSnap = findEdgeSnap(spanY, drag.itemWidthMm + dragPanelSpan, others.map((o) => ({ pos: o.x_mm, len: o.width_mm })));
        setSnapGuides(edgeSnap ? { y: edgeSnap.guide } : null);
        const desiredY = edgeSnap ? edgeSnap.newPos : snap(spanY);
        newY = resolveCollision1D(desiredY, drag.itemWidthMm + dragPanelSpan, others, D) + dragLowT;
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
            const r = islandOccupiedRect(i);
            return { x_mm: r.x, y_mm: r.y, width_mm: r.w, depth_mm: r.h };
          });
        const wallCabObs = items
          .filter((i) =>
            i.id !== drag.itemId &&
            ["top", "bottom", "left", "right"].includes(i.wall) &&
            verticalRangesOverlap(draggingVRange, cabinetVerticalRange(i))
          )
          .flatMap((other) => {
            const fps = [occupiedFootprint(other, W, D), cornerSecondaryFootprint(other, W, D)].filter(Boolean);
            return fps.map((fp) => ({ x_mm: fp.x, y_mm: fp.y, width_mm: fp.w, depth_mm: fp.h }));
          });
        const islandAndWallObs = [...islandObs, ...wallCabObs];

        // An island's end panels extend along whichever axis its width runs
        // (rotation-aware, matching islandEffectiveDims), so only that axis
        // grows and only that axis needs shifting back to the carcass edge.
        const vert     = widthRunsVertically(draggingItem || {}, dragWall);
        const spanW    = drag.itemWidthMm + (vert ? 0 : dragPanelSpan);
        const spanH    = drag.itemDepthMm + (vert ? dragPanelSpan : 0);
        const offX     = vert ? 0 : dragLowT;
        const offY     = vert ? dragLowT : 0;

        const edgeSnapX = findEdgeSnap(rawAbsX - offX, spanW, islandAndWallObs.map((o) => ({ pos: o.x_mm, len: o.width_mm })));
        const edgeSnapY = findEdgeSnap(rawAbsY - offY, spanH, islandAndWallObs.map((o) => ({ pos: o.y_mm, len: o.depth_mm })));
        setSnapGuides((edgeSnapX || edgeSnapY)
          ? { ...(edgeSnapX ? { x: edgeSnapX.guide } : {}), ...(edgeSnapY ? { y: edgeSnapY.guide } : {}) }
          : null);
        // Same rule as the wall branches: grid-quantize only a free position,
        // never a snapped or collision-resolved one (both are exact).
        const snappedX = edgeSnapX ? edgeSnapX.newPos : snap(rawAbsX - offX);
        const snappedY = edgeSnapY ? edgeSnapY.newPos : snap(rawAbsY - offY);

        const resolved = resolveCollision2D(snappedX, snappedY, spanW, spanH, islandAndWallObs, W, D);
        newX = resolved.x + offX;
        newY = resolved.y + offY;
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

  // "Show colours": one SVG <pattern> per unique carcass tile among the items,
  // referenced by the footprints. Built here so <defs> and the shapes share
  // stable ids. Empty (and inert) when the toggle is off or nothing resolves.
  const srcToPattern = new Map();
  const tilePatterns = [];
  if (showColours && colourImages) {
    for (const item of displayItems) {
      const src = resolveColourSrc(colourImages, item, "carcass");
      if (src && !srcToPattern.has(src)) {
        const id = `ctile-${srcToPattern.size}`;
        srcToPattern.set(src, id);
        tilePatterns.push({ id, src });
      }
    }
  }
  const colourFillFor = (item) => {
    if (!showColours || !colourImages) return null;
    const id = srcToPattern.get(resolveColourSrc(colourImages, item, "carcass"));
    return id ? `url(#${id})` : null;
  };

  // Export ("print") theme: the on-screen plan is on a dark floor, but the PDF
  // is a white page, so the floor, grid and dimensions flip to ink-on-white.
  const pFloor       = printMode ? "#ffffff" : "#1e2940";
  const pFloorStroke = printMode ? "#1f2937" : "rgba(255,255,255,0.18)";
  const pFaint       = printMode ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.04)";
  const pDimLine     = printMode ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.2)";
  const pDimText     = printMode ? "#374151" : "rgba(255,255,255,0.45)";

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
        {/* One colour-library tile per unique carcass finish, stretched to fill
            each footprint it's referenced from (bounding-box units). */}
        {tilePatterns.map((p) => (
          <pattern key={p.id} id={p.id} patternUnits="objectBoundingBox" patternContentUnits="objectBoundingBox" width={1} height={1}>
            <image href={p.src} x={0} y={0} width={1} height={1} preserveAspectRatio="xMidYMid slice" />
          </pattern>
        ))}
      </defs>

      {/* ---- Room floor ---- */}
      <rect
        x={ox} y={oy} width={roomW} height={roomH}
        fill={pFloor}
        stroke={pFloorStroke}
        strokeWidth={1.5}
        onClick={onDeselect}
        style={{ cursor: "default" }}
      />

      {/* Floor grid — 600mm */}
      {Array.from({ length: Math.ceil((room.width_mm || 4000) / 600) }).map((_, i) => (
        <line key={`gx-${i}`}
          x1={ox + (i + 1) * 600 * scale} y1={oy}
          x2={ox + (i + 1) * 600 * scale} y2={oy + roomH}
          stroke={pFaint} strokeWidth={1}
          style={{ pointerEvents: "none" }} />
      ))}
      {Array.from({ length: Math.ceil((room.depth_mm || 3000) / 600) }).map((_, i) => (
        <line key={`gy-${i}`}
          x1={ox} y1={oy + (i + 1) * 600 * scale}
          x2={ox + roomW} y2={oy + (i + 1) * 600 * scale}
          stroke={pFaint} strokeWidth={1}
          style={{ pointerEvents: "none" }} />
      ))}

      {/* ---- Room dimension labels ---- */}
      {room.width_mm && (
        <>
          <line x1={ox} y1={oy - BAND - 10} x2={ox + roomW} y2={oy - BAND - 10} stroke={pDimLine} strokeWidth={1} style={{ pointerEvents: "none" }} />
          <line x1={ox} y1={oy - BAND - 6} x2={ox} y2={oy - BAND - 14} stroke={pDimLine} strokeWidth={1} style={{ pointerEvents: "none" }} />
          <line x1={ox + roomW} y1={oy - BAND - 6} x2={ox + roomW} y2={oy - BAND - 14} stroke={pDimLine} strokeWidth={1} style={{ pointerEvents: "none" }} />
          <text x={ox + roomW / 2} y={oy - BAND - 17} textAnchor="middle" fontSize={10} fill={pDimText} style={{ pointerEvents: "none" }}>{room.width_mm}mm</text>
          <line x1={ox} y1={oy + roomH + BAND + 10} x2={ox + roomW} y2={oy + roomH + BAND + 10} stroke={pDimLine} strokeWidth={1} style={{ pointerEvents: "none" }} />
          <line x1={ox} y1={oy + roomH + BAND + 6} x2={ox} y2={oy + roomH + BAND + 14} stroke={pDimLine} strokeWidth={1} style={{ pointerEvents: "none" }} />
          <line x1={ox + roomW} y1={oy + roomH + BAND + 6} x2={ox + roomW} y2={oy + roomH + BAND + 14} stroke={pDimLine} strokeWidth={1} style={{ pointerEvents: "none" }} />
          <text x={ox + roomW / 2} y={oy + roomH + BAND + 22} textAnchor="middle" fontSize={10} fill={pDimText} style={{ pointerEvents: "none" }}>{room.width_mm}mm</text>
        </>
      )}
      {room.depth_mm && (
        <>
          <line x1={ox - BAND - 10} y1={oy} x2={ox - BAND - 10} y2={oy + roomH} stroke={pDimLine} strokeWidth={1} style={{ pointerEvents: "none" }} />
          <line x1={ox - BAND - 6} y1={oy} x2={ox - BAND - 14} y2={oy} stroke={pDimLine} strokeWidth={1} style={{ pointerEvents: "none" }} />
          <line x1={ox - BAND - 6} y1={oy + roomH} x2={ox - BAND - 14} y2={oy + roomH} stroke={pDimLine} strokeWidth={1} style={{ pointerEvents: "none" }} />
          <text x={ox - BAND - 17} y={oy + roomH / 2} textAnchor="middle" fontSize={10} fill={pDimText} transform={`rotate(-90, ${ox - BAND - 17}, ${oy + roomH / 2})`} style={{ pointerEvents: "none" }}>{room.depth_mm}mm</text>
          <line x1={ox + roomW + BAND + 10} y1={oy} x2={ox + roomW + BAND + 10} y2={oy + roomH} stroke={pDimLine} strokeWidth={1} style={{ pointerEvents: "none" }} />
          <line x1={ox + roomW + BAND + 6} y1={oy} x2={ox + roomW + BAND + 14} y2={oy} stroke={pDimLine} strokeWidth={1} style={{ pointerEvents: "none" }} />
          <line x1={ox + roomW + BAND + 6} y1={oy + roomH} x2={ox + roomW + BAND + 14} y2={oy + roomH} stroke={pDimLine} strokeWidth={1} style={{ pointerEvents: "none" }} />
          <text x={ox + roomW + BAND + 17} y={oy + roomH / 2} textAnchor="middle" fontSize={10} fill={pDimText} transform={`rotate(90, ${ox + roomW + BAND + 17}, ${oy + roomH / 2})`} style={{ pointerEvents: "none" }}>{room.depth_mm}mm</text>
        </>
      )}

      {/* ---- Wall bands (visual reference only — no click-to-add) ---- */}
      {wallBands.map(({ wall, x, y, w, h }) => {
        const isTarget = dragWall === wall;
        return (
          <rect
            key={wall}
            x={x} y={y} width={w} height={h}
            fill={isTarget ? "rgba(99,179,237,0.12)" : "none"}
            stroke={isTarget ? "rgba(99,179,237,0.5)" : (printMode ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.08)")}
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
              fill={isTarget ? "rgba(99,179,237,0.9)" : (printMode ? "#6b7280" : "rgba(255,255,255,0.22)")}
              transform={rotate ? `rotate(${rotate}, ${x}, ${y})` : undefined}
              style={{ pointerEvents: "none", userSelect: "none", textTransform: "uppercase" }}
            >
              {wall}
            </text>
            {interactive && onFrontView && (
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
            )}
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
        .filter((item) => item.item_type !== "wall_cabinet" && item.item_type !== "floating_shelf" && item.item_type !== "obstruction")
        .map((item) => (
          <CabinetShape
            key={item.id}
            item={item}
            lay={lay}
            selected={item.id === selectedItemId}
            dragging={drag?.itemId === item.id}
            isOverlapping={Boolean(overlappingItemIds?.has(item.id))}
            colourFill={colourFillFor(item)}
            lineOnly={lineOnly}
            printMode={printMode}
            onPointerDown={handleItemPointerDown}
            onPointerUp={handleItemPointerUp}
          />
        ))}
      {displayItems
        .filter((item) => item.item_type === "wall_cabinet" || item.item_type === "floating_shelf")
        .map((item) => (
          <CabinetShape
            key={item.id}
            item={item}
            lay={lay}
            selected={item.id === selectedItemId}
            dragging={drag?.itemId === item.id}
            isOverlapping={Boolean(overlappingItemIds?.has(item.id))}
            colourFill={colourFillFor(item)}
            lineOnly={lineOnly}
            printMode={printMode}
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
            colourFill={colourFillFor(item)}
            lineOnly={lineOnly}
            printMode={printMode}
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

        // Perpendicular (depth) gaps — from the item's front face to the nearest
        // thing in front (or the far wall) and its back face to the wall behind,
        // so all four sides are measured. Taken to physical extents, so a
        // benchtop or applied panel is what the distance reaches. Null (skipped)
        // for islands, which already show gaps to all four room walls below.
        const pg = perpendicularGaps(draggingItem, items, W, D);
        const perpEls = pg ? [
          ...(pg.frontGap > 1 ? [pg.vertical
            ? <GapDimension key="pf" x1={ox + pg.alongMid * scale} y1={oy + pg.frontFace * scale} x2={ox + pg.alongMid * scale} y2={oy + pg.frontBound * scale} label={pg.frontGap} horizontal={false} />
            : <GapDimension key="pf" x1={ox + pg.frontFace * scale} y1={oy + pg.alongMid * scale} x2={ox + pg.frontBound * scale} y2={oy + pg.alongMid * scale} label={pg.frontGap} horizontal />] : []),
          ...(pg.backGap > 1 ? [pg.vertical
            ? <GapDimension key="pb" x1={ox + pg.alongMid * scale} y1={oy + pg.backFace * scale} x2={ox + pg.alongMid * scale} y2={oy + pg.backBound * scale} label={pg.backGap} horizontal={false} />
            : <GapDimension key="pb" x1={ox + pg.backFace * scale} y1={oy + pg.alongMid * scale} x2={ox + pg.backBound * scale} y2={oy + pg.alongMid * scale} label={pg.backGap} horizontal />] : []),
        ] : null;

        // Gaps are measured between OCCUPIED faces, not carcasses — with an
        // applied end panel in play those differ by the panel's thickness,
        // and measuring carcass-to-carcass would report a phantom 16-18mm
        // gap across a joint that's actually shut tight. The dimension lines
        // are drawn from the same occupied edges for the same reason, rather
        // than from the carcass rect.
        if (currentWall === "top" || currentWall === "bottom") {
          const gapObs = sameWallItems.flatMap((o) => {
            const fp = occupiedFootprint(o, W, D);
            return fp ? [{ x_mm: fp.x, width_mm: fp.w }] : [];
          });
          const fp = occupiedFootprint(draggingItem, W, D);
          const pos = fp ? fp.x : cAbsX;
          const len = fp ? fp.w : drag.itemWidthMm;
          const { leftGap, rightGap, leftBoundMm, rightBoundMm } = computeGaps1D(pos, len, gapObs, W);
          const midY = r.y + r.h / 2;
          return (
            <>
              <GapDimension x1={ox + leftBoundMm * scale}  y1={midY} x2={ox + pos * scale} y2={midY} label={leftGap}  horizontal />
              <GapDimension x1={ox + (pos + len) * scale}  y1={midY} x2={ox + rightBoundMm * scale} y2={midY} label={rightGap} horizontal />
              {perpEls}
            </>
          );
        }

        if (currentWall === "left" || currentWall === "right") {
          const gapObs = sameWallItems.flatMap((o) => {
            const fp = occupiedFootprint(o, W, D);
            return fp ? [{ x_mm: fp.y, width_mm: fp.h }] : [];
          });
          const fp = occupiedFootprint(draggingItem, W, D);
          const pos = fp ? fp.y : cAbsY;
          const len = fp ? fp.h : drag.itemWidthMm;
          const { leftGap, rightGap, leftBoundMm, rightBoundMm } = computeGaps1D(pos, len, gapObs, D);
          const midX = r.x + r.w / 2;
          return (
            <>
              <GapDimension x1={midX} y1={oy + leftBoundMm * scale}  x2={midX} y2={oy + pos * scale} label={leftGap}  horizontal={false} />
              <GapDimension x1={midX} y1={oy + (pos + len) * scale}  x2={midX} y2={oy + rightBoundMm * scale} label={rightGap} horizontal={false} />
              {perpEls}
            </>
          );
        }

        if (currentWall === "island") {
          const io   = islandOccupiedRect(draggingItem);
          const midX = r.x + r.w / 2;
          const midY = r.y + r.h / 2;
          return (
            <>
              <GapDimension x1={ox}                          y1={midY} x2={ox + io.x * scale}  y2={midY} label={io.x}                horizontal />
              <GapDimension x1={ox + (io.x + io.w) * scale}  y1={midY} x2={ox + roomW}         y2={midY} label={W - io.x - io.w}    horizontal />
              <GapDimension x1={midX} y1={oy}                          x2={midX} y2={oy + io.y * scale}  label={io.y}               horizontal={false} />
              <GapDimension x1={midX} y1={oy + (io.y + io.h) * scale}  x2={midX} y2={oy + roomH}         label={D - io.y - io.h}    horizontal={false} />
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
