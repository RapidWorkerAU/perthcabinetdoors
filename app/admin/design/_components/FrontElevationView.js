"use client";

import { useState, useRef } from "react";
import styles from "../design.module.css";
import { computeDrawerFrontHeights } from "../../../../lib/pcd-drawer-utils";
import { doorRowGapMm, drawerGapMm, frontRevealMm } from "../../../../lib/pcd-door-utils";
import { fillerPanelGapMm } from "../../../../lib/pcd-fillerpanel-utils";
import { kickboardOffsetMm, wallSpanMm, CABINET_MOUNT_MM } from "../../../../lib/pcd-kickboard-utils";
import { perpendicularCornerReturns } from "../../../../lib/pcd-plan-geometry";
import { resolveColourSrc } from "../../../../lib/pcd-colour-images";
import { computeBenchtopRun, benchtopThicknessMm, benchtopWaterfallElevationSides, benchtopRunWaterfallEnds } from "../../../../lib/pcd-benchtop-utils";
import {
  endPanelElevationSpanMm,
  finishPanelThicknessMm,
  bottomPanelThicknessMm,
} from "../../../../lib/pcd-finishpanel-utils";
import PinchZoom from "./PinchZoom";

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

// Friendly fallback label when an item has no custom label yet — avoids
// rendering the raw snake_case item_type in the elevation view.
const TYPE_LABELS = {
  base_cabinet:  "Base Cabinet",
  wall_cabinet:  "Wall Cabinet",
  tall_cabinet:  "Tall Cabinet",
  corner_base_cabinet: "Corner Base Cabinet",
  blind_corner_cabinet: "Blind Corner Cabinet",
  floating_shelf: "Floating Shelf",
  door:          "Door",
  drawer_front:  "Drawer Front",
  panel:         "Panel",
  scribe:        "Scribe",
  obstruction:   "Obstruction",
};

function itemDisplayLabel(item) {
  return item.label || TYPE_LABELS[item.item_type] || item.item_type;
}

// Re-exported, not redeclared — it now lives in pcd-kickboard-utils so the
// server routes can read the same numbers this view does. Kept exported here
// because existing importers point at this file.
export { CABINET_MOUNT_MM };

const BENCH_HEIGHT_MM = 900;
const EDGE_SNAP_MM    = 20;
const WALL_LABELS = {
  top:    "Top Wall",
  bottom: "Bottom Wall",
  left:   "Left Wall",
  right:  "Right Wall",
};
const DRAGGABLE_TYPES = new Set(["base_cabinet", "wall_cabinet", "tall_cabinet", "corner_base_cabinet", "blind_corner_cabinet", "floating_shelf", "panel", "scribe", "obstruction"]);
// Types that can be dragged up/down (mount_height_mm), not just along the wall.
const VERTICAL_DRAG_TYPES = new Set(["wall_cabinet", "floating_shelf", "obstruction", "panel", "scribe"]);

// ---- Helpers ----------------------------------------------------------------

function resolveCollision1D(desired, width, obstacles, roomMax) {
  let x = Math.max(0, Math.min(desired, roomMax - width));
  const sorted = obstacles
    .map((o) => ({ lo: o.x_mm || 0, hi: (o.x_mm || 0) + (o.width_mm || 0) }))
    .filter((o) => o.hi > o.lo)
    .sort((a, b) => a.lo - b.lo);
  for (const { lo, hi } of sorted) {
    if (x < hi && x + width > lo) {
      const pushLeft  = lo - width;
      const pushRight = hi;
      x = (pushLeft >= 0 && x + width / 2 <= (lo + hi) / 2) ? pushLeft : pushRight;
      x = Math.max(0, Math.min(x, roomMax - width));
    }
  }
  return x;
}

// Returns the wall-boundary gap (always, ignoring other cabinets) AND —
// separately — the gap to the nearest cabinet edge on each side, if one
// exists among `others` (callers pre-filter `others` to only cabinets this
// one could actually interact with, e.g. by mount-height overlap, so a
// base cabinet doesn't get a neighbor line to a wall cabinet above it).
// Keeping these independent (rather than collapsing to "whichever is
// closer") lets the caller show both lines at once.
function computeXGaps(xMm, wMm, others, roomMax) {
  let neighborLeftBound = null, neighborRightBound = null;
  for (const o of others) {
    const ox = o.x_mm || 0, ow = o.width_mm || 0;
    if (ox + ow <= xMm) neighborLeftBound = Math.max(neighborLeftBound ?? 0, ox + ow);
    if (ox >= xMm + wMm) neighborRightBound = neighborRightBound == null ? ox : Math.min(neighborRightBound, ox);
  }
  return {
    gapLeftWall:  xMm,
    gapRightWall: roomMax - (xMm + wMm),
    gapLeftNeighbor:  neighborLeftBound  != null ? xMm - neighborLeftBound : null,
    gapRightNeighbor: neighborRightBound != null ? neighborRightBound - (xMm + wMm) : null,
    leftBound:  neighborLeftBound  ?? 0,
    rightBound: neighborRightBound ?? roomMax,
  };
}

const BENCHTOP_TYPES = new Set(["base_cabinet", "corner_base_cabinet", "blind_corner_cabinet"]);
// Extra height a benchtop adds ON TOP of a cabinet, so a vertical gap measures
// to the benchtop surface (the actual next obstruction) rather than the carcass.
function benchtopTopExtraMm(item) {
  return item?.has_benchtop && BENCHTOP_TYPES.has(item?.item_type) ? benchtopThicknessMm(item) : 0;
}

function computeYGaps(mountMm, hMm, xMm, wMm, others, roomHeightMm) {
  let botBound = 0, topBound = roomHeightMm;
  for (const o of others) {
    const om = o.mount_height_mm, oh = o.height_mm || 720;
    const ox = o.x_mm || 0, ow = o.width_mm || 600;
    // only items that share x-range matter for vertical gaps
    if (ox < xMm + wMm && ox + ow > xMm) {
      if (om + oh <= mountMm) botBound = Math.max(botBound, om + oh);
      if (om >= mountMm + hMm) topBound = Math.min(topBound, om);
    }
  }
  return { gapBot: mountMm - botBound, gapTop: topBound - (mountMm + hMm), botBound, topBound };
}

// Snaps position to nearby cabinet edges within EDGE_SNAP_MM threshold.
// `others` is intentionally NOT filtered by mount-height range here — a
// wall cabinet's left/right edges should snap to a base cabinet's edges
// directly below it just as readily as to another wall cabinet, since
// that's a real, common alignment case (only the vertical/mount snap below
// is type-restricted, to items in VERTICAL_DRAG_TYPES, since not every
// item type can be moved up/down the wall).
// Evaluates every candidate edge-pair and keeps the closest within range,
// rather than the first one encountered, so the snap always favors
// whichever alignment is actually nearest the cursor.
// Returns adjusted { x_mm, mount_height_mm } plus snapX/snapY guide coordinates (null if no snap).
function applyEdgeSnap(xMm, mountMm, widthMm, heightMm, others, itemType, wallWidthMm, roomHeightMm) {
  let sx = xMm, sm = mountMm;
  let snapX = null, snapY = null;

  let bestX = null;
  for (const o of others) {
    const ox = o.x_mm || 0;
    const ow = o.width_mm || 600;
    const candidates = [
      { newX: ox + ow,           guide: ox + ow }, // this item's left edge -> obstacle's right edge
      { newX: ox - widthMm,      guide: ox },       // this item's right edge -> obstacle's left edge
      { newX: ox,                guide: ox },       // left edges aligned
      { newX: ox + ow - widthMm, guide: ox + ow },  // right edges aligned
    ];
    for (const { newX, guide } of candidates) {
      const dist = Math.abs(newX - xMm);
      if (dist <= EDGE_SNAP_MM && (!bestX || dist < bestX.dist)) bestX = { dist, newX, guide };
    }
  }
  if (bestX) { sx = bestX.newX; snapX = bestX.guide; }
  sx = Math.max(0, Math.min(sx, wallWidthMm - widthMm));

  if (VERTICAL_DRAG_TYPES.has(itemType)) {
    let bestY = null;
    for (const o of others) {
      const om = o.mount_height_mm ?? 0;
      const oh = o.height_mm || 720;
      const candidates = [
        { newM: om + oh,            guide: om + oh },
        { newM: om + oh - heightMm, guide: om + oh },
        { newM: om,                 guide: om },
        { newM: om - heightMm,      guide: om },
      ];
      for (const { newM, guide } of candidates) {
        const dist = Math.abs(newM - mountMm);
        if (dist <= EDGE_SNAP_MM && (!bestY || dist < bestY.dist)) bestY = { dist, newM, guide };
      }
    }
    if (bestY) { sm = bestY.newM; snapY = bestY.guide; }
    sm = Math.max(0, Math.min(sm, roomHeightMm - heightMm));
  }

  return { x_mm: sx, mount_height_mm: sm, snapX, snapY };
}

// ---- SVG sub-components ----------------------------------------------------

function ElevDimLine({ x1, y1, x2, y2, label, horizontal }) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const tw = String(label).length * 5.5 + 12;
  return (
    <g style={{ pointerEvents: "none" }}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.22)" strokeWidth={1} />
      {horizontal ? (
        <>
          <line x1={x1} y1={my - 5} x2={x1} y2={my + 5} stroke="rgba(255,255,255,0.22)" strokeWidth={1} />
          <line x1={x2} y1={my - 5} x2={x2} y2={my + 5} stroke="rgba(255,255,255,0.22)" strokeWidth={1} />
        </>
      ) : (
        <>
          <line x1={mx - 5} y1={y1} x2={mx + 5} y2={y1} stroke="rgba(255,255,255,0.22)" strokeWidth={1} />
          <line x1={mx - 5} y1={y2} x2={mx + 5} y2={y2} stroke="rgba(255,255,255,0.22)" strokeWidth={1} />
        </>
      )}
      <rect x={mx - tw / 2} y={my - 8} width={tw} height={14} fill="rgba(15,20,30,0.9)" rx={2} />
      <text x={mx} y={my} textAnchor="middle" dominantBaseline="middle" fontSize={10} fill="rgba(255,255,255,0.85)">
        {label}mm
      </text>
    </g>
  );
}

function GapDim({ x1, y1, x2, y2, label, horizontal, color = "#f59e0b" }) {
  if (Math.round(label) <= 0) return null;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const tw = String(Math.round(label)).length * 5.5 + 10;
  return (
    <g style={{ pointerEvents: "none" }}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={1} strokeDasharray="3 2" />
      {horizontal ? (
        <>
          <line x1={x1} y1={my - 4} x2={x1} y2={my + 4} stroke={color} strokeWidth={1} />
          <line x1={x2} y1={my - 4} x2={x2} y2={my + 4} stroke={color} strokeWidth={1} />
        </>
      ) : (
        <>
          <line x1={mx - 4} y1={y1} x2={mx + 4} y2={y1} stroke={color} strokeWidth={1} />
          <line x1={mx - 4} y1={y2} x2={mx + 4} y2={y2} stroke={color} strokeWidth={1} />
        </>
      )}
      <rect x={mx - tw / 2} y={my - 7} width={tw} height={13} fill="rgba(0,0,0,0.8)" rx={2} />
      <text x={mx} y={my} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill={color}>
        {Math.round(label)}
      </text>
    </g>
  );
}

// Which real wall a freestanding ("island") cabinet's BACK faces — used as
// its default elevation wall so it still shows up in a front-view even
// though it isn't physically against any wall. Mirrors frontEdgeFor()'s
// rotation convention in DesignCanvas.js (front edge bottom/left/top/right
// for rotation 0/90/180/270), just inverted to name the opposite wall.
// Corner cabinets manage their own wall/secondary_wall pair and are
// excluded — this is only for plain (non-corner) freestanding cabinets.
function islandVirtualWall(itemData) {
  const rotation = itemData.rotation || 0;
  return ["top", "right", "bottom", "left"][(rotation / 90) % 4];
}

function isIslandVirtualView(itemData) {
  return itemData.wall === "island" && itemData.item_type !== "corner_base_cabinet";
}

// Door-swing visualization for a door-type bank — a dotted V-triangle
// pointing to the opening edge per door, plus red X marks at hinge
// drilling positions. Used both for a plain "doors" cabinet (rows stacked
// by the caller) and for a door-type section of a "mixed" front (always
// exactly one row — a mixed front's "rows" are just further sections).
function DoorBankSwing({ x, y, w, h, cfg, fill, scale }) {
  const cols = Math.max(1, cfg.columns || 1);
  const hinges = cfg.hinges || Array(cols).fill("L");
  const hingePosArr = cfg.hinge_positions_mm || [];
  const rawRat = cfg.width_ratios || Array(cols).fill(1 / cols);
  const totalR = rawRat.reduce((s, r) => s + r, 0) || 1;

  const parts = [];
  let xOff = 0;
  for (let c = 0; c < cols; c++) {
    const ratio = rawRat[c] / totalR;
    const dW = w * ratio;
    const dX = x + xOff;
    const hingePositions = Array.isArray(hingePosArr[c]) ? hingePosArr[c] : [];
    parts.push({ dX, dW, hinge: hinges[c] || "L", hingePositions, key: `d${c}` });
    xOff += dW;
  }

  return (
    <g style={{ pointerEvents: "none" }}>
      {parts.map(({ dX, dW, hinge, hingePositions, key }) => {
        const midY = y + h / 2;
        const tipX  = hinge === "L" ? dX + dW : dX;
        const baseX = hinge === "L" ? dX       : dX + dW;
        const markSize = 4;
        return (
          <g key={key}>
            <rect x={dX} y={y} width={dW} height={h}
              fill="none" stroke={fill} strokeWidth={0.6} strokeOpacity={0.35} />
            <line x1={baseX} y1={y}     x2={tipX} y2={midY}
              stroke={fill} strokeWidth={0.8} strokeDasharray="3 2" strokeOpacity={0.55} />
            <line x1={baseX} y1={y + h} x2={tipX} y2={midY}
              stroke={fill} strokeWidth={0.8} strokeDasharray="3 2" strokeOpacity={0.55} />
            {hingePositions.map((posMm, hIdx) => {
              const rawY = (y + h) - Number(posMm || 0) * scale;
              const hy = Math.max(y, Math.min(y + h, rawY));
              const inset = Math.min(dW / 3, 9);
              const markX = hinge === "L" ? baseX + inset : baseX - inset;
              return (
                <g key={`hinge-${key}-${hIdx}`}>
                  <line x1={markX - markSize} y1={hy - markSize} x2={markX + markSize} y2={hy + markSize}
                    stroke="#ef4444" strokeWidth={1.4} strokeOpacity={0.95} />
                  <line x1={markX - markSize} y1={hy + markSize} x2={markX + markSize} y2={hy - markSize}
                    stroke="#ef4444" strokeWidth={1.4} strokeOpacity={0.95} />
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

// Drawer-bank visualization — a stack of drawer front outlines with a small
// pull indicator, and (if a finger-pull gap is configured) a hatched
// negative-detail reveal above each front. No swing/hinge visuals — drawers
// don't hinge. Used both for a plain "drawers" cabinet and for a
// drawer-type section of a "mixed" front.
// A hatched negative-detail reveal — a finger-pull gap zone, shared by the
// drawer bank and the door row-gap rendering. Diagonal hatch is clamped to
// the zone's own bounds (both axes) so it never spills outside — a tick
// that would run past the left/right edge is trimmed, with its Y endpoint
// adjusted to match so the line's slope stays consistent.
function GapHatchZone({ x, y, w, h, fill }) {
  if (h <= 0) return null;
  const step = 6;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="rgba(139,92,246,0.10)" />
      {Array.from({ length: Math.max(1, Math.ceil((w + h) / step)) }).map((_, hi) => {
        const tx = x - h + hi * step;
        const x1 = Math.max(x, tx);
        const x2 = Math.min(x + w, tx + h);
        if (x2 <= x1) return null;
        const y1 = y + h - (x1 - tx);
        const y2 = y + h - (x2 - tx);
        return (
          <line key={hi} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={fill} strokeWidth={0.5} strokeOpacity={0.4} />
        );
      })}
    </g>
  );
}

// Renders one door "row" (a full row on a plain door cabinet, or a whole
// door-type section of a "mixed" front — a section is always exactly one
// row) with its own optional finger-pull gap. Position is automatic, not a
// cabinet-wide choice: at or under bench height the grip sits at the top
// (looking down at it, same as a base cabinet); above bench height it sits
// at the bottom instead, so you're never reaching above a door near the
// top of a tall cabinet to find the grip.
function DoorRowWithGap({ x, y, w, h, cfg, fill, scale, floor }) {
  const gapPx = doorRowGapMm(cfg) * scale;
  const midY = y + h / 2;
  const distFromFloorMm = (floor - midY) / scale;
  const atTop = distFromFloorMm <= BENCH_HEIGHT_MM;
  const frontH = Math.max(0, h - gapPx);
  const frontY = atTop ? y + gapPx : y;
  const gapY = atTop ? y : y + frontH;
  return (
    <>
      <DoorBankSwing x={x} y={frontY} w={w} h={frontH} cfg={cfg} fill={fill} scale={scale} />
      {gapPx > 0 && <GapHatchZone x={x} y={gapY} w={w} h={gapPx} fill={fill} />}
    </>
  );
}

function DrawerBank({ x, y, w, h, cfg, fill }) {
  const rawHeights = Array.isArray(cfg.heights_mm) && cfg.heights_mm.length ? cfg.heights_mm : [1];
  const totalMm = rawHeights.reduce((s, v) => s + (Number(v) || 0), 0) || 1;
  const pxPerMm = h / totalMm;
  const gapMm = drawerGapMm(cfg);
  const frontHeightsMm = computeDrawerFrontHeights(rawHeights, gapMm > 0, gapMm, frontRevealMm(cfg));

  // Every drawer's gap sits above its own front (recessed into the top of
  // its own opening slot) — including the top drawer, whose gap recesses
  // below the cabinet's own top edge rather than a neighbour's front.
  let cursorMm = 0;
  const bands = rawHeights.map((openMm, i) => {
    const gapTopMm = cursorMm;
    const frontTopMm = cursorMm + gapMm;
    cursorMm += Number(openMm) || 0;
    return { gapTopMm, frontTopMm, heightMm: Math.max(0, frontHeightsMm[i]) };
  });

  return (
    <g style={{ pointerEvents: "none" }}>
      {bands.map(({ frontTopMm, heightMm: fh }, i) => {
        const by = y + frontTopMm * pxPerMm;
        const bh = Math.max(0, fh * pxPerMm);
        return (
          <g key={i}>
            <rect x={x} y={by} width={w} height={bh} fill="none" stroke={fill} strokeWidth={0.6} strokeOpacity={0.35} />
            {bh > 6 && w > 20 && (
              <line x1={x + w * 0.35} y1={by + Math.min(6, bh / 3)} x2={x + w * 0.65} y2={by + Math.min(6, bh / 3)}
                stroke={fill} strokeWidth={1.2} strokeOpacity={0.6} />
            )}
          </g>
        );
      })}
      {gapMm > 0 && bands.map(({ gapTopMm, frontTopMm }, i) => (
        <GapHatchZone key={`gap-${i}`}
          x={x} y={y + gapTopMm * pxPerMm} w={w}
          h={Math.max(0, (frontTopMm - gapTopMm) * pxPerMm)}
          fill={fill}
        />
      ))}
    </g>
  );
}

// ---- Main component --------------------------------------------------------

const WALL_AXIS = {
  top:    { widthKey: "width_mm",  label: "Top Wall" },
  bottom: { widthKey: "width_mm",  label: "Bottom Wall" },
  left:   { widthKey: "depth_mm",  label: "Left Wall" },
  right:  { widthKey: "depth_mm",  label: "Right Wall" },
};

export default function FrontElevationView({ wall: initialWall, room, items, onClose, onItemChange, onItemSelect, interactive = true, zoomable = false, colourImages, showColours = false, onToggleColours, lineOnly = false, printMode = false }) {
  const [currentWall, setCurrentWall] = useState(initialWall);
  const [selectedId, setSelectedId]   = useState(null);
  const [drag, setDrag]               = useState(null);
  const [localPos, setLocalPos]       = useState({});
  const [localShelves, setLocalShelves] = useState({});
  const [snapGuides, setSnapGuides]   = useState(null); // { x?: mm, y?: mm }
  const svgRef      = useRef(null);
  const pressedRef  = useRef(false);

  // Reset selection/drag when switching walls
  function switchWall(w) {
    setCurrentWall(w);
    setSelectedId(null);
    setDrag(null);
    setLocalPos({});
    setLocalShelves({});
    setSnapGuides(null);
  }

  const wall = currentWall;

  // ---- Room / scale maths --------------------------------------------------
  const wallWidthMm  = (wall === "top" || wall === "bottom") ? (room.width_mm || 4000) : (room.depth_mm || 3000);
  const roomHeightMm = room.height_mm || 2400;

  const VIEW_W = 1000, VIEW_H = 600;
  const MT = 56, MB = 44, ML = 64, MR = 28;
  const avW   = VIEW_W - ML - MR;
  const avH   = VIEW_H - MT - MB;
  const scale = Math.min(avW / wallWidthMm, avH / roomHeightMm);
  const drawW = wallWidthMm  * scale;
  const drawH = roomHeightMm * scale;
  const ox    = ML + (avW - drawW) / 2;
  const oy    = MT + (avH - drawH) / 2;
  const floor = oy + drawH;

  // ---- Helpers -------------------------------------------------------------
  // A corner cabinet appears on both the walls it touches — its primary
  // `wall` (normal position data applies) and its `secondary_wall` (position
  // is derived below, since it isn't independently stored). A freestanding
  // (non-corner) cabinet has no real wall at all, so it defaults to
  // whichever wall its back faces (islandVirtualWall), just so it's visible
  // in some elevation rather than never appearing in any of them.
  const wallItems = items.filter((i) =>
    i.wall === wall ||
    i.secondary_wall === wall ||
    (isIslandVirtualView(i) && islandVirtualWall(i) === wall)
  );

  // True when `itemData` is being shown here via its secondary wall rather
  // than its primary one — e.g. a corner cabinet whose primary leg is on the
  // "top" wall but is also visible here on the "left" wall's elevation.
  function isSecondaryWallView(itemData) {
    return itemData.item_type === "corner_base_cabinet" && itemData.secondary_wall === wall && itemData.wall !== wall;
  }

  // True for the two walls whose elevation axis runs opposite to raw
  // room-space coordinates. Standing in the room and turning to face each
  // wall in turn: facing "top", your left hand points to room x=0 (no
  // flip needed — svg-left = small x). Facing "right", your left hand
  // points to room y=0 (no flip — svg-left = small y). But facing "bottom"
  // (a 180° turn from top) your left hand now points to room x=max, and
  // facing "left" (a 90° turn from top) your left hand points to room
  // y=max — both walls need their raw coordinate mirrored so svg-left
  // still corresponds to what's actually on the viewer's left.
  const axisFlipped = wall === "bottom" || wall === "left";

  // Get the position of an item along the elevation wall axis (in mm),
  // already corrected for axisFlipped so svg-left always matches what the
  // viewer standing in the room and facing this wall would see on their left.
  // For top/bottom walls: horizontal room position = item.x_mm.
  // For left/right walls (new format): item.x_mm = 0, y_mm = position along wall.
  //   Old format: item.x_mm stores the y-position (x > 0 means old format).
  function getWallPos(itemData) {
    let raw, len;
    if (isSecondaryWallView(itemData)) {
      // A corner cabinet's secondary-wall position isn't independently
      // stored — it sits at whichever end of this wall the room corner is
      // on, which is fully determined by the primary wall it's attached to.
      // This computes the RAW (unflipped) room-space position — same
      // convention as a regular item's x_mm/y_mm — so it can go through
      // the same flip step below as everything else.
      len = itemData.secondary_width_mm || 900;
      const cornerAtStart = itemData.wall === "top" || itemData.wall === "left";
      raw = cornerAtStart ? 0 : wallWidthMm - len;
    } else if (isIslandVirtualView(itemData)) {
      // A freestanding cabinet's position on its virtual wall is just its
      // actual room-space coordinate projected onto that wall's axis. Its
      // SPAN along that wall is always width_mm — the rotation turns the
      // virtual wall with the item, so the axis swap cancels out (see
      // wallSpanMm). Reading depth_mm here drew a rotated island 300mm
      // narrow and, on the mirrored walls, 300mm out of position too.
      len = wallSpanMm(itemData);
      raw = (wall === "left" || wall === "right") ? (itemData.y_mm || 0) : (itemData.x_mm || 0);
    } else {
      len = itemData.width_mm || 600;
      if (wall === "left" || wall === "right") {
        const x = itemData.x_mm || 0;
        const y = itemData.y_mm || 0;
        raw = x > 0 ? x : y;
      } else {
        raw = itemData.x_mm || 0;
      }
    }
    return axisFlipped ? wallWidthMm - raw - len : raw;
  }

  function svgPt(e) {
    const pt = svgRef.current.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svgRef.current.getScreenCTM().inverse());
  }

  // The STORED mount height. This seeds the drag (startMount) and is what
  // gets written back on drop, so it must stay kickboard-free — folding the
  // offset in here would persist it into mount_height_mm and compound on
  // every drag. Use dispWithKickboard() for anything that measures.
  function getDisp(item) {
    const lp = localPos[item.id] || {};
    const baseX = getWallPos(item);
    return {
      x_mm:            lp.x_mm            ?? baseX,
      mount_height_mm: lp.mount_height_mm ?? item.mount_height_mm ?? (CABINET_MOUNT_MM[item.item_type] ?? 0),
    };
  }

  // The same item's VISIBLE carcass bottom — what every snap, collision and
  // dimension should compare against, since a kickboard really does lift the
  // carcass. Read-only: never write this back to the item.
  function dispWithKickboard(item) {
    const disp = getDisp(item);
    return { ...disp, mount_height_mm: disp.mount_height_mm + kickboardOffsetMm(item) };
  }

  // An item's full OCCUPIED span along this wall — carcass plus any applied
  // end panels, which sit outside it. Snapping and collision measure against
  // this so a cabinet lands against the outer face of the board next door
  // rather than on top of a real 16-18mm panel. x_mm keeps meaning the
  // carcass edge (it's what gets saved), so callers convert back with lowT.
  function occupiedWallSpan(item) {
    const { lowT, highT } = endPanelElevationSpanMm(item);
    const x = getDisp(item).x_mm;
    return { x_mm: x - lowT, width_mm: (item.width_mm || 600) + lowT + highT, lowT, highT };
  }

  // Default (unsaved) shelf position matches normalizeShelfHeights in
  // lib/pcd-cabinet-utils.js — (i+1)*H/(qty+1), no carcass-thickness term —
  // so an un-dragged shelf shows at the same height here as in the cabinet
  // schematic, cut-list PDF, and whatever gets persisted on import.
  function getShelfPositions(item) {
    if (localShelves[item.id]?.length) return localShelves[item.id];
    if (item.shelf_heights_mm?.length) return item.shelf_heights_mm;
    const qty = item.shelf_qty || 0;
    if (!qty) return [];
    const hMm = item.height_mm || 720;
    return Array.from({ length: qty }, (_, i) => Math.round(((i + 1) * hMm) / (qty + 1)));
  }

  // ---- Pointer handlers ----------------------------------------------------
  function handleItemPointerDown(e, item) {
    // Read-only (mobile): select on tap, never begin a drag.
    if (!interactive) { pressedRef.current = true; setSelectedId(item.id); onItemSelect?.(item.id); return; }
    if (!DRAGGABLE_TYPES.has(item.item_type)) return;
    // A corner cabinet's position on its secondary wall is derived, not
    // stored — nothing to drag here. Select it (for the config panel) but
    // don't start a drag; reposition it from its primary wall's elevation.
    // Same for a freestanding cabinet shown via its virtual wall — its
    // position here is projected from its 2D plan x_mm/y_mm, so reposition
    // it from the floor plan instead.
    if (isSecondaryWallView(item) || isIslandVirtualView(item)) {
      pressedRef.current = true;
      setSelectedId(item.id);
      onItemSelect?.(item.id);
      return;
    }
    e.stopPropagation();
    pressedRef.current = true;
    setSelectedId(item.id);
    onItemSelect?.(item.id);
    const pt  = svgPt(e);
    const dis = getDisp(item);
    const { lowT, highT } = endPanelElevationSpanMm(item);
    setDrag({
      type:       "item",
      itemId:     item.id,
      item_type:  item.item_type,
      width_mm:   item.width_mm  || 600,
      height_mm:  item.height_mm || 720,
      startPtX:   pt.x,
      startPtY:   pt.y,
      startXmm:   dis.x_mm,
      startMount: dis.mount_height_mm,
      // startXmm/startMount stay the STORED values (carcass edge, no
      // kickboard) since they're what gets written back on drop. These two
      // shift the item into the visible, panel-inclusive space that
      // neighbours are measured in, for the snap and collision maths only.
      kbOff:      kickboardOffsetMm(item),
      lowT,
      spanW:      (item.width_mm || 600) + lowT + highT,
    });
  }

  function handleShelfPointerDown(e, item, idx, heightMm) {
    if (!interactive) return;
    e.stopPropagation();
    pressedRef.current = true;
    const pt = svgPt(e);
    setDrag({
      type:       "shelf",
      itemId:     item.id,
      idx,
      T:          item.carcass_thickness_mm || 16,
      hMm:        item.height_mm || 720,
      startPtY:   pt.y,
      startH:     heightMm,
      allShelves: getShelfPositions(item),
    });
  }

  function handleSvgPointerMove(e) {
    if (!drag) return;
    const pt = svgPt(e);

    if (drag.type === "item") {
      const dxMm = (pt.x - drag.startPtX) / scale;
      const dyMm = (pt.y - drag.startPtY) / scale; // +ve = down SVG

      let newX     = drag.startXmm + dxMm;
      let newMount = drag.startMount;

      if (VERTICAL_DRAG_TYPES.has(drag.item_type)) {
        // The ceiling clamp is on the item's visible top, which its own
        // kickboard raises — otherwise a kickboarded panel drags through it.
        newMount = Math.max(0, Math.min(roomHeightMm - drag.height_mm - drag.kbOff, drag.startMount - dyMm));
      }

      // All same-wall items for snap candidates, positioned at their visible
      // carcass bottoms and full occupied widths so snapping aligns to real
      // edges — including the outer face of any applied end panel.
      const allWallOthers = wallItems
        .filter((i) => i.id !== drag.itemId)
        .map((i) => ({
          ...dispWithKickboard(i),
          ...occupiedWallSpan(i),
          height_mm: i.height_mm || 720,
        }));

      // Snap and collide in VISIBLE space on both axes — neighbours sit at
      // their carcass bottoms and panel-inclusive edges, so the dragged item
      // has to be measured the same way or it lands against the wrong faces.
      // Convert straight back afterwards: only the stored (kickboard-free,
      // carcass-edge) values are ever written out.
      const snapped = applyEdgeSnap(newX - drag.lowT, newMount + drag.kbOff, drag.spanW, drag.height_mm, allWallOthers, drag.item_type, wallWidthMm, roomHeightMm);
      newX     = snapped.x_mm + drag.lowT;
      newMount = snapped.mount_height_mm - drag.kbOff;
      setSnapGuides(snapped.snapX != null || snapped.snapY != null
        ? { x: snapped.snapX, y: snapped.snapY }
        : null);

      // Collision resolution — recompute height-filtered obstacles after snap (mount may have changed)
      const vLo = newMount + drag.kbOff, vHi = vLo + drag.height_mm;
      const obstacles = allWallOthers
        .filter((i) => i.mount_height_mm < vHi && i.mount_height_mm + i.height_mm > vLo);

      newX = resolveCollision1D(newX - drag.lowT, drag.spanW, obstacles, wallWidthMm) + drag.lowT;

      const pos = { x_mm: newX };
      if (VERTICAL_DRAG_TYPES.has(drag.item_type)) pos.mount_height_mm = newMount;
      setLocalPos((prev) => ({ ...prev, [drag.itemId]: pos }));

    } else if (drag.type === "shelf") {
      const dyMm = (pt.y - drag.startPtY) / scale;
      let newH = drag.startH - dyMm; // invert: move down SVG → lower height from bottom
      const minH = drag.T * 1.5;
      const maxH = drag.hMm - drag.T * 1.5;
      newH = Math.max(minH, Math.min(maxH, newH));

      const newShelves = [...drag.allShelves];
      newShelves[drag.idx] = newH;
      setLocalShelves((prev) => ({ ...prev, [drag.itemId]: newShelves }));
    }
  }

  function handleSvgPointerUp() {
    if (!drag) return;
    setSnapGuides(null);
    if (drag.type === "item") {
      const pos = localPos[drag.itemId];
      if (pos && onItemChange) {
        // pos.x_mm is in the (possibly flipped) elevation-local axis — undo
        // the flip from getWallPos before writing back to room-space.
        const rawX = axisFlipped ? wallWidthMm - pos.x_mm - drag.width_mm : pos.x_mm;
        // Elevation x_mm is position along the wall axis.
        // For left/right walls in new format: save as y_mm (room-space vertical).
        // For top/bottom walls: save as x_mm (room-space horizontal).
        const isLR = wall === "left" || wall === "right";
        // For left/right walls, elevation x = position along wall = room y_mm.
        // Also zero x_mm to migrate any old-format items (where x_mm stored the y-position).
        const patch = isLR
          ? { x_mm: 0, y_mm: rawX, ...(pos.mount_height_mm !== undefined ? { mount_height_mm: pos.mount_height_mm } : {}) }
          : { x_mm: rawX, ...(pos.mount_height_mm !== undefined ? { mount_height_mm: pos.mount_height_mm } : {}) };
        onItemChange(drag.itemId, patch);
      }
    } else if (drag.type === "shelf") {
      const shelves = localShelves[drag.itemId];
      if (shelves && onItemChange) onItemChange(drag.itemId, { shelf_heights_mm: shelves });
    }
    setDrag(null);
  }

  // ---- Derived for gap overlays --------------------------------------------
  const draggingItem  = drag?.type === "item" ? wallItems.find((i) => i.id === drag.itemId) : null;
  const dragDisp      = draggingItem ? dispWithKickboard(draggingItem) : null;
  const draggingMount = dragDisp?.mount_height_mm ?? 0;
  const vLoDrag       = draggingMount;
  const vHiDrag       = draggingMount + (draggingItem?.height_mm || 720);
  // All other cabinets on this wall, unfiltered — used for the vertical
  // (mount-height) gap, which is filtered by X-range overlap instead (see
  // computeYGaps), not by mount-height overlap. Positioned at their visible
  // carcass bottoms: measuring to a raw mount_height_mm reported the gap to
  // a kickboarded base cabinet as reaching its pre-kickboard top, a full
  // kickboard too far, and drew the dimension line into the cabinet.
  const allDragOthers = drag?.type === "item"
    ? wallItems
        .filter((i) => i.id !== drag.itemId)
        .map((i) => ({ ...dispWithKickboard(i), ...occupiedWallSpan(i), height_mm: i.height_mm || 720, item_type: i.item_type, has_benchtop: i.has_benchtop }))
    : [];
  // Same list, but restricted to cabinets that share the dragged item's
  // mount-height range — the only ones it could actually interact/collide
  // with left-right, and the only ones relevant for a left/right gap line
  // (e.g. a base cabinet doesn't get an X-gap line to a wall cabinet above it).
  const xGapObstacles = allDragOthers
    .filter((i) => i.mount_height_mm < vHiDrag && i.mount_height_mm + i.height_mm > vLoDrag);

  const hasWallCabs = wallItems.some((i) => i.item_type === "wall_cabinet");

  // Export ("print") theme: the on-screen elevation sits on a dark panel, but
  // the PDF is a white page, so structural linework flips to ink and the room
  // envelope (its four walls, incl. floor + ceiling) reads as a clear outline.
  const structInk   = printMode ? "#1f2937" : "rgba(255,255,255,0.5)";
  const structFaint = printMode ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.04)";
  const structText  = printMode ? "#374151" : "rgba(255,255,255,0.4)";

  // "Show colours": the elevation paints each cabinet FACE with one
  // representative tile (its drawer/door front, or the carcass for an open
  // unit) as a background under the existing outlines and door/drawer detail.
  // The 3D view is the per-panel-accurate one; this is a quick tint of the
  // face. Off (or unresolved) → the flat type colours, exactly as before.
  const faceSlot = (item) => {
    const ft = item.front_type || "none";
    if (ft === "drawers") return "drawer";
    if (ft === "none") return "carcass";
    return "door";
  };
  const elevSrcToPattern = new Map();
  const elevTilePatterns = [];
  const registerSrc = (src) => {
    if (src && !elevSrcToPattern.has(src)) {
      const id = `ctile-elev-${elevSrcToPattern.size}`;
      elevSrcToPattern.set(src, id);
      elevTilePatterns.push({ id, src });
    }
  };
  if (showColours && colourImages) {
    for (const item of wallItems) {
      // Face + the two applied pieces the elevation draws (filler / kickboard),
      // so each gets its own resolved tile rather than staying flat.
      registerSrc(resolveColourSrc(colourImages, item, faceSlot(item)));
      registerSrc(resolveColourSrc(colourImages, item, "filler"));
      registerSrc(resolveColourSrc(colourImages, item, "kickboard"));
    }
  }
  const tileFillFor = (item, slot) => {
    if (!showColours || !colourImages) return null;
    const id = elevSrcToPattern.get(resolveColourSrc(colourImages, item, slot));
    return id ? `url(#${id})` : null;
  };
  const faceFillFor = (item) => tileFillFor(item, faceSlot(item));

  // ---- Render --------------------------------------------------------------
  return (
    <div className={styles.elevationInline}>

      {/* Toolbar */}
      <div className={styles.elevationToolbar}>
        <button type="button" className={styles.elevationBackBtn} onClick={onClose}>
          ← Floor Plan
        </button>
        {onToggleColours && (
          <button
            type="button"
            className={`${styles.elevationBackBtn} ${showColours ? styles.elevColoursActive : ""}`}
            onClick={onToggleColours}
            title="Paint cabinets with their real colour-library finishes"
          >
            {showColours ? "Colours on" : "Show colours"}
          </button>
        )}
        <div className={styles.elevationToolbarInfo}>
          <span className={styles.elevationToolbarTitle}>Elevation — {WALL_LABELS[wall] || wall}</span>
          <span className={styles.elevationToolbarSub}>
            {room.name} · {wallWidthMm}mm wide · {roomHeightMm}mm high
          </span>
        </div>

        {/* Wall switcher — hidden on mobile (read-only), which shows only the
            single elevation for the wall its one cabinet sits on. */}
        {interactive && (
        <div className={styles.elevWallPicker}>
          {["top", "left", "bottom", "right"].map((w) => {
            const count = items.filter((i) =>
              i.wall === w || (isIslandVirtualView(i) && islandVirtualWall(i) === w)
            ).length;
            return (
              <button
                key={w}
                type="button"
                className={`${styles.elevWallBtn} ${w === wall ? styles.elevWallBtnActive : ""} ${count === 0 ? styles.elevWallBtnEmpty : ""}`}
                onClick={() => switchWall(w)}
                title={`${WALL_LABELS[w]} (${count} items)`}
              >
                {w[0].toUpperCase()}
                <span className={styles.elevWallBtnCount}>{count}</span>
              </button>
            );
          })}
        </div>
        )}
        <div className={styles.elevationLegend}>
          {[
            { type: "base_cabinet", label: "Base" },
            { type: "wall_cabinet", label: "Wall" },
            { type: "tall_cabinet", label: "Tall" },
            { type: "corner_base_cabinet", label: "Corner" },
            { type: "obstruction", label: "Obstruction" },
          ].map(({ type, label }) => (
            <div key={type} className={styles.elevationLegendItem}>
              <span className={styles.elevationLegendDot} style={{ background: ITEM_COLORS[type] }} />
              {label}
            </div>
          ))}
          <div className={styles.elevationLegendItem}>
            <span className={styles.elevationLegendLine} style={{ background: "rgba(99,102,241,0.6)" }} />
            Bench {BENCH_HEIGHT_MM}mm
          </div>
          {hasWallCabs && (
            <div className={styles.elevationLegendItem}>
              <span className={styles.elevationLegendLine} style={{ background: "rgba(34,197,94,0.6)" }} />
              Mount {CABINET_MOUNT_MM.wall_cabinet}mm
            </div>
          )}
        </div>
        {wallItems.length === 0 && (
          <span style={{ marginLeft: "auto", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
            No cabinets on this wall
          </span>
        )}
      </div>

      {/* Item selector strip — visible even when cabinets overlap in SVG */}
      {wallItems.length > 0 && (
        <div className={styles.elevItemStrip}>
          {wallItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${styles.elevItemChip} ${item.id === selectedId ? styles.elevItemChipActive : ""}`}
              style={{ "--chip-col": ITEM_COLORS[item.item_type] || "#888" }}
              onClick={() => {
                const next = item.id === selectedId ? null : item.id;
                setSelectedId(next);
                if (next) onItemSelect?.(next);
              }}
            >
              <span className={styles.elevItemChipDot} />
              {itemDisplayLabel(item)}{isSecondaryWallView(item) ? " (return)" : isIslandVirtualView(item) ? " (freestanding)" : ""}
            </button>
          ))}
        </div>
      )}

      {/* SVG drawing */}
      <div className={styles.elevationSvgArea}>
        <PinchZoom enabled={zoomable}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid meet"
          style={{ display: "block", cursor: drag ? "grabbing" : "default" }}
          onClick={(e) => {
            if (pressedRef.current) { pressedRef.current = false; return; }
            if (e.target === svgRef.current) setSelectedId(null);
          }}
          onPointerMove={handleSvgPointerMove}
          onPointerUp={handleSvgPointerUp}
          onPointerLeave={handleSvgPointerUp}
        >
          <defs>
            {/* Fixed tile size in SVG user-space (not tied to each rect's own
                bounding box) — keeps stripe spacing/thickness identical no
                matter how big or small an obstruction is. */}
            <pattern id="obstructionHatchElev" width={14} height={14} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1={0} y1={0} x2={0} y2={14} stroke="rgba(255,255,255,0.16)" strokeWidth={3} />
            </pattern>
            {/* One colour-library tile per unique cabinet face, stretched to
                fill each face rect it's referenced from. */}
            {elevTilePatterns.map((p) => (
              <pattern key={p.id} id={p.id} patternUnits="objectBoundingBox" patternContentUnits="objectBoundingBox" width={1} height={1}>
                <image href={p.src} x={0} y={0} width={1} height={1} preserveAspectRatio="xMidYMid slice" />
              </pattern>
            ))}
          </defs>

          {/* Room envelope — the wall space (width x room height) as a clear
              outline so cabinets read as sitting between the walls and floor,
              not floating. */}
          <rect x={ox} y={oy} width={drawW} height={drawH}
            fill="none" stroke={structInk} strokeWidth={printMode ? 1.6 : 1} />

          {/* Grid lines every 600mm */}
          {Array.from({ length: Math.ceil(wallWidthMm / 600) }).map((_, i) => (
            <line key={`gx${i}`}
              x1={ox + (i + 1) * 600 * scale} y1={oy}
              x2={ox + (i + 1) * 600 * scale} y2={floor}
              stroke={structFaint} strokeWidth={1} />
          ))}
          {Array.from({ length: Math.ceil(roomHeightMm / 600) }).map((_, i) => (
            <line key={`gy${i}`}
              x1={ox} y1={oy + (i + 1) * 600 * scale}
              x2={ox + drawW} y2={oy + (i + 1) * 600 * scale}
              stroke={structFaint} strokeWidth={1} />
          ))}

          {/* Bench height reference */}
          <line x1={ox} y1={floor - BENCH_HEIGHT_MM * scale}
            x2={ox + drawW} y2={floor - BENCH_HEIGHT_MM * scale}
            stroke="rgba(99,102,241,0.35)" strokeWidth={1} strokeDasharray="6 3"
            style={{ pointerEvents: "none" }} />
          <text x={ox + drawW + 4} y={floor - BENCH_HEIGHT_MM * scale}
            fontSize={8} dominantBaseline="middle" fill="rgba(99,102,241,0.6)">
            {BENCH_HEIGHT_MM}
          </text>

          {/* Wall cabinet mount reference */}
          {hasWallCabs && (
            <>
              <line x1={ox} y1={floor - CABINET_MOUNT_MM.wall_cabinet * scale}
                x2={ox + drawW} y2={floor - CABINET_MOUNT_MM.wall_cabinet * scale}
                stroke="rgba(34,197,94,0.3)" strokeWidth={1} strokeDasharray="5 3"
                style={{ pointerEvents: "none" }} />
              <text x={ox + drawW + 4} y={floor - CABINET_MOUNT_MM.wall_cabinet * scale}
                fontSize={8} dominantBaseline="middle" fill="rgba(34,197,94,0.55)">
                {CABINET_MOUNT_MM.wall_cabinet}
              </text>
            </>
          )}

          {/* Ceiling line */}
          <line x1={ox} y1={oy} x2={ox + drawW} y2={oy} stroke={structInk} strokeWidth={1.5} />
          <text x={ox - 6} y={oy} fontSize={8} textAnchor="end" dominantBaseline="middle"
            fill={structText}>
            CEILING
          </text>

          {/* Returns of cabinets on perpendicular walls that reach this corner —
              drawn first so any head-on cabinet at the same corner sits over
              them (it's physically in front). Translucent + dashed so it reads
              as "a cabinet turning the corner from the next wall", not one on
              this wall. */}
          {perpendicularCornerReturns(wall, items, room).map(({ item, alongMm, depthMm, bottomMm, topMm }) => {
            const rx = ox + alongMm * scale;
            const rw = depthMm * scale;
            const ry = floor - topMm * scale;
            const rh = (topMm - bottomMm) * scale;
            const fill = lineOnly ? "#26313f" : (ITEM_COLORS[item.item_type] || "#888");
            return (
              <g key={`return-${item.id}`} style={{ pointerEvents: "none" }}>
                <rect x={rx} y={ry} width={rw} height={rh}
                  fill={fill} fillOpacity={0.2}
                  stroke={fill} strokeOpacity={0.55} strokeWidth={0.8} strokeDasharray="4 2" />
                {rw > 26 && rh > 16 && (
                  <text x={rx + rw / 2} y={ry + rh / 2} textAnchor="middle" dominantBaseline="middle"
                    fontSize={7} fill="rgba(255,255,255,0.55)" style={{ userSelect: "none" }}>
                    {itemDisplayLabel(item)} ↵
                  </text>
                )}
              </g>
            );
          })}

          {/* Cabinets */}
          {wallItems.map((item) => {
            const dis    = getDisp(item);
            const xMm    = dis.x_mm;
            const mountH = dis.mount_height_mm;
            const isCorner = item.item_type === "corner_base_cabinet";
            const isSecondaryView = isSecondaryWallView(item);
            // For a corner cabinet, width_mm is the primary leg's footprint
            // along its own wall — secondary_width_mm is the equivalent for
            // the secondary leg, which is what's relevant when this wall IS
            // that secondary wall. Everything else, freestanding or not,
            // presents width_mm to its wall (see wallSpanMm).
            const wMm    = isSecondaryView
              ? (item.secondary_width_mm || 900)
              : wallSpanMm(item);
            const hMm    = item.height_mm || 720;
            // Kickboard lifts the cabinet body off the floor by kickboard height
            const kbMm   = kickboardOffsetMm(item);
            // Filler panel closes the gap between a wall/tall cabinet's top
            // and the ceiling, or the nearest obstruction above it if closer
            const fillerMm = ((item.item_type === "wall_cabinet" || item.item_type === "tall_cabinet") && item.has_filler_panel)
              ? (item.filler_panel_height_mm ?? fillerPanelGapMm(item, room, items))
              : 0;
            // Line mode draws cabinets as ink outlines; colour modes keep the
            // per-type colour for the outlines, panels and label.
            const fill   = lineOnly ? "#26313f" : (ITEM_COLORS[item.item_type] || "#888");
            const svgX   = ox + xMm  * scale;
            const svgW   = wMm * scale;
            const svgH   = hMm * scale;
            const svgY   = floor - (mountH + kbMm + hMm) * scale;
            const T      = Math.max((item.carcass_thickness_mm || 16) * scale, 1.5);
            const isSelected = item.id === selectedId;
            const isDragging = drag?.itemId === item.id;
            const shelves    = getShelfPositions(item);
            const cx = svgX + svgW / 2;
            // Rangehood housing/channel — full carcass depth, so this is
            // purely a width/height split of the elevation, not a depth
            // concern. Channel sits centred in the inner cavity; shelves
            // either side get clipped around it below.
            const rangehoodChannel = (item.has_rangehood && Number(item.rangehood_channel_width_mm) > 0)
              ? (() => {
                  const innerLeft  = svgX + T;
                  const innerRight = svgX + svgW - T;
                  const channelPx  = Math.min(Number(item.rangehood_channel_width_mm) * scale, Math.max(innerRight - innerLeft, 0));
                  const centerX    = (innerLeft + innerRight) / 2;
                  const housingHeightMm = Math.min(Number(item.rangehood_housing_height_mm) || 0, hMm);
                  const housingTopY = (svgY + svgH) - housingHeightMm * scale;
                  return {
                    left: centerX - channelPx / 2,
                    right: centerX + channelPx / 2,
                    housingTopY,
                  };
                })()
              : null;
            const cy = svgY + svgH / 2;
            const shortLabel = itemDisplayLabel(item).slice(0, 14);
            const fs = Math.min(Math.max(svgW / (shortLabel.length * 0.72), 7), 12);
            const canDrag = DRAGGABLE_TYPES.has(item.item_type);
            const isObstruction = item.item_type === "obstruction";

            // For a corner cabinet with both walls set, the wall the OTHER
            // leg is on determines where the "return" zone sits on THIS
            // wall's elevation — same-side rule as the plan view's L-shape.
            const otherWall  = isCorner ? (isSecondaryView ? item.wall : item.secondary_wall) : null;
            const hasReturn  = isCorner && Boolean(otherWall) && otherWall !== wall;
            // Raw (room-space) side the return sits on, then mirrored the
            // same way axisFlipped mirrors position — a flipped wall axis
            // also flips which side of the cabinet's own rendered box the
            // return zone lands on.
            const rawReturnAtStart = otherWall === "top" || otherWall === "left";
            const returnAtStart = hasReturn && (axisFlipped ? !rawReturnAtStart : rawReturnAtStart);
            const returnPx   = hasReturn ? Math.min((item.depth_mm || 600) * scale, svgW) : 0;
            const doorZoneX  = hasReturn && returnAtStart ? svgX + returnPx : svgX;
            const doorZoneW  = hasReturn ? Math.max(svgW - returnPx, 0) : svgW;

            return (
              <g key={item.id}
                style={{ cursor: canDrag ? (isDragging ? "grabbing" : "grab") : "default" }}
                onPointerDown={(e) => handleItemPointerDown(e, item)}
              >
                {/* Cabinet body — obstructions are solid + hazard-hatched so
                    they read as structure, not a manufactured cabinet. */}
                <rect x={svgX} y={svgY} width={svgW} height={svgH}
                  fill={lineOnly ? "none" : fill} fillOpacity={isDragging ? 0.14 : 0.1}
                  stroke={fill} strokeWidth={isSelected ? 2 : 1.5}
                  strokeOpacity={isSelected ? 1 : 0.7}
                  rx={2} />
                {/* Colour-tile face wash (under the door/drawer detail, over
                    the body tint) — only when "show colours" resolves a tile. */}
                {faceFillFor(item) && !isObstruction && (
                  <rect x={svgX} y={svgY} width={svgW} height={svgH}
                    fill={faceFillFor(item)} fillOpacity={isDragging ? 0.55 : 0.9}
                    rx={2} style={{ pointerEvents: "none" }} />
                )}
                {isObstruction && (
                  <rect x={svgX} y={svgY} width={svgW} height={svgH}
                    fill="url(#obstructionHatchElev)"
                    style={{ pointerEvents: "none" }} />
                )}

                {/* Corner cabinet "return" zone — the depth of the OTHER leg poking into
                    this wall's frontage. Structural only: no door/hinge config belongs here. */}
                {hasReturn && (
                  <g style={{ pointerEvents: "none" }}>
                    <rect
                      x={returnAtStart ? svgX : svgX + svgW - returnPx} y={svgY}
                      width={returnPx} height={svgH}
                      fill="rgba(255,255,255,0.05)" stroke={fill} strokeWidth={0.6}
                      strokeDasharray="2 2" strokeOpacity={0.5}
                    />
                    {Array.from({ length: Math.max(1, Math.ceil(svgH / 9)) }).map((_, i) => {
                      const hatchX = returnAtStart ? svgX : svgX + svgW - returnPx;
                      const ly = svgY + i * 9;
                      return (
                        <line key={`hatch-${i}`}
                          x1={hatchX} y1={Math.min(ly + 9, svgY + svgH)}
                          x2={hatchX + returnPx} y2={ly}
                          stroke={fill} strokeWidth={0.5} strokeOpacity={0.3} />
                      );
                    })}
                    {returnPx > 13 && svgH > 40 && (
                      <text
                        x={(returnAtStart ? svgX : svgX + svgW - returnPx) + returnPx / 2}
                        y={svgY + svgH / 2}
                        textAnchor="middle" dominantBaseline="middle"
                        fontSize={6.5} fill={fill} fillOpacity={0.65}
                        transform={`rotate(-90, ${(returnAtStart ? svgX : svgX + svgW - returnPx) + returnPx / 2}, ${svgY + svgH / 2})`}
                      >
                        RETURN
                      </text>
                    )}
                  </g>
                )}

                {/* Selection glow */}
                {isSelected && (
                  <rect x={svgX - 2} y={svgY - 2} width={svgW + 4} height={svgH + 4}
                    fill="none" stroke={fill} strokeWidth={1} strokeOpacity={0.3} rx={3}
                    style={{ pointerEvents: "none" }} />
                )}

                {!isObstruction && (
                  <>
                    {/* Side panels */}
                    <rect x={svgX} y={svgY} width={T} height={svgH}
                      fill={fill} fillOpacity={0.45} style={{ pointerEvents: "none" }} />
                    <rect x={svgX + svgW - T} y={svgY} width={T} height={svgH}
                      fill={fill} fillOpacity={0.45} style={{ pointerEvents: "none" }} />
                    {/* Top panel */}
                    <rect x={svgX} y={svgY} width={svgW} height={T}
                      fill={fill} fillOpacity={0.45} style={{ pointerEvents: "none" }} />
                    {/* Bottom panel */}
                    <rect x={svgX} y={svgY + svgH - T} width={svgW} height={T}
                      fill={fill} fillOpacity={0.45} style={{ pointerEvents: "none" }} />
                  </>
                )}

                {/* Rangehood housing (bottom recess for the unit itself) +
                    boxed exhaust channel running up to the top of the
                    cabinet — both always full carcass depth. */}
                {rangehoodChannel && (
                  <g style={{ pointerEvents: "none" }}>
                    <rect x={svgX} y={rangehoodChannel.housingTopY}
                      width={svgW} height={Math.max((svgY + svgH) - rangehoodChannel.housingTopY, 0)}
                      fill={fill} fillOpacity={0.14}
                      stroke={fill} strokeWidth={0.8} strokeDasharray="3 2" strokeOpacity={0.5} />
                    {svgW > 50 && ((svgY + svgH) - rangehoodChannel.housingTopY) > 14 && (
                      <text x={cx} y={(rangehoodChannel.housingTopY + (svgY + svgH)) / 2}
                        textAnchor="middle" dominantBaseline="middle"
                        fontSize={7} fill={fill} fillOpacity={0.65} letterSpacing={0.4}>
                        RANGEHOOD
                      </text>
                    )}
                    <rect x={rangehoodChannel.left} y={svgY}
                      width={Math.max(rangehoodChannel.right - rangehoodChannel.left, 0)}
                      height={Math.max(rangehoodChannel.housingTopY - svgY, 0)}
                      fill={fill} fillOpacity={0.4} />
                  </g>
                )}

                {/* Shelves — split into a left/right pair around the
                    rangehood channel when one is present. */}
                {shelves.map((shelfH, si) => {
                  const sy  = (svgY + svgH) - shelfH * scale - T / 2;
                  const isShelfDragging = drag?.type === "shelf" && drag.itemId === item.id && drag.idx === si;
                  return (
                    <g key={`sh${si}`}>
                      {rangehoodChannel ? (
                        <>
                          <rect
                            x={svgX + T} y={sy}
                            width={Math.max(rangehoodChannel.left - (svgX + T), 0)} height={T}
                            fill={fill} fillOpacity={isSelected ? 0.55 : 0.3}
                            style={{ cursor: isSelected ? "ns-resize" : "default" }}
                            onPointerDown={isSelected ? (e) => handleShelfPointerDown(e, item, si, shelfH) : undefined}
                          />
                          <rect
                            x={rangehoodChannel.right} y={sy}
                            width={Math.max((svgX + svgW - T) - rangehoodChannel.right, 0)} height={T}
                            fill={fill} fillOpacity={isSelected ? 0.55 : 0.3}
                            style={{ cursor: isSelected ? "ns-resize" : "default" }}
                            onPointerDown={isSelected ? (e) => handleShelfPointerDown(e, item, si, shelfH) : undefined}
                          />
                        </>
                      ) : (
                        <rect
                          x={svgX + T} y={sy}
                          width={Math.max(svgW - 2 * T, 0)} height={T}
                          fill={fill} fillOpacity={isSelected ? 0.55 : 0.3}
                          style={{ cursor: isSelected ? "ns-resize" : "default" }}
                          onPointerDown={isSelected ? (e) => handleShelfPointerDown(e, item, si, shelfH) : undefined}
                        />
                      )}
                      {/* Shelf drag handle (centred grip) */}
                      {isSelected && (
                        <rect
                          x={cx - 12} y={sy + T * 0.1}
                          width={24} height={T * 0.8}
                          fill={fill} fillOpacity={0.7} rx={1}
                          style={{ cursor: "ns-resize", pointerEvents: "none" }}
                        />
                      )}
                      {/* Height label when selected */}
                      {isSelected && svgW > 50 && (
                        <g style={{ pointerEvents: "none" }}>
                          <rect x={svgX + svgW + 3} y={sy - 7} width={38} height={13}
                            fill="rgba(0,0,0,0.75)" rx={2} />
                          <text x={svgX + svgW + 22} y={sy + T / 2}
                            textAnchor="middle" dominantBaseline="middle"
                            fontSize={8} fill="#f59e0b">
                            {Math.round(shelfH)}mm
                          </text>
                          {/* Vertical leader from shelf to floor */}
                          {isShelfDragging && (
                            <line x1={svgX + svgW / 2} y1={svgY + svgH}
                              x2={svgX + svgW / 2} y2={sy + T / 2}
                              stroke={fill} strokeWidth={0.5} strokeDasharray="3 2" strokeOpacity={0.4} />
                          )}
                        </g>
                      )}
                    </g>
                  );
                })}

                {/* Corner cabinet door — a single bi-fold leaf per wall (the door zone
                    excludes the return zone above), rendered separately from the
                    regular multi-column door grid below since a corner cabinet's
                    door_config uses a different shape: { hinge_wall, hinge_qty,
                    hinge_positions_mm }. Only the leg configured as hinge_wall gets
                    frame-drilled hinge marks — the other leaf is fold-hinged to it,
                    not independently drilled, so it's shown as an outline + swing
                    direction only. The FRAME hinge is always at the leg's outer end
                    (away from the corner) — that's the only rigid edge on a bi-fold
                    leaf; the fold-joint between the two leaves sits at the corner
                    itself and is never drilled, so the hinge side is the opposite of
                    wherever the return zone is, not the same side. */}
                {isCorner && item.front_type === "doors" && doorZoneW > 10 && svgH > 20 && (() => {
                  const cfg = item.door_config || {};
                  const legKey = isSecondaryView ? "secondary" : "primary";
                  const isHingeLeg = (cfg.hinge_wall || "primary") === legKey;
                  const hingePositions = isHingeLeg && Array.isArray(cfg.hinge_positions_mm) ? cfg.hinge_positions_mm : [];
                  const hingeAtStart = hasReturn ? !returnAtStart : true;
                  // One reveal across the whole bi-fold door, placed by the same
                  // automatic bench-height rule a regular door row uses — a corner
                  // base cabinet sits under the line, so it resolves to the top.
                  // Both leaves get the identical gap, so they stay aligned as the
                  // door folds around the corner.
                  const gapPx = doorRowGapMm(cfg) * scale;
                  const atTop = (floor - (svgY + svgH / 2)) / scale <= BENCH_HEIGHT_MM;
                  const leafH = Math.max(0, svgH - gapPx);
                  const leafY = atTop ? svgY + gapPx : svgY;
                  const gapY  = atTop ? svgY : svgY + leafH;
                  const baseX = hingeAtStart ? doorZoneX : doorZoneX + doorZoneW;
                  const tipX  = hingeAtStart ? doorZoneX + doorZoneW : doorZoneX;
                  const midY  = leafY + leafH / 2;
                  const markSize = 4;

                  return (
                    <g style={{ pointerEvents: "none" }}>
                      <rect x={doorZoneX} y={leafY} width={doorZoneW} height={leafH}
                        fill="none" stroke={fill} strokeWidth={0.6} strokeOpacity={0.35} />
                      {gapPx > 0 && <GapHatchZone x={doorZoneX} y={gapY} w={doorZoneW} h={gapPx} fill={fill} />}
                      <line x1={baseX} y1={leafY}         x2={tipX} y2={midY}
                        stroke={fill} strokeWidth={0.8} strokeDasharray="3 2" strokeOpacity={0.55} />
                      <line x1={baseX} y1={leafY + leafH} x2={tipX} y2={midY}
                        stroke={fill} strokeWidth={0.8} strokeDasharray="3 2" strokeOpacity={0.55} />
                      {hingePositions.map((posMm, hIdx) => {
                        // Hinge positions are measured from the door's own bottom
                        // edge, which the gap moves when it sits at the bottom.
                        const rawY = (leafY + leafH) - Number(posMm || 0) * scale;
                        const hy = Math.max(leafY, Math.min(leafY + leafH, rawY));
                        const inset = Math.min(doorZoneW / 3, 9);
                        const markX = hingeAtStart ? baseX + inset : baseX - inset;
                        return (
                          <g key={`corner-hinge-${hIdx}`}>
                            <line x1={markX - markSize} y1={hy - markSize} x2={markX + markSize} y2={hy + markSize}
                              stroke="#ef4444" strokeWidth={1.4} strokeOpacity={0.95} />
                            <line x1={markX - markSize} y1={hy + markSize} x2={markX + markSize} y2={hy - markSize}
                              stroke="#ef4444" strokeWidth={1.4} strokeOpacity={0.95} />
                          </g>
                        );
                      })}
                    </g>
                  );
                })()}

                {/* Door swing visualization — dotted V-triangle pointing to the opening edge, plus X marks at hinge positions */}
                {!isCorner && item.front_type === "doors" && svgW > 20 && svgH > 20 && (() => {
                  const cfg  = item.door_config || {};
                  const rows = Math.max(1, cfg.rows || 1);
                  const dH   = svgH / rows;
                  return (
                    <>
                      {Array.from({ length: rows }).map((_, r) => (
                        <DoorRowWithGap key={r} x={svgX} y={svgY + r * dH} w={svgW} h={dH} cfg={cfg} fill={fill} scale={scale} floor={floor} />
                      ))}
                    </>
                  );
                })()}

                {/* Drawer bank visualization — stacked front outlines with a
                    finger-pull reveal between them if configured. No swing/
                    hinge visuals since drawers don't hinge. */}
                {!isCorner && item.front_type === "drawers" && svgW > 20 && svgH > 20 && (
                  <DrawerBank x={svgX} y={svgY} w={svgW} h={svgH} cfg={item.drawer_config || {}} fill={fill} />
                )}

                {/* Mixed door+drawer front — stack each section's own bank
                    inside its own height slice of the cabinet body. */}
                {!isCorner && item.front_type === "mixed" && svgW > 20 && svgH > 20 && (() => {
                  const sections = Array.isArray(item.section_config?.sections) ? item.section_config.sections : [];
                  const totalMm = sections.reduce((s, sec) => s + (Number(sec.height_mm) || 0), 0) || 1;
                  const pxPerMm = svgH / totalMm;
                  let cursorMm = 0;
                  return (
                    <>
                      {sections.map((sec, idx) => {
                        const secY = svgY + cursorMm * pxPerMm;
                        const secH = (Number(sec.height_mm) || 0) * pxPerMm;
                        cursorMm += Number(sec.height_mm) || 0;
                        if (secH <= 0) return null;
                        return sec.type === "open" ? (
                          <g key={idx} style={{ pointerEvents: "none" }}>
                            <rect x={svgX} y={secY} width={svgW} height={secH}
                              fill="none" stroke={fill} strokeWidth={0.6} strokeDasharray="4 3" strokeOpacity={0.4} />
                            {svgW > 30 && secH > 14 && (
                              <text x={svgX + svgW / 2} y={secY + secH / 2}
                                textAnchor="middle" dominantBaseline="middle"
                                fontSize={7} fill={fill} fillOpacity={0.45} letterSpacing={0.5}>
                                OPEN
                              </text>
                            )}
                          </g>
                        ) : sec.type === "drawers" ? (
                          <DrawerBank key={idx} x={svgX} y={secY} w={svgW} h={secH} cfg={sec.drawer || {}} fill={fill} />
                        ) : (
                          <DoorRowWithGap key={idx} x={svgX} y={secY} w={svgW} h={secH} cfg={sec.door || {}} fill={fill} scale={scale} floor={floor} />
                        );
                      })}
                      {/* Section boundary lines */}
                      {sections.slice(0, -1).map((_, idx) => {
                        const y2 = svgY + sections.slice(0, idx + 1).reduce((s, sec) => s + (Number(sec.height_mm) || 0), 0) * pxPerMm;
                        return (
                          <line key={`sec-${idx}`} x1={svgX} y1={y2} x2={svgX + svgW} y2={y2}
                            stroke={fill} strokeWidth={1} strokeOpacity={0.5} style={{ pointerEvents: "none" }} />
                        );
                      })}
                    </>
                  );
                })()}

                {/* Label */}
                {svgW > 24 && svgH > 24 && (
                  <text x={cx} y={shelves.length ? cy - 8 : cy - 5}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={fs} fontWeight="600" fill={fill} fillOpacity={0.9}
                    style={{ pointerEvents: "none" }}>
                    {shortLabel}
                  </text>
                )}
                {svgW > 32 && svgH > 38 && (
                  <text x={cx} y={shelves.length ? cy + 4 : cy + 8}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={7} fill={fill} fillOpacity={0.55}
                    style={{ pointerEvents: "none" }}>
                    {wMm}w × {hMm}h
                  </text>
                )}
                {item.shelf_qty > 0 && svgH > 52 && svgW > 32 && (
                  <text x={cx} y={cy + 15}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={7} fill={fill} fillOpacity={0.4}
                    style={{ pointerEvents: "none" }}>
                    {item.shelf_qty} shelf{item.shelf_qty !== 1 ? "ves" : ""}
                  </text>
                )}

                {/* Kickboard / plinth strip — sits below the cabinet body, fills space to the floor */}
                {kbMm > 0 && (
                  <>
                    <rect
                      x={svgX} y={svgY + svgH}
                      width={svgW} height={kbMm * scale}
                      fill="rgba(245,158,11,0.45)"
                      stroke="rgba(245,158,11,0.7)"
                      strokeWidth={0.5}
                      style={{ pointerEvents: "none" }}
                    />
                    {tileFillFor(item, "kickboard") && (
                      <rect x={svgX} y={svgY + svgH} width={svgW} height={kbMm * scale}
                        fill={tileFillFor(item, "kickboard")} fillOpacity={0.9}
                        style={{ pointerEvents: "none" }} />
                    )}
                  </>
                )}

                {/* Benchtop — sits ON the cabinet body, so its underside is the
                    carcass top (kickboard already included in svgY) and it
                    grows upward from there.

                    Drawn, never quoted: no material, no rate, no cut-list
                    piece. Hatched-free solid grey so it reads as a surface
                    supplied by someone else rather than one of our boards.

                    Only the run's FIRST cabinet draws it, so a continuous run
                    is one top rather than a seam per cabinet — same ownership
                    rule as the kickboard. */}
                {item.has_benchtop && (() => {
                  const run = computeBenchtopRun(item, wallItems);
                  if (run.count > 1 && run.firstItemId !== item.id) return null;
                  const tMm = benchtopThicknessMm(item);
                  const topH = tMm * scale;
                  const topW = (run.count > 1 ? run.totalWidth : wallSpanMm(item)) * scale;
                  const topY = svgY - topH;
                  // The ELEVATION variant: this axis is already flipped by
                  // getWallPos, so svg-left IS the viewer's left and no second
                  // flip is wanted.
                  const { low, high } = benchtopWaterfallElevationSides(item, benchtopRunWaterfallEnds(item, wallItems));
                  const waterfallH = svgY + svgH + kbMm * scale - topY;
                  // A waterfall extends the top past the cabinet end by its
                  // thickness and drops OUTSIDE the end — so the top overhangs
                  // and the panel's outer face lines up with the overhang edge.
                  const leftExt = low ? topH : 0;
                  const rightExt = high ? topH : 0;
                  return (
                    <g style={{ pointerEvents: "none" }}>
                      <rect x={svgX - leftExt} y={topY} width={topW + leftExt + rightExt} height={topH}
                        fill="rgba(120,113,108,0.55)" stroke="rgba(68,64,60,0.8)" strokeWidth={0.6} />
                      {/* The drop runs the full way to the floor, past the
                          kickboard, on the outside of the cabinet end. */}
                      {low && (
                        <rect x={svgX - topH} y={topY} width={topH} height={waterfallH}
                          fill="rgba(120,113,108,0.55)" stroke="rgba(68,64,60,0.8)" strokeWidth={0.6} />
                      )}
                      {high && (
                        <rect x={svgX + topW} y={topY} width={topH} height={waterfallH}
                          fill="rgba(120,113,108,0.55)" stroke="rgba(68,64,60,0.8)" strokeWidth={0.6} />
                      )}
                    </g>
                  );
                })()}

                {/* Filler panel strip — sits above the cabinet body, fills space to the ceiling */}
                {fillerMm > 0 && (
                  <>
                    <rect
                      x={svgX} y={svgY - fillerMm * scale}
                      width={svgW} height={fillerMm * scale}
                      fill="rgba(245,158,11,0.45)"
                      stroke="rgba(245,158,11,0.7)"
                      strokeWidth={0.5}
                      style={{ pointerEvents: "none" }}
                    />
                    {tileFillFor(item, "filler") && (
                      <rect x={svgX} y={svgY - fillerMm * scale} width={svgW} height={fillerMm * scale}
                        fill={tileFillFor(item, "filler")} fillOpacity={0.9}
                        style={{ pointerEvents: "none" }} />
                    )}
                  </>
                )}

                {/* End panels — drawn OUTSIDE the carcass at true scaled
                    thickness, because that's where an applied finished end
                    physically sits: a 600 cabinet with an 18mm end is 618
                    overall, and the space beside it is reserved to match.
                    svg-left of the box is always the viewer's left in an
                    elevation (getWallPos has already applied axisFlipped), so
                    unlike the plan view this needs no further mirroring. Back
                    panels aren't shown here — they're on the far side, not
                    visible from the front. */}
                {(item.end_panel_left || item.end_panel_right) && (() => {
                  // panel_to_floor (base/tall): covers the kickboard recess too,
                  // same as the carcass; otherwise stops at carcass height with
                  // the kickboard strip still visible underneath.
                  // Wall cabinets: the side panels run past a finished underside
                  // to cover its exposed edge, so they extend by its thickness.
                  const underThk = bottomPanelThicknessMm(item) * scale;
                  const panelH = (item.panel_to_floor ? svgH + kbMm * scale : svgH) + underThk;
                  const t = Math.max(finishPanelThicknessMm(item) * scale, 1.5);
                  return (
                    <>
                      {item.end_panel_left && (
                        <rect x={svgX - t} y={svgY} width={t} height={panelH}
                          fill="#a855f7" fillOpacity={0.9} style={{ pointerEvents: "none" }} />
                      )}
                      {item.end_panel_right && (
                        <rect x={svgX + svgW} y={svgY} width={t} height={panelH}
                          fill="#a855f7" fillOpacity={0.9} style={{ pointerEvents: "none" }} />
                      )}
                    </>
                  );
                })()}

                {/* Underside panel — wall cabinets only. Hangs BELOW the
                    carcass at its true thickness rather than being painted
                    over the bottom edge: it's applied to the underside, so it
                    adds to the cabinet's overall height instead of eating
                    into it. */}
                {bottomPanelThicknessMm(item) > 0 && (() => {
                  const t = Math.max(bottomPanelThicknessMm(item) * scale, 1.5);
                  return (
                    <rect x={svgX} y={svgY + svgH} width={svgW} height={t}
                      fill="#a855f7" fillOpacity={0.9} style={{ pointerEvents: "none" }} />
                  );
                })()}

                {/* Width dim leader below cabinet (below kickboard strip if present) */}
                {svgW > 18 && (
                  <ElevDimLine
                    x1={svgX} y1={svgY + svgH + kbMm * scale + 10}
                    x2={svgX + svgW} y2={svgY + svgH + kbMm * scale + 10}
                    label={wMm} horizontal
                  />
                )}
              </g>
            );
          })}

          {/* ---- Gap measurements during drag ---- */}
          {drag?.type === "item" && dragDisp && draggingItem && (() => {
            // Gaps are measured between OCCUPIED faces — with an applied end
            // panel the carcass edge and the outer face differ by the board's
            // thickness, and measuring carcass-to-carcass would report a
            // phantom gap across a joint that's actually shut tight.
            const span = occupiedWallSpan(draggingItem);
            const xMm  = span.x_mm;
            const wMm  = span.width_mm;
            const hMm  = draggingItem.height_mm || 720;
            const mountMm = draggingMount;

            const { gapLeftWall, gapRightWall, gapLeftNeighbor, gapRightNeighbor, leftBound, rightBound } =
              computeXGaps(xMm, wMm, xGapObstacles, wallWidthMm);

            const dimYNeighbor = floor - (mountMm + hMm / 2) * scale; // mid-height of cabinet
            const dimYWall     = dimYNeighbor - 14; // offset so it doesn't overlap the neighbor line

            return (
              <g>
                {/* Wall gaps — always shown, distance to the actual room boundary */}
                <GapDim
                  x1={ox} y1={dimYWall}
                  x2={ox + xMm * scale} y2={dimYWall}
                  label={gapLeftWall} horizontal
                  color="rgba(148,163,184,0.85)"
                />
                <GapDim
                  x1={ox + (xMm + wMm) * scale} y1={dimYWall}
                  x2={ox + wallWidthMm * scale} y2={dimYWall}
                  label={gapRightWall} horizontal
                  color="rgba(148,163,184,0.85)"
                />
                {/* Neighbor gaps — only cabinets sharing this one's mount-height range */}
                {gapLeftNeighbor != null && (
                  <GapDim
                    x1={ox + leftBound * scale} y1={dimYNeighbor}
                    x2={ox + xMm * scale} y2={dimYNeighbor}
                    label={gapLeftNeighbor} horizontal
                  />
                )}
                {gapRightNeighbor != null && (
                  <GapDim
                    x1={ox + (xMm + wMm) * scale} y1={dimYNeighbor}
                    x2={ox + rightBound * scale} y2={dimYNeighbor}
                    label={gapRightNeighbor} horizontal
                  />
                )}
                {/* Vertical gaps (up + down) for EVERY draggable item — to the
                    nearest item above/below whose X-range overlaps (via
                    computeYGaps), or the ceiling/floor. Measured to actual
                    surfaces: a benchtop raises the effective top so the gap is
                    to the benchtop, not the carcass. */}
                {(() => {
                  const dragTopExtra = benchtopTopExtraMm(draggingItem);
                  const hMmTop = hMm + dragTopExtra;
                  // Others carry their own benchtop on top for the same reason.
                  const vGapOthers = allDragOthers.map((o) => ({ ...o, height_mm: o.height_mm + benchtopTopExtraMm(o) }));
                  const { gapBot, gapTop, botBound, topBound } =
                    computeYGaps(mountMm, hMmTop, xMm, wMm, vGapOthers, roomHeightMm);
                  const dimX = ox + (xMm + wMm / 2) * scale;
                  const svgYtop = floor - (mountMm + hMmTop) * scale;
                  const svgYbot = floor - mountMm * scale;
                  return (
                    <>
                      {gapBot > 1 && (
                        <GapDim
                          x1={dimX} y1={floor - botBound * scale}
                          x2={dimX} y2={svgYbot}
                          label={gapBot} horizontal={false}
                        />
                      )}
                      {gapTop > 1 && (
                        <GapDim
                          x1={dimX} y1={svgYtop}
                          x2={dimX} y2={floor - topBound * scale}
                          label={gapTop} horizontal={false}
                        />
                      )}
                    </>
                  );
                })()}
              </g>
            );
          })()}

          {/* Snap guide lines — cyan dashes showing the edge being snapped to */}
          {snapGuides?.x != null && (
            <line
              x1={ox + snapGuides.x * scale} y1={oy}
              x2={ox + snapGuides.x * scale} y2={floor}
              stroke="rgba(0,230,230,0.75)" strokeWidth={1} strokeDasharray="4 2"
              style={{ pointerEvents: "none" }}
            />
          )}
          {snapGuides?.y != null && (
            <line
              x1={ox} y1={floor - snapGuides.y * scale}
              x2={ox + drawW} y2={floor - snapGuides.y * scale}
              stroke="rgba(0,230,230,0.75)" strokeWidth={1} strokeDasharray="4 2"
              style={{ pointerEvents: "none" }}
            />
          )}

          {/* Floor line — a solid outline in print, a soft band on screen. */}
          <rect x={ox} y={floor} width={drawW} height={printMode ? 2 : 5}
            fill={printMode ? "#1f2937" : "rgba(255,255,255,0.12)"} />
          <text x={ox + drawW / 2} y={floor + 14}
            textAnchor="middle" fontSize={8} fill={structText}>FLOOR</text>

          {/* Room width dimension (top) */}
          <ElevDimLine x1={ox} y1={MT - 24} x2={ox + drawW} y2={MT - 24} label={wallWidthMm} horizontal />

          {/* Room height dimension (left) */}
          <ElevDimLine x1={ML - 24} y1={oy} x2={ML - 24} y2={floor} label={roomHeightMm} horizontal={false} />
        </svg>
        </PinchZoom>
      </div>
    </div>
  );
}
