"use client";

import { useState, useRef } from "react";
import styles from "../design.module.css";
import { computeDrawerFrontHeights } from "../../../../lib/pcd-drawer-utils";

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

// Friendly fallback label when an item has no custom label yet — avoids
// rendering the raw snake_case item_type in the elevation view.
const TYPE_LABELS = {
  base_cabinet:  "Base Cabinet",
  wall_cabinet:  "Wall Cabinet",
  tall_cabinet:  "Tall Cabinet",
  corner_base_cabinet: "Corner Base Cabinet",
  door:          "Door",
  drawer_front:  "Drawer Front",
  panel:         "Panel",
  obstruction:   "Obstruction",
};

function itemDisplayLabel(item) {
  return item.label || TYPE_LABELS[item.item_type] || item.item_type;
}

export const CABINET_MOUNT_MM = {
  base_cabinet:  0,
  wall_cabinet:  1400,
  tall_cabinet:  0,
  corner_base_cabinet: 0,
  door:          0,
  drawer_front:  0,
  panel:         0,
  obstruction:   0,
};

const BENCH_HEIGHT_MM = 900;
const EDGE_SNAP_MM    = 20;
const WALL_LABELS = {
  top:    "Top Wall",
  bottom: "Bottom Wall",
  left:   "Left Wall",
  right:  "Right Wall",
};
const DRAGGABLE_TYPES = new Set(["base_cabinet", "wall_cabinet", "tall_cabinet", "corner_base_cabinet", "panel", "obstruction"]);

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
// is type-restricted, since only wall cabinets have an adjustable height).
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

  if (itemType === "wall_cabinet" || itemType === "obstruction") {
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
  const gapEnabled = Boolean(cfg.row_gap_enabled);
  const gapPx = gapEnabled ? (Number(cfg.row_gap_mm) || 0) * scale : 0;
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
  const gapEnabled = Boolean(cfg.gap_enabled);
  const gapMm = gapEnabled ? (Number(cfg.gap_mm) || 0) : 0;
  const frontHeightsMm = computeDrawerFrontHeights(rawHeights, gapEnabled, gapMm);

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
      {gapEnabled && gapMm > 0 && bands.map(({ gapTopMm, frontTopMm }, i) => (
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

export default function FrontElevationView({ wall: initialWall, room, items, onClose, onItemChange, onItemSelect }) {
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
      // actual room-space coordinate projected onto that wall's axis — a
      // 90°/270° rotation swaps which raw dimension runs along that axis,
      // same as islandEffectiveDims() in DesignCanvas.js.
      const rotated90 = (itemData.rotation || 0) % 180 === 90;
      len = rotated90 ? (itemData.depth_mm || 600) : (itemData.width_mm || 600);
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

  function getDisp(item) {
    const lp = localPos[item.id] || {};
    const baseX = getWallPos(item);
    return {
      x_mm:            lp.x_mm            ?? baseX,
      mount_height_mm: lp.mount_height_mm ?? item.mount_height_mm ?? (CABINET_MOUNT_MM[item.item_type] ?? 0),
    };
  }

  function getShelfPositions(item) {
    if (localShelves[item.id]?.length) return localShelves[item.id];
    if (item.shelf_heights_mm?.length) return item.shelf_heights_mm;
    const qty = item.shelf_qty || 0;
    if (!qty) return [];
    const T  = item.carcass_thickness_mm || 16;
    const hMm = item.height_mm || 720;
    const sec = (hMm - 2 * T) / (qty + 1);
    return Array.from({ length: qty }, (_, i) => T + sec * (i + 1));
  }

  // ---- Pointer handlers ----------------------------------------------------
  function handleItemPointerDown(e, item) {
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
    });
  }

  function handleShelfPointerDown(e, item, idx, heightMm) {
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

      if (drag.item_type === "wall_cabinet" || drag.item_type === "obstruction") {
        newMount = Math.max(0, Math.min(roomHeightMm - drag.height_mm, drag.startMount - dyMm));
      }

      // All same-wall items for snap candidates.
      // Include kickboard visual offset in mount_height_mm so snap aligns to visible edges,
      // not the raw stored value (which ignores the kickboard raising the cabinet off the floor).
      const allWallOthers = wallItems
        .filter((i) => i.id !== drag.itemId)
        .map((i) => {
          const disp  = getDisp(i);
          const kbOff = (i.has_kickboard && i.item_type !== "wall_cabinet")
            ? (i.kickboard_height_mm || 150)
            : 0;
          return {
            ...disp,
            mount_height_mm: disp.mount_height_mm + kbOff,
            width_mm:        i.width_mm  || 600,
            height_mm:       i.height_mm || 720,
          };
        });

      // Apply edge snap before collision resolution
      const snapped = applyEdgeSnap(newX, newMount, drag.width_mm, drag.height_mm, allWallOthers, drag.item_type, wallWidthMm, roomHeightMm);
      newX     = snapped.x_mm;
      newMount = snapped.mount_height_mm;
      setSnapGuides(snapped.snapX != null || snapped.snapY != null
        ? { x: snapped.snapX, y: snapped.snapY }
        : null);

      // Collision resolution — recompute height-filtered obstacles after snap (mount may have changed)
      const vLo = newMount, vHi = newMount + drag.height_mm;
      const obstacles = allWallOthers
        .filter((i) => i.mount_height_mm < vHi && i.mount_height_mm + i.height_mm > vLo);

      newX = resolveCollision1D(newX, drag.width_mm, obstacles, wallWidthMm);

      const pos = { x_mm: newX };
      if (drag.item_type === "wall_cabinet" || drag.item_type === "obstruction") pos.mount_height_mm = newMount;
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
  const dragDisp      = draggingItem ? getDisp(draggingItem) : null;
  const draggingMount = dragDisp?.mount_height_mm ?? 0;
  const vLoDrag       = draggingMount;
  const vHiDrag       = draggingMount + (draggingItem?.height_mm || 720);
  // All other cabinets on this wall, unfiltered — used for the vertical
  // (mount-height) gap, which is filtered by X-range overlap instead (see
  // computeYGaps), not by mount-height overlap.
  const allDragOthers = drag?.type === "item"
    ? wallItems
        .filter((i) => i.id !== drag.itemId)
        .map((i) => ({ ...getDisp(i), width_mm: i.width_mm || 600, height_mm: i.height_mm || 720 }))
    : [];
  // Same list, but restricted to cabinets that share the dragged item's
  // mount-height range — the only ones it could actually interact/collide
  // with left-right, and the only ones relevant for a left/right gap line
  // (e.g. a base cabinet doesn't get an X-gap line to a wall cabinet above it).
  const xGapObstacles = allDragOthers
    .filter((i) => i.mount_height_mm < vHiDrag && i.mount_height_mm + i.height_mm > vLoDrag);

  const hasWallCabs = wallItems.some((i) => i.item_type === "wall_cabinet");

  // ---- Render --------------------------------------------------------------
  return (
    <div className={styles.elevationInline}>

      {/* Toolbar */}
      <div className={styles.elevationToolbar}>
        <button type="button" className={styles.elevationBackBtn} onClick={onClose}>
          ← Floor Plan
        </button>
        <div className={styles.elevationToolbarInfo}>
          <span className={styles.elevationToolbarTitle}>Elevation — {WALL_LABELS[wall] || wall}</span>
          <span className={styles.elevationToolbarSub}>
            {room.name} · {wallWidthMm}mm wide · {roomHeightMm}mm high
          </span>
        </div>

        {/* Wall switcher */}
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
          </defs>

          {/* Room background */}
          <rect x={ox} y={oy} width={drawW} height={drawH}
            fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.1)" strokeWidth={1} />

          {/* Grid lines every 600mm */}
          {Array.from({ length: Math.ceil(wallWidthMm / 600) }).map((_, i) => (
            <line key={`gx${i}`}
              x1={ox + (i + 1) * 600 * scale} y1={oy}
              x2={ox + (i + 1) * 600 * scale} y2={floor}
              stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
          ))}
          {Array.from({ length: Math.ceil(roomHeightMm / 600) }).map((_, i) => (
            <line key={`gy${i}`}
              x1={ox} y1={oy + (i + 1) * 600 * scale}
              x2={ox + drawW} y2={oy + (i + 1) * 600 * scale}
              stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
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
          <line x1={ox} y1={oy} x2={ox + drawW} y2={oy} stroke="rgba(255,255,255,0.25)" strokeWidth={1.5} />
          <text x={ox - 6} y={oy} fontSize={8} textAnchor="end" dominantBaseline="middle"
            fill="rgba(255,255,255,0.3)">
            CEILING
          </text>

          {/* Cabinets */}
          {wallItems.map((item) => {
            const dis    = getDisp(item);
            const xMm    = dis.x_mm;
            const mountH = dis.mount_height_mm;
            const isCorner = item.item_type === "corner_base_cabinet";
            const isSecondaryView = isSecondaryWallView(item);
            const isIslandView = isIslandVirtualView(item);
            const islandRotated90 = isIslandView && ((item.rotation || 0) % 180 === 90);
            // For a corner cabinet, width_mm is the primary leg's footprint
            // along its own wall — secondary_width_mm is the equivalent for
            // the secondary leg, which is what's relevant when this wall IS
            // that secondary wall. For a freestanding cabinet rotated
            // 90°/270°, depth_mm runs along the wall axis instead of width_mm.
            const wMm    = isSecondaryView
              ? (item.secondary_width_mm || 900)
              : islandRotated90
                ? (item.depth_mm || 600)
                : (item.width_mm || 600);
            const hMm    = item.height_mm || 720;
            // Kickboard lifts the cabinet body off the floor by kickboard height
            const kbMm   = (item.has_kickboard && item.item_type !== "wall_cabinet")
              ? (item.kickboard_height_mm || 150)
              : 0;
            const fill   = ITEM_COLORS[item.item_type] || "#888";
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
                  fill={fill} fillOpacity={isDragging ? 0.14 : 0.1}
                  stroke={fill} strokeWidth={isSelected ? 2 : 1.5}
                  strokeOpacity={isSelected ? 1 : 0.7}
                  rx={2} />
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
                  const baseX = hingeAtStart ? doorZoneX : doorZoneX + doorZoneW;
                  const tipX  = hingeAtStart ? doorZoneX + doorZoneW : doorZoneX;
                  const midY  = svgY + svgH / 2;
                  const markSize = 4;

                  return (
                    <g style={{ pointerEvents: "none" }}>
                      <rect x={doorZoneX} y={svgY} width={doorZoneW} height={svgH}
                        fill="none" stroke={fill} strokeWidth={0.6} strokeOpacity={0.35} />
                      <line x1={baseX} y1={svgY}        x2={tipX} y2={midY}
                        stroke={fill} strokeWidth={0.8} strokeDasharray="3 2" strokeOpacity={0.55} />
                      <line x1={baseX} y1={svgY + svgH} x2={tipX} y2={midY}
                        stroke={fill} strokeWidth={0.8} strokeDasharray="3 2" strokeOpacity={0.55} />
                      {hingePositions.map((posMm, hIdx) => {
                        const rawY = (svgY + svgH) - Number(posMm || 0) * scale;
                        const hy = Math.max(svgY, Math.min(svgY + svgH, rawY));
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
                  <rect
                    x={svgX} y={svgY + svgH}
                    width={svgW} height={kbMm * scale}
                    fill="rgba(245,158,11,0.45)"
                    stroke="rgba(245,158,11,0.7)"
                    strokeWidth={0.5}
                    style={{ pointerEvents: "none" }}
                  />
                )}

                {/* End panel indicators — svg-left of the box is always the
                    viewer's left in an elevation (you're looking straight at
                    the cabinet's front), so unlike the plan view this needs
                    no axisFlipped mirroring. Back panels aren't shown here —
                    they're on the far side, not visible from the front. */}
                {(item.end_panel_left || item.end_panel_right) && (() => {
                  // panel_to_floor: covers the kickboard recess too, same
                  // as the carcass; otherwise stops at carcass height with
                  // the kickboard strip still visible underneath.
                  const panelH = item.panel_to_floor ? svgH + kbMm * scale : svgH;
                  const t = Math.min(4, svgW);
                  return (
                    <>
                      {item.end_panel_left && (
                        <rect x={svgX} y={svgY} width={t} height={panelH}
                          fill="#a855f7" fillOpacity={0.9} style={{ pointerEvents: "none" }} />
                      )}
                      {item.end_panel_right && (
                        <rect x={svgX + svgW - t} y={svgY} width={t} height={panelH}
                          fill="#a855f7" fillOpacity={0.9} style={{ pointerEvents: "none" }} />
                      )}
                    </>
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
            const xMm  = dragDisp.x_mm;
            const wMm  = draggingItem.width_mm  || 600;
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
                {/* Vertical gaps for wall cabinets — filtered by X-range overlap
                    (via computeYGaps), not mount-height, so this correctly
                    reaches a base/tall cabinet's top surface below. */}
                {draggingItem.item_type === "wall_cabinet" && (() => {
                  const { gapBot, gapTop, botBound, topBound } =
                    computeYGaps(mountMm, hMm, xMm, wMm, allDragOthers, roomHeightMm);
                  const dimX = ox + (xMm + wMm / 2) * scale;
                  const svgYtop = floor - (mountMm + hMm) * scale;
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

          {/* Floor */}
          <rect x={ox} y={floor} width={drawW} height={5} fill="rgba(255,255,255,0.12)" />
          <text x={ox + drawW / 2} y={floor + 14}
            textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.25)">FLOOR</text>

          {/* Room width dimension (top) */}
          <ElevDimLine x1={ox} y1={MT - 24} x2={ox + drawW} y2={MT - 24} label={wallWidthMm} horizontal />

          {/* Room height dimension (left) */}
          <ElevDimLine x1={ML - 24} y1={oy} x2={ML - 24} y2={floor} label={roomHeightMm} horizontal={false} />
        </svg>
      </div>
    </div>
  );
}
